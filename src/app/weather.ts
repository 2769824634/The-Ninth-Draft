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
