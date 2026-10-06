/**
 * The Data Section office, a basement room at real size (metres), built as
 * a cutaway: floor slab, back and left walls, a strip window at pavement
 * height with a venetian blind. The desk and its computer face the room;
 * a sofa and a coffee table face a pull-down screen on the left wall; the
 * cassette deck and its rack of tapes sit on a sideboard under the island map.
 *
 * An invisible ceiling casts shadow, so daylight only comes in through the
 * window, through the slats of the blind.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rainTexture, woodTexture } from '../library/textures';
import { TapeShelf, type ShelfTape, type Well } from './cassettes';
import { Projector } from './projector';
import { TrayCrate, type TrayInfo } from './trays';
import {
  calendarTexture, caseTexture, counterTexture, corkTexture, clockFaceTexture, corduroyTexture, deckTexture, screenTexture, slideBoxTexture, keyboardTexture, linoTexture, mapTexture, noticeTexture, passerbyTexture, plasticTexture, rugTexture, streetTexture, wallTexture,
} from './textures';

export const R = { x0: -3.5, x1: 3.5, z0: -2.5, z1: 2.5, h: 3.0, wall: 0.2, slab: 0.22 };
export const WIN = { x0: -0.7, x1: 2.6, y0: 2.12, y1: 2.72 };
export const SCREEN = { w: 0.32, h: 0.24 };
/** Which way the camera looks at the cassette deck. */
export const DECK_DIR = new THREE.Vector3(0.1, 0.34, 1).normalize();
/** The picture on the pull-down screen: its centre, and how wide it is. */
export const PICTURE = { at: new THREE.Vector3(R.x0 + 0.075, 1.82, 0.72), w: 1.3 };
/** The sideboard's place in the room. */
/** The sofa view looks along this; a slide box is held up here to be read. */
export const SOFA_DIR = new THREE.Vector3(1, 0.26, -0.38).normalize();
export const TRAY_HOLD = new THREE.Vector3(-0.95, 0.95, 0.42);
const SIDEBOARD = new THREE.Vector3(-1.6, 0, R.z0 + 0.26);

export interface Notice {
  mesh: THREE.Mesh;
  file: string;
  slug: string;
}

export class Room {
  readonly group = new THREE.Group();
  /** Lights that belong to objects in the room. */
  readonly deskLamp = new THREE.SpotLight(0xffd9a0, 0, 4, 0.75, 0.6, 1.6);
  readonly floorLamp = new THREE.PointLight(0xffc98a, 0, 6, 1.6);
  readonly crtGlow = new THREE.PointLight(0xffb060, 0, 1.6, 2);
  readonly street = new THREE.SpotLight(0x9fb8ff, 0, 9, 0.7, 0.8, 1.2);
  readonly lampShades: THREE.MeshStandardMaterial[] = [];
  readonly nightView: THREE.MeshBasicMaterial;
  readonly rain = rainTexture();
  readonly passerby: THREE.Mesh;
  /** Where the live screen sits: the centre of the glass, facing +z. */
  readonly screenAnchor = new THREE.Object3D();
  screenMat!: THREE.MeshStandardMaterial;
  readonly clock = { hour: new THREE.Mesh(), minute: new THREE.Mesh(), second: new THREE.Mesh(), face: null as unknown as THREE.MeshStandardMaterial, group: new THREE.Group() };
  readonly notices: Notice[] = [];
  readonly reels: THREE.Mesh[] = [];
  readonly hits: Record<string, THREE.Object3D> = {};
  /** The cassette deck's moving parts, and the rack of tapes beside it. */
  readonly deck = {
    needles: [] as THREE.Mesh[],
    counter: counterTexture(),
    vu: 0,
  };
  shelf!: TapeShelf;
  /** The crate of slide trays on the rug by the coffee table. */
  crate!: TrayCrate;
  projector!: Projector;
  readonly drips: THREE.Points;

  private wood = new THREE.MeshStandardMaterial({ map: woodTexture(21, '#6b4a2e'), roughness: 0.5 });
  private woodDark = new THREE.MeshStandardMaterial({ map: woodTexture(22, '#3b2717'), roughness: 0.6 });
  private beige = new THREE.MeshStandardMaterial({ map: plasticTexture('#d8d1bf'), roughness: 0.55 });
  private steel = new THREE.MeshStandardMaterial({ color: '#8d9091', metalness: 0.55, roughness: 0.45 });
  private chrome = new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 0.9, roughness: 0.22 });
  private black = new THREE.MeshStandardMaterial({ color: '#1d1c1a', roughness: 0.6 });
  private poche = new THREE.MeshStandardMaterial({ color: '#2b2723', roughness: 0.9 });

  constructor(records: { file: string; slug: string; title: string; date?: string; stamp: string; category: string }[], private tapes: ShelfTape[] = [], private reduce = false, private trays: TrayInfo[] = [], private zh = false) {
    this.shell();
    this.window();
    this.desk();
    this.sofaCorner();
    this.sideboard();
    this.walls(records);
    this.corners();
    this.passerby = this.makePasserby();
    this.nightView = this.group.getObjectByName('night-view')!.userData.mat as THREE.MeshBasicMaterial;
    this.drips = this.makeDrips();
  }

  private box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = this.group, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  private round(w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private hit(name: string, w: number, h: number, d: number, x: number, y: number, z: number) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(x, y, z);
    m.userData.zone = name;
    this.group.add(m);
    this.hits[name] = m;
  }

  /* ---------------- floor, walls, the ceiling nobody sees ---------------- */
  private shell() {
    const { x0, x1, z0, z1, h, wall, slab } = R;
    const lino = linoTexture();
    lino.repeat.set((x1 - x0) / 1.2, (z1 - z0) / 1.2);
    const floor = new THREE.MeshStandardMaterial({ map: lino, roughness: 0.42 });
    this.box(x1 - x0 + wall, slab, z1 - z0 + wall, [this.poche, this.poche, floor, this.poche, this.poche, this.poche], (x0 + x1 - wall) / 2, -slab / 2, (z0 + z1 - wall) / 2);

    // left wall
    const lt = wallTexture(5, 1.05 / h);
    lt.repeat.set(3, 1);
    const left = new THREE.MeshStandardMaterial({ map: lt, roughness: 0.9 });
    this.box(wall, h, z1 - z0 + wall, [left, left, this.poche, left, left, left], x0 - wall / 2, h / 2, (z0 + z1 - wall) / 2);
    // skirting
    this.box(0.02, 0.1, z1 - z0, this.woodDark, x0 + 0.01, 0.05, (z0 + z1) / 2);
    this.box(x1 - x0, 0.1, 0.02, this.woodDark, (x0 + x1) / 2, 0.05, z0 + 0.01);

    // the door to the corridor, at the front end of the left wall, shut;
    // the coat stand waits beside it
    const dz = 2.0, dw = 0.82, dh = 2.02;
    const doorMat = new THREE.MeshStandardMaterial({ color: '#6f7d70', roughness: 0.6 });
    const frame = new THREE.MeshStandardMaterial({ color: '#4a4f47', roughness: 0.6 });
    this.box(0.035, dh, dw, doorMat, x0 + 0.02, dh / 2, dz);
    for (const s of [-1, 1]) this.box(0.05, dh + 0.06, 0.06, frame, x0 + 0.025, (dh + 0.06) / 2, dz + s * (dw / 2 + 0.03));
    this.box(0.05, 0.06, dw + 0.12, frame, x0 + 0.025, dh + 0.03, dz);
    // wired-glass vision panel, kick plate, lever handle
    this.box(0.004, 0.42, 0.16, new THREE.MeshStandardMaterial({ color: '#2b3433', roughness: 0.1, metalness: 0.3 }), x0 + 0.039, 1.55, dz + 0.12, this.group, false);
    this.box(0.004, 0.2, dw - 0.06, this.steel, x0 + 0.039, 0.12, dz, this.group, false);
    this.box(0.03, 0.06, 0.06, this.chrome, x0 + 0.05, 1.02, dz - dw / 2 + 0.08);
    this.box(0.02, 0.02, 0.13, this.chrome, x0 + 0.07, 1.02, dz - dw / 2 + 0.13);
    // light switch beside it
    this.box(0.012, 0.09, 0.09, this.beige, x0 + 0.006, 1.2, dz - dw / 2 - 0.16);

    // a ceiling that only casts shadow, so the sun comes in by the window alone
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 2, 0.05, z1 - z0 + 4), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    ceiling.position.set((x0 + x1) / 2, h + 0.03, (z0 + z1) / 2 + 1);
    ceiling.castShadow = true;
    this.group.add(ceiling);
  }

  /** Back wall with the strip window, the blind, and the street outside. */
  private window() {
    const { x0, x1, z0, h, wall } = R;
    const shape = new THREE.Shape();
    shape.moveTo(x0 - wall, 0);
    shape.lineTo(x1, 0);
    shape.lineTo(x1, h);
    shape.lineTo(x0 - wall, h);
    shape.lineTo(x0 - wall, 0);
    const hole = new THREE.Path();
    hole.moveTo(WIN.x0, WIN.y0);
    hole.lineTo(WIN.x1, WIN.y0);
    hole.lineTo(WIN.x1, WIN.y1);
    hole.lineTo(WIN.x0, WIN.y1);
    hole.lineTo(WIN.x0, WIN.y0);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wall, bevelEnabled: false });
    // world-space UVs so the paint lines up
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x0) / 2.4, pos.getY(i) / h);
    const wt = wallTexture(6, 1.05 / h);
    const paint = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.9 });
    const m = new THREE.Mesh(geo, [paint, this.poche]);
    m.position.z = z0 - wall;
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    this.box(x1 - x0 + wall, 0.02, wall, this.poche, (x0 + x1 - wall) / 2, h + 0.01, z0 - wall / 2, this.group, false);
    this.box(wall, 0.02, R.z1 - z0 + wall, this.poche, x0 - wall / 2, h + 0.01, (z0 + R.z1 - wall) / 2, this.group, false);

    // the street, day and night, and the rain on the glass
    const w = WIN.x1 - WIN.x0, wh = WIN.y1 - WIN.y0;
    const plane = new THREE.PlaneGeometry(w, wh);
    const day = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: streetTexture(false), toneMapped: false }));
    const nightMat = new THREE.MeshBasicMaterial({ map: streetTexture(true), toneMapped: false, transparent: true, opacity: 0 });
    const night = new THREE.Mesh(plane, nightMat);
    night.name = 'night-view';
    night.userData.mat = nightMat;
    const rain = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.rain, transparent: true, opacity: 0.4, depthWrite: false }));
    const cx = (WIN.x0 + WIN.x1) / 2, cy = (WIN.y0 + WIN.y1) / 2;
    day.position.set(cx, cy, z0 - wall - 0.25);
    night.position.set(cx, cy, z0 - wall - 0.249);
    rain.position.set(cx, cy, z0 - wall * 0.5);
    this.group.add(day, night, rain);
    // frame and the sill
    this.box(w + 0.08, 0.04, wall + 0.08, this.wood, cx, WIN.y0 - 0.02, z0 - wall / 2 + 0.04);
    for (const x of [WIN.x0 + w / 3, WIN.x0 + (2 * w) / 3]) this.box(0.03, wh, 0.04, this.steel, x, cy, z0 - wall * 0.5);
    // the venetian blind, slats tilted half open
    const slat = new THREE.BoxGeometry(w - 0.04, 0.003, 0.045);
    const slatMat = new THREE.MeshStandardMaterial({ color: '#e7e1d0', roughness: 0.6 });
    // drawn half up: open slats over the top, the street visible below
    const n = 9;
    const im = new THREE.InstancedMesh(slat, slatMat, n + 1);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      mm.compose(new THREE.Vector3(cx, WIN.y1 - 0.02 - i * 0.04, z0 + 0.04), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.62, 0, 0)), new THREE.Vector3(1, 1, 1));
      im.setMatrixAt(i, mm);
    }
    // the bottom rail
    mm.compose(new THREE.Vector3(cx, WIN.y1 - 0.02 - n * 0.04, z0 + 0.04), new THREE.Quaternion(), new THREE.Vector3(1, 4, 0.6));
    im.setMatrixAt(n, mm);
    im.castShadow = true;
    this.group.add(im);
    this.box(w + 0.06, 0.05, 0.07, slatMat, cx, WIN.y1 + 0.02, z0 + 0.04);
    // the street lamp outside, at night
    this.street.position.set(cx, h + 1.4, z0 - 1.6);
    this.street.target.position.set(cx + 0.4, 0, z0 + 2.4);
    this.street.castShadow = true;
    this.street.shadow.mapSize.set(1024, 1024);
    this.group.add(this.street, this.street.target);
  }

  private makePasserby() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: passerbyTexture(), transparent: true, depthWrite: false }));
    m.position.set(WIN.x0 - 1, WIN.y0 + 0.2, R.z0 - R.wall - 0.2);
    this.group.add(m);
    return m;
  }

  /* ---------------- the desk and the computer ---------------- */
  private desk() {
    const g = new THREE.Group();
    g.position.set(1.45, 0, -1.9);
    this.group.add(g);
    const W = 1.6, D = 0.8, H = 0.75;
    this.box(W, 0.04, D, this.wood, 0, H - 0.02, 0, g);
    // two pedestals and a modesty panel
    for (const x of [-W / 2 + 0.22, W / 2 - 0.22]) {
      this.box(0.42, H - 0.04, D - 0.04, this.woodDark, x, (H - 0.04) / 2, 0, g);
      for (let k = 0; k < 3; k++) {
        this.box(0.38, 0.19, 0.01, this.wood, x, 0.12 + k * 0.22, D / 2 - 0.015, g);
        this.box(0.08, 0.012, 0.02, this.chrome, x, 0.19 + k * 0.22, D / 2 - 0.002, g);
      }
    }
    this.box(W - 0.9, 0.4, 0.02, this.woodDark, 0, H - 0.25, -D / 2 + 0.05, g);

    // desktop case, monitor, keyboard, mouse
    const top = H;
    const caseMat = new THREE.MeshStandardMaterial({ map: caseTexture(), roughness: 0.55 });
    this.box(0.46, 0.13, 0.42, [this.beige, this.beige, this.beige, this.beige, caseMat, this.beige], -0.1, top + 0.065, -0.12, g);
    const mon = new THREE.Group();
    mon.position.set(-0.1, top + 0.13, -0.12);
    g.add(mon);
    this.round(0.42, 0.37, 0.07, 0.025, this.beige, 0, 0.2, 0.17, mon);
    this.round(0.34, 0.3, 0.3, 0.05, this.beige, 0, 0.19, -0.02, mon);
    this.box(0.2, 0.02, 0.2, this.beige, 0, 0.01, 0.0, mon);
    // the glass, slightly domed in look; the live screen is laid over it
    this.screenMat = new THREE.MeshStandardMaterial({ color: '#0d0905', emissive: '#3a2206', emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.1 });
    // a dark recess round the tube, then the glass itself
    this.box(SCREEN.w + 0.05, SCREEN.h + 0.05, 0.004, this.black, 0, 0.205, 0.204, mon, false);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), this.screenMat);
    glass.position.set(0, 0.205, 0.2062);
    mon.add(glass);
    this.screenAnchor.position.set(0, 0.205, 0.2068);
    mon.add(this.screenAnchor);
    this.crtGlow.position.set(0, 0.2, 0.45);
    mon.add(this.crtGlow);
    const kb = new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.6 });
    this.box(0.46, 0.03, 0.16, [this.beige, this.beige, kb, this.beige, this.beige, this.beige], -0.1, top + 0.015, 0.2, g);
    this.round(0.06, 0.03, 0.1, 0.012, this.beige, 0.24, top + 0.015, 0.2, g);

    // anglepoise lamp
    const lamp = new THREE.Group();
    lamp.position.set(0.6, top, -0.2);
    g.add(lamp);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 24), this.black);
    base.position.y = 0.015;
    const arm1 = this.box(0.015, 0.4, 0.015, this.black, 0, 0.21, 0, lamp);
    arm1.rotation.x = -0.35;
    const arm2 = this.box(0.015, 0.36, 0.015, this.black, 0, 0.5, 0.17, lamp);
    arm2.rotation.x = 1.0;
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#2f4237', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, emissive: '#ffd090', emissiveIntensity: 0 });
    this.lampShades.push(shadeMat);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.14, 24, 1, true), shadeMat);
    shade.position.set(0, 0.56, 0.33);
    shade.rotation.x = Math.PI * 0.82;
    shade.castShadow = true;
    lamp.add(base, shade);
    this.deskLamp.position.set(0, 0.53, 0.36);
    this.deskLamp.target.position.set(-0.3, -0.2, 0.55);
    this.deskLamp.castShadow = true;
    this.deskLamp.shadow.mapSize.set(1024, 1024);
    this.deskLamp.shadow.bias = -0.0008;
    lamp.add(this.deskLamp, this.deskLamp.target);

    // in-tray with papers, Heuss's thermos and a mug
    this.box(0.34, 0.06, 0.26, this.steel, -0.6, top + 0.03, -0.15, g);
    this.box(0.3, 0.04, 0.22, new THREE.MeshStandardMaterial({ color: '#efe9d8', roughness: 0.9 }), -0.6, top + 0.06, -0.15, g);
    const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 20), new THREE.MeshStandardMaterial({ color: '#d7cfb9', roughness: 0.4 }));
    thermos.position.set(0.45, top + 0.13, 0.18);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 20), new THREE.MeshStandardMaterial({ color: '#9b3a2a', roughness: 0.4 }));
    cap.position.set(0.45, top + 0.285, 0.18);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 20), new THREE.MeshStandardMaterial({ color: '#efe9d8', roughness: 0.35 }));
    mug.position.set(-0.45, top + 0.045, 0.22);
    for (const o of [thermos, cap, mug]) {
      o.castShadow = o.receiveShadow = true;
      g.add(o);
    }

    // office chair on the user's side, pushed back and swung a little aside,
    // as if someone just got up (it also keeps the screen clear for the camera)
    const chair = new THREE.Group();
    chair.position.set(0.48, 0, 0.78);
    chair.rotation.y = Math.PI + 0.55;
    g.add(chair);
    const seatMat = new THREE.MeshStandardMaterial({ map: corduroyTexture('#3d3a46'), roughness: 0.85 });
    this.round(0.48, 0.08, 0.46, 0.03, seatMat, 0, 0.48, 0, chair);
    this.round(0.44, 0.5, 0.07, 0.03, seatMat, 0, 0.82, -0.22, chair);
    this.box(0.04, 0.4, 0.04, this.chrome, 0, 0.26, 0, chair);
    for (let i = 0; i < 5; i++) {
      const leg = this.box(0.3, 0.025, 0.03, this.black, 0, 0.05, 0, chair);
      leg.rotation.y = (i / 5) * Math.PI * 2;
      leg.translateX(0.15);
    }

    this.hit('desk', 1.8, 1.4, 1.6, 1.45, 0.7, -1.55);
  }

  /* ---------------- sofa, coffee table, projector ---------------- */
  private sofaCorner() {
    const g = new THREE.Group();
    g.position.set(0.55, 0, 0.72);
    g.rotation.y = -Math.PI / 2;
    this.group.add(g);
    // built facing +z, then turned to face -x: across the coffee table at the screen
    const fabric = new THREE.MeshStandardMaterial({ map: corduroyTexture('#8a6a3a'), roughness: 0.9 });
    const L = 1.9;
    this.round(L, 0.24, 0.82, 0.06, fabric, 0, 0.22, 0, g);
    this.round(L, 0.5, 0.2, 0.08, fabric, 0, 0.6, -0.36, g);
    for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) this.round(0.18, 0.48, 0.84, 0.07, fabric, x, 0.36, 0, g);
    for (const x of [-0.42, 0.42]) {
      const c = this.round(0.8, 0.14, 0.62, 0.06, fabric, x, 0.4, 0.06, g);
      c.rotation.x = 0.03;
    }
    for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) for (const z of [-0.32, 0.32]) this.box(0.05, 0.1, 0.05, this.woodDark, x, 0.05, z, g);
    // a cushion fallen against the arm
    const cushion = this.round(0.4, 0.38, 0.12, 0.06, new THREE.MeshStandardMaterial({ map: corduroyTexture('#5a3a2e'), roughness: 0.9 }), L / 2 - 0.4, 0.62, -0.2, g);
    cushion.rotation.set(-0.3, 0.3, -0.25);

    // rug, coffee table, and what is on it
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }));
    rug.rotation.x = -Math.PI / 2;
    rug.rotation.z = Math.PI / 2;
    rug.position.set(-0.75, 0.003, 0.72);
    rug.receiveShadow = true;
    this.group.add(rug);
    const t = new THREE.Group();
    t.position.set(-0.85, 0, 0.72);
    this.group.add(t);
    this.box(0.62, 0.035, 1.05, this.wood, 0, 0.42, 0, t);
    this.box(0.56, 0.02, 0.98, this.woodDark, 0, 0.12, 0, t);
    for (const x of [-0.27, 0.27]) for (const z of [-0.48, 0.48]) this.box(0.035, 0.42, 0.035, this.woodDark, x, 0.21, z, t);
    // magazines, a stack of cassettes, a cup
    this.box(0.22, 0.012, 0.3, new THREE.MeshStandardMaterial({ color: '#c3b49a', roughness: 0.9 }), 0.1, 0.444, 0.3, t).rotation.y = 0.2;
    this.box(0.21, 0.01, 0.29, new THREE.MeshStandardMaterial({ color: '#6c7f8a', roughness: 0.9 }), 0.12, 0.455, 0.32, t).rotation.y = 0.35;
    for (let i = 0; i < 4; i++) this.box(0.11, 0.017, 0.07, new THREE.MeshStandardMaterial({ color: ['#2b2a28', '#d9d2c0', '#8b2f22', '#2b2a28'][i], roughness: 0.4 }), 0.1, 0.446 + i * 0.018, -0.32, t).rotation.y = i * 0.12;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 18), new THREE.MeshStandardMaterial({ color: '#efe9d8', roughness: 0.35 }));
    cup.position.set(-0.15, 0.468, 0.42);
    cup.castShadow = true;
    t.add(cup);
    // a box of slides waiting to go in, a few loose ones, a loupe
    const sbox = new THREE.MeshStandardMaterial({ map: slideBoxTexture(), roughness: 0.7 });
    const yellow = new THREE.MeshStandardMaterial({ color: '#d9a62e', roughness: 0.7 });
    this.box(0.13, 0.05, 0.09, [yellow, yellow, sbox, yellow, yellow, yellow], -0.12, 0.462, -0.12, t).rotation.y = 0.25;
    const mountMat = new THREE.MeshStandardMaterial({ color: '#ece6d6', roughness: 0.8 });
    for (let i = 0; i < 4; i++) {
      const m = this.box(0.05, 0.0018, 0.05, mountMat, -0.02 + i * 0.03, 0.4385 + i * 0.0018, 0.05 + (i % 2) * 0.02, t);
      m.rotation.y = 0.3 + i * 0.45;
    }
    const loupe = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.045, 24), new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.4 }));
    loupe.position.set(0.14, 0.46, -0.02);
    loupe.castShadow = true;
    t.add(loupe);

    // the screen pulled down on the left wall: roller case, end caps, the cloth, the bar
    const x = R.x0 + 0.04;
    const sw = 1.5, sh = 1.12, top = 2.42, cz = PICTURE.at.z;
    const caseGeo = new THREE.CylinderGeometry(0.045, 0.045, sw + 0.12, 24);
    const roller = new THREE.Mesh(caseGeo, this.steel);
    roller.rotation.x = Math.PI / 2;
    roller.position.set(x + 0.05, top + 0.04, cz);
    roller.castShadow = true;
    this.group.add(roller);
    for (const k of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.02, 24), this.black);
      cap.rotation.x = Math.PI / 2;
      cap.position.set(x + 0.05, top + 0.04, cz + k * (sw / 2 + 0.07));
      cap.castShadow = true;
      this.group.add(cap);
      this.box(0.05, 0.02, 0.02, this.black, x + 0.025, top + 0.04, cz + k * (sw / 2 + 0.07));
    }
    // the cloth hangs with a slight belly
    const cloth = new THREE.PlaneGeometry(sw, sh, 24, 16);
    const cp = cloth.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const u = cp.getX(i) / (sw / 2), v = (cp.getY(i) + sh / 2) / sh;
      cp.setZ(i, (1 - u * u) * 0.008 * Math.sin(v * Math.PI));
    }
    cloth.computeVertexNormals();
    const screen = new THREE.Mesh(cloth, new THREE.MeshStandardMaterial({ map: screenTexture(), roughness: 0.96 }));
    screen.rotation.y = Math.PI / 2;
    screen.position.set(x + 0.035, top - sh / 2, cz);
    screen.receiveShadow = true;
    screen.userData.zone = 'screen';
    this.group.add(screen);
    this.hits.screen = screen;
    // weighted bar and its pull tab
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, sw + 0.02, 16), this.black);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x + 0.04, top - sh - 0.006, cz);
    bar.castShadow = true;
    this.group.add(bar);
    this.box(0.006, 0.05, 0.03, this.black, x + 0.045, top - sh - 0.035, cz);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 8, 20), this.chrome);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x + 0.045, top - sh - 0.07, cz);
    this.group.add(ring);

    // the projector on its trolley, behind the sofa, throwing over it
    this.projector = new Projector({ at: new THREE.Vector3(1.38, 0, 0.72), aim: PICTURE.at, width: PICTURE.w });
    this.group.add(this.projector.group, ...this.projector.lightParts);
    this.hits.projector = this.projector.hit;
    // the trays, each in its box, standing in a crate on the rug at the end of the coffee table
    this.crate = new TrayCrate(this.group, this.trays, {
      at: new THREE.Vector3(-1.25, 0.004, -0.2),
      hold: TRAY_HOLD,
      holdDir: SOFA_DIR,
      projector: this.projector,
      mounted: this.trays[0]?.id,
      reduce: this.reduce,
      zh: this.zh,
    });

    // standard lamp by the sofa
    const fl = new THREE.Group();
    fl.position.set(0.75, 0, 1.92);
    this.group.add(fl);
    const fBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.03, 24), this.black);
    fBase.position.y = 0.015;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 10), this.chrome);
    pole.position.y = 0.76;
    const fShadeMat = new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffcf8a', emissiveIntensity: 0, transparent: true, opacity: 0.95 });
    this.lampShades.push(fShadeMat);
    const fShade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.28, 28, 1, true), fShadeMat);
    fShade.position.y = 1.55;
    for (const o of [fBase, pole, fShade]) {
      o.castShadow = true;
      fl.add(o);
    }
    this.floorLamp.position.set(0, 1.5, 0);
    this.floorLamp.castShadow = true;
    this.floorLamp.shadow.mapSize.set(512, 512);
    fl.add(this.floorLamp);

    this.hit('sofa', 2.4, 1.0, 2.2, -0.1, 0.5, 0.72);
  }

  /* ---------------- sideboard and the cassette deck ---------------- */
  private sideboard() {
    const g = new THREE.Group();
    g.position.copy(SIDEBOARD);
    this.group.add(g);
    this.box(1.6, 0.72, 0.46, this.woodDark, 0, 0.4, 0, g);
    this.box(1.64, 0.03, 0.5, this.wood, 0, 0.775, 0, g);
    for (const x of [-0.6, 0.6]) for (const z of [-0.18, 0.18]) this.box(0.04, 0.05, 0.04, this.black, x, 0.025, z, g);
    for (const x of [-0.4, 0.4]) this.box(0.76, 0.6, 0.01, this.wood, x, 0.4, 0.231, g);
    // the deck
    const face = new THREE.MeshStandardMaterial({ map: deckTexture(), roughness: 0.45, metalness: 0.3 });
    const body = new THREE.MeshStandardMaterial({ color: '#a8a59c', roughness: 0.45, metalness: 0.35 });
    this.box(0.5, 0.15, 0.3, [body, body, body, body, face, body], -0.4, 0.865, 0.02, g);
    this.deckParts(g);
    // speakers either side
    const grille = new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.95 });
    for (const x of [-0.74, -0.05]) this.box(0.16, 0.26, 0.2, [this.woodDark, this.woodDark, this.woodDark, this.woodDark, grille, this.woodDark], x, 0.92, 0.04, g);
    this.hit('deck', 1.7, 0.8, 0.7, -1.6, 0.75, R.z0 + 0.3);
    // the deck alone, for a click that means play / stop
    this.hit('deckBody', 0.52, 0.16, 0.32, SIDEBOARD.x - 0.4, 0.865, SIDEBOARD.z + 0.02);
  }

  /**
   * On the deck's face (0.5 × 0.15 m, drawn 1024 × 300): two wells a cassette
   * can sit in, two VU needles, and the tape counter. The tapes themselves
   * live in the rack beside it (cassettes.ts).
   */
  private deckParts(g: THREE.Group) {
    const px = (x: number, y: number): [number, number] => [-0.4 - 0.25 + (x / 1024) * 0.5, 0.865 + 0.075 - (y / 300) * 0.15];
    const front = 0.02 + 0.15;
    const d = this.deck;
    const well = (x: number) => {
      const [wx, wy] = px(x, 120);
      return new THREE.Vector3(wx, wy, front);
    };
    this.shelf = new TapeShelf(g, this.tapes, { A: well(190), B: well(520) }, DECK_DIR, this.reduce);
    const needleMat = new THREE.MeshStandardMaterial({ color: '#1d1c1a', roughness: 0.6 });
    for (const x of [775, 925]) {
      const geo = new THREE.BoxGeometry(0.0011, 0.033, 0.0008);
      geo.translate(0, 0.0165, 0);
      const n = new THREE.Mesh(geo, needleMat);
      const [nx, ny] = px(x, 128);
      n.position.set(nx, ny, front + 0.001);
      n.rotation.z = 0.62;
      g.add(n);
      d.needles.push(n);
    }
    const counter = new THREE.Mesh(new THREE.PlaneGeometry(0.044, 0.0165), new THREE.MeshBasicMaterial({ map: d.counter.tex }));
    const [cx, cy] = px(755, 197);
    counter.position.set(cx, cy, front + 0.0006);
    g.add(counter);
  }

  /** Where a held tape is read, in room coordinates. */
  holdPoint() {
    return this.shelf.hold.p.clone().add(SIDEBOARD);
  }

  /** Per frame: hubs turn at each well's speed (rad/s), needles follow `level` (0..1). */
  deckTick(dt: number, spin: Record<Well, number>, level: number, counter: number) {
    const d = this.deck;
    this.shelf.tick(dt, spin);
    // fast up, slow down, like a real meter
    d.vu += (level - d.vu) * Math.min(1, dt * (level > d.vu ? 18 : 4));
    d.needles.forEach((n, i) => (n.rotation.z = 0.62 - Math.min(1.25, d.vu * (i ? 1.18 : 1.24) * 1.25)));
    d.counter.draw(counter);
  }

  /* ---------------- walls: board, calendar, map, clock ---------------- */
  private walls(records: { file: string; slug: string; title: string; date?: string; stamp: string; category: string }[]) {
    const x = R.x0;
    // cork board with the latest backflow events pinned up
    const bw = 1.4, bh = 0.95;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.03, bh, bw), [this.wood, this.wood, this.wood, this.wood, this.wood, this.wood]);
    const cork = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.06, bh - 0.06), new THREE.MeshStandardMaterial({ map: corkTexture(), roughness: 0.95 }));
    board.position.set(x + 0.015, 1.55, -1.3);
    cork.rotation.y = Math.PI / 2;
    cork.position.set(x + 0.032, 1.55, -1.3);
    board.castShadow = true;
    cork.receiveShadow = true;
    this.group.add(board, cork);
    const events = records.filter((r) => r.category === 'events').slice(-5);
    const pin = new THREE.MeshStandardMaterial({ color: '#c4321f', roughness: 0.35 });
    events.forEach((r, i) => {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshStandardMaterial({ map: noticeTexture(r.file, r.title, r.date ?? '', r.stamp), roughness: 0.9 }));
      card.rotation.y = Math.PI / 2;
      card.rotation.x = ((i * 37) % 7 - 3) * 0.02;
      const col = i % 3, row = Math.floor(i / 3);
      card.position.set(x + 0.036 + i * 0.0005, 1.75 - row * 0.36, -1.3 - 0.42 + col * 0.42 + row * 0.2);
      card.castShadow = card.receiveShadow = true;
      card.userData.notice = r.slug;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), pin);
      head.position.set(0.01, 0.07, 0);
      card.add(head);
      this.group.add(card);
      this.notices.push({ mesh: card, file: r.file, slug: r.slug });
    });
    // calendar, between the board and the screen
    const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.49), new THREE.MeshStandardMaterial({ map: calendarTexture(), roughness: 0.9 }));
    cal.rotation.y = Math.PI / 2;
    cal.position.set(x + 0.012, 1.55, -0.34);
    cal.castShadow = cal.receiveShadow = true;
    this.group.add(cal);
    this.hit('wall', 0.4, 1.4, 4.6, x + 0.2, 1.6, 0.2);

    // framed island map above the sideboard
    const mw = 0.96, mh = 0.58;
    this.box(mw + 0.06, mh + 0.06, 0.03, this.woodDark, -1.6, 1.55, R.z0 + 0.015);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshStandardMaterial({ map: mapTexture(), roughness: 0.6 }));
    map.position.set(-1.6, 1.55, R.z0 + 0.032);
    map.receiveShadow = true;
    this.group.add(map);

    // wall clock
    const c = this.clock.group;
    c.position.set(-3.0, 2.3, R.z0 + 0.03);
    this.group.add(c);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 40), this.black);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    this.clock.face = new THREE.MeshStandardMaterial({ map: clockFaceTexture('AXIS'), roughness: 0.5 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), this.clock.face);
    face.position.z = 0.026;
    c.add(rim, face);
    const hand = (len: number, w: number, z: number, mat: THREE.Material) => {
      const geo = new THREE.BoxGeometry(w, len, 0.004);
      geo.translate(0, len / 2 - 0.02, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.z = z;
      c.add(m);
      return m;
    };
    this.clock.hour = hand(0.1, 0.012, 0.03, this.black);
    this.clock.minute = hand(0.145, 0.008, 0.034, this.black);
    this.clock.second = hand(0.15, 0.003, 0.038, new THREE.MeshStandardMaterial({ color: '#b8281d' }));
    this.hit('clock', 0.45, 0.45, 0.2, -3.0, 2.3, R.z0 + 0.1);
  }

  /* ---------------- corners: filing cabinet, tape cabinet, coats, plant ---------------- */
  private corners() {
    // four-drawer filing cabinet
    const fc = new THREE.Group();
    fc.position.set(-3.08, 0, R.z0 + 0.3);
    this.group.add(fc);
    const olive = new THREE.MeshStandardMaterial({ color: '#7c8065', metalness: 0.4, roughness: 0.5 });
    this.box(0.47, 1.32, 0.6, olive, 0, 0.66, 0, fc);
    for (let k = 0; k < 4; k++) {
      this.box(0.43, 0.29, 0.01, olive, 0, 0.18 + k * 0.32, 0.3, fc);
      this.box(0.12, 0.02, 0.03, this.chrome, 0, 0.26 + k * 0.32, 0.315, fc);
      this.box(0.1, 0.04, 0.005, new THREE.MeshStandardMaterial({ color: '#efe9d8' }), 0, 0.3 + k * 0.32, 0.31, fc);
    }
    // Heuss's year-field proposals in grey binders on top, 01 to 08,
    // and a binder's width left empty before the bookend
    const binder = new THREE.MeshStandardMaterial({ color: '#8c8a83', roughness: 0.55 });
    const label = new THREE.MeshStandardMaterial({ color: '#efe9d8', roughness: 0.9 });
    const T = 0.044, x0 = -0.215;
    for (let k = 0; k < 8; k++) {
      const h = 0.3 - (k % 3) * 0.004;
      const x = x0 + T / 2 + k * (T + 0.002);
      this.box(T, h, 0.27, binder, x, 1.32 + h / 2, 0.02, fc);
      this.box(T * 0.6, 0.07, 0.004, label, x, 1.32 + h * 0.62, 0.157, fc, false);
      this.box(T * 0.3, T * 0.3, 0.004, this.black, x, 1.32 + 0.05, 0.157, fc, false);
    }
    const end = x0 + 9 * (T + 0.002) + 0.003;
    this.box(0.004, 0.18, 0.16, this.steel, end, 1.32 + 0.09, 0.02, fc);
    this.box(0.05, 0.004, 0.16, this.steel, end + 0.025, 1.322, 0.02, fc);
    // the last of the old machines: a backup cabinet with two reels
    const mc = new THREE.Group();
    mc.position.set(3.05, 0, R.z0 + 0.3);
    this.group.add(mc);
    const putty = new THREE.MeshStandardMaterial({ color: '#cbc6b8', roughness: 0.6 });
    this.box(0.62, 1.75, 0.5, putty, 0, 0.875, 0, mc);
    this.box(0.5, 0.36, 0.01, this.black, 0, 1.3, 0.251, mc);
    for (const x of [-0.13, 0.13]) {
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 32), new THREE.MeshStandardMaterial({ color: '#4b3a24', roughness: 0.5 }));
      reel.rotation.x = Math.PI / 2;
      reel.position.set(x, 1.3, 0.265);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), this.chrome);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(x, 1.3, 0.27);
      mc.add(reel, hub);
      this.reels.push(reel);
    }
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffb547', emissive: '#ffb547', emissiveIntensity: i % 2 ? 1.2 : 0.1 }));
      l.position.set(-0.2 + i * 0.08, 0.95, 0.255);
      mc.add(l);
    }
    for (let k = 0; k < 6; k++) this.box(0.46, 0.012, 0.01, this.black, 0, 0.25 + k * 0.05, 0.252, mc);

    // coat stand with a raincoat and a wet umbrella
    const cs = new THREE.Group();
    cs.position.set(-2.62, 0, 2.28);
    this.group.add(cs);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.75, 10), this.woodDark);
    pole.position.y = 0.875;
    pole.castShadow = true;
    cs.add(pole);
    for (let i = 0; i < 3; i++) {
      const foot = this.box(0.3, 0.025, 0.03, this.woodDark, 0, 0.02, 0, cs);
      foot.rotation.y = (i / 3) * Math.PI * 2;
    }
    const coat = this.round(0.36, 0.8, 0.16, 0.07, new THREE.MeshStandardMaterial({ color: '#b39a62', roughness: 0.9 }), 0.08, 1.25, 0.1, cs);
    coat.rotation.z = 0.08;
    const umb = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#1e2b3a', roughness: 0.3, side: THREE.DoubleSide }));
    umb.position.set(0.22, 0.38, -0.05);
    umb.rotation.z = Math.PI + 0.12;
    umb.castShadow = true;
    cs.add(umb);
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ color: '#4c5a5c', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.5 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0.24, 0.002, -0.04);
    cs.add(puddle);

    // a rubber plant
    const pl = new THREE.Group();
    pl.position.set(3.05, 0, 2.0);
    this.group.add(pl);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 20), new THREE.MeshStandardMaterial({ color: '#9b5a3a', roughness: 0.8 }));
    pot.position.y = 0.16;
    pot.castShadow = true;
    pl.add(pot);
    const leafGeo = new THREE.SphereGeometry(0.1, 10, 6);
    leafGeo.scale(1, 0.18, 0.55);
    const leafMat = new THREE.MeshStandardMaterial({ color: '#2e4a2c', roughness: 0.45 });
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4, y = 0.45 + (i / 18) * 0.85, r = 0.08 + (1 - i / 18) * 0.12;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      leaf.rotation.set(0.3, -a, -0.5);
      leaf.castShadow = true;
      pl.add(leaf);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 1.0, 6), this.woodDark);
    stem.position.y = 0.8;
    pl.add(stem);
  }

  /** Water dripping off the umbrella into its puddle. */
  private makeDrips() {
    const n = 6;
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#b9d0e0', size: 0.012, transparent: true, opacity: 0.8 }));
    this.group.add(p);
    return p;
  }

  /** Clock hands for a time offset in hours. */
  setClock(now: Date, offset: number) {
    const h = (now.getHours() + offset + 24) % 12, m = now.getMinutes(), s = now.getSeconds() + now.getMilliseconds() / 1000;
    this.clock.hour.rotation.z = -((h + m / 60) / 12) * Math.PI * 2;
    this.clock.minute.rotation.z = -((m + s / 60) / 60) * Math.PI * 2;
    this.clock.second.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
  }

  setClockLabel(label: string) {
    this.clock.face.map?.dispose();
    this.clock.face.map = clockFaceTexture(label);
    this.clock.face.needsUpdate = true;
  }

  /** Per-frame bits: rain, someone walking past, drips, reels. */
  tick(t: number, dt: number) {
    this.rain.offset.y += dt * 0.03;
    // a passer-by every twenty seconds or so, left to right
    const cycle = (t % 22) / 22;
    const span = WIN.x1 - WIN.x0 + 1.2;
    this.passerby.position.x = WIN.x0 - 0.6 + cycle * span * 1.0;
    this.passerby.position.y = WIN.y0 + 0.2 + Math.abs(Math.sin(t * 6)) * 0.01;
    this.passerby.visible = cycle < 0.55;
    // drops fall from the umbrella's tip into the puddle, one after another
    const pos = this.drips.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = (t * 0.7 + i / pos.count) % 1;
      pos.setXYZ(i, -3.05 + 0.25, 0.05 * (1 - k), 2.15 - 0.05);
    }
    pos.needsUpdate = true;
    for (const r of this.reels) r.rotation.y += dt * 0.25;
    this.crate.tick(dt);
  }
}
