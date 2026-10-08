/**
 * The sealed envelope on the visitor's file page. Three turns of string are
 * wound round two discs in a figure of eight. Turning the lower disc (drag
 * round it) takes the string off a turn at a time; at the last turn the
 * loose end drops, the flap lifts, the file is drawn out, and the page shows
 * the file. Once opened, it stays open on this device.
 */
import { audio } from '../audio';
import { reducedMotion } from '../prefs';

const KEY = 'n9:envelope';
const WINDS = 3;

export function opened(no: string) {
  try {
    return localStorage.getItem(KEY) === no;
  } catch {
    return true;
  }
}

/** The file got a new number (a flat drawn late): it stays opened. */
export function keepOpened(no: string) {
  try { localStorage.setItem(KEY, no); } catch { /* ignore */ }
}

export function reseal() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to undo */
  }
}

/**
 * Show the envelope and resolve once it has been opened.
 * Disc centres are in the SVG's 1000 × 700 box.
 */
export function sealed(no: string, fill: (el: { no: HTMLElement; sheetNo: HTMLElement; code: HTMLElement; district: HTMLElement; to: HTMLElement; date: HTMLElement }) => void): Promise<void> {
  const $ = (id: string) => document.getElementById(id)!;
  const root = $('senv');
  const env = $('senv-env');
  const path = $('senv-path');
  const upper = $('senv-upper');
  const lower = $('senv-lower');
  fill({ no: $('senv-no'), sheetNo: $('senv-sheet-no'), code: $('senv-code'), district: $('senv-district'), to: $('senv-to'), date: $('senv-date') });
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('is-on'));

  const U = { x: 500, y: 236 }, D = { x: 500, y: 352 }, R = 30;
  let winds = WINDS;
  let spin = 0;
  let done = false;

  /** Figure of eight round both discs, `w` turns of it, and the loose end hanging. */
  const draw = () => {
    const pts: [number, number][] = [];
    const m = { x: (U.x + D.x) / 2, y: (U.y + D.y) / 2 };
    const d = (D.y - U.y) / 2;
    const total = Math.PI * 2 * winds;
    const steps = Math.max(1, Math.ceil(winds * 64));
    const t0 = Math.PI / 2;
    for (let i = 0; i <= steps && winds > 0.01; i++) {
      const a = t0 + (total * i) / steps;
      const loop = (a - t0) / (Math.PI * 2);
      const s = 1 + loop * 0.06;
      pts.push([m.x + R * 1.35 * s * Math.sin(2 * a), m.y + (d + R * 0.92) * s * Math.sin(a)]);
    }
    const end = pts.length ? pts[pts.length - 1] : [D.x, D.y + R];
    if (!pts.length) pts.push([end[0], end[1]]);
    const loose = 70 + (1 - winds / WINDS) * 260;
    const sway = 24 + (1 - winds / WINDS) * 46;
    for (let i = 1; i <= 12; i++) {
      const k = i / 12;
      pts.push([end[0] + Math.sin(k * Math.PI) * sway, end[1] + loose * k]);
    }
    path.setAttribute('d', 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'));
    lower.style.transform = `translate(-50%, -50%) rotate(${spin}rad)`;
    upper.style.transform = `translate(-50%, -50%) rotate(${-spin * 0.8}rad)`;
  };
  draw();

  return new Promise((resolve) => {
    let lastTurn = WINDS;
    const take = (by: number) => {
      if (done) return;
      winds = Math.max(0, winds - by);
      spin += by * Math.PI * 2;
      if (Math.ceil(winds) < lastTurn) {
        lastTurn = Math.ceil(winds);
        audio.pluck();
      }
      draw();
      if (winds <= 0) open();
    };

    // drag round the lower disc: every full circle takes one turn off
    let last: number | null = null;
    const centre = () => {
      const r = lower.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    env.addEventListener('pointerdown', (e) => {
      if (done) return;
      const c = centre();
      last = Math.atan2(e.clientY - c.y, e.clientX - c.x);
      env.setPointerCapture(e.pointerId);
      root.classList.add('is-turning');
    });
    env.addEventListener('pointermove', (e) => {
      if (last === null || done) return;
      const c = centre();
      const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
      let da = a - last;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      last = a;
      // either way round undoes it; a nudge counts for less than a turn
      take(Math.abs(da) / (Math.PI * 2));
      if (Math.abs(da) > 0.15) audio.tick();
    });
    const up = () => {
      last = null;
      root.classList.remove('is-turning');
    };
    env.addEventListener('pointerup', up);
    env.addEventListener('pointercancel', up);

    // or let someone else do it
    document.getElementById('senv-unwind')!.addEventListener('click', () => {
      if (reducedMotion()) return take(WINDS);
      const from = winds, t0 = performance.now(), ms = 1700;
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / ms);
        const eased = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        take(winds - from * (1 - eased));
        if (k < 1 && !done) requestAnimationFrame(step);
      };
      step();
    });

    // string off: the end drops, the flap lifts, the file comes out
    function open() {
      done = true;
      try {
        localStorage.setItem(KEY, no);
      } catch {
        /* opens again next time */
      }
      const steps: [string, number, () => void][] = [
        ['is-loose', 0, () => audio.pluck()],
        ['is-flap', 650, () => audio.paper()],
        ['is-out', 1500, () => audio.drawer()],
        ['is-gone', 2700, () => {}],
      ];
      const fast = reducedMotion();
      for (const [cls, at, sound] of steps)
        window.setTimeout(() => {
          root.classList.add(cls);
          sound();
        }, fast ? 0 : at);
      window.setTimeout(() => {
        root.hidden = true;
        resolve();
      }, fast ? 0 : 3300);
    }
  });
}
