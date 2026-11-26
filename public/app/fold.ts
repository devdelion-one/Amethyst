import { ICONS, popMenu } from '../base/controls.ts';
import { onPref, pref, PREFS } from '../base/prefs.ts';
import { esc } from '../base/util.ts';
import { nextFrame, onSize } from '../base/measure.ts';
import { NOTE_IC } from '../base/agentrow.ts';
import { gem } from '../base/kinds.ts';

type Head = HTMLElement & { _fw?: Element[]; _folded?: HTMLButtonElement[]; _rows?: HTMLButtonElement[]; _fdMenu?: Element | null };

export const SPOT_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><rect x="3.5" y="4" width="4.5" height="8" rx=".5" fill="currentColor" stroke="none"/></svg>';
const SEL: Record<string, string> = {
  spot: '[data-dk-spot]',
  mark: '[data-dk-mark]',
  report: '[data-dk-report]',
  note: '[data-dk-note]',
  pin: '[data-dk-pin]',
  pills: '.dk-tools .ch-pill:not(.ch-more)',
  bench: '[data-dk-bench]',
  set: '[data-dk-set]',
  orch: '[data-dk-orch]',
  tab: '[data-dk-tab]',
};
const NAME: Record<string, string> = { spot: 'deck:spotBtn', mark: 'deck:markBtn', report: 'deck:reportBtn', note: 'deck:noteBtn', pin: 'deck:pinBtn', pills: 'subagents:chat', bench: 'deck:benchBtn', set: 'deck:setBtn', orch: 'deck:orchBtn', tab: 'deck:tabBtn' };
export const foldName = (k: string) => PREFS[NAME[k]]?.item || PREFS[NAME[k]]?.label || k;
export const foldIcon = (k: string, icon: (name: string) => string) => ({ spot: SPOT_IC, mark: ICONS.mark0, report: ICONS.bell, note: NOTE_IC, pin: ICONS.pin, pills: icon('subs'), bench: ICONS.bench, set: icon('move'), orch: gem('orch'), tab: '⤢' } as Record<string, string>)[k];
const HEAD: Record<string, [string, (icon: (name: string) => string) => string]> = {
  'subagents:chat': ['subagents', (icon) => icon('subs')],
  'edits:head': ['± review', () => '±'],
  'deck:spotBtn': ['spotlight', () => SPOT_IC],
  'deck:markBtn': ['mark', () => ICONS.mark0],
  'deck:markShow': ['the mark, when its button is hidden', () => ICONS.mark1],
  'deck:reportBtn': ['notify me', () => ICONS.bell],
  'deck:noteBtn': ['note', () => NOTE_IC],
  'deck:noteShow': ['the note, when its button is hidden', () => NOTE_IC],
  'deck:pinBtn': ['pin', () => ICONS.pin],
  'deck:benchBtn': ['bench', () => ICONS.bench],
  'deck:setBtn': ['move to another set or tab', (icon) => icon('move')],
  'deck:orchBtn': ['move to Orchestration', () => gem('orch')],
  'deck:tabBtn': ['move to the Editor', () => '⤢'],
  'deck:more': ['more ⋯', (icon) => icon('more')],
};
export const headKeys = (order: string[]) => order.filter((k) => HEAD[k]);
export const headName = (k: string) => HEAD[k]?.[0] || k;
export const headIcon = (k: string, icon: (name: string) => string) => HEAD[k]?.[1](icon) || '';
export const foldOrder = () => {
  const mine = pref('deck:foldOrder').filter((k: string) => SEL[k]);
  return [...new Set([...mine, ...Object.keys(SEL)])];
};
export const anchorOf = (b: HTMLElement) => (b.offsetWidth ? b : [...(b.closest('.dk-ch')?.querySelectorAll<HTMLElement>('.ch-more, [data-dk-fmore]') || [])].find((x) => x.offsetWidth) || b);

type Look = { hd: Head; spare: number; slack: number; gap: number; kinds: [HTMLButtonElement, number | undefined][][]; swap: Element | null; more: number | undefined };
const widths = new WeakMap<Element, number>();
function widthOf(x: HTMLElement) {
  if (x.classList.contains('fold')) return widths.get(x);
  const w = x.offsetWidth;
  widths.set(x, w);
  return w;
}
const overOf = (x: Element | null) => (x ? Math.max(0, x.scrollWidth - x.clientWidth) : 0);
function look(hd: Head): Look | null {
  if (!hd.isConnected || !hd.offsetWidth) return null;
  const t = hd.querySelector<HTMLElement>('.dk-title'), grow = hd.querySelector(':scope > .grow');
  const spare = (grow?.getBoundingClientRect().width || 0) + (t ? t.clientWidth - Math.min(t.scrollWidth, 64) : 0) - overOf(hd) - overOf(hd.querySelector(':scope > .dk-id'));
  const kinds = foldOrder().map((k) => [...hd.querySelectorAll<HTMLButtonElement>(SEL[k])].filter((x) => !x.hidden).map((x) => [x, widthOf(x)] as [HTMLButtonElement, number | undefined]));
  const swap = hd.querySelector<HTMLElement>('.dk-tools.nomore .ch-more, :scope > [data-dk-fmore]');
  const more = swap && hd.classList.contains('folded') ? (widths.set(swap, swap.offsetWidth), swap.offsetWidth) : swap ? widths.get(swap) : 0;
  return { hd, spare, slack: t ? 0.5 : 1, gap: parseFloat(getComputedStyle(hd).columnGap) || 0, kinds, swap, more };
}
function apply(l: Look | null) {
  if (!l || !l.hd.isConnected) return;
  const { hd, gap, kinds, swap, more } = l;
  if (kinds.some((els) => els.some(([, w]) => w == null))) return tryFold(hd);
  let s = l.spare;
  for (const els of kinds) for (const [x, w] of els) if (x.classList.contains('fold')) s -= w! + gap;
  if (swap && hd.classList.contains('folded')) s += more! + gap;
  const out: HTMLButtonElement[] = [];
  for (const els of kinds) {
    if (s >= -l.slack) break;
    const shown = els.filter(([, w]) => w! > 0);
    if (!shown.length) continue;
    if (!out.length && swap) {
      if (more == null) return tryFold(hd);
      s -= more + gap;
    }
    for (const [x, w] of shown) {
      s += w! + gap;
      out.push(x);
    }
  }
  const on = new Set(out);
  for (const els of kinds) for (const [x] of els) if (x.classList.contains('fold') !== on.has(x)) x.classList.toggle('fold', on.has(x));
  if (hd.classList.contains('folded') !== !!out.length) hd.classList.toggle('folded', !!out.length);
  hd._folded = out;
  rows(hd, out);
}
const headsOf = (seen: ResizeObserverEntry[]) => [...new Set(seen.map((e) => (e.target as HTMLElement).closest<Head>('.dk-ch')))].filter((hd): hd is Head => !!hd?.isConnected);
const ro = onSize(null, { name: 'deck.fold', read: (seen) => headsOf(seen).map(look), write: (all: (Look | null)[]) => all.forEach(apply) });
export function foldHead(hd: Head) {
  for (const x of hd._fw || []) ro.unobserve(x);
  hd._fw = [hd, ...hd.querySelectorAll(Object.values(SEL).join(','))];
  for (const x of hd._fw) ro.observe(x);
}
onPref('deck:foldOrder', () => nextFrame({ name: 'deck.fold', read: () => [...document.querySelectorAll<Head>('.dk-ch')].filter((hd) => hd._fw).map(look), write: (all: (Look | null)[]) => all.forEach(apply) }));

function over(hd: HTMLElement) {
  const t = hd.querySelector('.dk-title');
  if (t && t.clientWidth < Math.min(t.scrollWidth, 64)) return true;
  return [hd, ...hd.children].some((x) => !x.classList.contains('dk-done') && x.scrollWidth > x.clientWidth + 1);
}
function tryFold(hd: Head) {
  if (!hd.offsetWidth) return;
  for (const x of hd.querySelectorAll('.fold')) x.classList.remove('fold');
  hd.classList.remove('folded');
  const out: HTMLButtonElement[] = [];
  for (const k of foldOrder()) {
    if (!over(hd)) break;
    const els = [...hd.querySelectorAll<HTMLButtonElement>(SEL[k])].filter((x) => widthOf(x));
    if (!els.length) continue;
    for (const x of els) x.classList.add('fold');
    hd.classList.add('folded');
    out.push(...els);
  }
  hd._folded = out;
  rows(hd, out);
}

const tipOf = (x: HTMLElement) => x.title || x.dataset.tip || '';
const GENERAL: Record<string, string> = { spotlight: 'spotlight', mark: 'mark', pin: 'pin', unpin: 'pin', 'sign-in': 'sign-in', 'signed-in': 'sign-in', clear: 'clear', 'clear this chat': 'clear', 'continue with': 'continue with', 'move to': 'move to' };
const labelOf = (x: HTMLElement) => x.dataset.row || x.getAttribute('aria-label') || tipOf(x);
function row(x: HTMLButtonElement, i: number, cls: string) {
  const svg = x.querySelector('svg')?.outerHTML, m = [...x.classList].find((c) => /^m\d$/.test(c));
  const ic = !svg ? `<span class="dk-mi-g">${esc(x.textContent!.trim())}</span>` : m ? `<i class="mk-d ${m}">${svg}</i>` : svg;
  const tip = tipOf(x), label = labelOf(x);
  return `<button type="button" role="menuitem" class="${cls}" data-dk-fold="${i}"${tip && tip !== label ? ` title="${esc(tip)}"` : ''}${x.disabled ? ' disabled' : ''}>${ic}${esc(label)}</button>`;
}
const OWN = '[data-ch="history"], [data-ch="signin"], [data-ch="clear"], [data-ch="swap"]';
const OFF = `[data-off], .dk-tools .ch-pill:not(.ch-more, ${OWN})`;
const shown = (x: HTMLElement) => !x.hidden && getComputedStyle(x).display !== 'none';
const orderOf = (x: HTMLElement) => parseFloat(getComputedStyle(x).order) || 0;
function rows(hd: Head, out: HTMLButtonElement[]) {
  const menu = ((hd._fdMenu as HTMLElement | null | undefined) || hd.parentElement?.querySelector<HTMLElement>(':scope > .dk-body .ch-menu')) as (HTMLElement & { _fd?: string }) | null | undefined, more = hd.querySelector<HTMLElement>('.dk-tools .ch-more');
  const offs = [...hd.querySelectorAll<HTMLButtonElement>(OFF)].filter((x) => !x.hidden && !x.classList.contains('fold') && (x.hasAttribute('data-off') || getComputedStyle(x).display === 'none'));
  const all = [...offs.map((x, i) => [x, i] as const).sort((a, b) => orderOf(a[0]) - orderOf(b[0]) || a[1] - b[1]).map(([x]) => x), ...out];
  hd._rows = all;
  if (hd.classList.contains('has-off') !== !!offs.length) hd.classList.toggle('has-off', !!offs.length);
  if (!menu || !more) return;
  const html = all.length ? '<div class="dk-fd dk-fd-sep"></div>' + all.map((x, i) => row(x, i, 'dk-fd')).join('') : '';
  if (menu._fd !== html) {
    menu.querySelectorAll('.dk-fd').forEach((x) => x.remove());
    menu.insertAdjacentHTML('beforeend', html);
    menu._fd = html;
  }
  const only = !!hd.querySelector('.dk-tools.nomore');
  menu.classList.toggle('dk-only', only);
  const own = [...menu.querySelectorAll<HTMLElement>(':scope > button:not(.dk-fd)')].filter(shown).map((x) => x.textContent!.replace(/›$/, '').trim());
  const words = [...new Set([...(only ? [] : own), ...all.map(labelOf)].map((l) => GENERAL[l.replace(/…$/, '').trim().toLowerCase()]).filter(Boolean))];
  more.title = `More\nEverything else for this chat${words.length ? `: ${words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]}` : ''}.`;
}

document.addEventListener('click', (e) => {
  const r = (e.target as HTMLElement).closest('.ch-menu [data-dk-fold], [data-dk-fmore]') as HTMLElement;
  if (!r) return;
  const hd = (r.closest('.dk-ch') || r.closest('.dk-cell')?.querySelector(':scope > .dk-ch') || [...document.querySelectorAll<Head>('.dk-ch')].find((h) => h._fdMenu?.contains(r))) as Head | null;
  if (!hd) return;
  if (r.dataset.dkFmore != null) {
    const b = r.getBoundingClientRect();
    return popMenu(b.left, b.bottom + 4, (hd._rows || []).map((x, i) => row(x, i, 'mi')).join(''), (o) => hd._rows?.[+o.dataset.dkFold!]?.click());
  }
  hd.querySelector<HTMLElement>('.ch-more[aria-expanded="true"]')?.click();
  hd._rows?.[+r.dataset.dkFold!]?.click();
});
