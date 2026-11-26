import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { agyHome } from '../base/agystore.ts';
import { configDir } from '../base/agentdirs.ts';
import { WIN } from '../base/util.ts';
import { OUT_MAX } from '../../public/base/util.ts';
import type { Artifact } from '../../public/base/types.ts';
import { clean } from './tails.ts';

type U = Record<string, any>;
type Out = (u: any) => void;
type Pair = { name: string; value: string };
type Cli = { command: string; script: string; env: Record<string, string> };
type Shell = { env: Record<string, string>; bin: string; cli?: Cli } | null;

interface Call {
  name: string;
  result: string | null;
}
interface Wait {
  name: string;
  nth: number;
  done: boolean;
  tries: number;
}
interface PendingTool {
  name: string;
  kind: string;
  title: string;
  args: Record<string, any>;
  locations: U[];
}
interface BgCmd {
  id: string;
  taskId: string | null;
  file: string | null;
  size: number;
  mtime: number;
  data: string;
  start: number;
}
interface StepState {
  sid: string;
  pos: number;
  rest: string;
  calls: Call[];
  open: Call[];
  seen: Map<string, number>;
  waits: Map<string, Wait>;
  tools: Map<string, PendingTool>;
  bgs: Map<string, BgCmd>;
  claimed: Set<string>;
  plan: string | null;
  artifacts: Map<string, Artifact>;
  hiddenArtifacts: Set<string>;
  artifactsKey: string;
  tick: ReturnType<typeof setTimeout> | null;
  bgTick: ReturnType<typeof setInterval> | null;
}
interface AgyChat {
  sessionId?: string | null;
  ended?: boolean;
  agySteps?: StepState | null;
}

const EVERY = 300;
const BG_EVERY = 200;
const BG_TAIL = 65536;
const FULL_MAX = 262144;
const TRIES = 100;
const OWN = new Set(['invoke_subagent', 'schedule', 'manage_subagents', 'manage_task', 'send_message', 'swarm', 'run_workflow']);
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const text = (t: string) => [{ type: 'content', content: { type: 'text', text: t.slice(0, OUT_MAX) } }];

const expand = (s: string) => s.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_m, k, d) => process.env[k] ?? d ?? '');
const pairs = (o: unknown): Pair[] => (o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).filter(([, v]) => v != null && typeof v !== 'object').map(([name, v]) => ({ name, value: expand(String(v)) })) : []);
function claudeServers(): Record<string, any> {
  const file = process.env.CLAUDE_CONFIG_DIR ? path.join(configDir(), '.claude.json') : path.join(os.homedir(), '.claude.json');
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'))?.mcpServers;
    return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
  } catch {
    return {};
  }
}
function mcpServers(shell: Shell, init: any): any[] {
  const caps = init?.agentCapabilities?.mcpCapabilities || {};
  const out: any[] = [];
  const cli = shell?.cli;
  if (cli?.script) out.push({ name: 'amethyst', command: cli.command, args: [cli.script, 'mcp'], env: pairs({ ...cli.env, ...shell!.env }) });
  for (const [name, s] of Object.entries(claudeServers())) {
    try {
      if (!s || typeof s !== 'object' || !/^[\w-]+$/.test(name) || out.some((x) => x.name === name)) continue;
      const type = str(s.type) || (s.url ? 'http' : 'stdio');
      if (type === 'stdio' && str(s.command)) out.push({ name, command: expand(s.command), args: Array.isArray(s.args) ? s.args.map((a: unknown) => expand(String(a))) : [], env: pairs(s.env) });
      else if ((type === 'http' || type === 'sse') && str(s.url) && caps[type]) out.push({ type, name, url: expand(s.url), headers: pairs(s.headers) });
    } catch {}
  }
  return out;
}

const native = (p: string) => (WIN ? p.replace(/^\/?([A-Za-z]):[\\/]/, (_m, d) => `${d}:\\`).replace(/^([A-Za-z]:\\.*)$/, (m) => m.replace(/\//g, '\\')) : p);
function mcpTitle(name: string) {
  const raw = name.replace(/^Run\s+/, '');
  const m = /^mcp_([^_]+)_(.+)$/.exec(raw);
  return m ? `${m[1]}: ${m[2]}` : raw.replace(/^mcp_/, '');
}
const HEAD = /^(?:(?:Created|Completed) At:[^\n]*\n)+/;
const CMD = /^(?:(?:Created|Completed) At:[^\n]*\n)*(?:Command exited with code (-?\d+)\.?\n)?\n?(?:Command output:\n)?/;
function cleanCmd(t: string) {
  const m = t.replace(/\r\n/g, '\n').match(CMD)!;
  return { out: t.replace(/\r\n/g, '\n').slice(m[0].length).replace(/^\n+/, ''), code: m[1] != null ? Number(m[1]) : null };
}
function fix(u: U) {
  if (!u?.toolCallId || !/^tool_call/.test(str(u.sessionUpdate))) return u;
  const o: U = { ...u };
  if (Array.isArray(u.locations)) o.locations = u.locations.map((l: U) => (str(l?.path) ? { ...l, path: native(l.path) } : l));
  if (Array.isArray(u.content)) o.content = u.content.map((c: U) => (c?.type === 'diff' && str(c.path) ? { ...c, path: native(c.path) } : c));
  if (WIN && str(u.title)) o.title = u.title.replace(/(^|\s)\/([A-Za-z]):\/(\S*)/g, (_m: string, a: string, d: string, rest: string) => `${a}${d}:\\${rest.replace(/\//g, '\\')}`);
  const name = str(u.name), title = str(u.title);
  if ((/^mcp_/.test(name) || /^(?:Run\s+)?mcp_/.test(title)) && (!title || /^(?:Run\s+)?mcp_/.test(title))) o.title = mcpTitle(/^mcp_/.test(name) ? name : title);
  if (u.kind === 'execute') {
    const a = u.rawInput || {}, sum = str(a.toolSummary) || str(u.args?.toolSummary), cmd = str(a.CommandLine) || str(u.args?.CommandLine);
    o.rawInput = { ...a, ...(cmd ? { command: cmd } : {}), ...(sum ? { description: sum } : {}) };
    let code = typeof u.rawOutput?.exit_code === 'number' ? u.rawOutput.exit_code : null;
    if (Array.isArray(u.content)) o.content = u.content.map((c: U) => {
      if (c?.type !== 'content' || c.content?.type !== 'text') return c;
      const r = cleanCmd(str(c.content.text));
      if (code == null) code = r.code;
      return { ...c, content: { ...c.content, text: r.out } };
    });
    if (code != null && /^(completed|failed)$/.test(str(u.status))) o._meta = { ...u._meta, terminal_exit: { exit_code: code } };
  }
  return o;
}

function begin(c: AgyChat) {
  stopAll(c);
  const S: StepState = { sid: c.sessionId || '', pos: 0, rest: '', calls: [], open: [], seen: new Map(), waits: new Map(), tools: new Map(), bgs: new Map(), claimed: new Set(), plan: null, artifacts: new Map(), hiddenArtifacts: new Set(), artifactsKey: '', tick: null, bgTick: null };
  read(S);
  for (const x of S.calls) S.seen.set(x.name, (S.seen.get(x.name) || 0) + 1);
  return (c.agySteps = S);
}
const of = (c: AgyChat): StepState => (c.agySteps && c.agySteps.sid === (c.sessionId || '') ? c.agySteps : begin(c));
const brain = (sid: string) => path.join(agyHome(), 'brain', sid);
function read(S: StepState) {
  if (!S.sid) return;
  const file = path.join(brain(S.sid), '.system_generated', 'logs', 'transcript.jsonl');
  let fd: number | null = null;
  try {
    const size = fs.statSync(file).size;
    if (size < S.pos) Object.assign(S, { pos: 0, rest: '', calls: [], open: [] });
    if (size <= S.pos) return;
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - S.pos);
    fs.readSync(fd, buf, 0, buf.length, S.pos);
    S.pos = size;
    const all = (S.rest + buf.toString('utf8')).split('\n');
    S.rest = all.pop() || '';
    for (const l of all) {
      let e: U | null = null;
      try {
        e = JSON.parse(l);
      } catch {}
      if (!e || e.source === 'SYSTEM' || e.type === 'USER_INPUT') continue;
      if (e.type === 'PLANNER_RESPONSE') {
        for (const t of Array.isArray(e.tool_calls) ? e.tool_calls : []) {
          const call = { name: str(t?.name), result: null };
          S.calls.push(call);
          S.open.push(call);
        }
        continue;
      }
      const call = S.open.shift();
      if (call) call.result = str(e.content).replace(/\r\n/g, '\n').replace(HEAD, '').trim().replace(/^Encountered error in step execution:\s*/, '');
    }
  } catch {
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}
const resultOf = (S: StepState, w: Wait) => S.calls.filter((x) => x.name === w.name)[w.nth]?.result ?? null;
const wants = (u: U) => {
  const name = str(u.name);
  if (!name || OWN.has(name)) return false;
  return /^mcp_/.test(name) || u.kind === 'read' || u.kind === 'search' || u.kind === 'fetch' || name === 'read_file' || name === 'view_file';
};
const PLAN = /[\\/]brain[\\/][^\\/]+[\\/]plan\.md$/i;
const DOC_EXT = /\.md$/i;
const IMG_EXT = /\.(?:png|jpe?g|webp|gif|svg)$/i;
const IMG_PATH = /(?:\/?[A-Za-z]:[\\/][^\s"'`<>|]+|\/(?:[^\s"'`<>|]+\/)+[^\s"'`<>|]+)\.(?:png|jpe?g|webp|gif|svg)\b/gi;
const artKey = (p: string) => (WIN ? p.toLowerCase() : p);
const kindOf = (p: string): 'doc' | 'image' => (IMG_EXT.test(p) ? 'image' : 'doc');
function inBrain(sid: string, p: string) {
  const m = native(p).match(/[\\/]brain[\\/]([^\\/]+)[\\/](.+)$/i);
  if (!m) return false;
  if (sid && (WIN ? m[1].toLowerCase() !== sid.toLowerCase() : m[1] !== sid)) return false;
  const rel = m[2];
  return !/^(?:\.system_generated|scratch)(?:[\\/]|$)/i.test(rel) && !/^\./.test(path.basename(rel));
}
function metaOf(a: Record<string, any>) {
  let m = a.ArtifactMetadata ?? a.artifactMetadata;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== 'object') return null;
  const uf = m.UserFacing ?? m.userFacing;
  const rf = m.RequestFeedback ?? m.requestFeedback;
  return {
    userFacing: typeof uf === 'boolean' ? uf : undefined,
    summary: str(m.Summary ?? m.summary).trim(),
    requestFeedback: typeof rf === 'boolean' ? rf : undefined,
  };
}
function recordArtifact(S: StepState, rawPath: string, opts: { userFacing?: boolean; summary?: string; requestFeedback?: boolean; kind?: 'doc' | 'image' }) {
  const p = native(rawPath);
  if (!p) return;
  const k = artKey(p);
  if (opts.userFacing === false) {
    S.hiddenArtifacts.add(k);
    S.artifacts.delete(k);
    return;
  }
  if (S.hiddenArtifacts.has(k) && opts.userFacing !== true) return;
  S.hiddenArtifacts.delete(k);
  const prev = S.artifacts.get(k);
  S.artifacts.set(k, {
    path: p,
    name: path.basename(p),
    summary: opts.summary !== undefined ? opts.summary : prev?.summary || '',
    requestFeedback: opts.requestFeedback !== undefined ? opts.requestFeedback : prev?.requestFeedback || false,
    kind: opts.kind || kindOf(p),
  });
}
function emitArtifacts(c: AgyChat, S: StepState, out: Out, sync = false) {
  const artifacts = [...S.artifacts.values()];
  const key = JSON.stringify(artifacts);
  if (key === S.artifactsKey) return;
  S.artifactsKey = key;
  if (sync) {
    if (!c.ended) out({ sessionUpdate: 'artifacts', artifacts });
  } else {
    queueMicrotask(() => !c.ended && out({ sessionUpdate: 'artifacts', artifacts }));
  }
}
function imagePathsIn(u: U) {
  const found: string[] = [];
  const add = (s: string) => {
    for (const m of s.matchAll(IMG_PATH)) found.push(m[0]);
  };
  for (const l of Array.isArray(u.locations) ? u.locations : []) if (IMG_EXT.test(str(l?.path))) found.push(str(l.path));
  for (const c of Array.isArray(u.content) ? u.content : []) {
    if (c?.type === 'content' && c.content?.type === 'text') add(str(c.content.text));
    else if (typeof c?.text === 'string') add(c.text);
  }
  if (typeof u.rawOutput === 'string') add(u.rawOutput);
  else if (u.rawOutput && typeof u.rawOutput === 'object') add(JSON.stringify(u.rawOutput));
  return [...new Set(found)];
}
function scanBrainImages(S: StepState, sid: string) {
  const dir = brain(sid);
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || !IMG_EXT.test(name)) continue;
      recordArtifact(S, path.join(dir, name), { kind: 'image' });
    }
  } catch {}
}
function clearFeedback(c: AgyChat, out: Out) {
  const S = c.agySteps;
  if (!S?.artifacts.size) return;
  let changed = false;
  for (const [k, a] of S.artifacts) {
    if (a.requestFeedback) {
      S.artifacts.set(k, { ...a, requestFeedback: false });
      changed = true;
    }
  }
  if (changed) emitArtifacts(c, S, out, true);
}
function planText(S: StepState, u: U, file: string) {
  const a = { ...(u.args || {}), ...(u.rawInput || {}) };
  if (typeof a.Content === 'string' && a.Content) return a.Content;
  if (S.plan != null && typeof a.Target === 'string' && typeof a.Replacement === 'string' && S.plan.includes(a.Target)) return S.plan.replace(a.Target, a.Replacement);
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
function planOf(t: string) {
  const entries = t.split(/\r?\n/).map((l) => l.match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX/~-])\]\s+(.*\S)\s*$/)).filter(Boolean).map((m) => ({ content: m![2], status: /x/i.test(m![1]) ? 'completed' : m![1] === ' ' ? 'pending' : 'in_progress', priority: 'medium' }));
  return entries.length ? entries : null;
}

const STEP_OUT = /(file:\/\/\/[^\s"'<>()]+?\/\.system_generated\/steps\/\d+\/output\.txt|[^\s"'<>()]+?[\\/]\.system_generated[\\/]steps[\\/]\d+[\\/]output\.txt)(?=[.,;:!?)}\s"']|$)/i;
const BG_TEXT = /running in (?:the )?background|background (?:task|command|process)/i;
const TRUNC = /truncated|full output in a file at/i;
const TASK_ID = /\b(?:task[_ ]?id|background with id)\s*[:=]\s*["']?([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)["']?/i;
const EXIT_CODE = /(?:command )?exited with code (-?\d+)|exit[_ ]?code\s*[:=]\s*(-?\d+)/i;
const END_TAIL = /\n*\[exited with code (-?\d+)\]\s*$/;
const TASK_DONE = /\b(?:exited|completed|finished|stopped|terminated|killed|not found)\b/i;
const COMPLETED_AT = /^Completed At:/m;

const contentText = (u: U) => {
  const parts = Array.isArray(u.content)
    ? u.content.filter((x: U) => x?.type === 'content' && x.content?.type === 'text').map((x: U) => str(x.content.text)).join('\n')
    : '';
  return parts || str(u.rawOutput?.output) || str(u.rawOutput?.text);
};
const inside = (root: string, file: string) => {
  const a = path.resolve(root) + path.sep, b = path.resolve(file);
  return WIN ? b.toLowerCase().startsWith(a.toLowerCase()) : b.startsWith(a);
};
function stepFile(sid: string, raw: string) {
  const m = raw.match(STEP_OUT);
  if (!m) return null;
  let f = m[1];
  if (/^file:\/\//i.test(f)) {
    try {
      f = fileURLToPath(f);
    } catch {
      f = native(f.replace(/^file:\/\//i, ''));
    }
  } else f = native(f);
  const full = path.resolve(f);
  return inside(brain(sid), full) ? full : null;
}
function taskIdOf(u: U, raw: string) {
  const r = u.rawOutput || {};
  const direct = str(r.taskId) || str(r.TaskId) || str(r.task_id);
  if (direct) return direct;
  const m = raw.match(TASK_ID);
  return m ? m[1] : null;
}
function exitCodeOf(raw: string) {
  const m = raw.match(EXIT_CODE);
  if (!m) return null;
  const v = m[1] ?? m[2];
  return v != null ? Number(v) : null;
}
function readStepFile(file: string, max: number, prevSize = -1, prevMtime = -1) {
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  if (st.size === prevSize && st.mtimeMs === prevMtime) return null;
  let fd: number | null = null;
  let head = '';
  let body = '';
  try {
    fd = fs.openSync(file, 'r');
    if (st.size <= max) {
      const buf = Buffer.alloc(st.size);
      fs.readSync(fd, buf, 0, st.size, 0);
      body = buf.toString('utf8');
    } else {
      const h = Buffer.alloc(Math.min(512, st.size));
      fs.readSync(fd, h, 0, h.length, 0);
      head = h.toString('utf8');
      const buf = Buffer.alloc(max);
      fs.readSync(fd, buf, 0, max, st.size - max);
      body = buf.toString('utf8');
      const nl = body.indexOf('\n');
      if (nl >= 0) body = body.slice(nl + 1);
    }
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
  const hRaw = head || body;
  const parsed = cleanCmd(hRaw);
  let out = head ? body : parsed.out;
  let code = parsed.code;
  const em = out.match(END_TAIL);
  if (em) {
    out = out.slice(0, em.index);
    if (code == null) code = Number(em[1]);
  }
  const done = code != null || COMPLETED_AT.test(hRaw.replace(/\r\n/g, '\n'));
  return { data: clean(out), code, done, size: st.size, mtime: st.mtimeMs };
}
function bgMeta(data: string, done: boolean, code: number | null) {
  return {
    liveOutput: { data, bg: true, ...(done ? { done: true, exit: code } : {}) },
    ...(done && code != null ? { terminal_exit: { exit_code: code } } : {}),
  };
}
function claimStep(S: StepState, bg: BgCmd) {
  const dir = path.join(brain(S.sid), '.system_generated', 'steps');
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  const since = bg.start - 2000;
  const picks: { file: string; at: number }[] = [];
  for (const n of names) {
    if (!/^\d+$/.test(n)) continue;
    const f = path.join(dir, n, 'output.txt');
    if (S.claimed.has(f)) continue;
    try {
      const st = fs.statSync(f);
      if (st.mtimeMs >= since) picks.push({ file: f, at: st.mtimeMs });
    } catch {}
  }
  picks.sort((a, b) => a.at - b.at);
  if (picks.length) {
    bg.file = picks[0].file;
    S.claimed.add(bg.file);
  }
}
function stopBgTick(S: StepState) {
  if (!S.bgs.size && S.bgTick) {
    clearInterval(S.bgTick);
    S.bgTick = null;
  }
}
function pollBgs(c: AgyChat, S: StepState, out: Out) {
  if (!S.bgs.size || c.ended || c.agySteps !== S) {
    if (S.bgTick) clearInterval(S.bgTick);
    S.bgTick = null;
    return;
  }
  for (const bg of [...S.bgs.values()]) {
    if (!bg.file) claimStep(S, bg);
    if (!bg.file) continue;
    const r = readStepFile(bg.file, BG_TAIL, bg.size, bg.mtime);
    if (!r) continue;
    bg.size = r.size;
    bg.mtime = r.mtime;
    bg.data = r.data;
    if (r.done) S.bgs.delete(bg.id);
    out({ sessionUpdate: 'tool_call_update', toolCallId: bg.id, _meta: bgMeta(bg.data, r.done, r.code) });
  }
  stopBgTick(S);
}
function watchBg(c: AgyChat, S: StepState, out: Out, id: string, taskId: string | null, file: string | null) {
  let bg = S.bgs.get(id);
  if (!bg) {
    bg = { id, taskId, file, size: -1, mtime: -1, data: '', start: Date.now() };
    S.bgs.set(id, bg);
  }
  if (taskId) bg.taskId = taskId;
  if (file) {
    bg.file = file;
    S.claimed.add(file);
  }
  if (!bg.file) claimStep(S, bg);
  let done = false;
  let code: number | null = null;
  if (bg.file) {
    const r = readStepFile(bg.file, BG_TAIL, bg.size, bg.mtime);
    if (r) {
      bg.size = r.size;
      bg.mtime = r.mtime;
      bg.data = r.data;
      done = r.done;
      code = r.code;
    }
  }
  if (done) {
    S.bgs.delete(id);
    stopBgTick(S);
  } else {
    S.bgTick ||= setInterval(() => pollBgs(c, S, out), BG_EVERY);
  }
  return { data: bg.data, done, code };
}
function matchBg(S: StepState, taskId: string) {
  if (taskId) {
    for (const bg of S.bgs.values()) if (bg.taskId === taskId || bg.id === taskId) return bg;
    const unnamed = [...S.bgs.values()].filter((bg) => !bg.taskId);
    if (unnamed.length === 1) {
      unnamed[0].taskId = taskId;
      return unnamed[0];
    }
  }
  return S.bgs.size === 1 ? [...S.bgs.values()][0] : null;
}
function handleManageTask(S: StepState, u: U, out: Out) {
  const a = { ...(u.args || {}), ...(u.rawInput || {}) };
  const action = str(a.Action || a.action).toLowerCase();
  if (action !== 'kill' && action !== 'status') return;
  const taskId = str(a.TaskId || a.taskId || a.task_id);
  const bg = matchBg(S, taskId);
  if (!bg) return;
  const raw = contentText(u);
  const r = bg.file ? readStepFile(bg.file, BG_TAIL, bg.size, bg.mtime) : null;
  if (r) {
    bg.size = r.size;
    bg.mtime = r.mtime;
    bg.data = r.data;
  }
  const code = r?.code ?? exitCodeOf(raw);
  if (action === 'kill') {
    S.bgs.delete(bg.id);
    stopBgTick(S);
    out({ sessionUpdate: 'tool_call_update', toolCallId: bg.id, _meta: bgMeta(bg.data, true, code) });
    return;
  }
  const done = !!(r?.done || code != null || TASK_DONE.test(raw));
  if (done) {
    S.bgs.delete(bg.id);
    stopBgTick(S);
    out({ sessionUpdate: 'tool_call_update', toolCallId: bg.id, _meta: bgMeta(bg.data, true, code) });
  } else if (r) {
    out({ sessionUpdate: 'tool_call_update', toolCallId: bg.id, _meta: bgMeta(bg.data, false, null) });
  }
}

function see(c: AgyChat, u: U, out: Out) {
  if (!u?.toolCallId || !/^tool_call/.test(str(u.sessionUpdate)) || !c.sessionId) return u;
  const id = u.toolCallId, fin = u.status === 'completed' || u.status === 'failed';
  const S = of(c);
  const prev = S.tools.get(id);
  const cur: PendingTool = {
    name: str(u.name) || prev?.name || '',
    kind: str(u.kind) || prev?.kind || '',
    title: str(u.title) || prev?.title || '',
    args: { ...(prev?.args || {}), ...(u.args || {}), ...(u.rawInput || {}) },
    locations: Array.isArray(u.locations) && u.locations.length ? u.locations : prev?.locations || [],
  };
  if (fin) S.tools.delete(id);
  else S.tools.set(id, cur);
  if (u.status === 'completed') {
    const a = cur.args;
    const name = cur.name;
    const paths = [str(a.Path), str(a.AbsolutePath), str(a.TargetFile), ...cur.locations.map((l: U) => str(l?.path))].filter(Boolean);
    const fp = paths[0] || '';
    const meta = metaOf(a);
    if (meta && fp) {
      recordArtifact(S, fp, meta);
      emitArtifacts(c, S, out);
    } else if ((cur.kind === 'edit' || name === 'write_file' || name === 'edit_file') && fp && inBrain(c.sessionId, fp) && (DOC_EXT.test(fp) || IMG_EXT.test(fp))) {
      recordArtifact(S, fp, {});
      emitArtifacts(c, S, out);
    } else if (name === 'generate_image' || (name === 'invoke_subagent' && (str(a.TypeName) === 'image-generator' || /image/i.test(str(a.Role)) || /image/i.test(cur.title)))) {
      for (const p of imagePathsIn({ ...u, locations: cur.locations })) recordArtifact(S, p, { kind: 'image' });
      scanBrainImages(S, c.sessionId);
      emitArtifacts(c, S, out);
    }
    if (cur.kind === 'edit') {
      const p = paths.find((x) => PLAN.test(x));
      const t = p ? planText(S, { ...u, args: cur.args }, fs.existsSync(native(p)) ? native(p) : path.join(brain(c.sessionId), 'plan.md')) : null;
      const entries = t != null ? planOf((S.plan = t)) : null;
      if (entries) queueMicrotask(() => !c.ended && out({ sessionUpdate: 'plan', entries }));
    }
  }
  if (str(u.name) === 'manage_task' && fin) {
    handleManageTask(S, u, out);
    return u;
  }
  if (u.kind === 'execute') {
    const a = { ...(u.args || {}), ...(u.rawInput || {}) };
    const raw = contentText(u);
    const file = stepFile(c.sessionId, raw);
    const taskId = taskIdOf(u, raw);
    const isBg = u.status !== 'failed' && (S.bgs.has(id) || a.IsDaemon === true || BG_TEXT.test(raw) || !!taskId);
    if (isBg) {
      const r = watchBg(c, S, out, id, taskId, file);
      return { ...u, _meta: { ...u._meta, ...bgMeta(r.data, r.done, r.code) } };
    }
    if (fin && file && TRUNC.test(raw)) {
      const r = readStepFile(file, FULL_MAX);
      if (r) {
        return {
          ...u,
          content: text(r.data),
          _meta: {
            ...u._meta,
            ...(r.code != null ? { terminal_exit: { exit_code: r.code } } : {}),
            liveOutput: { data: r.data, done: true, ...(r.code != null ? { exit: r.code } : {}) },
          },
        };
      }
    }
  }
  let w = S.waits.get(id);
  if (!w && !wants(u)) return u;
  if (!w) {
    const name = str(u.name), nth = S.seen.get(name) || 0;
    S.seen.set(name, nth + 1);
    w = { name, nth, done: false, tries: 0 };
    S.waits.set(id, w);
  }
  if (!fin || w.done) return u;
  w.done = true;
  if (Array.isArray(u.content) && u.content.length) return S.waits.delete(id), u;
  read(S);
  const r = resultOf(S, w);
  if (r != null) return S.waits.delete(id), { ...u, content: text(r) };
  later(c, S, out);
  return u;
}
function later(c: AgyChat, S: StepState, out: Out) {
  if (S.tick) return;
  S.tick = setTimeout(() => {
    S.tick = null;
    if (c.ended || c.agySteps !== S) return;
    read(S);
    for (const [id, w] of S.waits) {
      if (!w.done) continue;
      const r = resultOf(S, w);
      if (r != null) {
        S.waits.delete(id);
        out({ sessionUpdate: 'tool_call_update', toolCallId: id, content: text(r) });
      } else if (++w.tries > TRIES) S.waits.delete(id);
    }
    if ([...S.waits.values()].some((w) => w.done)) later(c, S, out);
  }, EVERY);
}
function stopAll(c: AgyChat) {
  const S = c.agySteps;
  if (!S) return;
  if (S.tick) clearTimeout(S.tick);
  S.tick = null;
  if (S.bgTick) clearInterval(S.bgTick);
  S.bgTick = null;
  S.waits.clear();
  S.bgs.clear();
  S.claimed.clear();
}

interface AgyWt {
  root: string;
  path: string;
  branch?: string;
  gone?: boolean;
}
function agySystemAppend(c: { wt?: AgyWt | null }, shell: Shell): string {
  const parts = [
    shell?.cli?.script
      ? 'This session is running inside Amethyst, and the amethyst MCP server exposes mcp_amethyst_* tools (such as agent_run, chat_list, chat_send, and git_status) for coordinating with other agents and chats.'
      : 'This session is running inside Amethyst.',
  ];
  if (c.wt && !c.wt.gone) {
    const branch = c.wt.branch ? `on branch "${c.wt.branch}" ` : '';
    parts.push(`You are working in an isolated git worktree ${branch}at ${c.wt.path} (main project root: ${c.wt.root}).`);
  }
  return parts.join(' ');
}

export { mcpServers, mcpTitle, agySystemAppend, fix, see, begin, stopAll, native, clearFeedback };
