/**
 * Who lives in the flats. Nothing is stored: a household is worked out from
 * the postcode, the floor and the door, so every visitor sees the same
 * neighbours on the same corridor. The names come from src/data/gerimis/people.ts.
 *
 * Also here: the letters in your letterbox (addressed to whoever had the flat
 * before you), and the notices on the board at the void deck.
 */
import { CHINESE, EURASIAN, INDIAN, INITIALS, JOBS, MALAY, POSTCARD_FROM, type L } from '../../data/gerimis/people';
import { islandNow } from '../island';
import { doorText } from './home';
import { hash, normCode, rng, type Home, type Visitor } from './store';

type Door = Pick<Home, 'postcode' | 'floor' | 'stack'>;

export interface Household {
  /** As the letterbox prints it: "TAN K.S.", "OSMAN B. HASHIM". */
  plate: string;
  /** How a neighbour says it in Chinese: 陈家, 哈欣家. */
  zh: string;
  /** "Mr Tan", "Encik Hashim", for the notices. */
  title: L;
  size: number;
  job: L;
  /** Moved in that year. */
  since: number;
}

const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

function makeHousehold(r: () => number, built: number): Household {
  const k = r();
  const since = Math.min(1999, built + Math.floor(r() * (2000 - built)));
  const size = 1 + Math.floor(r() * r() * 6);
  const job = pick(r, JOBS);
  if (k < 0.74) {
    const [s, z] = pick(r, CHINESE);
    const a = INITIALS[Math.floor(r() * INITIALS.length)], b = INITIALS[Math.floor(r() * INITIALS.length)];
    return { plate: `${s} ${a}.${b}.`, zh: `${z}家`, title: { en: `Mr ${s[0]}${s.slice(1).toLowerCase()}`, zh: `${z}先生` }, size, job, since };
  }
  if (k < 0.88) {
    // "SAMAD B. AZIZ" is Samad, son of Aziz: you call him Encik Samad
    const [s] = pick(r, MALAY);
    let [f, z] = pick(r, MALAY);
    if (f === s) [f, z] = MALAY[(MALAY.findIndex((x) => x[0] === s) + 1) % MALAY.length];
    const cap = (x: string) => x[0] + x.slice(1).toLowerCase();
    return { plate: `${f} B. ${s}`, zh: `${z}家`, title: { en: `Encik ${cap(f)}`, zh: `${z}大叔` }, size, job, since };
  }
  if (k < 0.97) {
    const [s, z] = pick(r, INDIAN);
    const a = INITIALS[Math.floor(r() * INITIALS.length)];
    return { plate: `${a}. ${s}`, zh: `${z}家`, title: { en: `Mr ${s[0]}${s.slice(1).toLowerCase()}`, zh: `${z}先生` }, size, job, since };
  }
  const [s, z] = pick(r, EURASIAN);
  return { plate: s, zh: `${z}家`, title: { en: `Mrs ${s.toLowerCase().replace(/(^|[\s'])\w/g, (c) => c.toUpperCase())}`, zh: `${z}太太` }, size, job, since };
}

/** The household behind a door. Some flats stand empty for a while. */
export function household(d: Door, built = 1975): Household | null {
  const r = rng(hash(`house#${d.postcode}#${d.floor}#${d.stack}`));
  if (r() < 0.06) return null;
  return makeHousehold(r, built);
}

/**
 * Whoever had your flat before you, and the year they moved out (1997–1999).
 * A block finished in 1996 or later has had nobody before you: null.
 */
export function previousTenant(d: Door, built = 1975): (Household & { left: number }) | null {
  if (built >= 1996) return null;
  const r = rng(hash(`prev#${d.postcode}#${d.floor}#${d.stack}`));
  const h = makeHousehold(r, built);
  const left = 1997 + (hash(`left#${d.postcode}#${d.stack}`) % 3);
  // they stayed at least three years
  const since = Math.min(h.since, left - 3);
  return { ...h, since: Math.max(built, since), left };
}

/* ---------- the letterbox ---------- */

export interface Letter {
  kind: 'note' | 'office' | 'bill' | 'postcard' | 'paper' | 'clinic' | 'draw' | 'licence';
  /** Who it is from, as printed or written. */
  from: L;
  /** Who it is to, as written on the front. */
  to: string;
  /** Postmark, dd.mm.yy. */
  date: string;
  /** The letter itself; paragraphs split on blank lines. */
  body: L;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dd = (n: number) => String(n).padStart(2, '0');

/** Where people moved to. New towns of the late nineties, mostly. */
const MOVED_TO: L[] = [
  { en: 'Tampines', zh: '淡滨尼' }, { en: 'Pasir Ris', zh: '巴西立' }, { en: 'Jurong West', zh: '裕廊西' },
  { en: 'Woodlands', zh: '兀兰' }, { en: 'Sengkang', zh: '盛港' }, { en: 'Bukit Panjang', zh: '武吉班让' },
  { en: 'Choa Chu Kang', zh: '蔡厝港' }, { en: 'Yishun', zh: '义顺' },
];

/** Who writes postcards: [signs as, in Chinese]. */
const SENDERS: L[] = [
  { en: 'Your sister, Mei Ling', zh: '妹妹 美玲' }, { en: 'Ah Kow and family', zh: '阿九一家' },
  { en: 'Your cousin Siti', zh: '表妹 茜蒂' }, { en: 'Uncle Raju', zh: '拉朱舅舅' }, { en: 'Your old colleague, Doris', zh: '老同事 桃丽丝' },
];

type Card = (place: L, to: L, sign: L) => L;
const POSTCARDS: Card[] = [
  (p, to, s) => ({
    en: `Dear ${to.en},\n\nWe arrived in ${p.en} on Tuesday after nine hours on the coach. The hotel is clean but the air-con only has two settings, off and freezing. Yesterday we went to the market and Ma bought so much dried seafood that we had to buy another bag to carry it home.\n\nWe come back on the 14th. Please water the plants on the corridor if you can, the key is with the neighbour as usual.\n\n${s.en}`,
    zh: `${to.zh}：\n\n我们礼拜二到了${p.zh}，坐了九个钟头的长途巴士。酒店还算干净，就是冷气只有两档，一档关、一档冻死人。昨天去逛巴刹，妈买了一大堆海味，结果还得另外买个袋子装回来。\n\n14 号回。走廊上的花有空帮忙浇一下，钥匙照旧放在隔壁。\n\n${s.zh}`,
  }),
  (p, to, s) => ({
    en: `Dear ${to.en},\n\nGreetings from ${p.en}. The weather here is cooler than at home, so bring a jacket if you ever come. The buses are even later than ours, which I did not think was possible.\n\nI have started the new job at the hospital. The hours are long but the canteen is cheap. Please give my regards to the auntie downstairs who always asked about me.\n\n${s.en}`,
    zh: `${to.zh}：\n\n从${p.zh}寄来问候。这里比家里凉，你哪天要来记得带外套。这里的巴士比我们那边还迟，我本来以为不可能。\n\n我已经在医院上班了，工时长，不过食堂便宜。帮我问候楼下那位老是问起我的阿姨。\n\n${s.zh}`,
  }),
  (p, to, s) => ({
    en: `Dear ${to.en},\n\nThe wedding in ${p.en} was very long: eight courses and nine speeches, and the bride's uncle sang twice. Everyone asked when you are coming to visit. I said you are busy, which is true.\n\nI bought the biscuits you wanted. The tin is bigger than the biscuits, but the tin is nice, you can keep buttons in it.\n\n${s.en}`,
    zh: `${to.zh}：\n\n${p.zh}的喜酒吃得很长，八道菜、九个人讲话，新娘的舅舅还上台唱了两首。大家都问你什么时候来，我说你忙，这也是真的。\n\n你要的饼干买了。铁罐比饼干大，不过罐子好看，以后可以装纽扣。\n\n${s.zh}`,
  }),
  (p, to, s) => ({
    en: `Dear ${to.en},\n\nJust a short card from ${p.en}. Did you remember to pay the water bill? It was due on the 20th and I left the bill on the fridge under the magnet shaped like a durian.\n\nDon't wait for me to come back to do it, the late charge is two dollars. Everything here is fine, the food is too oily but I am eating anyway.\n\n${s.en}`,
    zh: `${to.zh}：\n\n从${p.zh}寄张卡片给你。水费交了没有？20 号截止，单子我压在冰箱门上那个榴莲形状的磁铁下面。\n\n别等我回来才交，迟交要罚两块钱。这里一切都好，东西太油，不过我照吃。\n\n${s.zh}`,
  }),
];

/**
 * Three or four letters, the same ones every time you look.
 *
 * New arrivals and residents: the flat had someone else in it until a year or
 * two ago, and not everyone has their new address yet, so their post still
 * comes here. They left a note for whoever came next.
 *
 * Born on the island: this is the flat you grew up in. It stood empty after
 * your family moved out, and the estate office kept the post that came for
 * you; now that you are back they have put it in your box.
 */
export function letters(v: Pick<Visitor, 'code' | 'origin' | 'home'>, built = 1975): Letter[] {
  const h = v.home;
  if (!h) return [];
  const prevT = previousTenant(h, built), prev = prevT;
  const r = rng(hash(`mail#${h.postcode}#${h.floor}#${h.stack}#${v.origin ?? 'N'}`));
  const now = islandNow();
  const pastDay = () => {
    // some day before today, this year
    const m = Math.floor(r() * (now.month + 1));
    const d = m === now.month ? 1 + Math.floor(r() * Math.max(1, now.day - 1)) : 1 + Math.floor(r() * 28);
    return { m, d };
  };
  const door = doorText(h);
  const me = normCode(v.code).toUpperCase() || 'RESIDENT';
  const born = v.origin === 'G';
  // a new block: nobody had the flat before you, the post is all yours
  const fresh = !born && !prev;
  const to = born || !prev ? me : prev.plate;
  const toName: L = born || !prev ? { en: me, zh: me } : prev.title;
  const moved = pick(r, MOVED_TO);
  const acct = `${dd(Math.floor(r() * 90) + 10)}-${String(Math.floor(r() * 1e6)).padStart(6, '0')}`;
  const out: Letter[] = [];

  const noteDate = () => {
    if (!prev) return '';
    if (prev.left < 1999) return `${dd(1 + Math.floor(r() * 28))}.${dd(1 + Math.floor(r() * 12))}.${dd(prev.left % 100)}`;
    const { m, d } = pastDay();
    return `${dd(d)}.${dd(m + 1)}.99`;
  };
  const note = (prev: NonNullable<typeof prevT>): Letter => ({
    kind: 'note', from: prev.title, to: 'THE NEW OCCUPANT', date: noteDate(),
    body: {
      en: `To whoever lives in ${door} now,\n\nWe lived here from ${prev.since} and moved to ${moved.en} in ${prev.left}. We have told most people the new address, but some letters will still come here for a while.\n\nIf you see any addressed to ${prev.plate}, please write "Moved, return to sender" on the envelope and drop it back in the red postbox downstairs. The postman will take care of it. You do not need to keep anything for us.\n\nTwo things about the flat: the kitchen tap drips if you turn it all the way, so turn it back a little. And the switch by the door is for the corridor light, not yours.\n\nThank you, and all the best in the new place.\n${prev.title.en}`,
      zh: `给现在住在 ${door} 的人：\n\n我们从 ${prev.since} 年住到 ${prev.left} 年，后来搬去${moved.zh}。新地址大部分人都知道了，不过还会有些信寄到这里来，过一阵子才会停。\n\n要是看到寄给 ${prev.plate} 的信，麻烦在信封上写「已搬迁，退回寄件人」，丢回楼下的红色邮筒就好，邮差会处理。不用替我们留着什么。\n\n屋子有两件事说一下：厨房的水龙头开到底会滴水，往回拧一点就好。门边那个开关是走廊的灯，不是你家的。\n\n谢谢，祝你住得开心。\n${prev.title.zh}`,
    },
  });

  const office = (): Letter => ({
    kind: 'office', from: { en: 'Estate office', zh: '组屋管理处' }, to, date: `${dd(now.day)}.${dd(now.month + 1)}.99`,
    body: {
      en: `Dear resident,\n\nWelcome back to Blk ${h.blk}. Our records show your family lived in ${door} before, and that the flat stood empty for some time after you moved out.\n\nDuring that time a few items of post addressed to you by name were returned to this office. We kept them in case anyone came back for them, and have put them in your letterbox together with this note.\n\nThe utilities account for the flat has been reopened in your name. If anything in the flat needs repair, please come to the estate office counter, Monday to Friday, 9 am to 5 pm, and ask for form B.\n\nEstate office`,
      zh: `住户您好：\n\n欢迎回到 ${h.blk} 座。记录显示您家以前住在 ${door}，搬走以后这个单位空了一段时间。\n\n那段时间里，有几封写着您名字的信被退回管理处。我们一直替您收着，想着说不定有人会回来拿，现在连同这张条子一起放进您的信箱。\n\n这个单位的水电户口已经改回您的名下。屋里有什么要修的，请礼拜一到礼拜五早上九点到下午五点来管理处柜台，跟我们拿 B 表。\n\n组屋管理处`,
    },
  });

  const welcome = (): Letter => ({
    kind: 'office', from: { en: 'Estate office', zh: '组屋管理处' }, to, date: `${dd(now.day)}.${dd(now.month + 1)}.99`,
    body: {
      en: `Dear resident,\n\nWelcome to Blk ${h.blk}. The block was completed in ${built}, and ${door} has not been lived in before, so you may still find some dust from the builders in the corners.\n\nDefects found in the first twelve months, such as cracked tiles, doors that do not close or leaking pipes, will be repaired free of charge. Please report them at the estate office counter, Monday to Friday, 9 am to 5 pm, using form B.\n\nThe utilities account has been opened in your name. Your first bill will include a deposit.\n\nEstate office`,
      zh: `住户您好：\n\n欢迎搬进 ${h.blk} 座。这座楼 ${built} 年才建好，${door} 之前没人住过，角落里可能还有些工人留下的灰。\n\n头十二个月里发现的毛病，比如瓷砖裂、门关不上、水管漏水，一律免费维修。请礼拜一到礼拜五早上九点到下午五点到管理处柜台，用 B 表报修。\n\n水电户口已经开在您的名下，第一张账单会包括按金。\n\n组屋管理处`,
    },
  });

  const bill = (): Letter => {
    const { m, d } = pastDay();
    const kwh = 180 + Math.floor(r() * 260), m3 = 12 + Math.floor(r() * 18);
    const el = kwh * 0.16, wa = m3 * 1.17, re = 6.5, tot = (el + wa + re).toFixed(2);
    const due = Math.min(28, d + 21);
    const tail: L = born
      ? { en: 'This account was reopened on your return. A deposit of $40.00 will appear on your next bill.', zh: '此户口已于您迁回时重新开立，下期账单将加收按金 40.00 元。' }
      : !prev
      ? { en: 'This is the first bill for this account. A deposit of $40.00 has been included and will be refunded when the account is closed.', zh: '这是本户口的第一张账单，已包括按金 40.00 元，户口结束时退还。' }
      : { en: `This account is still registered to ${prev.plate}. If you are the new occupant, please bring your tenancy papers to any Utilities Board office so that the account can be transferred to your name.`, zh: `此户口仍登记在 ${prev.plate} 名下。如您是新住户，请携带租住文件到任何一间公用事业局办事处办理过户。` };
    return { kind: 'bill', from: { en: 'Gerimis Utilities Board', zh: '霏微公用事业局' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: {
        en: `Account ${acct}, ${door}\nBill for ${MON[m]} 1999\n\nElectricity, ${kwh} kWh: $${el.toFixed(2)}\nWater, ${m3} cubic metres: $${wa.toFixed(2)}\nRefuse collection: $${re.toFixed(2)}\nTotal due: $${tot}\n\nPlease pay by ${due} ${MON[m]} at any post office or Utilities Board office. A late charge of $2.00 applies after that date. Disregard this notice if you have already paid.\n\n${tail.en}`,
        zh: `户口 ${acct}，${door}\n1999 年 ${m + 1} 月账单\n\n电费，${kwh} 度：${el.toFixed(2)} 元\n水费，${m3} 立方米：${wa.toFixed(2)} 元\n垃圾清理费：${re.toFixed(2)} 元\n应缴总额：${tot} 元\n\n请于 ${m + 1} 月 ${due} 日前到任何邮局或公用事业局办事处缴付，逾期加收 2 元。已缴付者请勿理会。\n\n${tail.zh}`,
      } };
  };

  const postcard = (): Letter => {
    const { m, d } = pastDay();
    const place = pick(r, POSTCARD_FROM);
    return { kind: 'postcard', from: place, to, date: `${dd(d)}.${dd(m + 1)}.99`, body: pick(r, POSTCARDS)(place, toName, pick(r, SENDERS)) };
  };

  // to you, when you were small: a birthday card from an aunt
  const oldCard = (): Letter => {
    const yr = 84 + Math.floor(r() * 10), place = pick(r, POSTCARD_FROM);
    return { kind: 'postcard', from: place, to, date: `${dd(1 + Math.floor(r() * 28))}.${dd(1 + Math.floor(r() * 12))}.${dd(yr)}`,
      body: {
        en: `Dear ${me},\n\nHappy birthday! Auntie is in ${place.en} this month for work, so I cannot come to your party. Inside the card there is a red packet, ask your mother to keep it for you and do not spend it all on sweets.\n\nBe good in school and listen to your teacher. When I come back I will bring you the coconut candy you like.\n\nLove, Auntie Swee`,
        zh: `${me}：\n\n生日快乐！阿姨这个月在${place.zh}出差，不能去你的生日会了。卡片里夹了一个红包，叫妈妈帮你收好，不要全拿去买糖。\n\n在学校要乖，要听老师的话。阿姨回来给你带你最爱吃的椰子糖。\n\n瑞姨`,
      } };
  };

  const paper = (): Letter => {
    const { m, d } = pastDay();
    const end = Math.min(28, d + 14);
    return { kind: 'paper', from: { en: 'The Gerimis Daily, circulation', zh: '霏微日报发行部' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: {
        en: !prev && !born ? `Dear new resident,\n\nWelcome to Blk ${h.blk}. The Gerimis Daily can be delivered to ${door} every morning before 6.30 for $27.00 for three months, paid to your newsagent or at our counter in the Axis. The Sunday edition with the cinema listings and the classifieds is included.\n\nThis offer needs no reply if you are not interested.` : `Dear reader,\n\nYour three-month home delivery subscription ends on ${end} ${MON[m]} 1999. To keep receiving the paper at ${door} every morning before 6.30, please pay $27.00 to your newsagent, or at our counter in the Axis, before that date.\n\nThe Sunday edition with the cinema listings and the classifieds is included at no extra charge.\n\nIf you no longer wish to receive the paper, no action is needed. Delivery will stop on its own.`,
        zh: !prev && !born ? `新住户您好：\n\n欢迎搬进 ${h.blk} 座。《霏微日报》可以每天早上六点半以前送到 ${door}，三个月 27 元，交给您的报贩或到我们在中枢的柜台缴付都可以。星期天那份有戏院场次和分类广告，不另收费。\n\n没兴趣的话不必回复。` : `读者您好：\n\n您订的三个月送报服务将于 1999 年 ${m + 1} 月 ${end} 日到期。如要继续每天早上六点半以前收到报纸，请在到期前把 27 元交给您的报贩，或到我们在中枢的柜台缴付。\n\n星期天那份附有戏院场次和分类广告，不另收费。\n\n如不再订阅，无须办理任何手续，到期自动停送。`,
      } };
  };

  const clinic = (): Letter => {
    const { m, d } = pastDay();
    const ad = Math.min(28, d + 10);
    return { kind: 'clinic', from: { en: 'Polyclinic, appointments', zh: '综合诊疗所预约处' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: {
        en: `Appointment reminder\n\nDate: ${ad} ${MON[m]} 1999, 9.40 am\nPlace: Counter 4, second floor\nFor: blood pressure review\n\nPlease bring this letter, your identity card and any medicine you are taking. Do not eat or drink anything except plain water after midnight the night before, as a blood test may be done.\n\nIf you cannot come, please call the appointment line at 355 1099 at least one day before so the slot can be given to someone else. Our records show this address; if you have moved, please update it at the registration counter on your next visit.`,
        zh: `复诊提醒\n\n日期：1999 年 ${m + 1} 月 ${ad} 日上午九点四十分\n地点：二楼 4 号柜台\n事由：血压复查\n\n请带这封信、身份证和正在吃的药。可能要验血，前一晚十二点以后除了白开水什么都不要吃喝。\n\n如果不能来，请至少提前一天打预约热线 355 1099，好把时段让给别人。我们的记录是这个地址；如已搬家，下次来时请到挂号处更改。`,
      } };
  };

  const draw = (): Letter => {
    const { m, d } = pastDay();
    const no = String(Math.floor(r() * 10000)).padStart(4, '0');
    const surname = pick(r, CHINESE);
    // an old block's shop has been there for years; a new one has just opened
    const open = Math.max(built, 1979);
    const old = 1999 - open >= 5;
    const head: L = old ? { en: `${1999 - open}th anniversary lucky draw`, zh: `开业 ${1999 - open} 周年幸运抽奖` } : { en: 'Grand opening lucky draw', zh: '开张幸运抽奖' };
    const thanks: L = old
      ? { en: `Thank you for shopping with us at the foot of Blk ${h.blk} since ${open}.`, zh: `多谢各位街坊自 ${open} 年起在 ${h.blk} 座楼下光顾本店。` }
      : { en: `We have just opened at the foot of Blk ${h.blk}: rice, eggs, canned food, soap, gas cylinders and newspapers, 7 am to 10 pm every day.`, zh: `本店刚在 ${h.blk} 座楼下开张：米、蛋、罐头、肥皂、煤气、报纸都有，每天早上七点到晚上十点。` };
    return { kind: 'draw', from: { en: `${surname[0][0]}${surname[0].slice(1).toLowerCase()} Brothers Provision Shop`, zh: `${surname[1]}兄弟杂货店` }, to: 'THE OCCUPIER', date: `${dd(d)}.${dd(m + 1)}.99`,
      body: {
        en: `${head.en}\n\n${thanks.en} Every household in the block gets one free ticket. Your number is ${no}.\n\nFirst prize: a rice cooker. Second prize: a 10 kg bag of rice. Ten consolation prizes: a box of instant noodles each.\n\nThe draw is on the 9th at 7 pm in front of the shop. Results will be pasted on the shop door the next morning. Bring this ticket to collect your prize within two weeks.`,
        zh: `${head.zh}\n\n${thanks.zh}本座每户送奖券一张，您的号码是 ${no}。\n\n头奖：电饭锅一个。二奖：白米一包，10 公斤。安慰奖十名：快熟面一箱。\n\n9 号晚上七点在店门口开奖，第二天早上把结果贴在店门上。中奖的请在两个礼拜内凭券领奖。`,
      } };
  };

  const licence = (): Letter => {
    const { m, d } = pastDay();
    return { kind: 'licence', from: { en: 'Television licence office', zh: '电视执照处' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: {
        en: `Renewal notice\n\nThe television licence for ${door} expires at the end of ${MON[(m + 1) % 12]}. The fee for one year is $110.00 and covers every set in the household.\n\nYou may pay at any post office counter with this notice. If you no longer have a television set at this address, please fill in the form on the back and return it, so that we stop sending reminders.`,
        zh: `续领通知\n\n${door} 的电视执照将于 ${((m + 1) % 12) + 1} 月底到期。一年执照费 110 元，家里有几台电视都包括在内。\n\n请带着这张通知到任何一间邮局柜台缴费。如果这个地址已经没有电视机，请填好背面的表格寄回，我们就不再寄提醒来。`,
      } };
  };

  if (born) {
    out.push(office(), oldCard(), bill());
  } else if (prev) {
    out.push(note(prev), bill(), r() < 0.5 ? postcard() : paper());
  } else {
    out.push(welcome(), bill(), draw());
  }
  if (r() < 0.75) out.push(pick(r, fresh ? [paper, licence] : [clinic, draw, licence])());
  return out;
}

/* ---------- the notice board at the void deck ---------- */

export interface Notice { head: L; text: L; by: L }

/** Two or three notices, from neighbours in the same block, changing week to week. */
export function notices(d: Door & { blk?: string }, built = 1975): Notice[] {
  const now = islandNow();
  const week = Math.floor((now.month * 31 + now.day) / 7);
  const r = rng(hash(`board#${d.postcode}#${week}`));
  const blk = d.blk ?? '';
  const someone = () => {
    for (let k = 0; k < 6; k++) {
      const door = { ...d, floor: 2 + Math.floor(r() * 10), stack: Math.floor(r() * 8) };
      const h = household(door, built);
      if (h) return { h, door: doorText(door) };
    }
    return null;
  };
  // a day later this month, for things that are coming up
  const soon = () => {
    const t = new Date(Date.UTC(1999, now.month, now.day + 2 + Math.floor(r() * 6)));
    return { day: t.getUTCDate(), mon: MON[t.getUTCMonth()], m1: t.getUTCMonth() + 1 };
  };
  const office: L = { en: 'Estate office, tel. 258 4410', zh: '组屋管理处，电话 258 4410' };
  const pool: (() => Notice | null)[] = [
    () => { const s = someone(); return s && {
      head: { en: 'Lost cat', zh: '寻猫' },
      text: { en: `Grey tabby, female, about four years old, red collar with a small bell. Her name is Mimi but she does not come when called. She slipped out on the ${Math.max(1, now.day - 2)}th and was last seen near the bicycle racks. If you see her, please do not chase her; tell us and we will come down.`, zh: `灰色虎斑母猫，四岁左右，戴红色项圈，有个小铃铛。名叫咪咪，不过叫它不会来。${Math.max(1, now.day - 2)} 号溜出去的，最后在脚车架那边看到。看到的话请别追，告诉我们，我们下来抓。` },
      by: { en: `${s.h.title.en}, ${s.door}`, zh: `${s.door} ${s.h.title.zh}` } }; },
    () => { const s = someone(); return s && {
      head: { en: 'Wedding at the void deck', zh: '楼下办喜事' },
      text: { en: `Our son is getting married. The tentage will go up on Friday evening and come down on Sunday morning, so the void deck will be partly blocked and there will be some noise on Saturday night. Sorry for the trouble. All neighbours are welcome to come and eat, dinner from 7 pm.`, zh: `我们家儿子结婚。礼拜五晚上搭棚，礼拜天早上拆，这几天楼下会挡住一半，礼拜六晚上会比较吵，请多包涵。欢迎各位街坊下来吃，晚饭七点开始。` },
      by: { en: `The ${s.h.plate} family, ${s.door}`, zh: `${s.door} ${s.h.zh}` } }; },
    () => { const s = someone(); return s && {
      head: { en: 'Tuition', zh: '补习' },
      text: { en: `Maths and science for Primary 4 to 6, in small groups of three or four, at my flat on weekday evenings. $60 a month for one lesson a week. I am a retired teacher with twenty years' experience and I am patient. Come to the door and ask, any evening after 7.`, zh: `小四到小六的数学和科学，三四个人一班，平日晚上在我家上。每星期一堂，每个月 60 元。我是退休老师，教了二十年，很有耐心。晚上七点以后上门来问就可以。` },
      by: { en: `${s.h.title.en}, ${s.door}`, zh: `${s.door} ${s.h.title.zh}` } }; },
    () => { const { day, mon, m1 } = soon(); return {
      head: { en: 'Lift servicing', zh: '电梯保养' },
      text: { en: `The lifts of Blk ${blk} will be serviced on ${day} ${mon}, one at a time, from 10 am to 2 pm. At least one lift will be running at all times, but please expect a longer wait. Residents who need help with heavy items on that day may call the estate office.`, zh: `${blk} 座的电梯将于 ${m1} 月 ${day} 日上午十点到下午两点轮流保养，任何时候至少有一部在开，不过要多等一会儿。当天要搬重东西需要帮忙的住户，请打电话给管理处。` },
      by: office }; },
    () => { const { day, mon, m1 } = soon(); return {
      head: { en: 'Water supply interruption', zh: '暂停供水' },
      text: { en: `The water tanks on the roof of Blk ${blk} will be cleaned on ${day} ${mon}. Water will be off from 9 am to 12 noon. Please store enough water the night before. When the supply comes back the water may look brown for a few minutes; let the tap run until it is clear.`, zh: `${m1} 月 ${day} 日清洗 ${blk} 座屋顶水箱，上午九点到中午十二点停水，请前一晚先储水。恢复供水时，头几分钟的水可能是黄的，开着水龙头放到清了再用。` },
      by: office }; },
    () => { const { day, mon, m1 } = soon(); return {
      head: { en: 'Fogging against mosquitoes', zh: '喷药防蚊' },
      text: { en: `There have been cases of dengue fever in the estate. The drains and void decks will be fogged on ${day} ${mon} between 5 and 7 pm. Please close your windows and take in your laundry during that time. Check your flower pots and pails for standing water once a week.`, zh: `本区出现了骨痛热症病例。${m1} 月 ${day} 日下午五点到七点会在沟渠和楼下喷药，那段时间请关窗、收衣服。每星期检查一次花盆和水桶，不要积水。` },
      by: office }; },
    () => ({
      head: { en: 'Killer litter', zh: '高空抛物' },
      text: { en: `Last week a flower pot fell from an upper floor and broke on the walkway next to the playground. Nobody was hurt this time. Please do not leave pots, bottles or anything loose on the ledge outside your window, and never throw anything down. It is dangerous and it is an offence.`, zh: `上礼拜有个花盆从楼上掉下来，砸在游乐场旁边的走道上，这次没人受伤。请不要把花盆、瓶子或其他东西放在窗外的台子上，更不要往下丢东西。这很危险，也是犯法的。` },
      by: office }),
    () => { const s = someone(); return s && {
      head: { en: 'Found', zh: '失物招领' },
      text: { en: `A bunch of three keys on a ring with a plastic durian, found on the bench at the void deck on the ${Math.max(1, now.day - 1)}th. If it is yours, come to my flat and tell me what the keyring looks like.`, zh: `${Math.max(1, now.day - 1)} 号在楼下石凳上捡到一串钥匙，三把，钥匙圈上挂着一个塑料榴莲。是你的就来我家，说说钥匙圈什么样子，就还你。` },
      by: { en: `${s.h.title.en}, ${s.door}`, zh: `${s.door} ${s.h.title.zh}` } }; },
    () => ({
      head: { en: 'Karaoke night', zh: '卡拉 OK 晚会' },
      text: { en: `The residents' committee invites everyone to a karaoke night at the void deck this Saturday from 7 to 10 pm. Free drinks and curry puffs. To keep it fair, each person sings one song and then passes the microphone on. Sign up at the table on the night.`, zh: `居民委员会请大家礼拜六晚上七点到十点到楼下唱卡拉 OK，有免费饮料和咖喱角。为了公平，每人唱一首就把麦克风传下去。当晚在桌子那边报名。` },
      by: { en: 'Residents\' committee', zh: '居民委员会' } }),
  ];
  const order = pool.map((f, i) => ({ f, k: hash(`${week}#${d.postcode}#${i}`) })).sort((a, b) => a.k - b.k);
  const out: Notice[] = [];
  for (const { f } of order) {
    const n = f();
    if (n) out.push(n);
    if (out.length >= 2 + (week % 2)) break;
  }
  return out;
}
