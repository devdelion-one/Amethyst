import { every } from './life.ts';
import { pref, PREFS } from './prefs.ts';
import { esc, showErr, sinceShort, store } from './util.ts';
import { busyNow, gem, workCorner, workGem } from './kinds.ts';
import { clearedOf, codeOf, markOf, providerOf, setCleared } from './agentlook.ts';
import { crystalOf } from './codes.ts';
import { ask, colorRow, ICONS, markName, popMenu } from './controls.ts';
import { api, markNo, S } from './model.ts';
import { runTime } from './words.ts';
import { bound, show as keyName } from './binds.ts';
import { icon } from './icon.ts';

export const doneInner = (a: { at?: number | null }, down: string) => `${ICONS.check}<b>Finished</b>${a.at ? `<span class="dk-when" data-at="${a.at}">${sinceShort(a.at)}</span>` : ''}<button type="button" class="dk-down" ${down} aria-label="to the end">${icon('down')}</button>`;
export const pillTip = (id: string) => `${PREFS['chpill:off'].each![id].label}\n${PREFS['chpill:off'].tips![id]}`;
export const signinTip = (name: string) => pillTip('signin').replace("this chat's agent", name);
export const chatHead = (name: string, tools = chatTools(name)) => `<header class="ch-head"><i class="ch-mark">${gem('ai')}</i><button type="button" class="ch-name" data-ch="swap" title="${esc(pillTip('swap'))}" aria-haspopup="menu"><span>${name}</span></button><span class="ch-state"></span>
      <span class="ch-cwd dim"></span><span class="grow"></span>
      ${tools}</header>`;
export const swapRow = () => `<button type="button" role="menuitem" class="ch-sw" data-ch="swap" aria-haspopup="menu" title="${esc(pillTip('swap'))}">${icon('agent')}continue with<span class="pk-ar">›</span></button>`;
export const chatMenu = (swap = '') => `<div class="ch-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-ch="history">${icon('history')}earlier chats</button>
      <button type="button" role="menuitem" data-ch="signin">${icon('key')}sign-in</button>
      <button type="button" role="menuitem" data-ch="clear" title="${esc(clearTip())}" data-tip-keys="clearKey:clear">${icon('clear')}clear this chat</button>${swap}</div>`;
export const chatTools = (name: string, o: { rev?: boolean; subs?: string } = {}) => `<span class="ch-tools"><button class="ch-pill ch-rev" data-ch="review" title="Review&#10;What this chat changed, in a window of its own." aria-label="Review"${o.rev ? '' : ' hidden'}><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v6M5 5.5h6M5 12.5h6"/></svg></button><button class="ch-pill ch-subs" data-ch="subs" title="Agent activity&#10;This chat's subagents, in a window of its own." aria-label="Agent activity"${o.subs ? '' : ' hidden'}>${icon('subs')}<span>${o.subs || ''}</span></button><span class="ch-model dim"></span>
      <button class="ch-pill" data-ch="history" title="${esc(pillTip('history'))}" aria-label="earlier chats">${icon('history')}<span>history</span></button>
      <button class="ch-pill" data-ch="signin" title="${esc(signinTip(name))}" aria-label="sign-in">${icon('key')}<span>sign-in</span></button>
      <button class="ch-pill" data-ch="clear" title="${esc(clearTip())}" data-tip-keys="clearKey:clear" aria-label="clear this chat">${icon('clear')}<span>clear</span></button>
      <button class="ch-pill" data-ch="swap" title="${esc(pillTip('swap'))}" aria-label="continue with" aria-haspopup="menu">${icon('agent')}<span>continue with</span></button>
      <button class="ch-pill ch-more" data-ch="more" title="More&#10;Everything else for this chat: earlier chats, sign-in, clear and continue with." aria-label="more" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button></span>`;
import type { AgentInfo as Agent, SubSummary } from './types.ts';

type Sub = SubSummary;
export const subsShut = () => new Set<string>(store.get('deck:subs-shut', []));
export const listOn = () => pref('subagents:on') && pref('subagents:list');
export const took = (s: Sub) => runTime(Math.max(0, Math.round(((s.end || Date.now()) - s.start) / 1000)));
export const MARKS: Record<string, string> = {
  running: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3.6" class="o"/><path d="M5 1.4a3.6 3.6 0 0 1 3.6 3.6"/></svg>',
  done: '<svg viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4"/></svg>',
  failed: '<svg viewBox="0 0 10 10"><path d="M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8"/></svg>',
  stopped: '<i></i>',
};
export function subsOf(a: Agent): Sub[] {
  if (a.kind !== 'chat' || !listOn() || !a.subs?.length) return [];
  const gone = clearedOf(a.id);
  return a.subs.filter((s: Sub) => !gone.has(s.id));
}
export function subCount(subs: Sub[]) {
  if (!subs.length) return '';
  const run = subs.filter((s) => s.status === 'running').length, tone = run ? 'run' : subs.some((s) => s.status === 'failed') ? 'bad' : 'ok';
  return `<i class="dk-cnt ${tone}" title="${subs.length} subagent${subs.length > 1 ? 's' : ''}${run ? `, ${run} running` : ''}">${subs.length}</i>`;
}
export function subLine(s: Sub, chat: string, last: boolean) {
  const run = s.status === 'running', now = s.now || 'starting…', time = took(s);
  const more = run ? `<span class="x">${esc(now)}</span>` : s.status === 'failed' && s.why ? `<span class="why">${esc(s.why)}</span>` : '';
  const state = run ? now : s.status === 'failed' ? 'failed' + (s.why ? ': ' + s.why : '') : s.status;
  return `<div class="dk-sub s-${s.status}${last ? ' end' : ''}" data-dk-sub="${esc(s.id)}" data-dk-of="${esc(chat)}" role="button" tabindex="0"><i class="mk">${MARKS[s.status] || MARKS.stopped}</i><span class="n">${esc(s.name)}</span><span class="t${run ? ' dk-tick' : ''}"${run ? ` data-from="${s.start}"` : ''}>${time}</span>${more}${run ? '' : `<span class="cl" data-dk-subclear="${esc(s.id)}" data-dk-of="${esc(chat)}" title="Clear&#10;Clears it from this list. It stays in the chat.">${ICONS.wx}</span>`}</div>`;
}
function subsTail(a: Agent, subs: Sub[]) {
  const done = subs.filter((s) => s.status !== 'running').length, gone = (a.subs?.length || 0) - subs.length;
  const b = [done > 1 ? `<button type="button" data-dk-subdone="${esc(a.id)}" title="Clear ${done} finished&#10;Clears them from this list. They stay in the chat.">clear ${done} finished</button>` : '', gone > 0 ? `<button type="button" data-dk-subback="${esc(a.id)}">${gone} cleared · show</button>` : ''].join('');
  return b ? `<div class="dk-subx">${b}</div>` : '';
}
export const subsBlock = (a: Agent, subs: Sub[]) => (!subs.length || subsShut().has(a.id) ? '' : `<div class="dk-strip">${subs.map((s, i) => subLine(s, a.id, i === subs.length - 1)).join('')}${subsTail(a, subs)}</div>`);
export function subClear(t: HTMLElement, agentOf: (id: string) => Agent | null | undefined) {
  const b = t.closest<HTMLElement>('[data-dk-subclear],[data-dk-subdone],[data-dk-subback]');
  if (!b) return false;
  const d = b.dataset, chat = (d.dkOf || d.dkSubdone || d.dkSubback)!, gone = clearedOf(chat);
  if (d.dkSubclear) gone.add(d.dkSubclear);
  else if (d.dkSubdone) for (const s of agentOf(chat)?.subs || []) s.status !== 'running' && gone.add(s.id);
  else gone.clear();
  setCleared(chat, gone);
  return true;
}
const ticks = document.getElementsByClassName('dk-tick') as HTMLCollectionOf<HTMLElement>;
const put = (e: HTMLElement, text: string) => e.textContent !== text && (e.textContent = text);
every(1000, () => {
  for (const e of ticks) put(e, runTime(Math.max(0, Math.round((Date.now() - +e.dataset.from!) / 1000))));
});
every(6000, () => {
  for (const e of document.getElementsByClassName('dk-when') as HTMLCollectionOf<HTMLElement>) put(e, e.hasAttribute('data-tiny') ? tiny(+e.dataset.at!) : sinceShort(+e.dataset.at!));
});
export function tiny(ms: number) {
  const s = Math.max(0, (Date.now() - ms) / 1000), d = s / 864e2;
  return s < 45 ? 'now' : s < 3600 ? Math.round(s / 60) + 'm' : s < 864e2 ? Math.round(s / 3600) + 'h' : d < 14 ? Math.round(d) + 'd' : d < 60 ? Math.round(d / 7) + 'w' : Math.round(d / 30) + 'mo';
}

export const tileOf = (a: { kind: string; status?: string }) => (!busyNow(a) ? markOf(a) : a.kind === 'term' ? gem('term') + workCorner() : workGem());

export const NOTE_IC = ICONS.note;
export const noteFirst = (a: { note?: string }) => (a.note || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
const noteKey = () => keyName(bound('noteKey'));
export const clearTip = () => 'Clear this chat\nEmpties the chat and forgets it, to start over.';
export function noteTip(a: Agent) {
  const first = noteFirst(a);
  return first ? `Note\n${first}` : 'Note\nA note on this chat, for you.';
}
export function noteBtn(a: Agent, cls = '') {
  if (a.kind !== 'chat') return '';
  return `<button class="nt-d ${cls}${a.note ? ' on' : ''}" data-dk-note="${esc(a.id)}" title="${esc(noteTip(a))}" data-tip-keys="noteKey:show or hide" aria-label="note">${NOTE_IC}${a.note ? '<i class="nt-dot"></i>' : ''}</button>`;
}
export function noteSign(a: Agent) {
  if (a.kind !== 'chat' || !a.note) return '';
  return `<button class="nt-d nt-sign on" data-dk-note="${esc(a.id)}" title="${esc(noteTip(a))}" data-tip-keys="noteKey:show or hide" aria-label="note">${NOTE_IC}<i class="nt-dot"></i></button>`;
}
const NOTE_PX = `<svg viewBox="0 0 8 8" aria-hidden="true">${['#####...', '######..', '#######.', '#.....#.', '#######.', '#...###.', '#######.', '#######.'].flatMap((r, y) => [...r].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;
const noteBadge = (a: Agent) => (a.kind === 'chat' && a.note ? `<i class="dk-nb">${NOTE_PX}</i>` : '');

export type Row = { key: string; html: string; cmp: string; shape: string; text: string; at: number; a: Agent | null };
export type Placed = Row & { nodes: Element[] };
export type Drawn = { cmp: string | null; units: Map<string, Placed> };
export const steady = (h: string) => h.replace(/(<i class="dk-spk"[^>]*>)[^<]*/g, '$1').replace(/(<b class="dk-wd">)[^<]*/g, '$1');
const gemStyle = (id: string) => (id ? ` style="--gem-c:${crystalOf(id).color}"` : '');

export function markBtn(a: Agent, cls = '', force = false) {
  if (a.kind !== 'chat' || !a.session || (!force && !pref('marks:on'))) return '';
  const n = markNo(a), tip = n ? markName(n) : 'mark it';
  return `<button class="mk-d ${cls}${n ? ` on m${n}` : ''}" data-dk-mark="${esc(a.id)}" aria-label="${esc(tip)}">${ICONS['mark' + n]}</button>`;
}
export function markSign(a: Agent, mark?: number) {
  const n = a.kind === 'chat' && a.session && pref('marks:on') ? mark ?? markNo(a) : 0;
  if (!n) return '';
  const tip = `${markName(n)} · click to change it`;
  return `<button class="mk-d mk-sign on m${n}" data-dk-mark="${esc(a.id)}" aria-label="${esc(tip)}">${ICONS['mark' + n]}</button>`;
}
export function markItems(a: Agent) {
  const now = markNo(a);
  const cell = (n: number) => {
    const name = n ? markName(n) : 'no mark';
    return `<button class="mk-c${n === now ? ' on' : ''}" data-mk="${n}" aria-label="${esc(name)}" aria-pressed="${n === now}"><i class="mk-d m${n}">${ICONS['mark' + n]}</i></button>`;
  };
  return `<div class="mk-strip" role="group" aria-label="mark">${[0, 1, 2, 3].map(cell).join('')}</div>`;
}
export function markFly(a: Agent, fly: string) {
  const now = markNo(a);
  const cell = (n: number) => `<button class="sw-mk${n ? ` fmk mk-d m${n}` : ' dft'}${n === now ? ' on' : ''}" data-mk="${n}" aria-label="${esc(n ? markName(n) : 'None: no mark. The default.')}">${n ? ICONS['mark' + n] : '<i class="pk-ic"><i class="pk-none"></i></i>'}</button>`;
  return colorRow({ k: 'mk', label: 'mark', tip: 'a sign on the chat, in the agents list and its header', ic: ICONS.mark2, chip: now ? `<i class="pk-ic mk-d m${now}">${ICONS['mark' + now]}</i>` : '<i class="pk-ic"><i class="pk-none"></i></i>', now: now ? markName(now) : 'none', attr: 'mk', cls: '', dfltCls: '', dfltTip: '', dfltStyle: '', style: () => '', icon: '', grid: [0, 1, 2, 3].map(cell).join('') }, now ? String(now) : null, fly);
}
export const renameItem = (a: Agent) => (a.kind === 'chat' ? `<button class="mi" data-rename><i class="tb-ic">${ICONS.rename}</i><span class="mi-n">rename…</span></button>` : '');
export async function renameAsk(a: Agent) {
  const was = a.title || '';
  const name = await ask({ title: 'rename chat', value: was, pick: [0, was.length], blank: true });
  if (name == null || name === was) return;
  api('POST', '/api/chats/rename', name ? { chat: a.id, title: name } : { chat: a.id, clear: true }, a.pid ?? S.pid).catch(showErr);
}
export const markPick = (a: Agent, n: number) => (n && n === markNo(a) ? 0 : n);
export function markMenu(a: Agent, x: number, y: number, mark: (session: string, n: number) => unknown, done: () => void = () => {}) {
  popMenu(x, y, `<div class="ml">mark</div>${markItems(a)}`, (o) => {
    if (o.dataset.mk == null) return;
    mark(a.session!, markPick(a, +o.dataset.mk));
    done();
  });
}

const modelTip = (m: string) => {
  const [model, effort] = m.split(' · ');
  return effort ? `Model: ${model}, Effort: ${effort}\nThe model this chat runs on, and how much it thinks before it answers.` : `Model: ${model}\nThe model this chat runs on.`;
};
export type RowOpts = { attr: string; show?: string[]; cls?: string; benched?: boolean; fold?: boolean; mark?: boolean; pre?: string; xTip?: string; xKeys?: string };
export function agentRow(a: Agent, o: RowOpts): Row {
  const topic = a.title ? esc(a.title) : `<i>${a.kind === 'term' ? `${esc(a.program || 'terminal')} · ready` : 'Ready'}</i>`;
  const line = a.status === 'ended' ? `ended${a.line ? ' · ' + a.line : ''}` : a.line;
  const text = line && line !== 'ready' && !(a.title && line.startsWith(a.title)) ? line : a.title || a.kind === 'term' ? '' : 'waiting for a message';
  const code = crystalOf(a.id).code, who = a.model || providerOf(a).replace(/ Agent$/, ''), on = (k: string) => !!o.show?.includes(k) || !!pref(k), info = on('deck:rowInfo');
  const subs = subsOf(a), shut = subs.length > 0 && subsShut().has(a.id);
  const n = o.mark && a.kind === 'chat' && a.session && pref('marks:on') ? markNo(a) : 0;
  const rc = on('deck:rowCode'), nb = noteBadge(a), two = pref('deck:title2') && !pref('deck:rowInfo');
  const build = (text: string, t: number) => `<div class="dk-row dk-one${two ? ' dk-two' : ''}${o.cls ? ' ' + o.cls : ''}${shut ? ' subs-shut' : ''}"${o.benched ? ' data-bench' : ''} data-st="${a.status}" ${o.attr}="${esc(a.id)}"${gemStyle(a.id)}${a.title ? ` title="${esc(a.title)}" data-tip-cut=".dk-topic"` : ''} role="button" tabindex="0">
        <i class="dk-tile">${tileOf(a)}${rc ? `<b class="dk-short">${code}</b>` : ''}${n ? `<i class="dk-bd m${n}">${ICONS['mark' + n]}</i>` : ''}${nb}${a.report ? `<i class="dk-rp">${ICONS.bell}</i>` : ''}${subCount(subs)}</i>
        <span class="dk-rt"><span class="dk-r1">${rc ? codeOf(a.id, '', false) : ''}<b class="dk-topic">${topic}</b></span>${info ? `<span class="dk-r2">${a.model ? `<span class="dk-md" title="${esc(modelTip(a.model))}" data-tip-icon="model">${esc(a.model)}</span>` : `<i class="dk-provider">${esc(who)}</i>`}<span class="dk-line">${esc(text)}</span></span>` : ''}</span>${o.pre || ''}
        <span class="dk-slot">${t ? `<span class="dk-when" data-at="${t}" data-tiny>${tiny(t)}</span>` : ''}<span class="dk-acts">${o.mark ? markBtn(a, 'mk-row') : ''}<button class="dk-x" data-dk-end="${esc(a.id)}" title="${esc(o.xTip || (a.kind === 'chat' ? 'Close\nEnds this chat. A busy one asks first.' : 'Close\nStops the terminal and what runs in it.'))}" data-tip-keys="${esc(o.xKeys || '=shift+click:close without asking')}" aria-label="close">×</button></span></span></div>`;
  const strip = subsBlock(a, subs), html = build(text, a.at) + strip;
  return { key: 'r:' + a.id, html, cmp: steady(html), shape: steady(build('', a.at ? 1 : 0)) + strip, text, at: a.at, a: null };
}
export const headRow = (k: string, h: string): Row => ({ key: 'h:' + k, html: h, cmp: steady(h), shape: '', text: '', at: 0, a: null });

function noneIn(list: HTMLElement, none: string) {
  if (list.childElementCount !== 1 || list.firstElementChild!.outerHTML !== none) list.innerHTML = none;
  return new Map<string, Placed>();
}
function placeUnits(list: HTMLElement, was: Map<string, Placed>, units: Row[], card: (a: Agent) => HTMLElement) {
  const now = new Map<string, Placed>(), tpl = document.createElement('template');
  for (const u of units) {
    const o = was.get(u.key);
    if (o && o.cmp === u.cmp) {
      now.set(u.key, o);
      continue;
    }
    if (o && u.shape && o.shape === u.shape) {
      const e = o.nodes[0] as HTMLElement, l = e.querySelector('.dk-line');
      if (l && u.text !== o.text) l.textContent = u.text;
      const w = e.querySelector<HTMLElement>('.dk-when');
      if (w && u.at !== o.at) {
        w.dataset.at = u.at as unknown as string;
        w.textContent = tiny(u.at);
      }
      now.set(u.key, { ...u, nodes: o.nodes });
      continue;
    }
    tpl.innerHTML = u.html;
    if (u.a) tpl.content.querySelector('[data-dk-ask]')?.replaceWith(card(u.a));
    now.set(u.key, { ...u, nodes: [...tpl.content.children] });
  }
  const keep = new Set<Element>();
  for (const p of now.values()) for (const n of p.nodes) keep.add(n);
  for (const c of [...list.children]) if (!keep.has(c)) c.remove();
  const move = (list as HTMLElement & { moveBefore?: (n: Node, ref: Node | null) => void }).moveBefore;
  let cur: Element | null = list.firstElementChild;
  for (const u of units)
    for (const n of now.get(u.key)!.nodes) {
      if (n === cur) cur = n.nextElementSibling;
      else if (n.parentNode === list && move) move.call(list, n, cur);
      else list.insertBefore(n, cur);
    }
  return now;
}
export function drawRows(list: HTMLElement, was: Drawn, units: Row[], none: string, card: (a: Agent) => HTMLElement): Drawn {
  const cmp = units.map((r) => r.key + ' ' + r.cmp).join('') || none;
  if (cmp === was.cmp) return was;
  const focus = document.activeElement?.closest('.dk-ask') ? document.activeElement as HTMLInputElement : null, caret = focus?.matches('input') ? [focus.selectionStart, focus.selectionEnd] as [number, number] : null;
  const now = units.length ? placeUnits(list, was.units, units, card) : noneIn(list, none);
  if (focus && focus !== document.activeElement && focus.isConnected) {
    focus.focus({ preventScroll: true });
    if (caret) focus.setSelectionRange(...caret);
  }
  return { cmp, units: now };
}
export const fileDrag = (e: DragEvent, dragging: string | null | undefined) => /^(file|dir|link):/.test(dragging || '') || ['Files', 'application/x-pm-file'].some((t) => e.dataTransfer?.types.includes(t));
