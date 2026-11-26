import fs from 'fs';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must, why, reason, placeOf, doingIn, stopIn } from '../base/gitcli.ts';
import type { Ran } from '../base/gitcli.ts';
import { inRepo, said, but, status, repoStatus, forget, fetchSaid, relArg, mineIsTheirs } from './status.ts';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sha = async (cwd: string, ref: string) => (await git(cwd, ['rev-parse', '--verify', '-q', ref])).out.trim();
const count = async (cwd: string, range: string) => parseInt((await git(cwd, ['rev-list', '--count', range])).out, 10) || 0;
const splitUpstream = (st: any) => {
  const at = String(st.upstream).indexOf('/');
  return { remote: st.upstream.slice(0, at), branch: st.upstream.slice(at + 1) };
};

async function rewrote(cwd: string, st: any) {
  if (!st.upstream || st.detached) return '';
  const tip = await sha(cwd, `refs/remotes/${st.upstream}`);
  if (!tip) return '';
  if (!(await git(cwd, ['merge-base', '--is-ancestor', tip, 'HEAD'])).code) return '';
  const was = (await git(cwd, ['reflog', 'show', '--format=%H', st.branch])).out.split(/\r?\n/);
  return was.includes(tip) ? tip : '';
}

async function push(cwd: string, st: any, { lease = false } = {}) {
  if (!st.remote) throw new HttpError(409, 'This project has no remote yet: put it on GitHub first.');
  if (st.detached) throw new HttpError(409, 'Not on a branch: switch to one first.');
  if (lease) {
    const tip = await rewrote(cwd, st);
    if (!tip) throw new HttpError(409, 'The remote has commits that were never on this PC: pull first.', { fix: 'pull' });
    const { remote, branch } = splitUpstream(st);
    return void must(await gitLong(cwd, ['push', '--progress', `--force-with-lease=${branch}:${tip}`, remote, `HEAD:refs/heads/${branch}`], { what: 'pushing' }));
  }
  const r = await gitLong(cwd, st.upstream ? ['push', '--progress'] : ['push', '--progress', '-u', st.remote.name, 'HEAD'], { what: 'pushing' });
  if (r.code && reason(r).fix === 'pull' && (await rewrote(cwd, st))) throw new HttpError(409, 'The remote still has the old version of commits you changed here (an amend or a rebase).', { fix: 'lease' });
  must(r);
}

async function submodules(cwd: string) {
  const place = await placeOf(cwd);
  if (!place || !fs.existsSync(path.join(place.top, '.gitmodules'))) return '';
  const r = await gitLong(place.top, ['submodule', 'update', '--init', '--recursive', '--progress'], { what: 'updating the submodules' });
  return r.code ? ` · the submodules did not update: ${why(r)}` : '';
}

async function fetchAll(cwd: string) {
  const place = await placeOf(cwd);
  const r = await gitLong(cwd, ['fetch', '--all', '--prune', '--progress'], { what: 'checking the remote' });
  if (place && !r.stopped) fetchSaid(place, r.code ? why(r) : '');
  return r;
}

const WORD: Record<string, string> = { rebase: 'rebase', merge: 'merge', pick: 'cherry-pick', revert: 'revert' };
function stopLine(st: any) {
  if (st.state === 'unstash') return 'Your uncommitted changes clash with what came in: fix the files marked C, then continue. They are also kept in the stash list.';
  const how = st.state === 'merge' ? 'commit' : 'continue';
  return `The ${WORD[st.state]} stopped at a conflict${st.state === 'rebase' && st.steps ? ` (step ${st.step} of ${st.steps})` : ''}: fix the files marked C, then ${how}.`;
}
async function stoppedOr(cwd: string, r: Ran) {
  forget(cwd);
  const now = await status(cwd);
  if (now.state) return now;
  if (r.code) must(r);
  return null;
}

async function pull(cwd: string, how?: unknown) {
  const st = await repoStatus(cwd);
  if (!st.remote) throw new HttpError(409, 'This project has no remote yet: put it on GitHub first.');
  if (st.detached) throw new HttpError(409, 'Not on a branch: switch to one first.');
  if (!st.upstream) throw new HttpError(409, 'This branch is not on the remote yet: publish it first.');
  if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
  forget(cwd);
  must(await fetchAll(cwd));
  const was = await sha(cwd, 'HEAD'), up = '@{upstream}';
  const behind = was ? await count(cwd, `HEAD..${up}`) : 1, ahead = was ? await count(cwd, `${up}..HEAD`) : 0;
  if (!behind) return { pulled: 0, stopped: '', more: '', from: was, to: was };
  let mode = 'ff';
  if (ahead) {
    const set = (await git(cwd, ['config', '--get', 'pull.rebase'])).out.trim().toLowerCase();
    mode = how === 'rebase' || how === 'merge' ? how : !set ? '' : set === 'false' ? 'merge' : 'rebase';
    if (!mode) throw new HttpError(409, 'This branch and the remote both have new commits: pull with a rebase or a merge.', { fix: 'choose' });
  }
  const args = mode === 'ff' ? ['merge', '--ff-only', '--autostash', up] : mode === 'rebase' ? ['rebase', '--autostash', up] : ['merge', '--no-edit', '--autostash', up];
  const r = await gitLong(cwd, args, { what: mode === 'rebase' ? 'rebasing' : 'merging', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
  const stuck = await stoppedOr(cwd, r), to = await sha(cwd, 'HEAD');
  if (stuck) return { pulled: behind, stopped: stopLine(stuck), more: '', from: was, to };
  return { pulled: behind, stopped: '', more: await submodules(cwd), from: was, to };
}

const markers = (cwd: string, st: any) => {
  for (const f of st.files.filter((x: any) => x.x === 'C')) {
    let body = '';
    try {
      body = fs.readFileSync(path.join(cwd, f.path), 'utf8');
    } catch {}
    if (/^(<{7}|>{7})( |$)/m.test(body)) throw new HttpError(409, `${f.path} still has conflict markers (<<<<<<<): fix it first.`);
  }
};

const ROUTES: Routes = {
  'GET /api/git/doing': async (_b, q, root: string | null) => {
    const at = q?.get('at');
    return (at && path.isAbsolute(at) ? doingIn(at) : root && doingIn(root)) || {};
  },
  'POST /api/git/cancel': async (_b, _q, root: string | null) => (stopIn(inRepo(root)) ? said('stopping…') : said('nothing is running')),
  'POST /api/git/fetch': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (!st.remote) throw new HttpError(409, 'This project has no remote yet: put it on GitHub first.');
    forget(cwd);
    try {
      must(await fetchAll(cwd));
      const now = await status(cwd);
      return said(now.behind || now.ahead ? [now.behind ? `${plural(now.behind, 'commit')} to pull` : '', now.ahead ? `${now.ahead} to push` : ''].filter(Boolean).join(' · ') : 'up to date');
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/pull': async ({ how }, _q, root: string | null) => {
    const cwd = inRepo(root);
    try {
      const r = await pull(cwd, how);
      if (r.stopped) return but(r.stopped, { pulled: r.pulled, from: r.from, to: r.to });
      return said((r.pulled ? `pulled ${r.pulled}` : 'nothing to pull') + r.more, { pulled: r.pulled, from: r.from, to: r.to });
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/push': async ({ lease }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    forget(cwd);
    try {
      await push(cwd, st, { lease: !!lease });
      return said(lease ? 'pushed over the old version' : st.upstream ? `pushed ${st.ahead}` : 'published');
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/sync': async ({ how }, _q, root: string | null) => {
    const cwd = inRepo(root);
    let st = await repoStatus(cwd);
    if (!st.remote) throw new HttpError(409, 'This project has no remote yet: put it on GitHub first.');
    let pulled = 0, more = '';
    try {
      if (st.upstream && st.commits) {
        const r = await pull(cwd, how);
        if (r.stopped) return but(r.stopped, { pulled: r.pulled });
        ({ pulled, more } = r);
        forget(cwd);
        st = await status(cwd);
      }
      const pushed = st.ahead;
      if (pushed || !st.upstream) await push(cwd, st);
      return said([pulled ? `pulled ${pulled}` : '', pushed ? `pushed ${pushed}` : '', !pulled && !pushed ? 'up to date' : ''].filter(Boolean).join(' · ') + more, { pulled });
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/abort': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (!st.state) throw new HttpError(409, 'Nothing is under way to abort.');
    forget(cwd);
    try {
      if (st.state === 'unstash') {
        const clash = st.files.filter((f: any) => f.x === 'C').map((f: any) => f.path);
        must(await git(cwd, ['checkout', 'HEAD', '--', ...clash], { timeout: 120e3 }));
        return said(`${plural(clash.length, 'file')} back as ${clash.length === 1 ? 'it' : 'they'} came in · your changes are still in the stash list`);
      }
      must(await git(cwd, [st.state === 'pick' ? 'cherry-pick' : st.state, '--abort'], { timeout: 120e3 }));
      return said(`the ${WORD[st.state]} is undone`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/continue': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (!st.state) throw new HttpError(409, 'Nothing is under way to continue.');
    markers(cwd, st);
    forget(cwd);
    try {
      if (st.state === 'unstash') {
        const clash = st.files.filter((f: any) => f.x === 'C').map((f: any) => f.path);
        must(await git(cwd, ['add', '--', ...clash]));
        must(await git(cwd, ['reset', '-q', '--', ...clash]));
        return said('your changes are back on top of what came in · the copy in the stash list can go');
      }
      must(await git(cwd, ['add', '-A', '--', '.']));
      const cmd = st.state === 'merge' ? ['commit', '-q', '--no-edit'] : [st.state === 'pick' ? 'cherry-pick' : st.state, '--continue'];
      const r = await gitLong(cwd, cmd, { what: 'going on', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
      const stuck = await stoppedOr(cwd, r);
      if (stuck) return but(stopLine(stuck));
      return said(st.state === 'merge' ? 'the merge is committed' : `the ${WORD[st.state]} is done`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/skip': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state !== 'rebase' && st.state !== 'pick' && st.state !== 'revert') throw new HttpError(409, 'Only a rebase, a cherry-pick or a revert can skip a commit.');
    forget(cwd);
    try {
      const r = await gitLong(cwd, [st.state === 'pick' ? 'cherry-pick' : st.state, '--skip'], { what: 'skipping', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
      const stuck = await stoppedOr(cwd, r);
      if (stuck) return but(stopLine(stuck));
      return said(`skipped that commit · the ${WORD[st.state]} is done`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/take': async ({ path: p, side }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), rel = relArg(cwd, p);
    if (side !== 'mine' && side !== 'theirs') throw new HttpError(400, 'Take mine or theirs.');
    if (!st.files.some((f: any) => f.path === rel && f.x === 'C')) throw new HttpError(409, `${rel} is not in conflict.`);
    const ours = (side === 'mine') !== mineIsTheirs(st.state);
    forget(cwd);
    try {
      const r = await git(cwd, ['checkout', ours ? '--ours' : '--theirs', '--', rel]);
      if (r.code && /does not have (our|their) version/i.test(r.err)) {
        must(await git(cwd, ['rm', '-q', '--', rel]));
        return said(`${rel}: ${side === 'mine' ? 'your' : 'their'} side deleted it, so it is gone`);
      }
      must(r);
      must(await git(cwd, ['add', '--', rel]));
      if (st.state === 'unstash') must(await git(cwd, ['reset', '-q', '--', rel]));
      return said(`${rel}: took ${side === 'mine' ? 'your' : 'their'} side`);
    } finally {
      forget(cwd);
    }
  },
};

export { ROUTES, push, pull, markers, sha, count, submodules, plural };
