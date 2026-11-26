import { note } from './hitch.ts';
import { api, projectOf, S } from './model.ts';
import { place, placeLive } from './place.ts';
import { AM, amElse, quietly, uid } from './util.ts';
import type { Where } from './place.ts';
import type { AgentInfo } from './types.ts';

type Follow = { what: Record<string, unknown>; on: (ev: any) => void; again?: () => void; failed?: (why: string) => void; pid: string; wid: string; sent: boolean };
export type Agent = AgentInfo;

const OLD = 'The Amethyst server on this PC is older than this page. Close Amethyst and start it again.';
const shared = typeof SharedWorker === 'function';
let c = uid();
const follows = new Map<string, Follow>();
let src: MessagePort | EventSource | null = null, open = false, down = false;

function send(f: string, x: Follow) {
  if (x.sent) x.again?.();
  x.sent = true;
  if (shared) (src as MessagePort).postMessage({ t: 'follow', f, wid: x.wid });
  api('POST', '/api/stream', { c, f, ...x.what }, x.pid, x.wid).catch((e) => x.failed?.(/no such endpoint/i.test(e.message) ? OLD : e.message));
}
function opened(id: string) {
  c = id;
  open = true;
  down = false;
  for (const [f, x] of follows) send(f, x);
}
function got(f: string, e: unknown, size: number, t = performance.now()) {
  const x = follows.get(f);
  x?.on(e);
  if (x) note(Object.keys(x.what)[0], size, performance.now() - t);
}
function lost() {
  open = false;
  down = true;
  if (!shared) src = null;
  for (const x of follows.values()) x.failed?.(OLD);
}
function connect() {
  if (shared) {
    src = new SharedWorker('/base/streamworker.ts', { name: 'pm-stream' }).port;
    src.onmessage = ({ data: d }) => (d.t === 'e' ? got(d.f, d.e, d.n) : d.t === 'open' ? opened(d.c) : d.t === 'failed' && lost());
    src.postMessage({ t: 'join' });
    return;
  }
  const es = (src = new EventSource('/api/stream?c=' + c));
  es.onopen = () => opened(c);
  es.onmessage = (m) => {
    const t = performance.now(), { f, e } = JSON.parse(m.data);
    got(f, e, m.data.length, t);
  };
  es.onerror = () => {
    open = false;
    if (es.readyState === EventSource.CLOSED) lost();
  };
}

addEventListener('pagehide', (e) => {
  if (!e.persisted || !src) return;
  open = false;
  if (shared) return (src as MessagePort).postMessage({ t: 'bye' });
  src.close();
  src = null;
});
addEventListener('pageshow', (e) => {
  if (!e.persisted || !follows.size) return;
  if (shared) (src as MessagePort | null)?.postMessage({ t: 'join' });
  else if (!src) connect();
});

export function follow(what: Record<string, unknown>, on: (ev: any) => void, { again, failed, pid = '', wid = S.wid }: { again?: () => void; failed?: (why: string) => void; pid?: string; wid?: string } = {}) {
  const f = uid(), x = { what, on, again, failed, pid, wid, sent: false };
  follows.set(f, x);
  if (!src) connect();
  else if (open) send(f, x);
  else if (shared && down) {
    down = false;
    (src as MessagePort).postMessage({ t: 'join' });
  }
  return () => {
    if (!follows.delete(f)) return;
    if (shared) (src as MessagePort).postMessage({ t: 'stop', f });
    if (open && x.sent) quietly(api('POST', '/api/stream', { c, f, stop: true }, '', x.wid));
  };
}

export const agents = { all: new Map<string, Agent>(), loaded: false, why: '' };
export type Counts = { asks: number; working: number; done: number };
export function agentCounts(): Map<string, Counts> {
  const n = new Map<string, Counts>();
  for (const a of agents.all.values()) {
    const st = a.status === 'starting' ? 'working' : a.status;
    if ((st !== 'asks' && st !== 'done' && st !== 'working') || amElse(a)) continue;
    const c = n.get(a.pid) || { asks: 0, working: 0, done: 0 };
    c[st]++;
    n.set(a.pid, c);
  }
  return n;
}
const watchers = new Set<(o: { lineOnly: boolean }) => void>();
const changed = (lineOnly = false) => watchers.forEach((fn) => fn({ lineOnly }));
const lineOnly = (was: AgentInfo | undefined, now: AgentInfo) => {
  if (!was) return false;
  const keys = new Set([...Object.keys(was), ...Object.keys(now)] as (keyof AgentInfo)[]);
  keys.delete('line');
  keys.delete('at');
  return [...keys].every((k) => JSON.stringify(was[k]) === JSON.stringify(now[k]));
};
export function onAgents(fn: (o: { lineOnly: boolean }) => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
export const chatOfSession = (session: string): Agent | undefined => [...agents.all.values()].find((a) => a.kind === 'chat' && a.session === session && a.status !== 'ended');
export function knowAgent(a: Agent, quiet = false) {
  if (agents.all.has(a.id)) return;
  agents.all.set(a.id, a);
  if (quiet) queueMicrotask(() => changed());
  else changed();
}
export function forgetAgent(id: string) {
  if (!agents.all.delete(id)) return;
  changed();
}
export function started({ id, kind, program, pid, title = '' }: { id: string; kind: string; program?: string; pid: string; title?: string }, where?: Where | null, quiet = false) {
  if (where) place(id, where);
  knowAgent({ id, kind, program, title, status: 'starting', line: '', at: Date.now(), pid, project: projectOf(pid)?.name || '', am: AM }, quiet);
}

let stopList: (() => void) | null = null, listOf: string | null = null;
placeLive(() => (listOf ? { wid: listOf, has: agents.loaded ? (id) => agents.all.has(id) : null } : null));
export function watchAgents(wid: string | null) {
  if (wid === listOf) return;
  stopList?.();
  stopList = null;
  listOf = wid;
  agents.all.clear();
  agents.loaded = false;
  agents.why = '';
  if (wid)
    stopList = follow(
      { agents: true },
      (ev) => {
        let only = false;
        if (ev.type === 'all') {
          agents.all.clear();
          for (const a of ev.agents) agents.all.set(a.id, a);
          agents.loaded = true;
        } else if (ev.type === 'agent') {
          if (ev.agent.status === 'ended' && !agents.all.has(ev.agent.id)) return;
          only = lineOnly(agents.all.get(ev.agent.id), ev.agent);
          agents.all.set(ev.agent.id, ev.agent);
        } else if (ev.type === 'gone') agents.all.delete(ev.id);
        changed(only);
      },
      {
        wid,
        again: () => (agents.loaded = false),
        failed: (why) => {
          agents.why = why;
          changed();
        },
      },
    );
  changed();
}
