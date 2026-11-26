import { atLaunch, atWs, levelKey } from '../base/model.ts';
import { onSize } from '../base/measure.ts';
import { onOutside } from '../base/lift.ts';
import { $, amKey, store } from '../base/util.ts';

export type SlotView = { kind: string; ref: string; html: string; shown: boolean; g?: string };
type Spots = Record<string, number>;

export const PITCH = 32;
const viewKey = () => `switch:rail:${levelKey()}${amKey}`;
const BTN_KEY = `switch:rail${amKey}`;
const isBtn = (ref: string) => ref.startsWith('btn:') || ref.startsWith('pin:');
const isPin = (ref: string) => ref.startsWith('pin:');
const BTN_AT: Spots = { 'btn:index': 0, 'btn:newchat': 5, 'btn:git': 9, 'btn:github': 10, 'btn:setup': -1, 'btn:qpwsh': -3, 'btn:qterm': -4, 'btn:scratch': -5, 'pin:folder': -6, 'pin:txt': -7, 'pin:md': -8, 'pin:file': -9, 'btn:more': -10 };
const VIEW_AT: Spots = { editor: 2, orch: 3 };
const spots = (): Spots => ({ ...store.get(BTN_KEY, BTN_AT), ...store.get(viewKey(), {}) });
function save(at: Spots) {
  const part = (b: boolean) => Object.fromEntries(Object.entries(at).filter(([r]) => isBtn(r) === b));
  store.set(BTN_KEY, part(true));
  store.set(viewKey(), part(false));
}
const kindOf = (ref: string) => ref.slice(0, ref.indexOf(':'));

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
export const railSel = (ref: string) => RAIL.find((x) => x[0] === ref)?.[1] || '';
const elOf = (ref: string) => $<HTMLElement>(railSel(ref));
type Pins = { views: () => SlotView[]; groups: () => string[][] };
let pins: Pins = { views: () => [], groups: () => [] };
export const usePins = (p: Pins) => (pins = p);
export function btnShown(ref: string) {
  if (isPin(ref)) return !!pins.views().find((v) => v.ref === ref)?.shown;
  if (atWs() && !WS_BTNS.includes(ref)) return false;
  const el = elOf(ref);
  return !el.hidden && !el.classList.contains('off');
}
const railViews = (end: 't' | 'b'): SlotView[] => RAIL.filter((x) => x[2] === end).map(([ref, , , g]) => ({ kind: 'btn', ref, html: '', shown: btnShown(ref), g }));
export const topBtns = () => railViews('t');
export function bottomBtns() {
  const b = railViews('b'), at = b.findIndex((v) => v.ref === 'btn:more');
  b.splice(at < 0 ? b.length : at, 0, ...pins.views());
  return b;
}
const endOf = (ref: string) => (isPin(ref) ? 'b' : RAIL.find((x) => x[0] === ref)?.[2] || 't');

const spans: Record<string, number> = {};
const spanOf = (ref: string) => spans[ref] || 1;
const local = (s: number) => (s < 0 ? -s - 1 : s);
const spotOf = (e: string, i: number) => (e === 'b' ? -i - 1 : i);
const cellKeys = (r: string, s: number) => Array.from({ length: spanOf(r) }, (_, k) => (s < 0 ? 'b' : 't') + (local(s) + k));
const fits = (taken: Map<string, string>, r: string, s: number) => Number.isInteger(s) && cellKeys(r, s).every((c) => !taken.has(c));
function occupied(at: Spots, refs: string[]) {
  const m = new Map<string, string>();
  for (const r of refs) if (Number.isInteger(at[r])) for (const c of cellKeys(r, at[r])) m.set(c, r);
  return m;
}
const overlap = (a: string, sa: number, b: string, sb: number) => cellKeys(a, sa).some((c) => cellKeys(b, sb).includes(c));
function freeFrom(taken: Map<string, string>, r: string, e: string, from: number, ok = (s: number) => fits(taken, r, s)) {
  let i = Math.max(0, from);
  while (!ok(spotOf(e, i))) i++;
  return spotOf(e, i);
}
export const absCells = (r: string, s: number, n: number) => Array.from({ length: spanOf(r) }, (_, k) => (s < 0 ? n - 1 - local(s) - k : s + k));

let aimed: { kind: string; slot: number | null } | null = null;
export const aim = (kind: string, slot: number | null) => (aimed = { kind, slot });

const railN = () => cells || Math.max(1, Math.floor($('#switch').clientHeight / PITCH));
const onRail = (r: string, s: number, n: number) => absCells(r, s, n).filter((c) => c >= 0 && c < n);
function board(n: number) {
  const keys = new Map<string, string>(), abs = new Set<number>();
  const keyFree = (r: string, s: number) => fits(keys, r, s);
  return {
    keys,
    keyFree,
    free: (r: string, s: number) => keyFree(r, s) && onRail(r, s, n).every((c) => !abs.has(c)),
    take(r: string, s: number) {
      for (const c of cellKeys(r, s)) keys.set(c, r);
      for (const c of onRail(r, s, n)) abs.add(c);
    },
  };
}
type Board = ReturnType<typeof board>;
const spotOfCell = (c: number, span: number, n: number) => (c < n / 2 ? c : -(n - c - span) - 1);
function nearestFree(bd: Board, r: string, s: number, n: number) {
  const span = spanOf(r), c0 = Math.min(n - span, Math.max(0, Math.min(...absCells(r, s, n))));
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

let seen = new Set<string>(), seenAt = '';
export function placeAll(views: SlotView[], dry = false): { at: Spots; first: boolean; fresh: string[] } {
  const first = store.get(viewKey(), null) == null, had = spots(), at: Spots = { ...had }, refs = views.map((v) => v.ref), known = new Set(refs), n = railN();
  const was = migrate(at);
  if (first) for (const [k, s] of Object.entries(VIEW_AT)) {
    const r = views.find((v) => v.kind === k)?.ref;
    if (r && !(r in at)) at[r] = s;
  }
  if (!dry && seenAt !== viewKey()) (seen = new Set()), (seenAt = viewKey());
  const boot = dry || !seen.size, shown = views.filter((v) => v.shown).map((v) => v.ref);
  const pri = (rs: string[]) => [...rs.filter(isBtn), ...rs.filter((r) => !isBtn(r))];
  const bd = board(n), fresh: string[] = [];
  const keep = (r: string) => !first || !isBtn(r);
  for (const r of pri(shown.filter((r) => boot || seen.has(r)))) {
    if (bd.keyFree(r, at[r])) bd.take(r, at[r]);
    else delete at[r];
  }
  for (const r of pri(shown.filter((r) => !boot && !seen.has(r)))) {
    if (!Number.isInteger(at[r])) continue;
    if (bd.free(r, at[r])) {
      bd.take(r, at[r]);
      continue;
    }
    const s = nearestFree(bd, r, at[r], n);
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
        from = local(at[o]) + spanOf(o);
        break;
      }
    }
    let s = freeFrom(bd.keys, r, e, from, (t) => bd.free(r, t));
    if (!dry && aimed && aimed.kind === kindOf(r)) {
      if (aimed.slot != null && bd.free(r, aimed.slot)) s = aimed.slot;
      aimed = null;
    }
    for (const [o, q] of Object.entries(at)) if (!known.has(o) && overlap(o, q, r, s)) delete at[o];
    at[r] = s;
    bd.take(r, s);
    if (keep(r)) fresh.push(r);
  });
  if (!dry) seen = new Set(shown);
  if (!dry && (first || was || fresh.length || refs.some((r) => had[r] !== at[r]))) save(at);
  return { at, first, fresh };
}

export function picHtml(views: SlotView[], fill: (v: SlotView) => string) {
  const all = views.map((v) => ({ ...v, shown: true, html: fill(v) })).filter((v) => v.html), { at } = placeAll(all, true);
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

export function moveRef(ref: string, slot: number, refs: string[], shown = refs) {
  const at = spots(), n = railN();
  migrate(at);
  const was = at[ref];
  if (was === slot) return false;
  for (const [o, q] of Object.entries(at)) if (!refs.includes(o) && overlap(o, q, ref, slot)) delete at[o];
  const mine = onRail(ref, slot, n);
  const hit = shown.filter((r) => r !== ref && Number.isInteger(at[r]) && (overlap(r, at[r], ref, slot) || onRail(r, at[r], n).some((c) => mine.includes(c))));
  const from: Spots = Object.fromEntries(hit.map((r) => [r, at[r]]));
  at[ref] = slot;
  const bd = board(n);
  bd.take(ref, slot);
  for (const r of shown) if (r !== ref && !hit.includes(r) && Number.isInteger(at[r])) bd.take(r, at[r]);
  for (const r of hit) {
    const s = Number.isInteger(was) && bd.free(r, was) ? was : nearestFree(bd, r, from[r], n);
    if (s == null) delete at[r];
    else {
      at[r] = s;
      bd.take(r, s);
    }
  }
  save(at);
  return true;
}

let cells = 0;
const lastAt = new Map<number, string>();
const spotAt = (c: number, n = cells) => (c < n / 2 ? c : -(n - 1 - c) - 1);
export function freeNear(ref: string, refs: string[]) {
  const at = spots(), s = at[ref];
  if (!Number.isInteger(s)) return null;
  return freeFrom(occupied(at, refs), '?', s < 0 ? 'b' : 't', local(s) + spanOf(ref));
}
export function freeAt(y: number) {
  const c = nearest(y);
  return c == null || lastAt.has(c) ? null : spotAt(c);
}
function nearest(y: number) {
  let best: number | null = null, d = Infinity;
  for (const b of $<HTMLElement>('#switch').querySelectorAll<HTMLElement>(':scope > .sl-box')) {
    const r = b.getBoundingClientRect(), m = Math.abs(r.top + r.height / 2 - y);
    if (m < d) (d = m), (best = +b.dataset.i!);
  }
  return best;
}

const FOLD = ['btn:pins', 'btn:win', 'btn:scratch', 'btn:sketch', 'btn:qterm', 'btn:qpwsh', 'btn:qagent', 'btn:inbox', 'btn:quick', 'btn:more', 'btn:uewin', 'btn:ue', 'research', 'orch', 'btn:newchat', 'term', 'chat', 'editor', 'btn:setup', 'btn:github', 'btn:git', 'btn:index', 'btn:site'];
function fit(views: SlotView[], at: Spots, n: number) {
  const rank = new Map(views.map((v, p) => {
    const i = FOLD.indexOf(isPin(v.ref) ? 'btn:quick' : isBtn(v.ref) ? v.ref : v.kind);
    return [v.ref, (i < 0 ? FOLD.length : i) * 1000 + (999 - (p % 1000))];
  }));
  const live = new Map(views.map((v) => [v.ref, absCells(v.ref, at[v.ref], n)]));
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

let foldOpen = false;
const posOf = (s: number) => (s < 0 ? `bottom:${local(s) * PITCH}px` : `top:${s * PITCH}px`);
const navOf = (v: SlotView, style: string) => {
  const span = spanOf(v.ref), cls = v.kind === 'btn' ? 'sv sb' : 'sets sv';
  return `<nav class="${cls}" data-kind="${v.kind}" data-ref="${v.ref}"${v.g ? ` data-g="${v.g}"` : ''}${span > 1 ? ` data-span="${span}"` : ''} style="${style}${span > 1 ? `;--span:${span}` : ''}" aria-label="${v.kind === 'btn' ? v.ref.slice(4) : v.kind}">${v.html}</nav>`;
};
export function slotHtml(views: SlotView[], at: Spots) {
  if (!cells) cells = Math.floor($('#switch').clientHeight / PITCH);
  const shown = views.filter((v) => v.shown && Number.isInteger(at[v.ref])), n = Math.max(cells, 1);
  const { live, folded, more } = fit(shown, at, n);
  lastAt.clear();
  for (const [r, cs] of live) for (const c of cs) lastAt.set(c, r);
  if (more != null) lastAt.set(more, 'btn:fold');
  const low = (r: string | undefined) => (r && live.has(r) ? Math.max(...live.get(r)!) >= n / 2 : false);
  const boxPos = (c: number) => {
    const r = lastAt.get(c);
    return (r && r !== 'btn:fold' ? low(r) : c >= n / 2) ? `bottom:${(n - 1 - c) * PITCH + 3}px` : `top:${c * PITCH + 3}px`;
  };
  const navPos = (r: string) => {
    const cs = live.get(r)!;
    return low(r) ? `bottom:${(n - 1 - Math.max(...cs)) * PITCH}px` : `top:${Math.min(...cs) * PITCH}px`;
  };
  const boxes = Array.from({ length: n }, (_, c) => `<i class="sl-box" data-i="${c}" style="${boxPos(c)}"></i>`).join('');
  const navs = shown.filter((v) => live.has(v.ref)).map((v) => navOf(v, navPos(v.ref))).join('');
  const byRank = folded.map((r) => shown.find((v) => v.ref === r)!);
  const fold = more == null ? '' : `<nav class="sv sb rf-at" data-kind="btn" data-ref="btn:fold" style="${posOf(spotAt(more, n))}" aria-label="more"><button id="btn-fold" class="${foldOpen ? 'on' : ''}" title="More&#10;The buttons that don't fit in the rail. Make the window taller to see them in it." aria-label="more of the rail" aria-expanded="${foldOpen}">⋯</button></nav><div class="rf-box"${foldOpen ? '' : ' hidden'}>${byRank.map((v) => navOf(v, '')).join('')}</div>`;
  if (more == null) foldOpen = false;
  return boxes + navs + fold;
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
    const el = $<HTMLElement>(sel), at = sw.querySelector<HTMLElement>(`.sv[data-ref="${ref}"]`) || home();
    if (el.parentNode !== at) at.append(el);
  }
  placeFold(sw);
}

let offFold = () => {};
function placeFold(sw: HTMLElement) {
  const box = sw.querySelector<HTMLElement>('.rf-box'), b = sw.querySelector<HTMLElement>('#btn-fold');
  if (!box || !b || box.hidden) return;
  const r = b.getBoundingClientRect(), rail = $('#activity').getBoundingClientRect();
  box.style.left = rail.right + 6 + 'px';
  box.style.bottom = Math.max(8, innerHeight - r.bottom - 3) + 'px';
}
function setFold(sw: HTMLElement, on: boolean) {
  foldOpen = on;
  const box = sw.querySelector<HTMLElement>('.rf-box'), b = sw.querySelector<HTMLElement>('#btn-fold');
  if (box) box.hidden = !on;
  b?.classList.toggle('on', on);
  b?.setAttribute('aria-expanded', String(on));
  offFold();
  offFold = () => {};
  if (!on) return;
  placeFold(sw);
  offFold = onOutside(['#switch .rf-box', '#btn-fold', '#colormenu'], () => setFold(sw, false), { esc: true });
}
export function watchFold(sw: HTMLElement) {
  sw.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('#btn-fold')) return setFold(sw, !foldOpen);
    if (t.closest('.rf-box') && t.closest('button, a')) setTimeout(() => setFold(sw, false));
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

let eat = false;
addEventListener('click', (e) => {
  if (!eat) return;
  eat = false;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

function drag(e: PointerEvent, sw: HTMLElement, src: HTMLElement, span: number, done: (cell: number) => void) {
  const x0 = e.clientX, y0 = e.clientY, at = src.getBoundingClientRect(), dx = x0 - at.left, dy = y0 - at.top;
  let ghost: HTMLElement | null = null, hot = -1;
  const cellOf = (ev: PointerEvent) => {
    const c = nearest(ev.clientY - dy + (span * PITCH) / 2 - ((span - 1) * PITCH) / 2);
    return c == null ? -1 : Math.min(cells - span, Math.max(0, c));
  };
  const light = (i: number) => {
    if (i === hot) return;
    sw.querySelectorAll('.sl-box.hot').forEach((x) => x.classList.remove('hot'));
    hot = i;
    for (let k = 0; i >= 0 && k < span; k++) sw.querySelector(`.sl-box[data-i="${i + k}"]`)?.classList.add('hot');
  };
  const move = (ev: PointerEvent) => {
    if (!ghost) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      ghost = src.cloneNode(true) as HTMLElement;
      ghost.classList.add('sl-ghost');
      ghost.removeAttribute('style');
      for (const x of [ghost, ...ghost.querySelectorAll('[id], [title]')]) {
        x.removeAttribute('id');
        x.removeAttribute('title');
      }
      document.body.append(ghost);
      src.classList.add('lift');
      sw.classList.add('dragging');
    }
    ghost.style.left = ev.clientX - dx + 'px';
    ghost.style.top = ev.clientY - dy + 'px';
    light(cellOf(ev));
  };
  const up = (ev: PointerEvent) => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    if (!ghost) return;
    ghost.remove();
    src.classList.remove('lift');
    sw.classList.remove('dragging');
    eat = true;
    setTimeout(() => (eat = false), 0);
    light(-1);
    const c = cellOf(ev);
    if (ev.type === 'pointerup' && c >= 0) done(c);
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

export function slotDrag(sw: HTMLElement, drop: (ref: string, slot: number) => void) {
  sw.addEventListener('pointerdown', (e) => {
    const nav = (e.target as Element).closest<HTMLElement>('#switch > .sv'), b = (e.target as Element).closest<HTMLElement>('button, a');
    if (!nav || !b || e.button !== 0 || isPin(nav.dataset.ref!) || nav.dataset.ref === 'btn:fold') return;
    const ref = nav.dataset.ref!, span = Number(nav.dataset.span) || 1;
    drag(e, sw, nav, span, (c) => {
      const other = lastAt.get(c);
      const s = other && other !== ref && other !== 'btn:fold' ? spots()[other] : spotAt(c);
      const slot = s < 0 && span > 1 ? s + (span - 1) : s;
      drop(ref, slot);
    });
  });
}
export const railSpots = () => spots();

let pinDrag = '';
export const setPinDrag = (ref: string) => (pinDrag = ref);
export function pinDropIn(sw: HTMLElement, drop: (ref: string, slot: number) => void) {
  const cellOf = (e: DragEvent) => {
    if (!pinDrag || (e.target as Element).closest('.rf-box')) return -1;
    const c = nearest(e.clientY);
    return c == null ? -1 : c;
  };
  const light = (c: number) => {
    sw.querySelectorAll('.sl-box.hot').forEach((x) => x.classList.remove('hot'));
    if (c >= 0) sw.querySelector(`.sl-box[data-i="${c}"]`)?.classList.add('hot');
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
    const other = lastAt.get(c);
    drop(ref, other && other !== ref && other !== 'btn:fold' ? spots()[other] : spotAt(c));
  });
  document.addEventListener('dragend', end);
}
