/**
 * Synthesised sound — no audio files.
 * Ambient: filtered room tone with a slow-breathing low drone (deeper at night).
 * SFX: paper flick, drawer slide, folder open, stamp, typewriter tick, relay click,
 * camera shutter, push pin, plucked string.
 */
import { prefs } from './prefs';

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let ambBus: GainNode;
let droneFilter: BiquadFilterNode;
let droneGain: GainNode;
let noiseBuf: AudioBuffer;
let ambientOn = false;

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  sfxBus.connect(master);
  ambBus = ctx.createGain();
  ambBus.gain.value = 0;
  ambBus.connect(master);

  // 2 s of pink-ish noise shared by everything
  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
  }
  return ctx;
}

function startAmbient() {
  if (!ctx || ambientOn) return;
  ambientOn = true;
  // Room tone
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520;
  const g = ctx.createGain();
  g.gain.value = 0.22;
  src.connect(lp).connect(g).connect(ambBus);
  src.start();

  // Drone: two detuned sines through a breathing filter
  droneFilter = ctx.createBiquadFilter();
  droneFilter.type = 'lowpass';
  droneFilter.frequency.value = 240;
  droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  droneFilter.connect(droneGain).connect(ambBus);
  for (const f of [55, 82.6, 110.4]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(droneFilter);
    o.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.045;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 120;
  lfo.connect(lfoGain).connect(droneFilter.frequency);
  lfo.start();

  ambBus.gain.setTargetAtTime(0.5, ctx.currentTime, 2.5);
}

interface NoiseOpts { type?: BiquadFilterType; f0?: number; f1?: number; q?: number; vol?: number; delay?: number; attack?: number }

function noise(dur: number, o: NoiseOpts = {}) {
  const { type = 'bandpass', f0 = 2000, f1 = o.f0 ?? 2000, q = 0.8, vol = 0.4, delay = 0, attack = 0.004 } = o;
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, { type = 'sine' as OscillatorType, vol = 0.2, to = freq, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const live = () => !!ctx && prefs.get('sound');

/* ---------- Sputnik: faint alternating beeps while the Programs drawer is open ---------- */
let sputnikTimer = 0;
let sputnikOn = false;
function sputnikTick(k: number) {
  if (!sputnikOn) return;
  if (live() && !document.hidden) {
    tone(k % 2 ? 840 : 1000, 0.3, { type: 'sine', vol: 0.035 });
  }
  sputnikTimer = window.setTimeout(() => sputnikTick(k + 1), 600);
}

/* ---------- Numbers station: chime, then a voice reading five-figure groups ---------- */
let stationTimer = 0;
const POACHER = [659, 659, 587, 523, 587, 659, 784, 659]; // a folk tune, played on a tired music box
function numbersStation() {
  if (!live() || document.hidden || !ctx) return scheduleStation();
  const t0 = 0.2;
  noise(1.2, { f0: 600, f1: 1800, q: 0.5, vol: 0.12, attack: 0.4, delay: 0 });
  POACHER.forEach((f, i) => tone(f, 0.32, { type: 'triangle', vol: 0.05, delay: t0 + 0.9 + i * 0.34 }));
  const synth = window.speechSynthesis;
  if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];
    const group = Array.from({ length: 5 }, () => words[Math.floor(Math.random() * 10)]).join('. ');
    window.setTimeout(() => {
      if (!live()) return;
      const u = new SpeechSynthesisUtterance(`${group}. ${group}.`);
      const v = synth.getVoices().find((x) => /en[-_]GB/i.test(x.lang)) ?? synth.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.rate = 0.72;
      u.pitch = 0.55;
      u.volume = 0.28;
      synth.speak(u);
    }, (t0 + 0.9 + POACHER.length * 0.34 + 0.6) * 1000);
  }
  scheduleStation();
}
function scheduleStation() {
  window.clearTimeout(stationTimer);
  stationTimer = window.setTimeout(numbersStation, 80000 + Math.random() * 70000);
}

export const audio = {
  /** Must be called from a user gesture. */
  unlock() {
    if (!ensure() || !ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.apply();
  },
  apply() {
    if (!ctx) return;
    const on = prefs.get('sound');
    if (on) {
      startAmbient();
      scheduleStation();
    } else {
      window.clearTimeout(stationTimer);
      window.speechSynthesis?.cancel();
    }
    master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, on ? 0.6 : 0.15);
  },
  theme(night: boolean) {
    if (!ctx || !droneGain) return;
    droneGain.gain.setTargetAtTime(night ? 0.11 : 0.05, ctx.currentTime, 1.2);
  },
  flick() {
    if (!live()) return;
    noise(0.07, { f0: 3800, f1: 1800, q: 0.9, vol: 0.32 });
  },
  sputnik(on: boolean) {
    if (on === sputnikOn) return;
    sputnikOn = on;
    window.clearTimeout(sputnikTimer);
    if (on) sputnikTimer = window.setTimeout(() => sputnikTick(0), 900);
  },
  /** Radio dial between stations: static sweep plus a heterodyne whistle. */
  tune() {
    if (!live()) return;
    noise(0.55, { f0: 500, f1: 2600, q: 0.9, vol: 0.18, attack: 0.05 });
    tone(1800, 0.45, { type: 'sine', vol: 0.025, to: 600 });
  },
  drawer() {
    if (!live()) return;
    noise(0.42, { type: 'lowpass', f0: 380, f1: 1400, q: 0.7, vol: 0.5, attack: 0.08 });
    tone(140, 0.08, { type: 'triangle', vol: 0.18, delay: 0.38, to: 90 });
    noise(0.03, { f0: 5200, q: 3, vol: 0.25, delay: 0.38 });
  },
  open() {
    if (!live()) return;
    noise(0.5, { f0: 900, f1: 3400, q: 0.6, vol: 0.32, attack: 0.12 });
    noise(0.18, { f0: 2600, f1: 1200, q: 0.8, vol: 0.22, delay: 0.55 });
  },
  close() {
    if (!live()) return;
    noise(0.35, { f0: 3000, f1: 800, q: 0.6, vol: 0.28, attack: 0.05 });
    tone(110, 0.1, { type: 'triangle', vol: 0.16, delay: 0.32, to: 70 });
  },
  stamp() {
    if (!live()) return;
    tone(90, 0.16, { type: 'sine', vol: 0.5, to: 45 });
    noise(0.06, { type: 'lowpass', f0: 1200, vol: 0.4 });
  },
  tick() {
    if (!live()) return;
    noise(0.018, { f0: 4200 + Math.random() * 900, q: 4, vol: 0.12 });
  },
  click() {
    if (!live()) return;
    tone(2100, 0.025, { type: 'square', vol: 0.05, to: 1400 });
  },
  /** Iris shut: leaf spring snap, then the blades settling. */
  shutter() {
    if (!live()) return;
    noise(0.04, { f0: 5200, q: 2.5, vol: 0.32 });
    tone(320, 0.05, { type: 'square', vol: 0.05, to: 180 });
    noise(0.09, { f0: 2400, f1: 900, q: 1.2, vol: 0.18, delay: 0.05 });
  },
  /** Push pin into cork. */
  pin() {
    if (!live()) return;
    noise(0.05, { type: 'lowpass', f0: 900, f1: 300, vol: 0.4 });
    tone(220, 0.06, { type: 'triangle', vol: 0.1, to: 140 });
  },
  /** A string pulled tight, then let go. */
  pluck() {
    if (!live()) return;
    const f = 160 + Math.random() * 60;
    tone(f, 0.5, { type: 'triangle', vol: 0.05, to: f * 0.97 });
    tone(f * 2.01, 0.25, { type: 'sine', vol: 0.02 });
  },
  /** Paper lifted off a paper clip. */
  paper() {
    if (!live()) return;
    noise(0.16, { f0: 2400, f1: 5200, q: 0.7, vol: 0.16, attack: 0.03 });
  },
  /** Faint sonar ping when the wall sweep passes a card. */
  ping(depth = 0) {
    if (!live()) return;
    tone(1320 - depth * 40, 0.4, { type: 'sine', vol: 0.012, to: 1240 - depth * 40 });
  },
  /** Card-file relay clicking while a record is fetched. */
  relay() {
    if (!live()) return;
    noise(0.015, { f0: 2600 + Math.random() * 1400, q: 5, vol: 0.09 });
  },
};
