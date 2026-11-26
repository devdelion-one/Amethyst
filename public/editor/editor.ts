import { moveItem, runOps, setCtx } from '../app/actions.ts';
import { createBoard, emptyBoard } from './board.ts';
import { containerOptions, hideMenu, ICONS, viewImage } from '../base/controls.ts';
import { agentRight } from '../base/agentmenu.ts';
import { isOff } from '../base/prefs.ts';
import { noteView, saveImages } from '../base/textbox.ts';
import { pastedImages } from '../base/chips.ts';
import { span } from '../base/hitch.ts';
import { follow, here, linkMenu } from '../base/follow.ts';
import { fileLinks, imgLink, imgsIn, linkAt } from '../base/links.ts';
import { api, dirLabel, imgUrl, inboxLoc, levelKey, projectOf, S } from '../base/model.ts';
import { col } from '../base/theme.ts';
import { record, undoer } from '../base/undo.ts';
import { $, ago, esc, onSelEnd, quietly, saved, setSave, showErr, store, unsaved } from '../base/util.ts';
import { page } from '../base/page.ts';
import { gem } from '../base/kinds.ts';
import { lockOf, lockText, on, onLock, send } from '../base/windows.ts';
import { createPad } from './pad.ts';
import { attach, fmtKey } from '../base/fmt.ts';
import { land, lift } from '../base/lift.ts';
import type { Note, OpenFile } from '../base/types.ts';
import type { EditorView } from '@codemirror/view';

type ScratchStep = { before: string; after: string; made?: any; sent?: boolean };

export function renderWhere() {
  if (!S.open) return;
  const sel = $('#ed-where');
  sel.innerHTML = containerOptions();
  sel.value = S.open.dir;
}

export function renderEditorMeta() {
  const o = S.open;
  if (!o) return;
  $('#ed-webv').textContent = (o.dir != null && dirLabel(o.dir)) || 'where';
  renderLinks();
  const kind = o.board ? 'board' : 'file', c = S.thoughts.get(o.path as string)?.color;
  const mark = $('#ed-mark');
  mark.innerHTML = gem(kind);
  mark.style.setProperty('--tc', c ? col(c) : 'var(--accent)');
  mark.style.setProperty('--mc', c ? col(c) : 'var(--accent)');
  mark.disabled = true;
  $('#ed-head').textContent = o.scratch ? '' : o.path ? `${kind} · ${dirLabel(o.dir as string)}${o.touched ? ` · touched ${ago(o.touched)}` : ''}` : `new ${kind} · not saved yet`;
}

const derive = (s: string) => (s.split('\n').map((l) => l.replace(/^[#\-*>\s]+/, '').trim()).find(Boolean) || '').slice(0, 60);
const effTitle = (o: OpenFile) => (o.board ? o.title.trim() || 'board' : (o.autoTitle ? derive(o.content) : o.title.trim()) || 'untitled');

export function newBoard(dir = '', tab: string | null = null) {
  closeEditorNow();
  openEditor({ tab, path: null, dir, board: true, title: '', content: emptyBoard(), meta: {}, autoTitle: false });
  $('#ed-title').focus();
}

const isText = (o: OpenFile | null | undefined) => !!o?.scratch && o.mode === 'text';
export const listOf = (o: OpenFile | null | undefined) => (isText(o) ? 'scratch' : 'sketch');
const scratchFocus = () => (isText(S.open) ? body?.focus() : pad.focus());
export async function openScratch(tab: string | null = null, mode = 'text') {
  if (S.open?.scratch && S.open.mode === mode) return scratchFocus();
  await flushNow();
  try {
    const { content } = await api('GET', '/api/scratch?mode=' + mode);
    if (mode === 'text') await bodyReady();
    openEditor({ tab, scratch: true, mode, path: null, dir: undefined, title: '', content, meta: {}, autoTitle: false });
    scratchFocus();
  } catch (e) {
    showErr(e);
  }
}
export const openSketch = (tab: string | null = null) => openScratch(tab, 'board');

export async function openThought(path: string, tab: string | null = null) {
  if (S.open?.path === path) return body?.focus();
  const t = S.thoughts.get(path);
  if (!t) return;
  if (t.code || t.file) return page.openInTab(path, { beside: !tab });
  await flushNow();
  try {
    const { content, mtime = null } = await api('GET', '/api/file?path=' + encodeURIComponent(path));
    openEditor({ tab, path, dir: t.dir, board: t.board, title: t.title, reqTitle: t.title, content, disk: content, mtime, touched: t.touched, meta: {}, autoTitle: false });
    t.meta.seen = Date.now();
    quietly(api('PUT', '/api/meta', { path, kind: 'file', patch: { seen: t.meta.seen } }));
  } catch (e) {
    showErr(e);
  }
}

function fitWeb() {
  const web = $('#ed-web') as HTMLDetailsElement, panel = web.querySelector<HTMLElement>('.more-body')!;
  if (web.open && S.open?.board) lift(panel, () => web.querySelector('summary'), { side: 'down', align: 'end', away: () => (web.open = false) });
  else land(panel);
}
$('#ed-web').addEventListener('toggle', fitWeb);

function openEditor(o: OpenFile) {
  S.open = o;
  $('#ed-title').value = o.autoTitle ? '' : o.title;
  if (o.board) span('editor.board', () => board.load(o.content));
  else if (o.scratch && !isText(o)) span('editor.sketch', () => pad.load(o.content));
  else if (body) span('editor.text', () => setBody(o.content));
  showClash();
  $('#ed-web').open = !o.board && store.get('webOpen', false);
  fitWeb();
  updateTitleHint();
  renderEditorMeta();
  lock();
  if (syncKey(o)) send('want', { lvl: levelKey(), path: syncKey(o) });
  page.render();
}

const syncKey = (o: OpenFile | null | undefined) => (o?.scratch ? (isText(o) ? ':scratch:text' : ':scratch') : o?.path ? o.path : null);
let sendTimer = 0;
function tell() {
  const o = S.open!, key = syncKey(o);
  if (!key) return;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => S.open === o && send('text', { kind: o.board ? 'board' : 'note', lvl: levelKey(), path: key, content: o.content, title: o.title, autoTitle: o.autoTitle }), 40);
}
on('text', (m) => {
  const o = S.open;
  if (m.lvl !== levelKey() || !o || syncKey(o) !== m.path || (m.kind === 'board') !== !!o.board || m.kind === 'text') return;
  o.content = m.content;
  if (o.board) board.load(m.content, true);
  else if (o.scratch && !isText(o)) pad.load(m.content, true);
  else if (body) setBody(m.content);
  if (!o.scratch && m.title !== o.title) {
    o.title = m.title;
    o.autoTitle = !!m.autoTitle;
    $('#ed-title').value = o.autoTitle ? '' : o.title;
  }
  updateTitleHint();
  renderLinks();
});
on('want', (m) => {
  const o = S.open;
  if (m.lvl === levelKey() && o && syncKey(o) === m.path && (o.dirtyContent || o.dirtyTitle)) tell();
});
on('moved', (m) => {
  const o = S.open;
  if (m.lvl !== levelKey() || !o?.path || (o.path !== m.from && !o.path.startsWith(m.from + '/'))) return;
  o.path = m.to + o.path.slice(m.from.length);
  o.reqTitle = effTitle(o);
});
function lock() {
  const o = S.open, n = o?.path ? lockOf(levelKey(), o.path) : 0;
  bodyLocked = $('#ed-title').readOnly = !!n;
  for (const el of [$('#ed-bodywrap'), $('#ed-board')]) {
    el.classList.toggle('locked', !!n);
    el.dataset.lock = n ? lockText(n) : '';
  }
}
onLock(lock);

function updateTitleHint() {
  const o = S.open;
  if (o?.board) $('#ed-title').placeholder = 'board title';
  else if (o) $('#ed-title').placeholder = o.autoTitle ? derive(o.content) || 'title (or just start typing below)' : 'title';
}

export async function closeEditor() {
  await flushNow();
  closeEditorNow();
}

export function openMoved(from: string, to: string, { dir, title }: { dir?: string; title?: string } = {}) {
  const o = S.open;
  if (!o?.path) return;
  const fix = <T extends string | null | undefined>(p: T): T => (typeof p === 'string' && (p === from || p.startsWith(from + '/')) ? (to + p.slice(from.length)) as T : p);
  o.path = fix(o.path);
  o.dir = fix(o.dir);
  if (o.path !== to) return;
  if (dir != null) o.dir = dir;
  if (title == null) return;
  o.title = o.reqTitle = title;
  if (!o.autoTitle) $<HTMLInputElement>('#ed-title').value = title;
}
export function closeEditorNow() {
  if (!S.open) return;
  flushNow();
  S.open = null;
  page.render();
}

const labelOf = (o: OpenFile) => (o.scratch ? (isText(o) ? 'the scratch pad' : 'the sketch board') : effTitle(o) || 'a new board');

function scheduleSave() {
  clearTimeout(S.saveTimer);
  if (S.open) unsaved(S.open, labelOf(S.open));
  page.keepTab(S.open?.tab as string | undefined);
  S.saveTimer = setTimeout(flushNow, 600);
}

export function flushNow() {
  clearTimeout(S.saveTimer);
  return flushOf(S.open);
}
const flushOf = (o: OpenFile | null): Promise<unknown> => queue(() => flush(o));
const queue = (fn: () => unknown) => (S.saving = S.saving.then(fn));

const DIRTY = ['dirtyContent', 'dirtyTitle'];
async function flush(o: OpenFile | null) {
  if (!o) return;
  const was = DIRTY.map((k) => o[k]);
  let changed;
  try {
    changed = await write(o);
    saved(o);
    if (o.dirtyContent || o.dirtyTitle) unsaved(o, labelOf(o));
  } catch (e: any) {
    DIRTY.forEach((k, i) => (o[k] ||= was[i]));
    if (e.status === 409) return fromDisk(o, e).catch((e2) => unsaved(o, labelOf(o), e2, () => flushOf(o)));
    return unsaved(o, labelOf(o), e, () => flushOf(o));
  }
  if (changed.length) await page.reload(changed.filter((p) => p != null)).catch(showErr);
}

async function fromDisk(o: OpenFile, e: any = null) {
  const r = await api('GET', '/api/file?path=' + encodeURIComponent(o.path!));
  if (!o.dirtyContent && r.content === o.content && r.content !== o.disk) {
    o.disk = r.content;
    o.mtime = r.mtime;
    return;
  }
  if (r.content === o.disk) {
    o.mtime = r.mtime;
    if (e) flushOf(o);
    return;
  }
  if (!o.dirtyContent) {
    return take(o, r);
  }
  o.clash = true;
  showClash();
  unsaved(o, labelOf(o), e || Object.assign(new Error('changed on disk'), { status: 409 }), () => queue(() => fromDisk(o).catch(showErr)));
}
function take(o: OpenFile, r: { content: string; mtime: number }) {
  o.content = o.disk = r.content;
  o.mtime = r.mtime;
  o.dirtyContent = o.clash = false;
  if (S.open !== o) return;
  showClash();
  if (o.board) return board.load(o.content);
  if (body) setBody(o.content);
  updateTitleHint();
  renderLinks();
}
const showClash = () => ($('#ed-disk').hidden = !S.open?.clash);

export function checkDisk() {
  const o = S.open!, t = (o?.path && S.thoughts.get(o.path)) as Note | undefined;
  if (!t?.mtime || o.mtime == null || o.clash || Math.abs(t.mtime - o.mtime) < 2) return;
  queue(() => quietly(fromDisk(o)));
}

$('#ed-disk').addEventListener('click', (e: MouseEvent) => {
  const o = S.open, pick = (e.target as Element).closest<HTMLElement>('[data-disk]')?.dataset.disk;
  if (!o || !pick) return;
  if (pick === 'keep') {
    o.mtime = null;
    o.dirtyContent = true;
    o.clash = false;
    showClash();
  } else queue(() => api('GET', '/api/file?path=' + encodeURIComponent(o.path!)).then((r) => take(o, r), showErr));
  flushNow();
});

async function write(o: OpenFile) {
  if (o.scratch) {
    if (!o.dirtyContent) return [];
    o.dirtyContent = false;
    await api('PUT', '/api/scratch', { content: o.content, mode: o.mode });
    return [];
  }
  if (!o.path) {
    if (o.board ? !o.dirtyContent && !o.title.trim() : !o.content.trim() && !o.title.trim()) return [];
    const title = effTitle(o);
    o.dirtyContent = o.dirtyTitle = false;
    const content = o.content;
    const r = await api('POST', '/api/file', { dir: o.dir, title, content, kind: o.board ? 'board' : undefined });
    o.path = r.path;
    o.reqTitle = title;
    o.disk = content;
    o.mtime = r.mtime ?? null;
    if (S.open === o) renderEditorMeta();
    return [o.path];
  }
  const changed: string[] = [];
  if (o.dirtyContent) {
    o.dirtyContent = false;
    const content = o.content;
    const r = await api('PUT', '/api/file', { path: o.path, content, mtime: o.mtime ?? undefined });
    o.disk = content;
    o.mtime = r.mtime ?? null;
    changed.push(o.path);
  }
  if (o.dirtyTitle) {
    o.dirtyTitle = false;
    const want = effTitle(o);
    if (want !== o.reqTitle) {
      const r = await api('POST', '/api/rename', { path: o.path, name: want });
      o.reqTitle = want;
      page.moved(o.path, r.path);
      changed.push(o.path, r.path);
      o.path = r.path;
    }
  }
  return changed;
}

const pad = createPad($('#ed-pad'), {
  onChange() {
    const o = S.open, was = o?.content;
    if (!o?.scratch || isText(o) || pad.serialize() === was) return;
    o.content = pad.serialize();
    o.dirtyContent = true;
    scheduleSave();
    tell();
    record('sketch', 'changed the sketch board', { before: was, after: o.content }, 'sketch');
  },
  onShow(rel: string) {
    const root = projectOf(S.pid)?.path?.replace(/[\\/]+$/, '');
    if (root) api('POST', '/api/show-path', { path: `${root}\\${rel.split('/').join('\\')}` }).catch(showErr);
  },
});

const board = createBoard($('#ed-board'), {
  onChange() {
    const o = S.open;
    if (!o?.board) return;
    o.content = board.serialize();
    o.dirtyContent = true;
    scheduleSave();
    tell();
  },
  onPress: () => ($('#ed-web').open = false),
});
$('#ed-wide').addEventListener('click', () => {
  S.boardWide = !S.boardWide;
  page.layout();
});

$('#ed-title').addEventListener('input', (e: Event) => {
  const o = S.open;
  if (!o) return;
  o.title = (e.target as HTMLInputElement).value;
  o.autoTitle = !o.title.trim();
  o.dirtyTitle = true;
  updateTitleHint();
  scheduleSave();
  tell();
});

function typed() {
  const o = S.open;
  if (!o) return;
  const was = o.content;
  o.content = bodyText();
  o.dirtyContent = true;
  if (o.autoTitle) {
    o.dirtyTitle = true;
    updateTitleHint();
  }
  renderLinks();
  scheduleSave();
  tell();
  if (o.path) {
    const line = body!.state.doc.lineAt(body!.state.selection.main.head).number;
    record('typing', `typed in “${labelOf(o)}” at line ${line}`, { path: o.path, line });
  }
  if (isText(o) && was !== o.content) record('scratch', 'typed in the scratch pad', { before: was, after: o.content }, 'scratch');
}

$('#ed-where').addEventListener('change', (e: Event) => {
  const o = S.open;
  if (!o) return;
  if (o.path) moveItem(o.path, (e.target as HTMLSelectElement).value);
  else {
    o.dir = (e.target as HTMLSelectElement).value;
    setCtx(o.dir);
    renderEditorMeta();
    page.render();
  }
});

$('#ed-close').addEventListener('click', closeEditor);

$('#ed-trash').addEventListener('click', async () => {
  const o = S.open;
  if (!o) return;
  if (!o.path) return closeEditorNow();
  await flushNow();
  try {
    await api('POST', '/api/archive', { path: o.path });
    S.open = null;
    setSave(`archived “${effTitle(o)}” · 4 opens the archive`);
  } catch (e) {
    showErr(e);
  }
  page.reload();
});

const atts = (text: string) => ({
  imgs: imgsIn(text),
  files: fileLinks(text, (rel) => S.thoughts.has(rel)),
});
const nameOf = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1);
let attsShown = null as string | null;
function renderAtts() {
  const o = S.open, el = $('#ed-atts');
  const { imgs, files } = o && !o.board ? atts(o.content) : { imgs: [], files: [] };
  const now = [levelKey(), ...imgs, '', ...files].map((a) => a.rel ?? a).join('\n');
  if (now === attsShown) return;
  attsShown = now;
  const x = (kind: string, i: number) => `<button type="button" class="x" data-edunatt="${kind}${i}" aria-label="remove">✕</button>`;
  el.innerHTML =
    imgs.map((a, i) => `<span class="ed-att"><button type="button" class="nm" data-edview="${esc(a.rel)}" title="${esc(nameOf(a.rel))}" data-tip-cut="span"><img src="${esc(imgUrl(a.rel))}" alt=""><span>${esc(nameOf(a.rel))}</span></button>${x('i', i)}</span>`).join('') +
    files.map((a, i) => `<span class="ed-att"><button type="button" class="nm" data-open="${esc(a.rel)}" data-tip-mono title="${esc(`${a.rel}\nA file linked in this note. Click to open it.`)}"><i class="g">${gem('file')}</i><span>${esc(nameOf(a.rel))}</span></button>${x('f', i)}</span>`).join('');
  el.hidden = !imgs.length && !files.length;
}

let body = null as EditorView | null, made = null as Promise<void> | null;
let quiet = false;
let bodyLocked = false;
const bodyText = () => body?.state.doc.toString() ?? '';
const fbx = {
  get: () => ({ text: { slice: (a: number, b: number) => body!.state.sliceDoc(Math.max(0, a), Math.min(b, body!.state.doc.length)) }, from: body!.state.selection.main.from, to: body!.state.selection.main.to }),
  put: (from: number, to: number, insert: string, a: number, b: number) => body!.dispatch({ changes: { from, to, insert }, selection: { anchor: a, head: b }, userEvent: 'input' }),
  at() {
    const c = body!.coordsAtPos(body!.state.selection.main.head) || body!.dom.getBoundingClientRect();
    return { x: c.left, y: c.bottom, top: c.top };
  },
};
function bodyReady() {
  made ??= noteView($('#ed-body'), '', (L) => [
    L.keymap.of([
      { key: 'Mod-b', run: () => fmtKey(fbx, { ctrlKey: true, key: 'b' }) },
      ...['Mod-z', 'Mod-y', 'Mod-Shift-z'].map((key) => ({ key, run: () => true })),
    ]),
    L.placeholder(`Jot anything here. Select some text and press "+ file" to make it a file of its own.`),
    L.EditorView.updateListener.of((u) => {
      if (u.docChanged && !quiet) typed();
    }),
    L.EditorState.transactionFilter.of((tr) => (bodyLocked && tr.docChanged && !quiet ? [] : tr)),
    L.EditorView.domEventHandlers({
      paste(e) {
        const files = pastedImages(e);
        if (!files.length) return false;
        e.preventDefault();
        addImages(files);
        return true;
      },
      drop: (e) => ['application/x-pm-tab', 'application/x-pm-file', 'Files'].some((k) => e.dataTransfer?.types.includes(k)) || !!S.dragging?.startsWith('file:'),
      mousedown(e, v) {
        if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return false;
        const at = v.posAtCoords({ x: e.clientX, y: e.clientY }), l = at != null && linkAt(bodyText(), at);
        if (!l) return false;
        e.preventDefault();
        const go = $('#editor').classList.contains('docked') ? (p: string) => page.openInTab(p, { beside: true }) : openThought;
        follow(here(l.href, S.open?.dir), { out: e.shiftKey, openFile: go });
        return true;
      },
      contextmenu(e, v) {
        const at = v.posAtCoords({ x: e.clientX, y: e.clientY }), l = at != null && linkAt(bodyText(), at);
        const go = $('#editor').classList.contains('docked') ? (p: string) => page.openInTab(p, { beside: true }) : openThought;
        return !!l && linkMenu(e, here(l.href, S.open?.dir), { openFile: go });
      },
    }),
  ]).then((v) => {
    body = v;
    (fbx as typeof fbx & { el?: HTMLElement }).el = v.dom;
    attach(fbx, { keys: false });
    const split = () => setTimeout(splitButton, 0);
    v.dom.addEventListener('keyup', split);
    onSelEnd(v.dom, split);
    v.dom.addEventListener('focusout', () => ($('#ed-sel').hidden = true));
  });
  made.catch(() => (made = null));
  return made;
}
function setBody(to: string) {
  const old = bodyText();
  let a = 0, b = 0;
  while (a < old.length && a < to.length && old[a] === to[a]) a++;
  while (b < old.length - a && b < to.length - a && old[old.length - 1 - b] === to[to.length - 1 - b]) b++;
  if (a === old.length && a === to.length) return;
  quiet = true;
  body!.dispatch({ changes: { from: a, to: old.length - b, insert: to.slice(a, to.length - b) } });
  quiet = false;
}
export const scratchSel = () => (body ? { start: body.state.selection.main.from, end: body.state.selection.main.to } : { start: 0, end: 0 });
export function putScratchSel(start: number, end = start) {
  const n = body?.state.doc.length;
  if (n != null) body!.dispatch({ selection: { anchor: Math.min(start, n), head: Math.min(end, n) }, scrollIntoView: true });
}
export const focusScratch = (o?: FocusOptions) => (body as (EditorView & { focus(o?: FocusOptions): void }) | null)?.focus(o);
export const scratchCaretY = (at: number) => (body?.coordsAtPos(at)?.top ?? 0) - $('#ed-bodywrap').getBoundingClientRect().top;

function addToText(line: string) {
  if (!S.open || !body || bodyLocked) return;
  const t = bodyText();
  body.dispatch({ changes: { from: t.length, insert: (t && !t.endsWith('\n') ? '\n' : '') + line } });
}
async function addImages(files: File[]) {
  for (const p of await saveImages(files)) addToText(imgLink(p));
}
$('#ed-bodywrap').addEventListener('dragover', (e: DragEvent) => {
  if (e.dataTransfer?.types.includes('Files') || S.dragging?.startsWith('file:')) e.preventDefault();
});
$('#ed-bodywrap').addEventListener('drop', (e: DragEvent) => {
  const rel = S.dragging?.startsWith('file:') ? S.dragging.slice(5) : null;
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length && !(rel && S.thoughts.has(rel))) return;
  e.preventDefault();
  e.stopPropagation();
  const pdfs = files.filter((f) => /\.pdf$/i.test(f.name)), paths = pdfs.map((f) => window.amethyst?.pathOf?.(f)).filter(Boolean);
  if (paths.length) page.openFiles(paths as string[]);
  if (files.length) addImages(files.filter((f) => !paths.length || !pdfs.includes(f)));
  else addToText(`@${rel}`);
});
$('#ed-atts').addEventListener('click', (e: MouseEvent) => {
  const o = S.open, b = (e.target as Element).closest<HTMLElement>('[data-edview],[data-edunatt]');
  if (!o || !b) return;
  if (b.dataset.edview) return viewImage(imgUrl(b.dataset.edview));
  const { imgs, files } = atts(o.content), k = b.dataset.edunatt!;
  const a = (k[0] === 'i' ? imgs : files)[+k.slice(1)];
  if (!a || !body) return;
  const t = o.content;
  let from = a.from, to = a.to;
  if (t[from - 1] === '\n' && (to >= t.length || t[to] === '\n')) from--;
  else if (from === 0 && t[to] === '\n') to++;
  else if (t[from - 1] === ' ') from--;
  body.dispatch({ changes: { from, to } });
});

export function renderLinks() {
  renderAtts();
}

function splitButton() {
  const b = $('#ed-sel'), { from, to } = body!.state.selection.main;
  $('#ed-split').hidden = isOff('fmt:off', 'file');
  $('#ed-chat').hidden = isOff('fmt:off', 'chat');
  b.hidden = !(isText(S.open) && body!.dom.contains(document.activeElement) && body!.state.sliceDoc(from, to).trim()) || ($('#ed-split').hidden && $('#ed-chat').hidden);
  if (b.hidden) return;
  const fb = $('#fmt-bar'), wrap = $('#ed-bodywrap'), wr = wrap.getBoundingClientRect();
  let x, y;
  if (fb && !fb.hidden) {
    const r = fb.getBoundingClientRect(), after = r.right - wr.left - 1 + b.offsetWidth <= wrap.clientWidth;
    x = after ? r.right - wr.left - 1 : r.left - wr.left + 1 - b.offsetWidth;
    y = r.top - wr.top;
    fb.dataset.join = b.dataset.join = after ? 'after' : 'before';
  } else {
    delete b.dataset.join;
    const c = body!.coordsAtPos(to) || body!.dom.getBoundingClientRect();
    x = c.left - wr.left;
    y = Math.min(c.bottom - wr.top + 2, $('#ed-body').getBoundingClientRect().bottom - wr.top - b.offsetHeight);
  }
  b.style.top = y + 'px';
  b.style.left = Math.max(0, Math.min(x, wrap.clientWidth - b.offsetWidth)) + 'px';
}
$('#ed-sel').addEventListener('mousedown', (e: MouseEvent) => e.preventDefault());
$('#ed-sel').addEventListener('contextmenu', (e: MouseEvent) => {
  e.preventDefault();
  hideMenu(e.clientX, e.clientY, 'fmt');
});
$('#ed-split').addEventListener('click', () => splitSelection().catch(showErr));
$('#ed-chat').addEventListener('click', () => chatSelection());
$('#ed-chat').addEventListener('contextmenu', (e: MouseEvent) => agentRight('text', e, (k) => chatSelection(k), ['all formatting bar buttons', () => hideMenu(e.clientX, e.clientY, 'fmt'), ICONS.fmtBar]));

function chatSelection(program = '') {
  const { start, end } = scratchSel(), raw = bodyText().slice(start, end), text = raw.trim();
  if (!text || !isText(S.open)) return;
  page.chatFromText($('#ed-chat'), text, (said) => {
    if (S.open?.scratch && bodyText().slice(start, end) === raw) cutScratch(start, end, `${said} from the scratch`, { sent: true });
    else setSave(`${said}; the scratch changed meanwhile, so the text stays in it`);
  }, program);
}
function cutScratch(start: number, end: number, line: string, more: Partial<ScratchStep>) {
  body!.focus();
  const before = bodyText();
  quiet = true;
  body!.dispatch({ changes: { from: start, to: end + (before[end] === '\n' ? 1 : 0) }, selection: { anchor: start } });
  quiet = false;
  S.open!.content = bodyText();
  typed();
  record('scratch', line, { before, after: bodyText(), ...more }, 'scratch');
}

async function splitSelection(start = scratchSel().start, end = scratchSel().end) {
  const text = bodyText().slice(start, end).trim();
  if (!text || !isText(S.open)) return;
  $('#ed-sel').hidden = true;
  const dir = inboxLoc();
  const oneLine = !text.includes('\n');
  const guess = (oneLine ? text.replace(/^[#\-*>\s]+/, '') : derive(text)).slice(0, 60).trim();
  const name = await page.nameInTree({ dir, kind: 'file', ext: '.md', value: guess + '.md' });
  if (!name) return putScratchSel(start, end);
  await flushNow();
  const r = await api('POST', '/api/file', { dir, name, content: oneLine ? '' : text });
  await page.reload();
  const made = S.thoughts.get(r.path)?.title ?? name;
  cutScratch(start, end, `“${made}” made from the scratch`, { made: { ops: [{ op: 'made', path: r.path }] } });
  setSave(`new file in ${dirLabel(dir)}: ${made}`);
}

function expectScratch(text: string) {
  if (S.open?.content !== text) throw new Error('it changed since');
}
function putScratch(to: string) {
  const o = S.open!;
  o.content = to;
  if (isText(o)) {
    const old = bodyText();
    let tail = 0;
    while (tail < old.length && tail < to.length && old.at(-1 - tail) === to.at(-1 - tail)) tail++;
    setBody(to);
    body!.focus();
    putScratchSel(to.length - tail);
  } else pad.load(to, true);
  o.dirtyContent = true;
  scheduleSave();
  tell();
  return flushNow();
}
const SCRATCH_UNDO = {
  async undo(d: ScratchStep) {
    expectScratch(d.after);
    let stays = false;
    if (d.made) await runOps(d.made, true).catch(() => (stays = true));
    await putScratch(d.before);
    return stays ? 'the text is back; its file stays where it is' : d.sent ? 'the text is back; the chat keeps what it got' : undefined;
  },
  async redo(d: ScratchStep) {
    expectScratch(d.before);
    if (d.made) await runOps(d.made, false);
    await putScratch(d.after);
  },
  merge: (a: ScratchStep, b: ScratchStep, age: number) => age < 1200 && !a.made && !b.made && !a.sent && !b.sent && { before: a.before, after: b.after },
};
undoer('scratch', SCRATCH_UNDO);
undoer('sketch', SCRATCH_UNDO);
