import { levelKey, S } from './model.ts';
import { listKey, onPref, pref } from './prefs.ts';
import { amKey, store, uid } from './util.ts';

export type ChatFolder = { id: string; name: string; at: string; shut: boolean; icon: string; ic: string; bg: string; dock?: boolean };
type Saved = { list: ChatFolder[]; of: Record<string, string> };
type Chat = { kind?: string; session?: string | null };

export const ANCHORS = ['asks', 'working', 'done', 'bench', ''];
const keyOf = (list: string) => 'chat:folders:' + (list === 'orch' ? '' : list + ':') + levelKey() + amKey;
const fns = new Set<() => void>();
const EMPTY: Saved = { list: [], of: {} };

function read(list: string): Saved {
  const k = keyOf(list), v = store.get(k, null);
  if (v && Array.isArray(v.list)) return { list: v.list, of: v.of && typeof v.of === 'object' ? v.of : {} };
  if (!S.pid || list !== 'orch') return EMPTY;
  const old: string[] = store.get('orch:parked:' + levelKey(), []);
  if (!Array.isArray(old) || !old.length) return EMPTY;
  const id = uid(), s: Saved = { list: [{ id, name: 'Parked', at: '', shut: !store.get('orch:park-open', false), icon: 'folder', ic: '', bg: '' }], of: {} };
  for (const x of old) if (typeof x === 'string') s.of[x] = id;
  store.set(k, s);
  return s;
}
function write(list: string, s: Saved) {
  const ids = new Set(s.list.map((f) => f.id));
  const of = Object.fromEntries(Object.entries(s.of).filter(([, f]) => ids.has(f)));
  store.set(keyOf(list), { list: s.list, of });
  fns.forEach((f) => f());
}

export const foldersOn = (list: string) => !!pref(listKey(list, 'folders'));
export const folders = (list: string): ChatFolder[] => (foldersOn(list) ? read(list).list : []);
export const folderById = (list: string, id: string) => read(list).list.find((f) => f.id === id) || null;
export const canFile = (list: string, a: Chat | null | undefined) => !!a && a.kind === 'chat' && !!a.session && foldersOn(list);
export function folderOf(list: string, a: Chat | null | undefined): ChatFolder | null {
  if (!canFile(list, a)) return null;
  const s = read(list), id = s.of[a!.session!];
  return (id && s.list.find((f) => f.id === id)) || null;
}

export function makeFolder(list: string, name: string, session?: string | null) {
  const s = read(list), id = uid();
  const of = session ? { ...s.of, [session]: id } : s.of;
  write(list, { list: [...s.list, { id, name, at: '', shut: false, icon: 'folder', ic: '', bg: '' }], of });
  return id;
}
export function setFolder(list: string, id: string, patch: Partial<Omit<ChatFolder, 'id'>>) {
  const s = read(list);
  if (!s.list.some((f) => f.id === id)) return;
  write(list, { list: s.list.map((f) => (f.id === id ? { ...f, ...patch } : f)), of: s.of });
}
export function dropFolder(list: string, id: string) {
  const s = read(list);
  write(list, { list: s.list.filter((f) => f.id !== id), of: Object.fromEntries(Object.entries(s.of).filter(([, f]) => f !== id)) });
}
export function moveFolder(list: string, id: string, at: string, order: string[], dock = false) {
  const s = read(list), f = s.list.find((x) => x.id === id);
  if (!f) return;
  const rank = (x: ChatFolder) => {
    const i = order.indexOf(x.id);
    return i < 0 ? order.length + s.list.indexOf(x) : i;
  };
  const sorted = s.list.map((x) => (x.id === id ? { ...x, at, dock } : x)).sort((a, b) => rank(a) - rank(b));
  write(list, { list: sorted, of: s.of });
}
export function dockFolder(list: string, id: string, on: boolean) {
  const s = read(list), f = s.list.find((x) => x.id === id);
  if (!f) return;
  write(list, { list: [...s.list.filter((x) => x !== f), { ...f, at: '', dock: on }], of: s.of });
}
export function fileChat(list: string, a: Chat, id: string | null) {
  if (!a.session) return false;
  const s = read(list), of = { ...s.of };
  if (id) of[a.session] = id;
  else delete of[a.session];
  write(list, { list: s.list, of });
  return true;
}
export function onFolders(fn: () => void) {
  fns.add(fn);
  return () => void fns.delete(fn);
}

if (store.get('orch:folderBtn', null) == null && typeof store.get('orch:parkBtn', null) === 'boolean') store.set('orch:folderBtn', store.get('orch:parkBtn', true));
for (const l of ['orch', 'deck']) onPref(listKey(l, 'folders'), () => fns.forEach((f) => f()));
