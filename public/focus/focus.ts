import { levelKey, S, within } from '../base/model.ts';
import { page } from '../base/page.ts';
import { store } from '../base/util.ts';
import type { Folder } from '../base/types.ts';

const keyNow = () => `focus:${levelKey()}`;
const keptLoc = (): string => store.get(keyNow(), '');
const under = (loc: string, top: string) => loc === top || loc.startsWith(top + '/');

export function canFocus(loc: string | null | undefined): boolean {
  const c = loc ? S.dirs.get(loc) : undefined;
  return !!c && !(S.inbox && within(c.loc, S.inbox.loc));
}

export function focused(): Folder | null {
  const loc = keptLoc();
  return canFocus(loc) ? S.dirs.get(loc)! : null;
}

function keep(loc: string) {
  if (loc) store.set(keyNow(), loc);
  else store.del(keyNow());
}

function show(loc: string) {
  page.renderTree();
  page.treeRow('d:' + loc)?.scrollIntoView({ block: 'nearest' });
}

export function focusOn(loc: string) {
  if (!canFocus(loc)) return;
  keep(loc);
  show(loc);
}

export function unfocus() {
  const was = focused();
  keep('');
  show(was?.loc ?? '');
}

export function followFocus(from: string, to: string) {
  const loc = keptLoc();
  if (loc && under(loc, from)) keep(to + loc.slice(from.length));
}

export function dropGoneFocus() {
  if (keptLoc() && !focused()) keep('');
}
