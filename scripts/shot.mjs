#!/usr/bin/env node
/**
 * One-command screenshots of the built site, in check mode (src/app/check.ts).
 *
 *   node scripts/shot.mjs archive at=reel
 *   node scripts/shot.mjs archive drawer=0.1 theme=night --phone
 *   node scripts/shot.mjs records/p-0001 --both lang=zh
 *   node scripts/shot.mjs archive at=reel --do="__n9.stacks.reelAct('MX-01')" --after=0.4,1.2,4
 *
 * Room names: archive (/), office, library, wall, map, or any path under the site.
 * key=value goes into the address (at, drawer, theme, lang, weather, ...).
 *
 *   --desktop (default) 1440×900 · --phone 390×844 · --both
 *   --wait=S     seconds the room settles after it is built (default 8: the walk-in takes ~6)
 *   --do=JS      run in the page once settled; `__n9` holds the scene and controller
 *   --after=S,…  seconds after --do to shoot; several values give several shots
 *   --shadows    keep shadows (slower; for judging the light)
 *   --gpu        on a computer with a graphics card: the real card, shadows on, the
 *                screen's own pixel ratio (use --dpr=2 for a sharp phone); finds
 *                Edge or Chrome itself on Windows and macOS
 *   --full       the whole page, scrolled length (flat pages)
 *   --dpr=N      page pixel ratio (default 1)
 *   --build      build first even if dist/ exists
 *   --out=DIR    where the PNGs go (default shots/)
 *
 * Time is faked: the page clock is stepped in 16 ms frames with drawing held off,
 * and only the last frame is drawn. A two-second camera move costs a moment, not
 * two minutes of software rendering. CSS transitions still run on real time.
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/The-Ninth-Draft/';
const ROOMS = { archive: '', office: 'office/', library: 'library/', wall: 'wall/', map: 'map/' };
const ROOMS_3D = new Set(['archive', 'office', 'library', 'wall']);
const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

/* ---------------- arguments ---------------- */
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('=');
  return [k, v.length ? v.join('=') : true];
}));
const words = args.filter((a) => !a.startsWith('--'));
const target = words.find((w) => !w.includes('=')) ?? 'archive';
const params = words.filter((w) => w.includes('='));
const path = target in ROOMS ? ROOMS[target] : target.replace(/^\/+/, '').replace(/\/?$/, '/');
const is3d = ROOMS_3D.has(target) || /^records\//.test(path);
const sizes = flags.both ? ['desktop', 'phone'] : flags.phone ? ['phone'] : ['desktop'];
const wait = Number(flags.wait ?? 8);
const after = flags.after ? String(flags.after).split(',').map(Number) : [];
const outDir = resolve(ROOT, flags.out ?? 'shots');
const slug = [target.replace(/\W+/g, '-'), ...params.map((p) => p.replace(/\W+/g, '-'))].join('_');

/* ---------------- build and serve dist/ ---------------- */
const dist = join(ROOT, 'dist');
// a cloud session builds in the background as it starts (.claude/hooks/session-start.sh)
if (existsSync('/tmp/n9-build.lock')) {
  console.log('waiting for the start-up build…');
  while (existsSync('/tmp/n9-build.lock')) await new Promise((ok) => setTimeout(ok, 1000));
}
if (flags.build || !existsSync(join(dist, 'index.html'))) {
  console.log('building…');
  execSync('npm run build --silent', { cwd: ROOT, stdio: 'inherit' });
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(BASE)) return res.writeHead(302, { location: BASE }).end();
  let file = join(dist, url.slice(BASE.length));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, '404.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

/* ---------------- shoot ---------------- */
/**
 * Software compositing makes a page screenshot take a fraction of a second, but
 * reading a WebGL canvas back through it takes many. So each canvas is swapped
 * for a picture of itself (check mode keeps the drawing buffer) for the shot.
 */
async function snap(page, file) {
  await page.evaluate(() => {
    window.__n9swap = [];
    for (const c of document.querySelectorAll('canvas')) {
      if (!c.offsetWidth || !c.width) continue;
      const img = document.createElement('img');
      for (const a of c.attributes) img.setAttribute(a.name, a.value);
      img.src = c.toDataURL();
      c.replaceWith(img);
      window.__n9swap.push([img, c]);
    }
    return Promise.all(window.__n9swap.map(([img]) => img.decode().catch(() => {})));
  });
  await page.screenshot({ path: file, timeout: 120_000, fullPage: !!flags.full });
  await page.evaluate(() => window.__n9swap.forEach(([img, c]) => img.replaceWith(c)));
}

const BROWSERS = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];
const browser = await chromium.launch({
  executablePath: BROWSERS.find((p) => p && existsSync(p)),
  headless: true,
  args: flags.gpu
    ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force_high_performance_gpu', '--autoplay-policy=no-user-gesture-required']
    : ['--disable-gpu-compositing', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
mkdirSync(outDir, { recursive: true });
const saved = [];
try {
  for (const size of sizes) {
    const context = await browser.newContext({ viewport: SIZES[size], deviceScaleFactor: Number(flags.dpr ?? 1), isMobile: size === 'phone', hasTouch: size === 'phone' });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('[page]', e.message));
    page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
    await page.clock.install();
    const q = ['check', ...params, ...(flags.shadows || flags.gpu ? ['shadows'] : []), ...(flags.gpu ? ['hd'] : [])].join('&');
    const url = `${origin}${BASE}${path}?${q}`;
    const t0 = Date.now();
    const lap = [];
    const mark = (what) => lap.push(`${what} ${((Date.now() - t0) / 1000).toFixed(1)}`);
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts?.ready);
    mark('loaded');
    if (is3d) await page.waitForFunction(() => window.__n9?.ready, null, { timeout: 120_000, polling: 250 });
    mark('built');
    // hold the page clock and step it ourselves from here
    // (a little ahead, so a slow page cannot have passed it already; drawing held meanwhile)
    await page.evaluate(() => window.__n9 && (window.__n9.draw = false));
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1500));
    const ff = async (s) => {
      const ms = Math.max(16, Math.round(s * 1000));
      await page.evaluate(() => window.__n9 && (window.__n9.draw = false));
      if (ms > 32) await page.clock.runFor(ms - 32);
      await page.evaluate(() => window.__n9 && (window.__n9.draw = true));
      await page.clock.runFor(32);
    };
    await ff(wait);
    mark('settled');
    const name = (suffix) => join(outDir, `${slug}_${size}${suffix}.png`);
    if (flags.do) {
      await page.evaluate((js) => (0, eval)(js), String(flags.do));
      let at = 0;
      for (const s of after.length ? after : [wait]) {
        await ff(s - at);
        at = s;
        const f = name(`_${s}s`);
        await snap(page, f);
        saved.push(f);
      }
    } else {
      const f = name('');
      await snap(page, f);
      saved.push(f);
    }
    mark('shot');
    console.log(`${size}: ${url.replace(origin, '')} · ${lap.join(' · ')} s`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
for (const f of saved) console.log(f);
