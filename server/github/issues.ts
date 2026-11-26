import type { Routes } from '../../public/base/types.ts';
import { HttpError } from '../base/routes.ts';
import { git, gitLong, must } from '../base/gitcli.ts';
import { branchWorktree } from '../base/worktrees.ts';
import { nameFor } from '../base/branchnames.ts';
import { target, ready, ghRun, ghJson, gh, num, said, inRepo, login, repoInfo, names, listArg, hands } from './prs.ts';
import type { Target } from './prs.ts';

const LIST = 'number,title,labels,comments,author,updatedAt,state,assignees';
const VIEW = 'number,title,body,author,state,stateReason,labels,assignees,comments,createdAt,updatedAt,url,closedByPullRequestsReferences';
const kept = new Map<string, { at: number; list: any[] }>();
const forget = () => kept.clear();

const rowOf = (i: any) => ({ n: i.number, title: i.title, author: i.author?.login || '', state: String(i.state || '').toLowerCase(), labels: (i.labels || []).map((l: any) => ({ name: l.name, color: l.color || '' })), comments: Array.isArray(i.comments) ? i.comments.length : i.comments?.totalCount || 0, assignees: (i.assignees || []).map((a: any) => a.login), at: Date.parse(i.updatedAt) || 0 });

const branchOf = (cwd: string, n: number, title: string) => nameFor('issue', cwd, { n, title: String(title || '') });

async function defaultBranch(cwd: string, t: Target) {
  return (await repoInfo(cwd, t)).defaultBranchRef?.name || 'main';
}

async function makeBranch(cwd: string, t: Target, n: number, title: string) {
  const name = await branchOf(cwd, n, title);
  const base = await defaultBranch(cwd, t);
  if (!(await git(cwd, ['show-ref', '--verify', '-q', `refs/heads/${name}`])).code) return { name, linked: false, had: true };
  let linked = false;
  if (!t.fork) {
    const r = await gh(cwd, ['issue', 'develop', String(n), '-R', t.repo, '--name', name, '--base', base], { timeout: 60e3 });
    linked = !r.code;
  }
  must(await gitLong(cwd, ['fetch', '--quiet', t.remote, ...(linked ? [`+refs/heads/${name}:refs/remotes/${t.remote}/${name}`] : []), `+refs/heads/${base}:refs/remotes/${t.remote}/${base}`], { what: 'fetching' }));
  const from = linked ? `${t.remote}/${name}` : `${t.remote}/${base}`;
  must(await git(cwd, ['branch', ...(linked ? ['--track'] : ['--no-track']), name, from]));
  return { name, linked, had: false };
}

const ROUTES: Routes = {
  'GET /api/gh/issues': async (_b, q, root: string | null) => {
    const cwd = inRepo(root);
    await ready();
    const t = await target(cwd), show = q!.get('show') || 'open', search = String(q!.get('q') || '').trim().slice(0, 200);
    if (!['open', 'mine', 'closed'].includes(show)) throw new HttpError(400, 'Show open, mine or closed.');
    const k = `${t.repo}|${show}|${search}`, hit = kept.get(k);
    if (hit && q!.get('fresh') !== '1' && Date.now() - hit.at < 60e3) return { list: hit.list, repo: t.repo, text: hit.list.map((i) => `#${i.n} ${i.title}`).join('\n') };
    const args = ['issue', 'list', '-R', t.repo, '--limit', '60', '--json', LIST, '--state', show === 'closed' ? 'closed' : 'open', ...(show === 'mine' ? ['--assignee', '@me'] : []), ...(search ? ['--search', search] : [])];
    const list = ((await ghJson(cwd, args)) || []).map(rowOf);
    kept.set(k, { at: Date.now(), list });
    const text = list.map((i: any) => `#${i.n} ${i.title}${i.labels.length ? ' [' + i.labels.map((l: any) => l.name).join(', ') + ']' : ''} · ${i.author}${i.comments ? ` · ${i.comments} comments` : ''}`).join('\n') || 'no issues';
    return { list, repo: t.repo, text };
  },
  'GET /api/gh/issue': async (_b, q, root: string | null) => {
    const cwd = inRepo(root), n = num(q!.get('n'));
    await ready();
    const t = await target(cwd);
    const [i, me] = await Promise.all([ghJson(cwd, ['issue', 'view', String(n), '-R', t.repo, '--json', VIEW]), login(cwd)]);
    const out = {
      n: i.number,
      title: i.title,
      body: i.body || '',
      author: i.author?.login || '',
      state: String(i.state || '').toLowerCase(),
      reason: String(i.stateReason || '').toLowerCase().replace(/_/g, ' '),
      labels: (i.labels || []).map((l: any) => ({ name: l.name, color: l.color || '' })),
      assignees: (i.assignees || []).map((a: any) => a.login),
      mine: (i.assignees || []).some((a: any) => a.login === me),
      url: i.url,
      at: Date.parse(i.updatedAt) || 0,
      prs: (i.closedByPullRequestsReferences || []).map((p: any) => ({ n: p.number, title: p.title || '', url: p.url || '' })),
      talk: (i.comments || []).map((c: any) => ({ who: c.author?.login || '', at: Date.parse(c.createdAt) || 0, body: c.body || '' })),
      branch: await branchOf(cwd, i.number, i.title),
      repo: t.repo,
    };
    const text = [`#${out.n} ${out.title} (${out.state}${out.reason ? ', ' + out.reason : ''})`, `${out.author}${out.labels.length ? ' · ' + out.labels.map((l: any) => l.name).join(', ') : ''}${out.assignees.length ? ' · assigned: ' + out.assignees.join(', ') : ''}`, out.prs.length ? `pull requests: ${out.prs.map((p: any) => '#' + p.n).join(', ')}` : '', '', out.body, ...out.talk.map((c: any) => `\n${c.who}: ${c.body}`)].filter((l, k) => l || k === 3).join('\n');
    return { ...out, text };
  },
  'POST /api/gh/issue': async ({ title, body, labels, me }, _q, root: string | null) => {
    const cwd = inRepo(root), tt = String(title ?? '').trim();
    if (!tt) throw new HttpError(400, 'Give it a title.');
    await ready();
    const t = await target(cwd);
    const out = await ghRun(cwd, ['issue', 'create', '-R', t.repo, '--title', tt, '--body', String(body ?? ''), ...listArg('--label', labels), ...(me ? ['--assignee', '@me'] : [])], 120e3);
    const url = out.trim().split(/\s+/).find((w) => /\/issues\/\d+/.test(w)) || '';
    const n = Number(/\/issues\/(\d+)/.exec(url)?.[1]) || 0;
    forget();
    return said(`opened issue #${n}: ${tt}`, { n, url });
  },
  'POST /api/gh/issue/comment': async ({ n, body }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), text = String(body ?? '').trim();
    if (!text) throw new HttpError(400, 'Write the comment first.');
    await ready();
    const t = await target(cwd);
    await ghRun(cwd, ['issue', 'comment', String(k), '-R', t.repo, '--body', text]);
    return said(`commented on #${k}`);
  },
  'POST /api/gh/issue/close': async ({ n, reason }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), why = reason === 'not planned' || reason === 'not_planned' ? 'not planned' : 'completed';
    await ready();
    const t = await target(cwd);
    await ghRun(cwd, ['issue', 'close', String(k), '-R', t.repo, '--reason', why]);
    forget();
    return said(`closed #${k}${why === 'not planned' ? ' as not planned' : ''}`);
  },
  'POST /api/gh/issue/reopen': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n);
    await ready();
    const t = await target(cwd);
    await ghRun(cwd, ['issue', 'reopen', String(k), '-R', t.repo]);
    forget();
    return said(`#${k} is open again`);
  },
  'POST /api/gh/issue/edit': async (b, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(b.n);
    const args = [...listArg('--add-label', b.addLabels), ...listArg('--remove-label', b.removeLabels), ...listArg('--add-assignee', b.addAssignees), ...listArg('--remove-assignee', b.removeAssignees)];
    if (!args.length) throw new HttpError(400, 'Nothing to change.');
    await ready();
    const t = await target(cwd);
    await ghRun(cwd, ['issue', 'edit', String(k), '-R', t.repo, ...args]);
    forget();
    const who = names(b.addAssignees);
    return said(who.length ? `#${k} is assigned to ${who.join(', ').replace('@me', 'you')}` : `#${k} is changed`);
  },
  'POST /api/gh/issue/start': async ({ n, where }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n), place = String(where || 'here');
    if (!['here', 'folder'].includes(place)) throw new HttpError(400, 'Start here or in its own folder.');
    await ready();
    const t = await target(cwd);
    const i = await ghJson(cwd, ['issue', 'view', String(k), '-R', t.repo, '--json', 'title,state']);
    if (i.state !== 'OPEN') throw new HttpError(409, `#${k} is closed.`);
    const b = await makeBranch(cwd, t, k, i.title);
    const how = b.had ? 'already here' : b.linked ? 'made and linked to the issue on GitHub' : 'made here (not linked on GitHub)';
    if (place === 'folder') {
      const w = await branchWorktree(cwd, b.name);
      return said(`${b.name}: ${how} · open in its own folder: ${w.path}`, { branch: b.name, path: w.path, linked: b.linked, title: i.title });
    }
    must(await gitLong(cwd, ['switch', '--progress', b.name], { what: 'switching' }));
    return said(`on ${b.name}: ${how}`, { branch: b.name, linked: b.linked, title: i.title });
  },
  'POST /api/gh/issue/show': async ({ n }, _q, root: string | null) => {
    const cwd = inRepo(root), k = num(n);
    if (!hands.show(cwd, { what: 'issue', n: k })) throw new HttpError(409, 'No Amethyst window shows this project: open it, then try again.');
    return said(`shown in Amethyst: issue #${k}`);
  },
};

export { ROUTES };
