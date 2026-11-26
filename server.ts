import './server/base/env.ts';
import http from 'http';
import fs from 'fs';
const fsp = fs.promises;
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import * as agents from './server/chat/agents.ts';
import * as terms from './server/terminal/terms.ts';
import * as live from './server/base/live.ts';
import * as git from './server/git/git.ts';
import * as github from './server/github/github.ts';
import * as worktrees from './server/base/worktrees.ts';
import * as branchnames from './server/base/branchnames.ts';
import * as setup from './server/setup/setup.ts';
import * as ue from './server/ue/ue.ts';
import * as debug from './server/debug/debug.ts';
import * as voice from './server/voice/voice.ts';
import * as clips from './server/clips/clips.ts';
import * as welcome from './server/welcome/welcome.ts';
import * as usage from './server/usage/routes.ts';
import * as drive from './server/chat/drive/routes.ts';
import { ACTIONS as CHAT_ACTS } from './server/chat/drive/actions.ts';
import * as workers from './server/chat/workers/routes.ts';
import { ACTIONS as AGENT_ACTS } from './server/chat/workers/actions.ts';
import { ACTIONS as PROJECT_ACTS } from './server/project/actions.ts';
import { ACTIONS as DEBUG_ACTS } from './server/debug/actions.ts';
import { ACTIONS as UE_ACTS } from './server/ue/actions.ts';
import { ACTIONS as GIT_ACTS } from './server/git/actions.ts';
import { ACTIONS as GH_ACTS } from './server/github/actions.ts';
import { checkActs } from './server/base/acts.ts';
import { installCli, removeCli } from './server/cli/install.ts';
import { inFlight, startHitch } from './server/base/hitch.ts';
import { Raw, raw, serveStatic } from './server/base/page.ts';
import { DOT, HttpError, HEX, ID, MAX_TEXT, cleanName, guard, knownBinary, newId, openRoot } from './server/base/routes.ts';
import { MAX_PATHS, TEXT_EXT, BOARD_EXT } from './public/base/files.ts';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Disk, ArchiveStore } from './server/base/routes.ts';
import type { Project, RouteHandler, Routes } from './public/base/types.ts';
import type { Live } from './server/base/live.ts';
import { exists, isDir, replace, WIN } from './server/base/util.ts';
import { asUser, gate, isUser } from './server/base/user.ts';
import * as runs from './server/base/runs.ts';
import * as agentfiles from './server/base/agentfiles.ts';

type Root = ReturnType<typeof openRoot> & { ROOT: string };
interface WsEntry {
  id: string;
  name: string;
  path: string;
  desc?: string;
  color: string | null;
  pin?: number | null;
}
type Ws = WsEntry & { home: boolean; loose: boolean; root: Root };
type Out = (e: Record<string, unknown>) => void;
interface Watch {
  w: fs.FSWatcher | null;
  gw: fs.FSWatcher | null;
  cw: fs.FSWatcher | null;
  outs: Set<Out>;
  timer: ReturnType<typeof setTimeout> | 0;
  paths: Set<string>;
  all: boolean;
  git: boolean;
}


const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ROOT_ARG = args.find((a) => !a.startsWith('--')) || process.env.MIND_ROOT;
const FIRST = ROOT_ARG ? path.resolve(ROOT_ARG) : null;
const APP_DATA = (() => {
  const [now, old] = process.env.APPDATA ? ['Amethyst', 'ProjectMind'] : ['.amethyst', '.projectmind'];
  const base = process.env.APPDATA || os.homedir();
  return fs.existsSync(path.join(base, now, 'workspace')) || !fs.existsSync(path.join(base, old, 'workspace')) ? path.join(base, now) : path.join(base, old);
})();
const WS_DIR = path.resolve(flag('workspace') || process.env.MIND_WORKSPACE || path.join(APP_DATA, 'workspace'));
const PORT = Number(process.env.PORT) || 4777;
delete process.env.PORT;
const ARCHIVE = path.resolve(flag('archive') || (flag('workspace') || process.env.MIND_WORKSPACE ? path.join(WS_DIR, DOT, 'archive') : path.join(APP_DATA, 'archive')));
const WORKTREES = path.resolve(flag('worktrees') || (flag('workspace') || process.env.MIND_WORKSPACE ? path.join(WS_DIR, DOT, 'worktrees') : process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Amethyst', 'worktrees') : path.join(os.homedir(), '.amethyst', 'worktrees')));
const CHECKPOINTS = path.resolve(flag('workspace') || process.env.MIND_WORKSPACE ? path.join(WS_DIR, DOT, 'checkpoints') : process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Amethyst', 'checkpoints') : path.join(os.homedir(), '.amethyst', 'checkpoints'));
const same = (a: string, b: string) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);

const touched = new Map<string, number>();
const touch = (p: string) => (touched.set(WIN ? p.toLowerCase() : p, Date.now()), dropCached(p), p);
function ownChange(p: string) {
  const now = Date.now(), k = WIN ? p.toLowerCase() : p;
  let own = false;
  for (const [q, when] of touched) {
    if (now - when > 2000) touched.delete(q);
    else if (k === q || k === q + '.tmp' || k.startsWith(q + path.sep)) own = true;
  }
  return own;
}

const plainPath = (p: string) => {
  const s = p.replace(/[. ]+(?=[\\/]|$)/g, '');
  return WIN ? s.toLowerCase() : s;
};
async function realOf(p: string): Promise<string> {
  let rest = '';
  for (let q = p; ; ) {
    try {
      return path.join(await fsp.realpath(q), rest);
    } catch (e) {
      if (!['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code!)) throw e;
      if (await fsp.lstat(q).catch(() => null)) throw new HttpError(400, 'path outside root');
      const up = path.dirname(q);
      if (up === q) return p;
      rest = path.join(path.basename(q), rest);
      q = up;
    }
  }
}
async function realInside(root: string, p: string, own = false) {
  const base = await realOf(root);
  const real = own && !same(p, root) ? path.join(await realOf(path.dirname(p)), path.basename(p)) : await realOf(p);
  if (!within(real, base)) throw new HttpError(400, 'path outside root');
  return { real, base };
}
function nodeDisk(ROOT: string): Disk & { abs: (rel: string) => string; real: (rel: string, own?: boolean) => Promise<string> } {
  const hidden = (root: string, p: string) => [path.join(root, DOT, 'agents.json'), path.join(root, DOT, 'agents.json.tmp')].map(plainPath).includes(plainPath(p));
  const at = (rel: string) => {
    const p = path.resolve(ROOT, rel);
    const r = path.relative(ROOT, p);
    if (r.startsWith('..') || path.isAbsolute(r)) throw new HttpError(400, 'path outside root');
    if (hidden(ROOT, p)) throw new HttpError(400, 'hidden path');
    return p;
  };
  const real = async (rel: string, own = false) => {
    const p = at(rel);
    const { real, base } = await realInside(ROOT, p, own);
    if (hidden(base, real)) throw new HttpError(400, 'hidden path');
    return p;
  };
  return {
    caseless: WIN,
    abs: at,
    real,
    read: async (rel: string) => fsp.readFile(await real(rel), 'utf8').catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e))),
    async bytes(rel: string, n: number) {
      const fh = await fsp.open(await real(rel), 'r');
      try {
        const buf = Buffer.alloc(n);
        return buf.subarray(0, (await fh.read(buf, 0, n, 0)).bytesRead);
      } finally {
        await fh.close();
      }
    },
    async write(rel: string, text: string, { fresh = false, atomic = false } = {}) {
      const p = touch(await real(rel));
      await fsp.mkdir(path.dirname(p), { recursive: true });
      if (!atomic) return fsp.writeFile(p, text, fresh ? { flag: 'wx' } : undefined);
      await replace(p, text);
    },
    stat: (rel: string) => real(rel).then((p) => fsp.stat(p)).then((s) => ({ dir: s.isDirectory(), size: s.size, mtime: s.mtimeMs }), () => null),
    list: async (rel: string) => (await fsp.readdir(await real(rel), { withFileTypes: true })).map((e) => ({ name: e.name, dir: e.isDirectory(), file: e.isFile() })),
    async mkdir(rel: string) {
      const p = await real(rel);
      if (!(await fsp.stat(p).catch(() => null))) touch(p);
      const made = await fsp.mkdir(p, { recursive: true });
      if (made) touch(made);
    },
    move: async (rel: string, dest: string) => fsp.rename(touch(await real(rel, true)), touch(await real(dest, true))),
    remove: async (rel: string) => fsp.rm(touch(await real(rel, true)), { recursive: true, force: true }),
  };
}

const held = (e: any, a: string) => (['EBUSY', 'EPERM', 'EACCES'].includes(e.code) ? new HttpError(409, `“${path.basename(a)}” can not be moved: another program has it open (or a terminal stands in it), or it is read-only`) : e);
async function moveAcross(a: string, b: string): Promise<{ left?: string }> {
  touch(a), touch(b);
  if (await exists(b)) throw new HttpError(409, `there is a “${path.basename(b)}” in ${path.dirname(b)} already`);
  await fsp.mkdir(path.dirname(b), { recursive: true });
  try {
    if (process.env.MIND_FAKE_EXDEV) throw Object.assign(new Error('another drive (a test)'), { code: 'EXDEV' });
    await fsp.rename(a, b);
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw held(e, a);
  }
  let spare = a + '.moving';
  for (let i = 2; await exists(spare); i++) spare = `${a}.moving${i}`;
  await fsp.rename(a, touch(spare)).catch((e) => Promise.reject(held(e, a)));
  try {
    await fsp.cp(spare, b, { recursive: true, errorOnExist: true, force: false });
  } catch (e) {
    await fsp.rm(touch(b), { recursive: true, force: true }).catch(() => {});
    await fsp.rename(spare, touch(a)).catch(() => Promise.reject(new HttpError(500, `${(e as Error).message}; the original is at ${spare}`)));
    throw e;
  }
  try {
    if (process.env.MIND_FAKE_LEFT) throw new Error('held (a test)');
    await fsp.rm(touch(spare), { recursive: true, force: true });
    return {};
  } catch {
    return { left: spare };
  }
}

const archiveDir = () => {
  const a = HOME_ROOT.meta.archive;
  return typeof a === 'string' && path.isAbsolute(a) ? path.resolve(a) : ARCHIVE;
};
const archiveTo = () => {
  const t = HOME_ROOT.meta.archiveTo;
  return typeof t === 'string' && path.isAbsolute(t) ? path.resolve(t) : null;
};
let archiveBusy = false;
const ARCHIVE_BUSY = 'the archive folder is being moved: try again when it is done';
function archiveAt(sub: string) {
  if (archiveBusy) throw new HttpError(409, ARCHIVE_BUSY);
  const to = archiveTo();
  return to && fs.existsSync(path.join(to, sub)) ? path.join(to, sub) : path.join(archiveDir(), sub);
}
const ARCHIVE_SUB = /(^agent setup| [0-9a-f]{8})(\.moving\d*)?$/;
function archiveStore(dir: string): ArchiveStore {
  const sub = `${path.basename(dir) || 'root'} ${crypto.createHash('sha1').update(WIN ? dir.toLowerCase() : dir).digest('hex').slice(0, 8)}`;
  const at = () => nodeDisk(archiveAt(sub));
  const own = nodeDisk(dir);
  return {
    abs: (r: string) => at().abs(r),
    read: (r: string) => at().read(r),
    stat: (r: string) => at().stat(r),
    list: (r: string) => at().list(r),
    mkdir: (r: string) => at().mkdir(r),
    remove: (r: string) => at().remove(r),
    take: async (r: string, dest: string) => moveAcross(await own.real(r, true), at().abs(dest)),
    give: async (r: string, dest: string) => moveAcross(at().abs(r), await own.real(dest, true)),
  };
}

const roots = new Map<string, Root>();
function dropCached(p: string) {
  for (const R of roots.values()) {
    const rel = path.relative(R.ROOT, p);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) R.tree.changed(rel.split(path.sep).join('/'));
    else if (!rel) R.tree.changed(null);
  }
}
function rootAt(dir: string): Root {
  const key = WIN ? dir.toLowerCase() : dir;
  if (!roots.has(key)) {
    let saved: string | null = null;
    try {
      saved = fs.readFileSync(path.join(dir, DOT, 'meta.json'), 'utf8');
    } catch {}
    const R = Object.assign(openRoot(nodeDisk(dir), saved, archiveStore(dir)), { ROOT: dir });
    if (R.broken) console.error(`${path.join(dir, DOT, 'meta.json')} doesn't parse (${R.broken}): it is not saved until it is fixed`);
    roots.set(key, R);
  }
  return roots.get(key)!;
}

fs.mkdirSync(WS_DIR, { recursive: true });
const HOME = 'main';
const HOME_ROOT = rootAt(WS_DIR);
agents.init({ dataDir: path.join(WS_DIR, DOT), claudeTerms: (account, am) => terms.claudeOff(account, am), claudeTermsOn: (account) => terms.claudeOn(account), archive: (from, label) => moveAcross(from, path.join(archiveAt('claude accounts'), label)), checkpoints: CHECKPOINTS });
const worktreesDir = () => {
  const w = HOME_ROOT.meta.worktrees;
  return typeof w === 'string' && path.isAbsolute(w) ? path.resolve(w) : WORKTREES;
};
worktrees.setHome(worktreesDir);
const projectAt = (dir: string) => {
  let best = '';
  for (const w of wsList()) {
    if (!fs.existsSync(w.path)) continue;
    for (const p of wsRoot(w).meta.projects as Project[]) if (within(dir, p.path) && p.path.length > best.length) best = p.path;
  }
  return best;
};
const projectsOf = (dir: string) => {
  for (const w of wsList()) {
    if (!fs.existsSync(w.path)) continue;
    const list = (wsRoot(w).meta.projects as Project[]).map((p) => p.path);
    if (within(dir, w.path) || list.some((p) => within(dir, p))) return list;
  }
  return [dir];
};
usage.init({ dataDir: path.join(WS_DIR, DOT), projectsOf, worktreesDir, claudeDirs: agents.accountDirs });
branchnames.setStore({
  get: (dir) => {
    const p = projectAt(dir);
    return p ? rootAt(p).meta.branchNames : undefined;
  },
  set: async (dir, names) => {
    const p = projectAt(dir);
    if (!p) throw new HttpError(404, `${dir} is in no Amethyst project`);
    const R = rootAt(p);
    if (Object.keys(names).length) R.meta.branchNames = names;
    else delete R.meta.branchNames;
    await R.saveMeta();
  },
});
function gitShow(dir: string, ev: Record<string, unknown>) {
  let sent = false;
  for (const [top, x] of watched) {
    if (!within(dir, top) || !x.outs.size) continue;
    for (const o of x.outs) o({ type: 'gitshow', ...ev, repo: path.relative(top, dir).replace(/\\/g, '/') });
    sent = true;
  }
  return sent;
}
git.init({ napIn: agents.napIn, touchedIn: agents.touchedIn, ask: agents.ask, bin: async (abs, label) => {
  const to = path.join(archiveAt('discarded changes'), label);
  await moveAcross(abs, to);
  return to;
}, unbin: (from, to) => moveAcross(from, to), addProject: async (dir, name, from) => {
  const who = from.by ? drive.callerOf(from) : null, pid = who ? who.pid : from.pid || '', at = who ? who.root : typeof from.cwd === 'string' ? from.cwd : '';
  const live = wsList().filter((x) => x.id !== HOME || homeListed()).filter((x) => fs.existsSync(x.path));
  const w = (pid && live.find((x) => (wsRoot(x).meta.projects as Project[]).some((p) => p.id === pid))) || (at && live.find((x) => same(path.resolve(x.path), path.resolve(at))));
  return w ? ((await WS_ROUTES['POST /api/project']({ path: dir, name }, new URLSearchParams(), wsById(w.id))) as { id: string; name: string }) : null;
}, show: gitShow, chatRoot: (a) => {
  const c = drive.callerOf(a);
  return c ? (c.pid && projectDir(c.pid)) || c.root : null;
} });
github.init({ ask: agents.ask, show: gitShow, napIn: agents.napIn, roots: () => [...watched].filter(([, x]) => x.outs.size).map(([top]) => top), chatRoot: (a) => {
  const c = drive.callerOf(a);
  return c ? (c.pid && projectDir(c.pid)) || c.root : null;
} });
setup.init({ archiveAt, moveAcross });
clips.init({ dataDir: path.join(WS_DIR, DOT) });
ue.init({
  dataDir: path.join(WS_DIR, DOT),
  debugger: { start: debug.start, debugging: debug.debugging, sessionOf: debug.sessionOf, ready: debug.engineMissing, prepare: debug.prepare, who: debug.whoOf, allow: debug.allow },
  projects: {
    resolveWorkspace: (a) => {
      const w = resolveWorkspace(a);
      return { id: w.id, name: w.name };
    },
    validateProjectDir: (dir, wid, opts) => validateProjectDir(dir, wid ? wsById(wid) : null, opts),
    registerProject: (dir, opts) => registerProject(dir, { W: wsById(opts.wid), name: opts.name, create: opts.create }),
  },
  findProject: (name: string) => {
    const want = String(name || '').trim();
    if (!want) return null;
    let best: Project | null = null;
    for (const w of wsList()) {
      if (!fs.existsSync(w.path)) continue;
      for (const p of wsRoot(w).meta.projects as Project[]) {
        if (p.name.toLowerCase() === want.toLowerCase() || p.id === want) {
          if (!best || p.path.length > best.path.length) best = p;
        }
      }
    }
    return best ? { id: best.id, name: best.name, path: best.path } : null;
  },
});
terms.init({ dataDir: path.join(WS_DIR, DOT), port: PORT, claudeAccount: agents.claudeAccount, hookPath: path.join(import.meta.dirname, 'hook.js') });

const ACTS = [...CHAT_ACTS, ...AGENT_ACTS, ...PROJECT_ACTS, ...UE_ACTS, ...DEBUG_ACTS, ...GIT_ACTS, ...GH_ACTS];
for (const p of checkActs(ACTS)) console.error(p);
const OPEN = new Set([...ACTS.map((a) => a.route), 'GET /api/acts', 'GET /api/where', 'POST /api/term/hook']);
const ELECTRON = !!process.versions.electron;
const NODE_ENV: Record<string, string> = ELECTRON ? { ELECTRON_RUN_AS_NODE: '1', NODE_NO_WARNINGS: '1' } : { NODE_NO_WARNINGS: '1' };
const CLI = path.join(import.meta.dirname, 'server', 'cli', 'cli.ts');
const OWN_DATA = !flag('workspace') && !process.env.MIND_WORKSPACE;
const SERVER_FILE = path.join(process.env.APPDATA || os.homedir(), process.env.APPDATA ? 'Amethyst' : '.amethyst', DOT, 'server.json');
const toolsNow = () => {
  const t = HOME_ROOT.meta.tools || {};
  return { chats: t.chats !== false, asks: t.asks === true, path: t.path !== false, debug: t.debug !== false };
};
const projectDir = (pid: string) => {
  for (const w of wsList()) {
    const p = fs.existsSync(w.path) ? (wsRoot(w).meta.projects as Project[]).find((x) => x.id === pid) : null;
    if (p && fs.existsSync(p.path)) return rootAt(p.path).ROOT;
  }
  return '';
};
debug.init({
  chatOf: (a) => {
    const c = drive.callerOf(a);
    return c ? { id: c.id, root: (c.pid && projectDir(c.pid)) || c.root } : null;
  },
  control: () => toolsNow().debug,
});
runs.init({ free: (b) => drive.freeToRun((b || {}) as Record<string, unknown>), who: (b) => drive.askerOf((b || {}) as Record<string, unknown>) });
workers.init();
drive.init({
  url: `http://127.0.0.1:${PORT}`,
  cli: { command: process.execPath, script: CLI, env: NODE_ENV, dir: path.join(WS_DIR, DOT, 'bin') },
  settings: toolsNow,
  projectName: (pid) => {
    for (const w of wsList()) {
      const p = fs.existsSync(w.path) ? (wsRoot(w).meta.projects as Project[]).find((x) => x.id === pid) : null;
      if (p) return p.name;
    }
    return 'another project';
  },
  workspaceOf: (pid, cwd) => {
    const all: WsEntry[] = homeListed() ? wsList() : [...wsList(), { id: HOME, name: '', path: WS_DIR, color: null }];
    const w = all.find((x) => fs.existsSync(x.path) && (pid ? (wsRoot(x).meta.projects as Project[]).some((p) => p.id === pid) : same(path.resolve(wsRoot(x).ROOT), path.resolve(cwd || ''))));
    return w?.id || '';
  },
});
let cliNow = '';
const placeCli = (on: boolean) => {
  if (!ELECTRON || !WIN || !OWN_DATA) return Promise.resolve((cliNow = 'only the installed app puts amethyst on the PATH'));
  return (on ? installCli(process.execPath, CLI) : removeCli()).then((r) => (cliNow = r), (e) => (cliNow = `failed: ${e.message}`));
};

function cleanProjects(list: any): Project[] {
  const out: Project[] = [];
  const pin = (p: any) => (Number.isInteger(p?.pin) && p.pin > 0 ? p.pin : Infinity);
  for (const p of [...(Array.isArray(list) ? list : [])].sort((a, b) => pin(a) - pin(b) || 0)) {
    const id = String(p?.id || '');
    if (!ID.test(id) || out.some((o) => o.id === id) || typeof p.path !== 'string' || !path.isAbsolute(p.path)) continue;
    out.push({ id, name: cleanName(p.name) || path.basename(p.path) || 'Project', path: path.resolve(p.path), desc: String(p.desc ?? '').slice(0, 2000), color: HEX.test(p.color) ? p.color : null });
  }
  return out.slice(0, 200);
}

function cleanWorkspaces(list: any): WsEntry[] {
  const out: WsEntry[] = [];
  for (const w of Array.isArray(list) ? list : []) {
    const id = String(w?.id || '');
    if (!ID.test(id) || out.some((o) => o.id === id) || typeof w.path !== 'string' || !path.isAbsolute(w.path)) continue;
    const p = id === HOME ? WS_DIR : path.resolve(w.path);
    if (out.some((o) => same(o.path, p)) || (id !== HOME && same(p, WS_DIR))) continue;
    out.push({ id, name: cleanName(w.name) || path.basename(p) || 'Workspace', path: p, desc: String(w.desc ?? '').slice(0, 2000), color: HEX.test(w.color) ? w.color : null, pin: Number.isInteger(w.pin) && w.pin > 0 ? w.pin : null });
  }
  return out.slice(0, 100);
}

const { within } = live;

{
  const m = HOME_ROOT.meta;
  const fresh = !Array.isArray(m.workspaces);
  m.workspaces = cleanWorkspaces(m.workspaces);
  if (!Array.isArray(m.projects)) m.projects = [];
  const add = FIRST && !m.projects.some((p: Project) => same(path.resolve(p.path), FIRST));
  if (add) m.projects.push({ id: newId(), name: path.basename(FIRST), path: FIRST });
  m.projects = cleanProjects(m.projects);
  const first = typeof m.welcomed !== 'boolean';
  if (first) m.welcomed = !fresh || !!process.env.MIND_WELCOMED;
  if ((fresh || add || first) && !HOME_ROOT.broken) HOME_ROOT.saveMeta();
}
const wsList = (): WsEntry[] => HOME_ROOT.meta.workspaces;

const cleaned = new Set([HOME_ROOT]);
function wsRoot(w: WsEntry) {
  const R = rootAt(w.path);
  if (!cleaned.has(R)) {
    cleaned.add(R);
    R.meta.projects = cleanProjects(R.meta.projects);
  }
  return R;
}
const homeListed = () => wsList().some((w) => w.id === HOME);
function wsById(id: string): Ws {
  const w = wsList().find((x) => x.id === (id || HOME)) || ((id || HOME) === HOME ? { id: HOME, name: 'outside a workspace', path: WS_DIR, color: null } : null);
  if (!w) throw new HttpError(404, 'no such workspace');
  if (w.id !== HOME && !fs.existsSync(w.path)) throw new HttpError(404, `workspace folder not found: ${w.path}`);
  return { ...w, home: w.id === HOME, loose: w.id === HOME && !homeListed(), root: wsRoot(w) };
}

function wsPath(W: Ws, rel: unknown) {
  const abs = path.resolve(W.path, String(rel || ''));
  if (!within(abs, W.path) || path.relative(W.path, abs).split(path.sep)[0] === DOT) throw new HttpError(400, 'outside the workspace');
  return abs;
}

function projectRoot(W: Ws, id: string) {
  if (!id) return W.root;
  const p = W.root.meta.projects.find((x: Project) => x.id === id);
  if (!p) throw new HttpError(404, 'no such project');
  if (!fs.existsSync(p.path)) throw new HttpError(404, `project folder not found: ${p.path}`);
  return rootAt(p.path);
}

function scopeOf(W: Ws, pid: string) {
  const at = (a: Live, dir: string) => same(path.resolve(dir), path.resolve(a.cwd || ''));
  return (a: Live) => {
    if (!a.pid && at(a, W.root.ROOT)) return pid ? null : { pid: '', project: '' };
    const list = W.root.meta.projects;
    const p = list.find((x: Project) => x.id === a.pid) || list.find((x: Project) => at(a, x.path));
    return p && (!pid || p.id === pid) ? { pid: p.id, project: p.name } : null;
  };
}
const widOf = (req: IncomingMessage, url: URL) => String(req.headers['x-mind-workspace'] ?? url.searchParams.get('w') ?? '');
const pidOf = (req: IncomingMessage, url: URL) => String(req.headers['x-mind-project'] ?? url.searchParams.get('p') ?? '');
const amIn = (req: IncomingMessage) => Math.max(1, Math.floor(Number(req.headers['x-mind-am'])) || 1);
const whereIn = (req: IncomingMessage, url: URL) => {
  const W = wsById(widOf(req, url));
  return { W, R: projectRoot(W, pidOf(req, url)) };
};
const scopeIn = (req: IncomingMessage, url: URL) => scopeOf(whereIn(req, url).W, pidOf(req, url));

const GIT_STATE = /^(HEAD|index|packed-refs|refs\/.+)$/;
const GIT_MOVES = new Set(['sync', 'branch', 'pull', 'abort', 'continue', 'take', 'discard', 'stash', 'undo', 'revert', 'pick', 'reset', 'try', 'squash', 'skip'].map((n) => 'POST /api/git/' + n).concat('POST /api/gh/pr/checkout', 'POST /api/gh/pr/tidy', 'POST /api/gh/fork', 'POST /api/gh/issue/start'));
const GIT_SHARED = /^(packed-refs|refs\/.+)$/;
const watched = new Map<string, Watch>();
function watchFiles(R: Root, out: Out) {
  let x = watched.get(R.ROOT);
  if (!x) {
    x = { w: null, gw: null, cw: null, outs: new Set(), timer: 0, paths: new Set(), all: false, git: false };
    const ring = (rel: string | true | null | false) => {
      if (rel === true) x!.git = true;
      else if (rel !== false && (rel === null || x!.paths.add(rel).size > MAX_PATHS)) x!.all = true;
      x!.timer ||= setTimeout(() => {
        const quiet = !x!.all && !x!.git && !x!.paths.size;
        const e = x!.all ? { type: 'files', all: true } : { type: 'files', paths: [...x!.paths], ...(x!.git && { git: true }) };
        Object.assign(x!, { timer: 0, paths: new Set(), all: false, git: false });
        if (!quiet) for (const o of x!.outs) o(e);
        git.touched(R.ROOT, (g) => {
          for (const o of x!.outs) o(g);
        });
      }, 300);
    };
    const gitState = (rel: string, re = GIT_STATE) => re.test(rel) && !rel.endsWith('.lock') && (ring(true), true);
    try {
      x.w = fs.watch(R.ROOT, { recursive: true }, (_, name) => {
        if (!name) return R.tree.changed(null), R.rulesChanged(), R.search.touched(null);
        const rel = name.split(path.sep).join('/');
        if (!rel.includes('/') || !R.hiddenTop(rel)) R.tree.changed(rel);
        if (rel.startsWith('.git/') && gitState(rel.slice(5))) return;
        const meta = same(rel, `${DOT}/meta.json`), rules = same(rel, '.gitignore') || same(rel, `${DOT}/hide.json`);
        if (rules) R.rulesChanged();
        else if (!meta && R.hiddenTop(rel)) return;
        const skip = R.skips(rel).catch(() => true);
        R.search.touched(rel, skip);
        if (ownChange(path.join(R.ROOT, name))) return ring(false);
        if (meta || same(rel, '.gitignore')) return ring(null);
        skip.then((s: boolean) => s || ring(rel));
      });
    } catch {
      return null;
    }
    x.w!.on('error', () => R.tree.stop());
    R.search.start();
    R.tree.start();
    R.rulesChanged();
    const outside = (d: string) => {
      const rel = path.relative(R.ROOT, d);
      return path.isAbsolute(rel) || rel.startsWith('..');
    };
    const watchGit = (d: string, re: RegExp) => {
      try {
        const w = fs.watch(d, { recursive: true }, (_, name) => name && gitState(name.split(path.sep).join('/'), re));
        w.on('error', () => {});
        return w;
      } catch {
        return null;
      }
    };
    git.dirOf(R.ROOT).then((g) => {
      if (!g || watched.get(R.ROOT) !== x) return;
      if (outside(g.dir)) x!.gw = watchGit(g.dir, GIT_STATE);
      if (g.common !== g.dir && outside(g.common)) x!.cw = watchGit(g.common, GIT_SHARED);
    });
    watched.set(R.ROOT, x);
  }
  x.outs.add(out);
  return () => {
    x!.outs.delete(out);
    if (x!.outs.size) return;
    x!.w!.close();
    R.search.stop();
    R.tree.stop();
    x!.gw?.close();
    x!.cw?.close();
    clearTimeout(x!.timer);
    watched.delete(R.ROOT);
  };
}

async function statsOf(p: Project) {
  if (!(await isDir(p.path))) return { missing: true, count: 0, touched: 0 };
  const R = rootAt(p.path);
  let count = 0, touched = 0;
  try {
    for await (const rel of R.walkFiles('')) {
      if (!TEXT_EXT.test(rel) && !BOARD_EXT.test(rel)) continue;
      count++;
      touched = Math.max(touched, (await R.disk.stat(rel))!.mtime, R.meta.files[rel]?.seen || 0);
    }
  } catch {}
  return { count, touched };
}

async function makeFolder(p: string) {
  if ((await exists(p)) && !(await isDir(p))) throw new HttpError(400, 'that is a file, not a folder');
  try {
    await fsp.mkdir(p, { recursive: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EACCES') throw new HttpError(403, `no permission to make a folder at ${p}, pick another place`);
    throw e;
  }
}
const folderArg = (dir: unknown) => {
  if (typeof dir !== 'string' || !path.isAbsolute(dir.trim())) throw new HttpError(400, 'give the full folder path, e.g. D:\\Notes\\Work');
  return path.resolve(dir.trim());
};

type ResolveWsArgs = { workspace?: unknown; by?: unknown; key?: unknown; pid?: string; wid?: string; cwd?: unknown; targetDir?: string };
function resolveWorkspace(a: ResolveWsArgs): Ws {
  const liveWs = wsList().filter((x) => fs.existsSync(x.path));
  const want = String(a.workspace || '').trim();
  if (want) {
    const hit = liveWs.find((w) => w.id === want || w.name.toLowerCase() === want.toLowerCase());
    if (!hit) {
      const names = liveWs.map((w) => w.name).join(', ');
      throw new HttpError(404, names ? `no workspace named "${want}": available workspaces are ${names}` : `no workspace named "${want}": open or make a workspace in Amethyst first`);
    }
    return wsById(hit.id);
  }
  const who = a.by ? drive.knownCaller(a as Record<string, unknown>) : null;
  const pid = who ? who.pid : a.pid || '';
  if (pid) {
    const hit = liveWs.find((w) => (wsRoot(w).meta.projects as Project[]).some((p) => p.id === pid));
    if (hit) return wsById(hit.id);
  }
  if (who?.root) {
    const hit = liveWs.find((w) => within(who.root, w.path));
    if (hit) return wsById(hit.id);
  }
  if (a.wid) {
    const hit = liveWs.find((w) => w.id === a.wid);
    if (hit) return wsById(hit.id);
  }
  if (a.targetDir) {
    const hit = liveWs.filter((w) => within(a.targetDir!, w.path)).sort((x, y) => y.path.length - x.path.length)[0];
    if (hit) return wsById(hit.id);
  }
  if (liveWs.length === 1) return wsById(liveWs[0].id);
  if (liveWs.length > 1) throw new HttpError(400, `which workspace? pass --workspace with one of: ${liveWs.map((w) => w.name).join(', ')}`);
  throw new HttpError(400, 'a project goes in a workspace: open or make one in Amethyst first');
}

const CRED_DIRS = ['.ssh', '.gnupg', '.aws', '.azure', '.kube', '.config', '.claude', '.codex', '.cursor', '.gemini', '.copilot', '.grok'];
async function validateProjectDir(dir: string, W: Ws | null, { nonUser }: { nonUser: boolean }) {
  const raw = typeof dir === 'string' ? dir.trim() : '';
  if (!raw) throw new HttpError(400, 'give a folder path');
  if (live.network(raw)) throw new HttpError(400, 'network paths cannot be added as a project');
  if (!path.isAbsolute(raw)) throw new HttpError(400, 'give the full folder path, e.g. D:\\Notes\\Work');
  const abs = path.resolve(raw);
  if (path.parse(abs).root === abs) throw new HttpError(400, 'a drive or filesystem root cannot be a project');
  const real = await realOf(abs).catch((e) => {
    if (e instanceof HttpError) throw new HttpError(400, 'broken or unreadable symlink in path');
    throw e;
  });
  if (live.network(real)) throw new HttpError(400, 'network paths cannot be added as a project');
  if (path.parse(real).root === real) throw new HttpError(400, 'a drive or filesystem root cannot be a project');
  const ownDirs = await Promise.all([APP_DATA, WS_DIR, ARCHIVE, archiveDir(), WORKTREES, worktreesDir(), CHECKPOINTS].filter(Boolean).map((d) => realOf(path.resolve(d)).catch(() => path.resolve(d))));
  for (const d of ownDirs) {
    if (within(real, d) || within(d, real)) throw new HttpError(400, "that folder overlaps Amethyst's own data folder");
  }
  if (nonUser) {
    const home = await realOf(path.resolve(os.homedir())).catch(() => path.resolve(os.homedir()));
    const tmp = await realOf(path.resolve(os.tmpdir())).catch(() => path.resolve(os.tmpdir()));
    const inTmp = within(real, tmp) && !same(real, tmp);
    if (same(real, home) || within(home, real)) throw new HttpError(400, 'that system or home folder cannot be added as a project');
    for (const c of CRED_DIRS) {
      const cd = await realOf(path.join(home, c)).catch(() => path.join(home, c));
      if (within(real, cd) || within(cd, real)) throw new HttpError(400, 'that credential or agent config folder cannot be added as a project');
    }
    const sysEnv = WIN
      ? [process.env.WINDIR, process.env.SystemRoot, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramData, process.env.APPDATA, process.env.LOCALAPPDATA]
      : ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/dev', '/boot', '/root', '/System', '/Library'];
    for (const s of sysEnv) {
      if (!s) continue;
      const sd = await realOf(path.resolve(s)).catch(() => path.resolve(s));
      if (inTmp && within(tmp, sd)) continue;
      if (within(real, sd) || within(sd, real)) throw new HttpError(400, 'that system or application data folder cannot be added as a project');
    }
  }
  if (W) {
    if (W.loose) throw new HttpError(400, 'a project goes in a workspace: open or make one first');
    const wReal = await realOf(W.path).catch(() => path.resolve(W.path));
    const hidden = path.relative(real, wReal).split(path.sep).some((s) => s.startsWith('.') && s !== '..');
    if (within(wReal, real) && !hidden) throw new HttpError(400, 'that folder holds the workspace');
    if (W.home && within(real, WS_DIR)) throw new HttpError(400, 'that folder overlaps the workspace');
    for (const w of wsList()) {
      const wr = await realOf(w.path).catch(() => path.resolve(w.path));
      if (same(wr, real)) throw new HttpError(400, `that folder is the workspace "${w.name}"`);
    }
    for (const x of W.root.meta.projects as Project[]) {
      const xr = await realOf(x.path).catch(() => path.resolve(x.path));
      if (same(xr, real) || same(x.path, abs)) throw new HttpError(409, `that folder is already registered as the project "${x.name}"`);
      if (within(real, xr) || within(xr, real)) throw new HttpError(409, `that folder overlaps the project "${x.name}"`);
    }
  }
  return real;
}

async function registerProject(dir: string, opts: { W: Ws; name?: unknown; create?: boolean }) {
  const p = path.resolve(dir);
  if (opts.create) await makeFolder(p);
  const proj = { id: newId(), name: cleanName(opts.name) || path.basename(p), path: p, desc: '', color: null };
  opts.W.root.meta.projects.push(proj);
  await opts.W.root.saveMeta();
  return proj;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico)$/i;

async function extFile(p: unknown) {
  if (live.network(p)) throw new HttpError(400, 'network paths are not opened');
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new HttpError(400, 'give the full path');
  const abs = path.normalize(p);
  const st = await fsp.stat(abs).catch((e) => {
    throw e.code === 'ENOENT' ? new HttpError(404, `not on the disk: ${abs}`) : e;
  });
  if (st.isDirectory()) throw new HttpError(400, 'that is a folder, not a file');
  if (!st.isFile()) throw new HttpError(415, 'not a file');
  return { abs, st };
}

async function extText(abs: string, size: number): Promise<{ text?: string; bom?: boolean; crlf?: boolean; why?: string }> {
  if (size > MAX_TEXT) return { why: 'too big to edit here' };
  if (knownBinary(abs)) return { why: 'not a text file' };
  const bytes = await fsp.readFile(abs);
  if (bytes.includes(0)) return { why: 'not a text file' };
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    const bom = text.startsWith('\ufeff'), crlf = (text.match(/\r\n/g) || []).length;
    return { text: bom ? text.slice(1) : text, bom, crlf: crlf > 0 && crlf >= (text.match(/\n/g) || []).length - crlf };
  } catch {
    return { why: 'not saved as UTF-8' };
  }
}

function watchExt(p: unknown, out: Out) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || live.network(p)) return null;
  const abs = path.normalize(p), name = path.basename(abs);
  let timer: any = 0, w: fs.FSWatcher;
  const ring = () => {
    clearTimeout(timer);
    timer = setTimeout(() => fsp.stat(abs).then((s) => s.mtimeMs, () => null).then((mtime) => out({ type: 'ext', mtime })), 300);
  };
  try {
    w = fs.watch(path.dirname(abs), (_, n) => (!n || same(n, name)) && ring());
  } catch {
    return null;
  }
  w.on('error', () => {});
  return () => {
    clearTimeout(timer);
    w.close();
  };
}

const KEYS = path.join(WS_DIR, DOT, 'keys.json');
async function readKeys() {
  await fsp.mkdir(path.dirname(KEYS), { recursive: true });
  try {
    const keys = JSON.parse((await fsp.readFile(KEYS, 'utf8')).replace(/^\ufeff/, ''));
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new Error('not an object');
    return { keys, path: KEYS, exists: true };
  } catch (e) {
    return { keys: {}, path: KEYS, exists: (e as NodeJS.ErrnoException).code !== 'ENOENT', broken: (e as NodeJS.ErrnoException).code !== 'ENOENT' };
  }
}

const APP_ROUTES: Routes = {
  'GET /api/ext/raw': async (_, q) => {
    const { abs } = await extFile(q!.get('path'));
    if (!IMAGE_EXT.test(abs)) throw new HttpError(415, 'not an image');
    return raw(await fsp.readFile(abs), abs, "default-src 'none'", { 'cross-origin-resource-policy': 'same-origin' });
  },
  'GET /api/ext': async (_, q) => {
    const { abs, st } = await extFile(q!.get('path'));
    const r = { path: abs, name: path.basename(abs), size: st.size, mtime: st.mtimeMs };
    if (q!.get('peek')) return r;
    if (IMAGE_EXT.test(abs)) return { ...r, kind: 'image' };
    const { text, why } = await extText(abs, st.size);
    return text == null ? { ...r, kind: 'file', why } : { ...r, kind: 'text', content: text };
  },

  'PUT /api/ext': async ({ path: p, content, mtime }) => {
    const { abs, st } = await extFile(p);
    if (Number.isFinite(mtime) && Math.abs(st.mtimeMs - mtime) >= 2) throw new HttpError(409, 'changed on disk');
    const old = await extText(abs, st.size);
    if (old.text == null) throw new HttpError(415, `it can not be saved from Amethyst: ${old.why}`);
    let text = String(content ?? '');
    if (old.crlf) text = text.replace(/\r?\n/g, '\r\n');
    try {
      await fsp.writeFile(touch(abs), (old.bom ? '\ufeff' : '') + text);
    } catch (e) {
      throw (e as NodeJS.ErrnoException).code === 'EPERM' || (e as NodeJS.ErrnoException).code === 'EACCES' ? new HttpError(403, `no permission to write ${abs}`) : e;
    }
    return { ok: true, mtime: (await fsp.stat(abs)).mtimeMs };
  },

  'GET /api/workspaces': async () => {
    const last = [...wsList()].reverse().find((w) => w.id !== HOME);
    return {
      home: HOME,
      suggest: last ? path.dirname(last.path) : os.homedir(),
      workspaces: await Promise.all(
        wsList().map(async (w) => {
          const missing = !(await isDir(w.path));
          const projects = missing ? [] : wsRoot(w).meta.projects.map((p: Project) => ({ name: p.name, color: p.color }));
          return { ...w, home: w.id === HOME, missing, projects };
        }),
      ),
    };
  },

  'PUT /api/workspaces': async ({ workspaces }) => {
    if (!Array.isArray(workspaces)) throw new HttpError(400, 'workspaces must be a list');
    const old = new Map<string, any>(wsList().map((w) => [w.id, w]));
    HOME_ROOT.meta.workspaces = cleanWorkspaces(workspaces.filter((w: any) => old.has(w?.id)).map((w: any) => ({ ...w, path: old.get(w.id).path })));
    await HOME_ROOT.saveMeta();
    return { ok: true };
  },

  'POST /api/workspace': async ({ name, path: dir }) => {
    const p = folderArg(dir);
    const twin = wsList().find((w) => same(w.path, p));
    if (twin) throw new HttpError(409, `that folder already is the workspace “${twin.name}”`);
    if (within(WS_DIR, p) || within(p, WS_DIR)) throw new HttpError(400, `that folder is Amethyst's own (${WS_DIR}): pick another`);
    const own = HOME_ROOT.meta.projects.find((x: Project) => same(x.path, p));
    if (own) throw new HttpError(409, `that folder is the project “${own.name}”`);
    for (const w of wsList()) {
      if (!(await isDir(w.path))) continue;
      const pj = wsRoot(w).meta.projects.find((x: Project) => same(x.path, p));
      if (pj) throw new HttpError(409, `that folder is the project “${pj.name}”`);
    }
    await makeFolder(p);
    const w: WsEntry = { id: newId(), name: cleanName(name) || path.basename(p) || 'Workspace', path: p, color: null };
    const R = wsRoot(w);
    if (!R.meta.projects.length) {
      for (const d of await fsp.readdir(p, { withFileTypes: true }).catch(() => [])) {
        const sub = path.join(p, d.name);
        if (d.isDirectory() && !d.name.startsWith('.') && !wsList().some((x) => same(x.path, sub)) && (await isDir(path.join(sub, DOT)))) R.meta.projects.push({ id: newId(), name: d.name, path: sub, desc: '', color: null });
      }
      R.meta.projects = cleanProjects(R.meta.projects);
      if (R.meta.projects.length) await R.saveMeta();
    }
    HOME_ROOT.meta.workspaces.push(w);
    await HOME_ROOT.saveMeta();
    return w;
  },

  'GET /api/keys': async () => readKeys(),
  'PUT /api/keys': async ({ keys }) => {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys)) throw new HttpError(400, 'keys: an object');
    if ((await readKeys()).broken) throw new HttpError(409, `${KEYS} doesn't parse: fix it first`);
    await replace(KEYS, JSON.stringify(keys, null, 2) + '\n');
    return {};
  },

  'GET /api/settings': async () => ({ archive: archiveDir(), default: ARCHIVE, browser: HOME_ROOT.meta.browser || '', worktrees: worktreesDir(), worktreesDefault: WORKTREES, tools: toolsNow(), cli: cliNow }),

  'GET /api/acts': async () => ({ acts: ACTS.filter((a) => !a.need || (toolsNow() as Record<string, boolean>)[a.need] !== false) }),

  'GET /api/where': async (_, q) => {
    const name = String(q!.get('project') || '').trim(), raw = String(q!.get('path') || '').trim();
    const dir = raw && path.isAbsolute(raw) ? path.resolve(raw) : null;
    if (!name && !dir) throw new HttpError(400, 'give path (a full folder path) or project (a name)');
    let best: { w: WsEntry; p: Project } | null = null;
    for (const w of wsList()) {
      if (!(await isDir(w.path))) continue;
      for (const p of wsRoot(w).meta.projects as Project[]) {
        const hit = name ? p.name.toLowerCase() === name.toLowerCase() || p.id === name : within(dir!, p.path);
        if (hit && (!best || p.path.length > best.p.path.length)) best = { w, p };
      }
    }
    if (best) return { workspace: best.w.id, project: best.p.id, name: best.p.name, path: best.p.path };
    if (name) throw new HttpError(404, `no project named ${name}`);
    const ws = wsList().filter((w) => within(dir!, w.path)).sort((a, b) => b.path.length - a.path.length)[0];
    if (ws) return { workspace: ws.id, project: '', name: ws.name, path: ws.path };
    throw new HttpError(404, `${dir} is in no Amethyst project: run it in a project's folder, or give --project <name>`);
  },

  'POST /api/project/add': async (body, _, wid, pid) => {
    const b = body || {};
    const rawPath = b.path ? String(b.path).trim() : String(b.cwd || '').trim();
    if (!rawPath) throw new HttpError(400, 'give a folder path');
    if (live.network(rawPath)) throw new HttpError(400, 'network paths cannot be added as a project');
    const abs = path.isAbsolute(rawPath) ? path.resolve(rawPath) : b.cwd ? path.resolve(String(b.cwd), rawPath) : '';
    if (!abs || !path.isAbsolute(abs)) throw new HttpError(400, 'give the full folder path, e.g. D:\\Notes\\Work');
    const W = resolveWorkspace({ workspace: b.workspace, by: b.by, key: b.key, pid: pid || '', wid: String(wid || ''), cwd: b.cwd, targetDir: abs });
    const real = await validateProjectDir(abs, W, { nonUser: !isUser() });
    const st = await fsp.stat(abs).catch(() => null);
    if (st && !st.isDirectory()) throw new HttpError(400, 'that is a file, not a folder');
    if (!st && !b.create) throw new HttpError(404, `folder not found: ${abs} (pass --create to make it)`);
    if (st) await agentfiles.keepOutDir(b, real);
    const secs = b.timeout == null ? 300 : Number(b.timeout) || 0;
    const projName = cleanName(b.name) || path.basename(abs);
    await runs.mayRun(
      b,
      (who) => ({
        title: `Allow adding project ${projName}?`,
        text: `${who} asks to add ${abs} as a project in workspace ${W.name}${!st ? ' (creating the folder)' : ''}.`,
      }),
      secs,
    );
    const realAfter = await validateProjectDir(abs, W, { nonUser: !isUser() });
    if (await isDir(abs)) await agentfiles.keepOutDir(b, realAfter);
    const proj = await registerProject(abs, { W, name: b.name, create: !!b.create });
    return { ...proj, workspace: W.name, workspaceId: W.id, text: `added project ${proj.name} (${proj.path}) to workspace ${W.name}` };
  },

  'PUT /api/settings': async ({ archive, browser, worktrees, tools }) => {
    if (tools != null) {
      if (typeof tools !== 'object') throw new HttpError(400, 'tools: { chats, asks, path, debug }');
      const was = toolsNow(), now = { ...was };
      for (const k of ['chats', 'asks', 'path', 'debug'] as const) if (typeof tools[k] === 'boolean') now[k] = tools[k];
      HOME_ROOT.meta.tools = now;
      await HOME_ROOT.saveMeta();
      if (now.path !== was.path) await placeCli(now.path);
      return { tools: toolsNow(), cli: cliNow };
    }
    if (worktrees != null) {
      const to = String(worktrees).trim() ? folderArg(worktrees) : WORKTREES;
      if (!same(to, WORKTREES))
        for (const w of wsList()) {
          if (within(to, w.path)) throw new HttpError(400, `that folder is inside the workspace “${w.name}”: worktrees go outside every project`);
          if (!(await isDir(w.path))) continue;
          const pj = wsRoot(w).meta.projects.find((p: Project) => within(to, p.path) || within(p.path, to));
          if (pj) throw new HttpError(400, `that folder ${within(to, pj.path) ? 'is inside' : 'holds'} the project “${pj.name}”: worktrees go outside every project`);
        }
      if (same(to, WORKTREES)) delete HOME_ROOT.meta.worktrees;
      else HOME_ROOT.meta.worktrees = to;
      await HOME_ROOT.saveMeta();
      return { worktrees: worktreesDir() };
    }
    if (browser != null) {
      const b = String(browser).trim();
      if (b) HOME_ROOT.meta.browser = b; else delete HOME_ROOT.meta.browser;
      live.setBrowser(() => b || 'msedge');
      await HOME_ROOT.saveMeta();
      return { browser: b };
    }
    if (archiveBusy) throw new HttpError(409, ARCHIVE_BUSY);
    const from = archiveDir();
    const to = archive ? folderArg(archive) : ARCHIVE;
    const stopped = archiveTo();
    if (stopped && !same(to, stopped)) throw new HttpError(409, `moving the archive folder to ${stopped} stopped halfway: pick that folder again to finish it`);
    if (same(to, from)) return { archive: from };
    if (within(to, from) || within(from, to)) throw new HttpError(400, 'that folder overlaps the archive folder');
    if (!same(to, ARCHIVE))
      for (const w of wsList()) {
        if (within(to, w.path)) throw new HttpError(400, `that folder is inside the workspace “${w.name}”`);
        if (!(await isDir(w.path))) continue;
        const pj = wsRoot(w).meta.projects.find((p: Project) => within(to, p.path));
        if (pj) throw new HttpError(400, `that folder is inside the project “${pj.name}”`);
      }
    const names = await fsp.readdir(from).catch(() => []), there = await fsp.readdir(to).catch(() => []);
    const both = there.find((n) => names.some((m) => same(m, n)));
    if (both) throw new HttpError(409, `“${both}” is in both ${from} and ${to}: keep one of them, then try again`);
    if (!there.every((n) => ARCHIVE_SUB.test(n))) throw new HttpError(409, 'pick an empty folder, or a new one');
    await makeFolder(to);
    try {
      await fsp.access(to, fs.constants.W_OK);
    } catch {
      throw new HttpError(403, `no permission to write in ${to}, pick another place`);
    }
    if (archiveBusy) throw new HttpError(409, ARCHIVE_BUSY);
    archiveBusy = true;
    const left: string[] = [];
    try {
      HOME_ROOT.meta.archiveTo = to;
      await HOME_ROOT.saveMeta();
      for (const name of names) {
        const base = /^(.*)\.moving\d*$/.exec(name)?.[1];
        if (base && there.some((n) => same(n, base))) left.push(path.join(from, name));
        else {
          const r = await moveAcross(path.join(from, name), path.join(to, name));
          if (r.left) left.push(r.left);
        }
      }
      if (same(to, ARCHIVE)) delete HOME_ROOT.meta.archive;
      else HOME_ROOT.meta.archive = to as unknown as any[];
      delete HOME_ROOT.meta.archiveTo;
      await HOME_ROOT.saveMeta();
    } finally {
      archiveBusy = false;
    }
    return { archive: to, left: left.join(', ') || undefined };
  },
};

const WS_ROUTES: Routes = {
  'POST /api/ext/move': async ({ path: p, project }, _, W: Ws) => {
    if (!project) throw new HttpError(400, 'which project?');
    const { abs } = await extFile(p);
    const R = projectRoot(W, String(project));
    if (within(abs, R.ROOT)) throw new HttpError(400, 'it is in that project already');
    const { name, ext } = path.parse(abs);
    let to = path.join(R.ROOT, name + ext);
    for (let i = 2; await exists(to); i++) to = path.join(R.ROOT, `${name} (${i})${ext}`);
    const { left } = await moveAcross(abs, to);
    return { path: path.basename(to), left };
  },
  'POST /api/ext/copy': async ({ path: p, project, dir = '' }, _, W: Ws) => {
    if (!project) throw new HttpError(400, 'which project?');
    const { abs } = await extFile(p);
    const R = projectRoot(W, String(project));
    const into = path.resolve(R.ROOT, String(dir)), top = path.relative(R.ROOT, into).split(path.sep)[0];
    if (!within(into, R.ROOT) || top === DOT || top === '.git') throw new HttpError(400, 'outside the project');
    await realInside(R.ROOT, into);
    if (!(await fsp.stat(into).catch(() => null))?.isDirectory()) throw new HttpError(404, 'no such folder');
    const { name, ext } = path.parse(abs);
    let to = path.join(into, name + ext);
    for (let i = 2; await exists(to); i++) to = path.join(into, `${name} (${i})${ext}`);
    await fsp.copyFile(abs, touch(to), fs.constants.COPYFILE_EXCL);
    return { path: path.relative(R.ROOT, to).split(path.sep).join('/') };
  },

  'POST /api/paste': async ({ items = [], abs = [], project, dir = '' }, _, W: Ws) => {
    if (!project) throw new HttpError(400, 'which project?');
    const R = projectRoot(W, String(project));
    const into = path.resolve(R.ROOT, String(dir)), top = path.relative(R.ROOT, into).split(path.sep)[0];
    if (!within(into, R.ROOT) || top === DOT || top === '.git') throw new HttpError(400, 'outside the project');
    await realInside(R.ROOT, into);
    if (!(await fsp.stat(into).catch(() => null))?.isDirectory()) throw new HttpError(404, 'no such folder');
    const sources: string[] = [];
    for (const it of items) {
      const root = projectRoot(W, String(it.project)).ROOT, src = path.resolve(root, String(it.path));
      const first = path.relative(root, src).split(path.sep)[0];
      if (!it.path || !within(src, root) || first === DOT || first === '.git') throw new HttpError(400, 'outside the project');
      sources.push(src);
    }
    for (const p of abs) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) throw new HttpError(400, 'give the full path');
      if (live.network(p)) throw new HttpError(400, 'network paths are not copied');
      sources.push(path.normalize(p));
    }
    const made: string[] = [];
    for (const src of sources) {
      if (!(await fsp.stat(src).catch(() => null))) throw new HttpError(404, `not on the disk: ${src}`);
      if (within(into, src)) throw new HttpError(400, `can't copy “${path.basename(src)}” into itself`);
      const { name, ext } = path.parse(src);
      let to = path.join(into, name + ext);
      for (let i = 2; await exists(to); i++) to = path.join(into, `${name} (${i})${ext}`);
      await fsp.cp(src, touch(to), { recursive: true, errorOnExist: true, force: false });
      made.push(path.relative(R.ROOT, to).split(path.sep).join('/'));
    }
    return { paths: made };
  },

  'GET /api/workspace': async (_, __, W: Ws) => ({
    id: W.id,
    name: W.name,
    home: W.home,
    loose: W.loose,
    dir: W.path,
    suggest: !W.home ? W.path : W.root.meta.projects[0]?.path || FIRST ? path.dirname(W.root.meta.projects[0]?.path || FIRST) : os.homedir(),
    projects: await Promise.all(W.root.meta.projects.map(async (p: Project) => ({ ...p, ...(await statsOf(p)) }))),
    desc: W.desc || '',
  }),

  'PUT /api/workspace': async ({ desc }, _, W: Ws) => {
    const w = wsList().find((x) => x.id === W.id);
    if (!w) throw new HttpError(400, 'outside a workspace there is no workspace note');
    w.desc = String(desc ?? '').slice(0, 2000);
    await HOME_ROOT.saveMeta();
    return { ok: true };
  },

  'GET /api/wsdir': async (_, q, W: Ws) => {
    const abs = wsPath(W, q!.get('path') || '');
    const list = await fsp.readdir(abs, { withFileTypes: true }).catch((e) => {
      throw e.code === 'ENOENT' ? new HttpError(404, 'that folder is not there') : e;
    });
    const entries = list.filter((d) => d.name !== DOT && (d.isDirectory() || d.isFile())).map((d) => ({ name: d.name, dir: d.isDirectory() }));
    entries.sort((a: any, b: any) => b.dir - a.dir || a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return { dir: abs, entries };
  },

  'POST /api/wsfile': async ({ dir = '', name, folder, content = '' }, _, W: Ws) => {
    const base = String(name ?? '').trim();
    if (!base || /[\\/:*?"<>|]/.test(base) || /^\.+$/.test(base) || base === DOT) throw new HttpError(400, 'not a file name');
    const at = wsPath(W, dir);
    const ext = folder ? '' : path.extname(base), stem = base.slice(0, base.length - ext.length);
    let to = path.join(at, base);
    for (let i = 2; await exists(to); i++) to = path.join(at, `${stem} (${i})${ext}`);
    if (folder) await fsp.mkdir(to);
    else await fsp.writeFile(touch(to), String(content).slice(0, 1e6), { flag: 'wx' });
    return { path: to, rel: path.relative(W.path, to) };
  },

  'PUT /api/projects': async ({ projects }, _, W: Ws) => {
    if (!Array.isArray(projects)) throw new HttpError(400, 'projects must be a list');
    const old = new Map<string, any>(W.root.meta.projects.map((p: Project) => [p.id, p]));
    W.root.meta.projects = cleanProjects(projects.filter((p: any) => old.has(p?.id)).map((p: any) => ({ ...p, path: old.get(p.id).path })));
    await W.root.saveMeta();
    return { ok: true };
  },

  'POST /api/project': async ({ name, path: dir }, _, W: Ws) => {
    if (W.loose) throw new HttpError(400, 'a project goes in a workspace: open or make one first');
    if (live.network(dir)) throw new HttpError(400, 'network paths cannot be added as a project');
    const p = folderArg(dir);
    const hidden = path.relative(p, W.path).split(path.sep).some((s) => s.startsWith('.') && s !== '..');
    if (within(W.path, p) && !hidden) throw new HttpError(400, 'that folder holds the workspace');
    if (W.home && within(p, WS_DIR)) throw new HttpError(400, 'that folder overlaps the workspace');
    const ws = wsList().find((w) => same(w.path, p));
    if (ws) throw new HttpError(400, `that folder is the workspace “${ws.name}”`);
    const dup = W.root.meta.projects.find((x: Project) => same(x.path, p));
    if (dup) throw new HttpError(409, `that folder is already registered as the project “${dup.name}”`);
    const clash = W.root.meta.projects.find((x: Project) => !same(x.path, p) && (within(p, x.path) || within(x.path, p)));
    if (clash) throw new HttpError(409, `that folder overlaps the project “${clash.name}”`);
    await makeFolder(p);
    const proj = { id: newId(), name: cleanName(name) || path.basename(p), path: p, desc: '', color: null };
    W.root.meta.projects.push(proj);
    await W.root.saveMeta();
    return proj;
  },
};

welcome.init({
  welcomed: () => HOME_ROOT.meta.welcomed !== false,
  setWelcomed: async (on) => {
    HOME_ROOT.meta.welcomed = on;
    await HOME_ROOT.saveMeta();
  },
  known: async () => {
    const out: string[] = [];
    for (const w of wsList()) {
      if (w.id !== HOME) out.push(w.path);
      if (await isDir(w.path)) out.push(...wsRoot(w).meta.projects.map((p: Project) => p.path));
    }
    return out;
  },
  skip: () => [WORKTREES, worktreesDir(), WS_DIR, APP_DATA, CHECKPOINTS, archiveDir()],
  addProject: async (dir, wid) => {
    await WS_ROUTES['POST /api/project']({ path: dir }, new URLSearchParams(), wsById(wid || HOME));
  },
});


function send(res: ServerResponse, status: number, obj: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req: IncomingMessage) {
  return new Promise<any>((resolve, reject) => {
    let data = '', big = false;
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      if (big) return;
      data += c;
      if (data.length <= 20e6) return;
      big = true;
      data = '';
      reject(new HttpError(413, 'too big: at most 20 MB'));
    });
    req.on('end', () => {
      if (big) return;
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new HttpError(400, 'bad json'));
      }
    });
    req.on('error', reject);
  });
}

const APP_TABLES = [APP_ROUTES, clips.ROUTES, welcome.ROUTES, runs.ROUTES];
const PART_TABLES = [agents.ROUTES, drive.ROUTES, workers.ROUTES, terms.ROUTES, live.ROUTES, git.ROUTES, github.ROUTES, setup.ROUTES, ue.ROUTES, debug.ROUTES, voice.ROUTES, usage.ROUTES];
const routeIn = (tables: Routes[], key: string): RouteHandler | undefined => tables.find((t) => t[key])?.[key];
if (args.includes('--routes')) {
  const routes = [...new Set([...[...APP_TABLES, WS_ROUTES, ...PART_TABLES, HOME_ROOT.ROUTES as Routes].flatMap((t) => Object.keys(t)), 'GET /api/stream', 'POST /api/stream'])];
  console.log(JSON.stringify({ routes, open: [...OPEN] }));
  process.exit(0);
}

const serve = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) throw new HttpError(403, 'forbidden host');
    const url = new URL(req.url!, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return await serveStatic(url.pathname, req, res);
    const key = `${req.method} ${url.pathname}`;
    const user = gate.allow(req.headers, OPEN.has(key));
    if (key !== 'GET /api/stream' && key !== 'POST /api/chats/wait') inFlight(key, res);
    if (req.method === 'GET' && url.pathname === '/api/stream') return live.stream(url.searchParams.get('c'), req, res);
    let handler = routeIn(APP_TABLES, key), extra: any = null, root = HOME_ROOT, pid = '';
    if (key === 'POST /api/stream') handler = (b) => live.follow(b, { chat: agents.follow, term: terms.follow, scope: () => scopeIn(req, url), files: (out: Out) => watchFiles(whereIn(req, url).R, out), path: watchExt, ue: (out: Out) => ue.follow(whereIn(req, url).R.ROOT, out), ueask: (out: Out) => ue.followAsks(out), runask: (out: Out) => runs.follow(out), debug: (out: Out) => debug.follow(whereIn(req, url).R.ROOT, out) });
    if (handler && key === 'POST /api/project/add') {
      extra = widOf(req, url);
      pid = pidOf(req, url);
    }
    if (!handler) {
      const W = wsById(widOf(req, url));
      pid = pidOf(req, url);
      const R = WS_ROUTES[key] ? W.root : projectRoot(W, pid);
      root = R;
      const agentRoute = routeIn(PART_TABLES, key);
      handler = WS_ROUTES[key] || agentRoute || R.ROUTES[key];
      extra = WS_ROUTES[key] ? W : (agentRoute as RouteHandler | undefined) && (R !== W.root || !((git.ROUTES[key] || github.ROUTES[key]) as RouteHandler | undefined)) ? R.ROOT : null;
    }
    if (!handler) throw new HttpError(404, 'no such endpoint');
    let body: unknown = {};
    if (req.method !== 'GET') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'json only');
      body = await readBody(req);
    }
    await root.fresh();
    let out;
    const hungUp = new AbortController();
    res.once('close', () => res.writableFinished || hungUp.abort());
    try {
      const run = handler;
      out = await asUser(user, () => runs.during(hungUp.signal, () => run(body, url.searchParams, extra, pid, root, amIn(req), hungUp.signal)));
    } finally {
      if (GIT_MOVES.has(key)) root.tree.changed(null);
    }
    if (out instanceof Raw) return void (res.writeHead(200, out.head), res.end(out.body));
    send(res, 200, out);
  } catch (e) {
    const status = (e as HttpError).status || ((e as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : (e as NodeJS.ErrnoException).code === 'EEXIST' ? 409 : 500);
    if (status === 500) console.error(e);
    const { detail, fix } = e as HttpError;
    const bug = status === 500 && [TypeError, ReferenceError, RangeError, SyntaxError].some((B) => e instanceof B) ? [...String((e as Error).stack).matchAll(/([\w.-]+\.[mc]?[jt]s):(\d+):\d+/g)].slice(0, 4).map((m) => `${m[1]}:${m[2]}`).join(' < ') || 'no stack' : '';
    send(res, status, { error: (e as Error).message, ...(detail && { detail }), ...(fix && { fix }), ...(bug && { bug }) });
  }
};
const server = http.createServer(serve), server6 = http.createServer(serve);

const URL_ = `http://localhost:${PORT}`;

const NO_V6 = new Set(['EADDRNOTAVAIL', 'EAFNOSUPPORT']);
const inUse = (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is in use: Amethyst is already running at ${URL_}, or another program has the port`);
    setTimeout(() => process.exit(0), 300);
  } else throw e;
};
server.on('error', inUse);

process.on('exit', () => {
  try {
    if (OWN_DATA && JSON.parse(fs.readFileSync(SERVER_FILE, 'utf8')).pid === process.pid) fs.rmSync(SERVER_FILE, { force: true });
  } catch {}
  ue.stopAll();
  const pids = [...agents.stopAll(), ...terms.stopAll()];
  if (WIN && pids.length)
    try {
      execSync('taskkill /T /F ' + pids.map((p) => '/pid ' + p).join(' '), { stdio: 'ignore', windowsHide: true });
    } catch {}
});
process.on('uncaughtException', (e) => console.error(e));
process.on('unhandledRejection', (e) => console.error(e));
let leaving = false;
const quit = () => {
  if (leaving) return;
  leaving = true;
  Promise.allSettled([debug.detachAll(2000), Promise.race([agents.leave(), new Promise((ok) => setTimeout(ok, 2000))])]).finally(() => process.exit(0));
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, quit);
let listening = false;
const tellUp = () => listening && gate.ready() && process.parentPort?.postMessage({ up: true });
process.parentPort?.on('message', (e) => {
  if (e.data === 'quit') quit();
  else if (gate.arm(e.data?.user)) tellUp();
});

startHitch();

live.setBrowser(() => HOME_ROOT.meta.browser || 'msedge');
const both = () => new Promise<void>((done) => {
  server6.once('error', (e: NodeJS.ErrnoException) => {
    if (NO_V6.has(e.code || '')) return done();
    server.close();
    inUse(e.code === 'EADDRINUSE' ? e : Object.assign(e, { code: 'EADDRINUSE' }));
  });
  if (process.env.MIND_FAKE_NO_V6) return server6.emit('error', Object.assign(new Error('no IPv6 loopback (a test)'), { code: 'EADDRNOTAVAIL' }));
  server6.listen(PORT, '::1', () => done());
});
server.listen(PORT, '127.0.0.1', () => void both().then(() => {
  console.log(`Amethyst     ${URL_}/app\nhome         ${WS_DIR}\nprojects     ${HOME_ROOT.meta.projects.map((p: Project) => p.path).join(', ')}\nworkspaces   ${wsList().filter((w) => w.id !== HOME).map((w) => w.path).join(', ') || '(none)'}`);
  listening = true;
  tellUp();
  setTimeout(agents.warmUp, 2000).unref();
  setTimeout(agents.slimOld, Number(process.env.MIND_SLIM_AFTER) || 10e3).unref();
  if (OWN_DATA) {
    try {
      fs.mkdirSync(path.dirname(SERVER_FILE), { recursive: true });
      replace(SERVER_FILE, JSON.stringify({ port: PORT, pid: process.pid, url: `http://127.0.0.1:${PORT}` }) + '\n').catch(() => {});
    } catch {}
  }
  if (toolsNow().path) placeCli(true);
}));
