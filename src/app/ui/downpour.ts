/**
 * The page falls back to 1900 in a cloudburst, then the Office revises it.
 *
 * One timeline drives everything, so there are no hard cuts: the page tears,
 * lightning strikes, the whole screen sepia-fades under two layers of rain
 * while a big year counts down, holds in 1900, is stamped REVISED and climbs
 * back. Used by the footer year (nine clicks) and by a deviating baseline test.
 */
import '../../styles/downpour.css';
import { audio } from '../audio';
import { reducedMotion } from '../prefs';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (p: number) => p * p * (3 - 2 * p);
const NS = 'http://www.w3.org/2000/svg';

let storming = false;
export const isStorming = () => storming;

export interface DownpourOpts {
  /** Called while the page sits in 1900 (the deepest point). */
  onPeak?: () => void;
}

interface Drop { x: number; y: number; l: number; v: number }

export async function downpour(opts: DownpourOpts = {}) {
  if (storming) return;
  storming = true;
  const calm = reducedMotion();
  const root = document.documentElement;
  const body = document.body;

  const veil = document.createElement('div');
  veil.className = 'flood';
  veil.setAttribute('aria-hidden', 'true');
  veil.innerHTML = '<canvas class="flood__rain"></canvas><div class="flood__flash"></div><div class="flood__year"><b>1999</b></div><div class="flood__stamp">REVISED</div>';
  root.append(veil);
  const big = veil.querySelector('b')!;
  const stamp = veil.querySelector<HTMLElement>('.flood__stamp')!;
  const flash = veil.querySelector<HTMLElement>('.flood__flash')!;
  const canvas = veil.querySelector('canvas')!;
  const g = canvas.getContext('2d')!;
  const ink = getComputedStyle(body).color || '#222';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const fit = () => {
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  fit();

  // A displacement filter the whole page can be pushed through during the tear
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = '<filter id="n9-tear" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence id="n9-tear-t" type="fractalNoise" baseFrequency="0.002 0.04" numOctaves="1" seed="4" result="n"/><feDisplacementMap id="n9-tear-d" in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter>';
  root.append(svg);
  const turb = svg.querySelector('#n9-tear-t')!;
  const disp = svg.querySelector('#n9-tear-d')!;

  // Two layers of rain, far and near, with ripples where the near drops land
  const mk = (n: number, l: number, v: number): Drop[] =>
    Array.from({ length: calm ? 0 : n }, () => ({ x: Math.random() * 1.3, y: Math.random(), l: l * (0.6 + Math.random() * 0.8), v: v * (0.7 + Math.random() * 0.6) }));
  const far = mk(260, 26, 1.1);
  const near = mk(90, 90, 2.6);
  const ripples: { x: number; y: number; t: number }[] = [];
  let intensity = 1;
  let running = true;
  const rain = () => {
    if (!running) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = ink;
    const W = canvas.width, H = canvas.height;
    const layer = (ds: Drop[], width: number, alpha: number) => {
      g.lineWidth = width * dpr;
      g.globalAlpha = alpha;
      g.beginPath();
      for (const d of ds) {
        d.y += d.v * 0.05 * intensity;
        d.x -= d.v * 0.013 * intensity;
        if (d.y > 1.05) {
          if (width > 1.5 && ripples.length < 40) ripples.push({ x: d.x, y: 0.9 + Math.random() * 0.1, t: 0 });
          d.y = -0.1;
          d.x = Math.random() * 1.3;
        }
        const x = d.x * W, y = d.y * H, l = d.l * dpr * (0.5 + intensity * 0.5);
        g.moveTo(x, y);
        g.lineTo(x + l * 0.3, y - l);
      }
      g.stroke();
    };
    layer(far, 1, 0.22);
    layer(near, 2.2, 0.5);
    g.lineWidth = 1.2 * dpr;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.t += 0.045;
      if (r.t >= 1) {
        ripples.splice(i, 1);
        continue;
      }
      g.globalAlpha = (1 - r.t) * 0.45;
      g.beginPath();
      g.ellipse(r.x * W, r.y * H, (8 + r.t * 46) * dpr, (2 + r.t * 10) * dpr, 0, 0, Math.PI * 2);
      g.stroke();
    }
    requestAnimationFrame(rain);
  };

  // The page's own years fall with it
  const swapped: [Text, string][] = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    if (n.nodeValue && n.nodeValue.includes('1999')) swapped.push([n, n.nodeValue]);
  }
  const setYears = (to: string) => swapped.forEach(([n, o]) => (n.nodeValue = o.replace(/1999/g, to)));

  // ---- the page itself: one function of time sets sepia, tear and shake
  let sepia = 0; // 0..1
  let tear = 0; // 0..1
  let lastBody = '';
  const paintBody = (now: number) => {
    const shake = tear * 5;
    const f = `${tear > 0.02 && !calm ? 'url(#n9-tear) ' : ''}sepia(${sepia.toFixed(3)}) saturate(${(1 - 0.35 * sepia).toFixed(3)}) contrast(${(1 + 0.18 * sepia).toFixed(3)}) brightness(${(1 - 0.08 * sepia - (sepia > 0.95 ? Math.random() * 0.03 : 0)).toFixed(3)})`;
    const tf = shake && !calm ? `translate(${((Math.random() - 0.5) * shake).toFixed(1)}px, ${((Math.random() - 0.5) * shake).toFixed(1)}px) scale(${(1 + tear * 0.02).toFixed(4)})` : '';
    const key = f + tf;
    if (key !== lastBody) {
      body.style.filter = sepia > 0.001 || tear > 0.02 ? f : '';
      body.style.transform = tf;
      lastBody = key;
    }
    if (tear > 0.02 && !calm) {
      disp.setAttribute('scale', String(tear * 70));
      turb.setAttribute('baseFrequency', `${0.002 + tear * 0.004} ${0.02 + 0.05 * Math.abs(Math.sin(now / 700))}`);
      turb.setAttribute('seed', String(Math.floor(now / 70) % 50));
    }
    veil.style.setProperty('--split', `${(tear * 6 + sepia * 1.5).toFixed(2)}px`);
  };
  let loop = true;
  const frame = (now: number) => {
    if (!loop) return;
    paintBody(now);
    requestAnimationFrame(frame);
  };

  // Tween any number over `ms`
  const tween = (ms: number, step: (p: number) => void) =>
    new Promise<void>((done) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = clamp((now - t0) / ms);
        step(p);
        p < 1 ? requestAnimationFrame(tick) : done();
      };
      requestAnimationFrame(tick);
    });

  const countdown = (from: number, to: number, ms: number, curve: (p: number) => number) => {
    let last = from;
    return tween(ms, (p) => {
      const v = Math.round(from + (to - from) * curve(p));
      if (v !== last) {
        last = v;
        big.textContent = String(v);
        if (v % 7 === 0) audio.tick();
      }
    });
  };

  requestAnimationFrame(frame);
  requestAnimationFrame(rain);

  if (calm) {
    // no rain, no tear: the page fades through sepia and back
    veil.classList.add('is-on');
    big.textContent = '1900';
    await tween(500, (p) => (sepia = p * 0.9));
    setYears('1900');
    opts.onPeak?.();
    await wait(1100);
    stamp.classList.add('is-down');
    await wait(500);
    big.textContent = '1999';
    setYears('1999');
    await tween(600, (p) => (sepia = 0.9 * (1 - p)));
  } else {
    // 1. the tear: the page starts to come apart
    audio.downpour();
    veil.classList.add('is-on');
    await tween(500, (p) => {
      tear = ease(p);
      sepia = 0.25 * ease(p);
      intensity = 0.4 + p * 0.8;
    });
    // 2. lightning, in a double flash, as the page drops into the rain
    flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0.15, offset: 0.3 }, { opacity: 0.85, offset: 0.42 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    intensity = 1.2;
    // 3. the fall: the year counts down while the page browns
    const fall = countdown(1999, 1900, 2100, (p) => p * p);
    await tween(2100, (p) => {
      tear = 1 - ease(Math.min(1, p * 1.6)) * 0.85;
      sepia = 0.25 + 0.75 * ease(p);
    });
    await fall;
    setYears('1900');
    tear = 0;
    sepia = 1;
    intensity = 0.5;
    opts.onPeak?.();
    // 4. hold in 1900
    await wait(1900);
    // 5. the Office revises it
    stamp.classList.add('is-down');
    audio.stamp();
    await wait(650);
    intensity = 1.5;
    const climb = countdown(1900, 1999, 800, (p) => 1 - (1 - p) * (1 - p));
    await tween(800, (p) => {
      sepia = 1 - 0.7 * ease(p);
      tear = 0.5 * Math.sin(p * Math.PI);
    });
    await climb;
    setYears('1999');
    // 6. the rain lets go
    veil.classList.remove('is-on');
    await tween(700, (p) => {
      sepia = 0.3 * (1 - ease(p));
      tear = 0;
      intensity = 1.5 - p;
    });
  }

  veil.classList.remove('is-on');
  await wait(500);
  loop = false;
  running = false;
  body.style.filter = '';
  body.style.transform = '';
  veil.remove();
  svg.remove();
  storming = false;
}
