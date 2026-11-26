import { is, show } from '../base/binds.ts';
import { icon } from '../base/icon.ts';
import { agentMenu, launchAgent, newHint } from '../base/agentmenu.ts';
import { openChatMenu } from './openchat.ts';
import { ask, bands, barMenu, buttonMenu, chip, colorTray, ICONS, holdFocus, keyChip, markName, menuHead, placeSubAgain, popMenu, subMenu, topRow } from '../base/controls.ts';
import { agentPin, api, atWs, isPinned, levelKey, markNo, S, wsColor } from '../base/model.ts';
import { page } from '../base/page.ts';
import { chatOn, chatsOn, isOff, termOn, onPref, pref, PREFS, setOff, setPref } from '../base/prefs.ts';
import { agents, chatOfSession, onAgents, started } from '../base/stream.ts';
import { draftOf, freeSet, owner, place } from '../base/place.ts';
import { DECLINED, record } from '../base/undo.ts';
import { $, agentName, AM, amElse, amKey, chatProgram, CHATS, chatTabOf, esc, inText, quietly, setSave, showErr, sinceShort, store, track, uid } from '../base/util.ts';
import { busyNow, gem, modeGem, workCorner, workGem } from '../base/kinds.ts';
import { notify, offTell, tell } from '../base/notify.ts';
import { answers } from '../base/answer.ts';
import { openAway, shareCells } from '../base/windows.ts';
import { col } from '../base/theme.ts';
import { every } from '../base/life.ts';
import { addClosed, askEnd, clearedOf, codeOf, crystalOf, groupOf, markOf, onCleared, providerOf, spark, stillAt, titleOf, workVerb } from '../base/agentlook.ts';
import { doneInner } from '../base/agentrow.ts';
import { onSize } from '../base/measure.ts';
import { anchorOf, SPOT_IC } from '../app/fold.ts';
import { agentHead, HEAD_BTNS, HEAD_SEL, headClick, offBtn, ORCH_TIP, paintHead, spotHtml, toolsSlot } from '../app/chathead.ts';
import type { HeadCan } from '../app/chathead.ts';
import { agentRow, fileDrag, headRow, markBtn, markFly, markMenu, markPick, markSign, renameAsk, renameItem, NOTE_IC, noteBtn, subClear } from '../base/agentrow.ts';
import { createChatList, LIST_W, listMenu, rowListBands, rowListPick, snapDrag } from '../app/chatlist.ts';
import type { Row } from '../base/agentrow.ts';
import { folderHost, moveItem, moveSub } from '../base/chatfolders.ts';
import type { Group } from '../base/chatfolders.ts';
import { canFile, onFolders } from '../base/folders.ts';
import type { Agent } from '../base/stream.ts';
import type { SubSummary, Tab } from '../base/types.ts';
import { runTime } from '../base/words.ts';

type Sub = SubSummary;
type SetEntry = { id: string; label?: string; color?: string; mark?: string; [k: string]: unknown };
type LBox = [number, number, number, number, unknown?, unknown?];
type SetLayout = { id: string; color?: string; on?: boolean; boxes?: LBox[] };
type CellView = { el: HTMLElement; focus(): void; land?: (wait?: number) => unknown; detach(): void; stop(): void; home?: () => void; bar?: HTMLElement; draft?: () => string; clear?: () => unknown; take?: (e: DragEvent) => unknown; attach?: (rel: string) => unknown; key?: (e: KeyboardEvent) => unknown; find?: () => unknown };
type Earlier = { session: string; program?: string; title?: string; pid: string };
export type MakeChat<V> = (tab: Tab, o: { saved: () => void; filesChanged: () => void; openFile: (path: string) => unknown; titled: (title: string | null) => void; openBeside: (s: Earlier) => unknown }) => V;
export type MakeTerm<V> = (agent: { id: string | null }) => V;
type Cell = { id: string | null; view: CellView; tab?: Tab & { pid?: string }; opened?: boolean };
type Closed = { session: string; title: string; pid: string; program?: string; at: number };
export const closedInner = (rows: { session: string; title: string; at: number }[], open: boolean) => `${open ? `<div class="dk-cl">${rows.map((c) => `<div class="dk-cr" role="button" tabindex="0" data-dk-reopen="${esc(c.session)}"><b>${esc(c.title)}</b><span class="dk-when" data-at="${c.at}">${sinceShort(c.at)}</span><button class="dk-cx" data-dk-forget="${esc(c.session)}" aria-label="forget it">×</button></div>`).join('')}</div>` : ''}<button class="dk-cb" data-dk-closed aria-expanded="${open}"><i>${ICONS.archive}</i><b>Closed</b><span>${rows.length}</span></button>`;
type Back = { i: number; id: string | null; orch?: boolean; opened?: boolean; ended?: boolean; session?: string; draft?: string; pid: string; program?: string; at?: number };

const CELL = { w: 280 }, GAP = 6;
const sideZone = (w: number) => Math.max(80, w / 10);
const GROUPS = [['asks', 'Needs you'], ['working', 'Working'], ['done', 'Done'], ['bench', 'Benched']];
const HEAD_IC: Record<string, string> = { asks: 'bell', done: 'check', bench: 'bench' };

const KIND: Record<string, { one: string; many: string; mark: string }> = {
  chat: { one: 'chat', many: 'chats', mark: 'ai' },
  term: { one: 'terminal', many: 'terminals', mark: 'term' },
};
const orList = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w.at(-1)}` : w[0]);
const noneLine = (kind: string) => (kind === 'chat'
  ? `<b>+ new</b> starts a ${orList(chatsOn().map(([, n]) => n.replace(/ Agent$/, '')))} Agent chat.`
  : `<b>+ new</b> starts ${orList([['claude', 'claude'], ['codex', 'codex'], ['antigravity', 'agy'], ['cursor', 'agent'], ['copilot', 'copilot'], ['grok', 'grok'], ['gemini', 'gemini'], ['shell', 'a shell']].filter(([id]) => termOn(id)).map(([, w]) => w))}.`);


const gemStyle = (id: string) => (id ? ` style="--gem-c:${crystalOf(id).color}"` : '');
for (const k of ['rail:hideBtn', 'rail:showBtn']) onPref(k, () => document.querySelectorAll('.deck').forEach((d: any) => d.railBtns?.()));
const HIDE_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M10 3v10M5.5 6.2 7.3 8l-1.8 1.8"/></svg>';
const SHOW_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4 6 8l4 4"/></svg>';
const SPOT_W: Record<string, [number, number]> = { q1: [1, 4], t1: [1, 3], h: [1, 2], t2: [2, 3], q3: [3, 4] };
export const HIDE_BTN = `<button type="button" class="dk-hide dk-rv" data-dk-hide aria-label="hide the list">${HIDE_IC}</button>`;
export const SHOW_BTN = `<button type="button" class="dk-show" data-dk-show aria-label="show the list">${SHOW_IC}</button>`;
export const TERM_NEW = `<button class="primary dk-plus" data-dk-new title="New terminal&#10;A terminal with claude, codex, gemini or a shell." aria-label="new"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg></button>`;
const prefRow = (k: string, attrs: string, ic: string, key = '') => topRow(!!pref(k), `${attrs} title="${esc(PREFS[k].label)}&#10;${esc(PREFS[k].desc || '')}"`, ic, esc(PREFS[k].label), key);
const railButtons = () => prefRow('rail:hideBtn', 'data-rb="rail:hideBtn"', icon('eyeOff'), keyChip('railKey')) + prefRow('rail:showBtn', 'data-rb="rail:showBtn"', icon('eye'));
const closedRow = () => prefRow('closed:on', 'data-cl', ICONS.archive);
listMenu('deck', '.deck[data-kind="chat"] > .dk-rail', 'decklist', {
  opts: () => closedRow() + '<div class="ml">buttons</div>' + railButtons(),
  pick: (b) => (b.dataset.rb ? setPref(b.dataset.rb, !pref(b.dataset.rb)) : b.dataset.cl != null && setPref('closed:on', !pref('closed:on'))),
});
const LAYOUTS: [string, string, string, string][] = [
  ['stack', 'the others stacked beside it', '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="6" height="10" rx="1"/><path d="M10.5 3h3v4.5h-3zM10.5 8.5h3V13h-3z"/></svg>', 'Puts the other chats one above another beside the spotlight.'],
  ['side', 'the others side by side', '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="6" height="10" rx="1"/><path d="M10.5 3H12v10h-1.5zM12.5 3H14v10h-1.5z"/></svg>', 'Puts the other chats in columns beside the spotlight, when there is room.'],
];
buttonMenu('.dk-spotb', {
  name: 'spotlight',
  icon: () => SPOT_IC,
  rows: (el) => `<button class="mi" data-bm="spot"${(el as HTMLButtonElement).disabled ? ' disabled' : ''} title="${esc(el.title)}"><i class="tb-ic">${SPOT_IC}</i><span class="mi-n">${el.classList.contains('on') ? 'out of the spotlight' : 'put in the spotlight'}</span>${chip('double-click')}</button>`,
  band: (el) => {
    const lay = el.closest<HTMLElement>('.dk-grid')?.dataset.lay || 'stack';
    return ['layout', LAYOUTS.map(([k, label, ic, tip]) => topRow(lay === k, `data-bm="${k}" title="${esc(label)}&#10;${esc(tip)}"`, ic, label)).join('')];
  },
  pick: (b, el) => (b.dataset.bm === 'spot' ? el.click() : el.dispatchEvent(new CustomEvent('spotlay', { detail: b.dataset.bm, bubbles: true }))),
});
const keyOf = (kind: string, set: string | null = '') => `deck:${kind}:${levelKey()}${amKey}${set ? ':' + set : ''}`;

const many: (kind?: string) => boolean = () => !atWs();
const setsKey = (kind: string) => `deck:sets:${kind}:${levelKey()}${amKey}`;
export function sets(kind: string) {
  const s = many(kind) ? store.get(setsKey(kind), {}) : {};
  const list: SetEntry[] = Array.isArray(s.list) && s.list.length ? s.list : [{ id: '' }];
  return { list, on: list.some((x) => x.id === s.on) ? s.on : list[0].id };
}
export const setOn = (kind: string) => sets(kind).on;
const saveSets = (kind: string, list: SetEntry[], on: string) => store.set(setsKey(kind), { list, on });
export function showSet(kind: string, id: string) {
  const s = sets(kind);
  if (s.list.some((x) => x.id === id)) saveSets(kind, s.list, id);
}
export const nextSet = (kind: string) => {
  const { list, on } = sets(kind);
  if (list.length > 1) showSet(kind, list[(list.findIndex((x) => x.id === on) + 1) % list.length].id);
};
export function addSet(kind: string, show = true) {
  const s = sets(kind), id = uid(), color = slotted() ? nextColor(kind) : '';
  saveSets(kind, [...s.list, { id, ...(color && { color }) }], show ? id : s.on);
  return id;
}
export function putInSet(kind: string, id: string, set: string) {
  const s = store.get(keyOf(kind, set), {});
  let n = Number.isInteger(s.n) && s.n >= 1 ? s.n : 4;
  const cells = Array.from({ length: n }, (_, i) => (typeof s.cells?.[i] === 'string' ? s.cells[i] : null)), at = cells.indexOf(null);
  if (at >= 0) cells[at] = id;
  else cells[n++] = id;
  store.set(keyOf(kind, set), { ...s, n, cells });
  claim(kind, id, set);
  shareDeck();
}
export function swapInSet(kind: string, set: string, old: string, id: string, i: number) {
  const s = store.get(keyOf(kind, set), {});
  let n = Number.isInteger(s.n) && s.n >= 1 ? s.n : 4;
  const cells = Array.from({ length: n }, (_, j) => (typeof s.cells?.[j] === 'string' ? s.cells[j] : null));
  let at = cells.indexOf(old);
  if (at < 0) at = i >= 0 && i < n && !cells[i] ? i : cells.indexOf(null);
  if (at < 0) at = n++;
  cells[at] = id;
  store.set(keyOf(kind, set), { ...s, n, cells });
  claim(kind, id, set);
  shareDeck();
}
export function moveSet(kind: string, id: string, to: number) {
  const s = sets(kind), i = s.list.findIndex((x) => x.id === id);
  if (i < 0 || to === i || to < 0 || to >= s.list.length) return;
  s.list.splice(to, 0, ...s.list.splice(i, 1));
  saveSets(kind, s.list, s.on);
}
function renameSet(kind: string, id: string, name: string) {
  const s = sets(kind), label = name.trim();
  saveSets(kind, s.list.map((x) => (x.id === id ? { ...x, label } : x)), s.on);
  return label;
}
export function markSet(kind: string, id: string, patch: Record<string, unknown>) {
  const s = sets(kind);
  saveSets(kind, s.list.map((x) => {
    if (x.id !== id) return x;
    const y: SetEntry = { ...x };
    for (const [k, v] of Object.entries(patch)) v ? (y[k] = v) : delete y[k];
    return y;
  }), s.on);
}
export const SET_GROUPS = [['editor', 'editor'], ['chat', 'agents'], ['term', 'terminals'], ['research', 'research']];
const setOrder = () => ['', ...colorTray().slice(0, 7).map((c) => c.hex)];
export const setColors = (kind: string) => ({ order: setOrder(), same: false, one: colorTray()[0]?.hex || '', ...store.get('setColors', {})[kind] });
export const setSetColors = (kind: string, patch: Record<string, unknown>) => store.set('setColors', { ...store.get('setColors', {}), [kind]: { ...store.get('setColors', {})[kind], ...patch } });
export const resetSetColors = (kind: string) => store.set('setColors', { ...store.get('setColors', {}), [kind]: undefined });
export const setColorsChanged = (kind: string) => setColors(kind).same || setColors(kind).order.join() !== setOrder().join();
const slotted = () => !atWs();
export function orderHex(i: number, kind: string): string {
  const { order, same, one } = setColors(kind), n = order.length - 1;
  return same ? one : i && n > 0 ? order[((i - 1) % n) + 1] : order[0];
}
export function nextColor(kind: string) {
  const { order, same, one } = setColors(kind), n = order.length - 1;
  if (same) return one as string;
  if (n < 1) return order[0] as string;
  const turn = store.get('switch:slots:turn', {}), t = Number.isInteger(turn[kind]) ? turn[kind] : 0;
  store.set('switch:slots:turn', { ...turn, [kind]: t + 1 });
  return order[(t % n) + 1] as string;
}
export const setTurn = (kind: string, t: number) => store.set('switch:slots:turn', { ...store.get('switch:slots:turn', {}), [kind]: t });
export function setColor(i: number, kind: string, own = '') {
  if (own) return col(own);
  if (slotted()) return '';
  const c = orderHex(i, kind);
  return c ? col(c) : i ? 'var(--text-dim)' : '';
}
export const setChip = (icon: string, i: number, word: string, kind: string, own = '') => `<span class="set-ic" style="--ly-c:${setColor(i, kind, own) || 'var(--text-dim)'}">${icon}</span><span class="set-n">${i + 1}</span>${word}`;
export const newChip = (ic: string) => `<span class="set-ic" style="--ly-c:var(--text-dim)">${ic}</span><span class="set-n set-plus">${icon('plus')}</span>new set`;
export function setsOfAm(kind: string, n: number, pid = S.pid): SetEntry[] {
  const s = store.get(`deck:sets:${kind}:${levelKey(S.wid, pid)}${n > 1 ? '@' + n : ''}`, {});
  return Array.isArray(s.list) && s.list.length ? s.list : [{ id: '' }];
}
export type MoveHow = { go: boolean; am: number; label: string; open: boolean; draft?: boolean };
export type NewChat = { chats: Agent[]; pid: string };
type AmRow = { n: number; open: boolean };
type Accts = { accounts?: { id: string; email?: string; signedIn?: boolean }[]; ams?: Record<number, string> };
let amsSeen: AmRow[] = [], acctsSeen: Accts | null = null;
const acctOf = (n: number) => acctsSeen?.ams?.[n] || acctsSeen?.ams?.[1] || '';
const acctName = (n: number) => acctsSeen?.accounts?.find((x) => x.id === acctOf(n))?.email || 'another account';
const CHEV = '<svg class="ic mv-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
export async function moveAway(a: Agent, n: number, to: any, how: MoveHow, quiet = false) {
  const where = to?.orch ? { orch: true } : to?.ed != null ? { ed: String(to.ed) } : { set: to == null ? '+' : String(to) };
  try {
    await api('PUT', '/api/agent/owner', { id: a.id, to: n, place: where, go: how.go }, a.pid ?? S.pid);
  } catch (e) {
    if (!quiet) showErr(e);
    return false;
  }
  a.am = n;
  place(a.id, null);
  if (quiet) return true;
  if (how.go) window.amethyst?.openAmethyst?.(n);
  else notify(`Moved to Amethyst ${n} · ${esc(how.label)}. ${how.open ? 'You stayed here; it keeps running there.' : `It's there when you open Amethyst ${n}.`}`, { ms: 5000 });
  return true;
}
export function setsMenu(kind: string, btn: Element, here: string | null | undefined, pick: (to: any, how: MoveHow) => unknown, layouts: SetLayout[] | null | false | undefined = null, who: Agent | Agent[] | NewChat | null = null, orch = false, more: { html: string; pick: (b: HTMLElement) => unknown } | null = null, look: { verb: string; eds: string[] } | null = null, beside: HTMLElement | null = null) {
  const nc = who && !Array.isArray(who) && 'chats' in who ? who : null;
  const group = Array.isArray(who) ? who : null, a = nc ? null : group ? group[0] || null : (who as Agent | null);
  const { list } = sets(kind), r = btn.getBoundingClientRect(), ic = gem(kind === 'chat' ? 'ai' : 'term'), pid = a?.pid ?? nc?.pid ?? S.pid, token = uid();
  const unfold = new Set([AM]);
  let ctrl = false, shift = false;
  const away = () => (!!a || !!nc) && kind === 'chat' && !!window.amethyst?.amethysts && amsSeen.some((x) => x.n !== AM);
  const all = () => away() && pref('deck:setAms');
  const go = () => pref(nc ? 'scratch:chatGo' : 'deck:moveGo') !== ctrl;
  const tagOf = (n: number) => (n === AM ? '' : ` data-am="${n}"`);
  const setRow = (x: SetEntry, j: number, n: number, used: boolean) => `<button class="mi" data-set="${esc(x.id)}"${tagOf(n)} data-lbl="${esc(x.label || `set ${j + 1}`)}"${used ? ' disabled' : ''}>${setChip(ic, j, `<span class="set-name">${esc(x.label || 'set')}</span>`, kind, x.color)}${used ? '<span class="d">in use</span>' : ''}</button>`;
  const edRow = (x: SetLayout, i: number, n: number, used: boolean) => `<button class="mi" data-ed="${esc(x.id)}"${tagOf(n)} data-lbl="editor set ${i + 1}"${used ? ' disabled' : ''}>${setChip(modeGem('editor'), i, 'set', 'editor', x.color)}${used ? '<span class="d">in use</span>' : ''}</button>`;
  const newRow = (k: string, n: number, chip: string) => `<button class="mi" data-${k}="${k === 'ed' ? 'new' : '+'}"${tagOf(n)} data-lbl="a new set">${chip}</button>`;
  const rowsOf = (n: number) => {
    const own = n === AM, ss = own ? list : setsOfAm(kind, n, pid), eds = own ? layouts || null : layouts ? page.editorsOf(n, pid) : null;
    let h = ss.map((x, j) => (group && own && x.id === here ? '' : setRow(x, j, n, own && x.id === here))).join('') + newRow('set', n, newChip(ic));
    if (orch && own && kind === 'chat') h += `<div class="sep"></div><button class="mi" data-orch data-lbl="Orchestration" title="${esc(ORCH_TIP)}"><i class="dk-mark">${gem('orch')}</i>Orchestration<span class="d">out of this set</span></button>`;
    else if (!own && kind === 'chat' && a && !group && !nc) h += `<div class="sep"></div><button class="mi" data-orch${tagOf(n)} data-lbl="orchestration" title="${esc(`Orchestration of Amethyst ${n}\nMoves the chat into that Amethyst's orchestration list, in no set. It leaves this Amethyst and keeps running.`)}"><i class="dk-mark">${gem('orch')}</i>orchestration<span class="d">its list only</span></button>`;
    if (eds) h += '<div class="sep"></div>' + eds.map((x, i) => edRow(x, i, n, look ? own && look.eds.includes(x.id) : !nc && own && !!x.on && here == null)).join('') + newRow('ed', n, newChip(modeGem('editor')));
    return h;
  };
  const amTip = (x: AmRow) => {
    if (x.n === AM) return `Amethyst ${x.n}\nThe Amethyst you're in. Click to show or hide its sets.`;
    const other = a?.program === 'claude' && !!acctsSeen && acctOf(x.n) !== acctOf(AM);
    return `Amethyst ${x.n}\nClick to show or hide its sets in ${a?.project || 'this project'}.${x.open ? '' : " It's closed: with follow on, moving the chat there opens it."}${other ? `\n\nIt signs in as ${acctName(x.n)}: ${group ? 'each chat keeps' : 'the chat keeps'} running and uses that account from its next message.` : ''}`;
  };
  const chatRow = (x: Agent) => `<button class="mi" data-chat="${esc(x.id)}" data-lbl="${esc(crystalOf(x.id).code)}"><i class="dk-mark">${gem('ai')}</i>${agentLine(x)}<span class="d">${esc(x.status)}</span></button>`;
  const chatRows = () => (nc?.chats.length ? `<div class="sep"></div><div class="ml">a chat</div>${nc.chats.map(chatRow).join('')}` : '');
  const body = () => (nc ? '<div class="ml">a new chat in</div>' : '') + places() + chatRows() + (more?.html || '');
  const places = () => {
    if (!all()) return rowsOf(AM);
    const rows = [{ n: AM, open: true }, ...amsSeen.filter((x) => x.n !== AM).sort((x, y) => x.n - y.n)];
    return rows.map((x) => `<div class="mv-am${unfold.has(x.n) ? ' open' : ''}${x.open ? '' : ' closed'}"><button class="mi mv-row" data-unfold="${x.n}" aria-expanded="${unfold.has(x.n)}" title="${esc(amTip(x))}">${CHEV}<span class="mv-n">Amethyst ${x.n}</span>${x.n === AM ? '<span class="d">this one</span>' : x.open ? '' : '<span class="d">closed</span>'}</button><div class="mv-fold">${rowsOf(x.n)}</div></div>`).join('');
  };
  const tg = (k: string, on: boolean, svg: string, tip: string, keys = '') => `<button type="button" class="mv-tg${on ? ' on' : ''}" data-mv="${k}" aria-pressed="${on}" title="${esc(tip)}"${keys ? ` data-tip-keys="${esc(keys)}"` : ''}>${svg}</button>`;
  const it = group ? 'them' : 'it', nn = kind === 'chat' ? 'chat' : 'terminal', the = group ? `the ${nn}s` : `the ${nn}`;
  const goTip = () => (nc ? `Follow: ${go() ? 'on' : 'off'}\n${go() ? 'You go to the chat.' : 'The chat gets it and you stay here.'} Click to turn it ${go() ? 'off' : 'on'}.` : `Follow: ${go() ? 'on' : 'off'}\n${go() ? `You go with ${the} to where you move ${it}.` : `The ${nn}${group ? 's move' : ' moves'} and you stay here.`} Click to turn it ${go() ? 'off' : 'on'}.`);
  const toggles = () => tg('go', go(), ICONS.follow, goTip(), `=ctrl+click:on a ${nc ? 'row' : 'set'}: ${go() ? 'stay here' : 'follow'}, just once`) + (away() ? tg('ams', all(), ICONS.window, `Other Amethysts: ${all() ? 'shown' : 'hidden'}\nLists every Amethyst, to ${nc ? 'start the chat in' : `move ${group ? 'these chats' : 'this chat'} into`} one of their sets. Click to ${all() ? 'hide' : 'show'} them.`, '') : '');
  const ncTip = () => (shift ? "Put in a chat's box\nPuts it in the box of the chat you pick, unsent." : 'Send to a chat\nSends it to a new chat in the set you pick, or to one of the chats below.');
  const head = () => (nc ? `<div class="mh mv-h" title="${esc(ncTip())}" data-tip-keys="=shift+click:put it in the box, unsent;=ctrl+click:${go() ? 'stay here' : 'follow'}, just once"><i class="mh-ic">${gem('ai')}</i><span class="mh-n">${shift ? "put in a chat's box" : 'send to a chat'}</span><span class="h">${shift ? 'unsent' : go() ? 'and go there' : 'you stay here'}</span><span class="mv-tgs">${toggles()}</span></div>` : a ? `<div class="mh mv-h mv-bare"><span class="mv-tgs">${toggles()}</span></div>` : '');
  const html = `${head()}<div class="set-rows" data-mv-menu="${token}">${body()}</div>`;
  const onPick = (b: HTMLElement) => {
    const d = b.dataset;
    if (more && d.mk != null) return more.pick(b);
    if (d.set == null && d.ed == null && d.chat == null && d.orch == null) return;
    const n = d.am ? +d.am : AM, to = d.orch != null ? { orch: true } : d.chat ? { chat: d.chat } : d.ed ? { ed: d.ed } : d.set === '+' ? null : d.set;
    pick(to, { go: go(), am: n, label: d.lbl || 'a set', open: n === AM || !!amsSeen.find((x) => x.n === n)?.open, draft: shift });
  };
  if (beside) subMenu(beside, html, onPick);
  else popMenu(r.left, r.bottom + 4, html, onPick);
  const m = $<HTMLElement>('#colormenu');
  const ours = () => !m.hidden && !!m.querySelector(`.set-rows[data-mv-menu="${token}"]`);
  const fit = () => {
    const rows = m.querySelector<HTMLElement>('.set-rows');
    if (!rows) return;
    rows.style.maxHeight = '';
    if (beside) return placeSubAgain();
    const h = m.getBoundingClientRect().height, room = innerHeight - 16;
    m.style.top = `${Math.max(8, Math.min(r.bottom + 4, innerHeight - 8 - h))}px`;
    if (h > room) rows.style.maxHeight = `${Math.max(0, rows.getBoundingClientRect().height - (h - room))}px`;
  };
  const repaint = () => {
    if (!ours()) return;
    const was = m.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const sel = was && [...was.attributes].filter((x) => x.name.startsWith('data-')).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
    const hd = m.querySelector('.mv-h');
    if (nc && hd) hd.outerHTML = head();
    const tgs = m.querySelector('.mv-tgs'), rows = m.querySelector<HTMLElement>('.set-rows')!, top = rows.scrollTop;
    if (tgs) tgs.innerHTML = toggles();
    rows.innerHTML = body();
    rows.scrollTop = top;
    fit();
    if (sel && !m.contains(document.activeElement)) m.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  };
  const off = () => {
    m.removeEventListener('click', click, true);
    removeEventListener('keydown', key, true);
    removeEventListener('keyup', key, true);
  };
  function key(e: KeyboardEvent) {
    if (!ours()) return off();
    if (e.key === 'Shift' && nc) shift = e.type === 'keydown';
    else if (e.key === 'Control' || e.key === 'Meta') ctrl = e.type === 'keydown';
    else return;
    repaint();
  }
  function click(e: MouseEvent) {
    if (!ours()) return off();
    const t = e.target as HTMLElement, tgl = t.closest<HTMLElement>('[data-mv]'), fold = t.closest<HTMLElement>('[data-unfold]');
    ctrl = e.ctrlKey || e.metaKey;
    shift = !!nc && e.shiftKey;
    if (!tgl && !fold) return;
    e.stopPropagation();
    e.preventDefault();
    ctrl = shift = false;
    if (tgl) {
      const k = tgl.dataset.mv === 'go' ? (nc ? 'scratch:chatGo' : 'deck:moveGo') : 'deck:setAms';
      setPref(k, !pref(k));
    } else {
      const n = +fold!.dataset.unfold!;
      unfold.has(n) ? unfold.delete(n) : unfold.add(n);
    }
    repaint();
    holdFocus(() => m.querySelector<HTMLElement>(tgl ? `[data-mv="${tgl.dataset.mv}"]` : `[data-unfold="${fold!.dataset.unfold}"]`));
  }
  if (a || nc) {
    m.addEventListener('click', click, true);
    addEventListener('keydown', key, true);
    addEventListener('keyup', key, true);
    m.addEventListener('menuclose', off, { once: true });
    fit();
    window.amethyst?.amethysts?.().then((got: AmRow[]) => {
      amsSeen = (got || []).map((x) => ({ n: x.n, open: !!x.open }));
      repaint();
    }).catch(() => {});
    if (a?.program === 'claude') quietly(api('GET', '/api/agents/usage?age=3600000'), null).then((u: any) => u?.claude && ((acctsSeen = u.claude), repaint()));
  }
  const rows = document.querySelector('#colormenu .set-rows') as HTMLElement;
  let leave: (() => void) | null = null;
  const offField = (e: MouseEvent) => {
    if (!leave || (e.target as HTMLElement).closest('input')) return false;
    e.preventDefault();
    e.stopPropagation();
    leave();
    return true;
  };
  rows.addEventListener('click', offField, true);
  rows.addEventListener('contextmenu', (e) => {
    if (offField(e)) return;
    const row = (e.target as HTMLElement).closest('[data-set]') as HTMLElement;
    if (leave || !row || row.dataset.set === '+' || row.dataset.am || !many(kind)) return;
    e.preventDefault();
    const edit = document.createElement('div'), word = row.querySelector('.set-name')!, input = document.createElement('input');
    edit.className = 'mi set-edit';
    edit.innerHTML = row.innerHTML;
    input.value = word.textContent!;
    input.setAttribute('aria-label', 'name of the set');
    edit.querySelector('.set-name')!.replaceWith(input);
    rows.style.width = rows.offsetWidth + 'px';
    leave = () => {
      leave = null;
      rows.style.width = '';
      edit.replaceWith(row);
      row.focus();
    };
    input.addEventListener('keydown', (k) => {
      k.stopPropagation();
      if (k.key === 'Escape') leave!();
      if (k.key !== 'Enter') return;
      k.preventDefault();
      word.textContent = renameSet(kind, row.dataset.set!, input.value) || 'set';
      leave!();
    });
    row.replaceWith(edit);
    input.select();
  });
}
export function dropSet(kind: string, id: string) {
  const s = sets(kind), i = s.list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const saved = store.get(keyOf(kind, id), {});
  const back = { entry: s.list[i], at: i, n: saved.n, chats: [...agents.all.values()].filter((a) => a.kind === 'chat' && a.session && mineOf(kind, id)(a)).map((a) => ({ i: saved.cells?.indexOf(a.id) ?? -1, session: a.session, draft: draftOf(a.id), program: a.program, pid: a.pid ?? S.pid })) };
  for (const a of [...agents.all.values()].filter(mineOf(kind, id))) {
    if (openAway(a.id)) continue;
    api('DELETE', `/api/${a.kind === 'term' ? 'term' : 'agent'}?id=${encodeURIComponent(a.id)}`, {}).catch(showErr);
    agents.all.delete(a.id);
  }
  store.del(keyOf(kind, id));
  if (i === 0) return back;
  const list = s.list.filter((x) => x.id !== id);
  saveSets(kind, list, s.on === id ? (list[i] || list[i - 1]).id : s.on);
  freeSet(kind, id);
  shareDeck();
  return back;
}
export function restoreSet(kind: string, { entry, at, n }: { entry: SetEntry; at: number; n?: number }) {
  const list = [...sets(kind).list];
  list.splice(Math.min(Math.max(at, 1), list.length), 0, entry);
  if (n) store.set(keyOf(kind, entry.id), { n });
  saveSets(kind, list, entry.id);
}
export const setAgents = (kind: string, id: string) => [...agents.all.values()].filter((a) => mineOf(kind, id)(a) && !openAway(a.id));
export const setAway = (kind: string, id: string) => [...agents.all.values()].filter((a) => mineOf(kind, id)(a) && !!openAway(a.id)).map((a) => openAway(a.id));
export const agentLine = (a: Agent) => `<span class="dk-code"${gemStyle(a.id)}>${crystalOf(a.id).code}</span><span class="m-tt">${esc(titleOf(a))}</span>`;
function takeOut(kind: string, from: string, ids: string[]) {
  const mine = mineOf(kind, from), moved = ids.filter((x) => agents.all.has(x) && mine(agents.all.get(x)!));
  const s = store.get(keyOf(kind, from), {});
  if (Array.isArray(s.cells)) store.set(keyOf(kind, from), { ...s, cells: s.cells.map((c: string | null) => (c && moved.includes(c) ? null : c)) });
  return moved;
}
export function moveSetChats(kind: string, from: string, to: string, ids: string[]) {
  const moved = takeOut(kind, from, ids);
  for (const x of moved) claim(kind, x, to);
  shareDeck();
  return moved;
}
export function toOrch(ids: string[]) {
  for (const x of ids) place(x, { in: 'orch' });
  if (!ids.length || !isOff('modesHidden', 'orch')) return;
  setOff('modesHidden', 'orch', false);
  notify(`Orchestration is back in the rail: your ${ids.length === 1 ? 'chat is' : 'chats are'} there.`, { ms: 6000 });
}
export function setChatsToOrch(kind: string, from: string, ids: string[]) {
  const moved = takeOut(kind, from, ids);
  toOrch(moved);
  shareDeck();
  return moved;
}
export const cellsOf = (kind: string, set: string): (string | null)[] => store.get(keyOf(kind, set), {}).cells?.slice() || [];
export function chatsFromOrch(kind: string, to: string, ids: string[], was: (string | null)[] = []) {
  const back = ids.filter((x) => agents.all.has(x) && owner(x)?.in === 'orch');
  for (const x of back) claim(kind, x, to);
  const s = store.get(keyOf(kind, to), {}), cells = Array.isArray(s.cells) ? [...s.cells] : [];
  for (const x of back) {
    const i = was.indexOf(x);
    if (i >= 0 && !cells[i] && !cells.includes(x)) cells[i] = x;
  }
  store.set(keyOf(kind, to), { ...s, cells });
  shareDeck();
  return back;
}
function setFrom(kind: string, list: SetEntry[], id: string) {
  if (!many(kind)) return '';
  const w = owner(id), o = w?.in === kind ? w.set : undefined;
  return list.some((x) => x.id === o) ? o : list.some((x) => x.id === '') ? '' : list[0].id;
}
export function setOf(kind: string, id: string) {
  return setFrom(kind, sets(kind).list, id);
}
function claim(kind: string, id: string, set: string | null) {
  if (many(kind)) place(id, { in: kind, set });
}
type InTab = ((a: Agent) => unknown) | null;
function infoFrom(kind: string, id: string, here: Agent[], inTab: InTab) {
  const s = store.get(keyOf(kind, id), {}), n = Number.isInteger(s.n) && s.n >= 1 ? s.n : 4;
  const ids = new Set(here.map((a) => a.id)), held = new Set(s.cells?.slice(0, n)), all = here.filter((a) => !inTab?.(a) || held.has(a.id));
  const count = (st: string) => all.filter((a) => a.status === st).length;
  return { n, filled: Array.from({ length: n }, (_, i) => !!s.cells?.[i] && ids.has(s.cells[i])), chats: all.length, running: all.filter((a) => a.status !== 'ended').length, asks: count('asks'), done: count('done'), working: count('working'), doneIds: all.filter((a) => a.status === 'done').map((a) => a.id) };
}
export function setInfo(kind: string, id: string, inTab: InTab = null) {
  const { list } = sets(kind), mine = mineOf(kind);
  return infoFrom(kind, id, [...agents.all.values()].filter((a) => mine(a) && setFrom(kind, list, a.id) === id), inTab);
}
export function setInfos(kind: string, inTab: InTab = null) {
  const { list } = sets(kind), mine = mineOf(kind), by = new Map<string, Agent[]>(list.map((x) => [x.id, []]));
  for (const a of agents.all.values()) if (mine(a)) by.get(setFrom(kind, list, a.id))?.push(a);
  return new Map(list.map((x) => [x.id, infoFrom(kind, x.id, by.get(x.id)!, inTab)]));
}

function mineOf(kind: string, set?: string | null) {
  const pid = atWs() ? '' : S.pid;
  return (a: Agent) => a.kind === kind && !amElse(a) && !['research', 'orch', 'qagent'].includes(owner(a.id)?.in) && (a.pid || '') === pid && (set == null || setOf(kind, a.id) === set);
}
export async function takeHere(a: Agent) {
  const there = amElse(a);
  if (!there) return true;
  const yes = await ask({ title: `This chat is open in Amethyst ${there}`, text: `Open “${titleOf(a)}” here? It leaves Amethyst ${there} and keeps running, on this Amethyst's Claude account.`, choices: [{ label: 'open here', value: 'here' }] });
  if (yes !== 'here') return false;
  try {
    await api('PUT', '/api/agent/owner', { id: a.id }, a.pid ?? S.pid);
  } catch (e) {
    return showErr(e), false;
  }
  a.am = AM;
  return true;
}
const listed = (mine: (a: Agent) => boolean, held: { has(id: string): boolean }, inTab: ((a: Agent) => unknown) | null) => (a: Agent) => mine(a) && (held.has(a.id) || !inTab?.(a));
export function setsHolding(kind: string, id: string) {
  return sets(kind).list.flatMap((x, i) => {
    const s = store.get(keyOf(kind, x.id), {}), n = Number.isInteger(s.n) && s.n >= 1 ? s.n : 4;
    return (s.cells || []).slice(0, n).includes(id) ? [{ set: x.id, n: i + 1, label: typeof x.label === 'string' ? x.label : '' }] : [];
  });
}
export function freeCell(kind: string, set: string, id: string) {
  const s = store.get(keyOf(kind, set), {});
  if (!Array.isArray(s.cells) || !s.cells.includes(id)) return;
  store.set(keyOf(kind, set), { ...s, cells: s.cells.map((c: string | null) => (c === id ? null : c)) });
  shareDeck();
}
export const inCells = (kind: string) => new Set<string>(sets(kind).list.flatMap(({ id }) => {
  const s = store.get(keyOf(kind, id), {});
  return s.cells?.slice(0, s.n) || [];
}));
export function listedOf(kind: string, inTab: ((a: Agent) => unknown) | null) {
  return listed(mineOf(kind), inCells(kind), inTab);
}
export function shareDeck() {
  shareCells(['chat', 'term'].flatMap((kind) => sets(kind).list.flatMap(({ id }) => (store.get(keyOf(kind, id), {}).cells || []).filter(Boolean))));
}

export function createDeck({ kind = 'chat', set = '', openTab = null, layouts = null, inTab = null, sendTo = null, pin = null, mark = null, show = null, bring = null, openFile = () => {}, filesChanged = () => {}, makeChat, makeTerm }: { kind?: string; set?: string | null; openTab?: ((a: Agent, ed?: string, go?: boolean) => unknown) | null; layouts?: (() => SetLayout[]) | null; inTab?: ((a: Agent) => unknown) | null; sendTo?: ((kind: string, id: string, to: any, go?: boolean) => unknown) | null; pin?: ((p: ReturnType<typeof agentPin>) => unknown) | null; mark?: ((session: string, n: number) => unknown) | null; show?: ((a: Agent) => unknown) | null; bring?: ((a: Agent) => Promise<boolean>) | null; openFile?: (path: string) => void; filesChanged?: () => void; makeChat: MakeChat<CellView>; makeTerm: MakeTerm<CellView> }) {
  const K = KIND[kind], ws = atWs(), key = keyOf(kind, set), lvl = levelKey();
  const saved = store.get(key, {});
  let n = Number.isInteger(saved.n) && saved.n >= 1 ? saved.n : 4;
  let sel = saved.sel === -1 ? -1 : Math.min(Math.max(0, saved.sel | 0), n - 1);
  let hot = -1;
  let cells: (string | null)[] = Array.from({ length: n }, (_, i) => (typeof saved.cells?.[i] === 'string' ? saved.cells[i] : null));
  const views = new Map<number, Cell>();
  const parked = new Map<string, Cell>();
  const PARK_MAX = 8;
  function park(v: Cell | null | undefined) {
    if (!v || kind !== 'chat' || !v.id) return false;
    parked.delete(v.id);
    parked.set(v.id, v);
    while (parked.size > PARK_MAX) {
      const [oldId, oldV] = parked.entries().next().value!;
      parked.delete(oldId);
      oldV.view.detach();
    }
    return true;
  }
  function unpark(id: string) {
    const v = parked.get(id);
    if (!v) return null;
    parked.delete(id);
    return v;
  }
  function dropParked(id: string) {
    const v = parked.get(id);
    if (!v) return;
    parked.delete(id);
    v.view.detach();
  }
  let rail = saved.rail === 'hidden' ? 'hidden' : 'show';
  const arrangeable = kind === 'chat';
  let spot = arrangeable && Number.isInteger(saved.spot) && saved.spot >= 0 && saved.spot < n ? saved.spot : null;
  let side = saved.side === 'right' ? 'right' : 'left';
  const spotOn = () => spot !== null && n > 1;
  let spotW = SPOT_W[saved.spotW] ? saved.spotW : null;
  let lay = saved.lay === 'side' ? 'side' : 'stack';
  const save = () => (store.set(key, { n, sel, cells, rail, spot, side, spotW, lay }), shareDeck());
  const mine = mineOf(kind, set);
  const get = (id: string | null | undefined) => {
    const a = id && agents.all.get(id);
    return a && mine(a) ? a : null;
  };

  const el = document.createElement('div');
  el.className = 'deck';
  el.dataset.kind = kind;
  const headOn = !!ws || kind !== 'chat';
  const hideBtn = HIDE_BTN;
  el.innerHTML = `
    <div class="dk-main">
      <div class="dk-grid"></div>
      <div class="dk-sgrip" title="Resize the spotlight&#10;Drag to make the spotlight chat wider or narrower. Double-click to make it one column again." hidden></div>
    </div>
    <aside class="dk-rail">
      <div class="dk-grip" title="drag to make it wider or narrower">${SHOW_BTN}</div>
      <header class="dk-rhead">${ws ? `<span class="dk-ws" style="--wc:${esc(wsColor(S.ws))}" title="Workspace: ${esc(S.ws?.name || 'workspace')}&#10;The workspace's own ${K.many}: they work in its folder. A project's ${K.many} show in that project."><span class="ws-ic">${ICONS.workspaces}</span><b>${esc(S.ws?.name || 'workspace')}</b></span>` : ''}<span class="grow"></span>${headOn ? hideBtn : ''}${kind === 'chat' ? '' : TERM_NEW}</header>${headOn ? '' : hideBtn}
      <div class="dk-list${kind === 'chat' ? ' oc-list' : ''}"></div>
      <div class="dk-closed" hidden></div>
    </aside>`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s)!;
  const grid = $('.dk-grid'), list = $('.dk-list');
  const asks = answers((id) => open(id));
  const boxes: HTMLElement[] = [];
  let drawn = '';
  function setRail(look: string) {
    rail = look === 'hidden' ? 'hidden' : 'show';
    el.dataset.rail = rail === 'hidden' ? rail : 'full';
    paintRailBtns();
  }
  function paintRailBtns() {
    const hb = $('.dk-hide'), sb = $('.dk-show');
    hb.hidden = !pref('rail:hideBtn');
    sb.hidden = !pref('rail:showBtn');
    hb.title = `Hide the list\nHides the list of ${K.many}${kind === 'chat' ? ' beside the agents' : ''}.\n\nDrag the line back out to show it again.`;
    hb.dataset.tipKeys = 'railKey:hide or show the list';
    sb.title = `Show the list\nShows the list of ${K.many} again.`;
    sb.dataset.tipKeys = 'railKey:hide or show the list';
    $('.dk-grip').title = rail === 'hidden' ? `Show the list\nClick, or drag left, to show the list of ${K.many} again.` : `Hide the list\nDrag it all the way right to hide the list of ${K.many}.`;
    rail === 'hidden' ? ($('.dk-grip').dataset.tipKeys = 'railKey:hide or show the list') : delete $('.dk-grip').dataset.tipKeys;
  }
  function toggleRail() {
    setRail(rail === 'hidden' ? 'show' : 'hidden');
    save();
  }
  (el as any).railBtns = paintRailBtns;
  setRail(rail);
  $('.dk-hide').addEventListener('click', toggleRail);
  let gripX = 0;
  $('.dk-grip').addEventListener('click', (e) => {
    if (rail === 'hidden' && (!e.detail || Math.abs(e.clientX - gripX) < 3)) toggleRail();
  });
  let quitDrag: (() => void) | null = null;
  $('.dk-grip').addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    gripX = e.clientX;
    const right = $('.dk-rail').getBoundingClientRect().right, d = el.getBoundingClientRect();
    quitDrag = snapDrag(e, {
      grip: e.currentTarget as HTMLElement,
      sizes: [0, LIST_W],
      at: (ev) => right - ev.clientX,
      box: (w) => ({ left: right - Math.max(w, 6), top: d.top + GAP, width: Math.max(w, 6), height: d.height - 2 * GAP, edge: right - w }),
      label: (w) => (w ? 'list' : 'hide the list'),
      apply(w) {
        setRail(w ? 'show' : 'hidden');
        save();
      },
    });
  });

  function build() {
    while (boxes.length > n) boxes.pop()!.remove();
    while (boxes.length < n) {
      const c = document.createElement('section');
      c.className = 'dk-cell';
      c.dataset.cell = boxes.length as unknown as string;
      c.innerHTML = '<header class="dk-ch"></header><div class="dk-body"></div>';
      boxes.push(c);
      (spotOn() ? rest : grid).append(c);
    }
    arrange();
    fit();
  }
  function keepingScroll(fn: () => void) {
    const kept = [...grid.querySelectorAll('.ch-log, .xterm-viewport')].map((x) => [x, x.scrollTop] as [Element, number]);
    fn();
    for (const [x, t] of kept) x.scrollTop = t;
  }
  const rest = document.createElement('div');
  rest.className = 'dk-rest';
  function arrange() {
    const on = spotOn(), sig = on ? `${spot}:${side}` : 'grid';
    if (sig === drawn) return;
    drawn = sig;
    grid.classList.toggle('dk-spot', on);
    grid.dataset.side = on ? side : '';
    keepingScroll(() => {
      if (!on) return grid.replaceChildren(...boxes);
      rest.replaceChildren(...boxes.filter((_, i) => i !== spot));
      grid.replaceChildren(...(side === 'left' ? [boxes[spot], rest] : [rest, boxes[spot]]));
    });
  }
  const colsFor = (w: number, k = n) => Math.min(k, Math.max(1, Math.floor((w + GAP) / (CELL.w + GAP))), Math.ceil(Math.sqrt(k)));
  type Room = { x: number; w: number; gap: number; cw: number; left: number };
  const room = (): Room => {
    const s = getComputedStyle(grid), l = parseFloat(s.paddingLeft) || 0, cw = grid.clientWidth;
    return { x: l, w: cw - l - (parseFloat(s.paddingRight) || 0), gap: parseFloat(s.columnGap) || 0, cw, left: grid.offsetLeft };
  };
  const spotCols = (r: Room) => Math.max(2, colsFor(r.cw - 2 * GAP));
  const spotPx = ([a, b]: [number, number], r: Room) => ((r.w - r.gap) * a) / b;
  const spotFits = (f: [number, number], r: Room) => spotPx(f, r) >= CELL.w && r.w - r.gap - spotPx(f, r) >= CELL.w;
  const spotPart = (r: Room) => (spotW && spotFits(SPOT_W[spotW], r) ? SPOT_W[spotW] : null);
  const oneCol = (r: Room) => (r.w - (spotCols(r) - 1) * r.gap) / spotCols(r);
  const spotWidth = (r: Room) => (spotPart(r) ? spotPx(spotPart(r)!, r) : oneCol(r));
  const sgrip = $('.dk-sgrip');
  function placeGrip(r: Room) {
    const on = spotOn();
    if (sgrip.hidden === on) sgrip.hidden = !on;
    if (on) sgrip.style.left = `${r.left + r.x + (side === 'left' ? spotWidth(r) + r.gap / 2 : r.w - spotWidth(r) - r.gap / 2)}px`;
  }
  let spotCss = '';
  function fit(r = room()) {
    if (r.cw - 2 * GAP <= 0) return;
    const set = (at: HTMLElement, cols: number) => at.style.getPropertyValue('--cols') !== String(cols) && at.style.setProperty('--cols', cols as unknown as string);
    const f = spotOn() ? spotPart(r) : null;
    const css = f ? (side === 'left' ? [f[0], f[1] - f[0]] : [f[1] - f[0], f[0]]).map((x) => `minmax(0, ${x}fr)`).join(' ') : '';
    if (css !== spotCss) grid.style.gridTemplateColumns = spotCss = css;
    placeGrip(r);
    if (!spotOn()) return set(grid, colsFor(r.cw - 2 * GAP));
    set(grid, spotCols(r));
    set(rest, restCols(r));
  }
  function restCols(r = room()) {
    const f = spotPart(r), wide = colsFor(r.w - r.gap - spotWidth(r), n - 1);
    let rc = f ? wide : spotCols(r) - 1;
    if (lay === 'side') return Math.max(rc, wide);
    while (rc > 1 && Math.ceil((n - 1) / rc) < rc) rc--;
    return rc;
  }
  grid.dataset.lay = lay;
  grid.addEventListener('spotlay', (e) => {
    lay = (e as CustomEvent).detail;
    grid.dataset.lay = lay;
    fit();
    save();
    if (lay === 'side' && spotOn() && n > 2 && restCols() < 2) tell($('.dk-main'), { title: 'No room side by side', line: 'The other chats stay stacked until the window or their side is wider.', ms: 2500 });
  });
  const columns = () => {
    fit();
    return +grid.style.getPropertyValue('--cols') || 1;
  };
  const ro = onSize([rest, grid], { name: 'deck.fit', read: room, write: (r: Room) => fit(r) });
  const hints: HTMLElement[] = [];
  const hint = (i: number) => (hints[i] ||= Object.assign(document.createElement('div'), { className: 'dk-hint', innerHTML: newHint(K.one) }));
  function head(i: number) {
    const id = cells[i], a = get(id);
    const x = () => `<button data-dk-out aria-label="close">×</button>`;
    if (!a) {
      if (views.has(i)) return `<i class="dk-mark">${gem('ai')}</i><b class="dk-title">new chat</b><span class="grow"></span>${toolsSlot()}${spotBtn(i)}${x()}`;
      if (id && !agents.loaded) return `<span class="dk-st">…</span>`;
      return `<span class="dk-st">empty</span><span class="grow"></span>${n > 1 ? '<button data-dk-close aria-label="close">×</button>' : ''}`;
    }
    return agentHead(a, { ...can, spot: spotBtn(i) });
  }
  function spotBtn(i: number) {
    if (!arrangeable) return '';
    return offBtn(spotHtml(spotOn() && spot === i, n, spotOn()), !!pref('deck:spotBtn'), 'spotlight');
  }
  const can: HeadCan = { mark: !!mark, pin: !!pin, set: !!sendTo, tab: !!openTab, orch: !!sendTo && kind === 'chat', bench: !(sendTo && kind === 'chat') };
  const markSig = () => JSON.stringify([S.marks, pref('marks:on'), pref('marks:names'), pref('deck:model', 'win'), pref('deck:code', 'win'), pref('deck:title', 'win'), pref('deck:rowCode'), pref('deck:rowInfo'), pref('deck:title2'), pref('closed:on'), ...HEAD_BTNS.map((k) => pref(k, 'win'))]);
  let markKey = '';
  function chatIn(id: string | null, pid: string, more: Record<string, unknown> = {}) {
    const e = { id, tab: { id: 'dk-' + uid(), type: 'ai', chat: id, pid, ...more } } as unknown as Cell;
    e.view = makeChat(e.tab!, { saved: () => moved(e), filesChanged, openFile, titled() {}, openBeside });
    return e;
  }
  function moved(e: Cell) {
    const at = [...views].find(([, v]) => v === e)?.[0], id = e.tab!.chat;
    if (at == null || !id || cells[at] === id) return;
    cells[at] = e.id = id;
    save();
    started({ id, kind: 'chat', program: chatProgram(e.tab!.type), pid: e.tab!.pid! }, many() ? { in: kind, set } : null);
    if (e.opened) {
      e.opened = false;
      record('deck', `opened “${titleOf(agents.all.get(id) ?? { kind: 'chat', program: chatProgram(e.tab!.type) })}”`, { kind, set, i: at, id, opened: true, pid: e.tab!.pid, program: chatProgram(e.tab!.type) });
    }
    paint();
  }
  function paintCell(i: number) {
    const c = boxes[i];
    if (!c) return;
    c.classList.toggle('sel', i === sel);
    c.classList.toggle('spot', spotOn() && i === spot);
    const id = cells[i], a = get(id);
    let v: Cell | null | undefined = views.get(i);
    if (v && v.id !== id) {
      if (!park(v)) v.view.detach();
      views.delete(i);
      v = null;
    }
    if (!v && a) {
      const kept = a.kind === 'chat' ? unpark(a.id) : null;
      views.set(i, (v = kept || (a.kind === 'term' ? { id, view: makeTerm({ id }) } : chatIn(id, a.pid ?? S.pid, { type: chatTabOf(a.program) }))));
    }
    c.classList.toggle('empty', !v);
    if (a) c.style.setProperty('--gem-c', crystalOf(a.id).color);
    else c.style.removeProperty('--gem-c');
    const hd = c.firstElementChild as HTMLElement;
    hd.toggleAttribute('data-ask', a?.status === 'asks');
    paintHead(hd, head(i), { bar: v?.view.bar, menu: a?.kind === 'chat' ? v?.view.el?.querySelector('.ch-menu') : null, home: () => v?.view.home?.() });
    const body = c.lastElementChild!, want = v ? v.view.el : hint(i);
    if (body.firstElementChild !== want) body.replaceChildren(want);
  }

  const repaintList = () => (el.hidden ? (stale = true) : paintList());
  const fh = kind === 'chat' ? null : folderHost(list, { list: 'deck', attr: 'data-dk-agent', agentOf: (id) => get(id), repaint: repaintList, on: false });
  let held = new Map<string, number>(), shown = (_a: Agent) => false;
  const lst = kind !== 'chat' ? null : createChatList({
    list: 'deck',
    el: list,
    attr: 'data-dk-agent',
    mine: (a) => shown(a),
    benched: (a) => !held.has(a.id),
    cur: () => (sel >= 0 ? cells[sel] : null),
    shown: () => !el.hidden,
    repaint: repaintList,
    open: (id) => open(id),
    close: (a, sure) => end(a.id, sure),
    mark: (a, x, y) => mark && markMenu(a, x, y, mark, paint),
    sub: (c, s) => openSub(c, s),
    newChat: (b, p) => newAgent(b.getBoundingClientRect().left, b.getBoundingClientRect().bottom + 6, -1, 'list', p),
    none: () => `No ${K.many} in this ${ws ? 'workspace' : 'project'} yet. ${noneLine(kind)}`,
  });
  function paintList() {
    const at = new Map<string, number>();
    cells.slice(0, n).forEach((id, i) => id && at.set(id, i));
    const here = listed(mine, at, inTab);
    if (lst) {
      held = at;
      shown = here;
      lst.paint();
      el.toggleAttribute('data-asks', [...agents.all.values()].some((a) => here(a) && a.status === 'asks'));
      return markRows();
    }
    const by: Record<string, Agent[]> = { asks: [], working: [], done: [], bench: [] };
    for (const a of agents.all.values()) {
      if (!here(a)) continue;
      const g = groupOf(a);
      by[g !== 'asks' && !at.has(a.id) ? 'bench' : g === 'idle' ? 'done' : g]?.push(a);
    }
    by.asks.sort((x, y) => x.at - y.at);
    for (const k of ['working', 'done', 'bench']) by[k].sort((x, y) => y.at - x.at);
    const head = ({ k, label }: Group): Row => headRow(k, `<h4 class="dk-gh" data-st="${k}">${HEAD_IC[k] ? `<i class="dk-gi">${ICONS[HEAD_IC[k]]}</i>` : spark(k)}<b${k === 'working' ? ' class="dk-wd"' : ''}>${k === 'working' && workVerb() !== 'Working' ? workVerb() + '…' : label}</b></h4>`);
    const row = (a: Agent, k: string) => agentRow(a, { attr: 'data-dk-agent', benched: k === 'bench', fold: true, mark: !!mark });
    const none = agents.why ? `<p class="dk-none err">${esc(agents.why)}</p>` : `<p class="dk-none">${agents.loaded ? `No ${K.many} in this ${ws ? 'workspace' : 'project'} yet. ${noneLine(kind)}` : `Looking for ${K.many}…`}</p>`;
    el.toggleAttribute('data-asks', by.asks.length > 0);
    const drawn = fh!.paint(GROUPS.map(([k, label]) => ({ k, label, list: by[k] })), head, row, none, asks.card);
    asks.keep(new Set(drawn.rows.filter((r) => r.a).map((r) => `${r.a!.id} ${r.a!.ask!.id}`)));
    markRows();
  }
  function markRows() {
    const here = sel >= 0 ? cells[sel] : null, warm = hot >= 0 ? cells[hot] : null;
    for (const r of list.querySelectorAll<HTMLElement>('.dk-row, .oc-row')) {
      const id = r.dataset.dkAgent;
      r.classList.toggle('here', !!id && id === here);
      r.classList.toggle('hot', !!id && id === warm);
    }
  }

  let closedKey = '';
  function paintClosed() {
    const box = $('.dk-closed'), pid = atWs() ? '' : S.pid, open = store.get('deck:closed-open', false);
    const rows: Closed[] = kind === 'chat' && pref('closed:on') ? store.get('deck:closed', []).filter((c: Closed) => (c.pid || '') === pid && !chatOfSession(c.session)) : [];
    const key = JSON.stringify([rows, open]);
    if (key === closedKey) return;
    closedKey = key;
    box.hidden = !rows.length;
    const keep = box.firstElementChild?.scrollTop || 0;
    box.innerHTML = rows.length ? closedInner(rows, open) : '';
    if (open && keep) box.firstElementChild!.scrollTop = keep;
  }
  const dropClosed = (session: string) => store.set('deck:closed', store.get('deck:closed', []).filter((c: Closed) => c.session !== session));

  let stale = false;
  const full = (i: number) => i >= 0 && i < n && (!!cells[i] || views.has(i));
  function fixSel() {
    if (sel < 0 || full(sel)) return;
    let to = -1;
    for (let d = 1; d < n && to < 0; d++) to = full(sel - d) ? sel - d : full(sel + d) ? sel + d : -1;
    sel = to;
    save();
  }
  function paint() {
    markKey = markSig();
    fixSel();
    if (el.hidden) return void (stale = true);
    for (let i = 0; i < n; i++) paintCell(i);
    paintList();
    paintClosed();
  }
  function sync({ lineOnly = false } = {}) {
    if (levelKey() !== lvl) return;
    if (lineOnly) return el.hidden ? void (stale = true) : paintList();
    if (agents.loaded) {
      let out = false;
      cells = cells.map((id, i) => {
        if (!id || get(id)) return id;
        out = true;
        const v = views.get(i);
        if (v?.tab && v.tab.chat !== id) return (v.id = v.tab.chat || null);
        return null;
      });
      if (out) save();
      for (const id of [...parked.keys()]) if (!get(id)) dropParked(id);
    }
    paint();
  }

  const focusCell = (i: number) =>
    requestAnimationFrame(() => {
      boxes[i]?.scrollIntoView({ block: 'nearest' });
      views.get(i)?.view.focus();
    });
  const landCell = (i: number) =>
    requestAnimationFrame(() => {
      boxes[i]?.scrollIntoView({ block: 'nearest' });
      const v = views.get(i)?.view;
      if (v?.land) v.land(get(cells[i])?.ask ? 1500 : 0);
      else v?.focus();
    });
  function select(i: number, focus = false) {
    if (i !== -1 && !full(i)) return;
    if (i !== sel) {
      sel = i;
      save();
      for (const c of boxes) c.classList.toggle('sel', +c.dataset.cell! === sel);
      paintList();
    }
    if (focus) focusCell(i);
  }
  const openSub = (chat: string, sub: string) => page.activity?.(chat, sub);
  function open(id: string, into = -1) {
    const was = cells.slice(0, n).indexOf(id);
    if (was >= 0) return select(was, true);
    const at = into >= 0 && !full(into) ? into : firstEmpty();
    cells[at] = id;
    sel = at;
    claim(kind, id, set);
    save();
    paint();
    focusCell(at);
  }
  function move(from: number, to: number) {
    if (from === to) return;
    const was = Array.from({ length: n }, (_, i) => i);
    was.splice(to, 0, ...was.splice(from, 1));
    reorder(was);
  }
  function swap(a: number, b: number) {
    if (a === b) return;
    const was = Array.from({ length: n }, (_, i) => i);
    [was[a], was[b]] = [b, a];
    reorder(was);
  }
  function reorder(was: number[]) {
    const vs = new Map(views);
    views.clear();
    was.forEach((j, i) => vs.has(j) && views.set(i, vs.get(j)!));
    cells = was.map((j) => cells[j]);
    sel = was.indexOf(sel);
    save();
    keepingScroll(paint);
  }
  function next() {
    const at = new Set(cells.slice(0, n).filter(Boolean)), here = listed(mine, at, inTab);
    const by = (s: string) => [...agents.all.values()].filter((a) => here(a) && a.status === s).sort((x, y) => x.at - y.at);
    const a = [...by('asks'), ...by('done')].find((x) => x.id !== cells[sel]);
    if (!a) return setSave(`no ${K.one} needs you`);
    open(a.id);
  }
  function out(i: number) {
    const v = views.get(i);
    if (v && !v.id) v.view.stop();
    else if (!park(v)) v?.view.detach();
    views.delete(i);
    cells[i] = null;
    save();
    paint();
  }
  function toTab(i: number, ed?: string, go = true) {
    const a = get(cells[i]);
    if (!a || !openTab) return;
    const v = views.get(i);
    if (!park(v)) v?.view.detach();
    views.delete(i);
    cells[i] = null;
    save();
    openTab(a, ed, go);
  }
  function toSet(i: number, btn: Element) {
    const id = cells[i];
    if (!get(id)) return;
    setsMenu(kind, btn, set, async (to, how) => {
      if (cells[i] !== id) return;
      if (to?.orch && how.am === AM) return sendOrch(i, btn);
      if (how.am !== AM && !(await moveAway(get(id)!, how.am, to, how))) return;
      if (cells[i] !== id) return;
      if (how.am === AM && to?.ed) return toTab(i, to.ed, how.go);
      views.get(i)?.view.detach();
      views.delete(i);
      cells[i] = null;
      save();
      if (how.am === AM) sendTo!(kind, id!, to, how.go);
      paint();
      page.render();
    }, openTab && layouts?.(), get(id), !!sendTo && kind === 'chat');
  }
  function closeCell(i: number, sure = false) {
    const a = get(cells[i]);
    return a ? end(a.id, sure) : out(i);
  }
  async function closeOpened(d: Back) {
    const id = cells[d.i] === d.id ? d.id : views.get(d.i)?.tab!.chat || cells[d.i], a = get(id);
    if (!a || a.status === 'ended') return false;
    if (!(await ask({ title: `Close “${titleOf(a)}”?`, text: 'It ends this chat (it stays in its history).', confirm: true }))) return DECLINED;
    d.id = id!;
    return end(id!, true);
  }
  function sendOrch(i: number, at?: Element) {
    const a = get(cells[i]);
    if (!a || a.kind !== 'chat') return tell(at || boxes[i] || el, { title: 'No chat here to send', line: 'Orchestration lists chats; pick a chat window.', ms: 1500 });
    record('deck', `sent “${titleOf(a)}” to orchestration`, { kind, set, i, id: a.id, program: a.program, orch: true });
    out(i);
    toOrch([a.id]);
    page.render();
  }
  function bench(i: number, at?: Element) {
    const a = get(cells[i]);
    if (!a) return tell(at || boxes[i] || el, { title: 'Nothing to bench here', line: 'Bench works on a chat or terminal in a window.', ms: 1500 });
    if (a.kind === 'chat' && sendTo) return sendOrch(i, at);
    record('deck', `benched “${titleOf(a)}”`, { kind, set, i, id: a.id, program: a.program });
    out(i);
  }
  async function end(id: string, sure = false) {
    const a = agents.all.get(id), there = openAway(id);
    if (there) {
      const i = cells.indexOf(id), at = el.querySelector(`[data-dk-end="${CSS.escape(id)}"]`)?.closest('.dk-row') || (i >= 0 ? boxes[i] : el);
      if (i >= 0) out(i);
      return tell(at, { title: `Still open in Amethyst ${there}`, line: 'It keeps running there. Close it there to end it.' });
    }
    if (a && !sure && stillAt(a)) {
      const cv = (cells.indexOf(id) >= 0 ? views.get(cells.indexOf(id)) : null) || parked.get(id), r = await askEnd(`End “${titleOf(a)}”?`, stillAt(a), 'A chat can be picked up again from its history; a terminal and what runs in it stop.', a.kind === 'chat' && !!cv?.view.clear);
      if (r === 'restart') return cv?.view.clear?.();
      if (r !== 'close') return;
    }
    const i = cells.indexOf(id), v = i >= 0 ? views.get(i) : null, pv = v || parked.get(id);
    if (a?.kind === 'chat') record('deck', `closed “${titleOf(a)}”`, { kind, set, i, id, ended: true, session: a.session, draft: pv?.view.draft?.() ?? draftOf(id), pid: a.pid ?? S.pid, program: a.program });
    if (a) addClosed(a);
    if (v) {
      v.view.stop();
      views.delete(i);
      cells[i] = null;
    } else if (parked.has(id)) {
      parked.get(id)!.view.stop();
      parked.delete(id);
    } else api('DELETE', `/api/${a?.kind === 'term' ? 'term' : 'agent'}?id=${encodeURIComponent(id)}`, {}).catch(showErr);
    agents.all.delete(id);
    save();
    paint();
  }
  function setN(k: number) {
    if (!Number.isInteger(k) || k < 1 || k === n) return;
    cells = Array.from({ length: k }, (_, i) => cells[i] ?? null);
    n = k;
    if (spot !== null && (spot >= n || n < 2)) spot = null;
    build();
    save();
    paint();
  }
  function drop(i: number) {
    if (n <= 1 || i >= n) return;
    views.get(i)?.view.detach();
    cells.splice(i, 1);
    const vs = [...views];
    views.clear();
    for (const [j, v] of vs) if (j !== i) views.set(j > i ? j - 1 : j, v);
    hints.length = Math.min(hints.length, n - 1);
    n--;
    if (sel > i) sel--;
    sel = Math.min(sel, n - 1);
    if (spot === i || n < 2) spot = null;
    else if (spot > i) spot--;
    save();
    paint();
    build();
  }

  async function newAgent(x: number, y: number, into = -1, place = 'top', program = '') {
    if (kind === 'chat') {
      const go = (k: string) => start('chat:' + k, S.pid, into);
      if (program) return go(program);
      const more = bring && !ws && pref('agent:openRow') ? openChatMenu(S.pid, cells.slice(0, n), agentLine, (id) => bringIn(id, into)) : null;
      if (place === 'menu') return chatsOn().length === 1 ? go(chatsOn()[0][0]) : agentMenu(x, y, go, '', 'chat:', false, { place: 'agents', more });
      if (place === 'pick') return agentMenu(x, y, go, '', 'chat:', false, { place: 'agents', more });
      return launchAgent(place, x, y, go, 'chat:', more);
    }
    let terms: { available: boolean; programs: any[]; why?: string } = { available: false, programs: [] };
    try {
      terms = await api('GET', '/api/terms');
    } catch (e) {
      terms.why = agents.why || (e as Error).message;
    }
    const item = (k: string, label: string, hint: string, off = false) => `<button class="mi" data-k="${k}"${off ? ' disabled' : ''}${hint ? ` title="${esc(label)}&#10;${esc(hint)}"` : ''}><i class="tb-ic">${gem('term')}</i><span class="mi-n">${esc(label)}</span></button>`;
    const rows = terms.available ? terms.programs.filter((p) => termOn(p.id)).map((p) => item('term:' + p.id, p.name, p.installed ? '' : 'Not on this PC.', !p.installed)).join('') : `<button class="mi" disabled><span class="mi-n">${esc(terms.why || 'no terminals here')}</span></button>`;
    const html = menuHead(gem('term'), 'terminals') + bands({ pick: ['new terminal', rows] });
    popMenu(x, y, html, (btn) => start(btn.dataset.k!, S.pid, into));
  }
  async function bringIn(id: string, into: number) {
    const a = agents.all.get(id);
    if (!a) return tell(grid, { title: 'This chat is gone', line: 'It was closed while the menu was open.', ms: 2500 });
    if (!(await bring!(a))) return;
    open(id, into);
  }
  const firstEmpty = () => {
    for (let k = 0; k < n; k++) {
      const i = ((sel >= 0 ? sel + 1 : 0) + k) % n;
      if (!full(i)) return i;
    }
    setN(n + 1);
    return n - 1;
  };
  async function start(k: string, pid: string, into = -1) {
    if (k === 'chat' || k.startsWith('chat:')) {
      const at = into >= 0 && !full(into) ? into : firstEmpty();
      const e = chatIn(null, pid, { type: chatTabOf(k.slice(5)) });
      e.opened = true;
      views.set(at, e);
      sel = at;
      if (e.tab!.chat) moved(e);
      else {
        save();
        paint();
      }
      return focusCell(at);
    }
    try {
      const program = k.slice(5);
      const r = await api('POST', '/api/term', { program }, pid);
      started({ id: r.id, kind: 'term', program, pid });
      open(r.id, into);
    } catch (e) {
      showErr(e);
    }
  }

  async function openBeside({ session, program, title, pid }: { session: string; program?: string; title?: string; pid: string }) {
    const a = chatOfSession(session);
    if (a) {
      if (!(await takeHere(a))) return 'none';
      if (mine(a)) return open(a.id);
      show?.(a);
      return 'left';
    }
    const at = firstEmpty();
    const e = chatIn(null, pid, { resume: session, title, type: chatTabOf(program) });
    views.set(at, e);
    sel = at;
    if (e.tab!.chat) moved(e);
    else {
      save();
      paint();
    }
  }
  function reopen(session: string) {
    const c = store.get('deck:closed', []).find((x: Closed) => x.session === session);
    if (!c) return;
    dropClosed(session);
    openBeside(c);
    paintClosed();
  }
  $('.dk-closed').addEventListener('keydown', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-reopen]');
    if (!r || e.target !== r || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    reopen(r.dataset.dkReopen!);
  });
  el.addEventListener(
    'pointerdown',
    (e) => {
      const c = (e.target as HTMLElement).closest('[data-cell]') as HTMLElement;
      if (c) select(+c.dataset.cell!);
      else if (!(e.target as HTMLElement).closest('button,input,[data-dk-agent],.rs-sg')) select(-1);
    },
    true,
  );
  grid.addEventListener('contextmenu', (e) => {
    const nb = kind === 'chat' ? (e.target as HTMLElement).closest<HTMLElement>('.dk-hint [data-dk-new]') : null;
    if (nb && !e.defaultPrevented && (chatsOn().length > 1 || (!!bring && !ws && pref('agent:openRow')))) {
      e.preventDefault();
      const cell = +(nb.closest<HTMLElement>('[data-cell]')?.dataset.cell as string);
      return void newAgent(e.clientX, e.clientY, Number.isInteger(cell) ? cell : -1, 'pick');
    }
    if (e.defaultPrevented || (e.target as HTMLElement).closest('.dk-cell')) return;
    e.preventDefault();
    newAgent(e.clientX, e.clientY, -1, 'menu');
  });
  const rowMenu = (a: Agent, x: number, y: number, fly = ''): void => {
    const mk = mark && pref('marks:on') && a.session ? markFly(a, fly) : '';
    const actions = [renameItem(a) + (canFile('deck', a) ? moveItem('deck', a) : ''), mk].filter(Boolean).join('<div class="sep"></div>');
    popMenu(x, y, menuHead(gem('ai'), titleOf(a)) + bands({ actions, ...rowListBands('deck') }), (o) => {
      if (rowListPick('deck', o)) return;
      if (o.dataset.fly) return rowMenu(a, x, y, fly === o.dataset.fly ? '' : o.dataset.fly);
      if ('rename' in o.dataset) return renameAsk(a);
      if ('cfMv' in o.dataset) return moveSub('deck', a, o);
      if (o.dataset.mk == null) return;
      mark!(a.session!, markPick(a, +o.dataset.mk));
      paint();
    });
  };
  $('.dk-rail').addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask')) return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-agent]');
    if (kind !== 'chat') {
      if (row) return;
      e.preventDefault();
      return popMenu(e.clientX, e.clientY, menuHead(gem('term'), 'terminal list') + bands({ buttons: railButtons() }), (b) => b.dataset.rb && setPref(b.dataset.rb, !pref(b.dataset.rb)));
    }
    if (row) {
      const a = get(row.dataset.dkAgent);
      if (!a) return;
      if (!renameItem(a) && !canFile('deck', a) && !(mark && pref('marks:on') && a.session)) return;
      e.preventDefault();
      return rowMenu(a, e.clientX, e.clientY);
    }
    if (!(e.target as HTMLElement).closest('.dk-closed')) return;
    e.preventDefault();
    {
      const open = store.get('deck:closed-open', false);
      const show = `<button class="mi" data-cl-show title="${open ? 'Fold the chats' : 'Show the chats'}&#10;Lists the chats you closed above the bar; click one to open it again, \u00d7 forgets it."><i class="tb-ic">${ICONS.history}</i><span class="mi-n">${open ? 'fold the chats' : 'show the chats'}</span>${chip('click')}</button>`;
      const shows = topRow(!!pref('closed:on'), `data-cl title="Shows under the list&#10;Shows the closed chats bar under the agents list. The closed chats are kept either way; the agents list's menu brings the bar back."`, ICONS.archive, 'shows under the list');
      return popMenu(e.clientX, e.clientY, menuHead(ICONS.archive, 'closed chats') + bands({ actions: show, options: shows }), (b) => {
        if ('clShow' in b.dataset) return store.set('deck:closed-open', !open), paintClosed();
        setPref('closed:on', !pref('closed:on'));
      });
    }
  });
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask') || (lst ? lst.dragged() : fh!.dragged())) return;
    if (lst?.click(e)) return;
    if (subClear(e.target as HTMLElement, get)) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-spot],[data-dk-new],[data-dk-out],[data-dk-bench],[data-dk-orch],[data-dk-close],[data-dk-tab],[data-dk-set],[data-dk-pin],[data-dk-mark],[data-dk-report],[data-dk-end],[data-dk-agent],[data-dk-closed],[data-dk-reopen],[data-dk-forget],[data-dk-down],[data-dk-sub]');
    if (!b) return;
    const d = b.dataset, cell = +((b.closest('[data-cell]') as HTMLElement)?.dataset.cell as string);
    if (d.dkSub) return openSub(d.dkOf!, d.dkSub);
    if (grid.contains(b) && b.matches(HEAD_SEL))
      return headClick(b, {
        agent: () => get(cells[cell]),
        out: (_, sure) => closeCell(cell, sure),
        spot: () => spotlight(cell),
        bench: (at) => bench(cell, at),
        orch: (at) => sendOrch(cell, at),
        tab: () => toTab(cell),
        set: (at) => toSet(cell, at),
        pin: (a) => pin?.(agentPin(a, titleOf(a))),
        mark: (a, x, y) => mark && markMenu(a, x, y, mark, paint),
      }, e);
    if (d.dkClosed != null) {
      store.set('deck:closed-open', !store.get('deck:closed-open', false));
      return paintClosed();
    }
    if (d.dkForget) {
      dropClosed(d.dkForget);
      return paintClosed();
    }
    if (d.dkReopen) return reopen(d.dkReopen);
    if (d.dkMark) {
      const a = get(d.dkMark), r = anchorOf(b).getBoundingClientRect();
      return a && markMenu(a, r.left, r.bottom + 4, mark!, paint);
    }
    if (d.dkNew != null) return newAgent(b.getBoundingClientRect().left, b.getBoundingClientRect().bottom + 6, Number.isInteger(cell) ? cell : -1, kind === 'chat' && b.closest('.dk-hint') ? 'agents' : 'top');
    if (d.dkOut != null) return closeCell(cell, e.shiftKey);
    if (d.dkClose != null) return drop(cell);
    if (d.dkEnd) return end(d.dkEnd, e.shiftKey);
    if (d.dkAgent) return open(d.dkAgent);
  });
  const hover = (i: number) => {
    if (i === hot) return;
    hot = i;
    for (const r of list.querySelectorAll<HTMLElement>('.dk-row, .oc-row')) r.classList.toggle('hot', r.dataset.dkAgent === cells[i]);
  };
  grid.addEventListener('mouseover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.dk-cell');
    hover(c ? +c.dataset.cell! : -1);
  });
  grid.addEventListener('mouseleave', () => hover(-1));
  list.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask') || lst?.key(e)) return;
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-agent]');
    const s = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-sub]');
    if ((!r && !s) || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (s) openSub(s.dataset.dkOf!, s.dataset.dkSub!);
    else open(r!.dataset.dkAgent!);
  });
  const dropRow = (e: DragEvent) => {
    const r = (e.target as HTMLElement).closest?.<HTMLElement>('[data-dk-agent]');
    const file = fileDrag(e, S.dragging);
    return r && file && get(r.dataset.dkAgent)?.kind === 'chat' ? r : null;
  };
  const unlight = () => list.querySelector('.drop')?.classList.remove('drop');
  list.addEventListener('dragover', (e) => {
    const r = dropRow(e);
    if (!r?.classList.contains('drop')) unlight();
    if (!r) return;
    e.preventDefault();
    r.classList.add('drop');
  });
  list.addEventListener('dragleave', (e) => !list.contains(e.relatedTarget as Node) && unlight());
  list.addEventListener('drop', (e) => {
    unlight();
    const r = dropRow(e);
    if (!r) return;
    e.preventDefault();
    open(r.dataset.dkAgent!);
    views.get(sel)?.view.take?.(e);
  });

  function spotlight(i: number, to?: string) {
    if (!arrangeable || n < 2 || !(i >= 0 && i < n)) return;
    if (spotOn() && spot !== i) {
      swap(i, spot);
      if (!to || to === side) return;
      side = to;
    } else if (spot === i && !to) spot = null;
    else {
      spot = i;
      if (to) side = to;
    }
    arrange();
    fit();
    save();
    paint();
  }
  sgrip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !spotOn()) return;
    e.preventDefault();
    const m = room(), keys = Object.keys(SPOT_W).filter((k) => spotFits(SPOT_W[k], m));
    const sizes: any[] = keys.map((k) => [k, spotPx(SPOT_W[k], m)]), one = oneCol(m);
    if (!sizes.some(([, w]) => Math.abs(w - one) < 2)) sizes.push([null, one]);
    const c = boxes[spot].getBoundingClientRect(), g = grid.getBoundingClientRect(), half = m.gap / 2;
    const l = g.left + m.x, r = l + m.w, top = c.top, height = c.height;
    quitDrag = snapDrag(e, {
      grip: sgrip,
      sizes: sizes.map(([, w]) => w),
      at: (ev) => (side === 'left' ? ev.clientX - l - half : r - half - ev.clientX),
      box: (w) => ({ left: side === 'left' ? l : r - w, top, width: w, height, edge: side === 'left' ? l + w + half : r - w - half }),
      label: () => 'spotlight',
      apply(w, past) {
        spotW = sizes.find(([, s]) => s === w)[0];
        fit();
        save();
        if (past > 60 && keys.at(-1) !== 'q3') tell($('.dk-main'), { title: 'The other chats need room', line: 'The spotlight can’t be wider in a window this narrow.', ms: 2500 });
      },
    });
  });
  sgrip.addEventListener('dblclick', () => {
    if (spotW === null) return;
    spotW = null;
    fit();
    save();
  });
  grid.addEventListener('dblclick', (e) => {
    const hd = (e.target as HTMLElement).closest('.dk-ch');
    if (!hd || (e.target as HTMLElement).closest('button, input, textarea, select')) return;
    spotlight(+hd.parentElement!.dataset.cell!);
  });
  function land(from: number, p: { k: number; side: string }) {
    if (p.side) spotlight(from, p.side);
    else if (spotOn()) swap(from, p.k);
    else move(from, p.k);
  }
  const landing = document.createElement('div');
  landing.className = 'rs-land';

  grid.addEventListener('pointerdown', (e) => {
    const hd = (e.target as HTMLElement).closest<HTMLElement>('.dk-ch'), c = hd?.parentElement, from = c ? +c.dataset.cell! : -1, id = cells[from], a = get(id);
    if (!c || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, r0 = hd!.getBoundingClientRect();
    const stay = { k: from, side: '' };
    let ghost: HTMLElement | null = null, to = stay;
    const slot = (ev: PointerEvent) => {
      const r = grid.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return from;
      const cols = columns();
      const col = Math.floor((ev.clientX - r.left - GAP + grid.scrollLeft) / (c.offsetWidth + GAP));
      const row = Math.floor((ev.clientY - r.top - GAP + grid.scrollTop) / (c.offsetHeight + GAP));
      return Math.min(n - 1, Math.max(0, row) * cols + Math.min(cols - 1, Math.max(0, col)));
    };
    const aim = (ev: PointerEvent) => {
      if (!arrangeable || n < 2) return { ...stay, k: slot(ev) };
      const r = grid.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return stay;
      const zone = sideZone(r.width);
      if (x < zone || r.width - x < zone) {
        const s = x < zone ? 'left' : 'right';
        return spotOn() && spot === from && side === s ? stay : { ...stay, side: s };
      }
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.dk-cell');
      if (!t || !boxes.includes(t)) return spotOn() ? stay : { ...stay, k: slot(ev) };
      return t === c ? stay : { ...stay, k: +t.dataset.cell! };
    };
    const mark = (p: { k: number; side: string }) => {
      grid.querySelector('.drop')?.classList.remove('drop');
      if (!p.side) {
        landing.remove();
        if (p.k !== from) boxes[p.k]?.classList.add('drop');
        return;
      }
      const r = grid.getBoundingClientRect(), w = spotWidth(room());
      landing.style.cssText = `left:${p.side === 'left' ? r.left + GAP : r.right - GAP - w}px;top:${r.top + GAP}px;width:${w}px;height:${r.height - 2 * GAP}px`;
      landing.innerHTML = '<b>spotlight</b>';
      document.body.append(landing);
    };
    const drag = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        ghost = hd!.cloneNode(true) as HTMLElement;
        ghost.className = 'dk-ch dk-ghost';
        ghost.style.cssText = `width:${r0.width}px${a ? `;--gem-c:${crystalOf(id!).color}` : ''}`;
        document.body.append(ghost);
        hd!.insertAdjacentHTML('afterend', a ? `<div class="dk-ph"><i class="dk-mark">${markOf(a)}</i>${pref('deck:code', 'win') ? codeOf(id!, a.title || '') : ''}${pref('deck:title', 'win') && a.title ? `<b>${esc(a.title)}</b>` : ''}</div>` : `<div class="dk-ph"><b>${from + 1} empty</b></div>`);
        c.classList.add('dragged');
        document.body.classList.add('dk-sorting');
      }
      ghost.style.left = `${ev.clientX - (x0 - r0.left)}px`;
      ghost.style.top = `${ev.clientY - (y0 - r0.top)}px`;
      const p = aim(ev);
      if (p.k !== to.k || p.side !== to.side) mark((to = p));
    };
    const end = (ok: boolean) => {
      if (!ghost) return;
      ghost.remove();
      c.querySelector('.dk-ph')?.remove();
      c.classList.remove('dragged');
      mark(stay);
      document.body.classList.remove('dk-sorting');
      if (ok && cells[from] === id && to.k < n && (to.k !== from || to.side)) land(from, to);
    };
    quitDrag = track(e, { move: drag, end, esc: () => !!ghost });
  });

  const stepped = (d: number) => {
    const from = sel >= 0 ? sel : d > 0 ? -1 : n;
    for (let k = 1; k <= n; k++) {
      const i = (((from + d * k) % n) + n) % n;
      if (full(i)) return i;
    }
    return sel;
  };
  const onKey = (e: KeyboardEvent) => {
    if (el.hidden || !el.isConnected || !el.offsetWidth) return;
    if (kind === 'chat' && is(e, 'newChatN')) {
      const c = CHATS[+e.key - 1];
      if (!c) return;
      e.preventDefault();
      if (!chatOn(c[0])) return e.repeat || offTell(el, c[1]);
      if (!e.repeat) start('chat:' + c[0], S.pid);
      return;
    }
    if (is(e, 'newCell')) {
      e.preventDefault();
      if (!e.repeat) setN(n + 1);
      return;
    }
    if (kind === 'chat' && e.key === 'Delete' && !e.repeat && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (!inText() || (document.activeElement!.tagName === 'TEXTAREA' && !(document.activeElement as HTMLTextAreaElement).value)) && sel >= 0 && (el.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault();
      return closeCell(sel);
    }
    if (is(e, 'benchKey') && (el.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault();
      const c = document.activeElement?.closest?.<HTMLElement>('.dk-cell');
      if (!e.repeat) bench(c && el.contains(c) ? +c.dataset.cell! : Math.max(sel, 0));
      return;
    }
    if (kind === 'chat' && sendTo && is(e, 'orchKey') && (el.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault();
      const c = document.activeElement?.closest?.<HTMLElement>('.dk-cell');
      if (!e.repeat) sendOrch(c && el.contains(c) ? +c.dataset.cell! : Math.max(sel, 0));
      return;
    }
    if (is(e, 'railKey') && (el.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault();
      if (!e.repeat) toggleRail();
      return;
    }
    if (!inText() && views.get(sel)?.view?.key?.(e)) {
      e.preventDefault();
      return;
    }
    if (!inText() && is(e, 'find') && views.get(sel)?.view?.find) {
      e.preventDefault();
      return views.get(sel)!.view.find!();
    }
    if (kind === 'chat' && is(e, 'windowKey') && (el.contains(document.activeElement) || document.activeElement === document.body) && !document.activeElement?.closest?.('.cf-name')) {
      e.preventDefault();
      const at = document.activeElement?.closest?.<HTMLElement>('.dk-cell');
      if (at && el.contains(at) && +at.dataset.cell! !== sel) select(+at.dataset.cell!);
      const i = stepped(e.shiftKey ? -1 : 1);
      select(i);
      return landCell(i);
    }
    if (is(e, 'next')) next();
    else if (is(e, 'cellNext') || is(e, 'cellPrev')) select(stepped(is(e, 'cellNext') ? 1 : -1), true);
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const unwatch = onAgents(sync);
  const uncleared = onCleared(() => (el.hidden ? (stale = true) : paintList()));
  const unfolders = onFolders(() => (el.hidden ? (stale = true) : paintList()));

  build();
  sync();

  return {
    el,
    focus: () => focusCell(sel),
    newAgent,
    newChat: (program: string) => kind === 'chat' && start('chat:' + program, S.pid),
    attach: (rel: string) => views.get(sel)?.view.attach?.(rel),
    refresh() {
      el.hidden ? (stale = true) : paintList();
    },
    open,
    paintPins() {
      if (markSig() !== markKey) paint();
      for (const b of el.querySelectorAll<HTMLElement>('[data-dk-pin]')) {
        const a = get(b.dataset.dkPin), on = !!a && isPinned(agentPin(a, ''));
        b.classList.toggle('on', on);
        const word = on ? 'unpin' : 'pin', kind = a?.kind === 'chat' ? 'chat' : 'terminal';
        b.setAttribute('aria-label', word);
        if (b.classList.contains('dk-mi')) {
          b.removeAttribute('title');
          delete b.dataset.tip;
          b.lastChild!.textContent = word;
        } else b.title = on ? `Unpin\nThis ${kind} no longer stays at the top of the list.` : `Pin\nKeeps this ${kind} at the top of the list.`;
      }
    },
    letGo(id: string) {
      const i = cells.indexOf(id);
      if (i >= 0) out(i);
    },
    swap(old: string, id: string, i: number) {
      const was = cells.indexOf(old), free = i >= 0 && i < n && !cells[i] && (!views.has(i) || views.get(i)!.id === old);
      const at = was >= 0 ? was : free ? i : firstEmpty();
      cells[at] = id;
      claim(kind, id, set);
      save();
      el.hidden ? (stale = true) : paint();
    },
    take(id: string) {
      const at = firstEmpty();
      cells[at] = id;
      claim(kind, id, set);
      save();
      el.hidden ? (stale = true) : paint();
    },
    show(on: boolean) {
      if (on === !el.hidden) return;
      if (!on) {
        quitDrag?.();
        el.classList.add('seen');
        el.hidden = true;
        return;
      }
      el.hidden = false;
      stale = false;
      sync();
    },
    back(d: Back) {
      if (d.opened) return closeOpened(d);
      if (d.orch && d.id && owner(d.id)?.in === 'orch') claim(kind, d.id, set);
      const a = get(d.id), alive = a && a.status !== 'ended';
      if (!alive && !d.ended) return false;
      const at = d.i >= 0 && d.i < n && !cells[d.i] && !views.has(d.i) ? d.i : firstEmpty();
      if (alive) {
        cells[at] = d.id;
        claim(kind, d.id!, set);
      } else views.set(at, chatIn(null, d.pid, { resume: d.session, draft: d.draft, type: chatTabOf(d.program) }));
      d.at = at;
      sel = at;
      save();
      paint();
    },
    again(d: Back) {
      if (d.opened) {
        const at = d.i < n && !cells[d.i] && !views.has(d.i) ? d.i : firstEmpty();
        views.set(at, chatIn(null, d.pid, { type: chatTabOf(d.program) }));
        d.i = sel = at;
        save();
        paint();
        return;
      }
      if (!d.ended) {
        const i = cells.indexOf(d.id);
        if (i < 0) return false;
        out(i);
        if (d.orch && d.id) (toOrch([d.id]), page.render());
        return;
      }
      const v = views.get(d.at!), id = v?.tab!.chat || cells[d.at!];
      if (!id) return false;
      d.id = id;
      return end(id, true);
    },
    detach() {
      quitDrag?.();
      unwatch();
      uncleared();
      unfolders();
      fh?.off();
      lst?.off();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      for (const v of views.values()) v.view.detach();
      views.clear();
      for (const v of parked.values()) v.view.detach();
      parked.clear();
    },
  };
}
