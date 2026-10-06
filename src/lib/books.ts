/**
 * Books for the reading-room shelves, bound from src/content/books/*.md.
 *
 * A book is printed in its own language whatever the reader's switch says;
 * only the spine, the card and the furniture of the title page follow it.
 * `## ` headings are chapters, and a long chapter is cut into pages of
 * roughly a sitting's reading. The full text is served as its own JSON file
 * (library/books/<id>.json) and fetched when the book is taken down, so the
 * reading room never carries twenty books in its page.
 */
import { getCollection } from 'astro:content';
import type { LibBook, LibPage } from './library';

type L = { en: string; zh: string };

/** Characters of text a page holds: fewer for Chinese, which reads denser. */
const PER_PAGE = { zh: 900, en: 2200 };
const CLOTHS = ['#3a4636', '#5b2e26', '#2d3b52', '#5a4a2d', '#433843', '#2e4644', '#4a4a44', '#6a3a22', '#273a33'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const textLen = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
const same = (s: string): L => ({ en: s, zh: s });

/** Top-level blocks of a chapter's HTML, in order. */
const blocks = (html: string) => html.match(/<(p|blockquote|ul|ol|pre|h3|h4|table|figure)\b[\s\S]*?<\/\1>|<hr\s*\/?>/g) ?? [];

export interface BoundBook {
  book: LibBook;
  /** Every page, text included, for library/books/<id>.json. */
  pages: LibPage[];
}

export async function loadBooks(base: string): Promise<BoundBook[]> {
  const entries = (await getCollection('books')).sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
  return entries.map(({ id, data, rendered }, i) => {
    const lang = data.lang;
    const other = lang === 'zh' ? 'en' : 'zh';
    const title: L = { [lang]: data.title, [other]: data.titleAlt ?? data.title } as L;
    const author: L = { [lang]: data.author, [other]: data.authorAlt ?? data.author } as L;

    // chapters: what comes before the first ## is a preface without a heading
    const html = rendered?.html ?? '';
    const parts = html.split(/(?=<h2\b)/);
    const chapters = parts
      .map((part) => {
        const head = part.match(/^<h2\b[^>]*>([\s\S]*?)<\/h2>/);
        return { head: head ? head[1].replace(/<[^>]+>/g, '').trim() : '', body: head ? part.slice(head[0].length) : part };
      })
      .filter((c) => c.head || textLen(c.body));

    const pages: LibPage[] = [];
    const toc: { head: string; at: number }[] = [];
    // two pages in front: the title page and the contents
    const FRONT = 2;
    for (const c of chapters) {
      const head = c.head || (lang === 'zh' ? '题记' : 'Preface');
      toc.push({ head, at: FRONT + pages.length });
      let cur: string[] = [], n = 0, part = 0;
      const flush = () => {
        if (!cur.length) return;
        const h = part++ ? `${head}${lang === 'zh' ? '（续）' : ' (cont.)'}` : head;
        pages.push({ head: same(h), html: same(cur.join('')) });
        cur = [];
        n = 0;
      };
      for (const b of blocks(c.body)) {
        const len = textLen(b);
        if (n && n + len > PER_PAGE[lang]) flush();
        cur.push(b);
        n += len;
      }
      flush();
    }

    const front: LibPage[] = [
      {
        head: { en: 'Title page', zh: '扉页' },
        html: {
          en: `<div class="lib-title"><h4>${esc(data.title)}</h4><p>${esc(data.author)}</p><p class="lib-small">${esc(data.year)}${lang === 'zh' ? ` · ${esc(title.en)} · ${esc(author.en)}` : ''}</p><p class="lib-small">Public domain. Text from ${esc(data.source)}.</p></div>`,
          zh: `<div class="lib-title"><h4>${esc(data.title)}</h4><p>${esc(data.author)}</p><p class="lib-small">${esc(data.year)}${lang === 'en' ? ` · ${esc(title.zh)} · ${esc(author.zh)}` : ''}</p><p class="lib-small">公版书。底本：${esc(data.source)}。</p></div>`,
        },
      },
      {
        head: { en: 'Contents', zh: '目录' },
        toc: true,
        html: same(`<ol class="lib-toc">${toc.map((t) => `<li><a href="#" data-page="${t.at}"><span>${esc(t.head)}</span><i>${t.at + 1}</i></a></li>`).join('')}</ol>`),
      },
    ];
    const all = [...front, ...pages];
    const n = all.length;
    const book: LibBook = {
      id: `book-${id}`,
      kind: n <= 6 ? 'pamphlet' : 'cloth',
      color: data.color ?? CLOTHS[i % CLOTHS.length],
      spine: title,
      sub: author,
      mark: `PD/${lang.toUpperCase()}/${String(i + 1).padStart(3, '0')}`,
      h: 0.78 + ((i * 7) % 5) * 0.04,
      thick: n <= 6 ? 0.03 + n * 0.004 : Math.min(0.46, 0.08 + n * 0.006),
      // the shelf only needs the headings; the text comes when the book is taken down
      pages: all.map((p, k) => (k < FRONT ? p : { head: p.head, html: { en: '', zh: '' } })),
      imprint: { en: `PUBLIC DOMAIN · ${data.year}`, zh: `公版 · ${data.year}` },
      src: `${base}library/books/${id}.json`,
    };
    return { book, pages: all };
  });
}
