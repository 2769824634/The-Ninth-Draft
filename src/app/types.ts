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
}

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
