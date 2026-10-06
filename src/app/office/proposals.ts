/**
 * Heuss's year-field proposals, as the Data Section keeps them: eight
 * returned with a slip each. The ninth was never submitted.
 */
export const PROPOSALS: { date: string; en: string; zh: string }[] = [
  { date: '09.02.99', en: 'Returned. Please use the form in force.', zh: '退回。请使用现行表格。' },
  { date: '09.03.99', en: 'Returned. Cost estimate in the wrong currency.', zh: '退回。预算用错了币种。' },
  { date: '09.05.99', en: 'Returned. Please do not attach diagrams to the cover sheet.', zh: '退回。图表请勿贴在封面页上。' },
  { date: '09.06.99', en: 'Returned. The committee does not meet in December.', zh: '退回。委员会十二月不开会。' },
  { date: '09.08.99', en: 'Returned. Appendix C refers to an Appendix D.', zh: '退回。附录 C 提到了附录 D。' },
  { date: '09.09.99', en: 'Returned. Too long. Please reduce to one page.', zh: '退回。太长，请压缩到一页。' },
  { date: '09.10.99', en: 'Returned. One page is not enough for a matter of this size.', zh: '退回。这么大的事，一页纸不够。' },
  { date: '09.11.99', en: 'Returned. See comments.', zh: '退回。见意见栏。' },
];

/** A proposal dated dd.mm.99 turns up on the island's dd/mm, like everything else. */
export const proposalDay = (d: string) => `1999-${d.slice(3, 5)}-${d.slice(0, 2)}`;
