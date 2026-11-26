import type { Sizes } from '../base/measure.ts';
import { drawStep, foldStep, ioBox, newFits, paintStep, setFold, stopRuns } from './steps.ts';
import { whereIn } from './shape.ts';
import { copy } from '../base/chips.ts';
import { icon } from '../base/icon.ts';
import { S } from '../base/model.ts';
import { agents, follow } from '../base/stream.ts';
import { chipsOf, cmdRuns, nameOf, runName, subagents } from './subagents.ts';
import type { Run, Sub } from './subagents.ts';
import { stick } from './stick.ts';
import { esc, OUT_MAX } from '../base/util.ts';
import { runTime } from '../base/words.ts';

export const subDur = (s: { status: string; start: number; end: number }) => {
  if (s.status === 'failed' || s.status === 'stopped') return s.status;
  const n = Math.max(0, Math.round(((s.end || Date.now()) - s.start) / 1000));
  return runTime(n);
};

export type Follow = {
  m: ReturnType<typeof subagents>;
  runs: ReturnType<typeof cmdRuns>;
  boxes: Map<string, HTMLDivElement>;
  tools: Map<string, any>;
  fits: Sizes;
  boxOf: (id: string) => HTMLDivElement;
  words: (s: Sub) => string;
  stop: () => void;
};

export function followSubs(chat: string, changed: () => void, { cmds = false } = {}) {
  const f = { m: subagents(), runs: cmdRuns(), boxes: new Map(), tools: new Map(), fits: newFits() } as Follow;
  const here = () => {
    const a = agents.all.get(chat), c = whereIn(a?.pid ?? S.pid);
    return a?.wt ? { ...c, root: a.wt, main: c.root, here: false } : c;
  };
  let due = 0;
  const soon = () => (due ||= setTimeout(() => ((due = 0), changed()), 40));
  f.boxOf = (id) => {
    let b = f.boxes.get(id);
    if (!b) f.boxes.set(id, (b = Object.assign(document.createElement('div'), { className: 'sa-body' })));
    return b;
  };
  f.words = (s) => {
    const last = s.steps.at(-1), t = last && f.tools.get(last.id);
    return s.status === 'running' ? (t?.words || ['', 'starting…']).filter(Boolean).join(' ') : s.status;
  };
  let held: Set<any> | null = null;
  const step = (t: any, u: any) => {
    if (!held) return drawStep(t, u, { here: here(), fits: f.fits });
    foldStep(t, u, here());
    held.add(t);
  };
  const one = (ev: any) => {
    if (ev.type === 'end') return void (f.m.stopAll(ev.at), f.runs.stopAll(ev.at), stopRuns(f.tools.values()), soon());
    const u = ev.type === 'update' && ev.update;
    if (!u || !/^tool_call/.test(u.sessionUpdate)) return;
    const run = cmds && f.runs.feed(u, ev.at || Date.now());
    if (run) {
      let t = f.tools.get(u.toolCallId);
      if (!t) f.tools.set(u.toolCallId, (t = { data: {}, row: f.boxOf(run.id).appendChild(document.createElement('div')), t0: Date.now() }));
      step(t, u);
      return void soon();
    }
    const hit = f.m.feed(u, ev.at || Date.now());
    if (!hit) return;
    if (hit.step) {
      let t = f.tools.get(u.toolCallId);
      if (!t) f.tools.set(u.toolCallId, (t = { data: {}, row: f.boxOf(hit.sub.id).appendChild(document.createElement('div')), t0: Date.now() }));
      step(t, u);
    }
    soon();
  };
  const stop = follow({ chat, tools: true }, (ev) => {
    if (ev.type !== 'history') return one(ev);
    held = new Set();
    try {
      ev.events.forEach(one);
    } finally {
      const ts = held;
      held = null;
      ts.forEach((t) => paintStep(t, { here: here(), fits: f.fits }));
    }
  }, {
    again() {
      f.m = subagents();
      f.runs = cmdRuns();
      f.boxes.forEach((b) => b.replaceChildren());
      f.tools.clear();
      soon();
    },
  });
  f.stop = () => {
    stop();
    clearTimeout(due);
    f.fits.disconnect();
  };
  return f;
}

const JUMP = `<button type="button" class="ch-jump sv-jump" hidden>${icon('down')}<span>new</span></button>`;
function follows(host: HTMLElement) {
  let st: ReturnType<typeof stick> | null = null;
  return {
    start(inner: HTMLElement) {
      st?.stop();
      const jump = host.querySelector<HTMLElement>('.sv-jump')!;
      st = stick(host.querySelector<HTMLElement>('.act-log')!, inner, jump);
      jump.addEventListener('click', () => st!.back());
    },
    stop: () => (st?.stop(), (st = null)),
  };
}

export function subPane(host: HTMLElement, f: Follow, empty: string) {
  let at: string | null = null;
  const fl = follows(host);
  function draw(id: string | null) {
    const s = id && f.m.get(id);
    if (!s) {
      if (at !== '') (fl.stop(), (host.innerHTML = `<div class="act-empty">${empty}</div>`));
      at = '';
      return;
    }
    if (at !== id) {
      at = id;
      host.innerHTML = `<div class="sv-head"><b class="sv-name"></b><span class="sa-chips"></span><span class="sv-time"></span></div><div class="act-log"><div class="sv-flow"><div class="sv-from"><span class="k">from the main chat</span><div class="sv-prompt"></div></div><div class="sv-steps"></div><div class="sa-res"></div></div></div>${JUMP}<div class="ch-watch" title="Subagent&#10;A subagent only answers the main chat. Write there to steer it.">watching: a subagent takes no messages · write in the main chat</div>`;
      host.querySelector('.sv-steps')!.append(f.boxOf(id));
      fl.start(host.querySelector<HTMLElement>('.sv-flow')!);
    }
    host.querySelector('.sv-name')!.textContent = nameOf(s);
    host.querySelector('.sa-chips')!.innerHTML = chipsOf(s).map((c) => `<span class="${c === 'background' ? 'bg' : ''}">${esc(c as string)}</span>`).join('');
    const tm = host.querySelector('.sv-time')!;
    tm.textContent = s.status === 'running' ? `running · ${subDur(s)}` : subDur(s);
    tm.className = `sv-time s-${s.status}`;
    host.querySelector('.sv-prompt')!.textContent = s.prompt;
    (host.querySelector('.sv-from') as HTMLElement | null)?.toggleAttribute('hidden', !s.prompt);
    const res = host.querySelector<HTMLElement>('.sa-res')!;
    if (s.result && res.dataset.of !== s.result) {
      res.dataset.of = s.result;
      res.innerHTML = ioBox('RESULT', esc(s.result.slice(0, OUT_MAX)));
      f.fits.observe(res.querySelector('pre')!);
    }
  }
  draw.stop = fl.stop;
  return draw;
}

export const runDur = (r: Run) => {
  if (r.status === 'stopped') return 'stopped';
  if (r.exit) return 'exit ' + r.exit;
  if (r.status === 'failed') return 'failed';
  return subDur({ ...r, status: 'done' });
};
export function cmdPane(host: HTMLElement, f: Follow) {
  let at: string | null = null;
  const fl = follows(host);
  function draw(id: string | null) {
    const r = id && f.runs.get(id);
    if (!r) return void ((at = null), fl.stop(), host.replaceChildren());
    if (at !== id) {
      at = id;
      host.innerHTML = `<div class="sv-head"><b class="sv-name"></b><span class="sa-chips"></span><span class="sv-time"></span><button type="button" class="ch-mini" data-run-copy>copy</button></div><div class="act-log act-run"></div>${JUMP}`;
      host.querySelector('.act-log')!.append(f.boxOf(id));
      fl.start(f.boxOf(id));
    }
    host.querySelector('.sv-name')!.textContent = runName(r);
    host.querySelector('.sa-chips')!.innerHTML = r.bg ? '<span class="bg">background</span>' : '';
    const tm = host.querySelector('.sv-time')!;
    tm.textContent = r.status === 'running' ? `running · ${runDur(r)}` : runDur(r);
    tm.className = `sv-time s-${r.status}`;
  }
  draw.stop = fl.stop;
  return draw;
}

export function paneClick(e: MouseEvent, openFile: (path: string) => void) {
  const run = (e.target as HTMLElement).closest<HTMLElement>('[data-run-copy]');
  if (run) return copy(run.closest('.act-pane')!.querySelector('.act-run .ch-out')?.textContent || '', run), true;
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-io],[data-chopen],.ch-io.long');
  if (!b || !(e.target as HTMLElement).closest('.act-log')) return false;
  if ('copyIo' in b.dataset) copy(b.closest('.ch-io')!.querySelector('pre')!.textContent, b);
  else if (b.dataset.chopen) openFile(b.dataset.chopen);
  else if (getSelection()!.isCollapsed) setFold(b, !b.classList.contains('open'));
  return true;
}
