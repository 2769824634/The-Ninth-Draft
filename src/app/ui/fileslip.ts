/**
 * Call slips. Outside the archive a file is never fetched for you: a file
 * mentioned in the library, the office or on a flat page opens a small slip
 * where it is mentioned (number, title, abstract, and which drawer and folder
 * it is kept in). Going to the archive is a separate, deliberate step.
 */
import { audio } from '../audio';
import { isFiled } from '../island';
import { isZh, onLang, t } from '../i18n';
import { reducedMotion } from '../prefs';
import { fromHere } from './recordlink';
import { esc } from './text';

interface Texts { title: string; subtitle?: string; place?: string; summary: string }
interface FileEntry { file: string; slug: string; category: string; stamp: string; date?: string; en: Texts; zh?: Texts }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CAT_LABEL: Record<string, string> = { personnel: 'Personnel', events: 'Events', programs: 'Programs' };

const CLR: Record<string, string> = { 'TOP SECRET': 'top', SECRET: 'secret', CONFIDENTIAL: 'conf', RESTRICTED: 'restr' };

let index: { categories: string[]; files: FileEntry[] } | null = null;
let slip: HTMLElement | null = null;
let base = '/';

const load = () => {
  if (index) return index;
  const el = document.getElementById('file-index');
  index = el ? JSON.parse(el.textContent || '{}') : { categories: [], files: [] };
  return index!;
};

const longDate = (s?: string) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return isZh() ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

/** The final text, flattened: struck words and margin notes gone, black bars stay black. */
const plain = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('.rv-note, .rv[data-del]').forEach((x) => x.remove());
  d.querySelectorAll<HTMLElement>('.redact, .rv[data-redact]').forEach((x) => {
    const n = x.dataset.redact?.split('-').map(Number);
    if (!n || (n[0] <= 9 && 9 <= (n[1] ?? 9))) x.textContent = '█'.repeat(Math.max(3, Math.min(12, (x.textContent ?? '').length)));
  });
  return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
};

/** Drawer and folder, counted the way the archive counts them: only what is on file today. */
const shelfMark = (f: FileEntry) => {
  const { categories, files } = load();
  const drawer = categories.indexOf(f.category) + 1;
  const folder = files.filter((x) => x.category === f.category && isFiled(x.date)).indexOf(f) + 1;
  const two = (n: number) => String(n).padStart(2, '0');
  return isZh() ? `档案室 · 第 ${two(drawer)} 抽屉 · 第 ${two(folder)} 夹` : `Archive · Drawer ${two(drawer)} · Folder ${two(folder)}`;
};

export const slugFromHref = (href: string) => {
  const u = new URL(href, location.href);
  if (u.origin !== location.origin) return null;
  return u.pathname.match(/\/records\/([^/]+)\/?$/)?.[1] ?? null;
};

export function closeFile() {
  if (!slip || slip.hidden) return false;
  slip.hidden = true;
  return true;
}

/** Open the slip for a file. `at` is what was clicked; without it the slip lies at the side. */
export function openFile(slugOrFile: string, at?: Element | null) {
  const key = slugOrFile.toLowerCase();
  const f = load().files.find((x) => x.slug === key);
  if (!slip) build();
  const s = slip!;
  const zh = isZh();
  if (!f || !isFiled(f.date)) {
    s.innerHTML = `
      <div class="fslip__head micro"><span class="fslip__kick">${esc(t('Call slip'))}</span>
        <button type="button" class="fslip__x" data-fslip-close aria-label="${esc(t('Close'))}">×</button></div>
      <p class="fslip__none">${esc(t('Not on file yet'))}</p>`;
  } else {
    const tx = (zh && f.zh) || f.en;
    const sum = plain(tx.summary);
    const when = [longDate(f.date), tx.place].filter(Boolean).join(' · ');
    s.innerHTML = `
      <div class="fslip__head micro"><span class="fslip__kick">${esc(t('Call slip'))}</span>
        <button type="button" class="fslip__x" data-fslip-close aria-label="${esc(t('Close'))}">×</button></div>
      <div class="fslip__no micro"><b>${esc(f.file)}</b><span>${esc(t(CAT_LABEL[f.category] ?? f.category))}</span><span class="fslip__stamp">${esc(f.stamp)}</span></div>
      <p class="fslip__title">${esc(tx.title)}</p>
      ${tx.subtitle ? `<p class="fslip__sub">${esc(tx.subtitle)}</p>` : ''}
      ${when ? `<p class="fslip__when micro">${esc(when)}</p>` : ''}
      <p class="fslip__label micro">${esc(t('Abstract'))}</p>
      <p class="fslip__sum">${esc(sum.length > 360 ? `${sum.slice(0, 340).replace(/\s+\S*$/, '')}…` : sum)}</p>
      <div class="fslip__kept">
        <span class="micro">${esc(t('Kept in'))}</span>
        <b>${esc(shelfMark(f))}</b>
      </div>
      <a class="fslip__go" href="${esc(fromHere(`${base}records/${f.slug}/`))}" data-fslip-go>${esc(t('Request it from the archive'))} →</a>`;
  }
  s.dataset.clr = CLR[f?.stamp ?? ''] ?? '';
  s.hidden = false;
  place(s, at);
  audio.paper();
  if (!reducedMotion()) s.animate([{ opacity: 0, transform: 'translateY(10px) rotate(-1.4deg)' }, { opacity: 1, transform: 'rotate(-.6deg)' }], { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
  s.querySelector<HTMLElement>('.fslip__go, .fslip__x')?.focus({ preventScroll: true });
}

function place(s: HTMLElement, at?: Element | null) {
  s.style.left = s.style.top = '';
  s.classList.toggle('is-aside', !at);
  if (!at || window.matchMedia('(max-width: 640px)').matches) return;
  const m = at.getBoundingClientRect(), w = s.offsetWidth, h = s.offsetHeight;
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, m.left - w * 0.15));
  let top = m.bottom + 10;
  if (top + h > window.innerHeight - 12) top = Math.max(12, m.top - h - 10);
  s.style.left = `${left}px`;
  s.style.top = `${top}px`;
}

function build() {
  slip = document.createElement('aside');
  slip.className = 'fslip';
  slip.hidden = true;
  slip.setAttribute('role', 'dialog');
  slip.setAttribute('aria-label', 'Call slip');
  slip.dataset.noI18n = '';
  document.body.appendChild(slip);
  slip.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-fslip-close]')) closeFile();
  });
  slip.addEventListener('pointerdown', (e) => e.stopPropagation());
  // a click anywhere else puts the slip down
  document.addEventListener('pointerdown', () => closeFile());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closeFile()) e.stopImmediatePropagation();
  }, true);
  window.addEventListener('scroll', () => closeFile(), { passive: true });
  onLang(() => closeFile());
}

/** Links to /records/… anywhere on the page open the slip instead of leaving. */
export function fileSlips(siteBase: string) {
  base = siteBase;
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('data-fslip-go')) return;
    const slug = slugFromHref(a.href);
    if (!slug) return;
    e.preventDefault();
    openFile(slug, a);
  });
}
