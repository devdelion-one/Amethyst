type Ev = Record<string, any>;
export type Use = { used: number; base: number };

export const SHRINK_MIN = 50000;
export const SHRINK_WARM = 3600e3;

export function chatUse(events: Ev[]): Use | null {
  let used: number | null = null, base: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'switch') break;
    const u = e.type === 'update' && e.update?.sessionUpdate === 'usage_update' ? e.update : null;
    if (u && typeof u.used === 'number') {
      used ??= u.used;
      base = u.used;
    }
  }
  return used == null || base == null ? null : { used, base };
}

export function lastStart(events: Ev[]): number {
  let ended: number | null = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'switch') break;
    if (e.type === 'turn') {
      if (ended != null) break;
      ended = e.at || 0;
    } else if (e.type === 'you' && ended != null) return e.at || ended;
  }
  return ended || 0;
}

export function shrinkSkip(events: Ev[], now = Date.now(), use: Use | null = chatUse(events)): 'short' | 'cold' | null {
  if (!use || use.used - use.base < SHRINK_MIN) return 'short';
  const last = lastStart(events);
  if (!last || now - last > SHRINK_WARM) return 'cold';
  return null;
}
