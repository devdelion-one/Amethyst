import type { SubMeta } from '../../public/chat/subagents.ts';
import type { AgentUpdate } from '../../public/base/types.ts';
import { firstLine } from '../base/util.ts';

type U = Record<string, any>;
const LAUNCHED = /^Async agent launched/;
const CLAUDE_RAN = 'read from the files Claude Code keeps on this PC';
const CODEX_RAN = 'as Codex reported it';

const textOf = (u: U) => (Array.isArray(u.content) ? u.content : [])
  .map((c: any) => (c.type === 'content' && c.content?.type === 'text' ? c.content.text : ''))
  .join('\n')
  .replace(/^```\w*\n([\s\S]*?)\n?```\s*$/, '$1')
  .trim();
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)) as SubMeta;
const withSub = (u: U, sub: Record<string, unknown>) => ({ ...u, _meta: { ...u._meta, sub: clean(sub) } });
const str = (x: unknown) => (typeof x === 'string' ? x : undefined);

function claudeSub(u: U) {
  const cc = u?._meta?.claudeCode;
  if (!cc || u._meta.sub || !u.toolCallId || !/^tool_call/.test(u.sessionUpdate || '')) return u;
  if (cc.toolName === 'Agent') {
    const i = u.rawInput || {}, ran = str(u._meta.ranOn);
    const sub: Record<string, unknown> = { agent: true, name: str(i.description), title: u.title !== 'Task' ? str(u.title) : undefined, type: str(i.subagent_type), prompt: str(i.prompt), model: str(i.model), effort: str(i.effort), bg: !!i.run_in_background, ran, ranFrom: ran && CLAUDE_RAN };
    if (u.status === 'completed' || u.status === 'failed') {
      const text = textOf(u);
      if (LAUNCHED.test(text)) sub.bg = true;
      else Object.assign(sub, { end: u.status === 'failed' ? 'failed' : 'done', result: text });
    }
    return withSub(u, sub);
  }
  if (!cc.parentToolUseId) return u;
  if (cc.toolName !== 'SubagentHandback') return withSub(u, { parent: cc.parentToolUseId });
  return withSub(u, { parent: cc.parentToolUseId, handback: true, result: str(u.rawInput?.message), end: u.status === 'completed' ? 'done' : undefined });
}
const claudeRan = (id: string, ran: string): AgentUpdate => ({ sessionUpdate: 'tool_call_update', toolCallId: id, _meta: { sub: { agent: true, ran, ranFrom: CLAUDE_RAN } } });

interface Kid {
  id: string;
  name: string;
  turn: string | null;
  result: string;
  ended: boolean;
}
interface CodexSubs {
  kids: Map<string, Kid>;
}
const codexSubs = (): CodexSubs => ({ kids: new Map() });
const pathName = (p: unknown) => (String(p || '').split('/').filter(Boolean).pop() || '').replace(/_/g, ' ');
const ENDS: Record<string, 'done' | 'failed' | 'stopped'> = { completed: 'done', errored: 'failed', notFound: 'failed', interrupted: 'stopped', shutdown: 'stopped' };

function start(S: CodexSubs, thread: string, id: string, sub: Record<string, unknown>) {
  if (!thread || S.kids.has(thread)) return [];
  const name = String(sub.name || 'subagent');
  S.kids.set(thread, { id, name, turn: null, result: '', ended: false });
  return [{ sessionUpdate: 'tool_call', toolCallId: id, kind: 'other', title: name, status: 'in_progress', _meta: { sub: clean({ agent: true, ...sub, name }) } }];
}
function finish(k: Kid, end: 'done' | 'failed' | 'stopped', result = '') {
  if (k.ended) return [];
  k.ended = true;
  if (result) k.result = result;
  return [{ sessionUpdate: 'tool_call_update', toolCallId: k.id, status: end === 'failed' ? 'failed' : 'completed', _meta: { sub: clean({ agent: true, end, result: k.result }) } }];
}
function codexMainItem(S: CodexSubs, item: any): U[] | null {
  if (item?.type === 'subAgentActivity') {
    if (item.kind === 'started') return start(S, item.agentThreadId, item.id, { name: pathName(item.agentPath), model: str(item.model), ran: str(item.model), ranFrom: item.model ? CODEX_RAN : undefined, effort: str(item.reasoningEffort) });
    const k = S.kids.get(item.agentThreadId);
    if (!k) return [];
    return item.kind === 'completed' ? finish(k, 'done') : item.kind === 'interrupted' ? finish(k, 'stopped') : [];
  }
  if (item?.type !== 'collabAgentToolCall') return null;
  const out: U[] = [], ids: string[] = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [];
  if (item.tool === 'spawnAgent') for (const rid of ids) out.push(...start(S, rid, ids.length > 1 ? `${item.id}:${rid}` : item.id, { name: firstLine(item.prompt, 80), prompt: str(item.prompt), model: str(item.model), effort: str(item.reasoningEffort) }));
  for (const [rid, st] of Object.entries(item.agentsStates || {}) as [string, any][]) {
    const k = S.kids.get(rid), end = ENDS[st?.status];
    if (k && end) out.push(...finish(k, end, str(st.message)));
  }
  return out;
}
function codexKid(S: CodexSubs, m: { method?: string; params?: any }, tool: (item: any, status: string) => U | null): U[] {
  const p = m.params || {}, k = S.kids.get(p.threadId);
  if (!k) return [];
  if (m.method === 'turn/started') return void (k.turn = p.turn?.id || null), [];
  if (m.method === 'turn/completed') {
    const t = p.turn || {}, said = [...(t.items || [])].reverse().find((x: any) => x.type === 'agentMessage' && x.text)?.text;
    k.turn = null;
    if (said) k.result = said;
    return t.status === 'failed' ? finish(k, 'failed', t.error?.message || '') : t.status === 'interrupted' ? finish(k, 'stopped') : finish(k, 'done');
  }
  if (m.method === 'item/completed' && p.item?.type === 'agentMessage') return void (p.item.text && (k.result = p.item.text)), [];
  if (m.method !== 'item/started' && m.method !== 'item/completed') return [];
  const u = tool(p.item, m.method === 'item/started' ? 'inProgress' : p.item?.status);
  return u ? [withSub({ sessionUpdate: m.method === 'item/started' ? 'tool_call' : 'tool_call_update', ...u }, { parent: k.id })] : [];
}
const kidOf = (S: CodexSubs | undefined, thread: unknown) => (S && typeof thread === 'string' ? S.kids.get(thread) || null : null);
const kidTurns = (S: CodexSubs | undefined) => [...(S?.kids || new Map<string, Kid>()).entries()].filter(([, k]) => k.turn && !k.ended).map(([threadId, k]) => ({ threadId, turnId: k.turn! }));
const behind = (S: CodexSubs | undefined) => [...(S?.kids.values() || [])].filter((k) => !k.ended).map((k) => ({ sessionUpdate: 'tool_call_update', toolCallId: k.id, _meta: { sub: { agent: true, bg: true } } }));
const leftover = (S: CodexSubs) => [...S.kids.values()].flatMap((k) => finish(k, 'stopped'));

export { claudeSub, claudeRan, codexSubs, codexMainItem, codexKid, kidOf, kidTurns, behind, leftover, withSub };
export type { CodexSubs, Kid };
