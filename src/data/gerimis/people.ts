/**
 * The island's people: the names on the letterboxes, the trades, and the
 * dozen faces who turn up everywhere. All of them are made up. The surnames
 * and given names are the commonest ones on the island, the way a letterbox
 * wall reads; none stands for a real person. Friends writing records may put
 * the regulars (CAST) in their stories by name.
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
  { id: 'lian', name: { en: 'Auntie Lian', zh: '莲姨' }, role: { en: 'sits at the void deck', zh: '天天坐在楼下' }, district: 'toa-payoh', hours: [7, 21],
    lines: [{ en: 'Eaten already? The chicken rice is closed Mondays.', zh: '吃了没？鸡饭档礼拜一不开。' }, { en: 'Your letterbox door is crooked. Push it up, then left.', zh: '你那个信箱门歪的，往上推再往左。' }] },
  { id: 'seng', name: { en: 'Ah Seng', zh: '阿成' }, role: { en: 'fishball noodles, Stall 01-17', zh: '鱼圆面，01-17 号摊' }, district: 'ang-mo-kio', hours: [6, 14],
    lines: [{ en: 'Dry or soup? Chilli on the side, the way your face says.', zh: '干的汤的？辣椒另外放，看你的脸就知道。' }, { en: 'Sold out of fishcake. Come before nine.', zh: '鱼饼卖完了，九点前来。' }] },
  { id: 'rahim', name: { en: 'Encik Rahim', zh: '拉欣大叔' }, role: { en: 'postman', zh: '邮差' }, district: 'bedok', hours: [10, 15],
    lines: [{ en: 'Nothing for you today. Something for the one before you, again.', zh: '今天没你的信。又有寄给前一个住户的。' }, { en: 'Rain or not, the bicycle goes. The letters get wet, not me.', zh: '下不下雨脚车都照骑，湿的是信，不是我。' }] },
  { id: 'pillai', name: { en: 'Mr Pillai', zh: '比莱先生' }, role: { en: 'drives the 51', zh: '51 号巴士司机' }, district: 'hougang', hours: [5, 23],
    lines: [{ en: 'Exact fare. The machine does not give change and neither do I.', zh: '车资给准。机器不找钱，我也不找。' }, { en: 'Move to the back, plenty of room at the back.', zh: '往后面走，后面很多位。' }] },
  { id: 'huat', name: { en: 'Ah Huat', zh: '阿发' }, role: { en: 'newspaper vendor', zh: '报贩' }, district: 'toa-payoh', hours: [5, 11],
    lines: [{ en: 'Daily is thirty cents. The Sunday one has the cinema times.', zh: '日报三毛钱。礼拜天那份有戏院场次。' }, { en: 'Yesterday\'s? Ten cents. Same news, mostly.', zh: '昨天的？一毛。新闻差不多。' }] },
  { id: 'goh', name: { en: 'Towkay Goh', zh: '吴头家' }, role: { en: 'provision shop under Blk 12', zh: '12 座楼下的杂货店' }, district: 'geylang', hours: [8, 22],
    lines: [{ en: 'Write it in the book, pay end of month. Everybody does.', zh: '记在本子上，月底再算。大家都这样。' }, { en: 'Gas cylinder comes Thursday. Tell your neighbour also.', zh: '煤气礼拜四到，顺便跟你邻居说。' }] },
  { id: 'hock', name: { en: 'Ah Hock', zh: '阿福' }, role: { en: 'fishmonger, wet market', zh: '巴刹卖鱼的' }, district: 'bukit-merah', hours: [5, 12],
    lines: [{ en: 'Look at the eyes. Clear eyes, fresh fish. Like people.', zh: '看眼睛。眼睛清的鱼新鲜，人也一样。' }, { en: 'Floor is wet, mind your slippers.', zh: '地是湿的，小心你的拖鞋。' }] },
  { id: 'mani', name: { en: 'Uncle Mani', zh: '马尼叔' }, role: { en: 'school caretaker', zh: '学校校工' }, district: 'woodlands', hours: [6, 19],
    lines: [{ en: 'Gate closes at six. After six you are a trespasser, very official.', zh: '六点关门。六点以后就是擅闯，很正式的。' }, { en: 'Lost and found has forty water bottles. One of them is yours, surely.', zh: '失物招领有四十个水壶，总有一个是你的。' }] },
  { id: 'keong', name: { en: 'Ah Keong', zh: '阿强' }, role: { en: 'drinks at the coffee shop', zh: '咖啡店冲茶的' }, district: 'jurong-west', hours: [6, 23],
    lines: [{ en: 'Kopi-o kosong, I know. You order the same every time.', zh: '咖啡乌无糖，知道了。你每次都点一样的。' }, { en: 'Table is wet? The cloth is also wet. Nothing to do.', zh: '桌子湿？抹布也湿，没办法。' }] },
  { id: 'lim', name: { en: 'Mr Lim', zh: '林先生' }, role: { en: 'drives a taxi, nights', zh: '开夜班德士' }, district: 'serangoon', hours: [20, 6],
    lines: [{ en: 'Which way you want? The expressway or my way?', zh: '你要走哪条？高速公路还是我的路？' }, { en: 'Midnight surcharge. I don\'t make the rules, the meter does.', zh: '午夜附加费。规矩不是我定的，是表定的。' }] },
  { id: 'pereira', name: { en: 'Miss Pereira', zh: '佩雷拉小姐' }, role: { en: 'estate office counter', zh: '组屋管理处柜台' }, district: 'queenstown', hours: [9, 17],
    lines: [{ en: 'Lift complaints, form B. Leaking ceiling, form B also. We like form B.', zh: '电梯投诉填 B 表。天花板漏水也填 B 表。我们喜欢 B 表。' }, { en: 'The corridor is common property. Your shoes are not.', zh: '走廊是公共地方，你的鞋不是。' }] },
  { id: 'mei', name: { en: 'Auntie Mei', zh: '美姨' }, role: { en: 'Window 3, Records Office', zh: '记录署三号窗口' }, district: 'axis', hours: [9, 17],
    lines: [{ en: 'Number please. No number, no window.', zh: '号码呢？没号码，没窗口。' }, { en: 'Black or blue ink. Red is for us.', zh: '黑笔蓝笔都行，红笔是我们用的。' }] },
];

/** For the letters: who writes, and from where. */
export const POSTCARD_FROM: L[] = [
  { en: 'Ipoh', zh: '怡保' }, { en: 'Hat Yai', zh: '合艾' }, { en: 'Batam', zh: '巴淡' }, { en: 'Penang', zh: '槟城' },
  { en: 'Melaka', zh: '马六甲' }, { en: 'Perth', zh: '珀斯' }, { en: 'Madras', zh: '马德拉斯' }, { en: 'Xiamen', zh: '厦门' },
  { en: 'Genting', zh: '云顶' }, { en: 'Kuala Lumpur', zh: '吉隆坡' },
];
