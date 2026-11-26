import { ask, dragKeys, mark } from '../base/controls.ts';
import { decks } from '../decks/decks.ts';
import { api, atLaunch, atWs, countOf, dirLabel, inboxLoc, isPinned, mode, projectOf, S, samePin, setLayout, soloOf, toEditor, within } from '../base/model.ts';
import { web } from '../minds/minds.ts';
import { page } from '../base/page.ts';
import { isOff, onPref, pref, setOff, setPref, wasSet } from '../base/prefs.ts';
import { record, undoer } from '../base/undo.ts';
import { $, parentOf, quietly, setSave, showErr, store } from '../base/util.ts';
import { NAME } from '../base/kinds.ts';
import { refuse } from '../base/notify.ts';
import type { Folder, Pin, Project } from '../base/types.ts';
import { followFocus } from '../focus/focus.ts';

type Op = { op: string; at?: string; path?: string; from?: string; to?: string; id?: string; before?: any; after?: any };
type Clip = { mode: string; project: string; paths: string[]; os: string };

async function relocate(path: string, toDir: string): Promise<string> {
  const { path: now } = await api('POST', '/api/move', { from: path, toDir });
  followPath(path, now);
  return now;
}
async function touching(paths: string[], fn: () => Promise<(string | undefined)[] | void>) {
  const o = S.open?.path;
  if (o && paths.some((p) => o === p || o.startsWith(p + '/'))) await page.flushNow();
  const full = paths.some((p) => S.dirs.has(p));
  let made;
  try {
    made = await fn();
  } catch (e) {
    showErr(e);
  }
  await page.reload(full ? undefined : [...paths, ...(made ?? []).filter((p) => p != null)]);
}
function followPath(path: string, now: string) {
  if (now === path) return;
  page.moved(path, now);
  const fix = <T extends string | null | undefined>(p: T): T => (typeof p === 'string' && (p === path || p.startsWith(path + '/')) ? (now + p.slice(path.length)) as T : p);
  S.ctx = fix(S.ctx);
  S.solo = fix(S.solo);
  followFocus(path, now);
  page.openMoved(path, now);
}
async function renameTo(path: string, name: string, whole = false): Promise<string> {
  if (S.open?.path === path) await page.flushNow();
  const r: { path: string; title: string } = await api('POST', '/api/rename', { path, name, whole });
  followPath(path, r.path);
  if (r.path !== path) page.openMoved(r.path, r.path, { title: r.title });
  return r.path;
}

const step = (label: string, ops: Op[]) => ops.length && record('files', label, { ops });
export const madeStep = (label: string, path: string) => step(label, [{ op: 'made', path }]);
async function archive(path: string): Promise<string> {
  if (S.open?.path === path || S.open?.path?.startsWith(path + '/')) {
    await page.flushNow();
    page.closeEditorNow();
  }
  return (await api('POST', '/api/archive', { path })).id;
}
const restore = async (id: string): Promise<string> => (await api('POST', '/api/restore', { id })).path;
async function putText(path: string, now: string, to: string) {
  const changed = () => new Error('it changed since');
  if (S.open?.path === path && !S.open.board) {
    const ta = $('#ed-body');
    if (ta.value !== now) throw changed();
    ta.value = to;
    ta.dispatchEvent(new Event('input'));
    return page.flushNow();
  }
  const { content } = await api('GET', '/api/file?path=' + encodeURIComponent(path));
  if (content !== now) throw changed();
  await api('PUT', '/api/file', { path, content: to });
}
const nameOf = (p: string) => p.split('/').pop()!;
async function runOp(op: Op, back: boolean) {
  const at = (op.at ?? op.path ?? op.to)!;
  if (op.op === 'move') op.at = await relocate(at, parentOf((back ? op.from : op.to)!));
  else if (op.op === 'rename') op.at = await renameTo(at, nameOf((back ? op.from : op.to)!), true);
  else if (op.op === 'archive') back ? (op.at = await restore(op.id!)) : (op.id = await archive(at));
  else if (op.op === 'made') back ? (op.id = await archive(at)) : (op.at = await restore(op.id!));
  else if (op.op === 'ranks') await api('PUT', '/api/ranks', { paths: back ? op.before : op.after });
  else if (op.op === 'order') await api('PUT', '/api/order', { order: back ? op.before : op.after });
  else if (op.op === 'text') await putText(at, back ? op.after : op.before, back ? op.before : op.after);
}
export async function runOps(d: { ops: Op[] }, back: boolean) {
  const paths = new Set<string>();
  let full = false;
  const add = (op: Op) => {
    if (op.op === 'order') full = true;
    const list = op.op === 'ranks' ? [...op.before, ...op.after] : [op.from, op.to, op.path, op.at];
    for (const p of list) if (typeof p === 'string') (full ||= S.dirs.has(p)), paths.add(p);
  };
  try {
    for (const op of back ? [...d.ops].reverse() : d.ops) {
      add(op);
      await runOp(op, back);
      add(op);
    }
  } finally {
    await page.reload(full ? undefined : paths);
  }
}
undoer('files', {
  there: () => mode() === 'editor',
  go() {
    toEditor();
    page.render();
  },
  undo: (d) => runOps(d, true),
  redo: (d) => runOps(d, false),
});

export async function moveItem(key: string, to: string) {
  const t = S.thoughts.get(key);
  const c = !t && S.dirs.get(key);
  if (!t && !c) return;
  if (c && !c.path) return refuse(document.body, { title: 'The project folder stays where it is' });
  if (!S.dirs.has(to)) return;
  if ((t ? t.dir : (c as Folder).parent) === to) return;
  if (c && within(to, key)) return refuse(document.body, { title: `Can't put “${c.name}” inside itself` });
  const o = S.open;
  await touching([key], async () => {
    const now = await relocate(key, to);
    step(`moved “${t ? t.title : (c as Folder).name}” → ${dirLabel(to)}`, [{ op: 'move', from: key, to: now }]);
    if (t && o?.path === now) {
      o.dir = to;
      page.renderEditorMeta();
    }
    setSave(`moved → ${dirLabel(to)}`);
    return [now];
  });
}

export async function copyIn(paths: string[], to: string) {
  if (!S.dirs.has(to) || !paths.length) return;
  await touching([], async () => {
    const made: string[] = [];
    for (const p of paths) made.push((await api('POST', '/api/ext/copy', { path: p, project: S.pid, dir: to }, '')).path);
    step(`copied ${made.length > 1 ? `${made.length} files` : `“${made[0].split('/').pop()}”`} → ${dirLabel(to)}`, made.map((path) => ({ op: 'made', path })));
    setSave(`copied → ${dirLabel(to)}`);
    return made;
  });
}

let clip: Clip | null = null;
const osFiles = async () => (await quietly(window.amethyst?.clipboardFiles?.() ?? Promise.resolve([]), [])) ?? [];
export async function copyItems(paths: string[], cut: boolean) {
  if (!paths.length) return;
  clip = { mode: cut ? 'cut' : 'copy', project: S.pid, paths, os: JSON.stringify(await osFiles()) };
  setSave(`${cut ? 'cut' : 'copied'} ${paths.length > 1 ? paths.length + ' items' : `“${nameOf(paths[0])}”`}`);
}
async function pasteInto(to: string, body: Record<string, unknown>, label: string) {
  let ok = false;
  await touching([], async () => {
    const made: string[] = (await api('POST', '/api/paste', { ...body, project: S.pid, dir: to }, '')).paths;
    step(`pasted ${label} → ${dirLabel(to)}`, made.map((path) => ({ op: 'made', path })));
    setSave(`pasted ${label} → ${dirLabel(to)}`);
    ok = true;
    return made;
  });
  return ok;
}
const pasteFromOS = (paths: string[], to: string) => S.dirs.has(to) && paths.length && pasteInto(to, { abs: paths }, paths.length > 1 ? `${paths.length} items` : `“${nameOf(paths[0].replace(/\\/g, '/'))}”`);
export async function pasteItems(to: string) {
  if (!S.dirs.has(to)) return;
  const os = await osFiles();
  if (os.length && JSON.stringify(os) !== clip?.os) {
    clip = null;
    return pasteFromOS(os, to);
  }
  if (!clip) return;
  const { mode, project, paths } = clip;
  if (mode === 'cut' && project === S.pid) {
    clip = null;
    return paths.length > 1 ? moveMany(paths, to) : moveItem(paths[0], to);
  }
  const ok = await pasteInto(to, { items: paths.map((path) => ({ project, path })) }, paths.length > 1 ? `${paths.length} items` : `“${nameOf(paths[0])}”`);
  if (ok && mode === 'cut') {
    clip = null;
    for (const path of paths) await api('POST', '/api/archive', { path }, project).catch(showErr);
  }
}

export async function moveMany(keys: string[], to: string) {
  if (!S.dirs.has(to)) return;
  const go: string[] = [], skip: string[] = [];
  for (const k of keys) {
    const t = S.thoughts.get(k), c = !t && S.dirs.get(k);
    if (!t && !c) continue;
    if (c && !c.path) skip.push('the project folder');
    else if (c && within(to, k)) skip.push(`“${c.name}” into itself`);
    else if ((t ? t.dir : (c as Folder).parent) !== to) go.push(k);
  }
  const skipped = skip.length ? ` · can't move ${skip.join(', ')}` : '';
  if (!go.length) return skip.length && setSave(skipped.slice(3), true);
  if (go.some((k) => S.dirs.has(k)) && !(await ask({ title: `Move ${go.length} items?`, text: `Into ${dirLabel(to)}.`, confirm: true }))) return;
  const o = S.open, ops: Op[] = [];
  await touching(go, async () => {
    try {
      for (const k of go) {
        const t = S.thoughts.get(k), now = await relocate(k, to);
        ops.push({ op: 'move', from: k, to: now });
        if (t && o?.path === now) o.dir = to;
      }
    } finally {
      step(`moved ${ops.length} items → ${dirLabel(to)}`, ops);
      if (o && ops.some((x) => x.to === o.path)) page.renderEditorMeta();
    }
    mark(null, 'clear');
    setSave(`moved ${ops.length} items → ${dirLabel(to)}${skipped}`, !!skip.length);
    return ops.map((x) => x.to);
  });
}

export async function placeThought(path: string, next: string, after: boolean) {
  const t = S.thoughts.get(path), n = S.thoughts.get(next);
  if (!t || !n) return;
  const to = n.dir, from = path, ops: Op[] = [], was = S.dirs.get(to)!.thoughts.map((x) => x.path);
  await touching([from], async () => {
    if (t.dir !== to) {
      path = await relocate(path, to);
      ops.push({ op: 'move', from, to: path });
      page.openMoved(path, path, { dir: to });
    }
    const list = S.dirs.get(to)!.thoughts.map((x) => x.path).filter((p) => p !== path && p !== t.path);
    list.splice(list.indexOf(next) + (after ? 1 : 0), 0, path);
    await api('PUT', '/api/ranks', { paths: list });
    step(t.dir !== to ? `moved “${t.title}” → ${dirLabel(to)}` : `the order in ${dirLabel(to)}`, [...ops, { op: 'ranks', before: was, after: list }]);
    setSave(t.dir !== to ? `moved → ${dirLabel(to)}` : 'order saved');
    return [path, ...list];
  });
}

export async function moveDir(key: string, to: string) {
  const c = S.dirs.get(key);
  if (!c?.path) return;
  if (to === key || to === c.parent) return;
  if (within(to, key)) return refuse(document.body, { title: `Can't put “${c.name}” inside itself` });
  if (await ask({ title: `Move “${dirLabel(key)}”?`, text: `The ${NAME.folder} goes into ${dirLabel(to)}.`, confirm: true })) moveItem(key, to);
}

export function selectDir(dir: string, fromIndex = false, zoom = false, stay = false, panel = dir) {
  S.ctx = dir;
  if (page.shows('mind')) {
    if (zoom) web.zoomTo({ dir: panel });
    else if (!stay) web.glideTo(panel);
  }
  if (page.shows('list') && (fromIndex || S.solo != null)) S.solo = soloOf(dir);
  page.render();
}
export const selectInbox = (fromIndex = false, zoom = false, stay = false) => selectDir(inboxLoc(), fromIndex, zoom, stay, 'ib:');

export const setCtx = (loc: string) => (S.ctx = loc);
export const setSolo = (loc: string | null) => (S.solo = loc);

const SIDE_AT = 'side:at', SIDE_KEEP = 400;
let sideAt = '';
function keepSide() {
  store.set('side', S.side);
  store.set('sideView', S.sideView);
  if (!sideAt || pref('side:follow')) return;
  const all: Record<string, { on: boolean; view: string }> = store.get(SIDE_AT, {});
  delete all[sideAt];
  all[sideAt] = { on: S.side, view: S.sideView };
  const keys = Object.keys(all);
  for (const k of keys.slice(0, Math.max(0, keys.length - SIDE_KEEP))) delete all[k];
  store.set(SIDE_AT, all);
}
let drawer = false;
export const narrowQ = matchMedia('(max-width: 860px)');
const narrowOrch = () => narrowQ.matches && mode() === 'orch';
export const sideOver = () => !atLaunch() && !atWs() && (isOff('side:over', mode()) || narrowOrch());
narrowQ.addEventListener('change', () => {
  if (mode() === 'orch' && !isOff('side:over', mode())) drawer = narrowQ.matches && S.side;
});
export const drawerOpen = () => drawer;
export function sideHere(key: string) {
  if (key === sideAt) return;
  sideAt = key;
  drawer = false;
  if (pref('side:follow')) return;
  const had = store.get(SIDE_AT, {})[key];
  if (had) {
    S.side = !!had.on;
    S.sideView = had.view || 'tree';
  }
  keepSide();
}
onPref('side:follow', () => pref('side:follow') || keepSide());
export function setSideOver(on: boolean) {
  drawer = on && S.side;
  setOff('side:over', mode(), on);
}
export function showSide(view: string, show: boolean) {
  if (show) S.sideView = view;
  if (sideOver()) {
    drawer = show;
    if (show) store.set('sideView', view);
    return;
  }
  S.side = show;
  keepSide();
}

export function savePins(list: Pin[]) {
  S.pins = list;
  api('PUT', '/api/pins', { pins: list }).catch(showErr);
}
export function togglePin(p: { kind: string; path?: string; session?: string; id?: string; program?: string; title?: string }) {
  if (isPinned(p)) savePins(S.pins.filter((x) => !samePin(x, p)));
  else {
    savePins([...S.pins, p as Pin]);
    if (!wasSet('pins:on')) setPref('pins:on', true);
  }
  page.render();
}

export function setMark(session: string, n: number) {
  const marks = { ...S.marks };
  if (n) marks[session] = n;
  else delete marks[session];
  S.marks = marks;
  api('PUT', '/api/marks', { marks }).catch(showErr);
  page.render();
}

let changed = 0;
export const filesChanged = () => {
  clearTimeout(changed);
  changed = setTimeout(() => page.reload().catch(showErr), 600);
};

export async function updateProject(id: string, patch: Partial<Project>) {
  try {
    await api('PUT', '/api/projects', { projects: S.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }, '');
    Object.assign(projectOf(id) || {}, patch);
  } catch (e) {
    showErr(e);
  }
  if (atWs()) await page.reload();
  else page.render();
}

export async function removeProject(id: string) {
  const p = projectOf(id);
  if (!p) return;
  if (!(await ask({ title: `remove project`, text: `Take “${p.name}” off the workspace “${S.ws?.name}”? Nothing is deleted: its folder stays at ${p.path}.`, confirm: true }))) return;
  try {
    await api('PUT', '/api/projects', { projects: S.projects.filter((x) => x.id !== id) }, '');
    decks.forget(`${S.wid}|${id}`);
  } catch (e) {
    showErr(e);
  }
  if (S.pid === id) return page.switchLevel('');
  page.reload();
}

export async function newFolder(where = S.ctx, pos: { x: number; y: number } | null = null) {
  const name = await page.nameInTree({ dir: where, kind: 'folder' });
  if (!name) return;
  try {
    const path = (where ? where + '/' : '') + name.trim().replace(/\//g, '-');
    if (S.dirs.has(path)) throw new Error(`“${dirLabel(path)}” already exists`);
    if (pos) await saveSpot(path, pos, where);
    const r = await api('POST', '/api/dir', { path });
    step(`made ${where ? NAME.subfolder : NAME.folder} “${nameOf(r.path)}”`, [{ op: 'made', path: r.path }]);
    S.ctx = r.path;
  } catch (e) {
    showErr(e);
  }
  page.reload();
}

async function saveSpot(key: string, at: { x: number; y: number }, where: string) {
  const p = web.spotOf(where);
  if (!p) return;
  const pos = { x: at.x - p.x, y: at.y - p.y, rel: 1 };
  setLayout({ [key]: pos });
  await api('PUT', '/api/layout', { layout: { [key]: pos } }).catch(showErr);
}

export async function renameDir(path: string, name: string) {
  if (!path || !name) return;
  try {
    const now = await renameTo(path, name);
    if (now !== path) step(`renamed “${nameOf(path)}” → “${nameOf(now)}”`, [{ op: 'rename', from: path, to: now }]);
  } catch (e) {
    showErr(e);
  }
  page.reload();
}

export async function renameFile(path: string) {
  const t = S.thoughts.get(path);
  if (!t) return;
  const dot = t.name.lastIndexOf('.');
  const name = await ask({ title: 'rename', text: 'Its whole name: the extension can change too.', value: t.name, pick: [0, dot > 0 ? dot : t.name.length] });
  if (!name || name === t.name) return;
  await touching([path], async () => {
    const now = await renameTo(path, name, true);
    if (now !== path) step(`renamed “${t.name}” → “${nameOf(now)}”`, [{ op: 'rename', from: path, to: now }]);
    return [now];
  });
}

export async function removeAsked(path: string) {
  const keys = dragKeys(path).filter((k) => S.thoughts.has(k) || S.dirs.get(k)?.path);
  if (keys.length > 1) return removeMany(keys);
  const t = S.thoughts.get(path), d = !t && S.dirs.get(path);
  if (!t && !(d as Folder | undefined)?.path) return;
  const name = t ? t.title : dirLabel(path);
  const a = await ask({ title: `Archive “${name}”?`, text: t ? 'It goes to the archive (4).' : `It goes to the archive (4), with the ${countOf(d as Folder)} file(s) in it.`, tick: 'delete forever (from disk, no undo)' });
  if (!a) return;
  return t ? archiveFile(path, a.tick) : trashDir(path, a.tick);
}

async function removeMany(keys: string[]) {
  const list = [{ kind: 'folder', names: keys.filter((k) => S.dirs.has(k)).map(dirLabel) }, { kind: 'file', names: keys.filter((k) => S.thoughts.has(k)).map((k) => S.thoughts.get(k)!.title) }];
  const a = await ask({ title: `Archive ${keys.length} items?`, text: 'These files and folders will get archived (4 opens the archive). Do you want to continue?', list, tick: 'delete forever (from disk, no undo)' });
  if (!a) return;
  const o = S.open?.path, inside = (p: unknown, k: string) => typeof p === 'string' && (p === k || p.startsWith(k + '/'));
  if (keys.some((k) => inside(o, k))) {
    await page.flushNow();
    page.closeEditorNow();
  }
  const ops: Op[] = [];
  try {
    for (const k of keys) {
      const { id } = await api('POST', '/api/archive', { path: k });
      if (a.tick) await api('POST', '/api/purge', { id });
      else ops.push({ op: 'archive', path: k, id });
      if (inside(S.ctx, k)) S.ctx = '';
      if (inside(S.solo, k)) S.solo = null;
    }
  } catch (e) {
    showErr(e);
  }
  step(`archived ${ops.length} items`, ops);
  mark(null, 'clear');
  setSave(a.tick ? `deleted ${keys.length} items for good` : `archived ${ops.length} items · 4 opens the archive`);
  page.reload();
}

export async function archiveFile(path: string, forever = false) {
  const t = S.thoughts.get(path);
  if (!t) return;
  await touching([path], async () => {
    if (S.open?.path === path) page.closeEditorNow();
    const { id } = await api('POST', '/api/archive', { path });
    if (forever) await api('POST', '/api/purge', { id });
    else step(`archived “${t.title}”`, [{ op: 'archive', path, id }]);
    setSave(forever ? `deleted “${t.title}” for good` : `archived “${t.title}” · 4 opens the archive`);
  });
}

async function trashDir(path: string, forever = false) {
  const d = S.dirs.get(path);
  if (!d?.path) return;
  if (S.open?.path?.startsWith(path + '/')) {
    await page.flushNow();
    page.closeEditorNow();
  }
  try {
    const { id } = await api('POST', '/api/archive', { path });
    if (forever) await api('POST', '/api/purge', { id });
    else step(`archived “${dirLabel(path)}”`, [{ op: 'archive', path, id }]);
    if (S.ctx === path || S.ctx?.startsWith(path + '/')) S.ctx = '';
    if (S.solo === path || S.solo?.startsWith(path + '/')) S.solo = null;
    setSave(forever ? `deleted “${dirLabel(path)}” for good` : `archived “${dirLabel(path)}” with its ${countOf(d)} file(s) · 4 opens the archive`);
  } catch (e) {
    showErr(e);
  }
  page.reload();
}

export async function pinOrder(ids: string[]) {
  const rank = new Map<any, number>(ids.map((id, i) => [id, i + 1]));
  const next = S.workspaces.map((x) => ({ ...x, pin: rank.get(x.id) || null }));
  try {
    await api('PUT', '/api/workspaces', { workspaces: next }, '', '');
    for (const x of S.workspaces) x.pin = rank.get(x.id) || null;
  } catch (e) {
    showErr(e);
  }
  page.reload();
}
export async function resetOrder() {
  if (!S.workspaces.some((x) => x.pin)) return;
  const next = S.workspaces.map((x) => ({ ...x, pin: null }));
  try {
    await api('PUT', '/api/workspaces', { workspaces: next }, '', '');
    for (const x of S.workspaces) x.pin = null;
  } catch (e) {
    showErr(e);
  }
  page.reload();
}
export async function reorderFolder(path: string, before: string) {
  const order = S.data!.order || [];
  const rk = (c: Folder) => (order.includes(c.path) ? order.indexOf(c.path) : Infinity);
  const names = [...S.dirs.values()]
    .filter((c) => c.kind !== 'inbox' && c !== S.inbox && !c.path.includes('/'))
    .sort((a, b) => rk(a) - rk(b) || a.name.localeCompare(b.name))
    .map((c) => c.path)
    .filter((p) => p !== path);
  names.splice(names.indexOf(before), 0, path);
  try {
    await api('PUT', '/api/order', { order: names });
    step(`the order of the ${NAME.folder}s`, [{ op: 'order', before: order, after: names }]);
  } catch (e) {
    showErr(e);
  }
  page.reload();
}
