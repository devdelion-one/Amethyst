import { levelKey } from './model.ts';
import { amKey, setSave, store } from './util.ts';
import { WIN } from './windows.ts';

interface Undoer {
  undo(d: any): unknown;
  redo(d: any): unknown;
  merge?(a: any, b: any, ms: number): any;
  there?(d: any): boolean;
  go?(d: any): unknown;
}
type Step = { type: string; label: string; data: any; at: number };
type List = { k: string; done: Step[]; undone: Step[] };

const MAX = 50;
const kinds: Record<string, Undoer> = {};
export const undoer = (type: string, h: Undoer) => (kinds[type] = h);
export const DECLINED = Symbol('declined');

const lists = new Map<string, List>();
let busy = false;
function load(name?: string): List {
  const k = 'undo:' + levelKey() + amKey + (WIN > 1 ? '#' + WIN : '') + (name ? ':' + name : '');
  if (!lists.has(k)) {
    const s = structuredClone(store.get(k, null));
    lists.set(k, { k, done: Array.isArray(s?.done) ? s.done : [], undone: Array.isArray(s?.undone) ? s.undone : [] });
  }
  return lists.get(k)!;
}
const keep = (l: List) => store.set(l.k, { done: l.done, undone: l.undone });
const say = (text: string) => setSave(text);

export function record(type: string, label: string, data: unknown, list?: string) {
  if (busy || !kinds[type]) return;
  const l = load(list), { done } = l;
  const top = done.at(-1), now = Date.now();
  const merged = top?.type === type && !!top.at && kinds[type].merge?.(top.data, data, now - top.at);
  if (merged) Object.assign(top, { label, data: merged, at: now });
  else done.push({ type, label, data, at: now });
  if (done.length > MAX) done.splice(0, done.length - MAX);
  l.undone = [];
  keep(l);
}
export const resave = () => keep(load());
export const nextUndo = () => load().done.at(-1)?.label || '';

async function run(back: boolean, list?: string) {
  const l = load(list);
  const from = back ? l.done : l.undone, to = back ? l.undone : l.done;
  const s = from.at(-1), word = back ? 'undo' : 'redo';
  if (!s) return say(`nothing to ${word}`);
  const k = kinds[s.type];
  busy = true;
  try {
    if (k?.there && !k.there(s.data)) {
      await k.go?.(s.data);
      return say(`here: ${s.label} · ${back ? 'ctrl z' : 'ctrl shift z'} again to ${word} it`);
    }
    from.pop();
    const r = k && (await k[word](s.data)), ok = !!k && r !== false;
    if (r === DECLINED) {
      from.push(s);
      keep(l);
      return say(`${word} cancelled`);
    }
    if (ok) to.push(Object.assign(s, { at: 0 }));
    keep(l);
    say(!ok ? `can't ${word} “${s.label}”: it is gone` : typeof r === 'string' ? r : `${back ? 'undone' : 'redone'}: ${s.label}`);
  } catch (e) {
    keep(l);
    say(`can't ${word} “${s.label}”: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}
let line: Promise<unknown> = Promise.resolve();
const step = (back: boolean, list?: string) => (line = line.then(() => run(back, list)));
export const undo = () => step(true);
export const redo = () => step(false);
export const undoIn = (list: string) => step(true, list);
export const redoIn = (list: string) => step(false, list);
