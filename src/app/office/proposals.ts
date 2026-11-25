/**
 * Test proposals on the year-field program: eight returned with a slip each.
 * Placeholders since 2026-11-25; the earlier ones are in git history at 27fc6a2.
 */
export const PROPOSALS: { date: string; en: string; zh: string }[] = [
  { date: '09.02.99', en: 'Returned. Test slip 01.', zh: '退回。测试便条 01。' },
  { date: '09.03.99', en: 'Returned. Test slip 02.', zh: '退回。测试便条 02。' },
  { date: '09.05.99', en: 'Returned. Test slip 03.', zh: '退回。测试便条 03。' },
  { date: '09.06.99', en: 'Returned. Test slip 04.', zh: '退回。测试便条 04。' },
  { date: '09.08.99', en: 'Returned. Test slip 05.', zh: '退回。测试便条 05。' },
  { date: '09.09.99', en: 'Returned. Test slip 06.', zh: '退回。测试便条 06。' },
  { date: '09.10.99', en: 'Returned. Test slip 07.', zh: '退回。测试便条 07。' },
  { date: '09.11.99', en: 'Returned. Test slip 08.', zh: '退回。测试便条 08。' },
];

/** A proposal dated dd.mm.99 turns up on the island's dd/mm, like everything else. */
export const proposalDay = (d: string) => `1999-${d.slice(3, 5)}-${d.slice(0, 2)}`;
