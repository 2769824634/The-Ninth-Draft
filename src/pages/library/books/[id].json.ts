/** The full text of one shelved book, fetched when it is taken down (see src/lib/books.ts). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadBooks } from '../../../lib/books';

export const getStaticPaths: GetStaticPaths = async () => {
  const books = await loadBooks(import.meta.env.BASE_URL);
  return books.map(({ book, pages }) => ({ params: { id: book.id.replace(/^book-/, '') }, props: { pages } }));
};

export const GET: APIRoute = ({ props }) => new Response(JSON.stringify({ pages: props.pages }), { headers: { 'Content-Type': 'application/json' } });
