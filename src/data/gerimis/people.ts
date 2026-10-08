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
  { id: 'lian', name: { en: 'Auntie Lian', zh: '莲姨' }, role: { en: 'sits at the void deck every day', zh: '天天坐在楼下' }, district: 'toa-payoh', hours: [7, 21],
    lines: [
      { en: 'Eaten already? If you want chicken rice, don\'t go on Monday, the stall is closed. Go to the one at the next block, the uncle there gives more cucumber.', zh: '吃了没？要吃鸡饭礼拜一别去，那档不开。去隔壁座那间，那个安哥给的黄瓜比较多。' },
      { en: 'Your letterbox door is crooked, that is why it won\'t lock. Push it up first, then to the left. The estate office will say they come and fix it, but they take two months.', zh: '你那个信箱门是歪的，所以锁不上。先往上推，再往左。管理处会说来修，不过要等两个月。' },
    ] },
  { id: 'seng', name: { en: 'Ah Seng', zh: '阿成' }, role: { en: 'fishball noodles, Stall 01-17', zh: '鱼圆面，01-17 号摊' }, district: 'ang-mo-kio', hours: [6, 14],
    lines: [
      { en: 'Dry or soup? Dry comes with chilli and vinegar, soup is lighter. Two dollars, add fishcake fifty cents more. You look like dry, chilli on the side.', zh: '干的还是汤的？干的有辣椒和醋，汤的清淡一点。两块，加鱼饼多五毛。看你的样子要干的，辣椒另外放。' },
      { en: 'Fishcake sold out already. I make it myself every morning, only enough for about a hundred bowls. Come before nine next time.', zh: '鱼饼卖完了。我每天早上自己做，大概够一百碗。下次九点以前来。' },
    ] },
  { id: 'rahim', name: { en: 'Encik Rahim', zh: '拉欣大叔' }, role: { en: 'postman', zh: '邮差' }, district: 'bedok', hours: [10, 15],
    lines: [
      { en: 'Nothing for you today, only another one for the people who lived there before. If you know where they moved, write it on the envelope. If not, write "Not at this address" and drop it in the red postbox.', zh: '今天没有你的信，又是寄给以前住户的。知道他们搬去哪，就把地址写在信封上；不知道就写「查无此人」，丢进红色邮筒。' },
      { en: 'Rain or not, the bicycle goes out. I wrap the letters in plastic, so they stay dry. Me, not so much.', zh: '下不下雨脚车都照骑。信我用塑料袋包着，不会湿。湿的是我。' },
    ] },
  { id: 'pillai', name: { en: 'Mr Pillai', zh: '比莱先生' }, role: { en: 'drives the 51', zh: '51 号巴士司机' }, district: 'hougang', hours: [5, 23],
    lines: [
      { en: 'Exact fare, please. The box does not give change and neither do I. If you take this bus every day, buy a farecard at the interchange, it is cheaper.', zh: '车资请给准。钱箱不找钱，我也不找。每天都坐的话，去转换站买张车票卡，比较便宜。' },
      { en: 'Move to the back, there is plenty of room at the back. Everyone stands at the door because they are afraid to miss their stop. I will stop, just press the bell.', zh: '往后面走，后面很多位。大家都挤在门口，怕错过站。我会停的，按铃就好。' },
    ] },
  { id: 'huat', name: { en: 'Ah Huat', zh: '阿发' }, role: { en: 'newspaper vendor', zh: '报贩' }, district: 'toa-payoh', hours: [5, 11],
    lines: [
      { en: 'The Daily is thirty cents. Sunday is fifty, because it has the cinema times and the job ads. Delivered to your door, nine dollars a month, pay me at the end of the month.', zh: '日报三毛。礼拜天五毛，因为有戏院场次和招聘广告。送上门一个月九块，月底跟我算。' },
      { en: 'Yesterday\'s paper? Ten cents. Most of the news is the same, only the weather is wrong.', zh: '昨天的报纸？一毛。新闻大多一样，只有天气不对。' },
    ] },
  { id: 'goh', name: { en: 'Towkay Goh', zh: '吴头家' }, role: { en: 'provision shop under Blk 12', zh: '12 座楼下的杂货店' }, district: 'geylang', hours: [8, 22],
    lines: [
      { en: 'No need to pay now, I write it in the book and you settle at the end of the month. Everybody in this block does it. I have been here twenty years, nobody has run away yet.', zh: '不用现在给，我记在本子上，月底再算。这座楼大家都这样。我在这里二十年，还没有人跑掉。' },
      { en: 'The gas cylinder comes on Thursday morning. Leave me your door number by Wednesday night. Tell your neighbour also, last time she ran out in the middle of cooking.', zh: '煤气礼拜四早上到，礼拜三晚上以前把门牌留给我。顺便跟你邻居说，上次她煮到一半没气了。' },
    ] },
  { id: 'hock', name: { en: 'Ah Hock', zh: '阿福' }, role: { en: 'fishmonger, wet market', zh: '巴刹卖鱼的' }, district: 'bukit-merah', hours: [5, 12],
    lines: [
      { en: 'Look at the eyes. Clear eyes means fresh, cloudy means yesterday. Then press the body, it should spring back. If the fishmonger won\'t let you press, go to another stall.', zh: '看眼睛。眼睛清的是新鲜的，浑的是昨天的。再按一下鱼身，要弹回来。卖鱼的不让你按，就换一档。' },
      { en: 'The floor is wet, mind your slippers. Every week somebody falls here, always on a Saturday when it is most crowded.', zh: '地是湿的，小心你的拖鞋。每个礼拜都有人在这里摔跤，都是礼拜六人最多的时候。' },
    ] },
  { id: 'mani', name: { en: 'Uncle Mani', zh: '马尼叔' }, role: { en: 'school caretaker', zh: '学校校工' }, district: 'woodlands', hours: [6, 19],
    lines: [
      { en: 'The gate closes at six. If you want to use the field after that, you need a letter from the principal. I don\'t make the rules, I only hold the keys.', zh: '六点关门。之后要用操场，得有校长的信。规矩不是我定的，我只管钥匙。' },
      { en: 'Lost and found has forty water bottles, eleven jackets and one trumpet. If your child lost something, come on Friday afternoon, that is when I open the cupboard.', zh: '失物招领有四十个水壶、十一件外套和一把小号。你孩子丢了东西，礼拜五下午来，我那时候开柜子。' },
    ] },
  { id: 'keong', name: { en: 'Ah Keong', zh: '阿强' }, role: { en: 'drinks at the coffee shop', zh: '咖啡店冲茶的' }, district: 'jurong-west', hours: [6, 23],
    lines: [
      { en: 'Kopi-o kosong, I know already. You order the same thing every morning, so I start making it when I see you cross the road.', zh: '咖啡乌无糖，知道了。你每天早上都点一样的，我看到你过马路就开始冲。' },
      { en: 'The table is wet because I just wiped it. The cloth is also wet. Give it one minute in this weather, it dries by itself.', zh: '桌子湿是因为我刚抹过。抹布也是湿的。这种天气等一分钟，自己就干了。' },
    ] },
  { id: 'lim', name: { en: 'Mr Lim', zh: '林先生' }, role: { en: 'drives a taxi, nights', zh: '开夜班德士' }, district: 'serangoon', hours: [20, 6],
    lines: [
      { en: 'Which way do you want, the expressway or my way? The expressway is faster but there is a toll before nine. My way goes past the hawker centre, if you are hungry I can stop.', zh: '你要走哪条，高速公路还是我的路？高速快，不过九点前要过路费。我的路经过小贩中心，你饿的话我可以停一下。' },
      { en: 'After midnight the meter adds fifty percent. I don\'t make the rules, the meter does. If you are going far, share with a friend.', zh: '过了十二点车费加五成。规矩不是我定的，是表定的。路远的话，找个朋友一起坐。' },
    ] },
  { id: 'pereira', name: { en: 'Miss Pereira', zh: '佩雷拉小姐' }, role: { en: 'estate office counter', zh: '组屋管理处柜台' }, district: 'queenstown', hours: [9, 17],
    lines: [
      { en: 'Lift complaints, form B. Leaking ceiling, also form B. Noisy neighbour, form B as well. Fill in your door number clearly, last week someone wrote only "upstairs".', zh: '电梯投诉填 B 表。天花板漏水也是 B 表。邻居吵，还是 B 表。门牌写清楚，上礼拜有人只写了「楼上」。' },
      { en: 'The corridor is common property, so you cannot put a cupboard there. Shoes and a few plants are fine. A bicycle, we will talk about it.', zh: '走廊是公共地方，不能放柜子。鞋和几盆花可以。脚车的话，我们再谈。' },
    ] },
  { id: 'mei', name: { en: 'Auntie Mei', zh: '美姨' }, role: { en: 'Window 3, Records Office', zh: '记录署三号窗口' }, district: 'axis', hours: [9, 17],
    lines: [
      { en: 'Take a number from the machine first. When your number shows on the board, come to the window it says. Without a number I cannot serve you, even if there is nobody in the queue.', zh: '先去机器那边拿号码，号码在牌子上亮了，就到它写的那个窗口。没有号码我不能帮你办，就算前面一个人都没有也不行。' },
      { en: 'Black or blue ink only. Red ink is for the office, so we can see what we changed. If you write in pencil, we will ask you to write it again.', zh: '只能用黑笔或蓝笔。红笔是我们署里用的，这样看得出我们改了什么。用铅笔写的，会请你重写一遍。' },
    ] },
];

/** For the letters: who writes, and from where. */
export const POSTCARD_FROM: L[] = [
  { en: 'Ipoh', zh: '怡保' }, { en: 'Hat Yai', zh: '合艾' }, { en: 'Batam', zh: '巴淡' }, { en: 'Penang', zh: '槟城' },
  { en: 'Melaka', zh: '马六甲' }, { en: 'Perth', zh: '珀斯' }, { en: 'Madras', zh: '马德拉斯' }, { en: 'Xiamen', zh: '厦门' },
  { en: 'Genting', zh: '云顶' }, { en: 'Kuala Lumpur', zh: '吉隆坡' },
];
