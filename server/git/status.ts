import fs from 'fs';
import path from 'path';
import { WIN } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';
import { git, must, why, placeOf, forgetPlace, guardsAt } from '../base/gitcli.ts';
import type { Place } from '../base/gitcli.ts';
import { ghSeen, ghState } from '../base/ghcli.ts';
import { forgetWorktrees } from '../base/worktrees.ts';

type Who = { id: string; title: string; working: boolean; files: string[] };
type Hands = {
  napIn: (dir: string) => Promise<unknown>;
  touchedIn: (dir: string) => Promise<Who[]>;
  ask: (text: string, o: { system?: string; agent?: unknown; model?: unknown; clean?: (said: string) => string }) => Promise<string>;
  bin: (abs: string, label: string) => Promise<string>;
  unbin: (from: string, to: string) => Promise<unknown>;
  addProject: (dir: string, name: string | undefined, from: { by?: unknown; key?: unknown; pid?: string; cwd?: unknown }) => Promise<{ id: string; name: string } | null>;
  show: (dir: string, ev: Record<string, unknown>) => boolean;
  chatRoot: (a: { by?: unknown; key?: unknown }) => string | null;
};
const hands: Hands = {
  napIn: async () => {},
  touchedIn: async () => [],
  ask: async () => {
    throw new HttpError(503, 'The chats are not ready yet.');
  },
  bin: async () => {
    throw new HttpError(503, 'The archive is not ready yet.');
  },
  unbin: async () => {
    throw new HttpError(503, 'The archive is not ready yet.');
  },
  addProject: async () => {
    throw new HttpError(503, 'The projects are not ready yet.');
  },
  show: () => false,
  chatRoot: () => null,
};

const MAX_FILES = 3000, MAX_EOL = 500, SMALL_DIR = 3;

const z = (s: string) => s.split('\0').filter(Boolean);
async function untrackedIn(cwd: string, dirs: string[]) {
  if (!dirs.length) return [];
  const r = await git(cwd, ['ls-files', '-o', '--exclude-standard', '-z', '--', ...dirs.map((d) => ':(literal)' + d)], { timeout: 30e3 });
  return r.code ? [] : z(r.out);
}
const fileRow = (rel: string) => ({ path: rel, x: 'A', fresh: true, ...(secret(rel) ? { secret: true } : {}) });

let lfsHere: boolean | null = null;
const lfsInstalled = async () => (lfsHere ??= !(await git(process.cwd(), ['lfs', 'version'], { timeout: 15e3 })).code);
const locks = new Map<string, { at: number; ours: Map<string, string>; theirs: Map<string, string> }>();
async function lfsOf(top: string) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(top, '.gitattributes'), 'utf8');
  } catch {}
  if (!/filter=lfs/.test(text)) return { lfs: null, lockable: false };
  return { lfs: (await lfsInstalled()) ? 'on' : 'missing', lockable: /\blockable\b/.test(text) };
}
async function locksOf(top: string, fresh = false) {
  const k = locks.get(top);
  if (k && !fresh && Date.now() - k.at < 60e3) return k;
  const r = await git(top, ['lfs', 'locks', '--verify', '--json'], { timeout: 20e3, quiet: true });
  const out = { at: Date.now(), ours: new Map<string, string>(), theirs: new Map<string, string>() };
  try {
    const j = JSON.parse(r.out || '{}');
    for (const l of j.ours || []) out.ours.set(l.path, l.owner?.name || 'you');
    for (const l of j.theirs || []) out.theirs.set(l.path, l.owner?.name || 'someone');
  } catch {}
  locks.set(top, out);
  return out;
}
const forgetLocks = (top: string) => locks.delete(top);
const FETCH_EVERY = 3 * 60e3;

function relArg(cwd: string, p: unknown) {
  const s = String(p ?? '').replace(/\\/g, '/');
  const r = path.relative(cwd, path.resolve(cwd, s));
  if (!s || path.isAbsolute(s) || !r || r.startsWith('..') || path.isAbsolute(r)) throw new HttpError(400, 'that file is not in the project');
  return s;
}
const leaveOut = (cwd: string, skip: unknown) => (Array.isArray(skip) ? skip.slice(0, MAX_FILES) : []).map((p) => ':(exclude,literal)' + relArg(cwd, p));
const inRepo = (root: string | null): string => {
  if (!root) throw new HttpError(400, 'Source control works inside a project.');
  return root;
};

const SECRET = /^(\.env(\.[\w-]+)*|.+\.(pem|key|p12|pfx)|id_(rsa|dsa|ecdsa|ed25519)|\.?credentials\.json)$/i;
const NOT_SECRET = /^\.env\.(example|sample|template|defaults)$/i;
const secret = (p: string) => {
  const n = p.split('/').pop()!;
  return (SECRET.test(n) && !NOT_SECRET.test(n)) || p.endsWith('.amethyst/agents.json');
};

function remoteOf(name: string, url: string) {
  const clean = url.replace(/^(https?:\/\/)[^/@]*@/i, '$1');
  const m = /^https?:\/\/([^/]+)\/(.+?)(\.git)?\/?$/i.exec(clean) || /^(?:ssh:\/\/)?[\w.-]+@([^:/]+)[:/](.+?)(\.git)?\/?$/i.exec(clean);
  const web = m ? `https://${m[1].replace(/:\d+$/, '')}/${m[2]}` : null;
  return { name, url: clean, web, label: web ? web.replace(/^https:\/\//, '') : clean, github: !!m && /(^|\.)github\.com$/i.test(m[1]) };
}
async function remotes(cwd: string) {
  const r = await git(cwd, ['config', '--get-regexp', '^remote\\..*\\.url$']);
  return r.out
    .split(/\r?\n/)
    .map((l) => /^remote\.(.+)\.url (.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => remoteOf(m![1], m![2]));
}

const fetched = new Map<string, number>(), fetchErrors = new Map<string, string>();
const fetchSaid = (place: Place, error: string) => (error ? fetchErrors.set(place.top, error) : fetchErrors.delete(place.top));
function fetchNow(place: Place, cwd: string) {
  const last = fetched.get(place.top) || 0;
  if (Date.now() - last < FETCH_EVERY) return;
  fetched.set(place.top, Date.now());
  guardsAt(cwd).then((g) => {
    if (g.fetchKeys.length) return fetchSaid(place, `Not checked on its own: this repository's git config names its own program (${g.fetchKeys.join(', ')}). Fetch checks it.`);
    return git(cwd, ['fetch', '--quiet'], { timeout: 60e3, quiet: true }).then((r) => fetchSaid(place, r.code ? why(r) : ''));
  });
}
const stashCount = (place: Place) => {
  try {
    return fs.readFileSync(path.join(place.common, 'logs', 'refs', 'stash'), 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
};
const fetchedAt = (place: Place) => {
  try {
    return Math.round(fs.statSync(path.join(place.dir, 'FETCH_HEAD')).mtimeMs);
  } catch {
    return null;
  }
};

const KEEP = 60e3, TOUCH_EVERY = 2000;
const running = new Map<string, Promise<any>>();
const known = new Map<string, { st: any; at: number }>(), gens = new Map<string, number>(), asked = new Set<string>();
const genOf = (cwd: string) => gens.get(cwd) || 0;
const drop = (cwd: string) => {
  known.delete(cwd);
  gens.set(cwd, genOf(cwd) + 1);
};
const low = (p: string) => (WIN ? p.toLowerCase() : p);
function dropBelow(cwd: string) {
  const under = low(cwd + path.sep);
  for (const k of [...known.keys()]) if (k !== cwd && low(k).startsWith(under)) drop(k);
}
function read(cwd: string, fetch = false) {
  let p = running.get(cwd);
  if (!p) {
    const g = genOf(cwd);
    p = readStatus(cwd, fetch)
      .then((st) => {
        if (genOf(cwd) === g && st.repo) known.set(cwd, { st, at: Date.now() });
        return st;
      })
      .finally(() => running.get(cwd) === p && running.delete(cwd));
    running.set(cwd, p);
  }
  return p;
}
async function status(cwd: string, { fetch = false } = {}) {
  asked.add(cwd);
  const k = known.get(cwd);
  if (!k || Date.now() - k.at >= KEEP) return read(cwd, fetch);
  k.st.gh = ghSeen();
  ghState();
  if (fetch && k.st.remote && k.st.upstream) placeOf(cwd).then((place) => place && fetchNow(place, cwd), () => {});
  return k.st;
}
async function repoStatus(cwd: string) {
  asked.add(cwd);
  const st = await read(cwd);
  if (!st.repo) throw new HttpError(409, 'This project is not in git yet.');
  return st;
}
const touches = new Map<string, { timer: ReturnType<typeof setTimeout> | 0; last: number; sig?: string; send: (e: { type: 'git'; n: number; branch: string | null }) => void }>();
function touched(cwd: string, send: (e: { type: 'git'; n: number; branch: string | null }) => void) {
  dropBelow(cwd);
  if (!asked.has(cwd)) return;
  drop(cwd);
  let t = touches.get(cwd);
  if (!t) touches.set(cwd, (t = { timer: 0, last: 0, send }));
  t.send = send;
  if (t.timer) return;
  const x = t;
  x.timer = setTimeout(async () => {
    x.last = Date.now();
    try {
      await running.get(cwd)?.catch(() => {});
      const st = await read(cwd);
      x.timer = 0;
      const n = st.repo ? st.total : 0, branch = st.repo ? st.branch : null, sig = `${n} ${branch}`;
      if (sig === x.sig) return;
      x.sig = sig;
      x.send({ type: 'git', n, branch });
    } catch {
      x.timer = 0;
    }
  }, Math.max(0, x.last + TOUCH_EVERY - Date.now()));
}
function forget(cwd: string) {
  running.delete(cwd);
  drop(cwd);
  forgetWorktrees(cwd);
}
const done = <T>(cwd: string, out: T) => {
  forget(cwd);
  return out;
};

const num = (file: string) => {
  try {
    return parseInt(fs.readFileSync(file, 'utf8'), 10) || 0;
  } catch {
    return 0;
  }
};
function stateOf(place: Place) {
  const at = (n: string) => path.join(place.dir, n);
  if (fs.existsSync(at('rebase-merge'))) return { state: 'rebase', step: num(at('rebase-merge/msgnum')), steps: num(at('rebase-merge/end')) };
  if (fs.existsSync(at('rebase-apply'))) return { state: 'rebase', step: num(at('rebase-apply/next')), steps: num(at('rebase-apply/last')) };
  if (fs.existsSync(at('MERGE_HEAD'))) return { state: 'merge' };
  if (fs.existsSync(at('CHERRY_PICK_HEAD'))) return { state: 'pick' };
  if (fs.existsSync(at('REVERT_HEAD'))) return { state: 'revert' };
  return { state: '' };
}

async function readStatus(cwd: string, fetch: boolean): Promise<any> {
  const place = await placeOf(cwd);
  if (!place) return { available: true, git: true, repo: false };
  const r = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '-unormal', '--', '.'], { timeout: 30e3, env: { GIT_OPTIONAL_LOCKS: '0' } });
  if (r.code && /not a git repository/i.test(r.err)) {
    forgetPlace(cwd);
    return { available: true, git: true, repo: false };
  }
  must(r);
  const st: any = { available: true, git: true, repo: true, name: path.basename(place.top), inner: !!place.prefix, branch: null, detached: false, commits: true, upstream: null, ahead: 0, behind: 0, files: [], more: 0, staged: 0 };
  const own = (p: string) => (p.startsWith(place.prefix) ? p.slice(place.prefix.length) : p);
  const parts = r.out.split('\0'), folded: string[] = [], modes = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    const l = parts[i];
    if (!l) continue;
    if (l.startsWith('# ')) {
      const [, k, ...v] = l.split(' ');
      if (k === 'branch.oid') st.commits = v[0] !== '(initial)';
      if (k === 'branch.head') v[0] === '(detached)' ? (st.detached = true) : (st.branch = v.join(' '));
      if (k === 'branch.upstream') st.upstream = v.join(' ');
      if (k === 'branch.ab') [st.ahead, st.behind] = v.map((n) => Math.abs(parseInt(n, 10)) || 0);
      continue;
    }
    const f = l.split(' ');
    let letter: string, p: string, from: string | null = null;
    if (l[0] === '1') [letter, p] = [f[1].includes('D') ? 'D' : f[1].includes('A') ? 'A' : 'M', f.slice(8).join(' ')];
    else if (l[0] === '2') [letter, p, from] = ['R', f.slice(9).join(' '), parts[++i]];
    else if (l[0] === 'u') [letter, p] = ['C', f.slice(10).join(' ')];
    else if (l[0] === '?') [letter, p] = ['A', l.slice(2)];
    else continue;
    if (l[0] === '?' && p.endsWith('/')) {
      folded.push(own(p));
      continue;
    }
    const tracked = l[0] === '1' || l[0] === '2', inIndex = tracked && f[1][0] !== '.';
    if (tracked && f[3] !== f[5]) modes.add(own(p));
    if (inIndex) st.staged++;
    if (st.files.length >= MAX_FILES) {
      st.more++;
      continue;
    }
    const rel = own(p!);
    st.files.push({
      path: rel,
      x: letter,
      ...(from ? { from: own(from) } : {}),
      ...(secret(rel) ? { secret: true } : {}),
      ...(inIndex ? { staged: f[1][1] === '.' ? true : 'part' } : {}),
      ...(l[0] === '?' || (tracked && /^0+$/.test(f[3])) ? { fresh: true } : {}),
      ...(l[0] !== '?' && f[2][0] === 'S' ? { sub: true } : {}),
    });
  }
  const inside = await untrackedIn(cwd, folded);
  for (const d of folded) {
    const kids = inside.filter((p) => p.startsWith(d));
    if (!kids.length) continue;
    if (kids.length <= SMALL_DIR) {
      for (const k of kids) st.files.length < MAX_FILES ? st.files.push(fileRow(k)) : st.more++;
      continue;
    }
    const secrets = kids.filter(secret);
    if (st.files.length < MAX_FILES) st.files.push({ path: d, x: 'A', fresh: true, dir: true, n: kids.length, ...(secrets.length ? { secrets: secrets.slice(0, 50) } : {}) });
    else st.more += kids.length;
  }
  st.total = st.files.reduce((n: number, f: any) => n + (f.n || 1), 0) + st.more;
  const changed = st.files.filter((f: any) => f.x === 'M' && !f.sub && !modes.has(f.path));
  if (st.commits && changed.length && changed.length <= MAX_EOL) {
    const d = await git(cwd, ['diff', 'HEAD', '--numstat', '-z', '--relative', '--ignore-cr-at-eol', '--', '.'], { timeout: 30e3 });
    const real = new Set<string>(z(d.out).map((row) => row.split('\t')[2]).filter(Boolean));
    if (!d.code) for (const f of changed) if (!real.has(f.path)) f.eol = true;
  }
  const lfs = await lfsOf(place.top);
  if (lfs.lfs) st.lfs = lfs.lfs;
  if (lfs.lfs === 'on' && lfs.lockable) {
    const k = await locksOf(place.top);
    for (const f of st.files) {
      const at = place.prefix + f.path;
      if (k.theirs.has(at)) f.lock = k.theirs.get(at);
      else if (k.ours.has(at)) f.mine = true;
    }
    st.locks = true;
  }
  if (st.commits) {
    const [hash, parents, subject] = (await git(cwd, ['log', '-1', '--format=%h%x00%p%x00%s'])).out.replace(/\r?\n$/, '').split('\0');
    st.head = { hash: hash || '', parents: (parents || '').split(' ').filter(Boolean).length, subject: subject || '' };
  }
  if (st.detached) st.branch = st.head?.hash || 'detached';
  if (st.detached) {
    const back = (await git(cwd, ['rev-parse', '--abbrev-ref', '-q', '@{-1}'])).out.trim();
    if (back && back !== 'HEAD' && !/^[0-9a-f]{7,40}$/.test(back)) st.back = back;
  }
  const all = await remotes(cwd);
  st.remote = all.find((x) => x.name === (st.upstream || '').split('/')[0]) || all.find((x) => x.name === 'origin') || all[0] || null;
  st.remotes = all;
  if (st.remote && !st.upstream && st.commits) st.ahead = parseInt((await git(cwd, ['rev-list', '--count', 'HEAD', '--not', '--remotes'])).out, 10) || 0;
  Object.assign(st, stateOf(place));
  if (!st.state && st.files.some((f: any) => f.x === 'C')) st.state = 'unstash';
  if (st.state) st.staged = 0;
  st.pushed = !!st.remote && st.commits && !st.ahead;
  st.canUndo = !st.state && !st.detached && !st.pushed && (st.head?.parents || 0) > 0;
  if (st.upstream && st.ahead && st.behind) {
    const mode = (await git(cwd, ['config', '--get', 'pull.rebase'])).out.trim().toLowerCase();
    st.pullMode = !mode ? null : mode === 'false' ? 'merge' : 'rebase';
  }
  st.stashes = stashCount(place);
  st.fetchedAt = fetchedAt(place);
  st.fetchError = fetchErrors.get(place.top) || '';
  st.gh = ghSeen();
  ghState();
  if (fetch && st.remote && st.upstream) fetchNow(place, cwd);
  return st;
}

const mineIsTheirs = (state: string) => state === 'rebase' || state === 'unstash';
const said = <T extends object>(line: string, more?: T) => ({ ok: true, line, text: line, ...(more as T) });
const but = <T extends object>(error: string, more?: T) => ({ ok: true, error, text: error, ...(more as T) });

const dirOf = (cwd: string) => placeOf(cwd).then((p) => (p ? { dir: p.dir, common: p.common } : null), () => null);

export { hands, said, but, stateOf, mineIsTheirs, lfsOf, untrackedIn, fileRow, forgetLocks, MAX_FILES, relArg, leaveOut, inRepo, remoteOf, remotes, fetchSaid, status, repoStatus, touched, forget, done, dirOf };
