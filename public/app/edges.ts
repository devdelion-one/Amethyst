const PANELS = '#status, #activity, #side, #wsx, #pins, #start, #launch, .grp, .deck, .dk-rail, .oc-rail, .oc-main, .rs-rail, .rs-grp';

let queued = false;
let seen = new Set<Element>();

function squareEdges() {
  queued = false;
  const app = document.getElementById('app');
  if (!app) return;
  const A = app.getBoundingClientRect(), next = new Set<Element>();
  for (const el of app.querySelectorAll<HTMLElement>(PANELS)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const edge = [r.left <= A.left + 0.5 && 'l', r.top <= A.top + 0.5 && 't', r.right >= A.right - 0.5 && 'r', r.bottom >= A.bottom - 0.5 && 'b'].filter(Boolean).join(' ');
    if (!edge) continue;
    next.add(el);
    if (el.dataset.edge !== edge) el.dataset.edge = edge;
    if (!sizes.has(el)) { sizes.add(el); size.observe(el); }
  }
  for (const el of seen) if (!next.has(el)) delete (el as HTMLElement).dataset.edge;
  seen = next;
}

export const moves = (r: MutationRecord): boolean => {
  if (r.type === 'childList') return true;
  const el = r.target as Element;
  return el.id === 'app' || el.matches(PANELS) || !!el.querySelector(PANELS);
};
const soon = () => { if (!queued) { queued = true; requestAnimationFrame(squareEdges); } };
const sizes = new WeakSet<Element>();
const size = new ResizeObserver(soon);

function start() {
  const app = document.getElementById('app');
  if (!app) return;
  size.observe(app);
  for (const el of app.querySelectorAll(PANELS)) { sizes.add(el); size.observe(el); }
  new MutationObserver((recs) => { if (recs.some(moves)) soon(); }).observe(app, { attributes: true, attributeFilter: ['class', 'hidden'], childList: true, subtree: true });
  soon();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
