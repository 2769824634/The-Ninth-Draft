/**
 * The index at the back of the street directory (the map page): every name on
 * the sheet A to Z with its page and square, one letter at a time, and a
 * look-up that also finds HDB blocks by number and street, or by postcode.
 * Data: public/map/index.json and the blocks in detail.json, both made by
 * scripts/map/build.py.
 */
import { district, pageRef } from '../visitor/districts';
import { isZh } from '../i18n';
import { audio } from '../audio';
import { postText } from './mount';
import type { Block } from './street';

/** [english, chinese, kind, x, y, district number in base.json] */
type Entry = [string, string, 'd' | 'm' | 'l' | 'p' | 'w' | 'r', number, number, number];

export interface GoTo { x: number; y: number; scale: number; district?: string; block?: number }

interface Options {
  base: string;
  go: (to: GoTo) => void;
  blocks: () => Promise<{ all: Block[] }>;
}

const KIND: Record<Entry[2], [string, string]> = { d: ['District', '区'], m: ['MRT', '地铁'], l: ['LRT', '轻轨'], p: ['Area', '地名'], w: ['River', '河'], r: ['', ''] };
/** The scale each kind of name is shown at. */
const SCALE: Record<Entry[2], number> = { d: 0, m: 20000, l: 20000, p: 20000, w: 20000, r: 10000 };
// the way people write streets, and the way the directory does
const SHORT: Record<string, string> = { ave: 'avenue', st: 'street', rd: 'road', dr: 'drive', cres: 'crescent', cl: 'close', ctrl: 'central', nth: 'north', sth: 'south', bt: 'bukit', jln: 'jalan', kg: 'kampong', lor: 'lorong', upp: 'upper', ter: 'terrace', pk: 'park', tg: 'tanjong' };
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => SHORT[w] ?? w);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mountGazetteer(root: HTMLElement, o: Options) {
  const q = root.querySelector<HTMLInputElement>('#gaz-q')!;
  const abc = root.querySelector<HTMLElement>('#gaz-abc')!;
  const head = root.querySelector<HTMLElement>('#gaz-head')!;
  const list = root.querySelector<HTMLOListElement>('#gaz-list')!;
  let index: Entry[] = [];
  let keys: string[][] = [];
  let letter = 'A';
  let blocks: Block[] | null = null;
  const dIds: string[] = [];

  const ref = (x: number, y: number) => pageRef({ x, y })?.text ?? '—';
  const dName = (n: number, zh: boolean) => {
    const d = district(dIds[n]);
    return d ? (zh ? d.zh : d.en) : '';
  };

  const row = (e: Entry, i: number) => {
    const zh = isZh();
    const [en, cn, k, x, y, d] = e;
    const name = zh && cn ? `${esc(cn)} <small>${esc(en)}</small>` : esc(en);
    const kind = KIND[k][zh ? 1 : 0];
    const where = k === 'd' ? '' : dName(d, zh);
    return `<li class="gaz__e is-${k}"><button type="button" data-i="${i}"><span class="gaz__n">${name}${kind ? ` <em>${kind}</em>` : ''}${where ? `<span class="gaz__d">${esc(where)}</span>` : ''}</span><span class="gaz__r">${ref(x, y)}</span></button></li>`;
  };
  const blockRow = (b: Block) => {
    const zh = isZh();
    const dn = b.district ? (zh ? district(b.district)?.zh : district(b.district)?.en) ?? '' : '';
    const nm = zh ? `${esc(b.no)} 座${b.street ? ` <small>${esc(b.street)}</small>` : ''}` : `Blk ${esc(b.no)}${b.street ? ` ${esc(b.street)}` : ''}`;
    return `<li class="gaz__e is-b"><button type="button" data-b="${b.i}"><span class="gaz__n">${nm} <em>${postText(b.postcode, zh)}</em>${dn ? `<span class="gaz__d">${esc(dn)}</span>` : ''}</span><span class="gaz__r">${ref(b.x, b.y)}</span></button></li>`;
  };

  const letters = () => {
    const have = new Set(index.map((e) => e[0][0].toUpperCase()));
    abc.innerHTML = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `<button type="button" data-c="${c}"${have.has(c) ? '' : ' disabled'}${c === letter ? ' aria-current="true"' : ''}>${c}</button>`).join('');
  };
  const page = (c: string) => {
    letter = c;
    abc.querySelectorAll('button').forEach((b) => b.toggleAttribute('aria-current', b.dataset.c === c));
    const rows = index.map((e, i) => [e, i] as const).filter(([e]) => e[0][0].toUpperCase() === c);
    head.textContent = isZh() ? `${c} · ${rows.length} 条` : `${c} · ${rows.length} entries`;
    list.innerHTML = rows.map(([e, i]) => row(e, i)).join('');
  };

  // a block: a number, perhaps "Blk", then a street or a district; or a postcode
  const findBlocks = (text: string): Block[] => {
    if (!blocks) return [];
    const t = text.trim();
    if (/^\d{6}$/.test(t)) return blocks.filter((b) => b.postcode === t);
    // "Blk 7 Lorong Lew Lian", "7 Serangoon", "实龙岗 7 座"
    const en = t.match(/^(?:blk|block)?\.?\s*(\d+[a-z]?)\b\s*(.*)$/i), zh = t.match(/^(.*?)\s*(\d+[a-z]?)\s*座\s*(.*)$/i);
    const [no, more] = zh ? [zh[2], `${zh[1]} ${zh[3]}`] : en ? [en[1], en[2]] : [null, ''];
    if (!no) return [];
    const rest = words(more);
    return blocks.filter((b) => {
      if (b.no.toUpperCase() !== no.toUpperCase()) return false;
      if (!rest.length) return true;
      const d = b.district ? district(b.district) : undefined;
      const hay = words(`${b.street} ${d?.en ?? ''} ${d?.zh ?? ''}`);
      return rest.every((w) => hay.some((h) => h.startsWith(w) || (/[\u3400-\u9fff]/.test(w) && h.includes(w))));
    });
  };

  let waiting = false;
  const search = () => {
    const text = q.value.trim();
    abc.hidden = !!text;
    if (!text) return page(letter);
    const ws = words(text);
    const hits = index.map((e, i) => [e, i] as const).filter(([, i]) => ws.every((w) => keys[i].some((h) => h.startsWith(w) || (/[\u3400-\u9fff]/.test(w) && h.includes(w)))));
    const looksLikeBlock = /^\s*(?:blk|block)?\.?\s*\d/i.test(text) || /座/.test(text);
    if (looksLikeBlock && !blocks && !waiting) {
      waiting = true;
      o.blocks().then((r) => { blocks = r.all; waiting = false; search(); });
    }
    const bs = looksLikeBlock ? findBlocks(text).slice(0, 40) : [];
    const zh = isZh();
    head.textContent = bs.length || hits.length
      ? zh ? `找到 ${bs.length + hits.length} 条` : `${bs.length + hits.length} found`
      : looksLikeBlock && !blocks ? (zh ? '在翻组屋那几页……' : 'Turning to the block pages…') : zh ? '索引里没有这个名字。' : 'Not in the index.';
    list.innerHTML = bs.map(blockRow).join('') + hits.slice(0, 80).map(([e, i]) => row(e, i)).join('');
  };

  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    audio.click();
    if (b.dataset.b) {
      const blk = blocks![Number(b.dataset.b)];
      return o.go({ x: blk.x, y: blk.y, scale: 5000, block: blk.i });
    }
    const [, , k, x, y, d] = index[Number(b.dataset.i)];
    o.go(k === 'd' ? { x, y, scale: 0, district: dIds[d] } : { x, y, scale: SCALE[k] });
  });
  abc.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-c]');
    if (!b) return;
    audio.click();
    page(b.dataset.c!);
  });
  q.addEventListener('input', search);

  // the index is fetched when the page has settled
  const open = async () => {
    const ix = (await (await fetch(`${o.base}map/index.json`)).json()) as { districts: string[]; index: Entry[] };
    dIds.push(...ix.districts);
    index = ix.index;
    keys = index.map((e) => words(`${e[0]} ${e[1]}`));
    letters();
    if (q.value) search();
    else page(letter);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(() => open(), { timeout: 2500 });
  else setTimeout(open, 800);

  return {
    relang: () => {
      if (!index.length) return;
      if (q.value) search();
      else page(letter);
    },
  };
}
