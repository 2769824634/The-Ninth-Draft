/**
 * Textures for the archive stacks: teak floor, panelling, enamel plates,
 * drawer cards, the wall map, clock and hygrometer faces, rain on glass.
 * All drawn on canvas; nothing is loaded.
 */
import * as THREE from 'three';

export const RED = '#b8352b';
export const INK = '#1d1b17';
export const KU = '"N9 KuHei", "Archivo Variable", Arial, sans-serif';
export const DIN = '"N9 DIN", "Archivo Variable", "Archivo", Arial, sans-serif';
export const DINB = '"N9 DIN Bold", "Archivo Variable", "Archivo", Arial, sans-serif';
const SONG = '"N9 HuoSong", "Source Serif 4 Variable", Georgia, serif';

let aniso = 4;
export const setStacksAniso = (n: number) => (aniso = n);

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cv(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export function tex(c: HTMLCanvasElement, rep?: [number, number]) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
  }
  return t;
}

function grain(g: CanvasRenderingContext2D, W: number, H: number, base: string, seed: number, amt = 1) {
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400 * amt; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(60,40,10,${0.02 + r() * 0.05})` : `rgba(255,250,235,${0.03 + r() * 0.05})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 10, 1);
  }
}

export function woodTex(base = '#6b4a30', seed = 4) {
  const [c, g] = cv(512, 512);
  const r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + 0.05 * Math.abs(Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4))})`;
    g.fillRect(0, y, 512, 1);
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(255,220,170,${r() * 0.05})`;
    g.fillRect(r() * 512, r() * 512, 40 + r() * 120, 1);
  }
  return tex(c);
}

/** Teak strip flooring: staggered planks, a little colour in each, and grain. */
export function teakFloor(rep: [number, number]) {
  const [c, g] = cv(1024, 1024);
  const r = rng(31);
  const PW = 32;
  for (let row = 0; row < 1024 / PW; row++) {
    let x = -Math.floor(r() * 300);
    while (x < 1024) {
      const len = 220 + Math.floor(r() * 260);
      const v = r();
      g.fillStyle = v < 0.25 ? '#6a4429' : v < 0.5 ? '#734a2c' : v < 0.75 ? '#5f3d25' : '#7b5131';
      g.fillRect(x, row * PW, len, PW);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,220,170'},${0.04 + r() * 0.06})`;
        g.fillRect(x, row * PW + r() * PW, len, 1);
      }
      g.fillStyle = 'rgba(20,10,4,0.55)';
      g.fillRect(x, row * PW, 1.5, PW);
      x += len;
    }
    g.fillStyle = 'rgba(20,10,4,0.5)';
    g.fillRect(0, row * PW, 1024, 1.2);
  }
  return tex(c, rep);
}

/** Teak wall panelling for the lower part of the walls: two raised panels per repeat. */
export function panelling() {
  const [c, g] = cv(512, 256);
  g.fillStyle = '#4a3020';
  g.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + 0.05 * Math.abs(Math.sin(y * 0.11))})`;
    g.fillRect(0, y, 512, 1);
  }
  for (const x of [16, 272]) {
    g.fillStyle = '#583a26';
    g.fillRect(x, 24, 224, 196);
    g.strokeStyle = 'rgba(255,220,170,0.18)';
    g.lineWidth = 3;
    g.strokeRect(x + 2, 26, 220, 192);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.strokeRect(x + 14, 38, 196, 168);
  }
  g.fillStyle = '#2e1d12';
  g.fillRect(0, 236, 512, 20);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

type Line = [font: string, text: string, x: number, y: number, col?: string];

/** An enamel or brass plate with lines of lettering. */
export function plate(lines: Line[], w: number, h: number, bg = INK, fg = '#efe8d6', border: string | null = null) {
  const [c, g] = cv(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 6;
    g.strokeRect(10, 10, w - 20, h - 20);
  }
  for (const [font, text, x, y, col] of lines) {
    g.font = font;
    g.fillStyle = col || fg;
    g.fillText(text, x, y, w - x - 16);
  }
  return tex(c);
}

/** The card in a drawer's brass frame. */
export function drawerCard(zh: string, en: string, sub: string) {
  const [c, g] = cv(256, 128);
  grain(g, 256, 128, '#eee8d8', zh.length * 13 + sub.length, 0.3);
  g.fillStyle = INK;
  g.font = `700 40px ${KU}`;
  g.fillText(zh, 16, 52, 224);
  g.font = `600 20px ${DIN}`;
  g.fillText(en, 16, 82, 224);
  g.fillStyle = '#6b665c';
  g.fillText(sub, 16, 108, 224);
  return tex(c);
}

/** A notice or a typed sheet: a heading and grey lines for text. */
export function sheet(seed: number, title: string, red: boolean) {
  const [c, g] = cv(256, 362);
  grain(g, 256, 362, '#f1ece0', seed, 0.4);
  g.fillStyle = red ? RED : INK;
  g.font = `700 26px ${KU}`;
  g.fillText(title, 20, 46, 216);
  g.fillRect(20, 58, 216, 3);
  const r = rng(seed);
  g.fillStyle = '#5a554c';
  for (let i = 0; i < 12; i++) g.fillRect(20, 84 + i * 20, 120 + r() * 96, 5);
  return tex(c);
}

/** Envelope tops seen in a pulled drawer. */
export function envelopeTops() {
  const [c, g] = cv(128, 32);
  grain(g, 128, 32, '#c29d68', 3, 0.3);
  const r = rng(8);
  for (let x = 0; x < 128; x += 3 + Math.floor(r() * 4)) {
    g.fillStyle = `rgba(60,35,10,${0.25 + r() * 0.3})`;
    g.fillRect(x, 0, 1, 32);
  }
  return tex(c);
}

/** The front of a kraft case envelope on the reading table. */
export function caseFront(title: string, file: string) {
  const [c, g] = cv(300, 424);
  grain(g, 300, 424, '#c29d68', 5, 1);
  g.fillStyle = RED;
  g.strokeStyle = RED;
  g.font = `700 20px ${KU}`;
  g.fillText('霏微记录署', 20, 110);
  g.font = `700 22px ${KU}`;
  g.fillText('案 卷', 210, 110);
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(16, 122);
  g.lineTo(284, 122);
  g.stroke();
  g.lineWidth = 1;
  for (let i = 0; i < 4; i++) g.strokeRect(16, 132 + i * 30, 268, 30);
  g.fillStyle = INK;
  g.font = `18px ${SONG}`;
  g.fillText(title, 26, 154, 250);
  g.fillText(file, 26, 244);
  g.fillStyle = RED;
  g.font = `700 14px ${KU}`;
  g.fillText('卷内目录', 20, 290);
  for (let i = 0; i < 6; i++) g.strokeRect(16, 298 + i * 18, 268, 18);
  g.strokeStyle = 'rgba(80,50,15,0.5)';
  g.beginPath();
  g.moveTo(0, 60);
  g.lineTo(300, 60);
  g.stroke();
  return tex(c);
}

/** The island survey sheet, framed on the back wall. */
export function mapSheet() {
  const [c, g] = cv(640, 448);
  grain(g, 640, 448, '#e6dcc4', 12, 0.6);
  const r = rng(4);
  g.strokeStyle = 'rgba(60,50,40,0.25)';
  g.lineWidth = 1;
  for (let x = 40; x < 640; x += 40) {
    g.beginPath();
    g.moveTo(x, 30);
    g.lineTo(x, 418);
    g.stroke();
  }
  for (let y = 30; y < 420; y += 40) {
    g.beginPath();
    g.moveTo(30, y);
    g.lineTo(610, y);
    g.stroke();
  }
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const rr = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.07 * Math.sin(a * 7) + (r() - 0.5) * 0.03;
    const x = 320 + Math.cos(a) * 230 * rr, y = 230 + Math.sin(a) * 120 * rr;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = '#d6c9a6';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.stroke();
  g.strokeStyle = RED;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(150, 260);
  g.bezierCurveTo(260, 200, 380, 300, 520, 230);
  g.stroke();
  g.fillStyle = INK;
  g.font = `700 30px ${KU}`;
  g.fillText('霏微全岛图', 40, 70);
  g.font = `600 15px ${DIN}`;
  g.fillText('GERIMIS · SURVEY SHEET · 1 : 50 000 · 1999', 40, 94);
  g.lineWidth = 3;
  g.strokeRect(20, 20, 600, 408);
  return tex(c);
}

/** A plain clock face, hands drawn separately. */
export function clockFace() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#f4f0e4';
  g.beginPath();
  g.arc(128, 128, 124, 0, 7);
  g.fill();
  g.fillStyle = INK;
  for (let i = 0; i < 12; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i * Math.PI) / 6);
    g.fillRect(-3, -112, 6, i % 3 ? 14 : 24);
    g.restore();
  }
  g.font = `600 15px ${DIN}`;
  g.textAlign = 'center';
  g.fillText('RECORDS OFFICE', 128, 92);
  return tex(c);
}

/** The thermo-hygrometer dial, needle at the day's humidity. */
export function hygroFace(rh: number) {
  const [c, g] = cv(128, 192);
  g.fillStyle = '#f1ece0';
  g.fillRect(0, 0, 128, 192);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(64, 70, 48, Math.PI * 0.8, Math.PI * 2.2);
  g.stroke();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.8 + i * Math.PI * 0.14;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 40, 70 + Math.sin(a) * 40);
    g.lineTo(64 + Math.cos(a) * 48, 70 + Math.sin(a) * 48);
    g.stroke();
  }
  const a = Math.PI * 0.8 + (rh / 100) * Math.PI * 1.4;
  g.strokeStyle = RED;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 70);
  g.lineTo(64 + Math.cos(a) * 44, 70 + Math.sin(a) * 44);
  g.stroke();
  g.fillStyle = INK;
  g.font = `600 16px ${DIN}`;
  g.fillText(`RH ${rh}%`, 34, 112);
  g.fillRect(58, 128, 12, 50);
  g.fillStyle = RED;
  g.fillRect(61, 140, 6, 38);
  g.font = `600 14px ${DIN}`;
  g.fillStyle = INK;
  g.fillText('29°C', 78, 160);
  return tex(c);
}

/** What the louvres show: a pale sky, or rain running down the glass. */
export function windowView(rain: boolean, night: boolean) {
  const [c, g] = cv(256, 160);
  const r = rng(9);
  const grd = g.createLinearGradient(0, 0, 0, 160);
  if (rain) {
    grd.addColorStop(0, night ? '#1c2533' : '#9aa6ad');
    grd.addColorStop(1, night ? '#2a3445' : '#b9c3c8');
  } else {
    grd.addColorStop(0, night ? '#141b29' : '#e4ecef');
    grd.addColorStop(1, night ? '#222b3a' : '#f3f1e8');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 160);
  if (rain) {
    for (let i = 0; i < 260; i++) {
      const x = r() * 256, y = r() * 160, l = 6 + r() * 22;
      g.strokeStyle = `rgba(230,240,255,${0.15 + r() * 0.35})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 2, y + l);
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(240,248,255,0.5)';
      g.beginPath();
      g.arc(r() * 256, r() * 160, 1 + r() * 2, 0, 7);
      g.fill();
    }
  }
  return tex(c);
}

/** Light falling through the louvre blades: bright bars with the blades' shadows. */
export function louvreLight() {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#fff3d6';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#000';
  for (let i = 0; i < 8; i++) g.fillRect(0, 10 + i * 31, 256, 9);
  g.fillRect(124, 0, 8, 256);
  for (let i = 0; i < 6; i++) g.fillRect(16 + i * 45, 0, 3, 256);
  return tex(c);
}

/** A shaft of daylight seen from the side: the louvre blades' stripes across its width, fading out at both ends. */
export function beamLight() {
  const [c, g] = cv(64, 128);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,244,214,0)');
  grad.addColorStop(0.18, 'rgba(255,244,214,.9)');
  grad.addColorStop(0.7, 'rgba(255,244,214,.7)');
  grad.addColorStop(1, 'rgba(255,244,214,0)');
  g.fillStyle = grad;
  for (let i = 0; i < 4; i++) g.fillRect(2 + i * 16, 0, 11, 128);
  const t = tex(c);
  return t;
}

export function runner() {
  const [c, g] = cv(128, 384);
  g.fillStyle = '#7a2f2a';
  g.fillRect(0, 0, 128, 384);
  g.strokeStyle = '#d8c79c';
  g.lineWidth = 3;
  g.strokeRect(8, 8, 112, 368);
  g.strokeStyle = '#3b2420';
  g.lineWidth = 2;
  g.strokeRect(16, 16, 96, 352);
  return tex(c);
}

/** A soft dark blot under the model, where it sits on the paper. */
export function contactShadow() {
  const [c, g] = cv(256, 256);
  g.filter = 'blur(14px)';
  g.fillStyle = '#000';
  g.fillRect(34, 40, 188, 176);
  return new THREE.CanvasTexture(c);
}

/** Stamp ink by clearance, as on the paper. */
export const CLR_INK: Record<string, string> = { 'TOP SECRET': '#b3271c', SECRET: '#a8720b', CONFIDENTIAL: '#1f4fa3', RESTRICTED: '#4f5f3e' };

/** The tab of a hanging file: its number, and a stripe of the clearance ink. */
export function fileTab(file: string, stamp: string) {
  const [c, g] = cv(256, 96);
  grain(g, 256, 96, '#f1ece0', file.charCodeAt(2) * 7 + file.length, 0.2);
  g.fillStyle = CLR_INK[stamp] ?? INK;
  g.fillRect(0, 0, 256, 14);
  g.fillStyle = INK;
  g.font = `700 54px ${DINB}`;
  g.fillText(file, 18, 76, 224);
  return tex(c);
}

/**
 * The cover of a file lying on the reading table: manila for personnel, kraft
 * for events, grey board for programs; the clearance band across the top,
 * the number large, the title typed underneath, the stamp at a slant.
 */
export function fileCover(file: string, title: string, stamp: string, category: string) {
  const W = 300, H = 410;
  const [c, g] = cv(W, H);
  const base = category === 'events' ? '#c29d68' : category === 'programs' ? '#9aa197' : '#d8c79c';
  grain(g, W, H, base, file.charCodeAt(2) * 13 + title.length, 0.9);
  const ink = CLR_INK[stamp] ?? INK;
  g.fillStyle = ink;
  g.fillRect(0, 0, W, 22);
  g.fillStyle = 'rgba(29,27,23,.55)';
  g.font = `600 15px ${DIN}`;
  g.fillText('GERIMIS RECORDS OFFICE · ARCHIVE', 18, 50, W - 36);
  g.fillStyle = INK;
  g.font = `700 64px ${DINB}`;
  g.fillText(file, 18, 122, W - 36);
  g.font = `22px ${SONG}`;
  const words = [...title];
  let line = '', y = 168;
  for (const ch of words) {
    if (g.measureText(line + ch).width > W - 40 && line) {
      g.fillText(line, 20, y);
      line = ch.trimStart();
      y += 30;
      if (y > 260) break;
    } else line += ch;
  }
  if (y <= 260) g.fillText(line, 20, y);
  g.save();
  g.translate(W / 2, H - 80);
  g.rotate(-0.12);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = 4;
  g.font = `700 30px ${DINB}`;
  const sw = g.measureText(stamp).width + 28;
  g.globalAlpha = 0.85;
  g.strokeRect(-sw / 2, -26, sw, 44);
  g.fillText(stamp, -sw / 2 + 14, 8);
  g.restore();
  return tex(c);
}

/**
 * The accession register lying open on the intake desk: two ruled pages,
 * a red head rule, columns for number, date, from, description and filed,
 * today's entries in blue-black ink, the last line still blank.
 */
export function ledgerSpread(today: string) {
  const W = 1024, H = 720;
  const [c, g] = cv(W, H);
  grain(g, W, H, '#ddd1b2', 31, 0.8);
  // the gutter and the shadow it throws
  const gut = g.createLinearGradient(W / 2 - 40, 0, W / 2 + 40, 0);
  gut.addColorStop(0, 'rgba(60,40,20,0)');
  gut.addColorStop(0.5, 'rgba(60,40,20,0.35)');
  gut.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = gut;
  g.fillRect(W / 2 - 40, 0, 80, H);
  const [, mm, dd] = today.split('-');
  const r = rng(Number(mm) * 40 + Number(dd));
  const cols = [0, 70, 150, 290, 470];
  const from = ['Toa Payoh DO', 'Axis Registry', 'Hougang DO', 'Bukit Merah DO', 'Data Section', 'Woodlands DO', 'Courier', 'Ang Mo Kio DO'];
  const what = ['Survey forms (12)', 'Street-name return', 'Bus route notice', 'Minutes, 3 pp.', 'Correspondence', 'Tenancy cards', 'Plan, folded', 'Census sheets', 'Letter, by hand'];
  let n = 1000 + Math.floor(r() * 400);
  for (const side of [0, 1]) {
    const x0 = side ? W / 2 + 30 : 34;
    const pw = W / 2 - 64;
    g.fillStyle = '#9c2b22';
    g.fillRect(x0, 70, pw, 3);
    g.fillRect(x0, 76, pw, 1);
    g.font = `600 15px ${DIN}`;
    g.fillStyle = '#7a3a2c';
    ['No.', 'Date', 'From', 'Description', 'Filed'].forEach((h, i) => g.fillText(h, x0 + cols[i] + 4, 62));
    g.strokeStyle = 'rgba(70,90,140,0.32)';
    g.lineWidth = 1;
    for (let y = 108; y < H - 30; y += 32) {
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x0 + pw, y);
      g.stroke();
    }
    g.strokeStyle = 'rgba(156,43,34,0.45)';
    for (const cx of cols.slice(1)) {
      g.beginPath();
      g.moveTo(x0 + cx, 50);
      g.lineTo(x0 + cx, H - 30);
      g.stroke();
    }
    // the left page is full; the right page stops partway down, today
    const rows = side ? 6 + Math.floor(r() * 5) : 18;
    for (let i = 0; i < rows; i++) {
      const y = 102 + i * 32;
      const ink = r() < 0.15 ? '#2a2620' : '#1f2c55';
      g.fillStyle = ink;
      g.font = `italic 400 19px Georgia, serif`;
      g.save();
      g.translate(0, (r() - 0.5) * 2);
      g.fillText(`99/${n++}`, x0 + cols[0] + 4, y);
      g.fillText(side && i >= rows - 4 ? `${dd}.${mm}` : `${String(Math.max(1, Number(dd) - 1 - Math.floor((rows - i) / 6))).padStart(2, '0')}.${mm}`, x0 + cols[1] + 6, y);
      g.fillText(from[Math.floor(r() * from.length)], x0 + cols[2] + 6, y, 132);
      g.fillText(what[Math.floor(r() * what.length)], x0 + cols[3] + 6, y, 172);
      // a tick once it has gone to its drawer; today's are not all filed yet
      if (!side || i < rows - 2) g.fillText('✓', x0 + cols[4] + 16, y);
      g.restore();
    }
  }
  return tex(c);
}

const ATT_KIND: Record<string, string> = { note: 'Memo', telegram: 'Telegram', ticket: 'Ticket', clipping: 'Clipping', negative: 'Negative strip' };

/** Wrap `text` to `w` px on the canvas, at most `max` lines. */
function wrapLines(g: CanvasRenderingContext2D, text: string, w: number, max: number) {
  const out: string[] = [];
  let line = '';
  for (const ch of [...text]) {
    if (g.measureText(line + ch).width > w && line) {
      out.push(line.trimEnd());
      line = ch.trimStart();
      if (out.length === max) return out;
    } else line += ch;
  }
  if (line && out.length < max) out.push(line);
  return out;
}

/**
 * The inside of the cover, the page that lies on the left when a file is
 * opened, printed from the record's own fields: the case form with its list
 * of contents (events), the base card of a personnel file, the inside cover of
 * a programme board.
 */
export function fileInside(rec: { file: string; title: string; category: string; place?: string; date?: string; status: string; summary: string; attachments: { kind: string }[]; stamp: string }) {
  const W = 300, H = 410;
  const [c, g] = cv(W, H);
  const ev = rec.category === 'events', pr = rec.category === 'programs';
  grain(g, W, H, ev ? '#cba879' : pr ? '#aeb4a8' : '#dfd0a8', rec.file.charCodeAt(3) * 7 + rec.title.length, 0.7);
  const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, ' ');
  const line = (x: number, y: number, w: number, col = 'rgba(29,27,23,.4)') => {
    g.fillStyle = col;
    g.fillRect(x, y, w, 1);
  };
  g.textBaseline = 'alphabetic';
  if (ev) {
    g.fillStyle = RED;
    g.font = `700 15px ${DINB}`;
    g.fillText('CASE FILE · FORM RO-31', 18, 34);
    g.fillRect(18, 42, W - 36, 2);
    const rows: [string, string][] = [['FILE NO.', rec.file], ['SUBJECT', rec.title], ['PLACE', rec.place ?? ''], ['DATE', rec.date ?? ''], ['STATUS', rec.status]];
    rows.forEach(([k, v], i) => {
      const y = 62 + i * 30;
      g.fillStyle = RED;
      g.font = `600 10px ${DIN}`;
      g.fillText(k, 18, y);
      g.fillStyle = INK;
      g.font = `15px ${SONG}`;
      g.fillText(v, 86, y, W - 104);
      line(18, y + 6, W - 36, 'rgba(184,53,43,.55)');
    });
    g.fillStyle = RED;
    g.font = `700 11px ${DINB}`;
    g.fillText('CONTENTS', 18, 232);
    const items = ['Record', ...rec.attachments.map((a) => ATT_KIND[a.kind] ?? 'Enclosure')].slice(0, 7);
    items.forEach((it, i) => {
      const y = 252 + i * 20;
      g.fillStyle = RED;
      g.font = `600 11px ${DIN}`;
      g.fillText(String(i + 1).padStart(2, '0'), 18, y);
      g.fillStyle = INK;
      g.font = `13px ${SONG}`;
      g.fillText(it, 46, y);
      line(18, y + 5, W - 36, 'rgba(184,53,43,.4)');
    });
  } else if (pr) {
    g.fillStyle = 'rgba(29,27,23,.55)';
    g.font = `600 11px ${DIN}`;
    g.fillText('PROGRAMME FILE · VOLUME 1 OF 1', 18, 30);
    g.save();
    g.beginPath();
    g.moveTo(0, 150);
    g.lineTo(W, 70);
    g.lineTo(W, 150);
    g.lineTo(0, 230);
    g.closePath();
    g.fillStyle = RED;
    g.globalAlpha = 0.9;
    g.fill();
    g.restore();
    g.fillStyle = '#f4efe2';
    g.font = `700 40px ${DINB}`;
    g.fillText(rec.file, 22, 168, W - 44);
    g.fillStyle = INK;
    g.font = `600 11px ${DIN}`;
    g.fillText('ISSUED TO', 18, 292);
    line(86, 292, W - 104);
    g.fillText('DATE OPENED', 18, 322);
    g.font = `14px ${SONG}`;
    g.fillText(rec.date ?? '', 100, 320, W - 120);
    line(100, 323, W - 118);
    g.font = `600 10px ${DIN}`;
    g.fillStyle = 'rgba(29,27,23,.55)';
    g.fillText('DO NOT REMOVE FROM THE OFFICE', 18, H - 20);
  } else {
    g.fillStyle = INK;
    g.font = `700 14px ${DINB}`;
    g.fillText('STAFF RECORD · BASE CARD', 18, 32);
    g.fillRect(18, 40, W - 36, 2);
    g.strokeStyle = 'rgba(29,27,23,.6)';
    g.lineWidth = 1;
    g.strokeRect(W - 98, 56, 80, 100);
    g.fillStyle = 'rgba(29,27,23,.45)';
    g.font = `600 9px ${DIN}`;
    g.fillText('PHOTO', W - 74, 110);
    const rows: [string, string][] = [['NAME', rec.title], ['FILE NO.', rec.file], ['OPENED', rec.date ?? ''], ['DISTRICT', rec.place ?? '']];
    rows.forEach(([k, v], i) => {
      const y = 72 + i * 28;
      g.fillStyle = 'rgba(29,27,23,.6)';
      g.font = `600 9px ${DIN}`;
      g.fillText(k, 18, y);
      g.fillStyle = INK;
      g.font = `14px ${SONG}`;
      g.fillText(v, 18, y + 14, 170);
      line(18, y + 18, 176);
    });
    g.fillStyle = 'rgba(29,27,23,.6)';
    g.font = `600 9px ${DIN}`;
    g.fillText('REMARKS', 18, 196);
    g.fillStyle = INK;
    g.font = `13px ${SONG}`;
    const lines = wrapLines(g, plain(rec.summary), W - 40, 6);
    lines.forEach((l, i) => g.fillText(l, 20, 218 + i * 22));
    for (let i = 0; i < 7; i++) line(18, 222 + i * 22, W - 36);
    g.save();
    g.translate(W - 70, H - 46);
    g.rotate(-0.12);
    const ink = CLR_INK[rec.stamp] ?? INK;
    g.strokeStyle = ink;
    g.fillStyle = ink;
    g.globalAlpha = 0.8;
    g.lineWidth = 3;
    g.font = `700 16px ${DINB}`;
    const sw = g.measureText(rec.stamp).width + 16;
    g.strokeRect(-sw / 2, -17, sw, 26);
    g.fillText(rec.stamp, -sw / 2 + 8, 2);
    g.restore();
  }
  return tex(c);
}

/** Beads of rain water on a wet cloth: clear drops with a dark rim and a bright catch of light, on nothing else. */
export function waterBeads() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const x = rnd() * 512, y = rnd() * 256, r = 1 + rnd() * rnd() * 4;
    const body = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    body.addColorStop(0, 'rgba(215,232,240,.32)');
    body.addColorStop(0.7, 'rgba(150,180,195,.2)');
    body.addColorStop(1, 'rgba(25,35,40,.5)');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(x, y, r, r * 1.08, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.beginPath();
    g.arc(x - r * 0.35, y - r * 0.4, Math.max(0.6, r * 0.22), 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
