/**
 * Case envelope for event records: a standing kraft envelope with gussets,
 * a red printed case form on the front and a brass clasp under the flap.
 * Its thickness follows what is inside (report, earlier drafts, photograph,
 * attachments), all read from the record. Opening it folds the clasp prongs
 * together, lifts the flap back over the mouth and draws the papers up one
 * after another, fanned so each one's top shows.
 *
 * Origin at the bottom-centre, +Z is the front, like a Folder.
 */
import * as THREE from 'three';
import type { ArchiveRecord } from '../types';
import { caseFlapTexture, caseItems, caseItemTexture, CASE_KRAFT, hash, plainTexture, type CaseItem, type CaseItemKind } from './textures';

export const CASE = { w: 2.9, h: 1.96, flap: 0.46 };

const smooth = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const box = new THREE.BoxGeometry(1, 1, 1);
const brass = new THREE.MeshStandardMaterial({ color: '#b8904a', metalness: 0.85, roughness: 0.32 });
const itemEdge = new THREE.MeshStandardMaterial({ color: '#d9d1bd', roughness: 0.95 });

/** Paper sizes by kind, as fractions of the envelope. */
const SIZE: Record<CaseItemKind, [number, number]> = {
  report: [0.93, 0.96],
  draft: [0.9, 0.94],
  photo: [0.4, 0.42],
  note: [0.32, 0.46],
  telegram: [0.56, 0.46],
  ticket: [0.27, 0.2],
  clipping: [0.36, 0.66],
  negative: [0.62, 0.16],
};

interface Paper {
  mesh: THREE.Mesh;
  item: CaseItem;
  rank: number;
  x: number;
  z: number;
  y0: number;
  rise: number;
  spin: number;
}

export class CaseBag {
  readonly hit: THREE.Object3D[] = [];
  private flapA = new THREE.Group();
  private flapB = new THREE.Group();
  private prongs: THREE.Group[] = [];
  private papers: Paper[] = [];
  /** The papers lean together, pivoting on the envelope's floor, so none passes through another. */
  private stack = new THREE.Group();
  private flapMat: THREE.MeshStandardMaterial;
  private front: THREE.Mesh;
  readonly depth: number;

  constructor(private group: THREE.Group, private rec: ArchiveRecord, frontMat: THREE.MeshStandardMaterial) {
    const { w, h, flap } = CASE;
    const seed = hash(rec.file);
    const items = caseItems(rec);
    const d = (this.depth = Math.min(0.13, 0.05 + items.length * 0.011));
    const bulge = d * 0.28;

    const kraft = new THREE.MeshStandardMaterial({ map: plainTexture(CASE_KRAFT, seed % 5), roughness: 0.93 });
    const kraftDark = new THREE.MeshStandardMaterial({ map: plainTexture('#a8834f', seed % 5), roughness: 0.95 });

    // back
    const back = new THREE.Mesh(box, kraft);
    back.scale.set(w, h, 0.006);
    back.position.set(0, h / 2, -d / 2);
    // front, bowed by what is inside
    const fg = new THREE.PlaneGeometry(w, h, 28, 18);
    const fp = fg.attributes.position as THREE.BufferAttribute;
    // flat under the flap, where the clasp sits, full in the middle
    const bow = (x: number, y: number) => bulge * Math.sin(Math.PI * (x / w + 0.5)) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, y / (h - flap * 1.15)))), 0.6);
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), y = fp.getY(i) + h / 2;
      fp.setXYZ(i, x, y, d / 2 + bow(x, y));
    }
    fg.computeVertexNormals();
    this.front = new THREE.Mesh(fg, frontMat);
    // gussets, pleated inward at the middle
    const gussets = [-1, 1].map((sx) => {
      const gs = new THREE.BufferGeometry();
      const pts: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j <= 1; j++) {
        const y = j * h;
        pts.push(sx * w / 2, y, -d / 2, sx * (w / 2 - d * 0.35), y, 0, sx * w / 2, y, d / 2);
      }
      idx.push(0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5);
      gs.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      gs.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 1, 0, 0, 1, 0.5, 1, 1, 1], 2));
      gs.setIndex(idx);
      gs.computeVertexNormals();
      const m = new THREE.Mesh(gs, new THREE.MeshStandardMaterial({ map: kraftDark.map, roughness: 0.95, side: THREE.DoubleSide }));
      return m;
    });
    const bottom = new THREE.Mesh(box, kraftDark);
    bottom.scale.set(w, 0.008, d);
    bottom.position.set(0, 0.004, 0);

    // flap: a strip over the mouth (A), then the part hanging over the front (B)
    this.flapA.position.set(0, h, -d / 2);
    const top = new THREE.Mesh(box, kraftDark);
    top.scale.set(w * 0.996, d + 0.004, 0.004);
    top.position.set(0, (d + 0.004) / 2, 0);
    this.flapA.add(top);
    this.flapB.position.set(0, d + 0.004, 0);
    this.flapA.add(this.flapB);

    const fw = (w * 0.996) / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-fw, 0);
    shape.lineTo(fw, 0);
    shape.lineTo(fw, flap * 0.55);
    shape.lineTo(fw * 0.82, flap);
    shape.lineTo(-fw * 0.82, flap);
    shape.lineTo(-fw, flap * 0.55);
    shape.lineTo(-fw, 0);
    const hole = new THREE.Path();
    hole.absarc(0, flap - 0.1, 0.022, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const outerGeo = new THREE.ShapeGeometry(shape, 8);
    outerGeo.rotateY(Math.PI);
    const op = outerGeo.attributes.position as THREE.BufferAttribute;
    const ouv = outerGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < op.count; i++) ouv.setXY(i, (op.getX(i) + fw) / (fw * 2), 1 - op.getY(i) / flap);
    this.flapMat = new THREE.MeshStandardMaterial({ map: caseFlapTexture(rec, seed), roughness: 0.92 });
    const outer = new THREE.Mesh(outerGeo, this.flapMat);
    outer.position.z = -0.0035;
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), kraft);
    this.flapB.add(outer, inner);

    // clasp: a brass diamond on the body, two prongs through the flap's hole
    const claspY = h - flap + 0.1;
    const claspZ = d / 2 + bow(0, claspY);
    const washer = new THREE.Mesh(box, brass);
    washer.scale.set(0.15, 0.15, 0.004);
    washer.rotation.z = Math.PI / 4;
    washer.position.set(0, claspY, claspZ + 0.002);
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12).rotateX(Math.PI / 2), brass);
    root.position.set(0, claspY, claspZ + 0.008);
    for (const sx of [-1, 1]) {
      const p = new THREE.Group();
      p.position.set(0, claspY, claspZ + 0.024);
      const blade = new THREE.Mesh(box, brass);
      blade.scale.set(0.15, 0.034, 0.005);
      blade.position.x = sx * 0.085;
      p.add(blade);
      p.userData.sx = sx;
      this.prongs.push(p);
    }

    // the papers, front to back: attachments, photograph, drafts, the report last and tallest
    const order = [...items].reverse();
    const r = mulberry(seed);
    const small = order.filter((it) => SIZE[it.kind][0] < 0.7);
    order.forEach((item, rank) => {
      const [sw, sh] = SIZE[item.kind];
      const pw = sw * w, ph = sh * h;
      const tex = caseItemTexture(item, pw / ph, seed + rank * 31);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
      const mesh = new THREE.Mesh(box, [itemEdge, itemEdge, itemEdge, itemEdge, mat, itemEdge]);
      mesh.scale.set(pw, ph, 0.003);
      mesh.castShadow = mesh.receiveShadow = true;
      const n = order.length;
      const z = -d / 2 + 0.012 + ((d - 0.024) * (n - 1 - rank)) / Math.max(1, n - 1);
      // small papers spread across the mouth so none hides another
      const si = small.indexOf(item);
      const lim = (w - pw) / 2 - 0.05;
      const x = si < 0 ? (r() - 0.5) * lim : Math.max(-lim, Math.min(lim, -w / 2 + (w * (si + 0.5)) / small.length + (r() - 0.5) * 0.1));
      // fanned: every paper shows a strip above the one in front of it
      const topOut = h + 0.17 + rank * (0.5 / Math.max(1, n - 1)) + (item.kind === 'report' ? 0.16 : 0);
      const paper: Paper = { mesh, item, rank, x, z, y0: 0.012 + ph / 2, rise: Math.max(0, topOut - ph - 0.012), spin: (r() - 0.5) * 0.07 };
      this.papers.push(paper);
      this.stack.add(mesh);
    });
    group.add(this.stack);

    for (const m of [back, this.front, ...gussets, bottom, top, outer, inner, washer, root]) {
      m.castShadow = m.receiveShadow = true;
    }
    for (const p of this.prongs) p.children[0].castShadow = true;
    group.add(back, this.front, ...gussets, bottom, this.flapA, washer, root, ...this.prongs);
    this.hit.push(back, this.front, top, outer);
    this.update(0);
  }

  /** Redraw the flap label and the papers (language switch). */
  relabel() {
    const seed = hash(this.rec.file);
    this.flapMat.map?.dispose();
    this.flapMat.map = caseFlapTexture(this.rec, seed);
    this.flapMat.needsUpdate = true;
    const items = [...caseItems(this.rec)].reverse();
    this.papers.forEach((p, i) => {
      const it = items[i];
      if (!it) return;
      const mat = (p.mesh.material as THREE.MeshStandardMaterial[])[4];
      mat.map?.dispose();
      mat.map = caseItemTexture(it, p.mesh.scale.x / p.mesh.scale.y, seed + i * 31);
      mat.needsUpdate = true;
    });
  }

  /** `u` 0 closed → 1 clasp open, flap back, papers drawn up and fanned. */
  update(u: number) {
    const prong = smooth(0, 0.2, u);
    const lift = smooth(0.14, 0.5, u);
    for (const p of this.prongs) p.rotation.y = -p.userData.sx * prong * Math.PI * 0.5;
    this.flapA.rotation.x = Math.PI / 2 - lift * (Math.PI / 2 + 0.42);
    // closed it hangs a touch off the body, so its edge throws a shadow
    this.flapB.rotation.x = (Math.PI / 2 - 0.025) * (1 - lift) - lift * 0.18;
    const n = this.papers.length;
    for (const p of this.papers) {
      // drawn front first, one after another
      const a = 0.42 + ((n - 1 - p.rank) * 0.4) / Math.max(1, n);
      const k = smooth(a, a + 0.3, u);
      p.mesh.position.set(p.x, p.y0 + p.rise * k, p.z);
      p.mesh.rotation.set(0, 0, k * p.spin);
    }
    this.stack.rotation.x = 0;
  }
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
