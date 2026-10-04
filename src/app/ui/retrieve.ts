/**
 * Retrieval strip: when a file is opened, the ARCHIVIST "fetches" it. A thin
 * segmented bar fills in uneven steps (somebody is walking to a cabinet),
 * a tip prints underneath, then the strip folds away. Purely decorative:
 * the dossier is readable the whole time.
 */
import { reducedMotion } from '../prefs';
import { audio } from '../audio';

export class Retrieve {
  private el = document.getElementById('ds-retrieve')!;
  private bar = document.getElementById('rt-bar')!;
  private pct = document.getElementById('rt-pct')!;
  private path = document.getElementById('rt-path')!;
  private state = document.getElementById('rt-state')!;
  private tip = document.getElementById('rt-tip')!;
  private timers: number[] = [];

  run(path: string, tip: string | null) {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    this.path.textContent = path;
    this.tip.textContent = tip ?? '';
    this.el.classList.toggle('has-tip', !!tip);
    this.el.classList.remove('is-done');
    this.el.classList.add('is-on');
    this.state.textContent = 'Retrieving';

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
    this.el.classList.remove('is-on');
  }

  private set(v: number) {
    this.bar.style.transform = `scaleX(${v / 100})`;
    this.pct.textContent = `${String(v).padStart(3, '0')}%`;
  }

  private finish() {
    this.state.textContent = 'Retrieved';
    this.el.classList.add('is-done');
  }
}
