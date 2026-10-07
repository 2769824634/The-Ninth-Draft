/**
 * The 52 districts of Gerimis, laid out like Singapore's planning areas in
 * 1999. The gazetteer behind this file is
 * /mnt/project-files/ideas/霏微-地名录.md (project files); keep the two in step.
 *
 * Names follow the place: the local name, in both languages, as people said
 * it in 1999. A name that carries a real politician, governor or royal is
 * swapped for the place's own old name or a neighbour's. Shops, schools,
 * companies and people stay fictional.
 *
 * ORDER MATTERS: the recovery phrase stores a district as its index in this
 * list. Only ever append.
 */

export interface L {
  en: string;
  zh: string;
}

export type Region = 'central' | 'east' | 'north' | 'northeast' | 'west';
/** residential: people live here and can register · open: on the map, no homes · unsurveyed: left blank */
export type Kind = 'residential' | 'open' | 'unsurveyed';

export interface Block {
  en: string;
  zh: string;
  note?: L;
}

export interface DistrictData {
  id: string;
  en: string;
  zh: string;
  region: Region;
  kind: Kind;
  /** Two-digit postal district. */
  postal: number;
  /** Rough centre, degrees east / north, on the survey's 1999 base. */
  lon: number;
  lat: number;
  /** Label to the west of the pin. */
  left?: boolean;
  /** Labelled on the island-wide sheet. */
  major?: boolean;
  /** The district clock's offset from the Axis, in whole hours. */
  tz?: number;
  blurb: L;
  /** What the clerk says when a visitor picks it (residential only). */
  react?: L;
  blocks: Block[];
  transit: L;
  /** Gone before 1999: the seeds of backflow. */
  lost?: L;
  /** Gone in the real place after 1999, still standing here. */
  kept?: L;
}

const l = (en: string, zh: string): L => ({ en, zh });
const b = (en: string, zh: string, noteEn?: string, noteZh?: string): Block => (noteEn ? { en, zh, note: l(noteEn, noteZh!) } : { en, zh });

export const REGIONS: { id: Region; en: string; zh: string }[] = [
  { id: 'central', en: 'Central', zh: '中区' },
  { id: 'east', en: 'East', zh: '东区' },
  { id: 'north', en: 'North', zh: '北区' },
  { id: 'northeast', en: 'North-East', zh: '东北区' },
  { id: 'west', en: 'West', zh: '西区' },
];

export const DISTRICT_DATA: DistrictData[] = [
  /* ---------------- Central ---------------- */
  {
    id: 'axis', en: 'Axis', zh: '中枢', region: 'central', kind: 'residential', postal: 1, lon: 103.853, lat: 1.284, major: true,
    blurb: l('Where the Records Office sits. Every road on the island is on the way to it.', '记录署就在这儿。岛上所有的路，都是去中枢的路上。'),
    react: l('Axis. You live next door to the Office. Please do not wave.', '中枢。你和署里是邻居。请不要朝它挥手。'),
    blocks: [
      b('Commercial Square', '商业广场', 'Banks at the river mouth. Empty by eight in the evening.', '河口的银行区，晚上八点以后楼都空了。'),
      b('Telok Ayer', '直落亚逸', 'A hundred years ago this street was the shore. The old temple door faced the sea.', '一百多年前这条街就是海岸，老庙门口原来是海。'),
      b('Lau Pa Sat', '老巴刹', 'An octagon of Victorian cast iron. At night the street beside it closes for satay.', '八角形的维多利亚式铸铁熟食中心，晚上旁边一条街封起来烤沙爹。'),
      b('Tanjong Pagar', '丹戎巴葛', 'Shophouses, the container cranes, and the 1932 station where trains leave for the other side.', '店屋、货柜码头的吊臂，还有 1932 年的火车站，火车开往对岸。'),
      b('Marina Centre', '滨海中心', 'Five towers round one large fountain.', '五座楼围着一个大喷泉。'),
      b('City Hall', '政府大厦', 'The Padang, and a row of white columns. The Records Office is behind them.', '大草场，一排白柱子。记录署就在柱子后面。'),
    ],
    transit: l('North–South and East–West lines at City Hall and Axis; East–West line at Tanjong Pagar. Red Lamp Pier for the southern islands.', '南北线、东西线在政府大厦、中枢两站交汇；东西线丹戎巴葛站。红灯码头去南边小岛。'),
    lost: l('The shore before the reclamation.', '填海以前的海岸。'),
    kept: l('Tanjong Pagar station and Red Lamp Pier, both still in use.', '丹戎巴葛火车站、红灯码头，都还在用。'),
  },
  {
    id: 'bukit-merah', en: 'Bukit Merah', zh: '红山', region: 'central', kind: 'residential', postal: 3, lon: 103.818, lat: 1.281, left: true, major: true,
    blurb: l('Red hill. Swordfish came ashore here once, people say, and a boy told the village to use banana trunks. The hill was dug flat long ago. The name stayed.', '红山。岛上流传，很久以前剑鱼成群冲上岸，一个孩子出主意用芭蕉树干挡。山早就挖平了，名字留着。'),
    react: l('Bukit Merah. Two residents on file already. Both very observant.', '红山。已有两位居民在册，都很爱观察。'),
    blocks: [
      b('Tiong Bahru', '中峇鲁', 'The name means “new cemetery”. Rounded flats from the thirties; birdcages hung along the corridors by seven.', '名字的意思是「新坟场」。三十年代的流线型老公寓，早上七点走廊挂满鸟笼。'),
      b('Redhill', '红山', 'Flats and a market.', '组屋和巴刹。'),
      b('Telok Blangah', '直落布兰雅', 'Clay-pot bay. The flats on the slope look over the harbour.', '马来语「瓦锅湾」，山坡上的组屋看得见港口。'),
      b('Mount Faber', '花柏山', 'The cable car crosses the water to Sentosa from the top.', '山顶的缆车过海去圣淘沙。'),
      b('Keppel Harbour', '吉宝港', 'The cranes stay lit all night.', '港口吊车，夜里也亮着。'),
    ],
    transit: l('East–West line at Tiong Bahru and Redhill. Bus interchange at Bukit Merah. Cable car from Mount Faber.', '东西线中峇鲁站、红山站；红山巴士总站；花柏山缆车。'),
    lost: l('The hill.', '那座山。'),
    kept: l('The bird corner at Tiong Bahru.', '中峇鲁的鸟鸣角。'),
  },
  {
    id: 'toa-payoh', en: 'Toa Payoh', zh: '大巴窑', region: 'central', kind: 'residential', postal: 12, lon: 103.849, lat: 1.335, major: true,
    blurb: l('Big swamp, in Hokkien. The second new town and the first with a proper town centre. The swamp was not consulted.', '闽南话「大沼泽」。岛上第二个卫星镇，第一个有完整镇中心的。沼泽没有被征求过意见。'),
    react: l('Toa Payoh. Mind the damp. It is older than the flats.', '大巴窑。小心潮气，它比组屋年纪大。'),
    blocks: [
      b('Lorong 1 to 8', '大巴窑一巷至八巷', 'The fountain in the town centre, the lookout tower in the park, the dragon playground with a slide for a tail.', '镇中心的喷泉、公园里的观景塔、尾巴是滑梯的龙形游乐场。'),
      b('Kim Keat', '金吉', 'Old flats and a hawker centre.', '老组屋和熟食中心。'),
      b('Bidadari', '比达达利', '“Fairy” in Malay. An old cemetery, very quiet.', '马来语「仙女」。一片老坟山，很安静。'),
      b('Whampoa', '黄埔', 'A whole street of lamp shops, brighter than anywhere else at night. Bak kut teh.', '一整条街卖灯具，晚上比别处亮；肉骨茶。'),
    ],
    transit: l('North–South line at Toa Payoh and Kim Keat. Bus interchange; the 97 runs its loop from here.', '南北线大巴窑站、金吉站；巴士总站，97 路从这里绕镇一圈。'),
    lost: l('The swamp.', '沼泽。'),
    kept: l('Bidadari cemetery.', '比达达利坟山。'),
  },
  {
    id: 'bishan', en: 'Bishan', zh: '碧山', region: 'central', kind: 'residential', postal: 20, lon: 103.840, lat: 1.352,
    blurb: l('Named for an old burial hill. The graves were moved and the town went up in the eighties, very neat.', '名字来自一座老义山。坟迁走以后，八十年代盖了新镇，很整齐。'),
    react: l('Bishan. Quiet at night. Someone will ask you the way. Give them the block number.', '碧山。晚上安静。有人问路，你报座号就行。'),
    blocks: [
      b('Bishan North', '碧山北'),
      b('Bishan East', '碧山东'),
      b('Junction 8', '八号路口', 'A mall at the crossroads.', '路口的商场。'),
      b('The depot', '车厂', 'Where the trains sleep.', '晚上列车睡在这里。'),
    ],
    transit: l('North–South line at Bishan. Bus interchange.', '南北线碧山站；巴士总站。'),
    lost: l('The burial hill. Older residents say someone still comes by at night asking for a grave number.', '义山。老住户说，晚上偶尔有人来问路，问的是坟号。'),
  },
  {
    id: 'bukit-timah', en: 'Bukit Timah', zh: '武吉知马', region: 'central', kind: 'residential', postal: 10, lon: 103.789, lat: 1.333, left: true,
    blurb: l('Tin hill. Nobody ever found tin. The highest point on the island, 163 metres, with old forest at its foot.', '锡山。山上从来没挖到过锡。岛上最高点，163 米，山脚是一片留下来的原始林。'),
    react: l('Bukit Timah. The monkeys will take your plastic bag. Carry a basket.', '武吉知马。猴子会抢塑料袋，买菜带个篮子。'),
    blocks: [
      b('Sixth Avenue', '第六道', 'Bungalows.', '洋房。'),
      b('Beauty World', '美世界', 'The old market, second-hand books upstairs.', '老市场，楼上有旧书摊。'),
      b('Holland Village', '荷兰村', 'A few streets of bars, coffee shops and used books.', '几条街的酒吧、咖啡店、二手书店。'),
      b('Bukit Timah station', '武吉知马火车站', 'The stationmaster grows flowers on the platform.', '站长在月台上种花。'),
      b('The turf club', '赛马场'),
    ],
    transit: l('No MRT. Buses, and the railway passing through.', '没有地铁，只有巴士和穿过去的铁路。'),
    kept: l('Bukit Timah station and its rails; the turf club.', '武吉知马火车站和铁轨；赛马场。'),
  },
  {
    id: 'orchard', en: 'Orchard', zh: '乌节', region: 'central', kind: 'residential', postal: 9, lon: 103.832, lat: 1.304,
    blurb: l('Nutmeg and pepper grew along this road until a blight in the 1860s. Now it is the longest shopping street on the island.', '十九世纪这条路两边是肉豆蔻和胡椒园，1860 年代一场病害全死了。现在是岛上最长的购物街。'),
    react: l('Orchard. Lovely at Christmas. Very loud at Christmas.', '乌节。圣诞节很好看，圣诞节也很吵。'),
    blocks: [
      b('Orchard Road', '乌节路', 'A mall of watch shops and money-changers; a marble department store from 1993; tunnels between them.', '一座全是钟表行和找换店的老商场；1993 年开的大理石百货；几座商场之间的地下通道。'),
      b('Killiney', '基里尼'),
      b('Cairnhill', '经禧'),
    ],
    transit: l('North–South line at Orchard and Killiney.', '南北线乌节站、基里尼站。'),
    lost: l('The nutmeg trees. On wet nights someone at the crossing smells them.', '肉豆蔻树。下过雨的晚上，有人在路口闻到肉豆蔻味。'),
  },
  {
    id: 'newton', en: 'Newton', zh: '纽顿', region: 'central', kind: 'residential', postal: 11, lon: 103.838, lat: 1.313,
    blurb: l('A great roundabout with a hawker centre in the middle of it.', '一个大圆环交通岛，熟食中心就在圆环中间。'),
    react: l('Newton. The stallholders will take your sleeve. Let them.', '纽顿。摊主会拉你的袖子，让他拉。'),
    blocks: [b('Newton Circus', '纽顿圆环', 'Busiest after ten at night.', '夜里十点以后最热闹。'), b('Stevens Road', '史蒂芬路', 'Flats behind tall gates.', '大门后面的公寓。')],
    transit: l('North–South line at Newton.', '南北线纽顿站。'),
  },
  {
    id: 'novena', en: 'Novena', zh: '诺维娜', region: 'central', kind: 'residential', postal: 11, lon: 103.844, lat: 1.322,
    blurb: l('Named for nine days of prayer at a church. The red-brick hospital is here.', '名字来自一座教堂的「九日敬礼」。红砖大医院在这里。'),
    react: l('Novena. Nine days. Nobody here has asked why nine.', '诺维娜。九日。这里没人问过为什么是九。'),
    blocks: [b('Novena', '诺维娜', 'A square is going up beside the station.', '车站旁边在盖一座广场。'), b('Moulmein', '慕连'), b('Thomson', '汤申'), b('Watten', '华登', 'Bungalows.', '洋房区。')],
    transit: l('North–South line at Novena.', '南北线诺维娜站。'),
  },
  {
    id: 'tanglin', en: 'Tanglin', zh: '东陵', region: 'central', kind: 'residential', postal: 10, lon: 103.812, lat: 1.308, left: true,
    blurb: l('The botanic gardens, black-and-white houses, and very few bus stops.', '植物园、黑白洋房，还有很少的巴士站。'),
    react: l('Tanglin. The gardens open at five. So do the joggers.', '东陵。植物园早上五点开门，跑步的人也是。'),
    blocks: [b('The Botanic Gardens', '植物园', 'Swan lake and a bandstand; picnics under it on Sundays.', '天鹅湖、乐台，星期天有人在乐台下野餐。'), b('Tanglin Road', '东陵路')],
    transit: l('Buses only.', '只有巴士。'),
  },
  {
    id: 'river-valley', en: 'River Valley', zh: '里峇峇利', region: 'central', kind: 'residential', postal: 9, lon: 103.834, lat: 1.296,
    blurb: l('Flats above the river, and a street of bars that still has a queue at two in the morning.', '河上的公寓，还有一条酒吧街，凌晨两点还在排队。'),
    react: l('River Valley. Close your windows on Saturdays.', '里峇峇利。星期六晚上记得关窗。'),
    blocks: [b('River Valley Road', '里峇峇利路'), b('Great World', '大世界', 'A mall where the amusement park was.', '原来游乐场的地方，盖成了商场。')],
    transit: l('Buses; Dhoby Ghaut is a walk.', '巴士；走路到多美歌。'),
    lost: l('The Great World amusement park, closed 1978. From the top of the car park, some nights, the lights of a big wheel.', '大世界游乐场，1978 年关门。有的夜里从停车场顶楼看下去，有摩天轮的灯。'),
  },
  {
    id: 'gerimis-river', en: 'Gerimis River', zh: '霏微河', region: 'central', kind: 'open', postal: 1, lon: 103.846, lat: 1.289,
    blurb: l('The river and its three quays. The lighters have gone; the bridges stayed.', '一条河，三段码头。驳船走了，桥还在。'),
    blocks: [
      b('Boat Quay', '驳船码头', 'Shophouse restaurants with someone at every door.', '老店屋改的餐馆，每家门口都有人拉客。'),
      b('Clarke Quay', '克拉码头', 'A “festival village” since 1993, with a pretend junk.', '1993 年改成「节日村」，有一艘假的中国帆船。'),
      b('Robertson Quay', '罗拔申码头', 'Godowns.', '老货仓。'),
    ],
    transit: l('River boats. One bridge still has its notice: no cattle or horses.', '河上的游船。一座吊桥头上还钉着告示：禁止牛马过桥。'),
    lost: l('The lighters, and the men who carried the rice.', '驳船，和扛米包的苦力。'),
  },
  {
    id: 'rochor', en: 'Rochor', zh: '梧槽', region: 'central', kind: 'residential', postal: 7, lon: 103.856, lat: 1.304,
    blurb: l('The busiest district on the island: spice, gold, computer parts, and four coloured blocks.', '岛上最杂的一区：香料、金子、电脑零件，还有四座彩色组屋。'),
    react: l('Rochor. You will never run out of batteries.', '梧槽。住这里，电池永远不缺。'),
    blocks: [
      b('Tekka', '竹脚', 'The market “at the foot of the bamboo”: spice, garlands, cloth upstairs; a shop open late that sells gold and suitcases on one floor.', '竹脚巴刹：香料、花环，楼上卖布；一家开到很晚的百货公司，金子和行李箱在同一层楼。'),
      b('Kampong Glam', '甘榜格南', 'A golden dome, cloth and perfume shops.', '一座金色圆顶，卖布和香水的店。'),
      b('Bugis', '武吉士', 'The old street came down in 1985. A new one was built beside it to look the same.', '原来那条老街 1985 年拆了，九十年代又在旁边照样子盖了一条。'),
      b('Rochor Centre', '梧槽中心', 'Four blocks, red, yellow, blue and green. Below them five floors of computer parts, where Heuss buys his.', '红黄蓝绿四座组屋。旁边五层楼全是电脑零件，Heuss 在那里买。'),
      b('Beach Road', '美芝路', 'It ran along the sand once. A stepped old tower with long-distance buses underneath.', '以前就沿着沙滩。一座阶梯形的老大厦，楼下停着长途巴士。'),
    ],
    transit: l('East–West line at Bugis.', '东西线武吉士站。'),
    lost: l('The sea at Beach Road.', '美芝路外面的海。'),
    kept: l('The four coloured blocks of Rochor Centre.', '梧槽中心的四色组屋。'),
  },
  {
    id: 'bukit-larangan', en: 'Bukit Larangan', zh: '禁山', region: 'central', kind: 'open', postal: 6, lon: 103.847, lat: 1.296,
    blurb: l('The forbidden hill: the old kings were buried on top and nobody else was allowed up. Now it has a gate, a well, and lawns.', '禁山：据说古时候的王葬在山上，平民不许上去。现在有老堡门、古井和草坡。'),
    blocks: [
      b('The hill', '禁山'),
      b('Dhoby Ghaut', '多美歌', 'The washermen’s steps.', '洗衣工的台阶。'),
      b('Bras Basah', '勿拉士峇沙', '“Wet rice.”', '「湿米」。'),
      b('Stamford Road', '史丹福路', 'The red-brick National Library, its steps worn smooth by sitting; the white-domed museum.', '红砖国家图书馆，台阶被坐出了凹痕；白色圆顶的博物馆。'),
    ],
    transit: l('North–South line at Dhoby Ghaut.', '南北线多美歌站。'),
    kept: l('The red-brick National Library.', '红砖国家图书馆。'),
  },
  {
    id: 'kreta-ayer', en: 'Kreta Ayer', zh: '牛车水', region: 'central', kind: 'residential', postal: 2, lon: 103.841, lat: 1.281,
    blurb: l('Water cart, in Malay. The water came into town on bullock carts. Now: shophouses, the New Year street, and laundry on every roof.', '马来语「水车」，以前用牛车拉水进城。现在：店屋、年货街，天台晾满衣服。'),
    react: l('Kreta Ayer. Come New Year, you will not get home by bus.', '牛车水。过年那几天，巴士开不进来。'),
    blocks: [
      b('Chinatown', '牛车水', 'A wet market downstairs and hawkers upstairs; a tower where shops and homes are stacked together.', '楼下湿巴刹，二楼熟食中心；一座把商场和住家叠在一起的大楼。'),
      b('Pearl’s Hill', '珍珠山', 'A horseshoe tower on the top, hollow in the middle.', '山顶一座马蹄形高楼，中间是空心的天井。'),
      b('Hospital Hill', '医院坡', 'The red-brick general hospital.', '红砖的中央医院。'),
    ],
    transit: l('East–West line at Pearl’s Hill.', '东西线珍珠山站。'),
    lost: l('The water carts.', '水车。'),
    kept: l('The horseshoe tower on Pearl’s Hill.', '珍珠山马蹄楼。'),
  },
  {
    id: 'queenstown', en: 'Queenstown', zh: '女皇镇', region: 'central', kind: 'residential', postal: 3, lon: 103.790, lat: 1.292, left: true,
    blurb: l('The first new town on the island. The oldest flats, the oldest cinema, and a bowling alley.', '岛上第一个卫星镇。最老的组屋、最老的戏院，还有一家保龄球馆。'),
    react: l('Queenstown. The lifts are older than you. They work.', '女皇镇。电梯比你年纪大，照样能用。'),
    blocks: [
      b('Tanglin Halt', '东陵哈逊', 'A railway halt and a row of sixties flats.', '铁路边的停车小站，一排六十年代组屋。'),
      b('Commonwealth', '联邦'),
      b('Mei Ling', '美玲'),
      b('Buona Vista', '波那维斯达', '“Good view.”', '「好景色」。'),
      b('Pasir Panjang', '巴西班让', 'Long sand. The vegetable market is busiest at three in the morning. A garden of the ten courts of hell; children who visit stop lying.', '长沙滩。菜市批发场凌晨三点最忙。一座讲十殿地狱的园子，小孩去过一次就不敢说谎。'),
      b('Pasir Panjang Ridge', '巴西班让岭', 'A university on the ridge.', '山岭上一所大学。'),
    ],
    transit: l('East–West line at Queenstown, Commonwealth and Buona Vista.', '东西线女皇镇、联邦、波那维斯达。'),
    kept: l('The Queenstown cinema and bowling alley; the sixties flats at Tanglin Halt.', '女皇镇戏院和保龄球馆；东陵哈逊的六十年代组屋。'),
  },
  {
    id: 'kallang', en: 'Kallang', zh: '加冷', region: 'central', kind: 'residential', postal: 12, lon: 103.868, lat: 1.311,
    blurb: l('The round stadium, dragon boats on the basin, and an airport terminal that has not seen a plane in forty years.', '圆形体育场，盆地上练龙舟，还有一座四十年没见过飞机的机场航站楼。'),
    react: l('Kallang. When there is a match on, you will hear it in the bath.', '加冷。有球赛的晚上，在冲凉房都听得到。'),
    blocks: [
      b('Lavender', '劳明达', 'Named, people say, as a joke about the smell.', '据说起这个名字是反讽，因为附近臭。'),
      b('Jalan Besar', '惹兰勿刹', '“Big road.”', '马来语「大路」。'),
      b('Farrer Park', '跑马埔', 'The first race course. Old people still call it that.', '岛上最早的跑马场，老一辈还这么叫。'),
      b('Old Airport', '旧机场', 'The thirties terminal, shaped like a plane from above; the food centre on Old Airport Road.', '三十年代的航站楼，从天上看像一架飞机；旧机场路熟食中心。'),
      b('Kallang Bahru', '加冷巴鲁'),
    ],
    transit: l('East–West line at Kallang and Lavender.', '东西线加冷站、劳明达站。'),
    lost: l('The gasworks, closed last year; the New World amusement park, closed 1987; the planes.', '加冷煤气厂，去年刚停；新世界游乐场，1987 年关；旧机场的飞机。'),
  },
  {
    id: 'geylang', en: 'Geylang', zh: '芽笼', region: 'central', kind: 'residential', postal: 14, lon: 103.888, lat: 1.318,
    blurb: l('An old Malay market, durian stalls lit by gas lamps, and fried kway teow at one in the morning.', '马来老集市，汽灯底下的榴莲摊，凌晨一点的炒粿条。'),
    react: l('Geylang. Odd numbers on one side, even on the other. Remember which.', '芽笼。巷子一边单号，一边双号。记住你是哪边的。'),
    blocks: [
      b('Geylang Serai', '芽笼士乃', 'Serai is lemongrass. Fish and meat downstairs, cloth and kueh upstairs; lights the length of the road before the festival.', 'serai 就是香茅。楼下鱼肉菜，楼上卖布和糕点；过节前整条路挂满灯。'),
      b('The lorongs', '芽笼巷', 'Odd on one side, even on the other.', '一边单号，一边双号。'),
      b('Aljunied', '阿裕尼'),
      b('Joo Chiat', '如切', 'A coconut estate once; painted shophouses now.', '以前是椰园，现在是彩色店屋。'),
    ],
    transit: l('East–West line at Aljunied.', '东西线阿裕尼站。'),
  },
  {
    id: 'marine-parade', en: 'Marine Parade', zh: '马林百列', region: 'central', kind: 'residential', postal: 15, lon: 103.905, lat: 1.303,
    blurb: l('Built on land filled in from the sea in the seventies. The old shore was the road through Katong; the red dashes on the map are clearest here.', '七十年代填海填出来的。原来的海岸就是加东那条老路，地图上的红虚线在这里最清楚。'),
    react: l('Marine Parade. Your front door used to be the sea. Wipe your feet.', '马林百列。你家门口以前是海。进门擦擦脚。'),
    blocks: [
      b('Katong', '加东', 'Old houses, Nonya kueh, laksa. The houses on the old road had the beach at the gate.', '老洋房、娘惹糕、叻沙。老路边的洋房，门口原来就是沙滩。'),
      b('Marine Parade', '马林百列', 'The new town on the reclaimed land; a seaside mall from 1983.', '填海地上的新镇；1983 年开的海滨商场。'),
      b('East Coast Park', '东海岸公园', 'A made beach: barbecue pits, bicycle hire, a seafood centre.', '填出来的海滩：烧烤坑、脚车出租、海鲜中心。'),
    ],
    transit: l('Buses only.', '没有地铁，只有巴士。'),
    lost: l('The sea, moved further out.', '海，被填远了。'),
  },
  {
    id: 'marina', en: 'Marina', zh: '滨海', region: 'central', kind: 'open', postal: 1, lon: 103.869, lat: 1.276,
    blurb: l('All of it was sea until the seventies. Grass, kites, a steamboat street and a bowling alley. The North–South line ends here.', '七十年代以前全是海。草地、风筝、一条火锅街、一家保龄球馆。南北线在这里到终点。'),
    blocks: [
      b('Marina South', '滨海南', 'Steamboat restaurants.', '火锅街。'),
      b('Marina East', '滨海东', 'Open ground and a golf driving range.', '空地和高尔夫练习场。'),
      b('Straits View', '海峡景', 'Sea and one road.', '只有海和一条公路。'),
    ],
    transit: l('North–South line terminus at Marina Bay.', '南北线终点滨海湾。'),
    lost: l('The whole of it. The old shore runs through the middle.', '整片都是。旧海岸线从它中间穿过去。'),
  },
  {
    id: 'southern-islands', en: 'Southern Islands', zh: '南部岛屿', region: 'central', kind: 'open', postal: 4, lon: 103.830, lat: 1.250,
    blurb: l('Sentosa, St John’s, Kusu and the Sisters, a cable car or a ferry away.', '圣淘沙、圣约翰岛、龟屿、姐妹岛，坐缆车或者渡轮就到。'),
    blocks: [
      b('Sentosa', '圣淘沙', 'Renamed in the seventies; the old name was unlucky. A musical fountain, a volcano, a tunnel under the fish, a monorail round the island.', '七十年代改的名字，旧名不太吉利。音乐喷泉、火山乐园、海底隧道、绕岛的单轨小火车。'),
      b('St John’s Island', '圣约翰岛', 'Where arrivals were once kept in quarantine. Anglers now.', '以前给进港的人隔离检疫，现在有人去钓鱼。'),
      b('Kusu', '龟屿', 'A turtle turned into the island to save two men from the sea. In the ninth lunar month the ferries are full.', '传说一只大龟变成岛，救了两个落水的人。每年农历九月，渡轮坐满了人。'),
      b('Sisters’ Islands', '姐妹岛', 'Two sisters, the story says.', '传说是两姐妹。'),
    ],
    transit: l('Cable car from Mount Faber; ferries from the World Trade Centre and Red Lamp Pier.', '花柏山的缆车；渡轮大厦和红灯码头的渡轮。'),
    kept: l('The musical fountain, the monorail, the volcano.', '音乐喷泉、单轨小火车、火山乐园。'),
  },

  /* ---------------- East ---------------- */
  {
    id: 'bedok', en: 'Bedok', zh: '勿洛', region: 'east', kind: 'residential', postal: 16, lon: 103.928, lat: 1.326, major: true,
    blurb: l('One of the big eastern towns, and the most like an ordinary day: a reservoir, a jetty, a hawker centre.', '东部最大的组屋区之一，最像「普通的一天」：一个水库、一座码头、一个熟食中心。'),
    react: l('Bedok. Nothing happens in Bedok. The Office likes that.', '勿洛。勿洛什么事都没有。署里喜欢这样。'),
    blocks: [
      b('Bedok', '勿洛', 'The reservoir for evening runs, the jetty for night fishing.', '傍晚绕水库跑步，夜里在码头钓鱼。'),
      b('Chai Chee', '菜市', 'The name is the vegetable market.', '名字就是菜市场。'),
      b('Tanah Merah', '丹那美拉', '“Red earth.”', '「红土」。'),
      b('Kaki Bukit', '加基武吉', '“Foot of the hill.”', '「山脚」。'),
      b('Kembangan', '景万岸', '“In bloom.”', '「开花」。'),
      b('Kampong Melayu', '甘榜马来由', 'The old Malay village.', '原来的马来村。'),
    ],
    transit: l('East–West line at Tanah Merah, Bedok, Kembangan and Kampong Melayu.', '东西线丹那美拉、勿洛、景万岸、甘榜马来由。'),
  },
  {
    id: 'tampines', en: 'Tampines', zh: '淡滨尼', region: 'east', kind: 'residential', postal: 18, lon: 103.945, lat: 1.351, major: true,
    blurb: l('Named for the tempinis, a hard wood that once covered the hill. The first regional centre; two malls opened in 1995.', '名字来自一种叫 tempinis 的硬木树。岛上第一个区域中心，两座商场九五年开张。'),
    react: l('Tampines. The town won a prize once. Nobody there remembers what for.', '淡滨尼。这个镇拿过一个国际奖，镇里没人记得是什么奖。'),
    blocks: [b('Tampines Central', '淡滨尼中'), b('Simei', '四美', 'New flats.', '九十年代的新组屋。'), b('Changkat', '樟加', '“Little slope.”', '「小山坡」。')],
    transit: l('East–West line at Tampines and Simei.', '东西线淡滨尼、四美。'),
    lost: l('The sand pits and the rubber trees.', '沙坑和橡胶园。'),
  },
  {
    id: 'pasir-ris', en: 'Pasir Ris', zh: '巴西立', region: 'east', kind: 'residential', postal: 18, lon: 103.950, lat: 1.376,
    blurb: l('The end of the East–West line: mangrove boardwalks, holiday chalets, fish farms, and a theme park that opens next year.', '东西线终点：红树林木栈道、度假屋、鱼场，还有一座明年开幕的游乐园。'),
    react: l('Pasir Ris. The theme park opens next year. It has said so for a while.', '巴西立。那座游乐园明年开幕，这话说了有一阵子了。'),
    blocks: [
      b('The beach', '巴西立海边', 'Chalets for twelve, booked for birthdays; the deposit never comes back whole.', '十几个人合租一间度假屋过生日，押金从来拿不全。'),
      b('Loyang', '罗央', 'Factories.', '工业区。'),
      b('Farmway', '鱼场路', 'Fish farms and riding stables.', '鱼场和马场。'),
    ],
    transit: l('East–West line terminus at Pasir Ris.', '东西线终点巴西立。'),
  },
  {
    id: 'changi', en: 'Changi', zh: '樟宜', region: 'east', kind: 'residential', postal: 17, lon: 103.985, lat: 1.355, major: true,
    blurb: l('Two terminals, a village at the end of the road, and planes very low over the beach.', '两座航站楼，路尽头一个村子，飞机从海滩头顶很低地飞过去。'),
    react: l('Changi. You will get used to the planes. Most people do.', '樟宜。飞机的声音会习惯的，大部分人都习惯了。'),
    blocks: [
      b('The airport', '樟宜机场', 'Terminal 2 opened in 1990.', '第二航站楼 1990 年开。'),
      b('Changi Village', '樟宜村', 'Nasi lemak at the food centre, bumboats to Ubin.', '熟食中心的椰浆饭，去乌敏岛的驳船。'),
      b('Changi Beach', '樟宜海滩'),
    ],
    transit: l('The MRT does not reach the airport yet. Buses.', '地铁还没通到机场，坐巴士。'),
    lost: l('A very tall tree on the shore that ships steered by.', '海边原来有一棵很高的树，给船认路用。'),
  },
  {
    id: 'paya-lebar', en: 'Paya Lebar', zh: '巴耶利峇', region: 'east', kind: 'unsurveyed', postal: 19, lon: 103.904, lat: 1.360,
    blurb: l('Wide swamp. The island’s airport until 1981; fenced since. Not surveyed.', '宽沼泽。到 1981 年为止是岛上的机场，后来围了起来。未测绘。'),
    blocks: [],
    transit: l('Buses along Paya Lebar Road.', '巴耶利峇路上的巴士。'),
    lost: l('The old terminal. People outside the fence have seen a queue for boarding.', '旧航站楼。有人说在围栏外面看见过排队登机的人。'),
  },

  /* ---------------- North ---------------- */
  {
    id: 'woodlands', en: 'Woodlands', zh: '兀兰', region: 'north', kind: 'residential', postal: 25, lon: 103.786, lat: 1.437, major: true, tz: 1,
    blurb: l('The northern town, grown fast in the nineties. The Causeway crosses to the other side from here. The clocks run an hour ahead.', '北岸的新镇，九十年代长得很快。长堤从这里过去对岸。这里的钟快一个小时。'),
    react: l('Woodlands. Quiet up there. The Office tends to look twice at quiet districts.', '兀兰。那边安静。安静的区，署里一般会多看两眼。'),
    blocks: [
      b('Woodlands Centre', '兀兰中心', 'A new mall from 1998, the town garden.', '1998 年开的商场，城镇公园。'),
      b('Marsiling', '马西岭'),
      b('Admiralty', '海军部', 'New flats.', '新组屋。'),
      b('Old Woodlands', '兀兰老镇', 'By the Causeway: the old town centre, a cinema, motorbikes queuing at dawn.', '长堤旁边的旧镇中心、老戏院，天一亮电单车就排长队。'),
    ],
    transit: l('North–South line at Marsiling, Woodlands and Admiralty; the train crosses the Causeway.', '南北线马西岭、兀兰、海军部；火车过长堤去对岸。'),
  },
  {
    id: 'sembawang', en: 'Sembawang', zh: '三巴旺', region: 'north', kind: 'residential', postal: 27, lon: 103.820, lat: 1.449,
    blurb: l('Named for the sembawang tree. The old shipyard, red-roofed staff houses, and the only hot spring on the island.', '名字来自一种叫 sembawang 的树。老船厂、红瓦白墙的宿舍，还有岛上唯一一口温泉。'),
    react: l('Sembawang. Bring a pail to the spring. Eggs optional.', '三巴旺。去温泉带个桶，鸡蛋随意。'),
    blocks: [
      b('The shipyard', '船厂'),
      b('The hot spring', '温泉', 'Behind a wall. People fill buckets; some boil eggs in it.', '在一道围墙里。居民提桶去打水，有人拿来煮鸡蛋。'),
      b('Sembawang Park', '三巴旺公园', 'An old sembawang tree.', '一棵 sembawang 老树。'),
    ],
    transit: l('North–South line at Sembawang.', '南北线三巴旺站。'),
  },
  {
    id: 'yishun', en: 'Yishun', zh: '义顺', region: 'north', kind: 'residential', postal: 27, lon: 103.836, lat: 1.420, major: true,
    blurb: l('An eighties town on old pineapple land, with the island’s first ten-screen cinema.', '八十年代盖在老黄梨园上的新镇，有岛上第一家十厅电影院。'),
    react: l('Yishun. Ten screens. One of them is always showing something you did not choose.', '义顺。十个厅，总有一个在放你没选的片。'),
    blocks: [b('Yishun Central', '义顺中心', 'The ten-screen cinema, opened 1992.', '十厅戏院，1992 年开。'), b('Khatib', '卡迪'), b('Chong Pang', '忠邦', 'The old village.', '原来的老村。')],
    transit: l('North–South line at Yishun and Khatib.', '南北线义顺、卡迪。'),
    lost: l('The pineapple fields and the village.', '黄梨园和老村。'),
  },
  {
    id: 'mandai', en: 'Mandai', zh: '万礼', region: 'north', kind: 'open', postal: 25, lon: 103.800, lat: 1.405,
    blurb: l('The zoo without cages, the night safari, and an orchid garden.', '不用笼子的动物园、夜间动物园和兰花园。'),
    blocks: [
      b('The zoo', '动物园', 'Breakfast with an old orang utan.', '可以和一只老红毛猩猩一起吃早餐。'),
      b('The night safari', '夜间动物园', 'Opened 1994.', '1994 年开。'),
      b('The orchid garden', '兰花园'),
    ],
    transit: l('Buses turn round at the zoo gate.', '巴士到动物园门口掉头。'),
  },
  {
    id: 'central-catchment', en: 'Central Catchment', zh: '中央集水区', region: 'north', kind: 'open', postal: 26, lon: 103.806, lat: 1.372,
    blurb: l('Forest round the reservoirs in the middle of the island. More monkeys than people.', '岛中间一大片林子围着几个水库，野猴子比人多。'),
    blocks: [
      b('MacRitchie', '麦里芝', 'A zigzag bridge and rowing boats.', '之字形木桥，划船。'),
      b('Peirce', '皮尔斯', 'An upper and a lower reservoir.', '上下两个水库。'),
      b('Upper Seletar', '实里达上水库', 'A white lookout tower shaped like a rocket, from the sixties.', '一座白色的火箭形瞭望塔，六十年代建的。'),
      b('Upper Thomson', '汤申上段', 'A road of old shops and coffee shops.', '一条路的老店和咖啡店。'),
    ],
    transit: l('None.', '没有。'),
  },
  {
    id: 'sungei-kadut', en: 'Sungei Kadut', zh: '双溪加株', region: 'north', kind: 'open', postal: 25, lon: 103.755, lat: 1.418, left: true,
    blurb: l('Sawmills, timber yards, and the yard where the rag-and-bone tricycles set out from.', '锯木厂、木材场，还有收旧货的三轮车出发的场子。'),
    blocks: [b('Kranji', '克兰芝', 'The reservoir dam.', '水库的大坝。'), b('The timber yards', '木材场')],
    transit: l('North–South line at Kranji; the railway passes.', '南北线克兰芝站；铁路经过。'),
  },
  {
    id: 'simpang', en: 'Simpang', zh: '新邦', region: 'north', kind: 'open', postal: 27, lon: 103.855, lat: 1.444,
    blurb: l('A fork in the road. Open ground. The plan says a new town will go here. It has said so for thirty years.', '岔路口。一片空地。规划图上写着「将来盖新镇」，写了三十年。'),
    blocks: [],
    transit: l('None.', '没有。'),
  },
  {
    id: 'lim-chu-kang', en: 'Lim Chu Kang', zh: '林厝港', region: 'north', kind: 'open', postal: 24, lon: 103.712, lat: 1.425, left: true,
    blurb: l('Vegetable farms, fish farms, a goat dairy, orchids, frogs. The largest cemetery on the island; extra buses at Qing Ming.', '菜园、鱼场、羊奶场、兰花园、青蛙场。岛上最大的坟山，清明节巴士加班。'),
    blocks: [b('Sungei Buloh', '双溪布洛', '“Bamboo stream.” A wetland for the migrating birds, open since 1993.', '「竹溪」。湿地 1993 年开放，看候鸟。'), b('The jetty', '林厝港码头', 'At the end of the road.', '路尽头的小码头。')],
    transit: l('Buses, rarely.', '只有巴士，班次很少。'),
  },

  /* ---------------- North-East ---------------- */
  {
    id: 'ang-mo-kio', en: 'Ang Mo Kio', zh: '宏茂桥', region: 'northeast', kind: 'residential', postal: 20, lon: 103.847, lat: 1.372, major: true,
    blurb: l('“Red-haired man’s bridge”, in Hokkien: a bridge built by Europeans. It has gone. Nobody knows where it stood.', '闽南话「红毛桥」，一座红毛人造的桥。桥早就没了，没人知道它原来在哪。'),
    react: l('Ang Mo Kio. The bridge has been repainted nine times. Nobody remembers another colour.', '宏茂桥。桥重新漆过九次，没人记得它原来是什么颜色。'),
    blocks: [
      b('Avenues 1 to 10', '宏茂桥一道至十道', 'The town centre and the central hawker centre.', '镇中心和中央熟食中心。'),
      b('Yio Chu Kang', '杨厝港', 'The north bank.', '宏茂桥北岸。'),
      b('Ang Mo Kio Park', '宏茂桥公园'),
    ],
    transit: l('North–South line at Ang Mo Kio and Yio Chu Kang. Bus interchange.', '南北线宏茂桥、杨厝港；巴士总站。'),
    lost: l('The bridge.', '那座桥。'),
  },
  {
    id: 'serangoon', en: 'Serangoon', zh: '实龙岗', region: 'northeast', kind: 'residential', postal: 19, lon: 103.871, lat: 1.355, major: true,
    blurb: l('Named, perhaps, for a heron-like bird nobody has seen. The bird is on file.', '名字一说来自一种像鹭鸶的水鸟，没人见过。那只鸟有档案。'),
    react: l('Serangoon. The bird is on file. You soon will be.', '实龙岗。那只鸟有档案，你也快有了。'),
    blocks: [
      b('Serangoon Gardens', '实龙岗花园', 'Old houses round a circus; the food centre in the middle is loud at night.', '一片老洋房绕着圆环，中间的熟食中心晚上很吵。'),
      b('Serangoon Central', '实龙岗中心', 'Flats. The road is hoarded off for the new line; it has been for two years.', '组屋。路中间围着挖地铁的板子，挖了两年了。'),
      b('Lorong Chuan', '罗弄泉'),
    ],
    transit: l('No MRT yet (the North-East line is being dug). Buses.', '没有地铁（东北线在挖），只有巴士。'),
  },
  {
    id: 'hougang', en: 'Hougang', zh: '后港', region: 'northeast', kind: 'residential', postal: 19, lon: 103.890, lat: 1.371, major: true, tz: -1,
    blurb: l('The back harbour, up the Serangoon river. Teochew porridge, braised duck, and clocks an hour behind.', '后港，实龙岗河后段的港口。潮州粥、卤鸭，钟慢一个小时。'),
    react: l('Hougang. Boats came in here. Not all of them have left yet.', '后港。船在这儿靠岸，有的还没离开。'),
    blocks: [
      b('Harbour Row', '港口街', 'The old riverside street.', '河边的老街。'),
      b('Kovan', '高文', 'New flats and shops.', '九十年代的新组屋和店。'),
      b('Defu', '德福', 'Furniture factories.', '家具工业区。'),
      b('Buangkok', '万国', 'The last kampong: zinc roofs, chickens in the lane.', '岛上最后一个甘榜，锌板屋顶，鸡在路上走。'),
    ],
    transit: l('Buses only; the North-East line is being dug.', '只有巴士，东北线在挖。'),
  },
  {
    id: 'sengkang', en: 'Sengkang', zh: '盛港', region: 'northeast', kind: 'residential', postal: 19, lon: 103.894, lat: 1.392,
    blurb: l('The prosperous harbour, after the fishing village that was here. The first blocks have just been handed over; the roads are all called vales.', '兴盛的港，取自原来的渔村。新镇刚交头几批楼，路都叫「某某谷」。'),
    react: l('Sengkang. Four vales and not one hill. You will find your block eventually.', '盛港。四个谷，一座山也没有。你的座号慢慢会找到的。'),
    blocks: [b('Rivervale', '河谷'), b('Compassvale', '罗盘谷'), b('Anchorvale', '锚谷'), b('Fernvale', '蕨谷')],
    transit: l('The LRT and the MRT are both being built. Buses.', '轻轨和地铁都在盖，只有巴士。'),
    lost: l('Kangkar village and its fish market. At three in the morning someone under the new blocks smells fish.', '港脚渔村和鱼市。凌晨三点有人在新楼底下闻到鱼腥味。'),
  },
  {
    id: 'punggol', en: 'Punggol', zh: '榜鹅', region: 'northeast', kind: 'residential', postal: 19, lon: 103.905, lat: 1.405,
    blurb: l('The pig farms closed at the start of the decade. A jetty, a few seafood places, and a plan for a new town.', '养猪场九十年代初关完了。一座码头、几家海鲜馆，还有一份新镇规划。'),
    react: l('Punggol. You will be one of very few. The seafood is good.', '榜鹅。住这里的人很少。海鲜不错。'),
    blocks: [b('Punggol Point', '榜鹅角', 'The jetty and the seafood restaurants.', '码头和海鲜馆。'), b('Punggol Road', '榜鹅路')],
    transit: l('Buses only.', '只有巴士。'),
    lost: l('The pig farms. When the wind is wrong, the smell comes back.', '猪寮。风向不对的时候，味道会回来。'),
  },
  {
    id: 'seletar', en: 'Seletar', zh: '实里达', region: 'northeast', kind: 'open', postal: 28, lon: 103.868, lat: 1.413,
    blurb: l('The oldest small airfield on the island, red-roofed houses, and a quiet estate of terraces. The rest is fenced and not surveyed.', '岛上最老的小机场、红瓦白墙的老洋房，还有一片安静的排屋。其余围起来，未测绘。'),
    blocks: [b('Seletar Hills', '实里达山', 'Terrace houses with gardens.', '带花园的排屋。'), b('The airfield', '实里达机场')],
    transit: l('Buses.', '巴士。'),
  },
  {
    id: 'north-eastern-islands', en: 'Pulau Ubin', zh: '乌敏岛', region: 'northeast', kind: 'residential', postal: 17, lon: 103.960, lat: 1.408,
    blurb: l('Squared stone. Granite quarries filled with rain, a few villages, bicycle hire and one provision shop. Some houses still use a well and a generator.', '「方石」。花岗岩采石场积水成了湖，几个村子、脚车出租、一间杂货店。有的人家还用井水和发电机。'),
    react: l('Ubin. Your letters will come by boat. On some days they will not come.', '乌敏岛。你的信要坐船来。有的日子不来。'),
    blocks: [
      b('Ubin village', '乌敏村'),
      b('The quarries', '采石场', 'Lakes now.', '现在是湖。'),
      b('Pulau Tekong', '德光岛', 'Not surveyed.', '未测绘。'),
      b('Pulau Serangoon', '实龙岗岛', 'Nobody lives there. An empty villa.', '没人住，岛上有一座空别墅。'),
    ],
    transit: l('Bumboat from Changi Village. It leaves when twelve people are aboard.', '樟宜村码头的驳船，凑满十二个人才开。'),
  },

  /* ---------------- West ---------------- */
  {
    id: 'west-coast', en: 'West Coast', zh: '西海岸', region: 'west', kind: 'residential', postal: 5, lon: 103.764, lat: 1.316, left: true,
    blurb: l('A late-seventies town beside the university, with a seaside park and a reservoir named for the pandan leaf.', '七十年代末的新镇，旁边是大学，有海边公园，还有一个以香兰叶命名的水库。'),
    react: l('West Coast. Students upstairs. They will be quiet in the examination weeks.', '西海岸。楼上住着学生，考试那几个星期会安静。'),
    blocks: [b('West Coast Central', '西海岸中心'), b('Sunset Way', '日落道'), b('West Coast Park', '西海岸公园'), b('Pandan', '班丹', 'Pandan reservoir.', '班丹水库。')],
    transit: l('East–West line at West Coast.', '东西线西海岸站。'),
  },
  {
    id: 'jurong-east', en: 'Jurong East', zh: '裕廊东', region: 'west', kind: 'residential', postal: 22, lon: 103.742, lat: 1.333, major: true, left: true,
    blurb: l('Where the two lines meet: a Chinese garden with a seven-storey pagoda, a science centre with a dome for a screen, and a lake. Jurong may be the Malay for shark.', '两条线在这里接头：有七层塔的裕华园、半球形银幕的科学馆，还有一个湖。「裕廊」一说是马来语的鲨鱼。'),
    react: l('Jurong East. No sharks in the lake. The Office has checked.', '裕廊东。湖里没有鲨鱼，署里查过了。'),
    blocks: [b('Jurong East Central', '裕廊东中心'), b('Chinese Garden', '裕华园', 'A Japanese garden over the bridge.', '过一座桥是日式园子。'), b('Lakeside', '湖畔'), b('Teban Gardens', '德本园')],
    transit: l('North–South and East–West lines at Jurong East; East–West line at Chinese Garden and Lakeside.', '南北线、东西线裕廊东；东西线裕华园、湖畔。'),
  },
  {
    id: 'jurong-west', en: 'Jurong West', zh: '裕廊西', region: 'west', kind: 'residential', postal: 22, lon: 103.704, lat: 1.341, left: true,
    blurb: l('One of the biggest towns on the island, built in the eighties and nineties. A college by a lake and a garden in the Yunnan style.', '岛上最大的组屋镇之一，八九十年代盖的。湖边一所工学院，一座云南式园子。'),
    react: l('Jurong West. A long way from the Axis. The Office calls that an advantage.', '裕廊西。离中枢很远。署里说这是优点。'),
    blocks: [b('Jurong West Central', '裕廊西中心', 'A mall from 1995.', '1995 年开的商场。'), b('Boon Lay Place', '文礼坊'), b('Yunnan Garden', '云南园')],
    transit: l('East–West line terminus at Boon Lay.', '东西线终点文礼站。'),
  },
  {
    id: 'boon-lay', en: 'Boon Lay', zh: '文礼', region: 'west', kind: 'open', postal: 22, lon: 103.706, lat: 1.318, left: true,
    blurb: l('The bird park on Jurong Hill, the lookout tower, and the port.', '裕廊山上的飞禽公园、观景塔，还有港口。'),
    blocks: [b('The bird park', '飞禽公园', 'A waterfall aviary, penguins, two shows a day.', '大瀑布鸟笼、企鹅馆，每天两场鸟表演。'), b('Jurong Port', '裕廊港')],
    transit: l('Buses from Boon Lay.', '文礼的巴士。'),
  },
  {
    id: 'pioneer', en: 'Pioneer', zh: '先驱', region: 'west', kind: 'open', postal: 22, lon: 103.680, lat: 1.318, left: true,
    blurb: l('Factories, container lorries and dormitories. At seven in the morning the roads are full of factory buses.', '工厂、货柜车、宿舍。早上七点满街厂车。'),
    blocks: [],
    transit: l('Factory buses.', '厂车。'),
  },
  {
    id: 'tuas', en: 'Tuas', zh: '大士', region: 'west', kind: 'open', postal: 22, lon: 103.640, lat: 1.305, left: true,
    blurb: l('The western end, still being filled in. The Second Link opened last year.', '岛的最西头，还在填海。第二通道去年刚通。'),
    blocks: [b('The Second Link', '第二通道'), b('The power station', '发电厂')],
    transit: l('Buses to the Second Link.', '去第二通道的巴士。'),
  },
  {
    id: 'western-islands', en: 'Western Islands', zh: '西部岛屿', region: 'west', kind: 'open', postal: 22, lon: 103.700, lat: 1.265, left: true,
    blurb: l('Seven small islands being filled into one, a refinery island, and a rubbish island that opened in April.', '七个小岛正在被填成一个，一座炼油岛，还有四月刚开张的垃圾岛。'),
    blocks: [
      b('Jurong Island', '裕廊岛', 'Half joined, half still sea. The old island names come off the chart one at a time.', '一半连上，一半还是海。旧岛名一个一个从图上划掉。'),
      b('Pulau Bukom', '毛广岛', 'A refinery.', '一座炼油厂。'),
      b('Pulau Semakau', '实马高岛', 'Opened in April for the island’s rubbish, which comes by barge.', '四月刚开张的垃圾岛，垃圾从本岛船运过去。'),
    ],
    transit: l('Works boats.', '厂船。'),
  },
  {
    id: 'western-catchment', en: 'Western Catchment', zh: '西部集水区', region: 'west', kind: 'unsurveyed', postal: 24, lon: 103.672, lat: 1.392, left: true,
    blurb: l('Four reservoirs drawn in outline: Tengeh, Poyan, Murai, Sarimbun. The rest is blank.', '只画四个水库的轮廓：登加、波岩、美籁、沙林文。其余空白。'),
    blocks: [],
    transit: l('None.', '没有。'),
  },
  {
    id: 'tengah', en: 'Tengah', zh: '登加', region: 'west', kind: 'unsurveyed', postal: 24, lon: 103.722, lat: 1.368, left: true,
    blurb: l('“Middle.” Forest and a fenced runway. Not surveyed.', '「中间」。一大片林子和围起来的跑道。未测绘。'),
    blocks: [],
    transit: l('None.', '没有。'),
  },
  {
    id: 'bukit-batok', en: 'Bukit Batok', zh: '武吉巴督', region: 'west', kind: 'residential', postal: 23, lon: 103.754, lat: 1.355, left: true,
    blurb: l('Coconut-shell hill, the Office says. Coughing hill, say the residents. An eighties town with an aerial on the hill and a flooded quarry.', '署里说是「椰壳山」，居民坚持是「咳嗽山」。八十年代的新镇，山上有电视天线，还有一个积了水的采石场。'),
    react: l('Bukit Batok. Officially the coconut. Unofficially, mind your throat.', '武吉巴督。官方说是椰壳。私下里，小心喉咙。'),
    blocks: [
      b('Bukit Batok Central', '武吉巴督中心'),
      b('Bukit Gombak', '武吉甘柏'),
      b('Little Guilin', '小桂林', 'A quarry full of water; the cliff stands in it like a painting.', '采石场积满了水，崖壁倒映在水里，像画。'),
      b('Hillview', '山景'),
      b('Dairy Farm', '牛奶场', 'It really was one.', '以前真的是牛奶场。'),
    ],
    transit: l('North–South line at Bukit Batok and Bukit Gombak.', '南北线武吉巴督、武吉甘柏。'),
    lost: l('The cows at Dairy Farm.', '牛奶场的牛。'),
  },
  {
    id: 'bukit-panjang', en: 'Bukit Panjang', zh: '武吉班让', region: 'west', kind: 'residential', postal: 23, lon: 103.770, lat: 1.379,
    blurb: l('Long hill. The light rail opens on 6 November; until then the cars run every day with nobody in them.', '长山。轻轨 11 月 6 日通车，在那之前每天空车试跑。'),
    react: l('Bukit Panjang. The little trains start in November. Wave at them anyway.', '武吉班让。小火车十一月才通。先朝它挥挥手。'),
    blocks: [b('Bukit Panjang Centre', '武吉班让中心'), b('Fajar', '法嘉', '“Dawn.”', '「黎明」。'), b('Senja', '信佳', '“Dusk.”', '「黄昏」。'), b('Ten Mile Junction', '十里广场', 'The light-rail depot.', '轻轨车厂。')],
    transit: l('The Bukit Panjang light rail (from 6 November); buses.', '武吉班让轻轨（11 月 6 日起）；巴士。'),
  },
  {
    id: 'choa-chu-kang', en: 'Choa Chu Kang', zh: '蔡厝港', region: 'west', kind: 'residential', postal: 23, lon: 103.745, lat: 1.386, left: true,
    blurb: l('The Choa family’s landing. A nineties town, the westernmost of the flats.', '蔡家的港口。九十年代刚盖起来的新镇，最西边的组屋区。'),
    react: l('Choa Chu Kang. The end of the line, for now. Lines grow.', '蔡厝港。暂时是线路的尽头。线会长的。'),
    blocks: [b('Choa Chu Kang Centre', '蔡厝港中心'), b('Yew Tee', '油池'), b('Teck Whye', '德惠'), b('The old village', '蔡厝港老村')],
    transit: l('North–South line at Choa Chu Kang and Yew Tee; the light rail starts here (November); bus interchange.', '南北线蔡厝港、油池；轻轨从这里出发（11 月起）；巴士总站。'),
  },
];

export { LEGACY_DISTRICTS } from './legacy';
import { COAST, ISLANDS } from './sheet';

/** The seven districts the office keeps a clock for. */
export const CLOCK_DISTRICTS = ['axis', 'ang-mo-kio', 'toa-payoh', 'bukit-merah', 'hougang', 'woodlands', 'serangoon'];

/* ---------------- the sheet ---------------- */
// The survey sheet is 1000 × 560. One degree is 2150 units, from 103.605°E and 1.475°N.
const K = 2150, LON0 = 103.605, LAT0 = 1.475;
export const project = (lon: number, lat: number): [number, number] => [Math.round((lon - LON0) * K), Math.round((LAT0 - lat) * K)];

/** The shore before the reclamation, in degrees. */
const OLD_SHORE_DEG: [number, number][] = [
  [103.79, 1.276], [103.82, 1.271], [103.838, 1.274], [103.848, 1.281], [103.856, 1.293], [103.864, 1.3], [103.878, 1.302], [103.896, 1.305],
  [103.914, 1.308], [103.932, 1.312], [103.952, 1.318], [103.972, 1.33], [103.988, 1.346],
];

const path = (pts: [number, number][], close: boolean) =>
  pts.map(([lo, la], i) => `${i ? 'L' : 'M'}${project(lo, la).join(' ')}`).join('') + (close ? 'Z' : '');

const ring = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.join(' ')}`).join('') + 'Z';

/** The island on the sheet: the 1999 coast after OpenStreetMap (sheet.ts, generated), and the old shore. */
export const SHEET = {
  coast: ring(COAST),
  islands: ISLANDS.map(ring),
  oldShore: path(OLD_SHORE_DEG, false),
  /** The coast as points on the sheet, for the office's canvases. */
  coastPoints: COAST,
  islandPoints: ISLANDS,
};
