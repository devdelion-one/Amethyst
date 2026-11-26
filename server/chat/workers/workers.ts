import * as live from '../../base/live.ts';
import * as agents from '../agents.ts';
import { HttpError } from '../../base/routes.ts';
import { codeOf, route } from '../drive/caller.ts';
import { answerOf } from '../drive/answer.ts';
import { sendTo, startChat, waitFor } from '../drive/track.ts';
import { mirror, stepId, view } from './mirror.ts';
import type { Live } from '../../base/live.ts';
import type { Chat } from '../agents.ts';
import type { Caller } from '../drive/caller.ts';
import type { View } from './mirror.ts';

interface Worker {
  id: string;
  parent: string;
  agent: string;
  v: View;
  asks: Map<string, string>;
}
interface Call {
  id: string;
  prompt: string;
  agent: string;
  bound: boolean;
  name?: string;
}

export const KINDS = ['claude', 'codex', 'antigravity', 'cursor', 'copilot', 'grok'];
const RUN = /(^|[_.:/\s])agent_run$/;
const WAIT_SECS = 86400;
export const secsOf = (v: unknown) => (Number(v) > 0 ? Math.min(WAIT_SECS, Math.max(5, Math.round(Number(v)))) : WAIT_SECS);

const workers = new Map<string, Worker>();
const calls = new Map<string, Map<string, Call>>();

const kindName = (agent: string) => String(agents.NAMES[agent] || agent).replace(/ Agent$/, '');
export const nameOf = (agent: string, id: string) => `${kindName(agent)} · ${codeOf(id)}`;
const textOf = (u: any) => (Array.isArray(u.content) ? u.content : []).map((c: any) => (c.type === 'content' && c.content?.type === 'text' ? c.content.text : '')).join('\n').replace(/^```\w*\n([\s\S]*?)\n?```\s*$/, '$1').trim();

function isRun(u: any) {
  const name = String(u._meta?.claudeCode?.toolName || u.title || '');
  if (RUN.test(name)) return true;
  const i = u.rawInput;
  return !!i && typeof i.prompt === 'string' && KINDS.includes(String(i.agent));
}

function mark(c: Chat, u: any) {
  if (!u || !/^tool_call/.test(u.sessionUpdate || '') || !u.toolCallId || u._meta?.sub) return u;
  if ((live.get(c.id) as Live | undefined)?.under) return u;
  let mine = calls.get(c.id);
  let call = mine?.get(u.toolCallId);
  if (!call) {
    if (u.sessionUpdate !== 'tool_call' || !isRun(u)) return u;
    if (!mine) calls.set(c.id, (mine = new Map()));
    mine.set(u.toolCallId, (call = { id: u.toolCallId, prompt: '', agent: '', bound: false }));
  }
  const i = u.rawInput || {};
  if (typeof i.prompt === 'string') call.prompt = i.prompt;
  if (typeof i.agent === 'string') call.agent = i.agent;
  const sub: Record<string, unknown> = { agent: true, name: call.name || (call.agent ? kindName(call.agent) : 'subagent'), type: call.agent || undefined, prompt: call.prompt || undefined, bg: i.background === true || undefined };
  if (!call.bound && (u.status === 'completed' || u.status === 'failed')) Object.assign(sub, { end: u.status === 'failed' ? 'failed' : 'done', result: textOf(u) });
  return { ...u, _meta: { ...u._meta, sub: Object.fromEntries(Object.entries(sub).filter(([, x]) => x !== undefined)) } };
}

function bind(parent: string, prompt: string) {
  const open = [...(calls.get(parent)?.values() || [])].filter((c) => !c.bound);
  const call = open.find((c) => c.prompt === prompt) || open[0];
  if (call) call.bound = true;
  return call || null;
}

function forward(w: Worker, ev: any) {
  const parent = agents.chatFor(w.parent, false);
  if (!parent) return;
  if (ev.type === 'ask') {
    const ask = `${w.id}:${ev.ask}`, name = nameOf(w.agent, w.id);
    w.asks.set(String(ev.ask), ask);
    const tc = ev.toolCall || {};
    const toolCall = { ...tc, ...(tc.toolCallId ? { toolCallId: stepId(w.v, tc.toolCallId) } : {}), title: `${name}: ${tc.title || 'asks'}`, ...(tc.rawInput ? { rawInput: { ...tc.rawInput, description: `${name}${tc.rawInput.description ? `: ${tc.rawInput.description}` : ''}` } } : {}) };
    const form = ev.form ? { ...ev.form, message: `${name}: ${ev.form.message || ''}` } : undefined;
    const { type: _t, ask: _a, at: _at, ...rest } = ev;
    agents.addAsk(parent, ask, { ...rest, toolCall, ...(form ? { form } : {}) }, (optionId, content) => {
      route('POST /api/agent/send')({ id: w.id, ask: ev.ask, optionId, content }, new URLSearchParams()).catch(() => {});
    });
    return;
  }
  if (ev.type === 'answered') {
    const ask = w.asks.get(String(ev.ask));
    w.asks.delete(String(ev.ask));
    if (ask) agents.dropAsk(parent, ask);
    return;
  }
  for (const u of mirror(w.v, ev)) agents.emitSub(parent, u);
  if (ev.type === 'turn' || ev.type === 'end') {
    const model = (live.get(w.id) as Live | undefined)?.model;
    if (model) agents.emitSub(parent, { sessionUpdate: 'tool_call_update', toolCallId: w.v.call, _meta: { sub: { agent: true, model } } });
    for (const ask of w.asks.values()) agents.dropAsk(parent, ask);
    w.asks.clear();
  }
  if (ev.type === 'end') workers.delete(w.id);
}

function seen(c: Chat, ev: any) {
  const w = workers.get(c.id);
  if (w) return forward(w, ev);
  if (ev.type === 'cancel') {
    for (const x of workers.values()) if (x.parent === c.id && x.v.running) route('POST /api/agent/send')({ id: x.id, cancel: true }, new URLSearchParams()).catch(() => {});
  } else if (ev.type === 'end') {
    calls.delete(c.id);
    for (const x of [...workers.values()]) if (x.parent === c.id) route('DELETE /api/agent')({}, new URLSearchParams({ id: x.id })).catch(() => {});
  }
}

export function init() {
  agents.onUpdate(mark);
  agents.onEvent(seen);
}

export function allowed(who: Caller) {
  if (!who) throw new HttpError(400, 'agent tools work from a chat: from the terminal, amethyst chat new starts any agent as a chat');
  if ((live.get(who.id) as Live | undefined)?.under) throw new HttpError(403, "a subagent can't start subagents");
  return who;
}

export function mine(who: NonNullable<Caller>, word: unknown) {
  const w0 = String(word ?? '').trim().replace(/^@/, '').toUpperCase();
  const w = [...workers.values()].find((x) => x.parent === who.id && (codeOf(x.id) === w0 || x.id === String(word)));
  if (!w) throw new HttpError(404, `no subagent ${word} of yours is running: amethyst agent run starts one`);
  return w;
}

type Run = { agent: string; prompt: string; model?: unknown; effort?: unknown; mode?: unknown; worktree?: boolean; background?: boolean; secs?: number; R: unknown; am: number; gone?: AbortSignal };

export async function run(who: NonNullable<Caller>, o: Run) {
  const agent = String(o.agent || 'claude').toLowerCase();
  if (!KINDS.includes(agent)) throw new HttpError(400, `agent: one of ${KINDS.join(', ')}`);
  const prompt = String(o.prompt ?? '').trim();
  if (!prompt) throw new HttpError(400, 'prompt: what the subagent should do');
  const parent = agents.chatFor(who.id, false);
  if (!parent) throw new HttpError(410, 'your chat has ended');
  const call = bind(who.id, prompt);
  const r = await startChat({ who, agent, root: who.root, pid: who.pid, R: o.R, am: who.am, by: who.id, worktree: o.worktree === true, model: o.model, effort: o.effort, mode: o.mode, under: who.id }).catch((e) => {
    if (call) call.bound = false;
    throw e;
  });
  const w: Worker = { id: r.id, parent: who.id, agent, v: view(r.id, call?.id || `w-${r.id}`), asks: new Map() };
  workers.set(r.id, w);
  const name = nameOf(agent, r.id), model = (live.get(r.id) as Live | undefined)?.model;
  if (call) call.name = name;
  const sub = { agent: true, name, type: agent, prompt, ...(model ? { model } : {}), ...(o.background ? { bg: true } : {}) };
  agents.emitSub(parent, call ? { sessionUpdate: 'tool_call_update', toolCallId: call.id, _meta: { sub } } : { sessionUpdate: 'tool_call', toolCallId: w.v.call, kind: 'other', title: name, status: 'in_progress', _meta: { sub } });
  const s = await sendTo({ who, a: live.get(r.id) as Live, text: prompt, base: who.root, worktree: o.worktree === true, by: who.id, tool: 'agent' }).catch((e) => {
    for (const u of mirror(w.v, { type: 'status', state: 'error', text: e.message })) agents.emitSub(parent, u);
    route('DELETE /api/agent')({}, new URLSearchParams({ id: r.id })).catch(() => {});
    throw e;
  });
  const notes = r.notes.length ? ` (${r.notes.join(' ')})` : '';
  if (o.background) return { agent: codeOf(r.id), id: r.id, qid: s.qid, status: 'working', text: `${name} started${notes}: it works in the background. amethyst agent wait ${codeOf(r.id)} gives its answer.` };
  return answer(who, w, s.qid, notes, o.secs, o.gone);
}

export async function answer(who: NonNullable<Caller>, w: Worker, qid: string | null, notes = '', secs = WAIT_SECS, gone?: AbortSignal) {
  const code = codeOf(w.id), name = nameOf(w.agent, w.id) + notes;
  const r = await waitFor({ who, by: who.id, ids: [w.id], qid, secs, asks: false, again: `amethyst agent wait ${code}`, gone });
  if (r.status === 'waiting') return { agent: code, id: w.id, status: 'working', text: `${name} is still working. amethyst agent wait ${code} gives its answer.` };
  const c = agents.chatFor(w.id, false);
  const a = c ? answerOf(c, (r.qid as string) || qid, false) : null;
  const said = a?.all || '';
  const status = r.status === 'done' ? 'done' : r.status;
  return { agent: code, id: w.id, status, text: status === 'done' ? `${name}:\n\n${said || '(no text in its answer)'}` : `${name} ${status}${said ? `:\n\n${said}` : '.'}` };
}

export async function send(who: NonNullable<Caller>, w: Worker, text: string, background: boolean, secs = WAIT_SECS, gone?: AbortSignal) {
  const s = await sendTo({ who, a: live.get(w.id) as Live, text, base: who.root, by: who.id, tool: 'agent' });
  if (background) return { agent: codeOf(w.id), qid: s.qid, status: 'working', text: `sent to ${codeOf(w.id)}: amethyst agent wait ${codeOf(w.id)} gives its answer.` };
  return answer(who, w, s.qid, '', secs, gone);
}

export async function stop(w: Worker) {
  await route('POST /api/agent/send')({ id: w.id, cancel: true }, new URLSearchParams());
  return { agent: codeOf(w.id), text: `stopped ${codeOf(w.id)}.` };
}

