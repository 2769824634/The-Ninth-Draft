/**
 * What the office wall calendar knows: every dated thing in the archive that
 * falls in 1999 (record dates, draft dates, attachment dates), on its day.
 * Built at build time; the page keeps only what is on file by the island's today.
 */
import type { ClientRecord } from './records';

type L = { en: string; zh: string };
export interface CalItem {
  day: string;
  file: string;
  slug: string;
  category: string;
  title: L;
  /** The record's own date: it is not on file before that. */
  filed?: string;
  what: L;
}

/** dd.mm.yy (the archive's way) or an ISO date, as yyyy-mm-dd. */
const parse = (s?: string) => {
  const m = s?.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
  if (m) return `19${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const i = s?.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return i ? i[0] : null;
};

export function calendarItems(records: ClientRecord[]): CalItem[] {
  const items: CalItem[] = [];
  for (const r of records) {
    const one = { file: r.file, slug: r.slug, category: r.category, title: { en: r.title, zh: r.zh?.title ?? r.title }, filed: r.date };
    const add = (d: string | null, what: L) => d?.startsWith('1999') && items.push({ ...one, day: d, what });
    add(parse(r.date), { en: 'Record', zh: '档案' });
    for (const k of r.drafts) add(parse(k.date), { en: `Draft ${String(k.n).padStart(2, '0')}`, zh: `第 ${k.n} 稿` });
    for (const a of r.attachments) add(parse(a.date), { en: 'Attachment', zh: '附件' });
  }
  return items.sort((a, b) => a.day.localeCompare(b.day) || a.file.localeCompare(b.file));
}
