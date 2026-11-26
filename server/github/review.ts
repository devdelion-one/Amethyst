import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must } from '../base/gitcli.ts';
import { worktreesOf, removeWorktree } from '../base/worktrees.ts';
import { target, ready, ghRun, ghJson, gh, num, said, inRepo, listed, names, listArg, hands } from './prs.ts';

const EVENTS: Record<string, string> = { approve: 'APPROVE', changes: 'REQUEST_CHANGES', comment: 'COMMENT' };
const WORDS: Record<string, string> = { approve: 'approved', changes: 'asked for changes on', comment: 'reviewed' };
const MAX_LOG = 200;

async function withJson<T>(data: unknown, fn: (file: string) => Promise<T>) {
  const file = path.join(os.tmpdir(), `amethyst-gh-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
  try {
    return await fn(file);
  } finally {
    fs.rmSync(file, { force: true });
  }
}
const gql = (cwd: string, query: string, vars: Record<string, string>) => ghJson(cwd, ['api', 'graphql', '-f', `query=${query}`, ...Object.entries(vars).flatMap(([k, v]) => ['-f', `${k}=${v}`])]);

function runOf(url: unknown) {
  const m = /\/actions\/runs\/(\d+)(?:\/job\/(\d+))?/.exec(String(url ?? ''));
  if (!m) throw new HttpError(400, 'That check has no GitHub Actions run to read.');
  return { run: m[1], job: m[2] || '' };
}

async function prId(cwd: string, repo: string, n: number) {
  const [owner, name] = repo.split('/');
  const j = await ghJson(cwd, ['api', 'graphql', '-f', 'query=query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $n) { id } } }', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `n=${n}`]);
  const id = j?.data?.repository?.pullRequest?.id;
  if (!id) throw new HttpError(404, `No pull request #${n}.`);
  return id as string;
}

const ROUTES: Routes = {
  'POST /api/gh/pr/review': async ({ n, how, body, comments }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd), text = String(body ?? '').trim();
    if (!EVENTS[String(how)]) throw new HttpError(400, 'Approve, ask for changes, or comment.');
    const notes = (Array.isArray(comments) ? comments : [])
      .map((c: any) => ({ path: String(c?.path || ''), line: Number(c?.line), side: c?.side === 'old' ? 'LEFT' : 'RIGHT', body: String(c?.body || '').trim() }))
      .filter((c) => c.path && !c.path.startsWith('-') && Number.isInteger(c.line) && c.line > 0 && c.body);
    if (how === 'changes' && !text && !notes.length) throw new HttpError(400, 'Say what should change.');
    if (how === 'comment' && !text && !notes.length) throw new HttpError(400, 'Write the comment first.');
    await ready();
    if (!notes.length) {
      await ghRun(cwd, ['pr', 'review', String(k), '-R', t.repo, `--${how === 'changes' ? 'request-changes' : how}`, ...(text ? ['--body', text] : [])]);
    } else {
      const head = await ghJson(cwd, ['pr', 'view', String(k), '-R', t.repo, '--json', 'headRefOid']);
      await withJson({ event: EVENTS[String(how)], body: text, commit_id: head.headRefOid, comments: notes }, (file) => ghRun(cwd, ['api', '-X', 'POST', `repos/${t.repo}/pulls/${k}/reviews`, '--input', file]));
    }
    listed.clear();
    return said(`${WORDS[String(how)]} #${k}${notes.length ? ` with ${notes.length} line comment${notes.length === 1 ? '' : 's'}` : ''}`);
  },
  'POST /api/gh/pr/reply': async ({ n, id, body }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd), c = num(id), text = String(body ?? '').trim();
    if (!text) throw new HttpError(400, 'Write the reply first.');
    await ready();
    await ghRun(cwd, ['api', '-X', 'POST', `repos/${t.repo}/pulls/${k}/comments/${c}/replies`, '-f', `body=${text}`]);
    return said('replied');
  },
  'POST /api/gh/pr/resolve': async ({ thread, undo }, _q, root: string | null) => {
    const cwd = inRepo(root), id = String(thread ?? '');
    if (!/^[\w=-]{1,200}$/.test(id)) throw new HttpError(400, 'Name a thread.');
    await ready();
    const m = undo ? 'unresolveReviewThread' : 'resolveReviewThread';
    await gql(cwd, `mutation($id: ID!) { ${m}(input: { threadId: $id }) { thread { isResolved } } }`, { id });
    return said(undo ? 'the thread is open again' : 'resolved');
  },
  'POST /api/gh/pr/viewed': async ({ n, path: p, viewed }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd), rel = String(p ?? '');
    if (!rel || rel.startsWith('-')) throw new HttpError(400, 'Name the file.');
    await ready();
    const id = await prId(cwd, t.repo, k), m = viewed === false ? 'unmarkFileAsViewed' : 'markFileAsViewed';
    await gql(cwd, `mutation($id: ID!, $path: String!) { ${m}(input: { pullRequestId: $id, path: $path }) { clientMutationId } }`, { id, path: rel });
    return said(viewed === false ? `${rel}: not viewed` : `${rel}: viewed`);
  },
  'GET /api/gh/run/log': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd), r = runOf(q!.get('url'));
    await ready();
    const out = await ghRun(cwd, ['run', 'view', ...(r.job ? ['--job', r.job] : [r.run]), '-R', t.repo, '--log-failed'], 120e3);
    const lines = out.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const tail = lines.slice(-MAX_LOG).map((l) => l.replace(/^[^\t]*\t[^\t]*\t\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
    return { lines: tail, more: Math.max(0, lines.length - MAX_LOG), text: tail.join('\n') || 'the log says nothing that failed' };
  },
  'POST /api/gh/run/rerun': async ({ url }, _q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd), r = runOf(url);
    await ready();
    await ghRun(cwd, ['run', 'rerun', r.run, '-R', t.repo, '--failed']);
    return said('the failed jobs run again');
  },
  'GET /api/gh/people': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd);
    await ready();
    const [people, labels] = await Promise.all([
      gh(cwd, ['api', `repos/${t.repo}/assignees?per_page=100`, '--jq', '.[].login'], { timeout: 60e3 }).then((r) => (r.code ? [] : r.out.split(/\r?\n/).filter(Boolean))),
      gh(cwd, ['label', 'list', '-R', t.repo, '--limit', '200', '--json', 'name,color,description'], { timeout: 60e3 }).then((r) => (r.code ? [] : JSON.parse(r.out || '[]'))),
    ]);
    return { people, labels, text: `people: ${people.join(', ') || 'none'}\nlabels: ${labels.map((l: any) => l.name).join(', ') || 'none'}` };
  },
  'POST /api/gh/pr/edit': async (b, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(b.n), t = await target(cwd);
    const args = [
      ...listArg('--add-reviewer', b.addReviewers),
      ...listArg('--remove-reviewer', b.removeReviewers),
      ...listArg('--add-label', b.addLabels),
      ...listArg('--remove-label', b.removeLabels),
      ...listArg('--add-assignee', b.addAssignees),
      ...listArg('--remove-assignee', b.removeAssignees),
      ...(typeof b.title === 'string' && b.title.trim() ? ['--title', b.title.trim()] : []),
      ...(typeof b.body === 'string' ? ['--body', b.body] : []),
      ...(typeof b.base === 'string' && b.base.trim() && !b.base.startsWith('-') ? ['--base', b.base.trim()] : []),
    ];
    if (!args.length) throw new HttpError(400, 'Nothing to change.');
    await ready();
    await ghRun(cwd, ['pr', 'edit', String(k), '-R', t.repo, ...args]);
    listed.clear();
    const asked = names(b.addReviewers);
    return said(asked.length ? `asked ${asked.join(', ')} to review #${k}` : `#${k} is changed`);
  },
  'POST /api/gh/pr/tidy': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    await ready();
    const p = await ghJson(cwd, ['pr', 'view', String(k), '-R', t.repo, '--json', 'state,headRefName,baseRefName,isCrossRepository']);
    if (p.state !== 'MERGED') throw new HttpError(409, `#${k} is not merged yet.`);
    const head = p.headRefName, base = p.baseRefName, done: string[] = [];
    const wts = (await worktreesOf(cwd, { fresh: true }))?.list || [];
    const wt = wts.find((w) => w.branch === head);
    if (wt) {
      if (wt.changes) throw new HttpError(409, `${head} is open in ${wt.path} with uncommitted changes: commit or drop them there first.`);
      await removeWorktree(cwd, wt.path, (w) => hands.napIn(w.path));
      done.push('removed its folder');
    }
    const cur = (await git(cwd, ['symbolic-ref', '-q', '--short', 'HEAD'])).out.trim();
    if (cur === head) {
      must(await gitLong(cwd, ['switch', '--progress', base], { what: 'switching' }));
      done.push(`on ${base}`);
    }
    const on = (await git(cwd, ['symbolic-ref', '-q', '--short', 'HEAD'])).out.trim();
    if (on === base) {
      const r = await gitLong(cwd, ['pull', '--ff-only', '--quiet'], { what: 'pulling' });
      done.push(r.code ? `${base} not pulled: ${r.err.trim().split('\n').pop()}` : `${base} pulled`);
    } else await git(cwd, ['fetch', '--quiet', t.remote, `${base}:${base}`]);
    if (!(await git(cwd, ['show-ref', '--verify', '-q', `refs/heads/${head}`])).code && head !== base) {
      must(await git(cwd, ['branch', '-D', head]));
      done.push(`deleted ${head} here`);
    }
    return said(done.length ? done.join(' · ') : 'nothing to tidy');
  },
  'POST /api/gh/fork': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root);
    await ready();
    const branch = (await git(cwd, ['symbolic-ref', '-q', '--short', 'HEAD'])).out.trim();
    await ghRun(cwd, ['repo', 'fork', '--remote', '--remote-name', 'origin'], 180e3);
    if (branch) must(await gitLong(cwd, ['push', '--progress', '-u', 'origin', `${branch}:refs/heads/${branch}`], { what: 'pushing' }));
    const t = await target(cwd);
    return said(`your fork is origin now, ${t.repo} is upstream${branch ? ` · ${branch} is pushed to your fork` : ''}`);
  },
  'POST /api/gh/sync': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd);
    if (!t.fork) throw new HttpError(409, 'This repository is not a fork.');
    await ready();
    const name = t.repo.split('/')[1];
    await ghRun(cwd, ['repo', 'sync', `${t.own}/${name}`, '--source', t.repo], 120e3);
    await gitLong(cwd, ['fetch', '--quiet', '--all', '--prune'], { what: 'checking the remote' });
    return said(`your fork has ${t.repo}'s newest commits · pull to bring them here`);
  },
  'POST /api/gh/release': async ({ tag, title, notes }, _q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd), name = String(tag ?? '').trim();
    if (!name || name.startsWith('-') || (await git(cwd, ['check-ref-format', `refs/tags/${name}`])).code) throw new HttpError(400, 'Name the tag.');
    if ((await git(cwd, ['show-ref', '--verify', '-q', `refs/tags/${name}`])).code) throw new HttpError(404, `There is no tag ${name} here.`);
    await ready();
    const origin = (await git(cwd, ['remote'])).out.split(/\r?\n/).includes('origin') ? 'origin' : t.remote;
    must(await gitLong(cwd, ['push', '--progress', origin, `refs/tags/${name}`], { what: 'pushing the tag' }));
    const text = String(notes ?? '').trim();
    const out = await ghRun(cwd, ['release', 'create', name, '-R', t.repo, '--verify-tag', '--title', String(title ?? '').trim() || name, ...(text ? ['--notes', text] : ['--generate-notes'])], 120e3);
    const url = out.trim().split(/\s+/).find((w) => /\/releases\//.test(w)) || '';
    return said(`released ${name}${url ? ': ' + url : ''}`, { url });
  },
};

export { ROUTES };
