import { removeProject, setCtx, setSolo, updateProject } from './actions.ts';
import { icon } from '../base/icon.ts';
import { ask, bands, colorRow, fileManager, ICONS, flyFocus, gripRow, gripRuns, holdFocus, keepMenu, menuHead, miRow, moveMenu, popMenu, sortable, topRow, trayName } from '../base/controls.ts';
import { closeEditorNow, flushNow } from '../editor/editor.ts';
import { web } from '../minds/minds.ts';
import { api, atLaunch, atWs, HOME, hydrateTree, wsColor, levelKey, mode, pjColor, projectOf, S, showPid } from '../base/model.ts';
import { pjMark } from '../base/kinds.ts';
import { col } from '../base/theme.ts';
import { dockProjects, pjHidden, setDockOrder, setPjHidden } from './pjhide.ts';
import { setMode } from './modes.ts';
import { level as tabsLevel } from './groups.ts';
import { dropExt, openExternal, openInTab, shows, sync } from './tabs.ts';
import { $, amKey, esc, setSave, showErr, store } from '../base/util.ts';
import { page } from '../base/page.ts';
import { refuse } from '../base/notify.ts';
import { clearSearch, lastWorkspace, ordered, reload } from './views.ts';
import { announce, WIN } from '../base/windows.ts';
import type { Project, Tab, WorkspaceEntry } from '../base/types.ts';

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
const under = (parent: string, name: string) => parent.replace(/[\\/]+$/, '') + (parent.includes('\\') ? '\\' : '/') + name.replace(/[\\/:*?"<>|]/g, ' ').trim();
const dirKey = (p: string) => String(p || '').trim().replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();

async function leaveLevel() {
  await flushNow();
  closeEditorNow();
  S.wsEditor = false;
  store.del('wsEditor' + amKey);
}
function arrive() {
  showPid();
  announce();
  tabsLevel();
  setCtx('');
  setSolo(null);
  clearSearch();
  web.level(levelKey());
  page.render();
}

export async function switchLevel(pid: string, over?: Element) {
  if (pid === S.pid || S.switching) return;
  const p = pid && projectOf(pid);
  if (pid && (!p || p.missing)) return refuse(over, { title: "That project's folder is not there" });
  S.switching = true;
  try {
    await leaveLevel();
    S.pid = pid;
    arrive();
    if (!atWs() && hydrateTree()) {
      await sync();
      reload().catch(showErr);
    } else {
      await reload();
      await sync();
    }
    setSave('');
  } catch (e) {
    showErr(e);
  } finally {
    S.switching = false;
  }
}

export async function switchWorkspace(wid: string, over?: Element, pid = '') {
  if ((wid === S.wid && S.pid === pid) || S.switching) return;
  const w = (wid && S.workspaces.find((x) => x.id === wid)) as WorkspaceEntry | undefined;
  if (w?.missing) return refuse(over, { title: "That workspace's folder is not there" });
  S.switching = true;
  try {
    await leaveLevel();
    S.wid = wid;
    S.pid = pid;
    S.ws = null;
    S.projects = [];
    arrive();
    await reload();
    if (pid) await sync();
    setSave('');
  } catch (e) {
    showErr(e);
  } finally {
    S.switching = false;
  }
}

export const goUp = () => (S.pid ? switchLevel('') : S.wid ? switchWorkspace('') : null);
export function stepProject(d: number) {
  const list = S.projects.filter((p) => !p.missing && (p.id === S.pid || !pjHidden(p.id)));
  if (!list.length) return;
  const i = list.findIndex((p) => p.id === S.pid);
  return switchLevel(list[i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length].id);
}

export async function newProject() {
  const r = await ask({
    title: 'new project',
    text: 'A project in this workspace: your next idea, or a folder already on disk, like *a game*, *a website*, *a research folder*. Amethyst keeps its tabs, chats and terminals for you.',
    label: 'name',
    about: 'Its name in Amethyst. The folder keeps its own. Change it any time: right-click the project.',
    placeholder: 'e.g. Portfolio',
    folder: {
      follow: (name) => under(S.wsSuggest, name),
      pick: DESKTOP && ((at) => DESKTOP.pickFolder({ title: "the project's folder", defaultPath: at })),
      about: "Type a new folder and it's made for you, or browse to one you already have: nothing in it changes. It can be anywhere on disk. The same folder can be several projects, each with its own tabs, chats and terminals.",
      note: twinNote,
    },
  });
  if (r) addProject({ name: r.name, path: r.path });
}
function twinNote(dir: string) {
  const t = S.projects.find((p) => dirKey(dir) && dirKey(p.path) === dirKey(dir));
  return t ? `“${t.name}” uses this folder too. This makes another project on it: the same files, its own tabs, chats and terminals.` : '';
}

export async function addProject(body: { name: string; path: string }) {
  try {
    const p = await api('POST', '/api/project', body, '');
    S.ws = null;
    await reload();
    await switchLevel(p.id);
    setSave(`new project: ${p.name}`);
  } catch (e) {
    showErr(e);
  }
}

export async function showWsEditor(on: boolean) {
  if (mode() !== 'editor') setMode('editor');
  if (on === S.wsEditor || S.pid || !S.wid || S.switching) return;
  await leaveLevel();
  S.wsEditor = on;
  if (on) store.set('wsEditor' + amKey, S.wid);
  tabsLevel();
  await sync();
}

export async function openFiles(paths: string[], opts?: Parameters<typeof openExternal>[1], over?: Element) {
  if (!paths.length) return;
  if (atLaunch()) await switchWorkspace(lastWorkspace()?.id || HOME);
  if (atLaunch()) return;
  if (atWs()) {
    if (WIN > 1) return refuse(over, { title: 'No project is open here', line: 'Open it in Window 1' });
    await showWsEditor(true);
  }
  for (const p of paths) await openExternal(p, opts);
}

export async function moveExt(t: Tab) {
  const live = S.projects.filter((p) => !p.missing);
  if (!live.length) return setSave('no project in this workspace yet');
  const name = t.abs!.split(/[\\/]/).pop();
  const to = await ask({ title: `move “${name}”`, text: 'It leaves its folder and lands at the top of the project.', choices: live.map((p) => ({ label: p.name, value: p.id })) });
  if (!to) return;
  try {
    const { path } = await api('POST', '/api/ext/move', { path: t.abs, project: to }, '');
    dropExt(t.abs!);
    await switchLevel(to);
    if (!S.thoughts.has(path)) await reload();
    await openInTab(path);
    setSave(`moved “${name}” into ${projectOf(to)?.name}`);
  } catch (e) {
    showErr(e);
  }
}

export async function moveWsThoughts() {
  const list = (S.roots[0]?.thoughts || []).filter((t) => !t.file);
  const live = S.projects.filter((p) => !p.missing);
  if (!list.length || !live.length) return;
  const to = await ask({ title: `move ${list.length} file${list.length === 1 ? '' : 's'}`, text: 'Into which project? They land at its top, with the unsorted files. The originals go to the workspace archive.', choices: live.map((p) => ({ label: p.name, value: p.id })) });
  if (!to) return;
  try {
    for (const t of list) {
      const { content } = await api('GET', '/api/file?path=' + encodeURIComponent(t.path), undefined, '');
      await api('POST', '/api/file', { dir: '', title: t.title, content, kind: t.board ? 'board' : undefined }, to);
      await api('POST', '/api/archive', { path: t.path }, '');
    }
    setSave(`moved ${list.length} file${list.length === 1 ? '' : 's'} into ${projectOf(to)?.name}`);
  } catch (e) {
    showErr(e);
  }
  reload();
}

export function askWorkspace(text = 'One place for the projects that belong together: *Games*, *Work*, *Studies*. They stay in their own folders; the workspace only lines them up.', value = '', note?: (path: string) => string, at?: { name: string; path: string }) {
  return ask({
    title: 'new workspace',
    text,
    value,
    label: 'name',
    about: 'Its name here. Change it any time: right-click its tile.',
    placeholder: 'e.g. Games',
    folder: {
      follow: (name) => (at && name === at.name ? at.path : under(S.wsNewSuggest, name)),
      pick: DESKTOP && ((dir) => DESKTOP.pickFolder({ title: "the workspace's folder", defaultPath: dir })),
      about: "Type a new folder and it's made for you, or browse… to one you already have: nothing in it changes, and the projects already in it show up. New projects are offered a place in it.",
      ...(note ? { note } : {}),
    },
  }) as Promise<{ name: string; path: string } | null>;
}
export async function newWorkspace() {
  const r = await askWorkspace();
  if (r) addWorkspace({ name: r.name, path: r.path });
}

async function addWorkspace(body: { name: string; path: string }) {
  try {
    const w = await api('POST', '/api/workspace', body, '', '');
    await reload();
    await switchWorkspace(w.id);
    setSave(`new workspace: ${w.name}`);
  } catch (e) {
    showErr(e);
  }
}

let pjFly = '', menuPj = '';
let pjPeek: { els: HTMLElement[]; was: string[] } | null = null;
function unpeekPj() {
  pjPeek?.els.forEach((el, i) => (pjPeek!.was[i] ? el.style.setProperty('--pc', pjPeek!.was[i]) : el.style.removeProperty('--pc')));
  pjPeek = null;
}
function peekPj(sw: HTMLElement | null | undefined) {
  unpeekPj();
  if (!sw || !menuPj) return;
  const at = CSS.escape(menuPj), els = [...document.querySelectorAll<HTMLElement>(`#projects .pj-tab[data-pjsel="${at}"], #st-grid .pjr[data-pjsel="${at}"] .stackm`)];
  pjPeek = { els, was: els.map((el) => el.style.getPropertyValue('--pc')) };
  for (const el of els) el.style.setProperty('--pc', sw.style.getPropertyValue('--pc'));
}
const cmenu = $<HTMLElement>('#colormenu');
cmenu.addEventListener('pointerover', (e) => peekPj((e.target as Element).closest<HTMLElement>('[data-pc]')));
cmenu.addEventListener('pointerout', (e) => peekPj((e.relatedTarget as Element | null)?.closest?.<HTMLElement>('#colormenu [data-pc]')));
cmenu.addEventListener('menuclose', () => (unpeekPj(), (menuPj = '')));
const cardItem = (attrs: string, ic: string, label: string, key = '') => `<button class="mi" ${attrs}>${ic}<span class="mi-n">${esc(label)}</span>${key ? `<span class="k">${esc(key)}</span>` : ''}</button>`;
export function projectMenu(id: string, x: number, y: number, again = false) {
  const p = projectOf(id);
  if (!p) return;
  if (!again) pjFly = '';
  const color = colorRow({ k: 'pc', label: 'color', tip: "the project's color: its mark in the dock, the Projects list and the workspace page", chip: `<i class="pk-ic" style="--pc:${esc(pjColor(p))}">${pjMark()}</i>`, now: p.color ? trayName(p.color) : 'default', title: 'color of the project', attr: 'pc', cls: 'sw-pj', dfltCls: 'sw-pj', dfltTip: 'default · no color of its own', dfltStyle: `--pc:${pjColor(null)}`, style: (h) => `--pc:${col(h)}`, icon: pjMark(), line: true }, p.color, pjFly);
  const list = dockProjects();
  const rows = list.map((q) => ({ grip: true, html: gripRow(q.id, topRow(!pjHidden(q.id), `data-pjh="${esc(q.id)}" style="--pc:${esc(pjColor(q))}" title="${esc(q.name)}&#10;${esc(`Shows ${q.name} in this Amethyst's dock.${q.id === S.pid ? ' It is the project you are in.' : ''} Other Amethysts keep their own; the project stays in the workspace either way.`)}"`, pjMark(), esc(q.name))) }));
  const html = menuHead(pjMark(), p.name, `--pc:${pjColor(p)}`) + bands({ actions: miRow('data-pm="rename"', ICONS.rename, 'rename…', '', 'Asks for a new name.') + miRow('data-pm="remove"', ICONS.unlist, 'remove from the workspace…', '', 'Asks first. Nothing is deleted: the folder stays where it is.') + color, pick: ['projects', gripRuns('m', rows)] });
  menuPj = id;
  popMenu(x, y, html, async (b) => {
    const d = b.dataset;
    if (d.fly) {
      pjFly = pjFly ? '' : d.fly;
      projectMenu(id, x, y, true);
      return (pjFly ? flyFocus() : $<HTMLElement | null>('#colormenu [data-fly]'))?.focus();
    }
    if ('pc' in d) {
      if ((d.pc || null) !== (p.color || null)) await updateProject(id, { color: d.pc || null });
      projectMenu(id, x, y, true);
      return flyFocus()?.focus();
    }
    if (d.pjh) {
      setPjHidden(d.pjh, !pjHidden(d.pjh));
      projectMenu(id, x, y, true);
      return $<HTMLElement | null>(`#colormenu [data-pjh="${CSS.escape(d.pjh)}"]`)?.focus();
    }
    if (d.pm === 'rename') {
      const name = await ask({ title: 'rename project', value: p.name });
      if (name?.trim() && name.trim() !== p.name) updateProject(id, { name: name.trim() });
    }
    if (b.dataset.pm === 'remove') removeProject(id);
  });
  keepMenu(() => projectMenu(id, x, y, true));
  moveMenu('m', (ids) => setDockOrder(ids));
}

let wsFly = '';
export function workspaceMenu(id: string, x: number, y: number, again = false) {
  const w = S.workspaces.find((v) => v.id === id);
  if (!w) return;
  if (!again) wsFly = '';
  const put = async (list: typeof S.workspaces) => {
    try {
      await api('PUT', '/api/workspaces', { workspaces: list }, '', '');
    } catch (e) {
      showErr(e);
    }
    await reload();
  };
  const own = (w.color as string | null) || null, icon = ICONS.workspaces;
  const color = colorRow({ k: 'wc', label: 'color', tip: "the workspace's color: its icon in the workspaces menu and in orchestration", chip: `<i class="pk-ic sw-ic" style="--ly-c:${esc(wsColor({ color: own }))}">${icon}</i>`, now: own ? trayName(own) : 'default', title: 'color of the workspace', attr: 'wmcolor', cls: 'sw-ic', dfltCls: 'sw-ic', dfltTip: 'default · no color of its own', dfltStyle: `--ly-c:${wsColor(null)}`, style: (h) => `--ly-c:${col(h)}`, icon, line: true }, own, wsFly);
  const html = menuHead(icon, w.name, `color:${wsColor({ color: own })}`) + bands({ actions: `${cardItem('data-wm="rename" title="rename&#10;Gives the workspace another name."', ICONS.rename, 'rename')}${cardItem(`data-wm="show" title="show in ${fileManager()}&#10;Opens the workspace's folder."`, ICONS.reveal, `show in ${fileManager()}`)}${cardItem('data-wm="remove" title="remove from the list&#10;Nothing is deleted: its folder and its projects stay where they are."', ICONS.unlist, 'remove from the list')}${color}` });
  popMenu(x, y, html, async (b) => {
    const d = b.dataset;
    if (d.fly) {
      wsFly = wsFly ? '' : d.fly;
      workspaceMenu(id, x, y, true);
      return (wsFly ? flyFocus() : $<HTMLElement | null>('#colormenu [data-fly]'))?.focus();
    }
    if ('wmcolor' in d) {
      if ((d.wmcolor || null) !== own) await put(S.workspaces.map((v) => (v.id === id ? { ...v, color: d.wmcolor || null } : v)));
      workspaceMenu(id, x, y, true);
      return flyFocus()?.focus();
    }
    if (d.wm === 'show') return api('POST', '/api/show-path', { path: w.path }, '', '').catch(showErr);
    if (d.wm === 'rename') {
      const name = await ask({ title: 'rename workspace', value: w.name });
      if (name?.trim()) put(S.workspaces.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)));
    }
    if (d.wm === 'remove') {
      if (w.home && w.projects.length) return refuse(b, { title: `“${w.name}” still holds ${w.projects.length} project${w.projects.length === 1 ? '' : 's'}`, line: 'move them into another workspace first' });
      if (await ask({ title: 'remove workspace', text: w.home ? `Take “${w.name}” off the list? Nothing is deleted.` : `Take “${w.name}” off the list? Nothing is deleted: its folder and its projects stay at ${w.path}, and opening that folder as a workspace brings it back.`, confirm: true })) put(S.workspaces.filter((v) => v.id !== id));
    }
  });
  keepMenu(() => workspaceMenu(id, x, y, true));
}
async function workspacesMenu() {
  const btn = $('#ws-all');
  let all: WorkspaceEntry[];
  try {
    all = (await api('GET', '/api/workspaces', undefined, '', '')).workspaces;
  } catch (e) {
    return showErr(e);
  }
  const r = btn.getBoundingClientRect(), opened = store.get('wsOpened', {});
  const row = (w: WorkspaceEntry) => {
    const n = w.projects.length, tip = w.missing ? `${w.name}\nThe folder is not there: ${w.path}` : `${w.name}\nGoes to ${w.name}: ${n} project${n === 1 ? '' : 's'}, in ${w.path}.`;
    return `<button class="mi pick chk tb-row ws-mi${w.id === S.wid ? ' on' : ''}"${w.missing ? ' aria-disabled="true"' : ''} data-shut data-wsm="${esc(w.id)}" title="${esc(tip)}" data-tip-mono style="--wc:${esc(wsColor({ color: w.color as string | null }))}"><i class="tb-ic">${ICONS.workspaces}</i><span class="nm">${esc(w.name)}</span></button>`;
  };
  const html = menuHead(ICONS.workspaces, 'all workspaces') + bands({ actions: miRow('data-wsm-all', ICONS.workspaces, 'show every workspace', 'click', 'Shows every workspace you have, the same as a click on the button.'), pick: ['workspace', `<div class="ws-ml">${ordered(all, (w) => opened[w.id]).map(row).join('')}</div>`] });
  popMenu(r.left, r.top - 6, html, (b) => {
    if ('wsmAll' in b.dataset) return switchWorkspace('');
    if (all.find((w) => w.id === b.dataset.wsm)?.missing) return refuse(btn, { title: "That workspace's folder is not there" });
    switchWorkspace(b.dataset.wsm!, btn);
  }, true);
}
$('#ws-all').addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  workspacesMenu();
});
export async function orderProjects(ids: string[]) {
  const rank = new Map<any, number>(ids.map((id, i) => [id, i]));
  const at = (x: Project) => rank.get(x.id) ?? Infinity;
  const next = [...S.projects].sort((a, b) => at(a) - at(b) || 0);
  try {
    await api('PUT', '/api/projects', { projects: next }, '');
    S.projects.sort((a, b) => at(a) - at(b) || 0);
  } catch (e) {
    showErr(e);
  }
  page.reload();
}
sortable($('#st-grid'), { item: '[data-pjsel]', skip: '.pr-eye', drop: (all) => orderProjects(all.map((t) => t.dataset.pjsel!)) });

const descEl = $<HTMLElement>('#st-desc');
descEl.setAttribute('contenteditable', 'plaintext-only');
descEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  descEl.textContent = S.ws?.desc || '';
  descEl.blur();
});
descEl.addEventListener('blur', () => {
  const text = descEl.innerText.trim();
  descEl.scrollTop = 0;
  if (!S.ws || text === (S.ws.desc || '')) return;
  S.ws.desc = text;
  api('PUT', '/api/workspace', { desc: text }, '').catch(showErr);
});
