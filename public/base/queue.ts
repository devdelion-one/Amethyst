import type { AgentInfo } from './types.ts';

type Waiter = Pick<AgentInfo, 'id' | 'kind' | 'status' | 'at' | 'title' | 'pid'>;
const RANK: Record<string, number> = { asks: 0, done: 1 };

export const waits = (a: Waiter): boolean => a.kind === 'chat' && a.status in RANK;

export function queue<T extends Waiter>(list: Iterable<T>, pid: string): T[] {
  return [...list].filter((a) => (a.pid || '') === pid && waits(a)).sort((x, y) => RANK[x.status] - RANK[y.status] || x.at - y.at);
}
