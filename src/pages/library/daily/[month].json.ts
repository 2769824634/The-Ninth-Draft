/** One month of the Gerimis Daily, fetched when its stick is taken off the rack (see src/app/library/paper.ts). */
import type { APIRoute, GetStaticPaths } from 'astro';
import { loadRecords } from '../../../lib/records';
import { buildIssues, type Issue } from '../../../lib/daily';

export const getStaticPaths: GetStaticPaths = async () => {
  const issues = buildIssues(await loadRecords(import.meta.env.BASE_URL)).slice().reverse();
  const months = new Map<string, Issue[]>();
  for (const x of issues) {
    const k = x.date < '1999' ? 'early' : x.date.slice(0, 7);
    if (!months.has(k)) months.set(k, []);
    months.get(k)!.push(x);
  }
  return [...months].map(([month, list]) => ({ params: { month }, props: { issues: list } }));
};

export const GET: APIRoute = ({ props }) => new Response(JSON.stringify({ issues: props.issues }), { headers: { 'Content-Type': 'application/json' } });
