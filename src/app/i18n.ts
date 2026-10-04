/**
 * Language: English (the original) or Chinese (the translation).
 *
 * Interface strings are looked up by their English text in ui.zh.json, so
 * the English source stays readable and a missing entry simply shows English.
 * Records are swapped in place: every module holds the same record objects,
 * so after `applyRecords` everything reads the current language.
 */
import zh from '../data/ui.zh.json';
import { prefs } from './prefs';
import type { ArchiveRecord, RecordTexts } from './types';

export type Lang = 'en' | 'zh';
type Vars = Record<string, string | number>;

const dict = zh as Record<string, string>;
let cur: Lang = prefs.get('lang') === 'zh' ? 'zh' : 'en';
const listeners: ((l: Lang) => void)[] = [];

export const lang = () => cur;
export const isZh = () => cur === 'zh';

/** Translate an interface string. `{name}` placeholders are filled from `vars`. */
export function t(en: string, vars?: Vars) {
  const s = cur === 'zh' ? dict[en] ?? en : en;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : s;
}

export const onLang = (fn: (l: Lang) => void) => listeners.push(fn);

export function setLang(l: Lang) {
  if (l === cur) return;
  cur = l;
  prefs.set('lang', l);
  markDocument();
  listeners.forEach((fn) => fn(l));
}

/** <html lang> drives the CSS (fonts, no fake italics) and screen readers. */
export function markDocument() {
  document.documentElement.lang = cur === 'zh' ? 'zh-CN' : 'en';
  document.documentElement.dataset.lang = cur;
}

const KEYS: (keyof RecordTexts)[] = ['title', 'subtitle', 'status', 'date', 'place', 'imageCaption', 'fields', 'summary', 'body', 'tags', 'drafts', 'attachments', 'revised'];

/** Point every record at the current language (English when it has no Chinese file). */
export function applyRecords(records: ArchiveRecord[]) {
  for (const r of records) {
    if (!r.en) r.en = Object.fromEntries(KEYS.map((k) => [k, r[k]])) as unknown as RecordTexts;
    Object.assign(r, cur === 'zh' && r.zh ? r.zh : r.en);
  }
}

/* ---------- static markup ---------- */
// Original English of every text node / attribute we have translated
const origText = new WeakMap<Text, string>();
const ATTRS = ['aria-label', 'placeholder'] as const;

/**
 * Translate the fixed markup under `root`. Text written later by scripts is
 * already in the right language (it goes through `t`), so a node is only
 * restored when it still shows what this function put there.
 */
export function translateDom(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.parentElement?.closest('script, style, [data-no-i18n]')) continue;
    const known = origText.get(n);
    const src = known ?? n.data;
    const key = src.trim();
    if (!key || !(key in dict)) continue;
    const want = cur === 'zh' ? src.replace(key, dict[key]) : src;
    if (known === undefined) origText.set(n, src);
    else if (n.data !== src && n.data !== src.replace(key, dict[key])) continue; // rewritten since
    if (n.data !== want) n.data = want;
  }
  root.querySelectorAll<HTMLElement>(ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => {
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v === null) continue;
      const k = `i18n${a === 'placeholder' ? 'Ph' : 'Aria'}`;
      const src = el.dataset[k] ?? v;
      if (!(src in dict)) continue;
      el.dataset[k] = src;
      el.setAttribute(a, cur === 'zh' ? dict[src] : src);
    }
  });
}
