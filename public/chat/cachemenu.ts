import { cacheShows, cacheWords } from '../base/agentrow.ts';
import { icon } from '../base/icon.ts';
import { esc } from '../base/util.ts';
import type { AgentInfo as Agent } from '../base/types.ts';

export function paintCacheRow(menu: HTMLElement, a: Agent | null | undefined) {
  menu.querySelectorAll(':scope > [data-ch="cache"]').forEach((r) => r.remove());
  if (!cacheShows(a)) return;
  const w = cacheWords(a);
  menu.querySelector(':scope > [data-ch="clear"]')?.insertAdjacentHTML('afterend', `<button type="button" role="menuitem" data-ch="cache" title="${esc(`${w.label.charAt(0).toUpperCase()}${w.label.slice(1)}\n${w.tip}`)}">${icon('history')}${esc(w.label)}</button>`);
}
