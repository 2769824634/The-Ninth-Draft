/**
 * Check mode, for screenshots in a headless browser with no graphics card.
 *
 * Only on with `?check` in the address; a visitor never gets it. It draws at
 * pixel ratio 1 with shadows off (add `&shadows` to keep them), skips the boot
 * cover, and lets the address put a room straight into a state:
 *
 *   ?check&at=reel            a corner of the room (each room's zone names)
 *   ?check&drawer=0.1         archive: cabinet 0, drawer 1 pulled out
 *   ?check&theme=night&lang=zh&weather=rain
 *
 * Each room publishes itself on `window.__n9` once it is built, so a script can
 * reach the scene and the controller. `__n9.draw = false` holds drawing while a
 * script fast-forwards a faked clock; the frames still step, only nothing is
 * drawn until it is set back. `scripts/shot.mjs` does all of this.
 */
const q = new URLSearchParams(location.search);

export const checking = q.has('check');

/** A state asked for in the address, in check mode only. */
export const ask = (k: string): string | null => (checking ? q.get(k) : null);

/** Shadows are drawn unless check mode turned them off. */
export const shadows = !checking || q.has('shadows');

export const pixelRatio = (max: number) => (checking ? 1 : Math.min(window.devicePixelRatio || 1, max));

type N9 = { draw?: boolean; ready?: string; [k: string]: unknown };
const w = window as unknown as { __n9?: N9 };

/** Draw this frame? Always, unless a check script is fast-forwarding. */
export const drawing = () => !checking || w.__n9?.draw !== false;

/** A room is built: hand it to the check script. */
export function published(room: string, parts: Record<string, unknown>) {
  if (!checking) return;
  w.__n9 = { ...w.__n9, ...parts, ready: room };
}
