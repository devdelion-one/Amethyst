import { amKey, store } from './util.ts';

const KEY = 'place' + amKey, DRAFTS = 'chatDraft';
export type Where = { in: string; set?: unknown; [k: string]: unknown };
type Live = { wid: string; has: ((id: string) => boolean) | null } | null;
let live: () => Live = () => null;
export const placeLive = (fn: () => Live) => (live = fn);

const all = (): Record<string, any> => store.get(KEY, null) || (amKey ? {} : migrate());
function migrate(): Record<string, any> {
  const m: Record<string, any> = {}, old: string[] = [];
  for (const k of store.keys()) {
    const at = /^deck:own:([^:]+):(.*)$/.exec(k);
    if (!at) continue;
    old.push(k!);
    const wid = at[2].includes(':') ? at[2].slice(0, at[2].indexOf(':')) : 'main';
    for (const [id, set] of Object.entries(store.get(k!, {}))) m[id] = { in: at[1], set, wid };
  }
  store.set(KEY, m);
  for (const k of old) store.del(k);
  return m;
}

export const owner = (id: string): any => all()[id] || null;
export function place(id: string, where: Where | null | undefined) {
  if (!id) return;
  const m = all(), l = live();
  if (!where) {
    if (!(id in m)) return;
    delete m[id];
    return store.set(KEY, m);
  }
  const now = { ...where, ...(l && { wid: l.wid }) };
  if (JSON.stringify(m[id]) === JSON.stringify(now)) return;
  if (l?.has)
    for (const [k, o] of Object.entries<any>(m)) {
      if (o.wid === undefined) l.has(k) && (o.wid = l.wid);
      else if (o.wid === l.wid && !l.has(k)) delete m[k];
    }
  m[id] = now;
  store.set(KEY, m);
}
export function freeSet(kind: string, set: unknown) {
  const m = all();
  for (const [k, o] of Object.entries<any>(m)) if (o.in === kind && o.set === set) delete m[k];
  store.set(KEY, m);
}

export const draftOf = (key: string | null | undefined): string => (key && store.get(DRAFTS, {})[key]) || '';
export function keepDraft(key: string, text: string, drop?: string) {
  const d = store.get(DRAFTS, {});
  if (drop) delete d[drop];
  if (text) d[key] = text;
  else delete d[key];
  store.set(DRAFTS, d);
}
