/**
 * Scanned material textures (CC0, see public/textures/SOURCES.md), laid over
 * a material the room has already drawn for itself. The drawn canvas texture
 * shows until the files arrive, and stays if they never do.
 *
 * Each set is a folder in public/textures/ holding color.jpg, normal.jpg and
 * rough.jpg (any of them may be missing). The colour maps are stored mostly
 * grey at an average of 0.72, so the room keeps its own colours: `colour`
 * is the colour the drawn texture had, lifted to make up for that.
 */
import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const loader = new THREE.TextureLoader();
let aniso = 4;
export const setPbrAniso = (n: number) => (aniso = n);

export interface Dress {
  /** The surface's colour on average (the drawn texture's base colour). */
  colour: string;
  /** Repeats across the surface's UVs. */
  repeat?: [number, number];
  /** Turn the texture a quarter turn (planks running the other way). */
  turn?: boolean;
  /** How rough the surface is at the map's brightest (default: the material's own roughness ×1.4). */
  rough?: number;
  /** How hard the normal map pushes. */
  bump?: number;
}

function load(url: string, srgb: boolean, o: Dress): Promise<THREE.Texture | null> {
  return new Promise((ok) =>
    loader.load(
      url,
      (t) => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = aniso;
        if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
        if (o.turn) {
          t.center.set(0.5, 0.5);
          t.rotation = Math.PI / 2;
        }
        ok(t);
      },
      undefined,
      () => ok(null),
    ),
  );
}

/** One scanned picture, e.g. `teak/grain.jpg`, for a texture the room draws itself. */
export function scan(file: string): Promise<HTMLImageElement | null> {
  return new Promise((ok) => new THREE.ImageLoader().load(`${BASE}textures/${file}`, ok, undefined, () => ok(null)));
}

/** Lay the scanned set `name` over material `m`. */
export async function dress(m: THREE.MeshStandardMaterial, name: string, o: Dress) {
  const dir = `${BASE}textures/${name}/`;
  const [color, normal, rough] = await Promise.all([load(`${dir}color.jpg`, true, o), load(`${dir}normal.jpg`, false, o), load(`${dir}rough.jpg`, false, o)]);
  if (color) {
    m.map?.dispose();
    m.map = color;
    m.color.set(o.colour).multiplyScalar(1 / 0.72);
  }
  if (normal) {
    m.normalMap = normal;
    m.normalScale.setScalar(o.bump ?? 1);
  }
  if (rough) {
    m.roughnessMap = rough;
    m.roughness = o.rough ?? Math.min(1, m.roughness * 1.4);
  }
  m.needsUpdate = true;
}
