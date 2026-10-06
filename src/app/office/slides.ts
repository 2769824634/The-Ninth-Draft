/**
 * The slides for the office projector, drawn on canvas from the archive and
 * packed into trays: one tray that goes round the island (a title slide and
 * every district's map), then a tray per district (its map, each file's
 * cover and, when the file has a photograph, the photograph), each ending
 * with an end slide. Office slides of the period were diazo: white lines on
 * deep blue. Photographs are photographs.
 *
 * Each slide is drawn into a square (what the lamp projects through); the
 * 3:2 frame sits in the middle and everything around it is black, so no
 * light falls outside the picture.
 */
import { DISTRICTS } from '../visitor/districts';
import { INK, clearanceKey } from '../clearance';

type L = { en: string; zh: string };

export interface SlideFile {
  file: string;
  slug: string;
  stamp: string;
  category: string;
  district?: string;
  date?: string;
  title: L;
  subtitle?: L;
  place?: L;
  image?: string;
}

export type Slide =
  | { kind: 'title'; files: number; districts: number }
  | { kind: 'district'; district: string; files: number }
  | { kind: 'cover'; f: SlideFile }
  | { kind: 'photo'; f: SlideFile }
  | { kind: 'end' };

/** A carousel tray holds eighty. */
export const TRAY = 80;

/** One tray in its box: a code on the spine, a title on the lid, its slides in order. */
export interface Tray {
  id: string;
  code: string;
  title: L;
  /** Spine stripe: the ink of the most secret file in it. */
  ink: string;
  slides: Slide[];
}

const RANK = ['top', 'secret', 'conf', 'restr', 'draft', 'declass'] as const;
const inkOf = (files: SlideFile[]) => {
  const keys = files.map((f) => clearanceKey(f.stamp));
  const k = RANK.find((r) => keys.includes(r));
  return k ? INK[k] : '#c08a1e';
};

/** Whatever fits in eighty slots; the last slot is always the end slide. */
const full = (slides: Slide[]): Slide[] => [...slides.slice(0, TRAY - 1), { kind: 'end' }];

/**
 * The trays on the floor by the sofa: one that goes round the island (the
 * title and every district's map), then one per district that has files
 * (its map, then each file's cover and photograph), and one for files that
 * belong to no district.
 */
export function buildTrays(files: SlideFile[]): Tray[] {
  const trays: Tray[] = [];
  const groups: { district: string; files: SlideFile[] }[] = [];
  for (const d of DISTRICTS) {
    const fs = files.filter((f) => f.district === d.id);
    if (fs.length) groups.push({ district: d.id, files: fs });
  }
  trays.push({
    id: 'island',
    code: 'T-00',
    title: { en: 'Gerimis, by district', zh: '霏微，按区' },
    ink: '#c08a1e',
    slides: full([
      { kind: 'title', files: files.length, districts: groups.length },
      ...DISTRICTS.map((d) => ({ kind: 'district' as const, district: d.id, files: files.filter((f) => f.district === d.id).length })),
    ]),
  });
  const loose = files.filter((f) => !f.district || !DISTRICTS.some((d) => d.id === f.district));
  if (loose.length) groups.push({ district: '', files: loose });
  for (const g of groups) {
    const d = DISTRICTS.find((x) => x.id === g.district);
    const slides: Slide[] = [{ kind: 'district', district: g.district, files: g.files.length }];
    for (const f of g.files.slice().sort((a, b) => a.file.localeCompare(b.file))) {
      slides.push({ kind: 'cover', f });
      if (f.image) slides.push({ kind: 'photo', f });
    }
    trays.push({
      id: g.district || 'unfiled',
      code: `T-${String(trays.length).padStart(2, '0')}`,
      title: d ? { en: d.en, zh: d.zh } : { en: 'Unfiled', zh: '未分区' },
      ink: inkOf(g.files),
      slides: full(slides),
    });
  }
  return trays;
}

/** The line under the screen and in the list. */
export function caption(s: Slide, zh: boolean): string {
  const T = (l?: L) => (l ? (zh ? l.zh : l.en) : '');
  switch (s.kind) {
    case 'title':
      return zh ? '片头' : 'Title';
    case 'district': {
      const d = DISTRICTS.find((x) => x.id === s.district);
      return d ? (zh ? `区图 · ${d.zh}` : `Map · ${d.en}`) : zh ? '区图 · 全岛' : 'Map · Island-wide';
    }
    case 'cover':
      return `${s.f.file} · ${T(s.f.title)}`;
    case 'photo':
      return `${s.f.file} · ${zh ? '照片' : 'Photograph'}`;
    default:
      return zh ? '本盘完' : 'End of tray';
  }
}

/* ---------------- drawing ---------------- */
export const SLIDE_PX = 1024;
/** The picture inside the square: 3:2, inside the lamp's circle. */
export const FW = 0.8 * SLIDE_PX, FH = FW / 1.5;
export const FX = (SLIDE_PX - FW) / 2, FY = (SLIDE_PX - FH) / 2;

const DIAZO = '#0d2c8c';
const DIAZO_DEEP = '#081d63';
const WHITE = '#f3f1ea';
const CYAN = '#bfe3ff';
const AMBER = '#ffcf5a';
const SANS = '"Archivo Variable", "Archivo", "N9 KuHei", Arial, sans-serif';
const COND = '"Archivo Variable", "Archivo", "N9 DIN", "N9 KuHei", Arial, sans-serif';
const MONO = '"IBM Plex Mono", "N9 HuoSong", ui-monospace, monospace';

const images = new Map<string, HTMLImageElement>();
/** Photographs load once; `ready` is called when one arrives so the slide can be redrawn. */
export function preload(files: SlideFile[], ready: () => void) {
  for (const f of files) {
    if (!f.image || images.has(f.image)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = ready;
    img.src = f.image;
    images.set(f.image, img);
  }
}

function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  let t = text;
  while (g.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…';
  return t;
}

function diazo(g: CanvasRenderingContext2D) {
  const grad = g.createRadialGradient(SLIDE_PX / 2, SLIDE_PX / 2, FW * 0.1, SLIDE_PX / 2, SLIDE_PX / 2, FW * 0.62);
  grad.addColorStop(0, DIAZO);
  grad.addColorStop(1, DIAZO_DEEP);
  g.fillStyle = grad;
  g.fillRect(FX, FY, FW, FH);
  // the film's own grain, and a hair caught in the gate
  g.save();
  g.globalAlpha = 0.06;
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = i % 2 ? '#fff' : '#000';
    g.fillRect(FX + ((i * 7919) % FW), FY + ((i * 104729) % FH), 1.5, 1.5);
  }
  g.restore();
}

function hair(g: CanvasRenderingContext2D, seed: number) {
  g.save();
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 1.2;
  g.beginPath();
  const x = FX + 40 + (seed * 97) % (FW - 80), y = FY + 30 + (seed * 61) % (FH - 60);
  g.moveTo(x, y);
  g.bezierCurveTo(x + 30, y + 10, x + 10, y + 40, x + 46, y + 52);
  g.stroke();
  g.restore();
}

/** The island in white line, one district picked out. */
function island(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, pick: string) {
  const sx = w / 1000, sy = h / 560;
  const pts = DISTRICTS.map((d) => [x0 + d.x * sx, y0 + d.y * sy] as const);
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  let s = 2;
  const r = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
  g.save();
  g.strokeStyle = WHITE;
  g.lineWidth = 3;
  g.setLineDash([]);
  g.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rad = (Math.abs(Math.cos(a)) * 300 + Math.abs(Math.sin(a)) * 190) * sx * (0.92 + r() * 0.12);
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.9;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.fill();
  g.stroke();
  // survey grid
  g.globalAlpha = 0.18;
  g.lineWidth = 1;
  for (let gx = x0; gx <= x0 + w; gx += w / 10) {
    g.beginPath();
    g.moveTo(gx, y0);
    g.lineTo(gx, y0 + h);
    g.stroke();
  }
  for (let gy = y0; gy <= y0 + h; gy += h / 6) {
    g.beginPath();
    g.moveTo(x0, gy);
    g.lineTo(x0 + w, gy);
    g.stroke();
  }
  g.globalAlpha = 1;
  for (const d of DISTRICTS) {
    const x = x0 + d.x * sx, y = y0 + d.y * sy;
    const on = d.id === pick;
    g.fillStyle = on ? AMBER : CYAN;
    g.beginPath();
    g.arc(x, y, on ? 9 : 5, 0, Math.PI * 2);
    g.fill();
    if (on) {
      g.strokeStyle = AMBER;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(x, y, 24, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = on ? AMBER : CYAN;
    g.font = `${on ? 700 : 500} ${on ? 19 : 15}px ${COND}`;
    g.textAlign = d.left ? 'right' : 'left';
    g.fillText(`${d.en.toUpperCase()} ${d.zh}`, x + (d.left ? -14 : 14), y + 6);
  }
  g.textAlign = 'left';
  g.restore();
}

function header(g: CanvasRenderingContext2D, left: string, right: string) {
  g.fillStyle = CYAN;
  g.font = `500 17px ${MONO}`;
  g.fillText(left, FX + 40, FY + 48);
  g.textAlign = 'right';
  g.fillText(right, FX + FW - 40, FY + 48);
  g.textAlign = 'left';
  g.fillStyle = 'rgba(191,227,255,.5)';
  g.fillRect(FX + 40, FY + 62, FW - 80, 1.5);
}

/** Draw slide `s` (number `n` in the tray) into a fresh square canvas. */
export function drawSlide(s: Slide, n: number, zh: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SLIDE_PX;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, SLIDE_PX, SLIDE_PX);
  const T = (l?: L) => (l ? (zh ? l.zh : l.en) : '');
  const no = String(n + 1).padStart(2, '0');
  g.textBaseline = 'alphabetic';

  if (s.kind === 'photo') {
    const img = s.f.image ? images.get(s.f.image) : undefined;
    g.fillStyle = '#1a1612';
    g.fillRect(FX, FY, FW, FH);
    if (img && img.complete && img.naturalWidth) {
      // cover the frame, then age it a little: warm, faded blacks
      const k = Math.max(FW / img.naturalWidth, FH / img.naturalHeight);
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      g.save();
      g.beginPath();
      g.rect(FX, FY, FW, FH);
      g.clip();
      g.filter = 'sepia(.35) contrast(1.05) saturate(.85)';
      g.drawImage(img, FX + (FW - w) / 2, FY + (FH - h) / 2, w, h);
      g.filter = 'none';
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(40,24,10,.18)';
      g.fillRect(FX, FY, FW, FH);
      g.restore();
    } else {
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.font = `500 20px ${MONO}`;
      g.textAlign = 'center';
      g.fillText(s.f.file, SLIDE_PX / 2, SLIDE_PX / 2);
      g.textAlign = 'left';
    }
    hair(g, n + 3);
  } else {
    diazo(g);
    if (s.kind === 'title') {
      header(g, 'RECORDS OFFICE · DATA SECTION', `SLIDE ${no}`);
      g.fillStyle = WHITE;
      g.font = `800 ${zh ? 64 : 72}px ${SANS}`;
      g.fillText(zh ? '霏微，按区' : 'GERIMIS,', FX + 40, FY + 250);
      if (!zh) g.fillText('BY DISTRICT', FX + 40, FY + 330);
      g.fillStyle = CYAN;
      g.font = `500 24px ${MONO}`;
      g.fillText(zh ? `${s.districts} 个区 · 档案 ${s.files} 份 · 1999` : `${s.districts} districts · ${s.files} files · 1999`, FX + 40, FY + FH - 70);
      g.fillStyle = AMBER;
      g.fillRect(FX + 40, FY + (zh ? 290 : 360), 120, 8);
    } else if (s.kind === 'district') {
      const d = DISTRICTS.find((x) => x.id === s.district);
      header(g, zh ? '区图' : 'DISTRICT MAP', `SLIDE ${no}`);
      island(g, FX + 300, FY + 120, 500, 300, s.district);
      g.fillStyle = WHITE;
      g.font = `800 ${zh ? 54 : 46}px ${SANS}`;
      g.fillText(d ? (zh ? d.zh : d.en.toUpperCase()) : zh ? '全岛' : 'ISLAND-WIDE', FX + 40, FY + 170);
      if (d) {
        g.font = `500 22px ${MONO}`;
        g.fillStyle = CYAN;
        g.fillText(zh ? d.en.toUpperCase() : d.zh, FX + 40, FY + 210);
      }
      g.fillStyle = AMBER;
      g.font = `600 22px ${MONO}`;
      g.fillText(zh ? `档案 ${s.files} 份` : `${s.files} file${s.files === 1 ? '' : 's'}`, FX + 40, FY + FH - 60);
    } else if (s.kind === 'cover') {
      const f = s.f;
      const dist = DISTRICTS.find((x) => x.id === f.district);
      header(g, `FILE ${f.file}`, `SLIDE ${no}`);
      g.fillStyle = WHITE;
      g.font = `700 112px ${COND}`;
      g.fillText(f.file, FX + 40, FY + 200);
      g.font = `700 ${zh ? 46 : 42}px ${SANS}`;
      const title = fit(g, T(f.title), FW - 80);
      g.fillText(title, FX + 40, FY + 280);
      if (f.subtitle) {
        g.font = `400 26px ${SANS}`;
        g.fillStyle = CYAN;
        g.fillText(fit(g, T(f.subtitle), FW - 80), FX + 40, FY + 322);
      }
      g.fillStyle = CYAN;
      g.font = `500 22px ${MONO}`;
      const where = [dist ? (zh ? dist.zh : dist.en) : T(f.place), f.date].filter(Boolean).join(' · ');
      g.fillText(fit(g, where, FW - 360), FX + 40, FY + FH - 56);
      // the stamp, in a box of its own colour
      const ink = INK[clearanceKey(f.stamp)];
      g.font = `700 22px ${COND}`;
      const sw = g.measureText(f.stamp).width + 30;
      const sx = FX + FW - 40 - sw, sy = FY + FH - 84;
      g.fillStyle = ink === INK.declass ? WHITE : ink;
      g.fillRect(sx, sy, sw, 40);
      g.fillStyle = ink === INK.declass ? DIAZO_DEEP : WHITE;
      g.fillText(f.stamp, sx + 15, sy + 28);
    } else {
      header(g, 'RECORDS OFFICE · DATA SECTION', `SLIDE ${no}`);
      g.fillStyle = WHITE;
      g.font = `800 64px ${SANS}`;
      g.textAlign = 'center';
      g.fillText(zh ? '本盘完' : 'END OF TRAY', SLIDE_PX / 2, SLIDE_PX / 2 + 10);
      g.font = `500 22px ${MONO}`;
      g.fillStyle = CYAN;
      g.fillText(zh ? '关机放凉以后再取托盘' : 'Let the lamp cool before you lift the tray', SLIDE_PX / 2, SLIDE_PX / 2 + 70);
      g.textAlign = 'left';
    }
    hair(g, n);
  }
  // the mount's window has softly rounded corners
  g.save();
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  g.roundRect(FX, FY, FW, FH, 14);
  g.fill();
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, SLIDE_PX, SLIDE_PX);
  g.restore();
  return c;
}
