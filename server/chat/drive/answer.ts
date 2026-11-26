import { HttpError } from '../../base/routes.ts';
import { fieldsOf } from '../../../public/base/asks.ts';
import * as agents from '../agents.ts';
import { chatOf, codeOf, mayAnswer, quote, route } from './caller.ts';
import { heldOption, planOpen } from './modes.ts';
import type { Args, Caller } from './caller.ts';
import type { Live } from '../../base/live.ts';
import type { Chat } from '../agents.ts';

export function kindOf(c: Chat | undefined, k: any) {
  const req = c?.asks.get(k.id) ?? [...(c?.asks.entries() || [])].find(([id]) => String(id) === String(k.id))?.[1];
  if (k.form || req?.form) return 'form';
  if (req?.questions || req?.cursor === 'question') return 'question';
  if (req?.toolCall?.kind === 'switch_mode' || req?.cursor === 'plan') return 'plan';
  return 'permission';
}
export const permissionLike = (c: Chat | undefined, k: any) => kindOf(c, k) === 'permission';
export const optionsLine = (k: any) => (k.form ? fieldsOf(k.form.schema).filter((f) => !f.other).map((f) => `${f.key}${f.choices ? ` (${f.choices.map((c) => c.title ?? String(c.const)).join(' / ')})` : ''}`).join('; ') : (k.options || []).map((o: any, i: number) => `${i + 1}. ${o.name}`).join('  ')) || '(none)';
export function askOut(c: Chat | undefined, k: any) {
  if (k.form) return { ask: String(k.id), kind: 'form', message: k.form.message, fields: fieldsOf(k.form.schema).filter((f) => !f.other).map((f) => ({ key: f.key, title: f.title || '', about: f.description || '', many: f.many, choices: f.choices?.map((c) => c.title ?? String(c.const)) || null })) };
  return { ask: String(k.id), kind: kindOf(c, k), q: k.q, what: k.what, why: k.why || '', files: k.files || [], options: (k.options || []).map((o: any) => ({ id: o.optionId, name: o.name })) };
}

const configsOf = (c: Chat): any[] => ([...c.state.values()] as any[]).map((e) => e.configOptions || e.update?.configOptions).filter(Boolean).pop() || [];

export function optionsOf(c: Chat) {
  const evs = [...c.state.values()] as any[];
  const configs = configsOf(c);
  const modes = evs.map((e) => e.modes).filter(Boolean).pop();
  const modeNow = c.mode();
  const choice = (x: any) => ({ value: String(x.value ?? x.id), name: String(x.name ?? x.value ?? x.id), ...(x.description ? { description: String(x.description) } : {}) });
  const list: { id: string; name: string; category?: string; value: unknown; choices: { value: string; name: string; description?: string }[]; mode: boolean }[] = configs.map((o) => ({ id: String(o.id), name: String(o.name || o.id), ...(o.category ? { category: String(o.category) } : {}), value: o.currentValue, choices: (o.options || []).flatMap((x: any) => x.options || x).map(choice), mode: false }));
  if (c.agent === 'copilot' && c.copilotModel && !list.some((o) => o.id === 'model')) list.push({ id: 'model', name: 'Model', category: 'model', value: c.copilotModel, choices: [], mode: false });
  if (modes?.availableModes?.length && !list.some((o) => o.id === 'mode')) list.push({ id: 'mode', name: 'Mode', category: 'mode', value: modeNow ?? modes.currentModeId, choices: modes.availableModes.map(choice), mode: true });
  return list;
}

const pickFrom = <T extends { name: string }>(list: T[], word: string, key: (x: T) => string) => {
  const w = word.trim().toLowerCase();
  return list.find((x) => key(x).toLowerCase() === w) || list.find((x) => x.name.toLowerCase() === w) || list.find((x) => x.name.toLowerCase().startsWith(w));
};

export async function setOption(c: Chat, option: string, value: string, who: Caller) {
  if (c.woken) await c.woken.catch(() => {});
  const list = optionsOf(c), code = codeOf(c.id);
  const word = option.trim().toLowerCase();
  const alias = word === 'effort' ? (c.agent === 'copilot' || c.agent === 'grok' ? 'reasoning_effort' : c.agent === 'antigravity' ? 'thought_level' : option) : option;
  const o = pickFrom(list, alias, (x) => x.id);
  if (c.agent === 'copilot' && word === 'model' && (!o || (o.id === 'model' && !o.choices.length))) {
    await route('POST /api/agent/send')({ id: c.id, config: { id: 'model', value: value.trim() } }, new URLSearchParams());
    return { option: 'model', value: value.trim(), text: `${code}: Model is ${value.trim()}. Copilot lists no models, so it checks the name only at the first message.` };
  }
  if (!o) throw new HttpError(400, `${code} has no option ${option}: ${list.map((x) => x.id).join(', ') || 'none yet (it is still starting)'}`);
  const v = pickFrom(o.choices, value, (x) => x.value);
  if (!v) throw new HttpError(400, `${o.name} takes ${o.choices.map((x) => x.value).join(', ')}`);
  if (!mayAnswer(who)) heldOption(c.agent, code, o, v);
  await route('POST /api/agent/send')(o.mode ? { id: c.id, mode: v.value } : { id: c.id, config: { id: o.id, value: v.value } }, new URLSearchParams());
  const later = c.agent === 'copilot' && o.id === 'reasoning_effort' && configsOf(c).find((x: any) => x.id === 'reasoning_effort')?._meta?.amethyst;
  return { option: o.id, value: v.value, text: `${code}: ${o.name} is ${v.name}.${later ? ' Copilot starts again with it before the next message; the conversation stays.' : ''}` };
}

export function answerOf(c: Chat, qid: string | null, full: boolean) {
  const evs = c.events as any[];
  const i = qid ? evs.findIndex((e) => e.type === 'you' && e.qid === qid) : evs.findLastIndex((e) => e.type === 'you');
  if (qid && i < 0) {
    if (c.queue.some((m) => m.qid === qid)) return { status: 'queued', all: '' };
    throw new HttpError(404, `the message ${qid} isn't in ${codeOf(c.id)}'s chat`);
  }
  const end = evs.findIndex((e, j) => j > i && e.type === 'you');
  const part = evs.slice(i + 1, end < 0 ? evs.length : end);
  let text = '', gap = false;
  const tools = new Set<string>();
  for (const e of part) {
    const u = e.type === 'update' ? e.update : null;
    if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') {
      text += (gap && text ? '\n\n' : '') + u.content.text;
      gap = false;
    } else if (u?.sessionUpdate === 'tool_call' && !u._meta?.sub?.parent) {
      gap = true;
      if (full && u.toolCallId && !tools.has(u.toolCallId)) {
        tools.add(u.toolCallId);
        text += `${text && !text.endsWith('\n') ? '\n' : ''}· ${String(u.title || u.kind || 'a tool').split('\n')[0].slice(0, 200)}\n`;
        gap = false;
      }
    }
  }
  const turn = part.find((e) => e.type === 'turn');
  const status = turn ? (turn.stopReason === 'cancelled' ? 'stopped' : turn.stopReason === 'error' ? 'failed' : 'done') : part.some((e) => e.type === 'end') ? 'ended' : i < 0 ? 'none' : 'working';
  const failed = turn?.stopReason === 'error' && turn.text ? `\n\n[it failed: ${turn.text}]` : '';
  const from = i >= 0 ? evs[i].from : null;
  return { status, all: text.trim() + failed, qid: i >= 0 ? evs[i].qid : null, asked: i >= 0 ? evs[i].text : '', sentBy: !from ? 'the user' : from === 'cli' || from === 'amethyst' ? from : codeOf(from) };
}

function askerOf(c: Chat, askId: unknown) {
  const [id, ...rest] = String(askId).split(':');
  return (c.asks.get(askId)?.onAnswer && rest.length && agents.chatFor(id, false)?.agent) || c.agent;
}

export async function answerAsk(who: Caller, a: Live, o: { ask?: unknown; option?: unknown; answers?: unknown }) {
  const c = chatOf(a), code = codeOf(a.id);
  const ids = [...c.asks.keys()];
  if (!ids.length) throw new HttpError(409, `${code} asks nothing now`);
  const askId = o.ask != null && o.ask !== '' ? ids.find((k) => String(k) === String(o.ask)) : ids[0];
  if (askId === undefined) throw new HttpError(404, `${code} has no ask ${o.ask}: amethyst chat asks lists them`);
  const req = c.asks.get(askId), card = c.cards?.get(askId) || {};
  const word = String(o.option ?? '').trim(), cancel = /^(cancel|dismiss|skip)$/i.test(word);
  const out: Args = { id: a.id, ask: askId };
  if (req?.form || card.form) {
    const fields = fieldsOf(card.form?.schema || {}).filter((f) => !f.other);
    if (o.answers && typeof o.answers === 'object') {
      const content: Args = {};
      for (const [k, v] of Object.entries(o.answers as Args)) {
        const f = fields.find((x) => x.key === k || (x.title || '').toLowerCase() === k.toLowerCase());
        const key = f?.key || k, pick = (v1: unknown) => f?.choices?.find((ch) => String(ch.const) === String(v1) || String(ch.title ?? '').toLowerCase() === String(v1).toLowerCase())?.const ?? v1;
        content[key] = f?.many ? [v].flat().map(pick) : pick(v);
      }
      out.content = content;
    } else if (!cancel) {
      if (!word) throw new HttpError(400, `answer what? ${optionsLine(card)}`);
      const f = fields[0];
      if (!f) throw new HttpError(400, 'this form has no fields to answer');
      if (fields.length > 1 && !f.choices) throw new HttpError(400, `this form has ${fields.length} questions: give answers {${fields.map((x) => x.key).join(', ')}}`);
      const n = Number(word), ch = f.choices ? f.choices.find((x) => String(x.const).toLowerCase() === word.toLowerCase() || String(x.title ?? '').toLowerCase() === word.toLowerCase()) || (Number.isInteger(n) ? f.choices[n - 1] : undefined) : null;
      if (f.choices && !ch) throw new HttpError(400, `${f.title || f.key} takes ${f.choices.map((x) => x.title ?? String(x.const)).join(' / ')}`);
      out.content = { [f.key]: ch ? (f.many ? [ch.const] : ch.const) : word };
    }
  } else if (req?.questions || req?.cursor === 'question') {
    const qs: any[] = req.questions || [];
    if (o.answers && typeof o.answers === 'object') out.content = o.answers;
    else if (!cancel) {
      if (!word) throw new HttpError(400, 'answer what?');
      out.content = { [qs[0]?.id ?? 'answer']: word };
    }
  } else {
    const options: any[] = card.options || req?.options || [];
    const kind = kindOf(c, { ...card, id: askId }), held = !mayAnswer(who);
    if (kind === 'permission' && held) throw new HttpError(403, `${code} asks to ${card.q ? card.q.replace(/^(\w+) this\?$/, (_m: string, v: string) => v.toLowerCase()) : 'go on'} \`${quote(String(card.what || ''), 200)}\`: the user must answer it.`);
    if (!cancel) {
      const n = Number(word);
      const o = options.find((x) => String(x.optionId).toLowerCase() === word.toLowerCase() || String(x.name).toLowerCase() === word.toLowerCase()) || (Number.isInteger(n) && n >= 1 ? options[n - 1] : undefined) || options.find((x) => String(x.name).toLowerCase().startsWith(word.toLowerCase()) && word);
      if (!o && options.length) throw new HttpError(400, `${code}'s options: ${options.map((x, i) => `${i + 1}. ${x.name}`).join('  ')}`);
      out.optionId = o ? o.optionId : word || null;
      if (held && out.optionId) {
        const agent = askerOf(c, askId);
        if (!planOpen(agent, o || { optionId: out.optionId })) throw new HttpError(403, `${code}: only the user approves its plan that way, since it may then work without asking. Open to you: ${options.filter((x) => planOpen(agent, x)).map((x) => x.name).join(' / ') || 'cancel'}.`);
      }
    } else out.optionId = null;
  }
  await route('POST /api/agent/send')(out, new URLSearchParams());
  return { chat: code, text: cancel ? `dismissed ${code}'s ask.` : `answered ${code}.` };
}
