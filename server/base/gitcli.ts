import { execFile, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import path from 'path';
import { WIN } from './util.ts';
import { HttpError } from './routes.ts';
import { NONE, cachedGuards, withFlags } from './gitconfig.ts';
import type { Guards } from './gitconfig.ts';

export interface Place {
  top: string;
  prefix: string;
  dir: string;
  common: string;
}
type RunOpts = { timeout?: number; quiet?: boolean; env?: Record<string, string>; input?: string };
type LongOpts = { what: string; idle?: number; quiet?: boolean; env?: Record<string, string>; key?: string };

type Ran = { out: string; err: string; code: number; missing: boolean; timedOut: boolean; stopped?: boolean; guarded?: string[] };
const envOf = (quiet: boolean, env: Record<string, string>, g: Guards = NONE) => {
  const e: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', ...g.env, ...env };
  if (quiet) e.GCM_INTERACTIVE = 'never';
  if (g.pairs.length) {
    let n = parseInt(e.GIT_CONFIG_COUNT || '', 10) || 0;
    for (const [k, v] of g.pairs) {
      e[`GIT_CONFIG_KEY_${n}`] = k;
      e[`GIT_CONFIG_VALUE_${n++}`] = v;
    }
    e.GIT_CONFIG_COUNT = String(n);
  }
  return e;
};
function run(cmd: string, args: string[], cwd: string, { timeout = 30e3, quiet = false, env = {}, input }: RunOpts = {}, g: Guards = NONE) {
  return new Promise<Ran>((resolve) => {
    const p = execFile(cmd, args, { cwd, env: envOf(quiet, env, g), windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, out, stderr) =>
      resolve({ out: String(out ?? ''), err: String(stderr ?? ''), code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, missing: err?.code === 'ENOENT', timedOut: !!err?.killed, guarded: g.keys.length ? g.keys : undefined }),
    );
    p.stdin?.end(input);
  });
}
const QUOTE = ['-c', 'core.quotepath=false'];
const rawGit = (cwd: string, args: string[]) => run('git', [...QUOTE, ...args], cwd);
const notRepo = new Map<string, number>();
async function guardsAt(cwd: string, env?: Record<string, string>): Promise<Guards> {
  if (env?.GIT_DIR || (notRepo.get(cwd) || 0) > Date.now()) return NONE;
  try {
    const place = await placeOf(cwd);
    if (!place) {
      notRepo.set(cwd, Date.now() + 5e3);
      return NONE;
    }
    return await cachedGuards(place, async () => {
      const r = await rawGit(cwd, ['config', '--list', '--show-scope', '--show-origin', '-z']);
      return r.code ? null : r.out;
    });
  } catch {
    return NONE;
  }
}
async function git(cwd: string, args: string[], o?: RunOpts) {
  const g = await guardsAt(cwd, o?.env);
  return run('git', [...QUOTE, ...withFlags(g, args)], cwd, o, g);
}

const MAX_KEPT = 4 * 1024 * 1024;
const longs = new Map<string, { p: ChildProcess; what: string; line: string; stopped: boolean }>();
const keyOf = (cwd: string) => (WIN ? path.resolve(cwd).toLowerCase() : path.resolve(cwd));
function killTree(p: ChildProcess) {
  if (!p.pid) return;
  if (WIN) execFile('taskkill', ['/T', '/F', '/pid', String(p.pid)], { windowsHide: true }, () => {});
  else
    try {
      process.kill(-p.pid, 'SIGTERM');
    } catch {
      p.kill();
    }
}
function runLong(cmd: string, args: string[], cwd: string, { what, idle = 120e3, quiet = false, env = {}, key: at }: LongOpts, g: Guards = NONE) {
  const key = keyOf(at || cwd), busy = longs.get(key);
  if (busy) throw new HttpError(409, `Git is busy here (${busy.what}): wait for it, or stop it.`);
  return new Promise<Ran>((resolve) => {
    const p = spawn(cmd, args, { cwd, env: envOf(quiet, env, g), windowsHide: true, detached: !WIN, stdio: ['ignore', 'pipe', 'pipe'] });
    const job = { p, what, line: '', stopped: false };
    longs.set(key, job);
    let out = '', err = '', timedOut = false, missing = false, timer: ReturnType<typeof setTimeout>;
    const wake = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        killTree(p);
      }, idle);
    };
    const take = (chunk: string, to: 'out' | 'err') => {
      if (to === 'out') out = (out + chunk).slice(-MAX_KEPT);
      else err = (err + chunk).slice(-MAX_KEPT);
      const last = chunk.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean).pop();
      if (last) job.line = last.slice(0, 200);
      wake();
    };
    p.stdout!.setEncoding('utf8').on('data', (c: string) => take(c, 'out'));
    p.stderr!.setEncoding('utf8').on('data', (c: string) => take(c, 'err'));
    const end = (code: number) => {
      clearTimeout(timer);
      if (longs.get(key) === job) longs.delete(key);
      resolve({ out, err, code, missing, timedOut, stopped: job.stopped, guarded: g.keys.length ? g.keys : undefined });
    };
    p.on('error', (e: NodeJS.ErrnoException) => {
      missing = e.code === 'ENOENT';
      end(-1);
    });
    p.on('close', (code) => end(code ?? -1));
    wake();
  });
}
async function gitLong(cwd: string, args: string[], o: LongOpts) {
  const g = await guardsAt(cwd, o.env);
  return runLong('git', [...QUOTE, ...withFlags(g, args)], cwd, o, g);
}
function doingIn(cwd: string) {
  const job = longs.get(keyOf(cwd));
  return job ? { what: job.what, line: job.line } : null;
}
function stopIn(cwd: string) {
  const job = longs.get(keyOf(cwd));
  if (!job) return false;
  job.stopped = true;
  killTree(job.p);
  return true;
}

type Reason = { line: string; fix?: string };
function reason(r: Ran, what = 'git'): Reason {
  const base = reasonOf(r, what);
  if (!r.guarded?.length || r.stopped || r.missing || base.fix === 'identity' || /would be lost|A conflict/.test(base.line)) return base;
  const keys = r.guarded.slice(0, 3).join(', ');
  return { ...base, line: `${base.line}${/[.!?:]$/.test(base.line) ? '' : '.'} This repository's own git config sets ${keys}, which Amethyst doesn't run. Run it once from a terminal if you trust it.` };
}
function reasonOf(r: Ran, what: string): Reason {
  const all = r.err + '\n' + r.out;
  if (r.missing) return { line: `${what} isn't installed on this PC${what === 'gh' ? ': cli.github.com' : ': git-scm.com'}` };
  if (r.stopped) return { line: 'Stopped.' };
  if (r.timedOut) return { line: `${what} went quiet for too long (was it waiting for a sign-in?)` };
  if (/Please tell me who you are|unable to auto-detect email|empty ident name/i.test(all)) return { line: 'Git needs your name and email first: they go into every commit you make.', fix: 'identity' };
  if (/dubious ownership/i.test(all)) return { line: 'Git does not trust this folder (another user owns it). In a terminal: git config --global --add safe.directory <the folder>' };
  if (/GH006|protected branch/i.test(all)) return { line: 'This branch is protected on the remote: it takes pull requests only. Move your commits to a new branch and push that.', fix: 'branch' };
  const big = /File (\S+) is ([\d.]+ ?MB); this exceeds/i.exec(all);
  if (big || /GH001|exceeds GitHub's file size limit/i.test(all)) return { line: `${big ? `${big[1]} is ${big[2]}` : 'A file in these commits is too big'}: GitHub takes files up to 100 MB. Undo the commit, then leave the file out (or track it with Git LFS).`, fix: 'undo' };
  if (/gpg failed to sign|signing failed|failed to sign the data|Load key .* (incorrect passphrase|invalid format)|No secret key|cannot run gpg/i.test(all)) return { line: 'Git could not sign the commit: the signing key is locked or missing. Unlock it (commit once from a terminal), then try again.' };
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(all)) return { line: 'The remote has commits this PC does not have yet: pull first.', fix: 'pull' };
  if (/Not possible to fast-forward|diverg/i.test(all)) return { line: 'This branch and the remote both have new commits: pull with a rebase or a merge.', fix: 'choose' };
  const denied = /Permission to (\S+?)(?:\.git)? denied to (\S+?)\./.exec(all);
  if (denied) return { line: `${denied[2]} can't push to ${denied[1]}: fork it to push to your own copy, then open a pull request from there.`, fix: 'fork' };
  if (/Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey\)|Invalid username or password|HTTP 401|returned error: 403/i.test(all)) return { line: 'The remote did not accept the sign-in. Sign in to GitHub (or push once from a terminal), then try again.', fix: 'login' };
  if (/Repository not found|does not appear to be a git repository/i.test(all)) return { line: 'That repository was not found (or this account cannot see it).' };
  if (/pre-receive hook declined|hook declined|pre-push hook/i.test(all)) return { line: 'A push hook refused these commits: see the details.' };
  if (/failed to push some refs/i.test(all) && !/\[(remote )?rejected\]|! \[/.test(all)) return { line: 'The pre-push hook on this PC refused the push: see the details.' };
  if (/would be overwritten/i.test(all)) return { line: 'Your changes to some files would be lost: commit or stash them first.' };
  if (/CONFLICT/.test(all)) return { line: 'A conflict: fix the files marked C, then go on.' };
  const lines = r.err.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(hint|warning):/i.test(l));
  const line = lines.find((l) => /^(fatal|error):/i.test(l)) || lines.at(-1) || r.out.trim().split(/\r?\n/).at(-1) || `${what} failed`;
  return { line: line.replace(/^(fatal|error):\s*/i, '') };
}
const why = (r: Ran, what?: string) => reason(r, what).line;
const MAX_DETAIL = 4000;
function detailOf(r: Ran) {
  const all = [r.err, r.out].map((t) => t.replace(/\r(?!\n)/g, '\n').trim()).filter(Boolean).join('\n');
  return all.split('\n').filter((l) => l.trim()).length > 1 ? all.slice(-MAX_DETAIL) : '';
}
const must = (r: Ran, what?: string) => {
  if (r.code) {
    const { line, fix } = reason(r, what);
    throw new HttpError(r.missing ? 424 : 409, line, { detail: detailOf(r), fix });
  }
  return r.out;
};

const places = new Map<string, Place>();
async function placeOf(cwd: string): Promise<Place | null> {
  if (places.has(cwd)) return places.get(cwd)!;
  const r = await rawGit(cwd, ['rev-parse', '--show-toplevel', '--show-prefix', '--absolute-git-dir', '--git-common-dir']);
  if (r.code) {
    if (r.missing) throw new HttpError(424, why(r));
    if (/not a git repository/i.test(r.err)) return null;
    throw new HttpError(409, why(r));
  }
  const [top, prefix, dir, common] = r.out.split(/\r?\n/);
  const p = { top: path.resolve(top), prefix: prefix || '', dir: path.resolve(dir), common: path.resolve(cwd, common || dir) };
  places.set(cwd, p);
  return p;
}

const forgetPlace = (cwd: string) => places.delete(cwd);

export { run, git, guardsAt, runLong, gitLong, doingIn, stopIn, why, reason, must, placeOf, forgetPlace };
export type { Ran, RunOpts };
