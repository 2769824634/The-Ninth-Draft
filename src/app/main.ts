/**
 * Archive controller: state, routing, keyboard, HUD.
 * The Stage renders; this file decides what is selected and what is open.
 */
import type { ArchiveData, ArchiveRecord } from './types';
import { Stage } from './scene/stage';
import { Dossier } from './ui/dossier';
import { Search } from './ui/search';
import { boot } from './ui/boot';
import { Roller, decode, swapText } from './ui/text';
import { audio } from './audio';
import { prefs } from './prefs';

export function start() {
  const data: ArchiveData = JSON.parse(document.getElementById('archive-data')!.textContent!);
  const root = document.getElementById('archive')!;
  const $ = (id: string) => document.getElementById(id)!;
  const { categories, records, base } = data;

  const byCat = categories.map((c) => records.filter((r) => r.category === c.id));
  let col = Math.max(0, byCat.findIndex((list) => list.length > 0));
  const sel = categories.map(() => 0);
  let view: 'browse' | 'detail' = 'browse';
  let current: ArchiveRecord | null = null;

  /* ---------------- theme & sound ---------------- */
  const applyTheme = (t: 'day' | 'night', silent = false) => {
    prefs.set('theme', t);
    document.documentElement.dataset.theme = t;
    document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
    stage?.setTheme(t);
    audio.theme(t === 'night');
    if (!silent) audio.click();
  };
  const applySound = () => {
    const on = prefs.get('sound');
    $('btn-sound').setAttribute('aria-pressed', String(on));
    $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
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
      swapText($('col-name'), cat.label);
      $('col-no').textContent = String(col + 1).padStart(2, '0');
      swapText($('fc-category'), cat.label);
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
    } else {
      swapText($('fc-file'), `${cat.code}-0000`);
      $('fc-title').textContent = 'Drawer empty';
      $('fc-sub').textContent = 'Add a Markdown file to this category to file a record.';
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
    if (colChanged) audio.drawer();
    else audio.flick();
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
    stage?.inspect(rec);
    audio.open();
    if (!already) setTimeout(() => audio.stamp(), 900);
    document.title = `${rec.file} · ${rec.title} — The Ninth Draft`;
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
    stage?.release();
    audio.close();
    document.title = 'The Ninth Draft — Archive';
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

  window.addEventListener('popstate', () => {
    const rec = fromPath();
    if (rec) openRecord(rec, false);
    else closeRecord(false);
  });

  const dossier = new Dossier(records, categories, base, (r) => openRecord(r));
  const search = new Search(records, categories, base, (r) => openRecord(r));

  /* ---------------- controls ---------------- */
  $('fc-open').addEventListener('click', () => {
    const rec = byCat[col][sel[col]];
    if (rec) openRecord(rec);
  });
  $('btn-back').addEventListener('click', () => closeRecord());
  $('btn-search').addEventListener('click', () => search.show());
  $('btn-sound').addEventListener('click', () => {
    audio.unlock();
    prefs.set('sound', !prefs.get('sound'));
    applySound();
    audio.click();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-theme-set]').forEach((b) =>
    b.addEventListener('click', () => applyTheme(b.dataset.themeSet as 'day' | 'night')),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => move(Number(b.dataset.step))));
  document.querySelectorAll<HTMLButtonElement>('[data-col]').forEach((b) => b.addEventListener('click', () => switchCol(Number(b.dataset.col))));
  document.querySelectorAll<HTMLButtonElement>('[data-dstep]').forEach((b) => b.addEventListener('click', () => stepRecord(Number(b.dataset.dstep))));
  document.querySelector('[data-nav="home"]')!.addEventListener('click', (e) => {
    e.preventDefault();
    if (search.isOpen) search.close();
    closeRecord();
  });

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
    }
    if (e.key === 'n' || e.key === 'N') applyTheme(prefs.get('theme') === 'day' ? 'night' : 'day');
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
  const clock = $('clock'), coords = $('coords');
  const tick = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    clock.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    // Local sidereal-ish drift: right ascension advances with the clock.
    const ra = (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) * 1.0027;
    coords.textContent = `RA ${p(Math.floor(ra / 3600) % 24)}h ${p(Math.floor(ra / 60) % 60)}m ${p(Math.floor(ra) % 60)}s · Dec +61° 12′`;
  };
  tick();
  setInterval(tick, 1000);

  /* ---------------- start ---------------- */
  stage?.focus(col, sel[col]);
  renderHud(true);
  stage?.start();

  const initial = data.initial ? records.find((r) => r.file === data.initial) : fromPath();
  const fontsReady = document.fonts?.ready ?? Promise.resolve();

  let seen = false;
  try { seen = sessionStorage.getItem('n9:boot') === '1'; } catch { /* ignore */ }

  const enter = () => {
    try { sessionStorage.setItem('n9:boot', '1'); } catch { /* ignore */ }
    if (initial) setTimeout(() => openRecord(initial, false), 350);
  };

  if (seen) {
    root.dataset.boot = 'off';
    // Audio needs a gesture; unlock on the first one.
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    enter();
  } else {
    void boot(root, fontsReady).then(enter);
  }
}
