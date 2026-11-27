import { setCtx } from './actions.ts';
import { bound, comboOf, defaultOf, dropOld, firstKeys, howOf, is, oldKeys, onTwice, onWrite, resetAll, setBound, setMine, show } from '../base/binds.ts';
import { CAPTURE_NOTE, fnOf, keyText, keyWords, labelFor, pressKey, pressTwice } from '../base/keycap.ts';
import { closeEditor, flushNow, listOf } from '../editor/editor.ts';
import { closeDrawer, toggleGit, toggleIndex } from './header.ts';
import { openWindow } from './groups.ts';
import { goUp, newWorkspace, showWsEditor, stepProject, switchWorkspace } from './levels.ts';
import { api, atLaunch, atWs, edShown, fileColor, FN_DEFAULT, mode, modeFns, modeOfFn, resetModeFns, S, setModeFn } from '../base/model.ts';
import { newForget } from '../forget/forget.ts';
import { offTell, tell } from '../base/notify.ts';
import { padOut, toggleInbox } from './float.ts';
import { addAgent, agentTab, closeHere, closeSettings, NEW_BINDS, newView, openSettings, setMode } from './modes.ts';
import { palette } from './palette.ts';
import { chatOn, pref } from '../base/prefs.ts';
import { QAKEY, toggleQuickAgent } from '../chat/qagent.ts';
import { PROG, QKEYS, toggleQuick } from '../terminal/qterm.ts';
import { toggleBottomBar } from '../base/bottombar.ts';
import { toggleDash } from './topdash.ts';
import { toggleUe, UEKEY, UEWINKEY, ueKey } from '../ue/ue.ts';
import { breakpointKey, debugKey } from '../debug/debug.ts';
import { toggleEvery } from './every.ts';
import { togglePanel } from './pins.ts';
import { canCreate, openCreate } from '../ue/create.ts';
import { follow } from '../base/stream.ts';
import { activeGroup, browserInView, chats, closeActive, nextEditor, nthTab, pickFiles, reopen, shown, split, stepGroup, stepTab } from './tabs.ts';
import { col } from '../base/theme.ts';
import { redo, redoIn, undo, undoIn } from '../base/undo.ts';
import { $, CHATS, esc, inText, isChatTab, pointerNow, showErr } from '../base/util.ts';
import { clearSearch, lastWorkspace, render } from './views.ts';
import { DEFAULT, gem, NAME } from '../base/kinds.ts';
import { WIN } from '../base/windows.ts';
import { openCounterpart } from '../editor/pairopen.ts';

type Key = [string, string, (() => unknown)?, string[]?];

const openLast = () => lastWorkspace() && switchWorkspace(lastWorkspace()!.id);
function scratchOnTop() {
  const o = S.open;
  if (!o?.scratch) return false;
  if ($('#ed-body').contains(document.activeElement) || document.activeElement?.closest?.('#ed-pad')) return true;
  if (inText()) return false;
  if (o.tab) return mode() === 'editor' && shown(activeGroup())?.id === o.tab;
  return mode() === 'editor';
}
const toEditor = () => (mode() === 'editor' ? nextEditor() : setMode('editor'));
const toMode = (m: string) =>
  WIN > 1 && m !== 'editor'
    ? tell($('#activity'), { title: 'The agents and terminals are in Window 1', line: 'Press the key there', ms: 2500 })
    : m === 'editor' && mode() === 'editor' ? nextEditor() : setMode(m);
const pinsKey = () =>
  WIN > 1 ? tell($('#activity'), { title: 'The Pinned list is in Window 1', line: 'Press the key there', ms: 2500 })
  : atWs() ? tell($('#activity'), { title: 'The Pinned list is inside a project', line: 'Open a project, then press the key', ms: 2500 })
  : togglePanel();
const search = () => {
  toggleIndex(true);
  $('#search').focus();
};
function del() {
  if (S.open?.path && !S.open.scratch) $('#ed-trash').click();
}
function bk(ids: string | string[], run?: () => unknown, what?: string): Key {
  ids = [ids].flat();
  return [ids.map(keyText).filter(Boolean).join(' ') || '—', what || labelFor(ids.at(-1)!), run, ids];
}
const NEW_KEYS = { class: 'ueNewClass', module: 'ueNewModule', plugin: 'ueNewPlugin' };
export const FIXED_KEYS: [string, string, string][] = [
  ['tab', 'Move onto the explorer, the list or a tab bar', ''],
  ['↑ ↓', 'Previous or next row', ''],
  ['→ ←', 'Unfold or fold a folder, or go into it or up to its parent', 'On a tab bar the same keys show the tab before or after.'],
  ['home end', 'First or last row', ''],
  ['enter', 'Open the row', ''],
  ['f2', 'Rename the file or folder', ''],
  ['del', 'Archive the row or close the tab', 'It asks first. Tick the box there to delete it for good instead.'],
  ['shift f10', 'Open its right-click menu', ''],
];
export const ESC_KEY: [string, string, string] = ['esc', 'Go one step back', ''];
const fixedRow = ([k, what]: [string, string, string]): Key => [k, what];
const palKeys = () => [bk('files'), bk('commands')];

function sheet(): any[][] {
  const win = bk('newWindowKey', () => openWindow());
  const sett = bk('settings', () => openSettings());
  const foot = bk('bottomBarKey', () => toggleBottomBar());
  const open = bk('openFile', pickFiles);
  if (atLaunch()) return [['workspaces', [['enter', 'Go into the last one opened', openLast], bk('newWorkspace', newWorkspace), open, sett, foot, win, palKeys()[1]]]];
  const [modes, deck] = topGroups();
  if (S.wsEditor) return [modes, ['files', [open, bk('closeTab', closeActive), bk('reopen', reopen), bk('split', () => split()), bk('up', () => showWsEditor(false)), sett, win, fixedRow(ESC_KEY), palKeys()[1]]]];
  if (atWs()) return [modes, deck, ['projects', [bk('up', goUp, 'Up to all your workspaces'), open, sett, foot, win, fixedRow(ESC_KEY), palKeys()[1]]]];
  return editorGroups();
}
function topGroups(all = false): any[][] {
  const modes = ['modes', [
    bk(['fn:editor', 'modeEditor'], toEditor, atWs() ? 'Open the projects' : ''),
    ...(atWs() ? [] : [bk(['fn:orch', 'modeOrch'], () => setMode('orch'))]),
    bk(['fn:term', 'modeTerm'], () => setMode('term')),
    ...(atWs() ? [] : [bk('newLayout', () => newView('editor')), bk('newSetTerm', () => newView('term'))]),
    ...(atWs() ? [] : [bk('closeSet', closeHere)]),
    bk('projPrev'),
    bk('projNext'),
  ]];
  const deck = ['in agents and terminals', [
    bk('next'),
    bk('cellNext'),
    bk('cellPrev'),
    bk('newCell'),
    bk('benchKey'),
    bk('orchKey'),
    bk('windowKey'),
    bk('boxKey'),
    bk('modeKey'),
    bk('modelNextKey'),
    bk('modelPrevKey'),
    bk('micKey'),
    bk('railKey'),
    ...[['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['cursor', 'Cursor'], ['copilot', 'Copilot'], ['grok', 'Grok']].filter(([a]) => all || chatOn(a)).flatMap(([a]) => [1, 2, 3, 4, 5].map((n) => bk(`model.${a}.${n}`))),
    bk('quoteKey'),
    bk('noteKey'),
    bk('clearKey'),
    bk('find'),
    bk('newAgentKey'), bk('newChatN'),
  ]];
  return [modes, deck];
}
function editorGroups(all = false): any[][] {
  const win = bk('newWindowKey', () => openWindow());
  const foot = bk('bottomBarKey', () => toggleBottomBar());
  const sett = bk('settings', () => openSettings());
  const open = bk('openFile', pickFiles);
  return [
    ...topGroups(all),
    ['write', [bk('scratch', () => padOut('scratch')), bk('sketch', () => padOut('sketch')), bk('inboxKey', () => toggleInbox()), bk('newForget')]],
    ['quick terminals', [bk('quickAgent', () => toggleQuickAgent()), bk('quickTerm', () => toggleQuick('term')), ...(all || PROG.pwsh ? [bk('quickPwsh', () => toggleQuick('pwsh'))] : []), ...(all || pref('ue:on') ? [bk(UEKEY, ueKey), bk(UEWINKEY, toggleUe)] : []), ...(['class', 'module', 'plugin'] as const).filter((k) => all || canCreate(k)).map((k) => bk(NEW_KEYS[k], () => openCreate(k)))]],
    ['organize', [bk('up', goUp)]],
    ['tabs', [bk('split', () => split()), bk('closeTab', closeActive), bk('headerSwitch', openCounterpart), bk('reopen', reopen), bk('refreshBrowser', () => browserInView()?.reload()), bk('tabN'), bk('tabPrev'), bk('tabNext'), bk('grpPrev'), bk('grpNext')]],
    ['explorer, list and tabs', FIXED_KEYS.map(fixedRow)],
    ['more', [...palKeys(), open, bk('search', search), bk('explorerKey', () => toggleIndex()), bk('gitKey', () => toggleGit()), bk('pinsKey', pinsKey), foot, bk('dashKey', () => toggleDash()), sett, win, bk('winEvery', toggleEvery), bk('undo', undo), bk('redo', redo), bk('archive', del), bk('save', flushNow), bk('sheet'), fixedRow(ESC_KEY)]],
  ];
}
const kbds = (k: string) => k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('');
export function keyButton(id: string) {
  const t = keyWords(id);
  return `<button class="kb${capturing === id ? ' on' : ''}" data-bind="${id}" title="${esc(`${labelFor(id)}\n${t ? `Set to ${t}.` : 'No key is set.'} Click, then press a new key.`)}" data-tip-keys="=esc:keep it;=backspace:clear it">${capturing === id ? 'press a key…' : kbds(keyText(id) || 'none')}</button>`;
}
export const fixedKeys = (k: string) => `<span class="kb fixed" title="${esc(k.replace(/^./, (c) => c.toUpperCase()))}&#10;Always this key. It can't be changed.">${kbds(k)}</span>`;
const MOUSE = [
  ['click', `open it: in the explorer or the list a file opens in a tab, in the mind in the small panel; a project goes inside`],
  ['tabs', 'drag a tab (or a file from the explorer) onto a group to open it there, onto a group\'s edge to split; drag the gap between groups to resize; right-click a tab for more'],
  ['the bar', 'a project\'s tab: go into it (ctrl + click: in a window of its own); + by "editor": one more editor, a set of tabs of its own (its map brings it back, right-click the map to close it)'],
  ['right-click', `in the explorer: new file, board or folder right there, add to chat (ctrl + right-click), open, rename, copy its path, archive; a project: its menu (rename, remove)`],
  ['drag', 'into a container to move it, between rows to reorder, anywhere in the web to park it, onto a hub\'s inner or outer ring to put it back around that hub; ctrl + drag a folder in the web: it moves with everything below it'],
  ['file from outside', 'drag it onto the app: it opens in a tab and stays where it is'],
  ['drag new', '+ folder, + file, the "new" menu\'s and a tab bar\'s buttons: onto a folder, a hub in the mind or a group of tabs, and it is made right there'],
];
let capturing: string | null = null, note = '';
const msg = (t: string) => {
  note = t;
  $('#keys-msg').textContent = t;
  document.querySelectorAll('.set-kmsg').forEach((x) => (x.textContent = t));
};
export const keyNote = () => note;
export const capturingKey = () => capturing;
const defaultText = (id: string) => (fnOf(id) ? FN_DEFAULT[fnOf(id)] : show(defaultOf(id))) || 'none';
export const keyChanged = (id: string) => (fnOf(id) ? modeFns()[fnOf(id)] !== FN_DEFAULT[fnOf(id)] : bound(id) !== defaultOf(id));
function renderKeys() {
  const row = ([k, what, , ids]: Key) =>
    ids
      ? `<div class="ky"><span class="k">${ids.map(keyButton).join('')}</span><span>${what}</span><button class="bd-reset${ids.some(keyChanged) ? ' on' : ''}" data-bind-reset="${ids}" title="${esc(`Reset\nBack to ${ids.map(defaultText).join(' and ')}.`)}">reset</button></div>`
      : `<div class="ky"><span class="k" title="Key: ${esc(k.replace(/^./, (c) => c.toUpperCase()))}&#10;A fixed key: it can't be changed.">${kbds(k)}</span><span>${what}</span></div>`;
  const mark = (glyph: string, color: string, word: string) => `<span class="km"><i style="color:${esc(col(color))}">${glyph}</i>${word}</span>`;
  const marks = [...(['inbox', 'folder'] as const).map((k) => mark(gem(k), DEFAULT[k], NAME[k])), mark(gem('board'), DEFAULT.board, 'board'), mark(gem('file'), fileColor('.md'), 'file')];
  $('#keys-grid').innerHTML =
    sheet().map(([group, rows]) => `<section><h4>${group}</h4>${rows.map(row).join('')}</section>`).join('') +
    `<section class="wide"><h4>mouse</h4>${MOUSE.map(([k, what]) => `<div><span class="k">${k}</span><span>${what}</span></div>`).join('')}</section>` +
    `<section class="wide"><h4>marks</h4><div class="marks">${marks.join('')}</div></section>`;
}

function toggleKeys(open = $('#keys').hidden) {
  capturing = null;
  if (open) {
    msg('');
    renderKeys();
  }
  $('#keys').hidden = !open;
}
document.addEventListener('click', (e) => (e.target as HTMLElement).closest?.('[data-keys]') && toggleKeys());
document.addEventListener('click', (e) => (e.target as HTMLElement).closest?.('[data-go]') && openPalette(false));
export const resetKey = (id: string) => (fnOf(id) ? setModeFn(fnOf(id), FN_DEFAULT[fnOf(id)]) : setBound(id, defaultOf(id)));
$<HTMLElement>('#keys').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'keys' || (e.target as HTMLElement).closest('[data-keys-close]')) return toggleKeys(false);
  if (!(e.target as HTMLElement).closest('[data-keys-reset-all]')) return;
  capturing = null;
  resetAll();
  resetModeFns();
  msg('every key is back to its own');
  renderKeys();
});
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement, key = t.closest?.<HTMLElement>('[data-bind]'), back = t.closest?.<HTMLElement>('[data-bind-reset]');
  if (!key && !back && !capturing) return;
  capturing = key ? key.dataset.bind! : null;
  msg(key ? CAPTURE_NOTE : '');
  if (back) back.dataset.bindReset!.split(',').forEach(resetKey);
  redraw();
});
document.addEventListener(
  'keydown',
  (e) => {
    if (!capturing) return;
    e.stopPropagation();
    e.preventDefault();
    const r = pressKey(capturing, e);
    if (!r) return;
    msg(r.msg);
    if (!r.done) return;
    capturing = null;
    redraw();
  },
  true
);

onTwice(null, () => {
  const said = capturing && pressTwice(capturing);
  if (!said) return;
  msg(said);
  capturing = null;
  redraw();
});

function openPalette(commands: boolean) {
  toggleKeys(false);
  palette(commands || atLaunch() || atWs() ? 'commands' : 'files', sheet());
}

document.addEventListener('keydown', (e) => {
  if (!$('#modal').hidden || !$('#palette').hidden || !$('#fpick').hidden || document.getElementById('ue-new')) return;
  if ((is(e, 'files') || is(e, 'commands')) && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return openPalette(is(e, 'commands'));
  }
  if (is(e, 'openFile') && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return pickFiles();
  }
  if (is(e, 'bottomBarKey') && !e.defaultPrevented && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return e.repeat || toggleBottomBar();
  }
  if (is(e, 'dashKey') && !e.defaultPrevented && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return e.repeat || toggleDash();
  }
  if (is(e, 'pinsKey') && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return e.repeat || pinsKey();
  }
  if (is(e, 'settings') && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return openSettings(true);
  }
  if (is(e, 'winEvery') && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return toggleEvery();
  }
  if (is(e, 'newWindowKey') && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return openWindow();
  }
  if (is(e, 'newForget') && pref('forget:on') && !atLaunch() && !document.activeElement?.closest?.('.xterm')) {
    e.preventDefault();
    return newForget();
  }
  if (!$('#keys').hidden && (e.key === 'Escape' || is(e, 'sheet'))) {
    e.preventDefault();
    return toggleKeys(false);
  }
  if (S.settingsOpen && e.key === 'Escape' && !e.defaultPrevented) {
    e.preventDefault();
    return closeSettings();
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName as string) || !!(document.activeElement as HTMLElement)?.isContentEditable;
  const to = !atLaunch() && [['modeEditor', 'editor'], ['modeTerm', 'term'], ['modeOrch', 'orch']].find(([id]) => is(e, id))?.[1];
  if (to) {
    e.preventDefault();
    return toMode(to);
  }
  const nv = !atLaunch() && !atWs() && Object.entries(NEW_BINDS).find(([, id]) => is(e, id))?.[0];
  if (nv) {
    e.preventDefault();
    return newView(nv);
  }
  if (is(e, 'closeSet') && !atLaunch()) {
    e.preventDefault();
    return closeHere();
  }
  const fm = !atLaunch() && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && modeOfFn(e.key);
  if (fm) {
    e.preventDefault();
    return toMode(fm);
  }
  if (!atLaunch() && (is(e, 'projPrev') || is(e, 'projNext'))) {
    e.preventDefault();
    return stepProject(is(e, 'projPrev') ? -1 : 1);
  }
  const decked = !edShown() || (mode() === 'orch' && !$('#main').contains(document.activeElement));
  if (is(e, 'save')) {
    e.preventDefault();
    flushNow();
    return;
  }
  const ctrlY = comboOf(e) === 'ctrl+y';
  if (is(e, 'undo') || is(e, 'redo') || ctrlY) {
    const pad = scratchOnTop();
    if (pad || !inText()) {
      e.preventDefault();
      if (pad) return is(e, 'undo') ? undoIn(listOf(S.open)) : redoIn(listOf(S.open));
      return is(e, 'undo') ? undo() : redo();
    }
  }
  if (!decked && !atWs() && !inText()) {
    const t = shown(activeGroup());
    if (t && isChatTab(t.type) && chats.get(t.id)?.key(e)) {
      e.preventDefault();
      return;
    }
    if (t && isChatTab(t.type) && is(e, 'find') && chats.get(t.id)) {
      e.preventDefault();
      return chats.get(t.id).find();
    }
  }
  if ((is(e, 'explorerKey') || (is(e, 'gitKey') && !atWs())) && !atLaunch()) {
    e.preventDefault();
    return is(e, 'gitKey') ? toggleGit() : toggleIndex();
  }
  if (is(e, 'scratch') && !atWs()) {
    e.preventDefault();
    return padOut('scratch');
  }
  if (is(e, 'sketch') && !atWs()) {
    e.preventDefault();
    return padOut('sketch');
  }
  if (is(e, QAKEY) && !atWs()) {
    e.preventDefault();
    return toggleQuickAgent();
  }
  const qt = Object.keys(QKEYS).find((k) => is(e, QKEYS[k as keyof typeof QKEYS]));
  if (qt && !atWs()) {
    e.preventDefault();
    return toggleQuick(qt);
  }
  const nk = (Object.keys(NEW_KEYS) as (keyof typeof NEW_KEYS)[]).find((k) => is(e, NEW_KEYS[k]));
  if (nk && pref('ue:on') && !atWs()) {
    e.preventDefault();
    return openCreate(nk);
  }
  if (pref('ue:on') && (debugKey(e) || breakpointKey(e))) return;
  if (is(e, UEKEY) && pref('ue:on') && !atWs()) {
    e.preventDefault();
    return ueKey();
  }
  if (is(e, UEWINKEY) && pref('ue:on') && !atWs()) {
    e.preventDefault();
    return toggleUe();
  }
  if (is(e, 'inboxKey') && !atWs()) {
    e.preventDefault();
    return toggleInbox();
  }
  if (is(e, 'newAgentKey') && !atWs() && !atLaunch()) {
    e.preventDefault();
    return e.repeat ? undefined : void addAgent('chat', $('#btn-newchat'), '', pointerNow.at ?? undefined);
  }
  if (is(e, 'newChatN') && !decked && !atWs() && !atLaunch()) {
    const c = CHATS[+e.key - 1];
    if (!c) return;
    e.preventDefault();
    if (!chatOn(c[0])) return e.repeat || offTell($('#activity'), c[1]);
    if (!e.repeat) agentTab(c[0]);
    return;
  }
  if (is(e, 'split') && !decked) {
    e.preventDefault();
    return split();
  }
  if (is(e, 'closeTab') && !decked) {
    e.preventDefault();
    return closeActive();
  }
  if (is(e, 'headerSwitch') && !atWs()) {
    e.preventDefault();
    return openCounterpart();
  }
  if (is(e, 'reopen')) {
    e.preventDefault();
    return reopen();
  }
  if (is(e, 'refreshBrowser') && !decked && !(e.target as HTMLElement).closest?.('.term') && browserInView()) {
    e.preventDefault();
    return browserInView().reload();
  }
  if (is(e, 'tabN')) {
    if (decked) return;
    e.preventDefault();
    return nthTab(+e.key);
  }
  const tabKey = ['tabPrev', 'tabNext', 'grpPrev', 'grpNext'].find((id) => is(e, id));
  if (tabKey && !decked) {
    e.preventDefault();
    const d = tabKey.endsWith('Prev') ? -1 : 1;
    return tabKey.startsWith('grp') ? stepGroup(d) : stepTab(d);
  }
  if (e.key === 'Escape') {
    if (document.activeElement?.closest?.('.xterm')) return;
    if (!typing && $('#colormenu').hidden && closeDrawer()) return;
    if (typing) (document.activeElement as HTMLElement).blur();
    else if (S.open && !S.open.tab) closeEditor();
    else if (S.query) {
      clearSearch();
      render();
    } else {
      setCtx('');
      render();
    }
    return;
  }
  const modded = e.ctrlKey || e.metaKey || e.altKey;
  if (typing && !modded) return;
  const plain: Record<string, () => unknown> = { archive: del, sheet: () => toggleKeys() };
  const rows = sheet().flatMap(([, r]) => r);
  for (const [, , run, ids] of rows) if (run && ids?.length === 1 && howOf(ids[0]) === 'plain') plain[ids[0]] = run;
  const hit = (!typing || modded) && Object.keys(plain).find((id) => is(e, id));
  if (hit) {
    e.preventDefault();
    return plain[hit]();
  }
  if (typing || modded) return;
  const onControl = !!(document.activeElement as HTMLElement | null)?.matches?.('button, a[href], [tabindex]:not([tabindex="-1"])');
  const enter = e.key === 'Enter' && !e.defaultPrevented && !onControl && rows.find(([k, , run]) => k === 'enter' && run);
  if (enter) {
    e.preventDefault();
    enter[2]();
  }
});

const redraw = () => {
  if (!$('#keys').hidden) renderKeys();
  document.dispatchEvent(new Event('keys-changed'));
};
const loadKeys = () => api('GET', '/api/keys').then((got) => got.broken || setMine(got.keys));
onWrite((keys) => {
  api('PUT', '/api/keys', { keys }).catch(showErr);
  redraw();
});
const old = firstKeys?.exists === false ? oldKeys() : {};
if (Object.keys(old).length) {
  setMine(old);
  api('PUT', '/api/keys', { keys: old }).then(dropOld, showErr);
}
const again = () => loadKeys().then(redraw, () => {});
if (firstKeys) follow({ path: firstKeys.path }, again, { again });
