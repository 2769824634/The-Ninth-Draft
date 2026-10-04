/** Archive index: full-text filter over titles, files, fields and body. */
import type { ArchiveRecord, Category } from '../types';
import { esc } from './text';
import { audio } from '../audio';
import { t } from '../i18n';

const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');

export class Search {
  private el = document.getElementById('search')!;
  private input = document.getElementById('search-input') as HTMLInputElement;
  private list = document.getElementById('search-list')!;
  private count = document.getElementById('search-count')!;
  private results: ArchiveRecord[] = [];
  private cursor = 0;
  private index: { rec: ArchiveRecord; hay: string }[];
  private lastFocus: HTMLElement | null = null;
  private emptyT = 0;

  constructor(records: ArchiveRecord[], private categories: Category[], private base: string, private open: (rec: ArchiveRecord) => void, private onEmpty: () => void = () => {}) {
    // Both languages are searchable, whichever one is showing
    this.index = records.map((rec) => ({
      rec,
      hay: [rec.en ?? rec, rec.zh]
        .flatMap((x) => (x ? [x.title, x.subtitle, x.date, x.place, x.status, ...x.tags, ...x.fields.map((f) => `${f.label} ${strip(f.value)}`), strip(x.summary), strip(x.body)] : []))
        .concat(rec.file, rec.stamp)
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }));
    this.input.addEventListener('input', () => this.run());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const r = this.results[this.cursor];
        if (r) this.choose(r);
      } else if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    this.list.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-file]');
      if (!a || e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      const r = this.results.find((x) => x.file === a.dataset.file);
      if (r) this.choose(r);
    });
    document.getElementById('search-close')!.addEventListener('click', () => this.close());
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.close();
    });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  show() {
    this.lastFocus = document.activeElement as HTMLElement;
    this.el.hidden = false;
    this.input.value = '';
    this.run();
    audio.flick();
    this.input.focus();
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.lastFocus?.focus?.();
  }

  private choose(r: ArchiveRecord) {
    this.close();
    this.open(r);
  }

  private run() {
    const q = this.input.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    this.results = this.index.filter((x) => terms.every((t) => x.hay.includes(t))).map((x) => x.rec);
    this.cursor = 0;
    window.clearTimeout(this.emptyT);
    if (q && !this.results.length) this.emptyT = window.setTimeout(() => this.onEmpty(), 900);
    const n = this.results.length;
    this.count.textContent = q ? t(n === 1 ? '{n} record matches' : '{n} records match', { n }) : t('{n} records in the archive', { n });
    const mark = (s: string) => {
      let out = esc(s);
      for (const t of terms) {
        const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
        out = out.replace(re, '<mark>$1</mark>');
      }
      return out;
    };
    this.list.innerHTML = this.results
      .map(
        (r, i) => `<li><a href="${this.base}records/${r.slug}/" data-file="${esc(r.file)}" aria-selected="${i === 0}">
          <span class="rel__file">${mark(r.file)}</span>
          <span class="rel__title">${mark(r.title)}${r.subtitle ? `<small>${mark(r.subtitle)}</small>` : ''}</span>
          <span class="rel__cat">${esc(t(this.categories.find((c) => c.id === r.category)!.label))}</span>
        </a></li>`,
      )
      .join('');
  }

  private move(d: number) {
    if (!this.results.length) return;
    this.cursor = (this.cursor + d + this.results.length) % this.results.length;
    this.list.querySelectorAll('a').forEach((a, i) => a.setAttribute('aria-selected', String(i === this.cursor)));
    this.list.querySelectorAll('a')[this.cursor]?.scrollIntoView({ block: 'nearest' });
    audio.tick();
  }
}
