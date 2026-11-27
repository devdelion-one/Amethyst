import { is } from '../base/binds.ts';
import { icon } from '../base/icon.ts';
import { newHint } from '../base/agentmenu.ts';
import { ask, bands, buttonMenu, chip, colorTray, ICONS, holdFocus, keyChip, menuHead, placeSubAgain, popMenu, subMenu, topRow } from '../base/controls.ts';
import { agentPin, api, atWs, isPinned, levelKey, S, wsColor } from '../base/model.ts';
import { page } from '../base/page.ts';
import { isOff, termOn, onPref, pref, PREFS, setOff, setPref } from '../base/prefs.ts';
import { agents, onAgents, started } from '../base/stream.ts';
import { freeSet, owner, place } from '../base/place.ts';
import { record } from '../base/undo.ts';
import { $, AM, amElse, amKey, esc, inText, quietly, setSave, showErr, store, track, uid } from '../base/util.ts';
import { gem, modeGem } from '../base/kinds.ts';
import { notify, tell } from '../base/notify.ts';
import { answers } from '../base/answer.ts';
import { openAway, shareCells } from '../base/windows.ts';
import { col } from '../base/theme.ts';
import { addClosed, askEnd, codeOf, crystalOf, groupOf, markOf, onCleared, spark, stillAt, titleOf, workVerb } from '../base/agentlook.ts';
import { onSize } from '../base/measure.ts';
import { anchorOf, SPOT_IC } from '../app/fold.ts';
import { agentHead, HEAD_BTNS, HEAD_SEL, headClick, offBtn, ORCH_TIP, paintHead, spotHtml, toolsSlot } from '../app/chathead.ts';
import type { HeadCan } from '../app/chathead.ts';
import { agentRow, headRow, markMenu } from '../base/agentrow.ts';
import { LIST_W, snapDrag } from '../app/chatlist.ts';
import type { Row } from '../base/agentrow.ts';
import { folderHost } from '../base/chatfolders.ts';
import type { Group } from '../base/chatfolders.ts';
import { onFolders } from '../base/folders.ts';
import type { Agent } from '../base/stream.ts';

type SetEntry = { id: string; label?: string; color?: string; mark?: string; [k: string]: unknown };
type LBox = [number, number, number, number, unknown?, unknown?];
type SetLayout = { id: string; color?: string; on?: boolean; boxes?: LBox[] };
type CellView = { el: HTMLElement; focus(): void; land?: (wait?: number) => unknown; detach(): void; stop(): void; home?: () => void; bar?: HTMLElement; draft?: () => string; clear?: () => unknown; take?: (e: DragEvent) => unknown; attach?: (rel: string) => unknown; key?: (e: KeyboardEvent) => unknown; find?: () => unknown };
export type MakeTerm<V> = (agent: { id: string | null }) => V;
type Cell = { id: string | null; view: CellView };
type Back = { i: number; id: string | null; ended?: boolean; pid: string; program?: string; at?: number };

const CELL = { w: 280 }, GAP = 6;
const GROUPS = [['asks', 'Needs you'], ['working', 'Working'], ['done', 'Done'], ['bench', 'Benched']];
const HEAD_IC: Record<string, string> = { asks: 'bell', done: 'check', bench: 'bench' };

const KIND: Record<string, { one: string; many: string; mark: string }> = {
  term: { one: 'terminal', many: 'terminals', mark: 'term' },
};
const orList = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} or ${w.at(-1)}` : w[0]);
const noneLine = () =>
  `<b>+ new</b> starts ${orList([['claude', 'claude'], ['codex', 'codex'], ['antigravity', 'agy'], ['cursor', 'agent'], ['copilot', 'copilot'], ['grok', 'grok'], ['gemini', 'gemini'], ['shell', 'a shell']].filter(([id]) => termOn(id)).map(([, w]) => w))}.`;


const gemStyle = (id: string) => (id ? ` style="--gem-c:${crystalOf(id).color}"` : '');
for (const k of ['rail:hideBtn', 'rail:showBtn']) onPref(k, () => document.querySelectorAll('.deck').forEach((d: any) => d.railBtns?.()));
const HIDE_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M10 3v10M5.5 6.2 7.3 8l-1.8 1.8"/></svg>';
const SHOW_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10 4 6 8l4 4"/></svg>';
export const HIDE_BTN = `<button type="button" class="dk-hide dk-rv" data-dk-hide aria-label="hide the list">${HIDE_IC}</button>`;
export const SHOW_BTN = `<button type="button" class="dk-show" data-dk-show aria-label="show the list">${SHOW_IC}</button>`;
export const TERM_NEW = `<button class="primary dk-plus" data-dk-new title="New terminal&#10;A terminal with claude, codex, gemini or a shell." aria-label="new"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg></button>`;
const prefRow = (k: string, attrs: string, ic: string, key = '') => topRow(!!pref(k), `${attrs} title="${esc(PREFS[k].label)}&#10;${esc(PREFS[k].desc || '')}"`, ic, esc(PREFS[k].label), key);
const railButtons = () => prefRow('rail:hideBtn', 'data-rb="rail:hideBtn"', icon('eyeOff'), keyChip('railKey')) + prefRow('rail:showBtn', 'data-rb="rail:showBtn"', icon('eye'));
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
export const SET_GROUPS = [['editor', 'editor'], ['term', 'terminals']];
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
    let h = kind === 'chat' ? '' : ss.map((x, j) => (group && own && x.id === here ? '' : setRow(x, j, n, own && x.id === here))).join('') + newRow('set', n, newChip(ic));
    if (kind === 'chat') {
      if ((orch || nc) && own) h += `<button class="mi" data-orch data-lbl="Orchestration" title="${esc(ORCH_TIP)}"><i class="dk-mark">${gem('orch')}</i>Orchestration${orch ? '<span class="d">out of this tab</span>' : ''}</button>`;
      else if (!own && (a || nc) && !group) h += `<button class="mi" data-orch${tagOf(n)} data-lbl="orchestration" title="${esc(`Orchestration of Amethyst ${n}\nMoves the chat into that Amethyst's orchestration list. It leaves this Amethyst and keeps running.`)}"><i class="dk-mark">${gem('orch')}</i>orchestration</button>`;
    }
    if (eds) h += (h ? '<div class="sep"></div>' : '') + eds.map((x, i) => edRow(x, i, n, look ? own && look.eds.includes(x.id) : !nc && own && !!x.on && here == null)).join('') + newRow('ed', n, newChip(modeGem('editor')));
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
  const back = { entry: s.list[i], at: i, n: saved.n };
  for (const a of [...agents.all.values()].filter(mineOf(kind, id))) {
    if (openAway(a.id)) continue;
    api('DELETE', `/api/term?id=${encodeURIComponent(a.id)}`, {}).catch(showErr);
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
  return (a: Agent) => a.kind === kind && !amElse(a) && !['orch', 'qagent'].includes(owner(a.id)?.in) && (a.pid || '') === pid && (set == null || setOf(kind, a.id) === set);
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
export function shareDeck() {
  shareCells(sets('term').list.flatMap(({ id }) => (store.get(keyOf('term', id), {}).cells || []).filter(Boolean)));
}

export function createDeck({ kind = 'term', set = '', openTab = null, layouts = null, inTab = null, sendTo = null, pin = null, mark = null, makeTerm }: { kind?: string; set?: string | null; openTab?: ((a: Agent, ed?: string, go?: boolean) => unknown) | null; layouts?: (() => SetLayout[]) | null; inTab?: ((a: Agent) => unknown) | null; sendTo?: ((kind: string, id: string, to: any, go?: boolean) => unknown) | null; pin?: ((p: ReturnType<typeof agentPin>) => unknown) | null; mark?: ((session: string, n: number) => unknown) | null; makeTerm: MakeTerm<CellView> }) {
  const K = KIND[kind], ws = atWs(), key = keyOf(kind, set), lvl = levelKey();
  const saved = store.get(key, {});
  let n = Number.isInteger(saved.n) && saved.n >= 1 ? saved.n : 4;
  let sel = saved.sel === -1 ? -1 : Math.min(Math.max(0, saved.sel | 0), n - 1);
  let hot = -1;
  let cells: (string | null)[] = Array.from({ length: n }, (_, i) => (typeof saved.cells?.[i] === 'string' ? saved.cells[i] : null));
  const views = new Map<number, Cell>();
  let rail = saved.rail === 'hidden' ? 'hidden' : 'show';
  const save = () => (store.set(key, { n, sel, cells, rail }), shareDeck());
  const mine = mineOf(kind, set);
  const get = (id: string | null | undefined) => {
    const a = id && agents.all.get(id);
    return a && mine(a) ? a : null;
  };

  const el = document.createElement('div');
  el.className = 'deck';
  el.dataset.kind = kind;
  el.innerHTML = `
    <div class="dk-main">
      <div class="dk-grid"></div>
    </div>
    <aside class="dk-rail">
      <div class="dk-grip" title="drag to make it wider or narrower">${SHOW_BTN}</div>
      <header class="dk-rhead">${ws ? `<span class="dk-ws" style="--wc:${esc(wsColor(S.ws))}" title="Workspace: ${esc(S.ws?.name || 'workspace')}&#10;The workspace's own ${K.many}: they work in its folder. A project's ${K.many} show in that project."><span class="ws-ic">${ICONS.workspaces}</span><b>${esc(S.ws?.name || 'workspace')}</b></span>` : ''}<span class="grow"></span>${HIDE_BTN}${TERM_NEW}</header>
      <div class="dk-list"></div>
    </aside>`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s)!;
  const grid = $('.dk-grid'), list = $('.dk-list');
  const asks = answers((id) => open(id));
  const boxes: HTMLElement[] = [];
  function setRail(look: string) {
    rail = look === 'hidden' ? 'hidden' : 'show';
    el.dataset.rail = rail === 'hidden' ? rail : 'full';
    paintRailBtns();
  }
  function paintRailBtns() {
    const hb = $('.dk-hide'), sb = $('.dk-show');
    hb.hidden = !pref('rail:hideBtn');
    sb.hidden = !pref('rail:showBtn');
    hb.title = `Hide the list\nHides the list of ${K.many}.\n\nDrag the line back out to show it again.`;
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
      grid.append(c);
    }
    fit();
  }
  function keepingScroll(fn: () => void) {
    const kept = [...grid.querySelectorAll('.xterm-viewport')].map((x) => [x, x.scrollTop] as [Element, number]);
    fn();
    for (const [x, t] of kept) x.scrollTop = t;
  }
  const colsFor = (w: number, k = n) => Math.min(k, Math.max(1, Math.floor((w + GAP) / (CELL.w + GAP))), Math.ceil(Math.sqrt(k)));
  type Room = { cw: number };
  const room = (): Room => ({ cw: grid.clientWidth });
  function fit(r = room()) {
    if (r.cw - 2 * GAP <= 0) return;
    const cols = colsFor(r.cw - 2 * GAP);
    if (grid.style.getPropertyValue('--cols') !== String(cols)) grid.style.setProperty('--cols', cols as unknown as string);
  }
  const columns = () => {
    fit();
    return +grid.style.getPropertyValue('--cols') || 1;
  };
  const ro = onSize([grid], { name: 'deck.fit', read: room, write: (r: Room) => fit(r) });
  const hints: HTMLElement[] = [];
  const hint = (i: number) => (hints[i] ||= Object.assign(document.createElement('div'), { className: 'dk-hint', innerHTML: newHint(K.one) }));
  function head(i: number) {
    const id = cells[i], a = get(id);
    if (!a) {
      if (id && !agents.loaded) return `<span class="dk-st">…</span>`;
      return `<span class="dk-st">empty</span><span class="grow"></span>${n > 1 ? '<button data-dk-close aria-label="close">×</button>' : ''}`;
    }
    return agentHead(a, can);
  }
  const can: HeadCan = { mark: !!mark, pin: !!pin, set: !!sendTo, tab: !!openTab, orch: false, bench: true };
  const markSig = () => JSON.stringify([S.marks, pref('marks:on'), pref('marks:names'), pref('deck:model', 'win'), pref('deck:code', 'win'), pref('deck:title', 'win'), pref('deck:rowCode'), pref('deck:rowInfo'), pref('deck:title2'), ...HEAD_BTNS.map((k) => pref(k, 'win'))]);
  let markKey = '';
  function paintCell(i: number) {
    const c = boxes[i];
    if (!c) return;
    c.classList.toggle('sel', i === sel);
    const id = cells[i], a = get(id);
    let v: Cell | null | undefined = views.get(i);
    if (v && v.id !== id) {
      v.view.detach();
      views.delete(i);
      v = null;
    }
    if (!v && a) views.set(i, (v = { id, view: makeTerm({ id }) }));
    c.classList.toggle('empty', !v);
    if (a) c.style.setProperty('--gem-c', crystalOf(a.id).color);
    else c.style.removeProperty('--gem-c');
    const hd = c.firstElementChild as HTMLElement;
    hd.toggleAttribute('data-ask', a?.status === 'asks');
    paintHead(hd, head(i), { bar: v?.view.bar, menu: null, home: () => v?.view.home?.() });
    const body = c.lastElementChild!, want = v ? v.view.el : hint(i);
    if (body.firstElementChild !== want) body.replaceChildren(want);
  }

  const repaintList = () => (el.hidden ? (stale = true) : paintList());
  const fh = folderHost(list, { list: 'deck', attr: 'data-dk-agent', agentOf: (id) => get(id), repaint: repaintList, on: false });
  function paintList() {
    const at = new Map<string, number>();
    cells.slice(0, n).forEach((id, i) => id && at.set(id, i));
    const here = listed(mine, at, inTab);
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
    const none = agents.why ? `<p class="dk-none err">${esc(agents.why)}</p>` : `<p class="dk-none">${agents.loaded ? `No ${K.many} in this ${ws ? 'workspace' : 'project'} yet. ${noneLine()}` : `Looking for ${K.many}…`}</p>`;
    el.toggleAttribute('data-asks', by.asks.length > 0);
    const drawn = fh.paint(GROUPS.map(([k, label]) => ({ k, label, list: by[k] })), head, row, none, asks.card);
    asks.keep(new Set(drawn.rows.filter((r) => r.a).map((r) => `${r.a!.id} ${r.a!.ask!.id}`)));
    markRows();
  }
  function markRows() {
    const here = sel >= 0 ? cells[sel] : null, warm = hot >= 0 ? cells[hot] : null;
    for (const r of list.querySelectorAll<HTMLElement>('.dk-row')) {
      const id = r.dataset.dkAgent;
      r.classList.toggle('here', !!id && id === here);
      r.classList.toggle('hot', !!id && id === warm);
    }
  }

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
  }
  function sync({ lineOnly = false } = {}) {
    if (levelKey() !== lvl) return;
    if (lineOnly) return el.hidden ? void (stale = true) : paintList();
    if (agents.loaded) {
      let out = false;
      cells = cells.map((id) => {
        if (!id || get(id)) return id;
        out = true;
        return null;
      });
      if (out) save();
    }
    paint();
  }

  const focusCell = (i: number) =>
    requestAnimationFrame(() => {
      boxes[i]?.scrollIntoView({ block: 'nearest' });
      views.get(i)?.view.focus();
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
    else v?.view.detach();
    views.delete(i);
    cells[i] = null;
    save();
    paint();
  }
  function toTab(i: number, ed?: string, go = true) {
    const a = get(cells[i]);
    if (!a || !openTab) return;
    views.get(i)?.view.detach();
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
    }, openTab && layouts?.(), get(id), false);
  }
  function closeCell(i: number, sure = false) {
    const a = get(cells[i]);
    return a ? end(a.id, sure) : out(i);
  }
  function bench(i: number, at?: Element) {
    const a = get(cells[i]);
    if (!a) return tell(at || boxes[i] || el, { title: 'Nothing to bench here', line: 'Bench works on a terminal in a window.', ms: 1500 });
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
      const r = await askEnd(`End “${titleOf(a)}”?`, stillAt(a), 'A terminal and what runs in it stop.', false);
      if (r !== 'close') return;
    }
    const i = cells.indexOf(id), v = i >= 0 ? views.get(i) : null;
    if (a) addClosed(a);
    if (v) {
      v.view.stop();
      views.delete(i);
      cells[i] = null;
    } else api('DELETE', `/api/term?id=${encodeURIComponent(id)}`, {}).catch(showErr);
    agents.all.delete(id);
    save();
    paint();
  }
  function setN(k: number) {
    if (!Number.isInteger(k) || k < 1 || k === n) return;
    cells = Array.from({ length: k }, (_, i) => cells[i] ?? null);
    n = k;
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
    save();
    paint();
    build();
  }

  async function newAgent(x: number, y: number, into = -1) {
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
  const firstEmpty = () => {
    for (let k = 0; k < n; k++) {
      const i = ((sel >= 0 ? sel + 1 : 0) + k) % n;
      if (!full(i)) return i;
    }
    setN(n + 1);
    return n - 1;
  };
  async function start(k: string, pid: string, into = -1) {
    try {
      const program = k.slice(5);
      const r = await api('POST', '/api/term', { program }, pid);
      started({ id: r.id, kind: 'term', program, pid });
      open(r.id, into);
    } catch (e) {
      showErr(e);
    }
  }

  el.addEventListener(
    'pointerdown',
    (e) => {
      const c = (e.target as HTMLElement).closest('[data-cell]') as HTMLElement;
      if (c) select(+c.dataset.cell!);
      else if (!(e.target as HTMLElement).closest('button,input,[data-dk-agent]')) select(-1);
    },
    true,
  );
  grid.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented || (e.target as HTMLElement).closest('.dk-cell')) return;
    e.preventDefault();
    newAgent(e.clientX, e.clientY, -1);
  });
  $('.dk-rail').addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask')) return;
    if ((e.target as HTMLElement).closest('[data-dk-agent]')) return;
    e.preventDefault();
    return popMenu(e.clientX, e.clientY, menuHead(gem('term'), 'terminal list') + bands({ buttons: railButtons() }), (b) => b.dataset.rb && setPref(b.dataset.rb, !pref(b.dataset.rb)));
  });
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask') || fh.dragged()) return;
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-new],[data-dk-out],[data-dk-bench],[data-dk-close],[data-dk-tab],[data-dk-set],[data-dk-pin],[data-dk-mark],[data-dk-end],[data-dk-agent]');
    if (!b) return;
    const d = b.dataset, cell = +((b.closest('[data-cell]') as HTMLElement)?.dataset.cell as string);
    if (grid.contains(b) && b.matches(HEAD_SEL))
      return headClick(b, {
        agent: () => get(cells[cell]),
        out: (_, sure) => closeCell(cell, sure),
        bench: (at) => bench(cell, at),
        tab: () => toTab(cell),
        set: (at) => toSet(cell, at),
        pin: (a) => pin?.(agentPin(a, titleOf(a))),
        mark: (a, x, y) => mark && markMenu(a, x, y, mark, paint),
      }, e);
    if (d.dkMark) {
      const a = get(d.dkMark), r = anchorOf(b).getBoundingClientRect();
      return a && markMenu(a, r.left, r.bottom + 4, mark!, paint);
    }
    if (d.dkNew != null) return newAgent(b.getBoundingClientRect().left, b.getBoundingClientRect().bottom + 6, Number.isInteger(cell) ? cell : -1);
    if (d.dkOut != null) return closeCell(cell, e.shiftKey);
    if (d.dkClose != null) return drop(cell);
    if (d.dkEnd) return end(d.dkEnd, e.shiftKey);
    if (d.dkAgent) return open(d.dkAgent);
  });
  const hover = (i: number) => {
    if (i === hot) return;
    hot = i;
    for (const r of list.querySelectorAll<HTMLElement>('.dk-row')) r.classList.toggle('hot', r.dataset.dkAgent === cells[i]);
  };
  grid.addEventListener('mouseover', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.dk-cell');
    hover(c ? +c.dataset.cell! : -1);
  });
  grid.addEventListener('mouseleave', () => hover(-1));
  list.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask')) return;
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-dk-agent]');
    if (!r || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    open(r.dataset.dkAgent!);
  });

  grid.addEventListener('pointerdown', (e) => {
    const hd = (e.target as HTMLElement).closest<HTMLElement>('.dk-ch'), c = hd?.parentElement, from = c ? +c.dataset.cell! : -1, id = cells[from], a = get(id);
    if (!c || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, r0 = hd!.getBoundingClientRect();
    let ghost: HTMLElement | null = null, to = from;
    const slot = (ev: PointerEvent) => {
      const r = grid.getBoundingClientRect();
      if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) return from;
      const cols = columns();
      const col = Math.floor((ev.clientX - r.left - GAP + grid.scrollLeft) / (c.offsetWidth + GAP));
      const row = Math.floor((ev.clientY - r.top - GAP + grid.scrollTop) / (c.offsetHeight + GAP));
      return Math.min(n - 1, Math.max(0, row) * cols + Math.min(cols - 1, Math.max(0, col)));
    };
    const mark = (k: number) => {
      grid.querySelector('.drop')?.classList.remove('drop');
      if (k !== from) boxes[k]?.classList.add('drop');
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
      const p = slot(ev);
      if (p !== to) mark((to = p));
    };
    const end = (ok: boolean) => {
      if (!ghost) return;
      ghost.remove();
      c.querySelector('.dk-ph')?.remove();
      c.classList.remove('dragged');
      mark(from);
      document.body.classList.remove('dk-sorting');
      if (ok && cells[from] === id && to < n && to !== from) move(from, to);
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
    if (is(e, 'newCell')) {
      e.preventDefault();
      if (!e.repeat) setN(n + 1);
      return;
    }
    if (is(e, 'benchKey') && (el.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault();
      const c = document.activeElement?.closest?.<HTMLElement>('.dk-cell');
      if (!e.repeat) bench(c && el.contains(c) ? +c.dataset.cell! : Math.max(sel, 0));
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
    refresh() {
      el.hidden ? (stale = true) : paintList();
    },
    open,
    paintPins() {
      if (markSig() !== markKey) paint();
      for (const b of el.querySelectorAll<HTMLElement>('[data-dk-pin]')) {
        const a = get(b.dataset.dkPin), on = !!a && isPinned(agentPin(a, ''));
        b.classList.toggle('on', on);
        const word = on ? 'unpin' : 'pin';
        b.setAttribute('aria-label', word);
        if (b.classList.contains('dk-mi')) {
          b.removeAttribute('title');
          delete b.dataset.tip;
          b.lastChild!.textContent = word;
        } else b.title = on ? 'Unpin\nThis terminal no longer stays at the top of the list.' : 'Pin\nKeeps this terminal at the top of the list.';
      }
    },
    letGo(id: string) {
      const i = cells.indexOf(id);
      if (i >= 0) out(i);
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
      const a = get(d.id), alive = a && a.status !== 'ended';
      if (!alive) return false;
      const at = d.i >= 0 && d.i < n && !cells[d.i] && !views.has(d.i) ? d.i : firstEmpty();
      cells[at] = d.id;
      claim(kind, d.id!, set);
      d.at = at;
      sel = at;
      save();
      paint();
    },
    again(d: Back) {
      const i = cells.indexOf(d.id);
      if (i < 0) return false;
      out(i);
    },
    detach() {
      quitDrag?.();
      unwatch();
      uncleared();
      unfolders();
      fh.off();
      ro.disconnect();
      document.removeEventListener('keydown', onKey);
      for (const v of views.values()) v.view.detach();
      views.clear();
    },
  };
}
