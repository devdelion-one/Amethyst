import fs from 'fs';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must } from '../base/gitcli.ts';
import { commitOf, filesOf, bothSides } from '../base/gitdiff.ts';
import { hands, inRepo, said, but, relArg, repoStatus, forget } from './status.ts';
import { plural } from './sync.ts';

const PAGE = 50, MAX_REFLOG = 60;
const US = '\x1f', RS = '\x1e';

const short = (sha: string) => sha.slice(0, 7);

type Row = { hash: string; short: string; parents: string[]; author: string; email: string; at: number; refs: string[]; subject: string; body: string; pushed: boolean };
function rowsOf(out: string): Row[] {
  return out
    .split(RS)
    .map((r) => r.replace(/^\r?\n/, ''))
    .filter(Boolean)
    .map((r) => {
      const [hash, parents, author, email, at, refs, subject, body] = r.split(US);
      return { hash, short: short(hash), parents: (parents || '').split(' ').filter(Boolean), author, email, at: (parseInt(at, 10) || 0) * 1000, refs: (refs || '').split(', ').map((x) => x.replace(/^HEAD -> /, '').replace(/^tag: /, '#')).filter((x) => x && x !== 'HEAD' && !x.endsWith('/HEAD')), subject: subject || '', body: (body || '').trim(), pushed: true };
    });
}
const FORMAT = `--format=%H${US}%P${US}%an${US}%ae${US}%at${US}%D${US}%s${US}%b${RS}`;

function searchArgs(q: string) {
  const out: string[] = [];
  const words: string[] = [];
  for (const m of q.matchAll(/(author|code):("[^"]*"|\S+)|("[^"]*"|\S+)/g)) {
    const v = (m[2] || m[3] || '').replace(/^"|"$/g, '');
    if (!v) continue;
    if (m[1] === 'author') out.push(`--author=${v}`);
    else if (m[1] === 'code') out.push(`-S${v}`);
    else words.push(v);
  }
  if (words.length) out.push(`--grep=${words.join(' ')}`, '-i', '--fixed-strings');
  return out;
}

async function log(cwd: string, { ref, path: p, q, skip, range }: { ref?: string; path?: string; q?: string; skip?: number; range?: string }) {
  const at = range ? range : ref ? await commitOf(cwd, ref) : 'HEAD';
  if (range && !/^[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}$/.test(range)) throw new HttpError(400, 'A range is two commits: a..b.');
  if (!range && !(await git(cwd, ['rev-parse', '--verify', '-q', 'HEAD'])).out.trim()) return { list: [], more: false };
  const args = ['log', FORMAT, `--skip=${Math.max(0, skip || 0)}`, `-n${PAGE + 1}`, ...searchArgs(q || ''), at];
  if (p) args.push('--follow', '--', p);
  const r = await git(cwd, args, { timeout: 60e3 });
  must(r);
  const rows = rowsOf(r.out);
  const more = rows.length > PAGE;
  const list = rows.slice(0, PAGE);
  const mine = (await git(cwd, ['rev-list', '-n', '500', range ? range.split('..')[1] : at, '--not', '--remotes'])).out.split(/\r?\n/).filter(Boolean);
  const hasRemote = !!(await git(cwd, ['remote'])).out.trim();
  const out = new Set(mine);
  for (const c of list) c.pushed = hasRemote && !out.has(c.hash);
  return { list, more };
}

async function baseOf(cwd: string, base?: unknown) {
  if (base) return (await commitOf(cwd, base)) && String(base);
  const st = await repoStatus(cwd);
  const remote = st.remote?.name;
  const head = remote && (await git(cwd, ['symbolic-ref', '-q', '--short', `refs/remotes/${remote}/HEAD`])).out.trim();
  for (const name of [head, remote && `${remote}/main`, remote && `${remote}/master`, 'main', 'master'].filter(Boolean) as string[]) {
    const sha = (await git(cwd, ['rev-parse', '--verify', '-q', `${name}^{commit}`])).out.trim();
    if (sha) return name;
  }
  throw new HttpError(409, 'No main branch to compare with: name one.');
}

async function diffAt(cwd: string, q: URLSearchParams) {
  const rel = relArg(cwd, q.get('path')), from = q.get('from') ? relArg(cwd, q.get('from')) : rel;
  const a = q.get('a') && q.get('a') !== 'none' ? await commitOf(cwd, q.get('a')) : null;
  const b = q.get('b') && q.get('b') !== 'disk' ? await commitOf(cwd, q.get('b')) : null;
  return bothSides(cwd, a, b, rel, from);
}

function showInApp(what: string, { path: p, ref, base, a, b, cwd: from }: any, root: string | null) {
  const cwd = inRepo(root), ev: Record<string, unknown> = { what };
  if (p) {
    const abs = path.resolve(typeof from === 'string' && path.isAbsolute(from) ? from : cwd, String(p));
    ev.path = relArg(cwd, path.relative(cwd, abs));
  }
  if (ref) ev.ref = String(ref);
  if (base) ev.base = String(base);
  if (a) ev.a = String(a);
  if (b) ev.b = String(b);
  if ((what === 'diff' || what === 'blame') && !ev.path) throw new HttpError(400, 'Name the file.');
  if (!hands.show(cwd, ev)) throw new HttpError(409, 'No Amethyst window shows this project: open it, then try again.');
  return said(`shown in Amethyst: ${what === 'blame' ? 'who changed each line' : what}${ev.path ? ' of ' + ev.path : ev.ref ? ' of ' + ev.ref : ''}`);
}

const ROUTES: Routes = {
  'GET /api/git/log': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), p = q!.get('path') ? relArg(cwd, q!.get('path')) : undefined;
    const r = await log(cwd, { ref: q!.get('ref') || undefined, path: p, q: q!.get('q') || '', skip: Number(q!.get('skip')) || 0, range: q!.get('range') || undefined });
    const text = r.list.map((c) => `${c.short} ${new Date(c.at).toISOString().slice(0, 10)} ${c.author}: ${c.subject}${c.pushed ? '' : ' (not pushed)'}`).join('\n') || 'no commits';
    return { ...r, text: text + (r.more ? '\n…' : '') };
  },
  'GET /api/git/show': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), sha = await commitOf(cwd, q!.get('hash'));
    const [c] = rowsOf((await git(cwd, ['show', '-s', FORMAT, sha])).out);
    const parent = c.parents[0] || null;
    const files = await filesOf(cwd, parent, sha);
    return { ...c, files, text: [`${c.short} ${c.author} <${c.email}>`, c.subject, c.body, '', ...files.map((f) => `${f.x} ${f.from ? f.from + ' → ' : ''}${f.path}`)].filter((l, i) => l || i === 3).join('\n') };
  },
  'GET /api/git/compare': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), ref = q!.get('ref') || 'HEAD', tip = await commitOf(cwd, ref), base = await baseOf(cwd, q!.get('base'));
    const fork = (await git(cwd, ['merge-base', base, tip])).out.trim();
    if (!fork) throw new HttpError(409, `${ref} and ${base} share no history.`);
    const commits = rowsOf(must(await git(cwd, ['log', FORMAT, '-n', '300', `${fork}..${tip}`], { timeout: 60e3 })));
    const behind = parseInt((await git(cwd, ['rev-list', '--count', `${tip}..${base}`])).out, 10) || 0;
    const files = await filesOf(cwd, fork, tip);
    const text = [`${ref} against ${base}: ${plural(commits.length, 'commit')} ahead, ${behind} behind, ${plural(files.length, 'file')} changed`, ...commits.map((c) => `${c.short} ${c.subject}`), '', ...files.map((f) => `${f.x} ${f.path}`)].join('\n');
    return { ref, base, fork, tip, behind, commits, files, text };
  },
  'GET /api/git/blame': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), rel = relArg(cwd, q!.get('path')), at = q!.get('at') ? await commitOf(cwd, q!.get('at')) : null;
    const r = await git(cwd, ['blame', '--porcelain', '-w', ...(at ? [at] : []), '--', rel], { timeout: 60e3 });
    must(r);
    const commits: Record<string, { author: string; at: number; subject: string }> = {};
    const lines: { hash: string; text: string }[] = [];
    let cur = '';
    for (const l of r.out.split('\n')) {
      const head = /^([0-9a-f]{40}) \d+ \d+/.exec(l);
      if (head) {
        cur = head[1];
        commits[cur] ||= { author: '', at: 0, subject: '' };
        continue;
      }
      if (l.startsWith('\t')) lines.push({ hash: cur, text: l.slice(1).replace(/\r$/, '') });
      else if (l.startsWith('author ')) commits[cur].author = l.slice(7);
      else if (l.startsWith('author-time ')) commits[cur].at = parseInt(l.slice(12), 10) * 1000;
      else if (l.startsWith('summary ')) commits[cur].subject = l.slice(8);
    }
    const text = lines.map((x, i) => `${String(i + 1).padStart(5)} ${x.hash.startsWith('0000000') ? 'not committed' : short(x.hash)} ${commits[x.hash].author.padEnd(16).slice(0, 16)} ${x.text}`).join('\n');
    return { path: rel, lines, commits, text };
  },
  'GET /api/git/reflog': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), ref = q!.get('ref') || 'HEAD';
    if (ref.startsWith('-')) throw new HttpError(400, 'Name a branch.');
    const r = await git(cwd, ['reflog', 'show', `-n${MAX_REFLOG}`, `--format=%H${US}%gs${US}%ct`, ref, '--']);
    const list = r.out.split(/\r?\n/).filter(Boolean).map((l) => {
      const [hash, what, at] = l.split(US);
      return { hash, short: short(hash), what, at: (parseInt(at, 10) || 0) * 1000 };
    });
    return { list, text: list.map((x) => `${x.short} ${new Date(x.at).toISOString().slice(0, 16)} ${x.what}`).join('\n') || 'nothing yet' };
  },
  'POST /api/git/revert': async ({ hash }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), sha = await commitOf(cwd, hash);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    const merge = (await git(cwd, ['rev-list', '--parents', '-n1', sha])).out.trim().split(' ').length > 2;
    forget(cwd);
    try {
      const r = await gitLong(cwd, ['revert', '--no-edit', ...(merge ? ['-m', '1'] : []), sha], { what: 'reverting', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
      forget(cwd);
      if (r.code && (await repoStatus(cwd)).state === 'revert') return but('The revert stopped at a conflict: fix the C files, then continue.');
      must(r);
      return said(`reverted ${short(sha)}${merge ? ': what the merge brought in is undone' : ''} · a new commit says so`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/pick': async ({ hash }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), sha = await commitOf(cwd, hash);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    if (st.detached) throw new HttpError(409, 'Not on a branch: switch to one first.');
    const merge = (await git(cwd, ['rev-list', '--parents', '-n1', sha])).out.trim().split(' ').length > 2;
    forget(cwd);
    try {
      const r = await gitLong(cwd, ['cherry-pick', ...(merge ? ['-m', '1'] : []), sha], { what: 'cherry-picking', idle: 10 * 60e3, env: { GIT_EDITOR: 'true' } });
      forget(cwd);
      if (r.code && (await repoStatus(cwd)).state === 'pick') return but('The cherry-pick stopped at a conflict: fix the C files, then continue.');
      must(r);
      return said(`${short(sha)} is on ${st.branch} now, as a new commit`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/reset': async ({ hash, how }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), sha = await commitOf(cwd, hash);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    if (st.detached) throw new HttpError(409, 'Not on a branch: switch to one first.');
    if (how !== 'soft' && how !== 'hard' && how !== 'keep') throw new HttpError(400, 'Keep the changes (soft), drop them (hard), or bring the files along (keep).');
    const was = (await git(cwd, ['rev-parse', 'HEAD'])).out.trim();
    const gone = parseInt((await git(cwd, ['rev-list', '--count', `${sha}..${was}`])).out, 10) || 0;
    forget(cwd);
    must(await git(cwd, ['reset', '-q', `--${how}`, sha], { timeout: 120e3 }));
    forget(cwd);
    if (how === 'keep') return said(`${st.branch} is at ${short(sha)} now, its files with it${st.files.length ? ' · your uncommitted changes stayed' : ''}`, { was });
    return said(`${st.branch} is at ${short(sha)} now${gone ? ` · ${plural(gone, 'commit')} after it ${how === 'soft' ? 'are changes again' : 'left the branch (where it has been can bring them back)'}` : ''}`, { was });
  },
  'POST /api/git/try': async ({ hash }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd), sha = await commitOf(cwd, hash);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    forget(cwd);
    must(await gitLong(cwd, ['switch', '--detach', '--progress', sha], { what: 'switching' }));
    forget(cwd);
    return said(`looking at ${short(sha)} · your branch ${st.branch} is where it was`);
  },
  'POST /api/git/squash': async ({ hashes, message }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state || st.detached) throw new HttpError(409, 'Finish what is under way, and be on a branch.');
    const want = new Set<string>();
    for (const h of Array.isArray(hashes) ? hashes : []) want.add(await commitOf(cwd, h));
    const msg = String(message ?? '').trim();
    if (!msg) throw new HttpError(400, 'Write the message of the commit they become.');
    const newest = (await git(cwd, ['rev-list', `-n${want.size}`, 'HEAD'])).out.split(/\r?\n/).filter(Boolean);
    if (want.size < 1 || newest.length !== want.size || newest.some((h) => !want.has(h))) throw new HttpError(409, 'Only the newest commits can be joined here, without a gap: for older ones, use a rebase in a terminal.');
    const onRemote = (await git(cwd, ['branch', '-r', '--contains', newest[newest.length - 1]])).out.trim();
    if (onRemote) throw new HttpError(409, 'Some of them are on the remote already: rewriting them would need a force push.');
    const parent = (await git(cwd, ['rev-parse', '-q', '--verify', `${newest[newest.length - 1]}^`])).out.trim();
    if (!parent) throw new HttpError(409, 'The first commit can’t be joined into one here.');
    forget(cwd);
    try {
      if (st.files.length) must(await git(cwd, ['stash', 'push', '-u', '-q', '-m', 'amethyst:squash']));
      must(await git(cwd, ['reset', '-q', '--soft', parent]));
      must(await gitLong(cwd, ['commit', '-q', '-m', msg], { what: 'committing', idle: 10 * 60e3 }));
      if (st.files.length) {
        const r = await git(cwd, ['stash', 'pop', '-q'], { timeout: 120e3 });
        if (r.code) return but(`Joined ${want.size} commits; your uncommitted changes clash on the way back: fix the C files (a copy is in the stash list).`);
      }
      return said(want.size === 1 ? 'the message is changed' : `${want.size} commits are one now`);
    } finally {
      forget(cwd);
    }
  },
  ...Object.fromEntries((['diff', 'history', 'branch', 'blame'] as const).map((what) => [`POST /api/git/show/${what}`, (body: any, _q: unknown, root: string | null) => showInApp(what, body, root)])),
};

export { ROUTES, diffAt };
