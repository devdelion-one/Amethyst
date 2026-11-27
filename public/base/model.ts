import { fnKeys, setFnKey } from './binds.ts';
import { BOARD_EXT, MAX_PATHS, sortOf } from './files.ts';
import { pref } from './prefs.ts';
import { col, mix, theme } from './theme.ts';
import { AM, amKey, byTitle, esc, fileUrl, parentOf, quietly, showErr, store } from './util.ts';
import { notify } from './notify.ts';
import { DEFAULT, gem, gemKind, NAME } from './kinds.ts';
import { WIN } from './windows.ts';
import type { FileInfo, FileMeta, Folder, Note, Pin, Project, State, Tree, TreeNode, Workspace } from './types.ts';

type PinLike = { kind: string; path?: string; session?: string; id?: string };

export const HOME = 'main';
export const atLaunch = () => S.wid === '';
export const atWs = () => S.pid === '';
export const levelKey = (wid = S.wid, pid = S.pid) => (!wid || wid === HOME ? pid : `${wid}:${pid}`);

export const projectOf = (id: string): Project | undefined => S.projects.find((p) => p.id === id);
export const isPj = (loc: unknown): boolean => typeof loc === 'string' && loc.startsWith('pj:');
export const INBOX = 'inbox';
export const inboxLoc = () => S.inbox?.loc ?? INBOX;
export const pjColor = (p: { color?: string | null } | null | undefined): string => (p?.color ? col(p.color) : mix(col(DEFAULT.project), theme().bg, 0.25));
export const wsColor = (w: (Partial<Workspace> & { color?: string | null }) | null | undefined): string => (w?.color ? col(w.color) : 'var(--accent)');
export const rawUrl = (path: string, v: string | number): string => `/api/raw?path=${encodeURIComponent(path)}&v=${v}&w=${encodeURIComponent(S.wid)}&p=${encodeURIComponent(S.pid)}`;
export const imgUrl = (rel: string): string => {
  const m = /^\.amethyst\/images\/([^/]+)$/.exec(rel);
  return m ? `/api/img?name=${encodeURIComponent(m[1])}&v=1&w=${encodeURIComponent(S.wid)}&p=${encodeURIComponent(S.pid)}` : rawUrl(rel, 1);
};
export const isImage = (path: string): boolean => sortOf(path) === 'image' && !BOARD_EXT.test(path);
export const pageUrl = (path: string): string | null => {
  const root = projectOf(S.pid)?.path?.replace(/[\\/]+$/, '');
  return window.amethyst?.webview && root && ['page', 'pdf'].includes(sortOf(path)) ? fileUrl(`${root}/${path}`) : null;
};
export const dirLabel =(loc: string): string => (loc ? loc.split('/').map((s, i) => (i || s !== S.inbox?.loc ? s : NAME.inbox.toUpperCase())).join(' › ') : atWs() ? 'the workspace' : S.dirs.get('')?.name || 'the project');

export async function api(method: string, url: string, body?: unknown, pid = S.pid, wid = S.wid): Promise<any> {
  const r = await fetch(url, {
    method,
    headers: { 'x-mind-workspace': wid, 'x-mind-project': pid, 'x-mind-am': String(AM), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw Object.assign(new Error('the server is not answering'), { status: 0 });
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, detail: j.detail, fix: j.fix, ...(j.bug && { bug: `${method} ${url.split('?')[0]} at ${j.bug}` }) });
  if (j.left) notify(`Moved, but the old copy could not be removed (another program has it open). It stays at <code>${esc(j.left)}</code>`, { ms: 15000 });
  return j;
}

export const isSelected = (el: Element): boolean => !!el.closest('.dk-cell.sel, .grp.on');

const REPLAY_MS = 3000;
const lastPress = { at: 0, t: null as Element | null };
const pressed = (e: Event) => Object.assign(lastPress, { at: Date.now(), t: e.target instanceof Element ? e.target : null });
document.addEventListener('pointerdown', pressed, true);
document.addEventListener('keydown', pressed, true);
export function seenWhenPicked(el: Element, idOf: () => string | null | undefined): { due(): void; stop(): void } {
  const born = Date.now();
  let due = false, picked = false, closing = false, on = false, first = false, replay = false, gone = false, pressing = false;
  const shown = () => el.checkVisibility({ visibilityProperty: true });
  const isPicked = () => isSelected(el) && shown();
  const openedHere = () => Date.now() - lastPress.at < REPLAY_MS && !!lastPress.t && !!el.closest('.deck, .grp')?.contains(lastPress.t);
  const tell = () => {
    if (!due || !idOf()) return;
    due = false;
    off();
    quietly(api('POST', '/api/agents/seen', { id: idOf() }));
  };
  const look = () => {
    if (closing) return;
    const sel = isSelected(el), now = sel && shown();
    if (first) {
      first = false;
      picked = sel;
      if (now && replay) tell();
      return;
    }
    if (now && !picked) tell();
    picked = sel;
  };
  const focused = () => {
    if (!pressing) look();
  };
  const press = ({ target: t, button }: { target: any; button: number }) => {
    if (!t.closest) return;
    if (button === 1 || t.closest('[data-dk-out],[data-dk-end],[data-tabx]')) {
      closing = true;
      return void setTimeout(() => ((closing = false), (picked = isPicked())));
    }
    const tab = t.closest('.tab');
    const hit = el.contains(t) || t.closest('.dk-cell')?.contains(el) || t.closest('[data-dk-agent]')?.dataset.dkAgent === idOf();
    pressing = true;
    const up = () => {
      pressing = false;
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      setTimeout(() => {
        const ownTab = tab?.classList.contains('on') && tab.closest('.grp')?.contains(el);
        if ((hit || ownTab) && shown()) tell();
        else if (due) look();
      });
    };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  };
  const io = new IntersectionObserver(look);
  function off() {
    if (!on) return;
    on = false;
    io.disconnect();
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('focusin', focused);
  }
  return {
    due() {
      if (gone) return;
      due = true;
      first = true;
      replay = Date.now() - born < REPLAY_MS && openedHere();
      io.unobserve(el);
      io.observe(el);
      if (on) return;
      on = true;
      document.addEventListener('pointerdown', press, true);
      document.addEventListener('focusin', focused);
    },
    stop() {
      gone = true;
      off();
    },
  };
}

const where = new URLSearchParams(location.search);
const last = where.has('w') || where.has('p') ? null : store.get('last', null);
export const S: State = {
  wid: where.get('w') ?? (where.get('p') ? HOME : String(last?.w || '')),
  pid: where.get('p') ?? String(last?.p || ''),
  wsEditor: false,
  switching: false,
  ws: null,
  projects: [],

  workspaces: [],
  wsNewSuggest: '',
  wsSuggest: '',
  data: null,
  roots: [],
  inbox: null,
  thoughts: new Map(),
  dirs: new Map(),
  cut: 0,
  hidden: 0,

  side: store.get('side', true),
  sideView: store.get('sideView', 'tree'),
  ctx: '',
  solo: null,

  collapsed: new Set(store.get('collapsed', [])),
  expanded: new Set(store.get('expanded', [])),

  picked: null,
  marked: new Set(),

  open: null,
  boardWide: false,
  saving: Promise.resolve(),
  saveTimer: 0,

  pages: null,

  settingsOpen: false,

  archive: [],
  query: '',
  hits: null,

  pins: [],
  marks: {},

  dragging: null,
};
S.wsEditor = WIN === 1 && !S.pid && !!S.wid && store.get('wsEditor' + amKey, '') === S.wid;

export function showPid() {
  const u = new URL(location.href);
  u.searchParams.set('w', S.wid);
  S.pid ? u.searchParams.set('p', S.pid) : u.searchParams.delete('p');
  history.replaceState(null, '', u);
  if (WIN > 1) return;
  store.set('last', { w: S.wid, p: S.pid });
  if (S.wid) store.set('wsOpened', { ...store.get('wsOpened', {}), [S.wid]: Date.now() });
  if (S.pid) store.set('opened', { ...store.get('opened', {}), [levelKey()]: Date.now() });
}

const EMPTY = { root: { files: [], dirs: [] }, dirs: {}, layout: {}, order: [] } as unknown as Tree;
export function setLayout(patch: Record<string, unknown>) {
  if (!S.data) return;
  for (const [k, v] of Object.entries(patch)) v ? (S.data.layout[k] = v) : delete S.data.layout[k];
}
export async function load(keep = () => true, tries = 0): Promise<boolean | null> {
  if (atLaunch()) {
    const r = await api('GET', '/api/workspaces');
    if (!keep()) return null;
    S.workspaces = r.workspaces;
    S.wsNewSuggest = r.suggest;
    S.pins = [];
    S.marks = {};
    build(EMPTY);
    return false;
  }
  const page = atWs();
  const wsCall = page || !S.ws ? api('GET', '/api/workspace', undefined, '') : null;
  let tree: any, ws: any;
  try {
    [tree, ws] = await Promise.all([page && S.wid !== HOME ? EMPTY : api('GET', '/api/tree'), wsCall]);
  } catch (e) {
    if (!keep()) return null;
    if (WIN > 1 && S.pid) {
      if (tries >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000));
      return keep() ? load(keep, tries + 1) : null;
    }
    showErr(e);
    if (S.pid) S.pid = '';
    else {
      S.wid = '';
      S.ws = null;
      S.projects = [];
    }
    showPid();
    return (await load(keep)) === null ? null : true;
  }
  if (!keep()) return null;
  if (ws) {
    S.ws = ws;
    S.projects = ws.projects;
    S.wsSuggest = ws.suggest;
  }
  S.pins = tree.pins || [];
  S.marks = tree.marks || {};
  build(tree);
  return false;
}

export async function patch(paths: string[], keep = () => true): Promise<'full' | boolean | null> {
  const q = encodeURIComponent(JSON.stringify(paths));
  if (atWs() || !S.data?.root || S.data.root.cut || paths.length > MAX_PATHS || q.length > 8000) return 'full';
  const r = await quietly(api('GET', '/api/entries?paths=' + q), null);
  if (!keep()) return null;
  if (!r) return 'full';
  const folders = new Map<string, TreeNode>(), touched = new Map<TreeNode, Set<string>>();
  const walk = (n: TreeNode): void => (folders.set(n.path, n), n.dirs.forEach(walk));
  walk(S.data!.root);
  for (const e of r.entries) {
    if (e.dir) {
      if (folders.has(e.path)) continue;
      return 'full';
    }
    if (e.gone && folders.has(e.path)) return 'full';
    const into = folders.get(parentOf(e.path));
    if (!into) {
      if (e.gone) continue;
      return 'full';
    }
    if (into.files.some((f) => f.path !== e.path && f.path.toLowerCase() === e.path.toLowerCase())) return 'full';
    (touched.get(into) || touched.set(into, new Set()).get(into)!).add(e.path);
    into.files = into.files.filter((f) => f.path !== e.path);
    if (e.gone) continue;
    const at = into.files.findIndex((f) => f.name.localeCompare(e.info.name) > 0);
    into.files.splice(at < 0 ? into.files.length : at, 0, e.info);
  }
  if (r.pins) S.pins = r.pins;
  if ([...touched.keys()].some((n) => !S.dirs.has(n.path))) build({ ...S.data! });
  else {
    for (const [n, paths] of touched) {
      const c = S.dirs.get(n.path)!;
      for (const p of paths) S.thoughts.delete(p);
      c.thoughts = c.thoughts.filter((t) => !paths.has(t.path));
      for (const f of n.files) if (paths.has(f.path)) c.thoughts.push(noteOf(f, c.loc));
      c.thoughts.sort(byRank);
    }
    S.data = { ...S.data! };
  }
  return false;
}

const byRank = (a: Note, b: Note) => (a.meta.rank ?? Infinity) - (b.meta.rank ?? Infinity) || byTitle(a, b);
function noteOf(f: FileInfo, dir = parentOf(f.path)): Note {
  const touched = Math.max(f.mtime || 0, f.meta.seen || 0, f.meta.created || 0);
  const code = f.kind === 'code', file = f.kind === 'file', board = f.kind === 'board';
  const t = { ...f, dir, board, code, file, touched } as Note;
  t.color = colorOf(t);
  S.thoughts.set(t.path, t);
  return t;
}


export function build(d: Tree) {
  S.data = d;
  S.thoughts.clear();
  S.dirs.clear();
  const box = (props: Partial<Folder> & Pick<Folder, 'kind' | 'path' | 'loc' | 'name'>): Folder => ({ thoughts: [], kids: [], parent: null, ...props });
  const root = box({ kind: 'inbox', id: 'main', path: '', loc: '', name: (S.pid ? projectOf(S.pid)?.name : '') || 'workspace' });
  const dirMeta = (d.dirs ||= {});
  S.dirs.set('', root);
  const walk = (n: TreeNode, into: Folder) => {
    for (const f of n.files) into.thoughts.push(noteOf(f, into.loc));
    for (const c of n.dirs) {
      const k = box({ kind: 'folder', path: c.path, loc: c.path, name: c.name, parent: into.loc, meta: (dirMeta[c.path] ||= {}) });
      S.dirs.set(c.path, k);
      into.kids.push(k);
      walk(c, k);
    }
  };
  walk(d.root, root);
  const ib = S.pid ? root.kids.find((k) => k.name.toLowerCase() === INBOX) : null;
  if (ib) root.kids.splice(root.kids.indexOf(ib), 1);
  S.inbox = !S.pid ? null : ib || box({ kind: 'folder', path: INBOX, loc: INBOX, name: INBOX, parent: '', missing: true });
  if (S.inbox?.missing) S.dirs.set(INBOX, S.inbox);
  S.cut = d.root.cut || 0;
  S.hidden = d.root.hidden || 0;
  const order = d.order || [];
  const rank = (c: Folder) => (c.kind === 'inbox' ? -1 : order.includes(c.path) ? order.indexOf(c.path) : Infinity);
  for (const c of S.dirs.values()) {
    c.thoughts.sort(byRank);
    c.kids.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  S.roots = [root];
  if (!S.dirs.has(S.ctx)) S.ctx = '';
  if (S.solo != null && !S.dirs.has(S.solo)) S.solo = null;
}

export const samePin = (a: PinLike, b: PinLike): boolean => a.kind === b.kind && (a.path ?? a.session ?? a.id) === (b.path ?? b.session ?? b.id);
export const isPinned = (p: PinLike): boolean => S.pins.some((x) => samePin(x, p));
export const markNo = (a: { kind?: string; session?: string | null }): number => (a.kind === 'chat' && a.session && S.marks[a.session]) || 0;
export const agentPin = (a: { kind: string; id?: string; session?: string | null; program?: string }, title?: string) => ((a.kind === 'term' ? { kind: 'term', id: a.id, title } : { kind: 'chat', session: a.session, program: a.program, title })) as Pin;

const VALID_MODES = ['editor', 'orch', 'term'];
export const modeOfOne = (): string => {
  if (atLaunch()) return 'editor';
  const m = store.get('modes' + amKey, {})[levelKey()];
  return VALID_MODES.includes(m) && (m !== 'orch' || !atWs()) ? m : 'editor';
};
export const mode = (): string => (WIN > 1 ? 'editor' : modeOfOne());
export const FKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
export const FN_DEFAULT: Record<string, string> = { editor: 'F1', orch: 'F2', term: 'F3' };
export const modeFns = (): Record<string, string> => ({ ...FN_DEFAULT, ...fnKeys() });
export const setModeFn = (m: string, key: string | undefined) => setFnKey(m, key === FN_DEFAULT[m] ? undefined : key);
export const resetModeFns = () => Object.keys(FN_DEFAULT).forEach((m) => setFnKey(m));
export const modeOfFn = (key: string): string | undefined => Object.keys(FN_DEFAULT).find((m) => modeFns()[m] === key);
export const keepMode = (m: string) => WIN === 1 && store.set('modes' + amKey, { ...store.get('modes' + amKey, {}), [levelKey()]: m });
export const edShown = () => mode() === 'editor' || mode() === 'orch';
export function toEditor() {
  if (mode() !== 'editor') keepMode('editor');
}

const GROUPS: [RegExp, string][] = [
  [/\.(js|mjs|cjs|jsx|ts|tsx|py|rb|go|rs|java|kt|swift|c|h|cc|cpp|hpp|cs|php|lua|sh|ps1|bat|cmd|vue|svelte|dart)$/i, '#59c2ff'],
  [/\.(json|jsonc|ya?ml|toml|ini|cfg|conf|env|xml|csv|tsv|sql|lock|properties)$/i, '#e6b450'],
  [/\.(html?|css|scss|less|astro)$/i, '#95e6cb'],
  [/\.(png|jpe?g|gif|webp|bmp|ico|tiff?|psd|svg)$/i, '#c39bff'],
];
export const fileColor = (name: string): string => GROUPS.find(([re]) => re.test(name))?.[1] || '#d9e0d3';
export const hexOr = <T>(v: unknown, or: T): string | T => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : or);
export const colorOf = (t: { meta?: FileMeta; board?: boolean; name: string }): string => hexOr(t.meta?.color, null) || (t.board ? DEFAULT.board : fileColor(t.name));
export const styleMark = (x: { meta?: Record<string, unknown> } | null | undefined): number => {
  const m = x?.meta?.mark;
  return pref('filestyle:on') && typeof m === 'number' && [1, 2, 3, 4, 5, 6].includes(m) ? m : 0;
};

export function within(loc: string, anc: string): boolean {
  for (let c = S.dirs.get(loc), i = 0; c && i < 99; c = S.dirs.get(c.parent as string), i++) if (c.loc === anc) return true;
  return false;
}
export function soloOf(loc: string): string | null {
  let c = S.dirs.get(loc);
  if (!c) return null;
  if (c.parent == null) return c.loc;
  while (S.dirs.get(c.parent as string)?.parent != null) c = S.dirs.get(c.parent as string)!;
  return c.loc;
}

export const nameOf = (c: Folder): string => (c.kind === 'inbox' || c === S.inbox ? NAME.inbox : c.parent ? NAME.subfolder : NAME.folder);
export const tintOf = (d: Folder): string => (d.path ? col((d.meta?.color as string) || DEFAULT[d.kind]) : pjColor(projectOf(S.pid)));
export const dirGem = (d: { path: string; kind: string }): string => gem(d.path ? d.kind : 'project');
export const inboxTint = () => col(DEFAULT.inbox);

export const gemOf = (t: { board?: boolean; file?: boolean }): string => gem(gemKind(t));
export const sizeOf = (n: number): string => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export const countOf = (c: Folder): number => c.thoughts.length + c.kids.reduce((n, k) => n + countOf(k), 0);

export const matches = (t: { title: string; path?: string }): boolean => !S.query || t.title.toLowerCase().includes(S.query) || !!S.hits?.has(t.path as string);
