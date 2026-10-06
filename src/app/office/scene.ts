/**
 * The office as a cutaway model on the page, under the same long lens as the
 * drawer room and the library. The camera moves between the whole room and
 * its corners: the desk (where the computer's screen is a live page laid on
 * the glass with CSS3D), the sofa (sitting down, facing the pulled-down
 * screen), and the wall with its notice board and clock.
 *
 * Daylight enters only through the basement window and its blind; at night
 * the desk lamp, the standard lamp, the screen and the street lamp outside
 * light the room.
 */
import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Spring, SpringV3, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { Room, R, SCREEN, WIN, DECK_DIR, SOFA_DIR, TRAY_HOLD } from './room';
import type { ShelfTape, Well } from './cassettes';
import type { TrayInfo } from './trays';

export type Zone = 'overview' | 'desk' | 'sofa' | 'wall' | 'deck';
export const ZONES: Zone[] = ['overview', 'desk', 'sofa', 'wall', 'deck'];

/** What the cassette deck is doing, read every frame. */
export interface DeckView {
  spin: Record<Well, number>;
  level: number;
  counter: number;
}

export interface OfficeEvents {
  zone(z: Zone): void;
  hover(label: string | null): void;
  notice(slug: string): void;
  clock(): void;
  /** The deck itself clicked while standing at it. */
  deck(): void;
  /** A tape in the rack (or in a well) clicked. */
  tape(id: string): void;
  /** At the sofa: the projector, or the screen, clicked. */
  projector(): void;
  screen(): void;
  /** A slide-tray box in the crate clicked. */
  trayBox(id: string): void;
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
  desk: number;
  floor: number;
  crt: number;
  street: number;
  night: number;
}
const LOOKS: Record<'day' | 'night', Look> = {
  day: { hemi: 0.75, sun: 4.2, env: 0.35, desk: 1.2, floor: 0, crt: 0.15, street: 0, night: 0 },
  night: { hemi: 0.05, sun: 0, env: 0.04, desk: 5, floor: 2.6, crt: 0.6, street: 9, night: 1 },
};

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class OfficeScene {
  private renderer: THREE.WebGLRenderer;
  private css: CSS3DRenderer;
  private scene = new THREE.Scene();
  private cssScene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(19, 1, 0.1, 200);
  private hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a8070, 1);
  private sun = new THREE.DirectionalLight(0xfff1d8, 4);
  private shadowMat: THREE.MeshBasicMaterial;
  readonly room: Room;
  private screenObj: CSS3DObject;

  private zoneNow: Zone = 'overview';
  private view: { at: SpringV3; dir: SpringV3; dist: Spring };
  private parallax = new THREE.Vector2();
  private pointer = new THREE.Vector2(9, 9);
  private raycaster = new THREE.Raycaster();
  private hoverKey = '';
  private screenOn = new Spring(1, 6);

  private look: Look = { ...LOOKS.day };
  private lookTarget = LOOKS.day;
  private reduce = reducedMotion();
  private last = performance.now();
  private t0 = performance.now();
  private clockOffset = 0;
  deckView: DeckView = { spin: { A: 0, B: 0 }, level: 0, counter: 0 };
  /** A tape held up to be read: the camera closes in on it. */
  holding = false;
  /** The projector's lamp (on/off) and whether the room lights are down for it. */
  lampOn = false;
  /** A slide box held up to be read, or a tray going onto (or off) the projector: the camera follows. */
  trayView: 'hold' | 'load' | null = null;
  lightsDown = false;
  private lamp = 0;
  private dim = new Spring(0, 1.6);

  constructor(private host: HTMLElement, private canvas: HTMLCanvasElement, screenEl: HTMLElement, records: ConstructorParameters<typeof Room>[0], private on: OfficeEvents, tapes: ShelfTape[] = [], trays: TrayInfo[] = [], zh = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.room = new Room(records, tapes, reducedMotion(), trays, zh);
    this.scene.add(this.room.group);

    // a soft contact shadow where the model sits on the paper
    const sh = document.createElement('canvas');
    sh.width = sh.height = 256;
    const g = sh.getContext('2d')!;
    g.filter = 'blur(14px)';
    g.fillStyle = '#000';
    g.fillRect(34, 40, 188, 176);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry((R.x1 - R.x0) * 1.45, (R.z1 - R.z0) * 1.5), this.shadowMat);
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(0.4, -R.slab - 0.01, 0.7);
    this.scene.add(paper);

    // daylight, low through the window and the slats of the blind
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.01;
    const sc = this.sun.shadow.camera;
    sc.left = -7;
    sc.right = 7;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 40;
    const sunDir = new THREE.Vector3(0.22, -0.52, 0.82).normalize();
    const winC = new THREE.Vector3((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, R.z0);
    this.sun.position.copy(winC).addScaledVector(sunDir, -18);
    this.sun.target.position.copy(winC).addScaledVector(sunDir, 3);
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // the computer's screen: a live page laid on the glass
    this.css = new CSS3DRenderer();
    this.css.domElement.className = 'of__css';
    host.append(this.css.domElement);
    this.screenObj = new CSS3DObject(screenEl);
    const px = screenEl.offsetWidth || 480;
    this.screenObj.scale.setScalar(SCREEN.w / px);
    this.cssScene.add(this.screenObj);

    const v = this.viewOf('overview');
    this.view = { at: new SpringV3(v.at.clone(), 3), dir: new SpringV3(v.dir.clone(), 3), dist: new Spring(60, 3) };
    this.bind();
    this.resize();
    this.view.dist.set(this.fit(v));
    this.loop();
  }

  /* ---------------- views ---------------- */
  private screenCentre() {
    this.room.group.updateMatrixWorld(true);
    return new THREE.Vector3().setFromMatrixPosition(this.room.screenAnchor.matrixWorld);
  }

  private viewOf(z: Zone): View {
    switch (z) {
      case 'desk':
        return { at: this.screenCentre(), dir: new THREE.Vector3(0.05, 0.08, 1).normalize(), w: SCREEN.w * 1.7, h: SCREEN.h * 1.6 };
      case 'sofa':
        // sitting down: the sofa's back at the bottom of the frame, the screen ahead
        if (this.trayView === 'hold') return { at: TRAY_HOLD.clone(), dir: SOFA_DIR.clone(), w: 0.62, h: 0.42 };
        if (this.trayView === 'load') return { at: new THREE.Vector3(1.3, 0.62, 0.55), dir: new THREE.Vector3(-0.42, 0.8, -0.45).normalize(), w: 1.4, h: 1.15 };
        return { at: new THREE.Vector3(R.x0 + 1.1, 1.38, 0.7), dir: SOFA_DIR.clone(), w: 3.3, h: 2.1 };
      case 'deck':
        if (this.holding) return { at: this.room.holdPoint(), dir: DECK_DIR.clone(), w: 0.3, h: 0.17 };
        return { at: new THREE.Vector3(-1.84, 0.93, -2.12), dir: DECK_DIR.clone(), w: 1.25, h: 0.5 };
      case 'wall':
        return { at: new THREE.Vector3(R.x0, 1.55, -1.05), dir: new THREE.Vector3(1, 0.16, 0.1).normalize(), w: 2.4, h: 1.35 };
      default:
        return { at: new THREE.Vector3(0, 0.9, 0.1), dir: new THREE.Vector3(7.2, 8.6, 12).normalize(), w: 9.6, h: 6.2 };
    }
  }

  private fit(v: View) {
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const portrait = this.camera.aspect < 0.85;
    const fw = portrait ? 0.96 : 0.68, fh = portrait ? 0.5 : 0.8;
    return Math.max(v.h / (fh * 2 * tan), v.w / (fw * 2 * tan * this.camera.aspect));
  }

  goZone(z: Zone) {
    if (z === this.zoneNow) return;
    this.zoneNow = z;
    this.on.zone(z);
  }

  get zone() {
    return this.zoneNow;
  }

  setTheme(theme: 'day' | 'night') {
    this.lookTarget = LOOKS[theme];
  }

  /** The monitor switched off (LOGOUT) or back on. */
  power(on: boolean) {
    this.screenOn.target = on ? 1 : 0;
  }

  setClock(offset: number, label: string) {
    this.clockOffset = offset;
    this.room.setClockLabel(label);
  }

  /* ---------------- frame ---------------- */
  private loop() {
    const step = () => {
      requestAnimationFrame(step);
      if (!document.hidden) this.frame();
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
    const on = this.screenOn.update(dt);
    // a slide show wants the room dark: lamps down, the blind's light too
    this.dim.target = this.lampOn && this.lightsDown ? 1 : 0;
    const dim = this.dim.update(dt);
    this.lamp += ((this.lampOn ? 1 : 0) - this.lamp) * Math.min(1, dt * (this.lampOn ? 3.2 : 5));
    this.hemi.intensity = L.hemi * (1 - dim * 0.82);
    this.sun.intensity = L.sun * (1 - dim * 0.8);
    this.sun.visible = this.sun.intensity > 0.05;
    this.scene.environmentIntensity = L.env * (1 - dim * 0.8);
    this.shadowMat.opacity = 0.3 + L.night * 0.35;
    const r = this.room;
    r.deskLamp.intensity = L.desk * (1 - dim * 0.75);
    r.floorLamp.intensity = L.floor * (1 - dim);
    r.floorLamp.visible = r.floorLamp.intensity > 0.05;
    r.crtGlow.intensity = L.crt * on;
    r.street.intensity = L.street;
    r.street.visible = L.street > 0.1;
    r.nightView.opacity = L.night;
    r.lampShades[0].emissiveIntensity = 0.2 + L.night * 1.2;
    r.lampShades[1].emissiveIntensity = L.night * 1.1 * (1 - dim);
    r.projector.tick(dt, t, this.lamp, Math.max(dim, L.night * 0.6));
    r.screenMat.emissiveIntensity = 0.15 + on * (0.5 + L.night * 0.8);
    r.tick(t, dt);
    const dv = this.deckView;
    r.deckTick(dt, dv.spin, dv.level, dv.counter);
    r.setClock(new Date(), this.clockOffset);

    // camera
    const target = this.viewOf(this.zoneNow);
    this.view.at.setTarget(target.at);
    this.view.dir.setTarget(target.dir);
    this.view.dist.target = this.fit(target);
    const at = this.view.at.update(dt);
    const dir = this.view.dir.update(dt).clone().normalize();
    const dist = this.view.dist.update(dt);
    this.parallax.lerp(this.pointer.clone().clampScalar(-1, 1).multiplyScalar(this.zoneNow === 'desk' ? 0.15 : 1), damp(2, dt));
    const right = new THREE.Vector3().crossVectors(UP, dir).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const visW = 2 * dist * tan * this.camera.aspect;
    const portrait = this.camera.aspect < 0.85;
    // the head column sits on the left: the subject sits right of it
    const look = at.clone().addScaledVector(right, portrait ? 0 : -visW * 0.12);
    // on a phone the tape rack covers the bottom of the screen: the deck sits higher
    if (portrait) look.addScaledVector(UP, this.zoneNow === 'overview' ? -2 * dist * tan * 0.1 : this.zoneNow === 'deck' ? -2 * dist * tan * 0.24 : this.zoneNow === 'sofa' && this.trayView ? -2 * dist * tan * 0.1 : 0);
    const camDir = dir.clone().applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, this.parallax.x * 0.02));
    camDir.y -= this.parallax.y * 0.012;
    this.camera.position.copy(look).addScaledVector(camDir.normalize(), dist);
    this.camera.lookAt(look);
    this.camera.updateMatrixWorld();

    // the live screen rides on the glass; seen only from the front
    const anchor = r.screenAnchor;
    anchor.updateMatrixWorld();
    anchor.matrixWorld.decompose(this.screenObj.position, this.screenObj.quaternion, new THREE.Vector3());
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(this.screenObj.quaternion).dot(this.camera.position.clone().sub(this.screenObj.position).normalize());
    const show = (this.zoneNow === 'desk' || this.zoneNow === 'overview') && facing > 0.2;
    this.screenObj.element.style.opacity = String(show ? smooth(0.2, 0.5, facing) * on : 0);
    this.screenObj.element.style.pointerEvents = this.zoneNow === 'desk' && on > 0.5 ? 'auto' : 'none';

    this.renderer.render(this.scene, this.camera);
    this.css.render(this.cssScene, this.camera);
  }

  /* ---------------- input ---------------- */
  private pick(x: number, y: number): { zone?: Zone; notice?: string; clock?: boolean; deck?: boolean; tape?: string; projector?: boolean; screen?: boolean; trayBox?: string } | null {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), this.camera);
    const targets: THREE.Object3D[] = [];
    const hits = this.room.hits;
    if (this.zoneNow === 'wall') targets.push(...this.room.notices.map((n) => n.mesh));
    targets.push(hits.clock);
    // at the deck: the tapes, and the deck itself (play / stop)
    if (this.zoneNow === 'deck') targets.push(...this.room.shelf.meshes, hits.deckBody);
    if (this.zoneNow === 'sofa') targets.push(...this.room.crate.meshes, hits.projector, hits.screen);
    for (const z of ['desk', 'sofa', 'wall', 'deck'] as const) if (z !== this.zoneNow) targets.push(hits[z]);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const u = hit.object.userData;
    if (u.notice) return { notice: u.notice as string };
    if (u.tape) return { tape: u.tape as string };
    if (u.trayBox) return { trayBox: u.trayBox as string };
    if (u.zone === 'deckBody') return { deck: true };
    if (u.zone === 'projector') return { projector: true };
    if (u.zone === 'screen') return { screen: true };
    if (u.zone === 'clock') return { clock: true };
    if (u.zone) return { zone: u.zone as Zone };
    return null;
  }

  private bind() {
    const c = this.canvas;
    const target = this.host;
    target.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if ((e.target as HTMLElement).closest('.pc')) return;
      const p = this.pick(e.clientX, e.clientY);
      const key = p ? p.notice ?? (p.tape ? `tape:${p.tape}` : p.trayBox ? `tray:${p.trayBox}` : p.deck ? 'deck-play' : p.projector ? 'projector' : p.screen ? 'screen' : p.zone) ?? 'clock' : '';
      if (key === this.hoverKey) return;
      this.hoverKey = key;
      this.room.shelf.setHover(p?.tape ?? null);
      this.room.crate.setHover(p?.trayBox ?? null);
      c.style.cursor = p ? 'pointer' : 'default';
      this.on.hover(p ? key : null);
    });
    target.addEventListener('click', (e) => {
      // a button the click just re-rendered away is no longer in the page: not a click on the room
      if (!(e.target as HTMLElement).isConnected || (e.target as HTMLElement).closest('.pc, .lib__head, .lib__foot')) return;
      const p = this.pick(e.clientX, e.clientY);
      if (!p) return;
      if (p.notice) this.on.notice(p.notice);
      else if (p.clock) this.on.clock();
      else if (p.deck) this.on.deck();
      else if (p.tape) this.on.tape(p.tape);
      else if (p.trayBox) this.on.trayBox(p.trayBox);
      else if (p.projector) this.on.projector();
      else if (p.screen) this.on.screen();
      else if (p.zone) this.goZone(p.zone);
    });
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.css.setSize(w, h);
    this.camera.fov = w / h < 0.85 ? 30 : 19;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    void this.reduce;
  }
}
