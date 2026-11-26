import { setCtx } from './actions.ts';
import { floatBox, mark } from '../base/controls.ts';
import { closeEditor } from '../editor/editor.ts';
import { S } from '../base/model.ts';
import { $, store } from '../base/util.ts';
import { page } from '../base/page.ts';

export async function deselect() {
  if (S.open?.path && !S.open.scratch && !S.open.tab) await closeEditor();
  if (S.ctx !== '' || S.marked.size) {
    setCtx('');
    mark(null, 'clear');
    page.render();
  }
}
$<HTMLElement>('#list').addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-dir],[data-open],[data-th],[data-drag],button,a,input,textarea,select,.bt,.th,.ti')) return;
  deselect();
});

const ED = $<HTMLElement>('#editor');
const MOVABLE = '.gbody > #editor:not(.docked):not(.board-mode)';
const wide = matchMedia('(min-width: 861px)');
const panelAt = (el: HTMLElement): number[] => store.get('panelAt', {})[el.id] || [0, 0];
const shift = (el: HTMLElement, x: number, y: number) => (el.style.translate = `${x}px ${y}px`);
const back = (lo: number, hi: number, pLo: number, pHi: number) => (lo < pLo ? pLo - lo : hi > pHi ? Math.min(0, pHi - hi) : 0);
function fitPanel(el: HTMLElement, [x, y]: number[]) {
  shift(el, x, y);
  const p = el.offsetParent?.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (p && r.width) shift(el, x + back(r.left, r.right, p.left, p.right), y + back(r.top, r.bottom, p.top, p.bottom));
}
export function placePanels() {
  if (ED.matches(MOVABLE) && wide.matches) fitPanel(ED, panelAt(ED));
}
addEventListener('resize', placePanels);
floatBox(ED, {
  head: ED.firstElementChild as HTMLElement,
  when: () => ED.matches(MOVABLE) && wide.matches,
  keep: (b) => {
    const p = ED.offsetParent?.getBoundingClientRect();
    return p ? { ...b, x: b.x + back(b.x, b.x + b.w, p.left, p.right), y: b.y + back(b.y, b.y + b.h, p.top, p.bottom) } : b;
  },
  drop(b, { moved }) {
    if (!moved) return;
    const r = ED.getBoundingClientRect(), [x, y] = panelAt(ED), at = [x + b.x - r.left, y + b.y - r.top];
    store.set('panelAt', { ...store.get('panelAt', {}), [ED.id]: at });
    fitPanel(ED, at);
  },
});
