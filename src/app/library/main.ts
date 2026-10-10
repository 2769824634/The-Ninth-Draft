/**
 * Library page: the cutaway reading room (scene.ts), the head column that
 * names its corners and lists what is in them, and the panels that open on
 * the right: the reader, a catalogue drawer, the circulation desk. Without
 * WebGL the lists and panels still work; nothing moves.
 */
import type { CatDrawer, LibBay, LibBook, LibPage } from '../../lib/library';
import { contents } from '../../lib/toc';
import type { ArchivistLines } from '../types';
import { flat } from '../flat';
import { hideFuture, isFiled, islandDate, islandIso } from '../island';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { prefs, reducedMotion } from '../prefs';
import { ask, published } from '../check';
import { Archivist } from '../ui/archivist';
import { whoami } from '../visitor/store';
import { hash } from '../scene/textures';
import { LibraryScene, ZONES, type Zone } from './scene';
import { monthOf, Paper } from './paper';
import lines from '../../data/archivist.json';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const KEY = 'n9:library';

type L = { en: string; zh: string };
const ZONE_NAME: Record<Zone, L> = {
  overview: { en: 'The whole room', zh: '整间阅览室' },
  rack: { en: 'Newspaper rack', zh: '报刊架' },
  stacks: { en: 'Stacks', zh: '书墙' },
  catalogue: { en: 'Card catalogue', zh: '目录卡片柜' },
  desk: { en: 'Circulation desk', zh: '借还台' },
};

interface Store {
  loans: Record<string, number>;
  marks: Record<string, number>;
  stamps: string[];
}

export function library() {
  const $ = (id: string) => document.getElementById(id)!;
  const data = JSON.parse($('lib-data').textContent || '{}') as { bays: LibBay[]; catalogue: CatDrawer[] };
  const { bays, catalogue } = data;
  // A record dated to a day still to come is not bound in, and its card is not in the drawer yet
  for (const b of bays) {
    for (const book of b.books) {
      const kept = book.pages.filter((p) => !p.drop || isFiled(p.date));
      if (kept.length === book.pages.length) continue;
      if (kept[0]?.toc) kept[0] = { ...kept[0], html: contents(kept.slice(1)) };
      book.pages = kept;
    }
  }
  for (const d of catalogue) d.cards = d.cards.filter((c) => isFiled(c.date));
  // the rack only carries the months that have come round on the island
  const thisMonth = islandIso().slice(0, 7);
  const stickMonth = (id: string) => (id === 'daily-early' ? 'early' : `1999-${id.slice(6)}`);
  for (const b of bays) b.books = b.books.filter((book) => book.kind !== 'news' || stickMonth(book.id) <= thisMonth);
  const all = bays.flatMap((b) => b.books.map((book) => ({ book, bay: b })));
  // the counts under the room's name, as they stand today
  const stat = (k: string, n: number) => document.querySelectorAll<HTMLElement>(`[data-stat="${k}"]`).forEach((el) => (el.textContent = String(n)));
  stat('volumes', all.length);
  stat('cards', catalogue.reduce((n, d) => n + d.cards.length, 0));
  const root = $('lib');
  const voice = new Archivist(lines as unknown as ArchivistLines, 'library.idle');
  const T = (x: L) => (isZh() ? x.zh : x.en);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

  let zone: Zone = 'overview';
  let open: { book: LibBook; pages: LibPage[]; page: number } | null = null;
  let drawer = -1;
  let scene: LibraryScene | null = null;
  /** The day to open out, when a newspaper came down for a given day ('' = pick one at the table). */
  let newsDay = '';

  /* ---------------- what the visitor leaves behind ---------------- */
  const load = (): Store => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { loans: s.loans ?? {}, marks: s.marks ?? {}, stamps: s.stamps ?? [] };
    } catch {
      return { loans: {}, marks: {}, stamps: [] };
    }
  };
  const save = (s: Store) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* the card stays blank */
    }
  };
  const today = () => {
    const d = islandDate();
    return `${String(d.getDate()).padStart(2, '0')} ${MON[d.getMonth()]} 1999`;
  };

  /** The date-due slip at the back: earlier stamps from the book, today's from you. */
  const dueSlip = (book: LibBook, times: number): LibPage => {
    const h = hash(book.id);
    const stamps = Array.from({ length: 1 + (h % 4) }, (_, i) => `09 ${MON[(h >>> (i * 3)) % 11]} 1999`).sort((a, b) => MON.indexOf(a.slice(3, 6)) - MON.indexOf(b.slice(3, 6)));
    const v = whoami();
    const who = (zh: boolean) => (v ? (zh ? `借阅人：${esc(v)}` : `Borrower: ${esc(v)}`) : zh ? '借阅人：未登记访客' : 'Borrower: unregistered visitor');
    const li = (s: string, mine: boolean, zh: boolean) => `<li${mine ? ' class="is-mine"' : ''}><b class="lib-stamp">${s}</b>${mine ? `<span>${who(zh)}</span>` : ''}</li>`;
    const list = (zh: boolean) => stamps.map((s) => li(s, false, zh)).join('') + Array.from({ length: Math.min(times, 3) }, () => li(today(), true, zh)).join('');
    return {
      head: { en: 'Date due', zh: '还书日期' },
      html: {
        en: `<p>Return by the date last stamped. This book may not leave the reading room.</p><ol class="lib-due">${list(false)}</ol>`,
        zh: `<p>请于最后一个日期前归还。本书不得带出资料室。</p><ol class="lib-due">${list(true)}</ol>`,
      },
    };
  };

  /* ---------------- head column ---------------- */
  const listEl = $('lib-list');
  const base = document.querySelector<HTMLAnchorElement>('.fhead__brand')?.getAttribute('href') ?? '/';
  const drawList = () => {
    document.querySelectorAll<HTMLButtonElement>('#lib-zones button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zone === zone)));
    $('lib-zone-name').textContent = T(ZONE_NAME[zone]);
    listEl.innerHTML = '';
    const item = (mark: string, label: string, on: () => void, opts: { cloth?: string; dim?: boolean } = {}) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<i>${esc(mark)}</i><span>${esc(label)}</span>`;
      if (opts.cloth) b.style.setProperty('--cloth', opts.cloth);
      if (opts.dim) b.classList.add('is-dim');
      b.addEventListener('click', on);
      li.append(b);
      listEl.append(li);
      return b;
    };
    if (zone === 'overview') {
      for (const z of ZONES.slice(1)) item(String(ZONES.indexOf(z)).padStart(2, '0'), T(ZONE_NAME[z]), () => goZone(z));
    } else if (zone === 'catalogue') {
      catalogue.forEach((d, i) => item(d.cards.length ? `${d.cards.length}` : '—', d.label, () => openDrawer(i), { dim: !d.cards.length }));
    } else {
      for (const { book, bay } of all) {
        if (bay.zone !== zone) continue;
        const b = item(book.mark, `${T(book.spine)} · ${T(book.sub)}`, () => take(book.id), { cloth: book.color });
        b.addEventListener('pointerenter', () => {
          callout(book);
          scene?.peek(book.id);
        });
        b.addEventListener('pointerleave', () => {
          callout(null);
          scene?.peek(null);
        });
        b.addEventListener('focus', () => scene?.peek(book.id));
      }
      // today's paper, laid out whole (the bound months above are kept for the front pages)
      if (zone === 'rack') item('◆', isZh() ? '今天的报纸' : "Today's paper", () => takeDay(islandIso()));
    }
  };

  const goZone = (z: Zone) => {
    if (open) close();
    closePanels();
    if (scene) scene.goZone(z);
    else setZone(z);
  };
  const setZone = (z: Zone) => {
    if (z === zone) return;
    zone = z;
    root.dataset.zone = z;
    audio.tick();
    drawList();
    if (z !== 'overview') voice.say(`library.${z}`, {}, false);
    if (z === 'desk') showDesk();
  };

  const gap = () => {
    audio.tick();
    voice.say('library.gap');
  };

  const call = $('lib-callout');
  const callout = (book: LibBook | null, text?: string) => {
    if (!book && !text) return call.classList.remove('is-on');
    call.textContent = book ? `${book.mark} · ${T(book.spine)} · ${isZh() ? `${book.pages.length} 页` : `${book.pages.length} pp.`}` : text!;
    call.classList.add('is-on');
  };

  /* ---------------- panels ---------------- */
  const reader = $('lib-reader');
  const catPanel = $('lib-cat');
  const deskPanel = $('lib-desk');
  const panel = (el: HTMLElement | null) => {
    for (const p of [reader, catPanel, deskPanel]) {
      const on = p === el;
      p.classList.toggle('is-on', on);
      p.setAttribute('aria-hidden', String(!on));
    }
    root.dataset.panel = el ? el.id : '';
  };
  const closePanels = () => {
    if (drawer >= 0) {
      scene?.closeDrawer();
      drawer = -1;
    }
    panel(null);
  };

  /* ---------------- the newspaper on the table ---------------- */
  const paper = new Paper(root, base, {
    // folding the paper up leaves it on the table, at the list of days
    close: () => {
      paper.hide();
      newsDay = '';
      if (!open) return;
      if (open.page) turn(0);
      else show(0);
      panel(reader);
      history.replaceState(null, '', `#${open.book.id}`);
    },
    other: (date) => takeDay(date),
    day: (date) => {
      if (!open) return;
      newsDay = date;
      const i = open.pages.findIndex((p) => p.date === date);
      if (i >= 0) {
        open.page = i;
        scene?.turn(i);
        const s = load();
        s.marks[open.book.id] = i;
        save(s);
      }
      history.replaceState(null, '', `#daily-${date}`);
    },
  });

  /* ---------------- reader ---------------- */
  const show = (page: number, dir = 0) => {
    if (!open) return;
    open.page = page;
    const s = load();
    s.marks[open.book.id] = page;
    save(s);
    const p = open.pages[page];
    const paint = () => {
      if (!open) return;
      $('rd-mark').textContent = open.book.mark;
      $('rd-book').textContent = `${T(open.book.spine)} · ${T(open.book.sub)}`;
      $('rd-head').textContent = T(p.head);
      $('rd-body').innerHTML = p.date && p.date > islandIso()
        ? (isZh() ? '<p class="lib-small">这一期还没付印。</p>' : '<p class="lib-small">This issue has not gone to press yet.</p>')
        : T(p.html);
      hideFuture($('rd-body'));
      $('rd-no').textContent = isZh() ? `第 ${page + 1} 页 / 共 ${open.pages.length} 页` : `p. ${page + 1} / ${open.pages.length}`;
      ($('rd-prev') as HTMLButtonElement).disabled = page === 0;
      ($('rd-next') as HTMLButtonElement).disabled = page === open.pages.length - 1;
      $('rd-page').scrollTop = 0;
    };
    paint();
    // the new page slides in; it is already there if the animation never runs
    if (dir && !reducedMotion()) $('rd-page').animate([{ opacity: 0.35, transform: `translateX(${dir * 16}px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.16,1,.3,1)' });
  };

  const turn = (n: number) => {
    if (!open || n < 0 || n >= open.pages.length || n === open.page) return;
    const dir = n > open.page ? 1 : -1;
    audio.paper();
    if (Math.abs(n - open.page) > 1) window.setTimeout(() => audio.paper(), 120);
    scene?.turn(n);
    show(n, dir);
  };

  /** Open a day of the paper on the table out to its four pages. */
  const spread = (date: string) => {
    if (!open) return;
    const i = open.pages.findIndex((p) => p.date === date);
    if (i < 0) return;
    newsDay = date;
    if (i !== open.page) {
      audio.paper();
      scene?.turn(i);
      show(i);
    }
    panel(null);
    history.replaceState(null, '', `#daily-${date}`);
    void paper.show(date);
  };

  // contents entries jump straight to their page; a day of the paper opens out
  $('rd-body').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const day = t.closest<HTMLAnchorElement>('a[href^="#daily-"]');
    if (day && open?.book.kind === 'news') {
      e.preventDefault();
      spread(day.getAttribute('href')!.slice(7));
      return;
    }
    const a = t.closest<HTMLAnchorElement>('a[data-page]');
    if (!a) return;
    e.preventDefault();
    turn(Number(a.dataset.page));
  });

  // a shelved book carries only its headings; the text is fetched as it comes down
  const fetching = new Set<string>();
  /** The stick a day hangs on, taken down and opened on that day. */
  function takeDay(date: string) {
    const id = monthOf(date) === 'early' ? 'daily-early' : `daily-${date.slice(5, 7)}`;
    take(id, date);
  }

  function take(id: string, date?: string) {
    const hit = all.find((x) => x.book.id === id);
    if (!hit) return;
    if (open?.book.id === id) {
      if (date && paper.on) paper.go(date);
      else if (date) spread(date);
      return;
    }
    const { book } = hit;
    if (book.src) {
      if (fetching.has(id)) return;
      fetching.add(id);
      fetch(book.src)
        .then((r) => r.json())
        .then((d: { pages: Array<Omit<LibPage, 'head' | 'html'> & { head: string | LibPage['head']; html: string | LibPage['html'] }> }) => {
          const both = <T,>(v: string | T) => (typeof v === 'string' ? ({ en: v, zh: v } as T) : v);
          book.pages = d.pages.map((p) => ({ ...p, head: both(p.head), html: both(p.html) }));
          book.src = undefined;
        })
        .catch(() => {})
        .finally(() => {
          fetching.delete(id);
          if (!book.src) take(id);
        });
      return;
    }
    closePanels();
    paper.hide();
    const news = book.kind === 'news';
    // a stick comes down to its list of days, unless it was fetched for one day
    newsDay = news ? date ?? '' : '';
    if (news) paper.prefetch(date ?? book.pages.find((p) => p.date)?.date ?? islandIso());
    const s = load();
    s.loans[id] = (s.loans[id] ?? 0) + 1;
    save(s);
    // a newspaper has no date-due slip; it goes back on its stick
    const pages = news ? book.pages : [...book.pages, dueSlip(book, s.loans[id])];
    // open where the ribbon was left (a paper: at the list of days, or on the day asked for)
    const page = news ? Math.max(0, pages.findIndex((p) => newsDay && p.date === newsDay)) : Math.min(s.marks[id] ?? 0, pages.length - 2);
    open = { book, pages, page };
    if (hit.bay.zone !== zone && scene) scene.goZone(hit.bay.zone);
    else if (!scene) setZone(hit.bay.zone);
    audio.drawer();
    root.dataset.state = 'open';
    show(page);
    callout(null);
    history.replaceState(null, '', newsDay ? `#daily-${newsDay}` : `#${id}`);
    if (scene) scene.take(id, pages, page);
    else if (newsDay) void paper.show(newsDay);
    else panel(reader);
    const high = hit.bay.id === 'gazetteer';
    if (high) voice.say('library.ladder');
    else if (s.loans[id] > 1) voice.say('library.again', { title: T(book.spine) });
    else if (book.kind === 'news') voice.say('library.daily');
    else if (book.kind === 'binder') voice.say('library.binder');
    else voice.say('library.open', { title: T(book.spine) });
  }

  const close = () => {
    if (!open) return;
    open = null;
    paper.hide();
    audio.close();
    panel(null);
    root.dataset.state = 'room';
    history.replaceState(null, '', location.pathname);
    scene?.shelve();
    voice.say('library.return', {}, false);
  };

  $('rd-close').addEventListener('click', close);
  $('rd-prev').addEventListener('click', () => open && turn(open.page - 1));
  $('rd-next').addEventListener('click', () => open && turn(open.page + 1));

  /* ---------------- catalogue ---------------- */
  const openDrawer = (i: number) => {
    if (open) return;
    const d = catalogue[i];
    drawer = i;
    audio.drawer();
    scene?.openDrawer(i);
    if (!scene) setZone('catalogue');
    $('cat-label').textContent = d.label;
    const ul = $('cat-cards');
    ul.innerHTML = d.cards.length
      ? d.cards
          .map((c, k) => `<li data-k="${k}"><a href="${base}records/${c.slug}/"><b>${c.file}</b><span>${esc(T(c.title))}</span><i>${esc(T(c.line))}</i><em class="lib-stamp">${c.stamp}</em></a></li>`)
          .join('')
      : `<li class="is-empty">${isZh() ? '这个抽屉还空着。' : 'This drawer is still empty.'}</li>`;
    panel(catPanel);
    if (!d.cards.length) voice.say('library.emptyDrawer');
  };
  $('cat-cards').addEventListener('pointerover', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-k]');
    scene?.liftCard(li ? Number(li.dataset.k) : null);
  });
  $('cat-close').addEventListener('click', closePanels);

  /* ---------------- desk ---------------- */
  const showDesk = () => {
    if (open) return;
    const s = load();
    const loans = Object.entries(s.loans).sort((a, b) => b[1] - a[1]);
    $('desk-loans').innerHTML = loans.length
      ? loans
          .map(([id, n]) => {
            const b = all.find((x) => x.book.id === id)?.book;
            return b ? `<li><b>${esc(b.mark)}</b><span>${esc(T(b.spine))}</span><i>×${n}</i></li>` : '';
          })
          .join('')
      : `<li class="is-empty">${isZh() ? '你还没借过书。' : 'You have not borrowed anything yet.'}</li>`;
    $('desk-stamps').innerHTML = s.stamps.slice(-6).map((t) => `<b class="lib-stamp">${t}</b>`).join('');
    const v = whoami();
    $('desk-who').textContent = v ? (isZh() ? `借阅人：${v}` : `Borrower: ${v}`) : isZh() ? '借阅人：未登记访客' : 'Borrower: unregistered visitor';
    panel(deskPanel);
  };
  $('desk-stamp').addEventListener('click', () => {
    const s = load();
    const t = today();
    const done = () => {
      audio.stamp();
      s.stamps.push(t);
      save(s);
      showDesk();
      voice.say('library.stamp', {}, false);
    };
    if (scene) scene.stamp(t, s.stamps.length, done);
    else done();
  });
  $('desk-close').addEventListener('click', closePanels);

  /* ---------------- navigation ---------------- */
  document.querySelectorAll<HTMLButtonElement>('#lib-zones button').forEach((b) => b.addEventListener('click', () => goZone(b.dataset.zone as Zone)));

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (paper.key(e)) return;
    if (open) {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        turn(open.page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        turn(open.page - 1);
      } else if (e.key === 'Home') turn(0);
      return;
    }
    if (e.key === 'Escape') {
      if (root.dataset.panel) closePanels();
      else goZone('overview');
      return;
    }
    if (/^[0-4]$/.test(e.key)) return goZone(ZONES[Number(e.key)]);
    if (zone === 'stacks' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return scene?.walk(e.key === 'ArrowRight' ? 1 : -1);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = ZONES.indexOf(zone) + (e.key === 'ArrowRight' ? 1 : -1);
      goZone(ZONES[(i + ZONES.length) % ZONES.length]);
    }
  });

  // swipe pages on a phone
  let sx = 0, sy = 0;
  reader.addEventListener('touchstart', (e) => {
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
  }, { passive: true });
  reader.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (open && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(open.page + (dx < 0 ? 1 : -1));
  });

  /* ---------------- the room ---------------- */
  const canvas = $('lib-canvas') as HTMLCanvasElement;
  try {
    scene = new LibraryScene(canvas, bays, catalogue, {
      hover: (h) => {
        if (!h) return callout(null);
        if (h.book) return callout(h.book);
        if (h.gap) return callout(null, `DS/Y2K/09 · ${isZh() ? '空位' : 'Empty slot'}`);
        if (h.drawer !== undefined) return callout(null, `${catalogue[h.drawer].label} · ${catalogue[h.drawer].cards.length}`);
        if (h.zone) callout(null, T(ZONE_NAME[h.zone]));
      },
      zone: setZone,
      open: () => {},
      ready: () => {
        if (!open) return;
        if (open.book.kind === 'news' && newsDay) void paper.show(newsDay);
        else panel(reader);
      },
      closed: () => {},
      gap,
      drawer: openDrawer,
      desk: showDesk,
      picked: (b) => take(b.id),
    });
    scene.setTheme(prefs.get('theme'));
    const at = ask('at');
    if (at && (ZONES as string[]).includes(at)) goZone(at as Zone);
    published('library', { scene });
    // ?perf: frame rate, quality step and graphics card, to check on a real device
    if (new URLSearchParams(location.search).has('perf')) {
      const meter = document.createElement('p');
      meter.className = 'lib__perf micro';
      meter.setAttribute('data-no-i18n', '');
      root.append(meter);
      const tiers = ['full', 'lower resolution', 'book shadows off', 'pendant light off'];
      window.setInterval(() => {
        if (!scene) return;
        const fps = Math.round(1000 / scene.frameMs);
        meter.textContent = `${fps} fps · ${scene.frameMs.toFixed(1)} ms · quality ${scene.tier} (${tiers[scene.tier]}) · ${scene.gpu}`;
      }, 500);
    }
    requestAnimationFrame(() => root.classList.add('is-lit'));
  } catch (err) {
    console.error('[library] reading room unavailable', err);
    root.classList.add('no-webgl', 'is-lit');
  }

  new MutationObserver(() => scene?.setTheme(document.documentElement.dataset.theme === 'night' ? 'night' : 'day')).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  flat(() => {
    drawList();
    paper.relabel();
    if (open) show(open.page);
    void scene?.relabel(isZh());
  });
  void scene?.relabel(isZh());
  root.dataset.zone = zone;
  drawList();

  const want = location.hash.slice(1);
  const wantDay = want === 'daily-today' ? islandIso() : want.match(/^daily-(\d{4}-\d{2}-\d{2})$/)?.[1];
  window.setTimeout(() => {
    if (wantDay) takeDay(wantDay > islandIso() ? islandIso() : wantDay);
    else if (want && all.some((x) => x.book.id === want)) take(want);
    else voice.say('library.enter');
  }, 600);
}
