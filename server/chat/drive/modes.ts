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
const TURN_OFF = new Set(['always-approve', 'yolo', 'auto', 'auto-approve', 'auto-run', 'autorun', 'autopilot', 'allow-all', 'allow-all-tools', 'allow-all-paths', 'allow-all-urls', 'add-dir', 'run-everything', 'force', 'full-access', 'bypass', 'bypass-permissions', 'skip-permissions', 'dangerously-skip-permissions', 'permissions', 'permission-mode', 'approvals', 'approval-mode', 'mode', 'sandbox']);

export function heldOption(agent: string, code: string, o: { id: string; name: string; category?: string; mode: boolean }, v: { value: string; name: string }) {
  if (o.mode || o.id === 'mode' || o.category === 'mode') {
    const ok = ASKING[agent] || [];
    if (!ok.includes(v.value)) throw new HttpError(403, `${code}: only the user puts it in ${v.name} mode, where it may work without asking (${OFF}). Open to you: ${ok.join(', ') || 'none'}.`);
  } else if (!FREE.has(o.id)) throw new HttpError(403, `${code}: only the user sets ${o.name} (${OFF}). Open to you: model, effort and the modes that ask.`);
}

export const planOpen = (agent: string, o: { optionId: string; kind?: string }) => /^reject/.test(o.kind || '') || !!PLANS[agent]?.includes(o.optionId);

export function heldText(text: string) {
  const word = /^\/([\w:-]+)/.exec(text.trim())?.[1] || '';
  if (TURN_OFF.has(word.toLowerCase())) throw new HttpError(403, `/${word} may turn off asking for permission, so only the user sends it (${OFF}).`);
}
