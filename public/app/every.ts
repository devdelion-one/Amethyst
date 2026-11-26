import { retip } from '../base/controls.ts';
import { tell } from '../base/notify.ts';
import { onPref, pref } from '../base/prefs.ts';
import { projectOf, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { $ } from '../base/util.ts';
import { POP, SOLO, WIN } from '../base/windows.ts';

export const canEvery = () => !!window.amethyst?.desktop && WIN > 1 && !POP;
export const everyOn = () => canEvery() && new URLSearchParams(location.search).get('every') === '1';
export const everyFrom = () => projectOf(S.pid)?.name || '';
export const everyName = () => everyFrom() || 'this project';

const btn = $<HTMLButtonElement>('#win-every');

export function paintEvery() {
  btn.hidden = !canEvery() || !pref('win:every');
  if (btn.hidden) return;
  const on = everyOn();
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.dataset.tip = on ? `kept in every project: click to keep it only in ${everyName()}` : 'keep this window when you switch projects: it stays when the main window switches to another project';
  btn.setAttribute('aria-label', 'keep this window when you switch projects');
  retip();
}

export function toggleEvery() {
  if (!canEvery()) {
    const line = WIN === 1 ? 'Only Window 2, 3… can be kept when you switch projects' : SOLO ? 'This window belongs to its project: each project has its own' : 'Drag the tab out to a window first, then mark that window';
    return void tell($('#winbar').hidden ? $('#activity') : $('#winbar'), { title: 'Not this window', line, ms: 2500 });
  }
  const u = new URL(location.href);
  if (everyOn()) u.searchParams.delete('every');
  else u.searchParams.set('every', '1');
  history.replaceState(null, '', u);
  page.render();
}

btn.addEventListener('click', toggleEvery);
onPref('win:every', paintEvery);
paintEvery();
