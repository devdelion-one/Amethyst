import { bands, dashPick, dashRow, ICONS, menuHead, popMenu } from '../base/controls.ts';
import { atLaunch, atWs } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { onPref, pref, setPref } from '../base/prefs.ts';
import { $ } from '../base/util.ts';
import { dashHtml, dashViews, pullBtns, railSel } from './slots.ts';

const box = () => $<HTMLElement>('#dash');
const cells = () => $<HTMLElement>('#dash > .slots');
const otherWin = () => document.documentElement.classList.contains('xwin');
let drawn: string | null = null;

export function paintDash() {
  const views = dashViews(), html = dashHtml(views), c = cells();
  if (drawn !== html) {
    drawn = html;
    pullBtns(c);
    c.innerHTML = html;
  }
  for (const v of views) {
    const nav = c.querySelector<HTMLElement>(`.sv[data-ref="${v.ref}"]`), el = $<HTMLElement>(railSel(v.ref));
    if (nav && el.parentNode !== nav) nav.append(el);
  }
  const show = !!pref('dash:on') && !atLaunch() && !atWs() && !otherWin() && !!html;
  $('#app').classList.toggle('nodash', !show);
  box().hidden = !show;
}

export function toggleDash() {
  if (otherWin()) return tell($('#shell'), { title: 'This window has no dashboard', line: 'Only Window 1 has one', ms: 2500 });
  if (atLaunch() || atWs()) return tell($('#shell'), { title: 'There is no dashboard on this screen', line: 'It shows inside a project', ms: 2500 });
  setPref('dash:on', !pref('dash:on'));
}

onPref('dash:on', paintDash);
box().addEventListener('contextmenu', (e: MouseEvent) => {
  if (e.defaultPrevented) return;
  e.preventDefault();
  popMenu(e.clientX, e.clientY, menuHead(ICONS.topDash, 'dashboard') + bands({ actions: dashRow() }), (b) => dashPick(b));
});
