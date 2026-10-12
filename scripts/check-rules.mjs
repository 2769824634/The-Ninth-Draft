#!/usr/bin/env node
/**
 * The house rules a machine can check (see docs/协作.md, 「自动检查查什么」).
 * Only what this branch adds is looked at: added files and added lines against
 * the merge base with main. Old code is never flagged.
 *
 *   node scripts/check-rules.mjs                 # against origin/main
 *   CHECK_BASE=main node scripts/check-rules.mjs
 *   CHECK_AS_CODEX=1 node scripts/check-rules.mjs  # apply the codex/ branch rules
 *
 * Errors stop the PR; warnings are shown for whoever reviews it.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

const rules = JSON.parse(readFileSync(new URL('./rules.json', import.meta.url), 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

const base = process.env.CHECK_BASE || 'origin/main';
let mergeBase;
try {
  mergeBase = git('merge-base', base, 'HEAD').trim();
} catch {
  console.error(`找不到 ${base}。先 git fetch origin main，或用 CHECK_BASE 指定要比的分支。`);
  process.exit(2);
}
const branch = process.env.GITHUB_HEAD_REF || git('rev-parse', '--abbrev-ref', 'HEAD').trim();
const codex = process.env.CHECK_AS_CODEX === '1' || branch.startsWith(rules.codexBranchPrefix);

/* ---------------- what changed ---------------- */
// against the merge base, working tree included, so it also works before a commit
const changes = new Map(); // path -> status letter (A, M, D, R)
for (const line of git('diff', '--name-status', '-M', '--no-color', mergeBase).split('\n')) {
  if (!line) continue;
  const [st, a, b] = line.split('\t');
  changes.set(b ?? a, st[0]);
}
for (const f of git('ls-files', '--others', '--exclude-standard').split('\n')) if (f) changes.set(f, 'A');

/** Added lines of a file, with their line numbers in the new version. */
function addedLines(file) {
  if (!existsSync(file)) return [];
  if (changes.get(file) === 'A' && !git('ls-files', '--', file).trim()) {
    return readFileSync(file, 'utf8').split('\n').map((text, i) => ({ n: i + 1, text }));
  }
  const out = [];
  let n = 0;
  for (const l of git('diff', '-U0', '--no-color', '--no-ext-diff', mergeBase, '--', file).split('\n')) {
    const h = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (h) n = Number(h[1]);
    else if (l.startsWith('+') && !l.startsWith('+++')) out.push({ n: n++, text: l.slice(1) });
  }
  return out;
}

/* ---------------- reporting ---------------- */
const found = { error: [], warning: [] };
const say = (level, file, line, msg) => found[level].push({ file, line, msg });
const under = (file, list) => list.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
const isText = (file, exts) => exts.includes(extname(file).toLowerCase());

const present = [...changes].filter(([, st]) => st !== 'D').map(([f]) => f);

// 1. files only the author and Claude change
if (codex) {
  for (const [f] of changes) if (under(f, rules.protectedForCodex)) say('error', f, 0, `codex/ 分支不能改这个文件（见 AGENTS.md「改不了的文件」）。需要改就在 PR 里提出来。`);
}

// 2. assets: only original work goes in, and never a commercial song
for (const f of present) {
  if (changes.get(f) !== 'A') continue;
  const ext = extname(f).toLowerCase();
  if (codex && rules.assetExtensions.includes(ext)) say('error', f, 0, `codex/ 分支不能加图片、音频、模型或字体（素材只能原创，见 CLAUDE.md「基本约定」）。`);
  else if (rules.audioExtensions.includes(ext)) say('warning', f, 0, `新加了音频文件。请确认是作者自己上传的录音，不是商用歌曲（商用歌曲永远不进仓库）。`);
}

// 3. outside addresses: no images, fonts or scripts from elsewhere
const URL_RE = /https?:\/\/([a-z0-9.-]+)/gi;
for (const f of present) {
  if (!under(f, rules.urls.include) || !isText(f, rules.urls.textExtensions)) continue;
  for (const { n, text } of addedLines(f)) {
    for (const m of text.matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (!rules.urls.allowHosts.includes(host)) say('error', f, n, `新出现外部网址 ${m[0]}。素材都要放在仓库里、原创；确实需要的链接（例如求助热线）加进 scripts/rules.json 的 allowHosts，并在 PR 里说明。`);
    }
  }
}

// 4. the hidden setting stays hidden on the island's surface
const lore = rules.lore.patterns.map((p) => new RegExp(p, 'i'));
const asTime = rules.draftAsTime.patterns.map((p) => new RegExp(p, 'i'));
for (const f of present) {
  if (!isText(f, rules.urls.textExtensions)) continue;
  const checkLore = under(f, rules.lore.include) && !under(f, rules.lore.exclude);
  const checkTime = under(f, rules.draftAsTime.include);
  if (!checkLore && !checkTime) continue;
  for (const { n, text } of addedLines(f)) {
    // one warning of each kind per line is enough
    const word = checkLore && lore.find((re) => re.test(text));
    if (word) say('warning', f, n, `出现暗设定词「${text.match(word)[0]}」。岛上的人不知道「第九稿」，界面上只有浏览器标签和首页封面可以写 The Ninth Draft（见 CLAUDE.md「网站的意义与方向」）。确认是有意的。`);
    const time = checkTime && asTime.find((re) => re.test(text));
    if (time) say('warning', f, n, `「${text.match(time)[0]}」像把「稿」当时间单位用。稿只数修订，时间用小时、分钟、日期（见 CLAUDE.md「用词」）。`);
  }
}

// 5. English and Chinese move together
const touched = new Set([...changes].filter(([, st]) => st !== 'D').map(([f]) => f));
const pairs = [...rules.pairs];
for (const f of touched) {
  if (!under(f, rules.pairedContent) || !f.endsWith('.md')) continue;
  pairs.push(f.endsWith('.zh.md') ? [f.replace(/\.zh\.md$/, '.md'), f] : [f, f.replace(/\.md$/, '.zh.md')]);
}
const seen = new Set();
for (const [en, zh] of pairs) {
  const key = `${en}|${zh}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const a = touched.has(en), b = touched.has(zh);
  if (a && !b && existsSync(zh)) say('warning', en, 0, `改了英文，没改中文 ${zh}。如果两边意思都该变，记得一起改。`);
  if (b && !a && existsSync(en)) say('warning', zh, 0, `改了中文，没改英文 ${en}。如果两边意思都该变，记得一起改。`);
}

/* ---------------- output ---------------- */
const gha = process.env.GITHUB_ACTIONS === 'true';
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const where = (x) => (x.line ? `${x.file}:${x.line}` : x.file);
for (const level of ['error', 'warning']) {
  for (const x of found[level]) {
    if (gha) console.log(`::${level} file=${esc(x.file)}${x.line ? `,line=${x.line}` : ''}::${esc(x.msg)}`);
    else console.log(`${level === 'error' ? '✗ 错误' : '! 提醒'}  ${where(x)}\n    ${x.msg}`);
  }
}
const head = `规矩检查：${changes.size} 个文件有改动${codex ? '（按 codex/ 分支的规矩查）' : ''}，${found.error.length} 个错误，${found.warning.length} 个提醒。`;
console.log(head);
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = [...found.error.map((x) => ['错误', x]), ...found.warning.map((x) => ['提醒', x])]
    .map(([k, x]) => `| ${k} | \`${where(x)}\` | ${x.msg.replace(/\|/g, '\\|')} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${head}\n\n${rows.length ? `| | 位置 | 说明 |\n| --- | --- | --- |\n${rows.join('\n')}\n` : '没有发现问题。\n'}`);
}
process.exit(found.error.length ? 1 : 0);
