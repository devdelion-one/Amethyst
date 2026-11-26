import { api, S } from './model.ts';
import { agents } from './stream.ts';
import { crystalOf } from './codes.ts';
import { esc, quietly } from './util.ts';

export type Tools = { chats: boolean; asks: boolean; path: boolean; debug: boolean };
let tools: Tools = { chats: true, asks: false, path: true, debug: true };
let asked = false;

export function toolsNow(): Tools {
  if (!asked) {
    asked = true;
    quietly(api('GET', '/api/settings').then((r) => r?.tools && (tools = r.tools)));
  }
  return tools;
}
export const setToolsNow = (t: Tools) => void (tools = t);

const STATUS: Record<string, string> = { starting: 'starting', working: 'working', asks: 'asks', done: 'done', idle: 'idle', ended: 'ended' };
export function chatsHere(self: string | null, word: string) {
  if (!toolsNow().chats) return [];
  const q = word.toLowerCase();
  return [...agents.all.values()]
    .filter((a) => a.kind === 'chat' && a.id !== self && (a.pid || '') === S.pid && a.status !== 'ended')
    .map((a) => ({ id: a.id, title: a.title || '', status: STATUS[a.status] || a.status, ...crystalOf(a.id) }))
    .map((c) => ({ c, at: !q ? 1 : c.code.toLowerCase().startsWith(q) ? 0 : c.title.toLowerCase().includes(q) ? 1 : -1 }))
    .filter((x) => x.at >= 0)
    .sort((x, y) => x.at - y.at)
    .map((x) => x.c);
}
export const looksLikeCode = (word: string) => /^[a-hj-np-z]\d{0,2}$/i.test(word);

export function fromTag(from: string) {
  if (from === 'cli' || from === 'amethyst') return `<span class="ch-from" title="${from === 'cli' ? 'From the terminal&#10;Sent with the amethyst command in a terminal.' : 'From Amethyst&#10;Sent by Amethyst itself: a chat this one drives finished or asks something.'}">from ${from === 'cli' ? 'the terminal' : 'Amethyst'}</span>`;
  const c = crystalOf(from), a = agents.all.get(from);
  return `<button type="button" class="ch-from" data-from-chat="${esc(from)}" style="--gem-c:${c.color}" title="${esc(`From ${c.code}\nSent by chat ${c.code}${a?.title ? `, “${a.title}”` : ''}. Click to go to it.`)}">from <b>${c.code}</b></button>`;
}
