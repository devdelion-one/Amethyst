import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DOT } from './routes.ts';

const WIN = process.platform === 'win32';
const key = (p: string) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
let base = '', home = '';

export function initDataDir(o: { base: string; home: string }) {
  base = path.resolve(o.base);
  home = path.resolve(o.home);
}

export function dirFor(base: string, home: string, folder: string) {
  if (key(folder) === key(home)) return path.join(home, DOT);
  const full = path.resolve(folder);
  const name = (path.basename(full) || 'drive').replace(/[^\w.-]+/g, '-').slice(0, 40) || 'folder';
  return path.join(base, `${name}-${crypto.createHash('sha1').update(key(full)).digest('hex').slice(0, 8)}`);
}

export const dataDir = (folder: string) => dirFor(base, home, folder);

export const dataBase = () => base;

const MONTH = 30 * 24 * 3600e3;
export async function sweepUnused(now = Date.now()) {
  const dirs = [path.join(home, DOT), ...(await fs.promises.readdir(base).catch(() => [])).map((d) => path.join(base, d))];
  for (const d of dirs) {
    const un = path.join(d, 'images', 'unused');
    for (const f of await fs.promises.readdir(un).catch(() => [] as string[])) {
      const p = path.join(un, f), st = await fs.promises.stat(p).catch(() => null);
      if (st?.isFile() && now - st.mtimeMs > MONTH) await fs.promises.rm(p, { force: true }).catch(() => {});
    }
  }
}
