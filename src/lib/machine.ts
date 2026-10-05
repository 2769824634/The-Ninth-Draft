/**
 * What the machine room's screens show, built from the archive at build
 * time: the revision log (every dated draft), the files the console can
 * list and open, and the revised files the backup tapes can restore.
 */
import type { ClientRecord } from './records';
import { isoDate } from './daily';

type L = { en: string; zh: string };

export interface LogLine {
  date: string;
  file: string;
  slug: string;
  draft: number;
  stamp: string;
  label: L;
}

export interface MachineFile {
  file: string;
  slug: string;
  category: string;
  stamp: string;
  district?: string;
  title: L;
  /** Body HTML with revision marks, for restoring an earlier draft. */
  body: L;
  revised: boolean;
}

export interface MachineData {
  log: LogLine[];
  files: MachineFile[];
}

export function buildMachine(records: ClientRecord[]): MachineData {
  const log: LogLine[] = records
    .flatMap((r) =>
      r.drafts
        .map((d, i) => ({ d, i }))
        .filter(({ d }) => isoDate(d.date))
        .map(({ d, i }) => ({
          date: isoDate(d.date)!,
          file: r.file,
          slug: r.slug,
          draft: d.n,
          stamp: d.stamp ?? r.stamp,
          label: { en: d.label ?? '', zh: r.zh?.drafts?.[i]?.label ?? d.label ?? '' },
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.file.localeCompare(b.file));
  const files: MachineFile[] = records
    .slice()
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((r) => ({
      file: r.file,
      slug: r.slug,
      category: r.category,
      stamp: r.stamp,
      district: r.district,
      title: { en: r.title, zh: r.zh?.title ?? r.title },
      body: { en: r.body, zh: r.zh?.body ?? r.body },
      revised: r.revised,
    }));
  return { log, files };
}
