/**
 * The library: a reading room seen through a long lens. Walnut cases along
 * the back wall, a gallery with an iron rail above them, arched windows onto
 * the rain, a ring chandelier, and a long table of green-shaded lamps in the
 * foreground.
 *
 * Hover a catalogued spine and the book slides out a little. Pick it and it
 * comes off the shelf, crosses the room and lands open on the table under a
 * lamp, while the camera leans in over it. Pages turn with a curl.
 *
 * Books are built in their reading pose (cover facing +z, spine on the left),
 * turned a quarter on the shelf, and laid flat (cover up) on the table.
 */
import * as THREE from 'three';
import type { LibBay, LibBook, LibPage } from '../../lib/library';
import { Spring, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { canvasFontsReady } from '../scene/textures';
import {
  coverTexture, dustTexture, edgeTexture, endpaperTexture, pageTexture, plateTexture, rainTexture, setLibAniso, spineTexture, tileTexture, windowView, woodTexture,
} from './textures';

const BAY_W = 4.2;
const ROW_H = 1.75;
const ROWS = 4;
const PLINTH = 0.2;
const CASE_D = 0.95;
const SPINE_Z = CASE_D / 2 - 0.04;
const SIDE = 0.12;
const BOOK_ROW = 1;
const CASE_TOP = PLINTH + ROWS * ROW_H;
const GALLERY = CASE_TOP + 0.3;
const TABLE_Y = 1.5;
const TABLE_Z = 8.4;
const LEAF_SEG = 24;
const BOARD = 0.028;
/** Where the stacks view looks, and from how low. */
const LOOK_Y = 5.4;
const CAM_Y = 2.5;

const base = (row: number) => PLINTH + (ROWS - 1 - row) * ROW_H;

export interface LibEvents {
  hover(book: LibBook | null, gap: boolean): void;
  open(book: LibBook): void;
  /** The book is open on the table: the reader can show the page. */
  ready?(): void;
  closed(): void;
  gap(): void;
  /** The bay nearest the middle of the view changed. */
  bay(i: number): void;
}

interface Book {
  data: LibBook;
  bay: number;
  group: THREE.Group;
  pivot: THREE.Group;
  W: number;
  H: number;
  T: number;
  shelf: THREE.Vector3;
  out: Spring;
  hits: THREE.Object3D[];
  spineMat: THREE.MeshStandardMaterial;
  coverMat: THREE.MeshStandardMaterial;
  rightMat: THREE.MeshStandardMaterial;
  leftMat: THREE.MeshStandardMaterial;
  left: THREE.Mesh;
}

interface Look {
  bg: THREE.Color;
  hemi: number;
  fill: number;
  lamps: number;
  chand: number;
  night: number;
}
const LOOKS: Record<'day' | 'night', Look> = {
  day: { bg: new THREE.Color('#2b2620'), hemi: 1.15, fill: 1.5, lamps: 1.6, chand: 6, night: 0 },
  night: { bg: new THREE.Color('#0b0a09'), hemi: 0.1, fill: 0.12, lamps: 5.5, chand: 26, night: 1 },
};

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const CLOTHS = ['#5a2a22', '#2f3d2c', '#283447', '#6b4a2a', '#3a2f2a', '#7a6a4f', '#4a1f1f', '#1f2a24', '#8a7a5a', '#504236', '#6d5a3c', '#33302b'];

export class LibraryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(18, 1, 0.5, 120);
  private hemi = new THREE.HemisphereLight(0xdfe4ea, 0x6b4a30, 1);
  private fill = new THREE.DirectionalLight(0xffeedd, 1.4);
  private shelfLight = new THREE.SpotLight(0xffcf8f, 0, 30, 0.42, 0.7, 1.2);
  private lampLights: THREE.PointLight[] = [];
  private chandLight = new THREE.PointLight(0xffd08a, 0, 22, 1.4);
  private bulbs: THREE.MeshBasicMaterial[] = [];
  private lampXs: number[] = [];
  private nightGlass: THREE.MeshBasicMaterial[] = [];
  private rain = rainTexture();

  private books: Book[] = [];
  private plates: { mesh: THREE.Mesh; bay: LibBay }[] = [];
  private gapHit: THREE.Mesh | null = null;
  private hovered: Book | null = null;
  private gapHover = false;

  private active: Book | null = null;
  private holding = false;
  private ready = false;
  private queued: { id: string; pages: LibPage[]; page: number } | null = null;
  private pull = new Spring(0, 3.6);
  private cover = new Spring(0, 5.5);
  private desk = new Spring(0, 2.8);
  private spot = new THREE.Vector3();

  private leaf: THREE.Group;
  private leafGeo: THREE.PlaneGeometry;
  private leafFront: THREE.MeshStandardMaterial;
  private leafBack: THREE.MeshStandardMaterial;
  private flip = new Spring(0, 7);
  private flipDir = 0;
  private page = 0;
  private pages: LibPage[] = [];
  private texCache = new Map<string, THREE.Texture>();

  private camX: Spring;
  private minX = 0;
  private maxX = 0;
  private dist = 26;
  private shift = 0;
  private bayNow = -1;
  private pointer = new THREE.Vector2(9, 9);
  private parallax = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private drag: { x: number; cam: number; moved: number; id: number } | null = null;
  private wheelT = 0;
  private rowEnd = new Map<number, number>();

  private look: Look = { ...LOOKS.day, bg: LOOKS.day.bg.clone() };
  private lookTarget = LOOKS.day;
  private zh = false;
  private reduce = reducedMotion();
  private raf = 0;
  private last = 0;
  private edge = edgeTexture();

  /** Set by the controller: a book was clicked on the shelf. */
  picked: ((b: LibBook) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private bays: LibBay[], private on: LibEvents, startBay = 0) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setLibAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.scene.background = this.look.bg;
    this.scene.fog = new THREE.Fog(this.look.bg.clone(), 34, 70);

    this.fill.castShadow = true;
    this.fill.shadow.mapSize.set(2048, 2048);
    this.fill.shadow.bias = -0.0006;
    this.fill.shadow.normalBias = 0.03;
    const sc = this.fill.shadow.camera;
    sc.left = -12;
    sc.right = 12;
    sc.top = 10;
    sc.bottom = -8;
    sc.far = 60;
    this.shelfLight.castShadow = true;
    this.shelfLight.shadow.mapSize.set(1024, 1024);
    this.shelfLight.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.fill, this.fill.target, this.shelfLight, this.shelfLight.target, this.chandLight);
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffd9a0, 0, 5, 1.5);
      this.lampLights.push(l);
      this.scene.add(l);
    }

    this.camX = new Spring(startBay * BAY_W, 4.2);
    this.build();

    this.leafGeo = new THREE.PlaneGeometry(1, 1, LEAF_SEG, 1);
    this.leafFront = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.FrontSide });
    this.leafBack = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.BackSide });
    this.leaf = new THREE.Group();
    const lf = new THREE.Mesh(this.leafGeo, this.leafFront);
    const lb = new THREE.Mesh(this.leafGeo, this.leafBack);
    lf.castShadow = lb.castShadow = true;
    this.leaf.add(lf, lb);
    this.leaf.visible = false;

    this.bind();
    this.resize();
    this.start();
  }

  /* ------------------------------------------------------------------ */
  /* The room                                                            */
  /* ------------------------------------------------------------------ */
  private build() {
    const n = this.bays.length;
    this.minX = 0;
    this.maxX = (n - 1) * BAY_W;
    const x0 = -2.5 * BAY_W, x1 = (n + 1.5) * BAY_W;

    const walnut = new THREE.MeshStandardMaterial({ map: woodTexture(3), roughness: 0.55, metalness: 0.05 });
    const walnutDark = new THREE.MeshStandardMaterial({ map: woodTexture(4, '#2e1d12'), roughness: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b08a4a', metalness: 0.85, roughness: 0.32 });
    const iron = new THREE.MeshStandardMaterial({ color: '#1d1e20', metalness: 0.6, roughness: 0.45 });
    const plaster = new THREE.MeshStandardMaterial({ color: '#b9ad97', roughness: 0.95 });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = shadow;
      this.scene.add(m);
      return m;
    };

    // floor and back wall
    const tiles = tileTexture();
    tiles.repeat.set(30, 12);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 36), new THREE.MeshStandardMaterial({ map: tiles, color: '#8a7a6e', roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.maxX / 2, 0, 12);
    floor.receiveShadow = true;
    this.scene.add(floor);
    add(new THREE.BoxGeometry(x1 - x0 + 30, 16, 0.2), plaster, (x0 + x1) / 2, 8, -0.75, false);

    // lower cases, bay by bay (plus dressed bays past each end)
    const shelfGeo = new THREE.BoxGeometry(BAY_W - SIDE, 0.06, CASE_D);
    const sideGeo = new THREE.BoxGeometry(SIDE, CASE_TOP, CASE_D + 0.06);
    const backGeo = new THREE.BoxGeometry(BAY_W, CASE_TOP, 0.04);
    const plinthGeo = new THREE.BoxGeometry(BAY_W, PLINTH, CASE_D + 0.04);
    for (let i = -2; i <= n + 1; i++) {
      const cx = i * BAY_W;
      add(sideGeo, walnut, cx - BAY_W / 2, CASE_TOP / 2, 0);
      add(backGeo, walnutDark, cx, CASE_TOP / 2, -CASE_D / 2 + 0.02);
      add(plinthGeo, walnutDark, cx, PLINTH / 2, 0.02);
      for (let r = 0; r <= ROWS; r++) add(shelfGeo, walnut, cx, base(r) - 0.03, 0);
    }
    // cornice, gallery floor, and a brass strip along the fascia
    add(new THREE.BoxGeometry(x1 - x0, 0.3, CASE_D + 0.3), walnut, (x0 + x1) / 2, CASE_TOP + 0.15, 0.1);
    add(new THREE.BoxGeometry(x1 - x0, 0.14, 2.1), walnutDark, (x0 + x1) / 2, GALLERY + 0.07, 0.3);
    add(new THREE.BoxGeometry(x1 - x0, 0.03, 0.02), brass, (x0 + x1) / 2, CASE_TOP + 0.06, CASE_D / 2 + 0.26);

    // iron balustrade along the gallery edge
    const railZ = 1.3;
    add(new THREE.BoxGeometry(x1 - x0, 0.06, 0.08), walnut, (x0 + x1) / 2, GALLERY + 1.0, railZ);
    add(new THREE.BoxGeometry(x1 - x0, 0.03, 0.03), iron, (x0 + x1) / 2, GALLERY + 0.24, railZ);
    add(new THREE.BoxGeometry(x1 - x0, 0.02, 0.02), iron, (x0 + x1) / 2, GALLERY + 0.86, railZ);
    const nBal = Math.floor((x1 - x0) / 0.2);
    const bal = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), iron, nBal);
    const ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16), iron, nBal);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nBal; i++) {
      const x = x0 + 0.1 + i * 0.2;
      bal.setMatrixAt(i, m4.makeTranslation(x, GALLERY + 0.55, railZ));
      ring.setMatrixAt(i, m4.makeTranslation(x + 0.1, GALLERY + 0.55, railZ));
    }
    bal.castShadow = true;
    this.scene.add(bal, ring);

    // upper level: cases and arched windows in turn
    for (let i = -2; i <= n + 1; i++) {
      const cx = i * BAY_W;
      if (((i % 2) + 2) % 2 === 1) this.window(cx, iron, plaster);
      else {
        add(new THREE.BoxGeometry(BAY_W - 0.2, 4.2, 0.6), walnutDark, cx, GALLERY + 2.2, -0.35);
        for (let r = 0; r < 2; r++) add(new THREE.BoxGeometry(BAY_W - 0.3, 0.05, 0.6), walnut, cx, GALLERY + 0.25 + r * 1.7, -0.3);
      }
    }

    this.table(x0, x1, brass, walnut);
    this.chandelier(this.maxX / 2 - BAY_W, brass);
    this.chandelier(this.maxX / 2 + BAY_W * 1.5, brass);

    for (let i = 0; i < n; i++) this.buildBay(i);
    this.fillers(n);
    void this.relabel(this.zh, true);
  }

  /** Arched steel window onto the rain, with a view that changes at night. */
  private window(cx: number, iron: THREE.Material, plaster: THREE.Material) {
    const w = 2.8, h0 = GALLERY + 0.5, hh = 4.6, r = w / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-r, 0);
    shape.lineTo(r, 0);
    shape.lineTo(r, hh - r);
    shape.absarc(0, hh - r, r, 0, Math.PI, false);
    shape.lineTo(-r, 0);
    const geo = new THREE.ShapeGeometry(shape, 24);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + r) / w, pos.getY(i) / hh);
    const seed = Math.round(cx * 10) + 7;
    const day = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: windowView(false, seed), toneMapped: false, fog: false }));
    const nightMat = new THREE.MeshBasicMaterial({ map: windowView(true, seed), toneMapped: false, transparent: true, opacity: 0, fog: false });
    const night = new THREE.Mesh(geo, nightMat);
    const rain = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.rain, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
    this.nightGlass.push(nightMat);
    for (const [m, z] of [[day, -0.62], [night, -0.615], [rain, -0.61]] as const) {
      m.position.set(cx, h0, z);
      this.scene.add(m);
    }
    // deep reveal around the opening
    const reveal = new THREE.Mesh(new THREE.ShapeGeometry(shape, 24), plaster);
    reveal.scale.set(1.12, 1.05, 1);
    reveal.position.set(cx, h0 - 0.12, -0.64);
    this.scene.add(reveal);
    // mullions: verticals cut to the arch, transoms below it, a ring of voussoirs
    const bars = new THREE.Group();
    const bar = (bw: number, bh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), iron);
      m.position.set(x, y, 0);
      bars.add(m);
    };
    for (let k = -2; k <= 2; k++) {
      const x = (k / 3) * r * 1.5;
      const top = hh - r + Math.sqrt(Math.max(0, r * r - x * x));
      bar(0.035, top, x, top / 2);
    }
    for (let y = 0.7; y < hh - r; y += 0.72) bar(w, 0.03, 0, y);
    for (let a = 0; a <= 1.0001; a += 1 / 24) {
      const ang = Math.PI * a;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), iron);
      m.position.set(Math.cos(ang) * r, hh - r + Math.sin(ang) * r, 0);
      m.rotation.z = ang;
      bars.add(m);
    }
    bar(0.06, hh - r, -r, (hh - r) / 2);
    bar(0.06, hh - r, r, (hh - r) / 2);
    bars.position.set(cx, h0, -0.58);
    this.scene.add(bars);
  }

  /** The long reading table, its lamps and its chairs. */
  private table(x0: number, x1: number, brass: THREE.Material, walnut: THREE.Material) {
    const oakTex = woodTexture(9, '#6e4a2c');
    oakTex.repeat.set(8, 1);
    const oak = new THREE.MeshStandardMaterial({ map: oakTex, roughness: 0.42, metalness: 0.02 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.09, 2.3), oak);
    top.position.set((x0 + x1) / 2, TABLE_Y - 0.045, TABLE_Z);
    top.castShadow = top.receiveShadow = true;
    this.scene.add(top);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.18, 2.1), walnut);
    apron.position.set((x0 + x1) / 2, TABLE_Y - 0.18, TABLE_Z);
    this.scene.add(apron);
    const legGeo = new THREE.BoxGeometry(0.12, TABLE_Y - 0.1, 0.12);
    for (let x = x0 + 1; x < x1; x += 3.2)
      for (const dz of [-0.95, 0.95]) {
        const leg = new THREE.Mesh(legGeo, walnut);
        leg.position.set(x, (TABLE_Y - 0.1) / 2, TABLE_Z + dz);
        leg.castShadow = true;
        this.scene.add(leg);
      }

    // banker's lamps down the middle: brass foot, green glass shade
    const shadeMat = new THREE.MeshStandardMaterial({ color: '#1f4a35', roughness: 0.25, metalness: 0.2, emissive: '#0d2a1c', emissiveIntensity: 0.4, side: THREE.DoubleSide });
    const baseGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.04, 24);
    const stemGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.42, 8);
    // half a cylinder lying along x, open side down
    const shadeGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.5, 20, 1, true, -Math.PI / 2, Math.PI);
    shadeGeo.rotateZ(Math.PI / 2);
    const capGeo = new THREE.CircleGeometry(0.17, 20, 0, Math.PI);
    const bulbGeo = new THREE.SphereGeometry(0.05, 12, 8);
    for (let x = x0 + 1.05; x < x1; x += 2.1) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(baseGeo, brass);
      b.position.y = 0.02;
      const s = new THREE.Mesh(stemGeo, brass);
      s.position.y = 0.25;
      const shade = new THREE.Group();
      const sh = new THREE.Mesh(shadeGeo, shadeMat);
      const c1 = new THREE.Mesh(capGeo, brass);
      c1.rotation.y = Math.PI / 2;
      c1.position.x = 0.25;
      const c2 = new THREE.Mesh(capGeo, brass);
      c2.rotation.y = -Math.PI / 2;
      c2.position.x = -0.25;
      shade.add(sh, c1, c2);
      shade.position.y = 0.5;
      shade.rotation.x = -0.2;
      const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false });
      this.bulbs.push(bulbMat);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(0, 0.45, 0.02);
      g.add(b, s, shade, bulb);
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      bulb.castShadow = false;
      g.position.set(x, TABLE_Y, TABLE_Z - 0.55);
      this.scene.add(g);
      this.lampXs.push(x);
    }

    // chairs along the near side, a few pushed back
    const chairTex = woodTexture(12, '#3a2414');
    const chairMat = new THREE.MeshStandardMaterial({ map: chairTex, roughness: 0.6 });
    const seat = new THREE.BoxGeometry(0.5, 0.05, 0.48);
    const post = new THREE.BoxGeometry(0.05, 1.0, 0.05);
    const rail = new THREE.BoxGeometry(0.5, 0.14, 0.04);
    const legG = new THREE.BoxGeometry(0.045, 0.48, 0.045);
    let k = 0;
    for (let x = x0 + 1.05; x < x1; x += 1.05, k++) {
      if (k % 5 === 3) continue;
      const g = new THREE.Group();
      const s = new THREE.Mesh(seat, chairMat);
      s.position.y = 0.48;
      const p1 = new THREE.Mesh(post, chairMat);
      p1.position.set(-0.22, 0.5, 0.22);
      const p2 = new THREE.Mesh(post, chairMat);
      p2.position.set(0.22, 0.5, 0.22);
      const r1 = new THREE.Mesh(rail, chairMat);
      r1.position.set(0, 0.92, 0.22);
      const r2 = new THREE.Mesh(rail, chairMat);
      r2.position.set(0, 0.72, 0.22);
      g.add(s, p1, p2, r1, r2);
      for (const [lx, lz] of [[-0.22, -0.2], [0.22, -0.2]]) {
        const l = new THREE.Mesh(legG, chairMat);
        l.position.set(lx, 0.24, lz);
        g.add(l);
      }
      g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
      g.position.set(x + ((k * 37) % 7 - 3) * 0.03, 0, TABLE_Z + 1.25 + (k % 4 === 1 ? 0.35 : 0));
      g.rotation.y = ((k * 13) % 5 - 2) * 0.04;
      this.scene.add(g);
    }
  }

  /** Three rings of bulbs on brass hoops, hung from far above. */
  private chandelier(x: number, brass: THREE.Material) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#ffd796', toneMapped: false });
    this.bulbs.push(mat);
    const bulb = new THREE.SphereGeometry(0.045, 10, 8);
    for (const [r, y, nB] of [[1.05, 0, 30], [0.72, -0.34, 22], [0.4, -0.62, 14]] as const) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 8, 48), brass);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      g.add(hoop);
      const im = new THREE.InstancedMesh(bulb, mat, nB);
      const m = new THREE.Matrix4();
      for (let i = 0; i < nB; i++) {
        const a = (i / nB) * Math.PI * 2;
        im.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, y + 0.06, Math.sin(a) * r));
      }
      g.add(im);
    }
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), brass);
    bowl.position.y = -0.62;
    g.add(bowl);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const from = new THREE.Vector3(Math.cos(a) * 1.05, 0, Math.sin(a) * 1.05), to = new THREE.Vector3(0, 6, 0);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, from.distanceTo(to), 4), brass);
      chain.position.copy(from).lerp(to, 0.5);
      chain.lookAt(to);
      chain.rotateX(Math.PI / 2);
      g.add(chain);
    }
    g.position.set(x, CASE_TOP + 0.35, 3.8);
    this.scene.add(g);
    if (!this.chandLight.userData.placed) {
      this.chandLight.position.set(x, CASE_TOP, 3.8);
      this.chandLight.userData.placed = true;
    }
  }

  /**
   * Everything that is not catalogued: old volumes on the other rows, the
   * rest of the book row past the bookend, the end bays and the gallery.
   */
  private fillers(n: number) {
    const vols: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let k = 0;
    const col = () => new THREE.Color(CLOTHS[(k * 7 + 3) % CLOTHS.length]).multiplyScalar(0.85 + ((k * 13) % 7) * 0.04);
    const run = (from: number, to: number, y: number, zFront: number, hMax: number) => {
      let x = from;
      while (true) {
        const t = 0.06 + ((k * 7) % 6) * 0.022;
        const h = Math.min(hMax, 0.95 + ((k * 11) % 9) * 0.06);
        if ((k * 17) % 29 === 0) x += 0.3;
        if ((k * 19) % 31 === 5 && x + 1.1 < to) {
          // a short stack lying flat
          for (let j = 0; j < 3 + (k % 3); j++) {
            const lt = 0.07 + ((k + j) % 3) * 0.02, lh = 1.0 - j * 0.06;
            q.setFromEuler(new THREE.Euler(0, ((j * 5) % 3 - 1) * 0.05, Math.PI / 2));
            m.compose(new THREE.Vector3(x + 0.5, y + 0.005 + lt / 2 + j * 0.095, zFront - 0.36), q, new THREE.Vector3(lt, lh, 0.7));
            vols.push({ m: m.clone(), c: col() });
            k++;
          }
          x += 1.05;
          continue;
        }
        if (x + t > to) break;
        q.identity();
        m.compose(new THREE.Vector3(x + t / 2, y + h / 2 + 0.001, zFront - (0.7 * h) / 2 - ((k * 5) % 3) * 0.012), q, new THREE.Vector3(t, h, 0.7 * h));
        vols.push({ m: m.clone(), c: col() });
        x += t + 0.003;
        k++;
      }
    };
    for (let b = -2; b <= n + 1; b++) {
      const left = b * BAY_W - BAY_W / 2 + SIDE / 2 + 0.05;
      const right = b * BAY_W + BAY_W / 2 - SIDE / 2 - 0.05;
      for (let r = 0; r < ROWS; r++) {
        if (r === BOOK_ROW && b >= 0 && b < n) {
          const from = this.rowEnd.get(b) ?? left;
          if (from < right - 0.5) run(from + 0.3, right, base(r), SPINE_Z, ROW_H - 0.2);
          continue;
        }
        run(left, right, base(r), SPINE_Z, ROW_H - 0.2);
      }
      // the gallery cases
      if (((b % 2) + 2) % 2 === 0) for (let r = 0; r < 2; r++) run(left + 0.1, right - 0.1, GALLERY + 0.28 + r * 1.7, -0.05, 1.4);
    }
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.78 }), vols.length);
    vols.forEach((v, i) => {
      im.setMatrixAt(i, v.m);
      im.setColorAt(i, v.c);
    });
    im.castShadow = im.receiveShadow = true;
    this.scene.add(im);
  }

  private buildBay(i: number) {
    const bay = this.bays[i];
    const left = i * BAY_W - BAY_W / 2 + SIDE / 2 + 0.08;
    const right = i * BAY_W + BAY_W / 2 - SIDE / 2 - 0.08;
    const y = base(BOOK_ROW);
    let x = left;
    const place = (w: number) => {
      const at = x;
      x += w + 0.006;
      return at;
    };
    // a full bay squeezes its books a little rather than wrapping to the next row
    const need = bay.books.reduce((s, b) => s + b.thick * 1.25 + 0.006, bay.gapAt !== undefined ? 0.2 : 0);
    const scale = Math.min(1, (right - left - 0.3) / need);
    bay.books.forEach((data, j) => {
      if (bay.gapAt === j) this.makeGap(place(0.18), y);
      this.makeBook(data, i, place(data.thick * 1.25 * scale), y, scale);
    });
    if (bay.gapAt === bay.books.length) this.makeGap(place(0.18), y);
    // brass bookend after the last catalogued book
    const be = place(0.02);
    const endMat = new THREE.MeshStandardMaterial({ color: '#8f6f3a', metalness: 0.85, roughness: 0.35 });
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.8, 0.46), endMat);
    upright.position.set(be + 0.006, y + 0.4, SPINE_Z - 0.32);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.006, 0.46), endMat);
    foot.position.set(be + 0.13, y + 0.003, SPINE_Z - 0.32);
    upright.castShadow = foot.castShadow = true;
    this.scene.add(upright, foot);
    this.rowEnd.set(i, be + 0.02);

    // brass label holder on the shelf edge under the books
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.219), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 }));
    plate.position.set(left + 0.72, y - 0.15, CASE_D / 2 + 0.006);
    this.scene.add(plate);
    this.plates.push({ mesh: plate, bay });
  }

  private makeGap(x: number, y: number) {
    const dust = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.72), new THREE.MeshBasicMaterial({ map: dustTexture(), transparent: true, opacity: 0.4, depthWrite: false }));
    dust.rotation.x = -Math.PI / 2;
    dust.position.set(x + 0.09, y + 0.003, SPINE_Z - 0.38);
    this.scene.add(dust);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.0, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(x + 0.09, y + 0.5, SPINE_Z - 0.35);
    hit.userData.gap = true;
    this.scene.add(hit);
    this.gapHit = hit;
  }

  private makeBook(data: LibBook, bay: number, x: number, y: number, scale: number) {
    const H = 1.5 * data.h, W = 0.7 * H, T = data.thick * 1.25 * scale, c = BOARD;
    const cloth = new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.8 });
    const spineMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
    const coverMat = new THREE.MeshStandardMaterial({ roughness: 0.78 });
    const endMat = new THREE.MeshStandardMaterial({ map: endpaperTexture(data), roughness: 0.9 });
    const edgeMat = new THREE.MeshStandardMaterial({ map: this.edge, roughness: 0.95 });
    const rightMat = new THREE.MeshStandardMaterial({ roughness: 0.95, color: '#ece5d3' });

    const group = new THREE.Group();
    const hits: THREE.Object3D[] = [];
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], px: number, py: number, pz: number, parent: THREE.Object3D = group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      hits.push(m);
      return m;
    };
    // back board, spine, page block
    mesh(new THREE.BoxGeometry(W, H, c), cloth, 0, 0, -T / 2 + c / 2);
    mesh(new THREE.BoxGeometry(c, H, T), [cloth, spineMat, cloth, cloth, cloth, cloth], -W / 2 + c / 2, 0, 0);
    const bw = W - c - 0.016, bh = H - 0.034, bt = Math.max(0.01, T - 2 * c);
    mesh(new THREE.BoxGeometry(bw, bh, bt), [edgeMat, edgeMat, edgeMat, edgeMat, rightMat, edgeMat], -W / 2 + c + bw / 2, 0, 0);
    // front board on a hinge at the spine, level with the top of the pages
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, T / 2 - c);
    group.add(pivot);
    mesh(new THREE.BoxGeometry(W, H, c), [cloth, cloth, cloth, cloth, coverMat, endMat], W / 2, 0, c / 2, pivot);
    // the left-hand page rides on the inside of the board
    const leftMat = new THREE.MeshStandardMaterial({ color: '#d8d2c2', roughness: 0.95 });
    const left = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), leftMat);
    left.rotation.y = Math.PI;
    left.position.set(W / 2 + 0.008, 0, -0.003);
    left.visible = false;
    pivot.add(left);

    const shelf = new THREE.Vector3(x + T / 2, y + H / 2 + 0.001, SPINE_Z - W / 2);
    group.position.copy(shelf);
    group.rotation.y = Math.PI / 2;
    this.scene.add(group);
    const book: Book = { data, bay, group, pivot, W, H, T, shelf, out: new Spring(0, 11), hits, spineMat, coverMat, rightMat, leftMat, left };
    hits.forEach((h) => (h.userData.book = book));
    this.books.push(book);
  }

  /** Redraw everything with words on it (language switch, fonts arriving). */
  async relabel(zh: boolean, first = false) {
    this.zh = zh;
    if (zh) await canvasFontsReady(this.bays.flatMap((b) => [b.title.zh, ...b.books.flatMap((x) => [x.spine.zh, x.sub.zh])]).join(''));
    for (const b of this.books) {
      const px = 128;
      const hPx = Math.min(1536, Math.round((px * b.H) / Math.max(0.09, b.T)));
      b.spineMat.map?.dispose();
      b.spineMat.map = spineTexture(b.data, zh, px, hPx);
      b.spineMat.needsUpdate = true;
      b.coverMat.map?.dispose();
      b.coverMat.map = coverTexture(b.data, zh);
      b.coverMat.needsUpdate = true;
    }
    for (const p of this.plates) {
      const m = p.mesh.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.map = plateTexture(p.bay.code, zh ? p.bay.title.zh : p.bay.title.en.toUpperCase());
      m.needsUpdate = true;
    }
    if (!first && this.active && this.holding) {
      this.clearPages();
      this.dress(this.active, this.page);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  start() {
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!document.hidden) this.frame();
    };
    loop();
  }

  setTheme(theme: 'day' | 'night') {
    this.lookTarget = LOOKS[theme];
  }

  goBay(i: number) {
    this.camX.target = Math.min(this.maxX, Math.max(this.minX, i * BAY_W));
  }

  get isOpen() {
    return this.holding;
  }

  /** Take a book off the shelf and lay it open on the table at `page`. */
  take(id: string, pages: LibPage[], page = 0) {
    const b = this.books.find((x) => x.data.id === id);
    if (!b) return;
    if (this.active && this.active !== b) {
      // finish putting the other one back first
      this.queued = { id, pages, page };
      this.shelve();
      return;
    }
    this.goBay(b.bay);
    // the place at the table in front of the book's bay
    const want = b.bay * BAY_W;
    const mid = this.lampXs.map((x) => x + 1.05).reduce((a, c) => (Math.abs(c - want) < Math.abs(a - want) ? c : a), want);
    this.spot.set(mid - 0.15, TABLE_Y, TABLE_Z + 0.5);
    this.active = b;
    this.holding = true;
    this.pages = pages;
    this.page = Math.max(0, Math.min(pages.length - 1, page));
    this.clearPages();
    this.dress(b, this.page);
    this.pull.target = 1;
    this.desk.target = 1;
    b.out.target = 0;
    b.group.add(this.leaf);
    this.leaf.visible = false;
    this.hover(null, false);
    if (this.reduce) {
      this.pull.set(1);
      this.desk.set(1);
    }
    this.on.open(b.data);
  }

  /** Close the book and put it back. */
  shelve() {
    if (!this.active || !this.holding) return;
    this.holding = false;
    this.desk.target = 0;
    this.flip.set(this.flip.target);
    this.flipDir = 0;
    this.leaf.visible = false;
    if (this.reduce) {
      this.cover.set(0);
      this.pull.set(0);
      this.desk.set(0);
    }
  }

  /** Turn to page `n` (one leaf at a time). */
  turn(n: number) {
    const b = this.active;
    if (!b || !this.holding || n === this.page || n < 0 || n >= this.pages.length) return false;
    const dir = n > this.page ? 1 : -1;
    const from = this.page;
    this.page = n;
    if (this.reduce || this.cover.value < 0.9) {
      this.dress(b, n);
      return true;
    }
    // the leaf carries the page being turned over
    const turning = dir > 0 ? from : n;
    this.leafFront.map = this.pageTex(b, turning, 'r');
    this.leafBack.map = this.mirror(this.pageTex(b, turning, 'l'));
    this.leafFront.needsUpdate = this.leafBack.needsUpdate = true;
    if (dir > 0) {
      b.rightMat.map = this.pageTex(b, n, 'r');
      b.rightMat.needsUpdate = true;
      this.flip.set(0);
      this.flip.target = 1;
    } else {
      b.leftMat.map = n === 0 ? this.titleTex(b) : this.pageTex(b, n - 1, 'l');
      b.leftMat.needsUpdate = true;
      this.flip.set(1);
      this.flip.target = 0;
    }
    this.flipDir = dir;
    this.leaf.visible = true;
    return true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  /* ------------------------------------------------------------------ */
  /* Pages                                                               */
  /* ------------------------------------------------------------------ */
  private key(b: Book, n: number, side: string) {
    return `${b.data.id}|${n}|${side}|${this.zh ? 'zh' : 'en'}`;
  }

  private pageTex(b: Book, n: number, side: 'l' | 'r') {
    const k = this.key(b, n, side);
    let t = this.texCache.get(k);
    if (!t) {
      t = pageTexture(b.data, n, this.pages[n]?.head ?? null, this.zh, side);
      this.texCache.set(k, t);
    }
    return t;
  }

  private titleTex(b: Book) {
    const k = this.key(b, -1, 't');
    let t = this.texCache.get(k);
    if (!t) {
      t = pageTexture(b.data, -1, null, this.zh, 'l', true);
      this.texCache.set(k, t);
    }
    return t;
  }

  private mirror(t: THREE.Texture) {
    const k = `${t.uuid}|m`;
    let m = this.texCache.get(k);
    if (!m) {
      m = t.clone();
      m.wrapS = THREE.RepeatWrapping;
      m.repeat.x = -1;
      m.offset.x = 1;
      m.needsUpdate = true;
      this.texCache.set(k, m);
    }
    return m;
  }

  private clearPages() {
    for (const t of this.texCache.values()) t.dispose();
    this.texCache.clear();
  }

  /** Put the right textures on an open spread at page `n`. */
  private dress(b: Book, n: number) {
    b.rightMat.map = this.pageTex(b, n, 'r');
    b.rightMat.color.set('#ffffff');
    b.rightMat.needsUpdate = true;
    b.leftMat.map = n === 0 ? this.titleTex(b) : this.pageTex(b, n - 1, 'l');
    b.leftMat.color.set('#ffffff');
    b.leftMat.needsUpdate = true;
  }

  /** Bend the leaf: the free edge lags the spine, so the page curls over. */
  private bendLeaf(b: Book, f: number) {
    const pos = this.leafGeo.attributes.position as THREE.BufferAttribute;
    const w = b.W - BOARD - 0.02, h = b.H - 0.04;
    const ds = w / LEAF_SEG;
    const lift = Math.sin(Math.PI * f) * 0.06;
    let x = 0, z = 0;
    const cols: [number, number][] = [[0, 0]];
    for (let i = 0; i < LEAF_SEG; i++) {
      const u = (i + 0.5) / LEAF_SEG;
      const a = Math.PI * smooth(0, 1, f * 1.45 - u * 0.45);
      x += Math.cos(a) * ds;
      z += Math.sin(a) * ds + lift / LEAF_SEG;
      cols.push([x, z]);
    }
    for (let j = 0; j <= 1; j++)
      for (let i = 0; i <= LEAF_SEG; i++) pos.setXYZ(j * (LEAF_SEG + 1) + i, cols[i][0], (0.5 - j) * h, cols[i][1]);
    pos.needsUpdate = true;
    this.leafGeo.computeVertexNormals();
    this.leafGeo.computeBoundingSphere();
    this.leaf.position.set(-b.W / 2 + BOARD + 0.004, 0, b.T / 2 - BOARD + 0.006);
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */
  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    const k = damp(2.2, dt);
    const L = this.look, T = this.lookTarget;
    L.bg.lerp(T.bg, k);
    (this.scene.fog as THREE.Fog).color.copy(L.bg);
    for (const key of ['hemi', 'fill', 'lamps', 'chand', 'night'] as const) L[key] += (T[key] - L[key]) * k;

    const cx = this.camX.update(dt);
    const e = smooth(0, 1, this.desk.update(dt));
    // reading at the table, the room dims round the one lamp
    const room = 1 - e * 0.55;
    this.hemi.intensity = L.hemi * room;
    this.fill.intensity = L.fill * room;
    this.chandLight.intensity = L.chand * room;
    this.shelfLight.intensity = (6 + L.night * 24) * room;
    this.shelfLight.visible = this.shelfLight.intensity > 0.3;
    for (const g of this.nightGlass) g.opacity = L.night;
    for (const b of this.bulbs) b.color.setRGB(1, 0.86, 0.6).multiplyScalar(0.55 + L.night * 0.6);
    this.rain.offset.y += dt * 0.035;

    // camera: the stacks through a long lens, or leaning over the table
    this.parallax.lerp(this.drag || this.holding ? this.parallax.clone().multiplyScalar(0.9) : this.pointer.clone().clampScalar(-1, 1), damp(2, dt));
    const sx = cx - this.shift;
    const stackPos = new THREE.Vector3(sx + this.parallax.x * 0.6, CAM_Y - this.parallax.y * 0.3, this.dist);
    const stackAt = new THREE.Vector3(sx, LOOK_Y, 0);
    let pos = stackPos, at = stackAt;
    if (e > 0.0001 && this.active) {
      const d = this.deskDistance(this.active);
      const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const visW = 2 * d * tan * this.camera.aspect, visH = 2 * d * tan;
      const portrait = this.camera.aspect < 0.85;
      const deskAt = this.spot.clone();
      if (portrait) deskAt.z += visH * 0.24;
      else deskAt.x += visW * 0.2;
      const dir = new THREE.Vector3(0, 0.42, 0.9).normalize();
      const deskPos = deskAt.clone().addScaledVector(dir, d);
      pos = stackPos.clone().lerp(deskPos, e);
      at = stackAt.clone().lerp(deskAt, e);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(at);
    this.camera.updateMatrixWorld();

    const bay = Math.round(cx / BAY_W);
    if (bay !== this.bayNow) {
      this.bayNow = bay;
      this.on.bay(bay);
    }

    this.fill.position.set(cx - 6, 14, 14);
    this.fill.target.position.set(cx, 3, 0);
    const lampAt = this.hovered ? this.hovered.group.position.x : cx;
    this.shelfLight.position.lerp(new THREE.Vector3(lampAt + 0.8, CASE_TOP + 1.6, 6), damp(3, dt));
    this.shelfLight.target.position.lerp(new THREE.Vector3(lampAt, base(BOOK_ROW) + 0.7, 0), damp(3, dt));
    // the three table lamps nearest the view (or the book) carry real light
    const near = this.active && e > 0.01 ? this.spot.x : cx;
    const xs = [...this.lampXs].sort((a, b) => Math.abs(a - near) - Math.abs(b - near)).slice(0, 3);
    this.lampLights.forEach((l, i) => {
      l.position.set(xs[i] ?? 0, TABLE_Y + 0.38, TABLE_Z - 0.2);
      l.intensity = L.lamps * (i === 0 ? 1 + e * 1.4 : 1 - e * 0.4);
    });

    for (const b of this.books) {
      const out = b.out.update(dt);
      if (b === this.active) continue;
      b.group.position.set(b.shelf.x, b.shelf.y, b.shelf.z + out * 0.18);
    }
    if (this.active) this.pose(this.active, dt);

    this.renderer.render(this.scene, this.camera);
  }

  private deskDistance(b: Book) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.camera.aspect < 0.85;
    return Math.max(b.H / ((portrait ? 0.34 : 0.56) * 2 * tan), (b.W * 2) / ((portrait ? 0.9 : 0.46) * 2 * tan * this.camera.aspect));
  }

  /** Move the book between its shelf and the table. */
  private pose(b: Book, dt: number) {
    // the cover opens once the book is down, and shuts before it goes back
    this.cover.target = this.holding && this.pull.value > 0.93 ? 1 : 0;
    if (!this.holding) this.pull.target = this.cover.value < 0.1 ? 0 : 1;
    const p = this.pull.update(dt);
    const cv = this.cover.update(dt);
    b.pivot.rotation.y = -cv * Math.PI * 0.985;
    b.left.visible = cv > 0.02;
    if (cv > 0.3 && !this.ready) {
      this.ready = true;
      this.on.ready?.();
    }

    const shelfQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
    const deskQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.02));
    const target = this.spot.clone();
    target.y += b.T / 2 + 0.002;
    // once open, the spread (not the closed book) is centred on the spot
    target.x += (b.W / 2) * cv;

    // out of the shelf first, then a long arc across the room to the table
    const from = b.shelf.clone();
    from.z += smooth(0, 0.22, p) * 0.95;
    const fly = smooth(0.16, 1, p);
    b.group.position.lerpVectors(from, target, fly);
    b.group.position.y += Math.sin(fly * Math.PI) * 1.1;
    b.group.quaternion.slerpQuaternions(shelfQ, deskQ, smooth(0.22, 0.95, p));

    if (this.leaf.visible) {
      const f = this.flip.update(dt);
      this.bendLeaf(b, f);
      if (Math.abs(f - this.flip.target) < 0.004) {
        this.leaf.visible = false;
        if (this.flipDir > 0) {
          b.leftMat.map = this.pageTex(b, this.page - 1, 'l');
          b.leftMat.needsUpdate = true;
        } else {
          b.rightMat.map = this.pageTex(b, this.page, 'r');
          b.rightMat.needsUpdate = true;
        }
        this.flipDir = 0;
      }
    }

    if (!this.holding && p < 0.003 && cv < 0.01) {
      // back on the shelf
      b.group.position.copy(b.shelf);
      b.group.quaternion.copy(shelfQ);
      b.left.visible = false;
      b.rightMat.map = null;
      b.rightMat.color.set('#ece5d3');
      b.rightMat.needsUpdate = true;
      b.group.remove(this.leaf);
      this.pull.set(0);
      this.cover.set(0);
      this.active = null;
      this.ready = false;
      this.clearPages();
      this.on.closed();
      const q = this.queued;
      this.queued = null;
      if (q) this.take(q.id, q.pages, q.page);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  private ray(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    return this.raycaster;
  }

  private pick(x: number, y: number): { book: Book | null; gap: boolean } {
    const targets: THREE.Object3D[] = this.books.filter((b) => b !== this.active).flatMap((b) => b.hits);
    if (this.gapHit) targets.push(this.gapHit);
    const hit = this.ray(x, y).intersectObjects(targets, false)[0];
    if (!hit) return { book: null, gap: false };
    if (hit.object.userData.gap) return { book: null, gap: true };
    return { book: hit.object.userData.book as Book, gap: false };
  }

  private hover(b: Book | null, gap: boolean) {
    if (b === this.hovered && gap === this.gapHover) return;
    if (this.hovered) this.hovered.out.target = 0;
    this.hovered = b;
    this.gapHover = gap;
    if (b) b.out.target = 1;
    this.canvas.style.cursor = b || gap ? 'pointer' : this.drag ? 'grabbing' : 'grab';
    this.on.hover(b?.data ?? null, gap);
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.active) return;
      this.drag = { x: e.clientX, cam: this.camX.target, moved: 0, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.drag && e.pointerId === this.drag.id) {
        const dx = e.clientX - this.drag.x;
        this.drag.moved = Math.max(this.drag.moved, Math.abs(dx));
        if (this.drag.moved > 6) {
          const perPx = (2 * this.dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / r.height;
          this.camX.target = Math.min(this.maxX + 0.8, Math.max(this.minX - 0.8, this.drag.cam - dx * perPx));
          c.style.cursor = 'grabbing';
          this.hover(null, false);
          return;
        }
      }
      if (this.active || e.target !== c) {
        if (!this.active && e.target !== c) this.hover(null, false);
        return;
      }
      const p = this.pick(e.clientX, e.clientY);
      this.hover(p.book, p.gap);
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d || e.pointerId !== d.id) return;
      if (d.moved > 6) {
        this.goBay(Math.round(this.camX.target / BAY_W));
        c.style.cursor = 'grab';
        return;
      }
      if (this.active) return;
      const p = this.pick(e.clientX, e.clientY);
      if (p.gap) this.on.gap();
      else if (p.book) this.picked?.(p.book.data);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', () => (this.drag = null));
    c.addEventListener('pointerleave', () => {
      if (!this.drag) this.hover(null, false);
    });
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.active) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 4) return;
        e.preventDefault();
        window.clearTimeout(this.wheelT);
        this.camX.target = Math.min(this.maxX, Math.max(this.minX, this.camX.target + d * 0.008));
        this.wheelT = window.setTimeout(() => this.goBay(Math.round(this.camX.target / BAY_W)), 220);
      },
      { passive: false },
    );
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    const portrait = w / h < 0.85;
    // a long lens, like the drawer room; a phone needs a wider one
    this.camera.fov = portrait ? 30 : 18;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const fitH = 9.2 / (2 * tan);
    const fitW = (BAY_W + 0.6) / (2 * tan * this.camera.aspect);
    this.dist = portrait ? Math.max(fitW, 7.5 / (2 * tan)) : Math.max(fitH, (BAY_W * 1.45) / (2 * tan * this.camera.aspect));
    this.shift = portrait ? 0 : 2 * this.dist * tan * this.camera.aspect * 0.11;
  }
}
