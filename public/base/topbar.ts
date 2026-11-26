import { tell } from './notify.ts';
import { onPref, pref } from './prefs.ts';
import { $ } from './util.ts';
import { WIN } from './windows.ts';

export const TAB_ICON = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const app = $('#app');
const tab = document.createElement('button');
tab.type = 'button';
tab.id = 'bar-tab';
tab.setAttribute('aria-label', 'show the top bar');
tab.hidden = true;
tab.innerHTML = TAB_ICON;
$('#shell')?.append(tab);

export const topBarHidden = () => !!app?.classList.contains('nobar');

function paint() {
  tab.hidden = !topBarHidden() || !pref('bar:showTab');
  delete tab.dataset.tip;
  tab.title = 'Show the top bar\nBrings back the top bar you hid.';
  tab.dataset.tipKeys = 'topBarKey:show or hide';
}

export function toggleTopBar(hide = !topBarHidden()) {
  if (WIN > 1) return tell($('#winbar'), { title: 'This window has no top bar', line: 'Only Window 1 has one', ms: 2500 });
  app?.classList.toggle('nobar', hide);
  paint();
}

export function toggleBottomBar(hide = !app?.classList.contains('nostatus')) {
  app?.classList.toggle('nostatus', hide);
}

let down: [number, number] | null = null, moved = false;
tab.addEventListener('pointerdown', (e) => {
  down = [e.clientX, e.clientY];
  moved = false;
  tab.setPointerCapture(e.pointerId);
});
tab.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down[0], dy = e.clientY - down[1];
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
  if (dy > 6) {
    down = null;
    toggleTopBar(false);
  }
});
tab.addEventListener('pointerup', () => (down = null));
tab.addEventListener('click', () => moved || (topBarHidden() && toggleTopBar(false)));

const near = (on: boolean) => tab.classList.toggle('near', on);
document.addEventListener('pointermove', (e) => topBarHidden() && near(e.clientY < 36));
document.documentElement.addEventListener('pointerleave', () => near(false));

onPref('bar:showTab', paint);
document.addEventListener('keys-changed', paint);
