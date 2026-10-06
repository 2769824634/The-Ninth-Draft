/**
 * The Records Office library: every book on its shelves is bound at build
 * time from what the archive already holds, so nobody writes a book.
 *
 *   Bay 1  The Gerimis Daily, one volume a month (from daily.ts)
 *   Bay 2  District gazetteer, one volume a district
 *   Bay 3  Counter copies: what the Office prints for the public.
 *
 * Only public publications. The Office's own files stay in the archive and
 * its working papers (revision log, Heuss's proposals) in the office; the
 * card catalogue lists files by number and says where they are kept.
 *
 * Each book is a list of pages, each page a heading and some HTML, in both
 * languages. The reader shows one page at a time.
 */
import type { ClientRecord } from './records';
import { islandDay } from '../app/island';
import { contents } from './toc';
import { buildIssues, isoDate, longDate, MONTHS_EN } from './daily';
import { DISTRICTS } from '../app/visitor/districts';
import { DISTRICT_TEXT } from '../app/visitor/counter';

type L = { en: string; zh: string };

export interface LibPage {
  head: L;
  html: L;
  /** An issue of the Daily, or a record: not shown before its day on the island. */
  date?: string;
  /** Leave the page out altogether until then (a record), instead of showing it unprinted (an issue). */
  drop?: boolean;
  /** The contents page, rebuilt in the browser when pages are left out. */
  toc?: boolean;
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
  /** Foot of the cover and title page; the Office's own imprint when not given. */
  imprint?: L;
  /** Where the full text is fetched from when the book is taken down (shelved books only carry their headings). */
  src?: string;
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
  /** The record's day, when it has one: the card goes in the drawer on that day. */
  date?: string;
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

export function buildLibrary(records: ClientRecord[], base: string, books: LibBook[] = []): Library {
  const zhOf = (r: ClientRecord) => r.zh;
  const title = (r: ClientRecord): L => ({ en: r.title, zh: zhOf(r)?.title ?? r.title });
  // a line about a record waits for the record's own day as well as its own
  const when = (r: ClientRecord, date = '') => {
    const d = [date, islandDay(r.date) ?? ''].sort().pop();
    return d ? ` data-island-date="${d}"` : ' data-island-date=""';
  };
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
        p('The whole paper is on the table: four pages.', '整份报纸摊在桌上，共四版。'),
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
                  en: `<li data-island-date="${x.date}"><a href="#daily-${x.date}"><b>${dl.en}</b> ${esc(strip(x.lead.head.en))}</a></li>`,
                  zh: `<li data-island-date="${x.date}"><a href="#daily-${x.date}"><b>${dl.zh}</b> ${esc(strip(x.lead.head.zh))}</a></li>`,
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
    // a public book: what happened in the district, never the Office's file numbers or drafts
    const dated = recs
      .filter((r) => r.category === 'events' && isoDate(r.date))
      .map((r) => ({ date: isoDate(r.date)!, r }))
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
    ];
    if (dated.length) {
      pages.push({
        head: { en: 'Chronology, 1999', zh: '大事记 · 1999' },
        html: join(
          list(dated.map(({ date, r }) => {
            const ld = longDate(date);
            return { en: `<li${when(r, date)}><b>${date.slice(8)} ${MON[Number(date.slice(5, 7)) - 1]}</b> ${esc(r.title)}</li>`, zh: `<li${when(r, date)}><b>${ld.zh.split(' · ')[0].replace('1999 年 ', '')}</b> ${esc(title(r).zh)}</li>` };
          })),
          {
            en: `<p data-island-empty="#rd-body .lib-list > li[data-island-date]">Nothing entered for this year yet.</p>`,
            zh: `<p data-island-empty="#rd-body .lib-list > li[data-island-date]">今年还没有记下什么。</p>`,
          },
        ),
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
      thick: 0.2 + Math.min(0.1, dated.length * 0.03),
      pages,
    };
  });

  /* ---------------- Bay 3: counter copies ---------------- */
  const counter: LibBook[] = [
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
  ];

  const bays: LibBay[] = [
    { id: 'daily', zone: 'rack', code: 'LIB-1', title: { en: 'The Gerimis Daily', zh: '霏微日报' }, books: daily.map(bind) },
    { id: 'gazetteer', zone: 'stacks', code: 'LIB-2', title: { en: 'District gazetteer', zh: '各区区志' }, books: gazetteer.map(bind) },
    // public-domain books, already bound (src/lib/books.ts)
    ...(books.length ? [{ id: 'books', zone: 'stacks' as const, code: 'LIB-4', title: { en: 'Books', zh: '藏书' }, books }] : []),
    { id: 'counter', zone: 'desk', code: 'LIB-3', title: { en: 'Counter copies', zh: '柜台取阅' }, books: counter.map(bind) },
  ];

  /* ---------------- the card catalogue ---------------- */
  // the finding aid for the archive: a card says what a file is and where it is kept
  const CATS = [
    { id: 'personnel', code: 'P', en: 'Personnel', zh: '人员' },
    { id: 'events', code: 'E', en: 'Events', zh: '事件' },
    { id: 'programs', code: 'R', en: 'Programs', zh: '计划' },
  ] as const;
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
            date: islandDay(r.date),
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
        { head: { en: 'Contents', zh: '目录' }, html: contents(b.pages), toc: true },
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
