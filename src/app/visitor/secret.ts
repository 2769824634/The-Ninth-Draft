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
import { hash, normCode, rng, type Visitor } from './store';

export interface SecretRecord {
  file: string;
  slug: string;
  title: string;
  titleZh?: string;
  district?: string;
}

type L = { en: string; zh: string };

/** What the visitor answered, as the Office wrote it down. */
const HABITS: L[][] = [
  [
    { en: 'You go to bed before eleven, so you have never seen what the Office does after midnight.', zh: '你十一点前就睡，所以从没见过记录署半夜在忙什么。' },
    { en: 'You sleep after two, the hour when nobody checks the register.', zh: '你两点以后才睡。那个钟点，没人核对名册。' },
    { en: 'Your clock runs one draft behind. It is the only accurate clock on the island.', zh: '你家的钟慢了一稿。全岛只有它是准的。' },
  ],
  [
    { en: 'The road outside your door has always had the same name. The Office has three forms that disagree.', zh: '你家门口那条路一直叫这个名字。记录署有三份表格表示不同意。' },
    { en: 'You remember the road’s old name. You have never said it out loud, which is wise.', zh: '你记得那条路原来的名字，但从没说出口。很明智。' },
    { en: 'You declined to answer about the road. The Office has noted your discretion, in triplicate.', zh: '你拒绝回答那条路的事。署方已注意到你的谨慎，一式三份。' },
  ],
  [
    { en: 'On the bus, the stop announcements sometimes name a stop that was demolished.', zh: '你坐的巴士报站时，偶尔会报一个早就拆掉的站。' },
    { en: 'In the corridor of your block, one door number skips. You have counted twice.', zh: '你那层组屋走廊，有一扇门的门牌跳了号。你数过两次。' },
    { en: 'In the mirror, your reflection is sometimes half a second late. It is catching up.', zh: '镜子里的你偶尔慢半拍。它在追。' },
  ],
];

interface Kind { head: L; cover: L; detail: L }

/** Six kinds of secret. `{…}` slots are filled per visitor. */
const KINDS: Kind[] = [
  {
    head: { en: 'You were revised out.', zh: '你是被修订出去的人。' },
    cover: { en: 'Resident status: normal.', zh: '居民状态：正常。' },
    detail: { en: 'In {year} your name was in the {district} household register. It was struck out in draft {n}, and nobody remembers why. Not even you.', zh: '{year} 年，{district}的户籍册上还有你的名字。第 {n} 稿起被划掉了，没人记得为什么，包括你。' },
  },
  {
    head: { en: 'You know where the old sea was.', zh: '你知道旧海在哪里。' },
    cover: { en: 'Address verified.', zh: '住址已核实。' },
    detail: { en: 'Before the reclamation, the end of your street in {district} was water. On {date} you walked there anyway, and your shoes came back wet.', zh: '填海以前，你在{district}那条街的尽头是海。{date}那晚你还是走过去了，回来时鞋是湿的。' },
  },
  {
    head: { en: 'There is a second copy of you.', zh: '霏微还有另一份你。' },
    cover: { en: 'No duplicate records found.', zh: '未发现重复档案。' },
    detail: { en: 'A second file under your codename sits in the {other} drawer, dated {date}. The photograph is yours. The handwriting is not.', zh: '{other}的抽屉里还有一份写着你代号的档案，日期 {date}。照片是你，笔迹不是。' },
  },
  {
    head: { en: 'You saw a backflow, and signed a form saying you did not.', zh: '你亲眼见过回流，然后签字说没见过。' },
    cover: { en: 'Witness statement: nothing to report.', zh: '证人陈述：无事可报。' },
    detail: { en: 'On {date}, in {district}, a shophouse was a bus stop for eleven minutes. You signed Form RO-7, “Nothing Unusual Observed”, in blue ink.', zh: '{date}，{district}有一间店屋当了十一分钟的巴士站。你用蓝墨水签了 RO-7 表：「未见异常」。' },
  },
  {
    head: { en: 'Heuss’s ninth plan mentions you.', zh: 'Heuss 的第九版方案里有你。' },
    cover: { en: 'Not referenced in any plan.', zh: '未见于任何方案。' },
    detail: { en: 'The ninth plan for the year-field remediation was never submitted. Its first page lists one name for {district}: yours.', zh: '年份字段整改的第九版方案一直没交。它的第一页，{district}一栏只写了一个名字：你的。' },
  },
  {
    head: { en: 'One of your years is on loan.', zh: '你有一年是借来的。' },
    cover: { en: 'Date records: complete.', zh: '日期记录：完整。' },
    detail: { en: 'Your {year} was lent to you by the Office in {lend}. It has not asked for it back. It will.', zh: '你的 {year} 年，是记录署在 {lend} 年借给你的。至今没有催还。迟早会的。' },
  },
];

const NOTE: L = { en: 'I left this one in.', zh: '这一条我没划。' };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const bar = (s: string) => `<span class="sx-bar" aria-label="Blacked out">${'█'.repeat(Math.max(4, Math.round(s.length / (/[一-鿿]/.test(s) ? 1 : 2))))}</span>`;

export interface Secret {
  kind: number;
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
    // Headline: the Office's cover story in the late drafts, the truth early on
    const cover = esc(k.cover[lang]);
    const head = esc(k.head[lang]);
    out.push(`<p class="sx-head">${d >= 7 ? cover : d >= 4 ? `<del>${cover}</del> ${head}` : head}</p>`);
    const detail = esc(fill(k.detail[lang], vars));
    out.push(`<p>${d >= 7 ? bar(detail) : detail}</p>`);
    // The visitor's own answers are on record in every draft
    out.push(`<p class="sx-habits">${v.answers.map((a, i) => esc(HABITS[i][a][lang])).join(' ')}</p>`);
    if (v.line) {
      const line = zh ? `你记得「${esc(v.line)}」。记录署说，霏微从来没有过这种东西。` : `You remember “${esc(v.line)}”. The Office says there has never been any such thing on Gerimis.`;
      out.push(`<p>${d >= 6 ? bar(line) : line}</p>`);
    }
    if (rec) {
      const title = esc(zh ? rec.titleZh ?? rec.title : rec.title);
      const link = `<a href="${base}records/${rec.slug}/">${esc(rec.file)}</a>`;
      const line = zh ? `${link}（${title}）的背面，有人用铅笔写过一次你的代号。` : `Your codename appears once, in pencil, on the back of file ${link} (${title}).`;
      out.push(`<p>${d >= 4 ? bar(zh ? `${rec.file}（${title}）的背面，有人用铅笔写过一次你的代号。` : `Your codename appears once, in pencil, on the back of file ${rec.file}.`) : line}</p>`);
    }
    if (d === 2 || d === 3) out.push(`<p class="sx-note">${esc(NOTE[lang])}<span>— Heuss</span></p>`);
    return out.join('');
  };
  return { kind, render };
}
