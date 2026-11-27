type Deck = { el: HTMLElement; detach(): void; show(on: boolean): void; paintPins?(): void; [how: string]: any };
type Make = (kind: string, set: string | null) => Deck;

let make: Make | null = null;
let level = '';
const levels = new Map<string, Map<string, Deck>>();
const key = (kind: string | null, set: string | null) => `${kind}:${set}`;
const KEPT = ['term', 'orch'];
const ORCH_CAP = 4;
const recentOrch: string[] = [];
const wsOf = (l: string) => l.split('|')[0];
const here = () => levels.get(level) || levels.set(level, new Map()).get(level)!;
const drop = (m: Map<string, Deck>, k: string) => {
  const d = m.get(k)!;
  d.detach();
  d.el.remove();
  m.delete(k);
};
const dropOrch = (lv: string) => {
  const m = levels.get(lv);
  if (!m) return;
  for (const k of [...m.keys()]) if (k.split(':')[0] === 'orch') drop(m, k);
  if (!m.size) levels.delete(lv);
};
const touchOrch = (lv: string) => {
  const i = recentOrch.indexOf(lv);
  if (i >= 0) recentOrch.splice(i, 1);
  recentOrch.push(lv);
  while (recentOrch.length > ORCH_CAP) dropOrch(recentOrch.shift()!);
};
const pass = (how: string) => (kind: string | null, set: string | null, ...args: any[]) => levels.get(level)?.get(key(kind, set))?.[how]?.(...args);

export function decksMaker(fn: Make) {
  make = fn;
}

export const decks = {
  at(l: string) {
    if (l === level) return;
    const same = wsOf(l) === wsOf(level);
    for (const [lv, m] of levels) for (const k of [...m.keys()]) if (!same || (lv === level && !KEPT.includes(k.split(':')[0]))) drop(m, k);
    if (!same) {
      levels.clear();
      recentOrch.length = 0;
    }
    level = l;
  },
  forget(l: string) {
    const m = levels.get(l);
    if (m) {
      for (const k of [...m.keys()]) drop(m, k);
      levels.delete(l);
    }
    const i = recentOrch.indexOf(l);
    if (i >= 0) recentOrch.splice(i, 1);
  },
  show(kind: string | null, set: string | null) {
    const want = kind ? key(kind, set) : '';
    if (want && !here().has(want)) here().set(want, make!(kind!, set));
    if (kind === 'orch') touchOrch(level);
    for (const [lv, m] of levels)
      for (const [k, d] of m)
        if (!(lv === level && k === want)) d.show(false);
    for (const [lv, m] of levels)
      for (const [k, d] of m) {
        if (lv === level && k === want) d.show(true);
        if (lv === level) d.paintPins?.();
      }
  },
  has: (kind: string | null, set: string | null) => !!levels.get(level)?.has(key(kind, set)),
  close(kind: string | null, set: string | null) {
    if (!decks.has(kind, set)) return;
    const m = levels.get(level)!;
    drop(m, key(kind, set));
    if (kind === 'orch' && ![...m.keys()].some((k) => k.split(':')[0] === 'orch')) {
      const i = recentOrch.indexOf(level);
      if (i >= 0) recentOrch.splice(i, 1);
    }
  },
  focus: pass('focus'),
  attach: pass('attach'),
  openFile: pass('openFile'),
  refresh: pass('refresh'),
  open: pass('open'),
  resume: pass('resume'),
  take: pass('take'),
  letGo: pass('letGo'),
  back: pass('back'),
  again: pass('again'),
  newAgent: pass('newAgent'),
};
