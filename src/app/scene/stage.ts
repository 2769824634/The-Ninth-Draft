/**
 * The archive room: banks of steel drawers full of record folders, shot with a
 * long lens. All motion runs on critically damped springs — nothing cuts.
 */
import * as THREE from 'three';
import type { ArchiveData, ArchiveRecord } from '../types';
import { Spring, SpringV3, damp } from '../spring';
import { reducedMotion } from '../prefs';
import { FOLDER, Folder, fillerGeometry } from './folder';
import { drawerLabel, MANILA, plainTexture, setMaxAnisotropy } from './textures';

const COL = 4.3; // drawer spacing on X
const SP = 0.17; // folder spacing inside a drawer
const FRONT = -0.55; // first slot, behind the drawer front
const SIDE_BANKS = 3; // filler drawers on each side
const FILLERS = 38; // filler folders behind the records
const RISE = 1.62;

const LOOK_DIR = new THREE.Vector3(7.2, 8.6, 12).normalize();
const CAM_DIST = 42;

interface Look {
  bg: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemi: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  sun: number;
  sunColor: THREE.Color;
  lamp: number;
  shadow: number;
  dust: number;
  metal: THREE.Color;
}

const LOOKS: Record<'day' | 'night', Look> = {
  day: {
    bg: new THREE.Color('#e4e3de'),
    fogNear: 38, fogFar: 86,
    hemi: 1.55, hemiSky: new THREE.Color('#ffffff'), hemiGround: new THREE.Color('#b9b4a8'),
    sun: 2.3, sunColor: new THREE.Color('#fff7ea'),
    lamp: 0,
    shadow: 0.16,
    dust: 0.22,
    metal: new THREE.Color('#b9bab5'),
  },
  night: {
    bg: new THREE.Color('#0c0d0f'),
    fogNear: 34, fogFar: 62,
    hemi: 0.14, hemiSky: new THREE.Color('#7f8fb0'), hemiGround: new THREE.Color('#1a1712'),
    sun: 0.22, sunColor: new THREE.Color('#9fb2d8'),
    lamp: 260,
    shadow: 0.55,
    dust: 0.75,
    metal: new THREE.Color('#8a8c8b'),
  },
};

export interface StageEvents {
  hover(rec: ArchiveRecord | null): void;
  pick(rec: ArchiveRecord): void;
  scrub(step: number): void;
}

export class Stage {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(19, 1, 0.5, 200);
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private lamp: THREE.SpotLight;
  private floorMat: THREE.ShadowMaterial;
  private metalMat: THREE.MeshStandardMaterial;
  private dust: THREE.Points;
  private dustMat: THREE.PointsMaterial;

  private folders = new Map<string, Folder>();
  private columns: Folder[][] = [];
  private hitList: THREE.Object3D[] = [];

  private col = 0;
  private sel: number[] = [];
  private active: Folder | null = null; // folder in inspection
  private hovered: Folder | null = null;
  private mode: 'browse' | 'detail' = 'browse';

  private target = new SpringV3(new THREE.Vector3(), 3.6);
  private parallax = new THREE.Vector2();
  private pointer = new THREE.Vector2(9, 9);
  private raycaster = new THREE.Raycaster();
  private yaw = new Spring(0, 5);
  private pitch = new Spring(0, 5);
  private lampScale = new Spring(1, 3);
  private lampTint = new THREE.Color('#ffd29a');
  private fogNear = new Spring(38, 3);
  private fogFar = new Spring(86, 3);

  private look: Look = {
    ...LOOKS.day,
    bg: LOOKS.day.bg.clone(),
    hemiSky: LOOKS.day.hemiSky.clone(),
    hemiGround: LOOKS.day.hemiGround.clone(),
    sunColor: LOOKS.day.sunColor.clone(),
    metal: LOOKS.day.metal.clone(),
  };
  private lookTarget: Look = LOOKS.day;

  private last = 0;
  private elapsed = 0;
  private raf = 0;
  private frameTimes: number[] = [];
  private pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  private drag = { on: false, x: 0, y: 0, moved: 0, acc: 0 };
  private openTimer = 0;
  private paused = false;

  constructor(private canvas: HTMLCanvasElement, private data: ArchiveData, private on: StageEvents) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAnisotropy(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene.fog = new THREE.Fog(this.look.bg, 30, 74);

    // Lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb9b4a8, 1.5);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 14; sc.bottom = -14; sc.near = 1; sc.far = 60;
    this.lamp = new THREE.SpotLight(0xffd29a, 0, 26, 0.42, 0.85, 1.6);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.bias = -0.0006;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.lamp, this.lamp.target);

    // Floor that only shows shadows (the page background shows through)
    this.floorMat = new THREE.ShadowMaterial({ opacity: 0.16 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.metalMat = new THREE.MeshStandardMaterial({ color: this.look.metal, metalness: 0.35, roughness: 0.5 });

    this.build();
    this.dustMat = new THREE.PointsMaterial({ color: 0xfff1d6, size: 0.03, transparent: true, opacity: 0.22, depthWrite: false });
    this.dust = this.makeDust();
    this.scene.add(this.dust);

    this.bind();
    this.resize();
    this.snap();
  }

  /* ------------------------------------------------------------------ */
  /* Construction                                                        */
  /* ------------------------------------------------------------------ */
  private build() {
    const cats = this.data.categories;
    const longest = Math.max(1, ...cats.map((c) => this.data.records.filter((r) => r.category === c.id).length));
    const slots = longest + FILLERS;
    const length = -FRONT + slots * SP + 0.6;

    const fillerMatrices: THREE.Matrix4[][] = [[], [], []];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const lean = (a: number) => q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);

    for (let c = -SIDE_BANKS; c < cats.length + SIDE_BANKS; c++) {
      const x = c * COL;
      const cat = cats[c];
      const recs = cat ? this.data.records.filter((r) => r.category === cat.id) : [];
      this.buildDrawer(x, length, cat ? { no: `Drawer ${String(c + 1).padStart(2, '0')}`, name: cat.label, range: recs.length ? `${recs[0].file} — ${recs[recs.length - 1].file}` : 'Empty' } : null, c);

      if (cat) {
        const col: Folder[] = [];
        recs.forEach((rec, i) => {
          const f = new Folder(rec, i, i % 3);
          f.slot.set(x, 0.05, FRONT - i * SP);
          f.place(f.slot, new THREE.Quaternion());
          this.scene.add(f.group);
          this.folders.set(rec.file, f);
          this.hitList.push(...f.hit);
          col.push(f);
        });
        this.columns.push(col);
        this.sel.push(0);
      }

      // Fillers behind (or instead of) records
      const start = recs.length;
      const count = cat ? FILLERS : slots;
      for (let k = 0; k < count; k++) {
        const i = start + k;
        p.set(x, 0.05, FRONT - i * SP - 0.02);
        lean(-0.05 - Math.sin(i * 12.9898 + c * 78.233) * 0.025);
        m.compose(p, q, s);
        fillerMatrices[(((i + c) % 3) + 3) % 3].push(m.clone());
      }
    }

    // Instanced fillers
    const geo = fillerGeometry();
    const fillerMat = new THREE.MeshStandardMaterial({ map: plainTexture(MANILA, 9), roughness: 0.92 });
    const all = fillerMatrices.flat();
    const bodies = new THREE.InstancedMesh(geo.body, fillerMat, all.length);
    const tint = new THREE.Color();
    all.forEach((mat, i) => {
      bodies.setMatrixAt(i, mat);
      const v = 0.9 + ((i * 7919) % 100) / 1000;
      bodies.setColorAt(i, tint.setRGB(v, v * 0.995, v * 0.98));
    });
    bodies.castShadow = bodies.receiveShadow = true;
    this.scene.add(bodies);
    fillerMatrices.forEach((list, slot) => {
      const tabs = new THREE.InstancedMesh(geo.tabs[slot], fillerMat, list.length);
      list.forEach((mat, i) => tabs.setMatrixAt(i, mat));
      tabs.castShadow = true;
      this.scene.add(tabs);
    });
  }

  private buildDrawer(x: number, length: number, label: { no: string; name: string; range: string } | null, c: number) {
    const g = new THREE.Group();
    const w = FOLDER.w + 0.36;
    const wallH = 0.92;
    const t = 0.04;
    const mk = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, mat: THREE.Material = this.metalMat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    mk(w, t, length, 0, t / 2, -length / 2 + 0.1); // floor
    mk(t, wallH, length, -w / 2, wallH / 2, -length / 2 + 0.1); // left wall
    mk(t, wallH, length, w / 2, wallH / 2, -length / 2 + 0.1); // right wall
    mk(w, wallH * 0.7, t, 0, wallH * 0.35, -length + 0.1); // back
    // Drawer front panel
    const frontH = 1.32;
    mk(w + 0.12, frontH, 0.09, 0, frontH / 2, 0.15);
    // handle
    mk(0.9, 0.05, 0.05, 0, frontH * 0.36, 0.26);
    mk(0.05, 0.05, 0.1, -0.43, frontH * 0.36, 0.22);
    mk(0.05, 0.05, 0.1, 0.43, frontH * 0.36, 0.22);
    // card holder + label
    const holder = mk(1.18, 0.5, 0.02, 0, frontH * 0.72, 0.2);
    holder.castShadow = false;
    if (label) {
      const lm = new THREE.MeshStandardMaterial({ map: drawerLabel(label.no, label.name, label.range), roughness: 0.85 });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.42), lm);
      card.position.set(0, frontH * 0.72, 0.212);
      g.add(card);
    } else {
      const blank = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.42), new THREE.MeshStandardMaterial({ color: '#e9e3d2', roughness: 0.9 }));
      blank.position.set(0, frontH * 0.72, 0.212);
      g.add(blank);
    }
    g.position.set(x, 0, 0.4 * Math.sin(c * 1.7)); // slight stagger: drawers pulled out by different amounts
    this.scene.add(g);
  }

  private makeDust() {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.random() * 6;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, this.dustMat);
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */
  get columnCount() {
    return this.columns.length;
  }

  focus(colIndex: number, selIndex: number) {
    this.col = colIndex;
    this.sel[colIndex] = selIndex;
    this.layout();
  }

  /** Open the inspection view on a record. */
  inspect(rec: ArchiveRecord) {
    const f = this.folders.get(rec.file);
    if (!f) return;
    const prev = this.active;
    this.mode = 'detail';
    this.active = f;
    this.yaw.target = 0;
    this.pitch.target = 0;
    this.fogNear.target = 22;
    this.fogFar.target = 50;
    this.lampScale.target = 0.42;
    if (prev && prev !== f) {
      prev.open.target = 0;
      prev.quatOmega = 7;
    }
    void f.preparePage();
    f.pos.omega = 5.2;
    f.quatOmega = 6;
    window.clearTimeout(this.openTimer);
    f.open.target = 0;
    this.openTimer = window.setTimeout(() => {
      if (this.active === f) f.open.target = 1;
    }, reducedMotion() ? 0 : 520);
    this.layout();
  }

  /** Return to browsing. */
  release() {
    const f = this.active;
    this.mode = 'browse';
    this.active = null;
    this.lampScale.target = 1;
    this.fogNear.target = this.lookTarget.fogNear;
    this.fogFar.target = this.lookTarget.fogFar;
    window.clearTimeout(this.openTimer);
    if (f) {
      f.open.target = 0;
      f.pos.omega = 4.6;
      f.quatOmega = 5;
      // Hold position while the cover closes, then slide home.
      this.openTimer = window.setTimeout(() => this.layout(), reducedMotion() ? 0 : 300);
    }
    this.layout(f ?? undefined);
  }

  /** Tint the night lamp toward the current record's clearance colour. */
  setClearance(hex: string) {
    this.lampTint.set('#ffd29a').lerp(new THREE.Color(hex), 0.22);
  }

  setTheme(theme: 'day' | 'night') {
    this.lookTarget = LOOKS[theme];
    if (this.mode === 'browse') {
      this.fogNear.target = this.lookTarget.fogNear;
      this.fogFar.target = this.lookTarget.fogFar;
    }
  }

  /** Stop drawing while another room is on screen. */
  pause() {
    this.paused = true;
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.paused) this.frame();
    };
    this.last = performance.now();
    loop();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(this.raf);
      else {
        this.last = performance.now();
        loop();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Layout: compute every folder's target pose                          */
  /* ------------------------------------------------------------------ */
  private layout(hold?: Folder) {
    const q = new THREE.Quaternion();
    const axisX = new THREE.Vector3(1, 0, 0);

    this.columns.forEach((col, ci) => {
      const s = this.sel[ci];
      const isCol = ci === this.col;
      col.forEach((f, k) => {
        if (f === this.active || f === hold) return;
        let lean = -0.04;
        let rise = 0;
        let dz = 0;
        if (isCol) {
          if (k < s) {
            lean = 0.62 - Math.min(0.14, (s - k - 1) * 0.045);
            dz = 0.2;
          } else if (k === s) {
            lean = 0;
            rise = RISE;
          } else {
            lean = -0.08;
            dz = -0.05;
          }
          if (f === this.hovered && k !== s) rise += 0.16;
        }
        f.pos.setTarget(new THREE.Vector3(f.slot.x, f.slot.y + rise, f.slot.z + dz));
        f.targetQuat.copy(q.setFromAxisAngle(axisX, lean));
        f.pos.omega = 7.5;
        f.quatOmega = 9;
      });
    });

    // Camera glides to the selected folder of the current column
    const cur = this.columns[this.col]?.[this.sel[this.col]];
    const base = cur ? cur.slot.clone() : new THREE.Vector3(this.col * COL, 0, FRONT);
    base.y += FOLDER.h * 0.62 + (cur ? RISE * 0.5 : 0);
    this.target.setTarget(base);
  }

  /** Jump camera without animation (first frame). */
  private snap() {
    this.layout();
    this.target.jump(new THREE.Vector3(this.target.x.target, this.target.y.target, this.target.z.target));
    this.columns.forEach((col) => col.forEach((f) => {
      f.pos.jump(new THREE.Vector3(f.pos.x.target, f.pos.y.target, f.pos.z.target));
      f.quat.copy(f.targetQuat);
    }));
  }

  /** Pose for the folder under inspection, in front of the camera. */
  private inspectPose(f: Folder) {
    const portrait = this.camera.aspect < 1;
    const { w, h } = FOLDER;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // Open spread is about two folder widths. Fit it to ~46% of the screen width (landscape).
    const spread = w * 1.95;
    const share = portrait ? 0.92 : 0.46;
    let d = spread / (share * 2 * tan * this.camera.aspect);
    d = Math.max(d, (h * 1.7) / (2 * tan));
    const visW = 2 * d * tan * this.camera.aspect;
    const visH = 2 * d * tan;
    // Centre of the open spread in camera space
    const cx = portrait ? 0 : -visW * 0.15;
    const cy = portrait ? visH * 0.2 : -visH * 0.02;
    // Folder origin is bottom-centre of the back board; the spread centre sits ~w/2 left of it.
    const local = new THREE.Vector3(cx + w * 0.47, cy - h / 2, -d);

    const camQ = this.camera.quaternion;
    const pos = local.applyQuaternion(camQ).add(this.camera.position);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.16 + this.pitch.value, -0.3 + this.yaw.value, 0.015, 'YXZ'));
    return { pos, quat: camQ.clone().multiply(turn) };
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */
  private frame() {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.elapsed += dt;
    const t = this.elapsed;

    // Theme interpolation
    const k = damp(2.4, dt);
    const L = this.look, T = this.lookTarget;
    L.bg.lerp(T.bg, k);
    L.hemiSky.lerp(T.hemiSky, k);
    L.hemiGround.lerp(T.hemiGround, k);
    L.sunColor.lerp(T.sunColor, k);
    L.metal.lerp(T.metal, k);
    L.hemi += (T.hemi - L.hemi) * k;
    L.sun += (T.sun - L.sun) * k;
    L.lamp += (T.lamp - L.lamp) * k;
    L.shadow += (T.shadow - L.shadow) * k;
    L.dust += (T.dust - L.dust) * k;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(L.bg);
    fog.near = this.fogNear.update(dt);
    fog.far = this.fogFar.update(dt);
    this.hemi.intensity = L.hemi;
    this.hemi.color.copy(L.hemiSky);
    this.hemi.groundColor.copy(L.hemiGround);
    this.sun.intensity = L.sun;
    this.sun.color.copy(L.sunColor);
    this.lamp.intensity = L.lamp * this.lampScale.update(dt);
    this.lamp.color.lerp(this.lampTint, damp(2, dt));
    this.lamp.visible = L.lamp > 0.5;
    this.floorMat.opacity = L.shadow;
    this.metalMat.color.copy(L.metal);
    this.dustMat.opacity = L.dust;

    // Camera rig
    const tgt = this.target.update(dt);
    this.parallax.lerp(this.mode === 'browse' ? this.pointer.clone().clampScalar(-1, 1) : new THREE.Vector2(), damp(2, dt));
    const camPos = tgt.clone().addScaledVector(LOOK_DIR, CAM_DIST);
    camPos.x += this.parallax.x * 0.9;
    camPos.y += -this.parallax.y * 0.5;
    this.camera.position.copy(camPos);
    // Look slightly right of the target so the selection sits in the left half of the frame.
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), LOOK_DIR).normalize().negate();
    const visW = 2 * CAM_DIST * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const lookAt = tgt.clone().addScaledVector(right, this.camera.aspect < 1 ? 0 : -visW * 0.17);
    if (this.camera.aspect < 1) lookAt.y -= 1.2;
    this.camera.lookAt(lookAt);
    this.camera.updateMatrixWorld();

    // Lights follow the work area
    this.sun.position.copy(tgt).add(new THREE.Vector3(-9, 16, 8));
    this.sun.target.position.copy(tgt);
    this.lamp.position.copy(tgt).add(new THREE.Vector3(1.6, 7.5, 3.2));
    this.lamp.target.position.copy(tgt).add(new THREE.Vector3(0, -1.2, 0));

    // Inspection pose
    if (this.active) {
      this.yaw.update(dt);
      this.pitch.update(dt);
      const { pos, quat } = this.inspectPose(this.active);
      this.active.pos.setTarget(pos);
      this.active.targetQuat.copy(quat);
      // Desk lamp swings over to the open folder
      const fp = this.active.group.position;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
      const toCam = this.camera.position.clone().sub(fp).normalize();
      this.lamp.position.copy(fp).addScaledVector(up, 5.5).addScaledVector(toCam, 4).add(new THREE.Vector3(1.2, 0, 0));
      this.lamp.target.position.copy(fp).addScaledVector(up, FOLDER.h * 0.5);
    }

    for (const f of this.folders.values()) f.update(dt);

    // Dust drifting through the light
    this.dust.position.set(tgt.x, 0, tgt.z);
    const arr = (this.dust.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] += Math.sin(t * 0.3 + i) * 0.0009 + 0.0012;
      arr[i] += Math.cos(t * 0.21 + i * 0.7) * 0.0008;
      if (arr[i + 1] > 6) arr[i + 1] = 0;
    }
    this.dust.geometry.getAttribute('position').needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  /** Drop resolution on slow machines so motion stays fluid. */
  private adapt(dt: number) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 40 && this.pixelRatio > 0.85) {
      this.pixelRatio = Math.max(0.85, this.pixelRatio - 0.25);
      this.resize();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Input                                                               */
  /* ------------------------------------------------------------------ */
  private bind() {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    const c = this.canvas;

    window.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.drag.on) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        if (this.mode === 'detail') {
          this.yaw.target = THREE.MathUtils.clamp(this.yaw.target + dx * 0.006, -1.2, 1.2);
          this.pitch.target = THREE.MathUtils.clamp(this.pitch.target + dy * 0.004, -0.6, 0.6);
        } else {
          // Vertical drag scrubs through the drawer
          this.drag.acc += dy;
          const stepPx = 56;
          while (Math.abs(this.drag.acc) > stepPx) {
            const step = this.drag.acc > 0 ? -1 : 1;
            this.drag.acc -= Math.sign(this.drag.acc) * stepPx;
            this.on.scrub(step);
          }
        }
        if (this.drag.moved > 6) c.closest('.archive')?.classList.add('is-dragging');
      } else if (this.mode === 'browse' && e.target === c) {
        this.updateHover();
      }
    });

    c.addEventListener('pointerdown', (e) => {
      this.drag = { on: true, x: e.clientX, y: e.clientY, moved: 0, acc: 0 };
      c.setPointerCapture(e.pointerId);
    });
    const end = (e: PointerEvent) => {
      if (!this.drag.on) return;
      const wasClick = this.drag.moved < 6;
      this.drag.on = false;
      c.closest('.archive')?.classList.remove('is-dragging');
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      if (wasClick && this.mode === 'browse') {
        this.updateHover();
        if (this.hovered) this.on.pick(this.hovered.rec);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', () => {
      this.yaw.target = 0;
      this.pitch.target = 0;
    });

    let wheelAcc = 0;
    let wheelT = 0;
    c.addEventListener('wheel', (e) => {
      if (this.mode !== 'browse') return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      const now = performance.now();
      if (Math.abs(wheelAcc) > 40 && now - wheelT > 140) {
        this.on.scrub(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
        wheelT = now;
      }
    }, { passive: false });
  }

  private updateHover() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.hitList, false)[0];
    const f = (hit?.object.userData.folder as Folder | undefined) ?? null;
    if (f !== this.hovered) {
      this.hovered = f;
      this.canvas.closest('.archive')?.classList.toggle('is-hovering', !!f);
      this.on.hover(f?.rec ?? null);
      this.layout();
    }
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Portrait screens need a wider lens to keep the drawer in frame.
    this.camera.fov = w / h < 1 ? 30 : 19;
    this.camera.updateProjectionMatrix();
  }
}
