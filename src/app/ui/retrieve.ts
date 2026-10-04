/**
 * Retrieval strip: when a file is opened, the ARCHIVIST "fetches" it. A thin
 * segmented bar fills in uneven steps (somebody is walking to a cabinet),
 * a tip prints underneath, then the strip folds away. The dossier below is
 * revealed in step with the bar (`onProgress`): what has loaded is what
 * you can read.
 */
import { reducedMotion } from '../prefs';
import { audio } from '../audio';
import { t as tr } from '../i18n';

export class Retrieve {
  private el = document.getElementById('ds-retrieve')!;
  private bar = document.getElementById('rt-bar')!;
  private pct = document.getElementById('rt-pct')!;
  private path = document.getElementById('rt-path')!;
  private state = document.getElementById('rt-state')!;
  private tip = document.getElementById('rt-tip')!;
  private timers: number[] = [];
  private onProgress: (p: number) => void = () => {};
  /** Displayed progress eases toward the step target, so the reveal glides. */
  private shown = 1;
  private target = 1;
  private raf = 0;
  private lastT = 0;

  run(path: string, tip: string | null, onProgress: (p: number) => void = () => {}) {
    this.flush();
    this.onProgress = onProgress;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.path.textContent = path;
    this.tip.textContent = tip ?? '';
    this.el.classList.toggle('has-tip', !!tip);
    this.el.classList.remove('is-done');
    this.el.classList.add('is-on');
    this.state.textContent = tr('Retrieving');

    const later = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, ms));
    if (reducedMotion()) {
      this.set(100);
      this.finish();
      later(2600, () => this.el.classList.remove('is-on'));
      return;
    }
    this.set(0);
    // Uneven steps: quick through the index, a pause at the drawer, then the folder
    let t = 120, p = 0;
    const steps = [9, 14, 4, 21, 2, 1, 18, 11, 7, 13];
    steps.forEach((d, i) => {
      t += 50 + ((i * 37) % 5) * 30 + (d < 5 ? 160 : 0);
      p = Math.min(100, p + d);
      const v = p;
      later(t, () => {
        this.set(v);
        audio.relay();
      });
    });
    later(t + 140, () => {
      this.set(100);
      this.finish();
    });
    later(t + 2400, () => this.el.classList.remove('is-on'));
  }

  /** Close right away (the dossier is going). */
  cancel() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.flush();
    this.el.classList.remove('is-on');
  }

  private set(v: number) {
    this.target = v / 100;
    this.pct.textContent = `${String(v).padStart(3, '0')}%`;
    if (v === 0 || reducedMotion()) {
      this.shown = this.target;
      this.paint();
      return;
    }
    if (!this.raf) {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.glide);
    }
  }

  private glide = (t: number) => {
    const dt = Math.min(0.1, (t - this.lastT) / 1000);
    this.lastT = t;
    this.shown += (this.target - this.shown) * Math.min(1, dt * 14);
    if (Math.abs(this.target - this.shown) < 0.002) this.shown = this.target;
    this.paint();
    this.raf = this.shown === this.target ? 0 : requestAnimationFrame(this.glide);
  };

  private paint() {
    this.bar.style.transform = `scaleX(${this.shown})`;
    this.onProgress(this.shown);
  }

  /** Finish any reveal in progress at once (a new file is coming in). */
  private flush() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.shown = this.target = 1;
    this.onProgress(1);
  }

  private finish() {
    this.state.textContent = tr('Retrieved');
    this.el.classList.add('is-done');
  }
}
