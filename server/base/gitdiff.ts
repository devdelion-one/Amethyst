import fs from 'fs';
import path from 'path';
import { HttpError } from './routes.ts';
import { git } from './gitcli.ts';

const MAX_TEXT = 2e6;
type Changed = { path: string; x: string; from?: string };

async function commitOf(cwd: string, ref: unknown) {
  const r = String(ref ?? '').trim();
  if (!r || r.startsWith('-') || r.length > 200) throw new HttpError(400, 'Name a commit, a branch or a tag.');
  const sha = (await git(cwd, ['rev-parse', '--verify', '-q', '--end-of-options', `${r}^{commit}`])).out.trim();
  if (!sha) throw new HttpError(404, `“${r}” is not a commit here.`);
  return sha;
}

async function filesOf(cwd: string, a: string | null, b: string): Promise<Changed[]> {
  const args = a ? ['diff', '--name-status', '-z', '-M', '--relative', a, b, '--', '.'] : ['show', '--name-status', '-z', '-M', '--relative', '--format=', b, '--', '.'];
  const parts = (await git(cwd, args, { timeout: 60e3 })).out.split('\0');
  const files: Changed[] = [];
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i];
    if (!s) continue;
    const x = s[0];
    if (x === 'R' || x === 'C') files.push({ x: 'R', from: parts[++i], path: parts[++i] });
    else files.push({ x: x === 'T' ? 'M' : x, path: parts[++i] });
  }
  return files.filter((f) => f.path);
}

async function textAt(cwd: string, at: string | null, rel: string, none = false): Promise<{ text?: string; binary?: boolean }> {
  if (none) return { text: '' };
  if (at === null) {
    try {
      const abs = path.join(cwd, rel);
      if (fs.statSync(abs).size > MAX_TEXT) return { binary: true };
      return { text: fs.readFileSync(abs, 'utf8') };
    } catch {
      return { text: '' };
    }
  }
  const r = await git(cwd, ['show', `${at}:./${rel}`], { timeout: 30e3 });
  if (r.code) return { text: '' };
  if (r.out.length > MAX_TEXT) return { binary: true };
  return { text: r.out };
}

async function bothSides(cwd: string, a: string | null, b: string | null, rel: string, from = rel) {
  const [x, y] = await Promise.all([textAt(cwd, a, from, !a), textAt(cwd, b, rel)]);
  if (x.binary || y.binary || x.text!.includes('\0') || y.text!.includes('\0')) return { path: rel, binary: true };
  return { path: rel, oldText: x.text!.replace(/\r\n/g, '\n'), newText: y.text!.replace(/\r\n/g, '\n') };
}

const hasGit = (dir: string) => fs.existsSync(path.join(dir, '.git'));
function repoDir(root: string, repo: unknown) {
  const s = String(repo ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!s) return root;
  const abs = path.resolve(root, s), r = path.relative(root, abs);
  if (path.isAbsolute(s) || !r || r.startsWith('..') || path.isAbsolute(r)) throw new HttpError(400, 'that repository is not in the project');
  if (!hasGit(abs)) throw new HttpError(404, `no repository at ${s}`);
  return abs;
}

export { commitOf, filesOf, textAt, bothSides, hasGit, repoDir };
export type { Changed };
