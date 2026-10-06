/**
 * Running the slide projector: the lamp and fan, the tray stepping on, the
 * slide falling through the gate and the focus settling. The room model
 * (projector.ts) only shows what this decides.
 */
import { audioOut } from '../audio';
import { isZh } from '../i18n';
import { reducedMotion } from '../prefs';
import { drawSlide, type Slide } from './slides';
import type { Projector } from './projector';

export class SlideShow {
  on = false;
  index = 0;
  auto = false;
  onChange: () => void = () => {};
  onEnd: () => void = () => {};

  private cache = new Map<number, HTMLCanvasElement>();
  private run = 0;
  private autoTimer = 0;
  private fan: GainNode | null = null;
  private fast = reducedMotion();

  constructor(public slides: Slide[], private projector: () => Projector | undefined, private lamp: (on: boolean) => void) {}

  private canvas(i: number) {
    let c = this.cache.get(i);
    if (!c) {
      c = drawSlide(this.slides[i], i, isZh());
      this.cache.set(i, c);
    }
    return c;
  }

  /** Language changed or a photograph arrived: draw again. */
  redraw() {
    this.cache.clear();
    if (this.on) this.projector()?.setGate(this.slides.length ? this.canvas(this.index) : 'open');
  }

  /** The tray comes off: the slide lifts out of the gate, the tray turns back to its empty slot. */
  unload() {
    this.stopAuto();
    ++this.run;
    const p = this.projector();
    if (this.slides.length) {
      this.sfx('clack');
      p?.setDrop(this.index, false);
    }
    p?.home();
    this.slides = [];
    this.index = 0;
    this.cache.clear();
    if (this.on) p?.setGate('open');
    this.onChange();
  }

  /** A tray goes on: the first slide drops into the gate. */
  load(slides: Slide[]) {
    ++this.run;
    this.slides = slides;
    this.index = 0;
    this.cache.clear();
    const p = this.projector();
    p?.turnTo(0);
    const run = this.run;
    window.setTimeout(() => {
      if (run !== this.run) return;
      this.sfx('clack');
      p?.setDrop(0, true);
      if (this.on) p?.setGate(this.canvas(0), this.fast ? 0 : 6);
      window.setTimeout(() => run === this.run && this.on && p?.setGate(this.canvas(0)), this.fast ? 0 : 340);
    }, this.fast ? 0 : 300);
    this.onChange();
  }

  /* ---------------- sound ---------------- */
  private sfx(kind: 'clack' | 'step' | 'switch') {
    const out = audioOut();
    if (!out) return;
    const { ctx, bus, noise } = out;
    const t = ctx.currentTime;
    const burst = (at: number, f: number, dur: number, vol: number, type: BiquadFilterType = 'lowpass') => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      s.connect(fl).connect(g).connect(bus);
      s.start(t + at, Math.random());
      s.stop(t + at + dur + 0.02);
    };
    const knock = (at: number, f: number, vol: number) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t + at);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + at + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.08);
      o.connect(g).connect(bus);
      o.start(t + at);
      o.stop(t + at + 0.1);
    };
    if (kind === 'switch') {
      burst(0, 2400, 0.03, 0.3, 'bandpass');
      knock(0, 300, 0.12);
    } else if (kind === 'step') {
      burst(0, 3000, 0.02, 0.12, 'bandpass');
    } else {
      // the slide lifted out, the tray stepping on, the next one dropping in
      burst(0, 1800, 0.05, 0.35);
      knock(0.01, 210, 0.2);
      burst(0.16, 2600, 0.03, 0.15, 'bandpass');
      burst(0.36, 1200, 0.06, 0.4);
      knock(0.37, 160, 0.22);
    }
  }

  /** The fan runs while the lamp is on, and for a while after. */
  private setFan(on: boolean) {
    const out = audioOut();
    if (!out) return;
    const { ctx, bus, noise } = out;
    if (!this.fan) {
      this.fan = ctx.createGain();
      this.fan.gain.value = 0;
      this.fan.connect(bus);
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 0.7;
      const ng = ctx.createGain();
      ng.gain.value = 0.16;
      s.connect(bp).connect(ng).connect(this.fan);
      s.start();
      const hum = ctx.createOscillator();
      hum.frequency.value = 100;
      const hg = ctx.createGain();
      hg.gain.value = 0.012;
      hum.connect(hg).connect(this.fan);
      hum.start();
    }
    this.fan.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.4 : 1.6);
  }

  /* ---------------- controls ---------------- */
  power(on = !this.on) {
    if (on === this.on) return;
    this.on = on;
    this.sfx('switch');
    this.setFan(on);
    const p = this.projector();
    if (on && !this.slides.length) {
      // no tray: the lamp shines straight through the empty gate
      p?.setGate('open');
    } else if (on) {
      p?.turnTo(this.index);
      p?.setDrop(this.index, true);
      p?.setGate(this.canvas(this.index), this.fast ? 0 : 5);
      const run = ++this.run;
      window.setTimeout(() => run === this.run && p?.setGate(this.canvas(this.index)), 420);
    } else {
      this.stopAuto();
    }
    this.lamp(on);
    this.onChange();
  }

  go(i: number) {
    if (!this.slides.length) return;
    i = Math.max(0, Math.min(this.slides.length - 1, i));
    if (i === this.index) return;
    const from = this.index;
    this.index = i;
    const p = this.projector();
    const run = ++this.run;
    const after = (ms: number, f: () => void) => window.setTimeout(() => run === this.run && f(), this.fast ? 0 : ms);
    this.sfx('clack');
    // lift the slide out, dark for a moment; step round; drop the next; let the focus settle
    p?.setDrop(from, false);
    if (this.on) p?.setGate(null);
    after(160, () => {
      p?.turnTo(i);
      const steps = Math.min(Math.abs(i - from) - 1, 12);
      for (let k = 0; k < steps; k++) window.setTimeout(() => this.sfx('step'), k * 30);
    });
    after(360, () => {
      p?.setDrop(i, true);
      if (this.on) p?.setGate(this.canvas(i), 6);
    });
    after(700, () => {
      if (this.on) p?.setGate(this.canvas(i));
    });
    if (i === this.slides.length - 1) {
      this.stopAuto();
      after(900, () => this.onEnd());
    }
    this.onChange();
  }

  next() {
    if (this.index >= this.slides.length - 1) return;
    this.go(this.index + 1);
  }

  prev() {
    if (this.index <= 0) return;
    this.go(this.index - 1);
  }

  toggleAuto() {
    if (this.auto) return this.stopAuto();
    if (!this.slides.length) return;
    if (!this.on) this.power(true);
    this.auto = true;
    if (this.index >= this.slides.length - 1) this.go(0);
    this.autoTimer = window.setInterval(() => this.next(), 7000);
    this.onChange();
  }

  stopAuto() {
    if (!this.auto) return;
    this.auto = false;
    window.clearInterval(this.autoTimer);
    this.onChange();
  }
}
