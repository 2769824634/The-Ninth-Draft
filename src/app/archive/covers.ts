/**
 * The front of the folder a file comes up in, printed and filled in from the
 * file's own fields, so a friend writing a record never draws one.
 *
 * - personnel: a manila folder made up like a staff card: the Office's form
 *   printed on it, typed in, a photo box, two punched holes and a fastener;
 * - events: an upright kraft case envelope, the red case form printed on its
 *   face with the contents listed from the file's attachments;
 * - programs: a cloth-spined board dossier with a pasted label;
 * - TOP SECRET (whatever it is): shut with string wound round two washers.
 *
 * Form labels are printed in English and Chinese, as the island's forms are;
 * what is typed in comes from the record in the language it is being read in.
 */
import type { ArchiveRecord } from '../types';
import { esc } from '../ui/text';
import { isFiled } from '../island';
import { draftInfo } from '../ui/dossier';

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** 9 MAR 1999, as a date stamp prints it. */
function stampDate(iso?: string) {
  const m = iso?.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return '';
  return `${m[3] ? `${Number(m[3])} ` : ''}${MON[Number(m[2]) - 1] ?? ''} ${m[1]}`;
}

const KIND: Record<string, [string, string]> = {
  note: ['Memo', '便条'],
  telegram: ['Telegram', '电报'],
  ticket: ['Ticket', '票根'],
  clipping: ['Clipping', '剪报'],
  negative: ['Negative strip', '底片'],
};

/** One printed row of the form: the label in both languages, then what is typed in (`html`: already marked up). */
const row = (en: string, zh: string, value: string, cls = '', html = false) =>
  `<div class="cv-row${cls ? ` ${cls}` : ''}"><span class="cv-lab">${en}<em>${zh}</em></span><b class="cv-val">${(html ? value : esc(value)) || '&nbsp;'}</b></div>`;

/** Text that comes marked up (summaries, field values), typed onto the form as plain words. */
const plain = (html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  return esc(d.textContent ?? '');
};

/** The washers and the wound string that keep a TOP SECRET envelope shut. */
const STRING = `<div class="cv-string" aria-hidden="true">
  <i class="cv-washer"></i><i class="cv-washer cv-washer--b"></i>
  <svg viewBox="0 0 40 120" preserveAspectRatio="none"><path class="cv-thread" pathLength="1" d="M20 14 C 4 26, 36 40, 20 52 C 4 64, 36 78, 20 92 C 6 100, 34 108, 20 106 C 8 102, 32 30, 20 18"/></svg>
</div>`;

/** The amendments on file, as the counter logs them: draft, what it was, when. Two blank rows if none. */
function amendments(rec: ArchiveRecord) {
  // the drafts the file names, or else the ones its marks change; none still to come
  const named = rec.drafts.filter((d) => d.n < 9 && isFiled(d.date)).map((d) => d.n);
  const ns = new Set(named);
  if (!named.length) for (const m of rec.body.matchAll(/data-(?:add|del|redact)="(\d)/g)) if (Number(m[1]) > 0 && Number(m[1]) < 9) ns.add(Number(m[1]));
  const future = new Set(rec.drafts.filter((d) => !isFiled(d.date)).map((d) => d.n));
  const rows = [...ns]
    .filter((n) => !future.has(n))
    .sort((a, b) => a - b)
    .slice(-4)
    .map((n) => draftInfo(rec, n))
    .map((d) => `<li><span>${String(d.n).padStart(2, '0')}</span><b>${esc(d.label)}</b><i>${esc(stampDate(d.date))}</i></li>`);
  while (rows.length < 2) rows.push('<li><span>&nbsp;</span><b>&nbsp;</b><i></i></li>');
  return rows.join('');
}

export function coverHtml(rec: ArchiveRecord) {
  const top = rec.stamp === 'TOP SECRET';
  const date = stampDate(rec.date);
  const extra = rec.fields.slice(0, 2);
  const stamp = `<b class="cv-stamp">${esc(rec.stamp)}</b>`;
  const recv = date ? `<span class="cv-recv">RECEIVED<br>${esc(date)}<br>RECORDS OFFICE</span>` : '';
  let face = '';
  if (rec.category === 'personnel') {
    face = `<span class="cv-tab">${esc(rec.file)}</span>
      <i class="cv-holes"></i><i class="cv-fastener"></i>
      <p class="cv-org">RECORDS OFFICE · GERIMIS <em>霏微记录署</em></p>
      <h3 class="cv-head">PERSONNEL RECORD <em>人员档案</em></h3>
      <div class="cv-photo"><span>PHOTO<br>相片</span><i class="cv-clip"></i></div>
      <div class="cv-form">
        ${row('NAME', '姓名', rec.title, 'cv-row--wide')}
        ${row('FILE NO.', '档案号', rec.file)}
        ${row('OPENED', '立档', date || (rec.date ?? ''))}
        ${row('DISTRICT', '区', rec.place ?? '', 'cv-row--wide')}
        ${extra.map((f) => row(f.label.toUpperCase(), '', plain(f.value), '', true)).join('')}
      </div>
      <div class="cv-more">
        <p class="cv-sub">REMARKS <em>备注</em></p>
        <p class="cv-remarks">${plain(rec.summary)}</p>
        <p class="cv-sub">AMENDMENTS <em>修订记录</em></p>
        <ol class="cv-list">${amendments(rec)}</ol>
      </div>
      ${recv}${stamp}
      <span class="cv-form-no">FORM RO-12 (REV. 3/97)</span>`;
  } else if (rec.category === 'events') {
    const items = [['Record', '正文'], ...rec.attachments.map((a) => KIND[a.kind] ?? ['Enclosure', '附件'])];
    face = `<span class="cv-tab">${esc(rec.file)}</span>
      <div class="cv-case">
        <h3 class="cv-head">CASE FILE <em>案卷</em></h3>
        ${row('FILE NO.', '案号', rec.file)}
        ${row('SUBJECT', '案由', rec.title, 'cv-row--wide')}
        ${row('PLACE', '地点', rec.place ?? '')}
        ${row('DATE', '日期', date || (rec.date ?? ''))}
        ${row('STATUS', '状态', rec.status)}
        <p class="cv-sub">CONTENTS <em>卷内目录</em></p>
        <ol class="cv-list">${items.map(([en, zh], i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><b>${esc(en)} · ${zh}</b><i>${i ? 1 : '—'}</i></li>`).join('')}</ol>
        <p class="cv-sub">REMARKS <em>备注</em></p>
        <p class="cv-remarks">${plain(rec.summary)}</p>
      </div>
      ${top ? '' : '<i class="cv-button"></i><i class="cv-button cv-button--b"></i><i class="cv-tie"></i>'}
      ${recv}${stamp}
      <span class="cv-form-no">FORM RO-31 · CASE ENVELOPE</span>`;
  } else {
    face = `<i class="cv-spine"></i>
      <i class="cv-frame"></i>
      <p class="cv-org">RECORDS OFFICE · GERIMIS <em>霏微记录署</em></p>
      <div class="cv-label">
        <p class="cv-label__kind">PROGRAMME FILE <em>计划卷宗</em></p>
        <h3 class="cv-label__title">${esc(rec.title)}</h3>
        <p class="cv-label__no">${esc(rec.file)}${date ? ` · ${esc(date)}` : ''}</p>
      </div>
      ${stamp}
      <span class="cv-form-no">VOL. 1 OF 1 · DO NOT REMOVE FROM THE OFFICE</span>`;
  }
  return `<div class="ds-cover__flap">
      <div class="ds-cover__face">${face}${top ? STRING : ''}</div>
      <div class="ds-cover__inside"><p class="cv-inside">THIS FILE IS THE PROPERTY OF THE RECORDS OFFICE.<br>RETURN IT TO THE COUNTER BEFORE YOU LEAVE.<br><em>本卷属记录署所有，离馆前请交还柜台。</em></p></div>
    </div>`;
}
