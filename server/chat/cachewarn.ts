import * as live from '../base/live.ts';
import { crystalOf } from '../../public/base/codes.ts';
import type { Live } from '../base/live.ts';

export const SOON = 45 * 60e3;
export const GONE = 60 * 60e3;
const WAITING = new Set(['idle', 'done', 'asks']);
const warned = new Map<string, number>();
const boot = Date.now();

export const caches = (a: Pick<Live, 'kind' | 'program' | 'status'>) => a.kind === 'chat' && a.program === 'claude' && WAITING.has(a.status);

export function dueNow(list: Live[], now = Date.now(), since = boot) {
  const out: Live[] = [];
  for (const a of list) {
    if (!caches(a) || a.cacheOff || a.under) continue;
    const age = now - a.at;
    if (age < SOON || age >= GONE || a.at + SOON < since || warned.get(a.id) === a.at) continue;
    warned.set(a.id, a.at);
    out.push(a);
  }
  return out;
}

const parentPort = () => (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
function tick() {
  for (const a of dueNow(live.all())) {
    const left = Math.max(1, Math.round((a.at + GONE - Date.now()) / 60e3));
    parentPort()?.postMessage({ report: { id: a.id, code: crystalOf(a.id).code, title: a.title || '', line: `Its cache runs out in ${left} min. A message after that costs more.`, text: '', why: 'cold', am: a.am || 1, pid: a.pid || '', ask: null, until: a.at + GONE } });
  }
}
setInterval(tick, 60e3).unref?.();
