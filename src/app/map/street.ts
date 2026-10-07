/**
 * The street map of Gerimis: a 1999 street directory you can drag and zoom.
 *
 * Drawn on a canvas from public/map/base.json (the island) and detail.json
 * (close up: small roads, HDB blocks), both made by scripts/map/build.py from
 * OpenStreetMap and set back to 1999. Coordinates are the survey sheet's
 * (1000 × 560, src/data/gerimis/districts.ts). The closer you go the more the
 * sheet shows: towns, then district bounds and stations, then roads by name,
 * then the blocks one by one with their numbers.
 */
import { district, pageRef } from '../visitor/districts';
import { SHEET } from '../../data/gerimis/districts';
import { PAGE, PAGES } from '../../data/gerimis/sheet';
import { islandIso } from '../island';
import { reducedMotion } from '../prefs';

type Enc = number[];
interface Named { l: Enc; n?: string[] }
interface Base {
  q: number;
  land: Enc[][]; far: Enc[][]; water: Enc[][]; green: Enc[][]; golf: Enc[][]; cem: Enc[][]; ind: Enc[][]; blank: Enc[][];
  runway: Enc[]; cable: Enc[]; rivers: Named[];
  roads: Record<'mw' | 'tr' | 'pr' | 'se' | 'te', Named[]>;
  rail: Record<'ns' | 'ew' | 'bp' | 'ne' | 'ktm' | 'spur', Enc[]>;
  stations: { l: 'ns' | 'ew' | 'bp'; c: string; n: [string, string]; x: number; y: number }[];
  districts: { id: string; r: Enc[][]; lx: number; ly: number }[];
}
interface Detail {
  q: number;
  roads: Named[]; streams: Enc[];
  hdb: { r: Enc; b: string; s: string; y: number; c?: 1 }[];
  places: { d: string; i: number; x: number; y: number }[];
}

export interface StreetMapOptions {
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  base: string;
  /** Open on this district, picked (district pages). */
  focus?: string;
  home?: string | null;
  /** Records on file per district, for the pins. */
  pins?: () => Record<string, number>;
  zh: () => boolean;
  onPick?: (id: string | null) => void;
  /** What is under the pointer (or the centre): district and page reference. */
  onPoint?: (id: string | null, ref: string | null) => void;
}

/* ---------------- geometry ---------------- */
const dec = (a: Enc, q: number) => {
  const out = new Float32Array(a.length);
  let x = 0, y = 0;
  for (let i = 0; i < a.length; i += 2) {
    x += a[i]; y += a[i + 1];
    out[i] = x / q; out[i + 1] = y / q;
  }
  return out;
};

const TILE = 100;
interface Tile { path: Path2D; x0: number; y0: number; x1: number; y1: number }
/** A layer split into tiles so a close view only draws what is on screen. */
class Layer {
  tiles = new Map<number, Tile>();
  add(pts: Float32Array[], closed: boolean) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
    }
    if (x0 === Infinity) return;
    const k = Math.floor((y0 + y1) / 2 / TILE) * 64 + Math.floor((x0 + x1) / 2 / TILE);
    let t = this.tiles.get(k);
    if (!t) this.tiles.set(k, (t = { path: new Path2D(), x0, y0, x1, y1 }));
    t.x0 = Math.min(t.x0, x0); t.y0 = Math.min(t.y0, y0); t.x1 = Math.max(t.x1, x1); t.y1 = Math.max(t.y1, y1);
    for (const p of pts) {
      t.path.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) t.path.lineTo(p[i], p[i + 1]);
      if (closed) t.path.closePath();
    }
  }
  each(v: Box, fn: (p: Path2D) => void) {
    for (const t of this.tiles.values()) if (t.x1 >= v.x0 && t.x0 <= v.x1 && t.y1 >= v.y0 && t.y0 <= v.y1) fn(t.path);
  }
}
interface Box { x0: number; y0: number; x1: number; y1: number }

const polyLayer = (polys: Enc[][], q: number) => {
  const l = new Layer();
  for (const p of polys) l.add(p.map((r) => dec(r, q)), true);
  return l;
};
const lineLayer = (lines: Enc[], q: number) => {
  const l = new Layer();
  for (const a of lines) l.add([dec(a, q)], false);
  return l;
};

const inRing = (p: Float32Array, x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/* ---------------- colours ---------------- */
const parse = (c: string): [number, number, number] => {
  c = c.trim();
  if (c.startsWith('#')) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [m[0], m[1], m[2]];
};
const mix = (a: string, b: string, t: number) => {
  const x = parse(a), y = parse(b);
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(' ')})`;
};

interface Palette { [k: string]: string }
/**
 * Two inks on survey paper, the way the Office's sheets were printed: black
 * for the linework and screens of black for the fills, red for the main roads,
 * the North–South line, the old shore and anything the Office has on file.
 */
function palette(night: boolean): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim() || '#000';
  const bg = v('--bg'), ink = v('--ink'), accent = v('--accent');
  const paper = mix(bg, night ? '#000' : '#f6f1e2', night ? 0.25 : 0.55);
  const t = (k: number) => mix(paper, ink, k); // a screen of black
  const r = (k: number) => mix(paper, accent, k); // a screen of red
  return {
    bg, ink, accent, paper,
    sea: paper,
    ripple: t(night ? 0.3 : 0.32),
    far: t(0.16),
    land: paper,
    coast: t(0.9),
    water: t(0.07),
    waterLine: t(0.72),
    waterHatch: t(0.38),
    stipple: t(night ? 0.5 : 0.42),
    cem: t(0.4),
    ind: t(0.22),
    hdb: t(night ? 0.34 : 0.3),
    hdbLine: t(0.78),
    hatch: t(0.3),
    casing: t(0.88),
    mw: r(night ? 0.55 : 0.5),
    mwLine: r(0.8),
    tr: r(night ? 0.3 : 0.26),
    rd: paper,
    thin: t(0.5),
    ns: accent,
    ew: t(0.92),
    bp: t(0.7),
    ne: r(0.75),
    rail: t(0.9),
    bound: t(0.55),
    grid: t(0.14),
    page: t(0.32),
    label: t(0.92),
    label2: t(0.62),
    halo: paper,
  };
}

const pattern = (ctx: CanvasRenderingContext2D, size: number, draw: (g: CanvasRenderingContext2D) => void, h = size) => {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  draw(c.getContext('2d')!);
  return ctx.createPattern(c, 'repeat')!;
};

/* ---------------- print scales ---------------- */
// The sheet is printed at a few fixed scales, as a directory is: the island,
// the district, the page, the square and the block. The map settles on them.
const KM = 1000 / ((1 / 2150) * 111320); // sheet units in a kilometre
const RATIO = (s: number) => (100000 * 96) / 2.54 / (KM * s); // 1 : n on a 96 dpi screen
const PRINT = [100000, 50000, 20000, 10000, 5000].map((n) => (100000 * 96) / 2.54 / (KM * n));
/** How far a layer has come in, 0 to 1, a little above its threshold: nothing appears all at once. */
const ramp = (s: number, at: number) => Math.min(1, Math.max(0, Math.log(s / at) / 0.35));

/* ---------------- the map ---------------- */
const MIN_S = 0.3, MAX_S = 60;

export function streetMap(o: StreetMapOptions) {
  const { canvas, frame } = o;
  const ctx = canvas.getContext('2d')!;
  let W = 0, H = 0, dpr = 1;
  const view = { cx: 500, cy: 290, s: 1 };
  let base: Base | null = null, detail: Detail | null = null, loadingDetail = false;
  let L: Record<string, Layer> = {};
  let roadsNamed: { cls: string; pts: Float32Array; n: string[] }[] = [];
  let D: { id: string; rings: Float32Array[]; lx: number; ly: number; box: Box; path: Path2D }[] = [];
  let hdb: { pts: Float32Array; b: string; x: number; y: number; cell: number }[] = [];
  let picked: string | null = o.focus ?? null, hover: string | null = null;
  let P = palette(document.documentElement.dataset.theme === 'night');
  let pats: Record<string, CanvasPattern> = {};

  const makePatterns = () => {
    const line = (g: CanvasRenderingContext2D, c: string, w: number, seg: number[][]) => {
      g.strokeStyle = c; g.lineWidth = w; g.beginPath();
      for (const [x0, y0, x1, y1] of seg) { g.moveTo(x0, y0); g.lineTo(x1, y1); }
      g.stroke();
    };
    pats = {
      // parks: a stipple of black dots
      green: pattern(ctx, 5, (g) => { g.fillStyle = P.stipple; g.fillRect(0.5, 0.5, 1, 1); g.fillRect(3, 3, 1, 1); }),
      golf: pattern(ctx, 8, (g) => { g.fillStyle = P.stipple; g.fillRect(1, 1, 1, 1); g.fillRect(5, 5, 1, 1); }),
      // cemeteries: short ticks
      cem: pattern(ctx, 8, (g) => line(g, P.cem, 1, [[1, 2.5, 4, 2.5], [5, 6.5, 8, 6.5]])),
      // inland water: ruled lines
      water: pattern(ctx, 4, (g) => line(g, P.waterHatch, 0.8, [[0, 2, 4, 2]])),
      // industrial ground: a fine diagonal
      ind: pattern(ctx, 6, (g) => line(g, P.ind, 0.7, [[0, 6, 6, 0], [-3, 3, 3, -3], [3, 9, 9, 3]])),
      // ground the Office did not survey: a wide hatch
      blank: pattern(ctx, 9, (g) => line(g, P.hatch, 0.8, [[0, 9, 9, 0], [-4.5, 4.5, 4.5, -4.5], [4.5, 13.5, 13.5, 4.5]])),
      // the far shore, faint
      far: pattern(ctx, 4, (g) => { g.fillStyle = P.far; g.fillRect(0, 0, 0.9, 0.9); }),
      // HDB blocks close up: hatched like a plan
      hdb: pattern(ctx, 4, (g) => { g.fillStyle = P.hdb; g.fillRect(0, 0, 4, 4); line(g, P.hdbLine, 0.6, [[0, 4, 4, 0], [-2, 2, 2, -2], [2, 6, 6, 2]]); }),
    };
  };

  /* ----- sizing ----- */
  const fitIsland = () => Math.min(W / 1010, H / 560);
  const resize = () => {
    const r = frame.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    draw();
  };

  const vbox = (): Box => ({ x0: view.cx - W / 2 / view.s, x1: view.cx + W / 2 / view.s, y0: view.cy - H / 2 / view.s, y1: view.cy + H / 2 / view.s });
  const toScreen = (x: number, y: number): [number, number] => [(x - view.cx) * view.s + W / 2, (y - view.cy) * view.s + H / 2];
  const toSheet = (sx: number, sy: number): [number, number] => [(sx - W / 2) / view.s + view.cx, (sy - H / 2) / view.s + view.cy];

  /* ----- data ----- */
  const load = async () => {
    const res = await fetch(`${o.base}map/base.json`);
    base = (await res.json()) as Base;
    const q = base.q;
    L = {
      land: polyLayer(base.land, q), far: polyLayer(base.far, q), water: polyLayer(base.water, q), green: polyLayer(base.green, q),
      golf: polyLayer(base.golf, q), cem: polyLayer(base.cem, q), ind: polyLayer(base.ind, q), blank: polyLayer(base.blank, q),
      runway: lineLayer(base.runway, q), cable: lineLayer(base.cable, q), rivers: lineLayer(base.rivers.map((r) => r.l), q),
    };
    for (const k of ['mw', 'tr', 'pr', 'se', 'te'] as const) L[k] = lineLayer(base.roads[k].map((r) => r.l), q);
    for (const k of ['ns', 'ew', 'bp', 'ne', 'ktm', 'spur'] as const) L[`r_${k}`] = lineLayer(base.rail[k], q);
    roadsNamed = (['mw', 'tr', 'pr', 'se', 'te'] as const).flatMap((cls) => base!.roads[cls].filter((r) => r.n).map((r) => ({ cls, pts: dec(r.l, q), n: r.n! })));
    roadsNamed.push(...base.rivers.filter((r) => r.n).map((r) => ({ cls: 'river', pts: dec(r.l, q), n: r.n! })));
    D = base.districts.map((d) => {
      const rings = d.r.flatMap((p) => p.map((r) => dec(r, q)));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const path = new Path2D();
      for (const p of rings) {
        path.moveTo(p[0], p[1]);
        for (let i = 0; i < p.length; i += 2) {
          if (i) path.lineTo(p[i], p[i + 1]);
          x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
        }
        path.closePath();
      }
      return { id: d.id, rings, lx: d.lx, ly: d.ly, box: { x0, y0, x1, y1 }, path };
    });
    frame.classList.add('is-ready');
    if (o.focus) fit(o.focus, false);
    draw();
    point(null);
  };
  const loadDetail = async () => {
    if (detail || loadingDetail) return;
    loadingDetail = true;
    const d = (await (await fetch(`${o.base}map/detail.json`)).json()) as Detail;
    const q = d.q;
    L.rd = lineLayer(d.roads.map((r) => r.l), q);
    L.streams = lineLayer(d.streams, q);
    L.hdb = polyLayer(d.hdb.map((h) => [h.r]), q);
    roadsNamed.push(...d.roads.filter((r) => r.n).map((r) => ({ cls: 'rd', pts: dec(r.l, q), n: r.n! })));
    hdb = d.hdb.map((h) => {
      const pts = dec(h.r, q);
      let x = 0, y = 0;
      for (let i = 0; i < pts.length; i += 2) { x += pts[i]; y += pts[i + 1]; }
      x /= pts.length / 2; y /= pts.length / 2;
      return { pts, b: h.b, x, y, cell: Math.floor(y / TILE) * 64 + Math.floor(x / TILE) };
    });
    detail = d;
    draw();
  };

  const districtAt = (x: number, y: number) => {
    for (const d of D) {
      if (x < d.box.x0 || x > d.box.x1 || y < d.box.y0 || y > d.box.y1) continue;
      let n = 0;
      for (const r of d.rings) if (inRing(r, x, y)) n++;
      if (n % 2) return d.id;
    }
    return null;
  };

  /* ----- drawing ----- */
  let raf = 0;
  const draw = () => {
    if (!raf) raf = requestAnimationFrame(paint);
  };

  const bpOpen = () => islandIso() >= '1999-11-06';

  function paint() {
    raf = 0;
    if (!W) return;
    const s = view.s, v = vbox(), zh = o.zh();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.sea;
    ctx.fillRect(0, 0, W, H);
    if (!base) return;
    if (s > 2.5 && !detail) loadDetail();

    // the sheet, in sheet units
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.cx * s), dpr * (H / 2 - view.cy * s));
    const px = (n: number) => n / s; // screen pixels in sheet units
    const unscaled = new DOMMatrix().scale(1 / s);
    const fill = (l: Layer | undefined, style: string | CanvasPattern) => {
      if (!l) return;
      // patterns keep their printed size however close the view
      if (typeof style !== 'string') style.setTransform(unscaled);
      ctx.fillStyle = style;
      l.each(v, (p) => ctx.fill(p, 'evenodd'));
    };
    const stroke = (l: Layer | undefined, style: string, w: number, dash?: number[], cap: CanvasLineCap = 'round') => {
      if (!l) return;
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.setLineDash(dash ? dash.map(px) : []); ctx.lineCap = cap;
      l.each(v, (p) => ctx.stroke(p));
    };
    const fade = (a: number) => { ctx.globalAlpha = a; return a > 0; };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // water-lining: the coast echoed out to sea in thinning rules, as engravers did
    const rings = s < 1.2 ? 3 : 4, gap = s < 1.2 ? 5 : 7;
    for (let k = rings; k >= 1; k--) {
      const w = px(k * gap);
      ctx.globalAlpha = 0.15 + 0.55 * (1 - k / (rings + 1));
      stroke(L.land, P.ripple, w + px(0.7));
      ctx.globalAlpha = 1;
      stroke(L.land, P.sea, w - px(0.7));
    }
    // the far shore, a stipple with no detail
    fill(L.far, P.paper);
    fill(L.far, pats.far);
    stroke(L.far, P.thin, px(0.6));
    // the survey's data stops short of the far shores: let them fade into the paper
    {
      const [x0, y0, x1, y1] = [-118, -54, 1172, 742], f = 45, big = 4000;
      const edge = (gx0: number, gy0: number, gx1: number, gy1: number, rx: number, ry: number, rw: number, rh: number) => {
        const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        g.addColorStop(0, P.paper); g.addColorStop(1, P.paper.replace(')', ' / 0)'));
        ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
      };
      if (v.y0 < y0 + f) edge(0, y0, 0, y0 + f, v.x0, y0 - big, v.x1 - v.x0, big + f);
      if (v.y1 > y1 - f) edge(0, y1, 0, y1 - f, v.x0, y1 - f, v.x1 - v.x0, big);
      if (v.x0 < x0 + f) edge(x0, 0, x0 + f, 0, x0 - big, v.y0, big + f, v.y1 - v.y0);
      if (v.x1 > x1 - f) edge(x1, 0, x1 - f, 0, x1 - f, v.y0, big, v.y1 - v.y0);
    }
    fill(L.land, P.land);
    fill(L.ind, pats.ind);
    fill(L.cem, pats.cem);
    fill(L.green, pats.green);
    fill(L.golf, pats.golf);
    fill(L.water, P.sea);
    fill(L.water, pats.water);
    stroke(L.water, P.waterLine, px(0.7));
    stroke(L.land, P.coast, px(s < 2 ? 1 : 1.3));
    // the shore before the reclamation, in red pencil
    ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.6; ctx.lineWidth = px(1); ctx.setLineDash([px(2), px(3.5)]);
    ctx.stroke(oldShore);
    ctx.globalAlpha = 1;
    if (fade(ramp(s, 4))) stroke(L.streams, P.waterLine, px(0.6), [3, 1.5]);
    ctx.globalAlpha = 1;
    // rivers: a single rule far out, a double line with the paper between close up
    const rv = Math.min(px(5), Math.max(px(1.1), 0.25));
    stroke(L.rivers, P.waterLine, rv);
    if (rv > px(2.6)) { stroke(L.rivers, P.paper, rv - px(1.4)); stroke(L.rivers, P.waterHatch, px(0.5)); }
    if (s > 2.5 && fade(ramp(s, 2.6))) {
      fill(L.hdb, s > 8 ? pats.hdb : P.hdb);
      if (s > 6) stroke(L.hdb, P.hdbLine, px(0.7));
    }
    ctx.globalAlpha = 1;
    // ground the survey did not cover
    fill(L.blank, P.paper);
    fill(L.blank, pats.blank);
    stroke(L.blank, P.label2, px(0.8), [5, 2, 1, 2]);
    stroke(L.runway, P.casing, Math.max(1.1, px(2)), undefined, 'butt');
    stroke(L.cable, P.label2, px(1), [1, 3]);

    // roads: black casing, then the fill, red for the main roads
    const W_ = (world: number, min: number, max: number) => Math.min(px(max), Math.max(px(min), world));
    const roadSpec: [string, number, number, number, string, number][] = [
      // layer, world width, min px, max px, fill, appears at
      ['rd', 0.15, 0.6, 9, P.rd, 3.5], ['te', 0.2, 0.7, 10, P.rd, 1.8], ['se', 0.23, 0.8, 11, P.rd, 1.1], ['pr', 0.27, 1, 12, P.tr, 0], ['tr', 0.31, 1.1, 13, P.tr, 0], ['mw', 0.4, 1.6, 15, P.mw, 0],
    ];
    const visible = roadSpec.filter(([, , , , , at]) => s > at);
    if (s > 2.2) {
      for (const [k, w, mn, mx, , at] of visible) { ctx.globalAlpha = at ? ramp(s, at) : 1; stroke(L[k], P.casing, W_(w, mn, mx) + px(s > 6 ? 1.5 : 1)); }
      for (const [k, w, mn, mx, f, at] of visible) { ctx.globalAlpha = at ? ramp(s, at) : 1; stroke(L[k], f, W_(w, mn, mx)); }
      // expressways are drawn double
      if (s > 4) { ctx.globalAlpha = 1; stroke(L.mw, P.casing, px(0.6)); }
    } else {
      // the island plate: single lines, expressways bold
      for (const [k, , , , , at] of visible) {
        ctx.globalAlpha = at ? ramp(s, at) : 1;
        stroke(L[k], k === 'mw' ? P.mwLine : k === 'tr' || k === 'pr' ? P.label2 : P.thin, px(k === 'mw' ? 1.3 : k === 'tr' || k === 'pr' ? 0.65 : 0.35));
      }
    }
    ctx.globalAlpha = 1;

    // rail: the trains across the strait in the old black-and-white band; the MRT as solid rules
    const rw = Math.max(px(1.6), Math.min(px(4), 0.14));
    stroke(L.r_ktm, P.rail, rw * 1.2, undefined, 'butt');
    stroke(L.r_ktm, P.paper, rw * 0.6, [5, 5], 'butt');
    stroke(L.r_spur, P.rail, rw * 0.6, [1, 3]);
    stroke(L.r_ne, P.ne, rw * 0.8, [1.5, 3]);
    for (const [k, c] of [['r_ew', P.ew], ['r_ns', P.ns]] as const) {
      stroke(L[k], P.paper, rw * 2.2);
      stroke(L[k], c, rw * 1.2);
    }
    stroke(L.r_bp, P.bp, rw * 0.9, bpOpen() ? undefined : [4, 3], 'butt');

    // district bounds, dot-and-dash as the survey draws them
    if (s > 1.15 && fade(ramp(s, 1.15))) {
      ctx.strokeStyle = P.bound; ctx.lineWidth = px(0.8); ctx.setLineDash([px(6), px(2), px(1), px(2)]); ctx.lineCap = 'butt';
      for (const d of D) if (d.box.x1 >= v.x0 && d.box.x0 <= v.x1 && d.box.y1 >= v.y0 && d.box.y0 <= v.y1) ctx.stroke(d.path);
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    const sel = D.find((d) => d.id === picked), hov = D.find((d) => d.id === hover && d.id !== picked);
    if (hov) { ctx.strokeStyle = P.ink; ctx.lineWidth = px(1.4); ctx.stroke(hov.path); }
    if (sel) {
      // everything outside the picked district goes pale
      if (o.focus) {
        ctx.save();
        ctx.fillStyle = P.paper; ctx.globalAlpha = 0.55;
        const m = new Path2D();
        m.rect(v.x0 - 10, v.y0 - 10, v.x1 - v.x0 + 20, v.y1 - v.y0 + 20);
        m.addPath(sel.path);
        ctx.fill(m, 'evenodd');
        ctx.restore();
      }
      // the clerk's red pencil round it: a broad soft stroke inside the line, a fine one on it
      ctx.save();
      ctx.clip(sel.path, 'evenodd');
      ctx.strokeStyle = P.accent; ctx.globalAlpha = 0.22; ctx.lineWidth = px(14); ctx.stroke(sel.path);
      ctx.restore();
      ctx.strokeStyle = P.accent; ctx.lineWidth = px(1.4); ctx.globalAlpha = 0.9; ctx.setLineDash([px(7), px(2.5)]); ctx.stroke(sel.path); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // the directory's pages
    const pagesOn = s > 2.2 ? ramp(s, 2.2) : 0;
    if (fade(pagesOn)) {
      ctx.strokeStyle = P.page; ctx.lineWidth = px(0.8); ctx.lineCap = 'butt';
      ctx.beginPath();
      for (const cell of PAGES) {
        const x = (cell % PAGE.cols) * PAGE.w, y = Math.floor(cell / PAGE.cols) * PAGE.h;
        if (x > v.x1 || x + PAGE.w < v.x0 || y > v.y1 || y + PAGE.h < v.y0) continue;
        ctx.rect(x, y, PAGE.w, PAGE.h);
      }
      ctx.stroke();
      if (s > 9 && fade(ramp(s, 9))) {
        ctx.strokeStyle = P.grid;
        ctx.setLineDash([px(1), px(3)]);
        ctx.beginPath();
        for (const cell of PAGES) {
          const x = (cell % PAGE.cols) * PAGE.w, y = Math.floor(cell / PAGE.cols) * PAGE.h;
          if (x > v.x1 || x + PAGE.w < v.x0 || y > v.y1 || y + PAGE.h < v.y0) continue;
          for (let i = 1; i < 4; i++) { ctx.moveTo(x + (PAGE.w * i) / 4, y); ctx.lineTo(x + (PAGE.w * i) / 4, y + PAGE.h); ctx.moveTo(x, y + (PAGE.h * i) / 4); ctx.lineTo(x + PAGE.w, y + (PAGE.h * i) / 4); }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.globalAlpha = 1;

    // ---- labels, in screen pixels ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const boxes: number[][] = [];
    const free = (x0: number, y0: number, x1: number, y1: number) => {
      for (const b of boxes) if (x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]) return false;
      boxes.push([x0, y0, x1, y1]);
      return true;
    };
    boxFree = free;
    const text = (t: string, x: number, y: number, font: string, color: string, opt: { halo?: number; align?: CanvasTextAlign; spacing?: number; force?: boolean } = {}) => {
      ctx.font = font;
      ctx.letterSpacing = `${opt.spacing ?? 0}px`;
      const w = ctx.measureText(t).width, h = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '11');
      const x0 = opt.align === 'left' ? x : opt.align === 'right' ? x - w : x - w / 2;
      if (!opt.force && !free(x0 - 2, y - h * 0.8 - 1, x0 + w + 2, y + h * 0.3 + 1)) return false;
      if (opt.force) boxes.push([x0 - 2, y - h * 0.8 - 1, x0 + w + 2, y + h * 0.3 + 1]);
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      // the type knocks the linework out, as a plate does
      if (opt.halo !== 0) { ctx.strokeStyle = P.halo; ctx.lineWidth = opt.halo ?? 3; ctx.strokeText(t, x0, y); }
      ctx.fillStyle = color;
      ctx.fillText(t, x0, y);
      return true;
    };
    const F = fonts();

    // page numbers in the corner of each page, as the directory prints them
    if (fade(pagesOn * 0.9)) {
      for (const cell of PAGES) {
        const x = (cell % PAGE.cols) * PAGE.w, y = Math.floor(cell / PAGE.cols) * PAGE.h;
        if (x > v.x1 || x + PAGE.w < v.x0 || y > v.y1 || y + PAGE.h < v.y0) continue;
        const [sx, sy] = toScreen(x, y);
        text(String(PAGES.indexOf(cell) + 1), sx + 4, sy + 12, `500 10px ${F.mono}`, P.page, { align: 'left', halo: 2.5, spacing: 0.5 });
      }
    }
    ctx.globalAlpha = 1;

    // the visitor's district and the picked one first, then the large towns, then the rest
    const order = [...D].sort((a, b) => rank(b.id) - rank(a.id));
    const pins = o.pins?.() ?? {};
    for (const d of order) {
      const dd = district(d.id)!;
      const major = !!dd.major || d.id === picked || d.id === o.home || d.id === hover;
      if (!major && s < 1.15 && !pins[d.id]) continue;
      const [x, y] = toScreen(d.lx, d.ly);
      if (x < -60 || x > W + 60 || y < -20 || y > H + 20) continue;
      const on = d.id === picked;
      const size = Math.round(Math.min(16, Math.max(9.5, (dd.major ? 10.5 : 9.5) + Math.log2(s) * 1.5)));
      const name = zh ? dd.zh : dd.en.toUpperCase();
      const sp = zh ? 2 : Math.min(5, 2 + Math.log2(Math.max(1, s)));
      const nameFont = `${zh ? 600 : 500} ${size}px ${zh ? F.display : F.mono}`;
      ctx.font = nameFont;
      ctx.letterSpacing = `${sp}px`;
      const nameW = ctx.measureText(name).width;
      ctx.globalAlpha = major || pins[d.id] ? 1 : ramp(s, 1.15);
      const shown = (major || s >= 1.15) && text(name, x, y + size * 0.35, nameFont, on ? P.accent : P.label, { spacing: sp, halo: 3.5, force: on });
      ctx.globalAlpha = 1;
      const n = pins[d.id];
      if (n) {
        // records on file: a small red stamp beside the name
        const t = String(n).padStart(2, '0');
        ctx.font = `600 9px ${F.mono}`;
        ctx.letterSpacing = '0.5px';
        const w = ctx.measureText(t).width + 7;
        const tx = shown ? x + nameW / 2 + 5 : x - w / 2, ty = shown ? y - size * 0.6 : y - 7;
        if (free(tx, ty, tx + w, ty + 13) || on) {
          ctx.fillStyle = P.halo; ctx.fillRect(tx, ty, w, 13);
          ctx.strokeStyle = P.accent; ctx.lineWidth = 1.2; ctx.strokeRect(tx + 0.5, ty + 0.5, w - 1, 12);
          ctx.fillStyle = P.accent; ctx.fillText(t, tx + 3.5, ty + 9.8);
        }
      }
      if (d.id === o.home) {
        ctx.strokeStyle = P.accent; ctx.lineWidth = 1.3; ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.arc(x, y - size * 0.15, Math.max(14, size * 1.6), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        text(zh ? '你住这里' : 'YOU LIVE HERE', x, y + size * 1.9, `500 9px ${F.mono}`, P.accent, { spacing: 1.5, halo: 3 });
      }
    }

    // unsurveyed ground says so
    if (s > 1.4 && fade(ramp(s, 1.4))) for (const id of ['paya-lebar', 'tengah', 'western-catchment']) {
      const d = D.find((x) => x.id === id);
      if (!d) continue;
      const [x, y] = toScreen(d.lx, d.ly);
      text(zh ? '未测绘' : 'NOT SURVEYED', x, y + 22, `400 9px ${F.mono}`, P.label2, { spacing: 2.5, halo: 3 });
    }
    ctx.globalAlpha = 1;

    // stations: an open square on the line, as the survey marks them
    if (s > 1.4 && fade(ramp(s, 1.4))) {
      for (const st of base.stations) {
        const [x, y] = toScreen(st.x, st.y);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const r = Math.min(4.5, 2.2 + s * 0.1);
        ctx.fillStyle = P.paper; ctx.strokeStyle = st.l === 'ns' ? P.ns : st.l === 'ew' ? P.ew : P.bp; ctx.lineWidth = 1.4;
        ctx.setLineDash(st.l === 'bp' && !bpOpen() ? [2, 1.5] : []);
        ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2);
        ctx.setLineDash([]);
      }
      if (s > 3 && fade(ramp(s, 3))) for (const st of base.stations) {
        const [x, y] = toScreen(st.x, st.y);
        if (x < -80 || x > W + 80 || y < -10 || y > H + 10) continue;
        const name = zh ? st.n[1] : st.n[0].toUpperCase();
        const soon = st.l === 'bp' && !bpOpen() ? (zh ? '（11月6日通车）' : ' (6 NOV)') : '';
        text(name + soon, x + 7, y + 3.5, `500 ${s > 8 ? 10 : 9}px ${zh ? F.sans : F.mono}`, P.label, { align: 'left', halo: 3, spacing: zh ? 0.5 : 0.8 });
      }
    }
    ctx.globalAlpha = 1;

    // place names inside districts
    if (s > 4.5 && detail && fade(ramp(s, 4.5))) for (const p of detail.places) {
      const b = district(p.d)?.blocks[p.i];
      if (!b) continue;
      const [x, y] = toScreen(p.x, p.y);
      if (x < -80 || x > W + 80 || y < -10 || y > H + 10) continue;
      text(zh ? b.zh : b.en, x, y, `italic 400 ${s > 12 ? 13 : 12}px ${F.serif}`, P.label2, { halo: 3, spacing: 0.3 });
    }
    ctx.globalAlpha = 1;

    // road and river names along the line
    if (s > 3.2) {
      const at = (c: string) => (c === 'rd' ? 9 : c === 'te' ? 6 : c === 'se' ? 4.5 : 3.2);
      for (const r of roadsNamed) {
        if (s <= at(r.cls)) continue;
        ctx.globalAlpha = ramp(s, at(r.cls));
        along(r, zh, F, v);
      }
    }
    ctx.globalAlpha = 1;

    // block numbers
    if (s > 15 && detail && fade(ramp(s, 15))) {
      for (const h of hdb) {
        if (h.x < v.x0 || h.x > v.x1 || h.y < v.y0 || h.y > v.y1 || !h.b) continue;
        const [x, y] = toScreen(h.x, h.y);
        text(h.b, x, y + 3, `600 ${s > 30 ? 11 : 9}px ${F.mono}`, P.label, { halo: 2.5 });
      }
    }
    ctx.globalAlpha = 1;

    // the neat line round the plate, a scale bar and a north point
    neat();
    scale(s, F);
  }

  const rank = (id: string) => (id === picked ? 4 : id === o.home ? 3 : id === hover ? 2.5 : district(id)?.major ? 2 : 1);

  function along(r: { cls: string; pts: Float32Array; n: string[] }, zh: boolean, F: ReturnType<typeof fonts>, v: Box) {
    const p = r.pts;
    // quick reject
    let inView = false;
    for (let i = 0; i < p.length; i += 8) if (p[i] > v.x0 && p[i] < v.x1 && p[i + 1] > v.y0 && p[i + 1] < v.y1) { inView = true; break; }
    if (!inView) return;
    const river = r.cls === 'river';
    const cjk = zh && !!r.n[1];
    // roads in the survey's capitals, water in italic
    const label = cjk ? r.n[1] : river ? r.n[0] : r.n[0].toUpperCase();
    const size = river ? 11.5 : r.cls === 'mw' || r.cls === 'tr' || r.cls === 'pr' ? 9.5 : 8.5;
    const font = river ? `italic 400 ${size}px ${F.serif}` : cjk ? `500 ${size + 1}px ${F.sans}` : `500 ${size}px ${F.mono}`;
    const spacing = river ? 1.5 : cjk ? 1 : 0.8;
    ctx.font = font;
    ctx.letterSpacing = `${spacing}px`;
    const tw = ctx.measureText(label).width + 12;
    // longest straight run on screen
    let best = 0, bi = -1, bj = -1;
    let i = 0;
    while (i < p.length - 2) {
      const [ax, ay] = toScreen(p[i], p[i + 1]);
      let j = i + 2, len = 0;
      const [bx, by] = toScreen(p[j], p[j + 1]);
      const ang = Math.atan2(by - ay, bx - ax);
      len = Math.hypot(bx - ax, by - ay);
      while (j + 2 < p.length) {
        const [cx, cy] = toScreen(p[j], p[j + 1]), [dx, dy] = toScreen(p[j + 2], p[j + 3]);
        const a2 = Math.atan2(dy - cy, dx - cx);
        let d = Math.abs(a2 - ang); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > 0.22) break;
        len += Math.hypot(dx - cx, dy - cy);
        j += 2;
      }
      if (len > best) { best = len; bi = i; bj = j; }
      i = j;
    }
    if (best < tw || bi < 0) return;
    const [ax, ay] = toScreen(p[bi], p[bi + 1]), [bx, by] = toScreen(p[bj], p[bj + 1]);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (mx < 0 || mx > W || my < 0 || my > H) return;
    let a = Math.atan2(by - ay, bx - ax);
    if (a > Math.PI / 2) a -= Math.PI; else if (a < -Math.PI / 2) a += Math.PI;
    // collision box: the rotated label's bounds
    const c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), hw = (tw - 12) / 2, hh = size * 0.6;
    const ex = hw * c + hh * sn, ey = hw * sn + hh * c;
    if (!boxFree(mx - ex, my - ey, mx + ex, my + ey)) return;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.halo; ctx.lineWidth = 3;
    ctx.strokeText(label, 0, size * 0.35);
    ctx.fillStyle = river ? P.waterLine : r.cls === 'mw' ? P.label : P.label2;
    ctx.fillText(label, 0, size * 0.35);
    ctx.restore();
  }
  // road labels share the collision list with the other labels (set in paint)
  let boxFree = (_x0: number, _y0: number, _x1: number, _y1: number) => true;

  /** The plate's neat line: a double rule round the edge, with ticks every kilometre. */
  function neat() {
    ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.strokeRect(5.5, 5.5, W - 11, H - 11);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(9.5, 9.5, W - 19, H - 19);
    // a tick each kilometre along the border, a long one every five
    const v = vbox(), step = KM * (view.s < 2 ? 5 : view.s < 8 ? 1 : 0.5);
    ctx.beginPath();
    for (let x = Math.ceil(v.x0 / step) * step; x < v.x1; x += step) {
      const sx = Math.round(toScreen(x, 0)[0]) + 0.5, long = Math.round(x / step) % 5 === 0;
      if (sx < 10 || sx > W - 10) continue;
      ctx.moveTo(sx, 5.5); ctx.lineTo(sx, long ? 13 : 9.5); ctx.moveTo(sx, H - 5.5); ctx.lineTo(sx, long ? H - 13 : H - 9.5);
    }
    for (let y = Math.ceil(v.y0 / step) * step; y < v.y1; y += step) {
      const sy = Math.round(toScreen(0, y)[1]) + 0.5, long = Math.round(y / step) % 5 === 0;
      if (sy < 10 || sy > H - 10) continue;
      ctx.moveTo(5.5, sy); ctx.lineTo(long ? 13 : 9.5, sy); ctx.moveTo(W - 5.5, sy); ctx.lineTo(long ? W - 13 : W - 9.5, sy);
    }
    ctx.stroke();
  }

  /** A chequered scale bar and the north point, bottom left, as on the plate. */
  function scale(s: number, F: ReturnType<typeof fonts>) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10];
    const km = steps.find((k) => k * KM * s >= 70) ?? 10;
    const seg = (km * KM * s) / 4, x = 22, y = H - 24;
    const w = seg * 4;
    ctx.fillStyle = P.halo; ctx.fillRect(x - 6, y - 26, w + 46, 36);
    ctx.strokeStyle = P.ink; ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? P.paper : P.ink;
      ctx.fillRect(x + seg * i, y - 4, seg, 4);
    }
    ctx.strokeRect(x + 0.5, y - 4.5, w, 4);
    ctx.font = `500 8.5px ${F.mono}`; ctx.letterSpacing = '1px'; ctx.textAlign = 'center'; ctx.fillStyle = P.ink;
    ctx.fillText('0', x, y + 8);
    ctx.fillText(km < 1 ? `${km * 1000} M` : `${km} KM`, x + w, y + 8);
    ctx.textAlign = 'left';
    ctx.fillText(`1 : ${ratioText(s)}`, x, y - 10);
    // north
    const nx = x + w + 26, ny = y - 2;
    ctx.beginPath(); ctx.moveTo(nx, ny - 18); ctx.lineTo(nx + 4, ny); ctx.lineTo(nx, ny - 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny - 18); ctx.lineTo(nx - 4, ny); ctx.lineTo(nx, ny - 4); ctx.closePath(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText('N', nx, ny - 21); ctx.textAlign = 'left';
  }
  /** The nominal print scale, rounded the way a plate states it. */
  const ratioText = (s: number) => {
    const n = RATIO(s), m = Math.pow(10, Math.floor(Math.log10(n)) - 1);
    return (Math.round(n / m / 5) * 5 * m).toLocaleString('en-GB').replace(/,/g, ' ');
  };

  let fontCache: { display: string; sans: string; mono: string; serif: string } | null = null;
  const fonts = () => {
    if (fontCache) return fontCache;
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
    return (fontCache = { display: v('--f-display', 'sans-serif'), sans: v('--f-sans', 'sans-serif'), mono: v('--f-mono', 'monospace'), serif: v('--f-serif', 'serif') });
  };

  const oldShore = new Path2D(SHEET.oldShore);

  /* ----- moving about ----- */
  const clampView = () => {
    view.s = Math.min(MAX_S, Math.max(Math.min(MIN_S, fitIsland()), view.s));
    const m = 120;
    view.cx = Math.min(1000 + m, Math.max(-m, view.cx));
    view.cy = Math.min(560 + m, Math.max(-m, view.cy));
  };
  const changed = () => {
    clampView();
    draw();
    point(lastPoint);
  };
  let lastPoint: [number, number] | null = null;
  const point = (sp: [number, number] | null) => {
    const [x, y] = sp ? toSheet(sp[0], sp[1]) : [view.cx, view.cy];
    const id = base ? districtAt(x, y) : null;
    const ref = pageRef({ x, y });
    o.onPoint?.(id, ref ? ref.text : null);
  };

  let anim = 0;
  let target: number | null = null; // the scale being turned to
  const stop = () => { cancelAnimationFrame(anim); anim = 0; target = null; };
  const flyTo = (cx: number, cy: number, s: number, ms = 700) => {
    const keep = target;
    stop();
    target = keep;
    s = Math.min(MAX_S, Math.max(MIN_S, s));
    if (reducedMotion() || ms === 0) {
      Object.assign(view, { cx, cy, s });
      target = null;
      return changed();
    }
    const from = { ...view }, t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      // zoom in log space so the travel feels even
      view.s = Math.exp(Math.log(from.s) + (Math.log(s) - Math.log(from.s)) * e);
      view.cx = from.cx + (cx - from.cx) * e;
      view.cy = from.cy + (cy - from.cy) * e;
      changed();
      if (t < 1) anim = requestAnimationFrame(tick);
      else target = null;
    };
    anim = requestAnimationFrame(tick);
  };

  /** The scales the sheet is printed at, from the whole island in. */
  const levels = () => {
    const f = fitIsland();
    return [f, ...PRINT.filter((p) => p > f * 1.25)];
  };
  const nearestLevel = (s: number) => {
    const ls = levels();
    let best = 0;
    for (let i = 1; i < ls.length; i++) if (Math.abs(Math.log(ls[i] / s)) < Math.abs(Math.log(ls[best] / s))) best = i;
    return best;
  };
  /** Turn to the next scale in or out, keeping the point under the pointer where it is. */
  const step = (dir: number, sx = W / 2, sy = H / 2, ms = 520) => {
    const ls = levels();
    const i = Math.min(ls.length - 1, Math.max(0, nearestLevel(target ?? view.s) + dir));
    const s = ls[i];
    if (Math.abs(Math.log(s / view.s)) < 0.01 && target === null) return;
    const [x, y] = toSheet(sx, sy);
    target = s;
    flyTo(x - (sx - W / 2) / s, y - (sy - H / 2) / s, s, ms);
  };
  /** After a pinch, settle on the nearest printed scale. */
  const settle = (sx = W / 2, sy = H / 2) => {
    const s = levels()[nearestLevel(view.s)];
    if (Math.abs(Math.log(s / view.s)) < 0.01) return;
    const [x, y] = toSheet(sx, sy);
    flyTo(x - (sx - W / 2) / s, y - (sy - H / 2) / s, s, 380);
  };
  const fit = (id: string, animate = true) => {
    const d = D.find((x) => x.id === id);
    if (!d) return;
    const pad = 1.2;
    const want = Math.min(W / ((d.box.x1 - d.box.x0) * pad), H / ((d.box.y1 - d.box.y0) * pad));
    // the closest printed scale the whole district fits on
    const ls = levels();
    const s = [...ls].reverse().find((l) => l <= want) ?? ls[0];
    flyTo((d.box.x0 + d.box.x1) / 2, (d.box.y0 + d.box.y1) / 2, Math.max(s, ls[Math.min(1, ls.length - 1)]), animate ? 800 : 0);
  };
  const reset = () => flyTo(500, 285, fitIsland());

  // pointers: drag to move, two fingers to pinch, a tap to pick
  const ptrs = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number; t: number } | null = null, moved = 0;
  let pinch: { d: number; s: number; mx: number; my: number; cx: number; cy: number } | null = null;
  let vel = { x: 0, y: 0, t: 0 };
  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  canvas.addEventListener('pointerdown', (e) => {
    stop();
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    ptrs.set(e.pointerId, p);
    if (ptrs.size === 1) { downAt = { ...p, t: performance.now() }; moved = 0; vel = { x: 0, y: 0, t: performance.now() }; }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const [cx, cy] = toSheet((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cx, cy };
    }
    frame.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (!ptrs.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        lastPoint = [p.x, p.y];
        const [x, y] = toSheet(p.x, p.y);
        const id = base ? districtAt(x, y) : null;
        if (id !== hover) { hover = id; draw(); }
        point(lastPoint);
      }
      return;
    }
    const prev = ptrs.get(e.pointerId)!;
    ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      view.s = Math.min(MAX_S, Math.max(MIN_S, pinch.s * (d / pinch.d)));
      view.cx = pinch.cx - (mx - W / 2) / view.s;
      view.cy = pinch.cy - (my - H / 2) / view.s;
      moved += 10;
      changed();
      return;
    }
    const dx = p.x - prev.x, dy = p.y - prev.y;
    moved += Math.abs(dx) + Math.abs(dy);
    view.cx -= dx / view.s; view.cy -= dy / view.s;
    const now = performance.now(), dt = Math.max(1, now - vel.t);
    vel = { x: (dx / dt) * 0.6 + vel.x * 0.4, y: (dy / dt) * 0.6 + vel.y * 0.4, t: now };
    changed();
  });
  const up = (e: PointerEvent) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    const wasPinch = !!pinch;
    const mid = pinch ? { x: pinch.mx, y: pinch.my } : null;
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size) return;
    if (wasPinch) {
      frame.classList.remove('is-dragging');
      downAt = null;
      return settle(mid?.x, mid?.y);
    }
    frame.classList.remove('is-dragging');
    const p = local(e);
    if (downAt && moved < 6 && performance.now() - downAt.t < 500) {
      const [x, y] = toSheet(p.x, p.y);
      const id = districtAt(x, y);
      pick(id === picked && !o.focus ? null : id);
    } else if (!reducedMotion() && performance.now() - vel.t < 80 && Math.hypot(vel.x, vel.y) > 0.15) {
      // let it glide a little
      let vx = vel.x * 16, vy = vel.y * 16;
      const glide = () => {
        vx *= 0.92; vy *= 0.92;
        view.cx -= vx / view.s; view.cy -= vy / view.s;
        changed();
        if (Math.hypot(vx, vy) > 0.3) anim = requestAnimationFrame(glide);
      };
      anim = requestAnimationFrame(glide);
    }
    downAt = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => {
    if (hover) { hover = null; draw(); }
    lastPoint = null;
    point(null);
  });
  // the wheel turns one scale at a time; a trackpad's small deltas add up to a turn
  let wheelAcc = 0, wheelLock = 0;
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    const dy = (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * (e.ctrlKey ? 4 : 1);
    const now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) < 40) return;
    step(wheelAcc < 0 ? 1 : -1, p.x, p.y);
    wheelAcc = 0;
    wheelLock = now + 420;
  }, { passive: false });
  canvas.addEventListener('dblclick', (e) => {
    const p = local(e);
    step(1, p.x, p.y);
  });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === '+' || k === '=') step(1);
    else if (k === '-' || k === '_') step(-1);
    else if (k === 'ArrowLeft') { view.cx -= 60 / view.s; changed(); }
    else if (k === 'ArrowRight') { view.cx += 60 / view.s; changed(); }
    else if (k === 'ArrowUp') { view.cy -= 60 / view.s; changed(); }
    else if (k === 'ArrowDown') { view.cy += 60 / view.s; changed(); }
    else if (k === '0') reset();
    else return;
    e.preventDefault();
  });

  const pick = (id: string | null, fly = false) => {
    picked = id;
    draw();
    o.onPick?.(id);
    if (fly && id) fit(id);
  };

  // theme and fonts
  // the theme's colours ease across (they are registered properties), so the sheet follows them for a second
  let themeAnim = 0;
  new MutationObserver(() => {
    cancelAnimationFrame(themeAnim);
    const t0 = performance.now();
    const follow = () => {
      P = palette(document.documentElement.dataset.theme === 'night');
      makePatterns();
      paint();
      if (performance.now() - t0 < 1200) themeAnim = requestAnimationFrame(follow);
    };
    follow();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.fonts?.addEventListener?.('loadingdone', () => { fontCache = null; draw(); });

  new ResizeObserver(() => {
    const first = !W;
    resize();
    if (first) {
      view.s = fitIsland();
      if (o.focus && D.length) fit(o.focus, false);
    }
  }).observe(frame);

  makePatterns();
  load();

  return {
    /** Pick a district (or none) and, if asked, fly to it. */
    pick: (id: string | null, fly = true) => pick(id, fly),
    /** One printed scale in (1) or out (-1). */
    step: (dir: number) => step(dir),
    /** The plate's nominal scale, "1 : 50 000". */
    ratio: () => `1 : ${ratioText(view.s)}`,
    reset,
    redraw: draw,
    focus: () => canvas.focus(),
  };
}

export type StreetMap = ReturnType<typeof streetMap>;
