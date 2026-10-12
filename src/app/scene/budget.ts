import * as THREE from 'three';
import { checking, pixelRatio } from '../check';

/**
 * Keeping a room quick to draw without changing how it looks.
 *
 * Lights: a lamp that is off is turned down to nothing, never hidden. Every
 * material in a room is compiled for the number of lights in it; a light
 * coming or going changes that number and every shader is rebuilt, which is a
 * stall of a second or more each time a switch is pulled. `off` keeps the old
 * thresholds (a lamp below them gives no light at all) without the rebuild.
 *
 * Shadows: a shadow map is drawn again only when something that casts a
 * shadow within the lamp's reach has moved (or the lamp has), and only while
 * the lamp is lit. A still room draws its shadows once instead of every frame.
 *
 * Pixels: when frames keep coming too slowly, the picture is drawn with fewer
 * pixels, a step at a time, never below one pixel per screen point.
 */
export const off = (v: number, below: number) => (v > below ? v : 0);

type Seen = { m: Float32Array; v: number };
type Lamp = { stale: boolean; sig: string };
type Caster = THREE.Light & { shadow: THREE.LightShadow };

const TOL = 1e-4;

export class ShadowCache {
  private seen = new WeakMap<THREE.Object3D, Seen>();
  private lamps = new WeakMap<THREE.Object3D, Lamp>();
  private setSig = '';
  private moved: THREE.Sphere[] = [];
  private all = false;
  private sphere = new THREE.Sphere();
  private v = new THREE.Vector3();
  private lights: Caster[] = [];

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {}

  /** Call just before drawing: marks the shadow maps that need drawing again this frame. */
  update() {
    if (!this.renderer.shadowMap.enabled) return;
    this.scene.updateMatrixWorld();
    this.moved.length = 0;
    this.all = false;
    this.lights.length = 0;
    let ids = 0, n = 0;
    this.scene.traverseVisible((o) => {
      if ((o as THREE.Light).isLight) {
        if ((o as THREE.Light).castShadow) this.lights.push(o as Caster);
        return;
      }
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow) return;
      ids = (ids + m.id * 2654435761) % 4294967296;
      n++;
      const g = m.geometry;
      const ver = ((g.attributes.position as THREE.BufferAttribute | undefined)?.version ?? 0) + ((m as THREE.InstancedMesh).instanceMatrix?.version ?? 0) * 7919 + (g.index?.version ?? 0) * 31;
      const e = m.matrixWorld.elements;
      let s = this.seen.get(m);
      let changed = false;
      if (!s) {
        s = { m: new Float32Array(16), v: ver };
        this.seen.set(m, s);
        changed = true;
      } else if (s.v !== ver) changed = true;
      else for (let i = 0; i < 16; i++) if (Math.abs(e[i] - s.m[i]) > TOL) { changed = true; break; }
      if (!changed) return;
      s.m.set(e);
      s.v = ver;
      if ((m as THREE.InstancedMesh).isInstancedMesh) {
        this.all = true;
        return;
      }
      if (!g.boundingSphere) g.computeBoundingSphere();
      this.moved.push(this.sphere.copy(g.boundingSphere!).applyMatrix4(m.matrixWorld).clone());
    });
    // something started or stopped casting a shadow
    const sig = `${n}:${ids}`;
    if (sig !== this.setSig) {
      this.setSig = sig;
      this.all = true;
    }
    for (const l of this.lights) {
      const sh = l.shadow;
      sh.autoUpdate = false;
      let lamp = this.lamps.get(l);
      if (!lamp) this.lamps.set(l, (lamp = { stale: true, sig: '' }));
      const t = (l as THREE.SpotLight).target;
      const c = sh.camera as THREE.OrthographicCamera;
      const lsig = l.matrixWorld.elements.map((x) => x.toFixed(4)).join() + (t ? t.matrixWorld.elements.slice(12, 15).map((x) => x.toFixed(4)).join() : '') +
        `${(l as THREE.SpotLight).angle ?? ''}|${(l as THREE.SpotLight).distance ?? ''}|${c.left ?? ''},${c.right ?? ''},${c.top ?? ''},${c.bottom ?? ''}|${sh.mapSize.x}`;
      if (lsig !== lamp.sig || !sh.map) {
        lamp.sig = lsig;
        lamp.stale = true;
      }
      if (!lamp.stale && (this.all || this.moved.length)) lamp.stale = this.reaches(l);
      // a lamp that is off still needs a map to exist: the shaders sample it either way
      if (lamp.stale && (l.intensity > 0 || !sh.map)) {
        sh.needsUpdate = true;
        lamp.stale = false;
      }
    }
  }

  /** Whether anything that moved this frame is within reach of this lamp. */
  private reaches(l: THREE.Light) {
    if (this.all) return true;
    const d = (l as THREE.SpotLight | THREE.PointLight).distance;
    if (!(l as THREE.SpotLight).isSpotLight && !(l as THREE.PointLight).isPointLight) return true;
    if (!d) return true;
    const p = l.getWorldPosition(this.v);
    return this.moved.some((s) => s.center.distanceTo(p) < d + s.radius);
  }
}

/**
 * Fewer pixels when the frames come too slowly. Measured between frames as the
 * browser shows them; a single long frame (a texture arriving, a tab coming
 * back) does not count. Only ever steps down, never below one pixel per point.
 */
export class Resolution {
  private scale = 1;
  private gaps: number[] = [];
  private calmUntil = performance.now() + 3000;
  private last = 0;

  constructor(private max: number, private apply: () => void) {}

  /** The pixel ratio to draw at now. */
  get ratio() {
    const full = pixelRatio(this.max);
    return Math.max(Math.min(1, full), full * this.scale);
  }

  /** Call once a frame. */
  frame(now: number) {
    const gap = now - this.last;
    this.last = now;
    if (checking || document.hidden || gap > 250 || now < this.calmUntil) return;
    this.gaps.push(gap);
    if (this.gaps.length < 90) return;
    const sorted = this.gaps.slice().sort((a, b) => a - b);
    this.gaps.length = 0;
    // most frames slower than about 36 a second, and there are pixels left to give up
    if (sorted[45] > 28 && this.ratio > Math.min(1, pixelRatio(this.max))) {
      this.scale *= 0.8;
      this.calmUntil = now + 2000;
      this.apply();
    }
  }
}

/**
 * Compile every material in the room before it is first seen. Left alone, a
 * shader is built the first time its object comes into view (a corner of the
 * room, a model that has just loaded, the umbrella on a wet day), and the
 * frame that shows it stalls. Checked again whenever the room gains things.
 */
export function keepWarm(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  let count = -1;
  let busy = false;
  const check = () => {
    if (busy || document.hidden) return;
    let n = 0;
    scene.traverse(() => n++);
    if (n === count) return;
    count = n;
    busy = true;
    renderer.compileAsync(scene, camera).catch(() => {}).finally(() => (busy = false));
  };
  check();
  return window.setInterval(check, 1500);
}
