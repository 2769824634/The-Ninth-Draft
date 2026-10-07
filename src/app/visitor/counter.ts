/**
 * What the clerk at the registration counter says. Short, dry, a little too
 * interested in the form. Kept apart from archivist.json because these lines
 * only exist on the registration page.
 */
import type { L } from './questions';
import { DISTRICTS, type DistrictId } from './districts';

export const COUNTER = {
  greet: { en: 'Window 3. Name, district, three routine questions. It takes a minute. The form takes longer.', zh: '三号窗口。姓名、住处、三道例行问题，一分钟办完。表格要久一点。' },
  codeEmpty: { en: 'A name, please. Any name. The Office is not fussy.', zh: '写个名字吧，什么名字都行，署里不挑。' },
  code: { en: '“{name}”. Hm. I will make a note.', zh: '「{name}」。嗯，记下了。' },
  codeLong: { en: '“{name}”. Long. The form has twenty-four boxes. Do try.', zh: '「{name}」。有点长。表格一共二十四格，尽量。' },
  codeNum: { en: 'A number? We have plenty of those already.', zh: '光是数字？我们数字够多了。' },
  codeKnown: { en: '“{name}”. That one is on file already. In a different draft.', zh: '「{name}」，已经有人叫这个名字了。在另一稿里。' },
  district: { en: 'Where do you live? Which part of the island first, then the district. Only places with homes count.', zh: '住哪一带？先说哪一片，再说哪个区。只算住人的地方。' },
  region: { en: '{region}. Which district? The list is under the sheet.', zh: '{region}，好。哪个区？单子在地图底下。' },
  noHomes: { en: '{name}? Nobody lives there. Pick somewhere with a letterbox.', zh: '{name}？那里没人住。挑个有信箱的地方。' },
  unsurveyed: { en: '{name} has not been surveyed. Nobody is filed there, and nobody asks.', zh: '{name}没测绘过。那里没登记过人，也没人问。' },
  question: { en: 'Routine question {n} of 3.', zh: '例行问题，第 {n} 题，共 3 题。' },
  lineAsk: { en: 'One last thing, optional. Everyone remembers something the Office says never existed.', zh: '最后一项，选填。人人都记得点什么东西，而署里说那从没有过。' },
  lineGiven: { en: '“{line}”. Noted. The Office will say it never existed.', zh: '「{line}」。记下了。署里会说那从没有过。' },
  lineSkip: { en: 'Nothing? Everyone remembers something. Fine.', zh: '没有？人人都记得点什么。算了。' },
  review: { en: 'Read it back. Once it is filed, it is the version we keep.', zh: '核对一遍。归档以后，署里就认这一份。' },
  done: { en: 'Filed. You are on the register. That is not a threat.', zh: '归档完毕。你已在册。这不是威胁。' },
  known: ['heuss', 'yosh', 'frank'],
} as const;

/** What the clerk knows about each district: the gazetteer's line, and her remark when you pick it. */
export const DISTRICT_TEXT: Record<DistrictId, { blurb: L; react: L }> = Object.fromEntries(
  DISTRICTS.map((d) => [d.id, { blurb: d.blurb, react: d.react ?? d.blurb }]),
);

/** Lines typed one by one while the form is being processed. `{district}` is filled in. */
export const FILING: L[] = [
  { en: 'Checking the register…', zh: '核对名册……' },
  { en: 'No such resident. Proceeding.', zh: '查无此人。继续办理。' },
  { en: 'Cross-referencing {district}…', zh: '比对{district}户籍……' },
  { en: '1 discrepancy found. Filing anyway.', zh: '发现 1 处出入。照常归档。' },
  { en: 'Assigning file number…', zh: '分配档案编号……' },
  { en: 'Stamp.', zh: '盖章。' },
];
