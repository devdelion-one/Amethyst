import type { AgentMore } from '../base/agentmenu.ts';
import { menuHead } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { esc } from '../base/util.ts';
import { orchChats } from '../app/chatlist.ts';
import type { Agent } from '../base/stream.ts';

export function openChatMenu(pid: string, here: (string | null)[], line: (a: Agent) => string, pick: (id: string) => unknown): AgentMore {
  const chats = orchChats(pid);
  const row = (a: Agent) => {
    const used = here.includes(a.id);
    return `<button class="mi" data-oc-pick="${esc(a.id)}"${used ? ' disabled' : ''}><i class="dk-mark">${gem('ai')}</i>${line(a)}<span class="d">${esc(used ? 'in use' : a.status || '')}</span></button>`;
  };
  return {
    label: 'open a chat',
    icon: gem('orch'),
    none: chats.length ? '' : 'Open a chat\nThere are no chats in this project yet.',
    rows: () => menuHead(gem('orch'), 'Orchestration') + `<div class="set-rows">${chats.map(row).join('')}</div>`,
    pick: (b) => b.dataset.ocPick && pick(b.dataset.ocPick),
  };
}
