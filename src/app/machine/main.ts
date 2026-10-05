/**
 * The machine room: the Data Section's computers in the basement, built in
 * CSS 3D and set on the page like the drawers and the reading room, seen
 * from the same high long lens. Click a screen (or press 1–5) and the
 * camera closes in on it; every screen is live. Esc pulls back.
 */
import type { MachineData } from '../../lib/machine';
import type { ArchivistLines } from '../types';
import { flat } from '../flat';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { reducedMotion } from '../prefs';
import { Spring } from '../spring';
import { Archivist } from '../ui/archivist';
import { box, div, put } from './box';
import { BackupScreen, ClockScreen, ConsoleScreen, LogScreen, YearScreen } from './screens';
import lines from '../../data/archivist.json';

type Zone = 'overview' | 'log' | 'year' | 'clocks' | 'backup' | 'console';
const ZONES: Zone[] = ['overview', 'log', 'year', 'clocks', 'backup', 'console'];
const L: Record<Zone, { en: string; zh: string }> = {
  overview: { en: 'The whole room', zh: '整间机房' },
  log: { en: 'Revision log', zh: '修订日志' },
  year: { en: 'Year field', zh: '年份字段' },
  clocks: { en: 'District clocks', zh: '各区时钟' },
  backup: { en: 'Backup tapes', zh: '备份磁带' },
  console: { en: 'Operator console', zh: '操作员终端' },
};

const FLOOR = -60;
const CAB = { w: 600, h: 1100, d: 420, z: -800, xs: [-1300, -620, 60, 740] };
// the operator's desk stands in the front right corner, clear of the cabinets
const DESK = { x: 1310, w: 1150, h: 430, d: 600, z: 450 };
const TERM = { x: 1310, w: 600, h: 520, d: 500, z: 400 };

export function machine() {
  const $ = (id: string) => document.getElementById(id)!;
  const data = JSON.parse($('mr-data').textContent || '{}') as MachineData & { base: string };
  const root = $('mr');
  const view = $('mr-view');
  const world = $('mr-world');
  const voice = new Archivist(lines as unknown as ArchivistLines, 'machine.idle');
  const T = (l: { en: string; zh: string }) => (isZh() ? l.zh : l.en);
  const base = data.base;

  /* ---------------- the room ---------------- */
  const add = (el: HTMLElement) => world.append(el);
  // raised floor on the page, with its shadow
  const shadow = div('mr__shadow');
  add(put(shadow, 0, 0, 0));
  add(put(box({ w: 3800, h: 60, d: 2600, cls: 'mat-floor', skip: ['back', 'left'] }), 0, 0, 0));
  // two walls of the basement, cut off at the ceiling line; a pipe and a strip light on the back one
  add(put(box({ w: 3800, h: 1700, d: 60, cls: 'mat-wall', faces: { front: div('mr__wall', '<i class="mr__pipe"></i><i class="mr__tube"></i><i class="mr__notice">NO FOOD OR DRINK<br>NEAR THE MACHINES</i>') }, skip: ['back', 'left'] }), 0, FLOOR, -1270));
  add(put(box({ w: 60, h: 1700, d: 2600, cls: 'mat-wall', skip: ['back', 'left', 'front'] }), -1870, FLOOR, 0));

  const screens = {
    log: new LogScreen(data.log, base),
    year: new YearScreen(base, () => {
      root.classList.add('is-glitch');
      window.setTimeout(() => root.classList.remove('is-glitch'), 1600);
    }),
    clocks: new ClockScreen(base),
    backup: new BackupScreen(data.files, (on) => root.querySelectorAll('.mr__reel').forEach((r) => r.classList.toggle('is-spin', on))),
    console: null as unknown as ConsoleScreen,
  };

  /** Cabinet front: CRT in a bezel, a name plate, lamps (or reels), a vent. */
  const cabinet = (i: number, zone: Zone, glass: HTMLElement) => {
    const front = div('mr__panel');
    const bezel = div('mr__bezel');
    bezel.append(glass);
    front.append(bezel, div('mr__plate micro', `RECORDS OFFICE · DATA SECTION · UNIT 0${i + 1}`));
    if (zone === 'backup') front.append(div('mr__reels', '<i class="mr__reel"></i><i class="mr__reel"></i>'));
    else front.append(div('mr__lamps', Array.from({ length: 24 }, (_, k) => `<i style="--k:${(k * 37) % 11}"></i>`).join('')));
    front.append(div('mr__switches', Array.from({ length: 8 }, (_, k) => `<i class="${(k * 5 + i) % 3 ? '' : 'is-up'}"></i>`).join('')), div('mr__vent'));
    const el = box({ w: CAB.w, h: CAB.h, d: CAB.d, cls: 'mat-steel', faces: { front }, skip: ['back'] });
    el.dataset.zone = zone;
    add(put(el, CAB.xs[i], FLOOR, CAB.z));
  };
  cabinet(0, 'log', screens.log.screen.glass);
  cabinet(1, 'year', screens.year.screen.glass);
  cabinet(2, 'clocks', screens.clocks.screen.glass);
  cabinet(3, 'backup', screens.backup.screen.glass);
  // cable trough along the back
  add(put(box({ w: 3000, h: 40, d: 120, cls: 'mat-dark', skip: ['back'] }), -280, FLOOR, CAB.z - 300));

  // the operator's desk, its terminal, and what is on it
  add(put(box({ w: DESK.w, h: DESK.h, d: DESK.d, cls: 'mat-desk', faces: { front: div('mr__drawers', '<i></i><i></i><i></i>') }, skip: ['back'] }), DESK.x, FLOOR, DESK.z));
  const top = FLOOR - DESK.h;
  screens.console = new ConsoleScreen(data, base, {
    focus: (z) => go(z as Zone),
    rollover: () => void screens.year.rollover(),
    sync: () => void screens.clocks.sync(),
    restore: (f, n) => screens.backup.restore(f, n),
    logout,
  });
  const termFront = div('mr__panel mr__panel--term');
  const tb = div('mr__bezel');
  tb.append(screens.console.screen.glass);
  termFront.append(tb, div('mr__plate micro', 'TTY1 · OPERATOR'));
  const term = box({ w: TERM.w, h: TERM.h, d: TERM.d, cls: 'mat-steel', faces: { front: termFront }, skip: ['back'] });
  term.dataset.zone = 'console';
  add(put(term, TERM.x, top, TERM.z));
  add(put(box({ w: 560, h: 34, d: 190, cls: 'mat-keys', faces: { top: div('mr__keys') } }), DESK.x, top, DESK.z + 200));
  // Heuss's thermos, a stack of continuous printout, a mug ring
  add(put(box({ w: 70, h: 210, d: 70, cls: 'mat-thermos' }), DESK.x + 490, top, DESK.z + 120));
  add(put(box({ w: 300, h: 70, d: 400, cls: 'mat-paper', faces: { top: div('mr__printout') } }), DESK.x - 470, top, DESK.z + 60));
  // the operator's stool, pushed out to the side
  add(put(box({ w: 360, h: 40, d: 360, cls: 'mat-chair' }), DESK.x - 760, FLOOR - 420, DESK.z + 420));
  add(put(box({ w: 50, h: 420, d: 50, cls: 'mat-dark' }), DESK.x - 760, FLOOR, DESK.z + 420));

  /* ---------------- the camera ---------------- */
  const target: Record<Zone, { x: number; y: number; z: number; w: number; h: number; yaw: number; pitch: number }> = {
    overview: { x: 0, y: -560, z: -100, w: 4300, h: 3100, yaw: -30, pitch: -28 },
    log: { x: CAB.xs[0], y: -890, z: CAB.z + CAB.d / 2, w: 560, h: 430, yaw: 0, pitch: 0 },
    year: { x: CAB.xs[1], y: -890, z: CAB.z + CAB.d / 2, w: 560, h: 430, yaw: 0, pitch: 0 },
    clocks: { x: CAB.xs[2], y: -890, z: CAB.z + CAB.d / 2, w: 560, h: 430, yaw: 0, pitch: 0 },
    backup: { x: CAB.xs[3], y: -820, z: CAB.z + CAB.d / 2, w: 560, h: 560, yaw: 0, pitch: 0 },
    console: { x: TERM.x, y: top - 275, z: TERM.z + TERM.d / 2, w: 600, h: 470, yaw: 0, pitch: -4 },
  };
  const cam = { x: new Spring(0, 3.2), y: new Spring(-560, 3.2), z: new Spring(-100, 3.2), s: new Spring(0.2, 3.2), yaw: new Spring(-30, 3.2), pitch: new Spring(-28, 3.2), shift: new Spring(0, 3.2) };
  let zone: Zone = 'overview';

  const fit = (z: Zone) => {
    const t = target[z];
    const vw = view.clientWidth, vh = view.clientHeight;
    const portrait = vw / vh < 0.85;
    const fw = portrait ? 0.94 : z === 'overview' ? 0.66 : 0.56, fh = portrait ? (z === 'overview' ? 0.42 : 0.62) : 0.72;
    // a phone shows just the glass, edge to edge
    const w = portrait && z !== 'overview' ? 500 : t.w;
    return Math.min((vw * fw) / w, (vh * fh) / t.h);
  };
  const aim = (snap = false) => {
    const t = target[zone];
    const vw = view.clientWidth, vh = view.clientHeight;
    const portrait = vw / vh < 0.85;
    const vals = { x: t.x, y: t.y, z: t.z, s: fit(zone), yaw: t.yaw, pitch: t.pitch, shift: portrait ? 0 : vw * (zone === 'overview' ? 0.1 : 0.12) };
    for (const k of Object.keys(vals) as (keyof typeof vals)[]) {
      cam[k].target = vals[k];
      if (snap) cam[k].set(vals[k]);
    }
    void vh;
  };

  let last = performance.now();
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const sp of Object.values(cam)) sp.update(dt);
    const vw = view.clientWidth, vh = view.clientHeight;
    const portrait = vw / vh < 0.85;
    const cy = portrait ? vh * (zone === 'overview' ? 0.42 : 0.5) : vh * 0.52;
    world.style.transform = `translate3d(${vw / 2 + cam.shift.value}px, ${cy}px, 0) scale(${cam.s.value}) rotateX(${cam.pitch.value}deg) rotateY(${cam.yaw.value}deg) translate3d(${-cam.x.value}px, ${-cam.y.value}px, ${-cam.z.value}px)`;
    requestAnimationFrame(frame);
  };

  /* ---------------- corners ---------------- */
  const list = $('mr-zones');
  const drawList = () => {
    list.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.zone === zone));
      b.querySelector('span')!.textContent = T(L[b.dataset.zone as Zone]);
    });
  };
  function go(z: Zone) {
    if (z === zone) return;
    zone = z;
    root.dataset.zone = z;
    aim(reducedMotion());
    drawList();
    audio.tick();
    root.querySelectorAll<HTMLElement>('.crt').forEach((c) => c.classList.toggle('is-near', c.dataset.screen === z));
    if (z === 'console') window.setTimeout(() => screens.console.focus(), 700);
    else (document.activeElement as HTMLElement | null)?.blur?.();
    if (z !== 'overview') voice.say(`machine.${z}`, {}, false);
  }
  list.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => go(b.dataset.zone as Zone)));

  // from the whole room, a click on a screen walks over to it instead of pressing its buttons
  world.addEventListener(
    'click',
    (e) => {
      const glass = (e.target as HTMLElement).closest<HTMLElement>('.crt');
      const unit = (e.target as HTMLElement).closest<HTMLElement>('[data-zone]');
      const z = (glass?.dataset.screen ?? unit?.dataset.zone) as Zone | undefined;
      if (!z) return;
      if (zone !== z) {
        e.preventDefault();
        e.stopPropagation();
        go(z);
      }
    },
    true,
  );
  world.addEventListener('pointerover', (e) => {
    const glass = (e.target as HTMLElement).closest<HTMLElement>('.crt');
    root.querySelectorAll('.crt.is-hot').forEach((c) => c !== glass && c.classList.remove('is-hot'));
    if (glass && zone === 'overview') glass.classList.add('is-hot');
  });

  // in front of the console, typing goes to the console (before the site's own shortcuts see it)
  window.addEventListener(
    'keydown',
    (e) => {
      if (zone !== 'console' || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (screens.console.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') go('overview');
    else if (/^[0-5]$/.test(e.key)) go(ZONES[Number(e.key)]);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = ZONES.indexOf(zone) + (e.key === 'ArrowRight' ? 1 : -1);
      go(ZONES[(i + ZONES.length) % ZONES.length]);
    }
  });

  // swipe between screens on a phone
  let sx = 0, sy = 0;
  view.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  view.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = ZONES.indexOf(zone) + (dx < 0 ? 1 : -1);
    go(ZONES[Math.max(1, Math.min(ZONES.length - 1, i))]);
  });

  /** Screens go dark one by one, then back upstairs. */
  function logout() {
    voice.say('machine.logout');
    const crts = [...root.querySelectorAll<HTMLElement>('.crt')];
    crts.forEach((c, i) => window.setTimeout(() => c.classList.add('is-off'), reducedMotion() ? 0 : 300 + i * 260));
    window.setTimeout(() => go('overview'), 400);
    window.setTimeout(() => (location.href = base), reducedMotion() ? 300 : 2600);
  }

  /* ---------------- start ---------------- */
  const relang = () => {
    screens.log.render();
    screens.year.render();
    screens.clocks.render();
    screens.backup.render();
    screens.console.render();
    drawList();
  };
  flat(relang);
  const crts = [...root.querySelectorAll<HTMLElement>('.crt')];
  crts.forEach((c) => c.classList.add('is-off'));
  // the screens come on one after another, as old tubes do
  crts.forEach((c, i) => window.setTimeout(() => c.classList.remove('is-off'), reducedMotion() ? 0 : 500 + i * 320));
  audio.powerUp(true);
  window.addEventListener('resize', () => aim(true));
  root.dataset.zone = zone;
  aim(true);
  drawList();
  requestAnimationFrame(frame);
  requestAnimationFrame(() => root.classList.add('is-lit'));
  window.setTimeout(() => voice.say('machine.enter'), 900);
  // a bare clock in the corner of each screen
  const clock = () => {
    const d = new Date();
    const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    root.querySelectorAll('.crt__clock').forEach((c) => (c.textContent = s));
  };
  clock();
  window.setInterval(clock, 10000);
}
