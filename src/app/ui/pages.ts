/**
 * A long file is several sheets, not one endless scroll. Every A4 length of
 * the paper ends in a fold: a crease across the sheet with the page number in
 * the margin above it. The edge of the visible sheet curls a little while
 * there is more below, and carries the running footer: the file number and
 * which page of how many is in front of you. Reading past a fold turns a leaf.
 */
import { audio } from '../audio';
import { t } from '../i18n';
import { esc } from './text';

const A4 = Math.SQRT2;
const pad2 = (n: number) => String(n).padStart(2, '0');

export class Pages {
  private layer = document.createElement('div');
  private curl = document.createElement('div');
  private foot = document.createElement('span');
  private file = '';
  private pageH = 0;
  private count = 1;
  private now = 1;
  private raf = 0;

  constructor(private paper: HTMLElement) {
    this.layer.className = 'pages';
    this.layer.setAttribute('aria-hidden', 'true');
    this.curl.className = 'pages__curl';
    this.curl.setAttribute('aria-hidden', 'true');
    this.foot.className = 'pages__foot micro';
    this.curl.appendChild(this.foot);
    paper.appendChild(this.layer);
    paper.parentElement?.appendChild(this.curl);
    const ro = new ResizeObserver(() => this.later());
    ro.observe(paper);
    for (const c of paper.children) if (c !== this.layer) ro.observe(c);
    paper.addEventListener('scroll', () => this.track(true), { passive: true });
    window.addEventListener('resize', () => this.later());
  }

  /** A new file is on the paper. */
  set(file: string) {
    this.file = file;
    this.now = 1;
    this.later();
  }

  private later() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.layout());
  }

  /** How tall the writing on the sheet is, leaving out the folds themselves. */
  private contentHeight() {
    let h = 0;
    for (const c of this.paper.children) {
      if (c === this.layer || !(c instanceof HTMLElement) || c.offsetParent === null) continue;
      h = Math.max(h, c.offsetTop + c.offsetHeight);
    }
    return h + parseFloat(getComputedStyle(this.paper).paddingBottom || '0');
  }

  private layout() {
    const p = this.paper;
    if (!p.clientWidth) return;
    this.pageH = Math.round(p.clientWidth * A4);
    const h = this.contentHeight();
    this.count = Math.max(1, Math.ceil((h - 24) / this.pageH));
    const folds: string[] = [];
    for (let k = 1; k < this.count; k++) {
      folds.push(`<div class="pages__fold" style="top:${k * this.pageH}px"><span class="micro">${esc(this.file)} · ${t('p. {n}', { n: k })} / ${this.count}</span></div>`);
    }
    this.layer.innerHTML = folds.join('');
    // the curl sits on the bottom edge of the sheet as it stands on the screen
    Object.assign(this.curl.style, {
      left: `${p.offsetLeft}px`,
      top: `${p.offsetTop + p.offsetHeight}px`,
      width: `${p.offsetWidth}px`,
    });
    this.track(false);
  }

  private track(byScroll: boolean) {
    const p = this.paper;
    if (!this.pageH) return;
    const n = Math.min(this.count, Math.floor((p.scrollTop + p.clientHeight * 0.55) / this.pageH) + 1);
    if (byScroll && n !== this.now) audio.leaf();
    this.now = n;
    const more = p.scrollTop + p.clientHeight < p.scrollHeight - 4;
    this.curl.classList.toggle('is-more', more);
    this.foot.textContent = `${this.file} · ${t('Page {n} of {m}', { n: pad2(n), m: pad2(this.count) })}`;
  }
}
