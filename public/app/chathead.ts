import { icon } from '../base/icon.ts';
import { barMenu, chip, ICONS, rowIcons, topRow } from '../base/controls.ts';
import { agentPin, api, isPinned, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { BTN_OF, pillAt, pref, setPref } from '../base/prefs.ts';
import { esc, showErr, store } from '../base/util.ts';
import { busyNow, gem } from '../base/kinds.ts';
import { tell } from '../base/notify.ts';
import { codeOf, groupOf, markOf, providerOf, spark, stepWord, titleOf } from '../base/agentlook.ts';
import { doneInner, markBtn, markSign, noteBtn, noteSign, renameAsk, renameItem } from '../base/agentrow.ts';
import { anchorOf, foldHead, SPOT_IC } from './fold.ts';
import { agents } from '../base/stream.ts';
import { modelTip } from '../base/words.ts';
import type { Agent } from '../base/stream.ts';

rowIcons({
  'subagents:chat': () => icon('subs'), 'edits:head': () => ICONS.review, 'deck:spotBtn': () => SPOT_IC, 'deck:markBtn': () => ICONS.mark0, 'deck:reportBtn': () => ICONS.bell, 'deck:noteBtn': () => ICONS.note, 'deck:pinBtn': () => ICONS.pin, 'deck:benchBtn': () => ICONS.bench, 'deck:setBtn': () => icon('move'), 'deck:orchBtn': () => gem('orch'), 'deck:tabBtn': () => '<b class="tb-tx">⤢</b>', 'deck:closeBtn': () => ICONS.x, 'deck:more': () => icon('more'),
  'deck:model': () => icon('model'), 'deck:code': () => '<b class="tb-tx">K</b>', 'deck:title': () => '<b class="tb-tx">Ab</b>',
  'chpill:off:history': () => icon('history'), 'chpill:off:signin': () => icon('key'), 'chpill:off:clear': () => icon('clear'), 'chpill:off:swap': () => icon('move'),
  'orch:termBtn': () => gem('term'), 'orch:folderBtn': () => icon('folder'), 'orch:closeBtn': () => ICONS.x,
});
export const WORD: Record<string, string> = { starting: 'starting', working: 'working', asks: 'Waiting for you', done: 'done', idle: 'idle', ended: 'ended' };
export const ORCH_TIP = 'Move to orchestration\nTakes the chat out of this set. It keeps running in the orchestration list.';

const headTitle = (a: Agent) => (a.kind === 'chat' ? a.title || '' : titleOf(a));
export type HeadOpts = { place?: string; all?: boolean; show?: string[]; free?: boolean };
const headOn = (k: string, o: HeadOpts = {}) => !!o.all || !!o.show?.includes(k) || !!pref(k, o.place || 'win');
export function idHead(a: Agent, o: HeadOpts = {}) {
  const bare = a.kind === 'chat' && !headOn('deck:model', o);
  const who = bare ? '' : a.kind === 'chat' ? `<i class="dk-provider dk-who"${a.model ? ` title="${esc(modelTip(a.model))}" data-tip-icon="model"` : ''}>${esc(a.model || providerOf(a))}</i>` : `<i class="dk-provider">${esc(providerOf(a))}</i>`;
  const word = (busyNow(a) && stepWord(a.step, a.program)) || WORD[a.status as string] || a.status as string, title = headTitle(a);
  return `<span class="dk-id"${a.kind === 'chat' ? ` data-chat="${esc(a.id)}"` : ''}><i class="dk-mark">${markOf(a)}</i>${headOn('deck:code', o) ? codeOf(a.id, title) : ''}${title && headOn('deck:title', o) ? `<b class="dk-title" title="${esc(title)}" data-tip-cut>${esc(title)}</b>` : ''}${who}<span class="dk-st" data-st="${a.status}"><span class="dk-sw">${word}</span>${spark(groupOf(a))}</span></span>`;
}
export const HEAD_BTNS = ['deck:more', 'deck:spotBtn', 'deck:markBtn', 'deck:markShow', 'deck:reportBtn', 'deck:noteBtn', 'deck:noteShow', 'deck:pinBtn', 'deck:benchBtn', 'deck:setBtn', 'deck:orchBtn', 'deck:tabBtn', 'deck:closeBtn', 'chpill:off'];
const fmore = () => `<button data-dk-fmore aria-label="more">${icon('more')}</button>`;
export const toolsSlot = (place = 'win', inner = '', all = false) => `<span class="dk-tools${all || pref('deck:more', place) ? '' : ' nomore'}">${inner}</span>`;
export const offBtn = (html: string, on: boolean, row = '') => (html ? html.replace('<button', `<button${on ? '' : ' data-off'}${row ? ` data-row="${esc(row)}"` : ''}`) : '');

const headSettings = () => {
  store.set('settings:tab', 'show/chat');
  page.openSettings();
};
const visible = (x: HTMLElement) => !x.hidden && getComputedStyle(x).display !== 'none';
function headActs(el: HTMLElement, spot = false) {
  const hd = el.closest<HeadEl>('.dk-ch')!, x = hd.querySelector<HTMLElement>('[data-dk-out]'), chat = !!hd.querySelector('.dk-id[data-chat]'), menu = hd._fdMenu as HTMLElement | null | undefined;
  const pillOn = (k: string) => {
    const p = hd.querySelector<HTMLElement>(`.ch-pill[data-ch="${k}"]`);
    return !!p && !p.hidden && (p.classList.contains('fold') || visible(p));
  };
  const rows = (hd as HeadEl & { _rows?: HTMLElement[] })._rows || [], isX = (x: HTMLElement) => x.dataset.dkFold != null && !!rows[+x.dataset.dkFold]?.matches('[data-dk-out]');
  const more = hd.querySelector('.dk-tools.nomore') && menu ? [...menu.querySelectorAll<HTMLElement>(':scope > button')].filter((x) => !x.hidden && !isX(x) && !(x.dataset.ch && pillOn(x.dataset.ch)) && !(x.dataset.ch === 'swap' && pillAt('swap') === 'hid')) : [];
  const g = (b: HTMLElement) => b.querySelector('.dk-mi-g')?.textContent || '';
  const row = (b: HTMLElement, i: number) => `<button class="mi" data-head-do="${i}"${b.title ? ` title="${esc(b.title)}"` : ''}><i class="tb-ic">${b.querySelector('svg')?.outerHTML || esc(g(b))}</i><span class="mi-n">${esc(b.textContent!.replace(g(b), '').trim())}</span></button>`;
  const who = hd.querySelector<HTMLElement>('.dk-id[data-chat]')?.dataset.chat, a = who ? agents.all.get(who) : null;
  const ren = a ? (spot ? renameItem(a).replace('rename…', 'rename the chat…') : renameItem(a)) : '';
  const close = x ? `<button class="mi" data-head-x${x.title ? ` title="${esc(x.title)}"` : ''}><i class="tb-ic">${ICONS.x}</i><span class="mi-n">${chat ? (spot ? 'close the chat…' : 'close…') : 'close'}</span></button>` : '';
  const ask = a?.kind === 'chat' ? `<div class="sep"></div>` + topRow(!!pref('clear:ask'), `data-clear-ask title="Clear asks first&#10;Clearing the chat asks first; enter clears. Unticked, it clears at once, and ctrl z brings it back."`, icon('clear'), 'clear asks first') : '';
  return { html: `${ren}${more.map(row).join('')}${close}`, ask, chat, x, more, hd, a };
}
const PLACE_KEYS = ['deck:spotBtn', 'deck:benchBtn', 'deck:setBtn', 'deck:orchBtn', 'deck:tabBtn', 'deck:pinBtn', 'deck:closeBtn', 'orch:closeBtn', 'orch:folderBtn', 'orch:termBtn'];
export const headMenu = (el: HTMLElement, e?: MouseEvent) => {
  const acts = headActs(el, !!(e?.target as Element | null)?.closest?.('[data-dk-spot]'));
  return {
    name: acts.chat ? 'chat header' : 'terminal header',
    acts: acts.html,
    opts: acts.ask,
    only: (key: string) => !PLACE_KEYS.includes(key) || !!acts.hd.querySelector(`${BTN_OF[key]}:not([hidden])`),
    other: `<button class="mi" data-head-settings title="Settings&#10;Opens this header's section in Settings."><i class="tb-ic">${ICONS.settings}</i><span class="mi-n">settings</span>${chip('›')}</button>`,
    onPick: (b: HTMLElement) => {
      if ('headSettings' in b.dataset) return headSettings();
      if ('clearAsk' in b.dataset) return setPref('clear:ask', !pref('clear:ask'));
      if ('rename' in b.dataset) return acts.a && renameAsk(acts.a);
      if ('headX' in b.dataset) return acts.x?.click();
      if (b.dataset.headDo != null) acts.more[+b.dataset.headDo]?.click();
    },
  };
};
barMenu('.dk-ch', (el) => (el.querySelector('.dk-id, .dk-tools') ? 'head' : ''), {
  at: (el) => (el.closest('.oc-bar') ? 'oc' : 'win'),
  skip: '.dk-done',
  order: 'head',
  flat: true,
  make: headMenu,
});
export function spotHtml(on: boolean, n: number, any: boolean) {
  const tip = n < 2 ? 'Spotlight\nGives this cell a full-height column of its own. The set needs a second cell first.' : on ? 'Leave the spotlight\nPuts this cell back in the grid with the others.\n\nDouble-clicking the header does the same.' : any ? 'Swap into the spotlight\nThis cell takes the full-height column, and the one there now takes its place.\n\nDouble-clicking the header does the same.' : 'Spotlight\nGives this cell a full-height column of its own, beside the rest of the set.\n\nDouble-clicking the header does the same.';
  return `<button class="dk-spotb${on ? ' on' : ''}" data-dk-spot title="${esc(tip)}" aria-label="${on ? 'out of the spotlight' : 'spotlight'}"${n < 2 ? ' disabled' : ''}>${SPOT_IC}</button>`;
}
export function pinOf(a: Agent, cls = '') {
  if (a.kind === 'chat' && !a.session) return '';
  const on = isPinned(agentPin(a, ''));
  return `<button class="pin-d ${cls}${on ? ' on' : ''}" data-dk-pin="${esc(a.id)}" title="${on ? `Unpin&#10;This ${a.kind === 'chat' ? 'chat' : 'terminal'} no longer stays at the top of the list.` : `Pin&#10;Keeps this ${a.kind === 'chat' ? 'chat' : 'terminal'} at the top of the list.`}" aria-label="${on ? 'unpin' : 'pin'}">${ICONS.pin}</button>`;
}

const REPORT_TIP = { on: "Notify me: on\nA notification each time this chat is ready, while you aren't looking at it. Click to stop it.", off: "Notify me: off\nA notification each time this chat is ready, while you aren't looking at it. Click to turn it on." };
function reportBtn(a: Agent, cls = '') {
  if (a.kind !== 'chat' || a.status === 'ended') return '';
  const tip = a.report ? REPORT_TIP.on : REPORT_TIP.off;
  return `<button class="rp-d ${cls}${a.report ? ' on' : ''}" data-dk-report="${esc(a.id)}" title="${esc(tip)}" aria-label="notify me" aria-pressed="${!!a.report}">${ICONS.bell}</button>`;
}
export async function reportMenu(a: Agent, over: HTMLElement | null) {
  try {
    const res = await api('POST', '/api/chats/report', { chat: a.id, on: !a.report }, a.pid ?? S.pid);
    a.report = res.report;
    tell(over, { title: res.report ? 'Notifying you' : 'No longer notifying you', ms: 2000, ok: true });
  } catch (e) {
    showErr(e);
  }
}
export type HeadCan = HeadOpts & { orch?: boolean; spot?: string; mark?: boolean; pin?: boolean; set?: boolean; setTip?: string; tab?: boolean; bench?: boolean; close?: boolean | 'menu'; closeTip?: string; closeKey?: string; done?: boolean; info?: string; where?: string; tools?: string };
export const headPlace = (c: HeadCan) => c.place || (c.where?.toLowerCase() === 'orchestration' ? 'oc' : 'win');
export function agentHead(a: Agent, c: HeadCan) {
  const place = headPlace(c), o = { ...c, place }, chat = a.kind === 'chat', on = (k: string) => headOn(k, o), where = c.where || 'window';
  const done = c.done !== false && a.status === 'done' && on('deck:doneBadge') ? `<span class="dk-done">${doneInner(a, 'data-dk-down')}</span>` : '';
  const mark = c.mark ? offBtn(markBtn(a), on('deck:markBtn'), 'mark…') + (!on('deck:markBtn') && on('deck:markShow') ? markSign(a) : '') : '';
  const report = chat ? offBtn(reportBtn(a), on('deck:reportBtn'), a.report ? 'notifying you' : 'notify me') : '';
  const note = chat ? offBtn(noteBtn(a), on('deck:noteBtn'), a.note ? 'note' : 'add a note') + (!on('deck:noteBtn') && on('deck:noteShow') ? noteSign(a) : '') : '';
  const pin = c.pin ? offBtn(pinOf(a), on('deck:pinBtn')) : '';
  const bench = c.bench !== false ? offBtn(`<button data-dk-bench title="Bench&#10;Takes the ${chat ? 'chat' : 'terminal'} out of the ${where}. It keeps running under Benched in the list." data-tip-keys="benchKey:bench" aria-label="bench">${ICONS.bench}</button>`, on('deck:benchBtn')) : '';
  const set = c.set && chat ? offBtn(`<button data-dk-set title="${esc(c.setTip || 'Move to\nMoves the chat to another set, or to a tab in the editor.')}" aria-label="move to…">${icon('move')}</button>`, on('deck:setBtn')) : '';
  const orch = c.orch && chat ? offBtn(`<button data-dk-orch title="${esc(c.where === 'tab' ? ORCH_TIP.replace('this set', 'this tab') : ORCH_TIP)}" aria-label="move to Orchestration">${gem('orch')}</button>`, on('deck:orchBtn')) : '';
  const tab = c.tab ? offBtn(`<button data-dk-tab title="Move to the editor&#10;Makes this ${chat ? 'chat' : 'terminal'} a tab in the editor." aria-label="move to the Editor">⤢</button>`, on('deck:tabBtn')) : '';
  const xTip = c.closeTip || (chat ? 'Close\nEnds this chat. A busy one asks first.' : 'Close\nStops the terminal and what runs in it.');
  const x = c.close === false ? '' : `<button data-dk-out title="${esc(xTip)}"${chat ? ' data-tip-keys="=shift+click:close without asking"' : ''} aria-label="close"${c.close === 'menu' ? ' hidden' : ''}>×</button>`;
  const close = c.close === 'menu' ? x : offBtn(x, on(c.closeKey || 'deck:closeBtn'), chat ? 'close the chat' : 'close');
  return `${done}${idHead(a, o)}${c.info || ''}<span class="grow"></span>${chat ? toolsSlot(place, c.tools, c.all) : fmore()}${c.spot || ''}${mark}${report}${note}${pin}${bench}${set}${orch}${tab}${close}`;
}

type HeadEl = HTMLElement & { _fdMenu?: Element | null; sig?: string };
export function paintHead(hd: HeadEl, html: string, o: { bar?: HTMLElement | null; menu?: Element | null; home?: () => void }) {
  const fresh = hd.dataset.sig !== html;
  if (fresh) {
    o.home?.();
    hd.innerHTML = html;
    hd.dataset.sig = html;
  }
  const slot = hd.querySelector('.dk-tools');
  if (slot && o.bar && o.bar.parentNode !== slot) slot.append(o.bar);
  const menu = o.menu || null;
  if (fresh || hd._fdMenu !== menu) {
    hd._fdMenu = menu;
    foldHead(hd);
  }
}

export type HeadActs = { agent: () => Agent | null | undefined; out?: (b: HTMLElement, sure?: boolean) => unknown; bench?: (b: HTMLElement) => unknown; set?: (b: HTMLElement) => unknown; orch?: (b: HTMLElement) => unknown; tab?: (b: HTMLElement) => unknown; spot?: (b: HTMLElement) => unknown; pin?: (a: Agent) => unknown; mark?: (a: Agent, x: number, y: number) => unknown; down?: (b: HTMLElement) => unknown };
export const HEAD_SEL = '[data-dk-spot],[data-dk-out],[data-dk-bench],[data-dk-orch],[data-dk-tab],[data-dk-set],[data-dk-pin],[data-dk-mark],[data-dk-report],[data-dk-down]';
export function headClick(b: HTMLElement, acts: HeadActs, e?: MouseEvent) {
  const d = b.dataset, cell = b.closest('.dk-cell, .qawin, .oc-main') || document;
  if (b.closest('.ch-menu')) cell.querySelector<HTMLElement>('.ch-more[aria-expanded="true"]')?.click();
  if (d.dkDown != null) return acts.down ? acts.down(b) : cell.querySelector<HTMLElement>('.ch-jump')?.click();
  if (d.dkOut != null) return acts.out?.(b, !!e?.shiftKey);
  if (d.dkSpot != null) return acts.spot?.(b);
  if (d.dkBench != null) return acts.bench?.(anchorOf(b));
  if (d.dkOrch != null) return acts.orch?.(anchorOf(b));
  if (d.dkTab != null) return acts.tab?.(b);
  if (d.dkSet != null) return acts.set?.(anchorOf(b));
  const a = acts.agent();
  if (!a) return;
  if (d.dkPin) return acts.pin?.(a);
  if (d.dkReport) return reportMenu(a, anchorOf(b));
  if (d.dkMark) {
    const r = anchorOf(b).getBoundingClientRect();
    return acts.mark?.(a, r.left, r.bottom + 4);
  }
}
