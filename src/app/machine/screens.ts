/**
 * The machine room's screens. Each is live DOM on the front of a CRT:
 * amber phosphor, scanlines, a little bloom. Everything they say is in the
 * SYSTEM voice: system actions only, no jokes.
 */
import type { LogLine, MachineData, MachineFile } from '../../lib/machine';
import { audio } from '../audio';
import { isZh } from '../i18n';
import { reducedMotion } from '../prefs';
import { DISTRICTS } from '../visitor/districts';
import { fileNo, loadVisitor } from '../visitor/store';

type L = { en: string; zh: string };
const T = (l: L) => (isZh() ? l.zh : l.en);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, reducedMotion() ? Math.min(ms, 60) : ms));

/** A CRT face: the glass, the phosphor, and a body for the screen's content. */
export function crt(id: string, title: string) {
  const glass = document.createElement('div');
  glass.className = 'crt';
  glass.dataset.screen = id;
  glass.innerHTML = `<div class="crt__in"><p class="crt__bar"><span>${title}</span><span class="crt__clock"></span></p><div class="crt__body"></div></div><i class="crt__scan"></i>`;
  return { glass, body: glass.querySelector<HTMLElement>('.crt__body')! };
}

/* ---------------------------------------------------------------------- */
/* 01 Revision log                                                         */
/* ---------------------------------------------------------------------- */
export class LogScreen {
  readonly screen = crt('log', 'RO/DS · REVISION LOG');
  constructor(private log: LogLine[], private base: string) {
    this.render();
  }
  render() {
    const rows = this.log
      .map((l) => `<li><a href="${this.base}records/${l.slug}/"><span>${l.date}</span><b>${l.file}</b><span>D${String(l.draft).padStart(2, '0')}</span><span class="crt__dim">${esc(l.stamp)}</span><span class="crt__dim">${esc(T(l.label))}</span></a></li>`)
      .join('');
    // the list runs twice so the scroll can loop without a seam
    this.screen.body.innerHTML = `<p class="crt__dim">${isZh() ? `共 ${this.log.length} 条修订 · 按日期` : `${this.log.length} REVISIONS · BY DATE`}</p><div class="crt__roll"><ol class="crt__log">${rows}${rows}</ol></div>`;
    const ol = this.screen.body.querySelector<HTMLElement>('.crt__log')!;
    ol.style.setProperty('--n', String(this.log.length));
  }
}

/* ---------------------------------------------------------------------- */
/* 02 Year field                                                           */
/* ---------------------------------------------------------------------- */
export class YearScreen {
  readonly screen = crt('year', 'RO/DS · YEAR FIELD');
  private busy = false;
  constructor(private base: string, private onGlitch: () => void) {
    this.render();
  }
  render() {
    const zh = isZh();
    this.screen.body.innerHTML = `
      <p class="crt__dim">${zh ? '字段长度：2 位 · 字段：YR' : 'FIELD LENGTH: 2 · FIELD: YR'}</p>
      <p class="crt__year"><span>YEAR:</span> <b id="yr-val">99</b></p>
      <ol class="crt__out" id="yr-out"><li>${zh ? '待命。' : 'STANDING BY.'}</li></ol>
      <p class="crt__acts"><button type="button" class="crt__btn" id="yr-test">[ ${zh ? '跨年测试' : 'TEST ROLLOVER'} ]</button><a class="crt__btn" href="${this.base}records/r-0001/">[ R-0001 ]</a></p>`;
    this.screen.body.querySelector('#yr-test')!.addEventListener('click', () => void this.rollover());
  }
  private say(line: string) {
    const out = this.screen.body.querySelector('#yr-out')!;
    out.insertAdjacentHTML('beforeend', `<li>${line}</li>`);
    while (out.children.length > 5) out.firstElementChild!.remove();
  }
  /** 99 → 00, read as 1900, then rolled back. */
  async rollover() {
    if (this.busy) return;
    this.busy = true;
    const zh = isZh();
    const val = this.screen.body.querySelector<HTMLElement>('#yr-val')!;
    this.say(zh ? '跨年测试开始。' : 'ROLLOVER TEST INITIATED.');
    audio.click();
    await wait(700);
    for (const v of ['99', '99', '00']) {
      val.textContent = v;
      audio.tick();
      await wait(380);
    }
    this.say(zh ? '年份字段：00。' : 'YEAR FIELD: 00.');
    await wait(600);
    this.screen.glass.classList.add('is-glitch');
    this.onGlitch();
    audio.glitch();
    val.textContent = '1900';
    this.say(zh ? '解读为 1900。' : 'INTERPRETED AS 1900.');
    await wait(1600);
    this.screen.glass.classList.remove('is-glitch');
    this.say(zh ? '回滚。' : 'ROLLING BACK.');
    await wait(700);
    val.textContent = '99';
    this.say(zh ? '已回滚。年份字段：99。' : 'ROLLBACK COMPLETE. YEAR FIELD: 99.');
    audio.chirp();
    this.busy = false;
  }
}

/* ---------------------------------------------------------------------- */
/* 03 District clocks                                                      */
/* ---------------------------------------------------------------------- */
export class ClockScreen {
  readonly screen = crt('clocks', 'RO/DS · DISTRICT CLOCKS');
  /** Hours each district's clock is pulled toward the Axis (0 = not synced). */
  private pull = new Map<string, number>();
  private busy = false;
  constructor(private base: string) {
    this.render();
    const tick = () => {
      this.tick();
      window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
  }
  render() {
    const zh = isZh();
    this.screen.body.innerHTML = `
      <div class="crt__dials">${DISTRICTS.map((d) => `<figure class="crt__dial" data-d="${d.id}"><i class="crt__h"></i><i class="crt__m"></i><i class="crt__s"></i><figcaption>${zh ? d.zh : d.en.toUpperCase()}<b></b></figcaption></figure>`).join('')}</div>
      <ol class="crt__out" id="ck-out"><li>${zh ? '林地 +1 小时。后港 −1 小时。' : 'SILVA +1 H. PORTUS POSTERIOR −1 H.'}</li></ol>
      <p class="crt__acts"><button type="button" class="crt__btn" id="ck-sync">[ ${zh ? '同步到中枢' : 'SYNC TO AXIS'} ]</button><a class="crt__btn" href="${this.base}records/r-0003/">[ R-0003 ]</a></p>`;
    this.screen.body.querySelector('#ck-sync')!.addEventListener('click', () => void this.sync());
    this.tick();
  }
  private tick() {
    const now = new Date();
    for (const d of DISTRICTS) {
      const fig = this.screen.body.querySelector<HTMLElement>(`[data-d="${d.id}"]`);
      if (!fig) continue;
      const off = d.tz + (this.pull.get(d.id) ?? 0);
      const h = (now.getHours() + off + 24) % 24, m = now.getMinutes(), s = now.getSeconds();
      fig.querySelector<HTMLElement>('.crt__h')!.style.transform = `rotate(${(h % 12) * 30 + m * 0.5}deg)`;
      fig.querySelector<HTMLElement>('.crt__m')!.style.transform = `rotate(${m * 6}deg)`;
      fig.querySelector<HTMLElement>('.crt__s')!.style.transform = `rotate(${s * 6}deg)`;
      fig.querySelector('b')!.textContent = off ? ` ${off > 0 ? '+' : '−'}${Math.abs(off)}` : '';
      fig.classList.toggle('is-off', off !== 0);
    }
  }
  private say(line: string) {
    const out = this.screen.body.querySelector('#ck-out')!;
    out.insertAdjacentHTML('beforeend', `<li>${line}</li>`);
    while (out.children.length > 4) out.firstElementChild!.remove();
  }
  /** Every clock is pulled to the Axis; two of them drift back. */
  async sync() {
    if (this.busy) return;
    this.busy = true;
    const zh = isZh();
    this.say(zh ? '同步中。' : 'SYNCHRONISING.');
    audio.relay();
    for (const d of DISTRICTS) if (d.tz) this.pull.set(d.id, -d.tz);
    this.screen.glass.classList.add('is-sync');
    this.tick();
    await wait(900);
    audio.chirp();
    this.say(zh ? '全部时钟：中枢时间。' : 'ALL CLOCKS: AXIS TIME.');
    await wait(3200);
    // they go back on their own, without being asked
    for (const d of DISTRICTS) if (d.tz) this.pull.set(d.id, 0);
    this.screen.glass.classList.remove('is-sync');
    this.tick();
    audio.tick();
    this.say(zh ? '林地 +1 小时。后港 −1 小时。原因：不明。' : 'SILVA +1 H. PORTUS POSTERIOR −1 H. CAUSE: UNKNOWN.');
    this.busy = false;
  }
}

/* ---------------------------------------------------------------------- */
/* 04 Backup tapes                                                         */
/* ---------------------------------------------------------------------- */
const inRange = (spec: string | undefined, n: number) => {
  if (!spec) return false;
  const [a, b] = spec.split('-').map(Number);
  return n >= a && n <= (b || a);
};

export class BackupScreen {
  readonly screen = crt('backup', 'RO/DS · BACKUP TAPES');
  private file: MachineFile | null = null;
  private draft = 3;
  private busy = false;
  constructor(private files: MachineFile[], private reels: (on: boolean) => void) {
    this.file = files.find((f) => f.revised) ?? null;
    this.render();
  }
  render() {
    const zh = isZh();
    const revised = this.files.filter((f) => f.revised);
    this.screen.body.innerHTML = `
      <div class="crt__pick">
        <label>${zh ? '档案' : 'FILE'} <select id="bk-file">${revised.map((f) => `<option value="${f.file}"${f === this.file ? ' selected' : ''}>${f.file}</option>`).join('')}</select></label>
        <span>${zh ? '稿' : 'DRAFT'} ${Array.from({ length: 8 }, (_, i) => `<button type="button" class="crt__btn crt__d${i + 1 === this.draft ? ' is-on' : ''}" data-d="${i + 1}">${String(i + 1).padStart(2, '0')}</button>`).join('')}</span>
        <button type="button" class="crt__btn" id="bk-go">[ ${zh ? '从磁带恢复' : 'RESTORE'} ]</button>
      </div>
      <div class="crt__tape" id="bk-out"><p class="crt__dim">${zh ? '选一份档案、一稿，从磁带恢复，与第九稿对照。' : 'SELECT A FILE AND A DRAFT. RESTORE FROM TAPE. COMPARE WITH DRAFT 09.'}</p></div>`;
    const b = this.screen.body;
    b.querySelector<HTMLSelectElement>('#bk-file')!.addEventListener('change', (e) => {
      this.file = this.files.find((f) => f.file === (e.target as HTMLSelectElement).value) ?? null;
    });
    b.querySelectorAll<HTMLButtonElement>('.crt__d').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.draft = Number(btn.dataset.d);
        b.querySelectorAll('.crt__d').forEach((x) => x.classList.toggle('is-on', x === btn));
        audio.tick();
      }),
    );
    b.querySelector('#bk-go')!.addEventListener('click', () => void this.restore());
  }

  /** Read draft `n` of a file off tape and show what changed by draft 09. */
  async restore(file?: string, n?: number) {
    if (this.busy) return false;
    if (file) {
      const f = this.files.find((x) => x.file === file);
      if (!f) return false;
      this.file = f;
    }
    if (n) this.draft = Math.max(1, Math.min(8, n));
    if (!this.file) return false;
    this.busy = true;
    if (file || n) this.render();
    const zh = isZh();
    const out = this.screen.body.querySelector<HTMLElement>('#bk-out')!;
    const reel = `TAPE 0${(this.file.file.charCodeAt(0) % 7) + 1}`;
    out.innerHTML = `<p>${zh ? `读取 ${reel} …` : `READING ${reel} …`}</p><p class="crt__prog"><i></i></p>`;
    this.reels(true);
    const bar = out.querySelector<HTMLElement>('.crt__prog i')!;
    for (let k = 1; k <= 10; k++) {
      bar.style.width = `${k * 10}%`;
      audio.relay();
      await wait(140);
    }
    this.reels(false);
    const n0 = this.draft;
    const doc = document.createElement('div');
    doc.className = 'crt__doc';
    doc.innerHTML = T(this.file.body);
    // marks: what draft n had, and what became of it by draft 09
    doc.querySelectorAll<HTMLElement>('.rv').forEach((s) => {
      const add = Number(s.dataset.add ?? 0), del = Number(s.dataset.del ?? 0);
      if (add > n0) s.classList.add('is-later');
      if (del && del > n0) s.classList.add('is-cut');
      if (del && del <= n0) s.remove();
      if (s.dataset.redact) {
        const then = inRange(s.dataset.redact, n0), now = inRange(s.dataset.redact, 9);
        s.classList.toggle('is-black', then);
        s.classList.toggle('is-blacked', !then && now);
      }
    });
    doc.querySelectorAll<HTMLElement>('.rv-note').forEach((s) => {
      if (!inRange(s.dataset.note, n0)) s.remove();
    });
    const counts = { cut: doc.querySelectorAll('.is-cut').length, later: doc.querySelectorAll('.is-later').length, black: doc.querySelectorAll('.is-blacked').length };
    out.innerHTML = `<p class="crt__dim">${this.file.file} · ${zh ? `第 ${String(n0).padStart(2, '0')} 稿 对照 第 09 稿` : `DRAFT ${String(n0).padStart(2, '0')} AGAINST DRAFT 09`} · <span class="crt__key is-cut">−${counts.cut}</span> <span class="crt__key is-later">+${counts.later}</span> <span class="crt__key is-blacked">■${counts.black}</span></p>`;
    out.append(doc);
    audio.chirp();
    this.busy = false;
    return true;
  }
}

/* ---------------------------------------------------------------------- */
/* 05 Console                                                              */
/* ---------------------------------------------------------------------- */
export interface ConsoleHooks {
  focus(zone: string): void;
  rollover(): void;
  sync(): void;
  restore(file: string, n: number): Promise<boolean>;
  logout(): void;
}

export class ConsoleScreen {
  readonly screen = crt('console', 'RO/DS · OPERATOR CONSOLE');
  private input!: HTMLInputElement;
  private out!: HTMLElement;
  private history: string[] = [];
  private hi = -1;
  constructor(private data: MachineData, private base: string, private hooks: ConsoleHooks) {
    this.render();
  }
  render() {
    const zh = isZh();
    this.screen.body.innerHTML = `<ol class="crt__term" id="cs-out"></ol><p class="crt__line"><span>&gt;</span><input id="cs-in" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="${zh ? '命令' : 'Command'}" /></p>
      <p class="crt__acts crt__keys">${['HELP', 'LS', 'WHO', 'YEAR', 'CLOCK', 'LOG', 'LOGOUT'].map((c) => `<button type="button" class="crt__btn" data-cmd="${c}">${c}</button>`).join('')}</p>`;
    this.input = this.screen.body.querySelector('#cs-in')!;
    this.out = this.screen.body.querySelector('#cs-out')!;
    this.print(zh ? '记录署数据组 · 操作员终端 · 1999' : 'RECORDS OFFICE DATA SECTION · OPERATOR CONSOLE · 1999');
    this.print(zh ? '输入 HELP 查看命令。' : 'TYPE HELP FOR COMMANDS.', 'dim');
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const v = this.input.value;
        this.input.value = '';
        void this.run(v);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!this.history.length) return;
        this.hi = Math.max(0, Math.min(this.history.length, this.hi + (e.key === 'ArrowUp' ? -1 : 1)));
        this.input.value = this.history[this.hi] ?? '';
      } else if (e.key === 'Escape') this.input.blur();
      else if (e.key.length === 1) audio.tick();
    });
    this.screen.body.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach((b) => b.addEventListener('click', () => void this.run(b.dataset.cmd!)));
  }
  focus() {
    if (window.matchMedia('(pointer: fine)').matches) this.input.focus({ preventScroll: true });
  }

  /** A key pressed anywhere while the console is in view belongs to the console. */
  key(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const v = this.input.value;
      this.input.value = '';
      void this.run(v);
    } else if (e.key === 'Backspace') this.input.value = this.input.value.slice(0, -1);
    else if (e.key.length === 1) {
      this.input.value += e.key;
      audio.tick();
    } else return false;
    this.input.focus({ preventScroll: true });
    return true;
  }
  private print(text: string, cls = '') {
    this.out.insertAdjacentHTML('beforeend', `<li class="${cls}">${text}</li>`);
    while (this.out.children.length > 60) this.out.firstElementChild!.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }

  async run(raw: string) {
    const line = raw.trim();
    if (!line) return;
    this.history.push(line);
    this.hi = this.history.length;
    this.print(`&gt; ${esc(line.toUpperCase())}`, 'cmd');
    const [cmd, ...args] = line.toUpperCase().split(/\s+/);
    const zh = isZh();
    const p = (en: string, cn: string, cls = '') => this.print(zh ? cn : en, cls);
    const fileArg = (a?: string) => {
      if (!a) return null;
      const norm = a.replace(/^([PER])-?0*(\d+)$/, (_, c, n) => `${c}-${String(n).padStart(4, '0')}`);
      return this.data.files.find((f) => f.file === norm) ?? null;
    };
    switch (cmd) {
      case 'HELP':
        p('HELP · LS [P|E|R] · OPEN &lt;FILE&gt; · DIFF &lt;FILE&gt; &lt;DRAFT&gt;', 'HELP · LS [P|E|R] · OPEN &lt;档案号&gt; · DIFF &lt;档案号&gt; &lt;稿号&gt;');
        p('LOG · YEAR · ROLLOVER · CLOCK · SYNC · WHO · CLEAR · LOGOUT', 'LOG · YEAR · ROLLOVER · CLOCK · SYNC · WHO · CLEAR · LOGOUT');
        break;
      case 'LS': {
        const c = args[0]?.[0];
        const list = this.data.files.filter((f) => !c || f.file.startsWith(c));
        if (!list.length) p('NO FILES.', '无档案。');
        for (const f of list) this.print(`${f.file}  ${esc(f.stamp.padEnd(13, ' ').replace(/ /g, '&nbsp;'))} ${esc(zh ? f.title.zh : f.title.en.toUpperCase())}`);
        p(`${list.length} FILES.`, `共 ${list.length} 份。`, 'dim');
        break;
      }
      case 'OPEN': {
        const f = fileArg(args[0]);
        if (!f) {
          p('FILE NOT FOUND.', '找不到档案。');
          break;
        }
        p(`OPENING ${f.file}.`, `正在调取 ${f.file}。`);
        window.setTimeout(() => (location.href = `${this.base}records/${f.slug}/`), 700);
        break;
      }
      case 'DIFF': {
        const f = fileArg(args[0]);
        const n = Number(args[1]);
        if (!f) p('FILE NOT FOUND.', '找不到档案。');
        else if (!f.revised) p(`${f.file}: NO EARLIER DRAFTS ON TAPE.`, `${f.file}：磁带上没有早期稿。`);
        else if (!(n >= 1 && n <= 8)) p('DRAFT: 01–08.', '稿号：01–08。');
        else {
          p(`RESTORING ${f.file} DRAFT ${String(n).padStart(2, '0')}. SEE BACKUP.`, `正在恢复 ${f.file} 第 ${String(n).padStart(2, '0')} 稿。见备份屏。`);
          this.hooks.focus('backup');
          await this.hooks.restore(f.file, n);
        }
        break;
      }
      case 'LOG':
        p(`${this.data.log.length} REVISIONS LOGGED. SEE REVISION LOG.`, `已登记 ${this.data.log.length} 条修订。见修订日志屏。`);
        this.hooks.focus('log');
        break;
      case 'YEAR':
        p('YEAR FIELD: 99. LENGTH: 2.', '年份字段：99。长度：2 位。');
        this.hooks.focus('year');
        break;
      case 'ROLLOVER':
        this.hooks.focus('year');
        this.hooks.rollover();
        break;
      case 'CLOCK':
      case 'CLOCKS':
        p('SILVA +1 H. PORTUS POSTERIOR −1 H.', '林地 +1 小时。后港 −1 小时。');
        this.hooks.focus('clocks');
        break;
      case 'SYNC':
        this.hooks.focus('clocks');
        this.hooks.sync();
        break;
      case 'WHO': {
        const v = loadVisitor();
        p('SESSIONS SINCE 18:00:', '18:00 以来的登录：');
        this.print('HEUSS     DATA SECTION    TTY2   23:41');
        this.print('YOSH      BACKUP          TTY4   02:10');
        this.print(v ? `${esc(v.code.toUpperCase().slice(0, 9).padEnd(9, ' ')).replace(/ /g, '&nbsp;')} ${fileNo(v)}          TTY1   ${zh ? '现在' : 'NOW'}` : `GUEST     ${zh ? '未登记' : 'UNREGISTERED'}    TTY1   ${zh ? '现在' : 'NOW'}`);
        break;
      }
      case 'CLEAR':
      case 'CLS':
        this.out.innerHTML = '';
        break;
      case 'LOGOUT':
      case 'EXIT':
        p('SESSION CLOSED.', '会话结束。');
        this.hooks.logout();
        break;
      case 'CAT':
      case 'TYPE':
      case 'MORE':
        // the ninth proposal is not on this machine
        if (/PROP|09|Y2K|NINTH/.test(args.join(' '))) {
          p('FILE NOT FOUND.', '找不到文件。');
          p('LAST MODIFIED: 31.12.99 23:59.', '最后修改：31.12.99 23:59。', 'dim');
        } else p('NO SUCH FILE. USE OPEN.', '没有这个文件。请用 OPEN。');
        break;
      default:
        p('UNRECOGNISED COMMAND.', '无法识别的命令。');
    }
  }
}
