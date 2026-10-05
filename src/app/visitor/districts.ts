/**
 * The seven districts of Gerimis. Keys match the `district` field of records
 * (content.config.ts). `x, y` place them on the island map (viewBox 1000×560); `left` puts
 * the label on the west side of the pin.
 */
export const DISTRICTS = [
  { id: 'axis', en: 'Axis', zh: '中枢', note: 'Core district', x: 560, y: 420, left: false },
  { id: 'pons-ruber', en: 'Pons Ruber', zh: '红桥', note: 'Residential', x: 520, y: 240, left: false },
  { id: 'palus-magna', en: 'Palus Magna', zh: '大泽', note: 'Residential', x: 540, y: 330, left: false },
  { id: 'collis-ruber', en: 'Collis Ruber', zh: '红丘', note: 'Residential', x: 360, y: 395, left: true },
  { id: 'portus-posterior', en: 'Portus Posterior', zh: '后港', note: 'Residential', x: 760, y: 225, left: false },
  { id: 'silva', en: 'Silva', zh: '林地', note: 'Residential', x: 430, y: 125, left: false },
  { id: 'serrangon', en: 'Serrangon', zh: '实龙岗', note: 'Residential', x: 680, y: 290, left: false },
] as const;

export type DistrictId = (typeof DISTRICTS)[number]['id'];

export const districtName = (id: string, zh: boolean) => {
  const d = DISTRICTS.find((x) => x.id === id);
  return d ? (zh ? d.zh : d.en) : id;
};
