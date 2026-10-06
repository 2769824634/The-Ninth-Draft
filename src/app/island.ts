/**
 * Island time. Gerimis keeps Singapore time (UTC+8): today's month and day,
 * this minute, and the year is always 1999. Every clock, calendar and paper on
 * the site reads from here, so they all agree.
 */
export const ISLAND_OFFSET_H = 8;
const H = 3600e3;

export interface IslandTime {
  /** Always 1999. */
  year: 1999;
  /** 0–11 */
  month: number;
  /** 1–31. 29 February has no 1999, so it reads as the 28th. */
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  ms: number;
  /** 0 = Sunday, for that date in 1999. */
  weekday: number;
}

export function islandNow(at = Date.now()): IslandTime {
  const d = new Date(at + ISLAND_OFFSET_H * H);
  const month = d.getUTCMonth();
  const day = month === 1 && d.getUTCDate() === 29 ? 28 : d.getUTCDate();
  return {
    year: 1999,
    month,
    day,
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
    weekday: new Date(Date.UTC(1999, month, day)).getUTCDay(),
  };
}

/** A Date whose local getters (getMonth, getHours…) read island time, for code that wants a Date. */
export function islandDate(at = Date.now()): Date {
  const t = islandNow(at);
  return new Date(1999, t.month, t.day, t.hours, t.minutes, t.seconds, t.ms);
}

/** "1999-10-06" */
export function islandIso(at = Date.now()): string {
  const t = islandNow(at);
  return `1999-${String(t.month + 1).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
}

/** Day on the island runs 07:00–19:00, roughly Singapore's sunrise and sunset. */
export const islandIsNight = (at = Date.now()) => {
  const h = islandNow(at).hours;
  return h < 7 || h >= 19;
};

/**
 * Which half-day the island is in: changes at 07:00 and 19:00 island time.
 * A lighting choice the visitor makes lasts until the next change.
 */
export const islandHalfDay = (at = Date.now()) => Math.floor((at + (ISLAND_OFFSET_H - 7) * H) / (12 * H));

const p2 = (n: number) => String(n).padStart(2, '0');
export const hms = (h: number, m: number, s?: number) => (s === undefined ? `${p2(h)}:${p2(m)}` : `${p2(h)}:${p2(m)}:${p2(s)}`);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "06 Oct 1999" or "1999 年 10 月 6 日" */
export function islandDateLabel(zh: boolean, at = Date.now()): string {
  const t = islandNow(at);
  return zh ? `1999 年 ${t.month + 1} 月 ${t.day} 日` : `${p2(t.day)} ${MON[t.month]} 1999`;
}

/** The visitor's own clock, "15:02", or null when they keep island time anyway. */
export function visitorClock(at = Date.now()): string | null {
  const d = new Date(at);
  if (-d.getTimezoneOffset() === ISLAND_OFFSET_H * 60) return null;
  return hms(d.getHours(), d.getMinutes());
}
