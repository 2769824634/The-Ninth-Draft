/**
 * The island's people: the names on the letterboxes, the trades, and the
 * dozen faces who turn up everywhere. All of them are made up. The surnames
 * and given names are the commonest ones on the island, the way a letterbox
 * wall reads; none stands for a real person. Friends writing records may put
 * the regulars (CAST) in their stories by name. The regulars are placeholders
 * since 2026-11-25 (names and lines cleared with the old story; see 27fc6a2).
 *
 * Households are not stored: src/app/visitor/households.ts works each flat
 * out from its postcode, floor and door, so everyone sees the same neighbours.
 */

export type L = { en: string; zh: string };

/** [as the letterbox prints it, in Chinese]. Roughly how a 1999 block reads. */
export const CHINESE: [string, string][] = [
  ['TAN', '陈'], ['LIM', '林'], ['LEE', '李'], ['NG', '黄'], ['ONG', '王'], ['WONG', '黄'], ['GOH', '吴'], ['CHUA', '蔡'],
  ['CHAN', '曾'], ['KOH', '许'], ['TEO', '张'], ['ANG', '洪'], ['YEO', '杨'], ['TOH', '卓'], ['SIM', '沈'], ['LOW', '刘'],
  ['SEAH', '佘'], ['HENG', '王'], ['QUEK', '郭'], ['FOO', '胡'], ['CHONG', '张'], ['HO', '何'], ['LOH', '罗'], ['TAY', '郑'],
  ['CHEW', '周'], ['POH', '傅'], ['NEO', '梁'], ['KHOO', '邱'], ['LAU', '刘'], ['YAP', '叶'], ['SOH', '苏'], ['PANG', '彭'],
];
/** Malay households: the father's name the way the letterbox shows it. */
export const MALAY: [string, string][] = [
  ['RAHMAN', '拉曼'], ['SALLEH', '沙列'], ['AZIZ', '阿齐兹'], ['HAMID', '哈米'], ['YUSOF', '尤索夫'], ['ISMAIL', '依斯迈'],
  ['RASHID', '拉希'], ['OSMAN', '奥斯曼'], ['KASSIM', '卡欣'], ['HASHIM', '哈欣'], ['JAMIL', '查米'], ['SAMAD', '沙末'],
];
/** Indian households: an initial and a name. */
export const INDIAN: [string, string][] = [
  ['KRISHNAN', '克里希南'], ['MUTHU', '慕都'], ['RAJAN', '拉章'], ['SUPPIAH', '苏比亚'], ['NAIR', '奈尔'], ['PILLAI', '比莱'],
  ['SINGH', '辛格'], ['RAMASAMY', '拉玛沙米'], ['GOPAL', '戈帕尔'], ['MANI', '马尼'],
];
/** Eurasian households: the surname. */
export const EURASIAN: [string, string][] = [
  ['DE SOUZA', '德苏沙'], ['PEREIRA', '佩雷拉'], ['RODRIGUES', '罗德里格'], ['FERNANDEZ', '费南德'], ['D\'CRUZ', '德克鲁兹'], ['OLIVEIRO', '奥利维罗'],
];
/** Initials for the Chinese plates ("TAN K.S."). */
export const INITIALS = 'ABCGHKLMPSTWY';

/** Trades, the way a neighbour would say it. */
export const JOBS: L[] = [
  { en: 'drives the 51', zh: '开 51 号巴士' },
  { en: 'has a drinks stall at the market', zh: '在巴刹开饮料摊' },
  { en: 'clerk in the Axis', zh: '在中枢当文员' },
  { en: 'nurse, night shift', zh: '护士，上夜班' },
  { en: 'teaches primary school', zh: '小学老师' },
  { en: 'odd jobs', zh: '打散工' },
  { en: 'drives a taxi', zh: '开德士' },
  { en: 'electronics factory, Woodlands', zh: '兀兰电子厂' },
  { en: 'retired', zh: '退休了' },
  { en: 'shipyard, Jurong', zh: '裕廊船厂' },
  { en: 'security guard', zh: '当保安' },
  { en: 'hairdresser', zh: '剪头发的' },
  { en: 'sells insurance', zh: '卖保险' },
  { en: 'seamstress, works from home', zh: '在家车衣' },
  { en: 'renovation contractor', zh: '做装修' },
  { en: 'runs a provision shop', zh: '开杂货店' },
  { en: 'cook at a coffee shop', zh: '咖啡店掌厨' },
  { en: 'at the port', zh: '在码头做工' },
  { en: 'polytechnic student', zh: '读理工学院' },
  { en: 'nobody is sure', zh: '没人说得清' },
];

/**
 * The regulars. Each lives somewhere, works somewhere, keeps hours, and has
 * a couple of things they say. The lines go by island time; nothing here
 * knows about drafts.
 */
export interface Regular {
  id: string;
  name: L;
  role: L;
  /** Where they live (a district id from districts.ts). */
  district: string;
  /** Hours they are about, island time, [from, to). */
  hours: [number, number];
  lines: L[];
}

export const CAST: Regular[] = [
  { id: 'lian', name: { en: 'Test person 01', zh: '测试人物 01' }, role: { en: 'sits at the void deck every day', zh: '天天坐在楼下' }, district: 'toa-payoh', hours: [7, 21],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'seng', name: { en: 'Test person 02', zh: '测试人物 02' }, role: { en: 'fishball noodles, Stall 01-17', zh: '鱼圆面，01-17 号摊' }, district: 'ang-mo-kio', hours: [6, 14],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'rahim', name: { en: 'Test person 03', zh: '测试人物 03' }, role: { en: 'postman', zh: '邮差' }, district: 'bedok', hours: [10, 15],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'pillai', name: { en: 'Test person 04', zh: '测试人物 04' }, role: { en: 'drives the 51', zh: '51 号巴士司机' }, district: 'hougang', hours: [5, 23],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'huat', name: { en: 'Test person 05', zh: '测试人物 05' }, role: { en: 'newspaper vendor', zh: '报贩' }, district: 'toa-payoh', hours: [5, 11],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'goh', name: { en: 'Test person 06', zh: '测试人物 06' }, role: { en: 'provision shop under Blk 12', zh: '12 座楼下的杂货店' }, district: 'geylang', hours: [8, 22],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'hock', name: { en: 'Test person 07', zh: '测试人物 07' }, role: { en: 'fishmonger, wet market', zh: '巴刹卖鱼的' }, district: 'bukit-merah', hours: [5, 12],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'mani', name: { en: 'Test person 08', zh: '测试人物 08' }, role: { en: 'school caretaker', zh: '学校校工' }, district: 'woodlands', hours: [6, 19],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'keong', name: { en: 'Test person 09', zh: '测试人物 09' }, role: { en: 'drinks at the coffee shop', zh: '咖啡店冲茶的' }, district: 'jurong-west', hours: [6, 23],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'lim', name: { en: 'Test person 10', zh: '测试人物 10' }, role: { en: 'drives a taxi, nights', zh: '开夜班德士' }, district: 'serangoon', hours: [20, 6],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'pereira', name: { en: 'Test person 11', zh: '测试人物 11' }, role: { en: 'estate office counter', zh: '组屋管理处柜台' }, district: 'queenstown', hours: [9, 17],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
  { id: 'mei', name: { en: 'Test person 12', zh: '测试人物 12' }, role: { en: 'Window 3, Records Office', zh: '记录署三号窗口' }, district: 'axis', hours: [9, 17],
    lines: [
      { en: 'Test line. A placeholder for what this person says.', zh: '测试台词。这个人要说的话先占个位。' },
      { en: 'Second test line.', zh: '第二句测试台词。' },
    ] },
];

/** For the letters: who writes, and from where. */
export const POSTCARD_FROM: L[] = [
  { en: 'Ipoh', zh: '怡保' }, { en: 'Hat Yai', zh: '合艾' }, { en: 'Batam', zh: '巴淡' }, { en: 'Penang', zh: '槟城' },
  { en: 'Melaka', zh: '马六甲' }, { en: 'Perth', zh: '珀斯' }, { en: 'Madras', zh: '马德拉斯' }, { en: 'Xiamen', zh: '厦门' },
  { en: 'Genting', zh: '云顶' }, { en: 'Kuala Lumpur', zh: '吉隆坡' },
];
