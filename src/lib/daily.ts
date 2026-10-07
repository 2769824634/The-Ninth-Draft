/**
 * The Gerimis Daily: a newspaper built from the archive at build time.
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
export const official = (html: string) =>
  html
    .replace(/<span class="rv-note"[\s\S]*?<\/span><\/span>/g, '')
    .replace(/<span class="rv" data-del="\d">[\s\S]*?<\/span>/g, '')
    .replace(/<span class="rv" data-redact="(\d)-(\d)"><span>([\s\S]*?)<\/span><\/span>/g, (_m, a, b, t) => (Number(a) <= 9 && 9 <= Number(b) ? bar(t) : t))
    .replace(/<span class="redact"[^>]*><span>([\s\S]*?)<\/span><\/span>/g, (_m, t) => bar(t))
    .replace(/<span class="rv" data-add="\d">([\s\S]*?)<\/span>/g, '$1')
    .replace(/<(?!\/?(p|b|i|em|strong|br)\b)[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
        body: { en: official(r.summary), zh: official(zh?.summary ?? r.summary) },
        deck: r.subtitle ? { en: r.subtitle, zh: zh?.subtitle ?? r.subtitle } : undefined,
        photo: { src: r.image, seed: r.file, caption: photoCaption },
        ...link,
      });
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
        const en = splitClipping(official(a.text));
        const cz = splitClipping(official(az.text));
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
        en: `High water ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')} and ${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}. The old shoreline is not included.`,
        zh: `高潮 ${String(hi).padStart(2, '0')}:${String(hm).padStart(2, '0')}、${hi + 12}:${String((hm + 25) % 60).padStart(2, '0')}。旧海岸线不在此列。`,
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
        weather: pick(WEATHER, 1),
        tide,
        classifieds: run(CLASSIFIEDS, 12, s % CLASSIFIEDS.length),
        office: OFFICE[(n * 5 + (s % 2)) % OFFICE.length],
        special: x.date === '1999-12-31',
        quiet: x.quiet,
      };
    });
}

/** Ordinary days. Small, local, a little odd. */
const QUIET: { head: L; body: L }[] = [
  { head: { en: 'Route 97 runs to timetable', zh: '97 路准点运行' }, body: { en: 'All departures from the Toa Payoh depot left on time yesterday. The depot asks passengers not to remark on it.', zh: '昨日大巴窑车厂所有班次准点发车。车厂请乘客不要特意提起这件事。' } },
  { head: { en: 'Water pressure normal in Woodlands', zh: '兀兰水压正常' }, body: { en: 'The Public Utilities Board reports normal pressure in all Woodlands blocks. Residents of Block 14 say otherwise. The Board has noted them.', zh: '公用事业局报告，兀兰各座组屋水压正常。第 14 座居民不这么认为，局里已记录在案。' } },
  { head: { en: 'Hawker centre reopens after repainting', zh: '小贩中心油漆完毕，重新开放' }, body: { en: 'The Ang Mo Kio hawker centre has reopened in the same green as before. Stall numbers are unchanged, apart from 07.', zh: '宏茂桥小贩中心重新开放，墙还是原来的绿色。摊位号都没变，07 号除外。' } },
  { head: { en: 'Lost umbrellas reach record number', zh: '失物雨伞创新高' }, body: { en: 'The Axis lost property office now holds 1,412 umbrellas. Claims may be made in person. Please describe the umbrella.', zh: '中枢失物招领处现存雨伞 1412 把。可本人前来认领，请描述伞的样子。' } },
  { head: { en: 'Serangoon lift inspected, found to be a lift', zh: '实龙岗电梯年检：确为电梯' }, body: { en: 'The annual inspection of lifts in Serangoon was completed without incident. All lifts stopped at the floors shown.', zh: '实龙岗电梯年检顺利完成。所有电梯都停在按下的楼层。' } },
  { head: { en: 'Drain clearing in Bukit Merah', zh: '红山疏通沟渠' }, body: { en: 'Works continue on the drains along Hill Street. Residents are reminded that the drains are deeper than they look.', zh: '山街沿线沟渠疏通工程继续进行。提醒居民：沟比看上去深。' } },
  { head: { en: 'School term begins quietly', zh: '学校开学，一切平静' }, body: { en: 'Pupils returned to class across the island. Several teachers reported that the register was already filled in.', zh: '全岛学生返校上课。几位老师说，点名簿已经有人先填好了。' } },
  { head: { en: 'Fishing boats return early', zh: '渔船提早回港' }, body: { en: 'Boats at Hougang came in an hour before the tide table said they would. The tide was also early.', zh: '后港渔船比潮汐表早一小时回港。潮水也早了。' } },
  { head: { en: 'New bench at the Axis bus interchange', zh: '中枢巴士转换站添置新长椅' }, body: { en: 'A bench has been installed at Berth 4. It faces the wall. A second bench is planned.', zh: '4 号车位装了一张长椅，朝着墙。第二张长椅已在计划中。' } },
  { head: { en: 'Records Office extends opening hours', zh: '记录署延长办公时间' }, body: { en: 'The public counter will now close at 5.15pm instead of 5pm. The extra quarter hour is for queries about the change.', zh: '公共柜台下班时间由五点改为五点十五分。多出的一刻钟专门用来答复有关这次调整的询问。' } },
  { head: { en: 'Night market moves one street over', zh: '夜市挪到隔壁一条街' }, body: { en: 'The Thursday market in Toa Payoh will be held on Market Lane from next week. It is the same market.', zh: '大巴窑的星期四夜市下周起改在巴刹巷举行。还是那个夜市。' } },
  { head: { en: 'Island-wide fogging exercise', zh: '全岛喷雾灭蚊' }, body: { en: 'Fogging will be carried out block by block this week. Please close your windows. Please do not close them in advance.', zh: '本周逐座组屋喷雾灭蚊。届时请关窗，请不要提前关。' } },
  { head: { en: 'Library adds second dehumidifier', zh: '资料室添置第二台除湿机' }, body: { en: 'The Records Office library has installed another dehumidifier. Staff say the first one seems relieved.', zh: '记录署资料室又装了一台除湿机。职员说，第一台看上去松了口气。' } },
  { head: { en: 'Kopitiam prices unchanged', zh: '咖啡店价格不变' }, body: { en: 'A survey of coffee shops found prices unchanged since March. Kopi is 60 cents. Kopi-O is still being discussed.', zh: '咖啡店价格调查显示，价格自三月以来未变。咖啡六角，黑咖啡还在商量。' } },
  { head: { en: 'Clock tower cleaned', zh: '钟楼清洗完毕' }, body: { en: 'The Toa Payoh clock tower was washed on Sunday. The hands were not touched. The time remains as it was.', zh: '大巴窑钟楼星期天清洗完毕。指针没动，时间还是原来的时间。' } },
  { head: { en: 'Postal deliveries delayed by rain', zh: '大雨延误邮递' }, body: { en: 'Letters for Woodlands will arrive tomorrow. Letters from Woodlands arrived yesterday.', zh: '寄往兀兰的信明天才到。从兀兰寄出的信，昨天已经到了。' } },
  { head: { en: 'Residents’ committee elects new chair', zh: '居委会选出新主席' }, body: { en: 'The Serangoon residents’ committee has a new chair. She was the only one who stayed to the end of the meeting.', zh: '实龙岗居委会选出新主席。她是唯一一个开会开到最后的人。' } },
  { head: { en: 'Stray dog adopted by bus depot', zh: '巴士车厂收养流浪狗' }, body: { en: 'A brown dog that has slept at the Toa Payoh depot since May is now on the staff list. He does not ride Route 97.', zh: '一只五月起睡在大巴窑车厂的黄狗，正式列入员工名单。它不坐 97 路。' } },
  { head: { en: 'Harbour Row lamps replaced', zh: '港口街换路灯' }, body: { en: 'New street lamps were fitted along Harbour Row. They light the old shoreline as well, which was not in the specification.', zh: '港口街换了新路灯。灯也照到了旧海岸线，这不在设计要求里。' } },
  { head: { en: 'Free eye checks at community centre', zh: '民众联络所免费验眼' }, body: { en: 'The Ang Mo Kio community centre offers free eye checks on Saturday. Bring your glasses, and the old ones too.', zh: '宏茂桥民众联络所星期六免费验眼。请带上眼镜，旧的也带上。' } },
  { head: { en: 'Durian season ends early', zh: '榴莲季提前结束' }, body: { en: 'Stallholders in Woodlands report the season over a fortnight early. The trees have not been consulted.', zh: '兀兰摊贩说，今年榴莲季早结束了两个星期。没人问过树的意见。' } },
  { head: { en: 'Records Office reminds: four digits', zh: '记录署提醒：请写四位数' }, body: { en: 'The Data Section asks all residents to write the year in full on forms. Two digits will be accepted until further notice, reluctantly.', zh: '数据组请各位居民在表格上写完整的年份。另行通知前，两位数仍会受理，但不太情愿。' } },
  { head: { en: 'Ferry timetable reprinted', zh: '渡轮时刻表重印' }, body: { en: 'The new ferry timetable is identical to the old one except for the colour of the paper.', zh: '新渡轮时刻表和旧的一模一样，只是纸的颜色不同。' } },
  { head: { en: 'Badminton hall roof repaired', zh: '羽毛球馆屋顶修好了' }, body: { en: 'The hall in Bukit Merah no longer leaks over Court 3. Court 3 players say the game is not the same.', zh: '红山羽毛球馆 3 号场不再漏雨。3 号场的球友说，打起来没那个味了。' } },
  { head: { en: 'Quiet day at the Axis', zh: '中枢平静的一天' }, body: { en: 'Nothing was reported to the Records Office today. The Office asks that this not be reported either.', zh: '今天没人向记录署报告任何事。署里请大家也别报告这件事。' } },
  { head: { en: 'Tree pruning on Bridge Road', zh: '桥路修剪行道树' }, body: { en: 'The rain trees along Bridge Road have been pruned. The road signs can now be read from further away. Please read them.', zh: '桥路两旁的雨树修剪过了，路牌在更远处就看得清。请看清楚。' } },
  { head: { en: 'Coin-operated phones to accept new coins', zh: '投币电话将收新硬币' }, body: { en: 'Public telephones will accept the new 20-cent coin from next month. The old coin will continue to work, as it always has.', zh: '公共电话下个月起接受新版二角硬币。旧硬币照样能用，一直都能用。' } },
  { head: { en: 'Choir to sing at Block 7', zh: '合唱团将在第 7 座演唱' }, body: { en: 'The Serangoon community choir will sing in the void deck of Block 7 on Friday. Residents of the third floor are especially welcome.', zh: '实龙岗社区合唱团星期五在第 7 座楼下空地演唱。特别欢迎三楼住户。' } },
];

/** Bus diversions, printed on page 2. */
const BUSES: L[] = [
  { en: 'Route 97: from Monday buses will not stop outside Block 12, Toa Payoh, while the shelter is repainted. The stop itself remains.', zh: '97 路：下星期一起，大巴窑第 12 座门口的车站因候车亭油漆暂停停靠。车站本身还在。' },
  { en: 'Route 14 is diverted via Hill Street during drain works in Bukit Merah. Passengers for the old market please alight at the new one.', zh: '14 路因红山沟渠工程改经山街。去旧巴刹的乘客，请在新巴刹下车。' },
  { en: 'Route 3 will run every 12 minutes instead of 10 on Sundays. The timetable has been reprinted to look the same.', zh: '3 路星期天由十分钟一班改为十二分钟一班。时刻表已重印，看上去和原来一样。' },
  { en: 'Night service N9 is extended to Harbour Row. The last bus leaves the Axis at 12.40am, as it has for some time.', zh: '夜班车 N9 延长至港口街。末班车凌晨十二点四十分从中枢开出，其实已经这么开了一阵子。' },
  { en: 'Route 21: the Bridge Road stop has been renamed. Drivers will call out both names until further notice.', zh: '21 路：桥路站改名。另行通知前，司机两个站名都报。' },
  { en: 'Route 5 avoids Woodlands Road on Saturday for the temple procession. Expect drums from the bus anyway.', zh: '5 路星期六因兀兰路游神改道。坐在车上照样听得到锣鼓。' },
  { en: 'Routes 7 and 70 swap berths at the Axis interchange from the 1st. The berth numbers stay where they are.', zh: '7 路和 70 路下月一号起在中枢转换站互换车位。车位号码原地不动。' },
  { en: 'Route 33 no longer stops at Serangoon Avenue 3, which is now part of Serangoon Avenue 2.', zh: '33 路不再停靠实龙岗三道，该路段已并入实龙岗二道。' },
  { en: 'Feeder 225 is back in service after repairs. The bell works. Please ring it once.', zh: '支线 225 修好复驶。车铃是好的，请按一下就够了。' },
  { en: 'Route 97A is withdrawn. Passengers should take Route 97, which goes to the same places in a different order.', zh: '97A 路停驶。乘客请改搭 97 路：去的地方一样，顺序不同。' },
  { en: 'Hougang ferry: the 7.10am sailing leaves at 7.05am this week, at the tide’s request.', zh: '后港渡轮：本周早上七点十分那班提前到七点零五分开船。潮水的意思。' },
  { en: 'Route 61 detours past the old shoreline during roadworks on Harbour Row. Passengers are asked not to get off there.', zh: '61 路因港口街修路，绕经旧海岸线。请乘客不要在那里下车。' },
  { en: 'Route 12 will carry a conductor again on weekday mornings. He has asked for the old ticket punch.', zh: '12 路平日早班恢复售票员。他要求用回旧的打票夹。' },
  { en: 'Route 40 terminates at Woodlands Interchange instead of Woodlands Pier. The pier is still there, an hour behind.', zh: '40 路终点由兀兰码头改为兀兰转换站。码头还在，只是慢一个小时。' },
];

/** Letters to the editor, printed on page 3. */
const LETTERS: Letter[] = [
  { body: { en: 'Sir, the clock on the Toa Payoh tower is right twice a day, which is more than I can say for my son.', zh: '编辑先生：大巴窑钟楼的钟一天还能准两回，我儿子一回都没准过。' }, by: { en: 'Retired, Toa Payoh', zh: '大巴窑 一退休人士' } },
  { body: { en: 'The Ang Mo Kio hawker centre has painted stall 07 the same green as the others. Could someone tell me who is frying kway teow there now?', zh: '宏茂桥小贩中心把 07 号摊也漆成了跟别家一样的绿。想请问，现在在那里炒粿条的是谁？' }, by: { en: 'A regular, Ang Mo Kio', zh: '宏茂桥 一老主顾' } },
  { body: { en: 'I wrote the year in four digits on my television licence and the counter asked me to use two. Which is it to be?', zh: '我续电视执照，年份写了四位数，柜台叫我改两位。到底要哪样？' }, by: { en: 'Confused, Serangoon', zh: '实龙岗 一头雾水的读者' } },
  { body: { en: 'Could the Records Office please give us back our street’s old name? We were still using it.', zh: '能不能请记录署把我们那条街的旧名字还回来？我们还在用。' }, by: { en: 'Resident, Bridge Road', zh: '桥路 一居民' } },
  { body: { en: 'Every morning at 6.40 the 97 arrives empty and leaves full. Every evening, the opposite. I have stopped asking where everyone goes.', zh: '每天早上六点四十，97 路空着来、满着走；晚上反过来。大家去了哪儿，我已经不问了。' }, by: { en: 'Commuter, Toa Payoh', zh: '大巴窑 一通勤族' } },
  { body: { en: 'My late mother’s flat in Woodlands has a clock that runs an hour fast. The new tenants have asked me not to fix it.', zh: '我过世的母亲在兀兰那间屋里有个钟，快一个钟头。新房客叫我千万别去修。' }, by: { en: 'A former resident', zh: '一位前住户' } },
  { body: { en: 'Thank you to the driver of the 14 who waited for me on Hill Street on Tuesday in the rain. You did not have to.', zh: '谢谢星期二下雨天在山街等我的那位 14 路司机。你其实可以不等的。' }, by: { en: 'Grateful, Bukit Merah', zh: '红山 一感激的乘客' } },
  { body: { en: 'Why does the library’s new dehumidifier face the old one?', zh: '资料室新来的那台除湿机，为什么脸朝着旧的那台？' }, by: { en: 'A reader', zh: '一读者' } },
  { body: { en: 'The fish at the Hougang market have been very fresh lately. Some of them appear to be from tomorrow.', zh: '后港巴刹的鱼最近特别新鲜，有几条看样子是明天的。' }, by: { en: 'Housewife, Hougang', zh: '后港 一主妇' } },
  { body: { en: 'I have lived in Block 7 for twenty years and there has always been a third floor. I would like this printed.', zh: '我在第 7 座住了二十年，三楼一直都在。请把这句话登出来。' }, by: { en: 'Resident, Serangoon', zh: '实龙岗 一居民' } },
  { body: { en: 'Sir, your crossword had two answers to 9 down. Both were correct.', zh: '编辑先生：贵报填字游戏直 9 有两个答案，两个都对。' }, by: { en: 'Puzzler, Axis', zh: '中枢 一填字迷' } },
  { body: { en: 'The new bench at Berth 4 faces the wall. I sat on it for some time. It is a good wall.', zh: '4 号车位那张新长椅朝着墙。我在上面坐了一阵，那面墙挺好。' }, by: { en: 'Pensioner, Axis', zh: '中枢 一退休人士' } },
  { body: { en: 'Please tell the gentleman who keeps borrowing the 1984 bus timetable at the library that I need it too.', zh: '请转告资料室里老借 1984 年巴士时刻表的那位先生：我也要用。' }, by: { en: 'A reader', zh: '一读者' } },
  { body: { en: 'There used to be a coffee shop on the corner of Harbour Row. I am not saying it is back. I am saying the coffee tasted the same.', zh: '港口街拐角以前有间咖啡店。我没说它回来了，我只是说，咖啡还是那个味道。' }, by: { en: 'Name withheld', zh: '姓名从略' } },
  { body: { en: 'The void deck of Block 14 is the coolest place in Woodlands at three in the afternoon. I would rather this were not more widely known.', zh: '下午三点，兀兰第 14 座楼下空地是全区最凉快的地方。这件事我希望别再传开了。' }, by: { en: 'Resident, Woodlands', zh: '兀兰 一居民' } },
  { body: { en: 'My grandson says nobody writes letters to newspapers any more. I told him I would write and ask.', zh: '我孙子说现在已经没人给报馆写信了。我说那我写封信问问。' }, by: { en: 'Grandfather, Ang Mo Kio', zh: '宏茂桥 一位阿公' } },
];

/** What's on, printed on page 3. */
const EVENTS: L[] = [
  { en: 'Ang Mo Kio Community Centre: line dancing, Tuesdays 7.30pm. Beginners welcome; the instructor counts to eight.', zh: '宏茂桥民众联络所：排舞，逢星期二晚七点半。欢迎初学者，老师会数到八。' },
  { en: 'Woodlands Library: story hour for children, Saturday 10am. Stories end on time.', zh: '兀兰图书馆：儿童故事会，星期六上午十点。故事准时讲完。' },
  { en: 'Axis Town Hall: free concert by the Gerimis Brass Band, Sunday 5pm. Umbrellas may be left at the door.', zh: '中枢大会堂：霏微铜管乐队免费音乐会，星期天下午五点。雨伞可寄放门口。' },
  { en: 'Toa Payoh: getai on the field behind Block 20, nightly this week. The front row is kept free, as usual.', zh: '大巴窑：第 20 座后面空地本周每晚有歌台。照例，第一排的位子空着留给好兄弟。' },
  { en: 'Bukit Merah pool closed on Monday for cleaning. The deep end will be the same depth when it reopens.', zh: '红山游泳池星期一清洗，暂停开放。重新开放时，深水区还是那么深。' },
  { en: 'Serangoon Market: blood donation drive, Saturday 9am to 1pm. A hot drink for every donor.', zh: '实龙岗巴刹：捐血活动，星期六上午九点至下午一点。每位捐血者送热饮一杯。' },
  { en: 'Hougang jetty: angling competition, Sunday from first light. Catches are weighed and put back.', zh: '后港码头：海钓比赛，星期天天一亮就开始。钓上来的鱼过完秤放回海里。' },
  { en: 'Records Office: tours of the public counter, first Wednesday of the month. Visitors may not touch the stamps.', zh: '记录署：公共柜台参观，每月第一个星期三。参观者请勿触碰印章。' },
  { en: 'Axis Cinema: matinee double bill, half price before 1pm.', zh: '中枢戏院：午场两片连映，下午一点前半价。' },
  { en: 'Woodlands Community Centre: chess club, Thursday evenings. Bring your own set; the club’s is missing a knight.', zh: '兀兰民众联络所：象棋会，逢星期四晚上。请自带棋具，会里那副少了一只马。' },
  { en: 'Bridge Road Primary: school fair on Saturday. Lucky draw, kueh stall, and the old school bell will be rung once.', zh: '桥路小学：星期六校园义卖会。有幸运抽奖、糕点摊，旧校钟会敲一下。' },
  { en: 'Toa Payoh bus depot open day. Children may sit in the driver’s seat. The 97 is not on show.', zh: '大巴窑巴士车厂开放日。小朋友可以坐上司机座。97 路那辆不对外开放。' },
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
    { en: 'GTV 1 · 7.00 News · 7.30 Island Quiz', zh: '霏视一台 · 7:00 新闻 · 7:30 全岛问答' },
    { en: `GTV 1 · 8.00 Drama: The Kampong Years (ep. ${ep})`, zh: `霏视一台 · 8:00 连续剧《甘榜岁月》第 ${ep} 集` },
    { en: 'GTV 1 · 9.00 Weather, followed by the news again', zh: '霏视一台 · 9:00 天气预报，接着把新闻再播一遍' },
    { en: `GTV 2 · 8.30 Block 14 Family · 10.30 Late film: ${film.en}`, zh: `霏视二台 · 8:30 处境剧《十四座一家亲》· 10:30 午夜场《${film.zh}》` },
    { en: 'GTV 2 · 12.15 Close, then the test card', zh: '霏视二台 · 12:15 收台，之后是测试图' },
  ];
}

/** One line from the Office, every day. */
const OFFICE: L[] = [
  { en: 'Everything on the island is normal. If it isn’t, it’s the previous draft.', zh: '本岛一切如常。如有不同，是上一稿。' },
  { en: 'Form RO-9 is available at every counter. Please use black ink.', zh: '各柜台均可领取 RO-9 表格。请用黑色墨水填写。' },
  { en: 'The library is open to registered visitors. Return books to the shelf they came from.', zh: '资料室向已登记访客开放。书从哪层取的，请放回哪层。' },
  { en: 'Please write the year in four digits.', zh: '书写年份请用四位数。' },
  { en: 'Corrections are printed as they are issued. Earlier versions should be disregarded.', zh: '更正随发随印。旧版本请一律作废。' },
  { en: 'Queries about street names should be made in writing, using the current name.', zh: '查询街道名称请书面提出，并使用现行名称。' },
  { en: 'The public counter closes at 5.15pm.', zh: '公共柜台下午五点十五分停止办公。' },
];

const WEATHER: L[] = [
  { en: 'Drizzle, 27°C. Clearing later.', zh: '毛毛雨，27°C。午后转晴。' },
  { en: 'Light rain all day. Take an umbrella.', zh: '全天小雨，出门带伞。' },
  { en: 'Drizzle in the morning, rain in the afternoon, drizzle at night.', zh: '早上毛毛雨，下午下雨，晚上又是毛毛雨。' },
  { en: 'Overcast, 28°C. Rain expected, as it has been since March.', zh: '阴，28°C。预计有雨，从三月起一直预计有雨。' },
  { en: 'Showers over the Axis. Woodlands had them an hour ago.', zh: '中枢有阵雨。兀兰一小时前已经下过。' },
  { en: 'Fine spells between showers, none of them long.', zh: '阵雨之间偶有晴天，都不长。' },
];

const CLASSIFIEDS: L[] = [
  { en: 'FOUND. Black umbrella, Route 97, still wet. Collect from the Toa Payoh depot.', zh: '招领。黑伞一把，97 路车上拾获，仍是湿的。请到大巴窑车厂认领。' },
  { en: 'WANTED. Clock repairer for the Toa Payoh tower. Must not touch the hands.', zh: '诚聘。大巴窑钟楼修钟师傅一名。不得触碰指针。' },
  { en: 'LOST. The old name of our street, Ang Mo Kio. Reward offered.', zh: '寻物。宏茂桥我们那条街的旧名字。有酬谢。' },
  { en: 'FOR SALE. 1984 bus timetable, mint condition. Shows one extra stop.', zh: '出让。1984 年巴士时刻表一份，品相全新，比现在多一个站。' },
  { en: 'TO LET. Three-room flat, Serangoon, third floor. Number to be confirmed.', zh: '出租。实龙岗三房式组屋，三楼。门牌号待定。' },
  { en: 'NOTICE. Warehouse 4 will not be lending signs this week.', zh: '启事。四号仓库本周暂停出借路牌。' },
  { en: 'TUITION. Four-digit years, taught patiently. Apply to the Data Section.', zh: '补习。四位数年份，耐心教学。请向数据组报名。' },
  { en: 'FOUND. A mooring ring on Harbour Row. Owner please claim before the 9th.', zh: '招领。港口街系船环一个。失主请于 9 号前认领。' },
  { en: 'WANTED. Anyone who remembers flat 7-312. Tea provided.', zh: '征求。记得 7-312 那户人家的街坊。备茶。' },
  { en: 'PIANO LESSONS. Bukit Merah, evenings. The metronome runs slightly fast.', zh: '钢琴课。红山，晚间授课。节拍器略快。' },
  { en: 'LOST. One hour, Woodlands, sometime in March. Please return to the Time office.', zh: '寻物。一个小时，三月某日在兀兰遗失。拾到请交还时间科。' },
  { en: 'SITUATION WANTED. Filing clerk, twenty years’ experience, asks no questions.', zh: '求职。归档员，二十年经验，不多问。' },
  { en: 'FOR SALE. Rattan chairs, set of four, one slightly newer than the rest. Bukit Merah.', zh: '出让。藤椅四张，其中一张比其余的新一点。红山。' },
  { en: 'WANTED. Primary 4 uniform, Bridge Road Primary. The name tag may stay on.', zh: '征求。桥路小学四年级校服一套。名牌可以不拆。' },
  { en: 'TUITION. Maths and English, Secondary 1 to 4, at your home. Own transport (Route 97).', zh: '补习。中一至中四数学、英文，上门授课。自备交通（97 路）。' },
  { en: 'FOR SALE. Cassette player, plays both sides at once. $15.', zh: '出让。卡带机一台，两面同时放。十五元。' },
  { en: 'LOST. Grey cat, answers to Ah Boy, Woodlands. Also answers to other names.', zh: '寻猫。灰猫一只，叫“阿弟”会应，兀兰走失。叫别的名字也会应。' },
  { en: 'MAHJONG KAKI WANTED. Thursdays, Serangoon. The fourth player keeps changing.', zh: '征麻将脚。逢星期四，实龙岗。第四个人老是换。' },
  { en: 'RENOVATION. Tiles, window grilles, false ceilings. We do not open doors that have been sealed.', zh: '装修。铺瓷砖、装铁花、做假天花。封死的门不开。' },
  { en: 'TAILOR. Alterations while you wait. Hems taken up, years taken off.', zh: '裁缝。立等可取。裤脚改短，年纪改小。' },
  { en: 'FOUND. House keys on a red string, Route 14. The flat number has worn off.', zh: '招领。红绳串钥匙一串，14 路车上拾获。门牌号磨掉了。' },
  { en: 'ROOM TO LET. Toa Payoh, quiet tenant preferred. Previous tenant very quiet.', zh: '房间出租。大巴窑，欢迎安静房客。前任房客非常安静。' },
  { en: 'PHOTO STUDIO. Passport photographs in five minutes. Some customers come out looking younger.', zh: '照相馆。护照照片五分钟取。有的客人照出来年轻几岁。' },
  { en: 'FOR SALE. Wedding album, never used. Serious buyers only.', zh: '出让。结婚相册一本，从没用过。诚意者洽。' },
];

export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];

export function longDate(iso: string): L {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { en: `${WEEK_EN[w]}, ${d} ${MONTHS_EN[m - 1]} ${y}`, zh: `${y} 年 ${m} 月 ${d} 日 · 星期${WEEK_ZH[w]}` };
}
