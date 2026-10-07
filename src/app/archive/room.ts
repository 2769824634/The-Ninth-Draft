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
  INK, KU, DIN, DINB, RED, caseFront, clockFace, contactShadow, drawerCard, envelopeTops, hygroFace, louvreLight, mapSheet, panelling, plate, rng, runner, sheet, teakFloor, windowView, woodTex,
} from './textures';

export const AR = { x0: -5.6, x1: 5.6, z0: -3.6, z1: 3.6, h: 3.4, wall: 0.22, slab: 0.24 };
const CAB = { w: 0.47, d: 0.62, h: 1.32, n: 4 };
const DADO = 1.6;
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

export interface DeskLamp {
  light: THREE.SpotLight;
  inner: THREE.MeshStandardMaterial;
}

const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class StacksRoom {
  readonly group = new THREE.Group();
  readonly pendants: Pendant[] = [];
  readonly desks: DeskLamp[] = [];
  readonly rockers: THREE.Mesh[] = [];
  /** Invisible boxes the pointer can find: userData says what each one is. */
  readonly hits: THREE.Object3D[] = [];
  /** Where each formal group of cabinets stands, for the camera. */
  readonly catCentre: THREE.Vector3[] = [];
  readonly street = new THREE.SpotLight('#9fb8ff', 0, 14, 0.5, 0.8, 1.2);
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

  constructor(cats: StacksCategory[], opts: { today: string; reading?: { title: string; file: string } }) {
    this.shell();
    WINX.forEach((x) => this.louvreWindow(x));
    this.formal(cats);
    this.routine();
    for (const [x, z, row] of [[-3.5, -1.9, 1], [-3.5, 0.6, 1], [-0.21, -1.95, 2], [-0.21, 0.4, 2], [3.0, -2.45, 3], [4.3, -2.45, 3], [3.6, 1.7, 3], [-3.9, 2.6, 0], [-2.4, 1.55, 0]] as const) this.pendant(x, z, row);
    this.door();
    this.counter(opts.today);
    this.cardIndex();
    this.readingTable(opts.reading);
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
    for (let i = 0; i < n; i++) {
      const pull = pulls[i] || 0;
      const dg = new THREE.Group();
      dg.position.set(0, 0.08 + i * dh, pull);
      g.add(dg);
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
        const pulls = ci === 1 && k === 2 ? [0, 0, 0, 0.32] : ci === 0 && k === 1 ? [0, 0.12, 0, 0] : ci === 2 && k === 0 ? [0, 0, 0.2, 0] : [];
        this.cabinet(AR.x0 + 0.03 + CAB.d, cz + CAB.w / 2, Math.PI / 2, (i) => [c.zh, c.en, `${c.code} · ${String(k + 1).padStart(2, '0')}-${4 - i}`], pulls, (g, h) => {
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
        cz += CAB.w + 0.004;
      }
      const mid = (z0 + cz) / 2;
      const sign = plate([[`700 64px ${KU}`, c.zh, 28, 82], [`600 28px ${DIN}`, c.en.toUpperCase(), 160, 80], [`600 22px ${DIN}`, c.range || '—', 162, 112, '#c9c1ad']], 512, 140, '#26302a', '#efe8d6', '#c9c1ad');
      this.rbox(this.group, 0.62, 0.17, 0.015, 0.006, AR.x0 + 0.008, 1.62, mid, M.cream, false).rotation.y = Math.PI / 2;
      this.quad(this.group, 0.6, 0.164, sign, AR.x0 + 0.017, 1.62, mid, Math.PI / 2);
      const cx = AR.x0 + 0.03 + CAB.d / 2;
      this.catCentre.push(new THREE.Vector3(cx, 0.75, mid));
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

  /* ---------------- 04 · the intake desk, facing the door ---------------- */
  private counter(today: string) {
    const M = this.M;
    const ctr = new THREE.Group();
    ctr.position.set(3.9, 0, 1.7);
    ctr.rotation.y = -Math.PI / 2;
    this.group.add(ctr);
    const CL = 2.2;
    this.rbox(ctr, CL, 0.98, 0.5, 0.01, 0, 0.49, 0, M.wood);
    for (let p = 0; p < 5; p++) this.box(ctr, CL / 5 - 0.08, 0.66, 0.012, -CL / 2 + CL / 10 + (p * CL) / 5, 0.5, 0.256, M.woodL);
    this.box(ctr, CL, 0.08, 0.02, 0, 0.06, 0.255, M.skirting);
    this.rbox(ctr, CL + 0.08, 0.04, 0.62, 0.008, 0, 1.0, 0.03, M.counterTop);
    const [, mm, dd] = today.split('-');
    const tray = (x: number, n: number, lab: [string, string]) => {
      this.rbox(ctr, 0.36, 0.05, 0.28, 0.005, x, 1.045, 0.02, M.steelDark);
      for (let i = 0; i < n; i++) {
        const e = this.rbox(ctr, 0.3, 0.012, 0.22, 0.002, x + (i % 2) * 0.01, 1.075 + i * 0.013, 0.02 + ((i * 7) % 3) * 0.005, i % 3 ? M.kraft : M.kraftD);
        e.rotation.y = ((i % 3) - 1) * 0.05;
      }
      this.quad(ctr, 0.24, 0.1, plate([[`700 44px ${KU}`, lab[0], 18, 58], [`600 20px ${DIN}`, lab[1], 20, 90]], 256, 108, '#efe9da', INK, INK), x, 1.13 + n * 0.013, 0.16, 0, -0.4);
    };
    tray(-0.9, 7, ['今日入库', `RECEIVED · ${dd}.${mm}.99`]);
    tray(-0.45, 3, ['待归档', 'TO FILE']);
    // the in-tray answers a click: today's arrivals
    const hb = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    hb.scale.set(0.42, 0.3, 0.4);
    hb.position.set(-0.9, 1.15, 0.05);
    hb.userData = { tray: true, key: 'tray' };
    ctr.add(hb);
    this.hits.push(hb);
    // bell
    this.cyl(ctr, 0.045, 0.055, 0.015, 0.05, 1.03, 0.2, M.black);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 10, 0, 7, 0, 1.55), M.chrome);
    bell.position.set(0.05, 1.035, 0.2);
    ctr.add(bell);
    // rubber-stamp carousel
    const sc = new THREE.Group();
    sc.position.set(0.32, 1.02, -0.05);
    ctr.add(sc);
    this.cyl(sc, 0.09, 0.1, 0.02, 0, 0.01, 0, M.wood);
    this.cyl(sc, 0.008, 0.008, 0.18, 0, 0.1, 0, M.chrome);
    this.cyl(sc, 0.08, 0.08, 0.01, 0, 0.16, 0, M.wood);
    for (let s = 0; s < 6; s++) {
      const a = (s * Math.PI) / 3;
      this.cyl(sc, 0.012, 0.012, 0.07, Math.cos(a) * 0.065, 0.12, Math.sin(a) * 0.065, M.woodL);
      this.cyl(sc, 0.02, 0.02, 0.012, Math.cos(a) * 0.065, 0.08, Math.sin(a) * 0.065, M.black);
    }
    this.rbox(ctr, 0.1, 0.02, 0.07, 0.004, 0.55, 1.03, 0.1, std({ color: '#7c2a24', metalness: 0.4, roughness: 0.4 }));
    // rotary telephone
    const ph = new THREE.Group();
    ph.position.set(0.62, 1.02, -0.04);
    ctr.add(ph);
    this.rbox(ph, 0.2, 0.08, 0.22, 0.03, 0, 0.04, 0, M.black);
    this.cyl(ph, 0.065, 0.065, 0.01, 0, 0.085, 0.03, M.enamelW).rotation.x = 0.35;
    this.rbox(ph, 0.24, 0.04, 0.05, 0.02, 0, 0.11, -0.06, M.black);
    for (const sx of [-1, 1]) this.rbox(ph, 0.06, 0.05, 0.06, 0.02, sx * 0.1, 0.1, -0.06, M.black);
    // the register, open
    const book = new THREE.Group();
    book.position.set(-0.05, 1.025, -0.12);
    book.rotation.y = 0.2;
    ctr.add(book);
    this.rbox(book, 0.42, 0.012, 0.3, 0.003, 0, 0, 0, std({ color: '#26302a' }));
    for (const sx of [-1, 1]) this.box(book, 0.2, 0.01, 0.28, sx * 0.105, 0.012, 0, M.cream, false).rotation.z = -sx * 0.06;
    // the clerk's lamp: green enamel gooseneck, with a light of its own
    const cl = new THREE.Group();
    cl.position.set(0.95, 1.02, -0.2);
    ctr.add(cl);
    this.cyl(cl, 0.07, 0.08, 0.025, 0, 0.012, 0, M.enamelG);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.25, 0.02), new THREE.Vector3(-0.05, 0.4, 0.1), new THREE.Vector3(-0.15, 0.42, 0.18)]), 24, 0.008, 8), M.chrome);
    neck.castShadow = true;
    cl.add(neck);
    const shadeP = [[0.015, 0.07], [0.03, 0.065], [0.05, 0.04], [0.08, 0.0], [0.085, -0.005]].map(([r, y]) => new THREE.Vector2(r, y));
    const shade = new THREE.Mesh(new THREE.LatheGeometry(shadeP, 32), std({ color: '#5d7a66', roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide }));
    shade.position.set(-0.15, 0.4, 0.18);
    shade.rotation.x = 0.5;
    shade.castShadow = true;
    cl.add(shade);
    const inner = std({ color: '#fff8e8', emissive: '#ffe9c0', emissiveIntensity: 0.3, side: THREE.BackSide });
    const im = new THREE.Mesh(new THREE.LatheGeometry(shadeP.map((v) => new THREE.Vector2(v.x * 0.94, v.y - 0.003)), 32), inner);
    im.position.copy(shade.position);
    im.rotation.copy(shade.rotation);
    cl.add(im);
    const sp = new THREE.SpotLight('#ffe2b0', 0, 2.2, 0.85, 0.6, 1.5);
    sp.position.set(-0.15, 0.39, 0.18);
    sp.target.position.set(-0.4, -0.6, 0.45);
    cl.add(sp, sp.target);
    this.desks.push({ light: sp, inner });
    const lh = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false }));
    lh.scale.set(0.3, 0.5, 0.4);
    lh.position.set(-0.08, 0.25, 0.1);
    lh.userData = { desk: this.desks.length - 1, key: `desk:${this.desks.length - 1}` };
    cl.add(lh);
    this.hits.push(lh);
    this.chair(ctr, -0.4, -0.65, 0.1);
    this.cyl(ctr, 0.12, 0.1, 0.3, 0.7, 0.15, -0.6, std({ color: '#3b4a40', metalness: 0.3, roughness: 0.5 }));
    this.hit({ zone: 'counter', key: 'zone:counter' }, 0.9, 1.1, CL + 0.1, 3.9, 0.55, 1.7);
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
  private readingTable(reading?: { title: string; file: string }) {
    const M = this.M;
    const rt = new THREE.Group();
    rt.position.set(3.65, 0, -2.45);
    this.group.add(rt);
    this.rbox(rt, 2.2, 0.05, 0.9, 0.01, 0, 0.74, 0, M.woodL);
    this.rbox(rt, 2.0, 0.08, 0.7, 0.005, 0, 0.68, 0, M.wood);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.cyl(rt, 0.03, 0.022, 0.7, sx * 0.98, 0.35, sz * 0.36, M.wood, 12);
    for (const sx of [-0.55, 0.55]) this.rbox(rt, 0.55, 0.008, 0.4, 0.004, sx, 0.768, 0.12, std({ color: '#3d4a3e', roughness: 0.6 }));
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), std({ map: caseFront(reading?.title ?? '', reading?.file ?? ''), roughness: 0.9 }));
    ce.rotation.set(-Math.PI / 2, 0, 0.18);
    ce.position.set(-0.6, 0.775, 0.1);
    ce.receiveShadow = true;
    rt.add(ce);
    ['事件报告', '司机行车记录', '车票'].forEach((t, i) => {
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), std({ map: sheet(40 + i, t, i === 0), roughness: 0.9 }));
      sh.rotation.set(-Math.PI / 2, 0, -0.1 + i * 0.16);
      sh.position.set(-0.32 + i * 0.12, 0.774 + i * 0.001, 0.12 - i * 0.03);
      sh.receiveShadow = true;
      rt.add(sh);
    });
    this.cyl(rt, 0.004, 0.004, 0.17, -0.15, 0.78, -0.12, std({ color: '#d8b13a' }), 8).rotation.set(0, 0, Math.PI / 2);
    const mag = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 8, 24), M.brass);
    mag.rotation.x = Math.PI / 2;
    mag.position.set(0.1, 0.78, 0.18);
    rt.add(mag);
    this.deskLamp(rt, -0.98, 0.765, -0.28, 0.4, 0);
    this.deskLamp(rt, 0.98, 0.765, -0.28, -0.4, 1);
    this.chair(rt, -0.55, 0.72, Math.PI);
    this.chair(rt, 0.55, 0.72, Math.PI);
    this.chair(rt, -0.55, -0.72, 0);
    this.chair(rt, 0.55, -0.72, 0);
    this.hit({ zone: 'reading', key: 'zone:reading' }, 2.3, 0.9, 1.0, 3.65, 0.45, -2.45);
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
    void t;
  }
}
