/**
 * District keys from before the 2026-10 survey, and where they went. Kept in
 * a file of its own so the visitor store can read it without loading the
 * whole gazetteer.
 */
export const LEGACY_DISTRICTS: Record<string, string> = {
  'pons-ruber': 'ang-mo-kio',
  'palus-magna': 'toa-payoh',
  'collis-ruber': 'bukit-merah',
  'portus-posterior': 'hougang',
  silva: 'woodlands',
  serrangon: 'serangoon',
};

/** The seven districts in the order the first recovery phrases counted them. Never change. */
export const PHRASE_V1 = ['axis', 'pons-ruber', 'palus-magna', 'collis-ruber', 'portus-posterior', 'silva', 'serrangon'];

/** An old key → its new one; anything else comes back as it was. */
export const currentDistrict = (id: string) => LEGACY_DISTRICTS[id] ?? id;
