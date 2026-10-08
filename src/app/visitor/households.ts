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
    const [s, z] = pick(r, MALAY), [f] = pick(r, MALAY);
    const cap = (x: string) => x[0] + x.slice(1).toLowerCase();
    return { plate: `${f === s ? 'MOHD.' : f} B. ${s}`, zh: `${z}家`, title: { en: `Encik ${cap(s)}`, zh: `${z}大叔` }, size, job, since };
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

/** Whoever had your flat before you, until they moved out. */
export function previousTenant(d: Door, built = 1975): Household & { left: number } {
  const h = makeHousehold(rng(hash(`prev#${d.postcode}#${d.floor}#${d.stack}`)), built);
  return { ...h, left: Math.min(1999, Math.max(h.since + 1, 1997 + (hash(`left#${d.postcode}#${d.stack}`) % 3))) };
}

/* ---------- the letterbox ---------- */

export interface Letter {
  kind: 'bill' | 'postcard' | 'paper' | 'clinic' | 'draw' | 'licence';
  /** Who it is from, as printed or written. */
  from: L;
  /** Who it is to, as written on the front. */
  to: string;
  /** Postmark, dd.mm.yy. */
  date: string;
  body: L;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dd = (n: number) => String(n).padStart(2, '0');

const POSTCARDS: L[] = [
  { en: 'Weather fine, food too oily. Back on the 14th. Water the plants.', zh: '天气好，东西太油。14 号回。记得浇花。' },
  { en: 'The buses here are late also. Regards to Auntie downstairs.', zh: '这里的巴士也一样迟。替我问候楼下阿姨。' },
  { en: 'Bought the biscuits you said. The tin is bigger than the biscuits.', zh: '你说的饼干买了。铁罐比饼干大。' },
  { en: 'Cousin\'s wedding very long. Eight courses, nine speeches.', zh: '表哥的婚宴很长。八道菜，九个人讲话。' },
  { en: 'Did you pay the water bill? Don\'t wait for me.', zh: '水费交了没？不用等我回来。' },
];

/**
 * Two or three letters, the same ones every time you look. Born on the island:
 * the flat is the one you grew up in, so one old postcard is to you. Otherwise
 * they are to whoever had the flat before you.
 */
export function letters(v: Pick<Visitor, 'code' | 'origin' | 'home'>, built = 1975): Letter[] {
  const h = v.home;
  if (!h) return [];
  const prev = previousTenant(h, built);
  const r = rng(hash(`mail#${h.postcode}#${h.floor}#${h.stack}#${v.origin ?? 'N'}`));
  const now = islandNow();
  const pastDay = () => {
    // some day before today, this year
    const m = Math.floor(r() * (now.month + 1));
    const d = m === now.month ? 1 + Math.floor(r() * Math.max(1, now.day - 1)) : 1 + Math.floor(r() * 28);
    return { m, d };
  };
  const to = v.origin === 'G' ? 'THE OCCUPIER' : prev.plate;
  const out: Letter[] = [];
  const bill = (): Letter => {
    const { m, d } = pastDay();
    const amt = (18 + r() * 70).toFixed(2);
    return { kind: 'bill', from: { en: 'Gerimis Utilities Board', zh: '霏微公用事业局' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: { en: `Water and electricity, ${MON[m]} 1999: $${amt}. Please pay at any post office by the end of the month. Disregard if paid.`, zh: `1999 年 ${m + 1} 月水电费：${amt} 元。请于月底前到任何邮局缴付。已缴付者请勿理会。` } };
  };
  const postcard = (yr = 99): Letter => {
    const { m, d } = pastDay();
    const place = pick(r, POSTCARD_FROM);
    return { kind: 'postcard', from: place, to, date: `${dd(d)}.${dd(m + 1)}.${dd(yr)}`, body: pick(r, POSTCARDS) };
  };
  const paper = (): Letter => {
    const { m, d } = pastDay();
    return { kind: 'paper', from: { en: 'The Gerimis Daily', zh: '霏微日报' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: { en: `Still in its wrapper, ${d} ${MON[m]}. The subscription was not cancelled.`, zh: `${m + 1} 月 ${d} 日那份，塑料套还没拆。订阅没人去取消。` } };
  };
  const clinic = (): Letter => {
    const { m, d } = pastDay();
    return { kind: 'clinic', from: { en: 'Polyclinic, appointments', zh: '综合诊疗所预约处' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: { en: `Appointment: ${d} ${MON[m]}, 9.40 am. Bring this card and your identity card. Missed.`, zh: `预约：${m + 1} 月 ${d} 日上午九点四十分。请带此卡和身份证。（没去）` } };
  };
  const draw = (): Letter => {
    const { m, d } = pastDay();
    return { kind: 'draw', from: { en: 'Provision shop lucky draw', zh: '杂货店幸运抽奖' }, to: 'THE OCCUPIER', date: `${dd(d)}.${dd(m + 1)}.99`,
      body: { en: `Ticket ${String(Math.floor(r() * 10000)).padStart(4, '0')}. Draw on the 9th. Prize: one rice cooker, slightly used.`, zh: `奖券 ${String(Math.floor(r() * 10000)).padStart(4, '0')} 号。9 号开奖。奖品：电饭锅一个，稍旧。` } };
  };
  const licence = (): Letter => {
    const { m, d } = pastDay();
    return { kind: 'licence', from: { en: 'Television licence office', zh: '电视执照处' }, to, date: `${dd(d)}.${dd(m + 1)}.99`,
      body: { en: 'Your television licence is due for renewal. A set that is switched on is a set that is licensed.', zh: '电视执照到期，请续领。开着的电视机，就要有执照。' } };
  };
  if (v.origin === 'G') {
    // the flat you grew up in: a card to you, from years ago, never collected
    const yr = 85 + Math.floor(r() * 12);
    out.push({ ...postcard(yr), to: normCode(v.code).toUpperCase() || 'YOU' });
    out.push(bill());
  } else {
    out.push(bill());
    out.push(r() < 0.5 ? postcard() : paper());
  }
  if (r() < 0.7) out.push(pick(r, [clinic, draw, licence])());
  return out;
}

/* ---------- the notice board at the void deck ---------- */

export interface Notice { by: L; text: L }

/** Two or three notices, from neighbours in the same block, changing week to week. */
export function notices(d: Door, built = 1975): Notice[] {
  const now = islandNow();
  const week = Math.floor((now.month * 31 + now.day) / 7);
  const r = rng(hash(`board#${d.postcode}#${week}`));
  const someone = () => {
    for (let k = 0; k < 6; k++) {
      const door = { ...d, floor: 2 + Math.floor(r() * 10), stack: Math.floor(r() * 8) };
      const h = household(door, built);
      if (h) return { h, door: doorText(door) };
    }
    return null;
  };
  const day = 1 + ((now.day + 2 + Math.floor(r() * 5)) % 28);
  const pool: (() => Notice | null)[] = [
    () => { const s = someone(); return s && { by: { en: `${s.h.title.en}, ${s.door}`, zh: `${s.door} ${s.h.title.zh}` }, text: { en: 'Lost: grey cat, answers to nothing. Last seen near the lift lobby.', zh: '寻猫：灰色，叫它也不理。最后在电梯口出现。' } }; },
    () => { const s = someone(); return s && { by: { en: `The ${s.h.plate} family`, zh: s.h.zh }, text: { en: 'Wedding tentage at the void deck this Saturday. Sorry for the noise. Come and eat.', zh: '本周六楼下搭棚办喜事。吵到大家，不好意思。来吃。' } }; },
    () => { const s = someone(); return s && { by: { en: s.door, zh: s.door }, text: { en: 'Tuition, Maths P4 to P6. Patient. Ask at the door.', zh: '补习：小四到小六数学。有耐心。上门问。' } }; },
    () => ({ by: { en: 'Estate office', zh: '组屋管理处' }, text: { en: `Lift servicing on the ${day}th, 10 am to 2 pm. Please use the stairs, or wait.`, zh: `${day} 号上午十点到下午两点保养电梯。请走楼梯，或者等。` } }),
    () => ({ by: { en: 'Estate office', zh: '组屋管理处' }, text: { en: 'Do not throw anything out of the window. Anything means anything.', zh: '不准从窗口往下丢东西。什么都不准。' } }),
    () => ({ by: { en: 'Estate office', zh: '组屋管理处' }, text: { en: `Drains will be fogged on the ${day}th. Close your windows and take in the laundry.`, zh: `${day} 号喷药除蚊。请关窗，收衣服。` } }),
    () => { const s = someone(); return s && { by: { en: `${s.h.title.en}, ${s.door}`, zh: `${s.door} ${s.h.title.zh}` }, text: { en: 'Found at the void deck: one mahjong tile, the red dragon. Collect from me.', zh: '楼下捡到麻将牌一只，红中。来我家拿。' } }; },
    () => ({ by: { en: 'Residents\' committee', zh: '居民委员会' }, text: { en: 'Karaoke night, void deck, Saturday 7 pm. One song each, then you pass the microphone.', zh: '周六晚七点楼下卡拉 OK。每人一首，唱完把麦克风传下去。' } }),
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
