import { reveal } from './groups.ts';
import { api, S } from '../base/model.ts';
import { goTo, resumeChat, setMode } from './modes.ts';
import { fileNamed, openExternal } from './tabs.ts';
import { hereOf, openFile as open } from './open.ts';
import { col } from '../base/theme.ts';
import { DEFAULT } from '../base/kinds.ts';
import { dirIcon, extOf, fileIcon, fileTint, nameHtml } from '../base/filelook.ts';
import { fit, rank as rankRows, type Rankable } from '../base/rank.ts';
import { $, esc, showErr } from '../base/util.ts';
import { litOnHover } from '../base/roving.ts';
import { agents, chatOfSession, onAgents, type Agent } from '../base/stream.ts';
import { crystalOf } from '../base/codes.ts';
import { pref } from '../base/prefs.ts';
import { tell } from '../base/notify.ts';
import { icon } from '../base/icon.ts';
import { treeMenu } from './treemenu.ts';

type Key = [string, string, (() => unknown)?, string[]?];
interface Row extends Rankable {
  html: () => string;
  run: (side: boolean) => unknown;
  path?: string;
  dir?: string;
  chat?: string;
  code?: string;
  cls?: string;
  skip?: boolean;
}
interface Mem {
  name: string;
  abs: string;
  mtime: number;
  rule?: boolean;
}
interface Hit {
  path: string;
  lines: { line: number; text: string; at: number }[];
  more: number;
  next: number;
}
interface ChatHit {
  chat?: string;
  session?: string;
  program: string;
  title: string;
  snip: string;
}

const box = $<HTMLElement>('#palette');
const inp = box.querySelector('input')!;
const list = box.querySelector('ul')!;
let sheet: any[][] = [], hits: Row[] = [], at = 0, back: HTMLElement | null = null, memories: Mem[] = [], globalRows: Mem[] = [], missing: string[] = [];
let q = '', cmd = false, names: Row[] = [], loose: Row[] = [];
let texts: Hit[] = [], textQ = '', asked = '', asking = false, timer = 0;
let said: ChatHit[] = [], saidQ = '', saidAsked = '', saidAsking = false, saidTimer = 0;
const MIN_TEXT = 2, MAX_TEXT_FILES = 30;

function openFile(path: string, side: boolean, line = 0) {
  open(path, side ? (hereOf() === 'tab' ? 'group' : 'window') : 'here', { line });
  reveal(path, true);
}
const marked = (s: string, from: number, len: number) => (from < 0 || !len ? esc(s) : `${esc(s.slice(0, from))}<mark>${esc(s.slice(from, from + len))}</mark>${esc(s.slice(from + len))}`);
function nameMarked(name: string) {
  const i = q ? name.toLowerCase().indexOf(q) : -1;
  if (i < 0) return nameHtml(name);
  const e = extOf(name), cut = name.length - e.length;
  if (!e || i + q.length > cut) return marked(name, i, q.length);
  return marked(name.slice(0, cut), i, q.length) + nameHtml(name).slice(esc(name.slice(0, cut)).length);
}
const pageIcon = (name: string, own: string | null = null, board = false) => `<i class="gl" style="${fileTint(name, own)}">${fileIcon(board)}</i>`;
const noteIcon = (t: any) => pageIcon(t.name || t.title, t.meta?.color ? col(t.meta.color as string) : t.board ? col(DEFAULT.board) : null, t.board);

let rowsOf: typeof S.data | undefined, fileRows: Row[] = [], folderRows: Row[] = [];
function treeRows() {
  if (rowsOf === S.data) return;
  rowsOf = S.data;
  fileRows = [...S.thoughts.values()].map((t) => {
    const claude = /(^|\/)claude\.md$/i.test(t.path);
    return {
      name: t.title,
      rest: claude ? `${t.path} project` : t.path,
      touched: t.touched,
      path: t.path,
      html: () => `${noteIcon(t)}<span class="nm">${nameMarked(t.title)}</span><span class="pa">${esc(claude ? ['project', t.dir].filter(Boolean).join(' · ') : t.dir)}</span>`,
      run: (side: boolean) => openFile(t.path, side),
    };
  });
  folderRows = [...S.dirs.entries()]
    .filter(([, c]) => c.path && !c.missing)
    .map(([key, c]) => ({
      name: c.name,
      rest: c.path,
      path: c.path,
      dir: key,
      html: () => `<i class="gl"${c.meta?.color ? ` style="--ic:${esc(col(c.meta.color as string))}"` : ''}>${dirIcon(false)}</i><span class="nm">${marked(c.name, q ? c.name.toLowerCase().indexOf(q) : -1, q.length)}</span><span class="pa">${esc(c.parent)}</span>`,
      run: (side: boolean) => {
        if (side) setMode('editor');
        reveal(c.path);
      },
    }));
}
const files = () => (treeRows(), fileRows);
const folders = () => (treeRows(), folderRows);
const memory = (): Row[] =>
  memories.map((m) => ({
    name: m.name,
    rest: `.claude memory ${m.name}`,
    touched: m.mtime,
    html: () => rowHtml(m.name, 'Claude memory'),
    run: () => openExternal(m.abs),
  }));
const rowHtml = (name: string, where: string) => `${pageIcon('x.md')}<span class="nm">${nameMarked(name)}</span><span class="pa">${esc(where)}</span>`;
const globals = (): Row[] =>
  globalRows.map((m) => {
    const where = m.rule ? 'Claude global rules' : 'Claude global';
    return { name: m.name, rest: `.claude ${where} ${m.name}`, touched: m.mtime, html: () => rowHtml(m.name, where), run: () => openExternal(m.abs) };
  });
const MAKE = {
  project: {
    where: 'project · .claude',
    run: async (side: boolean) => {
      const path = await fileNamed('.claude', 'CLAUDE.md');
      if (path) openFile(path, side);
    },
  },
  global: { where: 'Claude global', run: () => api('POST', '/api/agent/global-claude', {}).then(({ abs }) => openExternal(abs), showErr) },
};
const creates = (): Row[] => missing.map((k) => ({ name: 'create CLAUDE.md', rest: `${k} claude.md`, html: () => rowHtml('create CLAUDE.md', MAKE[k as keyof typeof MAKE].where), run: MAKE[k as keyof typeof MAKE].run }));
const chatsOn = () => pref('palette:chats') !== false;
const openChats = () => [...agents.all.values()].filter((a) => a.kind === 'chat' && (a.pid || '') === S.pid && a.status !== 'ended').sort((x, y) => y.at - x.at);
const STATUS: Record<string, string> = { asks: 'asks', working: 'working', starting: 'starting', done: 'done', idle: 'idle' };
const codeHtml = (code: string, color: string) => `<span class="pc-code" style="--gem-c:${esc(color)}">${marked(code, q && code.toLowerCase().startsWith(q) ? 0 : -1, q.length)}</span>`;
function goChat(a: Agent) {
  const now = agents.all.get(a.id);
  if (now && now.status !== 'ended') return void Promise.resolve(goTo(now)).catch(showErr);
  if (a.session) return resumeChat({ session: a.session, program: a.program });
  tell(document.body, { title: 'That chat has ended', ms: 2500 });
}
export function chatRowHtml(a: Agent) {
  const c = crystalOf(a.id), title = a.title || 'untitled chat';
  return `${codeHtml(c.code, c.color)}<span class="nm">${marked(title, q ? title.toLowerCase().indexOf(q) : -1, q.length)}</span><span class="pa">${esc(STATUS[a.status] || a.status)}</span>`;
}
function chatRows(): Row[] {
  if (!chatsOn()) return [];
  return openChats().map((a) => {
    const c = crystalOf(a.id), title = a.title || 'untitled chat';
    return {
      name: `${c.code} ${title}`,
      rest: `${c.code} ${a.program || ''} chat`,
      touched: a.at,
      chat: a.id,
      code: c.code.toLowerCase(),
      cls: 'pc',
      html: () => chatRowHtml(a),
      run: () => goChat(a),
    };
  });
}
function saidRows(h: ChatHit): Row[] {
  const a = h.chat ? agents.all.get(h.chat) : h.session ? chatOfSession(h.session) : undefined;
  const ws = q.split(/\s+/).filter(Boolean), at = ws.length ? h.snip.toLowerCase().indexOf(ws[0]) : -1;
  const go = () => (a ? goChat(a) : h.session ? resumeChat({ session: h.session, program: h.program }) : undefined);
  const title = (a ? a.title : h.title) || 'untitled chat';
  const head = a ? codeHtml(crystalOf(a.id).code, crystalOf(a.id).color) : `<i class="gl pc-old">${icon('history')}</i>`;
  const where = a ? STATUS[a.status] || a.status : ['earlier', h.program, 'chat'].filter(Boolean).join(' ');
  return [
    { name: title, rest: '', chat: a?.id, cls: 'fh pc', html: () => `${head}<span class="nm">${esc(title)}</span><span class="pa">${esc(where)}</span>`, run: go },
    { name: title, rest: '', cls: 'ln pc-ln', html: () => `<code>${marked(h.snip, at, ws[0]?.length || 0)}</code>`, run: go },
  ];
}
function commands(): Row[] {
  const seen = new Set<unknown>();
  return sheet.flatMap(([group, rows]) =>
    (rows as Key[])
      .filter(([, , run]) => run && !seen.has(run) && seen.add(run))
      .map(([k, label, run]) => ({
        name: label,
        rest: `${label} ${group}`,
        html: () => `<span class="nm">${esc(label)}</span><span class="pa">${esc(group)}</span><span class="k">${k.split(' ').map((x) => `<kbd>${esc(x)}</kbd>`).join('')}</span>`,
        run: () => run!(),
      })),
  );
}

const note = (cls: string, text: string): Row => ({ name: '', rest: '', cls, skip: true, html: () => esc(text), run: () => {} });
function textRows(h: Hit): Row[] {
  const t = S.thoughts.get(h.path);
  const name = h.path.split('/').pop()!, dir = h.path.split('/').slice(0, -1).join('/');
  const go = (line: number) => (side: boolean) => openFile(h.path, side, line);
  const rows: Row[] = [{ name, rest: h.path, path: h.path, cls: 'fh', html: () => `${t ? noteIcon(t) : pageIcon(name)}<span class="nm">${nameHtml(name)}</span><span class="pa">${esc(dir)}</span>`, run: go(h.lines[0].line) }];
  for (const l of h.lines) rows.push({ name, rest: h.path, cls: 'ln', html: () => `<b class="no">${l.line}</b><code>${marked(l.text, l.at, q.length)}</code>`, run: go(l.line) });
  if (h.more) rows.push({ name, rest: h.path, cls: 'more', html: () => `${h.more} more line${h.more === 1 ? '' : 's'} in ${esc(name)}`, run: go(h.next) });
  return rows;
}
const wantsText = () => !cmd && q.length >= MIN_TEXT && !!S.pid && !!S.data;
const wantsSaid = () => !cmd && q.length >= MIN_TEXT && chatsOn();

function askSaid(want: string) {
  saidAsked = want;
  if (saidAsking) return;
  saidAsking = true;
  const pid = S.pid;
  api('GET', `/api/agent/chats/search?q=${encodeURIComponent(want)}`)
    .then((r) => (r.hits || []) as ChatHit[], () => [] as ChatHit[])
    .then((found) => {
      saidAsking = false;
      if (box.hidden || pid !== S.pid) return;
      if (saidAsked !== want) return askSaid(saidAsked);
      said = found;
      saidQ = want;
      if (want === q) compose(true);
    });
}
function askChats() {
  clearTimeout(saidTimer);
  if (!wantsSaid() || saidQ === q || (saidAsking && saidAsked === q)) return;
  const want = q;
  saidTimer = window.setTimeout(() => want === q && askSaid(want), 150);
}

function ask(want: string) {
  asked = want;
  if (asking) return;
  asking = true;
  const pid = S.pid;
  api('GET', `/api/search?lines=1&q=${encodeURIComponent(want)}`)
    .then((r) => (r.hits || []) as Hit[], () => [] as Hit[])
    .then((found) => {
      asking = false;
      if (box.hidden || pid !== S.pid) return;
      if (asked !== want) return ask(asked);
      texts = found;
      textQ = want;
      if (want === q) compose(true);
    });
}
function askTexts() {
  clearTimeout(timer);
  if (!wantsText() || textQ === q || (asking && asked === q)) return;
  const want = q;
  timer = window.setTimeout(() => want === q && ask(want), 150);
}

function find(keep = false) {
  const v = inp.value;
  cmd = v.startsWith('>');
  q = (cmd ? v.slice(1) : v).trim().toLowerCase();
  box.classList.toggle('cmd', cmd);
  const rank = (rows: Row[], worst = 4) => rankRows(rows, q, worst);
  if (cmd || !q) {
    names = cmd ? rank(commands()).slice(0, 50) : [...chatRows(), ...rank(files()).slice(0, 50)];
    loose = [];
  } else {
    const ranked = rank([...chatRows(), ...files(), ...folders(), ...memory(), ...globals()]), exact = ranked.findIndex((r) => r.code === q);
    if (exact > 0) ranked.unshift(...ranked.splice(exact, 1));
    const all = [...ranked, ...rank(creates(), 3), ...rank(commands(), 2)].slice(0, 50);
    names = all.filter((r) => fit(q, r) < 4);
    loose = all.filter((r) => fit(q, r) === 4);
  }
  askTexts();
  askChats();
  compose(keep);
}
function compose(keep: boolean) {
  const was = keep ? hits[at] : null;
  const named = new Set(names.map((r) => r.path).filter(Boolean));
  const found = wantsText() && textQ === q ? texts.filter((h) => !named.has(h.path)).slice(0, MAX_TEXT_FILES) : [];
  const inText = new Set(found.map((h) => h.path));
  const namedChats = new Set(names.map((r) => r.chat).filter(Boolean));
  const inChats = wantsSaid() && saidQ === q ? said.filter((h) => !h.chat || !namedChats.has(h.chat)) : [];
  const waiting = wantsText() && textQ !== q, waitingChats = wantsSaid() && saidQ !== q;
  const searching = waiting && waitingChats ? 'searching in files and chats…' : waiting ? 'searching in files…' : waitingChats ? 'searching in chats…' : '';
  hits = [...names, ...(found.length ? [note('ph', 'in files')] : []), ...found.flatMap(textRows), ...(inChats.length ? [note('ph', 'in chats')] : []), ...inChats.flatMap(saidRows), ...(searching ? [note('none', searching)] : []), ...loose.filter((r) => !r.path || !inText.has(r.path))];
  const i = was ? hits.findIndex((r) => r === was || (!!was.chat && r.chat === was.chat && r.cls === was.cls)) : -1;
  at = i >= 0 ? i : hits.findIndex((r) => !r.skip);
  draw(false, keep);
}
let scrolled = false;
list.addEventListener('scroll', () => (scrolled = list.scrollTop > 0), { passive: true });
function draw(follow = false, keep = false) {
  const where = [wantsText() && 'file', wantsSaid() && 'chat'].filter(Boolean).join(' or ');
  const empty = `<li class="none">${where ? `nothing by that name or in any ${where}` : 'nothing by that name'}</li>`;
  list.innerHTML = hits.map((r, i) => (r.skip ? `<li class="${r.cls}">${r.html()}</li>` : `<li class="${[i === at ? 'on' : '', r.cls || ''].join(' ').trim()}" data-i="${i}">${r.html()}</li>`)).join('') || empty;
  if (follow) list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  else if (scrolled && !keep) (list.scrollTop = 0), (scrolled = false);
}
function step(by: number) {
  if (!hits.some((r) => !r.skip)) return;
  let i = at;
  do i = (i + by + hits.length) % hits.length;
  while (hits[i].skip);
  at = i;
  draw(true);
}

const keepFocus = (e: FocusEvent) => !box.hidden && !box.contains(e.target as Node) && inp.focus();
function close() {
  box.hidden = true;
  clearTimeout(timer);
  clearTimeout(saidTimer);
  document.removeEventListener('keydown', onKey, true);
  document.removeEventListener('focusin', keepFocus, true);
  back?.focus?.();
}
function pick(i: number, side = false) {
  const r = hits[i];
  if (!r || r.skip) return;
  back = null;
  close();
  r.run(side);
}
function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') close();
  else if (e.key === 'Enter') pick(at, ctrl);
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') step(e.key === 'ArrowDown' ? 1 : -1);
  else if (ctrl && !e.altKey && e.key.toLowerCase() === 'p') {
    inp.value = e.shiftKey ? '>' : '';
    find();
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

export function palette(mode: string, rows: any[][]) {
  sheet = rows;
  if (box.hidden) {
    back = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', keepFocus, true);
    memories = globalRows = missing = [];
    texts = [];
    textQ = '';
    said = [];
    saidQ = '';
    const pid = S.pid;
    api('GET', '/api/agent/memory').then(({ files, global = [], projectClaude }) => {
      if (pid !== S.pid || box.hidden) return;
      memories = files;
      globalRows = global;
      missing = projectClaude === undefined ? [] : [...(projectClaude ? [] : ['project']), ...(global.some((f: Mem) => !f.rule) ? [] : ['global'])];
      find();
    }, () => {});
  }
  box.hidden = false;
  inp.value = mode === 'commands' ? '>' : '';
  find();
  inp.focus();
}

inp.addEventListener('input', () => find());
onAgents(({ lineOnly }) => !lineOnly && !box.hidden && !cmd && chatsOn() && find(true));
box.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
  if (li) pick(+li.dataset.i!, e.ctrlKey || e.metaKey);
  else if (e.target === box) close();
});
list.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
  const r = li ? hits[+li.dataset.i!] : null;
  if (!r) return;
  const el = document.createElement('span');
  if (r.dir !== undefined) el.dataset.dir = r.dir;
  else if (r.path && S.thoughts.has(r.path)) el.dataset.open = r.path;
  else return tell(li!, { title: 'Only files and folders have a right-click menu here', ms: 2500 });
  back = null;
  close();
  treeMenu(e, el);
});
litOnHover(list, 'i', () => at, (i) => (at = i));
