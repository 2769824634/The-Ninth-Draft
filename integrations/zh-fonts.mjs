/**
 * Chinese web fonts, cut into slices.
 *
 * fonts-src/zh/ holds one master per role (GB2312 coverage, ~7,600 glyphs).
 * A full CJK font is megabytes, so the built site never ships the masters.
 * After `astro build` this integration counts every CJK character that
 * appears in the output (pages, scripts, data), sorts them by how often
 * they are used, and cuts each master into slices: the commonest characters
 * in the first slice, rarer ones further down. Each slice gets its own
 * @font-face with a unicode-range, so a browser only downloads the slices
 * whose characters are on the page in front of it. A long book full of
 * rare characters costs nothing on the pages that don't show it.
 *
 * The rules go to dist/fonts/zh/faces.css; slice files carry a content hash
 * so a new build never meets an old slice in a cache. Add Chinese text and
 * the next build picks its characters up on its own. In `astro dev` the
 * masters are served whole.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const SRC = fileURLToPath(new URL('../fonts-src/zh/', import.meta.url));
/** Role → family name used in the CSS (see tokens.css). */
export const ZH_FONTS = {
  kuhei: 'N9 KuHei',
  huosong: 'N9 HuoSong',
  'din-con': 'N9 DIN',
  'din-bold': 'N9 DIN Bold',
  bitmap: 'N9 Bitmap',
  fangsong: 'N9 Fangsong',
};

/** Han, CJK punctuation, full-width forms, and a few marks the fonts draw better than Latin faces. */
const CJK = /[⺀-⿟　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/gu;
const CJK_RANGE = 'U+2E80-2FDF, U+3000-303F, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF';
/** Always in the first slice, so a stray ellipsis or dash in a later edit never falls back. */
const ALWAYS = '，。、；：？！“”‘’（）《》〈〉【】「」『』—…·０１２３４５６７８９';
/** Characters in the first slice (what nearly every page uses) and in each one after it. */
const FIRST = 600;
const NEXT = 200;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js|mjs|json|css|txt|xml)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Code points as a compact unicode-range: runs collapse to U+4E00-4E05. */
function range(chars) {
  const cps = [...new Set(chars.map((c) => c.codePointAt(0)))].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const hex = (n) => n.toString(16).toUpperCase();
    out.push(j > i ? `U+${hex(cps[i])}-${hex(cps[j])}` : `U+${hex(cps[i])}`);
    i = j;
  }
  return out.join(',');
}

const face = (family, url, ur) => `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-display:swap;unicode-range:${ur}}`;

export default function zhFonts() {
  let base = '/';
  return {
    name: 'n9-zh-fonts',
    hooks: {
      'astro:config:done': ({ config }) => {
        base = config.base.endsWith('/') ? config.base : `${config.base}/`;
      },
      'astro:server:setup': ({ server }) => {
        server.middlewares.use((req, res, next) => {
          if (/\/fonts\/zh\/faces\.css(?:\?.*)?$/.test(req.url ?? '')) {
            res.setHeader('Content-Type', 'text/css');
            res.end(Object.entries(ZH_FONTS).map(([file, family]) => face(family, `${base}fonts/zh/${file}.woff2`, CJK_RANGE)).join('\n'));
            return;
          }
          const m = req.url?.match(/\/fonts\/zh\/([a-z-]+)\.woff2(?:\?.*)?$/);
          if (!m || !(m[1] in ZH_FONTS)) return next();
          res.setHeader('Content-Type', 'font/woff2');
          fs.createReadStream(path.join(SRC, `${m[1]}.woff2`)).pipe(res);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const count = new Map();
        const books = `${path.sep}library${path.sep}books${path.sep}`;
        for (const f of walk(out)) {
          // the books' long texts would otherwise decide the order; a character the
          // rooms and pages use counts for more, so the first slices stay the site's own
          const w = f.includes(books) ? 1 : 50;
          // JSON payloads escape nothing above U+007F, so a plain scan is enough
          for (const c of fs.readFileSync(f, 'utf8').match(CJK) ?? []) count.set(c, (count.get(c) ?? 0) + w);
        }
        // commonest first; ties in code point order so the cut is stable between builds
        const always = [...ALWAYS];
        const rest = [...count.keys()]
          .filter((c) => !ALWAYS.includes(c))
          .sort((a, b) => count.get(b) - count.get(a) || a.codePointAt(0) - b.codePointAt(0));
        const slices = [always.concat(rest.slice(0, FIRST))];
        for (let i = FIRST; i < rest.length; i += NEXT) slices.push(rest.slice(i, i + NEXT));

        const target = path.join(out, 'fonts', 'zh');
        fs.mkdirSync(target, { recursive: true });
        const rules = [];
        let total = 0;
        for (const [file, family] of Object.entries(ZH_FONTS)) {
          const master = fs.readFileSync(path.join(SRC, `${file}.woff2`));
          const bufs = await Promise.all(slices.map((s) => subsetFont(master, s.join(''), { targetFormat: 'woff2' })));
          bufs.forEach((buf, i) => {
            const name = `${file}.${i}.${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8)}.woff2`;
            fs.writeFileSync(path.join(target, name), buf);
            rules.push(face(family, `${base}fonts/zh/${name}`, range(slices[i])));
            total += buf.length;
          });
        }
        fs.writeFileSync(path.join(target, 'faces.css'), rules.join('\n'));
        logger.info(`${count.size} CJK characters → ${slices.length} slices × ${Object.keys(ZH_FONTS).length} fonts, ${(total / 1024).toFixed(0)} KB (${base}fonts/zh/)`);
      },
    },
  };
}
