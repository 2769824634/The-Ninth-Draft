/**
 * Wires a StreetMap.astro block: the canvas, the zoom buttons, the page
 * reference in the corner and the district card.
 */
import { streetMap } from './street';
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
}

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
    if (!d || id === focus) {
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
    pick: (id: string | null) => map.pick(id, true),
    /** After the language changes. */
    relang: () => {
      showCard(current === focus ? null : current);
      corner(...last);
      map.redraw();
    },
  };
}
