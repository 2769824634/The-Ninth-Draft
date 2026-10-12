/**
 * The cassettes in the office, put together at build time: the tapes listed
 * in src/data/tapes.json (music, Heuss's dictation, any recording the author
 * adds) and one tape per record, read aloud from its summary. On a record's
 * tape a redacted passage is a tone, the way it was on the real thing; the
 * reading is always the final draft.
 */
import type { ClientRecord } from './records';
import { DISTRICTS } from '../app/visitor/districts';
import list from '../data/tapes.json';

type L = { en: string; zh: string };

export interface TapeData {
  id: string;
  kind: 'music' | 'dictation' | 'file' | 'record';
  /** Code on the spine: MX-01, DS-14, E-0004… */
  label: string;
  title: L;
  stamp?: string;
  /** Music tapes: which song in src/app/office/music.ts. */
  song?: string;
  /** A recording to play instead (URL). */
  src?: string;
  /** What the reader says, one sentence per entry; "█" is a redaction tone. */
  lines?: { en: string[]; zh: string[] };
  /** Record tapes: the record's page. */
  slug?: string;
  /** Record tapes: the named drafts, and what the tape says while the file stands at each (until its final is on file). */
  drafts?: { n: number; date?: string }[];
  at?: Record<number, { en: string[]; zh: string[] }>;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Summary HTML → speakable text as it stands in draft `k` (9: the final). */
export function speakable(html: string, k = 9) {
  return html
    .replace(/<span class="rv-note"[^>]*><span class="rv-note__t">[\s\S]*?<\/span><span class="rv-note__by">[\s\S]*?<\/span><\/span>/g, '')
    .replace(/<span class="rv" data-redact="(\d)-(\d)"><span>([\s\S]*?)<\/span><\/span>/g, (_m, a: string, b: string, t: string) => (Number(a) <= k && Number(b) >= k ? ' █ ' : t))
    .replace(/<span class="redact"[^>]*><span>[\s\S]*?<\/span><\/span>/g, ' █ ')
    .replace(/<span class="rv" data-del="(\d)">([\s\S]*?)<\/span>/g, (_m, n: string, t: string) => (k >= Number(n) ? '' : t))
    .replace(/<span class="rv" data-add="(\d)">([\s\S]*?)<\/span>/g, (_m, n: string, t: string) => (k >= Number(n) ? t : ''))
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, k: string) => ENTITIES[k])
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split into sentences, keeping each one short enough for the speech engine. */
export function sentences(text: string) {
  return text
    .split(/(?<=[.!?。！？])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DIGITS_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const DIGITS_ZH = '零一二三四五六七八九';
const spell = (file: string, zh: boolean) =>
  file.replace(/\d/g, (d) => (zh ? DIGITS_ZH[Number(d)] : ` ${DIGITS_EN[Number(d)]}`)).replace('-', zh ? ' ' : ',').replace(/\s+/g, ' ');

export function buildTapes(records: ClientRecord[], base: string): TapeData[] {
  const own: TapeData[] = (list.tapes as TapeData[]).map((t) => ({
    ...t,
    kind: t.src && t.kind !== 'music' && t.kind !== 'dictation' ? 'file' : t.kind,
    src: t.src ? `${base}${t.src.replace(/^\//, '')}` : undefined,
  }));
  const files: TapeData[] = records
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((r) => {
      const d = DISTRICTS.find((x) => x.id === r.district);
      const zh = r.zh ?? r;
      const where = (z: boolean) => [d ? (z ? d.zh : d.en) : (z ? zh.place : r.place), z ? zh.date : r.date].filter(Boolean).join(z ? '，' : ', ');
      const read = (k: number) => ({
        en: [
          `Records Office, Data Section. File ${spell(r.file, false)}.`,
          `${r.title}.`,
          where(false) ? `${where(false)}.` : '',
          ...sentences(speakable(r.summary, k)),
          'End of file.',
        ].filter(Boolean),
        zh: [
          `记录署数据组，档案 ${spell(r.file, true)}。`,
          `${zh.title}。`,
          where(true) ? `${where(true)}。` : '',
          ...sentences(speakable(zh.summary, k)),
          '本档完。',
        ].filter(Boolean),
      });
      const { en, zh: zhLines } = read(9);
      const named = r.drafts.filter((x) => x.n < 9);
      return {
        id: `file-${r.slug}`,
        kind: 'record' as const,
        label: r.file,
        title: { en: r.title, zh: zh.title },
        stamp: r.stamp,
        src: r.audio,
        lines: { en, zh: zhLines },
        slug: r.slug,
        drafts: named.map((x) => ({ n: x.n, date: x.date })),
        at: Object.fromEntries(named.map((x) => [x.n, read(x.n)])),
      };
    });
  return [...own, ...files];
}
