import { filesChanged, setMark, togglePin } from './actions.ts';
import { markMenu } from '../base/agentrow.ts';
import { agentMenu, launchAgent, pinOf } from '../base/agentmenu.ts';
import { ask, barMenu, flyFocus, ICONS, keepMenu, keyChip, menuHead, modeOrder, popMenu, railActions, setSwatches, sortable, sorting, topBarMenu, topRow } from '../base/controls.ts';
import { addSet, freeCell, setsHolding, agentLine, createDeck, dropSet, inCells, markSet, moveAway, moveSet, moveSetChats, cellsOf, chatsFromOrch, setChatsToOrch, nextColor, nextSet, orderHex, putInSet, restoreSet, swapInSet, setAgents, setAway, setColor, setInfo, setInfos, setOf, setOn, sets, setsMenu, setTurn, shareDeck, showSet, takeHere, toOrch } from '../decks/deck.ts';
import { aim, bottomBtns, freeAt, freeNear, homeBtns, moveRef, pinDropIn, placeAll, pullBtns, railSpots, slotDrag, slotHtml, topBtns, watchFold, watchSlots } from './slots.ts';
import type { SlotView } from './slots.ts';
import type { MoveHow } from '../decks/deck.ts';
import { agentHead, headClick, reportMenu } from './chathead.ts';
import type { HeadCan } from './chathead.ts';
import { anchorOf, foldHead } from './fold.ts';
import { codeOf, stillAt, titleOf } from '../base/agentlook.ts';
import { decks, decksMaker } from '../decks/decks.ts';
import { follow, here } from '../base/follow.ts';
import { gem, modeGem, pjMark, workGem, workMark } from '../base/kinds.ts';
import { icon } from '../base/icon.ts';
import { dockProjects, onPjHidden, pjHidden } from './pjhide.ts';
import { createResearch, researchInfo } from '../chat/research.ts';
import { createOrch, filesUnder, listSides, orchOrder, orchWidth, placeFiles } from '../orch/orch.ts';
import { addText, createChat } from '../chat/chat.ts';
import { isQuickChat, showQuickAgent } from '../chat/qagent.ts';
import { createTerm } from '../terminal/term.ts';
import { bound, modeBind, show } from '../base/binds.ts';
import { agentPin, api, atLaunch, atWs, keepMode, mode, modeFns, pjColor, projectOf, S, toEditor } from '../base/model.ts';
import { nextFrame, onSize } from '../base/measure.ts';
import { page } from '../base/page.ts';
import { chatsOn, isOff, onPref, pref, PREFS, setOff, setPref } from '../base/prefs.ts';
import { agentCounts, agents, onAgents, watchAgents } from '../base/stream.ts';
import { owner, place as putIn } from '../base/place.ts';
import { heldAnywhere, inTab, openAgent } from './groups.ts';
import { heldElsewhere, onHeld, WIN } from '../base/windows.ts';
import { notify, refuse, tell } from '../base/notify.ts';
import { every } from '../base/life.ts';
import { activeGroup, addEditor, allTabs, chatEds, letGoChat, dropEditor, editorLoad, editors, editorsOfAm, eds, findTab, giveAway, markEditor, moveEditor, newOfType, openInTab, showEditor, useOrch } from './tabs.ts';
import { col, paleOnFlip } from '../base/theme.ts';
import { record, undoer } from '../base/undo.ts';
import { $, AM, amElse, chatTabOf, esc, quietly, showErr, store } from '../base/util.ts';
import { imgsIn } from '../base/links.ts';
import type { Agent } from '../base/stream.ts';
import type { ChatPlace, ChatSpot, Project } from '../base/types.ts';

type ModeDef = { label?: string; what?: string; icon?: () => string };
type Info = { chats?: number; asks?: number; done?: number; working?: number; [k: string]: any };
type Peek = { b: HTMLElement; style: string; mk: boolean; base: string };
type NavEl = HTMLElement & { _shape?: string };

export const MODES: Record<string, ModeDef> = {
  editor: {},
  orch: { label: 'orchestration', what: 'One chat at a time.', icon: () => modeGem('orch') },
  chat: { label: 'agents', what: 'Every chat at once.', icon: () => modeGem('ai') },
  term: { label: 'terminals', what: 'Every terminal at once.', icon: () => gem('term') },
  research: { label: 'research', what: 'A chat and its subagents, side by side.', icon: () => gem('research') },
};
const NOUN: Record<string, string> = { orch: 'chat', chat: 'chat', term: 'terminal', research: 'chat' };
function orchInfo(): Info {
  const all = [...agents.all.values()].filter((a) => a.kind === 'chat' && (a.pid || '') === S.pid && !amElse(a));
  return { chats: all.length, ...Object.fromEntries(['asks', 'done', 'working'].map((st) => [st, all.filter((a) => a.status === st).length])), doneIds: all.filter((a) => a.status === 'done').map((a) => a.id) };
}
function editorInfo() {
  const inTabs = new Set(eds.flatMap((e) => allTabs(e.root)).map((t) => t.chat || t.term).filter(Boolean));
  let asks = 0;
  const doneIds: string[] = [];
  for (const a of agents.all.values()) {
    if (a.pid !== S.pid || !(inTabs.has(a.id) || heldElsewhere(a.id))) continue;
    if (a.status === 'asks') asks++;
    else if (a.status === 'done') doneIds.push(a.id);
  }
  return { asks, doneIds };
}
const infoOf = (k: string, id: string, tab?: ((a: Agent) => boolean) | null): Info => (k === 'orch' ? orchInfo() : k === 'research' ? researchInfo() : setInfo(k, id, tab));
const infosOf = (k: string, tab?: ((a: Agent) => boolean) | null) => {
  const all = k === 'research' || k === 'orch' ? null : setInfos(k, tab);
  return (id: string): Info => all?.get(id) ?? infoOf(k, id, tab);
};
export const PLUS = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>';
const onScreen = (): [any, any] => (mode() === 'editor' ? [null, null] : [mode(), setOn(mode())]);
let drawn = '', lastAll: SlotView[] = [];
export const railViews = () => lastAll;
let warmed = '';

export function attachToChat(path: string, over: Element = document.body) {
  if (decks.attach(...onScreen(), path) === undefined) refuse(over, { title: 'No chat is selected', line: 'Click a chat in the set first' });
}

export function setMode(m: string) {
  if (atLaunch() || !MODES[m] || ((m === 'research' || m === 'orch') && atWs())) return;
  if (isOff('modesHidden', m)) setOff('modesHidden', m, false);
  if (m === mode()) return decks.focus(...onScreen());
  keepMode(m);
  page.render();
  if (m !== 'editor') requestAnimationFrame(() => decks.focus(...onScreen()));
}

function orchFile(path: string) {
  if (!pref('orch:files')) setPref('orch:files', true);
  return openInTab(path);
}
function deckOpen(path: string) {
  return page.floatOpen(path) || (projectOf(S.pid) ? follow(here(path)) : openInTab(path));
}

export const ORCH_CAN: HeadCan = { mark: true, pin: true, set: true, bench: false, closeKey: 'orch:closeBtn', closeTip: "Close\nAsks where to close it from.", done: false, where: 'Orchestration' };
const joined = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
let closing = false;
async function orchClose(a: Agent, sure = false): Promise<'end' | 'left' | 'stay' | null> {
  if (closing) return null;
  closing = true;
  try {
    const id = a.id, still = stillAt(a);
    const rows = [
      ...setsHolding('chat', id).map((x) => ({ id: 'set:' + x.set, name: `chat set ${x.n}${x.label ? ` (${x.label})` : ''}` })),
      ...chatEds(id).map((x) => ({ id: 'ed:' + x.ed, name: x.orch ? 'Orchestration files panel' : `editor set ${x.n}${x.label ? ` (${x.label})` : ''}` })),
      { id: 'orch', name: 'orchestration' },
    ];
    const all = rows.map((r) => r.id), nameOf = (k: string) => rows.find((r) => r.id === k)!.name;
    const say = (n: number, total: number, on: string[]) =>
      !n ? 'Tick where to close it from.' : (still ? still + ' ' : '') + (n === total ? 'It ends everywhere; it stays in its history and the Closed list.' : `It keeps running in ${joined(all.filter((k) => !on.includes(k)).map(nameOf))}; it only leaves the ticked ${n === 1 ? 'place' : 'places'}.`);
    const r = sure ? { ticked: all } : await ask({
      title: `Close “${titleOf(a)}”?`,
      text: say(all.length, all.length, all),
      ticks: {
        items: rows.map((x) => ({ id: x.id, html: `<span>${esc(x.name)}</span>` })),
        say,
      },
      choices: [{ label: 'close', value: 'close' }],
    });
    const on: string[] = r?.ticked || [];
    if (!on.length) return null;
    if (!agents.all.has(id)) return 'left';
    for (const k of on.filter((x) => x.startsWith('set:'))) {
      const set = k.slice(4);
      if (decks.has('chat', set)) decks.letGo('chat', set, id);
      else freeCell('chat', set, id);
    }
    const ed = on.filter((x) => x.startsWith('ed:')).map((x) => x.slice(3));
    if (ed.length) letGoChat(id, ed);
    if (on.length === all.length) return 'end';
    return on.includes('orch') ? 'left' : 'stay';
  } finally {
    closing = false;
  }
}
const OPEN_TIP = 'Move to\nOpens the chat in a set. It stays here in orchestration too.';
const MOVE_TIP = 'Move to\nMoves the chat to another set: it leaves where it is now and stays here in orchestration.';
const openAt = (a: Agent) => ({ cells: setsHolding('chat', a.id), eds: chatEds(a.id).map((x) => x.ed), tab: findTab((t) => t.chat === a.id) });
const openSomewhere = (a: Agent) => {
  const o = openAt(a);
  return !!(o.cells.length || o.eds.length || o.tab);
};
async function bringHere(a: Agent) {
  if (!(await takeHere(a))) return false;
  const now = openAt(a);
  for (const x of now.cells) decks.has('chat', x.set) ? decks.letGo('chat', x.set, a.id) : freeCell('chat', x.set, a.id);
  if (now.tab) giveAway(now.tab.t.id);
  if (now.eds.length) await letGoChat(a.id, now.eds);
  return true;
}
function orchToSet(a: Agent, btn: Element, layouts = false, done?: () => void, more: { html: string; pick: (b: HTMLElement) => unknown } | null = null, beside: HTMLElement | null = null) {
  const was = openAt(a), look = { verb: openSomewhere(a) ? 'move to' : 'open in', eds: was.eds };
  setsMenu('chat', btn, inCells('chat').has(a.id) ? setOf('chat', a.id) : null, async (to, how) => {
    if (how.am !== AM) return moveAway(a, how.am, to, how);
    if (!(await bringHere(a))) return;
    if (to?.ed != null) await openAgent(a, String(to.ed), how.go);
    else sendChat('chat', a.id, to, how.go);
    done?.();
  }, layouts ? editors() : null, a, false, more, look, beside);
}
const orchHead = {
  html: (a: Agent, info: string) => agentHead(a, { ...ORCH_CAN, setTip: openSomewhere(a) ? MOVE_TIP : OPEN_TIP, info }),
  act: (b: HTMLElement, a: Agent | null, done: () => void, e?: MouseEvent) =>
    headClick(b, {
      agent: () => a,
      pin: (x) => togglePin(agentPin(x, titleOf(x))),
      set: (at) => a && orchToSet(a, at, true, done),
      out: (_, sure) => a && orchClose(a, sure),
      mark: (x, l, t) => markMenu(x, l, t, setMark, done),
    }, e),
};

decksMaker((k: string, set: string | null) => {
  const d = k === 'orch' ? createOrch({ head: orchHead, makeChat: createChat, makeTerm: createTerm, filesChanged, openFile: orchFile, claim: takeHere, heldAt, moveOut: (a, btn, done, more, beside) => orchToSet(a, btn, true, done, more, beside), mark: setMark, close: orchClose, verb: (a) => (openSomewhere(a) ? 'move to' : 'open in'), report: (a, at) => reportMenu(a, at) }) : k === 'research' ? createResearch({ sendTo: sendChat, openTab: openAgent, show: showAgent, openFile: deckOpen, filesChanged, moveTo: (btn, pick) => setsMenu('chat', btn, null, pick) }) : createDeck({ kind: k, set, openTab: atWs() ? null : openAgent, layouts: atWs() ? null : editors, inTab: atWs() ? null : heldAnywhere, sendTo: atWs() ? null : sendChat, pin: atWs() ? null : togglePin, mark: atWs() ? null : setMark, show: showAgent, bring: atWs() ? null : bringHere, openFile: deckOpen, filesChanged, makeChat: createChat, makeTerm: createTerm });
  $('#decks').append(d.el);
  return d;
});

export function renderModes() {
  watchAgents(atLaunch() ? '' : S.wid);
  if (WIN === 1) shareDeck();
  const m = mode();
  $('#app').classList.toggle('decked', m !== 'editor');
  const orch = m === 'orch' && !atLaunch() && !atWs();
  $('#app').classList.toggle('orch', orch);
  $('#app').classList.toggle('orch-files', orch && !!pref('orch:files'));
  $('#app').classList.toggle('orch-nolist', orch && !pref('orch:list'));
  $('#app').classList.toggle('orch-under', orch && filesUnder());
  const o = orchOrder(), files = o.indexOf('files'), chat = o.indexOf('chat');
  for (const [i, k] of o.entries()) $('#app').style.setProperty('--o-' + k, String(i * 2 + 2));
  $('#app').style.setProperty('--o-grip', String(chat * 2 + 2 + (files < chat ? -1 : 1)));
  $('#app').classList.toggle('orch-apart', Math.abs(files - chat) > 1);
  const lo = o.indexOf('list') * 2 + 2, ls = listSides();
  $('#app').style.setProperty('--o-lgl', String(lo - 1));
  $('#app').style.setProperty('--o-lgr', String(lo + 1));
  const nolist = !pref('orch:list');
  $('#app').classList.toggle('orch-lgl', !!ls.l);
  $('#app').classList.toggle('orch-lgr', !!ls.r && !(nolist && ls.l));
  $('#app').classList.toggle('orch-lmid', nolist && !!ls.l && !!ls.r);
  $('#decks').style.setProperty('--orch-w', orchWidth() ? orchWidth() + 'px' : '');
  if (!atLaunch() && !atWs()) useOrch(orch);
  placeFiles();
  $('#app').classList.toggle('noagent', m !== 'editor' && m !== 'chat' && m !== 'orch');
  const at = m !== 'editor' ? `${m}|${S.wid}|${S.pid}` : '';
  if (at !== warmed) {
    warmed = at;
    if (m === 'chat' || m === 'research' || m === 'orch') quietly(api('POST', '/api/agent/warm', { ...(pinOf('top') ? { agent: pinOf('top') } : {}) }, S.pid));
  }
  decks.at(atLaunch() ? '' : `${S.wid}|${S.pid}`);
  decks.show(...((at ? [m, setOn(m)] : [null]) as [any, any]));
  decks.refresh(...onScreen());
  paintSwitch();
  paintProjects();
}

export function paintSwitch() {
  paintHere();
  const sw = $('#switch');
  sw.hidden = atLaunch();
  if (sw.hidden) return;
  const m = mode(), ws = atWs(), lys = editors();
  const marks = (info: Info, k: string) => {
    const st = info.asks ? 'asks' : info.done ? 'done' : '';
    return `${st ? `<b class="md-n" data-st="${st}">${info[st]}</b>` : ''}${info.working && pref('switch:wkOn') ? workMark() : ''}`;
  };
  const said = (info: Info) => [info.asks && `${info.asks} need${info.asks === 1 ? 's' : ''} you`, info.done && `${info.done} finished`, info.working && `${info.working} working`].filter(Boolean).join(', ');
  const main = (k: string, on: boolean, icon: string, name: string, say: string, badge: string, key: [string, string], color = '', last = false, empty = false, drag = false, mk = '') => {
    const advice = [key[1], drag && 'Hold and drag it to another cell of the rail.'].filter(Boolean).join('\n'), rest = `${say}${last ? ' Last used.' : ''}${advice ? '\n\n' + advice : ''}`;
    return `<button data-mode="${k}" class="${on ? 'on' : ''}${last ? ' last' : ''}${empty ? ' empty' : ''}${mk ? ' mk' : ''}${paleOnFlip(color) ? ' pale' : ''}"${color || mk ? ` style="${color ? `--ly-c:${esc(color)};` : ''}${mk ? `--mk:${esc(col(mk))}` : ''}"` : ''} title="${esc(name)}&#10;${esc(rest)}" data-tip-keys="${esc(key[0])}" aria-label="${esc(name)}">${icon}${badge}</button>`;
  };
  const keys = (k: string, what: string, again = '', more = ''): [string, string] => [[modeFns()[k] && `fn:${k}:${what}`, `${modeBind(k)}:${what}${again ? `, again: ${again}` : ''}`, more].filter(Boolean).join(';'), again ? `Press the key again for the ${again}.` : ''];
  const said2 = (info: Info) => (said(info) ? ` ${said(info)}.` : '');
  const tabbed = ws ? null : heldAnywhere, views: SlotView[] = [];
  const view = (kind: string, id: string, html: string, shown = true) => views.push({ kind, ref: `${kind}:${id}`, html, shown });
  const style = (color: string, mk?: string) => `${color ? `--ly-c:${esc(color)}` : ''}${color && mk ? ';' : ''}${mk ? `--mk:${esc(col(mk))}` : ''}`;
  const tip2 = 'Hold and drag it to another cell. Right-click for its color, mark, close or a new view.';
  if (ws) view('editor', 'ws', main('editor', m === 'editor' && !S.wsEditor, ICONS.projects, 'Projects', 'The projects of this workspace.', '', keys('editor', 'projects'), '', false, false, true));
  else {
    const { asks, doneIds } = editorInfo(), done = doneIds.length;
    const badge = asks ? `<b class="md-n" data-st="asks">${asks}</b>` : done ? `<b class="md-n" data-st="done">${done}</b>` : '';
    const left = m !== 'editor' && lys.length > 1, live = pref('edWork');
    const working = eds.map((e) => allTabs(e.root).filter((t) => /^(working|starting)$/.test(agents.all.get((t.chat || t.term)!)?.status || '')).length);
    const wk = (i: number) => (working[i] ? ` ${working[i]} chat${working[i] === 1 ? ' is' : 's are'} working.` : '');
    const wkB = (i: number) => (live && working[i] ? workMark() : '');
    const wkSay = working[0] ? ` ${working[0]} chat${working[0] === 1 ? ' is' : 's are'} working.` : '';
    view('editor', lys[0].id, main('editor', m === 'editor' && lys[0].on, modeGem('editor'), 'Editor', `The explorer and your tabs.${wkSay}`, badge + wkB(0), keys('editor', 'editor', 'next layout'), setColor(0, 'editor', lys[0].color), left && lys[0].on, false, true, lys[0].mark));
    lys.slice(1).forEach((e, j) => {
      const i = j + 1, tip = `Layout ${i + 1}\n${e.empty ? 'An empty layout.' : e.names.length ? `Tabs: ${e.names.join(', ')}.` : 'A new tab.'}${wk(i)}${e.on ? (left ? ' Last used.' : ' On screen.') : ''}\n\n${tip2}`;
      view('editor', e.id, `<button class="ly${m === 'editor' && e.on ? ' cur' : ''}${left && e.on ? ' last' : ''}${e.empty ? ' empty' : ''}${e.mark ? ' mk' : ''}${paleOnFlip(setColor(i, 'editor', e.color)) ? ' pale' : ''}" style="${style(setColor(i, 'editor', e.color), e.mark)}" data-ed="${e.id}" data-n="${i + 1}" title="${esc(tip)}" aria-label="layout ${i + 1}">${modeGem('editor')}${wkB(i)}</button>`);
    });
  }
  for (const k of ['orch', 'chat', 'term', 'research']) {
    if ((k === 'research' || k === 'orch') && ws) continue;
    const shown = !isOff('modesHidden', k) || m === k;
    const { list, on } = sets(k), infoAt = infosOf(k, tabbed), left = m !== k && list.length > 1, first = infoAt(list[0].id), label = MODES[k].label!;
    const again = k === 'chat' && !ws ? 'next set' : '', more = k === 'orch' ? '=tab:the next chat, top to bottom' : '';
    view(k, list[0].id, main(k, m === k && on === list[0].id, MODES[k].icon!(), label[0].toUpperCase() + label.slice(1), `${MODES[k].what}${said2(first)}`, marks(first, k), keys(k, label, again, more), setColor(0, k, list[0].color), left && on === list[0].id, !first.chats, true, list[0].mark as string), shown);
    list.slice(1).forEach((x, j) => {
      const i = j + 1, info = infoAt(x.id), empty = !info.chats, st = said(info);
      const tip = `Set ${i + 1}\n${empty ? `No ${MODES[k].label} yet.` : `${info.chats} ${NOUN[k]}${info.chats === 1 ? '' : 's'}${st ? `: ${st}` : ''}.`}${x.id === on ? (m === k ? ' On screen.' : ' Last used.') : ''}\n\n${tip2}`;
      view(k, x.id, `<button class="ly${m === k && x.id === on ? ' cur' : ''}${left && x.id === on ? ' last' : ''}${empty ? ' empty' : ''}${x.mark ? ' mk' : ''}${paleOnFlip(setColor(i, k, x.color)) ? ' pale' : ''}" style="${style(setColor(i, k, x.color), x.mark as string)}" data-set="${esc(x.id)}" data-n="${i + 1}" title="${esc(tip)}" aria-label="set ${i + 1}">${MODES[k].icon!()}${marks(info, k)}</button>`, shown);
    });
  }
  const order = modeOrder();
  views.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const all = [...topBtns(), ...views, ...bottomBtns()];
  lastAll = all;
  const { at, first, fresh } = placeAll(all);
  if (!ws && first) freezeColors();
  if (!ws && fresh.some((r) => !r.startsWith('btn:'))) syncOrders(at);
  if (sw.classList.contains('dragging')) return;
  const html = slotHtml(all, at);
  if (drawn !== html) {
    drawn = html;
    pullBtns(sw);
    sw.innerHTML = html;
  }
  homeBtns(sw);
}
const SLOT_KINDS = ['orch', 'chat', 'term', 'research'];
function freezeColors() {
  editors().forEach((e, i) => e.color || !orderHex(i, 'editor') || markEditor(e.id, { color: orderHex(i, 'editor') }));
  setTurn('editor', Math.max(0, eds.length - 1));
  for (const k of SLOT_KINDS) {
    const { list } = sets(k);
    list.forEach((x, i) => x.color || !orderHex(i, k) || markSet(k, x.id, { color: orderHex(i, k) }));
    setTurn(k, Math.max(0, list.length - 1));
  }
}
const seq = (s: number | undefined) => (s == null ? 1e9 : s < 0 ? 1e6 + s : s);
function syncOrders(at: Record<string, number>) {
  const by = (k: string, ids: string[]) => [...ids].sort((a, b) => seq(at[`${k}:${a}`]) - seq(at[`${k}:${b}`]));
  by('editor', eds.map((e) => e.id)).forEach((id, i) => eds[i]?.id !== id && moveEditor(id, i));
  for (const k of SLOT_KINDS) by(k, sets(k).list.map((x) => x.id)).forEach((id, i) => sets(k).list[i]?.id !== id && moveSet(k, id, i));
}
const allRefs = () => [
  ...topBtns().map((v) => v.ref),
  ...(atWs() ? ['editor:ws'] : eds.map((e) => `editor:${e.id}`)),
  ...SLOT_KINDS.filter((k) => !atWs() || (k !== 'orch' && k !== 'research')).flatMap((k) => sets(k).list.map((x) => `${k}:${x.id}`)),
  ...bottomBtns().map((v) => v.ref),
];
export const NEW_KINDS: [string, string][] = [['chat', 'agents set'], ['editor', 'editor layout'], ['term', 'terminals']];
export const NEW_BINDS: Record<string, string> = { chat: 'newSetChat', editor: 'newLayout', term: 'newSetTerm' };
export function newView(kind: string, slot: number | null = null) {
  if (atLaunch() || atWs()) return;
  aim(kind, slot);
  if (kind === 'editor') return addEditor(nextColor('editor'));
  toSet(kind, (addSet(kind), setOn(kind)));
}
function landSlot(ref: string) {
  const b = $<HTMLElement | null>(`#switch .sv[data-ref="${CSS.escape(ref)}"] > :is(button, a)`);
  b?.classList.add('landed');
  b?.addEventListener('animationend', () => b.classList.remove('landed'), { once: true });
}
function dropRef(ref: string, slot: number) {
  if (!moveRef(ref, slot, allRefs())) return;
  drawn = '';
  paintSwitch();
  if (!atWs()) syncOrders(railSpots());
  landSlot(ref);
}
slotDrag($('#switch'), dropRef);
pinDropIn($('#switch'), dropRef);
watchFold($('#switch'));
watchSlots($('#switch'), () => {
  drawn = '';
  paintSwitch();
});
function toSet(kind: string, id: string) {
  showSet(kind, id);
  if (mode() !== kind) return setMode(kind);
  page.layout();
  renderModes();
  requestAnimationFrame(() => decks.focus(...onScreen()));
}
export function sendChat(kind: string, id: string, set?: string | null, go = true) {
  set ??= addSet(kind, false);
  decks.has(kind, set) ? decks.take(kind, set, id) : putInSet(kind, id, set);
  go ? toSet(kind, set) : paintSwitch();
}
export const chatPlaces = (a: Agent, btn: HTMLElement, pick: (to: any, how: MoveHow) => unknown) => setsMenu('chat', btn, null, pick, atWs() ? null : editors(), a, !atWs());
export async function chatTo(id: string, to: any, how: MoveHow) {
  const a = agents.all.get(id);
  if (!a) return;
  if (how.am !== AM) return void (await moveAway(a, how.am, to, how));
  if (to?.orch) {
    toOrch([id]);
    return how.go ? setMode('orch') : page.render();
  }
  if (to && 'ed' in to) return openAgent(a, to.ed, how.go);
  sendChat('chat', id, to, how.go);
}
export const agentTab = (program: string) => newOfType(chatTabOf(program), activeGroup());
export function addAgent(kind = 'chat', b = $('#btn-newchat'), program = '', at?: [number, number], place = 'top') {
  const r = b?.offsetWidth ? b.getBoundingClientRect() : null, x = at ? at[0] : r ? r.right + 6 : 40, y = at ? at[1] : r?.top ?? 24;
  if (kind === 'chat' && mode() === 'editor' && !atWs()) {
    if (program) return agentTab(program);
    return launchAgent(place, x, y, agentTab);
  }
  if (kind === 'chat' && mode() === 'orch' && !atLaunch() && !atWs()) return decks.newAgent(...onScreen(), x, y, -1, place, program);
  setMode(kind);
  requestAnimationFrame(() => decks.newAgent(...onScreen(), x, y, -1, place, program));
}
export async function showAgent(a: Agent) {
  if (!(await takeHere(a))) return;
  if (inTab(a)) {
    toEditor();
    openAgent(a);
    return page.render();
  }
  if (isQuickChat(a.id)) return showQuickAgent();
  const o = owner(a.id)?.in;
  if (o === 'orch') {
    setMode('orch');
    return requestAnimationFrame(() => decks.open('orch', setOn('orch'), a.id));
  }
  if (o === 'research') {
    setMode('research');
    return decks.open('research', setOn('research'), a.id);
  }
  const set = setOf(a.kind, a.id);
  toSet(a.kind, set);
  decks.open(a.kind, set, a.id);
}
const landed = new Set<string>();
function land() {
  if (WIN !== 1 || atWs() || S.switching) return;
  for (const a of agents.all.values()) {
    const p = a.place;
    if (!p || a.kind !== 'chat' || (a.am || 1) !== AM || a.status === 'ended' || landed.has(a.id + ':' + p.at)) continue;
    if (!p.go && (a.pid || '') !== S.pid) continue;
    landed.add(a.id + ':' + p.at);
    void landChat(a, p);
  }
}
async function landChat(a: Agent, p: ChatPlace) {
  try {
    if (p.go && (a.pid || '') !== S.pid) {
      if (!a.pid || !projectOf(a.pid)) return;
      await page.switchLevel(a.pid);
      if (S.pid !== a.pid) return;
    }
    const near = p.near && owner(p.near)?.in === 'chat' ? setOf('chat', p.near) : null;
    if (near != null && setInfo('chat', near).filled.some((f) => !f)) sendChat('chat', a.id, near, p.go);
    else if (p.orch) {
      for (const x of setsHolding('chat', a.id)) decks.has('chat', x.set) ? decks.letGo('chat', x.set, a.id) : freeCell('chat', x.set, a.id);
      putIn(a.id, { in: 'orch' });
      if (p.go) {
        setMode('orch');
        requestAnimationFrame(() => decks.open(...onScreen(), a.id));
      } else if (mode() === 'orch') decks.refresh(...onScreen());
    } else if (p.set != null || p.ed != null) await putChat(a, p, p.go);
    if (p.go && p.from !== AM) notify(`Moved here from Amethyst ${p.from}. It kept running.`, { ms: 4000 });
  } finally {
    quietly(api('PUT', '/api/agent/owner', { id: a.id, done: p.at }, a.pid ?? S.pid));
  }
}
onAgents(land);
const drafted = new Set<string>();
function takeDrafts() {
  if (WIN !== 1) return;
  for (const a of agents.all.values()) {
    const d = a.draft;
    if (!d || a.kind !== 'chat' || (a.am || 1) !== AM || drafted.has(a.id + ':' + d.at)) continue;
    drafted.add(a.id + ':' + d.at);
    addText(a.id, d.text);
    quietly(api('POST', '/api/chats/draft', { id: a.id, done: d.at }, a.pid ?? S.pid));
  }
}
onAgents(takeDrafts);
const reviewed = new Set<string>();
function takeReviews() {
  if (WIN !== 1) return;
  for (const a of agents.all.values()) {
    const r = a.review;
    if (!r || a.kind !== 'chat' || (a.am || 1) !== AM || reviewed.has(a.id + ':' + r.at)) continue;
    reviewed.add(a.id + ':' + r.at);
    page.review?.(a.id, r.path);
    quietly(api('POST', '/api/chats/review', { id: a.id, done: r.at }, a.pid ?? S.pid));
  }
}
onAgents(takeReviews);

const pics = (text: string) => imgsIn(text).map((x) => String(x.rel)).filter((r) => r.startsWith('.amethyst/images/'));
export const goTo = (a: Agent) => (WIN === 1 ? showAgent(a) : window.amethyst?.report?.open(a.id, AM));
export function chatFromText(btn: HTMLElement, text: string, done: (said: string) => void, program = '') {
  const chats = [...agents.all.values()].filter((a) => a.kind === 'chat' && a.status !== 'ended' && (a.pid || '') === S.pid && (a.am || 1) === AM).sort((x, y) => y.at - x.at).slice(0, 8);
  const pick = (to: any, how: MoveHow) => void handOff(btn, text, to, how, program || undefined).then((said) => said && done(said)).catch(showErr);
  setsMenu('chat', btn, null, pick, WIN === 1 ? editors() : editorsOfAm(AM, S.pid), { chats, pid: S.pid });
}
async function handOff(btn: HTMLElement, text: string, to: any, how: MoveHow, program?: string): Promise<string | null> {
  if (to?.chat) {
    const a = agents.all.get(to.chat);
    if (!a || a.status === 'ended') return void tell(btn, { title: 'That chat has ended', ms: 2000 }), null;
    const code = codeOf(a.id);
    if (how.draft) await api('POST', '/api/chats/draft', { chat: a.id, text }, a.pid ?? S.pid);
    else await api('POST', '/api/chats/send', { chat: a.id, text, attach: pics(text) }, a.pid ?? S.pid);
    if (how.go) void goTo(a);
    else notify(how.draft ? `Put in ${code}'s box, unsent. You stayed here.` : `Sent to ${code}. You stayed here; it's working on it.`, { ms: 4000 });
    return how.draft ? `put in ${code}'s box` : `sent to ${code}`;
  }
  const on = chatsOn();
  if (!on.length) return void tell(btn, { title: 'No chat agent is turned on', line: 'turn one on in settings → agents → agents in use', ms: 2500 }), null;
  if (!program) program = pinOf('text');
  if (!program && on.length > 1) {
    const r = btn.getBoundingClientRect();
    return new Promise((ok, no) => agentMenu(r.left, r.bottom + 4, (k) => handOff(btn, text, to, how, k).then(ok, no), '', '', false, { place: 'text' }));
  }
  const set = to && typeof to === 'object' ? `ed:${to.ed}` : to == null ? '+' : String(to);
  const r = await api('POST', '/api/chats/new', { agent: program || on[0][0], text, set, follow: how.go, amethyst: how.am, ...(how.draft ? { draft: true } : { attach: pics(text) }) });
  const where = how.am === AM ? how.label : `Amethyst ${how.am} · ${how.label}`;
  if (how.go && (WIN !== 1 || how.am !== AM)) window.amethyst?.openAmethyst?.(how.am);
  else if (!how.go) notify(`${esc(r.chat)} started in ${esc(where)}${how.draft ? ', with your text in its box, unsent' : ''}. You stayed here.`, { ms: 5000 });
  return `${r.chat} started`;
}
async function putChat(a: Agent, p: ChatSpot, go: boolean) {
  if (p.ed != null) return openAgent(a, p.ed === '+' ? 'new' : p.ed, go);
  sendChat('chat', a.id, p.set?.startsWith('+') ? freshSet(p.set) : sets('chat').list.some((x) => x.id === p.set) ? p.set : setOn('chat'), go);
}
const fresh = new Map<string, string>();
function freshSet(tag: string) {
  if (tag === '+') return null;
  const had = fresh.get(tag);
  if (had && sets('chat').list.some((x) => x.id === had)) return had;
  const id = addSet('chat', false);
  fresh.set(tag, id);
  return id;
}
every(3000, land);
const resuming = new Set<string>();
function heldAt(id: string) {
  const at = setsHolding('chat', id)[0];
  if (!at) return null;
  const i = cellsOf('chat', at.set).indexOf(id);
  return (nid: string) => {
    if (!sets('chat').list.some((x) => x.id === at.set)) return false;
    decks.has('chat', at.set) ? decks.swap('chat', at.set, id, nid, i) : swapInSet('chat', at.set, id, nid, i);
    return true;
  };
}
export function resumeChat({ session, program }: { session: string; program?: string }) {
  if (resuming.has(session)) return;
  resuming.add(session);
  setTimeout(() => resuming.delete(session), 5000);
  const set = setOn('chat');
  toSet('chat', set);
  decks.back('chat', set, { id: null, ended: true, session, program, pid: S.pid, i: -1 });
}
const setGone = (d: any) => d.kind === 'chat' && !sets('chat').list.some((x: { id: string }) => x.id === d.set);
const inDeck = (d: any, how: 'back' | 'again') => (!setGone(d) && decks.has(d.kind, d.set) ? decks[how](d.kind, d.set, d) : false);
undoer('deck', {
  there: (d) => setGone(d) || (mode() === d.kind && setOn(d.kind) === d.set),
  go(d) {
    if (mode() !== d.kind) setMode(d.kind);
    if (setOn(d.kind) !== d.set) toSet(d.kind, d.set);
  },
  undo: (d) => inDeck(d, 'back'),
  redo: (d) => inDeck(d, 'again'),
});
export function stepSet() {
  nextSet('chat');
  toSet('chat', setOn('chat'));
}
function dropDeckSet(kind: string, id: string) {
  decks.close(kind, id);
  const back = dropSet(kind, id);
  drawn = '';
  page.render();
  return back;
}
async function closeSet(kind: string, id: string, n: number) {
  const main = sets(kind).list[0].id === id, { chats } = infoOf(kind, id), what = NOUN[kind];
  if (main && !chats) return;
  const keeps = kind === 'chat' || kind === 'term', away = keeps ? awaySay(kind, id) : '';
  if (chats && keeps && setAgents(kind, id).length) return closeKeeping(kind, id, n);
  if (chats && !(await ask({ title: `Close set ${n}?`, text: away || `It ends its ${chats} ${what}${chats === 1 ? '' : 's'}${kind === 'chat' ? ' (ctrl z brings the set and its chats back)' : ' and what runs in them'}.`, confirm: true }))) return;
  const back = dropDeckSet(kind, id);
  if (back && kind === 'chat') record('set', `closed set ${back.at + 1}`, { kind, back });
}
function awaySay(kind: string, id: string) {
  const ams = setAway(kind, id), k = ams.length, one = [...new Set(ams)];
  if (!k) return '';
  return `${k} ${NOUN[kind]}${k === 1 ? ' is' : 's are'} open in ${one.length === 1 ? `Amethyst ${one[0]}` : `Amethysts ${one.sort((x, y) => x - y).join(', ')}`} and stay${k === 1 ? 's' : ''} there. `;
}
async function closeKeeping(kind: string, id: string, n: number) {
  const list = setAgents(kind, id), what = NOUN[kind], many = (k: number) => `${k} ${what}${k === 1 ? '' : 's'}`, away = awaySay(kind, id);
  const orch = kind === 'chat', them = (k: number) => (k === 1 ? 'it' : 'them');
  const say = (k: number, all: number) => away + (k === all ? `It has *${many(all)}*, still running: ${orch ? `move ${them(all)} to orchestration or another set, or end ${all === 1 ? 'it' : 'them all'}` : `move ${them(all)} to another set, here or in another Amethyst`}.` : k ? `Move the *${k} ticked*. The other ${many(all - k)} end${all - k === 1 ? 's' : ''}.` : `No ${what} is ticked: tick the ones to move, or end them all.`);
  const r = await ask({
    title: `Close set ${n}?`,
    text: say(list.length, list.length),
    ticks: { items: list.map((a) => ({ id: a.id, html: agentLine(a), off: false })), say },
    menu: { label: 'move to…', open: (btn, pick, ticked) => setsMenu(kind, btn, id, (to, how) => pick({ to, how }), null, list.filter((a) => ticked.includes(a.id))) },
    end: { label: list.length === 1 ? `end it` : `end all ${list.length}`, value: 'end' },
    main: orch ? { label: 'to orchestration', value: 'orch' } : null,
  });
  if (!r) return;
  if (r.value === 'orch') {
    const cells = cellsOf(kind, id), moved = setChatsToOrch(kind, id, r.ticked), back = dropDeckSet(kind, id);
    if (back) record('set', `closed set ${back.at + 1}`, { kind, back, ...(moved.length && { moved: { ids: moved, to: 'orch', cells } }) });
    return;
  }
  if (r.value === 'end') {
    const back = dropDeckSet(kind, id);
    if (back && kind === 'chat') record('set', `closed set ${back.at + 1}`, { kind, back });
    return;
  }
  const keep: string[] = r.ticked, { to, how } = r.value as { to: string | null; how: MoveHow };
  if (how.am !== AM) return moveThere(kind, id, n, keep.map((x) => agents.all.get(x)!).filter(Boolean), to, how, many);
  const dest = to ?? addSet(kind, false), moved = moveSetChats(kind, id, dest, keep);
  const back = dropDeckSet(kind, id);
  decks.refresh(kind, dest);
  if (how.go) toSet(kind, dest);
  if (back && kind === 'chat') record('set', `closed set ${back.at + 1}`, { kind, back, ...(moved.length && { moved: { ids: moved, to: dest } }) });
}
async function moveThere(kind: string, id: string, n: number, list: Agent[], to: string | null, how: MoveHow, many: (k: number) => string) {
  const tag = to ?? `+${Date.now().toString(36)}`;
  const ok = await Promise.all(list.map((a, i) => moveAway(a, how.am, tag, { ...how, go: how.go && i === 0 }, true)));
  const failed = list.filter((_, i) => !ok[i]);
  if (failed.length) return void notify(`${many(failed.length)} didn't move to Amethyst ${how.am}, so set ${n} stays open: ${failed.map((a) => esc(titleOf(a))).join(', ')}.`, { ms: 8000 });
  const back = dropDeckSet(kind, id);
  if (back && kind === 'chat') record('set', `closed set ${back.at + 1} (${many(list.length)} went to Amethyst ${how.am})`, { kind, back });
  if (how.go) window.amethyst?.openAmethyst?.(how.am);
  else notify(`Moved ${many(list.length)} to Amethyst ${how.am} · ${esc(how.label)}. ${how.open ? 'You stayed here; they keep running there.' : `They're there when you open Amethyst ${how.am}.`}`, { ms: 5000 });
}
undoer('set', {
  there: () => true,
  undo(d) {
    const { entry, chats } = d.back;
    if (d.back.at > 0) {
      if (sets(d.kind).list.some((x: { id: string }) => x.id === entry.id)) return false;
      restoreSet(d.kind, d.back);
    }
    if (d.moved?.to === 'orch') {
      chatsFromOrch(d.kind, entry.id, d.moved.ids, d.moved.cells);
      decks.close(d.kind, entry.id);
      drawn = '';
    } else if (d.moved) (moveSetChats(d.kind, d.moved.to, entry.id, d.moved.ids), decks.refresh(d.kind, d.moved.to));
    toSet(d.kind, entry.id);
    for (const c of chats) decks.back(d.kind, entry.id, { ...c, ended: true });
  },
  redo(d) {
    if (d.moved?.to === 'orch') setChatsToOrch(d.kind, d.back.entry.id, d.moved.ids);
    else if (d.moved) moveSetChats(d.kind, d.back.entry.id, d.moved.to, d.moved.ids);
    dropDeckSet(d.kind, d.back.entry.id);
  },
});
async function closeLayout(id: string, n: number) {
  const main = eds[0].id === id, { tabs, agents: ends } = editorLoad(id);
  if (main && !tabs) return;
  if (tabs && !(await ask({ title: `Close layout ${n}?`, text: `Its ${tabs} tab${tabs === 1 ? '' : 's'} close${ends ? `, and its ${ends} chat${ends === 1 ? '' : 's'} and terminals end` : ''}${main ? '' : ' (ctrl z brings the layout back)'}.`, confirm: true }))) return;
  dropEditor(id);
}
export function closeHere() {
  const m = mode();
  if (atLaunch() || atWs() || m === 'research' || m === 'orch') return;
  if (m === 'editor') {
    const i = editors().findIndex((e) => e.on);
    return i >= 0 && closeLayout(eds[i].id, i + 1);
  }
  const { list, on } = sets(m), i = list.findIndex((x: { id: string }) => x.id === on);
  return i >= 0 && closeSet(m, on, i + 1);
}
const entryOf = (kind: string, id: string): { color?: string; mark?: string } => (kind === 'editor' ? editors() : sets(kind).list).find((x: { id: string }) => x.id === id) || {};
let peek: Peek | null = null;
let fly = '';
function pickRows(b: HTMLElement, kind: string, id: string, i: number) {
  const x = entryOf(kind, id);
  peek = { b, style: b.getAttribute('style') || '', mk: b.classList.contains('mk'), base: setColor(i, kind) };
  return setSwatches((b.querySelector('svg')?.outerHTML || '').replace(/ class="tw"/g, ''), x.color, x.mark, setColor(i, kind, x.color), setColor(i, kind), fly);
}
function picked(b: HTMLElement, kind: string, id: string) {
  const patch = 'sc' in b.dataset ? { color: b.dataset.sc } : 'smk' in b.dataset ? { mark: b.dataset.smk } : null;
  if (!patch) return false;
  unpeek();
  if (kind === 'editor') markEditor(id, patch);
  else markSet(kind, id, patch);
  drawn = '';
  paintSwitch();
  return true;
}
function unpeek() {
  if (!peek) return;
  peek.b.setAttribute('style', peek.style);
  peek.b.classList.toggle('mk', peek.mk);
}
const menu = $('#colormenu');
const peekAt = (sw: HTMLElement | null | undefined) => {
  unpeek();
  if (!peek || !sw) return;
  const v = (p: string) => sw.style.getPropertyValue(p);
  if ('sc' in sw.dataset) sw.dataset.sc ? peek.b.style.setProperty('--ly-c', v('--ly-c')) : peek.base ? peek.b.style.setProperty('--ly-c', peek.base) : peek.b.style.removeProperty('--ly-c');
  else if (sw.dataset.smk) (peek.b.classList.add('mk'), peek.b.style.setProperty('--mk', v('--mk')));
  else peek.b.classList.remove('mk');
};
menu.addEventListener('pointerover', (e: PointerEvent) => peekAt((e.target as Element).closest<HTMLElement>('[data-sc],[data-smk]')));
menu.addEventListener('pointerout', (e: PointerEvent) => peekAt((e.relatedTarget as Element | null)?.closest?.<HTMLElement>('#colormenu :is([data-sc],[data-smk])')));
menu.addEventListener('menuclose', () => (unpeek(), (peek = null)));

const CLOSES: Record<string, string> = { editor: 'Its tabs close.', chat: 'You choose where its chats go: orchestration, another set, or they end.', term: 'Its terminals stop.' };
const READ_ICON = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
const X_ICON ='<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
function newRowsAt(at: number | null) {
  const slotTip = at == null ? 'It opens in the first free cell of the rail.' : 'It opens in the free cell next to where you right-clicked.';
  return !atWs() ? NEW_KINDS.filter(([k]) => !isOff('modesHidden', k)).map(([k, label]) => `<button class="mi" data-newv="${k}" title="${esc(`New ${label}
${slotTip}`)}"><i class="tb-ic">${k === 'editor' ? modeGem('editor') : MODES[k].icon!()}</i><span class="mi-n">new ${label}</span>${keyChip(NEW_BINDS[k])}</button>`).join('') : '';
}
function modesMenu(x: number, y: number, kind = '', b: HTMLElement | null = null, again = false, at: number | null = null) {
  if (!again) fly = '';
  const ed = kind === 'editor', w = ed ? 'layout' : 'set';
  const sub = !!b && ('ed' in b.dataset || 'set' in b.dataset);
  const id = !kind ? undefined : sub ? (ed ? b!.dataset.ed : b!.dataset.set) : ed ? eds[0]?.id : sets(kind).list[0].id;
  const n = sub ? +b!.dataset.n! : 1;
  let head: string | undefined, own = '', mine: string[] = [];
  const newRows = newRowsAt(at);
  if (b && kind && id != null && !atWs()) {
    head = menuHead((b.querySelector('svg')?.outerHTML || '').replace(/ class="tw"/g, ''), `${ed ? 'editor' : MODES[kind].label} ${w} ${n}`);
    mine = ed ? (sub ? [] : editorInfo().doneIds) : infosOf(kind, heldAnywhere)(id).doneIds || [];
    own = (CLOSES[kind] ? `<button class="mi tb-close" data-close title="${esc(`Close
${CLOSES[kind]}`)}"><i class="tb-ic">${X_ICON}</i><span class="mi-n">close</span>${keyChip('closeSet')}</button>` : '') + pickRows(b, kind, id, n - 1);
  }
  const unread = atWs() ? 0 : [...agents.all.values()].filter((a) => a.pid === S.pid && a.status === 'done').length;
  const read = (mine.length ? `<button class="mi tb-read" data-read="1" title="Mark ${mine.length} as read&#10;Clears the green count. Chats that need you stay."><i class="tb-ic">${READ_ICON}</i><span class="mi-n">mark ${mine.length} as read</span></button>` : '') +
    (unread ? `<button class="mi tb-read" data-read="all" title="Mark all as read&#10;Every set, tab and window in this project."><i class="tb-ic">${READ_ICON}</i><span class="mi-n">mark all ${unread} as read</span></button>` : '');
  const acts = [newRows, read, own].filter(Boolean).join('<div class="sep"></div>');
  const wk = (k: string) => `title="${esc(`${PREFS[k].item!.charAt(0).toUpperCase() + PREFS[k].item!.slice(1)}
${PREFS[k].desc}`)}"`;
  const work = atWs() ? '' : topRow(!!pref('edWork'), `data-edwork ${wk('edWork')}`, modeGem('editor'), PREFS.edWork.item!) + topRow(!!pref('switch:wkOn'), `data-wkon ${wk('switch:wkOn')}`, workGem(), PREFS['switch:wkOn'].item!);
  topBarMenu(x, y, { tray: 'modes', head, acts, opts: work, onPick: (p) => {
    const d = p.dataset;
    if (d.newv) return newView(d.newv, at);
    if (d.read) return quietly(api('POST', '/api/agents/seen', d.read === 'all' ? { all: true } : { ids: mine }));
    if (d.fly) {
      fly = fly === d.fly ? '' : d.fly;
      modesMenu(x, y, kind, b, true, at);
      return (fly ? flyFocus() : $<HTMLElement>(`#colormenu [data-fly="${d.fly}"]`))?.focus();
    }
    if (id != null && picked(p, kind, id)) {
      const fresh = $<HTMLElement | null>(`#switch .sets[data-kind="${kind}"] [data-${ed ? 'ed' : 'set'}="${CSS.escape(id)}"]`);
      if (!fresh) return;
      modesMenu(x, y, kind, fresh, true, at);
      return flyFocus()?.focus();
    }
    if ('edwork' in d) return setPref('edWork', !pref('edWork'));
    if ('wkon' in d) return setPref('switch:wkOn', !pref('switch:wkOn'));
    if ('close' in d && id != null) ed ? closeLayout(id, n) : closeSet(kind, id, n);
  } });
  keepMenu(() => modesMenu(x, y, kind, b?.isConnected ? b : null, true, at));
}
$('#switch').addEventListener('contextmenu', (e: MouseEvent) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-mode],[data-ed],[data-set]');
  if (!b) return;
  e.preventDefault();
  const nav = b.closest<HTMLElement>('.sets')!;
  modesMenu(e.clientX, e.clientY, nav.dataset.kind!, b, false, nav.dataset.ref ? freeNear(nav.dataset.ref, allRefs()) : null);
});
const newPick = (b: HTMLElement, at: number | null) => b.dataset.newv && newView(b.dataset.newv, at);
railActions(() => newRowsAt(null), newPick);
barMenu('#switch', '', {
  open: (_el, e) => {
    const at = freeAt(e.clientY);
    topBarMenu(e.clientX, e.clientY, { acts: newRowsAt(at), onPick: (b) => newPick(b, at) });
  },
});
onPref('modesHidden', () => {
  drawn = '';
  paintSwitch();
});
$('#switch').addEventListener('click', (e: MouseEvent) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-mode],[data-ed],[data-ed-add],[data-set],[data-set-add]');
  if (!b) return;
  const k = b.closest<HTMLElement>('.sets')!.dataset.kind!;
  if ('set' in b.dataset) return toSet(k, b.dataset.set!);
  if ('setAdd' in b.dataset) return toSet(k, (addSet(k), setOn(k)));
  if (b.dataset.ed) return showEditor(b.dataset.ed);
  if ('edAdd' in b.dataset) return addEditor();
  if (k === 'editor') return atWs() ? (S.wsEditor ? page.showWsEditor(false) : setMode('editor')) : showEditor(eds[0].id);
  toSet(k, sets(k).list[0].id);
});
$('#switch').addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Delete') return;
  const b = (e.target as Element).closest<HTMLElement>('[data-mode],[data-ed],[data-set]');
  if (!b) return;
  const kind = b.closest<HTMLElement>('.sets')!.dataset.kind!, ed = kind === 'editor';
  e.preventDefault();
  if ('mode' in b.dataset) return atWs() || kind === 'research' || kind === 'orch' ? undefined : ed ? closeLayout(eds[0].id, 1) : closeSet(kind, sets(kind).list[0].id, 1);
  const n = +b.dataset.n!, id = (ed ? b.dataset.ed : b.dataset.set)!;
  ed ? closeLayout(id, n) : closeSet(kind, id, n);
});

const wsStack = `<svg class="ic ws-stk" viewBox="0 0 20 16" aria-hidden="true">${[0.3, 0.5, 0.75, 1].map((a, i) => `<rect x="${7.5 - 2 * i}" y="${1.5 + 2 * i}" width="11" height="7" rx="1" fill="var(--raised)" stroke="currentColor" stroke-opacity="${a}"/>`).join('')}</svg>`;
function paintHere() {
  $('#ws-all').classList.toggle('on', atLaunch());
  const up = !!bound('up'), all = $('#ws-all');
  all.title = 'All workspaces\nShows every workspace you have.\n\nRight-click to go straight to one.';
  up && atWs() ? (all.dataset.tipKeys = 'up:all workspaces') : delete all.dataset.tipKeys;
  const box = $('#ws-btn');
  box.hidden = atLaunch() || !!S.ws?.loose;
  if (box.hidden) return;
  const go = $('#ws-go'), on = atWs() && !S.wsEditor;
  if (!go._h) go.innerHTML = go._h = wsStack;
  go.classList.toggle('on', on);
  const name = S.ws?.name || 'workspace';
  go.title = on ? `${name}\nShows the projects of the workspace ${name}.` : `${name}\nBack to the projects of the workspace ${name}.`;
  up && !on ? (go.dataset.tipKeys = 'up:back to the workspace') : delete go.dataset.tipKeys;
}
$('#ws-go').addEventListener('click', () => {
  if (S.wsEditor) return page.showWsEditor(false);
  atWs() ? (setMode('editor'), page.render()) : page.switchLevel('');
});
$('#ws-all').innerHTML = ICONS.workspaces;
function showSettings(open: boolean) {
  S.settingsOpen = open;
  $('#setwin').hidden = !open;
  $('#btn-settings').classList.toggle('on', open);
  page.renderSettings();
}
export const openSettings = (toggle = false) => showSettings(!(toggle && S.settingsOpen));
export const closeSettings = () => S.settingsOpen && showSettings(false);
addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape' || !S.settingsOpen || !$('#app').contains(e.target as Node) || document.getElementById('welcome')) return;
    if (!$('#modal').hidden || !$('#keys').hidden || !$('#palette').hidden || !$('#fpick').hidden) return;
    e.preventDefault();
    e.stopPropagation();
    closeSettings();
  },
  true,
);
$('#setwin-gem').innerHTML = gem('settings');
$('#btn-settings').addEventListener('click', (e: MouseEvent) => {
  e.stopPropagation();
  openSettings(true);
});
$('#setwin').addEventListener('click', (e: MouseEvent) => {
  if ((e.target as Element).id === 'setwin' || (e.target as Element).closest('[data-setwin-close],[data-view]')) closeSettings();
});

function paintProjects() {
  const nav = $<NavEl>('#projects');
  nav.hidden = atLaunch();
  if (nav.hidden) return void (nav._shape = '');
  if (sorting(nav)) return;
  const n = agentCounts();
  const bits = (p: Project) => {
    const c = n.get(p.id), st = c?.asks ? 'asks' : p.id === S.pid ? '' : c?.done ? 'done' : '', k = st ? c![st] : 0;
    const ask = st === 'asks';
    const count = [c?.asks && `${c.asks} need${c.asks === 1 ? 's' : ''} you`, c?.done && `${c.done} finished`, c?.working && `${c.working} working`].filter(Boolean).join(', ');
    const say = [count && count + '.', pjHidden(p.id) && "It is hidden from this Amethyst's dock, and shows while it is open.", 'Click to open the project.', ask && 'Click the red count to answer here; shift + click it to go into the project.'].filter(Boolean).join(' ');
    const tip = `${p.name}\n${say}\n\nDrag to reorder. Right-click to rename it, remove it, color it or pick the projects the dock shows.`;
    const askTip = ask ? `${c!.asks} need${c!.asks === 1 ? 's' : ''} you\nClick to answer ${c!.asks === 1 ? 'it' : 'them'} here, without going into ${p.name}. Shift + click to go into ${p.name}.` : '';
    return { st, k: k > 9 ? '9+' : String(k || ''), tip, ask, askTip, wk: c?.working ? workGem() : '' };
  };
  const list = dockProjects().filter((p) => p.id === S.pid || !pjHidden(p.id));
  const shape = JSON.stringify(list.map((p) => [p.id, p.name, pjColor(p), p.id === S.pid, pjHidden(p.id)]));
  if (nav._shape !== shape) {
    nav._shape = shape;
    const tab = (p: Project, b = bits(p)) => `<button class="pj-tab ${p.id === S.pid ? 'on' : ''}${pjHidden(p.id) ? ' gone' : ''}" data-pjsel="${esc(p.id)}" title="${esc(b.tip)}" data-tip-keys="=ctrl+click:open it in a window of its own" style="--pc:${esc(pjColor(p))}">${pjMark()}<span class="nm">${esc(p.name)}</span>${pjHidden(p.id) ? icon('eyeOff', 'pj-eo') : ''}<span class="pj-n" data-tip-icon="bell"${b.st ? ` data-st="${b.st}"` : ''}${b.ask ? ` data-pjask role="button" title="${esc(b.askTip)}"` : ''}>${b.k}</span><span class="pj-wk" data-st="working">${b.wk}</span></button>`;
    nav.innerHTML = list.map((p) => tab(p)).join('') + '<button class="pj-more" hidden></button>';
    return fitProjects();
  }
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const t of nav.querySelectorAll<HTMLElement>('.pj-tab:not(.pj-ghost)')) {
    const b = bits(byId.get(t.dataset.pjsel!)!), cn = t.querySelector<HTMLElement>('.pj-n')!, wk = t.querySelector<HTMLElement>('.pj-wk')!;
    if ((t.getAttribute('title') ?? t.dataset.tip) !== b.tip) t.title = b.tip;
    if ((cn.dataset.st || '') !== b.st) b.st ? (cn.dataset.st = b.st) : delete cn.dataset.st;
    if (cn.textContent !== b.k) cn.textContent = b.k;
    if (cn.hasAttribute('data-pjask') !== b.ask) b.ask ? (cn.dataset.pjask = '', cn.setAttribute('role', 'button')) : (delete cn.dataset.pjask, cn.removeAttribute('role'), cn.removeAttribute('title'), delete cn.dataset.tip);
    if (b.ask && (cn.getAttribute('title') ?? cn.dataset.tip) !== b.askTip) cn.title = b.askTip;
    if (!wk.firstChild !== !b.wk) wk.innerHTML = b.wk;
  }
  const more = nav.querySelector<HTMLElement>('.pj-more')!;
  if (!more.hidden) paintMore(more, [...nav.querySelectorAll<HTMLElement>('.pj-tab[hidden]')]) && fitProjects();
}
const NM_MAX = 160, NM_MIN = 72;
type Tab = { t: HTMLElement; fixed: number; nat: number; on: boolean };
type TabsLook = { nav: NavEl; more: HTMLElement; avail: number; pad: number; gap: number; tabs: Tab[]; moreW: number | undefined } | null;
const tabSize = new WeakMap<Element, { fixed: number; nat: number }>();
let moreW: number | undefined;
function lookTabs(): TabsLook {
  const nav = $<NavEl>('#projects'), more = nav.querySelector<HTMLElement>('.pj-more');
  if (!more || nav.hidden || sorting(nav)) return null;
  const tabs: Tab[] = [];
  for (const t of nav.querySelectorAll<HTMLElement>('.pj-tab:not(.pj-ghost)')) {
    if (!t.hidden) {
      const nm = t.querySelector<HTMLElement>('.nm')!;
      tabSize.set(t, { fixed: t.getBoundingClientRect().width - nm.getBoundingClientRect().width, nat: nm.scrollWidth });
    }
    const z = tabSize.get(t);
    if (!z) return null;
    tabs.push({ t, ...z, on: t.classList.contains('on') });
  }
  if (!more.hidden) moreW = more.getBoundingClientRect().width;
  const st = $('#status'), grow = st.querySelector(':scope > .grow'), cs = getComputedStyle(nav);
  const border = (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  const room = nav.getBoundingClientRect().width + (grow?.getBoundingClientRect().width || 0) - Math.max(0, st.scrollWidth - st.clientWidth);
  return { nav, more, avail: room - border, pad: (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0), gap: parseFloat(cs.columnGap) || 0, tabs, moreW };
}
function putTabs(l: TabsLook) {
  if (!l || !l.nav.isConnected) return;
  const { nav, more, avail, pad, gap, tabs } = l;
  const need = (nm: number, shown: Tab[], withMore: boolean) => pad + shown.reduce((a, x) => a + x.fixed + Math.min(x.nat, nm), 0) + gap * Math.max(0, shown.length + (withMore ? 1 : 0) - 1) + (withMore ? l.moreW! : 0);
  const fits = (nm: number, shown: Tab[], withMore = false) => need(nm, shown, withMore) <= avail + 1;
  let nm = NM_MAX, shown = tabs;
  if (!fits(NM_MAX, tabs)) {
    if (fits(NM_MIN, tabs)) {
      let lo = NM_MIN, hi = NM_MAX;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        fits(mid, tabs) ? (lo = mid) : (hi = mid);
      }
      nm = lo;
    } else {
      if (l.moreW == null) return tryRow(nav);
      nm = NM_MIN;
      shown = [...tabs];
      for (let i = tabs.length - 1; i >= 0 && !fits(nm, shown, true); i--) if (!tabs[i].on) shown.splice(shown.indexOf(tabs[i]), 1);
      if (!fits(nm, shown, true)) return tryRow(nav);
    }
  }
  const on = new Set(shown), folded = tabs.filter((x) => !on.has(x)).map((x) => x.t);
  if (nav.style.getPropertyValue('--nm') !== nm + 'px') nav.style.setProperty('--nm', nm + 'px');
  if (nav.style.minWidth) nav.style.minWidth = '';
  for (const x of tabs) if (x.t.hidden !== !on.has(x)) x.t.hidden = !on.has(x);
  if (more.hidden !== !folded.length) more.hidden = !folded.length;
  if (folded.length) paintMore(more, folded);
}
const tabsJob = { name: 'projects.fit', read: lookTabs, write: putTabs };
const fitProjects = () => nextFrame(tabsJob);
function tryRow(nav: HTMLElement) {
  const more = nav.querySelector<HTMLElement>('.pj-more')!;
  const tabs = [...nav.querySelectorAll<HTMLElement>('.pj-tab:not(.pj-ghost)')];
  const over = () => nav.scrollWidth > nav.clientWidth + 1;
  const nm = (w: number) => nav.style.setProperty('--nm', w + 'px');
  tabs.forEach((t) => (t.hidden = false));
  more.hidden = true;
  nav.style.minWidth = '';
  nm(NM_MAX);
  if (!over()) return;
  let lo = NM_MIN, hi = NM_MAX;
  nm(lo);
  if (!over()) {
    while (hi - lo > 2) {
      const mid = (lo + hi) >> 1;
      nm(mid);
      if (over()) hi = mid;
      else lo = mid;
    }
    return nm(lo);
  }
  more.hidden = false;
  const folded: HTMLElement[] = [];
  for (let i = tabs.length - 1; i >= 0 && over(); i--) {
    if (tabs[i].classList.contains('on')) continue;
    tabs[i].hidden = true;
    folded.unshift(tabs[i]);
    paintMore(more, folded);
  }
  if (over()) nav.style.minWidth = nav.scrollWidth + 'px';
}
function paintMore(more: HTMLElement, folded: HTMLElement[]) {
  const sts = folded.map((t) => t.querySelector<HTMLElement>('.pj-n')!),
    st = sts.some((x) => x.dataset.st === 'asks') ? 'asks' : sts.some((x) => x.dataset.st === 'done') ? 'done' : '';
  const k = sts.filter((x) => x.dataset.st === st).reduce((a, x) => a + (parseInt(x.textContent!) || 0), 0);
  const had = !!more.querySelector('.pj-n');
  more.innerHTML = `${st ? `<span class="pj-n" data-st="${st}">${k > 9 ? '9+' : k}</span>` : ''}+${folded.length} ▾`;
  return had !== !!st;
}
const seenW = new WeakMap<Element, number>();
onSize([$('#status'), ...$('#status').children], {
  name: 'projects.fit',
  read: (es) => {
    let refit = false;
    for (const e of es) {
      const w = e.borderBoxSize[0].inlineSize;
      if (seenW.get(e.target) !== w) refit = true;
      seenW.set(e.target, w);
    }
    return refit ? lookTabs() : null;
  },
  write: putTabs,
});
sortable($('#projects'), {
  item: '.pj-tab:not([hidden])',
  end: '.pj-more',
  drop(shown) {
    const ids = [...shown, ...$('#projects').querySelectorAll('.pj-tab[hidden]')].map((t: HTMLElement) => t.dataset.pjsel!);
    const all = dockProjects().map((p) => p.id), out = all.filter((id) => !ids.includes(id));
    for (const id of out) ids.splice(Math.min(ids.length, all.indexOf(id)), 0, id);
    store.set('dockOrder', { ...store.get('dockOrder', {}), [S.wid]: ids });
    paintProjects();
  },
});
onPjHidden(paintProjects);
onAgents(({ lineOnly }) => {
  if (lineOnly) return;
  paintSwitch();
  paintProjects();
});
onHeld(() => {
  decks.refresh(...onScreen());
  paintSwitch();
});
$('#projects').addEventListener('click', (e: MouseEvent) => {
  const more = (e.target as Element).closest('.pj-more');
  if (!more) return;
  const b = more.getBoundingClientRect();
  const item = (t: HTMLElement) => `<button class="mi pj-mi" data-pj="${esc(t.dataset.pjsel)}" style="${esc(t.getAttribute('style'))}">${t.innerHTML}</button>`;
  const html = [...$('#projects').querySelectorAll('.pj-tab[hidden]')].map(item).join('');
  popMenu(b.left, b.top - 6, html, (btn) => page.switchLevel(btn.dataset.pj!), true);
});
