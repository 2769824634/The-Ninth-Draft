/**
 * Where a record happened, down to the block: read at build time from the
 * street map's data (public/map/detail.json, made by scripts/map/build.py).
 *
 * A record needs nothing new for this. Its `block` field, or failing that its
 * `place`, is read for an HDB block number ("Blk 7", "Block 7 Lorong Lew
 * Lian", "7 座") or one of the district's neighbourhoods ("Tiong Bahru"). A
 * block number is looked for in the record's district, and a street written
 * after it settles which one if the district has two.
 */
import fs from 'node:fs';
import path from 'node:path';
import { district, pageRef } from '../app/visitor/districts';

interface Detail {
  hdb: { b: string; s: number; p: string; d: number; r: number[] }[];
  places: { d: string; i: number; x: number; y: number }[];
  streets: string[];
  q: number;
}
interface Base { districts: { id: string }[] }

export interface Address {
  x: number;
  y: number;
  /** "Blk 7 Lorong Lew Lian", or the neighbourhood's name. */
  en: string;
  zh: string;
  postcode?: string;
  /** Street-directory reference, "87 B2". */
  ref?: string;
}

let data: { detail: Detail; base: Base } | null = null;
const load = () => {
  if (data) return data;
  const dir = path.join(process.cwd(), 'public', 'map');
  try {
    data = {
      detail: JSON.parse(fs.readFileSync(path.join(dir, 'detail.json'), 'utf-8')),
      base: JSON.parse(fs.readFileSync(path.join(dir, 'base.json'), 'utf-8')),
    };
  } catch {
    data = { detail: { hdb: [], places: [], streets: [], q: 10 }, base: { districts: [] } };
  }
  return data;
};

/** The middle of a block's outline, from the stored deltas. */
const centre = (r: number[], q: number) => {
  let x = 0, y = 0, sx = 0, sy = 0;
  for (let i = 0; i < r.length; i += 2) { x += r[i]; y += r[i + 1]; sx += x; sy += y; }
  const n = r.length / 2;
  return [sx / n / q, sy / n / q];
};

const BLOCK = /(?:\b(?:blk|block)\.?\s*(\d+[a-z]?)\b|(\d+[a-z]?)\s*座)\s*(.*)$/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, ' ').trim();

export function addressOf(rec: { district?: string; block?: string; place?: string }): Address | null {
  const d = district(rec.district);
  if (!d) return null;
  const { detail, base } = load();
  const di = base.districts.findIndex((x) => x.id === d.id);
  const text = rec.block ?? rec.place ?? '';

  // a block number, in the record's district
  const m = text.match(BLOCK);
  if (m && di >= 0) {
    const no = (m[1] ?? m[2]).toUpperCase();
    const rest = norm(m[3] ?? '');
    const found = detail.hdb.filter((h) => h.d === di && h.b.toUpperCase() === no);
    const h = (rest && found.find((h) => h.s >= 0 && norm(detail.streets[h.s]).includes(rest))) || found[0];
    if (h) {
      const [x, y] = centre(h.r, detail.q);
      const street = h.s >= 0 ? detail.streets[h.s] : '';
      return {
        x, y, postcode: h.p, ref: pageRef({ x, y })?.text,
        en: `Blk ${h.b}${street ? ` ${street}` : `, ${d.en}`}`,
        zh: `${d.zh} ${h.b} 座${street ? `（${street}）` : ''}`,
      };
    }
  }

  // a neighbourhood the gazetteer names
  const parts = (rec.block ? [rec.block] : text.split(/[,，、]/)).map(norm).filter(Boolean);
  const i = d.blocks.findIndex((b) => parts.includes(norm(b.en)) || parts.includes(norm(b.zh)));
  const p = i >= 0 ? detail.places.find((p) => p.d === d.id && p.i === i) : undefined;
  if (p) return { x: p.x, y: p.y, en: d.blocks[i].en, zh: d.blocks[i].zh, ref: pageRef(p)?.text };
  return null;
}
