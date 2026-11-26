import { AsyncLocalStorage } from 'async_hooks';
import { HttpError } from './routes.ts';
import type { Routes } from '../../public/base/types.ts';

type Out = (e: Record<string, unknown>) => void;
type Body = Record<string, unknown> | null | undefined;
export type End = 'yes' | 'no' | 'gone' | 'timeout' | 'nowindow';
export type What = { title: string; text: string; warn?: string; code?: string };
export const CODE_MAX = 20000;
type Ask = What & { id: number; done: (how: End) => void };

let hooks = { free: (_b: Body) => true, who: (_b: Body) => 'An agent outside Amethyst or a terminal' };
export const init = (h: Partial<typeof hooks>) => void (hooks = { ...hooks, ...h });

const asks = new Map<number, Ask>();
const subs = new Set<Out>();
const hangup = new AsyncLocalStorage<AbortSignal>();
let next = 1;

export const during = <T>(signal: AbortSignal, run: () => T): T => hangup.run(signal, run);
export const free = (body: Body) => hooks.free(body);
export const whoAsks = (body: Body) => hooks.who(body);
const pub = (a: Ask) => ({ id: a.id, title: a.title, text: a.text, warn: a.warn || '', ...(a.code != null && { code: a.code }) });
const say = (e: Record<string, unknown>) => subs.forEach((out) => out(e));

export function follow(out: Out) {
  subs.add(out);
  for (const a of asks.values()) out({ type: 'ask', ask: pub(a) });
  return () => void subs.delete(out);
}

export function ask(what: What, seconds = 0): Promise<End> {
  if (!subs.size) return Promise.resolve('nowindow');
  const signal = hangup.getStore();
  if (signal?.aborted) return Promise.resolve('gone');
  return new Promise<End>((res) => {
    const id = next++;
    const t = seconds > 0 ? setTimeout(() => done('timeout'), seconds * 1000) : null;
    const gone = () => done('gone');
    const done = (how: End) => {
      if (!asks.delete(id)) return;
      if (t) clearTimeout(t);
      signal?.removeEventListener('abort', gone);
      say({ type: 'end', id, how });
      res(how);
    };
    signal?.addEventListener('abort', gone, { once: true });
    const a: Ask = { ...what, id, done };
    asks.set(id, a);
    say({ type: 'ask', ask: pub(a) });
  });
}

export function answer(id: number, yes: boolean) {
  const a = asks.get(id);
  if (!a) return false;
  a.done(yes ? 'yes' : 'no');
  return true;
}

export const SAID: Record<Exclude<End, 'yes'>, string> = {
  no: 'the user said not now in Amethyst: ask them before trying again',
  gone: 'the call ended before the user answered',
  timeout: "the user hasn't answered the prompt in Amethyst in time: try again, with a longer --timeout or --timeout 0 to wait as long as it takes",
  nowindow: "this needs the user's OK in Amethyst's window, and none is open",
};

export async function mayRun(body: Body, what: (who: string) => What, seconds = 0) {
  if (free(body)) return;
  const w = what(whoAsks(body));
  if (w.code != null && w.code.length > CODE_MAX) throw new HttpError(400, `too long to show in the prompt: at most ${CODE_MAX.toLocaleString('en-US')} characters; split it`);
  const how = await ask(w, seconds);
  if (how !== 'yes') throw new HttpError(403, SAID[how]);
}

export const ROUTES: Routes = {
  'POST /api/runs/ask': async ({ id, yes }) => ({ ok: answer(Number(id), yes === true) }),
};
