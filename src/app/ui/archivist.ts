/**
 * ARCHIVIST: the archive's resident voice. Dry, a little mean, always watching.
 * Lines live in src/data/archivist.json; this module only picks and types them.
 */
import type { ArchivistLines } from '../types';
import { reducedMotion } from '../prefs';
import { audio } from '../audio';
import { isZh } from '../i18n';
import zhLines from '../../data/archivist.zh.json';
import { islandRaining } from '../weather';

/** Lines that say it is raining right now. On a dry island day they stay unsaid, so the clerk agrees with the window. */
const WET_NOW = /raining|this rain|this weather|rain didn't|rain off the windows|rain gets louder|rain on the skylight|wet shoes|下雨了|在下雨|这种天气|雨没出去|窗上的雨水|雨声就大了|雨打在|鞋是湿的|这个雨/i;
const DRY_TODAY = !islandRaining();

type Vars = Record<string, string | number>;

export class Archivist {
  private line = document.getElementById('voice-line')!;
  private box = document.getElementById('voice')!;
  private last = new Map<string, string>();
  private typing = 0;
  private idleTimer = 0;
  private quietUntil = 0;
  /** The slip in the margin of an open file: the line now, and the two before it. */
  private slip = document.getElementById('ds-voice');
  private slipNow = document.getElementById('ds-voice-now');
  private slipWas = document.getElementById('ds-voice-was');
  private said: string[] = [];
  private fresh = 0;

  constructor(private lines: ArchivistLines, private idleKey = 'idle') {
    const reset = () => this.armIdle();
    // on a phone the slip tucks itself away; its tag pulls it out again
    document.getElementById('ds-voice-tag')?.addEventListener('click', () => {
      const open = !this.slip!.classList.contains('is-open');
      this.slip!.classList.toggle('is-open', open);
      document.getElementById('ds-voice-tag')!.setAttribute('aria-expanded', String(open));
    });
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
    let usable = list;
    if (DRY_TODAY) {
      const dry = list.filter((l) => !WET_NOW.test(l));
      if (dry.length) usable = dry;
    }
    const pool = usable.length > 1 ? usable.filter((l) => l !== prev) : usable;
    const raw = pool[Math.floor(Math.random() * pool.length)];
    this.last.set(key, raw);
    return raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  }

  /** A whole group of lines in the current language (e.g. the boot sequence). */
  list(group: string): string[] {
    const g = (isZh() ? (zhLines as unknown as ArchivistLines) : this.lines)[group];
    const all = Array.isArray(g) ? g : [];
    return DRY_TODAY ? all.filter((l) => !WET_NOW.test(l)) : all;
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
    this.toSlip(text);
    if (reducedMotion()) {
      this.line.textContent = text;
      if (this.slipNow) this.slipNow.textContent = text;
      return;
    }
    let i = 0;
    const step = () => {
      i = Math.min(text.length, i + 2);
      this.line.textContent = text.slice(0, i);
      if (this.slipNow) this.slipNow.textContent = text.slice(0, i);
      if (i % 6 === 0) audio.tick();
      if (i < text.length) this.typing = window.setTimeout(step, 22);
      else this.typing = window.setTimeout(() => this.box.classList.remove('is-speaking'), 2400);
    };
    step();
  }

  /** A new line goes on the slip; the last one moves down and greys, the oldest drops off. */
  private toSlip(text: string) {
    if (!this.slip || !this.slipNow || !this.slipWas) return;
    const prev = this.said[0];
    this.said.unshift(text);
    this.said.length = Math.min(this.said.length, 3);
    if (prev) {
      const li = document.createElement('li');
      li.textContent = prev;
      this.slipWas.prepend(li);
      while (this.slipWas.children.length > 2) this.slipWas.lastElementChild!.remove();
      if (!reducedMotion()) li.animate([{ opacity: 0, transform: 'translateY(-.6rem)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    // fresh for a few seconds: on a phone that is how long it stays out
    this.slip.classList.add('is-fresh');
    window.clearTimeout(this.fresh);
    this.fresh = window.setTimeout(() => this.slip!.classList.remove('is-fresh'), 6500);
  }

  private armIdle() {
    window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.say(this.idleKey, {}, false);
      this.armIdle();
    }, 45000);
  }
}
