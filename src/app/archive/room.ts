/**
 * The archive stacks at real size (metres), built as a cutaway like the
 * library and the office: floor slab, back and left walls, louvre windows
 * high in the back wall.
 *
 * Walk in by the door on the left wall: the light switches and the card
 * index are by the door, the formal records (personnel, events, programs)
 * line the left wall in steel cabinets, two free-standing banks in the middle
 * hold the routine paperwork by region, the reading table sits under the
 * windows and the intake desk faces the door.
 *
 * Teak floor, teak panelling to shoulder height, a brass picture rail;
 * brass-and-opal-glass pendants in four rows, one switch each.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  INK, KU, DIN, DINB, RED, clockFace, contactShadow, drawerCard, envelopeTops, fileTab, hygroFace, ledgerSpread, louvreLight, mapSheet, panelling, plate, rng, runner, sheet, teakFloor, windowView, woodTex,
} from './textures';

export const AR = { x0: -5.6, x1: 5.6, z0: -3.6, z1: 3.6, h: 3.4, wall: 0.22, slab: 0.24 };
const CAB = { w: 0.47, d: 0.62, h: 1.32, n: 4 };
const DADO = 1.6;
/** How far a drawer comes out when it is pulled. */
const DRAWER_OUT = 0.5;
export const WINDOWS = [-2.4, 0.0, 2.4, 4.5];
const WINX = WINDOWS;

/** One row of pendants per switch by the door. */
export const ROWS = [
  { en: 'Door and index', zh: '门口和索引卡' },
  { en: 'Formal records', zh: '正式档案' },
  { en: 'Routine paperwork', zh: '例行文件' },
  { en: 'Reading table and desk', zh: '阅档桌和入库台' },
] as const;

export interface StacksCategory {
  id: string;
  zh: string;
  en: string;
  code: string;
  /** "P-0001 — P-0003", or empty. */
  range: string;
}

export interface Pendant {
  light: THREE.SpotLight;
  fill: THREE.PointLight;
  bulb: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  row: number;
  at: THREE.Vector3;
}

/**
 * An examination lamp: a daylight tube at a reading place. The Records Office
 * reads its higher clearances under it, because erasures and scraped-out
 * figures only show in cold light; a lower clearance makes do with the warm
 * lamps. `place` is 'cabinet' (one over each group of formal cabinets) or
 * 'table'.
 */
export interface ExamLamp {
  light: THREE.SpotLight;
  tube: THREE.MeshStandardMaterial;
  place: 'cabinet' | 'table';
  ci: number;
  /** The cold haze round a lit tube, so it reads as on from any side. */
  glow: THREE.SpriteMaterial;
  /** How strong the tube is for how near it hangs to the page: the table's is a hand's breadth away. */
  gain: number;
}

let haze: THREE.Texture | null = null;
/** A soft bar of light, white in the middle, gone at the edges. */
function hazeTexture() {
  if (haze) return haze;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 16, 2, 64, 16, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(225,235,255,.45)');
  g.addColorStop(1, 'rgba(225,235,255,0)');
  x.fillStyle = g;
  x.scale(1, 0.25);
  x.fillRect(0, 0, 128, 128);
  haze = new THREE.CanvasTexture(c);
  haze.colorSpace = THREE.SRGBColorSpace;
  return haze;
}

export interface DeskLamp {
  light: THREE.SpotLight;
  inner: THREE.MeshStandardMaterial;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });

let roundMap: THREE.Texture | null = null;
/** A round soft glow, white in the middle, gone at the edge: the halo round a lit bulb. */
function roundGlow() {
  if (roundMap) return roundMap;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  roundMap = new THREE.CanvasTexture(c);
  return roundMap;
}

/** A folder lying on the reading table, and where it is going. */
let blobMap: THREE.Texture | null = null;
/** A soft dark patch, for the shadow where a folder lies on the blotter. */
function blobTexture() {
  if (blobMap) return blobMap;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 14, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  blobMap = new THREE.CanvasTexture(c);
  return blobMap;
}

interface TableFile {
  g: THREE.Group;
  /** The sheet lying in it, which the page in the DOM is laid over when it is read. */
  leaf: THREE.Mesh;
  /** Its size now and where it is headed: the file opened to read is a little larger than one lying shut. */
  s: number;
  toS: number;
  /** The soft shadow it lays on the blotter. */
  blob: THREE.Mesh;
  flap: THREE.Group;
  hit: THREE.Mesh;
  map: THREE.Texture;
  slot: number;
  to: THREE.Vector3;
  toRot: number;
  open: number;
  toOpen: number;
  fresh: boolean;
  carry?: { from: THREE.Vector3; rot: number; t: number };
}
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class StacksRoom {
  readonly group = new THREE.Group();
  readonly pendants: Pendant[] = [];
  readonly desks: DeskLamp[] = [];
  readonly exams: ExamLamp[] = [];
  readonly rockers: THREE.Mesh[] = [];
  /** Invisible boxes the pointer can find: userData says what each one is. */
  readonly hits: THREE.Object3D[] = [];
  /** Where each formal group of cabinets stands, for the camera. */
  readonly catCentre: THREE.Vector3[] = [];
  /** The street lamp outside: sodium, orange, as every lamp-post on the island in 1999. */
  readonly street = new THREE.SpotLight('#ffb35c', 0, 14, 0.5, 0.8, 1.2);
  /** Moonlight through the louvres, on the nights the moon is up and the sky is clear. */
  readonly moon = new THREE.DirectionalLight('#c3d0f2', 0);
  /** The formal cabinets, by category: each group's cabinets, door end first. */
  readonly formalCabs: THREE.Group[][] = [];
  /** Files laid on the reading table sit in here. */
  readonly tableTop = new THREE.Group();
  readonly pictureLight = new THREE.SpotLight('#ffd9a8', 0, 2.2, 0.9, 0.7, 1.4);
  readonly paperShadow: THREE.MeshBasicMaterial;
  readonly sunPatches: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  readonly exitMat: THREE.MeshStandardMaterial;
  readonly ledMat: THREE.MeshStandardMaterial;

  private M = {
    steel: std({ color: '#8f948a', metalness: 0.4, roughness: 0.4 }),
    steelDark: std({ color: '#5f625f', metalness: 0.5, roughness: 0.45 }),
    chrome: std({ color: '#d9dad6', metalness: 0.9, roughness: 0.22 }),
    brass: std({ color: '#b08a45', metalness: 0.85, roughness: 0.3 }),
    poche: std({ color: '#2b2723', roughness: 0.85 }),
    wall: std({ color: '#d3c9b3', roughness: 0.95 }),
    skirting: std({ color: '#2e1d12', roughness: 0.6 }),
    cream: std({ color: '#efe9da', roughness: 0.5 }),
    kraft: std({ color: '#c29d68', roughness: 0.9 }),
    kraftD: std({ color: '#a8844f', roughness: 0.95 }),
    manila: std({ color: '#d8c79c', roughness: 0.9 }),
    enamelW: std({ color: '#f2efe6', roughness: 0.3, metalness: 0.1 }),
    enamelG: std({ color: '#5d7a66', roughness: 0.32, metalness: 0.15 }),
    glass: std({ color: '#dbe5e8', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.35 }),
    black: std({ color: '#22201d', roughness: 0.5 }),
    leaf: std({ color: '#4d6b3a', roughness: 0.7, side: THREE.DoubleSide }),
    pot: std({ color: '#a8583a', roughness: 0.8 }),
    rubber: std({ color: '#2a2a28', roughness: 0.9 }),
    winBack: std({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.7 }),
    wood: std({ map: woodTex('#6e4b2f', 4), roughness: 0.55 }),
    woodL: std({ map: woodTex('#9a7148', 9), roughness: 0.55 }),
    counterTop: std({ map: woodTex('#4b3424', 2), roughness: 0.4 }),
    oak: std({ map: woodTex('#8a6340', 21), roughness: 0.5 }),
    envTops: std({ map: envelopeTops(), roughness: 0.9 }),
  };
  private rb = new Map<string, RoundedBoxGeometry>();
  private cards = new Map<string, THREE.MeshStandardMaterial>();
  private clockHands: { h: THREE.Object3D; m: THREE.Object3D; s: THREE.Object3D } | null = null;
  private fanBlades: THREE.Group | null = null;
  private hygro: THREE.MeshStandardMaterial | null = null;
  private wet: THREE.Object3D[] = [];
  private rockerOn: boolean[] = [false, false, false, false];
  private rainNow = false;
  private nightNow = false;

  constructor(cats: StacksCategory[], opts: { today: string }) {
    this.shell();
    WINX.forEach((x) => this.louvreWindow(x));
    this.formal(cats);
    this.routine();
    for (const [x, z, row] of [[-3.5, -1.9, 1], [-3.5, 0.6, 1], [-0.21, -1.95, 2], [-0.21, 0.4, 2], [3.0, -2.45, 3], [4.3, -2.45, 3], [3.6, 1.7, 3], [-3.9, 2.6, 0], [-2.4, 1.55, 0]] as const) this.pendant(x, z, row);
    this.door();
    // the reading table first: its two lamps are desks 0 and 1, the intake lamp is desk 2
    this.readingTable();
    this.counter(opts.today);
    this.cardIndex();
    this.odds();
    this.heavy();
    this.weatherBits();
    this.exitMat = this.group.getObjectByName('exit')!.userData.mat as THREE.MeshStandardMaterial;
    this.ledMat = this.group.getObjectByName('led')!.userData.mat as THREE.MeshStandardMaterial;

    this.paperShadow = new THREE.MeshBasicMaterial({ map: contactShadow(), color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry((AR.x1 - AR.x0) * 1.45, (AR.z1 - AR.z0) * 1.5), this.paperShadow);
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(0.6, -AR.slab - 0.01, 0.6);
    this.group.add(paper);

    // the street lamp outside, through the louvres at night
    this.street.position.set(1, 3.0, AR.z0 - 2.5);
    this.street.target.position.set(1, 0, 0.5);
    this.group.add(this.street, this.street.target);
    this.moon.position.set(0.5, 8, AR.z0 - 6);
    this.moon.target.position.set(1.2, 0, 0.6);
    this.group.add(this.moon, this.moon.target);
  }

  /* ---------------- helpers ---------------- */
  private box(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, cast = true) {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    p.add(m);
    return m;
  }

  private rbox(p: THREE.Object3D, w: number, h: number, d: number, r: number, x: number, y: number, z: number, mat: THREE.Material, cast = true) {
    const k = [w, h, d, r].join();
    if (!this.rb.has(k)) this.rb.set(k, new RoundedBoxGeometry(w, h, d, 3, r));
    const m = new THREE.Mesh(this.rb.get(k)!, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    p.add(m);
    return m;
  }

  private cyl(p: THREE.Object3D, rt: number, rbot: number, h: number, x: number, y: number, z: number, mat: THREE.Material, seg = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbot, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    p.add(m);
    return m;
  }

  private quad(p: THREE.Object3D, w: number, h: number, map: THREE.Texture, x: number, y: number, z: number, ry = 0, rx = 0, rough = 0.85) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map, roughness: rough }));
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    m.receiveShadow = true;
    p.add(m);
    return m;
  }

  private unhit(o: THREE.Object3D) {
    const i = this.hits.indexOf(o);
    if (i >= 0) this.hits.splice(i, 1);
  }

  /** An invisible box the pointer can hit. */
  private hit(data: Record<string, unknown>, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    Object.assign(m.userData, data);
    this.group.add(m);
    this.hits.push(m);
    return m;
  }

  /* ---------------- floor and walls ---------------- */
  private shell() {
    const { x0, x1, z0, z1, h, wall, slab } = AR;
    const M = this.M;
    this.box(this.group, x1 - x0 + wall, slab, z1 - z0 + wall, -wall / 2, -slab / 2, -wall / 2, M.poche);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({ map: teakFloor([3.2, 2.1]), roughness: 0.42 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    floor.receiveShadow = true;
    this.group.add(floor);
    const dado = panelling();
    for (const alongX of [true, false]) {
      const L = alongX ? x1 - x0 : z1 - z0;
      const g = new THREE.Group();
      if (alongX) g.position.set(0, 0, z0 - wall / 2);
      else {
        g.position.set(x0 - wall / 2, 0, 0);
        g.rotation.y = Math.PI / 2;
      }
      this.group.add(g);
      const off = alongX ? -wall / 2 : wall / 2;
      const map = dado.clone();
      map.repeat.set(L / 1.6, 1);
      map.needsUpdate = true;
      this.box(g, L + wall, DADO, wall, off, DADO / 2, 0, std({ map, roughness: 0.55 }));
      this.box(g, L + wall, h - DADO, wall, off, DADO + (h - DADO) / 2, 0, M.wall);
      this.box(g, L + wall, 0.05, wall + 0.04, off, h + 0.025, 0, M.poche);
      this.box(g, L, 0.06, 0.05, 0, DADO, wall / 2 + 0.02, M.wood, false); // panelling cap
      this.box(g, L, 0.025, 0.025, 0, 2.35, wall / 2 + 0.012, M.brass, false); // picture rail
      this.box(g, L, 0.1, 0.02, 0, 0.05, wall / 2 + 0.01, M.skirting, false);
    }
  }

  /** Steel-framed louvre window high in the back wall, with a cream sill. */
  private louvreWindow(x: number) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, 2.45, AR.z0 + 0.005);
    this.group.add(g);
    const W = 1.5, H = 0.9;
    this.box(g, W + 0.12, H + 0.12, 0.04, 0, 0, -0.01, M.winBack, false);
    for (const sx of [-1, 1]) this.box(g, 0.05, H + 0.1, 0.06, sx * (W / 2 + 0.03), 0, 0.03, M.steelDark);
    this.box(g, W + 0.12, 0.05, 0.06, 0, H / 2 + 0.03, 0.03, M.steelDark);
    this.box(g, 0.04, H, 0.05, 0, 0, 0.03, M.steelDark);
    for (let i = 0; i < 8; i++) {
      const b = this.box(g, W / 2 - 0.05, 0.1, 0.008, -W / 4, -H / 2 + 0.07 + i * 0.108, 0.04, M.glass, false);
      b.rotation.x = -0.5;
      const b2 = b.clone();
      b2.position.x = W / 4;
      g.add(b2);
    }
    for (let i = 0; i < 6; i++) this.box(g, 0.018, H, 0.018, -W / 2 + 0.12 + (i * (W - 0.24)) / 5, 0, 0.09, M.steelDark);
    this.box(g, W + 0.3, 0.05, 0.16, 0, -H / 2 - 0.08, 0.08, M.cream);
  }

  /* ---------------- filing cabinets ---------------- */
  private card(zh: string, en: string, sub: string) {
    const k = zh + en + sub;
    if (!this.cards.has(k)) this.cards.set(k, std({ map: drawerCard(zh, en, sub), roughness: 0.9 }));
    return this.cards.get(k)!;
  }

  private cabinet(x: number, z: number, ry: number, cat: (i: number) => [string, string, string], pulls: number[] = [], top?: (g: THREE.Group, h: number) => void) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.group.add(g);
    const { w, d, h, n } = CAB;
    this.rbox(g, w, h - 0.05, d, 0.012, 0, 0.05 + (h - 0.05) / 2, -d / 2, M.steel);
    this.box(g, w - 0.04, 0.05, d - 0.06, 0, 0.025, -d / 2, M.steelDark);
    const dh = (h - 0.08) / n;
    const drawers: THREE.Group[] = [];
    g.userData.drawers = drawers;
    for (let i = 0; i < n; i++) {
      const pull = pulls[i] || 0;
      const dg = new THREE.Group();
      dg.position.set(0, 0.08 + i * dh, pull);
      dg.userData.dh = dh;
      g.add(dg);
      drawers.push(dg);
      this.rbox(dg, w - 0.03, dh - 0.016, 0.022, 0.006, 0, dh / 2, 0.011, M.steel);
      this.box(dg, 0.16, 0.014, 0.016, 0, dh * 0.42, 0.034, M.chrome);
      this.box(dg, 0.11, 0.064, 0.006, 0, dh * 0.72, 0.024, M.brass, false);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.096, 0.05), this.card(...cat(i)));
      card.position.set(0, dh * 0.72, 0.028);
      dg.add(card);
      if (pull > 0) {
        const L = Math.min(pull + 0.02, d - 0.05);
        this.box(dg, w - 0.06, 0.008, L, 0, 0.012, -L / 2, M.steelDark);
        for (const sx of [-1, 1]) this.box(dg, 0.008, dh * 0.8, L, sx * (w / 2 - 0.035), dh * 0.4, -L / 2, M.steel);
        this.box(dg, w - 0.08, 0.004, L - 0.03, 0, dh * 0.86, -L / 2 - 0.01, M.envTops, false);
        this.box(dg, w - 0.08, dh * 0.84, L - 0.03, 0, dh * 0.43, -L / 2 - 0.01, M.kraft, false);
        this.box(dg, w - 0.07, 0.03, 0.003, 0, dh * 0.86 + 0.015, -0.12, M.manila, false);
      }
    }
    top?.(g, h);
    return g;
  }

  /** 01 · the formal records along the left wall, one group per category. */
  private formal(cats: StacksCategory[]) {
    const M = this.M;
    const COUNTS = [3, 4, 2];
    let cz = -3.32;
    cats.forEach((c, ci) => {
      const z0 = cz;
      const n = COUNTS[ci] ?? 2;
      for (let k = 0; k < n; k++) {
        // the top drawer of the first cabinet in each group is the category's drawer: Drawer 01, 02, 03
        const label = (i: number): [string, string, string] => (k === 0 && i === CAB.n - 1 ? [c.zh, c.en, `DRAWER ${String(ci + 1).padStart(2, '0')} · ${c.code}`] : [c.zh, c.en, `${c.code} · ${String(k + 1).padStart(2, '0')}-${4 - i}`]);
        const cab = this.cabinet(AR.x0 + 0.03 + CAB.d, cz + CAB.w / 2, Math.PI / 2, label, [], (g, h) => {
          if (ci === 0 && k === 2) {
            // a money plant on top
            this.cyl(g, 0.07, 0.055, 0.12, 0, h + 0.06, -0.3, M.pot);
            for (let l = 0; l < 9; l++) {
              const lf = new THREE.Mesh(new THREE.CircleGeometry(0.045, 10), M.leaf);
              lf.position.set(Math.cos(l * 2.3) * 0.08, h + 0.12 - l * 0.04, -0.3 + Math.sin(l * 2.3) * 0.08 + (l > 4 ? 0.12 : 0));
              lf.rotation.set(-0.6 + l * 0.2, l, 0);
              lf.castShadow = true;
              g.add(lf);
            }
          }
          if (ci === 1 && k === 0) {
            this.rbox(g, 0.36, 0.1, 0.26, 0.004, 0, h + 0.05, -0.3, M.kraftD);
            this.rbox(g, 0.34, 0.1, 0.25, 0.004, 0.01, h + 0.15, -0.31, M.kraft);
          }
          if (ci === 2 && k === 1) {
            this.cyl(g, 0.04, 0.05, 0.03, 0.1, h + 0.015, -0.2, M.brass);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 8, 0, 7, 0, 1.5), M.chrome);
            dome.position.set(0.1, h + 0.03, -0.2);
            g.add(dome);
          }
        });
        (this.formalCabs[ci] ??= []).push(cab);
        cz += CAB.w + 0.004;
      }
      const mid = (z0 + cz) / 2;
      const sign = plate([[`700 64px ${KU}`, c.zh, 28, 82], [`600 28px ${DIN}`, c.en.toUpperCase(), 160, 80], [`600 22px ${DIN}`, c.range || '—', 162, 112, '#c9c1ad']], 512, 140, '#26302a', '#efe8d6', '#c9c1ad');
      this.rbox(this.group, 0.62, 0.17, 0.015, 0.006, AR.x0 + 0.008, 1.62, mid, M.cream, false).rotation.y = Math.PI / 2;
      this.quad(this.group, 0.6, 0.164, sign, AR.x0 + 0.017, 1.62, mid, Math.PI / 2);
      const cx = AR.x0 + 0.03 + CAB.d / 2;
      this.catCentre.push(new THREE.Vector3(cx, 0.75, mid));
      this.examLamp(this.group, AR.x0 + 0.02, 2.02, mid, 'cabinet', ci);
      this.hit({ cat: ci, key: `cat:${c.id}` }, CAB.d + 0.2, CAB.h + 0.45, cz - z0, cx + 0.1, (CAB.h + 0.45) / 2, mid);
      cz += 0.32;
    });
  }

  /** 02 · routine paperwork: two free-standing banks, cabinets back to back, by region. */
  private routine() {
    const M = this.M;
    const REG: [string, string, string[]][] = [
      ['北部', 'NORTH', ['兀兰', '义顺', '三巴旺', '实里达']],
      ['东北部', 'NORTH-EAST', ['宏茂桥', '后港', '实龙岗', '盛港']],
      ['东部', 'EAST', ['勿洛', '淡滨尼', '白沙', '樟宜']],
      ['西部', 'WEST', ['裕廊东', '武吉巴督', '蔡厝港', '金文泰']],
    ];
    [-1.63, 1.21].forEach((bx, bi) => {
      for (const side of [1, -1]) {
        const reg = REG[bi * 2 + (side > 0 ? 1 : 0)];
        for (let k = 0; k < 4; k++) {
          const z = -2.95 + k * (CAB.w + 0.004) + CAB.w / 2;
          const pulls = bi === 0 && side > 0 && k === 1 ? [0, 0, 0, 0.34] : bi === 1 && side < 0 && k === 2 ? [0, 0, 0.22, 0] : bi === 1 && side > 0 && k === 3 ? [0, 0.15, 0, 0] : [];
          this.cabinet(bx + side * CAB.d, z, (side * Math.PI) / 2, (i) => [reg[2][k], reg[1], `1999 · Q${4 - i}`], pulls);
        }
      }
      const endZ = -2.95 + 4 * (CAB.w + 0.004) + 0.012;
      this.rbox(this.group, CAB.d * 2 + 0.04, CAB.h + 0.04, 0.022, 0.006, bx, (CAB.h + 0.04) / 2, endZ, std({ color: '#c9c6b8', roughness: 0.4, metalness: 0.1 }));
      const a = REG[bi * 2], b = REG[bi * 2 + 1];
      const ep = plate([[`700 46px ${KU}`, `${a[0]} · ${b[0]}`, 26, 72], [`600 24px ${DIN}`, `${a[1]} · ${b[1]}`, 28, 116], [`600 20px ${DIN}`, 'ROUTINE PAPERWORK 1999', 28, 146, '#c9c1ad']], 512, 170, '#26302a', '#efe8d6', '#c9c1ad');
      this.box(this.group, 0.8, 0.28, 0.008, bx, 1.05, endZ + 0.014, M.brass, false);
      this.quad(this.group, 0.76, 0.25, ep, bx, 1.05, endZ + 0.02);
      this.rbox(this.group, 0.36, 0.2, 0.01, 0.004, bx, 0.55, endZ + 0.016, M.cream, false);
      // a hanging enamel sign over the bank's front end, on two rods from the ceiling nobody sees
      const sg = new THREE.Group();
      sg.position.set(bx, 2.35, endZ - 0.2);
      this.group.add(sg);
      const t = plate([[`700 70px ${KU}`, b[0], 30, 92], [`600 28px ${DIN}`, b[1], 32, 132], [`700 30px ${KU}`, '署内例行', 330, 80, '#c9c1ad'], [`600 22px ${DIN}`, 'ROUTINE', 330, 112, '#c9c1ad']], 512, 160, '#26302a', '#efe8d6', '#c9c1ad');
      this.rbox(sg, 0.9, 0.3, 0.03, 0.01, 0, 0, 0, M.cream);
      this.quad(sg, 0.88, 0.275, t, 0, 0, 0.016);
      for (const sx of [-0.36, 0.36]) this.box(sg, 0.006, AR.h - 2.35, 0.006, sx, (AR.h - 2.35) / 2 + 0.15, 0, M.steelDark, false);
      const zMid = (-2.95 + endZ) / 2;
      this.hit({ bank: bi, key: `bank:${bi}` }, CAB.d * 2 + 0.1, CAB.h + 0.1, endZ + 2.95, bx, (CAB.h + 0.1) / 2, zMid);
    });
  }

  /* ---------------- lamps ---------------- */
  /** A Holophane pendant: brass gallery, ribbed opal glass bowl, brass rod. */
  private pendant(x: number, z: number, row: number, drop = 1.0) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, AR.h - drop, z);
    this.group.add(g);
    const gal = [[0.012, 0.3], [0.03, 0.29], [0.035, 0.25], [0.06, 0.22], [0.1, 0.2], [0.13, 0.17], [0.135, 0.15], [0.12, 0.14]].map(([r, y]) => new THREE.Vector2(r, y));
    const galM = new THREE.Mesh(new THREE.LatheGeometry(gal, 40), std({ color: '#9c7a3e', metalness: 0.85, roughness: 0.32, side: THREE.DoubleSide }));
    galM.castShadow = true;
    g.add(galM);
    const pts: THREE.Vector2[] = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = 0.13 + Math.sin(t * Math.PI * 0.55) * 0.08 + (i % 2 ? 0.006 : 0);
      pts.push(new THREE.Vector2(r * (1 - t * t * 0.95), 0.14 - Math.sin(t * Math.PI * 0.5) * 0.24));
    }
    const glass = std({ color: '#f3ead6', emissive: '#ffe2b0', emissiveIntensity: 0.15, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), glass));
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), M.brass);
    fin.position.y = -0.105;
    g.add(fin);
    const bulb = std({ color: '#fff', emissive: '#fff3d6', emissiveIntensity: 0.6 });
    const bm = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), bulb);
    bm.position.y = 0.06;
    g.add(bm);
    this.cyl(g, 0.008, 0.008, drop - 0.3, 0, 0.3 + (drop - 0.3) / 2, 0, M.brass, 8);
    this.cyl(g, 0.06, 0.07, 0.03, 0, drop, 0, M.brass);
    const light = new THREE.SpotLight('#ffdcaa', 0, 6.5, 0.78, 0.85, 1.9);
    light.position.y = 0.02;
    light.target.position.set(0, -3, 0);
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
    g.add(light, light.target);
    const fill = new THREE.PointLight('#ffe7c0', 0, 4, 1.8);
    g.add(fill);
    this.pendants.push({ light, fill, bulb, glass, row, at: new THREE.Vector3(x, AR.h - drop, z) });
  }

  /**
   * The examination lamp. Over a cabinet group it is a wall bracket that swings
   * a tube out over the pulled drawer; on the reading table it is a twin-tube
   * desk fitting on a weighted foot. Enamel housing, opal tube, a pull switch.
   */
  private examLamp(p: THREE.Object3D, x: number, y: number, z: number, place: 'cabinet' | 'table', ci: number) {
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    p.add(g);
    const enamel = std({ color: '#d9d6cc', roughness: 0.35, metalness: 0.15 });
    const tube = std({ color: '#f4f6f8', emissive: '#e6eeff', emissiveIntensity: 0.02, roughness: 0.2 });
    const light = new THREE.SpotLight('#d4e2ff', 0, 3.2, 0.95, 0.8, 1.6);
    let housing: THREE.Object3D;
    if (place === 'cabinet') {
      // wall plate, a jointed arm out over the drawers, the tube along the cabinets
      this.rbox(g, 0.02, 0.14, 0.09, 0.004, 0.01, 0, 0, M.steelDark);
      const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0, 0), new THREE.Vector3(0.3, 0.05, 0), new THREE.Vector3(0.62, -0.02, 0), new THREE.Vector3(0.78, -0.12, 0)]), 20, 0.009, 8), M.chrome);
      arm.castShadow = true;
      g.add(arm);
      this.cyl(g, 0.016, 0.016, 0.03, 0.3, 0.05, 0, M.steelDark, 12).rotation.x = Math.PI / 2;
      housing = new THREE.Group();
      housing.position.set(0.82, -0.16, 0);
      housing.rotation.z = -0.35;
      g.add(housing);
      light.position.set(0.86, -0.2, 0);
      light.target.position.set(0.95, -1.15, 0);
    } else {
      this.armLamp(g);
      return;
    }
    // the head: an enamel trough with an opal tube in it, end caps, a pull cord
    this.rbox(housing, 0.075, 0.045, 0.56, 0.01, 0, 0.012, 0, enamel);
    const t1 = this.cyl(housing, 0.013, 0.013, 0.5, 0, -0.012, 0, tube, 16);
    t1.rotation.x = Math.PI / 2;
    t1.castShadow = false;
    for (const sz of [-1, 1]) this.box(housing, 0.08, 0.05, 0.012, 0, 0.008, sz * 0.27, M.steelDark);
    this.box(housing, 0.002, 0.14, 0.002, 0.03, -0.07, 0.24, M.cream, false);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 6), M.black);
    bead.position.set(0.03, -0.14, 0.24);
    housing.add(bead);
    light.castShadow = false;
    g.add(light, light.target);
    const glow = new THREE.SpriteMaterial({ map: hazeTexture(), color: '#dfe9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Sprite(glow);
    halo.scale.set(0.78, 0.2, 1);
    // a little in front of the reflector and under it, where the tubes are bare
    halo.position.set(0, -0.03, 0);
    housing.add(halo);
    this.exams.push({ light, tube, place, ci, glow, gain: 1 });
  }

  /** The reading table's examination lamp: set by the aim of its arm, which follows the file. */
  private arm?: { yaw: THREE.Group; head: THREE.Group; g: THREE.Group; aim: THREE.Vector3; ready: boolean };

  /**
   * A clamp-on swing-arm lamp: clamp at the back edge of the table, a swivel,
   * two sprung arms and a green enamel shade over an opal bulb. The arm is
   * solved from where its head should hang (tickArm), so it swings to follow a
   * file carried across the room and settles over it on the blotter.
   */
  private armLamp(g: THREE.Group) {
    const M = this.M;
    const enamel = std({ color: '#4f6350', roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
    const bulb = std({ color: '#f4f6f8', emissive: '#e6eeff', emissiveIntensity: 0.02, roughness: 0.2 });
    // the clamp and the swivel post
    this.rbox(g, 0.085, 0.03, 0.07, 0.006, 0, 0.015, 0, M.steelDark);
    this.cyl(g, 0.007, 0.007, 0.06, 0, -0.01, 0.0, M.chrome, 10);
    this.rbox(g, 0.03, 0.012, 0.04, 0.004, 0, 0.036, 0, M.steelDark);
    this.cyl(g, 0.026, 0.026, 0.022, 0, 0.05, 0, M.brass, 20);
    this.cyl(g, 0.011, 0.011, 0.04, 0, 0.08, 0, M.chrome, 12);
    const yaw = new THREE.Group();
    yaw.position.set(0, 0.1, 0);
    g.add(yaw);
    const L1 = 0.3, L2 = 0.3;
    // one arm: a pair of rods between two brass knuckles
    const rods = (len: number, ang: number, at: THREE.Vector3) => {
      const a = new THREE.Group();
      a.position.copy(at);
      a.rotation.x = -ang;
      for (const sx of [-0.011, 0.011]) {
        const r = this.cyl(a, 0.0045, 0.0045, len, sx, 0, len / 2, M.chrome, 8);
        r.rotation.x = Math.PI / 2;
        r.castShadow = false;
      }
      for (const z of [0, len]) {
        const k = this.cyl(a, 0.015, 0.015, 0.05, 0, 0, z, M.brass, 14);
        k.rotation.z = Math.PI / 2;
        k.castShadow = false;
      }
      return a;
    };
    const lower = rods(L1, 0.9, new THREE.Vector3());
    const upper = rods(L2, 0.1, new THREE.Vector3());
    yaw.add(lower, upper);
    // the return spring along the lower arm
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 60; i++) pts.push(new THREE.Vector3(0, 0.024 + 0.011 * Math.sin(i * 1.1), 0.05 + (i / 60) * (L1 - 0.1)).add(new THREE.Vector3(0.011 * Math.cos(i * 1.1), 0, 0)));
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.0016, 5), M.chrome);
    spring.castShadow = false;
    lower.add(spring);
    // the head, hung from its joint: shade, rim, bulb, a click target
    const head = new THREE.Group();
    yaw.add(head);
    const prof = [[0.012, -0.02], [0.04, -0.028], [0.072, -0.06], [0.094, -0.108], [0.097, -0.13], [0.091, -0.13], [0.088, -0.108], [0.068, -0.062], [0.036, -0.036], [0.012, -0.032]];
    const shade = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 36), enamel);
    shade.castShadow = false;
    head.add(shade);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.0035, 8, 36), M.brass);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.13;
    head.add(rim);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), M.brass);
    head.add(knob);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.032, 16, 12), bulb);
    glass.position.y = -0.085;
    glass.castShadow = false;
    head.add(glass);
    const light = new THREE.SpotLight('#d4e2ff', 0, 3.2, 0.78, 0.7, 1.6);
    light.position.set(0, -0.09, 0);
    light.target.position.set(0, -1, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.04;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.006;
    head.add(light, light.target);
    const glow = new THREE.SpriteMaterial({ map: roundGlow(), color: '#dfe9ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Sprite(glow);
    halo.scale.set(0.3, 0.3, 1);
    halo.position.y = -0.1;
    head.add(halo);
    const hb = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    hb.scale.set(0.22, 0.17, 0.22);
    hb.position.y = -0.07;
    hb.userData = { exam: this.exams.length, key: `exam:${this.exams.length}` };
    head.add(hb);
    this.hits.push(hb);
    this.exams.push({ light, tube: bulb, place: 'table', ci: -1, glow, gain: 0.07 });
    this.arm = { yaw, head, g, aim: new THREE.Vector3(-0.55, 0.79, 0.11), ready: false };
    this.armParts = { lower, upper, L1, L2 };
  }

  private armParts?: { lower: THREE.Group; upper: THREE.Group; L1: number; L2: number };

  /** Swing the arm so its head hangs over `target` (a point in the table's frame); `snap` skips the swing. */
  private tickArm(dt: number, target: THREE.Vector3, snap: boolean) {
    const A = this.arm, P = this.armParts;
    if (!A || !P) return;
    this.tableTop.updateWorldMatrix(true, false);
    A.g.updateWorldMatrix(true, false);
    const want = A.g.worldToLocal(this.tableTop.localToWorld(target.clone()));
    if (snap || !A.ready) A.aim.copy(want);
    else A.aim.lerp(want, 1 - Math.exp(-dt * 4.5));
    A.ready = true;
    // where the joint of the head hangs: up and behind the paper, so the shade never covers it
    const jx = A.aim.x, jy = A.aim.y + 0.34 - 0.1, jz = A.aim.z - 0.26;
    const psi = Math.atan2(jx, jz);
    const r = Math.max(0.05, Math.hypot(jx, jz)), v = jy;
    const { L1, L2 } = P;
    const d = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.02, Math.hypot(r, v)));
    const a = Math.atan2(v, r) + Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const e = new THREE.Vector2(L1 * Math.cos(a), L1 * Math.sin(a));
    const hr = d * Math.cos(Math.atan2(v, r)), hv = d * Math.sin(Math.atan2(v, r));
    const b = Math.atan2(hv - e.y, hr - e.x);
    A.yaw.rotation.y = psi;
    P.lower.rotation.x = -a;
    P.upper.position.set(0, e.y, e.x);
    P.upper.rotation.x = -b;
    A.head.position.set(0, hv, hr);
    // the shade tips to look at the paper
    const to = new THREE.Vector3(0, A.aim.y + 0.02 - (A.yaw.position.y + hv), Math.hypot(A.aim.x, A.aim.z) - hr);
    A.head.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.normalize());
  }

  /** A brass desk lamp with an opal inside to its shade. */
  private deskLamp(p: THREE.Object3D, x: number, y: number, z: number, ry: number, index: number) {
    const M = this.M;
    const l = new THREE.Group();
    l.position.set(x, y, z);
    l.rotation.y = ry;
    p.add(l);
    this.cyl(l, 0.075, 0.085, 0.022, 0, 0.011, 0, M.brass);
    this.cyl(l, 0.008, 0.008, 0.42, 0, 0.23, 0, M.brass);
    this.box(l, 0.008, 0.008, 0.2, 0, 0.44, 0.09, M.brass);
    const pr = [[0.015, 0.09], [0.035, 0.085], [0.06, 0.05], [0.09, 0.0], [0.095, -0.004]].map(([r, yy]) => new THREE.Vector2(r, yy));
    const sh = new THREE.Mesh(new THREE.LatheGeometry(pr, 32), std({ color: '#a8843f', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }));
    sh.position.set(0, 0.36, 0.19);
    sh.castShadow = true;
    l.add(sh);
    const inner = std({ color: '#fff8e8', emissive: '#ffe9c0', emissiveIntensity: 0.5, side: THREE.BackSide });
    const im = new THREE.Mesh(new THREE.LatheGeometry(pr.map((v) => new THREE.Vector2(v.x * 0.95, v.y - 0.003)), 32), inner);
    im.position.copy(sh.position);
    l.add(im);
    // the pull chain, with a brass bead
    this.box(l, 0.002, 0.12, 0.002, 0.05, 0.3, 0.2, M.brass, false);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.brass);
    bead.position.set(0.05, 0.24, 0.2);
    l.add(bead);
    const sp = new THREE.SpotLight('#ffe2b0', 0, 2.5, 0.8, 0.6, 1.5);
    sp.position.set(0, 0.35, 0.19);
    sp.target.position.set(0, -0.8, 0.25);
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.bias = -0.0005;
    // the two brass lamps on the reading table sit close over the files: their shadows fall across the blotters
    if (index < 2) {
      sp.castShadow = true;
      sp.shadow.mapSize.set(512, 512);
      sp.shadow.camera.near = 0.05;
      sp.shadow.normalBias = 0.006;
    }
    l.add(sp, sp.target);
    this.desks.push({ light: sp, inner });
    // the lamp and its chain answer a click
    const hb = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    hb.scale.set(0.3, 0.55, 0.42);
    hb.position.set(0, 0.28, 0.12);
    hb.userData = { desk: index, key: `desk:${index}` };
    l.add(hb);
    this.hits.push(hb);
  }

  /* ---------------- the door, switches and the wall by it ---------------- */
  private door() {
    const M = this.M;
    const x0 = AR.x0;
    const door = new THREE.Group();
    door.position.set(x0 + 0.01, 0, 2.55);
    this.group.add(door);
    this.box(door, 0.06, 2.15, 1.0, 0, 1.075, 0, std({ color: '#5a6f60', roughness: 0.45 }));
    this.box(door, 0.08, 2.25, 0.07, 0.01, 1.125, -0.53, M.poche);
    this.box(door, 0.08, 2.25, 0.07, 0.01, 1.125, 0.53, M.poche);
    this.box(door, 0.08, 0.07, 1.13, 0.01, 2.22, 0, M.poche);
    this.box(door, 0.03, 0.5, 0.36, 0.035, 1.55, 0.05, std({ color: '#cdd8dc', roughness: 0.1, emissive: '#d6e0e3', emissiveIntensity: 0.3 }));
    this.cyl(door, 0.02, 0.02, 0.12, 0.08, 1.0, 0.38, M.brass).rotation.z = Math.PI / 2;
    // exit sign
    const exitT = plate([[`700 54px ${DINB}`, 'EXIT', 26, 70], [`700 46px ${KU}`, '出口', 160, 68]], 280, 100, '#2f7d4f', '#f4f1e6');
    this.rbox(this.group, 0.04, 0.13, 0.36, 0.01, x0 + 0.03, 2.5, 2.55, M.cream);
    const ex = this.quad(this.group, 0.34, 0.12, exitT, x0 + 0.052, 2.5, 2.55, Math.PI / 2, 0, 0.4);
    const exMat = ex.material as THREE.MeshStandardMaterial;
    exMat.emissive = new THREE.Color('#2f7d4f');
    exMat.emissiveMap = exitT;
    exMat.emissiveIntensity = 0.3;
    ex.name = 'exit';
    ex.userData.mat = exMat;
    // the switch plate: one rocker per row of lamps, right of the door
    const sw = new THREE.Group();
    sw.position.set(x0 + 0.012, 1.3, 3.32);
    sw.rotation.y = Math.PI / 2;
    this.group.add(sw);
    this.rbox(sw, 0.34, 0.14, 0.02, 0.008, 0, 0, 0, M.cream);
    const lab = plate([[`600 30px ${DIN}`, '1      2      3      4', 30, 34]], 340, 44, '#efe9da', INK);
    this.quad(sw, 0.3, 0.04, lab, 0, 0.09, 0.011);
    for (let i = 0; i < 4; i++) {
      const r = this.rbox(sw, 0.05, 0.08, 0.02, 0.006, -0.12 + i * 0.08, 0, 0.014, std({ color: '#f2eee2', roughness: 0.5 }));
      r.rotation.x = 0.25;
      this.rockers.push(r);
      const hb = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
      hb.scale.set(0.075, 0.13, 0.08);
      hb.position.set(-0.12 + i * 0.08, 0, 0.03);
      hb.userData = { rocker: i, key: `rocker:${i}` };
      sw.add(hb);
      this.hits.push(hb);
    }
    // the brass plaque above the switches
    const plaque = plate([[`700 54px ${KU}`, '霏微记录署 · 档案库', 40, 82], [`600 26px ${DIN}`, 'RECORDS OFFICE · ARCHIVE · EST. 1959', 42, 128], [`600 22px ${KU}`, '本库文件一律不得携出', 42, 168]], 640, 200, '#a8843f', '#2a1a10', '#2a1a10');
    const pq = this.quad(this.group, 0.62, 0.19, plaque, x0 + 0.02, 1.85, 3.32, Math.PI / 2, 0, 0.3);
    (pq.material as THREE.MeshStandardMaterial).metalness = 0.7;
    // extinguisher
    const fe = new THREE.Group();
    fe.position.set(x0 + 0.12, 0, 1.85);
    this.group.add(fe);
    const red = std({ color: '#b4302a', roughness: 0.35, metalness: 0.2 });
    this.cyl(fe, 0.075, 0.075, 0.5, 0, 0.35, 0, red);
    const feTop = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 10, 0, 7, 0, 1.57), red);
    feTop.position.y = 0.6;
    fe.add(feTop);
    this.cyl(fe, 0.02, 0.02, 0.06, 0, 0.67, 0, M.black);
    this.box(fe, 0.12, 0.015, 0.02, 0.04, 0.7, 0, M.black);
    this.box(this.group, 0.02, 0.3, 0.16, x0 + 0.01, 0.95, 1.85, M.cream, false);
    // coat stand with a furled umbrella
    const cs = new THREE.Group();
    cs.position.set(-4.45, 0, 3.35);
    this.group.add(cs);
    this.cyl(cs, 0.02, 0.025, 1.75, 0, 0.875, 0, M.wood);
    for (let a = 0; a < 3; a++) this.box(cs, 0.28, 0.025, 0.03, Math.cos(a * 2.1) * 0.12, 0.03, Math.sin(a * 2.1) * 0.12, M.wood).rotation.y = -a * 2.1;
    for (let a = 0; a < 4; a++) this.box(cs, 0.14, 0.018, 0.018, Math.cos(a * 1.57) * 0.06, 1.68, Math.sin(a * 1.57) * 0.06, M.wood).rotation.set(0, -a * 1.57, 0.5);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.8, 8), std({ color: '#26302a', roughness: 0.7 }));
    umb.position.set(0.1, 0.42, 0.1);
    umb.rotation.z = 0.12;
    umb.name = 'furled';
    cs.add(umb);
    // a runner mat inside the door
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 3.0), std({ map: runner(), roughness: 0.95 }));
    mat.rotation.x = -Math.PI / 2;
    mat.scale.set(0.9, 0.42, 1);
    mat.position.set(-4.75, 0.004, 2.55);
    mat.receiveShadow = true;
    this.group.add(mat);
    // wall clock above the corner
    const clockG = new THREE.Group();
    clockG.position.set(-4.45, 2.85, AR.z0 + 0.03);
    this.group.add(clockG);
    clockG.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 10, 40), M.black));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.165, 40), std({ map: clockFace(), roughness: 0.4 }));
    face.position.z = 0.005;
    clockG.add(face);
    const hand = (len: number, w: number, z: number, mat: THREE.Material) => {
      const pivot = new THREE.Group();
      pivot.position.z = z;
      clockG.add(pivot);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat);
      m.position.y = len / 2 - 0.02;
      pivot.add(m);
      return pivot;
    };
    const ink = new THREE.MeshBasicMaterial({ color: INK });
    this.clockHands = { h: hand(0.09, 0.012, 0.008, ink), m: hand(0.135, 0.008, 0.009, ink), s: hand(0.14, 0.003, 0.01, new THREE.MeshBasicMaterial({ color: RED })) };
  }

  /* ---------------- 04 · the intake desk, facing the door ----------------
   * A government counter of the 1990s: the visitors' side is a panelled
   * front with a ledge on top, where things are handed in; the clerk's
   * side is a desk at sitting height under that ledge, with a pedestal of
   * drawers, pigeonholes under the ledge and the clerk's tools laid out
   * for the clerk, not for the visitor. Local +z faces the door. */
  private counter(today: string) {
    const M = this.M;
    const ctr = new THREE.Group();
    ctr.position.set(3.9, 0, 1.7);
    ctr.rotation.y = -Math.PI / 2;
    this.group.add(ctr);
    const CL = 2.2, LEDGE = 1.06, DESK = 0.755;
    const [, mm, dd] = today.split('-');

    // the visitors' front: panelled, with a skirting and the ledge on top
    this.box(ctr, CL, LEDGE - 0.02, 0.035, 0, (LEDGE - 0.02) / 2, 0.26, M.wood);
    for (let p = 0; p < 5; p++) this.box(ctr, CL / 5 - 0.08, 0.7, 0.012, -CL / 2 + CL / 10 + (p * CL) / 5, 0.52, 0.283, M.woodL);
    this.box(ctr, CL, 0.08, 0.02, 0, 0.04, 0.285, M.skirting);
    this.rbox(ctr, CL + 0.06, 0.035, 0.34, 0.008, 0, LEDGE, 0.22, M.counterTop);
    // a brass edge strip along the ledge, worn bright where hands go
    this.box(ctr, CL + 0.06, 0.012, 0.012, 0, LEDGE - 0.004, 0.392, M.brass, false);
    // the end panels, down to the floor on both sides
    for (const sx of [-1, 1]) this.box(ctr, 0.03, LEDGE - 0.02, 0.72, sx * (CL / 2 - 0.015), (LEDGE - 0.02) / 2, -0.07, M.wood);
    // pigeonholes under the ledge, open to the clerk
    const ph = new THREE.Group();
    ph.position.set(0.3, DESK + 0.02, 0.16);
    ctr.add(ph);
    const PH = LEDGE - DESK - 0.06;
    this.box(ph, 1.3, 0.012, 0.16, 0, PH, 0, M.oak);
    for (let i = 0; i <= 6; i++) this.box(ph, 0.01, PH, 0.16, -0.65 + i * (1.3 / 6), PH / 2, 0, M.oak, false);
    this.box(ph, 1.3, 0.01, 0.16, 0, PH / 2, 0, M.oak, false);
    const prr = rng(Number(mm) * 31 + Number(dd));
    for (let i = 0; i < 6; i++)
      for (const row of [0, 1]) {
        const k = Math.floor(prr() * 4);
        for (let s = 0; s < k; s++) this.box(ph, 0.17, 0.006, 0.13, -0.65 + (i + 0.5) * (1.3 / 6), 0.008 + row * (PH / 2) + s * 0.007, 0.01, s % 2 ? M.cream : M.manila, false);
      }

    // the clerk's desk under the ledge
    this.rbox(ctr, CL - 0.06, 0.035, 0.6, 0.006, 0, DESK, -0.14, M.counterTop);
    // pedestal of three drawers on the left, pulls towards the clerk
    const ped = new THREE.Group();
    ped.position.set(-0.72, 0, -0.14);
    ctr.add(ped);
    this.box(ped, 0.44, DESK - 0.03, 0.56, 0, (DESK - 0.03) / 2, 0, M.wood);
    for (let d = 0; d < 3; d++) {
      const y = 0.13 + d * 0.22;
      this.rbox(ped, 0.4, 0.19, 0.02, 0.004, 0, y, -0.285, M.woodL);
      this.box(ped, 0.1, 0.014, 0.014, 0, y + 0.05, -0.3, M.brass, false);
      this.box(ped, 0.05, 0.022, 0.003, 0, y + 0.075, -0.297, M.cream, false);
    }
    // a modesty board across the knee-hole, set back
    this.box(ctr, CL - 0.56, 0.42, 0.015, 0.25, DESK - 0.24, 0.2, M.wood);

    const top = DESK + 0.018;

    // the accession register, open, turned to the clerk
    const book = new THREE.Group();
    book.position.set(0.05, top, -0.2);
    book.rotation.y = Math.PI + 0.06;
    ctr.add(book);
    this.rbox(book, 0.56, 0.014, 0.4, 0.004, 0, 0.007, 0, std({ color: '#2f3b33', roughness: 0.7 }));
    const spread = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.38, 16, 1), std({ map: ledgerSpread(today), roughness: 0.85 }));
    // the pages rise a little towards the spine
    const pos = spread.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.cos((pos.getX(i) / 0.27) * (Math.PI / 2)) * 0.012);
    spread.geometry.computeVertexNormals();
    spread.rotation.x = -Math.PI / 2;
    spread.position.y = 0.017;
    spread.receiveShadow = true;
    book.add(spread);
    // the ribbon marker and a pen laid in the gutter
    this.box(book, 0.006, 0.002, 0.24, 0.004, 0.026, 0.12, std({ color: '#8e2a22' }), false);
    const pen = new THREE.Group();
    pen.position.set(0.16, 0.03, 0.02);
    pen.rotation.y = 0.5;
    book.add(pen);
    this.cyl(pen, 0.0055, 0.0055, 0.12, 0, 0, 0, M.black, 12).rotation.x = Math.PI / 2;
    this.cyl(pen, 0.006, 0.006, 0.05, 0, 0, 0.07, M.black, 12).rotation.x = Math.PI / 2;
    this.cyl(pen, 0.0062, 0.0062, 0.006, 0, 0, 0.045, M.brass, 12).rotation.x = Math.PI / 2;
    this.box(pen, 0.0015, 0.004, 0.04, 0.006, 0.004, 0.065, M.chrome, false);

    // the date stamp: a band dater with a wooden knob, and its ink pad, open
    const ds = new THREE.Group();
    ds.position.set(0.5, top, -0.26);
    ctr.add(ds);
    this.rbox(ds, 0.075, 0.012, 0.05, 0.003, 0, 0.006, 0, M.black);
    for (const sx of [-1, 1]) this.box(ds, 0.006, 0.07, 0.04, sx * 0.034, 0.045, 0, M.steelDark);
    this.cyl(ds, 0.018, 0.018, 0.06, 0, 0.04, 0, M.steel, 16).rotation.z = Math.PI / 2;
    for (let b = 0; b < 4; b++) this.cyl(ds, 0.019, 0.019, 0.008, -0.022 + b * 0.015, 0.04, 0, M.black, 16).rotation.z = Math.PI / 2;
    this.box(ds, 0.068, 0.006, 0.006, 0, 0.083, 0, M.steelDark);
    this.cyl(ds, 0.004, 0.004, 0.03, 0, 0.1, 0, M.steel, 8);
    this.cyl(ds, 0.02, 0.016, 0.03, 0, 0.13, 0, M.oak, 16);
    const pad = new THREE.Group();
    pad.position.set(0.64, top, -0.12);
    pad.rotation.y = -0.3;
    ctr.add(pad);
    this.rbox(pad, 0.1, 0.014, 0.065, 0.004, 0, 0.007, 0, std({ color: '#3b3f44', metalness: 0.6, roughness: 0.4 }));
    this.box(pad, 0.088, 0.003, 0.053, 0, 0.015, 0, std({ color: '#7d1c18', roughness: 0.95 }), false);
    const lid = this.rbox(pad, 0.1, 0.008, 0.065, 0.003, 0, 0.004, 0.072, std({ color: '#3b3f44', metalness: 0.6, roughness: 0.4 }));
    lid.rotation.x = -0.12;
    this.box(pad, 0.07, 0.002, 0.04, 0, 0.0095, 0.072, M.cream, false);

    // the rubber stamps on their turntable rack, back of the desk: handles up
    // through a ring, the rubber dies hanging under it
    const sc = new THREE.Group();
    sc.position.set(0.58, top, 0.02);
    ctr.add(sc);
    this.cyl(sc, 0.085, 0.095, 0.018, 0, 0.009, 0, M.oak, 28);
    this.cyl(sc, 0.007, 0.007, 0.16, 0, 0.09, 0, M.chrome, 10);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.006, 8, 32), M.chrome);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    sc.add(ring);
    for (const a of [0, Math.PI / 2]) this.box(sc, 0.124, 0.004, 0.006, 0, 0.11, 0, M.chrome, false).rotation.y = a;
    for (let s = 0; s < 8; s++) {
      const a = (s * Math.PI) / 4 + 0.2;
      const x = Math.cos(a) * 0.062, z = Math.sin(a) * 0.062;
      // handle above the ring, with its knob
      this.cyl(sc, 0.008, 0.01, 0.05, x, 0.135, z, s % 3 ? M.woodL : M.wood, 10);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), s % 3 ? M.woodL : M.wood);
      knob.position.set(x, 0.165, z);
      knob.castShadow = true;
      sc.add(knob);
      // mount and rubber below it
      this.box(sc, 0.03, 0.012, 0.022, x, 0.098, z, M.wood, false).rotation.y = -a;
      this.box(sc, 0.028, 0.005, 0.02, x, 0.089, z, std({ color: '#3a2e2a', roughness: 0.95 }), false).rotation.y = -a;
    }
    // one stamp out of the rack, lying where it was last used
    const st = new THREE.Group();
    st.position.set(0.3, top + 0.012, -0.32);
    st.rotation.set(0, 0.8, Math.PI / 2);
    ctr.add(st);
    this.cyl(st, 0.0085, 0.011, 0.055, 0, 0.02, 0, M.woodL, 10);
    this.box(st, 0.028, 0.008, 0.02, 0, -0.012, 0, M.black, false);

    // the telephone: dial to the clerk, handset in its cradle, the cord behind
    const tel = new THREE.Group();
    tel.position.set(0.86, top, -0.27);
    tel.rotation.y = Math.PI - 0.25;
    ctr.add(tel);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, 0.085, 4, 1), M.black);
    shell.scale.set(1, 1, 0.95);
    shell.rotation.y = Math.PI / 4;
    shell.position.y = 0.043;
    shell.castShadow = shell.receiveShadow = true;
    tel.add(shell);
    const dial = new THREE.Group();
    dial.position.set(0, 0.07, 0.06);
    dial.rotation.x = 0.55;
    tel.add(dial);
    this.cyl(dial, 0.045, 0.045, 0.004, 0, 0, 0, M.enamelW, 28).rotation.x = Math.PI / 2;
    this.cyl(dial, 0.042, 0.042, 0.006, 0, 0, 0.004, std({ color: '#e7e3d6', roughness: 0.15, transparent: true, opacity: 0.55 }), 28).rotation.x = Math.PI / 2;
    for (let h = 0; h < 10; h++) {
      const a = -0.9 - (h * 2 * Math.PI * 0.8) / 10;
      this.cyl(dial, 0.006, 0.006, 0.008, Math.cos(a) * 0.031, Math.sin(a) * 0.031, 0.006, M.black, 10).rotation.x = Math.PI / 2;
    }
    this.cyl(dial, 0.012, 0.012, 0.009, 0, 0, 0.006, M.cream, 16).rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) this.rbox(tel, 0.03, 0.03, 0.035, 0.008, sx * 0.075, 0.098, -0.02, M.black);
    const hs = new THREE.Group();
    hs.position.set(0, 0.125, -0.02);
    tel.add(hs);
    this.rbox(hs, 0.13, 0.022, 0.03, 0.01, 0, 0, 0, M.black);
    for (const sx of [-1, 1]) {
      const cup = this.cyl(hs, 0.026, 0.02, 0.03, sx * 0.085, -0.008, 0, M.black, 18);
      cup.rotation.z = sx * 0.25;
    }
    const cord = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => {
        const u = i / 39;
        return new THREE.Vector3(-0.09 - u * 0.05 + Math.cos(u * 60) * 0.008, 0.11 - u * 0.1 + Math.sin(u * 60) * 0.008, -0.02 - u * 0.12);
      })), 120, 0.0035, 6),
      M.black,
    );
    tel.add(cord);

    // the clerk's lamp: green enamel gooseneck at the back corner, over the register
    const cl = new THREE.Group();
    cl.position.set(-0.32, top, -0.01);
    ctr.add(cl);
    this.cyl(cl, 0.07, 0.08, 0.025, 0, 0.012, 0, M.enamelG, 28);
    this.cyl(cl, 0.012, 0.012, 0.02, 0.04, 0.03, 0, M.chrome, 10);
    const neckPts = [new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.24, -0.02), new THREE.Vector3(0.06, 0.38, -0.1), new THREE.Vector3(0.16, 0.4, -0.2)];
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(neckPts), 32, 0.008, 8), M.chrome);
    neck.castShadow = true;
    cl.add(neck);
    const shadeP = [[0.015, 0.07], [0.03, 0.065], [0.05, 0.04], [0.08, 0.0], [0.085, -0.005]].map(([r, y]) => new THREE.Vector2(r, y));
    const shade = new THREE.Mesh(new THREE.LatheGeometry(shadeP, 32), std({ color: '#5d7a66', roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide }));
    shade.position.set(0.16, 0.38, -0.2);
    shade.rotation.set(0.45, 0, 0.25);
    shade.castShadow = true;
    cl.add(shade);
    const inner = std({ color: '#fff8e8', emissive: '#ffe9c0', emissiveIntensity: 0.3, side: THREE.BackSide });
    const im = new THREE.Mesh(new THREE.LatheGeometry(shadeP.map((v) => new THREE.Vector2(v.x * 0.94, v.y - 0.003)), 32), inner);
    im.position.copy(shade.position);
    im.rotation.copy(shade.rotation);
    cl.add(im);
    const sp = new THREE.SpotLight('#ffe2b0', 0, 2.2, 0.85, 0.6, 1.5);
    sp.position.set(0.16, 0.37, -0.2);
    sp.target.position.set(0.4, -0.2, -0.22);
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    sp.shadow.bias = -0.0005;
    cl.add(sp, sp.target);
    this.desks.push({ light: sp, inner });
    const lh = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    lh.scale.set(0.3, 0.5, 0.4);
    lh.position.set(0.08, 0.25, -0.1);
    lh.userData = { desk: this.desks.length - 1, key: `desk:${this.desks.length - 1}` };
    cl.add(lh);
    this.hits.push(lh);

    // the to-file tray: a wire basket on the desk, waiting for the round to the drawers
    const wt = new THREE.Group();
    wt.position.set(-0.75, top, 0.02);
    ctr.add(wt);
    this.box(wt, 0.34, 0.004, 0.26, 0, 0.004, 0, M.steelDark, false);
    for (const sx of [-1, 1]) this.box(wt, 0.004, 0.06, 0.26, sx * 0.17, 0.03, 0, M.steelDark, false);
    for (const sz of [-1, 1]) this.box(wt, 0.34, 0.06, 0.004, 0, 0.03, sz * 0.13, M.steelDark, false);
    for (let i = 0; i < 4; i++) {
      const e = this.rbox(wt, 0.3, 0.012, 0.22, 0.002, (i % 2) * 0.01, 0.012 + i * 0.013, 0, i % 2 ? M.manila : M.kraft);
      e.rotation.y = ((i % 3) - 1) * 0.04;
    }
    this.quad(wt, 0.16, 0.05, plate([[`700 40px ${KU}`, '待归档', 14, 52], [`600 18px ${DIN}`, 'TO FILE', 150, 50]], 256, 80, '#efe9da', INK, INK), 0, 0.045, -0.133, Math.PI);

    // the receipt spike with the morning's slips on it, and a pad of accession slips
    const spk = new THREE.Group();
    spk.position.set(-0.3, top, -0.32);
    ctr.add(spk);
    this.cyl(spk, 0.035, 0.04, 0.012, 0, 0.006, 0, M.black, 20);
    this.cyl(spk, 0.002, 0.0025, 0.13, 0, 0.075, 0, M.chrome, 6);
    for (let i = 0; i < 6; i++) {
      const sl = this.box(spk, 0.075, 0.0015, 0.05, 0, 0.016 + i * 0.006, 0, i % 2 ? M.cream : std({ color: '#f1d7a8' }), false);
      sl.rotation.y = i * 0.5;
    }
    this.rbox(ctr, 0.15, 0.02, 0.1, 0.003, -0.48, top + 0.01, -0.3, M.cream);
    this.box(ctr, 0.15, 0.004, 0.1, -0.48, top + 0.021, -0.3, std({ color: '#2f3c62', roughness: 0.6 }), false);

    // a mug of something gone cold
    const mug = new THREE.Group();
    mug.position.set(-0.98, top, -0.28);
    ctr.add(mug);
    const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.034, 0.09, 24, 1, true), std({ color: '#e9e4d6', roughness: 0.35, side: THREE.DoubleSide }));
    mugBody.position.y = 0.045;
    mugBody.castShadow = true;
    mug.add(mugBody);
    this.cyl(mug, 0.034, 0.034, 0.004, 0, 0.002, 0, M.enamelW, 24);
    this.cyl(mug, 0.035, 0.035, 0.002, 0, 0.07, 0, std({ color: '#5a3a22', roughness: 0.2 }), 24);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 16, Math.PI), std({ color: '#e9e4d6', roughness: 0.35 }));
    handle.position.set(0.04, 0.045, 0);
    handle.rotation.z = -Math.PI / 2;
    mug.add(handle);

    // on the ledge, for the visitor: the bell, the in-tray, a pen on a chain, the sign
    const L = LEDGE + 0.018;
    this.cyl(ctr, 0.045, 0.055, 0.015, 0.35, L + 0.008, 0.26, M.black, 24);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12, 0, Math.PI * 2, 0, 1.55), M.chrome);
    bell.position.set(0.35, L + 0.015, 0.26);
    bell.castShadow = true;
    ctr.add(bell);
    this.cyl(ctr, 0.006, 0.006, 0.02, 0.35, L + 0.065, 0.26, M.chrome, 8);
    this.cyl(ctr, 0.01, 0.01, 0.006, 0.35, L + 0.077, 0.26, M.chrome, 12);
    const tray = new THREE.Group();
    tray.position.set(-0.55, L, 0.22);
    ctr.add(tray);
    this.rbox(tray, 0.38, 0.05, 0.28, 0.005, 0, 0.025, 0, M.steelDark);
    for (let i = 0; i < 7; i++) {
      const e = this.rbox(tray, 0.3, 0.012, 0.22, 0.002, (i % 2) * 0.01, 0.055 + i * 0.013, ((i * 7) % 3) * 0.005 - 0.005, i % 3 ? M.kraft : M.kraftD);
      e.rotation.y = ((i % 3) - 1) * 0.05;
    }
    this.quad(tray, 0.24, 0.1, plate([[`700 44px ${KU}`, '今日入库', 18, 58], [`600 20px ${DIN}`, `RECEIVED · ${dd}.${mm}.99`, 20, 90]], 256, 108, '#efe9da', INK, INK), 0, 0.03, 0.142, 0, 0);
    const hb = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    hb.scale.set(0.42, 0.3, 0.4);
    hb.position.set(0, 0.1, 0);
    hb.userData = { tray: true, key: 'tray' };
    tray.add(hb);
    this.hits.push(hb);
    // the chained pen in its brass holder
    this.cyl(ctr, 0.025, 0.03, 0.012, 0.75, L + 0.006, 0.28, M.brass, 20);
    const cp = this.cyl(ctr, 0.0055, 0.0055, 0.13, 0.75, L + 0.06, 0.28, M.black, 10);
    cp.rotation.z = 0.35;
    const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.75, L + 0.012, 0.28), new THREE.Vector3(0.7, L + 0.004, 0.33), new THREE.Vector3(0.62, L + 0.004, 0.31), new THREE.Vector3(0.6, L + 0.02, 0.27), new THREE.Vector3(0.73, L + 0.12, 0.28)]), 40, 0.0012, 4), M.chrome);
    ctr.add(chain);
    // the sign, standing on the ledge, to the visitor
    const sign = new THREE.Group();
    sign.position.set(0, L, 0.3);
    ctr.add(sign);
    this.box(sign, 0.3, 0.012, 0.05, 0, 0.006, 0, M.brass);
    this.quad(sign, 0.28, 0.09, plate([[`700 40px ${KU}`, '入库 · 收件', 18, 52], [`600 18px ${DIN}`, 'RECEIVING · RECORDS OFFICE', 18, 84]], 384, 112, INK, '#efe8d6', null), 0, 0.058, -0.004, 0, -0.12);
    this.box(sign, 0.28, 0.1, 0.006, 0, 0.058, -0.008, M.black);

    // the clerk's chair, pulled up to the desk, and the bin beside it
    this.chair(ctr, 0.15, -0.72, 0.08);
    this.cyl(ctr, 0.12, 0.1, 0.3, -0.95, 0.15, -0.68, std({ color: '#3b4a40', metalness: 0.3, roughness: 0.5 }));
    this.hit({ zone: 'counter', key: 'zone:counter' }, 1.0, 1.1, CL + 0.1, 3.9, 0.55, 1.7);
  }

  private chair(p: THREE.Object3D, x: number, z: number, ry: number) {
    const M = this.M;
    const c = new THREE.Group();
    c.position.set(x, 0, z);
    c.rotation.y = ry;
    p.add(c);
    this.rbox(c, 0.42, 0.035, 0.4, 0.01, 0, 0.45, 0, M.woodL);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(c, 0.03, 0.45, 0.03, sx * 0.18, 0.225, sz * 0.17, M.steelDark);
    for (const sx of [-1, 1]) this.box(c, 0.03, 0.42, 0.03, sx * 0.18, 0.66, -0.17, M.steelDark);
    this.rbox(c, 0.42, 0.14, 0.025, 0.01, 0, 0.78, -0.18, M.woodL);
  }

  /* ---------------- 05 · the card index by the entrance ---------------- */
  private cardIndex() {
    const M = this.M;
    const cc = new THREE.Group();
    cc.position.set(-2.4, 0, 1.55);
    this.group.add(cc);
    this.rbox(cc, 1.5, 0.9, 0.55, 0.01, 0, 0.55, 0, M.oak);
    const front = std({ map: woodTex('#9a7148', 30), roughness: 0.5 });
    for (let c2 = 0; c2 < 6; c2++)
      for (let r2 = 0; r2 < 5; r2++) {
        const x = -0.6 + c2 * 0.24, y = 0.24 + r2 * 0.16;
        this.rbox(cc, 0.21, 0.13, 0.02, 0.004, x, y, 0.285, front);
        this.box(cc, 0.05, 0.022, 0.006, x, y + 0.035, 0.3, M.brass, false);
        this.cyl(cc, 0.009, 0.009, 0.02, x, y - 0.03, 0.3, M.brass, 8).rotation.x = Math.PI / 2;
      }
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.box(cc, 0.05, 0.1, 0.05, sx * 0.7, 0.05, sz * 0.24, M.wood);
    this.rbox(cc, 1.5, 0.03, 0.3, 0.006, 0, 1.03, 0.06, M.oak).rotation.x = 0.2;
    const pulled = new THREE.Group();
    pulled.position.set(-0.12, 0.88, 0.45);
    cc.add(pulled);
    this.rbox(pulled, 0.21, 0.13, 0.36, 0.004, 0, 0, -0.17, front);
    for (let k = 0; k < 18; k++) this.box(pulled, 0.18, 0.11, 0.003, 0, 0.03 + (k === 6 ? 0.03 : 0), -0.02 - k * 0.018, M.cream, false);
    const tag = plate([[`700 26px ${KU}`, '索引卡 · 区 / 年 / 编号', 16, 40], [`600 18px ${DIN}`, 'INDEX — DISTRICT · YEAR · FILE NO.', 16, 72]], 512, 96, '#efe9da', INK, INK);
    this.quad(cc, 0.7, 0.13, tag, 0, 1.06, 0.215, 0, -1.37);
    this.hit({ index: true, key: 'index' }, 1.6, 1.15, 0.8, -2.4, 0.57, 1.6);
  }

  /* ---------------- 03 · the reading table under the windows ---------------- */
  private readingTable() {
    const M = this.M;
    const rt = new THREE.Group();
    rt.position.set(3.65, 0, -2.45);
    this.group.add(rt);
    this.rbox(rt, 2.2, 0.05, 0.9, 0.01, 0, 0.74, 0, M.woodL);
    this.rbox(rt, 2.0, 0.08, 0.7, 0.005, 0, 0.68, 0, M.wood);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.cyl(rt, 0.03, 0.022, 0.7, sx * 0.98, 0.35, sz * 0.36, M.wood, 12);
    for (const sx of [-0.55, 0.55]) this.rbox(rt, 0.55, 0.008, 0.4, 0.004, sx, 0.768, 0.12, std({ color: '#3d4a3e', roughness: 0.6 }));
    // a pencil and a glass by the far lamp; the rest of the top is for files
    this.cyl(rt, 0.004, 0.004, 0.17, 0.72, 0.776, -0.36, std({ color: '#d8b13a' }), 8).rotation.set(0, 0.4, Math.PI / 2);
    const mag = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 8, 24), M.brass);
    mag.rotation.x = Math.PI / 2;
    mag.position.set(0.55, 0.778, -0.35);
    rt.add(mag);
    rt.add(this.tableTop);
    // the examination lamp stands behind the reading place, its tube low over the far edge of the sheet
    this.examLamp(rt, -0.55, 0.765, -0.3, 'table', -1);
    this.deskLamp(rt, -0.98, 0.765, -0.28, 0.4, 0);
    this.deskLamp(rt, 0.98, 0.765, -0.28, -0.4, 1);
    this.chair(rt, -0.55, 0.72, Math.PI);
    this.chair(rt, 0.55, 0.72, Math.PI);
    this.chair(rt, -0.55, -0.72, 0);
    this.chair(rt, 0.55, -0.72, 0);
    this.hit({ zone: 'reading', key: 'zone:reading' }, 2.3, 0.72, 1.0, 3.65, 0.36, -2.45);
    // a standing fan, turning
    const sf = new THREE.Group();
    sf.position.set(5.2, 0, -1.3);
    sf.rotation.y = -2.2;
    this.group.add(sf);
    this.cyl(sf, 0.17, 0.19, 0.03, 0, 0.015, 0, M.enamelW);
    this.cyl(sf, 0.014, 0.014, 1.1, 0, 0.58, 0, M.chrome);
    this.cyl(sf, 0.06, 0.07, 0.14, 0, 1.18, -0.05, M.enamelW).rotation.x = Math.PI / 2;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 6, 40), M.chrome);
    cage.position.set(0, 1.18, 0.06);
    sf.add(cage);
    for (let s = 0; s < 8; s++) this.box(sf, 0.4, 0.004, 0.004, 0, 1.18, 0.07, M.chrome, false).rotation.z = (s * Math.PI) / 8;
    const blades = new THREE.Group();
    blades.position.set(0, 1.18, 0.05);
    sf.add(blades);
    const bladeM = std({ color: '#cfd9d2', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    for (let b = 0; b < 3; b++) {
      const bl = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), bladeM);
      bl.position.set(Math.cos(b * 2.1) * 0.09, Math.sin(b * 2.1) * 0.09, 0);
      blades.add(bl);
    }
    this.fanBlades = blades;
  }

  /* ---------------- trolley, stool, dehumidifier, palm ---------------- */
  private odds() {
    const M = this.M;
    const tg = new THREE.Group();
    tg.position.set(2.45, 0, 1.0);
    tg.rotation.y = -0.5;
    this.group.add(tg);
    for (const y of [0.18, 0.62]) this.rbox(tg, 0.8, 0.02, 0.42, 0.005, 0, y, 0, M.steel);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.cyl(tg, 0.012, 0.012, 0.85, sx * 0.38, 0.5, sz * 0.19, M.steelDark, 8);
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.015, 8, 16), M.rubber);
      w.position.set(sx * 0.38, 0.05, sz * 0.19);
      tg.add(w);
    }
    this.box(tg, 0.02, 0.02, 0.42, -0.38, 0.92, 0, M.chrome);
    for (let i = 0; i < 14; i++) this.rbox(tg, 0.012 + (i % 3) * 0.006, 0.297, 0.21, 0.002, -0.3 + i * 0.03, 0.635 + 0.1485, 0, i % 4 ? M.kraft : M.kraftD).rotation.z = 0.12;
    for (let i = 0; i < 2; i++) this.rbox(tg, 0.36, 0.11, 0.3, 0.004, -0.18 + i * 0.37, 0.25, 0, M.kraftD);
    const ss = new THREE.Group();
    ss.position.set(-4.6, 0, -3.2);
    this.group.add(ss);
    this.cyl(ss, 0.2, 0.22, 0.42, 0, 0.21, 0, M.steel, 24);
    this.cyl(ss, 0.205, 0.205, 0.02, 0, 0.42, 0, M.rubber, 24);
    // the dehumidifier between the bank and the reading table
    const dh = new THREE.Group();
    dh.position.set(2.3, 0, -3.3);
    this.group.add(dh);
    this.rbox(dh, 0.36, 0.62, 0.26, 0.03, 0, 0.33, 0, M.enamelW);
    for (let i = 0; i < 9; i++) this.box(dh, 0.26, 0.008, 0.006, 0, 0.42 + i * 0.022, 0.131, M.steelDark, false);
    this.box(dh, 0.3, 0.12, 0.006, 0, 0.16, 0.131, std({ color: '#cfd6d4', transparent: true, opacity: 0.8 }), false);
    const ledMat = std({ color: '#3f8f4f', emissive: '#59d06b', emissiveIntensity: 1.2 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), ledMat);
    led.position.set(0.12, 0.6, 0.13);
    led.name = 'led';
    led.userData.mat = ledMat;
    dh.add(led);
    this.hit({ dehumidifier: true, key: 'dehumidifier' }, 0.45, 0.75, 0.4, 2.3, 0.36, -3.3);
    this.palm(5.15, 3.15);
    // the hygrometer on the back wall, between the windows
    const hy = new THREE.Group();
    hy.position.set(1.2, 1.95, AR.z0 + 0.02);
    this.group.add(hy);
    this.rbox(hy, 0.2, 0.3, 0.025, 0.01, 0, 0, 0, M.wood);
    this.hygro = std({ map: hygroFace(70), roughness: 0.6 });
    const hf = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.26), this.hygro);
    hf.position.z = 0.014;
    hy.add(hf);
  }

  private palm(x: number, z: number) {
    const M = this.M;
    const pg = new THREE.Group();
    pg.position.set(x, 0, z);
    this.group.add(pg);
    const potP = [[0, 0], [0.16, 0], [0.19, 0.05], [0.21, 0.36], [0.23, 0.38], [0.23, 0.4], [0.2, 0.4]].map(([r, y]) => new THREE.Vector2(r, y));
    const pot = new THREE.Mesh(new THREE.LatheGeometry(potP, 28), M.pot);
    pot.castShadow = true;
    pg.add(pot);
    this.cyl(pg, 0.2, 0.2, 0.01, 0, 0.385, 0, std({ color: '#4a3826' }));
    const r = rng(515);
    for (let i = 0; i < 9; i++) {
      const a = i * 0.7 + r(), len = 0.5 + r() * 0.35, tilt = 0.5 + r() * 0.5;
      const stem = new THREE.Group();
      stem.position.y = 0.4;
      stem.rotation.set(0, a, tilt);
      pg.add(stem);
      this.box(stem, 0.012, len, 0.012, 0, len / 2, 0, M.leaf);
      for (let j = 0; j < 7; j++) {
        const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.22 - j * 0.02, 0.035), M.leaf);
        lf.position.set(0, len * (0.3 + j * 0.1), 0);
        lf.rotation.set(0.3, 0, (j % 2 ? 1 : -1) * 0.9);
        lf.castShadow = true;
        stem.add(lf);
      }
    }
  }

  /* ---------------- the map, the strong cabinet ---------------- */
  private heavy() {
    const M = this.M;
    const fm = new THREE.Group();
    fm.position.set(-4.3, 2.05, AR.z0 + 0.03);
    this.group.add(fm);
    this.rbox(fm, 1.36, 0.98, 0.04, 0.008, 0, 0, 0, std({ color: '#2a1a10', roughness: 0.4 }));
    this.box(fm, 1.3, 0.92, 0.01, 0, 0, 0.02, M.brass, false);
    this.quad(fm, 1.24, 0.86, mapSheet(), 0, 0, 0.027, 0, 0, 0.7);
    const glassF = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.86), std({ color: '#ffffff', transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2 }));
    glassF.position.z = 0.032;
    fm.add(glassF);
    const pl = new THREE.Group();
    pl.position.set(-4.3, 2.6, AR.z0 + 0.12);
    this.group.add(pl);
    this.cyl(pl, 0.03, 0.03, 0.5, 0, 0, 0, M.brass).rotation.z = Math.PI / 2;
    this.box(pl, 0.02, 0.14, 0.02, 0, 0.06, -0.06, M.brass);
    this.pictureLight.position.set(-4.3, 2.58, AR.z0 + 0.2);
    this.pictureLight.target.position.set(-4.3, 1.8, AR.z0);
    this.group.add(this.pictureLight, this.pictureLight.target);
    // the TOP SECRET strong cabinet, behind a rope
    const safe = new THREE.Group();
    safe.position.set(-3.3, 0, AR.z0 + 0.03 + 0.35);
    this.group.add(safe);
    this.rbox(safe, 0.72, 1.45, 0.7, 0.02, 0, 0.75, 0, std({ color: '#3d4038', metalness: 0.55, roughness: 0.35 }));
    this.rbox(safe, 0.64, 1.3, 0.02, 0.01, 0, 0.78, 0.355, std({ color: '#474b42', metalness: 0.55, roughness: 0.35 }));
    this.cyl(safe, 0.08, 0.08, 0.03, 0.12, 0.98, 0.38, M.chrome, 32).rotation.x = Math.PI / 2;
    this.box(safe, 0.03, 0.22, 0.04, -0.2, 0.9, 0.38, M.chrome);
    this.quad(safe, 0.3, 0.072, plate([[`700 40px ${DINB}`, 'TOP SECRET', 20, 52]], 300, 72, '#b4302a', '#f4ecd8'), 0, 1.3, 0.368);
    for (const sx of [-0.7, 0.7]) {
      const st = new THREE.Group();
      st.position.set(sx, 0, 0.85);
      safe.add(st);
      this.cyl(st, 0.12, 0.14, 0.03, 0, 0.015, 0, M.brass);
      this.cyl(st, 0.018, 0.018, 0.9, 0, 0.47, 0, M.brass, 12);
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), M.brass);
      k.position.y = 0.94;
      st.add(k);
    }
    const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.7, 0.88, 0.85), new THREE.Vector3(0, 0.62, 0.86), new THREE.Vector3(0.7, 0.88, 0.85)]), 24, 0.018, 8), std({ color: '#7a1f1c', roughness: 0.7 }));
    rope.castShadow = true;
    safe.add(rope);
    this.hit({ safe: true, key: 'safe' }, 0.8, 1.5, 0.8, -3.3, 0.75, AR.z0 + 0.38);
  }

  /* ---------------- rain things, sunlight through the louvres ---------------- */
  private weatherBits() {
    const M = this.M;
    const um = new THREE.Group();
    um.position.set(-4.65, 0.05, 2.95);
    um.rotation.set(0.15, 0.6, -1.1);
    this.group.add(um);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.22, 8, 1, true), std({ color: '#7a2f2a', roughness: 0.35, side: THREE.DoubleSide }));
    canopy.castShadow = true;
    canopy.position.y = 0.45;
    um.add(canopy);
    this.cyl(um, 0.008, 0.008, 0.8, 0, 0.1, 0, M.chrome);
    const pud = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), std({ color: '#8f8a80', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 }));
    pud.rotation.x = -Math.PI / 2;
    pud.scale.set(1.3, 0.7, 1);
    pud.position.set(-4.3, 0.006, 2.7);
    this.group.add(pud);
    this.wet.push(um, pud);
    const lt = louvreLight();
    for (const wx of WINX) {
      const mat = new THREE.MeshBasicMaterial({ map: lt, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.6), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = 0.32;
      m.position.set(wx + 0.55, 0.01, AR.z0 + 1.6);
      this.group.add(m);
      this.sunPatches.push(m);
    }
  }

  /* ---------------- formal drawers: opened, with the files hanging in them ---------------- */
  /** How far each drawer is out, and where it is going. */
  private pulls = new Map<THREE.Group, { at: number; to: number }>();
  private hanging = new Map<string, { g: THREE.Group; at: number; to: number; hit: THREE.Mesh }>();
  private tabMaps = new Map<string, THREE.Texture>();
  private outMap: THREE.Texture | null = null;

  /** A category's drawers in reading order: each cabinet top to bottom, door end first. */
  drawersOf(ci: number) {
    return (this.formalCabs[ci] ?? []).flatMap((c) => [...(c.userData.drawers as THREE.Group[])].reverse());
  }

  /** Where the front of a drawer is when it is pulled out, in the room. */
  drawerFront(ci: number, d: number) {
    const dg = this.drawersOf(ci)[d];
    if (!dg) return new THREE.Vector3();
    dg.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(0, (dg.userData.dh as number) * 0.6, DRAWER_OUT - dg.position.z - 0.18);
    return dg.localToWorld(p);
  }

  /**
   * Hang a drawer's files in it. Files out on the reading table leave a red
   * OUT card in their place.
   */
  fillDrawer(ci: number, d: number, items: { file: string; stamp: string; category: string; out: boolean }[]) {
    const dg = this.drawersOf(ci)[d];
    if (!dg) return;
    const M = this.M;
    const old = dg.getObjectByName('inner');
    if (old) {
      old.traverse((o) => {
        const k = o.userData.file as string | undefined;
        if (k && o.userData.hitFor) {
          this.unhit(o);
          this.hanging.delete(k);
        }
      });
      dg.remove(old);
    }
    const inner = new THREE.Group();
    inner.name = 'inner';
    dg.add(inner);
    const dh = dg.userData.dh as number;
    const L = CAB.d - 0.06, iw = CAB.w - 0.06;
    this.box(inner, iw, 0.008, L, 0, 0.012, -L / 2, M.steelDark, false);
    for (const sx of [-1, 1]) {
      this.box(inner, 0.008, dh * 0.8, L, sx * (CAB.w / 2 - 0.035), dh * 0.4, -L / 2, M.steel, false);
      this.box(inner, 0.006, 0.006, L, sx * (iw / 2 - 0.012), dh * 0.82, -L / 2, M.chrome, false);
    }
    this.box(inner, iw, dh * 0.8, 0.008, 0, dh * 0.4, -L, M.steel, false);
    const n = Math.max(1, items.length);
    const step = Math.min(0.04, (L - 0.1) / n);
    const fw = iw - 0.03, fh = dh * 0.72;
    const top = dh * 0.82;
    const mats: Record<string, THREE.Material> = { personnel: M.manila, events: M.kraft, programs: std({ color: '#9aa197', roughness: 0.85 }) };
    const secret = std({ color: '#8f5a3c', roughness: 0.9 });
    const red = std({ color: '#b4302a', roughness: 0.6 });
    items.forEach((it, i) => {
      const z = -0.07 - i * step;
      const g = new THREE.Group();
      g.position.set(0, 0, z);
      inner.add(g);
      if (it.out) {
        // the OUT card stands where the file was
        this.outMap ??= plate([[`700 52px ${DINB}`, 'OUT', 20, 62], [`700 30px ${KU}`, '借出 · 阅档桌', 20, 108, '#f4ecd8']], 256, 128, '#9a2a22', '#f4ecd8');
        const card = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), std({ map: this.outMap, roughness: 0.7 }));
        card.position.set(-0.08, top + 0.03, 0);
        g.add(card);
        this.box(g, 0.13, fh * 0.9, 0.003, -0.08, top - fh * 0.45 + 0.02, -0.002, red, false);
        return;
      }
      this.box(g, iw - 0.004, 0.004, 0.004, 0, top, 0, M.steelDark, false);
      this.box(g, fw, fh, 0.008 + (i % 3) * 0.002, 0, top - fh / 2 - 0.006, 0, it.stamp === 'TOP SECRET' ? secret : mats[it.category] ?? M.manila);
      if (it.stamp === 'TOP SECRET') {
        // a string-and-washer fastening, as on the envelope
        this.cyl(g, 0.012, 0.012, 0.004, fw / 2 - 0.05, top - 0.05, 0.007, red, 14).rotation.x = Math.PI / 2;
        this.box(g, 0.002, 0.07, 0.002, fw / 2 - 0.05, top - 0.09, 0.009, std({ color: '#e8dcc0' }), false);
      }
      if (!this.tabMaps.has(it.file)) this.tabMaps.set(it.file, fileTab(it.file, it.stamp));
      const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.095, 0.036), std({ map: this.tabMaps.get(it.file)!, roughness: 0.6 }));
      tab.position.set([-0.13, -0.04, 0.05, 0.14][i % 4], top + 0.016, 0.003);
      tab.rotation.x = -0.35;
      g.add(tab);
      const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
      hit.scale.set(fw, fh + 0.06, Math.max(0.03, step));
      hit.position.set(0, top - fh / 2 + 0.02, 0);
      hit.userData = { file: it.file, key: `file:${it.file}`, hitFor: true };
      g.add(hit);
      this.hits.push(hit);
      this.hanging.set(it.file, { g, at: 0, to: 0, hit });
    });
  }

  /** Pull a drawer out (or push it home). */
  setDrawer(ci: number, d: number, open: boolean) {
    const dg = this.drawersOf(ci)[d];
    if (!dg) return;
    const p = this.pulls.get(dg) ?? { at: dg.position.z, to: 0 };
    p.to = open ? DRAWER_OUT : 0;
    this.pulls.set(dg, p);
  }

  /** Lift a hanging file: a little on hover, half out when taken. */
  liftFile(file: string, amount: number) {
    const h = this.hanging.get(file);
    if (h) h.to = amount;
  }

  dropAll() {
    for (const h of this.hanging.values()) h.to = 0;
  }

  /** Is the pointer allowed to find this file: only in a drawer that is out. */
  fileReachable(file: string) {
    const h = this.hanging.get(file);
    const dg = h?.g.parent?.parent as THREE.Group | undefined;
    return !!dg && (this.pulls.get(dg)?.at ?? 0) > DRAWER_OUT * 0.6;
  }

  /* ---------------- the reading table ---------------- */
  private covers = new Map<string, TableFile>();
  /** Where a file lies on the table: x, z, turn. The left blotter is kept clear for reading. */
  static readonly SLOTS: [number, number, number][] = [[0.0, 0.17, -0.04], [0.32, 0.17, 0.05], [0.64, 0.16, -0.06], [0.04, -0.16, 0.07], [0.36, -0.16, -0.05], [0.69, -0.15, 0.04]];
  /** The reading place: the left blotter, in front of its chair, under the examination lamp. */
  static readonly SEAT = new THREE.Vector3(-0.55, 0.79, 0.11);
  /** How much larger the file is when it is drawn up to read: the sheet then fills the screen with the lamp still in view. */
  static readonly LEAN = 1.3;
  /** The place for a second file, open on the right blotter beside the one being read. */
  static readonly SEAT2 = new THREE.Vector3(-0.1, 0.79, 0.11);
  /** The file being read at the table, open on the blotter. */
  private seated: string | null = null;
  /** The file laid open beside it, to read across. */
  private aside: string | null = null;

  /** Where a file lies on the table, in the room; null if it is not there. */
  tableSpot(file: string) {
    const c = this.covers.get(file);
    if (!c) return null;
    c.g.updateWorldMatrix(true, false);
    return c.g.getWorldPosition(new THREE.Vector3());
  }

  /** Where a hanging file is in the room, so it can be carried from there. */
  filePos(file: string) {
    const h = this.hanging.get(file);
    if (!h) return null;
    h.g.updateWorldMatrix(true, false);
    return h.g.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
  }

  /**
   * The four corners of the sheet lying open in the file being read, in the
   * room: top-left, top-right, bottom-right, bottom-left as seen from the chair.
   */
  sheetCorners(side = false): THREE.Vector3[] | null {
    const f = side ? this.aside : this.seated;
    const c = f ? this.covers.get(f) : null;
    if (!c) return null;
    c.g.updateWorldMatrix(true, true);
    const gm = c.leaf.geometry as THREE.PlaneGeometry;
    const w = gm.parameters.width / 2, h = gm.parameters.height / 2;
    return [[-w, h], [w, h], [w, -h], [-w, -h]].map(([x, y]) => c.leaf.localToWorld(new THREE.Vector3(x, y, 0)));
  }

  /** The middle of the reading place on the table, in the room. */
  readSpot(pair = false) {
    this.tableTop.updateWorldMatrix(true, false);
    const at = StacksRoom.SEAT.clone();
    if (pair) at.lerp(StacksRoom.SEAT2, 0.5);
    return this.tableTop.localToWorld(at);
  }

  /** Lay this file open on the right blotter, beside the one being read (null: put it back). */
  setAside(file: string | null) {
    this.aside = file && file !== this.seated && this.covers.has(file) ? file : null;
    this.aimTable(false);
  }

  /**
   * Lay these files on the table, in this order; the rest go. A file given a
   * `from` (a place in the room) is carried over from there and put down.
   */
  setTable(items: { file: string; category: string; map: () => THREE.Texture }[], from?: Map<string, THREE.Vector3>) {
    const keep = new Set(items.map((i) => i.file));
    for (const [f, c] of this.covers) {
      if (keep.has(f)) continue;
      this.tableTop.remove(c.g, c.blob);
      this.unhit(c.hit);
      c.map.dispose();
      this.covers.delete(f);
      if (this.seated === f) this.seated = null;
      if (this.aside === f) this.aside = null;
    }
    items.forEach((it, i) => {
      let c = this.covers.get(it.file);
      if (!c) {
        c = this.makeTableFile(it.file, it.category, it.map());
        const w = from?.get(it.file);
        if (w) {
          this.tableTop.updateWorldMatrix(true, false);
          c.carry = { from: this.tableTop.worldToLocal(w.clone()), rot: Math.PI / 2, t: 0 };
        }
        this.covers.set(it.file, c);
      }
      c.slot = i;
    });
    this.aimTable(true);
  }

  /** Sit down to read `file` at the reading place (null: get up, it goes back to its spot). */
  seat(file: string | null) {
    this.seated = file && this.covers.has(file) ? file : null;
    this.aimTable(false);
  }

  /** Where each file on the table should be: at its spot shut, or open on the blotter. */
  private aimTable(snapNew: boolean) {
    for (const [f, c] of this.covers) {
      const [x, z, r] = StacksRoom.SLOTS[c.slot] ?? StacksRoom.SLOTS[0];
      if (f === this.seated) {
        c.to.copy(StacksRoom.SEAT).setY(0.772 + 0.012);
        c.toRot = 0;
        c.toOpen = 1;
        c.toS = StacksRoom.LEAN;
      } else if (f === this.aside) {
        c.to.copy(StacksRoom.SEAT2).setY(0.772 + 0.012);
        c.toRot = 0;
        c.toOpen = 1;
        c.toS = StacksRoom.LEAN;
      } else {
        c.to.set(x, 0.772 + c.slot * 0.0015, z);
        c.toRot = r;
        c.toOpen = 0;
        c.toS = 1;
      }
      if (snapNew && c.fresh && !c.carry) {
        c.g.position.copy(c.to);
        c.g.rotation.y = c.toRot;
      }
      c.fresh = false;
    }
  }

  /**
   * A folder as it lies on the table: the back board with the sheet on it,
   * and the front cover hinged along its left edge, so it can be opened flat.
   */
  private makeTableFile(file: string, category: string, map: THREE.Texture): TableFile {
    const M = this.M;
    const W = 0.235, D = 0.32;
    const g = new THREE.Group();
    const body = category === 'events' ? M.kraft : category === 'programs' ? std({ color: '#55625a', roughness: 0.85 }) : M.manila;
    this.rbox(g, W, 0.006, D, 0.002, 0, 0.003, 0, body);
    // the sheet inside, a little smaller than the board
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02), std({ map: sheet(file.length * 7 + file.charCodeAt(file.length - 1), '', false), roughness: 0.9 }));
    leaf.rotation.x = -Math.PI / 2;
    leaf.position.set(0.004, 0.0068, 0);
    leaf.receiveShadow = true;
    g.add(leaf);
    // the cover, hinged on the left
    const flap = new THREE.Group();
    flap.position.set(-W / 2, 0.008, 0);
    g.add(flap);
    this.rbox(flap, W, 0.004, D, 0.002, W / 2, 0.002, 0, body);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.005, D - 0.005), std({ map, roughness: 0.85 }));
    face.rotation.x = -Math.PI / 2;
    face.position.set(W / 2, 0.0042, 0);
    face.receiveShadow = true;
    flap.add(face);
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    hit.scale.set(W + 0.015, 0.06, D + 0.01);
    hit.position.y = 0.02;
    hit.userData = { table: file, key: `table:${file}` };
    g.add(hit);
    this.hits.push(hit);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.09, D + 0.09), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.renderOrder = 1;
    this.tableTop.add(blob, g);
    return { g, leaf, s: 1, toS: 1, blob, flap, hit, map, slot: 0, to: new THREE.Vector3(), toRot: 0, open: 0, toOpen: 0, fresh: true };
  }

  private tickTable(dt: number, motion: number) {
    const k = motion ? Math.min(1, dt * 6) : 1;
    for (const [f, c] of this.covers) {
      if (c.carry && motion) {
        // carried over from the cabinets: up, across the room, down on its spot
        const cr = c.carry;
        cr.t = Math.min(1, cr.t + dt / 1.15);
        const e = cr.t < 0.5 ? 4 * cr.t ** 3 : 1 - (-2 * cr.t + 2) ** 3 / 2;
        c.g.position.lerpVectors(cr.from, c.to, e);
        c.g.position.y += Math.sin(Math.PI * cr.t) * 0.45;
        c.g.rotation.y = cr.rot + (c.toRot - cr.rot) * e;
        c.g.rotation.z = Math.sin(Math.PI * cr.t) * 0.25;
        if (cr.t >= 1) {
          c.carry = undefined;
          c.g.rotation.z = 0;
          this.landed?.();
        }
      } else {
        c.carry = undefined;
        c.g.position.lerp(c.to, k);
        c.g.rotation.y += (c.toRot - c.g.rotation.y) * k;
      }
      c.s += (c.toS - c.s) * (motion ? Math.min(1, dt * 5) : 1);
      c.g.scale.setScalar(c.s);
      // its shadow stays on the blotter: tight and dark when it lies there, wide and faint while it is carried
      const up = Math.min(1, Math.max(0, (c.g.position.y - 0.772) / 0.4));
      c.blob.position.set(c.g.position.x, 0.7727, c.g.position.z);
      c.blob.rotation.z = c.g.rotation.y;
      c.blob.scale.setScalar((1 + up * 1.2) * c.s);
      (c.blob.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - up);
      // the cover follows once the folder is nearly in place
      const near = c.g.position.distanceTo(c.to) < 0.03;
      const want = near ? c.toOpen : Math.min(c.open, c.toOpen);
      c.open += (want - c.open) * (motion ? Math.min(1, dt * 5) : 1);
      c.flap.rotation.z = c.open * Math.PI * 0.985;
      // a file laid beside the one being read has only its sheet out: its cover is not in the way
      c.flap.visible = f !== this.aside;
    }
    // the lamp's arm swings after a file being carried, and rests over the reading place
    let at = StacksRoom.SEAT;
    for (const c of this.covers.values()) if (c.carry) at = c.g.position;
    this.tickArm(dt, at, !motion);
  }

  /** Called when a carried file lands on the table. */
  landed?: () => void;

  private tickDrawers(dt: number) {
    const k = Math.min(1, dt * 7);
    for (const [dg, p] of this.pulls) {
      p.at += (p.to - p.at) * k;
      dg.position.z = p.at;
    }
    for (const h of this.hanging.values()) {
      h.at += (h.to - h.at) * Math.min(1, dt * 9);
      h.g.position.y = h.at * 0.2;
    }
  }

  /* ---------------- state ---------------- */
  setWeather(rain: boolean, night: boolean, rh: number) {
    if (rain === this.rainNow && night === this.nightNow && this.hygro?.userData.rh === rh) return;
    this.rainNow = rain;
    this.nightNow = night;
    const w = this.M.winBack;
    w.map?.dispose();
    w.map = windowView(rain, night);
    w.emissiveMap = w.map;
    w.emissive.set(night ? (rain ? '#202838' : '#1a2230') : rain ? '#8a969c' : '#e8eef0');
    w.emissiveIntensity = night ? 0.9 : 0.8;
    w.needsUpdate = true;
    for (const o of this.wet) o.visible = rain;
    const furled = this.group.getObjectByName('furled');
    if (furled) furled.visible = !rain;
    if (this.hygro) {
      this.hygro.map?.dispose();
      this.hygro.map = hygroFace(rh);
      this.hygro.userData.rh = rh;
      this.hygro.needsUpdate = true;
    }
  }

  /** Flip a rocker on the switch plate. */
  setRocker(i: number, on: boolean) {
    this.rockerOn[i] = on;
    const r = this.rockers[i];
    if (r) r.rotation.x = on ? -0.25 : 0.25;
  }

  /** The tank light: red when it is full. */
  setTankFull(full: boolean) {
    this.ledMat.color.set(full ? '#9a2a22' : '#3f8f4f');
    this.ledMat.emissive.set(full ? '#ff4a3a' : '#59d06b');
  }

  tick(t: number, dt: number, clock: { h: number; m: number; s: number }, fan: number) {
    if (this.clockHands) {
      const { h, m, s } = clock;
      this.clockHands.s.rotation.z = -(s / 60) * Math.PI * 2;
      this.clockHands.m.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
      this.clockHands.h.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2;
    }
    if (this.fanBlades) this.fanBlades.rotation.z -= dt * 14 * fan;
    this.tickDrawers(dt);
    this.tickTable(dt, fan);
    void t;
  }
}
