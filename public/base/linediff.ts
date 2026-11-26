export type Op = [string, string | null, string | null];
type Piece = { kind: 'same' | 'fold' | 'del' | 'add'; text: string; n?: number };

const lines = (t: string | null | undefined) => (t ? t.split('\n') : []);

export function lineDiff(oldText: string | null | undefined, newText: string | null | undefined): Op[] {
  const a = lines(oldText), b = lines(newText);
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e), B = b.slice(s, b.length - e);
  const ops: Op[] = a.slice(0, s).map((l): Op => ['same', l, l]);
  if (A.length * B.length <= 4e6) {
    const n = A.length, m = B.length, w = m + 1;
    const L = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) ops.push(['same', A[i++], B[j++]]);
      else if (j < m && (i >= n || L[i * w + j + 1] >= L[(i + 1) * w + j])) ops.push(['add', null, B[j++]]);
      else ops.push(['del', A[i++], null]);
    }
  } else ops.push(...A.map((l): Op => ['del', l, null]), ...B.map((l): Op => ['add', null, l]));
  ops.push(...a.slice(a.length - e).map((l): Op => ['same', l, l]));
  return ops;
}

export function lineCount(oldText: string | null | undefined, newText: string | null | undefined): [number, number] {
  let add = 0, del = 0;
  for (const [k] of lineDiff(oldText, newText)) k === 'add' ? add++ : k === 'del' && del++;
  return [add, del];
}

export function hunks(ops: Op[], ctx = 3): Piece[] {
  const out: Piece[] = [];
  const near = new Set<number>();
  ops.forEach(([k], i) => {
    if (k !== 'same') for (let j = i - ctx; j <= i + ctx; j++) near.add(j);
  });
  let skip = 0, n = 0;
  const flush = () => {
    if (skip) out.push({ kind: 'fold', text: `${skip} unchanged line${skip > 1 ? 's' : ''}` });
    skip = 0;
  };
  ops.forEach(([k, a, b], i) => {
    if (k !== 'del') n++;
    if (k === 'same' && !near.has(i)) return void skip++;
    flush();
    out.push(k === 'del' ? { kind: 'del', text: a ?? '' } : { kind: k as Piece['kind'], text: b ?? '', n });
  });
  flush();
  return out;
}
