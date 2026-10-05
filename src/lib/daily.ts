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
  /** A Records Office notice, printed every day. */
  office: L;
  special?: boolean;
  /** Nothing from the archive happened on this day: an ordinary issue. */
  quiet?: boolean;
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
  const days = new Map<string, Omit<Issue, 'no' | 'weather' | 'tide' | 'classifieds' | 'lead' | 'office'> & { leads: Story[] }>();
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
        office: OFFICE[(dayOfYear(x.date) * 5 + (s % 2)) % OFFICE.length],
        special: x.date === '1999-12-31',
        quiet: x.quiet,
      };
    });
}

/** Ordinary days. Small, local, a little odd. */
const QUIET: { head: L; body: L }[] = [
  { head: { en: 'Route 97 runs to timetable', zh: '97 路准点运行' }, body: { en: 'All departures from the Palus Magna depot left on time yesterday. The depot asks passengers not to remark on it.', zh: '昨日大泽车厂所有班次准点发车。车厂请乘客不要特意提起这件事。' } },
  { head: { en: 'Water pressure normal in Silva', zh: '林地水压正常' }, body: { en: 'The Public Utilities Board reports normal pressure in all Silva blocks. Residents of Block 14 say otherwise. The Board has noted them.', zh: '公用事业局报告，林地各座组屋水压正常。第 14 座居民不这么认为，局里已记录在案。' } },
  { head: { en: 'Hawker centre reopens after repainting', zh: '小贩中心油漆完毕，重新开放' }, body: { en: 'The Pons Ruber hawker centre has reopened in the same green as before. Stall numbers are unchanged, apart from 07.', zh: '红桥小贩中心重新开放，墙还是原来的绿色。摊位号都没变，07 号除外。' } },
  { head: { en: 'Lost umbrellas reach record number', zh: '失物雨伞创新高' }, body: { en: 'The Axis lost property office now holds 1,412 umbrellas. Claims may be made in person. Please describe the umbrella.', zh: '中枢失物招领处现存雨伞 1412 把。可本人前来认领，请描述伞的样子。' } },
  { head: { en: 'Serrangon lift inspected, found to be a lift', zh: '实龙岗电梯年检：确为电梯' }, body: { en: 'The annual inspection of lifts in Serrangon was completed without incident. All lifts stopped at the floors shown.', zh: '实龙岗电梯年检顺利完成。所有电梯都停在按下的楼层。' } },
  { head: { en: 'Drain clearing in Collis Ruber', zh: '红丘疏通沟渠' }, body: { en: 'Works continue on the drains along Hill Street. Residents are reminded that the drains are deeper than they look.', zh: '山街沿线沟渠疏通工程继续进行。提醒居民：沟比看上去深。' } },
  { head: { en: 'School term begins quietly', zh: '学校开学，一切平静' }, body: { en: 'Pupils returned to class across the island. Several teachers reported that the register was already filled in.', zh: '全岛学生返校上课。几位老师说，点名簿已经有人先填好了。' } },
  { head: { en: 'Fishing boats return early', zh: '渔船提早回港' }, body: { en: 'Boats at Portus Posterior came in an hour before the tide table said they would. The tide was also early.', zh: '后港渔船比潮汐表早一小时回港。潮水也早了。' } },
  { head: { en: 'New bench at the Axis bus interchange', zh: '中枢巴士转换站添置新长椅' }, body: { en: 'A bench has been installed at Berth 4. It faces the wall. A second bench is planned.', zh: '4 号车位装了一张长椅，朝着墙。第二张长椅已在计划中。' } },
  { head: { en: 'Records Office extends opening hours', zh: '记录署延长办公时间' }, body: { en: 'The public counter will now close at 5.15pm instead of 5pm. The extra quarter hour is for queries about the change.', zh: '公共柜台下班时间由五点改为五点十五分。多出的一刻钟专门用来答复有关这次调整的询问。' } },
  { head: { en: 'Night market moves one street over', zh: '夜市挪到隔壁一条街' }, body: { en: 'The Thursday market in Palus Magna will be held on Market Lane from next week. It is the same market.', zh: '大泽的星期四夜市下周起改在巴刹巷举行。还是那个夜市。' } },
  { head: { en: 'Island-wide fogging exercise', zh: '全岛喷雾灭蚊' }, body: { en: 'Fogging will be carried out block by block this week. Please close your windows. Please do not close them in advance.', zh: '本周逐座组屋喷雾灭蚊。届时请关窗，请不要提前关。' } },
  { head: { en: 'Library adds second dehumidifier', zh: '资料室添置第二台除湿机' }, body: { en: 'The Records Office library has installed another dehumidifier. Staff say the first one seems relieved.', zh: '记录署资料室又装了一台除湿机。职员说，第一台看上去松了口气。' } },
  { head: { en: 'Kopitiam prices unchanged', zh: '咖啡店价格不变' }, body: { en: 'A survey of coffee shops found prices unchanged since March. Kopi is 60 cents. Kopi-O is still being discussed.', zh: '咖啡店价格调查显示，价格自三月以来未变。咖啡六角，黑咖啡还在商量。' } },
  { head: { en: 'Clock tower cleaned', zh: '钟楼清洗完毕' }, body: { en: 'The Palus Magna clock tower was washed on Sunday. The hands were not touched. The time remains as it was.', zh: '大泽钟楼星期天清洗完毕。指针没动，时间还是原来的时间。' } },
  { head: { en: 'Postal deliveries delayed by rain', zh: '大雨延误邮递' }, body: { en: 'Letters for Silva will arrive tomorrow. Letters from Silva arrived yesterday.', zh: '寄往林地的信明天才到。从林地寄出的信，昨天已经到了。' } },
  { head: { en: 'Residents’ committee elects new chair', zh: '居委会选出新主席' }, body: { en: 'The Serrangon residents’ committee has a new chair. She was the only one who stayed to the end of the meeting.', zh: '实龙岗居委会选出新主席。她是唯一一个开会开到最后的人。' } },
  { head: { en: 'Stray dog adopted by bus depot', zh: '巴士车厂收养流浪狗' }, body: { en: 'A brown dog that has slept at the Palus Magna depot since May is now on the staff list. He does not ride Route 97.', zh: '一只五月起睡在大泽车厂的黄狗，正式列入员工名单。它不坐 97 路。' } },
  { head: { en: 'Harbour Row lamps replaced', zh: '港口街换路灯' }, body: { en: 'New street lamps were fitted along Harbour Row. They light the old shoreline as well, which was not in the specification.', zh: '港口街换了新路灯。灯也照到了旧海岸线，这不在设计要求里。' } },
  { head: { en: 'Free eye checks at community centre', zh: '民众联络所免费验眼' }, body: { en: 'The Pons Ruber community centre offers free eye checks on Saturday. Bring your glasses, and the old ones too.', zh: '红桥民众联络所星期六免费验眼。请带上眼镜，旧的也带上。' } },
  { head: { en: 'Durian season ends early', zh: '榴莲季提前结束' }, body: { en: 'Stallholders in Silva report the season over a fortnight early. The trees have not been consulted.', zh: '林地摊贩说，今年榴莲季早结束了两个星期。没人问过树的意见。' } },
  { head: { en: 'Records Office reminds: four digits', zh: '记录署提醒：请写四位数' }, body: { en: 'The Data Section asks all residents to write the year in full on forms. Two digits will be accepted until further notice, reluctantly.', zh: '数据组请各位居民在表格上写完整的年份。另行通知前，两位数仍会受理，但不太情愿。' } },
  { head: { en: 'Ferry timetable reprinted', zh: '渡轮时刻表重印' }, body: { en: 'The new ferry timetable is identical to the old one except for the colour of the paper.', zh: '新渡轮时刻表和旧的一模一样，只是纸的颜色不同。' } },
  { head: { en: 'Badminton hall roof repaired', zh: '羽毛球馆屋顶修好了' }, body: { en: 'The hall in Collis Ruber no longer leaks over Court 3. Court 3 players say the game is not the same.', zh: '红丘羽毛球馆 3 号场不再漏雨。3 号场的球友说，打起来没那个味了。' } },
  { head: { en: 'Quiet day at the Axis', zh: '中枢平静的一天' }, body: { en: 'Nothing was reported to the Records Office today. The Office asks that this not be reported either.', zh: '今天没人向记录署报告任何事。署里请大家也别报告这件事。' } },
  { head: { en: 'Tree pruning on Bridge Road', zh: '桥路修剪行道树' }, body: { en: 'The rain trees along Bridge Road have been pruned. The road signs can now be read from further away. Please read them.', zh: '桥路两旁的雨树修剪过了，路牌在更远处就看得清。请看清楚。' } },
  { head: { en: 'Coin-operated phones to accept new coins', zh: '投币电话将收新硬币' }, body: { en: 'Public telephones will accept the new 20-cent coin from next month. The old coin will continue to work, as it always has.', zh: '公共电话下个月起接受新版二角硬币。旧硬币照样能用，一直都能用。' } },
  { head: { en: 'Choir to sing at Block 7', zh: '合唱团将在第 7 座演唱' }, body: { en: 'The Serrangon community choir will sing in the void deck of Block 7 on Friday. Residents of the third floor are especially welcome.', zh: '实龙岗社区合唱团星期五在第 7 座楼下空地演唱。特别欢迎三楼住户。' } },
];

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
