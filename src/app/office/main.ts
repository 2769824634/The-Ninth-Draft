/**
 * The Data Section office page. The scene (scene.ts) is the room; this file
 * builds the computer's screen (five programs behind function keys: the
 * revision log, the year field, the district clocks, the backup tapes and
 * the terminal), the head column, the keyboard and ARCHIVIST.
 */
import type { MachineData } from '../../lib/machine';
import type { ArchivistLines } from '../types';
import { flat } from '../flat';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { prefs } from '../prefs';
import { Archivist } from '../ui/archivist';
import { DISTRICTS } from '../visitor/districts';
import { BackupScreen, ClockScreen, ConsoleScreen, LogScreen, YearScreen } from './programs';
import { Deck } from './deck';
import type { TapeData } from '../../lib/tapes';
import { INK, clearanceKey } from '../clearance';
import { OfficeScene, ZONES, type Zone } from './scene';
import lines from '../../data/archivist.json';

type L = { en: string; zh: string };
type Program = 'log' | 'year' | 'clocks' | 'backup' | 'console';
const PROGRAMS: { id: Program; key: string; en: string; zh: string }[] = [
  { id: 'console', key: 'F1', en: 'TERMINAL', zh: '终端' },
  { id: 'log', key: 'F2', en: 'LOG', zh: '日志' },
  { id: 'year', key: 'F3', en: 'YEAR', zh: '年份' },
  { id: 'clocks', key: 'F4', en: 'CLOCKS', zh: '时钟' },
  { id: 'backup', key: 'F5', en: 'TAPES', zh: '磁带' },
];
const ZONE_NAME: Record<Zone, L> = {
  overview: { en: 'The whole room', zh: '整间办公室' },
  desk: { en: 'The desk and the computer', zh: '办公桌和电脑' },
  sofa: { en: 'The sofa', zh: '沙发' },
  wall: { en: 'Notice board and calendar', zh: '告示板和挂历' },
  deck: { en: 'The cassette deck', zh: '磁带机' },
};
const SHELVES: { kind: TapeData['kind'][]; en: string; zh: string }[] = [
  { kind: ['music'], en: 'Music', zh: '音乐' },
  { kind: ['dictation', 'file'], en: 'Recordings', zh: '录音' },
  { kind: ['record'], en: 'Files, read aloud', zh: '档案朗读' },
];

export function office() {
  const $ = (id: string) => document.getElementById(id)!;
  const data = JSON.parse($('of-data').textContent || '{}') as MachineData & { base: string; notices: { file: string; slug: string; title: L; date?: string; stamp: string; category: string }[]; tapes: TapeData[] };
  const root = $('of');
  const base = data.base;
  const voice = new Archivist(lines as unknown as ArchivistLines, 'office.idle');
  const T = (l: L) => (isZh() ? l.zh : l.en);

  /* ---------------- the computer's screen ---------------- */
  const pc = document.createElement('div');
  pc.className = 'pc';
  pc.innerHTML = `<nav class="pc__keys">${PROGRAMS.map((p) => `<button type="button" data-p="${p.id}"><b>${p.key}</b> <span></span></button>`).join('')}</nav><div class="pc__stack"></div><i class="crt__scan"></i>`;
  const stack = pc.querySelector<HTMLElement>('.pc__stack')!;
  let scene: OfficeScene | null = null;
  const programs = {
    log: new LogScreen(data.log, base),
    year: new YearScreen(base, () => audio.glitch()),
    clocks: new ClockScreen(base),
    backup: new BackupScreen(data.files, () => {}),
    console: null as unknown as ConsoleScreen,
  };
  programs.console = new ConsoleScreen(data, base, {
    focus: (z) => show(z as Program),
    rollover: () => {
      show('year');
      void programs.year.rollover();
    },
    sync: () => {
      show('clocks');
      void programs.clocks.sync();
    },
    restore: (f, n) => {
      show('backup');
      return programs.backup.restore(f, n);
    },
    logout: () => {
      voice.say('office.logout');
      scene?.power(false);
      window.setTimeout(() => scene?.goZone('overview'), 700);
    },
  });
  for (const p of PROGRAMS) {
    const g = programs[p.id].screen.glass;
    g.classList.add('crt--inner');
    stack.append(g);
  }
  let program: Program = 'console';
  function show(p: Program) {
    program = p;
    stack.querySelectorAll<HTMLElement>('.crt').forEach((g) => (g.hidden = g.dataset.screen !== p));
    pc.querySelectorAll<HTMLButtonElement>('.pc__keys button').forEach((b) => b.classList.toggle('is-on', b.dataset.p === p));
    audio.click();
    if (p === 'console') programs.console.focus();
  }
  pc.querySelectorAll<HTMLButtonElement>('.pc__keys button').forEach((b) => b.addEventListener('click', () => show(b.dataset.p as Program)));
  const labelKeys = () => pc.querySelectorAll<HTMLButtonElement>('.pc__keys button').forEach((b, i) => (b.querySelector('span')!.textContent = T(PROGRAMS[i])));
  // the screen needs a size before the scene measures it
  pc.style.visibility = 'hidden';
  document.body.append(pc);
  show('console');
  labelKeys();
  pc.style.visibility = '';

  /* ---------------- head column ---------------- */
  let zone: Zone = 'overview';
  const listEl = $('of-list');
  const drawList = () => {
    document.querySelectorAll<HTMLButtonElement>('#of-zones button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === zone)));
    $('of-here').textContent = T(ZONE_NAME[zone]);
    listEl.innerHTML = '';
    const item = (mark: string, label: string, on: () => void) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<i>${mark}</i><span></span>`;
      b.querySelector('span')!.textContent = label;
      b.addEventListener('click', on);
      li.append(b);
      listEl.append(li);
    };
    if (zone === 'desk') for (const p of PROGRAMS) item(p.key, T(p), () => show(p.id));
    else if (zone === 'deck') drawDeck(item);
    else if (zone === 'wall') {
      for (const n of data.notices) item(n.file, T(n.title), () => (location.href = `${base}records/${n.slug}/`));
      item('⌚', isZh() ? '墙上的钟：换一个区' : 'The clock: another district', cycleClock);
    }
  };
  const setZone = (z: Zone) => {
    zone = z;
    root.dataset.zone = z;
    drawList();
    audio.tick();
    if (z === 'desk') {
      scene?.power(true);
      window.setTimeout(() => program === 'console' && programs.console.focus(), 800);
    } else (document.activeElement as HTMLElement | null)?.blur?.();
    if (z !== 'overview') voice.say(`office.${z}`, {}, false);
  };
  document.querySelectorAll<HTMLButtonElement>('#of-zones button').forEach((b) => b.addEventListener('click', () => scene?.goZone(b.dataset.zone as Zone)));

  /* ---------------- the cassette deck ---------------- */
  const deck = new Deck();
  const inkOf = (t: TapeData) => (t.kind === 'music' ? INK.conf : t.kind === 'record' ? INK[clearanceKey(t.stamp ?? '')] : INK.draft);
  const here = () => {
    if (zone !== 'deck') return;
    const t = deck.tape;
    const state = { empty: ['EMPTY', '空'], stop: ['STOP', '停'], play: ['PLAY', '放'], rew: ['REW', '倒带'], end: ['END', '完'] }[deck.mode];
    $('of-here').textContent = t ? `${T(ZONE_NAME.deck)} · ${t.label} · ${isZh() ? state[1] : state[0]}` : `${T(ZONE_NAME.deck)} · ${isZh() ? '空着' : 'empty'}`;
  };
  function drawDeck(item: (mark: string, label: string, on: () => void) => void) {
    // transport keys
    const li = document.createElement('li');
    li.className = 'of-deck';
    const keys: [string, L, () => void, boolean][] = [
      [deck.mode === 'play' ? 'Ⅱ' : '▶', deck.mode === 'play' ? { en: 'Pause', zh: '暂停' } : { en: 'Play', zh: '放' }, () => press(), !deck.tape],
      ['◀◀', { en: 'Rewind', zh: '倒带' }, () => deck.rewind(), !deck.tape],
      ['⏏', { en: 'Eject', zh: '退带' }, () => deck.eject(), !deck.tape],
    ];
    for (const [mark, label, on, off] of keys) {
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = off;
      b.innerHTML = `<i>${mark}</i><span></span>`;
      b.querySelector('span')!.textContent = T(label);
      b.addEventListener('click', on);
      li.append(b);
    }
    listEl.append(li);
    for (const shelf of SHELVES) {
      const tapes = data.tapes.filter((t) => shelf.kind.includes(t.kind));
      if (!tapes.length) continue;
      const h = document.createElement('li');
      h.className = 'of-shelf micro';
      h.textContent = T(shelf);
      listEl.append(h);
      for (const t of tapes) {
        item(t.label, T(t.title), () => insert(t, true));
        const b = listEl.lastElementChild!.querySelector('button')!;
        b.style.setProperty('--cloth', inkOf(t));
        b.classList.toggle('is-on', deck.tape?.id === t.id);
      }
    }
    here();
  }
  function insert(t: TapeData, autoplay: boolean): void {
    if (deck.tape?.id === t.id) return press();
    deck.load(t);
    scene?.room.setCassette({ code: t.label, title: T(t.title), ink: inkOf(t) });
    voice.say(`office.tape-${t.kind}`, { tape: T(t.title) }, false);
    if (autoplay) window.setTimeout(() => press(true), 450);
  }
  function press(forcePlay = false): void {
    audio.unlock();
    // pressing play is asking for sound
    if (!prefs.get('sound') && (forcePlay || deck.mode !== 'play')) document.getElementById('btn-sound')?.click();
    if (!deck.tape) return insert(data.tapes[0], true);
    if (forcePlay) deck.play();
    else deck.toggle();
  }
  deck.onChange = () => {
    if (!deck.tape) scene?.room.setCassette(null);
    if (zone === 'deck') drawList();
  };

  /* ---------------- the clock on the wall ---------------- */
  let clockAt = 0;
  function cycleClock() {
    clockAt = (clockAt + 1) % DISTRICTS.length;
    const d = DISTRICTS[clockAt];
    scene?.setClock(d.tz, d.en.toUpperCase());
    audio.tick();
    voice.say('office.clock', { district: isZh() ? d.zh : d.en }, false);
  }

  /* ---------------- keyboard ---------------- */
  // in front of the terminal, typing goes to it (before the site's own shortcuts)
  window.addEventListener(
    'keydown',
    (e) => {
      if (zone !== 'desk' || e.metaKey || e.ctrlKey || e.altKey) return;
      const f = /^F([1-5])$/.exec(e.key);
      if (f) {
        e.preventDefault();
        return show(PROGRAMS[Number(f[1]) - 1].id);
      }
      if (program !== 'console' || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'Escape') return;
      if (programs.console.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      (document.activeElement as HTMLElement | null)?.blur?.();
      return scene?.goZone('overview');
    }
    if (e.target instanceof HTMLInputElement) return;
    if (/^[0-4]$/.test(e.key)) scene?.goZone(ZONES[Number(e.key)]);
    else if (e.key === ' ' && zone === 'deck' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      press();
    }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = ZONES.indexOf(zone) + (e.key === 'ArrowRight' ? 1 : -1);
      scene?.goZone(ZONES[(i + ZONES.length) % ZONES.length]);
    }
  });

  /* ---------------- the room ---------------- */
  const call = $('of-callout');
  try {
    scene = new OfficeScene(root, $('of-canvas') as HTMLCanvasElement, pc, data.notices.map((n) => ({ ...n, title: n.title.en })), {
      zone: setZone,
      hover: (k) => {
        if (!k) return call.classList.remove('is-on');
        const n = data.notices.find((x) => x.slug === k);
        call.textContent = n
          ? `${n.file} · ${T(n.title)}`
          : k === 'deck-play'
            ? isZh() ? '磁带机 · 点一下放 / 停' : 'Cassette deck · click to play or stop'
            : k === 'clock' ? (isZh() ? '挂钟 · 点一下换一个区' : 'Wall clock · click for another district') : T(ZONE_NAME[k as Zone] ?? { en: k, zh: k });
        call.classList.add('is-on');
      },
      notice: (slug) => (location.href = `${base}records/${slug}/`),
      clock: cycleClock,
      deck: () => press(),
    });
    scene.deckView = {
      get spin() {
        return deck.spin;
      },
      get level() {
        return deck.level;
      },
      get counter() {
        return deck.counter;
      },
    };
    scene.setTheme(prefs.get('theme'));
    requestAnimationFrame(() => root.classList.add('is-lit'));
  } catch (err) {
    console.error('[office] room unavailable', err);
    root.classList.add('no-webgl', 'is-lit');
  }
  new MutationObserver(() => scene?.setTheme(document.documentElement.dataset.theme === 'night' ? 'night' : 'day')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  flat(() => {
    for (const p of Object.values(programs)) p.render();
    show(program);
    labelKeys();
    drawList();
  });
  root.dataset.zone = zone;
  drawList();
  window.setTimeout(() => voice.say('office.enter'), 900);
}
