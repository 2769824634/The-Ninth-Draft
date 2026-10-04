/**
 * The Programs chapter page: the one loud page in the archive
 * (NASA × Constructivism). Shown once per visit when the drawer opens.
 */
import { reducedMotion } from '../prefs';

const KEY = 'n9:chapter';
const HOLD_MS = 1500;

export class Chapter {
  private el = document.getElementById('chapter')!;
  private timer = 0;
  private skip = () => this.hide();

  get seen() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; }
  }

  /** Returns false if it has already been shown this visit. */
  show() {
    if (this.seen) return false;
    try { sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ }
    this.el.hidden = false;
    void this.el.offsetWidth;
    this.el.classList.add('is-on');
    this.timer = window.setTimeout(this.skip, HOLD_MS + (reducedMotion() ? 0 : 700));
    // Any input skips it; capture so the drawer doesn't also react to that first key
    window.setTimeout(() => {
      ['pointerdown', 'keydown', 'wheel'].forEach((e) => window.addEventListener(e, this.skip, { once: true, capture: true }));
    }, 250);
    return true;
  }

  hide() {
    window.clearTimeout(this.timer);
    ['pointerdown', 'keydown', 'wheel'].forEach((e) => window.removeEventListener(e, this.skip, { capture: true }));
    if (!this.el.classList.contains('is-on')) return;
    this.el.classList.remove('is-on');
    this.el.classList.add('is-off');
    window.setTimeout(() => {
      this.el.classList.remove('is-off');
      this.el.hidden = true;
    }, reducedMotion() ? 0 : 450);
  }
}
