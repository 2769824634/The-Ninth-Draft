/**
 * Who the visitor is, as far as the Office knows. Two papers, both kept only
 * in this browser (localStorage):
 *
 * - the reader's pass: a name signed in the visitors' book at the door, and
 *   where they came from if they said. Anyone can read without one.
 * - the residents' register (Form RO-9): a resident has a home, a card and a
 *   file number. The recovery phrase (phrase.ts) carries it to another device.
 */
import { currentDistrict } from '../../data/gerimis/legacy';
import type { DistrictId } from './districts';

/** Born in Gerimis, ordinarily resident since a year, or a new arrival. */
export type Origin = 'G' | 'R' | 'N';

export type Sex = 'M' | 'F';

/**
 * A date of birth as typed (09-03-1971, 9/3/1971, 09031971) → "1971-03-09";
 * '' when blank; null when it is no day of 1900–1999 up to today on the island.
 */
export function parseDob(s: string, today: { month: number; day: number }): string | null {
  const t = s.trim();
  if (!t) return '';
  const m = t.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/) ?? t.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || y > 1999 || mo < 1 || mo > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
  if (y === 1999 && (mo - 1 > today.month || (mo - 1 === today.month && d > today.day))) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** "1971-03-09" → "09-03-1971", the way the card prints it. */
export const dobText = (dob: string) => dob.split('-').reverse().join('-');

/** The flat the Office gave out, or reissued at the old address. */
export interface Home {
  postcode: string;
  /** Block number, "7" or "105A". */
  blk: string;
  /** Street as the directory prints it ('' when it is not printed). */
  street: string;
  floor: number;
  /** Which door along the corridor, 0–31; unitNo() turns it into the number on the door. */
  stack: number;
}

export interface Visitor {
  /** File number, 1–4095, shown as V-0417. */
  no: number;
  /** Codename, as typed. */
  code: string;
  district: DistrictId;
  /** The tick on the form. Registrations from before the form changed have none, and count as new arrivals. */
  origin?: Origin;
  /** "Ordinarily resident since ____": the year. */
  since?: number;
  /** Date of birth, "1971-03-09". Registrations from before it was asked have none. */
  dob?: string;
  sex?: Sex;
  /** Where they came from, as written (optional, not in the phrase). */
  from?: string;
  home?: Home;
  /** Before the form changed: answers to three routine questions. Kept, no longer asked. */
  answers?: [number, number, number];
  line?: string;
  /** When the form was filed (ms). */
  at: number;
}

export interface Pass {
  /** Reader's pass number, shown as RC-0417. */
  no: number;
  code: string;
  from?: string;
  at: number;
}

const KEY = 'n9:visitor';
const PASS = 'n9:pass';

export const fileNo = (v: Pick<Visitor, 'no'>) => `V-${String(v.no).padStart(4, '0')}`;
export const passNo = (p: Pick<Pass, 'no'>) => `RC-${String(p.no).padStart(4, '0')}`;

export function loadVisitor(): Visitor | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v.code !== 'string' || typeof v.district !== 'string') return null;
    // registered before the 2026-10 survey: the district has a new name now
    v.district = currentDistrict(v.district);
    return v as Visitor;
  } catch {
    return null;
  }
}

export function saveVisitor(v: Visitor) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function forgetVisitor() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function loadPass(): Pass | null {
  try {
    const p = JSON.parse(localStorage.getItem(PASS) || 'null');
    return p && typeof p.code === 'string' && typeof p.no === 'number' ? (p as Pass) : null;
  } catch {
    return null;
  }
}

export function savePass(p: Pass) {
  try {
    localStorage.setItem(PASS, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export function forgetPass() {
  try { localStorage.removeItem(PASS); } catch { /* ignore */ }
}

/** The name the Office knows the visitor by: the resident's, else the one in the visitors' book. */
export const whoami = () => loadVisitor()?.code ?? loadPass()?.code ?? null;

/** Small deterministic hash (FNV-1a), used for seeds and the phrase checksum. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seeded generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const normCode = (code: string) => code.trim().replace(/\s+/g, ' ').toLowerCase();

/** A resident's file number follows from the name and the door, so the phrase need not carry it. */
export const homeFileNo = (code: string, h: Pick<Home, 'postcode' | 'floor' | 'stack'>) => 100 + (hash(`${normCode(code)}#${h.postcode}#${h.floor}#${h.stack}`) % 3996);
