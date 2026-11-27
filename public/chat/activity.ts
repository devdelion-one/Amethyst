import { icon } from '../base/icon.ts';
import { ICONS } from '../base/controls.ts';
import { clearedOf, onCleared, setCleared } from '../base/agentlook.ts';
import { gem } from '../base/kinds.ts';
import { every } from '../base/life.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { agents, onAgents } from '../base/stream.ts';
import { cdOf, chipsOf, nameOf, runName } from './subagents.ts';
import type { Run, Sub } from './subagents.ts';
import { cmdPane, followSubs, paneClick, runDur, subDur, subPane } from './subview.ts';
import { $, agentName, amTag, esc, store } from '../base/util.ts';
import { claim, forMe, isSpare, on, send, SOLO, toSpare } from '../base/windows.ts';

const OWN = !!window.amethyst?.desktop;
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((z) => `<i data-rs="${z}"></i>`).join('');
const modeOn = () => pref('subagents:on') && (pref('subagents:chat') || pref('subagents:list') || pref('decklist:subs'));
const cmdsOn = () => pref('subagents:chat');
const FOLD = 'actFold';
const folded = new Set<string>(store.get(FOLD, []));
const lab = (k: string, name: string, n: number) => {
  const shut = folded.has(k);
  return `<button type="button" class="act-lab${shut ? ' shut' : ''}" data-act-fold="${k}" aria-expanded="${!shut}" title="${shut ? 'Unfold' : 'Fold'}&#10;${shut ? 'Shows' : 'Hides'} the ${name} in this list.">${shut ? ICONS.chev : ICONS.chevDown}<span>${name}</span>${shut ? `<i class="n">${n}</i>` : ''}</button>`;
};

function view(chat: string, pick: string | null = null) {
  const el = document.createElement('div');
  el.className = 'act-view';
  el.innerHTML = '<div class="act-list"></div><div class="act-pane"></div><div class="act-pane" hidden></div>';
  const [list, pane, runPane] = el.children as unknown as HTMLElement[];
  let sel: string | null = null, want = pick, tick: (() => void) | null = null;
  const f = followSubs(chat, () => draw(), { cmds: true });
  const paneDraw = subPane(pane, f, `Its ${cmdsOn() ? 'subagents and commands show' : 'subagents show'} here once it starts one:<br>what it asked each, every step, the result, live.`);
  const runDraw = cmdPane(runPane, f);
  const lastOut = (r: Run) => {
    const t = f.tools.get(r.id);
    return ((t && (t.live ?? t.out)) || '').trimEnd().split('\n').pop() || (r.status === 'running' ? 'no output yet' : '');
  };

  function draw() {
    const gone = clearedOf(chat), subsOn = modeOn(), runsOn = cmdsOn();
    const subs = subsOn ? [...f.m.all.values()] : [], runs = runsOn ? [...f.runs.all.values()] : [];
    const has = (id: string) => (subsOn && f.m.get(id)) || (runsOn && f.runs.get(id));
    if (want && has(want)) [sel, want] = [want, null];
    const live = (xs: (Sub | Run)[]) => xs.find((x) => x.status === 'running');
    if (sel == null || !has(sel)) sel = (live(subs) || live(runs) || subs.at(-1) || runs.at(-1))?.id ?? null;
    const a = agents.all.get(chat), shownSubs = subs.filter((s) => !gone.has(s.id)), shownRuns = runs.filter((r) => !gone.has(r.id));
    const x = (s: Sub | Run) => (s.status === 'running' ? '' : `<span class="x" data-act-clear="${esc(s.id)}" title="Clear&#10;Clears it from this list. It stays in the chat.">${ICONS.wx}</span>`);
    const row = (s: Sub, i: number) => `<button type="button" class="sub-row act-sub s-${s.status}${s.id === sel ? ' sel' : ''}${i === shownSubs.length - 1 ? ' end' : ''}" data-act-sub="${esc(s.id)}"><i class="d"></i><span class="a">${esc(nameOf(s))}</span><span class="b"><span>${esc(chipsOf(s).filter((c) => c !== 'background').join(' · '))}</span><span class="t">${subDur(s)}</span></span><span class="nw">${esc(f.words(s))}</span>${x(s)}</button>`;
    const runLine = (r: Run) => {
      const { dir, cmd } = cdOf(r.input.command);
      return `${dir ? `<i class="dir">${esc(dir)}</i>` : ''}${r.input.description ? esc(cmd || r.title || '') : ''}`;
    };
    const runRow = (r: Run, i: number) => `<button type="button" class="sub-row act-sub act-run s-${r.exit ? 'failed' : r.status}${r.id === sel ? ' sel' : ''}${i === shownRuns.length - 1 ? ' end' : ''}" data-act-run="${esc(r.id)}" title="${esc(r.input.command ? `${r.input.command}
The whole command. Click to see what it printed.` : r.title || '')}" data-tip-mono><i class="d"></i><span class="a">${esc(runName(r))}</span><span class="b"><span class="c">${runLine(r)}</span><span class="t">${r.bg && r.status === 'running' ? 'bg · ' : ''}${runDur(r)}</span></span><span class="nw">${esc(lastOut(r))}</span>${x(r)}</button>`;
    const clr = (xs: (Sub | Run)[], k: string) => {
      const done = xs.filter((s) => s.status !== 'running').length;
      return done > 1 ? `<div class="act-clr"><button type="button" data-act-cleardone="${k}" title="Clear ${done} finished&#10;Clears them from this list. They stay in the chat.">clear ${done} finished</button></div>` : '';
    };
    const cleared = gone.size ? `<div class="act-clr"><span>${gone.size} cleared</span><button type="button" data-act-unclear>show</button></div>` : '';
    list.innerHTML = `<div class="act-chat"><i class="act-gem s-${a?.status || 'idle'}">${gem('ai')}</i><span class="act-ct"><span class="dim">${esc(a ? agentName(a.program) + (a.model ? ` · ${a.model}` : '') : 'chat')}</span><b>${esc(a?.title || 'a chat')}</b></span></div>` +
      (runsOn && shownSubs.length ? lab('subs', 'subagents', shownSubs.length) : '') +
      (shownSubs.length && !(runsOn && folded.has('subs')) ? `<div class="act-subs">${shownSubs.map(row).join('')}</div>${clr(shownSubs, 'subs')}` : '') +
      (shownRuns.length ? lab('runs', 'commands', shownRuns.length) + (folded.has('runs') ? '' : `<div class="act-subs">${shownRuns.map(runRow).join('')}</div>${clr(shownRuns, 'runs')}`) : '') +
      cleared;
    const isRun = !!(sel && runsOn && f.runs.get(sel));
    pane.hidden = isRun;
    runPane.hidden = !isRun;
    if (isRun) runDraw(sel);
    else paneDraw(sel);
    const running = live(subs) || live(runs);
    if (running && !tick) tick = every(1000, draw);
    if (!running) (tick?.(), (tick = null));
  }

  el.addEventListener('click', (e) => {
    if (paneClick(e, (p) => (SOLO ? send('openq', { path: p }) : page.floatOpen?.(p)))) return;
    const b = (e.target as HTMLElement).closest('[data-act-fold],[data-act-clear],[data-act-cleardone],[data-act-unclear],[data-act-sub],[data-act-run]') as HTMLElement;
    if (!b) return;
    const d = b.dataset, gone = clearedOf(chat);
    if (d.actFold) return folded.has(d.actFold) ? folded.delete(d.actFold) : folded.add(d.actFold), store.set(FOLD, [...folded]), draw();
    if (d.actClear) return gone.add(d.actClear), setCleared(chat, gone), draw();
    if (d.actCleardone) return [...(d.actCleardone === 'runs' ? f.runs : f.m).all.values()].forEach((s) => s.status !== 'running' && gone.add(s.id)), setCleared(chat, gone), draw();
    if ('actUnclear' in d) return setCleared(chat, []), draw();
    if (d.actSub || d.actRun) return (sel = d.actSub || d.actRun!), draw();
  });
  const unpref = [...['subagents:on', 'subagents:chat'].map((k) => onPref(k, draw)), onCleared(draw)];
  draw();
  return {
    el,
    pick: (id: string) => ((want = id), draw()),
    stop() {
      f.stop();
      paneDraw.stop();
      runDraw.stop();
      tick?.();
      unpref.forEach((off) => off());
    },
  };
}

type Shell = { el: HTMLElement; v: ReturnType<typeof view>; fr: any };
const shells = new Map<string, Shell>();
let float: typeof import('../app/float.ts') | null = null;
function shell(chat: string) {
  const el = document.createElement('section');
  el.className = 'box qtwin actwin';
  el.setAttribute('aria-label', 'Agent Activity');
  el.innerHTML = `<div class="fw-head"><span class="qt-name">${icon('subs')}<span class="nm">Agent Activity</span><span class="act-of dim"></span></span><span class="szs"></span><button class="x" data-act-close aria-label="close" title="Close&#10;Closes this window. The chat goes on.">${ICONS.wx}</button></div><div class="qt-body"></div>${RS}`;
  ($('#app') || document.body).append(el);
  const v = view(chat);
  el.querySelector('.qt-body')!.append(v.el);
  const s: Shell = { el, v, fr: null };
  el.querySelector('[data-act-close]')!.addEventListener('click', () => close(chat));
  el.addEventListener('pointerdown', () => raise(el));
  if (float) s.fr = float.frame(el, 'actWin', () => float!.preset(4));
  shells.set(chat, s);
  title(chat);
  return s;
}
const title = (chat: string) => {
  const a = agents.all.get(chat), at = shells.get(chat)?.el.querySelector('.act-of');
  if (at) at.textContent = a?.title ? ` · ${a.title}` : '';
  if (SOLO && a) document.title = amTag + `${agentName(a.program)} · ${a.title || 'chat'} · Agent Activity`;
};
let top = 34;
const raise = (el: HTMLElement) => (el.style.zIndex = String(++top));
function close(chat: string) {
  const s = shells.get(chat);
  if (!s) return;
  s.v.stop();
  s.el.remove();
  shells.delete(chat);
}

export function openActivity(chat: string | null | undefined, sub: string | null = null, cmd: string | null = null) {
  sub ||= cmd;
  if (!chat || !(modeOn() || cmdsOn())) return;
  if (OWN) return void import('../app/float.ts').then((f) => f.soloOut(`activity-${chat}`, { more: sub ? `&sub=${encodeURIComponent(sub)}` : '', msgs: sub ? [['actsub', { sub }]] : [], warm: ['claimact', { chat, sub }] }));
  const s = shells.get(chat) || shell(chat);
  raise(s.el);
  if (sub) s.v.pick(sub);
  s.fr?.fit();
}

function beActivity(chat: string, sub: string | null) {
  document.documentElement.classList.add('xsolo', 'xact');
  const s = shell(chat);
  if (sub) s.v.pick(sub);
  on('actsub', (msg) => forMe(msg) && msg.sub && s.v.pick(msg.sub));
  onAgents(() => title(chat));
}
if (SOLO.startsWith('activity-')) beActivity(SOLO.slice('activity-'.length), new URLSearchParams(location.search).get('sub'));
else if (!OWN) {
  import('../app/float.ts').then((f) => {
    float = f;
    shells.forEach((s, chat) => (s.fr = f.frame(s.el, 'actWin', () => f.preset(4)), s.fr.fit()));
  });
  onAgents(() => shells.forEach((s, chat) => title(chat)));
}
if (isSpare())
  on('claimact', (m) => {
    if (!toSpare(m) || !m.chat) return;
    claim(`activity-${m.chat}`);
    beActivity(String(m.chat), m.sub || null);
    page.render?.();
    send('raised');
  });
for (const k of ['subagents:on', 'subagents:chat', 'subagents:list', 'decklist:subs']) onPref(k, () => {
  if (modeOn() || cmdsOn()) return;
  if (SOLO.startsWith('activity-')) return window.close();
  [...shells.keys()].forEach(close);
});
