import { closeEditor, closeEditorNow, flushNow, focusScratch, newBoard, openScratch, openSketch, openThought, putScratchSel, scratchCaretY, scratchSel } from '../editor/editor.ts';
import { projectRel } from '../base/textbox.ts';
import { span, tag } from '../base/hitch.ts';
import { emptyBoard } from '../editor/board.ts';
import { agentsOn, agentWords, ask, setOpen } from '../base/controls.ts';
import { api, atWs, dirLabel, fileColor, gemOf, inboxLoc, levelKey, mode as modeNow, pageUrl, S, styleMark, toEditor, edShown } from '../base/model.ts';
import { page } from '../base/page.ts';
import { pickFolder } from './folderpick.ts';
import { chatOn, pref } from '../base/prefs.ts';
import { col } from '../base/theme.ts';
import { agents } from '../base/stream.ts';
import { record, resave, undoer } from '../base/undo.ts';
import { sortOf } from '../base/files.ts';
import { $, amElse, amKey, chatProgram, fileUrl, isChatTab, parentOf, setSave, showErr, store, uid } from '../base/util.ts';
import { beside, without } from '../base/split.ts';
import { busyNow, gem, workCorner, workGem } from '../base/kinds.ts';
import { askEnd, crystalOf, stillAt, titleOf } from '../base/agentlook.ts';
import { openAway, popWith, reach, send, share, WIN } from '../base/windows.ts';
import type { Layout, Note, OpenFile, Tab, TabGroup, TabNode, TabSplit } from '../base/types.ts';

interface TabKind {
  label: string;
  gem: string;
  key?: string;
  what?: string;
  doc?: boolean;
  path?: boolean;
  ext?: string;
  ws?: boolean;
  one?: boolean;
}
interface Caret {
  start?: number;
  end?: number;
  scroll?: number;
  y?: number;
  at?: number;
  title?: boolean;
  focus?: boolean;
}
interface Revive {
  session: string | undefined;
  type: string;
  draft: string;
}
interface Snap {
  root: TabNode;
  active: string | null;
}
interface LayoutStep {
  ed: string;
  kind: string;
  before: Snap;
  after: Snap;
  revive?: Record<string, Revive>;
}
interface LayoutSet {
  at: number;
  ed: Layout;
  revive: Record<string, Revive>;
}
type Cell = [number, number, number, number, string | undefined, boolean];
type Where = () => TabGroup | null | undefined;

export const TYPES: Record<string, TabKind> = {
  mind: { label: 'mind', gem: 'core', key: '1', what: 'the web of everything here' },
  board: { label: 'board', gem: 'board', doc: true, key: 'b', what: 'a new board to draw on' },
  file: { label: 'file', gem: 'file', path: true },
  text: { label: 'file', gem: 'file', path: true, key: 'f', what: 'a new file: any name, any extension' },
  md: { label: '.md file', gem: 'file', ext: '.md', what: 'a new markdown file' },
  txt: { label: '.txt file', gem: 'file', ext: '.txt', what: 'a new text file' },
  ext: { label: 'file', gem: 'file', ws: true },
  open: { label: 'open a file', gem: 'file', ws: true, what: 'any file on this PC, left where it is' },
  scratch: { label: 'scratch', gem: 'scratch', one: true, doc: true, what: 'one plain text that is always there' },
  sketch: { label: 'sketch', gem: 'sketch', one: true, doc: true, what: 'a board to paint on and drop images onto' },
  inbox: { label: 'INBOX', gem: 'inbox', one: true, what: 'every file in the inbox' },
  list: { label: 'list', gem: 'folder', one: true, key: '2', what: 'everything, as boxes of rows' },
  archive: { label: 'archive', gem: 'archive', one: true, key: '4', what: 'archived things, to bring back' },
  ai: { label: 'Claude Agent', gem: 'ai', what: 'an AI agent that works in this project with you' },
  codex: { label: 'Codex Agent', gem: 'ai', what: 'Codex in this project, with its own account and permissions' },
  antigravity: { label: 'Antigravity Agent', gem: 'ai', what: 'Antigravity in this project, with its own account and permissions' },
  cursor: { label: 'Cursor Agent', gem: 'ai', what: 'Cursor in this project, with its own account and permissions' },
  copilot: { label: 'Copilot Agent', gem: 'ai', what: 'GitHub Copilot in this project, with its own account and permissions' },
  grok: { label: 'Grok Agent', gem: 'ai', what: 'Grok in this project, with its own account and permissions' },
  term: { label: 'terminal', gem: 'term', what: 'a terminal in the project folder' },
  browser: { label: 'browser', gem: 'link', what: 'a website in a tab: a local server or any address' },
  new: { label: 'new tab', gem: 'link', ws: true },
  diff: { label: 'diff', gem: 'file' },
  review: { label: 'review', gem: 'file' },
  pane: { label: 'view', gem: 'file' },
};

export const NEWTAB = ['md', 'text', 'browser', 'ai', 'term', 'mind', 'board', 'txt', 'open', 'list', 'archive', 'scratch', 'sketch', 'codex', 'antigravity', 'cursor', 'copilot', 'grok'];
export const setNewTabOrder = (list: string[]) => store.set('newtab-order', list);
export const tileOn = (k: string): boolean => !isChatTab(k) || chatOn(chatProgram(k));
export const newTabOrder = () => {
  const saved = store.get('newtab-order', []).filter((k: string) => NEWTAB.includes(k));
  return [...saved, ...NEWTAB.filter((k) => !saved.includes(k))];
};

export const ED = $<HTMLElement>('#editor');

export let W: Layout | null = null;
let going: string | null = null;
export const edAt = () => going ?? W?.id;
export let eds: Layout[] = [];
let O: Layout | null = null, back: string | null = null;
export const allEds = (): Layout[] => (O ? [...eds, O] : eds);
export const orchOn = () => !!O && W === O;
export const lastEd = (): string | undefined => (W && W === O ? (eds.find((e) => e.id === back) || eds[0])?.id : W?.id);
let mru: string[] = [];
let closed: { t: Tab; g: string; i: number }[] = [];
export const pages = new Map<string, any>();
const carets = new Map<string, Caret>();
export const chats = new Map<string, any>();
export const textTabs = new Map<string, any>();
export const terms = new Map<string, any>();
export const browsers = new Map<string, any>();
export const diffs = new Map<string, any>();
export const reviews = new Map<string, any>();
export const panes = new Map<string, { el: HTMLElement; stop?: () => void }>();

const key = (n = WIN) => 'tabs:' + levelKey() + amKey + (n > 1 ? '#' + n : '');
export const tab = (type: string, path: string | null = null): Tab => ({ id: uid(), type, path });
export const group = (tabs: Tab[]): TabGroup => ({ g: uid(), tabs, on: tabs[0]?.id ?? null });
export function groups(n: TabNode | null | undefined = W?.root, out: TabGroup[] = []): TabGroup[] {
  if (n?.g) out.push(n as TabGroup);
  else if (n) for (const k of n.kids!) groups(k, out);
  return out;
}
export const groupById = (id: string | null) => groups().find((g) => g.g === id);
export const groupOf = (id: string | null) => groups().find((g) => g.tabs.some((t) => t.id === id));
export const tabById = (id: string | null) => groupOf(id)?.tabs.find((t) => t.id === id);
export const shown = (g: TabGroup | null | undefined) => g?.tabs.find((t) => t.id === g.on) || g?.tabs[0];
export function findTab(fn: (t: Tab) => unknown): { g: TabGroup; t: Tab } | null {
  for (const g of groups()) {
    const t = g.tabs.find(fn);
    if (t) return { g, t };
  }
  return null;
}
export const ofFile = (t: Tab) => !!(TYPES[t.type].doc || TYPES[t.type].path);
export const docTab = (path: string) => findTab((t) => t.path === path && ofFile(t));
const typeOf = (th: Note) => (th.board ? 'board' : th.file ? 'file' : 'text');
export const writes = (t: Tab | null | undefined): t is Tab => !!TYPES[t?.type as string]?.doc;
export const fileTab = (th: Note) => tab(typeOf(th), th.path);
export const activeGroup = () => groupById(W!.active) || groups()[0];
export const shows = (type: string) => (type === 'settings' ? S.settingsOpen : !!W && groups().some((g) => shown(g)?.type === type));
const onScreen = (id: string) => groups().some((g) => shown(g)?.id === id);
export const mindsShown = () => (W ? groups().map(shown).filter((t) => t?.type === 'mind').map((t) => t!.id) : []);
export function mindInUse() {
  if (!W) return null;
  const g = [activeGroup(), ...mru.map(groupById)].find((g) => shown(g)?.type === 'mind') || groups().find((g) => shown(g)?.type === 'mind');
  return g ? shown(g)!.id : null;
}

export function placeBeside(target: TabNode, ng: TabGroup, side: string) {
  W!.root = beside(W!.root, target, ng, side) as TabNode;
  return ng;
}
function dropGroup(g: TabGroup, e: Layout = W!) {
  if (e.root === g) {
    const t = tab('new');
    g.tabs = [t];
    g.on = t.id;
    return;
  }
  e.root = without(e.root, g) as TabNode;
  const left = groups(e.root);
  if (e.active === g.g) e.active = mru.find((id) => id !== g.g && left.some((x) => x.g === id)) || left[0].g;
}
export function pull(t: Tab, e: Layout = W!) {
  const g = groups(e.root).find((x) => x.tabs.some((o) => o.id === t.id));
  if (!g) return;
  const i = g.tabs.indexOf(t);
  g.tabs.splice(i, 1);
  if (g.on === t.id) g.on = (g.tabs[i] || g.tabs[i - 1])?.id ?? null;
  if (!g.tabs.length) dropGroup(g, e);
}
export function put(g: TabGroup, t: Tab, at: number | null = null) {
  const cur = shown(g);
  if (cur?.type === 'new' && t.type !== 'new') g.tabs.splice(g.tabs.indexOf(cur), 1, t);
  else g.tabs.splice(at ?? (cur ? g.tabs.indexOf(cur) + 1 : g.tabs.length), 0, t);
  g.on = t.id;
  use(g);
  if (!edShown()) toEditor();
}
export function use(g: TabGroup) {
  W!.active = g.g;
  mru = [g.g, ...mru.filter((id) => id !== g.g)];
}

const DRAFT = (type: string) => type === 'scratch' || type === 'sketch';
const keep = (t: Tab) => t.type !== 'diff' && t.type !== 'review' && t.type !== 'pane' && !(TYPES[t.type].doc && !DRAFT(t.type) && !t.path) && !(t.type === 'ext' && !t.abs);
const bare = ({ id, type, path, abs, url, chat, term, title, preview }: Tab): Tab => ({ id, type, path: path ?? null, ...(abs ? { abs: String(abs) } : {}), ...(url ? { url: String(url) } : {}), ...(preview ? { preview: true } : {}),...(chat ? { chat: String(chat) } : {}), ...(term ? { term: String(term) } : {}), ...(title ? { title: String(title).slice(0, 80) } : {}) });
const clean = (n: TabNode): TabNode => (n.g ? { g: n.g, on: n.on, tabs: n.tabs.filter(keep).map(bare) } : { id: n.id!, split: n.split!, sizes: n.sizes!, kids: n.kids!.map(clean) });
export function save(step = true) {
  if (!W) return;
  store.set(key(), { eds: eds.map((e) => ({ id: e.id, root: clean(e.root), active: e.active, ...(e.name ? { name: e.name } : {}), ...(e.color ? { color: e.color } : {}), ...(e.mark ? { mark: e.mark } : {}) })), on: lastEd(), ...(O ? { orch: { root: clean(O.root), active: O.active } } : {}) });
  track(step);
  shareOpen();
  page.paintSwitch();
}
const shareOpen = () => {
  const all = allEds().flatMap((e) => allTabs(e.root));
  share(levelKey(), all.filter((t) => t.path && ofFile(t)).map((t) => t.path!), all.map((t) => t.chat || t.term).filter(Boolean) as string[], all.filter((t) => TYPES[t.type]?.one).map((t) => t.type));
};
function valid(n: any, seen = new Set<string>()): TabNode | null {
  if (!n || typeof n !== 'object') return null;
  if (n.g) {
    const tabs: Tab[] = (Array.isArray(n.tabs) ? n.tabs : [])
      .map((t: any) => (t?.type === 'note' ? { ...t, type: 'text' } : t))
      .filter((t: any) => {
        const T = TYPES[t?.type];
        if (!T || typeof t.id !== 'string' || (atWs() && !T.ws) || !keep(t)) return false;
        if (T.one && seen.has(t.type)) return false;
        seen.add(t.type);
        return true;
      })
      .map(bare);
    return tabs.length ? { g: String(n.g), tabs, on: tabs.some((t) => t.id === n.on) ? n.on : tabs[0].id } : null;
  }
  if ((n.split !== 'row' && n.split !== 'col') || !Array.isArray(n.kids)) return null;
  const kids: TabNode[] = [], sizes: number[] = [];
  n.kids.forEach((k: unknown, i: number) => {
    const v = valid(k, seen);
    if (!v) return;
    kids.push(v);
    sizes.push(Number(n.sizes?.[i]) > 0 ? Number(n.sizes[i]) : 1);
  });
  if (kids.length < 2) return kids[0] || null;
  return { id: String(n.id || uid()), split: n.split, kids, sizes };
}
const blank = () => group([tab('new')]);
const isBlank = (root: TabNode) => !!root.g && root.tabs.every((t) => t.type === 'new');
export function level() {
  closed = [];
  last.clear();
  for (const c of chats.values()) c.detach();
  chats.clear();
  for (const x of terms.values()) x.detach();
  terms.clear();
  for (const x of textTabs.values()) x.stop();
  textTabs.clear();
  for (const x of browsers.values()) x.stop();
  browsers.clear();
  diffs.clear();
  reviews.forEach((v) => v.stop());
  reviews.clear();
  panes.forEach((v) => v.stop?.());
  panes.clear();
  pages.clear();
  if (atWs() && !S.wsEditor) {
    W = O = null;
    eds = [];
    share(levelKey(), []);
    return;
  }
  const saved = store.get(key(), null);
  const old = !!saved && !Array.isArray(saved.eds);
  const list = old ? [saved, store.get(key() + ':previous', null)].filter((e, i) => !i || valid(e?.root)) : saved?.eds?.length ? saved.eds : [null];
  eds = list.map((e: any) => ({ id: typeof e?.id === 'string' ? e.id : uid(), root: valid(e?.root) || blank(), active: e?.active, ...(typeof e?.name === 'string' && e.name ? { name: e.name.slice(0, 60) } : {}), ...(typeof e?.color === 'string' && e.color ? { color: e.color } : {}), ...(typeof e?.mark === 'string' && e.mark ? { mark: e.mark } : {}) }));
  for (const e of eds) if (!groups(e.root).some((g) => g.g === e.active)) e.active = groups(e.root)[0].g;
  W = eds.find((e) => e.id === saved?.on) || eds[0];
  O = WIN > 1 ? null : { id: 'orch', root: valid(saved?.orch?.root) || blank(), active: saved?.orch?.active };
  if (O && !groups(O.root).some((g) => g.g === O!.active)) O.active = groups(O.root)[0].g;
  back = null;
  fresh();
  if (old) {
    save();
    store.del(key() + ':previous');
  } else if (eds.some((e, i) => e.id !== saved?.eds?.[i]?.id)) save(false);
  track(false);
  shareOpen();
}
function fresh() {
  mru = [W!.active!];
}
export function prune() {
  if (!W) return;
  let gone = false;
  for (const e of allEds())
    for (const g of groups(e.root))
      for (const t of [...g.tabs]) {
        if (t.path && ofFile(t) && !S.thoughts.has(t.path) && S.open?.tab !== t.id) {
          pull(t, e);
          gone = true;
        }
      }
  if (gone) save(false);
}
export function renamed(from: string, to: string) {
  if (!W) return;
  for (const e of allEds()) for (const t of allTabs(e.root)) if (t.path === from || t.path?.startsWith(from + '/')) t.path = to + t.path!.slice(from.length);
  save(false);
}
export const tabsState = () => W;

const upFirst = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
export function look(t: Tab) {
  const T = TYPES[t.type];
  if (t.type === 'text' || t.type === 'ext' || t.type === 'file') {
    const name = (t.abs ?? t.path)!.split(/[\\/]/).pop()!, th = (!t.abs && S.thoughts.get(t.path!)) as Note | undefined;
    const ags = agentsOn(t.abs ? (projectRel(t.abs) ?? name) : t.path!);
    const path = (t.abs ?? t.path)!, read = ags.length ? `Read by ${agentWords(ags)}.` : '';
    const tip = t.abs || path.includes('/') ? `${path}\nThe file this tab shows, and the folder it is in.${read ? '\n' + read : ''}` : read ? `${name}\n${read}` : '';
    return { name, mark: gem('file'), color: col(th ? th.color : fileColor(name)), tip, badge: styleMark(th) };
  }
  if (T.doc && !DRAFT(t.type)) {
    const th = (t.path && S.thoughts.get(t.path)) as Note | undefined;
    const name = th?.title || `new ${T.label}`;
    return { name, mark: th ? gemOf(th) : gem(T.gem), color: th?.color ? col(th.color) : 'var(--accent)', tip: th ? `${th.title} · ${dirLabel(th.dir)}` : name, badge: styleMark(th) };
  }
  if (t.type === 'browser') return { name: t.title || T.label, mark: gem(T.gem), color: 'var(--accent)', tip: t.url ? `${t.url}\nThe page this browser tab shows.` : `${upFirst(T.label)}\n${upFirst(T.what!)}.` };
  if (t.type === 'diff') {
    const d = diffs.get(t.id)?.data, file = (t.title || T.label).replace(/ · diff$/, '');
    return { name: t.title || T.label, mark: gem(T.gem), color: 'var(--accent)', st: '', tip: `Diff: ${file}\nWhat changed in ${d ? d.rel || projectRel(d.path) || d.path : file}.` };
  }
  const name = isChatTab(t.type) && t.type !== 'ai' && t.title ? `${T.label}: ${t.title}` : t.title || T.label;
  const id = t.chat || t.term, what = t.title ? `${T.label}: ${t.title}` : T.what || T.label;
  const tip = id ? `${crystalOf(id).code} · ${what}` : !t.title && T.what ? `${upFirst(name)}\n${upFirst(T.what)}.` : what, now = agents.all.get(id as string)?.status, st = now === 'asks' || now === 'done' ? now : '';
  const busy = !!id && busyNow({ status: now }), mark = !busy ? gem(T.gem) : T.gem === 'ai' ? workGem() : gem(T.gem) + workCorner();
  if (t.chat && isChatTab(t.type)) {
    const state = now === 'asks' ? ' It is waiting for your answer.' : busy ? ' It is working.' : now === 'done' ? ' It is done.' : '';
    return { name, mark, color: 'var(--accent)', st, tip: `${t.title || T.label}\nA chat with ${T.label.replace(/ Agent$/, '')}.${state}\n\nType @${crystalOf(t.chat).code} in another chat to point that chat at this one.` };
  }
  return { name, mark, color: 'var(--accent)', st, tip: st ? `${tip}\n\n${st === 'asks' ? 'waiting for you' : 'done'}` : busy ? `${tip}\n\nworking` : tip };
}
export const allTabs = (n: TabNode, out: Tab[] = []): Tab[] => (n.g ? out.push(...n.tabs) : n.kids!.forEach((k) => allTabs(k, out)), out);
function boxes(n: TabNode, x = 0, y = 0, w = 1, h = 1, out: Cell[] = []): Cell[] {
  if (n.g) {
    out.push([x, y, w, h, shown(n as TabGroup)?.type, n.tabs.some((t) => /^(working|starting)$/.test(agents.all.get((t.chat || t.term) as string)?.status || ''))]);
    return out;
  }
  const sum = n.sizes!.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  n.kids!.forEach((k, i) => {
    const part = n.sizes![i] / sum;
    if (n.split === 'row') boxes(k, x + at * w, y, part * w, h, out);
    else boxes(k, x, y + at * h, w, part * h, out);
    at += part;
  });
  return out;
}
export const editors = () => eds.map((e) => ({ id: e.id, color: e.color, mark: e.mark, on: e === W, empty: isBlank(e.root), boxes: boxes(e.root), names: [...new Set(allTabs(e.root).filter((t) => keep(t) && t.type !== 'new').map((t) => look(t).name))] }));
function swap(fn: () => unknown) {
  if (!W) return Promise.resolve();
  queue = queue
    .then(async () => {
      if (S.open) await release(S.open);
      fn();
      if (going === W!.id || !eds.some((e) => e.id === going)) going = null;
      if (!groupById(W!.active)) W!.active = groups()[0].g;
      fresh();
      save();
    })
    .then(follow)
    .catch(showErr);
  return queue;
}
export function editorsOfAm(n: number, pid: string): { id: string; color?: string; boxes: Cell[] }[] {
  const saved = store.get('tabs:' + levelKey(S.wid, pid) + (n > 1 ? '@' + n : ''), null), list = Array.isArray(saved?.eds) ? saved.eds : [];
  const out = list.flatMap((e: any) => {
    const root = typeof e?.id === 'string' && valid(e.root);
    return root ? [{ id: e.id as string, ...(typeof e.color === 'string' && e.color ? { color: e.color as string } : {}), boxes: boxes(root) }] : [];
  });
  return out.length ? out : [{ id: '', boxes: [] }];
}
export function putAway(ed: string, t: Tab) {
  if (!W) return Promise.resolve();
  let e = ed === 'new' ? null : eds.find((x) => x.id === (ed === '' ? lastEd() : ed)) || W;
  if (!e) {
    const g = group([t]);
    eds.push((e = { id: uid(), root: g, active: g.g }));
    return commit();
  }
  const g = groups(e.root).find((x) => x.g === e!.active) || groups(e.root)[0], cur = shown(g);
  if (cur?.type === 'new') g.tabs.splice(g.tabs.indexOf(cur), 1, t);
  else g.tabs.push(t);
  g.on = t.id;
  return commit();
}
export function showEditor(id: string) {
  const e = eds.find((x) => x.id === id);
  if (!e) return Promise.resolve();
  toEditor();
  if (e === W) return sync();
  going = id;
  page.layout();
  return swap(() => eds.includes(e) && (W = e));
}
export function useOrch(on: boolean) {
  if (!W || !O || on === (W === O)) return Promise.resolve();
  if (on) {
    const was = W.id;
    return swap(() => O && ((back = was), (W = O)));
  }
  return swap(() => W === O && (W = eds.find((e) => e.id === back) || eds[0]));
}
export const nextEditor = () => eds.length > 1 && showEditor(eds[(eds.indexOf(W!) + 1) % eds.length].id);
export function addEditor(color?: string) {
  if (!W) return Promise.resolve();
  toEditor();
  return swap(() => {
    W = { id: uid(), root: blank(), active: null, ...(color && { color }) };
    eds.push(W);
  });
}
export function moveEditor(id: string, to: number) {
  const i = eds.findIndex((x) => x.id === id);
  if (i < 0 || to === i || to < 0 || to >= eds.length) return;
  eds.splice(to, 0, ...eds.splice(i, 1));
  save();
}
export function markEditor(id: string, patch: Partial<Record<'name' | 'color' | 'mark', string | null>>) {
  const e = eds.find((x) => x.id === id);
  if (!e) return;
  for (const [k, v] of Object.entries(patch) as ['name' | 'color' | 'mark', string | null][]) v ? (e[k] = v) : delete e[k];
  save(false);
}
export function editorLoad(id: string) {
  const ts = allTabs(eds.find((x) => x.id === id)?.root || blank()).filter((t) => keep(t) && t.type !== 'new');
  return { tabs: ts.length, agents: ts.filter((t) => isChatTab(t.type) || t.type === 'term').length };
}
export function dropEditor(id: string, step = true) {
  const e = eds.find((x) => x.id === id);
  if (!e) return Promise.resolve();
  const drop = () => {
    const i = eds.indexOf(e);
    if (i < 0) return;
    const revive: Record<string, Revive> = {};
    for (const t of allTabs(e.root)) {
      const a = isChatTab(t.type) && agents.all.get(t.chat as string);
      if (a) ended.set(t.id, (revive[t.id] = { session: a.session || undefined, type: t.type, draft: chats.get(t.id)?.draft() || '' }));
      endTab(t);
    }
    if (i > 0 && step) record('layoutset', `closed layout ${i + 1}`, { at: i, ed: { id: e.id, root: clean(e.root), active: e.active, ...(e.name ? { name: e.name } : {}), ...(e.color ? { color: e.color } : {}), ...(e.mark ? { mark: e.mark } : {}) }, revive });
    if (i === 0) {
      e.root = blank();
      e.active = null;
      return;
    }
    if (W === e) W = eds[i + 1] || eds[i - 1];
    eds.splice(i, 1);
  };
  if (e === W) return swap(drop);
  drop();
  return commit();
}

export function commit() {
  save();
  return sync();
}
export function activate(g: TabGroup, t: Tab) {
  if (g.on !== t.id) tag(`switch ${tabById(g.on)?.type || 'none'} → ${t.type}`);
  g.on = t.id;
  use(g);
  if (!edShown()) toEditor();
  return commit();
}
export function openView(type: string, into: TabGroup | null = null) {
  if (type === 'web') type = 'mind';
  if (!W || !TYPES[type]) return;
  const own = into && groupById(into.g) && into.tabs.find((t) => t.type === type);
  if (own) return activate(into, own);
  const hit = findTab((t) => t.type === type);
  if (hit && !into) return activate(hit.g, hit.t);
  const move = hit && TYPES[type].one;
  if (move) pull(hit.t);
  put(into && groupById(into.g) ? into : activeGroup(), move ? hit.t : tab(type));
  return commit();
}
export function targetGroup(beside = false) {
  const a = activeGroup();
  if (beside) return [...mru.map(groupById), ...groups()].find((g) => g && g !== a) || a;
  return a;
}
export function unfoldTo(path: string) {
  for (let p = parentOf(path); p; p = parentOf(p)) setOpen(p, true);
  if (path.startsWith(inboxLoc() + '/')) setOpen('#inbox', true);
  setOpen('', true);
  page.renderTree();
}
export const urlTab = (url: string) => {
  const file = /^file:/i.test(url), lo = url.toLowerCase();
  return findTab((t) => t.type === 'browser' && (t.url === url || (file && t.url?.toLowerCase() === lo)));
};
export const pageTab = (path: string) => {
  const url = pageUrl(path);
  return url && urlTab(url);
};
export function openInTab(path: string, { beside = false, side = false, into = null, preview = false, text = false }: { beside?: boolean; side?: boolean; into?: TabGroup | null; preview?: boolean; text?: boolean } = {}) {
  if (!W) return;
  const url = text ? null : pageUrl(path);
  const hit = url ? pageTab(path) : docTab(path);
  if (hit) return activate(hit.g, hit.t);
  const th = S.thoughts.get(path);
  if (!th) return void setSave(`“${path.split('/').pop()}” is not in the file list: moved or deleted?`, true);
  if (!preview) unfoldTo(path);
  const pv = preview && !into && groups().find((x) => x.tabs.some((t) => t.preview));
  const g = into || pv || (side ? placeBeside(activeGroup(), group([]), 'right') : targetGroup(beside));
  const old = preview ? g.tabs.findIndex((t) => t.preview) : -1;
  if (old >= 0) endTab(g.tabs.splice(old, 1)[0]);
  put(g, Object.assign(url ? { ...tab('browser'), url } : fileTab(th), preview ? { preview: true } : {}), old >= 0 ? old : null);
  return commit();
}
const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const extTab = (abs: string) => findTab((t) => t.type === 'ext' && sameFile(t.abs!, abs));
export async function openExternal(abs: string, { into = null, at = null, preview = false }: { into?: Where | null; at?: number | null; preview?: boolean } = {}) {
  if (!W) return;
  const rel = projectRel(abs);
  if (rel && S.thoughts.has(rel)) return openInTab(rel, { into: docTab(rel) ? null : into?.() || null });
  if (window.amethyst?.webview && sortOf(abs) === 'pdf') {
    const url = fileUrl(abs), have = findTab((t) => t.type === 'browser' && t.url === url);
    if (have) return activate(have.g, have.t);
    put(into?.() || targetGroup(), Object.assign(tab('browser'), { url }), at);
    return commit();
  }
  const hit = extTab(abs);
  if (hit) return activate(hit.g, hit.t);
  try {
    const { path } = await api('GET', '/api/ext?peek=1&path=' + encodeURIComponent(abs), undefined, '');
    const now = extTab(path);
    if (now) return activate(now.g, now.t);
    const pv = preview && !into ? groups().find((x) => x.tabs.some((t) => t.preview)) : null;
    const g = into?.() || pv || targetGroup();
    const old = preview ? g.tabs.findIndex((t) => t.preview) : -1;
    if (old >= 0) endTab(g.tabs.splice(old, 1)[0]);
    put(g, Object.assign(tab('ext'), { abs: path }, preview ? { preview: true } : {}), old >= 0 ? old : at);
    return commit();
  } catch (e) {
    showErr(e);
  }
}
export function goLineOf(abs: string, n: number, tries = 10) {
  const rel = projectRel(abs), hit = (rel && docTab(rel)) || extTab(abs), x = hit && textTabs.get(hit.t.id);
  if (x) return x.goLine(n);
  if (hit && tries) requestAnimationFrame(() => goLineOf(abs, n, tries - 1));
}
export function goLineIn(rel: string, n: number, tries = 10) {
  const hit = docTab(rel), x = hit && textTabs.get(hit.t.id);
  if (x) return x.goLine(n);
  if (tries) requestAnimationFrame(() => goLineIn(rel, n, tries - 1));
}
export function dropExt(abs: string) {
  const hit = extTab(abs);
  if (hit) return closeTab(hit.t.id);
}
export async function pickFiles() {
  return page.openFiles((await window.amethyst?.pickFiles?.()) || []);
}
export function keepTab(id?: string | null) {
  const t = (id && tabById(id)) as Tab | undefined;
  if (!t?.preview) return;
  delete t.preview;
  return commit();
}
export async function newInTab(type = 'board', into: TabGroup | Where | null = null, dir = '') {
  if (!W || atWs()) return;
  const name = await page.nameInTree({ dir, kind: type });
  if (!name) return;
  const path = await fileNamed(dir, /\.svg$/i.test(name) ? name : name + '.svg', emptyBoard());
  return path && openInTab(path, { into: (typeof into === 'function' ? into() : into && groupById(into.g)) || null });
}
export async function makeFile(dir: string | null = null, ext = '') {
  if (dir === null) {
    const to = pref('newfile:to');
    dir = to === 'inbox' ? inboxLoc() : to === 'project' ? '' : await pickFolder(ext);
    if (dir === null) return null;
  }
  const name = await page.nameInTree({ dir, kind: 'file', ext });
  return name && name !== ext ? fileNamed(dir, name) : null;
}
export async function fileNamed(dir: string, name: string, content = '') {
  try {
    const r = await api('POST', '/api/file', { dir, name, content });
    record('files', `made “${r.path.split('/').pop()}”`, { ops: [{ op: 'made', path: r.path }] });
    await page.reload();
    return r.path;
  } catch (e) {
    showErr(e);
    return null;
  }
}
export async function newFile(dir: string | null = null, where: Where | null = null, ext = '') {
  if (!W || atWs()) return;
  const path = await makeFile(dir, ext);
  return path && openInTab(path, where ? { into: where() } : {});
}
export function openQuick(path: string) {
  const hit = docTab(path);
  if (hit) return activate(hit.g, hit.t);
  return S.thoughts.get(path)?.code ? openInTab(path, { beside: true }) : openThought(path);
}
async function draft(type: string) {
  if (!W) return;
  const hit = findTab((t) => t.type === type);
  if (hit) return hit.g.on === hit.t.id && hit.g === activeGroup() && modeNow() === 'editor' ? closeTab(hit.t.id) : activate(hit.g, hit.t);
  if (await raise(type)) return;
  const mode = type === 'sketch' ? 'board' : 'text';
  return S.open?.scratch && S.open.mode === mode ? closeEditor() : openScratch(null, mode);
}
export const scratch = () => draft('scratch');
export const sketch = () => draft('sketch');
export async function raise(type: string) {
  const n = popWith(levelKey(), type);
  return !!n && (await reach(n, [['raise', {}]]));
}
async function toTab() {
  const o = S.open;
  if (!o || o.tab) return;
  if (o.scratch) return openView(o.mode === 'board' ? 'sketch' : 'scratch', targetGroup(true));
  await flushNow();
  if (o.path) return openInTab(o.path, { beside: true });
}
$('#ed-tab').addEventListener('click', toTab);

export function closeTab(id: string, commitNow = true) {
  const t = tabById(id), g = groupOf(id);
  if (!t) return;
  if (t.type !== 'new' && !isChatTab(t.type) && t.type !== 'term' && keep(t)) closed = [{ t: { ...t }, g: g!.g, i: g!.tabs.indexOf(t) }, ...closed].slice(0, 20);
  const a = isChatTab(t.type) && agents.all.get(t.chat as string);
  if (a) ended.set(t.id, { session: a.session || undefined, type: t.type, draft: chats.get(t.id)?.draft() || '' });
  endTab(t);
  pull(t);
  return commitNow && commit();
}
const agentOf = (t: Tab) => agents.all.get((t.type === 'term' ? t.term : isChatTab(t.type) && t.chat) as string);
const whyKeep = (t: Tab) => stillAt(agentOf(t)) || (isChatTab(t.type) && chats.get(t.id)?.draft()?.trim() ? 'Its chat box has text not sent yet.' : '');
export const busyIn = (ts: Tab[]) => ts.filter(whyKeep);
async function endChoice(ts: Tab[], again = false) {
  const busy = busyIn(ts);
  if (!busy.length) return 'close';
  const one = busy.length === 1, a = agentOf(busy[0]), c = again && ts.length === 1 && isChatTab(ts[0].type) && chats.get(ts[0].id);
  return askEnd(one ? `End “${a ? titleOf(a) : look(busy[0]).name}”?` : `End ${busy.length} chats?`, one ? whyKeep(busy[0]) : 'Some are still at work, wait for you, have answers not read yet or text not sent.', 'A chat can be picked up again with undo; a terminal and what runs in it stop.', !!c?.clear);
}
export const mayEnd = async (ts: Tab[]) => (await endChoice(ts)) === 'close';
export async function closeTabAsking(ids: string[], sure = false) {
  const ts = ids.map(tabById).filter(Boolean) as Tab[];
  if (!ts.length) return;
  const r = sure ? 'close' : await endChoice(ts, true);
  if (r === 'restart') return chats.get(ts[0].id)?.clear();
  if (r !== 'close') return;
  for (const t of ts) closeTab(t.id, false);
  return commit();
}

export const foreign = (t: Tab): Tab | null => (TYPES[t?.type] && typeof t.id === 'string' && keep(t) ? { ...bare(t), id: uid() } : null);
export const movable = (id: string) => {
  const t = tabById(id);
  return !!t && keep(t) && !(S.open?.tab === id && !S.open.path && !S.open.scratch);
};
export const dropTabs = (n: number) => store.del(key(n));
export function storeTab(n: number, t: Tab) {
  const saved = store.get(key(n), null), e = saved?.eds?.[0];
  const root = valid(e?.root) || blank();
  const g = groups(root).find((x) => x.g === e?.active) || groups(root)[0];
  const cur = shown(g), it = bare(t);
  if (cur?.type === 'new') g.tabs.splice(g.tabs.indexOf(cur), 1, it);
  else g.tabs.push(it);
  g.on = it.id;
  const id = typeof e?.id === 'string' ? e.id : uid();
  store.set(key(n), { eds: [{ id, root, active: g.g }], on: id });
  send('tabstored', { win: n });
}
export function giveAway(id: string) {
  const t = tabById(id);
  if (!t) return;
  away(id);
  pull(t);
  save(false);
  return sync();
}
export const chatEds = (id: string) => allEds().flatMap((e, i) => (allTabs(e.root).some((t) => isChatTab(t.type) && t.chat === id) ? [{ ed: e.id, n: i + 1, label: e.name || '', orch: e === O }] : []));
export function letGoChat(id: string, edIds: string[]) {
  let hit = false;
  for (const e of allEds().filter((x) => edIds.includes(x.id)))
    for (const t of allTabs(e.root).filter((x) => isChatTab(x.type) && x.chat === id)) {
      away(t.id);
      pull(t, e);
      hit = true;
    }
  if (!hit) return;
  save(false);
  return sync();
}
function away(id: string) {
  chats.get(id)?.detach();
  terms.get(id)?.detach();
  textTabs.get(id)?.stop();
  browsers.get(id)?.stop();
  for (const m of [chats, terms, textTabs, browsers, pages, carets, diffs]) m.delete(id);
}
const redone = new Map<number, Record<string, unknown>>();
export const closing = (n: number, d: Record<string, unknown>) => redone.set(n, d);
export function takeTabs(n: number) {
  const saved = store.get(key(n), null);
  store.del(key(n));
  const out: Tab[] = [];
  for (const e of saved?.eds || []) {
    const root = valid(e?.root) || blank(), on = groups(root).find((g) => g.g === e.active)?.on;
    const all = allTabs(root);
    out.push(...([...all.filter((t) => t.id !== on), ...all.filter((t) => t.id === on)].map(foreign).filter((t) => t && t.type !== 'new') as Tab[]));
  }
  return out;
}
export function takeBack(n: number, keep: string[] = []) {
  const saved = store.get(key(n), null), d = redone.get(n);
  store.del(key(n));
  redone.delete(n);
  if (!W || !saved?.eds) return;
  const ids: string[] = [], gone: Tab[] = [], ticked = new Set(keep);
  let block: TabNode | null = null;
  for (const e of saved.eds) {
    const kept = pruned(valid(e?.root) || blank(), (t: Tab) => {
      const it = foreign(t);
      if (!it || it.type === 'new') return null;
      if (ticked.has(t.id)) return ids.push(it.id), it;
      endTab(t);
      gone.push(it);
      return null;
    });
    if (kept) block = block ? (beside(block, block, kept, 'right') as TabNode) : kept;
  }
  if (!ids.length && !gone.length) return;
  if (block) {
    const set = eds[0], bare = set.root.g && set.root.tabs.every((t) => t.type === 'new');
    set.root = bare ? block : (beside(set.root, set.root, block, 'right') as TabNode);
    if (bare) set.active = groups(block)[0].g;
  }
  setSave(ids.length ? `Window ${n} closed: ${ids.length} ${ids.length === 1 ? 'tab is' : 'tabs are'} in the editor (set 1)` : `Window ${n} closed`);
  save(false);
  if (d) (resave as (d: any) => void)(Object.assign(d, { ids, gone }));
  else record('window', `closed Window ${n}`, { n, ids, gone });
  return sync();
}
function pruned(n: TabNode, keep: (t: Tab) => Tab | null): TabNode | null {
  if (n.g) {
    const tabs = n.tabs.map((t): [Tab, Tab | null] => [t, keep(t)]).filter(([, x]) => x);
    if (!tabs.length) return null;
    return { g: uid(), tabs: tabs.map(([, x]) => x!), on: (tabs.find(([t]) => t.id === n.on) || tabs[0])[1]!.id };
  }
  const kids = n.kids!.map((k, i): [TabNode | null, number] => [pruned(k, keep), n.sizes![i] ?? 1]).filter(([k]) => k);
  if (kids.length < 2) return kids[0]?.[0] || null;
  return { id: uid(), split: n.split!, kids: kids.map(([k]) => k!), sizes: kids.map(([, s]) => s) };
}
export async function askClose() {
  const items: { id: string; group: string; name: string; mark: string; busy: string }[] = [];
  let k = 0;
  for (const e of eds)
    for (const g of groups(e.root)) {
      k++;
      for (const t of g.tabs.filter((x) => x.type !== 'new')) {
        const l = look(t);
        items.push({ id: t.id, group: `group ${k}`, name: l.name, mark: l.mark, busy: whyKeep(t) ? `Still busy\n${whyKeep(t)}` : '' });
      }
    }
  if (!items.length) return [];
  save(false);
  const runs = allTabs({ kids: eds.map((e) => e.root) } as TabSplit).some((t) => isChatTab(t.type) || t.type === 'term');
  const r = await ask({
    title: `Close Window ${WIN}?`,
    text: `${items.length === 1 ? 'Its tab closes' : `Its ${items.length} tabs close`} for good${runs ? '; its chats and terminals end' : ''}.`,
    checks: { label: 'move them to the editor instead', items },
    choices: [{ label: 'close', value: 'close' }],
  });
  return r ? r.ticked : null;
}

function endTab(t: Tab) {
  const c = chats.get(t.id), x = terms.get(t.id);
  if (t.chat && (openAway(t.chat) || amElse(agents.all.get(t.chat)))) c?.detach();
  else if (c) c.stop();
  else if (t.chat) api('DELETE', '/api/agent?id=' + encodeURIComponent(t.chat), {}).catch(showErr);
  if (t.term && openAway(t.term)) x?.detach();
  else if (x) x.stop();
  else if (t.term) api('DELETE', '/api/term?id=' + encodeURIComponent(t.term), {}).catch(showErr);
  chats.delete(t.id);
  terms.delete(t.id);
  textTabs.get(t.id)?.stop();
  textTabs.delete(t.id);
  browsers.get(t.id)?.stop();
  browsers.delete(t.id);
  diffs.delete(t.id);
  reviews.get(t.id)?.stop();
  reviews.delete(t.id);
  panes.get(t.id)?.stop?.();
  panes.delete(t.id);
  carets.delete(t.id);
  pages.delete(t.id);
}
export function closeGroup(g: TabGroup) {
  for (const t of [...g.tabs]) closeTab(t.id, false);
  return commit();
}
export function closeActive() {
  const t = W && shown(activeGroup());
  if (t) return closeTabAsking([t.id]);
}
export function reopen() {
  if (!W) return;
  const c = closed.shift();
  if (!c) return setSave('no closed tab to bring back');
  const hit = c.t.path ? docTab(c.t.path) : c.t.abs ? extTab(c.t.abs) : TYPES[c.t.type].one && findTab((t) => t.type === c.t.type);
  if (hit) return activate(hit.g, hit.t);
  const g = groupById(c.g);
  put(g || activeGroup(), { ...c.t, id: uid() }, g ? Math.min(c.i, g.tabs.length) : null);
  return commit();
}

const treeOf = (n: TabNode): unknown[] => (n.g ? n.tabs.filter(keep).map((t) => t.id) : [n.split, ...n.kids!.map(treeOf)]);
const shapeOf = (n: TabNode): unknown[] => (n.g ? [n.on, ...treeOf(n)] : [n.split, ...n.kids!.map(shapeOf)]);
const last = new Map<string, { snap: Snap; shape: string }>();
const ended = new Map<string, Revive>();
function track(step: boolean) {
  for (const e of eds) {
    const snap = { root: clean(e.root), active: e.active }, shape = JSON.stringify([e.active, shapeOf(e.root)]), was = last.get(e.id);
    last.set(e.id, { snap, shape });
    if (step && was && was.shape !== shape) record('layout', ...change(was.snap, snap, e.id));
  }
}
function change(a: Snap, b: Snap, ed: string): [string, any] {
  const ids = (s: Snap) => new Map(allTabs(s.root).map((t) => [t.id, t]));
  const A = ids(a), B = ids(b);
  const gone = [...A.values()].filter((t) => !B.has(t.id)), came = [...B.values()].filter((t) => !A.has(t.id));
  const name = (ts: Tab[]) => (ts.length === 1 ? `“${look(ts[0]).name}”` : `${ts.length} tabs`);
  const on = (s: Snap) => shown(groups(s.root).find((g) => g.g === s.active) || groups(s.root)[0]);
  const kind = came.length ? 'open' : gone.length ? 'close' : JSON.stringify(treeOf(a.root)) === JSON.stringify(treeOf(b.root)) ? 'switch' : 'move';
  const label = { open: `opened ${name(came)}`, close: `closed ${name(gone)}`, switch: `switched to “${on(b) ? look(on(b)!).name : 'a tab'}”`, move: 'moved tabs' }[kind];
  const revive = Object.fromEntries(gone.filter((t) => ended.has(t.id)).map((t) => [t.id, ended.get(t.id)]));
  return [label, { ed, kind, before: a, after: b, ...(Object.keys(revive).length ? { revive } : {}) }];
}
function restore(id: string, snap: Snap, revive: Record<string, Revive> = {}, end = false) {
  const e = eds.find((x) => x.id === id), root = e && valid(snap.root);
  if (!root) return false;
  const live = new Map(allTabs(e.root).map((t) => [t.id, t]));
  const running = (t: Tab) => [t.chat, t.term].some((x) => x && agents.all.get(x) && agents.all.get(x)!.status !== 'ended');
  const back = (t: Tab): Tab | null => {
    if (live.has(t.id)) return live.get(t.id)!;
    if (!isChatTab(t.type) && t.type !== 'term') return t;
    if (running(t)) return t;
    const r = isChatTab(t.type) && revive[t.id];
    return r ? { id: t.id, type: r.type || t.type, path: null, resume: r.session, draft: r.draft, ...(t.title ? { title: t.title } : {}) } : null;
  };
  const fill = (n: TabNode): void => {
    if (!n.g) return n.kids!.forEach(fill);
    n.tabs = n.tabs.map(back).filter(Boolean) as Tab[];
    if (!n.tabs.length) n.tabs = [tab('new')];
    if (!n.tabs.some((t) => t.id === n.on)) n.on = n.tabs[0].id;
  };
  fill(root);
  const kept = new Set(allTabs(root).map((t) => t.id));
  for (const t of live.values()) if (!kept.has(t.id)) (!end && (isChatTab(t.type) || t.type === 'term') ? away(t.id) : endTab(t));
  e.root = root;
  e.active = groups(root).some((g) => g.g === snap.active) ? snap.active : groups(root)[0].g;
  if (e === W) fresh();
  return commit();
}
function revivedEditor({ at, ed, revive }: LayoutSet) {
  const root = valid(ed.root) || blank(), fill = (n: TabNode): void => {
    if (!n.g) return n.kids!.forEach(fill);
    n.tabs = n.tabs
      .map((t) => (t.type === 'term' ? null : !isChatTab(t.type) ? t : revive[t.id] ? { id: t.id, type: revive[t.id].type || t.type, path: null, resume: revive[t.id].session, draft: revive[t.id].draft, ...(t.title ? { title: t.title } : {}) } : null))
      .filter(Boolean) as Tab[];
    if (!n.tabs.length) n.tabs = [tab('new')];
    if (!n.tabs.some((t) => t.id === n.on)) n.on = n.tabs[0].id;
  };
  fill(root);
  const e: Layout = { id: ed.id, root, active: groups(root).some((g) => g.g === ed.active) ? ed.active : groups(root)[0].g, ...(ed.name ? { name: ed.name } : {}), ...(ed.color ? { color: ed.color } : {}), ...(ed.mark ? { mark: ed.mark } : {}) };
  eds.splice(Math.min(Math.max(at, 1), eds.length), 0, e);
  return e;
}
undoer('layoutset', {
  there: () => true,
  async undo(d: LayoutSet) {
    if (eds.some((x) => x.id === d.ed.id)) return false;
    const e = revivedEditor(d);
    await showEditor(e.id);
    return commit();
  },
  redo: (d: LayoutSet) => dropEditor(d.ed.id, false),
});
undoer('layout', {
  there: (d: LayoutStep) => !eds.some((e) => e.id === d.ed) || (modeNow() === 'editor' && W?.id === d.ed),
  go: (d: LayoutStep) => showEditor(d.ed),
  undo: (d: LayoutStep) => restore(d.ed, d.before, d.revive),
  redo: (d: LayoutStep) => restore(d.ed, d.after, {}, d.kind === 'close'),
  merge: (a: LayoutStep, b: LayoutStep, age: number) => age < 1200 && a.kind === 'switch' && b.kind === 'switch' && a.ed === b.ed && { ...b, before: a.before },
});

async function goType(d: { path: string; line: number }) {
  if (!S.thoughts.has(d.path)) return false;
  await openInTab(d.path);
  const hit = docTab(d.path);
  if (!hit) return false;
  textTabs.get(hit.t.id)?.goLine(d.line);
  return `in “${d.path.split('/').pop()}” at line ${d.line}: ctrl z again undoes the typing there`;
}
undoer('typing', { undo: goType, redo: goType, merge: (a: { path: string }, b: { path: string }) => a.path === b.path && b });

export function nthTab(n: number) {
  const g = W && activeGroup(), t = g?.tabs[n - 1];
  if (t) return activate(g!, t);
}
export function stepTab(d: number) {
  const g = W && activeGroup();
  if (!g || g.tabs.length < 2) return;
  const i = g.tabs.indexOf(shown(g)!);
  return activate(g, g.tabs[(i + d + g.tabs.length) % g.tabs.length]);
}
export function stepGroup(d: number) {
  if (!W) return;
  const all = groups();
  if (all.length < 2) return;
  const g = all[(all.indexOf(activeGroup()) + d + all.length) % all.length];
  return activate(g, shown(g)!);
}
export function split(g: TabGroup | null = W && activeGroup(), dir = 'row') {
  if (!g) return;
  use(placeBeside(g, group([tab('new')]), dir === 'row' ? 'right' : 'bottom'));
  return commit();
}
export function newOfType(type: string, g: TabGroup) {
  if (type === 'open') return pickFiles();
  if (type === 'board') return newInTab(type, g);
  if (type === 'text' || TYPES[type].ext) return newFile(null, () => groupById(g.g), TYPES[type].ext);
  if (type === 'new' || isChatTab(type) || type === 'term' || type === 'browser') {
    const t = tab(type);
    put(g, t);
    const c = commit();
    if (type !== 'new') c.then(() => (chats.get(t.id) || terms.get(t.id) || browsers.get(t.id))?.focus());
    return c;
  }
  return openView(type, g);
}
export function openBrowser(url: string, from: string | null = null, behind = false, into: TabGroup | null = null) {
  if (!W) return;
  const g = into || (from && groupOf(from)) || activeGroup(), at = from ? g.tabs.findIndex((x) => x.id === from) + 1 : g.tabs.length, t = { ...tab('browser'), url };
  if (behind) g.tabs.splice(at, 0, t);
  else put(g, t, at);
  return commit();
}
export function browserInView() {
  if (!W) return null;
  const g = [activeGroup(), ...groups()].find((x) => shown(x)?.type === 'browser');
  return g ? browsers.get(shown(g)!.id) : null;
}

let queue: Promise<unknown> = Promise.resolve();
export function sync() {
  queue = queue.then(follow).catch(showErr);
  return queue;
}
async function follow(): Promise<unknown> {
  if (!W) return page.render();
  const want = shown(activeGroup());
  const o = S.open;
  const was = o && (o.board ? 'board' : o.scratch ? 'scratch' : 'note');
  if (writes(want)) {
    if (o?.tab === want.id) return page.render();
    tag(o ? `editor: ${was} let go, ${want.type} built` : `editor: ${want.type} built`);
    if (o) await span('switch.release', () => release(o));
    return span('switch.load', () => load(want));
  }
  if (o?.tab && (!onScreen(o.tab) || !writes(tabById(o.tab)))) {
    tag(`editor: ${was} let go`);
    await span('switch.release', () => release(o));
  }
  page.render();
}
async function release(o: OpenFile) {
  const was = o.tab && S.open === o && !o.board && tabById(o.tab);
  if (was) carets.set(was.id, { ...scratchSel(), scroll: ED.scrollTop });
  await flushNow();
  if (S.open === o) closeEditorNow();
  const t = o.tab && tabById(o.tab);
  if (!t) return;
  if (o.path) t.path = o.path;
  else if (!o.scratch) pull(t);
  save(false);
}
async function load(t: Tab): Promise<unknown> {
  if (t.type === 'scratch') return openScratch(t.id);
  if (t.type === 'sketch') return openSketch(t.id);
  if (!t.path) return t.type === 'board' ? newBoard(t.dir, t.id) : undefined;
  if (!S.thoughts.has(t.path)) {
    pull(t);
    save(false);
    return follow();
  }
  await openThought(t.path, t.id);
  putCaret(t);
}
function putCaret(t: Tab) {
  const c = carets.get(t.id), o = S.open;
  if (!c || o?.tab !== t.id || o.board) return;
  carets.delete(t.id);
  const s = c.start ?? 0;
  putScratchSel(s, c.end ?? s);
  if (c.y != null) ED.scrollTop = $('#ed-bodywrap').offsetTop + scratchCaretY(Math.min(c.at ?? s, S.open!.content.length)) - c.y;
  else if (c.scroll != null) ED.scrollTop = c.scroll;
  if (c.title) $('#ed-title').focus({ preventScroll: true });
  else if (c.focus) focusScratch({ preventScroll: true });
}
