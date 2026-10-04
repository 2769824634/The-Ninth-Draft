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
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** `||text||` → redaction bar that the reader can reveal. */
const redact = (html: string) =>
  html.replace(/\|\|(.+?)\|\|/g, '<span class="redact" tabindex="0" aria-label="Redacted passage"><span>$1</span></span>');

const inline = (s: string) => redact(esc(s));

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
      body: redact(rendered?.html ?? ''),
      related: data.related,
      tags: data.tags,
    }));

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
