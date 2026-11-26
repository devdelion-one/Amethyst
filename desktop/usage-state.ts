interface Usage {
  on?: boolean;
  asked?: boolean;
  day?: string;
  week?: string;
  month?: string;
  version?: string;
  sent?: { at: number; query: string };
}

const FLAGS = ['first', 'upd', 'w', 'm'] as const;

const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const monthOf = (at: number) => dayOf(at).slice(0, 7);
function weekOf(at: number) {
  const d = new Date(dayOf(at) + 'T00:00:00Z');
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd);
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.floor((+d - jan1) / 864e5 / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}

function due(u: Usage, version: string, at = Date.now()) {
  if (u.on !== true) return null;
  const day = dayOf(at);
  if (u.day === day) return null;
  const week = weekOf(at), month = monthOf(at);
  const parts = [`v=${encodeURIComponent(version)}`];
  if (!u.day) parts.push('first=1');
  if (u.day && u.version !== version) parts.push('upd=1');
  if (u.week !== week) parts.push('w=1');
  if (u.month !== month) parts.push('m=1');
  return { query: parts.join('&'), next: { day, week, month, version } };
}

export { dayOf, due, FLAGS, monthOf, weekOf };
export type { Usage };
