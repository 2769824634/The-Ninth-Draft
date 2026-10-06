/**
 * The Data Section office page. The scene (scene.ts) is the room; this file
 * builds the computer's screen (five programs behind function keys: the
 * revision log, the year field, the district clocks, the backup tapes and
 * the terminal), the head column, the keyboard and ARCHIVIST.
 */
import { fromHere } from '../ui/recordlink';
import type { MachineData } from '../../lib/machine';
import type { ArchivistLines } from '../types';
import { flat } from '../flat';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { isFiled } from '../island';
import { prefs } from '../prefs';
import { Archivist } from '../ui/archivist';
import { DISTRICTS } from '../visitor/districts';
import { BackupScreen, ClockScreen, ConsoleScreen, LogScreen, YearScreen } from './programs';
import { Deck } from './deck';
import type { Well } from './cassettes';
import type { TapeData } from '../../lib/tapes';
import { INK, clearanceKey } from '../clearance';
import { SlideShow } from './show';
import { buildTrays, caption, preload, type SlideFile, type Tray } from './slides';
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
  sofa: { en: 'The sofa and the projector', zh: '沙发和放映机' },
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
  const data = JSON.parse($('of-data').textContent || '{}') as MachineData & { base: string; notices: { file: string; slug: string; title: L; date?: string; stamp: string; category: string }[]; tapes: TapeData[]; slides: SlideFile[]; filedOn: Record<string, string | undefined> };
  // Records dated to a day still to come are not on file yet: no notice, no log line, no tape, no slide
  const on = (file: string) => isFiled(data.filedOn[file]);
  data.notices = data.notices.filter((n) => on(n.file)).slice(-5);
  data.log = data.log.filter((l) => on(l.file) && isFiled(l.date));
  data.files = data.files.filter((f) => on(f.file));
  data.tapes = data.tapes.filter((t) => t.kind !== 'record' || on(t.label));
  data.slides = data.slides.filter((f) => on(f.file));
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
    else if (zone === 'sofa') drawShow(item);
    else if (zone === 'wall') {
      for (const n of data.notices) item(n.file, T(n.title), () => (location.href = fromHere(`${base}records/${n.slug}/`)));
      item('⌚', isZh() ? '墙上的钟：换一个区' : 'The clock: another district', cycleClock);
    }
  };
  const setZone = (z: Zone) => {
    if (z !== 'deck' && held) putBack();
    if (z !== 'sofa' && heldTray) putBackTray();
    zone = z;
    if (scene) scene.lightsDown = z === 'sofa';
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
  // two wells, one rack. A tape is taken out and read before it goes in.
  const decks: Record<Well, Deck> = { A: new Deck(), B: new Deck() };
  const WELLS: Well[] = ['A', 'B'];
  let active: Well = 'A';
  let held: TapeData | null = null;
  const tapeOf = (id: string) => data.tapes.find((t) => t.id === id);
  const inkOf = (t: TapeData) => (t.kind === 'music' ? INK.conf : t.kind === 'record' ? INK[clearanceKey(t.stamp ?? '')] : INK.draft);
  const wellOf = (id: string) => WELLS.find((w) => decks[w].tape?.id === id);
  const freeWell = () => WELLS.find((w) => !decks[w].tape) ?? active;
  const KIND: Record<TapeData['kind'], L> = {
    music: { en: 'Music', zh: '音乐' },
    dictation: { en: 'Dictation', zh: '口述' },
    file: { en: 'Recording', zh: '录音' },
    record: { en: 'File, read aloud', zh: '档案朗读' },
  };
  const STATE: Record<string, L> = {
    empty: { en: 'empty', zh: '空' },
    stop: { en: 'stopped', zh: '停' },
    play: { en: 'playing', zh: '在放' },
    rew: { en: 'rewinding', zh: '倒带' },
    end: { en: 'at the end', zh: '放完了' },
  };
  const here = () => {
    if (zone !== 'deck') return;
    $('of-here').textContent = held ? `${T(ZONE_NAME.deck)} · ${isZh() ? '手里' : 'in hand'} · ${held.label}` : `${T(ZONE_NAME.deck)} · ${active} · ${T(STATE[decks[active].mode])}`;
  };
  const btn = (mark: string, label: string, on: () => void, opts: { off?: boolean; cls?: string } = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.disabled = !!opts.off;
    if (opts.cls) b.className = opts.cls;
    b.innerHTML = `<i>${mark}</i><span></span>`;
    b.querySelector('span')!.textContent = label;
    b.addEventListener('click', on);
    return b;
  };
  function drawDeck(item: (mark: string, label: string, on: () => void) => void) {
    // the tape in hand: is this the one?
    if (held) {
      const t = held;
      const li = document.createElement('li');
      li.className = 'of-hold';
      li.style.setProperty('--cloth', inkOf(t));
      li.innerHTML = `<p class="of-hold__q micro"></p><p class="of-hold__t"><b></b> <span></span></p><p class="of-hold__k micro"></p><div class="of-hold__do"></div>`;
      li.querySelector('.of-hold__q')!.textContent = isZh() ? '是这盘吗？' : 'This one?';
      li.querySelector('b')!.textContent = t.label;
      li.querySelector('.of-hold__t span')!.textContent = T(t.title);
      li.querySelector('.of-hold__k')!.textContent = T(KIND[t.kind]);
      const row = li.querySelector('.of-hold__do')!;
      const pick = freeWell();
      for (const w of WELLS) {
        const busy = decks[w].tape;
        const label = isZh() ? `放进 ${w} 仓` : `Into deck ${w}`;
        row.append(btn('↘', busy ? `${label} · ${isZh() ? '换下' : 'swap'} ${busy.label}` : label, () => confirm(w), { cls: w === pick ? 'is-pick' : '' }));
      }
      row.append(btn('↩', isZh() ? '放回去' : 'Put it back', () => putBack()));
      listEl.append(li);
    }
    // transport, one row per well
    for (const w of WELLS) {
      const d = decks[w];
      const li = document.createElement('li');
      li.className = `of-deck${w === active ? ' is-active' : ''}`;
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'of-deck__well';
      name.innerHTML = `<b>${w}</b><span></span>`;
      name.querySelector('span')!.textContent = d.tape ? d.tape.label : isZh() ? '空' : 'empty';
      name.title = d.tape ? T(d.tape.title) : '';
      name.addEventListener('click', () => {
        active = w;
        drawList();
      });
      const playing = d.mode === 'play';
      li.append(
        name,
        btn(playing ? 'Ⅱ' : '▶', playing ? (isZh() ? '停' : 'Pause') : isZh() ? '放' : 'Play', () => press(w), { off: !d.tape }),
        btn('◀◀', isZh() ? '倒带' : 'Rew', () => d.rewind(), { off: !d.tape }),
        btn('⏏', isZh() ? '退带' : 'Eject', () => eject(w), { off: !d.tape }),
      );
      listEl.append(li);
    }
    // the rack
    for (const shelf of SHELVES) {
      const tapes = data.tapes.filter((t) => shelf.kind.includes(t.kind));
      if (!tapes.length) continue;
      const h = document.createElement('li');
      h.className = 'of-shelf micro';
      h.textContent = T(shelf);
      listEl.append(h);
      for (const t of tapes) {
        const w = wellOf(t.id);
        item(t.label, T(t.title) + (w ? ` · ${w}` : held?.id === t.id ? (isZh() ? ' · 手里' : ' · in hand') : ''), () => take(t));
        const b = listEl.lastElementChild!.querySelector('button')!;
        b.style.setProperty('--cloth', inkOf(t));
        b.classList.toggle('is-on', !!w || held?.id === t.id);
      }
    }
    here();
  }

  /** Off the rack and into the hand (a tape already in a well just becomes the active one). */
  function take(t: TapeData) {
    audio.unlock();
    const w = wellOf(t.id);
    if (w) {
      active = w;
      return drawList();
    }
    if (held?.id === t.id) return;
    if (held) putBack();
    if (zone !== 'deck') scene?.goZone('deck');
    held = t;
    audio.flick();
    scene?.room.shelf.take(t.id, () => audio.click());
    if (scene) scene.holding = true;
    voice.say(`office.tape-${t.kind}`, { tape: T(t.title) }, false);
    drawList();
  }

  function putBack() {
    if (!held) return;
    const t = held;
    held = null;
    if (scene) scene.holding = false;
    audio.paper();
    scene?.room.shelf.putBack(t.id, () => audio.tick());
    drawList();
  }

  /** From the hand into a well; whatever was in it goes home first. Then it plays. */
  function confirm(w: Well) {
    if (!held) return;
    const t = held;
    held = null;
    if (scene) scene.holding = false;
    const old = decks[w].tape;
    if (old) eject(w);
    active = w;
    const go = () => {
      decks[w].load(t);
      press(w, true);
    };
    // the old tape has to be out of the door before the new one goes in
    if (scene) window.setTimeout(() => scene?.room.shelf.load(t.id, w, go), old ? 450 : 0);
    else go();
    drawList();
  }

  function eject(w: Well) {
    const t = decks[w].tape;
    if (!t) return;
    decks[w].eject();
    scene?.room.shelf.eject(t.id, w, () => audio.tick());
  }

  /** Play / pause a well. Only one plays at a time: the other one pauses. */
  function press(w: Well = active, forcePlay = false): void {
    audio.unlock();
    const d = decks[w];
    if (!d.tape) {
      // nothing in it: take the first tape off the rack
      if (!held) take(data.tapes[0]);
      return;
    }
    // pressing play is asking for sound
    if (!prefs.get('sound') && (forcePlay || d.mode !== 'play')) document.getElementById('btn-sound')?.click();
    active = w;
    if (forcePlay || d.mode !== 'play') {
      for (const o of WELLS) if (o !== w) decks[o].pause();
      d.play();
    } else d.pause();
  }
  for (const w of WELLS) decks[w].onChange = () => zone === 'deck' && drawList();
  const deckView = {
    get spin() {
      return { A: decks.A.spin, B: decks.B.spin };
    },
    get level() {
      return Math.max(decks.A.level, decks.B.level);
    },
    get counter() {
      return decks[active].counter;
    },
  };

  /* ---------------- the slide projector ---------------- */
  // trays in boxes in the crate; one is on the projector. A box is taken out and read before its tray goes on.
  const trays = buildTrays(data.slides);
  const trayOf = (id: string) => trays.find((t) => t.id === id);
  let onTray: Tray | null = trays[0] ?? null;
  let heldTray: Tray | null = null;
  let trayBusy = false;
  const slideshow = new SlideShow(onTray?.slides ?? [], () => scene?.room.projector, (on) => {
    if (scene) scene.lampOn = on;
  });
  preload(data.slides, () => slideshow.redraw());
  const fileOfSlide = () => {
    const s = slideshow.slides[slideshow.index];
    return s && (s.kind === 'cover' || s.kind === 'photo') ? s.f : null;
  };
  const count = (n: number) => (isZh() ? `${n} 张` : `${n} slide${n === 1 ? '' : 's'}`);
  const showHere = () => {
    if (zone !== 'sofa') return;
    const z = isZh();
    if (heldTray) return ($('of-here').textContent = `${T(ZONE_NAME.sofa)} · ${z ? '手里' : 'in hand'} · ${heldTray.code}`);
    if (!slideshow.slides.length) return ($('of-here').textContent = `${T(ZONE_NAME.sofa)} · ${z ? '放映机上没有托盘' : 'no tray on the projector'}`);
    const n = `${String(slideshow.index + 1).padStart(2, '0')} / ${String(slideshow.slides.length).padStart(2, '0')}`;
    $('of-here').textContent = `${onTray?.code ?? ''} · ${z ? '幻灯片' : 'Slide'} ${n} · ${caption(slideshow.slides[slideshow.index], z)}`;
  };
  function drawShow(item: (mark: string, label: string, on: () => void) => void) {
    const z = isZh();
    // the box in hand: is this the one?
    if (heldTray) {
      const t = heldTray;
      const li = document.createElement('li');
      li.className = 'of-hold';
      li.style.setProperty('--cloth', t.ink);
      li.innerHTML = `<p class="of-hold__q micro"></p><p class="of-hold__t"><b></b> <span></span></p><p class="of-hold__k micro"></p><div class="of-hold__do"></div>`;
      li.querySelector('.of-hold__q')!.textContent = z ? '是这盒吗？' : 'This one?';
      li.querySelector('b')!.textContent = t.code;
      li.querySelector('.of-hold__t span')!.textContent = T(t.title);
      li.querySelector('.of-hold__k')!.textContent = `${count(t.slides.length)} · ${caption(t.slides[0], z)}`;
      const row = li.querySelector('.of-hold__do')!;
      const label = z ? '放上放映机' : 'Onto the projector';
      row.append(btn('↗', onTray ? `${label} · ${z ? '换下' : 'swap'} ${onTray.code}` : label, () => loadTray(), { cls: 'is-pick' }));
      row.append(btn('↩', z ? '放回去' : 'Put it back', () => putBackTray()));
      listEl.append(li);
    }
    const has = slideshow.slides.length > 0;
    const li = document.createElement('li');
    li.className = 'of-deck of-show is-active';
    li.append(
      btn('⏻', slideshow.on ? (z ? '关灯' : 'Lamp off') : z ? '开灯' : 'Lamp on', () => {
        audio.unlock();
        slideshow.power();
        voice.say(slideshow.on ? (has ? 'office.projector-on' : 'office.tray-empty') : 'office.projector-off', {}, false);
      }, { cls: slideshow.on ? 'is-lit' : '' }),
      btn('◀', z ? '上一张' : 'Back', () => slideshow.prev(), { off: !has || slideshow.index === 0 }),
      btn('▶', z ? '下一张' : 'Next', () => slideshow.next(), { off: !has || slideshow.index >= slideshow.slides.length - 1 }),
      btn(slideshow.auto ? 'Ⅱ' : '⟳', slideshow.auto ? (z ? '停' : 'Stop') : z ? '自动' : 'Auto', () => slideshow.toggleAuto(), { off: !has, cls: slideshow.auto ? 'is-lit' : '' }),
    );
    listEl.append(li);
    const f = fileOfSlide();
    if (f) item('→', z ? `打开档案 ${f.file}` : `Open file ${f.file}`, () => (location.href = fromHere(`${base}records/${f.slug}/`)));
    // the tray on the projector
    const h = document.createElement('li');
    h.className = 'of-shelf micro';
    h.textContent = onTray ? `${z ? '放映机上' : 'On the projector'} · ${onTray.code} ${T(onTray.title)}` : trayBusy ? (z ? '正在换托盘' : 'Changing trays') : z ? '放映机上没有托盘' : 'No tray on the projector';
    listEl.append(h);
    if (onTray && !trayBusy) {
      item('⏏', z ? '把托盘取下来，放回盒里' : 'Lift the tray off, back into its box', () => unloadTray());
    }
    slideshow.slides.forEach((s, i) => {
      item(String(i + 1).padStart(2, '0'), caption(s, z), () => slideshow.go(i));
      const b = listEl.lastElementChild!.querySelector('button')!;
      if (s.kind === 'cover' || s.kind === 'photo') b.style.setProperty('--cloth', INK[clearanceKey(s.f.stamp)]);
      b.classList.toggle('is-on', i === slideshow.index);
      if (s.kind === 'district' || s.kind === 'title' || s.kind === 'end') b.classList.add('is-gap');
    });
    // the crate
    const c = document.createElement('li');
    c.className = 'of-shelf micro';
    c.textContent = z ? '木箱里的片盒' : 'Boxes in the crate';
    listEl.append(c);
    for (const t of trays) {
      const where = onTray?.id === t.id ? (z ? ' · 在放映机上' : ' · on the projector') : heldTray?.id === t.id ? (z ? ' · 手里' : ' · in hand') : '';
      item(t.code, `${T(t.title)} · ${count(t.slides.length)}${where}`, () => takeTray(t));
      const b = listEl.lastElementChild!.querySelector('button')!;
      b.style.setProperty('--cloth', t.ink);
      b.classList.toggle('is-on', !!where);
      b.disabled = trayBusy || onTray?.id === t.id;
    }
    showHere();
    // keep the current slide in view in the list
    if (heldTray) listEl.querySelector('.of-hold')?.scrollIntoView({ block: 'nearest' });
    else listEl.querySelector('button.is-on')?.scrollIntoView({ block: 'nearest' });
  }
  slideshow.onChange = () => zone === 'sofa' && drawList();
  slideshow.onEnd = () => voice.say('office.projector-end', {}, false);

  /** A box out of the crate and up to be read. */
  function takeTray(t: Tray) {
    audio.unlock();
    if (trayBusy || onTray?.id === t.id || heldTray?.id === t.id) return;
    if (heldTray) putBackTray();
    if (zone !== 'sofa') scene?.goZone('sofa');
    heldTray = t;
    audio.flick();
    scene?.room.crate.take(t.id, () => audio.paper());
    if (scene) scene.trayView = 'hold';
    voice.say('office.tray', {}, false);
    drawList();
  }

  function putBackTray() {
    if (!heldTray) return;
    const t = heldTray;
    heldTray = null;
    if (scene && !trayBusy) scene.trayView = null;
    audio.paper();
    scene?.room.crate.putBack(t.id, () => audio.tick());
    drawList();
  }

  /** Whatever tray is on comes off and goes home; then this box goes to the trolley and its tray onto the projector. */
  function loadTray() {
    if (!heldTray || trayBusy) return;
    const t = heldTray;
    heldTray = null;
    const old = onTray;
    onTray = null;
    trayBusy = true;
    if (scene) scene.trayView = 'load';
    const on = () =>
      scene?.room.crate.load(t.id, () => {
        audio.click();
        onTray = t;
        trayBusy = false;
        slideshow.load(t.slides);
        window.setTimeout(() => {
          if (scene && !heldTray && !trayBusy) scene.trayView = null;
        }, 900);
        drawList();
      });
    if (!scene) {
      onTray = t;
      trayBusy = false;
      slideshow.load(t.slides);
    } else if (old) {
      slideshow.unload();
      window.setTimeout(() => scene?.room.crate.unload(old.id, () => window.setTimeout(on, 250), () => audio.tick()), 650);
    } else on();
    drawList();
  }

  /** The tray off the projector and back in its box, the box back in the crate. */
  function unloadTray() {
    if (!onTray || trayBusy) return;
    const old = onTray;
    onTray = null;
    trayBusy = true;
    if (scene) scene.trayView = 'load';
    slideshow.unload();
    const finish = () => {
      trayBusy = false;
      if (scene && !heldTray) scene.trayView = null;
      drawList();
    };
    if (scene) window.setTimeout(() => scene?.room.crate.unload(old.id, undefined, () => {
      audio.tick();
      finish();
    }), 650);
    else finish();
    drawList();
  }

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
      if (held) return putBack();
      if (heldTray) return putBackTray();
      return scene?.goZone('overview');
    }
    if (e.key === 'Enter' && held && !(e.target instanceof HTMLButtonElement)) return confirm(freeWell());
    if (e.key === 'Enter' && heldTray && !(e.target instanceof HTMLButtonElement)) return loadTray();
    if (e.target instanceof HTMLInputElement) return;
    if (/^[0-4]$/.test(e.key)) scene?.goZone(ZONES[Number(e.key)]);
    else if (zone === 'sofa' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || (e.key === ' ' && !(e.target instanceof HTMLButtonElement)))) {
      e.preventDefault();
      audio.unlock();
      if (!slideshow.on) slideshow.power(true);
      else if (e.key === 'ArrowLeft') slideshow.prev();
      else slideshow.next();
    }
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
          : k === 'projector'
            ? isZh() ? `放映机 · 点一下${slideshow.on ? '关' : '开'}灯` : `Projector · click to switch the lamp ${slideshow.on ? 'off' : 'on'}`
            : k.startsWith('tray:')
            ? (() => {
                const t = trayOf(k.slice(5));
                if (!t) return '';
                const on = onTray?.id === t.id ? (isZh() ? ' · 在放映机上' : ' · on the projector') : '';
                return `${t.code} · ${T(t.title)} · ${count(t.slides.length)}${on}`;
              })()
            : k === 'screen'
            ? isZh() ? '幕布 · 点一下换下一张' : 'Screen · click for the next slide'
            : k.startsWith('tape:')
            ? (() => {
                const t = tapeOf(k.slice(5));
                const w = t && wellOf(t.id);
                return t ? `${t.label} · ${T(t.title)}${w ? ` · ${w}` : ''}` : '';
              })()
            : k === 'deck-play'
            ? isZh() ? '磁带机 · 点一下放 / 停' : 'Cassette deck · click to play or stop'
            : k === 'clock' ? (isZh() ? '挂钟 · 点一下换一个区' : 'Wall clock · click for another district') : T(ZONE_NAME[k as Zone] ?? { en: k, zh: k });
        call.classList.add('is-on');
      },
      notice: (slug) => (location.href = fromHere(`${base}records/${slug}/`)),
      clock: cycleClock,
      deck: () => press(),
      projector: () => {
        audio.unlock();
        slideshow.power();
        voice.say(slideshow.on ? (slideshow.slides.length ? 'office.projector-on' : 'office.tray-empty') : 'office.projector-off', {}, false);
      },
      screen: () => {
        audio.unlock();
        if (!slideshow.on) slideshow.power(true);
        else slideshow.next();
      },
      trayBox: (id) => {
        const t = trayOf(id);
        if (t) takeTray(t);
      },
      tape: (id) => {
        const t = tapeOf(id);
        if (!t) return;
        const w = wellOf(id);
        // a tape in a well: clicking it is play / stop on that well
        if (w) press(w);
        else take(t);
      },
    }, data.tapes.map((t) => ({ id: t.id, code: t.label, title: T(t.title), ink: inkOf(t) })), trays.map((t) => ({ id: t.id, code: t.code, title: T(t.title), count: t.slides.length, ink: t.ink })), isZh());
    if (slideshow.slides.length) {
      scene.room.projector.turnTo(0);
      scene.room.projector.setDrop(0, true);
    }
    scene.deckView = deckView;
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
    scene?.room.shelf.relabel((id) => T(tapeOf(id)?.title ?? { en: '', zh: '' }));
    slideshow.redraw();
    scene?.room.crate.relabel((id) => T(trayOf(id)?.title ?? { en: '', zh: '' }), isZh());
  });
  root.dataset.zone = zone;
  drawList();
  window.setTimeout(() => voice.say('office.enter'), 900);
}
