/**
 * The Gerimis Daily, laid out on the reading table.
 *
 * A month of papers hangs on one stick of the rack. Taking the stick down
 * fetches that month (library/daily/<yyyy-mm>.json) and spreads the chosen
 * day's paper on the table: a broadsheet folded once across the middle, four
 * pages, set the way a real paper is set (masthead, columns, a halftone press
 * photograph, weather, bus diversions, letters, small ads). Pages turn; other
 * days of the month come off the same stick; another month means another
 * stick, which the room fetches for you.
 *
 * Issues dated after today on the island have not gone to press.
 */
import type { Issue, Story } from '../../lib/daily';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { islandIso } from '../island';
import { reducedMotion } from '../prefs';
import { pressPhoto } from '../scene/halftone';

type L = { en: string; zh: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const PAGES: { en: string; zh: string }[] = [
  { en: 'Front page', zh: '头版' },
  { en: 'Island', zh: '本岛新闻' },
  { en: 'Notices & letters', zh: '公告与来信' },
  { en: 'Classified', zh: '分类广告' },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const T = (x: L) => (isZh() ? x.zh : x.en);
const two = (n: number) => String(n).padStart(2, '0');

export const longDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return isZh() ? `${y} 年 ${m} 月 ${d} 日 星期${WEEK_ZH[w]}` : `${WEEK_EN[w]}, ${d} ${MONTHS[m - 1]} ${y}`;
};
const monthName = (k: string) => {
  if (k === 'early') return isZh() ? '1999 年以前' : 'Before 1999';
  const [y, m] = k.split('-').map(Number);
  return isZh() ? `${y} 年 ${m} 月` : `${MONTHS[m - 1]} ${y}`;
};
/** The stick a day hangs on. */
export const monthOf = (iso: string) => (iso < '1999' ? 'early' : iso.slice(0, 7));

export interface PaperHooks {
  /** Put the paper back on the rack. */
  close(): void;
  /** A day on another stick was asked for. */
  other(date: string): void;
  /** The day on the table changed (to keep the paper in the room in step). */
  day(date: string): void;
}

export class Paper {
  private el: HTMLElement;
  private sheet: HTMLElement;
  private cache = new Map<string, Promise<Issue[]>>();
  private issues: Issue[] = [];
  private month = '';
  date = '';
  page = 0;
  on = false;

  constructor(
    private root: HTMLElement,
    private base: string,
    private hooks: PaperHooks,
  ) {
    this.el = root.querySelector<HTMLElement>('#np')!;
    this.sheet = this.el.querySelector<HTMLElement>('#np-sheet')!;
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-np]');
      if (!b) return;
      const a = b.dataset.np!;
      if (a === 'close') this.hooks.close();
      else if (a === 'prev') this.turn(this.page - 1);
      else if (a === 'next') this.turn(this.page + 1);
      else if (a === 'page') this.turn(Number(b.dataset.n));
      else if (a === 'days') this.toggleDays();
      else if (a === 'day') this.go(b.dataset.date!);
      else if (a === 'yesterday' || a === 'tomorrow') this.step(a === 'tomorrow' ? 1 : -1);
      else if (a === 'month') this.monthStep(Number(b.dataset.d));
    });
    // swipe to turn on a phone
    let sx = 0, sy = 0;
    this.sheet.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    this.sheet.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) this.turn(this.page + (dx < 0 ? 1 : -1));
    });
  }

  private load(month: string) {
    if (!this.cache.has(month)) {
      this.cache.set(
        month,
        fetch(`${this.base}library/daily/${month}.json`)
          .then((r) => (r.ok ? r.json() : { issues: [] }))
          .then((d: { issues: Issue[] }) => d.issues)
          .catch(() => {
            this.cache.delete(month);
            return [];
          }),
      );
    }
    return this.cache.get(month)!;
  }

  /** Fetch a month ahead of time, while the stick is still coming down. */
  prefetch(date: string) {
    void this.load(monthOf(date));
  }

  /** Spread the paper for `date` on the table. */
  async show(date: string) {
    this.month = monthOf(date);
    this.issues = await this.load(this.month);
    this.date = date;
    this.page = 0;
    this.on = true;
    this.el.hidden = false;
    this.root.dataset.paper = 'on';
    this.closeDays();
    this.paint();
    this.el.querySelector<HTMLElement>('[data-np="close"]')?.focus({ preventScroll: true });
    if (!reducedMotion()) {
      // unfolds at the crease: the top half comes down onto the table
      this.sheet.animate(
        [
          { transform: 'perspective(1600px) rotateX(38deg) scaleY(.52) translateY(-20%)', opacity: 0, transformOrigin: '50% 100%' },
          { transform: 'perspective(1600px) rotateX(10deg) scaleY(.9)', opacity: 1, offset: 0.6, transformOrigin: '50% 100%' },
          { transform: 'none', opacity: 1, transformOrigin: '50% 100%' },
        ],
        { duration: 620, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    }
  }

  hide() {
    if (!this.on) return;
    this.on = false;
    this.closeDays();
    delete this.root.dataset.paper;
    const done = () => (this.el.hidden = true);
    if (reducedMotion()) return done();
    this.sheet.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'perspective(1600px) rotateX(30deg) scaleY(.55)', transformOrigin: '50% 100%' }], { duration: 320, easing: 'ease-in' }).finished.then(done, done);
  }

  relabel() {
    if (this.on) this.paint();
  }

  /** Keys while the paper is open. Returns true when used. */
  key(e: KeyboardEvent) {
    if (!this.on) return false;
    if (e.key === 'Escape') {
      if (!this.el.querySelector<HTMLElement>('#np-days')!.hidden) this.closeDays();
      else this.hooks.close();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') this.turn(this.page + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.turn(this.page - 1);
    else if (e.key === 'Home') this.turn(0);
    else if (e.key === ']') this.step(1);
    else if (e.key === '[') this.step(-1);
    else return false;
    e.preventDefault();
    return true;
  }

  private turn(n: number) {
    if (n < 0 || n >= PAGES.length || n === this.page || !this.current()) return;
    const dir = n > this.page ? 1 : -1;
    this.page = n;
    audio.paper();
    this.paint();
    this.desk().scrollTop = 0;
    if (!reducedMotion()) {
      this.sheet.animate(
        [
          { transform: `perspective(1800px) rotateY(${dir * -14}deg) translateX(${dir * 28}px)`, opacity: 0.3, transformOrigin: dir > 0 ? '0 50%' : '100% 50%' },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
    }
  }

  /** Another day: on this stick, or on the next one along. */
  go(date: string) {
    this.closeDays();
    if (date > islandIso()) return;
    if (monthOf(date) !== this.month) return this.hooks.other(date);
    this.date = date;
    this.page = 0;
    audio.paper();
    this.paint();
    this.desk().scrollTop = 0;
    this.hooks.day(date);
  }

  private step(d: number) {
    const t = new Date(`${this.date}T00:00:00Z`).getTime() + d * 864e5;
    const iso = new Date(t).toISOString().slice(0, 10);
    if (iso < '1999-01-01' || iso > islandIso()) return;
    this.go(iso);
  }

  private monthStep(d: number) {
    if (this.month === 'early') return;
    const [y, m] = this.month.split('-').map(Number);
    const k = m + d;
    if (k < 1 || k > 12) return;
    const first = `${y}-${two(k)}-01`;
    if (first > islandIso()) return;
    const last = new Date(Date.UTC(y, k, 0)).toISOString().slice(0, 10);
    this.hooks.other(last < islandIso() ? last : islandIso());
  }

  private desk() {
    return this.el.querySelector<HTMLElement>('#np-desk')!;
  }

  private current() {
    return this.issues.find((x) => x.date === this.date);
  }

  /* ---------------- the back issues of this stick ---------------- */
  private toggleDays() {
    const g = this.el.querySelector<HTMLElement>('#np-days')!;
    if (!g.hidden) return this.closeDays();
    const today = islandIso();
    const zh = isZh();
    const head = `<div class="np-days__head">
      <button type="button" data-np="month" data-d="-1" aria-label="${zh ? '上个月' : 'Previous month'}"${this.month <= '1999-01' ? ' disabled' : ''}>←</button>
      <b>${esc(monthName(this.month))}</b>
      <button type="button" data-np="month" data-d="1" aria-label="${zh ? '下个月' : 'Next month'}"${this.month === 'early' || this.month >= today.slice(0, 7) ? ' disabled' : ''}>→</button>
    </div>`;
    let cells = '';
    if (this.month !== 'early') {
      const [y, m] = this.month.split('-').map(Number);
      const pad = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
      const dow = zh ? '一二三四五六日'.split('') : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
      cells += dow.map((d) => `<span class="np-days__dow">${d}</span>`).join('') + '<span></span>'.repeat(pad);
    }
    for (const x of this.issues) {
      const off = x.date > today;
      const d = this.month === 'early' ? x.date : String(Number(x.date.slice(8)));
      cells += `<button type="button" data-np="day" data-date="${x.date}"${off ? ' disabled' : ''} class="${[x.date === this.date ? 'is-on' : '', x.quiet ? '' : 'is-news'].join(' ')}" title="${esc(off ? '' : T(x.lead.head))}">${d}</button>`;
    }
    g.innerHTML = `${head}<div class="np-days__grid${this.month === 'early' ? ' is-list' : ''}">${cells}</div><p class="np-days__key">${zh ? '加粗的日子有档案里的新闻。' : 'Bold days carry news from the files.'}</p>`;
    g.hidden = false;
    this.el.querySelector('[data-np="days"]')?.setAttribute('aria-expanded', 'true');
  }

  private closeDays() {
    const g = this.el.querySelector<HTMLElement>('#np-days');
    if (g) g.hidden = true;
    this.el.querySelector('[data-np="days"]')?.setAttribute('aria-expanded', 'false');
  }

  /* ---------------- printing ---------------- */
  private paint() {
    const zh = isZh();
    const x = this.current();
    const bar = this.el.querySelector<HTMLElement>('#np-bar')!;
    const today = islandIso();
    const prevOk = this.date > '1999-01-01' && this.date.startsWith('1999');
    const nextOk = this.date < today && this.date.startsWith('1999');
    bar.innerHTML = `
      <p class="np-bar__vol">${zh ? '霏微日报' : 'The Gerimis Daily'} · ${esc(monthName(this.month))}</p>
      <nav class="np-bar__pages" aria-label="${zh ? '版面' : 'Pages'}">${PAGES.map((p, i) => `<button type="button" data-np="page" data-n="${i}" aria-pressed="${i === this.page}"${x && x.date <= today ? '' : ' disabled'}><i>${i + 1}</i><span>${esc(T(p))}</span></button>`).join('')}</nav>
      <div class="np-bar__tools">
        <button type="button" data-np="yesterday"${prevOk ? '' : ' disabled'}>← ${zh ? '前一天' : 'Day before'}</button>
        <button type="button" data-np="days" aria-expanded="false">${zh ? '本月往期' : 'Other days'}</button>
        <button type="button" data-np="tomorrow"${nextOk ? '' : ' disabled'}>${zh ? '后一天' : 'Day after'} →</button>
        <button type="button" class="np-bar__close" data-np="close">${zh ? '折起来' : 'Fold it up'} <span class="kbd">Esc</span></button>
      </div>`;
    const foot = this.el.querySelector<HTMLElement>('#np-turn')!;
    foot.innerHTML = `
      <button type="button" data-np="prev"${this.page > 0 ? '' : ' disabled'} aria-label="${zh ? '上一版' : 'Previous page'}">←</button>
      <span>${zh ? `第 ${this.page + 1} 版 / 共 ${PAGES.length} 版` : `Page ${this.page + 1} of ${PAGES.length}`}</span>
      <button type="button" data-np="next"${this.page < PAGES.length - 1 ? '' : ' disabled'} aria-label="${zh ? '下一版' : 'Next page'}">→</button>`;

    if (!x || x.date > today) {
      this.sheet.className = 'np__sheet is-blank';
      this.sheet.innerHTML = `<p class="np-blank">${esc(longDate(this.date))}</p><p class="np-blank">${zh ? '这一期还没付印。' : 'This issue has not gone to press yet.'}</p>`;
      return;
    }
    this.sheet.className = `np__sheet is-p${this.page + 1}${x.special ? ' is-special' : ''}`;
    this.sheet.innerHTML = [front, island, notices, classified][this.page].call(null, x, this.base);
    // press photographs are drawn once they are on the page
    this.sheet.querySelectorAll<HTMLCanvasElement>('canvas[data-photo]').forEach((c) => photo(c));
  }
}

/* ---------------- the four pages ---------------- */
const brief = (b: Story) => `<article class="np-brief"><h4 class="np-h3">${W(b.head)}</h4><p>${W(b.body)}</p></article>`;
const fileLink = (s: Story, base: string) => (s.slug ? `<a class="np-file" href="${base}records/${s.slug}/">${esc(s.file ?? '')} →</a>` : '');
const W = (x: L) => esc(T(x));
const copy = (html: string) => (html ? `<p>${html}</p>` : '');

function runningHead(x: Issue, n: number) {
  return `<header class="np-run"><span>${isZh() ? '霏微日报' : 'The Gerimis Daily'}</span><span>${esc(longDate(x.date))}</span><span>${isZh() ? `第 ${n} 版 · ${PAGES[n - 1].zh}` : `Page ${n} · ${PAGES[n - 1].en}`}</span></header>`;
}

function front(x: Issue, base: string) {
  const zh = isZh();
  const lead = x.lead;
  const p = lead.photo;
  return `
    <header class="np-mast">
      <div class="np-mast__ear">
        <b>${zh ? '天气' : 'Weather'}</b>
        <span>${W(x.weather)}</span>
      </div>
      <h1 class="np-mast__name">${zh ? '霏微日报' : 'The Gerimis Daily'}</h1>
      <div class="np-mast__ear np-mast__ear--r">
        <b>${zh ? '每份二角' : '20 cents'}</b>
        <span>${zh ? '晚报版 · 共四版' : 'Late edition · 4 pages'}</span>
      </div>
    </header>
    <p class="np-dateline"><span>${zh ? '创刊于 1946 年' : 'Est. 1946'}</span><span>${esc(longDate(x.date))}</span><span>${zh ? `第 ${x.no} 期` : `No. ${String(x.no).padStart(3, '0')}`}</span></p>
    <div class="np-front">
      <article class="np-lead">
        ${lead.file ? `<p class="np-kicker">${zh ? '本报讯' : 'Staff reporter'} · ${esc(lead.file)}</p>` : `<p class="np-kicker">${zh ? '本报讯' : 'Staff reporter'}</p>`}
        <h2 class="np-h1">${W(lead.head)}</h2>
        ${lead.deck ? `<p class="np-deck">${W(lead.deck)}</p>` : ''}
        ${p ? `<figure class="np-photo"><canvas data-photo="${esc(p.seed)}"${p.src ? ` data-src="${esc(p.src)}"` : ''} aria-hidden="true"></canvas><figcaption>${W(p.caption)}</figcaption></figure>` : ''}
        <div class="np-cols np-cols--lead">${copy(T(lead.body))}</div>
        ${fileLink(lead, base)}
        <div class="np-front__more">${x.briefs.slice(0, 2).map(brief).join('')}</div>
      </article>
      <aside class="np-side">
        ${x.second ? `<article class="np-story"><h3 class="np-h2">${W(x.second.head)}</h3>${copy(T(x.second.body))}${fileLink(x.second, base)}</article>` : ''}
        <section class="np-box">
          <h4 class="np-boxh">${zh ? '今日要目' : 'Inside today'}</h4>
          <ol class="np-index">
            <li><span>${zh ? '本岛新闻' : 'Island news'}${x.buses.length ? (zh ? '、巴士改道' : ', bus diversions') : ''}</span><i>2</i></li>
            <li><span>${zh ? '更正、记录署公告、读者来信' : 'Corrections, notices, letters'}</span><i>3</i></li>
            <li><span>${zh ? '分类广告、潮汐与钟点' : 'Classified, tides and clocks'}</span><i>4</i></li>
          </ol>
        </section>
        <section class="np-box np-box--office">
          <h4 class="np-boxh">${zh ? '记录署' : 'Records Office'}</h4>
          <p>${W(x.office)}</p>
        </section>
      </aside>
    </div>`;
}

function island(x: Issue, base: string) {
  const zh = isZh();
  const stories = x.articles.map((a) => `
    <article class="np-story np-story--wide">
      ${a.page ? `<p class="np-kicker">${esc(a.page)}</p>` : ''}
      <h3 class="np-h2">${W(a.head)}</h3>
      <div class="np-cols">${copy(T(a.body))}</div>
      ${fileLink(a, base)}
    </article>`).join('');
  const briefs = x.briefs.slice(3).map(brief).join('');
  return `
    ${runningHead(x, 2)}
    <div class="np-island">
      <div class="np-island__main">
        ${x.briefs[2] ? `<figure class="np-photo np-photo--wide"><canvas data-photo="${esc(x.date)}-2" aria-hidden="true"></canvas><figcaption><b>${W(x.briefs[2].head)}</b>${W(x.briefs[2].body)}</figcaption></figure>` : ''}
        ${stories}
        <section class="np-briefs">
          <h3 class="np-sect">${zh ? '各区简讯' : 'Around the districts'}</h3>
          <div class="np-briefs__grid">${briefs}</div>
        </section>
      </div>
      <aside class="np-side">
        <section class="np-box np-box--bus">
          <h4 class="np-boxh">${zh ? '巴士改道' : 'Bus diversions'}</h4>
          ${x.buses.map((b) => `<p>${W(b)}</p>`).join('')}
        </section>
        <section class="np-box">
          <h4 class="np-boxh">${zh ? '天气' : 'Weather'}</h4>
          <p>${W(x.weather)}</p>
          <p class="np-small">${zh ? '林地比中枢早一小时下雨，后港晚一小时。' : 'Silva gets the rain an hour before the Axis, Portus Posterior an hour after.'}</p>
        </section>
      </aside>
    </div>`;
}

function notices(x: Issue, base: string) {
  const zh = isZh();
  const corr = x.corrections.length
    ? x.corrections.map((c) => `<p><b>${esc(c.file ?? '')}</b> ${W(c.body)} ${fileLink(c, base)}</p>`).join('')
    : `<p class="np-small">${zh ? '今日无更正。署里认为，这本身就是一种更正。' : 'No corrections today. The Office regards this as a correction in itself.'}</p>`;
  const files = x.notices.length
    ? `<section class="np-box"><h4 class="np-boxh">${zh ? '档案摘录' : 'From the files'}</h4>${x.notices.map((n) => `<p><b>${W(n.head)}</b> ${W(n.body)} ${fileLink(n, base)}</p>`).join('')}</section>`
    : '';
  return `
    ${runningHead(x, 3)}
    <div class="np-notices">
      <div>
        <section class="np-box np-box--rule">
          <h4 class="np-boxh">${zh ? '更正' : 'Corrections'}</h4>
          ${corr}
        </section>
        ${files}
        <section class="np-box np-box--office">
          <h4 class="np-boxh">${zh ? '记录署公告' : 'Records Office notices'}</h4>
          <p>${W(x.office)}</p>
          <p class="np-small">${zh ? '各柜台均可领取 RO-9 表格。请用黑色墨水，年份写四位数。' : 'Form RO-9 is available at every counter. Black ink, four-digit years.'}</p>
        </section>
      </div>
      <section class="np-letters">
        <h3 class="np-sect">${zh ? '读者来信' : 'Letters to the editor'}</h3>
        ${x.letters.map((l) => `<blockquote class="np-letter"><p>${W(l.body)}</p><cite>${zh ? '——' : '— '}${W(l.by)}</cite></blockquote>`).join('')}
        <section class="np-box np-box--events">
          <h4 class="np-boxh">${zh ? '本周活动' : 'What’s on'}</h4>
          ${x.events.map((e) => `<p>${W(e)}</p>`).join('')}
        </section>
        <p class="np-small">${zh ? '来信请寄：中枢巴刹巷 3 号 霏微日报编辑部。来信可能经删节。' : 'Write to the Editor, The Gerimis Daily, 3 Market Lane, Axis. Letters may be shortened.'}</p>
      </section>
    </div>`;
}

function classified(x: Issue) {
  const zh = isZh();
  const ads = x.classifieds.map((c) => {
    const t = T(c);
    // the opening word is the ad's heading, set bold
    const m = t.match(/^([A-Z][A-Z '’-]+\.|[^。.]{1,5}。)\s*(.*)$/);
    return `<p class="np-ad">${m ? `<b>${esc(m[1])}</b> ${esc(m[2])}` : esc(t)}</p>`;
  }).join('');
  return `
    ${runningHead(x, 4)}
    <div class="np-class">
      <section class="np-ads">
        <h3 class="np-sect">${zh ? '分类小广告' : 'Classified'}</h3>
        <div class="np-ads__grid">${ads}</div>
        <p class="np-small">${zh ? '刊登小广告：每行四角，三行起登。巴刹巷柜台办理，下午五点截稿。' : 'Small ads: 40 cents a line, three lines minimum. At the Market Lane counter, by 5pm.'}</p>
      </section>
      <aside class="np-side">
        <section class="np-box">
          <h4 class="np-boxh">${zh ? '潮汐与钟点' : 'Tides & clocks'}</h4>
          <p>${W(x.tide)}</p>
          <p>${zh ? '中枢 12:00 · 林地 13:00 · 后港 11:00。时间科已知悉。' : 'Axis 12:00 · Silva 13:00 · Portus Posterior 11:00. The Time office is aware.'}</p>
        </section>
        <section class="np-box">
          <h4 class="np-boxh">${zh ? '今晚电视' : 'Tonight on television'}</h4>
          ${x.tv.map((t) => `<p class="np-tv">${W(t)}</p>`).join('')}
        </section>
        <p class="np-imprint">${zh ? '霏微日报社出版发行。中枢巴刹巷 3 号。本报所载以记录署定稿为准。' : 'Printed and published by the Gerimis Daily Press, 3 Market Lane, Axis. This paper prints the final version.'}</p>
      </aside>
    </div>`;
}

/** Draw a press photograph into its canvas: the file's picture if it has one, else a street. */
function photo(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(240, c.clientWidth || 480) * dpr, h = w * 0.56;
  const draw = (img: HTMLImageElement | null) => {
    const art = pressPhoto(img, c.dataset.photo!, w, h);
    c.width = art.width;
    c.height = art.height;
    c.getContext('2d')!.drawImage(art, 0, 0);
  };
  if (!c.dataset.src) return draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.onerror = () => draw(null);
  img.src = c.dataset.src;
}
