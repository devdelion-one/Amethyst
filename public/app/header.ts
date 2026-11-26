import { newFolder, setSideOver, showSide, sideOver } from './actions.ts';
import { togglePanel } from './pins.ts';
import { bound, show } from '../base/binds.ts';
import { toggleBottomBar } from '../base/bottombar.ts';
import { actRow, ask, barMenu, buttonMenu, chip, menuButton, extColors, gripRow, hideMenu, ICONS, keepMenu, keyChip, moveMenu, popMenu, sortable, TOPBAR, topBarMenu, topBarRows, topRow } from '../base/controls.ts';
import { renderEditorMeta } from '../editor/editor.ts';
import { floatMake, padOut, toggleInbox } from './float.ts';
import { refreshGit, cloneProject } from '../git/git.ts';
import { refreshGithub } from '../github/ghpanel.ts';
import { refreshSetup } from '../setup/setup.ts';
import { openWindow } from './groups.ts';
import { newProject } from './levels.ts';
import { web } from '../minds/minds.ts';
import { addAgent, MODES, openSettings, setMode } from './modes.ts';
import { railChanged, setPinDrag, usePins } from './slots.ts';
import { sideOf, stripMenu } from './railside.ts';
import { api, atLaunch, atWs, mode, S } from '../base/model.ts';
import { newQuickAgent, toggleQuickAgent } from '../chat/qagent.ts';
import { agentRight, pinOf } from '../base/agentmenu.ts';
import { PROG, toggleQuick } from '../terminal/qterm.ts';
import { I_WIN, showWindow, ueClick, ueMenu, ueTip, ueWinTip } from '../ue/ue.ts';
import { dirIcon, extMenu, fileIcon, fileTint, pickExt } from '../base/filelook.ts';
import { gem, NAME } from '../base/kinds.ts';
import { activeGroup, eds, newFile, newInTab, newOfType, showEditor, shows } from './tabs.ts';
import { page } from '../base/page.ts';
import { tell } from '../base/notify.ts';
import { userOf } from '../usage/usage.ts';
import { every } from '../base/life.ts';
import { chatsOn, isOff, onPref, pref, PREFS, setPref } from '../base/prefs.ts';
import { nextTheme, setTheme } from '../base/theme.ts';
import { record, undoer } from '../base/undo.ts';
import { $, agentName, AM, esc, parseSpans, quietly, showErr, spanText, store, track } from '../base/util.ts';
import { forgetAm } from '../base/windows.ts';
import { foldAll, layout, render, sidePlace, sideShown } from './views.ts';
import { sets, showSet } from '../decks/deck.ts';

const label = (el: HTMLElement, text: string) => (el.innerHTML = `${gem('timer')}${esc(text)}`);
$('#tree-fold').addEventListener('click', () => foldAll(!$('#tree-fold').dataset.unfold));
const OVER_IC = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M6.5 2.5v11"/><path d="M2.5 4h3.5v8.5h-3.5z" fill="currentColor" fill-opacity=".4" stroke="none"/></svg>';
const explorerOpts = () => {
  const follow = topRow(pref('side:follow'), `data-sidefollow title="Open or closed the same in every tab&#10;Opening or closing the explorer once does the same in every tab, layout and project. Unticked, each one keeps it open or closed on its own."`, ICONS.explorer, 'open or closed the same in every tab');
  const where = MODES[mode()]?.label || mode();
  const over = atLaunch() || atWs() ? '' : topRow(isOff('side:over', mode()), `data-sideover title="Opens over the ${esc(where)}&#10;The explorer opens on top of the ${esc(where)} and takes no space; Esc, its icon or a click outside closes it. Unticked, it is a column beside the ${esc(where)}. Each part of the app keeps its own choice."`, OVER_IC, `opens over the ${esc(where)}`);
  const hidden = S.hidden ? `Opens Settings at the files and folders this project hides from the explorer. It hides ${S.hidden.toLocaleString()}.` : 'Opens Settings at the files and folders this project hides from the explorer.';
  return { opts: follow + over, pick: ['extensions', extMenu()] as [string, string], other: extColors() + `<button class="mi" data-hidelist title="${esc(hidden)}"><i class="tb-ic">${ICONS.unlist}</i><span class="mi-n">the project's hide list</span>${chip('›')}</button>` };
};
const explorerMenu = (x: number, y: number) => {
  hideMenu(x, y, 'explorer', { place: 'explorer', remake: explorerOpts, onPick: (b) => {
    if (pickExt(b)) return;
    if ('sidefollow' in b.dataset) return setPref('side:follow', !pref('side:follow'));
    if ('sideover' in b.dataset) return setSideOver(!isOff('side:over', mode()));
    store.set('settings:tab', 'show/files');
    openSettings();
    setTimeout(() => document.querySelector('[data-hide-dir], [data-hide]')?.scrollIntoView({ block: 'center' }), 100);
  } });
};
$<HTMLElement>('#side > .bt').addEventListener('click', (e) => {
  if (!(e.currentTarget as HTMLElement).classList.contains('opts')) return;
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  explorerMenu(r.left, r.bottom);
});
$<HTMLElement>('#side').addEventListener('contextmenu', (e) => {
  if (!(e.target as HTMLElement).closest('#side > .bt, #tree-fold, #tree-focus')) return;
  e.preventDefault();
  if (S.sideView === 'git') return hideMenu(e.clientX, e.clientY, 'scm');
  if (S.sideView === 'setup') return hideMenu(e.clientX, e.clientY, 'setup');
  explorerMenu(e.clientX, e.clientY);
});

const act = (el: HTMLElement, icon: string, word: string) => {
  el.innerHTML = ICONS[icon];
  el.setAttribute('aria-label', word);
};
act($('#btn-index'), 'explorer', 'explorer');
act($('#btn-git'), 'git', 'source control');
act($('#btn-github'), 'pr', 'GitHub');
act($('#btn-setup'), 'setup', 'agent setup');
act($('#btn-site'), 'site', 'site');
act($('#btn-settings'), 'settings', 'settings');
const actTitle = (sel: string, what: string, id: string) => {
  const el = $(sel);
  el.title = what;
  el.dataset.tipKeys = `${id}:show or hide`;
  el.dataset.tipSet = `keys/more:${id}`;
};
actTitle('#btn-index', "Explorer\nThe project's files and folders.", 'explorerKey');
actTitle('#btn-git', 'Source control\nCommit, push and switch branches.', 'gitKey');
$('#btn-index').addEventListener('click', () => toggleIndex());
$('#btn-git').addEventListener('click', () => toggleGit());
$('#btn-github').addEventListener('click', () => toggleGithub());
$('#btn-setup').addEventListener('click', () => toggleSetup());
const STRIP = [['explorer', '#btn-index'], ['git', '#btn-git'], ['github', '#btn-github'], ['agent setup', '#btn-setup'], ['site', '#btn-site']];
const paintStrip = () => STRIP.forEach(([k, sel]) => ($(sel).hidden = isOff('act:off', k)));
paintStrip();
onPref('act:off', () => {
  if (isOff('act:off', 'agent setup') && S.sideView === 'setup' && sideShown()) toggleSetup(false);
  if (isOff('act:off', 'github') && S.sideView === 'github' && sideShown()) toggleGithub(false);
  paintStrip();
});
barMenu(':is(#switch, #dash > .slots) > .sv[data-g=strip]', '', { open: (el, e) => stripMenu(el, e.clientX, e.clientY) });
barMenu('#pins > .bt', '');

export const newWindowKey = () => show(bound('newWindowKey'));
act($('#btn-pins'), 'pin', 'pinned');
actTitle('#btn-pins', 'Pinned\nShows or hides the list of the files and chats you pinned.', 'pinsKey');
$('#btn-pins').addEventListener('click', togglePanel);
act($('#btn-win'), 'window', 'new window');
const winTitle = () => {
  const b = $('#btn-win');
  b.title = window.amethyst?.newAmethyst ? 'New window\nOpens another window of this Amethyst, or a new Amethyst with its own tabs, chats and account.' : 'New window\nOpens another window of the app.';
  b.dataset.tipKeys = 'newWindowKey:new window';
};
winTitle();
$('#btn-win').addEventListener('mouseover', winTitle);
let amAccts: { accounts?: ({ id: string; signedIn?: boolean; email?: string } & Record<string, any>)[]; ams?: Record<number, string> } | null = null;
const acctOf = (n: number) => {
  const c = amAccts?.accounts?.find((x) => x.id === (amAccts!.ams?.[n] || amAccts!.ams?.[1]));
  return c && { name: c.signedIn ? userOf(c) : 'not signed in', tip: `its claude account${c.email ? ': ' + c.email : ''}\n\nswitch it in usage, from that Amethyst` };
};
const fillAccts = (m: HTMLElement) => m.querySelectorAll<HTMLElement>('[data-acct]').forEach((s) => {
  const c = acctOf(+s.dataset.acct!);
  s.textContent = c?.name || '';
  s.hidden = !c;
});
async function winMenu() {
  const b = $('#btn-win').getBoundingClientRect(), key = newWindowKey(), all = (await window.amethyst!.amethysts?.()) || [];
  const card = (a: { n: number; open?: boolean }) => {
    const me = a.n === AM, st = me ? 'me' : a.open ? 'open' : 'closed';
    const inner = `<b class="am-n">Amethyst ${a.n}</b><span class="am-st ${st}">${({ me: 'this one', open: 'open', closed: 'closed' } as Record<string, string>)[st]}</span><span class="am-acct"><span class="am-chip" data-acct="${a.n}" hidden></span></span>`;
    const x = a.open || a.n === 1 ? '<span class="qk-pin"></span>' : `<button class="qk-pin" data-forget="${a.n}" title="Forget Amethyst ${a.n}\nDeletes its tabs, layouts and sets, after asking. Its chats keep running, in Amethyst 1's list." aria-label="forget Amethyst ${a.n}">×</button>`;
    return `<div class="qk-row am-card">${me ? `<div class="mi" data-me>${inner}</div>` : `<button class="mi" data-am="${a.n}">${inner}</button>`}${x}</div>`;
  };
  const plus = (attr: string, what: string, d: string, k = '') => `<button class="mi am-new" ${attr}><span class="am-plus">+</span><span class="am-t">${what}<span class="am-d">${d}</span></span>${k && `<kbd>${esc(k)}</kbd>`}</button>`;
  const html = `<div class="am-lbl"><span>Amethysts</span><span>account</span></div>${all.map(card).join('')}<div class="sep"></div>`
    + plus('data-win', 'a new window of this Amethyst', 'for a second screen: shares its tabs, sets and chats', key)
    + plus('data-new', 'a new Amethyst', 'separate: its own tabs, sets, chats and account');
  popMenu(b.right + 6, b.top, html, async (btn) => {
    const d = btn.dataset;
    if ('win' in d) return openWindow();
    if (d.am) return window.amethyst!.openAmethyst(+d.am);
    if (d.forget && (await ask({ title: `Forget Amethyst ${d.forget}?`, text: "Its tabs, layouts and sets are deleted. Its chats keep running, in Amethyst 1's list.", confirm: true }))) {
      api('PUT', '/api/agent/account', { dropAm: +d.forget }).catch(showErr);
      return forgetAm(+d.forget);
    }
    if ('new' in d) return window.amethyst!.newAmethyst();
  });
  const m = $<HTMLElement>('#colormenu');
  m.querySelector('[data-me]')?.addEventListener('click', (e) => tell(e.currentTarget as HTMLElement, { title: "You're already in this one", ms: 2500 }));
  fillAccts(m);
  const r = await quietly(api('GET', '/api/agents/usage?age=3600000'), null);
  if (!r?.claude) return;
  amAccts = r.claude;
  if (!m.hidden) fillAccts(m);
}
menuButton($('#btn-win'), () => (window.amethyst?.newAmethyst ? winMenu() : openWindow()));

export function toggleIndex(show = !(sideShown() && S.sideView === 'tree')) {
  side('tree', show);
}
export function toggleGit(show = !(sideShown() && S.sideView === 'git')) {
  side('git', show);
}
export function toggleGithub(show = !(sideShown() && S.sideView === 'github')) {
  side('github', show);
}
function toggleSetup(show = !(sideShown() && S.sideView === 'setup')) {
  side('setup', show);
}
function side(view: string, show: boolean) {
  const was = sideShown() && S.sideView;
  showSide(view, show);
  layout();
  if (show && view === 'git') refreshGit(0);
  if (show && view === 'setup') refreshSetup();
  if (show && view === 'github') refreshGithub();
  if (!show && was && !sideOver()) record('side', `closed ${({ git: 'source control', setup: 'agent setup', github: 'GitHub' } as Record<string, string>)[was] || 'the explorer'}`, { view: was, ...sidePlace() });
}
export function closeDrawer() {
  if (!sideOver() || !sideShown()) return false;
  side(S.sideView, false);
  return true;
}
document.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest?.('#app') && !t.closest('#side, #activity, #app.orch .oc-rail')) closeDrawer();
}, true);
let fromTree = false;
const away = (on: boolean) => $('#app').classList.toggle('side-away', on);
$('#tree').addEventListener('dragstart', () => (fromTree = sideOver() && sideShown()));
document.addEventListener('dragover', (e) => fromTree && !(e.target as HTMLElement).closest?.('#side') && away(true), true);
const dragDone = () => setTimeout(() => ((fromTree = false), away(false)));
document.addEventListener('dragend', dragDone, true);
document.addEventListener('drop', dragDone, true);
type SidePlace = { mode: string; place?: string };
const placeGone = (d: SidePlace) => (d.mode === 'editor' ? !eds.some((e) => e.id === d.place) : !sets(d.mode).list.some((x: { id: string }) => x.id === d.place));
const atPlace = (d: SidePlace) => !d.place || pref('side:follow') || sidePlace().place === d.place || placeGone(d);
undoer('side', {
  there: (d) => mode() === d.mode && atPlace(d),
  async go(d) {
    if (mode() !== d.mode) setMode(d.mode);
    if (atPlace(d)) return;
    if (d.mode === 'editor') return showEditor(d.place);
    showSet(d.mode, d.place);
    render();
  },
  undo: (d) => side(d.view, true),
  redo: (d) => side(d.view, false),
});

const sideW = (w: number) => {
  const px = Math.round(Math.min(Math.max(160, w), innerWidth * 0.6)) + 'px';
  for (const el of document.querySelectorAll<HTMLElement>('#side, #wsx')) el.style.setProperty('--side-w', px);
};
sideW(store.get('sideW', 240));
$<HTMLElement>('#side-grip').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const x0 = e.clientX, w0 = $('#side').offsetWidth;
  let want = w0, frame = 0;
  document.body.classList.add('resizing-x');
  track(e, {
    capture: e.currentTarget as HTMLElement,
    move(ev) {
      want = w0 + (ev.clientX - x0) * (sideOf() === 'right' ? -1 : 1);
      frame ||= requestAnimationFrame(() => ((frame = 0), sideW(want)));
    },
    end() {
      if (frame) cancelAnimationFrame(frame), sideW(want);
      document.body.classList.remove('resizing-x');
      store.set('sideW', $('#side').offsetWidth);
    },
  });
});

const deck = () => mode() !== 'editor';
const inDeck = (m: string) => addAgent(m, $('#btn-more'));
const folder = () => newFolder(deck() ? '' : undefined);
const MAKE: Record<string, any[]> = {
  folder: ['', NAME.folder, `a new ${NAME.folder} (in the selected one: a ${NAME.subfolder})`, 'folder', folder, 'folder'],
  file: ['', 'file', 'a new file: any name, any extension', 'file', () => (deck() ? floatMake('text') : newFile()), 'text'],
  md: ['', '.md file', 'a new markdown file', 'file', () => (deck() ? floatMake('text', '.md') : newFile(null, null, '.md')), 'md', 'md'],
  txt: ['', '.txt file', 'a new text file', 'file', () => (deck() ? floatMake('text', '.txt') : newFile(null, null, '.txt')), 'txt', 'txt'],
  board: ['', 'board', 'a new board to draw on', 'board', () => (deck() ? floatMake('board') : newInTab('board')), 'board'],
  scratch: ['', 'scratch', 'one plain text that is always there', 'scratch', () => padOut('scratch')],
  sketch: ['', 'sketch', 'a board to paint on and drop images onto', 'sketch', () => padOut('sketch')],
  term: ['', 'terminal', 'a terminal in the project folder', 'term', () => (deck() ? inDeck('term') : newOfType('term', activeGroup()))],
  browser: ['', 'browser', 'a website in a tab: a local server or any address', 'link', () => newOfType('browser', activeGroup())],
  project: ['', 'project', 'a folder you work in, with its own tabs, chats and terminals; added to this workspace', 'project', newProject],
  clone: ['', 'project from git', 'a copy of a repository: an address, or one of yours on GitHub', 'project', cloneProject],
};
const KINDS: Record<string, string[]> = { pj: ['folder', 'file', 'md', 'txt', 'board', 'scratch', 'sketch', 'term', 'browser'], ws: ['project', 'clone'] };
const QUICK: Record<string, string[]> = { pj: ['folder', 'file', 'md', 'txt'], ws: ['project'] };
const MENU: Record<string, string[]> = { pj: ['folder', 'file', 'md', 'txt'], ws: ['project', 'clone'] };
const at = () => (atWs() ? 'ws' : 'pj');
const OWN = ['scratch', 'sketch'];
const quickable = (a = at()) => KINDS[a].filter((k) => !OWN.includes(k));
const pinned = (a = at()): string[] => (store.get('quick', {})[a] ?? QUICK[a]).filter((k: string) => quickable(a).includes(k));
const quickOrder = (a = at()): string[] => {
  const saved = (store.get('quick:order', {})[a] ?? pinned(a)).filter((k: string) => quickable(a).includes(k));
  return [...saved, ...quickable(a).filter((k) => !saved.includes(k))];
};
const shownQuick = (a = at()) => quickOrder(a).filter((k) => pinned(a).includes(k));
function setPinned(list: string[]) {
  store.set('quick', { ...store.get('quick', {}), [at()]: list });
  paintQuick();
}
function setQuickOrder(list: string[]) {
  store.set('quick:order', { ...store.get('quick:order', {}), [at()]: list });
  setPinned(list.filter((k) => pinned().includes(k)));
}
export function basicPins(basics: boolean) {
  const all = { ...store.get('quick', {}) };
  if (basics) all.pj = [];
  else delete all.pj;
  store.set('quick', all);
  paintQuick();
}
export const togglePin = (k: string) => setPinned(pinned().includes(k) ? pinned().filter((x) => x !== k) : [...pinned(), k]);
export const quickKinds = () => quickOrder().map((k) => [k, MAKE[k][1], pinned().includes(k), MAKE[k][3]]);
const drag = (k: string) => (MAKE[k][5] ? `draggable="true" data-drag="new:${MAKE[k][5]}"` : '');
const upFirst = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
const pinSay = (k: string) => PREFS['quick:pins'].tips?.[k] || upFirst(MAKE[k][2]) + '.';
const rowTip = (k: string) => ` title="${esc(`New ${MAKE[k][1]}\n${pinSay(k)}`)}"`;
const tip = (k: string) => `New ${MAKE[k][1]}\n${pinSay(k)}`;
const tinted = (svg: string, name: string) => svg.replace('class="ol"', `class="ol" style="${fileTint(name)}"`);
const LOOK: Record<string, () => string> = { folder: () => dirIcon(false), file: () => fileIcon(), md: () => tinted(fileIcon(), 'a.md'), txt: () => tinted(fileIcon(), 'a.txt'), board: () => fileIcon(true) };
const icon = (k: string) => (LOOK[k]?.() || gem(MAKE[k][3])) + (MAKE[k][6] ? `<b class="qk-tag">${MAKE[k][6]}</b>` : '');
let qDrag: HTMLElement | null = null;
const qBtn = (k: string) => `<button data-qk="${k}" draggable="true" ${MAKE[k][5] ? `data-drag="new:${MAKE[k][5]}"` : ''} title="${esc(tip(k))}" aria-label="${esc(MAKE[k][1])}">${icon(k)}</button>`;
export const pinsHtml = (all = false) => `<span class="q-${at()}">${(all ? quickOrder() : shownQuick()).map(qBtn).join('')}</span>`;
export const pinDefault = (k: string) => QUICK[at()].includes(k);
function paintQuick() {
  railChanged();
}
usePins({
  views: () => (['pj', 'ws'] as const).flatMap((a) => quickOrder(a).map((k) => ({ kind: 'btn', ref: `pin:${k}`, html: qBtn(k), shown: a === 'pj' && !atWs() && pinned(a).includes(k), g: 'make' }))),
  groups: () => [shownQuick('pj')],
});
for (const rail of [$<HTMLElement>('#switch'), $<HTMLElement>('#dash')]) {
  rail.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-qk]');
    if (b) MAKE[b.dataset.qk!][4]();
  });
  rail.addEventListener('dragstart', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-qk]');
    if (!b) return;
    qDrag = b;
    setPinDrag(`pin:${b.dataset.qk}`);
    if (!b.dataset.drag) e.dataTransfer!.setData('text/plain', '');
    requestAnimationFrame(() => qDrag?.classList.add('ph'));
  });
}
document.addEventListener('dragend', () => {
  setPinDrag('');
  if (!qDrag) return;
  qDrag.classList.remove('ph');
  qDrag = null;
  paintQuick();
});
paintQuick();

const sb = $('#btn-scratch');
sb.innerHTML = gem('scratch');
sb.setAttribute('aria-label', 'scratch pad');
const scratchTitle = () => {
  sb.title = 'Scratch pad\nA page to write on quickly, from anywhere.';
  sb.dataset.tipKeys = 'scratch:show or hide';
};
scratchTitle();
sb.addEventListener('mouseover', scratchTitle);
sb.addEventListener('click', () => MAKE.scratch[4]());

const kb = $('#btn-sketch');
kb.innerHTML = gem('sketch');
kb.setAttribute('aria-label', 'sketch board');
const sketchTitle = () => {
  kb.title = 'Sketch board\nA board to paint on and drop images onto.';
  kb.dataset.tipKeys = 'sketch:show or hide';
};
sketchTitle();
kb.addEventListener('mouseover', sketchTitle);
kb.addEventListener('click', () => MAKE.sketch[4]());

const QT: Record<string, string[]> = { term: ['terminal', '', 'quickTerm'], pwsh: ['PowerShell', '<b class="qk-tag">ps</b>', 'quickPwsh'] };
for (const [kind, [name, tag, bind]] of Object.entries(QT)) {
  const b = $('#btn-q' + kind);
  b.innerHTML = gem('term') + tag;
  b.setAttribute('aria-label', 'quick ' + name);
  b.hidden = !PROG[kind as keyof typeof PROG];
  b.title = `Quick ${name}\nShows the project's quick ${name} from anywhere. Hidden, it keeps running.`;
  b.dataset.tipKeys = `${bind}:show or hide`;
  b.addEventListener('click', () => toggleQuick(kind));
}

const uw = $<HTMLElement>('#btn-uewin');
uw.innerHTML = I_WIN;
uw.setAttribute('aria-label', 'Unreal build window');
uw.dataset.tipKeys = 'ueWindow:show or hide';
uw.addEventListener('mouseover', () => (uw.title = ueWinTip()));
uw.addEventListener('click', () => showWindow());
uw.addEventListener('contextmenu', (e) => ueMenu(e));

const ub = $<HTMLElement>('#btn-ue');
ub.dataset.tipKeys = 'ueBuild:build';
ub.addEventListener('mouseover', () => (ub.title = ueTip()));
ub.addEventListener('click', () => ueClick());
ub.addEventListener('contextmenu', (e) => ueMenu(e));

const qa = $('#btn-qagent');
qa.innerHTML = gem('ai');
qa.setAttribute('aria-label', 'Quick Agent');
qa.addEventListener('mouseover', () => {
  const k = pinOf('quick');
  qa.title = `Quick Agent\nShows the project's Quick Agent from anywhere. Hidden, it keeps working.${chatsOn().length > 1 ? `${k ? ` A new quick chat is ${agentName(k)}.` : ''}\n\nRight-click to pick the agent a new quick chat uses.` : ''}`;
  qa.dataset.tipKeys = 'quickAgent:show or hide';
});
qa.addEventListener('click', () => toggleQuickAgent());
qa.addEventListener('contextmenu', (e: MouseEvent) => agentRight('quick', e, (k) => newQuickAgent(k), ['all rail buttons', () => topBarMenu(e.clientX, e.clientY, { tray: 'quick' })]));

const nc = $('#btn-newchat');
export const ncInner = () => gem('ai');
const ncTip = () => {
  const on = chatsOn(), k = pinOf('top');
  const one = on.length === 1 ? on[0][1] : k ? agentName(k) : '';
  nc.title = `New agent\nStarts a new chat with ${one || 'the agent you pick'}: a tab in the editor, a window in agents, a chat in orchestration.${on.length > 1 ? '\n\nRight-click to pick another agent, or to pin one.' : ''}`;
  nc.setAttribute('aria-label', one ? `a new ${one} chat` : 'a new agent chat');
};
const ncPaint = () => {
  nc.innerHTML = ncInner();
  ncTip();
};
ncPaint();
nc.addEventListener('mouseover', ncTip);
onPref('agents:off', ncPaint);
onPref('agent:pin', ncPaint);
menuButton(nc, () => addAgent());
nc.addEventListener('contextmenu', (e: MouseEvent) => agentRight('top', e, (k) => addAgent('chat', nc, k), ['all rail buttons', () => topBarMenu(e.clientX, e.clientY, { tray: 'agent' })]));

const ib = $('#btn-inbox');
ib.innerHTML = gem('inbox');
ib.setAttribute('aria-label', 'the inbox');
const inboxTitle = () => {
  ib.title = 'Inbox\nA window with every file in the inbox.';
  ib.dataset.tipKeys = 'inboxKey:show or hide';
};
inboxTitle();
ib.addEventListener('mouseover', inboxTitle);
ib.addEventListener('click', () => toggleInbox());

const BTNS: Record<string, [string, string, HTMLElement]> = { scratch: ['drafts:off', 'scratch', sb], sketch: ['drafts:off', 'sketch', kb], inbox: ['drafts:off', 'inbox', ib], term: ['qterm:off', 'term', $('#btn-qterm')], pwsh: ['qterm:off', 'pwsh', $('#btn-qpwsh')], agent: ['qterm:off', 'agent', qa], newchat: ['qterm:off', 'newchat', nc], more: ['barend:off', 'more', $('#btn-more')], pins: ['barend:off', 'pins', $('#btn-pins')], win: ['barend:off', 'win', $('#btn-win')] };
const paintBtns = () => Object.values(BTNS).forEach(([key, id, el]) => el.classList.toggle('off', isOff(key, id)));
paintBtns();
onPref('drafts:off', paintBtns);
onPref('qterm:off', paintBtns);
onPref('barend:off', paintBtns);

function newMenu(e?: Event) {
  const page = (e?.currentTarget as HTMLElement | null)?.closest<HTMLElement>('.st-newg');
  const b = (page || $<HTMLElement>('#btn-more'))!.getBoundingClientRect(), under = !page && !!$('#btn-more').closest('#dash');
  const row = (k: string) =>
    `<div class="qk-row"><button class="mi" data-mk="${k}" ${drag(k)}${rowTip(k)}><i class="qk-g">${icon(k)}</i>${esc(MAKE[k][1])}<span class="d">${esc(MAKE[k][2])}</span></button></div>`;
  popMenu(page || under ? b.left : b.right + 6, page || under ? b.bottom + 6 : b.top, MENU[at()].map(row).join(''), (btn) => btn.dataset.mk && MAKE[btn.dataset.mk][4]());
}
const mb = $('#btn-more');
mb.innerHTML = ICONS.newAny;
mb.setAttribute('aria-label', 'new');
menuButton(mb, newMenu);
$('#start [data-newpjmenu]').addEventListener('click', newMenu);
const moreTip = () => ($('#btn-more').title = `New\n${at() === 'ws' ? 'Adds a project to this workspace: a folder you work in, or a copy from git.' : 'Makes a new file or folder, in the inbox or the project folder.'}\n\nRight-click to choose its buttons.`);
$('#btn-more').addEventListener('mouseover', moreTip);
moreTip();
const quickRows = (grip = true) => {
  const on = pinned();
  const make = (k: string) => `<button class="tb-open" data-qmake="${k}" title="${esc(`Create ${MAKE[k][1]}
Makes a new one now, pinned or not.`)}">create</button>`;
  return quickOrder().map((k) => {
    const row = topRow(on.includes(k), `data-qpin="${k}"${rowTip(k)}`, icon(k), esc(MAKE[k][1]));
    return pref('barmenu:open') ? actRow(k, row, make(k), grip) : grip ? gripRow(k, row) : row;
  }).join('');
};
const pinQuick = (b: HTMLElement) => {
  if (b.dataset.qmake) return MAKE[b.dataset.qmake][4](), true;
  const k = b.dataset.qpin;
  if (!k) return false;
  if (store.get('quick:order', {})[at()] == null) store.set('quick:order', { ...store.get('quick:order', {}), [at()]: quickOrder() });
  setPinned(pinned().includes(k) ? pinned().filter((p) => p !== k) : [...pinned(), k]);
  return true;
};
topBarRows('make', { rows: (grip = true) => (grip ? `<div class="tb-ords" data-mv="qk">${quickRows()}</div>` : quickRows(false)), pick: pinQuick, move: ['qk', (keys) => setQuickOrder(keys)] });
function makeMenu(x: number, y: number) {
  const rows = quickRows();
  topBarMenu(x, y, {
    tray: 'make',
    acts: `<button class="mi" data-qreset><i class="tb-ic">${ICONS.reset}</i><span class="mi-n">reset to ${QUICK[at()].map((k) => MAKE[k][1]).join(', ').replace(/, ([^,]*)$/, ' and $1')}</span></button>`,
    buttons: `<div class="tb-ords" data-mv="qk">${rows}</div>`,
    onPick: (b) => {
      const d = b.dataset;
      if (pinQuick(b)) return;
      if ('qreset' in d) {
        store.set('quick:order', { ...store.get('quick:order', {}), [at()]: undefined });
        setPinned(QUICK[at()]);
      }
    },
  });
  keepMenu(() => makeMenu(x, y));
  moveMenu('qk', (keys) => setQuickOrder(keys));
}
barMenu('#switch > .sv[data-g=make]', '', { open: (_el, e) => makeMenu(e.clientX, e.clientY) });
for (const g of ['quick', 'agent', 'win', 'ue']) barMenu(`#switch > .sv[data-g=${g}]`, '', { open: (_el, e) => topBarMenu(e.clientX, e.clientY, { tray: g }) });

const STEPS = [5, 15, 30, 45, 60];
const timerSteps = () => [0, ...store.get('timer:steps', STEPS)];
export const stepsText = () => timerSteps().slice(1).map(spanText).join(' ');
export function setStepsText(text: string) {
  const ms = parseSpans(text);
  if (ms.length) store.set('timer:steps', ms);
  return ms.length > 0;
}
export const stepsShown = () => timerSteps().slice(1).map((m) => stepText(m * 60e3));
export const stepsChanged = () => store.get('timer:steps', STEPS).join() !== STEPS.join();
export const resetSteps = () => store.del('timer:steps');
const stepText = (ms: number) => {
  const s = Math.ceil(ms / 1e3), h = Math.floor(s / 3600), d = Math.floor(h / 24);
  const two = (n: number) => String(n).padStart(2, '0');
  return d ? `${d}d ${h % 24}h` : h ? `${h}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${Math.floor(s / 60)}:${two(s % 60)}`;
};

const tb = $('#btn-timer');
let tEnd = 0, tPick = 0, tTick: (() => void) | null = null, tGo = 0, tRing = 0, tShown = '', audio: AudioContext | null = null;
const showText = (text: string) => text !== tShown && label(tb, (tShown = text));
function showTimer() {
  const left = tEnd - Date.now();
  if (tEnd && left <= 0) return timeUp();
  showText(stepText(tEnd ? left : tPick));
  tb.classList.toggle('on', !!tEnd);
}
const ringAt = () => {
  clearTimeout(tRing);
  tRing = setTimeout(timeUp, tEnd - Date.now());
};
const stopTimer = () => {
  clearTimeout(tRing);
  tTick?.();
  tTick = null;
};
const startTimer = () => {
  tEnd = Date.now() + tPick;
  tPick = 0;
  tTick = every(250, showTimer);
  ringAt();
  showTimer();
};
function toggleTimer() {
  if (tb.classList.contains('ring')) {
    tb.classList.remove('ring');
    return showTimer();
  }
  try {
    audio ??= new AudioContext();
  } catch {}
  const steps = timerSteps().map((m) => m * 60e3);
  if (tEnd) {
    const left = Math.ceil((tEnd - Date.now()) / 1e3) * 1e3;
    tEnd = Date.now() + (steps.find((x) => x > left) ?? left);
    ringAt();
    return showTimer();
  }
  clearTimeout(tGo);
  tPick = steps[(steps.indexOf(tPick) + 1) % steps.length];
  showTimer();
  if (tPick) tGo = setTimeout(startTimer, 1500);
}
async function resetTimer() {
  if (tEnd && !(await ask({ title: 'reset the timer?', text: `it stops with ${stepText(tEnd - Date.now())} left`, confirm: true }))) return;
  clearTimeout(tGo);
  stopTimer();
  tEnd = tPick = 0;
  tb.classList.remove('ring');
  showTimer();
}
function timeUp() {
  stopTimer();
  tEnd = 0;
  tb.classList.remove('on');
  tb.classList.add('ring');
  showText(stepText(0));
  chime();
}
function chime() {
  if (!audio) return;
  audio.resume?.();
  [660, 880, 990].forEach((f, i) => {
    const at = audio!.currentTime + i * 0.22, o = audio!.createOscillator(), v = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    v.gain.setValueAtTime(0.0001, at);
    v.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    v.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    o.connect(v).connect(audio!.destination);
    o.start(at);
    o.stop(at + 0.75);
  });
}
tb.addEventListener('click', toggleTimer);
buttonMenu('#btn-timer', {
  name: 'timer',
  icon: () => gem('timer'),
  rows: () => `<button class="mi" data-bm="reset"${tEnd || tPick ? '' : ' disabled'}><i class="tb-ic">${ICONS.reset}</i><span class="mi-n">reset to 0:00</span></button>`,
  pick: () => resetTimer(),
});

const BAR = [['usage', '#st-usage'], ['timer', '#btn-timer'], ['windows', '#aw-dock'], ['update', '#st-update'], ['hitch', '#st-hitch'], ['clips', '#btn-clips'], ['keys', '#btn-keys']];
const paintBar = () => {
  BAR.forEach(([k, sel]) => $(sel).classList.toggle('off', isOff('bar:off', k)));
  document.querySelectorAll<HTMLElement>('#status > .st-usage[data-usage-id]').forEach((el) => el.classList.toggle('off', isOff('bar:off', el.dataset.dk!)));
};
paintBar();
onPref('bar:off', paintBar);

const DOCK = ['windows', 'hitch', 'sep', 'timer', 'clips', 'forget', 'sep', 'usage', 'update', 'keys', 'settings'];
const DOCK_WORDS: Record<string, string> = { hitch: 'freeze log', forget: "don't forget", windows: 'minimized windows', keys: 'keys help' };
const dockOrderWords = () => {
  const w = DOCK.filter((k) => k !== 'sep').map((k) => DOCK_WORDS[k] || k);
  return `Puts the dock back as ${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}${DOCK.includes('sep') ? ', with lines between the groups' : ''}.`;
};
function updateBySettings() {
  const kept = store.get('dock:order', null);
  if (store.get('dock:update816', false) || !kept) return;
  store.set('dock:update816', true);
  const order = kept.filter((k: string) => k !== 'update'), at = order.indexOf('settings');
  order.splice(at < 0 ? order.length : at, 0, 'update');
  store.set('dock:order', order);
}
updateBySettings();
function keysBySettings() {
  const kept = store.get('dock:order', null);
  if (store.get('dock:keys1072', false) || !kept) return;
  store.set('dock:keys1072', true);
  const order = kept.filter((k: string) => k !== 'keys'), at = order.indexOf('settings');
  order.splice(at < 0 ? order.length : at, 0, 'keys');
  store.set('dock:order', order);
}
keysBySettings();
const dock = $<HTMLElement>('#status'), tools = () => [...dock.querySelectorAll<HTMLElement>(':scope > [data-dk]')];
const keepDock = () => store.set('dock:order', tools().map((t) => t.dataset.dk));
function newSep() {
  const s = Object.assign(document.createElement('i'), { className: 'dock-sep' });
  s.dataset.dk = 'sep';
  return s;
}
function orderDock() {
  const have = tools(), seps = have.filter((t) => t.dataset.dk === 'sep'), one = new Map(have.filter((t) => t.dataset.dk !== 'sep').map((t) => [t.dataset.dk, t]));
  const want = store.get('dock:order', DOCK).filter((k: string, i: number, all: string[]) => k === 'sep' || (one.has(k) && all.indexOf(k) === i));
  for (const k of one.keys()) {
    if (want.includes(k)) continue;
    if (k!.startsWith('usage:')) {
      let at = -1;
      for (let i = 0; i < want.length; i++) if (want[i] === 'usage' || want[i].startsWith('usage:')) at = i;
      want.splice(at < 0 ? want.length : at + 1, 0, k);
    } else want.push(k);
  }
  for (const k of want) dock.append(k === 'sep' ? seps.shift() || newSep() : one.get(k)!);
  for (const t of seps) t.remove();
}
function paintSeps() {
  const all = tools(), keep = new Set<HTMLElement>();
  let seen = false, wait: HTMLElement | null = null;
  for (const t of all) {
    if (t.dataset.dk === 'sep') wait ??= seen ? t : null;
    else if (!t.hidden && !t.classList.contains('off')) {
      if (wait) keep.add(wait);
      wait = null;
      seen = true;
    }
  }
  for (const t of all) if (t.dataset.dk === 'sep' && t.classList.contains('lone') === keep.has(t)) t.classList.toggle('lone', !keep.has(t));
}
orderDock();
paintSeps();
const offIn = (c: string | null) => !!c && c.split(' ').includes('off');
const turned = (r: MutationRecord) => {
  const t = r.target as HTMLElement;
  if (r.type === 'childList') return t === dock;
  return t.parentNode === dock && t.dataset.dk !== 'sep' && (r.attributeName === 'hidden' || offIn(r.oldValue) !== t.classList.contains('off'));
};
new MutationObserver((rs) => rs.some(turned) && paintSeps())
  .observe(dock, { childList: true, attributes: true, attributeFilter: ['hidden', 'class'], attributeOldValue: true, subtree: true });
addEventListener('storage', (e) => e.key === 'mind.dock:order' && orderDock());
sortable(dock, { item: '[data-dk]:not([hidden], .off, .lone)', drop: keepDock });
const DOCK_KEY: Record<string, string> = { usage: 'bar:off:usage', timer: 'bar:off:timer', windows: 'bar:off:windows', update: 'bar:off:update', hitch: 'bar:off:hitch', clips: 'bar:off:clips', forget: 'forget:on' };
const dockSeq = () => tools().map((t) => DOCK_KEY[t.dataset.dk!]).filter(Boolean);
function moveDock(keys: string[]) {
  const dks = keys.map((k) => Object.keys(DOCK_KEY).find((d) => DOCK_KEY[d] === k)!), all = tools().map((t) => t.dataset.dk!);
  const slots = all.map((d, i) => (dks.includes(d) ? i : -1)).filter((i) => i >= 0);
  slots.forEach((at, i) => (all[at] = dks[i]));
  store.set('dock:order', all);
  orderDock();
}
dock.addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented || (e.target as HTMLElement).closest('button:not([data-dk]), nav, #ws-btn, #pw-dock, #aw-dock, input')) return;
  e.preventDefault();
  const sep = (e.target as HTMLElement).closest('[data-dk="sep"]'), x = e.clientX;
  const acts = () => {
    const moved = JSON.stringify(store.get('dock:order', DOCK)) !== JSON.stringify(DOCK);
    return `<button class="mi" data-dk-add title="Add a separator here&#10;A line between the dock's buttons, here.&#10;&#10;Drag it anywhere."><i class="tb-ic">${ICONS.sepAdd}</i><span class="mi-n">add a separator here</span></button>`
      + (sep?.isConnected ? `<button class="mi" data-dk-del><i class="tb-ic">${ICONS.x}</i><span class="mi-n">remove this separator</span></button>` : '')
      + `<button class="mi" data-dk-reset ${moved ? '' : 'disabled'} title="${esc(`Default order
${dockOrderWords()}`)}"><i class="tb-ic">${ICONS.reset}</i><span class="mi-n">default order</span></button>`
      + `<button class="mi" data-sbhide><i class="tb-ic">${ICONS.dock}</i><span class="mi-n">hide the bottom bar</span>${keyChip('bottomBarKey')}</button>`;
  };
  hideMenu(x, e.clientY, 'bar', { up: true, remake: () => ({ acts: acts(), seq: dockSeq() }), move: moveDock, onPick: (b) => {
    if ('sbhide' in b.dataset) return toggleBottomBar(true);
    if ('dkAdd' in b.dataset) {
      const at = tools().find((t) => !t.hidden && !t.matches('.off, .lone') && t.getBoundingClientRect().left + t.offsetWidth / 2 > x);
      dock.insertBefore(newSep(), at || null);
    }
    if ('dkDel' in b.dataset) sep!.remove();
    if ('dkReset' in b.dataset) return store.set('dock:order', DOCK), orderDock();
    keepDock();
  } });
});
showTimer();

const desk = window.amethyst, hb = $('#st-hitch');
if (desk?.hitchWindow) {
  const lit = (on: boolean) => (hb.classList.toggle('on', on), hb.setAttribute('aria-expanded', String(on)));
  hb.innerHTML = ICONS.bug;
  hb.title = 'Freeze log\nShows or hides a live window of what was slow, and what each click redrew and loaded.';
  hb.hidden = false;
  hb.addEventListener('click', () => desk.hitchWindow(hb.classList.contains('on') ? null : true).then(lit));
  desk.onHitchPop(lit);
  desk.hitchWindow().then(lit);
}

export function useTheme(name: string) {
  setTheme(name);
  web.refreshTheme();
  if (shows('settings')) page.renderSettings();
  if (S.open) renderEditorMeta();
  render();
}
addEventListener('storage', (e) => e.key === 'mind.theme3' && e.newValue && useTheme(e.newValue));
