/**
 * The baseline booth: a dark interrogation room built in code. A steel table
 * under one lamp, the interrogator (a black slab with a red lens), a wall
 * monitor, an iris scanner. Every answer becomes a card in the air, joined to
 * the last by red string, the same string as on the link wall. The more the
 * subject deviates, the more everything shakes.
 */
import * as THREE from 'three';
import { Spring } from '../spring';
import { reducedMotion } from '../prefs';
import type { Dev } from './rounds';

const RED = '#c1272d';
const PAPER = ['#e8e0cc', '#e3c98d', '#e2b3a4'];

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

function tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, c: HTMLCanvasElement) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  draw(g, c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g, t };
}

/** Break text into lines that fit `maxW` (by character for Chinese, by word otherwise). */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number) {
  const cjk = /[　-鿿]/.test(text);
  const parts = cjk ? [...text] : text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const p of parts) {
    const next = cur ? (cjk ? cur + p : `${cur} ${p}`) : p;
    if (g.measureText(next).width > maxW && cur) {
      lines.push(cur);
      cur = p;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Card {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  phase: number;
  kind: Dev;
  born: number;
}

export class Booth {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private cards: Card[] = [];
  private strings: THREE.Line;
  private stringPos: Float32Array;
  private lamp: THREE.SpotLight;
  private lens: THREE.Mesh;
  private lensLight: THREE.PointLight;

  // 0..1 steady deviation, plus a short-lived impulse for each bad answer
  private dev = new Spring(0, 3);
  private kickV = new Spring(0, 9);
  private progress = new Spring(0, 2.2);
  private pupil = new Spring(0.3, 4);
  private speaking = new Spring(0, 12);
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();

  private monitor: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; c: HTMLCanvasElement };
  private iris: { g: CanvasRenderingContext2D; t: THREE.CanvasTexture; c: HTMLCanvasElement };
  private monState = { round: 0, total: 9, text: '', dev: 0, state: 'idle' as 'idle' | 'round' | 'verdict' };
  private nextMon = 0;
  private nextIris = 0;
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private dust: THREE.Points;
  private font = { mono: '', serif: '', display: '' };

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color('#06080a');
    this.scene.fog = new THREE.Fog('#06080a', 6, 15);
    this.font = { mono: css('--f-mono', 'monospace'), serif: css('--f-serif', 'serif'), display: css('--f-display', 'sans-serif') };

    // ---- light
    this.scene.add(new THREE.HemisphereLight('#7f99a0', '#1c1812', 1.15));
    this.lamp = new THREE.SpotLight('#ffe0b0', 95, 11, 0.62, 0.7, 1.6);
    this.lamp.position.set(0, 3.7, 0.5);
    this.lamp.target.position.set(0, 0.9, -0.5);
    this.scene.add(this.lamp, this.lamp.target);
    // a cold wash on the back wall, so the room reads beyond the lamp
    const wash = new THREE.PointLight('#6fa0aa', 14, 9, 1.6);
    wash.position.set(0, 3.4, -1.8);
    this.scene.add(wash);

    // ---- room
    const wallTex = tex(512, 512, (g, c) => {
      g.fillStyle = '#16201f';
      g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#1a2625' : '#141d1c';
        g.fillRect(i * 128, 0, 128, 512);
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(i * 128, 0, 3, 512);
      }
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(0, 250, 512, 3);
      // hazard stripes along the foot of the wall
      g.save();
      g.beginPath();
      g.rect(0, 462, 512, 28);
      g.clip();
      g.fillStyle = '#b9a050';
      g.fillRect(0, 462, 512, 28);
      g.fillStyle = '#16140f';
      for (let x = -40; x < 560; x += 36) {
        g.beginPath();
        g.moveTo(x, 490);
        g.lineTo(x + 18, 490);
        g.lineTo(x + 46, 462);
        g.lineTo(x + 28, 462);
        g.fill();
      }
      g.restore();
    });
    wallTex.t.wrapS = wallTex.t.wrapT = THREE.RepeatWrapping;
    wallTex.t.repeat.set(4, 1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.6), new THREE.MeshStandardMaterial({ map: wallTex.t, roughness: 0.9, metalness: 0.1 }));
    wall.position.set(0, 2.3, -3.4);
    this.scene.add(wall);
    for (const s of [-1, 1]) {
      const side = wall.clone();
      side.rotation.y = s * Math.PI * 0.5;
      side.position.set(s * 4.6, 2.3, -0.2);
      this.scene.add(side);
    }
    const floorTex = tex(256, 256, (g, c) => {
      g.fillStyle = '#101314';
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,255,255,.07)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
    });
    floorTex.t.wrapS = floorTex.t.wrapT = THREE.RepeatWrapping;
    floorTex.t.repeat.set(10, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ map: floorTex.t, roughness: 0.55, metalness: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // ---- table
    const steel = new THREE.MeshStandardMaterial({ color: '#9ca1a4', roughness: 0.42, metalness: 0.75 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 1.3), steel);
    top.position.set(0, 0.92, -0.3);
    this.scene.add(top);
    for (const [x, z] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.2], [1.3, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), steel);
      leg.position.set(x, 0.45, z);
      this.scene.add(leg);
    }
    const pool = tex(256, 256, (g) => {
      const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      r.addColorStop(0, 'rgba(255,224,170,.55)');
      r.addColorStop(1, 'rgba(255,224,170,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 256);
    });
    const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: pool.t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(0, 0.96, -0.3);
    this.scene.add(poolMesh);

    // ---- the lamp
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.36, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#23282a', roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(0, 3.7, 0.5);
    this.scene.add(shade);
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 3.9, 0.5), new THREE.Vector3(0, 5, 0.5)]), new THREE.LineBasicMaterial({ color: '#222' }));
    this.scene.add(cord);

    // ---- the interrogator: a slab with one red lens
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.9, 0.18), new THREE.MeshStandardMaterial({ color: '#0b0c0d', roughness: 0.35, metalness: 0.6 }));
    slab.position.set(0, 1.9, -2.1);
    this.scene.add(slab);
    this.lens = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), new THREE.MeshBasicMaterial({ color: RED }));
    this.lens.position.set(0, 2.3, -2.0);
    this.scene.add(this.lens);
    this.lensLight = new THREE.PointLight(RED, 1.2, 4, 2);
    this.lensLight.position.set(0, 2.3, -1.7);
    this.scene.add(this.lensLight);
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.025), new THREE.MeshBasicMaterial({ color: '#3a1012' }));
    slit.position.set(0, 2.05, -2.005);
    this.scene.add(slit);

    // ---- wall monitor
    this.monitor = tex(640, 360, () => undefined);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.24), new THREE.MeshBasicMaterial({ map: this.monitor.t, toneMapped: false }));
    screen.position.set(-1.85, 3.05, -3.33);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.34, 1.38, 0.08), new THREE.MeshStandardMaterial({ color: '#0c0e0f', roughness: 0.5, metalness: 0.7 }));
    frame.position.set(-1.85, 3.05, -3.38);
    this.scene.add(frame, screen);

    // ---- iris scanner
    this.iris = tex(256, 256, () => undefined);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.14, 40), new THREE.MeshStandardMaterial({ color: '#15191a', roughness: 0.4, metalness: 0.8 }));
    housing.rotation.x = Math.PI / 2;
    housing.position.set(1.95, 3.0, -3.3);
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.5, 48), new THREE.MeshBasicMaterial({ map: this.iris.t, toneMapped: false }));
    eye.position.set(1.95, 3.0, -3.22);
    this.scene.add(housing, eye);

    // ---- red string between the cards
    this.stringPos = new Float32Array(9 * 3 * 4);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.stringPos, 3));
    sg.setDrawRange(0, 0);
    this.strings = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: RED }));
    this.strings.frustumCulled = false;
    this.scene.add(this.strings);

    // ---- dust in the lamp cone
    const n = 220;
    const dp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      dp[i * 3] = (Math.random() - 0.5) * 2.4;
      dp[i * 3 + 1] = 0.9 + Math.random() * 2.8;
      dp[i * 3 + 2] = -1.3 + Math.random() * 2;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#ffe9c4', size: 0.012, transparent: true, opacity: 0.5, depthWrite: false }));
    this.scene.add(this.dust);

    this.camera.position.set(0, 1.5, 5.6);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(canvas);
    window.addEventListener('pointermove', this.onPointer);
    this.resize();
    this.drawIris(0);
    this.drawMonitor(0);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------- controls ---------- */

  /** Steady deviation (0–1) drives the shaking and the light. */
  setDeviation(d: number) {
    this.dev.target = Math.max(0, Math.min(1, d));
    this.pupil.target = 0.3 + 0.36 * this.dev.target;
  }

  /** A bad answer: a sudden jolt. */
  kick(amount: number) {
    this.kickV.value = Math.min(1.2, this.kickV.value + amount);
  }

  /** 0..1 over the nine lines; the camera leans in. */
  setProgress(p: number) {
    this.progress.target = Math.max(0, Math.min(1, p));
  }

  /** The lens glows while SYSTEM speaks. */
  speak(on: boolean) {
    this.speaking.target = on ? 1 : 0;
  }

  setMonitor(s: Partial<Booth['monState']>) {
    Object.assign(this.monState, s);
  }

  addWord(text: string, kind: Dev, index: number) {
    const w = 640, h = 200;
    const { g, t } = tex(w, h, () => undefined);
    const paint = () => {
      g.fillStyle = PAPER[kind];
      g.fillRect(0, 0, w, h);
      // paper grain
      for (let i = 0; i < 700; i++) {
        g.fillStyle = `rgba(60,45,20,${Math.random() * 0.06})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1);
      }
      g.strokeStyle = kind === 2 ? RED : 'rgba(29,27,23,.5)';
      g.lineWidth = kind === 2 ? 6 : 3;
      g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = 'rgba(29,27,23,.65)';
      g.font = `500 22px ${this.font.mono}`;
      g.fillText(String(index + 1).padStart(2, '0'), 24, 38);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#1d1b17';
      let size = 52;
      let lines: string[] = [];
      for (; size >= 28; size -= 4) {
        g.font = `600 ${size}px ${this.font.serif}`;
        lines = wrap(g, text, w - 90);
        if (lines.length <= 2) break;
      }
      const lh = size * 1.2;
      lines.forEach((ln, i) => g.fillText(ln, w / 2, h / 2 + 12 + (i - (lines.length - 1) / 2) * lh));
      if (kind === 2) {
        g.strokeStyle = RED;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(40, h / 2 + 14);
        g.lineTo(w - 40, h / 2 + 10);
        g.stroke();
      }
      t.needsUpdate = true;
    };
    paint();
    // Chinese and mono faces may arrive late; redraw once they have
    document.fonts?.ready.then(paint);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.31), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color('#2a2418'), emissiveMap: t, emissiveIntensity: 0.35 }));
    // an arc across the air above the table
    const k = index - 4;
    const base = new THREE.Vector3(k * 0.52, 1.55 + Math.sin(index * 1.25) * 0.14, -0.55 - (index % 2) * 0.3);
    mesh.position.copy(base).add(new THREE.Vector3(0, 0.5, 0.6));
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    this.cards.push({ mesh, base, phase: Math.random() * 6.28, kind, born: this.t });
  }

  reset() {
    for (const c of this.cards) {
      this.scene.remove(c.mesh);
      (c.mesh.material as THREE.MeshStandardMaterial).map?.dispose();
      (c.mesh.material as THREE.Material).dispose();
      c.mesh.geometry.dispose();
    }
    this.cards = [];
    this.strings.geometry.setDrawRange(0, 0);
    this.setDeviation(0);
    this.setProgress(0);
    this.monState.round = 0;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.renderer.dispose();
  }

  /* ---------- drawing ---------- */

  private drawMonitor(now: number) {
    const { g, c, t } = this.monitor;
    const s = this.monState;
    const d = this.dev.value;
    g.fillStyle = '#05100e';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(190,230,215,.9)';
    g.font = `500 20px ${this.font.mono}`;
    g.fillText('RECORDS OFFICE · BASELINE', 24, 36);
    g.fillStyle = RED;
    g.fillRect(24, 48, 120, 4);
    g.fillStyle = 'rgba(190,230,215,.6)';
    g.font = `500 18px ${this.font.mono}`;
    g.fillText(s.state === 'round' ? `LINE ${String(s.round).padStart(2, '0')} / ${String(s.total).padStart(2, '0')}` : s.state === 'verdict' ? 'RESULT' : 'STANDING BY', 24, 80);
    // the line SYSTEM is reading
    if (s.text) {
      g.fillStyle = '#e8f3ee';
      g.font = `600 30px ${this.font.serif}`;
      const lines = wrap(g, s.text, c.width - 60);
      lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, 24, 140 + i * 40));
    }
    // pulse trace
    g.strokeStyle = d > 0.55 ? RED : 'rgba(150,230,200,.85)';
    g.lineWidth = 2.5;
    g.beginPath();
    const amp = 10 + d * 34;
    for (let x = 0; x <= c.width - 48; x += 3) {
      const u = (x + now * 110) / 150;
      const f = u - Math.floor(u);
      const beat = f < 0.08 ? Math.sin((f / 0.08) * Math.PI) * -amp * 1.6 : f < 0.14 ? Math.sin(((f - 0.08) / 0.06) * Math.PI) * amp * 0.5 : Math.sin(u * 3) * d * 8;
      const y = 292 + beat + (Math.random() - 0.5) * d * 6;
      x === 0 ? g.moveTo(24 + x, y) : g.lineTo(24 + x, y);
    }
    g.stroke();
    // deviation bar
    g.strokeStyle = 'rgba(190,230,215,.5)';
    g.lineWidth = 2;
    g.strokeRect(24, 318, c.width - 48, 18);
    g.fillStyle = d > 0.55 ? RED : 'rgba(190,230,215,.85)';
    g.fillRect(27, 321, (c.width - 54) * Math.min(1, d), 12);
    // scanlines
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
    t.needsUpdate = true;
  }

  private drawIris(now: number) {
    const { g, c, t } = this.iris;
    const r0 = c.width / 2;
    g.fillStyle = '#050606';
    g.fillRect(0, 0, c.width, c.height);
    g.save();
    g.translate(r0, r0);
    // iris
    const grad = g.createRadialGradient(0, 0, r0 * 0.2, 0, 0, r0 * 0.78);
    grad.addColorStop(0, '#6d5a35');
    grad.addColorStop(0.6, '#8a7a55');
    grad.addColorStop(1, '#2a2418');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, r0 * 0.78, 0, Math.PI * 2);
    g.fill();
    // fibres
    g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      const a = (i / 160) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.02;
      g.strokeStyle = `rgba(${i % 3 ? '30,24,12' : '190,170,120'},${0.25 + (i % 5) * 0.06})`;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0 * 0.3, Math.sin(a) * r0 * 0.3);
      g.lineTo(Math.cos(a) * r0 * 0.75, Math.sin(a) * r0 * 0.75);
      g.stroke();
    }
    // pupil, trembling with deviation
    const pr = r0 * this.pupil.value * (1 + Math.sin(now * 20) * this.dev.value * 0.06);
    g.fillStyle = '#020202';
    g.beginPath();
    g.arc(0, 0, pr, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.8)';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(0, 0, r0 * 0.78, 0, Math.PI * 2);
    g.stroke();
    // highlight
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.beginPath();
    g.arc(-r0 * 0.26, -r0 * 0.28, r0 * 0.06, 0, Math.PI * 2);
    g.fill();
    // reticle
    g.rotate(now * 0.3);
    g.strokeStyle = RED;
    g.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(r0 * 0.86, 0);
      g.lineTo(r0 * 0.97, 0);
      g.stroke();
    }
    g.restore();
    t.needsUpdate = true;
  }

  /* ---------- loop ---------- */

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
  };

  private resize() {
    const box = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    const w = Math.max(160, Math.round(box.width));
    const h = Math.max(160, Math.round(box.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the table in frame on a tall phone screen
    this.camera.fov = w / h < 1 ? 46 : 32;
    this.camera.updateProjectionMatrix();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden || !this.visible) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    const calm = reducedMotion();
    const d = this.dev.update(dt);
    const k = calm ? 0 : this.kickV.update(dt);
    this.kickV.target = 0;
    const p = this.progress.update(dt);
    this.pupil.update(dt);
    const sp = this.speaking.update(dt);
    this.pointerS.lerp(this.pointer, 1 - Math.exp(-dt * 3));

    // camera: leans in as the test goes on; shakes with deviation
    const shake = calm ? 0 : (d * 0.012 + k * 0.05);
    this.camera.position.set(
      this.pointerS.x * 0.22 + (Math.random() - 0.5) * shake,
      1.5 - this.pointerS.y * 0.08 + Math.sin(this.t * 0.6) * 0.012 + (Math.random() - 0.5) * shake,
      5.6 - p * 1.9,
    );
    this.camera.lookAt(0, 1.75 + p * 0.1, -0.8);
    this.camera.rotation.z += calm ? 0 : Math.sin(this.t * 7) * d * 0.012 + (Math.random() - 0.5) * k * 0.05;

    // lamp flicker
    const flick = calm ? 0 : Math.max(0, Math.sin(this.t * 31) * Math.sin(this.t * 13)) * (d * 0.5 + k) ;
    this.lamp.intensity = 95 * (1 - flick * 0.7);
    this.lens.scale.setScalar(1 + sp * 0.5 + (calm ? 0 : Math.sin(this.t * 4) * 0.05));
    this.lensLight.intensity = 0.8 + sp * 2.4 + d * 1.2;

    // cards drift up from where they were dealt, bobbing a little
    for (const c of this.cards) {
      const age = Math.min(1, (this.t - c.born) / 0.7);
      const e = 1 - Math.pow(1 - age, 3);
      const bob = calm ? 0 : Math.sin(this.t * 0.9 + c.phase) * 0.03 * (1 + d * 3);
      c.mesh.position.set(c.base.x, c.base.y + bob + (1 - e) * 0.5, c.base.z + (1 - e) * 0.6);
      c.mesh.scale.setScalar(0.01 + 0.99 * e);
      c.mesh.rotation.set(0, Math.sin(c.phase) * 0.12, Math.sin(this.t * 0.5 + c.phase) * 0.03 + (calm ? 0 : (Math.random() - 0.5) * k * 0.1));
    }
    // strings: one polyline, doubling back so each card is tied to the one before and the one two back
    const jit = calm ? 0 : d * 0.03 + k * 0.08;
    // a Line draws one polyline, so walk it forward and back along the chain
    const line: number[] = [];
    for (let i = 0; i < this.cards.length; i++) {
      const q = this.cards[i].mesh.position;
      line.push(q.x, q.y - 0.14, q.z);
      if (i >= 2) {
        const r = this.cards[i - 2].mesh.position;
        line.push(r.x, r.y - 0.14, r.z, q.x, q.y - 0.14, q.z);
      }
    }
    const n = Math.min(line.length / 3, this.stringPos.length / 3);
    this.stringPos.set(line.slice(0, n * 3));
    if (jit) for (let i = 0; i < n * 3; i++) this.stringPos[i] += (Math.random() - 0.5) * jit * 0.5;
    this.strings.geometry.setDrawRange(0, n);
    (this.strings.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // dust
    if (!calm) {
      const a = this.dust.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i++) {
        let y = a.getY(i) - dt * 0.04;
        if (y < 0.9) y = 3.6;
        a.setY(i, y);
        a.setX(i, a.getX(i) + Math.sin(this.t * 0.3 + i) * dt * 0.01);
      }
      a.needsUpdate = true;
    }

    if (now > this.nextMon) {
      this.drawMonitor(this.t);
      this.nextMon = now + 66;
    }
    if (now > this.nextIris) {
      this.drawIris(this.t);
      this.nextIris = now + 90;
    }
    this.renderer.render(this.scene, this.camera);
  };
}
