import { redrawMenu } from '../base/controls.ts';
import { S } from '../base/model.ts';
import { undoer } from '../base/undo.ts';
import { amKey, store } from '../base/util.ts';
import type { Project } from '../base/types.ts';

const KEY = 'projects:hidden' + amKey;
const subs: (() => void)[] = [];
const all = (): Record<string, string[]> => store.get(KEY, {}) || {};
const fire = () => subs.forEach((fn) => fn());

export const hiddenIds = (wid = S.wid): string[] => (wid ? all()[wid] || [] : []);
export const pjHidden = (id: string): boolean => hiddenIds().includes(id);
function put(ids: string[]) {
  if (!S.wid) return;
  const live = new Set(S.projects.map((p) => p.id));
  store.set(KEY, { ...all(), [S.wid]: [...new Set(ids)].filter((id) => live.has(id)) });
  fire();
}
export const setPjHidden = (id: string, on: boolean) => put(hiddenIds().filter((x) => x !== id).concat(on ? [id] : []));
export function setDockOrder(ids: string[]) {
  store.set('dockOrder', { ...store.get('dockOrder', {}), [S.wid]: ids });
  fire();
}
type PjStep = { wid: string; before: string[]; after: string[] };
const putIn = (wid: string, ids: string[]) => {
  if (wid !== S.wid) return false;
  put(ids);
  redrawMenu();
};
undoer('pjhide', { undo: (d: PjStep) => putIn(d.wid, d.before), redo: (d: PjStep) => putIn(d.wid, d.after) });
export function onPjHidden(fn: () => void) {
  subs.push(fn);
}
addEventListener('storage', (e) => e.key === 'mind.' + KEY && fire());

export const dockOrdered = (list: Project[]): Project[] => {
  const at: string[] = store.get('dockOrder', {})[S.wid] || [];
  const rank = (p: Project) => (at.includes(p.id) ? at.indexOf(p.id) : at.length);
  return list.map((p, i): [Project, number] => [p, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
};
export const dockProjects = (): Project[] => dockOrdered(S.projects.filter((p) => !p.missing));
