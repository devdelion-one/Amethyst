import { atLaunch, atWs, levelKey } from '../base/model.ts';
import { onSize } from '../base/measure.ts';
import { pref } from '../base/prefs.ts';
import { $, amKey, store } from '../base/util.ts';

export type SlotView = { kind: string; ref: string; html: string; shown: boolean };
type Spots = Record<string, number>;

export const PITCH = 32;
export const slotsOn = () => pref('switch:place') === 'slots' && !atWs() && !atLaunch();
const key = () => `switch:slots:${levelKey()}${amKey}`;
const spots = (): Spots | null => store.get(key(), null);
const kindOf = (ref: string) => ref.slice(0, ref.indexOf(':'));

const spans: Record<string, number> = {};
export const setSpan = (ref: string, n: number) => (spans[ref] = n);
const spanOf = (ref: string) => spans[ref] || 1;
const cellsOf = (refs: string[]) => refs.reduce((n, r) => n + spanOf(r), 0);
const fits = (taken: Map<number, string>, s: number, n: number) => {
  if (!Number.isInteger(s) || s < 0) return false;
  for (let k = 0; k < n; k++) if (taken.has(s + k)) return false;
  return true;
};
function occupied(at: Spots, refs: string[]) {
  const m = new Map<number, string>();
  for (const r of refs) if (Number.isInteger(at[r])) for (let k = 0; k < spanOf(r); k++) m.set(at[r] + k, r);
  return m;
}

let aimed: { kind: string; slot: number | null } | null = null;
export const aim = (kind: string, slot: number | null) => (aimed = { kind, slot });

let width = 0;
export const slotCount = (cells: number) => Math.max(cells, Math.floor((width - 4) / PITCH), 1);

export function placeAll(refs: string[], want: Spots = {}): { at: Spots; first: boolean; fresh: string[] } {
  const had = spots(), first = !had, at: Spots = { ...(had || {}) }, known = new Set(refs);
  const taken = new Map<number, string>();
  const take = (r: string, s: number) => {
    for (let k = 0; k < spanOf(r); k++) taken.set(s + k, r);
  };
  for (const r of refs) {
    if (fits(taken, at[r], spanOf(r))) take(r, at[r]);
    else delete at[r];
  }
  const free = (n: number) => {
    let i = 0;
    while (!fits(taken, i, n)) i++;
    return i;
  };
  const fresh: string[] = [];
  for (const r of refs) {
    if (r in at) continue;
    const n = spanOf(r);
    let s = fits(taken, want[r], n) ? want[r] : free(n);
    if (!first && aimed && aimed.kind === kindOf(r)) {
      if (aimed.slot != null && fits(taken, aimed.slot, n)) s = aimed.slot;
      aimed = null;
    }
    for (const [o, q] of Object.entries(at)) if (q >= s && q < s + n && !known.has(o)) delete at[o];
    at[r] = s;
    take(r, s);
    if (!first) fresh.push(r);
  }
  if (first || fresh.length || refs.some((r) => had?.[r] !== at[r])) store.set(key(), at);
  return { at, first, fresh };
}

export function moveRef(ref: string, slot: number, refs: string[]) {
  const at = { ...(spots() || {}) }, was = at[ref], n = spanOf(ref);
  if (was === slot) return false;
  for (const [o, q] of Object.entries(at)) if (q >= slot && q < slot + n && !refs.includes(o)) delete at[o];
  const hit = refs.filter((r) => r !== ref && Number.isInteger(at[r]) && at[r] < slot + n && at[r] + spanOf(r) > slot);
  const from: Spots = Object.fromEntries(hit.map((r) => [r, at[r]]));
  for (const r of hit) delete at[r];
  at[ref] = slot;
  const taken = occupied(at, refs);
  for (const r of hit) {
    const m = spanOf(r), p = from[r];
    let s = fits(taken, was, m) ? was : -1;
    for (let d = 0; s < 0; d++) s = fits(taken, p - d, m) ? p - d : fits(taken, p + d, m) ? p + d : -1;
    at[r] = s;
    for (let k = 0; k < m; k++) taken.set(s + k, r);
  }
  store.set(key(), at);
  return true;
}

export function freeNear(ref: string, refs: string[]) {
  const at = spots() || {}, used = occupied(at, refs);
  for (let i = (at[ref] ?? -1) + 1; i < slotCount(cellsOf(refs)); i++) if (!used.has(i)) return i;
  return null;
}
export function freeAt(x: number, refs: string[]) {
  const r = $('#switch').getBoundingClientRect(), i = Math.floor((x - r.left - 2) / PITCH), at = spots() || {};
  return i >= 0 && i < slotCount(cellsOf(refs)) && !occupied(at, refs).has(i) ? i : null;
}

function drawnAt(views: SlotView[], at: Spots, n: number) {
  const out = new Map<string, number>(), over: string[] = [], used = new Map<number, string>();
  for (const v of [...views].sort((a, b) => at[a.ref] - at[b.ref])) {
    if (at[v.ref] + spanOf(v.ref) > n) over.push(v.ref);
    else {
      out.set(v.ref, at[v.ref]);
      for (let k = 0; k < spanOf(v.ref); k++) used.set(at[v.ref] + k, v.ref);
    }
  }
  let past = n;
  for (const r of over.reverse()) {
    const m = spanOf(r);
    let s = n - m;
    while (s >= 0 && !fits(used, s, m)) s--;
    if (s < 0) {
      s = past;
      past += m;
    }
    out.set(r, s);
    for (let k = 0; k < m; k++) used.set(s + k, r);
  }
  return out;
}

const FOLDS = ['research', 'orch'];
export function slotHtml(views: SlotView[], at: Spots) {
  const shown = views.filter((v) => v.shown), n = slotCount(cellsOf(shown.map((v) => v.ref))), pos = drawnAt(shown, at, n);
  const boxes = Array.from({ length: n }, (_, i) => `<i class="sl-box" data-i="${i}" style="left:${i * PITCH + 4}px"></i>`).join('');
  const wide = (r: string) => spanOf(r) > 1;
  const navs = shown.map((v) => `<nav class="sets sv" data-kind="${v.kind}" data-ref="${v.ref}" data-slot="${pos.get(v.ref)}"${wide(v.ref) ? ` data-span="${spanOf(v.ref)}"` : ''} style="left:${pos.get(v.ref)! * PITCH}px${wide(v.ref) ? `;--span:${spanOf(v.ref)}` : ''}" aria-label="slot ${pos.get(v.ref)! + 1}">${v.html}</nav>`).join('');
  const count = (k: string) => shown.filter((v) => v.kind === k).length;
  const vars = `--sl-rest:${cellsOf(shown.filter((v) => !FOLDS.includes(v.kind)).map((v) => v.ref))};${FOLDS.map((k) => `--sl-${k}:${count(k)}`).join(';')}`;
  return { html: boxes + navs, vars };
}

export function watchSlots(sw: HTMLElement, repaint: () => void) {
  onSize(sw, {
    name: 'switch.slots',
    live: true,
    write: (_, [e]) => {
      const w = e.contentBoxSize[0].inlineSize;
      if (Math.floor((w - 4) / PITCH) === Math.floor((width - 4) / PITCH)) return void (width = w);
      width = w;
      if (sw.classList.contains('slots')) repaint();
    },
  });
}

const LOOK: Record<string, string> = { 'btn-newchat': 'pn-nc' };
let eat = false;
addEventListener('click', (e) => {
  if (!eat) return;
  eat = false;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);

function drag(e: PointerEvent, sw: HTMLElement, src: HTMLElement, span: number, done: (slot: number, outside: boolean) => void) {
  const x0 = e.clientX, y0 = e.clientY, at = src.getBoundingClientRect(), dx = x0 - at.left, dy = y0 - at.top;
  const mid = span === 1 ? at.width / 2 : (PITCH - 4) / 2, inSlot = src.matches('.sv');
  let ghost: HTMLElement | null = null, hot = -1;
  const outside = (ev: PointerEvent) => ev.clientX > sw.getBoundingClientRect().right;
  const slotOf = (ev: PointerEvent) => {
    const r = sw.getBoundingClientRect(), n = sw.querySelectorAll('.sl-box').length;
    return Math.min(n - span, Math.max(0, Math.round((ev.clientX - dx + mid - r.left - PITCH / 2 - 2) / PITCH)));
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
      const copy = src.cloneNode(true) as HTMLElement;
      if (inSlot) ghost = copy;
      else {
        ghost = document.createElement('nav');
        ghost.className = 'sets';
        ghost.append(copy);
      }
      ghost.classList.add('sl-ghost');
      for (const x of [ghost, ...ghost.querySelectorAll('[id], [title]')]) {
        if (x.id && LOOK[x.id]) x.classList.add(LOOK[x.id]);
        x.removeAttribute('id');
        x.removeAttribute('title');
      }
      document.body.append(ghost);
      src.classList.add('lift');
      sw.classList.add('dragging');
    }
    ghost.style.left = ev.clientX - dx + 'px';
    ghost.style.top = ev.clientY - dy + 'px';
    light(span > 1 && outside(ev) ? -1 : slotOf(ev));
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
    if (ev.type === 'pointerup') done(slotOf(ev), outside(ev));
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

export function slotDrag(sw: HTMLElement, drop: (ref: string, slot: number) => void, out: (ref: string) => void) {
  sw.addEventListener('pointerdown', (e) => {
    const nav = (e.target as Element).closest<HTMLElement>('.sv'), b = (e.target as Element).closest<HTMLElement>('button');
    if (!nav || !b || e.button !== 0 || !sw.classList.contains('slots')) return;
    const ref = nav.dataset.ref!;
    drag(e, sw, nav, Number(nav.dataset.span) || 1, (slot, away) => (away && nav.dataset.kind === 'btn' ? out(ref) : drop(ref, slot)));
  });
}

export function slotDragIn(el: HTMLElement, sw: HTMLElement, span: () => number, drop: (slot: number) => void) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !sw.classList.contains('slots') || el.closest('#switch')) return;
    drag(e, sw, el, span(), (slot, away) => away || drop(slot));
  });
}
