/**
 * The stacks, wired to the page: the head column, the hover callout, the
 * switches (on the plate in the room and mirrored in the column), the desk
 * lamps' pull chains, the day's weather, and the slips laid on the room
 * (today's arrivals, the strong cabinet, the routine side).
 *
 * The lights the visitor sets are kept until the island's next 07:00 or
 * 19:00, like the day and night choice.
 */
import type { ArchiveRecord, Category } from '../types';
import { StacksScene, STACKS_ZONES, type StacksZone } from './scene';
import { ROWS, type StacksCategory } from './room';
import { islandDay, islandHalfDay, islandIso } from '../island';
import { islandHumidity, islandRaining } from '../weather';
import { isZh } from '../i18n';
import { audio } from '../audio';
import { reducedMotion } from '../prefs';
import { canvasFontsReady } from '../scene/textures';
import { esc } from '../ui/text';
import type { Archivist } from '../ui/archivist';

const ZH_CAT: Record<string, string> = { personnel: '人员', events: '事件', programs: '计划' };
const REGIONS = [
  { en: 'North · North-East', zh: '北部 · 东北部' },
  { en: 'East · West', zh: '东部 · 西部' },
];
/** Every glyph the room's plates and cards are lettered with. */
const GLYPHS = '人员事件计划北部东南西兀兰义顺三巴旺实里达宏茂桥后港龙岗盛勿洛淡滨尼白沙樟宜裕廊武吉督蔡厝金文泰署内例行霏微记录档案库本不得携出今日入待归卷目报告司机车票索引卡区年编号全岛图口';

interface Lights {
  half: number;
  theme: 'day' | 'night';
  rows: boolean[];
  desks: boolean[];
  /** The island day the dehumidifier was last emptied. */
  emptied?: string;
}
const KEY = 'n9:stacks';

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
  /** Push into a group of formal cabinets: the drawers take over. */
  enter(ci: number): void;
  open(rec: ArchiveRecord): void;
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

  constructor(private root: HTMLElement, private categories: Category[], private records: ArchiveRecord[], theme: 'day' | 'night', private voice: Archivist, private hooks: StacksHooks) {
    this.theme = theme;
    this.lights = load(theme);
    this.callout = document.getElementById('stacks-callout')!;
    this.slip = document.getElementById('stacks-slip')!;
    this.ready = this.build();
    this.bindHud();
    this.stats();
  }

  private byCat(ci: number) {
    return this.records.filter((r) => r.category === this.categories[ci]?.id);
  }

  private async build() {
    const event = this.records.filter((r) => r.category === 'events').at(-1);
    const reading = event ? { title: event.zh?.title ?? event.title, file: event.file } : undefined;
    await canvasFontsReady(GLYPHS + (reading?.title ?? ''));
    const cats: StacksCategory[] = this.categories.map((c, i) => {
      const list = this.byCat(i);
      return { id: c.id, zh: ZH_CAT[c.id] ?? c.label, en: c.label, code: c.code, range: list.length ? `${list[0].file} — ${list[list.length - 1].file}` : '' };
    });
    try {
      this.scene = new StacksScene(this.root, document.getElementById('stacks') as HTMLCanvasElement, cats, { today: this.today, reading }, {
        zone: (z) => this.markZone(z),
        hover: (k) => this.hover(k),
        cabinet: (ci) => this.hooks.enter(ci),
        bank: (bi) => this.routine(bi),
        rocker: (i) => this.toggleRow(i),
        desk: (i) => this.toggleDesk(i),
        index: () => this.hooks.search(),
        tray: () => this.arrivals(),
        safe: () => this.strongCabinet(),
        dehumidifier: () => this.emptyTank(),
      });
    } catch (err) {
      console.error('[stacks] WebGL unavailable', err);
      return;
    }
    const s = this.scene;
    s.setWeather(this.rain, islandHumidity(this.today));
    s.setTheme(this.theme, true);
    this.lights.rows.forEach((on, i) => s.setRow(i, on, true));
    this.lights.desks.forEach((on, i) => s.setDesk(i, on, true));
    s.room.setTankFull(this.tankFull());
    this.markRows();
  }

  /* ---------------- show / hide ---------------- */
  show() {
    void this.ready.then(() => {
      this.scene?.pullOut();
      this.scene?.resume();
    });
    audio.rain(this.rain);
  }

  hide() {
    audio.rain(false);
    this.closeSlip();
    this.callout.classList.remove('is-on');
    // keep drawing through the cross-fade, then rest
    window.setTimeout(() => {
      if (this.root.dataset.layer !== 'stacks') this.scene?.pause();
    }, reducedMotion() ? 0 : 950);
  }

  pushIn(ci: number) {
    this.scene?.pushIn(ci);
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
      this.lights.rows.forEach((on, i) => s.setRow(i, on, true));
      this.lights.desks.forEach((on, i) => s.setDesk(i, on, true));
      this.markRows();
    });
  }

  enterVoice() {
    if (this.rain) this.voice.say('stacks.rain', {}, false);
  }

  /** Keyboard in the room: 0–5 corners, Esc back to the whole room. */
  key(e: KeyboardEvent): boolean {
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
  }

  /* ---------------- the head column ---------------- */
  private bindHud() {
    document.querySelectorAll<HTMLButtonElement>('#stacks-zones [data-zone]').forEach((b) => b.addEventListener('click', () => this.scene?.goZone(b.dataset.zone as StacksZone)));
    document.querySelectorAll<HTMLButtonElement>('#stacks-cats [data-cat]').forEach((b) => b.addEventListener('click', () => this.hooks.enter(Number(b.dataset.cat))));
    document.querySelectorAll<HTMLButtonElement>('.stackshud__rockers [data-row]').forEach((b) => b.addEventListener('click', () => this.toggleRow(Number(b.dataset.row))));
    this.slip.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('.x')) return this.closeSlip();
      const f = el.closest<HTMLElement>('[data-file]')?.dataset.file;
      const rec = f ? this.records.find((r) => r.file === f) : null;
      if (rec) {
        this.closeSlip();
        this.hooks.open(rec);
      }
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
      if (b) b.textContent = String(this.byCat(i).length).padStart(2, '0');
    });
  }

  private markZone(z: StacksZone) {
    document.querySelectorAll<HTMLButtonElement>('#stacks-zones [data-zone]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === z)));
    audio.flick();
  }

  private markRows() {
    document.querySelectorAll<HTMLButtonElement>('.stackshud__rockers [data-row]').forEach((b) => {
      const i = Number(b.dataset.row);
      b.setAttribute('aria-pressed', String(this.lights.rows[i]));
      b.title = isZh() ? ROWS[i].zh : ROWS[i].en;
    });
  }

  /* ---------------- hover ---------------- */
  private hover(key: string | null) {
    if (!key) {
      this.callout.classList.remove('is-on');
      return;
    }
    const zh = isZh();
    const [kind, arg] = key.split(':');
    let text = '';
    if (kind === 'cat') {
      const ci = this.categories.findIndex((c) => c.id === arg);
      const n = this.byCat(ci).length;
      text = zh ? `${ZH_CAT[arg] ?? arg} · ${n} 份 · 拉开柜子` : `${this.categories[ci]?.label} · ${n} ${n === 1 ? 'file' : 'files'} · open the cabinet`;
    } else if (kind === 'bank') text = zh ? `例行文件 · ${REGIONS[Number(arg)].zh}` : `Routine paperwork · ${REGIONS[Number(arg)].en}`;
    else if (kind === 'rocker') {
      const i = Number(arg);
      const on = this.lights.rows[i];
      text = zh ? `${i + 1} 号开关 · ${ROWS[i].zh} · ${on ? '开着' : '关着'}` : `Switch ${i + 1} · ${ROWS[i].en} · ${on ? 'on' : 'off'}`;
    } else if (kind === 'desk') {
      const on = this.lights.desks[Number(arg)];
      const what = Number(arg) === 2 ? (zh ? '入库台的灯' : 'Desk lamp at the intake desk') : zh ? '阅档桌台灯' : 'Reading lamp';
      text = zh ? `${what} · 拉一下灯绳${on ? '关掉' : '打开'}` : `${what} · pull the chain to switch it ${on ? 'off' : 'on'}`;
    } else if (kind === 'index') text = zh ? '索引卡 · 按区、年份、编号查档案' : 'Card index · look a record up by district, year or number';
    else if (kind === 'tray') {
      const n = this.arrivedToday().length;
      text = zh ? `今日入库 · ${n} 份` : `Received today · ${n}`;
    } else if (kind === 'safe') text = zh ? '绝密柜 · 锁着' : 'Strong cabinet · locked';
    else if (kind === 'dehumidifier') text = this.tankFull() ? (zh ? '除湿机 · 水箱满了，倒一下' : 'Dehumidifier · the tank is full, empty it') : zh ? '除湿机 · 在转' : 'Dehumidifier · running';
    else if (kind === 'zone') text = arg === 'reading' ? (zh ? '阅档桌' : 'Reading table') : zh ? '入库台' : 'Intake desk';
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
    if (!this.lights.rows.some(Boolean)) this.voice.say('stacks.dark', {}, false);
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

  private showSlip(html: string) {
    this.slip.innerHTML = `<button type="button" class="x" aria-label="Close">×</button>${html}`;
    this.slip.hidden = false;
    this.slip.animate?.([{ opacity: 0, transform: 'translateY(.6rem) rotate(-.6deg)' }, { opacity: 1, transform: 'rotate(-.6deg)' }], { duration: reducedMotion() ? 0 : 320, easing: 'ease-out' });
    audio.paper();
  }

  closeSlip() {
    this.slip.hidden = true;
  }

  private list(recs: ArchiveRecord[]) {
    return `<ul>${recs.map((r) => `<li><button type="button" data-file="${esc(r.file)}">${esc(r.file)} · ${esc(r.title)}</button></li>`).join('')}</ul>`;
  }

  private arrivals() {
    const zh = isZh();
    const today = this.arrivedToday();
    if (today.length) {
      this.showSlip(`<h3>${zh ? '今日入库' : 'Received today'}</h3>${this.list(today)}`);
      return;
    }
    const recent = this.records.filter((r) => islandDay(r.date)).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 3);
    this.showSlip(`<h3>${zh ? '今日入库' : 'Received today'}</h3><p>${zh ? '今天还没有新档案送来。上一批是：' : 'Nothing has come in today. The last ones were:'}</p>${this.list(recent)}`);
  }

  private strongCabinet() {
    const zh = isZh();
    const top = this.records.filter((r) => r.stamp === 'TOP SECRET');
    this.voice.say('stacks.safe');
    this.showSlip(
      `<h3>${zh ? '绝密柜' : 'Strong cabinet'}</h3><p>${zh ? '柜子锁着，档案照样能借出来读。按署里的规定，绝密文件只在日光灯下看。' : 'The cabinet is locked; the files can still be read. By Office rules, top secret papers are read under the tube light only.'}</p>` +
        (top.length ? this.list(top) : `<p>${zh ? '现在柜里是空的。' : 'It is empty at present.'}</p>`),
    );
  }

  private routine(bi: number) {
    const zh = isZh();
    this.voice.say('stacks.routine');
    this.showSlip(`<h3>${zh ? `例行文件 · ${REGIONS[bi].zh}` : `Routine paperwork · ${REGIONS[bi].en}`}</h3><p>${zh ? '巴士班次、水表读数、失物招领……按区、按季度归在这两排柜子里。署里正一个区一个区地上架，上好了这些抽屉就能拉开。' : 'Bus timetables, meter readings, lost property… filed here by district and by quarter. The Office is shelving them one district at a time; the drawers open once they are in.'}</p>`);
  }
}
