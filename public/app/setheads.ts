import { agentHead, spotHtml } from './chathead.ts';
import type { HeadCan } from './chathead.ts';
import { foldIcon, foldName, foldOrder, headIcon, headKeys } from './fold.ts';
import { folderBtn, termBtn } from '../orch/orch.ts';
import { qtHead } from '../terminal/qterm.ts';
import { ueHead } from '../ue/ue.ts';
import { qaPlus } from '../chat/qagent.ts';
import { ORCH_CAN } from './modes.ts';
import { TYPES } from './tabs.ts';
import { chatHead, chatMenu, chatTools, doneInner, markSign, noteSign, swapRow } from '../base/agentrow.ts';
import { barOrder, fwHead, maxBtn, setBarOrder, sizeButtons, sortable } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { BTN_OF, pillAt, PLACES, pref, PREFS, setPillAt, setPref } from '../base/prefs.ts';
import { esc, setSave, store } from '../base/util.ts';
import type { Agent } from '../base/stream.ts';
import { addPart, bigPic, box, isOn, mark, pic, rowHtml, subh, tipOf } from './setstd.ts';
import type { At, Kit, Row } from './setstd.ts';

export const WIN2_LEAD = 'What shows in the bar of Window 2, Window 3 and so on. Click a switch, or a button in a picture, to hide or show it.';
export const QUICK_LEAD = 'What shows in the bar of the small windows. Click a switch, or a button in a picture, to hide or show it.';
const NAME = 'Claude Agent';
let kit: Kit | null = null;

const desk = () => !!window.amethyst?.desktop;
const shownKey = (k: string) => desk() || !PREFS[k].desktop;
const atOf = (k: string, ps = PREFS[k].places || ['win']): At[] => ps.map((place) => ({ place, key: k }));
const SMALL = ['quick', 'qagent', 'scratch', 'sketch', 'inbox', 'qterm', 'pwsh', 'hitch', 'activity', 'review', 'ue'];
const smallPlaces = () => SMALL.filter((p) => p !== 'ue' || pref('ue:on'));
const one = (k: string): Row => ({ id: k, key: k, at: atOf(k) });

const btnRows = (): Row[] => [
  ...headKeys(barOrder('head')).map(one),
  { id: 'orch:folderBtn', key: 'orch:folderBtn', at: [{ place: 'oc', key: 'orch:folderBtn' }] },
  { id: 'orch:termBtn', key: 'orch:termBtn', at: [{ place: 'oc', key: 'orch:termBtn' }] },
  { id: 'close', key: 'deck:closeBtn', at: [{ place: 'win', key: 'deck:closeBtn' }, { place: 'oc', key: 'orch:closeBtn' }] },
];
const partRows = (): Row[] => ['deck:code', 'deck:title', 'deck:model'].map(one);
const doneRow = (): Row => one('deck:doneBadge');
const PILL_IDS = ['history', 'signin', 'clear', 'swap'];
const pillWords = () => PREFS['chpill:off'];
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
function pillChoices(id: string): [string, string, string][] {
  const e = pillWords(), all = e.picks!;
  return all.filter(([v]) => v !== 'hid' || id === 'swap').map(([v, l, t]) => [v, l, v === 'menu' && e.offWhen && !pref(e.offWhen[0]) ? e.offWhen[1] : t]);
}
function pillRow(id: string): Row {
  const name = pillWords().each![id].label, words = (v: string) => pillChoices(id).find((c) => c[0] === v)?.[1] || '';
  const at = (place: string, other: string): At => ({
    place, key: 'chpill:off', id,
    on: () => pillAt(id) === place,
    tip: () => (pillAt(id) === place ? `${name}: ${lower(words(place))}\nClick to make it a ${lower(words(other))}.` : `${name}: ${lower(words(pillAt(id)))}\nClick to make it a ${lower(words(place))}.`),
  });
  const def = pillWords().def.includes(id) ? 'menu' : 'head';
  return { id: `chpill:off:${id}`, key: 'chpill:off', name, at: [at('head', 'menu'), at('menu', 'head')], pick: { get: () => pillAt(id), set: (v) => setPillAt(id, v), def, choices: () => pillChoices(id), reset: id === 'swap' ? 'i:chpill:off|swap i:chat:off|switch' : `i:chpill:off|${id}` } };
}
const pillRows = (): Row[] => PILL_IDS.map(pillRow);
const smallRows = (): Row[] => [
  { id: 'qagent:new', key: 'qagent:new', at: [{ place: 'qagent', key: 'qagent:new' }] },
  { id: 'winSize:small', key: 'winSize', at: atOf('winSize', smallPlaces()) },
];
const win2Rows = (): Row[] => [
  ...(shownKey('win:every') ? [{ id: 'win:every', key: 'win:every', at: [{ place: 'win2', key: 'win:every' }] }] : []),
  { id: 'winSize:win2', key: 'winSize', at: atOf('winSize', ['win2']) },
];

const sample = (status = 'idle') => ({ id: 'sample-992', kind: 'chat', program: 'claude', status, title: 'Fix the login page', model: 'Opus 5.5 · Medium', session: 'sample-992', at: Date.now() - 120000, report: false }) as unknown as Agent;
const tools = () => chatTools(NAME, { rev: true, subs: '2' });
const WIN_CAN: HeadCan = { mark: true, pin: true, set: true, tab: true, orch: true, place: 'win' };
type Draw = { all?: boolean; show?: string[]; status?: string; done?: boolean; free?: boolean; bench?: boolean };
export function winHead(o: Draw = {}) {
  const spot = o.all || o.show?.includes('deck:spotBtn') || pref('deck:spotBtn') ? spotHtml(false, 2, false) : '';
  return `<header class="dk-ch">${agentHead(sample(o.status), { ...WIN_CAN, bench: !!o.bench, orch: !o.bench, all: o.all, show: o.show, free: o.free, spot, tools: tools(), done: o.done })}</header>`;
}
export function ocHead(o: Draw = {}) {
  const want = (k: string) => o.all || o.show?.includes(k) || !!pref(k);
  return `<header class="dk-ch oc-bar">${agentHead(sample(o.status), { ...ORCH_CAN, place: 'oc', all: o.all, show: o.show, close: want('orch:closeBtn'), info: '<span class="oc-info"></span>', tools: tools() })}${want('orch:folderBtn') ? folderBtn(false) : ''}${want('orch:termBtn') ? termBtn(false) : ''}</header>`;
}
const qaBar = (show: string[] = []) => {
  const t = document.createElement('template');
  t.innerHTML = chatHead(NAME, tools());
  if (pref('deck:model', 'qagent') || show.includes('deck:model')) t.content.querySelector('.ch-model')!.textContent = sample().model || '';
  return t.innerHTML;
};
const winName = (p: string) => (p === 'win2' ? 'Window 2' : p === 'qagent' ? 'Quick Agent' : p === 'quick' ? 'Quick Window' : p === 'activity' ? 'Agent Activity' : p === 'review' ? 'Review' : TYPES[p]?.label || p);
function winBar(p: string) {
  const real = document.getElementById('winbar');
  if (!real) return '';
  const bar = real.cloneNode(true) as HTMLElement;
  for (const n of [bar, ...bar.querySelectorAll('[id]')]) n.removeAttribute('id');
  bar.hidden = false;
  bar.querySelector('.xw-n')!.textContent = winName(p);
  const acts = bar.querySelector('.xw-acts')!, every = acts.querySelector<HTMLElement>('.xw-every'), max = acts.querySelector<HTMLElement>('[aria-label="maximize"]'), szs = acts.querySelector<HTMLElement>('.szs');
  if (every) every.hidden = p !== 'win2' || !pref('win:every');
  if (szs) szs.innerHTML = sizeButtons(false);
  if (max) max.hidden = p !== 'win2' && !pref('winSize', p);
  if (p === 'qagent') {
    acts.insertAdjacentHTML('afterbegin', qaPlus());
    (acts.firstElementChild as HTMLElement).hidden = !pref('qagent:new');
  }
  return bar.outerHTML;
}
const fwBar = (html: string, p: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  const szs = t.content.querySelector('.szs'), xs = t.content.querySelectorAll(':scope > .fw-head > button.x');
  if (szs) szs.innerHTML = sizeButtons(false);
  if (pref('winSize', p)) xs[xs.length - 1]?.insertAdjacentHTML('beforebegin', maxBtn());
  return t.innerHTML;
};
const barOf = (p: string) => `<div class="wbar hr-win">${p === 'qterm' || p === 'pwsh' ? fwBar(qtHead(p === 'pwsh' ? 'pwsh' : 'term', true), p) : p === 'hitch' ? fwBar(fwHead('freeze log'), p) : p === 'ue' ? fwBar(ueHead(true), p) : winBar(p)}</div>`;

const SEL: Record<string, string> = { 'deck:code': '.dk-id .dk-code', 'deck:title': '.dk-title', 'deck:doneBadge': '.dk-done', 'orch:termBtn': '[data-oc-term]', 'orch:folderBtn': '[data-oc-folder]', 'orch:closeBtn': '[data-dk-out]', 'deck:closeBtn': '[data-dk-out]', 'deck:more': '.ch-more', winSize: '.szs', 'qagent:new': '[aria-label="new chat"]', 'win:every': '.xw-every' };
const selOf = (k: string, p: string, id = '') => (k === 'chpill:off' ? (p === 'menu' ? `.ch-menu > [data-ch="${id}"]` : `.ch-pill[data-ch="${id}"]`) : k === 'deck:model' ? (p === 'qagent' ? '.ch-model' : '.dk-who') : SEL[k] || BTN_OF[k]);
const sel = (a: At) => selOf(a.key, a.place, a.id);
const mk = (html: string, p: string, keys: string[], ring = '', all = false) => {
  const ats = keys.map((key) => ({ key, place: p })), r = ats.find((a) => a.key === ring) || null;
  const t = document.createElement('template');
  t.innerHTML = mark(html, ats, sel, r, all);
  const who = t.content.querySelector<HTMLElement>('.dk-who.hr-keep');
  if (who && !who.textContent) who.textContent = sample().model || '';
  return t.innerHTML;
};
const menuPic = (a: At) => pic(mark(chatMenu(swapRow()).replace(' hidden>', '>'), [a], sel, a), a.place, ' hr-ex hr-menu');

function doneEx(p: string) {
  const head = p === 'oc' ? ocHead({ status: 'done' }) : winHead({ status: 'done', done: false });
  const a = { key: 'deck:doneBadge', place: p };
  return pic(`<div class="hr-chat hr-cell">${mk(head, p, [])}<div class="hr-log"><i></i><i></i><i></i></div><div class="hr-badge"><span class="dk-done hr-keep hr-ring${isOn(a) ? '' : ' hr-off'}" data-hr-at="deck:doneBadge|${p}" title="${esc(tipOf(a))}">${doneInner(sample('done'), 'tabindex="-1"')}</span></div><div class="hr-msg">Message…</div></div>`, p, ' hr-ex');
}
function example(a: At) {
  const { key: k, place: p } = a;
  if (k === 'deck:doneBadge') return doneEx(p);
  if (k === 'chpill:off') return a.place === 'menu' ? menuPic(a) : pic(mark(winHead(), [a], sel, a), p, ' hr-ex hr-cell');
  if (p === 'win') return pic(mk(winHead({ show: [k], bench: k === 'deck:benchBtn' }), p, [k], k), p, ' hr-ex hr-cell');
  if (p === 'oc') return pic(mk(ocHead({ show: [k] }), p, [k], k), p, ' hr-ex hr-cell');
  if (p === 'qagent' && k !== 'qagent:new' && k !== 'winSize') return pic(mk(qaBar([k]), p, [k], k), p, ' hr-ex hr-qa');
  const html = barOf(p), t = document.createElement('template');
  t.innerHTML = html;
  const el = t.content.querySelector<HTMLElement>(selOf(k, p));
  if (el) el.hidden = false;
  return pic(mk(t.innerHTML, p, [k], k), p, ' hr-ex');
}
const extra = (a: At) => (a.key === 'deck:benchBtn' ? `<span class="hr-here hr-more">A project's chats have no bench (they go to Orchestration), so this is a workspace's chat window; terminal windows have it too.</span>` : '');

let looks: Record<string, string> = {};
function pillLook(id: string, v: string) {
  const t = document.createElement('template');
  t.innerHTML = v === 'head' ? winHead() : chatMenu(swapRow());
  const el = t.content.querySelector<HTMLElement>(selOf('chpill:off', v === 'head' ? 'head' : 'menu', id));
  if (!el) return '';
  el.classList.add('hr-keep');
  el.classList.toggle('hr-off', v === 'hid');
  return v === 'head' ? `<span class="dk-ch hr-mini"><span class="dk-tools">${el.outerHTML}</span></span>` : `<span class="ch-menu hr-mini3">${el.outerHTML}</span>`;
}
function lookOf(r: Row) {
  const lk = r.pick ? `${r.id}|${r.pick.get()}` : r.id;
  if (looks[lk] != null) return looks[lk];
  const k = r.key;
  let html = '';
  if (r.pick) html = pillLook(r.at[0].id!, r.pick.get());
  else if (k === 'deck:markShow') html = `<span class="dk-ch hr-mini">${markSign(sample(), 1)}</span>`;
  else if (k === 'deck:noteShow') html = `<span class="dk-ch hr-mini">${noteSign({ ...sample(), note: 'Check the login form on mobile' } as Agent)}</span>`;
  else if (k === 'deck:doneBadge') html = `<span class="dk-done hr-done">${doneInner(sample('done'), 'tabindex="-1"')}</span>`;
  else if (k === 'winSize') html = `<span class="wbar hr-mini2"><span class="xw-acts"><span class="szs">${sizeButtons(false)}</span></span></span>`;
  else if (k === 'qagent:new' || k === 'win:every') {
    const t = document.createElement('template');
    t.innerHTML = barOf(k === 'qagent:new' ? 'qagent' : 'win2');
    const el = t.content.querySelector<HTMLElement>(selOf(k, k === 'qagent:new' ? 'qagent' : 'win2'));
    if (el) el.hidden = false;
    html = `<span class="wbar hr-mini2"><span class="xw-acts">${el?.outerHTML || ''}</span></span>`;
  } else {
    const t = document.createElement('template');
    t.innerHTML = k.startsWith('orch:') ? ocHead({ all: true }) : winHead({ all: true, free: true, bench: k === 'deck:benchBtn' });
    const el = t.content.querySelector<HTMLElement>(selOf(k, 'win'));
    if (el) {
      el.hidden = false;
      el.classList.add('hr-keep');
      if (k === 'deck:model' && !el.textContent) el.textContent = sample().model || '';
      html = `<span class="dk-ch hr-mini${k.startsWith('orch:') ? ' oc-bar' : ''}">${el.closest('.dk-tools') ? `<span class="dk-tools">${el.outerHTML}</span>` : el.outerHTML}</span>`;
    }
  }
  html = html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
  return (looks[lk] = html);
}

const headRows = () => [...btnRows(), ...partRows(), ...pillRows(), doneRow()];
addPart({ rows: headRows, sel, look: lookOf, example, extra, home: 'show/chat' });
addPart({ rows: smallRows, sel, look: lookOf, example, extra, home: 'show/quick' });
addPart({ rows: win2Rows, sel, look: lookOf, example, extra, home: 'show/win2' });
function headPic() {
  const keys = [...btnRows(), ...partRows()].flatMap((r) => r.at).filter((a) => a.place === 'win').map((a) => a.key);
  return bigPic(pic(mk(winHead({ all: true }), 'win', keys, '', true), 'win', ' hr-cell'), "A chat window's header, as it looks in the app. Point at a button to find its row. Click anything to hide or show it everywhere, like its row's switch; open its row to choose per place. Dashed and struck through: hidden in chat windows.");
}

const orderKeys = () => headKeys(barOrder('head')).filter((k) => k !== 'deck:markShow' && k !== 'deck:noteShow');
const FOLD_KEY: Record<string, string> = { spot: 'deck:spotBtn', mark: 'deck:markBtn', report: 'deck:reportBtn', note: 'deck:noteBtn', pin: 'deck:pinBtn', pills: 'subagents:chat', bench: 'deck:benchBtn', set: 'deck:setBtn', orch: 'deck:orchBtn', tab: 'deck:tabBtn' };
const foldLabel = (k: string) => (k === 'pills' ? 'Agent activity and ± review buttons' : PREFS[FOLD_KEY[k]]?.label || foldName(k));
const slot = (attr: string, k: string, i: number, name: string, ic: string, hid: boolean) =>
  `<span class="hr-slot" ${attr}="${esc(k)}"><span class="hr-n">${i + 1}</span><button class="hr-ob${hid ? ' off' : ''}" title="${esc(`${name}\nDrag to move it in the header.${hid ? ' It is hidden in a chat window now.' : ''}`)}" aria-label="${esc(name)}">${ic}</button></span>`;
const headChanged = () => !!store.get('bar:order', {}).head;
function orderBox() {
  const ord = orderKeys().map((k, i) => slot('data-ho', k, i, PREFS[k].label, headIcon(k, icon), !pref(k, 'win'))).join('') + `<span class="hr-slot hr-x"><span class="hr-n"></span><button class="hr-ob" tabindex="-1" title="Close button&#10;Always at the right end; it can't move." aria-label="Close button">×</button></span>`;
  const fold = foldOrder().map((k, i) => slot('data-fo', k, i, foldLabel(k), foldIcon(k, icon), !pref(FOLD_KEY[k], 'win'))).join('');
  const line = (title: string, d: string, l: string, strip: string, r: string, rs: string, id: string) => `<div class="set-row hr-orow" data-row="${id}"><div class="sr-t"><span class="lbl">${esc(title)}</span><span class="sr-d">${esc(d)}</span><div class="hr-oline"><div class="hr-ends"><span class="hr-end l">${esc(l)}</span><span class="hr-end r">${esc(r)}</span></div><span class="hr-ord">${strip}</span></div><div class="hr-otip" aria-live="polite"></div></div>${rs}<span class="set-opts"></span></div>`;
  return `<div class="box set-grp hr-grp"><span class="bt">Order of the buttons</span>` +
    line('Where each button sits in the chat header', 'The chat header shows them in this order, from left to right. Drag a button to move it: a dashed spot shows where it will land, and letting go outside the row puts it back. × always stays at the right end.', 'left end', ord, 'right end, then ×', `<button class="sr-rs${headChanged() ? ' on' : ''}" data-ho-reset aria-label="back to the default order"${headChanged() ? '' : ' tabindex="-1"'}>↺</button>`, 'bar:order:head') +
    line("Which buttons move into the ⋯ menu first when a chat window is narrow", "When there's no room for every button, they move into the ⋯ menu one by one, starting with number 1. They come back when the window is wider. Drag to change which goes first.", 'goes into ⋯ first', fold, 'goes into ⋯ last', kit!.rsBtn('p:deck:foldOrder', JSON.stringify(pref('deck:foldOrder')) !== JSON.stringify(PREFS['deck:foldOrder'].def)), 'deck:foldOrder') +
    '</div>';
}

export function chatHeadHtml() {
  looks = {};
  return box('head', 'Header', headPic() + btnRows().map(rowHtml).join('') + subh('Also in the header') + partRows().map(rowHtml).join('') + subh('In the header or the ⋯ menu') + pillRows().map(rowHtml).join('') + subh('On the chat, above its message box') + rowHtml(doneRow()), 'The bar at the top of every chat: its code, title and model, then its buttons.') +
    orderBox();
}
const QUICK_CAP = `Small windows that each open on their own, with a bar: the name, size buttons, minimize and ×. The Quick Window opens a file you pick "open in the Quick Window" for, in its right-click menu. The Quick Agent, the scratch pad, the sketch board, the inbox, the quick terminal and quick PowerShell open from their buttons in the rail. The freeze log opens from its button in the dock. Agent activity and Review open from their buttons in a chat's header. The Unreal build window opens from its button in the rail, while Unreal Engine 5 support is on.`;
export function quickHtml() {
  looks = {};
  return box('small', 'Quick windows', smallRows().map(rowHtml).join(''), QUICK_CAP);
}
export function win2Html() {
  looks = {};
  return box('win2', 'Window 2, 3…', win2Rows().map(rowHtml).join(''), `${PLACES.win2[2][0].toUpperCase()}${PLACES.win2[2].slice(1)}.`);
}

const orderName = (s: HTMLElement) => (s.dataset.ho ? PREFS[s.dataset.ho].label : foldLabel(s.dataset.fo!));
function moved(el: HTMLElement, all: HTMLElement[], state: 'in' | 'out' | 'end') {
  all.forEach((s, i) => (s.querySelector('.hr-n')!.textContent = String(i + 1)));
  const tip = el.closest('.hr-orow')?.querySelector('.hr-otip');
  if (!tip) return;
  const n = all.indexOf(el) + 1, name = orderName(el), head = !!el.dataset.ho;
  tip.textContent = state === 'end' ? '' : state === 'out' ? `Let go here and ${name} goes back to number ${n}.` : head ? `${name} will be number ${n} from the left${n === all.length ? ', just before ×' : ''}.` : `${name} will be number ${n}: ${n === 1 ? 'the first to go into ⋯' : n === all.length ? 'the last to go into ⋯' : `number ${n} to go into ⋯`}.`;
}
export function headsInit(root: HTMLElement, k: Kit) {
  kit = k;
  sortable(root, {
    item: '.hr-slot[data-ho]',
    line: true,
    moved,
    drop(all) {
      setBarOrder('head', all.map((x) => x.dataset.ho));
      setSave(`the chat header: ${all.map((x) => PREFS[x.dataset.ho].label).join(', ')}, then ×`);
      k.redraw();
    },
  });
  sortable(root, {
    item: '.hr-slot[data-fo]',
    line: true,
    moved,
    drop(all) {
      setPref('deck:foldOrder', all.map((x) => x.dataset.fo));
      setSave(`goes into ⋯ first: ${all.map((x) => foldLabel(x.dataset.fo)).join(', ')}`);
      k.redraw();
    },
  });
}
