/**
 * The Records Office library: every book on its shelves is bound at build
 * time from what the archive already holds, so nobody writes a book.
 *
 *   Bay 1  The Gerimis Daily, one volume a month (from daily.ts)
 *   Bay 2  District gazetteer, one volume a district
 *   Bay 3  Bound records, one volume a category (twelve files a volume)
 *   Bay 4  Office publications: the revision log, the visitor's guide, and
 *          the year-field remediation proposals, filed in order.
 *
 * Each book is a list of pages, each page a heading and some HTML, in both
 * languages. The reader shows one page at a time.
 */
import type { ClientRecord } from './records';
import { buildIssues, isoDate, longDate, MONTHS_EN } from './daily';
import { DISTRICTS } from '../app/visitor/districts';
import { DISTRICT_TEXT } from '../app/visitor/counter';

type L = { en: string; zh: string };

export interface LibPage {
  head: L;
  html: L;
  /** An issue of the Daily: not shown before its day on the island. */
  date?: string;
}

export interface LibBook {
  id: string;
  /** news: hung on a newspaper stick · pamphlet: a few stapled pages · cloth: a bound volume · ledger: a register · binder: a ring binder */
  kind: 'news' | 'pamphlet' | 'cloth' | 'ledger' | 'binder';
  /** Cloth colour of the binding. */
  color: string;
  /** Spine label: title and a short line under it. */
  spine: L;
  sub: L;
  /** Shelf mark printed at the foot of the spine (stays English). */
  mark: string;
  /** Relative height (1 = tallest) and thickness in pages-ish. */
  h: number;
  thick: number;
  pages: LibPage[];
}

export interface LibBay {
  /** Where in the reading room the bay stands. */
  zone: 'rack' | 'stacks' | 'desk';
  id: string;
  code: string;
  title: L;
  books: LibBook[];
  /** A slot left empty on the shelf, after this many books. */
  gapAt?: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const strip = (html: string) =>
  html
    .replace(/<span class="rv-note"[\s\S]*?<\/span><\/span>/g, '')
    // a redaction stays black in the library too
    .replace(/<span class="redact"[^>]*><span>([\s\S]*?)<\/span><\/span>/g, (_, t: string) => '█'.repeat(Math.max(3, Math.min(14, t.replace(/<[^>]+>/g, '').length))))
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const both = (s: string): L => ({ en: s, zh: s });
const link = (href: string, en: string, zh: string): L => ({
  en: `<p class="lib-go"><a href="${href}">${en} →</a></p>`,
  zh: `<p class="lib-go"><a href="${href}">${zh} →</a></p>`,
});
const join = (...parts: L[]): L => ({ en: parts.map((p) => p.en).join(''), zh: parts.map((p) => p.zh).join('') });
const p = (en: string, zh: string): L => ({ en: `<p>${en}</p>`, zh: `<p>${zh}</p>` });
const ZH_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const MON = MONTHS_EN.map((m) => m.slice(0, 3).toUpperCase());

/** Cloth for each clearance, darker than the screen colours: old buckram. */
const CLOTH: Record<string, string> = {
  'TOP SECRET': '#7d2219',
  SECRET: '#7a5a1c',
  CONFIDENTIAL: '#24375f',
  RESTRICTED: '#3f4a32',
};

export interface CatCard {
  file: string;
  slug: string;
  stamp: string;
  title: L;
  line: L;
}
export interface CatDrawer {
  label: string;
  cards: CatCard[];
}
export interface Library {
  bays: LibBay[];
  catalogue: CatDrawer[];
}

/** Cards per catalogue drawer, and drawers in the cabinet. */
const PER_DRAWER = 6;
export const CAT_DRAWERS = 20;

export function buildLibrary(records: ClientRecord[], base: string): Library {
  const zhOf = (r: ClientRecord) => r.zh;
  const title = (r: ClientRecord): L => ({ en: r.title, zh: zhOf(r)?.title ?? r.title });
  const recLine = (r: ClientRecord): L => ({
    en: `<li><a href="${base}records/${r.slug}/"><b>${r.file}</b> ${esc(r.title)}</a></li>`,
    zh: `<li><a href="${base}records/${r.slug}/"><b>${r.file}</b> ${esc(title(r).zh)}</a></li>`,
  });
  const list = (items: L[]): L => ({ en: `<ul class="lib-list">${items.map((i) => i.en).join('')}</ul>`, zh: `<ul class="lib-list">${items.map((i) => i.zh).join('')}</ul>` });

  /* ---------------- Bay 1: the Daily, bound by month ---------------- */
  const issues = buildIssues(records).slice().reverse();
  type Issue = (typeof issues)[number];
  const dayLabel = (x: Issue): L => ({
    en: `${x.date.slice(8)} ${MON[Number(x.date.slice(5, 7)) - 1]}${x.date.startsWith('1999') ? '' : ` ${x.date.slice(2, 4)}`}`,
    zh: x.date.startsWith('1999') ? `${Number(x.date.slice(5, 7))} 月 ${Number(x.date.slice(8))} 日` : `${x.date.slice(0, 4)} 年 ${Number(x.date.slice(5, 7))} 月`,
  });
  const issuePage = (x: Issue): LibPage => {
    const d = longDate(x.date);
    return {
      date: x.date,
      head: { en: `No. ${x.no} · ${d.en}`, zh: `第 ${x.no} 期 · ${d.zh}` },
      html: join(
        { en: `<h4>${esc(strip(x.lead.head.en))}</h4>`, zh: `<h4>${esc(strip(x.lead.head.zh))}</h4>` },
        { en: `<p>${esc(strip(x.lead.body.en))}</p>`, zh: `<p>${esc(strip(x.lead.body.zh))}</p>` },
        x.articles.length || x.corrections.length
          ? p(
              `Also in this issue: ${[...x.articles.map((a) => esc(strip(a.head.en))), ...(x.corrections.length ? [`${x.corrections.length} ${x.corrections.length === 1 ? 'correction' : 'corrections'}`] : [])].join('; ')}.`,
              `本期另有：${[...x.articles.map((a) => esc(strip(a.head.zh))), ...(x.corrections.length ? [`更正 ${x.corrections.length} 则`] : [])].join('；')}。`,
            )
          : { en: '', zh: '' },
        { en: `<p class="lib-small">${x.weather.en}</p>`, zh: `<p class="lib-small">${x.weather.zh}</p>` },
        link(`${base}daily/${x.date}/`, 'Read the whole issue', '翻开当天整份报纸'),
      ),
    };
  };
  const volume = (id: string, mark: string, spine: L, sub: L, head: L, set: Issue[], empty: L): LibBook => ({
    id,
    kind: 'news',
    color: '#5d5f5c',
    spine,
    sub,
    mark,
    h: 1,
    thick: set.length ? 0.17 + Math.min(0.08, set.length * 0.03) : 0.11,
    pages: [
      {
        head,
        html: set.length
          ? join(
              p(`Bound volume. ${set.length} ${set.length === 1 ? 'issue' : 'issues'} kept by the Records Office.`, `合订本。记录署留存 ${set.length} 期。`),
              list(set.map((x) => {
                const dl = dayLabel(x);
                return {
                  en: `<li data-island-date="${x.date}"><a href="${base}daily/${x.date}/"><b>${dl.en}</b> ${esc(strip(x.lead.head.en))}</a></li>`,
                  zh: `<li data-island-date="${x.date}"><a href="${base}daily/${x.date}/"><b>${dl.zh}</b> ${esc(strip(x.lead.head.zh))}</a></li>`,
                };
              })),
            )
          : { en: `<p>${empty.en}</p>`, zh: `<p>${empty.zh}</p>` },
      },
      ...set.map(issuePage),
    ],
  });
  const daily: LibBook[] = MONTHS_EN.map((m, i) => {
    const mm = String(i + 1).padStart(2, '0');
    return volume(
      `daily-${mm}`,
      `GD/99/${mm}`,
      { en: `DAILY ${MON[i]}`, zh: `日报 ${ZH_MONTH[i]}月` },
      both('1999'),
      { en: `The Gerimis Daily · ${m} 1999`, zh: `《霏微日报》· 1999 年 ${ZH_MONTH[i]}月` },
      issues.filter((x) => x.date.startsWith(`1999-${mm}`)),
      {
        en: 'The paper came out every day this month. The Office kept none of it. The binder sewed the covers anyway.',
        zh: '这个月报纸天天出，署里一份也没留。装订师傅还是把封皮缝上了。',
      },
    );
  });
  // Anything dated before 1999 goes into one thin volume at the start of the run
  const earlier = issues.filter((x) => x.date < '1999');
  if (earlier.length) {
    daily.unshift(
      volume(
        'daily-early',
        'GD/PRE',
        { en: 'DAILY PRE-99', zh: '日报 旧年' },
        { en: 'Earlier', zh: '往年' },
        { en: 'The Gerimis Daily · before 1999', zh: '《霏微日报》· 1999 年以前' },
        earlier,
        { en: '', zh: '' },
      ),
    );
  }

  /* ---------------- Bay 2: district gazetteer ---------------- */
  const CLOTHS = ['#3d4a3a', '#5a2b24', '#2c3a4f', '#5b4a2c', '#40363f', '#2f4744', '#4c4c46'];
  const gazetteer: LibBook[] = DISTRICTS.map((d, i) => {
    const recs = records.filter((r) => r.district === d.id);
    const text = DISTRICT_TEXT[d.id];
    const off = d.tz === 0 ? null : d.tz > 0 ? `+${d.tz}` : `${d.tz}`;
    const dated = recs
      .flatMap((r) => [
        ...(isoDate(r.date) ? [{ date: isoDate(r.date)!, r, what: null as null | { n: number } }] : []),
        ...r.drafts.filter((dr) => isoDate(dr.date)).map((dr) => ({ date: isoDate(dr.date)!, r, what: { n: dr.n } })),
      ])
      .sort((a, b) => a.date.localeCompare(b.date));
    const pages: LibPage[] = [
      {
        head: { en: `${d.en} · District gazetteer`, zh: `${d.zh} · 区志` },
        html: join(
          { en: `<h4>${d.en}</h4>`, zh: `<h4>${d.zh}<small> ${d.en}</small></h4>` },
          { en: `<p>${text.blurb.en}</p>`, zh: `<p>${text.blurb.zh}</p>` },
          off
            ? p(`Local clocks run Axis ${off} h. The Office has written to them about it.`, `本区时钟比中枢${d.tz > 0 ? '快' : '慢'} ${Math.abs(d.tz)} 小时。署里为此去过函。`)
            : p('Local clocks agree with the Axis, as far as anyone has checked.', '本区时钟与中枢一致，至少没人查出不一致。'),
          link(`${base}district/${d.id}/`, 'District file', '本区档案页'),
        ),
      },
      {
        head: { en: 'Files on record', zh: '在册档案' },
        html: recs.length
          ? list(recs.map(recLine))
          : p('Nothing filed from this district yet. The page was ruled for it all the same.', '本区还没有档案归进来。格子照样画好了。'),
      },
    ];
    if (dated.length) {
      pages.push({
        head: { en: 'Chronology, 1999', zh: '大事记 · 1999' },
        html: list(dated.map(({ date, r, what }) => {
          const ld = longDate(date);
          return what
            ? { en: `<li><b>${date.slice(8)} ${MON[Number(date.slice(5, 7)) - 1]}</b> ${r.file}, draft ${String(what.n).padStart(2, '0')} issued</li>`, zh: `<li><b>${ld.zh.split(' · ')[0].replace('1999 年 ', '')}</b> ${r.file} 第 ${String(what.n).padStart(2, '0')} 稿发布</li>` }
            : { en: `<li><b>${date.slice(8)} ${MON[Number(date.slice(5, 7)) - 1]}</b> ${esc(r.title)}</li>`, zh: `<li><b>${ld.zh.split(' · ')[0].replace('1999 年 ', '')}</b> ${esc(title(r).zh)}</li>` };
        })),
      });
    }
    return {
      id: `gaz-${d.id}`,
      kind: 'cloth',
      color: CLOTHS[i % CLOTHS.length],
      spine: { en: d.en.toUpperCase(), zh: d.zh },
      sub: { en: 'Gazetteer', zh: '区志' },
      mark: `GZ/${String(i + 1).padStart(2, '0')}`,
      h: 0.86,
      thick: 0.2 + Math.min(0.1, recs.length * 0.03),
      pages,
    };
  });

  /* ---------------- Bay 3: bound records ---------------- */
  const CATS = [
    { id: 'personnel', code: 'P', en: 'Personnel', zh: '人员' },
    { id: 'events', code: 'E', en: 'Events', zh: '事件' },
    { id: 'programs', code: 'R', en: 'Programs', zh: '计划' },
  ] as const;
  const bound: LibBook[] = [];
  for (const c of CATS) {
    const recs = records.filter((r) => r.category === c.id).sort((a, b) => a.file.localeCompare(b.file));
    for (let v = 0; v * 12 < Math.max(1, recs.length); v++) {
      const vol = recs.slice(v * 12, v * 12 + 12);
      const range = vol.length ? `${vol[0].file}–${vol[vol.length - 1].file}` : `${c.code}-0000`;
      const top = vol.find((r) => CLOTH[r.stamp]) ?? null;
      bound.push({
        id: `rec-${c.id}-${v + 1}`,
        kind: 'cloth',
        color: top ? CLOTH[top.stamp] : '#3a3936',
        spine: { en: c.en.toUpperCase(), zh: c.zh },
        sub: both(`VOL. ${v + 1}`),
        mark: range,
        h: 0.95,
        thick: 0.22 + Math.min(0.16, vol.length * 0.035),
        pages: [
          {
            head: { en: `${c.en} · Volume ${v + 1}`, zh: `${c.zh} · 第 ${v + 1} 卷` },
            html: join(
              p(`Bound copies of the ninth drafts, ${range}. Margin notes were not carried over.`, `第九稿装订本，${range}。页边批注没有抄进来。`),
              list(vol.map(recLine)),
            ),
          },
          ...vol.map((r) => {
            const z = zhOf(r);
            const date = isoDate(r.date);
            const where = r.district ? DISTRICTS.find((d) => d.id === r.district) : null;
            const meta: L = {
              en: [r.stamp, date ? longDate(date).en : r.date, where?.en].filter(Boolean).join(' · '),
              zh: [r.stamp, date ? longDate(date).zh : z?.date ?? r.date, where?.zh].filter(Boolean).join(' · '),
            };
            return {
              head: { en: `${r.file} · ${r.title}`, zh: `${r.file} · ${title(r).zh}` },
              html: join(
                { en: `<p class="lib-small">${esc(meta.en)}</p>`, zh: `<p class="lib-small">${esc(meta.zh)}</p>` },
                { en: `<h4>${esc(r.title)}</h4>`, zh: `<h4>${esc(title(r).zh)}</h4>` },
                { en: `<p>${esc(strip(r.summary))}</p>`, zh: `<p>${esc(strip(z?.summary ?? r.summary))}</p>` },
                link(`${base}records/${r.slug}/`, 'Open the file', '调出这份档案'),
              ),
            };
          }),
        ],
      });
    }
  }

  /* ---------------- Bay 4: Office publications ---------------- */
  const log = records
    .flatMap((r) => r.drafts.filter((d) => isoDate(d.date)).map((d) => ({ date: isoDate(d.date)!, r, d })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const logPages: LibPage[] = [];
  for (let i = 0; i < Math.max(1, log.length); i += 10) {
    const chunk = log.slice(i, i + 10);
    logPages.push({
      head: { en: `Revision log · ${i + 1}–${i + Math.max(1, chunk.length)}`, zh: `修订登记簿 · 第 ${i + 1}–${i + Math.max(1, chunk.length)} 条` },
      html: chunk.length
        ? list(chunk.map(({ date, r, d }) => ({
            en: `<li><a href="${base}records/${r.slug}/"><b>${date}</b> ${r.file} · draft ${String(d.n).padStart(2, '0')}${d.label ? ` · ${esc(d.label)}` : ''}</a></li>`,
            zh: `<li><a href="${base}records/${r.slug}/"><b>${date}</b> ${r.file} · 第 ${String(d.n).padStart(2, '0')} 稿${d.label ? ` · ${esc(zhOf(r)?.drafts?.find((x) => x.n === d.n)?.label ?? d.label)}` : ''}</a></li>`,
          })))
        : p('No dated revisions entered yet.', '还没有登记过带日期的修订。'),
    });
  }

  const RETURNED: L[] = [
    { en: 'Returned. Please use the form in force.', zh: '退回。请使用现行表格。' },
    { en: 'Returned. Cost estimate in the wrong currency.', zh: '退回。预算用错了币种。' },
    { en: 'Returned. Please do not attach diagrams to the cover sheet.', zh: '退回。图表请勿贴在封面页上。' },
    { en: 'Returned. The committee does not meet in December.', zh: '退回。委员会十二月不开会。' },
    { en: 'Returned. Appendix C refers to an Appendix D.', zh: '退回。附录 C 提到了附录 D。' },
    { en: 'Returned. Too long. Please reduce to one page.', zh: '退回。太长，请压缩到一页。' },
    { en: 'Returned. One page is not enough for a matter of this size.', zh: '退回。这么大的事，一页纸不够。' },
    { en: 'Returned. See comments.', zh: '退回。见意见栏。' },
  ];
  const DATES = ['09.02.99', '09.03.99', '09.05.99', '09.06.99', '09.08.99', '09.09.99', '09.10.99', '09.11.99'];
  const proposals: LibBook[] = RETURNED.map((ret, i) => ({
    id: `y2k-${i + 1}`,
    kind: 'binder',
    color: '#8c8a83',
    spine: both(`PROPOSAL 0${i + 1}`),
    sub: { en: 'Year field', zh: '年份字段' },
    mark: `DS/Y2K/0${i + 1}`,
    h: 0.78,
    thick: 0.1 + (i % 3) * 0.02,
    pages: [
      {
        head: { en: `Year-field remediation · Proposal 0${i + 1}`, zh: `年份字段整改 · 第 0${i + 1} 版方案` },
        html: join(
          p(`Submitted by Heuss, Data Section, ${DATES[i]}.`, `提交人：Heuss，数据组，${DATES[i]}。`),
          p('Only the cover sheet is kept here. The proposal itself went back to its author with the slip below.', '这里只留了封面页。方案本身连同下面这张退文单，一起退给了提交人。'),
          { en: `<p class="lib-slip">${ret.en}</p>`, zh: `<p class="lib-slip">${ret.zh}</p>` },
        ),
      },
    ],
  }));

  const office: LibBook[] = [
    {
      id: 'log',
      kind: 'ledger',
      color: '#4a2a22',
      spine: { en: 'REVISION LOG', zh: '修订登记簿' },
      sub: both('1999'),
      mark: 'RO/LOG/99',
      h: 1.02,
      thick: 0.34,
      pages: logPages,
    },
    {
      id: 'guide',
      kind: 'cloth',
      color: '#2d3d52',
      spine: { en: "VISITOR'S GUIDE", zh: '入馆须知' },
      sub: { en: 'Records Office', zh: '记录署' },
      mark: 'RO/G/01',
      h: 0.8,
      thick: 0.13,
      pages: [
        {
          head: { en: "Visitor's guide", zh: '入馆须知' },
          html: join(
            p('Visitors may read anything on the open shelves. Nothing leaves the building, and nothing in this building is quite final.', '开架上的东西，访客都可以看。什么都不许带出去，这栋楼里也没有什么是真正定了的。'),
            p('Registered visitors are issued a file of their own. It is kept with the others.', '登记过的访客会有一份自己的档案，和别的档案放在一起。'),
            link(`${base}guide/`, 'Read the full guide', '看完整的入馆须知'),
            link(`${base}register/`, 'Register at the counter', '去柜台登记'),
          ),
        },
      ],
    },
    ...proposals,
  ];

  // the register is printed blank and filled in as drafts are issued
  logPages.push({
    head: { en: 'Blank pages follow', zh: '以下空白' },
    html: p('The rest of the register is ruled and blank, waiting for the next draft.', '登记簿余下的页都画好了格子，空着，等下一稿。'),
  });

  const bays: LibBay[] = [
    { id: 'daily', zone: 'rack', code: 'LIB-1', title: { en: 'The Gerimis Daily', zh: '霏微日报' }, books: daily.map(bind) },
    { id: 'gazetteer', zone: 'stacks', code: 'LIB-2', title: { en: 'District gazetteer', zh: '各区区志' }, books: gazetteer.map(bind) },
    { id: 'records', zone: 'stacks', code: 'LIB-3', title: { en: 'Bound records', zh: '档案合订本' }, books: bound.map(bind) },
    // the ninth proposal's slot stays empty
    { id: 'office', zone: 'desk', code: 'LIB-4', title: { en: 'Office publications', zh: '署内出版物' }, books: office.map(bind), gapAt: office.length },
  ];

  /* ---------------- the card catalogue ---------------- */
  const catalogue: CatDrawer[] = [];
  for (const c of CATS) {
    const recs = records.filter((r) => r.category === c.id).sort((a, b) => a.file.localeCompare(b.file));
    for (let i = 0; i < recs.length; i += PER_DRAWER) {
      const chunk = recs.slice(i, i + PER_DRAWER);
      catalogue.push({
        label: `${chunk[0].file}–${chunk[chunk.length - 1].file}`,
        cards: chunk.map((r) => {
          const where = r.district ? DISTRICTS.find((d) => d.id === r.district) : null;
          const date = isoDate(r.date);
          return {
            file: r.file,
            slug: r.slug,
            stamp: r.stamp,
            title: title(r),
            line: {
              en: [c.en, where?.en, date ? longDate(date).en : null].filter(Boolean).join(' · '),
              zh: [c.zh, where?.zh, date ? longDate(date).zh : null].filter(Boolean).join(' · '),
            },
          };
        }),
      });
    }
  }
  // the rest of the cabinet is labelled for files that have not come in yet
  const next: Record<string, number> = {};
  for (const c of CATS) next[c.code] = records.filter((r) => r.category === c.id).length + 1;
  let k = 0;
  while (catalogue.length < CAT_DRAWERS) {
    const c = CATS[k++ % CATS.length];
    const from = next[c.code];
    next[c.code] += PER_DRAWER;
    const f = (n: number) => `${c.code}-${String(n).padStart(4, '0')}`;
    catalogue.push({ label: `${f(from)}–${f(from + PER_DRAWER - 1)}`, cards: [] });
  }

  return { bays, catalogue };
}

/**
 * Bind a book to its real size: a contents page in front of anything longer
 * than a few pages, and a thickness that follows the page count. A short
 * book is a stapled pamphlet; it thickens on its own as the archive grows.
 */
function bind(b: LibBook): LibBook {
  const n = b.pages.length;
  let kind = b.kind;
  if (kind === 'cloth' && n <= 3) kind = 'pamphlet';
  const pages = n >= 4 && kind !== 'binder'
    ? [
        {
          head: { en: 'Contents', zh: '目录' },
          html: {
            en: `<ol class="lib-toc">${b.pages.map((x, i) => `<li><a href="#" data-page="${i + 1}"><span>${esc(x.head.en)}</span><i>${i + 2}</i></a></li>`).join('')}</ol>`,
            zh: `<ol class="lib-toc">${b.pages.map((x, i) => `<li><a href="#" data-page="${i + 1}"><span>${esc(x.head.zh)}</span><i>${i + 2}</i></a></li>`).join('')}</ol>`,
          },
        },
        ...b.pages,
      ]
    : b.pages;
  const thick =
    kind === 'news' ? 0.05 + n * 0.0045
    : kind === 'pamphlet' ? 0.03 + n * 0.004
    : kind === 'cloth' ? Math.min(0.42, 0.07 + pages.length * 0.012)
    : b.thick;
  return { ...b, kind, pages, thick };
}
