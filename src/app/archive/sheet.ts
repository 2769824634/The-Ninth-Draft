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
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    el.innerHTML = `<div class="ds-cover__flap">
        <div class="ds-cover__face">
          <span class="ds-cover__tab">${esc(rec.file)}</span>
          <i class="ds-cover__band"></i>
          <p class="ds-cover__title">${esc(rec.title)}</p>
          <b class="ds-cover__stamp">${esc(rec.stamp)}</b>
          ${top ? '<i class="ds-cover__washer"></i><i class="ds-cover__washer ds-cover__washer--b"></i>' : ''}
        </div>
        <div class="ds-cover__inside"></div>
      </div>`;
    this.root.appendChild(el);
    this.cover = el;
    return el;
  }

  /** Bring a file up from `from` (its place on the screen) and open it. */
  open(from: Pt, rec: ArchiveRecord) {
    this.root.classList.add('is-arriving');
    window.clearTimeout(this.arrive);
    this.arrive = window.setTimeout(() => this.root.classList.remove('is-arriving'), 1700);
    if (reducedMotion()) return;
    const paper = this.paper;
    const r = paper.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const fx = from?.x ?? cx, fy = from?.y ?? r.bottom + r.height * 0.4;
    const cover = this.make(rec, r);
    const flap = cover.firstElementChild as HTMLElement;
    // the sheet waits under the cover until the cover opens
    const pa = paper.animate(
      [
        { opacity: 0, transform: 'translateY(.8rem) scale(.985)' },
        { opacity: 0, transform: 'translateY(.8rem) scale(.985)', offset: 0.62 },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 1250, easing: EASE_OUT, fill: 'both' },
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
    // the cover swings open on its spine, then is set aside
    flap.animate([{ transform: 'perspective(1800px) rotateY(0deg)' }, { transform: 'perspective(1800px) rotateY(-168deg)' }], { duration: 440, delay: 800, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'both' });
    window.setTimeout(() => audio.paper(), 820);
    const out = cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, delay: 1200, fill: 'forwards' });
    out.onfinish = () => cover.remove();
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
    const a = paper.animate([{ transform: 'none', opacity: 1 }, { transform: away, opacity: 0 }], { duration: 230, easing: EASE_IN, fill: 'forwards' });
    a.onfinish = () => {
      fill();
      paper.scrollTop = 0;
      paper.animate([{ transform: come, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: EASE_OUT });
      a.cancel();
    };
  }
}
