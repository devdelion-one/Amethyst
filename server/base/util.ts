import fs from 'fs';
import path from 'path';

const fsp = fs.promises;
export const WIN = process.platform === 'win32';
export const CALM = 300;
export const TAIL = 4000;

export const exists = (p: string): Promise<boolean> => fsp.access(p).then(() => true, () => false);
export const isDir = (p: string): Promise<boolean> => fsp.stat(p).then((s) => s.isDirectory(), () => false);

const two = (n: number) => String(n).padStart(2, '0');
export const stamp = (d = new Date()): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`;

export const firstLine = (s: unknown, n = 140): string => String(s || '').split('\n').map((l) => l.trim()).find(Boolean)?.slice(0, n) || '';

const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES']);
const TRIES = 6;
const busy = (e: unknown, i: number) => WIN && i < TRIES - 1 && BUSY.has((e as NodeJS.ErrnoException).code || '');
const pause = new Int32Array(new SharedArrayBuffer(4));
type Opts = { mode?: number; tmp?: string };

export function replaceSync(file: string, text: string | Uint8Array, opts: Opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = opts.tmp || file + '.tmp';
  try {
    fs.writeFileSync(tmp, text, { mode: opts.mode });
    for (let i = 0; ; i++) {
      try {
        return fs.renameSync(tmp, file);
      } catch (e) {
        if (!busy(e, i)) throw e;
        Atomics.wait(pause, 0, 0, 20 * (i + 1));
      }
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

const queue = new Map<string, Promise<unknown>>();
async function put(file: string, text: string | Uint8Array, opts: Opts) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = opts.tmp || file + '.tmp';
  try {
    await fsp.writeFile(tmp, text, { mode: opts.mode });
    for (let i = 0; ; i++) {
      try {
        return await fsp.rename(tmp, file);
      } catch (e) {
        if (!busy(e, i)) throw e;
        await new Promise((ok) => setTimeout(ok, 20 * (i + 1)));
      }
    }
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    throw e;
  }
}
export function replace(file: string, text: string | Uint8Array, opts: Opts = {}): Promise<void> {
  const key = WIN ? path.resolve(file).toLowerCase() : path.resolve(file);
  const run = (queue.get(key) || Promise.resolve()).catch(() => {}).then(() => put(file, text, opts));
  queue.set(key, run);
  run.finally(() => queue.get(key) === run && queue.delete(key)).catch(() => {});
  return run;
}
