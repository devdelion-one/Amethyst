import { amIn, kindIn, ownKey, projIn } from './snap.ts';

interface Win {
  isDestroyed(): boolean;
  isVisible(): boolean;
  hide(): void;
  show(): void;
  showInactive(): void;
  close(): void;
  on(ev: 'closed', fn: () => void): unknown;
}
interface Deps<W> {
  here: (am: number) => string | undefined;
  away: (key: string, w: W) => boolean;
  after: number;
  tell: () => void;
}

export const SITE = 'site';

export function ownedWindows<W extends Win>({ here, away, after, tell }: Deps<W>) {
  const all = new Map<W, string>();
  const hid = new Set<W>();
  const gone = new Map<W, ReturnType<typeof setTimeout> | undefined>();
  const back = new Map<string, Set<string>>();

  const live = () => [...all].filter(([w]) => !w.isDestroyed());
  const at = (kind: string, proj: string) => live().find(([, k]) => k === ownKey(kind, proj))?.[0] || null;

  function add(w: W, key: string) {
    all.set(w, key);
    w.on('closed', () => {
      clearTimeout(gone.get(w));
      all.delete(w);
      hid.delete(w);
      gone.delete(w);
      tell();
    });
    place(w);
  }
  function place(w: W) {
    const key = all.get(w), now = key && here(amIn(key));
    if (!key || now === undefined || w.isDestroyed()) return;
    if (projIn(key) === now) {
      if (!gone.has(w)) return;
      clearTimeout(gone.get(w));
      gone.delete(w);
      if (!hid.has(w) && !away(key, w)) w.showInactive();
    } else if (!gone.has(w)) {
      gone.set(w, kindIn(key) === SITE ? undefined : setTimeout(() => park(w), after));
      w.hide();
    }
  }
  function park(w: W) {
    const key = all.get(w);
    if (!key || w.isDestroyed() || away(key, w)) return;
    if (!hid.has(w)) back.set(projIn(key), new Set([...(back.get(projIn(key)) || []), kindIn(key)]));
    w.close();
  }
  function arrive(proj: string): string[] {
    for (const w of [...all.keys()]) place(w);
    const kinds = [...(back.get(proj) || [])];
    back.delete(proj);
    return kinds;
  }
  function leave(am: number | null) {
    for (const p of [...back.keys()]) if (am === null || amIn(ownKey('', p)) === am) back.delete(p);
    for (const [w, k] of live()) if (kindIn(k) !== SITE && (am === null || amIn(k) === am)) w.close();
  }
  function ready(w: W, still: boolean) {
    if (w.isDestroyed() || gone.has(w) || hid.has(w) || w.isVisible()) return;
    if (still) w.showInactive();
    else w.show();
  }
  function hide(w: W) {
    if (hid.has(w)) return false;
    hid.add(w);
    w.hide();
    return true;
  }
  return {
    add,
    arrive,
    at,
    floating: () => live().filter(([, k]) => kindIn(k) !== SITE).map(([w]) => w),
    gone: (w: W) => gone.has(w),
    hide,
    keyOf: (w: W | null | undefined) => (w && all.get(w)) || '',
    kinds: (proj: string) => live().filter(([w, k]) => projIn(k) === proj && !hid.has(w) && !away(k, w)).map(([, k]) => kindIn(k)),
    leave,
    ready,
    unhide: (w: W) => hid.delete(w),
    winsOf: (kind: string) => live().filter(([, k]) => kindIn(k) === kind).map(([w]) => w),
  };
}
