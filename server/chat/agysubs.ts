import fs from 'fs';
import path from 'path';
import { agyHome } from '../base/agystore.ts';
import { OUT_MAX } from '../../public/base/util.ts';
import { mcpTitle, native } from './agysteps.ts';

type U = Record<string, any>;
type Out = (u: any) => void;
type Kind = 'sub' | 'swarm' | 'workflow';

interface Kid {
  call: string;
  parentCall: string;
  kind: Kind;
  role: string;
  type: string;
  prompt: string;
  model: string;
  id: string | null;
  announced: boolean;
  pos: number;
  rest: string;
  open: string[];
  bypass: Map<string, { at: number; warned: boolean }>;
  idle: boolean;
  reply: string;
  result: string;
  ended: boolean;
  endAt: number;
  steps: number;
}
interface WorkflowRun {
  call: string;
  title: string;
  before: Set<string>;
  ended: boolean;
  endAt: number;
}
interface Timer {
  cond: string;
  secs: number;
  cron: string;
}
interface AgyState {
  kids: Map<string, Kid>;
  workflows: Map<string, WorkflowRun>;
  timers: Map<string, Timer>;
  busy: Set<string>;
  msgs: Set<string>;
  told: boolean;
  tick: ReturnType<typeof setInterval> | null;
  out: Out | null;
}
interface AgyChat {
  agy?: AgyState;
  sessionId?: string | null;
  ended?: boolean;
}

const EVERY = 1000;
const KEEP = 600000;
const STALL = Math.max(100, Number(process.env.MIND_AGY_STALL_MS) || 45000);
const GENERIC = /^Run [\w-]+$/;
const DENIED = /permission check failed/i;
const BG_FLOW = /running in (?:the )?background/i;
const BLOCKED = "Antigravity's subagents can't ask you for permission, so Antigravity refused this. In Auto mode they can read files and run safe commands.";
const STALLED = "Waiting for sandbox bypass approval. Antigravity subagents can't ask you for permission in Auto mode, so destructive commands with BypassSandbox may hang until stopped.";

const of = (c: AgyChat): AgyState => (c.agy ||= { kids: new Map(), workflows: new Map(), timers: new Map(), busy: new Set(), msgs: new Set(), told: false, tick: null, out: null });
const sys = (id: string) => path.join(agyHome(), 'brain', id, '.system_generated');
const str = (x: unknown) => (typeof x === 'string' ? x : '');
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false));
const arg = (x: unknown) => {
  const s = str(x);
  if (!/^"/.test(s)) return s;
  try {
    return str(JSON.parse(s));
  } catch {
    return s;
  }
};
const argsOf = (u: U) => ({ ...(u.rawInput || {}), ...(u.args || {}) }) as Record<string, unknown>;
const text = (t: string) => [{ type: 'content', content: { type: 'text', text: t.slice(0, OUT_MAX) } }];
const textOf = (u: U) => {
  const parts = (Array.isArray(u.content) ? u.content : []).map((c: any) => (c?.type === 'content' && c.content?.type === 'text' ? str(c.content.text) : '')).filter(Boolean);
  if (!parts.length && typeof u.rawOutput === 'string') parts.push(u.rawOutput);
  return parts.join('\n');
};

function span(secs: number) {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s} s`;
  if (s % 3600 === 0) return `${s / 3600} h`;
  return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
}

function json(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function list(dir: string) {
  try {
    return fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
}

function makeKid(call: string, parentCall: string, kind: Kind, role: string, type: string, prompt: string, model: string, announced: boolean, id: string | null = null): Kid {
  return { call, parentCall, kind, role, type, prompt, model, id, announced, pos: 0, rest: '', open: [], bypass: new Map(), idle: false, reply: '', result: '', ended: false, endAt: 0, steps: 0 };
}

function subMeta(k: Kid) {
  return clean({
    agent: true,
    name: k.role || undefined,
    type: k.type || undefined,
    prompt: k.prompt || undefined,
    model: k.model && k.model !== 'inherit' ? k.model : undefined,
    bg: true,
  });
}

function announce(A: AgyState, k: Kid) {
  if (k.announced) return;
  k.announced = true;
  A.out?.({
    sessionUpdate: 'tool_call',
    toolCallId: k.call,
    kind: 'other',
    title: k.role || (k.kind === 'workflow' ? 'workflow agent' : 'worker'),
    status: 'in_progress',
    _meta: { ...(k.kind === 'workflow' ? { workflow: true } : {}), sub: subMeta(k) },
  });
}

function swarmNames(a: Record<string, unknown>) {
  const base = arg(a.name).trim();
  const tasks = Array.isArray(a.tasks) ? a.tasks.map((t) => arg(t).trim()) : [];
  const n = Number(arg(a.n) || a.n) || 0;
  const count = tasks.length || (n > 1 ? n : 0);
  if (count > 0) {
    const prefix = base || 'worker';
    return Array.from({ length: count }, (_, i) => ({ name: `${prefix}-${i + 1}`, task: tasks[i] || '' }));
  }
  return [{ name: base || 'worker', task: '' }];
}

function swarmTitle(action: string, a: Record<string, unknown>, names?: { name: string }[]) {
  if (action === 'add') {
    const workers = names || swarmNames(a);
    if (workers.length === 1) return workers[0].name;
    if (workers.length <= 3) return `Swarm: add ${workers.map((w) => w.name).join(', ')}`;
    return `Swarm: add ${workers.length} ${arg(a.name).trim() || 'worker'} workers`;
  }
  if (action === 'kill') {
    const target = arg(a.name).trim();
    return target ? `Swarm: kill ${target}` : 'Swarm: kill worker';
  }
  if (action === 'model') {
    const target = arg(a.name).trim(), model = arg(a.model).trim();
    if (target && model) return `Swarm: switch ${target} to ${model}`;
    if (model) return `Swarm: switch model to ${model}`;
    if (target) return `Swarm: switch ${target} model`;
    return 'Swarm: switch model';
  }
  if (action === 'status') return 'Swarm: check status';
  if (action === 'models') return 'Swarm: list models';
  if (action === 'title') {
    const t = arg(a.title).trim();
    return t ? `Swarm: ${t}` : 'Swarm: set title';
  }
  return action ? `Swarm: ${action}` : 'Swarm';
}

function workflowTitle(a: Record<string, unknown>) {
  const desc = arg(a.Description).trim();
  if (desc) return desc;
  const sp = arg(a.ScriptPath).trim();
  if (sp) return `Workflow: ${path.basename(native(sp))}`;
  return 'Workflow';
}

function currentSubIds(c: AgyChat) {
  const out = new Set<string>();
  if (!c.sessionId) return out;
  const dir = path.join(sys(c.sessionId), 'subagents');
  for (const n of list(dir)) {
    const cid = str(json(path.join(dir, n))?.conversationId);
    if (cid) out.add(cid);
  }
  return out;
}

function timerTitle(A: AgyState, t: Timer) {
  if (t.cron) return `Schedule: ${t.cron}`;
  const kid = [...A.kids.values()].find((k) => k.id && k.id === t.cond);
  const what = !t.cond ? '' : kid ? kid.role || 'its subagent' : t.cond === 'any' ? 'any subagent or command' : /\/task-\d+$/.test(t.cond) ? 'a background command' : 'a subagent';
  return what ? `Waiting up to ${span(t.secs)} for ${what}` : `Timer: ${span(t.secs)}`;
}

function idList(x: unknown): string[] {
  if (Array.isArray(x)) return x.map(str).filter(Boolean);
  const s = str(x);
  if (!s) return [];
  try {
    const p = JSON.parse(s);
    return Array.isArray(p) ? p.map(str).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function ownTitle(A: AgyState, name: string, a: Record<string, unknown>) {
  if (name === 'manage_subagents') {
    const act = arg(a.Action);
    if (act === 'kill_all') return 'Stopped all subagents';
    if (act === 'kill') {
      const roles = idList(a.ConversationIds).map((id) => [...A.kids.values()].find((k) => k.id === id)?.role).filter(Boolean);
      return roles.length === 1 ? `Stopped ${roles[0]}` : 'Stopped subagents';
    }
    return 'Checked its subagents';
  }
  if (name === 'manage_task') return 'Checked a background command';
  if (name === 'search_web') return `Searched the web: ${arg(a.query)}`;
  if (name === 'send_message') {
    const to = arg(a.Recipient), kid = [...A.kids.values()].find((k) => k.id && k.id === to);
    return kid ? `Sent a message to ${kid.role || 'its subagent'}` : 'Sent a message';
  }
  return '';
}

function map(c: AgyChat, u: U, out: Out) {
  if (!u?.toolCallId || !/^tool_call/.test(u.sessionUpdate || '')) return u;
  const A = of(c), name = str(u.name) || str(u.title).replace(/^Run /, ''), a = argsOf(u), id = u.toolCallId;
  A.out = out;
  if (name === 'invoke_subagent') {
    const role = arg(a.Role), type = arg(a.TypeName), model = arg(a.Model), prompt = arg(a.Prompt);
    if (!A.kids.has(id)) A.kids.set(id, makeKid(id, id, 'sub', role, type, prompt, model, true));
    watch(c);
    const k = A.kids.get(id)!;
    return { ...u, ...(role && GENERIC.test(str(u.title)) ? { title: role } : {}), _meta: { ...u._meta, sub: subMeta(k) } };
  }
  if (name === 'swarm') {
    const action = arg(a.action).trim();
    if (action === 'add') {
      const workers = swarmNames(a), brief = arg(a.brief).trim(), model = arg(a.model).trim();
      const single = workers.length === 1;
      const created: Kid[] = [];
      if (single) {
        const w = workers[0];
        const prompt = w.task ? (brief ? `${w.task}\n\n${brief}` : w.task) : brief;
        if (!A.kids.has(id)) A.kids.set(id, makeKid(id, id, 'swarm', w.name, 'swarm', prompt, model, true));
      } else {
        for (const w of workers) {
          const kidCall = `${id}:${w.name}`;
          if (!A.kids.has(kidCall)) {
            const prompt = w.task ? (brief ? `${w.task}\n\n${brief}` : w.task) : brief;
            const k = makeKid(kidCall, id, 'swarm', w.name, 'swarm', prompt, model, false);
            A.kids.set(kidCall, k);
            created.push(k);
          }
        }
        if (created.length) {
          queueMicrotask(() => {
            if (!c.ended) for (const k of created) announce(A, k);
          });
        }
      }
      if (u.status === 'failed') {
        const why = reason(textOf(u));
        for (const k of A.kids.values()) {
          if (k.parentCall !== id || k.ended) continue;
          if (!k.announced) announce(A, k);
          end(A, k, 'failed', why);
        }
      } else {
        watch(c);
      }
      const title = swarmTitle(action, a, workers);
      const titled = GENERIC.test(str(u.title)) || !u.title ? { title } : {};
      if (single) return { ...u, ...titled, _meta: { ...u._meta, sub: subMeta(A.kids.get(id)!) } };
      return { ...u, ...titled };
    }
    if (action === 'kill') {
      const target = arg(a.name).trim();
      if (target && u.status === 'completed') {
        for (const k of A.kids.values()) {
          if (k.kind === 'swarm' && !k.ended && k.role === target) {
            if (k.id) steps(c, A, k);
            end(A, k, 'stopped', k.result || k.reply);
          }
        }
      }
      const title = swarmTitle(action, a);
      return GENERIC.test(str(u.title)) || !u.title ? { ...u, title } : u;
    }
    if (action === 'model') {
      const target = arg(a.name).trim(), model = arg(a.model).trim();
      if (target && model && u.status === 'completed') {
        for (const k of A.kids.values()) {
          if (k.kind === 'swarm' && !k.ended && k.role === target) {
            k.model = model;
            A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: k.call, _meta: { sub: { agent: true, model } } });
          }
        }
      }
      const title = swarmTitle(action, a);
      return GENERIC.test(str(u.title)) || !u.title ? { ...u, title } : u;
    }
    const title = swarmTitle(action, a);
    return GENERIC.test(str(u.title)) || !u.title ? { ...u, title } : u;
  }
  if (name === 'run_workflow') {
    let wf = A.workflows.get(id);
    if (!wf) {
      wf = { call: id, title: workflowTitle(a), before: currentSubIds(c), ended: false, endAt: 0 };
      A.workflows.set(id, wf);
      watch(c);
    }
    if (u.status === 'failed') {
      wf.ended = true;
      wf.endAt = Date.now();
      const why = reason(textOf(u));
      for (const k of A.kids.values()) {
        if (k.parentCall === id && !k.ended) end(A, k, 'failed', k.result || k.reply || why);
      }
    } else if (u.status === 'completed' && !BG_FLOW.test(textOf(u))) {
      find(c, A);
      for (const k of A.kids.values()) {
        if (k.parentCall === id && k.id) steps(c, A, k);
      }
      wf.ended = true;
      wf.endAt = Date.now();
      for (const k of A.kids.values()) {
        if (k.parentCall === id && !k.ended) end(A, k, 'done', k.result || k.reply);
      }
    }
    const titled = GENERIC.test(str(u.title)) || !u.title ? { title: wf.title } : {};
    return { ...u, ...titled, _meta: { ...u._meta, workflow: true } };
  }
  if (name === 'schedule') {
    const secs = Number(arg(a.DurationSeconds) || a.DurationSeconds) || 0;
    const cron = arg(a.CronExpression).trim();
    const t = A.timers.get(id) || { cond: arg(a.TimerCondition), secs, cron };
    if (t.cond && ![...A.kids.values()].some((k) => k.id === t.cond)) find(c, A);
    if (u.status === 'completed' || u.status === 'failed') A.timers.delete(id);
    else A.timers.set(id, t);
    return { ...u, title: u.status === 'failed' ? (t.cron ? 'Schedule not set' : 'Timer not set') : timerTitle(A, t) };
  }
  if (name === 'manage_subagents') {
    const act = arg(a.Action);
    if ((act === 'kill' || act === 'kill_all') && [...A.kids.values()].some((k) => !k.id)) find(c, A);
    if (u.status === 'completed' && (act === 'kill' || act === 'kill_all')) {
      const ids = act === 'kill' ? new Set(idList(a.ConversationIds)) : null;
      for (const k of A.kids.values()) {
        if (k.ended) continue;
        if (act === 'kill_all' || (k.id && ids!.has(k.id))) {
          k.open.length = 0;
          k.bypass.clear();
          end(A, k, 'stopped', '');
        }
      }
    }
  }
  if (name === 'send_message') {
    const to = arg(a.Recipient);
    if (to && ![...A.kids.values()].some((k) => k.id === to)) find(c, A);
    const kid = [...A.kids.values()].find((k) => k.id && k.id === to);
    if (kid) {
      kid.endAt = Date.now();
      watch(c);
    }
  }
  if (u.status === 'completed' || u.status === 'failed') A.busy.delete(id);
  else if (u.sessionUpdate === 'tool_call') A.busy.add(id);
  const title = GENERIC.test(str(u.title)) || !u.title ? ownTitle(A, name, a) : '';
  return title ? { ...u, title } : u;
}

function watch(c: AgyChat) {
  const A = of(c);
  A.tick ||= setInterval(() => poll(c), EVERY);
}

function swarmRosterEntries(c: AgyChat) {
  const out: { name: string; cid: string }[] = [];
  if (!c.sessionId) return out;
  const dir = path.join(sys(c.sessionId), 'swarm');
  for (const n of list(dir)) {
    const rec = json(path.join(dir, n));
    if (!rec || typeof rec !== 'object') continue;
    if (str(rec.conversationId)) out.push({ name: str(rec.name) || str(rec.rosterName) || path.basename(n, '.json'), cid: str(rec.conversationId) });
    if (Array.isArray(rec.workers)) {
      for (const w of rec.workers) {
        if (str(w?.conversationId)) out.push({ name: str(w.name) || str(w.rosterName), cid: str(w.conversationId) });
      }
    }
    if (rec.roster && typeof rec.roster === 'object' && !Array.isArray(rec.roster)) {
      for (const [k, v] of Object.entries(rec.roster as Record<string, any>)) {
        const cid = typeof v === 'string' ? v : str(v?.conversationId);
        if (cid) out.push({ name: k, cid });
      }
    }
  }
  return out;
}

function find(c: AgyChat, A: AgyState) {
  if (!c.sessionId) return;
  const want = [...A.kids.values()].filter((k) => !k.id);
  const activeFlow = [...A.workflows.values()].some((w) => !w.ended);
  if (!want.length && !activeFlow) return;
  const taken = new Set([...A.kids.values()].map((k) => k.id).filter(Boolean) as string[]);
  const dir = path.join(sys(c.sessionId), 'subagents');
  const unclaimed: { cid: string; rec: U; call: string }[] = [];
  for (const n of list(dir)) {
    const rec = json(path.join(dir, n)), cid = str(rec?.conversationId);
    if (!cid || taken.has(cid)) continue;
    const call = callOf(cid);
    const desc = rec.subagentDescriptor || {};
    const recName = str(rec.name) || str(rec.rosterName) || str(desc.role) || str(desc.name);
    const kid =
      (call && want.find((k) => k.call === call)) ||
      (call && want.find((k) => k.parentCall === call && k.role && k.role === recName)) ||
      (call && want.find((k) => k.parentCall === call)) ||
      (!call && want.find((k) => k.kind === 'swarm' && k.role && k.role === recName)) ||
      (!call && want.find((k) => k.kind === 'sub' && k.role === str(desc.role) && k.type === str(desc.typeName)));
    if (kid) {
      kid.id = cid;
      taken.add(cid);
      want.splice(want.indexOf(kid), 1);
      retitle(A, cid);
    } else {
      unclaimed.push({ cid, rec, call });
    }
  }
  if (want.some((k) => k.kind === 'swarm')) {
    for (const entry of swarmRosterEntries(c)) {
      if (taken.has(entry.cid)) continue;
      const kid = want.find((k) => k.kind === 'swarm' && k.role === entry.name);
      if (!kid) continue;
      kid.id = entry.cid;
      taken.add(entry.cid);
      want.splice(want.indexOf(kid), 1);
      retitle(A, entry.cid);
    }
    for (const kid of [...want]) {
      if (kid.kind !== 'swarm' || !kid.role || taken.has(kid.role)) continue;
      if (fs.existsSync(path.join(sys(kid.role), 'logs', 'transcript.jsonl'))) {
        kid.id = kid.role;
        taken.add(kid.role);
        want.splice(want.indexOf(kid), 1);
        retitle(A, kid.role);
      }
    }
  }
  if (unclaimed.length && A.workflows.size) {
    for (const item of unclaimed) {
      if (taken.has(item.cid)) continue;
      const wf = (item.call && A.workflows.get(item.call)) || [...A.workflows.values()].find((w) => !w.ended && !w.before.has(item.cid));
      if (!wf) continue;
      const desc = item.rec.subagentDescriptor || {};
      const role = str(desc.role) || str(item.rec.role) || str(item.rec.name) || str(desc.name) || 'workflow agent';
      const type = str(desc.typeName) || str(item.rec.typeName) || 'workflow';
      const model = str(desc.model) || str(item.rec.model);
      const kid = makeKid(`${wf.call}:${item.cid}`, wf.call, 'workflow', role, type, '', model, false, item.cid);
      A.kids.set(kid.call, kid);
      taken.add(item.cid);
      announce(A, kid);
      retitle(A, item.cid);
    }
  }
}
function callOf(cid: string) {
  const dir = path.join(sys(cid), 'messages');
  for (const n of list(dir)) {
    const id = json(path.join(dir, n))?.sourceMetadata?.tool?.toolCall?.id;
    if (typeof id === 'string') return id;
  }
  return '';
}
function retitle(A: AgyState, cid: string) {
  for (const [id, t] of A.timers) if (t.cond === cid) A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: id, title: timerTitle(A, t) });
}

function lines(k: Kid) {
  const file = path.join(sys(k.id!), 'logs', 'transcript.jsonl');
  let fd: number | null = null;
  try {
    const size = fs.statSync(file).size;
    if (size <= k.pos) return [];
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - k.pos);
    fs.readSync(fd, buf, 0, buf.length, k.pos);
    k.pos = size;
    const all = (k.rest + buf.toString('utf8')).split('\n');
    k.rest = all.pop() || '';
    return all.filter((l) => l.trim()).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

const KINDS: Record<string, string> = { read_file: 'read', view_file: 'read', list_dir: 'read', run_command: 'execute', search_web: 'fetch', read_url_content: 'fetch', edit_file: 'edit', write_file: 'edit', replace_file_content: 'edit', grep_search: 'search', find_by_name: 'search' };
const PATH_KEYS = new Set(['Path', 'AbsolutePath', 'TargetFile', 'DirectoryPath']);
const pathOf = (a: Record<string, unknown>) => {
  const p = arg(a.Path) || arg(a.AbsolutePath) || arg(a.TargetFile) || arg(a.DirectoryPath);
  return p ? native(p) : '';
};
function stepTitle(name: string, a: Record<string, unknown>) {
  const sum = arg(a.toolSummary);
  if (sum) return sum;
  if (/^mcp_/.test(name)) return mcpTitle(name);
  const p = pathOf(a);
  if (p && /file|dir/.test(name)) return `${/^(read|view)/.test(name) ? 'Read' : /dir/.test(name) ? 'List' : 'Edit'} ${path.basename(p)}`;
  if (name === 'run_command') return arg(a.CommandLine) || 'Run a command';
  if (name === 'search_web') return `Searched the web: ${arg(a.query)}`;
  if (name === 'send_message') return 'Sent a message';
  const first = Object.values(a).map(arg).find((v) => v && v.length < 120);
  return first ? `${name} ${first}` : name;
}
function reason(content: string) {
  const s = content.replace(/\r\n/g, '\n').split('\n').filter((l) => !/^(Created|Completed) At:/.test(l)).join('\n').trim();
  return s.replace(/^Encountered error in step execution:\s*/, '');
}

function steps(c: AgyChat, A: AgyState, k: Kid) {
  const wfMeta = k.kind === 'workflow' ? { workflow: true } : {};
  for (const e of lines(k)) {
    if (e.source === 'SYSTEM') continue;
    if (e.type === 'PLANNER_RESPONSE') {
      const calls = Array.isArray(e.tool_calls) ? e.tool_calls : [];
      if (!calls.length) {
        k.idle = e.status === 'DONE';
        if (str(e.content).trim()) k.reply = str(e.content).trim();
        continue;
      }
      if (k.ended) again(A, k);
      k.idle = false;
      calls.forEach((t: U, i: number) => {
        const name = str(t.name), a = t.args || {}, id = `${k.call}-${e.step_index}-${i}`;
        k.open.push(id);
        k.steps++;
        if (name === 'run_command' && (a.BypassSandbox === true || arg(a.BypassSandbox) === 'true')) k.bypass.set(id, { at: Date.now(), warned: false });
        const kind = KINDS[name] || 'other';
        const p = pathOf(a), line = Number(arg(a.StartLine) || a.StartLine) || 0;
        const locations = p && (kind === 'read' || kind === 'edit' || /file|dir/.test(name)) ? [{ path: p, ...(line > 0 ? { line } : {}) }] : undefined;
        const rawInput: Record<string, unknown> = Object.fromEntries(Object.entries(a).map(([x, v]) => [x, PATH_KEYS.has(x) ? native(arg(v)) : arg(v)]));
        if (name === 'run_command') {
          if (rawInput.CommandLine && !rawInput.command) rawInput.command = rawInput.CommandLine;
          if (rawInput.toolSummary && !rawInput.description) rawInput.description = rawInput.toolSummary;
        }
        const title = name === 'send_message' && arg(a.Recipient) === c.sessionId ? 'Sent its report' : stepTitle(name, a);
        A.out?.({ sessionUpdate: 'tool_call', toolCallId: id, kind, title, status: 'in_progress', ...(locations ? { locations } : {}), rawInput, _meta: { ...wfMeta, sub: { parent: k.call } } });
      });
      continue;
    }
    const id = k.open.shift();
    if (!id) continue;
    k.bypass.delete(id);
    const bad = e.status === 'ERROR', body = reason(str(e.content));
    const note = bad && DENIED.test(body) && !A.told ? ((A.told = true), `\n\n${BLOCKED}`) : '';
    const outText = body + note;
    A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: id, status: bad ? 'failed' : 'completed', ...(outText ? { content: text(outText) } : {}), _meta: { ...wfMeta, sub: { parent: k.call } } });
  }
}
function again(A: AgyState, k: Kid) {
  k.ended = false;
  k.endAt = 0;
  A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: k.call, _meta: { ...(k.kind === 'workflow' ? { workflow: true } : {}), sub: { agent: true, again: true } } });
}

function replies(c: AgyChat, A: AgyState) {
  if (!c.sessionId) return;
  const dir = path.join(sys(c.sessionId), 'messages');
  for (const n of list(dir)) {
    if (A.msgs.has(n)) continue;
    const m = json(path.join(dir, n));
    if (!m) continue;
    const from = str(m.sender), body = str(m.content), title = str(m.renderDetails?.messageTitle);
    const k = [...A.kids.values()].find((x) => x.id && (x.id === from || (/^Error from /.test(title) && body.includes(x.id))));
    A.msgs.add(n);
    if (!k) continue;
    if (k.id === from) k.result = body.trim();
    else end(A, k, 'failed', body.trim());
  }
}
function end(A: AgyState, k: Kid, how: 'done' | 'failed' | 'stopped', result: string) {
  if (k.ended) return;
  k.ended = true;
  k.endAt = Date.now();
  k.bypass.clear();
  A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: k.call, _meta: { ...(k.kind === 'workflow' ? { workflow: true } : {}), sub: { agent: true, end: how, result } } });
}

function poll(c: AgyChat) {
  const A = of(c);
  if (c.ended) return stopAll(c);
  for (const k of A.kids.values()) if (!k.announced) announce(A, k);
  find(c, A);
  const now = Date.now();
  for (const k of A.kids.values()) {
    if (!k.id || (k.ended && now - k.endAt > KEEP)) continue;
    steps(c, A, k);
    if (!k.ended) {
      for (const [id, b] of k.bypass) {
        if (b.warned || now - b.at < STALL) continue;
        b.warned = true;
        A.out?.({ sessionUpdate: 'tool_call_update', toolCallId: id, content: text(STALLED), _meta: { sub: { parent: k.call } } });
      }
    }
  }
  replies(c, A);
  for (const k of A.kids.values()) if (k.id && !k.ended && k.idle && !k.open.length && (k.steps || k.reply)) end(A, k, 'done', k.result || k.reply);
  const alive = [...A.kids.values()].some((k) => !k.id || !k.ended || now - k.endAt <= KEEP) || [...A.workflows.values()].some((w) => !w.ended);
  if (!alive) {
    clearInterval(A.tick!);
    A.tick = null;
  }
}

function waiting(c: AgyChat) {
  const A = c.agy;
  if (!A) return '';
  const kid = [...A.kids.values()].find((k) => !k.ended);
  if (kid) return `waiting for ${kid.role || 'its subagent'}`;
  const wf = [...A.workflows.values()].find((w) => !w.ended);
  if (wf) return `waiting for ${wf.title}`;
  const t = A.timers.values().next().value;
  if (t) return timerTitle(A, t).replace(/^Waiting/, 'waiting').replace(/^Timer: (.*)$/, 'waiting $1').replace(/^Schedule: (.*)$/, 'scheduled $1');
  return A.busy.size ? 'working on its own' : '';
}

function cancel(c: AgyChat) {
  const A = c.agy;
  if (!A) return;
  for (const k of A.kids.values()) {
    k.open.length = 0;
    k.bypass.clear();
    if (!k.ended) end(A, k, 'stopped', '');
  }
  A.timers.clear();
  A.busy.clear();
}

function stopAll(c: AgyChat) {
  const A = c.agy;
  if (!A) return;
  clearInterval(A.tick!);
  A.tick = null;
  for (const k of A.kids.values()) {
    k.ended = true;
    k.bypass.clear();
  }
  for (const w of A.workflows.values()) w.ended = true;
  A.timers.clear();
  A.busy.clear();
}

export { map, poll, waiting, cancel, stopAll, span };
