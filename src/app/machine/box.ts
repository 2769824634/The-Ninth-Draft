/**
 * Solid boxes for the machine room, made of six divs in CSS 3D.
 * Coordinates are world pixels: x right, y down (so "up" is negative y),
 * z toward the viewer. A box's origin is the middle of its base.
 * Faces are shaded by which way they face, so the light reads as one room.
 */

export type Face = 'front' | 'back' | 'left' | 'right' | 'top';

export interface BoxSpec {
  w: number;
  h: number;
  d: number;
  /** Extra class on every face (material). */
  cls: string;
  /** Content to put on a face; the face is created for it. */
  faces?: Partial<Record<Face, HTMLElement>>;
  /** Faces never seen from the camera can be left out. */
  skip?: Face[];
}

export function box(spec: BoxSpec) {
  const el = document.createElement('div');
  el.className = 'm3';
  const { w, h, d } = spec;
  const make = (name: Face, fw: number, fh: number, transform: string) => {
    if (spec.skip?.includes(name)) return;
    const f = document.createElement('div');
    f.className = `m3__f m3__f--${name} ${spec.cls}`;
    f.style.width = `${fw}px`;
    f.style.height = `${fh}px`;
    f.style.transform = `translate3d(${-fw / 2}px, ${-fh / 2}px, 0) ${transform}`;
    const content = spec.faces?.[name];
    if (content) f.append(content);
    el.append(f);
  };
  make('front', w, h, `translate3d(0, ${-h / 2}px, ${d / 2}px)`);
  make('back', w, h, `translate3d(0, ${-h / 2}px, ${-d / 2}px) rotateY(180deg)`);
  make('right', d, h, `translate3d(${w / 2}px, ${-h / 2}px, 0) rotateY(90deg)`);
  make('left', d, h, `translate3d(${-w / 2}px, ${-h / 2}px, 0) rotateY(-90deg)`);
  make('top', w, d, `translate3d(0, ${-h}px, 0) rotateX(90deg)`);
  return el;
}

/** Place something in the world. */
export function put(el: HTMLElement, x: number, y: number, z: number, rotY = 0) {
  el.style.transform = `translate3d(${x}px, ${y}px, ${z}px)${rotY ? ` rotateY(${rotY}deg)` : ''}`;
  return el;
}

/** A div with a class and optional inner HTML. */
export function div(cls: string, html = '') {
  const el = document.createElement('div');
  el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}
