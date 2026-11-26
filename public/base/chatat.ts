import { agents } from './stream.ts';

let lastChat: HTMLElement | null = null;

export const shownEl = (el: Element | null | undefined): el is HTMLElement => !!el && (el as HTMLElement).isConnected && (el as HTMLElement).offsetWidth > 0;
const isChat = (id: string | null | undefined) => !!id && agents.all.get(id)?.kind === 'chat';

export function chatHere(): string | null {
  const f = document.activeElement as HTMLElement | null;
  if (f && f !== document.body) {
    const v = f.closest<HTMLElement>('.chat[data-chat]');
    if (v) return v.dataset.chat || null;
    const r = f.closest<HTMLElement>('[data-oc], [data-dk-agent]');
    if (r) return isChat(r.dataset.oc || r.dataset.dkAgent) ? r.dataset.oc || r.dataset.dkAgent! : null;
    const cell = f.closest('.dk-cell')?.querySelector<HTMLElement>('.chat[data-chat]');
    if (cell) return cell.dataset.chat || null;
    const oc = f.closest('.oc')?.querySelector<HTMLElement>('.oc-chat .chat[data-chat]');
    return oc?.dataset.chat || null;
  }
  if (shownEl(lastChat) && lastChat.dataset.chat) return lastChat.dataset.chat;
  const oc = [...document.querySelectorAll<HTMLElement>('.oc .oc-chat .chat[data-chat]')].find(shownEl);
  if (oc) return oc.dataset.chat || null;
  const cell = [...document.querySelectorAll<HTMLElement>('.dk-cell.sel .chat[data-chat]')].find(shownEl);
  return cell?.dataset.chat || null;
}

export const chatViewOf = (id: string) => [...document.querySelectorAll<HTMLElement>('.chat[data-chat]')].find((x) => x.dataset.chat === id && shownEl(x));

document.addEventListener('pointerdown', (e) => {
  const v = (e.target as Element | null)?.closest?.<HTMLElement>('.chat[data-chat]');
  if (v) lastChat = v;
}, true);
