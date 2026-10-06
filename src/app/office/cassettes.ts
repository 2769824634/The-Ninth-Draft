/**
 * The cassettes as things: a wooden rack on the sideboard where every tape
 * lies in its own slot, spine out, and the moves a hand makes with them.
 * A tape is pulled out of its slot and held up to be read; from the hand it
 * goes into well A or B of the deck, or back where it came from. Ejected,
 * it pops out of the well and goes home to its slot.
 *
 * Everything here is in the sideboard's own coordinates (metres).
 */
import * as THREE from 'three';
import { cassetteTexture, hubTexture, spineTexture } from './textures';
import { woodTexture } from '../library/textures';

export interface ShelfTape {
  id: string;
  code: string;
  title: string;
  ink: string;
}

export type Well = 'A' | 'B';

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

interface Leg {
  to: Pose;
  dur: number;
  from?: Pose;
  t: number;
}

/** Cassette: 100 × 64 × 14 mm; its +z face is the label, +y the spine. */
const W = 0.1, H = 0.064, D = 0.014;
/** Rack slot pitch. */
const PX = 0.112, PY = 0.0175;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const quat = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));

class Cassette {
  readonly group = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly hubs: THREE.Mesh[] = [];
  readonly label: THREE.MeshStandardMaterial;
  readonly spine: THREE.MeshStandardMaterial;
  slot!: Pose;
  /** Where it is, or is going: the rack, the hand, a well. */
  at: 'rack' | 'hand' | Well = 'rack';
  hover = 0;
  hovered = false;
  spin = 0;
  private legs: Leg[] = [];
  private done?: () => void;

  constructor(readonly tape: ShelfTape, shell: THREE.Material, hub: THREE.Material) {
    this.label = new THREE.MeshStandardMaterial({ map: cassetteTexture(tape.code, tape.title, tape.ink), roughness: 0.45 });
    this.spine = new THREE.MeshStandardMaterial({ map: spineTexture(tape.code, tape.title, tape.ink), roughness: 0.45 });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [shell, shell, this.spine, shell, this.label, shell]);
    this.body.castShadow = this.body.receiveShadow = true;
    this.body.userData.tape = tape.id;
    this.group.add(this.body);
    for (const x of [-0.021, 0.021]) {
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.0072, 24), hub);
      h.position.set(x, -0.0008, D / 2 + 0.0004);
      this.group.add(h);
      this.hubs.push(h);
    }
  }

  relabel(title: string) {
    this.tape.title = title;
    this.label.map?.dispose();
    this.label.map = cassetteTexture(this.tape.code, title, this.tape.ink);
    this.spine.map?.dispose();
    this.spine.map = spineTexture(this.tape.code, title, this.tape.ink);
    this.label.needsUpdate = this.spine.needsUpdate = true;
  }

  place(p: Pose) {
    this.group.position.copy(p.p);
    this.group.quaternion.copy(p.q);
  }

  get moving() {
    return this.legs.length > 0;
  }

  /** Go through these poses, one after another; `done` when it arrives. */
  go(poses: [Pose, number][], done?: () => void) {
    this.legs = poses.map(([to, dur]) => ({ to, dur, t: 0 }));
    this.done = done;
  }

  tick(dt: number) {
    for (const h of this.hubs) h.rotation.z += this.spin * dt;
    // in the rack, a tape under the pointer slides out a finger's width
    this.hover += ((this.hovered && this.at === 'rack' && !this.moving ? 1 : 0) - this.hover) * Math.min(1, dt * 12);
    const leg = this.legs[0];
    if (!leg) {
      if (this.at === 'rack') this.group.position.z = this.slot.p.z + this.hover * 0.014;
      return;
    }
    if (!leg.from) leg.from = { p: this.group.position.clone(), q: this.group.quaternion.clone() };
    leg.t = Math.min(1, leg.t + dt / leg.dur);
    const k = ease(leg.t);
    this.group.position.lerpVectors(leg.from.p, leg.to.p, k);
    this.group.quaternion.slerpQuaternions(leg.from.q, leg.to.q, k);
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

export class TapeShelf {
  private items = new Map<string, Cassette>();
  /** Centre of each well on the deck face (sideboard coordinates), and where a held tape is read. */
  private wells: Record<Well, THREE.Vector3>;
  readonly hold: Pose;
  private fast: boolean;

  constructor(parent: THREE.Group, tapes: ShelfTape[], wells: Record<Well, THREE.Vector3>, holdDir: THREE.Vector3, reduce: boolean) {
    this.wells = wells;
    this.fast = reduce;
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture(23, '#6b4a2e'), roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ map: woodTexture(24, '#3b2717'), roughness: 0.65 });
    const shell = new THREE.MeshStandardMaterial({ color: '#2a2826', roughness: 0.4 });
    const hub = new THREE.MeshStandardMaterial({ map: hubTexture(), roughness: 0.5, transparent: true });

    // the rack grows a column every eight tapes (five at most, then taller)
    const n = Math.max(tapes.length, 1);
    const cols = Math.min(5, Math.max(2, Math.ceil(n / 8)));
    const rows = Math.max(8, Math.ceil(n / cols));
    const rw = cols * PX + 0.016, rh = rows * PY + 0.016, rd = 0.074;
    const rx = 0.1 + rw / 2, ry = 0.79, rz = 0.0;
    const rack = new THREE.Group();
    rack.position.set(rx, ry, rz);
    parent.add(rack);
    const board = (w: number, h: number, d: number, x: number, y: number, z: number, m = wood) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = b.receiveShadow = true;
      rack.add(b);
    };
    board(rw, 0.008, rd, 0, 0.004, 0);
    board(rw, 0.008, rd, 0, rh - 0.004, 0);
    board(rw, rh, 0.006, 0, rh / 2, -rd / 2 + 0.003, dark);
    for (let c = 0; c <= cols; c++) board(0.006, rh, rd, -rw / 2 + 0.005 + c * PX, rh / 2, 0);
    // thin runners under each row
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) board(PX - 0.008, 0.0015, rd * 0.4, -rw / 2 + 0.008 + (c + 0.5) * PX, 0.008 + r * PY, -rd * 0.2, dark);

    const lying = quat(Math.PI / 2);
    tapes.forEach((t, i) => {
      const c = Math.floor(i / rows), r = rows - 1 - (i % rows);
      const cas = new Cassette({ ...t }, shell, hub);
      cas.slot = {
        p: new THREE.Vector3(rx - rw / 2 + 0.008 + (c + 0.5) * PX, ry + 0.008 + r * PY + D / 2 + 0.0012, rz + rd / 2 - H / 2 - 0.004),
        q: lying.clone(),
      };
      cas.place(cas.slot);
      parent.add(cas.group);
      this.items.set(t.id, cas);
    });

    // held up in front of the deck, label turned to whoever is looking
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), holdDir.clone().normalize());
    this.hold = { p: new THREE.Vector3(-0.02, 1.17, 0.3), q: q.multiply(quat(0, 0, 0.06)) };
  }

  /** Pointer targets: every tape's body. */
  get meshes() {
    return [...this.items.values()].map((c) => c.body);
  }

  where(id: string) {
    return this.items.get(id)?.at ?? 'rack';
  }

  setHover(id: string | null) {
    for (const c of this.items.values()) c.hovered = c.tape.id === id;
  }

  relabel(title: (id: string) => string) {
    for (const c of this.items.values()) c.relabel(title(c.tape.id));
  }

  private d(s: number) {
    return this.fast ? Math.min(s, 0.12) : s;
  }

  private out(c: Cassette): Pose {
    return { p: c.slot.p.clone().add(new THREE.Vector3(0, 0.004, 0.11)), q: c.slot.q.clone() };
  }

  private seat(w: Well): Pose {
    return { p: this.wells[w].clone().add(new THREE.Vector3(0, 0, D / 2 + 0.002)), q: new THREE.Quaternion() };
  }

  private front(w: Well, tilt = -0.35, z = 0.07): Pose {
    return { p: this.wells[w].clone().add(new THREE.Vector3(0, 0.008, z)), q: quat(tilt) };
  }

  /** Out of the rack and up into the hand. */
  take(id: string, done?: () => void) {
    const c = this.items.get(id);
    if (!c) return;
    c.at = 'hand';
    c.go([[this.out(c), this.d(0.35)], [this.hold, this.d(0.7)]], done);
  }

  /** From the hand back into its slot. */
  putBack(id: string, done?: () => void) {
    const c = this.items.get(id);
    if (!c) return;
    c.at = 'rack';
    c.go([[this.out(c), this.d(0.6)], [c.slot, this.d(0.35)]], done);
  }

  /** From the hand into a well: lined up with the door, then pushed home. */
  load(id: string, w: Well, done?: () => void) {
    const c = this.items.get(id);
    if (!c) return;
    c.at = w;
    c.go([[this.front(w), this.d(0.6)], [this.front(w, -0.1, 0.025), this.d(0.2)], [this.seat(w), this.d(0.18)]], done);
  }

  /** The door springs open, the tape tips out, and goes back to the rack. */
  eject(id: string, w: Well, done?: () => void) {
    const c = this.items.get(id);
    if (!c) return;
    c.at = 'rack';
    c.spin = 0;
    c.go([[this.front(w, -0.4, 0.03), this.d(0.18)], [this.front(w, -0.4, 0.035), this.d(0.25)], [this.out(c), this.d(0.75)], [c.slot, this.d(0.35)]], done);
  }

  /** Hubs of whatever sits in each well turn at that well's speed. */
  tick(dt: number, spin: Record<Well, number>) {
    for (const c of this.items.values()) {
      c.spin = c.at === 'A' || c.at === 'B' ? (c.moving ? 0 : spin[c.at]) : 0;
      c.tick(dt);
    }
  }
}
