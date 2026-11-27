import { icon } from '../base/icon.ts';
import { page } from '../base/page.ts';
import { esc, OUT_MAX } from '../base/util.ts';
import { tell } from '../base/notify.ts';
import { onPref, pref, setPref } from '../base/prefs.ts';
import { every } from '../base/life.ts';
import { runTime } from '../base/words.ts';
import { chipsOf, nameOf as subName } from './subagents.ts';
import type { cmdRuns, subagents } from './subagents.ts';
import type { stick } from './stick.ts';
import type { Sizes } from '../base/measure.ts';
import { cmdsWin, ioBox } from './steps.ts';
import type { Line, Step } from './steps.ts';

type LanesCtx = {
  el: HTMLElement;
  bar: HTMLElement;
  form: HTMLElement;
  log: HTMLElement;
  flow: HTMLElement;
  st: ReturnType<typeof stick>;
  line: (cls: string, html: string, into?: HTMLElement | null) => Line;
  timeline: () => Line;
  tools: Map<string, Step>;
  toolRow: (u: any, host?: HTMLElement | null) => void;
  fits: () => Sizes;
  state: (s: string, cls?: string) => void;
  busy: () => boolean;
  ended: () => boolean;
  working: () => Line | null;
  subs: ReturnType<typeof subagents>;
  runs: () => ReturnType<typeof cmdRuns>;
  chat: () => string | null | undefined;
  openSub: ((id: string, keep: boolean) => unknown) | null;
  onShut: (fn: () => void) => void;
};

export const subsChat = () => pref('subagents:on') && pref('subagents:chat');
const openTip = () => (pref('subagents:open') === 'win' ? "Subagent\nClick to open its chat in this chat's Agent activity window.\n\nRight-click to open it here, in the chat, from now on." : 'Subagent\nClick to open its chat here.\n\nRight-click to open it in a window of its own from now on.');

export function createLanes({ el, bar, form, log, flow, st, line, timeline, tools, toolRow, fits, state, busy, ended, working, subs, runs, chat, openSub, onShut }: LanesCtx) {
  const lanes = new Map<string, Line>();
  el.classList.toggle('sa-open', subsChat());
  let laneTick: (() => void) | null = null;
  function lane(s: any) {
    let el = lanes.get(s.id);
    if (!el) {
      const at = callRow(s.id);
      el = line('st sa', `<div class="row"><span class="v">Agent</span><span class="o"></span><span class="m"></span><i class="sa-ic"></i></div><div class="sa-now"><span class="nv"></span><span class="no"></span><span class="sa-chips"></span></div><div class="sa-body"></div><div class="sa-res"></div>`, at ? at.parentElement : timeline());
      el.dataset.sa = s.id;
      el.unfolded = new Set();
      el.body = el.querySelector<HTMLElement>('.sa-body')!;
      el.res = el.querySelector<HTMLElement>('.sa-res')!;
      lanes.set(s.id, el);
      laneMode(el);
      if (at) at.after(el), lastUnder.set(s.id.slice(0, s.id.indexOf(':')), el);
    }
    const shut = el.classList.contains('shut');
    el.className = `st sa s-${s.status === 'running' ? 'run' : s.status === 'done' ? 'done' : 'fail'}${shut ? ' shut' : ''}`;
    el.querySelector('.o')!.textContent = subName(s);
    el.querySelector('.m')!.textContent = subTime(s);
    const t = s.steps.length && tools.get(s.steps.at(-1).id);
    const [nv, no] = s.status === 'running' ? t?.words || ['', 'starting…'] : [s.status === 'done' ? 'result' : s.status, s.result.split('\n').find((l: string) => /\w/.test(l))?.trim() || ''];
    el.querySelector('.nv')!.textContent = nv;
    el.querySelector('.no')!.textContent = no;
    el.querySelector('.sa-chips')!.innerHTML = chipsHtml(s);
    if (s.result && el.res!.dataset.of !== s.result) {
      el.res!.dataset.of = s.result;
      el.res!.querySelectorAll('.ch-io pre').forEach((p) => fits().unobserve(p));
      el.res!.innerHTML = ioBox('RESULT', esc(s.result.slice(0, OUT_MAX)));
      fits().observe(el.res!.querySelector('pre')!);
    }
    if (seeing?.id === s.id) seeDraw();
    if (wantSub === s.id) {
      wantSub = null;
      queueMicrotask(() => showSub(s.id));
    }
    return el;
  }
  const lastUnder = new Map<string, Line>();
  function callRow(id: string) {
    const call = id.includes(':') ? id.slice(0, id.indexOf(':')) : '', at = call ? lastUnder.get(call) || tools.get(call)?.row : null;
    return at?.isConnected && at.parentElement ? at : null;
  }
  const chipsHtml = (s: any) => chipsOf(s).map((c: string) => `<span class="${c === 'background' ? 'bg' : ''}">${esc(c)}</span>`).join('');
  const subTime = (s: any) => (s.status === 'failed' || s.status === 'stopped' ? s.status : runTime(Math.max(0, Math.round(((s.end || Date.now()) - s.start) / 1000))));
  function laneMode(el: Line) {
    const side = sideOn(), open = side || subsChat();
    el.querySelector('.sa-ic')!.innerHTML = open ? icon(side ? 'subSide' : pref('subagents:open') === 'win' ? 'subWin' : 'subHere') : '';
    el.querySelector<HTMLElement>('.row')!.title = el.querySelector<HTMLElement>('.sa-now')!.title = !side && open ? openTip() : '';
  }
  const sideOn = () => !!openSub && pref('subagents:on');
  function foldLane(el: Line) {
    if (!getSelection()!.isCollapsed) return;
    el.classList.toggle('shut');
    laneMode(el);
    st.pin(false);
    if (el.classList.contains('shut')) log.scrollTop += Math.min(0, el.getBoundingClientRect().top - log.getBoundingClientRect().top);
    st.settle();
    if (st.atEnd()) st.pin(true);
  }
  const openLane = (id: string) => (pref('subagents:open') === 'win' ? page.activity?.(chat(), id) : showSub(id));
  function relane() {
    el.classList.toggle('sa-open', subsChat() || sideOn());
    lanes.forEach(laneMode);
    if (seeing && (!subsChat() || sideOn())) hideSub();
    subsBtn();
  }
  for (const k of ['subagents:on', 'subagents:chat', 'subagents:open']) onShut(onPref(k, relane));
  function subsBtn() {
    const b = bar.querySelector<HTMLElement>('.ch-subs')!, sa = subsChat() && subs.all.size, cm = cmdsWin() && runs().all.size;
    b.hidden = !sa && !cm;
    b.classList.toggle('live', subs.running() > 0 || (!!cm && runs().running() > 0));
    b.lastElementChild!.textContent = (sa || '') as string;
    b.title = `Agent activity\nThis chat's ${sa && cm ? 'subagents and commands' : cm ? 'commands' : 'subagents'}, in a window of its own.`;
  }
  function runUpdate(u: any, at?: number) {
    const r = runs().feed(u, at || Date.now());
    if (!r) return;
    const key = `${r.status} ${r.bg}`, first = !r.seen;
    if (r.seen === key) return;
    r.seen = key;
    if (r.bg) lanesRun();
    else if (first || r.status !== 'running') subsBtn();
  }
  function lanesRun() {
    const n = subs.running(), c = runs().behind();
    working()?.show?.();
    subsBtn();
    if (n && !laneTick) laneTick = every(1000, () => subs.all.forEach((s) => s.status === 'running' && lanes.has(s.id) && (lanes.get(s.id)!.querySelector('.m')!.textContent = subTime(s), seeing?.id === s.id && seeDraw())));
    if (!n) {
      laneTick?.();
      laneTick = null;
    }
    const behind = [n && `${n} agent${n > 1 ? 's' : ''}`, c && `${c} command${c > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    if (!busy() && !ended()) state(behind ? `${behind} in the background` : 'ready');
  }
  onShut(() => laneTick?.());

  let seeing: { id: string; view: HTMLElement; top: number } | null = null, wantSub: string | null = null;
  const watch = Object.assign(document.createElement('div'), { className: 'ch-watch', hidden: true, title: 'Subagent\nA subagent only answers the main chat. Write there to steer it.', textContent: 'watching: a subagent takes no messages · write in the main chat' });
  form.before(watch);
  watch.addEventListener('click', () => tell(watch, { title: 'A subagent takes no messages', line: 'Write in the main chat: ← or Esc goes back to it', ms: 2500 }));
  function showSub(id: string) {
    const l = lanes.get(id);
    if (!l) return;
    if (!subsChat()) {
      l.classList.remove('shut');
      laneMode(l);
      st.pin(false);
      return l.scrollIntoView({ block: 'start' });
    }
    if (seeing) hideSub();
    const view = document.createElement('div');
    view.className = 'ch-subview';
    view.innerHTML = `<div class="sv-head"><button type="button" class="ch-pill sv-back" data-sv-back title="Back to the main chat\nLeaves this subagent and shows the main chat again." data-tip-keys="=esc:back">← main chat</button><b class="sv-name"></b><span class="sa-chips"></span><span class="sv-time"></span></div><div class="sv-from"><span class="k">from the main chat</span><div class="sv-prompt"></div></div><div class="sv-steps"></div>`;
    view.querySelector('.sv-steps')!.append(l.body!, l.res!);
    seeing = { id, view, top: log.scrollTop };
    flow.hidden = true;
    log.append(view);
    form.hidden = true;
    watch.hidden = false;
    seeDraw();
    log.scrollTop = 0;
  }
  function hideSub() {
    const { id, view, top } = seeing!, l = lanes.get(id)!;
    l.append(l.body!, l.res!);
    view.remove();
    seeing = null;
    flow.hidden = false;
    form.hidden = false;
    watch.hidden = true;
    log.scrollTop = top;
  }
  function seeDraw() {
    const s = subs.get(seeing!.id), v = seeing!.view;
    v.querySelector('.sv-name')!.textContent = subName(s);
    v.querySelector('.sa-chips')!.innerHTML = chipsHtml(s);
    v.querySelector('.sv-time')!.textContent = s.status === 'running' ? `running · ${subTime(s)}` : subTime(s);
    v.querySelector('.sv-time')!.className = `sv-time s-${s.status}`;
    v.querySelector('.sv-prompt')!.textContent = s.prompt;
    (v.querySelector('.sv-from') as HTMLElement).hidden = !s.prompt;
  }
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !seeing) return;
    e.preventDefault();
    e.stopPropagation();
    hideSub();
  }, true);
  function subUpdate(u: any, at?: number) {
    const hit = subs.feed(u, at || Date.now());
    if (!hit) return false;
    const el = lane(hit.sub);
    if (hit.step) {
      toolRow(u, el.body);
      lane(hit.sub);
    }
    lanesRun();
    return true;
  }
  log.addEventListener('contextmenu', (e) => {
    const l = (e.target as HTMLElement).closest?.('.sa');
    if (!l || (e.target as HTMLElement).closest('.sa-body, .sa-res')) return;
    e.preventDefault();
    if (sideOn()) return tell(l, { title: 'In Research a subagent opens beside its chat', line: 'A click shows it in a tab; a double-click keeps that tab', ms: 2500 });
    if (!subsChat()) return tell(l, { title: 'Subagents get their own window and list rows is off', line: 'Turn it on in Settings, Agents and chat, Providers and tools.', ms: 2500 });
    setPref('subagents:open', pref('subagents:open') === 'win' ? 'here' : 'win');
    const ic = l.querySelector<HTMLElement>('.sa-ic')!;
    ic.classList.remove('flip');
    void ic.offsetWidth;
    ic.classList.add('flip');
  });
  function clickRow(b: HTMLElement, e: MouseEvent) {
    return sideOn() ? openSub!(b.parentElement!.dataset.sa!, e.detail > 1) : subsChat() ? openLane(b.parentElement!.dataset.sa!) : foldLane(b.parentElement as Line);
  }
  return { lane, runUpdate, subUpdate, lanesRun, showSub, hideSub, clickRow, seeing: () => !!seeing, want: (id: string) => (lanes.has(id) ? showSub(id) : (wantSub = id)) };
}
