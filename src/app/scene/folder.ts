/**
 * A record folder: back board with tab, typed inner sheet, hinged front cover.
 * Origin sits at the bottom-centre of the folder; +Z is the front face.
 */
import * as THREE from 'three';
import type { ArchiveRecord } from '../types';
import { Spring, SpringV3, damp } from '../spring';
import { accessLogTexture, coverTexture, hash, inkOf, loadPhoto, MANILA, MANILA_DARK, pageTexture, plainTexture, tabTexture } from './textures';

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
  readonly pos: SpringV3;
  readonly open = new Spring(0, 7);
  readonly quat = new THREE.Quaternion();
  readonly targetQuat = new THREE.Quaternion();
  private pageMat: THREE.MeshStandardMaterial;
  private coverInMat: THREE.MeshStandardMaterial;
  private coverMat: THREE.MeshStandardMaterial;
  private covers = new Map<string, THREE.Texture>();
  private pages = new Map<string, THREE.Texture>();
  private photo: HTMLImageElement | null = null;
  private stampNow: string;
  private pageReady = false;
  slot = new THREE.Vector3();
  quatOmega = 9;

  constructor(public readonly rec: ArchiveRecord, public readonly index: number, tabSlot: number) {
    const { w, h, t, gap, tabW, tabH } = FOLDER;
    const seed = hash(rec.file);
    const plainIn = new THREE.MeshStandardMaterial({ map: plainTexture(MANILA, seed % 5), roughness: 0.92 });
    const coverMat = new THREE.MeshStandardMaterial({ map: coverTexture(rec, seed), roughness: 0.9 });
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

    const clip = new THREE.Mesh(clipGeometry, clipMat);
    clip.position.set(-w * 0.31, h * 0.94, 0.012);
    clip.rotation.z = 0.04;
    clip.castShadow = true;

    // Hinged cover
    this.coverInMat = new THREE.MeshStandardMaterial({ map: plainIn.map, roughness: 0.92 });
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

  /** Re-stamp the cover and inner page for an earlier draft (cached per classification). */
  setStamp(stamp: string) {
    if (stamp === this.stampNow) return;
    this.stampNow = stamp;
    let tex = this.covers.get(stamp);
    if (!tex) {
      tex = coverTexture(this.rec, hash(this.rec.file), stamp);
      this.covers.set(stamp, tex);
    }
    this.coverMat.map = tex;
    this.coverMat.needsUpdate = true;
    if (this.pageReady && this.pageMat.map) {
      this.pageMat.map = this.pageFor(stamp);
      this.pageMat.needsUpdate = true;
    }
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
    // cover swings open toward the viewer around its left edge
    this.coverPivot.rotation.y = -this.open.update(dt) * 2.72;
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
