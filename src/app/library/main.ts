/**
 * Library page: the stacks (scene.ts), the shelf list beside them, and the
 * reader that opens when a book is taken down. Without WebGL the list and
 * the reader still work; the books simply don't move.
 */
import type { LibBay, LibBook, LibPage } from '../../lib/library';
import type { ArchivistLines } from '../types';
import { flat } from '../flat';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { prefs, reducedMotion } from '../prefs';
import { Archivist } from '../ui/archivist';
import { loadVisitor } from '../visitor/store';
import { hash } from '../scene/textures';
import { LibraryScene } from './scene';
import lines from '../../data/archivist.json';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const KEY = 'n9:library';

export function library() {
  const $ = (id: string) => document.getElementById(id)!;
  const bays = JSON.parse($('lib-data').textContent || '[]') as LibBay[];
  const all = bays.flatMap((b, i) => b.books.map((book) => ({ book, bay: i })));
  const root = $('lib');
  const reader = $('lib-reader');
  const voice = new Archivist(lines as unknown as ArchivistLines, 'library.idle');
  const L = (x: { en: string; zh: string }) => (isZh() ? x.zh : x.en);

  let bay = 0;
  let open: { book: LibBook; pages: LibPage[]; page: number } | null = null;
  let scene: LibraryScene | null = null;

  /* ---------------- borrowing card ---------------- */
  const loans = (): Record<string, number> => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}').loans ?? {};
    } catch {
      return {};
    }
  };
  const lend = (id: string) => {
    const l = loans();
    l[id] = (l[id] ?? 0) + 1;
    try {
      localStorage.setItem(KEY, JSON.stringify({ loans: l }));
    } catch {
      /* the card stays blank */
    }
    return l[id];
  };

  /** The date-due slip at the back: earlier stamps from the book, today's from you. */
  const dueSlip = (book: LibBook, times: number): LibPage => {
    const h = hash(book.id);
    const n = 1 + (h % 4);
    const stamps: string[] = [];
    for (let i = 0; i < n; i++) stamps.push(`09 ${MON[(h >>> (i * 3)) % 11]} 1999`);
    stamps.sort((a, b) => MON.indexOf(a.slice(3, 6)) - MON.indexOf(b.slice(3, 6)));
    const now = new Date();
    const today = `${String(now.getDate()).padStart(2, '0')} ${MON[now.getMonth()]} 1999`;
    const v = loadVisitor();
    const who = v ? v.code : null;
    const li = (s: string, mine = false) => `<li${mine ? ' class="is-mine"' : ''}><b class="lib-stamp">${s}</b>${mine ? `<span>${who ? (isZh() ? `借阅人：${who}` : `Borrower: ${who}`) : isZh() ? '借阅人：未登记访客' : 'Borrower: unregistered visitor'}</span>` : ''}</li>`;
    const mine = Array.from({ length: Math.min(times, 3) }, () => li(today, true)).join('');
    return {
      head: { en: 'Date due', zh: '还书日期' },
      html: {
        en: `<p>Return by the date last stamped. This book may not leave the reading room.</p><ol class="lib-due">${stamps.map((s) => li(s)).join('')}${mine}</ol>`,
        zh: `<p>请于最后一个日期前归还。本书不得带出资料室。</p><ol class="lib-due">${stamps.map((s) => li(s)).join('')}${mine}</ol>`,
      },
    };
  };

  /* ---------------- shelf list ---------------- */
  const shelf = $('lib-shelf');
  const drawShelf = () => {
    const b = bays[bay];
    shelf.innerHTML = '';
    b.books.forEach((book, i) => {
      if (b.gapAt === i) shelf.append(gapItem());
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.book = book.id;
      btn.innerHTML = `<i>${book.mark}</i><span></span>`;
      btn.querySelector('span')!.textContent = `${L(book.spine)} · ${L(book.sub)}`;
      btn.style.setProperty('--cloth', book.color);
      btn.addEventListener('click', () => take(book.id));
      btn.addEventListener('pointerenter', () => callout(book, false));
      btn.addEventListener('pointerleave', () => callout(null, false));
      li.append(btn);
      shelf.append(li);
    });
    if (b.gapAt === b.books.length) shelf.append(gapItem());
    document.querySelectorAll<HTMLButtonElement>('#lib-bays button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.bay) === bay)));
  };
  const gapItem = () => {
    const li = document.createElement('li');
    li.className = 'is-gap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `<i>DS/Y2K/09</i><span>${isZh() ? '（空）' : '(empty)'}</span>`;
    btn.addEventListener('click', gap);
    li.append(btn);
    return li;
  };
  const gap = () => {
    audio.tick();
    voice.say('library.gap');
  };

  const call = $('lib-callout');
  const callout = (book: LibBook | null, isGap: boolean) => {
    if (isGap) {
      call.textContent = `DS/Y2K/09 · ${isZh() ? '空位' : 'Empty slot'}`;
      call.classList.add('is-on');
      return;
    }
    if (!book) return call.classList.remove('is-on');
    const n = book.pages.length + 1;
    call.textContent = `${book.mark} · ${L(book.spine)} · ${isZh() ? `${n} 页` : `${n} pages`}`;
    call.classList.add('is-on');
  };

  /* ---------------- reader ---------------- */
  const show = (page: number, dir = 0) => {
    if (!open) return;
    open.page = page;
    const p = open.pages[page];
    const paint = () => {
      $('rd-mark').textContent = `${open!.book.mark}`;
      $('rd-book').textContent = `${L(open!.book.spine)} · ${L(open!.book.sub)}`;
      $('rd-head').textContent = L(p.head);
      $('rd-body').innerHTML = L(p.html);
      $('rd-no').textContent = isZh() ? `第 ${page + 1} 页 / 共 ${open!.pages.length} 页` : `p. ${page + 1} / ${open!.pages.length}`;
      ($('rd-prev') as HTMLButtonElement).disabled = page === 0;
      ($('rd-next') as HTMLButtonElement).disabled = page === open!.pages.length - 1;
    };
    const el = $('rd-page');
    if (!dir || reducedMotion()) return paint();
    const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 14}px)` }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => {
      paint();
      out.cancel();
      el.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
    };
  };

  const turn = (dir: number) => {
    if (!open) return;
    const n = open.page + dir;
    if (n < 0 || n >= open.pages.length) return;
    audio.paper();
    scene?.turn(n);
    show(n, dir);
  };

  function take(id: string) {
    const hit = all.find((x) => x.book.id === id);
    if (!hit) return;
    if (open?.book.id === id) return;
    const { book } = hit;
    const times = lend(id);
    const pages = [...book.pages, dueSlip(book, times)];
    open = { book, pages, page: 0 };
    if (hit.bay !== bay) {
      bay = hit.bay;
      drawShelf();
    }
    audio.drawer();
    root.dataset.state = 'open';
    reader.setAttribute('aria-hidden', 'false');
    show(0);
    callout(null, false);
    history.replaceState(null, '', `#${id}`);
    if (scene) scene.take(id, pages, 0);
    else reader.classList.add('is-on');
    if (times > 1) voice.say('library.again', { title: L(book.spine) });
    else if (book.kind === 'news') voice.say('library.daily');
    else if (book.kind === 'binder') voice.say('library.binder');
    else voice.say('library.open', { title: L(book.spine) });
  }

  const close = () => {
    if (!open) return;
    open = null;
    audio.close();
    reader.classList.remove('is-on');
    reader.setAttribute('aria-hidden', 'true');
    root.dataset.state = 'shelf';
    history.replaceState(null, '', location.pathname);
    scene?.shelve();
    voice.say('library.return', {}, false);
  };

  $('rd-close').addEventListener('click', close);
  $('rd-prev').addEventListener('click', () => turn(-1));
  $('rd-next').addEventListener('click', () => turn(1));
  document.querySelectorAll<HTMLButtonElement>('#lib-bays button').forEach((b) =>
    b.addEventListener('click', () => {
      if (open) close();
      goBay(Number(b.dataset.bay));
    }),
  );
  const goBay = (i: number) => {
    const n = Math.max(0, Math.min(bays.length - 1, i));
    if (n !== bay) audio.tick();
    bay = n;
    drawShelf();
    scene?.goBay(n);
  };

  // swipe between pages on a phone
  let sx = 0, sy = 0;
  reader.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  reader.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (open) {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        turn(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        turn(-1);
      }
      return;
    }
    if (e.key === 'ArrowRight') goBay(bay + 1);
    else if (e.key === 'ArrowLeft') goBay(bay - 1);
  });

  /* ---------------- the room ---------------- */
  const canvas = $('lib-canvas') as HTMLCanvasElement;
  try {
    scene = new LibraryScene(canvas, bays, {
      hover: (b, g) => callout(b, g),
      open: () => {},
      ready: () => {
        if (open) reader.classList.add('is-on');
      },
      closed: () => {},
      gap,
      bay: (i) => {
        if (i === bay || open) return;
        bay = Math.max(0, Math.min(bays.length - 1, i));
        drawShelf();
      },
    });
    scene.picked = (b) => take(b.id);
    scene.setTheme(prefs.get('theme'));
    requestAnimationFrame(() => root.classList.add('is-lit'));
  } catch (err) {
    console.error('[library] stacks unavailable', err);
    root.classList.add('no-webgl', 'is-lit');
  }

  // theme buttons live in the shared header; follow them
  new MutationObserver(() => scene?.setTheme(document.documentElement.dataset.theme === 'night' ? 'night' : 'day')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  flat(() => {
    drawShelf();
    if (open) show(open.page);
    void scene?.relabel(isZh());
  });
  void scene?.relabel(isZh());
  drawShelf();

  // a book named in the address is taken down on arrival
  const want = location.hash.slice(1);
  window.setTimeout(() => {
    if (want && all.some((x) => x.book.id === want)) take(want);
    else voice.say('library.enter');
  }, 500);
}
