/**
 * The three routine questions of Form RO-9, in one place so the form, the
 * counter clerk's remarks and the visitor's file all use the same wording.
 *
 * `note` is what the Office writes in the visitor's file; `react` is what the
 * clerk says at the counter the moment the option is picked.
 */
export type L = { en: string; zh: string };

export interface Option {
  /** Short answer, as written on the form and on the card. */
  v: L;
  /** The Office's remark in the visitor's file. */
  note: L;
  /** The clerk's remark at the counter. */
  react: L;
}

export interface Question {
  /** Row label in the file. */
  label: L;
  q: L;
  opts: [Option, Option, Option];
}

export const QUESTIONS: [Question, Question, Question] = [
  {
    label: { en: 'Sleep', zh: '就寝' },
    q: { en: 'What time do you usually go to sleep?', zh: '你一般几点睡？' },
    opts: [
      {
        v: { en: 'Before eleven', zh: '十一点前' },
        note: { en: 'Nobody has ever seen you after midnight. The Office is relieved.', zh: '没人见过你过了半夜的样子。署里松了口气。' },
        react: { en: 'Early to bed. The Office admires that in a resident, and distrusts it.', zh: '十一点前就睡。署里欣赏这种居民，也提防这种居民。' },
      },
      {
        v: { en: 'After two', zh: '两点以后' },
        note: { en: 'The hour when nobody checks the register. You fall into the gap.', zh: '这个钟点没人核对名册，你正好落在缝里。' },
        react: { en: 'Nobody checks the register at that hour. Handy, depending on who you are.', zh: '那个钟点没人核对名册。挺方便的，看对谁。' },
      },
      {
        v: { en: 'Clock unreliable', zh: '钟不太准' },
        note: { en: 'Your clock runs one draft behind. It is the only accurate one on the island.', zh: '你家的钟慢了一稿，全岛只有它是准的。' },
        react: { en: 'Write that down. No, don’t. Actually, do.', zh: '记下来。算了别记。还是记吧。' },
      },
    ],
  },
  {
    label: { en: 'Your road', zh: '门前的路' },
    q: { en: 'The road outside your home: what was it called before?', zh: '你家门口那条路，以前叫什么？' },
    opts: [
      {
        v: { en: 'Always this name', zh: '一直叫这个' },
        note: { en: 'The Office holds three forms that disagree with you.', zh: '署里有三份表格不同意你的说法。' },
        react: { en: 'Always the same name. How reassuring. Please keep saying so.', zh: '一直叫这个名字？真让人放心。请保持这个说法。' },
      },
      {
        v: { en: 'Changed, I think', zh: '好像改过' },
        note: { en: 'You remember the old name. Do not say it aloud.', zh: '你记得旧名字。别说出口。' },
        react: { en: 'Interesting. People who say that are usually right.', zh: '有意思。这么说的人，多半是对的。' },
      },
      {
        v: { en: 'Declined to answer', zh: '拒绝回答' },
        note: { en: 'Your discretion has been noted, in triplicate.', zh: '你的谨慎已记录在案，一式三份。' },
        react: { en: 'Sensible. The form allows it. Just.', zh: '明智。表格允许你不答，勉强。' },
      },
    ],
  },
  {
    label: { en: 'Felt off', zh: '不对劲的地方' },
    q: { en: 'Where did you last feel that something was off?', zh: '你最近一次觉得「不太对」，是在哪里？' },
    opts: [
      {
        v: { en: 'On a bus', zh: '巴士上' },
        note: { en: 'A stop was announced that was demolished years ago.', zh: '报了一个早就拆掉的站。' },
        react: { en: 'Buses are where the island leaks most. Noted.', zh: '巴士上。全岛漏得最厉害的就是巴士。记下了。' },
      },
      {
        v: { en: 'Corridor of my block', zh: '组屋走廊' },
        note: { en: 'One door number skips. You counted twice.', zh: '有一扇门牌跳了号，你数过两遍。' },
        react: { en: 'Third floor, I assume. It is always the third floor.', zh: '三楼吧。总是三楼。' },
      },
      {
        v: { en: 'In a mirror', zh: '镜子前' },
        note: { en: 'Half a second late. It is catching up.', zh: '慢了半拍。它在追。' },
        react: { en: 'Mirrors are not under the Office’s jurisdiction. Yet.', zh: '镜子不归署里管。暂时。' },
      },
    ],
  },
];
