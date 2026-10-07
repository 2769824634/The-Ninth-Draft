/**
 * The island's weather. Every visitor gets the same sky on the same island
 * day: it is worked out from the date, not fetched. Gerimis sits on the
 * equator, so a wet day is as common as a dry one, and wetter at the turn of
 * the year when the monsoon comes in.
 */
import { islandIso } from './island';

function hashDay(iso: string) {
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) h = Math.imul(h ^ iso.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Chance of rain by month (0 = January): the north-east monsoon is wettest. */
const WET = [0.62, 0.42, 0.45, 0.5, 0.48, 0.4, 0.4, 0.42, 0.45, 0.5, 0.62, 0.7];

/** Is it raining on the island today? */
export function islandRaining(iso = islandIso()): boolean {
  const month = Number(iso.slice(5, 7)) - 1;
  return hashDay(iso) < (WET[month] ?? 0.5);
}

/** Relative humidity on the hygrometer, in per cent. */
export const islandHumidity = (iso = islandIso()) => (islandRaining(iso) ? 84 + Math.round(hashDay(iso + 'rh') * 8) : 64 + Math.round(hashDay(iso + 'rh') * 10));

const SYNODIC = 29.530588853;
/** A new moon the sky remembers: 6 January 2000, 18:14 UTC. */
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

export interface IslandMoon {
  /** 0 new, 0.5 full. */
  phase: number;
  /** How much of the disc is lit, 0–1. */
  lit: number;
  /** Light it throws through the louvres now: lit, times how high it stands; 0 when it is down or behind rain. */
  light: number;
}

/**
 * The moon over the island, the real one for this day in 1999: the phase from
 * the date, and whether it is up from the hour (it crosses the sky about
 * twelve hours after the sun at full, with the sun at new). A wet night has
 * no moon. A night chosen in daylight hours is read at eleven at night.
 */
export function islandMoon(iso = islandIso(), hour = 23, rain = islandRaining(iso)): IslandMoon {
  const [, m, d] = iso.split('-').map(Number);
  const h = hour >= 7 && hour < 19 ? 23 : hour;
  const at = Date.UTC(1999, m - 1, d, 0, 0) + (h - 8) * 3600e3;
  const phase = ((((at - NEW_MOON) / 86400e3 / SYNODIC) % 1) + 1) % 1;
  const lit = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const transit = (12 + phase * 24.8) % 24;
  const off = Math.abs(((h - transit + 36) % 24) - 12);
  const height = off < 6.2 ? Math.cos((off / 6.2) * (Math.PI / 2)) : 0;
  return { phase, lit, light: rain ? 0 : lit * Math.sqrt(height) };
}
