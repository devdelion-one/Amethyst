import fs from 'fs';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { stamp } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must, placeOf } from '../base/gitcli.ts';
import { hands, inRepo, said, but, relArg, leaveOut, status, repoStatus, forget, done, mineIsTheirs, untrackedIn, fileRow, MAX_FILES } from './status.ts';
import { push, markers, plural } from './sync.ts';
import { diffAt } from './history.ts';
import { partsOf, stagePart, dropPart } from './parts.ts';

const MAX_DIFF = 30000;
const HOOKS = { what: 'committing', idle: 10 * 60e3 };

const secretsOf = (st: any): string[] => st.files.flatMap((f: any) => (f.secret ? [f.path] : f.secrets || []));
const lit = (p: string) => ':(literal)' + p.replace(/\/+$/, '');
const stateWord = (state: string) => (state === 'pick' ? 'cherry-pick' : state === 'unstash' ? 'clash with your changes' : state);

async function changesFor(cwd: string, st: any, skip: unknown) {
  const left = new Set([...((Array.isArray(skip) ? skip : []) as unknown[]).map(String), ...secretsOf(st)]);
  const out = leaveOut(cwd, [...left]);
  const files = st.staged ? st.files.filter((f: any) => f.staged) : st.files.filter((f: any) => !left.has(f.path));
  if (!files.length) throw new HttpError(409, 'Nothing to commit: every change is left out.');
  let text = files.map((f: any) => `${f.x} ${f.from ? f.from + ' → ' : ''}${f.path}`).join('\n') + '\n\n';
  if (st.staged) text += (await git(cwd, ['diff', '--cached', '--no-color', '--no-ext-diff', '--', '.'], { timeout: 30e3 })).out;
  else if (st.commits) text += (await git(cwd, ['diff', 'HEAD', '--no-color', '--no-ext-diff', '--', '.', ...out], { timeout: 30e3 })).out;
  for (const f of files.filter((x: any) => x.x === 'A' && !st.staged)) {
    if (text.length > MAX_DIFF) break;
    try {
      const abs = path.join(cwd, f.path), size = fs.statSync(abs).size;
      if (size > 200e3) continue;
      const body = fs.readFileSync(abs, 'utf8');
      if (!body.includes('\0')) text += `\n--- new file ${f.path}\n${body.slice(0, 2000)}\n`;
    } catch {}
  }
  return text.slice(0, MAX_DIFF);
}
const ASK = `Write a git commit message for the changes below.
- A subject line under 60 characters, in the imperative ("Add …", "Fix …"), no period at the end.
- Only if the subject can't carry it: a blank line, then a short body saying what the subject leaves out.
- Plain text. Reply with the message only: no quotes, no code fences, nothing before or after it.

`;
const tidy = (s: unknown) =>
  String(s)
    .replace(/^\s*```\w*\n?|\n?```\s*$/g, '')
    .replace(/^\s*["'“]|["'”]\s*$/g, '')
    .trim();

async function commitTaken(cwd: string, flags: string[], out: string[]) {
  must(await git(cwd, ['add', '-A', '--', '.', ...out]));
  const r = await gitLong(cwd, ['commit', '-q', ...flags, '--', '.', ...out], HOOKS);
  if (r.code) await git(cwd, ['reset', '-q', '--', '.']);
  must(r);
}

type Kept = { sha: string; tracked: { path: string; from?: string; index?: boolean }[]; binned: { to: string; abs: string }[] };
const discarded = new Map<string, Kept>();
const KEEP_REFS = 20;
async function keepRef(cwd: string, sha: string) {
  must(await git(cwd, ['update-ref', `refs/amethyst/discarded/${Date.now()}`, sha]));
  const old = (await git(cwd, ['for-each-ref', '--sort=-refname', '--format=%(refname)', 'refs/amethyst/discarded/'])).out.split(/\r?\n/).filter(Boolean).slice(KEEP_REFS);
  for (const ref of old) await git(cwd, ['update-ref', '-d', ref]);
}

async function discardOne(cwd: string, f: any, label: string, kept: Kept) {
  const abs = path.join(cwd, f.path);
  if (f.sub) throw new HttpError(409, `${f.path} is a repository of its own: open it and discard there.`);
  if (f.fresh) {
    if (f.staged || f.x === 'R') must(await git(cwd, ['rm', '-q', '-r', '--cached', '--', f.path]));
    if (fs.existsSync(abs)) kept.binned.push({ to: await hands.bin(abs, path.join(label, f.path)), abs });
    if (f.from) must(await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', f.from]));
    return;
  }
  kept.tracked.push({ path: f.path, ...(f.from ? { from: f.from } : {}) });
  must(await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...(f.from ? [f.from, f.path] : [f.path])]));
}

const ROUTES: Routes = {
  'GET /api/git/diff': async (_b, q, root: string | null) => {
    if (!root || !(await placeOf(root))) throw new HttpError(409, 'not in git yet');
    if (q!.get('a') || q!.get('b')) return diffAt(root, q!);
    const rel = relArg(root, q!.get('path')), from = q!.get('from') ? relArg(root, q!.get('from')) : rel, side = q!.get('side');
    if (q!.get('parts') && !side && from === rel && !(await repoStatus(root)).state) {
      try {
        const view = await partsOf(root, rel);
        if (view.parts.length) return view;
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
      }
    }
    if (side === 'mine' || side === 'theirs') {
      const st = await repoStatus(root);
      const stage = (side === 'mine') !== mineIsTheirs(st.state) ? 2 : 3;
      const [base, now] = await Promise.all([1, stage].map((n) => git(root, ['show', `:${n}:./${rel}`], { timeout: 30e3 })));
      if (base.code && now.code) throw new HttpError(409, `${rel} is not in conflict.`);
      const a = base.code ? '' : base.out, b = now.code ? '' : now.out;
      if (a.includes('\0') || b.includes('\0')) return { path: rel, binary: true };
      return { path: rel, side, oldText: a.replace(/\r\n/g, '\n'), newText: b.replace(/\r\n/g, '\n') };
    }
    const old = await git(root, ['show', `HEAD:./${from}`], { timeout: 30e3 });
    let now = '';
    try {
      const abs = path.join(root, rel);
      if (fs.statSync(abs).size > 2e6) return { path: rel, binary: true };
      now = fs.readFileSync(abs, 'utf8');
    } catch {}
    const before = old.code ? '' : old.out;
    if (before.includes('\0') || now.includes('\0')) return { path: rel, binary: true };
    const a = before.replace(/\r\n/g, '\n'), b = now.replace(/\r\n/g, '\n');
    return { path: rel, oldText: a, newText: b, ...(a === b && before !== now ? { eol: true } : {}) };
  },
  'GET /api/git/folder': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), d = relArg(cwd, q!.get('path')).replace(/\/*$/, '/');
    const all = await untrackedIn(cwd, [d]);
    return { path: d, files: all.slice(0, MAX_FILES).map(fileRow), more: Math.max(0, all.length - MAX_FILES) };
  },
  'POST /api/git/ignore': async ({ path: p, kind }, _q, root: string | null) => {
    const cwd = inRepo(root), place = await placeOf(cwd);
    if (!place) throw new HttpError(409, 'This project is not in git yet.');
    const rel = relArg(cwd, p).replace(/\/+$/, ''), name = rel.split('/').pop()!, ext = /\.[\w-]{1,16}$/.exec(name)?.[0];
    const at = '/' + (place.prefix + rel).replace(/([*?[\]!#])/g, '\\$1');
    const line = kind === 'ext' ? (ext ? '*' + ext : '') : kind === 'folder' ? at.slice(0, at.lastIndexOf('/') + 1) || '' : kind === 'dir' ? at + '/' : at;
    if (!line || line === '/') throw new HttpError(400, kind === 'ext' ? `${name} has no file type to ignore.` : 'That would ignore the whole repository.');
    const file = path.join(place.top, '.gitignore');
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {}
    if (!text.split(/\r?\n/).includes(line)) fs.writeFileSync(file, text + (text && !text.endsWith('\n') ? '\n' : '') + line + '\n');
    forget(cwd);
    const still = (await git(cwd, ['ls-files', '-z', '--', rel])).out.length > 0;
    return said(`${line} is in .gitignore${still ? ` · ${rel} is tracked already: stop tracking it to leave it out` : ''}`, { line: `${line} is in .gitignore`, tracked: still });
  },
  'POST /api/git/untrack': async ({ path: p }, _q, root: string | null) => {
    const cwd = inRepo(root), rel = relArg(cwd, p);
    forget(cwd);
    must(await git(cwd, ['rm', '-r', '-q', '--cached', '--', rel]));
    const ignored = !(await git(cwd, ['check-ignore', '-q', '--no-index', '--', rel])).code;
    if (ignored && (await git(cwd, ['status', '--porcelain', '--', ':(top,literal).gitignore'])).out.trim()) must(await git(cwd, ['add', '--', ':(top,literal).gitignore']));
    forget(cwd);
    return said(`git stops tracking ${rel} (the file stays on disk)${ignored ? ', .gitignore keeps it out' : ''} · commit to make it so`);
  },
  'POST /api/git/commit': async ({ message, skip, push: andPush, amend, force }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    const msg = String(message ?? '').trim().slice(0, 20000);
    const merging = st.state === 'merge';
    if (st.state && st.state !== 'merge') throw new HttpError(409, `A ${stateWord(st.state)} is under way: fix the files marked C, then continue (or abort).`);
    if (amend && merging) throw new HttpError(409, 'A merge is under way: commit it first.');
    if (amend && !st.commits) throw new HttpError(409, 'There is no commit to amend yet.');
    if (amend && st.pushed && !force) throw new HttpError(409, 'The last commit is on the remote already: amending it means pushing over it.', { fix: 'force' });
    if (!msg && !merging && !amend) throw new HttpError(400, 'Write a message first.');
    const left = new Set([...(Array.isArray(skip) ? skip.map(String) : []), ...secretsOf(st)]);
    const n = st.staged || amend ? st.staged : st.files.filter((f: any) => !left.has(f.path)).reduce((k: number, f: any) => k + (f.n ? f.n - (f.secrets || []).filter((x: string) => left.has(x)).length : 1), 0);
    if (!n && !merging && !amend) throw new HttpError(409, st.files.length ? 'Nothing to commit: only files that look like secrets changed. Check one to commit it.' : 'Nothing to commit.');
    if (amend && !n && !msg) throw new HttpError(409, 'Nothing to amend: nothing is staged and the message is the same.');
    markers(cwd, st);
    const say = msg ? ['-m', msg] : ['--no-edit'], flags = amend ? ['--amend', ...say] : say;
    forget(cwd);
    try {
      if (merging) {
        must(await git(cwd, ['add', '-A', '--', '.']));
        must(await gitLong(cwd, ['commit', '-q', ...say], HOOKS));
      } else if (st.staged || amend) must(await gitLong(cwd, ['commit', '-q', ...flags], HOOKS));
      else await commitTaken(cwd, flags, leaveOut(cwd, [...left]));
    } finally {
      forget(cwd);
    }
    const line = merging ? 'the merge is committed' : amend ? `amended${n ? ` with ${plural(n, 'file')}` : ': the message'}` : `committed ${plural(n, 'file')}`;
    if (!andPush) return said(line);
    try {
      await push(cwd, await status(cwd));
      return said(line + ' · pushed');
    } catch (e) {
      return { ...but(`${amend ? 'Amended' : 'Committed'}, but the push failed: ${(e as Error).message}`), line, fix: (e as HttpError).fix, detail: (e as HttpError).detail };
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/undo': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    if (!st.commits || !st.head?.parents) throw new HttpError(409, 'This is the first commit: there is nothing before it to go back to.');
    if (st.pushed) throw new HttpError(409, 'The last commit is on the remote already: undoing it here would not undo it there.');
    const message = (await git(cwd, ['log', '-1', '--format=%B'])).out.trim();
    forget(cwd);
    must(await git(cwd, ['reset', '-q', st.staged ? '--soft' : '--mixed', 'HEAD~1']));
    return done(cwd, said(`undone: “${st.head.subject}” · its changes are back in the list`, { message }));
  },
  'POST /api/git/stage': async ({ paths, on, only, all, path: p, part, sig }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state) throw new HttpError(409, `A ${stateWord(st.state)} is under way: the stage is git's until it is finished or aborted.`);
    const unstage = async (specs: string[]) => specs.length && must(await git(cwd, st.commits ? ['reset', '-q', '--', ...specs] : ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...specs]));
    forget(cwd);
    try {
      if (p != null && part != null) return await stagePart(cwd, relArg(cwd, p), part, on !== false, sig);
      if (all) {
        if (on === false) return await unstage(['.']), said('nothing is staged now');
        must(await git(cwd, ['add', '-A', '--', '.', ...leaveOut(cwd, secretsOf(st))]));
        return said('every change is staged' + (secretsOf(st).length ? ' (the ones that look like secrets left out)' : ''));
      }
      const want = (Array.isArray(paths) ? paths : []).slice(0, MAX_FILES).map((x) => relArg(cwd, x));
      if (!want.length && !only) throw new HttpError(400, 'Name the files to stage.');
      const rows = new Map<string, any>(st.files.map((f: any) => [f.path, f]));
      if (only) await unstage(['.']);
      if (on === false && !only) {
        await unstage(want.flatMap((w) => [lit(w), ...(rows.get(w)?.from ? [lit(rows.get(w).from)] : [])]));
        return said(`${plural(want.length, 'file')} out of the stage`);
      }
      const inside = want.flatMap((w) => (rows.get(w)?.dir ? rows.get(w).secrets || [] : []));
      if (want.length) must(await git(cwd, ['add', '-A', '--', ...want.map(lit), ...leaveOut(cwd, inside)]));
      return said(only ? `staged: ${plural(want.length, 'file')}, nothing else` : `staged ${plural(want.length, 'file')}`);
    } finally {
      forget(cwd);
    }
  },
  'POST /api/git/unstage': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    forget(cwd);
    must(await git(cwd, st.commits ? ['reset', '-q', '--', '.'] : ['rm', '-r', '-q', '--cached', '--', '.']));
    return done(cwd, said('nothing is staged now'));
  },
  'POST /api/git/discard': async ({ paths, path: p, part, sig }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (st.state) throw new HttpError(409, `A ${st.state} is under way: finish it or abort it first.`);
    if (p != null && part != null) {
      const rel = relArg(cwd, p), sha = (await git(cwd, ['stash', 'create'])).out.trim();
      forget(cwd);
      try {
        const r = await dropPart(cwd, rel, part, sig);
        if (!r.done) return r.view;
        if (sha) await keepRef(cwd, sha);
        discarded.set(cwd, { sha, tracked: [{ path: rel, index: true }], binned: [] });
        return { ...r.view, ...said(`discarded that part of ${rel}`, { undo: true, fix: 'undone' }) };
      } finally {
        forget(cwd);
      }
    }
    const want = new Set((Array.isArray(paths) ? paths : []).map((p) => relArg(cwd, p)));
    const files = st.files.filter((f: any) => want.has(f.path));
    if (!files.length) throw new HttpError(409, 'Nothing to discard.');
    const label = `${stamp()} ${st.name}`;
    const kept: Kept = { sha: '', tracked: [], binned: [] };
    if (files.some((f: any) => !f.fresh)) {
      kept.sha = (await git(cwd, ['stash', 'create'])).out.trim();
      if (kept.sha) await keepRef(cwd, kept.sha);
    }
    let binned = 0;
    forget(cwd);
    try {
      for (const f of files) {
        await discardOne(cwd, f, label, kept);
        if (f.fresh) binned++;
      }
    } finally {
      forget(cwd);
      discarded.set(cwd, kept);
    }
    return said(`discarded ${plural(files.length, 'file')}${binned ? ` · ${binned} new ${binned === 1 ? 'one is' : 'ones are'} in the archive` : ''}`, { binned, undo: true, fix: 'undone' });
  },
  'POST /api/git/discard/undo': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), kept = discarded.get(cwd);
    if (!kept || (!kept.tracked.length && !kept.binned.length)) throw new HttpError(409, 'There is no discard to undo.');
    discarded.delete(cwd);
    forget(cwd);
    try {
      for (const b of kept.binned) {
        if (fs.existsSync(b.abs)) throw new HttpError(409, `${path.relative(cwd, b.abs)} is there again: it stays in the archive (${b.to}).`);
        await hands.unbin(b.to, b.abs);
      }
      if (kept.sha && kept.tracked.length) {
        must(await git(cwd, ['checkout', kept.sha, '--', ...kept.tracked.map((t) => t.path)]));
        const back = kept.tracked.filter((t) => t.index).map((t) => t.path), clear = kept.tracked.filter((t) => !t.index).map((t) => t.path);
        if (back.length) must(await git(cwd, ['restore', `--source=${kept.sha}^2`, '--staged', '--', ...back]));
        if (clear.length) must(await git(cwd, ['reset', '-q', '--', ...clear]));
        for (const t of kept.tracked) if (t.from) fs.rmSync(path.join(cwd, t.from), { force: true });
      }
    } finally {
      forget(cwd);
    }
    const n = kept.tracked.length + kept.binned.length;
    return said(`${plural(n, 'file')} back as ${n === 1 ? 'it was' : 'they were'}`);
  },
  'POST /api/git/message': async ({ skip, agent, model }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    const text = await changesFor(cwd, st, skip);
    const message = await hands.ask(ASK + text, { system: 'You write short, clear git commit messages.', agent, model, clean: tidy });
    return { message, text: message };
  },
};

export { ROUTES };
