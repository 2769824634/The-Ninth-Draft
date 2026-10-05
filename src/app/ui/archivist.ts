/**
 * ARCHIVIST: the archive's resident voice. Dry, a little mean, always watching.
 * Lines live in src/data/archivist.json; this module only picks and types them.
 */
import type { ArchivistLines } from '../types';
import { reducedMotion } from '../prefs';
import { audio } from '../audio';
import { isZh } from '../i18n';
import zhLines from '../../data/archivist.zh.json';

type Vars = Record<string, string | number>;

export class Archivist {
  private line = document.getElementById('voice-line')!;
  private box = document.getElementById('voice')!;
  private last = new Map<string, string>();
  private typing = 0;
  private idleTimer = 0;
  private quietUntil = 0;

  constructor(private lines: ArchivistLines, private idleKey = 'idle') {
    const reset = () => this.armIdle();
    ['pointerdown', 'keydown', 'wheel'].forEach((e) => window.addEventListener(e, reset, { passive: true }));
    this.armIdle();
  }

  /** Pick a line for an event. `key` may be "open.SECRET" style for nested groups. */
  pick(key: string, vars: Vars = {}): string | null {
    const [group, sub] = key.split('.');
    const g = (isZh() ? (zhLines as unknown as ArchivistLines) : this.lines)[group];
    const list = Array.isArray(g) ? g : sub && g ? g[sub] : null;
    if (!list || !list.length) return null;
    const prev = this.last.get(key);
    const pool = list.length > 1 ? list.filter((l) => l !== prev) : list;
    const raw = pool[Math.floor(Math.random() * pool.length)];
    this.last.set(key, raw);
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  }

  /** A whole group of lines in the current language (e.g. the boot sequence). */
  list(group: string): string[] {
    const g = (isZh() ? (zhLines as unknown as ArchivistLines) : this.lines)[group];
    return Array.isArray(g) ? g : [];
  }

  /** Say something. `priority` lines interrupt; others wait for a quiet moment. */
  say(key: string, vars: Vars = {}, priority = true) {
    const now = performance.now();
    if (!priority && now < this.quietUntil) return;
    const text = this.pick(key, vars);
    if (!text) return;
    this.quietUntil = now + 4000;
    this.type(text);
  }

  private type(text: string) {
    window.clearTimeout(this.typing);
    this.box.classList.add('is-speaking');
    if (reducedMotion()) {
      this.line.textContent = text;
      return;
    }
    let i = 0;
    const step = () => {
      i = Math.min(text.length, i + 2);
      this.line.textContent = text.slice(0, i);
      if (i % 6 === 0) audio.tick();
      if (i < text.length) this.typing = window.setTimeout(step, 22);
      else this.typing = window.setTimeout(() => this.box.classList.remove('is-speaking'), 2400);
    };
    step();
  }

  private armIdle() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.say(this.idleKey, {}, false);
      this.armIdle();
    }, 45000);
  }
}
