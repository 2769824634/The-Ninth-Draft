/**
 * Shared behaviour of the flat pages: lighting, language, the nav entry that
 * turns from "Register" into "My file", and sound on the first gesture.
 */
import { audio } from './audio';
import { isZh, markDocument, onLang, setLang, t, translateDom } from './i18n';
import { prefs, reducedMotion } from './prefs';
import { fileNo, loadVisitor } from './visitor/store';
import { hideFuture, hms, islandDateLabel, islandNow, visitorClock } from './island';

export function flat(relang?: () => void) {
  const root = document.querySelector<HTMLElement>('.flat')!;
  const base = (document.querySelector<HTMLAnchorElement>('.fhead__brand')?.getAttribute('href')) ?? '/';
  markDocument();

  const applyTheme = (th: 'day' | 'night') => {
    prefs.set('theme', th);
    document.documentElement.dataset.theme = th;
    document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  };
  applyTheme(prefs.get('theme'));
  document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.click();
      applyTheme(b.dataset.themeSet as 'day' | 'night');
    }),
  );

  // Registered visitors get their own file in the nav
  const me = document.getElementById('nav-me') as HTMLAnchorElement | null;
  const markMe = () => {
    const v = loadVisitor();
    if (!me) return;
    me.href = v ? `${base}me/` : `${base}register/`;
    me.querySelector('span')!.textContent = v ? `${t('My file')} · ${fileNo(v)}` : t('Register');
    soundLabel();
    me.classList.toggle('is-new', !v);
  };

  // Sound: same switch as in the archive room
  const sound = document.getElementById('btn-sound');
  const soundLabel = () => {
    const on = prefs.get('sound');
    sound?.setAttribute('aria-pressed', String(on));
    const l = document.getElementById('sound-label');
    if (l) l.textContent = t(on ? 'Sound on' : 'Sound off');
  };
  sound?.addEventListener('click', () => {
    audio.unlock();
    prefs.set('sound', !prefs.get('sound'));
    audio.apply();
    audio.click();
    soundLabel();
  });

  // The island's date and time in the footer, with the visitor's own beside it
  const foot = document.querySelector<HTMLElement>('[data-island-clock]');
  const tick = () => {
    if (!foot) return;
    const zh = isZh(), d = islandNow(), you = visitorClock();
    foot.textContent = `${zh ? '霏微记录署' : 'Gerimis Records Office'} · ${islandDateLabel(zh)} · ${hms(d.hours, d.minutes)}${you ? ` · ${zh ? '你那边' : 'yours'} ${you}` : ''}`;
  };
  tick();
  window.setInterval(tick, 15000);
  hideFuture();
  onLang(tick);

  const title = document.title;
  translateDom(root);
  document.title = t(title);
  markMe();
  document.getElementById('btn-lang')!.addEventListener('click', () => setLang(isZh() ? 'en' : 'zh'));
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'l' || e.key === 'L') setLang(isZh() ? 'en' : 'zh');
    if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
    if (e.key === '/') {
      e.preventDefault();
      location.href = `${base}#index`;
    }
    if (e.key === 'w' || e.key === 'W') location.href = `${base}wall/`;
  });
  onLang(() => {
    audio.click();
    const main = document.getElementById('fmain')!;
    const swap = () => {
      translateDom(root);
      document.title = t(title);
      markMe();
      relang?.();
    };
    if (reducedMotion()) return swap();
    const out = main.animate([{ opacity: 1 }, { opacity: 0, filter: 'blur(2px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => {
      swap();
      out.cancel();
      main.animate([{ opacity: 0, filter: 'blur(2px)' }, { opacity: 1, filter: 'none' }], { duration: 300, easing: 'ease-out' });
    };
  });

  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  return { base, markMe };
}
