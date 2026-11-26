import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must, placeOf } from '../base/gitcli.ts';
import { filesOf } from '../base/gitdiff.ts';
import { branchWorktree } from '../base/worktrees.ts';
import { shown, setNames } from '../base/branchnames.ts';
import { inRepo, said, but, repoStatus, forget, stateOf } from './status.ts';
import { submodules, plural } from './sync.ts';

const KEPT = 'amethyst:';
const branchName = async (cwd: string, name: unknown) => {
  const n = String(name ?? '').trim();
  if (!n || n.startsWith('-') || (await git(cwd, ['check-ref-format', '--branch', n])).code) throw new HttpError(400, `“${n}” can't be a branch name`);
  return n;
};
const commitAt = async (cwd: string, ref: unknown) => {
  const r = String(ref ?? '').trim();
  if (!r || r.startsWith('-') || (await git(cwd, ['rev-parse', '--verify', '-q', '--end-of-options', `${r}^{commit}`])).code) throw new HttpError(400, `“${r}” is not a branch, a tag or a commit here`);
  return r;
};
const isLocal = async (cwd: string, n: string) => !(await git(cwd, ['show-ref', '--verify', '-q', `refs/heads/${n}`])).code;

async function stashes(cwd: string) {
  const r = await git(cwd, ['stash', 'list', '--format=%gd%x00%gs%x00%ct%x00%H']);
  return r.out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('\0'))
    .map(([id, name, at, sha]) => ({ id, sha, name: (name || '').replace(/^(On|WIP on) [^:]+: /, ''), on: /^(?:On|WIP on) ([^:]+): /.exec(name || '')?.[1] || '', kept: (name || '').includes(KEPT) ? (name || '').slice((name || '').indexOf(KEPT) + KEPT.length) : '', at: (parseInt(at, 10) || 0) * 1000 }));
}
const stashId = (id: unknown) => {
  const s = String(id ?? '');
  if (!/^stash@\{\d{1,4}\}$/.test(s)) throw new HttpError(400, 'Pick a stash from the list.');
  return s;
};
async function popped(cwd: string, id: string) {
  const r = await git(cwd, ['stash', 'pop', id], { timeout: 120e3 });
  if (!r.code) return '';
  if (/CONFLICT/i.test(r.out + r.err)) return 'Your saved changes clash with this branch: fix the files marked C. They also stay in the stash list.';
  must(r);
  return '';
}

async function switchTo(cwd: string, st: any, n: string, changes: unknown) {
  const from = st.branch, keep = changes === 'stash' && st.files.length > 0 && !st.detached;
  if (keep) must(await git(cwd, ['stash', 'push', '-u', '-q', '-m', KEPT + from], { timeout: 120e3 }));
  const r = await gitLong(cwd, ['switch', '--progress', n], { what: 'switching' });
  if (r.code) {
    if (keep) await git(cwd, ['stash', 'pop', '-q'], { timeout: 120e3 });
    must(r);
  }
  const more = await submodules(cwd);
  const mine = (await stashes(cwd)).find((s) => s.kept === n);
  const clash = mine ? await popped(cwd, mine.id) : '';
  if (clash) return but(clash);
  return said(`on ${n}${keep ? ` · your changes wait on ${from}` : ''}${mine ? ' · the changes you left here are back' : ''}${more}`);
}

const tagName = async (cwd: string, name: unknown) => {
  const n = String(name ?? '').trim();
  if (!n || n.startsWith('-') || (await git(cwd, ['check-ref-format', `refs/tags/${n}`])).code) throw new HttpError(400, `“${n}” can't be a tag name`);
  return n;
};

const ROUTES: Routes = {
  'GET /api/git/branch-names': async (_b, _q, root: string | null) => shown(inRepo(root)),
  'PUT /api/git/branch-names': async (b, _q, root: string | null) => setNames(inRepo(root), b || {}),
  'POST /api/git/worktree': async ({ branch }, _q, root: string | null) => {
    const cwd = inRepo(root), b = String(branch ?? '').trim();
    if (!b || b.startsWith('-')) throw new HttpError(400, 'Name a branch.');
    const w = await branchWorktree(cwd, b);
    forget(cwd);
    return said(`${b} is open in its own folder: ${w.path}`, w);
  },
  'POST /api/git/tag': async ({ name, at, message, push, do: what }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), n = await tagName(cwd, name);
    const remote = st.remote?.name;
    if (what === 'delete') {
      must(await git(cwd, ['tag', '-d', n]));
      if (push && remote) must(await gitLong(cwd, ['push', '--progress', remote, `:refs/tags/${n}`], { what: 'pushing' }));
      return said(`deleted the tag ${n}${push && remote ? ` here and on ${st.remote.label}` : ''}`);
    }
    if (what !== 'push') {
      const ref = at ? String(at).trim() : 'HEAD';
      if (ref.startsWith('-') || (await git(cwd, ['rev-parse', '--verify', '-q', '--end-of-options', `${ref}^{commit}`])).code) throw new HttpError(400, `“${ref}” is not a commit here`);
      const msg = String(message ?? '').trim().slice(0, 5000);
      must(await git(cwd, ['tag', ...(msg ? ['-a', '-m', msg] : []), n, ref]));
    }
    if (!push && what !== 'push') return said(`tagged ${n}`);
    if (!remote) throw new HttpError(409, `Tagged ${n} here; there is no remote to push it to.`);
    must(await gitLong(cwd, ['push', '--progress', remote, `refs/tags/${n}`], { what: 'pushing' }));
    return said(`${what === 'push' ? 'pushed' : 'tagged and pushed'} ${n} to ${st.remote.label}`);
  },
  'GET /api/git/branches': async (_b, _q, root: string | null) => {
    if (!root || !(await placeOf(root))) throw new HttpError(409, 'not in git yet');
    const r = must(await git(root, ['for-each-ref', '--sort=-committerdate', '--format=%(refname)%00%(committerdate:unix)%00%(upstream:short)%00%(upstream:track)', 'refs/heads', 'refs/remotes']));
    const local: { name: string; at: number; upstream: string; ahead: number; behind: number; gone: boolean }[] = [], remote: string[] = [];
    for (const l of r.split(/\r?\n/).filter(Boolean)) {
      const [ref, at, upstream, track] = l.split('\0');
      if (ref.startsWith('refs/heads/'))
        local.push({ name: ref.slice(11), at: (parseInt(at, 10) || 0) * 1000, upstream: upstream || '', ahead: +(/ahead (\d+)/.exec(track || '')?.[1] || 0), behind: +(/behind (\d+)/.exec(track || '')?.[1] || 0), gone: /gone/.test(track || '') });
      else if (!ref.endsWith('/HEAD')) remote.push(ref.slice(13));
    }
    const here = new Set(local.map((b) => b.name));
    const tags = (await git(root, ['for-each-ref', '--sort=-creatordate', '--count=30', '--format=%(refname:short)', 'refs/tags'])).out.split(/\r?\n/).filter(Boolean);
    return { local: local.slice(0, 60), remote: remote.filter((x) => !here.has(x.slice(x.indexOf('/') + 1))).slice(0, 60), tags, stashes: (await stashes(root)).length };
  },
  'POST /api/git/branch': async ({ name, create, do: what, from, to, changes, force }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    const act = String(what || (create ? 'create' : 'switch'));
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    forget(cwd);
    try {
      if (act === 'create') {
        const n = await branchName(cwd, name), at = from ? [await commitAt(cwd, from)] : [];
        must(await git(cwd, ['switch', '-c', n, ...at], { timeout: 60e3 }));
        return said(`on the new branch ${n}${from ? ` (from ${from})` : ''}`);
      }
      if (act === 'move') {
        const n = await branchName(cwd, name);
        if (st.detached || !st.upstream || !st.ahead) throw new HttpError(409, 'There are no commits here that the remote does not have.');
        must(await git(cwd, ['switch', '-c', n], { timeout: 60e3 }));
        must(await git(cwd, ['branch', '-f', st.branch, st.upstream]));
        return said(`${plural(st.ahead, 'commit')} moved to the new branch ${n} · ${st.branch} is back where the remote has it`);
      }
      if (act === 'switch') return await switchTo(cwd, st, await branchName(cwd, name), changes);
      if (act === 'rename') {
        const n = await branchName(cwd, name), now = await branchName(cwd, to);
        must(await git(cwd, ['branch', '-m', n, now]));
        return said(`${n} is now ${now}`);
      }
      if (act === 'delete') {
        const n = await branchName(cwd, name);
        if (!(await isLocal(cwd, n))) throw new HttpError(409, `${n} is not a branch on this PC.`);
        if (n === st.branch && !st.detached) throw new HttpError(409, 'You are on this branch: switch to another one first.');
        const lost = parseInt((await git(cwd, ['rev-list', '--count', `refs/heads/${n}`, '--not', `--exclude=${n}`, '--branches', '--remotes'])).out, 10) || 0;
        if (lost && !force) throw new HttpError(409, `${plural(lost, 'commit')} on ${n} ${lost === 1 ? 'is' : 'are'} nowhere else: deleting the branch loses ${lost === 1 ? 'it' : 'them'}.`, { fix: 'force' });
        must(await git(cwd, ['branch', '-D', n]));
        return said(`deleted ${n}${lost ? ` with ${plural(lost, 'commit')}` : ''}`);
      }
      if (act === 'merge' || act === 'rebase') {
        const ref = await commitAt(cwd, name);
        if (st.detached) throw new HttpError(409, 'Not on a branch: switch to one first.');
        const r = await gitLong(cwd, act === 'merge' ? ['merge', '--no-edit', '--autostash', ref] : ['rebase', '--autostash', ref], { what: act === 'merge' ? 'merging' : 'rebasing', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
        if (r.code) {
          const place = await placeOf(cwd);
          if (place && stateOf(place).state) return but(`The ${act} stopped at a conflict: fix the files marked C, then ${act === 'merge' ? 'commit' : 'continue'}.`);
          must(r);
        }
        return said((act === 'merge' ? `merged ${ref} into ${st.branch}` : `${st.branch} now starts from ${ref}`) + (await submodules(cwd)));
      }
      throw new HttpError(400, `“${act}” is not something a branch does here.`);
    } finally {
      forget(cwd);
    }
  },
  'GET /api/git/stashes': async (_b, _q, root: string | null) => {
    if (!root || !(await placeOf(root))) throw new HttpError(409, 'not in git yet');
    const list = await stashes(root);
    return { list, text: list.map((s) => `${s.id}  ${s.name}`).join('\n') || 'no stashes' };
  },
  'GET /api/git/stash': async (_b, q, root: string | null) => {
    if (!root || !(await placeOf(root))) throw new HttpError(409, 'not in git yet');
    const s = (await stashes(root)).find((x) => x.id === stashId(q!.get('id')));
    if (!s) throw new HttpError(404, 'That stash is not in the list any more.');
    const sha = s.sha, extra = (await git(root, ['rev-parse', '--verify', '-q', `${sha}^3`])).out.trim();
    const files = [...(await filesOf(root, `${sha}^1`, sha)).map((f) => ({ ...f, a: `${sha}^1`, b: sha })), ...(extra ? (await filesOf(root, null, extra)).map((f) => ({ ...f, x: 'A', a: null, b: extra })) : [])];
    return { ...s, files, text: [`${s.id} ${s.name}`, ...files.map((f) => `${f.x} ${f.path}`)].join('\n') };
  },
  'POST /api/git/stash': async ({ do: what, id, message }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    forget(cwd);
    try {
      if (what === 'pop' || what === 'drop') {
        const s = stashId(id);
        if (what === 'drop') return must(await git(cwd, ['stash', 'drop', '-q', s])), said('the stash is dropped');
        const clash = await popped(cwd, s);
        return clash ? but(clash) : said('the stashed changes are back');
      }
      if (!st.files.length) throw new HttpError(409, 'Nothing to stash: no file changed.');
      const msg = String(message ?? '').trim().slice(0, 200);
      must(await git(cwd, ['stash', 'push', '-u', '-q', ...(msg ? ['-m', msg] : [])], { timeout: 120e3 }));
      return said(`stashed ${plural(st.files.length, 'file')}`);
    } finally {
      forget(cwd);
    }
  },
};

export { ROUTES };
