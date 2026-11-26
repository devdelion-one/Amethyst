import { barMenu, dragWindow, ICONS } from '../base/controls.ts';
import { setSolid, setTheme } from '../base/theme.ts';
import { store } from '../base/util.ts';

export function paintColors() {
  const root = document.documentElement.style;
  store.get('forget:colors', ['', '', '']).forEach((c: string, i: number) => (c ? root.setProperty(`--fg-c${i + 1}`, c) : root.removeProperty(`--fg-c${i + 1}`)));
}

const ROWS = [
  ['!55', 1, ICONS.projects, 'this project, in 55 min'],
  ['#55', 1, ICONS.workspaces, 'the whole workspace, in 55 min'],
  ['!16:00', 1, '', 'at a time of the day'],
  ['!!55', 2, '', 'soon'],
  ['!!!55', 3, '', 'urgent'],
  ['$!55', 1, '↻', 'repeats every 55 min'],
  ['$!16:00', 1, '↻', 'every day at 16:00'],
  ['call mom', 0, '', 'no timer: it stays in the list'],
];

export const guideHtml = () =>
  `<div class="fgg"><div class="fgg-ex"><i style="--c: var(--fg-c1)">!55</i> call mom</div><div class="fgg-cap"><span>when · where</span><span>the note</span></div>` +
  ROWS.map(([chip, lv, ic, what]) => `<div class="fgg-r"><span class="fgg-k"><i${lv ? ` style="--c: var(--fg-c${lv})"` : ' class="plain"'}>${chip}</i></span><span class="fgg-ic">${ic}</span><span class="fgg-t">${what}</span></div>`).join('') +
  `<p class="fgg-foot">a space first keeps ! or # as text</p></div>`;

if (location.pathname === '/forget-guide.html') {
  const desk = window.amethyst!;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<section class="qtwin fggwin" aria-label="how to write a don't forget"><div class="fw-head"><span class="qt-name"><span class="fgg-nm">don't forget</span> · how to write it</span><button class="x" data-fggx title="Close&#10;Closes this window." data-tip-keys="=esc:close" aria-label="close">${ICONS.wx}</button></div><div class="fgg-body">${guideHtml()}</div></section>`,
  );
  const head = document.querySelector('.fggwin .fw-head')!;
  barMenu('.fggwin .fw-head', '');
  setTheme(store.text('theme3')!);
  paintColors();
  addEventListener('storage', (e) => (e.key === 'mind.theme3' ? setTheme(e.newValue!) : e.key === 'mind.solid' ? setSolid(e.newValue!) : e.key === 'mind.forget:colors' && paintColors()));
  dragWindow(head);
  document.documentElement.classList.add('wbar');
  head.addEventListener('click', (e) => (e.target as Element).closest('[data-fggx]') && desk.forgetGuide(null));
  addEventListener('keydown', (e) => e.key === 'Escape' && desk.forgetGuide(null));
}
