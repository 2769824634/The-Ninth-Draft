/**
 * The card index by the door: one drawer of cards, flipped through one at a
 * time. Sorted by file number, by district or by year, with a guide card
 * standing up at each heading. A record's card says where the file hangs,
 * and the visitor can walk over and take it out; nothing is fetched for them.
 */
import type { ArchiveRecord, Category } from '../types';
import { DISTRICT_DATA } from '../../data/gerimis/districts';
import { currentDistrict } from '../../data/gerimis/legacy';
import { isZh } from '../i18n';
import { audio } from '../audio';
import { reducedMotion } from '../prefs';
import { clearanceKey } from '../clearance';
import { esc } from '../ui/text';

type Sort = 'no' | 'district' | 'year';
type Card = { guide: string; sub?: string } | { rec: ArchiveRecord };

const ZH_CAT: Record<string, string> = { personnel: '人员', events: '事件', programs: '计划' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (s?: string) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s ?? '';
  return isZh() ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

export class Cards {
  private el = document.getElementById('stacks-cards')!;
  private sort: Sort = 'no';
  private deck: Card[] = [];
  private at = 0;

  constructor(
    private records: ArchiveRecord[],
    private categories: Category[],
    private fetch: (rec: ArchiveRecord) => void,
    private where: (rec: ArchiveRecord) => { drawer: number; folder: number; onTable: boolean },
  ) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const s = t.closest<HTMLElement>('[data-sort]')?.dataset.sort as Sort | undefined;
      if (s) return this.setSort(s);
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'close') return this.close();
      if (act === 'prev') return this.flip(-1);
      if (act === 'next') return this.flip(1);
      const f = t.closest<HTMLElement>('[data-fetch]')?.dataset.fetch;
      const rec = f ? this.records.find((r) => r.file === f) : null;
      if (rec) {
        this.close();
        this.fetch(rec);
      }
    });
    let sx = 0;
    this.el.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
    this.el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) this.flip(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  get isOpen() {
    return !this.el.hidden;
  }

  show() {
    this.build();
    // start at the first record, not on a guide card
    this.at = Math.max(0, this.deck.findIndex((c) => 'rec' in c));
    this.draw();
    this.el.hidden = false;
    audio.drawer();
    if (!reducedMotion()) this.el.animate([{ opacity: 0, transform: 'translateY(1rem)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  close() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    audio.drawer();
  }

  relang() {
    if (!this.isOpen) return;
    const cur = this.deck[this.at];
    this.build();
    if (cur && 'rec' in cur) this.at = Math.max(0, this.deck.findIndex((c) => 'rec' in c && c.rec === cur.rec));
    this.draw();
  }

  key(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Backspace') this.close();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.flip(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.flip(-1);
    else if (e.key === 'Enter') {
      const c = this.deck[this.at];
      if (c && 'rec' in c) {
        this.close();
        this.fetch(c.rec);
      }
    } else return false;
    return true;
  }

  private setSort(s: Sort) {
    if (s === this.sort) return;
    this.sort = s;
    this.build();
    this.at = Math.max(0, this.deck.findIndex((c) => 'rec' in c));
    this.draw();
    audio.flick();
  }

  private build() {
    const zh = isZh();
    const deck: Card[] = [];
    const group = (key: (r: ArchiveRecord) => string, label: (k: string) => { guide: string; sub?: string }, order: (a: string, b: string) => number) => {
      const by = new Map<string, ArchiveRecord[]>();
      for (const r of this.records) {
        const k = key(r);
        (by.get(k) ?? by.set(k, []).get(k)!).push(r);
      }
      for (const k of [...by.keys()].sort(order)) {
        deck.push(label(k));
        for (const r of by.get(k)!.sort((a, b) => a.file.localeCompare(b.file))) deck.push({ rec: r });
      }
    };
    if (this.sort === 'no') {
      const ids: string[] = this.categories.map((c) => c.id);
      group(
        (r) => r.category,
        (k) => {
          const c = this.categories.find((x) => x.id === k)!;
          return { guide: `${c.code} · ${zh ? ZH_CAT[k] ?? c.label : c.label}`, sub: zh ? `第 ${String(ids.indexOf(k) + 1).padStart(2, '0')} 抽屉` : `Drawer ${String(ids.indexOf(k) + 1).padStart(2, '0')}` };
        },
        (a, b) => ids.indexOf(a) - ids.indexOf(b),
      );
    } else if (this.sort === 'district') {
      const order = DISTRICT_DATA.map((d) => d.id);
      group(
        (r) => (r.district ? currentDistrict(r.district) : '~'),
        (k) => {
          const d = DISTRICT_DATA.find((x) => x.id === k);
          return d ? { guide: zh ? d.zh : d.en, sub: zh ? d.en : d.zh } : { guide: zh ? '未注明区' : 'No district given' };
        },
        (a, b) => (a === '~' ? 1 : b === '~' ? -1 : order.indexOf(a) - order.indexOf(b)),
      );
    } else {
      group(
        (r) => r.date?.match(/\d{4}/)?.[0] ?? '~',
        (k) => (k === '~' ? { guide: zh ? '未注明年份' : 'No year given' } : { guide: k }),
        (a, b) => (a === '~' ? 1 : b === '~' ? -1 : a.localeCompare(b)),
      );
    }
    this.deck = deck;
  }

  private flip(step: number) {
    const n = this.deck.length;
    if (!n) return;
    const next = Math.max(0, Math.min(n - 1, this.at + step));
    if (next === this.at) return;
    this.at = next;
    audio.flick();
    this.draw(step);
  }

  private cardHtml(c: Card) {
    const zh = isZh();
    if (!('rec' in c)) return `<article class="icard icard--guide"><span class="icard__tab">${esc(c.guide)}</span>${c.sub ? `<p class="icard__gsub">${esc(c.sub)}</p>` : ''}</article>`;
    const r = c.rec;
    const w = this.where(r);
    const d = r.district ? DISTRICT_DATA.find((x) => x.id === currentDistrict(r.district!)) : null;
    const rows: [string, string][] = [];
    if (d) rows.push([zh ? '区' : 'District', `${zh ? d.zh : d.en}${r.block ? ` · ${r.block}` : ''}`]);
    if (r.date) rows.push([zh ? '日期' : 'Date', longDate(r.date)]);
    if (r.place) rows.push([zh ? '地点' : 'Place', r.place]);
    rows.push([zh ? '密级' : 'Clearance', r.stamp]);
    const mark = w.onTable ? (zh ? '借出 · 在阅档桌上' : 'Out · on the reading table') : zh ? `档案库 · 第 ${String(w.drawer).padStart(2, '0')} 抽屉 · 第 ${String(w.folder).padStart(2, '0')} 夹` : `Stacks · Drawer ${String(w.drawer).padStart(2, '0')} · Folder ${String(w.folder).padStart(2, '0')}`;
    return `<article class="icard clr-${clearanceKey(r.stamp)}">
      <p class="icard__no">${esc(r.file)}</p>
      <h3 class="icard__title">${esc(r.title)}</h3>
      ${r.subtitle ? `<p class="icard__sub">${esc(r.subtitle)}</p>` : ''}
      <dl class="icard__rows">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <p class="icard__mark">${esc(mark)}</p>
      <button type="button" class="icard__go" data-fetch="${esc(r.file)}">${w.onTable ? (zh ? '去桌上看' : 'Go to the table') : zh ? '去柜子拿' : 'Go and take it out'} <span class="kbd">Enter</span></button>
    </article>`;
  }

  private draw(step = 0) {
    const zh = isZh();
    const n = this.deck.length;
    const recs = this.deck.filter((c) => 'rec' in c).length;
    const behind = this.deck.slice(this.at + 1, this.at + 4);
    this.el.innerHTML = `
      <div class="icards__top">
        <span class="micro">${zh ? `索引卡 · ${recs} 张` : `Card index · ${recs} cards`}</span>
        <div class="icards__sort" role="group" aria-label="${zh ? '排列' : 'Order'}">
          ${(['no', 'district', 'year'] as Sort[]).map((s) => `<button type="button" data-sort="${s}" aria-pressed="${s === this.sort}">${zh ? { no: '按编号', district: '按区', year: '按年份' }[s] : { no: 'By number', district: 'By district', year: 'By year' }[s]}</button>`).join('')}
        </div>
        <button type="button" class="icards__x" data-act="close">${zh ? '关上' : 'Close'} <span class="kbd">Esc</span></button>
      </div>
      <div class="icards__tray">
        ${behind.map((c, i) => `<div class="icards__edge" style="--i:${i + 1}">${'rec' in c ? esc(c.rec.file) : `<b>${esc(c.guide)}</b>`}</div>`).reverse().join('')}
        <div class="icards__now">${this.deck[this.at] ? this.cardHtml(this.deck[this.at]) : ''}</div>
      </div>
      <div class="icards__nav">
        <button type="button" data-act="prev" ${this.at === 0 ? 'disabled' : ''} aria-label="${zh ? '往前翻' : 'Back a card'}">←</button>
        <span class="micro">${String(this.at + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</span>
        <button type="button" data-act="next" ${this.at >= n - 1 ? 'disabled' : ''} aria-label="${zh ? '往后翻' : 'On a card'}">→</button>
      </div>`;
    const now = this.el.querySelector<HTMLElement>('.icards__now');
    if (step && now && !reducedMotion()) {
      // the card comes up out of the drawer, or drops back into it
      now.animate(
        step > 0 ? [{ transform: 'translateY(2.4rem) rotateX(14deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }] : [{ transform: 'translateY(-1.6rem) rotateX(-10deg)', opacity: 0.2 }, { transform: 'none', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    }
  }
}
