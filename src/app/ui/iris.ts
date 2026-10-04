/**
 * Camera iris between rooms: six blades close to a point, the room changes
 * behind them, and they open again. Drawn on a 2D canvas over everything.
 */
import { reducedMotion } from '../prefs';
import { audio } from '../audio';

const BLADES = 6;
const CLOSE_MS = 480;
const HOLD_MS = 90;
const OPEN_MS = 560;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Iris {
  private g: CanvasRenderingContext2D;
  private busy: Promise<void> = Promise.resolve();

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  /** Close, run `swap` while the frame is black, open. Calls queue up. */
  run(swap: () => void) {
    this.busy = this.busy.then(async () => {
      await this.animate(0, 1, CLOSE_MS);
      audio.shutter();
      swap();
      await new Promise((r) => setTimeout(r, HOLD_MS));
      await this.animate(1, 0, OPEN_MS);
    });
    return this.busy;
  }

  /** Start fully closed and open (arriving straight into a room). */
  reveal() {
    this.busy = this.busy.then(() => this.animate(1, 0, OPEN_MS));
    return this.busy;
  }

  private animate(from: number, to: number, ms: number) {
    const reduce = reducedMotion();
    this.canvas.hidden = false;
    this.fit();
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const step = () => {
        const t = Math.min(1, (performance.now() - t0) / (reduce ? ms * 0.6 : ms));
        const v = from + (to - from) * ease(t);
        if (reduce) this.fade(v);
        else this.draw(v);
        if (t < 1) requestAnimationFrame(step);
        else {
          if (to === 0) this.canvas.hidden = true;
          resolve();
        }
      };
      step();
    });
  }

  private fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(window.innerWidth * dpr), h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private fade(v: number) {
    const { g, canvas: c } = this;
    g.clearRect(0, 0, c.width, c.height);
    g.globalAlpha = v;
    g.fillStyle = '#0d0e10';
    g.fillRect(0, 0, c.width, c.height);
    g.globalAlpha = 1;
  }

  /** `v` = how closed the iris is, 0 (open) to 1 (shut). */
  private draw(v: number) {
    const { g, canvas: c } = this;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (v <= 0) return;
    const cx = W / 2, cy = H / 2;
    const R = Math.hypot(W, H) / 2 / Math.cos(Math.PI / BLADES);
    const r = R * (1 - v);
    const rot = v * (Math.PI / 3) + 0.3;
    const far = Math.hypot(W, H) * 4;
    const V = Array.from({ length: BLADES }, (_, i) => {
      const a = rot + (i / BLADES) * Math.PI * 2;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    });
    const dir = (i: number) => {
      const a = V[i], b = V[(i + 1) % BLADES];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (l < 1e-3) {
        // fully shut: use the hexagon's edge direction
        const ang = rot + ((i + 0.5) / BLADES) * Math.PI * 2 + Math.PI / 2;
        return [Math.cos(ang), Math.sin(ang)] as const;
      }
      return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as const;
    };
    for (let i = 0; i < BLADES; i++) {
      const a = V[i], b = V[(i + 1) % BLADES];
      const di = dir(i), dp = dir((i - 1 + BLADES) % BLADES);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.lineTo(b[0] + di[0] * far, b[1] + di[1] * far);
      g.lineTo(a[0] + dp[0] * far, a[1] + dp[1] * far);
      g.closePath();
      // brushed blued steel, each blade catching the light a little differently
      const grd = g.createLinearGradient(a[0], a[1], a[0] + dp[0] * W * 0.6, a[1] + dp[1] * W * 0.6);
      const lift = 10 + ((i * 37) % 6) * 3;
      grd.addColorStop(0, `rgb(${lift + 14} ${lift + 15} ${lift + 18})`);
      grd.addColorStop(1, `rgb(${lift} ${lift} ${lift + 2})`);
      g.fillStyle = grd;
      g.fill();
      // leading edge highlight
      g.strokeStyle = 'rgba(235, 230, 218, .16)';
      g.lineWidth = Math.max(1, W / 1600);
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0] + di[0] * far, b[1] + di[1] * far);
      g.stroke();
    }
    // the red index dot on the lens barrel
    g.fillStyle = `rgba(184, 40, 29, ${Math.max(0, (v - 0.75) * 4)})`;
    g.beginPath();
    g.arc(cx, cy - Math.min(W, H) * 0.42, Math.max(3, W / 500), 0, Math.PI * 2);
    g.fill();
  }
}
