import { getCollection } from 'astro:content';

export const CATEGORIES = [
  { id: 'personnel', label: 'Personnel', code: 'P' },
  { id: 'events', label: 'Events', code: 'E' },
  { id: 'programs', label: 'Programs', code: 'R' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export interface ClientAttachment {
  kind: 'note' | 'telegram' | 'ticket' | 'clipping' | 'negative';
  title?: string;
  /** HTML (redactions allowed). */
  text: string;
  date?: string;
  by?: string;
  draft?: number;
}

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
  attachments: ClientAttachment[];
  /** Chinese version, already merged with the English original (present only when a .zh.md exists). */
  zh?: RecordTexts;
}

/** The parts of a record that change with the language. */
export type RecordTexts = Pick<
  ClientRecord,
  'title' | 'subtitle' | 'status' | 'date' | 'place' | 'imageCaption' | 'fields' | 'summary' | 'body' | 'tags' | 'drafts' | 'attachments' | 'revised'
>;

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

const hasMarks = (r: Pick<ClientRecord, 'summary' | 'body' | 'fields'>) => /class="rv/.test(r.summary + r.body + r.fields.map((f) => f.value).join(''));

export async function loadRecords(base: string): Promise<ClientRecord[]> {
  const entries = await getCollection('records');
  const zhEntries = await getCollection('recordsZh');
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
      attachments: data.attachments.map((a) =>
        typeof a === 'string'
          ? { kind: 'note' as const, text: inline(a) }
          : { ...a, title: a.title && esc(a.title), text: inline(a.text), date: a.date && esc(a.date), by: a.by && esc(a.by) },
      ),
    }))
    .map((r) => ({ ...r, revised: r.drafts.length > 0 || hasMarks(r) }));

  // Chinese versions: every field falls back to the English one
  for (const { data, rendered } of zhEntries) {
    const r = records.find((x) => x.file === data.file);
    if (!r) {
      console.warn(`[archive] Chinese version for missing record ${data.file}`);
      continue;
    }
    const zhBody = rendered?.html?.trim();
    const zh: RecordTexts = {
      title: data.title ?? r.title,
      subtitle: data.subtitle ?? r.subtitle,
      status: data.status ?? r.status,
      date: data.date ?? r.date,
      place: data.place ?? r.place,
      imageCaption: data.imageCaption ?? r.imageCaption,
      fields: data.fields ? data.fields.map((f) => ({ label: esc(f.label), value: inline(f.value) })) : r.fields,
      summary: data.summary ? inline(data.summary) : r.summary,
      body: zhBody ? revise(redact(zhBody)) : r.body,
      tags: data.tags ?? r.tags,
      drafts: r.drafts.map((d) => {
        const t = data.drafts?.find((x) => x.n === d.n);
        return t ? { ...d, label: t.label ?? d.label, by: t.by ?? d.by } : d;
      }),
      attachments: r.attachments.map((a, i) => {
        const t = data.attachments?.[i];
        if (!t) return a;
        if (typeof t === 'string') return { ...a, text: inline(t) };
        return {
          ...a,
          title: t.title ? esc(t.title) : a.title,
          text: t.text ? inline(t.text) : a.text,
          date: t.date ? esc(t.date) : a.date,
          by: t.by ? esc(t.by) : a.by,
        };
      }),
      revised: false,
    };
    zh.revised = zh.drafts.length > 0 || hasMarks(zh);
    r.zh = zh;
  }

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
