/**
 * The visitor's registration. It lives only in this browser (localStorage);
 * the recovery phrase (phrase.ts) carries it to another device.
 */
import { DISTRICTS, type DistrictId } from './districts';

export interface Visitor {
  /** File number, 1–4095, shown as V-0417. */
  no: number;
  /** Codename, as typed. */
  code: string;
  district: DistrictId;
  /** Answers to the three questions, each 0–2. */
  answers: [number, number, number];
  /** "Something you remember that nobody else does" (optional, not in the phrase). */
  line?: string;
  /** When the form was filed (ms). */
  at: number;
}

const KEY = 'n9:visitor';

export const fileNo = (v: Pick<Visitor, 'no'>) => `V-${String(v.no).padStart(4, '0')}`;

export function loadVisitor(): Visitor | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v.code !== 'string' || !DISTRICTS.some((d) => d.id === v.district)) return null;
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
