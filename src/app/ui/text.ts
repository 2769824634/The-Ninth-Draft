/** Text motion: per-glyph vertical swap, digit roller, decode. */
import { reducedMotion } from '../prefs';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Replace text by rolling each glyph upward. Unchanged glyphs stay still,
 * so "P-0003" → "P-0004" only moves the last digit.
 */
export function swapText(el: HTMLElement, next: string) {
  const prev = el.dataset.text ?? el.textContent ?? '';
  if (prev === next) return;
  el.dataset.text = next;
  if (reducedMotion() || !prev) {
    el.textContent = next;
    return;
  }
  el.classList.add('swap');
  const len = Math.max(prev.length, next.length);
  let html = '';
  let n = 0;
  for (let i = 0; i < len; i++) {
    const a = prev[i] ?? ' ';
    const b = next[i] ?? ' ';
    const ca = a === ' ' ? '&nbsp;' : esc(a);
    const cb = b === ' ' ? '&nbsp;' : esc(b);
    if (a === b) html += `<span class="swap__c"><span>${cb}</span></span>`;
    else html += `<span class="swap__c" style="--i:${n++}"><span>${ca}</span><span>${cb}</span></span>`;
  }
  el.innerHTML = html;
  void el.offsetWidth;
  el.querySelectorAll('.swap__c').forEach((c) => {
    if (c.children.length > 1) c.classList.add('is-rolled');
  });
  const token = (el.dataset.swapToken = String(Math.random()));
  window.setTimeout(() => {
    if (el.dataset.swapToken === token) el.textContent = next;
  }, 600 + n * 18);
}

/** Two-digit (or more) mechanical roller. Each digit is a 0–9 strip. */
export class Roller {
  private strips: HTMLElement[] = [];
  constructor(private el: HTMLElement, digits = 2) {
    el.innerHTML = '';
    for (let i = 0; i < digits; i++) {
      const d = document.createElement('span');
      d.className = 'roller__d';
      const s = document.createElement('span');
      s.className = 'roller__s';
      s.innerHTML = Array.from({ length: 10 }, (_, k) => `<span>${k}</span>`).join('');
      d.appendChild(s);
      el.appendChild(d);
      this.strips.push(s);
    }
  }
  set(n: number) {
    const str = String(n).padStart(this.strips.length, '0').slice(-this.strips.length);
    this.strips.forEach((s, i) => (s.style.transform = `translateY(${-Number(str[i])}em)`));
    this.el.setAttribute('aria-label', str);
  }
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/-';

/** Decode: characters resolve left to right out of noise. */
export function decode(el: HTMLElement, text: string, duration = 700, onTick?: () => void) {
  if (reducedMotion()) {
    el.textContent = text;
    return;
  }
  const start = performance.now();
  let lastLock = -1;
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const lock = Math.floor(p * text.length);
    if (lock !== lastLock) {
      lastLock = lock;
      onTick?.();
    }
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      out += i < lock || c === ' ' ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export { esc };
