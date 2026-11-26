import { newFolder, removeAsked, renameDir, renameFile, togglePin } from './actions.ts';
import { ask, bands, chip, dragKeys, fileManager, flyFocus, ICONS, keepMenu, menuHead, popMenu } from '../base/controls.ts';
import { pickStyle, styleRows } from '../editor/filestyle.ts';
import { pref } from '../base/prefs.ts';
import { bound, show } from '../base/binds.ts';
import { api, gemOf, inboxLoc, isPinned, edShown, mode, pageUrl, S } from '../base/model.ts';
import { attachToChat } from './modes.ts';
import { sortOf } from '../base/files.ts';
import { copyPath } from './groups.ts';
import { newFile, newInTab } from './tabs.ts';
import { $, esc, showErr } from '../base/util.ts';
import { floatMake } from './float.ts';
import { gem, NAME } from '../base/kinds.ts';
import { col } from '../base/theme.ts';
import { hereOf, openFile } from './open.ts';
import { createRows } from '../ue/create.ts';
import { fileBlame, fileHistory } from '../git/git.ts';
import type { Where } from './open.ts';
import type { Pin } from '../base/types.ts';
import { focusItem } from '../focus/focusmenu.ts';

interface Target {
  kind: string;
  path: string;
  dir: string;
  name: string;
}
interface Item {
  label: string;
  icon: string;
  svg?: string;
  run: (x: Target, e: MouseEvent) => unknown;
  key?: string;
  tip?: string;
  def?: boolean;
  pageOnly?: boolean;
}
type Row = Item | '-' | 'as' | 'style';

const file = (x: Target) => x.kind === 'file';
const folder = (x: Target) => x.kind === 'folder';
const isPage = (x: Target) => file(x) && !!pageUrl(x.path) && sortOf(x.path) === 'page';
const pinOf = (x: Target): Pin => ({ kind: 'file', path: x.path });
const styled = (x: Target) => dragKeys(x.path).flatMap((k) => (S.thoughts.has(k) ? [{ kind: 'file', path: k }] : S.dirs.get(k)?.kind === 'folder' && S.dirs.get(k) !== S.inbox ? [{ kind: 'dir', path: k }] : []));

const UE_KEY: Record<string, string> = { ueClass: 'ueNewClass', ueModule: 'ueNewModule', uePlugin: 'ueNewPlugin' };
const PLACES: Record<string, [string, string, string]> = {
  tab: ['open in a tab', 'tab', 'a tab in the editor, next to your other tabs'],
  editor: ['open in the editor', 'editor', 'a tab in the editor: it takes you there'],
  quick: ['open in the Quick Window', 'quick', "each file is a tab in this project's one Quick Window, and you stay where you are"],
  window: ['open in a new window', 'newWin', 'a full window of its own, a new one each time'],
  group: ['open in a new group', 'group', 'a new group to the right in the editor, beside what you are reading'],
  browser: ['open in default browser', 'outBrowser', 'outside Amethyst, in the browser set in settings'],
};
const ORDER: Record<string, Where[]> = { tab: ['tab', 'quick', 'window', 'group', 'browser'], quick: ['quick', 'window', 'tab', 'browser'] };

let text = false;
const how = (x: Target, w: Where) => (!isPage(x) || w === 'browser' ? '' : text ? ', as text' : ", as a page in Amethyst's browser");
function opens(x: Target): Row[] {
  const here = hereOf();
  const rows: Row[] = ORDER[here].filter((w) => w !== 'browser' || isPage(x)).map((w) => {
    const [label, icon, tip] = PLACES[w === 'tab' && here !== 'tab' ? 'editor' : w];
    return { label, icon, tip: `${label.charAt(0).toUpperCase() + label.slice(1)}\n${tip.charAt(0).toUpperCase() + tip.slice(1)}${how(x, w)}.`, def: w === here, key: w === here ? 'double-click' : w === 'window' ? 'middle click' : '', pageOnly: w === 'browser', run: (t: Target) => openFile(t.path, w, { text: w !== 'browser' && text }) };
  });
  return isPage(x) ? ['as', ...rows] : rows;
}

function rowsOf(x: Target): Row[] {
  const rows: Row[] = [
    { label: 'new file…', icon: 'newFile', run: (t) => (!edShown() ? floatMake('text', '', t.dir) : newFile(t.dir)) },
    { label: 'new board', icon: 'newBoard', run: (t) => newInTab('board', null, t.dir) },
    { label: 'new folder…', icon: 'newFolder', run: (t) => newFolder(t.dir) },
  ];
  if (folder(x) || x.kind === 'project') rows.push(...createRows(x.dir).map((r) => ({ ...r, key: show(bound(UE_KEY[r.icon])) })));
  const focus = folder(x) || x.kind === 'project' ? focusItem(x.dir) : null;
  if (focus) rows.push('-', { label: focus.label === 'unfocus' ? 'show the whole project' : 'show only this folder', icon: '', svg: focus.svg, tip: focus.tip, run: focus.run });
  if (file(x)) {
    rows.push('-', ...opens(x));
    if (mode() === 'chat' || mode() === 'orch') rows.push({ label: 'add to chat', icon: 'toChat', key: 'ctrl right-click', run: (t) => attachToChat(t.path) });
  }
  rows.push('-');
  if (file(x) || folder(x)) rows.push({ label: 'rename…', icon: 'rename', key: 'f2', run: (t) => (file(t) ? renameFile(t.path) : renameFolder(t)) });
  rows.push({ label: 'copy path', icon: 'copy', run: (t) => copyPath(t.path) });
  if (x.kind !== 'project') rows.push({ label: 'copy relative path', icon: 'copy', run: (t) => copyPath(t.path, true) });
  rows.push({ label: `show in ${fileManager()}`, icon: 'reveal', run: (t) => api('POST', '/api/reveal', { path: t.path }).catch(showErr) });
  if ((file(x) || folder(x)) && !S.wsEditor) rows.push('-', { label: file(x) ? "show the file's history" : "show the folder's history", icon: 'git', run: (t) => fileHistory(t.path) });
  if (file(x) && !S.wsEditor) rows.push({ label: 'show who changed each line', icon: 'git', run: (t) => fileBlame(t.path) });
  if (file(x) || folder(x)) rows.push('-', { label: 'archive…', icon: 'archive', key: 'del', run: (t) => removeAsked(t.path) });
  if (file(x)) rows.push('-', { label: isPinned(pinOf(x)) ? 'unpin' : 'pin', icon: 'pin', run: (t) => togglePin(pinOf(t)) });
  if ((file(x) || folder(x)) && pref('filestyle:on')) rows.push(...(file(x) ? ['style' as const] : ['-' as const, 'style' as const]));
  return rows;
}

async function renameFolder(x: Target) {
  const name = await ask({ title: 'rename', value: x.name });
  if (name && name !== x.name) renameDir(x.path, name);
}
function targetOf(el: HTMLElement | null | undefined): Target | undefined {
  const d = el?.dataset || {};
  if (d.open) {
    const t = S.thoughts.get(d.open);
    return t && { kind: 'file', path: t.path, dir: t.dir, name: t.name };
  }
  if (el && 'inbox' in d) return { kind: 'inbox', path: inboxLoc(), dir: inboxLoc(), name: NAME.inbox };
  const c = S.dirs.get(d.dir ?? '');
  return c && { kind: c.path ? 'folder' : 'project', path: c.loc, dir: c.loc, name: c.name };
}

export function renameRow(el: HTMLElement) {
  const x = targetOf(el);
  if (x && file(x)) renameFile(x.path);
  else if (x && folder(x)) renameFolder(x);
}

function headOf(x: Target) {
  const th = file(x) ? S.thoughts.get(x.path) : null;
  return th ? menuHead(gemOf(th), x.name, `color:${col(th.color)}`) : menuHead(gem(x.kind === 'inbox' ? 'inbox' : x.kind === 'project' ? 'project' : 'folder'), x.name);
}
const seg = (v: string) => `<span class="as-v${text === (v === 'text') ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${text === (v === 'text')}" data-as="${v}">${v}</span>`;
const asRow = () => `<div class="as" role="radiogroup" aria-label="show as" title="Show as&#10;Page draws it in Amethyst's browser. Text shows its HTML, to edit.">${ICONS.page}<span>show as</span><span class="as-seg">${seg('page')}${seg('text')}</span></div>`;
const rowHtml = (it: Item, i: number) =>
  `<button class="mi${it.def ? ' def' : ''}" data-ti="${i}"${it.tip ? ` title="${esc(it.tip)}"` : ''}${it.pageOnly && text ? ' hidden' : ''}><i class="tb-ic">${it.svg ?? (ICONS[it.icon] || ICONS.blank)}</i><span class="mi-n">${esc(it.label)}</span>${chip(it.key || '')}</button>`;

let open: { x: Target; rows: Row[] } | null = null, fly = '';
function paint(x: Target) {
  const rows = rowsOf(x);
  let html = '', line = false;
  rows.forEach((it, i) => {
    if (it === '-') return void (line = !!html);
    if (line) html += '<div class="sep"></div>';
    line = false;
    html += it === 'as' ? asRow() : it === 'style' ? styleRows(styled(x), fly) : rowHtml(it, i);
  });
  open = { x, rows };
  return headOf(x) + bands({ actions: html });
}

export function treeMenu(e: MouseEvent, el: HTMLElement, again = false) {
  const x = targetOf(el);
  if (!x) return;
  e.preventDefault();
  if (!again) (text = false), (fly = '');
  const html = paint(x), rows = open!.rows;
  popMenu(e.clientX, e.clientY, html, (b) => {
    if (b.dataset.fly) {
      fly = fly === b.dataset.fly ? '' : b.dataset.fly;
      treeMenu(e, el, true);
      return (fly ? flyFocus() : document.querySelector<HTMLElement>(`#colormenu [data-fly="${b.dataset.fly}"]`))?.focus();
    }
    if (pickStyle(styled(x), b)) return treeMenu(e, el, true), flyFocus()?.focus();
    const it = rows[+b.dataset.ti!];
    if (it && typeof it === 'object') it.run(x, e);
  });
  keepMenu(() => treeMenu(e, el, true));
}

function pickAs(v: string) {
  if (!open || text === (v === 'text')) return;
  text = v === 'text';
  const m = $<HTMLElement>('#colormenu');
  for (const s of m.querySelectorAll<HTMLElement>('[data-as]')) {
    const on = text === (s.dataset.as === 'text');
    s.classList.toggle('on', on);
    s.setAttribute('aria-checked', String(on));
  }
  for (const it of opens(open.x)) {
    if (typeof it !== 'object') continue;
    const i = open.rows.findIndex((r) => typeof r === 'object' && r.label === it.label);
    const b = m.querySelector<HTMLElement>(`.mi[data-ti="${i}"]`);
    if (i < 0 || !b) continue;
    open.rows[i] = it;
    b.removeAttribute('data-tip');
    b.title = it.tip || '';
    b.hidden = !!it.pageOnly && text;
  }
}
const menu = $<HTMLElement>('#colormenu');
menu.addEventListener('click', (e) => {
  const s = (e.target as Element).closest<HTMLElement>('[data-as]');
  if (s) pickAs(s.dataset.as!);
});
menu.addEventListener('keydown', (e) => {
  const s = (e.target as Element).closest<HTMLElement>('[data-as]');
  if (!s || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  pickAs(s.dataset.as!);
});
menu.addEventListener('menuclose', () => (open = null));
