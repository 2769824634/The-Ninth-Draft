/**
 * The office cassette deck. Everything it plays goes through one tape
 * chain (a little wow and flutter, the top end rolled off, soft saturation,
 * hiss and mains hum underneath), then to the site's sound switch:
 *
 *   music      a song from music.ts, scheduled step by step
 *   reading    a record's summary or Heuss's dictation, spoken by the
 *              browser's own voice; a redaction is a 1 kHz tone
 *   recording  an audio file the author put in /public
 *
 * The browser's speech can't be routed through WebAudio, so on a reading
 * the hiss and hum play under the voice and the needles are driven by hand.
 */
import { audioOut } from '../audio';
import { isZh } from '../i18n';
import { Kit, SONGS, songLength, type Song } from './music';
import type { TapeData } from '../../lib/tapes';

export type Mode = 'empty' | 'stop' | 'play' | 'rew' | 'end';

type Part = { say: string } | { bleep: true } | { click: true };

const MALE = /male|daniel|george|arthur|oliver|alex|fred|thomas|david|mark|james|ryan|guy|yunxi|yunyang|kangkang|男/i;
const FEMALE = /female|samantha|victoria|karen|serena|moira|tessa|fiona|kate|susan|zira|hazel|libby|sonia|aria|jenny|natasha|clara|emma|ting|huihui|xiaoxiao|yaoyao|女/i;

export class Deck {
  tape: TapeData | null = null;
  mode: Mode = 'empty';
  onChange: () => void = () => {};

  private ctx: AudioContext | null = null;
  private input!: GainNode;
  private bed!: GainNode;
  private analyser!: AnalyserNode;
  private wave = new Float32Array(1024);
  private noiseBuf!: AudioBuffer;
  private bus!: GainNode;

  /** Seconds into the tape when the current run started, and the clock then. */
  private pos = 0;
  private runAt = 0;
  private session: GainNode | null = null;
  private timer = 0;
  private song: Song | null = null;
  private nextStep = 0;
  private nextTime = 0;
  private parts: Part[] = [];
  private part = 0;
  private run = 0;
  private speaking = false;
  private media: HTMLAudioElement | null = null;
  private mediaNode: MediaElementAudioSourceNode | null = null;
  private rewFrom = 0;

  private chain() {
    if (this.ctx) return true;
    const out = audioOut();
    if (!out) return false;
    const { ctx, bus, noise } = out;
    this.ctx = ctx;
    this.noiseBuf = noise;
    this.bus = bus;
    // wow (slow) and flutter (fast) wobble a short delay line
    this.input = ctx.createGain();
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    for (const [f, depth] of [[0.55, 0.0009], [6.8, 0.00012]]) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(delay.delayTime);
      lfo.start();
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7200;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
    }
    shaper.curve = curve;
    const level = ctx.createGain();
    level.gain.value = 1.1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.input.connect(delay).connect(lp).connect(hp).connect(shaper).connect(level).connect(this.analyser).connect(bus);

    // hiss and hum, only while the tape is moving
    this.bed = ctx.createGain();
    this.bed.gain.value = 0;
    this.bed.connect(bus);
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hissHp = ctx.createBiquadFilter();
    hissHp.type = 'highpass';
    hissHp.frequency.value = 3200;
    const hissG = ctx.createGain();
    hissG.gain.value = 0.05;
    hiss.connect(hissHp).connect(hissG).connect(this.bed);
    hiss.start();
    const hum = ctx.createOscillator();
    hum.frequency.value = 50;
    const humG = ctx.createGain();
    humG.gain.value = 0.012;
    hum.connect(humG).connect(this.bed);
    hum.start();
    return true;
  }

  /* ---------------- mechanical noises ---------------- */
  private thunk(heavy = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * heavy, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random());
    s.stop(t + 0.1);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * heavy, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(og).connect(this.bus);
    o.start(t);
    o.stop(t + 0.1);
  }

  private whir(dur: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.15);
    g.gain.setValueAtTime(0.12, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t);
    s.stop(t + dur + 0.05);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(260, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.012, t + 0.2);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private bleep(dur: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    g.gain.setValueAtTime(0.08, t + dur - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.session ?? this.input);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* ---------------- state ---------------- */
  get position() {
    if (!this.ctx) return this.pos;
    if (this.mode === 'play') return this.pos + (this.ctx.currentTime - this.runAt);
    if (this.mode === 'rew') return Math.max(0, this.rewFrom - (this.ctx.currentTime - this.runAt) * this.rewSpeed());
    return this.pos;
  }

  /** Tape counter: about one count a second, as on the real one. */
  get counter() {
    return Math.floor(this.position * 1.08) % 1000;
  }

  /** How fast the hubs turn (rad/s). */
  get spin() {
    return this.mode === 'play' ? -2.6 : this.mode === 'rew' ? 26 : 0;
  }

  /** Output level 0..1 for the needles. */
  get level() {
    if (!this.ctx || this.mode !== 'play') return this.mode === 'rew' ? 0.08 : 0;
    if (this.speaking) return 0.3 + Math.random() * 0.35;
    this.analyser.getFloatTimeDomainData(this.wave);
    let sum = 0;
    for (let i = 0; i < this.wave.length; i++) sum += this.wave[i] * this.wave[i];
    return Math.min(1, Math.sqrt(sum / this.wave.length) * 5 + 0.03);
  }

  private set(mode: Mode) {
    this.mode = mode;
    this.onChange();
  }

  /* ---------------- transport ---------------- */
  /** Put a tape in. Takes the old one out first. */
  load(tape: TapeData) {
    if (!this.chain()) return;
    this.halt();
    this.tape = tape;
    this.pos = 0;
    this.part = 0;
    this.song = null;
    this.media?.pause();
    this.media = null;
    this.thunk(0.8);
    this.set('stop');
  }

  eject() {
    if (!this.tape) return;
    this.chain();
    this.halt();
    this.thunk(1.2);
    this.tape = null;
    this.pos = 0;
    this.media?.pause();
    this.media = null;
    this.set('empty');
  }

  toggle() {
    if (this.mode === 'play') this.pause();
    else this.play();
  }

  play() {
    if (!this.tape || !this.chain() || !this.ctx) return;
    if (this.mode === 'play') return;
    if (this.mode === 'rew') this.halt();
    if (this.mode === 'end') this.pos = 0;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.thunk();
    const run = ++this.run;
    this.session = this.ctx.createGain();
    this.session.connect(this.input);
    this.bed.gain.setTargetAtTime(1, this.ctx.currentTime, 0.05);
    this.runAt = this.ctx.currentTime;
    this.set('play');
    const t = this.tape;
    if (t.src) return this.playMedia(t.src, run);
    if (t.kind === 'music' && t.song && SONGS[t.song]) return this.playSong(SONGS[t.song]());
    this.playReading(t, run);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.pos = this.position;
    this.halt();
    this.thunk();
    this.set('stop');
  }

  rewind() {
    if (!this.tape || !this.chain() || !this.ctx) return;
    const from = this.mode === 'end' ? this.pos : this.position;
    this.halt();
    if (from < 0.5) {
      this.pos = 0;
      this.thunk(0.6);
      return this.set('stop');
    }
    this.thunk();
    this.rewFrom = from;
    this.runAt = this.ctx.currentTime;
    const dur = from / this.rewSpeed();
    this.whir(dur);
    this.set('rew');
    const run = ++this.run;
    window.setTimeout(() => {
      if (run !== this.run) return;
      this.pos = 0;
      this.part = 0;
      this.nextStep = 0;
      this.thunk(0.7);
      this.set('stop');
    }, dur * 1000);
  }

  /** Rewinding takes a second or two, however long the tape. */
  private rewSpeed() {
    return Math.max(this.rewFrom / 2.2, 30);
  }

  /** Stop whatever is moving, without the clunk. */
  private halt() {
    this.run++;
    window.clearInterval(this.timer);
    this.timer = 0;
    if (this.speaking || this.parts.length) window.speechSynthesis?.cancel();
    this.speaking = false;
    this.media?.pause();
    if (this.ctx) {
      if (this.session) {
        const s = this.session;
        s.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
        window.setTimeout(() => s.disconnect(), 400);
      }
      this.bed.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
    this.session = null;
  }

  /** The tape ran out: a little more hiss, then the auto-stop. */
  private runOut(run: number) {
    window.setTimeout(() => {
      if (run !== this.run) return;
      this.pos = this.position;
      this.halt();
      this.thunk(0.9);
      this.set('end');
    }, 1600);
  }

  /* ---------------- music ---------------- */
  private playSong(song: Song) {
    const ctx = this.ctx!;
    const kit = new Kit(ctx, this.session!, this.noiseBuf);
    this.song = song;
    const total = song.bar * song.bars;
    this.nextStep = Math.min(total, Math.round(this.pos / song.step));
    this.pos = this.nextStep * song.step;
    this.nextTime = ctx.currentTime + 0.12;
    this.runAt = this.nextTime;
    const run = this.run;
    const pump = () => {
      if (run !== this.run) return;
      while (this.nextTime < ctx.currentTime + 0.2 && this.nextStep < total) {
        song.play(this.nextStep, this.nextTime, kit);
        this.nextStep++;
        this.nextTime += song.step;
      }
      if (this.nextStep >= total && this.timer) {
        window.clearInterval(this.timer);
        this.timer = 0;
        window.setTimeout(() => this.runOut(run), Math.max(0, (this.nextTime - ctx.currentTime) * 1000) + 2500);
      }
    };
    this.timer = window.setInterval(pump, 25);
    pump();
  }

  /* ---------------- a recording ---------------- */
  private playMedia(src: string, run: number) {
    const ctx = this.ctx!;
    if (!this.media || this.media.dataset.src !== src) {
      this.media = new Audio(src);
      this.media.dataset.src = src;
      this.media.crossOrigin = 'anonymous';
      this.mediaNode = ctx.createMediaElementSource(this.media);
    }
    const m = this.media;
    this.mediaNode!.disconnect();
    this.mediaNode!.connect(this.session!);
    m.currentTime = this.pos;
    m.onended = () => run === this.run && this.runOut(run);
    m.onerror = () => run === this.run && this.runOut(run);
    void m.play().catch(() => run === this.run && this.runOut(run));
  }

  /* ---------------- a reading ---------------- */
  private partsOf(t: TapeData): Part[] {
    const zh = isZh();
    const lines = t.lines ? (zh ? t.lines.zh : t.lines.en) : [];
    const parts: Part[] = [];
    for (const line of lines) {
      line.split('█').forEach((bit, i) => {
        if (i) parts.push({ bleep: true });
        if (bit.trim()) parts.push({ say: bit.trim() });
      });
      // the dictaphone's pause key between sentences
      if (t.kind === 'dictation') parts.push({ click: true });
    }
    return parts;
  }

  private voice(zh: boolean) {
    const all = window.speechSynthesis.getVoices();
    const pool = all.filter((v) => (zh ? /^(zh|cmn)/i.test(v.lang) : /^en/i.test(v.lang)));
    const local = zh ? pool.filter((v) => /CN|Hans/i.test(v.lang)) : pool.filter((v) => /GB|UK/i.test(v.lang + v.name));
    return (
      local.find((v) => MALE.test(v.name)) ??
      pool.find((v) => MALE.test(v.name)) ??
      local.find((v) => !FEMALE.test(v.name)) ??
      local[0] ??
      pool[0]
    );
  }

  private playReading(t: TapeData, run: number) {
    const synth = window.speechSynthesis;
    this.parts = this.partsOf(t);
    // from the top, or from the sentence that was cut off
    this.part = this.pos === 0 ? 0 : Math.min(this.parts.length, Math.max(0, this.part - 1));
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      // no voice on this machine: the tape just hisses
      return window.setTimeout(() => this.runOut(run), 6000);
    }
    const zh = isZh();
    const v = this.voice(zh);
    const next = () => {
      if (run !== this.run) return;
      if (this.part >= this.parts.length) {
        this.speaking = false;
        return this.runOut(run);
      }
      const p = this.parts[this.part++];
      if ('bleep' in p) {
        this.speaking = false;
        this.bleep(0.7);
        return window.setTimeout(next, 900);
      }
      if ('click' in p) {
        this.speaking = false;
        window.setTimeout(() => run === this.run && this.thunk(0.35), 500);
        return window.setTimeout(next, 1400);
      }
      const u = new SpeechSynthesisUtterance(p.say);
      if (v) u.voice = v;
      u.lang = zh ? 'zh-CN' : v?.lang ?? 'en-GB';
      u.rate = zh ? 0.92 : t.kind === 'dictation' ? 0.95 : 0.88;
      u.pitch = t.kind === 'dictation' ? 0.8 : 0.9;
      u.volume = 0.7;
      u.onend = () => {
        if (run !== this.run) return;
        this.speaking = false;
        window.setTimeout(next, 380);
      };
      u.onerror = u.onend;
      this.speaking = true;
      synth.speak(u);
    };
    // a breath of leader tape before the voice
    window.setTimeout(next, 900);
  }
}
