/**
 * Shared behaviour of the flat pages: lighting, language, the nav entry that
 * turns from "Register" into "My file", and sound on the first gesture.
 */
import { audio } from './audio';
import { isZh, markDocument, onLang, setLang, t, translateDom } from './i18n';
import { prefs, reducedMotion } from './prefs';
import { fileNo, loadVisitor } from './visitor/store';

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
    me.classList.toggle('is-new', !v);
  };

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
