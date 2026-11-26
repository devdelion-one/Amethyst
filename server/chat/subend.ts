import fs from 'fs';
import path from 'path';
import { transcriptsDir } from './transcripts.ts';
import { fileSteps, json, reportOf } from './subfile.ts';
import type { Tail } from './subfile.ts';
import type { AgentUpdate } from '../../public/base/types.ts';

type U = Record<string, any>;
type End = 'done' | 'stopped';
const EVERY = 1000;
const META = /^agent-[\w-]+\.meta\.json$/;

interface Bg {
  id: string;
  tail: Tail;
  meta: string | null;
}
interface Ends {
  open: Map<string, Bg>;
  timer: ReturnType<typeof setInterval> | null;
  out: ((us: AgentUpdate[]) => void) | null;
}
interface EndChat {
  subend?: Ends;
  cwd?: string;
  sessionId?: string | null;
  ended?: boolean;
}

const of = (c: EndChat): Ends => (c.subend ||= { open: new Map(), timer: null, out: null });
const dirOf = (c: EndChat, session = c.sessionId) => (c.cwd && session ? path.join(transcriptsDir(c.cwd), session, 'subagents') : null);
const fileOf = (meta: string) => meta.replace(/\.meta\.json$/, '.jsonl');
const mtime = (file: string) => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};
const stepMeta = (id: string) => () => ({ sub: { parent: id } });
const endUpdate = (id: string, end: End, result: string, endAt: number): AgentUpdate => ({ sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed', _meta: { sub: Object.fromEntries(Object.entries({ agent: true, end, result, endAt: endAt || undefined }).filter(([, v]) => v !== undefined && v !== '')) } });

function metasIn(dir: string | null) {
  if (!dir) return [];
  try {
    return fs.readdirSync(dir).filter((n) => META.test(n)).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}
function find(dirs: (string | null)[], ids: Set<string>) {
  const got = new Map<string, string>();
  for (const d of dirs) {
    for (const m of metasIn(d)) {
      const id = json(m)?.toolUseId;
      if (typeof id === 'string' && ids.has(id) && !got.has(id)) got.set(id, m);
    }
    if (got.size === ids.size) break;
  }
  return got;
}
function ended(meta: string): End | null {
  const m = json(meta);
  return m?.finished ? 'done' : m?.stoppedByUser ? 'stopped' : null;
}
function close(b: Bg, end: End): AgentUpdate {
  const file = b.meta ? fileOf(b.meta) : '';
  return endUpdate(b.id, end, end === 'done' && file ? reportOf(file) : '', b.meta ? Math.max(mtime(b.meta), mtime(file)) : 0);
}

function poll(c: EndChat) {
  const E = of(c);
  if (c.ended || !E.open.size) return halt(E);
  const want = new Set([...E.open.values()].filter((b) => !b.meta).map((b) => b.id));
  if (want.size) for (const [id, m] of find([dirOf(c)], want)) E.open.get(id)!.meta = m;
  const out: AgentUpdate[] = [];
  for (const b of [...E.open.values()]) {
    if (!b.meta) continue;
    out.push(...fileSteps(fileOf(b.meta), b.tail, stepMeta(b.id)));
    const end = ended(b.meta);
    if (!end) continue;
    out.push(...fileSteps(fileOf(b.meta), b.tail, stepMeta(b.id)), close(b, end));
    E.open.delete(b.id);
  }
  if (out.length) E.out?.(out);
  if (!E.open.size) halt(E);
}
function halt(E: Ends) {
  if (E.timer) clearInterval(E.timer);
  E.timer = null;
}
function watch(c: EndChat, id: string, out: (us: AgentUpdate[]) => void) {
  const E = of(c);
  E.out = out;
  if (E.open.has(id)) return;
  E.open.set(id, { id, tail: { at: 0, cwd: c.cwd || '' }, meta: null });
  E.timer ||= setInterval(() => poll(c), EVERY);
}
function stopAll(c: EndChat): AgentUpdate[] {
  const E = c.subend;
  if (!E) return [];
  halt(E);
  const out = [...E.open.values()].map((b) => close(b, b.meta ? ended(b.meta) || 'stopped' : 'stopped'));
  E.open.clear();
  return out;
}

function leftover(c: EndChat, events: U[], at = Date.now()) {
  const open = new Set<string>(), had = new Set<string>();
  for (const ev of events) {
    const u = ev?.type === 'update' ? ev.update : null, s = u?._meta?.sub;
    if (!s || !u.toolCallId) continue;
    if (s.parent) had.add(u.toolCallId);
    if (!s.agent || u._meta.workflow) continue;
    if (s.end) open.delete(u.toolCallId);
    else if (s.bg) open.add(u.toolCallId);
  }
  if (!open.size) return [];
  let sessions: string[] = [];
  try {
    sessions = fs.readdirSync(transcriptsDir(c.cwd || ''));
  } catch {}
  const metas = find([dirOf(c), ...sessions.filter((s) => s !== c.sessionId).map((s) => dirOf(c, s))], open);
  const out: U[] = [];
  for (const id of open) {
    const b: Bg = { id, tail: { at: 0, cwd: c.cwd || '' }, meta: metas.get(id) || null };
    const end = b.meta ? ended(b.meta) || 'stopped' : 'stopped', u = close(b, end), when = (u._meta as U).sub.endAt || at;
    if (b.meta) for (const s of fileSteps(fileOf(b.meta), b.tail, stepMeta(id))) if (!had.has(s.toolCallId!)) out.push({ type: 'update', update: s, at: when });
    out.push({ type: 'update', update: u, at: when });
  }
  return out;
}

export { watch, poll, stopAll, leftover };
