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

/**
 * How the machine colours what it plays. A cassette deck: audible wow and
 * flutter, the top end gone above 7 kHz, hiss. A studio reel-to-reel at
 * 7½ ips: steadier, the treble kept but softened, the low end a little
 * fuller where the playback head bumps it, the tape saturating gently, a
 * quieter hiss, and the sound coming out into the room rather than a headset.
 */
type Voice = {
  wow: [number, number][];
  lp: number;
  bump: number;
  soften: number;
  drive: number;
  even: number;
  hiss: number;
  hum: number;
  room: number;
};
const VOICES: Record<'cassette' | 'reel', Voice> = {
  cassette: { wow: [[0.55, 0.0009], [6.8, 0.00012]], lp: 7200, bump: 0, soften: 0, drive: 1.6, even: 0, hiss: 0.05, hum: 0.012, room: 0 },
  reel: { wow: [[0.4, 0.00022], [9.5, 0.00003]], lp: 14500, bump: 2.5, soften: -2.5, drive: 1.35, even: 0.12, hiss: 0.018, hum: 0.004, room: 0.14 },
};

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
  /** Where a wind is going: 0 for a rewind, further on for a fast-forward. */
  private windTo = 0;
  private tone: Voice;

  constructor(kind: 'cassette' | 'reel' = 'cassette') {
    this.tone = VOICES[kind];
  }

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
    const v = this.tone;
    for (const [f, depth] of v.wow) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(delay.delayTime);
      lfo.start();
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = v.lp;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 55;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      // tape compresses the peaks; a touch of asymmetry adds the even harmonics heard as warmth
      curve[i] = Math.tanh(x * v.drive + v.even * x * x) / Math.tanh(v.drive + v.even);
    }
    shaper.curve = curve;
    const dc = ctx.createBiquadFilter();
    dc.type = 'highpass';
    dc.frequency.value = 18;
    const level = ctx.createGain();
    level.gain.value = 1.1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    // the playback head's low-frequency bump, and the treble eased off a little
    const bump = ctx.createBiquadFilter();
    bump.type = 'peaking';
    bump.frequency.value = 85;
    bump.Q.value = 0.9;
    bump.gain.value = v.bump;
    const soften = ctx.createBiquadFilter();
    soften.type = 'highshelf';
    soften.frequency.value = 7000;
    soften.gain.value = v.soften;
    this.input.connect(delay).connect(lp).connect(hp).connect(bump).connect(soften).connect(shaper).connect(dc).connect(level).connect(this.analyser).connect(bus);
    // the room the speaker plays into: a short, dark reflection under the dry sound
    if (v.room > 0) {
      const len = Math.floor(ctx.sampleRate * 0.9);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lo = 0;
        for (let i = 0; i < len; i++) {
          lo += (Math.random() * 2 - 1 - lo) * 0.18;
          d[i] = lo * Math.exp((-i / ctx.sampleRate) * 6.5);
        }
      }
      const verb = ctx.createConvolver();
      verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = v.room;
      this.analyser.connect(verb).connect(wet).connect(bus);
    }

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
    hissG.gain.value = v.hiss;
    hiss.connect(hissHp).connect(hissG).connect(this.bed);
    hiss.start();
    const hum = ctx.createOscillator();
    hum.frequency.value = 50;
    const humG = ctx.createGain();
    humG.gain.value = v.hum;
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
    if (this.mode === 'rew') {
      const run = (this.ctx.currentTime - this.runAt) * this.rewSpeed();
      return this.windTo >= this.rewFrom ? Math.min(this.windTo, this.rewFrom + run) : Math.max(this.windTo, this.rewFrom - run);
    }
    return this.pos;
  }

  /** How long the tape in the deck plays, in seconds (a guess until a recording has loaded). */
  get length() {
    const t = this.tape;
    if (!t) return 0;
    if (t.src) return this.media && isFinite(this.media.duration) && this.media.duration > 0 ? this.media.duration : 240;
    if (t.kind === 'music' && t.song && SONGS[t.song]) return songLength(SONGS[t.song]());
    return 90;
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
    this.wind(0);
  }

  /** Which way the tape is spooling: -1 back, 1 on, 0 not winding. */
  get winding() {
    return this.mode !== 'rew' ? 0 : this.windTo >= this.rewFrom ? 1 : -1;
  }

  /** The stop key: whatever is moving stops where it is. */
  stop() {
    if (this.mode === 'play') return this.pause();
    if (this.mode !== 'rew') return;
    this.pos = this.position;
    this.halt();
    this.thunk();
    this.set('stop');
  }

  /** Spool the tape to `to` seconds, fast, with the motors whirring: back to the start, or on ahead. */
  wind(to: number) {
    if (!this.tape || !this.chain() || !this.ctx) return;
    const from = this.mode === 'end' ? this.pos : this.position;
    to = Math.max(0, Math.min(to, this.length));
    this.halt();
    if (Math.abs(from - to) < 0.5) {
      this.pos = to;
      this.thunk(0.6);
      return this.set('stop');
    }
    this.thunk();
    this.rewFrom = from;
    this.windTo = to;
    this.runAt = this.ctx.currentTime;
    const dur = Math.abs(from - to) / this.rewSpeed();
    this.whir(dur);
    this.set('rew');
    const run = ++this.run;
    window.setTimeout(() => {
      if (run !== this.run) return;
      this.pos = to;
      if (!to) {
        this.part = 0;
        this.nextStep = 0;
      }
      this.thunk(0.7);
      this.set('stop');
    }, dur * 1000);
  }

  /** Rewinding takes a second or two, however long the tape. */
  private rewSpeed() {
    return Math.max(Math.abs(this.rewFrom - this.windTo) / 2.2, 30);
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
