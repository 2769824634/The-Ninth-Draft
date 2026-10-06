/** The full text of one shelved book, fetched when it is taken down (see src/lib/books.ts). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadBooks } from '../../../lib/books';
import type { LibPage } from '../../../lib/library';

export const getStaticPaths: GetStaticPaths = async () => {
  const books = await loadBooks(import.meta.env.BASE_URL);
  return books.map(({ book, pages }) => ({ params: { id: book.id.replace(/^book-/, '') }, props: { pages } }));
};

// a book is printed in one language, so most pages say the same thing in both slots: send it once
const one = (l: { en: string; zh: string }) => (l.en === l.zh ? l.en : l);

export const GET: APIRoute = ({ props }) =>
  new Response(JSON.stringify({ pages: props.pages.map((p: LibPage) => ({ ...p, head: one(p.head), html: one(p.html) })) }), {
    headers: { 'Content-Type': 'application/json' },
  });
