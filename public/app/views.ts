import { drawerOpen, madeStep, narrowQ, moveDir, moveItem, pinOrder, resetOrder, selectDir, selectInbox, showSide, sideHere, sideOver } from './actions.ts';
import { setOn } from '../decks/deck.ts';
import { ask, barMenu, hideMenu, ICONS, isOpen, keepShown, rowIcons, setOpen, sortable, treeRows } from '../base/controls.ts';
import type { TreeRow } from '../base/controls.ts';
import { onSize } from '../base/measure.ts';
import { markdown } from '../base/markdown.ts';
import { span } from '../base/hitch.ts';
import { tell } from '../base/notify.ts';
import { isOff, onPref, pref } from '../base/prefs.ts';
import { onExtColors } from '../base/filelook.ts';
import { renderWsx } from './wsx.ts';
import { checkDisk, renderLinks, renderWhere } from '../editor/editor.ts';
import { gitCount, gitShow, renderGit } from '../git/git.ts';
import { renderSetup } from '../setup/setup.ts';
import { ghNote, renderGithub } from '../github/ghpanel.ts';
import { handle, runWeb, web } from '../minds/minds.ts';
import { follow } from '../base/stream.ts';
import { renderModes } from './modes.ts';
import { filesUnder, placeFiles, setAutoUnder } from '../orch/orch.ts';
import { placeAll } from './places.ts';
import { renderPins } from './pins.ts';
import { onPjHidden, pjHidden, setPjHidden } from './pjhide.ts';
import { icon } from '../base/icon.ts';
import { api, atLaunch, atWs, dirGem, dirLabel, gemOf, HOME, inboxLoc, inboxTint, levelKey, load, matches, patch, mode, pjColor, projectOf, rawUrl, S, setLayout, sizeOf, tintOf, within } from '../base/model.ts';
import { page } from '../base/page.ts';
import { deselect, placePanels } from './panel.ts';
import { col } from '../base/theme.ts';
import { $, ago, AM, amElse, amKey, amTag, esc, parentOf, setSave, showErr, store, uid } from '../base/util.ts';
import { gem, NAME, NAMES } from '../base/kinds.ts';
import { archiveTop } from './archlook.ts';
import { level as tabsLevel, place, revealWaiting } from './groups.ts';
import { mindInUse, mindsShown, openQuick, prune, renamed, shows, TYPES, unfoldTo, edAt } from './tabs.ts';
import { on, POP, send, SOLO, WIN } from '../base/windows.ts';
import { everyFrom, everyOn, paintEvery } from './every.ts';
import type { Cb } from '../minds/paint.ts';
import type { Folder, Note, Project, WorkspaceEntry } from '../base/types.ts';
import { dropGoneFocus, focused } from '../focus/focus.ts';
import { paintFocusButton } from '../focus/focusbtn.ts';

type GitEv = { type: 'git'; n: number; branch: string | null };
type Held = { paths: Set<string>; all?: boolean; count?: GitEv };
type FilesEv = { type?: 'files'; all?: boolean; paths?: string[]; git?: boolean } | GitEv;

let asked = 0, running: Promise<boolean> | null = null, next: Promise<unknown> | null = null;
let want: Set<string> | null | undefined;
const wantMore = (paths: Iterable<string> | null | undefined) => (want = paths && want !== null ? new Set([...(want ?? []), ...paths]) : null);
export function reload(paths?: string[] | Set<string>) {
  asked++;
  wantMore(Array.isArray(paths) || paths instanceof Set ? paths : undefined);
  if (!running) return start();
  return (next ||= running.catch(() => {}).then(() => ((next = null), start())));
}
export function reloadAll(paths?: string[] | Set<string>) {
  send('files', { lvl: levelKey(), ...(paths ? { paths: [...paths] } : {}) });
  return reload(paths);
}
function start() {
  const n = asked, job = want;
  want = undefined;
  running = refresh(() => n === asked, job).finally(() => (running = null));
  return running.then((drawn) => drawn || next);
}
async function refresh(keep: () => boolean, job: Set<string> | null | undefined) {
  const q = S.query, hits = q && searchHits(q);
  let back: 'full' | boolean | null = job ? await patch([...job], keep) : 'full';
  if (back === 'full') back = await load(keep);
  if (back === null) return wantMore(job), false;
  if (back) {
    web.level(levelKey());
    tabsLevel();
    sent = {};
  }
  if (atLaunch()) return render(), true;
  if (hits) {
    const h = await hits;
    if (q === S.query) S.hits = h as Set<string>;
  }
  prune();
  dropGoneFocus();
  render();
  if (shows('archive')) loadArchive();
  if (S.open) {
    if (!job || job.has(S.open.path!)) checkDisk();
    renderLinks();
  }
  return true;
}

let seen = new Set<string>();
export const sideShown = () => (sideOver() ? drawerOpen() : S.side);
export const sidePlace = () => {
  const m = mode();
  return { mode: m, place: (m === 'editor' ? edAt() : setOn(m)) || '' };
};
const sideKey = (p = sidePlace()) => `${atLaunch() ? '' : levelKey()}${amKey}${WIN > 1 ? '#' + WIN : ''}:${p.mode}:${p.place}`;
barMenu('#editor > .foot', 'edfoot', {
  make: () => {
    const o = S.open, board = !!o?.board, wide = board && !o?.tab;
    const name = o?.scratch ? (o.mode === 'board' ? 'sketch board' : 'scratch pad') : o?.title || o?.path?.split('/').pop() || (board ? 'board' : 'file');
    return { name, ic: gem(o?.scratch ? (o.mode === 'board' ? 'sketch' : 'scratch') : board ? 'board' : 'file'), items: wide ? [['tab', 'tab'], ['wide', 'wide']] : [['tab', 'tab']] };
  },
});
barMenu('#editor > #ed-head', '');
rowIcons({ 'edfoot:off:tab': () => '<b class="tb-tx">⇥</b>', 'edfoot:off:wide': () => '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5l2.5 2.5-2.5 2.5"/></svg>' });
export function sideNow() {
  const app = $('#app');
  sideHere(sideKey());
  const wsed = S.wsEditor && mode() === 'editor';
  app.classList.toggle('side-hidden', !sideShown() || wsed);
  app.classList.toggle('side-over', sideOver());
  app.classList.toggle('scm', S.sideView === 'git');
  app.classList.toggle('setup', S.sideView === 'setup');
  app.classList.toggle('ghv', S.sideView === 'github');
  $('#btn-index').classList.toggle('on', sideShown() && S.sideView === 'tree');
  $('#btn-git').classList.toggle('on', sideShown() && S.sideView === 'git');
  $('#btn-setup').classList.toggle('on', sideShown() && S.sideView === 'setup');
  $('#btn-github').classList.toggle('on', sideShown() && S.sideView === 'github');
  revealWaiting();
}
export function layout() {
  const app = $('#app'), o = S.open;
  sideNow();
  app.classList.toggle('ws', atWs());
  app.classList.toggle('launch', atLaunch());
  app.classList.toggle('wsed', S.wsEditor && mode() === 'editor');
  app.classList.toggle('wsx', atWs() && !atLaunch() && sideShown() && S.sideView === 'tree');
  renderWsx();
  const bt = $<HTMLElement>('#side > .bt'), ex = S.sideView !== 'git' && S.sideView !== 'setup' && S.sideView !== 'github';
  bt.textContent = ({ git: 'Source control', setup: 'Agent Setup', github: 'GitHub' } as Record<string, string>)[S.sideView] || 'Explorer';
  bt.classList.toggle('opts', ex);
  bt.title = ex ? 'Explorer options\nWhat the explorer shows, and how.' : '';
  const ed = $('#editor').classList;
  ed.toggle('no-tab', isOff('edfoot:off', 'tab'));
  ed.toggle('no-wide', isOff('edfoot:off', 'wide'));
  ed.toggle('docked', !!o?.tab);
  ed.toggle('board-mode', !!o?.board);
  ed.toggle('board-wide', !!o?.board && !o.tab && S.boardWide);
  ed.toggle('scratch-mode', !!o?.scratch);
  ed.toggle('scratch-text', !!o?.scratch && o.mode === 'text');
  $('#ed-tab').hidden = !o || !!o.tab || (!o.path && !o.scratch);
  $('#btn-scratch').classList.toggle('on', !!o?.scratch && o.mode === 'text');
  $('#btn-sketch').classList.toggle('on', !!o?.scratch && o.mode === 'board');
  place();
  placePanels();
  placeAll();
  fitOrch();
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('on', shows((b as HTMLElement).dataset.view!));
  const now = new Set(['archive'].filter(shows));
  runWeb(mindsShown());
  if (now.has('archive') && !seen.has('archive')) loadArchive();
  seen = now;
}

const px = (v: string) => parseFloat(v) || 0;
const flowW = (e: Element) => {
  const cs = getComputedStyle(e);
  return cs.display === 'none' || cs.display === 'contents' || cs.position === 'absolute' ? -1 : (e as HTMLElement).offsetWidth;
};
function underIf(on: boolean) {
  const app = $('#app');
  setAutoUnder(on);
  const want = app.classList.contains('orch') && filesUnder();
  if (want === app.classList.contains('orch-under')) return;
  app.classList.toggle('orch-under', want);
  placeFiles();
}
function fitOrch() {
  const app = $('#app'), shell = $('#shell'), st = app.style;
  const rail = [...document.querySelectorAll<HTMLElement>('#decks .oc:not([hidden]) > .oc-rail')].find((e) => e.offsetParent);
  if (!app.classList.contains('orch') || (!rail && !app.classList.contains('orch-nolist'))) {
    underIf(false);
    for (const k of ['--side-l', '--side-mw', '--pins-r', '--pins-mw']) st.removeProperty(k);
    return;
  }
  const gap = px(getComputedStyle(shell).columnGap), ac = getComputedStyle(app), ar = app.getBoundingClientRect();
  const end = ar.right - px(ac.paddingRight) - px(ac.borderRightWidth);
  if (app.classList.contains('orch-files')) {
    const main = $('#main'), ws = [...shell.children].filter((e) => e !== main).map(flowW).filter((w) => w >= 0);
    const need = ws.reduce((a, w) => a + w, 0) + (rail?.offsetWidth || 0) + px(ac.getPropertyValue('--oc-chat-min')) + px(ac.getPropertyValue('--oc-files-min')) + gap * (ws.length + 2);
    underIf(need > end - shell.getBoundingClientRect().left + 0.5 || ar.height > ar.width);
  } else underIf(false);
  if (!rail) {
    for (const k of ['--side-l', '--side-mw', '--pins-r', '--pins-mw']) st.removeProperty(k);
    return;
  }
  const s = { left: shell.getBoundingClientRect().left, right: end }, r = rail.getBoundingClientRect(), a = $('#activity').getBoundingClientRect();
  const left = (a.width ? a.right : s.left) - s.left;
  if (r.left - s.left - left <= gap * 2 + 1) {
    st.setProperty('--side-l', `${r.right - s.left + gap}px`);
    st.setProperty('--side-mw', `${s.right - r.right - gap * 2}px`);
  } else {
    st.removeProperty('--side-l');
    st.setProperty('--side-mw', `${r.left - s.left - left - gap * 2}px`);
  }
  if (s.right - r.right <= gap + 1) {
    st.setProperty('--pins-r', `${s.right - r.left + gap}px`);
    st.setProperty('--pins-mw', `${r.left - s.left - left - gap * 2}px`);
  } else {
    st.removeProperty('--pins-r');
    st.setProperty('--pins-mw', `${s.right - r.right - gap * 2}px`);
  }
}
onSize($('#shell'), { name: 'orch.fit', write: fitOrch });
narrowQ.addEventListener('change', () => layout());

export function moved(from: string, to: string, tell = true) {
  web.renamePath(from, to);
  renamed(from, to);
  if (tell) send('moved', { lvl: levelKey(), from, to });
}

let drew = false, again = false;
export function render() {
  if (drew && !document.hidden) return void (again = true);
  if (!drew) {
    drew = true;
    requestAnimationFrame(() => {
      drew = false;
      if (again) {
        again = false;
        render();
      }
    });
  }
  return span('render', draw);
}
function draw() {
  span('render.layout', layout);
  span('render.modes', renderModes);
  span('render.pins', renderPins);
  span('render.fit', fitOrch);
  span('render.git', renderGit);
  span('render.setup', renderSetup);
  span('render.github', renderGithub);
  span('render.files', followFiles);
  followNote();
  if (atLaunch()) {
    span('render.launch', renderLaunch);
    return span('render.here', renderHere);
  }
  if (atWs()) {
    span('render.start', renderStart);
    return span('render.here', renderHere);
  }
  if (!S.data) return span('render.here', renderHere);
  span('render.tree', renderTree);
  span('render.list', renderList);
  span('render.where', renderWhere);
  span('render.here', renderHere);
  span('render.web', toWeb);
}

let sent: any = {};
function toWeb() {
  const color = pjColor(projectOf(S.pid));
  if (sent.data !== S.data || sent.color !== color) {
    web.setData({ roots: S.roots, inbox: S.inbox, layout: S.data!.layout, color });
    Object.assign(sent, { data: S.data, color });
  }
  const now = { open: S.open?.path ?? null, ctx: S.ctx };
  const v: Record<string, any> = {};
  for (const [k, x] of Object.entries(now)) if (!sent.view || sent.view[k] !== x) v[k] = x;
  if (!sent.view || sent.view.query !== S.query || sent.view.hits !== S.hits) v.match = S.query ? (p: string) => matches(S.thoughts.get(p) ?? { title: '' }) : null;
  sent.view = { ...now, query: S.query, hits: S.hits };
  if (Object.keys(v).length) web.setView(v);
}

let filesOf: string | null = null, stopFiles: (() => void) | null = null, held: Held | null = null;
function filesChanged(e: FilesEv) {
  if (document.hidden) {
    held ??= { paths: new Set() };
    if (e.type === 'git') held.count = e;
    else if (e.all || !e.paths) held.all = true;
    else e.paths.forEach((p) => held!.paths.add(p));
    return;
  }
  if (e.type === 'git') return void gitCount(e);
  if ((e as { type?: string; what?: string }).type === 'gitshow' && (e as { what?: string }).what === 'note') return void ghNote(e as any);
  if ((e as { type?: string }).type === 'gitshow') return void gitShow(e as any);
  if (e.all || !e.paths) reload().catch(showErr);
  else if (e.paths.length) reload(e.paths).catch(showErr);
}
on('files', (m) => m.lvl === levelKey() && filesChanged({ paths: m.paths }));
export function catchUp() {
  const h = held;
  held = null;
  if (!h) return Promise.resolve();
  if (h.count) gitCount(h.count);
  return (h.all ? reload() : h.paths.size ? reload(h.paths) : Promise.resolve()).catch(showErr);
}
document.addEventListener('visibilitychange', () => document.hidden || catchUp());
function followFiles() {
  const key = S.pid ? S.wid + '/' + S.pid : null;
  if (key === filesOf) return;
  stopFiles?.();
  stopFiles = null;
  held = null;
  filesOf = key;
  if (key) stopFiles = follow({ files: true }, filesChanged, { pid: S.pid, wid: S.wid });
}

function renderHere() {
  const p = projectOf(S.pid), w = S.ws?.name || '…';
  const pj = atWs() ? 'no project open' : p?.name || 'project';
  const label = WIN === 1 ? 'Amethyst' : SOLO === 'qagent' ? 'Quick Agent' : SOLO.startsWith('review-') ? 'Review' : SOLO ? TYPES[SOLO]?.label || 'Agent Activity' : POP ? 'Quick Window' : `Window ${WIN}`;
  if (WIN === 1) document.title = amTag + (atLaunch() ? 'Amethyst' : `${atWs() ? w : p?.name || 'Project'} · Amethyst`);
  else document.title = amTag + (POP ? `${label} · ${pj}` : `${pj} · ${label}`);
  $('#winbar .xw-n').innerHTML = amTag + (everyOn() && everyFrom() ? `${label} · ${esc(everyFrom())}` : label);
  paintEvery();
}

type Naming = { dir: string; row: HTMLElement; input: HTMLInputElement; shown?: boolean; done(name: any): void };
let naming: Naming | null = null;

const WINDOW_AT = 300, AROUND = 40, STEP = 20;
type Want = { key: string; html?: string; el?: HTMLElement };
let lines: TreeRow[] = [], drawn = new Map<string, { html?: string; el: HTMLElement }>(), spanned = '', dragged: string | null = null, frame = 0;
const keyOf = new WeakMap<Element, string>();
const view = { top: 0, h: 0, rh: 0 };
const treeBox = $<HTMLElement>('#tree');
const rowH = () => view.rh || 24;
const draftKey = (n: Naming) => (n.dir === inboxLoc() ? 'i' : 'd:' + n.dir);

onExtColors(() => renderTree());
export function renderTree() {
  if (atWs()) return;
  const top = treeTop();
  lines = top ? treeRows(top) : [];
  const cut = S.cut;
  if (cut) lines.push({ key: 'n', depth: 1, html: () => `<div class="ti note-ti" style="--d:1"><b class="tg"></b><span class="nm">a big folder: the first ${cut.toLocaleString()} things show</span></div>` });
  drawRows();
  placeDraft();
  renderFoldButton();
  paintFocusButton();
}

function spansOf(): [number, number][] {
  const n = lines.length;
  if (n <= WINDOW_AT) return [[0, n]];
  const first = Math.floor(view.top / rowH()), seen = Math.ceil((view.h || rowH() * 30) / rowH());
  const a = Math.max(0, Math.floor((first - AROUND) / STEP) * STEP), b = Math.min(n, Math.ceil((first + seen + AROUND) / STEP) * STEP);
  const held = [keyOf.get(document.activeElement!), dragged, naming && draftKey(naming)];
  const out = [...new Set(held.filter(Boolean).map((k) => lines.findIndex((r) => r.key === k)))].filter((i) => i >= 0 && (i < a || i >= b)).map((i): [number, number] => [i, i + 1]);
  return [...out, [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
}

function drawRows(scrolled = false) {
  const spans = spansOf(), n = lines.length;
  const key = spans.join('|');
  if (scrolled && key === spanned) return;
  spanned = key;
  const want: Want[] = [], name = naming && draftKey(naming);
  let pads = 0;
  const pad = (k: number) => want.push({ key: '#pad' + pads++, html: `<div class="tree-pad" style="height:${k * rowH()}px"></div>` });
  let at = 0;
  for (const [x, y] of spans) {
    if (x > at) pad(x - at);
    for (let i = x; i < y; i++) {
      want.push({ key: lines[i].key, html: lines[i].html() });
      if (lines[i].key === name) want.push({ key: '#name', el: naming!.row });
    }
    at = y;
  }
  if (n > at) pad(n - at);
  patchRows(want);
}

function patchRows(want: Want[]) {
  const had = document.activeElement as HTMLElement | null, els: HTMLElement[] = [], fresh: number[] = [];
  want.forEach((w, i) => {
    const old = drawn.get(w.key);
    if (w.el) els[i] = w.el;
    else if (old && old.html === w.html) els[i] = old.el;
    else fresh.push(i);
  });
  if (fresh.length) {
    const t = document.createElement('template');
    t.innerHTML = fresh.map((i) => want[i].html).join('');
    const made = [...t.content.children] as HTMLElement[];
    fresh.forEach((i, j) => {
      if (made.length === fresh.length) return void (els[i] = made[j]);
      t.innerHTML = want[i].html!;
      els[i] = t.content.firstElementChild as HTMLElement;
    });
  }
  const next = new Map<string, { html?: string; el: HTMLElement }>();
  want.forEach((w, i) => {
    next.set(w.key, { html: w.html, el: els[i] });
    keyOf.set(els[i], w.key);
  });
  drawn = next;
  const keep = new Set<Element>(els);
  for (const c of [...treeBox.children]) if (!keep.has(c)) c.remove();
  let cur = treeBox.firstElementChild;
  for (const el of els) {
    if (el === cur) cur = cur.nextElementSibling;
    else treeBox.insertBefore(el, cur);
  }
  if (had && had !== document.activeElement && had.isConnected && treeBox.contains(had)) had.focus({ preventScroll: true });
}

export function treeRow(key: string): HTMLElement | null {
  const got = drawn.get(key)?.el;
  if (got?.isConnected) return got;
  const i = lines.findIndex((r) => r.key === key);
  if (i < 0) return null;
  treeBox.scrollTop = view.top = Math.max(0, i * rowH() - (view.h || treeBox.clientHeight) / 2);
  drawRows();
  const el = drawn.get(key)?.el;
  return el?.isConnected ? el : null;
}

export function treeNear(r: HTMLElement, step: 'up' | 'down' | 'home' | 'end' | 'parent' | 'child'): HTMLElement | undefined {
  const last = lines.findLastIndex((x) => x.key !== 'n'), k = keyOf.get(r), i = k == null ? -1 : lines.findIndex((x) => x.key === k);
  let j = -1;
  if (step === 'home') j = 0;
  else if (step === 'end') j = last;
  else if (i < 0) return undefined;
  else if (step === 'up') j = i - 1;
  else if (step === 'down') j = i + 1;
  else if (step === 'parent') j = lines.slice(0, i).findLastIndex((x) => x.depth < lines[i].depth);
  else if (step === 'child') j = lines[i + 1]?.depth > lines[i].depth ? i + 1 : -1;
  return j >= 0 && j <= last ? (treeRow(lines[j].key) ?? undefined) : undefined;
}

const soonRows = () => lines.length > WINDOW_AT && (frame ||= requestAnimationFrame(() => ((frame = 0), drawRows(true))));
treeBox.addEventListener('scroll', () => ((view.top = treeBox.scrollTop), soonRows()), { passive: true });
treeBox.addEventListener('dragstart', (e) => (dragged = keyOf.get((e.target as HTMLElement).closest?.('.ti') as Element) ?? null));
treeBox.addEventListener('dragend', () => (dragged = null));

const EDGE = 48, FAST = 1200, SLOW = 120;
const edge = { y: null as number | null, at: 0, frame: 0, t: 0, carry: 0 };
function edgeSpeed(y: number) {
  const r = treeBox.getBoundingClientRect(), box = $('#side').getBoundingClientRect();
  const k = y < r.top + EDGE && y >= box.top ? -Math.min(1, (r.top + EDGE - y) / EDGE) : y > r.bottom - EDGE && y <= box.bottom ? Math.min(1, (y - r.bottom + EDGE) / EDGE) : 0;
  if (!k || (k < 0 ? treeBox.scrollTop <= 0 : treeBox.scrollTop >= treeBox.scrollHeight - treeBox.clientHeight - 1)) return 0;
  return Math.sign(k) * (SLOW + (FAST - SLOW) * Math.abs(k));
}
function edgeStep(t: number) {
  edge.frame = 0;
  const v = edge.y == null || !S.dragging || performance.now() - edge.at > 150 ? 0 : edgeSpeed(edge.y);
  if (!v) return void ((edge.t = 0), (edge.carry = 0));
  edge.carry += (v * (edge.t ? Math.min(50, t - edge.t) : 16)) / 1000;
  edge.t = t;
  const px = Math.trunc(edge.carry);
  edge.carry -= px;
  if (px) treeBox.scrollTop += px;
  edge.frame = requestAnimationFrame(edgeStep);
}
document.addEventListener(
  'dragover',
  (e) => {
    if (!S.dragging || !(e.target as Element).closest?.('#side')) return void (edge.y = null);
    edge.y = e.clientY;
    edge.at = performance.now();
    if (!edge.frame && edgeSpeed(e.clientY)) edge.frame = requestAnimationFrame(edgeStep);
  },
  true,
);
onSize(treeBox, {
  name: 'tree.window',
  live: true,
  read: () => parseFloat(getComputedStyle(treeBox).getPropertyValue('--tree-row')) || 24,
  write: (rh, seen) => {
    const e = seen.at(-1);
    if (e) view.h = e.contentRect.height;
    if (rh !== view.rh) spanned = '';
    view.rh = rh;
    soonRows();
  },
});

function placeDraft() {
  const n = naming;
  if (!n) return;
  const at = n.row.previousElementSibling as HTMLElement | null;
  if (!n.row.isConnected || !at) return n.shown ? n.done(null) : undefined;
  n.row.style.setProperty('--d', ((parseInt(at.style.getPropertyValue('--d')) || 0) + 1) as unknown as string);
  if (n.shown) return;
  n.shown = true;
  n.input.focus();
  n.row.scrollIntoView({ block: 'nearest' });
}

function freeName(dir: string, ext: string) {
  const c = S.dirs.get(dir) ?? (dir === inboxLoc() ? S.inbox : null);
  const used = new Set([...(c?.thoughts ?? []), ...(c?.kids ?? [])].map((x: Note | Folder) => x.name.toLowerCase()));
  let i = 1;
  while (used.has(`untitled-${i}${ext}`)) i++;
  return `untitled-${i}${ext}`;
}

export function nameInTree({ dir = '', kind = 'file', ext = '', value }: { dir?: string; kind?: string; ext?: string; value?: string } = {}) {
  if (WIN > 1) return nameAtLead({ dir, kind, ext, value });
  naming?.done(null);
  showSide('tree', true);
  sideNow();
  unfoldTo(dir);
  setOpen(dir === inboxLoc() ? '#inbox' : dir, true);
  return new Promise<string | null>((resolve) => {
    const row = document.createElement('div'), input = document.createElement('input');
    row.className = 'ti name-ti';
    row.innerHTML = `<b class="tg"></b><i class="${kind === 'folder' ? 'sq' : 'gl'}">${gem(kind === 'folder' ? 'folder' : kind)}</i>`;
    input.setAttribute('aria-label', `name of the new ${kind}`);
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = kind === 'file' ? (value ?? ext) : '';
    row.append(input);
    const n: Naming = (naming = {
      dir,
      row,
      input,
      done(name) {
        if (naming !== n) return;
        naming = null;
        row.remove();
        resolve(name);
      },
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') n.done(null);
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const typed = input.value.trim();
      n.done(typed && typed !== (kind === 'file' ? ext : '') ? typed : freeName(dir, kind === 'folder' ? '' : kind === 'board' ? '.svg' : ext || '.md'));
    });
    input.addEventListener('blur', () => setTimeout(() => naming === n && document.activeElement !== input && n.done(null)));
    renderTree();
    if (!n.shown) {
      naming = null;
      return resolve(ask({ title: `new ${kind}`, text: `Goes into ${dirLabel(dir)}.`, value: input.value, pick: [0, 0] }).then((x) => x?.trim() || null));
    }
    if (kind === 'file') input.setSelectionRange(0, value ? value.length - (ext && value.endsWith(ext) ? ext.length : 0) : 0);
    else input.select();
  });
}

const waiting = new Map<string, (name: string | null) => void>();
function nameAtLead(opts: Parameters<typeof nameInTree>[0]) {
  const id = uid();
  return new Promise<string | null>((resolve) => {
    waiting.set(id, resolve);
    send('name', { id, opts });
  });
}
on('named', (m) => {
  waiting.get(m.id)?.(m.name);
  waiting.delete(m.id);
});
if (WIN === 1)
  on('name', (m) => {
    window.focus();
    nameInTree(m.opts).then((name) => send('named', { id: m.id, name }));
  });

function treeTop(): Folder | undefined {
  return focused() ?? S.roots[0];
}
function foldables(): Folder[] {
  const top = treeTop();
  if (!top) return [];
  return [...S.dirs.values()].filter((c) => c !== top && (c.thoughts.length || c.kids.length) && (top.loc === '' || within(c.loc, top.loc)));
}

function renderFoldButton() {
  const foldable = foldables();
  const folded = foldable.every((c) => !isOpen(foldKey(c)));
  const b = $<HTMLElement>('#tree-fold');
  b.hidden = !foldable.length || !!S.query || !pref('foldAll');
  const want = folded ? '1' : '';
  if (b.dataset.unfold === want) return;
  const word = folded ? 'expand all' : 'collapse all';
  b.innerHTML = ICONS[folded ? 'unfoldAll' : 'foldAll'];
  b.title = folded ? 'Expand all\nOpens every folder in the explorer.' : 'Collapse all\nCloses every folder in the explorer.';
  b.setAttribute('aria-label', word);
  b.dataset.unfold = want;
}

const foldKey = (c: Folder) => (c === S.inbox ? '#inbox' : c.loc);

export function foldAll(close: boolean) {
  for (const c of foldables()) setOpen(foldKey(c), !close);
  setOpen(treeTop()?.loc ?? '', true);
  renderTree();
}

function thoughtRow(t: Note) {
  const pv = t.board ? `<img class="thumb" src="${rawUrl(t.path, t.mtime)}" alt="" loading="lazy" draggable="false">` : `<span class="pv">${esc(`file · ${sizeOf(t.size)}`)}</span>`;
  return `<div class="th ${S.open?.path === t.path ? 'on' : ''}" style="--tc:${esc(col(t.color))}" draggable="true" data-drag="file:${esc(t.path)}" data-open="${esc(t.path)}" data-th="${esc(t.path)}" title="${esc(t.title)}" data-tip-cut=".tt">
    <span class="gl" style="color:${esc(col(t.color))}">${gemOf(t)}</span>
    <span class="tt">${esc(t.title)}</span>${pv}</div>`;
}

function rows(list: Note[]) {
  return list.filter(matches).map(thoughtRow).join('');
}

function containerBox(c: Folder, depth = 0): string {
  const own = rows(c.thoughts);
  const kids = c.kids.map((k) => containerBox(k, depth + 1)).join('');
  if (S.query && !own && !kids) return '';
  const cls = depth ? 'inner' : c.kind === 'inbox' ? 'inbox' : 'folder';
  const drag = c.loc === '' ? '' : `draggable="true" data-drag="dir:${esc(c.loc)}"`;
  const fold = c.kind !== 'inbox' && !c.path.includes('/') ? 'data-fold' : '';
  return `<div class="box ${cls} ${S.ctx === c.loc ? 'sel' : ''}" data-drop="${esc(c.loc)}" ${fold} style="--bc:${esc(tintOf(c))}">
    <span class="bt" ${drag} data-dir="${esc(c.loc)}"><i class="g">${dirGem(c)}</i> ${esc(c.name)}</span>
    ${own}${!own && !c.kids.length ? `<div class="empty">Empty. Drop files here.</div>` : ''}
    ${kids && depth < 40 ? `<div class="inners">${kids}</div>` : ''}</div>`;
}

const stackm = (c: string) => `<span class="stackm" style="--pc:${esc(c)}"><i></i><i></i><i></i></span>`;
const COLS = [['folder', ''], ['eye', '24px']];
function pjRow(p: Project, lit: boolean) {
  const off = !p.missing && pjHidden(p.id), eye = off ? "Hidden from the dock\nThis project is hidden from this Amethyst's dock. Click to show it there." : "Hide from the dock\nTakes this project out of this Amethyst's dock. It stays in the workspace.";
  return `<div class="pjr${p.missing ? ' missing' : ''}${lit ? ' on' : ''}${off ? ' gone' : ''}" data-pjsel="${esc(p.id)}" title="${esc(p.path)}\nThe project's folder. Click to open the project.\n\nRight-click to rename it, color it or choose which projects show in the dock." data-tip-mono>
    ${stackm(pjColor(p))}<span class="pr-t"><b class="pr-n">${esc(p.name)}</b><span class="pr-p">${p.missing ? 'folder not found' : esc(p.path)}</span></span>${p.missing ? '<span class="pr-eye"></span>' : `<button class="pr-eye" data-pjeye="${esc(p.id)}" title="${esc(eye)}" aria-label="${off ? 'show in the dock' : 'hide from the dock'}">${icon(off ? 'eyeOff' : 'eye')}</button>`}</div>`;
}
export function ordered(list: WorkspaceEntry[], openedOf: (w: WorkspaceEntry) => number) {
  const pinned = list.filter((x) => x.pin).sort((a, b) => a.pin! - b.pin!);
  const rest = list.filter((x) => !x.pin).sort((a, b) => (openedOf(b) || 0) - (openedOf(a) || 0));
  return pinned.concat(rest);
}
function fillStart(el: HTMLElement, name: string, list: Project[], lit: Project | null, shown: string[][]) {
  const q = (s: string) => el.querySelector<HTMLElement>(s)!, pj = q('.st-pj');
  q('#st-title').textContent = name;
  q('#st-ic').innerHTML ||= ICONS.workspaces;
  q('#st-n').textContent = String(list.length);
  for (const [k] of COLS) pj.classList.toggle('no-' + k, !shown.some((c) => c[0] === k));
  q('#st-grid').innerHTML = list.map((p) => pjRow(p, p === lit)).join('');
  pj.style.setProperty('--pjr-cols', ['30px minmax(0, 1fr)', ...shown.map((c) => c[1]).filter(Boolean)].join(' '));
}
export function startPic(name: string, desc: string, note: string, list: Project[]) {
  const el = $('#start').cloneNode(true) as HTMLElement, q = (s: string) => el.querySelector<HTMLElement>(s)!;
  fillStart(el, name, list, list[0], COLS);
  q('#st-desc').textContent = desc;
  q('#st-desc').removeAttribute('contenteditable');
  q('#st-note .md').innerHTML = markdown(note);
  for (const s of ['.st-newg', '.pjr.head', '#st-desc', '#st-note']) q(s).hidden = false;
  for (const s of ['#st-hid', '#st-left']) q(s).remove();
  q('.st-cols').classList.remove('no-note');
  el.removeAttribute('data-edge');
  return el.outerHTML;
}
function renderStart() {
  const opened = store.get('opened', {});
  const when = (p: Project): number => opened[levelKey(S.wid, p.id)] || 0;
  const list = S.projects;
  for (const el of [$('#st-title'), $('#st-ic')]) el.title = S.ws?.dir ? `${S.ws.dir}\nThe workspace's folder.` : '';
  const nh = list.filter((p) => !p.missing && pjHidden(p.id)).length;
  $('#st-hid').textContent = nh ? `· ${nh} hidden from the dock` : '';
  $('#st-hid').hidden = !nh;
  $<HTMLElement>('.st-sec .st-newg').hidden = isOff('wspage:off', 'newpj');
  $('.pjr.head').hidden = isOff('wspage:off', 'head');
  const last = list.reduce<Project | null>((m, p) => (when(p) && (!m || when(p) > when(m)) ? p : m), null);
  fillStart($('#start'), S.ws?.name || 'workspace', list, last, COLS.filter(([k]) => !isOff('wspage:off', k)));
  const desc = $('#st-desc');
  desc.hidden = isOff('wspage:off', 'desc');
  if (document.activeElement !== desc) desc.textContent = S.ws?.desc || '';
  const note = !isOff('wspage:off', 'note');
  $('#st-note').hidden = !note;
  $('.st-cols').classList.toggle('no-note', !note);
  const left = (S.roots[0]?.thoughts || []).filter((t) => !t.file).length;
  const el = $('#st-left');
  el.hidden = S.wid !== HOME || !left || !S.projects.some((p) => !p.missing);
  el.innerHTML = `${left} file${left === 1 ? ' is' : 's are'} still in the workspace folder. <button class="outline" data-movews>move ${left === 1 ? 'it' : 'them'} into a project</button>`;
}

const SHOWN = 10;
function pjCode(name: string) {
  const w = name.match(/\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\p{Lo}+|\p{N}+/gu) || [name];
  return (w.length > 1 ? w.slice(0, 3).map((x) => [...x][0]).join('') : [...w[0]].slice(0, 3).join('')).toUpperCase();
}
export function wsTile(w: WorkspaceEntry, pin = !isOff('launch:off', 'pin')) {
  const n = w.projects.length, k = n > SHOWN ? SHOWN - 1 : SHOWN;
  const wrong = w.missing ? 'folder not found' : w.locked ? 'click to open its folder again' : '';
  const top = w.projects.slice(0, k).map((p) => `<span class="wt-p" title="${esc(p.name)}&#10;A project in this workspace. Click to open the workspace.">${stackm(pjColor(p))}<small>${esc(pjCode(p.name))}</small></span>`).join('') + (n > k ? `<span class="wt-more">+${n - k}</span>` : '');
  const tip = `${w.path}\nThe folder this workspace keeps its projects in.\n\nRight-click to rename it, color it or remove it.`;
  return `<div class="ws-tile${w.missing ? ' missing' : ''}" data-wssel="${esc(w.id)}" tabindex="0" title="${esc(tip)}" data-tip-mono>
    <div class="wt-top">${top || '<span class="wt-none">no projects yet</span>'}</div>
    <div class="wt-b"><b>${esc(w.name)}</b>${w.home ? '<span class="tag" title="Home&#10;The workspace that earlier versions of the app made by themselves.">home</span>' : ''}<span class="wt-path">${esc(w.path)}</span><span class="wt-n">${[`${n} project${n === 1 ? '' : 's'}`, wrong].filter(Boolean).join(' · ')}</span></div>${!pin ? '' : `<button class="ib wt-pin${w.pin ? ' on' : ''}" tabindex="-1" data-wspin="${esc(w.id)}" title="${w.pin ? 'Unpin&#10;The workspace goes back among the last opened.' : 'Pin&#10;Keeps this workspace in its place, instead of moving with the last opened.'}">${ICONS.pin}</button>`}</div>`;
}
function renderLaunch() {
  const opened = store.get('wsOpened', {});
  const list = ordered([...S.workspaces], (w: WorkspaceEntry) => opened[w.id]);
  const resetVis = list.some((w) => w.pin) ? '' : 'visibility:hidden';
  $('#la-reset').setAttribute('style', resetVis);
  $('#la-n').textContent = list.length;
  const first = !list.length || (list.length === 1 && list[0].home && !list[0].projects.length);
  $('#la-line').textContent = first ? 'a workspace is one place for the projects that belong together' : 'Pick a workspace, or make a new one.';
  $('#la-grid').innerHTML = list.map((w) => wsTile(w)).join('') + `<button class="ws-tile new" data-newws tabindex="-1" title="New workspace&#10;Makes a workspace: a place for project folders that belong together." data-tip-keys="newWorkspace:new workspace"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.2v9.6M3.2 8h9.6"/></svg><span>new workspace</span></button>`;
}
$<HTMLElement>('#la-grid').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-wspin]');
  if (!b) return;
  e.stopPropagation();
  const id = b.dataset.wspin;
  const pinned = S.workspaces.filter((x) => x.pin && x.id !== id).sort((a, c) => a.pin! - c.pin!).map((x) => x.id);
  pinOrder(S.workspaces.find((x) => x.id === id)?.pin ? pinned : [...pinned, id!]);
});
const laStops = () => [$<HTMLElement>('#launch .la-acts [data-newws]'), ...$<HTMLElement>('#la-grid').querySelectorAll<HTMLElement>('[data-wssel]')];
document.addEventListener('keydown', (e) => {
  if (!atLaunch() || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || !$('#modal').hidden) return;
  const menu = $<HTMLElement>('#colormenu');
  if (e.key === 'Tab' && !menu.hidden) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  else if (!menu.hidden) return;
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body && !a.closest('#launch, #status')) return;
  if (e.key === 'Tab') {
    const stops = laStops(), i = a ? stops.indexOf(a) : -1;
    e.preventDefault();
    stops[i < 0 ? (e.shiftKey ? stops.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length]?.focus();
  } else if ((e.key === 'Enter' || e.key === ' ') && a?.matches('#la-grid [data-wssel], #launch .la-acts [data-newws]')) {
    e.preventDefault();
    a.click();
  }
});
rowIcons({ 'launch:off:pin': () => ICONS.pin, 'wspage:off:desc': () => ICONS.note, 'wspage:off:note': () => icon('file'), 'wspage:off:newpj': () => icon('plus'), 'wspage:off:head': () => icon('findAll'), 'wspage:off:folder': () => icon('folder'), 'wspage:off:eye': () => icon('eye') });
$<HTMLElement>('#launch').addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement).closest('[data-wssel], a')) return;
  e.preventDefault();
  hideMenu(e.clientX, e.clientY, 'launch');
});

const noteAbs = () => S.ws && S.ws.dir.replace(/[\\/]+$/, '') + (S.ws.dir.includes('\\') ? '\\' : '/') + 'workspace.md';
let noteText: string | null | undefined, noteFor = '', noteBusy = false;
let noteShown = false, noteAsked = '', noteAgain = false;
function followNote() {
  const c = $('#app').classList;
  const on = c.contains('ws') && !c.contains('launch') && !c.contains('wsed') && !c.contains('decked') && !isOff('wspage:off', 'note');
  if (on && (!noteShown || noteAsked !== noteAbs())) loadNote();
  noteShown = on;
}
window.addEventListener('focus', () => noteShown && loadNote());
async function loadNote() {
  const abs = noteAbs();
  if (!abs) return;
  if (noteBusy) return void (noteAgain = true);
  noteBusy = true;
  noteAsked = abs;
  let text: string | null = '';
  try {
    const r = await api('GET', '/api/ext?path=' + encodeURIComponent(abs), undefined, '');
    text = r.kind === 'text' ? r.content : '';
  } catch (e) {
    text = (e as { status?: number }).status === 404 ? null : '';
  } finally {
    noteBusy = false;
  }
  if (noteAgain) return void ((noteAgain = false), loadNote());
  if (noteAbs() !== abs || (text === noteText && abs === noteFor)) return;
  noteText = text;
  noteFor = abs;
  $('#st-note .md').innerHTML = text ? markdown(text, { front: true }) : '';
}
async function editNote() {
  try {
    if (noteText === null) await api('POST', '/api/wsfile', { name: 'workspace.md', content: `# ${S.ws!.name}\n\n` }, '');
    noteText = undefined;
    await page.openFiles([noteAbs()!]);
    loadNote();
  } catch (e) {
    showErr(e);
  }
}
$<HTMLElement>('#st-note').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-wsnote]') || ((e.target as HTMLElement).closest('.sn-body') && !(e.target as HTMLElement).closest('a') && !getSelection()!.toString())) editNote();
});
$<HTMLElement>('#st-grid').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pjeye]');
  if (!b) return;
  e.stopPropagation();
  setPjHidden(b.dataset.pjeye!, !pjHidden(b.dataset.pjeye!));
});
onPjHidden(() => atWs() && renderStart());
$<HTMLElement>('#start').addEventListener('contextmenu', (e) => {
  if ((e.target as HTMLElement).closest('[data-pjsel], #st-desc:focus, a')) return;
  e.preventDefault();
  hideMenu(e.clientX, e.clientY, 'wspage');
});
$('#la-reset').addEventListener('click', () => resetOrder());

sortable($('#la-grid'), {
  item: '[data-wssel]',
  end: '.new',
  skip: '.wt-pin',
  drop(all, to) {
    const pinned = S.workspaces.filter((x) => x.pin).length;
    pinOrder(all.slice(0, Math.max(to + 1, pinned)).map((t) => t.dataset.wssel));
  },
});

export function lastWorkspace() {
  const opened = store.get('wsOpened', {});
  return [...S.workspaces].filter((w) => !w.missing).sort((a, b) => (opened[b.id] || 0) - (opened[a.id] || 0))[0] || null;
}

let listHtml: string | null = null;
export function renderList() {
  if (!shows('list')) return (listHtml = null);
  let h = '';
  if (S.solo != null) {
    h += `<div class="crumb"><button data-everything>‹ everything</button></div>`;
    h += containerBox(S.dirs.get(S.solo)!);
  } else {
    const root = S.roots[0], ib = S.inbox;
    if (root && ib) {
      const loose = rows(ib.thoughts), inner = ib.kids.map((k) => containerBox(k, 1)).join('');
      if (!S.query || loose || inner) {
        h += `<div class="box inbox ${S.ctx === inboxLoc() ? 'sel' : ''}" data-drop="${esc(ib.loc)}" style="--bc:${esc(inboxTint())}">
          <span class="bt" data-inbox><i class="g">${gem('inbox')}</i> ${NAME.inbox.toUpperCase()} <i>· ${esc(root.name)}</i></span>
          ${loose || (inner ? '' : '<div class="empty">Nothing unsorted.</div>')}
          ${inner ? `<div class="inners">${inner}</div>` : ''}</div>`;
      }
      const own = rows(root.thoughts);
      if (own) h += `<div class="box folder" data-drop="" style="--bc:${esc(tintOf(root))}"><span class="bt" data-dir=""><i class="g">${dirGem(root)}</i> ${esc(root.name)}</span>${own}</div>`;
      h += root.kids.map((k) => containerBox(k)).join('');
    }
    if (!S.roots.some((r) => r.kids.length)) h += `<div class="hello">No ${NAMES.folder} yet. Press <b>e</b> to make one.</div>`;
  }
  if (S.query && !h.includes('class="th')) h += `<div class="hello">Nothing matches “${esc(S.query)}”.</div>`;
  if (h !== listHtml) $('#list').innerHTML = listHtml = h;
  $('#list').classList.toggle('single', S.solo != null);
}

const WEB: Cb = {
  onOpen: (path) => openQuick(path),
  onSelect: (dir) => selectDir(dir, false, false, true),
  onInbox: () => selectInbox(false, false, true),
  onBlank: () => deselect(),
  onMove: async (path, dir, ring) => {
    const t = S.thoughts.get(path), r = ring === 2 ? 2 : null;
    if (t && (t.meta.pin || (t.meta.ring || null) !== r)) {
      Object.assign(t.meta, { pin: null, ring: r });
      await api('PUT', '/api/meta', { path, kind: 'file', patch: { pin: null, ring: r } }).catch(showErr);
    }
    moveItem(path, dir);
  },
  onMoveDir: (path, to) => moveDir(path, to),
  onLayout: (layout) => {
    setLayout(layout);
    api('PUT', '/api/layout', { layout }).catch(showErr);
  },
  onPin: (path, pin, ring) => {
    const t = S.thoughts.get(path), r = ring === 2 ? 2 : null;
    if (t) Object.assign(t.meta, { pin, ring: r });
    api('PUT', '/api/meta', { path, kind: 'file', patch: { pin, ring: r } }).catch(showErr);
    setSave(pin ? 'parked — drop it on a ring to orbit again' : r ? 'orbiting on the outer ring' : 'orbiting on the inner ring');
  },
  cams: new Map(),
};
handle(WEB, mindInUse);

async function loadArchive() {
  try {
    S.archive = (await api('GET', '/api/archive')).items;
  } catch (e) {
    S.archive = [];
    showErr(e);
  }
  renderArchive();
}

const topLabel = () => (atWs() ? 'WORKSPACE' : `${projectOf(S.pid)?.name || 'project'} · top level`);

function renderArchive() {
  if (!shows('archive')) return;
  const groups = [
    ['folder', `<i class="g">${gem('folder')}</i> ${NAMES.folder}`, `${NAMES.folder[0].toUpperCase() + NAMES.folder.slice(1)} come back with everything that was inside them.`],
    ['thought', `<i class="g">${gem('file')}</i> files`, ''],
  ];
  let h = archiveTop();
  for (const [type, title, hint] of groups) {
    const list = S.archive.filter((a) => a.type === type);
    h += `<div class="box arc-grp"><span class="bt">${title} <i>· ${list.length}</i></span>${hint && list.length ? `<div class="arc-hint">${hint}</div>` : ''}`;
    h += list.length
      ? list
          .map((a) => {
            const was = a.known ? a.from.split('/').slice(0, -1).join(' › ') || topLabel() : 'unknown (old trash)';
            const info = [type === 'folder' ? `${a.count} file${a.count === 1 ? '' : 's'}` : a.board ? 'board' : 'file', `archived ${ago(a.at)}`].filter(Boolean).join(' · ');
            return `<div class="arc-row">
              <i class="gl">${gem(type === 'folder' ? 'folder' : a.board ? 'board' : 'file')}</i>
              <span class="arc-main"><span class="tt">${esc(a.title)}</span><span class="pv">${esc(info)}</span>
              <span class="arc-was">was in <b>${esc(was)}</b>${a.lost ? ` <em>· that place is gone, so it goes to ${esc(topLabel())}</em>` : ''}</span></span>
              <button class="outline" data-arcback="${esc(a.id)}">restore</button>
              <button class="danger" data-arcpurge="${esc(a.id)}">delete</button>
            </div>`;
          })
          .join('')
      : `<div class="empty">None archived.</div>`;
    h += `</div>`;
  }
  $('#archive').innerHTML = h;
}

const noArcShow = () => $('#archive').classList.toggle('no-show', isOff('archive:off', 'show'));
noArcShow();
onPref('archive:off', noArcShow);
barMenu('#archive', 'archive', { order: false });

$<HTMLElement>('#archive').addEventListener('click', async (e) => {
  const disk = (e.target as HTMLElement).closest<HTMLElement>('.arc-disk');
  if (disk) {
    if (!S.archive.length) return tell(disk, { title: 'Nothing is archived here', ms: 2500 });
    return void api('POST', '/api/archive/show', {}).catch(showErr);
  }
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-arcback],[data-arcpurge]');
  if (!b) return;
  const a = S.archive.find((x) => x.id === (b.dataset.arcback || b.dataset.arcpurge));
  if (!a) return;
  try {
    if (b.dataset.arcback) {
      const r = await api('POST', '/api/restore', { id: a.id });
      if (r.path) madeStep(`restored “${a.title}”`, r.path);
      setSave(`restored “${a.title}” → ${parentOf(r.path) ? parentOf(r.path).split('/').join(' › ') : topLabel()}`);
    } else {
      const what = a.type === 'folder' ? `the folder “${a.title}” and its ${a.count} file(s)` : `“${a.title}”`;
      if (!(await ask({ title: 'delete for good', text: `Delete ${what} for good? This can't be undone.`, confirm: true }))) return;
      await api('POST', '/api/purge', { id: a.id });
      setSave(`deleted “${a.title}” for good`);
    }
  } catch (err) {
    showErr(err);
  }
  reloadAll();
});

const searchHits = (q: string) => api('GET', '/api/search?q=' + encodeURIComponent(q)).then((r) => new Set<string>(r.paths), () => new Set<string>());
let searchTimer = 0, asking = false, wanted = '';

function askSearch(q: string) {
  wanted = q;
  if (asking) return;
  asking = true;
  const lvl = levelKey();
  (q ? searchHits(q) : Promise.resolve(null)).then((hits) => {
    asking = false;
    if (wanted !== q || lvl !== levelKey()) return wanted !== S.query || wanted ? askSearch(wanted) : undefined;
    S.query = q;
    S.hits = hits;
    keepShown('');
    drawSearch();
  });
}

function drawSearch() {
  if (atLaunch() || atWs() || !S.data) return render();
  renderTree();
  renderList();
  toWeb();
}

export function clearSearch() {
  clearTimeout(searchTimer);
  wanted = '';
  $('#search').value = '';
  S.query = '';
  S.hits = null;
}

$<HTMLElement>('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => askSearch((e.target as HTMLInputElement).value.trim().toLowerCase()), 180);
});
