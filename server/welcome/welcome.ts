import fs from 'fs';
import os from 'os';
import path from 'path';
import { HttpError } from '../base/routes.ts';
import { MAX_PATHS } from '../../public/base/files.ts';
import { network, within } from '../base/live.ts';
import { claudeDirs, codexDir } from '../base/agentdirs.ts';
import { folders as agyFolders } from '../base/agystore.ts';
import { folders as copilotFolders } from '../base/copilotstore.ts';
import { folders as grokFolders } from '../base/grokstore.ts';
import type { Routes } from '../../public/base/types.ts';
import { isDir, WIN } from '../base/util.ts';

type Found = { path: string; agents: string[]; last: number };
type Deps = {
  welcomed: () => boolean;
  setWelcomed: (on: boolean) => Promise<void>;
  known: () => Promise<string[]>;
  skip: () => string[];
  addProject: (dir: string, wid?: string | null) => Promise<unknown>;
};

const CODEX_FILES = 500;
const HEAD = 64 * 1024;
const LISTED = 60;
const key = (p: string) => (WIN ? p.toLowerCase() : p);
let deps: Deps;

export const init = (d: Deps) => (deps = d);

async function cwdIn(file: string) {
  let fh: fs.promises.FileHandle | null = null;
  try {
    fh = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(HEAD);
    const { bytesRead } = await fh.read(buf, 0, HEAD, 0);
    const m = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(buf.toString('utf8', 0, bytesRead));
    return m ? String(JSON.parse(m[1])) : '';
  } catch {
    return '';
  } finally {
    await fh?.close();
  }
}

const mtimeOf = (f: string) => fs.promises.stat(f).then((s) => s.mtimeMs, () => 0);

async function claudeFound(add: (p: string, agent: string, last: number) => void) {
  const seen = new Set<string>();
  for (const dir of claudeDirs()) {
    const projects = path.join(dir, 'projects');
    const real = await fs.promises.realpath(projects).catch(() => '');
    if (!real || seen.has(key(real))) continue;
    seen.add(key(real));
    for (const d of await fs.promises.readdir(real, { withFileTypes: true }).catch(() => [])) {
      if (!d.isDirectory()) continue;
      const sub = path.join(real, d.name);
      const files = (await fs.promises.readdir(sub).catch(() => [])).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(sub, f));
      const times = await Promise.all(files.map(mtimeOf));
      const order = files.map((f, i) => [f, times[i]] as const).sort((a, b) => b[1] - a[1]);
      for (const [f, t] of order.slice(0, 3)) {
        const cwd = await cwdIn(f);
        if (cwd) {
          add(cwd, 'claude', t);
          break;
        }
      }
    }
  }
}

async function codexFound(add: (p: string, agent: string, last: number) => void) {
  const files: string[] = [];
  const walk = async (dir: string, depth: number) => {
    const names = (await fs.promises.readdir(dir).catch(() => [])).sort().reverse();
    for (const n of names) {
      if (files.length >= CODEX_FILES) return;
      const p = path.join(dir, n);
      if (depth < 3) await walk(p, depth + 1);
      else if (n.endsWith('.jsonl')) files.push(p);
    }
  };
  await walk(path.join(codexDir(), 'sessions'), 0);
  for (const f of files) {
    const cwd = await cwdIn(f);
    if (cwd) add(cwd, 'codex', await mtimeOf(f));
  }
}

async function agyFound(add: (p: string, agent: string, last: number) => void) {
  for (const [p, last] of await agyFolders().catch(() => new Map<string, number>())) add(p, 'antigravity', last);
}

async function copilotFound(add: (p: string, agent: string, last: number) => void) {
  for (const [p, last] of await copilotFolders().catch(() => new Map<string, number>())) add(p, 'copilot', last);
}

async function grokFound(add: (p: string, agent: string, last: number) => void) {
  for (const [p, last] of await grokFolders().catch(() => new Map<string, number>())) add(p, 'grok', last);
}

const isWorktree = (p: string) => fs.promises.stat(path.join(p, '.git')).then((s) => s.isFile(), () => false);

export async function found() {
  const all = new Map<string, Found>();
  const add = (p: string, agent: string, last: number) => {
    if (!path.isAbsolute(p) || network(p)) return;
    const abs = path.resolve(p).replace(/^[a-z]:/, (d) => d.toUpperCase()), k = key(abs), f = all.get(k) || { path: abs, agents: [], last: 0 };
    if (!f.agents.includes(agent)) f.agents.push(agent);
    f.last = Math.max(f.last, last);
    all.set(k, f);
  };
  await Promise.all([claudeFound(add), codexFound(add), agyFound(add), copilotFound(add), grokFound(add)]);
  const home = path.resolve(os.homedir()), skip = [os.tmpdir(), ...deps.skip()].map((p) => path.resolve(p));
  const known = (await deps.known()).map((p) => path.resolve(p));
  let list = [...all.values()].filter((f) => key(f.path) !== key(home) && path.dirname(f.path) !== f.path && !skip.some((s) => within(f.path, s)));
  list = list.filter((f) => !list.some((o) => o !== f && within(f.path, o.path) && key(o.path) !== key(f.path)));
  const ok = await Promise.all(list.map(async (f) => (await isDir(f.path)) && !(await isWorktree(f.path))));
  list = list.filter((_, i) => ok[i]).sort((a, b) => b.last - a.last);
  const here = (f: Found) => known.some((k) => within(f.path, k) || within(k, f.path));
  const fresh = list.filter((f) => !here(f));
  return { projects: fresh.slice(0, LISTED), more: Math.max(0, fresh.length - LISTED), already: list.length - fresh.length };
}

export const ROUTES: Routes = {
  'GET /api/welcome': async (_b, q) => (q?.get('status') ? { welcomed: deps.welcomed() } : { welcomed: deps.welcomed(), ...(await found()) }),
  'PUT /api/welcome': async ({ welcomed }) => {
    await deps.setWelcomed(welcomed !== false);
    return { welcomed: deps.welcomed() };
  },
  'POST /api/welcome/import': async ({ paths, workspace }) => {
    if (!Array.isArray(paths) || !paths.length) throw new HttpError(400, 'paths: a list of folders');
    if (paths.length > MAX_PATHS) throw new HttpError(400, `at most ${MAX_PATHS} folders at once`);
    const added: string[] = [], failed: { path: string; error: string }[] = [];
    for (const p of paths) {
      if (typeof p !== 'string' || !path.isAbsolute(p) || network(p)) {
        failed.push({ path: String(p), error: 'give the full folder path' });
        continue;
      }
      if (!(await isDir(p))) {
        failed.push({ path: p, error: 'folder not found' });
        continue;
      }
      try {
        await deps.addProject(path.resolve(p), typeof workspace === 'string' ? workspace : null);
        added.push(path.resolve(p));
      } catch (e) {
        failed.push({ path: p, error: (e as Error).message });
      }
    }
    return { added, failed };
  },
};
