import { TWICE, bound, comboOf, comboWords, defaultOf, howOf, labelOf, modeBind, mods, setBound, show, taken } from './binds.ts';
import { FKEYS, modeFns, modeOfFn, setModeFn } from './model.ts';

type Pressed = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export const fnOf = (id: string) => (id.startsWith('fn:') && id.slice(3)) as string;
const digits = (id: string) => (howOf(id) === 'n' ? ' 1-9' : '');
export const keyText = (id: string): string => (fnOf(id) ? modeFns()[fnOf(id)] : bound(id) && show(bound(id)) + digits(id));
export const labelFor = (id: string) => labelOf(fnOf(id) ? modeBind(fnOf(id)) : id);
export const keyWords = (id: string): string => (fnOf(id) ? modeFns()[fnOf(id)] || '' : comboWords(bound(id), id));
export function clash(id: string, combo: string) {
  const other = taken(id, combo), m = modeOfFn(combo.replace(/^f(\d+)$/, 'F$1'));
  return other ? labelOf(other) : m && m !== fnOf(id) ? labelOf(modeBind(m)) : null;
}
const FIXED = /^(tab|enter|home|end|arrow\w+)$/;
export function refused(id: string, e: Pressed, combo: string) {
  const m = mods(e), how = !fnOf(id) && howOf(id);
  if (fnOf(id)) return FKEYS.includes(e.key) && !m.length ? '' : 'use an F key';
  if (how === 'n') return /^[1-9]$/.test(e.key) && m.length ? '' : 'hold ctrl or alt and press a digit';
  if (how === 'plain') return FIXED.test(combo) ? 'that key stays what it is' : '';
  return m.includes('ctrl') || m.includes('alt') || /^f\d+$/.test(combo) || (combo === 'tab' && id === 'windowKey') ? '' : 'use ctrl or alt with a key, or an F key';
}
export const CAPTURE_NOTE = 'esc keeps it, backspace clears it';
export function pressKey(id: string, e: Pressed): { done: boolean; msg: string } | null {
  const mode = fnOf(id), m = mods(e), how = !mode && howOf(id);
  let combo = comboOf(e, how === 'shift');
  if (!combo) return null;
  if (e.key === 'Escape') return { done: true, msg: '' };
  const clear = (e.key === 'Backspace' || e.key === 'Delete') && !m.length;
  const no = clear ? '' : refused(id, e, combo);
  if (clear) combo = '';
  else if (how === 'n') combo = m.join('+');
  const other = combo && !no && clash(id, combo);
  if (no || other) return { done: false, msg: no || `already “${other}”` };
  if (mode) setModeFn(mode, clear ? '' : e.key);
  else setBound(id, combo);
  return { done: true, msg: `${labelFor(id)}: ${show(combo) || 'no key'}` };
}
export function pressTwice(id: string): string | null {
  if (fnOf(id) || defaultOf(id) !== TWICE) return null;
  setBound(id, TWICE);
  return `${labelFor(id)}: ${show(TWICE)}`;
}
