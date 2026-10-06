/**
 * The music tapes in the office: three short pieces written as code and
 * played by WebAudio voices (an FM electric piano, a pad, a bass, a music
 * box, a lead and a small drum machine). No samples. Each song is a step
 * sequence: the deck calls `play(step, time)` a little ahead of time, so a
 * song can stop and pick up again at any step.
 */

/** Seeded random, so a tape sounds the same every time it is played. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The instruments, bound to one destination. */
export class Kit {
  constructor(private ctx: AudioContext, private dest: AudioNode, private noiseBuf: AudioBuffer) {}

  private env(t: number, a: number, peak: number, d: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, end: number, out: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.connect(out);
    o.start(t);
    o.stop(end);
    return o;
  }

  private noise(t: number, dur: number, type: BiquadFilterType, f: number, q: number, vol: number) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    const g = this.env(t, 0.002, vol, dur);
    s.connect(flt).connect(g).connect(this.dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  /** Electric piano: a sine carrier with a sine modulator whose depth falls away. */
  ep(t: number, m: number, dur: number, vel = 0.5) {
    const f = hz(m);
    const amp = this.env(t, 0.004, 0.06 * vel, dur);
    amp.connect(this.dest);
    const car = this.osc('sine', f, t, t + dur + 0.1, amp);
    const mod = this.ctx.createOscillator();
    mod.frequency.value = f;
    const idx = this.ctx.createGain();
    idx.gain.setValueAtTime(f * 2.2 * vel, t);
    idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.35);
    mod.connect(idx).connect(car.frequency);
    mod.start(t);
    mod.stop(t + dur + 0.1);
    // the tine
    const tine = this.env(t, 0.002, 0.012 * vel, 0.12);
    tine.connect(this.dest);
    this.osc('sine', f * 7.1, t, t + 0.2, tine);
  }

  chord(t: number, notes: number[], dur: number, vel = 0.5) {
    notes.forEach((n, i) => this.ep(t + i * 0.012, n, dur, vel * (i === 0 ? 0.8 : 0.6)));
  }

  /** Two detuned saws per note through a dark filter, slow in and out. */
  pad(t: number, notes: number[], dur: number, vol = 0.018) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(600, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(1, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
    lp.connect(g).connect(this.dest);
    for (const n of notes) for (const d of [-7, 7]) this.osc('sawtooth', hz(n), t, t + dur + 0.7, lp, d);
  }

  bass(t: number, m: number, dur: number, vel = 0.6) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const g = this.env(t, 0.006, 0.16 * vel, dur);
    lp.connect(g).connect(this.dest);
    this.osc('triangle', hz(m), t, t + dur + 0.1, lp);
    this.osc('sine', hz(m), t, t + dur + 0.1, lp);
  }

  /** Music box: a bright sine, a fourth harmonic that dies fast, a click. */
  box(t: number, m: number, vel = 0.5, cents = 0) {
    const f = hz(m) * Math.pow(2, cents / 1200);
    const a = this.env(t, 0.002, 0.05 * vel, 1.6);
    a.connect(this.dest);
    this.osc('sine', f, t, t + 1.7, a);
    const b = this.env(t, 0.001, 0.02 * vel, 0.25);
    b.connect(this.dest);
    this.osc('sine', f * 4.02, t, t + 0.3, b);
  }

  /** A square lead, filtered, with vibrato coming in late. */
  lead(t: number, m: number, dur: number, vel = 0.5) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.02);
    g.gain.setValueAtTime(0.03 * vel, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    lp.connect(g).connect(this.dest);
    const o = this.osc('square', hz(m), t, t + dur + 0.2, lp);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz(m) * 0.012, t + Math.min(0.5, dur));
    vib.connect(depth).connect(o.frequency);
    vib.start(t);
    vib.stop(t + dur + 0.2);
  }

  kick(t: number, vel = 0.7) {
    const g = this.env(t, 0.002, 0.5 * vel, 0.28);
    g.connect(this.dest);
    const o = this.osc('sine', 120, t, t + 0.32, g);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  }

  rim(t: number, vel = 0.5) {
    this.noise(t, 0.05, 'bandpass', 1900, 3, 0.12 * vel);
    const g = this.env(t, 0.001, 0.05 * vel, 0.04);
    g.connect(this.dest);
    this.osc('triangle', 420, t, t + 0.06, g);
  }

  clap(t: number, vel = 0.6) {
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.011, i === 2 ? 0.16 : 0.02, 'bandpass', 1300, 1.2, 0.16 * vel);
  }

  hat(t: number, vel = 0.4, open = false) {
    this.noise(t, open ? 0.22 : 0.035, 'highpass', 7200, 0.7, 0.07 * vel);
  }
}

export interface Song {
  id: string;
  /** Steps per bar and seconds per step. */
  bar: number;
  step: number;
  bars: number;
  play(i: number, t: number, k: Kit): void;
}

export const songLength = (s: Song) => s.bar * s.bars * s.step;

/* ---------------- 01 · Wet Season: slow, brushed, a piano by the window ---------------- */
function wetSeason(): Song {
  const beat = 60 / 72;
  const chords = [
    [53, 57, 60, 64, 67],
    [52, 55, 59, 62],
    [50, 53, 57, 60, 64],
    [55, 60, 62, 65],
  ];
  const roots = [41, 40, 38, 43];
  const scale = [72, 74, 76, 79, 81, 84];
  const r = rng(1999);
  // one four-bar phrase, and a variation of it
  const phrase = (seed: () => number) =>
    Array.from({ length: 64 }, (_, s) => (s % 4 === 0 || s % 16 === 6 ? (seed() < 0.42 ? scale[Math.floor(seed() * scale.length)] : 0) : 0));
  const a = phrase(r), b = phrase(r);
  return {
    id: 'wet-season',
    bar: 16,
    step: beat / 4,
    bars: 40,
    play(i, t, k) {
      const bar = Math.floor(i / 16), s = i % 16, c = bar % 4;
      const swing = s % 4 === 2 ? beat * 0.06 : 0;
      t += swing;
      const drums = bar >= 4 && bar < 36;
      if (s === 0) k.chord(t, chords[c], beat * 3.2, 0.55);
      if (s === 10) k.chord(t, chords[c].slice(1), beat * 1.4, 0.3);
      if (s === 0 && bar >= 2) k.bass(t, roots[c], beat * 1.8);
      if (s === 10 && bar >= 2) k.bass(t, roots[c] + 12, beat * 0.8, 0.4);
      if (s === 0 && bar % 8 === 0) k.pad(t, chords[c].slice(0, 3).map((n) => n + 12), beat * 7.6);
      if (drums) {
        if (s === 0 || s === 10) k.kick(t, s ? 0.45 : 0.6);
        if (s === 7 && bar % 2) k.kick(t, 0.3);
        if (s === 4 || s === 12) k.rim(t, 0.6);
        if (s % 2 === 0) k.hat(t, s % 4 ? 0.25 : 0.4);
      }
      if (bar >= 8 && bar < 36) {
        const p = (Math.floor((bar - 8) / 4) % 2 ? b : a)[(bar % 4) * 16 + s];
        if (p) k.ep(t, p, beat * 1.2, 0.45);
      }
    },
  };
}

/* ---------------- 02 · Last Bus: city pop on the way home ---------------- */
function lastBus(): Song {
  const beat = 60 / 96;
  const chords = [
    [56, 60, 63, 67],
    [55, 58, 62, 65],
    [53, 56, 60, 63],
    [58, 62, 65, 68],
  ];
  const roots = [44, 43, 41, 46];
  const scale = [63, 65, 67, 70, 72, 75, 77];
  const r = rng(97);
  const phrase = Array.from({ length: 64 }, (_, s) => {
    const on = [0, 3, 6, 8, 10, 14].includes(s % 16) && r() < 0.62;
    return on ? scale[Math.floor(r() * scale.length)] : 0;
  });
  const BASS = [0, 12, 0, 7, 12, 0, 10, 12];
  return {
    id: 'last-bus',
    bar: 16,
    step: beat / 4,
    bars: 48,
    play(i, t, k) {
      const bar = Math.floor(i / 16), s = i % 16, c = bar % 4;
      const full = bar >= 4 && bar < 44;
      if (s === 0) k.pad(t, chords[c], beat * 3.8, 0.012);
      if ((s === 2 || s === 7 || s === 10) && bar >= 2) k.chord(t, chords[c].map((n) => n + 12), beat * 0.45, 0.32);
      if (bar >= 2 && s % 2 === 0) {
        const n = roots[c] + BASS[s / 2];
        if (s !== 4 || bar % 2) k.bass(t, n, beat * 0.42, s === 0 ? 0.75 : 0.5);
      }
      if (full) {
        if (s === 0 || s === 8 || (s === 11 && bar % 2)) k.kick(t, 0.65);
        if (s === 4 || s === 12) k.clap(t, 0.7);
        if (s === 14) k.hat(t, 0.35, true);
        else k.hat(t, s % 2 ? 0.18 : 0.32);
      } else if (bar >= 2) {
        if (s % 4 === 0) k.hat(t, 0.25);
      }
      const leadOn = (bar >= 12 && bar < 28) || (bar >= 32 && bar < 44);
      if (leadOn) {
        const n = phrase[(bar % 4) * 16 + s];
        if (n) k.lead(t, n + (bar >= 32 && bar % 8 >= 4 ? 12 : 0), beat * 0.7, 0.55);
      }
    },
  };
}

/* ---------------- 03 · Year Field: nine to the bar, a music box, one note out ---------------- */
function yearField(): Song {
  const step = 60 / 168;
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [47, 50, 55],
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 0, 2, 4];
  return {
    id: 'year-field',
    bar: 9,
    step,
    bars: 36,
    play(i, t, k) {
      const bar = Math.floor(i / 9), s = i % 9, c = bar % 4;
      const ch = chords[c];
      // every ninth bar one note slips: a quarter-tone flat, then back
      const slip = bar % 9 === 8 && s === 4 ? -48 : 0;
      const n = ARP[s];
      const m = ch[n % 3] + 12 * (1 + Math.floor(n / 3));
      if (bar < 34) k.box(t, m, s === 0 ? 0.7 : 0.45, slip);
      if (s === 0) {
        k.pad(t, ch, step * 8.6, bar >= 4 ? 0.016 : 0.01);
        if (bar >= 4) k.bass(t, ch[0] - 12, step * 8, 0.5);
      }
      if (bar >= 12 && bar < 30) {
        if (s === 0 || s === 6) k.kick(t, 0.35);
        if (s === 3) k.rim(t, 0.4);
      }
    },
  };
}

export const SONGS: Record<string, () => Song> = {
  'wet-season': wetSeason,
  'last-bus': lastBus,
  'year-field': yearField,
};
