import { rowIcons } from '../base/controls.ts';
import { S, within } from '../base/model.ts';
import { refuse } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { $ } from '../base/util.ts';
import { canFocus, focused, focusOn, unfocus } from './focus.ts';
import { FOCUS_ICON, focusTip, NO_FOCUS_TIP, UNFOCUS_ICON, unfocusTip } from './focuslook.ts';

rowIcons({ focusBtn: () => FOCUS_ICON });
const button = $<HTMLButtonElement>('#tree-focus');

function whyNot() {
  const loc = S.ctx;
  if (loc === '') return { title: "Can't focus the project folder", line: 'Select a folder inside it' };
  if (S.inbox && S.dirs.has(loc) && within(loc, S.inbox.loc)) return { title: "Can't focus the INBOX", line: 'Select a project folder' };
  return { title: 'No folder selected', line: 'Select a folder to focus on it' };
}

button.addEventListener('click', () => {
  if (focused()) unfocus();
  else if (canFocus(S.ctx)) focusOn(S.ctx);
  else refuse(button, whyNot());
});

export function paintFocusButton() {
  const on = !!focused(), can = !on && canFocus(S.ctx);
  button.hidden = !pref('focusBtn');
  const tip = on ? unfocusTip(focused()!.name) : can ? focusTip(S.dirs.get(S.ctx)!.name) : NO_FOCUS_TIP;
  if (button.dataset.on !== String(on)) {
    button.innerHTML = on ? UNFOCUS_ICON : FOCUS_ICON;
    button.dataset.on = String(on);
  }
  button.title = tip;
  button.setAttribute('aria-label', on ? 'unfocus' : 'focus');
  if (on || can) button.removeAttribute('aria-disabled');
  else button.setAttribute('aria-disabled', 'true');
}
