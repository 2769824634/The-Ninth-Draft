/**
 * The reel-to-reel machine by the reading table: a Studer A807 MK II, the
 * two-track recorder radio stations bought in the nineties, built here to
 * the real one's size (465 wide, 500 high, 265 deep, millimetres) and laid
 * out after a photograph of one: the transport above with its two 10½-inch
 * NAB metal reels standing out past the sides, the tape guides and the
 * aluminium head cover in the middle; the meter bridge below with the timer
 * window, the locator and transport keys, two orange-lit VU meters and the
 * level knobs. It stands on a low black plinth, on a sideboard whose open
 * shelf holds the tapes in their boxes.
 *
 * All drawn in code. The machine's own origin is the middle of its foot,
 * its face towards +z.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DIN, DINB, KU, cv, tex, woodTex } from './textures';

/** Body size, metres. */
export const A807 = { w: 0.465, h: 0.5, d: 0.265 };
/** The meter bridge across the foot of the face. */
const BRIDGE = 0.138;
/** Reel spindles: either side of the middle, near the top. */
const SPIN_X = 0.145, SPIN_Y = 0.392;
/** A 10½-inch NAB reel: flange radius; hub radius; a full pack. */
const REEL_R = 0.1335, HUB_R = 0.05, PACK_R = 0.124;
/** 7½ inches a second, in metres. */
const TAPE_V = 0.1905;
const FACE = A807.d / 2;
/** The plane the tape runs in, in front of the face. */
const TAPE_Z = FACE + 0.03;

/** Where a point on the photograph lies on the machine (its face, metres from the middle of the foot). */
const X = (px: number) => (px - 652) * 0.000564;
const Y = (py: number) => (945 - py) * 0.000577;

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.6, ...o });

/** Brushed aluminium: fine concentric rings for the turned parts, straight grain for the plates. */
function brushed(round: boolean) {
  const [c, g] = cv(256, 256);
  g.fillStyle = '#c9cbcc';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 180 + Math.floor(Math.random() * 60);
    g.strokeStyle = `rgba(${v},${v},${v + 3},.35)`;
    g.lineWidth = 0.6;
    g.beginPath();
    if (round) {
      const r = Math.random() * 128;
      g.arc(128, 128, r, 0, Math.PI * 2);
    } else {
      const y = Math.random() * 256;
      g.moveTo(0, y);
      g.lineTo(256, y + (Math.random() - 0.5) * 2);
    }
    g.stroke();
  }
  return tex(c);
}

/** The face of the meter bridge: everything printed on it. Canvas pixels are the photograph's, ×2.5. */
function bridgeFace(mk: string) {
  const S = 2.5, L = 240, T = 705;
  const [c, g] = cv(Math.round(830 * S), Math.round(240 * S));
  const at = (px: number, py: number) => [(px - L) * S, (py - T) * S] as const;
  g.fillStyle = '#242425';
  g.fillRect(0, 0, c.width, c.height);
  // a fine highlight along the top edge, and the seams between the fields
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.fillRect(0, 0, c.width, 3);
  g.fillStyle = 'rgba(0,0,0,.55)';
  for (const px of [530, 760, 985]) g.fillRect(at(px, 0)[0], 0, 3, c.height);
  // the fields around the key groups, a shade darker
  g.fillStyle = '#1d1d1e';
  const field = (x0: number, y0: number, x1: number, y1: number) => {
    const [a, b] = at(x0, y0), [e, f] = at(x1, y1);
    g.fillRect(a, b, e - a, f - b);
  };
  field(298, 732, 520, 785);
  field(298, 788, 520, 852);
  field(298, 860, 520, 932);
  const txt = (s: string, px: number, py: number, size: number, col = '#e9e7e0', font = DIN, align: CanvasTextAlign = 'center', weight = 600) => {
    g.font = `${weight} ${size * S}px ${font}`;
    g.fillStyle = col;
    g.textAlign = align;
    g.textBaseline = 'middle';
    const [x, y] = at(px, py);
    g.fillText(s, x, y);
  };
  // maker's name and the model
  g.save();
  g.font = `italic 800 ${15 * S}px ${DINB}`;
  g.fillStyle = '#f1efe8';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const [lx, ly] = at(322, 720);
  g.fillText('STUDER', lx, ly);
  g.restore();
  txt('TAPE RECORDER', 412, 721, 4.6, '#cfcdc6', DIN, 'left', 500);
  txt(`A807${mk ? ' ' + mk : ''}`, 470, 721, 4.6, '#cfcdc6', DIN, 'left', 500);
  // key captions (the keys carry the main word; these are the small words under them)
  // the channel fields: lamp captions, the scale round each knob, the words under it
  for (const ox of [0, 230]) {
    txt('STUDER', 553 + ox, 712, 3.4, '#8f8d86');
    for (const [s, py] of [['REC', 745], ['READY', 758], ['SAFE', 772], ['INP', 812], ['SYNC', 827], ['REP', 842]] as const) txt(s, 562 + ox, py, 3.4, '#cfcdc6', DIN, 'left', 500);
    for (const kx of [605, 705]) {
      const [cx, cy] = at(kx + ox, 880);
      g.fillStyle = '#d8d6cf';
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (0.75 + i * 0.15);
        g.beginPath();
        g.arc(cx + Math.cos(a) * 26 * S, cy + Math.sin(a) * 26 * S, (i % 5 ? 0.8 : 1.3) * S, 0, Math.PI * 2);
        g.fill();
      }
      txt(kx === 605 ? 'RECORD LEVEL' : 'REPRODUCE LEVEL', kx + ox + 6, 925, 3.2, '#aeaca5');
      txt('UNCAL', kx + ox - 38, 896, 3, '#aeaca5');
    }
  }
  // the right-hand column: phones, the monitor selector, tape speed
  txt('STUDER', 1012, 712, 3.4, '#8f8d86');
  txt('PHONES', 1006, 760, 3.2, '#cfcdc6');
  txt('L', 990, 778, 3, '#cfcdc6');
  txt('L+R', 1004, 772, 3, '#cfcdc6');
  txt('R', 1020, 778, 3, '#cfcdc6');
  txt('SPEED', 1018, 801, 3.2, '#cfcdc6', DIN, 'left', 500);
  for (const [s, py] of [['3¾', 813], ['7½', 826], ['15', 839]] as const) txt(s, 1020, py, 3.4, '#cfcdc6', DIN, 'left', 500);
  txt('VARI', 1012, 862, 3.2, '#aeaca5');
  txt('SPEED', 1012, 870, 3.2, '#aeaca5');
  txt('LEVEL', 1007, 893, 3.2, '#aeaca5');
  // the meter windows are cut out of the plate
  for (const ox of [0, 230]) {
    const [a, b] = at(580 + ox, 728), [e, f] = at(745 + ox, 800);
    g.clearRect(a, b, e - a, f - b);
  }
  // rack screws
  for (const px of [250, 1056]) {
    const [x, y] = at(px, 875);
    g.fillStyle = '#0d0d0d';
    g.beginPath();
    g.arc(x, y, 5 * S, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** A key cap's lettering on light grey (transport) or black (locator) plastic. */
function keyFace(lines: string[], light: boolean) {
  const [c, g] = cv(128, 96);
  g.fillStyle = light ? '#d9d8d2' : '#1b1b1c';
  g.fillRect(0, 0, 128, 96);
  g.fillStyle = light ? '#3a3936' : '#eceae3';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const arrow = lines[0] === '<' || lines[0] === '>';
  if (arrow) {
    // the wind keys carry an outlined triangle
    const d = lines[0] === '<' ? -1 : 1;
    g.strokeStyle = g.fillStyle as string;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64 + d * 14, 48);
    g.lineTo(64 - d * 10, 32);
    g.lineTo(64 - d * 10, 64);
    g.closePath();
    g.stroke();
    return tex(c);
  }
  g.font = `600 ${lines.length > 1 ? 22 : 26}px ${DIN}`;
  lines.forEach((s, i) => g.fillText(s, 64, 48 + (i - (lines.length - 1) / 2) * 26));
  return tex(c);
}

/** The VU meter dial: orange behind the glass, the scale arc, the red zone past 0. */
function vuFace() {
  const [c, g] = cv(512, 224);
  const gr = g.createRadialGradient(256, 150, 20, 256, 140, 330);
  gr.addColorStop(0, '#ffb24a');
  gr.addColorStop(1, '#f07f1c');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 224);
  const cx = 256, cy = 330, R = 250;
  const ang = (db: number) => {
    // the VU law: deflection follows the voltage, 0 VU at 71 %, +3 at the end
    const v = Math.pow(10, db / 20);
    return -Math.PI / 2 + (v / Math.pow(10, 3 / 20) - 0.5) * 1.6;
  };
  g.strokeStyle = '#2a1a0c';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(cx, cy, R, ang(-20), ang(0));
  g.stroke();
  g.strokeStyle = '#c3221a';
  g.lineWidth = 11;
  g.beginPath();
  g.arc(cx, cy, R + 4, ang(0), ang(3));
  g.stroke();
  g.fillStyle = '#2a1a0c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const db of [-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]) {
    const a = ang(db);
    g.strokeStyle = db > 0 ? '#c3221a' : '#2a1a0c';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
    g.lineTo(cx + Math.cos(a) * (R + 16), cy + Math.sin(a) * (R + 16));
    g.stroke();
    g.font = `600 17px ${DIN}`;
    g.fillStyle = db > 0 ? '#c3221a' : '#2a1a0c';
    g.fillText(db > 0 ? `+${db}` : String(db), cx + Math.cos(a) * (R + 32), cy + Math.sin(a) * (R + 32));
  }
  // percent scale under the arc
  g.fillStyle = '#2a1a0c';
  g.font = `500 12px ${DIN}`;
  for (const p of [0, 20, 40, 60, 80, 100]) {
    const a = -Math.PI / 2 + (p / 141 - 0.5) * 1.6;
    g.fillText(String(p), cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20));
  }
  g.font = `700 22px ${DINB}`;
  g.fillText('VU', 256, 196);
  return tex(c);
}

/** The timer window: grey LCD, seven-segment-ish figures. */
function lcd(text: string) {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#5c625b';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(0,0,0,.08)';
  g.font = `500 44px "IBM Plex Mono", monospace`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText('8.88.88', 236, 34);
  g.fillStyle = '#1c211c';
  g.fillText(text, 236, 34);
  return tex(c);
}

/** A box for a 10½-inch reel: card, a label on the spine. */
function boxSpine(code: string, title: string, ink: string) {
  const [c, g] = cv(64, 512);
  g.fillStyle = ink;
  g.fillRect(0, 0, 64, 512);
  g.fillStyle = '#efe9da';
  g.fillRect(6, 40, 52, 300);
  g.save();
  g.translate(32, 190);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#1d1b17';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `700 22px ${DINB}`;
  g.fillText(code, 0, -10, 280);
  g.font = `500 18px ${KU}`;
  g.fillText(title, 0, 13, 280);
  g.restore();
  g.fillStyle = 'rgba(255,255,255,.18)';
  g.fillRect(0, 470, 64, 4);
  return tex(c);
}

export interface ReelTape {
  id: string;
  code: string;
  title: string;
  ink: string;
}

interface Lamp {
  m: THREE.MeshStandardMaterial;
  on: boolean;
  k: number;
}

/** An NAB metal reel: two flanges with three windows, the hub, the tape wound on it. */
class Reel {
  readonly g = new THREE.Group();
  private pack: THREE.Mesh;
  spin = 0;
  r = HUB_R;

  constructor(flange: THREE.Material, hub: THREE.Material, brass: THREE.Material, tape: THREE.Material) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, REEL_R, 0, Math.PI * 2, false);
    for (let i = 0; i < 3; i++) {
      const a0 = (i * Math.PI * 2) / 3 + 0.55, a1 = a0 + 1.0;
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.118, a0, a1, false);
      hole.absarc(0, 0, 0.062, a1 - 0.08, a0 + 0.08, true);
      hole.closePath();
      shape.holes.push(hole);
    }
    const ring = new THREE.Path();
    ring.absarc(0, 0, 0.0095, 0, Math.PI * 2, true);
    shape.holes.push(ring);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.0016, bevelEnabled: false, curveSegments: 48 });
    for (const z of [-0.0062, 0.0046]) {
      const f = new THREE.Mesh(geo, flange);
      f.position.z = z;
      f.castShadow = f.receiveShadow = true;
      this.g.add(f);
    }
    // the hub the tape winds on, and the NAB centre with its brass locking ring
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(HUB_R, HUB_R, 0.0108, 40), hub);
    hubM.rotation.x = Math.PI / 2;
    this.g.add(hubM);
    const nab = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 40), brass);
    nab.rotation.x = Math.PI / 2;
    nab.position.z = 0.012;
    this.g.add(nab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.008, 32), hub);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.023;
    this.g.add(cap);
    for (let i = 0; i < 3; i++) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.006), brass);
      const a = (i * Math.PI * 2) / 3;
      ear.position.set(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0.016);
      ear.rotation.z = a;
      this.g.add(ear);
    }
    this.pack = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.0064, 64), tape);
    this.pack.rotation.x = Math.PI / 2;
    this.pack.castShadow = true;
    this.g.add(this.pack);
    this.setPack(0);
  }

  /** How much of a full reel's tape is on it, 0–1. */
  setPack(f: number) {
    this.r = Math.sqrt(HUB_R * HUB_R + Math.max(0, Math.min(1, f)) * (PACK_R * PACK_R - HUB_R * HUB_R));
    this.pack.visible = f > 0.002;
    this.pack.scale.set(this.r, 1, this.r);
  }
}

export class Studer {
  /** The whole thing: sideboard, plinth, machine. Its origin is on the floor, under the middle of the sideboard. */
  readonly group = new THREE.Group();
  /** Invisible boxes for the pointer: the machine, its keys, the tape boxes. */
  readonly hits: THREE.Mesh[] = [];
  /** Where the camera looks when it comes over to the machine. */
  readonly centre = new THREE.Vector3();
  private machine = new THREE.Group();
  private supply: Reel;
  private takeup: Reel;
  private tape: THREE.Mesh[] = [];
  private lamps = new Map<string, Lamp>();
  private needles: THREE.Object3D[] = [];
  private vu = [0, 0];
  private keys = new Map<string, THREE.Object3D>();
  private press = new Map<string, number>();
  private lcdMat: THREE.MeshBasicMaterial;
  private lcdText = '';
  private boxes = new Map<string, { m: THREE.Mesh; out: number; want: number }>();
  /** A reel on its way between its box and the spindle. */
  private flight: { path: THREE.CatmullRomCurve3; up: boolean; t: number; done: () => void } | null = null;
  private loaded = false;
  private lastPos = 0;
  private rate = 0;

  constructor(private tapes: ReelTape[]) {
    const g = this.group;
    const black = std({ color: '#1b1b1c', roughness: 0.55 });
    const charcoal = std({ color: '#262627', roughness: 0.5 });
    const alu = std({ map: brushed(false), color: '#eceded', metalness: 0.35, roughness: 0.34 });
    const aluRound = std({ map: brushed(true), color: '#f0f1f2', metalness: 0.4, roughness: 0.28 });
    const reelAlu = std({ map: brushed(true), color: '#e9ebec', metalness: 0.3, roughness: 0.36, side: THREE.DoubleSide });
    const brass = std({ color: '#b8923e', metalness: 0.85, roughness: 0.3 });
    const tapeM = std({ color: '#3a2a1e', roughness: 0.45, metalness: 0.1 });
    const rubber = std({ color: '#151515', roughness: 0.85 });
    const wood = std({ map: woodTex('#5b3f28', 33), roughness: 0.5 });
    const ebony = std({ color: '#141210', roughness: 0.45 });

    /* -------- the sideboard: teak, an open shelf for the tape boxes -------- */
    const SB = { w: 0.74, h: 0.46, d: 0.42 };
    const box = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, cast = true) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.castShadow = cast;
      o.receiveShadow = true;
      p.add(o);
      return o;
    };
    const rbox = (p: THREE.Object3D, w: number, h: number, d: number, r: number, x: number, y: number, z: number, m: THREE.Material) => {
      const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      p.add(o);
      return o;
    };
    const cyl = (p: THREE.Object3D, r: number, depth: number, x: number, y: number, z: number, m: THREE.Material, seg = 32) => {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, seg), m);
      o.rotation.x = Math.PI / 2;
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      p.add(o);
      return o;
    };
    rbox(g, SB.w, 0.03, SB.d, 0.004, 0, SB.h - 0.015, 0, wood);
    for (const sx of [-1, 1]) box(g, 0.025, SB.h - 0.09, SB.d - 0.01, sx * (SB.w / 2 - 0.0125), (SB.h - 0.09) / 2 + 0.06, 0, wood);
    box(g, SB.w - 0.05, 0.02, SB.d - 0.02, 0, 0.07, 0, wood);
    box(g, SB.w - 0.05, SB.h - 0.12, 0.012, 0, (SB.h - 0.12) / 2 + 0.08, -SB.d / 2 + 0.006, wood);
    box(g, SB.w, 0.06, SB.d - 0.03, 0, 0.03, -0.01, ebony);
    // the tape boxes, upright on the shelf, spines out
    const inks = ['#6d7f8c', '#8c4f3c', '#c9b48a', '#4f6b5a', '#7a6a8a', '#a07a3c'];
    const n = Math.max(tapes.length, 1);
    const pitch = 0.026;
    tapes.forEach((t, i) => {
      const side = std({ color: t.ink || inks[i % inks.length], roughness: 0.8 });
      const spine = std({ map: boxSpine(t.code, t.title, t.ink || inks[i % inks.length]), roughness: 0.75 });
      // the spine, the thin face, towards the room
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.285, 0.29), [side, side, side, side, spine, side]);
      const x = -SB.w / 2 + 0.06 + i * pitch;
      m.position.set(x, 0.08 + 0.1425, 0.045);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      this.boxes.set(t.id, { m, out: 0, want: 0 });
      this.hit({ reel: `box:${t.id}`, key: `reel:box:${t.id}`, near: true }, 0.024, 0.29, 0.3, x, 0.225, 0.045);
    });
    // a few blank boxes leaning at the end, and a roll of splicing tape
    for (let i = 0; i < 4; i++) {
      const m = box(g, 0.02, 0.285, 0.29, -SB.w / 2 + 0.06 + (n + 1 + i) * pitch + i * 0.004, 0.08 + 0.1425, 0.045, std({ color: ['#b8b2a3', '#9aa3a0', '#b8b2a3', '#7d8288'][i], roughness: 0.85 }));
      m.rotation.z = i === 3 ? -0.18 : 0;
    }
    cyl(g, 0.026, 0.012, 0.26, 0.11, 0.12, std({ color: '#d9d2c0', roughness: 0.4, transparent: true, opacity: 0.9 }));

    /* -------- the plinth: a low black stand with a raised rim, as in the photograph -------- */
    const pl = new THREE.Group();
    pl.position.set(0, SB.h, 0.0);
    g.add(pl);
    const PW = 0.6, PD = 0.36;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(pl, 0.035, 0.04, 0.035, sx * (PW / 2 - 0.03), 0.02, sz * (PD / 2 - 0.03), ebony);
    rbox(pl, PW, 0.022, PD, 0.004, 0, 0.051, 0, ebony);
    box(pl, PW, 0.03, 0.02, 0, 0.077, PD / 2 - 0.01, ebony);
    for (const sx of [-1, 1]) box(pl, 0.02, 0.03, PD, sx * (PW / 2 - 0.01), 0.077, 0, ebony);
    box(pl, PW, 0.03, 0.02, 0, 0.077, -PD / 2 + 0.01, ebony);

    /* -------- the machine -------- */
    const mc = this.machine;
    mc.position.set(0, SB.h + 0.062, -0.02);
    g.add(mc);
    const { w: W, h: H, d: D } = A807;
    // the chassis behind the face
    box(mc, W - 0.03, H - 0.01, D - 0.02, 0, H / 2, -0.005, charcoal);
    // brushed side cheeks, full height, and the rack ears at the foot
    for (const sx of [-1, 1]) {
      rbox(mc, 0.016, H, D, 0.003, sx * (W / 2 - 0.008), H / 2, 0, alu);
      box(mc, 0.012, BRIDGE + 0.004, 0.004, sx * (W / 2 + 0.004), BRIDGE / 2, FACE + 0.012, alu);
    }
    // the transport plate: matt black
    box(mc, W - 0.032, H - BRIDGE, 0.01, 0, BRIDGE + (H - BRIDGE) / 2, FACE - 0.005, black);
    // top vents, the handle slot between them, and the vents in the middle
    const vent = (cx: number, cy: number, w: number, rows: number) => {
      box(mc, w, rows * 0.0045 + 0.003, 0.004, cx, cy, FACE + 0.0005, std({ color: '#0b0b0b', roughness: 0.9 }), false);
      for (let i = 0; i < rows; i++) box(mc, w - 0.002, 0.0018, 0.003, cx, cy - ((rows - 1) / 2) * 0.0045 + i * 0.0045, FACE + 0.002, black, false);
    };
    vent(X(610), Y(100), 0.035, 6);
    vent(X(700), Y(100), 0.035, 6);
    box(mc, 0.022, 0.012, 0.006, X(655), Y(103), FACE + 0.001, std({ color: '#050505', roughness: 0.9 }), false);
    vent(X(605), Y(415), 0.03, 5);
    vent(X(668), Y(415), 0.03, 5);
    // the spindle motors' hubs
    for (const sx of [-1, 1]) cyl(mc, 0.016, TAPE_Z - FACE, sx * SPIN_X, SPIN_Y, FACE + (TAPE_Z - FACE) / 2, aluRound);

    // the head assembly: a brushed base plate, the long hood with the badge, the lower block, the screws
    const hx = (X(480) + X(840)) / 2;
    box(mc, X(840) - X(480), Y(520) - Y(690), 0.006, hx, (Y(520) + Y(690)) / 2, FACE + 0.003, alu);
    for (const [px, py] of [[555, 530], [610, 530], [495, 625], [825, 625]]) cyl(mc, 0.0028, 0.003, X(px), Y(py), FACE + 0.0068, aluRound, 12);
    rbox(mc, X(827) - X(492), Y(550) - Y(600), 0.05, 0.012, (X(492) + X(827)) / 2, (Y(550) + Y(600)) / 2, FACE + 0.031, alu);
    rbox(mc, X(710) - X(570), Y(600) - Y(650), 0.04, 0.004, (X(570) + X(710)) / 2, (Y(600) + Y(650)) / 2, FACE + 0.026, alu);
    const [bc, bg] = cv(256, 72);
    bg.fillStyle = '#121212';
    bg.fillRect(0, 0, 256, 72);
    bg.strokeStyle = '#d0d0d0';
    bg.lineWidth = 3;
    bg.strokeRect(5, 5, 246, 62);
    bg.fillStyle = '#ececec';
    bg.font = `800 40px ${DINB}`;
    bg.textAlign = 'center';
    bg.textBaseline = 'middle';
    bg.fillText('STUDER', 128, 38);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(X(690) - X(582), Y(560) - Y(595)), std({ map: tex(bc), roughness: 0.4 }));
    badge.position.set((X(582) + X(690)) / 2, Y(577), FACE + 0.0565);
    mc.add(badge);
    // the black rubber head shield flap, and the little tape marker on the left
    rbox(mc, 0.02, 0.03, 0.012, X(752), Y(578), FACE + 0.058, 0.005, rubber);
    box(mc, 0.008, 0.012, 0.01, X(545), Y(537), FACE + 0.01, std({ color: '#d8cbb0', roughness: 0.6 }));
    // capstan pinch roller
    cyl(mc, 0.011, 0.03, X(750), Y(625), FACE + 0.02, aluRound);
    cyl(mc, 0.004, 0.036, X(750), Y(625), FACE + 0.022, std({ color: '#888', metalness: 0.9, roughness: 0.2 }), 12);
    // the guide rollers either side, the tension arm knobs outboard of them, and the slot each arm swings in
    for (const [px, py, r] of [[405, 580, 0.021], [900, 577, 0.021], [300, 597, 0.012], [1012, 592, 0.012]] as const) {
      const depth = r > 0.02 ? TAPE_Z - FACE + 0.006 : 0.016;
      cyl(mc, r, depth, X(px), Y(py), FACE + depth / 2, aluRound);
    }
    for (const px of [318, 995]) {
      const s = box(mc, 0.006, 0.05, 0.002, X(px), Y(575), FACE + 0.001, std({ color: '#050505', roughness: 0.9 }), false);
      s.rotation.z = px < 600 ? 0.25 : -0.25;
    }
    // the splicing bar on the right
    box(mc, X(1050) - X(845), Y(655) - Y(690), 0.01, (X(845) + X(1050)) / 2, (Y(655) + Y(690)) / 2, FACE + 0.005, alu);
    box(mc, X(1040) - X(855), 0.003, 0.004, (X(845) + X(1050)) / 2, Y(672), FACE + 0.0105, std({ color: '#7d7f80', metalness: 0.7, roughness: 0.4 }), false);

    // the reels: a full one goes on the left, the empty take-up reel lives on the right
    this.supply = new Reel(reelAlu, aluRound, brass, tapeM);
    this.takeup = new Reel(reelAlu, aluRound, brass, tapeM);
    this.supply.g.position.set(-SPIN_X, SPIN_Y, TAPE_Z);
    this.takeup.g.position.set(SPIN_X, SPIN_Y, TAPE_Z);
    mc.add(this.supply.g, this.takeup.g);
    this.supply.g.visible = false;
    // the tape's path, in straight runs: off the supply pack to the left guide, under it into the head block, out to the right guide, up to the take-up pack
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.0006, 0.0064), tapeM);
      t.rotation.order = 'ZYX';
      mc.add(t);
      this.tape.push(t);
    }

    /* -------- the meter bridge -------- */
    const BZ = FACE + 0.01;
    // the bridge's body stands back from its face plate, so the meter dials can sit behind the windows cut in it
    box(mc, W - 0.032, BRIDGE, 0.02, 0, BRIDGE / 2, FACE - 0.016, charcoal);
    box(mc, W - 0.032, 0.003, 0.03, 0, BRIDGE - 0.0015, FACE - 0.004, charcoal);
    box(mc, W - 0.032, 0.003, 0.03, 0, 0.0015, FACE - 0.004, charcoal);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(X(1070) - X(240), BRIDGE), std({ map: bridgeFace('MK II'), roughness: 0.55, alphaTest: 0.5 }));
    face.position.set((X(240) + X(1070)) / 2, BRIDGE / 2, BZ + 0.0005);
    face.receiveShadow = true;
    mc.add(face);
    // the timer window
    this.lcdMat = new THREE.MeshBasicMaterial({ map: lcd('0.00.00') });
    const lcdM = new THREE.Mesh(new THREE.PlaneGeometry(X(425) - X(310), Y(740) - Y(775)), this.lcdMat);
    lcdM.position.set((X(310) + X(425)) / 2, Y(757), BZ + 0.0008);
    mc.add(lcdM);
    box(mc, X(428) - X(307), 0.002, 0.004, (X(310) + X(425)) / 2, Y(739), BZ + 0.001, black, false);
    // keys
    const key = (id: string, label: string[], px: number, py: number, w: number, h: number, light: boolean, hit: boolean, hover?: string) => {
      const kg = new THREE.Group();
      kg.position.set(X(px), Y(py), BZ);
      mc.add(kg);
      const side = std({ color: light ? '#c9c8c1' : '#151516', roughness: 0.5 });
      const top = std({ map: keyFace(label, light), roughness: light ? 0.45 : 0.5 });
      const k = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.007), [side, side, side, side, top, side]);
      k.position.z = 0.0035;
      k.castShadow = true;
      kg.add(k);
      this.keys.set(id, kg);
      if (hit) this.hit({ reel: id, key: `reel:${hover ?? id}`, near: true }, w + 0.004, h + 0.004, 0.03, 0, 0, 0, kg);
    };
    key('reset', ['RESET', 'TIMER'], 447, 760, 0.019, 0.016, false, true);
    key('zero', ['ZERO', 'LOC'], 490, 760, 0.019, 0.016, false, true);
    ['TIMER', 'LOC 1', 'LOC 2', 'LOC START', 'LIFTER'].forEach((s, i) => key(`loc${i}`, s.includes(' ') && s.length > 6 ? s.split(' ') : [s], 323 + i * 41.5, 828, 0.019, 0.014, false, i === 3, i === 3 ? 'locstart' : undefined));
    const T = [['rew', '<'], ['ff', '>'], ['play', 'PLAY'], ['stop', 'STOP'], ['rec', 'REC']] as const;
    T.forEach(([id, s], i) => key(id, [s], 323 + i * 41.5, 902, 0.019, 0.016, true, true));
    // lamps
    const lamp = (id: string, px: number, py: number, col: string, on = false, r = 0.0016) => {
      const m = std({ color: '#2a2622', emissive: col, emissiveIntensity: on ? 2.2 : 0.04, roughness: 0.3 });
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.002, 12), m);
      o.rotation.x = Math.PI / 2;
      o.position.set(X(px), Y(py), BZ + 0.001);
      mc.add(o);
      this.lamps.set(id, { m, on, k: on ? 1 : 0 });
    };
    ['timer', 'loc1', 'loc2', 'locstart', 'lifter'].forEach((id, i) => lamp(`l-${id}`, 323 + i * 41.5, 803, '#ffb347'));
    lamp('l-rew', 323, 875, '#ffb347');
    lamp('l-ff', 364.5, 875, '#ffb347');
    lamp('l-play', 406, 875, '#5dff4a', false, 0.0021);
    lamp('l-stop', 447.5, 875, '#ffb347', true);
    lamp('l-rec', 489, 875, '#ff3a2a');
    for (const [ox, ch] of [[0, 1], [230, 2]] as const) {
      lamp(`c${ch}-rec`, 548 + ox, 745, '#ff3a2a');
      lamp(`c${ch}-ready`, 548 + ox, 758, '#7cff6a');
      lamp(`c${ch}-safe`, 548 + ox, 772, '#ffc04a', true);
      lamp(`c${ch}-inp`, 548 + ox, 812, '#6aa8ff');
      lamp(`c${ch}-sync`, 548 + ox, 827, '#ffe04a');
      lamp(`c${ch}-rep`, 548 + ox, 842, '#ffc04a', true);
      for (const kx of [605, 705]) lamp(`c${ch}-uncal${kx}`, kx + ox - 30, 905, '#ff3a2a', false, 0.0022);
    }
    lamp('s-375', 1010, 813, '#ffc04a');
    lamp('s-75', 1010, 826, '#ffc04a', true);
    lamp('s-15', 1010, 839, '#ffc04a');
    // VU meters: lit dial behind glass, a black needle pivoted below the window
    const vuMat = std({ map: vuFace(), emissiveMap: null, color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.0, roughness: 0.35 });
    vuMat.emissiveMap = vuMat.map;
    vuMat.emissiveIntensity = 1.1;
    for (const ox of [0, 230]) {
      const cx = (X(580 + ox) + X(745 + ox)) / 2, cy = (Y(728) + Y(800)) / 2;
      const ww = X(745) - X(580), hh = Y(728) - Y(800);
      const dial = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), vuMat);
      dial.position.set(cx, cy, BZ - 0.004);
      mc.add(dial);
      // the bezel round the window
      for (const [w2, h2, dx, dy] of [[ww + 0.004, 0.002, 0, hh / 2 + 0.001], [ww + 0.004, 0.002, 0, -hh / 2 - 0.001], [0.002, hh, ww / 2 + 0.001, 0], [0.002, hh, -ww / 2 - 0.001, 0]]) box(mc, w2, h2, 0.006, cx + dx, cy + dy, BZ - 0.001, std({ color: '#0e0e0e', roughness: 0.4 }), false);
      // the needle pivots well below the window, so only its upper part shows; clip it to the window with a mask box below
      const pivot = new THREE.Group();
      pivot.position.set(cx, cy - hh * 0.5 - 0.06, BZ - 0.003);
      mc.add(pivot);
      const nd = new THREE.Mesh(new THREE.BoxGeometry(0.0007, 0.06 + hh * 0.82, 0.0005), std({ color: '#111', roughness: 0.6 }));
      nd.position.y = (0.06 + hh * 0.82) / 2;
      pivot.add(nd);
      this.needles.push(pivot);
      // the glass
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), std({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2 }));
      glass.position.set(cx, cy, BZ + 0.0002);
      mc.add(glass);
    }
    // level knobs: a black cap with a white line, on a bright aluminium skirt
    for (const ox of [0, 230])
      for (const kx of [605, 705]) {
        const kn = new THREE.Group();
        kn.position.set(X(kx + ox), Y(880), BZ);
        mc.add(kn);
        cyl(kn, 0.0135, 0.004, 0, 0, 0.002, aluRound, 40);
        cyl(kn, 0.0105, 0.014, 0, 0, 0.009, std({ color: '#141414', roughness: 0.45 }), 40);
        box(kn, 0.0009, 0.009, 0.001, 0, 0.005, 0.0163, std({ color: '#f2f2f2', roughness: 0.5 }), false);
        kn.rotation.z = -0.15;
        // the trimmer hole between the pair
        if (kx === 605) cyl(mc, 0.0025, 0.002, X(655 + ox), Y(858), BZ + 0.0005, std({ color: '#050505' }), 12);
      }
    // the right-hand column: phones jack, selector, level knob, a small jack
    cyl(mc, 0.0055, 0.004, X(1006), Y(745), BZ + 0.002, std({ color: '#060606', roughness: 0.5 }), 24);
    cyl(mc, 0.0075, 0.009, X(1004), Y(785), BZ + 0.0045, std({ color: '#181818', roughness: 0.5 }), 24);
    cyl(mc, 0.006, 0.01, X(1005), Y(905), BZ + 0.005, std({ color: '#181818', roughness: 0.5 }), 24);
    cyl(mc, 0.004, 0.003, X(1035), Y(905), BZ + 0.0015, aluRound, 16);
    this.hit({ reel: 'machine', key: 'reel:machine', far: true }, 0.66, 0.6, 0.4, 0, SB.h + 0.06 + 0.3, 0);
    g.updateMatrixWorld(true);
  }

  /** An invisible box the pointer can hit; `p` is what it moves with (the group by default). */
  private hit(data: Record<string, unknown>, w: number, h: number, d: number, x: number, y: number, z: number, p: THREE.Object3D = this.group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    Object.assign(m.userData, data);
    p.add(m);
    this.hits.push(m);
    return m;
  }

  /** The middle of the machine's face, in the room. */
  faceCentre(target = new THREE.Vector3()) {
    this.machine.updateWorldMatrix(true, false);
    return this.machine.localToWorld(target.set(0, A807.h * 0.5, FACE));
  }

  /** A key going down under a finger. */
  pressKey(id: string) {
    this.press.set(id, 1);
  }

  /** Light a lamp, or put it out. */
  setLamp(id: string, on: boolean) {
    const l = this.lamps.get(id);
    if (l) l.on = on;
  }

  /** Draw one tape box half out of the shelf (or push it home). */
  pullBox(id: string | null) {
    for (const [k, b] of this.boxes) b.want = k === id ? 1 : 0;
  }

  /**
   * Put a reel up (a tape id) or take it down (null). The reel travels between
   * its box and the left spindle; `done` runs when it gets there.
   */
  mount(id: string | null, still: boolean, done: () => void) {
    const spindle = new THREE.Vector3(-SPIN_X, SPIN_Y, TAPE_Z);
    if (still) {
      this.loaded = !!id;
      this.supply.g.visible = !!id;
      this.supply.g.position.copy(spindle);
      this.supply.g.rotation.y = 0;
      done();
      return;
    }
    const b = id ? this.boxes.get(id) : [...this.boxes.values()].find((x) => x.want > 0);
    // the reel comes edge-on out of its box (where the box will be once it is drawn out),
    // straight forward until it clears the sideboard, then up in front of everything and back onto the spindle
    const mc = this.machine.position;
    const bx = b ? b.m.position.x : spindle.x + mc.x;
    const by = b ? b.m.position.y : 0.2225;
    const local = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).sub(mc);
    // once it is clear of the box it turns to face the room (edge-on it is only a sliver),
    // drifting in towards the middle of the sideboard so its flange stays clear of the table
    const pts = [
      local(bx, by, 0.245),
      local(bx, by, 0.37),
      local(-0.2, by + 0.04, 0.42),
      local((-0.2 + spindle.x + mc.x) / 2, by + 0.3, 0.42),
      new THREE.Vector3(spindle.x, spindle.y + 0.02, TAPE_Z + 0.2),
      new THREE.Vector3(spindle.x, spindle.y, TAPE_Z + 0.06),
      spindle.clone(),
    ];
    if (!id) pts.reverse();
    const path = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    this.supply.g.visible = true;
    if (id) {
      this.flight = { path, up: true, t: -0.25, done: () => ((this.loaded = true), done()) };
    } else {
      this.loaded = false;
      this.flight = { path, up: false, t: 0, done: () => ((this.supply.g.visible = false), done()) };
    }
    this.fly(0);
  }

  /** The reel on its way between its box and the spindle. */
  private fly(dt: number) {
    const fl = this.flight;
    if (!fl) return;
    fl.t = Math.min(1, fl.t + dt / 2.3);
    const t = Math.max(0, fl.t);
    // an even pace, like a hand carrying it: no rush in the middle
    const e = t * t * (3 - 2 * t);
    fl.path.getPoint(e, this.supply.g.position);
    // edge-on while in the box and coming out, then turning to face the room
    const u = fl.up ? e : 1 - e;
    const turn = Math.max(0, Math.min(1, (u - 0.17) / 0.25));
    const k = turn * turn * (3 - 2 * turn);
    this.supply.g.rotation.y = (Math.PI / 2) * (1 - k);
    // the hub stands proud of the flanges; while edge-on in the box keep it inside the box's sides
    this.supply.g.scale.z = 0.4 + 0.6 * k;
    // the drawn box hides it while it is inside; gone once it is back in at the end
    this.supply.g.visible = fl.t < 1 || fl.up;
    if (fl.t >= 1) {
      this.flight = null;
      fl.done();
    }
  }

  /** Each frame: where the tape is (0–1 of the way through), how fast it is moving (tape seconds a second), the level in each channel, the timer. */
  tick(dt: number, p: { pos: number; len: number; level: number; timer: string; motion: number }) {
    // how fast the tape is going, in its own seconds a second: 1 playing, tens winding
    const raw = dt > 0 ? (p.pos - this.lastPos) / dt : 0;
    this.lastPos = p.pos;
    this.rate += (Math.max(-80, Math.min(80, raw)) - this.rate) * Math.min(1, dt * 10);
    // the packs: what has played is on the right
    const f = p.len > 0 ? Math.max(0, Math.min(1, p.pos / p.len)) : 0;
    this.supply.setPack(this.loaded ? 0.97 - 0.9 * f : 0.97);
    this.takeup.setPack(this.loaded ? 0.03 + 0.9 * f : 0);
    // both reels turn anticlockwise as the tape goes left to right; the speed is the tape's over each pack's radius
    const v = this.rate * TAPE_V * p.motion;
    for (const r of [this.supply, this.takeup]) {
      const w = Math.max(-34, Math.min(34, v / r.r));
      r.g.rotation.z += w * dt;
    }
    this.lay();
    // the reel on its way up or down
    this.fly(dt);
    // needles: VU ballistics, about 300 ms to settle, the two channels not quite together
    for (let i = 0; i < 2; i++) {
      const want = Math.min(1.05, p.level * (i ? 0.94 : 1) * (0.92 + Math.random() * 0.12));
      this.vu[i] += (want - this.vu[i]) * Math.min(1, dt * 9);
      this.needles[i].rotation.z = Math.max(-0.8, Math.min(0.8, 0.8 - this.vu[i] * 1.6));
    }
    for (const l of this.lamps.values()) {
      l.k += ((l.on ? 1 : 0) - l.k) * Math.min(1, dt * 14);
      l.m.emissiveIntensity = 0.04 + l.k * 2.2;
    }
    for (const [id, k] of this.press) {
      const kg = this.keys.get(id);
      const nk = Math.max(0, k - dt * 5);
      if (kg) kg.position.z = FACE + 0.01 - Math.sin(Math.min(1, nk) * Math.PI) * 0.003;
      if (nk <= 0) this.press.delete(id);
      else this.press.set(id, nk);
    }
    for (const b of this.boxes.values()) {
      b.out += (b.want - b.out) * Math.min(1, dt * 8);
      b.m.position.z = 0.045 + b.out * 0.2;
    }
    if (p.timer !== this.lcdText) {
      this.lcdText = p.timer;
      this.lcdMat.map?.dispose();
      this.lcdMat.map = lcd(p.timer);
      this.lcdMat.needsUpdate = true;
    }
  }

  /** The tape's straight runs, from where the packs are now. */
  private lay() {
    const on = this.loaded && !this.flight;
    for (const t of this.tape) t.visible = on;
    if (!on) return;
    const z = TAPE_Z;
    const L = this.supply.r, R = this.takeup.r;
    const pts: [THREE.Vector2, THREE.Vector2][] = [
      [new THREE.Vector2(-SPIN_X - L, SPIN_Y), new THREE.Vector2(X(405) - 0.021, Y(580))],
      [new THREE.Vector2(X(405), Y(580) - 0.021), new THREE.Vector2(X(492), Y(590))],
      [new THREE.Vector2(X(827), Y(590)), new THREE.Vector2(X(900), Y(577) - 0.021)],
      [new THREE.Vector2(X(900) + 0.021, Y(577)), new THREE.Vector2(SPIN_X + R, SPIN_Y)],
    ];
    pts.forEach(([a, b], i) => {
      const m = this.tape[i];
      const d = b.clone().sub(a);
      m.scale.set(d.length(), 1, 1);
      m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, z);
      m.rotation.set(0, 0, Math.atan2(d.y, d.x));
    });
  }
}
