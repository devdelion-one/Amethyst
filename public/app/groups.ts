import { filesChanged, setMark, showSide, sideOver, togglePin } from './actions.ts';
import { markMenu } from '../base/agentrow.ts';
import { everyName, everyOn } from './every.ts';
import { chatShown, createChat, lastChatId, lastNewChat, toChat, usedNew } from '../chat/chat.ts';
import { dragSection } from '../orch/orch.ts';
import { createTerm } from '../terminal/term.ts';
import { createBrowser, placeBrowsers } from '../browser/browser.ts';
import { agents, chatOfSession, onAgents } from '../base/stream.ts';
import { createText, fileCard } from '../base/textbox.ts';
import { createDiff } from '../editor/diff.ts';
import { openReview, reviewView } from '../editor/review.ts';
import { loadEdits } from '../base/edits.ts';
import { ask, bands, barMenu, chip, dragKeys, flyFocus, hideMenu, ICONS, keepMenu, keepShown, keyChip, mark, markBadge, markName, menuHead, miRow, pick, popMenu, rowIcons, setOpen, sortable } from '../base/controls.ts';
import { pickStyle, styleRows } from '../editor/filestyle.ts';
import { roving } from '../base/roving.ts';
import { keepMinds, mindOf } from '../minds/minds.ts';
import { agentPin, atWs, gemOf, inboxLoc, isImage, levelKey, mode, projectOf, rawUrl, S, toEditor, edShown } from '../base/model.ts';
import { moveAway, setOn, setsMenu, takeHere, toOrch } from '../decks/deck.ts';
import { agentHead, HEAD_SEL, headClick, paintHead, toolsSlot } from './chathead.ts';
import type { HeadCan } from './chathead.ts';
import { bound, is, show } from '../base/binds.ts';
import { crystalOf, titleOf } from '../base/agentlook.ts';
import { anchorOf, foldHead } from './fold.ts';
import { page } from '../base/page.ts';
import { tell } from '../base/notify.ts';
import { chatsOn, isOff, onPref, pref, PREFS, setPref } from '../base/prefs.ts';
import { pinOf } from '../base/agentmenu.ts';
import { col } from '../base/theme.ts';
import { undoer } from '../base/undo.ts';
import { $, AM, amElse, chatTabOf, esc, isChatTab, setSave, store } from '../base/util.ts';
import { busyNow, gem } from '../base/kinds.ts';
import { address, freeNumber, heldElsewhere, ME, POP, refusedLately, send } from '../base/windows.ts';
import { activate, activeGroup, addEditor, allEds, putAway, allTabs, browsers, busyIn, chats, closeGroup, closeTab, closeTabAsking, closing, commit, diffs, reviews, panes, goLineOf, openExternal, docTab, ED, editors, eds, fileTab, findTab, foreign, giveAway, group, groupById, groupOf, groups, keepTab, level as tabsLevel, look, mayEnd, movable, newFile, newInTab, newTabOrder, setNewTabOrder, newOfType, lastEd, orchOn, ofFile, openBrowser, openInTab, openView, pages, placeBeside, pull, put, save, shown, showEditor, split, storeTab, dropTabs, sync, tab, tabById, targetGroup, terms, textTabs, tileOn, TYPES, unfoldTo, use, W, writes } from './tabs.ts';
import { dragGap } from '../base/split.ts';
import type { Agent } from '../base/stream.ts';
import type { FileDiff, Layout, Note, OpenFile, Tab, TabGroup, TabNode, TabSplit, Tree } from '../base/types.ts';

type Box = { left: number; top: number; width: number; height: number };
type Drop = { g: TabGroup; at?: number | null; side?: string };
type Spot = Drop & { slot?: boolean; box: Box };
type Pointed = MouseEvent & { target: HTMLElement };

const ICON = {
  row: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M8 2.5v11"/></svg>',
  col: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 8h13"/></svg>',
  x: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  plus: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
  others: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h5v7h-5zM9.5 4.5h5v7h-5zM10.75 6.75l2.5 2.5M13.25 6.75l-2.5 2.5"/></svg>',
  toRight: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8h6M6 5.5 8.5 8 6 10.5M10.5 5.5l3.5 5M14 5.5l-3.5 5"/></svg>',
};
const MIN = 160;

const main = $('#main'), stash = $('#stash');
const tabDone = () => (document.documentElement.dataset.tabdone = pref('tab:done'));
tabDone();
onPref('tab:done', tabDone);
const EL: Record<string, HTMLElement> = { list: $('#list'), archive: $('#archive') };
const PARKED: Element[] = [...Object.values(EL), ED];

let drawnFor: Layout | null = null;
let built = '';
let host: string | null = null, floater: OpenFile | null = null;
let dragging: string | null = null;
const bars = new Map<string, string>();

export function level() {
  tabsLevel();
  for (const e of allEds()) if (e !== W) for (const t of allTabs(e.root)) if (isChatTab(t.type) && t.chat) chatOf(t);
}

export function place() {
  if (W !== drawnFor) {
    drawnFor = W;
    built = '';
    host = floater = null;
    bars.clear();
    if (!W) main.innerHTML = '';
  }
  if (!W) {
    stash.append(ED);
    return;
  }
  const shape = shapeOf(W.root);
  if (shape !== built) {
    stash.append(...PARKED);
    const live = new Set(allEds().flatMap((e) => allTabs(e.root).map((t) => t.id)));
    for (const id of pages.keys()) if (!live.has(id)) pages.delete(id);
    bars.clear();
    main.innerHTML = skeleton(W.root, 1);
    built = shape;
  }
  const ot = S.open?.tab && tabById(S.open.tab);
  if (ot && S.open!.path && ot.path !== S.open!.path) {
    ot.path = S.open!.path;
    save();
  }
  floatHost();
  for (const g of groups()) paint(g);
  keepMinds(new Set(allEds().flatMap((e) => allTabs(e.root)).filter((t) => t.type === 'mind').map((t) => t.id)));
  placeBrowsers();
}
const shapeOf = (n: TabNode): string => (n.g ? n.g : `${n.split}(${n.kids!.map(shapeOf).join(',')})`);
function skeleton(n: TabNode, share: number): string {
  const flex = `style="flex:${share} 1 0"`;
  if (n.g) return `<section class="grp" data-g="${n.g}" ${flex}><div class="tbar"></div><div class="gbody"></div></section>`;
  return `<div class="spl sp-${n.split}" data-s="${n.id}" ${flex}>${n.kids!.map((k, i) => (i ? `<div class="gut" data-gut="${n.id}" data-i="${i}"></div>` : '') + skeleton(k, n.sizes![i])).join('')}</div>`;
}
const floats = () => S.open && !S.open.tab;
function floatHost() {
  const who = floats() ? S.open : null;
  if (who == null) return (host = floater = null);
  if (who !== floater || !groupById(host)) {
    if (who !== floater) toEditor();
    floater = who;
    host = W!.active;
  }
}
export const tabBarPic = () => `<div class="tbar">${tabBar(activeGroup() || ({ g: '', tabs: [], on: '' } as unknown as TabGroup), true)}</div>`;
function paintBar(g: TabGroup, el: HTMLElement) {
  const bar = tabBar(g);
  if (bars.get(g.g) !== bar && !dragging) {
    const had = el.firstElementChild!.contains(document.activeElement);
    el.firstElementChild!.innerHTML = bar;
    bars.set(g.g, bar);
    if (had) el.querySelector<HTMLElement>('.tab.on')?.focus();
  }
}

let asking = '';
onAgents(({ lineOnly }) => {
  if (lineOnly) return;
  const away = groups().flatMap((g) => g.tabs).filter((t) => isChatTab(t.type) && amElse(agents.all.get(t.chat as string)));
  if (away.length) {
    for (const t of away) closeTab(t.id, false);
    commit();
  }
  for (const [id, c] of chats) if (c.frame) frameHead(tabById(id), c);
  const now = [...agents.all.values()].filter((a) => a.status === 'asks' || a.status === 'done' || busyNow(a)).map((a) => a.id + (busyNow(a) ? 'working' : a.status)).sort().join();
  if (now === asking) return;
  asking = now;
  for (const g of groups()) {
    const el = main.querySelector(`.grp[data-g="${g.g}"]`);
    if (el) paintBar(g, el);
  }
});

function paint(g: TabGroup) {
  const el = main.querySelector(`.grp[data-g="${g.g}"]`);
  if (!el) return;
  el.classList.toggle('on', g.g === W!.active);
  paintBar(g, el);
  const t = shown(g);
  const els = t ? [content(t)] : [];
  if (host === g.g && floats()) els.push(ED);
  mount(el.lastElementChild, els);
}
function content(t: Tab) {
  if (EL[t.type]) return EL[t.type];
  if (t.type === 'inbox') return page.inboxTab();
  if (t.type === 'mind') return mindOf(t.id);
  if (isChatTab(t.type)) return frameOf(t);
  if (t.type === 'term') return termOf(t).el;
  if (t.type === 'browser') return browserOf(t).el;
  if (t.type === 'text' || t.type === 'ext') return textOf(t).el;
  if (t.type === 'diff') return diffs.get(t.id)?.el || tabPage(t);
  if (t.type === 'review') return reviews.get(t.id)?.el || tabPage(t);
  if (t.type === 'pane') return panes.get(t.id)?.el || tabPage(t);
  if (TYPES[t.type].doc && S.open?.tab === t.id) return ED;
  return tabPage(t);
}
function mount(body: HTMLElement, els: Element[]) {
  for (const c of [...body.children]) if (!els.includes(c)) PARKED.includes(c) ? stash.append(c) : c.remove();
  els.forEach((e, i) => body.children[i] !== e && body.insertBefore(e, body.children[i] || null));
}

function tabBar(g: TabGroup, all = false) {
  const tabs = g.tabs
    .map((t) => {
      const { name, mark, color, tip, st, badge } = look(t);
      return `<div class="tab ${t.id === g.on ? 'on' : ''}${t.preview ? ' pv' : ''}" data-tab="${t.id}"${st ? ` data-st="${st}"` : ''}${t.abs ? ' data-tip-mono' : ''}${textTabs.get(t.id)?.dirty?.() && pref('tabdirty:on') ? ' data-dirty' : ''} role="tab" aria-selected="${t.id === g.on}" tabindex="${t.id === g.on ? 0 : -1}" draggable="true"${tip || badge ? ` title="${esc(badge ? `${tip || name}\nMark: ${markName(badge)}.` : tip)}"` : ''} style="--tc:${esc(color)}"><i class="tm">${mark}</i><span class="nm">${esc(name)}</span><button class="tx" data-tabx="${t.id}" tabindex="-1" title="Close\nCloses this tab." data-tip-keys="closeTab:close" aria-label="close">×</button>${markBadge(badge)}</div>`;
    })
    .join('');
  const split = all || !isOff('tbar:off', 'split'), gclose = all || !isOff('tbar:off', 'gclose');
  return `<div class="tabs" role="tablist">${tabs}</div><div class="tb-tools"><button class="tb-plus" data-newtype="new" title="New tab\nPick what the tab is: a file, a chat, a browser and more.">${ICON.plus}</button>${split || gclose ? '<span class="vsep"></span>' : ''}${split ? `<button data-split="row" title="Split right\nA new group of tabs on the right." data-tip-keys="split:split right">${ICON.row}</button><button data-split="col" title="Split down\nA new group of tabs below.">${ICON.col}</button>` : ''}${gclose ? `<button data-gclose="1" title="Close group\nCloses this group and every tab in it.">${ICON.x}</button>` : ''}</div>`;
}

function textOf(t: Tab) {
  let x = textTabs.get(t.id);
  const file = t.abs ?? t.path;
  if (!x || x.path !== file) {
    x?.stop();
    textTabs.set(t.id, (x = Object.assign(createText(t), { path: file })));
  }
  if (t.abs) x.moveBtn();
  else x.seen(S.thoughts.get(t.path!));
  return x;
}

async function openBeside({ session, program, title }: { session: string; program?: string; title?: string }) {
  const a = chatOfSession(session);
  if (a) {
    if (!(await takeHere(a))) return 'none';
    if (inTab(a)) return void openAgent(a);
    page.showAgent(a);
    return 'left';
  }
  let to = pref('chat:beside');
  if (!to) {
    to = await ask({ title: 'Open it in a new group or a tab?', text: 'Amethyst keeps your answer; you can change it in settings.', choices: PREFS['chat:beside'].choices!.slice(1).map(([value, label]) => ({ label: value === 'tab' ? 'tab (recommended)' : label, value })) });
    if (!to) return 'none';
    setPref('chat:beside', to);
  }
  put(to === 'group' ? placeBeside(activeGroup(), group([]), 'right') : activeGroup(), { ...tab(chatTabOf(program)), resume: session, title: title || null });
  await commit();
}

function chatOf(t: Tab) {
  let c = chats.get(t.id);
  if (c) return c;
  chats.set(
    t.id,
    (c = createChat(t, {
      saved: save,
      filesChanged,
      openFile: (path) => openInTab(path, { beside: true }),
      openDiff: (d) => openDiff(d, true),
      openBeside,
      titled: (title) => {
        t.title = title || null;
        save();
        page.render();
      },
    })),
  );
  c.frame = null;
  return c;
}
function frameOf(t: Tab) {
  const c = chatOf(t);
  if (!c.frame) {
    const f = (c.frame = document.createElement('div'));
    f.className = 'dk-cell ed-cell';
    f.innerHTML = '<header class="dk-ch"></header><div class="dk-body"></div>';
    f.lastElementChild!.append(c.el);
    f.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(HEAD_SEL);
      if (!b || !f.contains(b)) return;
      headClick(b, {
        agent: () => agents.all.get(t.chat as string),
        out: (_, sure) => closeTabAsking([t.id], sure),
        bench: () => agents.all.has(t.chat as string) && giveAway(t.id),
        orch: (at) => tabToOrch(t, at),
        set: (at) => chatToSet(t, at),
        pin: (a) => togglePin(agentPin(a, titleOf(a))),
        mark: (a, x, y) => markMenu(a, x, y, setMark),
      }, e);
    });
  }
  frameHead(t, c);
  return c.frame;
}
const toOrchHere = () => !atWs() && !orchOn();
const tabCan = (): HeadCan => ({ mark: !atWs(), pin: !atWs(), set: !atWs(), bench: atWs(), orch: toOrchHere(), where: 'tab' });
function tabToOrch(t: Tab, at?: Element | null) {
  const id = t.chat as string;
  if (!agents.all.has(id)) return tell(at || document.body, { title: 'This chat is still starting', line: 'Send it to Orchestration once it has started.', ms: 1500 });
  if (!toOrchHere()) return tell(at || document.body, { title: 'Already in Orchestration', line: "This tab is in Orchestration's own Editor.", ms: 1500 });
  return Promise.resolve(giveAway(t.id)).then(() => {
    toOrch([id]);
    page.render();
  });
}
document.addEventListener('keydown', (e) => {
  const key = is(e, 'benchKey') ? 'bench' : is(e, 'orchKey') ? 'orch' : '';
  if (!key) return;
  const cell = (document.activeElement as HTMLElement | null)?.closest?.('.ed-cell'), hit = cell && [...chats].find(([, c]) => c.frame === cell);
  if (!hit) return;
  const t = tabById(hit[0]);
  if (key === 'orch' && (!t || !toOrchHere())) return;
  e.preventDefault();
  if (e.repeat || !t) return;
  if (atWs()) giveAway(hit[0]);
  else tabToOrch(t, cell);
});
function frameHead(t: Tab | undefined, c: any) {
  if (!t) return;
  const a = agents.all.get(t.chat as string), f = c.frame, hd = f.firstElementChild;
  const h = a
    ? agentHead(a, tabCan())
    : `<i class="dk-mark">${gem('ai')}</i><b class="dk-title">new chat</b><span class="grow"></span>${toolsSlot()}${pref('deck:closeBtn') ? '<button data-dk-out aria-label="close">×</button>' : ''}`;
  if (a) f.style.setProperty('--gem-c', crystalOf(a.id).color);
  hd.toggleAttribute('data-ask', a?.status === 'asks');
  paintHead(hd, h, { bar: c.bar, menu: c.el.querySelector('.ch-menu'), home: () => c.home() });
}

function chatToSet(t: Tab, btn: HTMLElement) {
  const id = t.chat!;
  if (!agents.all.has(id)) return setSave('this chat is still starting');
  setsMenu('chat', btn, null, async (set: any, how) => {
    if (!tabById(t.id) || t.chat !== id) return;
    if (set?.orch && how.am === AM) return tabToOrch(t, btn);
    const a = agents.all.get(id);
    if (!a || (how.am !== AM && !(await moveAway(a, how.am, set, how)))) return;
    await giveAway(t.id);
    if (how.am !== AM) return;
    if (set?.ed) return openAgent(a, set.ed, how.go);
    page.sendChat('chat', id, set, how.go);
  }, editors(), agents.all.get(id), toOrchHere());
}

export function openReviewTab(chat: string) {
  if (!W || !chat) return;
  if (!edShown()) toEditor();
  const hit = findTab((t) => t.type === 'review' && t.rev === chat && reviews.has(t.id));
  if (hit) return activate(hit.g, hit.t);
  const t = { ...tab('review'), rev: chat, title: `Review · ${agents.all.get(chat)?.title || 'chat'}` };
  reviews.set(t.id, reviewView(chat, { docked: true, dock: () => (closeTab(t.id), openReview(chat)), close: () => closeTab(t.id) }));
  put(findTab((x) => x.type === 'review')?.g || targetGroup(true), t);
  return commit();
}
export async function openReviewFile(chat: string, abs: string, line = 1, from?: Element | null) {
  if (!W) return;
  await loadEdits(chat);
  if (from && !edShown()) return;
  const src = from ? grpOf(null, from) : null;
  if (!src && !edShown()) toEditor();
  await openExternal(abs, src ? { into: () => rightOf(src) } : {});
  goLineOf(abs, line);
}
function rightOf(src: TabGroup) {
  const box = (g: TabGroup) => document.querySelector(`.grp[data-g="${g.g}"]`)?.getBoundingClientRect();
  const r = box(src);
  const near = r
    ? groups()
        .flatMap((g) => {
          const c = g !== src && box(g);
          const over = c ? Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top) : 0;
          return c && c.left >= r.right - 4 && over > 0 ? [{ g, gap: c.left - r.right, over }] : [];
        })
        .sort((a, b) => a.gap - b.gap || b.over - a.over)[0]
    : null;
  return near?.g || splitRight(src);
}
function parentIn(n: TabNode, k: TabNode): TabSplit | null {
  if (n.g || !n.kids) return null;
  const s = n as TabSplit;
  return s.kids.includes(k) ? s : s.kids.reduce<TabSplit | null>((f, x) => f || parentIn(x, k), null);
}
function splitRight(src: TabGroup) {
  const p0 = parentIn(W!.root, src), i = p0 && p0.split === 'row' ? p0.kids.indexOf(src) : -1;
  const host = i >= 0 ? document.querySelector(`.spl[data-s="${p0!.id}"]`) : null;
  const els = host ? [...host.children].filter((e) => !e.classList.contains('gut')) : [];
  const gut = host?.querySelector(':scope > .gut')?.getBoundingClientRect().width || 0;
  const w = p0 && els.length === p0.kids.length ? els.map((e) => e.getBoundingClientRect().width) : null;
  const ng = placeBeside(src, group([]), 'right');
  const p = parentIn(W!.root, ng);
  if (w && w.every((x) => x > 0) && p && p.kids.length === w.length + 1) {
    const half = Math.max(1, (w[i] - gut) / 2);
    p.sizes = [...w.slice(0, i), half, half, ...w.slice(i + 1)];
  }
  return ng;
}
export function openPane(key: string, title: string, make: (close: () => void) => { el: HTMLElement; stop?: () => void }) {
  if (!W) return;
  if (!edShown()) toEditor();
  const hit = findTab((t) => t.type === 'pane' && t.pane === key && panes.has(t.id));
  if (hit) return activate(hit.g, hit.t);
  const t = { ...tab('pane'), pane: key, title };
  panes.set(t.id, make(() => closeTab(t.id)));
  put(findTab((x) => x.type === 'pane')?.g || targetGroup(true), t);
  return commit();
}

export function openDiff(d: FileDiff, beside = false) {
  if (!W) return;
  if (!edShown()) toEditor();
  const same = (x: FileDiff) => x.path === d.path && x.oldText === d.oldText && x.newText === d.newText;
  const hit = findTab((t) => t.type === 'diff' && diffs.has(t.id) && same(diffs.get(t.id).data));
  if (hit) return activate(hit.g, hit.t);
  const t = { ...tab('diff'), title: `${d.path.split(/[\\/]/).pop()} · diff` };
  diffs.set(t.id, { data: d, el: createDiff(d, { openFile: (rel) => openInTab(rel, { beside: true }) }) });
  put(findTab((x) => x.type === 'diff')?.g || targetGroup(beside), t);
  return commit();
}

const floating = (id: string | undefined) => (S.pages?.tabs || []).find((x) => x.id === id);
let titleSave = 0;
export function browserOf(t: Tab) {
  let x = browsers.get(t.id);
  if (!x)
    browsers.set(
      t.id,
      (x = createBrowser(t, {
        changed: (seen) => {
          const own = allEds().flatMap((e) => allTabs(e.root)).find((o) => o.id === t.id) || floating(t.id);
          if (!own) return;
          Object.assign(own, seen);
          const g = Object.keys(seen).every((k) => k === 'title') && groupOf(t.id), el = g && main.querySelector(`.grp[data-g="${g.g}"]`);
          if (el) {
            paintBar(g as TabGroup, el);
            clearTimeout(titleSave);
            titleSave = setTimeout(() => save(false), 500);
            return;
          }
          save(false);
          page.render();
        },
        picked: () => {
          if (floating(t.id)) return;
          const g = groupOf(t.id);
          if (!g || g.g === W?.active) return;
          use(g);
          page.render();
        },
        chats: () => projectChats().map((a) => ({ id: a.id, title: titleOf(a), code: crystalOf(a.id).code })),
        last: lastChat,
        send: (item: any, to?: string | null) => toPickedChat(t, item, to),
      })),
    );
  return x;
}
function projectChats() {
  const last = lastChatId();
  return [...agents.all.values()].filter((a) => a.kind === 'chat' && a.status !== 'ended' && a.pid === S.pid).sort((a, b) => ((b.id === last) as unknown as number) - ((a.id === last) as unknown as number) || (b.at || 0) - (a.at || 0));
}
type ChatRef = { id: string; title: string; code?: string };
const refOf = (a: Agent): ChatRef => ({ id: a.id, title: titleOf(a), code: crystalOf(a.id).code });
function lastChat(): ChatRef | null {
  const a = agents.all.get(lastChatId());
  if (a && a.pid === S.pid && a.status !== 'ended') return refOf(a);
  return lastNewChat() ? { id: lastNewChat()!, title: 'the new chat' } : null;
}
function liveChat(g: TabGroup) {
  const t = shown(g);
  if (!t || !isChatTab(t.type) || !chats.get(t.id)) return null;
  const a = t.chat ? agents.all.get(t.chat) : null;
  return !t.chat || (a && a.status !== 'ended') ? t : null;
}
function besideChat(src: TabGroup): { g: TabGroup | null; key: string; ref: ChatRef } | null {
  const all = groups(), i = all.indexOf(src), last = lastChatId(), fresh = lastNewChat();
  const far = (j: number) => (j > i ? j - i : all.length + i - j);
  const hits = all.flatMap((g, j) => {
    const t = g !== src && liveChat(g);
    return t ? [{ g, t, rank: (t.chat ? t.chat === last : t.id === fresh) ? 0 : far(j) }] : [];
  });
  const h = hits.sort((x, y) => x.rank - y.rank)[0];
  if (h) return { g: h.g, key: h.t.chat || h.t.id, ref: refOfTab(h.t) };
  const l = lastChat();
  return l && chatShown(l.id) ? { g: null, key: l.id, ref: l } : null;
}
const refOfTab = (t: Tab): ChatRef => (t.chat && agents.all.get(t.chat) ? refOf(agents.all.get(t.chat)!) : { id: t.id, title: 'the new chat' });
const grpOf = (bt: Tab | null, from?: Element | null) => (W && (groupById(from?.closest<HTMLElement>('.grp[data-g]')?.dataset.g || null) || (bt && groupOf(bt.id)))) || null;
export function chatsFor(from?: Element | null) {
  const src = grpOf(null, from), to = src ? besideChat(src)?.ref || null : lastChat();
  return { to, beside: !!src, all: projectChats().filter((a) => a.id !== to?.id).map(refOf) };
}
async function toPickedChat(bt: Tab | null, item: any, to?: string | null, from?: Element | null) {
  const want = to?.startsWith('new:') ? to.slice(4) : '';
  if (want) to = 'new';
  const src = grpOf(bt, from);
  if (to === 'beside' && !src) to = undefined;
  const near = src && (to === 'beside' || to === 'new') ? besideChat(src) : null;
  if (near && to === 'beside') {
    await toChat(near.key, item);
    return near.ref.title;
  }
  const a = to !== 'new' && to !== 'beside' && agents.all.get(to || lastChatId());
  if (a && a.pid === S.pid) {
    await toChat(a.id, item);
    const hit = findTab(tabIts(a));
    if (hit && hit.g !== (bt && groupOf(bt.id)) && hit.g.on !== hit.t.id) await activate(hit.g, hit.t);
    return titleOf(a);
  }
  const fresh = !to && lastNewChat();
  if (fresh) {
    await toChat(fresh, item);
    return 'the new chat';
  }
  const nt = tab(chatTabOf(want || pinOf('tochat') || chatsOn()[0][0]));
  await toChat(nt.id, item);
  if (src) {
    put(near?.g || placeBeside(src, group([]), 'right'), nt);
    use(src);
  } else put(activeGroup(), nt);
  await commit();
  usedNew(nt.id);
  return 'a new chat';
}
export const pickToChat = (pick: { label: string; title: string; text: string }) => toPickedChat(null, { pick });
export const refToChat = (quote: { text: string; from?: string }, to?: string | null, from?: Element | null) => toPickedChat(null, { quote }, to, from);
window.amethyst?.onBrowserOpen?.(({ url, from, behind }) => {
  const id = [...browsers].find(([, b]) => b.guest() === from)?.[0];
  if (floating(id)) page.openPage(url);
  else openBrowser(url, id, behind);
});
function termOf(t: Tab) {
  let x = terms.get(t.id);
  if (!x)
    terms.set(
      t.id,
      (x = createTerm(t.term ? { id: t.term } : { program: 'shell' }, {
        started: (id, name) => {
          t.term = id;
          t.title ||= name;
          save();
          page.render();
        },
      })),
    );
  return x;
}

const agentTab = (a: Agent) => {
  const type = a.kind === 'term' ? 'term' : chatTabOf(a.program);
  return { ...tab(type), [type === 'term' ? 'term' : 'chat']: a.id, title: a.title || (type === 'term' ? a.program : null) };
};
export async function openAgent(a: Agent, ed?: string, go = true) {
  if (!W) return;
  const t = agentTab(a);
  if (!go) return inTab(a) ? undefined : putAway(ed ?? W.id, t);
  if (ed === '') ed = lastEd();
  if (ed) await (ed === 'new' ? addEditor() : showEditor(ed));
  if (inTab(a)) return goToAgent(a);
  put(activeGroup(), t);
  return commit();
}
const tabIts = (a: Agent) => (t: Tab) => (a.kind === 'term' ? t.type === 'term' : t.type === chatTabOf(a.program)) && (t.chat === a.id || t.term === a.id);
export const heldAnywhere = (a: Agent) => inTab(a) || heldElsewhere(a.id);
export const inTab = (a: Agent) => !!(W && (findTab(tabIts(a)) || allEds().some((e) => allTabs(e.root).some(tabIts(a)))));
function goToAgent(a: Agent): unknown {
  const its = tabIts(a), hit = findTab(its);
  if (hit) return activate(hit.g, hit.t);
  const there = eds.find((e) => e !== W && allTabs(e.root).some(its));
  if (there) return showEditor(there.id).then(() => W === there && goToAgent(a));
}

let recentOf: Tree | null | undefined, recentHtml = '';
function newTabRecent() {
  if (S.data === recentOf && !atWs()) return recentHtml;
  recentOf = atWs() ? null : S.data;
  const recent = atWs() ? [] : [...S.thoughts.values()].sort((a, b) => b.touched - a.touched).slice(0, 16);
  const root = (projectOf(S.pid)?.path || '').split(/[\\/]+/).filter(Boolean);
  const day0 = new Date().setHours(0, 0, 0, 0), DAY = 864e5;
  const dayOf = (ms: number) => (ms >= day0 ? 'today' : ms >= day0 - DAY ? 'yesterday' : ms >= day0 - 6 * DAY ? 'earlier this week' : 'older');
  const hm = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const when = (ms: number, day: string) => {
    const d = new Date(ms);
    if (day === 'today' || day === 'yesterday') return hm(d);
    if (day === 'older') return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    return `${d.toLocaleDateString([], { weekday: 'short' })} ${hm(d)}`;
  };
  const row = (t: Note, day: string) => {
    const segs = [...root, ...(t.dir ? t.dir.split('/') : [])], near = segs.pop() || '', at = segs.length ? `${segs.join('\\')}\\` : '';
    const tip = t.path.includes('/') ? ` title="${esc(`${t.path}\nWhere this file is in the project.`)}" data-tip-mono` : '';
    return `<button class="nt-row" data-ntopen="${esc(t.path)}"${tip} style="--tc:${esc(col(t.color))}"><i class="gl">${gemOf(t)}</i><span class="tt">${esc(t.title)}</span><span class="pv"><bdi>${esc(at)}<span class="near">${esc(near)}</span>\\</bdi></span><span class="when">${when(t.touched, day)}</span></button>`;
  };
  const groups = new Map<string, Note[]>();
  for (const t of recent) {
    const day = dayOf(t.touched);
    groups.set(day, [...(groups.get(day) || []), t]);
  }
  const body = [...groups].map(([day, ts]) => `<div class="nt-grp"><div class="nt-gh">${day}</div>${ts.map((t) => row(t, day)).join('')}</div>`).join('');
  return (recentHtml = recent.length ? `<h3>recent</h3><div class="nt-recent">${body}</div>` : '');
}
function tabPage(t: Tab) {
  let p = pages.get(t.id);
  if (!p) pages.set(t.id, (p = { el: document.createElement('div'), sig: null, rc: '' }));
  const th = (t.path && S.thoughts.get(t.path)) as Note | undefined;
  const sig = t.type === 'new' ? `new:${atWs()}:${pref('newtab-hidden')}:${pref('agents:off')}:${newTabOrder()}` : `${t.type}:${t.path}:${th?.mtime}:${th?.title}`;
  if (p.sig !== sig && !(t.type === 'new' && p.el.querySelector('.nt-types.sorting'))) {
    p.sig = sig;
    p.rc = t.type === 'new' ? newTabRecent() : '';
    if (t.type === 'new') newTabPage(p.el);
    else readOnly(p.el, t, th);
  } else if (t.type === 'new' && p.sig === sig) {
    const rc = newTabRecent(), slot = p.el.querySelector('.nt-rc');
    if (slot && rc !== p.rc) slot.innerHTML = p.rc = rc;
  }
  return p.el;
}
function readOnly(el: HTMLElement, t: Tab, th: Note | undefined) {
  el.className = 'pview';
  if (t.type === 'scratch') return (el.innerHTML = `<p class="phint">the scratch pad · click to write in it</p>`);
  if (t.type === 'sketch') return (el.innerHTML = `<p class="phint">the sketch board · paint and images</p>`);
  if (!t.path) return (el.innerHTML = `<p class="phint">a new ${t.type} · click to write</p>`);
  if (!th) return (el.innerHTML = `<p class="phint">This file isn't here any more (moved or archived).</p>`);
  if (th.file) {
    const root = projectOf(S.pid)?.path?.replace(/[\\/]+$/, '');
    const pic = isImage(th.path) ? `<img class="pboard" src="${rawUrl(th.path, th.mtime)}" alt="" draggable="false">` : '';
    return (el.innerHTML = fileCard(root ? `${root}\\${th.path.split('/').join('\\')}` : th.path, { size: th.size, pic }));
  }
  const head = `<p class="phint">click to write here</p><h1 style="--tc:${esc(col(th.color))}"><i class="gl">${gemOf(th)}</i>${esc(th.title)}</h1>`;
  el.innerHTML = head + `<img class="pboard" src="${rawUrl(th.path, th.mtime)}" alt="" draggable="false">`;
}
const upFirst = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
function tileTip(T: { label: string; what?: string }) {
  const m = /^a new ([^:]*)(:.*)?$/.exec(T.what || '');
  const head = m ? `New ${m[1]}\nMakes a new ${m[1]} in this group${m[2] || ''}.` : T.what ? `${upFirst(T.label)}\n${upFirst(T.what)}.` : upFirst(T.label);
  return `${head}${T.what ? '\n\n' : '\n'}Right-click to choose the tiles; drag to move them.`;
}
function moreTiles(hid: string[]) {
  const agents = hid.filter((l) => / Agent$/.test(l)), parts = [...hid.filter((l) => !/ Agent$/.test(l)), ...(agents.length > 1 ? ['the other agents'] : agents)];
  return upFirst(parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}` : parts[0]);
}
function newTile(k: string) {
  const T = TYPES[k];
  return `<button class="nt-type" data-newtype="${k}" title="${esc(tileTip(T))}">${gem(T.gem)}<b>${T.label}</b>${T.key ? `<kbd>${T.key}</kbd>` : ''}</button>`;
}
const moreTile = (hid: string[]) => `<button class="nt-type nt-more" data-ntmore title="${esc(hid.length ? `More tiles\nClick to choose which tiles this group shows. Hidden now: ${moreTiles(hid)}.` : 'Choose tiles\nWhich new tab tiles this group shows.')}" aria-label="choose tiles">⋯</button>`;
export const newTabHtml = (keys: string[], more: string[] | null, recent = '') => `<div class="nt-in"><h2>new tab</h2><div class="nt-types">${keys.map(newTile).join('')}${more ? moreTile(more) : ''}</div><div class="nt-rc">${recent}</div></div>`;
function newTabPage(el: HTMLElement) {
  el.className = 'newtab';
  const can = newTabOrder().filter((k) => (!atWs() || TYPES[k].ws) && tileOn(k)), hid = can.filter((k) => isOff('newtab-hidden', k)).map((k) => TYPES[k].label);
  el.innerHTML = newTabHtml(can.filter((k) => !isOff('newtab-hidden', k)), isOff('newtab-hidden', 'more') ? null : hid, newTabRecent());
}

main.addEventListener(
  'pointerdown',
  (e: PointerEvent & { target: HTMLElement }) => {
    const el = e.target.closest<HTMLElement>('.grp');
    if (!el || e.target.closest('.gut')) return;
    const g = groupById(el.dataset.g!);
    if (!g || g.g === W!.active) return;
    use(g);
    save();
    const t = shown(g);
    if (writes(t) && S.open?.tab !== t.id) return void sync();
    for (const x of main.querySelectorAll('.grp')) x.classList.toggle('on', x.dataset.g === W!.active);
  },
  true,
);
main.addEventListener('click', async (e: Pointed) => {
  if (e.target.closest('.pview')) return sync();
  const nm = e.target.closest<HTMLElement>('[data-ntmore]');
  if (nm) {
    const r = nm.getBoundingClientRect();
    return tilesMenu(r.left, r.bottom + 4);
  }
  const b = e.target.closest<HTMLElement>('[data-tabx],[data-tab],[data-newtype],[data-split],[data-gclose],[data-ntopen]');
  const g = b && groupById(b.closest<HTMLElement>('.grp')?.dataset.g as string);
  if (!g) return;
  const d = b!.dataset;
  if (d.tabx) return closeTabAsking([d.tabx], e.shiftKey);
  if (d.gclose) return askCloseGroup(g);
  if (d.tab) {
    const t = g.tabs.find((x) => x.id === d.tab);
    return t && activate(g, t);
  }
  if (d.split) return split(g, d.split);
  if (d.ntopen) return openInTab(d.ntopen, { into: g });
  if (d.newtype) return newOfType(d.newtype, g);
});
async function askCloseGroup(g: TabGroup) {
  const n = g.tabs.length, busy = n > 1 && busyIn(g.tabs).length;
  if (n > 1 ? !(await ask({ title: 'close this group?', text: `It closes all ${n} tabs in it.${busy ? ' Some are still at work, wait for you, have answers not read yet or text not sent.' : ''}`, confirm: true })) : !(await mayEnd(g.tabs))) return;
  return closeGroup(g);
}
main.addEventListener('dblclick', (e: Pointed) => {
  const el = e.target.closest<HTMLElement>('[data-tab]');
  if (!el || e.target.closest('[data-tabx]')) return;
  keepTab(el.dataset.tab!);
  const path = tabById(el.dataset.tab!)?.path;
  if (path) POP ? send('shownq', { path, reveal: true }) : reveal(path);
});
roving(main, '.tab', { across: true, group: '.tabs', pick: true, on: { Delete: (r) => closeTabAsking([r.dataset.tab!]) } });
let tabFly = '';
function tabMenu(e: Pointed, el: HTMLElement, again = false) {
  const g = groupById(el.closest<HTMLElement>('.grp')?.dataset.g as string);
  const t = g?.tabs.find((x) => x.id === el.dataset.tab);
  if (!t) return;
  if (!again) tabFly = '';
  const i = g!.tabs.indexOf(t), styled = [{ kind: 'file', path: t.path! }];
  const item = (k: string, ic: string, label: string, tip: string, key: string | string[] = '') => miRow(`data-tm="${k}"`, ic, label, key as string, tip);
  const { mark: gemOfTab, color, name } = look(t), gap = '<div class="sep"></div>';
  const html = menuHead(gemOfTab, name, `color:${color}`) + bands({ actions:
    item('row', ICON.row, 'split right', 'Moves this tab into a new group on the right (with one tab, splits the group).', show(bound('split'))) +
    item('col', ICON.col, 'split down', 'Moves this tab into a new group below (with one tab, splits the group).') +
    (t.path ? gap + item('reveal', ICONS.explorer, 'show in the explorer', 'Shows the file in the explorer.', 'double-click') + item('copy', ICONS.copy, 'copy path', "Copies the file's full path.") : '') +
    (isChatTab(t.type) ? gap + item('tdone', ICONS.check, 'tint the tab when done', pref('tab:done') === 'tint' ? 'On: the whole tab turns green when its agent finishes, red while it asks you something. Click to tint only its icon. Also in Settings, Agents.' : 'Off: only the icon turns green or red. Click to tint the whole tab. Also in Settings, Agents.', pref('tab:done') === 'tint' ? 'on' : 'off') : '') +
    gap +
    item('close', ICON.x, 'close', 'Closes this tab.', [show(bound('closeTab')), 'del', 'middle click']) +
    (g!.tabs.length > 1 ? item('others', ICON.others, 'close the others', 'Closes every other tab in the group.') : '') +
    (i < g!.tabs.length - 1 ? item('right', ICON.toRight, 'close the ones to the right', 'Closes the tabs to the right of this one.') : '') +
    item('gclose', ICON.x, 'close this group', 'Closes the group and all its tabs (asks first if it holds several).') +
    (!t.abs && S.thoughts.has(t.path!) && pref('filestyle:on') ? gap + styleRows(styled, tabFly) : '') });
  popMenu(e.clientX, e.clientY, html, (b) => (b.dataset.tm ? tabAction(b.dataset.tm, g!, t) : b.dataset.fly ? flyTab(e, el, b.dataset.fly) : pickStyle(styled, b) && (tabMenu(e, el, true), flyFocus()?.focus())));
  keepMenu(() => tabMenu(e, el, true));
}
function flyTab(e: Pointed, el: HTMLElement, k: string) {
  tabFly = tabFly === k ? '' : k;
  tabMenu(e, el, true);
  (tabFly ? flyFocus() : document.querySelector<HTMLElement>(`#colormenu [data-fly="${k}"]`))?.focus();
}
main.addEventListener('contextmenu', (e: Pointed) => {
  const el = e.target.closest<HTMLElement>('[data-tab]');
  if (!el || !groupById(el.closest<HTMLElement>('.grp')?.dataset.g as string)?.tabs.some((x) => x.id === el.dataset.tab)) return;
  e.preventDefault();
  tabMenu(e, el);
});
sortable(main, {
  item: '.nt-type:not(.nt-more)',
  drop(all) {
    const shown = all.map((r) => r.dataset.newtype), order = newTabOrder(), slots = order.filter((k) => shown.includes(k));
    setNewTabOrder(order.map((k) => (slots.includes(k) ? shown[slots.indexOf(k)] : k)));
    page.render();
  },
});
const groupActs = () =>
  [['row', ICON.row, 'split right', keyChip('split')], ['col', ICON.col, 'split down', ''], ['gclose', ICON.x, 'close this group', '']].map(([k, ic, label, key]) => `<button class="mi" data-ga="${k}"><i class="tb-ic">${ic}</i><span class="mi-n">${label}</span>${key}</button>`).join('');
barMenu('.tbar', 'tbar', {
  order: false,
  make: (el) => {
    const g = groupById(el.closest<HTMLElement>('.grp')?.dataset.g as string);
    const only = (k: string) => mode() === 'orch' || !['orch:files', 'orch:list'].includes(k);
    if (!g) return { only };
    return { only, acts: groupActs(), onPick: (b) => { const k = b.dataset.ga; if (k === 'gclose') return askCloseGroup(g); if (k) return split(g, k); } };
  },
});
const TILE = 'newtab-hidden:';
rowIcons({ ...Object.fromEntries(Object.keys(TYPES).map((k) => [TILE + k, () => gem(TYPES[k].gem)])), [TILE + 'more']: () => '<b class="tb-tx">⋯</b>' });
function tilesOpts() {
  const keys = newTabOrder().filter((k) => (!atWs() || TYPES[k].ws) && tileOn(k));
  return {
    items: [...keys.map((k) => [k, TYPES[k].label]), ['more', 'more tiles']],
    seq: keys.map((k) => TILE + k),
    move: (moved: string[]) => {
      const shown = moved.map((k) => k.slice(TILE.length)), order = newTabOrder(), slots = order.filter((k) => shown.includes(k));
      setNewTabOrder(order.map((k) => (slots.includes(k) ? shown[slots.indexOf(k)] : k)));
      page.render();
    },
  };
}
function tilesMenu(x: number, y: number) {
  hideMenu(x, y, 'tiles', { ...tilesOpts(), remake: tilesOpts });
}
main.addEventListener('contextmenu', (e: Pointed) => {
  if (!e.target.closest('.newtab')) return;
  e.preventDefault();
  tilesMenu(e.clientX, e.clientY);
});
async function tabAction(what: string, g: TabGroup, t: Tab) {
  if (what === 'close') return closeTabAsking([t.id]);
  if (what === 'others' || what === 'right') {
    const from = what === 'right' ? g.tabs.indexOf(t) + 1 : 0, xs = g.tabs.slice(from).filter((x) => x !== t);
    if (!(await mayEnd(xs))) return;
    for (const x of xs) closeTab(x.id, false);
    g.on = t.id;
    return commit();
  }
  if (what === 'row' || what === 'col') {
    if (g.tabs.length === 1) return split(g, what);
    const ng = placeBeside(g, group([]), what === 'row' ? 'right' : 'bottom');
    pull(t);
    put(ng, t);
    return commit();
  }
  if (what === 'gclose') return askCloseGroup(g);
  if (what === 'tdone') return setPref('tab:done', pref('tab:done') === 'tint' ? 'icon' : 'tint');
  if (what === 'reveal') return reveal(t.path!);
  if (what === 'copy') copyPath(t.path!);
}
export function copyPath(path: string, rel = false) {
  const root = projectOf(S.pid)?.path?.replace(/[\\/]+$/, ''), win = !!root?.includes('\\');
  const p = win ? path.split('/').join('\\') : path;
  const text = rel || !root ? p : path ? root + (win ? '\\' : '/') + p : root;
  navigator.clipboard?.writeText(text).then(() => setSave('copied ' + text), () => setSave(text));
}
let waiting: string | null = null;
const treeShown = () => !$('#app').classList.contains('side-hidden') && S.sideView === 'tree';
export function reveal(path: string, auto = false) {
  const dir = S.dirs.has(path), ib = path === inboxLoc();
  if (dir) keepShown(path);
  unfoldTo(path);
  if (dir) setOpen(ib ? '#inbox' : path, true);
  else {
    pick(path);
    mark(null, 'clear');
  }
  if (!auto || pref(sideOver() ? 'explorer:linkOver' : 'explorer:linkDock')) showSide('tree', true);
  waiting = null;
  page.render();
  page.renderTree();
  if (!treeShown()) return void (waiting = path);
  scrollTo(path, true);
}
export function revealWaiting() {
  if (!waiting || !treeShown()) return;
  const path = waiting;
  waiting = null;
  requestAnimationFrame(() => scrollTo(path, false));
}
function scrollTo(path: string, flash: boolean) {
  const dir = S.dirs.has(path), ib = path === inboxLoc();
  const row = page.treeRow(ib ? 'i' : `${dir ? 'd' : 'f'}:${path}`);
  row?.scrollIntoView({ block: 'center' });
  if (dir && row) {
    row.tabIndex = 0;
    row.focus({ preventScroll: true });
  }
  if (!flash) return;
  row?.classList.add('flash');
  setTimeout(() => row?.classList.remove('flash'), 900);
}

main.addEventListener(
  'wheel',
  (e: WheelEvent & { target: HTMLElement }) => {
    const tabs = e.target.closest('.tabs');
    if (!tabs || tabs.scrollWidth <= tabs.clientWidth || !e.deltaY) return;
    e.preventDefault();
    tabs.scrollLeft += e.deltaY;
  },
  { passive: false },
);

main.addEventListener('auxclick', (e: Pointed) => {
  const t = e.button === 1 && e.target.closest<HTMLElement>('[data-tab]');
  if (!t) return;
  e.preventDefault();
  closeTabAsking([t.dataset.tab!]);
});

main.addEventListener('pointerdown', (e: PointerEvent & { target: HTMLElement }) => {
  if (orchOn() && e.target.closest('.tbar') && !e.target.closest('[data-tab], button, input')) return dragSection(e, 'files');
  const gut = e.target.closest<HTMLElement>('.gut');
  if (!gut) return;
  const sp = (function find(n: TabNode): TabSplit | null | undefined {
    if (n.g) return null;
    return n.id === gut.dataset.gut ? (n as TabSplit) : n.kids!.map(find).find(Boolean);
  })(W!.root);
  if (sp) dragGap(e, gut, sp, MIN, save);
  else e.preventDefault();
});

const hint = document.createElement('div');
hint.id = 'drop-hint';
hint.hidden = true;
document.body.append(hint);
const outHint = document.createElement('div');
outHint.id = 'out-hint';
outHint.innerHTML = `<div><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3"/></svg><b>Opens in a new window</b><span></span></div>`;
document.body.append(outHint);
const showOut = (over: Element | boolean | null | undefined) => {
  const on = !!over && !!dragging && movable(dragging) && !!S.pid;
  outHint.classList.toggle('on', on);
  if (!on) return;
  const r = over === true ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : over.getBoundingClientRect();
  Object.assign(outHint.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  outHint.querySelector('span')!.textContent = over === true ? 'let go outside this window' : 'let go here';
};
function spotAt(e: DragEvent, tabby = !!dragging): Spot | null {
  const el = (e.target as Element).closest?.<HTMLElement>('.grp');
  const g = el && groupById(el.dataset.g!);
  if (!g) return null;
  const bar = (e.target as Element).closest('.tbar');
  if (bar) {
    const tabs = [...bar.querySelectorAll('[data-tab]')];
    const at = tabs.findIndex((x) => {
      const r = x.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2;
    });
    const b = bar.getBoundingClientRect(), i = at < 0 ? tabs.length : at;
    const x = tabs[i] ? tabs[i].getBoundingClientRect().left : tabs.length ? tabs[tabs.length - 1].getBoundingClientRect().right : bar.querySelector('.tabs')!.getBoundingClientRect().left;
    const t = (tabs[i] || tabs.at(-1))?.getBoundingClientRect() || b;
    return { g, at: i, slot: true, box: { left: x - 1.5, top: t.top, width: 3, height: t.height } };
  }
  const b = el!.lastElementChild!.getBoundingClientRect(), r = el!.getBoundingClientRect();
  const x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
  const edge = Math.min(x, 1 - x, y, 1 - y);
  if (!tabby && edge > 0.4) return { g, at: null, box: r };
  const side = edge === x ? 'left' : edge === 1 - x ? 'right' : edge === y ? 'top' : 'bottom';
  const wide = side === 'left' || side === 'right';
  return { g, side, box: { left: r.left + (side === 'right' ? r.width / 2 : 0), top: r.top + (side === 'bottom' ? r.height / 2 : 0), width: wide ? r.width / 2 : r.width, height: wide ? r.height : r.height / 2 } };
}
const pointAt = (x: number, y: number) => {
  const target = document.elementFromPoint(x, y);
  return target && main.contains(target) ? ({ target, clientX: x, clientY: y } as unknown as DragEvent) : null;
};
const panelSpot = (x: number, y: number) => {
  const e = pointAt(x, y);
  return e && spotAt(e, false);
};
export const agentPanel = () =>
  orchOn() && main.offsetParent
    ? {
        over(x: number, y: number) {
          const s = panelSpot(x, y);
          if (!s) return (hint.hidden = true), !!pointAt(x, y);
          Object.assign(hint.style, { left: s.box.left + 'px', top: s.box.top + 'px', width: s.box.width + 'px', height: s.box.height + 'px' });
          hint.classList.toggle('slot', !!s.slot);
          hint.hidden = false;
          return true;
        },
        drop(a: Agent, x: number, y: number) {
          hint.hidden = true;
          const s = panelSpot(x, y);
          if (!s) {
            if (!pointAt(x, y)) return false;
            tell(main, { title: 'Drop it on a tab, a tab bar or a group', ms: 2500 });
            return true;
          }
          const its = tabIts(a), had = s.g.tabs.find(its);
          if (had) return activate(s.g, had), commit(), true;
          const into = s.side ? placeBeside(s.g, group([]), s.side) : groupById(s.g.g) || activeGroup();
          put(into, agentTab(a), s.slot ? s.at : null);
          commit();
          return true;
        },
        hide: () => void (hint.hidden = true),
      }
    : null;
const endDrag = () => {
  dragging = null;
  hint.hidden = true;
  showOut(false);
};
main.addEventListener('dragstart', (e: DragEvent & { target: HTMLElement; dataTransfer: DataTransfer }) => {
  const el = e.target.closest?.<HTMLElement>('[data-tab]');
  if (!el) return;
  dragging = el.dataset.tab!;
  e.dataTransfer.setData('text/plain', 'tab');
  if (movable(dragging)) {
    e.dataTransfer.setData(TAB, JSON.stringify({ from: ME, lvl: levelKey(), tab: tabById(dragging) }));
    e.dataTransfer.setData(lvlType(), '1');
    if (isChatTab(tabById(dragging)!.type)) e.dataTransfer.setData(CHATTAB, '1');
  }
  e.dataTransfer.effectAllowed = 'move';
  el.addEventListener('dragend', (ev: DragEvent) => el.isConnected || document.dispatchEvent(new DragEvent('dragend', ev)), { once: true });
});
const TAB = 'application/x-pm-tab', FILE = 'application/x-pm-file', CHATTAB = 'application/x-pm-chattab';
const fromOther = (e: DragEvent) => (dragging || S.dragging || !W ? null : e.dataTransfer!.types.includes(TAB) ? 'tab' : e.dataTransfer!.types.includes(FILE) ? 'file' : null);
const LVL = 'application/x-pm-lvl-';
const lvlType = (k = levelKey()) => LVL + [...k].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);
const elsewhere = (e: DragEvent) => e.dataTransfer!.types.some((t) => t.startsWith(LVL)) && !e.dataTransfer!.types.includes(lvlType());
export const FAR_TAB = { title: 'This tab is from another project', line: 'Open that project in this window first' };
const far = () => (everyOn() ? { title: `This window keeps ${everyName()}'s files`, line: 'Open that file in a window of its own project' } : FAR_TAB);
function refuse(over: Element) {
  hint.hidden = true;
  tell(over, far());
  send('refused');
}
const fromTree = (e: DragEvent) => {
  const src = dragging || (e.defaultPrevented && !(e.target as Element).closest?.('.cm-editor')) ? null : S.dragging;
  if ((e.target as Element).closest?.('[data-drop],[data-th]')) return null;
  if (/^(file|link):.*[^/]$/.test(src as string)) return src!.slice(5);
  return src?.startsWith('dir:') ? treeFiles(src)[0] ?? null : null;
};
const treeFiles = (src: string | null) => (/^(file|dir):/.test(src || '') ? dragKeys(src!.slice(src!.indexOf(':') + 1)).filter((p) => S.thoughts.has(p)) : []);
const newDragged = (e: DragEvent) => {
  const k = dragging ? null : S.dragging?.match(/^new:(board|text|md|txt)$/)?.[1];
  return k && !(e.target as Element).closest?.('[data-drop],[data-th],.web') ? k : null;
};
const imagesIntoText = (e: DragEvent) => !!(e.target as Element).closest?.('.takes-images') && [...e.dataTransfer!.items].every((i) => i.kind === 'file' && i.type.startsWith('image/'));
const osFiles = (e: DragEvent) => !dragging && !S.dragging && !!window.amethyst?.pathOf && !!e.dataTransfer?.types.includes('Files') && !imagesIntoText(e) && !(e.target as Element).closest?.('[data-drop]');
const droppedPaths = (e: DragEvent) => [...e.dataTransfer!.files].map((f) => window.amethyst!.pathOf(f)).filter(Boolean);
main.addEventListener('dragover', (e: DragEvent & { target: HTMLElement; dataTransfer: DataTransfer }) => {
  showOut(false);
  const other = fromOther(e), os = osFiles(e);
  if (!dragging && !other && !os && !fromTree(e) && !newDragged(e)) return void (hint.hidden = true);
  const s = spotAt(e, !!dragging || other === 'tab');
  if (!s) return void (hint.hidden = true);
  if (other === 'tab' && elsewhere(e)) return refuse(e.target.closest?.('.grp') || main);
  e.preventDefault();
  e.dataTransfer.dropEffect = os ? 'copy' : 'move';
  Object.assign(hint.style, { left: s.box.left + 'px', top: s.box.top + 'px', width: s.box.width + 'px', height: s.box.height + 'px' });
  hint.classList.toggle('slot', !!s.slot);
  hint.hidden = false;
  clearTimeout(hintGone);
  hintGone = setTimeout(() => (hint.hidden = true), 1000);
});
let hintGone: ReturnType<typeof setTimeout> | undefined;
main.addEventListener('dragleave', (e: DragEvent) => {
  if (!main.contains(e.relatedTarget as Node | null)) hint.hidden = true;
});
addEventListener('blur', () => (hint.hidden = true));
const inMain = new WeakSet<Event>();
main.addEventListener('drop', (e: DragEvent) => {
  inMain.add(e);
  const other = fromOther(e);
  if (other) {
    const s = spotAt(e, other === 'tab');
    endDrag();
    return s && takeOther(e, s);
  }
  if (osFiles(e)) {
    e.preventDefault();
    const s = spotAt(e), paths = droppedPaths(e);
    endDrag();
    if (!s) return;
    let g: TabGroup | null | undefined = null;
    const into = () => (g ||= s.side ? placeBeside(s.g, group([]), s.side) : groupById(s.g.g) || activeGroup());
    return page.openFiles(paths, { into, at: s.side ? null : s.at }, e.target as Element);
  }
  const path = fromTree(e), kind = !path && newDragged(e), many = path ? treeFiles(S.dragging) : [];
  if (!dragging && !path && !kind) return;
  e.preventDefault();
  const id = dragging, s = spotAt(e);
  endDrag();
  if (!s) return;
  if (id) return dropTab(id, s);
  const into = () => (s.side ? placeBeside(s.g, group([]), s.side) : groupById(s.g.g) || activeGroup());
  if (kind === 'text' || TYPES[kind as string]?.ext) return newFile(null, into, TYPES[kind as string]?.ext);
  if (kind) return newInTab('board', into);
  const paths = (many.length > 1 ? many : [path]).filter((p): p is string => S.thoughts.has(p as string));
  if (!paths.length) return;
  const target = s.side ? placeBeside(s.g, group([]), s.side) : s.g;
  const g = groupById(target.g) ? target : activeGroup();
  let at = s.side ? null : s.at;
  for (const p of paths) {
    const th = S.thoughts.get(p)!;
    const twin = !th.board && !th.file && docTab(p);
    const hit = !twin && docTab(p);
    const t = hit ? hit.t : twin ? tab('text', p) : fileTab(th);
    if (hit) pull(t);
    delete t.preview;
    put(g, t, at);
    if (at != null) at = g.tabs.indexOf(t) + 1;
  }
  commit();
});
document.addEventListener('dragend', (e) => {
  const id = dragging;
  endDrag();
  if (!id || !tabById(id)) return;
  if (e.dataTransfer?.dropEffect === 'move') return giveAway(id);
  const out = e.screenX < window.screenX || e.screenY < window.screenY || e.screenX > window.screenX + window.outerWidth || e.screenY > window.screenY + window.outerHeight;
  if (out && !refusedLately()) popOut(id, e.screenX, e.screenY);
});
function takeOther(e: DragEvent, s: Drop) {
  const into = () => (s.side ? placeBeside(s.g, group([]), s.side) : groupById(s.g.g) || activeGroup());
  let d;
  try {
    d = JSON.parse(e.dataTransfer!.getData(TAB) || e.dataTransfer!.getData(FILE));
  } catch {
    return;
  }
  if (d?.lvl !== levelKey()) return void tell((e.target as Element).closest?.('.grp') || main, { ...far(), ms: 2500 });
  if (d.path) {
    const paths: string[] = (d.paths?.length > 1 ? d.paths : [d.path]).filter((p: string) => S.thoughts.has(p));
    if (!paths.length) return;
    e.preventDefault();
    let g: TabGroup | null | undefined = null, at = s.side ? null : s.at;
    for (const p of paths) {
      const th = S.thoughts.get(p)!, hit = docTab(p);
      if (hit && (th.board || th.file)) {
        if (paths.length === 1) return activate(hit.g, hit.t);
        continue;
      }
      const t = hit ? tab('text', p) : fileTab(th);
      put((g ||= into())!, t, at);
      if (at != null) at = g!.tabs.indexOf(t) + 1;
    }
    return commit();
  }
  const t = foreign(d.tab);
  if (!t) return;
  e.preventDefault();
  if (TYPES[t.type].one) return openView(t.type, into());
  const hit = t.path && ofFile(t) && docTab(t.path);
  if (hit) return activate(hit.g, hit.t);
  put(into(), t, s.side ? null : s.at);
  commit();
}
const ownOut = (e: DragEvent) => dragging && movable(dragging) && S.pid && !main.contains(e.target);
const awayTab = (e: DragEvent) => fromOther(e) === 'tab' && mode() !== 'editor' && !main.contains(e.target);
const toDeck = (e: DragEvent) => awayTab(e) && mode() === 'chat' && e.dataTransfer!.types.includes(CHATTAB);
const fileOnDeck = (e: DragEvent) => mode() === 'chat' && !e.defaultPrevented && (/^(file|dir|link):/.test(S.dragging || '') || fromOther(e) === 'file') && (e.target as Element).closest?.('#decks .deck');
document.addEventListener('dragover', (e) => {
  if (osFiles(e) && !main.contains(e.target)) {
    e.preventDefault();
    return void (e.dataTransfer!.dropEffect = 'copy');
  }
  const deck = fileOnDeck(e);
  if (deck) return tell((e.target as HTMLElement).closest('.dk-cell, .dk-rail') || deck, { title: 'You cannot open files in the agents tab', line: 'Use the Editor tab for it' });
  const own = ownOut(e);
  if (!own && fromOther(e) === 'tab' && !main.contains(e.target) && elsewhere(e)) return refuse(mode() === 'editor' ? main : $('#decks'));
  if (!own && awayTab(e) && !toDeck(e)) return tell($('#decks'), { title: 'You cannot drop a tab here', line: 'Open the Editor tab first' });
  if (!own && (fromOther(e) !== 'tab' || main.contains(e.target))) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
  if (own) showOut((e.target as HTMLElement).closest?.('#side, #status, #activity') || true);
});
document.addEventListener('dragover', (e) => {
  if (!dragging || e.defaultPrevented) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
});
document.addEventListener('dragleave', (e) => {
  if (dragging && !e.relatedTarget) showOut(true);
});
document.addEventListener('drop', (e) => {
  if (inMain.has(e)) return;
  if (osFiles(e) && !main.contains(e.target)) {
    e.preventDefault();
    return page.openFiles(droppedPaths(e), undefined, e.target as Element);
  }
  if (ownOut(e)) {
    e.preventDefault();
    const id = dragging;
    endDrag();
    return popOut(id!, e.screenX, e.screenY);
  }
  if (dragging) {
    e.preventDefault();
    return endDrag();
  }
  if (fromOther(e) !== 'tab' || main.contains(e.target)) return;
  if (toDeck(e)) return chatToDeck(e);
  takeOther(e, { g: activeGroup(), at: null });
});
function chatToDeck(e: DragEvent) {
  let d;
  try {
    d = JSON.parse(e.dataTransfer!.getData(TAB));
  } catch {
    return;
  }
  if (d?.lvl !== levelKey()) return void tell($('#decks'), { ...far(), ms: 2500 });
  if (!isChatTab(d.tab?.type) || !d.tab.chat) return;
  e.preventDefault();
  page.sendChat('chat', d.tab.chat, setOn('chat'), false);
}
async function popOut(id: string, x: number, y: number) {
  if (!movable(id) || !S.pid) return;
  const n = await openWindow(x - 120, y - 20);
  if (!n || !movable(id)) return;
  storeTab(n, tabById(id)!);
  giveAway(id);
}
export async function openInWindow(t: any) {
  const th = t?.rel != null ? S.thoughts.get(t.rel) : null;
  const it = t?.kind === 'web' ? { ...tab('browser'), url: t.url } : th ? fileTab(th) : t?.kind === 'path' && !t.dir && t.abs && !t.abs.startsWith('~') ? { ...tab('ext'), abs: t.abs } : null;
  const n = it && (await openWindow());
  if (n) storeTab(n, it);
}
export async function openWindow(x?: number | null, y?: number | null, { w: width = 960, h: height = 720, pop = false, more = '' } = {}) {
  const n = await freeNumber(pop);
  if (!pop) dropTabs(n);
  const at = x == null ? '' : `left=${Math.round(x)},top=${Math.round(y!)},`;
  const w = window.open(address(n, S.wid, S.pid, pop, more), '_blank', `popup,${at}width=${Math.round(width)},height=${Math.round(height)}`);
  if (!w && !window.amethyst?.desktop) return setSave('the browser blocked the new window: allow pop-ups for this page', true), 0;
  return n;
}
undoer('window', {
  there: (d) => !d.ids.length || mode() === 'editor',
  go: () => showEditor(W!.id),
  async undo(d) {
    const ids = d.ids.filter(movable), gone = d.gone || [], n = (ids.length || gone.length) && (await openWindow());
    if (!n) return false;
    for (const t of gone) storeTab(n, t);
    for (const id of ids) {
      storeTab(n, tabById(id)!);
      giveAway(id);
    }
    d.n = n;
  },
  redo(d) {
    closing(d.n, d);
    send('close', { win: d.n });
  },
});
function dropTab(id: string, s: Spot) {
  const t = tabById(id), from = groupOf(id)!;
  if (!t) return;
  delete t.preview;
  if (s.side) {
    if (from === s.g && from.tabs.length === 1) return;
    const ng = placeBeside(s.g, group([]), s.side);
    pull(t);
    put(ng, t);
  } else if (from === s.g) {
    const i = from.tabs.indexOf(t);
    let at = s.at ?? from.tabs.length;
    if (at > i) at--;
    from.tabs.splice(i, 1);
    from.tabs.splice(at, 0, t);
    from.on = t.id;
    use(from);
  } else {
    pull(t);
    put(s.g, t, s.at);
  }
  commit();
}
