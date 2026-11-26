import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { WIN } from './util.ts';
import { HttpError } from './routes.ts';
import { git, why, must, placeOf } from './gitcli.ts';
import { nameFor, chatSlug } from './branchnames.ts';

export interface Worktree {
  path: string;
  branch?: string;
  locked?: boolean;
  prunable?: boolean;
  exists?: boolean;
  ahead?: number;
  changes?: number;
  inMain?: boolean;
  tip?: string;
  base?: string;
}

export type StartFrom = { from?: string; carry?: boolean };

let worktreesHome = () => path.join(os.tmpdir(), 'amethyst-worktrees');
const setHome = (fn: () => string) => (worktreesHome = fn);
const samePath = (a: string, b: string) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);
const tagOf = (top: string) => crypto.createHash('sha1').update(WIN ? top.toLowerCase() : top).digest('hex').slice(0, 4);
const countLines = (s: string) => s.split(/\r?\n/).filter(Boolean).length;

const wtRunning = new Map<string, Promise<Worktrees>>();
const forgetWorktrees = (cwd?: string) => (cwd === undefined ? wtRunning.clear() : wtRunning.delete(cwd));

type Worktrees = Awaited<ReturnType<typeof readWorktrees>>;
function worktreesOf(root: string, { fresh = false } = {}): Promise<Worktrees> {
  const was = wtRunning.get(root);
  if (!fresh && was) return was;
  const p: Promise<Worktrees> = readWorktrees(root).finally(() => wtRunning.get(root) === p && wtRunning.delete(root));
  wtRunning.set(root, p);
  return p;
}
async function readWorktrees(root: string) {
  const place = await placeOf(root);
  if (!place) return null;
  const r = must(await git(root, ['worktree', 'list', '--porcelain']));
  const all = r.split(/\r?\n\r?\n/).map((block) => {
    const w: Worktree = {} as Worktree;
    for (const l of block.split(/\r?\n/)) {
      const [k, ...v] = l.split(' ');
      if (k === 'worktree') w.path = path.resolve(v.join(' '));
      else if (k === 'branch') w.branch = v.join(' ').replace(/^refs\/heads\//, '');
      else if (k === 'locked') w.locked = true;
      else if (k === 'prunable') w.prunable = true;
    }
    return w;
  }).filter((w) => w.path);
  const main = all[0], base = main?.branch || null;
  const list = all.slice(1, 31);
  const bases = new Map((await git(root, ['config', '--get-regexp', '^branch\\..*\\.amethystbase$'])).out.split(/\r?\n/).filter(Boolean).map((l) => {
    const i = l.lastIndexOf(' ');
    return [l.slice(7, i).replace(/\.amethystbase$/i, ''), l.slice(i + 1)] as [string, string];
  }));
  const [changed] = await Promise.all([
    main?.path ? git(main.path, ['status', '--porcelain', '-uall'], { env: { GIT_OPTIONAL_LOCKS: '0' } }).then((r) => countLines(r.out)) : 0,
    ...list.map(async (w) => {
    const from = (w.branch && bases.get(w.branch)) || base;
    if (from !== base) w.base = from || undefined;
    w.exists = !w.prunable && fs.existsSync(w.path);
    w.ahead = from && w.branch ? parseInt((await git(root, ['rev-list', '--count', `${from}..${w.branch}`])).out, 10) || 0 : 0;
    w.changes = w.exists ? countLines((await git(w.path, ['status', '--porcelain', '-uall'], { env: { GIT_OPTIONAL_LOCKS: '0' } })).out) : 0;
    w.inMain = !!from && !!w.branch && !w.ahead && !w.changes;
    w.tip = w.branch ? (await git(root, ['rev-parse', '-q', '--verify', `refs/heads/${w.branch}`])).out.trim() : '';
  })]);
  return { base, main: main?.path || place.top, list, changed };
}

async function copyIncluded(top: string, dir: string) {
  const list = path.join(top, '.worktreeinclude');
  if (!fs.existsSync(list)) return [];
  const named = (await git(top, ['ls-files', '-o', '-i', '-z', `--exclude-from=${list}`], { timeout: 60e3 })).out.split('\0').filter(Boolean);
  if (!named.length) return [];
  const ignored = await new Promise<string[]>((resolve) => {
    const p = execFile('git', ['check-ignore', '-z', '--stdin'], { cwd: top, windowsHide: true, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (_e, out) => resolve(String(out || '').split('\0').filter(Boolean)));
    p.stdin!.end(named.join('\0'));
  });
  const copied: string[] = [];
  for (const rel of ignored.slice(0, 2000)) {
    try {
      const from = path.join(top, rel), to = path.join(dir, rel);
      if (!fs.lstatSync(from).isFile()) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied.push(rel);
    } catch {}
  }
  return copied;
}

async function snapshot(top: string) {
  const index = path.join(os.tmpdir(), `amethyst-carry-${crypto.randomBytes(6).toString('hex')}`);
  try {
    const env = { GIT_INDEX_FILE: index };
    must(await git(top, ['read-tree', 'HEAD'], { env }));
    must(await git(top, ['add', '-A', '--', '.'], { env, timeout: 120e3 }));
    return must(await git(top, ['write-tree'], { env })).trim();
  } finally {
    fs.rmSync(index, { force: true });
  }
}

async function carryInto(top: string, dir: string, from: string) {
  const tree = await snapshot(top);
  const n = countLines((await git(top, ['diff', '--name-only', from, tree])).out);
  if (!n) return 0;
  const r = await git(dir, ['read-tree', '-m', '-u', 'HEAD', tree], { timeout: 120e3 });
  if (r.code) throw new HttpError(409, `Couldn't copy your changes into the worktree: ${why(r)}`);
  must(await git(dir, ['reset', '-q']));
  return n;
}

async function makeWorktree(root: string, id: string, start: StartFrom = {}) {
  const place = await placeOf(root);
  if (!place) throw new HttpError(409, 'Worktrees need git: start git here in Source Control first.');
  const head = (await git(root, ['rev-parse', '-q', '--verify', 'HEAD'])).out.trim();
  if (!head) throw new HttpError(409, 'Worktrees need a first commit: commit once in Source Control first.');
  const own = (await git(root, ['symbolic-ref', '-q', '--short', 'HEAD'])).out.trim();
  const pick = typeof start.from === 'string' && start.from && start.from !== own ? start.from : '';
  if (!own && !pick) throw new HttpError(409, "The project's folder isn't on a branch: switch to one in Source Control first.");
  let from = head, base = own;
  if (pick) {
    const ref = /^[\w./-]{1,200}$/.test(pick) && !pick.includes('..') ? (await git(root, ['rev-parse', '-q', '--verify', `refs/heads/${pick}^{commit}`])).out.trim() || (await git(root, ['rev-parse', '-q', '--verify', `refs/remotes/${pick}^{commit}`])).out.trim() : '';
    if (!ref) throw new HttpError(409, `The branch ${pick} isn't there any more: pick another one on the strip above the message box.`);
    from = ref;
    base = pick;
  }
  const carry = !pick && !!start.carry;
  await git(root, ['worktree', 'prune']);
  const home = path.join(worktreesHome(), `${path.basename(place.top)}-${tagOf(place.top)}`);
  try {
    fs.mkdirSync(home, { recursive: true });
  } catch (e) {
    throw new HttpError(403, `Can't make the worktrees' folder ${home} (${(e as NodeJS.ErrnoException).code}): settings → agents → worktree folder can put them elsewhere.`);
  }
  const safe = chatSlug(id), want = await nameFor('chat', root, { chat: id });
  let dir = path.join(home, safe), branch = want;
  for (let n = 2; fs.existsSync(dir) || !(await git(root, ['rev-parse', '-q', '--verify', `refs/heads/${branch}`])).code; n++) {
    dir = path.join(home, `${safe}-${n}`);
    branch = `${want}-${n}`;
  }
  const r = await git(place.top, ['worktree', 'add', '-b', branch, dir, from], { timeout: 120e3 });
  if (r.code) throw new HttpError(r.missing ? 424 : 409, `Couldn't make the worktree: ${why(r)}`);
  if (pick) await git(root, ['config', `branch.${branch}.amethystBase`, pick]);
  let carried = 0;
  if (carry) {
    try {
      carried = await carryInto(place.top, dir, from);
    } catch (e) {
      await removeWorktree(root, dir).catch(() => {});
      await git(root, ['branch', '-D', branch]);
      throw e;
    }
  }
  const copied = await copyIncluded(place.top, dir).catch(() => [] as string[]);
  const left = carry ? 0 : countLines((await git(place.top, ['status', '--porcelain', '-uall'], { env: { GIT_OPTIONAL_LOCKS: '0' } })).out);
  forgetWorktrees();
  return { path: dir, cwd: path.join(dir, place.prefix), branch, base, from, copied, left, ...(carried ? { carried } : {}) };
}

async function branchWorktree(root: string, branch: string) {
  const place = await placeOf(root);
  if (!place) throw new HttpError(409, 'This project is not in git yet.');
  await git(root, ['worktree', 'prune']);
  const home = path.join(worktreesHome(), `${path.basename(place.top)}-${tagOf(place.top)}`);
  fs.mkdirSync(home, { recursive: true });
  const safe = branch.replace(/^[^/]+\/(?=.)/, (m) => (/^(origin|upstream)\//.test(m) ? '' : m)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'branch';
  let dir = path.join(home, safe);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(home, `${safe}-${n}`);
  const r = await git(place.top, ['worktree', 'add', dir, branch], { timeout: 120e3 });
  if (r.code) throw new HttpError(r.missing ? 424 : 409, /already (checked out|used by worktree)/i.test(r.err) ? `${branch} is open in another checkout already: a branch can be in one at a time.` : `Couldn't make the worktree: ${why(r)}`);
  await copyIncluded(place.top, dir).catch(() => [] as string[]);
  forgetWorktrees();
  return { path: dir, cwd: path.join(dir, place.prefix) };
}

function unlink(dir: string) {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    const p = path.join(dir, n);
    let st;
    try {
      st = fs.lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      try {
        fs.unlinkSync(p);
      } catch {
        try {
          fs.rmdirSync(p);
        } catch {}
      }
    } else if (st.isDirectory()) unlink(p);
  }
}
function retryGone(dir: string, n = 10) {
  setTimeout(() => {
    try {
      unlink(dir);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
    if (fs.existsSync(dir) && n > 1) retryGone(dir, n - 1);
  }, 60e3).unref?.();
}

async function removeWorktree(root: string, dir: unknown, before: (w: Worktree) => Promise<unknown> = async () => {}) {
  const wts = await worktreesOf(root, { fresh: true });
  if (!wts) throw new HttpError(409, 'This project is not in git.');
  const w = wts.list.find((x) => samePath(x.path, path.resolve(String(dir || ''))));
  if (!w) throw new HttpError(404, 'That worktree is not in this repository (any more).');
  if (w.locked) throw new HttpError(409, 'That worktree is locked by another tool: unlock it (git worktree unlock) first.');
  if (w.changes) throw new HttpError(409, `${w.changes} uncommitted file${w.changes === 1 ? '' : 's'} in it would be lost: commit them, or ask the agent to.`);
  await before(w);
  let held: string[] = [];
  if (w.exists) {
    unlink(w.path);
    const r = await git(wts.main, ['worktree', 'remove', w.path], { timeout: 120e3 });
    if (r.code) {
      if (!fs.existsSync(w.path)) held = [];
      else {
        held = fs.readdirSync(w.path).slice(0, 5);
        if (!held.length) held = [path.basename(w.path)];
        retryGone(w.path);
      }
      await git(wts.main, ['worktree', 'prune']);
      const still = (await worktreesOf(root, { fresh: true }))!.list.some((x) => samePath(x.path, w.path));
      forgetWorktrees();
      if (still) throw new HttpError(409, why(r));
    }
  } else await git(wts.main, ['worktree', 'prune']);
  const kept = w.branch && (await git(wts.main, ['branch', '-d', w.branch])).code ? w.branch : null;
  forgetWorktrees();
  return { ok: true, kept, held, path: w.path };
}

export { worktreesOf, makeWorktree, branchWorktree, removeWorktree, setHome, forgetWorktrees };
export type { Worktrees };
