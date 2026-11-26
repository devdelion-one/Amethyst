import { onSize } from './measure.ts';
type FloatAt = Element | DOMRect | null | undefined;
type FloatOpts = { side?: 'up' | 'down'; align?: 'start' | 'center' | 'end'; match?: boolean; gap?: number; keep?: () => Element | null; away?: () => void; stick?: boolean };
type Lifted = { at: () => FloatAt; o: FloatOpts; off: () => void; went?: boolean };

const EDGE = 8;
const lifted = new Map<HTMLElement, Lifted>();

export function raise(el: HTMLElement) {
  if (!el.isConnected) return;
  if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
}

const rectOf = (a: FloatAt) => (!a ? null : a instanceof Element ? (a.isConnected && a.checkVisibility() && a.getClientRects().length ? a.getBoundingClientRect() : null) : a);

function place(el: HTMLElement, l: Lifted) {
  const r = el.isConnected && rectOf(l.at());
  if (!r) return l.o.away && el.isConnected ? l.o.away() : land(el);
  const { side = 'up', align = 'start', match = false, gap = 6 } = l.o;
  Object.assign(el.style, { maxHeight: '', maxWidth: innerWidth - 2 * EDGE + 'px', width: match ? Math.min(r.width, innerWidth - 2 * EDGE) + 'px' : '' });
  const cap = parseFloat(getComputedStyle(el).maxHeight) || Infinity, need = Math.min(el.offsetHeight, cap);
  const up = r.top - gap - EDGE, down = innerHeight - r.bottom - gap - EDGE;
  const goUp = l.o.stick && l.went !== undefined ? l.went : side === 'up' ? need <= up || up >= down : need > down && up > down;
  l.went = goUp;
  el.style.maxHeight = Math.max(0, Math.min(cap, goUp ? up : down)) + 'px';
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = align === 'end' ? r.right - w : align === 'center' ? r.left + (r.width - w) / 2 : r.left;
  const k = l.o.keep?.(), K = k?.isConnected ? k.getBoundingClientRect() : null;
  if (K && K.width >= w) x = Math.max(K.left, Math.min(x, K.right - w));
  el.style.left = Math.max(EDGE, Math.min(x, innerWidth - w - EDGE)) + 'px';
  el.style.top = (goUp ? r.top - gap - h : r.bottom + gap) + 'px';
  el.dataset.side = goUp ? 'up' : 'down';
}

export function lift(el: HTMLElement, at: () => FloatAt, o: FloatOpts = {}) {
  land(el);
  if (!el.isConnected) return;
  raise(el);
  let raf = 0;
  const again = () => (raf ||= requestAnimationFrame(() => {
    raf = 0;
    const l = lifted.get(el);
    if (l) place(el, l);
  }));
  const ro = onSize(null, { name: 'lift', live: true, write: () => again() });
  const a = at();
  if (a instanceof Element) ro.observe(a);
  ro.observe(el);
  const scroll = (e: Event) => {
    const t = e.target, now = at();
    if (!(t instanceof Node) || el.contains(t) || !(now instanceof Element) || !(t === document || t.contains(now))) return;
    o.away ? o.away() : land(el);
  };
  document.addEventListener('scroll', scroll, true);
  addEventListener('resize', again);
  const l: Lifted = {
    at,
    o,
    off: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('scroll', scroll, true);
      removeEventListener('resize', again);
    },
  };
  lifted.set(el, l);
  place(el, l);
}

export function land(el: HTMLElement) {
  lifted.get(el)?.off();
  lifted.delete(el);
  if (el.matches(':popover-open')) el.hidePopover();
}

export const isLifted = (el: HTMLElement) => lifted.has(el);

type Inside = Element | string | null | undefined;
export function onOutside(inside: Inside[] | (() => Inside[]), close: () => unknown, { esc = false, trusted = false } = {}): () => void {
  const press = (e: Event) => {
    if (trusted && !e.isTrusted) return;
    const t = e.target as Element | null;
    const all = typeof inside === 'function' ? inside() : inside;
    if (!all.some((x) => x && (typeof x === 'string' ? t?.closest?.(x) : x.contains(t)))) close();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  document.addEventListener('pointerdown', press, true);
  if (esc) document.addEventListener('keydown', key, true);
  return () => {
    document.removeEventListener('pointerdown', press, true);
    document.removeEventListener('keydown', key, true);
  };
}
