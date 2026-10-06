/**
 * A file opened from a room or a flat page carries where it came from
 * (?from=<path>), so putting it away goes back there instead of to the
 * archive's overview.
 */
export const fromHere = (href: string) => {
  const u = new URL(href, location.href);
  if (u.origin !== location.origin || !/\/records\/[^/]+\/?$/.test(u.pathname) || u.searchParams.has('from')) return href;
  u.searchParams.set('from', location.pathname);
  return u.pathname + u.search + u.hash;
};

/** Rewrite record links on the way out, wherever they were drawn. */
export function carryFrom(root: Document | HTMLElement = document) {
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[href]');
    if (!a || a.target === '_blank') return;
    const to = fromHere(a.href);
    if (to !== a.href) a.href = to;
  }, true);
}
