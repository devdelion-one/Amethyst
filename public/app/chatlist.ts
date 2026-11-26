import { chatsOn, listKey, pref, PREFS, setPref } from '../base/prefs.ts';
import { agentMenu } from '../base/agentmenu.ts';
import { amElse, amKey, esc, store, track } from '../base/util.ts';
import { busyNow, gem, workGem } from '../base/kinds.ts';
import { crystalOf } from '../base/codes.ts';
import { barMenu, ICONS, miRow, rowIcons, sortable, topRow } from '../base/controls.ts';
import { toolSign, TOOL_IC } from '../base/tools.ts';
import { markSign, noteFirst, NOTE_IC, took, whenSpan } from '../base/agentrow.ts';
import type { Row } from '../base/agentrow.ts';
import { agents } from '../base/stream.ts';
import { answers } from '../base/answer.ts';
import { folderHost, newFolder } from '../base/chatfolders.ts';
import type { Group } from '../base/chatfolders.ts';
import { folderOf, foldersOn } from '../base/folders.ts';
import { levelKey } from '../base/model.ts';
import { icon } from '../base/icon.ts';
import type { Agent } from '../base/stream.ts';

type Sub = NonNullable<Agent['subs']>[number];
export type RowCtx = { list: string; attr: string; calm: boolean; tight: boolean; live: boolean; cur: string | null; show?: string[] };
type SnapOpts = { grip: HTMLElement; sizes: number[]; at: (ev: PointerEvent) => number; box: (w: number) => { left: number; top: number; width: number; height: number; edge: number }; label: (w: number) => string; apply: (w: number, past: number) => void };
export type ListOpts = {
  list: string;
  el: HTMLElement;
  attr: string;
  mine: (a: Agent) => boolean;
  benched?: (a: Agent) => boolean;
  cur: () => string | null;
  shown: () => boolean;
  repaint?: () => unknown;
  open: (id: string) => unknown;
  close: (a: Agent, sure: boolean) => unknown;
  mark: (a: Agent, x: number, y: number) => unknown;
  sub: (chat: string, sub: string) => unknown;
  newChat: (btn: HTMLElement, program?: string) => unknown;
  none: () => string;
};

export const LIST_W = 270;
const MAG = 20;

const subsOn = (list: string) => !!pref('subagents:on') && !!pref(listKey(list, 'subs'));
const stOf = (a: Agent) => (busyNow(a) ? 'working' : a.status);
const has = (c: RowCtx, x: string) => !!c.show?.includes(x) || !!pref(listKey(c.list, x));
const subsShown = (c: RowCtx, a: Agent): Sub[] => (a.kind === 'chat' && (c.show?.includes('subs') || subsOn(c.list)) && a.subs?.length ? a.subs : []);
const EYE_PARTS = ['tool', 'code', 'wt'] as const;
function eyeOrder(): string[] {
  const raw = pref('list:eyeOrder');
  const xs = Array.isArray(raw) ? raw.filter((x): x is string => (EYE_PARTS as readonly string[]).includes(x)) : [];
  const out = [...new Set(xs)];
  for (const p of EYE_PARTS) if (!out.includes(p)) out.push(p);
  return out;
}
function slot(st: string) {
  const inner = st === 'working' ? workGem() : st === 'asks' ? '<i class="oc-dot"></i>' : st === 'done' ? ICONS.check : '';
  return `<i class="oc-sg" data-st="${st}">${inner}</i>`;
}
const tool = (c: RowCtx, a: Agent) => (has(c, 'tools') ? toolSign(a) : '');
const code = (c: RowCtx, a: Agent) => (has(c, 'code') ? `<span class="oc-code">${esc(crystalOf(a.id).code)}</span>` : '');
const toolPart = (c: RowCtx, a: Agent) => (has(c, 'tools') ? toolSign(a).replace('<i class="oc-tool"', '<i class="oc-tool" data-oc-part="tool"') : '');
const codePart = (c: RowCtx, a: Agent) => (has(c, 'code') ? `<span class="oc-code" data-oc-part="code">${esc(crystalOf(a.id).code)}</span>` : '');
function wtPart(c: RowCtx, a: Agent) {
  if (!has(c, 'wt')) return '';
  if (a.wtBranch) return `<span class="oc-wt" data-oc-part="wt" title="${esc(`Worktree\nBranch ${a.wtBranch}`)}">${icon('branch')}<span>${esc(a.wtBranch)}</span></span>`;
  return `<span class="oc-wt main" data-oc-part="wt" title="Main folder\nThis chat works in the main project folder."><span>main</span></span>`;
}
function eyeLeft(c: RowCtx, a: Agent) {
  const map: Record<string, () => string> = { tool: () => toolPart(c, a), code: () => codePart(c, a), wt: () => wtPart(c, a) };
  return `<div class="oc-eye-l">${eyeOrder().map((p) => map[p]?.() || '').join('')}</div>`;
}
const topic = (a: Agent) => `<span class="oc-t">${a.title ? esc(a.title) : `<i>${a.kind === 'term' ? esc(a.program || 'terminal') : 'Ready'}</i>`}</span>`;
function rail(a: Agent, st: string, t: boolean) {
  const note = a.kind === 'chat' && a.note ? `<i class="oc-ic" title="${esc(`Note\n${noteFirst(a)}`)}">${NOTE_IC}</i>` : '';
  const bell = a.report ? `<i class="oc-ic" title="Notifying you\nA notification each time it's ready.">${ICONS.bell}</i>` : '';
  const cold = a.cacheOff && a.program === 'claude' && pref('cache:notice') ? `<i class="oc-ic oc-cold" title="No cache notices&#10;No notice comes before this chat's cache runs out. Turn it back on from its menu.">${icon('history')}<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5l11 11"/></svg></i>` : '';
  const status = st === 'working' ? workGem() : st === 'asks' ? '<i class="oc-dot" title="Needs you"></i>' : st === 'done' ? `<span class="oc-fin" title="Finished">${ICONS.check}</span>` : '';
  return `<div class="oc-icons"><span class="oc-sl">${note}</span><span class="oc-sl oc-sl-b">${bell}${cold}</span><span class="oc-sl oc-sl-m">${markSign(a)}</span><span class="oc-sl oc-sl-s" data-st="${st}">${status}</span>${slotEnd(a, t, st !== 'working')}</div>`;
}
const when = (a: Agent, t: boolean) => whenSpan(a, t);
const xBtn = (a: Agent) => `<button class="oc-x" data-dk-end="${esc(a.id)}" title="Close it\nIt asks where from. Shift+click closes without asking." aria-label="close it">${ICONS.x}</button>`;
const slotEnd = (a: Agent, t: boolean, time: boolean) => `<span class="oc-slot">${time ? when(a, t) : ''}${xBtn(a)}</span>`;
const subLine = (a: Agent, s: Sub, t: boolean) => `<div class="oc-sub" data-oc-sub="${esc(s.id)}" data-oc-of="${esc(a.id)}" role="button" tabindex="0" title="${esc(`${s.name}\nOpens Agent activity: every subagent of this chat.`)}">${slot('working')}<span class="n">${esc(s.name)}</span><span class="dk-tick" data-from="${s.start}">${t ? took(s) : ''}</span></div>`;
function subOne(a: Agent, s: Sub, t: boolean) {
  if (s.status === 'running') return subLine(a, s, t);
  const bad = s.status === 'failed';
  return `<div class="oc-sub fin" data-oc-sub="${esc(s.id)}" data-oc-of="${esc(a.id)}" role="button" tabindex="0" title="${esc(`${s.name}\nOpens Agent activity: every subagent of this chat.`)}">${bad ? `<i class="oc-sg" data-st="bad">${ICONS.wx}</i>` : slot('done')}<span class="n">${esc(s.name)}</span><span class="dk-tick" data-from="${s.start}">${t ? took(s) : ''}</span></div>`;
}
function finLine(a: Agent, subs: Sub[]) {
  const fin = subs.filter((s) => s.status !== 'running');
  if (!fin.length) return '';
  const bad = fin.filter((s) => s.status === 'failed').length;
  return `<div class="oc-sub fin" data-oc-sub="${esc(fin[0].id)}" data-oc-of="${esc(a.id)}" role="button" tabindex="0" title="Agent activity\nOpens every subagent of this chat.">${bad ? `<i class="oc-sg" data-st="bad">${ICONS.wx}</i>` : slot('done')}<span class="n">${fin.length} finished${bad ? `, ${bad} failed` : ''}</span></div>`;
}
function ticks(a: Agent, subs: Sub[]) {
  if (!subs.length) return '';
  const tone = (s: Sub) => (s.status === 'failed' ? 'bad' : s.status === 'running' ? 'run' : s.status === 'done' ? '' : 'stop');
  const bad = subs.filter((s) => s.status === 'failed').length;
  return `<span class="oc-ticks" data-oc-sub="${esc(subs[0].id)}" data-oc-of="${esc(a.id)}" title="${esc(`${subs.length} subagent${subs.length > 1 ? 's' : ''}${bad ? `, ${bad} failed` : ''}\nOpens Agent activity: every subagent of this chat.`)}">${subs.map((s) => `<i class="${tone(s)}"></i>`).join('')}</span>`;
}
const tip = (a: Agent) => (a.title ? ` title="${esc(a.title)}" data-tip-cut=".oc-t"` : '');

export function ocRow(a: Agent, c: RowCtx): Row {
  const st = stOf(a), subs = subsShown(c, a), here = a.id === c.cur ? ' here' : '';
  const ak = !c.calm && c.live && st === 'asks' && a.kind === 'chat' && a.ask && has(c, 'answer') && a.id !== c.cur ? `${a.id} ${a.ask.id}` : '';
  const open = `data-st="${st}" ${c.attr}="${esc(a.id)}"${tip(a)} role="button" tabindex="0"`;
  let build: (t: boolean) => string;
  if (c.calm) {
    const hint = st === 'asks' ? 'needs you' : '';
    build = () => `<div class="oc-row oc-line oc-calm${here}" ${open}>${slot(st)}${tool(c, a)}${code(c, a)}${topic(a)}${ticks(a, subs)}${hint ? `<span class="oc-hint">${hint}</span>` : ''}<span class="oc-ics">${markSign(a)}</span></div>`;
  } else {
    const tight = c.tight && st !== 'asks', run = subs.filter((s) => s.status === 'running');
    const cls = `oc-row oc-card${c.live ? ' live' : ''}${st === 'asks' ? ' asks' : ''}${tight ? ' tight' : ''}${here}`;
    build = (t) => {
      const eye = `<div class="oc-eye">${eyeLeft(c, a)}${rail(a, st, t)}</div>`;
      const tray = ak
        ? `<div class="oc-subs"><div class="dk-askslot" data-dk-ask="${esc(ak)}"></div></div>`
        : st === 'asks' || !subs.length
          ? ''
          : c.live
            ? (() => {
                const lines = run.map((s) => subLine(a, s, t)).join('') + (tight ? '' : finLine(a, subs));
                return lines ? `<div class="oc-subs">${lines}</div>` : '';
              })()
            : `<div class="oc-subs">${subs.length === 1 ? subOne(a, subs[0], t) : run.map((s) => subLine(a, s, t)).join('') + finLine(a, subs)}</div>`;
      return `<div class="${cls}" ${open}>${eye}${topic(a)}${tray}</div>`;
    };
  }
  const html = build(true), cmp = build(false);
  return { key: 'r:' + a.id, html, cmp, shape: '', text: '', at: a.at, a: ak ? a : null };
}

export const NEW_BTN = `<button class="oc-new" data-oc-new title="New chat&#10;Starts a new chat with an agent.&#10;&#10;Right-click to pick another agent, or to pin one.">+ agent</button>`;
export const ocHead = (k: string, label: string, n: number, add = false): Row => {
  const h = `<h4 class="dk-gh oc-gh" data-st="${k}"><b>${label}</b>${add ? NEW_BTN : `<span>${n}</span>`}</h4>`;
  return { key: 'h:' + k, html: h, cmp: h, shape: '', text: '', at: 0, a: null };
};

for (const l of ['orch', 'deck']) {
  const k = (x: string) => listKey(l, x);
  rowIcons({ [k('newBtn')]: () => gem('ai'), [k('folders')]: () => icon('folder'), [k('subs')]: () => icon('subs'), [k('code')]: () => '<b class="tb-tx">K</b>', [k('tools')]: () => TOOL_IC.claude, [k('wt')]: () => icon('branch'), [k('answer')]: () => icon('compose') });
}
const PICK_IC: Record<string, string> = { calm: ICONS.bars, detailed: icon('plan'), mine: icon('move'), latest: ICONS.history };
const choiceRows = (k: string): [string, string] => [String(PREFS[k].label), (PREFS[k].choices || []).map(([v, label, tip]) => `<button class="mi pick${pref(k) === v ? ' on' : ''}" data-op="${k}" data-ov="${esc(String(v))}" title="${esc(`${label}
${tip}`)}"><i class="tb-ic">${PICK_IC[String(v)] || ICONS.blank}</i><span class="mi-n">${esc(String(label).toLowerCase())}</span></button>`).join('')];
const subRow = (list: string) => {
  const k = listKey(list, 'subs'), e = PREFS[k];
  return pref('subagents:on') ? topRow(!!pref(k), `data-sl title="${esc(e.label)}&#10;${esc(e.desc || '')}"`, icon('subs'), esc(e.label)) : '';
};
const ROW_IC: Record<string, () => string> = { code: () => '<b class="tb-tx">K</b>', tools: () => TOOL_IC.claude, wt: () => icon('branch'), answer: () => icon('compose') };
export const rowListBands = (list: string) => ({
  options: Object.keys(ROW_IC).map((x) => {
    const k = listKey(list, x), e = PREFS[k];
    return topRow(!!pref(k), `data-lp="${k}" title="${esc(e.label)}&#10;${esc(e.desc || '')}"`, ROW_IC[x](), esc(e.label));
  }).join('') + subRow(list),
  pick: [choiceRows(listKey(list, 'look'))] as [string, string][],
});
export function rowListPick(list: string, b: HTMLElement): boolean {
  const { op, ov, lp } = b.dataset;
  if (op) return setPref(op, ov), true;
  if (lp) return setPref(lp, !pref(lp)), true;
  if (b.dataset.sl != null) return setPref(listKey(list, 'subs'), !pref(listKey(list, 'subs'))), true;
  return false;
}
type MenuMore = { only?: string[]; acts?: () => string; opts?: () => string; pick?: (b: HTMLElement) => unknown };
export function listMenu(list: string, sel: string, menu: string, more: MenuMore = {}) {
  const own = ['folders', 'newBtn', 'code', 'tools', 'wt', 'answer'].map((x) => listKey(list, x)).concat(more.only || []);
  barMenu(sel, menu, {
    order: false,
    skip: '.dk-ask',
    make: () => ({
      only: (k) => own.includes(k),
      acts: (foldersOn(list) ? miRow('data-cf-new', ICONS.newFolder, 'new folder') : '') + (more.acts?.() || ''),
      opts: subRow(list) + (more.opts?.() || ''),
      pick: [choiceRows(listKey(list, 'look')), choiceRows(listKey(list, 'sort'))],
      onPick: (b) => {
        if (rowListPick(list, b)) return;
        if (b.dataset.cfNew != null) return newFolder(list);
        return more.pick?.(b);
      },
    }),
  });
}

export const listPrefs = (list: string) => ['folders', 'newBtn', 'look', 'sort', 'code', 'tools', 'wt', 'answer', 'subs'].map((x) => listKey(list, x)).concat(['list:eyeOrder', 'subagents:on', 'marks:on', 'marks:names']);

const sortKeyOf = (list: string) => (list === 'orch' ? 'orch' : 'decklist') + ':placed:' + levelKey() + amKey;
const keyOf = (a: Agent) => a.session || a.id;
const placedAt = (key: string): string[] => {
  const v = store.get(key, []);
  return Array.isArray(v) ? v : [];
};
export function inListOrder(list: string, xs: Agent[], key = sortKeyOf(list)) {
  if (pref(listKey(list, 'sort')) === 'latest') return xs.sort((x, y) => (y.at || 0) - (x.at || 0));
  const rank = new Map(placedAt(key).map((s, i) => [s, i]));
  return xs.sort((x, y) => (rank.get(keyOf(x)) ?? -1) - (rank.get(keyOf(y)) ?? -1) || (y.at || 0) - (x.at || 0));
}
export const orchHas = (a: Agent, pid: string) => a.kind === 'chat' && (a.pid || '') === pid && !amElse(a);
export const orchChats = (pid: string) => inListOrder('orch', [...agents.all.values()].filter((a) => orchHas(a, pid)));

export function createChatList(o: ListOpts) {
  const { list, el, attr } = o, k = (x: string) => listKey(list, x);
  const sortKey = sortKeyOf(list);
  const placed = () => placedAt(sortKey);
  function learn() {
    const have = placed(), known = new Set(have);
    const fresh = [...agents.all.values()].filter((a) => o.mine(a) && !known.has(keyOf(a))).sort((x, y) => (y.at || 0) - (x.at || 0));
    if (fresh.length) store.set(sortKey, [...fresh.map(keyOf), ...have].slice(0, 400));
  }
  function ordered(xs: Agent[]) {
    return inListOrder(list, xs, sortKey);
  }
  function place(a: Agent, ref: string, after: boolean) {
    const r = agents.all.get(ref);
    if (!r || r.id === a.id) return;
    learn();
    const ks = placed().filter((x) => x !== keyOf(a)), i = ks.indexOf(keyOf(r));
    if (i < 0) return;
    ks.splice(after ? i + 1 : i, 0, keyOf(a));
    store.set(sortKey, ks);
    again();
  }
  const isLive = (a: Agent) => busyNow(a) || a.status === 'asks';
  function groups(): Group[] {
    const live: Agent[] = [], rest: Agent[] = [], bench: Agent[] = [];
    for (const a of agents.all.values()) {
      if (!o.mine(a)) continue;
      if (a.status !== 'asks' && o.benched?.(a)) bench.push(a);
      else (isLive(a) ? live : rest).push(a);
    }
    const asks = live.filter((a) => a.status === 'asks').sort((x, y) => (x.at || 0) - (y.at || 0));
    const out: Group[] = [{ k: 'working', label: 'Live', list: [...asks, ...ordered(live.filter((a) => a.status !== 'asks'))] }, { k: 'done', label: 'All', list: ordered(rest) }];
    if (o.benched) out.push({ k: 'bench', label: 'Benched', list: ordered(bench) });
    return out;
  }
  const again = () => (o.repaint ? o.repaint() : o.shown() && paint());
  el.addEventListener('contextmenu', (e) => {
    const nb = (e.target as HTMLElement).closest<HTMLElement>('[data-oc-new]');
    if (!nb || chatsOn().length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    const r = nb.getBoundingClientRect();
    agentMenu(r.left, r.bottom + 6, (p) => o.newChat(nb, p), '', 'chat:', false, { place: 'list' });
  }, true);
  const fh = folderHost(el, { list, attr, agentOf: (id) => agents.all.get(id), repaint: () => void again(), sort: { on: () => pref(k('sort')) !== 'latest', put: place } });
  sortable(el, {
    item: '[data-oc-part]',
    drop(all) {
      const seen = (all as HTMLElement[]).map((x) => x.dataset.ocPart || '').filter(Boolean);
      if (seen.length < 2) return;
      const cur = eyeOrder(), has = new Set(seen);
      let i = 0;
      const next = cur.map((p) => (has.has(p) ? seen[i++] : p));
      if (next.join() !== cur.join()) setPref('list:eyeOrder', next);
    },
  });
  const asks = answers((id) => o.open(id));
  const noneLeft = () => ([...agents.all.values()].some((a) => o.mine(a) && folderOf(list, a)) ? 'Every chat here is in a folded folder.' : '');

  function markHere() {
    const cur = o.cur();
    for (const r of el.querySelectorAll<HTMLElement>('.oc-row')) r.classList.toggle('here', r.getAttribute(attr) === cur);
  }
  function paint() {
    learn();
    const calm = pref(k('look')) === 'calm', tight = [...agents.all.values()].filter((a) => o.mine(a) && isLive(a) && !(a.status !== 'asks' && o.benched?.(a))).length > 3;
    el.dataset.look = calm ? 'calm' : 'detailed';
    let top = !!pref(k('newBtn'));
    const head = ({ k: g, label, list: xs }: Group) => {
      const r = ocHead(g, label, xs.length, top);
      top = false;
      return r;
    };
    const cur = o.cur();
    const row = (a: Agent, g: string) => ocRow(a, { list, attr, calm, tight, live: g === 'working', cur });
    const folded = noneLeft();
    const none = agents.why ? `<p class="dk-none err">${esc(agents.why)}</p>` : `<p class="dk-none">${agents.loaded ? (folded ? esc(folded) : o.none()) : 'Looking for chats…'}</p>`;
    const drawn = fh.paint(groups(), head, row, none, asks.card);
    asks.keep(new Set(drawn.rows.filter((r) => r.a).map((r) => `${r.a!.id} ${r.a!.ask!.id}`)));
    markHere();
  }

  function click(e: MouseEvent) {
    const t = e.target as HTMLElement;
    if (!el.contains(t) || t.closest('.dk-ask')) return false;
    const nb = t.closest<HTMLElement>('[data-oc-new]');
    if (nb) return o.newChat(nb), true;
    const ans = t.closest<HTMLElement>('[data-oc-ans]');
    if (ans) return o.open(ans.dataset.ocAns!), true;
    const sub = t.closest<HTMLElement>('[data-oc-sub]');
    if (sub) return o.sub(sub.dataset.ocOf!, sub.dataset.ocSub!), true;
    const rb = t.closest<HTMLElement>('[data-dk-mark], [data-dk-end]');
    if (rb) {
      const a = agents.all.get((rb.dataset.dkMark || rb.dataset.dkEnd)!);
      if (!a) return true;
      if (rb.dataset.dkEnd) return o.close(a, e.shiftKey), true;
      const at = rb.getBoundingClientRect();
      return o.mark(a, at.left, at.bottom + 4), true;
    }
    const r = t.closest<HTMLElement>(`[${attr}]`);
    if (r) return o.open(r.getAttribute(attr)!), true;
    return false;
  }
  function key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (!el.contains(t) || t.closest('.dk-ask') || (e.key !== 'Enter' && e.key !== ' ')) return false;
    const r = t.closest<HTMLElement>(`[${attr}]`), s = t.closest<HTMLElement>('[data-oc-sub]');
    if (!r && !s) return false;
    e.preventDefault();
    if (s) o.sub(s.dataset.ocOf!, s.dataset.ocSub!);
    else o.open(r!.getAttribute(attr)!);
    return true;
  }

  return { paint, markHere, click, key, groups, dragged: () => fh.dragged(), off: () => fh.off() };
}

export function snapDrag(e: PointerEvent, { grip, sizes, at, box, label, apply }: SnapOpts) {
  const list = [...new Set<number>(sizes)].sort((a, b) => a - b), lo = list[0], hi = list.at(-1)!, x0 = e.clientX;
  const near = (x: number) => list.reduce((p, s) => (Math.abs(s - x) < Math.abs(p - x) ? s : p));
  const out = Object.assign(document.createElement('div'), { className: 'rs-land dk-snap', innerHTML: '<b></b>' });
  const marks = list.map((s) => {
    const b = box(s);
    return Object.assign(document.createElement('div'), { className: 'dk-snap-at', style: `left:${b.edge}px;top:${b.top}px;height:${b.height}px` });
  });
  let w: number | null = null, held: number | null = null, past = 0;
  const show = (x: number) => {
    const b = box(x), n = near(x);
    out.style.cssText = `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;
    out.classList.toggle('zero', n === 0);
    out.firstChild!.textContent = label(n);
  };
  document.body.classList.add('resizing-x');
  return track(e, {
    capture: grip,
    esc: () => w !== null,
    move(ev) {
      if (w === null && Math.abs(ev.clientX - x0) < 3) return;
      if (w === null) {
        grip.classList.add('on');
        document.body.append(...marks, out);
      }
      const x = at(ev), n = near(x);
      past = x - hi;
      w = Math.abs(x - n) <= MAG ? n : Math.max(lo, Math.min(hi, x));
      const now = w === n ? n : null;
      out.classList.toggle('held', now !== null);
      if (now !== null && now !== held) {
        out.classList.remove('click');
        void out.offsetWidth;
        out.classList.add('click');
      }
      held = now;
      show(w);
    },
    end(ok) {
      for (const m of marks) m.remove();
      grip.classList.remove('on');
      document.body.classList.remove('resizing-x');
      if (w === null || !ok) return out.remove();
      const to = near(w);
      out.classList.add('settle', 'held');
      show(to);
      setTimeout(() => (out.remove(), apply(to, past)), 140);
    },
  });
}

export function hideDrag(e: PointerEvent, rail: HTMLElement, grip: HTMLElement, right: boolean, hide: () => void) {
  const r = rail.getBoundingClientRect();
  return snapDrag(e, {
    grip,
    sizes: [0, LIST_W],
    at: (ev) => (right ? ev.clientX - r.left : r.right - ev.clientX),
    box: (w) => ({ left: right ? r.left : r.right - Math.max(w, 6), top: r.top, width: Math.max(w, 6), height: r.height, edge: right ? r.left + w : r.right - w }),
    label: (w) => (w ? 'list' : 'hide the list'),
    apply: (w) => !w && hide(),
  });
}

export function showDrag(e: PointerEvent, grip: HTMLElement, dir: 'l' | 'r' | 'mid', show: () => void) {
  const r = grip.getBoundingClientRect(), edge = dir === 'r' ? r.left : dir === 'l' ? r.right : (r.left + r.right) / 2;
  return snapDrag(e, {
    grip,
    sizes: [0, LIST_W],
    at: (ev) => (dir === 'r' ? ev.clientX - edge : dir === 'l' ? edge - ev.clientX : Math.abs(ev.clientX - edge)),
    box: (w) => {
      const width = Math.max(w, 6);
      if (dir === 'r') return { left: edge, top: r.top, width, height: r.height, edge: edge + w };
      if (dir === 'l') return { left: edge - width, top: r.top, width, height: r.height, edge: edge - w };
      return { left: edge - width / 2, top: r.top, width, height: r.height, edge: edge + w / 2 };
    },
    label: (w) => (w ? 'list' : 'hide the list'),
    apply: (w) => w && show(),
  });
}
