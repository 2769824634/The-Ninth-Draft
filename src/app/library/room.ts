/**
 * The reading room as an architectural cutaway, at real size (metres): a
 * floor slab, the back and left walls (the other two and the roof are cut
 * away), arched windows in the back wall, steel beams carrying opal-glass
 * pendants, walnut stacks, two reading tables, a newspaper rack, the card
 * catalogue, the circulation desk and a rolling ladder.
 *
 * Everything here is static except the props, which expose their own state.
 */
import * as THREE from 'three';
import { Spring } from '../spring';
import { catCardTexture, drawerTagTexture, fillerSpineTexture, parquetTexture, plasterTexture, rainTexture, stampMarkTexture, windowView, woodTexture } from './textures';
import type { ShelfPose } from './books';
import { islandRaining } from '../weather';

export const ROOM = { x0: -12, x1: 12, z0: -7, z1: 7, h: 6.4, wall: 0.45, slab: 0.3 };
export const TABLE_H = 0.76;
const UP = new THREE.Vector3(0, 1, 0);
const POCHE = '#2b2723';

/** A run of shelf: books stand on it from `start` along `along`, spines toward `out`. */
export interface ShelfRun {
  start: THREE.Vector3;
  along: THREE.Vector3;
  out: THREE.Vector3;
  length: number;
  rows: number[];
  rowH: number;
  depth: number;
  /** Rows at or above this need the ladder. */
  reach: number;
  used: { row: number; a: number; b: number }[];
}

interface FillerBook {
  m: THREE.Matrix4;
  c: THREE.Color;
  row: number;
  a: number;
  b: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  size: THREE.Vector3;
}

/** One uncatalogued volume, found beside a catalogued one. */
export interface FillerRef {
  mesh: THREE.InstancedMesh;
  item: FillerBook;
  index: number;
  along: THREE.Vector3;
  side: -1 | 1;
}

export const basis = (out: THREE.Vector3, along: THREE.Vector3) =>
  new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(out.clone().negate(), UP, along));

/** Pose of a book of thickness T, height H, depth W at offset `x` on a row. */
export function shelfPose(run: ShelfRun, row: number, x: number, T: number, H: number, W: number): ShelfPose {
  const pos = run.start.clone()
    .addScaledVector(run.along, x + T / 2)
    .addScaledVector(UP, run.rows[row] + H / 2 + 0.001)
    .addScaledVector(run.out, -W / 2 - 0.012);
  return { pos, quat: basis(run.out, run.along), out: run.out.clone(), along: run.along.clone() };
}

const mat = {
  walnut: () => new THREE.MeshStandardMaterial({ map: woodTexture(3, '#4a2f1d'), roughness: 0.5 }),
  walnutDark: () => new THREE.MeshStandardMaterial({ map: woodTexture(4, '#2e1d12'), roughness: 0.65 }),
  oak: () => new THREE.MeshStandardMaterial({ map: woodTexture(9, '#7a5534'), roughness: 0.42 }),
};

export class Room {
  readonly group = new THREE.Group();
  readonly runs: Record<'west' | 'back' | 'desk', ShelfRun>;
  readonly pendants: { globe: THREE.MeshStandardMaterial; light: THREE.PointLight }[] = [];
  readonly nightGlass: THREE.MeshBasicMaterial[] = [];
  readonly shaftMat: THREE.ShaderMaterial;
  readonly dust: THREE.Points;
  readonly rain = rainTexture();
  /** Rain on the glass only on the island's wet days (src/app/weather.ts), the same sky as the archive. */
  readonly wet = islandRaining();
  private beamGroup = new THREE.Group();
  /** The uncatalogued volumes, one instanced mesh per run. */
  readonly fillers: THREE.InstancedMesh[] = [];
  private shelved: { run: ShelfRun; mesh: THREE.InstancedMesh; items: FillerBook[] }[] = [];
  readonly rack: Rack;
  readonly cabinet: Cabinet;
  readonly desk: Desk;
  readonly ladder: Ladder;
  /** Where a book is laid open to read. */
  readonly readingSpot = new THREE.Vector3(-1.55, TABLE_H, 2.5);
  readonly sunDir = new THREE.Vector3(0.28, -0.62, 0.73).normalize();

  private walnut = mat.walnut();
  private walnutDark = mat.walnutDark();
  private oak = mat.oak();
  private brass = new THREE.MeshStandardMaterial({ color: '#b48d4c', metalness: 0.9, roughness: 0.28 });
  private iron = new THREE.MeshStandardMaterial({ color: '#2a2b2d', metalness: 0.6, roughness: 0.45 });
  private poche = new THREE.MeshStandardMaterial({ color: POCHE, roughness: 0.9 });

  constructor() {
    this.shell();
    this.windows();
    this.beams();
    this.runs = {
      west: this.westStacks(),
      back: this.backCases(),
      desk: { start: new THREE.Vector3(), along: new THREE.Vector3(1, 0, 0), out: new THREE.Vector3(0, 0, 1), length: 0, rows: [], rowH: 0, depth: 0, reach: 99, used: [] },
    };
    this.runs.desk = this.runs.back;
    this.tables();
    this.rack = new Rack(this.walnut, this.brass);
    this.group.add(this.rack.group);
    this.cabinet = new Cabinet(this.oak, this.brass);
    this.group.add(this.cabinet.group);
    this.desk = new Desk(this.walnut, this.oak, this.brass);
    this.group.add(this.desk.group);
    this.ladder = new Ladder(this.oak, this.brass);
    this.group.add(this.ladder.group);
    this.shaftMat = this.shafts();
    this.dust = this.motes();
  }

  private box(w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = shadow;
    this.group.add(mesh);
    return mesh;
  }

  /* ---------------- slab and walls ---------------- */
  private shell() {
    const { x0, x1, z0, z1, h, wall, slab } = ROOM;
    // floor slab: parquet on top, section colour on the cut edges
    const parquet = parquetTexture();
    parquet.repeat.set((x1 - x0) / 2.4, (z1 - z0) / 2.4);
    const floorMat = new THREE.MeshStandardMaterial({ map: parquet, color: '#c7b7a2', roughness: 0.55 });
    this.box(x1 - x0 + wall, slab, z1 - z0 + wall, [this.poche, this.poche, floorMat, this.poche, this.poche, this.poche], (x0 + x1 - wall) / 2, -slab / 2, (z0 + z1 - wall) / 2);

    // left wall (no openings)
    const plasterTex = plasterTexture(5);
    plasterTex.repeat.set(4, 1.2);
    const plaster = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.92 });
    this.box(wall, h, z1 - z0 + wall, [plaster, plaster, this.poche, plaster, plaster, plaster], x0 - wall / 2, h / 2, (z0 + z1 - wall) / 2);
    // skirting along both walls
    this.box(0.04, 0.16, z1 - z0, this.walnutDark, x0 + 0.02, 0.08, (z0 + z1) / 2);
  }

  /** The back wall, extruded with arched openings; glass, mullions and rain in them. */
  private windows() {
    const { x0, x1, z0, h, wall } = ROOM;
    const xs = [-8.4, -3.9, 0.6, 5.1];
    const w = 2.0, sill = 2.75, top = 5.9, r = w / 2;
    const outline = new THREE.Shape();
    outline.moveTo(x0 - wall, 0);
    outline.lineTo(x1, 0);
    outline.lineTo(x1, h);
    outline.lineTo(x0 - wall, h);
    outline.lineTo(x0 - wall, 0);
    const arch = (cx: number) => {
      const s = new THREE.Path();
      s.moveTo(cx - r, sill);
      s.lineTo(cx + r, sill);
      s.lineTo(cx + r, top - r);
      s.absarc(cx, top - r, r, 0, Math.PI, false);
      s.lineTo(cx - r, sill);
      return s;
    };
    xs.forEach((cx) => outline.holes.push(arch(cx)));
    const geo = new THREE.ExtrudeGeometry(outline, { depth: wall, bevelEnabled: false, curveSegments: 20 });
    const plasterTex = plasterTexture(7);
    plasterTex.repeat.set(0.18, 0.18);
    const plaster = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.92 });
    const m = new THREE.Mesh(geo, [plaster, plaster]);
    m.position.z = z0 - wall;
    m.castShadow = m.receiveShadow = true;
    this.group.add(m);
    // section cap on the cut top of both walls
    this.box(x1 - x0 + wall, 0.02, wall, this.poche, (x0 + x1 - wall) / 2, h + 0.01, z0 - wall / 2, false);
    this.box(wall, 0.02, ROOM.z1 - z0 + wall, this.poche, x0 - wall / 2, h + 0.01, (z0 + ROOM.z1 - wall) / 2, false);

    for (const cx of xs) {
      const shape = new THREE.Shape();
      shape.moveTo(-r, 0);
      shape.lineTo(r, 0);
      shape.lineTo(r, top - sill - r);
      shape.absarc(0, top - sill - r, r, 0, Math.PI, false);
      shape.lineTo(-r, 0);
      const g = new THREE.ShapeGeometry(shape, 20);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + r) / w, pos.getY(i) / (top - sill));
      const seed = Math.round(cx * 10) + 50;
      const day = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: windowView(false, seed), toneMapped: false }));
      const nightMat = new THREE.MeshBasicMaterial({ map: windowView(true, seed), toneMapped: false, transparent: true, opacity: 0 });
      this.nightGlass.push(nightMat);
      const night = new THREE.Mesh(g, nightMat);
      const rain = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.rain, transparent: true, opacity: 0.32, depthWrite: false }));
      rain.visible = this.wet;
      [day, night, rain].forEach((mesh, i) => {
        mesh.position.set(cx, sill, z0 - wall * 0.7 + i * 0.004);
        this.group.add(mesh);
      });
      // steel mullions
      const bars = new THREE.Group();
      const bar = (bw: number, bh: number, x: number, y: number) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.04), this.iron);
        b.position.set(x, y, 0);
        bars.add(b);
      };
      const rect = top - sill - r;
      for (const x of [-r / 2, 0, r / 2]) {
        const hgt = rect + Math.sqrt(Math.max(0, r * r - x * x));
        bar(0.025, hgt, x, hgt / 2);
      }
      for (let y = 0.55; y < rect; y += 0.55) bar(w, 0.022, 0, y);
      bar(w, 0.04, 0, 0.02);
      bars.position.set(cx, sill, z0 - wall * 0.66);
      this.group.add(bars);
      // stone sill inside
      this.box(w + 0.2, 0.06, wall * 0.55, this.poche, cx, sill - 0.03, z0 - wall * 0.28, true);
    }
  }

  /** Two steel beams across the room, cut where the roof was. */
  private beams() {
    const { x0, x1, h } = ROOM;
    for (const z of [-1.2, 2.3]) {
      this.beamGroup.add(this.box(x1 - x0, 0.32, 0.18, this.iron, (x0 + x1) / 2, h - 0.2, z));
      this.beamGroup.add(this.box(0.02, 0.32, 0.18, this.poche, x1 + 0.01, h - 0.2, z, false));
    }
    this.group.add(this.beamGroup);
  }

  /** The beams are part of the cutaway: seen from outside the room only, so a camera inside never meets one. */
  showBeams(cam: THREE.Vector3) {
    this.beamGroup.visible = cam.y > ROOM.h + 0.4 || cam.x > ROOM.x1 + 0.5 || cam.z > ROOM.z1 + 0.5;
  }

  /* ---------------- stacks ---------------- */
  /** Full-height cases along the left wall, spines facing into the room. */
  private westStacks(): ShelfRun {
    const { x0, z0, z1 } = ROOM;
    const depth = 0.42, rowH = 0.46, rows = 9, base = 0.12;
    const zA = z0 + 0.25, zB = z1 - 0.2;
    const xf = x0 + depth;
    const len = zB - zA;
    // carcass: a back panel and a plinth; the books stand in front of it
    this.box(0.03, rows * rowH + base + 0.14, len, this.walnutDark, x0 + 0.015, (rows * rowH + base + 0.14) / 2, (zA + zB) / 2);
    this.box(depth, base, len, this.walnutDark, x0 + depth / 2, base / 2, (zA + zB) / 2);
    for (let r = 0; r <= rows; r++) this.box(depth + 0.02, 0.03, len, this.walnut, x0 + depth / 2 + 0.01, base + r * rowH - 0.015, (zA + zB) / 2);
    for (let z = zA; z <= zB + 0.01; z += 1.0) this.box(depth + 0.04, rows * rowH + base + 0.14, 0.04, this.walnut, x0 + depth / 2 + 0.02, (rows * rowH + base + 0.14) / 2, z);
    // cornice and the ladder rail
    this.box(depth + 0.12, 0.12, len + 0.1, this.walnut, x0 + depth / 2 + 0.06, rows * rowH + base + 0.2, (zA + zB) / 2);
    this.box(0.03, 0.03, len, this.brass, xf + 0.18, rows * rowH - 0.25, (zA + zB) / 2);
    for (let z = zA + 0.5; z < zB; z += 2) this.box(0.18, 0.025, 0.025, this.brass, xf + 0.09, rows * rowH - 0.25, z);
    return {
      start: new THREE.Vector3(xf, 0, zB - 0.04),
      along: new THREE.Vector3(0, 0, -1),
      out: new THREE.Vector3(1, 0, 0),
      length: len - 0.08,
      rows: Array.from({ length: rows }, (_, i) => base + i * rowH),
      rowH,
      depth,
      reach: 5,
      used: [],
    };
  }

  /** Low cases under the windows; the end behind the desk holds the Office's own books. */
  private backCases(): ShelfRun {
    const { x0, x1, z0 } = ROOM;
    const depth = 0.4, rowH = 0.5, rows = 4, base = 0.12;
    const xa = x0 + 0.5, xb = x1 - 0.3;
    const len = xb - xa;
    const zf = z0 + depth;
    const hgt = rows * rowH + base + 0.1;
    this.box(len, hgt, 0.03, this.walnutDark, (xa + xb) / 2, hgt / 2, z0 + 0.015);
    this.box(len, base, depth, this.walnutDark, (xa + xb) / 2, base / 2, z0 + depth / 2);
    for (let r = 0; r <= rows; r++) this.box(len, 0.03, depth + 0.02, this.walnut, (xa + xb) / 2, base + r * rowH - 0.015, z0 + depth / 2 + 0.01);
    for (let x = xa; x <= xb + 0.01; x += 1.1) this.box(0.04, hgt, depth + 0.04, this.walnut, x, hgt / 2, z0 + depth / 2 + 0.02);
    this.box(len + 0.1, 0.05, depth + 0.1, this.walnut, (xa + xb) / 2, hgt + 0.025, z0 + depth / 2 + 0.03);
    return {
      start: new THREE.Vector3(xa + 0.04, 0, zf),
      along: new THREE.Vector3(1, 0, 0),
      out: new THREE.Vector3(0, 0, 1),
      length: len - 0.08,
      rows: Array.from({ length: rows }, (_, i) => base + i * rowH),
      rowH,
      depth,
      reach: 99,
      used: [],
    };
  }

  /**
   * Fill every row of a run with uncatalogued volumes, around the places
   * already taken by catalogued books.
   */
  fill(run: ShelfRun, seed: number, skip?: (row: number, a: number) => boolean) {
    // old buckram, faded: browns, greys, a few dull reds, greens and blues
    const CL = ['#4a3426', '#3b3a33', '#5a4a36', '#2f3530', '#6b5a42', '#4d2c26', '#3c4044', '#7a6b52', '#2e2b28', '#55493a', '#3f3a2c', '#5e4e3b', '#433a36', '#6a5f4c', '#33383a', '#5a3a2e'];
    const list: FillerBook[] = [];
    const q0 = basis(run.out, run.along);
    const m = new THREE.Matrix4();
    let k = seed;
    const free = (row: number, a: number, b: number) => !run.used.some((u) => u.row === row && b > u.a - 0.02 && a < u.b + 0.02);
    for (let row = 0; row < run.rows.length; row++) {
      let x = 0.01;
      while (x < run.length) {
        k++;
        const t = 0.022 + ((k * 7) % 6) * 0.007;
        const h = Math.min(run.rowH - 0.05, 0.22 + ((k * 11) % 9) * 0.017);
        const w = Math.min(run.depth - 0.04, h * (0.62 + ((k * 3) % 4) * 0.04));
        if ((k * 17) % 41 === 0) {
          x += 0.08 + ((k * 5) % 4) * 0.03;
          continue;
        }
        if (x + t > run.length) break;
        if (!free(row, x, x + t) || skip?.(row, x)) {
          x += t + 0.001;
          continue;
        }
        const pose = shelfPose(run, row, x, t, h, w);
        const lean = (k * 13) % 23 === 0 ? 0.06 : 0;
        const q = q0.clone();
        if (lean) q.premultiply(new THREE.Quaternion().setFromAxisAngle(run.out, lean));
        m.compose(pose.pos, q, new THREE.Vector3(w, h, t));
        list.push({ m: m.clone(), c: new THREE.Color(CL[(k * 7) % CL.length]).multiplyScalar(0.7 + ((k * 13) % 7) * 0.05), row, a: x, b: x + t, pos: pose.pos.clone(), quat: q, size: new THREE.Vector3(w, h, t) });
        x += t + 0.0012;
      }
    }
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const spine = new THREE.MeshStandardMaterial({ map: fillerSpine(), roughness: 0.72 });
    const edge = new THREE.MeshStandardMaterial({ color: '#d9cfb6', roughness: 0.95 });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [edge, spine, edge, edge, plain, plain], list.length);
    list.forEach((v, i) => {
      im.setMatrixAt(i, v.m);
      im.setColorAt(i, v.c);
    });
    // every volume on the shelves casts its own shadow
    im.castShadow = im.receiveShadow = true;
    this.group.add(im);
    this.fillers.push(im);
    this.shelved.push({ run, mesh: im, items: list });
  }

  /**
   * The uncatalogued volume standing right beside [a, b] on a row, on the
   * given side (-1 before, +1 after), if there is one within a finger's width.
   */
  neighbour(run: ShelfRun, row: number, a: number, b: number, side: -1 | 1): FillerRef | null {
    const set = this.shelved.find((x) => x.run === run);
    if (!set) return null;
    let best = -1, gap = 0.06;
    set.items.forEach((it, i) => {
      if (it.row !== row) return;
      const d = side < 0 ? a - it.b : it.a - b;
      if (d >= -0.001 && d < gap) {
        gap = d;
        best = i;
      }
    });
    return best < 0 ? null : { mesh: set.mesh, item: set.items[best], index: best, along: run.along, side };
  }

  /** Lean a neighbour into the gap: `v` 0 upright → 1 resting against the next book. */
  leanFiller(r: FillerRef, v: number) {
    const it = r.item;
    // the gap is on the far side from where the neighbour stands
    const g = r.along.clone().multiplyScalar(-r.side);
    const axis = new THREE.Vector3().crossVectors(UP, g).normalize();
    const pivot = it.pos.clone().addScaledVector(UP, -it.size.y / 2).addScaledVector(g, it.size.z / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(axis, v * 0.09);
    const pos = it.pos.clone().sub(pivot).applyQuaternion(q).add(pivot);
    r.mesh.setMatrixAt(r.index, new THREE.Matrix4().compose(pos, it.quat.clone().premultiply(q), it.size));
    r.mesh.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- tables and pendants ---------------- */
  private tables() {
    const chairMat = new THREE.MeshStandardMaterial({ map: woodTexture(12, '#3a2414'), roughness: 0.55 });
    const topTex = woodTexture(9, '#7a5534', 512, 512, 0.4);
    topTex.repeat.set(5, 1.6);
    const top = new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.38 });
    for (const z of [-1.2, 2.3]) {
      const cx = -2.4, L = 5.4, D = 1.15;
      this.box(L, 0.05, D, top, cx, TABLE_H - 0.025, z);
      this.box(L - 0.2, 0.1, D - 0.2, this.walnut, cx, TABLE_H - 0.1, z);
      for (const dx of [-L / 2 + 0.15, L / 2 - 0.15]) for (const dz of [-D / 2 + 0.12, D / 2 - 0.12]) this.box(0.07, TABLE_H - 0.05, 0.07, this.walnut, cx + dx, (TABLE_H - 0.05) / 2, z + dz);
      // a brass reading slope with a book rest at one end of each table
      for (let i = 0; i < 4; i++) {
        const x = cx - L / 2 + 0.75 + i * 1.3;
        for (const side of [-1, 1]) {
          // chairs, a few pushed back or turned
          const k = i * 2 + (side > 0 ? 1 : 0) + (z > 0 ? 8 : 0);
          const g = new THREE.Group();
          const part = (w: number, h: number, d: number, x2: number, y2: number, z2: number) => {
            const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), chairMat);
            p.position.set(x2, y2, z2);
            p.castShadow = p.receiveShadow = true;
            g.add(p);
          };
          part(0.44, 0.035, 0.42, 0, 0.45, 0);
          for (const [lx, lz] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) part(0.035, 0.45, 0.035, lx, 0.225, lz);
          part(0.035, 0.5, 0.035, -0.19, 0.7, 0.18);
          part(0.035, 0.5, 0.035, 0.19, 0.7, 0.18);
          part(0.42, 0.1, 0.025, 0, 0.88, 0.18);
          part(0.42, 0.05, 0.02, 0, 0.66, 0.18);
          const push = (k * 7) % 5 === 0 ? 0.35 : 0.05;
          g.position.set(x + ((k * 3) % 3 - 1) * 0.04, 0, z + side * (D / 2 + 0.12 + push));
          g.rotation.y = (side > 0 ? 0 : Math.PI) + ((k * 13) % 5 - 2) * 0.05;
          this.group.add(g);
        }
      }
      // opal glass pendants on long rods
      for (const dx of [-1.8, 0, 1.8]) {
        const x = cx + dx;
        const rodLen = ROOM.h - 0.36 - 2.3;
        this.box(0.012, rodLen, 0.012, this.brass, x, 2.3 + rodLen / 2, z, false);
        const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.08, 20), this.brass);
        gallery.position.set(x, 2.27, z);
        this.group.add(gallery);
        const globe = new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.35, metalness: 0, emissive: '#ffe2b0', emissiveIntensity: 0.1, transparent: true, opacity: 0.96 });
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 20), globe);
        ball.position.set(x, 2.06, z);
        this.group.add(ball);
        const light = new THREE.PointLight(0xffdcae, 0, 9, 2);
        light.position.set(x, 2.0, z);
        this.group.add(light);
        this.pendants.push({ globe, light });
      }
    }
  }

  /* ---------------- daylight ---------------- */
  /** Light falling through each window to the floor, as faint additive volumes. */
  private shafts() {
    const xs = [-8.4, -3.9, 0.6, 5.1];
    const w = 2.0, sill = 2.75, top = 5.9, r = w / 2;
    const d = this.sunDir;
    const pos: number[] = [];
    const alpha: number[] = [];
    const z = ROOM.z0 + 0.02;
    for (const cx of xs) {
      const pts: THREE.Vector3[] = [new THREE.Vector3(cx - r, sill, z), new THREE.Vector3(cx + r, sill, z), new THREE.Vector3(cx + r, top - r, z)];
      for (let i = 1; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        pts.push(new THREE.Vector3(cx + Math.cos(a) * r, top - r + Math.sin(a) * r, z));
      }
      pts.push(new THREE.Vector3(cx - r, top - r, z));
      const floor = pts.map((p) => p.clone().addScaledVector(d, -p.y / d.y));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], fa = floor[i], fb = floor[(i + 1) % pts.length];
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, fb.x, fb.y, fb.z, a.x, a.y, a.z, fb.x, fb.y, fb.z, fa.x, fa.y, fa.z);
        alpha.push(1, 1, 0, 1, 0, 0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('a', new THREE.Float32BufferAttribute(alpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#fff0d2') } },
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uOpacity; uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, uOpacity * (0.25 + 0.75 * vA)); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return m;
  }

  private motes() {
    // motes only where the light falls: inside the window shafts
    const n = 360;
    const p = new Float32Array(n * 3);
    const xs = [-8.4, -3.9, 0.6, 5.1];
    const d = this.sunDir;
    for (let i = 0; i < n; i++) {
      const cx = xs[i % xs.length];
      const y0 = 2.9 + Math.random() * 2.8;
      const t = Math.random();
      const start = new THREE.Vector3(cx + (Math.random() - 0.5) * 1.8, y0, ROOM.z0 + 0.05);
      const q = start.addScaledVector(d, (-y0 / d.y) * t);
      p[i * 3] = q.x;
      p[i * 3 + 1] = Math.max(0.1, q.y);
      p[i * 3 + 2] = q.z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#fff4dc', size: 0.012, transparent: true, opacity: 0.5, depthWrite: false }));
    this.group.add(pts);
    return pts;
  }
}

let fillerTex: THREE.Texture | null = null;
const fillerSpine = () => (fillerTex ??= fillerSpineTexture());

/* ====================================================================== */
/* Props                                                                   */
/* ====================================================================== */

/** A floor-standing newspaper rack: sticks rest in notches, papers hang. */
export class Rack {
  readonly group = new THREE.Group();
  readonly centre = new THREE.Vector3(4.6, 0.85, 3.4);
  readonly out = new THREE.Vector3(0.32, 0, 1).normalize();
  readonly along = new THREE.Vector3().crossVectors(UP, this.out).normalize();
  readonly tiers = 7;
  readonly hit: THREE.Mesh;

  constructor(wood: THREE.Material, brass: THREE.Material) {
    const g = this.group;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.out);
    g.quaternion.copy(q);
    g.position.set(this.centre.x, 0, this.centre.z);
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = wood, rx = 0) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      p.position.set(x, y, z);
      p.rotation.x = rx;
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    };
    // three sloping side cheeks, a brass rail for each tier, a plinth
    for (const x of [-0.82, 0, 0.82]) part(0.04, 1.75, 0.08, x, 0.95, -0.42, wood, -0.42);
    for (const x of [-0.82, 0, 0.82]) part(0.04, 0.08, 1.0, x, 0.05, -0.3);
    part(1.7, 0.06, 0.06, 0, 1.78, -0.78);
    for (let i = 0; i < this.tiers; i++) {
      const y = 0.66 + i * 0.16, z = -i * 0.075;
      part(1.68, 0.012, 0.012, 0, y - 0.012, z, brass);
    }
    part(0.9, 0.18, 0.02, 0, 1.92, -0.8, wood);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.9, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.95, -0.35);
    g.add(hit);
    this.hit = hit;
  }

  /** Pose of the stick in slot `i` (two columns of tiers), paper hanging. */
  slot(i: number, W: number): ShelfPose {
    const col = i % 2, tier = this.tiers - 1 - Math.floor(i / 2);
    const local = new THREE.Vector3((col - 0.5) * 0.82, 0.66 + tier * 0.16 - W / 2, -tier * 0.075 + 0.012);
    const pos = local.applyQuaternion(this.group.quaternion).add(this.group.position);
    // spine up, stick along the rack, front page toward the room
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(UP.clone().negate(), this.along, this.out));
    return { pos, quat, out: this.out.clone(), along: this.along.clone() };
  }
}

/** The card catalogue: twenty small drawers on legs. */
export class Cabinet {
  readonly group = new THREE.Group();
  readonly drawers: { group: THREE.Group; open: Spring; label: THREE.MeshStandardMaterial; hit: THREE.Mesh; cards: THREE.Group }[] = [];
  readonly out = new THREE.Vector3(0.2, 0, 1).normalize();
  readonly centre = new THREE.Vector3(-8.2, 0.95, 4.9);
  readonly cols = 4;
  readonly rows = 5;

  constructor(private oak: THREE.Material, private brass: THREE.Material) {
    const g = this.group;
    g.position.set(this.centre.x, 0, this.centre.z);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.out);
    const W = 1.72, H = 1.0, D = 0.52, base = 0.42;
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = oak) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      p.position.set(x, y, z);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      return p;
    };
    part(W + 0.06, 0.04, D + 0.06, 0, base + H + 0.02, 0);
    part(0.03, H, D, -W / 2, base + H / 2, 0);
    part(0.03, H, D, W / 2, base + H / 2, 0);
    part(W, H, 0.02, 0, base + H / 2, -D / 2);
    part(W, 0.03, D, 0, base, 0);
    for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) for (const z of [-D / 2 + 0.05, D / 2 - 0.05]) part(0.05, base, 0.05, x, base / 2, z);
    part(W, 0.06, 0.04, 0, base - 0.04, D / 2 - 0.02);
    const dw = W / this.cols - 0.02, dh = H / this.rows - 0.02;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const dg = new THREE.Group();
        const front = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.025), oak);
        front.castShadow = front.receiveShadow = true;
        front.position.z = D / 2 - 0.0125;
        const body = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.02, dh - 0.03, D - 0.05), new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.8 }));
        body.position.set(0, -0.01, -0.01);
        body.castShadow = true;
        const label = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });
        const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.075), label);
        tag.position.set(0, dh * 0.15, D / 2 + 0.001);
        const pull = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14, Math.PI), brass);
        pull.rotation.z = Math.PI;
        pull.position.set(0, -dh * 0.22, D / 2 + 0.004);
        const cards = new THREE.Group();
        cards.position.set(0, -0.01, 0);
        dg.add(body, front, tag, pull, cards);
        dg.position.set(-W / 2 + (c + 0.5) * (W / this.cols), base + H - (r + 0.5) * (H / this.rows), 0);
        const hit = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.06), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.z = D / 2;
        dg.add(hit);
        g.add(dg);
        const i = this.drawers.length;
        hit.userData.drawer = i;
        this.drawers.push({ group: dg, open: new Spring(0, 9), label, hit, cards });
      }
  }

  /** Label each drawer and fill it with cards. */
  dress(drawers: { label: string; cards: { file: string; title: string; stamp: string }[] }[]) {
    drawers.forEach((d, i) => {
      const dr = this.drawers[i];
      if (!dr) return;
      dr.label.map?.dispose();
      dr.label.map = drawerTagTexture(d.label, !d.cards.length);
      dr.label.needsUpdate = true;
      dr.cards.clear();
      // a dense block of blank guide cards, the catalogued ones standing at the front
      const n = 26;
      for (let k = 0; k < n; k++) {
        const real = d.cards[k];
        const m = new THREE.MeshStandardMaterial({ map: real ? catCardTexture(real.file, real.title, real.stamp) : null, color: real ? '#ffffff' : '#ece4cf', roughness: 0.9 });
        const card = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.0015), m);
        card.position.set(0, -0.012 + (k % 7 === 0 ? 0.008 : 0), 0.2 - k * 0.0135);
        card.rotation.x = -0.1;
        card.userData.k = k;
        dr.cards.add(card);
      }
    });
  }

  update(dt: number) {
    for (const d of this.drawers) {
      const v = d.open.update(dt);
      d.group.position.z = v * 0.34;
      // cards fan back as the drawer comes out
      d.cards.children.forEach((c, k) => {
        c.rotation.x = -0.1 - v * 0.25 * Math.max(0, 1 - k / 8);
      });
    }
  }

  /** Lift one card in an open drawer (the one being read in the list). */
  lift(drawer: number, k: number | null) {
    this.drawers[drawer]?.cards.children.forEach((c, i) => {
      c.position.y = -0.012 + (i === k ? 0.05 : 0);
    });
  }
}

/** The circulation desk, with its date stamp and the card it lands on. */
export class Desk {
  readonly group = new THREE.Group();
  readonly centre = new THREE.Vector3(7.6, 1.0, -4.65);
  readonly hit: THREE.Mesh;
  readonly stamp = new THREE.Group();
  readonly press = new Spring(0, 16);
  readonly card: THREE.MeshStandardMaterial;
  private marks: THREE.Mesh[] = [];
  private cardMesh: THREE.Mesh;

  constructor(walnut: THREE.Material, oak: THREE.Material, brass: THREE.Material) {
    const g = this.group;
    g.position.set(this.centre.x, 0, this.centre.z);
    const part = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      p.position.set(x, y, z);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
      return p;
    };
    part(3.2, 0.98, 0.7, 0, 0.49, 0, walnut);
    part(3.3, 0.04, 0.82, 0, 1.0, 0.03, oak);
    part(0.7, 0.98, 1.6, 1.25, 0.49, 0.9, walnut);
    part(0.8, 0.04, 1.7, 1.25, 1.0, 0.9, oak);
    part(1.2, 0.12, 0.01, -0.6, 0.78, 0.356, brass);
    // ink pad, card tray, bell
    part(0.16, 0.02, 0.1, -0.55, 1.03, 0.12, new THREE.MeshStandardMaterial({ color: '#2b2240', roughness: 0.6 }));
    part(0.36, 0.06, 0.2, 0.45, 1.05, 0.0, oak);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), brass);
    bell.position.set(1.0, 1.02, 0.15);
    g.add(bell);
    // date-due card lying on the desk
    this.card = new THREE.MeshStandardMaterial({ color: '#efe8d4', roughness: 0.9 });
    this.cardMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), this.card);
    this.cardMesh.rotation.x = -Math.PI / 2;
    this.cardMesh.rotation.z = 0.08;
    this.cardMesh.position.set(-0.15, 1.021, 0.14);
    this.cardMesh.receiveShadow = true;
    g.add(this.cardMesh);
    // the stamp: wooden knob, brass shank, rubber foot
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshStandardMaterial({ color: '#3a2414', roughness: 0.4 }));
    knob.position.y = 0.12;
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10), brass);
    shank.position.y = 0.065;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.8 }));
    foot.position.y = 0.01;
    this.stamp.add(knob, shank, foot);
    this.stamp.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    g.add(this.stamp);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 1.0), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, 0.6, 0);
    g.add(hit);
    this.hit = hit;
  }

  /** `p` 0 rest beside the pad → 1 pressed on the card. */
  update(dt: number) {
    const p = this.press.update(dt);
    const rest = new THREE.Vector3(-0.55, 1.02, 0.12), on = new THREE.Vector3(-0.15, 1.022, 0.14);
    const lift = Math.sin(Math.min(1, p) * Math.PI) * 0.12;
    this.stamp.position.lerpVectors(rest, on, p).add(new THREE.Vector3(0, lift * (p < 0.98 ? 1 : 0), 0));
  }

  /** Leave a mark on the card. */
  mark(text: string, n: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.028), new THREE.MeshBasicMaterial({ map: stampMarkTexture(text), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = 0.08 + ((n * 37) % 7 - 3) * 0.02;
    m.position.set(-0.15 - 0.05 + (n % 2) * 0.09, 1.0222, 0.14 - 0.035 + Math.floor(n / 2) * 0.032);
    this.group.add(m);
    this.marks.push(m);
    if (this.marks.length > 6) this.marks.shift()?.removeFromParent();
  }
}

/** A library ladder hooked to the brass rail, rolling along the left wall. */
export class Ladder {
  readonly group = new THREE.Group();
  readonly z = new Spring(4.2, 2.6);
  private wheels: THREE.Mesh[] = [];
  private lastZ = 4.2;

  constructor(wood: THREE.Material, brass: THREE.Material) {
    const top = new THREE.Vector3(ROOM.x0 + 0.6, 3.92, 0), foot = new THREE.Vector3(ROOM.x0 + 1.75, 0, 0);
    const len = top.distanceTo(foot);
    const ang = Math.atan2(foot.x - top.x, top.y - foot.y);
    const frame = new THREE.Group();
    for (const s of [-0.25, 0.25]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, len, 0.035), wood);
      rail.position.set(0, -len / 2, s);
      rail.castShadow = true;
      frame.add(rail);
    }
    for (let y = 0.28; y < len - 0.1; y += 0.3) {
      const rung = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.5), wood);
      rung.position.set(0.0, -y, 0);
      rung.castShadow = true;
      frame.add(rung);
    }
    frame.rotation.z = ang;
    frame.position.copy(top);
    this.group.add(frame);
    // hooks over the rail, wheels at the foot
    for (const s of [-0.25, 0.25]) {
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI * 1.3), brass);
      hook.position.set(top.x - 0.02, top.y + 0.03, s);
      hook.rotation.y = Math.PI / 2;
      this.group.add(hook);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 14), brass);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(foot.x, 0.04, s);
      this.group.add(wheel);
      this.wheels.push(wheel);
    }
  }

  update(dt: number) {
    const z = this.z.update(dt);
    this.group.position.z = z;
    const dz = z - this.lastZ;
    this.lastZ = z;
    for (const w of this.wheels) w.rotation.y += dz / 0.04;
  }

  get settled() {
    return Math.abs(this.z.value - this.z.target) < 0.03;
  }
}
