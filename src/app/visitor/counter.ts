/**
 * What the people at the door and at Window 3 say: the attendant with the
 * visitors' book, the officer in the ferry terminal's arrival hall, the clerk
 * who does Form RO-9. Short, plain, one thing on the island at a time. Kept
 * apart from archivist.json because these lines only exist on the
 * registration pages.
 */
import { DISTRICTS, type DistrictId } from './districts';

export type L = { en: string; zh: string };

/** The visitors' book at the door (/register/). */
export const DOOR = {
  greet: { en: 'Sign the book, please. Name, and where from if you like. The pen is on a string because the last one walked.', zh: '签个名吧。名字，从哪来，想写就写。笔拴着绳子，上一支被人带走了。' },
  name: { en: '“{name}”. Fine. Where from? You can leave it.', zh: '「{name}」，好。从哪来？不写也行。' },
  empty: { en: 'Any name will do. Most people write the first one they think of.', zh: '写个名字就行。大多数人写的是第一个想到的。' },
  signed: { en: 'That is your pass. Show it in the reading room if anyone asks. Nobody asks.', zh: '这是你的阅览证。阅览室有人问就给他看，一般没人问。' },
  stay: { en: 'If you mean to stay, Window 3 does residents. Take a number first.', zh: '要住下来，三号窗口办居民登记。先取号。' },
  back: { en: 'Back again. Your name is still in the book, two pages up.', zh: '又来啦。你的名字还在本子上，往前翻两页。' },
} as const;

/** Form RO-9 and Window 3 (/register/resident/). */
export const COUNTER = {
  greet: { en: 'Form RO-9. Black or blue ink. Tick one box only; people tick two and we send it back.', zh: 'RO-9 表。蓝笔黑笔都行。只勾一格，勾两格的我们退回。' },
  codeEmpty: { en: 'A name, please. Any name. The Office is not fussy.', zh: '写个名字吧，什么名字都行，署里不挑。' },
  code: { en: '“{name}”. Hm. I will make a note.', zh: '「{name}」。嗯，记下了。' },
  codeLong: { en: '“{name}”. Long. The form has twenty-four boxes. Do try.', zh: '「{name}」。有点长。表格一共二十四格，尽量。' },
  codeNum: { en: 'A number? We have plenty of those already.', zh: '光是数字？我们数字够多了。' },
  codeKnown: { en: '“{name}”. That one is on file already. Never mind, there are two of most names.', zh: '「{name}」，已经有人叫这个了。没关系，大多数名字都有两个。' },
  tickG: { en: 'Born here. Then you do not ballot. We find the block you grew up in and reissue at the old address.', zh: '本岛出生的不用抽签。找到你小时候住的那一座，按旧址补发。' },
  tickR: { en: 'Since what year? Write the year, not “a long time”.', zh: '自哪一年起？写年份，别写「很久了」。' },
  tickN: { en: 'New arrival. They should have given you a card at the ferry terminal. No? Then fill it in now.', zh: '新抵岛的。渡轮码头应该给过你一张入境卡。没有？那就现在补填。' },
  dobBad: { en: 'Day, month, year. A day that happened, this century, and not after today.', zh: '日、月、年。要是本世纪真有过的一天，而且不能晚过今天。' },
  dob: { en: 'Born {date}. Nobody here checks it against anything. Write it the same way next time.', zh: '{date} 出生。署里没东西可对，下回照样写就行。' },
  sex: { en: 'M or F, one box. The card has room for one letter.', zh: '男或女，勾一格。证上只留一个字母的位置。' },
  sinceEarly: { en: 'Resident since before you were born? That would be your mother. Your own year, please.', zh: '还没出生就住在岛上了？那是你妈妈。写你自己的。' },
  sinceBad: { en: 'A year between 1900 and this one, please.', zh: '写 1900 年到今年之间的年份。' },
  from: { en: 'Where were you before? The form has a line for it. You can leave it blank.', zh: '之前在哪？表上有一行。空着也行。' },
  // ferry terminal, new arrivals only
  ferry: { en: 'Arrival hall. Port of embarkation, if you would. Purpose of visit is already ticked.', zh: '入境大厅。从哪个港口上的船，愿意就写。来岛事由已经替你勾好了。' },
  landed: { en: 'Landed. Keep the stub. The Office will ask for it, and then lose it.', zh: '登岸，盖章。存根留着，署里会要，然后会弄丢。' },
  // the queue
  ticket: { en: 'Take a number. The machine runs out of paper about this time of day.', zh: '先取号。这个钟点，机器差不多该没纸了。' },
  waiting: { en: 'Number {n}. {k} ahead of you. They are all here about letterboxes.', zh: '{n} 号。前面还有 {k} 个，都是来问信箱的。' },
  called: { en: 'Number {n}, Window 3.', zh: '请 {n} 号到 3 号窗口。' },
  // the district, for the ballot
  district: { en: 'Which part of the island? The ballot is by district. Only places with homes count.', zh: '想住哪一带？抽签按区抽。只算住人的地方。' },
  region: { en: '{region}. Which district? The list is under the sheet.', zh: '{region}，好。哪个区？单子在地图底下。' },
  noHomes: { en: '{name}? Nobody lives there. Pick somewhere with a letterbox.', zh: '{name}？那里没人住。挑个有信箱的地方。' },
  unsurveyed: { en: '{name} has not been surveyed. Nobody is filed there, and nobody asks.', zh: '{name}没测绘过。那里没登记过人，也没人问。' },
  drum: { en: 'The drum, then. Turn it once. The drum knows if you turn it twice.', zh: '抽签。摇一下就好，摇两下签筒知道。' },
  drawnLow: { en: 'Blk {blk}, floor {floor}. Low down. You will hear the void deck, weddings on Saturdays and funerals on weekdays.', zh: '{blk} 座，{floor} 楼。楼层低，楼下的事都听得见，周六是婚礼，平日是白事。' },
  drawnHigh: { en: 'Blk {blk}, floor {floor}. The lift stops every third floor in the older blocks. You will get used to it.', zh: '{blk} 座，{floor} 楼。老组屋的电梯隔三层才停，住久就惯了。' },
  again: { en: 'Same name, same district, same flat. The drum is not that kind of drum.', zh: '同一个名字、同一个区，抽出来都是同一间。这个签筒不是那种签筒。' },
  // born here: the old address
  find: { en: 'Which block? Number and street, or the postcode. People remember postcodes.', zh: '哪一座？座号加街名，或者邮编。人都记得邮编。' },
  found: { en: 'Blk {blk}, built {year}. Which floor were you on? And which door?', zh: '{blk} 座，{year} 年建的。住几楼？哪个门？' },
  foundRebuilt: { en: 'Blk {blk}. The old block was pulled down and a new one went up on the same spot in {year}, same number. Most of the old families were given flats in the new one. Which floor were you on? We put you on the same floor and door.', zh: '{blk} 座。旧楼拆掉了，{year} 年在原地盖了新楼，座号没变，原来的住户大多分回新楼。你以前住几楼？按原来的楼层和门牌给你。' },
  shop: { en: 'That one has no flats in it. Shops downstairs, nobody upstairs.', zh: '那一座没有住家，楼下是店，楼上没人。' },
  reissue: { en: 'Reissued at the old address. It saves us drawing a new line on the map.', zh: '按旧址补发。省得我们在地图上再画一条线。' },
  review: { en: 'Read it back. Once it is filed, it is the version we keep.', zh: '核对一遍。归档以后，署里就认这一份。' },
  pmark: { en: 'The P after your code? The computer puts it there by itself. Everybody this year has one. Don\'t worry about it.', zh: '代码后面那个 P？电脑自己加的，今年人人都有，不用管它。' },
  done: { en: 'Your card, still warm. The keys are on the hook; the tag has your door on it.', zh: '身份证，还热着。钥匙挂在钩上，牌子上写着门牌。' },
  known: ['heuss', 'yosh', 'frank'],
} as const;

/** What the clerk asks at the window, by the box ticked. `{year}` is filled in. */
export const INTERVIEW: Record<'G' | 'R' | 'N', L[]> = {
  G: [
    { en: 'Born at which hospital? It does not matter. The card does not say. It says Gerimis.', zh: '在哪家医院生的？不要紧，证上不写，只写霏微。' },
    { en: 'We look your old block up in the directory. Blocks that were knocked down are still in the directory.', zh: '你小时候那一座，在街道图里查。拆掉了的，街道图里也还在。' },
  ],
  R: [
    { en: 'Since {year}. Moved house since then? It does not matter. We only write the last one.', zh: '自 {year} 年起。中间搬过家吗？没关系，只写最后一处。' },
    { en: 'The card will not say how long. There is a line of letters under the date for that.', zh: '证上不写住了多久。出生日期底下有一行代码，管这个。' },
  ],
  N: [
    { en: 'First time on the island? It rains at four. Most days.', zh: '第一次来岛上？下午四点下雨，大多数日子。' },
    { en: 'Flats are by ballot. You do not choose the block. The drum does.', zh: '组屋要抽签。不是你挑楼，是签筒挑。' },
  ],
};

/** What she says to the year on the form, by decade. */
export const SINCE: [number, L][] = [
  [1960, { en: '{year}. Then you remember the kampong wells. Write it down anyway.', zh: '{year} 年。那你记得甘榜的水井。照样写上。' }],
  [1970, { en: '{year}. Before the new towns, most of them. You moved more than once.', zh: '{year} 年。那时候新镇大多还没盖，你搬过不止一次吧。' }],
  [1980, { en: '{year}. Before the trains. You took the bus, everybody did.', zh: '{year} 年。地铁还没通，大家都坐巴士。' }],
  [1990, { en: '{year}. The trains were new and nobody trusted the doors.', zh: '{year} 年。地铁刚通，没人信那几扇门。' }],
  [1999, { en: '{year}. Not long. The forms were this colour then too.', zh: '{year} 年。不算久。那时候表格也是这个颜色。' }],
  [2000, { en: 'This year? Then “ordinarily” is generous. I will allow it.', zh: '今年？那「通常居于」算是客气了。算你过。' }],
];
export const sinceLine = (y: number) => SINCE.find(([to]) => y < to)?.[1] ?? SINCE[SINCE.length - 1][1];

/** What the clerk knows about each district: the gazetteer's line, and her remark when you pick it. */
export const DISTRICT_TEXT: Record<DistrictId, { blurb: L; react: L }> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, { blurb: d.blurb, react: d.react ?? d.blurb }]),
);

/** Lines typed one by one while the form is being processed. `{district}` is filled in. */
export const FILING: L[] = [
  { en: 'Checking the register…', zh: '核对名册……' },
  { en: 'No such resident. Proceeding.', zh: '查无此人。继续办理。' },
  { en: 'Cross-referencing {district}…', zh: '比对{district}户籍……' },
  { en: 'Printing card…', zh: '打印身份证……' },
  { en: 'Laminating…', zh: '过塑……' },
  { en: 'Stamp.', zh: '盖章。' },
];

/** Names already in the visitors' book today, a few before yours. Plain names, nobody in particular. */
export const BOOK: [string, L][] = [
  ['Tan S. H.', { en: 'Toa Payoh', zh: '大巴窑' }],
  ['Rosnah', { en: 'Bedok', zh: '勿洛' }],
  ['K. Rajan', { en: 'Serangoon', zh: '实龙岗' }],
  ['Lim', { en: '', zh: '' }],
  ['Mary de Souza', { en: 'Katong', zh: '加东' }],
  ['Ah Seng', { en: 'Ang Mo Kio', zh: '宏茂桥' }],
  ['Zul', { en: 'Woodlands', zh: '兀兰' }],
  ['Mrs Goh', { en: 'Queenstown', zh: '女皇镇' }],
  ['Priya', { en: 'Johor Bahru', zh: '新山' }],
  ['Wong K. L.', { en: 'Hong Kong', zh: '香港' }],
  ['Siti', { en: 'Geylang', zh: '芽笼' }],
  ['Daniel', { en: 'Penang', zh: '槟城' }],
  ['Ong', { en: 'Hougang', zh: '后港' }],
  ['Farid', { en: 'Jurong', zh: '裕廊' }],
];
