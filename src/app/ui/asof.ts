/**
 * A file as it stands on the island's today. A draft dated to a day still to
 * come is not in the file yet, so until that day the file reads as its last
 * draft that is on file: what that draft struck is gone, what later drafts add
 * is not there yet, and its status is the one that draft gave. Once every named
 * draft's day has come, the file is its final (draft 9).
 */
import { isFiled } from '../island';

interface Draft { n: number; date?: string; status?: string }

/** The draft a file stands at today: 9, or the last named draft on file. */
export function standing(drafts: Draft[] = []): number {
  const named = drafts.filter((d) => d.n < 9);
  if (named.every((d) => isFiled(d.date))) return 9;
  const on = named.filter((d) => isFiled(d.date)).map((d) => d.n);
  return on.length ? Math.max(...on) : 9;
}

/** The status the file has today: the last one a draft on file gave, else the file's own. */
export function statusNow(status: string, drafts: Draft[] = []) {
  const k = standing(drafts);
  if (k === 9) return status;
  const d = drafts.filter((x) => x.n <= k && x.status).sort((a, b) => b.n - a.n)[0];
  return d?.status ?? status;
}

export const inRange = (spec: string | undefined, d: number) => {
  if (!spec) return false;
  const [a, b] = spec.split('-').map(Number);
  return d >= a && d <= (b || a);
};

/** How a marked passage reads once draft `k` is filed (9: the final). */
export function filedAt(s: HTMLElement, k: number) {
  const add = Number(s.dataset.add) || 0;
  const del = Number(s.dataset.del) || 0;
  return { gone: (add > 0 && k < add) || (del > 0 && k >= del), redacted: inRange(s.dataset.redact, k) };
}

/** Marked-up text flattened as it stands at draft `k`: struck words and margin notes gone, black bars black. */
export function plainAt(html: string, k = 9) {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('.rv-note').forEach((x) => x.remove());
  d.querySelectorAll<HTMLElement>('.rv').forEach((x) => {
    if (filedAt(x, k).gone) x.remove();
  });
  d.querySelectorAll<HTMLElement>('.redact, .rv[data-redact]').forEach((x) => {
    if (!x.dataset.redact || filedAt(x, k).redacted) x.textContent = '█'.repeat(Math.max(3, Math.min(12, (x.textContent ?? '').length)));
  });
  return (d.textContent ?? '').replace(/\s+/g, ' ').trim();
}
