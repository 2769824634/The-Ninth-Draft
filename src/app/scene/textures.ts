/**
 * Procedural paper textures, drawn on canvas.
 * Everything here is generated in code: no image assets are required.
 */
import * as THREE from 'three';
import type { ArchiveRecord } from '../types';
import { INK as CLEARANCE_INK, clearanceKey } from '../clearance';
import { halftone, hasPortrait } from './halftone';

const inkOf = (stamp: string) => CLEARANCE_INK[clearanceKey(stamp)];

export const MANILA = '#cfbb8f';
export { inkOf };
export const MANILA_DARK = '#b9a374';
const INK = '#1d1b17';

// Chinese text typed onto paper uses the letterpress Song; headings use KuHei
const MONO = '"IBM Plex Mono", "N9 HuoSong", ui-monospace, monospace';
const SANS = '"Archivo Variable", "Archivo", "N9 KuHei", "N9 DIN Bold", Arial, sans-serif';
const SERIF = '"Source Serif 4 Variable", "N9 HuoSong", Georgia, serif';

/** Families a canvas may need for Chinese; see `canvasFontsReady`. */
export const CJK_CANVAS_FONTS = ['N9 HuoSong', 'N9 KuHei', 'N9 DIN', 'N9 DIN Bold'];

/**
 * Canvas text does not trigger web font loading, and the Chinese faces only
 * load on demand, slice by slice (unicode-range). Load the glyphs for `text`
 * before drawing.
 */
export async function canvasFontsReady(text: string) {
  if (!document.fonts || !/[\u3000-\u9fff\uff00-\uffef]/.test(text)) return;
  try {
    await Promise.all(CJK_CANVAS_FONTS.map((f) => document.fonts.load(`20px "${f}"`, text)));
  } catch {
    /* draw with whatever is there */
  }
}

let maxAniso = 4;
export const setMaxAnisotropy = (n: number) => (maxAniso = n);

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  return t;
}

/* ---------- deterministic randomness so every folder looks the same on reload ---------- */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
export const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

/* ---------- shared fibre overlay ---------- */
let fibre: HTMLCanvasElement | null = null;
function fibreLayer() {
  if (fibre) return fibre;
  const [c, g] = canvas(512, 512);
  const r = rng(7);
  const img = g.createImageData(512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 34;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.08;
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = r() > 0.5 ? '#fff' : '#000';
    g.lineWidth = 0.6;
    g.beginPath();
    const x = r() * 512, y = r() * 512, a = r() * Math.PI, l = 4 + r() * 18;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  fibre = c;
  return c;
}

function paper(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number, wear = 1) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  // fibre grain
  g.save();
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  const pat = g.createPattern(fibreLayer(), 'repeat')!;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
  // soft mottling + aged edges
  const r = rng(seed);
  g.save();
  for (let i = 0; i < 14 * wear; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * 200;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(120, 90, 40, ${0.035 * wear})`);
    grd.addColorStop(1, 'rgba(120, 90, 40, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  const edge = g.createLinearGradient(0, 0, 0, h);
  edge.addColorStop(0, `rgba(90, 64, 24, ${0.12 * wear})`);
  edge.addColorStop(0.06, 'rgba(90, 64, 24, 0)');
  edge.addColorStop(0.94, 'rgba(90, 64, 24, 0)');
  edge.addColorStop(1, `rgba(90, 64, 24, ${0.16 * wear})`);
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  g.restore();
}

function stamp(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, angle: number, seed: number, color = inkOf(text)) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.font = `700 ${size}px ${MONO}`;
  const tw = g.measureText(text).width;
  const pad = size * 0.45;
  g.strokeStyle = color;
  g.fillStyle = color;
  g.globalAlpha = 0.82;
  g.lineWidth = size * 0.11;
  g.strokeRect(-tw / 2 - pad, -size * 0.85, tw + pad * 2, size * 1.55);
  g.lineWidth = size * 0.04;
  g.strokeRect(-tw / 2 - pad * 0.7, -size * 0.7, tw + pad * 1.4, size * 1.25);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  // ink loss: punch random specks out of the stamp
  g.globalCompositeOperation = 'destination-out';
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.3 + r() * 0.7;
    g.fillRect((r() - 0.5) * (tw + pad * 2.4), (r() - 0.5) * size * 1.7, 1 + r() * 3, 1 + r() * 2);
  }
  g.restore();
}

function typed(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, seed: number, color = INK) {
  // Typewriter: per-character jitter in baseline and ink density
  const r = rng(seed);
  g.save();
  g.font = `500 ${size}px ${MONO}`;
  g.fillStyle = color;
  g.textBaseline = 'alphabetic';
  let cx = x;
  for (const ch of text) {
    g.globalAlpha = 0.72 + r() * 0.28;
    g.fillText(ch, cx, y + (r() - 0.5) * size * 0.06);
    cx += g.measureText(ch).width;
  }
  g.restore();
  return cx;
}

/** CJK characters break anywhere; Latin words break at spaces. */
const CJK_CHAR = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;
// Never start a line with these
const NO_START = /^[，。、；：？！）》」』】,.;:?!)]/;

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const tokens = text.match(/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]|[^\s\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]+|\s+/g) ?? [];
  const lines: string[] = [];
  let line = '';
  for (const tok of tokens) {
    if (/^\s+$/.test(tok)) {
      if (line) line += ' ';
      continue;
    }
    const t = line + tok;
    if (g.measureText(t.trimEnd()).width > maxW && line.trim() && !NO_START.test(tok)) {
      lines.push(line.trimEnd());
      line = tok;
    } else line = t;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** Trim `text` with an ellipsis so it fits `maxW` in `font`. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, font: string) {
  g.save();
  g.font = font;
  let out = text;
  if (g.measureText(out).width > maxW) {
    while (out.length > 1 && g.measureText(out + '…').width > maxW) out = out.slice(0, -1);
    out = out.trimEnd() + '…';
  }
  g.restore();
  return out;
}
const isCjk = (s: string) => CJK_CHAR.test(s);

const plain = (html: string) => html.replace(/<span class="redact"[^>]*><span>(.*?)<\/span><\/span>/g, (_, t) => '█'.repeat(Math.min(14, t.length))).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* ======================================================================
   Folder cover (front face)
   ====================================================================== */
export function coverTexture(rec: ArchiveRecord | null, seed: number, stampText = rec?.stamp) {
  const W = 1024, H = 720;
  const [c, g] = canvas(W, H);
  paper(g, W, H, MANILA, seed, 1);

  // printed form: agency header and rule lines
  g.strokeStyle = 'rgba(40,30,15,.55)';
  g.fillStyle = 'rgba(40,30,15,.75)';
  g.lineWidth = 2;
  g.font = `600 22px ${SANS}`;
  g.fillText('RECORDS OFFICE  ·  PUBLIC ARCHIVE', 64, 78);
  g.font = `400 16px ${MONO}`;
  g.fillText('FORM 9-A / RECORD FOLDER', 64, 106);
  g.beginPath();
  g.moveTo(64, 126);
  g.lineTo(W - 64, 126);
  g.stroke();

  const field = (label: string, x: number, y: number, w: number) => {
    g.font = `400 14px ${MONO}`;
    g.fillStyle = 'rgba(40,30,15,.6)';
    g.fillText(label, x, y - 40);
    g.beginPath();
    g.lineWidth = 1.4;
    g.moveTo(x, y + 10);
    g.lineTo(x + w, y + 10);
    g.stroke();
  };
  field('FILE NO.', 64, 230, 300);
  field('SUBJECT', 64, 340, W - 128);
  field('DATE / PERIOD', 64, 450, 420);
  field('LOCATION', 540, 450, 420);
  field('REMARKS', 64, 560, W - 128);

  // punch holes
  g.fillStyle = 'rgba(0,0,0,.28)';
  for (const x of [W / 2 - 140, W / 2 + 140]) {
    g.beginPath();
    g.arc(x, 28, 9, 0, Math.PI * 2);
    g.fill();
  }

  if (rec) {
    const s = hash(rec.file);
    typed(g, rec.file, 70, 226, 44, s);
    typed(g, fit(g, rec.title.toUpperCase(), W - 150, `500 38px ${MONO}`), 70, 334, 38, s + 1);
    if (rec.date) typed(g, fit(g, rec.date, 420, `500 28px ${MONO}`), 70, 444, 28, s + 2);
    if (rec.place) typed(g, fit(g, rec.place, 410, `500 28px ${MONO}`), 546, 444, 28, s + 3);
    if (rec.subtitle) typed(g, fit(g, rec.subtitle, W - 150, `500 24px ${MONO}`), 70, 554, 24, s + 4);
    stamp(g, stampText ?? rec.stamp, W - 250, 210, 46, -0.12 - (s % 7) * 0.01, s);
    // handwritten-ish archive mark
    g.save();
    g.strokeStyle = 'rgba(30, 40, 90, .55)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(W - 140, H - 90, 54, 30, -0.2, 0, Math.PI * 2);
    g.stroke();
    g.font = `italic 600 30px ${SERIF}`;
    g.fillStyle = 'rgba(30, 40, 90, .7)';
    g.textAlign = 'center';
    g.fillText(rec.category.slice(0, 3).toUpperCase(), W - 140, H - 80);
    g.restore();
  } else {
    // Filler: faded number only
    const r = rng(seed);
    typed(g, `${'PER'[Math.floor(r() * 3)]}-${String(Math.floor(r() * 9000) + 1000)}`, 70, 226, 44, seed, 'rgba(29,27,23,.55)');
  }
  return toTexture(c);
}

/* ======================================================================
   Tab label
   ====================================================================== */
export function tabTexture(text: string, seed: number, accent: string | null = null) {
  const W = 512, H = 128;
  const [c, g] = canvas(W, H);
  paper(g, W, H, MANILA, seed, 0.6);
  // pasted label strip
  g.fillStyle = '#efeadc';
  g.fillRect(28, 26, W - 56, H - 46);
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.strokeRect(28, 26, W - 56, H - 46);
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(28, 26, 14, H - 46);
  }
  g.font = `600 54px ${MONO}`;
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2 + (accent ? 6 : 0), H / 2 + 6);
  return toTexture(c);
}

/* ======================================================================
   Inside page: dossier sheet with photograph
   ====================================================================== */
export function pageTexture(rec: ArchiveRecord, photo: HTMLImageElement | null, stampText = rec.stamp) {
  const W = 1024, H = 720;
  const [c, g] = canvas(W, H);
  paper(g, W, H, '#ece6d8', hash(rec.file) + 11, 0.7);
  const s = hash(rec.file);

  // photograph
  const px = 64, py = 70, pw = 300, ph = 380;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.25)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 4;
  g.fillStyle = '#f6f3ea';
  g.fillRect(px - 14, py - 14, pw + 28, ph + 56);
  g.restore();
  if (photo || hasPortrait(rec)) {
    g.drawImage(halftone(photo, rec.file, pw, ph), px, py, pw, ph);
  } else {
    g.fillStyle = '#d9d3c4';
    g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 1;
    for (let i = -ph; i < pw; i += 14) {
      g.beginPath();
      g.moveTo(px + i, py + ph);
      g.lineTo(px + i + ph, py);
      g.stroke();
    }
    g.fillStyle = '#d9d3c4';
    g.fillRect(px + 40, py + ph / 2 - 26, pw - 80, 52);
    g.font = `500 17px ${MONO}`;
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.textAlign = 'center';
    g.fillText('NO PHOTOGRAPH', px + pw / 2, py + ph / 2 - 3);
    g.fillText('ON FILE', px + pw / 2, py + ph / 2 + 19);
    g.textAlign = 'left';
  }
  typed(g, `${rec.file} / ${rec.category.toUpperCase()}`, px, py + ph + 32, 16, s + 5);

  // typed sheet
  const tx = 430;
  g.font = `700 20px ${SANS}`;
  g.fillStyle = 'rgba(29,27,23,.8)';
  g.fillText('SUMMARY OF RECORD', tx, 92);
  g.fillRect(tx, 104, W - tx - 64, 2);
  let y = 152;
  typed(g, fit(g, rec.title.toUpperCase(), W - tx - 70, `500 26px ${MONO}`), tx, y, 26, s + 6);
  y += 44;
  g.font = `500 19px ${MONO}`;
  // Chinese runs denser: one more line, a touch more leading
  const lh = isCjk(rec.summary) ? 33 : 31;
  const lines = wrap(g, plain(rec.summary), W - tx - 70).slice(0, isCjk(rec.summary) ? 8 : 9);
  for (const [i, l] of lines.entries()) {
    typed(g, l, tx, y + i * lh, 19, s + 20 + i);
  }
  y += lines.length * lh + 30;
  for (const f of rec.fields.slice(0, 3)) {
    if (y > H - 80) break;
    typed(g, fit(g, `${plain(f.label).toUpperCase()}: ${plain(f.value)}`, W - tx - 70, `500 18px ${MONO}`), tx, y, 18, s + y);
    y += 30;
  }
  stamp(g, stampText, W - 230, H - 86, 30, 0.08, s + 3);
  return toTexture(c);
}

/* ======================================================================
   Inside of the cover: access log (who opened this file, when)
   ====================================================================== */
export function accessLogTexture(rec: ArchiveRecord) {
  const W = 1024, H = 720;
  const [c, g] = canvas(W, H);
  const s = hash(rec.file);
  paper(g, W, H, MANILA, s + 21, 1);
  // pasted form
  const fx = 90, fy = 70, fw = W - 180, fh = H - 150;
  g.save();
  g.shadowColor = 'rgba(0,0,0,.18)';
  g.shadowBlur = 10;
  g.fillStyle = '#ece5d3';
  g.fillRect(fx, fy, fw, fh);
  g.restore();
  g.fillStyle = INK;
  g.font = `700 22px ${SANS}`;
  g.fillText('RECORD OF ACCESS', fx + 30, fy + 48);
  g.font = `400 14px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.65)';
  g.fillText(`FILE ${rec.file}  ·  THIS FOLDER MUST NOT LEAVE THE READING ROOM`, fx + 30, fy + 74);
  const cols = [fx + 30, fx + 210, fx + 430, fx + 640];
  const heads = ['DATE', 'NAME', 'PURPOSE', 'INITIALS'];
  g.font = `500 13px ${MONO}`;
  heads.forEach((h, i) => g.fillText(h, cols[i], fy + 118));
  g.strokeStyle = 'rgba(29,27,23,.35)';
  g.lineWidth = 1;
  const r = rng(s);
  const names = ['HEUSS', 'L. TAN', 'S. RAHIM', 'K. NAIR', 'HEUSS', 'J. PEREIRA', 'M. LIM'];
  const why = ['REVIEW', 'AUDIT', 'TRANSFER', 'CROSS-REF', 'DECLASS.', 'INQUIRY'];
  let year = 1991 + Math.floor(r() * 3);
  for (let i = 0; i < 11; i++) {
    const y = fy + 150 + i * 38;
    g.beginPath();
    g.moveTo(fx + 24, y + 10);
    g.lineTo(fx + fw - 24, y + 10);
    g.stroke();
    if (i < 4 + Math.floor(r() * 5)) {
      year = Math.min(1999, year + Math.floor(r() * 3));
      const d = `${String(1 + Math.floor(r() * 28)).padStart(2, '0')}.${String(1 + Math.floor(r() * 12)).padStart(2, '0')}.${year}`;
      typed(g, d, cols[0], y, 17, s + i * 3);
      typed(g, names[Math.floor(r() * names.length)], cols[1], y, 17, s + i * 3 + 1);
      typed(g, why[Math.floor(r() * why.length)], cols[2], y, 17, s + i * 3 + 2);
      g.save();
      g.font = `italic 600 24px ${SERIF}`;
      g.fillStyle = 'rgba(30, 40, 90, .75)';
      g.fillText(names[Math.floor(r() * names.length)].replace(/[^A-Z]/g, '').slice(0, 2), cols[3] + 10, y + 2);
      g.restore();
    }
  }
  return toTexture(c);
}

/* ======================================================================
   Plain manila (inside of covers, backs, fillers)
   ====================================================================== */
const plainCache = new Map<string, THREE.Texture>();
export function plainTexture(color = MANILA, seed = 3) {
  const key = color + seed;
  if (plainCache.has(key)) return plainCache.get(key)!;
  const [c, g] = canvas(512, 384);
  paper(g, 512, 384, color, seed, 0.8);
  const t = toTexture(c);
  plainCache.set(key, t);
  return t;
}

/* ======================================================================
   Drawer card holder label
   ====================================================================== */
export function drawerLabel(no: string, name: string, range: string) {
  const W = 512, H = 200;
  const [c, g] = canvas(W, H);
  paper(g, W, H, '#ede7d6', hash(name), 0.4);
  g.fillStyle = INK;
  g.font = `400 26px ${MONO}`;
  g.fillText(no, 30, 52);
  g.font = `800 64px ${SANS}`;
  g.fillText(name.toUpperCase(), 30, 128);
  g.font = `400 24px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.65)';
  g.fillText(range, 30, 172);
  return toTexture(c);
}

/* ======================================================================
   Clue wall: index card pinned to the board
   ====================================================================== */
export const CARD = { w: 2.05, h: 1.36 };

/** Threat pips per classification, for the tactical marker on wall cards. */
const THREAT: Record<string, number> = { 'TOP SECRET': 4, SECRET: 3, CONFIDENTIAL: 2, RESTRICTED: 1, DECLASSIFIED: 0 };

export function cardTexture(rec: ArchiveRecord, categoryLabel: string, photo: HTMLImageElement | null = null, links = 0) {
  const W = 768, H = Math.round((768 * CARD.h) / CARD.w);
  const [c, g] = canvas(W, H);
  const s = hash(rec.file);
  paper(g, W, H, '#ece6d6', s + 31, 0.6);
  const ink = inkOf(rec.stamp);

  // clearance strip down the left edge
  g.fillStyle = ink;
  g.globalAlpha = 0.9;
  g.fillRect(0, 0, 18, H);
  g.globalAlpha = 1;

  // ruled index-card lines
  g.strokeStyle = 'rgba(31, 79, 163, .16)';
  g.lineWidth = 1.5;
  for (let y = 196; y < H - 20; y += 44) {
    g.beginPath();
    g.moveTo(40, y);
    g.lineTo(W - 28, y);
    g.stroke();
  }
  g.strokeStyle = 'rgba(184, 40, 29, .35)';
  g.beginPath();
  g.moveTo(40, 132);
  g.lineTo(W - 28, 132);
  g.stroke();

  g.font = `500 26px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.62)';
  g.fillText(`${categoryLabel.toUpperCase()} / ${rec.date ?? ''}`.slice(0, 40), 48, 58);
  typed(g, rec.file, 48, 112, 48, s);

  // clipped-on portrait, top right
  const portrait = hasPortrait(rec);
  if (portrait) {
    const pw = 150, ph = 186, px = W - pw - 44, py = 30;
    g.save();
    g.translate(px + pw / 2, py + ph / 2);
    g.rotate(0.035 - (s % 7) * 0.01);
    g.shadowColor = 'rgba(0,0,0,.25)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 3;
    g.fillStyle = '#f4f0e6';
    g.fillRect(-pw / 2 - 8, -ph / 2 - 8, pw + 16, ph + 16);
    g.shadowColor = 'transparent';
    g.drawImage(halftone(photo, rec.file, pw, ph), -pw / 2, -ph / 2, pw, ph);
    g.restore();
  }
  const textW = W - 100 - (portrait ? 190 : 0);

  g.font = `800 48px ${SANS}`;
  g.fillStyle = INK;
  const lines = wrap(g, rec.title.toUpperCase(), textW).slice(0, 2);
  lines.forEach((l, i) => g.fillText(l, 48, 186 + i * 52));
  if (rec.subtitle) {
    g.font = `italic 400 30px ${SERIF}`;
    g.fillStyle = 'rgba(29,27,23,.72)';
    const sub = wrap(g, rec.subtitle, textW)[0] ?? '';
    g.fillText(sub, 48, 186 + lines.length * 52 + 18);
  }
  // tactical marker, bottom left: target brackets, threat pips, link count
  {
    const x = 48, y = H - 70, bw = 236, bh = 40, k = 10;
    g.strokeStyle = 'rgba(29,27,23,.7)';
    g.lineWidth = 2;
    g.beginPath();
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + bw, y, -1, 1], [x, y + bh, 1, -1], [x + bw, y + bh, -1, -1]]) {
      g.moveTo(cx + dx * k, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + dy * k);
    }
    g.stroke();
    const tl = THREAT[rec.stamp] ?? 0;
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(x + 22 + i * 18, y + bh / 2);
      g.rotate(Math.PI / 4);
      g.fillStyle = i < tl ? ink : 'transparent';
      g.strokeStyle = i < tl ? ink : 'rgba(29,27,23,.45)';
      g.lineWidth = 1.5;
      g.fillRect(-5, -5, 10, 10);
      g.strokeRect(-5, -5, 10, 10);
      g.restore();
    }
    g.font = `500 21px ${MONO}`;
    g.fillStyle = 'rgba(29,27,23,.78)';
    g.fillText(`TL${tl} · LNK ${String(links).padStart(2, '0')}`, x + 98, y + bh / 2 + 7);
  }
  stamp(g, rec.stamp, W - 170, H - 62, 24, -0.08 - (s % 5) * 0.012, s);
  return toTexture(c);
}

/** Map grid stencilled over the board: faint lines, crosses at every node, edge labels. */
export function gridTexture(w: number, h: number, cell: number) {
  const W = 2048, H = Math.max(256, Math.round((2048 * h) / w));
  const [c, g] = canvas(W, H);
  const px = W / w;
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  g.strokeStyle = 'rgba(240, 228, 196, .07)';
  g.lineWidth = 1.5;
  for (let i = 1; i < cols; i++) {
    g.beginPath();
    g.moveTo(i * cell * px, 0);
    g.lineTo(i * cell * px, H);
    g.stroke();
  }
  for (let j = 1; j < rows; j++) {
    g.beginPath();
    g.moveTo(0, j * cell * px);
    g.lineTo(W, j * cell * px);
    g.stroke();
  }
  g.strokeStyle = 'rgba(240, 228, 196, .32)';
  g.lineWidth = 2;
  const k = 0.09 * px;
  for (let i = 1; i < cols; i++) {
    for (let j = 1; j < rows; j++) {
      const x = i * cell * px, y = j * cell * px;
      g.beginPath();
      g.moveTo(x - k, y);
      g.lineTo(x + k, y);
      g.moveTo(x, y - k);
      g.lineTo(x, y + k);
      g.stroke();
    }
  }
  g.font = `500 ${Math.round(0.16 * px)}px ${MONO}`;
  g.fillStyle = 'rgba(240, 228, 196, .4)';
  for (let i = 0; i < cols; i++) g.fillText(String.fromCharCode(65 + (i % 26)), (i + 0.5) * cell * px - 0.05 * px, 0.28 * px);
  for (let j = 0; j < rows; j++) g.fillText(String(j + 1).padStart(2, '0'), 0.12 * px, (j + 0.5) * cell * px + 0.06 * px);
  const t = toTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Radar sweep band: transparent, brightening to a hard leading edge on the right. */
export function sweepTexture() {
  const [c, g] = canvas(512, 4);
  // the last texels stay clear: the band is clamped, so its edge pixel paints the whole board ahead
  const grd = g.createLinearGradient(0, 0, 500, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.85, 'rgba(255,255,255,.28)');
  grd.addColorStop(0.96, 'rgba(255,255,255,.75)');
  grd.addColorStop(0.98, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 500, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Dark cork board with a painted steel frame lip. */
export function boardTexture(w: number, h: number) {
  const W = 2048, H = Math.max(256, Math.round((2048 * h) / w));
  const [c, g] = canvas(W, H);
  g.fillStyle = '#2b2620';
  g.fillRect(0, 0, W, H);
  const r = rng(91);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n * 0.9;
    img.data[i + 2] += n * 0.75;
  }
  g.putImageData(img, 0, 0);
  // cork granules
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(120, 92, 60, .22)' : 'rgba(10, 8, 6, .28)';
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 1 + r() * 3);
  }
  // old pin holes and tape ghosts
  for (let i = 0; i < 160; i++) {
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath();
    g.arc(r() * W, r() * H, 1.4 + r() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 14; i++) {
    g.save();
    g.translate(r() * W, r() * H);
    g.rotate((r() - 0.5) * 0.8);
    g.fillStyle = 'rgba(210, 196, 160, .05)';
    g.fillRect(-60, -16, 120, 32);
    g.restore();
  }
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return toTexture(c);
}

export function loadPhoto(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ======================================================================
   String-and-button envelope (TOP SECRET records)
   ====================================================================== */
export const KRAFT = '#b48a58';

/** Front of the envelope, under the flap: printed routing form, typed file, stamp. */
export function envelopeTexture(rec: ArchiveRecord, seed: number, stampText = rec.stamp) {
  const W = 1024, H = 724;
  const [c, g] = canvas(W, H);
  paper(g, W, H, KRAFT, seed, 1.4);
  const ink = 'rgba(38,26,12,.78)';
  g.fillStyle = ink;
  g.strokeStyle = ink;
  // the flap covers the top third; the print starts below it
  const top = 300;
  g.font = `600 22px ${SANS}`;
  g.fillText('RECORDS OFFICE  ·  GERIMIS', 64, top);
  g.font = `400 15px ${MONO}`;
  g.fillText('FORM 9-E / SECURE ENVELOPE  ·  BY HAND ONLY  ·  DO NOT BEND', 64, top + 26);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, top + 42);
  g.lineTo(W - 64, top + 42);
  g.stroke();
  // routing grid: passed to / date / initials
  const gx = 64, gy = top + 70, rows = 5, rh = 52;
  const cols = [0, 300, 470, 600];
  g.lineWidth = 1.3;
  g.font = `400 13px ${MONO}`;
  g.fillText('PASSED TO', gx + 8, gy - 8);
  g.fillText('DATE', gx + cols[1] + 8, gy - 8);
  g.fillText('INIT.', gx + cols[2] + 8, gy - 8);
  for (let r = 0; r <= rows; r++) {
    g.beginPath();
    g.moveTo(gx, gy + r * rh);
    g.lineTo(gx + cols[3], gy + r * rh);
    g.stroke();
  }
  for (const x of cols) {
    g.beginPath();
    g.moveTo(gx + x, gy);
    g.lineTo(gx + x, gy + rows * rh);
    g.stroke();
  }
  // two hands have signed for it already
  const s = hash(rec.file);
  typed(g, 'DATA SECTION', gx + 10, gy + 36, 22, s + 5, 'rgba(25,30,70,.75)');
  typed(g, '09.11.99', gx + cols[1] + 10, gy + 36, 22, s + 6, 'rgba(25,30,70,.75)');
  typed(g, 'H.', gx + cols[2] + 20, gy + 36, 24, s + 7, 'rgba(25,30,70,.75)');
  typed(g, 'REGISTRY', gx + 10, gy + 36 + rh, 22, s + 8, 'rgba(25,30,70,.75)');
  // file number and title, typed on a pasted label
  g.fillStyle = '#ece4cf';
  g.fillRect(690, top + 66, 270, 120);
  g.strokeStyle = 'rgba(0,0,0,.2)';
  g.strokeRect(690, top + 66, 270, 120);
  typed(g, rec.file, 706, top + 112, 36, s);
  typed(g, fit(g, rec.title.toUpperCase(), 236, `500 16px ${MONO}`), 706, top + 150, 16, s + 1);
  stamp(g, stampText, 740, top + 290, 40, -0.08 - (s % 5) * 0.012, s);
  return toTexture(c);
}

/** The flap: kraft, a gummed edge, the seal initialled across. */
export function flapTexture(seed: number) {
  const W = 1024, H = 280;
  const [c, g] = canvas(W, H);
  paper(g, W, H, KRAFT, seed + 9, 1.6);
  const grd = g.createLinearGradient(0, H - 46, 0, H);
  grd.addColorStop(0, 'rgba(70,45,15,0)');
  grd.addColorStop(1, 'rgba(70,45,15,.28)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(38,26,12,.7)';
  g.font = `600 15px ${MONO}`;
  g.fillText('SEAL', 120, H - 70);
  g.save();
  g.strokeStyle = 'rgba(25,30,70,.6)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(180, H - 60);
  g.bezierCurveTo(230, H - 120, 260, H - 20, 320, H - 80);
  g.bezierCurveTo(350, H - 110, 380, H - 40, 410, H - 70);
  g.stroke();
  g.restore();
  return toTexture(c);
}
