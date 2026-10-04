/** Boot: the seal draws itself, clearance is confirmed, the visitor enters. */
import { reducedMotion } from '../prefs';
import { audio } from '../audio';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function boot(root: HTMLElement, ready: Promise<unknown>, lines: string[] = []): Promise<void> {
  const line = document.getElementById('boot-line')!;
  const bar = document.getElementById('boot-bar')!;
  const caption = document.getElementById('boot-caption')!;
  const enter = document.getElementById('boot-enter') as HTMLButtonElement;
  const bootEl = document.getElementById('boot')!;
  const sat = root.querySelector<SVGCircleElement>('.seal__sat');

  // Satellite rides the seal's orbit
  let raf = 0;
  const orbit = (t: number) => {
    const a = t / 1400;
    const x = Math.cos(a) * 112, y = Math.sin(a) * 34;
    const r = (-24 * Math.PI) / 180;
    sat?.setAttribute('cx', String(120 + x * Math.cos(r) - y * Math.sin(r)));
    sat?.setAttribute('cy', String(120 + x * Math.sin(r) + y * Math.cos(r)));
    raf = requestAnimationFrame(orbit);
  };
  raf = requestAnimationFrame(orbit);

  let skipped = false;
  const skip = () => (skipped = true);
  window.addEventListener('keydown', skip, { once: true });

  const steps = [...(lines.length ? lines.slice(0, 3) : ['Establishing secure line', 'Verifying clearance', 'Indexing drawers']), 'Ready'];
  const full = 'Clearance confirmed : Visitor';
  if (!reducedMotion()) {
    for (let i = 0; i < steps.length - 1 && !skipped; i++) {
      caption.textContent = steps[i];
      bar.style.transform = `scaleX(${(i + 1) / steps.length})`;
      await wait(520);
    }
  }
  await ready;
  bar.style.transform = 'scaleX(1)';
  caption.textContent = steps[steps.length - 1];

  if (!reducedMotion() && !skipped) {
    for (let i = 1; i <= full.length; i++) {
      line.textContent = full.slice(0, i);
      await wait(28 + Math.random() * 30);
    }
  } else line.textContent = full;

  enter.classList.add('is-ready');
  caption.textContent = 'Press Enter or click to open the archive';

  await new Promise<void>((resolve) => {
    const go = () => {
      window.removeEventListener('keydown', onKey);
      enter.removeEventListener('click', go);
      bootEl.removeEventListener('click', go);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') go();
    };
    window.addEventListener('keydown', onKey);
    enter.addEventListener('click', go);
    bootEl.addEventListener('click', go);
  });

  audio.unlock();
  audio.powerUp();
  window.setTimeout(() => audio.stamp(), 1700);
  root.dataset.boot = 'off';
  setTimeout(() => cancelAnimationFrame(raf), 1000);
}
