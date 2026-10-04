/**
 * Attachments: paper things clipped to a file. Memos, telegrams, tickets,
 * press clippings and contact strips come from the optional `attachments`
 * list; every file also gets a routing slip built from its draft history and
 * related files, so a record with nothing extra still has something clipped on.
 */
import type { ArchiveRecord, Attachment } from '../types';
import { hash, loadPhoto } from '../scene/textures';
import { halftone } from '../scene/halftone';
import { esc } from './text';

/** Same archivist who signs the margin notes. */
const NOTE_BY = 'Heuss';

const pad = (n: number) => String(n).padStart(2, '0');

/** Small deterministic jitter per file + slot, so a file always lies the same way. */
const jitter = (seed: number, k: number) => ((Math.imul(seed ^ (k * 2654435761), 1597334677) >>> 0) % 1000) / 1000 - 0.5;

const initials = (name?: string) =>
  name
    ? name
        .split(/[\s-]+/)
        .filter(Boolean)
        .map((w) => `${w[0].toUpperCase()}.`)
        .join('')
    : 'H.';

function routingSlip(rec: ArchiveRecord) {
  const rows: { n: number; what: string; date: string; who: string }[] = [];
  const dated = [...rec.drafts].sort((a, b) => a.n - b.n);
  if (dated.length) {
    for (const d of dated) rows.push({ n: d.n, what: `Draft ${pad(d.n)}${d.label ? ` · ${esc(d.label)}` : ''}`, date: esc(d.date ?? '—'), who: initials(d.by) });
  } else {
    rows.push({ n: 1, what: 'Registry', date: rec.category === 'personnel' ? '—' : esc(rec.date?.split(/\s*[–-]\s*/)[0] ?? '—'), who: 'R.' });
    rows.push({ n: 5, what: 'Records office', date: '—', who: initials() });
  }
  rows.push({ n: 9, what: 'Draft 09 · Filed', date: '—', who: initials() });
  const xref = rec.related.length ? `<p class="slip__x">Cross-filed: ${rec.related.map(esc).join(', ')}</p>` : '';
  return `
    <span class="slip__head"><b>Routing slip</b><span>No. ${1000 + (hash(rec.file) % 9000)}</span></span>
    <span class="slip__file">File ${esc(rec.file)}</span>
    <table class="slip__rows">
      <thead><tr><th>Route</th><th>Date</th><th>Init.</th></tr></thead>
      <tbody>${rows.map((r) => `<tr data-draft="${r.n}"><td>${r.what}</td><td>${r.date}</td><td class="slip__init">${r.who}</td></tr>`).join('')}</tbody>
    </table>
    ${xref}`;
}

/** Telegrams have no full stops, only STOP. Leaves tags alone. */
const telegraphese = (html: string) => html.replace(/\.(?=\s|$|<)/g, ' STOP').replace(/(?<!STOP)\s*$/, ' STOP');

function body(a: Attachment, rec: ArchiveRecord, i: number) {
  const date = a.date ? `<span class="clip__date">${a.date}</span>` : '';
  switch (a.kind) {
    case 'telegram':
      return `
        <span class="tg__head"><b>Telegram</b>${date}</span>
        ${a.title ? `<span class="tg__route">${a.title}</span>` : ''}
        <span class="tg__strip">${telegraphese(a.text)}</span>`;
    case 'ticket':
      return `
        <span class="tk__stub"><span>No.</span><b>${String(hash(rec.file + i) % 100000).padStart(5, '0')}</b></span>
        <span class="tk__main">
          <span class="tk__title">${a.title ?? 'Admit one'}</span>
          <span class="tk__text">${a.text}</span>
          ${date}
        </span>`;
    case 'clipping':
      return `
        ${a.title ? `<span class="cl__head">${a.title}</span>` : ''}
        <span class="cl__text">${a.text}</span>
        ${date}`;
    case 'negative':
      return `
        <span class="ng__film"><canvas data-negative="${i}" aria-hidden="true"></canvas></span>
        ${a.text ? `<span class="ng__cap">${a.text}</span>` : ''}`;
    default:
      return `
        <span class="nt__text">${a.text}</span>
        <span class="nt__by">— ${a.by ?? NOTE_BY}${a.date ? `, ${a.date}` : ''}</span>`;
  }
}

/** Markup for the Overview tab. */
export function attachmentsHtml(rec: ArchiveRecord) {
  const s = hash(rec.file);
  const items = [
    `<button type="button" class="clip clip--slip" style="--r:${(jitter(s, 0) * 3).toFixed(2)}deg" aria-label="Routing slip">${routingSlip(rec)}</button>`,
    ...rec.attachments.map(
      (a, i) =>
        `<button type="button" class="clip clip--${a.kind}" ${a.draft ? `data-draft="${a.draft}"` : ''} style="--r:${(jitter(s, i + 1) * 5).toFixed(2)}deg;--y:${(jitter(s, i + 11) * 0.8).toFixed(2)}rem" aria-label="${a.kind}">${body(a, rec, i)}</button>`,
    ),
  ];
  return `
    <div class="micro lede-label clips-label">Attachments (${items.length})</div>
    <div class="clips">${items.join('')}</div>`;
}

/** Contact strips: three frames of the file's photo (or composite), as a negative. */
export async function paintNegatives(root: HTMLElement, rec: ArchiveRecord, still: () => boolean) {
  const canvases = root.querySelectorAll<HTMLCanvasElement>('canvas[data-negative]');
  if (!canvases.length) return;
  const photo = rec.image ? await loadPhoto(rec.image) : null;
  if (!still()) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fw = 74 * dpr, fh = 96 * dpr, gap = 10 * dpr, rail = 16 * dpr;
  const src = halftone(photo, rec.file, fw * 1.3, fh * 1.3);
  canvases.forEach((c, k) => {
    c.width = Math.round(fw * 3 + gap * 4);
    c.height = Math.round(fh + rail * 2);
    const g = c.getContext('2d')!;
    g.fillStyle = '#1a1714';
    g.fillRect(0, 0, c.width, c.height);
    // sprocket holes
    g.fillStyle = '#c9bfa8';
    for (let x = gap / 2; x < c.width; x += 14 * dpr) {
      g.fillRect(x, rail * 0.3, 7 * dpr, rail * 0.4);
      g.fillRect(x, c.height - rail * 0.7, 7 * dpr, rail * 0.4);
    }
    const seed = hash(rec.file) + k * 7;
    for (let f = 0; f < 3; f++) {
      const x = gap + f * (fw + gap), y = rail;
      g.save();
      g.beginPath();
      g.rect(x, y, fw, fh);
      g.clip();
      // each frame framed a little differently, like a photographer bracketing
      const ox = jitter(seed, f) * fw * 0.3, oy = jitter(seed, f + 5) * fh * 0.2;
      g.drawImage(src, x - fw * 0.15 + ox, y - fh * 0.15 + oy, fw * 1.3, fh * 1.3);
      // negative: invert, then the warm orange base of colour film stock
      g.globalCompositeOperation = 'difference';
      g.fillStyle = '#fff';
      g.fillRect(x, y, fw, fh);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = f === 1 + (seed % 2) ? 'rgba(201,120,62,.55)' : 'rgba(201,140,82,.4)';
      g.fillRect(x, y, fw, fh);
      g.restore();
      g.fillStyle = '#c9bfa8';
      g.font = `${7 * dpr}px "IBM Plex Mono", monospace`;
      g.fillText(`${(seed % 30) + f + 1}A`, x + 2 * dpr, c.height - 2 * dpr);
    }
  });
}

/** Show the attachments that had been clipped in by draft `n`. */
export function showDraft(root: HTMLElement, n: number) {
  root.querySelectorAll<HTMLElement>('.clip[data-draft], .slip__rows tr[data-draft]').forEach((el) => {
    el.classList.toggle('is-gone', Number(el.dataset.draft) > n);
  });
}
