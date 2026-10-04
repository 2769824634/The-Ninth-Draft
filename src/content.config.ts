import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * One Markdown file = one record.
 * Folder decides nothing; `category` in frontmatter does.
 */
const records = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/records' }),
  schema: z.object({
    /** File number shown everywhere, e.g. "P-0001". Must be unique. */
    file: z.string(),
    category: z.enum(['personnel', 'events', 'programs']),
    title: z.string(),
    /** Second line under the title (alias, role, codename…). */
    subtitle: z.string().optional(),
    /** Free-form status line, e.g. "Declassified", "Restricted". */
    status: z.string().default('Declassified'),
    /** Stamp printed on the folder & dossier. */
    stamp: z.enum(['TOP SECRET', 'SECRET', 'CONFIDENTIAL', 'RESTRICTED', 'DECLASSIFIED']).default('DECLASSIFIED'),
    /** Display date or range, any format: "1957", "1961-04-12", "1945–1991". */
    date: z.string().optional(),
    place: z.string().optional(),
    /** Image path inside /public, e.g. "records/p-0001.jpg". */
    image: z.string().optional(),
    imageCaption: z.string().optional(),
    /** Extra label/value rows on the dossier. */
    fields: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
    /** One-paragraph abstract (Overview tab). Body markdown goes to the Record tab. */
    summary: z.string(),
    /** File numbers of related records, e.g. ["E-0002", "R-0001"]. */
    related: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    /** Lower numbers come first inside a category. */
    order: z.number().default(100),
  }),
});

export const collections = { records };
