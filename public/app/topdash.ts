import { atLaunch, atWs } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { onPref, pref, setPref } from '../base/prefs.ts';
import { $ } from '../base/util.ts';
import { paintSlots, railChanged } from './slots.ts';
import type { SlotView } from './slots.ts';

const box = () => $<HTMLElement>('#dash');
const cells = () => $<HTMLElement>('#dash > .slots');
const otherWin = () => document.documentElement.classList.contains('xwin');
let force = true, any = true;

export function showDash(has = any) {
  any = has;
  const show = !!pref('dash:on') && !atLaunch() && !otherWin() && (!atWs() || has);
  $('#app').classList.toggle('nodash', !show);
  box().hidden = !show;
  return show;
}

export function drawDash(views: SlotView[], at: Record<string, number>) {
  const c = cells();
  if (box().hidden || c.classList.contains('dragging')) return;
  const f = force;
  force = false;
  paintSlots(c, views, at, 'dash', f);
}

export function toggleDash() {
  if (otherWin()) return tell($('#shell'), { title: 'This window has no dashboard', line: 'Only Window 1 has one', ms: 2500 });
  if (atLaunch() || (atWs() && !any)) return tell($('#shell'), { title: 'There is no dashboard on this screen', line: 'It shows inside a project', ms: 2500 });
  setPref('dash:on', !pref('dash:on'));
}

onPref('dash:on', () => {
  showDash();
  force = true;
  railChanged();
});
