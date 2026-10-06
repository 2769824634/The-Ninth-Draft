/**
 * Slide trays as things. Each tray lives in its own cardboard box, and the
 * boxes stand on edge in a wooden crate on the rug by the coffee table,
 * spine up, like records. A box is lifted out and opened in the hand to be
 * read; from the hand it goes to the projector trolley: the box onto the
 * lower shelf, the tray out of it and onto the projector. Lifted off again,
 * the tray goes back into its box and the box back to its place in the crate.
 *
 * Real sizes: an eighty-slot tray is about 245 mm across and 60 mm deep, its
 * box 270 × 270 × 78 mm, a slide mount 50 mm square.
 *
 * Everything moves in room coordinates; the tray is handed between the box
 * and the projector's seat with `attach`, which keeps where it is in the room.
 */
import * as THREE from 'three';
import { TRAY } from './slides';
import { trayBoardTexture, trayLidTexture, traySpineTexture } from './textures';
import { woodTexture } from '../library/textures';
import type { Projector } from './projector';

export interface TrayInfo {
  id: string;
  code: string;
  title: string;
  count: number;
  ink: string;
}

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

/* ---------------- the tray ---------------- */
export const R_OUT = 0.122, R_IN = 0.056, R_MID = 0.09;
const MONO = '"IBM Plex Mono", ui-monospace, monospace';

/** Numbers round the tray lid, every fifth slot, laid out for RingGeometry's planar UVs. */
function trayRingTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f2d2a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#d8d3c4';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 30px ${MONO}`;
  const rho = ((R_IN + R_OUT) / 2 / R_OUT) * (S / 2);
  for (let i = 0; i < TRAY; i++) {
    const a = (i / TRAY) * Math.PI * 2;
    const x = S / 2 + Math.cos(a) * rho, y = S / 2 + Math.sin(a) * rho;
    if (i % 5 === 4 || i === 0) {
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      g.fillText(String(i + 1), 0, 0);
      g.restore();
    } else g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let shared: Record<string, THREE.Material | THREE.BufferGeometry> | null = null;
function parts() {
  if (shared) return shared;
  const black = new THREE.MeshStandardMaterial({ color: '#151514', roughness: 0.38, metalness: 0.45 });
  shared = {
    black,
    wall: new THREE.MeshStandardMaterial({ color: '#232120', roughness: 0.45, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d4d6d8', roughness: 0.16, metalness: 0.95 }),
    lid: new THREE.MeshStandardMaterial({ map: trayRingTexture(), roughness: 0.3, transparent: true, opacity: 0.9 }),
    mount: new THREE.MeshStandardMaterial({ color: '#ece6d6', roughness: 0.8 }),
    gWallOut: new THREE.CylinderGeometry(R_OUT, R_OUT, 0.056, 64, 1, true),
    gWallIn: new THREE.CylinderGeometry(R_IN, R_IN, 0.056, 40, 1, true),
    gFloor: new THREE.RingGeometry(R_IN, R_OUT, 64),
    gLid: new THREE.RingGeometry(R_IN, R_OUT, 80),
    gHub: new THREE.CylinderGeometry(0.042, 0.046, 0.016, 32),
    gCap: new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24),
    gGrip: new THREE.BoxGeometry(0.012, 0.006, 0.028),
    gDiv: new THREE.BoxGeometry(R_OUT - R_IN - 0.004, 0.05, 0.0008),
    gMount: new THREE.BoxGeometry(0.05, 0.05, 0.0016),
  };
  return shared;
}

/** An eighty-slot carousel tray with `n` slides in it. Origin: the middle of its underside. */
export class SlideTray {
  readonly group = new THREE.Group();
  /** The part that turns on the projector. */
  readonly rotor = new THREE.Group();
  private mounts: THREE.InstancedMesh;

  constructor(readonly n: number) {
    const P = parts();
    const m = (g: string, mat: string) => {
      const o = new THREE.Mesh(P[g] as THREE.BufferGeometry, P[mat] as THREE.Material);
      o.castShadow = o.receiveShadow = true;
      this.rotor.add(o);
      return o;
    };
    this.group.add(this.rotor);
    m('gWallOut', 'wall').position.y = 0.028;
    m('gWallIn', 'black').position.y = 0.028;
    const floor = m('gFloor', 'black');
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.002;
    const lid = m('gLid', 'lid');
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 0.057;
    m('gHub', 'chrome').position.y = 0.062;
    m('gCap', 'black').position.y = 0.071;
    // two finger grips on the locking ring
    for (const a of [0, Math.PI]) {
      const g = m('gGrip', 'black');
      g.position.set(Math.cos(a) * 0.036, 0.072, Math.sin(a) * 0.036);
      g.rotation.y = -a;
    }
    // the slot dividers
    const mm = new THREE.Matrix4();
    const div = new THREE.InstancedMesh(P.gDiv as THREE.BufferGeometry, P.black as THREE.Material, TRAY);
    for (let i = 0; i < TRAY; i++) {
      const a = ((i + 0.5) / TRAY) * Math.PI * 2;
      mm.makeRotationY(-a).setPosition(Math.cos(a) * R_MID, 0.027, Math.sin(a) * R_MID);
      div.setMatrixAt(i, mm);
    }
    this.rotor.add(div);
    // the slides: card mounts standing in their slots
    this.mounts = new THREE.InstancedMesh(P.gMount as THREE.BufferGeometry, P.mount as THREE.Material, Math.max(n, 1));
    this.mounts.count = Math.min(n, TRAY);
    this.mounts.castShadow = true;
    this.rotor.add(this.mounts);
    this.place(-1, 0);
  }

  /** Slot i sits at angle i/80 round the tray; slide `down` hangs `drop` (0..1) of the way into the gate. */
  place(down: number, drop: number) {
    const mm = new THREE.Matrix4();
    for (let i = 0; i < this.mounts.count; i++) {
      const a = (i / TRAY) * Math.PI * 2;
      const y = 0.029 - (i === down ? drop * 0.052 : 0);
      mm.makeRotationY(-a).setPosition(Math.cos(a) * R_MID, y, Math.sin(a) * R_MID);
      this.mounts.setMatrixAt(i, mm);
    }
    this.mounts.instanceMatrix.needsUpdate = true;
  }
}

/* ---------------- the box ---------------- */
const BW = 0.27, BH = 0.078;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Something that walks through poses (room coordinates), one leg after another. */
class Mover {
  private legs: { to: Pose; dur: number; from?: Pose; t: number }[] = [];
  private done?: () => void;
  constructor(readonly obj: THREE.Object3D) {}
  get moving() {
    return this.legs.length > 0;
  }
  go(poses: [Pose, number][], done?: () => void) {
    this.legs = poses.map(([to, dur]) => ({ to, dur, t: 0 }));
    this.done = done;
    if (!this.legs.length) done?.();
  }
  tick(dt: number) {
    const leg = this.legs[0];
    if (!leg) return;
    if (!leg.from) leg.from = { p: this.obj.position.clone(), q: this.obj.quaternion.clone() };
    leg.t = Math.min(1, leg.t + dt / leg.dur);
    const k = ease(leg.t);
    this.obj.position.lerpVectors(leg.from.p, leg.to.p, k);
    this.obj.quaternion.slerpQuaternions(leg.from.q, leg.to.q, k);
    if (leg.t >= 1) {
      this.legs.shift();
      if (!this.legs.length) {
        const d = this.done;
        this.done = undefined;
        d?.();
      }
    }
  }
}

class TrayBox {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh;
  /** Where the tray sits inside. */
  readonly inner = new THREE.Object3D();
  readonly tray: SlideTray;
  readonly move: Mover;
  readonly trayMove: Mover;
  slot!: Pose;
  at: 'crate' | 'hand' | 'shelf' = 'crate';
  /** The tray: in the box, or on the projector. */
  trayOn = false;
  hover = 0;
  hovered = false;
  private lid = new THREE.Group();
  private lidOpen = 0;
  lidTarget = 0;
  private lidMat: THREE.MeshStandardMaterial;
  private spineMats: THREE.MeshStandardMaterial[];

  constructor(readonly info: TrayInfo, board: THREE.Material, inside: THREE.Material, private zh: boolean) {
    const t = 0.003;
    const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material | THREE.Material[]) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.castShadow = o.receiveShadow = true;
      this.group.add(o);
      return o;
    };
    this.lidMat = new THREE.MeshStandardMaterial({ map: trayLidTexture(info.code, info.title, info.count, info.ink, zh), roughness: 0.75 });
    const spine = () => new THREE.MeshStandardMaterial({ map: traySpineTexture(info.code, info.title, info.ink), roughness: 0.75 });
    this.spineMats = [spine(), spine()];
    // the bottom half: floor and four walls, grey inside
    wall(BW, t, BW, 0, t / 2, 0, [board, board, board, inside, board, board]);
    // front (+z) and left (-x) carry the spine label: the crate shows them
    wall(BW, BH - 0.012, t, 0, (BH - 0.012) / 2, BW / 2 - t / 2, [board, board, board, board, this.spineMats[0], inside]);
    wall(BW, BH - 0.012, t, 0, (BH - 0.012) / 2, -BW / 2 + t / 2, [board, board, board, board, inside, board]);
    wall(t, BH - 0.012, BW, BW / 2 - t / 2, (BH - 0.012) / 2, 0, [board, inside, board, board, board, board]);
    wall(t, BH - 0.012, BW, -BW / 2 + t / 2, (BH - 0.012) / 2, 0, [inside, this.spineMats[1], board, board, board, board]);
    // the lid: a shallow cap hinged at the back edge
    this.lid.position.set(0, BH - 0.012, -BW / 2);
    this.group.add(this.lid);
    const lw = BW + 0.004;
    const lp = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material | THREE.Material[]) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z + lw / 2 - 0.002);
      o.castShadow = o.receiveShadow = true;
      this.lid.add(o);
    };
    lp(lw, t, lw, 0, 0.012 - t / 2, 0, [board, board, this.lidMat, inside, board, board]);
    lp(lw, 0.014, t, 0, 0.005, lw / 2 - t / 2, board);
    lp(t, 0.014, lw, lw / 2 - t / 2, 0.005, 0, board);
    lp(t, 0.014, lw, -lw / 2 + t / 2, 0.005, 0, board);
    // the tray inside
    this.inner.position.set(0, t, 0);
    this.group.add(this.inner);
    this.tray = new SlideTray(info.count);
    this.inner.add(this.tray.group);
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BW), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.y = BH / 2;
    this.hit.userData.trayBox = info.id;
    this.group.add(this.hit);
    this.move = new Mover(this.group);
    this.trayMove = new Mover(this.tray.group);
  }

  relabel(title: string, zh: boolean) {
    this.info.title = title;
    this.zh = zh;
    this.lidMat.map?.dispose();
    this.lidMat.map = trayLidTexture(this.info.code, title, this.info.count, this.info.ink, zh);
    this.lidMat.needsUpdate = true;
    for (const m of this.spineMats) {
      m.map?.dispose();
      m.map = traySpineTexture(this.info.code, title, this.info.ink);
      m.needsUpdate = true;
    }
  }

  place(p: Pose) {
    this.group.position.copy(p.p);
    this.group.quaternion.copy(p.q);
  }

  tick(dt: number) {
    this.lidOpen += (this.lidTarget - this.lidOpen) * Math.min(1, dt * 7);
    this.lid.rotation.x = -this.lidOpen * 1.95;
    this.hover += ((this.hovered && this.at === 'crate' && !this.move.moving ? 1 : 0) - this.hover) * Math.min(1, dt * 12);
    if (this.move.moving) this.move.tick(dt);
    else if (this.at === 'crate') this.group.position.y = this.slot.p.y + this.hover * 0.03;
    this.trayMove.tick(dt);
  }
}

/* ---------------- the crate ---------------- */
export interface CrateOpts {
  /** Middle of the crate's floor footprint on the rug (room coordinates); it runs along z, its side to +x. */
  at: THREE.Vector3;
  /** Where a box is held up to be read, and the direction it is read from. */
  hold: THREE.Vector3;
  holdDir: THREE.Vector3;
  projector: Projector;
  /** The tray that starts on the projector. */
  mounted?: string;
  reduce: boolean;
  zh: boolean;
}

const PITCH = 0.088;
/** How far out from the trolley's side (−z) a box or tray clears it. */
const SIDE = 0.44;

export class TrayCrate {
  readonly group = new THREE.Group();
  private boxes = new Map<string, TrayBox>();
  private fast: boolean;
  private proj: Projector;
  readonly holdPose: Pose;

  constructor(private parent: THREE.Group, trays: TrayInfo[], o: CrateOpts) {
    this.fast = o.reduce;
    this.proj = o.projector;
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(31, '#8a6440'), roughness: 0.6 });
    const board = new THREE.MeshStandardMaterial({ map: trayBoardTexture(), roughness: 0.78 });
    const inside = new THREE.MeshStandardMaterial({ color: '#8f8a80', roughness: 0.9 });

    // a slatted wooden crate, long enough for every box and a finger's gap
    const n = Math.max(trays.length, 4);
    const L = n * PITCH + 0.05, D = BW + 0.04, H = 0.16, t = 0.014;
    this.group.position.copy(o.at);
    parent.add(this.group);
    const b = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    // built along x, then turned to run along z
    this.group.rotation.y = -Math.PI / 2;
    b(L, t, D, 0, t / 2, 0);
    for (const x of [-L / 2 + t / 2, L / 2 - t / 2]) {
      b(t, H, D, x, H / 2, 0);
      // a grip rail across each end
      b(t + 0.004, 0.022, 0.12, x, H - 0.02, 0);
    }
    for (const z of [-D / 2 + t / 2, D / 2 - t / 2]) for (const y of [0.035, 0.1, H - 0.012]) b(L, 0.04 - (y > 0.12 ? 0.016 : 0), t, 0, y, z);
    for (const x of [-L / 2 + 0.03, L / 2 - 0.03]) for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) b(0.02, H, 0.02, x, H / 2, z);

    // a box standing on edge: its thin side along the crate, its front (spine) up, its left side to the sofa
    const standing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
    trays.forEach((tr, i) => {
      const box = new TrayBox({ ...tr }, board, inside, o.zh);
      const z = o.at.z - L / 2 + 0.03 + i * PITCH + 0.004;
      box.slot = { p: new THREE.Vector3(o.at.x, o.at.y + t + BW / 2 + 0.002, z), q: standing.clone() };
      box.place(box.slot);
      parent.add(box.group);
      this.boxes.set(tr.id, box);
    });

    // held up: lying flat, front to the reader, tipped toward them, lid open
    const flat = new THREE.Vector3(o.holdDir.x, 0, o.holdDir.z).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), flat);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.62));
    this.holdPose = { p: o.hold.clone(), q };

    // the tray that starts on the projector: its box open on the trolley's lower shelf
    const first = o.mounted ? this.boxes.get(o.mounted) : undefined;
    if (first) {
      first.at = 'shelf';
      first.place(this.shelf());
      first.lidTarget = 1;
      first.trayOn = true;
      this.proj.group.updateMatrixWorld(true);
      this.proj.seat.attach(first.tray.group);
      first.tray.group.position.set(0, 0, 0);
      first.tray.group.quaternion.identity();
      this.proj.mount(first.tray);
    }
  }

  get meshes() {
    return [...this.boxes.values()].map((b) => b.hit);
  }

  where(id: string) {
    return this.boxes.get(id)?.at ?? 'crate';
  }

  get busy() {
    for (const b of this.boxes.values()) if (b.move.moving || b.trayMove.moving) return true;
    return false;
  }

  setHover(id: string | null) {
    for (const b of this.boxes.values()) b.hovered = b.info.id === id;
  }

  relabel(title: (id: string) => string, zh: boolean) {
    for (const b of this.boxes.values()) b.relabel(title(b.info.id), zh);
  }

  private d(s: number) {
    return this.fast ? Math.min(s, 0.12) : s;
  }

  private world(o: THREE.Object3D): Pose {
    o.updateWorldMatrix(true, false);
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    o.matrixWorld.decompose(p, q, new THREE.Vector3());
    return { p, q };
  }

  /** On the trolley's lower shelf, flat, its front to the room. */
  private shelf(): Pose {
    return this.world(this.proj.shelfSpot);
  }

  private off(p: Pose, x: number, y: number, z: number, q = p.q): Pose {
    return { p: p.p.clone().add(new THREE.Vector3(x, y, z)), q: q.clone() };
  }

  private out(b: TrayBox): Pose {
    return this.off(b.slot, 0, BW * 0.75, 0);
  }

  /** Out of the crate and up to be read, lid open. */
  take(id: string, done?: () => void) {
    const b = this.boxes.get(id);
    if (!b) return;
    b.at = 'hand';
    b.move.go([[this.out(b), this.d(0.4)], [this.holdPose, this.d(0.7)]], () => {
      b.lidTarget = 1;
      done?.();
    });
  }

  /** From the hand back into its place. */
  putBack(id: string, done?: () => void) {
    const b = this.boxes.get(id);
    if (!b) return;
    b.at = 'crate';
    b.lidTarget = 0;
    b.move.go([[this.holdPose, this.d(0.25)], [this.out(b), this.d(0.65)], [b.slot, this.d(0.4)]], done);
  }

  /** From the hand to the trolley, then the tray out of the box and onto the projector. */
  load(id: string, done?: () => void) {
    const b = this.boxes.get(id);
    if (!b) return;
    b.at = 'shelf';
    const s = this.shelf();
    const side = this.off(s, 0, 0.05, -SIDE);
    b.move.go([[this.off(side, -0.3, 0.85, 0), this.d(0.9)], [this.off(side, 0, 0.3, 0), this.d(0.4)], [side, this.d(0.3)], [this.off(s, 0, 0.02, 0), this.d(0.4)], [s, this.d(0.15)]], () => {
      // the tray: up, out from under the top, up past it, over the seat, down
      this.parent.attach(b.tray.group);
      const tp = this.world(b.tray.group);
      const seat = this.world(this.proj.seat);
      const lift = this.off(tp, 0, 0.06, 0);
      const outside = this.off(lift, 0, 0, -SIDE);
      const high = { p: new THREE.Vector3(outside.p.x, seat.p.y + 0.14, outside.p.z), q: seat.q.clone() };
      const over = this.off(seat, 0, 0.12, 0);
      b.trayMove.go([[lift, this.d(0.3)], [outside, this.d(0.45)], [high, this.d(0.5)], [over, this.d(0.45)], [seat, this.d(0.3)]], () => {
        this.proj.seat.attach(b.tray.group);
        b.tray.group.position.set(0, 0, 0);
        b.tray.group.quaternion.identity();
        b.trayOn = true;
        this.proj.mount(b.tray);
        done?.();
      });
    });
  }

  /** The tray off the projector, back into its box, the box closed and back in the crate. */
  unload(id: string, leaving?: () => void, done?: () => void) {
    const b = this.boxes.get(id);
    if (!b || !b.trayOn) {
      leaving?.();
      return done?.();
    }
    this.proj.mount(null);
    this.parent.attach(b.tray.group);
    const seat = this.world(b.tray.group);
    const inBox = this.world(b.inner);
    const lift = this.off(inBox, 0, 0.06, 0);
    const outside = this.off(lift, 0, 0, -SIDE);
    const high = { p: new THREE.Vector3(outside.p.x, seat.p.y + 0.14, outside.p.z), q: inBox.q.clone() };
    const over = this.off(seat, 0, 0.12, 0);
    b.trayMove.go([[over, this.d(0.3)], [high, this.d(0.45)], [outside, this.d(0.5)], [lift, this.d(0.45)], [inBox, this.d(0.3)]], () => {
      b.inner.attach(b.tray.group);
      b.tray.group.position.set(0, 0, 0);
      b.tray.group.quaternion.identity();
      b.trayOn = false;
      b.lidTarget = 0;
      b.at = 'crate';
      const s = this.shelf();
      const side = this.off(s, 0, 0.05, -SIDE);
      window.setTimeout(() => {
        leaving?.();
        b.move.go([[side, this.d(0.4)], [this.off(side, -0.3, 0.85, 0), this.d(0.5)], [this.off(b.slot, 0, 0.75, 0), this.d(0.8)], [this.out(b), this.d(0.3)], [b.slot, this.d(0.4)]], done);
      }, this.fast ? 0 : 300);
    });
  }

  tick(dt: number) {
    for (const b of this.boxes.values()) b.tick(dt);
  }
}
