import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { HttpError } from '../base/routes.ts';
import { isUser } from '../base/user.ts';
import * as runs from '../base/runs.ts';
import type { Routes } from '../../public/base/types.ts';
import { startDap } from './dap.ts';
import type { Dap } from './dap.ts';
import { adapterCommand, engineState, install, uninstall } from './engine.ts';
import { absOf, fold, readBps, relOf, setFile, writeBps } from './store.ts';
import type { Bp } from './store.ts';
import { placeOf, sayBps, sayScopes, sayStack, sayState, sayVars } from './say.ts';

type Ev = Record<string, unknown>;
type Out = (e: Ev) => void;
type Msg = Record<string, any>;
export type Who = { agent: boolean; chat: string; root: string | null; outside: boolean };
type Hooks = { chatOf: (a: Msg) => { id: string; root: string } | null; control: () => boolean };

let hooks: Hooks = { chatOf: () => null, control: () => true };
export const init = (h: Partial<Hooks>) => void (hooks = { ...hooks, ...h });

export function whoOf(body: Msg, root: string | null): Who {
  const by = String(body?.by || '');
  if (by === 'cli') return { agent: !isUser(), chat: '', root, outside: true };
  if (!by || by === 'you') return { agent: !isUser(), chat: '', root, outside: false };
  if (by === 'agent') return { agent: true, chat: '', root, outside: false };
  const c = hooks.chatOf(body);
  if (!c) throw new HttpError(403, 'the debugger answers chats Amethyst started, the amethyst command and the page');
  return { agent: true, chat: c.id, root: c.root, outside: true };
}

const READING = 'Reading still works: amethyst debug status, amethyst debug stack, amethyst debug vars, amethyst debug wait, amethyst debug break with no arguments, and amethyst debug eval without calls or assignments.';
export function allow(w: Who, what: string, more = '') {
  if (w.agent && !hooks.control()) throw new HttpError(403, `${what} is refused: the user turned off "agents can control the debugger" (Settings → Agents → Amethyst tools).${more} ${READING}`);
}
export const changes = (e: string) => /\(|\+\+|--|<<=|>>=|(^|[^=!<>])=($|[^=])|\b(new|delete|throw)\b/.test(e);

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
interface Frame {
  id: number;
  name: string;
  file: string;
  line: number;
  col: number;
  lib: boolean;
  source: boolean;
  module: string;
  bp?: boolean;
  blueprint?: string;
  fn?: string;
  object?: string;
}
interface Stop {
  reason: string;
  text: string;
  threadId: number;
  hit: number[];
  at: number;
  by: string;
  where: Frame | null;
  mine: number;
  kind: string;
  change: { name: string; old: string; now: string } | null;
  exception: { id: string; text: string } | null;
  nulls: string[];
  line: string;
}
interface LiveBp {
  id: number | null;
  verified: boolean;
  line: number;
  why: string;
  pending: boolean;
  hits: number;
}
interface Session {
  key: string;
  root: string;
  dap: Dap;
  config: Config;
  state: string;
  started: number;
  stop: Stop | null;
  pid: number;
  output: string[];
  ended: { code: number | null; why: string } | null;
  ids: Map<number, string>;
  live: Map<string, LiveBp>;
  by: string;
  thread: number;
  leaving: boolean;
  waiters: Set<() => void>;
  frames: Frame[];
  framesOf: number;
  steps: number;
  temp: { abs: string; line: number; id?: number | null } | null;
  data: DataBp[];
  caps: Msg;
}
interface DataBp {
  dataId: string;
  name: string;
  expr: string;
  old: string;
  id: number | null;
  hits: number;
}

const sessions = new Map<string, Session>();
const subs = new Map<string, Set<Out>>();
const KEEP_OUT = 2000;
const SEND_OUT = 300;
const keyOf = (root: string) => fold(root);
const bpKey = (abs: string, line: number) => `${fold(abs)}#${line}`;
const alive = (s: Session | undefined): s is Session => !!s && s.state !== 'ended';

const send = (key: string, e: Ev) => subs.get(key)?.forEach((out) => out(e));

function pub(s: Session | undefined) {
  if (!s) return null;
  const { name, kind, mode, note } = s.config;
  return { name, kind, mode, note: note || '', libs: s.config.libs || [], state: s.state, started: s.started, stop: s.stop, pid: s.pid, ended: s.ended, by: s.by, steps: s.steps, data: s.data.map(({ name, expr, old, hits }) => ({ name, expr, old, hits })) };
}

interface Prep {
  name: string;
  kind: string;
  text: string;
  by: string;
  started: number;
  cancel: () => unknown;
  ended?: string;
}
const preps = new Map<string, Prep>();
const keyWaiters = new Map<string, Set<() => void>>();
const prepPub = (p: Prep) => ({ name: p.name, kind: p.kind, mode: 'launch', note: p.text, state: p.ended ? 'ended' : 'building', started: p.started, stop: null, pid: 0, ended: p.ended ? { code: null, why: p.ended } : null, by: p.by, steps: 0 });
const shown = (key: string) => {
  const p = preps.get(key);
  return p ? prepPub(p) : pub(sessions.get(key));
};
const fireKey = (key: string) => keyWaiters.get(key)?.forEach((w) => w());
const tellKey = (key: string) => {
  send(key, { type: 'state', session: shown(key) });
  fireKey(key);
};

export function prepare(root: string, info: { name: string; kind: string; text: string; by: string; cancel: () => unknown } | null, failed = '') {
  const key = keyOf(root), p = preps.get(key);
  if (info) preps.set(key, { ...info, started: Date.now() });
  else if (failed && p) p.ended = failed;
  else if (failed) preps.set(key, { name: '', kind: '', text: '', by: 'you', started: Date.now(), cancel: () => {}, ended: failed });
  else preps.delete(key);
  tellKey(key);
}

function bpsOf(root: string) {
  const s = sessions.get(keyOf(root));
  return readBps(root).map((b) => {
    const abs = absOf(root, b.file);
    const l = alive(s) ? s.live.get(bpKey(abs, b.line)) : undefined;
    return { ...b, abs, ...(l ? { live: { verified: l.verified, line: l.line, why: l.why, pending: l.pending, hits: l.hits } } : {}) };
  });
}

const tellState = (s: Session) => {
  send(s.key, { type: 'state', session: pub(s) });
  if (s.state === 'stopped' || s.state === 'ended') for (const w of [...s.waiters]) w();
  fireKey(s.key);
};
const tellBps = (s: Session | string, root?: string) => {
  const key = typeof s === 'string' ? s : s.key, r = typeof s === 'string' ? root! : s.root;
  send(key, { type: 'bps', bps: bpsOf(r) });
};

function mapPath(s: Session, p: string) {
  if (!p) return '';
  if (fs.existsSync(p)) return path.resolve(p);
  for (const m of s.config.map || []) {
    const i = p.toLowerCase().replace(/\//g, '\\').indexOf(m.marker.toLowerCase());
    if (i < 0) continue;
    const to = path.join(m.to, p.slice(i + m.marker.length));
    if (fs.existsSync(to)) return to;
  }
  return path.resolve(p);
}
const marked = (s: Session, raw: string) => (s.config.map || []).some((m) => raw.toLowerCase().replace(/\//g, '\\').includes(m.marker.toLowerCase()));
const isLib = (s: Session, file: string, raw: string) => !!file && ((s.config.libs || []).some((d) => fold(file).startsWith(fold(d) + '/')) || marked(s, raw));

function frameOf(s: Session, f: Msg): Frame {
  if (f.source?.origin === 'Blueprint' || f.moduleId === 'Blueprint') {
    const name = String(f.name || '?'), dot = name.indexOf(' · ');
    return { id: f.id, name, module: 'Blueprint', file: '', line: 0, col: 0, lib: false, source: false, bp: true, blueprint: dot > 0 ? name.slice(0, dot) : name, fn: dot > 0 ? name.slice(dot + 3) : '', object: String(f.source?.name || '') };
  }
  const raw = String(f.source?.path || ''), file = mapPath(s, raw);
  const name = String(f.name || '?'), bang = name.indexOf('!');
  return { id: f.id, name: bang > 0 ? name.slice(bang + 1) : name, module: bang > 0 ? name.slice(0, bang) : '', file, line: Number(f.line) || 0, col: Number(f.column) || 0, lib: !file || isLib(s, file, raw), source: !!file && fs.existsSync(file) };
}

async function fetchFrames(s: Session, threadId: number, levels = 64) {
  const r = await s.dap.req('stackTrace', { threadId, startFrame: 0, levels }, 20e3);
  return ((r.body?.stackFrames || []) as Msg[]).map((f) => frameOf(s, f));
}

function addOutput(s: Session, text: string, cat = 'console') {
  if (!text) return;
  const lines = text.replace(/\r/g, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  s.output.push(...lines);
  if (s.output.length > KEEP_OUT) s.output.splice(0, s.output.length - KEEP_OUT);
  send(s.key, { type: 'output', lines, cat });
}

function sendable(b: Bp) {
  return { line: b.line, ...(b.cond ? { condition: b.cond } : {}) };
}

async function sendFile(s: Session, abs: string) {
  const mine = readBps(s.root).filter((b) => fold(absOf(s.root, b.file)) === fold(abs) && !b.off);
  const hitsWas = new Map<string, number>();
  for (const k of [...s.live.keys()])
    if (k.startsWith(fold(abs) + '#')) {
      hitsWas.set(k, s.live.get(k)!.hits);
      s.live.delete(k);
    }
  const temp = s.temp && fold(s.temp.abs) === fold(abs) && !mine.some((b) => b.line === s.temp!.line) ? s.temp : null;
  const lines = [...mine.map(sendable), ...(temp ? [{ line: temp.line }] : [])];
  let r: Msg;
  try {
    r = await s.dap.req('setBreakpoints', { source: { path: abs, name: path.basename(abs) }, breakpoints: lines, lines: lines.map((b) => b.line) }, 30e3);
  } catch (e) {
    for (const b of mine) s.live.set(bpKey(abs, b.line), { id: null, verified: false, line: b.line, why: (e as Error).message, pending: false, hits: 0 });
    return;
  }
  const got = (r.body?.breakpoints || []) as Msg[];
  if (temp) temp.id = typeof got[mine.length]?.id === 'number' ? got[mine.length].id : null;
  mine.forEach((b, i) => {
    const g = got[i] || {};
    const l: LiveBp = { id: typeof g.id === 'number' ? g.id : null, verified: !!g.verified, line: Number(g.line) || b.line, why: String(g.message || ''), pending: g.reason === 'pending', hits: hitsWas.get(bpKey(abs, b.line)) || 0 };
    s.live.set(bpKey(abs, b.line), l);
    if (l.id != null) s.ids.set(l.id, bpKey(abs, b.line));
  });
  await settle(s, abs);
}

async function settle(s: Session, abs: string) {
  const all = readBps(s.root), f = fold(abs);
  const mine = all.filter((b) => fold(absOf(s.root, b.file)) === f);
  const taken = new Map<number, Bp>();
  let moved = false, dropped = false;
  for (const b of mine) {
    const l = s.live.get(bpKey(abs, b.line));
    if (!l || !l.verified || l.line === b.line) {
      taken.set(b.line, b);
      continue;
    }
    moved = true;
    if (taken.has(l.line) || mine.some((o) => o !== b && o.line === l.line)) {
      dropped = true;
      continue;
    }
    s.live.delete(bpKey(abs, b.line));
    s.live.set(bpKey(abs, l.line), l);
    if (l.id != null) s.ids.set(l.id, bpKey(abs, l.line));
    send(s.key, { type: 'moved', abs, from: b.line, to: l.line });
    b.line = l.line;
    taken.set(b.line, b);
  }
  if (!moved) return;
  await writeBps(s.root, [...all.filter((b) => fold(absOf(s.root, b.file)) !== f), ...taken.values()]);
  if (dropped) await sendFile(s, abs);
}

async function sendAll(s: Session) {
  const files = new Map<string, string>();
  for (const b of readBps(s.root)) {
    const abs = absOf(s.root, b.file);
    files.set(fold(abs), abs);
  }
  for (const abs of files.values()) await sendFile(s, abs);
}

function onBreakpoint(s: Session, b: Msg) {
  const key = typeof b.id === 'number' ? s.ids.get(b.id) : undefined;
  const l = key ? s.live.get(key) : undefined;
  if (!l) return;
  l.verified = !!b.verified;
  if (b.line) l.line = Number(b.line);
  l.why = String(b.message || '');
  l.pending = b.reason === 'pending' || (!b.verified && /waits for/i.test(l.why));
  const real = readBps(s.root).find((x) => bpKey(absOf(s.root, x.file), x.line) === key);
  if (real) settle(s, absOf(s.root, real.file)).finally(() => tellBps(s)).catch(() => {});
  else tellBps(s);
}

async function onStopped(s: Session, body: Msg) {
  const threadId = Number(body.threadId) || s.thread;
  if (threadId) s.thread = threadId;
  const hit = ((body.hitBreakpointIds || []) as number[]).filter((n) => typeof n === 'number');
  for (const id of hit) {
    const l = s.live.get(s.ids.get(id) || '');
    if (l) l.hits++;
  }
  s.state = 'stopped';
  s.frames = [];
  s.framesOf = threadId;
  const temp = s.temp;
  if (temp) {
    s.temp = null;
    if (temp.id != null && hit.includes(temp.id)) body = { ...body, reason: 'cursor', description: 'Ran to the cursor.' };
  }
  s.stop = { reason: String(body.reason || 'pause'), text: String(body.description || body.text || ''), threadId, hit, at: Date.now(), by: s.by, where: null, mine: -1, kind: '', change: null, exception: null, nulls: [], line: '' };
  try {
    if (threadId) s.frames = await fetchFrames(s, threadId);
    if (s.stop?.reason === 'pause' && /^DbgBreakPoint/.test(s.frames[0]?.name || '') && s.frames[0]?.module === 'ntdll') {
      const r = await s.dap.req('threads', {}, 10e3);
      const list = (r.body?.threads || []) as Msg[];
      const main = list.find((t) => /^GameThread\b/.test(String(t.name))) || list.find((t) => t.id !== threadId);
      if (main && s.stop) {
        s.stop.threadId = Number(main.id);
        s.framesOf = s.stop.threadId;
        s.frames = await fetchFrames(s, s.stop.threadId);
      }
    }
  } catch {}
  if (s.stop && s.state === 'stopped') {
    const st = s.stop;
    st.where = s.frames.find((f) => f.source) || s.frames.find((f) => !f.bp) || s.frames[0] || null;
    st.mine = s.frames.findIndex((f) => f.source && !f.lib);
    if (st.reason === 'exception') await explain(s, st).catch(() => {});
    const d = s.data.find((x) => x.id != null && st.hit.includes(x.id)) || (/data/i.test(st.reason) && s.data.length === 1 ? s.data[0] : undefined);
    if (d) {
      d.hits++;
      st.kind = 'data';
      const now = await s.dap.req('evaluate', { expression: d.expr || d.name, frameId: st.where?.id, context: 'watch' }, 10e3).then((r) => String(r.body?.result ?? ''), () => '');
      st.change = { name: d.expr || d.name, old: d.old, now };
      if (now) d.old = now;
    }
  }
  tellState(s);
  if (hit.length) tellBps(s);
  if (temp) await sendFile(s, temp.abs).catch(() => {});
}

const ASSERT = /FDebug::(CheckVerifyFailed|AssertFailed|ProcessFatal|LogAssertFailedMessage)|CheckVerifyFailedImpl|DispatchCheckVerify/;
const ENSURE = /FDebug::(EnsureFailed|OptionallyLogFormattedEnsureMessageReturningFalse)|EnsureFailed/;

function lineOf(file: string, n: number) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/)[n - 1]?.trim().slice(0, 300) || '';
  } catch {
    return '';
  }
}

async function explain(s: Session, st: Stop) {
  const names = s.frames.map((f) => f.name);
  const at = (re: RegExp) => names.findIndex((n) => re.test(n));
  const info = await s.dap.req('exceptionInfo', { threadId: st.threadId }, 10e3).then((r) => r.body || {}, () => ({}) as Msg);
  const code = String(info.exceptionId || /0x[0-9a-f]{8}/i.exec(st.text)?.[0] || '');
  st.exception = { id: code, text: String(info.description || info.details?.message || st.text || '') };
  const a = at(ASSERT), e = at(ENSURE);
  st.kind = a >= 0 ? 'check' : e >= 0 ? 'ensure' : /80000003/i.test(code) ? 'break' : 'crash';
  if (st.kind === 'check' || st.kind === 'ensure') {
    const from = Math.max(a, e) + 1;
    const mine = s.frames.findIndex((f, i) => i >= from && f.source && !f.lib);
    const any = s.frames.findIndex((f, i) => i >= from && f.source);
    const pick = mine >= 0 ? mine : any;
    if (pick >= 0) {
      st.where = s.frames[pick];
      st.mine = pick;
    }
  }
  if (st.where?.source) st.line = lineOf(st.where.file, st.where.line);
  if (st.kind !== 'crash' || !st.where) return;
  const sc = await s.dap.req('scopes', { frameId: st.where.id }, 20e3).catch(() => null);
  const locals = ((sc?.body?.scopes || []) as Msg[]).find((x) => x.name === 'Locals');
  if (!locals) return;
  const vars = await kids(s, Number(locals.variablesReference)).catch(() => []);
  const words = new Set(st.line.match(/[A-Za-z_]\w*/g) || []);
  const isNull = (v: { value: string }) => /^(nullptr|0x0+|0000000000000000)$/i.test(v.value.trim());
  const out: string[] = [];
  for (const v of vars) {
    if (isNull(v) && words.has(v.name)) out.push(v.name);
    if (v.name === 'this' && v.ref && out.length < 4) {
      const members = await kids(s, v.ref).catch(() => []);
      for (const m of members) if (isNull(m) && words.has(m.name)) out.push(m.name);
    }
  }
  st.nulls = out.slice(0, 4);
}

function end(s: Session, code: number | null, why: string) {
  if (s.state === 'ended') return;
  s.state = 'ended';
  s.stop = null;
  s.ended = { code, why };
  s.frames = [];
  tellState(s);
  tellBps(s);
  setTimeout(() => s.dap.kill(), 3000).unref();
}

function findChild(s: Session) {
  if (process.platform !== 'win32' || !s.dap.pid() || process.env.MIND_FAKE_DAP) return;
  const ps = `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${s.dap.pid()}" | Where-Object { $_.Name -ne 'conhost.exe' } | Select-Object -First 1).ProcessId`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15e3 }, (_e, out) => {
    const pid = Number(String(out || '').trim());
    if (pid > 0 && !s.pid && s.state !== 'ended') {
      s.pid = pid;
      tellState(s);
    }
  });
}

async function settleAttach(s: Session) {
  for (let i = 0; i < 40 && s.state === 'starting'; i++) await new Promise((r) => setTimeout(r, 50));
  if (s.state !== 'stopped' || !s.stop || s.stop.reason !== 'pause' || !/attach/i.test(s.stop.text)) return;
  const was = s.stop;
  await s.dap.req('continue', { threadId: was.threadId || s.thread }, 15e3).catch(() => {});
  if (s.state === 'stopped' && s.stop === was) {
    s.state = 'running';
    s.stop = null;
    s.frames = [];
    tellState(s);
  }
}

export async function start(root: string, config: Config, by = 'you') {
  const key = keyOf(root);
  const old = sessions.get(key);
  if (alive(old)) throw new HttpError(409, `already debugging ${old.config.name}`);
  preps.delete(key);
  const eng = engineState();
  if (!eng.ready) return { why: 'engine', engine: eng };
  const { exe, args } = adapterCommand();
  const dap = startDap(exe, args, path.dirname(exe));
  const s: Session = { key, root, dap, config, state: 'starting', started: Date.now(), stop: null, pid: config.pid || 0, output: [], ended: null, ids: new Map(), live: new Map(), by, thread: 0, leaving: false, waiters: new Set(), frames: [], framesOf: 0, steps: 0, temp: null, data: [], caps: {} };
  sessions.set(key, s);
  dap.on((event, body) => {
    if (event === 'stopped') onStopped(s, body);
    else if (event === 'continued') {
      if (s.state === 'ended') return;
      s.state = 'running';
      s.stop = null;
      s.frames = [];
      tellState(s);
    } else if (event === 'output') addOutput(s, String(body.output || ''), String(body.category || 'console'));
    else if (event === 'breakpoint') onBreakpoint(s, body.breakpoint || {});
    else if (event === 'process' && body.systemProcessId) s.pid = Number(body.systemProcessId);
    else if (event === 'thread' && body.reason === 'started' && !s.thread) s.thread = Number(body.threadId) || 0;
    else if (event === 'exited') s.ended = { code: Number(body.exitCode), why: 'exited' };
    else if (event === 'terminated') end(s, s.ended?.code ?? null, s.leaving ? s.ended?.why || 'detached' : s.ended?.why || 'ended');
  });
  dap.onExit((code, why) => end(s, s.ended?.code ?? null, s.leaving ? s.ended?.why || 'detached' : why || (s.ended ? s.ended.why : `the debug adapter stopped (exit code ${code})`)));
  tellState(s);
  tellBps(s);
  const initialized = new Promise<void>((resolve) => dap.on((e) => e === 'initialized' && resolve()));
  try {
    const init = await dap.req('initialize', { clientID: 'amethyst', clientName: 'Amethyst', adapterID: 'dbgeng', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path', supportsVariableType: true, supportsRunInTerminalRequest: false, locale: 'en' }, 30e3);
    s.caps = init.body || {};
    const common = { symbolPath: config.symbolPath || [], sources: config.sources || [], sourceModules: config.sourceModules || [] };
    const go = config.mode === 'attach'
      ? dap.req('attach', { processId: config.pid, ...common }, 300e3)
      : dap.req('launch', { program: config.program, args: config.args || [], cwd: config.cwd || path.dirname(config.program || root), stopAtEntry: false, ...common }, 300e3);
    go.catch(() => {});
    await Promise.race([initialized, go.then(() => initialized), new Promise((_, no) => setTimeout(() => no(new Error('the debug adapter did not get ready in 2 minutes')), 120e3))]);
    await sendAll(s);
    await dap.req('setExceptionBreakpoints', { filters: config.exceptions || [] }).catch(() => {});
    await dap.req('configurationDone', {}, 30e3);
    await go;
    if (config.mode === 'attach') await settleAttach(s);
    else if (!s.pid) findChild(s);
    if (s.state === 'starting') {
      s.state = 'running';
      tellState(s);
    }
    tellBps(s);
    return { ok: true, session: pub(s) };
  } catch (e) {
    const why = (e as Error).message;
    addOutput(s, `debugger: ${why}`, 'stderr');
    end(s, null, why);
    try {
      dap.kill();
    } catch {}
    throw new HttpError(500, why);
  }
}

function need(root: string | null): Session {
  const s = root ? sessions.get(keyOf(root)) : undefined;
  if (!alive(s)) throw new HttpError(409, 'not debugging');
  return s;
}
const needStopped = (root: string | null) => {
  const s = need(root);
  if (s.state !== 'stopped') throw new HttpError(409, s.state === 'running' ? 'the program is running: pause it first' : `the debugger is ${s.state}`);
  return s;
};

async function resume(root: string | null, how: string, by: string) {
  const s = needStopped(root);
  const cmd = ({ continue: 'continue', over: 'next', into: 'stepIn', out: 'stepOut' } as Record<string, string>)[how];
  if (!cmd) throw new HttpError(400, 'step how? over, into or out');
  s.by = by;
  if (cmd !== 'continue') s.steps++;
  const was = s.stop!;
  await s.dap.req(cmd, { threadId: was.threadId || s.thread }, 30e3);
  if (s.state === 'stopped' && s.stop === was) {
    s.state = 'running';
    s.stop = null;
    s.frames = [];
    tellState(s);
  }
  return { ok: true };
}

async function sendData(s: Session) {
  const r = await s.dap.req('setDataBreakpoints', { breakpoints: s.data.map((d) => ({ dataId: d.dataId, accessType: 'write' })) }, 15e3);
  const got = (r.body?.breakpoints || []) as Msg[];
  s.data.forEach((d, i) => (d.id = typeof got[i]?.id === 'number' ? got[i].id : null));
  const bad = got.findIndex((g) => g && g.verified === false);
  if (bad >= 0) {
    const why = String(got[bad].message || "the processor couldn't watch it");
    s.data.splice(bad, 1);
    await s.dap.req('setDataBreakpoints', { breakpoints: s.data.map((d) => ({ dataId: d.dataId, accessType: 'write' })) }, 15e3).catch(() => {});
    throw new HttpError(400, why);
  }
}

async function watchpoint(root: string | null, { ref, name, expr, value, remove }: Msg) {
  const s = need(root);
  if (remove != null) {
    s.data = s.data.filter((d) => d.name !== String(remove) && d.expr !== String(remove));
    await sendData(s);
    tellState(s);
    return { data: pub(s)!.data };
  }
  if (s.state !== 'stopped') throw new HttpError(409, 'it has to be stopped to pick a variable');
  if (s.data.length >= 4) throw new HttpError(409, 'the processor can watch 4 places at once: remove one first');
  const info = await s.dap.req('dataBreakpointInfo', { variablesReference: Number(ref) || undefined, name: String(name || expr || '') }, 15e3);
  const dataId = info.body?.dataId;
  if (!dataId) throw new HttpError(400, String(info.body?.description || `can't watch ${name}`));
  if (s.data.some((d) => d.dataId === dataId)) return { data: pub(s)!.data };
  s.data.push({ dataId: String(dataId), name: String(name || expr), expr: String(expr || name || ''), old: String(value ?? ''), id: null, hits: 0 });
  await sendData(s);
  tellState(s);
  return { data: pub(s)!.data };
}

async function runTo(root: string | null, { file, line, by }: Msg) {
  const s = needStopped(root);
  const n = Math.floor(Number(line));
  if (typeof file !== 'string' || !file || !(n >= 1)) throw new HttpError(400, 'run to where? give file and line');
  s.temp = { abs: absOf(s.root, file), line: n };
  await sendFile(s, s.temp.abs);
  return resume(root, 'continue', by === 'agent' ? 'agent' : 'you');
}

async function gotoLine(root: string | null, { file, line, by }: Msg) {
  const s = needStopped(root);
  const n = Math.floor(Number(line));
  if (typeof file !== 'string' || !file || !(n >= 1)) throw new HttpError(400, 'move to where? give file and line');
  if (!s.caps.supportsGotoTargetsRequest) return { error: "This debugger can't set the next statement." };
  const abs = absOf(s.root, file), threadId = s.stop!.threadId || s.thread;
  let target: Msg;
  try {
    const r = await s.dap.req('gotoTargets', { source: { path: abs, name: path.basename(abs) }, line: n, threadId }, 15e3);
    target = r.body?.targets?.[0];
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!target) return { error: `No code on line ${n}.` };
  s.by = by === 'agent' ? 'agent' : 'you';
  const was = s.stop;
  let done = () => {};
  const moved = new Promise<void>((resolve) => {
    const t = setTimeout(() => done(), 10e3);
    done = () => (clearTimeout(t), s.waiters.delete(check), resolve());
    const check = () => (s.stop !== was || s.state === 'ended') && done();
    s.waiters.add(check);
  });
  try {
    await s.dap.req('goto', { threadId, targetId: target.id }, 15e3);
  } catch (e) {
    done();
    return { error: (e as Error).message };
  }
  await moved;
  return { ok: true, line: Number(target.line) || n };
}

async function pause(root: string | null, by: string) {
  const s = need(root);
  if (s.state === 'stopped') return { ok: true, already: true };
  if (s.state !== 'running') throw new HttpError(409, `the debugger is ${s.state}`);
  s.by = by;
  let t = s.thread;
  if (!t) {
    const r = await s.dap.req('threads', {}, 10e3).catch(() => null);
    t = r?.body?.threads?.[0]?.id || 0;
  }
  await s.dap.req('pause', { threadId: t }, 15e3);
  return { ok: true };
}

export async function leave(root: string | null, endIt = false) {
  const p = root ? preps.get(keyOf(root)) : undefined;
  if (p && !p.ended) {
    await p.cancel();
    return { ok: true, cancelled: true };
  }
  const s = root ? sessions.get(keyOf(root)) : undefined;
  if (!alive(s)) return { ok: true, already: true };
  s.leaving = true;
  s.ended = { code: null, why: endIt ? 'ended' : 'detached' };
  await s.dap.req('disconnect', { terminateDebuggee: endIt, restart: false }, endIt ? 15e3 : 8e3).catch(() => {});
  end(s, null, endIt ? 'ended' : 'detached');
  return { ok: true };
}

export async function detachAll(ms = 2000) {
  const live = [...sessions.values()].filter(alive);
  if (!live.length) return;
  await Promise.race([Promise.all(live.map((s) => leave(s.root).catch(() => {}))), new Promise((r) => setTimeout(r, ms))]);
  for (const s of live) s.dap.kill();
}

async function threads(root: string | null) {
  const s = needStopped(root);
  const r = await s.dap.req('threads', {}, 15e3);
  return { threads: ((r.body?.threads || []) as Msg[]).map((t) => ({ id: t.id, name: String(t.name || `Thread ${t.id}`) })), current: s.stop?.threadId || s.thread };
}

async function stack(root: string | null, { threadId, levels }: Msg) {
  const s = needStopped(root);
  const t = Number(threadId) || s.stop!.threadId;
  if (t === s.framesOf && s.frames.length && !levels) return { threadId: t, frames: s.frames };
  const frames = await fetchFrames(s, t, Math.min(Number(levels) || 64, 400));
  if (t === s.stop!.threadId) {
    s.frames = frames;
    s.framesOf = t;
  }
  return { threadId: t, frames };
}

const varOf = (v: Msg) => ({ name: String(v.name), value: String(v.value ?? ''), type: String(v.type || ''), ref: Number(v.variablesReference) || 0, expr: String(v.evaluateName || ''), kids: Number(v.namedVariables || v.indexedVariables || 0) });

async function kids(s: Session, ref: number) {
  const r = await s.dap.req('variables', { variablesReference: ref }, 30e3);
  return ((r.body?.variables || []) as Msg[]).map(varOf);
}

async function grow(s: Session, list: ReturnType<typeof varOf>[], depth: number, budget: { n: number }): Promise<any[]> {
  const out = [];
  for (const v of list) {
    if (depth > 0 && v.ref && budget.n > 0 && v.name !== '[Raw View]') {
      const k = await kids(s, v.ref).catch(() => []);
      budget.n -= k.length;
      out.push({ ...v, children: await grow(s, k, depth - 1, budget) });
    } else out.push(v);
  }
  return out;
}

async function scopes(root: string | null, { frameId, depth }: Msg, cheap = false) {
  const s = needStopped(root);
  const id = Number(frameId) || s.stop!.where?.id || s.frames[0]?.id;
  if (!id) throw new HttpError(400, 'which frame?');
  const r = await s.dap.req('scopes', { frameId: id }, 60e3);
  const list = ((r.body?.scopes || []) as Msg[]).map((x) => ({ name: String(x.name), ref: Number(x.variablesReference) || 0, expensive: !!x.expensive })).filter((x) => !cheap || !x.expensive);
  const d = Math.max(0, Math.min(Number(depth) || 0, 4));
  if (!d) return { frameId: id, scopes: list };
  const budget = { n: 600 };
  const out = [];
  for (const sc of list) out.push({ ...sc, vars: await grow(s, await kids(s, sc.ref).catch(() => []), d - 1, budget) });
  return { frameId: id, scopes: out };
}

async function frameAt(root: string | null, n: unknown) {
  if (n == null || n === '') return 0;
  const i = Math.floor(Number(n));
  const { frames } = await stack(root, {});
  if (!(i >= 0) || i >= frames.length) throw new HttpError(400, `no frame #${n}: the stack has #0–#${frames.length - 1} (debug stack)`);
  return frames[i].id;
}

const SKIP_DIRS = new Set(['.git', '.amethyst', 'node_modules', 'Intermediate', 'Binaries', 'Saved', 'DerivedDataCache', 'Content', '.vs']);
function findFile(root: string, tail: string) {
  const want = '/' + tail.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  const hits: string[] = [];
  let dirs = 0;
  const walk = (dir: string, depth: number) => {
    if (depth < 0 || dirs++ > 4000 || hits.length > 5) return;
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p, depth - 1);
      } else if (('/' + path.relative(root, p).replace(/\\/g, '/').toLowerCase()).endsWith(want)) hits.push(p);
    }
  };
  walk(root, 10);
  return hits;
}

function spot(root: string, word: unknown, cwd: unknown, known = false) {
  const m = /^(.+):(\d+)$/.exec(String(word ?? '').trim());
  if (!m) throw new HttpError(400, `where? give file:line, e.g. Source/Game/Pix.cpp:10 (got "${word ?? ''}")`);
  const f = m[1].trim(), line = Number(m[2]);
  if (path.isAbsolute(f)) return { abs: path.resolve(f), line };
  for (const base of [typeof cwd === 'string' && cwd ? cwd : '', root].filter(Boolean)) {
    const p = path.resolve(base, f);
    if (fs.existsSync(p)) return { abs: p, line };
  }
  const tail = '/' + f.replace(/\\/g, '/').toLowerCase();
  const stored = [...new Set(readBps(root).map((b) => absOf(root, b.file)).filter((a) => a.replace(/\\/g, '/').toLowerCase().endsWith(tail)))];
  if (known && stored.length === 1) return { abs: stored[0], line };
  const hits = findFile(root, f);
  if (hits.length === 1) return { abs: hits[0], line };
  if (hits.length > 1) throw new HttpError(400, `${f} is more than one file: ${hits.slice(0, 5).map((h) => relOf(root, h)).join(', ')}. Give more of its path.`);
  if (stored.length === 1) return { abs: stored[0], line };
  if (known) return { abs: path.resolve(root, f), line };
  throw new HttpError(404, `no file ${f} in the project`);
}

const stopped = async (root: string | null, w: Who, ms = 10e3) => {
  if (!w.outside || !root) return '';
  const r = (await wait(root, { ms })) as { session: Msg | null; timedOut: boolean };
  return r.timedOut ? `still running after ${ms / 1000} s. debug wait returns at the next stop.` : sayState(root, r.session, bpsOf(root));
};

async function vars(root: string | null, { ref, depth }: Msg) {
  const s = needStopped(root);
  const n = Number(ref);
  if (!n) throw new HttpError(400, 'which variables? give ref');
  const d = Math.max(0, Math.min(Number(depth) || 0, 4));
  const list = await kids(s, n);
  return { vars: d ? await grow(s, list, d, { n: 600 }) : list };
}

async function evaluate(root: string | null, { expr, frameId, context }: Msg) {
  const s = needStopped(root);
  const e = String(expr || '').trim();
  if (!e) throw new HttpError(400, 'evaluate what?');
  const ctx = ['watch', 'hover', 'repl', 'clipboard'].includes(context) ? context : 'watch';
  const id = Number(frameId) || s.stop!.where?.id || s.frames[0]?.id;
  try {
    const r = await s.dap.req('evaluate', { expression: e.slice(0, 4000), frameId: id, context: ctx }, ctx === 'repl' ? 60e3 : 20e3);
    return { ok: true, value: String(r.body?.result ?? ''), type: String(r.body?.type || ''), ref: Number(r.body?.variablesReference) || 0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function setValue(root: string | null, { ref, name, value }: Msg) {
  const s = needStopped(root);
  const r = await s.dap.req('setVariable', { variablesReference: Number(ref), name: String(name), value: String(value) }, 20e3);
  return { value: String(r.body?.value ?? ''), type: String(r.body?.type || '') };
}

function wait(root: string | null, { ms }: Msg) {
  if (!root) return Promise.resolve({ session: null, timedOut: false });
  const key = keyOf(root);
  const settled = () => {
    const st = shown(key);
    return !st || st.state === 'stopped' || st.state === 'ended';
  };
  if (settled()) return Promise.resolve({ session: shown(key), timedOut: false });
  const limit = Math.max(100, Math.min(Number(ms) || 30e3, 900e3));
  return new Promise((resolve) => {
    if (!keyWaiters.has(key)) keyWaiters.set(key, new Set());
    const done = (timedOut: boolean) => {
      clearTimeout(t);
      keyWaiters.get(key)?.delete(fire);
      resolve({ session: shown(key), timedOut });
    };
    const fire = () => settled() && done(false);
    const t = setTimeout(() => done(true), limit);
    keyWaiters.get(key)!.add(fire);
  });
}

async function breakpoints(root: string | null, { file, lines, add, remove, by, clear }: Msg) {
  if (!root) throw new HttpError(400, 'no project');
  const who = by === 'agent' ? 'agent' : 'you';
  const s = sessions.get(keyOf(root));
  const touched = new Set<string>();
  if (clear) {
    for (const b of readBps(root)) touched.add(absOf(root, b.file));
    await writeBps(root, []);
  }
  if (typeof file === 'string' && file) {
    const abs = absOf(root, file);
    const now = readBps(root).filter((b) => fold(absOf(root, b.file)) === fold(abs));
    let next: { line: number; cond?: string; off?: boolean; by?: string }[] | null = null;
    if (Array.isArray(lines)) next = lines.map((l: any) => (typeof l === 'number' ? { line: l } : { line: Number(l?.line), cond: l?.cond, off: !!l?.off, by: l?.by }));
    else if (add || remove) {
      next = now.map((b) => ({ line: b.line, cond: b.cond, off: b.off, by: b.by }));
      if (remove) next = next.filter((b) => b.line !== Number(remove));
      if (add) next = [...next.filter((b) => b.line !== Number(add.line ?? add)), { line: Number(add.line ?? add), cond: add.cond, off: !!add.off, by: who }];
    }
    if (next) {
      await setFile(root, abs, next.filter((l) => l.line >= 1), who);
      touched.add(abs);
    }
  }
  if (alive(s)) for (const abs of touched) await sendFile(s, abs);
  const out = bpsOf(root);
  send(keyOf(root), { type: 'bps', bps: out });
  return { bps: out };
}

function follow(root: string | null, out: Out) {
  if (!root) return null;
  const key = keyOf(root), s = sessions.get(key);
  out({ type: 'all', session: shown(key), bps: bpsOf(root), output: s ? s.output.slice(-SEND_OUT) : [], engine: engineState() });
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key)!.add(out);
  return () => subs.get(key)?.delete(out);
}

export const engineMissing = () => {
  const e = engineState();
  return e.ready ? null : (e as unknown as Record<string, unknown>);
};
export const debugging = (root: string) => alive(sessions.get(keyOf(root))) || (preps.has(keyOf(root)) && !preps.get(keyOf(root))!.ended);
export const sessionOf = (root: string) => shown(keyOf(root));

const ROUTES: Routes = {
  'POST /api/debug/state': async (body, __, root: string | null) => {
    root = whoOf(body, root).root;
    const s = root ? sessions.get(keyOf(root)) : undefined, session = root ? shown(keyOf(root)) : null, bps = root ? bpsOf(root) : [], engine = engineState();
    const text = engine.ready || session ? sayState(root || '', session, bps) : `the debugger isn't downloaded: the user downloads it in Settings → Unreal → debugger (about 17 MB, with Microsoft's licence to accept).`;
    return { session, bps, engine, frames: alive(s) && s.state === 'stopped' ? s.frames : [], text };
  },
  'POST /api/debug/engine': async () => engineState(),
  'POST /api/debug/install': async (body) => {
    if (!isUser()) throw new HttpError(403, "only the user downloads the debugger: it comes with Microsoft's licence to accept (Settings → Unreal → debugger)");
    const r = await install(body || {});
    for (const [key] of subs) send(key, { type: 'engine', engine: r });
    return r;
  },
  'POST /api/debug/uninstall': async (body) => {
    if (!isUser()) throw new HttpError(403, 'only the user removes the debugger (Settings → Unreal → debugger)');
    const busy = [...sessions.values()].find(alive);
    if (busy) throw new HttpError(409, `stop debugging ${busy.config.name} first: the debugger is in use`);
    const r = await uninstall();
    for (const [key] of subs) send(key, { type: 'engine', engine: r });
    return r;
  },
  'POST /api/debug/breakpoints': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b: Msg = { ...(body || {}) }, r0 = w.root;
    if (!r0) throw new HttpError(400, 'no project');
    let said = '';
    if (typeof b.at === 'string' && b.at) {
      const p = spot(r0, b.at, b.cwd);
      b.file = p.abs;
      b.add = { line: p.line, ...(b.if ? { cond: String(b.if) } : {}) };
      said = `set ${relOf(r0, p.abs)}:${p.line}${b.if ? ` if ${b.if}` : ''}.`;
    }
    if (typeof b.remove === 'string' && !(typeof b.file === 'string' && b.file) && /:\d+$/.test(b.remove)) {
      const p = spot(r0, b.remove, b.cwd, true);
      const had = readBps(r0).some((x) => fold(absOf(r0, x.file)) === fold(p.abs) && x.line === p.line);
      if (!had) throw new HttpError(404, `no breakpoint at ${relOf(r0, p.abs)}:${p.line}. ${sayBps(r0, bpsOf(r0))}`);
      b.file = p.abs;
      b.remove = p.line;
      said = `removed ${relOf(r0, p.abs)}:${p.line}.`;
    }
    if (b.clear || (typeof b.file === 'string' && b.file && (Array.isArray(b.lines) || b.add || b.remove))) allow(w, 'Setting or removing breakpoints');
    const r = await breakpoints(r0, { ...b, by: w.agent ? 'agent' : 'you' });
    return { ...r, text: `${said ? said + '\n' : ''}${sayBps(r0, r.bps)}` };
  },
  'POST /api/debug/continue': async (body, _, root: string | null) => {
    const w = whoOf(body, root);
    allow(w, 'Continuing');
    return { ...(await resume(w.root, 'continue', w.agent ? 'agent' : 'you')), text: 'it runs. debug wait returns at the next stop; debug pause stops it now.' };
  },
  'POST /api/debug/step': async (body, _, root: string | null) => {
    const w = whoOf(body, root);
    allow(w, 'Stepping');
    const r = await resume(w.root, String(body?.how || 'over'), w.agent ? 'agent' : 'you');
    return { ...r, text: await stopped(w.root, w) };
  },
  'POST /api/debug/watchpoint': async (body, _, root: string | null) => {
    const w = whoOf(body, root);
    allow(w, 'Watching a value');
    return watchpoint(w.root, body || {});
  },
  'POST /api/debug/runto': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b: Msg = { ...(body || {}) };
    allow(w, 'Running to a line');
    if (typeof b.at === 'string' && b.at && w.root) {
      const p = spot(w.root, b.at, b.cwd);
      b.file = p.abs;
      b.line = p.line;
    }
    const r = await runTo(w.root, { ...b, by: w.agent ? 'agent' : 'you' });
    return { ...r, text: `it runs to ${w.root ? relOf(w.root, absOf(w.root, String(b.file))) : b.file}:${b.line}. debug wait returns when it gets there, or stops anywhere else first.` };
  },
  'POST /api/debug/goto': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b: Msg = { ...(body || {}) };
    allow(w, 'Setting the next statement');
    if (typeof b.at === 'string' && b.at && w.root) {
      const p = spot(w.root, b.at, b.cwd);
      b.file = p.abs;
      b.line = p.line;
    }
    const r: Msg = await gotoLine(w.root, { ...b, by: w.agent ? 'agent' : 'you' });
    if (r.error && w.outside) throw new HttpError(409, r.error);
    return { ...r, text: r.error || `the next statement is line ${r.line}: it runs from there, and nothing that was skipped or repeated is undone.` };
  },
  'POST /api/debug/pause': async (body, _, root: string | null) => {
    const w = whoOf(body, root);
    allow(w, 'Pausing');
    const r = await pause(w.root, w.agent ? 'agent' : 'you');
    return { ...r, text: await stopped(w.root, w, 5e3) };
  },
  'POST /api/debug/stop': async (body, _, root: string | null) => {
    const w = whoOf(body, root), endIt = body?.end === true;
    allow(w, endIt ? 'Ending the program' : 'Stopping the debugger', endIt ? ' Ending it would lose any unsaved work in Unreal Editor.' : '');
    const s = w.root ? sessions.get(keyOf(w.root)) : undefined, name = alive(s) ? s.config.name : '';
    const r: Msg = await leave(w.root, endIt);
    const text = r.cancelled ? 'the build was cancelled; nothing started.' : r.already ? 'not debugging.' : endIt ? `${name}: the program was ended. Unsaved work in Unreal Editor is lost.` : `detached from ${name}: the program keeps running.`;
    return { ...r, text };
  },
  'POST /api/debug/threads': async (body, _, root: string | null) => threads(whoOf(body, root).root),
  'POST /api/debug/stack': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b = body || {};
    const r = await stack(w.root, { ...b, threadId: b.threadId ?? b.thread });
    return { ...r, text: sayStack(w.root || '', r.frames, b.all === true) };
  },
  'POST /api/debug/scopes': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b = body || {};
    const frameId = b.frameId || (await frameAt(w.root, b.frame));
    const r = await scopes(w.root, { frameId, depth: b.depth ?? (w.outside ? 2 : 0) }, w.outside);
    const f = sessions.get(keyOf(w.root!))?.frames.find((x) => x.id === r.frameId);
    return { ...r, text: sayScopes(r.scopes, f ? `${f.bp ? `Blueprint ${f.blueprint}${f.fn ? ` · ${f.fn}` : ''}` : f.name.replace(/\+0x[0-9a-f]+$/i, '')}${f.file ? ` (${placeOf(w.root || '', f, true)})` : ''}` : `frame ${r.frameId}`) };
  },
  'POST /api/debug/vars': async (body, _, root: string | null) => {
    const w = whoOf(body, root), r = await vars(w.root, body || {});
    return { ...r, text: sayVars(r.vars, '').join('\n') || '(none)' };
  },
  'POST /api/debug/eval': async (body, _, root: string | null) => {
    const w = whoOf(body, root), b = { ...(body || {}) }, e = String(b.expr ?? '').trim();
    if (changes(e)) {
      allow(w, 'An evaluate with a call or an assignment', ' It could change the program.');
      const call = /\(/.test(e);
      await runs.mayRun(body, (who) => ({ title: `Allow ${call ? 'a call' : 'a change'} in the program you're debugging?`, text: `${who} wants to evaluate this, which ${call ? 'calls a function' : 'changes a value'}.`, code: e }));
    }
    if (w.agent) b.context = 'watch';
    if (b.frame != null && !b.frameId) b.frameId = await frameAt(w.root, b.frame);
    const r = await evaluate(w.root, b);
    if (!r.ok && w.outside) throw new HttpError(400, `${e}: ${r.error}`);
    if (!r.ok) return { ...r, text: `${e}: ${r.error}` };
    const head = `${e} = ${r.value}${r.type ? `  · ${r.type}` : ''}`;
    if (!w.outside || !r.ref) return { ...r, text: head };
    const kids = await vars(w.root, { ref: r.ref, depth: Math.min(Number(b.depth) || 0, 3) }).catch(() => ({ vars: [] }));
    return { ...r, text: [head, ...sayVars(kids.vars)].join('\n') };
  },
  'POST /api/debug/set': async (body, _, root: string | null) => {
    const w = whoOf(body, root);
    allow(w, 'Changing a value');
    return setValue(w.root, body || {});
  },
  'POST /api/debug/wait': async (body, _, root: string | null) => {
    const w = whoOf(body, root), r = (await wait(w.root, body || {})) as { session: Msg | null; timedOut: boolean };
    const ms = Math.max(100, Math.min(Number(body?.ms) || 30e3, 900e3));
    const now = sayState(w.root || '', r.session, w.root ? bpsOf(w.root) : []);
    return { ...r, text: r.timedOut ? `still ${r.session?.state || 'running'} after ${Math.round(ms / 100) / 10} s: call debug wait again to keep waiting.\n${now}` : now };
  },
  'POST /api/debug/exceptions': async (body, _, root: string | null) => {
    const w = whoOf(body, root), { ensure, cpp } = body || {};
    allow(w, 'Changing what the debugger stops on');
    root = w.root;
    const s = need(root);
    s.config.exceptions = [...(ensure === false ? [] : ['ensure']), ...(cpp === true ? ['cpp'] : [])];
    await s.dap.req('setExceptionBreakpoints', { filters: s.config.exceptions }).catch(() => {});
    return { ok: true, filters: s.config.exceptions };
  },
  'POST /api/debug/output': async (body, _, root: string | null) => {
    const from = body?.from;
    root = whoOf(body, root).root;
    const s = root ? sessions.get(keyOf(root)) : undefined;
    const all = s?.output || [];
    return { lines: all.slice(Math.max(0, Number(from) || all.length - SEND_OUT)), total: all.length };
  },
};

export { ROUTES, follow, relOf };
