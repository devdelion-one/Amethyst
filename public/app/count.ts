import { page } from '../base/page.ts';
import { esc } from '../base/util.ts';
import { COUNT, countDetails } from './count-words.ts';
import type { UsageNow } from '../base/types.ts';

type Row = (label: string, opts: string, o?: { desc?: string }) => string;
type Toggle = (on: unknown, attrs: string, tip?: string) => string;

const USAGE = window.amethyst?.usage || null;
let now: UsageNow | null = null;
const open = new Set<string>();
type Where = 'welcome' | 'settings';
const subs = new Set<() => void>();

const use = (s: UsageNow) => {
  now = s;
  page.renderSettings?.();
  for (const fn of subs) fn();
};
export const countReady: Promise<UsageNow | null> = USAGE ? USAGE.state().then((s) => (use(s), s), () => null) : Promise.resolve(null);
USAGE?.onState(use);

export const hasCount = () => !!USAGE;
export const countNow = () => now;
export const onCount = (fn: () => void) => void subs.add(fn);
export const setCount = (o: { on?: boolean | null; asked?: boolean }) => (USAGE ? USAGE.set(o).then(use) : Promise.resolve());
export const toggleCountMore = (w: Where, on = !open.has(w)) => void (on ? open.add(w) : open.delete(w));

export const countTog = (w: Where) => `<button class="ct-tog" data-ct-more aria-expanded="${open.has(w)}"><span class="tx">details</span><span class="ct-ar" aria-hidden="true">${open.has(w) ? '▾' : '▸'}</span></button>`;
export const countMore = (w: Where) => (open.has(w) && now ? countDetails(now) : '');

export function countRow(row: Row, tg: Toggle) {
  if (!USAGE || !now) return '';
  const off = now.dev ? 'disabled' : '';
  const tip = (t: string) => (now!.dev ? 'only the installed app counts' : t);
  return row('count this install',
    tg(now.on === true, `data-ct-on="${now.on === true ? '' : '1'}" aria-label="count this install" ${off}`, tip(now.on === true ? 'on: once a day, the version and four yes/no answers; click: nothing is sent' : 'off: nothing is sent; click: once a day, the version and four yes/no answers')),
    { desc: 'once a day, the version and four yes/no answers; nothing about you' }) +
    `<div class="cc-help ct-set"><span class="ct-line">${esc(COUNT.short)} ${countTog('settings')}</span>${countMore('settings')}</div>`;
}

export function countClick(d: DOMStringMap) {
  if (!USAGE) return false;
  if ('ctMore' in d) return toggleCountMore('settings'), page.renderSettings?.(), true;
  if ('ctOn' in d) return setCount({ on: !!d.ctOn }), true;
  return false;
}
