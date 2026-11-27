import { ICONS, TOPBAR, useCopyHook } from '../base/controls.ts';
import type { TopRowRef } from '../base/controls.ts';
import { tell } from '../base/notify.ts';
import { setOff, setPref } from '../base/prefs.ts';
import { $ } from '../base/util.ts';
import { allRefs, railViews, redrawSwitch, shownRefs, useSlotCopy } from './modes.ts';
import { baseOf, copyable, dropCopy, isCopy, newCopy, onHomed, placeAt, placedOf, railSel, refOfSel } from './slots.ts';

const SURF = ':is(#switch, #dash > .slots)';
const baseRef = (r: TopRowRef) => (r.k === 'modesHidden' ? railViews().find((v) => v.kind === r.id && !isCopy(v.ref))?.ref || '' : refOfSel(r.sel));
const shown = (ref: string) => !!railViews().find((v) => v.ref === ref)?.shown;

function count(r: TopRowRef) {
  const base = baseRef(r);
  if (!base || !copyable(base)) return null;
  return shown(base) ? placedOf(base).length : 0;
}
function put(r: TopRowRef, at: { s: number; side: 'rail' | 'dash' } | null) {
  const base = baseRef(r);
  if (!shown(base)) {
    if (at) placeAt(base, at.s, allRefs(), shownRefs(), at.side);
    return r.id ? setOff(r.k, r.id, false) : setPref(r.k, true);
  }
  const ref = newCopy(base), refs = [...allRefs(), ref], on = shownRefs();
  if (!(at ? placeAt(ref, at.s, refs, on, at.side) : placeAt(ref, 0, refs, on, 'rail'))) return tell($('#switch'), { title: 'No free cell', line: 'Make the window bigger or remove a button first', ms: 2500 });
  redrawSwitch();
}
useSlotCopy({ count, put });

function hide(ref: string) {
  const base = baseOf(ref);
  if (!base.startsWith('btn:')) return setOff('modesHidden', base.slice(0, base.indexOf(':')), true);
  const r = TOPBAR.flatMap((g) => g.rows).find((x) => x.sel === railSel(base));
  if (r) r.id ? setOff(r.k, r.id, true) : setPref(r.k, false);
}
function remove(ref: string) {
  if (dropCopy(ref)) return redrawSwitch();
  hide(ref);
}

let target = '';
document.addEventListener('contextmenu', (e) => {
  const nav = (e.target as Element).closest?.<HTMLElement>('.sv[data-ref]');
  const ref = nav?.closest(SURF) ? nav.dataset.ref! : '';
  target = ref && copyable(ref) ? ref : '';
}, true);
document.addEventListener('pointerdown', (e) => {
  if (!(e.target as Element).closest?.('#colormenu')) target = '';
}, true);
useCopyHook({
  row: () => {
    if (!target) return '';
    const more = placedOf(baseOf(target)).length > 1;
    const tip = more ? 'Remove this one\nTakes this one off. The others stay.' : 'Remove this one\nIt is the only one, so the button is hidden. Right-click an empty cell of the rail or dashboard to put it back.';
    return `<button class="mi" data-rmcopy title="${tip}"><i class="tb-ic">${ICONS.x}</i><span class="mi-n">remove this one</span></button>`;
  },
  pick: (b) => {
    if (!('rmcopy' in b.dataset) || !target) return false;
    remove(target);
    target = '';
    return true;
  },
});

const COPY_ATTR = 'data-copy';
const orig = (base: string) => (railSel(base) ? document.querySelector<HTMLElement>(railSel(base)) : null);
function cloneOf(el: HTMLElement, base: string) {
  const c = el.cloneNode(true) as HTMLElement;
  c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  c.classList.remove('landed', 'lift');
  c.setAttribute(COPY_ATTR, base);
  return c;
}
function mirror(el: HTMLElement, c: HTMLElement) {
  for (const a of [...c.attributes]) if (a.name !== COPY_ATTR && !el.hasAttribute(a.name)) c.removeAttribute(a.name);
  for (const a of [...el.attributes]) if (a.name !== 'id' && c.getAttribute(a.name) !== a.value) c.setAttribute(a.name, a.value);
  const html = el.innerHTML.replace(/\sid="[^"]*"/g, '');
  if (c.innerHTML !== html) c.innerHTML = html;
}
const watched = new WeakSet<HTMLElement>();
const look = new MutationObserver((recs) => {
  const done = new Set<HTMLElement>();
  for (const r of recs) {
    const el = (r.target instanceof HTMLElement ? r.target : r.target.parentElement)?.closest<HTMLElement>('[id^="btn-"]');
    if (!el || done.has(el)) continue;
    done.add(el);
    const base = refOfSel(`#${el.id}`);
    if (base) document.querySelectorAll<HTMLElement>(`[${COPY_ATTR}="${base}"]`).forEach((c) => mirror(el, c));
  }
});
function fill() {
  for (const nav of document.querySelectorAll<HTMLElement>(`${SURF} .sv.sb[data-ref]`)) {
    const ref = nav.dataset.ref!, base = baseOf(ref), el = orig(base);
    if (!el) continue;
    if (!isCopy(ref)) {
      nav.querySelectorAll(`:scope > [${COPY_ATTR}]`).forEach((c) => c.remove());
      continue;
    }
    if (!watched.has(el)) {
      watched.add(el);
      look.observe(el, { attributes: true, childList: true, subtree: true, characterData: true });
    }
    if (!nav.firstElementChild) nav.append(cloneOf(el, base));
  }
}
onHomed(fill);

function swap(c: HTMLElement) {
  const el = orig(c.getAttribute(COPY_ATTR)!);
  if (!el || !el.closest(SURF) || el.contains(c)) return;
  mirror(el, c);
  const mark = document.createComment('');
  el.replaceWith(mark);
  c.replaceWith(el);
  mark.replaceWith(c);
}
for (const sel of ['#switch', '#dash']) $<HTMLElement>(sel).addEventListener('pointerover', (e: PointerEvent) => {
  const c = (e.target as Element).closest<HTMLElement>(`[${COPY_ATTR}]`);
  if (c && !c.closest('.sl-ghost')) swap(c);
});
for (const sel of ['#switch', '#dash']) $<HTMLElement>(sel).addEventListener('click', (e: MouseEvent) => {
  const c = (e.target as Element).closest<HTMLElement>(`[${COPY_ATTR}]`);
  if (!c || c.closest('.sl-ghost')) return;
  e.stopPropagation();
  orig(c.getAttribute(COPY_ATTR)!)?.click();
});
