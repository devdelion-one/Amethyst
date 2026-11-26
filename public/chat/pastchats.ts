import { icon } from '../base/icon.ts';
import { onOutside } from '../base/lift.ts';
import { api } from '../base/model.ts';
import { chatOfSession } from '../base/stream.ts';
import { chatProgram, esc, quietly, showErr } from '../base/util.ts';
import { litOnHover } from '../base/roving.ts';
import { when } from './shape.ts';

export type Past = { id: string; title?: string; updatedAt?: string; current?: boolean; snip?: string; i?: number };
export type Earlier = { session: string; program: string; title: string | undefined; pid: string };
type Tab = { id: string; type: string; chat?: string | null };
type HistoryCtx = { el: HTMLElement; tab: () => Tab; pid: () => string; input: { focus(): void }; blank: () => boolean; openBeside: (s: Earlier) => unknown; restart: (resume: string | null) => Promise<void>; retitle: (title: string) => void };

function marked(text: string, words: string[]) {
  if (!words.length) return esc(text);
  const re = new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  let out = '', i = 0;
  for (const m of text.matchAll(re)) {
    if (!m[0]) continue;
    out += esc(text.slice(i, m.index)) + `<mark>${esc(m[0])}</mark>`;
    i = m.index + m[0].length;
  }
  return out + esc(text.slice(i));
}
const pastChats = new Map<string, { chat: string; sessions: Past[] }>();

const opening = new Set();

export function pastChatsPopup({ el, tab, pid, input, blank, openBeside, restart, retitle }: HistoryCtx) {
  let hist: { shut: () => void } | null = null;
  function history(b: HTMLElement) {
    if (hist) return hist.shut();
    const chat = tab().chat;
    if (!chat) return;
    const key = pid(), lid = 'chh-' + tab().id;
    const p = document.createElement('div');
    p.className = 'ch-hist';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'earlier chats');
    p.innerHTML = `<div class="ch-hist-head">${icon('search')}<input type="text" placeholder="${tab().type === 'codex' || tab().type === 'cursor' ? 'Search chat titles' : 'Search chats: titles and what was said'}" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="${lid}" aria-label="search earlier chats"><span class="ch-hist-n"></span></div><ul class="ch-hist-list" id="${lid}" role="listbox"></ul>`;
    document.body.append(p);
    const q = p.querySelector('input')!, list = p.querySelector('ul')!, count = p.querySelector('.ch-hist-n')!;
    const cached = pastChats.get(key);
    let sessions: Past[] | null = !cached ? null : cached.chat === chat ? cached.sessions : cached.sessions.map(({ current, ...s }) => s);
    let found: { id: string; snip: string }[] | null = null, searching = false, rows: Past[] = [], at = 0, seq = 0, timer = 0;
    let kept = false;
    const words = () => [...new Set(q.value.toLowerCase().split(/\s+/).filter(Boolean))];

    function draw() {
      if (!el.isConnected && !kept) return shut();
      const ws = words();
      const byTitle = !sessions ? [] : sessions.filter((s) => ws.every((w) => (s.title || '').toLowerCase().includes(w)));
      const ids = new Map<any, any>((sessions || []).map((s, i) => [s.id, { ...s, i }]));
      const inTitle = new Set(byTitle.map((s) => s.id));
      const bySaid = ws.length && found ? found.filter((h) => ids.has(h.id) && !inTitle.has(h.id)).map((h) => ({ ...ids.get(h.id), snip: h.snip })).sort((x, y) => x.i - y.i) : [];
      const was = rows[at]?.id;
      rows = [...byTitle, ...bySaid];
      at = Math.max(0, rows.findIndex((s) => s.id === was));
      const row = (s: Past, i: number) =>
        `<li role="option" id="${lid}-${i}" data-i="${i}" data-id="${esc(s.id)}" class="${s.current ? 'now' : ''}${s.snip ? ' said' : ''}"><span class="t">${s.title ? marked(s.title, ws) : '<i>untitled chat</i>'}</span><span class="w">${s.current ? 'now' : s.updatedAt ? esc(when(Date.parse(s.updatedAt))) : ''}</span>${s.snip ? `<span class="s">${marked(s.snip, ws)}</span>` : ''}</li>`;
      const empty = (t: string) => `<li class="ch-hist-empty" role="presentation">${t}</li>`;
      list.innerHTML = !sessions
        ? empty('loading…')
        : !rows.length
          ? empty(!ws.length ? 'no earlier chats in this folder' : searching ? 'searching what was said…' : `nothing found for “${esc(q.value.trim())}”`)
          : byTitle.map(row).join('') + (bySaid.length ? `<li class="ch-hist-label" role="presentation">in what was said</li>` + bySaid.map((s: Past, j: number) => row(s, byTitle.length + j)).join('') : '');
      count.textContent = searching ? 'searching…' : sessions ? String(rows.length) : '';
      mark();
    }
    function mark() {
      const old = list.querySelector('.on');
      old?.classList.remove('on');
      old?.removeAttribute('aria-selected');
      const li = list.querySelector(`[data-i="${at}"]`);
      if (!li) return q.removeAttribute('aria-activedescendant');
      li.classList.add('on');
      li.setAttribute('aria-selected', 'true');
      q.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
    function place() {
      const r = b.getBoundingClientRect(), head = p.offsetHeight - list.offsetHeight;
      const below = innerHeight - r.bottom - 14, above = r.top - 14, up = below < 240 && above > below;
      list.style.height = Math.max(3, Math.min(12, Math.floor(((up ? above : below) - head) / 30))) * 30 + 'px';
      p.style.left = Math.max(8, Math.min(r.right - p.offsetWidth, innerWidth - p.offsetWidth - 8)) + 'px';
      p.style.top = (up ? r.top - 6 - p.offsetHeight : r.bottom + 6) + 'px';
    }
    function open(s: Past | undefined) {
      shut();
      if (!s || s.current) return input.focus();
      if (chatOfSession(s.id) || !blank()) return openBeside(earlier(s));
      restart(s.id).then(() => {
        if (!s.title) return;
        retitle(s.title);
      });
    }
    const earlier = (s: Past): Earlier => ({ session: s.id, program: chatProgram(tab().type), title: s.title, pid: pid() });
    async function beside(s: Past | undefined) {
      if (!s || s.current || opening.has(s.id)) return;
      opening.add(s.id);
      setTimeout(() => opening.delete(s.id), 5000);
      kept = true;
      const r = await openBeside(earlier(s));
      if (r === 'none') opening.delete(s.id);
      if (r === 'left') return shut();
      requestAnimationFrame(() => hist?.shut === shut && q.focus());
    }
    let off = () => {};
    function shut() {
      clearTimeout(timer);
      seq++;
      p.remove();
      hist = null;
      b.setAttribute('aria-expanded', 'false');
      off();
      removeEventListener('resize', shut);
    }
    hist = { shut };

    q.addEventListener('input', () => {
      clearTimeout(timer);
      const v = q.value.trim(), my = ++seq;
      found = null;
      searching = tab().type !== 'codex' && tab().type !== 'cursor' && v.length >= 2;
      rows = [];
      draw();
      if (!searching) return;
      timer = setTimeout(async () => {
        const id = tab().chat;
        const r = await quietly(api('GET', '/api/agent/sessions/search?q=' + encodeURIComponent(v) + (id ? '&id=' + encodeURIComponent(id) : ''), undefined, key), { hits: [] });
        if (my !== seq) return;
        found = r.hits;
        searching = false;
        draw();
      }, 250);
    });
    q.addEventListener('keydown', (e) => {
      const n = rows.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') n && (at = (at + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
      else if (e.key === 'PageDown' || e.key === 'PageUp') n && (at = Math.max(0, Math.min(n - 1, at + (e.key === 'PageDown' ? 10 : -10))));
      else if (e.key === 'Enter') return e.preventDefault(), e.stopPropagation(), open(rows[at]);
      else if (e.key === 'Escape') return e.preventDefault(), e.stopPropagation(), shut(), input.focus();
      else if (e.key === 'Tab') return shut();
      else return;
      e.preventDefault();
      e.stopPropagation();
      mark();
    });
    list.addEventListener('mousedown', (e) => (e.target as HTMLElement).closest('li') && e.preventDefault());
    litOnHover(list, 'i', () => at, (i) => ((at = i), mark()), false);
    list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      if (li) (e.ctrlKey || e.metaKey ? beside : open)(rows[+li.dataset.i!]);
    });
    list.addEventListener('auxclick', (e) => {
      const li = e.button === 1 && (e.target as HTMLElement).closest<HTMLElement>('li[data-i]');
      if (li) beside(rows[+li.dataset.i!]);
    });
    off = onOutside([p, b, '#modal'], shut);
    addEventListener('resize', shut);
    b.setAttribute('aria-expanded', 'true');
    draw();
    place();
    q.focus();
    api('GET', '/api/agent/sessions?id=' + encodeURIComponent(chat))
      .then((r) => {
        pastChats.set(key, { chat, sessions: r.sessions });
        if (hist?.shut !== shut) return;
        sessions = r.sessions;
        draw();
      })
      .catch((e) => {
        if (hist?.shut !== shut) return;
        shut();
        showErr(e);
      });
  }
  return { toggle: history, shut: () => hist?.shut() };
}
