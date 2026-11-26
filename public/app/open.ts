import { edShown, pageUrl } from '../base/model.ts';
import { outside } from '../base/follow.ts';
import { floatOpen } from './float.ts';
import { openInWindow } from './groups.ts';
import { goLineIn, openInTab } from './tabs.ts';

export type Where = 'here' | 'tab' | 'quick' | 'window' | 'group' | 'browser';

export const hereOf = (): Where => (edShown() ? 'tab' : 'quick');

export function openFile(path: string, where: Where = 'here', { text = false, line = 0 }: { text?: boolean; line?: number } = {}) {
  const to = where === 'here' ? hereOf() : where, url = !text && pageUrl(path);
  if (to === 'browser') return url ? outside(url) : undefined;
  if (to === 'window') return openInWindow(url ? { kind: 'web', url } : { kind: 'path', rel: path });
  if (to === 'quick' && floatOpen(path, line, text)) return;
  openInTab(path, { text, side: to === 'group' });
  if (line) goLineIn(path, line);
}
