/**
 * The Office's own 1999 calendar, on a nail between the notice board and the
 * screen. One sheet a month: a halftone picture above, the month below, the
 * lunar days under the dates in Chinese. Turning a month lifts the sheet up
 * over the nail; going back brings the last one down again.
 *
 * Heuss rings the days something happened in red pen and ticks the days a
 * file, draft or attachment is dated; the days gone by this month are struck
 * through in pencil; today wears the red plastic date marker. A day picked
 * gets a slip pinned up under the calendar.
 */
import * as THREE from 'three';
import { Spring } from '../spring';
import { pressPhoto } from '../scene/halftone';
import { islandNow } from '../island';

const SANS = '"Archivo Variable", "Archivo", "N9 KuHei", Arial, sans-serif';
const COND = '"Archivo Variable", "Archivo", "N9 DIN", "N9 KuHei", Arial, sans-serif';
const MONO = '"IBM Plex Mono", "N9 HuoSong", ui-monospace, monospace';
const INK = '#1d1b17';
const RED = '#b8281d';

/** Sheet size in metres, and its canvas. */
export const CAL = { w: 0.4, h: 0.5625 };
const PX = { w: 640, h: 900 };
const GRID = { x: 28, y: 540, cw: (640 - 56) / 7, rh: 52, head: 528 };

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const ZH_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

/* ---------------- the lunar days of 1999 ---------------- */
// first day of each lunar month that touches 1999, and which month it is
const LUNAR: [string, number][] = [
  ['1998-12-19', 11], ['1999-01-18', 12], ['1999-02-16', 1], ['1999-03-18', 2], ['1999-04-16', 3], ['1999-05-15', 4], ['1999-06-14', 5],
  ['1999-07-13', 6], ['1999-08-11', 7], ['1999-09-10', 8], ['1999-10-09', 9], ['1999-11-08', 10], ['1999-12-08', 11], ['2000-01-07', 12],
];
const L_MONTH = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
const L_DAY = (n: number) => (n <= 10 ? `初${'一二三四五六七八九十'[n - 1]}` : n < 20 ? `十${'一二三四五六七八九'[n - 11]}` : n === 20 ? '二十' : n < 30 ? `廿${'一二三四五六七八九'[n - 21]}` : '三十');
const FESTIVAL: Record<string, string> = { '1-1': '春节', '1-15': '元宵', '5-5': '端午', '7-15': '中元', '8-15': '中秋', '9-9': '重阳' };
const SOLAR: Record<string, string> = { '1999-04-05': '清明', '1999-12-22': '冬至' };
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/** The lunar date of a day of 1999: month, day, and the festival if it is one. */
export function lunar(m: number, d: number) {
  const iso = `1999-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let k = 0;
  while (k + 1 < LUNAR.length && LUNAR[k + 1][0] <= iso) k++;
  const [start, month] = LUNAR[k];
  const day = Math.round((utc(iso) - utc(start)) / 864e5) + 1;
  const fest = SOLAR[iso] ?? FESTIVAL[`${month}-${day}`];
  return { month, day, fest, short: fest ?? (day === 1 ? L_MONTH[month - 1] : L_DAY(day)), long: `农历${L_MONTH[month - 1]}${L_DAY(day)}${fest ? ` · ${fest}` : ''}` };
}

/** What Heuss has marked on a month: rings for things that happened, ticks for anything dated. */
export interface MonthMarks {
  ring: number[];
  tick: number[];
}

const first = (m: number) => new Date(Date.UTC(1999, m, 1)).getUTCDay();
const length = (m: number) => new Date(Date.UTC(1999, m + 1, 0)).getUTCDate();
const cell = (m: number, d: number) => {
  const k = first(m) + d - 1;
  return { x: GRID.x + (k % 7) * GRID.cw, y: GRID.y + Math.floor(k / 7) * GRID.rh, col: k % 7 };
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A ring in red ballpoint: twice round, never quite closed. */
function ring(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, seed: number) {
  const r = rng(seed);
  g.strokeStyle = 'rgba(184,40,29,.86)';
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.lineWidth = pass ? 1.6 : 2.6;
    g.beginPath();
    const a0 = -2.2 + r() * 0.6, sweep = Math.PI * 2 + 0.25 + r() * 0.35;
    for (let i = 0; i <= 40; i++) {
      const a = a0 + (sweep * i) / 40;
      const w = 1 + (r() - 0.5) * 0.05 + pass * 0.06;
      const x = cx + Math.cos(a) * rx * w, y = cy + Math.sin(a) * ry * w;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
}

/** One month's sheet. `today` marks only the month it falls in. */
export function sheet(m: number, marks: MonthMarks, today: { m: number; d: number }, zh: boolean) {
  const c = document.createElement('canvas');
  c.width = PX.w;
  c.height = PX.h;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f1ebdc';
  g.fillRect(0, 0, PX.w, PX.h);
  const r = rng(31 + m * 7);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(80,60,30,${r() * 0.05})`;
    g.fillRect(r() * PX.w, r() * PX.h, 1.4, 1.4);
  }
  // the tin strip and its hole for the nail
  g.fillStyle = '#4a4d50';
  g.fillRect(0, 0, PX.w, 30);
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(0, 3, PX.w, 2);
  g.fillStyle = '#16171a';
  g.beginPath();
  g.arc(PX.w / 2, 15, 7, 0, Math.PI * 2);
  g.fill();

  // the picture: a different view of the island each month
  g.drawImage(pressPhoto(null, `calendar-1999-${m}`, 584, 340), 28, 44);

  // the month
  g.fillStyle = INK;
  g.font = `800 96px ${COND}`;
  g.textBaseline = 'alphabetic';
  g.fillText(String(m + 1).padStart(2, '0'), 24, 488);
  g.font = `800 36px ${COND}`;
  g.fillText(MONTHS[m], 150, 446);
  g.font = `500 17px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.65)';
  g.fillText('1999 · RECORDS OFFICE · GERIMIS', 152, 478);
  if (zh) {
    g.fillStyle = RED;
    g.font = `400 44px ${SANS}`;
    g.textAlign = 'right';
    g.fillText(`${ZH_NUM[m]}月`, PX.w - 28, 446);
    g.font = `400 17px ${MONO}`;
    g.fillStyle = 'rgba(29,27,23,.65)';
    g.fillText(m === 0 ? '戊寅年 · 己卯年' : '己卯年', PX.w - 28, 478);
    g.textAlign = 'left';
  }
  g.fillStyle = 'rgba(29,27,23,.8)';
  g.fillRect(28, 500, PX.w - 56, 2);

  // weekdays, Sunday first and in red
  const heads = zh ? ['日', '一', '二', '三', '四', '五', '六'] : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  g.textAlign = 'center';
  g.font = zh ? `400 17px ${SANS}` : `600 14px ${MONO}`;
  heads.forEach((h, i) => {
    g.fillStyle = i === 0 ? RED : 'rgba(29,27,23,.7)';
    g.fillText(h, GRID.x + GRID.cw * (i + 0.5), GRID.head);
  });

  const n = length(m);
  const now = today.m === m;
  for (let d = 1; d <= n; d++) {
    const { x, y, col } = cell(m, d);
    const cx = x + GRID.cw / 2;
    const lu = lunar(m, d);
    g.fillStyle = col === 0 || (zh && lu.fest) ? RED : INK;
    g.font = `500 28px ${MONO}`;
    g.fillText(String(d), cx, y + (zh ? 30 : 36));
    if (zh) {
      g.font = `400 13px ${SANS}`;
      g.fillStyle = lu.fest ? RED : 'rgba(29,27,23,.55)';
      g.fillText(lu.short, cx, y + 47);
    }
    // the days gone by this month: a pencil stroke through each
    if (now && d < today.d) {
      g.strokeStyle = 'rgba(60,60,60,.55)';
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(x + 14, y + 44);
      g.lineTo(x + GRID.cw - 14, y + 8);
      g.stroke();
    }
    if (marks.ring.includes(d)) ring(g, cx, y + 25, GRID.cw * 0.42, 24, m * 40 + d);
    else if (marks.tick.includes(d)) {
      // a small pencil tick in the corner
      g.strokeStyle = 'rgba(40,40,40,.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + GRID.cw - 22, y + 9);
      g.lineTo(x + GRID.cw - 17, y + 15);
      g.lineTo(x + GRID.cw - 8, y + 2);
      g.stroke();
    }
    if (d === 9 && !marks.ring.includes(d)) {
      g.fillStyle = 'rgba(184,40,29,.85)';
      g.beginPath();
      g.arc(x + GRID.cw - 10, y + 8, 3, 0, Math.PI * 2);
      g.fill();
    }
    // today: the red plastic marker slid over the date
    if (now && d === today.d) {
      g.fillStyle = 'rgba(214,52,34,.16)';
      g.fillRect(x + 4, y + 1, GRID.cw - 8, GRID.rh - 4);
      g.strokeStyle = 'rgba(196,44,28,.9)';
      g.lineWidth = 4;
      g.strokeRect(x + 4, y + 1, GRID.cw - 8, GRID.rh - 4);
    }
  }
  g.textAlign = 'left';
  g.font = `500 13px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.5)';
  g.fillText(zh ? '霏微记录署 印 · 免费赠阅' : 'PRINTED BY THE RECORDS OFFICE · NOT FOR SALE', 28, 884);
  return c;
}

/** Where on a sheet a point (texture u, v) falls: a day, or the picture (turn the page). */
export function hitSheet(m: number, u: number, v: number): { day?: number; picture?: boolean } {
  const px = u * PX.w, py = (1 - v) * PX.h;
  if (py > 36 && py < 390) return { picture: true };
  if (py < GRID.y || px < GRID.x || px > PX.w - GRID.x) return {};
  const k = Math.floor((py - GRID.y) / GRID.rh) * 7 + Math.floor((px - GRID.x) / GRID.cw);
  const d = k - first(m) + 1;
  return d >= 1 && d <= length(m) ? { day: d } : {};
}

/** The slip pinned under the calendar: the date, and the file numbers on it. */
function slipTexture(m: number, d: number, lines: string[]) {
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 240;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f6f1e2';
  g.fillRect(0, 0, 360, 240);
  g.strokeStyle = 'rgba(40,70,120,.18)';
  g.lineWidth = 1.5;
  for (let y = 70; y < 240; y += 34) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(360, y);
    g.stroke();
  }
  g.fillStyle = INK;
  g.font = `700 40px ${MONO}`;
  g.fillText(`${d}.${m + 1}.99`, 22, 54);
  g.font = `500 24px ${MONO}`;
  (lines.length ? lines.slice(0, 4) : ['—']).forEach((l, i) => {
    g.fillStyle = i === 0 && lines.length ? RED : 'rgba(29,27,23,.8)';
    g.fillText(l, 24, 96 + i * 34);
  });
  return c;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class WallCalendar {
  readonly group = new THREE.Group();
  /** The sheet showing: what a click lands on. */
  readonly face: THREE.Mesh;
  month: number;
  private faceMat: THREE.MeshStandardMaterial;
  private pivot = new THREE.Group();
  private leafMat: THREE.MeshStandardMaterial;
  private leafBack: THREE.MeshStandardMaterial;
  private turn = new Spring(0, 5.5);
  private cache = new Map<number, THREE.CanvasTexture>();
  private slip = new THREE.Group();
  private slipMat: THREE.MeshStandardMaterial;
  private pinned = new Spring(0, 9);

  /** Heuss's marks for a month; set by the page once it knows what is on file. */
  marks: (m: number) => MonthMarks = () => ({ ring: [], tick: [] });
  private today: { m: number; d: number };

  constructor(
    private zh: boolean,
    private reduce: boolean,
  ) {
    const now = islandNow();
    this.today = { m: now.month, d: now.day };
    this.month = this.today.m;
    const { w, h } = CAL;
    // the card backing and the rest of the year's sheets behind this one
    const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.012, h + 0.01, 0.006), new THREE.MeshStandardMaterial({ color: '#d9d0b9', roughness: 0.95 }));
    back.position.z = -0.004;
    back.castShadow = back.receiveShadow = true;
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.tex(this.month), roughness: 0.9 });
    this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.faceMat);
    this.face.receiveShadow = true;
    this.face.userData.zone = 'calendar';
    // the nail it hangs on
    const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 8), new THREE.MeshStandardMaterial({ color: '#8a8d90', metalness: 0.8, roughness: 0.35 }));
    nail.rotation.x = Math.PI / 2;
    nail.position.set(0, h / 2 - 0.009, 0.012);
    // the sheet that turns, hinged at the tin strip
    this.leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9, transparent: true, side: THREE.FrontSide });
    this.leafBack = new THREE.MeshStandardMaterial({ color: '#e9e2d0', roughness: 0.95, transparent: true });
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, -h / 2, 0);
    const front = new THREE.Mesh(geo, this.leafMat);
    const rear = new THREE.Mesh(geo, this.leafBack);
    rear.rotation.y = Math.PI;
    front.castShadow = true;
    this.pivot.add(front, rear);
    this.pivot.position.set(0, h / 2, 0.002);
    this.pivot.visible = false;
    // the slip under it, with a pin borrowed from the board
    this.slipMat = new THREE.MeshStandardMaterial({ roughness: 0.92, transparent: true });
    const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), this.slipMat);
    slip.castShadow = true;
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshStandardMaterial({ color: '#c4321f', roughness: 0.35 }));
    pin.position.set(0, 0.045, 0.006);
    this.slip.add(slip, pin);
    this.slip.position.set(0.02, -h / 2 - 0.1, 0.004);
    this.slip.visible = false;
    this.group.add(back, this.face, nail, this.pivot, this.slip);
  }

  private tex(m: number) {
    let t = this.cache.get(m);
    if (!t) {
      t = new THREE.CanvasTexture(sheet(m, this.marks(m), this.today, this.zh));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.cache.set(m, t);
    }
    return t;
  }

  /** Redraw every sheet (the language changed, or the day did). */
  redraw(zh: boolean, today = this.today) {
    this.zh = zh;
    this.today = today;
    for (const t of this.cache.values()) t.dispose();
    this.cache.clear();
    this.faceMat.map = this.tex(this.month);
    this.faceMat.needsUpdate = true;
    if (this.pivot.visible) this.land();
  }

  /** Turn to month `m`: forward lifts this sheet up over the nail, back brings the last one down. */
  show(m: number) {
    if (m === this.month || m < 0 || m > 11) return;
    if (this.pivot.visible) this.land();
    const fwd = m > this.month;
    const from = this.month;
    this.month = m;
    if (this.reduce) {
      this.faceMat.map = this.tex(m);
      this.faceMat.needsUpdate = true;
      return;
    }
    if (fwd) {
      this.leafMat.map = this.tex(from);
      this.faceMat.map = this.tex(m);
      this.faceMat.needsUpdate = true;
      this.turn.set(0);
      this.turn.target = 1;
    } else {
      this.leafMat.map = this.tex(m);
      this.turn.set(1);
      this.turn.target = 0;
    }
    this.leafMat.needsUpdate = true;
    this.pivot.visible = true;
    this.tick(0);
  }

  /** Finish a turn at once. */
  private land() {
    this.pivot.visible = false;
    this.pivot.rotation.x = 0;
    this.faceMat.map = this.tex(this.month);
    this.faceMat.needsUpdate = true;
  }

  /** Pin a slip for day `d` (null takes it down). */
  pin(d: number | null, lines: string[] = []) {
    if (d === null) {
      this.pinned.target = 0;
      return;
    }
    this.slipMat.map?.dispose();
    const t = new THREE.CanvasTexture(slipTexture(this.month, d, lines));
    t.colorSpace = THREE.SRGBColorSpace;
    this.slipMat.map = t;
    this.slipMat.needsUpdate = true;
    this.slip.visible = true;
    this.slip.rotation.z = (((d * 37) % 7) - 3) * 0.02;
    if (this.reduce) this.pinned.set(1);
    else {
      this.pinned.set(Math.min(this.pinned.value, 0.3));
      this.pinned.target = 1;
    }
  }

  tick(dt: number) {
    if (this.pivot.visible) {
      const v = this.turn.update(dt);
      this.pivot.rotation.x = -v * 2.8;
      const o = 1 - smooth(0.55, 0.98, v);
      this.leafMat.opacity = this.leafBack.opacity = o;
      if (this.turn.target === 1 && v > 0.985) this.land();
      if (this.turn.target === 0 && v < 0.01) this.land();
    }
    if (this.slip.visible) {
      const p = this.pinned.update(dt);
      this.slipMat.opacity = smooth(0, 0.5, p);
      this.slip.scale.setScalar(0.85 + 0.15 * p);
      this.slip.position.z = 0.004 + (1 - p) * 0.03;
      if (this.pinned.target === 0 && p < 0.02) this.slip.visible = false;
    }
  }
}
