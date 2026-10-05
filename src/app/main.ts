/**
 * Archive controller: state, routing, keyboard, HUD.
 * The Stage renders; this file decides what is selected and what is open.
 */
import type { ArchiveData, ArchiveRecord } from './types';
import { Stage } from './scene/stage';
import { Wall } from './scene/wall';
import { Iris } from './ui/iris';
import { Chapter } from './ui/chapter';
import { Retrieve } from './ui/retrieve';
import { System } from './ui/system';
import { Dossier } from './ui/dossier';
import { Archivist } from './ui/archivist';
import { quirks } from './ui/quirks';
import { fileNo, loadVisitor } from './visitor/store';
import { clearanceKey, INK } from './clearance';
import { Search } from './ui/search';
import { boot } from './ui/boot';
import { Roller, decode, esc, swapText } from './ui/text';
import { audio } from './audio';
import { prefs, reducedMotion } from './prefs';
import { applyRecords, isZh, lang, markDocument, onLang, setLang, t, translateDom, type Lang } from './i18n';
import { canvasFontsReady } from './scene/textures';

export function start() {
  const data: ArchiveData = JSON.parse(document.getElementById('archive-data')!.textContent!);
  const root = document.getElementById('archive')!;
  const $ = (id: string) => document.getElementById(id)!;
  const { categories, records, base } = data;
  // Language first: every module below reads the records as they are now
  markDocument();
  applyRecords(records);
  translateDom(root);

  const byCat = categories.map((c) => records.filter((r) => r.category === c.id));
  let col = Math.max(0, byCat.findIndex((list) => list.length > 0));
  const sel = categories.map(() => 0);
  let view: 'browse' | 'detail' = 'browse';
  let current: ArchiveRecord | null = null;
  // The room on screen, or the one an iris in flight is heading to
  let roomTarget: 'archive' | 'wall' = 'archive';
  root.dataset.room = 'archive';
  let wall: Wall | null = null;
  /** On the link wall, the footer shows board coordinates instead of the sky. */
  let boardCoords: string | null = null;
  const clock = $('clock'), coords = $('coords');
  const iris = new Iris($('iris') as HTMLCanvasElement);
  const chapter = new Chapter();
  const voice = new Archivist(data.archivist);
  const retrieve = new Retrieve();
  const system = new System();
  quirks(root, voice, system);

  /** Paint the whole interface in a clearance colour. */
  const setClearance = (stamp: string) => {
    const key = clearanceKey(stamp);
    root.dataset.clr = key;
    stage?.setClearance(INK[key]);
  };

  // Flicking through files too fast earns a remark
  let rushCount = 0;
  let rushT = 0;
  const rush = () => {
    rushCount++;
    window.clearTimeout(rushT);
    rushT = window.setTimeout(() => (rushCount = 0), 1600);
    if (rushCount === 9) voice.say('rush');
  };

  /* ---------------- theme & sound ---------------- */
  const applyTheme = (t: 'day' | 'night', silent = false) => {
    prefs.set('theme', t);
    document.documentElement.dataset.theme = t;
    document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    stage?.setTheme(t);
    wall?.setTheme(t);
    audio.theme(t === 'night');
    if (!silent) {
      audio.click();
      voice.say(t);
    }
  };
  const applySound = () => {
    const on = prefs.get('sound');
    $('btn-sound').setAttribute('aria-pressed', String(on));
    $('sound-label').textContent = on ? t('Sound on') : t('Sound off');
    audio.apply();
  };

  /* ---------------- stage ---------------- */
  let stage: Stage | null = null;
  try {
    stage = new Stage($('stage') as HTMLCanvasElement, data, {
      hover: () => {},
      pick: (rec) => {
        const ci = categories.findIndex((c) => c.id === rec.category);
        const i = byCat[ci].indexOf(rec);
        if (ci === col && i === sel[ci]) openRecord(rec);
        else select(ci, i);
      },
      scrub: (step) => step && move(step),
    });
  } catch (err) {
    console.error('[archive] WebGL unavailable', err);
    root.classList.add('no-webgl');
  }
  applyTheme(prefs.get('theme'), true);
  applySound();

  /* ---------------- HUD ---------------- */
  const roller = new Roller($('roll-cur'), 2);
  const ruler = $('ruler');

  function buildRuler() {
    const n = byCat[col].length;
    ruler.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const t = document.createElement('i');
      t.className = 'ruler__tick';
      t.style.left = `${n === 1 ? 50 : (i / (n - 1)) * 100}%`;
      ruler.appendChild(t);
    }
    const cur = document.createElement('i');
    cur.className = 'ruler__cursor';
    ruler.appendChild(cur);
  }

  function renderHud(colChanged = false) {
    const list = byCat[col];
    const rec = list[sel[col]];
    const cat = categories[col];
    if (colChanged) {
      buildRuler();
      swapText($('col-name'), t(cat.label));
      $('col-no').textContent = String(col + 1).padStart(2, '0');
      swapText($('fc-category'), t(cat.label));
    }
    $('roll-total').textContent = String(list.length).padStart(2, '0');
    roller.set(list.length ? sel[col] + 1 : 0);
    const cur = ruler.querySelector<HTMLElement>('.ruler__cursor');
    if (cur) cur.style.left = `${list.length <= 1 ? 50 : (sel[col] / (list.length - 1)) * 100}%`;

    if (rec) {
      swapText($('fc-file'), rec.file);
      decode($('fc-title'), rec.title, 520);
      $('fc-sub').textContent = rec.subtitle ?? '';
      $('fc-stamp').textContent = rec.stamp;
      $('fc-date').textContent = rec.date ?? '';
      ($('fc-open') as HTMLButtonElement).disabled = false;
      setClearance(rec.stamp);
    } else {
      setClearance('DECLASSIFIED');
      swapText($('fc-file'), `${cat.code}-0000`);
      $('fc-title').textContent = t('Drawer empty');
      $('fc-sub').textContent = t('Nothing filed yet. Whatever happened here has not been written down.');
      $('fc-stamp').textContent = '—';
      $('fc-date').textContent = '';
      ($('fc-open') as HTMLButtonElement).disabled = true;
    }
  }

  function select(ci: number, i: number) {
    const colChanged = ci !== col;
    const n = byCat[ci].length;
    col = ci;
    sel[ci] = n ? Math.max(0, Math.min(n - 1, i)) : 0;
    stage?.focus(col, sel[col]);
    renderHud(colChanged);
    audio.sputnik(categories[col].id === 'programs');
    if (colChanged) {
      audio.drawer();
      audio.tune();
      if (categories[col].id === 'programs' && n && chapter.show()) {
        audio.stamp();
        voice.say('chapter');
      } else if (n) voice.say(`drawer.${categories[col].id}`);
      else voice.say('emptyDrawer');
    } else {
      audio.flick();
      rush();
    }
  }

  function move(step: number) {
    if (view !== 'browse') return;
    const n = byCat[col].length;
    if (!n) return;
    const next = Math.max(0, Math.min(n - 1, sel[col] + step));
    if (next !== sel[col]) select(col, next);
  }

  function switchCol(step: number) {
    if (view !== 'browse') return;
    const n = categories.length;
    select((col + step + n) % n, sel[(col + step + n) % n]);
  }

  /* ---------------- routing ---------------- */
  const recordUrl = (r: ArchiveRecord) => `${base}records/${r.slug}/`;

  function openRecord(rec: ArchiveRecord, push = true) {
    if (roomTarget === 'wall') {
      leaveWall(rec, push);
      return;
    }
    const ci = categories.findIndex((c) => c.id === rec.category);
    const i = byCat[ci].indexOf(rec);
    if (ci !== col || i !== sel[ci]) {
      col = ci;
      sel[ci] = i;
      stage?.focus(col, i);
      renderHud(true);
    }
    const already = view === 'detail';
    view = 'detail';
    current = rec;
    root.dataset.view = 'detail';
    $('dossier').setAttribute('aria-hidden', 'false');
    document.querySelector('.inspect')!.setAttribute('aria-hidden', 'false');
    dossier.fill(rec, { index: i, total: byCat[ci].length });
    const notes = dossier.noteSpan();
    retrieve.run(
      t('Drawer {drawer} · Folder {folder} · {file}', { drawer: String(ci + 1).padStart(2, '0'), folder: String(i + 1).padStart(2, '0'), file: rec.file }),
      notes
        ? voice.pick('retrieve.notes', { drafts: notes })
        : voice.pick(`retrieve.${rec.category}`, { file: rec.file, title: rec.title }) ?? voice.pick('retrieve.any', { file: rec.file }),
      (p) => dossier.reveal(p),
    );
    stage?.inspect(rec);
    audio.open();
    audio.sputnik(rec.category === 'programs');
    voice.say(`open.${rec.stamp}`, { file: rec.file, title: rec.title });
    system.opened(rec.stamp);
    if (!already) setTimeout(() => audio.stamp(), 900);
    document.title = t('{file} · {title} — The Ninth Draft', { file: rec.file, title: rec.title });
    if (push) history.pushState({ file: rec.file }, '', recordUrl(rec));
  }

  function closeRecord(push = true) {
    if (view !== 'detail') return;
    view = 'browse';
    current = null;
    root.dataset.view = 'browse';
    $('dossier').setAttribute('aria-hidden', 'true');
    document.querySelector('.inspect')!.setAttribute('aria-hidden', 'true');
    dossier.reset();
    retrieve.cancel();
    restoreCover();
    stage?.release();
    audio.close();
    const back = byCat[col][sel[col]];
    if (back) setClearance(back.stamp);
    audio.sputnik(categories[col].id === 'programs');
    document.title = t('The Ninth Draft — Archive');
    if (push) history.pushState({}, '', base);
  }

  function stepRecord(d: number) {
    if (!current) return;
    const list = byCat[col];
    const i = list.indexOf(current);
    const next = list[(i + d + list.length) % list.length];
    if (next && next !== current) openRecord(next);
  }

  const fromPath = () => {
    const m = location.pathname.match(/records\/([^/]+)\/?$/);
    return m ? records.find((r) => r.slug === decodeURIComponent(m[1])) ?? null : null;
  };

  const isWallPath = () => /\/wall\/?$/.test(location.pathname);

  window.addEventListener('popstate', () => {
    if (isWallPath()) return enterWall(null, false);
    const rec = fromPath();
    if (roomTarget === 'wall') leaveWall(rec, false);
    else if (rec) openRecord(rec, false);
    else closeRecord(false);
  });

  /* ---------------- link wall (room 02) ---------------- */
  const note = { file: $('wall-note-file'), title: $('wall-note-title'), linked: $('wall-note-linked') };
  const idleNote = () => t(matchMedia('(pointer: coarse)').matches ? 'Tap a card to isolate its links' : 'Hover a card to isolate its links');
  note.file.textContent = idleNote();
  // What the wall note shows, so it can be rewritten in another language
  let wallFocus: { rec: ArchiveRecord; linked: ArchiveRecord[] } | null = null;
  let sweeps = 0;
  const wallCount = () => {
    const el = $('wall-count');
    el.textContent = t('{records} records · {links} links', { records: el.dataset.records ?? '', links: el.dataset.links ?? '' });
    const ch = document.getElementById('chapter-count');
    if (ch) ch.textContent = t('{n} programs on file', { n: ch.dataset.n ?? '' });
  };
  wallCount();

  function ensureWall() {
    if (wall || root.classList.contains('no-webgl')) return wall;
    try {
      wall = new Wall($('wall') as HTMLCanvasElement, data, {
        focus: (rec, linked) => {
          if (!rec) {
            wallFocus = null;
            note.file.textContent = idleNote();
            note.title.textContent = '';
            note.linked.textContent = '';
            const back = byCat[col][sel[col]];
            setClearance(back?.stamp ?? 'DECLASSIFIED');
            return;
          }
          setClearance(rec.stamp);
          note.file.textContent = `${rec.file} · ${rec.stamp} · ${t('Grid')} ${wall?.gridRef(rec.file) ?? ''}`;
          note.title.textContent = rec.title;
          note.linked.innerHTML = linked.length
            ? `${t('Linked to')}<br>${linked.map((r) => `<b>${esc(r.file)}</b> ${esc(r.title)}`).join('<br>')}`
            : t('No linked records.');
          wallFocus = { rec, linked };
          if (linked.length >= 4) voice.say('wall.popular', { file: rec.file, title: rec.title }, false);
          else if (!linked.length) voice.say('wall.alone', { file: rec.file, title: rec.title }, false);
        },
        pick: (rec) => leaveWall(rec),
        lift: () => audio.pluck(),
        moved: () => {
          audio.pin();
          if (wall?.rearranged === 6) voice.say('wall.mess');
        },
        swept: (contacts, n) => {
          sweeps = n;
          $('wall-sweep').textContent = t('Sweep {n}', { n: String(n).padStart(2, '0') });
          if (n === 3) voice.say('sweep', { count: contacts }, false);
        },
        readout: (text) => {
          boardCoords = text;
          if (text) coords.textContent = text;
          else tick();
        },
      });
      wall.setTheme(prefs.get('theme'));
    } catch (err) {
      console.error('[archive] link wall unavailable', err);
      root.classList.add('no-webgl');
    }
    return wall;
  }

  /** The shared page nav follows whichever room is in view. */
  function markRoom() {
    const wallOn = roomTarget === 'wall';
    document.getElementById('nav-archive')?.toggleAttribute('aria-current', !wallOn);
    document.getElementById('nav-links')?.toggleAttribute('aria-current', wallOn);
    if (!wallOn) document.getElementById('nav-archive')?.setAttribute('aria-current', 'page');
    else document.getElementById('nav-links')?.setAttribute('aria-current', 'page');
  }

  function enterWall(focusFile: string | null, push = true, instant = false) {
    if (roomTarget === 'wall') {
      if (focusFile) wall?.focus(focusFile, true);
      return;
    }
    roomTarget = 'wall';
    markRoom();
    const swap = () => {
      if (view === 'detail') closeRecord(false);
      ensureWall();
      stage?.pause();
      wall?.start();
      root.dataset.room = 'wall';
      if (focusFile) wall?.focus(focusFile, true);
      document.title = t('Link analysis — The Ninth Draft');
      audio.sputnik(false);
    };
    if (push) history.pushState({ room: 'wall' }, '', `${base}wall/`);
    voice.say('wall.enter');
    system.maybe('wall', 0.35);
    if (instant) {
      swap();
      void iris.reveal();
    } else void iris.run(swap);
  }

  function leaveWall(rec: ArchiveRecord | null, push = true) {
    if (roomTarget !== 'wall') return;
    roomTarget = 'archive';
    markRoom();
    if (!rec) voice.say('wall.leave');
    void iris.run(() => {
      wall?.stop();
      stage?.resume();
      boardCoords = null;
      tick();
      root.dataset.room = 'archive';
      document.title = t('The Ninth Draft — Archive');
      const back = byCat[col][sel[col]];
      setClearance(back?.stamp ?? 'DECLASSIFIED');
      audio.sputnik(categories[col].id === 'programs');
      if (rec) openRecord(rec, push);
      else if (push) history.pushState({}, '', base);
    });
  }

  let lastDraftVoice = 9;
  // The folder whose cover is showing an earlier draft's stamp
  let restamped: ArchiveRecord | null = null;
  const restoreCover = () => {
    if (restamped) stage?.setCoverStamp(restamped, restamped.stamp);
    restamped = null;
  };
  const dossier = new Dossier(records, categories, base, {
    go: (r) => openRecord(r),
    wall: (r) => enterWall(r.file),
    draft: (rec, info, byUser) => {
      setClearance(info.stamp);
      if (restamped !== rec) restoreCover();
      stage?.setCoverStamp(rec, info.stamp);
      restamped = rec;
      if (!byUser) return;
      if (info.n <= 3 && lastDraftVoice > 3) {
        voice.say('draftEarly', { draft: String(info.n).padStart(2, '0') });
        system.maybe('early', 0.4);
      }
      else if (info.n === 9 && lastDraftVoice < 9) voice.say('draftFinal');
      lastDraftVoice = info.n;
    },
    reveal: () => {
      voice.say('reveal', {}, false);
      system.maybe('reveal', 0.35);
    },
  });
  const search = new Search(records, categories, base, (r) => openRecord(r), () => voice.say('searchEmpty', {}, false));

  /* ---------------- language ---------------- */
  /* ---------------- the visitor's own file ---------------- */
  const markMe = () => {
    const v = loadVisitor();
    const a = document.getElementById('btn-me') as HTMLAnchorElement | null;
    if (!a) return;
    a.href = `${base}${v ? 'me/' : 'register/'}`;
    a.classList.toggle('is-new', !v);
    $('me-label').textContent = v ? `${t('My file')} · ${fileNo(v)}` : t('Register');
  };
  markMe();

  const langBtn = document.getElementById('btn-lang') as HTMLButtonElement;
  const markLang = () => langBtn.setAttribute('data-now', lang());
  markLang();
  let relangT = 0;
  onLang(async (l: Lang) => {
    markLang();
    audio.click();
    audio.tune();
    // Text dips out, changes, comes back: never a hard cut
    const fading = reducedMotion() ? [] : [...root.querySelectorAll<HTMLElement>('.brand, .tools, .filecard, .index-sel, .rail__colinfo, .rail__hints, .voice, .dossier, .inspect, .wallhud__head, .wallhud__note, .wallhud__hints')];
    const outs = fading.map((el) => el.animate([{ filter: 'none' }, { filter: 'opacity(0) blur(2px)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }));
    const fonts = l === 'zh' ? canvasFontsReady(records.map((r) => `${r.title}${r.zh?.title ?? ''}${r.zh?.subtitle ?? ''}${r.zh?.summary ?? ''}${r.zh?.place ?? ''}${r.zh?.fields.map((f) => f.label + f.value).join('') ?? ''}`).join('')) : Promise.resolve();
    window.clearTimeout(relangT);
    relangT = window.setTimeout(async () => {
      applyRecords(records);
      translateDom(root);
      applySound();
      markMe();
      wallCount();
      renderHud(true);
      dossier.relang();
      if (view === 'detail' && current) document.title = t('{file} · {title} — The Ninth Draft', { file: current.file, title: current.title });
      else document.title = t(roomTarget === 'wall' ? 'Link analysis — The Ninth Draft' : 'The Ninth Draft — Archive');
      if (sweeps) $('wall-sweep').textContent = t('Sweep {n}', { n: String(sweeps).padStart(2, '0') });
      if (wallFocus) {
        const { rec, linked } = wallFocus;
        note.file.textContent = `${rec.file} · ${rec.stamp} · ${t('Grid')} ${wall?.gridRef(rec.file) ?? ''}`;
        note.title.textContent = rec.title;
        note.linked.innerHTML = linked.length ? `${t('Linked to')}<br>${linked.map((r) => `<b>${esc(r.file)}</b> ${esc(r.title)}`).join('<br>')}` : t('No linked records.');
      } else note.file.textContent = idleNote();
      fading.forEach((el, i) => {
        outs[i].cancel();
        el.animate([{ filter: 'opacity(0) blur(2px)' }, { filter: 'none' }], { duration: 320, easing: 'ease-out' });
      });
      voice.say(l === 'zh' ? 'lang.zh' : 'lang.en');
      // Paper in the room is retyped once the Chinese glyphs are in
      await fonts;
      stage?.relabel();
      wall?.relabel();
    }, reducedMotion() ? 0 : 180);
  });
  langBtn.addEventListener('click', () => setLang(isZh() ? 'en' : 'zh'));

  /* ---------------- controls ---------------- */
  $('fc-open').addEventListener('click', () => {
    const rec = byCat[col][sel[col]];
    if (rec) openRecord(rec);
  });
  $('btn-back').addEventListener('click', () => closeRecord());
  $('nav-links').addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (roomTarget === 'wall') leaveWall(null);
    else enterWall(view === 'detail' && current ? current.file : null);
  });
  $('wall-back').addEventListener('click', () => leaveWall(null));
  $('wall-reset').addEventListener('click', () => {
    wall?.resetLayout();
    audio.pin();
    voice.say('wall.reset');
  });
  $('wall-list').addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-file]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const rec = records.find((r) => r.file === a.dataset.file);
    if (rec) leaveWall(rec);
  });
  $('btn-search').addEventListener('click', () => search.show());
  $('btn-sound').addEventListener('click', () => {
    audio.unlock();
    prefs.set('sound', !prefs.get('sound'));
    applySound();
    audio.click();
    voice.say(prefs.get('sound') ? 'soundOn' : 'soundOff');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => applyTheme(b.dataset.themeSet as 'day' | 'night')),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.step))));
  document.querySelectorAll<HTMLButtonElement>('[data-col]').forEach((b) => b.addEventListener('click', () => switchCol(Number(b.dataset.col))));
  document.querySelectorAll<HTMLButtonElement>('[data-dstep]').forEach((b) => b.addEventListener('click', () => stepRecord(Number(b.dataset.dstep))));
  const goHome = (e: Event) => {
    if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
    e.preventDefault();
    if (search.isOpen) search.close();
    if (roomTarget === 'wall') leaveWall(null);
    else closeRecord();
  };
  document.querySelector('[data-nav="home"]')!.addEventListener('click', goHome);
  $('nav-archive').addEventListener('click', goHome);

  window.addEventListener('keydown', (e) => {
    if (root.dataset.boot === 'on' || e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = (e.target as HTMLElement).closest('input, textarea');
    if (search.isOpen) return;
    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.show();
      return;
    }
    if (typing) return;
    if (e.key === 'w' || e.key === 'W') {
      if (roomTarget === 'wall') leaveWall(null);
      else enterWall(view === 'detail' && current ? current.file : null);
      return;
    }
    if (roomTarget === 'wall') {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); leaveWall(null); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); wall?.cycle(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); wall?.cycle(-1); }
      else if (e.key === 'Enter') {
        const rec = records.find((r) => r.file === wall?.focusedFile);
        if (rec) leaveWall(rec);
      } else if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
      else if (e.key === 'l' || e.key === 'L') setLang(isZh() ? 'en' : 'zh');
      return;
    }
    if (view === 'browse') {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); switchCol(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); switchCol(-1); }
      else if (e.key === 'Enter') {
        const rec = byCat[col][sel[col]];
        if (rec) openRecord(rec);
      }
    } else {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeRecord(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepRecord(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepRecord(-1); }
      else if (['1', '2', '3'].includes(e.key)) dossierTab(Number(e.key));
      else if (e.key === '[') dossier.stepDraft(-1);
      else if (e.key === ']') dossier.stepDraft(1);
    }
    if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
    if (e.key === 'l' || e.key === 'L') setLang(isZh() ? 'en' : 'zh');
  });
  const dossierTab = (n: number) => dossier.show((['overview', 'record', 'related'] as const)[n - 1]);

  // Touch: horizontal swipe switches drawers
  let sx = 0, sy = 0;
  $('stage').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('stage').addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (view === 'browse' && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) switchCol(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---------------- clock & coordinates ---------------- */
  const tick = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    // Local sidereal-ish drift: right ascension advances with the clock.
    const ra = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) * 1.0027;
    if (boardCoords && roomTarget === 'wall') return;
    coords.textContent = `RA ${p(Math.floor(ra / 3600) % 24)}h ${p(Math.floor(ra / 60) % 60)}m ${p(Math.floor(ra) % 60)}s · Dec +61° 12′`;
  };
  tick();
  setInterval(tick, 1000);

  /* ---------------- start ---------------- */
  stage?.focus(col, sel[col]);
  renderHud(true);
  stage?.start();
  // In Chinese, the folders were typed before their glyphs arrived: retype them
  const allZh = () => records.map((r) => [r.title, r.subtitle, r.place, r.summary, ...r.fields.map((f) => f.label + f.value)].join('')).join('');
  if (isZh()) void canvasFontsReady(allZh()).then(() => {
    stage?.relabel();
    wall?.relabel();
  });

  const initial = data.initial ? records.find((r) => r.file === data.initial) : fromPath();
  const fontsReady = document.fonts?.ready ?? Promise.resolve();

  let seen = false;
  try { seen = sessionStorage.getItem('n9:boot') === '1'; } catch { /* ignore */ }

  const enter = () => {
    try { sessionStorage.setItem('n9:boot', '1'); } catch { /* ignore */ }
    // Flat pages link here with #index to open the archive index directly
    if (location.hash === '#index') {
      history.replaceState(history.state, '', location.pathname);
      setTimeout(() => search.show(), 500);
    }
    let visits = 0;
    try {
      visits = Number(localStorage.getItem('n9:visits') || 0) + 1;
      localStorage.setItem('n9:visits', String(visits));
    } catch { /* ignore */ }
    const resident = loadVisitor();
    if (!initial && data.room !== 'wall') {
      setTimeout(() => {
        if (resident) voice.say('resident', { code: resident.code, file: fileNo(resident) });
        else voice.say(visits > 1 ? 'welcomeBack' : prefs.get('theme') === 'night' ? 'night' : 'welcome');
      }, 600);
    }
    // Unregistered visitors hear about the form once per session
    let nagged = false;
    try { nagged = sessionStorage.getItem('n9:nag') === '1'; } catch { /* ignore */ }
    if (!resident && !nagged) {
      setTimeout(() => {
        if (loadVisitor()) return;
        voice.say('unregistered', {}, false);
        try { sessionStorage.setItem('n9:nag', '1'); } catch { /* ignore */ }
      }, 35000);
    }
    if (!seen) system.say('boot', true);
    if (data.room === 'wall') enterWall(null, false, true);
    else audio.sputnik(categories[col].id === 'programs');
    if (initial) setTimeout(() => openRecord(initial, false), 350);
  };

  if (seen) {
    root.dataset.boot = 'off';
    // Audio needs a gesture; unlock on the first one.
    const unlock = () => {
      audio.unlock();
      audio.powerUp(true);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    enter();
  } else {
    void boot(root, fontsReady, voice.list('boot')).then(enter);
  }
}
