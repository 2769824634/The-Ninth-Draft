import { getCollection } from 'astro:content';

export const CATEGORIES = [
  { id: 'personnel', label: 'Personnel', code: 'P' },
  { id: 'events', label: 'Events', code: 'E' },
  { id: 'programs', label: 'Programs', code: 'R' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface ClientRecord {
  file: string;
  slug: string;
  category: CategoryId;
  title: string;
  subtitle?: string;
  status: string;
  stamp: string;
  date?: string;
  place?: string;
  image?: string;
  imageCaption?: string;
  fields: { label: string; value: string }[];
  summary: string;
  body: string;
  related: string[];
  tags: string[];
  /** True when the record carries revision marks or a draft history. */
  revised: boolean;
  drafts: { n: number; label?: string; date?: string; by?: string; stamp?: string }[];
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** `||text||` → redaction bar that the reader can reveal. */
const redact = (html: string) =>
  html.replace(/\|\|(.+?)\|\|/g, '<span class="redact" tabindex="0" aria-label="Redacted passage"><span>$1</span></span>');

/** Name signed under every margin note. */
export const NOTE_SIGNATURE = 'Heuss';

/**
 * Revision marks (see README):
 *   [[+5: text]]       added in draft 5
 *   [[-6: text]]       struck out in draft 6, gone afterwards
 *   [[#3-7: text]]     blacked out in drafts 3–7 (a single number means "from then on")
 *   [[note 4-6: text]] margin note visible in drafts 4–6 (a single number means that draft only)
 */
const REV = /\[\[\s*(\+|-|#|note\s+)(\d)(?:\s*-\s*(\d))?\s*:\s*([\s\S]+?)\]\]/g;
const revise = (html: string) =>
  html.replace(REV, (_m, kind: string, a: string, b: string | undefined, text: string) => {
    const k = kind.trim();
    if (k === '+') return `<span class="rv" data-add="${a}">${text}</span>`;
    if (k === '-') return `<span class="rv" data-del="${a}">${text}</span>`;
    if (k === '#') return `<span class="rv" data-redact="${a}-${b ?? 9}"><span>${text}</span></span>`;
    return `<span class="rv-note" data-note="${a}-${b ?? a}"><span class="rv-note__t">${text}</span><span class="rv-note__by">— ${NOTE_SIGNATURE}</span></span>`;
  });

const inline = (s: string) => revise(redact(esc(s)));

export const slugOf = (file: string) => file.toLowerCase();

export async function loadRecords(base: string): Promise<ClientRecord[]> {
  const entries = await getCollection('records');
  const order = (c: string) => CATEGORIES.findIndex((x) => x.id === c);

  const records = entries
    .sort((a, b) => order(a.data.category) - order(b.data.category) || a.data.order - b.data.order || a.data.file.localeCompare(b.data.file))
    .map(({ data, rendered }): ClientRecord => ({
      file: data.file,
      slug: slugOf(data.file),
      category: data.category,
      title: data.title,
      subtitle: data.subtitle,
      status: data.status,
      stamp: data.stamp,
      date: data.date,
      place: data.place,
      image: data.image ? `${base}${data.image.replace(/^\//, '')}` : undefined,
      imageCaption: data.imageCaption,
      fields: data.fields.map((f) => ({ label: esc(f.label), value: inline(f.value) })),
      summary: inline(data.summary),
      body: revise(redact(rendered?.html ?? '')),
      related: data.related,
      tags: data.tags,
      revised: false,
      drafts: data.drafts,
    }))
    .map((r) => ({ ...r, revised: r.drafts.length > 0 || /class="rv/.test(r.summary + r.body + r.fields.map((f) => f.value).join('')) }));

  const files = new Set<string>();
  for (const r of records) {
    if (files.has(r.file)) throw new Error(`Duplicate file number: ${r.file}`);
    files.add(r.file);
  }
  for (const r of records) {
    for (const rel of r.related) {
      if (!files.has(rel)) console.warn(`[archive] ${r.file} links to missing record ${rel}`);
    }
  }
  return records;
}
