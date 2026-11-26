import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execFile, execSync, spawn } from 'child_process';
import { guard, HttpError } from '../base/routes.ts';
import { replace } from '../base/util.ts';
import { UE_CONFIGS as CONFIGS } from '../../public/ue/configs.ts';
import { network } from '../base/live.ts';
import { specDocs, specs } from './specs.ts';
import * as names from './known.ts';
import * as make from './make.ts';
import * as link from './link.ts';
import * as lcGuard from './guard.ts';
import * as editor from './editor.ts';
import * as screenshot from './screenshot.ts';
import { stopUht, uht } from './uht.ts';
import { debugConfig, exeOf } from './debug.ts';
import * as asks from './ask.ts';
import * as assets from './assets.ts';
import * as gate from '../base/runs.ts';
import { isUser } from '../base/user.ts';
import { keepOutDir } from '../base/agentfiles.ts';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { Routes } from '../../public/base/types.ts';
import type { Config } from './debug.ts';

interface Engine {
  id: string;
  dir: string;
  from?: string;
  how?: string;
}
interface Target {
  name: string;
  type: string;
}
interface Found {
  uproject: string;
  path: string;
  name: string;
  assoc: string;
  engine: Engine | null;
  targets: Target[];
  engines: Engine[];
  why: string | null;
  detail: string;
  ok: boolean;
}
interface Problem {
  sev: string;
  file: string;
  line: number;
  col: number;
  code: string;
  text: string;
  n?: number;
}
interface Run {
  id: number;
  action: string;
  target: string;
  config: string;
  state: string;
  phase: string;
  started: number;
  ms: number;
  code: number | null;
  hint: string;
  lines: string[];
  dropped: number;
  problems: Problem[];
  pending: string[];
  timer: ReturnType<typeof setTimeout> | null;
  child: ChildProcessWithoutNullStreams | null;
  cancelled: boolean;
  halt: (() => void) | null;
  ended: ((run: Run) => void)[];
}
type Out = (e: Record<string, unknown>) => void;

const WIN = process.platform === 'win32';
const ACTIONS = ['build', 'rebuild', 'clean', 'generate'];
const MAX_LINES = 50000;
const MAX_PROBLEMS = 5000;
const SEND_LINES = 20000;
const CALM = 100;
const LOG_TAIL = 2 * 1024 * 1024;
const CMD_BAD = /["%^&|<>!\r\n]/;
const TARGET_NAME = /^[\p{L}_][\p{L}\p{N}_]*$/u;

const bat = (dir: string) => path.join(dir, 'Engine', 'Build', 'BatchFiles', 'Build.bat');
const isEngine = (dir: string) => fs.existsSync(bat(dir));

const regQuery = (args: string[]) => new Promise<string>((res) => execFile('reg', ['query', ...args], { windowsHide: true }, (err, out) => res(err ? '' : String(out))));

let addedFile = '';
let okFile = '';
let uhtLog = '';
type Prep = { name: string; kind: string; text: string; by: string; cancel: () => unknown };
type Who = { agent: boolean; chat: string; root: string | null; outside: boolean };
type Debugger = {
  start: (root: string, config: Config, by: string) => Promise<Record<string, unknown>>;
  debugging: (root: string) => boolean;
  sessionOf: (root: string) => unknown;
  ready: () => Record<string, unknown> | null;
  prepare: (root: string, info: Prep | null, failed?: string) => void;
  who: (body: Record<string, unknown>, root: string | null) => Who;
  allow: (w: Who, what: string) => void;
};
type ProjectHooks = {
  resolveWorkspace: (a: { workspace?: unknown; by?: unknown; key?: unknown; pid?: string; wid?: string; cwd?: unknown; targetDir?: string }) => { id: string; name: string };
  validateProjectDir: (dir: string, wid: string | null, opts: { nonUser: boolean }) => Promise<string>;
  registerProject: (dir: string, opts: { wid: string; name?: unknown; create?: boolean }) => Promise<{ id: string; name: string; path: string }>;
};
let debug: Debugger = { start: async () => ({ why: 'no-debugger' }), debugging: () => false, sessionOf: () => null, ready: () => null, prepare: () => {}, who: (_b, root) => ({ agent: false, chat: '', root, outside: false }), allow: () => {} };
let projects: ProjectHooks | null = null;
let findProject: assets.FindProject = () => null;
const init = ({ dataDir, debugger: d, projects: p, findProject: fp }: { dataDir: string; debugger?: Debugger; projects?: ProjectHooks; findProject?: assets.FindProject }) => {
  if (d) debug = d;
  if (p) projects = p;
  if (fp) findProject = fp;
  addedFile = path.join(dataDir, 'ue-engines.json');
  okFile = path.join(dataDir, 'ue-ok.json');
  uhtLog = path.join(dataDir, 'ue-uht-missed.log');
  names.init({ dataDir });
  lcGuard.init(dataDir);
};
async function readAdded(): Promise<string[]> {
  try {
    const list = JSON.parse((await fs.promises.readFile(addedFile, 'utf8')).replace(/^﻿/, ''));
    return Array.isArray(list) ? list.filter((d) => typeof d === 'string' && path.isAbsolute(d)) : [];
  } catch {
    return [];
  }
}
async function writeAdded(list: string[]) {
  await fs.promises.mkdir(path.dirname(addedFile), { recursive: true });
  await fs.promises.writeFile(addedFile + '.tmp', JSON.stringify(list, null, 2) + '\n');
  await fs.promises.rename(addedFile + '.tmp', addedFile);
}
type Ok = { project: string; engine: string };
async function readOk(): Promise<Ok[]> {
  try {
    const list = JSON.parse((await fs.promises.readFile(okFile, 'utf8')).replace(/^\uFEFF/, ''));
    return Array.isArray(list) ? list.filter((x) => typeof x?.project === 'string' && typeof x?.engine === 'string') : [];
  } catch {
    return [];
  }
}
let okWrite: Promise<unknown> = Promise.resolve();
const changeOk = (change: (list: Ok[]) => Ok[]) => {
  const next = okWrite.then(async () => {
    await fs.promises.mkdir(path.dirname(okFile), { recursive: true });
    await replace(okFile, JSON.stringify(change(await readOk()), null, 2) + '\n');
  });
  okWrite = next.catch(() => {});
  return next;
};
async function versionOf(dir: string) {
  try {
    const v = JSON.parse((await fs.promises.readFile(path.join(dir, 'Engine', 'Build', 'Build.version'), 'utf8')).replace(/^﻿/, ''));
    return Number.isInteger(v?.MajorVersion) && Number.isInteger(v?.MinorVersion) ? `${v.MajorVersion}.${v.MinorVersion}` : '';
  } catch {
    return '';
  }
}
const sameDir = (a: string, b: string) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);

let known: Engine[] | null = null;
async function engines(again = false): Promise<Engine[]> {
  if (process.env.MIND_FAKE_UE_ENGINES) return JSON.parse(process.env.MIND_FAKE_UE_ENGINES);
  if (known && !again) return known;
  const found = new Map<string, Engine>();
  const add = (id: string, dir: string, from: string) => {
    dir = path.normalize(String(dir).trim().replace(/^"(.*)"$/, '$1')).replace(/[\\/]+$/, '');
    if (id && !found.has(id) && isEngine(dir)) found.set(id, { id, dir, from });
  };
  const byHand = async () => {
    for (const dir of await readAdded()) {
      if ([...found.values()].some((e) => sameDir(e.dir, dir)) || !isEngine(dir)) continue;
      let id = (await versionOf(dir)) || 'added';
      if (found.has(id)) id += ' (added)';
      for (let i = 2; found.has(id); i++) id = id.replace(/( \d+)?$/, ` ${i}`);
      found.set(id, { id, dir, from: 'added' });
    }
  };
  if (!WIN) {
    await byHand();
    return (known = [...found.values()]);
  }
  let key = '';
  for (const l of (await regQuery(['HKLM\\SOFTWARE\\EpicGames\\Unreal Engine', '/s', '/v', 'InstalledDirectory'])).split(/\r?\n/)) {
    if (/^HKEY_/.test(l)) key = l.trim().split('\\').pop()!;
    const m = /^\s+InstalledDirectory\s+REG_\w+\s+(.+)$/.exec(l);
    if (m && /^5\.\d+$/.test(key)) add(key, m[1], 'launcher');
  }
  try {
    const dat = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat');
    for (const it of JSON.parse(await fs.promises.readFile(dat, 'utf8')).InstallationList || []) {
      const v = /^UE_(5\.\d+)$/.exec(it.AppName || '')?.[1];
      if (v) add(v, it.InstallLocation, 'launcher');
    }
  } catch {}
  for (const l of (await regQuery(['HKCU\\Software\\Epic Games\\Unreal Engine\\Builds'])).split(/\r?\n/)) {
    const m = /^\s+(\S+)\s+REG_\w+\s+(.+)$/.exec(l);
    if (m) add(m[1], m[2], 'source');
  }
  await byHand();
  const ver =(id: string) => (/^\d+\.\d+$/.test(id) ? id.split('.').map(Number) : [0, 0]);
  return (known = [...found.values()].sort((a, b) => ver(b.id)[0] - ver(a.id)[0] || ver(b.id)[1] - ver(a.id)[1]));
}

async function targetsOf(dir: string) {
  const src = path.join(dir, 'Source');
  const names = (await fs.promises.readdir(src).catch(() => [])).filter((f) => /\.Target\.cs$/i.test(f));
  const out: Target[] = [];
  for (const f of names) {
    const name = f.replace(/\.Target\.cs$/i, '');
    if (!TARGET_NAME.test(name)) continue;
    const text = await fs.promises.readFile(path.join(src, f), 'utf8').catch(() => '');
    const type = /TargetType\.(Editor|Game|Client|Server|Program)/.exec(text)?.[1] || (/Editor$/.test(name) ? 'Editor' : 'Game');
    if ((CONFIGS as Record<string, string[]>)[type]) out.push({ name, type });
  }
  return out.sort((a, b) => ((b.type === 'Editor') as any) - ((a.type === 'Editor') as any) || a.name.localeCompare(b.name));
}

function chosenDir(engine: unknown) {
  const dir = path.normalize(String(engine || '').trim());
  if (!path.isAbsolute(dir) || network(dir)) throw new HttpError(400, 'the engine folder must be a full path on this PC');
  return dir.replace(/[\\/]+$/, '');
}

async function find(root: string | null, { uproject = '', engine = '' }: { uproject?: string; engine?: string } = {}, again = false): Promise<Found> {
  const all = await engines(again);
  const r: Found = { uproject: '', path: '', name: '', assoc: '', engine: null, targets: [], engines: all, why: null, detail: '', ok: false };
  if (!WIN && !process.env.MIND_FAKE_UBT) return { ...r, why: 'os' };
  if (!root) return { ...r, why: 'none' };
  const rel = uproject ? guard(String(uproject)) : (await fs.promises.readdir(root).catch(() => [])).find((f) => /\.uproject$/i.test(f));
  if (!rel || !/\.uproject$/i.test(rel)) return { ...r, why: 'none' };
  const full = path.join(root, rel);
  Object.assign(r, { uproject: rel.replace(/\\/g, '/'), path: full, name: path.basename(rel).replace(/\.uproject$/i, '') });
  let json: any;
  try {
    json = JSON.parse((await fs.promises.readFile(full, 'utf8')).replace(/^\uFEFF/, ''));
  } catch (e) {
    return { ...r, why: (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'none' : 'bad-json', detail: (e as NodeJS.ErrnoException).code === 'ENOENT' ? '' : (e as Error).message };
  }
  r.assoc = String(json?.EngineAssociation || '');
  if (engine) {
    const dir = chosenDir(engine);
    const same = all.find((e) => sameDir(e.dir, dir));
    r.engine = { ...(same || { id: '', dir }), how: 'chosen' };
    if (!isEngine(dir)) return { ...r, why: 'not-engine' };
    if (!same) return { ...r, why: 'unlisted' };
  } else {
    const e = all.find((x) => x.id.toLowerCase() === r.assoc.toLowerCase());
    if (!e) return { ...r, why: 'no-engine' };
    r.engine = { ...e, how: 'detected' };
  }
  const at = path.dirname(full), eng = r.engine.dir;
  r.ok = (await readOk()).some((x) => sameDir(x.project, at) && sameDir(x.engine, eng));
  r.targets = await targetsOf(at);
  if (!r.targets.length) return { ...r, why: 'no-targets' };
  return r;
}

async function findToRun(root: string | null, body: { uproject?: string; engine?: string } = {}): Promise<Found> {
  const f = await find(root, body);
  return f.engine && !f.ok && (!f.why || f.why === 'no-targets') ? { ...f, why: 'unconfirmed' } : f;
}

const labelOf = (e: Engine) => (/^\d/.test(e.id) ? `UE ${e.id}` : e.id && e.id !== 'added' ? e.id : 'Unreal Engine');

async function askRun(root: string | null, body: any, f: Found, title: string, warn?: string): Promise<Found> {
  if (!f.engine || !f.path || (f.why && f.why !== 'unconfirmed' && f.why !== 'no-targets')) return f;
  const e = f.engine, how = await gate.ask({ title, text: `${gate.whoAsks(body)} asks for it, with ${labelOf(e)}.`, warn: warn || "This runs the project's own code: its build rules and plugins." }, body.timeout == null ? 300 : Number(body.timeout) || 0);
  if (how !== 'yes') return { ...f, why: `run-${how}` };
  if (f.why === 'unconfirmed') {
    const project = path.dirname(f.path);
    await changeOk((all) => [...all.filter((x) => !sameDir(x.project, project) || !sameDir(x.engine, e.dir)), { project, engine: e.dir }]);
    asks.given(project, e.dir);
  }
  return findToRun(root, body);
}

async function askOk(root: string | null, body: any, f: Found, title: string, warn?: string): Promise<Found> {
  if (!gate.free(body)) return askRun(root, body, f, title, warn);
  if (f.why !== 'unconfirmed' || !asks.watched()) return f;
  const e = f.engine!, label = labelOf(e);
  const how = await asks.wait({ project: path.dirname(f.path), engine: e.dir, name: f.name, label }, body.timeout == null ? 300 : Number(body.timeout) || 0);
  if (how === 'yes') return findToRun(root, body);
  return { ...f, why: how === 'no' ? 'refused' : 'unconfirmed' };
}

function parse(s: string): Problem | null {
  s = String(s).trim();
  let m = /^(.+?)\((\d+)(?:,(\d+))?\)\s*:\s*(fatal error|error|warning)\s*([A-Z]+\d+)?\s*:\s*(.*)$/i.exec(s);
  if (m) return { sev: /error/i.test(m[4]) ? 'error' : 'warning', file: m[1], line: +m[2], col: m[3] ? +m[3] : 0, code: m[5] || '', text: m[6] };
  m = /^([A-Za-z]:[\\/][^:]+|\/[^:]+):(\d+):(\d+):\s*(fatal error|error|warning):\s*(.*)$/.exec(s);
  if (m) return { sev: /error/.test(m[4]) ? 'error' : 'warning', file: m[1], line: +m[2], col: +m[3], code: '', text: m[5] };
  m = /^(.+?)\s*:\s*(fatal error|error|warning)\s+(LNK\d+)\s*:\s*(.*)$/i.exec(s);
  if (m) return { sev: /error/i.test(m[2]) ? 'error' : 'warning', file: '', line: 0, col: 0, code: m[3], text: /^LINK$/i.test(m[1]) ? m[4] : `${m[1]}: ${m[4]}` };
  m = /^ERROR:\s*(.*)$/.exec(s);
  if (m) return { sev: 'error', file: '', line: 0, col: 0, code: '', text: m[1] };
  return null;
}

const runs = new Map<string, Run>();
const subs = new Map<string, Set<Out>>();
const keyOf = (root: string) => path.normalize(root).toLowerCase();
const tell = (k: string, e: Record<string, unknown>) => subs.get(k)?.forEach((out) => out(e));

const counts = (run: Run) => ({ errors: run.problems.filter((p) => p.sev === 'error').length, warnings: run.problems.filter((p) => p.sev === 'warning').length });
const pub = (run: Run | undefined) => run && { id: run.id, action: run.action, target: run.target, config: run.config, state: run.state, started: run.started, ms: run.ms, code: run.code, hint: run.hint, phase: run.phase, dropped: run.dropped, ...counts(run) };

function flush(k: string, run: Run) {
  clearTimeout(run.timer!);
  run.timer = null;
  if (!run.pending.length) return;
  const lines = run.pending;
  run.pending = [];
  tell(k, { type: 'lines', id: run.id, lines });
}

function onLine(k: string, run: Run, text: string) {
  text = String(text).replace(/\x1b\[[\d;]*m/g, '');
  run.lines.push(text);
  if (run.lines.length > MAX_LINES + 5000) {
    run.lines.splice(0, 5000);
    run.dropped += 5000;
  }
  run.pending.push(text);
  const n = run.dropped + run.lines.length - 1;
  const p = parse(text);
  if (p && run.problems.length < MAX_PROBLEMS) {
    p.n = n;
    if (p.code === 'LNK1104' && /\.dll/i.test(p.text)) run.hint ||= 'dll-locked';
    run.problems.push(p);
    flush(k, run);
    tell(k, { type: 'problem', id: run.id, p });
  }
  let hint = run.hint, state = run.state;
  if (/Unable to build while Live Coding is active/i.test(text)) hint = 'livecoding';
  if (/already running, waiting for|waiting for .*(mutex|other|instance|to finish)/i.test(text)) state = 'waiting';
  else if (state === 'waiting') state = 'running';
  if (hint !== run.hint || state !== run.state) {
    Object.assign(run, { hint, state });
    flush(k, run);
    tell(k, { type: 'state', run: pub(run) });
  } else if (!run.timer) run.timer = setTimeout(() => flush(k, run), CALM);
}

const editorOpen = editor.editorOpen;
const UBT_LOG = () => path.join(process.env.LOCALAPPDATA || '', 'UnrealBuildTool', 'Log.txt');
const live = (run: Run | undefined) => !!run && (run.state === 'running' || run.state === 'waiting');
const reopen = new Map<string, { root: string; body: any }>();

function argsOf(f: Found, action: string, t: Target, config: string) {
  if (action === 'generate') return ['-projectfiles', `-project=${f.path}`, '-game', fs.existsSync(path.join(f.engine!.dir, 'Engine', 'Build', 'InstalledBuild.txt')) ? '-rocket' : '-engine', '-progress'];
  return [t.name, 'Win64', config, `-Project=${f.path}`, '-WaitMutex', '-FromMsBuild', ...(action === 'rebuild' ? ['-Rebuild'] : action === 'clean' ? ['-Clean'] : [])];
}

function spawnUbt(f: Found, args: string[]) {
  const fake = process.env.MIND_FAKE_UBT;
  const b = bat(f.engine!.dir), bad = [b, ...args].find((a) => CMD_BAD.test(a));
  if (bad) throw new HttpError(400, `a path or name here has a character cmd would read (" % ^ & | < > !): ${bad}`);
  try {
    if (fake) return spawn(process.execPath, [fake, ...args], { cwd: path.dirname(f.path), windowsHide: true });
    const line = [`"${b}"`, ...args.map((a) => (/\s/.test(a) ? a.replace(/^(-\w+=)?(.*)$/, (m: string, k: string, v: string) => `${k || ''}"${v}"`) : a))].join(' ');
    return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], { cwd: path.dirname(f.path), windowsHide: true, windowsVerbatimArguments: true, env: { ...process.env, NoDefaultCurrentDirectoryInExePath: '1' } });
  } catch (e) {
    throw new HttpError(500, `the build could not start: ${(e as Error).message}`);
  }
}

function newRun(k: string, action: string, target: string, config: string) {
  const run: Run = { id: Date.now(), action, target, config, state: 'running', phase: '', started: Date.now(), ms: 0, code: null, hint: '', lines: [], dropped: 0, problems: [], pending: [], timer: null, child: null, cancelled: false, halt: null, ended: [] };
  runs.set(k, run);
  tell(k, { type: 'all', run: pub(run), lines: [], problems: [] });
  return run;
}

function finish(k: string, run: Run, state: string, code: number | null = null, why = '') {
  if (!live(run)) return;
  if (why) onLine(k, run, why);
  flush(k, run);
  Object.assign(run, { code, ms: Date.now() - run.started, state: run.cancelled ? 'cancelled' : state, child: null, halt: null, phase: '' });
  tell(k, { type: 'state', run: pub(run) });
  for (const fn of run.ended.splice(0)) fn(run);
}

function setPhase(k: string, run: Run, phase: string, line = '') {
  if (line) onLine(k, run, line);
  run.phase = phase;
  flush(k, run);
  tell(k, { type: 'state', run: pub(run) });
}

function pipe(k: string, run: Run, child: ChildProcessWithoutNullStreams, then: (code: number) => void) {
  run.child = child;
  for (const s of [child.stdout, child.stderr]) readline.createInterface({ input: s, crlfDelay: Infinity }).on('line', (l) => onLine(k, run, l));
  let done = false;
  const end = (code: number, why?: string) => {
    if (done) return;
    done = true;
    run.child = null;
    if (why) onLine(k, run, why);
    then(code);
  };
  child.on('error', (e) => end(-1, `the build could not start: ${e.message}`));
  child.on('close', (code) => end(code ?? -1));
}

async function start(root: string | null, { action, target, config, force, uproject, engine }: any = {}) {
  if (!root) throw new HttpError(400, 'a build runs inside a project');
  if (!ACTIONS.includes(action)) throw new HttpError(400, 'no such action');
  const k = keyOf(root), was = runs.get(k);
  if (live(was)) return { running: true, run: pub(was) };
  const f = await findToRun(root, { uproject, engine });
  if (f.why) return { why: f.why };
  const t = f.targets.find((x) => x.name === target) || (action === 'generate' ? f.targets[0] : null);
  if (!t) throw new HttpError(400, 'no such target');
  if (action !== 'generate' && !(CONFIGS as Record<string, string[]>)[t.type].includes(config)) throw new HttpError(400, 'no such configuration');
  if (!force && t.type === 'Editor' && (action === 'build' || action === 'rebuild') && (await editorOpen(f.path))) return { editor: true };
  const child = spawnUbt(f, argsOf(f, action, t, config));
  const run = newRun(k, action, t.name, action === 'generate' ? '' : config);
  pipe(k, run, child, (code) => finish(k, run, code === 0 ? 'ok' : 'failed', code));
  const again = reopen.get(k);
  if (again && t.type === 'Editor' && (action === 'build' || action === 'rebuild'))
    run.ended.push((r) => {
      if (r.state !== 'ok' || reopen.get(k) !== again) return;
      reopen.delete(k);
      openEditor(root, again.body).catch(() => {});
    });
  return { ok: true, run: pub(run) };
}

const LC_END: [RegExp, string, string][] = [
  [/^Live coding succeeded, no code changes detected/, 'ok', 'nochanges'],
  [/^Live coding succeeded, data type changes/, 'ok', 'restart'],
  [/^Live coding succeeded/, 'ok', ''],
  [/^Live coding failed/, 'failed', ''],
  [/^Live coding canceled/, 'cancelled', ''],
  [/^Unable to start live coding session/, 'failed', ''],
];

async function ubtProblems(k: string, run: Run, since: number) {
  try {
    const st = await fs.promises.stat(UBT_LOG());
    if (st.mtimeMs < since - 2000) return;
    const text = await fs.promises.readFile(UBT_LOG(), 'utf8');
    for (const l of text.split(/\r?\n/)) if (parse(l) || /^Result: /.test(l)) onLine(k, run, l);
  } catch {}
}

const editorTarget = (f: Found, name?: string) => f.targets.find((x) => x.name === name && x.type === 'Editor') || f.targets.find((x) => x.type === 'Editor') || null;

async function liveCoding(root: string | null, body: any = {}) {
  if (!root) throw new HttpError(400, 'Live Coding runs inside a project');
  const k = keyOf(root), was = runs.get(k);
  if (live(was)) return { running: true, run: pub(was) };
  const f = await find(root, body);
  if (f.why) return { why: f.why };
  const dir = path.dirname(f.path);
  if (!(await link.state(dir)).linked) return { why: (await editorOpen(f.path)) ? 'unlinked' : 'closed' };
  if (!body.anyway) {
    const proc = await editor.editorProc(f.path);
    await lcGuard.ensure(k, dir, proc.started, proc.pid);
    const risks = await lcGuard.risks(k, dir);
    if (risks.length) return { refused: 'restart', files: risks };
  }
  const file = editor.logFile(f), since = Date.now();
  let off = await fs.promises.stat(file).then((s) => s.size, () => 0);
  const run = newRun(k, 'livecoding', editorTarget(f)?.name || f.name, '');
  onLine(k, run, `Live Coding ${f.name} in the open Unreal Editor`);
  let timer: ReturnType<typeof setTimeout> | null = null, prev: editor.Row | null = null;
  const stopAt = Date.now() + 10 * 60e3;
  const end = async (state: string, why = '') => {
    if (timer) clearTimeout(timer);
    if (!live(run)) return;
    await ubtProblems(k, run, since);
    if (state === 'ok') await lcGuard.rebase(k, dir).then(() => editor.recheck(k)).catch(() => {});
    finish(k, run, state, state === 'ok' ? 0 : 1, why);
  };
  run.halt = () => {
    end('cancelled', 'Amethyst stopped following this Live Coding compile (Unreal has no way to cancel it from outside).');
  };
  const poll = async () => {
    timer = null;
    if (!live(run)) return;
    try {
      const st = await fs.promises.stat(file);
      if (st.size < off) off = 0;
      if (st.size > off) {
        const fh = await fs.promises.open(file, 'r');
        const buf = Buffer.alloc(st.size - off);
        await fh.read(buf, 0, buf.length, off).finally(() => fh.close());
        const cut = buf.lastIndexOf(10);
        const show = (r: editor.Row) => {
          const lines = r.x.split('\n');
          onLine(k, run, (r.c ? `${r.c}: ${r.v === 'Log' ? '' : r.v + ': '}` : '') + lines[0]);
          for (const l of lines.slice(1)) onLine(k, run, l);
        };
        const result = (r: editor.Row) => (r.c === 'LogLiveCoding' ? LC_END.find(([re]) => re.test(r.x)) : undefined);
        const stopWith = (hit: [RegExp, string, string]) => {
          if (hit[2]) run.hint = hit[2];
          return end(hit[1]);
        };
        if (cut >= 0) {
          off += cut + 1;
          for (const r of editor.parseLines(buf.subarray(0, cut).toString('utf8'), prev, 0)) {
            prev = r;
            if (r.c && r.c !== 'LogLiveCoding' && !/Re-instancing|^Reload/.test(r.x)) continue;
            show(r);
            const hit = result(r);
            if (hit) return stopWith(hit);
          }
        }
        const last = editor.parseLines(buf.subarray(cut + 1).toString('utf8'), null, 0)[0];
        const hit = last && result(last);
        if (hit) {
          show(last);
          return stopWith(hit);
        }
      }
    } catch {}
    if (Date.now() > stopAt) return end('failed', 'No answer from Live Coding in 10 minutes.');
    timer = setTimeout(poll, 250);
  };
  try {
    await link.liveCompile(dir);
  } catch (e) {
    await end('failed', `Live Coding could not start: ${(e as Error).message}`);
    return { ok: false, run: pub(run), problems: run.problems };
  }
  const done = new Promise((r) => run.ended.push(r));
  poll();
  if (!body.wait) return { ok: true, run: pub(run) };
  await done;
  return { ok: run.state === 'ok', run: pub(run), problems: run.problems };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function restart(root: string | null, body: any = {}) {
  if (!root) throw new HttpError(400, 'a restart runs inside a project');
  const k = keyOf(root), was = runs.get(k);
  if (live(was)) return { running: true, run: pub(was) };
  const f = await findToRun(root, body);
  if (f.why) return { why: f.why };
  const t = editorTarget(f, body.target);
  if (!t) throw new HttpError(400, 'no Editor target to build');
  const config = CONFIGS.Editor.includes(body.config) ? body.config : 'Development';
  const dir = path.dirname(f.path);
  const again = { uproject: body.uproject, engine: body.engine, plain: body.plain };
  reopen.delete(k);
  const run = newRun(k, 'restart', t.name, config);
  const flow = async () => {
    if (await editorOpen(f.path)) {
      let wait = 10 * 60e3;
      if ((await link.state(dir)).linked) {
        setPhase(k, run, 'saving', 'Saving: Unreal shows its save dialog if anything is unsaved.');
        let saved = false;
        try {
          saved = await link.save(dir);
        } catch (e) {
          return finish(k, run, 'failed', 1, `Could not save: ${(e as Error).message}. The editor stays open.`);
        }
        if (!live(run)) return;
        if (!saved) {
          run.hint = 'notsaved';
          return finish(k, run, 'failed', 1, 'Nothing was closed: the save dialog was cancelled, or a save failed. The editor stays open.');
        }
        setPhase(k, run, 'closing', 'Closing Unreal Editor…');
        await link.quit(dir).catch(() => {});
        wait = 90e3;
      } else setPhase(k, run, 'waiting', "Close Unreal Editor yourself: Amethyst can't reach it (it wasn't opened from Amethyst). The build starts when it's closed.");
      for (const end = Date.now() + wait; await editorOpen(f.path); ) {
        if (!live(run)) return;
        if (Date.now() > end) return finish(k, run, 'failed', 1, 'Unreal Editor did not close.');
        await sleep(1000);
      }
    }
    if (!live(run)) return;
    setPhase(k, run, 'building', `Building ${t.name} · ${config}`);
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnUbt(f, argsOf(f, 'build', t, config));
    } catch (e) {
      return finish(k, run, 'failed', -1, (e as Error).message);
    }
    pipe(k, run, child, async (code) => {
      if (code !== 0 || run.cancelled) {
        if (!run.cancelled) reopen.set(k, { root, body: again });
        return finish(k, run, 'failed', code, run.cancelled ? '' : 'The build failed: fix the errors and build again; the editor opens when a build succeeds.');
      }
      setPhase(k, run, 'opening', 'Opening Unreal Editor…');
      const r: any = await openEditor(root, again).catch((e: Error) => ({ error: e.message }));
      finish(k, run, 'ok', 0, r.error ? `Built, but the editor did not open: ${r.error}` : '');
    });
  };
  run.halt = () => {
    reopen.delete(k);
    if (run.child) killTree(run.child);
    else finish(k, run, 'cancelled');
  };
  const done = new Promise((r) => run.ended.push(r));
  flow().catch((e) => finish(k, run, 'failed', 1, (e as Error).message));
  if (!body.wait) return { ok: true, run: pub(run) };
  await done;
  return { ok: run.state === 'ok', run: pub(run), problems: run.problems };
}

function killTree(child: ChildProcessWithoutNullStreams | null, sync = false) {
  if (!child?.pid) return;
  if (!WIN) {
    try {
      child.kill();
    } catch {}
    return;
  }
  const cmd = `taskkill /pid ${child.pid} /T /F`;
  if (sync) {
    try {
      execSync(cmd, { stdio: 'ignore', windowsHide: true });
    } catch {}
  } else execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
}

function cancel(root: string | null) {
  const k = keyOf(root || ''), run = runs.get(k);
  reopen.delete(k);
  if (!run || !live(run)) return { ok: true };
  run.cancelled = true;
  if (run.halt) run.halt();
  else killTree(run.child);
  return { ok: true };
}

function stopAll() {
  for (const run of runs.values()) if (run.child) killTree(run.child, true);
  editor.stopAll();
  stopUht();
}

async function headerTool(root: string | null, body: any = {}) {
  if (!root) return { state: 'off', why: 'none', last: null };
  const f = await findToRun(root, { uproject: body.uproject, engine: body.engine });
  if (!f.engine || !f.path || (f.why && f.why !== 'no-targets')) return { state: 'off', why: f.why || 'none', last: null };
  const k = keyOf(root);
  return uht({ key: k, root: path.dirname(f.path), uproject: f.path, engine: f.engine.dir, busy: () => live(runs.get(k)), parse, tell: (e) => tell(k, e), log: uhtLog }, { run: !!body.run, soon: !!body.soon });
}

function follow(root: string | null, out: Out) {
  if (!root) return null;
  const k = keyOf(root), run = runs.get(k);
  if (run) flush(k, run);
  headerTool(root).then((v) => v.state !== 'off' && out({ type: 'uht', ...v })).catch(() => {});
  out({ type: 'all', run: pub(run) || null, lines: run ? run.lines.slice(-SEND_LINES) : [], skipped: run ? run.dropped + Math.max(0, run.lines.length - SEND_LINES) : 0, problems: run ? run.problems : [] });
  if (!subs.has(k)) subs.set(k, new Set());
  subs.get(k)!.add(out);
  let stopEd: (() => void) | null = null, gone = false;
  find(root)
    .then(async (f) => {
      if (gone || !f.path || f.why === 'os') return;
      const s = await editor.watch(k, { root, path: f.path, name: f.name }, out);
      if (gone) s();
      else stopEd = s;
    })
    .catch(() => {});
  return () => {
    gone = true;
    stopEd?.();
    subs.get(k)?.delete(out);
  };
}

const LINK_ARGS = [
  '-EnablePlugins=PythonScriptPlugin',
  '-ini:Engine:[/Script/PythonScriptPlugin.PythonScriptPluginSettings]:bRemoteExecution=True',
  '-ini:Engine:[/Script/PythonScriptPlugin.PythonScriptPluginSettings]:RemoteExecutionMulticastBindAddress=127.0.0.1',
  '-ini:Engine:[/Script/PythonScriptPlugin.PythonScriptPluginSettings]:RemoteExecutionMulticastTtl=0',
];

async function openEditor(root: string | null, body: { uproject?: string; engine?: string; plain?: boolean }) {
  const f = await findToRun(root, body);
  if (f.why && f.why !== 'no-targets') return { why: f.why };
  if (await editorOpen(f.path)) return { open: true };
  const exe = path.join(f.engine!.dir, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe');
  const args = [f.path, ...(body.plain ? [] : LINK_ARGS)];
  const k = keyOf(root!);
  const ready = (pid: number) => lcGuard.rebase(k, path.dirname(f.path), pid).then(() => (editor.opened(k, pid), editor.recheck(k))).catch(() => {});
  if (process.env.MIND_FAKE_EXPLORER) {
    await fs.promises.appendFile(process.env.MIND_FAKE_EXPLORER, `ue-editor:${f.path}\n${JSON.stringify({ exe, args })}\n`);
    await ready(editor.fakePid());
    return { ok: true, linked: !body.plain };
  }
  if (!fs.existsSync(exe)) throw new HttpError(404, `no UnrealEditor.exe in ${path.dirname(exe)}`);
  const p = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: false });
  p.on('error', () => {});
  p.unref();
  await ready(p.pid || 0);
  return { ok: true, linked: !body.plain };
}

async function startDebug(root: string | null, body: any = {}) {
  const f = await findToRun(root, body);
  if (!root || !f.engine || (f.why && f.why !== 'no-targets')) return { why: f.why || 'none', ...(['unlisted', 'unconfirmed'].includes(f.why || '') ? { detail: sayWhy(f) } : {}) };
  if (debug.debugging(root)) return { why: 'debugging', session: debug.sessionOf(root) };
  let mode: 'editor' | 'game' | 'attach' = body.mode === 'game' ? 'game' : body.mode === 'attach' ? 'attach' : 'editor';
  const t = editorTarget(f, body.target);
  if (!t) return { why: 'no-editor-target' };
  const config = (CONFIGS as Record<string, string[]>)[t.type].includes(body.config) ? body.config : 'DebugGame';
  let pid = 0, running = '';
  if (mode !== 'game') {
    const p = await editor.editorProc(f.path);
    if (p.open) {
      if (body.agent === true && body.pid && Number(body.pid) !== p.pid) return { why: 'not-yours', detail: `an agent attaches only to this project's own Unreal Editor (pid ${p.pid}), not to process ${body.pid}` };
      mode = 'attach';
      pid = Number(body.pid) || p.pid;
      running = await exeOf(pid);
    } else if (mode === 'attach') return { why: 'no-editor', detail: `Unreal Editor isn't running ${f.name}` };
  }
  const by = body.by === 'agent' ? 'agent' : 'you', engine = f.engine;
  const missing = debug.ready();
  if (missing) return { why: 'engine', engine: missing };
  const go = async () => {
    const r = await debugConfig({ engineDir: engine.dir, uproject: f.path, name: f.name, target: t, config, mode, pid, running });
    if (!r.config) return { why: r.why, detail: r.detail || '', target: t.name, config };
    r.config.exceptions = [...(body.ensure === false ? [] : ['ensure']), ...(body.cpp === true ? ['cpp'] : [])];
    const out = await debug.start(root, r.config, by);
    return { ...out, why: out.why || null, attached: mode === 'attach', target: t.name, config };
  };
  if (mode === 'attach' || body.build === false) return go();
  const b = await start(root, { action: 'build', target: t.name, config, uproject: body.uproject, engine: body.engine });
  if (b.why) return { why: b.why };
  const run = runs.get(keyOf(root));
  if (!run || !live(run)) return go();
  const name = `${f.name} · ${mode === 'game' ? 'game' : 'Unreal Editor'}`;
  debug.prepare(root, { name, kind: mode, text: `building ${t.name} ${config}`, by, cancel: () => cancel(root) });
  run.ended.push((done) => {
    if (done.state !== 'ok') {
      const errors = done.problems.filter((x) => x.sev === 'error').length;
      return debug.prepare(root, null, done.state === 'cancelled' || run.cancelled ? 'the build was cancelled' : `the build failed${errors ? `: ${errors} error${errors === 1 ? '' : 's'}, in the build window` : ''}`);
    }
    go()
      .then((r) => r.why && r.why !== 'debugging' && debug.prepare(root, null, String((r as { detail?: string }).detail || r.why)))
      .catch((e) => debug.prepare(root, null, (e as Error).message));
  });
  return { ok: true, building: true, target: t.name, config, attached: false };
}

const START_WHY: Record<string, string> = {
  engine: "the debugger isn't downloaded: the user downloads it in Settings → Unreal → debugger (about 17 MB, with Microsoft's licence to accept)",
  'no-editor-target': 'this project has no Editor target (Source/<Name>Editor.Target.cs)',
  'no-editor': "Unreal Editor isn't running this project: debug start without --attach starts it",
  os: 'debugging Unreal is on Windows only for now',
  none: 'this project has no .uproject',
};
function sayStart(r: Record<string, any>, mode: string) {
  if (r.why === 'debugging') return 'already debugging: debug status says where it is; debug stop first to start again';
  if (r.why) return `${r.detail || START_WHY[r.why] || r.why}${r.why === 'not-built' ? `: build ${r.target} ${r.config} first (or debug start without --no-build)` : ''}`;
  const what = mode === 'game' ? 'the game (Unreal Editor with -game)' : 'Unreal Editor';
  if (r.building) return `building ${r.target} ${r.config}, then ${what} starts under the debugger. debug wait returns when it stops at a breakpoint, or says why it didn't start.`;
  if (r.attached) return `attached to the open Unreal Editor (it runs on). debug wait returns at the next stop.`;
  return `started ${what} under the debugger (${r.target} ${r.config}). debug wait returns at the first stop.`;
}

async function editorState(root: string | null, body: any = {}) {
  const f = await find(root, body);
  if (!f.path || f.why === 'os') return { why: f.why || 'none', open: false, linked: false, playing: false, guard: [] };
  const k = keyOf(root!), dir = path.dirname(f.path), seen = editor.now(k);
  if (seen && !body.again) return { why: null, ...seen };
  const linked = (await link.state(dir)).linked;
  const p = await editor.editorProc(f.path);
  if (linked) p.open = true;
  if (p.open) await lcGuard.ensure(k, dir, p.started, p.pid);
  return { why: null, open: p.open, linked, playing: linked ? await link.isPlaying(dir).catch(() => false) : false, guard: p.open ? await lcGuard.risks(k, dir) : [] };
}

async function play(root: string | null, body: any = {}) {
  const f = await find(root, body);
  if (!f.path || f.why === 'os') return { why: f.why || 'none' };
  const dir = path.dirname(f.path);
  if (!(await link.state(dir)).linked) return { why: (await editorOpen(f.path)) ? 'unlinked' : 'closed' };
  await (body.stop ? link.stop(dir) : link.play(dir));
  for (let i = 0; i < 20; i++) {
    const on = await link.isPlaying(dir).catch(() => !body.stop);
    if (on === !body.stop) return { ok: true, playing: on };
    await sleep(250);
  }
  return { ok: true, playing: await link.isPlaying(dir).catch(() => false) };
}

async function readLog(root: string | null, { which, uproject, engine, category, verbosity, since, lines, rows }: any = {}) {
  let file: string;
  if (which === 'ubt') file = UBT_LOG();
  else if (which === 'editor') {
    const f = await find(root, { uproject, engine });
    if (!f.path) return { why: f.why || 'none' };
    if (rows || category || verbosity || since || lines) return editor.readRows({ root: root!, path: f.path, name: f.name }, { category, verbosity, since: Number(since) || 0, lines: Number(lines) || 0 });
    file = editor.logFile(f);
  } else throw new HttpError(400, 'which log?');
  let fh;
  try {
    fh = await fs.promises.open(file, 'r');
  } catch {
    return { path: file, missing: true };
  }
  try {
    const { size, mtimeMs } = await fh.stat();
    const from = Math.max(0, size - LOG_TAIL), buf = Buffer.alloc(size - from);
    await fh.read(buf, 0, buf.length, from);
    return { path: file, text: buf.toString('utf8').replace(/^﻿/, ''), cut: from > 0, mtime: mtimeMs };
  } finally {
    await fh.close();
  }
}

const FIND_WHY: Record<string, string> = {
  none: 'this folder has no .uproject: amethyst ue project <Name> makes one',
  'no-targets': 'this project has no Source/*.Target.cs to build',
  os: 'the Unreal commands work on Windows only for now',
  'bad-json': "the .uproject isn't valid JSON",
  'not-engine': "that folder isn't an Unreal Engine: it has no Engine\\Build\\BatchFiles\\Build.bat",
  unconfirmed: "this engine waits for the user's OK in Amethyst: they click Allow in the prompt Amethyst shows, or 'use this engine' in the project's build window (the Unreal build button in the rail opens it). amethyst ue wait waits for it",
  refused: 'the user said not now to this engine for this project: ask them before trying again',
  ...Object.fromEntries(Object.entries(gate.SAID).map(([k, v]) => [`run-${k}`, v])),
};
type Why = { why?: string | null; assoc?: string; detail?: string; engine?: Engine | null };
function sayWhy(f: Why) {
  if (f.why === 'unlisted') return `Amethyst doesn't know the engine in ${f.engine?.dir}: add it in Amethyst's Unreal settings first`;
  if (f.why === 'no-engine') return `the .uproject asks for engine "${f.assoc}", which Amethyst doesn't know: add that engine in Amethyst's Unreal settings`;
  return (FIND_WHY[f.why || ''] || f.why || 'the Unreal project is not ready') + (f.detail ? `: ${f.detail}` : '');
}
const refuse = (f: Why): never => {
  throw new HttpError(f.why?.startsWith('run-') ? 403 : 400, sayWhy(f));
};
const secs = (ms: number) => `${Math.round(ms / 1000)} s`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const relTo = (root: string, f: string) => {
  const r = path.relative(root, f);
  return !f || !path.isAbsolute(f) || r.startsWith('..') || path.isAbsolute(r) ? f : r.replace(/\\/g, '/');
};

function waitEnd(run: Run, timeout: number) {
  if (!live(run)) return Promise.resolve(true);
  return new Promise<boolean>((res) => {
    const t = timeout > 0 ? setTimeout(() => res(false), timeout * 1000) : null;
    run.ended.push(() => {
      if (t) clearTimeout(t);
      res(true);
    });
  });
}

const HINTS: Record<string, string> = {
  livecoding: 'Live Coding is on in the open Unreal Editor, so the build was refused: close the editor and build again',
  'dll-locked': 'a .dll is locked, most likely by the open Unreal Editor: close it and build again',
};
function sayRun(root: string, run: Run, done: boolean) {
  const what = run.action === 'generate' ? 'generate project files' : `${run.action} ${run.target} ${run.config}`;
  if (!done) return `${what}: still running after ${secs(Date.now() - run.started)}. amethyst ue wait returns when it ends; amethyst ue cancel stops it.`;
  const { errors, warnings } = counts(run);
  const head = run.state === 'ok' ? `${what}: succeeded in ${secs(run.ms)}` : run.state === 'cancelled' ? `${what}: cancelled` : `${what}: failed after ${secs(run.ms)}${run.code != null ? ` (exit code ${run.code})` : ''}`;
  const out = [`${head}, ${plural(errors, 'error')}, ${plural(warnings, 'warning')}.`];
  if (run.hint && HINTS[run.hint]) out.push(HINTS[run.hint] + '.');
  const shown = [...run.problems.filter((p) => p.sev === 'error'), ...run.problems.filter((p) => p.sev !== 'error')].slice(0, 40);
  for (const p of shown) out.push(`${p.sev}${p.code ? ' ' + p.code : ''}: ${p.file ? `${relTo(root, p.file)}${p.line ? ':' + p.line + (p.col ? ':' + p.col : '') : ''}: ` : ''}${p.text}`);
  if (run.problems.length > shown.length) out.push(`and ${run.problems.length - shown.length} more`);
  if (run.state === 'failed' && !errors) out.push('Its last lines:', ...run.lines.slice(-30));
  return out.join('\n');
}

async function cmdRun(root: string | null, body: any, action: string) {
  if (!root) throw new HttpError(400, 'run it inside an Unreal project folder');
  const pre = await findToRun(root, body);
  const f = await askOk(root, body, pre, `Allow ${action === 'generate' ? 'project files for' : action === 'clean' ? 'a clean of' : action === 'rebuild' ? 'a rebuild of' : 'a build of'} ${pre.name || 'this project'}?`);
  if (f.why) refuse(f);
  let target = '', config = '';
  if (action !== 'generate') {
    const t = body.target ? f.targets.find((x) => x.name.toLowerCase() === String(body.target).toLowerCase()) : editorTarget(f) || f.targets[0];
    if (!t) throw new HttpError(400, `no target ${body.target}: this project has ${f.targets.map((x) => x.name).join(', ')}`);
    const all = (CONFIGS as Record<string, string[]>)[t.type];
    config = body.config ? all.find((c) => c.toLowerCase() === String(body.config).toLowerCase()) || '' : 'Development';
    if (!config) throw new HttpError(400, `no configuration ${body.config} for ${t.name}: it has ${all.join(', ')}`);
    target = t.name;
  }
  const k = keyOf(root);
  const r: any = await start(root, { action, target, config, force: !!body.force, uproject: body.uproject, engine: body.engine });
  if (r.why) refuse(r);
  if (r.editor) throw new HttpError(409, `Unreal Editor is open on ${f.name}, and building ${target} while it runs fails on its locked files: close the editor first, or pass --force to build anyway`);
  const run = runs.get(k)!;
  if (r.running) throw new HttpError(409, `another build is running here: ${sayRun(root, run, false)}`);
  const done = await waitEnd(run, body.timeout == null ? 300 : Number(body.timeout) || 0);
  return { text: sayRun(root, run, done), run: pub(run), problems: run.problems };
}

const editorBuilt = (f: Found) => (fs.existsSync(path.join(path.dirname(f.path), 'Binaries', 'Win64')) ? fs.readdirSync(path.join(path.dirname(f.path), 'Binaries', 'Win64'), { withFileTypes: true }) : []).some((d) => /^UnrealEditor-.+\.dll$/i.test(d.name));

async function newestEngine(want: string) {
  const all = await engines();
  if (want) {
    const byId = all.find((e) => e.id.toLowerCase() === want.toLowerCase());
    if (byId) return byId;
    if (path.isAbsolute(want)) {
      const dir = chosenDir(want), same = all.find((e) => sameDir(e.dir, dir));
      if (same) return same;
      throw new HttpError(400, `Amethyst doesn't know the engine in ${dir}: add it in Amethyst's Unreal settings first`);
    }
    throw new HttpError(400, `no engine ${want}: Amethyst knows ${all.map((e) => e.id).join(', ') || 'none'}`);
  }
  const v = (id: string) => id.split('.').map((n) => Number(n) || 0);
  const ver = all.filter((e) => /^\d+\.\d+$/.test(e.id)).sort((a, b) => v(b.id)[0] - v(a.id)[0] || v(b.id)[1] - v(a.id)[1]);
  if (!ver[0]) throw new HttpError(400, "Amethyst knows no Unreal Engine on this PC: install one, or add it in Amethyst's Unreal settings, or pass --engine");
  return ver[0];
}

function sayMade(r: any) {
  const made: string[] = r.made || [r.header, r.source].filter(Boolean);
  const out = made.map((m) => `made ${m}`);
  for (const e of r.edits || []) out.push(`changed ${e.path}`);
  if (r.manual) out.push(`still to do by hand: ${r.manual}`);
  return out;
}

async function requireLinkedEditor(f: Found, hintWindow = false) {
  const dir = path.dirname(f.path);
  const proc = await editor.editorProc(f.path);
  if (!proc.open || proc.pid <= 0) {
    throw new HttpError(409, `Unreal Editor is not open on ${f.name}: open it with amethyst ue editor first`);
  }
  const node = await link.verifyNode(dir, proc.pid);
  if (!node) {
    const extra = hintWindow ? ', or pass --window to capture the editor window directly' : '';
    throw new HttpError(
      409,
      `Unreal Editor on ${f.name} is not linked for remote execution: open it via amethyst ue editor, or enable Remote Execution in PythonScriptPlugin settings${extra}`,
    );
  }
  return { dir, proc, node };
}

function formatPyOutput(r: link.Result, evalMode: boolean) {
  const lines: string[] = [];
  for (const o of r.output || []) {
    const txt = String(o?.output ?? '').replace(/\r?\n$/, '');
    if (!txt) continue;
    const kind = String(o?.type || '');
    lines.push(kind === 'Warning' || kind === 'Error' ? `${kind}: ${txt}` : txt);
  }
  const res = String(r.result ?? '').trim();
  if (res && res !== 'None' && (evalMode || !lines.length)) lines.push(res);
  return lines.join('\n') || (r.success ? '(no output)' : 'Python execution failed');
}

interface ModuleEntry {
  name: string;
  file: string;
  loaded: boolean;
  scope: 'project' | 'plugin' | 'engine';
}

const MODULE_LINE = /(?:^|:\s+)\s*([^\s\[\]:]+)\s+\[File:\s*(.*?)\]\s+\[Loaded:\s*(Yes|No)\]/i;

function parseModuleList(lines: string[], projDir: string): ModuleEntry[] {
  const normProj = path.resolve(projDir).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const out: ModuleEntry[] = [];
  for (const line of lines) {
    const m = MODULE_LINE.exec(line);
    if (!m) continue;
    const name = m[1];
    const file = m[2].trim();
    const loaded = /^yes$/i.test(m[3]);
    const normFile = file.replace(/\\/g, '/').toLowerCase();
    const scope: 'project' | 'plugin' | 'engine' = normFile.startsWith(normProj + '/plugins/')
      ? 'plugin'
      : normFile.startsWith(normProj + '/')
        ? 'project'
        : 'engine';
    out.push({ name, file, loaded, scope });
  }
  return out;
}

const CMD_ROUTES: Routes = {
  'POST /api/ue/cmd/build': async (body, _, root: string | null) => cmdRun(root, body || {}, body?.clean ? 'clean' : body?.rebuild ? 'rebuild' : 'build'),
  'POST /api/ue/cmd/generate': async (body, _, root: string | null) => cmdRun(root, body || {}, 'generate'),
  'POST /api/ue/cmd/wait': async (body, _, root: string | null) => {
    const secs = body?.timeout == null ? 300 : Number(body.timeout) || 0;
    const f = root ? await find(root, body || {}) : null, a = f?.path ? asks.pendingIn(path.dirname(f.path)) : null;
    if (a) {
      if (!(await asks.whenEnded(a, secs))) return { text: `${f!.name} still waits for the user's OK in Amethyst; amethyst ue wait waits on` };
      for (let i = 0; i < 20 && !live(runs.get(keyOf(root!))); i++) await sleep(100);
    }
    const run = root ? runs.get(keyOf(root)) : undefined;
    if (!run) return { text: a ? 'the OK ended without a build: the waiting command says why' : 'nothing has been built here since Amethyst started' };
    const done = await waitEnd(run, secs);
    return { text: sayRun(root!, run, done), run: pub(run), problems: run.problems };
  },
  'POST /api/ue/cmd/cancel': async (_, __, root: string | null) => {
    const run = root ? runs.get(keyOf(root)) : undefined;
    if (!run || !live(run)) return { text: 'nothing is building here' };
    cancel(root);
    await waitEnd(run, 30);
    return { text: sayRun(root!, run, !live(run)) };
  },
  'POST /api/ue/cmd/editor': async (body, _, root: string | null) => {
    if (body?.close) {
      const f = await find(root, body || {});
      if (!f.path || f.why === 'os') refuse(f);
      await gate.mayRun(
        body,
        (who) => ({
          title: `Allow closing Unreal Editor on ${f.name}?`,
          text: `${who} asks to close Unreal Editor on ${f.name}.`,
          warn: 'Unsaved work in Unreal Editor may prompt to save before closing.',
        }),
        300,
      );
      const wait = body?.timeout == null ? 15 : Number(body.timeout) || 0;
      const r = await editor.closeEditor(f.path, wait);
      if (!r.open && !r.closed) return { ok: true, open: false, closed: false, text: `Unreal Editor is not open on ${f.name}` };
      if (r.closed) return { ok: true, open: false, closed: true, pid: r.pid, text: `Closed Unreal Editor on ${f.name}` };
      if (r.why === 'nowindow') throw new HttpError(409, `Unreal Editor on ${f.name} has no main window to close yet (it may still be starting): wait for it to finish loading or close it yourself`);
      if (r.why === 'error') throw new HttpError(500, `could not ask Unreal Editor on ${f.name} to close`);
      throw new HttpError(409, `Unreal Editor on ${f.name} is still open after ${wait} s: it may be waiting on a Save dialog for unsaved changes. Save or close it in Unreal Editor before building.`);
    }
    const pre = await findToRun(root, body || {});
    const f = await askOk(root, body || {}, pre, `Allow opening Unreal Editor on ${pre.name || 'this project'}?`);
    if (f.why) refuse(f);
    if (!(await editorOpen(f.path)) && !body?.force && fs.existsSync(path.join(path.dirname(f.path), 'Source')) && !editorBuilt(f)) {
      const t = editorTarget(f);
      throw new HttpError(400, `${t?.name || 'the Editor target'} isn't built yet, so Unreal would stop at a dialog asking to build it: run amethyst ue build first (or pass --force)`);
    }
    const r: any = await openEditor(root, { uproject: body?.uproject, engine: body?.engine });
    if (r.why) refuse(r);
    if (r.open) return { ...r, text: `Unreal Editor is already open on ${f.name}` };
    return { ...r, text: `Unreal Editor is starting on ${f.name}. It takes a while: amethyst ue log --lines 50 shows how far it got.` };
  },
  'POST /api/ue/cmd/log': async (body, _, root: string | null) => {
    const b = body || {}, which = String(b.which || 'editor'), n = Number(b.lines) || 100;
    if (which === 'ubt') {
      const r: any = await readLog(root, { which });
      if (r.missing) return { ...r, text: `no UnrealBuildTool log yet at ${r.path}` };
      const lines = String(r.text).split(/\r?\n/).filter((l) => l.trim()).slice(-n);
      return { path: r.path, text: [`${r.path}, its last ${plural(lines.length, 'line')}:`, ...lines].join('\n') };
    }
    if (which !== 'editor') throw new HttpError(400, 'which log: editor (the default) or ubt');
    const since = Number(b.since) > 0 ? Date.now() - Number(b.since) * 1000 : 0;
    const r: any = await readLog(root, { which, uproject: b.uproject, engine: b.engine, category: b.category, verbosity: b.verbosity, since, lines: n, rows: true });
    if (r.why) refuse(r);
    if (r.missing) return { ...r, text: `no editor log yet at ${r.path}: Unreal Editor writes it when it starts` };
    const rows = r.rows as editor.Row[];
    const line = (x: editor.Row) => `${x.t ? x.t + ' ' : ''}${x.c ? x.c + ': ' : ''}${x.v !== 'Log' && x.v !== 'Display' ? x.v + ': ' : ''}${x.x}`;
    return { ...r, text: [`${r.path}, ${plural(rows.length, 'line')}${b.category ? ` of ${b.category}` : ''}:`, ...rows.map(line)].join('\n') };
  },
  'POST /api/ue/cmd/new': async (body, _, root: string | null) => {
    const b = { ...(body || {}) }, kind = String(b.kind || '');
    if (!['class', 'module', 'plugin'].includes(kind)) throw new HttpError(400, 'what to make: class, module or plugin');
    const f = await find(root, b);
    if (f.why && !(f.why === 'no-targets' && kind === 'plugin')) refuse(f);
    if (kind === 'class') {
      b.parent = b.parent == null ? 'UObject' : String(b.parent);
      b.dir = b.dir || `Source/${f.name}`;
      if (b.parent && b.parent !== 'UInterface') await names.settle(f.engine!.dir);
    }
    if (kind === 'module' && !b.plugin && !Array.isArray(b.targets)) b.targets = f.targets.map((t) => t.name);
    if (typeof b.targets === 'string') b.targets = b.targets.split(',').map((s: string) => s.trim()).filter(Boolean);
    const r: any = await make.create(f, root!, { ...b, kind });
    const name = kind === 'class' ? r.cls : r.name;
    return { ...r, text: [`made the ${kind} ${name}${r.plugin ? ` in the plugin ${r.plugin}` : ''}${kind === 'plugin' && r.enable ? `, enabled in ${r.owner}` : ''}:`, ...sayMade(r), 'Next: amethyst ue generate, then amethyst ue build.'].join('\n') };
  },
  'POST /api/ue/cmd/deps': async (body, _, root: string | null) => {
    const b = { ...(body || {}) };
    const f = await find(root, b);
    if (f.why && f.why !== 'no-targets') refuse(f);
    const r = await make.addModuleDeps(f, root!, b);
    const lines = [
      r.added.length ? `added ${r.added.join(', ')} to ${r.file}` : `nothing added to ${r.file}`,
      ...(r.skipped.length ? [`already present: ${r.skipped.join(', ')}`] : []),
    ];
    return { ...r, text: lines.join('\n') };
  },
  'POST /api/ue/cmd/project': async (body, q, root: string | null, pid?: string) => {
    const rawDir = body?.dir ? String(body.dir).trim() : '';
    if (rawDir && network(rawDir)) throw new HttpError(400, 'network paths are not allowed');
    const base = String(body?.cwd || root || '').trim();
    const targetDir = rawDir ? (path.isAbsolute(rawDir) ? path.resolve(rawDir) : base ? path.resolve(base, rawDir) : '') : base ? path.resolve(base) : '';
    if (!targetDir || !path.isAbsolute(targetDir)) throw new HttpError(400, 'run it inside the project folder it should fill, or pass --dir <folder>');
    if (pid && root && sameDir(targetDir, path.resolve(root))) {
      const e = await newestEngine(String(body?.engine || '').trim());
      const r = await make.newProject(root, { name: body?.name, engine: e });
      return { ...r, path: path.resolve(root), text: [`made the Unreal project ${r.name} for Unreal Engine ${r.engine}:`, ...r.made.map((m) => `made ${m}`), 'Next: amethyst ue new plugin <Name> adds a plugin; amethyst ue generate, amethyst ue build, then amethyst ue editor.'].join('\n') };
    }
    const shouldAdd = body?.add !== false;
    if (!projects) throw new HttpError(500, 'project registration is not configured');
    const ws = shouldAdd ? projects.resolveWorkspace({ workspace: body?.workspace, by: body?.by, key: body?.key, pid, wid: q?.get('w') || '', cwd: body?.cwd, targetDir }) : null;
    const real = await projects.validateProjectDir(targetDir, ws ? ws.id : null, { nonUser: !isUser() });
    const st = await fs.promises.stat(targetDir).catch(() => null);
    if (st) {
      if (!st.isDirectory()) throw new HttpError(400, 'that is a file, not a folder');
      await keepOutDir(body, real);
      const entries = await fs.promises.readdir(real);
      const nonGit = entries.filter((x) => x.toLowerCase() !== '.git');
      if (nonGit.length) throw new HttpError(409, `${targetDir} is not empty: ue project in a new folder requires an empty folder (or add the folder as an Amethyst project first with amethyst project add)`);
    }
    const projName = make.checkProjectName(body?.name);
    const e = await newestEngine(String(body?.engine || '').trim());
    const secs = body?.timeout == null ? 300 : Number(body.timeout) || 0;
    await gate.mayRun(
      body,
      (who) => ({
        title: `Allow creating Unreal project ${projName}?`,
        text: `${who} asks to create Unreal project ${projName} (UE ${e.id}) in ${targetDir}${ws ? ` and add it to workspace ${ws.name}` : ''}.`,
      }),
      secs,
    );
    await projects.validateProjectDir(targetDir, ws ? ws.id : null, { nonUser: !isUser() });
    const stAfter = await fs.promises.stat(targetDir).catch(() => null);
    if (stAfter) {
      if (!stAfter.isDirectory()) throw new HttpError(400, 'that is a file, not a folder');
      await keepOutDir(body, real);
      const entries = await fs.promises.readdir(real);
      if (entries.some((x) => x.toLowerCase() !== '.git')) throw new HttpError(409, `${targetDir} is not empty: ue project in a new folder requires an empty folder (or add the folder as an Amethyst project first with amethyst project add)`);
    }
    await fs.promises.mkdir(targetDir, { recursive: true });
    const r = await make.newProject(targetDir, { name: projName, engine: e });
    const proj = ws ? await projects.registerProject(targetDir, { wid: ws.id, name: projName }) : null;
    const lines = [
      `made the Unreal project ${r.name} for Unreal Engine ${r.engine} in ${targetDir}:`,
      ...r.made.map((m) => `made ${m}`),
      ...(proj && ws ? [`added project ${proj.name} to workspace ${ws.name}`] : []),
      'Next: amethyst ue new plugin <Name> adds a plugin; amethyst ue generate, amethyst ue build, then amethyst ue editor.',
    ];
    return { ...r, path: targetDir, ...(proj && { project: proj, workspace: ws!.name }), text: lines.join('\n') };
  },
  'POST /api/ue/cmd/python': async (body, _, root: string | null) => {
    const f = await find(root, body || {});
    if (!f.path || f.why === 'os') refuse(f);
    const hasCode = body?.code != null && String(body.code).trim() !== '';
    const hasFile = body?.file != null && String(body.file).trim() !== '';
    if (hasCode === hasFile) throw new HttpError(400, 'pass either Python code or --file <path>, not both');
    let script = '';
    let from = '';
    if (hasFile) {
      const rel = guard(String(body.file).trim());
      if (!rel) throw new HttpError(400, 'file path required');
      const abs = path.join(root!, rel);
      try {
        script = await fs.promises.readFile(abs, 'utf8');
      } catch {
        throw new HttpError(404, `Python file not found: ${rel}`);
      }
      from = ` from ${rel}`;
    } else {
      script = String(body.code);
    }
    const evalMode = !!body?.eval;
    const mode: link.ExecMode = evalMode ? 'EvaluateStatement' : 'ExecuteFile';
    const ms = Math.max(1000, Math.min((Number(body?.timeout) || 30) * 1000, 300000));
    await gate.mayRun(
      body,
      (who) => ({
        title: `Allow running Python in Unreal Editor on ${f.name}?`,
        text: `${who} asks to run Python in Unreal Editor on ${f.name}${from}:`,
        code: script,
        warn: 'This runs arbitrary Python inside the open Unreal Editor process with full access to your project and PC.',
      }),
      300,
    );
    const { dir } = await requireLinkedEditor(f);
    const r = await link.execPython(dir, script, { mode, ms });
    return { ok: r.success, success: r.success, result: r.result, output: r.output, text: formatPyOutput(r, evalMode) };
  },
  'POST /api/ue/cmd/console': async (body, _, root: string | null) => {
    const f = await find(root, body || {});
    if (!f.path || f.why === 'os') refuse(f);
    const command = String(body?.command || '').trim();
    if (!command) throw new HttpError(400, 'console command required');
    const ms = Math.max(1000, Math.min((Number(body?.timeout) || 30) * 1000, 300000));
    await gate.mayRun(
      body,
      (who) => ({
        title: `Allow running a console command in Unreal Editor on ${f.name}?`,
        text: `${who} asks to run a console command in Unreal Editor on ${f.name}:`,
        code: command,
        warn: 'Console commands run inside the open Unreal Editor process and can change editor or project state.',
      }),
      300,
    );
    const { dir } = await requireLinkedEditor(f);
    const r = await link.execConsole(dir, editor.logFile(f), command, { ms });
    return { ok: r.success, command, lines: r.lines, text: r.lines.length ? r.lines.join('\n') : '(no log output)' };
  },
  'POST /api/ue/cmd/modules': async (body, _, root: string | null) => {
    const f = await find(root, body || {});
    if (!f.path || f.why === 'os') refuse(f);
    const { dir } = await requireLinkedEditor(f);
    const r = await link.execConsole(dir, editor.logFile(f), 'Module List', { ms: 15e3 });
    let modules = parseModuleList(r.lines, dir);
    if (!body?.all) modules = modules.filter((m) => m.scope === 'project' || m.scope === 'plugin');
    if (body?.loaded) modules = modules.filter((m) => m.loaded);
    const filt = String(body?.filter || '').trim().toLowerCase();
    if (filt) modules = modules.filter((m) => m.name.toLowerCase().includes(filt));
    const lines = modules.map((m) => `${m.name} (${m.scope}, ${m.loaded ? 'loaded' : 'not loaded'}) ${relTo(root!, m.file)}`);
    return { ok: true, modules, count: modules.length, text: [`${plural(modules.length, 'module')}:`, ...lines].join('\n') };
  },
  'POST /api/ue/cmd/screenshot': async (body, _, root: string | null) => {
    const f = await find(root, body || {});
    if (!f.path || f.why === 'os') refuse(f);
    const dir = path.dirname(f.path);
    const wantWindow = !!body?.window;
    const outFile = screenshot.resolveOutPath(root!, dir, body?.out, wantWindow ? 'window' : 'viewport');
    if (wantWindow) {
      const r = await screenshot.captureWindow(f.path, outFile);
      const rel = relTo(root!, r.path);
      return { ok: true, ...r, text: `Saved window screenshot (${r.width}x${r.height}) to ${rel}\n${r.path}` };
    }
    await requireLinkedEditor(f, true);
    const r = await screenshot.captureViewport(dir, outFile, {
      width: body?.width != null ? Number(body.width) : undefined,
      height: body?.height != null ? Number(body.height) : undefined,
      gameView: !!(body?.gameView ?? body?.['game-view']),
      timeoutMs: body?.timeout != null ? Number(body.timeout) * 1000 : undefined,
    });
    const rel = relTo(root!, r.path);
    return { ok: true, ...r, text: `Saved viewport screenshot (${r.width}x${r.height}) to ${rel}\n${r.path}` };
  },
  'POST /api/ue/cmd/assets': async (body, _, root: string | null) => {
    if (!root) throw new HttpError(400, 'run it inside an Unreal project folder');
    const b = body || {};
    const req = assets.parseRequest(b, findProject);
    const pre = await findToRun(root, b);
    const projName = pre.name || 'this project';
    const f = await askOk(root, b, pre, req.promptTitle(projName), req.promptWarn(projName));
    if (f.why && f.why !== 'no-targets') refuse(f);
    return assets.execute(f, req);
  },
};

const ROUTES: Routes = {
  ...CMD_ROUTES,
  'POST /api/ue/engines': async ({ again, add, remove, ok, uproject }, _, root: string | null) => {
    if (add) {
      const dir = chosenDir(add);
      if (!isEngine(dir)) throw new HttpError(400, `no Engine\\Build\\BatchFiles\\Build.bat in ${dir}: pick the folder with Engine in it`);
      const there = (await engines()).find((e) => sameDir(e.dir, dir));
      if (there && !ok) throw new HttpError(409, `${/^\d/.test(there.id) ? 'UE ' + there.id : 'that engine'} is already in the list`);
      if (!there) {
        await writeAdded([...(await readAdded()), dir]);
        again = true;
      }
    }
    if (remove) {
      const dir = chosenDir(remove), list = await readAdded();
      if (!list.some((d) => sameDir(d, dir))) throw new HttpError(404, 'that engine was not added by hand');
      await writeAdded(list.filter((d) => !sameDir(d, dir)));
      await changeOk((all) => all.filter((x) => !sameDir(x.engine, dir)));
      again = true;
    }
    if (ok) {
      const f = await find(root, { uproject, engine: ok }, !!again);
      again = false;
      if (f.why && f.why !== 'no-targets' && f.why !== 'bad-json') refuse(f);
      const project = path.dirname(f.path), engine = f.engine?.dir;
      if (engine) {
        await changeOk((all) => [...all.filter((x) => !sameDir(x.project, project) || !sameDir(x.engine, engine)), { project, engine }]);
        asks.given(project, engine);
      }
    }
    return { engines: await engines(!!again) };
  },
  'POST /api/ue/ask': async ({ id, yes }) => {
    const a = asks.byId(Number(id));
    if (!a) return { gone: true };
    if (yes === true) await changeOk((all) => [...all.filter((x) => !sameDir(x.project, a.project) || !sameDir(x.engine, a.engine)), { project: a.project, engine: a.engine }]);
    asks.answer(a.id, yes === true);
    return { ok: true };
  },
  'POST /api/ue/find': async ({ uproject, engine, again }, _, root: string | null) => find(root, { uproject, engine }, !!again),
  'POST /api/ue/run': async (body, _, root: string | null) => start(root, body),
  'POST /api/ue/cancel': async (_, __, root: string | null) => cancel(root),
  'POST /api/ue/editor': async (body, _, root: string | null) => openEditor(root, body),
  'POST /api/ue/link': async (body, _, root: string | null) => editorState(root, body),
  'POST /api/ue/livecoding': async (body, _, root: string | null) => liveCoding(root, body),
  'POST /api/ue/restart': async (body, _, root: string | null) => restart(root, body),
  'POST /api/ue/debug': async (body, _, root: string | null) => {
    const w = debug.who(body || {}, root);
    debug.allow(w, 'Starting the debugger');
    const mode = body?.mode || (body?.attach === true ? 'attach' : body?.game === true ? 'game' : 'editor');
    if (w.outside || !gate.free(body)) {
      const pre = await findToRun(w.root, body || {});
      const f = await askOk(w.root, body || {}, pre, `Allow debugging ${pre.name || 'this project'}?`);
      if (f.why === 'refused' || f.why === 'unconfirmed' || f.why?.startsWith('run-')) refuse(f);
    }
    const r: Record<string, any> = await startDebug(w.root, { ...(body || {}), mode, by: w.agent ? 'agent' : 'you', agent: w.agent });
    if (!w.outside) return r;
    const text = sayStart(r, mode);
    if (r.why) throw new HttpError(r.why === 'debugging' ? 409 : 400, text);
    return { ...r, text };
  },
  'POST /api/ue/play': async (body, _, root: string | null) => play(root, body),
  'POST /api/ue/log': async (body, _, root: string | null) => readLog(root, body),
  'POST /api/ue/problems': async (_, __, root: string | null) => {
    const run = root ? runs.get(keyOf(root)) : undefined;
    return { run: pub(run) || null, problems: run ? run.problems : [] };
  },
  'POST /api/ue/specs': async ({ uproject, engine, again }, _, root: string | null) => {
    const r = await find(root, { uproject, engine }, !!again);
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', engine: '', tables: null, docs: {} };
    const [tables, docs] = await Promise.all([specs(r.engine.dir, path.dirname(r.path), !!again), specDocs(r.engine.dir)]);
    return { why: tables ? null : 'no-uht', engine: r.engine.id, tables, docs };
  },
  'POST /api/ue/known': async ({ uproject, engine, file, types, macros, parents }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', ready: false };
    return { why: null, ...(await names.ask(r.engine.dir, path.dirname(r.path), { file: String(file || ''), types: Array.isArray(types) ? types : [], macros: Array.isArray(macros) ? macros : [], parents: Array.isArray(parents) ? parents : [] })) };
  },
  'POST /api/ue/where': async ({ uproject, engine, name, in: inside }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', places: [] };
    return { why: null, ...(await names.where(r.engine.dir, path.dirname(r.path), String(name || ''), String(inside || ''))) };
  },
  'POST /api/ue/uht': async (body, _, root: string | null) => headerTool(root, body),
  'POST /api/ue/members': async ({ uproject, engine, from, steps, op, name }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', list: [], places: [] };
    return { why: null, ...(await names.membersOf(r.engine.dir, path.dirname(r.path), { from, steps, op: String(op || '.'), name: String(name || '') })) };
  },
  'POST /api/ue/about': async ({ uproject, engine, from, steps, op, name }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', card: null };
    return { why: null, ...(await names.about(r.engine.dir, path.dirname(r.path), { from, steps, op: String(op || '.'), name: String(name || '') })) };
  },
  'POST /api/ue/complete': async ({ uproject, engine, prefix }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', names: [] };
    return { why: null, ...(await names.complete(r.engine.dir, path.dirname(r.path), String(prefix || ''))) };
  },
  'POST /api/ue/parents': async ({ uproject, engine, q, dir }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!root || !r.engine || r.why) return { why: r.why || 'none', list: [] };
    const projDir = path.dirname(r.path);
    return { why: null, ...(await names.parents(r.engine.dir, projDir, { q: String(q || ''), dir: path.relative(projDir, path.join(root, guard(String(dir || '')))) })) };
  },
  'POST /api/ue/templates': async ({ uproject, engine }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!root || !r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', templates: [], plugins: [], targets: [] };
    return { why: null, project: r.name, templates: await make.pluginTemplates(r.engine.dir), plugins: (await make.projectPlugins(path.dirname(r.path))).map((p) => p.name), targets: r.targets, types: make.TYPES, phases: make.PHASES };
  },
  'POST /api/ue/new': async (body, _, root: string | null) => {
    const r = await find(root, { uproject: body?.uproject, engine: body?.engine });
    const ok = !r.why || (r.why === 'no-targets' && body?.kind === 'plugin');
    if (!root || !r.engine || !ok) {
      if (body?.dry) return { why: r.why || 'none' };
      throw new HttpError(400, r.why === 'none' || !root ? 'not an Unreal project: no .uproject here' : `the Unreal project isn't ready: ${r.why}`);
    }
    const made = await make.create(r, root, body || {});
    if (body?.dry || body?.kind === 'plugin') return { why: null, ...made };
    return { why: null, ...made, editor: await editorOpen(r.path).catch(() => false), sln: fs.existsSync(path.join(path.dirname(r.path), r.name + '.sln')) };
  },
  'POST /api/ue/index': async ({ uproject, engine, rebuild, wait }, _, root: string | null) => {
    const r = await find(root, { uproject, engine });
    if (!r.engine || (r.why && r.why !== 'no-targets')) return { why: r.why || 'none', index: null };
    if (rebuild) await names.index(r.engine.dir, true);
    return { why: null, engine: r.engine.id, index: wait ? await names.settle(r.engine.dir) : await names.index(r.engine.dir) };
  },
};

export { ROUTES, follow, stopAll, parse, init };
export const followAsks = asks.follow;
