#!/usr/bin/env node
/**
 * How heavy a 3D room is to draw, in numbers: draw calls and triangles per
 * frame, how many lights and shadow maps, how many shader programs, and how
 * many shaders get compiled when the lights change (each compile is a stall
 * the visitor feels as a jump).
 *
 *   node scripts/perf.mjs archive
 *   node scripts/perf.mjs office --phone
 *
 * Runs the built site (dist/) in check mode with shadows on, so it counts what
 * a visitor's browser does. The milliseconds come from a software renderer and
 * only compare one build with another; the counts are the same on any machine.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/The-Ninth-Draft/';
const ROOMS = { archive: '', office: 'office/', library: 'library/', wall: 'wall/' };
const args = process.argv.slice(2);
const room = args.find((a) => !a.startsWith('--')) ?? 'archive';
const phone = args.includes('--phone');
const dist = join(ROOT, 'dist');
while (existsSync('/tmp/n9-build.lock')) await new Promise((ok) => setTimeout(ok, 1000));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (!url.startsWith(BASE)) return res.writeHead(302, { location: BASE }).end();
  let file = join(dist, url.slice(BASE.length));
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, '404.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'].find((p) => p && existsSync(p)),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.stack));
  // count every shader program linked, from the first frame on
  await page.addInitScript(() => {
    const w = window;
    w.__links = 0;
    w.__linkMs = 0;
    for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const link = C.prototype.linkProgram;
      C.prototype.linkProgram = function (p) {
        const t = performance.now();
        link.call(this, p);
        this.getProgramParameter(p, this.LINK_STATUS); // forces the compile to finish here
        w.__linkMs += performance.now() - t;
        w.__links++;
      };
    }
  });
  await page.goto(`${origin}${BASE}${ROOMS[room] ?? room}?check&shadows`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction(() => window.__n9?.ready, null, { timeout: 180_000, polling: 250 });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(async (room) => {
    const w = window;
    const sc = w.__n9.scene ?? w.__n9.wall;
    const r = sc.renderer;
    const gl = r.getContext();
    const px = new Uint8Array(4);
    const lights = [];
    sc.scene.traverse((o) => o.isLight && lights.push(o));
    const sample = () => {
      // stop the room's own loop from drawing; draw by hand and wait for the GPU
      w.__n9.draw = false;
      r.info.autoReset = false;
      r.info.reset();
      const t = performance.now();
      sc.shadowCache?.update();
      r.render(sc.scene, sc.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = performance.now() - t;
      const s = { calls: r.info.render.calls, tris: r.info.render.triangles, ms };
      r.info.autoReset = true;
      w.__n9.draw = true;
      return s;
    };
    const median = (n) => {
      const xs = [];
      for (let i = 0; i < n; i++) xs.push(sample());
      xs.sort((a, b) => a.ms - b.ms);
      return xs[n >> 1];
    };
    // shadow casters that move while the visitor does nothing
    const snapM = () => { const m = new Map(); sc.scene.traverse((o) => o.isMesh && o.castShadow && m.set(o, o.matrixWorld.elements.join())); return m; };
    sample();
    const m0 = snapM();
    sc.pause?.(); for (let i = 0; i < 3; i++) (sc.frame ?? sc.tick).call(sc); sc.resume?.();
    sample();
    const moving = [];
    for (const [o, e] of snapM()) if (m0.get(o) !== e) moving.push(o.name || o.parent?.name || o.geometry?.type);
    const idle = median(5);
    // the same frame with the shadow maps left as they are: what the shadows cost
    const au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    const flat = median(3);
    r.shadowMap.autoUpdate = au;
    let meshes = 0, casters = 0;
    sc.scene.traverse((o) => { if (o.isMesh && o.visible) { meshes++; if (o.castShadow) casters++; } });
    const live = lights.filter((l) => l.visible);
    const res = {
      size: `${r.domElement.width}×${r.domElement.height} @${r.getPixelRatio()}`,
      lights: lights.length,
      lightsOn: live.length,
      shadowMaps: live.filter((l) => l.castShadow).length,
      shadowPx: live.filter((l) => l.castShadow).reduce((a, l) => a + l.shadow.mapSize.x * l.shadow.mapSize.y, 0),
      calls: idle.calls,
      tris: idle.tris,
      frameMs: Math.round(idle.ms),
      mainCalls: flat.calls,
      mainMs: Math.round(flat.ms),
      meshes,
      casters,
      movingCasters: moving.length,
      moving: moving.slice(0, 12).join(', '),
      programs: r.info.programs.length,
      linksAtLoad: w.__links,
      linkMsAtLoad: Math.round(w.__linkMs),
    };
    // flip the lights the way a visitor does and count the shaders built for it
    const before0 = w.__links;
    // the room's own loop is held; each step runs one frame of it by hand
    sc.pause?.();
    const wait = async () => { for (let i = 0; i < 3; i++) (sc.frame ?? sc.tick).call(sc); };
    if (room === 'archive') {
      const s = sc;
      // walk round the room first: corners not yet seen
      const t0 = w.__links;
      const red = s.reduce;
      s.reduce = true;
      for (const z of ['formal', 'routine', 'reading', 'counter', 'door', 'reel', 'overview']) {
        s.goZone(z);
        w.__n9.draw = false;
        for (let i = 0; i < 30; i++) s.frame();
        w.__n9.draw = true;
        s.frame();
      }
      s.reduce = red;
      res.linksOnWalk = w.__links - t0;
      for (let i = 0; i < 4; i++) s.setRow(i, false, true);
      await wait(400);
      s.setTheme('night', true);
      await wait(400);
      for (let i = 0; i < 4; i++) { s.setRow(i, true, true); await wait(300); }
      s.setDesk(0, true, true);
      await wait(300);
      s.setDesk(0, false, true);
      await wait(300);
      s.setTheme('day', true);
      await wait(400);
    } else if (sc.setTheme) {
      sc.setTheme('night', true);
      await wait(600);
      sc.setTheme('day', true);
      await wait(600);
    }
    res.linksOnToggles = w.__links - before0 - (res.linksOnWalk ?? 0);
    return res;
  }, room);
  console.log(JSON.stringify({ room, phone, ...out }, null, 1));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
