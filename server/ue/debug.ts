import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { within } from '../base/live.ts';

export interface Config {
  name: string;
  kind: string;
  mode: 'launch' | 'attach';
  program?: string;
  args?: string[];
  cwd?: string;
  pid?: number;
  symbolPath?: string[];
  sources?: string[];
  sourceModules?: string[];
  map?: { marker: string; to: string }[];
  libs?: string[];
  exceptions?: string[];
  note?: string;
}

interface Mod {
  name: string;
  dir: string;
  engine: boolean;
}

const SKIP = new Set(['Intermediate', 'Binaries', 'Saved', 'Content', 'Resources', 'Shaders', 'ThirdParty', 'Public', 'Private', 'Classes', 'Internal', '.git']);
const engineMods = new Map<string, Promise<Mod[]>>();

async function walk(dir: string, engine: boolean, out: Mod[], depth: number) {
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const build = ents.find((e) => e.isFile() && e.name.endsWith('.Build.cs'));
  if (build) return void out.push({ name: build.name.slice(0, -'.Build.cs'.length), dir, engine });
  if (depth <= 0) return;
  await Promise.all(ents.filter((e) => e.isDirectory() && !SKIP.has(e.name)).map((e) => walk(path.join(dir, e.name), engine, out, depth - 1)));
}

async function pluginSources(dir: string, engine: boolean, out: Mod[], depth: number) {
  let ents: fs.Dirent[];
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  if (ents.some((e) => e.isFile() && e.name.endsWith('.uplugin'))) return walk(path.join(dir, 'Source'), engine, out, 3);
  if (depth <= 0) return;
  await Promise.all(ents.filter((e) => e.isDirectory() && !SKIP.has(e.name)).map((e) => pluginSources(path.join(dir, e.name), engine, out, depth - 1)));
}

function engineModules(engineDir: string) {
  const k = path.resolve(engineDir).toLowerCase();
  if (!engineMods.has(k))
    engineMods.set(k, (async () => {
      const out: Mod[] = [];
      const src = path.join(engineDir, 'Engine', 'Source');
      await Promise.all(['Runtime', 'Editor', 'Developer'].map((d) => walk(path.join(src, d), true, out, 4)));
      await pluginSources(path.join(engineDir, 'Engine', 'Plugins'), true, out, 5);
      return out;
    })());
  return engineMods.get(k)!;
}

async function projectModules(projDir: string) {
  const out: Mod[] = [];
  await walk(path.join(projDir, 'Source'), false, out, 2);
  await pluginSources(path.join(projDir, 'Plugins'), false, out, 4);
  return out;
}

const dbgName = (dll: string) => dll.replace(/\.(dll|exe)$/i, '').replace(/[-.]/g, '_');

function readTarget(projDir: string, target: string, config: string) {
  const bin = path.join(projDir, 'Binaries', 'Win64');
  const names = config === 'Development' ? [`${target}.target`] : [`${target}-Win64-${config}.target`];
  for (const n of names)
    try {
      return JSON.parse(fs.readFileSync(path.join(bin, n), 'utf8').replace(/^﻿/, ''));
    } catch {}
  return null;
}

const inBinaries = (program: string, engineDir: string, projDir: string) => {
  const real = fs.realpathSync.native(program);
  return [path.join(engineDir, 'Engine', 'Binaries'), path.join(projDir, 'Binaries')].some((d) => fs.existsSync(d) && within(real, fs.realpathSync.native(d)));
};

const expand = (s: string, engineDir: string, projDir: string) => path.resolve(s.replace(/\$\(EngineDir\)/g, path.join(engineDir, 'Engine')).replace(/\$\(ProjectDir\)/g, projDir));

export function exeOf(pid: number): Promise<string> {
  if (process.platform !== 'win32' || !pid) return Promise.resolve('');
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).Path`], { windowsHide: true, timeout: 10e3 }, (_e, out) => res(String(out || '').trim())));
}

export interface Want {
  engineDir: string;
  uproject: string;
  name: string;
  target: { name: string; type: string };
  config: string;
  mode: 'editor' | 'game' | 'attach';
  pid?: number;
  running?: string;
}

export async function debugConfig(w: Want): Promise<{ why: string; detail?: string; config?: Config }> {
  const projDir = path.dirname(w.uproject);
  let program = '', modular = true, suffix = '';
  if (w.mode === 'attach') {
    program = w.running || '';
    const m = /UnrealEditor-Win64-(DebugGame|Debug)\.exe$/i.exec(program);
    suffix = m ? `-Win64-${m[1]}` : '';
  } else {
    const t = readTarget(projDir, w.target.name, w.config);
    if (!t?.Launch) return { why: 'not-built', detail: `${w.target.name} ${w.config} isn't built yet` };
    program = expand(String(t.Launch), w.engineDir, projDir);
    if (!fs.existsSync(program)) return { why: 'no-program', detail: `no ${path.basename(program)} in ${path.dirname(program)}` };
    if (!inBinaries(program, w.engineDir, projDir)) return { why: 'no-program', detail: `${w.target.name} ${w.config} starts ${program}, which isn't in the engine's or the project's Binaries folder, so it wasn't started` };
    modular = w.target.type === 'Editor' || t.LinkType === 'Modular' || /UnrealEditor/i.test(path.basename(program));
    suffix = w.config === 'Development' ? '' : `-Win64-${w.config}`;
  }
  const [mine, theirs] = await Promise.all([projectModules(projDir), engineModules(w.engineDir)]);
  const sourceModules: string[] = [];
  if (modular) {
    for (const m of mine) sourceModules.push(`${m.dir}=${dbgName(`UnrealEditor-${m.name}${suffix}`)}`);
    const theirSuffix = /Debug$/.test(suffix) && !/DebugGame/.test(suffix) ? suffix : '';
    for (const m of theirs) sourceModules.push(`${m.dir}=${dbgName(`UnrealEditor-${m.name}${theirSuffix}`)}`);
  } else {
    const one = dbgName(path.basename(program));
    sourceModules.push(`${path.join(projDir, 'Source')}=${one}`, `${path.join(projDir, 'Plugins')}=${one}`, `${path.join(w.engineDir, 'Engine', 'Source')}=${one}`, `${path.join(w.engineDir, 'Engine', 'Plugins')}=${one}`);
  }
  const engine = path.join(w.engineDir, 'Engine');
  const base = {
    symbolPath: [path.join(projDir, 'Binaries', 'Win64'), path.join(engine, 'Binaries', 'Win64')],
    sources: [projDir, path.join(engine, 'Source')],
    sourceModules,
    map: [
      { marker: '\\Engine\\Source\\', to: path.join(engine, 'Source') },
      { marker: '\\Engine\\Plugins\\', to: path.join(engine, 'Plugins') },
      { marker: '\\Engine\\Shaders\\', to: path.join(engine, 'Shaders') },
    ],
    libs: [w.engineDir],
    exceptions: [] as string[],
  };
  const slow = w.mode === 'attach' ? !suffix : w.config === 'Development';
  const note = slow ? 'Development: the game code is optimized, so variables may be missing. DebugGame Editor shows them all.' : '';
  if (w.mode === 'attach') return { why: '', config: { name: `${w.name} · Unreal Editor`, kind: 'attach', mode: 'attach', pid: w.pid, note, ...base } };
  const args = [w.uproject, ...(w.mode === 'game' ? ['-game', '-windowed', '-log'] : [])];
  return { why: '', config: { name: `${w.name} · ${w.mode === 'game' ? 'game' : 'Unreal Editor'}`, kind: w.mode, mode: 'launch', program, args, cwd: path.dirname(program), note, ...base } };
}

export { engineModules, projectModules };
