/**
 * The Ashmere Daily: a newspaper built from the archive at build time.
 *
 * Nobody writes the paper. Every dated thing in the records becomes news on
 * its day: a dated event or program is the front page, a `clipping`
 * attachment is the article it was cut from, a dated draft is a correction,
 * other dated attachments are notices. Weather, classifieds and tides come
 * from fixed pools, picked by date, so the same day always prints the same.
 *
 * The paper comes out every day of 1999. A day the archive says nothing about
 * gets an ordinary issue: a small local story, weather, tides and the ads,
 * all picked by date from fixed pools.
 *
 * The paper prints the official version: struck sentences are gone, margin
 * notes never reach the press, and redactions stay black.
 */
import type { ClientAttachment, ClientRecord } from './records';
import { islandRaining } from '../app/weather';

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
  /** Standfirst under a front-page headline: the file's subtitle. */
  deck?: L;
  /** Press photo: the file's own picture when it has one, otherwise a street scene drawn from `seed`. */
  photo?: { src?: string; seed: string; caption: L };
}

export interface Letter {
  body: L;
  by: L;
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
  /** Second story on the front page. */
  second?: Story;
  /** District news in brief (page 2). */
  briefs: Story[];
  /** Bus diversions (page 2). */
  buses: L[];
  /** Letters to the editor (page 3). */
  letters: Letter[];
  /** What's on around the island (page 3). */
  events: L[];
  /** Tonight's television, one line a programme (page 4). */
  tv: L[];
  /** A Records Office notice, printed every day. */
  office: L;
  special?: boolean;
  /** Nothing from the archive happened on this day: an ordinary issue. */
  quiet?: boolean;
}

/**
 * The final draft as the press sets it: struck words and margin notes gone,
 * words added in a draft kept, black bars printed as black bars.
 */
export const official = (html: string, k = 9) =>
  html
    .replace(/<span class="rv-note"[\s\S]*?<\/span><\/span>/g, '')
    .replace(/<span class="rv" data-redact="(\d)-(\d)"><span>([\s\S]*?)<\/span><\/span>/g, (_m, a, b, t) => (Number(a) <= k && k <= Number(b) ? bar(t) : t))
    .replace(/<span class="redact"[^>]*><span>([\s\S]*?)<\/span><\/span>/g, (_m, t) => bar(t))
    .replace(/<span class="rv" data-del="(\d)">([\s\S]*?)<\/span>/g, (_m, n, t) => (k >= Number(n) ? '' : t))
    .replace(/<span class="rv" data-add="(\d)">([\s\S]*?)<\/span>/g, (_m, n, t) => (k >= Number(n) ? t : ''))
    .replace(/<(?!\/?(p|b|i|em|strong|br)\b)[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/**
 * The draft a file stood at on `day` (an ISO date): the last named draft filed by
 * then, the final once all of them were, the first if none was yet.
 */
export function draftOn(drafts: { n: number; date?: string }[], day: string) {
  const named = drafts.filter((d) => d.n < 9);
  if (!named.length) return 9;
  const by = named.filter((d) => (isoDate(d.date) ?? '') <= day).map((d) => d.n);
  if (by.length === named.length) return 9;
  return by.length ? Math.max(...by) : Math.min(...named.map((d) => d.n));
}
const bar = (t: string) => '█'.repeat(Math.max(3, Math.min(14, t.replace(/<[^>]+>/g, '').length)));

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
  const days = new Map<string, Pick<Issue, 'date' | 'articles' | 'corrections' | 'notices' | 'quiet'> & { leads: Story[] }>();
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
      const photoCaption = r.imageCaption
        ? { en: r.imageCaption, zh: zh?.imageCaption ?? r.imageCaption }
        : { en: 'Photograph: Records Office. Some details have been removed.', zh: '图片：记录署。部分细节已删除。' };
      day(d).leads.push({
        kind: 'lead',
        head: t,
        // as the file stood that day: the paper cannot print a draft not yet written
        body: { en: official(r.summary, draftOn(r.drafts, d)), zh: official(zh?.summary ?? r.summary, draftOn(r.drafts, d)) },
        deck: r.subtitle ? { en: r.subtitle, zh: zh?.subtitle ?? r.subtitle } : undefined,
        photo: { src: r.image, seed: r.file, caption: photoCaption },
        ...link,
      });
    }

    // A later account of a file is a correction notice. The island does not number drafts:
    // the paper says the file was brought up to date and by whom, nothing more. The first
    // account is the story itself, and a classified update is not announced.
    const first = Math.min(...r.drafts.map((x) => x.n));
    r.drafts.forEach((dr, i) => {
      const dd = isoDate(dr.date);
      if (!dd || dr.n === first || dr.stamp === 'TOP SECRET' || dr.stamp === 'SECRET') return;
      // a body outside the Office that reported; the Office's own sections and staff are not named
      const body = (x?: string) =>
        x && !/heuss|records office|section|time office|review board|记录署|数据组|测绘科|时间科|审查委员会/i.test(x) ? x : '';
      const byEn = body(dr.by), byZh = body(zh?.drafts?.[i]?.by ?? dr.by);
      const by = byEn && (/^driver, /i.test(byEn) ? byEn.replace(/^driver, (.+)$/i, 'a driver on $1') : `the ${byEn}`);
      day(dd).corrections.push({
        kind: 'correction',
        head: { en: `Records Office updates its file on “${t.en}”`, zh: `记录署更新《${t.zh}》档案` },
        body: {
          en: `The Records Office says its file on this matter has been brought up to date${by ? ` following a report from ${by}` : ''}. Earlier accounts should be disregarded. The file may be read at the public archive.`,
          zh: `记录署表示，有关档案已${byZh ? `根据${byZh}的报告` : ''}更新，此前的说法作废。档案可在公共档案馆查阅。`,
        },
        ...link,
      });
    });

    r.attachments.forEach((a, i) => {
      const ad = isoDate(a.date);
      if (!ad) return;
      const az = zh?.attachments?.[i] ?? a;
      if (a.kind === 'clipping') {
        const en = splitClipping(official(a.text, draftOn(r.drafts, ad)));
        const cz = splitClipping(official(az.text, draftOn(r.drafts, ad)));
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

  // every other day of 1999 still went to press
  for (let t = Date.UTC(1999, 0, 1); t <= Date.UTC(1999, 11, 31); t += 864e5) {
    const iso = new Date(t).toISOString().slice(0, 10);
    if (!days.has(iso)) {
      const d = day(iso);
      const s0 = seed(iso);
      // walk the pool so neighbouring days never print the same story
      const q = QUIET[(dayOfYear(iso) * 7 + (s0 % 3)) % QUIET.length];
      d.leads.push({ kind: 'lead', head: q.head, body: q.body });
      d.quiet = true;
    }
  }

  return [...days.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((x): Issue => {
      const s = seed(x.date);
      const n = dayOfYear(x.date);
      const pick = <T,>(arr: T[], k: number) => arr[(s >>> (k * 3)) % arr.length];
      // walk a pool from a different starting point each day, so a page never prints the same thing twice
      const run = <T,>(arr: T[], count: number, start: number, skip: T[] = []) => {
        const out: T[] = [];
        for (let i = 0; out.length < Math.min(count, arr.length - skip.length) && i < arr.length * 2; i++) {
          const v = arr[(start + i * 5) % arr.length];
          if (!out.includes(v) && !skip.includes(v)) out.push(v);
        }
        return out;
      };
      const leads = x.leads.length ? x.leads : [];
      const lead = leads[0] ?? x.articles[0] ?? x.corrections[0] ?? x.notices[0];
      const articles = [...leads.slice(1).map((l) => ({ ...l, kind: 'article' as const })), ...x.articles.filter((a) => a !== lead)];
      const hi = 5 + (s % 3), hm = (s >>> 4) % 60;
      const tide = {
        en: `High water ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')} and ${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}.`,
        zh: `高潮 ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')}、${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}。`,
      };
      // the day's small news: the ordinary stories the lead did not use
      const quietLead = x.quiet ? QUIET.find((q) => q.head.en === lead.head.en) : undefined;
      // on a day with news, "nothing was reported" would be a lie even for this paper
      const skip = [...(quietLead ? [quietLead] : []), ...(x.quiet ? [] : QUIET.filter((q) => q.head.en === 'Quiet day at the Axis'))];
      const briefs: Story[] = run(QUIET, 7, n * 3 + 1, skip).map((q) => ({ kind: 'article', head: q.head, body: q.body }));
      const second = articles[0] ?? briefs.shift();
      return {
        date: x.date,
        no: n,
        lead: lead.photo ? lead : { ...lead, photo: { seed: x.date, caption: { en: 'Staff photograph.', zh: '本报摄。' } } },
        second,
        articles: articles.filter((a) => a !== lead && a !== second),
        briefs,
        buses: run(BUSES, 3, n + (s % 4)),
        letters: run(LETTERS, 3, n * 2 + (s % 3)),
        events: run(EVENTS, 4, n + (s % 5)),
        tv: television(n, s),
        corrections: x.corrections.filter((c) => c !== lead),
        notices: x.notices.filter((m) => m !== lead),
        // the same sky the rooms show for that day (src/app/weather.ts)
        weather: pick(islandRaining(x.date) ? WEATHER : DRY, 1),
        tide,
        classifieds: run(CLASSIFIEDS, 12, s % CLASSIFIEDS.length),
        office: OFFICE[(n * 5 + (s % 2)) % OFFICE.length],
        special: x.date === '1999-12-31',
        quiet: x.quiet,
      };
    });
}

/** Ordinary days. Small, local, a little wry. (Story echoes cleared 2026-11-25; see 27fc6a2.) */
const QUIET: { head: L; body: L }[] = [
  { head: { en: 'Lost umbrellas reach record number', zh: '失物雨伞创新高' }, body: { en: 'The Axis lost property office now holds 1,412 umbrellas. Claims may be made in person. Please describe the umbrella.', zh: '中枢失物招领处现存雨伞 1412 把。可本人前来认领，请描述伞的样子。' } },
  { head: { en: 'Serangoon lift inspected, found to be a lift', zh: '实龙岗电梯年检：确为电梯' }, body: { en: 'The annual inspection of lifts in Serangoon was completed without incident. All lifts stopped at the floors shown.', zh: '实龙岗电梯年检顺利完成。所有电梯都停在按下的楼层。' } },
  { head: { en: 'Drain clearing in Bukit Merah', zh: '红山疏通沟渠' }, body: { en: 'Works continue on the drains along Hill Street. Residents are reminded that the drains are deeper than they look.', zh: '山街沿线沟渠疏通工程继续进行。提醒居民：沟比看上去深。' } },
  { head: { en: 'New bench at the Axis bus interchange', zh: '中枢巴士转换站添置新长椅' }, body: { en: 'A bench has been installed at Berth 4. It faces the wall. A second bench is planned.', zh: '4 号车位装了一张长椅，朝着墙。第二张长椅已在计划中。' } },
  { head: { en: 'Records Office extends opening hours', zh: '记录署延长办公时间' }, body: { en: 'The public counter will now close at 5.15pm instead of 5pm. The extra quarter hour is for queries about the change.', zh: '公共柜台下班时间由五点改为五点十五分。多出的一刻钟专门用来答复有关这次调整的询问。' } },
  { head: { en: 'Night market moves one street over', zh: '夜市挪到隔壁一条街' }, body: { en: 'The Thursday market in Toa Payoh will be held on Market Lane from next week. It is the same market.', zh: '大巴窑的星期四夜市下周起改在巴刹巷举行。还是那个夜市。' } },
  { head: { en: 'Island-wide fogging exercise', zh: '全岛喷雾灭蚊' }, body: { en: 'Fogging will be carried out block by block this week. Please close your windows. Please do not close them in advance.', zh: '本周逐座组屋喷雾灭蚊。届时请关窗，请不要提前关。' } },
  { head: { en: 'Library adds second dehumidifier', zh: '资料室添置第二台除湿机' }, body: { en: 'The Records Office library has installed another dehumidifier. Staff say the first one seems relieved.', zh: '记录署资料室又装了一台除湿机。职员说，第一台看上去松了口气。' } },
  { head: { en: 'Kopitiam prices unchanged', zh: '咖啡店价格不变' }, body: { en: 'A survey of coffee shops found prices unchanged since March. Kopi is 60 cents. Kopi-O is still being discussed.', zh: '咖啡店价格调查显示，价格自三月以来未变。咖啡六角，黑咖啡还在商量。' } },
  { head: { en: 'Residents’ committee elects new chair', zh: '居委会选出新主席' }, body: { en: 'The Serangoon residents’ committee has a new chair. She was the only one who stayed to the end of the meeting.', zh: '实龙岗居委会选出新主席。她是唯一一个开会开到最后的人。' } },
  { head: { en: 'Stray dog adopted by bus depot', zh: '巴士车厂收养流浪狗' }, body: { en: 'A brown dog that has slept at the Toa Payoh depot since May is now on the staff list. He does not ride the buses.', zh: '一只五月起睡在大巴窑车厂的黄狗，正式列入员工名单。它不坐 97 路。' } },
  { head: { en: 'Free eye checks at community centre', zh: '民众联络所免费验眼' }, body: { en: 'The Ang Mo Kio community centre offers free eye checks on Saturday. Bring your glasses, and the old ones too.', zh: '宏茂桥民众联络所星期六免费验眼。请带上眼镜，旧的也带上。' } },
  { head: { en: 'Durian season ends early', zh: '榴莲季提前结束' }, body: { en: 'Stallholders in Woodlands report the season over a fortnight early. The trees have not been consulted.', zh: '兀兰摊贩说，今年榴莲季早结束了两个星期。没人问过树的意见。' } },
  { head: { en: 'Ferry timetable reprinted', zh: '渡轮时刻表重印' }, body: { en: 'The new ferry timetable is identical to the old one except for the colour of the paper.', zh: '新渡轮时刻表和旧的一模一样，只是纸的颜色不同。' } },
  { head: { en: 'Badminton hall roof repaired', zh: '羽毛球馆屋顶修好了' }, body: { en: 'The hall in Bukit Merah no longer leaks over Court 3. Court 3 players say the game is not the same.', zh: '红山羽毛球馆 3 号场不再漏雨。3 号场的球友说，打起来没那个味了。' } },
  { head: { en: 'Quiet day at the Axis', zh: '中枢平静的一天' }, body: { en: 'Nothing was reported to the Records Office today. The Office asks that this not be reported either.', zh: '今天没人向记录署报告任何事。署里请大家也别报告这件事。' } },
  { head: { en: 'Coin-operated phones to accept new coins', zh: '投币电话将收新硬币' }, body: { en: 'Public telephones will accept the new 20-cent coin from next month. The old coin will continue to work, as it always has.', zh: '公共电话下个月起接受新版二角硬币。旧硬币照样能用，一直都能用。' } },
];

/** Bus diversions, printed on page 2. */
const BUSES: L[] = [
  { en: 'Route 97: from Monday buses will not stop outside Block 12, Toa Payoh, while the shelter is repainted. The stop itself remains.', zh: '97 路：下星期一起，大巴窑第 12 座门口的车站因候车亭油漆暂停停靠。车站本身还在。' },
  { en: 'Route 14 is diverted via Hill Street during drain works in Bukit Merah. Passengers for the old market please alight at the new one.', zh: '14 路因红山沟渠工程改经山街。去旧巴刹的乘客，请在新巴刹下车。' },
  { en: 'Route 3 will run every 12 minutes instead of 10 on Sundays. The timetable has been reprinted to look the same.', zh: '3 路星期天由十分钟一班改为十二分钟一班。时刻表已重印，看上去和原来一样。' },
  { en: 'Night service N9 is extended to Harbour Row. The last bus leaves the Axis at 12.40am, as it has for some time.', zh: '夜班车 N9 延长至港口街。末班车凌晨十二点四十分从中枢开出，其实已经这么开了一阵子。' },
  { en: 'Route 5 avoids Woodlands Road on Saturday for the temple procession. Expect drums from the bus anyway.', zh: '5 路星期六因兀兰路游神改道。坐在车上照样听得到锣鼓。' },
  { en: 'Routes 7 and 70 swap berths at the Axis interchange from the 1st. The berth numbers stay where they are.', zh: '7 路和 70 路下月一号起在中枢转换站互换车位。车位号码原地不动。' },
  { en: 'Route 33 no longer stops at Serangoon Avenue 3, which is now part of Serangoon Avenue 2.', zh: '33 路不再停靠实龙岗三道，该路段已并入实龙岗二道。' },
  { en: 'Feeder 225 is back in service after repairs. The bell works. Please ring it once.', zh: '支线 225 修好复驶。车铃是好的，请按一下就够了。' },
  { en: 'Route 97A is withdrawn. Passengers should take Route 97, which goes to the same places in a different order.', zh: '97A 路停驶。乘客请改搭 97 路：去的地方一样，顺序不同。' },
  { en: 'Hougang ferry: the 7.10am sailing leaves at 7.05am this week, at the tide’s request.', zh: '后港渡轮：本周早上七点十分那班提前到七点零五分开船。潮水的意思。' },
  { en: 'Route 12 will carry a conductor again on weekday mornings. He has asked for the old ticket punch.', zh: '12 路平日早班恢复售票员。他要求用回旧的打票夹。' },
];

/** Letters to the editor, printed on page 3. */
const LETTERS: Letter[] = [
  { body: { en: 'Sir, the clock on the Toa Payoh tower is right twice a day, which is more than I can say for my son.', zh: '编辑先生：大巴窑钟楼的钟一天还能准两回，我儿子一回都没准过。' }, by: { en: 'Retired, Toa Payoh', zh: '大巴窑 一退休人士' } },
  { body: { en: 'Thank you to the driver of the 14 who waited for me on Hill Street on Tuesday in the rain. You did not have to.', zh: '谢谢星期二下雨天在山街等我的那位 14 路司机。你其实可以不等的。' }, by: { en: 'Grateful, Bukit Merah', zh: '红山 一感激的乘客' } },
  { body: { en: 'Why does the library’s new dehumidifier face the old one?', zh: '资料室新来的那台除湿机，为什么脸朝着旧的那台？' }, by: { en: 'A reader', zh: '一读者' } },
  { body: { en: 'Sir, your crossword had two answers to 9 down. Both were correct.', zh: '编辑先生：贵报填字游戏直 9 有两个答案，两个都对。' }, by: { en: 'Puzzler, Axis', zh: '中枢 一填字迷' } },
  { body: { en: 'The new bench at Berth 4 faces the wall. I sat on it for some time. It is a good wall.', zh: '4 号车位那张新长椅朝着墙。我在上面坐了一阵，那面墙挺好。' }, by: { en: 'Pensioner, Axis', zh: '中枢 一退休人士' } },
  { body: { en: 'The void deck of Block 14 is the coolest place in Woodlands at three in the afternoon. I would rather this were not more widely known.', zh: '下午三点，兀兰第 14 座楼下空地是全区最凉快的地方。这件事我希望别再传开了。' }, by: { en: 'Resident, Woodlands', zh: '兀兰 一居民' } },
  { body: { en: 'My grandson says nobody writes letters to newspapers any more. I told him I would write and ask.', zh: '我孙子说现在已经没人给报馆写信了。我说那我写封信问问。' }, by: { en: 'Grandfather, Ang Mo Kio', zh: '宏茂桥 一位阿公' } },
];

/** What's on, printed on page 3. */
const EVENTS: L[] = [
  { en: 'Ang Mo Kio Community Centre: line dancing, Tuesdays 7.30pm. Beginners welcome; the instructor counts to eight.', zh: '宏茂桥民众联络所：排舞，逢星期二晚七点半。欢迎初学者，老师会数到八。' },
  { en: 'Woodlands Library: story hour for children, Saturday 10am. Stories end on time.', zh: '兀兰图书馆：儿童故事会，星期六上午十点。故事准时讲完。' },
  { en: 'Axis Town Hall: free concert by the Ashmere Brass Band, Sunday 5pm. Umbrellas may be left at the door.', zh: '中枢大会堂：雨洲铜管乐队免费音乐会，星期天下午五点。雨伞可寄放门口。' },
  { en: 'Toa Payoh: getai on the field behind Block 20, nightly this week. The front row is kept free, as usual.', zh: '大巴窑：第 20 座后面空地本周每晚有歌台。照例，第一排的位子空着留给好兄弟。' },
  { en: 'Bukit Merah pool closed on Monday for cleaning. The deep end will be the same depth when it reopens.', zh: '红山游泳池星期一清洗，暂停开放。重新开放时，深水区还是那么深。' },
  { en: 'Serangoon Market: blood donation drive, Saturday 9am to 1pm. A hot drink for every donor.', zh: '实龙岗巴刹：捐血活动，星期六上午九点至下午一点。每位捐血者送热饮一杯。' },
  { en: 'Hougang jetty: angling competition, Sunday from first light. Catches are weighed and put back.', zh: '后港码头：海钓比赛，星期天天一亮就开始。钓上来的鱼过完秤放回海里。' },
  { en: 'Records Office: tours of the public counter, first Wednesday of the month. Visitors may not touch the stamps.', zh: '记录署：公共柜台参观，每月第一个星期三。参观者请勿触碰印章。' },
  { en: 'Axis Cinema: matinee double bill, half price before 1pm.', zh: '中枢戏院：午场两片连映，下午一点前半价。' },
  { en: 'Woodlands Community Centre: chess club, Thursday evenings. Bring your own set; the club’s is missing a knight.', zh: '兀兰民众联络所：象棋会，逢星期四晚上。请自带棋具，会里那副少了一只马。' },
  { en: 'Harbour Row: night walk along the old sea wall with the Heritage Society, Friday 8pm. Torches provided.', zh: '港口街：文物协会带队夜游旧海堤，星期五晚八点。备有手电筒。' },
  { en: 'Axis: free blood pressure checks outside the post office, weekday mornings.', zh: '中枢：邮政局门口免费量血压，平日上午。' },
];

const FILMS: L[] = [
  { en: 'Rain on the Causeway', zh: '长堤上的雨' },
  { en: 'Getai Downstairs', zh: '楼下的歌台' },
  { en: 'The Last Ferry', zh: '最后一班渡轮' },
  { en: 'Once in Bukit Merah', zh: '红山往事' },
  { en: 'The Clock Tower', zh: '钟楼' },
  { en: 'The Street With No Name', zh: '无名街' },
  { en: 'After the Monsoon', zh: '雨季之后' },
  { en: 'Room 312', zh: '三一二号房' },
];

/** Tonight's television: the same two channels every night, a different episode. */
function television(n: number, s: number): L[] {
  const film = FILMS[(n + (s % 3)) % FILMS.length];
  const ep = (n % 40) + 1;
  return [
    { en: 'Channel 1 · 7.00 News · 7.30 Island Quiz', zh: '雨视一台 · 7:00 新闻 · 7:30 全岛问答' },
    { en: `Channel 1 · 8.00 Drama: The Kampong Years (ep. ${ep})`, zh: `雨视一台 · 8:00 连续剧《甘榜岁月》第 ${ep} 集` },
    { en: 'Channel 1 · 9.00 Weather, followed by the news again', zh: '雨视一台 · 9:00 天气预报，接着把新闻再播一遍' },
    { en: `Channel 2 · 8.30 Block 14 Family · 10.30 Late film: ${film.en}`, zh: `雨视二台 · 8:30 处境剧《十四座一家亲》· 10:30 午夜场《${film.zh}》` },
    { en: 'Channel 2 · 12.15 Close, then the test card', zh: '雨视二台 · 12:15 收台，之后是测试图' },
  ];
}

/** One line from the Office, every day. */
const OFFICE: L[] = [
  { en: 'Everything on the island is normal. Where it differs, go by what you see.', zh: '本岛一切如常。如有不同，以现场为准。' },
  { en: 'Form RO-9 is available at every counter. Please use black ink.', zh: '各柜台均可领取 RO-9 表格。请用黑色墨水填写。' },
  { en: 'The library is open to registered visitors. Return books to the shelf they came from.', zh: '资料室向已登记访客开放。书从哪层取的，请放回哪层。' },
  { en: 'Please write the year in four digits.', zh: '书写年份请用四位数。' },
  { en: 'Corrections are printed as they are issued. Earlier versions should be disregarded.', zh: '更正随发随印。旧版本请一律作废。' },
  { en: 'The public counter closes at 5.15pm.', zh: '公共柜台下午五点十五分停止办公。' },
];

const WEATHER: L[] = [
  { en: 'Drizzle, 27°C. Clearing later.', zh: '毛毛雨，27°C。午后转晴。' },
  { en: 'Light rain all day. Take an umbrella.', zh: '全天小雨，出门带伞。' },
  { en: 'Drizzle in the morning, rain in the afternoon, drizzle at night.', zh: '早上毛毛雨，下午下雨，晚上又是毛毛雨。' },
  { en: 'Overcast, 28°C. Rain expected in the afternoon.', zh: '阴，28°C。预计下午有雨。' },
  { en: 'Showers over the Axis. Woodlands had them an hour ago.', zh: '中枢有阵雨。兀兰一小时前已经下过。' },
  { en: 'Fine spells between showers, none of them long.', zh: '阵雨之间偶有晴天，都不长。' },
];

/** Days the sums in weather.ts call dry. */
const DRY: L[] = [
  { en: 'Fair, 31°C. Hazy over the strait by evening.', zh: '晴，31°C。傍晚海峡上空起薄霾。' },
  { en: 'Dry, light winds, 31°C. Laundry poles out by eight.', zh: '无雨，微风，31°C。八点前把晾衣竹竿伸出去。' },
  { en: 'Sunny spells, 30°C. No rain forecast. The forecast has been wrong before.', zh: '间中晴朗，30°C。预报无雨。预报以前也错过。' },
  { en: 'Hot and still, 32°C. The Office asks residents to water the corridor plants.', zh: '闷热无风，32°C。记录署请居民给走廊上的盆栽浇水。' },
  { en: 'Clear morning, cloud after lunch, 30°C. Should stay dry.', zh: '早上晴，午饭后起云，30°C。应该不会下雨。' },
];

const CLASSIFIEDS: L[] = [
  { en: 'FOUND. Black umbrella, Route 97, still wet. Collect from the Toa Payoh depot.', zh: '招领。黑伞一把，97 路车上拾获，仍是湿的。请到大巴窑车厂认领。' },
  { en: 'WANTED. Clock repairer for the Toa Payoh tower. Must not touch the hands.', zh: '诚聘。大巴窑钟楼修钟师傅一名。不得触碰指针。' },
  { en: 'PIANO LESSONS. Bukit Merah, evenings. The metronome runs slightly fast.', zh: '钢琴课。红山，晚间授课。节拍器略快。' },
  { en: 'SITUATION WANTED. Filing clerk, twenty years’ experience, asks no questions.', zh: '求职。归档员，二十年经验，不多问。' },
  { en: 'FOR SALE. Rattan chairs, set of four, one slightly newer than the rest. Bukit Merah.', zh: '出让。藤椅四张，其中一张比其余的新一点。红山。' },
  { en: 'TUITION. Maths and English, Secondary 1 to 4, at your home. Own transport (Route 97).', zh: '补习。中一至中四数学、英文，上门授课。自备交通（97 路）。' },
  { en: 'FOR SALE. Cassette player, plays both sides at once. $15.', zh: '出让。卡带机一台，两面同时放。十五元。' },
  { en: 'LOST. Grey cat, answers to Ah Boy, Woodlands. Also answers to other names.', zh: '寻猫。灰猫一只，叫“阿弟”会应，兀兰走失。叫别的名字也会应。' },
  { en: 'MAHJONG KAKI WANTED. Thursdays, Serangoon. The fourth player keeps changing.', zh: '征麻将脚。逢星期四，实龙岗。第四个人老是换。' },
  { en: 'TAILOR. Alterations while you wait. Hems taken up, years taken off.', zh: '裁缝。立等可取。裤脚改短，年纪改小。' },
  { en: 'FOUND. House keys on a red string, Route 14. The flat number has worn off.', zh: '招领。红绳串钥匙一串，14 路车上拾获。门牌号磨掉了。' },
  { en: 'FOR SALE. Wedding album, never used. Serious buyers only.', zh: '出让。结婚相册一本，从没用过。诚意者洽。' },
  { en: 'FOR SALE. Lady’s bicycle, Hougang, basket and bell. $40 or nearest offer.', zh: '出让。女装脚车一辆，后港，带菜篮和车铃。四十元，可议价。' },
  { en: 'HELP WANTED. Provision shop, Bukit Merah, mornings. Must be able to count change.', zh: '请人。红山杂货店，早班。会找零钱就行。' },
];

export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function longDate(iso: string): L {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { en: `${WEEK_EN[w]}, ${d} ${MONTHS_EN[m - 1]} ${y}`, zh: `${y} 年 ${m} 月 ${d} 日 · 星期${WEEK_ZH[w]}` };
}
