import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import type { AddressInfo } from 'net';
import type { AfterPackContext } from 'electron-builder';

const WAIT_MS = 20000;

const unlocked = async (file: string) => {
  for (let i = 0; i < 100; i++) {
    try {
      fs.closeSync(fs.openSync(file, 'r+'));
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
};

export default async (context: AfterPackContext) => {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const server = path.join(context.appOutDir, 'resources', 'app-src', 'server.ts');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amethyst-pack-'));
  const port = await new Promise((res, rej) => {
    const s = net.createServer().on('error', rej).listen(0, '127.0.0.1', () => {
      const p = (s.address() as AddressInfo).port;
      s.close(() => res(p));
    });
  });
  const child = spawn(exe, [server, path.join(tmp, 'notes'), `--workspace=${path.join(tmp, 'ws')}`], {
    cwd: path.dirname(server),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const up = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), WAIT_MS);
    child.on('exit', () => (clearTimeout(timer), resolve(false)));
    child.stdout.on('data', () => out.includes('/app') && (clearTimeout(timer), resolve(true)));
  });
  const gone = child.exitCode !== null ? Promise.resolve() : new Promise((r) => child.once('exit', r));
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
  await unlocked(exe);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!up) throw new Error(`The packed app's server did not start, so no installer is made:\n${out.trim() || `(no output in ${WAIT_MS / 1000} s)`}`);
  console.log('  • packed app starts');
};
