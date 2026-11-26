import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { WIN } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';
import os from 'os';
import { git, gitLong, must, placeOf, forgetPlace } from '../base/gitcli.ts';
import { hasGit, repoDir } from '../base/gitdiff.ts';
import { gh, ghState, ghForget } from '../base/ghcli.ts';
import { worktreesOf, removeWorktree } from '../base/worktrees.ts';
import { hands, inRepo, said, but, relArg, leaveOut, remoteOf, remotes, status, repoStatus, forget, forgetLocks, done, lfsOf } from './status.ts';
import { push } from './sync.ts';
import { free, keepOut } from '../base/agentfiles.ts';

const MAX_BELOW = 300;
const SKIP = new Set(['node_modules', '.git']);
type Repo = { path: string; name: string; kind: 'own' | 'sub' | 'below' };

async function reposOf(root: string): Promise<Repo[]> {
  const list: Repo[] = [];
  const own = await placeOf(root).catch(() => null);
  if (own) list.push({ path: '', name: path.basename(own.top), kind: 'own' });
  const seen = new Set<string>();
  if (own && !own.prefix) {
    let text = '';
    try {
      text = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
    } catch {}
    for (const m of text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) {
      const p = m[1].replace(/\\/g, '/').replace(/\/+$/, '');
      if (!p || p.startsWith('..') || path.isAbsolute(p) || seen.has(p) || !hasGit(path.join(root, p))) continue;
      seen.add(p);
      list.push({ path: p, name: p, kind: 'sub' });
    }
  }
  let dirs: fs.Dirent[] = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !SKIP.has(d.name)).slice(0, MAX_BELOW);
  } catch {}
  for (const d of dirs) if (!seen.has(d.name) && hasGit(path.join(root, d.name))) list.push({ path: d.name, name: d.name, kind: 'below' });
  return list;
}

async function withWho(cwd: string, st: any) {
  const who = await hands.touchedIn(cwd).catch(() => []);
  if (!who.length) return st;
  const by = new Map<string, string[]>();
  for (const c of who) for (const p of c.files) by.set(p, [...(by.get(p) || []), c.id]);
  const under = (f: any) => (f.dir ? who.filter((c) => c.files.some((p) => p.startsWith(f.path))).map((c) => c.id) : by.get(f.path));
  return { ...st, chats: who.map(({ id, title, working }) => ({ id, title, working })), files: st.files.map((f: any) => (under(f)?.length ? { ...f, by: under(f) } : f)) };
}

function openTerminal(title: string, cmd: string) {
  try {
    if (WIN) spawn('cmd.exe', ['/c', `start "${title}" cmd /k ${cmd}`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
    else if (process.platform === 'darwin') spawn('osascript', ['-e', `tell application "Terminal" to do script "${cmd}"`], { detached: true, stdio: 'ignore' }).unref();
    else spawn('x-terminal-emulator', ['-e', cmd], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

const ROUTES: Routes = {
  'GET /api/git/repos': async (_b, _q, root: string | null) => {
    const list = root ? await reposOf(root) : [];
    return { list, text: list.map((r) => `${r.path || '.'}  ${r.kind}`).join('\n') || 'no repository in this project' };
  },
  'GET /api/git/worktrees': async (_b, _q, root: string | null) => {
    if (!root) return { list: [], repo: false };
    try {
      const w = await worktreesOf(root);
      return w ? { ...w, repo: true } : { list: [], repo: false };
    } catch (e) {
      if ((e as HttpError).status === 424) return { list: [], repo: false, why: (e as Error).message };
      throw e;
    }
  },
  'POST /api/git/worktree/remove': async ({ path: dir }, _q, root: string | null) => {
    const cwd = inRepo(root);
    const r = await removeWorktree(cwd, dir, (w) => hands.napIn(w.path));
    forget(cwd);
    const line = `removed ${path.basename(r.path)}${r.kept ? ` · ${r.kept} kept (not merged)` : ''}`;
    return { ...r, line, ...(r.held.length ? { error: `Windows still holds ${r.held.join(', ')} in ${r.path} (a program started there?). Amethyst removes what's left once it's free.` } : {}) };
  },
  'GET /api/git': async (_b, q, root: string | null) => {
    if (!root) return { available: true, git: true, repo: false, project: false };
    try {
      const st = await status(root, { fetch: q!.get('fetch') === '1' });
      return st.repo ? await withWho(root, st) : { ...st, below: (await reposOf(root)).length };
    } catch (e) {
      if ((e as HttpError).status === 424) return { available: true, git: false, repo: false, why: (e as Error).message };
      throw e;
    }
  },
  'GET /api/git/status': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root), st = await withWho(cwd, await repoStatus(cwd));
    const name = new Map<string, string>((st.chats || []).map((c: any) => [c.id, c.title || 'a chat']));
    const head = [
      `${st.branch}${st.detached ? ' (no branch)' : ''}${st.upstream ? ` → ${st.upstream}` : st.remote ? ' (not on the remote yet)' : ' (no remote)'}`,
      st.ahead || st.behind ? `↑${st.ahead} ↓${st.behind}` : '',
      st.state ? `${st.state} under way${st.steps ? ` (${st.step} of ${st.steps})` : ''}` : '',
      st.staged ? `${st.staged} staged` : '',
      st.lfs === 'missing' ? 'uses Git LFS, which is not installed' : '',
    ].filter(Boolean).join(' · ');
    const notes = (f: any) =>
      [
        f.staged ? (f.staged === 'part' ? 'partly staged' : 'staged') : '',
        f.dir ? `a new folder of ${f.n} files` : '',
        f.sub ? 'a repository of its own' : '',
        f.eol ? 'line endings only' : '',
        f.lock ? `locked by ${f.lock}` : '',
        f.by?.length ? `changed by ${f.by.map((id: string) => name.get(id)).join(', ')}` : '',
      ].filter(Boolean);
    const rows = st.files.map((f: any) => `${f.x} ${f.from ? f.from + ' → ' : ''}${f.path}${notes(f).length ? ` (${notes(f).join(', ')})` : ''}`);
    const working = (st.chats || []).filter((c: any) => c.working).map((c: any) => c.title || 'a chat');
    return { ...st, text: [head, working.length ? `at work here: ${working.join(', ')}` : '', rows.length ? `${st.total} changed:` : 'no changes', ...rows, st.more ? `… and ${st.more} more` : ''].filter(Boolean).join('\n') };
  },
  'POST /api/git/init': async (_b, _q, root: string | null) => {
    const cwd = inRepo(root);
    if (await placeOf(cwd)) throw new HttpError(409, 'This project is in git already.');
    const below = await reposOf(cwd);
    if (below.length) throw new HttpError(409, `There ${below.length === 1 ? 'is a repository' : 'are repositories'} inside this project already (${below.map((r) => r.name).slice(0, 3).join(', ')}): starting git here would wrap ${below.length === 1 ? 'it' : 'them'} in another one.`);
    must(await git(cwd, ['init', '-b', 'main']));
    forgetPlace(cwd);
    const ignore = path.join(cwd, '.gitignore');
    if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '# what git leaves out (made by Amethyst)\n.env\n.env.*\n!.env.example\n.amethyst/\nnode_modules/\n.DS_Store\nThumbs.db\ndesktop.ini\n');
    const st = await status(cwd);
    const skip = st.files.filter((f: any) => f.secret).map((f: any) => f.path);
    forget(cwd);
    must(await git(cwd, ['add', '-A', '--', '.', ...leaveOut(cwd, skip)]));
    must(await gitLong(cwd, ['commit', '-q', '-m', 'First commit', '--', '.', ...leaveOut(cwd, skip)], { what: 'committing', idle: 10 * 60e3 }));
    return done(cwd, said(`git started · first commit of ${st.files.length - skip.length} files`));
  },
  'POST /api/git/connect': async ({ name, private: priv, url }, _q, root: string | null) => {
    const cwd = inRepo(root), st = await repoStatus(cwd);
    if (!st.commits) throw new HttpError(409, 'Make a first commit, then put it on GitHub.');
    if (url != null && String(url).trim()) {
      const u = String(url).trim();
      if (!/^(https:\/\/[^\s]+|(ssh:\/\/)?[\w.-]+@[\w.-]+[:/][^\s]+)$/i.test(u) || u.length > 500) throw new HttpError(400, 'That does not look like a repository address (https://github.com/you/repo).');
      const has = (await remotes(cwd)).some((x) => x.name === 'origin');
      forget(cwd);
      must(await git(cwd, ['remote', has ? 'set-url' : 'add', 'origin', u]));
      try {
        await push(cwd, await status(cwd));
        return said(`connected · pushed to ${remoteOf('origin', u).label}`);
      } catch (e) {
        return but(`Connected, but the push failed: ${(e as Error).message}`);
      } finally {
        forget(cwd);
      }
    }
    if (st.remote) throw new HttpError(409, `This project is connected already (${st.remote.label}).`);
    const state = await ghState();
    if (state === 'offline') throw new HttpError(503, "Can't reach GitHub right now: check the connection, then try again.");
    if (state !== 'in') throw new HttpError(state === 'none' ? 424 : 401, state === 'none' ? 'Making a repository needs the GitHub CLI: cli.github.com (or paste the address of one).' : 'Sign in to GitHub first.');
    const n = String(name ?? '').trim();
    if (!/^([\w.-]{1,39}\/)?[\w.-]{1,100}$/.test(n)) throw new HttpError(400, 'A repository name has only letters, numbers, - _ and . (owner/name for an organization).');
    const place = await placeOf(cwd);
    forget(cwd);
    must(await gh(cwd, ['repo', 'create', n, priv === false ? '--public' : '--private', '--source', place!.top, '--remote', 'origin', '--push'], { timeout: 5 * 60e3 }), 'gh');
    const now = await status(done(cwd, cwd));
    return said(`on GitHub · ${now.remote?.label || n}`);
  },
  'POST /api/git/lock': async ({ path: p, do: what }, _q, root: string | null) => {
    const cwd = inRepo(root), rel = relArg(cwd, p), place = await placeOf(cwd);
    if (!place) throw new HttpError(409, 'This project is not in git yet.');
    if (what !== 'lock' && what !== 'unlock') throw new HttpError(400, 'Lock or unlock.');
    forgetLocks(place.top);
    forget(cwd);
    must(await git(cwd, ['lfs', what, rel], { timeout: 60e3 }));
    return said(what === 'lock' ? `${rel} is locked: only you can push it` : `${rel} is unlocked`);
  },
  'GET /api/git/identity': async (_b, _q, root: string | null) => {
    const at = root || process.cwd(), get = async (k: string) => (await git(at, ['config', '--get', k])).out.trim();
    const now = { name: await get('user.name'), email: await get('user.email') };
    let suggest: { name: string; email: string } | null = null;
    if ((!now.name || !now.email) && (await ghState()) === 'in') {
      const r = await gh(at, ['api', 'user', '--jq', '[.name // .login, .id, .login] | @tsv'], { timeout: 15e3 });
      const [name, id, login] = r.out.trim().split('\t');
      if (!r.code && login) suggest = { name: name || login, email: `${id}+${login}@users.noreply.github.com` };
    }
    return { ...now, suggest, text: now.name && now.email ? `${now.name} <${now.email}>` : 'git has no name and email yet' };
  },
  'POST /api/git/identity': async ({ name, email, global: everywhere }, _q, root: string | null) => {
    const n = String(name ?? '').trim(), e = String(email ?? '').trim();
    if (!n || n.length > 200) throw new HttpError(400, 'Write the name that goes into your commits.');
    if (!/^[^\s@<>]+@[^\s@<>]+$/.test(e) || e.length > 200) throw new HttpError(400, 'That does not look like an email address.');
    if (everywhere === false && !root) throw new HttpError(400, 'For this repository only, open it first.');
    const at = everywhere === false ? root! : root || process.cwd(), scope = everywhere === false ? [] : ['--global'];
    must(await git(at, ['config', ...scope, 'user.name', n]));
    must(await git(at, ['config', ...scope, 'user.email', e]));
    if (root) forget(root);
    return said(`commits are signed ${n} <${e}>${everywhere === false ? ' in this repository' : ''}`);
  },
  'GET /api/gh/repos': async () => {
    const state = await ghState();
    if (state !== 'in') throw new HttpError(state === 'none' ? 424 : state === 'offline' ? 503 : 401, state === 'none' ? 'Your GitHub repositories are listed through the GitHub CLI: cli.github.com' : state === 'offline' ? "Can't reach GitHub right now." : 'Sign in to GitHub first.');
    const r = await gh(process.cwd(), ['api', 'user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member', '--jq', '.[] | [.full_name, .private, .updated_at, (.description // "")] | @tsv'], { timeout: 30e3 });
    must(r, 'gh');
    const list = r.out.split(/\r?\n/).filter(Boolean).map((l) => {
      const [name, priv, at, desc] = l.split('\t');
      return { name, private: priv === 'true', at: Date.parse(at) || 0, desc };
    });
    return { list, text: list.map((x) => `${x.name}${x.private ? ' (private)' : ''}`).join('\n') || 'no repositories' };
  },
  'POST /api/git/clone': async (body, _q, _at, pid) => {
    const { url, into, name, add, cwd: from, by, key } = body;
    let u = String(url ?? '').trim();
    if (/^[\w.-]{1,39}\/[\w.-]{1,100}$/.test(u)) u = `https://github.com/${u}.git`;
    if (!/^(https:\/\/[^\s]+|(ssh:\/\/)?[\w.-]+@[\w.-]+[:/][^\s]+|file:\/\/[^\s]+|[a-z]:[\\/][^\n]+|\/[^\n]+)$/i.test(u) || u.length > 500 || u.startsWith('-')) throw new HttpError(400, 'That does not look like a repository address (https://github.com/owner/repo, or owner/repo).');
    const own = remoteOf('origin', u).label.split('/').pop()!.replace(/\.git$/i, '') || 'repository';
    const base = typeof from === 'string' && path.isAbsolute(from) ? from : path.join(os.homedir(), 'Documents');
    const dir = path.resolve(base, String(into ?? '').trim() || own);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new HttpError(409, `${dir} is there already and not empty: pick another folder.`);
    const had = fs.existsSync(dir), look = !free(body);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const r = await gitLong(path.dirname(dir), ['clone', '--progress', look ? '--no-checkout' : '--recurse-submodules', '--', u, dir], { what: 'cloning', key: dir, idle: 5 * 60e3 });
    must(r);
    if (look) {
      try {
        await keepOut(body, dir, '', 'HEAD');
      } catch (e) {
        if (had) for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true, maxRetries: 3 });
        else fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        throw e;
      }
      if (!(await git(dir, ['rev-parse', '--verify', '-q', 'HEAD'])).code) must(await gitLong(dir, ['checkout', '--progress'], { what: 'checking out', key: dir, idle: 5 * 60e3 }));
      if (fs.existsSync(path.join(dir, '.gitmodules'))) must(await gitLong(dir, ['submodule', 'update', '--init', '--recursive', '--progress'], { what: 'cloning the submodules', key: dir, idle: 5 * 60e3 }));
    }
    const lfs = (await lfsOf(dir)).lfs;
    let project = null, none = '';
    if (add !== false) {
      try {
        project = await hands.addProject(dir, String(name ?? '').trim() || undefined, { by, key, pid: typeof pid === 'string' ? pid : '', cwd: from });
        if (!project) none = ' · not added as a project: it was run outside a workspace; open a workspace in Amethyst and add the folder as a project there';
      } catch (e) {
        none = ` · not added as a project: ${(e as Error).message}; clone it beside the project, or add the folder as a project yourself`;
      }
    }
    const note = lfs === 'missing' ? ' · it uses Git LFS, which is not installed: its big files are only pointers until you install it (git-lfs.com) and run git lfs pull' : '';
    return said(`cloned into ${dir}${project ? ` · the project ${project.name}` : ''}${none}${note}`, { path: dir, project, lfs });
  },
  'POST /api/git/remote': async ({ do: what, name, url }, _q, root: string | null) => {
    const cwd = inRepo(root), n = String(name ?? '').trim(), u = String(url ?? '').trim();
    if (!/^[\w.-]{1,60}$/.test(n) || n.startsWith('-')) throw new HttpError(400, 'A remote name has only letters, numbers, - _ and . (origin, upstream).');
    if (what !== 'remove' && (!/^(https:\/\/[^\s]+|(ssh:\/\/)?[\w.-]+@[\w.-]+[:/][^\s]+|file:\/\/[^\s]+|[a-z]:[\\/][^\n]+|\/[^\n]+)$/i.test(u) || u.startsWith('-'))) throw new HttpError(400, 'That does not look like a repository address.');
    forget(cwd);
    if (what === 'remove') must(await git(cwd, ['remote', 'remove', n]));
    else if (what === 'set') must(await git(cwd, ['remote', 'set-url', n, u]));
    else must(await git(cwd, ['remote', 'add', n, u]));
    if (what === 'add') await git(cwd, ['fetch', '--quiet', n], { timeout: 120e3, quiet: true });
    forget(cwd);
    return said(what === 'remove' ? `removed the remote ${n}` : what === 'set' ? `${n} points to ${remoteOf(n, u).label}` : `added ${n} (${remoteOf(n, u).label}) and fetched it`);
  },
  'POST /api/git/login': async () => {
    if ((await ghState()) === 'none') throw new HttpError(424, 'Signing in here needs the GitHub CLI: cli.github.com');
    ghForget();
    const cmd = 'gh auth login --web --git-protocol https --hostname github.com';
    return { cmd, opened: openTerminal('Sign in to GitHub', cmd) };
  },
};

export { ROUTES, repoDir };
