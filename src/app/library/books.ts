/**
 * Books in the reading room, at real size (metres). Each binding is built in
 * its reading pose (cover facing +z, spine on the left, top at +y) and placed
 * on a shelf with a pose: where it stands, which way is out of the shelf, and
 * which way the shelf runs.
 *
 * On the shelf a book can be hooked out by its top (the finger tilt) and lean
 * into a gap left by its neighbour. Off the shelf the scene moves the group.
 */
import * as THREE from 'three';
import type { LibBook } from '../../lib/library';
import { Spring } from '../spring';
import { coverTexture, edgeTexture, endpaperTexture, newsFrontTexture, pageTexture, spineTexture } from './textures';

const UP = new THREE.Vector3(0, 1, 0);
const LEAF_SEG = 22;
/** Old library units (the first version's books) to metres. */
const M = 0.22;

export interface ShelfPose {
  /** Centre of the book standing (or hanging) in its place. */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  /** Out of the shelf, toward the reader. */
  out: THREE.Vector3;
  /** Along the shelf, in the order books are placed. */
  along: THREE.Vector3;
}

let edgeTex: THREE.Texture | null = null;

export class Book {
  readonly group = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly hits: THREE.Object3D[] = [];
  readonly W: number;
  readonly H: number;
  readonly T: number;
  /** Cover board thickness: paper for a pamphlet or a newspaper. */
  readonly c: number;
  readonly news: boolean;

  /** 0..1 hooked out by a finger at the top of the spine. */
  readonly hook = new Spring(0, 12);
  /** Leaning into a gap: -1..1 along the shelf. */
  readonly lean = new Spring(0, 6);
  prev: Book | null = null;
  next: Book | null = null;
  /** Shelved above reach: the ladder has to come first. */
  high = false;

  readonly spineMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
  readonly coverMat = new THREE.MeshStandardMaterial({ roughness: 0.78 });
  readonly rightMat = new THREE.MeshStandardMaterial({ roughness: 0.95, color: '#ece5d3' });
  readonly leftMat = new THREE.MeshStandardMaterial({ roughness: 0.95, color: '#ece5d3' });
  readonly left: THREE.Mesh;

  constructor(readonly data: LibBook, readonly zone: string, readonly bay: number, public shelf: ShelfPose) {
    this.news = data.kind === 'news';
    if (this.news) {
      this.H = 0.58;
      this.W = 0.4;
      this.T = Math.max(0.006, data.thick * M * 0.5);
      this.c = 0.0012;
    } else {
      this.H = 0.31 * data.h;
      this.W = 0.7 * this.H;
      this.T = Math.max(0.006, data.thick * M);
      this.c = data.kind === 'pamphlet' ? 0.0008 : data.kind === 'binder' ? 0.0035 : Math.min(0.0032, this.T * 0.2);
    }
    const { W, H, T, c } = this;
    edgeTex ??= edgeTexture();
    const cloth = new THREE.MeshStandardMaterial({ color: this.news ? '#d9d2be' : data.kind === 'pamphlet' ? '#d7cdb4' : data.color, roughness: data.kind === 'ledger' ? 0.55 : 0.8 });
    const endMat = new THREE.MeshStandardMaterial({ map: this.news || data.kind === 'pamphlet' ? null : endpaperTexture(data), color: '#e6dcc4', roughness: 0.9 });
    const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.95 });

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      this.hits.push(m);
      return m;
    };
    // back board, spine, page block
    mesh(new THREE.BoxGeometry(W, H, c), cloth, 0, 0, -T / 2 + c / 2);
    mesh(new THREE.BoxGeometry(c * 1.5, H, T), [cloth, this.news ? cloth : this.spineMat, cloth, cloth, cloth, cloth], -W / 2 + (c * 1.5) / 2, 0, 0);
    const bw = W - c * 1.5 - (this.news ? 0.002 : 0.004), bh = H - (this.news ? 0.002 : 0.008), bt = Math.max(0.002, T - 2 * c);
    mesh(new THREE.BoxGeometry(bw, bh, bt), [edgeMat, edgeMat, edgeMat, edgeMat, this.rightMat, edgeMat], -W / 2 + c * 1.5 + bw / 2, 0, 0);
    // front board on a hinge at the spine, level with the top of the pages
    this.pivot.position.set(-W / 2, 0, T / 2 - c);
    this.group.add(this.pivot);
    mesh(new THREE.BoxGeometry(W, H, c), [cloth, cloth, cloth, cloth, this.coverMat, endMat], W / 2, 0, c / 2, this.pivot);
    // the left-hand page rides on the inside of the board
    this.left = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), this.leftMat);
    this.left.rotation.y = Math.PI;
    this.left.position.set(W / 2 + 0.002, 0, -0.0008);
    this.left.visible = false;
    this.pivot.add(this.left);

    if (this.news) {
      // the wooden stick clamps the fold, and sticks out past both ends
      const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 0.5 });
      const rod = mesh(new THREE.CylinderGeometry(0.009, 0.009, H + 0.14, 10), wood, -W / 2 - 0.004, 0, 0);
      rod.castShadow = true;
      const knob = new THREE.SphereGeometry(0.014, 10, 8);
      mesh(knob, wood, -W / 2 - 0.004, H / 2 + 0.07, 0);
      mesh(knob, wood, -W / 2 - 0.004, -H / 2 - 0.07, 0);
    }
    if (data.kind === 'binder') {
      // rings showing at the spine edge
      const ring = new THREE.MeshStandardMaterial({ color: '#b9bcc0', metalness: 0.9, roughness: 0.3 });
      for (const y of [-H * 0.3, H * 0.3]) mesh(new THREE.TorusGeometry(T * 0.32, 0.0015, 6, 16, Math.PI), ring, -W / 2 + c * 2 + T * 0.3, y, 0);
    }
    this.hits.forEach((h) => (h.userData.book = this));
    this.placeOnShelf();
  }

  /** Redraw the words on the spine and cover. */
  relabel(zh: boolean) {
    if (!this.news) {
      const px = 96;
      const hPx = Math.min(1536, Math.round((px * this.H) / Math.max(0.008, this.T)));
      this.spineMat.map?.dispose();
      this.spineMat.map = spineTexture(this.data, zh, px, hPx);
      this.spineMat.needsUpdate = true;
    }
    this.coverMat.map?.dispose();
    this.coverMat.map = this.news ? newsFrontTexture(this.data, zh) : coverTexture(this.data, zh);
    this.coverMat.needsUpdate = true;
  }

  /** Where the book rests on its shelf right now, with hook and lean applied. */
  rest(pos: THREE.Vector3, quat: THREE.Quaternion) {
    const s = this.shelf;
    pos.copy(s.pos);
    quat.copy(s.quat);
    if (this.news) {
      // a stick lifts a little in its slot when touched
      pos.addScaledVector(UP, this.hook.value * 0.03).addScaledVector(s.out, this.hook.value * 0.02);
      return;
    }
    const half = this.H / 2;
    // hooked out by the top: turn about the bottom back edge
    const tilt = this.hook.value * 0.2;
    if (tilt > 1e-4) {
      const axis = new THREE.Vector3().crossVectors(UP, s.out).normalize();
      const pivot = s.pos.clone().addScaledVector(UP, -half).addScaledVector(s.out, -this.W / 2);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, tilt);
      pos.sub(pivot).applyQuaternion(q).add(pivot);
      quat.premultiply(q);
    }
    // leaning into a gap: turn about the bottom edge on the gap side
    const l = this.lean.value;
    if (Math.abs(l) > 1e-4) {
      const g = s.along.clone().multiplyScalar(Math.sign(l));
      const axis = new THREE.Vector3().crossVectors(UP, g).normalize();
      const pivot = s.pos.clone().addScaledVector(UP, -half).addScaledVector(g, this.T / 2);
      const q = new THREE.Quaternion().setFromAxisAngle(axis, Math.abs(l) * 0.075);
      const p = pos.clone().sub(pivot).applyQuaternion(q).add(pivot);
      pos.copy(p);
      quat.premultiply(q);
    }
  }

  placeOnShelf() {
    this.rest(this.group.position, this.group.quaternion);
  }
}

/* ---------------------------------------------------------------------- */
/* Turning leaves                                                          */
/* ---------------------------------------------------------------------- */

interface Leaf {
  group: THREE.Group;
  geo: THREE.PlaneGeometry;
  front: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
  f: Spring;
  delay: number;
  on: boolean;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A small pool of leaves: one for a page turn, several for a riffle. */
export class Leaves {
  private pool: Leaf[] = [];
  private book: Book | null = null;
  private done: (() => void) | null = null;

  constructor() {
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.PlaneGeometry(1, 1, LEAF_SEG, 1);
      const front = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.FrontSide });
      const back = new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.BackSide });
      const group = new THREE.Group();
      const a = new THREE.Mesh(geo, front);
      const b = new THREE.Mesh(geo, back);
      a.castShadow = b.castShadow = true;
      group.add(a, b);
      group.visible = false;
      this.pool.push({ group, geo, front, back, f: new Spring(0, 9), delay: 0, on: false });
    }
  }

  attach(b: Book | null) {
    for (const l of this.pool) {
      l.group.removeFromParent();
      l.on = false;
      l.group.visible = false;
    }
    this.book = b;
    if (b) for (const l of this.pool) b.group.add(l.group);
  }

  get busy() {
    return this.pool.some((l) => l.on);
  }

  /**
   * Turn `count` leaves in direction `dir`, each carrying `tex(i)` on both
   * faces (the back is mirrored). Calls `done` when the last one lands.
   */
  turn(dir: number, count: number, tex: (i: number) => [THREE.Texture, THREE.Texture], done: () => void, fast = false) {
    this.finish();
    this.done = done;
    const n = Math.min(count, this.pool.length);
    for (let i = 0; i < n; i++) {
      const l = this.pool[i];
      const [front, back] = tex(i);
      l.front.map = front;
      l.back.map = back;
      l.front.needsUpdate = l.back.needsUpdate = true;
      l.f.omega = fast ? 14 : 8;
      l.f.set(dir > 0 ? 0 : 1);
      l.f.target = dir > 0 ? 1 : 0;
      l.delay = i * (fast ? 0.07 : 0.1);
      l.on = true;
      l.group.visible = false;
    }
  }

  /** Snap any leaves in flight to where they were going. */
  finish() {
    if (!this.busy) return;
    for (const l of this.pool) {
      l.on = false;
      l.group.visible = false;
    }
    const d = this.done;
    this.done = null;
    d?.();
  }

  update(dt: number) {
    const b = this.book;
    if (!b || !this.busy) return;
    let alive = false;
    for (const l of this.pool) {
      if (!l.on) continue;
      if (l.delay > 0) {
        l.delay -= dt;
        alive = true;
        continue;
      }
      l.group.visible = true;
      const f = l.f.update(dt);
      this.bend(b, l, f);
      if (Math.abs(f - l.f.target) < 0.004) {
        l.on = false;
        l.group.visible = false;
      } else alive = true;
    }
    if (!alive) {
      const d = this.done;
      this.done = null;
      d?.();
    }
  }

  /** The free edge lags the spine, so the page curls over. */
  private bend(b: Book, l: Leaf, f: number) {
    const pos = l.geo.attributes.position as THREE.BufferAttribute;
    const w = b.W - b.c * 1.5 - 0.004, h = b.H - 0.008;
    const ds = w / LEAF_SEG;
    const lift = Math.sin(Math.PI * f) * w * 0.12;
    let x = 0, z = 0;
    const cols: [number, number][] = [[0, 0]];
    for (let i = 0; i < LEAF_SEG; i++) {
      const u = (i + 0.5) / LEAF_SEG;
      const a = Math.PI * smooth(0, 1, f * 1.45 - u * 0.45);
      x += Math.cos(a) * ds;
      z += Math.sin(a) * ds + lift / LEAF_SEG;
      cols.push([x, z]);
    }
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= LEAF_SEG; i++) pos.setXYZ(j * (LEAF_SEG + 1) + i, cols[i][0], (0.5 - j) * h, cols[i][1]);
    pos.needsUpdate = true;
    l.geo.computeVertexNormals();
    l.geo.computeBoundingSphere();
    l.group.position.x = -b.W / 2 + b.c * 1.5;
    l.group.position.y = 0;
    l.group.position.z = b.T / 2 - b.c + 0.0012 + this.pool.indexOf(l) * 0.0004;
  }
}

/** Page textures for an open book, cached per page and language. */
export class PageCache {
  private map = new Map<string, THREE.Texture>();
  constructor(private heads: () => (import('../../lib/library').LibPage | undefined)[]) {}

  page(b: Book, n: number, side: 'l' | 'r', zh: boolean) {
    const k = `${b.data.id}|${n}|${side}|${zh}`;
    let t = this.map.get(k);
    if (!t) {
      t = n < 0 ? pageTexture(b.data, -1, null, zh, 'l', true) : pageTexture(b.data, n, this.heads()[n]?.head ?? null, zh, side);
      this.map.set(k, t);
    }
    return t;
  }

  mirror(t: THREE.Texture) {
    const k = `${t.uuid}|m`;
    let m = this.map.get(k);
    if (!m) {
      m = t.clone();
      m.wrapS = THREE.RepeatWrapping;
      m.repeat.x = -1;
      m.offset.x = 1;
      m.needsUpdate = true;
      this.map.set(k, m);
    }
    return m;
  }

  clear() {
    for (const t of this.map.values()) t.dispose();
    this.map.clear();
  }
}
