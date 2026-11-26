import { pref, setPref } from './prefs.ts';
import { record, undoer } from './undo.ts';

type Vals = Record<string, unknown>;
const redraws: (() => void)[] = [];
export const onPrefUndo = (fn: () => void) => redraws.push(fn);
export const prefUndone = () => redraws.forEach((fn) => fn());

const put = (vals: Vals) => {
  for (const [k, v] of Object.entries(vals)) setPref(k, v);
  prefUndone();
};
undoer('prefs', { undo: (d: { before: Vals }) => put(d.before), redo: (d: { after: Vals }) => put(d.after) });

const read = (keys: string[]): Vals => Object.fromEntries(keys.map((k) => [k, structuredClone(pref(k))]));
export function prefStep(label: string, keys: string[], change: () => unknown) {
  const before = read(keys);
  change();
  const after = read(keys);
  if (JSON.stringify(before) !== JSON.stringify(after)) record('prefs', label, { before, after });
}
