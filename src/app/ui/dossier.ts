/** Right-hand dossier column for the record under inspection, with its draft history. */
import type { ArchiveRecord, Category } from '../types';
import { esc, swapText } from './text';
import { audio } from '../audio';
import { hash } from '../scene/textures';

type Tab = 'overview' | 'record' | 'related';

const DEFAULT_LABELS = ['', 'Field notes', 'Working copy', 'Classified', 'Reviewed', 'Amended', 'Amended', 'Rewritten', 'Pre-release review', 'Final, as filed'];

export interface DraftInfo {
  n: number;
  label: string;
  date?: string;
  by?: string;
  stamp: string;
  dated: boolean;
}

/** Resolve what draft `n` of a record looks like, filling gaps with sensible defaults. */
export function draftInfo(rec: ArchiveRecord, n: number): DraftInfo {
  if (n >= 9) return { n: 9, label: DEFAULT_LABELS[9], stamp: rec.stamp, dated: true };
  const exact = rec.drafts.find((d) => d.n === n);
  const prior = [...rec.drafts].filter((d) => d.n <= n && d.stamp).sort((a, b) => b.n - a.n)[0];
  const fallback = n <= 2 ? 'DRAFT' : rec.stamp === 'DECLASSIFIED' ? 'SECRET' : rec.stamp;
  return {
    n,
    label: exact?.label ?? DEFAULT_LABELS[n],
    date: exact?.date,
    by: exact?.by,
    stamp: prior?.stamp ?? fallback,
    dated: !!exact,
  };
}

/** Fake Code 39-ish barcode, deterministic per file number. */
function barcode(file: string) {
  let x = 0;
  let bars = '';
  let h = hash(file);
  for (let i = 0; i < 46; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const w = 1 + (h % 3);
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="20"/>`;
    x += w + (i % 2 ? 1 : 0);
  }
  return `<svg viewBox="0 0 ${x} 20" preserveAspectRatio="none" style="width:${x * 0.9}px">${bars}</svg>`;
}

const inRange = (spec: string | undefined, d: number) => {
  if (!spec) return false;
  const [a, b] = spec.split('-').map(Number);
  return d >= a && d <= (b || a);
};

export interface DossierHooks {
  go(rec: ArchiveRecord): void;
  draft(rec: ArchiveRecord, info: DraftInfo, byUser: boolean): void;
  reveal(): void;
}

export class Dossier {
  private el = document.getElementById('dossier')!;
  private tab: Tab = 'overview';
  private rec: ArchiveRecord | null = null;
  private draft = 9;
  private range = document.getElementById('dr-range') as HTMLInputElement;

  constructor(
    private records: ArchiveRecord[],
    private categories: Category[],
    private base: string,
    private hooks: DossierHooks,
  ) {
    this.el.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => this.show(b.dataset.tab as Tab)),
    );
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const r = t.closest('.redact, .rv.is-redacted');
      if (r) {
        r.classList.toggle('is-open');
        this.hooks.reveal();
      }
      const a = t.closest<HTMLAnchorElement>('a[data-file]');
      if (a && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const rec = this.records.find((x) => x.file === a.dataset.file);
        if (rec) this.hooks.go(rec);
      }
    });
    let hoverT = 0;
    this.el.addEventListener('pointerover', (e) => {
      if (!(e.target as HTMLElement).closest('.redact, .rv.is-redacted')) return;
      window.clearTimeout(hoverT);
      hoverT = window.setTimeout(() => this.hooks.reveal(), 650);
    });
    this.el.addEventListener('pointerout', () => window.clearTimeout(hoverT));
    this.range.addEventListener('input', () => this.setDraft(Number(this.range.value), true));
    window.addEventListener('resize', () => this.moveBar());
  }

  get current() {
    return this.rec;
  }

  fill(rec: ArchiveRecord, position: { index: number; total: number }) {
    const first = !this.rec;
    this.rec = rec;
    const $ = (id: string) => document.getElementById(id)!;
    const cat = this.categories.find((c) => c.id === rec.category)!;

    swapText($('ds-file'), `File ${rec.file}`);
    $('ds-barcode').innerHTML = barcode(rec.file);
    $('ds-title').textContent = rec.title;
    $('ds-title').dataset.category = rec.category;
    $('ds-sub').textContent = rec.subtitle ?? '';
    $('ds-count').textContent = `${String(position.index + 1).padStart(2, '0')} / ${String(position.total).padStart(2, '0')}`;
    const num = rec.file.split('-')[1] ?? rec.file;
    swapText($('in-no'), `No.${num}`);
    swapText($('watermark'), num);
    $('in-cat').textContent = `${cat.label} / Internal archive`;

    const meta: [string, string, string?][] = [];
    if (rec.date) meta.push(['Date', esc(rec.date)]);
    if (rec.place) meta.push(['Place', esc(rec.place)]);
    meta.push(['Status', esc(rec.status)]);
    meta.push(['Classification', `<span id="ds-stamp">${esc(rec.stamp)}</span>`, 'is-stamp']);
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

    // Draft history
    const bar = $('drafts');
    bar.hidden = !rec.revised;
    $('dr-marks').innerHTML = Array.from({ length: 9 }, (_, i) => {
      const d = draftInfo(rec, i + 1);
      return `<i class="${d.dated || i === 8 || i === 0 ? 'is-dated' : ''}" style="left:${(i / 8) * 100}%"></i>`;
    }).join('');
    this.draft = 9;
    this.range.value = '9';
    this.setDraft(9, false);

    this.show(first ? 'overview' : this.tab, true);
    document.getElementById('ds-scroll')!.scrollTop = 0;
  }

  /** Show the record as it read in draft `n`. */
  setDraft(n: number, byUser: boolean) {
    const rec = this.rec;
    if (!rec) return;
    const changed = n !== this.draft;
    this.draft = n;
    this.range.value = String(n);
    this.el.querySelectorAll<HTMLElement>('.rv').forEach((s) => {
      const add = s.dataset.add ? Number(s.dataset.add) : 0;
      const del = s.dataset.del ? Number(s.dataset.del) : 0;
      s.classList.toggle('is-gone', (add > 0 && n < add) || (del > 0 && n > del));
      s.classList.toggle('is-new', add > 0 && n === add && n < 9);
      s.classList.toggle('is-struck', del > 0 && n === del);
      s.classList.toggle('is-redacted', inRange(s.dataset.redact, n));
    });
    this.el.querySelectorAll<HTMLElement>('.rv-note').forEach((s) => s.classList.toggle('is-gone', !inRange(s.dataset.note, n)));

    const info = draftInfo(rec, n);
    const $ = (id: string) => document.getElementById(id)!;
    $('dr-no').textContent = String(n).padStart(2, '0');
    $('dr-log').textContent = [info.label, info.date, info.by].filter(Boolean).join(' · ');
    $('dr-cur').style.left = `${((n - 1) / 8) * 100}%`;
    const st = document.getElementById('ds-stamp');
    if (st) st.textContent = info.stamp;
    if (byUser && changed) audio.flick();
    this.hooks.draft(rec, info, byUser && changed);
  }

  stepDraft(d: number) {
    if (!this.rec?.revised) return;
    const n = Math.max(1, Math.min(9, this.draft + d));
    if (n !== this.draft) this.setDraft(n, true);
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
