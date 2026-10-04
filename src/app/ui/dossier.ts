/** Right-hand dossier column for the record under inspection. */
import type { ArchiveRecord, Category } from '../types';
import { esc, swapText } from './text';
import { audio } from '../audio';

type Tab = 'overview' | 'record' | 'related';

export class Dossier {
  private el = document.getElementById('dossier')!;
  private tab: Tab = 'overview';
  private rec: ArchiveRecord | null = null;

  constructor(
    private records: ArchiveRecord[],
    private categories: Category[],
    private base: string,
    private go: (rec: ArchiveRecord) => void,
  ) {
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.show(b.dataset.tab as Tab)),
    );
    // Tapping a redaction lifts it (touch screens have no hover).
    this.el.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('.redact');
      if (r) r.classList.toggle('is-open');
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-file]');
      if (a && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const rec = this.records.find((x) => x.file === a.dataset.file);
        if (rec) this.go(rec);
      }
    });
    window.addEventListener('resize', () => this.moveBar());
  }

  fill(rec: ArchiveRecord, position: { index: number; total: number }) {
    const first = !this.rec;
    this.rec = rec;
    const $ = (id: string) => document.getElementById(id)!;
    const cat = this.categories.find((c) => c.id === rec.category)!;

    swapText($('ds-file'), `File ${rec.file}`);
    $('ds-title').textContent = rec.title;
    $('ds-sub').textContent = rec.subtitle ?? '';
    $('ds-count').textContent = `${String(position.index + 1).padStart(2, '0')} / ${String(position.total).padStart(2, '0')}`;
    swapText($('in-no'), `No.${rec.file.split('-')[1] ?? rec.file}`);
    $('in-cat').textContent = `${cat.label} / Internal archive`;

    const meta: [string, string, string?][] = [];
    if (rec.date) meta.push(['Date', esc(rec.date)]);
    if (rec.place) meta.push(['Place', esc(rec.place)]);
    meta.push(['Status', esc(rec.status)]);
    meta.push(['Classification', esc(rec.stamp), 'is-stamp']);
    for (const f of rec.fields) meta.push([f.label, f.value]);
    $('ds-meta').innerHTML = meta
      .map(([k, v, cls]) => `<div><dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd></div>`)
      .join('');

    $('ds-overview').innerHTML = `
      <div class="micro lede-label">Abstract</div>
      <p class="lede">${rec.summary}</p>
      ${rec.tags.length ? `<div class="tags">${rec.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
    $('ds-record').innerHTML = rec.body || '<p class="rel-empty">No further record on file.</p>';

    const rel = rec.related
      .map((f) => this.records.find((r) => r.file === f))
      .filter((r): r is ArchiveRecord => !!r);
    // Back-links: records that point at this one
    for (const r of this.records) {
      if (r.related.includes(rec.file) && !rel.includes(r)) rel.push(r);
    }
    $('ds-related').innerHTML = rel.length
      ? `<ul class="rel">${rel
          .map(
            (r) => `<li><a href="${this.base}records/${r.slug}/" data-file="${esc(r.file)}">
              <span class="rel__file">${esc(r.file)}</span>
              <span class="rel__title">${esc(r.title)}${r.subtitle ? `<small>${esc(r.subtitle)}</small>` : ''}</span>
              <span class="rel__cat">${esc(this.categories.find((c) => c.id === r.category)!.label)}</span>
            </a></li>`,
          )
          .join('')}</ul>`
      : '<p class="rel-empty">No linked records.</p>';
    (this.el.querySelector('[data-tab="related"]') as HTMLElement).lastChild!.textContent = `Related${rel.length ? ` (${rel.length})` : ''}`;

    this.show(first ? 'overview' : this.tab, true);
    document.getElementById('ds-scroll')!.scrollTop = 0;
  }

  show(tab: Tab, silent = false) {
    this.tab = tab;
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => {
      const on = p.dataset.pane === tab;
      p.hidden = !on;
      if (on) {
        p.classList.remove('is-decrypting');
        void p.offsetWidth;
        p.classList.add('is-decrypting');
      }
    });
    if (!silent) audio.flick();
    this.moveBar();
  }

  reset() {
    this.rec = null;
    this.tab = 'overview';
  }

  private moveBar() {
    const b = this.el.querySelector<HTMLElement>(`[data-tab="${this.tab}"]`);
    const bar = this.el.querySelector<HTMLElement>('.tabs__bar');
    if (!b || !bar) return;
    bar.style.width = `${b.offsetWidth}px`;
    bar.style.transform = `translateX(${b.offsetLeft}px)`;
  }
}
