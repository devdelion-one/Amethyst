import fs from 'fs';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must } from '../base/gitcli.ts';
import { gh, ghState } from '../base/ghcli.ts';
import { filesOf, bothSides } from '../base/gitdiff.ts';
import { branchWorktree } from '../base/worktrees.ts';
import { nameFor } from '../base/branchnames.ts';
import { free, keepOut } from '../base/agentfiles.ts';

type Hands = { ask: (text: string, o: { system?: string; agent?: unknown; model?: unknown; clean?: (said: string) => string }) => Promise<string>; show: (dir: string, ev: Record<string, unknown>) => boolean; napIn: (dir: string) => Promise<unknown> };
const hands: Hands = {
  ask: async () => {
    throw new HttpError(503, 'The chats are not ready yet.');
  },
  show: () => false,
  napIn: async () => {},
};

const inRepo = (root: string | null): string => {
  if (!root) throw new HttpError(400, 'Pull requests work inside a project.');
  return root;
};
const said = <T extends object>(line: string, more?: T) => ({ ok: true, line, text: line, ...(more as T) });
const num = (n: unknown) => {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1) throw new HttpError(400, 'Name a pull request by its number.');
  return k;
};

type Target = { repo: string; remote: string; own: string; fork: boolean; web: string };
const GH = /^(?:https?:\/\/(?:[^@/]+@)?github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i;
async function target(cwd: string): Promise<Target> {
  const r = await git(cwd, ['config', '--get-regexp', '^remote\\..*\\.url$']);
  const all = r.out
    .split(/\r?\n/)
    .map((l) => /^remote\.(.+)\.url (.+)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ name: m![1], m: GH.exec(m![2]) }))
    .filter((x) => x.m)
    .map((x) => ({ name: x.name, owner: x.m![1], repo: `${x.m![1]}/${x.m![2]}` }));
  if (!all.length) throw new HttpError(409, 'This repository is not on GitHub: pull requests need a GitHub remote.');
  const up = all.find((x) => x.name === 'upstream'), origin = all.find((x) => x.name === 'origin') || all[0];
  const t = up && up.repo !== origin.repo ? up : origin;
  return { repo: t.repo, remote: t.name, own: origin.owner, fork: t !== origin, web: `https://github.com/${t.repo}` };
}

async function ready() {
  const state = await ghState();
  if (state === 'in') return;
  if (state === 'none') throw new HttpError(424, 'Pull requests go through the GitHub CLI: install it from cli.github.com, then sign in.');
  if (state === 'offline') throw new HttpError(503, "Can't reach GitHub right now.");
  throw new HttpError(401, 'Sign in to GitHub first.', { fix: 'login' });
}
async function ghRun(cwd: string, args: string[], timeout = 60e3) {
  const r = await gh(cwd, args, { timeout });
  if (r.code && /no pull requests found|Could not resolve to a PullRequest/i.test(r.err + r.out)) throw new HttpError(404, 'No pull request for that.');
  return must(r, 'gh');
}
const ghJson = async (cwd: string, args: string[]) => JSON.parse((await ghRun(cwd, args)) || 'null');

let me = '';
const login = async (cwd: string) => (me ||= (await gh(cwd, ['api', 'user', '--jq', '.login'], { timeout: 20e3 })).out.trim());

type Check = { name: string; state: 'pass' | 'fail' | 'running' | 'skip'; url: string; workflow: string };
function checkOf(c: any): Check {
  if (c.__typename === 'StatusContext' || c.context) {
    const s = String(c.state || '').toUpperCase();
    return { name: c.context || 'status', state: s === 'SUCCESS' ? 'pass' : s === 'FAILURE' || s === 'ERROR' ? 'fail' : 'running', url: c.targetUrl || '', workflow: '' };
  }
  const st = String(c.status || '').toUpperCase(), con = String(c.conclusion || '').toUpperCase();
  const state = st !== 'COMPLETED' ? 'running' : con === 'SUCCESS' || con === 'NEUTRAL' ? 'pass' : con === 'SKIPPED' ? 'skip' : 'fail';
  return { name: c.name || 'check', state, url: c.detailsUrl || '', workflow: c.workflowName || '' };
}
function rollup(list: Check[]) {
  const live = list.filter((c) => c.state !== 'skip');
  if (!live.length) return 'none';
  if (live.some((c) => c.state === 'fail')) return 'fail';
  if (live.some((c) => c.state === 'running')) return 'running';
  return 'pass';
}
const reviewOf = (d: string) => ({ APPROVED: 'approved', CHANGES_REQUESTED: 'changes', REVIEW_REQUIRED: 'waiting' } as Record<string, string>)[d] || '';

const LIST = 'number,title,author,isDraft,headRefName,baseRefName,reviewDecision,statusCheckRollup,updatedAt,url,isCrossRepository';
const listed = new Map<string, { at: number; list: any[] }>();
function rowOf(p: any) {
  const checks = (p.statusCheckRollup || []).map(checkOf);
  return { n: p.number, title: p.title, author: p.author?.login || '', draft: !!p.isDraft, head: p.headRefName, base: p.baseRefName, review: reviewOf(p.reviewDecision), checks: rollup(checks), at: Date.parse(p.updatedAt) || 0, url: p.url, fork: !!p.isCrossRepository };
}

function blockers(p: any, checks: Check[]) {
  const why: string[] = [], warn: string[] = [];
  const roll = rollup(checks), base = p.baseRefName;
  if (p.state !== 'OPEN') return { why: [p.state === 'MERGED' ? 'it is merged' : 'it is closed'], warn, can: false };
  if (p.isDraft) why.push('it is a draft: mark it ready first');
  if (p.mergeable === 'CONFLICTING' || p.mergeStateStatus === 'DIRTY') why.push(`it clashes with ${base}: bring ${base} in and fix the clash`);
  if (p.mergeStateStatus === 'BEHIND') why.push(`${base} moved on, and the rules want it brought in first`);
  if (p.mergeStateStatus === 'BLOCKED') {
    if (p.reviewDecision === 'CHANGES_REQUESTED') why.push('a reviewer asked for changes');
    else if (p.reviewDecision === 'REVIEW_REQUIRED') why.push('it needs an approving review');
    else if (roll === 'fail') why.push('required checks fail');
    else if (roll === 'running') why.push('checks are still running');
    else why.push("the branch's rules block it");
  }
  if (p.mergeStateStatus === 'UNSTABLE') warn.push('some checks fail; the rules still allow a merge');
  if (p.mergeStateStatus === 'UNKNOWN' || p.mergeable === 'UNKNOWN') warn.push('GitHub is still working out whether it can merge');
  return { why, warn, can: !why.length };
}

const VIEW = 'number,title,body,author,state,isDraft,headRefName,baseRefName,reviewDecision,mergeable,mergeStateStatus,statusCheckRollup,commits,files,comments,reviews,url,createdAt,updatedAt,additions,deletions,changedFiles,headRefOid,isCrossRepository,reviewRequests,labels,assignees';
const repoKept = new Map<string, { at: number; v: any }>();
async function repoInfo(cwd: string, t: Target) {
  const k = repoKept.get(t.repo);
  if (k && Date.now() - k.at < 10 * 60e3) return k.v;
  const v = await ghJson(cwd, ['repo', 'view', t.repo, '--json', 'squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge,viewerPermission,defaultBranchRef']);
  repoKept.set(t.repo, { at: Date.now(), v });
  return v;
}

async function view(cwd: string, which: string) {
  const t = await target(cwd);
  const p = await ghJson(cwd, ['pr', 'view', which, '-R', t.repo, '--json', VIEW]);
  const [info, who, lines] = await Promise.all([
    repoInfo(cwd, t),
    login(cwd),
    threadsOf(cwd, t, p.number).catch(() => null),
  ]);
  const checks: Check[] = (p.statusCheckRollup || []).map(checkOf);
  const talk = [
    ...(p.comments || []).map((c: any) => ({ kind: 'comment', who: c.author?.login || '', at: Date.parse(c.createdAt) || 0, body: c.body || '' })),
    ...(p.reviews || []).filter((r: any) => r.body || r.state !== 'COMMENTED').map((r: any) => ({ kind: 'review', who: r.author?.login || '', at: Date.parse(r.submittedAt) || 0, body: r.body || '', state: ({ APPROVED: 'approved', CHANGES_REQUESTED: 'asked for changes', COMMENTED: 'commented', DISMISSED: 'dismissed' } as Record<string, string>)[r.state] || '' })),
    ...(lines?.threads || []).map((x: any) => ({ kind: 'line', who: x.comments[0]?.who || '', at: x.comments[0]?.at || 0, body: x.comments[0]?.body || '', path: x.path, line: x.line, side: x.side, hunk: x.hunk, id: x.comments[0]?.id, thread: x.id, resolved: x.resolved, replies: x.comments.slice(1) })),
  ].sort((a, b) => a.at - b.at);
  const ways = [info.squashMergeAllowed && 'squash', info.mergeCommitAllowed && 'merge', info.rebaseMergeAllowed && 'rebase'].filter(Boolean);
  return {
    n: p.number,
    title: p.title,
    body: p.body || '',
    author: p.author?.login || '',
    mine: !!who && who === p.author?.login,
    state: String(p.state || '').toLowerCase(),
    draft: !!p.isDraft,
    head: p.headRefName,
    base: p.baseRefName,
    fork: !!p.isCrossRepository,
    url: p.url,
    at: Date.parse(p.updatedAt) || 0,
    adds: p.additions || 0,
    dels: p.deletions || 0,
    nfiles: p.changedFiles || (p.files || []).length,
    review: reviewOf(p.reviewDecision),
    asked: (p.reviewRequests || []).map((r: any) => r.login || r.name || r.slug).filter(Boolean),
    labels: (p.labels || []).map((l: any) => l.name),
    commits: (p.commits || []).map((c: any) => ({ hash: c.oid, short: String(c.oid).slice(0, 7), subject: c.messageHeadline, author: c.authors?.[0]?.name || c.authors?.[0]?.login || '', at: Date.parse(c.committedDate) || 0 })),
    checks,
    roll: rollup(checks),
    talk,
    merge: { ...blockers(p, checks), ways, deleteBranch: !!info.deleteBranchOnMerge, write: /ADMIN|MAINTAIN|WRITE/.test(info.viewerPermission || '') },
    repo: t.repo,
    id: lines?.id || '',
    viewed: lines?.viewed || {},
    threads: lines?.threads || [],
    headOid: p.headRefOid || '',
  };
}

async function fetchPr(cwd: string, n: number) {
  const t = await target(cwd);
  const p = await ghJson(cwd, ['pr', 'view', String(n), '-R', t.repo, '--json', 'baseRefName']);
  must(await gitLong(cwd, ['fetch', '--quiet', '--no-tags', t.remote, `+refs/pull/${n}/head:refs/amethyst/pr/${n}`, `+refs/heads/${p.baseRefName}:refs/amethyst/pr-base/${n}`], { what: 'fetching the pull request', key: `${cwd}#pr` }));
  const tip = `refs/amethyst/pr/${n}`, fork = (await git(cwd, ['merge-base', `refs/amethyst/pr-base/${n}`, tip])).out.trim();
  if (!fork) throw new HttpError(409, 'The pull request shares no history with its base.');
  return { fork, tip };
}

const THREADS = `query($owner: String!, $name: String!, $n: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $n) { id
  files(first: 100) { nodes { path viewerViewedState } }
  reviewThreads(first: 100) { nodes { id isResolved path line originalLine diffSide comments(first: 50) { nodes { databaseId author { login } body createdAt diffHunk } } } } } } }`;
async function threadsOf(cwd: string, t: Target, n: number) {
  const [owner, name] = t.repo.split('/');
  const j = await ghJson(cwd, ['api', 'graphql', '-f', `query=${THREADS}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `n=${n}`]);
  const pr = j?.data?.repository?.pullRequest;
  if (!pr) return null;
  const viewed: Record<string, boolean> = {};
  for (const f of pr.files?.nodes || []) viewed[f.path] = f.viewerViewedState === 'VIEWED';
  const threads = (pr.reviewThreads?.nodes || []).map((x: any) => ({
    id: x.id,
    resolved: !!x.isResolved,
    path: x.path,
    line: x.line ?? x.originalLine ?? null,
    side: x.diffSide === 'LEFT' ? 'old' : 'new',
    hunk: String(x.comments?.nodes?.[0]?.diffHunk || '').split('\n').slice(-4).join('\n'),
    comments: (x.comments?.nodes || []).map((c: any) => ({ id: c.databaseId, who: c.author?.login || '', body: c.body || '', at: Date.parse(c.createdAt) || 0 })),
  }));
  return { id: pr.id, viewed, threads };
}

const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
const branchOf = async (cwd: string) => (await git(cwd, ['symbolic-ref', '-q', '--short', 'HEAD'])).out.trim();
const names = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => String(x).trim()).filter((x) => x && !x.startsWith('-') && x.length < 100);
const listArg = (flag: string, v: unknown) => (names(v).length ? [flag, names(v).join(',')] : []);
const issueOf = (branch: string) => /(?:^|\/)(\d{1,7})(?:[-_]|$)/.exec(branch)?.[1] || '';
async function baseName(cwd: string, t: Target, base?: unknown) {
  if (base && String(base).trim()) return String(base).trim();
  return (await repoInfo(cwd, t)).defaultBranchRef?.name || 'main';
}
const TEMPLATES = ['.github/pull_request_template.md', '.github/PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md', 'docs/pull_request_template.md'];
function template(cwd: string) {
  for (const f of TEMPLATES)
    try {
      return fs.readFileSync(path.join(cwd, f), 'utf8').slice(0, 4000);
    } catch {}
  return '';
}

const ASK = `Write a pull request title and description for the branch below.
- First line: the title, under 70 characters, saying what the change does. No period.
- Then a blank line, then the description: what changed and why, short, in plain markdown. If a template is given, fill it in.
- Reply with the title and description only.

`;

const ROUTES: Routes = {
  'GET /api/gh/where': async (_b, _q, root: string | null) => {
    const state = await ghState();
    if (!root) return { gh: state, repo: null };
    try {
      const t = await target(root);
      return { gh: state, ...t, login: state === 'in' ? await login(root) : '' };
    } catch (e) {
      return { gh: state, repo: null, why: (e as Error).message };
    }
  },
  'GET /api/gh/prs': async (_b, q, root: string | null) => {
    const cwd = inRepo(root);
    await ready();
    const t = await target(cwd), show = q!.get('show') || 'open', k = `${t.repo}|${show}`;
    if (!['open', 'mine', 'review'].includes(show)) throw new HttpError(400, 'Show open, mine or review.');
    const kept = listed.get(k);
    if (kept && q!.get('fresh') !== '1' && Date.now() - kept.at < 60e3) return { list: kept.list, repo: t.repo, text: kept.list.map((p) => `#${p.n} ${p.title}`).join('\n') };
    const extra = show === 'mine' ? ['--author', '@me'] : show === 'review' ? ['--search', 'review-requested:@me'] : [];
    const list = ((await ghJson(cwd, ['pr', 'list', '-R', t.repo, '--state', 'open', '--limit', '60', '--json', LIST, ...extra])) || []).map(rowOf);
    listed.set(k, { at: Date.now(), list });
    const text = list.map((p: any) => `#${p.n} ${p.title} · ${p.author} · ${p.head} → ${p.base}${p.draft ? ' · draft' : ''}${p.review ? ' · ' + p.review : ''}${p.checks !== 'none' ? ' · checks ' + p.checks : ''}`).join('\n') || 'no open pull requests';
    return { list, repo: t.repo, text };
  },
  'GET /api/gh/pr': async (_b, q, root: string | null) => {
    const cwd = inRepo(root);
    await ready();
    const which = q!.get('n') ? String(num(q!.get('n'))) : String(q!.get('branch') || '').trim();
    if (!which || which.startsWith('-')) throw new HttpError(400, 'Name a pull request or a branch.');
    const p = await view(cwd, which);
    if (q!.get('branch') && p.state !== 'open') throw new HttpError(404, 'No open pull request for that branch.');
    const text = [`#${p.n} ${p.title} (${p.state}${p.draft ? ', draft' : ''})`, `${p.author} · ${p.head} → ${p.base} · ${plural(p.nfiles, 'file')} +${p.adds} -${p.dels}`, p.review ? `review: ${p.review}` : '', p.checks.length ? `checks: ${p.roll} (${p.checks.map((c) => `${c.name} ${c.state}`).join(', ')})` : '', p.merge.why.length ? `can't merge: ${p.merge.why.join('; ')}` : p.state === 'open' ? 'can merge' : '', '', p.body].filter((l, i) => l || i === 5).join('\n');
    return { ...p, text };
  },
  'GET /api/gh/pr/files': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), n = num(q!.get('n'));
    await ready();
    const { fork, tip } = await fetchPr(cwd, n);
    const files = await filesOf(cwd, fork, tip);
    return { files, fork, tip, text: files.map((f) => `${f.x} ${f.path}`).join('\n') };
  },
  'GET /api/gh/pr/file': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), n = num(q!.get('n')), rel = String(q!.get('path') || ''), from = q!.get('from') || rel;
    if (!rel || rel.startsWith('-') || path.isAbsolute(rel) || rel.split('/').includes('..')) throw new HttpError(400, 'Name a file of the pull request.');
    const tip = `refs/amethyst/pr/${n}`;
    const fork = (await git(cwd, ['merge-base', `refs/amethyst/pr-base/${n}`, tip])).out.trim();
    if (!fork) throw new HttpError(409, 'Open the pull request’s files first.');
    return bothSides(cwd, fork, tip, rel, from);
  },
  'POST /api/gh/pr/message': async ({ base, head, agent, model }, _q, root: string | null) => {
    const cwd = inRepo(root), t = await target(cwd), b = await baseName(cwd, t, base), branch = String(head || '') || (await branchOf(cwd));
    if (!branch) throw new HttpError(409, 'Not on a branch.');
    const from = (await git(cwd, ['rev-parse', '--verify', '-q', `${t.remote}/${b}`])).out.trim() ? `${t.remote}/${b}` : b;
    const log = (await git(cwd, ['log', '--format=- %s%n%b', `${from}..${branch}`, '-n', '60'])).out.slice(0, 8000);
    const stat = (await git(cwd, ['diff', '--stat', `${from}...${branch}`])).out.slice(0, 4000);
    const diff = (await git(cwd, ['diff', '--no-color', `${from}...${branch}`], { timeout: 30e3 })).out.slice(0, 20000);
    const tpl = template(cwd), issue = issueOf(branch);
    const text = `${ASK}Branch ${branch} into ${b}.${issue ? ` It works on issue #${issue}: end the description with "Fixes #${issue}".` : ''}\n\nCommits:\n${log}\n\nFiles:\n${stat}\n${tpl ? `\nTemplate:\n${tpl}\n` : ''}\nDiff:\n${diff}`;
    const out = await hands.ask(text, { system: 'You write clear, short pull request descriptions.', agent, model, clean: (s) => s.replace(/^\s*```\w*\n?|\n?```\s*$/g, '').trim() });
    const [title, ...rest] = out.split('\n');
    return { title: title.replace(/^#+\s*|^title:\s*/i, '').trim(), body: rest.join('\n').trim(), text: out };
  },
  'POST /api/gh/pr': async ({ title, body, base, draft, head, reviewers, labels }, _q, root: string | null) => {
    const cwd = inRepo(root);
    await ready();
    const t = await target(cwd), b = await baseName(cwd, t, base);
    const branch = String(head || '').trim() || (await branchOf(cwd));
    if (!branch || branch.startsWith('-')) throw new HttpError(409, 'Not on a branch: switch to the one the pull request is for.');
    if (branch === b) throw new HttpError(409, `${branch} is the base itself: make a branch for the change first.`);
    const tt = String(title ?? '').trim();
    if (!tt) throw new HttpError(400, 'Give it a title.');
    const origin = (await git(cwd, ['config', '--get', `branch.${branch}.remote`])).out.trim() || 'origin';
    const ahead = (await git(cwd, ['rev-list', '--count', `${origin}/${branch}..${branch}`])).out.trim();
    if (ahead !== '0') must(await gitLong(cwd, ['push', '--progress', '-u', origin, `${branch}:refs/heads/${branch}`], { what: 'pushing' }));
    const issue = issueOf(branch);
    let text = String(body ?? '').trim();
    if (issue && !new RegExp(`#${issue}\\b`).test(text)) text = `${text}${text ? '\n\n' : ''}Fixes #${issue}`;
    const out = await ghRun(cwd, ['pr', 'create', '-R', t.repo, '--title', tt, '--body', text, '--base', b, '--head', t.fork ? `${t.own}:${branch}` : branch, ...(draft ? ['--draft'] : []), ...listArg('--reviewer', reviewers), ...listArg('--label', labels)], 120e3);
    const url = out.trim().split(/\s+/).find((w) => /\/pull\/\d+/.test(w)) || '';
    const n = Number(/\/pull\/(\d+)/.exec(url)?.[1]) || 0;
    listed.clear();
    return said(`opened #${n}${draft ? ' as a draft' : ''}: ${tt}`, { n, url });
  },
  'POST /api/gh/pr/comment': async ({ n, body }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd), text = String(body ?? '').trim();
    if (!text) throw new HttpError(400, 'Write the comment first.');
    await ready();
    await ghRun(cwd, ['pr', 'comment', String(k), '-R', t.repo, '--body', text]);
    return said(`commented on #${k}`);
  },
  'POST /api/gh/pr/merge': async (body, _q, root: string | null) => {
    const { n, how, auto } = body, deleteBranch = body.deleteBranch ?? body['delete-branch'];
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    if (!['squash', 'merge', 'rebase'].includes(String(how))) throw new HttpError(400, 'Squash, merge or rebase.');
    await ready();
    const info = await repoInfo(cwd, t);
    const allowed = { squash: info.squashMergeAllowed, merge: info.mergeCommitAllowed, rebase: info.rebaseMergeAllowed } as Record<string, boolean>;
    if (!allowed[String(how)]) throw new HttpError(409, `${t.repo} does not allow a ${how} merge.`);
    await ghRun(cwd, ['pr', 'merge', String(k), '-R', t.repo, `--${how}`, ...(deleteBranch ? ['--delete-branch'] : []), ...(auto ? ['--auto'] : [])], 120e3);
    listed.clear();
    return said(auto ? `#${k} merges by itself once it can` : `merged #${k}${deleteBranch ? ' and deleted its branch' : ''}`);
  },
  'POST /api/gh/pr/ready': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    await ready();
    await ghRun(cwd, ['pr', 'ready', String(k), '-R', t.repo]);
    listed.clear();
    return said(`#${k} is ready for review`);
  },
  'POST /api/gh/pr/close': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    await ready();
    await ghRun(cwd, ['pr', 'close', String(k), '-R', t.repo]);
    listed.clear();
    return said(`closed #${k}`);
  },
  'POST /api/gh/pr/update': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    await ready();
    await ghRun(cwd, ['pr', 'update-branch', String(k), '-R', t.repo], 120e3);
    return said(`#${k} has its base brought in`);
  },
  'POST /api/gh/pr/show': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n);
    if (!hands.show(cwd, { what: 'pr', n: k })) throw new HttpError(409, 'No Amethyst window shows this project: open it, then try again.');
    return said(`shown in Amethyst: #${k}`);
  },
  'POST /api/gh/pr/checkout': async (body, _q, root: string | null) => {
    const { n, worktree } = body;
    const cwd = inRepo(root), k = num(n), t = await target(cwd);
    await ready();
    if (!free(body)) {
      must(await gitLong(cwd, ['fetch', '--quiet', t.remote, `refs/pull/${k}/head`], { what: 'fetching the pull request' }));
      await keepOut(body, cwd, 'HEAD', must(await git(cwd, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'])).trim());
    }
    if (worktree) {
      const b = await nameFor('pr', cwd, { n: k });
      must(await gitLong(cwd, ['fetch', '--quiet', t.remote, `+refs/pull/${k}/head:refs/heads/${b}`], { what: 'fetching the pull request' }));
      const w = await branchWorktree(cwd, b);
      return said(`#${k} is open in its own folder: ${w.path}`, w);
    }
    await ghRun(cwd, ['pr', 'checkout', String(k), '-R', t.repo], 120e3);
    return said(`on #${k}'s branch now`);
  },
};

export { ROUTES, hands, target, ready, ghRun, ghJson, gh, num, said, inRepo, login, listed, repoInfo, branchOf, threadsOf, names, listArg };
export type { Target };
