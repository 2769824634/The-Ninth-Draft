/**
 * The routine side of the stacks: what each district office sends in every
 * month. One drawer a district, one folder a month (January to the island's
 * month), and in each folder the month's returns: repairs, lost property,
 * meter rounds, bus diversions, mosquito checks, lift faults, noise
 * complaints, the night patrol, and so on.
 *
 * Nobody writes these. A folder is worked out from the district (its blocks,
 * the households in them, its market and interchange), the month and a seed,
 * so every visitor finds the same papers in the same drawer. On top of that
 * come the side stories (src/data/gerimis/sidelines.ts), a few lines laid into
 * the months they belong to, and a plain line on the day a formal record
 * happened in the district. A day still to come on the island has no line yet.
 */
import { DISTRICTS, REGIONS, type District } from '../visitor/districts';
import { household } from '../visitor/households';
import { doorText, homeBlocks, type HomeBlock } from '../visitor/home';
import { hash, rng } from '../visitor/store';
import { SIDELINES, type SideRow } from '../../data/gerimis/sidelines';
import type { ArchiveRecord } from '../types';
import { esc } from '../ui/text';

type L = { en: string; zh: string };
type Cell = string | L;
export type FormId =
  | 'repairs' | 'lost' | 'water' | 'power' | 'bus' | 'mosquito' | 'lift' | 'noise' | 'corridor'
  | 'reno' | 'dogs' | 'stalls' | 'patrol' | 'outage' | 'recycle' | 'sweep' | 'bridge' | 'letter';

export interface Sheet {
  form: FormId;
  issuer: L;
  title: L;
  ref: string;
  cols?: L[];
  rows?: { day: number; cells: Cell[] }[];
  /** A letter or notice: paragraphs instead of a table. */
  paras?: L[];
  notes?: L[];
  sign?: L;
  /** The month the sheet is for. */
  m?: number;
}

const l = (en: string, zh: string): L => ({ en, zh });
const MON_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const two = (n: number) => String(n).padStart(2, '0');
const dm = (d: number, m: number) => `${two(d)}.${two(m)}`;
const pick = <T>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];
const daysIn = (m: number) => new Date(Date.UTC(1999, m, 0)).getUTCDate();
const weekday = (d: number, m: number) => new Date(Date.UTC(1999, m - 1, d)).getUTCDay();
const WD = [l('Sun', '日'), l('Mon', '一'), l('Tue', '二'), l('Wed', '三'), l('Thu', '四'), l('Fri', '五'), l('Sat', '六')];

/** The routine category, as the stacks and the reader know it. */
export const ROUTINE = { id: 'routine', label: 'Routine', code: 'RT' } as const;

/* ---------------- the cabinet: one drawer a district ---------------- */
export interface RoutineDrawer {
  /** Null for a spare drawer. */
  district: District | null;
  /** Bank, then the drawer's place in it. */
  bank: number;
}

/** 16 cabinets of four: the Central and East districts in the first bank, North, North-East and West in the second, spares at the end of each. */
export const ROUTINE_BANKS: { regions: string[]; label: L }[] = [
  { regions: ['central', 'east'], label: l('Central · East', '中区 · 东区') },
  { regions: ['north', 'northeast', 'west'], label: l('North · North-East · West', '北区 · 东北区 · 西区') },
];
export const BANK_DRAWERS = 32;

export const ROUTINE_DRAWERS: RoutineDrawer[] = ROUTINE_BANKS.flatMap((b, bank) => {
  const ds = b.regions.flatMap((reg) => DISTRICTS.filter((d) => d.region === reg));
  return Array.from({ length: BANK_DRAWERS }, (_, i) => ({ district: ds[i] ?? null, bank }));
});

export const regionName = (id: string): L => {
  const r = REGIONS.find((x) => x.id === id);
  return r ? l(r.en, r.zh) : l(id, id);
};

/* ---------------- the folders ---------------- */
export const folderId = (d: District, m: number) => `RT-${two(DISTRICTS.indexOf(d))}-${two(m)}`;

/** The folders on file today: January up to the island's month, for every district that keeps papers. */
export function routineFolders(today: string): ArchiveRecord[] {
  const month = Number(today.slice(5, 7));
  const out: ArchiveRecord[] = [];
  for (const dr of ROUTINE_DRAWERS) {
    const d = dr.district;
    if (!d || d.kind === 'unsurveyed') continue;
    for (let m = 1; m <= month; m++) out.push(folderRecord(d, m, today));
  }
  return out;
}

function folderRecord(d: District, m: number, today: string): ArchiveRecord {
  const office = l(`${d.en} District Office`, `${d.zh}区办事处`);
  const head = (zh: boolean) => (zh ? `${d.zh} · 1999 年 ${m} 月` : `${d.en} · ${MON_EN[m - 1]} 1999`);
  const sub = (zh: boolean) => (zh ? `${office.zh}例行文件` : `Routine returns, ${office.en}`);
  const fields = (zh: boolean) => [
    { label: zh ? '区' : 'District', value: zh ? `${d.zh}（${regionName(d.region).zh}）` : `${d.en} (${regionName(d.region).en})` },
    { label: zh ? '送件单位' : 'Sent in by', value: zh ? office.zh : office.en },
  ];
  const texts = (zh: boolean) => ({
    title: head(zh),
    subtitle: sub(zh),
    status: zh ? '已归档' : 'Filed',
    date: `1999-${two(m)}-01`,
    place: zh ? d.zh : d.en,
    fields: fields(zh),
    summary: zh ? `${d.zh}区办事处 1999 年 ${m} 月交来的例行表格，按到件先后订在一起。` : `The routine forms ${office.en} sent in for ${MON_EN[m - 1]} 1999, filed in the order they came.`,
    body: '',
    tags: [] as string[],
    drafts: [],
    attachments: [],
    revised: false,
    imageCaption: undefined,
  });
  const en = texts(false), zh = texts(true);
  return {
    file: folderId(d, m),
    slug: '',
    category: 'routine' as ArchiveRecord['category'],
    stamp: 'RESTRICTED',
    district: d.id,
    related: [],
    ...en,
    en,
    zh,
    routine: { district: d.id, month: m, today },
  } as ArchiveRecord;
}

export const routineOf = (rec: ArchiveRecord) => (rec as ArchiveRecord & { routine?: { district: string; month: number; today: string } }).routine;

/**
 * Write the folder's papers into the record (both languages), the first time
 * it is read. The blocks come from the street map's directory.
 */
export async function fillFolder(rec: ArchiveRecord, base: string, events: ArchiveRecord[], zhNow: boolean) {
  const rt = routineOf(rec);
  if (!rt || rec.en?.body) return;
  const d = DISTRICTS.find((x) => x.id === rt.district)!;
  let blocks: HomeBlock[] = [];
  try {
    blocks = (await homeBlocks(base)).filter((b) => b.district === d.id);
  } catch {
    /* the forms still come, with fewer addresses */
  }
  const sheets = folder(d, rt.month, rt.today, blocks, events.filter((e) => e.district === d.id));
  const html = (zh: boolean) => sheets.map((s) => render(s, zh)).join('');
  rec.en!.body = html(false);
  rec.zh!.body = html(true);
  rec.body = zhNow ? rec.zh!.body : rec.en!.body;
  const n = (zh: boolean) => (zh ? `本夹共 ${sheets.length} 份表格。` : `${sheets.length} forms in this folder.`);
  rec.en!.summary += ` ${n(false)}`;
  rec.zh!.summary += n(true);
  rec.summary = zhNow ? rec.zh!.summary : rec.en!.summary;
}

/* ---------------- one month's papers ---------------- */
interface Ctx {
  d: District;
  m: number;
  /** The last day of the month with papers: the month's end, or today in the island's month. */
  last: number;
  r: () => number;
  blocks: HomeBlock[];
  office: L;
  estate: L;
  code: string;
}

/** Days in the month, spread and sorted, none after the last day with papers. */
const days = (c: Ctx, n: number) => {
  const out = new Set<number>();
  for (let k = 0; k < n * 3 && out.size < n; k++) out.add(1 + Math.floor(c.r() * c.last));
  return [...out].sort((a, b) => a - b);
};

const someBlock = (c: Ctx) => (c.blocks.length ? pick(c.r, c.blocks) : null);
const blkName = (b: HomeBlock | null, c: Ctx): L =>
  b ? l(`Blk ${b.no} ${b.street}`.trim(), `${b.street ? `${b.street} ` : ''}${b.no} 座`) : l(`${c.d.en} town centre`, `${c.d.zh}镇中心`);

/** A neighbour who wrote in: "Mr Tan, #07-311" (or "a resident" when the block is unknown). */
function resident(c: Ctx, b: HomeBlock | null): L {
  if (!b) return l('Resident', '住户');
  for (let k = 0; k < 6; k++) {
    const door = { postcode: b.postcode, floor: 2 + Math.floor(c.r() * Math.max(1, b.floors - 1)), stack: Math.floor(c.r() * 8) };
    const h = household(door, b.year);
    if (h) return l(`${h.title.en}, ${doorText(door)}`, `${doorText(door)} ${h.title.zh}`);
  }
  return l('Resident', '住户');
}

/** The month's folder: what came in, in the order the clerk files it. */
export function folder(d: District, m: number, today: string, blocks: HomeBlock[], events: ArchiveRecord[]): Sheet[] {
  const tm = Number(today.slice(5, 7)), td = Number(today.slice(8, 10));
  const last = m < tm ? daysIn(m) : Math.max(1, td);
  const c: Ctx = {
    d, m, last, blocks,
    r: rng(hash(`routine#${d.id}#${m}`)),
    office: l(`${d.en} District Office`, `${d.zh}区办事处`),
    estate: l(`${d.en} Estate Office`, `${d.zh}组屋管理处`),
    code: d.en.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
  };
  const homes = d.kind === 'residential' && blocks.length > 0;
  const forms: FormId[] = homes
    ? ['repairs', 'lost', 'water']
    : ['repairs', 'lost', 'patrol', 'sweep'];
  if (homes) {
    // the rest of the month's returns: always the patrol and the sweepers, then a few of the others
    forms.push('patrol');
    const rest: FormId[] = ['power', 'mosquito', 'lift', 'noise', 'corridor', 'reno', 'dogs', 'stalls', 'recycle', 'sweep', 'bus', 'outage'];
    const order = rest.map((f) => ({ f, k: hash(`${d.id}#${m}#${f}`) })).sort((a, b) => a.k - b.k);
    forms.push(...order.slice(0, 6 + (hash(`${d.id}#${m}`) % 3)).map((x) => x.f));
  } else if (c.r() < 0.5) forms.push('bus');
  if (SIDELINES.some((s) => s.district === d.id && s.bridge)) forms.push('bridge');

  const side = SIDELINES.filter((s) => s.district === d.id);
  const shown = (date: string) => date <= today && Number(date.slice(5, 7)) === m;
  const sheets: Sheet[] = [];
  for (const f of forms) {
    const s = MAKE[f](c, side);
    if (!s) continue;
    // a side story's lines for this form, on their days
    for (const sl of side) for (const e of sl.rows ?? []) if (e.form === f && shown(e.date)) s.rows?.push({ day: Number(e.date.slice(8, 10)), cells: e.cells });
    for (const sl of side) for (const e of sl.notes ?? []) if (e.form === f && shown(e.date)) (s.notes ??= []).push(e.note);
    // the day a formal record happened here: a plain line in the repairs register
    if (f === 'repairs') for (const ev of events) {
      const iso = ev.date?.slice(0, 10) ?? '';
      if (!shown(iso) || side.some((sl) => sl.echoes?.includes(ev.file))) continue;
      const place = l(ev.en?.place ?? ev.place ?? d.en, ev.zh?.place ?? ev.place ?? d.zh);
      s.rows?.push({ day: Number(iso.slice(8, 10)), cells: [place, l('Residents say the place “is not the way it usually is”. Asked what is different, could not say.', '住户反映现场「跟平常不一样」。问哪里不一样，说不上来。'), l('Residents', '住户'), l('Officer sent the same day. Nothing found to repair.', '当天派员查看，没有要修的。')] });
    }
    s.rows?.sort((a, b) => a.day - b.day);
    sheets.push({ ...s, m });
  }
  // whole papers a side story leaves in the folder: a letter, a notice, a record
  for (const sl of side) for (const p of sl.sheets ?? []) if (shown(p.date)) sheets.push({ ...p.sheet, m });
  return sheets;
}

/* ---------------- the forms ---------------- */
type Make = (c: Ctx, side: typeof SIDELINES) => Sheet | null;

const REPAIRS: [L, L][] = [
  [l('Corridor light out on floor {f}', '{f} 楼走廊灯不亮'), l('Tube replaced', '换了灯管')],
  [l('Drain cover loose, rattles when stepped on', '水沟盖松动，踩上去会响'), l('Cover fixed', '已固定')],
  [l('Street lamp stays on in the daytime', '路灯白天也亮着'), l('Timer reset', '调过定时器')],
  [l('Bus shelter roof leaks onto the bench', '巴士站顶棚漏水，椅子是湿的'), l('Passed to the Transit Board', '已转交通局')],
  [l('Railing on the staircase landing wobbles', '楼梯平台的栏杆摇晃'), l('Bolts tightened', '螺丝已拧紧')],
  [l('Letterbox door broken, will not lock', '信箱门坏了，锁不上'), l('Hinge replaced', '换了铰链')],
  [l('Void deck fan makes a knocking noise', '楼下吊扇有咯咯声'), l('Blade rebalanced', '扇叶重新校过')],
  [l('Rubbish chute hopper stuck open on floor {f}', '{f} 楼垃圾槽口卡住关不上'), l('Freed and greased', '已松开上油')],
  [l('Pavement slab lifted by a tree root', '人行道石板被树根顶起'), l('Slab relaid', '石板重铺')],
  [l('Playground swing chain worn', '游乐场秋千链子磨损'), l('Chain replaced', '换了链子')],
  [l('Water dripping from the ceiling of the lift lobby', '电梯厅天花板滴水'), l('Pipe above sealed', '上面的水管已补')],
  [l('Notice board glass cracked', '告示板玻璃裂了'), l('Glass replaced', '换了玻璃')],
  [l('Pedestrian crossing button does nothing', '行人过路按钮按了没反应'), l('Passed to the Transit Board', '已转交通局')],
  [l('Overhead bridge: two steps chipped', '天桥有两级台阶崩角'), l('Patched', '已补')],
];
const REPORTER: L[] = [l('Resident', '住户'), l('Cleaner', '清洁工'), l('Bus driver', '巴士司机'), l('Stallholder', '摊主'), l('Postman', '邮差'), l('Estate officer', '管理处职员')];

const repairs: Make = (c) => {
  const n = 5 + Math.floor(c.r() * 4);
  const rows = days(c, n).map((day) => {
    const [what, done] = pick(c.r, REPAIRS);
    const f = String(2 + Math.floor(c.r() * 10));
    const b = someBlock(c);
    const pending = day > c.last - 3 && c.r() < 0.6;
    const fix = Math.min(daysIn(c.m), day + 1 + Math.floor(c.r() * 4));
    return {
      day,
      cells: [
        blkName(b, c),
        l(what.en.replace('{f}', f), what.zh.replace('{f}', f)),
        pick(c.r, REPORTER),
        pending || fix > c.last ? l('Pending', '待处理') : l(`${dm(fix, c.m)} ${done.en}`, `${dm(fix, c.m)} ${done.zh}`),
      ] as Cell[],
    };
  });
  return {
    form: 'repairs', issuer: c.office, title: l('Street repairs register', '街道设施报修登记'), ref: `${c.code}/RP/99${two(c.m)}`,
    cols: [l('Where', '地点'), l('What', '报修事项'), l('Reported by', '报修人'), l('Done', '处理')],
    rows,
    sign: l('Entered by the District Office counter. Checked: ____', '填表：区办事处柜台　复核：____'),
  };
};

const LOST: L[] = [
  l('Black umbrella, long handle', '黑色长柄雨伞一把'), l('Folding umbrella, floral', '花色折叠伞一把'), l('Bunch of three keys on a red string', '钥匙一串（三把，挂红绳）'),
  l('Student pass', '学生证一张'), l('Steel tiffin carrier, three tiers, empty', '三层不锈钢饭格一个，空的'), l('Spectacles in a brown case', '眼镜一副，装在咖啡色盒子里'),
  l('Child’s shoe, left foot, blue', '小孩鞋一只，左脚，蓝色'), l('Farecard, value about $4', '车资卡一张，余额约 4 元'), l('Wristwatch, metal strap', '手表一只，钢带'),
  l('Plastic bag of vegetables', '一袋菜'), l('Paperback novel, Chinese', '中文小说一本'), l('Wallet, no money, IC inside', '钱包一个，没有钱，有身份证'),
  l('Prayer beads', '念珠一串'), l('Cap, school badge on it', '帽子一顶，有校徽'), l('Walking stick, wooden', '木拐杖一根'),
];
const lost: Make = (c) => {
  // the interchange keeps the district's lost property where there is one; otherwise the District Office counter
  const fac = /interchange/i.test(c.d.transit.en) ? l(`${c.d.en} Bus Interchange`, `${c.d.zh}巴士转换站`) : c.office;
  const spots = [l('Queue for service {n}', '{n} 路候车处'), l('Coffee shop', '咖啡店'), l('Bench by the ticket office', '售票处旁的长椅'), l('On the bus, route {n}', '{n} 路车上'), l('Toilet', '厕所'), l('Counter', '柜台')];
  const routes = busRoutes(c.d);
  const rows = days(c, 4 + Math.floor(c.r() * 4)).map((day) => {
    const s = pick(c.r, spots), n = String(pick(c.r, routes));
    const claimed = c.r() < 0.45 ? Math.min(c.last, day + Math.floor(c.r() * 5)) : 0;
    return { day, cells: [l(s.en.replace('{n}', n), s.zh.replace('{n}', n)), pick(c.r, LOST), claimed ? l(`Claimed ${dm(claimed, c.m)}`, `${dm(claimed, c.m)} 认领`) : l('Not claimed', '未认领')] as Cell[] };
  });
  return {
    form: 'lost', issuer: fac, title: l('Lost property register', '失物招领登记'), ref: `${c.code}/LP/99${two(c.m)}`,
    cols: [l('Found at', '拾获地点'), l('Item', '物品'), l('Claimed', '认领')],
    rows,
    notes: [l('Unclaimed items are kept for three months, then handed to the District Office.', '未认领物品保管三个月，期满交区办事处处理。')],
  };
};

/** Each district's bus services: three route numbers, the same all year. */
export const busRoutes = (d: District) => {
  const r = rng(hash(`routes#${d.id}`));
  const out = new Set<number>();
  while (out.size < 3) out.add(10 + Math.floor(r() * 180));
  return [...out].sort((a, b) => a - b);
};

/** The meter round: one floor of one block a month, read on the district's reading day. */
function meterRound(c: Ctx, kind: 'water' | 'power', side: typeof SIDELINES) {
  const pin = side.find((s) => s.meter && s.meter.kind === kind)?.meter;
  const b = pin ? c.blocks.find((x) => x.postcode === pin.postcode) ?? null : null;
  const r = rng(hash(`round#${kind}#${c.d.id}`));
  const blk = b ?? (c.blocks.length ? c.blocks[Math.floor(r() * c.blocks.length)] : null);
  if (!blk) return null;
  const floor = pin?.floor ?? 2 + Math.floor(r() * Math.max(1, blk.floors - 1));
  const readDay = pin?.readDay ?? 10 + (hash(`readday#${c.d.id}`) % 14) + (kind === 'power' ? 2 : 0);
  return { blk, floor, readDay, pin, reader: 1 + (hash(`reader#${kind}#${c.d.id}`) % 24) };
}

const meters = (kind: 'water' | 'power'): Make => (c, side) => {
  const round = meterRound(c, kind, side);
  if (!round) return null;
  const { blk, floor, readDay, pin, reader } = round;
  const read = readDay <= c.last;
  const unit = kind === 'water' ? l('m³', '立方米') : l('kWh', '度');
  const use = (door: { postcode: string; floor: number; stack: number }, m: number) => {
    const h = household(door, blk.year);
    if (!h) return 0;
    const k = rng(hash(`use#${kind}#${door.postcode}#${door.floor}#${door.stack}#${m}`))();
    return kind === 'water' ? Math.round(h.size * 4 + 3 + k * 6) : Math.round(h.size * 60 + 90 + k * 80);
  };
  const reading = (door: { postcode: string; floor: number; stack: number }, m: number) => {
    let v = (hash(`base#${kind}#${door.postcode}#${door.floor}#${door.stack}`) % (kind === 'water' ? 3000 : 40000)) + 100;
    for (let k = 1; k <= m; k++) v += use(door, k);
    return v;
  };
  const pad = (n: number) => String(n).padStart(kind === 'water' ? 4 : 5, '0');
  const rows = Array.from({ length: 8 }, (_, stack) => {
    const door = { postcode: blk.postcode, floor, stack };
    const h = household(door, blk.year);
    const mine = pin && pin.stack === stack ? pin.months[c.m] : undefined;
    const who: Cell = h ? l(h.plate, h.zh) : l('(vacant)', '（空置）');
    if (mine && (read || mine.always)) return { day: stack, cells: [doorText(door), who, mine.prev, mine.cur, mine.use] as Cell[] };
    if (mine) return { day: stack, cells: [doorText(door), who, mine.prev, '—', '—'] as Cell[] };
    const prev = reading(door, c.m - 1), cur = reading(door, c.m);
    return { day: stack, cells: [doorText(door), who, pad(prev), read ? pad(cur) : '—', read ? String(cur - prev) : '—'] as Cell[] };
  });
  const notes: L[] = [];
  if (!read) notes.push(l(`This month’s round is on ${readDay} ${MON_EN[c.m - 1]}.`, `本月抄表日是 ${c.m} 月 ${readDay} 日。`));
  else if (pin?.months[c.m]?.note) notes.push(pin.months[c.m].note!);
  const t = kind === 'water' ? l('Water meter round', '水表抄表记录') : l('Electricity meter round', '电表抄表记录');
  return {
    form: kind, issuer: c.estate, title: l(`${t.en} · Blk ${blk.no}, floor ${floor}`, `${t.zh} · ${blk.no} 座 ${floor} 楼`), ref: `${c.code}/${kind === 'water' ? 'WM' : 'EM'}/99${two(c.m)}`,
    cols: [l('Unit', '单位'), l('Household', '户主'), l('Last month', '上月读数'), l('This month', '本月读数'), l(`Used (${unit.en})`, `用量（${unit.zh}）`)],
    rows,
    notes,
    sign: l(`Meter reader No. ${two(reader)}`, `抄表员 第 ${two(reader)} 号`),
  };
};

const BUS_WHY: L[] = [
  l('road works at the junction', '路口修路'), l('a wedding tent on the service road', '支路上搭了喜棚'), l('the night market', '夜市'),
  l('drain works', '修沟渠'), l('the funfair car park (the funfair opens next year)', '游乐场停车场施工（游乐场明年开幕）'), l('resurfacing', '重铺路面'),
];
const bus: Make = (c) => {
  const routes = busRoutes(c.d);
  const [from] = days(c, 1);
  const to = Math.min(daysIn(c.m), from + 2 + Math.floor(c.r() * 10));
  const why = pick(c.r, BUS_WHY);
  const b = someBlock(c);
  const stopA = blkName(b, c), stopB = blkName(someBlock(c), c);
  return {
    form: 'bus', issuer: l('Transit Board, for the District Office', '交通局（区办事处代贴）'), title: l('Bus diversion notice', '巴士改道通告'), ref: `TB/${c.code}/99${two(c.m)}`,
    paras: [
      l(`From ${dm(from, c.m)} to ${dm(to, c.m)}, because of ${why.en}, services ${routes.join(', ')} will not call at the stop outside ${stopA.en}.`, `${dm(from, c.m)} 至 ${dm(to, c.m)}，因${why.zh}，${routes.join('、')} 路巴士不停 ${stopA.zh} 门口那一站。`),
      l(`Please board and alight at the temporary stop outside ${stopB.en}, about three minutes’ walk away. The temporary stop is marked with a yellow pole.`, `请改到 ${stopB.zh} 门口的临时车站上下车，走路大约三分钟，临时车站插着黄色站牌。`),
      l('We are sorry for the inconvenience.', '不便之处，敬请原谅。'),
    ],
  };
};

const MOSQ: L[] = [
  l('flower pot saucers with water', '花盆垫碟积水'), l('roof gutter blocked, standing water', '屋檐水槽堵塞积水'), l('pail left upside-down the wrong way', '水桶没倒扣'),
  l('bamboo pole holders without caps', '晾衣竹竿插座没有盖子'), l('nothing found', '没有发现'), l('nothing found', '没有发现'), l('nothing found', '没有发现'),
];
const mosquito: Make = (c) => {
  const rows = days(c, 6).map((day) => {
    const b = someBlock(c);
    const found = pick(c.r, MOSQ);
    const none = found.en === 'nothing found';
    return { day, cells: [blkName(b, c), String(8 + Math.floor(c.r() * 30)), found, none ? l('—', '—') : l('Advice slip left', '留了劝告单')] as Cell[] };
  });
  return {
    form: 'mosquito', issuer: c.office, title: l('Mosquito breeding checks', '灭蚊检查记录'), ref: `${c.code}/MQ/99${two(c.m)}`,
    cols: [l('Block', '组屋'), l('Units checked', '查了几户'), l('Found', '发现'), l('Action', '处理')],
    rows,
    notes: [l('Residents are reminded to turn pails over and change vase water every week.', '请住户每星期把水桶倒扣、换花瓶的水。')],
  };
};

const LIFT_WHY: L[] = [l('door sensor dirty', '门感应器脏了'), l('stopped between floors {f} and {g}', '停在 {f} 楼和 {g} 楼之间'), l('button for floor {f} stuck', '{f} 楼按钮卡住'), l('power trip', '跳电'), l('door closes too fast', '门关得太快')];
const lift: Make = (c) => {
  const rows = days(c, 3 + Math.floor(c.r() * 3)).map((day) => {
    const b = someBlock(c);
    const f = 2 + Math.floor(c.r() * Math.max(1, (b?.floors ?? 10) - 2));
    const w = pick(c.r, LIFT_WHY);
    const t = `${two(6 + Math.floor(c.r() * 16))}:${two(Math.floor(c.r() * 60))}`;
    return { day, cells: [blkName(b, c), pick(c.r, ['A', 'B']), l(w.en.replace('{f}', String(f)).replace('{g}', String(f + 1)), w.zh.replace('{f}', String(f)).replace('{g}', String(f + 1))), t, l(`Back in service after ${1 + Math.floor(c.r() * 5)} h`, `${1 + Math.floor(c.r() * 5)} 小时后恢复`)] as Cell[] };
  });
  return {
    form: 'lift', issuer: c.estate, title: l('Lift fault log', '电梯故障登记'), ref: `${c.code}/LF/99${two(c.m)}`,
    cols: [l('Block', '组屋'), l('Lift', '电梯'), l('Fault', '故障'), l('Time', '时间'), l('Result', '结果')],
    rows,
  };
};

const NOISE: [L, L][] = [
  [l('Drilling during renovation before 9 am', '早上九点前装修钻墙'), l('Contractor told the hours', '已告知装修时间')],
  [l('Mahjong until 2 am', '打麻将打到半夜两点'), l('Spoke to the household', '已劝告')],
  [l('Karaoke at the void deck after 10 pm', '晚上十点后楼下唱卡拉 OK'), l('Ended at 10.30 pm', '十点半结束')],
  [l('Pigeons on the ledge, cooing at dawn', '窗台有鸽子，天亮就咕咕叫'), l('Spikes put up', '装了防鸽刺')],
  [l('Dog barking when the owners are out', '主人不在家时狗一直叫'), l('Owner spoken to', '已和主人谈过')],
  [l('Television loud late at night', '深夜电视声很大'), l('Spoke to the household', '已劝告')],
];
const noise: Make = (c) => {
  const rows = days(c, 3 + Math.floor(c.r() * 3)).map((day) => {
    const b = someBlock(c);
    const [what, done] = pick(c.r, NOISE);
    return { day, cells: [blkName(b, c), what, resident(c, b), done] as Cell[] };
  });
  return {
    form: 'noise', issuer: c.office, title: l('Noise complaints', '噪音投诉记录'), ref: `${c.code}/NC/99${two(c.m)}`,
    cols: [l('Where', '地点'), l('Complaint', '投诉内容'), l('From', '投诉人'), l('Action', '处理')],
    rows,
  };
};

const corridor: Make = (c) => {
  const b = someBlock(c);
  if (!b) return null;
  const [day] = days(c, 1);
  const by = Math.min(daysIn(c.m), day + 7);
  return {
    form: 'corridor', issuer: c.estate, title: l('Notice: clear the common corridors', '通知：清理公共走廊'), ref: `${c.code}/CC/99${two(c.m)}`,
    paras: [
      l(`Dated ${dm(day, c.m)}. During the fire safety check of ${blkName(b, c).en}, shoe racks, potted plants, bicycles and old furniture were found blocking the corridors and the staircase landings.`, `${dm(day, c.m)}。${blkName(b, c).zh}消防检查时，发现走廊和楼梯平台堆了鞋架、盆栽、脚车和旧家具，挡住通道。`),
      l(`Please clear them by ${dm(by, c.m)}. Anything still blocking the way after that date will be removed by the estate office and kept for fourteen days.`, `请在 ${dm(by, c.m)} 以前搬走。过了这天还挡路的东西，管理处会搬走，代为保管十四天。`),
      l('Plants along the parapet may stay as long as they do not stand on the floor of the walkway.', '靠墙台上的盆栽可以留，只要不摆在走道地上。'),
    ],
    sign: c.estate,
  };
};

const RENO: L[] = [l('Kitchen tiles replaced', '换厨房瓷砖'), l('Bathroom re-done', '重做浴室'), l('Window grilles', '装窗花'), l('New flooring, living room', '客厅重铺地板'), l('Wall between two bedrooms taken down (non-structural)', '拆两间卧室中间的墙（非承重）'), l('Repaint', '重新油漆')];
const reno: Make = (c) => {
  const rows = days(c, 3 + Math.floor(c.r() * 3)).map((day) => {
    const b = someBlock(c);
    const who = resident(c, b);
    const weeks = 1 + Math.floor(c.r() * 4);
    return { day, cells: [who, blkName(b, c), pick(c.r, RENO), l(`${weeks} week${weeks > 1 ? 's' : ''}`, `${weeks} 星期`), l('Approved', '批准')] as Cell[] };
  });
  return {
    form: 'reno', issuer: c.estate, title: l('Renovation permits', '组屋装修申请登记'), ref: `${c.code}/RN/99${two(c.m)}`,
    cols: [l('Applicant', '申请人'), l('Block', '组屋'), l('Works', '工程'), l('Length', '工期'), l('Result', '结果')],
    rows,
    notes: [l('Noisy work only from 9 am to 5 pm on weekdays; none on Sundays and public holidays.', '吵的工程只能在平日上午九点到下午五点做，星期天和公共假期不做。')],
  };
};

const DOGS: L[] = [l('Mongrel, brown', '土狗，咖啡色'), l('Pomeranian', '博美'), l('Silky terrier', '丝毛梗'), l('Mongrel, black and white', '土狗，黑白'), l('Dachshund', '腊肠狗')];
const DOGNAME = ['Lucky', 'Ah Huat', 'Blackie', 'Coco', 'Milo', 'Tiger', 'Snowy', 'Bobo'];
const dogs: Make = (c) => {
  const rows = days(c, 2 + Math.floor(c.r() * 3)).map((day) => {
    const b = someBlock(c);
    return { day, cells: [resident(c, b), pick(c.r, DOGNAME), pick(c.r, DOGS), `${c.code}-${String(1000 + Math.floor(c.r() * 8999))}`] as Cell[] };
  });
  return {
    form: 'dogs', issuer: c.office, title: l('Dog licences issued', '狗只登记'), ref: `${c.code}/DL/99${two(c.m)}`,
    cols: [l('Owner', '主人'), l('Name', '狗名'), l('Breed', '品种'), l('Licence', '执照号')],
    rows,
  };
};

const TRADES: L[] = [l('fishball noodles', '鱼圆面'), l('chicken rice', '鸡饭'), l('economy rice', '杂菜饭'), l('drinks', '饮料'), l('nasi lemak', '椰浆饭'), l('vegetables', '蔬菜'), l('roti prata', '印度煎饼'), l('fish', '鱼'), l('dried goods', '干货'), l('kueh', '糕点')];
const stalls: Make = (c) => {
  const rows = days(c, 1 + Math.floor(c.r() * 3)).map((day) => {
    const a = resident(c, someBlock(c)), b = resident(c, someBlock(c));
    return { day, cells: [`01-${two(1 + Math.floor(c.r() * 60))}`, pick(c.r, TRADES), a, b] as Cell[] };
  });
  return {
    form: 'stalls', issuer: l(`${c.d.en} market committee`, `${c.d.zh}巴刹管理委员会`), title: l('Market stall transfers', '巴刹摊位转让登记'), ref: `${c.code}/MS/99${two(c.m)}`,
    cols: [l('Stall', '摊号'), l('Trade', '卖什么'), l('From', '原摊主'), l('To', '新摊主')],
    rows,
  };
};

const PATROL: L[] = [
  l('All quiet.', '一切正常。'), l('All quiet.', '一切正常。'), l('Youths at the void deck, asked to go home.', '几个年轻人在楼下坐着，劝他们回家。'),
  l('Car parked across the fire lane, note on the windscreen.', '有车停在消防通道上，挡风玻璃上夹了条子。'), l('Street lamp out at the bus stop.', '巴士站那盏路灯不亮。'),
  l('A drunk man asleep on the bench; woke him, he walked home.', '有个醉汉睡在长椅上，叫醒了，自己走回家。'), l('Stray dogs by the market bins.', '巴刹垃圾桶边有野狗。'),
  l('Rain. Nobody about.', '下雨，街上没人。'), l('Door of the electrical room left open; shut it.', '配电房的门没关，关上了。'),
];
const ODD_PATROL: L[] = [
  l('03:10 every street lamp along the road went out for about a minute and came back on together. The Power Board has no fault on record.', '03:10 整条路的路灯一起熄了大约一分钟，又一起亮回来。电力局没有故障记录。'),
  l('02:40 a woman at the bus stop asked when the last bus would come. Told her it had gone at midnight; she said she would wait. At 03:30 she was not there. No bus passed.', '02:40 巴士站有个女人问末班车几点来。告诉她十二点已经开走了，她说她等。03:30 再经过，人不在了。这段时间没有车经过。'),
  l('04:12 the clock at the void deck stopped. Wound it. It stopped again at 04:12 the next night.', '04:12 楼下那个钟停了，上了发条。第二天晚上又停在 04:12。'),
];
const patrol: Make = (c) => {
  const rows = days(c, 6 + Math.floor(c.r() * 3)).map((day) => {
    const t = `${two([22, 23, 0, 1, 2, 3, 4][Math.floor(c.r() * 7)])}:${two(Math.floor(c.r() * 60))}`;
    return { day, cells: [t, blkName(someBlock(c), c), pick(c.r, PATROL)] as Cell[] };
  });
  // now and then a night that does not add up, put down as plainly as the rest
  if (c.r() < 0.3 && rows.length) {
    const row = rows[Math.floor(c.r() * rows.length)];
    const odd = pick(c.r, ODD_PATROL);
    row.cells[0] = odd.en.slice(0, 5);
    row.cells[2] = l(odd.en.slice(6), odd.zh.slice(6));
  }
  return {
    form: 'patrol', issuer: c.office, title: l('Night patrol log', '夜班巡逻日志'), ref: `${c.code}/NP/99${two(c.m)}`,
    cols: [l('Time', '时间'), l('Where', '地点'), l('Seen', '情况')],
    rows,
    sign: l('Night watchman, District Office', '区办事处夜班巡逻员'),
  };
};

const outage: Make = (c) => {
  const [day] = days(c, 1);
  const b = someBlock(c), b2 = someBlock(c);
  const from = 9 + Math.floor(c.r() * 4);
  return {
    form: 'outage', issuer: l('Power Board, for the District Office', '电力局（区办事处代贴）'), title: l('Notice of power interruption', '停电通知'), ref: `PB/${c.code}/99${two(c.m)}`,
    paras: [
      l(`To carry out maintenance at the ${c.d.en} substation, the electricity supply to ${blkName(b, c).en} and ${blkName(b2, c).en} will be cut on ${dm(day, c.m)} (${WD[weekday(day, c.m)].en}) from ${from}:00 to ${from + 3}:00.`, `为检修${c.d.zh}变电站，${dm(day, c.m)}（星期${WD[weekday(day, c.m)].zh}）${from}:00 至 ${from + 3}:00 停止供电，范围：${blkName(b, c).zh}、${blkName(b2, c).zh}。`),
      l('Lifts will not run during this time. Please switch off appliances before the supply is cut and keep the refrigerator door shut.', '停电期间电梯不开。停电前请关掉电器，冰箱门不要打开。'),
    ],
  };
};

const recycle: Make = (c) => {
  const rows = days(c, 4).map((day) => {
    const paper = 40 + Math.floor(c.r() * 160), card = 10 + Math.floor(c.r() * 60), tins = Math.floor(c.r() * 30);
    return { day, cells: [blkName(someBlock(c), c), `${paper} kg`, `${card} kg`, `${tins} kg`] as Cell[] };
  });
  return {
    form: 'recycle', issuer: c.office, title: l('Old newspapers and cardboard collected', '旧报纸、纸皮回收记录'), ref: `${c.code}/RC/99${two(c.m)}`,
    cols: [l('Block', '组屋'), l('Newspapers', '旧报纸'), l('Cardboard', '纸皮'), l('Tins', '铁罐')],
    rows,
    notes: [l('Collected by the rag-and-bone man on his rounds; the residents’ committee keeps the money for the year-end dinner.', '收旧货的每星期来收，钱由居民委员会留着办年终聚餐。')],
  };
};

const SWEEP: L[] = [l('Leaves after the rain', '雨后落叶'), l('Drains cleared', '清了沟渠'), l('Litter by the market', '巴刹旁的垃圾'), l('Bus stops washed', '洗了巴士站'), l('Fallen branch removed', '清走断枝'), l('Grass verges cut', '割了路边草')];
const sweep: Make = (c) => {
  const rows = days(c, 5).map((day) => ({ day, cells: [blkName(someBlock(c), c), pick(c.r, SWEEP), `${2 + Math.floor(c.r() * 4)}`] as Cell[] }));
  return {
    form: 'sweep', issuer: c.office, title: l('Street cleaning record', '街道清扫记录'), ref: `${c.code}/SW/99${two(c.m)}`,
    cols: [l('Where', '地点'), l('Work', '工作'), l('Sweepers', '清洁工人数')],
    rows,
  };
};

/** A bridge checked every Tuesday: its length, the joints and the railings. */
const bridge: Make = (c, side) => {
  const sl = side.find((s) => s.bridge);
  if (!sl?.bridge) return null;
  const br = sl.bridge;
  const rows: Sheet['rows'] = [];
  for (let day = 1; day <= c.last; day++) {
    if (weekday(day, c.m) !== 2) continue;
    const iso = `1999-${two(c.m)}-${two(day)}`;
    const grown = br.grows && iso >= br.grows.from;
    const base = br.length + (grown ? br.grows!.by : 0);
    const jitter = (hash(`bridge#${iso}`) % 3) - 1;
    const len = (base + jitter / 1000).toFixed(3);
    rows.push({ day, cells: [l(`${dm(day, c.m)} (Tue)`, `${dm(day, c.m)}（二）`), l(`${len} m`, `${len} 米`), l('Normal', '正常'), l('Normal', '正常'), l('Inspector on duty', '当班检查员')] });
  }
  return {
    form: 'bridge', issuer: c.office, title: l(`Weekly inspection · ${br.name.en}`, `例行检查记录 · ${br.name.zh}`), ref: `${c.code}/BR/99${two(c.m)}`,
    cols: [l('Date', '日期'), l('Length of deck', '桥面全长'), l('Expansion joints', '伸缩缝'), l('Railings', '栏杆'), l('Inspector', '检查员')],
    rows,
    notes: [l('The deck is a little longer on hot days. This is normal.', '气温高时桥面略长，属正常。')],
  };
};

const MAKE: Record<FormId, Make> = {
  repairs, lost, water: meters('water'), power: meters('power'), bus, mosquito, lift, noise, corridor, reno, dogs, stalls, patrol, outage, recycle, sweep, bridge,
  letter: () => null,
};

/* ---------------- on paper ---------------- */
const txt = (c: Cell, zh: boolean) => esc(typeof c === 'string' ? c : zh ? c.zh : c.en);

export function render(s: Sheet, zh: boolean): string {
  const T = (x: L) => esc(zh ? x.zh : x.en);
  const head = `<header class="rt-sheet__head"><p class="rt-sheet__issuer">${T(s.issuer)}</p><h3 class="rt-sheet__title">${T(s.title)}</h3><p class="rt-sheet__ref">${esc(s.ref)}</p></header>`;
  const table = s.cols && s.rows
    ? `<table class="rt-table"><thead><tr>${s.form === 'water' || s.form === 'power' || s.form === 'bridge' ? '' : `<th>${zh ? '日期' : 'Date'}</th>`}${s.cols.map((c) => `<th>${T(c)}</th>`).join('')}</tr></thead><tbody>${
        s.rows.length
          ? s.rows.map((r) => `<tr>${s.form === 'water' || s.form === 'power' || s.form === 'bridge' ? '' : `<td class="rt-d">${r.day > 0 ? esc(dm(r.day, s.m ?? 1)) : ''}</td>`}${r.cells.map((c) => `<td>${txt(c, zh)}</td>`).join('')}</tr>`).join('')
          : `<tr><td colspan="${s.cols.length + 1}" class="rt-none">${zh ? '本月无记录。' : 'Nothing this month.'}</td></tr>`
      }</tbody></table>`
    : '';
  const paras = s.paras ? `<div class="rt-paras">${s.paras.map((p) => `<p>${T(p)}</p>`).join('')}</div>` : '';
  const notes = s.notes?.length ? `<ul class="rt-notes">${s.notes.map((n) => `<li>${T(n)}</li>`).join('')}</ul>` : '';
  const sign = s.sign ? `<p class="rt-sign">${T(s.sign)}</p>` : '';
  return `<section class="rt-sheet rt-sheet--${s.form}${s.paras ? ' rt-sheet--letter' : ''}">${head}${table}${paras}${notes}${sign}</section>`;
}

export type { SideRow };
