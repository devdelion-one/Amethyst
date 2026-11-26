import { $ } from '../base/util.ts';
import { onSize } from '../base/measure.ts';
import { onOutside } from '../base/lift.ts';

const bar = $('.bar'), actions = $('.actions'), sw = $('#switch');
const tray = (g: string): HTMLElement => actions.querySelector(`.tray[data-g="${g}"]`);
const TRAYS = ['ue', 'make', 'quick', 'agent', 'win'].map(tray);
const STEPS = [
  { tray: tray('win'), name: 'window and pinned' },
  { tray: tray('quick'), name: 'quick buttons' },
  { tray: tray('make'), name: 'new' },
  { tray: tray('ue'), name: 'Unreal' },
  { kind: 'research', name: 'research' },
  { kind: 'orch', name: 'orchestration' },
];
const SET_HIT = '[data-mode],[data-ed],[data-ed-add],[data-set],[data-set-add]';

const fold = document.createElement('div');
fold.className = 'tray';
fold.dataset.g = 'fold';
fold.hidden = true;
fold.innerHTML = '<button id="btn-fold" aria-label="more of the top bar">⋯</button>';
actions.append(fold);
const btn = fold.firstChild as HTMLElement;
const box = document.createElement('div');
box.id = 'bar-fold';
box.hidden = true;
box.innerHTML = '<div class="bf-sets"></div><div class="bf-trays"></div>';
bar.after(box);
const boxSets = box.firstChild as HTMLElement, boxTrays = box.lastChild as HTMLElement;

let level = 0;
const folded = () => STEPS.slice(0, level);

function apply(n: number) {
  level = n;
  const out = folded();
  for (const s of STEPS) if (s.kind) bar.classList.toggle(`fold-${s.kind}`, out.includes(s));
  const away = TRAYS.filter((t) => out.some((s) => s.tray === t));
  place(actions, [...TRAYS.filter((t) => !away.includes(t)), fold]);
  place(boxTrays, away);
  fold.hidden = !n;
}

function place(into: HTMLElement, list: HTMLElement[]) {
  const now = [...into.children];
  if (now.length !== list.length || list.some((el: HTMLElement, i: number) => now[i] !== el)) into.append(...list);
}

function over() {
  const r = bar.getBoundingClientRect(), pad = parseFloat(getComputedStyle(bar).paddingRight) || 0;
  const items = [$('#here'), sw, ...actions.children].filter((el) => el.offsetWidth).map((el) => el.getBoundingClientRect()).sort((a, b) => a.left - b.left);
  return items.some((a, i) => a.right > (items[i + 1] ? items[i + 1].left - 2 : r.right - pad + 1));
}

let busy = false;
function fit() {
  if (!bar.offsetWidth || sw.querySelector('.sorting')) return;
  busy = true;
  apply(0);
  while (level < STEPS.length && over()) apply(level + 1);
  if (!level) close();
  else if (!box.hidden) paintBox();
  watch.takeRecords();
  busy = false;
}
let queued = 0;
const soon = () => queued || (queued = requestAnimationFrame(() => ((queued = 0), fit())));

let width = 0;
onSize(bar, {
  name: 'bar.fit',
  live: true,
  write: (_, [e]) => {
    const w = e.borderBoxSize[0].inlineSize;
    if (w !== width) (width = w), soon();
  },
});
const watch = new MutationObserver(() => busy || soon());
for (const el of [bar, boxTrays]) watch.observe(el, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });

function paintBox() {
  const kinds = folded().filter((s) => s.kind).map((s) => s.kind);
  boxSets.innerHTML = [...sw.querySelectorAll('.sets')].filter((g) => kinds.includes(g.dataset.kind)).map((g) => g.outerHTML).join('');
  boxSets.hidden = !boxSets.innerHTML;
  const r = btn.getBoundingClientRect(), b = box.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(r.right - b.width, innerWidth - b.width - 8)) + 'px';
  box.style.top = r.bottom + 6 + 'px';
}
function open() {
  box.hidden = false;
  btn.classList.add('on');
  paintBox();
  off();
  off = onOutside([box, fold, '#colormenu'], close, { esc: true });
}
function close() {
  if (box.hidden) return;
  box.hidden = true;
  btn.classList.remove('on');
  off();
}
let off = () => {};
btn.addEventListener('click', () => (box.hidden ? open() : close()));
new MutationObserver(() => box.hidden || paintBox()).observe(sw, { childList: true });

function original(el: HTMLElement): HTMLElement | null {
  const kind = el.closest<HTMLElement>('.sets')?.dataset.kind, d = el.dataset;
  const key = ['mode', 'ed', 'set'].find((k) => k in d);
  const sel = key ? `[data-${key}="${CSS.escape(d[key]!)}"]` : 'ed-add' in d ? '[data-ed-add]' : '[data-set-add]';
  return sw.querySelector(`.sets[data-kind="${kind}"] ${sel}`);
}
boxSets.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(SET_HIT), o = b && original(b);
  if (!o) return;
  o.click();
  close();
});
boxSets.addEventListener('contextmenu', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>(SET_HIT), o = b && original(b);
  if (!o) return;
  e.preventDefault();
  o.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY }));
});

soon();
