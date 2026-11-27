import { atWs, levelKey } from '../base/model.ts';
import { onSize } from '../base/measure.ts';
import { onOutside } from '../base/lift.ts';
import { $, amKey, store } from '../base/util.ts';

export type SlotView = { kind: string; ref: string; html: string; shown: boolean; g?: string; name?: string };
type Spots = Record<string, number>;
export type Side = 'rail' | 'dash';
export type Spot = { s: number; side: Side };

export const PITCH = 32;
const viewKey = () => `switch:rail:${levelKey()}${amKey}`;
const BTN_KEY = `switch:rail${amKey}`;
const dashViewKey = () => `switch:dash:${levelKey()}${amKey}`;
const DASH_KEY = `switch:dash${amKey}`;
const isBtn = (ref: string) => ref.startsWith('btn:') || ref.startsWith('pin:');
const isPin = (ref: string) => ref.startsWith('pin:');
const BTN_AT: Spots = { 'btn:index': 0, 'btn:newchat': 5, 'btn:git': 9, 'btn:github': 10, 'btn:setup': -1, 'btn:qpwsh': -3, 'btn:qterm': -4, 'btn:scratch': -5, 'pin:folder': -6, 'pin:txt': -7, 'pin:md': -8, 'pin:file': -9, 'btn:more': -10 };
const VIEW_AT: Spots = { editor: 2, orch: 3 };
const DASH_AT: Spots = { 'btn:newchat': -1 };
const spots = (): Spots => ({ ...store.get(BTN_KEY, BTN_AT), ...store.get(viewKey(), {}) });
const dashSpots = (): Spots => ({ ...store.get(DASH_KEY, DASH_AT), ...store.get(dashViewKey(), {}) });
const part = (at: Spots, b: boolean) => Object.fromEntries(Object.entries(at).filter(([r]) => isBtn(r) === b));
function save(at: Spots) {
  store.set(BTN_KEY, part(at, true));
  store.set(viewKey(), part(at, false));
}
function saveDash(at: Spots) {
  store.set(DASH_KEY, part(at, true));
  store.set(dashViewKey(), part(at, false));
}
const kindOf = (ref: string) => ref.slice(0, ref.indexOf(':'));
export const baseOf = (ref: string) => ref.split('~')[0];
export const isCopy = (ref: string) => ref.includes('~');
const COPYABLE = ['btn:qterm', 'btn:qpwsh', 'btn:qagent', 'btn:inbox', 'btn:sketch', 'btn:scratch', 'btn:more', 'btn:newchat', 'btn:win', 'btn:pins', 'btn:ue', 'btn:uewin'];
export const copyable = (ref: string) => COPYABLE.includes(baseOf(ref)) || kindOf(ref) === 'orch';
const copyRefs = () => [...new Set([...Object.keys(spots()), ...Object.keys(dashSpots())])].filter(isCopy);
export function withCopies(all: SlotView[]) {
  const out = [...all];
  for (const r of copyRefs()) {
    const b = all.find((v) => v.ref === baseOf(r));
    if (b && copyable(r)) out.push({ ...b, ref: r });
  }
  return out;
}
export const placedOf = (base: string) => [base, ...copyRefs().filter((r) => baseOf(r) === base)].filter((r) => Number.isInteger(spots()[r]) || Number.isInteger(dashSpots()[r]));
export function newCopy(base: string) {
  const used = new Set(copyRefs());
  let n = 2;
  while (used.has(`${base}~${n}`)) n++;
  return `${base}~${n}`;
}
export function dropCopy(ref: string) {
  const R = spots(), D = dashSpots(), base = baseOf(ref);
  if (ref === base) {
    const c = copyRefs().find((r) => baseOf(r) === base && (Number.isInteger(R[r]) || Number.isInteger(D[r])));
    if (!c) return false;
    const [from, other] = Number.isInteger(D[c]) ? [D, R] : [R, D];
    from[base] = from[c];
    delete other[base];
    delete from[c];
  } else {
    delete R[ref];
    delete D[ref];
  }
  save(R);
  saveDash(D);
  return true;
}
export const inDash = (ref: string) => Number.isInteger(dashSpots()[ref]);
export const dashSpot = (ref: string): number | null => (Number.isInteger(dashSpots()[ref]) ? dashSpots()[ref] : null);

const RAIL: [string, string, 't' | 'b', string][] = [
  ['btn:index', '#btn-index', 't', 'strip'],
  ['btn:git', '#btn-git', 't', 'strip'],
  ['btn:github', '#btn-github', 't', 'strip'],
  ['btn:setup', '#btn-setup', 't', 'strip'],
  ['btn:site', '#btn-site', 'b', 'strip'],
  ['btn:win', '#btn-win', 'b', 'win'],
  ['btn:pins', '#btn-pins', 'b', 'win'],
  ['btn:ue', '#btn-ue', 'b', 'ue'],
  ['btn:uewin', '#btn-uewin', 'b', 'ue'],
  ['btn:inbox', '#btn-inbox', 'b', 'quick'],
  ['btn:qagent', '#btn-qagent', 'b', 'quick'],
  ['btn:qpwsh', '#btn-qpwsh', 'b', 'quick'],
  ['btn:qterm', '#btn-qterm', 'b', 'quick'],
  ['btn:sketch', '#btn-sketch', 'b', 'quick'],
  ['btn:scratch', '#btn-scratch', 'b', 'quick'],
  ['btn:more', '#btn-more', 'b', 'make'],
  ['btn:newchat', '#btn-newchat', 'b', 'agent'],
];
const WS_BTNS = ['btn:index', 'btn:site', 'btn:win', 'btn:ue', 'btn:uewin'];
export const refOfSel = (sel: string) => RAIL.find((x) => x[1] === sel)?.[0] || '';
export const railSel = (ref: string) => RAIL.find((x) => x[0] === baseOf(ref))?.[1] || '';
const elOf = (ref: string) => $<HTMLElement>(railSel(ref));
type Pins = { views: () => SlotView[]; groups: () => string[][] };
let pins: Pins = { views: () => [], groups: () => [] };
export const usePins = (p: Pins) => (pins = p);
export function btnShown(ref: string) {
  ref = baseOf(ref);
  if (isPin(ref)) return !!pins.views().find((v) => v.ref === ref)?.shown;
  if (atWs() && !WS_BTNS.includes(ref)) return false;
  const el = elOf(ref);
  return !el.hidden && !el.classList.contains('off');
}
const btnView = ([ref, , , g]: (typeof RAIL)[number]): SlotView => ({ kind: 'btn', ref, html: '', shown: btnShown(ref), g });
const railViews = (end: 't' | 'b'): SlotView[] => RAIL.filter((x) => x[2] === end).map(btnView);
const dashPos = (s: number) => (s < 0 ? `right:${local(s) * PITCH}px` : `left:${s * PITCH}px`);
export const topBtns = () => railViews('t');
export function bottomBtns() {
  const b = railViews('b'), at = b.findIndex((v) => v.ref === 'btn:more');
  b.splice(at < 0 ? b.length : at, 0, ...pins.views());
  return b;
}
const endOf = (ref: string) => (isPin(ref) ? 'b' : RAIL.find((x) => x[0] === baseOf(ref))?.[2] || 't');

const spans: Record<string, [number, number]> = {};
export const setSpan = (ref: string, n: number, rail = 1) => (n <= 1 && rail <= 1 ? delete spans[baseOf(ref)] : (spans[baseOf(ref)] = [n, rail]));
const spanOf = (ref: string, x = false) => spans[baseOf(ref)]?.[x ? 0 : 1] || 1;
const local = (s: number) => (s < 0 ? -s - 1 : s);
const spotOf = (e: string, i: number) => (e === 'b' ? -i - 1 : i);
const cellKeys = (r: string, s: number, x = false) => Array.from({ length: spanOf(r, x) }, (_, k) => (s < 0 ? 'b' : 't') + (local(s) + k));
const fits = (taken: Map<string, string>, r: string, s: number, x = false) => Number.isInteger(s) && cellKeys(r, s, x).every((c) => !taken.has(c));
function occupied(at: Spots, refs: string[], x = false) {
  const m = new Map<string, string>();
  for (const r of refs) if (Number.isInteger(at[r])) for (const c of cellKeys(r, at[r], x)) m.set(c, r);
  return m;
}
const overlap = (a: string, sa: number, b: string, sb: number, x = false) => cellKeys(a, sa, x).some((c) => cellKeys(b, sb, x).includes(c));
function freeFrom(taken: Map<string, string>, r: string, e: string, from: number, ok = (s: number) => fits(taken, r, s)) {
  let i = Math.max(0, from);
  while (!ok(spotOf(e, i))) i++;
  return spotOf(e, i);
}
export const absCells = (r: string, s: number, n: number, x = false) => Array.from({ length: spanOf(r, x) }, (_, k) => (s < 0 ? n - 1 - local(s) - k : s + k));

let aimed: { kind: string; slot: number | null; side: Side } | null = null;
export const aim = (kind: string, slot: number | null, side: Side = 'rail') => (aimed = { kind, slot, side });

let cells = 0, dashCells = -1;
const railN = () => cells || Math.max(1, Math.floor($('#switch').clientHeight / PITCH));
const dashN = () => (dashCells >= 0 ? dashCells : (dashCells = Math.floor(($('#dash > .slots') as HTMLElement).clientWidth / PITCH)));
type Surf = { side: Side; get: () => Spots; put: (at: Spots) => void; n: () => number; last: Map<number, string>; el: () => HTMLElement; x: boolean; seen: Set<string>; seenAt: string; fold: boolean; off: () => void; size: number; struct: string; html: Map<string, string> };
const RAIL_S: Surf = { side: 'rail', get: spots, put: save, n: railN, last: new Map(), el: () => $<HTMLElement>('#switch'), x: false, seen: new Set(), seenAt: '', fold: false, off: () => {}, size: 0, struct: '', html: new Map() };
const DASH_S: Surf = { side: 'dash', get: dashSpots, put: saveDash, n: dashN, last: new Map(), el: () => $<HTMLElement>('#dash > .slots'), x: true, seen: new Set(), seenAt: '', fold: false, off: () => {}, size: 0, struct: '', html: new Map() };
const SURFS = [RAIL_S, DASH_S];
const surf = (side: Side) => (side === 'dash' ? DASH_S : RAIL_S);
const onRail = (r: string, s: number, n: number, x = false) => absCells(r, s, n, x).filter((c) => c >= 0 && c < n);
function board(n: number, x = false) {
  const keys = new Map<string, string>(), abs = new Set<number>();
  const keyFree = (r: string, s: number) => fits(keys, r, s, x);
  return {
    keys,
    keyFree,
    free: (r: string, s: number) => keyFree(r, s) && onRail(r, s, n, x).every((c) => !abs.has(c)),
    take(r: string, s: number) {
      for (const c of cellKeys(r, s, x)) keys.set(c, r);
      for (const c of onRail(r, s, n, x)) abs.add(c);
    },
  };
}
type Board = ReturnType<typeof board>;
const spotOfCell = (c: number, span: number, n: number) => (c < n / 2 ? c : -(n - c - span) - 1);
function nearestFree(bd: Board, r: string, s: number, n: number, x = false) {
  const span = spanOf(r, x), c0 = Math.min(n - span, Math.max(0, Math.min(...absCells(r, s, n, x))));
  for (let d = 0; d < n; d++) for (const c of d ? [c0 - d, c0 + d] : [c0]) {
    if (c < 0 || c > n - span) continue;
    const t = spotOfCell(c, span, n);
    if (bd.free(r, t)) return t;
  }
  return null;
}
function migrate(at: Spots) {
  if (!('btn:quick' in at)) return false;
  const s = at['btn:quick'];
  delete at['btn:quick'];
  if (!Number.isInteger(s) || Object.keys(at).some(isPin)) return true;
  for (const g of pins.groups()) g.forEach((k, i) => (at[`pin:${k}`] = s < 0 ? -(local(s) + g.length - 1 - i) - 1 : s + i));
  return true;
}

export function placeAll(views: SlotView[], dry = false, sf: Surf = RAIL_S): { at: Spots; first: boolean; fresh: string[] } {
  const rail = sf === RAIL_S, first = rail && store.get(viewKey(), null) == null, had = sf.get(), at: Spots = { ...had }, refs = views.map((v) => v.ref), known = new Set(refs), n = sf.n();
  const was = rail && migrate(at);
  if (first) for (const [k, s] of Object.entries(VIEW_AT)) {
    const r = views.find((v) => v.kind === k)?.ref;
    if (r && !(r in at)) at[r] = s;
  }
  if (!dry && sf.seenAt !== viewKey()) (sf.seen = new Set()), (sf.seenAt = viewKey());
  const boot = dry || !sf.seen.size, shown = views.filter((v) => v.shown).map((v) => v.ref);
  const pri = (rs: string[]) => [...rs.filter(isBtn), ...rs.filter((r) => !isBtn(r))];
  const bd = board(n, sf.x), fresh: string[] = [];
  const keep = (r: string) => !first || !isBtn(r);
  for (const r of pri(shown.filter((r) => boot || sf.seen.has(r)))) {
    if (bd.keyFree(r, at[r])) bd.take(r, at[r]);
    else delete at[r];
  }
  for (const r of pri(shown.filter((r) => !boot && !sf.seen.has(r)))) {
    if (!Number.isInteger(at[r])) continue;
    if (bd.free(r, at[r])) {
      bd.take(r, at[r]);
      continue;
    }
    const s = nearestFree(bd, r, at[r], n, sf.x);
    if (s == null) delete at[r];
    else {
      at[r] = s;
      bd.take(r, s);
      if (keep(r)) fresh.push(r);
    }
  }
  views.forEach((v, p) => {
    const r = v.ref;
    if (r in at || !v.shown) return;
    const e = endOf(r);
    let from = 0;
    for (let q = p - 1; q >= 0; q--) {
      const o = refs[q];
      if (Number.isInteger(at[o]) && (at[o] < 0) === (e === 'b')) {
        from = local(at[o]) + spanOf(o, sf.x);
        break;
      }
    }
    let s = freeFrom(bd.keys, r, e, from, (t) => bd.free(r, t));
    if (!dry && aimed && aimed.side === sf.side && aimed.kind === kindOf(r)) {
      if (aimed.slot != null && bd.free(r, aimed.slot)) s = aimed.slot;
      aimed = null;
    }
    for (const [o, q] of Object.entries(at)) if (!known.has(o) && overlap(o, q, r, s, sf.x)) delete at[o];
    at[r] = s;
    bd.take(r, s);
    if (keep(r)) fresh.push(r);
  });
  if (!dry) sf.seen = new Set(shown);
  if (!dry && (first || was || fresh.length || refs.some((r) => had[r] !== at[r]))) sf.put(at);
  return { at, first, fresh };
}

function landAim(all: SlotView[]) {
  if (!aimed || aimed.side !== 'dash') return;
  const R = spots(), D = dashSpots(), k = aimed.kind;
  const v = all.findLast((x) => x.shown && kindOf(x.ref) === k && !(x.ref in R) && !(x.ref in D));
  if (!v) return;
  if (aimed.slot != null) {
    D[v.ref] = aimed.slot;
    saveDash(D);
  }
  aimed = null;
}
export function placeBoth(all: SlotView[]) {
  landAim(all);
  const d = dashSpots(), dash = all.filter((v) => Number.isInteger(d[v.ref])), rail = all.filter((v) => !Number.isInteger(d[v.ref]));
  const r = placeAll(rail);
  const dd = DASH_S.n() > 0 ? placeAll(dash, false, DASH_S) : { at: d, fresh: [] as string[] };
  return { at: r.at, first: r.first, fresh: [...r.fresh, ...dd.fresh], rail, dash, dashAt: dd.at };
}
export function orderAt() {
  const o: Record<string, number> = {};
  for (const [k, s] of Object.entries(spots())) if (Number.isInteger(s)) o[k] = s < 0 ? 1e6 + s : s;
  for (const [k, s] of Object.entries(dashSpots())) if (Number.isInteger(s)) o[k] = -1e7 + (s < 0 ? 5e5 - local(s) : s);
  return o;
}

export function picHtml(views: SlotView[], fill: (v: SlotView) => string) {
  const all = views.filter((v) => !inDash(v.ref)).map((v) => ({ ...v, shown: true, html: fill(v) })).filter((v) => v.html), { at } = placeAll(all, true);
  let top = 0, bot = 0;
  for (const v of all) {
    const s = at[v.ref];
    if (!Number.isInteger(s)) continue;
    if (s < 0) bot = Math.max(bot, local(s) + spanOf(v.ref));
    else top = Math.max(top, local(s) + spanOf(v.ref));
  }
  const n = Math.max(cells, top + bot);
  return `<nav id="activity" class="hr-rail" style="height:${n * PITCH}px"><div id="switch" class="slots">${all.filter((v) => Number.isInteger(at[v.ref])).map((v) => navOf(v, posOf(at[v.ref]))).join('')}</div></nav>`;
}
export function dashPicHtml(views: SlotView[], fill: (v: SlotView) => string) {
  const d = dashSpots(), all = views.filter((v) => Number.isInteger(d[v.ref])).map((v) => ({ ...v, shown: true, html: fill(v) })).filter((v) => v.html);
  let l = 0, r = 0;
  for (const v of all) d[v.ref] < 0 ? (r = Math.max(r, local(d[v.ref]) + spanOf(v.ref, true))) : (l = Math.max(l, d[v.ref] + spanOf(v.ref, true)));
  return `<header id="dash" class="hr-dash" style="width:${Math.max(7, l + r + 1) * PITCH}px"><div class="slots">${all.map((v) => navOf(v, dashPos(d[v.ref]), true)).join('')}</div></header>`;
}

export function moveRef(ref: string, slot: number, refs: string[], shown = refs, side: Side = 'rail') {
  const R = spots(), D = dashSpots();
  migrate(R);
  const inD = (r: string) => Number.isInteger(D[r]);
  const src = inD(ref) ? DASH_S : RAIL_S, dst = surf(side), sAt = src === DASH_S ? D : R, at = dst === DASH_S ? D : R;
  const was = sAt[ref], same = src === dst, x = dst.x;
  if (same && was === slot) return false;
  const n = dst.n(), mine = shown.filter((r) => r !== ref && inD(r) === (dst === DASH_S));
  for (const [o, q] of Object.entries(at)) if (!refs.includes(o) && overlap(o, q, ref, slot, x)) delete at[o];
  const cs = onRail(ref, slot, n, x);
  const hit = mine.filter((r) => Number.isInteger(at[r]) && (overlap(r, at[r], ref, slot, x) || onRail(r, at[r], n, x).some((c) => cs.includes(c))));
  const from: Spots = Object.fromEntries(hit.map((r) => [r, at[r]]));
  if (!same) delete sAt[ref];
  at[ref] = slot;
  const bd = board(n, x);
  bd.take(ref, slot);
  for (const r of mine) if (!hit.includes(r) && Number.isInteger(at[r])) bd.take(r, at[r]);
  hit.forEach((r, i) => {
    if (!same && !i && Number.isInteger(was)) {
      delete at[r];
      sAt[r] = was;
      return;
    }
    const s = same && Number.isInteger(was) && bd.free(r, was) ? was : nearestFree(bd, r, from[r], n, x);
    if (s == null) delete at[r];
    else {
      at[r] = s;
      bd.take(r, s);
    }
  });
  save(R);
  saveDash(D);
  return true;
}

export function placeAt(ref: string, slot: number, refs: string[], shown: string[], side: Side) {
  const R = spots(), D = dashSpots();
  migrate(R);
  const dst = surf(side), sAt = dst === DASH_S ? R : D, at = dst === DASH_S ? D : R, x = dst.x;
  const n = dst.n(), mine = shown.filter((r) => r !== ref && Number.isInteger(D[r]) === (dst === DASH_S));
  const bd = board(n, x);
  for (const r of mine) if (Number.isInteger(at[r])) bd.take(r, at[r]);
  const target = bd.free(ref, slot) ? slot : nearestFree(bd, ref, slot, n, x);
  if (target == null) return false;
  delete sAt[ref];
  for (const [o, q] of Object.entries(at)) if (!refs.includes(o) && overlap(o, q, ref, target, x)) delete at[o];
  at[ref] = target;
  save(R);
  saveDash(D);
  return true;
}

const spotAt = (c: number, n: number) => (c < n / 2 ? c : -(n - 1 - c) - 1);
export function freeNear(ref: string, refs: string[]): Spot | null {
  const sf = inDash(ref) ? DASH_S : RAIL_S, at = sf.get(), s = at[ref];
  if (!Number.isInteger(s)) return null;
  const D = dashSpots(), mine = refs.filter((r) => Number.isInteger(D[r]) === (sf === DASH_S));
  return { s: freeFrom(occupied(at, mine, sf.x), '?', s < 0 ? 'b' : 't', local(s) + spanOf(ref, sf.x), (t) => fits(occupied(at, mine, sf.x), '?', t, sf.x)), side: sf.side };
}
export function freeAt(p: number, side: Side = 'rail'): Spot | null {
  const sf = surf(side), c = nearest(sf, p);
  return c == null || sf.last.has(c) ? null : { s: spotAt(c, sf.x ? sf.n() : cells), side };
}
function nearest(sf: Surf, p: number) {
  let best: number | null = null, d = Infinity;
  for (const b of sf.el().querySelectorAll<HTMLElement>(':scope > .sl-box')) {
    const r = b.getBoundingClientRect(), m = Math.abs((sf.x ? r.left + r.width / 2 : r.top + r.height / 2) - p);
    if (m < d) (d = m), (best = +b.dataset.i!);
  }
  return best;
}

const FOLD = ['btn:pins', 'btn:win', 'btn:scratch', 'btn:sketch', 'btn:qterm', 'btn:qpwsh', 'btn:qagent', 'btn:inbox', 'btn:quick', 'btn:more', 'btn:uewin', 'btn:ue', 'orch', 'btn:newchat', 'term', 'editor', 'btn:setup', 'btn:github', 'btn:git', 'btn:index', 'btn:site'];
function fit(views: SlotView[], at: Spots, n: number, x = false) {
  const rank = new Map(views.map((v, p) => {
    const i = FOLD.indexOf(isPin(v.ref) ? 'btn:quick' : isBtn(v.ref) ? baseOf(v.ref) : v.kind);
    return [v.ref, (i < 0 ? FOLD.length : i) * 1000 + (999 - (p % 1000))];
  }));
  const live = new Map(views.map((v) => [v.ref, absCells(v.ref, at[v.ref], n, x)]));
  const folded: string[] = [];
  const low = (refs: string[]) => refs.reduce((a, b) => (rank.get(b)! < rank.get(a)! ? b : a));
  for (;;) {
    const count = new Map<number, number>();
    for (const cs of live.values()) for (const c of cs) count.set(c, (count.get(c) || 0) + 1);
    const bad = [...live].filter(([, cs]) => cs.some((c) => c < 0 || c >= n || count.get(c)! > 1)).map(([r]) => r);
    const free = Array.from({ length: n }, (_, c) => c).filter((c) => !count.has(c));
    if (!bad.length && (!folded.length || free.length)) return { live, folded: folded.sort((a, b) => rank.get(a)! - rank.get(b)!), more: folded.length ? free[free.length - 1] : null };
    const pick = low(bad.length ? bad : [...live.keys()]);
    live.delete(pick);
    folded.push(pick);
  }
}

const posOf = (s: number, x = false) => (s < 0 ? `${x ? 'right' : 'bottom'}:${local(s) * PITCH}px` : `${x ? 'left' : 'top'}:${s * PITCH}px`);
const navOf = (v: SlotView, style: string, x = false) => {
  const span = spanOf(v.ref, x), cls = v.kind === 'btn' ? 'sv sb' : 'sets sv';
  return `<nav class="${cls}" data-kind="${v.kind}" data-ref="${v.ref}"${v.g ? ` data-g="${v.g}"` : ''}${span > 1 ? ` data-span="${span}"` : ''} style="${style}${span > 1 ? `;--span:${span}` : ''}" aria-label="${v.kind === 'btn' ? v.ref.slice(4) : v.kind}">${v.html}</nav>`;
};

export function slotHtml(views: SlotView[], at: Spots, side: Side = 'rail') {
  const sf = surf(side), x = sf.x;
  if (!x && !cells) cells = Math.floor($('#switch').clientHeight / PITCH);
  const shown = views.filter((v) => v.shown && Number.isInteger(at[v.ref])), n = Math.max(x ? sf.n() : cells, 1);
  const { live, folded, more } = fit(shown, at, n, x);
  const [A, B] = x ? ['left', 'right'] : ['top', 'bottom'];
  sf.last.clear();
  for (const [r, cs] of live) for (const c of cs) sf.last.set(c, r);
  if (more != null) sf.last.set(more, 'btn:fold');
  const low = (r: string | undefined) => (r && live.has(r) ? Math.max(...live.get(r)!) >= n / 2 : false);
  const boxPos = (c: number) => {
    const r = sf.last.get(c);
    return (r && r !== 'btn:fold' ? low(r) : c >= n / 2) ? `${B}:${(n - 1 - c) * PITCH + 3}px` : `${A}:${c * PITCH + 3}px`;
  };
  const navPos = (r: string) => {
    const cs = live.get(r)!;
    return low(r) ? `${B}:${(n - 1 - Math.max(...cs)) * PITCH}px` : `${A}:${Math.min(...cs) * PITCH}px`;
  };
  const boxes = Array.from({ length: n }, (_, c) => `<i class="sl-box" data-i="${c}" style="${boxPos(c)}"></i>`).join('');
  const navs = shown.filter((v) => live.has(v.ref)).map((v) => navOf(v, navPos(v.ref), x)).join('');
  const byRank = folded.map((r) => shown.find((v) => v.ref === r)!);
  const where = x ? 'dashboard. Make the window wider' : 'rail. Make the window taller';
  const fold = more == null ? '' : `<nav class="sv sb rf-at" data-kind="btn" data-ref="btn:fold" style="${posOf(spotAt(more, n), x)}" aria-label="more"><button id="${x ? 'btn-dfold' : 'btn-fold'}" class="rf-btn${sf.fold ? ' on' : ''}" title="More&#10;The buttons that don't fit in the ${where} to see them in it." aria-label="more of the ${x ? 'dashboard' : 'rail'}" aria-expanded="${sf.fold}">⋯</button></nav><div class="rf-box"${sf.fold ? '' : ' hidden'}>${byRank.map((v) => navOf(v, '', x)).join('')}</div>`;
  if (more == null) sf.fold = false;
  return boxes + navs + fold;
}

export function paintSlots(sw: HTMLElement, views: SlotView[], at: Spots, side: Side = 'rail', force = false) {
  const sf = surf(side), x = sf.x;
  if (!x && !cells) cells = Math.floor($('#switch').clientHeight / PITCH);
  const shown = views.filter((v) => v.shown && Number.isInteger(at[v.ref])), n = Math.max(x ? sf.n() : cells, 1);
  const { live, folded, more } = fit(shown, at, n, x);
  const [A, B] = x ? ['left', 'right'] : ['top', 'bottom'];
  sf.last.clear();
  for (const [r, cs] of live) for (const c of cs) sf.last.set(c, r);
  if (more != null) sf.last.set(more, 'btn:fold');
  const low = (r: string | undefined) => (r && live.has(r) ? Math.max(...live.get(r)!) >= n / 2 : false);
  const boxPos = (c: number) => {
    const r = sf.last.get(c);
    return (r && r !== 'btn:fold' ? low(r) : c >= n / 2) ? `${B}:${(n - 1 - c) * PITCH + 3}px` : `${A}:${c * PITCH + 3}px`;
  };
  const navPos = (r: string) => {
    const cs = live.get(r)!;
    return low(r) ? `${B}:${(n - 1 - Math.max(...cs)) * PITCH}px` : `${A}:${Math.min(...cs) * PITCH}px`;
  };
  if (more == null) sf.fold = false;
  const struct = `${n}|${more ?? ''}|${sf.fold ? 1 : 0}|${shown.filter((v) => live.has(v.ref)).map((v) => `${v.ref}:${navPos(v.ref)}:${spanOf(v.ref, x)}:${v.g || ''}`).join(',')}|${folded.join(',')}`;
  if (!force && sf.struct === struct && sw.childElementCount) {
    for (const v of shown) {
      if (!v.html || sf.html.get(v.ref) === v.html) continue;
      const el = sw.querySelector<HTMLElement>(`.sv[data-ref="${CSS.escape(v.ref)}"]`);
      if (el) el.innerHTML = v.html;
      sf.html.set(v.ref, v.html);
    }
    return false;
  }
  const boxes = Array.from({ length: n }, (_, c) => `<i class="sl-box" data-i="${c}" style="${boxPos(c)}"></i>`).join('');
  const navs = shown.filter((v) => live.has(v.ref)).map((v) => navOf(v, navPos(v.ref), x)).join('');
  const byRank = folded.map((r) => shown.find((v) => v.ref === r)!);
  const where = x ? 'dashboard. Make the window wider' : 'rail. Make the window taller';
  const fold = more == null ? '' : `<nav class="sv sb rf-at" data-kind="btn" data-ref="btn:fold" style="${posOf(spotAt(more, n), x)}" aria-label="more"><button id="${x ? 'btn-dfold' : 'btn-fold'}" class="rf-btn${sf.fold ? ' on' : ''}" title="More&#10;The buttons that don't fit in the ${where} to see them in it." aria-label="more of the ${x ? 'dashboard' : 'rail'}" aria-expanded="${sf.fold}">⋯</button></nav><div class="rf-box"${sf.fold ? '' : ' hidden'}>${byRank.map((v) => navOf(v, '', x)).join('')}</div>`;
  sf.struct = struct;
  sf.html = new Map(shown.filter((v) => v.html).map((v) => [v.ref, v.html]));
  pullBtns(sw);
  sw.innerHTML = boxes + navs + fold;
  homeBtns(RAIL_S.el());
  return true;
}

const home = () => $('#rail-home');
export function pullBtns(sw: HTMLElement) {
  for (const [, sel] of RAIL) {
    const el = $<HTMLElement>(sel);
    if (sw.contains(el)) home().append(el);
  }
}
export function homeBtns(sw: HTMLElement) {
  for (const [ref, sel] of RAIL) {
    const el = $<HTMLElement>(sel), at = sw.querySelector<HTMLElement>(`.sv[data-ref="${ref}"]`) || DASH_S.el().querySelector<HTMLElement>(`.sv[data-ref="${ref}"]`) || home();
    if (el.parentNode !== at) at.append(el);
  }
  SURFS.forEach(placeFold);
  homed();
}
let homed = () => {};
export const onHomed = (f: () => void) => (homed = f);

function placeFold(sf: Surf) {
  const sw = sf.el(), box = sw.querySelector<HTMLElement>('.rf-box'), b = sw.querySelector<HTMLElement>('.rf-btn');
  if (!box || !b || box.hidden) return;
  const r = b.getBoundingClientRect();
  if (sf.x) {
    const w = box.offsetWidth, l = r.left + r.width / 2 < innerWidth / 2 ? r.left : r.right - w;
    box.style.bottom = '';
    box.style.top = $('#dash').getBoundingClientRect().bottom + 6 + 'px';
    box.style.left = Math.max(8, Math.min(l, innerWidth - w - 8)) + 'px';
    return;
  }
  const a = $('#activity').getBoundingClientRect();
  box.style.top = '';
  box.style.left = ($('#app').classList.contains('rail-right') ? a.left - 6 - box.offsetWidth : a.right + 6) + 'px';
  box.style.bottom = Math.max(8, innerHeight - r.bottom - 3) + 'px';
}
function setFold(sf: Surf, on: boolean) {
  sf.fold = on;
  const sw = sf.el(), box = sw.querySelector<HTMLElement>('.rf-box'), b = sw.querySelector<HTMLElement>('.rf-btn');
  if (box) box.hidden = !on;
  b?.classList.toggle('on', on);
  b?.setAttribute('aria-expanded', String(on));
  sf.off();
  sf.off = () => {};
  if (!on) return;
  placeFold(sf);
  const id = sf.x ? '#dash > .slots' : '#switch';
  sf.off = onOutside([`${id} .rf-box`, `${id} .rf-btn`, '#colormenu'], () => setFold(sf, false), { esc: true });
}
export function watchFold() {
  for (const sf of SURFS) sf.el().addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('.rf-btn')) return setFold(sf, !sf.fold);
    if (t.closest('.rf-box') && t.closest('button, a')) setTimeout(() => setFold(sf, false));
  });
}

export function watchSlots(sw: HTMLElement, repaint: () => void) {
  onSize(sw, {
    name: 'switch.slots',
    live: true,
    write: (_, [e]) => {
      const n = Math.max(1, Math.floor(e.contentBoxSize[0].blockSize / PITCH));
      if (n === cells) return;
      cells = n;
      repaint();
    },
  });
  onSize(DASH_S.el(), {
    name: 'dash.slots',
    live: true,
    write: (_, [e]) => {
      const n = Math.floor(e.contentBoxSize[0].inlineSize / PITCH);
      dashCells = n;
      if (n === DASH_S.size) return;
      DASH_S.size = n;
      repaint();
    },
  });
  let sig = '';
  again = () => requestAnimationFrame(repaint);
  const now = () => RAIL.map(([r]) => +btnShown(r)).join('');
  const look = new MutationObserver(() => {
    const s = now();
    if (s !== sig) (sig = s), requestAnimationFrame(repaint);
  });
  for (const [, sel] of RAIL) look.observe($(sel), { attributes: true, attributeFilter: ['class', 'hidden'] });
  sig = now();
}
export const railCells = () => cells;
let again = () => {};
export const railChanged = () => again();
export const dragging = () => SURFS.some((s) => s.el().classList.contains('dragging'));

let eat = false;
addEventListener('click', (e) => {
  if (!eat) return;
  eat = false;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

const shownEl = (el: HTMLElement) => el.getClientRects().length > 0;
const dist = (r: DOMRect, x: number, y: number) => Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
function surfAt(x: number, y: number) {
  const d = DASH_S.el(), a = RAIL_S.el();
  if (!shownEl(d)) return RAIL_S;
  if (!shownEl(a)) return DASH_S;
  return dist(d.getBoundingClientRect(), x, y) < dist($('#activity').getBoundingClientRect(), x, y) ? DASH_S : RAIL_S;
}
function drag(e: PointerEvent, src: HTMLElement, done: (sf: Surf, cell: number) => void) {
  const btn = src.querySelector<HTMLElement>(':scope > :is(button, a)') || src;
  const x0 = e.clientX, y0 = e.clientY, at = btn.getBoundingClientRect(), dx = x0 - at.left, dy = y0 - at.top;
  let ghost: HTMLElement | null = null, hot: [Surf, number] | null = null;
  const cellOf = (ev: { clientX: number; clientY: number }): [Surf, number] | null => {
    const sf = surfAt(ev.clientX, ev.clientY), n = sf.x ? sf.n() : cells;
    const c = nearest(sf, sf.x ? ev.clientX - dx + at.width / 2 : ev.clientY - dy + at.height / 2);
    return c == null ? null : [sf, Math.min(n - 1, Math.max(0, c))];
  };
  const light = (h: [Surf, number] | null) => {
    if (h?.[0] === hot?.[0] && h?.[1] === hot?.[1]) return;
    for (const s of SURFS) s.el().querySelectorAll('.sl-box.hot').forEach((x) => x.classList.remove('hot'));
    hot = h;
    if (h) h[0].el().querySelector(`:scope > .sl-box[data-i="${h[1]}"]`)?.classList.add('hot');
  };
  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      const copy = btn.cloneNode(true) as HTMLElement;
      for (const x of [copy, ...copy.querySelectorAll('[title]')]) x.removeAttribute('title');
      copy.classList.remove('landed', 'peek');
      ghost = document.createElement('div');
      ghost.className = src.className + ' sl-ghost';
      ghost.dataset.kind = src.dataset.kind || '';
      ghost.style.cssText = `width:${at.width}px;height:${at.height}px`;
      ghost.append(copy);
      document.body.append(ghost);
      src.classList.add('lift');
      for (const s of SURFS) s.el().classList.add('dragging');
    }
    ghost.style.left = ev.clientX - dx + 'px';
    ghost.style.top = ev.clientY - dy + 'px';
    light(cellOf(ev));
  };
  const stop = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    removeEventListener('keydown', key, true);
    if (!ghost) return false;
    ghost.remove();
    src.classList.remove('lift');
    for (const s of SURFS) s.el().classList.remove('dragging');
    eat = true;
    setTimeout(() => (eat = false), 0);
    light(null);
    return true;
  };
  const up = (ev: PointerEvent) => {
    const h = ghost ? cellOf(ev) : null;
    if (!stop()) return;
    if (ev.type === 'pointerup' && h) done(h[0], h[1]);
    else railChanged();
  };
  const key = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !ghost) return;
    ev.preventDefault();
    ev.stopPropagation();
    stop();
    railChanged();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
  addEventListener('keydown', key, true);
}

const target = (sf: Surf, ref: string, c: number) => {
  const n = sf.x ? sf.n() : cells, span = spanOf(ref, sf.x);
  if (span > 1) return spotOfCell(Math.min(n - span, Math.max(0, c - Math.floor(span / 2))), span, n);
  const other = sf.last.get(c);
  return other && other !== ref && other !== 'btn:fold' ? sf.get()[other] : spotAt(c, n);
};
export function slotDrag(drop: (ref: string, slot: number, side: Side) => void) {
  for (const sf of SURFS) sf.el().addEventListener('pointerdown', (e) => {
    const nav = (e.target as Element).closest<HTMLElement>('.sv'), b = (e.target as Element).closest<HTMLElement>('button, a');
    if (!nav || nav.parentElement !== sf.el() || !b || e.button !== 0 || isPin(nav.dataset.ref!) || nav.dataset.ref === 'btn:fold') return;
    const ref = nav.dataset.ref!;
    drag(e, nav, (t, c) => drop(ref, target(t, ref, c), t.side));
  });
}

export const railSpots = () => spots();

let pinDrag = '';
export const setPinDrag = (ref: string) => (pinDrag = ref);
export function pinDropIn(drop: (ref: string, slot: number, side: Side) => void) {
  for (const sf of SURFS) {
    const sw = sf.el();
    const cellOf = (e: DragEvent) => {
      if (!pinDrag || (e.target as Element).closest('.rf-box')) return -1;
      const c = nearest(sf, sf.x ? e.clientX : e.clientY);
      return c == null ? -1 : c;
    };
    const light = (c: number) => {
      sw.querySelectorAll('.sl-box.hot').forEach((x) => x.classList.remove('hot'));
      if (c >= 0) sw.querySelector(`:scope > .sl-box[data-i="${c}"]`)?.classList.add('hot');
    };
    const end = () => {
      sw.classList.remove('dragging');
      light(-1);
    };
    sw.addEventListener('dragover', (e) => {
      if (!pinDrag) return;
      sw.classList.add('dragging');
      const c = cellOf(e);
      light(c);
      if (c < 0) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'move';
    });
    sw.addEventListener('dragleave', (e) => {
      if (!sw.contains(e.relatedTarget as Node | null)) end();
    });
    sw.addEventListener('drop', (e) => {
      const c = cellOf(e), ref = pinDrag;
      end();
      if (c < 0) return;
      e.preventDefault();
      e.stopPropagation();
      drop(ref, target(sf, ref, c), sf.side);
    });
    document.addEventListener('dragend', end);
  }
}
