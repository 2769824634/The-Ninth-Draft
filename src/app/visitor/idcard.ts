/**
 * The resident's identity card and the reader's pass, as markup. The card
 * prints its labels in both languages, the way the island's cards do, and
 * its values the way the register keeps them, so it reads the same whichever
 * language the page is in. Styles: src/styles/idcard.css.
 */
import { halftone } from '../scene/halftone';
import { islandNow } from '../island';
import { birthplace, cardNo, codeRow, doorText } from './home';
import { hash, passNo, type Pass, type Visitor } from './store';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** "08.10.99", by the island's calendar. */
export const issued = (ms: number) => {
  const d = islandNow(ms);
  return `${String(d.day).padStart(2, '0')}.${String(d.month + 1).padStart(2, '0')}.99`;
};
const row = (en: string, zh: string, val: string, cls = '') => `<div class="idc__f${cls}"><dt><span>${en}</span><span>${zh}</span></dt><dd>${val}</dd></div>`;

/** The bars on the back, from the card number. */
const bars = (seed: string) => {
  let h = hash(seed);
  const out: string[] = [];
  for (let i = 0; i < 46; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    out.push(`<i style="flex-grow:${1 + (h % 3)}"${h & 8 ? ' class="is-gap"' : ''}></i>`);
  }
  return out.join('');
};

/**
 * Both faces of the card. Fields not yet filled show as dashes, so the card
 * can sit beside the form and fill in as it goes.
 */
export function cardHTML(v: Partial<Visitor> & { code?: string }, o: { reissued?: boolean } = {}) {
  const dash = '<span class="idc__dash">— — —</span>';
  const name = v.code?.trim() ? esc(v.code.trim().toUpperCase()) : dash;
  const no = v.no && v.code ? cardNo({ no: v.no, code: v.code }) : '';
  const code = v.origin ? codeRow(v) : '';
  const home = v.home;
  return `
  <div class="idc__face idc__front">
    <p class="idc__band"><b>GERIMIS</b><span>霏微</span><em>IDENTITY CARD · 居民身份证</em></p>
    <div class="idc__body">
      <div class="idc__photo"><canvas width="150" height="188" aria-hidden="true"></canvas></div>
      <dl class="idc__fields">
        ${row('Name', '姓名', name, ' idc__name')}
        ${row('Date of birth', '出生日期', 'NOT DECLARED · 未申报')}
        <div class="idc__code" aria-label="Code">${code ? esc(code) : '<span class="idc__dash">—</span>'}</div>
        ${row('Place of birth', '出生地', v.origin ? esc(birthplace(v, false)) : dash)}
      </dl>
    </div>
    <p class="idc__no">${no || '<span class="idc__dash">V — — — — — — —</span>'}</p>
  </div>
  <div class="idc__face idc__back">
    <dl class="idc__fields">
      ${row('Address', '住址', home ? `${esc(`BLK ${home.blk}${home.street ? ` ${home.street}` : ''}`.toUpperCase())}<br>${doorText(home)} · GERIMIS ${home.postcode}` : dash, ' idc__addr')}
      ${row('Date of issue', '签发日期', v.at ? issued(v.at) : dash)}
    </dl>
    ${o.reissued ? '<p class="idc__note">REISSUED AT OLD ADDRESS · 按旧址补发</p>' : ''}
    <div class="idc__thumb" aria-hidden="true"></div>
    <div class="idc__bars" aria-hidden="true">${bars(no || 'blank')}</div>
    <p class="idc__seal" aria-hidden="true">RECORDS<br>OFFICE</p>
    <p class="idc__fine">If found, post it. No stamp needed. · 拾获请投邮筒，免贴邮票。</p>
  </div>`;
}

/** Ink the halftone portrait into a card's photo box. */
export function cardPhoto(root: HTMLElement, seed: string) {
  const c = root.querySelector<HTMLCanvasElement>('.idc__photo canvas');
  if (!c) return;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(halftone(null, seed, 300, 375), 0, 0, c.width, c.height);
}

/** The reader's pass: a stiff paper slip from the desk at the door. */
export function passHTML(p: Partial<Pass>, zh: boolean) {
  const dash = '<span class="idc__dash">— — —</span>';
  return `
    <p class="rpass__top micro"><span>Gerimis Records Office · Public Archive</span><b>${p.no ? passNo({ no: p.no }) : 'RC-————'}</b></p>
    <h3 class="rpass__title">READER'S PASS<span>阅览证</span></h3>
    <dl class="rpass__rows">
      <div><dt class="micro">${zh ? '姓名' : 'Name'}</dt><dd>${p.code?.trim() ? esc(p.code.trim()) : dash}</dd></div>
      <div><dt class="micro">${zh ? '从哪来' : 'From'}</dt><dd>${p.from?.trim() ? esc(p.from.trim()) : `<span class="idc__dash">${zh ? '未填' : 'not given'}</span>`}</dd></div>
      <div><dt class="micro">${zh ? '签发' : 'Issued'}</dt><dd>${p.at ? issued(p.at) : dash}</dd></div>
      <div><dt class="micro">${zh ? '有效' : 'Valid'}</dt><dd>${zh ? '1999 年内' : 'Until 31.12.99'}</dd></div>
    </dl>
    <p class="rpass__fine">${zh ? '凭证可入档案室、资料室阅览。不得带出馆外。' : 'Admits the bearer to the archive and the reading room. Not to be taken off the premises.'}</p>`;
}
