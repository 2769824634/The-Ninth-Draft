/**
 * The link room: every record pinned to a cork board, joined by red string
 * wherever one file names another in `related`. Strings are simulated rope
 * (verlet), so they sag and swing when a card is dragged.
 * Over it sits the tactical layer: a stencilled map grid, a sweep that
 * pings each card it passes, and lock-on brackets around the focused file.
 */
import * as THREE from 'three';
import type { ArchiveData, ArchiveRecord } from '../types';
import { Spring, SpringV3, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { t } from '../i18n';
import { boardTexture, CARD, cardTexture, gridTexture, hash, loadPhoto, setMaxAnisotropy, sweepTexture } from './textures';

const KEY = 'n9:wall';
const CARD_Z = 0.03;
const LIFT = 0.42;
const SEGMENTS = 16;
const STRING_W = 0.024;
const PIN_Y = CARD.h / 2 - 0.12;
/** Map grid cell, in board units. */
const CELL = 2;
const SWEEP_W = 3.2;
const SWEEP_S = 6.5;
const SWEEP_REST = 4;

export interface WallEvents {
  focus(rec: ArchiveRecord | null, linked: ArchiveRecord[]): void;
  pick(rec: ArchiveRecord): void;
  lift(): void;
  moved(): void;
  /** A sweep finished: how many cards it touched, and which sweep this was. */
  swept(contacts: number, n: number): void;
  /** Board coordinates under the pointer, or null when off the board. */
  readout(text: string | null): void;
}

interface Card {
  rec: ArchiveRecord;
  group: THREE.Group;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  pin: THREE.Group;
  pos: SpringV3;
  home: THREE.Vector2;
  tilt: number;
  lift: Spring;
  dim: Spring;
  links: Link[];
  ping: number;
  /** What the card texture is drawn from, kept so it can be redrawn (language switch). */
  label: string;
  nLinks: number;
  photo: HTMLImageElement | null;
}

interface Link {
  a: Card;
  b: Card;
  pts: THREE.Vector3[];
  prev: THREE.Vector3[];
  rest: number;
  mesh: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  dim: Spring;
}

interface Look {
  bg: THREE.Color;
  hemi: number;
  sun: number;
  lamp: number;
  shadow: number;
}

const LOOKS: Record<'day' | 'night', Look> = {
  day: { bg: new THREE.Color('#e4e3de'), hemi: 1.45, sun: 2.1, lamp: 0, shadow: 0.5 },
  night: { bg: new THREE.Color('#0c0d0f'), hemi: 0.1, sun: 0.12, lamp: 90, shadow: 0.8 },
};

const pinHead = new THREE.SphereGeometry(0.075, 18, 12);
const pinNeedle = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6);
const pinMat = new THREE.MeshStandardMaterial({ color: '#c4321f', roughness: 0.35, metalness: 0.05 });
const needleMat = new THREE.MeshStandardMaterial({ color: '#a7abb0', roughness: 0.3, metalness: 0.9 });

export class Wall {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.5, 120);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x8a8172, 1.4);
  private sun = new THREE.DirectionalLight(0xfff4e2, 2);
  private lamp = new THREE.SpotLight(0xffd29a, 0, 30, 0.5, 0.9, 1.4);
  private board!: THREE.Mesh;
  private size = new THREE.Vector2(16, 10);

  private cards: Card[] = [];
  private byFile = new Map<string, Card>();
  private links: Link[] = [];
  private focused: Card | null = null;
  private hovered: Card | null = null;

  private look: Look = { ...LOOKS.day, bg: LOOKS.day.bg.clone() };
  private lookTarget = LOOKS.day;
  private pan = new SpringV3(new THREE.Vector3(), 4);
  private zoom = new Spring(1, 5);
  private fitDist = 20;
  private pointer = new THREE.Vector2(9, 9);
  private parallax = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(CARD_Z + LIFT));
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { card: Card | null; off: THREE.Vector2; moved: number; x: number; y: number; pinch: number; touch: boolean } | null = null;
  private dragged = new Set<string>();

  private sweep!: THREE.Mesh;
  private sweepTex!: THREE.Texture;
  private sweepT = 0;
  private sweepX = -Infinity;
  private sweeps = 0;
  private contacts = 0;
  private reticle!: THREE.LineSegments;
  private retMat = new THREE.LineBasicMaterial({ color: '#f0e4c4', transparent: true, opacity: 0, depthWrite: false });
  private retScale = new Spring(1, 9);
  private retOn = new Spring(0, 10);
  private readAt = 0;
  private overCanvas = false;
  private lastRead: string | null = '';

  private raf = 0;
  private running = false;
  private last = 0;
  private reduce = reducedMotion();

  constructor(private canvas: HTMLCanvasElement, private data: ArchiveData, private on: WallEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 5;
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0008;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.lamp, this.lamp.target);

    this.build();
    this.bind();
    this.resize();
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */
  private build() {
    const { records, categories } = this.data;
    const layout = this.layout(records);

    // Board sized to the cards, with a margin
    const xs = [...layout.values()].map((v) => v.x), ys = [...layout.values()].map((v) => v.y);
    const minX = Math.min(...xs) - CARD.w / 2 - 1.2, maxX = Math.max(...xs) + CARD.w / 2 + 1.2;
    const minY = Math.min(...ys) - CARD.h / 2 - 1.1, maxY = Math.max(...ys) + CARD.h / 2 + 1.2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    this.size.set(Math.max(12, maxX - minX), Math.max(8, maxY - minY));
    for (const v of layout.values()) v.sub(new THREE.Vector2(cx, cy));

    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture(this.size.x, this.size.y), roughness: 0.96 });
    this.board = new THREE.Mesh(new THREE.BoxGeometry(this.size.x, this.size.y, 0.12), boardMat);
    this.board.position.z = -0.06;
    this.board.receiveShadow = true;
    this.scene.add(this.board);
    // Steel frame
    const frameMat = new THREE.MeshStandardMaterial({ color: '#6f7174', metalness: 0.55, roughness: 0.42 });
    const fw = 0.16, fd = 0.22;
    const bar = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, fd), frameMat);
      m.position.set(x, y, -0.02);
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    };
    bar(this.size.x + fw * 2, fw, 0, this.size.y / 2 + fw / 2);
    bar(this.size.x + fw * 2, fw, 0, -this.size.y / 2 - fw / 2);
    bar(fw, this.size.y, -this.size.x / 2 - fw / 2, 0);
    bar(fw, this.size.y, this.size.x / 2 + fw / 2, 0);

    // Grid stencil and sweep band, just above the cork
    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size.x, this.size.y),
      new THREE.MeshBasicMaterial({ map: gridTexture(this.size.x, this.size.y, CELL), transparent: true, depthWrite: false }),
    );
    grid.position.z = 0.002;
    this.scene.add(grid);
    this.sweepTex = sweepTexture();
    this.sweepTex.repeat.x = this.size.x / SWEEP_W;
    this.sweep = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size.x, this.size.y),
      new THREE.MeshBasicMaterial({ map: this.sweepTex, color: '#f3dfa8', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.sweep.position.z = 0.004;
    this.scene.add(this.sweep);
    this.reticle = this.makeReticle();
    this.scene.add(this.reticle);

    const linkCount = new Map<string, Set<string>>();
    for (const r of records) {
      for (const f of r.related) {
        if (f === r.file || !layout.has(f)) continue;
        (linkCount.get(r.file) ?? linkCount.set(r.file, new Set()).get(r.file)!).add(f);
        (linkCount.get(f) ?? linkCount.set(f, new Set()).get(f)!).add(r.file);
      }
    }
    const saved = this.saved();
    const geo = new THREE.BoxGeometry(CARD.w, CARD.h, 0.012);
    const edge = new THREE.MeshStandardMaterial({ color: '#d9d2bf', roughness: 0.95 });
    for (const rec of records) {
      const label = categories.find((c) => c.id === rec.category)?.label ?? '';
      const nLinks = linkCount.get(rec.file)?.size ?? 0;
      const mat = new THREE.MeshStandardMaterial({ map: cardTexture(rec, label, null, nLinks), roughness: 0.88, emissive: '#ffe2a0', emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(geo, [edge, edge, edge, edge, mat, edge]);
      mesh.castShadow = mesh.receiveShadow = true;
      const pin = new THREE.Group();
      const head = new THREE.Mesh(pinHead, pinMat);
      head.position.z = 0.12;
      head.castShadow = true;
      const needle = new THREE.Mesh(pinNeedle, needleMat);
      needle.rotation.x = Math.PI / 2;
      needle.position.z = 0.04;
      pin.add(head, needle);
      pin.position.set(0, PIN_Y, 0.01);
      const group = new THREE.Group();
      group.add(mesh, pin);
      const home = layout.get(rec.file)!.clone();
      const at = saved[rec.file] ? new THREE.Vector2(...saved[rec.file]) : home.clone();
      this.clampToBoard(at);
      const card: Card = {
        rec, group, mesh, mat, pin, home,
        pos: new SpringV3(new THREE.Vector3(at.x, at.y, CARD_Z), 9),
        tilt: (((hash(rec.file) % 1000) / 1000) - 0.5) * 0.12,
        lift: new Spring(0, 10),
        dim: new Spring(0, 7),
        links: [],
        ping: 0,
        label,
        nLinks,
        photo: null,
      };
      mesh.userData.card = card;
      // Real photographs arrive later; repaint the card once they do
      if (rec.image) {
        void loadPhoto(rec.image).then((img) => {
          if (!img) return;
          card.photo = img;
          mat.map?.dispose();
          mat.map = cardTexture(rec, label, img, nLinks);
          mat.needsUpdate = true;
        });
      }
      this.scene.add(group);
      this.cards.push(card);
      this.byFile.set(rec.file, card);
    }

    // One string per pair, however many sides name it
    const seen = new Set<string>();
    for (const a of this.cards) {
      for (const f of a.rec.related) {
        const b = this.byFile.get(f);
        if (!b || b === a) continue;
        const key = [a.rec.file, b.rec.file].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        this.links.push(this.makeLink(a, b));
      }
    }
    this.cards.forEach((c) => this.place(c));
    this.links.forEach((l) => this.settle(l));
  }

  private makeLink(a: Card, b: Card): Link {
    const pa = this.pinOf(a), pb = this.pinOf(b);
    const pts = Array.from({ length: SEGMENTS + 1 }, (_, i) => pa.clone().lerp(pb, i / SEGMENTS));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3).map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
    const idx: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: '#b3261b', roughness: 0.7, transparent: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const link: Link = { a, b, pts, prev: pts.map((p) => p.clone()), rest: 0, mesh, mat, dim: new Spring(0, 7) };
    a.links.push(link);
    b.links.push(link);
    return link;
  }

  /** Lock-on brackets: four corners, drawn around whichever card is focused. */
  private makeReticle() {
    const w = CARD.w / 2 + 0.16, h = CARD.h / 2 + 0.16, k = 0.26;
    const v: number[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const x = sx * w, y = sy * h;
      v.push(x, y, 0, x - sx * k, y, 0, x, y, 0, x, y - sy * k, 0);
    }
    // centre ticks on the long edges
    v.push(0, h + 0.06, 0, 0, h - 0.06, 0, 0, -h + 0.06, 0, 0, -h - 0.06, 0);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const r = new THREE.LineSegments(geo, this.retMat);
    r.renderOrder = 2;
    r.visible = false;
    return r;
  }

  /** Map reference ("C-04") for a point on the board. */
  private ref(x: number, y: number) {
    const col = Math.floor((x + this.size.x / 2) / CELL);
    const row = Math.floor((this.size.y / 2 - y) / CELL) + 1;
    return `${String.fromCharCode(65 + (Math.max(0, col) % 26))}-${String(Math.max(1, row)).padStart(2, '0')}`;
  }

  /** Map reference of a card where it is pinned now. */
  gridRef(file: string) {
    const c = this.byFile.get(file);
    return c ? this.ref(c.pos.x.target, c.pos.y.target) : '';
  }

  /**
   * Deterministic force layout: linked files pull together, everything
   * repels, and each category leans toward its own column.
   */
  private layout(records: ArchiveRecord[]) {
    const cats = this.data.categories.map((c) => c.id as string);
    const pos = new Map<string, THREE.Vector2>();
    const vel = new Map<string, THREE.Vector2>();
    const colX = (r: ArchiveRecord) => (cats.indexOf(r.category) - (cats.length - 1) / 2) * 7;
    records.forEach((r, i) => {
      const h = hash(r.file);
      const inCat = records.filter((x) => x.category === r.category).indexOf(r);
      pos.set(r.file, new THREE.Vector2(colX(r) + ((h % 100) / 100 - 0.5) * 1.6, -inCat * 2.1 + (((h >> 8) % 100) / 100 - 0.5) * 0.8 + i * 0.001));
      vel.set(r.file, new THREE.Vector2());
    });
    const edges: [string, string][] = [];
    for (const r of records) for (const f of r.related) if (pos.has(f)) edges.push([r.file, f]);
    const d = new THREE.Vector2();
    for (let it = 0; it < 420; it++) {
      const cool = 1 - it / 420;
      for (const a of records) {
        const pa = pos.get(a.file)!, va = vel.get(a.file)!;
        for (const b of records) {
          if (a === b) continue;
          d.copy(pa).sub(pos.get(b.file)!);
          // Cards are wider than tall: measure distance in card-shaped space
          const ex = d.x / (CARD.w * 1.25), ey = d.y / (CARD.h * 1.45);
          const dist2 = Math.max(0.05, ex * ex + ey * ey);
          va.addScaledVector(d.normalize(), 0.09 / dist2);
        }
        va.x += (colX(a) - pa.x) * 0.004;
        // Squash toward a landscape board: gravity is stronger vertically
        va.x -= pa.x * 0.002;
        va.y -= pa.y * 0.014;
      }
      for (const [fa, fb] of edges) {
        const pa = pos.get(fa)!, pb = pos.get(fb)!;
        d.copy(pb).sub(pa);
        const f = (d.length() - 3.6) * 0.01;
        d.normalize().multiplyScalar(f);
        vel.get(fa)!.add(d);
        vel.get(fb)!.sub(d);
      }
      for (const r of records) {
        const v = vel.get(r.file)!;
        v.multiplyScalar(0.82);
        pos.get(r.file)!.addScaledVector(v, cool);
      }
    }
    return pos;
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  start() {
    if (this.running) return;
    this.running = true;
    this.reduce = reducedMotion();
    this.last = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (!document.hidden) this.frame();
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setTheme(theme: 'day' | 'night') {
    this.lookTarget = LOOKS[theme];
  }

  /** Redraw every card from its record (the record's texts changed language). */
  relabel() {
    for (const c of this.cards) {
      c.mat.map?.dispose();
      c.mat.map = cardTexture(c.rec, c.label, c.photo, c.nLinks);
      c.mat.needsUpdate = true;
    }
  }

  /** Isolate one file's links (null clears). `center` glides the view to it. */
  focus(file: string | null, center = false) {
    const card = file ? this.byFile.get(file) ?? null : null;
    this.setFocus(card);
    if (card && center) {
      const p = card.pos.value;
      this.pan.setTarget(new THREE.Vector3(p.x, p.y, 0));
      this.zoom.target = Math.min(this.zoom.target, 0.85);
    }
  }

  get focusedFile() {
    return this.focused?.rec.file ?? null;
  }

  /** Step focus through the cards in reading order (keyboard). */
  cycle(step: number) {
    const list = [...this.cards].sort((a, b) => b.pos.value.y - a.pos.value.y || a.pos.value.x - b.pos.value.x);
    const i = this.focused ? list.indexOf(this.focused) : -1;
    const next = list[(i + step + list.length) % list.length];
    this.focus(next.rec.file);
  }

  resetLayout() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    for (const c of this.cards) c.pos.setTarget(new THREE.Vector3(c.home.x, c.home.y, CARD_Z));
    this.pan.setTarget(new THREE.Vector3());
    this.zoom.target = 1;
    this.dragged.clear();
  }

  get counts() {
    return { records: this.cards.length, links: this.links.length };
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */
  private setFocus(card: Card | null) {
    if (card === this.focused) return;
    this.focused = card;
    if (card) {
      this.retScale.set(this.reduce ? 1 : 1.35);
      this.retScale.target = 1;
    }
    this.retOn.target = card ? 1 : 0;
    const hot = new Set<Card>();
    if (card) {
      hot.add(card);
      for (const l of card.links) hot.add(l.a === card ? l.b : l.a);
    }
    for (const c of this.cards) c.dim.target = card && !hot.has(c) ? 1 : 0;
    for (const l of this.links) l.dim.target = card && l.a !== card && l.b !== card ? 1 : 0;
    this.on.focus(card?.rec ?? null, card ? [...hot].filter((c) => c !== card).map((c) => c.rec) : []);
  }

  private pinOf(c: Card, out = new THREE.Vector3()) {
    const p = c.pos.value;
    const lift = c.lift.value * LIFT;
    const s = Math.sin(c.tilt), co = Math.cos(c.tilt);
    return out.set(p.x - s * PIN_Y, p.y + co * PIN_Y, p.z + lift + 0.13);
  }

  private place(c: Card) {
    const p = c.pos.value;
    const lift = c.lift.value;
    c.group.position.set(p.x, p.y, p.z + lift * LIFT);
    c.group.rotation.set(0, 0, c.tilt * (1 - lift * 0.6));
    c.group.scale.setScalar(1 + lift * 0.05);
  }

  /** Start a string already hanging, so nothing jumps on first sight. */
  private settle(l: Link) {
    const pa = this.pinOf(l.a), pb = this.pinOf(l.b);
    l.rest = (pa.distanceTo(pb) * 1.035) / SEGMENTS;
    for (let it = 0; it < 240; it++) this.simulate(l, 1 / 60, true);
    l.prev.forEach((p, i) => p.copy(l.pts[i]));
    this.writeRibbon(l);
  }

  private simulate(l: Link, dt: number, settling = false) {
    const { pts, prev } = l;
    const n = pts.length - 1;
    const pa = this.pinOf(l.a), pb = this.pinOf(l.b);
    // Taut strings when cards move apart, a little slack otherwise
    l.rest = (pa.distanceTo(pb) * 1.035) / SEGMENTS;
    const g = -9.8 * dt * dt;
    const keep = settling || this.reduce ? 0.6 : 0.985;
    const tmp = new THREE.Vector3();
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      tmp.copy(p);
      p.x += (p.x - prev[i].x) * keep;
      p.y += (p.y - prev[i].y) * keep + g;
      p.z += (p.z - prev[i].z) * keep;
      prev[i].copy(tmp);
    }
    pts[0].copy(pa);
    pts[n].copy(pb);
    for (let k = 0; k < 14; k++) {
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[i + 1];
        tmp.copy(q).sub(p);
        const len = tmp.length() || 1e-6;
        const diff = (len - l.rest) / len;
        if (i > 0 && i + 1 < n) {
          p.addScaledVector(tmp, diff * 0.5);
          q.addScaledVector(tmp, -diff * 0.5);
        } else if (i === 0) q.addScaledVector(tmp, -diff);
        else p.addScaledVector(tmp, diff);
      }
      // the string lies over the board, never through it
      for (let i = 1; i < n; i++) pts[i].z = Math.max(pts[i].z, CARD_Z + 0.03);
    }
  }

  private writeRibbon(l: Link) {
    const pos = l.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const d = new THREE.Vector2();
    for (let i = 0; i < l.pts.length; i++) {
      const a = l.pts[Math.max(0, i - 1)], b = l.pts[Math.min(l.pts.length - 1, i + 1)];
      d.set(b.x - a.x, b.y - a.y).normalize();
      const nx = -d.y * STRING_W * 0.5, ny = d.x * STRING_W * 0.5;
      const p = l.pts[i];
      arr.set([p.x + nx, p.y + ny, p.z, p.x - nx, p.y - ny, p.z], i * 6);
    }
    pos.needsUpdate = true;
  }

  private saved(): Record<string, [number, number]> {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch {
      return {};
    }
  }

  private save() {
    const out: Record<string, [number, number]> = {};
    for (const c of this.cards) out[c.rec.file] = [+c.pos.x.target.toFixed(3), +c.pos.y.target.toFixed(3)];
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* ignore */ }
  }

  private clampToBoard<V extends THREE.Vector2 | THREE.Vector3>(v: V): V {
    const hx = this.size.x / 2 - CARD.w / 2 - 0.15, hy = this.size.y / 2 - CARD.h / 2 - 0.15;
    v.x = THREE.MathUtils.clamp(v.x, -hx, hx);
    v.y = THREE.MathUtils.clamp(v.y, -hy, hy);
    return v;
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */
  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    const k = damp(2.4, dt);
    const L = this.look, T = this.lookTarget;
    L.bg.lerp(T.bg, k);
    L.hemi += (T.hemi - L.hemi) * k;
    L.sun += (T.sun - L.sun) * k;
    L.lamp += (T.lamp - L.lamp) * k;
    L.shadow += (T.shadow - L.shadow) * k;
    this.hemi.intensity = L.hemi;
    this.sun.intensity = L.sun;
    this.lamp.intensity = L.lamp;
    this.lamp.visible = L.lamp > 0.5;

    // Camera: straight at the board with a slight raking angle
    const pan = this.pan.update(dt);
    const z = this.zoom.update(dt) * this.fitDist;
    this.parallax.lerp(this.drag ? this.parallax : this.pointer.clone().clampScalar(-1, 1), damp(2, dt));
    // Landscape: the board sits right of the HUD column
    const shift = this.camera.aspect < 1 ? 0 : 2 * z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect * 0.12;
    this.camera.position.set(pan.x - shift + 0.9 + this.parallax.x * 0.5, pan.y - 1.6 - this.parallax.y * 0.35, z);
    this.camera.lookAt(pan.x - shift, pan.y, 0);
    this.camera.updateMatrixWorld();

    this.sun.position.set(pan.x - 7, pan.y + 9, 14);
    this.sun.target.position.set(pan.x, pan.y, 0);
    const lampAt = this.focused?.pos.value ?? this.hovered?.pos.value ?? pan;
    this.lamp.position.lerp(new THREE.Vector3(lampAt.x + 1.5, lampAt.y + 3, 9), damp(3, dt));
    this.lamp.target.position.lerp(new THREE.Vector3(lampAt.x, lampAt.y, 0), damp(3, dt));

    this.tactical(dt, now);

    const dayInk = L.hemi > 0.7;
    for (const c of this.cards) {
      c.pos.update(dt);
      c.lift.update(dt);
      const dim = c.dim.update(dt);
      c.mat.color.setScalar(1 - dim * (dayInk ? 0.55 : 0.7));
      c.ping = Math.max(0, c.ping - dt * 1.3);
      c.mat.emissiveIntensity = c.ping * c.ping * (dayInk ? 0.12 : 0.14);
      this.place(c);
    }
    // brackets ride on the focused card, closing in when it is first picked
    const f = this.focused;
    const on = this.retOn.update(dt);
    const sc = this.retScale.update(dt);
    this.reticle.visible = on > 0.01;
    this.retMat.opacity = on * 0.85;
    if (f) {
      this.reticle.position.copy(f.group.position);
      this.reticle.position.z += 0.03;
      this.reticle.rotation.z = f.group.rotation.z;
      this.reticle.scale.setScalar(sc * f.group.scale.x);
    }
    for (const l of this.links) {
      this.simulate(l, dt);
      this.writeRibbon(l);
      const dim = l.dim.update(dt);
      l.mat.opacity = 1 - dim * 0.85;
      const hot = this.focused && !dim ? 1 : 0;
      l.mat.emissive.setRGB(0.25 * hot, 0.02 * hot, 0);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /** Sweep band across the board, pings, and the coordinate readout. */
  private tactical(dt: number, now: number) {
    const half = this.size.x / 2;
    if (this.reduce) {
      this.sweep.visible = false;
    } else {
      this.sweepT += dt;
      const span = this.size.x + SWEEP_W * 2;
      const run = Math.min(1, this.sweepT / SWEEP_S);
      const x = -half - SWEEP_W + run * span;
      this.sweep.visible = run < 1;
      this.sweepTex.offset.x = (SWEEP_W - half - x) / SWEEP_W;
      for (const c of this.cards) {
        const cx = c.pos.value.x;
        if (cx > this.sweepX && cx <= x) {
          c.ping = 1;
          this.contacts++;
        }
      }
      this.sweepX = x;
      if (this.sweepT >= SWEEP_S + SWEEP_REST) {
        this.sweeps++;
        this.on.swept(this.contacts, this.sweeps);
        this.sweepT = 0;
        this.sweepX = -Infinity;
        this.contacts = 0;
      }
    }
    if (now - this.readAt < 120) return;
    this.readAt = now;
    let text: string | null = null;
    if (this.overCanvas) {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const p = this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
      if (p && Math.abs(p.x) <= half && Math.abs(p.y) <= this.size.y / 2) {
        const n = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(2).padStart(5, '0')}`;
        text = `X ${n(p.x)} · Y ${n(p.y)} · ${t('Grid')} ${this.ref(p.x, p.y)}`;
      }
    }
    if (text !== this.lastRead) {
      this.lastRead = text;
      this.on.readout(text);
    }
  }

  /** Sweeps completed since the room was built. */
  get sweepCount() {
    return this.sweeps;
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  private ray(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    return this.raycaster;
  }

  private cardAt(x: number, y: number): Card | null {
    const hit = this.ray(x, y).intersectObjects(this.cards.map((c) => c.mesh), false)[0];
    return (hit?.object.userData.card as Card | undefined) ?? null;
  }

  private onPlane(x: number, y: number) {
    return this.ray(x, y).ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private bind() {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const c = this.canvas;

    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.overCanvas = true;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.drag;
      if (!d) {
        if (e.pointerType === 'mouse') this.hover(this.cardAt(e.clientX, e.clientY));
        return;
      }
      if (this.pointers.size === 2) {
        const [p, q] = [...this.pointers.values()];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (d.pinch) this.zoom.target = THREE.MathUtils.clamp(this.zoom.target * (d.pinch / dist), 0.45, 1.35);
        d.pinch = dist;
        d.moved += 10;
        return;
      }
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.moved += Math.abs(dx) + Math.abs(dy);
      d.x = e.clientX;
      d.y = e.clientY;
      if (d.card && d.moved > 6) {
        const p = this.onPlane(e.clientX, e.clientY);
        if (!p) return;
        if (!d.card.lift.target) {
          d.card.lift.target = 1;
          this.setFocus(d.card);
          this.on.lift();
          c.closest('.archive')?.classList.add('is-dragging');
        }
        const t = this.clampToBoard(new THREE.Vector3(p.x + d.off.x, p.y + d.off.y, CARD_Z));
        d.card.pos.setTarget(t);
      } else if (!d.card && d.moved > 6) {
        // Pan: move the board with the pointer
        const per = (2 * this.camera.position.z * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / r.height;
        const t = new THREE.Vector3(this.pan.x.target - dx * per, this.pan.y.target + dy * per, 0);
        t.x = THREE.MathUtils.clamp(t.x, -this.size.x / 2, this.size.x / 2);
        t.y = THREE.MathUtils.clamp(t.y, -this.size.y / 2, this.size.y / 2);
        this.pan.setTarget(t);
        c.closest('.archive')?.classList.add('is-dragging');
      }
    });

    c.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      c.setPointerCapture(e.pointerId);
      if (this.pointers.size > 1) {
        if (this.drag) {
          if (this.drag.card) this.drop(this.drag.card);
          this.drag.card = null;
        }
        return;
      }
      const card = this.cardAt(e.clientX, e.clientY);
      const off = new THREE.Vector2();
      if (card) {
        const p = this.onPlane(e.clientX, e.clientY);
        if (p) off.set(card.pos.value.x - p.x, card.pos.value.y - p.y);
      }
      this.drag = { card, off, moved: 0, x: e.clientX, y: e.clientY, pinch: 0, touch: e.pointerType !== 'mouse' };
    });

    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      const d = this.drag;
      if (!d || this.pointers.size) return;
      this.drag = null;
      c.closest('.archive')?.classList.remove('is-dragging');
      if (d.card && d.card.lift.target) {
        this.drop(d.card);
        return;
      }
      if (d.moved >= 6 || e.type === 'pointercancel') return;
      if (!d.card) {
        this.setFocus(null);
        return;
      }
      // Touch: first tap isolates the card, second opens it. Mouse: click opens.
      if (d.touch && this.focused !== d.card) this.setFocus(d.card);
      else this.on.pick(d.card.rec);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => {
      this.overCanvas = false;
      if (e.pointerType === 'mouse' && !this.drag) this.hover(null);
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom.target = THREE.MathUtils.clamp(this.zoom.target * Math.exp(e.deltaY * 0.0012), 0.45, 1.35);
    }, { passive: false });
  }

  private drop(card: Card) {
    card.lift.target = 0;
    this.dragged.add(card.rec.file);
    this.save();
    this.on.moved();
  }

  /** Files rearranged this visit (the ARCHIVIST notices a mess). */
  get rearranged() {
    return this.dragged.size;
  }

  private hover(card: Card | null) {
    if (card === this.hovered) return;
    this.hovered = card;
    this.canvas.closest('.archive')?.classList.toggle('is-hovering', !!card);
    if (!this.drag) this.setFocus(card);
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Fit the whole board, leaving room for the HUD around it
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = w / h < 1;
    const fitH = (this.size.y * 1.32) / (2 * tan);
    const fitW = (this.size.x * 1.06) / (2 * tan * this.camera.aspect * 0.72);
    // Portrait: fill about half the height and let the board run off the sides (drag to pan)
    this.fitDist = portrait ? (this.size.y * 1.9) / (2 * tan) : Math.max(fitH, fitW);
  }
}
