import { ICONS } from '../base/controls.ts';
import { crystalOf } from '../base/codes.ts';
import { gem } from '../base/kinds.ts';
import { tell } from '../base/notify.ts';
import { esc } from '../base/util.ts';

export type Ask = { ask: string; kind: string; q?: string; what?: string; why?: string; message?: string; options?: { id: string; name: string }[]; fields?: { key: string; title: string; choices: string[] | null }[] };
export type Got = { id: string; chat: string; title: string; agent?: string; status: string; am: number; pid: string; wid?: string; report: boolean; text: string; asked: string; asks: Ask[] };
export type Why = 'done' | 'error' | 'asks';
export type NoticeHooks = { close(): void; go(): void };

const WORD: Record<Why, string> = { done: 'is ready', error: 'failed', asks: 'asks you' };
const ARROW = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/></svg>';
const askLine = (k: Ask) => (k.kind === 'form' ? k.message || '' : [k.q, k.what].filter(Boolean).join(' '));
const fence = (t: string) => (/^\s*`{3}/.test(t) ? '' : t);
const plain = (t: string) => t.replace(/```[^\n]*\n?([\s\S]*?)```/g, ' $1 ').replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '').replace(/[`*_#>|]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
const bellTip = (code: string, on: boolean) => (on ? `Notices from ${code}: on\nYou get notices like this one from ${code}. Click to stop them.` : `Notices from ${code}: off\nNo notices come from ${code}. Click to turn them on again.`);

async function call(method: string, url: string, g: Got, body?: unknown) {
  const r = await fetch(url, { method, headers: { 'x-mind-workspace': g.wid || '', 'x-mind-project': g.pid, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }).catch(() => {
    throw new Error('Amethyst is not answering');
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

export function noticeCard(g: Got, why: Why, line: string, hooks: NoticeHooks): HTMLElement {
  const k = g.asks[0];
  if (k) why = 'asks';
  const peek = why === 'asks' ? (k ? askLine(k) : '') || fence(line) : why === 'error' ? fence(line) || 'something went wrong' : plain(g.text) || fence(line) || 'finished';
  const ended = g.status === 'ended';
  let on = g.report;
  const el = document.createElement('div');
  el.className = 'nc';
  el.dataset.why = why;
  el.dataset.chat = g.id;
  el.tabIndex = 0;
  el.style.setProperty('--gem-c', crystalOf(g.id).color);
  el.innerHTML = `<div class="nc-band"><i class="nc-mk">${gem('ai')}</i><b class="nc-code">${esc(g.chat)}</b><span class="nc-title" title="${esc(g.title)}" data-tip-cut>${esc(g.title || 'a chat')}</span><span class="nc-st">${WORD[why]}</span><button type="button" class="nc-x" data-nc-x title="Close&#10;Closes this notice." data-tip-keys="=esc:close" aria-label="close">${ICONS.wx}</button></div>`
    + `<p class="nc-peek"><span>${esc(peek)}</span></p>`
    + `<div class="nc-foot">${ended ? '' : `<button type="button" class="nc-bell" data-nc-bell aria-label="notices from ${esc(g.chat)}">${ICONS.bell}<svg class="ic nc-off" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5l11 11"/></svg></button>`}<button type="button" class="primary nc-go" data-nc-go title="Go to&#10;Opens the chat in Amethyst." data-tip-keys="=enter:go to the chat"><span>go to</span>${ARROW}</button></div>`;

  const bell = el.querySelector<HTMLButtonElement>('[data-nc-bell]');
  const paint = () => {
    if (!bell) return;
    bell.classList.toggle('on', on);
    bell.setAttribute('aria-pressed', String(on));
    bell.title = bellTip(g.chat, on);
  };
  paint();
  let seq = 0;
  async function flip() {
    const want = !on, n = ++seq;
    on = want;
    paint();
    try {
      const r = await call('POST', '/api/chats/report', g, { chat: g.id, on: want });
      if (n === seq) on = !!r.report;
    } catch (e) {
      if (n === seq) on = !want;
      tell(bell, { title: 'not changed', line: (e as Error).message, ms: 2500 });
    }
    if (n === seq) paint();
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-nc-go], [data-nc-x], [data-nc-bell]');
    if (!b) return;
    const d = b.dataset;
    if ('ncX' in d) return hooks.close();
    if ('ncGo' in d) return hooks.go();
    flip();
  });
  el.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      return hooks.close();
    }
    if (e.key === 'Enter' && e.target === el) {
      e.preventDefault();
      hooks.go();
    }
  });
  return el;
}
