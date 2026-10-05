/**
 * The visitor's small secret, assembled from templates.
 *
 * Everything is derived from the registration (codename, number, district,
 * answers) plus the records already in the archive, so the same visitor
 * always gets the same secret, on any device, and new records join in
 * without anyone writing anything for them.
 *
 * Like every file, the secret has nine drafts. The final draft is the
 * Office's version: bland, with the interesting parts blacked out. Earlier
 * drafts say more.
 */
import { DISTRICTS, districtName } from './districts';
import { QUESTIONS, type L } from './questions';
import { hash, normCode, rng, type Visitor } from './store';

export interface SecretRecord {
  file: string;
  slug: string;
  title: string;
  titleZh?: string;
  district?: string;
}

/** Six kinds of secret. `{…}` slots are filled per visitor. */
const KINDS: Kind[] = [
  {
    name: { en: 'Revised-out', zh: '被修订者' },
    head: { en: 'You were revised out.', zh: '你是被修订出去的人。' },
    cover: { en: 'Resident status: normal.', zh: '居民状态：正常。' },
    detail: { en: 'In {year} your name was in the {district} household register. From draft {n} it is struck out. Nobody remembers why, including you.', zh: '{year} 年，{district}的户籍册上还有你的名字。从第 {n} 稿起它被划掉了。没人记得为什么，包括你。' },
  },
  {
    name: { en: 'Old-sea witness', zh: '旧海知情人' },
    head: { en: 'You know where the old sea was.', zh: '你知道旧海在哪。' },
    cover: { en: 'Address verified.', zh: '住址已核实。' },
    detail: { en: 'Before the reclamation, the end of your street in {district} was water. On {date} you walked down there anyway. Your shoes came back wet.', zh: '填海以前，{district}那条街的尽头是海。{date}那晚你还是走过去了，回来时鞋是湿的。' },
  },
  {
    name: { en: 'Duplicate file', zh: '重名档案' },
    head: { en: 'There is a second you on file.', zh: '霏微还有另一个你。' },
    cover: { en: 'No duplicate records found.', zh: '未发现重复档案。' },
    detail: { en: 'A second file under your codename sits in the {other} drawer, dated {date}. The photograph is yours. The handwriting is not.', zh: '{other}的抽屉里还有一份写着你代号的档案，日期 {date}。照片是你的，笔迹不是。' },
  },
  {
    name: { en: 'Witness', zh: '目击者' },
    head: { en: 'You saw a backflow, and signed a form saying you did not.', zh: '你见过回流，还签字说没见过。' },
    cover: { en: 'Witness statement: nothing to report.', zh: '目击陈述：无事可报。' },
    detail: { en: 'On {date}, in {district}, a shophouse was a bus stop for eleven minutes. You signed Form RO-7, “Nothing Unusual Observed”, in blue ink.', zh: '{date}，{district}有一间店屋当了十一分钟的巴士站。你用蓝墨水签了 RO-7 表：「未见异常」。' },
  },
  {
    name: { en: 'Ninth plan', zh: '第九版' },
    head: { en: 'Heuss’s ninth plan has you in it.', zh: 'Heuss 的第九版方案里有你。' },
    cover: { en: 'Not referenced in any plan.', zh: '未见于任何方案。' },
    detail: { en: 'The ninth plan for the year-field remediation was never submitted. On its first page, the {district} line holds one name: yours.', zh: '年份字段整改的第九版方案一直没交。它第一页上，{district}那一栏只写了一个名字：你的。' },
  },
  {
    name: { en: 'Borrowed year', zh: '借年者' },
    head: { en: 'One of your years is borrowed.', zh: '你有一年是借来的。' },
    cover: { en: 'Date records: complete.', zh: '日期记录：完整。' },
    detail: { en: 'Your {year} was lent to you by the Office in {lend}. It has not asked for it back yet. It will.', zh: '你的 {year} 年，是记录署在 {lend} 年借给你的。至今没来催还，迟早会的。' },
  },
];

interface Kind { name: L; head: L; cover: L; detail: L }

const NOTE: L = { en: 'I left this one in.', zh: '这一条我没划。' };
const KIND_LABEL: L = { en: 'Case type', zh: '案件类型' };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const bar = (s: string) => `<span class="sx-bar" aria-label="Blacked out">${'█'.repeat(Math.max(4, Math.round(s.length / (/[一-鿿]/.test(s) ? 1 : 2))))}</span>`;

export interface Secret {
  kind: number;
  /** Case-type name, for the file's header. */
  kindName: (zh: boolean) => string;
  /** HTML of the secret as it stands in draft `d` (1–9). */
  render: (d: number, zh: boolean) => string;
}

export function makeSecret(v: Visitor, records: SecretRecord[], base: string): Secret {
  const r = rng(hash(`${normCode(v.code)}|${v.no}`));
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const kind = Math.floor(r() * KINDS.length);
  const year = 1991 + Math.floor(r() * 8);
  const month = 1 + Math.floor(r() * 12);
  const yy = 91 + Math.floor(r() * 9);
  const n = 2 + Math.floor(r() * 7);
  const lend = 1980 + Math.floor(r() * 11);
  const other = pick(DISTRICTS.filter((d) => d.id !== v.district)).id;
  // A record from the visitor's district when there is one, else any record
  const near = records.filter((x) => x.district === v.district);
  const rec = records.length ? pick(near.length ? near : records) : null;
  const date = `09.${String(month).padStart(2, '0')}.${yy}`;
  const k = KINDS[kind];

  const render = (d: number, zh: boolean) => {
    const lang = zh ? 'zh' : 'en';
    const vars = { year, n, lend, date, district: districtName(v.district, zh), other: districtName(other, zh) };
    const out: string[] = [];
    out.push(`<p class="sx-kind"><span>${esc(KIND_LABEL[lang])}</span> ${esc(k.name[lang])}</p>`);
    // Headline: the Office's cover story in the late drafts, the truth early on
    const cover = esc(k.cover[lang]);
    const head = esc(k.head[lang]);
    out.push(`<p class="sx-head">${d >= 7 ? cover : d >= 4 ? `<del>${cover}</del> ${head}` : head}</p>`);
    const detail = esc(fill(k.detail[lang], vars));
    out.push(`<p class="sx-lede">${d >= 7 ? bar(detail) : detail}</p>`);
    // What the visitor answered at the counter stays on record in every draft
    out.push(
      `<dl class="sx-log">${v.answers
        .map((a, i) => {
          const q = QUESTIONS[i];
          const o = q.opts[a] ?? q.opts[0];
          return `<div><dt>${esc(q.label[lang])}</dt><dd><b>${esc(o.v[lang])}</b><span>${esc(o.note[lang])}</span></dd></div>`;
        })
        .join('')}</dl>`,
    );
    if (v.line) {
      const line = zh ? `你记得「${esc(v.line)}」。署里说，霏微从来没有过这种东西。` : `You remember “${esc(v.line)}”. The Office says Gerimis has never had any such thing.`;
      out.push(`<p class="sx-line">${d >= 6 ? bar(line) : line}</p>`);
    }
    if (rec) {
      const title = esc(zh ? rec.titleZh ?? rec.title : rec.title);
      const link = `<a href="${base}records/${rec.slug}/">${esc(rec.file)}</a>`;
      const rest = zh ? `（${title}）的背面，有人用铅笔写过一次你的代号。署里没人承认是自己写的。` : ` (${title}): your codename appears once on the back, in pencil. Nobody at the Office admits to writing it.`;
      const lead = zh ? '' : 'File ';
      // The file number stays a link even when the rest is blacked out
      out.push(`<p class="sx-ref"><span>${zh ? '参见' : 'See'}</span> ${lead}${link}${d >= 4 ? bar(rest) : rest}</p>`);
    }
    if (d === 2 || d === 3) out.push(`<p class="sx-note">${esc(NOTE[lang])}<span>— Heuss</span></p>`);
    return out.join('');
  };
  return { kind, kindName: (zh) => k.name[zh ? 'zh' : 'en'], render };
}
