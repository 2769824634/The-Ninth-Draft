/**
 * What the clerk at the registration counter says. Short, dry, a little too
 * interested in the form. Kept apart from archivist.json because these lines
 * only exist on the registration page.
 */
import type { L } from './questions';
import type { DistrictId } from './districts';

export const COUNTER = {
  greet: { en: 'Window 3. Name, district, three routine questions. It takes a minute. The form takes longer.', zh: '三号窗口。姓名、住处、三道例行问题，一分钟办完。表格要久一点。' },
  codeEmpty: { en: 'A name, please. Any name. The Office is not fussy.', zh: '写个名字吧，什么名字都行，署里不挑。' },
  code: { en: '“{name}”. Hm. I will make a note.', zh: '「{name}」。嗯，记下了。' },
  codeLong: { en: '“{name}”. Long. The form has twenty-four boxes. Do try.', zh: '「{name}」。有点长。表格一共二十四格，尽量。' },
  codeNum: { en: 'A number? We have plenty of those already.', zh: '光是数字？我们数字够多了。' },
  codeKnown: { en: '“{name}”. That one is on file already. In a different draft.', zh: '「{name}」，已经有人叫这个名字了。在另一稿里。' },
  district: { en: 'Where do you live? Press the island.', zh: '住哪一带？点一下地图。' },
  question: { en: 'Routine question {n} of 3.', zh: '例行问题，第 {n} 题，共 3 题。' },
  lineAsk: { en: 'One last thing, optional. Everyone remembers something the Office says never existed.', zh: '最后一项，选填。人人都记得点什么东西，而署里说那从没有过。' },
  lineGiven: { en: '“{line}”. Noted. The Office will say it never existed.', zh: '「{line}」。记下了。署里会说那从没有过。' },
  lineSkip: { en: 'Nothing? Everyone remembers something. Fine.', zh: '没有？人人都记得点什么。算了。' },
  review: { en: 'Read it back. Once it is filed, it is the version we keep.', zh: '核对一遍。归档以后，署里就认这一份。' },
  done: { en: 'Filed. You are on the register. That is not a threat.', zh: '归档完毕。你已在册。这不是威胁。' },
  known: ['heuss', 'yosh', 'frank'],
} as const;

export const DISTRICT_TEXT: Record<DistrictId, { blurb: L; react: L }> = {
  axis: {
    blurb: { en: 'Where the Records Office sits. Every road on the island is on the way to it.', zh: '记录署就在这儿。岛上所有的路，都是去中枢的路上。' },
    react: { en: 'Axis. You live next door to the Office. Please do not wave.', zh: '中枢。你和署里是邻居。请不要朝它挥手。' },
  },
  'pons-ruber': {
    blurb: { en: 'Red bridge, red paint, red tape. All three are original.', zh: '红桥、红漆、红头文件。三样都是原装的。' },
    react: { en: 'Pons Ruber. The bridge has been repainted nine times. Nobody remembers another colour.', zh: '红桥。桥重新漆过九次，没人记得它原来是什么颜色。' },
  },
  'palus-magna': {
    blurb: { en: 'A big marsh, now mostly flats. The marsh was not consulted.', zh: '名字叫大泽，现在全是组屋。沼泽没有被征求过意见。' },
    react: { en: 'Palus Magna. Mind the damp. It is older than the flats.', zh: '大泽。小心潮气，它比组屋年纪大。' },
  },
  'collis-ruber': {
    blurb: { en: 'A red hill, flat as a table. The hill was revised out. The name stayed.', zh: '红丘，一座平得像桌子的山。山被修订掉了，名字留了下来。' },
    react: { en: 'Collis Ruber. Two residents on file already. Both very observant.', zh: '红丘。已有两位居民在册，都很爱观察。' },
  },
  'portus-posterior': {
    blurb: { en: 'The back harbour. Ships dock here, usually yesterday’s.', zh: '后港。船都在这里靠岸，通常是昨天的船。' },
    react: { en: 'Portus Posterior. Ships dock here. Not all of them have left yet.', zh: '后港。船在这儿靠岸，有的还没离开。' },
  },
  silva: {
    blurb: { en: 'Woodland at the edge of the island. The trees grow back faster than the files are revised.', zh: '林地，岛的边上。树长得比档案修订得还快。' },
    react: { en: 'Silva. Quiet out there. The Office tends to look twice at quiet districts.', zh: '林地。那边安静。安静的区，署里一般会多看两眼。' },
  },
  serrangon: {
    blurb: { en: 'Named for a bird nobody has seen. The bird is on file.', zh: '名字来自一种没人见过的鸟。那只鸟有档案。' },
    react: { en: 'Serrangon. The bird is on file. You soon will be.', zh: '实龙岗。那只鸟有档案，你也快有了。' },
  },
};

/** Lines typed one by one while the form is being processed. `{district}` is filled in. */
export const FILING: L[] = [
  { en: 'Checking the register…', zh: '核对名册……' },
  { en: 'No such resident. Proceeding.', zh: '查无此人。继续办理。' },
  { en: 'Cross-referencing {district}…', zh: '比对{district}户籍……' },
  { en: '1 discrepancy found. Filing anyway.', zh: '发现 1 处出入。照常归档。' },
  { en: 'Assigning file number…', zh: '分配档案编号……' },
  { en: 'Stamp.', zh: '盖章。' },
];
