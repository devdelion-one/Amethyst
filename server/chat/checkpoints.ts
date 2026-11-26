import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import os from 'os';
import { replaceSync, WIN } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';

interface Meta {
  off: string | null;
  big: string[];
}
interface Store {
  top: string;
  dir: string;
  common?: string | null;
  meta?: Meta | null;
  chain: Promise<unknown>;
}
interface Ran {
  out: any;
  err: string;
  code: number;
  timedOut: boolean;
  missing: boolean;
}
interface Tool {
  t0: number;
  t1: number | null;
  kind?: string;
}
interface Seg {
  key: string;
  b: string;
  t0: number;
  tools: Map<string, Tool>;
  edits: Set<string>;
  cwd: string;
  mode?: string | null;
  words?: string | null;
}
interface Point {
  key: string;
  b: string;
  a: string;
  t0: number;
  t1: number;
  cwd: string;
  edits: string[];
  late: string[];
  by: Record<string, string[]>;
  mode?: string | null;
  words?: string | null;
}
interface Span {
  id: string;
  cwd: string;
  t0: number;
  t1: number | null;
  edits: Set<string>;
  ran?: boolean;
}
interface FileRef {
  mode: string;
  oid: string;
}
interface Item {
  path: string;
  how: string;
  tick: boolean;
  why?: string;
  clash?: boolean;
}
interface Entry {
  path: string;
  from: FileRef | null;
  to: FileRef | null;
}
interface Plan {
  token: string;
  s: Store;
  now: string;
  tree: string;
  first: string;
  items: Item[];
  spec: string[];
}
interface PointChat {
  id: string;
  cwd: string;
  agent: string;
  pointsOff?: boolean;
  lastAi?: string | null;
  points: Point[];
  seg?: Seg | null;
  pointing?: Promise<unknown>;
  plan?: Plan | null;
  saved?: () => void;
  mode?: () => string | null;
  words?: string | null;
  review?: Review | null;
}
interface RevFile {
  at?: string;
  oid?: string | null;
  t: number;
}
interface Review {
  cwd: string;
  files: Record<string, RevFile>;
}

const BIG = 50 * 1024 * 1024;
const FOLDER = 2 * 1024 ** 3;
const SLOW = 60e3;
const SLACK = 2000;
const KEEP = 200;
const SPAN = 6 * 3600e3;
const READS = new Set<string | undefined>(['read', 'search', 'fetch']);
const EDITS = new Set<string | undefined>(['edit', 'delete', 'move']);
const BASE = ['.amethyst/'];
const REVIEW_MODES = new Set<string | null | undefined>(['acceptEdits', 'accept-edits']);
const NO_GIT =['node_modules/', '.venv/', 'venv/', '__pycache__/', 'dist/', 'build/', 'out/', 'target/', '.next/', '.cache/'];

let home = () => path.join(os.tmpdir(), 'amethyst-checkpoints');
let nameOf: (id: string) => string | null = () => null;
let placeOf: (cwd: string) => Promise<any> = async () => null;
function init(o: { home?: () => string; nameOf?: (id: string) => string | null; placeOf?: (cwd: string) => Promise<any> }) {
  if (o.home) home = o.home;
  if (o.nameOf) nameOf = o.nameOf;
  if (o.placeOf) placeOf = o.placeOf;
}

const key = (p: string) => (WIN ? p.toLowerCase() : p);
const tagOf = (top: string) => crypto.createHash('sha1').update(key(top)).digest('hex').slice(0, 4);
const overlaps = (a: string | null | undefined, b: string | null | undefined) => {
  if (!a || !b) return false;
  const x = key(path.resolve(a)), y = key(path.resolve(b));
  return x === y || x.startsWith(y + path.sep) || y.startsWith(x + path.sep);
};
const stores = new Map<string, Store>();
let tidying: Promise<unknown> = Promise.resolve();
async function storeOf(cwd: string) {
  await tidying;
  const place = await placeOf(cwd).catch(() => null);
  const top = place ? place.top : path.resolve(cwd);
  const prefix = place ? place.prefix.replace(/\/$/, '') : '';
  let s = stores.get(key(top));
  if (!s) stores.set(key(top), (s = { top, dir: path.join(home(), `${path.basename(top) || 'root'}-${tagOf(top)}`), common: place?.common || null, meta: null, chain: Promise.resolve() }));
  return { s, prefix, spec: ['--', prefix || '.'] };
}
function serial<T>(s: Store, fn: () => T | Promise<T>): Promise<T> {
  const run = s.chain.then(fn, fn);
  s.chain = run.catch(() => {});
  return run;
}

function g(s: Store, args: string[], { input = null, buffer = false, index = null, timeout = SLOW }: { input?: any; buffer?: boolean; index?: string | null; timeout?: number } = {}) {
  return new Promise<Ran>((resolve) => {
    const env: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(process.env)) if (!/^GIT_/i.test(k)) env[k] = v;
    Object.assign(env, {
      GIT_DIR: s.dir,
      GIT_WORK_TREE: s.top,
      GIT_INDEX_FILE: index || path.join(s.dir, 'index'),
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Amethyst',
      GIT_AUTHOR_EMAIL: 'amethyst@localhost',
      GIT_COMMITTER_NAME: 'Amethyst',
      GIT_COMMITTER_EMAIL: 'amethyst@localhost',
    });
    const cfg = ['core.autocrlf=false', 'core.safecrlf=false', 'core.quotepath=false', 'core.longpaths=true', 'core.fsmonitor=false', 'gc.auto=0', 'merge.renames=false', 'diff.renames=false'];
    const p = execFile('git', [...cfg.flatMap((c) => ['-c', c]), ...args], { cwd: s.top, env, windowsHide: true, timeout, maxBuffer: 512 * 1024 * 1024, encoding: buffer ? 'buffer' : 'utf8' }, (err, out, stderr) =>
      resolve({ out: out ?? (buffer ? Buffer.alloc(0) : ''), err: String(stderr ?? ''), code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, timedOut: !!err?.killed, missing: err?.code === 'ENOENT' }),
    );
    if (input != null) p.stdin?.end(input);
    else p.stdin?.end();
  });
}
const must = (r: Ran, what: string) => {
  if (r.code) throw new HttpError(r.missing ? 424 : 409, `${what}: ${r.missing ? "git isn't installed on this PC" : r.timedOut ? 'git took too long' : r.err.trim().split(/\r?\n/).pop() || 'git failed'}`);
  return r.out;
};
const z = (out: unknown) => String(out).split('\0').filter(Boolean);

const metaFile = (s: Store) => path.join(s.dir, 'amethyst.json');
const saveMeta = (s: Store) => replaceSync(metaFile(s), JSON.stringify(s.meta));
function ready(s: Store) {
  if (s.meta) return s.meta;
  fs.mkdirSync(path.join(s.dir, 'info'), { recursive: true });
  if (!fs.existsSync(path.join(s.dir, 'HEAD'))) {
    fs.mkdirSync(path.join(s.dir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(s.dir, 'refs'), { recursive: true });
    fs.writeFileSync(path.join(s.dir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(s.dir, 'config'), '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tlogallrefupdates = false\n');
  }
  fs.writeFileSync(path.join(s.dir, 'info', 'attributes'), '* -text -eol -filter -ident -working-tree-encoding\n');
  try {
    s.meta = JSON.parse(fs.readFileSync(metaFile(s), 'utf8'));
  } catch {
    s.meta = { off: null, big: [] };
  }
  return s.meta;
}
function excludes(s: Store) {
  let own = '';
  try {
    if (s.common) own = fs.readFileSync(path.join(s.common, 'info', 'exclude'), 'utf8');
  } catch {}
  const text = [...BASE, ...(s.common ? [] : NO_GIT), own, ...s.meta!.big.map((p) => '/' + p.replace(/([*?[\\!#])/g, '\\$1'))].join('\n') + '\n';
  const f = path.join(s.dir, 'info', 'exclude');
  let was: string | null = null;
  try {
    was = fs.readFileSync(f, 'utf8');
  } catch {}
  if (was !== text) fs.writeFileSync(f, text);
}

async function snapOn(s: Store, prefix: string, spec: string[], chat: string) {
  ready(s);
  if (s.meta!.off) return null;
  excludes(s);
  const first = !fs.existsSync(path.join(s.dir, 'index'));
  const st = await g(s, ['status', '--porcelain', '-z', '-uall', '--no-renames', '--ignore-submodules=all', ...spec]);
  if (st.timedOut) return off(s, 'git took too long to look at the folder');
  must(st, 'restore point');
  let total = 0;
  const big: string[] = [];
  for (const e of z(st.out)) {
    if (e[0] === 'D' || e[1] === 'D') continue;
    const rel = e.slice(3);
    let size = 0;
    try {
      size = fs.statSync(path.join(s.top, rel)).size;
    } catch {}
    total += size;
    if (size > BIG) big.push(rel);
  }
  if (first && total > FOLDER) return off(s, `the folder has over ${Math.floor(total / 1024 ** 3)} GB of files`);
  if (big.length) {
    s.meta!.big = [...new Set([...s.meta!.big, ...big])];
    saveMeta(s);
    excludes(s);
    await g(s, ['rm', '-q', '--cached', '--ignore-unmatch', '--', ...big]);
  }
  const add = await g(s, ['add', '-A', ...spec]);
  if (add.timedOut) return off(s, 'git took too long to keep the folder');
  must(add, 'restore point');
  const tree = must(await g(s, ['write-tree']), 'restore point').trim();
  const ref = `refs/chats/${chat}`;
  const parent = (await g(s, ['rev-parse', '-q', '--verify', ref])).out.trim();
  const commit = must(await g(s, ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', 'restore point']), 'restore point').trim();
  must(await g(s, ['update-ref', ref, commit]), 'restore point');
  return commit;
}
function off(s: Store, why: string) {
  s.meta!.off = why;
  saveMeta(s);
  return null;
}
async function snap(cwd: string, chat: string) {
  const { s, prefix, spec } = await storeOf(cwd);
  return serial(s, () => snapOn(s, prefix, spec, chat));
}

let spans: Span[] = [];
const span = (c: PointChat) => spans.find((x) => x.id === c.id && x.t1 == null);
function busy(c: PointChat, on: boolean) {
  const now = Date.now();
  spans = spans.filter((x) => x.t1 == null || now - x.t1 < SPAN);
  if (on && !span(c)) spans.push({ id: c.id, cwd: c.cwd, t0: now, t1: null, edits: new Set() });
  else if (!on && span(c)) span(c)!.t1 = now;
}

function see(c: PointChat, ev: any) {
  const u = ev?.type === 'update' ? ev.update : null;
  if (!u) return;
  if (u.sessionUpdate === 'agent_message_chunk' && u.messageId) c.lastAi = u.messageId;
  if (u.sessionUpdate !== 'tool_call' && u.sessionUpdate !== 'tool_call_update') return;
  const seg = c.seg, now = Date.now(), id = u.toolCallId;
  const t = seg && id ? seg.tools.get(id) || (seg.tools.set(id, { t0: now, t1: null, kind: u.kind }), seg.tools.get(id)) : null;
  if (t && u.kind) t.kind = u.kind;
  if (t && /completed|failed/.test(u.status || '')) t.t1 = now;
  const paths = [...(u.locations || []).map((l: any) => l?.path), ...(u.content || []).filter((x: any) => x?.type === 'diff').map((x: any) => x.path)].filter((p) => typeof p === 'string' && p);
  const kind = u.kind || t?.kind;
  const isEdit = EDITS.has(kind) || (u.content || []).some((x: any) => x?.type === 'diff');
  if (kind && !READS.has(kind) && !isEdit) {
    const sp = span(c);
    if (sp) sp.ran = true;
  }
  if (!paths.length || !isEdit) return;
  for (const p of paths) {
    const abs = path.resolve(c.cwd, p);
    seg?.edits.add(abs);
    span(c)?.edits.add(abs);
  }
}

const on = (c: PointChat) => c.agent !== 'codex' && !c.pointsOff;
const after = (c: PointChat, fn: () => Promise<void>) => (c.pointing = (c.pointing || Promise.resolve()).then(fn).catch((e) => console.error('restore point:', e.message)));

function begin(c: PointChat) {
  return after(c, async () => {
    c.seg = null;
    if (!on(c)) return;
    const b = await snap(c.cwd, c.id);
    if (b) c.seg = { key: c.lastAi || 'start', b, t0: Date.now(), tools: new Map(), edits: new Set(), cwd: c.cwd, mode: c.mode?.() ?? null, words: c.words ?? null };
  });
}
function end(c: PointChat, next: string | false = false) {
  return after(c, async () => {
    const seg = c.seg;
    c.seg = null;
    if (!seg) return;
    const a = await snap(seg.cwd, c.id);
    if (!a) return;
    const t1 = Date.now();
    const { s, spec } = await storeOf(seg.cwd);
    const changed = z(must(await g(s, ['diff-tree', '-r', '-z', '--name-only', '--no-renames', seg.b, a, ...spec]), 'restore point'));
    const runs = [...seg.tools.values()].filter((t) => !READS.has(t.kind)).map((t) => [t.t0 - SLACK, (t.t1 ?? t1) + SLACK]);
    const edits = new Set([...seg.edits].map((p) => key(p)));
    const late: string[] = [];
    for (const rel of changed.slice(0, 5000)) {
      const abs = path.join(s.top, rel);
      if (edits.has(key(abs))) continue;
      let at: number | null = null;
      try {
        at = fs.statSync(abs).mtimeMs;
      } catch {}
      if (at == null ? !runs.length : !runs.some(([x, y]) => at! >= x && at! <= y)) late.push(rel);
    }
    const by: Record<string, string[]> = {};
    for (const x of spans) {
      if (x.id !== c.id && overlaps(x.cwd, seg.cwd) && x.t0 < t1 && (x.t1 ?? t1) > seg.t0) {
        const list = [...x.edits].map((p) => path.relative(s.top, p).replace(/\\/g, '/')).slice(0, 500);
        if (x.ran) list.push('*');
        by[x.id] = list;
      }
    }
    const rels = [...seg.edits].map((p) => path.relative(s.top, p).replace(/\\/g, '/'));
    (c.points ||= []).push({ key: seg.key, b: seg.b, a, t0: seg.t0, t1, cwd: seg.cwd, edits: rels.slice(0, 500), late, by, mode: seg.mode ?? null, words: seg.words ?? null });
    if (REVIEW_MODES.has(seg.mode)) {
      if (c.review?.cwd !== seg.cwd) c.review = { cwd: seg.cwd, files: {} };
      for (const rel of rels) c.review.files[rel] ||= { at: seg.b, t: t1 };
    }
    if (c.points.length > KEEP) c.points.splice(0, c.points.length - KEEP);
    c.saved?.();
    if (next) c.seg = { key: next, b: a, t0: t1, tools: new Map(), edits: new Set(), cwd: seg.cwd, mode: seg.mode, words: c.words ?? null };
  });
}
const cut = (c: PointChat) => (c.seg ? end(c, c.lastAi || 'start') : Promise.resolve());

async function filesOf(s: Store, tree: string, spec: string[]) {
  const m = new Map<string, FileRef>();
  for (const e of z(must(await g(s, ['ls-tree', '-r', '-z', '--full-tree', tree, ...spec]), 'restore point'))) {
    const tab = e.indexOf('\t'), [mode, , oid] = e.slice(0, tab).split(' ');
    m.set(e.slice(tab + 1), { mode, oid });
  }
  return m;
}
async function unturn(s: Store, tree: string, p: Point) {
  const r = await g(s, ['merge-tree', '--write-tree', '-z', `--merge-base=${p.a}`, tree, p.b]);
  if (r.code > 1 || r.code < 0) {
    if (/unknown option|usage:|not something we can merge/i.test(r.err)) throw new HttpError(424, 'Bringing files back needs a newer git: update it (git-scm.com).');
    must(r, 'going back');
  }
  const parts = String(r.out).split('\0');
  const out = parts[0];
  if (r.code === 0) return { tree: out, clash: [] as string[] };
  const clash = new Set<string>();
  for (let i = 1; i < parts.length && parts[i]; i++) clash.add(parts[i].slice(parts[i].indexOf('\t') + 1));
  const index = path.join(s.dir, 'index-rewind');
  must(await g(s, ['read-tree', out], { index }), 'going back');
  const ours = await filesOf(s, tree, ['--', ...clash]);
  for (const f of clash) {
    const o = ours.get(f);
    if (o) must(await g(s, ['update-index', '--index-info'], { index, input: `${o.mode} ${o.oid}\t${f}\n` }), 'going back');
    else must(await g(s, ['update-index', '--force-remove', '--', f], { index }), 'going back');
  }
  const fixed = must(await g(s, ['write-tree'], { index }), 'going back').trim();
  fs.rmSync(index, { force: true });
  return { tree: fixed, clash: [...clash] };
}

async function plan(c: PointChat, k: string | null) {
  await c.pointing;
  if (c.agent === 'codex') return { none: 'a Codex chat keeps no restore points' };
  const ai = c.agent === 'antigravity' ? 'Antigravity' : c.agent === 'cursor' ? 'Cursor' : c.agent === 'copilot' ? 'Copilot' : c.agent === 'grok' ? 'Grok' : 'Claude';
  const i = (c.points || []).findIndex((p) => p.key === (k || 'start'));
  if (i < 0) return { none: 'there is no restore point for this message (sent before restore points were on, or with them off)' };
  const segs = c.points.slice(i);
  const cwd = segs[0].cwd;
  if (!segs.every((p) => p.cwd === cwd) || !fs.existsSync(cwd)) return { none: "the chat's folder changed since that message" };
  const { s, prefix, spec } = await storeOf(cwd);
  return serial(s, async () => {
    ready(s);
    if (s.meta!.off) return { none: `this folder keeps no restore points: ${s.meta!.off}` };
    const now = await snapOn(s, prefix, spec, c.id);
    if (!now) return { none: `this folder keeps no restore points: ${s.meta!.off}` };
    let tree = now;
    const clash = new Set<string>();
    for (const p of [...segs].reverse()) {
      const r = await unturn(s, tree, p);
      tree = r.tree;
      r.clash.forEach((f) => clash.add(f));
    }
    const diff = z(must(await g(s, ['diff-tree', '-r', '-z', '--name-status', '--no-renames', now, tree, ...spec]), 'going back'));
    const moves = new Map<string, string>();
    for (let j = 0; j + 1 < diff.length; j += 2) moves.set(diff[j + 1], diff[j][0]);
    const touched: Set<string>[] = [];
    for (const p of segs) touched.push(new Set(z(must(await g(s, ['diff-tree', '-r', '-z', '--name-only', '--no-renames', p.b, p.a, ...spec]), 'going back'))));
    const why = (f: string): { why: string; clash?: boolean } | null => {
      if (clash.has(f)) return { why: `changed again after ${ai}: ticked, that later change is lost`, clash: true };
      for (let j = 0; j < segs.length; j++) {
        if (!touched[j].has(f)) continue;
        const p = segs[j];
        const mine = p.edits.includes(f);
        for (const [id, theirs] of Object.entries<any>(p.by || {})) {
          const t = nameOf(id), who = t ? `“${t.length > 28 ? t.slice(0, 27) + '…' : t}”` : 'another chat';
          if (theirs.includes(f)) return { why: `${who} changed it too, at the same time` };
          if (theirs.includes('*')) return { why: `${who} ran commands in this folder at the same time` };
          if (!mine) return { why: `${who} worked in this folder at the same time` };
        }
        if (p.late.includes(f)) return { why: `changed while none of ${ai}'s tools ran` };
      }
      return null;
    };
    const items: Item[] = [];
    for (const [f, st] of moves) {
      const w = why(f);
      items.push({ path: f, how: st === 'A' ? 'comes back' : st === 'D' ? 'is removed' : 'goes back', tick: !w, ...w });
    }
    for (const f of clash) if (!moves.has(f)) items.push({ path: f, how: 'goes back', tick: false, ...why(f) });
    items.sort((x, y) => (x.tick as unknown as number) - (y.tick as unknown as number) || x.path.localeCompare(y.path));
    const kept = new Set([...(await filesOf(s, now, spec)).keys(), ...(await filesOf(s, segs[0].b, spec)).keys()]);
    const cant: { path: string; why: string }[] = [];
    for (const f of new Set<string>(segs.flatMap((p) => p.edits))) {
      if (kept.has(f)) continue;
      const inside = !f.startsWith('..') && !path.isAbsolute(f) && (!prefix || f === prefix || f.startsWith(prefix + '/'));
      cant.push({ path: f, why: !inside ? 'outside the project' : s.meta!.big.includes(f) ? 'over 50 MB' : 'ignored by git' });
    }
    c.plan = { token: crypto.randomBytes(6).toString('hex'), s, now, tree, first: segs[0].b, items, spec };
    return { token: c.plan!.token, items, cant: cant.slice(0, 50) };
  });
}

async function apply(c: PointChat, token: string, picks: string[]) {
  const pl = c.plan;
  if (!pl || pl.token !== token) throw new HttpError(409, 'The files changed since the dialog opened: go back again to look.');
  c.plan = null;
  const want = new Set(picks);
  const items = pl.items.filter((x) => want.has(x.path));
  if (!items.length) return { done: [], skipped: [] };
  const { s } = pl;
  return serial(s, async () => {
    const [now, tree, first] = [await filesOf(s, pl.now, pl.spec), await filesOf(s, pl.tree, pl.spec), await filesOf(s, pl.first, pl.spec)];
    const entries: Entry[] = items.map((x) => ({ path: x.path, from: now.get(x.path) || null, to: (x.clash ? first : tree).get(x.path) || null }));
    const r = await write(s, entries);
    return { ...r, undo: remember(s, entries, r.done) };
  });
}
const undos = new Map<string, { s: Store; entries: Entry[] }>();
function remember(s: Store, entries: Entry[], done: string[]) {
  const undo = crypto.randomBytes(6).toString('hex');
  undos.set(undo, { s, entries: entries.filter((e) => done.includes(e.path)).map((e) => ({ path: e.path, from: e.to, to: e.from })) });
  if (undos.size > 20) undos.delete(undos.keys().next().value!);
  return undo;
}
async function unapply(token: string) {
  const u = undos.get(token);
  if (!u) throw new HttpError(410, "This going back's files aren't known any more (the app restarted): they stay as they are.");
  return serial(u.s, async () => {
    const r = await write(u.s, u.entries);
    u.entries = u.entries.map((e) => ({ ...e, from: e.to, to: e.from }));
    return r;
  });
}

async function blobs(s: Store, oids: string[]) {
  const want = [...new Set(oids)];
  const m = new Map<string, Buffer>();
  if (!want.length) return m;
  const r = await g(s, ['cat-file', '--batch'], { input: want.join('\n') + '\n', buffer: true });
  if (r.code) throw new HttpError(409, 'going back: the restore point is missing files');
  const b: Buffer = r.out;
  let at = 0;
  while (at < b.length) {
    const nl = b.indexOf(10, at);
    const [oid, type, size] = b.slice(at, nl).toString().split(' ');
    if (type === 'missing') throw new HttpError(409, 'going back: the restore point is missing files');
    const n = Number(size);
    m.set(oid, b.subarray(nl + 1, nl + 1 + n));
    at = nl + 1 + n + 1;
  }
  return m;
}

async function write(s: Store, entries: Entry[]) {
  const skipped: string[] = [];
  const throughLink = (rel: string) => {
    let at = s.top;
    for (const part of rel.split('/')) {
      at = path.join(at, part);
      try {
        if (fs.lstatSync(at).isSymbolicLink()) return true;
      } catch {
        return false;
      }
    }
    return false;
  };
  const go: Entry[] = [];
  for (const e of entries) {
    if (e.from?.mode === '160000' || e.to?.mode === '160000' || throughLink(e.path)) skipped.push(e.path);
    else go.push(e);
  }
  const changed = (e: Entry) => new HttpError(409, `Nothing changed: ${e.path} changed since the dialog opened. Go back again to look.`);
  for (const e of go) if (!!e.from !== fs.existsSync(path.join(s.top, e.path))) throw changed(e);
  const there = go.filter((e) => e.from);
  const hashes = there.length ? must(await g(s, ['hash-object', '--no-filters', '--stdin-paths'], { input: there.map((e) => e.path).join('\n') + '\n' }), 'going back').trim().split(/\r?\n/) : [];
  for (const e of go) {
    if (e.from && hashes[there.indexOf(e)] !== e.from.oid) throw changed(e);
  }
  const data = await blobs(s, go.flatMap((e) => [e.from?.oid, e.to?.oid]).filter(Boolean) as string[]);
  const done: Entry[] = [];
  const put = (rel: string, v: FileRef | null) => {
    const abs = path.join(s.top, rel);
    if (!v) {
      fs.rmSync(abs, { force: true });
      for (let d = path.dirname(abs); key(d).startsWith(key(s.top) + path.sep); d = path.dirname(d)) {
        try {
          fs.rmdirSync(d);
        } catch {
          break;
        }
      }
      return;
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.amethyst-${crypto.randomBytes(3).toString('hex')}`;
    fs.writeFileSync(tmp, data.get(v.oid)!, { mode: v.mode === '100755' ? 0o755 : 0o644 });
    try {
      fs.renameSync(tmp, abs);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      throw e;
    }
  };
  try {
    for (const e of [...go.filter((x) => x.to), ...go.filter((x) => !x.to)]) {
      put(e.path, e.to);
      done.push(e);
    }
  } catch (err) {
    const failed = go.find((e) => !done.includes(e));
    for (const e of done.reverse()) {
      try {
        put(e.path, e.from);
      } catch {}
    }
    throw new HttpError(409, `Nothing changed: ${failed?.path || 'a file'} couldn't be written (${(err as NodeJS.ErrnoException).code || (err as Error).message}). Is it open in another program?`);
  }
  return { done: done.map((e) => e.path), skipped };
}

function carry(from: PointChat, to: PointChat, k?: string | null) {
  const i = k === undefined ? (from.points || []).length : (from.points || []).findIndex((p) => p.key === (k || 'start'));
  to.points = i < 0 ? [] : from.points.slice(0, i);
  to.lastAi = k === undefined ? from.lastAi || null : k || null;
  to.review = k === undefined && from.review ? structuredClone(from.review) : null;
  if (!to.points.length) return Promise.resolve();
  const copy = async (s: Store, kind: string) => (await g(s, ['rev-parse', '-q', '--verify', `refs/${kind}/${from.id}`])).out.trim() && g(s, ['update-ref', `refs/${kind}/${to.id}`, `refs/${kind}/${from.id}`]);
  return storeOf(to.points[0].cwd)
    .then(({ s }) => serial(s, async () => (await copy(s, 'chats'), to.review && (await copy(s, 'review')))))
    .catch(() => {});
}

function tidy(alive: Set<string>) {
  return (tidying = tidyNow(alive).catch((e: Error) => console.error('restore points tidy:', e.message)));
}
async function tidyNow(alive: Set<string>) {
  const root = home();
  const stamp = path.join(root, 'tidied');
  try {
    if (Date.now() - fs.statSync(stamp).mtimeMs < 24 * 3600e3) return;
  } catch {}
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  } catch {
    return;
  }
  for (const dir of dirs) {
    const s: Store = { top: root, dir, chain: Promise.resolve() };
    const refs = z((await g(s, ['for-each-ref', '-z', '--format=%(refname)%00', 'refs/chats/', 'refs/review/'])).out);
    const gone = refs.filter((r) => !alive.has(r.replace(/^refs\/(chats|review)\//, '')));
    for (const r of gone) await g(s, ['update-ref', '-d', r]);
    if (gone.length) await g(s, ['gc', '--prune=now', '--quiet'], { timeout: 10 * 60e3 });
  }
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(stamp, '');
}

const nameOfChat = (id: string) => nameOf(id);
export { init, busy, see, begin, end, cut, plan, apply, unapply, carry, tidy, overlaps, REVIEW_MODES, storeOf, serial, ready, g, must, z, blobs, write, remember, key, nameOfChat };
export type { Store, Entry, FileRef, Point, PointChat, Review, RevFile };
