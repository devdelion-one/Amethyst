import { buttonMenu, ICONS } from '../base/controls.ts';
import { esc } from '../base/util.ts';
import { tell } from '../base/notify.ts';
import { openContext } from './context.ts';
import { tokens } from '../base/words.ts';
import { when } from './shape.ts';
import type { recentRows } from './recent.ts';
import type { stick } from './stick.ts';
import type { Line, Part } from './steps.ts';

type Compact = Omit<Line, 'after'> & { after?: number };
type Usage = { used: number; size: number; cost: { amount: number; currency: string } | null };
type RingCtx = {
  u0: HTMLElement;
  recent: ReturnType<typeof recentRows>;
  st: ReturnType<typeof stick>;
  line: (cls: string, html: string, into?: HTMLElement | null) => Line;
  timeline: () => Line;
  busy: () => boolean;
  partOff: (k: string) => boolean;
  onShut: (fn: () => void) => void;
  chat: () => string | null | undefined;
  agent: () => string;
};

type RingOwn = { chat: () => string | null | undefined; agent: () => string; hasCompact: () => boolean; showCompact: () => void };
const RINGS = new WeakMap<HTMLElement, RingOwn>();
const ONLY = 'only Claude chats can show what their context is made of';
function openRing(el: HTMLElement) {
  const r = RINGS.get(el), id = r?.chat();
  if (r?.agent() === 'claude' && id) openContext(el, id);
  else if (r) tell(el, { title: "Can't show this chat's context", line: ONLY });
}
buttonMenu('.ch-usage', {
  name: 'usage',
  icon: () => ICONS.usageRing,
  rows: (el) => {
    const r = RINGS.get(el), id = r?.chat();
    const ctx = r?.agent() !== 'claude' || !id ? `<button class="mi" disabled title="Show what the context is made of&#10;${ONLY.charAt(0).toUpperCase() + ONLY.slice(1)}."><i class="tb-ic">${ICONS.info}</i><span class="mi-n">show what the context is made of</span></button>` : `<button class="mi" data-bm="context" title="Show what the context is made of&#10;Opens a breakdown of what fills this chat's context."><i class="tb-ic">${ICONS.info}</i><span class="mi-n">show what the context is made of</span></button>`;
    const last = r?.hasCompact() ? `<button class="mi" data-bm="compact" title="Show the last compaction&#10;Scrolls to the last compaction in the chat and opens its summary."><i class="tb-ic">${ICONS.history}</i><span class="mi-n">show the last compaction</span></button>` : '';
    return ctx + last;
  },
  pick: (b, el) => {
    if (b.dataset.bm === 'compact') RINGS.get(el)?.showCompact();
    else openRing(el);
  },
});

const COMPACT = '<details><summary class="row"><span class="v"></span><span class="o"></span><span class="m"></span></summary><div class="more"></div></details>';
export function compactWords(st: string | null | undefined, before = 0, after = 0) {
  const run = !st || st === 'in_progress', done = st === 'completed';
  return {
    cls: `st compact${run ? ' s-run' : st === 'failed' ? ' s-fail' : ''}`,
    v: run ? 'Compacting…' : done ? 'Compacted' : 'Compact',
    o: run ? 'older messages are being summarized' : done ? 'older messages summarized' : st === 'failed' ? 'the chat could not be compacted' : 'stopped before it was done',
    m: run ? '…' : st === 'failed' ? 'failed' : !done ? 'stopped' : before ? `${tokens(before)} →${after ? ` <b>${tokens(after)}</b>` : ''}` : '',
  };
}
export function compactHtml(st: string, before: number, after: number) {
  const w = compactWords(st, before, after);
  return `<div class="${w.cls}">${COMPACT.replace('<span class="v"></span>', `<span class="v">${esc(w.v)}</span>`).replace('<span class="o"></span>', `<span class="o">${esc(w.o)}</span>`).replace('<span class="m"></span>', `<span class="m">${w.m}</span>`)}</div>`;
}
export const noticeInner = (sev: string, title: string, desc?: string) => `<div class="row"><span class="sev">${sev === 'info' ? 'notice' : sev}</span><span class="v">${esc(title)}</span>${desc ? `<span class="d">${esc(desc)}</span>` : ''}</div>`;
export const noticeHtml = (sev: string, title: string) => `<div class="st ch-notice n-${sev}">${noticeInner(sev, title)}</div>`;
export const usageInner = (text = '') => `<i class="ch-ring"></i><span class="ch-num">${esc(text)}</span>`;
export function createRing({ u0, recent, st, line, timeline, busy, partOff, onShut, chat, agent }: RingCtx) {
  RINGS.set(u0, { chat, agent, hasCompact: () => !!lastCompact && recent.has(lastCompact) && !lastCompact.hidden, showCompact });
  let usage: Usage | null = null;
  const compactions = new Map<string, Compact>();
  let lastCompact: Compact | null = null, shownUsed = 0, countRaf = 0, tintT = 0;
  function renderUsage() {
    const u = u0;
    cancelAnimationFrame(countRaf);
    u.hidden = !usage;
    if (!usage) return;
    const pct = usage.size ? Math.min(100, Math.round((usage.used / usage.size) * 100)) : 0;
    const cost = usage.cost ? `${usage.cost.currency === 'USD' ? '$' : usage.cost.currency + ' '}${usage.cost.amount.toFixed(2)}` : '';
    const lastShown = recent.has(lastCompact) && !lastCompact!.hidden;
    const more = u.classList.contains('compacting') ? 'compacting the chat…' : lastShown ? `compacted ${when(lastCompact!.at!)}, right-click to see its summary` : '';
    u.style.setProperty('--ch-p', pct as unknown as string);
    u.classList.toggle('full', pct >= 80);
    u.classList.toggle('has-compact', lastShown);
    const say = `This chat fills ${pct}% of what the model can hold at once.${agent() === 'claude' ? ' Click to see what fills it.' : ''}${cost ? ` It has cost ${cost} so far.` : ''}`;
    const tip = more ? more.replace(/^./, (c) => c.toUpperCase()) + (more.endsWith('…') ? '' : '.') : 'When it gets full, the agent compacts the chat into a summary and carries on.';
    u.title = `Context: ${tokens(usage.used)} of ${tokens(usage.size)}\n${say}\n\n${tip}`;
    u.innerHTML = usageInner();
    const num = u.lastElementChild!, put = (n: number) => (num.textContent = tokens(Math.round(n)) + (cost ? ` · ${cost}` : ''));
    const from = shownUsed, to = (shownUsed = usage.used);
    if (!u.classList.contains('compacted') || from === to) return void put(to);
    const t0 = performance.now(), ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      put(from + (to - from) * ease(k));
      if (k < 1) countRaf = requestAnimationFrame(step);
    };
    step(t0);
  }
  function showCompact() {
    const r = lastCompact;
    if (!r || !recent.has(r) || r.hidden) return;
    if (!r.isConnected) recent.all();
    r.querySelector('details')!.open = true;
    st.pin(false);
    r.scrollIntoView({ block: 'center', behavior: 'smooth' });
    r.classList.remove('flash');
    void r.offsetWidth;
    r.classList.add('flash');
  }
  u0.addEventListener('click', () => openRing(u0));

  function compactRow(u: any, at?: number) {
    let r = compactions.get(u.compactionId);
    if (!r) {
      r = line('st compact', COMPACT, timeline()) as unknown as Compact;
      Object.assign(r, { status: null, summary: '', before: usage?.used || 0 });
      r.hidden = partOff('compact');
      compactions.set(u.compactionId, r);
    }
    if (u.sessionUpdate === 'compaction_summary_chunk') r.summary += u.content?.type === 'text' ? u.content.text : '';
    else {
      const whole = (u.summary || []).filter((c: Part) => c.type === 'text').map((c: { text: string }) => c.text).join('');
      if (whole) r.summary = whole;
      if (u.error) r.error = u.error;
      if (u.status && u.status !== r.status) {
        r.status = u.status;
        if (r.status === 'completed') Object.assign(r, { at: at || Date.now(), waits: true }), (lastCompact = r);
        ringFor(r.status, at);
        renderUsage();
      }
    }
    drawCompact(r);
  }
  function drawCompact(r: Compact) {
    const w = compactWords(r.status, r.before, r.after);
    r.className = w.cls;
    const [v, o, m] = r.querySelectorAll('summary > span');
    v.textContent = w.v;
    o.textContent = w.o;
    m.innerHTML = w.m;
    r.querySelector('.more')!.textContent = r.status === 'failed' ? r.error || 'compaction failed' : r.summary!;
  }
  function ringFor(st: string | null | undefined, at = 0) {
    const u = u0;
    clearTimeout(tintT);
    u.classList.remove('compacting', 'compacted', 'compact-failed');
    if (!st || partOff('color')) return;
    if (st === 'in_progress') return void u.classList.add('compacting');
    const cls = ({ completed: 'compacted', failed: 'compact-failed' } as Record<string, string>)[st], left = 8000 - (Date.now() - (at || Date.now()));
    if (!cls || left <= 0) return;
    u.classList.add(cls);
    tintT = setTimeout(() => u.classList.remove(cls), left);
  }
  onShut(() => clearTimeout(tintT));
  function noticeRow(u: any) {
    const sev = u.severity === 'warning' || u.severity === 'error' ? u.severity : 'info';
    const r = busy()
      ? line(`st ch-notice n-${sev}`, noticeInner(sev, u.title || '', u.description), timeline())
      : line(`ch-note ch-notice${sev === 'warning' ? ' warn' : sev === 'error' ? ' err' : ''}`, `<b>${esc(u.title || '')}</b>${u.description ? ` · ${esc(u.description)}` : ''}`);
    r.hidden = partOff('notice');
  }
  function setUsage(u: any) {
    usage = { used: u.used, size: u.size, cost: u.cost || null };
    if (lastCompact?.waits && u.used) {
      Object.assign(lastCompact, { after: u.used, waits: false });
      drawCompact(lastCompact);
    }
  }
  function turnEnded() {
    for (const r of compactions.values()) if (r.status === 'in_progress') (r.status = 'cancelled'), drawCompact(r);
    u0.classList.remove('compacting');
  }
  function reset() {
  usage = null;
  compactions.clear();
  lastCompact = null;
  shownUsed = 0;
  ringFor(null);
  }
  return { render: renderUsage, compact: compactRow, notice: noticeRow, tint: ringFor, setUsage, turnEnded, reset, usage: () => usage };
}
