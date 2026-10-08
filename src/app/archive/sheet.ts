/**
 * The paper and the room as one movement. Opening a file, the archive's
 * terminal moves first (the rule, the spine, the number, the checkout log),
 * then the folder itself comes up from where it lies in the room, its cover
 * swings open on the spine and the sheet is there underneath. Putting it
 * away runs the other way: the cover closes over the sheet and the folder
 * goes back down into its drawer or onto the table. Stepping to the next file
 * slides this sheet back the way it came and the next one in.
 */
import type { ArchiveRecord } from '../types';
import { reducedMotion } from '../prefs';
import { clearanceKey } from '../clearance';
import { esc } from '../ui/text';
import { audio } from '../audio';
import { coverHtml } from './covers';

type Pt = { x: number; y: number } | null;
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';
const EASE_IN = 'cubic-bezier(.55,0,.8,.2)';

export class Sheet {
  private cover: HTMLElement | null = null;
  private arrive = 0;

  constructor(private root: HTMLElement) {}

  private get paper() {
    return document.getElementById('ds-scroll')!;
  }

  /** A folder cover the size of the sheet: the category's board, its tab and clearance band, the stamp. */
  private make(rec: ArchiveRecord, r: DOMRect) {
    this.cover?.remove();
    const el = document.createElement('div');
    const top = rec.stamp === 'TOP SECRET';
    el.className = `ds-cover ds-cover--${rec.category}${top ? ' ds-cover--string' : ''} clr-${clearanceKey(rec.stamp)}`;
    el.style.setProperty('--cw', `${r.width}px`);
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    el.innerHTML = coverHtml(rec);
    this.root.appendChild(el);
    this.cover = el;
    return el;
  }

  /** Bring a file up from `from` (its place on the screen) and open it. */
  open(from: Pt, rec: ArchiveRecord) {
    if (reducedMotion()) {
      this.root.classList.add('is-arriving');
      window.clearTimeout(this.arrive);
      this.arrive = window.setTimeout(() => this.root.classList.remove('is-arriving'), 1700);
      return;
    }
    const paper = this.paper;
    const r = paper.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fx = from?.x ?? cx, fy = from?.y ?? r.bottom + r.height * 0.4;
    const cover = this.make(rec, r);
    const flap = cover.firstElementChild as HTMLElement;
    // held up a moment so its front can be read; a TOP SECRET envelope is unwound first
    const top = rec.stamp === 'TOP SECRET';
    const at = 1050 + (top ? 420 : 0);
    this.root.classList.add('is-arriving');
    window.clearTimeout(this.arrive);
    this.arrive = window.setTimeout(() => this.root.classList.remove('is-arriving'), at + 650);
    // the sheet waits under the cover until the cover opens
    const pa = paper.animate(
      [
        { opacity: 0, transform: 'translateY(.8rem) scale(.985)' },
        { opacity: 0, transform: 'translateY(.8rem) scale(.985)', offset: (at + 120) / (at + 520) },
        { opacity: 1, transform: 'none' },
      ],
      { duration: at + 520, easing: EASE_OUT, fill: 'both' },
    );
    pa.onfinish = () => pa.cancel();
    // up out of the room and onto the screen
    cover.animate(
      [
        { transform: `translate(${fx - cx}px, ${fy - cy}px) scale(.12) rotate(-9deg)`, opacity: 0 },
        { opacity: 1, offset: 0.2 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 560, delay: 240, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'both' },
    );
    if (top) {
      const thread = cover.querySelector<SVGPathElement>('.cv-thread');
      thread?.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: 1 }], { duration: 380, delay: at - 420, easing: 'ease-in', fill: 'both' });
      window.setTimeout(() => audio.pluck(), at - 400);
    }
    // the cover swings open on its spine, then is set aside
    flap.animate([{ transform: 'perspective(1800px) rotateY(0deg)' }, { transform: 'perspective(1800px) rotateY(-168deg)' }], { duration: 440, delay: at, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'both' });
    window.setTimeout(() => audio.flap(), at);
    window.setTimeout(() => audio.slide(), at + 180);
    window.setTimeout(() => audio.settle(), at + 430);
    const out = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, delay: at + 400, fill: 'forwards' });
    out.onfinish = () => cover.remove();
  }

  /**
   * Sat down at the table: the folder slides over and opens on the blotter in
   * the room itself, and the sheet comes up out of it once it lies open.
   */
  seat(rec: ArchiveRecord) {
    const wait = reducedMotion() ? 0 : 1150 + (rec.stamp === 'TOP SECRET' ? 300 : 0);
    this.root.classList.add('is-arriving', 'is-seating');
    window.clearTimeout(this.arrive);
    this.arrive = window.setTimeout(() => this.root.classList.remove('is-arriving', 'is-seating'), wait + 700);
    if (reducedMotion()) return;
    const pa = this.paper.animate(
      [
        { opacity: 0, transform: 'translateY(1.2rem) scale(.94)' },
        { opacity: 0, transform: 'translateY(1.2rem) scale(.94)', offset: wait / (wait + 560) },
        { opacity: 1, transform: 'none' },
      ],
      { duration: wait + 560, easing: EASE_OUT, fill: 'both' },
    );
    pa.onfinish = () => pa.cancel();
    if (rec.stamp === 'TOP SECRET') window.setTimeout(() => audio.pluck(), 500);
    window.setTimeout(() => audio.slide(), 250);
    window.setTimeout(() => audio.flap(), wait - 450);
  }

  /** Getting up from the table: the sheet goes back down into the folder, which shuts in the room. */
  rise() {
    this.root.classList.remove('is-arriving', 'is-seating');
    if (reducedMotion()) return;
    audio.flap();
  }

  /** Close the file over the sheet and send it back to `to`. */
  close(to: Pt, rec: ArchiveRecord) {
    this.root.classList.remove('is-arriving');
    if (reducedMotion()) return;
    const r = this.paper.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const tx = to?.x ?? cx, ty = to?.y ?? r.bottom + r.height * 0.4;
    const cover = this.make(rec, r);
    const flap = cover.firstElementChild as HTMLElement;
    audio.flap();
    flap.animate([{ transform: 'perspective(1800px) rotateY(-168deg)' }, { transform: 'perspective(1800px) rotateY(0deg)' }], { duration: 300, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' });
    const back = cover.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'none', opacity: 1, offset: 0.42 },
        { transform: `translate(${tx - cx}px, ${ty - cy}px) scale(.12) rotate(-9deg)`, opacity: 0 },
      ],
      { duration: 720, easing: EASE_IN, fill: 'forwards' },
    );
    back.onfinish = () => cover.remove();
  }

  /**
   * Step to the next or previous file without closing: this sheet goes the way
   * it came (down into the drawer, or across the table) while `fill` puts the
   * next one in, and the next one comes in from the other side.
   */
  swap(dir: number, table: boolean, fill: () => void) {
    if (reducedMotion() || !dir) {
      fill();
      return;
    }
    const paper = this.paper;
    const away = table ? `translateX(${-dir * 38}%) rotate(${-dir * 1.6}deg)` : `translate(${-dir * 4}%, 26%) scale(.97)`;
    const come = table ? `translateX(${dir * 38}%) rotate(${dir * 1.6}deg)` : `translate(${dir * 4}%, 26%) scale(.97)`;
    audio.slide();
    const a = paper.animate([{ transform: 'none', opacity: 1 }, { transform: away, opacity: 0 }], { duration: 230, easing: EASE_IN, fill: 'forwards' });
    a.onfinish = () => {
      fill();
      paper.scrollTop = 0;
      paper.animate([{ transform: come, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: EASE_OUT });
      window.setTimeout(() => audio.settle(), 300);
      a.cancel();
    };
  }
}
