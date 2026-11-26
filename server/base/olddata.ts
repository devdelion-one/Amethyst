import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './datadir.ts';
import { DOT } from './routes.ts';

const ITEMS = ['meta.json', 'scratch.json', 'scratch.md', 'hide.json', 'breakpoints.json', 'images', 'handoffs'];
const OBSOLETE = /^(prio\.json|.*\.tmp)$/i;
const WIN = process.platform === 'win32';
const same = (a: string, b: string) => (WIN ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));

function carry(from: string, to: string) {
  try {
    fs.renameSync(from, to);
  } catch (e: any) {
    if (e.code !== 'EXDEV') throw e;
    fs.cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
    fs.rmSync(from, { recursive: true, force: true });
  }
}

export function moveOne(dir: string, home: string) {
  const old = path.join(dir, DOT);
  if (same(dir, home) || !fs.existsSync(old)) return;
  const to = dataDir(dir), left: string[] = [];
  try {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(old)) {
      const from = path.join(old, name);
      if (OBSOLETE.test(name)) fs.rmSync(from, { recursive: true, force: true });
      else if (!ITEMS.includes(name)) left.push(`${name} (not Amethyst's)`);
      else if (fs.existsSync(path.join(to, name))) left.push(`${name} (already in ${to})`);
      else {
        try {
          carry(from, path.join(to, name));
        } catch (e) {
          left.push(`${name} (${(e as Error).message})`);
        }
      }
    }
    if (left.length) return void console.error(`moving ${old} to ${to}: kept ${left.join(', ')}`);
    fs.rmSync(old, { recursive: true, force: true });
    console.log(`moved ${old} to ${to}`);
  } catch (e) {
    console.error(`moving ${old} to ${to}: ${(e as Error).message}`);
  }
}

const read = (file: string) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const projectsIn = (meta: any): string[] => (Array.isArray(meta?.projects) ? meta.projects.map((p: any) => p?.path).filter((p: unknown) => typeof p === 'string') : []);

export function moveOldData(home: string) {
  const top = read(path.join(home, DOT, 'meta.json'));
  for (const p of projectsIn(top)) moveOne(p, home);
  for (const w of Array.isArray(top?.workspaces) ? top.workspaces : []) {
    if (typeof w?.path !== 'string' || !fs.existsSync(w.path)) continue;
    moveOne(w.path, home);
    for (const p of projectsIn(read(path.join(dataDir(w.path), 'meta.json')))) if (fs.existsSync(p)) moveOne(p, home);
  }
}
