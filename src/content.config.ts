import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * One Markdown file = one record.
 * Folder decides nothing; `category` in frontmatter does.
 */
const records = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!**/*.zh.md'], base: './src/content/records' }),
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
    /**
     * Optional revision history shown on the draft slider (drafts 1–8; draft 9 is the final file).
     * Any draft you leave out gets a default label.
     */
    drafts: z
      .array(
        z.object({
          n: z.number().int().min(1).max(8),
          label: z.string().optional(),
          date: z.string().optional(),
          by: z.string().optional(),
          stamp: z.enum(['DRAFT', 'TOP SECRET', 'SECRET', 'CONFIDENTIAL', 'RESTRICTED', 'DECLASSIFIED']).optional(),
        }),
      )
      .default([]),
    /**
     * Optional attachments clipped to the file (Overview tab). A plain string is a
     * memo signed by Heuss. Every file also gets a routing slip built from its
     * related files and draft history, so this list can stay empty.
     */
    attachments: z
      .array(
        z.union([
          z.string(),
          z.object({
            kind: z.enum(['note', 'telegram', 'ticket', 'clipping', 'negative']).default('note'),
            /** Headline, ticket name, or telegram sender. */
            title: z.string().optional(),
            text: z.string().default(''),
            date: z.string().optional(),
            by: z.string().optional(),
            /** First draft (1–9) in which the attachment is clipped in. */
            draft: z.number().int().min(1).max(9).optional(),
          }),
        ]),
      )
      .default([]),
  }),
});

/**
 * Optional Chinese version of a record: `p-0001.zh.md` beside `p-0001.md`.
 * Only `file` is required; every field left out falls back to the English
 * original, and so does the body when the file has none. Stamps, file
 * numbers, dates and links are never translated, so they are not listed.
 */
const recordsZh = defineCollection({
  loader: glob({ pattern: '**/*.zh.md', base: './src/content/records' }),
  schema: z.object({
    file: z.string(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    status: z.string().optional(),
    date: z.string().optional(),
    place: z.string().optional(),
    imageCaption: z.string().optional(),
    /** Replaces the English list as a whole when given. */
    fields: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
    /** Draft labels / signatures by draft number; dates and stamps come from the English file. */
    drafts: z.array(z.object({ n: z.number().int().min(1).max(8), label: z.string().optional(), by: z.string().optional() })).optional(),
    /**
     * Attachments in the same order as the English file. Each entry overrides
     * the text of the attachment at that position; kind and draft stay English.
     */
    attachments: z
      .array(z.union([z.string(), z.object({ title: z.string().optional(), text: z.string().optional(), date: z.string().optional(), by: z.string().optional() })]))
      .optional(),
  }),
});

export const collections = { records, recordsZh };
