/**
 * The districts of Gerimis, as the site uses them. The gazetteer itself is in
 * src/data/gerimis/districts.ts; keys there match the `district` field of
 * records (content.config.ts). Here each district gets its place on the
 * survey sheet (`x, y`, viewBox 1000×560) and a clock offset from the Axis
 * (`tz`, whole hours).
 */
import { CLOCK_DISTRICTS, DISTRICT_DATA, REGIONS, project, type DistrictData } from '../../data/gerimis/districts';
import { currentDistrict } from '../../data/gerimis/legacy';
import { LABEL, PAGE, PAGES } from '../../data/gerimis/sheet';

export interface District extends DistrictData {
  x: number;
  y: number;
  tz: number;
  left: boolean;
}

export type DistrictId = string;

export const DISTRICTS: District[] = DISTRICT_DATA.map((d) => {
  // the name sits where the street map puts it, deepest inside the district
  const [x, y] = LABEL[d.id] ?? project(d.lon, d.lat);
  return { ...d, x, y, tz: d.tz ?? 0, left: !!d.left };
});

export { REGIONS };

/** Where people live, and so where a visitor can register. */
export const RESIDENTIAL = DISTRICTS.filter((d) => d.kind === 'residential');

/** The seven districts the office keeps a clock for. */
export const CLOCKS = CLOCK_DISTRICTS.map((id) => DISTRICTS.find((d) => d.id === id)!);

/** A district by key, old keys included. */
export const district = (id?: string | null) => (id ? DISTRICTS.find((d) => d.id === currentDistrict(id)) : undefined);

export const districtName = (id: string, zh: boolean) => {
  const d = district(id);
  return d ? (zh ? d.zh : d.en) : id;
};

/** Where a district's name sits by its pin on the island-wide sheet, so the large towns do not write over each other. */
const SIDE: Record<string, 't' | 'b'> = { tampines: 't', 'ang-mo-kio': 't', 'toa-payoh': 'b', changi: 'b' };
export const labelSide = (d: District): 'l' | 'r' | 't' | 'b' => SIDE[d.id] ?? (d.left ? 'l' : 'r');

const PAGE_NO = new Map(PAGES.map((cell, i) => [cell, i + 1]));
/**
 * Street-directory reference for a point on the sheet, e.g. "112 C3": the page
 * (numbered from the north-west, only where there is land) and the square on
 * it (A–D across, 1–4 down). Null out at sea.
 */
export const pageRef = (p: Pick<District, 'x' | 'y'>) => {
  const c = Math.floor(p.x / PAGE.w), r = Math.floor(p.y / PAGE.h);
  const no = PAGE_NO.get(r * PAGE.cols + c);
  if (!no || c < 0 || c >= PAGE.cols) return null;
  const sq = 'ABCD'[Math.min(3, Math.floor(((p.x - c * PAGE.w) / PAGE.w) * 4))] + (Math.min(3, Math.floor(((p.y - r * PAGE.h) / PAGE.h) * 4)) + 1);
  return { page: no, square: sq, text: `${no} ${sq}` };
};

/** The nearest districts on the sheet. */
export const nearest = (d: District, n: number) =>
  DISTRICTS.filter((x) => x.id !== d.id)
    .map((x) => ({ x, k: (x.x - d.x) ** 2 + (x.y - d.y) ** 2 }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((a) => a.x);
