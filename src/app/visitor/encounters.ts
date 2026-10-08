/**
 * Who you run into. The world is the same for everyone; what you happen upon
 * depends on where you live, a seed from your registration, and how often and
 * when you come back, which only this browser remembers (localStorage
 * n9:visits). Nothing leaves the device.
 *
 * Each encounter is a condition and a line. The first batch is small on
 * purpose: add to ENCOUNTERS, nothing else needs to change.
 */
import { CAST, type L, type Regular } from '../../data/gerimis/people';
import { islandNow, type IslandTime } from '../island';
import { hash, normCode, type Visitor } from './store';

const KEY = 'n9:visits';

/** How often, and when, this browser has come home. */
export interface Visits {
  /** Times the home page was opened. */
  n: number;
  /** Distinct island days on which it was. */
  days: number;
  /** The last island day, "1999-10-08", and the time before this one (ms). */
  day: string;
  last: number;
  /** Times opened between ten at night and five in the morning. */
  late: number;
}

const blank = (): Visits => ({ n: 0, days: 0, day: '', last: 0, late: 0 });

export function loadVisits(): Visits {
  try {
    return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return blank();
  }
}

/** Count this visit. Returns the record as it stood before, and after. */
export function countVisit(at = Date.now()): { before: Visits; now: Visits } {
  const before = loadVisits();
  const t = islandNow(at);
  const day = `1999-${String(t.month + 1).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const now: Visits = {
    n: before.n + 1,
    days: before.days + (before.day === day ? 0 : 1),
    day,
    last: at,
    late: before.late + (t.hours >= 22 || t.hours < 5 ? 1 : 0),
  };
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* ignore */ }
  return { before, now };
}

interface Ctx {
  v: Pick<Visitor, 'code' | 'origin' | 'district'>;
  t: IslandTime;
  /** Visits before this one. */
  seen: Visits;
  /** Hours since the last visit (Infinity the first time). */
  away: number;
}

export interface Encounter {
  id: string;
  /** Who says it; null for something you notice yourself. */
  who: string | null;
  when: (c: Ctx) => boolean;
  line: L | ((c: Ctx) => L);
}

const about = (r: Regular, h: number) => (r.hours[0] <= r.hours[1] ? h >= r.hours[0] && h < r.hours[1] : h >= r.hours[0] || h < r.hours[1]);
const cast = (id: string) => CAST.find((r) => r.id === id)!;

export const ENCOUNTERS: Encounter[] = [
  { id: 'lian-first', who: 'lian', when: (c) => c.seen.n === 0 && about(cast('lian'), c.t.hours),
    line: { en: 'New? The lift on the left skips your floor. Take the right one.', zh: '新来的？左边那部电梯不停你这层，坐右边的。' } },
  { id: 'lian-daily', who: 'lian', when: (c) => c.seen.days >= 2 && about(cast('lian'), c.t.hours), line: cast('lian').lines[0] },
  { id: 'lian-door', who: 'lian', when: (c) => c.seen.n >= 1 && c.t.hours >= 17 && c.t.hours < 21, line: cast('lian').lines[1] },
  { id: 'rahim', who: 'rahim', when: (c) => about(cast('rahim'), c.t.hours) && c.t.weekday !== 0, line: cast('rahim').lines[0] },
  { id: 'rahim-rain', who: 'rahim', when: (c) => about(cast('rahim'), c.t.hours) && c.t.day % 3 === 0, line: cast('rahim').lines[1] },
  { id: 'huat', who: 'huat', when: (c) => about(cast('huat'), c.t.hours), line: (c) => cast('huat').lines[c.t.weekday === 0 ? 0 : 1] },
  { id: 'goh-gas', who: 'goh', when: (c) => c.t.weekday === 3 && about(cast('goh'), c.t.hours), line: cast('goh').lines[1] },
  { id: 'goh-book', who: 'goh', when: (c) => c.seen.days >= 3 && about(cast('goh'), c.t.hours), line: cast('goh').lines[0] },
  { id: 'lim-late', who: 'lim', when: (c) => about(cast('lim'), c.t.hours), line: (c) => cast('lim').lines[c.seen.late % 2] },
  { id: 'away', who: 'lian', when: (c) => c.away > 24 * 6 && about(cast('lian'), c.t.hours),
    line: { en: 'Long time no see. Your plants are dead, I think. I did not water them, they are not mine.', zh: '好久没看到你。你的花大概死了。我没浇，不是我的花。' } },
  { id: 'quiet', who: null, when: (c) => c.t.hours >= 1 && c.t.hours < 5,
    line: { en: 'The corridor light hums. Somebody upstairs is still watching television with the sound off.', zh: '走廊的灯嗡嗡响。楼上有人还开着电视，没开声音。' } },
  { id: 'rain', who: null, when: () => true,
    line: { en: 'Someone has left an umbrella against your door. Not yours. It stays there.', zh: '有人把一把伞靠在你家门口。不是你的。它就一直放在那儿。' } },
];

/**
 * What happens today when you come home: one encounter, the first that holds,
 * in an order shuffled by your name and the hour, so two residents coming home
 * at the same time do not meet the same person.
 */
export function encounter(v: Ctx['v'], seen: Visits, at = Date.now()): { id: string; line: L; by: Regular | null } | null {
  const t = islandNow(at);
  const c: Ctx = { v, t, seen, away: seen.last ? (at - seen.last) / 3.6e6 : Infinity };
  const seed = `${normCode(v.code)}#${t.month}#${t.day}#${t.hours}`;
  // the special ones first, the everyday ones after, shuffled within each
  const ranked = ENCOUNTERS.map((e, i) => ({ e, k: (e.id === 'lian-first' || e.id === 'away' ? 0 : 1) * 2 ** 32 + hash(`${seed}#${e.id}`) })).sort((a, b) => a.k - b.k);
  const hit = ranked.find(({ e }) => e.when(c))?.e;
  return hit ? { id: hit.id, line: typeof hit.line === 'function' ? hit.line(c) : hit.line, by: hit.who ? cast(hit.who) : null } : null;
}
