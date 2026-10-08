/**
 * Homes: the HDB blocks a resident can be given, the ballot, the number on
 * the door, and the lines of the identity card.
 *
 * The blocks are the street map's (public/map/detail.json, made by
 * scripts/map/build.py): only ones standing in 1999, only ones with flats.
 */
import { district, type DistrictId } from './districts';
import type { HomePhrase } from './phrase';
import { hash, homeFileNo, normCode, rng, type Home, type Visitor } from './store';

export interface HomeBlock {
  /** Index in detail.json, the same the street map uses. */
  i: number;
  no: string;
  street: string;
  postcode: string;
  year: number;
  floors: number;
  district: DistrictId | null;
  x: number;
  y: number;
}

interface Detail { q: number; streets: string[]; hdb: { r: number[]; b: string; s: number; p: string; y: number; f: number; d: number; c?: number }[] }

let loading: Promise<HomeBlock[]> | null = null;
/** Every block with flats in it. Fetched once, on first asking. */
export function homeBlocks(base: string): Promise<HomeBlock[]> {
  loading ??= Promise.all([
    fetch(`${base}map/detail.json`).then((r) => r.json() as Promise<Detail>),
    fetch(`${base}map/base.json`).then((r) => r.json() as Promise<{ districts: { id: string }[] }>),
  ]).then(([d, b]) =>
    d.hdb.flatMap((h, i) => {
      if (h.c) return [];
      // the middle of the outline, from the stored deltas
      let x = 0, y = 0, sx = 0, sy = 0;
      for (let k = 0; k < h.r.length; k += 2) { x += h.r[k]; y += h.r[k + 1]; sx += x; sy += y; }
      const n = h.r.length / 2;
      return [{ i, no: h.b, street: h.s >= 0 ? d.streets[h.s] : '', postcode: h.p, year: h.y, floors: Math.max(1, h.f || 4), district: (b.districts[h.d]?.id ?? null) as DistrictId | null, x: sx / n / d.q, y: sy / n / d.q }];
    }),
  );
  loading.catch(() => (loading = null));
  return loading;
}

/**
 * The ballot. The same name in the same district always draws the same flat,
 * so asking again does not help; a different district draws again.
 */
export function ballot(blocks: HomeBlock[], code: string, d: DistrictId): { block: HomeBlock; home: Home } | null {
  const pool = blocks.filter((b) => b.district === d);
  if (!pool.length) return null;
  const r = rng(hash(`${normCode(code)}#ballot#${d}`));
  const block = pool[Math.floor(r() * pool.length)];
  // ground floors are void decks and shops: flats start on the second
  const floor = block.floors > 2 ? 2 + Math.floor(r() * (block.floors - 1)) : block.floors;
  return { block, home: { postcode: block.postcode, blk: block.no, street: block.street, floor, stack: Math.floor(r() * DOORS) } };
}

/** Doors along one corridor, for picking your own. */
export const DOORS = 8; // the phrase keeps the door in three bits

/** The number on the door: each block numbers its corridor from its own hundred, "#07-311". */
export const unitNo = (h: Pick<Home, 'postcode' | 'stack'>) => String((1 + (hash(`unit#${h.postcode}`) % 8)) * 100 + 1 + h.stack * 2);
export const doorText = (h: Pick<Home, 'postcode' | 'floor' | 'stack'>) => `#${String(h.floor).padStart(2, '0')}-${unitNo(h)}`;

/** "Blk 7 Lorong Lew Lian #03-311", the way a letter is addressed. */
export const addressLine = (h: Home, zh: boolean) =>
  zh ? `${h.street ? `${h.street} ` : ''}${h.blk} 座 ${doorText(h)}` : `Blk ${h.blk}${h.street ? ` ${h.street}` : ''} ${doorText(h)}`;
export const postLine = (h: Pick<Home, 'postcode'>, zh: boolean) => (zh ? `霏微 ${h.postcode}` : `Gerimis ${h.postcode}`);

/** The row under the date of birth: G, R87, N. (Step 4 of the change list adds to it.) */
export const codeRow = (v: Pick<Visitor, 'origin' | 'since'>) =>
  v.origin === 'G' ? 'G' : v.origin === 'R' && v.since ? `R${String(v.since % 100).padStart(2, '0')}` : 'N';

/** Card number: V, the file number, three digits, a check letter, the way the island's cards are numbered. */
export function cardNo(v: Pick<Visitor, 'no' | 'code'>) {
  const digits = `${String(v.no).padStart(4, '0')}${String(hash(`card#${normCode(v.code)}#${v.no}`) % 1000).padStart(3, '0')}`;
  const w = [2, 7, 6, 5, 4, 3, 2];
  const sum = [...digits].reduce((s, c, i) => s + Number(c) * w[i], 0);
  return `V${digits}${'JZIHGFEDCBA'[sum % 11]}`;
}

/** Where they were born, for the front of the card. */
export const birthplace = (v: Pick<Visitor, 'origin' | 'from'>, zh: boolean) =>
  v.origin === 'G' ? (zh ? '霏微' : 'GERIMIS') : v.from?.trim() ? (zh ? v.from.trim() : v.from.trim().toUpperCase()) : zh ? '未申报' : 'NOT DECLARED';

/** Six words → a resident again, once the block is found. */
export async function restoreHome(p: HomePhrase, base: string): Promise<Visitor | null> {
  const blocks = await homeBlocks(base);
  const b = blocks.find((x) => x.postcode === p.postcode);
  if (!b || !b.district) return null;
  return {
    no: homeFileNo(p.code, p),
    code: p.code,
    district: b.district,
    origin: p.origin,
    ...(p.since ? { since: p.since } : {}),
    ...(p.dob ? { dob: p.dob } : {}),
    ...(p.sex ? { sex: p.sex } : {}),
    home: { postcode: b.postcode, blk: b.no, street: b.street, floor: p.floor, stack: p.stack },
    at: Date.now(),
  };
}

/** A district's name for a home's line, with the region. */
export const homeDistrict = (v: Pick<Visitor, 'district'>, zh: boolean) => {
  const d = district(v.district);
  return d ? (zh ? d.zh : d.en) : '';
};
