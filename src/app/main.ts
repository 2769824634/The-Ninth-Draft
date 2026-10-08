/**
 * Archive controller: state, routing, keyboard, HUD.
 *
 * There is one archive room and you read in it. Walking in, you are standing
 * in the stacks; a formal cabinet opens where it stands, a file comes half
 * out of its drawer, and it is read at the drawer or carried to the reading
 * table, where up to six lie side by side. The paper opens over the room; the
 * room never changes while you read.
 */
import type { ArchiveData, ArchiveRecord } from './types';
import { Wall } from './scene/wall';
import { Iris } from './ui/iris';
import { hms, isFiled, islandDateLabel, islandNow, visitorClock } from './island';
import { Chapter } from './ui/chapter';
import { Retrieve } from './ui/retrieve';
import { System } from './ui/system';
import { Dossier } from './ui/dossier';
import { Archivist } from './ui/archivist';
import { quirks } from './ui/quirks';
import { fileNo, loadPass, loadVisitor, passNo } from './visitor/store';
import { clearanceKey } from './clearance';
import { Search } from './ui/search';
import { boot } from './ui/boot';
import { decode, esc } from './ui/text';
import { audio } from './audio';
import { prefs, reducedMotion } from './prefs';
import { applyRecords, isZh, lang, markDocument, onLang, setLang, t, translateDom, type Lang } from './i18n';
import { canvasFontsReady } from './scene/textures';
import { Stacks, TABLE_MAX, type ReadAt } from './archive/stacks';
import type { PaperLit } from './archive/scene';
import { Sheet } from './archive/sheet';
import { Companion } from './archive/companion';

export function start() {
  const data: ArchiveData = JSON.parse(document.getElementById('archive-data')!.textContent!);
  const root = document.getElementById('archive')!;
  const $ = (id: string) => document.getElementById(id)!;
  // A record dated to a day still to come on the island is not on file yet: it turns up on the day
  const onFile = new Set(data.records.filter((r) => isFiled(r.date)).map((r) => r.file));
  data.records = data.records.filter((r) => onFile.has(r.file)).map((r) => ({ ...r, related: r.related.filter((f) => onFile.has(f)) }));
  if (data.initial && !onFile.has(data.initial)) {
    data.initial = null;
    document.title = 'Public Archive — The Ninth Draft';
  }
  const { categories, records, base } = data;
  document.querySelectorAll<HTMLElement>('#wall-list > li').forEach((li) => {
    const r = records.find((x) => x.file === li.dataset.file);
    if (!r) return li.remove();
    const rel = li.querySelector('span');
    if (rel) rel.textContent = r.related.length ? ` — linked to ${r.related.join(', ')}` : '';
  });
  {
    const el = $('wall-count');
    el.dataset.records = String(records.length);
    el.dataset.links = String(new Set(records.flatMap((r) => r.related.map((f) => [r.file, f].sort().join('|')))).size);
  }
  // Language first: every module below reads the records as they are now
  markDocument();
  applyRecords(records);
  translateDom(root);

  let view: 'browse' | 'detail' = 'browse';
  let current: ArchiveRecord | null = null;
  /** Where the open file is being read: at its drawer, or at the table. */
  let readAt: ReadAt = 'drawer';
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
  const sheet = new Sheet(root);
  /** Set by Previous / Next just before the next file opens: which way the sheets go. */
  let stepDir = 0;
  const system = new System();
  quirks(root, voice, system);

  /** Paint the interface in a clearance colour, and bring up the examination tube where the file is read. */
  const setClearance = (stamp: string | null) => {
    root.dataset.clr = clearanceKey(stamp ?? 'DECLASSIFIED');
    stacks?.exam(stamp ? readAt : null, stamp);
  };

  /* ---------------- theme & sound ---------------- */
  const applyTheme = (th: 'day' | 'night', silent = false) => {
    prefs.set('theme', th);
    document.documentElement.dataset.theme = th;
    document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
    wall?.setTheme(th);
    stacks?.setTheme(th);
    markLight();
    audio.theme(th === 'night');
    if (!silent) {
      audio.click();
      voice.say(th);
    }
  };
  const applySound = () => {
    const on = prefs.get('sound');
    $('btn-sound').setAttribute('aria-pressed', String(on));
    $('sound-label').textContent = on ? t('Sound on') : t('Sound off');
    audio.apply();
  };

  /**
   * The light on the page, as the room works it out: its colour, strength and
   * the side it comes from, painted straight onto the sheet (and the second
   * sheet, if one lies alongside). When the lamps are off, a line on the page
   * says what it is being read by.
   */
  let lit: PaperLit | null = null;
  let litBy: 'day' | 'lamp' | 'moon' | 'street' = 'lamp';
  const LIT_PROPS = ['--lamp', '--lamp-glow', '--lamp-wash', '--lamp-dark', '--lx', '--ly'];
  function markLight() {
    const sheets = [...document.querySelectorAll<HTMLElement>('#ds-scroll, .companion__paper')];
    const note = $('ds-light');
    if (!lit || view !== 'detail') {
      root.classList.remove('lit-live');
      delete root.dataset.light;
      sheets.forEach((el) => LIT_PROPS.forEach((k) => el.style.removeProperty(k)));
      note.hidden = true;
      return;
    }
    root.classList.add('lit-live');
    const b = lit.b;
    const vals: [string, string][] = [
      ['--lamp', lit.color],
      ['--lamp-glow', `${(6 + 30 * b).toFixed(1)}%`],
      ['--lamp-wash', `${(3 + 10 * b).toFixed(1)}%`],
      ['--lamp-dark', `${((1 - b) * 46).toFixed(1)}%`],
      ['--lx', `${(lit.lx * 100).toFixed(1)}%`],
      ['--ly', `${(lit.ly * 100).toFixed(1)}%`],
    ];
    sheets.forEach((el) => vals.forEach(([k, v]) => el.style.setProperty(k, v)));
    // what it is read by, with a little give so it does not chatter at the edge
    const night = document.documentElement.dataset.theme === 'night';
    litBy = !night || lit.day > 0.5 ? 'day' : lit.lamps > (litBy === 'lamp' ? 0.2 : 0.3) ? 'lamp' : lit.moon > lit.street ? 'moon' : 'street';
    root.dataset.light = litBy;
    const zh = isZh();
    note.textContent = litBy === 'moon'
      ? zh ? '灯关着。这页是月光照的。' : 'The lamps are off. You are reading this by the moon.'
      : litBy === 'street'
        ? zh ? '灯关着。这页是窗外路灯照的。' : 'The lamps are off. You are reading this by the street lamp.'
        : '';
    note.hidden = !note.textContent;
  }

  /**
   * Sat at the table, the page is laid over the sheet on the blotter: the
   * room says where that sheet is on the screen, and the page takes its
   * place, its perspective and its size from it. On a phone there is no table
   * to see, and the page is a plain sheet.
   */
  const flat = window.matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)');
  const pinnable = () => !flat.matches;
  /** The colour the page takes from what lights it: orange under the street lamp, blue under the moon, nothing under a bright lamp. */
  const tintOf = () => {
    if (!lit) return 'transparent';
    const n = parseInt(lit.color.slice(1), 16);
    return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${(0.4 * Math.pow(1 - Math.min(1, lit.b * 1.15), 1.3)).toFixed(3)})`;
  };
  function layPage(v: { pin: string; w: number; h: number; box: [number, number, number, number]; shade: [number, number, number, number]; dim: number } | null) {
    // getting up: the page stays where it was while it fades, and is let go when the file is shut
    if (!v || !pinnable() || view !== 'detail' || readAt !== 'table') return;
    const st = root.style;
    st.setProperty('--pin', v.pin);
    st.setProperty('--pw', `${v.w}px`);
    st.setProperty('--ph', `${v.h}px`);
    st.setProperty('--qx0', `${v.box[0].toFixed(1)}px`);
    st.setProperty('--qy0', `${v.box[1].toFixed(1)}px`);
    st.setProperty('--qx1', `${v.box[2].toFixed(1)}px`);
    st.setProperty('--qy1', `${v.box[3].toFixed(1)}px`);
    (['t', 'b', 'l', 'r'] as const).forEach((k, i) => st.setProperty(`--sd-${k}`, v.shade[i].toFixed(3)));
    st.setProperty('--sd-all', v.dim.toFixed(3));
    st.setProperty('--sd-tint', tintOf());
    root.dataset.pinned = '';
  }

  function layAside(v: { pin: string; w: number; h: number; box: [number, number, number, number]; shade: [number, number, number, number]; dim: number } | null) {
    if (!v || !pinnable() || view !== 'detail' || readAt !== 'table' || !companion.rec) return;
    const st = root.style;
    st.setProperty('--pin2', v.pin);
    st.setProperty('--pw2', `${v.w}px`);
    st.setProperty('--ph2', `${v.h}px`);
    st.setProperty('--bx', `${v.box[0].toFixed(1)}px`);
    st.setProperty('--by', `${v.box[3].toFixed(1)}px`);
    (['t', 'b', 'l', 'r'] as const).forEach((k, i) => st.setProperty(`--sd2-${k}`, v.shade[i].toFixed(3)));
    st.setProperty('--sd2-tint', tintOf());
    st.setProperty('--sd2-all', v.dim.toFixed(3));
    root.dataset.paired = '';
  }

  /* ---------------- the stacks: the one room ---------------- */
  const stacks = new Stacks(root, categories, records, prefs.get('theme'), voice, {
    read: (rec, at) => openRecord(rec, at),
    drawer: (ci) => {
      if (categories[ci].id === 'programs' && chapter.show()) {
        audio.stamp();
        voice.say('chapter');
      } else voice.say(`drawer.${categories[ci].id}`, {}, false);
      audio.sputnik(categories[ci].id === 'programs');
    },
    lights: () => markLight(),
    paper: (v) => {
      lit = v;
      markLight();
    },
    sheet: (v) => layPage(v),
    side: (v) => layAside(v),
    search: () => search.show(),
  });

  applyTheme(prefs.get('theme'), true);
  applySound();

  /* ---------------- routing ---------------- */
  const recordUrl = (r: ArchiveRecord) => `${base}records/${r.slug}/`;

  /** Open a file as paper over the room, read where it was taken out. */
  function openRecord(rec: ArchiveRecord, at: ReadAt = 'drawer', push = true) {
    if (roomTarget === 'wall') {
      leaveWall(rec, push);
      return;
    }
    const already = view === 'detail';
    const dir = stepDir;
    stepDir = 0;
    const wasAt = readAt;
    view = 'detail';
    current = rec;
    readAt = at;
    root.dataset.view = 'detail';
    root.dataset.readat = at;
    if (at === 'table' && stacks.canSit && pinnable()) root.dataset.pin = '';
    else {
      delete root.dataset.pin;
      delete root.dataset.pinned;
    }
    companion.hide();
    $('dossier').setAttribute('aria-hidden', 'false');
    const ci = categories.findIndex((c) => c.id === rec.category);
    const list = records.filter((r) => r.category === rec.category);
    // the sheet itself: filled at once, or once the last one has gone out of the way
    const fill = () => {
      dossier.fill(rec, { index: list.indexOf(rec), total: list.length });
      setClearance(rec.stamp);
      markLight();
      markTable();
    };
    // at the table you sit down and read it on the blotter, in the room
    const seated = at === 'table' && stacks.canSit;
    if (seated) stacks.sit(rec);
    else if (already && wasAt === 'table') stacks.sit(null);
    if (already) sheet.swap(dir, at === 'table', fill);
    else {
      fill();
      if (seated) sheet.seat(rec);
      else sheet.open(stacks.screenPoint(rec, at), rec);
    }
    $('btn-back').querySelector('span')!.textContent = backLabel();
    const notes = dossier.noteSpan();
    // the checkout is logged on the terminal; the paper is not held back for it
    retrieve.run(
      at === 'table'
        ? t('Reading table · {file}', { file: rec.file })
        : t('Drawer {drawer} · Folder {folder} · {file}', { drawer: String(ci + 1).padStart(2, '0'), folder: String(list.indexOf(rec) + 1).padStart(2, '0'), file: rec.file }),
      notes
        ? voice.pick('retrieve.notes', { drafts: notes })
        : voice.pick(`retrieve.${rec.category}`, { file: rec.file, title: rec.title }) ?? voice.pick('retrieve.any', { file: rec.file }),
    );
    audio.open();
    audio.sputnik(rec.category === 'programs');
    voice.say(`open.${rec.stamp}`, { file: rec.file, title: rec.title });
    system.opened(rec.stamp);
    if (!already) setTimeout(() => audio.stamp(), 900);
    document.title = t('{file} · {title} — The Ninth Draft', { file: rec.file, title: rec.title });
    if (push) history.pushState({ file: rec.file }, '', recordUrl(rec));
  }

  /**
   * A file opened from another room (the library, the office, a flat page)
   * goes back there when it is put away: the link carried ?from=<path>.
   */
  const ROOMS: Record<string, string> = { library: 'Back to the library', office: 'Back to the office', daily: 'Back to the Daily', calendar: 'Back to the calendar', map: 'Back to the map', district: 'Back to the district', me: 'Back to my file', guide: 'Back to the guide' };
  let returnTo: string | null = (() => {
    const f = new URLSearchParams(location.search).get('from');
    // only somewhere on this site
    if (!f || !f.startsWith(base) || f.includes('//') || /records\//.test(f)) return null;
    return f;
  })();
  const backLabel = () => {
    if (returnTo) return t(ROOMS[returnTo.slice(base.length).split('/')[0] ?? ''] ?? 'Back to the stacks');
    return t(readAt === 'table' ? 'Back to the table' : 'Back to the drawer');
  };
  if (location.search) history.replaceState(history.state, '', location.pathname + location.hash);

  function closeRecord(push = true) {
    if (view !== 'detail') return;
    if (returnTo) {
      const to = returnTo;
      returnTo = null;
      audio.close();
      void iris.run(() => location.assign(to));
      return;
    }
    const was = current;
    if (was && readAt === 'table' && stacks.canSit) {
      sheet.rise();
      stacks.sit(null);
    } else if (was) sheet.close(stacks.screenPoint(was, readAt), was);
    view = 'browse';
    current = null;
    root.dataset.view = 'browse';
    delete root.dataset.light;
    window.setTimeout(() => {
      if (view === 'detail') return;
      delete root.dataset.pin;
      delete root.dataset.pinned;
    }, 700);
    $('dossier').setAttribute('aria-hidden', 'true');
    dossier.reset();
    companion.hide();
    retrieve.cancel();
    setClearance(null);
    audio.close();
    // the file goes back in its drawer; one on the table stays on the table
    if (was && readAt === 'drawer') stacks.putBack(false);
    document.title = t('The Ninth Draft — Archive');
    if (push) history.pushState({}, '', base);
  }

  /** The next or previous file in the same category, in the same place. */
  function stepRecord(d: number) {
    if (!current) return;
    stepDir = d;
    if (readAt === 'table') {
      const on = stacks.onTable;
      if (on.length < 2) return;
      const next = on[(on.indexOf(current) + d + on.length) % on.length];
      if (next && next !== current) openRecord(next, 'table');
      return;
    }
    const next = stacks.neighbour(current, d);
    if (next !== current) stacks.fetch(next, true);
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
    else if (rec) stacks.fetch(rec, true);
    else closeRecord(false);
  });

  /* ---------------- the file alongside ---------------- */
  const companion = new Companion({
    aside: (rec) => stacks.sitAside(pinnable() && readAt === 'table' ? rec : null),
    swap: (rec) => {
      companion.hide();
      openRecord(rec, 'table');
    },
    close: () => {
      companion.hide();
      markTable();
    },
  });

  /** The strip of what else is on the table, under the sheet. */
  function markTable() {
    const el = $('ds-table');
    const on = stacks.onTable.filter((r) => r !== current);
    if (readAt !== 'table' || !on.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const zh = isZh();
    el.innerHTML = `<span class="micro">${zh ? `桌上还有 ${on.length} 份` : `${on.length} more on the table`}</span>${on
      .map((r) => `<button type="button" data-open="${esc(r.file)}">${esc(r.file)}</button><button type="button" class="ds-table__side" data-side="${esc(r.file)}" aria-pressed="${companion.rec === r}">${zh ? '并排' : 'Alongside'}</button>`)
      .join('')}`;
    el.hidden = false;
  }

  $('ds-table').addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const open = el.closest<HTMLElement>('[data-open]')?.dataset.open;
    if (open) {
      const rec = records.find((r) => r.file === open);
      if (rec) openRecord(rec, 'table');
      return;
    }
    const side = el.closest<HTMLElement>('[data-side]')?.dataset.side;
    if (!side) return;
    const rec = records.find((r) => r.file === side);
    if (!rec) return;
    if (companion.rec === rec) companion.hide();
    else {
      companion.show(rec);
      audio.paper();
    }
    markTable();
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
            setClearance(null);
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
      stacks.hide();
      ensureWall();
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
      stacks.show();
      boardCoords = null;
      tick();
      root.dataset.room = 'archive';
      document.title = t('The Ninth Draft — Archive');
      setClearance(null);
      if (rec) stacks.fetch(rec, true);
      else if (push) history.pushState({}, '', base);
    });
  }

  let lastDraftVoice = 9;
  const dossier = new Dossier(records, categories, base, {
    go: (r) => stacks.fetch(r, true),
    place: (r) => ({ where: stacks.shelfMark(r), onTable: stacks.isOnTable(r) }),
    pair: (r) => {
      if (readAt !== 'table') return openRecord(r, 'table');
      companion.show(r);
      markTable();
      audio.paper();
    },
    wall: (r) => enterWall(r.file),
    draft: (rec, info, byUser) => {
      setClearance(info.stamp);
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
  const search = new Search(records, categories, base, (r) => stacks.fetch(r, true), () => voice.say('searchEmpty', {}, false));

  /* ---------------- the visitor's own file ---------------- */
  const markMe = () => {
    const v = loadVisitor(), p = loadPass();
    const a = document.getElementById('btn-me') as HTMLAnchorElement | null;
    if (!a) return;
    a.href = `${base}${v ? 'me/' : 'register/'}`;
    a.classList.toggle('is-new', !v && !p);
    $('me-label').textContent = v ? `${t('My home')} · ${fileNo(v)}` : p ? `${t("Reader's pass")} · ${passNo(p)}` : t('Sign in');
  };
  markMe();

  /* ---------------- language ---------------- */
  const langBtn = document.getElementById('btn-lang') as HTMLButtonElement;
  const markLang = () => langBtn.setAttribute('data-now', lang());
  markLang();
  let relangT = 0;
  onLang(async (l: Lang) => {
    markLang();
    audio.click();
    audio.tune();
    // Text dips out, changes, comes back: never a hard cut
    const fading = reducedMotion() ? [] : [...root.querySelectorAll<HTMLElement>('.brand, .tools, .voice, .dossier, .companion, .stackshud__head, .stackshud__drawer, .wallhud__head, .wallhud__note, .wallhud__hints')];
    const outs = fading.map((el) => el.animate([{ filter: 'none' }, { filter: 'opacity(0) blur(2px)' }], { duration: 170, easing: 'ease-in', fill: 'forwards' }));
    const fonts = l === 'zh' ? canvasFontsReady(records.map((r) => `${r.title}${r.zh?.title ?? ''}${r.zh?.subtitle ?? ''}${r.zh?.summary ?? ''}${r.zh?.place ?? ''}${r.zh?.fields.map((f) => f.label + f.value).join('') ?? ''}`).join('')) : Promise.resolve();
    window.clearTimeout(relangT);
    relangT = window.setTimeout(async () => {
      applyRecords(records);
      translateDom(root);
      applySound();
      markMe();
      wallCount();
      dossier.relang();
      stacks.relang();
      if (companion.rec) companion.show(companion.rec);
      markTable();
      markLight();
      $('btn-back').querySelector('span')!.textContent = backLabel();
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
      await fonts;
      wall?.relabel();
    }, reducedMotion() ? 0 : 180);
  });
  langBtn.addEventListener('click', () => setLang(isZh() ? 'en' : 'zh'));

  /* ---------------- controls ---------------- */
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
  document.querySelectorAll<HTMLButtonElement>('[data-dstep]').forEach((b) => b.addEventListener('click', () => stepRecord(Number(b.dataset.dstep))));
  const goHome = (e: Event) => {
    if ((e as MouseEvent).metaKey || (e as MouseEvent).ctrlKey) return;
    e.preventDefault();
    if (search.isOpen) search.close();
    if (roomTarget === 'wall') leaveWall(null);
    else if (view === 'detail') closeRecord();
    else stacks.closeCabinet();
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
      // the room has the keyboard: corners, drawers, the files in them
      if (stacks.key(e)) e.preventDefault();
      else if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
      else if (e.key === 'l' || e.key === 'L') setLang(isZh() ? 'en' : 'zh');
      return;
    }
    if (e.key === 'Escape' && dossier.slipOpen) { e.preventDefault(); dossier.closeSlip(); }
    else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeRecord(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepRecord(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepRecord(-1); }
    else if (['1', '2', '3'].includes(e.key)) dossier.jump(Number(e.key));
    else if (e.key === '[') dossier.stepDraft(-1);
    else if (e.key === ']') dossier.stepDraft(1);
    else if (e.key === 't' || e.key === 'T') {
      // take the file being read at its drawer over to the table
      if (readAt === 'drawer' && current && stacks.onTable.length < TABLE_MAX) {
        const rec = current;
        stacks.toTable(rec);
        openRecord(rec, 'table', false);
      }
    }
    if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
    if (e.key === 'l' || e.key === 'L') setLang(isZh() ? 'en' : 'zh');
  });

  /* ---------------- clock & coordinates ---------------- */
  const yearEl = $('year');
  const tick = () => {
    const d = islandNow();
    const p = (n: number) => String(n).padStart(2, '0');
    const zh = isZh();
    const you = visitorClock();
    yearEl.textContent = islandDateLabel(zh);
    clock.textContent = `${zh ? '霏微' : 'Gerimis'} ${hms(d.hours, d.minutes, d.seconds)}${you ? ` · ${zh ? '你那边' : 'yours'} ${you}` : ''}`;
    // Sidereal-ish drift: right ascension advances with the island clock.
    const ra = (d.hours * 3600 + d.minutes * 60 + d.seconds) * 1.0027;
    if (boardCoords && roomTarget === 'wall') return;
    coords.textContent = `RA ${p(Math.floor(ra / 3600) % 24)}h ${p(Math.floor(ra / 60) % 60)}m ${p(Math.floor(ra) % 60)}s · Dec +61° 12′`;
  };
  tick();
  setInterval(tick, 1000);

  /* ---------------- start ---------------- */
  stacks.show();
  decode($('stacks-stats'), $('stacks-stats').textContent ?? '', 400);

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
    // the old address of the floating drawers: the formal cabinets, where they stand now
    if (location.hash === '#drawers') {
      history.replaceState(history.state, '', location.pathname);
      setTimeout(() => stacks.openCabinet(0), 500);
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
    if (!resident && !loadPass() && !nagged) {
      setTimeout(() => {
        if (loadVisitor() || loadPass()) return;
        voice.say('unregistered', {}, false);
        try { sessionStorage.setItem('n9:nag', '1'); } catch { /* ignore */ }
      }, 35000);
    }
    if (!seen) system.say('boot', true);
    if (data.room === 'wall') enterWall(null, false, true);
    else if (initial) setTimeout(() => stacks.fetch(initial, true), 350);
    else setTimeout(() => view === 'browse' && stacks.enterVoice(), 9000);
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
