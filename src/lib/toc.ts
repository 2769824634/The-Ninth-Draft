/** A book's contents page, shared by the build and the reading room (which rebuilds it when pages are left out). */
type L = { en: string; zh: string };
type Page = { head: L };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const contents = (pages: Page[]): L => {
  const toc = (k: 'en' | 'zh') => `<ol class="lib-toc">${pages.map((x, i) => `<li><a href="#" data-page="${i + 1}"><span>${esc(x.head[k])}</span><i>${i + 2}</i></a></li>`).join('')}</ol>`;
  return { en: toc('en'), zh: toc('zh') };
};
