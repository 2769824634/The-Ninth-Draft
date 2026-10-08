/** User preferences in localStorage. Every access is guarded: storage can be unavailable. */
import { islandHalfDay, islandIsNight } from './island';

export interface Prefs {
  /** Lighting follows island time; a choice the visitor makes holds until the next 07:00 or 19:00 on the island. */
  theme: 'day' | 'night';
  /** The island half-day the lighting was last chosen in. */
  themeHalf?: number;
  sound: boolean;
  lang: 'en' | 'zh';
  /** A file taken to the table opens at once, instead of waiting shut on the blotter for the reader to open it. */
  openAtOnce?: boolean;
}

const KEY = 'n9:prefs';
const defaults: Prefs = { theme: 'day', sound: true, lang: 'en' };

let state: Prefs = { ...defaults };
try {
  state = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* private mode */
}
if (state.themeHalf !== islandHalfDay()) state.theme = islandIsNight() ? 'night' : 'day';

export const prefs = {
  get: <K extends keyof Prefs>(k: K): Prefs[K] => state[k],
  set<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    state[k] = v;
    if (k === 'theme') state.themeHalf = islandHalfDay();
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  },
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
