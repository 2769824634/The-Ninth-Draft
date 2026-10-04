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
}

export interface ArchiveData {
  base: string;
  categories: Category[];
  records: ArchiveRecord[];
  initial: string | null;
}
