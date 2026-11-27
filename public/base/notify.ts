import { raise } from './lift.ts';
import { pref } from './prefs.ts';
import { AM, esc, pointerNow, setSave, store } from './util.ts';

let stack: HTMLElement | null = null;
export const noticeInner = (html: string, pct: number | null = null) => `<span class="nt">${html}</span>${pct == null ? '' : `<i class="nbar" style="--p:${pct}"></i>`}`;
export function notify(html: string, { ms = 6000, pct = null }: { ms?: number; pct?: number | null } = {}): HTMLDivElement & { close?: () => void } {
  stack ||= document.getElementById('notices') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'notices' }));
  const n = document.createElement('div') as HTMLDivElement & { close?: () => void };
  n.className = 'notice float';
  n.setAttribute('role', 'status');
  n.innerHTML = noticeInner(html, pct);
  const close = () => {
    n.classList.add('out');
    setTimeout(() => n.remove(), 200);
  };
  let t = ms > 0 ? setTimeout(close, ms) : 0;
  n.onmouseenter = () => clearTimeout(t);
  n.onmouseleave = () => ms > 0 && (t = setTimeout(close, ms / 2));
  n.onclick = (e) => !(e.target as Element).closest('button, input, label, a, select, textarea') && !getSelection()!.toString() && close();
  n.close = close;
  stack.insertBefore(n, stack.querySelector(':scope > #save-state'));
  return n;
}

export const tellInner = (title = '', line = '') => `<div><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path class="no" d="M8 2.5a5.5 5.5 0 1 1 0 11a5.5 5.5 0 1 1 0-11M4.1 11.9l7.8-7.8"/><path class="yes" d="M3.5 8.5l3 3l6-6.5"/></svg><b>${esc(title)}</b><span>${esc(line)}</span></div>`;
let card: HTMLDivElement | null = null, hideAt: ReturnType<typeof setTimeout> | 0 = 0;
export function tell(over: EventTarget | null | undefined, { title = '', line = '', ms = 300, ok = false }: { title?: string; line?: string; ms?: number; ok?: boolean } = {}) {
  if (!card) {
    card = Object.assign(document.createElement('div'), { id: 'tell' });
    card.setAttribute('role', 'status');
    card.innerHTML = tellInner();
    document.body.append(card);
    for (const ev of ['dragend', 'drop']) document.addEventListener(ev, () => tell(null), true);
  }
  clearTimeout(hideAt);
  if (!over || !pref('tell:on')) return void card.classList.remove('on');
  card.querySelector('b')!.textContent = title;
  card.querySelector('span')!.textContent = line;
  card.classList.toggle('ok', ok);
  raise(card);
  const [px, py] = (pointerNow.at || []) as number[], el = over as Element;
  const r = el.isConnected && el.getClientRects?.().length ? el.getBoundingClientRect() : new DOMRect(px ?? innerWidth / 2, py ?? innerHeight / 2), w = card.offsetWidth, h = card.offsetHeight;
  const at = pointerNow.at && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
  const x = at ? px + 12 : r.left + r.width / 2 - w / 2, y = at ? py + 18 : r.top + Math.min(r.height / 2, 24);
  const top = y + h > innerHeight - 8 ? (at ? py - h - 10 : innerHeight - h - 8) : y;
  Object.assign(card.style, { left: Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px', top: Math.max(8, top) + 'px' });
  card.classList.add('on');
  hideAt = setTimeout(() => card!.classList.remove('on'), Math.min(ms, Math.max(1500, 600 + 40 * (title.length + line.length))));
}
export function refuse(over: EventTarget | null | undefined, { title, line = '' }: { title: string; line?: string }) {
  if (over && pref('tell:on')) return tell(over, { title, line, ms: 2500 });
  setSave(line ? `${title}: ${line}` : title, true);
}
export const offTell =(over: EventTarget | null | undefined, name: string) => tell(over, { title: `${name} is turned off`, line: 'Turn it on in Settings, Agents and chat, Providers and tools, Agents you can start.', ms: 2500 });

export interface Limit {
  agent: string;
  key: string;
  name: string;
  pct: number;
  resets: number;
  at: number;
}
const KINDS: Record<string, { key: string; name: string }> = { five_hour: { key: 'session', name: 'session' }, seven_day: { key: 'week', name: 'weekly' } };
const KNOWN = 'limits.known' + (AM > 1 ? ':' + AM : '');
const known: Record<string, Limit> = structuredClone(store.get(KNOWN, {}));
let claudeAcct: string | null = store.get(KNOWN + ':acct', null);
let watcher: (() => void) | null = null;
export const allLimits = (): Limit[] => Object.values(known);
export const watchLimits = (fn: () => void) => (watcher = fn);

const limit = (agent: string, key: string, name: string, pct: number, resets: number, at = Date.now()): Limit => ({ agent, key, name, pct, resets, at });
function setLimit(...a: Parameters<typeof limit>) {
  const l = limit(...a);
  known[l.agent + ':' + l.key] = l;
}
function limitsChanged() {
  store.set(KNOWN, known);
  watcher?.();
}

export function limitUpdate(info: any, at = Date.now()) {
  if (info?.account && claudeAcct && info.account !== claudeAcct) return;
  const windows = { ...info?.unifiedWindows };
  if (info?.status === 'rejected' || info?.utilization != null) windows[info.rateLimitType] = info;
  let changed = false;
  for (const [type, w] of Object.entries<any>(windows)) {
    const kind = KINDS[type], rejected = w?.status === 'rejected';
    if (!kind || (!rejected && w?.utilization == null) || known['claude:' + kind.key]?.at > at) continue;
    const pct = rejected ? 100 : Math.min(100, Math.round(w.utilization * 100));
    setLimit('claude', kind.key, kind.name, pct, w.resetsAt ? (w.resetsAt < 1e12 ? w.resetsAt * 1000 : w.resetsAt) : 0, at);
    changed = true;
  }
  if (changed) limitsChanged();
}

export const limitsOf = (agent: string, list: { mins: number; label?: string; pct: number; resets?: number }[]): Limit[] => list.map((l) => {
  const span = l.mins === 300 ? 'session' : l.mins === 10080 ? 'week' : `${l.mins}m`;
  const name = l.mins === 300 ? 'session' : l.mins === 10080 ? 'weekly' : l.mins >= 40000 ? 'monthly' : `${Math.round(l.mins / 60)}-hour`;
  const pre = l.label ? l.label + ' ' : '';
  return limit(agent, pre + span, pre + name, Math.min(100, Math.round(l.pct)), l.resets ? l.resets * 1000 : 0);
});
export function limitsRead(agent: string, list: { mins: number; label?: string; pct: number; resets?: number }[], account?: string | null) {
  if (account !== undefined && account !== claudeAcct) store.set(KNOWN + ':acct', (claudeAcct = account));
  for (const id of Object.keys(known)) if (known[id].agent === agent) delete known[id];
  for (const l of limitsOf(agent, list)) known[agent + ':' + l.key] = l;
  limitsChanged();
}
