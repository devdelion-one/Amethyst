import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Ran = { ok: boolean; out: string };
const run = (cmd: string, args: string[]) => new Promise<Ran>((res) => execFile(cmd, args, { windowsHide: true, timeout: 15e3 }, (e, out) => res({ ok: !e, out: String(out || '') })));

export const binDir = () => path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Amethyst', 'bin');
const cmdFile = () => path.join(binDir(), 'amethyst.cmd');
const bare = (p: string) => p.trim().replace(/[\\/]+$/, '').toLowerCase();

async function userPath() {
  const r = await run('reg', ['query', 'HKCU\\Environment', '/v', 'Path']);
  const m = /^\s*Path\s+(REG_\w+)\s+(.*)$/im.exec(r.out);
  return m ? { value: m[2].trim(), type: m[1] } : r.ok ? null : { value: '', type: 'REG_EXPAND_SZ' };
}

export const cmdText = (exe: string, script: string) => `@echo off\r\nsetlocal\r\nset ELECTRON_RUN_AS_NODE=1\r\nset NODE_NO_WARNINGS=1\r\n"${exe}" "${script}" %*\r\nexit /b %errorlevel%\r\n`;

export async function installCli(exe: string, script: string): Promise<string> {
  if (process.platform !== 'win32') return 'not on Windows: nothing to install yet';
  const dir = binDir(), file = cmdFile(), text = cmdText(exe, script);
  fs.mkdirSync(dir, { recursive: true });
  if ((fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '') !== text) fs.writeFileSync(file, text);
  const now = await userPath();
  if (!now) return `wrote ${file}; the PATH could not be read`;
  const parts = now.value.split(';').filter((p) => p.trim());
  if (parts.some((p) => bare(p) === bare(dir))) return `ready: ${file}`;
  const set = await run('reg', ['add', 'HKCU\\Environment', '/v', 'Path', '/t', now.type || 'REG_EXPAND_SZ', '/d', [...parts, dir].join(';'), '/f']);
  if (!set.ok) return `wrote ${file}; adding ${dir} to the PATH failed`;
  await run('setx', ['AMETHYST_BIN', dir]);
  return `ready: ${file}, and ${dir} is on the PATH for new terminals`;
}

export async function removeCli(): Promise<string> {
  if (process.platform !== 'win32') return 'nothing to remove';
  const dir = binDir();
  fs.rmSync(cmdFile(), { force: true });
  const now = await userPath();
  if (now) {
    const parts = now.value.split(';').filter((p) => p.trim());
    const kept = parts.filter((p) => bare(p) !== bare(dir));
    if (kept.length !== parts.length) await run('reg', ['add', 'HKCU\\Environment', '/v', 'Path', '/t', now.type || 'REG_EXPAND_SZ', '/d', kept.join(';'), '/f']);
  }
  await run('reg', ['delete', 'HKCU\\Environment', '/v', 'AMETHYST_BIN', '/f']);
  return `removed the amethyst command and ${dir} from the PATH`;
}
