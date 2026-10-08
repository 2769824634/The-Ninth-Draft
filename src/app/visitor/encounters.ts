/**
 * Who you run into. The world is the same for everyone; what you happen upon
 * depends on where you live, a seed from your registration, and how often and
 * when you come back, which only this browser remembers (localStorage
 * n9:visits). Nothing leaves the device.
 *
 * Each encounter is a condition, a scene and what is said. The regulars
 * (people.ts) turn up only in the district they live in; elsewhere whoever
 * does that job locally stands in. The first batch is small on
 * purpose: add to ENCOUNTERS, nothing else needs to change.
 */
import { CAST, type L } from '../../data/gerimis/people';
import { islandNow, type IslandTime } from '../island';
import { DOORS, doorText } from './home';
import { household, previousTenant, rebuilt, type Household } from './households';
import { hash, normCode, type Visitor } from './store';

const KEY = 'n9:visits';

/** How often, and when, this browser has come home. */
export interface Visits {
  /** Times the home page was opened. */
  n: number;
  /** Distinct island days on which it was. */
  days: number;
  /** The last island day, "1999-10-08", and the time before this one (ms). */
  day: string;
  last: number;
  /** Times opened between ten at night and five in the morning. */
  late: number;
}

const blank = (): Visits => ({ n: 0, days: 0, day: '', last: 0, late: 0 });

export function loadVisits(): Visits {
  try {
    return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return blank();
  }
}

/** Count this visit. Returns the record as it stood before, and after. */
export function countVisit(at = Date.now()): { before: Visits; now: Visits } {
  const before = loadVisits();
  const t = islandNow(at);
  const day = `1999-${String(t.month + 1).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
  const now: Visits = {
    n: before.n + 1,
    days: before.days + (before.day === day ? 0 : 1),
    day,
    last: at,
    late: before.late + (t.hours >= 22 || t.hours < 5 ? 1 : 0),
  };
  try { localStorage.setItem(KEY, JSON.stringify(now)); } catch { /* ignore */ }
  return { before, now };
}

interface Ctx {
  v: Pick<Visitor, 'code' | 'origin' | 'district' | 'home' | 'dob'>;
  /** Born here, and the block was rebuilt on the spot since your childhood. */
  rebuilt: boolean;
  built: number;
  t: IslandTime;
  /** Visits before this one. */
  seen: Visits;
  /** Hours since the last visit (Infinity the first time). */
  away: number;
  /** Your door, "#07-115". */
  door: string;
  /** The family next door, if the flat is not empty. */
  next: { h: Household; door: string } | null;
  prev: Household | null;
}

/** A face downstairs: one of the regulars when you live in their district, or whoever does that job here. */
interface Face { name: L; role: L }

type Slot = 'paper' | 'post' | 'shop' | 'taxi' | 'fish' | 'coffee';
const SLOT_CAST: Record<Slot, string> = { paper: 'huat', post: 'rahim', shop: 'goh', taxi: 'lim', fish: 'hock', coffee: 'keong' };
const SLOT_ROLE: Record<Slot, L> = {
  paper: { en: 'newspaper vendor', zh: '报贩' }, post: { en: 'postman', zh: '邮差' }, shop: { en: 'provision shop downstairs', zh: '楼下杂货店' },
  taxi: { en: 'drives a taxi, nights', zh: '开夜班德士' }, fish: { en: 'fishmonger, wet market', zh: '巴刹卖鱼的' }, coffee: { en: 'drinks at the coffee shop', zh: '咖啡店冲茶的' },
};
const LOCALS: L[] = [
  { en: 'Ah Kow', zh: '阿九' }, { en: 'Ah Lam', zh: '阿南' }, { en: 'Ah Boon', zh: '阿文' }, { en: 'Ah Chai', zh: '阿财' },
  { en: 'Encik Salleh', zh: '沙列大叔' }, { en: 'Mr Gopal', zh: '戈帕尔先生' }, { en: 'Ah Meng', zh: '阿明' }, { en: 'Uncle Raju', zh: '拉朱叔' },
];
const cast = (id: string) => CAST.find((r) => r.id === id)!;

function face(slot: Slot, district: string): Face {
  const r = cast(SLOT_CAST[slot]);
  if (r.district === district) return { name: r.name, role: r.role };
  return { name: LOCALS[hash(`local#${district}#${slot}`) % LOCALS.length], role: SLOT_ROLE[slot] };
}
const neighbour = (c: Ctx): Face | null => c.next && { name: c.next.h.title, role: { en: `${c.next.door}, next door`, zh: `隔壁 ${c.next.door}` } };

export interface Encounter {
  id: string;
  /** Who you meet: a slot, the family next door, or nobody (something you notice). */
  who: Slot | 'next' | null;
  when: (c: Ctx) => boolean;
  /** What is going on, in plain words. */
  scene: (c: Ctx, f: Face | null) => L;
  /** What they say, if anything. */
  say?: (c: Ctx) => L;
}

const day = (c: Ctx) => c.t.hours >= 7 && c.t.hours < 21;

export const ENCOUNTERS: Encounter[] = [
  { id: 'first', who: 'next', when: (c) => c.seen.n === 0 && day(c) && !!c.next,
    scene: (c, f) => ({ en: `${f!.name.en} from ${c.next!.door}, next door, is putting a pair of slippers out on the shoe rack as you come out of the lift.`, zh: `你走出电梯，隔壁 ${c.next!.door} 的${f!.name.zh}正把一双拖鞋摆到门口鞋架上。` }),
    say: (c) => c.rebuilt
      ? { en: `You are the child from the old Blk ${c.v.home!.blk}, aren't you? Same floor as before. When they pulled the old block down, most of us asked to come back to the new one, so a lot of the faces on this corridor are the same. The lifts stop at every floor now, and the rubbish chute is inside the kitchen, no more walking to the staircase. Knock if you need anything.`, zh: `你是以前住旧 ${c.v.home!.blk} 座那家的孩子吧？还是原来那层。旧楼拆的时候，我们大多申请回到新楼，所以这条走廊很多都是老面孔。现在电梯每层都停，垃圾槽就在厨房里，不用再走到楼梯那边去丢。有事就敲门。` }
      : c.v.origin === 'G' && c.next!.h.since <= 1990
      ? { en: `Eh, you are the child from ${c.door}, right? I remember you riding a tricycle up and down this corridor. Your mother used to bring us kueh at Chinese New Year. Moving back in? Good, the flat has been empty too long. We are still here, same as before, knock if you need anything.`, zh: `咦，你是以前住 ${c.door} 那家的孩子吧？我记得你小时候骑三轮车在这条走廊来来回回。过年你妈妈还会拿糕点过来。搬回来住了？好啊，那间屋空太久了。我们还住这里，跟以前一样，有事就敲门。` }
      : c.v.origin === 'G'
      ? { en: `I heard you grew up in ${c.door}? We only moved in in ${c.next!.h.since}, your family had already left by then. Welcome back. The rubbish chute is still behind the staircase, try not to use it after ten at night. The estate office is open nine to five on weekdays if anything in the flat needs fixing. Knock if you need anything.`, zh: `听说你小时候就住 ${c.door}？我们 ${c.next!.h.since} 年才搬来，那时候你家已经搬走了。欢迎回来。垃圾槽还是在楼梯旁边，晚上十点以后尽量别丢。屋里有什么要修，组屋管理处平日九点到五点有人。有事就敲门。` }
      : { en: `You just moved into ${c.door}? Welcome. The rubbish chute is round the back, behind the staircase. Try not to use it after ten at night, the whole block can hear the bags going down. If something in the flat is broken, the estate office is open nine to five on weekdays. We are home most evenings, knock if you need anything.`, zh: `你刚搬进 ${c.door}？欢迎欢迎。垃圾槽在后面，楼梯旁边。晚上十点以后尽量别丢，整座楼都听得到垃圾袋掉下去的声音。屋里有什么坏了，组屋管理处平日九点到五点有人。我们晚上大多在家，有事就敲门。` } },
  { id: 'away', who: 'next', when: (c) => c.seen.n > 0 && c.away > 24 * 6 && day(c) && !!c.next,
    scene: (c, f) => ({ en: `${f!.name.en} from next door opens the gate as you pass.`, zh: `你经过的时候，隔壁的${f!.name.zh}打开铁门探出头来。` }),
    say: () => ({ en: 'Haven\'t seen you for a week, I was about to ask the estate office if you were all right. There were flyers stuck in your gate, I took them out so people don\'t think the flat is empty. The notice board downstairs has new things up this week, have a look before you go out.', zh: '一个礼拜没看到你，我还想去问管理处你是不是出了什么事。你家铁门上塞了好多传单，我帮你拿掉了，免得人家以为屋子没人住。楼下告示板这礼拜贴了新东西，出门前去看一下。' }) },
  { id: 'taxi', who: 'taxi', when: (c) => c.t.hours >= 22 || c.t.hours < 5,
    scene: (_c, f) => ({ en: `At the taxi stand below the block, ${f!.name.en} is finishing a cup of coffee before his next fare.`, zh: `楼下的德士站，${f!.name.zh}正在喝完手上那杯咖啡，等下一个客人。` }),
    say: () => ({ en: 'Coming home this late? The last bus went at half past eleven. After midnight the meter adds fifty percent, so if you have to take a taxi, share with someone going the same way. The coffee shop at the corner stays open till two, the fried rice is not bad.', zh: '这么晚才回来？最后一班巴士十一点半就走了。过了十二点，车费要加五成，真要坐德士，找个同路的一起分。转角那间咖啡店开到两点，炒饭还不错。' }) },
  { id: 'paper', who: 'paper', when: (c) => c.t.hours >= 5 && c.t.hours < 11,
    scene: (_c, f) => ({ en: `${f!.name.en} is sitting on a stool by the lift lobby, folding newspapers into bundles.`, zh: `${f!.name.zh}坐在电梯口的矮凳上，把报纸一份份折好捆起来。` }),
    say: (c) => ({ en: `The Daily is thirty cents, the Sunday one is fifty because it has the cinema times and the job ads.${c.t.weekday === 0 ? ' Today is Sunday, so fifty.' : ''} If you want it at your door every morning, it is nine dollars a month. I put it in your gate before half past six, you pay me at the end of the month.`, zh: `日报三毛，礼拜天那份五毛，因为有戏院场次和招聘广告。${c.t.weekday === 0 ? '今天礼拜天，五毛。' : ''}要每天送到门口的话，一个月九块。我六点半以前塞进你家铁门，月底再跟我算。` }) },
  { id: 'post', who: 'post', when: (c) => c.t.hours >= 10 && c.t.hours < 15 && c.t.weekday !== 0,
    scene: (_c, f) => ({ en: `${f!.name.en}, the postman, has parked his bicycle by the letterboxes and is sorting a bundle of letters.`, zh: `邮差${f!.name.zh}把脚车停在信箱旁边，正在分一捆信。` }),
    say: (c) => c.v.origin === 'G'
      ? { en: `${c.door}? The estate office gave me a few old letters with your name on them to put in your box. Some are from many years ago. Have a look, there may be something worth keeping.`, zh: `${c.door}？管理处交给我几封写着你名字的旧信，叫我放进你信箱。有的是好多年前的，你看看，说不定有值得留的。` }
      : !c.prev
      ? { en: `${c.door}? Only a bill and a flyer today. This block is new, so everything that comes is yours. If your name is not on the letterbox yet, write it on a piece of paper and stick it inside the door, so I know I have the right flat.`, zh: `${c.door}？今天只有一张账单和一张传单。这座楼是新的，寄来的都是你的。信箱上还没写名字的话，先拿张纸写好贴在信箱门里面，我才知道没放错。` }
      : { en: `${c.door}? There is post for ${c.prev.plate} again. If you know their new address, write it on the envelope. If not, write "Not at this address" and drop it in the red postbox, I will send it back. Please don't throw it away, someone may be waiting for an answer.`, zh: `${c.door}？又有寄给 ${c.prev.plate} 的信。知道他们新地址的话就写在信封上；不知道就写「查无此人」，丢进红色邮筒，我拿回去退。别丢掉，说不定有人在等回信。` } },
  { id: 'shop', who: 'shop', when: (c) => c.t.hours >= 8 && c.t.hours < 22,
    scene: (_c, f) => ({ en: `${f!.name.en} is stacking crates of soft drinks outside the provision shop at the foot of the block.`, zh: `${f!.name.zh}在楼下杂货店门口叠汽水箱。` }),
    say: (c) => ({ en: `${c.v.origin === 'G' ? 'Moved back? ' : 'New here? '}I am at the shop downstairs. Gas cylinders come on Thursday morning; leave your name and door number with me by Wednesday night. Rice, eggs, soap, I can deliver to your door if it comes to more than twenty dollars. Regulars can write it in my book and pay at the end of the month.`, zh: `${c.v.origin === 'G' ? '搬回来住了？' : '新来的？'}我在楼下开店。煤气礼拜四早上到，要的话礼拜三晚上以前把名字和门牌留给我。米、蛋、肥皂，买满二十块我送上门。熟客可以记在本子上，月底再算。` }) },
  { id: 'evening', who: 'next', when: (c) => c.seen.n >= 1 && c.t.hours >= 17 && c.t.hours < 21 && !!c.next,
    scene: (c, f) => ({ en: `${f!.name.en} from next door, who ${c.next!.h.job.en}, is coming home with dinner in a plastic bag.`, zh: `隔壁的${f!.name.zh}（${c.next!.h.job.zh}）下班回来，手上提着一袋打包的晚饭。` }),
    say: () => ({ en: 'Hot today, the lift was like an oven. Have you seen the notice board this week? Have a look before you go up, sometimes they cut the water and nobody remembers until the tap is dry. We cooked too much curry yesterday, if you want some, knock.', zh: '今天好热，电梯里像烤炉。这礼拜的告示看了没有？上楼前去看一下，有时候停水，大家都是开水龙头才想起来。我们昨天咖喱煮多了，要的话来敲门。' }) },
  { id: 'market', who: 'fish', when: (c) => (c.t.weekday === 0 || c.t.weekday === 6) && c.t.hours >= 6 && c.t.hours < 12,
    scene: (_c, f) => ({ en: `At the wet market across the road, ${f!.name.en} is scooping ice over the fish.`, zh: `对面巴刹里，${f!.name.zh}正往鱼上铲冰。` }),
    say: () => ({ en: 'Come early, before eight, the good fish go first on the weekend. Look at the eyes: clear eyes means fresh, cloudy means yesterday. Today the pomfret is good, the prawns are small. The floor is wet, mind your slippers.', zh: '周末要早点来，八点以前，好的鱼先卖完。看眼睛：眼睛清的是新鲜的，浑的是昨天的。今天鲳鱼不错，虾比较小。地湿，小心你的拖鞋。' }) },
  { id: 'coffee', who: 'coffee', when: (c) => c.t.hours >= 6 && c.t.hours < 23,
    scene: (_c, f) => ({ en: `At the coffee shop downstairs, ${f!.name.en} is pulling tea from one mug to another, a long stream in the air.`, zh: `楼下咖啡店，${f!.name.zh}把茶从一个杯子拉到另一个杯子，拉得老高。` }),
    say: (c) => ({ en: `What do you want? Kopi is sixty cents, teh is sixty also, with milk or without, same price. The chicken rice stall is closed on Mondays${c.t.weekday === 1 ? ', so today no' : ''}. The noodle stall closes when the soup runs out, usually before two.`, zh: `要什么？咖啡六毛，茶也六毛，加不加奶都一样价钱。鸡饭档礼拜一不开${c.t.weekday === 1 ? '，今天就没有' : ''}。面档汤卖完就收，通常两点以前。` }) },
  { id: 'rain', who: 'next', when: (c) => c.t.day % 3 === 0 && c.t.hours >= 12 && c.t.hours < 19 && !!c.next,
    scene: (c, f) => ({ en: `It starts to pour. ${f!.name.en} from ${c.next!.door} is pulling bamboo poles of laundry in through the window.`, zh: `突然下起大雨。${c.next!.door} 的${f!.name.zh}正把晾衣竹竿从窗外收进来。` }),
    say: () => ({ en: 'Rain again! This month it rains almost every afternoon. If you hang your clothes out, take them in before three. And the pole holder outside your window is loose, tell the estate office before it falls on someone.', zh: '又下雨了！这个月几乎每天下午都下。你要是晾衣服，三点以前收进来。还有，你窗外那个插竹竿的架子松了，趁还没掉下去砸到人，去跟管理处说。' }) },
  { id: 'quiet', who: null, when: (c) => c.t.hours >= 1 && c.t.hours < 5,
    scene: () => ({ en: 'The corridor is quiet. The only lights still on are the tubes over the lift lobby and the drinks machine at the void deck. Somewhere below, a taxi is waiting with its engine running.', zh: '走廊很安静。还亮着的只有电梯口的光管和楼下那台饮料机。下面不知哪里，一辆德士停着没熄火。' }) },
  { id: 'chess', who: null, when: () => true,
    scene: () => ({ en: 'At the void deck four old men are playing Chinese chess at the stone table, and two more stand behind them saying which piece to move. A boy is bouncing a ball against the wall by the letterboxes. There is something new on the notice board this week.', zh: '楼下的石桌边，四个老伯在下象棋，后面还站着两个指点哪一步该怎么走。一个小男孩对着信箱旁边的墙拍球。告示板这礼拜贴了新东西。' }) },
];

/**
 * What happens today when you come home: one encounter, the first that holds,
 * in an order shuffled by your name and the hour, so two residents coming home
 * at the same time do not meet the same person.
 */
export function encounter(v: Ctx['v'], seen: Visits, at = Date.now(), built = 1975): { id: string; who: Face | null; scene: L; say: L | null } | null {
  const h = v.home;
  if (!h) return null;
  const t = islandNow(at);
  let next: Ctx['next'] = null;
  for (const s of [h.stack + 1, h.stack - 1]) {
    if (s < 0 || s >= DOORS) continue;
    const d = { ...h, stack: s };
    const hh = household(d, built);
    if (hh) { next = { h: hh, door: doorText(d) }; break; }
  }
  const c: Ctx = { v, rebuilt: rebuilt(v, built), built, t, seen, away: seen.last ? (at - seen.last) / 3.6e6 : Infinity, door: doorText(h), next, prev: previousTenant(h, built) };
  const seed = `${normCode(v.code)}#${t.month}#${t.day}#${t.hours}`;
  // the special ones first, the everyday ones after, shuffled within each; noticing things comes last
  const rank = (e: Encounter) => (e.id === 'first' || e.id === 'away' ? 0 : e.id === 'chess' ? 2 : 1);
  const ranked = ENCOUNTERS.map((e) => ({ e, k: rank(e) * 2 ** 32 + hash(`${seed}#${e.id}`) })).sort((a, b) => a.k - b.k);
  const hit = ranked.find(({ e }) => e.when(c))?.e;
  if (!hit) return null;
  const f = hit.who === 'next' ? neighbour(c) : hit.who ? face(hit.who, v.district) : null;
  return { id: hit.id, who: f, scene: hit.scene(c, f), say: hit.say ? hit.say(c) : null };
}
