import path from 'path';

type Out = (e: Record<string, unknown>) => void;
type End = 'yes' | 'no' | 'timeout';
type Ask = { id: number; project: string; engine: string; name: string; label: string; waiters: Set<(x: End) => void>; ended: Set<() => void> };

const asks = new Map<string, Ask>();
const subs = new Set<Out>();
let next = 1;
const keyOf = (project: string, engine: string) => `${path.normalize(project)}|${path.normalize(engine)}`.toLowerCase();
const same = (a: string, b: string) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
const pub = (a: Ask) => ({ id: a.id, project: a.project, engine: a.engine, name: a.name, label: a.label });
const say = (e: Record<string, unknown>) => subs.forEach((out) => out(e));

function follow(out: Out) {
  subs.add(out);
  for (const a of asks.values()) out({ type: 'ask', ask: pub(a) });
  return () => subs.delete(out);
}

const watched = () => subs.size > 0;

function end(a: Ask, how: End) {
  if (asks.get(keyOf(a.project, a.engine)) !== a) return;
  asks.delete(keyOf(a.project, a.engine));
  say({ type: 'end', id: a.id, how });
  for (const w of [...a.waiters]) w(how);
  for (const f of a.ended) f();
}

function wait(info: { project: string; engine: string; name: string; label: string }, seconds: number) {
  const k = keyOf(info.project, info.engine);
  let a = asks.get(k);
  if (!a) {
    a = { id: next++, ...info, waiters: new Set(), ended: new Set() };
    asks.set(k, a);
    say({ type: 'ask', ask: pub(a) });
  }
  const it = a;
  return new Promise<End>((res) => {
    const t = seconds > 0 ? setTimeout(() => done('timeout'), seconds * 1000) : null;
    const done = (how: End) => {
      if (t) clearTimeout(t);
      it.waiters.delete(done);
      if (how === 'timeout' && !it.waiters.size) end(it, 'timeout');
      res(how);
    };
    it.waiters.add(done);
  });
}

function byId(id: number) {
  return [...asks.values()].find((a) => a.id === id) || null;
}

function answer(id: number, yes: boolean) {
  const a = byId(id);
  if (a) end(a, yes ? 'yes' : 'no');
  return a;
}

function given(project: string, engine: string) {
  const a = asks.get(keyOf(project, engine));
  if (a) end(a, 'yes');
}

function pendingIn(project: string) {
  return [...asks.values()].find((a) => same(a.project, project)) || null;
}

function whenEnded(a: Ask, seconds: number) {
  return new Promise<boolean>((res) => {
    const t = seconds > 0 ? setTimeout(() => (a.ended.delete(f), res(false)), seconds * 1000) : null;
    const f = () => {
      if (t) clearTimeout(t);
      res(true);
    };
    a.ended.add(f);
  });
}

export { follow, watched, wait, answer, byId, given, pendingIn, whenEnded };
