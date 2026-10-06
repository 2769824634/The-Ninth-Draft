/**
 * The office slide projector, its trolley and its beam, at real size.
 *
 * A carousel projector of the late seventies: a two-tone housing, a round
 * eighty-slot tray on top that turns one slot per slide, the slide dropping
 * through the gate under it, a lens with a knurled focus ring, vents that
 * glow when the lamp is on, a rocker on the back, a threaded elevation foot
 * at the front. It stands on a chrome trolley behind the sofa and throws
 * over it onto the pull-down screen on the left wall.
 *
 * The picture is real light: a spotlight with the slide as its map, so it
 * lands on the screen (and on anything in the way) the way a projector's
 * would. A faint beam and the dust in it show only when the room is dark.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FH, FW, FX, FY, SLIDE_PX, TRAY } from './slides';
import type { SlideTray } from './trays';

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The little chrome plate on the front. */
function plateTexture() {
  return canvasTex(512, 96, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 96);
    grad.addColorStop(0, '#e6e6e2');
    grad.addColorStop(0.5, '#a9aaa7');
    grad.addColorStop(1, '#d4d4d0');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#1d1c1a';
    g.font = `700 40px ${MONO}`;
    g.fillText('RO-DS', 22, 62);
    g.font = `500 26px ${MONO}`;
    g.fillText('MODEL 80 · 1979', 168, 60);
  });
}

/** Lettering round the front of the lens. */
function lensRingTexture() {
  const S = 512;
  return canvasTex(S, S, (g) => {
    g.fillStyle = '#121212';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#d9d6cc';
    g.font = `500 34px ${MONO}`;
    g.textAlign = 'center';
    const text = 'PROJECTION  f/2.8  85 mm  ·  RO-DS  ·  ';
    const rho = S * 0.41;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 + (i / text.length) * Math.PI * 2;
      g.save();
      g.translate(S / 2 + Math.cos(a) * rho, S / 2 + Math.sin(a) * rho);
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
  });
}

/** Light along the beam: bright at the lens, thinning out, soft at the edges. */
function beamTexture() {
  return canvasTex(64, 256, (g) => {
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,240,210,1)');
    v.addColorStop(0.25, 'rgba(255,236,200,.55)');
    v.addColorStop(1, 'rgba(255,230,190,.18)');
    g.fillStyle = v;
    g.fillRect(0, 0, 64, 256);
    g.globalCompositeOperation = 'destination-in';
    const h = g.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,0)');
    h.addColorStop(0.2, 'rgba(0,0,0,1)');
    h.addColorStop(0.8, 'rgba(0,0,0,1)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = h;
    g.fillRect(0, 0, 64, 256);
  });
}

function dotTexture() {
  return canvasTex(32, 32, (g) => {
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  });
}

export interface ProjectorOpts {
  /** Where the trolley stands (floor), in room coordinates. */
  at: THREE.Vector3;
  /** Centre of the picture on the screen, and how wide the picture is. */
  aim: THREE.Vector3;
  width: number;
}

export class Projector {
  readonly group = new THREE.Group();
  /** Pointer target: the projector and its trolley. */
  readonly hit: THREE.Mesh;
  readonly spot: THREE.SpotLight;
  /** Lights and beam, to be added to the room's group (they are in room coordinates). */
  readonly lightParts: THREE.Object3D[];
  /** What the lamp shines through: redrawn when a slide changes. */
  private gate: HTMLCanvasElement;
  private gateTex: THREE.CanvasTexture;
  /** Where a tray sits on the projector, and the spot on the lower shelf where its box waits. */
  readonly seat = new THREE.Group();
  readonly shelfSpot = new THREE.Object3D();
  /** The tray on the projector, if any. */
  private mounted: SlideTray | null = null;
  private lensGlass: THREE.MeshStandardMaterial;
  private vents: THREE.MeshStandardMaterial;
  private pilot: THREE.MeshStandardMaterial;
  private beam: THREE.MeshBasicMaterial;
  private dust: THREE.Points;
  private dustSeed: Float32Array;
  private apex = new THREE.Vector3();
  private corners: THREE.Vector3[] = [];
  private trayAngle = 0;
  private trayTarget = 0;
  /** Which slot is down in the gate, and how far down (0 up in the tray, 1 in the gate). */
  private dropped = -1;
  private drop = 0;
  private dropTarget = 0;

  private m = {
    shell: new THREE.MeshStandardMaterial({ color: '#c9c2b0', roughness: 0.42, metalness: 0.05 }),
    base: new THREE.MeshStandardMaterial({ color: '#45423e', roughness: 0.55, metalness: 0.2 }),
    black: new THREE.MeshStandardMaterial({ color: '#151514', roughness: 0.38, metalness: 0.45 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#1c1b1a', roughness: 0.9 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d4d6d8', roughness: 0.16, metalness: 0.95 }),
    steel: new THREE.MeshStandardMaterial({ color: '#7d8083', roughness: 0.38, metalness: 0.7 }),
    smoke: new THREE.MeshStandardMaterial({ color: '#2a2724', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88 }),
  };

  constructor(o: ProjectorOpts) {
    this.group.position.copy(o.at);

    /* ---------- trolley ---------- */
    const W = 0.48, D = 0.4, TOP = 0.92;
    const leg = new THREE.CylinderGeometry(0.011, 0.011, TOP - 0.06, 14);
    for (const x of [-W / 2 + 0.02, W / 2 - 0.02])
      for (const z of [-D / 2 + 0.02, D / 2 - 0.02]) {
        const l = this.mesh(leg, this.m.chrome, x, 0.06 + (TOP - 0.06) / 2, z);
        l.castShadow = true;
        // caster: fork and wheel
        this.box(0.02, 0.03, 0.03, this.m.steel, x, 0.05, z);
        const wheel = this.mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 18), this.m.rubber, x + 0.008, 0.023, z);
        wheel.rotation.x = Math.PI / 2;
      }
    // top tray with a lip, a rubber mat; a lower shelf
    this.box(W, 0.012, D, this.m.steel, 0, TOP, 0);
    for (const z of [-D / 2, D / 2]) this.box(W, 0.03, 0.008, this.m.steel, 0, TOP + 0.015, z);
    for (const x of [-W / 2, W / 2]) this.box(0.008, 0.03, D, this.m.steel, x, TOP + 0.015, 0);
    this.box(W - 0.06, 0.004, D - 0.06, this.m.rubber, 0, TOP + 0.008, 0);
    this.box(W, 0.01, D, this.m.steel, 0, 0.26, 0);
    for (const x of [-W / 2, W / 2]) this.box(0.008, 0.02, D, this.m.steel, x, 0.27, 0);
    // the lower shelf is where the box of the tray on the projector waits
    this.shelfSpot.position.set(0, 0.265, 0);
    this.group.add(this.shelfSpot);

    /* ---------- the projector ---------- */
    const p = new THREE.Group();
    p.position.set(0.02, TOP + 0.012, 0);
    this.group.add(p);
    // aim: turn toward the screen, the front lifted on its foot
    const lensLocal = new THREE.Vector3(-0.29, 0.075, 0.035);
    const world = (v: THREE.Vector3) => v.clone().add(p.position).add(o.at);
    const flat = o.aim.clone().sub(world(lensLocal));
    const yaw = Math.atan2(flat.z, -flat.x);
    const pitch = Math.atan2(flat.y, Math.hypot(flat.x, flat.z));
    p.rotation.set(0, yaw, -pitch * 0.6, 'YXZ');

    // housing: dark base, two-tone shell, top deck
    this.round(0.3, 0.032, 0.27, 0.006, this.m.base, 0, 0.016, 0, p);
    this.round(0.3, 0.088, 0.268, 0.014, this.m.shell, 0, 0.074, 0, p);
    this.box(0.26, 0.004, 0.24, this.m.base, 0.01, 0.119, 0, p);
    // a groove where the two halves meet
    this.box(0.302, 0.003, 0.272, this.m.black, 0, 0.033, 0, p);
    // the round seat the tray turns on
    this.mesh(new THREE.CylinderGeometry(0.07, 0.074, 0.01, 40), this.m.black, 0.01, 0.125, 0, p);
    // front panel and lens mount
    this.box(0.004, 0.07, 0.22, this.m.base, -0.151, 0.068, 0, p);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.014), new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.25, metalness: 0.7 }));
    plate.rotation.y = -Math.PI / 2;
    plate.position.set(-0.1535, 0.05, -0.065);
    p.add(plate);
    const mount = this.mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 36), this.m.black, -0.157, lensLocal.y, lensLocal.z, p);
    mount.rotation.z = Math.PI / 2;

    // the lens: a turned barrel, a knurled focus ring, lettering, glass
    const prof = [
      [0, 0], [0.036, 0], [0.036, 0.01], [0.031, 0.013], [0.031, 0.026], [0.0335, 0.027], [0.0335, 0.06], [0.029, 0.062],
      [0.029, 0.112], [0.0315, 0.114], [0.0315, 0.126], [0.026, 0.128], [0, 0.128],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const barrel = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), this.m.black);
    barrel.castShadow = true;
    const lens = new THREE.Group();
    lens.position.set(-0.163, lensLocal.y, lensLocal.z);
    lens.rotation.z = Math.PI / 2;
    p.add(lens);
    lens.add(barrel);
    const knurl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0026, 0.03, 0.0024), this.m.black, 40);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      mm.makeRotationY(-a).setPosition(Math.cos(a) * 0.0345, 0.0435, Math.sin(a) * 0.0345);
      knurl.setMatrixAt(i, mm);
    }
    lens.add(knurl);
    const letters = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.0315, 48), new THREE.MeshStandardMaterial({ map: lensRingTexture(), roughness: 0.4, metalness: 0.3 }));
    letters.rotation.x = -Math.PI / 2;
    letters.position.y = 0.1265;
    lens.add(letters);
    this.lensGlass = new THREE.MeshStandardMaterial({ color: '#1b2430', roughness: 0.04, metalness: 0.3, emissive: '#ffe2b0', emissiveIntensity: 0 });
    const glass = new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 12, 0, Math.PI * 2, 0, 0.75), this.lensGlass);
    glass.scale.set(0.76, 0.3, 0.76);
    glass.position.y = 0.122;
    lens.add(glass);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0225, 0.0018, 8, 40), this.m.chrome);
    bezel.rotation.x = Math.PI / 2;
    bezel.position.y = 0.1275;
    lens.add(bezel);
    const apex = new THREE.Object3D();
    apex.position.y = 0.135;
    lens.add(apex);

    // vents on both sides, glowing a little when the lamp is on
    this.vents = new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.8, emissive: '#ff9a3c', emissiveIntensity: 0 });
    for (const side of [-1, 1])
      for (let i = 0; i < 11; i++) this.box(0.006, 0.046, 0.004, this.vents, 0.005 + i * 0.012, 0.075, side * 0.1345, p);
    // rear: grille, rocker (forward / reverse), power knob, pilot lamp, cord
    for (let i = 0; i < 6; i++) this.box(0.004, 0.004, 0.16, this.vents, 0.1505, 0.05 + i * 0.008, -0.02, p);
    this.box(0.008, 0.024, 0.036, this.m.black, 0.153, 0.085, 0.085, p);
    this.box(0.005, 0.01, 0.03, this.m.base, 0.156, 0.091, 0.085, p).rotation.z = 0.12;
    const knob = this.mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.012, 24), this.m.black, 0.157, 0.085, -0.075, p);
    knob.rotation.z = Math.PI / 2;
    this.box(0.002, 0.012, 0.002, this.m.chrome, 0.1635, 0.088, -0.075, p);
    this.pilot = new THREE.MeshStandardMaterial({ color: '#5a2a10', emissive: '#ff7a1a', emissiveIntensity: 0, roughness: 0.3 });
    this.mesh(new THREE.SphereGeometry(0.004, 12, 8), this.pilot, 0.152, 0.11, -0.11, p);
    const grommet = this.mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 12), this.m.rubber, 0.152, 0.03, 0.05, p);
    grommet.rotation.z = Math.PI / 2;
    // feet: two rubber pads at the back, a threaded foot and its wheel at the front
    for (const z of [-0.1, 0.1]) this.mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.008, 16), this.m.rubber, 0.12, -0.002, z, p);
    const footLen = 0.012 + Math.max(0, Math.sin(pitch * 0.6) * 0.27);
    this.mesh(new THREE.CylinderGeometry(0.004, 0.004, footLen, 10), this.m.chrome, -0.12, -footLen / 2 + 0.004, 0, p);
    this.mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.007, 24), this.m.black, -0.12, 0.006, 0, p);
    this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 16), this.m.rubber, -0.12, -footLen + 0.006, 0, p);
    // a carrying handle folded flat along the right side
    this.box(0.16, 0.006, 0.008, this.m.black, 0.0, 0.1, 0.138, p);

    /* ---------- the tray seat ---------- */
    this.seat.position.set(0.01, 0.131, 0);
    p.add(this.seat);

    /* ---------- the cord, off the back and down a leg ---------- */
    p.updateMatrix();
    const rear = new THREE.Vector3(0.16, 0.03, 0.05).applyMatrix4(p.matrix);
    const cord = new THREE.CatmullRomCurve3([
      rear,
      rear.clone().add(new THREE.Vector3(0.05, -0.03, 0.02)),
      new THREE.Vector3(W / 2 - 0.01, TOP - 0.05, D / 2 - 0.03),
      new THREE.Vector3(W / 2 - 0.015, 0.5, D / 2 - 0.02),
      new THREE.Vector3(W / 2 + 0.03, 0.01, D / 2 + 0.05),
      new THREE.Vector3(W / 2 + 0.4, 0.008, D / 2 + 0.35),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(cord, 60, 0.004, 8, false), this.m.rubber);
    cable.castShadow = true;
    this.group.add(cable);

    /* ---------- hit box ---------- */
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, TOP + 0.3, D + 0.05), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.set(0, (TOP + 0.3) / 2, 0);
    this.hit.userData.zone = 'projector';
    this.group.add(this.hit);

    /* ---------- the light ---------- */
    this.group.updateMatrixWorld(true);
    apex.getWorldPosition(this.apex);
    const dist = this.apex.distanceTo(o.aim);
    // the picture is 80 % of the lamp's square; the square is the cone's width
    const half = o.width / 0.8 / 2;
    this.gate = document.createElement('canvas');
    this.gate.width = this.gate.height = SLIDE_PX;
    const gg = this.gate.getContext('2d')!;
    gg.fillStyle = '#000';
    gg.fillRect(0, 0, SLIDE_PX, SLIDE_PX);
    this.gateTex = new THREE.CanvasTexture(this.gate);
    this.gateTex.colorSpace = THREE.SRGBColorSpace;
    this.spot = new THREE.SpotLight(0xfff0d8, 0, 0, Math.atan(half / dist), 0.02, 0);
    this.spot.position.copy(this.apex);
    this.spot.target.position.copy(o.aim);
    this.spot.map = this.gateTex;
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.05;
    this.spot.shadow.camera.far = dist + 1;
    this.spot.shadow.bias = -0.0005;
    this.spot.visible = false;

    // the beam: an open pyramid from the lens to the picture's corners
    const across = new THREE.Vector3().subVectors(o.aim, this.apex).normalize();
    const side = new THREE.Vector3().crossVectors(across, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(side, across).normalize();
    const hw = o.width / 2, hh = hw / 1.5;
    this.corners = [
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ].map(([a, b]) => o.aim.clone().addScaledVector(side, a * hw).addScaledVector(up, b * hh));
    const pos: number[] = [], uv: number[] = [];
    for (let i = 0; i < 4; i++) {
      const c0 = this.corners[i], c1 = this.corners[(i + 1) % 4];
      pos.push(...this.apex.toArray(), ...c0.toArray(), ...c1.toArray());
      uv.push(0.5, 0, 0, 1, 1, 1);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const bt = beamTexture();
    bt.flipY = false;
    this.beam = new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(bg, this.beam);
    beam.renderOrder = 5;
    beam.frustumCulled = false;

    // dust turning slowly in the beam
    const N = 160;
    this.dustSeed = new Float32Array(N * 4);
    for (let i = 0; i < N * 4; i++) this.dustSeed[i] = Math.random();
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: dotTexture(), size: 0.012, color: '#ffe9c4', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.dust.frustumCulled = false;

    // these live in room coordinates, not on the trolley
    this.lightParts = [this.spot, this.spot.target, beam, this.dust];
  }

  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }

  private box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, parent);
  }

  private round(w: number, h: number, d: number, r: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.group) {
    return this.mesh(new RoundedBoxGeometry(w, h, d, 3, r), m, x, y, z, parent);
  }

  /** A tray put on (or `null`: lifted off). It starts where it stands. */
  mount(t: SlideTray | null) {
    this.mounted = t;
    this.trayAngle = this.trayTarget = t ? t.rotor.rotation.y : 0;
    this.dropped = -1;
    this.drop = this.dropTarget = 0;
    t?.place(-1, 0);
  }

  get tray() {
    return this.mounted;
  }

  private placeMounts() {
    this.mounted?.place(this.dropped, this.drop);
  }

  /** Back to the empty slot before the tray can come off. */
  home() {
    this.trayTarget = Math.PI - (1 / TRAY) * Math.PI * 2;
  }

  /** Turn the tray so slot `i` is over the gate. */
  turnTo(i: number) {
    // the gate is at angle π (toward the lens); slot i must come round to it
    this.trayTarget = Math.PI + (i / TRAY) * Math.PI * 2;
  }

  /** Let slot `i` fall into the gate (or lift it back with `down` false). */
  setDrop(i: number, down: boolean) {
    if (i !== this.dropped && down) {
      this.dropped = i;
      this.drop = 0;
    }
    this.dropTarget = down ? 1 : 0;
  }

  /** What the lamp shines through. `blur` px softens it (the moment before focus settles). */
  setGate(src: HTMLCanvasElement | null | 'open', blur = 0) {
    const g = this.gate.getContext('2d')!;
    g.filter = 'none';
    g.fillStyle = '#000';
    g.fillRect(0, 0, SLIDE_PX, SLIDE_PX);
    if (src === 'open') {
      // nothing in the gate: the lamp itself, a white oblong with soft corners
      g.fillStyle = '#fffaf0';
      g.beginPath();
      g.roundRect(FX, FY, FW, FH, 14);
      g.fill();
    } else if (src) {
      g.filter = blur ? `blur(${blur}px)` : 'none';
      g.drawImage(src, 0, 0);
      g.filter = 'none';
    }
    this.gateTex.needsUpdate = true;
  }

  /** Per frame. `lamp` 0..1 is the bulb, `dark` 0..1 how dark the room is. */
  tick(dt: number, t: number, lamp: number, dark: number) {
    // the tray turns the short way, briskly, and settles
    let d = this.trayTarget - this.trayAngle;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.trayAngle += d * Math.min(1, dt * 9);
    if (this.mounted) this.mounted.rotor.rotation.y = this.trayAngle;
    if (Math.abs(this.drop - this.dropTarget) > 0.001) {
      this.drop += (this.dropTarget - this.drop) * Math.min(1, dt * 14);
      this.placeMounts();
    }
    // an incandescent lamp breathes a little
    const flicker = 1 + Math.sin(t * 47) * 0.012 + Math.sin(t * 13.3) * 0.01;
    this.spot.intensity = lamp * 9 * flicker;
    this.spot.visible = lamp > 0.01;
    this.lensGlass.emissiveIntensity = lamp * 1.4;
    this.vents.emissiveIntensity = lamp * 0.35;
    this.pilot.emissiveIntensity = lamp > 0.01 ? 1.6 : 0;
    this.beam.opacity = lamp * (0.012 + dark * 0.09);
    const dm = this.dust.material as THREE.PointsMaterial;
    dm.opacity = lamp * dark * 0.5;
    if (dm.opacity > 0.01) {
      const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      const c = this.corners, s = this.dustSeed;
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const k = (s[i * 4] + t * 0.004 * (0.5 + s[i * 4 + 3])) % 1;
        const along = 0.08 + k * 0.88;
        const u = 0.5 + 0.45 * Math.sin(t * 0.07 * (s[i * 4 + 1] + 0.3) + s[i * 4 + 2] * 40);
        const v = 0.5 + 0.45 * Math.sin(t * 0.05 * (s[i * 4 + 2] + 0.3) + s[i * 4 + 1] * 40);
        const top = c[3].clone().lerp(c[2], u), bot = c[0].clone().lerp(c[1], u);
        p.copy(bot.lerp(top, v));
        p.lerp(this.apex, 1 - along);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
    }
  }
}
