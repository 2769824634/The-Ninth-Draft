/**
 * Chinese web fonts, cut to fit.
 *
 * fonts-src/zh/ holds one master per role (GB2312 coverage, ~7,600 glyphs).
 * A full CJK font is megabytes, so the built site never ships the masters:
 * after `astro build` this integration collects every CJK character that
 * actually appears in the output (pages, scripts, data) and writes a subset
 * of each master to dist/fonts/zh/. Add a Chinese record and the next build
 * picks its characters up on its own. In `astro dev` the masters are served
 * as they are.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const SRC = fileURLToPath(new URL('../fonts-src/zh/', import.meta.url));
export const ZH_FONTS = ['kuhei', 'huosong', 'din-con', 'din-bold', 'bitmap', 'fangsong'];

/** Han, CJK punctuation, full-width forms, and a few marks the fonts draw better than Latin faces. */
const CJK = /[⺀-⿟　-〿㐀-䶿一-鿿豈-﫿︰-﹏＀-￯]/gu;
/** Always included, so a stray ellipsis or dash in a later edit never falls back. */
const ALWAYS = '，。、；：？！“”‘’（）《》〈〉【】「」『』—…·０１２３４５６７８９';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(html|js|mjs|json|css|txt|xml)$/.test(e.name)) out.push(p);
  }
  return out;
}

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
          const m = req.url?.match(/\/fonts\/zh\/([a-z-]+)\.woff2(?:\?.*)?$/);
          if (!m || !ZH_FONTS.includes(m[1])) return next();
          res.setHeader('Content-Type', 'font/woff2');
          fs.createReadStream(path.join(SRC, `${m[1]}.woff2`)).pipe(res);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const chars = new Set(ALWAYS);
        for (const f of walk(out)) {
          // JSON payloads escape nothing above U+007F, so a plain scan is enough
          for (const c of fs.readFileSync(f, 'utf8').match(CJK) ?? []) chars.add(c);
        }
        const text = [...chars].join('');
        const target = path.join(out, 'fonts', 'zh');
        fs.mkdirSync(target, { recursive: true });
        let total = 0;
        for (const name of ZH_FONTS) {
          const buf = await subsetFont(fs.readFileSync(path.join(SRC, `${name}.woff2`)), text, { targetFormat: 'woff2' });
          fs.writeFileSync(path.join(target, `${name}.woff2`), buf);
          total += buf.length;
        }
        logger.info(`${chars.size} CJK characters → ${ZH_FONTS.length} fonts, ${(total / 1024).toFixed(0)} KB (${base}fonts/zh/)`);
      },
    },
  };
}
