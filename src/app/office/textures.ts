/**
 * Office textures, all drawn on canvas: lino, two-tone government paint,
 * the street seen at pavement level through the basement window, sofa
 * corduroy, the cassette deck's face, the island map,
 * the clock face and the cards on the notice board.
 */
import * as THREE from 'three';
import { DISTRICTS, labelSide } from '../visitor/districts';
import { SHEET } from '../../data/gerimis/districts';

const SANS = '"Archivo Variable", "Archivo", "N9 KuHei", Arial, sans-serif';
const COND = '"Archivo Variable", "Archivo", "N9 DIN", "N9 KuHei", Arial, sans-serif';
const MONO = '"IBM Plex Mono", "N9 HuoSong", ui-monospace, monospace';
const SERIF = '"Source Serif 4 Variable", "N9 HuoSong", Georgia, serif';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}
function tex(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
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
function grain(g: CanvasRenderingContext2D, w: number, h: number, seed: number, a = 0.05) {
  const r = rng(seed);
  g.save();
  for (let i = 0; i < (w * h) / 400; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
  for (let i = 0; i < 10; i++) {
    const x = r() * w, y = r() * h, rad = 40 + r() * Math.max(w, h) * 0.3;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(80,60,30,${a * 0.8})`);
    grd.addColorStop(1, 'rgba(80,60,30,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }
  g.restore();
}

/** Worn lino tiles: cream and a tired green, scuffed where people walk. */
export function linoTexture() {
  const S = 512, n = 4, s = S / n;
  const [c, g] = canvas(S, S);
  const r = rng(4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const k = 0.92 + r() * 0.12;
      const dark = (x + y) % 2 === 0;
      g.fillStyle = dark ? `rgb(${Math.round(92 * k)} ${Math.round(110 * k)} ${Math.round(94 * k)})` : `rgb(${Math.round(214 * k)} ${Math.round(206 * k)} ${Math.round(184 * k)})`;
      g.fillRect(x * s, y * s, s, s);
    }
  g.strokeStyle = 'rgba(30,30,25,.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * s, 0);
    g.lineTo(i * s, S);
    g.moveTo(0, i * s);
    g.lineTo(S, i * s);
    g.stroke();
  }
  grain(g, S, S, 9, 0.06);
  return tex(c, true);
}

/** Institutional paint: green below the dado rail, cream above. `split` is the rail height as a fraction. */
export function wallTexture(seed: number, split: number) {
  const W = 512, H = 512;
  const [c, g] = canvas(W, H);
  const y = H * (1 - split);
  g.fillStyle = '#d9d0b8';
  g.fillRect(0, 0, W, y);
  g.fillStyle = '#6f8a74';
  g.fillRect(0, y, W, H - y);
  g.fillStyle = '#3e4d40';
  g.fillRect(0, y - 6, W, 8);
  grain(g, W, H, seed, 0.045);
  return tex(c, true);
}

/**
 * The street at pavement level, as a basement window sees it: kerb, wet
 * paving, the bottom of a shophouse across the road. Night lights it up.
 */
export function streetTexture(night: boolean) {
  const W = 1024, H = 256;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, night ? '#0e141e' : '#b7bcbd');
  sky.addColorStop(1, night ? '#1b2330' : '#d5d6d1');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  // the shophouses opposite, five-foot way and shutters
  const r = rng(night ? 7 : 3);
  for (let x = 0; x < W; ) {
    const w = 120 + r() * 120;
    g.fillStyle = night ? '#141a24' : ['#b9a98d', '#a7b3a6', '#c2b39a', '#9fa9b0'][Math.floor(r() * 4)];
    g.fillRect(x, 0, w - 4, H * 0.5);
    g.fillStyle = night ? (r() < 0.5 ? 'rgba(255,205,130,.75)' : '#0d1118') : 'rgba(60,62,60,.55)';
    g.fillRect(x + 14, H * 0.12, w - 32, H * 0.34);
    // shutter lines
    g.fillStyle = night ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.12)';
    for (let yy = H * 0.12; yy < H * 0.46; yy += 6) g.fillRect(x + 14, yy, w - 32, 2);
    x += w;
  }
  // road and kerb
  g.fillStyle = night ? '#0c0f14' : '#55595a';
  g.fillRect(0, H * 0.5, W, H * 0.22);
  g.fillStyle = night ? '#2a2c2e' : '#a8a397';
  g.fillRect(0, H * 0.72, W, H * 0.06);
  g.fillStyle = night ? '#161819' : '#7b786f';
  g.fillRect(0, H * 0.78, W, H * 0.22);
  // wet reflections
  g.save();
  g.globalAlpha = night ? 0.5 : 0.18;
  for (let i = 0; i < 40; i++) {
    g.fillStyle = night ? (r() < 0.6 ? '#ffcf86' : '#9cc4ff') : '#ffffff';
    g.fillRect(r() * W, H * 0.52 + r() * H * 0.18, 2 + r() * 8, 1 + r() * 14);
  }
  g.restore();
  // mist
  const m = g.createLinearGradient(0, 0, 0, H);
  m.addColorStop(0, night ? 'rgba(20,28,40,.35)' : 'rgba(215,215,210,.35)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, W, H);
  return tex(c);
}

/** Feet and an umbrella going past, drawn once and slid across the glass. */
export function passerbyTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = 'rgba(30,30,34,.92)';
  // umbrella canopy edge
  g.beginPath();
  g.ellipse(128, 26, 120, 34, 0, 0, Math.PI);
  g.fill();
  g.fillRect(126, 26, 4, 120);
  // trousers and shoes
  g.fillStyle = 'rgba(40,40,48,.95)';
  g.fillRect(92, 70, 26, 150);
  g.fillRect(138, 74, 26, 146);
  g.fillStyle = 'rgba(15,15,18,1)';
  g.fillRect(84, 214, 42, 16);
  g.fillRect(134, 214, 42, 16);
  return tex(c);
}

/** Corduroy: fine ribs in a sofa colour. */
export function corduroyTexture(color: string) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 8) {
    const grd = g.createLinearGradient(x, 0, x + 8, 0);
    grd.addColorStop(0, 'rgba(0,0,0,.22)');
    grd.addColorStop(0.5, 'rgba(255,255,255,.08)');
    grd.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = grd;
    g.fillRect(x, 0, 8, 256);
  }
  grain(g, 256, 256, 21, 0.05);
  return tex(c, true);
}

/** Patterned rug: border bands and a lozenge field. */
export function rugTexture() {
  const W = 512, H = 360;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#7a2f25';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d8c79f';
  g.lineWidth = 10;
  g.strokeRect(22, 22, W - 44, H - 44);
  g.strokeStyle = '#2c3b4a';
  g.lineWidth = 6;
  g.strokeRect(42, 42, W - 84, H - 84);
  g.fillStyle = 'rgba(216,199,159,.55)';
  for (let y = 80; y < H - 70; y += 50)
    for (let x = 80; x < W - 70; x += 60) {
      g.beginPath();
      g.moveTo(x, y - 16);
      g.lineTo(x + 16, y);
      g.lineTo(x, y + 16);
      g.lineTo(x - 16, y);
      g.closePath();
      g.fill();
    }
  grain(g, W, H, 5, 0.08);
  return tex(c);
}

/** The cassette deck's face: two wells, VU meters, piano keys, a counter. */
export function deckTexture() {
  const W = 1024, H = 300;
  const [c, g] = canvas(W, H);
  const brushed = g.createLinearGradient(0, 0, 0, H);
  brushed.addColorStop(0, '#c9c6bd');
  brushed.addColorStop(1, '#a9a69c');
  g.fillStyle = brushed;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.08;
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = y % 4 ? '#000' : '#fff';
    g.fillRect(0, y, W, 1);
  }
  g.globalAlpha = 1;
  const well = (x: number, label: string) => {
    g.fillStyle = '#1b1a18';
    g.fillRect(x, 30, 300, 180);
    g.strokeStyle = '#6b6a66';
    g.lineWidth = 4;
    g.strokeRect(x, 30, 300, 180);
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fillRect(x + 10, 40, 280, 40);
    g.fillStyle = '#d8d4c8';
    g.font = `600 18px ${MONO}`;
    g.fillText(label, x, 240);
  };
  well(40, 'DECK A · PLAY');
  well(370, 'DECK B · PLAY/REC');
  // VU meters
  for (const [x, l] of [[710, 'L'], [860, 'R']] as const) {
    g.fillStyle = '#f2e5bf';
    g.fillRect(x, 34, 130, 86);
    g.strokeStyle = '#2b2a28';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x + 65, 128, 70, Math.PI * 1.18, Math.PI * 1.82);
    g.stroke();
    g.fillStyle = '#b8281d';
    g.fillRect(x + 92, 48, 26, 6);
    g.fillStyle = '#2b2a28';
    g.font = `600 14px ${MONO}`;
    g.fillText(`VU ${l}`, x + 6, 112);
  }
  g.fillStyle = '#2b2a28';
  g.font = `700 17px ${COND}`;
  g.fillText('RO-DS STEREO CASSETTE DECK', 710, 160, 290);
  // counter
  g.fillStyle = '#111';
  g.fillRect(710, 180, 90, 34);
  return tex(c);
}

/** A cassette seen from the front: shell, the label with its code and title, the window. */
export function cassetteTexture(code: string, title: string, ink: string) {
  const W = 512, H = 328;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#2a2826';
  g.fillRect(0, 0, W, H);
  // label
  g.fillStyle = '#ece4cf';
  g.fillRect(22, 20, W - 44, 220);
  g.fillStyle = ink;
  g.fillRect(22, 20, W - 44, 18);
  g.fillRect(22, 222, W - 44, 18);
  g.fillStyle = '#1d1b17';
  g.font = `600 30px ${MONO}`;
  g.fillText(code, 40, 76);
  g.font = `600 18px ${MONO}`;
  g.textAlign = 'right';
  g.fillText('A', W - 40, 74);
  g.textAlign = 'left';
  g.font = `italic 400 30px ${SERIF}`;
  let t = title;
  while (g.measureText(t).width > W - 90 && t.length > 2) t = t.slice(0, -2) + '…';
  g.fillText(t, 40, 112);
  // ruled lines for the hand
  g.strokeStyle = 'rgba(29,27,23,.22)';
  g.lineWidth = 1;
  for (const y of [84, 120]) {
    g.beginPath();
    g.moveTo(36, y);
    g.lineTo(W - 36, y);
    g.stroke();
  }
  // window, with the tape pack and the hub holes
  g.fillStyle = '#3a2c22';
  g.fillRect(110, 128, W - 220, 88);
  g.fillStyle = '#5a3c26';
  g.beginPath();
  g.arc(W * 0.29, 168, 52, 0, Math.PI * 2);
  g.arc(W * 0.71, 168, 40, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.fillRect(110, 128, W - 220, 22);
  // the bottom ridge and its screws
  g.fillStyle = '#211f1d';
  g.beginPath();
  g.moveTo(80, H);
  g.lineTo(110, 262);
  g.lineTo(W - 110, 262);
  g.lineTo(W - 80, H);
  g.fill();
  g.fillStyle = '#8d9091';
  for (const [x, y] of [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16], [W / 2, 290]]) {
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** A cassette's edge as it shows in the rack: an ink band, the code, the title. */
export function spineTexture(code: string, title: string, ink: string) {
  const W = 512, H = 72;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#2a2826';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ece4cf';
  g.fillRect(14, 10, W - 28, H - 20);
  g.fillStyle = ink;
  g.fillRect(14, 10, 26, H - 20);
  g.fillStyle = '#1d1b17';
  g.textBaseline = 'middle';
  g.font = `600 26px ${MONO}`;
  g.fillText(code, 52, H / 2 + 1);
  const x = 52 + g.measureText(code).width + 18;
  g.font = `italic 400 26px ${SERIF}`;
  let t = title;
  while (g.measureText(t).width > W - 30 - x && t.length > 2) t = t.slice(0, -2) + '…';
  g.fillText(t, x, H / 2 + 1);
  return tex(c);
}

/** The white hub a reel turns on, with its six teeth. */
export function hubTexture() {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#e9e5da';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2826';
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e9e5da';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.save();
    g.translate(S / 2, S / 2);
    g.rotate(a);
    g.fillRect(-5, -S * 0.3, 10, 16);
    g.restore();
  }
  return tex(c);
}

/** The three-digit tape counter; redraws itself when the number changes. */
export function counterTexture() {
  const [c, g] = canvas(128, 48);
  const t = tex(c);
  let last = -1;
  const draw = (n: number) => {
    if (n === last) return;
    last = n;
    g.fillStyle = '#111';
    g.fillRect(0, 0, 128, 48);
    g.font = `500 34px ${MONO}`;
    g.textBaseline = 'middle';
    String(n).padStart(3, '0').split('').forEach((d, i) => {
      g.fillStyle = '#1e1d1b';
      g.fillRect(10 + i * 38, 4, 32, 40);
      g.fillStyle = '#e8e2d2';
      g.fillText(d, 16 + i * 38, 26);
    });
    t.needsUpdate = true;
  };
  draw(0);
  return { tex: t, draw };
}

/** Framed island map: a coast, the districts, both names. */
export function mapTexture() {
  const W = 768, H = 460;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#e9e2cd';
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 13, 0.05);
  // water hatching
  g.strokeStyle = 'rgba(40,70,100,.18)';
  for (let y = 10; y < H; y += 9) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  // the island, traced from the survey sheet
  const sx = W / 1000, sy = H / 560;
  const outline = (pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * sx, y * sy) : g.moveTo(x * sx, y * sy)));
    g.closePath();
    g.fill();
    g.stroke();
  };
  g.fillStyle = '#d9cfae';
  g.strokeStyle = '#4b4232';
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  outline(SHEET.coastPoints);
  g.lineWidth = 1.6;
  SHEET.islandPoints.forEach(outline);
  // every district a dot; the large towns named
  for (const d of DISTRICTS) {
    const x = d.x * sx, y = d.y * sy;
    const big = d.id === 'axis' || d.major;
    g.fillStyle = d.id === 'axis' ? '#b8281d' : d.kind === 'unsurveyed' ? 'rgba(29,27,23,.35)' : '#1d1b17';
    g.beginPath();
    g.arc(x, y, d.id === 'axis' ? 5 : big ? 3.6 : 2, 0, Math.PI * 2);
    g.fill();
    if (!big) continue;
    const side = labelSide(d);
    g.font = `600 12px ${COND}`;
    g.textAlign = side === 'l' ? 'right' : side === 'r' ? 'left' : 'center';
    const name = d.id === 'axis' ? `${d.en.toUpperCase()} ${d.zh}` : d.en.toUpperCase();
    g.fillText(name, x + (side === 'l' ? -7 : side === 'r' ? 7 : 0), y + (side === 't' ? -8 : side === 'b' ? 16 : 4));
  }
  // the title block sits in the sea, bottom right
  g.textAlign = 'right';
  g.font = `800 22px ${COND}`;
  g.fillStyle = '#1d1b17';
  g.fillText('GERIMIS 霏微', W - 24, H - 40);
  g.font = `500 12px ${MONO}`;
  g.fillText('SURVEY SECTION · 1999 EDITION', W - 24, H - 22);
  g.textAlign = 'left';
  return tex(c);
}

/** Clock face with the district it is set to. */
export function clockFaceTexture(label: string) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#f3eee1';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1d1b17';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = S / 2 - 28, r0 = r1 - (i % 5 ? 12 : 34);
    g.lineWidth = i % 5 ? 3 : 9;
    g.beginPath();
    g.moveTo(S / 2 + Math.sin(a) * r0, S / 2 - Math.cos(a) * r0);
    g.lineTo(S / 2 + Math.sin(a) * r1, S / 2 - Math.cos(a) * r1);
    g.stroke();
  }
  g.fillStyle = '#1d1b17';
  g.textAlign = 'center';
  g.font = `700 30px ${COND}`;
  g.fillText('RECORDS OFFICE', S / 2, S / 2 - 70);
  g.fillStyle = '#b8281d';
  g.font = `600 30px ${COND}`;
  g.fillText(label, S / 2, S / 2 + 110);
  return tex(c);
}

/** A card pinned on the notice board. */
export function noticeTexture(file: string, title: string, date: string, stamp: string) {
  const W = 320, H = 220;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f1ead6';
  g.fillRect(0, 0, W, H);
  grain(g, W, H, file.charCodeAt(2) * 7, 0.05);
  g.fillStyle = '#1d1b17';
  g.font = `700 30px ${MONO}`;
  g.fillText(file, 20, 52);
  g.font = `500 17px ${SERIF}`;
  // wrap the title onto two lines
  const words = title.split(/\s+/);
  let line = '', y = 92;
  for (const w of words) {
    if (g.measureText(line + w).width > W - 40 && line) {
      g.fillText(line.trim(), 20, y);
      y += 24;
      line = '';
      if (y > 130) break;
    }
    line += w + ' ';
  }
  if (y <= 130) g.fillText(line.trim(), 20, y);
  g.font = `500 14px ${MONO}`;
  g.fillStyle = 'rgba(29,27,23,.6)';
  g.fillText(date, 20, 186);
  g.strokeStyle = '#b8281d';
  g.fillStyle = '#b8281d';
  g.lineWidth = 2.5;
  g.font = `700 13px ${MONO}`;
  const sw = g.measureText(stamp).width + 14;
  g.save();
  g.translate(W - sw - 16, 178);
  g.rotate(-0.08);
  g.strokeRect(0, -18, sw, 26);
  g.fillText(stamp, 7, 0);
  g.restore();
  return tex(c);
}

/** Beige plastic with a little texture, for the computer and the deck's body. */
export function plasticTexture(base: string) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  grain(g, 128, 128, 3, 0.04);
  return tex(c, true);
}

/** The front of the desktop case: drive slots and a badge. */
export function caseTexture() {
  const W = 512, H = 140;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#d8d1bf';
  g.fillRect(0, 0, W, H);
  grain(g, W, H, 8, 0.04);
  g.fillStyle = '#2a2824';
  g.fillRect(250, 34, 200, 10);
  g.fillRect(250, 74, 200, 10);
  g.fillStyle = '#8e887a';
  g.fillRect(250, 30, 200, 2);
  g.fillRect(250, 70, 200, 2);
  g.fillStyle = '#3c9a4f';
  g.fillRect(40, 96, 10, 6);
  g.fillStyle = '#d29a2a';
  g.fillRect(60, 96, 10, 6);
  g.fillStyle = '#4a463e';
  g.font = `700 18px ${COND}`;
  g.fillText('RO-DS 486', 40, 60);
  return tex(c);
}

/** Keyboard top: rows of keys. */
export function keyboardTexture() {
  const W = 512, H = 180;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#cfc8b5';
  g.fillRect(0, 0, W, H);
  for (let row = 0; row < 5; row++)
    for (let k = 0; k < 15; k++) {
      const x = 14 + k * 26 + (row % 2) * 6, y = 18 + row * 30;
      if (x > W - 140) continue;
      g.fillStyle = '#e6e0cf';
      g.fillRect(x, y, 22, 24);
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.fillRect(x, y + 20, 22, 4);
    }
  for (let row = 0; row < 4; row++)
    for (let k = 0; k < 4; k++) {
      g.fillStyle = '#e6e0cf';
      g.fillRect(W - 120 + k * 26, 18 + row * 30, 22, 24);
    }
  return tex(c);
}

/** Cork, warm and speckled. */
export function corkTexture() {
  const [c, g] = canvas(512, 360);
  g.fillStyle = '#b58a57';
  g.fillRect(0, 0, 512, 360);
  const r = rng(17);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(90,55,25,${0.15 + r() * 0.3})` : `rgba(230,200,150,${0.1 + r() * 0.25})`;
    g.fillRect(r() * 512, r() * 360, 1 + r() * 3, 1 + r() * 3);
  }
  // old pin holes and a pale rectangle where a notice was
  g.fillStyle = 'rgba(230,205,160,.35)';
  g.fillRect(300, 210, 120, 90);
  return tex(c);
}

/** The screen's cloth: matt white with a fine weave, a black border down the sides and along the bottom. */
export function screenTexture() {
  const W = 768, H = 572;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f2f0ea';
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.05;
  for (let y = 0; y < H; y += 2) {
    g.fillStyle = y % 4 ? '#000' : '#fff';
    g.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 3) {
    g.fillStyle = '#000';
    g.fillRect(x, 0, 1, H);
  }
  g.globalAlpha = 1;
  g.fillStyle = '#141312';
  const b = Math.round(W * 0.03);
  g.fillRect(0, 0, b, H);
  g.fillRect(W - b, 0, b, H);
  g.fillRect(0, H - b * 1.4, W, b * 1.4);
  // the top, where it comes off the roller, is a little greyer
  const top = g.createLinearGradient(0, 0, 0, 60);
  top.addColorStop(0, 'rgba(60,55,45,.25)');
  top.addColorStop(1, 'rgba(60,55,45,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, W, 60);
  return tex(c);
}

/** The lid of a yellow slide box, its label written on. */
export function slideBoxTexture() {
  const [c, g] = canvas(256, 180);
  g.fillStyle = '#d9a62e';
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = '#efe7d2';
  g.fillRect(28, 40, 200, 100);
  g.fillStyle = '#1d1b17';
  g.font = `600 18px ${MONO}`;
  g.fillText('SLIDES · 36', 42, 70);
  g.font = `italic 400 24px ${SERIF}`;
  g.fillText('Survey, 1999', 42, 112);
  return tex(c);
}

/** Card stock for the slide-tray boxes: mustard board, a little worn. */
function boxBoard(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  g.fillStyle = '#c99a32';
  g.fillRect(0, 0, w, h);
  grain(g, w, h, seed, 0.07);
}

/** The lid of a slide-tray box: maker's print, and the office's typed label. */
export function trayLidTexture(code: string, title: string, count: number, ink: string, zh: boolean) {
  const S = 512;
  const [c, g] = canvas(S, S);
  boxBoard(g, S, S, code.length * 31 + count);
  // the maker's print round the edge
  g.fillStyle = '#3a2a10';
  g.font = `700 22px ${COND}`;
  g.fillText('RO-DS', 30, 50);
  g.font = `500 16px ${MONO}`;
  g.fillText('CAROUSEL TRAY · 80 SLIDES · 2×2 IN', 112, 49);
  g.fillRect(30, 62, S - 60, 3);
  g.fillText('KEEP DRY · DO NOT STORE NEAR THE LAMP', 30, S - 30);
  // the label, a little crooked, typed
  g.save();
  g.translate(S / 2, S / 2 + 10);
  g.rotate(-0.025);
  g.fillStyle = '#efe7d2';
  g.fillRect(-190, -120, 380, 240);
  g.fillStyle = ink;
  g.fillRect(-190, -120, 380, 14);
  g.fillStyle = '#1d1b17';
  g.font = `600 54px ${MONO}`;
  g.fillText(code, -168, -40);
  g.font = zh ? `400 40px ${SERIF}` : `italic 400 40px ${SERIF}`;
  let t = title;
  while (g.measureText(t).width > 336 && t.length > 2) t = t.slice(0, -2) + '…';
  g.fillText(t, -168, 20);
  g.font = `500 22px ${MONO}`;
  g.fillStyle = '#5c5952';
  g.fillText(zh ? `${count} 张 · 记录署数据组` : `${count} slides · Data Section`, -168, 80);
  g.restore();
  return tex(c);
}

/** The narrow edge of a slide-tray box, seen standing in the crate. */
export function traySpineTexture(code: string, title: string, ink: string) {
  const W = 512, H = 144;
  const [c, g] = canvas(W, H);
  boxBoard(g, W, H, code.length * 17);
  g.fillStyle = '#efe7d2';
  g.fillRect(18, 22, W - 36, H - 44);
  g.fillStyle = ink;
  g.fillRect(18, 22, 30, H - 44);
  g.fillStyle = '#1d1b17';
  g.textBaseline = 'middle';
  g.font = `600 40px ${MONO}`;
  g.fillText(code, 64, H / 2 + 2);
  const x = 64 + g.measureText(code).width + 20;
  g.font = `italic 400 38px ${SERIF}`;
  let t = title;
  while (g.measureText(t).width > W - 40 - x && t.length > 2) t = t.slice(0, -2) + '…';
  g.fillText(t, x, H / 2 + 2);
  return tex(c);
}

/** Plain board for the box's other faces. */
export function trayBoardTexture() {
  const [c, g] = canvas(256, 256);
  boxBoard(g, 256, 256, 7);
  return tex(c);
}
