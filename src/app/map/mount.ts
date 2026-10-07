/**
 * Wires a StreetMap.astro block: the canvas, the zoom buttons, the page
 * reference in the corner and the district card.
 */
import { streetMap, type Block } from './street';
import { district, pageRef } from '../visitor/districts';
import { isZh, t } from '../i18n';
import { audio } from '../audio';

export interface MountOptions {
  base: string;
  home?: string | null;
  /** Records on file per district (only the ones already filed by the island's date). */
  pins?: () => Record<string, number>;
  /** Called when a district is picked on the map, or the pick is cleared. */
  onPick?: (id: string | null) => void;
  /** Idle text for the corner when the pointer is off the map. */
  idle?: () => string;
  /** No card on the sheet when a district is picked (the page says it elsewhere). */
  card?: boolean;
  /** Only these districts can be picked; a tap on another calls onRefuse. */
  selectable?: (id: string) => boolean;
  onRefuse?: (id: string) => void;
  /** Records pinned to a block or neighbourhood (only the ones already filed by the island's date). */
  records?: () => RecordSpot[];
  /** Blocks can be tapped for their address (on by default where there is a card). */
  blocks?: boolean;
}

/** A record at its address, as the page lists it. */
export interface RecordSpot { file: string; title: [string, string]; href: string; x: number; y: number; addr: [string, string]; postcode?: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** "Gerimis 550007", the way a letter is addressed. */
export const postText = (pc: string, zh = isZh()) => (zh ? `霏微 ${pc}` : `Gerimis ${pc}`);

/** "112 C3" as the directory prints it. */
const pageText = (ref: string) => {
  const [no, sq] = ref.split(' ');
  return isZh() ? `第 ${no} 页 ${sq}` : `Page ${no} · ${sq}`;
};

const KIND: Record<string, [string, string]> = { residential: ['', ''], open: ['No homes', '无住户'], unsurveyed: ['Not surveyed', '未测绘'] };

export function mountStreetMap(root: HTMLElement, opt: MountOptions) {
  const frame = root.querySelector<HTMLElement>('.smap__frame')!;
  const canvas = root.querySelector<HTMLCanvasElement>('.smap__canvas')!;
  const card = root.querySelector<HTMLElement>('.smap__card')!;
  const page = root.querySelector<HTMLElement>('[data-smap-page]')!;
  const where = root.querySelector<HTMLElement>('[data-smap-where]')!;
  const focus = root.dataset.focus || undefined;
  let current: string | null = focus ?? null;

  let last: [string | null, string | null] = [null, null];
  const corner = (id: string | null, ref: string | null) => {
    last = [id, ref];
    page.textContent = ref ? pageText(ref) : t('At sea');
    where.textContent = id ? ` · ${isZh() ? district(id)?.zh : district(id)?.en}` : opt.idle ? ` · ${opt.idle()}` : '';
  };

  const showCard = (id: string | null) => {
    current = id;
    const d = id ? district(id) : undefined;
    if (!d || id === focus || opt.card === false) {
      card.hidden = true;
      return;
    }
    const zh = isZh();
    const ref = pageRef(d);
    const kind = KIND[d.kind];
    const n = opt.pins?.()[d.id] ?? 0;
    const blocks = d.blocks.slice(0, 4).map((b) => (zh ? b.zh : b.en)).join(zh ? '、' : ', ');
    card.innerHTML = `
      <p class="micro">${zh ? `第 ${String(d.postal).padStart(2, '0')} 邮区` : `Postal district ${String(d.postal).padStart(2, '0')}`}${ref ? ` · ${pageText(ref.text)}` : ''}</p>
      <h3>${zh ? d.zh : d.en}</h3>
      ${kind[0] ? `<p class="smap__card-kind micro">${zh ? kind[1] : kind[0]}</p>` : ''}
      ${blocks ? `<p class="smap__card-blocks">${blocks}</p>` : ''}
      <p class="micro">${n ? (zh ? `在档 ${n} 份` : `${n} on file`) : zh ? '还没有档案' : 'Nothing on file yet'}</p>
      <a class="smap__card-go micro" href="${opt.base}district/${d.id}/">${zh ? '区页' : 'District file'} →</a>
      <button type="button" class="smap__card-x" aria-label="${t('Close')}">×</button>`;
    card.hidden = false;
    card.querySelector('.smap__card-x')!.addEventListener('click', () => map.pick(null, false));
  };

  // a block close up: its address, as a slip
  let block: Block | null = null;
  const showBlock = (b: Block | null) => {
    block = b;
    if (!b) return showCard(current);
    const zh = isZh();
    const d = b.district ? district(b.district) : undefined;
    const ref = pageRef(b);
    const dn = d ? (zh ? d.zh : d.en) : '';
    const recs = (opt.records?.() ?? []).filter((r) => Math.hypot(r.x - b.x, r.y - b.y) < 0.6);
    card.innerHTML = `
      <p class="micro">${ref ? pageText(ref.text) : ''}</p>
      <h3>${zh ? `${esc(b.no)} 座` : `Blk ${esc(b.no)}`}</h3>
      <p class="smap__card-blocks">${b.street ? esc(b.street) : ''}${b.street && dn ? (zh ? '，' : ', ') : ''}${dn}</p>
      <p class="smap__card-post">${postText(b.postcode, zh)}</p>
      <p class="micro">${b.flats
        ? zh ? `${b.year} 年建成 · ${b.floors} 层` : `Built ${b.year} · ${b.floors} storeys`
        : zh ? `${b.year} 年建成 · 不住人：商店、巴刹或停车场` : `Built ${b.year} · no flats: shops, market or car park`}</p>
      ${recs.map((r) => `<a class="smap__card-rec micro" href="${r.href}"><b>${esc(r.file)}</b> ${esc(zh ? r.title[1] : r.title[0])}</a>`).join('')}
      ${d && d.kind !== 'unsurveyed' ? `<a class="smap__card-go micro" href="${opt.base}district/${d.id}/">${zh ? '区页' : 'District file'} →</a>` : ''}
      <button type="button" class="smap__card-x" aria-label="${t('Close')}">×</button>`;
    card.hidden = false;
    card.querySelector('.smap__card-x')!.addEventListener('click', () => map.unchoose());
  };

  // a record's tag: where it is, and the way to it
  const showRecord = (r: RecordSpot) => {
    const zh = isZh();
    const ref = pageRef(r);
    card.innerHTML = `
      <p class="micro">${ref ? pageText(ref.text) : ''}</p>
      <h3>${esc(r.file)}</h3>
      <p class="smap__card-blocks">${esc(zh ? r.title[1] : r.title[0])}</p>
      <p class="micro">${esc(zh ? r.addr[1] : r.addr[0])}${r.postcode ? ` · ${postText(r.postcode, zh)}` : ''}</p>
      <a class="smap__card-go micro" href="${r.href}">${zh ? '调阅' : 'Read the file'} →</a>
      <button type="button" class="smap__card-x" aria-label="${t('Close')}">×</button>`;
    card.hidden = false;
    card.querySelector('.smap__card-x')!.addEventListener('click', () => { card.hidden = true; });
  };

  const map = streetMap({
    frame,
    canvas,
    base: opt.base,
    focus,
    home: opt.home,
    pins: opt.pins,
    zh: isZh,
    onPick: (id) => {
      if (id) audio.click();
      showCard(id);
      opt.onPick?.(id);
    },
    onPoint: corner,
    selectable: opt.selectable,
    onRefuse: opt.onRefuse,
    spots: opt.records ? () => opt.records!().map((r) => ({ key: r.file, label: r.file, x: r.x, y: r.y })) : undefined,
    onSpot: (key) => {
      const r = opt.records?.().find((r) => r.file === key);
      if (r) { audio.click(); showRecord(r); }
    },
    onBlock: opt.blocks ?? opt.card !== false ? (b) => { if (b) audio.click(); showBlock(b); } : undefined,
  });

  root.querySelectorAll<HTMLButtonElement>('[data-z]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.click();
      const z = b.dataset.z;
      if (z === 'in') map.step(1);
      else if (z === 'out') map.step(-1);
      else map.reset();
    }),
  );
  corner(focus ?? null, focus ? pageRef(district(focus)!)?.text ?? null : null);

  return {
    map,
    pick: (id: string | null, fly = true) => map.pick(id, fly),
    frame: (ids: string[]) => map.frame(ids),
    /** Go to a place at a printed scale (1 : n), ringed in red, or with its block inked. */
    goto: map.goto,
    blocks: map.blocks,
    /** After the language changes. */
    relang: () => {
      if (block) showBlock(block);
      else showCard(current === focus ? null : current);
      corner(...last);
      map.redraw();
    },
  };
}
