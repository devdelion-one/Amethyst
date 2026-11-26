import path from 'path';
import { configDir } from '../base/agentdirs.ts';
import { items } from '../base/accounts.ts';
import type { Account } from '../base/accounts.ts';

export type MemoryKind = 'global' | 'global-rule' | 'project' | 'project-local' | 'project-rule' | 'folder' | 'auto' | 'other';
export type MemoryFile = { path: string; tokens: number; kind: MemoryKind; name?: string; real: string; shared: boolean };

const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, '');
const key = (p: string) => (process.platform === 'win32' ? norm(p).toLowerCase() : norm(p));
const inside = (p: string, dir: string) => {
  const r = path.relative(key(dir), key(p));
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? path.relative(norm(dir), norm(p)).split(/[\\/]/) : null;
};
const ruleName = (parts: string[]) => parts.slice(1).join('/').replace(/\.md$/i, '');

export function memoryFile(file: string, tokens: number, root: string | null, acc: Account, main = configDir()): MemoryFile {
  const dir = acc.dir || main;
  const base = path.basename(file);
  let kind: MemoryKind = 'other', name: string | undefined, real = file, shared = false;
  const mine = inside(file, dir);
  if (mine) {
    const item = acc.dir ? items(acc).find((x) => x.name.toLowerCase() === mine[0].toLowerCase()) : null;
    if (item?.shared) (real = path.join(main, ...mine)), (shared = true);
  }
  const at = mine || inside(file, main);
  const proj = root ? inside(file, root) : null;
  if (/^memory\.md$/i.test(base) && /^memory$/i.test(path.basename(path.dirname(file)))) kind = 'auto';
  else if (at && at.length === 1 && /^claude\.md$/i.test(at[0])) kind = 'global';
  else if (at && /^rules$/i.test(at[0]) && at.length > 1) (kind = 'global-rule'), (name = ruleName(at));
  else if (proj) {
    const low = proj.map((x) => x.toLowerCase()).join('/');
    if (low === 'claude.md' || low === '.claude/claude.md') kind = 'project';
    else if (low === 'claude.local.md') kind = 'project-local';
    else if (low.startsWith('.claude/rules/')) (kind = 'project-rule'), (name = ruleName(proj.slice(1)));
    else if (/^claude(\.local)?\.md$/i.test(base)) (kind = 'folder'), (name = proj.slice(0, -1).filter((x) => x.toLowerCase() !== '.claude').join('/'));
  } else if (/^claude(\.local)?\.md$/i.test(base)) {
    const up = path.basename(path.dirname(file)).toLowerCase() === '.claude' ? path.dirname(path.dirname(file)) : path.dirname(file);
    (kind = 'folder'), (name = path.basename(up) || up);
  }
  return { path: file, tokens, kind, ...(name ? { name } : {}), real, shared };
}
