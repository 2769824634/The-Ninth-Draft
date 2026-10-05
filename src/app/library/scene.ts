/**
 * The library: the reading room as a cutaway model on the page, shot with the
 * same long lens as the drawer room. The camera moves between the whole model
 * and its corners (stacks, newspaper rack, card catalogue, circulation desk),
 * and leans over the reading table when a book is open.
 *
 * Light is the room's own: daylight through the arched windows (with the
 * window bars' shadows on the floor), sky light, and at night the opal
 * pendants over the tables. Brass and varnish reflect a soft procedural room.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CatDrawer, LibBay, LibBook, LibPage } from '../../lib/library';
import { Spring, SpringV3, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { canvasFontsReady } from '../scene/textures';
import { Book, Leaves, PageCache } from './books';
import { Room, ROOM, TABLE_H, shelfPose, type ShelfRun } from './room';
import { dustTexture, plateTexture } from './textures';

export type Zone = 'overview' | 'stacks' | 'rack' | 'catalogue' | 'desk';
export const ZONES: Zone[] = ['overview', 'rack', 'stacks', 'catalogue', 'desk'];

export interface LibEvents {
  hover(info: { book?: LibBook; zone?: Zone; drawer?: number; gap?: boolean } | null): void;
  zone(z: Zone): void;
  open(book: LibBook): void;
  /** The cover is open on the table: the reader can show the page. */
  ready(): void;
  closed(): void;
  gap(): void;
  drawer(i: number): void;
  desk(): void;
  picked(book: LibBook): void;
}

interface View {
  at: THREE.Vector3;
  dir: THREE.Vector3;
  /** Width and height of what must be in frame, in metres. */
  w: number;
  h: number;
}

interface Look {
  hemi: number;
  sun: number;
  env: number;
  pend: number;
  key: number;
  night: number;
  shadow: number;
}
const LOOKS: Record<'day' | 'night', Look> = {
  day: { hemi: 0.9, sun: 2.5, env: 0.38, pend: 0, key: 0, night: 0, shadow: 0.32 },
  night: { hemi: 0.07, sun: 0.18, env: 0.05, pend: 2.6, key: 16, night: 1, shadow: 0.7 },
};

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class LibraryScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(19, 1, 0.1, 200);
  private hemi = new THREE.HemisphereLight(0xfffaf0, 0xb3a184, 1);
  private sun = new THREE.DirectionalLight(0xfff0d8, 3);
  private key = new THREE.SpotLight(0xffd8a8, 0, 30, 0.5, 0.8, 1.4);
  private shadowMat: THREE.MeshBasicMaterial;
  private room: Room;

  private books: Book[] = [];
  private plates: { mat: THREE.MeshStandardMaterial; bay: LibBay }[] = [];
  private gapHit: THREE.Mesh | null = null;
  private hovered: Book | null = null;
  private zoneHits: THREE.Object3D[] = [];

  private zoneNow: Zone = 'overview';
  private view: { at: SpringV3; dir: SpringV3; dist: Spring };
  private pan = new Spring(0, 4);
  private parallax = new THREE.Vector2();
  private pointer = new THREE.Vector2(9, 9);
  private raycaster = new THREE.Raycaster();
  private drag: { x: number; pan: number; moved: number; id: number } | null = null;

  private active: Book | null = null;
  private holding = false;
  private ready = false;
  private queued: { id: string; pages: LibPage[]; page: number } | null = null;
  private waitLadder = false;
  private pull = new Spring(0, 3.2);
  private cover = new Spring(0, 5);
  private read = new Spring(0, 2.6);
  private leaves = new Leaves();
  private cache: PageCache;
  private page = 0;
  private pages: LibPage[] = [];
  private drawerOpen = -1;
  private hoverKey = '';
  private panelSide = new Spring(0, 3);

  private look: Look = { ...LOOKS.day };
  private lookTarget = LOOKS.day;
  private zh = false;
  private reduce = reducedMotion();
  private raf = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement, private bays: LibBay[], catalogue: CatDrawer[], private on: LibEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // reflections: a soft procedural room, nothing loaded
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.cache = new PageCache(() => this.pages);
    this.room = new Room();
    this.scene.add(this.room.group);

    // a soft contact shadow where the model sits on the paper, like the drawers
    const sh = document.createElement('canvas');
    sh.width = sh.height = 256;
    const g = sh.getContext('2d')!;
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(0,0,0,1)';
    g.fillRect(34, 40, 188, 176);
    g.filter = 'none';
    const shTex = new THREE.CanvasTexture(sh);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shTex, color: '#000', transparent: true, opacity: 0.2, depthWrite: false });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry((ROOM.x1 - ROOM.x0) * 1.42, (ROOM.z1 - ROOM.z0) * 1.45), this.shadowMat);
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(0.6, -ROOM.slab - 0.01, 0.9);
    this.scene.add(paper);

    // daylight through the windows
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.015;
    this.sun.shadow.radius = 3;
    const sc = this.sun.shadow.camera;
    sc.left = -17;
    sc.right = 17;
    sc.top = 15;
    sc.bottom = -15;
    sc.near = 1;
    sc.far = 80;
    this.sun.position.copy(this.room.sunDir).multiplyScalar(-34);
    this.sun.target.position.set(0, 0, 0);
    // at night, one warm key from the pendants over wherever we are looking
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0005;
    this.key.shadow.radius = 4;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.key, this.key.target);

    this.placeBooks();
    this.room.cabinet.dress(catalogue.map((d) => ({ label: d.label, cards: d.cards.map((c) => ({ file: c.file, title: c.title.en, stamp: c.stamp })) })));
    this.zoneTargets();

    const v = this.viewOf('overview');
    this.view = { at: new SpringV3(v.at.clone(), 3), dir: new SpringV3(v.dir.clone(), 3), dist: new Spring(60, 3) };

    this.bind();
    this.resize();
    this.view.dist.set(this.fit(v));
    this.start();
    void this.relabel(false);
  }

  /* ------------------------------------------------------------------ */
  /* Books on shelves, sticks in the rack                                */
  /* ------------------------------------------------------------------ */
  private placeBooks() {
    const { west, back } = this.room.runs;
    const rack = this.room.rack;
    const onRun = (bay: LibBay, bi: number, run: ShelfRun, r: number, x0: number) => {
      let x = x0;
      const list: Book[] = [];
      bay.books.forEach((data, j) => {
        if (bay.gapAt === j) x = this.gap(run, r, x);
        const b = new Book(data, bay.zone, bi, shelfPose(run, r, x, 0.01, 0.3, 0.2));
        b.shelf = shelfPose(run, r, x, b.T, b.H, b.W);
        b.high = r >= run.reach;
        b.placeOnShelf();
        run.used.push({ row: r, a: x, b: x + b.T });
        x += b.T + 0.0015;
        list.push(b);
        this.add(b);
      });
      if (bay.gapAt === bay.books.length) x = this.gap(run, r, x);
      list.forEach((b, i) => {
        b.prev = list[i - 1] ?? null;
        b.next = list[i + 1] ?? null;
      });
      // a brass card holder on the shelf edge, under the books
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 });
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.066), mat);
      plate.position.copy(run.start).addScaledVector(run.along, x0 + 0.24).addScaledVector(UP, run.rows[r] - 0.04).addScaledVector(run.out, 0.012);
      plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), run.out);
      this.scene.add(plate);
      this.plates.push({ mat, bay });
      // keep a hand's width clear after the catalogued run
      run.used.push({ row: r, a: x, b: x + 0.12 });
    };
    this.bays.forEach((bay, bi) => {
      if (bay.zone === 'rack') {
        bay.books.forEach((data, i) => {
          const b = new Book(data, 'rack', bi, rack.slot(0, 0.4));
          b.shelf = rack.slot(i, b.W);
          b.placeOnShelf();
          this.add(b);
        });
      } else if (bay.id === 'records') onRun(bay, bi, west, 3, 0.9);
      else if (bay.id === 'gazetteer') onRun(bay, bi, west, 6, 0.6);
      else if (bay.zone === 'desk') onRun(bay, bi, back, 2, 18.0);
    });
    this.room.fill(west, 11);
    this.room.fill(back, 503);
  }

  private add(b: Book) {
    this.books.push(b);
    this.scene.add(b.group);
  }

  private gap(run: ShelfRun, r: number, x: number) {
    const w = 0.03;
    const p = shelfPose(run, r, x, w, 0.26, 0.2);
    const dust = new THREE.Mesh(new THREE.PlaneGeometry(0.2, w), new THREE.MeshBasicMaterial({ map: dustTexture(), transparent: true, opacity: 0.45, depthWrite: false }));
    dust.position.copy(p.pos).addScaledVector(UP, -0.129);
    dust.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(run.out, run.along, UP));
    this.scene.add(dust);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, w + 0.01), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(p.pos);
    hit.quaternion.copy(p.quat);
    hit.userData.gap = true;
    this.scene.add(hit);
    this.gapHit = hit;
    run.used.push({ row: r, a: x, b: x + w });
    return x + w + 0.0015;
  }

  /** Invisible boxes that take you to a corner of the room from the overview. */
  private zoneTargets() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, 13), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(ROOM.x0 + 0.4, 2.2, 0);
    m.userData.zone = 'stacks';
    this.scene.add(m);
    this.zoneHits.push(m);
    this.room.rack.hit.userData.zone = 'rack';
    this.zoneHits.push(this.room.rack.hit);
    this.room.desk.hit.userData.zone = 'desk';
    this.zoneHits.push(this.room.desk.hit);
  }

  /** Redraw everything with words on it. */
  async relabel(zh: boolean) {
    this.zh = zh;
    if (zh) await canvasFontsReady(this.bays.flatMap((b) => [b.title.zh, ...b.books.flatMap((x) => [x.spine.zh, x.sub.zh, ...x.pages.map((p) => p.head.zh)])]).join('') + '霏微日报目录记录署');
    for (const b of this.books) b.relabel(zh);
    for (const p of this.plates) {
      p.mat.map?.dispose();
      p.mat.map = plateTexture(p.bay.code, zh ? p.bay.title.zh : p.bay.title.en.toUpperCase());
      p.mat.needsUpdate = true;
    }
    if (this.active && this.holding) {
      this.leaves.finish();
      this.cache.clear();
      this.dress(this.active, this.page);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Views                                                               */
  /* ------------------------------------------------------------------ */
  private viewOf(z: Zone | 'read'): View {
    const r = this.room;
    switch (z) {
      case 'stacks':
        return { at: new THREE.Vector3(ROOM.x0 + 0.3, 2.05, 2.6 - this.pan.value), dir: new THREE.Vector3(1, 0.36, 0.42).normalize(), w: 4.6, h: 4.6 };
      case 'rack':
        return { at: r.rack.centre.clone().add(new THREE.Vector3(0, 0.1, -0.2)), dir: r.rack.out.clone().add(new THREE.Vector3(0.15, 0.55, 0)).normalize(), w: 2.3, h: 2.0 };
      case 'catalogue':
        return { at: r.cabinet.centre.clone().add(new THREE.Vector3(0, 0.15, 0.25)), dir: r.cabinet.out.clone().add(new THREE.Vector3(0.25, 0.85, 0)).normalize(), w: 2.0, h: 1.6 };
      case 'desk':
        return { at: r.desk.centre.clone().add(new THREE.Vector3(0.2, 0.25, 0)), dir: new THREE.Vector3(0.3, 0.62, 1).normalize(), w: 3.8, h: 2.6 };
      case 'read': {
        const b = this.active!;
        return { at: r.readingSpot.clone(), dir: new THREE.Vector3(0.12, 0.9, 0.75).normalize(), w: b.W * 3.4, h: b.H * 1.9 };
      }
      default:
        return { at: new THREE.Vector3(-0.3, 1.2, 0.2), dir: new THREE.Vector3(7.2, 8.6, 12).normalize(), w: this.camera.aspect < 0.85 ? 27 : 33, h: 17 };
    }
  }

  private fit(v: View) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.camera.aspect < 0.85;
    // leave room for the head column (landscape) or the bottom sheet (portrait)
    const fw = portrait ? 0.96 : 0.72, fh = portrait ? 0.5 : 0.8;
    return Math.max(v.h / (fh * 2 * tan), v.w / (fw * 2 * tan * this.camera.aspect));
  }

  goZone(z: Zone) {
    if (this.holding) return;
    if (z !== 'catalogue') this.closeDrawer();
    this.zoneNow = z;
    this.on.zone(z);
  }

  get zone() {
    return this.zoneNow;
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

  get isOpen() {
    return this.holding;
  }

  /** Take a book down and lay it open on the reading table at `page`. */
  take(id: string, pages: LibPage[], page = 0) {
    const b = this.books.find((x) => x.data.id === id);
    if (!b) return;
    if (this.active && this.active !== b) {
      this.queued = { id, pages, page };
      this.shelve();
      return;
    }
    this.closeDrawer();
    this.active = b;
    this.holding = true;
    this.pages = pages;
    this.page = Math.max(0, Math.min(pages.length - 1, page));
    this.cache.clear();
    this.dress(b, this.page);
    this.leaves.attach(b);
    this.hover(null);
    if (this.reduce) {
      this.room.ladder.z.set(b.shelf.pos.z);
      this.begin();
      this.pull.set(1);
      this.read.set(1);
    } else if (b.high && b.zone === 'stacks') {
      // a high shelf: the ladder comes along first
      this.room.ladder.z.target = b.shelf.pos.z;
      this.waitLadder = true;
    } else this.begin();
    this.on.open(b.data);
  }

  private begin() {
    const b = this.active!;
    this.waitLadder = false;
    b.hook.target = 1;
    // the neighbours lean into the gap once it opens
    if (b.prev) b.prev.lean.target = 1;
    if (b.next) b.next.lean.target = -1;
    window.setTimeout(() => {
      if (this.active === b && this.holding) {
        this.pull.target = 1;
        this.read.target = 1;
      }
    }, this.reduce ? 0 : 260);
  }

  /** Close the book and put it back where it came from. */
  shelve() {
    if (!this.active || !this.holding) return;
    this.holding = false;
    this.waitLadder = false;
    this.leaves.finish();
    this.read.target = 0;
    if (this.reduce) {
      this.cover.set(0);
      this.pull.set(0);
      this.read.set(0);
    }
  }

  /** Turn to page `n`: one leaf, or a riffle of several for a jump. */
  turn(n: number) {
    const b = this.active;
    if (!b || !this.holding || n === this.page || n < 0 || n >= this.pages.length) return false;
    const from = this.page;
    const dir = n > from ? 1 : -1;
    this.page = n;
    this.leaves.finish();
    if (this.reduce || this.cover.value < 0.9) {
      this.dress(b, n);
      return true;
    }
    const count = Math.min(Math.abs(n - from), 6);
    const zh = this.zh;
    // the leaves carry pages actually passed over, spread across the jump
    const faces = (i: number): [THREE.Texture, THREE.Texture] => {
      const p = Math.max(0, Math.min(this.pages.length - 1, Math.round(from + ((n - from) * i) / count) - (dir > 0 ? 0 : 1)));
      return [this.cache.page(b, p, 'r', zh), this.cache.mirror(this.cache.page(b, p, 'l', zh))];
    };
    if (dir > 0) {
      b.rightMat.map = this.cache.page(b, n, 'r', zh);
      b.rightMat.needsUpdate = true;
    } else {
      b.leftMat.map = n === 0 ? this.cache.page(b, -1, 'l', zh) : this.cache.page(b, n - 1, 'l', zh);
      b.leftMat.needsUpdate = true;
    }
    this.leaves.turn(dir, count, faces, () => this.active === b && this.dress(b, this.page), count > 1);
    return true;
  }

  /** Pull out a catalogue drawer (and push the last one back). */
  openDrawer(i: number) {
    if (this.holding) return;
    this.closeDrawer();
    this.drawerOpen = i;
    this.room.cabinet.drawers[i].open.target = 1;
    if (this.zoneNow !== 'catalogue') {
      this.zoneNow = 'catalogue';
      this.on.zone('catalogue');
    }
  }

  closeDrawer() {
    if (this.drawerOpen < 0) return;
    this.room.cabinet.drawers[this.drawerOpen].open.target = 0;
    this.room.cabinet.lift(this.drawerOpen, null);
    this.drawerOpen = -1;
  }

  liftCard(k: number | null) {
    if (this.drawerOpen >= 0) this.room.cabinet.lift(this.drawerOpen, k);
  }

  /** Bring the date stamp down on the card at the desk. */
  stamp(text: string, n: number, landed: () => void) {
    const d = this.room.desk;
    d.press.target = 1;
    window.setTimeout(() => {
      d.mark(text, n);
      landed();
      window.setTimeout(() => (d.press.target = 0), 160);
    }, this.reduce ? 0 : 340);
  }

  /** Walk along the stacks (keyboard). */
  walk(dir: number) {
    if (this.zoneNow === 'stacks') this.pan.target = Math.max(-1.5, Math.min(8.5, this.pan.target + dir * 1.2));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }

  private dress(b: Book, n: number) {
    const zh = this.zh;
    b.rightMat.map = this.cache.page(b, n, 'r', zh);
    b.rightMat.color.set('#ffffff');
    b.rightMat.needsUpdate = true;
    b.leftMat.map = n === 0 ? this.cache.page(b, -1, 'l', zh) : this.cache.page(b, n - 1, 'l', zh);
    b.leftMat.color.set('#ffffff');
    b.leftMat.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */
  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    // light
    const k = damp(2.2, dt);
    const L = this.look, T = this.lookTarget;
    for (const key of Object.keys(L) as (keyof Look)[]) L[key] += (T[key] - L[key]) * k;
    const reading = smooth(0, 1, this.read.update(dt));
    this.hemi.intensity = L.hemi * (1 - reading * 0.25);
    this.sun.intensity = L.sun;
    this.scene.environmentIntensity = L.env;
    this.shadowMat.opacity = L.shadow;
    // lights that are off cost nothing: they leave the shader when dark
    for (const p of this.room.pendants) {
      p.light.intensity = L.pend;
      p.light.visible = L.pend > 0.05;
      p.globe.emissiveIntensity = 0.12 + L.night * 1.25;
    }
    for (const g of this.room.nightGlass) g.opacity = L.night;
    this.room.shaftMat.uniforms.uOpacity.value = (1 - L.night) * 0.075;
    (this.room.dust.material as THREE.PointsMaterial).opacity = 0.15 + (1 - L.night) * 0.4;
    this.room.rain.offset.y += dt * 0.03;
    const dp = this.room.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i += 3) dp.setX(i, dp.getX(i) + Math.sin(this.last * 0.0004 + i) * dt * 0.01);
    dp.needsUpdate = true;

    // camera: the zone's view, blended into the reading view while a book is out
    this.pan.update(dt);
    const zoneView = this.viewOf(this.zoneNow);
    const target = this.active ? this.blend(zoneView, this.viewOf('read'), smooth(0, 1, this.read.target === 1 ? 1 : this.read.value)) : zoneView;
    this.view.at.setTarget(target.at);
    this.view.dir.setTarget(target.dir);
    this.view.dist.target = this.fit(target);
    const at = this.view.at.update(dt);
    const dir = this.view.dir.update(dt).clone().normalize();
    const dist = this.view.dist.update(dt);
    this.parallax.lerp(this.drag || this.holding ? this.parallax.clone().multiplyScalar(0.92) : this.pointer.clone().clampScalar(-1, 1), damp(2, dt));
    // screen right: dir points from the target back to the camera
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const visW = 2 * dist * tan * this.camera.aspect;
    const portrait = this.camera.aspect < 0.85;
    // the head column sits left; the reader panel sits right
    // with a panel open on the right (desk, an open drawer, a book), the subject sits left
    const side = Math.max(reading, this.panelSide.update(dt));
    this.panelSide.target = this.zoneNow === 'desk' || this.drawerOpen >= 0 ? 1 : 0;
    const shift = portrait ? 0 : -visW * 0.13 * (1 - side) + visW * 0.21 * side;
    const look = at.clone().addScaledVector(right, shift);
    // phone: the subject rides in the top half, above the bottom sheet
    const screenUp = new THREE.Vector3().crossVectors(dir, right).normalize();
    if (portrait) look.addScaledVector(screenUp, -2 * dist * tan * (this.zoneNow === 'overview' ? 0 : 0.1 + 0.12 * side));
    const camDir = dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, this.parallax.x * 0.025));
    camDir.y -= this.parallax.y * 0.015;
    this.camera.position.copy(look).addScaledVector(camDir.normalize(), dist);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    // the night key follows what we look at
    this.key.intensity = L.key * (1 - reading * 0.45);
    this.key.visible = this.key.intensity > 0.3;
    const keyAt = this.active && reading > 0.2 ? this.room.readingSpot : at;
    this.key.position.lerp(new THREE.Vector3(keyAt.x + 0.6, 4.6, keyAt.z + 0.8), damp(3, dt));
    this.key.target.position.lerp(keyAt, damp(3, dt));

    // props
    this.room.cabinet.update(dt);
    this.room.desk.update(dt);
    this.room.ladder.update(dt);
    if (this.waitLadder && this.room.ladder.settled) this.begin();

    // books
    const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
    for (const b of this.books) {
      b.hook.update(dt);
      b.lean.update(dt);
      if (b === this.active) continue;
      b.rest(tmpP, tmpQ);
      b.group.position.copy(tmpP);
      b.group.quaternion.copy(tmpQ);
    }
    if (this.active) this.pose(this.active, dt);
    this.leaves.update(dt);

    this.renderer.render(this.scene, this.camera);
  }

  private blend(a: View, b: View, t: number): View {
    return { at: a.at.clone().lerp(b.at, t), dir: a.dir.clone().lerp(b.dir, t).normalize(), w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
  }

  /** Move the book in hand between its shelf and the reading table. */
  private pose(b: Book, dt: number) {
    this.cover.target = this.holding && this.pull.value > 0.94 ? 1 : 0;
    if (!this.holding) {
      this.pull.target = this.cover.value < 0.08 ? 0 : 1;
      if (this.pull.value < 0.3) b.hook.target = 0;
    }
    const p = this.pull.update(dt);
    const cv = this.cover.update(dt);
    b.pivot.rotation.y = -cv * Math.PI * 0.985;
    b.left.visible = cv > 0.02;
    if (cv > 0.3 && !this.ready) {
      this.ready = true;
      this.on.ready();
    }

    // on the shelf with the finger hook applied
    const restP = new THREE.Vector3(), restQ = new THREE.Quaternion();
    b.rest(restP, restQ);
    // out of the shelf (or up out of the rack slot) first
    const out = smooth(0, 0.24, p);
    const from = restP.clone();
    if (b.news) from.addScaledVector(UP, out * 0.16).addScaledVector(b.shelf.out, out * 0.12);
    else from.addScaledVector(b.shelf.out, out * b.W * 1.05);
    // then across the room to the table, lifted over the chairs
    const spot = this.room.readingSpot.clone();
    spot.y = TABLE_H + b.T / 2 + 0.001;
    spot.x += (b.W / 2) * cv;
    const fly = smooth(0.2, 1, p);
    b.group.position.lerpVectors(from, spot, fly);
    b.group.position.y += Math.sin(fly * Math.PI) * 0.7;
    const tableQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.03));
    b.group.quaternion.slerpQuaternions(restQ, tableQ, smooth(0.22, 0.95, p));

    if (!this.holding && p < 0.003 && cv < 0.01) {
      b.left.visible = false;
      b.rightMat.map = null;
      b.rightMat.color.set('#ece5d3');
      b.rightMat.needsUpdate = true;
      this.leaves.attach(null);
      this.pull.set(0);
      this.cover.set(0);
      b.hook.target = 0;
      if (b.prev) b.prev.lean.target = 0;
      if (b.next) b.next.lean.target = 0;
      this.active = null;
      this.ready = false;
      this.cache.clear();
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

  private pick(x: number, y: number): { book?: Book; zone?: Zone; drawer?: number; gap?: boolean } | null {
    const overview = this.zoneNow === 'overview';
    const targets: THREE.Object3D[] = [];
    if (!overview) {
      for (const b of this.books) if (b !== this.active && b.zone === this.zoneNow) targets.push(...b.hits);
      if (this.gapHit && this.zoneNow === 'desk') targets.push(this.gapHit);
      if (this.zoneNow === 'catalogue') targets.push(...this.room.cabinet.drawers.map((d) => d.hit));
    } else targets.push(...this.room.cabinet.drawers.map((d) => d.hit));
    targets.push(...this.zoneHits.filter((h) => h.userData.zone !== this.zoneNow));
    const hit = this.ray(x, y).intersectObjects(targets, false)[0];
    if (!hit) return null;
    const u = hit.object.userData;
    if (u.book) return { book: u.book as Book };
    if (u.gap) return { gap: true };
    if (u.drawer !== undefined) return overview ? { zone: 'catalogue' } : { drawer: u.drawer as number };
    if (u.zone) return { zone: u.zone as Zone };
    return null;
  }

  private hover(p: ReturnType<LibraryScene['pick']>) {
    const b = p?.book ?? null;
    const key = b ? b.data.id : p?.zone ?? (p?.drawer !== undefined ? `d${p.drawer}` : p?.gap ? 'gap' : '');
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    if (this.hovered && this.hovered !== this.active) this.hovered.hook.target = 0;
    this.hovered = b;
    if (b) b.hook.target = 0.35;
    if (this.drawerOpen < 0) this.room.cabinet.drawers.forEach((d, i) => (d.open.target = p?.drawer === i ? 0.12 : 0));
    this.canvas.style.cursor = p ? 'pointer' : this.zoneNow === 'stacks' ? 'grab' : 'default';
    this.on.hover(p ? { book: b?.data, zone: p.zone, drawer: p.drawer, gap: p.gap } : null);
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.holding) return;
      this.drag = { x: e.clientX, pan: this.pan.target, moved: 0, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.drag && e.pointerId === this.drag.id) {
        const dx = e.clientX - this.drag.x;
        this.drag.moved = Math.max(this.drag.moved, Math.abs(dx));
        if (this.drag.moved > 6 && this.zoneNow === 'stacks') {
          // walk along the wall
          const perPx = (2 * this.view.dist.value * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / r.height;
          this.pan.target = Math.max(-1.5, Math.min(8.5, this.drag.pan - dx * perPx));
          this.hover(null);
          return;
        }
      }
      if (this.holding || e.target !== c) return this.hover(null);
      this.hover(this.pick(e.clientX, e.clientY));
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      this.drag = null;
      if (!d || e.pointerId !== d.id || d.moved > 6 || this.holding) return;
      const p = this.pick(e.clientX, e.clientY);
      if (!p) return;
      if (p.book) this.on.picked(p.book.data);
      else if (p.gap) this.on.gap();
      else if (p.drawer !== undefined) this.on.drawer(p.drawer);
      else if (p.zone === 'desk') {
        this.goZone('desk');
        this.on.desk();
      } else if (p.zone) this.goZone(p.zone);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', () => (this.drag = null));
    c.addEventListener('pointerleave', () => !this.drag && this.hover(null));
    c.addEventListener(
      'wheel',
      (e) => {
        if (this.zoneNow !== 'stacks' || this.holding) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        this.pan.target = Math.max(-1.5, Math.min(8.5, this.pan.target + d * 0.004));
      },
      { passive: false },
    );
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h, false);
    // the drawer room's long lens; a phone needs a wider one
    this.camera.fov = w / h < 0.85 ? 30 : 19;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
