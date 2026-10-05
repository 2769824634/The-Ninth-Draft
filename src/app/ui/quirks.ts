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
      return downpour(system, num);
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

/* ---------- nine clicks: the page falls back to 1900 ---------- */
let storming = false;

async function downpour(system: System, num: HTMLElement) {
  if (storming) return;
  storming = true;
  const calm = reducedMotion();
  const root = document.documentElement;
  const veil = document.createElement('div');
  veil.className = 'flood';
  veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<canvas class="flood__rain"></canvas><div class="flood__year"><b>1999</b></div><div class="flood__stamp">REVISED</div>';
  root.append(veil);
  const big = veil.querySelector('b')!;
  const stamp = veil.querySelector<HTMLElement>('.flood__stamp')!;
  const canvas = veil.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const ink = getComputedStyle(document.body).color || '#222';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  size();
  // Rain: slanted streaks, harder at first
  let intensity = 1;
  let running = true;
  const drops = Array.from({ length: calm ? 0 : 320 }, () => ({ x: Math.random(), y: Math.random(), l: 18 + Math.random() * 46, v: 1.1 + Math.random() * 1.6 }));
  const rain = () => {
    if (!running) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = ink;
    g.lineWidth = 1.2 * dpr;
    for (const d of drops) {
      d.y += d.v * 0.045 * intensity;
      d.x -= d.v * 0.012 * intensity;
      if (d.y > 1.1) { d.y = -0.1; d.x = Math.random() * 1.3; }
      const x = d.x * canvas.width, y = d.y * canvas.height, l = d.l * dpr * intensity;
      g.globalAlpha = 0.18 + 0.32 * Math.min(1, d.v / 2);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + l * 0.3, y - l);
      g.stroke();
    }
    requestAnimationFrame(rain);
  };
  requestAnimationFrame(rain);

  // The page's own years fall with it
  const swapped: [Text, string][] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.nodeValue && n.nodeValue.includes('1999')) swapped.push([n, n.nodeValue]);
  }
  const setYears = (to: string) => swapped.forEach(([n, o]) => (n.nodeValue = o.replace(/1999/g, to)));

  audio.downpour();
  veil.getBoundingClientRect();
  veil.classList.add('is-on');
  root.classList.add('is-backflow', 'is-shaking');

  // 1999 → 1900, slow at first, then a fall
  const fall = (from: number, to: number, ms: number, ease: (p: number) => number) =>
    new Promise<void>((done) => {
      const t0 = performance.now();
      let last = from;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        const v = Math.round(from + (to - from) * ease(p));
        if (v !== last) {
          last = v;
          big.textContent = String(v);
          if (v % 7 === 0) audio.tick();
        }
        if (p < 1) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });

  if (calm) {
    big.textContent = '1900';
    await wait(900);
  } else {
    await fall(1999, 1900, 1900, (p) => p * p);
  }
  setYears('1900');
  num.textContent = '1900';
  root.classList.remove('is-shaking');
  intensity = 0.45;
  await wait(calm ? 1200 : 1900);

  // The Office revises it back
  stamp.classList.add('is-down');
  audio.stamp();
  await wait(calm ? 500 : 650);
  intensity = 1.4;
  if (calm) big.textContent = '1999';
  else await fall(1900, 1999, 700, (p) => 1 - (1 - p) * (1 - p));
  setYears('1999');
  num.textContent = '1999';
  root.classList.remove('is-backflow');
  veil.classList.remove('is-on');
  await wait(450);
  running = false;
  veil.remove();
  storming = false;
  system.say('backflow', true);
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
