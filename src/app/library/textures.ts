/**
 * Library textures: book cloth, spines, title pages, printed pages, archive
 * boxes and the brass bay plates. All drawn on canvas, nothing loaded.
 */
import * as THREE from 'three';
import type { LibBook } from '../../lib/library';
import { hash } from '../scene/textures';

type L = { en: string; zh: string };

const SANS = '"Archivo Variable", "Archivo", "N9 KuHei", "N9 DIN Bold", Arial, sans-serif';
const COND = '"Archivo Variable", "Archivo", "N9 DIN", "N9 KuHei", Arial, sans-serif';
const SERIF = '"Source Serif 4 Variable", "N9 HuoSong", Georgia, serif';
const MONO = '"IBM Plex Mono", "N9 HuoSong", ui-monospace, monospace';

let aniso = 4;
export const setLibAniso = (n: number) => (aniso = n);

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/** Woven book cloth: base colour, fine cross-hatch, rubbed edges. */
function cloth(g: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number, wear = 1) {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  g.save();
  g.globalAlpha = 0.06;
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 2) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#000';
    g.fillRect(x, 0, 1, h);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 10 * wear; i++) {
    const x = r() * w, y = r() * h, rad = 20 + r() * Math.max(w, h) * 0.3;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(255,255,255,${0.05 * wear})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  // rubbed corners and edges
  const e = g.createLinearGradient(0, 0, w, 0);
  e.addColorStop(0, 'rgba(0,0,0,.28)');
  e.addColorStop(0.12, 'rgba(0,0,0,0)');
  e.addColorStop(0.88, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = e;
  g.fillRect(0, 0, w, h);
  g.restore();
}

function paperFill(g: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  g.save();
  for (let i = 0; i < 12; i++) {
    const x = r() * w, y = r() * h, rad = 30 + r() * 160;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(120, 90, 40, .045)');
    grd.addColorStop(1, 'rgba(120, 90, 40, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  g.globalAlpha = 0.05;
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() > 0.5 ? '#fff' : '#6b5a3a';
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1);
  }
  g.restore();
}

const isZhText = (s: string) => /[　-鿿]/.test(s);

/** Fit a line of text to `max` pixels by shrinking the size. */
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, size: number, max: number) {
  let px = size;
  g.font = font(px);
  while (px > 8 && g.measureText(text).width > max) {
    px -= 1;
    g.font = font(px);
  }
  return px;
}

/**
 * Spine, drawn upright (top of the canvas = top of the book).
 * English titles run top to bottom, Chinese titles stack upright.
 */
export function spineTexture(b: LibBook, zh: boolean, wPx: number, hPx: number) {
  const [c, g] = canvas(wPx, hPx);
  const seed = hash(b.id);
  const title = zh ? b.spine.zh : b.spine.en;
  const sub = zh ? b.sub.zh : b.sub.en;
  const gilt = '#d8b86a';

  if (b.kind === 'binder') {
    // grey board binder, finger hole, paper window
    paperFill(g, wPx, hPx, b.color, seed);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(0, 0, wPx * 0.08, hPx);
    g.fillRect(wPx * 0.92, 0, wPx * 0.08, hPx);
    const hy = hPx * 0.8;
    g.fillStyle = '#26262a';
    g.beginPath();
    g.ellipse(wPx / 2, hy, wPx * 0.2, wPx * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#b9bcc0';
    g.lineWidth = wPx * 0.05;
    g.stroke();
    const wx = wPx * 0.16, wy = hPx * 0.08, ww = wPx * 0.68, wh = hPx * 0.6;
    g.fillStyle = '#ece6d6';
    g.fillRect(wx, wy, ww, wh);
    g.strokeStyle = '#6f7277';
    g.lineWidth = wPx * 0.04;
    g.strokeRect(wx, wy, ww, wh);
    g.save();
    g.translate(wx + ww / 2, wy + wh / 2);
    g.rotate(Math.PI / 2);
    g.fillStyle = '#1d1b17';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fit(g, title, (px) => `600 ${px}px ${COND}`, ww * 0.5, wh * 0.86);
    g.fillText(title, 0, -ww * 0.12);
    fit(g, b.mark, (px) => `500 ${px}px ${MONO}`, ww * 0.26, wh * 0.86);
    g.fillStyle = '#b8281d';
    g.fillText(b.mark, 0, ww * 0.24);
    g.restore();
    return tex(c);
  }

  cloth(g, wPx, hPx, b.color, seed, b.kind === 'ledger' ? 1.6 : 1);

  // raised bands near head and tail
  const band = (y: number) => {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(0, y + hPx * 0.006, wPx, hPx * 0.008);
    g.fillStyle = gilt;
    g.globalAlpha = 0.85;
    g.fillRect(0, y, wPx, hPx * 0.004);
    g.fillRect(0, y + hPx * 0.012, wPx, hPx * 0.004);
    g.globalAlpha = 1;
  };
  band(hPx * 0.05);
  band(hPx * 0.86);

  // title panel
  const py = hPx * 0.1, ph = hPx * 0.62;
  if (b.kind === 'news') {
    g.fillStyle = '#16171a';
    g.fillRect(wPx * 0.1, py, wPx * 0.8, ph);
  } else if (b.kind === 'ledger') {
    g.fillStyle = '#7d2219';
    g.fillRect(wPx * 0.1, py, wPx * 0.8, ph * 0.7);
    g.strokeStyle = gilt;
    g.lineWidth = Math.max(1, wPx * 0.02);
    g.strokeRect(wPx * 0.14, py + wPx * 0.04, wPx * 0.72, ph * 0.7 - wPx * 0.08);
  }
  const ink = b.kind === 'cloth' ? gilt : '#efe6cf';
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (zh && isZhText(title)) {
    // upright characters, one under the other
    const chars = [...title.replace(/\s+/g, '')];
    const room = (b.kind === 'ledger' ? ph * 0.7 : ph) * 0.9;
    const size = Math.min(wPx * 0.56, room / chars.length);
    g.font = `400 ${size}px ${SANS}`;
    const top = py + ((b.kind === 'ledger' ? ph * 0.7 : ph) - size * chars.length) / 2 + size / 2;
    chars.forEach((ch, i) => g.fillText(ch, wPx / 2, top + i * size));
  } else {
    g.save();
    g.translate(wPx / 2, py + (b.kind === 'ledger' ? ph * 0.35 : ph / 2));
    g.rotate(Math.PI / 2);
    fit(g, title, (px) => `700 ${px}px ${COND}`, wPx * 0.5, (b.kind === 'ledger' ? ph * 0.66 : ph) * 0.9);
    g.fillText(title, 0, 0);
    g.restore();
  }
  // sub line, horizontal, below the panel
  g.fillStyle = b.kind === 'cloth' ? gilt : '#e6dcc2';
  fit(g, sub, (px) => `500 ${px}px ${COND}`, wPx * 0.26, wPx * 0.86);
  g.fillText(sub, wPx / 2, hPx * 0.79);

  // shelf mark on a paper label at the tail
  const ly = hPx * 0.895, lh = hPx * 0.07;
  g.fillStyle = '#ece6d6';
  g.fillRect(wPx * 0.12, ly, wPx * 0.76, lh);
  g.fillStyle = '#1d1b17';
  const parts = b.mark.split('/');
  const lines = parts.length > 2 ? [parts.slice(0, -1).join('/'), parts[parts.length - 1]] : [b.mark];
  const ls = Math.min(lh / (lines.length + 0.6), wPx * 0.2);
  lines.forEach((l, i) => {
    fit(g, l, (px) => `600 ${px}px ${MONO}`, ls, wPx * 0.7);
    g.fillText(l, wPx / 2, ly + lh / 2 + (i - (lines.length - 1) / 2) * ls);
  });
  return tex(c);
}

/** Front board: plain cloth with a blind-stamped rule and a small title. */
export function coverTexture(b: LibBook, zh: boolean) {
  const W = 512, H = Math.round(512 * 1.42);
  const [c, g] = canvas(W, H);
  if (b.kind === 'binder') paperFill(g, W, H, b.color, hash(b.id) + 1);
  else cloth(g, W, H, b.color, hash(b.id) + 1, 0.6);
  const gilt = b.kind === 'binder' ? '#26262a' : '#d8b86a';
  g.strokeStyle = gilt;
  g.globalAlpha = 0.7;
  g.lineWidth = 3;
  g.strokeRect(34, 34, W - 68, H - 68);
  g.lineWidth = 1;
  g.strokeRect(44, 44, W - 88, H - 88);
  g.globalAlpha = 1;
  g.fillStyle = gilt;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const title = zh ? b.spine.zh : b.spine.en;
  fit(g, title, (px) => `700 ${px}px ${COND}`, 52, W - 140);
  g.fillText(title, W / 2, H * 0.36);
  fit(g, zh ? b.sub.zh : b.sub.en, (px) => `500 ${px}px ${COND}`, 26, W - 160);
  g.fillText(zh ? b.sub.zh : b.sub.en, W / 2, H * 0.36 + 56);
  g.font = `500 18px ${MONO}`;
  g.fillText('RECORDS OFFICE · GERIMIS', W / 2, H * 0.84);
  return tex(c);
}

/** A printed page: running head, the page heading, and set lines of type. */
export function pageTexture(b: LibBook, n: number, head: L | null, zh: boolean, side: 'l' | 'r', title = false) {
  const W = 512, H = Math.round(512 * 1.42);
  const [c, g] = canvas(W, H);
  paperFill(g, W, H, '#ece5d3', hash(b.id) + n * 7);
  // gutter shadow
  const gx = side === 'r' ? 0 : W;
  const gut = g.createLinearGradient(gx, 0, side === 'r' ? 60 : W - 60, 0);
  gut.addColorStop(0, 'rgba(60,45,20,.22)');
  gut.addColorStop(1, 'rgba(60,45,20,0)');
  g.fillStyle = gut;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d1b17';
  g.textBaseline = 'alphabetic';
  if (title) {
    // title page
    g.textAlign = 'center';
    g.font = `500 16px ${MONO}`;
    g.fillStyle = 'rgba(29,27,23,.6)';
    g.fillText(b.mark, W / 2, H * 0.18);
    g.fillStyle = '#1d1b17';
    const t = zh ? b.spine.zh : b.spine.en;
    fit(g, t, (px) => `700 ${px}px ${COND}`, 44, W - 120);
    g.fillText(t, W / 2, H * 0.4);
    fit(g, zh ? b.sub.zh : b.sub.en, (px) => `400 ${px}px ${SERIF}`, 24, W - 140);
    g.fillText(zh ? b.sub.zh : b.sub.en, W / 2, H * 0.4 + 44);
    g.fillStyle = '#b8281d';
    g.fillRect(W / 2 - 40, H * 0.5, 80, 3);
    g.fillStyle = 'rgba(29,27,23,.7)';
    g.font = `500 15px ${MONO}`;
    g.fillText(zh ? '记录署 · 霏微 · 1999' : 'RECORDS OFFICE · GERIMIS · 1999', W / 2, H * 0.86);
    return tex(c);
  }
  const m = 56;
  g.textAlign = side === 'r' ? 'right' : 'left';
  g.font = `500 13px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.55)';
  g.fillText(b.mark, side === 'r' ? W - m : m, 50);
  g.textAlign = 'left';
  g.fillStyle = '#1d1b17';
  let y = 104;
  if (head) {
    const t = zh ? head.zh : head.en;
    fit(g, t, (px) => `700 ${px}px ${COND}`, 26, W - m * 2);
    g.fillText(t, m, y);
    y += 22;
    g.fillStyle = '#b8281d';
    g.fillRect(m, y, 48, 2.5);
    g.fillStyle = '#1d1b17';
    y += 30;
  }
  // lines of type, as grey bars: we are looking at the page, not reading it
  const r = rng(hash(b.id) * 31 + n);
  g.fillStyle = 'rgba(29,27,23,.42)';
  while (y < H - 90) {
    if (r() < 0.12) {
      y += 16;
      continue;
    }
    const full = W - m * 2;
    const len = r() < 0.18 ? full * (0.3 + r() * 0.5) : full;
    let x = m;
    while (x < m + len - 10) {
      const wd = 10 + r() * 38;
      g.fillRect(x, y - 7, Math.min(wd, m + len - x), 6);
      x += wd + 6;
    }
    y += 17;
  }
  g.fillStyle = 'rgba(29,27,23,.6)';
  g.font = `500 14px ${MONO}`;
  g.textAlign = 'center';
  g.fillText(String(n + 1), W / 2, H - 46);
  return tex(c);
}

/** Endpaper: the inside of the front board, a small repeating check. */
export function endpaperTexture(b: LibBook) {
  const W = 256, H = Math.round(256 * 1.42);
  const [c, g] = canvas(W, H);
  paperFill(g, W, H, '#d9cfb6', hash(b.id) + 5);
  g.strokeStyle = shade(b.color, 1.1);
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  for (let i = -H; i < W + H; i += 9) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + H, H);
    g.stroke();
  }
  g.globalAlpha = 1;
  // library pocket
  g.fillStyle = '#efe7d2';
  g.fillRect(W * 0.3, H * 0.7, W * 0.4, H * 0.22);
  g.strokeStyle = 'rgba(29,27,23,.4)';
  g.strokeRect(W * 0.3, H * 0.7, W * 0.4, H * 0.22);
  g.fillStyle = 'rgba(29,27,23,.65)';
  g.font = `600 10px ${MONO}`;
  g.textAlign = 'center';
  g.fillText('DATE DUE', W / 2, H * 0.75);
  return tex(c);
}

/** Page edges seen from the side: fine horizontal lines. */
export function edgeTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#e3dac4';
  g.fillRect(0, 0, 64, 256);
  const r = rng(11);
  for (let y = 0; y < 256; y += 2) {
    g.fillStyle = `rgba(90,70,40,${0.05 + r() * 0.08})`;
    g.fillRect(0, y, 64, 1);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Brass card holder on the shelf edge, a typed card slid into it. */
export function plateTexture(code: string, title: string) {
  const [c, g] = canvas(1024, 160);
  const br = g.createLinearGradient(0, 0, 0, 160);
  br.addColorStop(0, '#d9b977');
  br.addColorStop(0.45, '#9c7a3e');
  br.addColorStop(1, '#6e5328');
  g.fillStyle = br;
  g.fillRect(0, 0, 1024, 160);
  // the card
  paperFill(g, 1024, 160, '#ece3cc', 31);
  g.fillStyle = br;
  g.fillRect(0, 0, 1024, 18);
  g.fillRect(0, 142, 1024, 18);
  g.fillRect(0, 0, 18, 160);
  g.fillRect(1006, 0, 18, 160);
  // screws
  for (const x of [9, 1015]) {
    g.fillStyle = '#5a4320';
    g.beginPath();
    g.arc(x, 80, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.textBaseline = 'middle';
  g.fillStyle = '#b8281d';
  g.font = `700 46px ${MONO}`;
  g.fillText(code, 48, 82);
  g.fillStyle = '#1d1b17';
  fit(g, title, (px) => `700 ${px}px ${COND}`, 60, 700);
  g.fillText(title, 280, 84);
  return tex(c);
}

/** The pale rectangle where a book used to stand and dust did not settle. */
export function dustTexture() {
  const [c, g] = canvas(64, 256);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(240,235,220,0)');
  grd.addColorStop(0.2, 'rgba(240,235,220,.5)');
  grd.addColorStop(0.8, 'rgba(240,235,220,.5)');
  grd.addColorStop(1, 'rgba(240,235,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 256);
  return tex(c);
}

/* ---------------- the reading room ---------------- */

/** Walnut: long grain, a few darker figure lines, waxed sheen left to the material. */
export function woodTexture(seed: number, base = '#4a2f1d', w = 512, h = 512, contrast = 1) {
  const [c, g] = canvas(w, h);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    const y = r() * h;
    g.strokeStyle = r() > 0.5 ? `rgba(20,10,4,${(0.08 + r() * 0.16) * contrast})` : `rgba(140,96,58,${(0.05 + r() * 0.08) * contrast})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    const amp = 2 + r() * 6, f = 0.004 + r() * 0.01, ph = r() * 6;
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * f + ph) * amp);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * The view through an arched window: drizzle sky over the slab blocks of
 * Gerimis. `night` lights a few of their windows.
 */
export function windowView(night: boolean, seed: number) {
  const W = 512, H = 768;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (night) {
    sky.addColorStop(0, '#0d1420');
    sky.addColorStop(1, '#1c2533');
  } else {
    sky.addColorStop(0, '#aeb3b5');
    sky.addColorStop(1, '#d4d6d2');
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  // two layers of blocks, the far one paler in the rain
  for (const layer of [0, 1]) {
    let x = -20 - r() * 40;
    while (x < W) {
      const bw = 70 + r() * 110, bh = (layer ? 260 : 360) + r() * 220;
      const top = H - bh - (layer ? 0 : 40);
      g.fillStyle = night ? (layer ? '#141a24' : '#1a2230') : layer ? '#8d9293' : '#a7abab';
      g.fillRect(x, top, bw, bh + 60);
      // windows
      for (let wy = top + 14; wy < H; wy += 16)
        for (let wx = x + 8; wx < x + bw - 8; wx += 12) {
          if (night) {
            if (r() < 0.07) {
              g.fillStyle = r() < 0.7 ? 'rgba(255,214,140,.85)' : 'rgba(190,220,255,.7)';
              g.fillRect(wx, wy, 6, 8);
            }
          } else if (r() < 0.5) {
            g.fillStyle = 'rgba(60,66,70,.25)';
            g.fillRect(wx, wy, 6, 8);
          }
        }
      x += bw + 6 + r() * 30;
    }
  }
  // mist
  const mist = g.createLinearGradient(0, H * 0.4, 0, H);
  mist.addColorStop(0, night ? 'rgba(28,37,51,0)' : 'rgba(212,214,210,0)');
  mist.addColorStop(1, night ? 'rgba(28,37,51,.55)' : 'rgba(212,214,210,.6)');
  g.fillStyle = mist;
  g.fillRect(0, 0, W, H);
  return tex(c);
}

/** Rain on the glass: drops and runs, tiled and scrolled down in the scene. */
export function rainTexture() {
  const [c, g] = canvas(256, 512);
  const r = rng(5);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256, y = r() * 512, l = 10 + r() * 60;
    const grd = g.createLinearGradient(x, y, x, y + l);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(1, `rgba(255,255,255,${0.25 + r() * 0.3})`);
    g.strokeStyle = grd;
    g.lineWidth = 0.8 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y + l);
    g.stroke();
  }
  for (let i = 0; i < 180; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.25})`;
    g.beginPath();
    g.arc(r() * 256, r() * 512, 0.6 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* ---------------- the cutaway model ---------------- */

/** Herringbone parquet, oiled oak. */
export function parquetTexture() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#6b4a2e';
  g.fillRect(0, 0, S, S);
  const r = rng(77);
  const L = 128, W = 32;
  for (let row = -2; row < S / W + 2; row++) {
    for (let col = -2; col < S / (W * 2) + 2; col++) {
      for (const flip of [0, 1]) {
        const x = col * W * 2 + flip * W, y = row * W * 2 + flip * W;
        g.save();
        g.translate(x, y);
        g.rotate(flip ? -Math.PI / 4 : Math.PI / 4);
        const k = 0.82 + r() * 0.3;
        g.fillStyle = `rgb(${Math.round(132 * k)} ${Math.round(92 * k)} ${Math.round(58 * k)})`;
        g.fillRect(0, 0, L, W);
        g.strokeStyle = 'rgba(40,24,12,.55)';
        g.lineWidth = 2;
        g.strokeRect(0, 0, L, W);
        g.globalAlpha = 0.18;
        for (let i = 0; i < 5; i++) {
          g.strokeStyle = r() > 0.5 ? '#2a180c' : '#c59a68';
          g.beginPath();
          const yy = 4 + r() * (W - 8);
          g.moveTo(2, yy);
          g.lineTo(L - 2, yy + (r() - 0.5) * 4);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.restore();
      }
    }
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Warm plaster with a little unevenness. */
export function plasterTexture(seed = 3) {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d6cbb6';
  g.fillRect(0, 0, 512, 512);
  const r = rng(seed);
  for (let i = 0; i < 40; i++) {
    const x = r() * 512, y = r() * 512, rad = 30 + r() * 140;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${r() > 0.5 ? '255,250,240' : '120,100,70'},.06)`);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Old cloth spine, white so instance colours tint it: two bands and a label. */
export function fillerSpineTexture() {
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 256);
  const r = rng(19);
  g.globalAlpha = 0.08;
  for (let y = 0; y < 256; y += 2) {
    g.fillStyle = r() > 0.5 ? '#000' : '#fff';
    g.fillRect(0, y, 64, 1);
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(0, 20, 64, 4);
  g.fillRect(0, 214, 64, 4);
  g.fillStyle = 'rgba(255,236,190,.55)';
  g.fillRect(0, 24, 64, 2);
  g.fillRect(0, 218, 64, 2);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(14, 60, 36, 46);
  const e = g.createLinearGradient(0, 0, 64, 0);
  e.addColorStop(0, 'rgba(0,0,0,.35)');
  e.addColorStop(0.2, 'rgba(0,0,0,0)');
  e.addColorStop(0.8, 'rgba(0,0,0,0)');
  e.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = e;
  g.fillRect(0, 0, 64, 256);
  return tex(c);
}

/** Front page of a month of the Daily, hung on its stick. */
export function newsFrontTexture(b: LibBook, zh: boolean) {
  const W = 512, H = Math.round(512 * 1.42);
  const [c, g] = canvas(W, H);
  paperFill(g, W, H, '#ddd6c2', hash(b.id) + 2);
  g.fillStyle = '#1d1b17';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  fit(g, zh ? '霏微日报' : 'THE GERIMIS DAILY', (px) => `800 ${px}px ${COND}`, 58, W - 70);
  g.fillText(zh ? '霏微日报' : 'THE GERIMIS DAILY', W / 2, 92);
  g.fillRect(34, 110, W - 68, 3);
  g.fillRect(34, 118, W - 68, 1);
  g.font = `500 17px ${MONO}`;
  g.fillText(zh ? b.spine.zh : b.spine.en, W / 2, 146);
  const r = rng(hash(b.id));
  // headline blocks, a photo, columns
  g.fillRect(34, 170, W - 68, 26);
  g.fillStyle = '#7a7466';
  g.fillRect(34, 214, (W - 68) * 0.55, 190);
  g.fillStyle = 'rgba(29,27,23,.45)';
  for (let col = 0; col < 3; col++) {
    const x0 = 34 + col * ((W - 68) / 3) + 4, w = (W - 68) / 3 - 14;
    for (let y = col === 0 ? 420 : 214 + (col === 1 ? 0 : 0); y < H - 50; y += 13) {
      if (col < 2 && y < 410 && col === 0) continue;
      if (col === 1 && y < 410) continue;
      g.fillRect(x0, y, w * (r() < 0.1 ? 0.5 : 1), 5);
    }
  }
  return tex(c);
}

/** A catalogue card: ruled, typed, a punched hole at the foot. */
export function catCardTexture(file: string, title: string, stamp: string) {
  const [c, g] = canvas(256, 160);
  paperFill(g, 256, 160, '#efe8d4', hash(file));
  g.strokeStyle = 'rgba(184,40,29,.5)';
  g.beginPath();
  g.moveTo(0, 34);
  g.lineTo(256, 34);
  g.stroke();
  g.strokeStyle = 'rgba(60,90,140,.25)';
  for (let y = 52; y < 150; y += 16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  g.fillStyle = '#1d1b17';
  g.font = `600 18px ${MONO}`;
  g.fillText(file, 12, 26);
  g.font = `500 15px ${MONO}`;
  g.fillText(title.slice(0, 26), 12, 66);
  g.fillStyle = 'rgba(184,40,29,.7)';
  g.font = `600 11px ${MONO}`;
  g.fillText(stamp, 12, 98);
  g.fillStyle = '#5a5242';
  g.beginPath();
  g.arc(128, 146, 6, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** Brass label holder on a catalogue drawer. */
export function drawerTagTexture(label: string, empty: boolean) {
  const [c, g] = canvas(256, 96);
  const br = g.createLinearGradient(0, 0, 0, 96);
  br.addColorStop(0, '#d9b977');
  br.addColorStop(1, '#7a5c2c');
  g.fillStyle = br;
  g.fillRect(0, 0, 256, 96);
  paperFill(g, 256, 96, empty ? '#e2dccb' : '#efe7d0', hash(label));
  g.fillStyle = br;
  g.fillRect(0, 0, 256, 12);
  g.fillRect(0, 84, 256, 12);
  g.fillRect(0, 0, 12, 96);
  g.fillRect(244, 0, 12, 96);
  g.fillStyle = empty ? 'rgba(29,27,23,.4)' : '#1d1b17';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fit(g, label, (px) => `600 ${px}px ${MONO}`, 26, 220);
  g.fillText(label, 128, 50);
  return tex(c);
}

/** The mark a date stamp leaves. */
export function stampMarkTexture(text: string) {
  const [c, g] = canvas(256, 96);
  g.strokeStyle = 'rgba(107,90,138,.85)';
  g.fillStyle = 'rgba(107,90,138,.85)';
  g.lineWidth = 5;
  g.strokeRect(8, 8, 240, 80);
  g.font = `700 34px ${MONO}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = tex(c);
  return t;
}
