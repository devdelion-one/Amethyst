import { firstLine } from '../../base/util.ts';

export type View = { worker: string; call: string; prompts: number; text: string; gap: boolean; running: boolean };
type U = Record<string, any>;

export const view = (worker: string, call: string): View => ({ worker, call, prompts: 0, text: '', gap: false, running: true });
export const stepId = (v: View, id: unknown) => `${v.worker}:${String(id)}`;

const subOf = (v: View, sub: U): U => ({ sessionUpdate: 'tool_call_update', toolCallId: v.call, _meta: { sub: { agent: true, ...sub } } });

function ended(v: View, end: 'done' | 'failed' | 'stopped', result: string): U[] {
  if (!v.running) return [];
  v.running = false;
  return [subOf(v, { end, result })];
}

export function mirror(v: View, ev: U): U[] {
  const t = ev.type;
  if (t === 'you') {
    v.prompts++;
    v.text = '';
    v.gap = false;
    if (v.prompts === 1) return [];
    v.running = true;
    return [subOf(v, { again: true }), { sessionUpdate: 'tool_call', toolCallId: stepId(v, `you-${ev.qid}`), kind: 'other', title: `follow-up: ${firstLine(ev.text, 120)}`, status: 'completed', _meta: { sub: { parent: v.call } } }];
  }
  if (t === 'update') {
    const u = ev.update || {}, kind = u.sessionUpdate;
    if (kind === 'agent_message_chunk' && u.content?.type === 'text') {
      v.text += (v.gap && v.text ? '\n\n' : '') + u.content.text;
      v.gap = false;
      return [];
    }
    if (!/^tool_call/.test(kind || '') || !u.toolCallId) return [];
    v.gap = true;
    const { sub: _s, ...meta } = u._meta || {};
    return [{ ...u, toolCallId: stepId(v, u.toolCallId), _meta: { ...meta, sub: { parent: v.call } } }];
  }
  if (t === 'turn') {
    const r = ev.stopReason;
    if (r === 'cancelled') return ended(v, 'stopped', v.text.trim());
    if (r === 'error' || r === 'refusal') return ended(v, 'failed', [v.text.trim(), ev.text].filter(Boolean).join('\n\n') || 'it failed');
    return ended(v, 'done', v.text.trim());
  }
  if (t === 'status' && ev.state === 'error') return ended(v, 'failed', String(ev.text || 'it could not start'));
  if (t === 'end') return ended(v, 'stopped', v.text.trim() || String(ev.why || ''));
  return [];
}
