/**
 * A record folder: back board with tab, typed inner sheet, hinged front cover.
 * Origin sits at the bottom-centre of the folder; +Z is the front face.
 *
 * TOP SECRET records come in a string-and-button envelope instead: kraft,
 * a flap with a fibre disc, a second disc on the body, and a cotton string
 * wound round both in a figure of eight. Opening it unwinds the string (the
 * discs turn, the loose end drops), lifts the flap and draws the document
 * out and lays it over the envelope. Closing winds it all back.
 */
import * as THREE from 'three';
import type { ArchiveRecord } from '../types';
import { Spring, SpringV3, damp } from '../spring';
import { accessLogTexture, coverTexture, envelopeTexture, flapTexture, hash, inkOf, KRAFT, loadPhoto, MANILA, MANILA_DARK, pageTexture, plainTexture, tabTexture } from './textures';

export const FOLDER = {
  w: 2.9,
  h: 2.05,
  t: 0.014,
  gap: 0.026,
  tabW: 0.86,
  tabH: 0.24,
};

const box = new THREE.BoxGeometry(1, 1, 1);
const edgeMat = new THREE.MeshStandardMaterial({ color: MANILA_DARK, roughness: 0.95 });
const sheetEdge = new THREE.MeshStandardMaterial({ color: '#e7e0cf', roughness: 0.95 });

/** Paperclip: a bent wire swept along a flat path. Shared by all folders. */
const clipGeometry = (() => {
  const pts: THREE.Vector3[] = [];
  const add = (x: number, y: number) => pts.push(new THREE.Vector3(x, y, 0));
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
    for (let i = 0; i <= 10; i++) {
      const a = a0 + ((a1 - a0) * i) / 10;
      add(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  };
  add(0.03, -0.32);
  add(0.03, 0.0);
  arc(0, 0, 0.03, 0, Math.PI);
  add(-0.03, -0.38);
  arc(0.005, -0.38, 0.035, Math.PI, Math.PI * 2);
  add(0.04, 0.03);
  arc(-0.0025, 0.03, 0.0425, 0, Math.PI);
  add(-0.045, -0.2);
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  return new THREE.TubeGeometry(curve, 160, 0.0055, 6, false);
})();
const clipMat = new THREE.MeshStandardMaterial({ color: '#9ba0a6', metalness: 0.9, roughness: 0.28 });

export interface FolderPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export class Folder {
  readonly group = new THREE.Group();
  readonly hit: THREE.Object3D[] = [];
  readonly coverPivot = new THREE.Group();
  readonly pos!: SpringV3;
  readonly open = new Spring(0, 7);
  readonly quat = new THREE.Quaternion();
  readonly targetQuat = new THREE.Quaternion();
  private pageMat: THREE.MeshStandardMaterial;
  private coverInMat!: THREE.MeshStandardMaterial;
  private coverMat: THREE.MeshStandardMaterial;
  private covers = new Map<string, THREE.Texture>();
  private pages = new Map<string, THREE.Texture>();
  private photo: HTMLImageElement | null = null;
  private stampNow: string;
  private pageReady = false;
  slot = new THREE.Vector3();
  quatOmega = 9;
  /** String-and-button envelope instead of a folder. */
  readonly envelope: boolean;
  private env: Envelope | null = null;

  constructor(public readonly rec: ArchiveRecord, public readonly index: number, tabSlot: number) {
    const { w, h, t, gap, tabW, tabH } = FOLDER;
    const seed = hash(rec.file);
    this.envelope = rec.stamp === 'TOP SECRET';
    const plainIn = new THREE.MeshStandardMaterial({ map: plainTexture(this.envelope ? KRAFT : MANILA, seed % 5), roughness: 0.92 });
    const coverMat = new THREE.MeshStandardMaterial({ map: this.coverTex(rec.stamp), roughness: 0.9 });
    this.coverMat = coverMat;
    this.covers.set(rec.stamp, coverMat.map!);
    this.stampNow = rec.stamp;

    // Back board
    const back = new THREE.Mesh(box, [edgeMat, edgeMat, edgeMat, edgeMat, plainIn, plainIn]);
    back.scale.set(w, h, t);
    back.position.set(0, h / 2, -gap);
    back.castShadow = back.receiveShadow = true;

    // Tab (part of the back board)
    const tabMat = new THREE.MeshStandardMaterial({ map: tabTexture(rec.file, seed, rec.stamp === 'DECLASSIFIED' ? null : inkOf(rec.stamp)), roughness: 0.9 });
    const tab = new THREE.Mesh(box, [edgeMat, edgeMat, edgeMat, edgeMat, tabMat, tabMat]);
    tab.scale.set(tabW, tabH, t);
    const tabX = (tabSlot - 1) * (w - tabW) * 0.42;
    tab.position.set(tabX, h + tabH / 2 - 0.002, -gap);
    tab.castShadow = true;

    // Inner sheet (typed page, photo, paperclip)
    this.pageMat = new THREE.MeshStandardMaterial({ color: '#efe9db', roughness: 0.95 });
    const sheet = new THREE.Mesh(box, [sheetEdge, sheetEdge, sheetEdge, sheetEdge, this.pageMat, sheetEdge]);
    sheet.scale.set(w * 0.95, h * 0.93, 0.012);
    sheet.position.set(0.01, h * 0.48, 0);
    sheet.castShadow = sheet.receiveShadow = true;

    this.coverInMat = new THREE.MeshStandardMaterial({ map: plainIn.map, roughness: 0.92 });
    if (this.envelope) {
      this.env = new Envelope(this, back, tab, sheet, coverMat, plainIn, seed);
      this.pos = new SpringV3(new THREE.Vector3(), 7.5);
      // unwinding a string takes longer than lifting a cover
      this.open.omega = 2.1;
      return;
    }

    const clip = new THREE.Mesh(clipGeometry, clipMat);
    clip.position.set(-w * 0.31, h * 0.94, 0.012);
    clip.rotation.z = 0.04;
    clip.castShadow = true;

    // Hinged cover
    const cover = new THREE.Mesh(box, [edgeMat, edgeMat, edgeMat, edgeMat, coverMat, this.coverInMat]);
    cover.scale.set(w * 0.985, h * 0.975, t);
    cover.position.set((w * 0.985) / 2, (h * 0.975) / 2, 0);
    cover.castShadow = cover.receiveShadow = true;
    this.coverPivot.position.set(-w / 2, 0, gap);
    this.coverPivot.add(cover);

    this.group.add(back, tab, sheet, clip, this.coverPivot);
    this.hit.push(back, tab, cover);
    for (const m of this.hit) m.userData.folder = this;

    this.pos = new SpringV3(new THREE.Vector3(), 7.5);
    this.group.matrixAutoUpdate = true;
  }

  /** Inner page is drawn lazily, the first time the folder is opened. */
  async preparePage() {
    if (this.pageReady) return;
    this.pageReady = true;
    this.photo = this.rec.image ? await loadPhoto(this.rec.image) : null;
    this.pageMat.map = this.pageFor(this.stampNow);
    this.pageMat.color.set('#ffffff');
    this.pageMat.needsUpdate = true;
    this.coverInMat.map = accessLogTexture(this.rec);
    this.coverInMat.needsUpdate = true;
  }

  private pageFor(stamp: string) {
    let tex = this.pages.get(stamp);
    if (!tex) {
      tex = pageTexture(this.rec, this.photo, stamp);
      this.pages.set(stamp, tex);
    }
    return tex;
  }

  /** Redraw the typed cover and page (the record's texts changed language). */
  relabel() {
    for (const t of [...this.covers.values(), ...this.pages.values()]) t.dispose();
    this.covers.clear();
    this.pages.clear();
    const stamp = this.stampNow;
    const cover = this.coverTex(stamp);
    this.covers.set(stamp, cover);
    this.coverMat.map = cover;
    this.coverMat.needsUpdate = true;
    if (this.pageReady && this.pageMat.map) {
      this.pageMat.map = this.pageFor(stamp);
      this.pageMat.needsUpdate = true;
    }
  }

  /** Re-stamp the cover and inner page for an earlier draft (cached per classification). */
  setStamp(stamp: string) {
    if (stamp === this.stampNow) return;
    this.stampNow = stamp;
    let tex = this.covers.get(stamp);
    if (!tex) {
      tex = this.coverTex(stamp);
      this.covers.set(stamp, tex);
    }
    this.coverMat.map = tex;
    this.coverMat.needsUpdate = true;
    if (this.pageReady && this.pageMat.map) {
      this.pageMat.map = this.pageFor(stamp);
      this.pageMat.needsUpdate = true;
    }
  }

  private coverTex(stamp: string) {
    return this.envelope ? envelopeTexture(this.rec, hash(this.rec.file), stamp) : coverTexture(this.rec, hash(this.rec.file), stamp);
  }

  place(p: THREE.Vector3, q: THREE.Quaternion) {
    this.pos.jump(p);
    this.quat.copy(q);
    this.targetQuat.copy(q);
    this.group.position.copy(p);
    this.group.quaternion.copy(q);
  }

  update(dt: number) {
    this.group.position.copy(this.pos.update(dt));
    this.quat.slerp(this.targetQuat, damp(this.quatOmega, dt));
    this.group.quaternion.copy(this.quat);
    const u = this.open.update(dt);
    if (this.env) this.env.update(u);
    // cover swings open toward the viewer around its left edge
    else this.coverPivot.rotation.y = -u * 2.72;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const discGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.008, 32);
discGeo.rotateX(Math.PI / 2);
const discMat = new THREE.MeshStandardMaterial({ color: '#5a2a20', roughness: 0.75 });
const rivetGeo = new THREE.SphereGeometry(0.014, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
rivetGeo.rotateX(Math.PI / 2);
const rivetMat = new THREE.MeshStandardMaterial({ color: '#b08a4a', metalness: 0.9, roughness: 0.3 });
const stringMat = new THREE.MeshStandardMaterial({ color: '#e6dcc2', roughness: 0.9 });
const WINDS = 3;
const FLAP_H = 0.66;

/** The envelope's own parts and motion; the Folder keeps the shared ones. */
class Envelope {
  private flap = new THREE.Group();
  private upper = new THREE.Group();
  private lower = new THREE.Group();
  private string: THREE.Mesh;
  private lastWinds = -1;
  private sheetY: number;
  private front: number;

  constructor(private f: Folder, back: THREE.Mesh, tab: THREE.Mesh, private sheet: THREE.Mesh, coverMat: THREE.MeshStandardMaterial, plainIn: THREE.MeshStandardMaterial, seed: number) {
    const { w, h, t, gap } = FOLDER;
    const kraftEdge = new THREE.MeshStandardMaterial({ color: '#8f6a40', roughness: 0.95 });
    // the back board becomes kraft
    back.material = [kraftEdge, kraftEdge, kraftEdge, kraftEdge, plainIn, plainIn];
    // front panel, sealed along the sides and bottom
    const front = new THREE.Mesh(box, [kraftEdge, kraftEdge, kraftEdge, kraftEdge, coverMat, plainIn]);
    front.scale.set(w, h * 0.985, t);
    front.position.set(0, (h * 0.985) / 2, gap);
    front.castShadow = front.receiveShadow = true;
    this.front = gap + t / 2;

    // the flap, hinged at the top edge, hanging down over the front
    const shape = new THREE.Shape();
    const fw = w * 0.985 / 2;
    shape.moveTo(-fw, 0);
    shape.lineTo(fw, 0);
    shape.lineTo(fw, -FLAP_H * 0.55);
    shape.quadraticCurveTo(fw * 0.6, -FLAP_H * 0.86, 0, -FLAP_H);
    shape.quadraticCurveTo(-fw * 0.6, -FLAP_H * 0.86, -fw, -FLAP_H * 0.55);
    shape.lineTo(-fw, 0);
    const flapGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false, curveSegments: 16 });
    const pos = flapGeo.attributes.position as THREE.BufferAttribute;
    const uv = flapGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + fw) / (fw * 2), 1 + pos.getY(i) / FLAP_H);
    const flapMat = new THREE.MeshStandardMaterial({ map: flapTexture(seed), roughness: 0.9 });
    const flapMesh = new THREE.Mesh(flapGeo, [flapMat, kraftEdge]);
    flapMesh.castShadow = flapMesh.receiveShadow = true;
    this.flap.position.set(0, h * 0.985, this.front + 0.001);
    this.flap.add(flapMesh);

    // a fibre disc on the flap's tip and another on the body below, each on a rivet
    const disc = (g: THREE.Group) => {
      const d = new THREE.Mesh(discGeo, discMat);
      const r = new THREE.Mesh(rivetGeo, rivetMat);
      r.position.z = 0.004;
      d.castShadow = true;
      g.add(d, r);
      return g;
    };
    disc(this.upper).position.set(0, -FLAP_H + 0.14, 0.008);
    this.flap.add(this.upper);
    disc(this.lower).position.set(0, h * 0.985 - FLAP_H - 0.17, this.front + 0.004);

    this.string = new THREE.Mesh(new THREE.BufferGeometry(), stringMat);
    this.string.castShadow = true;

    this.sheetY = sheet.position.y;
    f.group.add(back, tab, sheet, front, this.flap, this.lower, this.string);
    f.hit.push(back, tab, front, flapMesh);
    for (const m of f.hit) m.userData.folder = f;
    this.update(0);
  }

  /** `u` 0 sealed → 1 open, document out and lying over the envelope. */
  update(u: number) {
    const { h, t, gap } = FOLDER;
    const unwind = smooth(0, 0.42, u);
    const lift = smooth(0.38, 0.68, u);
    const out = smooth(0.62, 1, u);
    this.flap.rotation.x = -lift * Math.PI * 0.94;
    // the discs turn as the string comes off them
    this.upper.rotation.z = unwind * Math.PI * 5;
    this.lower.rotation.z = -unwind * Math.PI * 6;
    const winds = WINDS * (1 - unwind);
    if (Math.abs(winds - this.lastWinds) > 0.004 || this.lastWinds < 0 || (lift > 0 && lift < 1)) {
      this.lastWinds = winds;
      this.wind(winds);
    }
    // the document comes up out of the mouth, forward, and down over the front
    const rise = h * 0.98 * (smooth(0, 0.55, out) - smooth(0.55, 1, out));
    this.sheet.position.y = this.sheetY + rise;
    this.sheet.position.z = smooth(0.42, 0.72, out) * (gap * 2 + t + 0.03);
  }

  /** Rebuild the string: `winds` turns left round the discs, the rest hanging loose. */
  private wind(winds: number) {
    const lowerC = this.lower.position.clone();
    this.flap.updateMatrix();
    this.upper.updateMatrix();
    const upperC = new THREE.Vector3().setFromMatrixPosition(this.upper.matrix).applyMatrix4(this.flap.matrix);
    const m = lowerC.clone().lerp(upperC, 0.5);
    const d = upperC.y - lowerC.y;
    const r = 0.085;
    const pts: THREE.Vector3[] = [];
    const total = Math.PI * 2 * winds;
    const steps = Math.max(2, Math.ceil(winds * 48));
    const t0 = -Math.PI / 2;
    for (let i = 0; i <= steps && winds > 0.01; i++) {
      const a = t0 + (total * i) / steps;
      const loop = (a - t0) / (Math.PI * 2);
      const spread = 1 + loop * 0.05;
      const x = r * 1.3 * spread * Math.sin(2 * a) + m.x;
      const y = m.y + (d / 2 + r * 0.92) * spread * Math.sin(a);
      // turns pile up on each other; the crossing rides over the last turn
      const z = this.front + 0.012 + loop * 0.0025 + Math.max(0, Math.cos(a)) * 0.002;
      pts.push(new THREE.Vector3(x, y, z));
    }
    // the loose end, hanging from wherever the winding stops
    const start = pts.length ? pts[pts.length - 1].clone() : new THREE.Vector3(lowerC.x, lowerC.y - r, this.front + 0.012);
    if (!pts.length) pts.push(start.clone());
    const hang = 0.25 + (1 - winds / WINDS) * 0.75;
    const sway = 0.06 + (1 - winds / WINDS) * 0.1;
    for (let i = 1; i <= 10; i++) {
      const k = i / 10;
      pts.push(new THREE.Vector3(start.x + Math.sin(k * Math.PI) * sway, start.y - hang * k, start.z + 0.006 + k * 0.01));
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
    this.string.geometry.dispose();
    this.string.geometry = new THREE.TubeGeometry(curve, Math.max(24, pts.length * 3), 0.0045, 5, false);
  }
}

/* ======================================================================
   Filler folders: one instanced mesh per archive, no labels.
   ====================================================================== */
export function fillerGeometry() {
  const { w, h, t, tabW, tabH } = FOLDER;
  const body = new THREE.BoxGeometry(w, h, t * 3.2);
  body.translate(0, h / 2, 0);
  const tabs = [0, 1, 2].map((slot) => {
    const g = new THREE.BoxGeometry(tabW, tabH, t);
    g.translate((slot - 1) * (w - tabW) * 0.42, h + tabH / 2, -t);
    return g;
  });
  return { body, tabs };
}
