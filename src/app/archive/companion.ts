/**
 * The second file on the table, laid beside the one being read: the same
 * paper, as filed, to read across. Its own drafts stay underneath; to lift
 * them, swap it to the front.
 */
import type { ArchiveRecord } from '../types';
import { attachmentsHtml, paintNegatives } from '../ui/attachments';
import { asFiled } from '../ui/dossier';
import { clearanceKey } from '../clearance';
import { isZh, t } from '../i18n';
import { reducedMotion } from '../prefs';
import { esc } from '../ui/text';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (s?: string) => {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s ?? '';
  return isZh() ? `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日` : `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
};

export class Companion {
  private el = document.getElementById('companion')!;
  rec: ArchiveRecord | null = null;

  constructor(private hooks: { swap(rec: ArchiveRecord): void; close(): void }) {
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
      if (act === 'swap' && this.rec) this.hooks.swap(this.rec);
      else if (act === 'close') this.hooks.close();
      const r = t.closest('.redact, .rv.is-redacted');
      if (r) r.classList.toggle('is-open');
    });
  }

  show(rec: ArchiveRecord) {
    this.rec = rec;
    const zh = isZh();
    const meta: [string, string][] = [];
    if (rec.date) meta.push([t('Date'), esc(longDate(rec.date))]);
    if (rec.place) meta.push([t('Place'), esc(rec.place)]);
    meta.push([t('Status'), esc(t(rec.status))]);
    meta.push([t('Classification'), esc(rec.stamp)]);
    for (const f of rec.fields) meta.push([f.label, f.value]);
    this.el.dataset.clr = clearanceKey(rec.stamp);
    this.el.innerHTML = `
      <div class="companion__bar micro">
        <span>${zh ? '对照' : 'Alongside'} · ${esc(rec.file)}</span>
        <button type="button" data-act="swap">${zh ? '换到前面读' : 'Read this one'}</button>
        <button type="button" data-act="close" aria-label="${zh ? '收起' : 'Put it aside'}">×</button>
      </div>
      <div class="dossier__paper companion__paper">
        <header class="dossier__head">
          <div class="dossier__crumbs micro"><span>${esc(t('File {file}', { file: rec.file }))}</span></div>
          <h2 class="dossier__title" data-category="${esc(rec.category)}">${esc(rec.title)}</h2>
          ${rec.subtitle ? `<p class="dossier__sub">${esc(rec.subtitle)}</p>` : ''}
        </header>
        <dl class="dossier__meta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <section class="pane"><div class="micro lede-label">${t('Abstract')}</div><p class="lede">${rec.summary}</p></section>
        ${rec.body ? `<section class="pane prose"><div class="micro lede-label">${t('Record')}</div>${rec.body}</section>` : ''}
        <section class="pane pane--attach">${attachmentsHtml(rec)}</section>
      </div>`;
    const paper = this.el.querySelector<HTMLElement>('.companion__paper')!;
    asFiled(paper);
    void paintNegatives(paper.querySelector('.pane--attach')!, rec, () => this.rec === rec);
    this.el.hidden = false;
    this.el.setAttribute('aria-hidden', 'false');
    if (!reducedMotion()) this.el.animate([{ opacity: 0, transform: 'translate(2rem, .6rem) rotate(.8deg)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  hide() {
    this.rec = null;
    this.el.hidden = true;
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '';
  }
}
