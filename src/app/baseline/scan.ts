/**
 * The booth's two instruments, drawn flat: a scanner window (an abstract eye,
 * no portrait) and a pulse trace. Deviation widens the pupil, roughens the
 * spokes and lifts the trace; a kick is a short spike on top of that.
 */
const INK = '#14181a';
const RED = '#c1272d';
const GREY = 'rgba(20, 24, 26, .28)';

export class Scan {
  private dev = 0;
  private cur = 0;
  private kickV = 0;
  private talk = 0;
  private talking = false;
  private raf = 0;
  private t0 = performance.now();
  private trace: number[] = [];
  private ctxS: CanvasRenderingContext2D;
  private ctxT: CanvasRenderingContext2D;
  private onVis = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else this.raf = requestAnimationFrame(this.frame);
  };

  constructor(private scan: HTMLCanvasElement, private line: HTMLCanvasElement, private calm: boolean) {
    this.ctxS = scan.getContext('2d')!;
    this.ctxT = line.getContext('2d')!;
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.frame);
  }

  setDeviation(d: number) { this.dev = Math.max(0, Math.min(1, d)); }
  kick(k: number) { this.kickV = Math.min(1.6, this.kickV + k); }
  speak(on: boolean) { this.talking = on; }
  reset() { this.dev = 0; this.cur = 0; this.kickV = 0; this.trace = []; }
  dispose() {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  private fit(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: c.clientWidth, h: c.clientHeight };
  }

  private frame = (now: number) => {
    const t = (now - this.t0) / 1000;
    // springs without bounce: ease toward target, let the kick fall off
    this.cur += (this.dev - this.cur) * 0.06;
    this.kickV *= 0.93;
    this.talk += ((this.talking ? 1 : 0) - this.talk) * 0.15;
    this.drawScan(t);
    this.drawTrace(t);
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawScan(t: number) {
    const { w, h } = this.fit(this.scan, this.ctxS);
    const c = this.ctxS;
    c.clearRect(0, 0, w, h);
    const d = this.cur;
    const k = this.kickV;
    const R = Math.min(w, h) * 0.42;
    const cx = w / 2 + (this.calm ? 0 : (Math.random() - 0.5) * k * 6);
    const cy = h / 2 + (this.calm ? 0 : (Math.random() - 0.5) * k * 6);
    c.lineCap = 'round';
    // outer reticle ticks, slowly turning
    c.strokeStyle = GREY; c.lineWidth = 1;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + t * 0.15;
      const l = i % 4 === 0 ? 0.1 : 0.05;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02);
      c.lineTo(cx + Math.cos(a) * R * (1.02 + l), cy + Math.sin(a) * R * (1.02 + l));
      c.stroke();
    }
    // spokes: the iris read as fibres; deviation makes them uneven
    const n = 96;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rough = Math.sin(a * 7 + t * 1.3) * 0.5 + Math.sin(a * 13 - t * 2.1) * 0.5;
      const r0 = R * (0.3 + 0.18 * d);
      const r1 = R * (0.78 + 0.2 * rough * (0.15 + d + k * 0.5));
      c.strokeStyle = d > 0.55 && i % 9 === 0 ? RED : INK;
      c.lineWidth = i % 3 === 0 ? 1.4 : 0.7;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      c.stroke();
    }
    // rings
    c.strokeStyle = INK; c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, R * 0.8, 0, Math.PI * 2); c.stroke();
    c.setLineDash([3, 5]);
    c.beginPath(); c.arc(cx, cy, R * 0.92, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    // pupil, capped so it never swallows the iris
    const pr = R * Math.min(0.5, 0.2 + 0.2 * d + 0.06 * k + 0.01 * Math.sin(t * 3));
    c.fillStyle = INK;
    c.beginPath(); c.arc(cx, cy, pr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e9ebe6';
    c.beginPath(); c.arc(cx - pr * 0.35, cy - pr * 0.35, pr * 0.14, 0, Math.PI * 2); c.fill();
    // crosshair
    c.strokeStyle = d > 0.55 ? RED : INK;
    c.beginPath();
    c.moveTo(cx - R * 1.18, cy); c.lineTo(cx - R * 0.96, cy);
    c.moveTo(cx + R * 0.96, cy); c.lineTo(cx + R * 1.18, cy);
    c.moveTo(cx, cy - R * 1.18); c.lineTo(cx, cy - R * 0.96);
    c.moveTo(cx, cy + R * 0.96); c.lineTo(cx, cy + R * 1.18);
    c.stroke();
  }

  private drawTrace(t: number) {
    const { w, h } = this.fit(this.line, this.ctxT);
    const c = this.ctxT;
    c.clearRect(0, 0, w, h);
    const d = this.cur;
    const step = 3;
    const cols = Math.ceil(w / step) + 2;
    // one new sample per frame, scrolling left
    const beat = Math.sin(t * (2.2 + d * 3.2)) ** 24;
    const noise = (Math.random() - 0.5) * (0.04 + d * 0.5 + this.kickV * 0.6);
    this.trace.push(beat * (0.25 + d * 0.6 + this.kickV * 0.5) + noise + this.talk * Math.sin(t * 40) * 0.05);
    while (this.trace.length > cols) this.trace.shift();
    const mid = h / 2;
    c.strokeStyle = GREY; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, mid); c.lineTo(w, mid); c.stroke();
    c.strokeStyle = d > 0.55 ? RED : INK; c.lineWidth = 1.3;
    c.beginPath();
    this.trace.forEach((v, i) => {
      const x = w - (this.trace.length - i) * step;
      const y = mid - v * h * 0.45;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
  }
}
