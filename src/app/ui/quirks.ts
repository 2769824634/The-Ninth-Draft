/**
 * Small things to find by poking around. None of them is locked and none of
 * them hides content: they only answer the visitor who clicks on things.
 *
 *   year      the footer year tries to roll over to 2000 and is refused; nine quick
 *             clicks and the whole page falls back to 1900 in a downpour, then is revised
 *   negative  holding a portrait shows its negative
 *   stamp     visitors can put their own stamp on a file (kept in their browser)
 *   poke      clicking the ARCHIVIST line gets a reaction; five clicks annoy it
 *   ink       every click leaves a small ink blot that bleeds and fades
 *   away      leaving the tab and coming back
 *   copy      copied record text comes with the Office's footnote
 *   console   a note for whoever opens the developer tools
 */
import type { Archivist } from './archivist';
import type { System } from './system';
import { audio } from '../audio';
import { downpour } from './downpour';
import { reducedMotion } from '../prefs';
import { isZh, t, onLang } from '../i18n';

const STAMPS = ['VERIFIED', 'TO BE CORRECTED', 'REJECTED'] as const;
const STAMP_KEY = 'n9:stamps';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function quirks(root: HTMLElement, voice: Archivist, system: System) {
  year(system);
  negative(voice);
  stamp(voice);
  poke(voice);
  ink(root);
  away(voice);
  copyNote();
  consoleNote();
}

/* ---------- the year that will not turn ---------- */
function year(system: System) {
  const el = document.getElementById('year');
  if (!el) return;
  const num = el.querySelector('b')!;
  let busy = false;
  // Nine quick clicks bring the downpour
  let streak = 0;
  let lastClick = 0;
  const roll = async () => {
    const now = performance.now();
    streak = now - lastClick < 3000 ? streak + 1 : 1;
    lastClick = now;
    if (streak >= 9) {
      streak = 0;
      await downpour();
      system.say('backflow', true);
      return;
    }
    if (busy) return;
    busy = true;
    el.classList.add('is-rolling');
    audio.flick();
    for (const y of ['2000', '1900', '19 00', '1999']) {
      num.textContent = y;
      await wait(reducedMotion() ? 120 : 260);
    }
    el.classList.remove('is-rolling');
    system.say('rollover', true);
    busy = false;
  };
  el.addEventListener('click', roll);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      void roll();
    }
  });
}

/* ---------- hold a portrait to see the negative ---------- */
function negative(voice: Archivist) {
  const dossier = document.getElementById('dossier');
  if (!dossier) return;
  let held: HTMLElement | null = null;
  let timer = 0;
  const release = () => {
    window.clearTimeout(timer);
    held?.classList.remove('is-negative');
    held = null;
  };
  dossier.addEventListener('pointerdown', (e) => {
    const fig = (e.target as HTMLElement).closest<HTMLElement>('.portrait');
    if (!fig) return;
    held = fig;
    // a short hold, so a plain click does nothing
    timer = window.setTimeout(() => {
      if (held !== fig) return;
      fig.classList.add('is-negative');
      audio.flick();
      voice.say('negative', {}, true);
    }, 280);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => dossier.addEventListener(ev, release));
}

/* ---------- the visitor's own stamp ---------- */
function stamp(voice: Archivist) {
  const btn = document.getElementById('ds-mystamp');
  const inkEl = document.getElementById('ds-mystamp-ink');
  const fileEl = document.getElementById('ds-file');
  if (!btn || !inkEl || !fileEl) return;

  const load = (): Record<string, { s: number; r: number }> => {
    try { return JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); } catch { return {}; }
  };
  const save = (m: Record<string, { s: number; r: number }>) => {
    try { localStorage.setItem(STAMP_KEY, JSON.stringify(m)); } catch { /* private window: the stamp lasts for this page only */ }
  };
  let mem = load();
  const current = () => fileEl.textContent?.match(/[A-Z]-\d{4}/)?.[0] ?? '';

  const show = (animate: boolean) => {
    const st = mem[current()];
    inkEl.classList.remove('is-pressed');
    if (!st) {
      inkEl.hidden = true;
      return;
    }
    inkEl.hidden = false;
    inkEl.textContent = STAMPS[st.s];
    inkEl.dataset.kind = String(st.s);
    inkEl.style.setProperty('--r', `${st.r}deg`);
    if (animate && !reducedMotion()) {
      void inkEl.offsetWidth;
      inkEl.classList.add('is-pressed');
    }
  };

  btn.addEventListener('click', () => {
    const file = current();
    if (!file) return;
    const prev = mem[file];
    const next = prev ? prev.s + 1 : 0;
    if (next >= STAMPS.length) delete mem[file];
    else mem[file] = { s: next, r: Math.round((Math.random() * 14 - 7) * 10) / 10 };
    save(mem);
    show(true);
    if (mem[file]) {
      audio.stamp();
      voice.say(`stamp.${STAMPS[mem[file].s] === 'VERIFIED' ? 'verified' : STAMPS[mem[file].s] === 'REJECTED' ? 'rejected' : 'correct'}`, { file });
    } else voice.say('stamp.clear', { file });
  });

  // The dossier swaps files in place: follow its file number
  new MutationObserver(() => {
    mem = load();
    show(false);
  }).observe(fileEl, { childList: true, characterData: true, subtree: true });
  show(false);
}

/* ---------- poke the ARCHIVIST ---------- */
function poke(voice: Archivist) {
  const el = document.getElementById('voice');
  if (!el) return;
  let n = 0;
  let reset = 0;
  el.addEventListener('click', () => {
    window.clearTimeout(reset);
    n += 1;
    reset = window.setTimeout(() => (n = 0), 6000);
    if (n >= 5) {
      n = 0;
      voice.say('pokeAngry');
    } else voice.say('poke');
  });
}

/* ---------- ink where you click ---------- */
function ink(root: HTMLElement) {
  if (reducedMotion()) return;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const b = document.createElement('i');
    b.className = 'inkblot';
    b.style.left = `${e.clientX}px`;
    b.style.top = `${e.clientY}px`;
    b.style.setProperty('--r', `${Math.floor(Math.random() * 360)}deg`);
    document.body.appendChild(b);
    window.setTimeout(() => b.remove(), 1100);
  }, { passive: true });
}

/* ---------- leaving the tab ---------- */
function away(voice: Archivist) {
  let title = document.title;
  let left = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      title = document.title;
      left = Date.now();
      document.title = t('Gerimis · Backflow in progress…');
    } else {
      document.title = title;
      if (left && Date.now() - left > 8000) setTimeout(() => voice.say('away'), 500);
      left = 0;
    }
  });
  onLang(() => {
    if (document.hidden) document.title = t('Gerimis · Backflow in progress…');
  });
}

/* ---------- copying from a record ---------- */
function copyNote() {
  document.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !e.clipboardData) return;
    const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (!node?.closest('#dossier')) return;
    const foot = isZh() ? '\n\n—— 霏微记录署 · 已修订 · 第九稿' : '\n\n— Records Office, Gerimis · Revised · Draft 09';
    e.clipboardData.setData('text/plain', sel.toString() + foot);
    e.preventDefault();
  });
}

/* ---------- for the curious ---------- */
function consoleNote() {
  const s = 'font: 600 13px/1.6 monospace; color: #b8281d';
  const m = 'font: 12px/1.6 monospace; color: inherit';
  // eslint-disable-next-line no-console
  console.log('%cRECORDS OFFICE · GERIMIS · 1999\n%cIf you are reading this, Heuss would like a word.\n如果你在看这里，Heuss 想见你。', s, m);
}
