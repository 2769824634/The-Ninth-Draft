/**
 * Procedural paper textures, drawn on canvas.
 * Everything here is generated in code: no image assets are required.
 */
import * as THREE from 'three';
import type { ArchiveRecord } from '../types';
import { INK as CLEARANCE_INK, clearanceKey } from '../clearance';

const inkOf = (stamp: string) => CLEARANCE_INK[clearanceKey(stamp)];

export const MANILA = '#cfbb8f';
export { inkOf };
export const MANILA_DARK = '#b9a374';
const INK = '#1d1b17';

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const SANS = '"Archivo Variable", "Archivo", Arial, sans-serif';
const SERIF = '"Source Serif 4 Variable", Georgia, serif';

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

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (g.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

const plain = (html: string) => html.replace(/<span class="redact"[^>]*><span>(.*?)<\/span><\/span>/g, (_, t) => '█'.repeat(Math.min(14, t.length))).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/* ======================================================================
   Folder cover (front face)
   ====================================================================== */
export function coverTexture(rec: ArchiveRecord | null, seed: number) {
  const W = 1024, H = 720;
  const [c, g] = canvas(W, H);
  paper(g, W, H, MANILA, seed, 1);

  // printed form: agency header and rule lines
  g.strokeStyle = 'rgba(40,30,15,.55)';
  g.fillStyle = 'rgba(40,30,15,.75)';
  g.lineWidth = 2;
  g.font = `600 22px ${SANS}`;
  g.fillText('THE NINTH DRAFT  ·  ARCHIVE OF RECORDS', 64, 78);
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
    g.font = `500 40px ${MONO}`;
    const t = rec.title.toUpperCase();
    typed(g, t.length > 34 ? t.slice(0, 33) + '…' : t, 70, 334, 38, s + 1);
    if (rec.date) typed(g, rec.date, 70, 444, 28, s + 2);
    if (rec.place) typed(g, rec.place, 546, 444, 28, s + 3);
    if (rec.subtitle) {
      const st = rec.subtitle.length > 52 ? rec.subtitle.slice(0, 51) + '…' : rec.subtitle;
      typed(g, st, 70, 554, 24, s + 4);
    }
    stamp(g, rec.stamp, W - 250, 210, 46, -0.12 - (s % 7) * 0.01, s);
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
export function pageTexture(rec: ArchiveRecord, photo: HTMLImageElement | null) {
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
  if (photo) {
    const ar = photo.naturalWidth / photo.naturalHeight;
    let sw = photo.naturalWidth, sh = photo.naturalHeight, sx = 0, sy = 0;
    if (ar > pw / ph) { sw = sh * (pw / ph); sx = (photo.naturalWidth - sw) / 2; }
    else { sh = sw / (pw / ph); sy = (photo.naturalHeight - sh) / 2; }
    g.filter = 'grayscale(1) contrast(1.12) sepia(.18)';
    g.drawImage(photo, sx, sy, sw, sh, px, py, pw, ph);
    g.filter = 'none';
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
  typed(g, rec.title.toUpperCase().slice(0, 30), tx, y, 26, s + 6);
  y += 44;
  g.font = `500 19px ${MONO}`;
  const lines = wrap(g, plain(rec.summary), W - tx - 70).slice(0, 9);
  for (const [i, l] of lines.entries()) {
    typed(g, l, tx, y + i * 31, 19, s + 20 + i);
  }
  y += lines.length * 31 + 30;
  for (const f of rec.fields.slice(0, 3)) {
    if (y > H - 80) break;
    typed(g, `${plain(f.label).toUpperCase()}: ${plain(f.value)}`.slice(0, 40), tx, y, 18, s + y);
    y += 30;
  }
  stamp(g, rec.stamp, W - 230, H - 86, 30, 0.08, s + 3);
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
  const names = ['A. HOLT', 'K. VANCE', 'M. ORLOV', 'J. PRYCE', 'E. NAGY', 'R. STRAND', 'L. QUINN'];
  const why = ['REVIEW', 'AUDIT', 'TRANSFER', 'CROSS-REF', 'DECLASS.', 'INQUIRY'];
  let year = 1958 + Math.floor(r() * 6);
  for (let i = 0; i < 11; i++) {
    const y = fy + 150 + i * 38;
    g.beginPath();
    g.moveTo(fx + 24, y + 10);
    g.lineTo(fx + fw - 24, y + 10);
    g.stroke();
    if (i < 4 + Math.floor(r() * 5)) {
      year += Math.floor(r() * 4);
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

export function loadPhoto(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
