/**
 * The Gerimis Daily: a newspaper built from the archive at build time.
 *
 * Nobody writes the paper. Every dated thing in the records becomes news on
 * its day: a dated event or program is the front page, a `clipping`
 * attachment is the article it was cut from, a dated draft is a correction,
 * other dated attachments are notices. Weather, classifieds and tides come
 * from fixed pools, picked by date, so the same day always prints the same.
 *
 * The paper prints the official version: struck sentences are gone, margin
 * notes never reach the press, and redactions stay black.
 */
import type { ClientAttachment, ClientRecord } from './records';

type L = { en: string; zh: string };

export interface Story {
  kind: 'lead' | 'article' | 'correction' | 'notice';
  head: L;
  /** HTML in both languages. */
  body: L;
  file?: string;
  slug?: string;
  stamp?: string;
  /** Page of the paper, for clippings that say so. */
  page?: string;
}

export interface Issue {
  date: string; // YYYY-MM-DD
  no: number;
  lead: Story;
  articles: Story[];
  corrections: Story[];
  notices: Story[];
  weather: L;
  tide: L;
  classifieds: L[];
  special?: boolean;
}

const strip = (html: string) => html.replace(/<span class="rv-note"[\s\S]*?<\/span><\/span>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** "09.03.99" or "1999-03-09" → "1999-03-09". */
export const isoDate = (s?: string) => {
  const m = s?.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})\b/);
  if (m) return `19${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const i = s?.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return i ? i[0] : null;
};

const dayOfYear = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
};

const seed = (iso: string) => iso.split('').reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** First sentence as headline, the rest as copy. */
function splitClipping(text: string) {
  const plain = strip(text);
  const m = plain.match(/^(.+?[.!?。！？」"])\s*(.*)$/);
  return m ? { head: m[1].replace(/[.。]$/, ''), body: m[2] } : { head: plain, body: '' };
}

const KIND: Record<ClientAttachment['kind'], L> = {
  note: { en: 'Memo', zh: '便条' },
  telegram: { en: 'Telegram', zh: '电报' },
  ticket: { en: 'Ticket', zh: '票据' },
  clipping: { en: 'Clipping', zh: '剪报' },
  negative: { en: 'Negative', zh: '底片' },
};

export function buildIssues(records: ClientRecord[]): Issue[] {
  const days = new Map<string, Omit<Issue, 'no' | 'weather' | 'tide' | 'classifieds' | 'lead'> & { leads: Story[] }>();
  const day = (iso: string) => {
    if (!days.has(iso)) days.set(iso, { date: iso, leads: [], articles: [], corrections: [], notices: [] });
    return days.get(iso)!;
  };

  for (const r of records) {
    const zh = r.zh;
    const t = { en: r.title, zh: zh?.title ?? r.title };
    const link = { file: r.file, slug: r.slug, stamp: r.stamp };

    const d = isoDate(r.date);
    if (d && r.category !== 'personnel') {
      day(d).leads.push({ kind: 'lead', head: t, body: { en: r.summary, zh: zh?.summary ?? r.summary }, ...link });
    }

    r.drafts.forEach((dr, i) => {
      const dd = isoDate(dr.date);
      if (!dd) return;
      const n = String(dr.n).padStart(2, '0');
      const lz = zh?.drafts?.[i]?.label ?? dr.label;
      day(dd).corrections.push({
        kind: 'correction',
        head: { en: `Records Office issues new draft of “${t.en}”`, zh: `记录署发布《${t.zh}》新一稿` },
        body: {
          en: `The Records Office has issued draft ${n} of ${r.file}${dr.label ? `, “${dr.label.toLowerCase()}”` : ''}. Earlier versions should be disregarded.`,
          zh: `记录署已发布 ${r.file} 第 ${n} 稿${lz ? `（${lz}）` : ''}。此前版本作废。`,
        },
        ...link,
      });
    });

    r.attachments.forEach((a, i) => {
      const ad = isoDate(a.date);
      if (!ad) return;
      const az = zh?.attachments?.[i] ?? a;
      if (a.kind === 'clipping') {
        const en = splitClipping(a.text);
        const cz = splitClipping(az.text);
        const page = a.title?.match(/page (\d+)|front page/i);
        day(ad).articles.push({
          kind: 'article',
          head: { en: en.head, zh: cz.head },
          body: { en: en.body, zh: cz.body },
          page: page ? (page[1] ? `p. ${page[1]}` : 'p. 1') : undefined,
          ...link,
        });
      } else {
        day(ad).notices.push({
          kind: 'notice',
          head: { en: `${KIND[a.kind].en} filed with ${r.file}`, zh: `${r.file} 新增${KIND[a.kind].zh}` },
          body: { en: strip(a.title ?? a.text), zh: strip(az.title ?? az.text) },
          ...link,
        });
      }
    });
  }

  // The last issue of the year is always printed, whatever the files say.
  const last = day('1999-12-31');
  const remediation = records.find((r) => r.file === 'R-0001');
  last.leads.unshift({
    kind: 'lead',
    head: { en: 'Island ready for the year 2000', zh: '本岛已为 2000 年做好准备' },
    body: {
      en: 'The Records Office says all systems will pass midnight without incident. Residents are asked to check their clocks against the Axis and not to write the year in two digits until further notice.',
      zh: '记录署表示，所有系统都将平稳度过午夜。请居民以中枢时间为准校对家中时钟；另行通知之前，书写年份请勿只写两位数。',
    },
    ...(remediation ? { file: remediation.file, slug: remediation.slug, stamp: remediation.stamp } : {}),
  });

  return [...days.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((x) => {
      const s = seed(x.date);
      const pick = <T,>(arr: T[], k: number) => arr[(s >>> (k * 3)) % arr.length];
      const leads = x.leads.length ? x.leads : [];
      const lead = leads[0] ?? x.articles[0] ?? x.corrections[0] ?? x.notices[0];
      const articles = [...leads.slice(1).map((l) => ({ ...l, kind: 'article' as const })), ...x.articles.filter((a) => a !== lead)];
      const hi = 5 + (s % 3), hm = (s >>> 4) % 60;
      const tide = {
        en: `High water ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')} and ${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}. The old shoreline is not included.`,
        zh: `高潮 ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')}、${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}。旧海岸线不在此列。`,
      };
      const ads = [0, 1, 2].map((k) => CLASSIFIEDS[(s + k * 5) % CLASSIFIEDS.length]);
      return {
        date: x.date,
        no: dayOfYear(x.date),
        lead,
        articles: articles.filter((a) => a !== lead),
        corrections: x.corrections.filter((c) => c !== lead),
        notices: x.notices.filter((n) => n !== lead),
        weather: pick(WEATHER, 1),
        tide,
        classifieds: [...new Set(ads)],
        special: x.date === '1999-12-31',
      };
    });
}

const WEATHER: L[] = [
  { en: 'Drizzle, 27°C. Clearing later.', zh: '毛毛雨，27°C。午后转晴。' },
  { en: 'Light rain all day. Take an umbrella.', zh: '全天小雨，出门带伞。' },
  { en: 'Drizzle in the morning, rain in the afternoon, drizzle at night.', zh: '早上毛毛雨，下午下雨，晚上又是毛毛雨。' },
  { en: 'Overcast, 28°C. Rain expected, as it has been since March.', zh: '阴，28°C。预计有雨，从三月起一直预计有雨。' },
  { en: 'Showers over the Axis. Silva had them an hour ago.', zh: '中枢有阵雨。林地一小时前已经下过。' },
  { en: 'Fine spells between showers, none of them long.', zh: '阵雨之间偶有晴天，都不长。' },
];

const CLASSIFIEDS: L[] = [
  { en: 'FOUND. Black umbrella, Route 97, still wet. Collect from the Palus Magna depot.', zh: '招领。黑伞一把，97 路车上拾获，仍是湿的。请到大泽车厂认领。' },
  { en: 'WANTED. Clock repairer for the Palus Magna tower. Must not touch the hands.', zh: '诚聘。大泽钟楼修钟师傅一名。不得触碰指针。' },
  { en: 'LOST. The old name of our street, Pons Ruber. Reward offered.', zh: '寻物。红桥我们那条街的旧名字。有酬谢。' },
  { en: 'FOR SALE. 1984 bus timetable, mint condition. Shows one extra stop.', zh: '出让。1984 年巴士时刻表一份，品相全新，比现在多一个站。' },
  { en: 'TO LET. Three-room flat, Serrangon, third floor. Number to be confirmed.', zh: '出租。实龙岗三房式组屋，三楼。门牌号待定。' },
  { en: 'NOTICE. Warehouse 4 will not be lending signs this week.', zh: '启事。四号仓库本周暂停出借路牌。' },
  { en: 'TUITION. Four-digit years, taught patiently. Apply to the Data Section.', zh: '补习。四位数年份，耐心教学。请向数据组报名。' },
  { en: 'FOUND. A mooring ring on Harbour Row. Owner please claim before the 9th.', zh: '招领。港口街系船环一个。失主请于 9 号前认领。' },
  { en: 'WANTED. Anyone who remembers flat 7-312. Tea provided.', zh: '征求。记得 7-312 那户人家的街坊。备茶。' },
  { en: 'PIANO LESSONS. Collis Ruber, evenings. The metronome runs slightly fast.', zh: '钢琴课。红丘，晚间授课。节拍器略快。' },
  { en: 'LOST. One hour, Silva, sometime in March. Please return to the Time office.', zh: '寻物。一个小时，三月某日在林地遗失。拾到请交还时间科。' },
  { en: 'SITUATION WANTED. Filing clerk, twenty years’ experience, asks no questions.', zh: '求职。归档员，二十年经验，不多问。' },
];

export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function longDate(iso: string): L {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { en: `${WEEK_EN[w]}, ${d} ${MONTHS_EN[m - 1]} ${y}`, zh: `${y} 年 ${m} 月 ${d} 日 · 星期${WEEK_ZH[w]}` };
}
