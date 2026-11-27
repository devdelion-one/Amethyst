import { is, show as keyName, bound } from '../base/binds.ts';
import { agents, chatOfSession, onAgents } from '../base/stream.ts';
import { amElse, amKey, chatTabOf, CHATS, esc, quietly, sinceShort, store, track, uid } from '../base/util.ts';
import { addClosed, crystalOf, groupOf, onCleared, titleOf } from '../base/agentlook.ts';
import { cacheFlip, cacheRow, doneInner, fileDrag, markFly, markMenu, markPick, renameAsk, renameItem } from '../base/agentrow.ts';
import { createChatList, hideDrag, listMenu, listPrefs, orchHas, rowListBands, rowListPick, showDrag } from '../app/chatlist.ts';
import { page } from '../base/page.ts';
import { queue } from '../base/queue.ts';
import { api, levelKey, S } from '../base/model.ts';
import { chatOn, onPref, pref, setPref, wasSet } from '../base/prefs.ts';
import { offTell, tell } from '../base/notify.ts';
import { arrowIntoSub, bands, barMenu, ICONS, menuHead, miRow, popMenu, rowIcons } from '../base/controls.ts';
import { canFile, folderOf, foldersOn, onFolders } from '../base/folders.ts';
import { listOrder, moveItem, moveMenu, moveSub } from '../base/chatfolders.ts';
import type { Group } from '../base/chatfolders.ts';
import { HEAD_SEL, headMenu as chatHeadMenu, offBtn, paintHead, toolsSlot } from '../app/chathead.ts';
import { icon } from '../base/icon.ts';
import { gem, modeGem } from '../base/kinds.ts';
import { launchAgent } from '../base/agentmenu.ts';
import { place as putIn } from '../base/place.ts';
import type { Agent } from '../base/stream.ts';
import type { Tab } from '../base/types.ts';

type View = { el: HTMLElement; focus(): void; land?: (wait?: number) => unknown; detach(): void; stop?: () => void; bar?: HTMLElement; home?: () => void; attach?: (rel: string) => unknown; showSub?: (id: string) => unknown; find?: () => unknown; take?: (e: DragEvent) => unknown };
type More = { html: string; pick: (b: HTMLElement) => unknown };
type TermView = { el: HTMLElement; focus(): void; detach(): void };
type Earlier = { session: string; program?: string; title?: string; pid: string };
type MakeChat = (tab: Tab, o: { saved: () => void; filesChanged: () => void; openFile: (path: string) => unknown; titled: (title: string | null) => void; openBeside: (s: Earlier) => unknown }) => View;
type MakeTerm = (agent: { id?: string | null; program?: string | null }, o: { started?: (id: string) => void; ended?: () => void }) => TermView;
type Head = {
  html: (a: Agent, info: string) => string;
  act: (b: HTMLElement, a: Agent | null, done: () => void, e?: MouseEvent) => unknown;
};
type Opts = {
  head: Head;
  makeChat: MakeChat;
  makeTerm: MakeTerm;
  filesChanged: () => void;
  openFile: (path: string) => unknown;
  claim: (a: Agent) => Promise<boolean>;
  moveOut: (a: Agent, btn: Element, done: () => void, more: More | null, beside?: HTMLElement | null) => unknown;
  mark: (session: string, n: number) => unknown;
  close: (a: Agent, sure?: boolean) => Promise<string | null>;
  verb: (a: Agent) => string;
  report: (a: Agent, at: HTMLElement) => unknown;
};

const GROUPS: [string, string][] = [['asks', 'Needs you'], ['working', 'Working'], ['done', 'Done']];
const slotOf = (a: Agent) => (groupOf(a) === 'idle' ? 'done' : groupOf(a));
const NAMES = ['files', 'chat', 'list'];
const LABEL: Record<string, string> = { list: 'the list', chat: 'the chat', files: 'your files' };
const TERM_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5 6.5 8 3 11.5M8 12h5"/></svg>';
export const termBtn = (on: boolean) => `<button class="oc-tb${on ? ' on' : ''}" data-oc-term aria-pressed="${on}" title="${on ? 'Terminal\nHides the terminal under the chat. It keeps running.' : 'Terminal\nOpens a terminal under the chat, in the project folder.'}" aria-label="terminal">${TERM_IC}</button>`;
const MIN_W = 320, MIN_FILES = 280, MIN_TERM = 120, MIN_CHAT = 200, MIN_FILES_H = 150;
export const folderBtn = (on: boolean) => `<button class="oc-fb${on ? ' on' : ''}" data-oc-folder aria-haspopup="menu" title="${on ? 'Move to folder\nIt is in one of your folders: pick another, or take it out.' : 'Move to folder\nPick one of your folders in the list, or make one. The chat keeps running.'}" aria-label="move to folder">${icon('folder')}</button>`;

export function orchWidth() {
  let w = Number(store.get('orch:cw', 0));
  if (!w && store.get('orch:w', 0)) {
    w = Math.max(MIN_W, Number(store.get('orch:w', 0)) - 276);
    store.set('orch:cw', w);
    store.del('orch:w');
  }
  return w >= MIN_W ? w : 0;
}
export function listSides() {
  const v = orchOrder().filter((k) => k !== 'files' || (pref('orch:files') && !filesUnder())), i = v.indexOf('list');
  return { l: v[i - 1] || '', r: v[i + 1] || '' };
}

let auto = false;
export const filesUnder = () => !!pref('orch:files') && (!!pref('orch:under') || auto);
export function setAutoUnder(on: boolean) {
  auto = on;
}
export const filesShare = () => {
  const f = Number(store.get('orch:filesH', 0.5));
  return f >= 0.1 && f <= 0.9 ? f : 0.5;
};

function keepWhileMoving(m: HTMLElement, put: () => void) {
  const kept = [m, ...m.querySelectorAll<HTMLElement>('*')].filter((e) => e.scrollTop || e.scrollLeft).map((e) => [e, e.scrollTop, e.scrollLeft] as const);
  const f = document.activeElement as HTMLElement | null, had = !!f && m.contains(f);
  put();
  for (const [e, t, l] of kept) {
    e.scrollTop = t;
    e.scrollLeft = l;
  }
  if (had && f!.isConnected) f!.focus({ preventScroll: true });
}

export function placeFiles() {
  const m = document.getElementById('main'), home = document.getElementById('start'), app = document.getElementById('app');
  if (!m || !home || !app) return;
  app.style.setProperty('--oc-fh', filesShare() * 100 + '%');
  const col = app.classList.contains('orch-under') && live && !live.hidden ? live.querySelector<HTMLElement>('.oc-col') : null;
  if (col) {
    if (m.parentElement !== col) keepWhileMoving(m, () => col.append(m));
  } else if (m.nextElementSibling !== home) keepWhileMoving(m, () => home.before(m));
}

export function orchOrder(): string[] {
  if (!wasSet('orch:order') && store.get('orch:side', null) != null) {
    const left = store.get('orch:side', null) === 'left';
    store.del('orch:side');
    if (left) store.set('orch:order', ['files', 'chat', 'list']);
  }
  const o: string[] = pref('orch:order');
  return o.length === 3 && NAMES.every((n) => o.includes(n)) ? o : [...NAMES];
}

let live: HTMLElement | null = null;
const sectionOf = (k: string) => (k === 'files' ? document.getElementById('main') : live?.querySelector<HTMLElement>(k === 'list' ? '.oc-rail' : filesUnder() ? '.oc-col' : '.oc-main') || null);

export function dragSection(e: PointerEvent, which: string) {
  const me = sectionOf(which);
  if (e.button !== 0 || !live || live.hidden || !me) return;
  const x0 = e.clientX, y0 = e.clientY, full = orchOrder(), under = filesUnder(), loose = under && which === 'files';
  const UNDER = -2;
  let ghost: HTMLElement | null = null, land: HTMLElement | null = null, frame = 0, px = x0, py = y0, at = -1, own = -1, w = 0;
  let shown: string[] = [], slots: number[] = [], box = { left: 0, right: 0, top: 0, bottom: 0, height: 0 }, below: DOMRect | null = null;
  const nearest = () => {
    if (below && px >= below.left && px <= below.right && py >= below.top + below.height / 2 && py <= below.bottom) return UNDER;
    if (px < box.left || px > box.right || py < box.top || py > box.bottom) return -1;
    let best = 0;
    slots.forEach((x, i) => Math.abs(x - px) < Math.abs(slots[best] - px) && (best = i));
    return best;
  };
  const same = (s: number) => own >= 0 && (s === own || s === own + 1);
  const draw = () => {
    frame = 0;
    ghost!.style.transform = `translate3d(${px + 14}px, ${py + 10}px, 0)`;
    const s = nearest();
    if (s === at) return;
    at = s;
    if (s === UNDER) {
      const h = Math.round(below!.height / 2);
      land!.style.cssText = `left:0;top:0;width:${below!.width}px;height:${h}px;transform:translate3d(${below!.left}px, ${below!.bottom - h}px, 0)`;
      if (!land!.isConnected) document.body.append(land!);
      return;
    }
    if (s < 0 || same(s)) return land!.remove();
    const left = Math.min(Math.max(slots[s] - w / 2, box.left), box.right - w);
    land!.style.cssText = `left:0;top:0;width:${w}px;height:${box.height}px;transform:translate3d(${left}px, ${box.top}px, 0)`;
    if (!land!.isConnected) document.body.append(land!);
  };
  const move = (ev: PointerEvent) => {
    px = ev.clientX;
    py = ev.clientY;
    if (!ghost) {
      if (Math.hypot(px - x0, py - y0) < 5) return;
      const els = full.filter((k) => !(under && k === 'files')).map((k) => [k, sectionOf(k)] as const).filter(([, x]) => x && x.offsetWidth).map(([k, x]) => ({ k, r: x!.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left);
      shown = els.map((x) => x.k);
      own = shown.indexOf(which);
      if (own < 0 && !loose) return;
      if (!els.length) return;
      const rs = els.map((x) => x.r);
      box = { left: rs[0].left, right: rs[rs.length - 1].right, top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)), height: 0 };
      box.height = box.bottom - box.top;
      slots = [rs[0].left, ...rs.slice(1).map((r, i) => (rs[i].right + r.left) / 2), rs[rs.length - 1].right];
      w = Math.min(own >= 0 ? rs[own].width : me.getBoundingClientRect().width, 240);
      below = which === 'files' && !under ? live?.querySelector<HTMLElement>('.oc-main')?.getBoundingClientRect() || null : null;
      ghost = document.createElement('div');
      ghost.className = 'rs-ghost oc-ghost';
      ghost.textContent = LABEL[which];
      ghost.style.cssText = 'left:0;top:0';
      land = document.createElement('div');
      land.className = 'rs-land';
      document.body.append(ghost);
      document.body.classList.add('dk-sorting');
      me.classList.add('oc-moving');
    }
    frame ||= requestAnimationFrame(draw);
  };
  const end = (ok: boolean) => {
    if (frame) cancelAnimationFrame(frame), (frame = 0);
    if (!ghost) return;
    ghost.remove();
    land?.remove();
    document.body.classList.remove('dk-sorting');
    me.classList.remove('oc-moving');
    if (!ok) return;
    const s = nearest();
    if (s === UNDER) return setPref('orch:under', true);
    if (s < 0) return tell(me, { title: 'Sections move only within orchestration', line: which === 'files' ? 'Drop it left or right of the list or the chat, or on the lower part of the chat to put it under the chat' : 'Drop it left or right of the list, the chat or your files', ms: 2500 });
    if (same(s)) return;
    const rest = shown.filter((k) => k !== which), to = own >= 0 && s > own ? s - 1 : s, next = full.filter((k) => k !== which);
    next.splice(to < rest.length ? next.indexOf(rest[to]) : next.indexOf(rest[rest.length - 1]) + 1, 0, which);
    if (loose && auto) tell(me, { title: 'The window is too narrow for files beside the chat', line: 'They stay under the chat until the window is wider.', ms: 3000 });
    if (loose) setPref('orch:under', false);
    setPref('orch:order', next);
  };
  track(e, { move, end, esc: () => !!ghost });
}

rowIcons({ 'orch:term': () => TERM_IC, 'orch:termBtn': () => TERM_IC, 'orch:termX': () => ICONS.x, 'orch:folderBtn': () => icon('folder'), 'orch:closeBtn': () => ICONS.x, 'orch:files': () => ICONS.explorer, 'orch:under': () => ICONS.splitCol, 'orch:list': () => modeGem('orch') });
listMenu('orch', '.oc-rail', 'orch', { only: ['orch:files', 'orch:under', 'orch:list'] });
let headMenu = false;

export function createOrch({ head, makeChat, makeTerm, filesChanged, openFile, claim, moveOut, mark, close, verb, report }: Opts) {
  const pid = S.pid, key = 'orch:' + levelKey() + amKey, termKey = 'orch:shell:' + levelKey() + amKey;
  let cur: string | null = store.get(key, null), view: { id: string; v: View } | null = null, grip: (() => void) | null = null;
  let fresh = false, term: TermView | null = null, badgeDrawn = '';
  let pass: string[] = [], marksWas = '', landing = false;
  if (!headMenu) {
    headMenu = true;
    barMenu('.oc-bar', 'ochead', { order: false, at: () => 'oc', make: chatHeadMenu });
  }

  const el = document.createElement('div');
  el.className = 'oc';
  el.hidden = true;
  el.innerHTML = `
    <aside class="oc-rail"><div class="oc-list dk-list"></div></aside>
    <div class="oc-col"><div class="oc-main"><header class="dk-ch oc-bar" title="Header&#10;Drag to move the chat.&#10;&#10;Right-click to choose what shows in this header."></header><div class="oc-chat"></div><span class="dk-done oc-done" data-oc-seen role="button" hidden></span><div class="oc-tgrip" hidden title="Resize&#10;Drag to make the terminal taller or shorter."></div><div class="oc-term" hidden></div></div><div class="oc-fgrip" title="Resize&#10;Drag to make the files taller or shorter."></div></div>
    <div class="oc-grip" title="Resize&#10;Drag to make the chat wider or narrower."></div>
    <div class="oc-lgrip" data-side="l"></div>
    <div class="oc-lgrip" data-side="r"></div>`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s)!;
  const rail = $('.oc-rail'), list = $('.oc-list'), chat = $('.oc-chat'), badge = $('.oc-done'), bar = $('.oc-bar'), main = $('.oc-main'), tbox = $('.oc-term'), tgrip = $('.oc-tgrip');

  const mine = (a: Agent) => orchHas(a, pid);
  const waiting = () => queue([...agents.all.values()].filter(mine), pid);
  const noneHere = () => 'No chats in this Amethyst yet.';
  const tabKey = () => keyName(bound('windowKey')) || 'tab';

  function tabGroups(): Group[] {
    const by: Record<string, Agent[]> = { asks: [], working: [], done: [] };
    for (const a of agents.all.values()) {
      if (!mine(a)) continue;
      by[slotOf(a)]?.push(a);
    }
    by.asks.sort((x, y) => (x.at || 0) - (y.at || 0));
    for (const k of ['working', 'done']) by[k].sort((x, y) => (y.at || 0) - (x.at || 0));
    return GROUPS.map(([k, label]) => ({ k, label, list: by[k] }));
  }
  const rows = () => listOrder('orch', tabGroups());
  const noneLeft = () => ([...agents.all.values()].some((a) => mine(a) && folderOf('orch', a)) ? 'Every chat here is in a folded folder.' : noneHere());
  const lst = createChatList({
    list: 'orch',
    el: list,
    attr: 'data-oc',
    mine,
    cur: () => cur,
    shown: () => !el.hidden,
    open: (id) => pick(id),
    close: (a, sure) => closeRow(a, sure),
    mark: (a, x, y) => markMenu(a, x, y, mark, paint),
    sub: (c, s) => page.activity(c, s),
    newChat: (b, p) => (p ? startHere(p) : page.addAgent(b, 'list')),
    none: () => esc(noneHere()),
  });

  function paint() {
    lst.paint();
    paintBar();
    paintDone();
  }

  function paintDone() {
    const a = cur && view?.id === cur ? agents.all.get(cur) : null;
    const html = a && a.status === 'done' && pref('deck:doneBadge', 'oc') ? doneInner(a, 'data-oc-down') : '';
    badge.hidden = !html;
    badge.title = html ? 'Done\nThe agent has finished. Click to mark it read.\n\nAnswering in the box marks it read too.' : '';
    if (html === badgeDrawn) return;
    badgeDrawn = html;
    badge.innerHTML = html;
  }

  function seen() {
    const id = view?.id;
    if (!id || agents.all.get(id)?.status !== 'done') return;
    quietly(api('POST', '/api/agents/seen', { id }));
  }

  function paintBar() {
    const v = view?.v, a = view?.id ? agents.all.get(view.id) || null : null;
        const on = !!pref('orch:term');
    const tb = offBtn(termBtn(on), !!pref('orch:termBtn'), on ? 'hide the terminal under the chat' : 'terminal under the chat');
    const pk = a && canFile('orch', a) ? offBtn(folderBtn(!!folderOf('orch', a)), !!pref('orch:folderBtn'), 'move to folder') : '';
    const info = '<span class="oc-info"></span>';
    const html = a
      ? head.html(a, info) + pk + tb
      : v
        ? `<span class="dk-id"><i class="dk-mark">${gem('ai')}</i><b class="dk-title">new chat</b></span><span class="oc-info"></span><span class="grow"></span>${toolsSlot('oc')}${tb}`
        : `<span class="grow"></span>${tb}`;
    main.style.setProperty('--gem-c', a ? crystalOf(a.id).color : '');
    bar.toggleAttribute('data-ask', a?.status === 'asks');
    paintHead(bar, html, { bar: v?.bar, menu: v?.el.querySelector('.ch-menu'), home: () => v?.home?.() });
  }

  function empty() {
    const n = [...agents.all.values()].filter(mine).length;
    chat.innerHTML = `<div class="oc-empty"><p>${n ? `Press <kbd>${esc(tabKey())}</kbd>: the top chat in the list opens here.` : esc(noneHere())}</p>${pref('orch:list') ? '<p class="dim">Click a chat in the list to show it.</p>' : ''}</div>`;
  }

  function closed(a: Agent, end: boolean) {
    const id = a.id, shown = cur === id || view?.id === id;
    if (end) {
      addClosed(a);
      if (view?.id === id && view.v.stop) {
        view.v.stop();
        view = null;
      } else quietly(api('DELETE', '/api/agent?id=' + encodeURIComponent(id), {}));
      agents.all.delete(id);
    }
    pass = pass.filter((x) => x !== id);
    if (!shown) return paint();
    const listed = new Set(rows()), next = waiting().find((x) => x.id !== id && listed.has(x.id));
    letGo();
    cur = next?.id || null;
    if (cur) store.set(key, cur);
    else store.del(key);
    mount(true);
    if (!view) list.focus();
  }

  function letGo() {
    fresh = false;
    if (!view) return;
    view.v.detach();
    view = null;
  }

  async function beside(s: Earlier) {
    const live = chatOfSession(s.session);
    if (live && (live.pid || '') === pid && amElse(live) && !(await claim(live))) return 'none';
    if (live && mine(live)) return pick(live.id);
    startHere(s.program, s);
    return 'left';
  }

  function whenIn(id: string, fn: () => unknown) {
    if (agents.all.has(id)) return void fn();
    const off = onAgents(() => agents.all.has(id) && (off(), fn()));
  }

  function follow(tab: Tab, v: View) {
    return () => {
      if (view?.v !== v) return;
      const id = tab.chat;
      if (!id) {
        if (view.id) {
          const old = view.id;
          view.id = '';
          if (cur === old) cur = null;
          paint();
        }
        return;
      }
      if (view.id === id) return;
      const old = view.id;
      view.id = id;
      fresh = false;
      cur = id;
      store.set(key, id);
      if (old) pass = pass.map((x) => (x === old ? id : x));
      putIn(id, { in: 'orch' });
      whenIn(id, () => putIn(id, { in: 'orch' }));
      paint();
    };
  }

  const put = (v: View, a: Agent | null | undefined) => (landing && v.land ? v.land(a?.ask ? 1500 : 0) : v.focus());
  function mount(focus: boolean) {
    const a = cur ? agents.all.get(cur) : null;
    if (view && view.id === cur) return focus && put(view.v, a);
    letGo();
    if (!a) {
      empty();
      return paint();
    }
    const tab: Tab = { id: 'orch-' + uid(), type: chatTabOf(a.program), path: null, chat: a.id, pid: a.pid || pid } as Tab;
    let saved = () => {};
    const v = makeChat(tab, { saved: () => saved(), filesChanged, openFile, titled() {}, openBeside: beside });
    saved = follow(tab, v);
    view = { id: a.id, v };
    chat.replaceChildren(v.el);
    paint();
    const ld = landing;
    if (focus) requestAnimationFrame(() => view?.v === v && (ld && v.land ? v.land(a.ask ? 1500 : 0) : v.focus()));
  }

  function reveal() {
    const r = list.querySelector<HTMLElement>('.oc-row.here');
    if (!r) return;
    if (r === list.querySelector('.oc-row')) list.scrollTop = 0;
    else r.scrollIntoView({ block: 'nearest' });
  }

  function go(id: string, focus = true) {
    if (id !== cur || fresh) {
      cur = id;
      store.set(key, id);
    }
    mount(focus);
    reveal();
  }

  function startHere(program: string | undefined, from?: Earlier) {
    letGo();
    cur = null;
    pass = [];
    fresh = true;
    const tab = { id: 'orch-' + uid(), type: chatTabOf(program), path: null, pid: from?.pid || pid, ...(from && { resume: from.session, title: from.title }) } as Tab;
    let saved = () => {};
    const v = makeChat(tab, {
      saved: () => saved(),
      filesChanged,
      openFile,
      titled() {},
      openBeside: beside,
    });
    saved = follow(tab, v);
    view = { id: '', v };
    chat.replaceChildren(v.el);
    if (tab.chat) saved();
    else paint();
    requestAnimationFrame(() => view?.v === v && v.focus());
  }

  const atTop = () => {
    const r = rail.getBoundingClientRect();
    return [r.left + 8, r.top + 8] as const;
  };
  function newAgent(x: number, y: number, program?: string, place = 'top'): unknown {
    if (program) return startHere(program);
    return launchAgent(place, x, y, startHere, '');
  }

  function pick(id: string, focus = true) {
    pass = [];
    return go(id, focus);
  }

  function step(d: number) {
    const all = rows();
    if (!all.length) return tell(list, { title: noneLeft().replace(/\.$/, ''), ms: 1500 });
    if (all.length === 1 && all[0] === cur && !fresh) return tell(list, { title: 'This is the only chat in this orchestration', ms: 1500 });
    if (fresh || !cur || !pass.includes(cur)) pass = all;
    for (let i = fresh || !cur ? (d > 0 ? 0 : pass.length - 1) : pass.indexOf(cur) + d; ; i += d) {
      if (i < 0 || i >= pass.length) {
        pass = rows();
        const ends = d > 0 ? pass : [...pass].reverse();
        const to = ends.find((id) => id !== cur) || ends[0];
        return to && land(to);
      }
      const a = agents.all.get(pass[i]);
      if (a && mine(a)) return land(a.id);
    }
  }
  function land(id: string) {
    landing = true;
    try {
      go(id);
    } finally {
      landing = false;
    }
  }

  const termH = () => Math.max(MIN_TERM, Number(store.get('orch:termH', 240)) || 240);
  const tx = document.createElement('button');
  tx.className = 'oc-tx';
  tx.dataset.ocTermx = '';
  tx.title = 'Hide the terminal\nHides it; it keeps running.';
  tx.setAttribute('aria-label', 'hide the terminal');
  tx.innerHTML = ICONS.wx;
  tx.addEventListener('click', () => setPref('orch:term', false));
  function termShown() {
    tx.hidden = !pref('orch:termX');
    const want = !!pref('orch:term') && !el.hidden;
    tbox.hidden = tgrip.hidden = !want;
    if (!want) {
      term?.detach();
      term = null;
      tbox.replaceChildren();
      return;
    }
    tbox.style.height = termH() + 'px';
    if (term) return;
    const old: string | null = store.get(termKey, null), at = Date.now();
    let id = old;
    const t = makeTerm(old ? { id: old } : { program: 'shell' }, {
      started(nid: string) {
        id = nid;
        store.set(termKey, nid);
        putIn(nid, { in: 'orch' });
      },
      ended() {
        if (id && store.get(termKey, null) === id) store.del(termKey);
        if (term !== t || !old || id !== old || Date.now() - at > 3000) return;
        t.detach();
        term = null;
        termShown();
      },
    });
    term = t;
    tbox.replaceChildren(t.el, tx);
  }

  const onKey = (e: KeyboardEvent) => {
    if (el.hidden || !el.isConnected) return;
    if (is(e, 'newChatN')) {
      const c = CHATS[+e.key - 1];
      if (!c) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (!chatOn(c[0])) return offTell(list, c[1]);
      return newAgent(...atTop(), c[0]);
    }
    if (!is(e, 'windowKey')) return;
    const f = document.activeElement;
    if (f && f !== document.body && (!el.contains(f) || f.closest('.oc-term, .dk-ask, .cf-name'))) return;
    if (document.querySelector('.ch-sug:not([hidden]) [data-sug], .ch-pop[role=listbox]:not([hidden])')) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.repeat) step(e.shiftKey ? -1 : 1);
  };
  window.addEventListener('keydown', onKey, true);

  const closeRow = (a: Agent, sure = false) => close(a, sure).then((r) => (r === 'end' || r === 'left' ? closed(a, r === 'end') : !el.hidden && paint()));

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (lst.dragged()) return;
    if (t.closest('.dk-ask')) return;
    if (lst.click(e)) return;
    const fb = t.closest<HTMLElement>('[data-oc-folder]');
    if (fb) {
      const a = view?.id ? agents.all.get(view.id) : null;
      return a && canFile('orch', a) && moveMenu('orch', a, fb, fb.offsetWidth ? fb : bar.querySelector<HTMLElement>('.ch-more') || bar);
    }
    if (t.closest('[data-oc-seen]')) {
      if (t.closest('[data-oc-down]')) chat.querySelector<HTMLElement>('.ch-jump')?.click();
      return seen();
    }
    const hb = t.closest<HTMLElement>(HEAD_SEL);
    if (hb && (bar.contains(hb) || (hb.closest('.ch-menu') && chat.contains(hb)))) {
      const a = view?.id ? agents.all.get(view.id) : null;
      return Promise.resolve(head.act(hb, a || null, paint, e)).then((r) => (a && (r === 'end' || r === 'left') ? closed(a, r === 'end') : !el.hidden && paint()));
    }
    if (t.closest('[data-oc-term]')) return setPref('orch:term', !pref('orch:term'));
  });

  rail.addEventListener('contextmenu', (e) => {
    if ((e.target as HTMLElement).closest('.dk-ask')) return;
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-oc]'), a = r ? agents.all.get(r.dataset.oc!) : null;
    if (!r || !a) return;
    e.preventDefault();
    rowMenu(a, r, e.clientX, e.clientY);
  });
  function rowMenu(a: Agent, r: HTMLElement, x: number, y: number, fly = '') {
    const chat = a.kind === 'chat', redraw = () => !el.hidden && paint();
    const top = menuHead(gem(chat ? 'ai' : 'term'), titleOf(a));
    const move = chat ? `<button class="mi" data-oc-mv data-sub aria-haspopup="menu" aria-expanded="false"><i class="tb-ic">${icon('move')}</i><span class="mi-n">${esc(verb(a))}</span><span class="pk-ar">›</span></button>` : '';
    const pk = !chat || !foldersOn('orch') ? '' : canFile('orch', a) ? moveItem('orch', a) : `<button class="mi" disabled title="Move to folder&#10;A chat can go into a folder once it has its first message."><i class="tb-ic">${icon('folder')}</i><span class="mi-n">move to folder</span></button>`;
    const rep = chat && a.status !== 'ended' ? miRow('data-oc-rp', ICONS.bell, a.report ? 'stop notifying me' : 'notify me', '', a.report ? "A notification each time this chat is ready, while you aren't looking at it. Click to stop it." : "A notification each time this chat is ready, while you aren't looking at it. Click to turn it on.") : '';
    const cw = cacheRow(a);
    const mk = chat && a.session && pref('marks:on') ? markFly(a, fly) : '';
    const group = (...g: string[]) => g.filter(Boolean).join('');
    const actions = [group(renameItem(a), move, pk), miRow('data-oc-x', icon('close'), 'close', '', 'Asks where to close it from.'), group(rep, cw, mk)].filter(Boolean).join('<div class="sep"></div>');
    popMenu(x, y, top + bands({ actions, ...(chat ? rowListBands('orch') : {}) }), (b) => {
      const d = b.dataset;
      if (rowListPick('orch', b)) return;
      if (d.fly) return rowMenu(a, r, x, y, fly === d.fly ? '' : d.fly);
      if ('rename' in d) return renameAsk(a);
      if (d.mk != null) return (mark(a.session!, markPick(a, +d.mk)), redraw());
      if ('ocMv' in d) return moveOut(a, r, redraw, null, b);
      if ('ocRp' in d) return report(a, r);
      if ('ocCw' in d) return void cacheFlip(a, r);
      if ('cfMv' in d) return moveSub('orch', a, b);
      if ('ocX' in d) return closeRow(a);
    });
    arrowIntoSub(document.querySelector<HTMLElement>('#colormenu [data-oc-mv]'), '.sub-fly .set-rows button:not(:disabled)');
  }
  chat.addEventListener('keydown', (e) => {
    if (badge.hidden || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (e.key !== 'Enter' && e.key.length !== 1) return;
    if (!(e.target as HTMLElement).closest('textarea, input, [contenteditable="true"]')) return;
    seen();
  });

  rail.addEventListener('keydown', (e) => lst.key(e));
  const dropRow = (e: DragEvent) => {
    const r = (e.target as HTMLElement).closest?.<HTMLElement>('[data-oc]');
    return r && fileDrag(e, S.dragging) && agents.all.get(r.dataset.oc!)?.kind === 'chat' ? r : null;
  };
  const unlight = () => rail.querySelector('.oc-row.drop')?.classList.remove('drop');
  rail.addEventListener('dragover', (e) => {
    const r = dropRow(e);
    if (!r?.classList.contains('drop')) unlight();
    if (!r) return;
    e.preventDefault();
    r.classList.add('drop');
  });
  rail.addEventListener('dragleave', (e) => !rail.contains(e.relatedTarget as Node) && unlight());
  rail.addEventListener('drop', (e) => {
    unlight();
    const r = dropRow(e);
    if (!r) return;
    e.preventDefault();
    pick(r.dataset.oc!);
    view?.v.take?.(e);
  });

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button')) return;
    if (t.closest('.dk-ask, .dk-strip, input, textarea')) return;
    if (t.closest('[data-oc], .cf-h')) return;
    if (t === list || t.closest('.oc-list .dk-gh, .oc-list .dk-none')) return dragSection(e, 'list');
    if (t.closest('.oc-bar')) return dragSection(e, 'chat');
  });

  for (const g of el.querySelectorAll<HTMLElement>('.oc-grip')) g.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const o = orchOrder(), left = o.indexOf('files') < o.indexOf('chat');
    const x0 = e.clientX, w0 = main.getBoundingClientRect().width, room = w0 + Math.max(0, (document.getElementById('main')?.getBoundingClientRect().width || 0) - MIN_FILES);
    const host = el.parentElement!;
    document.body.classList.add('resizing-x');
    grip = track(e, {
      move: (ev) => {
        const w = Math.min(room, Math.max(MIN_W, Math.round(w0 + (left ? x0 - ev.clientX : ev.clientX - x0))));
        host.style.setProperty('--orch-w', w + 'px');
      },
      end: (ok) => {
        document.body.classList.remove('resizing-x');
        grip = null;
        if (ok) store.set('orch:cw', parseInt(host.style.getPropertyValue('--orch-w')) || 0);
        else host.style.setProperty('--orch-w', orchWidth() ? orchWidth() + 'px' : '');
      },
    });
  });

  const lgripTip = () => {
    for (const g of el.querySelectorAll<HTMLElement>('.oc-lgrip')) g.title = pref('orch:list') ? 'Hide the list\nDrag it all the way to the edge to hide the list.' : 'Show the list\nClick, or drag it, to show the list again.';
  };
  lgripTip();
  let lgripX = 0;
  for (const g of el.querySelectorAll<HTMLElement>('.oc-lgrip')) {
    g.addEventListener('click', (e) => {
      if (!pref('orch:list') && (!e.detail || Math.abs(e.clientX - lgripX) < 3)) setPref('orch:list', true);
    });
    g.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      lgripX = e.clientX;
      if (!pref('orch:list')) {
        const ls = listSides();
        const dir = ls.l && ls.r ? 'mid' : g.dataset.side === 'r' ? 'r' : 'l';
        grip = showDrag(e, g, dir, () => setPref('orch:list', true));
        return;
      }
      grip = hideDrag(e, rail, g, g.dataset.side === 'r', () => setPref('orch:list', false));
    });
  }

  tgrip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY, h0 = tbox.getBoundingClientRect().height, max = Math.max(MIN_TERM, main.clientHeight - MIN_CHAT);
    document.body.classList.add('resizing-y');
    track(e, {
      move: (ev) => {
        tbox.style.height = Math.min(max, Math.max(MIN_TERM, Math.round(h0 + y0 - ev.clientY))) + 'px';
      },
      end: (ok) => {
        document.body.classList.remove('resizing-y');
        if (ok) store.set('orch:termH', parseInt(tbox.style.height) || termH());
        else tbox.style.height = h0 + 'px';
      },
    });
  });

  const fgrip = $('.oc-fgrip'), col = $('.oc-col');
  fgrip.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const files = document.getElementById('main');
    if (!files) return;
    const y0 = e.clientY, h0 = files.getBoundingClientRect().height, total = col.clientHeight - fgrip.offsetHeight;
    if (total <= 0) return;
    const app = document.getElementById('app')!, was = app.style.getPropertyValue('--oc-fh');
    document.body.classList.add('resizing-y');
    track(e, {
      move: (ev) => {
        const h = Math.min(total - Math.max(MIN_CHAT, parseFloat(getComputedStyle(main).minHeight) || 0), Math.max(MIN_FILES_H, h0 + y0 - ev.clientY));
        app.style.setProperty('--oc-fh', (Math.max(0.1, Math.min(0.9, h / total)) * 100).toFixed(2) + '%');
      },
      end: (ok) => {
        document.body.classList.remove('resizing-y');
        if (ok) store.set('orch:filesH', parseFloat(app.style.getPropertyValue('--oc-fh')) / 100 || 0.5);
        else app.style.setProperty('--oc-fh', was);
      },
    });
  });

  const unwatch = onAgents(() => {
    if (el.hidden) return;
    const gone = cur && view?.id === cur ? agents.all.get(cur) : null;
    if (gone && !mine(gone)) return closed(gone, false);
    paint();
    if (!view && cur && agents.all.has(cur) && mine(agents.all.get(cur)!)) mount(false);
  });
  const unprefs = [
    onCleared(() => !el.hidden && paint()),
    onFolders(() => !el.hidden && paint()),
    ...[...listPrefs('orch'), 'orch:folderBtn', 'orch:files', 'orch:list', 'deck:doneBadge', 'agents:off', 'orch:termBtn', 'orch:closeBtn'].map((k) => onPref(k, () => !el.hidden && paint())),
    onPref('orch:list', () => (lgripTip(), !view && chat.querySelector('.oc-empty') && empty())),
    onPref('orch:termX', () => (tx.hidden = !pref('orch:termX'))),
    onPref('orch:term', () => {
      if (el.hidden) return;
      termShown();
      paint();
    }),
  ];

  function start() {
    if (!cur || !agents.all.has(cur) || !mine(agents.all.get(cur)!)) {
      cur = rows()[0] || (cur && agents.all.has(cur) ? null : cur);
    }
    mount(false);
    termShown();
  }

  return {
    el,
    show(on: boolean) {
      if (on === !el.hidden) return;
      el.hidden = !on;
      if (on) live = el;
      else if (live === el) live = null;
      placeFiles();
      if (!on) {
        grip?.();
        termShown();
        return letGo();
      }
      delete bar.dataset.sig;
      badgeDrawn = '';
      start();
      requestAnimationFrame(reveal);
    },
    focus: () => (view ? view.v.focus() : list.focus()),
    refresh: () => !el.hidden && paint(),
    paintPins() {
      const k = JSON.stringify(S.marks);
      if (k === marksWas) return;
      marksWas = k;
      if (!el.hidden) paint();
    },
    open: (id: string) => pick(id),
    resume: (from: Earlier) => startHere(from.program, from),
    newAgent: (x: number, y: number, _into?: number, place?: string, program?: string) => newAgent(x, y, program, place),
    attach: (rel: string) => view?.v.attach?.(rel),
    detach() {
      grip?.();
      window.removeEventListener('keydown', onKey, true);
      unwatch();
      unprefs.forEach((u) => u());
      letGo();
      term?.detach();
      term = null;
      lst.off();
      if (live === el) live = null;
      placeFiles();
    },
  };
}
