/**
 * Turning to an earlier draft lifts the sheet on top by its bottom-right
 * corner and peels it back over itself, uncovering the draft underneath;
 * going back to a newer draft lays that sheet down again the same way.
 *
 * The lifted sheet is a copy of the paper as it read a moment ago, cut along
 * a moving fold line: what lies before the fold stays flat, what lies past it
 * is mirrored over the fold as the back of the paper.
 */
import { reducedMotion } from '../prefs';
import { audio } from '../audio';

type P = [number, number];

/** Keep the part of polygon `pts` where x + y <= c (or >= c when `past`). */
function cut(pts: P[], c: number, past: boolean): P[] {
  const inside = (p: P) => (past ? p[0] + p[1] >= c : p[0] + p[1] <= c);
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (c - a[0] - a[1]) / (b[0] + b[1] - a[0] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

const poly = (pts: P[], dx = 0, dy = 0) =>
  pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(([x, y]) => `${(x + dx).toFixed(1)}px ${(y + dy).toFixed(1)}px`).join(', ')})`;

/** A still copy of the sheet as it reads now, laid exactly over it. */
function copy(paper: HTMLElement): HTMLElement {
  const c = paper.cloneNode(true) as HTMLElement;
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
  c.setAttribute('aria-hidden', 'true');
  c.inert = true;
  // what the sheet looks like now, before the dossier says it is another draft
  const cs = getComputedStyle(paper);
  c.style.setProperty('--bg', cs.getPropertyValue('--bg'));
  c.style.backgroundColor = cs.backgroundColor;
  const ss = paper.querySelector<HTMLElement>('.superseded'), cc = c.querySelector<HTMLElement>('.superseded');
  if (ss && cc) {
    const s = getComputedStyle(ss);
    Object.assign(cc.style, { opacity: s.opacity, transform: s.transform, transition: 'none' });
  }
  // canvases (the halftone portrait, the negatives) come over blank
  const from = paper.querySelectorAll('canvas'), to = c.querySelectorAll('canvas');
  from.forEach((f, i) => {
    const t = to[i];
    if (!t || !f.width) return;
    try {
      t.getContext('2d')?.drawImage(f, 0, 0);
    } catch {
      /* a tainted canvas stays blank */
    }
  });
  return c;
}

let running: (() => void) | null = null;

/**
 * Run `apply` (which changes the paper to the new draft) under a peel.
 * `back` lays a newer sheet down instead of lifting the top one off.
 */
export function peel(paper: HTMLElement, apply: () => void, back: boolean, after?: () => void) {
  running?.();
  const host = paper.parentElement;
  if (reducedMotion() || !host || !paper.offsetWidth) {
    apply();
    after?.();
    return;
  }
  const W = paper.offsetWidth, H = paper.offsetHeight;
  const top = paper.scrollTop;
  const box = document.createElement('div');
  box.className = 'peel';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, { left: `${paper.offsetLeft}px`, top: `${paper.offsetTop}px`, width: `${W}px`, height: `${H}px` });

  // laying down: the old sheet stays put underneath until the new one covers it
  let under: HTMLElement | null = null;
  if (back) {
    under = copy(paper);
    under.classList.add('peel__under');
    box.appendChild(under);
  }
  const front = back ? null : copy(paper);
  apply();
  const sheet = front ?? copy(paper);
  sheet.classList.add('peel__front');
  const lift = document.createElement('div');
  lift.className = 'peel__lift';
  const flap = document.createElement('div');
  flap.className = 'peel__flap';
  lift.appendChild(flap);
  box.append(sheet, lift);
  host.appendChild(box);
  for (const c of [under, sheet]) if (c) c.scrollTop = top;

  const rect: P[] = [[0, 0], [W, 0], [W, H], [0, H]];
  const span = W + H;
  const dur = 680;
  const t0 = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    // ease in-out: the corner comes up slowly, then the sheet goes over
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    // turned back as far as its own diagonal, then taken away
    const f = back ? 1 - e : e;
    const a = f * span * 0.5;
    const c = span - a;
    sheet.style.clipPath = poly(cut(rect, c, false));
    // the part past the fold, turned over onto the sheet's own face
    const over = cut(rect, c, true).map(([x, y]) => [c - y, c - x] as P);
    flap.style.clipPath = poly(over, W, H);
    // the back of the paper darkens toward the fold, where it curls
    flap.style.setProperty('--fold', `${((c + W + H) / (3 * W + 3 * H)) * 100}%`);
    // past its diagonal the sheet is taken off the pile, up and to the left
    const g = Math.max(0, (f - 0.5) / 0.5);
    for (const el of [sheet, lift]) {
      el.style.opacity = String(1 - g * g * g);
      el.style.transform = g ? `translate(${-g * 42}%, ${-g * 10}%) rotate(${-g * 5}deg)` : '';
    }
    if (k < 1) raf = requestAnimationFrame(frame);
    else done();
  };
  const done = () => {
    cancelAnimationFrame(raf);
    box.remove();
    running = null;
    after?.();
  };
  running = done;
  audio.peel();
  raf = requestAnimationFrame(frame);
}
