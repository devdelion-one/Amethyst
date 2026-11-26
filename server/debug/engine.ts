import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { HttpError } from '../base/routes.ts';

const WIN = process.platform === 'win32';
export const ADAPTER = { name: 'dap-dbgeng', version: '0.3.0-unreal.3', url: 'https://github.com/devdelion-one/dap-dbgeng-unreal/releases/download/v0.3.0-unreal.3/dap-dbgeng-0.3.0-unreal.3-win-x64.zip', sha256: '79028a20efd0888d930af813f3a440d7e2a228466cc060f015c9166143278354', exe: 'dap-dbgeng.exe', licence: 'MIT', home: 'https://github.com/devdelion-one/dap-dbgeng-unreal' };
export const DBGENG = { id: 'Microsoft.Debugging.Platform.DbgEng', version: '20260319.1511.0', sha256: '875678516f9ceed4a1c8b9b106d165106fcaa38723ad7c584c47b95b231600de', licence: 'https://aka.ms/WinSDKLicenseURL', mb: 15 };
const DLLS = ['dbgeng.dll', 'dbgmodel.dll', 'dbghelp.dll', 'dbgcore.dll', 'msdia140.dll'];
const nugetUrl = () => `https://www.nuget.org/api/v2/package/${DBGENG.id}/${DBGENG.version}`;

const base = () => process.env.MIND_DEBUG_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), '.amethyst'), 'Amethyst', 'debug');
const folder = () => path.join(base(), `${ADAPTER.version}+${DBGENG.version}`);
const MARK = 'installed.json';

export interface EngineState {
  ready: boolean;
  os: boolean;
  dir: string;
  version: string;
  missing: string[];
  published: boolean;
  mb: number;
  licence: string;
  fake: boolean;
  installing: boolean;
  bytes: number;
}

let installing: Promise<unknown> | null = null;

export function engineState(): EngineState {
  const fake = !!process.env.MIND_FAKE_DAP;
  const dir = folder();
  const missing = fake ? [] : [ADAPTER.exe, ...DLLS, MARK].filter((f) => !fs.existsSync(path.join(dir, f)));
  return { ready: fake || (WIN && !missing.length), os: WIN || fake, dir, version: ADAPTER.version, missing, published: !!ADAPTER.url, mb: DBGENG.mb + 2, licence: DBGENG.licence, fake, installing: !!installing, bytes: sizeOf(base()) };
}

function sizeOf(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size;
  } catch {}
  return n;
}

export async function uninstall() {
  if (installing) throw new HttpError(409, 'the debugger is downloading: wait for it to finish');
  const dir = base();
  if (!process.env.MIND_DEBUG_DIR && path.basename(dir) !== 'debug') throw new HttpError(500, `not removing ${dir}: it isn't the debugger's folder`);
  if (fs.existsSync(dir)) await fs.promises.rm(dir, { recursive: true, force: true });
  return engineState();
}

export function adapterCommand(): { exe: string; args: string[] } {
  const fake = process.env.MIND_FAKE_DAP;
  if (fake) return { exe: process.execPath, args: [fake] };
  const s = engineState();
  if (!s.ready) throw new HttpError(409, 'the debugger is not downloaded yet');
  return { exe: path.join(s.dir, ADAPTER.exe), args: [] };
}

const run = (exe: string, args: string[], cwd?: string) =>
  new Promise<void>((resolve, reject) =>
    execFile(exe, args, { cwd, windowsHide: true, timeout: 120e3 }, (err, _o, e) => (err ? reject(new Error(String(e || err.message).trim())) : resolve())),
  );

async function fetchTo(url: string, file: string, sha256: string) {
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300e3), headers: { 'user-agent': 'Amethyst' } });
  if (!r.ok || !r.body) throw new HttpError(502, `download failed: ${url} answered ${r.status}`);
  const data = Buffer.from(await r.arrayBuffer());
  const got = crypto.createHash('sha256').update(data).digest('hex');
  if (got !== sha256) throw new HttpError(502, `the download from ${new URL(url).host} is not the expected file (SHA-256 ${got.slice(0, 12)}…): nothing was installed`);
  await fs.promises.writeFile(file, data);
}

const unzip = (zip: string, to: string) => run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', to]);

async function doInstall(from: string) {
  await fs.promises.mkdir(base(), { recursive: true });
  const dir = folder(), tmp = await fs.promises.mkdtemp(path.join(base(), 'download-'));
  try {
    const stage = path.join(tmp, 'stage');
    await fs.promises.mkdir(stage, { recursive: true });
    const pkg = path.join(tmp, 'dbgeng.zip'), out = path.join(tmp, 'dbgeng');
    await fs.promises.mkdir(out);
    await fetchTo(nugetUrl(), pkg, DBGENG.sha256);
    await unzip(pkg, out);
    for (const f of DLLS) {
      const src = path.join(out, 'content', 'amd64', f);
      if (!fs.existsSync(src)) throw new HttpError(502, `Microsoft's package has no ${f} for x64`);
      await fs.promises.copyFile(src, path.join(stage, f));
    }
    if (ADAPTER.url && !from) {
      const zip = path.join(tmp, 'adapter.zip'), ad = path.join(tmp, 'adapter');
      await fs.promises.mkdir(ad);
      await fetchTo(ADAPTER.url, zip, ADAPTER.sha256);
      await unzip(zip, ad);
      from = ad;
    }
    if (!from || !fs.existsSync(path.join(from, ADAPTER.exe))) throw new HttpError(400, ADAPTER.url ? `the download has no ${ADAPTER.exe}` : `the debug adapter isn't published yet: pick the folder with ${ADAPTER.exe}`);
    await fs.promises.copyFile(path.join(from, ADAPTER.exe), path.join(stage, ADAPTER.exe));
    for (const f of ['LICENSE', 'LICENSE.txt', 'NOTICE.txt']) if (fs.existsSync(path.join(from, f))) await fs.promises.copyFile(path.join(from, f), path.join(stage, f));
    await fs.promises.writeFile(path.join(stage, MARK), JSON.stringify({ adapter: ADAPTER.version, dbgeng: DBGENG.version, accepted: DBGENG.licence, at: Date.now() }, null, 1));
    if (fs.existsSync(dir)) await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.rename(stage, dir);
    for (const old of await fs.promises.readdir(base()).catch(() => [] as string[]))
      if (old.includes('+') && path.join(base(), old) !== dir) await fs.promises.rm(path.join(base(), old), { recursive: true, force: true }).catch(() => {});
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function install({ accept, from }: { accept?: boolean; from?: string }) {
  if (!WIN) throw new HttpError(400, 'the debugger is Windows only for now');
  if (accept !== true) throw new HttpError(400, "Microsoft's debugger licence has to be accepted first");
  const src = String(from || process.env.MIND_DAP_FROM || '');
  if (src && !path.isAbsolute(src)) throw new HttpError(400, 'give the adapter folder as a full path');
  installing ||= doInstall(src).finally(() => (installing = null));
  await installing;
  return engineState();
}
