import fs from 'fs';
import path from 'path';
import { transcriptsDir } from './transcripts.ts';
import { WIN } from '../base/util.ts';
import { fileSteps, json, linesFrom, sizeOf, toolInfo } from './subfile.ts';
import type { AgentUpdate } from '../../public/base/types.ts';

type U = Record<string, any>;
type End = 'done' | 'failed' | 'stopped';
const EVERY = 1000;
const RAN = 'read from the files Claude Code keeps on this PC';
const DIR = /^Transcript dir:[ \t]*(.+?)[ \t]*$/m;
const TASK = /Task ID:[ \t]*(\S+)/;
const GENERIC = 'workflow-subagent';
const ENDS: Record<string, End> = { failed: 'failed', error: 'failed', errored: 'failed' };

interface Kid {
  id: string;
  file: string;
  meta: string;
  at: number;
  typed: boolean;
  ended: boolean;
  cwd: string;
}
interface Run {
  call: string;
  dir: string;
  task: string;
  at: number;
  kids: Map<string, Kid>;
}
interface Flows {
  before: Map<string, Map<string, number>>;
  runs: Run[];
  seen: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
  out: ((us: AgentUpdate[]) => void) | null;
}
interface FlowChat {
  workflows?: Flows;
  cwd?: string;
  sessionId?: string | null;
  ended?: boolean;
}

const of = (c: FlowChat): Flows => (c.workflows ||= { before: new Map(), runs: [], seen: new Set(), timer: null, out: null });
const keyOf = (p: string) => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const flowsDir = (c: FlowChat) => (c.cwd && c.sessionId ? path.join(transcriptsDir(c.cwd), c.sessionId, 'subagents', 'workflows') : null);
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false));
const textOf = (u: U) => (Array.isArray(u.content) ? u.content : []).map((c: any) => (c?.type === 'content' && c.content?.type === 'text' ? c.content.text : '')).join('\n');
const resultText = (r: unknown) => (typeof r === 'string' ? r : r == null ? '' : JSON.stringify(r, null, 2));

function typeOf(k: Kid): Record<string, unknown> | null {
  if (k.typed) return null;
  const m = json(k.meta);
  if (!m) return null;
  k.typed = true;
  const ran = str(m.pickedEffortModel) || (/^claude-/.test(m.model || '') ? m.model : undefined);
  return { type: m.agentType !== GENERIC ? str(m.agentType) : undefined, model: str(m.model), ran, ranFrom: ran && RAN };
}
function begin(r: Run, j: U): AgentUpdate[] {
  const k: Kid = { id: `${r.call}:${j.agentId}`, file: path.join(r.dir, `agent-${j.agentId}.jsonl`), meta: path.join(r.dir, `agent-${j.agentId}.meta.json`), at: 0, typed: false, ended: false, cwd: '' };
  r.kids.set(j.agentId, k);
  const name = str(j.label) || 'workflow agent';
  return [{ sessionUpdate: 'tool_call', toolCallId: k.id, kind: 'other', title: name, status: 'in_progress', _meta: { workflow: true, sub: clean({ agent: true, name, bg: true, ...typeOf(k) }) } }];
}
const steps = (k: Kid): AgentUpdate[] => fileSteps(k.file, k, () => ({ workflow: true, sub: { parent: k.id } }));
const endUpdate = (id: string, how: End, result = ''): AgentUpdate => ({ sessionUpdate: 'tool_call_update', toolCallId: id, status: how === 'failed' ? 'failed' : 'completed', _meta: { workflow: true, sub: clean({ agent: true, end: how, result }) } });
function finish(k: Kid, how: End, result = ''): AgentUpdate[] {
  if (k.ended) return [];
  k.ended = true;
  return [endUpdate(k.id, how, result)];
}
function drop(F: Flows, r: Run, how: End) {
  F.runs.splice(F.runs.indexOf(r), 1);
  return [...r.kids.values()].flatMap((k) => finish(k, how));
}
function over(r: Run): End | null {
  if (!r.task) return null;
  const j = json(path.join(path.dirname(path.dirname(path.dirname(r.dir))), 'workflows', path.basename(r.dir) + '.json'));
  return j && j.taskId === r.task ? ENDS[j.status] || 'stopped' : null;
}
function step(F: Flows, r: Run): AgentUpdate[] {
  const out: AgentUpdate[] = [], { got, at } = linesFrom(path.join(r.dir, 'journal.jsonl'), r.at);
  r.at = at;
  for (const j of got) {
    if (typeof j?.agentId !== 'string') continue;
    const k = r.kids.get(j.agentId);
    if (j.type === 'started' && !k) out.push(...begin(r, j));
    else if (j.type === 'result' && k && !k.ended) out.push(...steps(k), ...finish(k, 'done', resultText(j.result)));
  }
  for (const k of r.kids.values()) {
    if (k.ended) continue;
    const t = typeOf(k);
    if (t) out.push({ sessionUpdate: 'tool_call_update', toolCallId: k.id, _meta: { workflow: true, sub: clean({ agent: true, ...t }) } });
    out.push(...steps(k));
  }
  const how = over(r);
  if (how) out.push(...drop(F, r, how));
  return out;
}

function poll(c: FlowChat) {
  const F = of(c);
  if (c.ended) return void halt(F);
  const out = [...F.runs].flatMap((r) => step(F, r));
  if (!F.runs.length) halt(F);
  if (out.length) F.out?.(out);
}
function halt(F: Flows) {
  if (F.timer) clearInterval(F.timer);
  F.timer = null;
}
function snapshot(c: FlowChat) {
  const m = new Map<string, number>(), d = flowsDir(c);
  if (!d) return m;
  let names: string[] = [];
  try {
    names = fs.readdirSync(d);
  } catch {}
  for (const n of names) m.set(keyOf(path.join(d, n)), sizeOf(path.join(d, n, 'journal.jsonl')));
  return m;
}
function see(c: FlowChat, u: U, out: (us: AgentUpdate[]) => void) {
  const F = of(c), id = u?.toolCallId;
  if (!id || F.seen.has(id)) return;
  F.out = out;
  if (u.status === 'failed') return void (F.before.delete(id), F.seen.add(id));
  if (u.status !== 'completed') return void (F.before.has(id) || F.before.set(id, snapshot(c)));
  const before = F.before.get(id), text = textOf(u), dir = text.match(DIR)?.[1];
  F.before.delete(id);
  F.seen.add(id);
  if (!dir) return;
  const key = keyOf(dir), ups = F.runs.filter((r) => keyOf(r.dir) === key).flatMap((r) => drop(F, r, 'stopped'));
  F.runs.push({ call: id, dir, task: text.match(TASK)?.[1] || '', at: before?.get(key) ?? 0, kids: new Map() });
  if (ups.length) out(ups);
  F.timer ||= setInterval(() => poll(c), EVERY);
}
function stopAll(c: FlowChat): AgentUpdate[] {
  const F = c.workflows;
  if (!F) return [];
  halt(F);
  F.before.clear();
  return [...F.runs].flatMap((r) => drop(F, r, 'stopped'));
}
function leftover(events: U[], at = Date.now()) {
  const open = new Set<string>();
  for (const ev of events) {
    const u = ev?.type === 'update' ? ev.update : null;
    if (!u?._meta?.workflow || !u._meta.sub?.agent) continue;
    if (u._meta.sub.end) open.delete(u.toolCallId);
    else open.add(u.toolCallId);
  }
  return [...open].map((id) => ({ type: 'update', update: endUpdate(id, 'stopped'), at }));
}

export { see, poll, stopAll, leftover, toolInfo };
