export type AttachmentKind = 'note' | 'telegram' | 'ticket' | 'clipping' | 'negative';

export interface Attachment {
  kind: AttachmentKind;
  title?: string;
  text: string;
  date?: string;
  by?: string;
  draft?: number;
}

export type CategoryId = 'personnel' | 'events' | 'programs';

export interface Category {
  id: CategoryId;
  label: string;
  code: string;
}

export interface ArchiveRecord {
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
  revised: boolean;
  drafts: { n: number; label?: string; date?: string; by?: string; stamp?: string }[];
  attachments: Attachment[];
  /** Chinese version, merged with the English one (only when a .zh.md exists). */
  zh?: RecordTexts;
  /** English texts, kept so the language can be switched back. Set on the client. */
  en?: RecordTexts;
}

export type RecordTexts = Pick<
  ArchiveRecord,
  'title' | 'subtitle' | 'status' | 'date' | 'place' | 'imageCaption' | 'fields' | 'summary' | 'body' | 'tags' | 'drafts' | 'attachments' | 'revised'
>;

export type Lines = string[] | Record<string, string[]>;
export type ArchivistLines = Record<string, Lines>;

export interface ArchiveData {
  base: string;
  categories: Category[];
  records: ArchiveRecord[];
  archivist: ArchivistLines;
  initial: string | null;
  room: 'archive' | 'wall';
}
