import * as THREE from 'three';

/**
 * Critically damped spring (no overshoot, no hard cuts).
 * `omega` ~ responsiveness: 6 = slow and heavy, 14 = snappy.
 * Integrated analytically so it stays stable at any frame rate.
 */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  constructor(v = 0, public omega = 8) {
    this.value = v;
    this.target = v;
  }
  set(v: number) {
    this.value = this.target = v;
    this.velocity = 0;
  }
  update(dt: number) {
    const w = this.omega;
    const x = this.value - this.target;
    const exp = Math.exp(-w * dt);
    const tmp = (this.velocity + w * x) * dt;
    this.value = this.target + (x + tmp) * exp;
    this.velocity = (this.velocity - w * tmp) * exp;
    return this.value;
  }
  get settled() {
    return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-4;
  }
}

export class SpringV3 {
  x: Spring;
  y: Spring;
  z: Spring;
  readonly value = new THREE.Vector3();
  constructor(v = new THREE.Vector3(), omega = 8) {
    this.x = new Spring(v.x, omega);
    this.y = new Spring(v.y, omega);
    this.z = new Spring(v.z, omega);
    this.value.copy(v);
  }
  set omega(w: number) {
    this.x.omega = this.y.omega = this.z.omega = w;
  }
  setTarget(v: THREE.Vector3) {
    this.x.target = v.x;
    this.y.target = v.y;
    this.z.target = v.z;
  }
  jump(v: THREE.Vector3) {
    this.x.set(v.x);
    this.y.set(v.y);
    this.z.set(v.z);
    this.value.copy(v);
  }
  update(dt: number) {
    this.value.set(this.x.update(dt), this.y.update(dt), this.z.update(dt));
    return this.value;
  }
}

/** Frame-rate independent exponential smoothing factor. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);
