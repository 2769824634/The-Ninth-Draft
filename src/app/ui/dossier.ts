/** Right-hand dossier column for the record under inspection, with its draft history. */
import type { ArchiveRecord, Category } from '../types';
import { esc, swapText } from './text';
import { audio } from '../audio';
import { hash, loadPhoto } from '../scene/textures';
import { halftone, hasPortrait } from '../scene/halftone';
import { attachmentsHtml, paintNegatives, showDraft } from './attachments';
import { t } from '../i18n';
import { reducedMotion } from '../prefs';

type Tab = 'overview' | 'record' | 'related' | 'attachments';

const pad2 = (n: number) => String(n).padStart(2, '0');

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
  if (n >= 9) return { n: 9, label: t(DEFAULT_LABELS[9]), stamp: rec.stamp, dated: true };
  const exact = rec.drafts.find((d) => d.n === n);
  const prior = [...rec.drafts].filter((d) => d.n <= n && d.stamp).sort((a, b) => b.n - a.n)[0];
  const fallback = n <= 2 ? 'DRAFT' : rec.stamp === 'DECLASSIFIED' ? 'SECRET' : rec.stamp;
  return {
    n,
    label: exact?.label ?? t(DEFAULT_LABELS[n]),
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
  wall(rec: ArchiveRecord): void;
  draft(rec: ArchiveRecord, info: DraftInfo, byUser: boolean): void;
  reveal(): void;
}

export class Dossier {
  private el = document.getElementById('dossier')!;
  private tab: Tab = 'overview';
  private rec: ArchiveRecord | null = null;
  private draft = 9;
  private range = document.getElementById('dr-range') as HTMLInputElement;
  private scroller = document.getElementById('ds-scroll')!;
  private thumb = document.getElementById('ds-thumb')!;
  /** Drafts in which Heuss left at least one margin note. */
  noteDrafts: number[] = [];

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
      const clip = t.closest<HTMLElement>('.clip');
      if (clip && !r) {
        const up = !clip.classList.contains('is-lifted');
        this.el.querySelectorAll('.clip.is-lifted').forEach((c) => c.classList.remove('is-lifted'));
        clip.classList.toggle('is-lifted', up);
        audio.paper();
        return;
      }
      const w = t.closest<HTMLAnchorElement>('a[data-wall]');
      if (w && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (this.rec) this.hooks.wall(this.rec);
        return;
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
    window.addEventListener('resize', () => {
      this.moveBar();
      this.moveThumb();
    });
    this.scroller.addEventListener('scroll', () => this.moveThumb(), { passive: true });
  }

  /** Every draft number covered by a margin note's range. */
  private findNoteDrafts() {
    const out = new Set<number>();
    this.el.querySelectorAll<HTMLElement>('.rv-note').forEach((n) => {
      for (let d = 1; d <= 9; d++) if (inRange(n.dataset.note, d)) out.add(d);
    });
    return [...out].sort((a, b) => a - b);
  }

  /** "drafts 03–05" style span for the hint line. */
  noteSpan() {
    const d = this.noteDrafts;
    if (!d.length) return '';
    return d.length === 1 ? t('draft {n}', { n: pad2(d[0]) }) : t('drafts {a}–{b}', { a: pad2(d[0]), b: pad2(d[d.length - 1]) });
  }

  /** Slim position line beside the scrolling pane (the native bar is hidden). */
  private moveThumb() {
    const s = this.scroller;
    const over = s.scrollHeight - s.clientHeight;
    this.thumb.classList.toggle('is-on', over > 4);
    if (over <= 4) return;
    const h = Math.max(24, (s.clientHeight * s.clientHeight) / s.scrollHeight);
    this.thumb.style.top = `${s.offsetTop + (s.scrollTop / over) * (s.clientHeight - h)}px`;
    this.thumb.style.height = `${h}px`;
  }

  /**
   * Reveal the dossier top-down as the retrieval bar fills: `p` = 0..1.
   * Each block is clipped at the same moving line, with a scan rule riding it.
   */
  reveal(p: number) {
    const blocks = this.el.querySelectorAll<HTMLElement>('.dossier__crumbs, .dossier__title, .dossier__sub, .dossier__meta, .tabs, .dossier__scroll, .dossier__foot');
    const scan = this.el.querySelector<HTMLElement>('.dossier__scan')!;
    if (p >= 1) {
      blocks.forEach((b) => (b.style.clipPath = ''));
      scan.classList.remove('is-on');
      return;
    }
    const box = this.el.getBoundingClientRect();
    const first = blocks[0].getBoundingClientRect().top, last = blocks[blocks.length - 1].getBoundingClientRect().bottom;
    const line = first + (last - first) * p;
    blocks.forEach((b) => {
      const r = b.getBoundingClientRect();
      const cut = Math.max(0, Math.min(r.height, r.bottom - line));
      // a little overdraw so descenders and focus rings are not shaved
      b.style.clipPath = `inset(-4px -8px ${cut}px -8px)`;
    });
    scan.classList.add('is-on');
    scan.style.transform = `translateY(${line - box.top}px)`;
  }

  get current() {
    return this.rec;
  }

  /** Redraw the open file in the current language, keeping tab, draft and scroll. */
  relang() {
    const rec = this.rec;
    if (!rec) return;
    const d = this.draft, top = this.scroller.scrollTop;
    this.fill(rec, this.pos);
    if (d !== 9) this.setDraft(d, false);
    this.scroller.scrollTop = top;
  }

  private pos = { index: 0, total: 0 };

  fill(rec: ArchiveRecord, position: { index: number; total: number }) {
    const first = !this.rec;
    this.rec = rec;
    this.pos = position;
    const $ = (id: string) => document.getElementById(id)!;
    const cat = this.categories.find((c) => c.id === rec.category)!;

    swapText($('ds-file'), t('File {file}', { file: rec.file }));
    $('ds-spine').textContent = `Archive terminal // Gerimis // ${cat.code}-${rec.file.split('-')[1] ?? rec.file} // ${rec.stamp}`;
    $('ds-barcode').innerHTML = barcode(rec.file);
    $('ds-title').textContent = rec.title;
    $('ds-title').dataset.category = rec.category;
    $('ds-sub').textContent = rec.subtitle ?? '';
    $('ds-count').textContent = `${String(position.index + 1).padStart(2, '0')} / ${String(position.total).padStart(2, '0')}`;
    const num = rec.file.split('-')[1] ?? rec.file;
    swapText($('in-no'), `No.${num}`);
    swapText($('watermark'), num);
    $('in-cat').textContent = t('{category} / Internal archive', { category: t(cat.label) });

    const meta: [string, string, string?][] = [];
    if (rec.date) meta.push([t('Date'), esc(rec.date)]);
    if (rec.place) meta.push([t('Place'), esc(rec.place)]);
    meta.push([t('Status'), esc(t(rec.status))]);
    meta.push([t('Classification'), `<span id="ds-stamp">${esc(rec.stamp)}</span>`, 'is-stamp']);
    for (const f of rec.fields) meta.push([f.label, f.value]);
    $('ds-meta').innerHTML = meta
      .map(([k, v, cls]) => `<div><dt>${k}</dt><dd${cls ? ` class="${cls}"` : ''}>${v}</dd></div>`)
      .join('');

    $('ds-overview').innerHTML = `
      ${hasPortrait(rec) ? `<figure class="portrait"><span class="portrait__frame"></span><figcaption class="micro">${esc(rec.imageCaption ?? (rec.image ? rec.file : t('No photograph on file · Composite')))}</figcaption></figure>` : ''}
      <div class="micro lede-label">${t('Abstract')}</div>
      <p class="lede">${rec.summary}</p>
      ${rec.tags.length ? `<div class="tags">${rec.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}`;
    if (hasPortrait(rec)) void this.portrait(rec);
    $('ds-attach').innerHTML = attachmentsHtml(rec);
    (this.el.querySelector('[data-tab="attachments"]') as HTMLElement).lastChild!.textContent = t('Attached ({n})', { n: rec.attachments.length + 1 });
    void paintNegatives($('ds-attach'), rec, () => this.rec === rec);
    $('ds-record').innerHTML = rec.body || `<p class="rel-empty">${t('No further record on file.')}</p>`;

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
              <span class="rel__cat">${esc(t(this.categories.find((c) => c.id === r.category)!.label))}</span>
            </a></li>`,
          )
          .join('')}</ul>`
      : `<p class="rel-empty">${t('No linked records.')}</p>`;
    $('ds-related').insertAdjacentHTML('beforeend', `<a class="rel-wall" href="${this.base}wall/" data-wall>${t('Show on the link wall')} <span class="kbd">W</span></a>`);
    (this.el.querySelector('[data-tab="related"]') as HTMLElement).lastChild!.textContent = rel.length ? t('Related ({n})', { n: rel.length }) : t('Related');

    // Draft history
    const bar = $('drafts');
    bar.hidden = !rec.revised;
    $('dr-marks').innerHTML = Array.from({ length: 9 }, (_, i) => {
      const d = draftInfo(rec, i + 1);
      return `<i class="${d.dated || i === 8 || i === 0 ? 'is-dated' : ''}" style="left:${(i / 8) * 100}%"></i>`;
    }).join('');
    this.noteDrafts = this.findNoteDrafts();
    $('dr-marks').querySelectorAll('i').forEach((m, i) => m.classList.toggle('has-note', this.noteDrafts.includes(i + 1)));
    this.draft = 9;
    this.range.value = '9';
    this.setDraft(9, false);

    this.show(first ? 'overview' : this.tab, true);
    document.getElementById('ds-scroll')!.scrollTop = 0;
    requestAnimationFrame(() => this.moveThumb());
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
    showDraft(this.el, n);
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => {
      const pane = this.el.querySelector(`[data-pane="${b.dataset.tab}"]`);
      b.classList.toggle('has-note', !!pane?.querySelector('.rv-note:not(.is-gone)'));
    });
    const hint = document.getElementById('dr-hint')!;
    hint.hidden = !this.noteDrafts.length;
    if (this.noteDrafts.length) {
      const here = this.noteDrafts.includes(n);
      const where = [...this.el.querySelectorAll<HTMLElement>('[data-tab].has-note')].map((b) => b.lastChild!.textContent!.replace(/\s*[（(].*/, ''));
      hint.classList.toggle('is-here', here);
      hint.innerHTML = here
        ? `<b>Heuss</b> ${t('annotated this draft')}${where.length ? ` · ${t('see {tabs}', { tabs: where.join(t(', ')) })}` : ''}`
        : `<b>Heuss</b> ${t('left margin notes in {drafts}', { drafts: this.noteSpan() })}`;
    }

    const info = draftInfo(rec, n);
    const $ = (id: string) => document.getElementById(id)!;
    $('dr-no').textContent = String(n).padStart(2, '0');
    $('dr-log').textContent = [info.label, info.date, info.by].filter(Boolean).join(' · ');
    $('dr-cur').style.left = `${((n - 1) / 8) * 100}%`;
    const st = document.getElementById('ds-stamp');
    if (st) st.textContent = info.stamp;
    if (byUser && changed) {
      audio.flick();
      this.follow(n);
    }
    this.hooks.draft(rec, info, byUser && changed);
  }

  /**
   * The slider turns the page: bring up what changed in draft `n` (a line
   * added, struck, blacked out, a margin note, a paper clipped on), switching
   * tab when the change lives in another one, and mark it for a moment.
   */
  private follow(n: number) {
    const start = (spec: string | undefined) => Number((spec ?? '').split('-')[0]) || 0;
    const end = (spec: string | undefined) => {
      const [a, b] = (spec ?? '').split('-');
      return Number(b ?? 9) || Number(a) || 0;
    };
    const changes = [...this.el.querySelectorAll<HTMLElement>('.rv, .rv-note, .clip[data-draft], .slip__rows tr[data-draft]')].filter((el) => {
      const d = el.dataset;
      if (el.classList.contains('rv-note')) return inRange(d.note, n);
      if (d.add) return Number(d.add) === n;
      if (d.del) return Number(d.del) === n;
      if (d.redact) return start(d.redact) === n || end(d.redact) + 1 === n;
      return Number(d.draft) === n;
    });
    const log = document.getElementById('dr-log')!;
    this.el.querySelectorAll('.is-focus').forEach((el) => el.classList.remove('is-focus'));
    if (!changes.length) {
      log.textContent = [log.textContent, t('No changes in this draft')].filter(Boolean).join(' · ');
      return;
    }
    // Stay on the current tab when it has a change; otherwise go where the change is
    const paneOf = (el: HTMLElement) => el.closest<HTMLElement>('[data-pane]')?.dataset.pane as Tab | undefined;
    const here = changes.filter((el) => paneOf(el) === this.tab);
    const target = here[0] ?? changes[0];
    const tab = paneOf(target);
    if (tab && tab !== this.tab) this.show(tab, true);
    const marked = changes.filter((el) => paneOf(el) === tab);
    void this.el.offsetWidth;
    marked.forEach((el) => el.classList.add('is-focus'));
    requestAnimationFrame(() => {
      // On phones the whole dossier is one scrolling column
      const sc = this.scroller.scrollHeight > this.scroller.clientHeight + 1 ? this.scroller : this.el;
      const box = target.getBoundingClientRect();
      const view = sc.getBoundingClientRect();
      const bar = sc === this.el ? document.getElementById('drafts')!.offsetHeight : 0;
      if (box.top >= view.top + 24 && box.bottom <= view.bottom - bar - 24) return;
      const top = sc.scrollTop + box.top - view.top - (view.height - bar) * 0.3;
      sc.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
    });
  }

  private async portrait(rec: ArchiveRecord) {
    const photo = rec.image ? await loadPhoto(rec.image) : null;
    const frame = document.querySelector<HTMLElement>('#ds-overview .portrait__frame');
    if (!frame || this.rec !== rec) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = halftone(photo, rec.file, 168 * dpr, 210 * dpr);
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', photo ? t('Photograph, {title}', { title: rec.title }) : t('No photograph of {title} on file', { title: rec.title }));
    frame.replaceChildren(c);
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
    this.scroller.scrollTop = 0;
    requestAnimationFrame(() => this.moveThumb());
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
