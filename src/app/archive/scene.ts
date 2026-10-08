/**
 * The archive stacks as a cutaway model on the page, under the same long lens
 * as the library and the office. The camera moves between the whole room and
 * its corners; clicking a group of formal cabinets pushes in on it, and the
 * controller then hands over to the drawers themselves.
 *
 * Light: four rows of pendants on four switches by the door, three desk lamps
 * with pull chains, daylight through the louvres (none on a wet day), the
 * sodium street lamp outside at night and, on clear nights with the moon up,
 * moonlight. At night only the lamps that are on light the room; everything
 * else sinks into the dark.
 *
 * The formal cabinets open where they stand: a drawer slides out with its
 * files hanging in it, a file lifts out, and files taken to the reading table
 * lie there face up.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Spring, SpringV3, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { islandNow } from '../island';
import { StacksRoom, AR, WINDOWS, type StacksCategory } from './room';
import { setStacksAniso } from './textures';
import { laidOver } from './homography';

export type StacksZone = 'overview' | 'formal' | 'routine' | 'reading' | 'counter' | 'door';
export const STACKS_ZONES: StacksZone[] = ['overview', 'formal', 'routine', 'reading', 'counter', 'door'];

/**
 * The light falling on a page read at some place in the room, worked out from
 * the room's own lamps each frame: its colour, how bright (0–1), where on the
 * page the brightest source sits (0–1 across, 0–1 down), and how much of it
 * comes from lamps, the moon, the street lamp and the day.
 */
export interface PaperLit {
  color: string;
  b: number;
  lx: number;
  ly: number;
  lamps: number;
  moon: number;
  street: number;
  day: number;
}

/** Where the sheet lying open on the blotter is on the screen: the page is laid over it. */
export interface SheetPlace {
  /** CSS transform taking a box of `w` × `h` onto the sheet. */
  pin: string;
  w: number;
  h: number;
  /** The sheet's bounding box on the screen: left, top, right, bottom. */
  box: [number, number, number, number];
  /** How much darker the sheet is at the middle of its top, bottom, left and right edges than where it is fully lit, 0–1. */
  shade: [number, number, number, number];
}

/** The width, in CSS pixels, of the page laid over the sheet; its height follows the sheet's own proportions. */
export const PIN_W = 560;
/** The room's lamps at one fixed strength, set against the tone-mapped exposure: the same sitting or walking. */
const LAMP = 0.28;

export interface StacksEvents {
  /** The light on the page being read changed. */
  paper?(v: PaperLit): void;
  /** Where the sheet being read lies on the screen (null: none is). Reported when it moves. */
  sheet?(v: SheetPlace | null): void;
  /** Where the second sheet, laid beside it, is on the screen (null: none is). */
  side?(v: SheetPlace | null): void;
  zone(z: StacksZone): void;
  hover(key: string | null): void;
  /** A group of formal cabinets clicked. */
  cabinet(ci: number): void;
  /** A hanging file in an open drawer clicked. */
  file(file: string): void;
  /** A file lying on the reading table clicked. */
  tableFile(file: string): void;
  bank(bi: number): void;
  rocker(i: number): void;
  desk(i: number): void;
  /** An examination lamp (its tube or its pull cord) clicked. */
  exam(i: number): void;
  index(): void;
  tray(): void;
  safe(): void;
  dehumidifier(): void;
}

interface View {
  at: THREE.Vector3;
  dir: THREE.Vector3;
  w: number;
  h: number;
}

interface Look {
  hemi: number;
  sun: number;
  env: number;
  street: number;
  night: number;
  /** Pendant and desk-lamp strength when on. */
  pendant: number;
  desk: number;
}
const LOOKS: Record<'day' | 'night', Look> = {
  day: { hemi: 0.75, sun: 3.6, env: 0.35, street: 0, night: 0, pendant: 3, desk: 1.5 },
  night: { hemi: 0.05, sun: 0, env: 0.035, street: 6, night: 1, pendant: 34, desk: 9 },
};

const UP = new THREE.Vector3(0, 1, 0);

export class StacksScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(19, 1, 0.1, 200);
  private hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a8070, 1);
  private sun = new THREE.DirectionalLight(0xfff1d8, 3);
  readonly room: StacksRoom;

  private zoneNow: StacksZone = 'overview';
  /** The formal group the camera is up close to, and the drawer pulled out there. */
  private push: number | null = null;
  /** Sat down at the reading place, leaning over the blotter. */
  private seated = false;
  private paired = false;
  private drawer: { ci: number; d: number } | null = null;
  /** Moonlight through the louvres tonight, 0–1. */
  private moonK = 0;
  private view: { at: SpringV3; dir: SpringV3; dist: Spring };
  private parallax = new THREE.Vector2();
  private pointer = new THREE.Vector2(9, 9);
  private raycaster = new THREE.Raycaster();
  private hoverKey = '';

  private look: Look = { ...LOOKS.day };
  private lookTarget = LOOKS.day;
  private rain = false;
  private rainK = 0;
  private rows = [false, false, false, false];
  private rowLevel = [0, 0, 0, 0];
  private flicker = [0, 0, 0, 0];
  private desks = [false, false, false];
  private deskLevel = [0, 0, 0];
  /** Examination tubes: wanted level, level now, and time since the starter kicked in (-1 = steady). */
  private exam: number[] = [];
  private examLevel: number[] = [];
  private examFlick: number[] = [];
  /** Where a page is being read, if one is. */
  private readPoint: THREE.Vector3 | null = null;
  private paperNow: PaperLit & { lux: number; r: number; g: number; bl: number } = { color: '#ffd9a0', b: 0.5, lx: 0.22, ly: -0.08, lamps: 0, moon: 0, street: 0, day: 0, lux: 0, r: 1, g: 0.85, bl: 0.6 };
  private paperSent = '';
  private reduce = reducedMotion();
  private last = performance.now();
  private t0 = performance.now();
  private running = true;
  private raf = 0;

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, cats: StacksCategory[], opts: { today: string }, private on: StacksEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setStacksAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.room = new StacksRoom(cats, opts);
    this.scene.add(this.room.group);

    // Shadows from the lamps where they matter most: the formal cabinets, the
    // reading table, the desk. Phones get fewer.
    const lite = matchMedia('(pointer: coarse)').matches;
    this.room.pendants.forEach((p, i) => (p.light.castShadow = lite ? p.row === 1 && i === 0 : p.row === 1 || p.row === 3));
    this.room.desks.forEach((d, i) => (d.light.castShadow = i === 0));

    this.sun.position.set(-4, 9, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(lite ? 2048 : 4096, lite ? 2048 : 4096);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 30 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.hemi, this.sun, this.sun.target);

    const v = this.viewOf('overview');
    this.view = { at: new SpringV3(v.at.clone(), 2.6), dir: new SpringV3(v.dir.clone(), 2.6), dist: new Spring(60, 2.6) };
    this.bind();
    this.resize();
    this.view.dist.set(this.fit(v));
    this.loop();
  }

  /* ---------------- views ---------------- */
  private viewOf(z: StacksZone): View {
    if (this.seated) {
      // in the chair, leaning over the blotter: the sheet in the middle, the brass lamps either side, the tube above
      if (this.paired) return { at: this.room.readSpot(true).add(new THREE.Vector3(0, 0.04, -0.1)), dir: new THREE.Vector3(0, 1, 0.55).normalize(), w: 0.78, h: 0.56 };
      return { at: this.room.readSpot().add(new THREE.Vector3(0, 0.04, -0.1)), dir: new THREE.Vector3(0, 1, 0.55).normalize(), w: 0.3, h: 0.58 };
    }
    if (this.drawer) {
      // over the open drawer, looking down into it from the front
      const f = this.room.drawerFront(this.drawer.ci, this.drawer.d);
      return { at: f, dir: new THREE.Vector3(1, 1.15, 0.2).normalize(), w: 0.95, h: 0.8 };
    }
    if (this.push !== null) {
      const c = this.room.catCentre[this.push] ?? new THREE.Vector3();
      return { at: c.clone().add(new THREE.Vector3(0.1, 0.05, 0)), dir: new THREE.Vector3(1, 0.42, 0.12).normalize(), w: 1.5, h: 1.5 };
    }
    switch (z) {
      case 'formal':
        return { at: new THREE.Vector3(AR.x0 + 0.6, 0.95, -0.9), dir: new THREE.Vector3(1, 0.5, 0.42).normalize(), w: 5.4, h: 2.4 };
      case 'routine':
        return { at: new THREE.Vector3(-0.2, 1.0, -1.7), dir: new THREE.Vector3(2, 3.2, 7).normalize(), w: 4.8, h: 3.0 };
      case 'reading':
        return { at: new THREE.Vector3(3.5, 1.0, -2.5), dir: new THREE.Vector3(3, 5, 7).normalize(), w: 3.6, h: 2.4 };
      case 'counter':
        return { at: new THREE.Vector3(3.6, 1.0, 1.7), dir: new THREE.Vector3(3, 4, 8).normalize(), w: 3.6, h: 2.2 };
      case 'door':
        return { at: new THREE.Vector3(-4.0, 1.2, 2.2), dir: new THREE.Vector3(6, 3.2, 4).normalize(), w: 3.8, h: 2.6 };
      default:
        return { at: new THREE.Vector3(0.2, 0.9, 0.2), dir: new THREE.Vector3(7.2, 8.6, 12).normalize(), w: 13.2, h: 8.8 };
    }
  }

  private fit(v: View) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.camera.aspect < 0.85;
    const fw = portrait ? 0.96 : 0.68, fh = portrait ? 0.5 : 0.8;
    return Math.max(v.h / (fh * 2 * tan), v.w / (fw * 2 * tan * this.camera.aspect));
  }

  goZone(z: StacksZone) {
    if (this.drawer) this.closeDrawer();
    this.seated = false;
    if (z === this.zoneNow) return;
    this.zoneNow = z;
    this.on.zone(z);
  }

  get zone() {
    return this.zoneNow;
  }

  /** Walk up to a group of formal cabinets and pull drawer `d` out. */
  openDrawer(ci: number, d: number) {
    if (this.drawer && (this.drawer.ci !== ci || this.drawer.d !== d)) this.room.setDrawer(this.drawer.ci, this.drawer.d, false);
    this.push = ci;
    this.drawer = { ci, d };
    this.room.setDrawer(ci, d, true);
    if (this.zoneNow !== 'formal') {
      this.zoneNow = 'formal';
      this.on.zone('formal');
    }
  }

  /** Push the drawer home and step back from the cabinets. */
  closeDrawer() {
    if (this.drawer) this.room.setDrawer(this.drawer.ci, this.drawer.d, false);
    this.room.dropAll();
    this.drawer = null;
    this.push = null;
  }

  /** Sit down at the reading place (or get up and step back to see the table). */
  sit(on: boolean) {
    if (on && this.drawer) this.closeDrawer();
    this.seated = on;
    if (on && this.zoneNow !== 'reading') {
      this.zoneNow = 'reading';
      this.on.zone('reading');
    }
  }

  /** Lay a second sheet beside the one being read (the camera draws back to take in both). */
  pair(on: boolean) {
    this.paired = on && this.seated;
  }

  get isSeated() {
    return this.seated;
  }

  get openAt() {
    return this.drawer;
  }

  /** Tonight's moon through the louvres, 0–1 (0 = only the street lamp). */
  setMoon(k: number) {
    this.moonK = k;
  }

  setTheme(theme: 'day' | 'night', instant = false) {
    this.lookTarget = LOOKS[theme];
    if (instant) this.look = { ...LOOKS[theme] };
    this.room.setWeather(this.rain, theme === 'night', this.rh);
  }

  private rh = 70;
  setWeather(rain: boolean, rh: number) {
    this.rain = rain;
    this.rainK = rain ? 1 : 0;
    this.rh = rh;
    this.room.setWeather(rain, this.lookTarget === LOOKS.night, rh);
  }

  /** A row of pendants on or off. A bulb coming on catches a moment before it holds. */
  setRow(i: number, on: boolean, instant = false) {
    if (this.rows[i] === on && !instant) return;
    this.rows[i] = on;
    this.room.setRocker(i, on);
    if (instant) this.rowLevel[i] = on ? 1 : 0;
    else if (on && !this.reduce) this.flicker[i] = 0.42;
  }

  /**
   * An examination tube at `level` (0 off, 1 full). A tube switched on from
   * cold flickers on its starter before it holds; off, it simply goes out.
   */
  setExam(i: number, level: number, instant = false) {
    const was = this.exam[i] ?? 0;
    this.exam[i] = level;
    if (instant || this.reduce) {
      this.examLevel[i] = level;
      this.examFlick[i] = -1;
    } else if (level > 0 && was === 0 && (this.examLevel[i] ?? 0) < 0.05) this.examFlick[i] = 0;
  }

  get examWanted() {
    return this.exam.slice();
  }

  /** A point in the room, where it is on the screen. */
  screenOf(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** Where a page is being read (null when none is): the light there is reported each frame. */
  setReadPoint(p: THREE.Vector3 | null) {
    this.readPoint = p ? p.clone() : null;
    this.paperSent = '';
  }

  setDesk(i: number, on: boolean, instant = false) {
    this.desks[i] = on;
    if (instant) this.deskLevel[i] = on ? 1 : 0;
  }

  /** Stop drawing while the drawers are on screen. */
  pause() {
    this.running = false;
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.resize();
  }

  /* ---------------- frame ---------------- */
  private loop() {
    const step = () => {
      this.raf = requestAnimationFrame(step);
      if (this.running && !document.hidden) this.frame();
    };
    step();
  }

  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const k = damp(2.2, dt);
    const L = this.look, T = this.lookTarget;
    for (const key of Object.keys(L) as (keyof Look)[]) L[key] += (T[key] - L[key]) * k;
    this.rainK += ((this.rain ? 1 : 0) - this.rainK) * k;
    const r = this.room;
    const day = 1 - L.night;
    const wet = this.rainK;

    // the sky: grey and soft on a wet day, warmer towards evening
    const hour = islandNow().hours + islandNow().minutes / 60;
    const dusk = Math.max(0, Math.min(1, (hour - 16.5) / 2.5));
    this.hemi.intensity = L.hemi * (1 - wet * 0.2);
    this.sun.intensity = L.sun * (1 - wet * 0.4);
    this.sun.visible = this.sun.intensity > 0.05;
    this.sun.color.set('#fff1d8').lerp(new THREE.Color('#dfe6ee'), wet).lerp(new THREE.Color('#ffc890'), dusk * (1 - wet) * 0.7);
    this.scene.environmentIntensity = L.env * (1 - wet * 0.2);
    // outside at night: the sodium lamp always, the moon when it is up and the sky is clear
    const moon = this.moonK * L.night;
    r.street.intensity = L.street * (this.moonK > 0.18 ? 0.5 : 1);
    r.street.visible = r.street.intensity > 0.1;
    r.moon.intensity = moon * 0.9;
    r.moon.visible = r.moon.intensity > 0.01;
    r.paperShadow.opacity = 0.3 + L.night * 0.3;
    const patch = new THREE.Color('#fff3d6').lerp(new THREE.Color('#ffb46a'), dusk);
    const nightPatch = new THREE.Color('#ff9a3c').lerp(new THREE.Color('#9fb2e6'), Math.min(1, this.moonK * 1.6));
    r.sunPatches.forEach((m, i) => {
      const dayOp = day * (0.22 - wet * 0.17), nightOp = L.night * (0.07 + this.moonK * 0.12) * (1 - wet * 0.4);
      m.material.opacity = dayOp + nightOp;
      m.material.color.copy(patch).lerp(nightPatch, nightOp / Math.max(1e-4, dayOp + nightOp));
      // the patches creep across the floor with the sun
      m.position.x = Math.min(AR.x1 - 0.85, WINDOWS[i] + 0.55 + (Math.min(19, Math.max(7, hour)) - 13) * 0.08);
    });
    r.exitMat.emissiveIntensity = 0.3 + L.night * 0.9;

    // lamps
    for (let i = 0; i < 4; i++) {
      let want = this.rows[i] ? 1 : 0;
      if (this.flicker[i] > 0) {
        this.flicker[i] -= dt;
        want = Math.sin(this.flicker[i] * 70) > 0.1 ? 1 : 0.15;
        this.rowLevel[i] = want;
      } else this.rowLevel[i] += (want - this.rowLevel[i]) * Math.min(1, dt * (want ? 7 : 4.5));
    }
    for (const p of r.pendants) {
      const lv = this.rowLevel[p.row];
      p.light.intensity = L.pendant * lv * LAMP;
      p.light.visible = p.light.intensity > 0.01;
      p.fill.intensity = lv * (0.4 + L.night * 0.25) * LAMP;
      p.bulb.emissiveIntensity = 0.05 + lv * (0.6 + L.night * 1.9);
      p.glass.emissiveIntensity = 0.02 + lv * (0.15 + L.night * 0.75);
    }
    r.desks.forEach((d, i) => {
      this.deskLevel[i] += ((this.desks[i] ? 1 : 0) - this.deskLevel[i]) * Math.min(1, dt * (this.desks[i] ? 7 : 4.5));
      d.light.intensity = L.desk * this.deskLevel[i] * (i === 2 ? 0.38 : LAMP);
      d.light.visible = d.light.intensity > 0.01;
      d.inner.emissiveIntensity = 0.05 + this.deskLevel[i] * (0.4 + L.night * 0.8);
    });
    r.pictureLight.intensity = this.rowLevel[0] * (0.6 + L.night * 2.4);
    r.pictureLight.visible = r.pictureLight.intensity > 0.01;
    // examination tubes: the starter's stutter, then a steady cold light
    r.exams.forEach((e, i) => {
      const want = this.exam[i] ?? 0;
      let lv = this.examLevel[i] ?? 0;
      const fl = this.examFlick[i] ?? -1;
      if (fl >= 0) {
        const t = (this.examFlick[i] = fl + dt);
        const seq = t < 0.07 ? 0.6 : t < 0.2 ? 0 : t < 0.27 ? 0.85 : t < 0.42 ? 0.04 : t < 0.47 ? 1 : t < 0.6 ? 0.25 : -1;
        if (seq < 0) {
          this.examFlick[i] = -1;
          lv = want * 0.8;
        } else lv = seq * want;
      } else lv += (want - lv) * Math.min(1, dt * (want > lv ? 5 : 16));
      this.examLevel[i] = lv;
      e.light.intensity = (1.4 + L.night * 9) * lv * e.gain;
      e.light.visible = e.light.intensity > 0.01;
      e.tube.emissiveIntensity = 0.02 + lv * (0.7 + L.night * 1.6);
      e.glow.opacity = lv * (0.08 + L.night * 0.22);
    });
    if (this.readPoint) this.reportPaper(dt);
    this.reportSheet();

    const it = islandNow();
    r.tick(t, dt, { h: it.hours, m: it.minutes, s: it.seconds + it.ms / 1000 }, this.reduce ? 0 : 1);

    // camera
    const target = this.viewOf(this.zoneNow);
    this.view.at.setTarget(target.at);
    this.view.dir.setTarget(target.dir);
    this.view.dist.target = this.fit(target);
    // with reduced motion on, the camera is simply where it is going
    if (this.reduce) {
      this.view.at.jump(target.at);
      this.view.dir.jump(target.dir);
      this.view.dist.set(this.fit(target));
    }
    const at = this.view.at.update(dt);
    const dir = this.view.dir.update(dt).clone().normalize();
    const dist = this.view.dist.update(dt);
    this.parallax.lerp(this.push !== null || this.seated ? new THREE.Vector2() : this.pointer.clone().clampScalar(-1, 1), damp(2, dt));
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const visW = 2 * dist * tan * this.camera.aspect;
    const portrait = this.camera.aspect < 0.85;
    // the head column sits on the left: the subject sits right of it
    const look = at.clone().addScaledVector(right, portrait || this.push !== null || this.seated ? 0 : -visW * 0.12);
    if (portrait && !this.seated) look.addScaledVector(UP, 2 * dist * tan * 0.07);
    const camDir = dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, this.parallax.x * 0.02));
    camDir.y -= this.parallax.y * 0.012;
    this.camera.position.copy(look).addScaledVector(camDir.normalize(), dist);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }

  /* ---------------- the light on a page ---------------- */
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private v3 = new THREE.Vector3();
  private bestAt = new THREE.Vector3();

  /** Everything that reaches a point in the room: its colour sum, strength, and what share is lamps, street, moon and day. */
  private gather(p: THREE.Vector3) {
    let r = 0, g = 0, b = 0, lux = 0, lamps = 0, best = 0;
    const add = (c: THREE.Color, w: number, at: THREE.Vector3 | null) => {
      if (w <= 0) return 0;
      r += c.r * w;
      g += c.g * w;
      b += c.b * w;
      lux += w;
      if (at && w > best) {
        best = w;
        this.bestAt.copy(at);
      }
      return w;
    };
    const spot = (l: THREE.SpotLight) => {
      if (!l.visible || l.intensity <= 0) return 0;
      const pos = l.getWorldPosition(this.v1);
      const axis = l.target.getWorldPosition(this.v2).sub(pos).normalize();
      const to = this.v3.copy(p).sub(pos);
      const d = to.length();
      to.divideScalar(d || 1);
      const ca = Math.cos(l.angle);
      const cone = THREE.MathUtils.clamp((axis.dot(to) - ca) / Math.max(0.06, (1 - ca) * Math.max(0.3, l.penumbra)), 0, 1);
      return add(l.color, (l.intensity * cone) / (1 + d * d), pos);
    };
    const room = this.room;
    for (const pd of room.pendants) {
      lamps += spot(pd.light);
      if (pd.fill.intensity > 0) {
        const pos = pd.fill.getWorldPosition(this.v1);
        lamps += add(pd.fill.color, (pd.fill.intensity * 0.5) / (1 + pos.distanceToSquared(p)), pos);
      }
    }
    for (const d of room.desks) lamps += spot(d.light);
    for (const e of room.exams) lamps += spot(e.light);
    const street = add(room.street.color, room.street.intensity * 0.07, null);
    const moon = add(room.moon.color, room.moon.intensity * 0.75, null);
    const dayW = (this.hemi.intensity * 3 + (this.sun.visible ? this.sun.intensity * 0.6 : 0)) * (1 - this.rainK * 0.3);
    const day = add(this.sun.color, dayW, null);
    return { r, g, b, lux, lamps, street, moon, day, best };
  }

  /**
   * Add up what reaches the read point: every lamp by distance and by its
   * cone, the street lamp and the moon as a weak glow through the louvres,
   * and the day through the windows. Eased, and reported when it changes.
   */
  private reportPaper(dt: number) {
    const L = this.gather(this.readPoint!);
    const { r, g, b, lux, lamps, street, moon, day, best } = L;
    const p = this.readPoint!;
    // where the light comes from on the page: the brightest lamp, or the windows by day
    const from = day > best || !best ? this.v1.set(p.x, 2.6, AR.z0) : this.bestAt;
    const a = this.v2.copy(p).project(this.camera);
    const s = this.v3.copy(from).project(this.camera);
    let dx = s.x - a.x, dy = s.y - a.y;
    const n = Math.hypot(dx, dy) || 1;
    dx /= n;
    dy /= n;
    const k = damp(4.5, dt);
    const P = this.paperNow;
    const sum = lux || 1;
    P.r += (r / sum - P.r) * k;
    P.g += (g / sum - P.g) * k;
    P.bl += (b / sum - P.bl) * k;
    P.lux += (lux - P.lux) * k;
    P.lx += (0.5 + dx * 0.58 - P.lx) * k;
    P.ly += (0.5 - dy * 0.62 - P.ly) * k;
    P.lamps += (lamps / sum - P.lamps) * k;
    P.moon += (moon / sum - P.moon) * k;
    P.street += (street / sum - P.street) * k;
    P.day += (day / sum - P.day) * k;
    P.b = 1 - Math.exp(-P.lux / 2.4);
    const m = Math.max(P.r, P.g, P.bl, 1e-4);
    P.color = '#' + new THREE.Color(P.r / m, P.g / m, P.bl / m).getHexString();
    const key = [P.color, P.b.toFixed(2), P.lx.toFixed(2), P.ly.toFixed(2), P.lamps.toFixed(2)].join();
    if (key === this.paperSent) return;
    this.paperSent = key;
    this.on.paper?.({ color: P.color, b: P.b, lx: P.lx, ly: P.ly, lamps: P.lamps, moon: P.moon, street: P.street, day: P.day });
  }

  private sheetSent = ['', ''];
  /** Where a sheet in the room is on the screen, for the page that is laid over it. */
  private place(q: THREE.Vector3[], r: DOMRect): SheetPlace & { key: string } {
    const pts = q.map((v) => {
      const p = v.clone().project(this.camera);
      return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (0.5 - p.y * 0.5) * r.height] as [number, number];
    });
    const wide = q[0].distanceTo(q[1]), deep = q[0].distanceTo(q[3]);
    const w = PIN_W, h = Math.round((PIN_W * deep) / wide);
    // how the light falls across it: the same sum of lamps that lights the page, taken at the middle of each edge
    const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5).add(this.v1.set(0, 0.004, 0));
    const edges = [mid(q[0], q[1]), mid(q[3], q[2]), mid(q[0], q[3]), mid(q[1], q[2])];
    const shade = edges.map((e) => {
      const lit = 1 - Math.exp(-this.gather(e).lux / 2.4);
      return Math.min(0.6, (1 - lit) * 0.62);
    }) as [number, number, number, number];
    const key = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('|') + `|${h}|` + shade.map((v) => v.toFixed(2)).join();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return { pin: laidOver(w, h, pts), w, h, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], shade, key };
  }

  private reportSheet() {
    this.camera.updateMatrixWorld();
    const r = this.canvas.getBoundingClientRect();
    ([[false, this.on.sheet], [true, this.on.side]] as const).forEach(([side, cb], i) => {
      if (!cb) return;
      const q = this.seated && (!side || this.paired) ? this.room.sheetCorners(side) : null;
      if (!q) {
        if (this.sheetSent[i]) {
          this.sheetSent[i] = '';
          cb(null);
        }
        return;
      }
      const v = this.place(q, r);
      if (v.key === this.sheetSent[i]) return;
      this.sheetSent[i] = v.key;
      cb(v);
    });
  }

  /* ---------------- input ---------------- */
  private pick(x: number, y: number): Record<string, unknown> | null {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), this.camera);
    // up close at a drawer, only its files answer; a file is found only in a drawer that is out
    const hit = this.raycaster.intersectObjects(this.room.hits, false).find((h) => {
      const f = h.object.userData.file as string | undefined;
      if (this.drawer) return !!f && this.room.fileReachable(f);
      return !f;
    });
    return hit ? hit.object.userData : null;
  }

  private bind() {
    const c = this.canvas;
    this.host.addEventListener('pointermove', (e) => {
      if (!this.running) return;
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (e.target !== c) return;
      const p = this.pick(e.clientX, e.clientY);
      const key = (p?.key as string | undefined) ?? '';
      if (key === this.hoverKey) return;
      this.hoverKey = key;
      c.style.cursor = key ? 'pointer' : 'default';
      this.on.hover(key || null);
    });
    c.addEventListener('click', (e) => {
      if (!this.running) return;
      const p = this.pick(e.clientX, e.clientY);
      if (!p) return;
      if (typeof p.file === 'string') this.on.file(p.file);
      else if (typeof p.table === 'string') this.on.tableFile(p.table);
      else if (typeof p.cat === 'number') this.on.cabinet(p.cat);
      else if (typeof p.bank === 'number') this.on.bank(p.bank);
      else if (typeof p.rocker === 'number') this.on.rocker(p.rocker);
      else if (typeof p.desk === 'number') this.on.desk(p.desk);
      else if (typeof p.exam === 'number') this.on.exam(p.exam);
      else if (p.index) this.on.index();
      else if (p.tray) this.on.tray();
      else if (p.safe) this.on.safe();
      else if (p.dehumidifier) this.on.dehumidifier();
      else if (p.zone) this.goZone(p.zone as StacksZone);
    });
    new ResizeObserver(() => this.resize()).observe(c);
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.fov = w / h < 0.85 ? 30 : 19;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }
}
