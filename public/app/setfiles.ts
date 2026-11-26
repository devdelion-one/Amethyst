import { agentTag, ICONS, inboxGo, markBadge } from '../base/controls.ts';
import { noticeInner } from '../base/notify.ts';
import { keyed, pref } from '../base/prefs.ts';
import { txBar } from '../base/textbox.ts';
import { FOCUS_ICON } from '../focus/focuslook.ts';
import { scmHtml } from '../git/git.ts';
import { setupPic } from '../setup/setup.ts';
import { archiveTop } from './archlook.ts';
import { inboxPic } from './float.ts';
import { tabBarPic } from './groups.ts';
import { addPart, box, mark, pic, rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';
import { wxRow } from './wsx.ts';

export const FILES_LEAD = "The explorer, the folders it hides, the editor's tabs, source control, the inbox window and the archive. Click a switch, or the ringed part in the picture a row opens, to hide or show it. Right-clicking it in the app does the same.";

const SEL: Record<string, string> = {
  inboxShortcut: '.ib-go', focusBtn: '#tree-focus', foldAll: '#tree-fold', agentMarks: '.ag-mk', 'filestyle:on': '.fs-mk',
  'tabdirty:on': '.tab[data-dirty]', 'tbar:off:split': '.hr-split', 'tbar:off:gclose': '[data-gclose]', 'txbar:off:preview': '.tx-pv', 'txbar:off:move': '.tx-move',
  'scm:off:ai': '[data-gact="ai"]', 'scm:off:model': '.sc-mod', 'scm:off:push': '[data-gact="push"]', 'scm:off:last': '.sc-last', 'scm:off:remote': '.sc-remote', 'scm:off:check': '.hr-chk', 'scm:off:pull': '.hr-io', 'scm:off:sync': '[data-gact="sync"]', 'scm:off:pr': '.sc-pr', 'scm:off:who': '.sc-by', 'scm:off:history': '.sc-hh', 'scm:off:stashes': '.sc-sh', 'scm:off:parts': '.df-part', 'git:worktrees': '.sc-wh', 'gh:notify': '.notice',
  'inbox:off:new': '.fwi-new', 'archive:off:show': '.arc-disk',
  'setup:off:tag': '.su-sc', 'setup:off:count': '.su-n', 'setup:off:add': '.su-add', 'setup:off:clear': '.su-clear', 'setup:off:account': '.su-acct',
  'wsx:off:new': '[data-wxnew]', 'wsx:off:dir': '[data-wxdir]', 'wsx:off:fold': '[data-wxfold]', 'wsx:off:load': '[data-wxload]',
};
const sel = (a: At) => (a.key === 'explorer:guides' ? (a.place === 'wsx' ? '.hr-wxt' : '#tree') : SEL[a.id ? `${a.key}:${a.id}` : a.key] || '');

const one = (key: string, place: string): Row => ({ id: key, key, at: [{ key, place }] });
const items = (key: string, ids: string[], place: string | ((id: string) => string)): Row[] => ids.map((id) => ({ id: `${key}:${id}`, key, at: [{ key, place: typeof place === 'string' ? place : place(id), id }] }));
const guidesRow = (): Row => ({ id: 'explorer:guides', key: 'explorer:guides', tail: 'Folders still indent.', at: [{ key: 'explorer:guides', place: 'explorer' }, { key: 'explorer:guides', place: 'wsx' }] });
const exRows = (): Row[] => [one('inboxShortcut', 'explorer'), one('focusBtn', 'explorer'), one('foldAll', 'explorer'), guidesRow(), one('agentMarks', 'explorer'), one('filestyle:on', 'explorer')];
const tabRows = (): Row[] => [one('tabdirty:on', 'tabbar'), ...items('tbar:off', ['split', 'gclose'], 'tabbar'), ...items('txbar:off', ['preview', 'move'], 'txbar')];
const scmRows = (): Row[] => [...items('scm:off', ['ai', 'model', 'push', 'last', 'remote', 'check', 'pull', 'sync', 'pr', 'who', 'history', 'stashes', 'parts'], (id) => (id === 'parts' ? 'diff' : 'scm')), one('git:worktrees', 'scm'), one('gh:notify', 'ghnote')];
const ibRows = (): Row[] => items('inbox:off', ['new'], 'ibwin');
const arRows = (): Row[] => items('archive:off', ['show'], 'archive');
const suRows = (): Row[] => items('setup:off', ['tag', 'count', 'add', 'clear', 'account'], 'setup');
const wxRows = (): Row[] => items('wsx:off', ['new', 'dir', 'fold', 'load'], 'wsx');

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const guided = (place: string) => (pref('explorer:guides', place) ? ` data-guides-${place === 'wsx' ? 'wsx' : 'ex'}` : '');
const ROWS = 6;
function sideHtml() {
  const real = document.getElementById('side');
  if (!real) return '';
  const d = real.cloneNode(true) as HTMLElement;
  for (const x of d.querySelectorAll(':scope > :is(#scm, #github, #setup, #side-grip)')) x.remove();
  d.removeAttribute('style');
  d.classList.add('hr-side');
  const fold = d.querySelector<HTMLElement>('#tree-fold'), focus = d.querySelector<HTMLElement>('#tree-focus');
  if (fold && !fold.innerHTML.trim()) fold.innerHTML = ICONS.foldAll;
  if (focus && !focus.innerHTML.trim()) focus.innerHTML = FOCUS_ICON;
  const tree = d.querySelector<HTMLElement>('#tree');
  if (tree) {
    const rows = [...tree.querySelectorAll<HTMLElement>(':scope > .ti')];
    rows.slice(ROWS).forEach((r) => r.remove());
    const top = tree.querySelector('.ti.tf');
    if (top && !top.querySelector('.ib-go')) top.insertAdjacentHTML('beforeend', inboxGo());
    const files = [...tree.querySelectorAll<HTMLElement>(':scope > .ti.tt')];
    if (!tree.querySelector('.ag-mk')) files[0]?.querySelector('.nm')?.insertAdjacentHTML('afterend', agentTag('claude'));
    if (!tree.querySelector('.fs-mk')) (files[1] || files[0])?.insertAdjacentHTML('beforeend', markBadge(1));
    tree.classList.add('hr-area');
  }
  return `<div class="hr-sidewrap"${guided('explorer')}>${d.outerHTML}</div>`;
}
const wsxHtml = () => {
  const head = (document.querySelector('#wsx .wx-head')?.cloneNode(true) as HTMLElement | undefined)?.outerHTML || '';
  const rows = wxRow({ name: 'Source', dir: true }, 'Source', 0, true) + wxRow({ name: 'app', dir: true }, 'Source/app', 1, false) + wxRow({ name: 'settings.ts' }, 'Source/settings.ts', 1, false);
  return `<div class="hr-wx"${guided('wsx')}>${head}<div class="hr-wxt hr-area">${rows}</div></div>`;
};
function edHtml() {
  const f = frag(`<div class="hr-ed">${tabBarPic()}${txBar(true, true, 'docs/plan.md')}</div>`);
  f.querySelector('.tab')?.setAttribute('data-dirty', '');
  const sp = [...f.querySelectorAll('[data-split]')];
  if (sp.length) {
    const g = document.createElement('span');
    g.className = 'hr-split';
    sp[0].before(g);
    g.append(...sp);
  }
  return [...f.children].map((x) => x.outerHTML).join('');
}
const NET = `<div class="sc-head"><button class="sc-branch">${ICONS.git}<span class="nm">main</span><span class="caret">▾</span></button><button class="sc-remote">you/amethyst ▾</button><span class="grow"></span><span class="sc-pr"><b>#12</b></span></div><div class="sc-net"><span class="hr-chk"><button class="sc-chk" data-gact="fetch">⟳</button><span class="sc-when">2m</span></span><span class="grow"></span><span class="hr-io"><button class="outline sc-io">↓2</button><button class="outline sc-io">↑1</button></span><button class="outline sc-sync" data-gact="sync">sync</button></div>`;
const FILE = '<div class="sc-f"><input type="checkbox"><span class="sc-x">M</span><span class="nm">dock.ts</span><span class="dir">public/app</span><span class="sc-by">K7</span></div>';
function scmPic() {
  const f = frag(`<div id="scm" data-state="repo" class="hr-scm">${scmHtml()}</div>`);
  f.querySelector('.sc-none')?.remove();
  f.querySelector('#sc-msg')?.removeAttribute('id');
  const repo = f.querySelector('.sc-repo')!;
  repo.querySelector('.sc-net')?.remove();
  repo.querySelector('.sc-head')!.outerHTML = NET;
  repo.querySelector('.sc-files')!.innerHTML = FILE;
  for (const x of repo.querySelectorAll('.sc-split, .sc-hist, .sc-sts, .sc-wts, .sc-conn, .sc-say')) x.remove();
  for (const x of repo.querySelectorAll('.sc-last, .sc-sh, .sc-hh, .sc-wh')) x.classList.add('hr-area');
  return (f.firstElementChild as HTMLElement).outerHTML;
}
const DIFF = '<div class="hr-diff"><div class="df-row"><span class="df-n">12</span><span class="df-t del">const w = 30;</span><span class="df-n">12</span><span class="df-t add">const w = 33;</span></div><div class="df-part hr-area"><label class="df-pk"><input type="checkbox">commit this part</label><button class="df-pb">discard…</button></div></div>';
const notePic = () => `<div class="notice float hr-area">${noticeInner('<b>#12 Fix the dock</b>: checks pass')}</div>`;
const ibHtml = () => `<div class="float hr-fw hr-ib">${inboxPic()}</div>`;
const arHtml = () => `<div class="hr-arc">${archiveTop()}</div>`;
const suHtml = () => `<div id="setup" class="hr-su">${setupPic()}</div>`;

const atsIn = (list: Row[], place: string) => list.flatMap((r) => r.at).filter((a) => a.place === place);
function example(a: At) {
  const p = (html: string, ats: At[]) => pic(mark(html, ats, sel, a), a.place, ' hr-dk');
  if (a.place === 'explorer') return p(sideHtml(), atsIn(exRows(), 'explorer'));
  if (a.place === 'wsx') return p(wsxHtml(), [...atsIn(exRows(), 'wsx'), ...atsIn(wxRows(), 'wsx')]);
  if (a.place === 'tabbar' || a.place === 'txbar') return p(edHtml(), tabRows().flatMap((r) => r.at));
  if (a.place === 'scm') return p(scmPic(), atsIn(scmRows(), 'scm'));
  if (a.place === 'diff') return p(DIFF, [a]);
  if (a.place === 'ghnote') return p(notePic(), [a]);
  if (a.place === 'ibwin') return p(ibHtml(), [a]);
  if (a.place === 'archive') return p(arHtml(), [a]);
  return p(suHtml(), atsIn(suRows(), 'setup'));
}
const pickEl = (html: string, s: string) => {
  const el = s ? frag(html).querySelector<HTMLElement>(s) : null;
  if (!el) return null;
  el.hidden = false;
  el.classList.remove('off', 'hr-area');
  return el;
};
const WRAP: Record<string, string> = { wsx: 'wx-head', tabbar: 'tbar', txbar: 'tx-bar', ibwin: 'fwi-list', archive: 'arc-top', diff: 'hr-diff' };
function lookOf(r: Row) {
  const a = r.at[0];
  if (a.key === 'explorer:guides') return `<span class="hr-lkic">${ICONS.guides}</span>`;
  if (a.key === 'git:worktrees') return `<span class="hr-lkic">${ICONS.git}</span>`;
  if (a.key === 'gh:notify') return `<span class="hr-lkic">${ICONS.bell}</span>`;
  const src = a.place === 'explorer' ? sideHtml() : a.place === 'wsx' ? wsxHtml() : a.place === 'tabbar' || a.place === 'txbar' ? edHtml() : a.place === 'scm' ? scmPic() : a.place === 'diff' ? DIFF : a.place === 'ibwin' ? ibHtml() : a.place === 'archive' ? arHtml() : suHtml();
  const el = pickEl(src, sel(a));
  if (!el) return '';
  const w = a.key === 'tabdirty:on' ? 'tbar hr-lktab' : WRAP[a.place];
  const html = a.place === 'explorer' ? `<div id="side" class="hr-lkside"><div id="tree">${a.key === 'agentMarks' || a.key === 'filestyle:on' || a.key === 'inboxShortcut' ? `<div class="ti">${el.outerHTML}</div>` : ''}</div>${a.key === 'focusBtn' || a.key === 'foldAll' ? el.outerHTML : ''}</div>`
    : a.place === 'scm' ? `<div id="scm" data-state="repo" class="hr-lkscm"><div class="sc-repo">${el.outerHTML}</div></div>`
    : a.place === 'setup' ? `<div id="setup" class="hr-lksu"><div class="su-h">${el.outerHTML}</div></div>`
    : `<div class="${w}">${el.outerHTML}</div>`;
  return html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
}

addPart({ rows: () => [...exRows(), ...tabRows(), ...scmRows(), ...ibRows(), ...arRows(), ...suRows(), ...wxRows()], sel, look: lookOf, example, home: 'show/files', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function filesPartHtml(dirs: string) {
  return box('explorer', 'The explorer', rows(exRows()), keyed("Your project's folders and files, beside the editor.{explorerKey: % shows or hides it.} Open a row to see its part, ringed.")) +
    dirs +
    box('tabs', 'Editor tabs and file bars', rows(tabRows()), 'The tab bar on top of each group of tabs in the editor, and the bar under it on a file.') +
    box('scm', 'Source control', rows(scmRows()), 'The commit box and your changes, in the side panel. The git button in the activity bar opens it.') +
    box('inbox', 'Inbox window', rows(ibRows()), keyed('Every file in the inbox, in a window. The inbox button in the top bar opens it{inboxKey:, and so does %}.')) +
    box('archive', 'Archive', rows(arRows()), 'Everything you archived, to bring back. 4 opens it.') +
    box('setup', 'Agent setup', rows(suRows()), 'The skills, memory and instructions each agent uses in this project. The agent setup button in the activity bar opens it.') +
    box('wsx', 'Workspace explorer', rows(wxRows()), "The explorer of a workspace's folder, on the workspace's page. Its lines follow Lines that show how folders nest, in The explorer box.");
}
