import { arrowIntoSub, bands, chip, copyHook, ICONS, menuHead, popMenu, subMenu } from './controls.ts';
import { bound, show } from './binds.ts';
import { gem } from './kinds.ts';
import { tell } from './notify.ts';
import { chatOn, chatsOn, pref, setOff, setPref } from './prefs.ts';
import { $, CHATS, esc, store } from './util.ts';

const short = (label: string) => label.replace(/ Agent$/, '');

export const PIN_PLACES = ['top', 'list', 'agents', 'text', 'tochat', 'quick'];
type Pins = { same: boolean; all: string; at: Record<string, string> };
const pins = (): Pins => {
  const v = pref('agent:pin') || {};
  return { same: v.same !== false, all: typeof v.all === 'string' ? v.all : '', at: { list: v.at?.top || '', ...(v.at || {}) } };
};
const was = store.get('quickAgent:type', null);
if (typeof was === 'string' && store.get('agent:pin', null) === null) {
  if (CHATS.some(([k]) => k === was)) setPref('agent:pin', { same: false, all: '', at: { quick: was } });
  store.del('quickAgent:type');
}

export const pinSame = (): boolean => pins().same;
export const pinnedAt = (place: string): string => {
  const p = pins();
  return (p.same ? p.all : p.at[place]) || '';
};
export const pinOf = (place: string): string => {
  const k = pinnedAt(place);
  return k && chatOn(k) ? k : '';
};
export function setPin(place: string, k: string) {
  const p = pins();
  if (p.same || place === '*') {
    p.all = k;
    p.at = Object.fromEntries(PIN_PLACES.map((x) => [x, k]));
  } else p.at[place] = k;
  setPref('agent:pin', p);
}
export function setPinSame(on: boolean) {
  const p = pins();
  if (on) p.all = p.at.top || '';
  else p.at = Object.fromEntries(PIN_PLACES.map((x) => [x, p.all]));
  p.same = on;
  setPref('agent:pin', p);
}
export const agentShort = (k: string): string => short(CHATS.find(([c]) => c === k)?.[1] || k);
export const ringSvg = (on: boolean) => `<svg class="ic am-ring" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/>${on ? '<circle class="am-dot" cx="8" cy="8" r="2.6"/>' : ''}</svg>`;

export const newHint = (one: string) => `<p>Pick a ${esc(one)} on the right, or</p><button class="outline" data-dk-new>+ new</button>`;

export type AgentMore = { label: string; icon: string; rows: () => string; pick: (b: HTMLButtonElement) => unknown; none?: string };
export type AgentOpts = { place?: string; tail?: [string, () => unknown, string?]; more?: AgentMore | null };

export function agentMenu(x: number, y: number, pick: (program: string) => unknown, head = '', pre = 'chat:', focus: boolean | string = false, o: AgentOpts = {}) {
  const on = chatsOn(), place = o.place && on.length > 1 && pref('agent:pinRings') ? o.place : '', cur = place ? pinnedAt(place) : '';
  const ring = (k: string, label: string) => {
    if (!place) return '';
    const mine = cur === k, where = pinSame() ? ' in every place' : ' here';
    const tip = mine ? `Unpin ${short(label)}\nA click on + shows this list again.` : `Pin ${short(label)}\nA click on + starts ${label}${where}.`;
    return `<button class="am-pin${mine ? ' on' : ''}" data-pin="${esc(k)}" title="${esc(tip)}" aria-label="${esc(tip.split('\n')[0])}" aria-pressed="${mine}">${ringSvg(mine)}</button>`;
  };
  const item = ([k, label, hint]: string[]) => {
    const n = CHATS.findIndex(([c]) => c === k) + 1, key = bound('newChatN') && n ? chip(`${show(bound('newChatN'))} ${n}`) : '';
    const row = `<button class="mi" data-k="${esc(pre + k)}" title="${esc(`${label}\nA new chat with ${short(label)}, on ${hint.replace(/^use /, '')}.${on.length > 1 ? '\n\nRight-click to turn it off.' : ''}`)}"><i class="tb-ic">${gem('ai')}</i><span class="mi-n">${esc(label)}</span>${key}</button>`;
    return place ? `<div class="am-row">${row}${ring(k, label)}</div>` : row;
  };
  const mo = o.more, more = mo ? `<div class="sep"></div><button class="mi" data-more${mo.none ? ` disabled title="${esc(mo.none)}"` : ' data-sub aria-haspopup="menu" aria-expanded="false"'}><i class="tb-ic">${mo.icon}</i><span class="mi-n">${esc(mo.label)}</span><span class="pk-ar">›</span></button>` : '';
  const tail = o.tail ? `<button class="mi" data-tail><i class="tb-ic">${o.tail[2] || ICONS.topBar}</i><span class="mi-n">${esc(o.tail[0])}</span>${chip('›')}</button>` : '';
  popMenu(
    x,
    y,
    (head || menuHead(gem('ai'), 'agents')) + bands({ actions: copyHook.row(), pick: ['new chat', on.map(item).join('') + more], other: tail }),
    (b) => {
      if (copyHook.pick(b)) return;
      if (b.dataset.pin != null) {
        const k = b.dataset.pin;
        setPin(place, cur === k ? '' : k);
        return agentMenu(x, y, pick, head, pre, `[data-pin="${k}"]`, o);
      }
      if (b.dataset.tail != null) return o.tail?.[1]();
      if (b.dataset.more != null) return mo && subMenu(b, mo.rows(), mo.pick);
      if (b.dataset.k) pick(b.dataset.k.slice(pre.length));
    },
    false,
    (b, e) => {
      const k = (b.dataset.k || '').slice(pre.length) || b.dataset.pin;
      if (!k) return;
      if (chatsOn().length < 2) return tell(b, { title: 'At least one agent stays on', line: 'turn another one on first', ms: 2500 });
      const label = CHATS.find(([c]) => c === k)?.[1] || k;
      popMenu(
        e.clientX,
        e.clientY,
        menuHead(gem('ai'), label) + bands({ actions: `<button class="mi" data-off="${esc(k)}" title="${esc(`Turn off\nNo new ${short(label)} chats in any menu, tile or picker; the chats you have stay. Settings, agents, brings it back.`)}"><i class="tb-ic">${ICONS.unlist}</i><span class="mi-n">turn off</span></button>` }),
        (oo) => {
          if (!oo.dataset.off) return;
          setOff('agents:off', oo.dataset.off, true);
          if (chatsOn().length > 1) agentMenu(x, y, pick, head, pre, true, o);
        },
      );
      $<HTMLElement>('#colormenu [data-off]')?.focus();
    },
  );
  arrowIntoSub($<HTMLElement>('#colormenu [data-more][data-sub]'));
  if (typeof focus === 'string') $<HTMLElement>(`#colormenu ${focus}`)?.focus();
  else if (focus) $<HTMLElement>('#colormenu .mi[data-k]')?.focus();
}

export function launchAgent(place: string, x: number, y: number, start: (program: string) => unknown, pre = 'chat:', more: AgentMore | null = null) {
  const on = chatsOn();
  if (on.length === 1) return start(on[0][0]);
  const k = pinOf(place);
  if (k) return start(k);
  return agentMenu(x, y, start, '', pre, false, { place, more });
}

export function agentRight(place: string, e: MouseEvent, start: (program: string) => unknown, tail?: [string, () => unknown, string?]): boolean {
  if (chatsOn().length < 2) return false;
  e.preventDefault();
  e.stopPropagation();
  const r = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
  agentMenu(r?.width ? r.left : e.clientX, r?.width ? r.bottom + 6 : e.clientY, start, '', 'chat:', e.button !== 2, { place, tail });
  return true;
}
