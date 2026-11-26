import { S } from '../base/model.ts';
import { canFocus, focused, focusOn, unfocus } from './focus.ts';
import { FOCUS_ICON, focusTip, UNFOCUS_ICON, unfocusTip } from './focuslook.ts';

export type FocusItem = { label: string; svg: string; tip: string; run: () => void };

export function focusItem(loc: string): FocusItem | null {
  if (focused()) return { label: 'unfocus', svg: UNFOCUS_ICON, tip: unfocusTip(focused()!.name), run: unfocus };
  if (!canFocus(loc)) return null;
  return { label: 'focus', svg: FOCUS_ICON, tip: focusTip(S.dirs.get(loc)!.name), run: () => focusOn(loc) };
}
