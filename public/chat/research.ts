import { createChat } from './chat.ts';
import { icon } from '../base/icon.ts';
import { ask, bands, barMenu, ICONS, keepMenu, menuHead, popMenu } from '../base/controls.ts';
import { askEnd, clearedOf, codeOf, crystalOf, groupOf, markOf, providerOf, setCleared, spark, stillAt, titleOf } from '../base/agentlook.ts';
import { createText } from '../base/textbox.ts';
import { span } from '../base/hitch.ts';
import { gem } from '../base/kinds.ts';
import { every } from '../base/life.ts';
import { api, levelKey, S } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { chatOn, chatsOn, onPref, pref, PREFS } from '../base/prefs.ts';
import { agents, chatOfSession, onAgents, started } from '../base/stream.ts';
import { place } from '../base/place.ts';
import { dragGap } from '../base/split.ts';
import { followSubs, paneClick, subDur, subPane } from './subview.ts';
import { agentName, amKey, chatProgram, chatTabOf, esc, showErr, sinceShort, store, track, uid } from '../base/util.ts';
import type { Follow } from './subview.ts';
import type { Agent } from '../base/stream.ts';
import { agentHead, HEAD_BTNS, HEAD_SEL, headClick, paintHead, toolsSlot } from '../app/chathead.ts';
import type { HeadCan } from '../app/chathead.ts';
import { setMark, togglePin } from '../app/actions.ts';
import { markMenu } from '../base/agentrow.ts';
import { agentPin } from '../base/model.ts';

type Row = { k: string; id: string | null; session?: string | null; program?: string; title?: string; at?: number };
type RTab = { t: string; k?: string; sub?: string; path?: string; pv?: boolean };
type Group = { id: string; size: number; on: number; tabs: RTab[] };
type At = { g: Group; gi: number; i: number; t: RTab };
type Pane = { host: HTMLElement; draw: () => void; stop?: () => void; k: string };
type Land = { g: Group; at?: number; after?: boolean; box: { left: number; top: number; width: number; height: number } };

barMenu('.rs-rail > .dk-rhead', '', { open: (h, e) => (h.closest('.rs') as any)?.railMenu?.(e) });

const MAXG = 4;
const AGENT = [
  { value: 'claude', name: 'Claude Agent', description: 'uses your Claude sign-in' },
  { value: 'codex', name: 'Codex Agent', description: 'uses your Codex CLI sign-in' },
  { value: 'antigravity', name: 'Antigravity Agent', description: 'uses your Antigravity CLI sign-in' },
  { value: 'cursor', name: 'Cursor Agent', description: 'uses your Cursor CLI sign-in' },
  { value: 'copilot', name: 'Copilot Agent', description: 'uses your GitHub Copilot CLI sign-in' },
  { value: 'grok', name: 'Grok Agent', description: 'uses your Grok CLI sign-in' },
];
const keyOf = () => `research:${levelKey()}${amKey}`;
const subsOn = () => pref('subagents:on') && pref('subagents:research');

export function researchInfo() {
  const all = (store.get(keyOf(), {}).rows || []).map((r: Row) => agents.all.get(r.id as string)).filter(Boolean);
  return { chats: all.length, ...Object.fromEntries(['asks', 'done', 'working'].map((st) => [st, all.filter((a: Agent) => a.status === st).length])), doneIds: all.filter((a: Agent) => a.status === 'done').map((a: Agent) => a.id) };
}

type RsBox = { k: string; id: any; tab: any; view: ReturnType<typeof createChat>; wrap: HTMLDivElement; frame?: HTMLElement };
const RS_CAN: HeadCan = { mark: true, pin: true, set: true, tab: true, bench: false, close: 'menu', closeTip: 'close the tab (the chat stays in the list)', setTip: 'move it to a set of the agents', where: 'Research' };

export function createResearch({ sendTo, openTab, show, filesChanged, moveTo }: { sendTo: any; openTab: any; show: any; filesChanged: any; openFile?: (path: string) => void; moveTo: (btn: Element, pick: (set: any) => unknown) => unknown }) {
  const key = keyOf(), saved = structuredClone(store.get(key, {}));
  let program = chatProgram(chatTabOf(saved.program));
  if (!chatOn(program)) program = chatsOn()[0][0];
  let rows: Row[] = (Array.isArray(saved.rows) ? saved.rows : []).filter((r: Row) => r?.k && (r.id || r.session));
  const has = (k: string | undefined) => rows.some((r) => r.k === k), rowOf = (k: string | undefined) => rows.find((r) => r.k === k);
  let groups = groupsFrom(saved), focusG = 0;
  let boxId = saved.box || null, draft = saved.draft || '';
  let railAfter: string = saved.railAfter === 'end' || groups.some((g) => g.id === saved.railAfter) ? saved.railAfter : '';
  const save = () => store.set(key, { program, rows: rows.map(({ k, id, session, program, title, at }) => ({ k, id, session, program, title, at })), groups: groups.map(({ id, size, on, tabs }) => ({ id, size, on, tabs })), box: boxId, draft, railAfter });
  function groupsFrom(s: any): Group[] {
    const ok = (t: RTab) => t && (t.t === 'box' || ((t.t === 'chat' || t.t === 'sub') && has(t.k) && (t.t === 'chat' || t.sub)) || (t.t === 'file' && t.path));
    let gs: Group[] = (Array.isArray(s.groups) ? s.groups : []).map((g: Group) => ({ id: g.id || uid(), size: g.size > 0 ? g.size : 1, on: g.on | 0, tabs: (g.tabs || []).filter(ok).map((t: RTab) => ({ ...t })) })).filter((g: Group) => g.tabs.length).slice(0, MAXG);
    if (!gs.length) {
      const was = [...(s.big ? [s.big] : []), ...(Array.isArray(s.side) ? s.side : [])].filter(has);
      gs = [newGroup(was.length ? was.map((k: string) => ({ t: 'chat', k })) : [{ t: 'box' }])];
    }
    gs.forEach((g) => (g.on = Math.min(Math.max(0, g.on), g.tabs.length - 1)));
    return gs;
  }
  function newGroup(tabs: RTab[]): Group {
    return { id: uid(), size: 1, on: tabs.length - 1, tabs };
  }
  const railSlot = () => (railAfter === 'end' ? groups.length : groups.findIndex((g) => g.id === railAfter) + 1);
  function unGroup(g: Group) {
    const i = groups.indexOf(g);
    if (railAfter === g.id) railAfter = i > 0 ? groups[i - 1].id : '';
    groups.splice(i, 1);
    if (railAfter && railAfter === groups.at(-1)?.id) railAfter = 'end';
  }

  const views = new Map<string, RsBox>();
  const files = new Map<string, ReturnType<typeof createText>>();
  const panes = new Map<string, Pane>();
  const follows = new Map<string, Follow>();
  const said: Record<string, any> = {};
  let box: RsBox | null = null;

  const el = document.createElement('div');
  el.className = 'rs';
  el.innerHTML = `
    <aside class="rs-rail"><header class="dk-rhead"><button class="primary" data-rs-new title="New chat&#10;A new chat, its box in a tab.&#10;&#10;Drag to move the list left, right or between groups.">+<span> new chat</span></button></header><div class="rs-list dk-list"></div></aside>
    <div class="rs-groups"><div class="rs-sp" data-split="row"></div></div>`;
  const $ = (s: string) => el.querySelector<HTMLElement>(s);
  const list = $('.rs-list')!, row = $('.rs-sp')!, rail = $('.rs-rail')!, head = $('.rs-rail > .dk-rhead')!;

  function find(is: (t: RTab) => unknown): At | null {
    for (const [gi, g] of groups.entries()) {
      const i = g.tabs.findIndex(is);
      if (i >= 0) return { g, gi, i, t: g.tabs[i] };
    }
    return null;
  }
  const show_ = (at: { g: Group; i: number }) => ((at.g.on = at.i), (focusG = groups.indexOf(at.g)));
  function untab(at: At) {
    const { g, i, t } = at;
    g.tabs.splice(i, 1);
    if (g.on >= i && g.on > 0) g.on--;
    letTab(t);
    if (!g.tabs.length) {
      if (groups.length > 1) unGroup(g);
      else g.tabs.push({ t: 'box' }), (g.on = 0);
    }
    focusG = Math.min(focusG, groups.length - 1);
  }
  function letTab(t: RTab) {
    if (t.t === 'chat') letGo(t.k!);
    else if (t.t === 'file') files.get(t.path!)?.stop(), files.delete(t.path!);
    else if (t.t === 'sub') dropPane(t.sub!);
  }
  function addTab(gi: number, t: RTab) {
    const g = groups[gi];
    g.tabs.push(t);
    g.on = g.tabs.length - 1;
    focusG = gi;
  }
  function besideOf(t: RTab) {
    if (groups.length < MAXG) {
      groups.push(newGroup([t]));
      focusG = groups.length - 1;
      return;
    }
    addTab(groups.length - 1, t);
    tell(groupEl(groups.at(-1)!).kid, { title: `${MAXG} groups side by side at most`, line: 'It opened as a tab in the last group; close a group to make room', ms: 2500 });
  }
  const gidOf = (is: (t: RTab) => unknown) => find(is)?.gi ?? focusG;

  const opts = (e: RsBox) => ({
    saved: () => moved(e),
    filesChanged,
    openFile: (p: string) => openFileTab(p, gidOf((t) => t.t === 'chat' && t.k === e.k)),
    titled() {},
    openBeside,
    openSub: (sub: string, keep: boolean) => openSubTab(e.k, sub, keep),
  });
  function moved(e: RsBox) {
    const id = e.tab.chat, r = rowOf(e.k), program = chatProgram(e.tab.type);
    if (!id || (e.id === id && (!r || chatProgram(chatTabOf(r.program)) === program))) return;
    if (e.id !== id) started({ id, kind: 'chat', program, pid: S.pid, title: r?.title || '' }, { in: 'research' });
    e.id = id;
    if (e === box) boxId = id;
    if (r) Object.assign(r, { id, program });
    save();
    paint();
  }
  function viewOf(r: Row) {
    let e = views.get(r.k);
    if (e) return e;
    const a = agents.all.get(r.id as string), live = a && a.status !== 'ended';
    e = { k: r.k, id: live ? r.id : null, tab: { id: 'rs-' + uid(), type: chatTabOf(r.program), pid: S.pid, ...(live ? { chat: r.id } : { resume: r.session, title: r.title }) } } as RsBox;
    views.set(r.k, e);
    e.view = createChat(e.tab, opts(e));
    e.frame = frameOf(e);
    if (e.tab.chat && e.id !== e.tab.chat) moved(e);
    return e;
  }
  function frameOf(e: RsBox) {
    const f = document.createElement('div');
    f.className = 'dk-cell ed-cell rs-cell';
    f.innerHTML = '<header class="dk-ch"></header><div class="dk-body"></div>';
    f.lastElementChild!.append(e.view.el);
    f.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>(HEAD_SEL), k = e.k, a = agents.all.get(rowOf(k)?.id as string);
      if (!b || !f.contains(b)) return;
      headClick(b, {
        agent: () => agents.all.get(rowOf(k)?.id as string),
        out: () => {
          const at = find((t) => t.t === 'chat' && t.k === k);
          if (!at) return;
          untab(at);
          save();
          paint();
        },
        set: (at) =>
          a &&
          moveTo(at, (set) => {
            if (!has(k)) return;
            leave(k);
            sendTo('chat', a.id, set);
          }),
        tab: () => {
          if (!a) return;
          leave(k);
          openTab(a);
        },
        pin: (x) => togglePin(agentPin(x, titleOf(x))),
        mark: (x, l, t) => markMenu(x, l, t, setMark, paint),
      });
    });
    return f;
  }
  function paintHeadOf(e: RsBox) {
    const a = agents.all.get(e.id as string), f = e.frame;
    if (!f) return;
    const hd = f.firstElementChild as HTMLElement;
    if (a) f.style.setProperty('--gem-c', crystalOf(a.id).color);
    hd.toggleAttribute('data-ask', a?.status === 'asks');
    paintHead(hd, a ? agentHead(a, RS_CAN) : `<i class="dk-mark">${gem('ai')}</i><b class="dk-title">${esc(rowOf(e.k)?.title || 'chat')}</b><span class="grow"></span>${toolsSlot()}`, { bar: e.view.bar, menu: e.view.el.querySelector('.ch-menu'), home: () => e.view.home?.() });
  }
  function letGo(k: string) {
    const e = views.get(k);
    if (e) e.view.detach();
    views.delete(k);
  }
  function leave(k: string) {
    const r = rowOf(k)!;
    for (let at: At | null; (at = find((t) => (t.t === 'chat' || t.t === 'sub') && t.k === k)); ) untab(at);
    letGo(k);
    rows = rows.filter((x) => x !== r);
    place(r.id as string, null);
    save();
    paint();
  }
  function openBeside({ session, program, title }: { session: string; program: string; title?: string }) {
    const a = chatOfSession(session), mine = a && rows.find((r) => r.id === a.id);
    if (mine) return openRow(mine.k);
    if (a) {
      show?.(a);
      return 'left';
    }
    const r: Row = { k: uid(), id: null, session, program, title, at: Date.now() };
    rows.unshift(r);
    openRow(r.k);
  }

  const extras = () => {
    const options = AGENT.filter((o) => chatOn(o.value));
    return options.length > 1 ? [{ key: 'rsAgent', name: 'Agent', category: 'research', value: program, options }] : [];
  };
  function pick(k: string, value: unknown) {
    if (k !== 'rsAgent' || value === program) return;
    program = value as string;
    draft = box!.view.draft();
    box!.view.stop();
    box = boxId = null;
    makeBox();
    save();
    paint();
  }
  function makeBox() {
    const a = boxId && agents.all.get(boxId), chat = a && a.status !== 'ended' ? boxId : null;
    if (!chat) boxId = null;
    const e = (box = { k: uid(), id: chat, tab: { id: 'rs-' + uid(), type: chatTabOf(program), pid: S.pid, ...(chat ? { chat } : {}), ...(draft ? { draft } : {}) } } as RsBox) as RsBox;
    draft = '';
    e.view = createChat(e.tab, { ...opts(e), box: { extras, pick, seed: said[program], placeholder: 'Ask anything…', firing: (o: { go: boolean; text: string; done: Promise<void> }) => firing(e, o) } });
    e.view.el.prepend(Object.assign(document.createElement('h2'), { className: 'rs-h', textContent: 'Start a chat' }));
    e.wrap = Object.assign(document.createElement('div'), { className: 'rs-box' });
    e.wrap.append(e.view.el);
    if (e.tab.chat && e.id !== e.tab.chat) moved(e);
  }
  function firing(e: RsBox, { text }: { text: string }) {
    const chips = e.view.said();
    if (chips.configs.length) said[program] = JSON.parse(JSON.stringify(chips));
    e.view.el.querySelector('.rs-h')?.remove();
    const r: Row = { k: e.k, id: e.tab.chat || null, session: null, program, title: text.split('\n')[0].slice(0, 80), at: Date.now() };
    rows.unshift(r);
    views.set(r.k, e);
    const at = find((t) => t.t === 'box');
    if (at) (at.g.tabs[at.i] = { t: 'chat', k: r.k }), show_(at);
    else addTab(0, { t: 'chat', k: r.k });
    box = boxId = null;
    makeBox();
    save();
    paint();
    e.view.focus();
  }
  function newChat() {
    if (!box) makeBox();
    const at = find((t) => t.t === 'box');
    if (at) show_(at);
    else addTab(0, { t: 'box' });
    save();
    paint();
    box!.view.focus();
  }

  function openFileTab(path: string, gi = focusG) {
    const at = find((t) => t.t === 'file' && t.path === path);
    if (at) show_(at);
    else addTab(Math.min(Math.max(0, gi), groups.length - 1), { t: 'file', path });
    save();
    paint();
    files.get(path)?.focus();
  }
  function fileOf(path: string) {
    let f = files.get(path);
    if (!f) files.set(path, (f = createText({ id: 'rs-' + uid(), type: 'text', path }, { openFile: (p: string) => openFileTab(p, gidOf((t) => t.t === 'file' && t.path === path)) })));
    return f;
  }
  function openSubTab(k: string, sub: string, keep: boolean) {
    if (!has(k)) return;
    const at = find((t) => t.t === 'sub' && t.sub === sub);
    if (at) {
      if (keep) at.t.pv = false;
      show_(at);
    } else {
      const t: RTab = { t: 'sub', k, sub, pv: !keep }, pv = find((x) => x.t === 'sub' && x.pv);
      if (pv) {
        dropPane(pv.t.sub!);
        pv.g.tabs[pv.i] = t;
        show_(pv);
      } else besideOf(t);
    }
    save();
    paint();
  }
  function paneOf(t: RTab) {
    let p = panes.get(t.sub!);
    if (p) return p;
    const r = rowOf(t.k), host = Object.assign(document.createElement('div'), { className: 'act-pane rs-sub' });
    if (!r?.id) {
      host.innerHTML = '<div class="act-empty">Its chat has ended: open the chat to pick it up again, then its subagents show here.</div>';
      panes.set(t.sub!, (p = { host, draw() {}, k: t.k! }));
      return p;
    }
    let fo = follows.get(t.k!);
    if (!fo) follows.set(t.k!, (fo = followSubs(r.id, () => (panes.forEach((x) => x.k === t.k && x.draw()), paintGroups()))));
    const draw = subPane(host, fo, 'Its steps show here as its chat brings them…');
    panes.set(t.sub!, (p = { host, draw: () => draw(t.sub!), stop: draw.stop, k: t.k! }));
    p.draw();
    return p;
  }
  function dropPane(sub: string) {
    const p = panes.get(sub);
    if (!p) return;
    p.stop?.();
    panes.delete(sub);
    if ([...panes.values()].some((x) => x.k === p.k)) return;
    follows.get(p.k)?.stop();
    follows.delete(p.k);
  }
  let tick: (() => void) | null = null;
  function ticking() {
    const running = [...panes.entries()].some(([sub, p]) => follows.get(p.k)?.m.get(sub)?.status === 'running');
    if (running && !tick) tick = every(1000, () => panes.forEach((p) => p.draw()));
    if (!running) tick?.(), (tick = null);
  }

  let sp: { split: string; sizes: number[] } = { split: 'row', sizes: [] };
  const gEls = new Map<string, { kid: HTMLElement; bar: HTMLElement; body: HTMLElement }>();
  function groupEl(g: Group) {
    let x = gEls.get(g.id);
    if (!x) {
      const kid = document.createElement('div');
      kid.className = 'rs-kid';
      kid.innerHTML = `<section class="rs-grp" data-g="${g.id}"><header class="rs-tabs"></header><div class="rs-gbody"></div></section>`;
      gEls.set(g.id, (x = { kid, bar: kid.querySelector<HTMLElement>('.rs-tabs')!, body: kid.querySelector<HTMLElement>('.rs-gbody')! }));
    }
    return x;
  }
  function tabHtml(g: Group, t: RTab, i: number) {
    let ic = '', name = '', tip = '';
    if (t.t === 'box') (ic = gem('ai')), (name = 'new chat'), (tip = 'New chat\nA new chat. Its first message starts it.');
    else if (t.t === 'chat') {
      const r = rowOf(t.k), a = agents.all.get(r?.id as string);
      ic = `<i class="rs-dot" data-st="${stOf(r)}"></i>`;
      name = a?.title || r?.title || 'a chat';
      tip = a ? `${titleOf(a)}\nA chat with ${providerOf(a)}${a.model ? `, on ${a.model}` : ''}.` : name;
    } else if (t.t === 'sub') {
      const s = follows.get(t.k!)?.m.get(t.sub!), sum = agents.all.get(rowOf(t.k)?.id as string)?.subs?.find((x: any) => x.id === t.sub), st = s?.status || sum?.status;
      ic = `<i class="rs-dot" data-st="${st === 'running' ? 'working' : st === 'failed' || st === 'stopped' ? 'ended' : 'done'}"></i>`;
      name = s?.name || s?.title || sum?.name || 'subagent';
      tip = t.pv ? `${name}\nA preview: the next subagent you click takes its place.\n\nDouble-click the tab to keep it.` : name;
    } else (ic = icon('file')), (name = t.path!.split('/').pop()!), (tip = `${t.path}\nWhere this file is in the project.`);
    return `<div class="rs-tab${i === g.on ? ' on' : ''}${t.pv ? ' pv' : ''}" data-rs-tab="${g.id}" data-i="${i}" title="${esc(tip)}"${t.t === 'file' ? ' data-tip-mono' : tip === name ? ' data-tip-cut=".tx"' : ''}>${ic}<span class="tx">${esc(name)}</span><button type="button" class="rs-tx" data-rs-tx="${g.id}" data-i="${i}" title="${t.t === 'chat' ? 'close the tab (the chat stays in the list)' : 'Close\nCloses this tab.'}" aria-label="close">${ICONS.wx}</button></div>`;
  }
  function contentOf(t: RTab) {
    if (t.t === 'box') return (box || (makeBox(), box))!.wrap;
    if (t.t === 'chat') {
      const e = viewOf(rowOf(t.k)!);
      e.frame ||= frameOf(e);
      if (e.view.el.parentElement !== e.frame!.lastElementChild) e.frame!.lastElementChild!.append(e.view.el);
      return e.frame!;
    }
    if (t.t === 'file') return fileOf(t.path!).el;
    return paneOf(t).host;
  }
  function keepingScroll(fn: () => void) {
    const kept = [...el.querySelectorAll('.ch-log, .act-log, .rs-list')].map((x) => [x, x.scrollTop] as const);
    fn();
    for (const [x, top] of kept) x.scrollTop = top;
  }
  function paintGroups() {
    const slot = railSlot(), sig = `${groups.map((g) => g.id).join()}|${slot}`;
    if (row.dataset.sig !== sig) {
      row.dataset.sig = sig;
      for (const id of [...gEls.keys()]) if (!groups.some((g) => g.id === id)) gEls.delete(id);
      const gut = (i: number) => {
        const x = Object.assign(document.createElement('div'), { className: 'rs-sg', title: 'drag to share the room' });
        x.dataset.i = String(i);
        return x;
      };
      const kids = groups.flatMap((g, i) => [...(i === slot ? [rail] : i ? [gut(i)] : []), groupEl(g).kid]);
      if (slot === groups.length) kids.push(rail);
      keepingScroll(() => row.replaceChildren(...kids));
    }
    sp = { split: 'row', sizes: groups.map((g) => g.size) };
    groups.forEach((g, gi) => {
      const x = groupEl(g), t = g.tabs[g.on];
      x.kid.style.flexGrow = g.size as unknown as string;
      x.kid.firstElementChild!.classList.toggle('focus', gi === focusG);
      const bar = g.tabs.map((tb, i) => tabHtml(g, tb, i)).join('') + '<span class="grow"></span>';
      if (x.bar.dataset.sig !== bar) (x.bar.innerHTML = bar), (x.bar.dataset.sig = bar);
      const c = t && contentOf(t);
      if (c && x.body.firstElementChild !== c) keepingScroll(() => x.body.replaceChildren(c));
      if (t?.t === 'chat' && t.k && views.has(t.k)) paintHeadOf(views.get(t.k)!);
      if (t?.t === 'file') files.get(t.path!)?.seen(S.thoughts.get(t.path!));
    });
    ticking();
  }

  const stOf = (r: Row | undefined) => agents.all.get(r?.id as string)?.status || (views.has(r?.k as string) ? 'starting' : 'ended');
  const lineOf = (r: Row, st = stOf(r)) => {
    const a = agents.all.get(r.id as string);
    return st === 'ended' ? 'ended' : a?.line && a.line !== 'ready' && !(a.title && a.line.startsWith(a.title)) ? a.line : '';
  };
  const shut = () => new Set(store.get('research:subs-shut', []));
  const shownSub = (sub: string) => groups.some((g) => g.tabs[g.on]?.t === 'sub' && g.tabs[g.on].sub === sub);
  function subsOf(r: Row) {
    const all: any[] = agents.all.get(r.id as string)?.subs || [];
    if (!subsOn() || !all.length) return '';
    const gone = clearedOf(r.id as string), shown = all.filter((s) => !gone.has(s.id)), off = shut().has(r.k), done = shown.filter((s) => s.status !== 'running');
    const subRows = off ? '' : shown.map((s, i) => `<div class="sub-row rs-subr s-${s.status}${shownSub(s.id) ? ' sel' : ''}${i === shown.length - 1 ? ' end' : ''}" data-rs-sub="${esc(s.id)}" data-rs-of="${esc(r.k)}" role="button" tabindex="0"><i class="d"></i><span class="a">${esc(s.name)}</span><span class="b">${esc([s.type, s.end ? subDur(s) : ''].filter(Boolean).join(' · '))}</span><span class="nw">${esc(s.status === 'running' ? s.now || 'starting…' : s.status)}</span>${s.status === 'running' ? '' : `<button class="x" data-rs-subclear="${esc(s.id)}" data-rs-of="${esc(r.k)}" title="Clear&#10;Clears it from this list. It stays in the chat.">${ICONS.wx}</button>`}</div>`).join('');
    const tail = [done.length > 1 && !off ? `<button data-rs-subdone="${esc(r.k)}" title="Clear ${done.length} finished&#10;Clears them from this list. They stay in the chat.">clear ${done.length} finished</button>` : '', gone.size ? `<button data-rs-subback="${esc(r.k)}">${gone.size} cleared · show</button>` : ''].join('');
    return `<div class="dk-subs"><div class="dk-subh"><button class="dk-subf${off ? ' shut' : ''}" data-rs-subfold="${esc(r.k)}">${all.length} subagent${all.length > 1 ? 's' : ''}</button>${tail}</div>${subRows}</div>`;
  }
  const onScreen = (k: string) => groups.some((g) => g.tabs[g.on]?.t === 'chat' && g.tabs[g.on].k === k);
  function paintList() {
    const one = (r: Row) => {
      const a = agents.all.get(r.id as string), st = stOf(r), id = r.id || r.k;
      const line = lineOf(r, st);
      const when = r.at ? `<span class="dk-when" data-at="${r.at}">${sinceShort(r.at)}</span>` : '';
      return `<div class="dk-row${onScreen(r.k) ? ' here' : ''}" data-st="${st}" data-rs-row="${esc(r.k)}" style="--gem-c:${crystalOf(id).color}" role="button" tabindex="0" title="${esc(a ? titleOf(a) : r.title || 'a chat')}" data-tip-cut=".dk-topic">
        <i class="dk-tile">${a ? markOf(a) : gem('ai')}<i class="dk-dot"></i></i>${st === 'asks' || st === 'working' || st === 'starting' ? spark(a ? groupOf(a) : 'working') : ''}
        <span class="dk-rt"><span class="dk-r1">${a ? codeOf(a.id, a.title || '') : ''}<i class="dk-provider">${agentName(r.program)}</i></span><b class="dk-topic">${esc(a?.title || r.title || 'a chat')}</b><span class="dk-line">${esc(line)}</span></span>${when}
        <button class="dk-x" data-rs-end="${esc(r.k)}" title="${a && a.status !== 'ended' ? 'end it' : 'take it off the list'}">×</button></div>${subsOf(r)}`;
    };
    const html = rows.map(one).join('') || `<p class="dk-none">${agents.why ? esc(agents.why) : 'No chats yet. Write in the box: its first message starts the chat.'}</p>`;
    if (list.dataset.sig !== html) {
      list.innerHTML = html;
      list.dataset.sig = html;
    }
    list.toggleAttribute('data-asks', rows.some((r) => agents.all.get(r.id as string)?.status === 'asks'));
  }
  function paint() {
    if (agents.loaded || agents.why) paintGroups();
    else if (rail.parentElement === el) $('.rs-groups')![railSlot() ? 'after' : 'before'](rail);
    paintList();
  }
  function paintLines() {
    const els = list.querySelectorAll<HTMLElement>('.dk-row');
    if (els.length !== rows.length || rows.some((r, i) => els[i].dataset.rsRow !== r.k || !els[i].querySelector('.dk-when') !== !r.at)) return paintList();
    rows.forEach((r, i) => {
      const line = lineOf(r), l = els[i].querySelector('.dk-line')!, w = els[i].querySelector<HTMLElement>('.dk-when');
      if (l.textContent !== line) {
        l.textContent = line;
        delete list.dataset.sig;
      }
      if (w && w.dataset.at !== String(r.at)) {
        w.dataset.at = r.at as unknown as string;
        w.textContent = sinceShort(r.at!);
        delete list.dataset.sig;
      }
    });
  }
  let stale = false;
  function sync({ lineOnly = false } = {}) {
    if (agents.loaded || agents.why) {
      let moved = false;
      for (const r of rows) {
        const a = agents.all.get(r.id as string);
        if (a) {
          const now = { title: a.title || r.title, session: a.session || r.session, at: a.at || r.at };
          if (now.title === r.title && now.session === r.session && now.at === r.at) continue;
          Object.assign(r, now);
          moved = true;
        } else if (agents.loaded && r.id && !views.has(r.k)) {
          r.id = null;
          moved = true;
        }
      }
      const was = rows.length;
      rows = rows.filter((r) => r.id || r.session || views.has(r.k));
      if (rows.length !== was) {
        for (let at: At | null; (at = find((t) => (t.t === 'chat' || t.t === 'sub') && !has(t.k))); ) untab(at);
        moved = true;
      }
      if (!box) {
        makeBox();
        moved = true;
      }
      if (moved) save();
    }
    if (el.hidden) stale = true;
    else if (lineOnly) span('research agents', paintLines);
    else span('research agents', paint);
  }

  function openRow(k: string) {
    const at = find((t) => t.t === 'chat' && t.k === k);
    if (at) show_(at);
    else addTab(0, { t: 'chat', k });
    save();
    paint();
    requestAnimationFrame(() => views.get(k)?.view.focus());
  }
  async function end(k: string) {
    const r = rowOf(k)!, a = agents.all.get(r?.id as string), alive = a && a.status !== 'ended';
    if (alive && stillAt(a)) {
      const v = views.get(k)?.view, r = await askEnd(`End “${titleOf(a)}”?`, stillAt(a), 'It can be picked up again from this list.', !!v?.clear);
      if (r === 'restart') return v!.clear();
      if (r !== 'close') return;
    }
    if (!has(k)) return;
    for (let at: At | null; (at = find((t) => t.t === 'sub' && t.k === k)); ) untab(at);
    const e = views.get(k), at = find((t) => t.t === 'chat' && t.k === k);
    views.delete(k);
    if (at) untab(at);
    if (e) e.view.stop();
    else if (alive) api('DELETE', `/api/agent?id=${encodeURIComponent(r.id!)}`, {}).catch(showErr);
    if (a) agents.all.delete(r.id!);
    r.id = null;
    if (!alive || !r.session) rows = rows.filter((x) => x !== r);
    save();
    paint();
  }
  const groupAt = (b: EventTarget | null) => groups.findIndex((g) => g.id === (b as HTMLElement).closest?.<HTMLElement>('[data-g]')?.dataset.g);
  const focusTab = (t: RTab | undefined) => (t?.t === 'chat' ? views.get(t.k!)?.view.focus() : t?.t === 'box' ? box?.view.focus() : t?.t === 'file' ? files.get(t.path!)?.focus() : null);

  let dragged = false;
  el.addEventListener('pointerdown', (e) => {
    const g = groupAt(e.target);
    if (g >= 0 && g !== focusG) {
      focusG = g;
      row.querySelectorAll('.rs-grp').forEach((x, i) => x.classList.toggle('focus', i === focusG));
    }
  }, true);
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.rs-sub') && paneClick(e, (p) => openFileTab(p, groupAt(e.target)))) return;
    const b = (e.target as HTMLElement).closest('[data-rs-new],[data-rs-end],[data-rs-tx],[data-rs-tab],[data-rs-subclear],[data-rs-subdone],[data-rs-subback],[data-rs-subfold],[data-rs-sub],[data-rs-row]') as HTMLElement;
    if (!b) return;
    const d = b.dataset;
    if (d.rsNew != null) return dragged ? undefined : newChat();
    if (d.rsEnd) return void end(d.rsEnd);
    if (d.rsTx) {
      const g = groups.find((x) => x.id === d.rsTx);
      if (g?.tabs[+d.i!]) untab({ g, i: +d.i!, t: g.tabs[+d.i!] } as At);
      save();
      return paint();
    }
    if (d.rsTab) {
      const g = groups.find((x) => x.id === d.rsTab);
      if (dragged || !g) return;
      if (e.detail > 1 && g.tabs[+d.i!]?.pv) g.tabs[+d.i!].pv = false;
      show_({ g, i: +d.i! });
      save();
      paint();
      return requestAnimationFrame(() => focusTab(g.tabs[g.on]));
    }
    const of = d.rsOf || d.rsSubdone || d.rsSubback || d.rsSubfold, r = of ? rowOf(of) : null;
    if (d.rsSubclear) return r && (setCleared(r.id as string, clearedOf(r.id as string).add(d.rsSubclear)), paintList());
    if (d.rsSubdone) return r && (setCleared(r.id as string, new Set([...clearedOf(r.id as string), ...(agents.all.get(r.id as string)?.subs || []).filter((s: any) => s.status !== 'running').map((s: any) => s.id)])), paintList());
    if (d.rsSubback) return r && (setCleared(r.id as string, []), paintList());
    if (d.rsSubfold) {
      const s = shut();
      s[s.has(d.rsSubfold) ? 'delete' : 'add'](d.rsSubfold);
      store.set('research:subs-shut', [...s]);
      return paintList();
    }
    if (d.rsSub) return openSubTab(d.rsOf!, d.rsSub, e.detail > 1);
    if (d.rsRow) return openRow(d.rsRow);
  });
  list.addEventListener('keydown', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-rs-row],[data-rs-sub]');
    if (!r || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    if (r.dataset.rsSub) openSubTab(r.dataset.rsOf!, r.dataset.rsSub, false);
    else openRow(r.dataset.rsRow!);
  });

  let quitDrag: (() => void) | null = null;
  const land = document.createElement('div');
  land.className = 'rs-land';
  row.addEventListener('pointerdown', (e) => {
    const sg = (e.target as HTMLElement).closest<HTMLElement>('.rs-sg');
    if (sg)
      return (quitDrag = dragGap(e, sg, sp, 160, () => {
        groups.forEach((g, i) => (g.size = sp.sizes[i]));
        save();
      }));
    const tb = (e.target as HTMLElement).closest<HTMLElement>('.rs-tab');
    if (!tb || e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const from = groups.find((g) => g.id === tb.dataset.rsTab)!, fi = +tb.dataset.i!, x0 = e.clientX, y0 = e.clientY;
    let ghost: HTMLElement | null = null, to: Land | null = null;
    const landAt = (ev: PointerEvent): Land | null => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY), bar = over?.closest('.rs-tabs'), grp = over?.closest('.rs-grp') as HTMLElement;
      if (!grp || !el.contains(grp)) return null;
      const g = groups.find((x) => x.id === grp.dataset.g)!, r = grp.getBoundingClientRect();
      if (bar) {
        const tabs = [...bar.querySelectorAll<HTMLElement>('.rs-tab')], i = tabs.findIndex((x) => ev.clientX < x.getBoundingClientRect().left + x.offsetWidth / 2);
        return { g, at: i < 0 ? tabs.length : i, box: bar.getBoundingClientRect() };
      }
      if (ev.clientX > r.right - r.width / 5) return { g, after: true, box: { left: r.right - r.width / 3, top: r.top, width: r.width / 3, height: r.height } };
      return { g, at: g.tabs.length, box: r };
    };
    const drag = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        ghost = tb.cloneNode(true) as HTMLElement;
        ghost.classList.add('rs-ghost');
        document.body.append(ghost);
        document.body.classList.add('dk-sorting');
      }
      ghost.style.left = `${ev.clientX + 8}px`;
      ghost.style.top = `${ev.clientY + 8}px`;
      to = landAt(ev);
      if (!to) return land.remove();
      const b = to.box;
      land.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
      document.body.append(land);
    };
    const stop = (ok: boolean) => {
      if (!ghost) return;
      ghost.remove();
      land.remove();
      document.body.classList.remove('dk-sorting');
      dragged = true;
      setTimeout(() => (dragged = false));
      if (ok && to) moveTab(from, fi, to);
    };
    quitDrag = track(e, { move: drag, end: stop, esc: () => !!ghost });
  });
  function moveTab(from: Group, fi: number, to: Land) {
    const t = from.tabs[fi];
    if (!t) return;
    if (to.after && to.g === from && from.tabs.length === 1) return;
    if (to.after && groups.length >= MAXG && from.tabs.length > 1) return tell(groupEl(groups.at(-1)!).kid, { title: `${MAXG} groups side by side at most`, line: 'Drop it on a tab bar instead, or close a group first', ms: 2500 });
    from.tabs.splice(fi, 1);
    if (from.on >= fi && from.on > 0) from.on--;
    let dest: Group;
    if (to.after) groups.splice(groups.indexOf(to.g) + 1, 0, (dest = newGroup([t])));
    else {
      const at = to.g === from && to.at! > fi ? to.at! - 1 : to.at!;
      to.g.tabs.splice(at, 0, t);
      to.g.on = at;
      dest = to.g;
    }
    if (!from.tabs.length) unGroup(from);
    focusG = groups.indexOf(dest);
    save();
    paint();
  }

  function setRail(to: string) {
    if (to === railAfter) return;
    railAfter = to;
    save();
    paint();
  }
  const railMenu = (x: number, y: number) => {
    const slot = railSlot(), item = (k: string, label: string, on: boolean, tip: string) => `<button class="mi pick chk tb-row${on ? ' on' : ''}" data-rl="${k}" title="${esc(label)}&#10;${esc(tip)}"><i class="tb-ic">${ICONS.rail}</i><span class="nm">${label}</span></button>`;
    popMenu(x, y, menuHead(ICONS.rail, 'research list') + bands({ pick: ['side', item('', 'left', slot === 0, 'Puts the list of research chats at the left of the groups.') + item('end', 'right', slot > 0 && slot === groups.length, 'Puts the list of research chats at the right of the groups.')] }), (b) => setRail(b.dataset.rl!));
    keepMenu(() => railMenu(x, y));
  };
  (el as any).railMenu = (e: MouseEvent) => railMenu(e.clientX, e.clientY);
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX, y0 = e.clientY, hr = head.getBoundingClientRect(), dx = x0 - hr.left, dy = y0 - hr.top;
    let ghost: HTMLElement | null = null, frame = 0, px = x0, py = y0, slots: number[] = [], box = hr, own = 0, at = -1, w = 0;
    const nearest = () => {
      if (px < box.left || px > box.right || py < box.top || py > box.bottom) return -1;
      let best = 0;
      slots.forEach((x, i) => Math.abs(x - px) < Math.abs(slots[best] - px) && (best = i));
      return best;
    };
    const draw = () => {
      frame = 0;
      ghost!.style.transform = `translate3d(${px - dx}px, ${py - dy}px, 0)`;
      const s = nearest();
      if (s === at) return;
      at = s;
      if (s < 0 || s === own) return land.remove();
      const left = Math.min(Math.max(slots[s] - w / 2, box.left), box.right - w);
      land.style.cssText = `left:0;top:0;width:${w}px;height:${box.height}px;transform:translate3d(${left}px, ${box.top}px, 0)`;
      if (!land.isConnected) document.body.append(land);
    };
    const move = (ev: PointerEvent) => {
      px = ev.clientX;
      py = ev.clientY;
      if (!ghost) {
        if (Math.hypot(px - x0, py - y0) < 5) return;
        box = el.getBoundingClientRect();
        w = rail.offsetWidth;
        own = railSlot();
        const ks = groups.map((g) => groupEl(g).kid.getBoundingClientRect());
        slots = [box.left, ...ks.slice(1).map((r, i) => (ks[i].right + r.left) / 2), box.right];
        ghost = head.cloneNode(true) as HTMLElement;
        ghost.classList.add('rs-ghost', 'rs-rghost');
        ghost.style.cssText = `left:0;top:0;width:${hr.width}px`;
        document.body.append(ghost);
        document.body.classList.add('dk-sorting');
        rail.classList.add('moving');
      }
      frame ||= requestAnimationFrame(draw);
    };
    const stop = (ok: boolean) => {
      if (frame) cancelAnimationFrame(frame), (frame = 0);
      if (!ghost) return;
      ghost.remove();
      land.remove();
      document.body.classList.remove('dk-sorting');
      rail.classList.remove('moving');
      dragged = true;
      setTimeout(() => (dragged = false));
      if (!ok) return;
      const s = nearest();
      if (s < 0) return tell(el, { title: 'The list moves only within Research', line: 'Drop it on the left, on the right or between two groups', ms: 2500 });
      if (s !== own) setRail(s === 0 ? '' : s === groups.length ? 'end' : groups[s - 1].id);
    };
    quitDrag = track(e, { move, end: stop, esc: () => !!ghost });
  });

  const unwatch = onAgents(sync);
  const unhead = [...HEAD_BTNS, 'deck:model', 'deck:code', 'deck:title', 'deck:doneBadge', 'marks:on'].filter((k) => PREFS[k]).map((k) => onPref(k, () => !el.hidden && paint()));
  const unpref = ['subagents:on', 'subagents:research'].map((k) => onPref(k, () => {
    if (!subsOn()) for (let at: At | null; (at = find((t) => t.t === 'sub')); ) untab(at);
    save();
    paint();
  }));
  sync();

  return {
    el,
    focus: () => focusTab(groups[focusG]?.tabs[groups[focusG].on]),
    refresh: paint,
    open(id: string) {
      const r = rows.find((x) => x.id === id);
      if (r) openRow(r.k);
    },
    attach: (rel: string) => (box ? box.view.attach(rel) : undefined),
    show(on: boolean) {
      if (on === !el.hidden) return;
      if (!on) {
        quitDrag?.();
        el.hidden = true;
        return;
      }
      el.hidden = false;
      if (stale) paint();
      stale = false;
    },
    detach() {
      quitDrag?.();
      unwatch();
      unpref.forEach((u) => u());
      unhead.forEach((u) => u());
      tick?.();
      for (const e of views.values()) e.view.detach();
      views.clear();
      for (const f of files.values()) f.stop();
      files.clear();
      for (const f of follows.values()) f.stop();
      follows.clear();
      for (const p of panes.values()) p.stop?.();
      panes.clear();
      if (box) {
        draft = box.view.draft();
        box.view.stop();
        box = boxId = null;
      }
      save();
    },
  };
}
