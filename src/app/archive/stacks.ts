/**
 * The stacks, wired to the page: the head column, the hover callout, the
 * switches (on the plate in the room and mirrored in the column), the desk
 * lamps' pull chains, the day's weather, the slips laid on the room (today's
 * arrivals, the strong cabinet, the routine side), and the formal records
 * themselves: a cabinet opens where it stands, a file comes half out of its
 * drawer, and it is read there or taken to the reading table, where up to six
 * lie side by side.
 *
 * The lights the visitor sets are kept until the island's next 07:00 or
 * 19:00, like the day and night choice. What is on the table stays on it
 * (on this device) until it is put back.
 */
import type { Vector3 } from 'three';
import type { ArchiveRecord, Category } from '../types';
import { StacksScene, STACKS_ZONES, type StacksZone, type PaperLit, type SheetPlace } from './scene';
import { ROWS, type StacksCategory } from './room';
import { fileCover, fileInside } from './textures';
import { Cards } from './cards';
import { islandDay, islandHalfDay, islandIso, islandNow } from '../island';
import { islandHumidity, islandMoon, islandRaining } from '../weather';
import { isZh } from '../i18n';
import { audio } from '../audio';
import { prefs, reducedMotion } from '../prefs';
import { intake } from './intake';
import { canvasFontsReady } from '../scene/textures';
import { esc } from '../ui/text';
import { clearanceKey } from '../clearance';
import type { Archivist } from '../ui/archivist';
import { Deck } from '../office/deck';
import { REELS } from './reels';

const ZH_CAT: Record<string, string> = { personnel: '人员', events: '事件', programs: '计划' };
const REGIONS = [
  { en: 'North · North-East', zh: '北部 · 东北部' },
  { en: 'East · West', zh: '东部 · 西部' },
];
/** Every glyph the room's plates and cards are lettered with. */
const GLYPHS = '人员事件计划北部东南西兀兰义顺三巴旺实里达宏茂桥后港龙岗盛勿洛淡滨尼白沙樟宜裕廊武吉督蔡厝金文泰署内例行霏微记录档案库本不得携出今日入待归卷目报告司机车票索引卡区年编号全岛图口借出阅档桌';
/** Files to a drawer before the next one down takes over. */
const PER = 14;
/** Files the reading table holds. */
export const TABLE_MAX = 6;

const two = (n: number) => String(n).padStart(2, '0');

/** Where a file is read: at its drawer, or at the reading table. */
export type ReadAt = 'drawer' | 'table';
/** What lights the paper: daylight, a lamp, the moon or the street lamp outside. */

interface Lights {
  half: number;
  theme: 'day' | 'night';
  rows: boolean[];
  desks: boolean[];
  /** The island day the dehumidifier was last emptied. */
  emptied?: string;
}
const KEY = 'n9:stacks';
const TABLE_KEY = 'n9:table';

const defaults = (theme: 'day' | 'night', prev?: Lights): Lights => ({
  half: islandHalfDay(),
  theme,
  // at night the routine side stays dark; the door, the cabinets and the reading table are lit
  rows: theme === 'night' ? [true, true, false, true] : [true, true, true, true],
  desks: theme === 'night' ? [true, false, true] : [false, false, false],
  emptied: prev?.emptied,
});

function load(theme: 'day' | 'night'): Lights {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Lights | null;
    if (s && s.half === islandHalfDay() && s.theme === theme && s.rows?.length === 4) return { ...s, desks: [...(s.desks ?? []), false, false, false].slice(0, 3) };
    return defaults(theme, s ?? undefined);
  } catch {
    return defaults(theme);
  }
}
function save(l: Lights) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* ignore */
  }
}

export interface StacksHooks {
  /** Read a file: where it was taken out, or at the table. */
  read(rec: ArchiveRecord, at: ReadAt): void;
  /** A formal drawer was pulled out. */
  drawer(ci: number): void;
  /** The lights changed: the paper being read may be lit differently now. */
  lights(): void;
  /** The light on the page being read, worked out from the room. */
  paper(v: PaperLit): void;
  /** Where the sheet being read at the table lies on the screen, or null. */
  sheet(v: SheetPlace | null): void;
  /** Where the second sheet, beside it, lies on the screen, or null. */
  side(v: SheetPlace | null): void;
  search(): void;
}

export class Stacks {
  scene: StacksScene | null = null;
  private lights: Lights;
  private theme: 'day' | 'night';
  private callout: HTMLElement;
  private slip: HTMLElement;
  private today = islandIso();
  // ?weather=rain or ?weather=dry overrides the island's sky, to see the other one
  private rain = ((w) => (w === 'rain' ? true : w === 'dry' ? false : islandRaining()))(new URLSearchParams(location.search).get('weather'));
  private ready: Promise<void>;
  /** The drawer pulled out: category and which of its drawers. */
  private open: { ci: number; d: number } | null = null;
  /** The file half out of its drawer, waiting to be read or carried. */
  private taken: ArchiveRecord | null = null;
  /** Files on the reading table, in the order they were laid there. */
  private table: string[] = [];
  private hovered = '';
  private cards: Cards;
  /** The reel machine's transport: the same tape chain as the office deck. */
  private deck = new Deck();
  /** Where the tape was when PLAY was last pressed, for LOC START. */
  private playFrom = 0;
  private reelSaid = false;
  private $ = (id: string) => document.getElementById(id)!;

  constructor(private root: HTMLElement, private categories: Category[], private records: ArchiveRecord[], theme: 'day' | 'night', private voice: Archivist, private hooks: StacksHooks) {
    this.theme = theme;
    this.lights = load(theme);
    this.callout = this.$('stacks-callout');
    this.slip = this.$('stacks-slip');
    this.table = this.loadTable();
    this.cards = new Cards(records, categories, (rec) => this.fetch(rec), (rec) => this.where(rec));
    this.ready = this.build();
    this.bindHud();
    this.stats();
    this.drawTable();
  }

  private byCat(ci: number) {
    return this.records.filter((r) => r.category === this.categories[ci]?.id);
  }

  private find(file: string) {
    return this.records.find((r) => r.file === file) ?? null;
  }

  private async build() {
    await canvasFontsReady(GLYPHS + REELS.map((t) => t.title.zh).join(''));
    const cats: StacksCategory[] = this.categories.map((c, i) => {
      const list = this.byCat(i);
      return { id: c.id, zh: ZH_CAT[c.id] ?? c.label, en: c.label, code: c.code, range: list.length ? `${list[0].file} — ${list[list.length - 1].file}` : '' };
    });
    try {
      this.scene = new StacksScene(this.root, this.$('stacks') as HTMLCanvasElement, cats, { today: this.today }, {
        zone: (z) => this.markZone(z),
        hover: (k) => this.hover(k),
        cabinet: (ci) => this.openCabinet(ci),
        file: (f) => this.take(f),
        tableFile: (f) => this.readTable(f),
        bank: (bi) => this.routine(bi),
        rocker: (i) => this.toggleRow(i),
        desk: (i) => this.toggleDesk(i),
        index: () => this.cards.show(),
        tray: () => this.arrivals(),
        safe: () => this.strongCabinet(),
        dehumidifier: () => this.emptyTank(),
        blinds: () => this.toggleBlinds(),
        ledger: () => this.loanBook(),
        reel: (w) => this.reelAct(w),
        paper: (v) => this.hooks.paper(v),
        sheet: (v) => this.hooks.sheet(v),
        side: (v) => this.hooks.side(v),
      });
    } catch (err) {
      console.error('[stacks] WebGL unavailable', err);
      return;
    }
    const s = this.scene;
    s.setWeather(this.rain, islandHumidity(this.today));
    s.setTheme(this.theme, true);
    s.setMoon(this.moon());
    this.lights.rows.forEach((on, i) => s.setRow(i, on, true));
    this.lights.desks.forEach((on, i) => s.setDesk(i, on, true));
    s.room.setTankFull(this.tankFull());
    s.room.landed = () => {
      audio.settle();
      const f = this.readAfter;
      this.readAfter = null;
      if (f) this.readTable(f);
    };
    this.markRows();
    void this.layTable();
    void this.ready.then(() => this.setTray());
    s.setReelSource(() => {
      const pos = this.deck.position;
      return { pos, len: this.deck.length, level: this.deck.level, timer: this.timer(pos) };
    });
    this.deck.onChange = () => this.reelChanged();
  }

  /* ---------------- show / hide ---------------- */
  show() {
    void this.ready.then(() => this.scene?.resume());
    audio.rain(this.rain);
  }

  hide() {
    this.deck.stop();
    audio.rain(false);
    this.closeSlip();
    this.callout.classList.remove('is-on');
    this.scene?.pause();
  }

  /** The visitor's day/night choice: the lights go back to how the shift leaves them. */
  setTheme(theme: 'day' | 'night') {
    if (theme === this.theme) return;
    this.theme = theme;
    this.lights = load(theme);
    void this.ready.then(() => {
      const s = this.scene;
      if (!s) return;
      s.setTheme(theme);
      s.setMoon(this.moon());
      this.lights.rows.forEach((on, i) => s.setRow(i, on, true));
      this.lights.desks.forEach((on, i) => s.setDesk(i, on, true));
      this.markRows();
    });
  }

  enterVoice() {
    if (this.rain) this.voice.say('stacks.rain', {}, false);
  }

  /** Keyboard in the room: 0–5 corners; at a drawer ↑ ↓ files, ← → drawers, Enter takes one; Esc steps back. */
  key(e: KeyboardEvent): boolean {
    if (this.cards.isOpen) return this.cards.key(e);
    if (this.open) {
      const list = this.inDrawer(this.open.ci, this.open.d).filter((r) => !this.table.includes(r.file));
      const at = this.taken ? list.indexOf(this.taken) : -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!list.length) return true;
        const next = list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length] ?? list[0];
        this.take(next.file);
        return true;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        this.stepDrawer(e.key === 'ArrowRight' ? 1 : -1);
        return true;
      }
      if (e.key === 'Enter' && this.taken) {
        this.choose('read');
        return true;
      }
      if (e.key === 't' || e.key === 'T') {
        if (this.taken) this.choose('table');
        return true;
      }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (this.taken) this.putBack();
        else this.closeCabinet();
        return true;
      }
      return false;
    }
    if (!this.scene) return false;
    const n = Number(e.key);
    if (e.key.length === 1 && n >= 0 && n < STACKS_ZONES.length) {
      this.scene.goZone(STACKS_ZONES[n]);
      return true;
    }
    if (e.key === 'Escape') {
      if (!this.slip.hidden) this.closeSlip();
      else this.scene.goZone('overview');
      return true;
    }
    return false;
  }

  relang() {
    this.stats();
    this.markRows();
    if (!this.slip.hidden) this.closeSlip();
    if (this.open) this.drawDrawer();
    if (this.taken) this.drawChoice();
    this.drawTable();
    this.cards.relang();
    void this.layTable(true);
  }

  /* ---------------- the head column ---------------- */
  private bindHud() {
    document.querySelectorAll<HTMLButtonElement>('#stacks-zones [data-zone]').forEach((b) => b.addEventListener('click', () => this.goZone(b.dataset.zone as StacksZone)));
    document.querySelectorAll<HTMLButtonElement>('#stacks-cats [data-cat]').forEach((b) => b.addEventListener('click', () => this.openCabinet(Number(b.dataset.cat))));
    document.querySelectorAll<HTMLButtonElement>('.stackshud__rockers [data-row]').forEach((b) => b.addEventListener('click', () => this.toggleRow(Number(b.dataset.row))));
    document.querySelectorAll<HTMLButtonElement>('[data-blinds]').forEach((b) => b.addEventListener('click', () => this.toggleBlinds()));
    document.querySelectorAll<HTMLButtonElement>('.stackshud__desks [data-desk]').forEach((b) => b.addEventListener('click', () => this.toggleDesk(Number(b.dataset.desk))));
    document.querySelectorAll<HTMLButtonElement>('#ds-switches [data-ls]').forEach((b) => b.addEventListener('click', () => this.readSwitch(b.dataset.ls!)));
    this.$('stacks-cards-btn').addEventListener('click', () => this.cards.show());
    this.slip.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.x')) return this.closeSlip();
      if (el.closest('[data-act="file-all"]')) return this.fileArrivals();
      const rl = el.closest<HTMLElement>('[data-reel]')?.dataset.reel;
      if (rl) return this.reelAct(rl);
      const tk = el.closest<HTMLElement>('[data-take]')?.dataset.take;
      const tr = tk ? this.find(tk) : null;
      if (tr) {
        this.closeSlip();
        this.toTable(tr, true);
        return;
      }
      const f = el.closest<HTMLElement>('[data-file]')?.dataset.file;
      const rec = f ? this.find(f) : null;
      if (rec) {
        this.closeSlip();
        this.fetch(rec);
      }
    });
    this.$('stacks-drawer').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const f = el.closest<HTMLElement>('[data-file]')?.dataset.file;
      if (f) return this.take(f);
      const t = el.closest<HTMLElement>('[data-table-file]')?.dataset.tableFile;
      if (t) return this.readTable(t);
      const tt = el.closest<HTMLElement>('[data-take-tray]')?.dataset.takeTray;
      if (tt) return this.take(tt);
      const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') this.closeCabinet();
      else if (act === 'prev') this.stepDrawer(-1);
      else if (act === 'next') this.stepDrawer(1);
      else if (act === 'go-table') this.goTable();
    });
    this.$('stacks-choice').addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'read' || act === 'table' || act === 'back') this.choose(act);
    });
    this.$('stacks-table').addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const read = el.closest<HTMLElement>('[data-read]')?.dataset.read;
      if (read) return this.readTable(read);
      const back = el.closest<HTMLElement>('[data-return]')?.dataset.return;
      if (back) return this.returnFile(back);
      if (el.closest('[data-act="return-all"]')) this.returnAll();
    });
  }

  private stats() {
    const zh = isZh();
    const n = this.records.length;
    const arrived = this.arrivedToday().length;
    const el = document.getElementById('stacks-stats');
    if (el) el.textContent = zh ? `正式档案 ${n} 份 · 例行文件柜 16 个 · 今日入库 ${arrived} 份 · ${this.rain ? '今天下雨' : '今天无雨'}` : `${n} formal records · 16 routine cabinets · ${arrived} received today · ${this.rain ? 'raining today' : 'dry today'}`;
    this.categories.forEach((c, i) => {
      const b = document.querySelector<HTMLElement>(`#stacks-cats [data-count="${c.id}"]`);
      if (b) b.textContent = two(this.byCat(i).length);
    });
  }

  private goZone(z: StacksZone) {
    if (this.open) this.closeCabinet(false);
    this.scene?.goZone(z);
    if (!this.scene) this.markZone(z);
  }

  private markZone(z: StacksZone) {
    if (z === 'reel') this.reelSlip(true);
    else if (this.slip.dataset.kind === 'reel') this.closeSlip();
    document.querySelectorAll<HTMLButtonElement>('#stacks-zones [data-zone]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === z)));
    this.root.dataset.zone = z;
    // the drawer goes home when the visitor walks off
    if (this.open && !this.scene?.openAt) this.closeCabinet(false);
    audio.flick();
  }

  /** The cord on the wall (or the switch): every window opens or shuts, and stays so. */
  private toggleBlinds() {
    if (!this.scene) return;
    this.scene.blindsShut = !this.scene.blindsShut;
    prefs.set('blindsShut', this.scene.blindsShut);
    this.scene.room.pullCord(this.scene.blindsShut);
    audio.rocker();
    this.markRows();
  }

  private markRows() {
    document.querySelectorAll<HTMLButtonElement>('[data-blinds]').forEach((b) => b.setAttribute('aria-pressed', String(!!this.scene?.blindsShut)));
    document.querySelectorAll<HTMLButtonElement>('.stackshud__rockers [data-row]').forEach((b) => {
      const i = Number(b.dataset.row);
      b.setAttribute('aria-pressed', String(this.lights.rows[i]));
      b.title = isZh() ? ROWS[i].zh : ROWS[i].en;
    });
    document.querySelectorAll<HTMLButtonElement>('.stackshud__desks [data-desk]').forEach((b) => b.setAttribute('aria-pressed', String(this.lights.desks[Number(b.dataset.desk)])));
    this.markReadSwitches();
  }

  /* ---------------- hover ---------------- */
  private hover(key: string | null) {
    if (this.hovered && this.hovered !== this.taken?.file) this.scene?.room.liftFile(this.hovered, 0);
    this.hovered = '';
    if (!key) {
      this.callout.classList.remove('is-on');
      return;
    }
    const zh = isZh();
    const [kind, arg] = key.split(/:(.*)/);
    let text = '';
    if (kind === 'cat') {
      const ci = this.categories.findIndex((c) => c.id === arg);
      const n = this.byCat(ci).length;
      text = zh ? `${ZH_CAT[arg] ?? arg} · 第 ${two(ci + 1)} 抽屉 · ${n} 份 · 拉开` : `${this.categories[ci]?.label} · Drawer ${two(ci + 1)} · ${n} ${n === 1 ? 'file' : 'files'} · pull it out`;
    } else if (kind === 'file' || kind === 'table') {
      const r = this.find(arg);
      if (!r) return;
      if (kind === 'file' && r !== this.taken) {
        this.hovered = arg;
        this.scene?.room.liftFile(arg, 0.12);
      }
      text = `${r.file} · ${r.title} · ${r.stamp}${kind === 'table' ? (zh ? ' · 在桌上，点开来看' : ' · on the table, open it') : ''}`;
    } else if (kind === 'bank') text = zh ? `例行文件 · ${REGIONS[Number(arg)].zh}` : `Routine paperwork · ${REGIONS[Number(arg)].en}`;
    else if (kind === 'rocker') {
      const i = Number(arg);
      const on = this.lights.rows[i];
      text = zh ? `${i + 1} 号开关 · ${ROWS[i].zh} · ${on ? '开着' : '关着'}` : `Switch ${i + 1} · ${ROWS[i].en} · ${on ? 'on' : 'off'}`;
    } else if (kind === 'desk') {
      const on = this.lights.desks[Number(arg)];
      const what = Number(arg) === 2 ? (zh ? '入库台的灯' : 'Desk lamp at the intake desk') : zh ? '阅档桌台灯' : 'Reading lamp';
      text = zh ? `${what} · 拉一下灯绳${on ? '关掉' : '打开'}` : `${what} · pull the chain to switch it ${on ? 'off' : 'on'}`;
    } else if (kind === 'index') text = zh ? '索引卡 · 按编号、区、年份翻' : 'Card index · by number, district or year';
    else if (kind === 'tray') {
      const n = this.arrivedToday().length;
      const n2 = this.onTray().length;
      text = zh ? `今日收件 · ${n} 份${n2 ? `，${n2} 份还没归档` : '，已归档'}` : `Received today · ${n}${n2 ? `, ${n2} still to file` : ', all filed'}`;
    } else if (kind === 'blinds') text = zh ? `窗帘拉绳 · 拉一下${this.scene?.blindsShut ? '拉开' : '合上'}四扇窗` : `Window cord · pull to ${this.scene?.blindsShut ? 'open' : 'shut'} all four windows`;
    else if (kind === 'blinds') text = zh ? `窗帘拉绳 · 拉一下${this.scene?.blindsShut ? '拉开' : '合上'}四扇窗` : `Window cord · pull to ${this.scene?.blindsShut ? 'open' : 'shut'} all four windows`;
    else if (kind === 'ledger') text = zh ? '登记簿 · 借阅记录' : 'Register · loan ledger';
    else if (kind === 'safe') text = zh ? '绝密柜 · 锁着' : 'Strong cabinet · locked';
    else if (kind === 'reel') text = this.reelHover(arg);
    else if (kind === 'dehumidifier') text = this.tankFull() ? (zh ? '除湿机 · 水箱满了，倒一下' : 'Dehumidifier · the tank is full, empty it') : zh ? '除湿机 · 在转' : 'Dehumidifier · running';
    else if (kind === 'zone') text = arg === 'reading' ? (zh ? `阅档桌 · 桌上 ${this.table.length} 份` : `Reading table · ${this.table.length} on it`) : zh ? '入库台' : 'Intake desk';
    this.callout.textContent = text;
    this.callout.classList.add('is-on');
  }

  /* ---------------- switches ---------------- */
  private toggleRow(i: number) {
    const on = !this.lights.rows[i];
    this.lights.rows[i] = on;
    this.lights.half = islandHalfDay();
    this.lights.theme = this.theme;
    save(this.lights);
    this.scene?.setRow(i, on);
    audio.rocker();
    this.markRows();
    this.hooks.lights();
    if (!this.lights.rows.some(Boolean) && !this.lights.desks.some(Boolean)) this.voice.say('stacks.dark', {}, false);
    else if (on && Math.random() < 0.3) this.voice.say('stacks.lights', {}, false);
  }

  private toggleDesk(i: number) {
    const on = !this.lights.desks[i];
    this.lights.desks[i] = on;
    this.lights.half = islandHalfDay();
    this.lights.theme = this.theme;
    save(this.lights);
    this.scene?.setDesk(i, on);
    audio.tick();
    this.markRows();
    this.hooks.lights();
  }

  /* ---------------- the light on the paper ---------------- */
  /** Tonight's moonlight through the louvres, 0–1. */
  private moon() {
    if (this.theme !== 'night') return 0;
    return islandMoon(this.today, islandNow().hours, this.rain).light;
  }

  /** Where a file is on the screen right now: up out of its drawer, or lying on the table. */
  screenPoint(rec: ArchiveRecord, at: ReadAt) {
    const s = this.scene;
    if (!s) return null;
    const v = at === 'table' ? s.room.tableSpot(rec.file) : this.open ? s.room.drawerFront(this.open.ci, this.open.d) : null;
    return v ? s.screenOf(v) : null;
  }

  /* ---------------- reading by the lamp ---------------- */
  /**
   * How far the rest of the room's lights fade for each clearance, leaving
   * only the reading lamps: the higher the clearance, the darker round the table.
   */
  static readonly EXAM: Record<string, number> = { declass: 0, restr: 0, conf: 0.45, secret: 0.8, top: 1 };
  /** Where the open file is being read. */
  private examAt: { at: ReadAt } | null = null;

  /** A file opened at `at` with this clearance: point the room's light meter at that place and hush the room as far as the clearance asks. */
  exam(at: ReadAt | null, stamp: string | null) {
    void this.ready.then(() => {
      const s = this.scene;
      if (!s) return;
      s.setHush(at === 'table' && stamp ? Stacks.EXAM[clearanceKey(stamp)] ?? 0 : 0);
      this.examAt = at ? { at } : null;
      if (!at) s.setReadPoint(null);
      else if (at === 'table') s.setReadPoint(s.room.readSpot());
      else if (this.open) s.setReadPoint(s.room.drawerFront(this.open.ci, this.open.d));
      else s.setReadPoint(null);
      this.markReadSwitches();
    });
  }

  /** The switches in the margin of an open file: the tube here, the pendants over here, the table lamps. */
  private readSwitch(which: string) {
    const at = this.examAt?.at ?? null;
    if (which === 'level') {
      prefs.set('lampLevel', (Number(prefs.get('lampLevel') ?? 1) + 1) % 3);
      audio.rocker();
    } else if (which === 'row' && at) this.toggleRow(at === 'drawer' ? 1 : 3);
    else if (which === 'seat' && this.scene) {
      this.scene.room.setSide(this.scene.room.sideNow === 'l' ? 'r' : 'l');
      audio.paper();
    } else if (which === 'atonce') {
      prefs.set('openAtOnce', !prefs.get('openAtOnce'));
      audio.rocker();
    } else if (which === 'blinds') this.toggleBlinds();
    else if (which === 'desks') {
      const on = !(this.lights.desks[0] || this.lights.desks[1]);
      for (const i of [0, 1]) if (this.lights.desks[i] !== on) this.toggleDesk(i);
    }
    this.markReadSwitches();
  }

  private markReadSwitches() {
    const box = document.getElementById('ds-switches');
    if (!box) return;
    const at = this.examAt?.at ?? null;
    box.hidden = !at;
    const set = (k: string, on: boolean, show = true) => {
      const b = box.querySelector<HTMLButtonElement>(`[data-ls="${k}"]`);
      if (!b) return;
      b.hidden = !show;
      b.setAttribute('aria-pressed', String(on));
    };
    const lv = Number(prefs.get('lampLevel') ?? 1);
    set('level', lv !== 1, at === 'table');
    const en = document.getElementById('ds-lv-en'), zh = document.getElementById('ds-lv-zh');
    if (en) en.textContent = ['dim', 'mid', 'bright'][lv] ?? 'mid';
    if (zh) zh.textContent = ['暗', '中', '亮'][lv] ?? '中';
    set('row', at === 'drawer' ? this.lights.rows[1] : this.lights.rows[3]);
    set('desks', this.lights.desks[1] || at === 'table', at === 'table');
    set('blinds', !!this.scene?.blindsShut);
    set('atonce', !!prefs.get('openAtOnce'), at === 'table');
    set('seat', this.scene?.room.sideNow === 'r', at === 'table');
  }

  /* ---------------- the formal cabinets ---------------- */
  /** Which drawer of its category a file hangs in, and its folder number. */
  where(rec: ArchiveRecord) {
    const ci = this.categories.findIndex((c) => c.id === rec.category);
    const i = this.byCat(ci).indexOf(rec);
    return { ci, d: Math.floor(Math.max(0, i) / PER), drawer: ci + 1, folder: i + 1, onTable: this.table.includes(rec.file) };
  }

  /** "Archive · Drawer 02 · Folder 01", or where it lies now. */
  shelfMark(rec: ArchiveRecord) {
    const w = this.where(rec);
    if (w.onTable) return isZh() ? '在阅档桌上' : 'On the reading table';
    return isZh() ? `档案库 · 第 ${two(w.drawer)} 抽屉 · 第 ${two(w.folder)} 夹` : `Stacks · Drawer ${two(w.drawer)} · Folder ${two(w.folder)}`;
  }

  private inDrawer(ci: number, d: number) {
    return this.byCat(ci).slice(d * PER, d * PER + PER);
  }

  private drawersIn(ci: number) {
    return Math.max(1, Math.ceil(this.byCat(ci).length / PER));
  }

  /** Walk up to a category's cabinets and pull its drawer out. */
  openCabinet(ci: number, d = 0) {
    if (this.open?.ci === ci && this.open.d === d) return;
    this.closeSlip();
    this.cards.close();
    this.putBack(false);
    const first = !this.open;
    this.open = { ci, d };
    this.fillDrawer();
    void this.ready.then(() => this.scene?.openDrawer(ci, d));
    this.root.dataset.drawer = String(ci);
    this.drawDrawer();
    audio.drawer();
    if (first) this.voice.say('stacks.push', {}, false);
    this.hooks.drawer(ci);
  }

  private fillDrawer() {
    const o = this.open;
    if (!o) return;
    const items = this.inDrawer(o.ci, o.d).map((r) => ({ file: r.file, stamp: r.stamp, category: r.category, out: this.table.includes(r.file) }));
    void this.ready.then(() => this.scene?.room.fillDrawer(o.ci, o.d, items));
  }

  private stepDrawer(step: number) {
    if (!this.open) return;
    const n = this.drawersIn(this.open.ci);
    const d = this.open.d + step;
    if (d >= 0 && d < n) this.openCabinet(this.open.ci, d);
    else {
      // past the last drawer: the next category's cabinets
      const ci = (this.open.ci + step + this.categories.length) % this.categories.length;
      this.openCabinet(ci, step > 0 ? 0 : this.drawersIn(ci) - 1);
    }
  }

  /** Push the drawer home and step back. */
  closeCabinet(walk = true) {
    if (!this.open) return;
    this.putBack(false);
    this.open = null;
    delete this.root.dataset.drawer;
    this.$('stacks-drawer').hidden = true;
    this.scene?.closeDrawer();
    audio.drawer();
    if (walk) this.scene?.goZone('formal');
  }

  /** The file in its drawer, found and walked to: opened at its drawer and lifted half out. */
  fetch(rec: ArchiveRecord, read = false) {
    const w = this.where(rec);
    if (w.onTable) {
      this.goTable();
      if (read) this.hooks.read(rec, 'table');
      return;
    }
    this.openCabinet(w.ci, w.d);
    this.take(rec.file, read);
  }

  /** Lift a file half out of its drawer and ask what to do with it (or read it straight away). */
  take(file: string, read = false) {
    const rec = this.find(file);
    if (!rec || this.table.includes(file)) {
      if (rec) this.readTable(file);
      return;
    }
    if (this.inTray(file)) return this.toTable(rec, read, !read);
    if (!this.open || this.where(rec).ci !== this.open.ci) return this.fetch(rec, read);
    if (this.taken && this.taken !== rec) this.scene?.room.liftFile(this.taken.file, 0);
    this.taken = rec;
    void this.ready.then(() => this.scene?.room.liftFile(file, 1));
    audio.paper();
    this.drawDrawer();
    if (read) {
      this.toTable(rec, true);
      return;
    }
    this.drawChoice();
  }

  /** The file goes back where it hangs. */
  putBack(sound = true) {
    if (!this.taken) return;
    this.scene?.room.liftFile(this.taken.file, 0);
    this.taken = null;
    this.$('stacks-choice').hidden = true;
    if (sound) audio.paper();
    if (this.open) this.drawDrawer();
  }

  /** The file being read at the drawer: the one taken out, and the one before or after it. */
  neighbour(rec: ArchiveRecord, step: number) {
    const ci = this.categories.findIndex((c) => c.id === rec.category);
    const list = this.byCat(ci).filter((r) => r === rec || !this.table.includes(r.file));
    return list[(list.indexOf(rec) + step + list.length) % list.length] ?? rec;
  }

  private choose(act: 'read' | 'table' | 'back') {
    const rec = this.taken;
    if (!rec) return;
    if (act === 'back') return this.putBack();
    // "table": stay at the drawer and keep taking; "read": carry it over and sit down to it
    this.toTable(rec, act === 'read', act === 'table');
  }

  private drawDrawer() {
    const o = this.open;
    const el = this.$('stacks-drawer');
    if (!o) {
      el.hidden = true;
      return;
    }
    const zh = isZh();
    const cat = this.categories[o.ci];
    const n = this.drawersIn(o.ci);
    const list = this.inDrawer(o.ci, o.d);
    const name = zh ? ZH_CAT[cat.id] ?? cat.label : cat.label;
    el.innerHTML = `
      <p class="micro">${zh ? `档案库 · 第 ${two(o.ci + 1)} 抽屉${n > 1 ? `（${o.d + 1} / ${n}）` : ''}` : `Stacks · Drawer ${two(o.ci + 1)}${n > 1 ? ` (${o.d + 1} of ${n})` : ''}`}</p>
      <h2 class="stackshud__dname">${esc(name)}</h2>
      <ol class="stackshud__files">${
        list.length
          ? list
              .map((r) => {
                const out = this.table.includes(r.file);
                const tray = !out && this.inTray(r.file);
                const folder = this.byCat(o.ci).indexOf(r) + 1;
                return out
                  ? `<li class="is-out"><button type="button" data-table-file="${esc(r.file)}"><i>${two(folder)}</i><b>${esc(r.file)}</b><span>${zh ? '借出 · 在阅档桌上' : 'Out · on the reading table'}</span></button></li>`
                  : tray
                    ? `<li class="is-out"><button type="button" data-take-tray="${esc(r.file)}"><i>${two(folder)}</i><b>${esc(r.file)}</b><span>${zh ? '在入库台，还没归档' : 'At the intake desk, not filed yet'}</span></button></li>`
                    : `<li${r === this.taken ? ' class="is-up"' : ''}><button type="button" data-file="${esc(r.file)}" aria-pressed="${r === this.taken}"><i>${two(folder)}</i><b>${esc(r.file)}</b><span>${esc(r.title)}</span><em class="clr-${clearanceKey(r.stamp)}">${esc(r.stamp)}</em></button></li>`;
              })
              .join('')
          : `<li class="is-empty">${zh ? '这个抽屉还空着。' : 'This drawer is still empty.'}</li>`
      }</ol>
      <div class="stackshud__dnav">
        <button type="button" data-act="prev" aria-label="${zh ? '上一个抽屉' : 'Previous drawer'}">←</button>
        <button type="button" data-act="close">${zh ? '关上抽屉' : 'Close the drawer'} <span class="kbd">Esc</span></button>
        <button type="button" data-act="next" aria-label="${zh ? '下一个抽屉' : 'Next drawer'}">→</button>
      </div>
      ${this.table.length ? `<button type="button" class="stackshud__totable" data-act="go-table">${zh ? `阅档桌上 ${this.table.length} / ${TABLE_MAX} 份 · 过去看` : `${this.table.length} of ${TABLE_MAX} on the reading table · go over`} →</button>` : ''}`;
    el.hidden = false;
  }

  /** What to do with the file half out of the drawer. */
  private drawChoice() {
    const rec = this.taken;
    const el = this.$('stacks-choice');
    if (!rec) {
      el.hidden = true;
      return;
    }
    const zh = isZh();
    const full = this.table.length >= TABLE_MAX;
    el.innerHTML = `
      <p class="stackshud__choicehead"><b>${esc(rec.file)}</b><span>${esc(rec.title)}</span><em class="clr-${clearanceKey(rec.stamp)}">${esc(rec.stamp)}</em></p>
      <div class="stackshud__choicebtns">
        <button type="button" data-act="table"${full ? ' disabled' : ''}>${zh ? '拿到桌上' : 'Put it on the table'}</button>
        <button type="button" data-act="read"${full ? ' disabled' : ''}>${zh ? '拿到桌上读' : 'Take it over and read'} <span class="kbd">Enter</span></button>
        <button type="button" data-act="back">${zh ? '放回' : 'Put it back'}</button>
      </div>
      ${full ? `<p class="stackshud__choicenote">${zh ? `桌上已经摊了 ${TABLE_MAX} 份，再放就看不过来了。先还一份。` : `There are ${TABLE_MAX} on the table already; no room to spread another. Put one back first.`}</p>` : ''}`;
    el.hidden = false;
    if (!reducedMotion()) el.animate([{ opacity: 0, transform: 'translate(-50%, .5rem)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 260, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  /* ---------------- the reading table ---------------- */
  private loadTable(): string[] {
    try {
      const t = JSON.parse(localStorage.getItem(TABLE_KEY) || '[]') as string[];
      return Array.isArray(t) ? t.filter((f) => this.find(f)).slice(0, TABLE_MAX) : [];
    } catch {
      return [];
    }
  }

  private saveTable() {
    try {
      localStorage.setItem(TABLE_KEY, JSON.stringify(this.table));
    } catch {
      /* ignore */
    }
  }

  get onTable(): ArchiveRecord[] {
    return this.table.map((f) => this.find(f)).filter((r): r is ArchiveRecord => !!r);
  }

  isOnTable(rec: ArchiveRecord) {
    return this.table.includes(rec.file);
  }

  /** Carry the file out of its drawer and lay it on the table. */
  toTable(rec: ArchiveRecord, read = false, stay = false) {
    if (this.table.includes(rec.file)) return;
    if (this.table.length >= TABLE_MAX) {
      this.voice.say('stacks.full', {}, false);
      return;
    }
    this.table.push(rec.file);
    this.saveTable();
    // where it is now, half out of its drawer, so it can be carried from there
    // staying at the drawer to take more: the file is just laid on the table, nobody walks over
    const from = stay || this.inTray(rec.file) ? undefined : this.scene?.room.filePos(rec.file);
    if (this.taken === rec) {
      this.scene?.room.liftFile(rec.file, 0);
      this.taken = null;
      this.$('stacks-choice').hidden = true;
    }
    // the drawer shuts behind you and you walk the file over to the table
    if (this.open && from) this.closeCabinet(false);
    else {
      this.fillDrawer();
      this.drawDrawer();
    }
    if (from) this.scene?.goZone('reading');
    this.drawTable();
    const laid = this.layTable(false, from ? new Map([[rec.file, from]]) : undefined);
    if (read) {
      // sit down to it once it has been carried over and put down
      if (from && !reducedMotion()) this.readAfter = rec.file;
      else void laid.then(() => this.readTable(rec.file));
    }
    audio.paper();
    this.voice.say(this.table.length === 1 ? 'stacks.table' : this.table.length === TABLE_MAX ? 'stacks.full' : 'stacks.more', { n: String(this.table.length) }, false);
  }

  /** A file being carried to the table to be read: sat down to when it lands. */
  private readAfter: string | null = null;

  /** Handed back at the intake desk: carried to the tray, stamped and logged; the clerk shelves it later. */
  returnFile(file: string) {
    const i = this.table.indexOf(file);
    if (i < 0) return;
    this.table.splice(i, 1);
    this.saveTable();
    intake.giveBack(this.today, file, this.stamp());
    this.afterReturn([file]);
  }

  private afterReturn(files: string[]) {
    const back = new Map<string, Vector3>();
    const room = this.scene?.room;
    if (room) for (const f of files) back.set(f, room.trayPoint());
    if (this.open) {
      this.fillDrawer();
      this.drawDrawer();
    }
    this.drawTable();
    this.setTray();
    void this.layTable(false, undefined, back);
    audio.paper();
    window.setTimeout(() => {
      audio.stamp();
      this.setTray();
    }, 1000);
    this.voice.say('stacks.handback', {}, false);
  }

  /** Where each of these files goes back to: the front of its cabinet. */
  private homeOf(files: string[]) {
    const m = new Map<string, Vector3>();
    const room = this.scene?.room;
    if (!room) return m;
    for (const f of files) {
      const rec = this.records.find((r) => r.file === f);
      const ci = rec ? this.categories.findIndex((c) => c.id === rec.category) : -1;
      const at = room.catCentre[ci];
      if (at) m.set(f, at.clone().setY(at.y + 0.2));
    }
    return m;
  }

  private returnAll() {
    if (!this.table.length) return;
    const files = this.table.slice();
    for (const f of files) intake.giveBack(this.today, f, this.stamp());
    this.table = [];
    this.saveTable();
    this.afterReturn(files);
  }

  /** Walk over to the reading table. */
  goTable() {
    if (this.open) this.closeCabinet(false);
    this.scene?.goZone('reading');
    if (!this.scene) this.markZone('reading');
  }

  /** Sit down at the reading place with this file open on the blotter (null: get up). */
  sit(rec: ArchiveRecord | null, open = true) {
    const s = this.scene;
    if (!s) return;
    if (rec && this.open) this.closeCabinet(false);
    s.room.seat(rec && this.table.includes(rec.file) ? rec.file : null, open);
    s.sit(!!rec && this.table.includes(rec.file));
  }

  /** Open or shut the file being read, on the reader's say. */
  setOpened(open: boolean) {
    this.scene?.room.setOpened(open);
  }

  /** Lay a second file open beside the one being read (null: put it back). */
  sitAside(rec: ArchiveRecord | null) {
    const s = this.scene;
    if (!s) return;
    const on = !!rec && this.table.includes(rec.file);
    s.room.setAside(on ? rec!.file : null);
    s.pair(on);
  }

  /** Whether reading at the table happens in the room (sat at the blotter) rather than on a sheet held up. */
  get canSit() {
    return !!this.scene;
  }

  private readTable(file: string) {
    const rec = this.find(file);
    if (!rec || !this.table.includes(file)) return;
    if (this.open) this.closeCabinet(false);
    if (this.scene && this.scene.zone !== 'reading') this.scene.goZone('reading');
    intake.lend(this.today, file, this.stamp());
    this.hooks.read(rec, 'table');
  }

  /** The files on the table, put face up in the room. */
  private async layTable(retype = false, from?: Map<string, Vector3>, back?: Map<string, Vector3>) {
    await this.ready;
    const s = this.scene;
    if (!s) return;
    const recs = this.onTable;
    await canvasFontsReady(recs.map((r) => r.title).join(''));
    if (retype) s.room.setTable([]);
    s.room.setTable(recs.map((r) => ({ file: r.file, category: r.category, map: () => fileCover(r.file, r.title, r.stamp, r.category), inside: () => fileInside(r) })), from, back);
  }

  /** The table, as a list in the head column. */
  private drawTable() {
    const zh = isZh();
    const recs = this.onTable;
    const el = this.$('stacks-table');
    el.innerHTML = `
      <p class="micro">${zh ? `阅档桌 · ${recs.length} / ${TABLE_MAX} 份` : `Reading table · ${recs.length} of ${TABLE_MAX}`}</p>
      ${
        recs.length
          ? `<ol class="stackshud__files">${recs
              .map((r) => `<li><button type="button" data-read="${esc(r.file)}"><b>${esc(r.file)}</b><span>${esc(r.title)}</span><em class="clr-${clearanceKey(r.stamp)}">${esc(r.stamp)}</em></button><button type="button" class="stackshud__ret" data-return="${esc(r.file)}" aria-label="${zh ? '还到入库台' : 'Hand back at the intake desk'}">${zh ? '还' : 'Return'}</button></li>`)
              .join('')}</ol><button type="button" class="stackshud__retall" data-act="return-all">${zh ? '全部还到入库台' : 'Hand them all back'}</button>`
          : `<p class="stackshud__tableempty">${zh ? '桌上还空着。去正式档案柜，拉开抽屉，把要对照的拿过来。' : 'Nothing on it yet. Pull a drawer at the formal cabinets and bring over what you want side by side.'}</p>`
      }`;
  }

  /* ---------------- the dehumidifier ---------------- */
  private tankFull() {
    return this.rain && this.lights.emptied !== this.today;
  }

  private emptyTank() {
    if (!this.tankFull()) return;
    this.lights.emptied = this.today;
    save(this.lights);
    this.scene?.room.setTankFull(false);
    audio.paper();
    this.voice.say('stacks.tank');
    this.hover('dehumidifier');
  }

  /* ---------------- slips ---------------- */
  private arrivedToday() {
    return this.records.filter((r) => islandDay(r.date) === this.today);
  }

  private showSlip(html: string, kind = '') {
    this.slip.dataset.kind = kind;
    this.slip.innerHTML = `<button type="button" class="x" aria-label="Close">×</button>${html}`;
    this.slip.hidden = false;
    this.slip.animate?.([{ opacity: 0, transform: 'translateY(.6rem) rotate(-.6deg)' }, { opacity: 1, transform: 'rotate(-.6deg)' }], { duration: reducedMotion() ? 0 : 320, easing: 'ease-out' });
    audio.paper();
  }

  closeSlip() {
    this.slip.hidden = true;
    this.slip.dataset.kind = '';
  }

  private list(recs: ArchiveRecord[]) {
    return `<ul>${recs.map((r) => `<li><button type="button" data-file="${esc(r.file)}">${esc(r.file)} · ${esc(r.title)}</button> <span class="micro">${esc(this.shelfMark(r))}</span></li>`).join('')}</ul>`;
  }

  /** "1999-10-09 10:32", as the ledger writes it. */
  private stamp() {
    const t = islandNow();
    return `${this.today} ${String(t.hours).padStart(2, '0')}:${String(t.minutes).padStart(2, '0')}`;
  }

  /** What lies in the in-tray: today's arrivals not yet shelved, and files handed back that nobody has shelved. */
  private onTray() {
    const day = this.arrivedToday();
    const w = new Set(intake.waiting(this.today, day.map((r) => r.file)));
    const back = new Set(intake.returned(this.today));
    return this.records.filter((r) => (w.has(r.file) && day.includes(r)) || (back.has(r.file) && !this.table.includes(r.file)));
  }

  private inTray(file: string) {
    return this.onTray().some((r) => r.file === file);
  }

  private setTray() {
    this.scene?.room.setTray(this.onTray().length);
  }

  /** The clerk shelves the tray into the drawers. */
  private fileArrivals() {
    const zh = isZh();
    const list = this.onTray();
    if (!list.length) return;
    const files = list.map((r) => r.file);
    intake.fileAll(this.today, files);
    intake.shelve(this.today, files);
    this.scene?.room.carryFromTray([...this.homeOf(files).values()]);
    this.setTray();
    if (this.open) {
      this.fillDrawer();
      this.drawDrawer();
    }
    audio.stamp();
    this.stats();
    this.showSlip(`<h3>${zh ? '已归档' : 'Filed'}</h3><p>${zh ? '盖了章，放进抽屉了：' : 'Stamped and put away in the drawers:'}</p>${this.list(list)}`);
  }

  /** The accession ledger: what has been taken to the table, and handed back. */
  private loanBook() {
    const zh = isZh();
    const rows = intake.loans(this.today).slice(0, 8).filter((l) => this.find(l.file));
    this.voice.say('stacks.ledger', {}, false);
    const li = rows
      .map((l) => {
        const r = this.find(l.file)!;
        const back = l.back ? (zh ? `还 ${l.back.slice(5)}` : `back ${l.back.slice(5)}`) : this.table.includes(l.file) ? (zh ? '还在桌上' : 'still on the table') : zh ? '还没还' : 'not returned yet';
        return `<li><button type="button" data-file="${esc(r.file)}">${esc(r.file)} · ${esc(r.title)}</button> <span class="micro">${esc(l.out.slice(5))} · ${esc(back)}</span></li>`;
      })
      .join('');
    this.showSlip(`<h3>${zh ? '借阅记录' : 'Loan ledger'}</h3>${rows.length ? `<ul>${li}</ul>` : `<p>${zh ? '这一页还是空的。拿一份到桌上读，这里就会记上。' : 'This page is still blank. Take a file to the table and it goes in here.'}</p>`}<p class="micro">${zh ? '只记在这台设备上。' : 'Kept on this device only.'}</p>`);
  }

  private arrivals() {
    const zh = isZh();
    const tray = this.onTray();
    if (tray.length) {
      const li = tray.map((r) => `<li><button type="button" data-take="${esc(r.file)}">${esc(r.file)} · ${esc(r.title)}</button> <span class="micro">${zh ? '在入库台上，点开拿到桌上读' : 'in the tray, take it to the table'}</span></li>`).join('');
      this.showSlip(`<h3>${zh ? '今日收件' : 'Received today'}</h3><ul>${li}</ul><p><button type="button" class="stackshud__slipbtn" data-act="file-all">${zh ? '归档 · 放进抽屉' : 'File them · into the drawers'}</button></p>`);
      return;
    }
    const today = this.arrivedToday();
    if (today.length) {
      this.showSlip(`<h3>${zh ? '今日收件' : 'Received today'}</h3><p>${zh ? '今天的已经归好档：' : 'Today’s are filed already:'}</p>${this.list(today)}`);
      return;
    }
    const recent = this.records.filter((r) => islandDay(r.date)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 3);
    this.showSlip(`<h3>${zh ? '今日入库' : 'Received today'}</h3><p>${zh ? '今天还没有新档案送来。上一批已经归进柜子：' : 'Nothing has come in today. The last ones are filed already:'}</p>${this.list(recent)}`);
  }

  private strongCabinet() {
    const zh = isZh();
    const top = this.records.filter((r) => r.stamp === 'TOP SECRET');
    this.voice.say('stacks.safe');
    this.showSlip(
      `<h3>${zh ? '绝密柜' : 'Strong cabinet'}</h3><p>${zh ? '柜子锁着。绝密的档案照样挂在正式档案柜里，用绕线档案袋装着，能借出来读。按署里的规定，在日光灯下看。' : 'The cabinet is locked. The top secret files hang in the formal cabinets like the rest, in string envelopes, and can be read. By Office rules, under the tube light.'}</p>` +
        (top.length ? this.list(top) : `<p>${zh ? '现在一份也没有。' : 'There are none at present.'}</p>`),
    );
  }

  private routine(bi: number) {
    const zh = isZh();
    this.voice.say('stacks.routine');
    this.showSlip(`<h3>${zh ? `例行文件 · ${REGIONS[bi].zh}` : `Routine paperwork · ${REGIONS[bi].en}`}</h3><p>${zh ? '巴士班次、水表读数、失物招领……按区、按季度归在这两排柜子里。署里正一个区一个区地上架，上好了这些抽屉就能拉开。' : 'Bus timetables, meter readings, lost property… filed here by district and by quarter. The Office is shelving them one district at a time; the drawers open once they are in.'}</p>`);
  }

  /* ---------------- the reel machine ---------------- */
  /** The timer window: hours.minutes.seconds of tape played. */
  private timer(pos: number) {
    const t = Math.max(0, Math.floor(pos));
    return `${Math.floor(t / 3600)}.${two(Math.floor(t / 60) % 60)}.${two(t % 60)}`;
  }

  private reelHover(what: string) {
    const zh = isZh();
    const on = this.deck.tape;
    const name = (id: string) => {
      const t = REELS.find((r) => r.id === id);
      return t ? `${t.label} · ${zh ? t.title.zh : t.title.en}` : id;
    };
    if (what === 'machine') return zh ? `Studer A807 MK II 盘式录音机 · ${on ? `机上：${name(on.id)}` : '没上盘'}` : `Studer A807 MK II tape recorder · ${on ? `on it: ${name(on.id)}` : 'no tape on'}`;
    if (what.startsWith('box:')) {
      const id = what.slice(4);
      return on?.id === id ? (zh ? `${name(id)} · 在机上` : `${name(id)} · on the machine`) : zh ? `${name(id)} · 上机` : `${name(id)} · put it on`;
    }
    const keys: Record<string, [string, string]> = {
      play: ['PLAY · 放', 'PLAY'],
      stop: ['STOP · 停', 'STOP'],
      rew: ['◁ · 倒带', '◁ · rewind'],
      ff: ['▷ · 快进', '▷ · fast forward'],
      zero: ['ZERO LOC · 倒回开头', 'ZERO LOC · back to the start'],
      locstart: ['LOC START · 回到上次按 PLAY 的地方', 'LOC START · back to where PLAY was last pressed'],
      rec: ['REC · 两个声道都在 SAFE，录不了', 'REC · both channels on SAFE, it will not record'],
      reset: ['RESET TIMER · 计时归零', 'RESET TIMER'],
    };
    const k = keys[what];
    return k ? (zh ? k[0] : k[1]) : '';
  }

  private reelAct(what: string) {
    const d = this.deck;
    const st = this.scene?.room.studer;
    if (what === 'machine') {
      this.goZone('reel');
      if (!this.reelSaid) this.voice.say('stacks.reel', {}, false);
      this.reelSaid = true;
      return;
    }
    if (what.startsWith('box:') || what.startsWith('load:')) return this.loadReel(what.split(':')[1]);
    if (what === 'unload') return this.loadReel(null);
    st?.pressKey(what);
    audio.unlock();
    switch (what) {
      case 'play':
        if (!d.tape) {
          audio.rocker();
          this.reelSlip();
          return;
        }
        // the machine plays through the site's sound: switch it on if it is off
        if (!prefs.get('sound')) document.getElementById('btn-sound')?.click();
        this.playFrom = d.mode === 'end' ? 0 : d.position;
        d.play();
        break;
      case 'stop':
        d.stop();
        break;
      case 'rew':
      case 'zero':
        d.wind(0);
        break;
      case 'ff':
        d.wind(d.length);
        break;
      case 'locstart':
        d.wind(this.playFrom);
        break;
      default:
        audio.rocker();
    }
    this.reelChanged();
  }

  /** Take the reel down (back into its box) and put another up; null only takes it down. */
  private loadReel(id: string | null) {
    const st = this.scene?.room.studer;
    const d = this.deck;
    const next = id ? REELS.find((t) => t.id === id) ?? null : null;
    if (id && !next) return;
    if (next && d.tape?.id === next.id) return;
    audio.unlock();
    const still = reducedMotion();
    const up = () => {
      if (!next) return;
      st?.pullBox(next.id);
      audio.slide();
      st?.mount(next.id, still, () => {
        st.pullBox(null);
        d.load(next);
        this.reelChanged();
      });
      if (!st) {
        d.load(next);
        this.reelChanged();
      }
    };
    if (d.tape) {
      const old = d.tape.id;
      d.eject();
      st?.pullBox(old);
      if (st) st.mount(null, still, () => {
        st.pullBox(null);
        up();
      });
      else up();
    } else up();
    this.reelChanged();
  }

  /** The lamps on the machine and the slip follow the transport. */
  private reelChanged() {
    const st = this.scene?.room.studer;
    const d = this.deck;
    if (st) {
      st.setLamp('l-play', d.mode === 'play');
      st.setLamp('l-stop', d.mode === 'stop' || d.mode === 'end' || d.mode === 'empty');
      st.setLamp('l-rew', d.winding < 0);
      st.setLamp('l-ff', d.winding > 0);
    }
    if (this.slip.dataset.kind === 'reel' && !this.slip.hidden) this.reelSlip();
  }

  /** The slip by the machine: the tapes on the shelf, and the transport keys (for a finger, the real ones are small). */
  private reelSlip(fresh = false) {
    const zh = isZh();
    const d = this.deck;
    const on = d.tape;
    const state = !on
      ? zh ? '没上盘。从架子上挑一盘。' : 'No tape on. Pick one off the shelf.'
      : d.mode === 'play'
        ? zh ? `在放：${on.label} · ${on.title.zh}` : `Playing: ${on.label} · ${on.title.en}`
        : d.mode === 'rew'
          ? zh ? (d.winding < 0 ? '在倒带' : '在快进') : d.winding < 0 ? 'Rewinding' : 'Winding on'
          : d.mode === 'end'
            ? zh ? `${on.label} 放完了` : `${on.label} has run out`
            : zh ? `机上：${on.label} · ${on.title.zh}，停着` : `On the machine: ${on.label} · ${on.title.en}, stopped`;
    const li = REELS.map((t) => {
      const here = on?.id === t.id;
      return `<li><button type="button" data-reel="load:${esc(t.id)}"${here ? ' aria-pressed="true"' : ''}>${esc(t.label)} · ${esc(zh ? t.title.zh : t.title.en)}</button> <span class="micro">${here ? (zh ? '在机上' : 'on the machine') : zh ? '上机' : 'put it on'}</span></li>`;
    }).join('');
    const k = (id: string, label: string) => `<button type="button" class="stackshud__slipbtn" data-reel="${id}">${label}</button>`;
    const html =
      `<h3>Studer A807 MK II</h3><p>${esc(state)}</p><ul>${li}</ul>` +
      `<p class="stackshud__reelkeys">${k('rew', '◁')}${k('ff', '▷')}${k('play', 'PLAY')}${k('stop', 'STOP')}${on ? k('unload', zh ? '下盘' : 'Take off') : ''}</p>` +
      `<p class="micro">${zh ? '7½ 英寸每秒，两轨立体声。' : '7½ inches a second, two-track stereo.'}</p>`;
    if (fresh || this.slip.hidden || this.slip.dataset.kind !== 'reel') this.showSlip(html, 'reel');
    else this.slip.innerHTML = `<button type="button" class="x" aria-label="Close">×</button>${html}`;
  }
}
