import fs from 'fs';
import os from 'os';
import path from 'path';
import url from 'url';
import { execFile } from 'child_process';
import { guard, HttpError } from './routes.ts';
import { sortOf, SAFE_OPEN } from '../../public/base/files.ts';
import type { IncomingMessage, ServerResponse } from 'http';
import type { AgentInfo, AskCard, ChatDraft, ChatPlace, ChatReview, Routes, SubSummary } from '../../public/base/types.ts';
import type { RootMeta } from './routes.ts';
import { raw } from './page.ts';
import { CALM, WIN } from './util.ts';
import { queue } from '../../public/base/queue.ts';

type Timer = ReturnType<typeof setTimeout>;
interface Live {
  id: string;
  step?: string;
  kind: string;
  program: string;
  cwd: string;
  title: string;
  status: string;
  line: string;
  at: number;
  started: number;
  due: Timer | null;
  gone: Timer | null;
  pid?: string;
  model?: string;
  session?: string | null;
  am?: number;
  wt?: string | null;
  wtBranch?: string | null;
  subs?: SubSummary[];
  ask?: AskCard | null;
  place?: ChatPlace | null;
  draft?: ChatDraft | null;
  review?: ChatReview | null;
  report?: boolean;
  cacheOff?: boolean;
  note?: string;
  rang?: { at: number; why: string } | null;
  under?: string;
}
type Ev = Record<string, unknown>;
type Out = (ev: Ev) => void;
type Scope = (a: Live) => object | null | undefined | false;
interface Sub {
  out: Out;
  scope: Scope;
}
type Off = (() => unknown) | null | undefined;
interface Page {
  res: ServerResponse;
  follows: Map<string, () => unknown>;
}
interface By {
  chat: (id: string, out: Out, o: { tools: boolean }) => Off;
  term: (id: string, out: Out) => Off;
  scope: () => Scope;
  files: (out: Out) => Off;
  path: (file: string, out: Out) => Off;
  ue: (out: Out) => Off;
  ueask: (out: Out) => Off;
  runask: (out: Out) => Off;
  debug: (out: Out) => Off;
}

const list = new Map<string, Live>();
const subs = new Set<Sub>();
const KEEP = 2 * 60e3;

const pub = ({ id, kind, program, title, status, line, model, at, started, session, am, wt, wtBranch, subs, ask, place, draft, review, report, cacheOff, note, rang, step }: Live): Omit<AgentInfo, 'pid' | 'project'> => ({ id, kind, program, title, status, line, model, at, started, session, am, ...(step ? { step } : {}), ...(wt ? { wt } : {}), ...(wtBranch ? { wtBranch } : {}), ...(subs?.length ? { subs } : {}), ...(ask ? { ask } : {}), ...(place ? { place } : {}), ...(draft ? { draft } : {}), ...(review ? { review } : {}), ...(report ? { report } : {}), ...(cacheOff ? { cacheOff } : {}), ...(note ? { note } : {}), ...(rang ? { rang } : {}) });
const lastLine = (s: unknown, n = 140) => String(s || '').split('\n').map((l) => l.trim()).filter(Boolean).pop()?.slice(0, n) || '';

function tell(a: Live) {
  a.due = null;
  if (a.under) return;
  for (const s of subs) {
    const extra = s.scope(a);
    if (extra) s.out({ type: 'agent', agent: { ...pub(a), ...extra } });
  }
}

function set(id: string, patch: Partial<Live>) {
  let a = list.get(id)!;
  const fresh = !a;
  if (fresh) list.set(id, (a = { id, kind: 'chat', program: '', cwd: '', title: '', status: 'starting', line: '', at: Date.now(), started: Date.now(), due: null, gone: null }));
  const was = a.status, asked = a.ask?.id;
  Object.assign(a, patch);
  const moved = a.status !== was;
  if (moved && !(was === 'done' && a.status === 'idle')) a.at = Date.now();
  if (moved && a.status === 'ended') a.gone = setTimeout(() => drop(id), KEEP);
  if (fresh || moved || a.ask?.id !== asked || 'place' in patch || 'draft' in patch || 'review' in patch || 'report' in patch || 'cacheOff' in patch || 'note' in patch || 'step' in patch) {
    clearTimeout(a.due!);
    tell(a);
  } else if (!a.due) a.due = setTimeout(() => tell(a), CALM);
}

function drop(id: string) {
  const a = list.get(id);
  if (!a) return;
  clearTimeout(a.due!);
  clearTimeout(a.gone!);
  list.delete(id);
  for (const s of subs) s.out({ type: 'gone', id });
}

const get = (id: string): any => list.get(id);
const all = () => [...list.values()];

function watch(scope: Scope, out: Out) {
  const agents: object[] = [];
  for (const a of list.values()) {
    if (a.under) continue;
    const extra = scope(a);
    if (extra) agents.push({ ...pub(a), ...extra });
  }
  out({ type: 'all', agents });
  const s = { out, scope };
  subs.add(s);
  return () => subs.delete(s);
}

const pages = new Map<string, Page>();

function stream(c: string | null, req: IncomingMessage, res: ServerResponse) {
  c = String(c || '').slice(0, 40);
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  pages.get(c)?.follows.forEach((stop) => stop());
  const page: Page = { res, follows: new Map() };
  pages.set(c, page);
  res.write(': on\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => {
    clearInterval(ping);
    page.follows.forEach((stop) => stop());
    if (pages.get(c) === page) pages.delete(c);
  });
}

function follow({ c, f, chat, tools, term, agents, files, path: file, ue, ueask, runask, debug, stop }: any, by: By) {
  const page = pages.get(String(c || ''));
  if (!page) throw new HttpError(409, 'no such stream');
  f = String(f || '').slice(0, 40);
  page.follows.get(f)?.();
  page.follows.delete(f);
  if (stop) return { ok: true };
  const out = (e: Ev) => page.res.write(`data: ${JSON.stringify({ f, e })}\n\n`);
  const off = chat ? by.chat(String(chat), out, { tools: tools === true }) : term ? by.term(String(term), out) : agents ? watch(by.scope(), out) : files ? by.files(out) : file ? by.path(file, out) : ue ? by.ue(out) : ueask ? by.ueask(out) : runask ? by.runask(out) : debug ? by.debug(out) : null;
  if (off) page.follows.set(f, off);
  return { ok: true };
}

let browserCmd = () => 'msedge';
let onSeen: (id?: string) => void = () => {};
const exes = new Map<string, string>();

const onDisk = (full: string) => fs.promises.stat(full).catch((e) => Promise.reject(e.code === 'ENOENT' ? new HttpError(404, `not on the disk: ${full}`) : e));

async function show(full: string) {
  const st = await onDisk(full);
  if (process.env.MIND_FAKE_EXPLORER) return fs.promises.appendFile(process.env.MIND_FAKE_EXPLORER, full + '\n').then(() => ({ ok: true }));
  const [cmd, args]: [string, string[]] = process.platform === 'win32' ? ['explorer.exe', st.isDirectory() ? [full] : ['/select,', full]]
    : process.platform === 'darwin' ? ['open', st.isDirectory() ? [full] : ['-R', full]] : ['xdg-open', [st.isDirectory() ? full : path.dirname(full)]];
  execFile(cmd, args, { windowsHide: false }, () => {});
  return { ok: true };
}

function launch(exe: string, args: string[], what: string) {
  if (process.env.MIND_FAKE_EXPLORER) return fs.promises.appendFile(process.env.MIND_FAKE_EXPLORER, `${what}\n${JSON.stringify({ exe, args })}\n`).then(() => ({ ok: true }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ ok: true }), 3000);
    execFile(exe, args, { windowsHide: false }, (err, _, stderr) => {
      clearTimeout(timer);
      if (!err) return resolve({ ok: true });
      reject(new HttpError(500, `could not open ${args.at(-1)} with ${exe}: ${String(stderr || err.message).trim()}`));
    });
  });
}

const regValue = (key: string) =>
  new Promise<string | null>((resolve) =>
    execFile('reg', ['query', key, '/ve'], { windowsHide: true }, (err, out) => {
      const v = !err && /REG_(?:EXPAND_)?SZ\s+(.+)/.exec(out)?.[1].trim().replace(/^"(.*)"$/, '$1');
      resolve(v ? v.replace(/%(\w+)%/g, (m, k) => process.env[k] ?? m) : null);
    }),
  );

async function browserExe() {
  const b = browserCmd();
  if (path.isAbsolute(b)) return b;
  const name = b.replace(/\.exe$/i, '');
  if (!exes.has(name)) {
    const key = `SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${name}.exe`;
    const exe = /^[\w.-]+$/.test(name) && ((await regValue('HKLM\\' + key)) || (await regValue('HKCU\\' + key)));
    if (!exe) throw new HttpError(400, `no browser named ${b} on this PC: give its full path in settings`);
    exes.set(name, exe);
  }
  return exes.get(name)!;
}

async function openDefault(full: string) {
  const st = await onDisk(full);
  if (st.isDirectory() || !SAFE_OPEN.test(full)) throw new HttpError(400, 'this file is not opened from Amethyst: it would run. Show it in the file manager instead');
  if (process.env.MIND_FAKE_EXPLORER) return fs.promises.appendFile(process.env.MIND_FAKE_EXPLORER, `default:${full}\n`).then(() => ({ ok: true }));
  execFile(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [full], { windowsHide: false }, () => {});
  return { ok: true };
}

async function openInBrowser(t: string) {
  const b = browserCmd();
  const [exe, args]: [string, string[]] = process.platform === 'win32' ? [await browserExe(), [t]] : process.platform === 'darwin' ? ['open', b ? ['-a', b, t] : [t]] : [b || 'xdg-open', [t]];
  return launch(exe, args, 'open:' + t);
}

function openMail(t: string) {
  t = t.replace(/[\s"]/g, encodeURIComponent);
  const [exe, args]: [string, string[]] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', t]] : [process.platform === 'darwin' ? 'open' : 'xdg-open', [t]];
  return launch(exe, args, 'mail:' + t);
}

async function outside(t: string | null | undefined, root: string | null) {
  t = String(t || '').trim();
  if (/^https?:\/\//i.test(t)) return openInBrowser(t);
  if (/^mailto:/i.test(t)) return openMail(t);
  if (/^[a-z][a-z\d+.-]+:/i.test(t) && !/^file:/i.test(t)) throw new HttpError(400, `not opened outside Amethyst: ${t.split(':')[0]}: links`);
  const full = cleanPath(t, root);
  const st = await onDisk(full);
  return st.isDirectory() || sortOf(full) === 'other' ? show(full) : openInBrowser(full);
}

const within = (a: string, b: string) => {
  const r = path.relative(b, a);
  return !r || (!r.startsWith('..') && !path.isAbsolute(r));
};

const network = (p: unknown) => /^[\\/]{2}/.test(String(p || ''));

function cleanPath(p: string | null | undefined, root: string | null) {
  p = String(p || '').replace(/(#L\d+(-L?\d+)?|:\d+(-\d+|:\d+)?)$/, '');
  if (/^file:\/\//i.test(p)) p = url.fileURLToPath(p);
  p = p.replace(/^~(?=[\\/]|$)/, () => os.homedir());
  if (network(p) && !(root && within(path.normalize(p), root))) throw new HttpError(400, 'network paths are not opened');
  if (!path.isAbsolute(p)) throw new HttpError(400, 'not a full path');
  return path.normalize(p);
}

const realPath = async (p: string | null | undefined, root: string | null) => {
  try {
    const full = cleanPath(p, root);
    const st = await fs.promises.stat(full);
    return { full, dir: st.isDirectory(), mtime: st.mtimeMs };
  } catch {
    return null;
  }
};

const sameDir = (a: string, b: string) => {
  const x = path.resolve(a || ''), y = path.resolve(b || '');
  return WIN ? x.toLowerCase() === y.toLowerCase() : x === y;
};
const ROUTES: Routes = {
  'GET /api/orch/queue': async (_, _q, root: string, pid?: string) => {
    const mine = [...list.values()].filter((a) => a.kind === 'chat' && !a.under && (a.pid ? a.pid === pid : sameDir(a.cwd, root))).map((a) => ({ ...a, pid: pid || '' }));
    const now = Date.now();
    return { queue: queue(mine, pid || '').map((a) => ({ id: a.id, title: a.title, status: a.status, line: a.line, waiting: Math.max(0, now - a.at), am: a.am || 1, ask: a.ask || null })) };
  },
  'GET /api/raw': async (_, q, _root, _pid, R: RootMeta) => {
    const p = await R.disk.real(guard(q!.get('path')!));
    return raw(await fs.promises.readFile(p), p, "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; sandbox", { type: 'text/plain; charset=utf-8' });
  },
  'GET /api/img': async (_, q, root: string) => {
    const name = String(q!.get('name') || '');
    if (!/^[\w\- ]+\.(png|jpe?g|gif|webp)$/i.test(name)) throw new HttpError(400, 'bad image name');
    const dir = path.join(root, '.amethyst', 'images');
    let p = path.join(dir, name);
    if (!fs.existsSync(p)) p = path.join(dir, 'unused', name);
    return raw(await fs.promises.readFile(p), p, "default-src 'none'; img-src data:");
  },
  'POST /api/reveal': async ({ path: rel }, _q, _root, _pid, R: RootMeta) => show(await R.disk.real(guard(rel))),
  'POST /api/archive/show': async (_, _q, _root, _pid, R: RootMeta) => show(R.archivePlace()),
  'POST /api/show-path': async ({ path: p }, _, root: string | null) => show(cleanPath(p, root)),
  'POST /api/open-default': async ({ path: p }, _, root: string | null) => openDefault(cleanPath(p, root)),
  'POST /api/paths': async ({ paths }, _, root: string | null) => {
    const real = await Promise.all((paths || []).map((p: string | null) => realPath(p, root)));
    return { paths: real.map((r: { full: string; dir: boolean } | null) => r?.full ?? null), dirs: real.map((r: { full: string; dir: boolean } | null) => r?.dir ?? null), times: real.map((r: { mtime: number } | null) => r?.mtime ?? null) };
  },
  'POST /api/open-outside': async ({ target }, _, root: string | null) => outside(target, root),
  'POST /api/agents/seen': async ({ id, ids, all }, _q, root: string, pid?: string) => {
    const these = all ? [...list.values()].filter((a) => !a.under && (a.pid ? a.pid === pid : !!root && sameDir(a.cwd, root))) : (Array.isArray(ids) ? ids : [id]).map((x: unknown) => list.get(String(x || '')));
    let cleared = 0;
    for (const a of these) if (a?.status === 'done') (set(a.id, { status: 'idle' }), onSeen(a.id), cleared++);
    return { ok: true, cleared };
  },
};

const setBrowser = (fn: () => string) => {
  browserCmd = fn;
};
const setSeen = (fn: (id?: string) => void) => {
  onSeen = fn;
};
export type { Live };
export { set, drop, get, all, stream, follow, ROUTES, lastLine, within, network, setBrowser, setSeen };
