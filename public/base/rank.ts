export interface Rankable {
  name: string;
  rest: string;
  touched?: number;
  low?: string;
  lowRest?: string;
}

export function fit(q: string, row: Rankable) {
  const n = (row.low ??= row.name.toLowerCase());
  if (n.startsWith(q)) return 0;
  const i = n.indexOf(q);
  if (i > 0) return /[\s\-_.]/.test(n[i - 1]) ? 1 : 2;
  const r = (row.lowRest ??= row.rest.toLowerCase());
  if (r.includes(q)) return 3;
  let j = 0;
  for (const c of r) if (c === q[j]) j++;
  return j >= q.length ? 4 : -1;
}

export const rank = <T extends Rankable>(rows: T[], q: string, worst = 4): T[] =>
  rows
    .map((r, i) => ({ r, i, f: q ? fit(q, r) : 0 }))
    .filter((h) => h.f >= 0 && h.f <= worst)
    .sort((a, b) => a.f - b.f || (b.r.touched || 0) - (a.r.touched || 0) || a.i - b.i)
    .map((h) => h.r);
