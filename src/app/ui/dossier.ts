/**
 * The paper reader: the open file laid out as one sheet, read top to bottom
 * (abstract, record, what is clipped to it). A revised file has its earlier
 * drafts lying underneath; their tabs stick out past the sheet's edge, and
 * lifting one shows the file as it read then, with the changes ringed in red.
 * File numbers in the text open a small reference slip before going anywhere.
 */
import type { ArchiveRecord, Category } from '../types';
import { esc, swapText } from './text';
import { audio } from '../audio';
import { hash, loadPhoto } from '../scene/textures';
import { halftone, hasPortrait } from '../scene/halftone';
import { attachmentsHtml, paintNegatives, showDraft } from './attachments';
import { peel } from './peel';
import { Pages } from './pages';
import { isZh, t } from '../i18n';
import { reducedMotion } from '../prefs';
import { isFiled } from '../island';

const pad2 = (n: number) => String(n).padStart(2, '0');

const DEFAULT_LABELS = ['', 'Field notes', 'Working copy', 'Classified', 'Reviewed', 'Amended', 'Amended', 'Rewritten', 'Pre-release review', 'Final, as filed'];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "1999-05-14" → "14 May 1999" / "1999 年 5 月 14 日"; anything else as written. */
const longDate = (s?: string) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return isZh() ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

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

/** How a marked passage reads in draft `n`. */
function stateAt(s: HTMLElement, n: number) {
  const add = Number(s.dataset.add) || 0;
  const del = Number(s.dataset.del) || 0;
  return {
    gone: (add > 0 && n < add) || (del > 0 && n > del),
    struck: del > 0 && n === del,
    redacted: inRange(s.dataset.redact, n),
  };
}

/** Plain text of a fragment as filed: notes and struck lines dropped, black bars kept black. */
function plain(html: string) {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('.rv-note, .rv[data-del]').forEach((x) => x.remove());
  d.querySelectorAll<HTMLElement>('.redact, .rv[data-redact]').forEach((x) => {
    const n = x.dataset.redact;
    if (!n || inRange(n, 9)) x.textContent = '█'.repeat(Math.max(3, Math.min(12, (x.textContent ?? '').length)));
  });
  return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const CITE = /\b([PER])-(\d{4})\b/g;

/** Set a fragment of a record's text as it reads in the final: struck, added and blacked-out passages, notes. */
export function asFiled(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('.rv').forEach((s) => {
    const now = stateAt(s, 9);
    s.classList.toggle('is-gone', now.gone);
    s.classList.toggle('is-redacted', now.redacted);
  });
  el.querySelectorAll<HTMLElement>('.rv-note').forEach((s) => s.classList.toggle('is-gone', !inRange(s.dataset.note, 9)));
  showDraft(el, 9);
}

export interface DossierHooks {
  /** A file named in the text, taken up from its slip: walk over and take it out. */
  go(rec: ArchiveRecord): void;
  /** Where a named file is now, for its slip; and whether it is on the table with this one. */
  place(rec: ArchiveRecord): { where: string; onTable: boolean };
  /** Lay a file on the table beside this one. */
  pair(rec: ArchiveRecord): void;
  wall(rec: ArchiveRecord): void;
  draft(rec: ArchiveRecord, info: DraftInfo, byUser: boolean): void;
  reveal(): void;
}

export class Dossier {
  private el = document.getElementById('dossier')!;
  private paper = document.getElementById('ds-scroll')!;
  private sheaf = document.getElementById('ds-sheaf')!;
  private slip = document.getElementById('ds-slip')!;
  private pages = new Pages(this.paper);
  private rec: ArchiveRecord | null = null;
  private draft = 9;
  /** The earlier drafts lying under this file, oldest first. */
  private sheets: number[] = [];
  /** Drafts in which Heuss left at least one margin note. */
  noteDrafts: number[] = [];

  constructor(
    private records: ArchiveRecord[],
    private categories: Category[],
    private base: string,
    private hooks: DossierHooks,
  ) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const tab = t.closest<HTMLButtonElement>('[data-sheet]');
      if (tab) {
        this.setDraft(Number(tab.dataset.sheet), true);
        return;
      }
      const cite = t.closest<HTMLAnchorElement>('a.cite');
      if (cite && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        this.openSlip(cite);
        return;
      }
      if (t.closest('[data-slip-close]')) {
        this.closeSlip();
        return;
      }
      const go = t.closest<HTMLAnchorElement>('a[data-go]');
      if (go && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const rec = this.records.find((x) => x.file === go.dataset.go);
        this.closeSlip();
        if (rec) (go.dataset.pair ? this.hooks.pair : this.hooks.go)(rec);
        return;
      }
      const r = t.closest('.redact, .rv.is-redacted');
      if (r) {
        r.classList.toggle('is-open');
        this.hooks.reveal();
      }
      const clip = t.closest<HTMLElement>('.clip');
      if (clip && !r && !t.closest('a')) {
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
      }
    });
    // a click anywhere else puts the slip down
    document.addEventListener('pointerdown', (e) => {
      if (this.slip.hidden) return;
      const t = e.target as HTMLElement;
      if (!t.closest('#ds-slip, a.cite')) this.closeSlip();
    });
    this.paper.addEventListener('scroll', () => this.closeSlip(), { passive: true });
    let hoverT = 0;
    this.el.addEventListener('pointerover', (e) => {
      if (!(e.target as HTMLElement).closest('.redact, .rv.is-redacted')) return;
      window.clearTimeout(hoverT);
      hoverT = window.setTimeout(() => this.hooks.reveal(), 650);
    });
    this.el.addEventListener('pointerout', () => window.clearTimeout(hoverT));
  }

  /** Every draft number covered by a margin note's range. */
  private findNoteDrafts() {
    const out = new Set<number>();
    this.paper.querySelectorAll<HTMLElement>('.rv-note').forEach((n) => {
      for (let d = 1; d <= 9; d++) if (inRange(n.dataset.note, d)) out.add(d);
    });
    return [...out].sort((a, b) => a - b);
  }

  /** "drafts 03–05" style span for the archivist's tip. */
  noteSpan() {
    const d = this.noteDrafts.filter((n) => n === 9 || this.sheets.includes(n));
    if (!d.length) return '';
    return d.length === 1 ? t('draft {n}', { n: pad2(d[0]) }) : t('drafts {a}–{b}', { a: pad2(d[0]), b: pad2(d[d.length - 1]) });
  }

  /**
   * Which earlier drafts lie under the final: the ones the file names (and
   * whose day has come), or else the drafts in which the text changed. A
   * margin note that would otherwise never be seen brings its draft along.
   */
  private findSheets(rec: ArchiveRecord) {
    if (!rec.revised) return [];
    const named = rec.drafts.filter((d) => d.n < 9 && isFiled(d.date)).map((d) => d.n);
    const out = new Set<number>(named);
    if (!named.length) {
      this.paper.querySelectorAll<HTMLElement>('.rv').forEach((s) => {
        const n = Number(s.dataset.add || s.dataset.del || (s.dataset.redact ?? '').split('-')[0]) || 0;
        if (n > 0 && n < 9) out.add(n);
      });
    }
    this.paper.querySelectorAll<HTMLElement>('.rv-note').forEach((s) => {
      const [a, b] = (s.dataset.note ?? '').split('-').map(Number);
      const to = b || a;
      if (a && a < 9 && to < 9 && ![...out].some((n) => n >= a && n <= to)) out.add(a);
    });
    // a draft whose day has not come yet is not in the file
    const future = new Set(rec.drafts.filter((d) => !isFiled(d.date)).map((d) => d.n));
    return [...out].filter((n) => !future.has(n)).sort((a, b) => a - b);
  }

  /**
   * Reveal the sheet top-down as the retrieval bar fills: `p` = 0..1,
   * with a scan rule riding the cut.
   */
  reveal(p: number) {
    const scan = this.el.querySelector<HTMLElement>('.dossier__scan')!;
    const sheaf = this.sheaf;
    if (p >= 1) {
      this.paper.style.clipPath = '';
      sheaf.style.clipPath = '';
      scan.classList.remove('is-on');
      return;
    }
    const box = this.el.getBoundingClientRect();
    const r = this.paper.getBoundingClientRect();
    const cut = Math.max(0, r.height * (1 - p));
    this.paper.style.clipPath = `inset(0 -12px ${cut}px -12px)`;
    sheaf.style.clipPath = `inset(0 -40px ${cut}px -40px)`;
    scan.classList.add('is-on');
    scan.style.transform = `translateY(${r.top - box.top + r.height * p}px)`;
  }

  get current() {
    return this.rec;
  }

  /** Redraw the open file in the current language, keeping the draft and the scroll. */
  relang() {
    const rec = this.rec;
    if (!rec) return;
    const d = this.draft, top = this.paper.scrollTop;
    this.fill(rec, this.pos);
    if (d !== 9 && this.sheets.includes(d)) this.setDraft(d, false);
    this.paper.scrollTop = top;
  }

  private pos = { index: 0, total: 0 };

  fill(rec: ArchiveRecord, position: { index: number; total: number }) {
    this.rec = rec;
    this.pos = position;
    this.closeSlip();
    const $ = (id: string) => document.getElementById(id)!;
    const cat = this.categories.find((c) => c.id === rec.category)!;

    swapText($('ds-file'), t('File {file}', { file: rec.file }));
    this.pages.set(rec.file);
    $('ds-spine').textContent = `Archive terminal // Gerimis // ${cat.code}-${rec.file.split('-')[1] ?? rec.file} // ${rec.stamp}`;
    $('ds-barcode').innerHTML = barcode(rec.file);
    $('ds-title').textContent = rec.title;
    $('ds-title').dataset.category = rec.category;
    $('ds-sub').textContent = rec.subtitle ?? '';
    $('ds-count').textContent = `${pad2(position.index + 1)} / ${pad2(position.total)}`;
    const num = rec.file.split('-')[1] ?? rec.file;
    swapText($('in-no'), `No.${num}`);
    swapText($('watermark'), num);
    $('in-cat').textContent = t('{category} / Internal archive', { category: t(cat.label) });

    const meta: [string, string, string?][] = [];
    if (rec.date) meta.push([t('Date'), esc(longDate(rec.date) ?? rec.date)]);
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
      ${rec.tags.length ? `<div class="tags">${rec.tags.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}`;
    if (hasPortrait(rec)) void this.portrait(rec);
    $('ds-record').innerHTML = rec.body ? `<div class="micro lede-label">${t('Record')}</div>${rec.body}` : '';
    $('ds-attach').innerHTML = attachmentsHtml(rec);
    void paintNegatives($('ds-attach'), rec, () => this.rec === rec);

    // Files that name this one, or that it names: a line at the foot of the page, not a list
    const rel = rec.related.map((f) => this.records.find((r) => r.file === f)).filter((r): r is ArchiveRecord => !!r);
    for (const r of this.records) if (r.related.includes(rec.file) && !rel.includes(r)) rel.push(r);
    $('ds-see').innerHTML =
      (rel.length ? `<span class="micro">${t('See also')}</span> ${rel.map((r) => esc(r.file)).join(' · ')}` : '') +
      `<a class="rel-wall" href="${this.base}wall/" data-wall>${t('Show on the link wall')} <span class="kbd">W</span></a>`;

    this.cite(rec);

    // The drafts underneath
    this.noteDrafts = this.findNoteDrafts();
    this.sheets = this.findSheets(rec);
    this.sheaf.hidden = !this.sheets.length;
    this.el.dataset.sheets = String(Math.min(3, this.sheets.length));
    this.draft = 9;
    this.drawSheaf();
    this.setDraft(9, false);
    this.paper.scrollTop = 0;
  }

  /** File numbers in the text become reference marks that open a slip. */
  private cite(rec: ArchiveRecord) {
    const walker = document.createTreeWalker(this.paper, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        (n.parentElement?.closest('a, button, .dossier__crumbs, .barcode') ? NodeFilter.FILTER_REJECT : /\b[PER]-\d{4}\b/.test(n.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const node of nodes) {
      CITE.lastIndex = 0;
      const text = node.nodeValue ?? '';
      const frag = document.createDocumentFragment();
      let at = 0;
      for (const m of text.matchAll(CITE)) {
        frag.append(text.slice(at, m.index));
        const file = m[0];
        const r = this.records.find((x) => x.file === file);
        if (file === rec.file) frag.append(file);
        else if (r) {
          const a = document.createElement('a');
          a.className = 'cite';
          a.href = `${this.base}records/${r.slug}/`;
          a.dataset.cite = file;
          a.textContent = file;
          frag.append(a);
        } else {
          const s = document.createElement('span');
          s.className = 'cite cite--none';
          s.title = t('Not on file yet');
          s.textContent = file;
          frag.append(s);
        }
        at = (m.index ?? 0) + file.length;
      }
      frag.append(text.slice(at));
      node.replaceWith(frag);
    }
  }

  private drawSheaf() {
    const tabs = [9, ...[...this.sheets].reverse()];
    this.sheaf.innerHTML = tabs
      .map((n, i) => {
        const info = draftInfo(this.rec!, n);
        const label = n === 9 ? t('Final') : `${t('Draft {n}', { n: pad2(n) })}`;
        const sub = n === 9 ? t('As filed') : [info.label, longDate(info.date)].filter(Boolean).join(' · ');
        return `<button type="button" class="sheaf__tab${this.noteDrafts.includes(n) ? ' has-note' : ''}" data-sheet="${n}" style="--i:${i}" aria-pressed="${n === this.draft}"><b>${esc(label)}</b><span>${esc(sub)}</span></button>`;
      })
      .join('');
  }

  /** Lift draft `n` to the top of the pile (9 = the final). */
  setDraft(n: number, byUser: boolean) {
    const rec = this.rec;
    if (!rec) return;
    if (n !== 9 && !this.sheets.includes(n)) n = 9;
    const changed = n !== this.draft;
    const was = this.draft;
    this.draft = n;
    const apply = () => this.paintDraft(rec, n);
    // by hand, the top sheet is turned back by its corner (or laid down again)
    if (byUser && changed) {
      this.closeSlip();
      // once the sheet is off, bring the first ringed change into view
      peel(this.paper, apply, n > was, () => this.toChange());
    } else apply();
    const info = draftInfo(rec, n);
    this.hooks.draft(rec, info, byUser && changed);
  }

  /** Put draft `n` on the paper: what it struck, added, blacked out, and its head. */
  private paintDraft(rec: ArchiveRecord, n: number) {
    const old = n < 9;
    this.paper.querySelectorAll<HTMLElement>('.rv').forEach((s) => {
      const now = stateAt(s, n), fin = stateAt(s, 9);
      s.classList.toggle('is-gone', now.gone);
      s.classList.toggle('is-struck', old && now.struck);
      s.classList.toggle('is-redacted', now.redacted);
      // ringed in red: what this draft changed, and what the final later changed
      const added = old && Number(s.dataset.add) === n;
      s.classList.toggle('is-new', added);
      s.classList.toggle('is-diff', old && !now.gone && !added && !now.struck && (fin.gone !== now.gone || fin.redacted !== now.redacted));
    });
    this.paper.querySelectorAll<HTMLElement>('.rv-note').forEach((s) => s.classList.toggle('is-gone', !inRange(s.dataset.note, n)));
    showDraft(this.paper, n);

    const info = draftInfo(rec, n);
    const head = document.getElementById('ds-old')!;
    head.hidden = !old;
    head.innerHTML = old
      ? `<b>${esc(t('Draft {n}', { n: pad2(n) }))}</b> · ${esc([info.label, longDate(info.date), info.by].filter(Boolean).join(' · '))} · <button type="button" data-sheet="9">${esc(t('Back to the final'))}</button>`
      : '';
    const st = document.getElementById('ds-stamp');
    if (st) st.textContent = info.stamp;
    this.el.dataset.draft = old ? 'old' : 'final';
    this.sheaf.querySelectorAll<HTMLElement>('[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sheet) === n)));
  }

  /** Bring the first ringed change into view if none is showing. */
  private toChange() {
    const marks = [...this.paper.querySelectorAll<HTMLElement>('.rv.is-new, .rv.is-struck, .rv.is-diff, .rv-note:not(.is-gone)')];
    if (!marks.length) return;
    const view = this.paper.getBoundingClientRect();
    if (marks.some((m) => {
      const r = m.getBoundingClientRect();
      return r.top >= view.top + 24 && r.bottom <= view.bottom - 24;
    })) return;
    const r = marks[0].getBoundingClientRect();
    this.paper.scrollTo({ top: Math.max(0, this.paper.scrollTop + r.top - view.top - view.height * 0.3), behavior: reducedMotion() ? 'auto' : 'smooth' });
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

  /** Older (`-1`) or newer (`+1`) draft in the pile. */
  stepDraft(d: number) {
    if (!this.sheets.length) return;
    const order = [...this.sheets, 9];
    const i = order.indexOf(this.draft);
    const n = order[Math.max(0, Math.min(order.length - 1, i + d))];
    if (n !== this.draft) this.setDraft(n, true);
  }

  /** Scroll to a part of the sheet: 1 abstract, 2 record, 3 attachments. */
  jump(part: number) {
    const el = document.getElementById(['', 'ds-overview', 'ds-record', 'ds-attach'][part] ?? '');
    if (!el) return;
    const top = part === 1 ? 0 : this.paper.scrollTop + el.getBoundingClientRect().top - this.paper.getBoundingClientRect().top - 16;
    this.paper.scrollTo({ top, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  /* ---------------- reference slips ---------------- */

  get slipOpen() {
    return !this.slip.hidden;
  }

  private openSlip(a: HTMLAnchorElement) {
    const r = this.records.find((x) => x.file === a.dataset.cite);
    if (!r) return;
    const cat = this.categories.find((c) => c.id === r.category);
    const where = [longDate(r.date), r.place].filter(Boolean).join(' · ');
    const sum = plain(r.summary);
    const place = this.hooks.place(r);
    this.slip.innerHTML = `
      <div class="cite-slip__head micro"><b>${esc(r.file)}</b><span>${esc(t(cat?.label ?? ''))}</span><span class="cite-slip__stamp">${esc(r.stamp)}</span>
        <button type="button" class="cite-slip__x" data-slip-close aria-label="${esc(t('Close'))}">×</button></div>
      <p class="cite-slip__title">${esc(r.title)}</p>
      ${r.subtitle ? `<p class="cite-slip__sub">${esc(r.subtitle)}</p>` : ''}
      ${where ? `<p class="cite-slip__where micro">${esc(where)}</p>` : ''}
      <p class="cite-slip__sum">${esc(sum.length > 220 ? `${sum.slice(0, 210).replace(/\s+\S*$/, '')}…` : sum)}</p>
      <p class="cite-slip__shelf micro">${esc(place.where)}</p>
      <a class="cite-slip__go" href="${this.base}records/${r.slug}/" data-go="${esc(r.file)}"${place.onTable ? ' data-pair="1"' : ''}>${esc(place.onTable ? (isZh() ? '在桌上 · 摆到旁边对照' : 'On the table · lay it alongside') : isZh() ? '去柜子拿' : 'Go and take it out')} →</a>`;
    this.slip.hidden = false;
    // beside the mark on wide screens, along the bottom on phones (CSS)
    const box = this.el.getBoundingClientRect(), m = a.getBoundingClientRect();
    const w = this.slip.offsetWidth, h = this.slip.offsetHeight;
    let left = m.left - box.left - w * 0.2;
    left = Math.max(8, Math.min(box.width - w - 8, left));
    let top = m.bottom - box.top + 10;
    if (m.bottom + h + 20 > window.innerHeight) top = m.top - box.top - h - 10;
    this.slip.style.left = `${left}px`;
    this.slip.style.top = `${top}px`;
    audio.paper();
    if (!reducedMotion()) this.slip.animate([{ opacity: 0, transform: 'translateY(6px) rotate(-1deg)' }, { opacity: 1, transform: 'rotate(-.6deg)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
    this.slip.querySelector<HTMLElement>('.cite-slip__go')?.focus({ preventScroll: true });
  }

  closeSlip() {
    if (this.slip.hidden) return;
    this.slip.hidden = true;
  }

  reset() {
    this.rec = null;
    this.closeSlip();
  }
}
