import { ICONS, keepMenu, topBarMenu, topRow } from '../base/controls.ts';
import { atLaunch, S } from '../base/model.ts';
import { pref, setPref } from '../base/prefs.ts';
import { $, esc, track } from '../base/util.ts';
import { dashSpot, dragging } from './slots.ts';

export type Edge = 'left' | 'right';
export const railRight = () => !!pref('rail:right');
const ICON_OF: Record<string, string> = { tree: 'btn:index', git: 'btn:git', github: 'btn:github', setup: 'btn:setup' };
const ticked = (): Edge | '' => {
  const v = pref('explorer:side');
  return v === 'left' || v === 'right' ? v : '';
};
export function sideOf(view = S.sideView): Edge {
  const ref = ICON_OF[view] || 'btn:index', tick = ref === 'btn:index' ? ticked() : '';
  if (tick) return tick;
  const s = dashSpot(ref);
  if (s != null) return s < 0 ? 'right' : 'left';
  return railRight() ? 'right' : 'left';
}
export function paintSides() {
  const app = $('#app');
  app.classList.toggle('rail-right', railRight());
  app.classList.toggle('side-right', sideOf() === 'right');
}

const SIDE_TIP: Record<Edge, string> = {
  left: 'Open on left side\nThe explorer opens from the left edge, wherever its icon is. Unticked, it opens from the side its icon is on.',
  right: 'Open on right side\nThe explorer opens from the right edge, wherever its icon is. Unticked, it opens from the side its icon is on.',
};
const sideRows = () => (['left', 'right'] as Edge[]).map((k) => topRow(ticked() === k, `data-exside="${k}" title="${esc(SIDE_TIP[k])}"`, k === 'left' ? ICONS.strip : ICONS.stripR, `open on ${k} side`)).join('');
export function stripMenu(el: HTMLElement, x: number, y: number) {
  const mine = el.dataset.ref === 'btn:index';
  topBarMenu(x, y, { tray: 'strip', ...(mine ? { opts: sideRows(), onPick: (b: HTMLElement) => {
    const k = b.dataset.exside as Edge | undefined;
    if (k) setPref('explorer:side', ticked() === k ? '' : k);
  } } : {}) });
  if (mine) keepMenu(() => stripMenu(el, x, y));
}

let eat = false;
addEventListener('click', (e) => {
  if (!eat) return;
  eat = false;
  e.stopImmediatePropagation();
  e.preventDefault();
}, true);
const half = (x: number): Edge => (x >= innerWidth / 2 ? 'right' : 'left');
function railDrag(e: PointerEvent) {
  const rail = $<HTMLElement>('#activity'), x0 = e.clientX, y0 = e.clientY;
  let ghost: HTMLElement | null = null, land: HTMLElement | null = null, dx = 0, w = 0;
  const place = (x: number) => {
    const s = $('#shell').getBoundingClientRect(), to = half(x);
    ghost!.style.left = Math.max(0, Math.min(x - dx, innerWidth - w)) + 'px';
    land!.style.cssText = `left:${to === 'right' ? s.right - 3 : s.left}px;top:${s.top}px;height:${s.height}px`;
    land!.dataset.at = to;
  };
  const stop = () => {
    ghost?.remove();
    land?.remove();
    rail.classList.remove('rd-lift');
    document.body.classList.remove('rd-moving');
  };
  track(e, {
    capture: rail,
    esc: () => !!ghost,
    move(ev) {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        const r = rail.getBoundingClientRect();
        dx = x0 - r.left;
        w = r.width;
        ghost = rail.cloneNode(true) as HTMLElement;
        for (const x of [ghost, ...ghost.querySelectorAll('[title]')]) x.removeAttribute('title');
        ghost.classList.add('rd-ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.cssText = `top:${r.top}px;width:${r.width}px;height:${r.height}px`;
        land = document.createElement('div');
        land.className = 'rd-land';
        document.body.append(land, ghost);
        rail.classList.add('rd-lift');
        document.body.classList.add('rd-moving');
      }
      place(ev.clientX);
    },
    end(ok, ev) {
      if (!ghost) return;
      stop();
      eat = true;
      setTimeout(() => (eat = false), 0);
      if (!ok || !ev || ev.clientX < 0 || ev.clientX > innerWidth || ev.clientY < 0 || ev.clientY > innerHeight) return;
      const right = half(ev.clientX) === 'right';
      if (right !== railRight()) setPref('rail:right', right);
    },
  });
}
$<HTMLElement>('#activity').addEventListener('pointerdown', (e) => {
  const t = e.target as Element;
  if (e.button !== 0 || atLaunch() || dragging() || t.closest('button, a, input, .rf-box')) return;
  e.preventDefault();
  railDrag(e);
});
const railTip = () => {
  const a = $('#activity');
  a.title = `Rail\nDrag an empty spot of it to the ${railRight() ? 'left' : 'right'} edge of the window to move it there. Right-click it for its buttons.`;
  a.dataset.tipIcon = railRight() ? 'stripR' : 'strip';
};
railTip();
$('#activity').addEventListener('pointerenter', railTip);
