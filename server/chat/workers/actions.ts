import type { Act } from '../../base/acts.ts';

const AGENT = { name: 'agent', type: 'string', pos: true, required: true, about: 'The subagent: the code amethyst agent run gave it (like S71)' } as const;

export const ACTIONS: Act[] = [
  {
    name: 'agent run',
    tool: 'agent_run',
    about: "Start a subagent of any kind (claude, codex, antigravity, cursor, copilot or grok) on a task and get its answer. It runs as its own agent in this project's folder; the user sees it as a subagent of this chat, with its steps. Returns its answer under a first line naming it by its code (like \"Codex · H57:\"), the code amethyst agent send takes; with background, its code at once. A mode that may work without asking is the user's to pick: a chat can't start one in it unless the user allowed chats to answer permission asks.",
    args: [
      { name: 'agent', type: 'string', pos: true, required: true, about: 'claude, codex, antigravity, cursor, copilot or grok' },
      { name: 'prompt', type: 'string', pos: true, rest: true, required: true, about: 'The task, as you would give it to a person who knows nothing of this chat' },
      { name: 'model', type: 'string', about: 'A model it offers, e.g. opus, sonnet or gpt-5' },
      { name: 'effort', type: 'string', about: 'An effort it offers, e.g. low, medium or high' },
      { name: 'mode', type: 'string', about: 'A mode it offers that asks, e.g. default or plan' },
      { name: 'worktree', type: 'boolean', about: 'Work in its own git worktree' },
      { name: 'background', type: 'boolean', about: 'Return at once; you are told when it finishes, and amethyst agent wait gives its answer' },
      { name: 'timeout', type: 'number', about: 'Seconds to wait at most; without it, it waits until it is done' },
    ],
    route: 'POST /api/agents/run',
  },
  {
    name: 'agent send',
    tool: 'agent_send',
    about: 'Send one of your subagents a follow-up; it keeps what it did before. Returns its answer, or with background at once.',
    args: [AGENT, { name: 'text', type: 'string', pos: true, rest: true, required: true, about: 'The follow-up' }, { name: 'background', type: 'boolean', about: 'Return at once; amethyst agent wait gives its answer' }, { name: 'timeout', type: 'number', about: 'Seconds to wait at most; without it, it waits until it is done' }],
    route: 'POST /api/agents/send',
  },
  {
    name: 'agent wait',
    tool: 'agent_wait',
    about: 'Wait until one of these subagents finishes, and get its answer. With a timeout, when it runs out it says which still work.',
    args: [{ name: 'agents', type: 'list', pos: true, required: true, about: 'Their codes' }, { name: 'timeout', type: 'number', about: 'Seconds to wait at most; without it, it waits until it is done' }],
    route: 'POST /api/agents/wait',
  },
  {
    name: 'agent stop',
    tool: 'agent_stop',
    about: 'Stop what one of your subagents is doing. It keeps what it did; amethyst agent send gives it more.',
    args: [AGENT],
    route: 'POST /api/agents/stop',
  },
];
