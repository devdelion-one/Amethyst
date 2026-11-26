import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { git } from './gitcli.ts';
import { HttpError } from './routes.ts';
import * as runs from './runs.ts';

type Body = Record<string, unknown> | null | undefined;
type Found = { files: string[]; unchecked: string[] };

const WHOLE = new Set(['.codex', '.grok']);
const AGENTS = new Set(['.agents', '.agent', '_agents', '_agent']);
const NAMES = ['.claude', '.mcp.json', '.codex', '.cursor', '.github', '.grok', ...AGENTS];
const SPECS = NAMES.flatMap((n) => [`:(glob,icase)**/${n}`, `:(glob,icase)**/${n}/**`]);
const DEPTH = 4;

export function listed(file: string) {
  const p = file.toLowerCase().split('/'), n = p.length, name = p[n - 1], dir = p[n - 2], up = p[n - 3];
  if (p.slice(0, -1).some((x) => WHOLE.has(x))) return true;
  if (p.slice(0, -2).some((x, i) => x === '.github' && p[i + 1] === 'hooks')) return true;
  if (name === '.mcp.json') return true;
  if (dir === '.claude') return name === 'settings.json' || name === 'settings.local.json';
  if (dir === '.cursor') return name === 'cli.json' || name === 'hooks.json';
  if (dir === '.github') return name === 'mcp.json';
  if (dir === 'copilot' && up === '.github') return name === 'settings.json' || name === 'settings.local.json';
  if (AGENTS.has(dir)) return name === 'hooks.json' || name === 'mcp_config.json' || name === 'plugins.json';
  return false;
}
const linked = (file: string) => {
  const name = file.toLowerCase().split('/').pop()!;
  return NAMES.includes(name) || name === 'hooks' || name === 'copilot' || listed(file);
};

const out = async (cwd: string, args: string[]) => {
  const r = await git(cwd, args, { timeout: 120e3 });
  return r.code ? null : r.out;
};
const commit = async (cwd: string, ref: string) => (await out(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`]))?.trim() || '';
const has = async (cwd: string, sha: string) => !!(await commit(cwd, sha));

async function changed(cwd: string, from: string, to: string) {
  const empty = (await git(cwd, ['hash-object', '-t', 'tree', '--stdin'], { input: '' })).out.trim();
  const raw = await out(cwd, ['diff-tree', '-r', '-z', '--no-renames', from || empty, to, '--', ...SPECS]);
  if (raw == null) return null;
  const parts = raw.split('\0'), files: string[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const [, , mode, , , what] = parts[i].split(/[: ]/);
    if (what === 'D') continue;
    if (mode === '120000' ? linked(parts[i + 1]) : listed(parts[i + 1])) files.push(parts[i + 1]);
  }
  return files;
}

function urlFrom(base: string, rel: string) {
  if (!/^\.\.?\//.test(rel)) return rel;
  let b = base.replace(/\\/g, '/').replace(/\/+$/, ''), r = rel;
  for (;;) {
    if (r.startsWith('./')) r = r.slice(2);
    else if (r.startsWith('../')) {
      r = r.slice(3);
      b = b.slice(0, Math.max(b.lastIndexOf('/'), b.lastIndexOf(':') + 1, 0)).replace(/\/+$/, '');
    } else break;
  }
  return b.endsWith(':') ? b + r : `${b}/${r}`;
}
async function remoteOf(cwd: string) {
  const branch = (await out(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']))?.trim();
  const name = (branch && (await out(cwd, ['config', '--get', `branch.${branch}.remote`]))?.trim()) || 'origin';
  return (await out(cwd, ['remote', 'get-url', name]))?.trim() || cwd;
}

async function subsOf(cwd: string, to: string) {
  const cfg = await out(cwd, ['config', '--blob', `${to}:.gitmodules`, '--get-regexp', '^submodule\\..*\\.(path|url)$']);
  if (!cfg) return [];
  const by = new Map<string, { path?: string; url?: string }>();
  for (const l of cfg.split(/\r?\n/).filter(Boolean)) {
    const m = /^submodule\.(.*)\.(path|url) (.*)$/.exec(l);
    if (!m) continue;
    const s = by.get(m[1]) || {};
    s[m[2] as 'path' | 'url'] = m[3];
    by.set(m[1], s);
  }
  const subs = [...by].filter(([, s]) => s.path).map(([name, s]) => ({ name, path: s.path!.replace(/\\/g, '/').replace(/\/+$/, ''), url: s.url || '', sha: '' }));
  if (!subs.length) return [];
  const tree = (await out(cwd, ['ls-tree', '-r', '-z', '--full-tree', to, '--', ...subs.map((s) => s.path)])) || '';
  for (const e of tree.split('\0').filter(Boolean)) {
    const [meta, p] = [e.slice(0, e.indexOf('\t')), e.slice(e.indexOf('\t') + 1)];
    const [mode, , sha] = meta.split(' ');
    const s = subs.find((x) => x.path === p);
    if (s && mode === '160000') s.sha = sha;
  }
  return subs.filter((s) => s.sha);
}

async function inTemp(url: string, sha: string, look: (dir: string) => Promise<Found | null>) {
  const dir = path.join(os.tmpdir(), `amethyst-look-${crypto.randomBytes(4).toString('hex')}`);
  try {
    const r = await git(os.tmpdir(), ['clone', '--bare', '--quiet', '--filter=blob:none', '--', url, dir], { timeout: 600e3, quiet: true });
    if (r.code) return null;
    if (!(await has(dir, sha))) await git(dir, ['fetch', '--quiet', '--filter=blob:none', 'origin', sha], { timeout: 600e3, quiet: true });
    if (!(await has(dir, sha))) return null;
    return await look(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

async function look(cwd: string, top: string | null, from: string, to: string, base: string, depth: number): Promise<Found | null> {
  const files = await changed(cwd, from, to);
  if (!files) return null;
  const found: Found = { files, unchecked: [] };
  if (depth >= DEPTH) return found;
  for (const s of await subsOf(cwd, to)) {
    const there = top ? path.join(top, s.path) : '';
    const here = !!there && fs.existsSync(path.join(there, '.git')) && !!(await commit(there, 'HEAD'));
    const was = here ? await commit(there, 'HEAD') : '';
    if (was === s.sha) continue;
    let got: Found | null = null;
    if (here) {
      if (!(await has(there, s.sha))) await git(there, ['fetch', '--quiet'], { timeout: 600e3, quiet: true });
      if (!(await has(there, s.sha))) await git(there, ['fetch', '--quiet', 'origin', s.sha], { timeout: 600e3, quiet: true });
      if (await has(there, s.sha)) got = await look(there, there, was, s.sha, await remoteOf(there), depth + 1);
    } else {
      const own = top ? (await out(cwd, ['config', '--get', `submodule.${s.name}.url`]))?.trim() : '';
      const url = own || urlFrom(base, s.url);
      if (url && !url.startsWith('-')) got = await inTemp(url, s.sha, (dir) => look(dir, null, '', s.sha, url, depth + 1));
    }
    if (!got) found.unchecked.push(s.path);
    else {
      found.files.push(...got.files.map((f) => `${s.path}/${f}`));
      found.unchecked.push(...got.unchecked.map((f) => `${s.path}/${f}`));
    }
  }
  return found;
}

export async function agentFiles(cwd: string, from: string, to: string, { since = false } = {}): Promise<Found> {
  const end = await commit(cwd, to);
  if (!end) return { files: [], unchecked: [] };
  let start = from ? await commit(cwd, from) : '';
  if (start && since) start = (await out(cwd, ['merge-base', start, end]))?.trim() || start;
  if (start === end) return { files: [], unchecked: [] };
  const top = (await out(cwd, ['rev-parse', '--show-toplevel']))?.trim() || null;
  return (await look(cwd, top && path.resolve(top), start, end, await remoteOf(cwd), 0)) || { files: [], unchecked: [cwd] };
}

const some = (list: string[]) => (list.length <= 3 ? list.join(', ').replace(/, ([^,]*)$/, ' and $1') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more files`);
const DO = `Do it from Amethyst's window, or turn on "chats answer other chats' permission asks".`;
export function refusal({ files, unchecked }: Found) {
  if (files.length) return `This would bring in ${some(files)}, which can let chats run commands without asking you. ${DO}`;
  if (unchecked.length) return `This would bring in ${unchecked.length === 1 ? 'the submodule' : 'the submodules'} ${some(unchecked)}, which Amethyst couldn't look into for an agent's settings or hooks. ${DO}`;
  return '';
}

export const free = (body: Body) => runs.free(body);

export async function keepOut(body: Body, cwd: string, from: string, to: string, how: { since?: boolean } = {}) {
  if (free(body)) return;
  const why = refusal(await agentFiles(cwd, from, to, how));
  if (why) throw new HttpError(403, why);
}
