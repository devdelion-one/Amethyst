import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { HttpError } from '../base/routes.ts';
import * as editor from './editor.ts';
import * as link from './link.ts';
import { inside, projectPlugins } from './make.ts';

export type ProjectRef = { id: string; name: string; path: string };
export type FindProject = (name: string) => ProjectRef | null;
export type FoundLike = { path: string; name: string; engine: { dir: string } | null };
export type AssetOp = 'deps' | 'migrate' | 'move' | 'props' | 'new';

export interface ParsedRequest {
  op: AssetOp;
  write: boolean;
  timeoutSec: number | null;
  path?: string;
  paths?: string[];
  from?: string;
  to?: string;
  destProject?: ProjectRef;
  destRoot?: string;
  overwrite?: boolean;
  soft?: boolean;
  recursive?: boolean;
  keys?: string[];
  className?: string;
  parent?: string;
  set?: Record<string, unknown>;
  promptTitle: (projName: string) => string;
  promptWarn: (projName: string) => string;
}

const SCRIPT = path.join(import.meta.dirname, 'assets.py');
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SEG = /^[A-Za-z0-9_.-]+$/;
const CLS = /^[A-Za-z_][A-Za-z0-9_./]*$/;
const CTRL = /[\x00-\x1f\x7f]/;
const WIN = process.platform === 'win32';
const MAX_PATH_LEN = 260;
const MAX_TIMEOUT = 600;
const DEFAULT_LIVE_TIMEOUT = 120;
const DEFAULT_HEADLESS_TIMEOUT = 300;
const OPS = new Set<AssetOp>(['deps', 'migrate', 'move', 'props', 'new']);

const sameDir = (a: string, b: string) => (WIN ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

function validatePkgPath(raw: unknown, { write = false, allowRoot = false } = {}): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) throw new HttpError(400, 'asset path is required');
  if (s.length > MAX_PATH_LEN) throw new HttpError(400, `asset path is too long (max ${MAX_PATH_LEN} characters)`);
  if (CTRL.test(s)) throw new HttpError(400, 'asset path cannot contain control characters');
  if (s.includes('\\') || s.includes(':')) throw new HttpError(400, `invalid Unreal package path "${s}": use forward-slash /Game/... paths, not filesystem paths`);
  if (!s.startsWith('/')) throw new HttpError(400, `invalid Unreal package path "${s}": must start with / (e.g. /Game/...)`);
  if (s.includes('//')) throw new HttpError(400, `invalid Unreal package path "${s}": empty path segment`);
  const segs = s.slice(1).split('/');
  if (segs.some((seg) => !seg)) throw new HttpError(400, `invalid Unreal package path "${s}": empty path segment`);
  if (segs.length < (allowRoot ? 1 : 2)) throw new HttpError(400, `invalid Unreal package path "${s}": expected /<Mount>/<Path>`);
  const mount = segs[0];
  if (!ID.test(mount)) throw new HttpError(400, `invalid Unreal mount root "/${mount}"`);
  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i];
    if (seg === '.' || seg === '..' || seg.includes('..') || !SEG.test(seg)) {
      throw new HttpError(400, `invalid segment "${seg}" in Unreal package path "${s}"`);
    }
  }
  if (write) {
    const low = mount.toLowerCase();
    if (low === 'script' || low === 'engine') throw new HttpError(400, `cannot write to /${mount}/ packages`);
  }
  return '/' + segs.join('/');
}

function validateClassName(raw: unknown, label = 'class'): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) throw new HttpError(400, `${label} is required`);
  if (s.length > MAX_PATH_LEN || CTRL.test(s) || s.includes('\\') || s.includes('..') || !CLS.test(s)) {
    throw new HttpError(400, `invalid Unreal ${label} "${s}"`);
  }
  return s;
}

function validateSetObject(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new HttpError(400, '--set must be a JSON object, e.g. {"Speed":600}');
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new HttpError(400, '--set must be a JSON object, e.g. {"Speed":600}');
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (!k || CTRL.test(k) || !ID.test(k)) throw new HttpError(400, `invalid property name "${k}" in --set`);
    out[k] = v;
  }
  return out;
}

function validateProjectName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) throw new HttpError(400, 'migrate requires --to <project>');
  if (CTRL.test(s) || s.includes('/') || s.includes('\\') || s.includes(':') || s.includes('..')) {
    throw new HttpError(400, `--to must be a registered Amethyst project name, not a path ("${s}")`);
  }
  return s;
}

function parseTimeout(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, '--timeout must be a positive number of seconds');
  return Math.min(Math.round(n), MAX_TIMEOUT);
}

function parseRequest(body: Record<string, unknown>, findProject: FindProject): ParsedRequest {
  const op = String(body.op || '').trim().toLowerCase() as AssetOp;
  if (!OPS.has(op)) throw new HttpError(400, 'asset operation must be one of: deps, migrate, move, props, new');
  const pos = asList(body.args);
  const timeoutSec = parseTimeout(body.timeout);

  if (op === 'deps') {
    const p = validatePkgPath(pos[0] ?? body.path);
    return {
      op,
      write: false,
      timeoutSec,
      path: p,
      soft: !!body.soft,
      recursive: !!body.recursive,
      promptTitle: (proj) => `Allow reading Unreal asset dependencies in ${proj}?`,
      promptWarn: () => "This runs the project's own code: its plugins and Unreal Python environment.",
    };
  }

  if (op === 'props') {
    const p = validatePkgPath(pos[0] ?? body.path);
    const keys = asList(body.keys);
    for (const k of keys) if (!ID.test(k) || CTRL.test(k)) throw new HttpError(400, `invalid property name "${k}" in --keys`);
    return {
      op,
      write: false,
      timeoutSec,
      path: p,
      keys,
      promptTitle: (proj) => `Allow reading Unreal asset properties in ${proj}?`,
      promptWarn: () => "This runs the project's own code: its plugins and Unreal Python environment.",
    };
  }

  if (op === 'move') {
    const from = validatePkgPath(pos[0] ?? body.from, { write: true });
    const to = validatePkgPath(pos[1] ?? body.dest ?? body.to, { write: true });
    if (from.toLowerCase() === to.toLowerCase()) throw new HttpError(400, 'source and destination paths are the same');
    return {
      op,
      write: true,
      timeoutSec,
      from,
      to,
      promptTitle: (proj) => `Allow moving Unreal asset ${from} to ${to} in ${proj}?`,
      promptWarn: (proj) => `This runs Unreal on ${proj} and modifies assets and redirectors in Content/.`,
    };
  }

  if (op === 'new') {
    const className = validateClassName(pos[0] ?? body.class, 'class');
    const p = validatePkgPath(pos[1] ?? body.path, { write: true });
    const parent = body.parent ? validateClassName(body.parent, 'parent') : '';
    const set = validateSetObject(body.set);
    return {
      op,
      write: true,
      timeoutSec,
      className,
      path: p,
      parent,
      set,
      promptTitle: (proj) => `Allow creating Unreal asset ${p} in ${proj}?`,
      promptWarn: (proj) => `This runs Unreal on ${proj} and writes a new asset to Content/.`,
    };
  }

  const rawPaths = pos.length ? pos : asList(body.paths);
  if (!rawPaths.length) throw new HttpError(400, 'migrate requires at least one asset path');
  const paths = rawPaths.map((p) => validatePkgPath(p));
  const toName = validateProjectName(body.to);
  const destProject = findProject(toName);
  if (!destProject) throw new HttpError(404, `no registered Amethyst project named "${toName}"`);
  const rawDestRoot = body['dest-root'] ?? body.destRoot;
  const destRoot = rawDestRoot ? validatePkgPath(rawDestRoot, { write: true, allowRoot: true }) : '';
  return {
    op: 'migrate',
    write: true,
    timeoutSec,
    paths,
    destProject,
    destRoot,
    overwrite: !!body.overwrite,
    soft: !!body.soft,
    promptTitle: (proj) => `Allow migrating Unreal assets from ${proj} to ${destProject.name}?`,
    promptWarn: (proj) => `This runs Unreal on ${proj} and writes asset files into ${destProject.name}/Content/.`,
  };
}

async function runHeadless(uprojectPath: string, engineDir: string, reqPath: string, resPath: string, timeoutMs: number): Promise<void> {
  const fake = process.env.MIND_FAKE_UE_ASSETS;
  const cmdArgs = [
    uprojectPath,
    '-EnablePlugins=PythonScriptPlugin',
    `-ExecutePythonScript=${SCRIPT}`,
    '-Unattended',
    '-NoSplash',
    '-NullRHI',
    '-NoSound',
    '-NoShaderCompile',
    '-NoLogTimes',
  ];
  let exe: string;
  let spawnArgs: string[];
  if (fake) {
    exe = process.execPath;
    spawnArgs = [fake, ...cmdArgs];
  } else {
    exe = path.join(engineDir, 'Engine', 'Binaries', 'Win64', 'UnrealEditor-Cmd.exe');
    if (!fs.existsSync(exe)) throw new HttpError(404, `no UnrealEditor-Cmd.exe in ${path.dirname(exe)}`);
    spawnArgs = cmdArgs;
  }
  await new Promise<void>((res, rej) => {
    let stderr = '';
    let timedOut = false;
    const child = spawn(exe, spawnArgs, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, AMETHYST_ASSET_REQ: reqPath, AMETHYST_ASSET_RES: resPath },
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {}
    }, timeoutMs);
    child.stderr?.on('data', (d) => {
      if (stderr.length < 8000) stderr += String(d);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      rej(new HttpError(500, `failed to run UnrealEditor-Cmd: ${e.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return rej(new HttpError(504, `Unreal asset command timed out after ${Math.round(timeoutMs / 1000)} s`));
      if (fs.existsSync(resPath)) return res();
      rej(new HttpError(500, `UnrealEditor-Cmd exited with code ${code ?? 'unknown'} without writing a result${stderr.trim() ? `: ${stderr.trim().slice(0, 400)}` : ''}`));
    });
  });
}

async function runAssetOp(
  projDir: string,
  projName: string,
  uprojectPath: string,
  engineDir: string,
  payload: Record<string, unknown>,
  opts: { write: boolean; timeoutSec: number | null },
): Promise<{ mode: 'live' | 'headless'; data: Record<string, any> }> {
  const open = await editor.editorOpen(uprojectPath);
  const linked = (await link.state(projDir, open ? 1500 : 300)).linked;
  if (!linked && open && opts.write) {
    throw new HttpError(409, `Unreal Editor is open on ${projName} without a Python link: close the editor or reopen it via amethyst ue editor before modifying assets`);
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'amethyst-ue-assets-'));
  const reqPath = path.join(tmpDir, 'req.json');
  const resPath = path.join(tmpDir, 'res.json');
  try {
    await fs.promises.writeFile(reqPath, JSON.stringify(payload), 'utf8');
    let mode: 'live' | 'headless';
    if (linked) {
      mode = 'live';
      const timeoutMs = (opts.timeoutSec ?? DEFAULT_LIVE_TIMEOUT) * 1000;
      const cmd = `import runpy, sys; sys.argv = [${JSON.stringify(SCRIPT)}, ${JSON.stringify(reqPath)}, ${JSON.stringify(resPath)}]; runpy.run_path(${JSON.stringify(SCRIPT)}, run_name='__main__')`;
      const r = await link.py(projDir, cmd, { mode: 'ExecuteStatement', ms: timeoutMs });
      if (!fs.existsSync(resPath)) {
        const detail = r.result || r.output.map((o) => o.output).join('\n').trim();
        throw new HttpError(500, `Unreal Editor did not write an asset result${detail ? `: ${detail.slice(0, 400)}` : ''}`);
      }
    } else {
      mode = 'headless';
      const timeoutMs = (opts.timeoutSec ?? DEFAULT_HEADLESS_TIMEOUT) * 1000;
      await runHeadless(uprojectPath, engineDir, reqPath, resPath, timeoutMs);
    }
    const raw = await fs.promises.readFile(resPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new HttpError(500, 'invalid response from Unreal asset helper');
    if (!parsed.ok) throw new HttpError(400, String(parsed.error || 'Unreal asset operation failed'));
    return { mode, data: parsed.data || {} };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function findUprojectIn(dir: string): Promise<string> {
  const entries = await fs.promises.readdir(dir).catch(() => []);
  const hit = entries.find((f) => /\.uproject$/i.test(f));
  return hit ? path.join(dir, hit) : '';
}

async function runMigrate(f: FoundLike, req: ParsedRequest) {
  const srcProjDir = path.dirname(f.path);
  const dest = req.destProject!;
  const destProjDir = path.resolve(dest.path);
  if (sameDir(srcProjDir, destProjDir)) throw new HttpError(400, 'source and destination projects must be different');
  const destUproject = await findUprojectIn(destProjDir);
  if (!destUproject) throw new HttpError(400, `destination project "${dest.name}" has no .uproject file`);

  const destOpen = await editor.editorOpen(destUproject);
  const destLinked = (await link.state(destProjDir, destOpen ? 1500 : 300)).linked;
  if (destOpen && !destLinked) {
    throw new HttpError(409, `Unreal Editor is open on ${dest.name} without a Python link: close the editor or reopen it via amethyst ue editor before migrating assets into it`);
  }

  let destBaseDir = path.join(destProjDir, 'Content');
  let destSubSegs: string[] = [];
  let destPkgMount = '/Game';
  if (req.destRoot) {
    const segs = req.destRoot.slice(1).split('/');
    const rootMount = segs[0];
    destSubSegs = segs.slice(1);
    if (rootMount === 'Game') {
      destBaseDir = path.join(destProjDir, 'Content');
      destPkgMount = '/Game';
    } else {
      const plugins = await projectPlugins(destProjDir);
      const plugin = plugins.find((p) => p.name.toLowerCase() === rootMount.toLowerCase());
      if (!plugin) throw new HttpError(404, `destination project "${dest.name}" has no plugin "${rootMount}"`);
      destBaseDir = path.join(plugin.dir, 'Content');
      destPkgMount = '/' + plugin.name;
    }
  }

  const { mode, data } = await runAssetOp(
    srcProjDir,
    f.name,
    f.path,
    f.engine!.dir,
    { op: 'migrate', paths: req.paths, soft: !!req.soft },
    { write: false, timeoutSec: req.timeoutSec },
  );

  const files: { package: string; file: string }[] = Array.isArray(data.files) ? data.files : [];
  const plan: { pkg: string; destPkg: string; srcFile: string; destFile: string }[] = [];
  for (const item of files) {
    const pkg = validatePkgPath(item.package);
    const srcFile = path.resolve(String(item.file || ''));
    if (!inside(srcProjDir, srcFile)) throw new HttpError(400, `refused source file outside project: ${srcFile}`);
    if (!fs.existsSync(srcFile)) throw new HttpError(404, `source asset file not found on disk: ${srcFile}`);
    const rest = pkg.slice(1).split('/').slice(1);
    const ext = path.extname(srcFile) || '.uasset';
    if (!/^\.(uasset|umap)$/i.test(ext)) throw new HttpError(400, `unexpected asset file extension "${ext}" for ${pkg}`);
    const relSegs = [...destSubSegs, ...rest];
    const destFile = path.resolve(destBaseDir, ...relSegs) + ext;
    if (!inside(destBaseDir, destFile)) throw new HttpError(400, `refused destination path outside Content/: ${destFile}`);
    const destPkg = `${destPkgMount}/${relSegs.join('/')}`;
    plan.push({ pkg, destPkg, srcFile, destFile });
  }

  const collisions = plan.filter((p) => fs.existsSync(p.destFile));
  if (collisions.length && !req.overwrite) {
    const sample = collisions.slice(0, 5).map((c) => path.relative(destProjDir, c.destFile).replace(/\\/g, '/'));
    throw new HttpError(409, `destination already has ${collisions.length} colliding file${collisions.length === 1 ? '' : 's'} (${sample.join(', ')}${collisions.length > 5 ? ', ...' : ''}): pass --overwrite to replace them`);
  }

  const copied: { from: string; to: string; file: string }[] = [];
  const scanFolders = new Set<string>();
  for (const p of plan) {
    await fs.promises.mkdir(path.dirname(p.destFile), { recursive: true });
    await fs.promises.copyFile(p.srcFile, p.destFile);
    copied.push({ from: p.pkg, to: p.destPkg, file: path.relative(destProjDir, p.destFile).replace(/\\/g, '/') });
    scanFolders.add(p.destPkg.slice(0, p.destPkg.lastIndexOf('/')) || destPkgMount);
  }

  let scanned = false;
  if (destLinked && scanFolders.size) {
    try {
      await runAssetOp(
        destProjDir,
        dest.name,
        destUproject,
        f.engine!.dir,
        { op: 'scan', paths: [...scanFolders] },
        { write: false, timeoutSec: 30 },
      );
      scanned = true;
    } catch {}
  }

  return {
    op: 'migrate',
    mode,
    from: f.name,
    to: dest.name,
    copied,
    scriptDeps: Array.isArray(data.scriptDeps) ? data.scriptDeps : [],
    engineDeps: Array.isArray(data.engineDeps) ? data.engineDeps : [],
    missing: Array.isArray(data.missing) ? data.missing : [],
    scanned,
  };
}

function formatText(op: AssetOp, res: Record<string, any>): string {
  if (op === 'deps') {
    const proj: string[] = res.project || [];
    const eng: string[] = res.engine || [];
    const scr: string[] = res.script || [];
    const lines = [`Dependencies of ${res.path} (${res.mode}):`];
    lines.push(`Project (${proj.length}):${proj.length ? '\n  ' + proj.join('\n  ') : ' none'}`);
    if (scr.length) lines.push(`Script (${scr.length}):\n  ${scr.join('\n  ')}`);
    if (eng.length) lines.push(`Engine (${eng.length}):\n  ${eng.join('\n  ')}`);
    return lines.join('\n');
  }
  if (op === 'migrate') {
    const copied: { from: string; to: string; file: string }[] = res.copied || [];
    const lines = [`Migrated ${copied.length} asset${copied.length === 1 ? '' : 's'} from ${res.from} to ${res.to} (${res.mode}):`];
    for (const c of copied.slice(0, 40)) lines.push(`  ${c.from} -> ${c.to} (${c.file})`);
    if (copied.length > 40) lines.push(`  and ${copied.length - 40} more`);
    if (res.missing?.length) lines.push(`Missing on disk (${res.missing.length}): ${res.missing.join(', ')}`);
    if (res.scriptDeps?.length) lines.push(`Script dependencies (${res.scriptDeps.length}): ${res.scriptDeps.join(', ')}`);
    if (res.scanned) lines.push('Refreshed AssetRegistry in the open destination editor.');
    return lines.join('\n');
  }
  if (op === 'move') {
    return `Moved ${res.from} to ${res.to} (${res.mode})${res.redirectorsFixed ? ', redirectors fixed' : ''}.`;
  }
  if (op === 'props') {
    const entries = Object.entries(res.properties || {});
    const lines = [`${res.path} (${res.class}${res.isBlueprint ? ' Blueprint CDO' : ''}, ${res.mode}):`];
    if (!entries.length) lines.push('  (no properties)');
    for (const [k, v] of entries.slice(0, 80)) lines.push(`  ${k} = ${JSON.stringify(v)}`);
    if (entries.length > 80) lines.push(`  and ${entries.length - 80} more`);
    return lines.join('\n');
  }
  const setKeys: string[] = res.set || [];
  return `Created ${res.class || 'asset'} at ${res.path} (${res.mode})${setKeys.length ? `, set ${setKeys.join(', ')}` : ''}${res.saved ? ', saved' : ''}.`;
}

async function execute(f: FoundLike, req: ParsedRequest) {
  if (!f.engine) throw new HttpError(400, 'no Unreal Engine found for this project');
  if (req.op === 'migrate') {
    const res = await runMigrate(f, req);
    return { ...res, text: formatText('migrate', res) };
  }
  const projDir = path.dirname(f.path);
  let payload: Record<string, unknown>;
  if (req.op === 'deps') payload = { op: 'deps', path: req.path, soft: !!req.soft, recursive: !!req.recursive };
  else if (req.op === 'props') payload = { op: 'props', path: req.path, keys: req.keys || [] };
  else if (req.op === 'move') payload = { op: 'move', from: req.from, to: req.to };
  else payload = { op: 'new', className: req.className, path: req.path, parent: req.parent || '', set: req.set || {} };

  const { mode, data } = await runAssetOp(projDir, f.name, f.path, f.engine.dir, payload, { write: req.write, timeoutSec: req.timeoutSec });
  const res = { op: req.op, mode, ...data };
  return { ...res, text: formatText(req.op, res) };
}

export { validatePkgPath, parseRequest, runAssetOp, execute };
