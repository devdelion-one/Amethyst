export interface Checker {
  wants(name: string): boolean;
  [k: string]: any;
}
const list: Checker[] = [];
const subs = new Set<() => void>();

export function addChecker(checker: Checker) {
  list.push(checker);
  checksChanged();
}

export const checkersFor = (name: string): Checker[] => list.filter((c) => c.wants(name));

export function checksChanged() {
  for (const fn of subs) fn();
}

export function onChecksChanged(fn: () => void) {
  subs.add(fn);
  return () => subs.delete(fn);
}

type Saved = (e: { pid: string; path: string }) => void;
const savedSubs = new Set<Saved>();

export function fileSaved(pid: string, path: string) {
  for (const fn of savedSubs) fn({ pid, path });
}

export function onFileSaved(fn: Saved) {
  savedSubs.add(fn);
  return () => savedSubs.delete(fn);
}
