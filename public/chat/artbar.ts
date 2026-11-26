import { icon } from '../base/icon.ts';
import { esc } from '../base/util.ts';
import type { Artifact } from '../base/types.ts';

const artifactTip = (a: Artifact) => {
  const sum = (a.summary || '').trim();
  const body = sum ? `${sum}${/[.!?]$/.test(sum) ? '' : '.'}\nClick to open it.` : `${a.kind === 'image' ? 'Generated image artifact.' : 'User-facing artifact.'}\nClick to open it.`;
  return `${a.name}\n${body}`;
};
export function artifactsInner(list: Artifact[], open: boolean) {
  const proceed = list.some((a) => a.requestFeedback) ? `<button type="button" class="ca-proceed" data-art="proceed" title="Proceed&#10;Sends Proceed to the chat so the agent continues with the reviewed artifacts.">Proceed</button>` : '';
  const chips = list.map((a) => `<button type="button" class="ca-chip${a.requestFeedback ? ' fb' : ''}" data-chopen="${esc(a.path)}" title="${esc(artifactTip(a))}">${icon(a.kind === 'image' ? 'image' : 'file')}<span class="ca-nm">${esc(a.name)}</span></button>`).join('');
  return `<div class="ca-head"><button type="button" class="ca-tg" data-art="toggle" aria-expanded="${open}">${icon('chev', 'chev')}<span>artifacts</span><span class="ca-n">${list.length}</span></button>${proceed}</div><div class="ca-chips">${chips}</div>`;
}
