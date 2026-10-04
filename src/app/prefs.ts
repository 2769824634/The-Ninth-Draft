/** User preferences in localStorage. Every access is guarded: storage can be unavailable. */
export interface Prefs {
  theme: 'day' | 'night';
  sound: boolean;
  lang: 'en' | 'zh';
}

const KEY = 'n9:prefs';
const defaults: Prefs = { theme: 'day', sound: true, lang: 'en' };

let state: Prefs = { ...defaults };
try {
  state = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
} catch {
  /* private mode */
}

export const prefs = {
  get: <K extends keyof Prefs>(k: K): Prefs[K] => state[k],
  set<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    state[k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  },
};

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
