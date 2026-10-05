/**
 * Two-colour halftone: a black plate screened at 45° and a red plate at 15°,
 * printed slightly out of register, like a cheap period press photo.
 * Works from a real photograph, or from a procedural head-and-shoulders
 * silhouette when a personnel file has none.
 */
import { hash } from '../visitor/store';

const PAPER = '#e6dfcd';
const BLACK = '#1d1b17';
const RED = 'rgba(184, 40, 29, .82)';

type Lum = (x: number, y: number) => number;

/** Luminance sampler (0 = black, 1 = white) from an image, cover-fitted. */
function fromImage(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }, w: number, h: number): Lum {
  const sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  const cw = Math.max(8, Math.round(w / 2)), ch = Math.max(8, Math.round(h / 2));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const ar = sw / sh;
  let sx = 0, sy = 0, cwid = sw, chei = sh;
  if (ar > cw / ch) { cwid = sh * (cw / ch); sx = (sw - cwid) / 2; }
  else { chei = sw / (cw / ch); sy = (sh - chei) * 0.3; }
  g.filter = 'grayscale(1) contrast(1.25)';
  g.drawImage(img, sx, sy, cwid, chei, 0, 0, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data;
  return (x, y) => {
    const px = Math.min(cw - 1, Math.max(0, Math.floor((x / w) * cw)));
    const py = Math.min(ch - 1, Math.max(0, Math.floor((y / h) * ch)));
    return d[(py * cw + px) * 4] / 255;
  };
}

/** A different anonymous sitter for every file number. */
function silhouette(seed: number, w: number, h: number): Lum {
  const r = (k: number) => ((Math.imul(seed ^ (k * 2654435761), 1597334677) >>> 0) % 1000) / 1000;
  const headX = 0.5 + (r(1) - 0.5) * 0.08;
  const headY = 0.38 + (r(2) - 0.5) * 0.05;
  const headRx = 0.16 + r(3) * 0.03, headRy = 0.2 + r(4) * 0.03;
  const shoulder = 0.4 + r(5) * 0.08;
  const hair = r(6); // 0 bald .. 1 heavy
  const light = r(7) > 0.5 ? 1 : -1; // key light from left or right
  const collar = r(8) > 0.4;
  return (x, y) => {
    const nx = x / w, ny = y / h;
    const hx = (nx - headX) / headRx, hy = (ny - headY) / headRy;
    const head = hx * hx + hy * hy;
    const sx = (nx - 0.5) / shoulder, sy = (ny - 1.05) / 0.4;
    const body = sx * sx + sy * sy;
    const neck = Math.abs(nx - headX) < 0.065 && ny > headY + 0.12 && ny < 0.78;
    // studio backdrop: lighter toward the lit side, darker at the bottom
    let v = 0.86 + light * (0.5 - nx) * 0.12 - ny * 0.1;
    if (head < 1 || body < 1 || neck) {
      const side = (headX - nx) * light;
      v = 0.3 + Math.max(0, side) * 1.6 + (head < 1 ? (1 - head) * 0.16 : 0);
      if (head < 1 && hy < -0.35 + (1 - hair) * 0.5 && head > 0.15) v *= 0.45; // hair
      if (collar && body < 1 && Math.abs(nx - 0.5) < 0.05 && ny < 0.86) v = 0.82; // shirt collar
    }
    return Math.max(0, Math.min(1, v));
  };
}

function plate(g: CanvasRenderingContext2D, lum: Lum, w: number, h: number, step: number, angle: number, color: string, gain: number, ox = 0, oy = 0) {
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = color;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const R = Math.hypot(w, h) / 2 + step;
  for (let v = -R; v < R; v += step) {
    for (let u = -R; u < R; u += step) {
      // screen cell centre, rotated into the page
      const px = u * ca - v * sa + w / 2, py = u * sa + v * ca + h / 2;
      if (px < -step || py < -step || px > w + step || py > h + step) continue;
      const ink = (1 - lum(Math.min(w - 1, Math.max(0, px)), Math.min(h - 1, Math.max(0, py)))) * gain;
      if (ink < 0.05) continue;
      g.beginPath();
      g.arc(px + ox, py + oy, step * 0.66 * Math.sqrt(Math.min(1, ink)), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/**
 * Draw a halftone portrait into a canvas of `w`×`h` pixels.
 * `photo` null → procedural silhouette seeded by `file`.
 */
export function halftone(photo: HTMLImageElement | null, file: string, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const g = c.getContext('2d')!;
  const lum = photo ? fromImage(photo, c.width, c.height) : silhouette(hash(file), c.width, c.height);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, c.width, c.height);
  const step = Math.max(3, Math.round(Math.min(c.width, c.height) / 48));
  const off = Math.max(1.5, step * 0.4);
  plate(g, lum, c.width, c.height, step, Math.PI / 4, BLACK, 1);
  plate(g, lum, c.width, c.height, step * 1.1, Math.PI / 12, RED, 0.36, off, off * 0.6);
  return c;
}

/** Records that get a portrait: any with a photo, and every personnel file. */
export const hasPortrait = (rec: { image?: string; category: string }) => !!rec.image || rec.category === 'personnel';
