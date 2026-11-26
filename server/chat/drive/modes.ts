import { HttpError } from '../../base/routes.ts';

const OFF = '"chats answer other chats\' permission asks" is off';
const ASKING: Record<string, string[]> = {
  claude: ['default'],
  codex: ['default', 'plan'],
  antigravity: ['plan'],
  cursor: ['agent', 'plan', 'ask'],
  copilot: ['default', 'plan'],
  grok: ['default'],
};
const PLANS: Record<string, string[]> = { claude: ['exit-plan-default'], cursor: ['accepted'] };
const FREE = new Set(['model', 'effort', 'reasoning_effort', 'thought_level', 'codex:model', 'codex:effort', 'fast', 'ultracode']);
const SAFE = ['compact', 'model', 'effort', 'fast'];

export function heldOption(agent: string, code: string, o: { id: string; name: string; category?: string; mode: boolean }, v: { value: string; name: string }) {
  if (o.mode || o.id === 'mode' || o.category === 'mode') {
    const ok = ASKING[agent] || [];
    if (!ok.includes(v.value)) throw new HttpError(403, `${code}: only the user puts it in ${v.name} mode, where it may work without asking (${OFF}). Open to you: ${ok.join(', ') || 'none'}.`);
  } else if (!FREE.has(o.id)) throw new HttpError(403, `${code}: only the user sets ${o.name} (${OFF}). Open to you: model, effort and the modes that ask.`);
}

export const planOpen = (agent: string, o: { optionId: string; kind?: string }) => /^reject/.test(o.kind || '') || !!PLANS[agent]?.includes(o.optionId);

export function heldText(text: string) {
  const word = /^\/([^\s/]+)(?=\s|$)/.exec(text.trim())?.[1];
  if (word && !SAFE.includes(word.toLowerCase())) throw new HttpError(403, `/${word}: only the user sends slash commands while ${OFF}. Open to you: ${SAFE.map((x) => '/' + x).join(', ')}.`);
}

export const asksIn = (agent: string, mode: string | null) => !!mode && (ASKING[agent] || []).includes(mode);
export const heldQids = new Set<string>();
