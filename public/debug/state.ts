import { api, projectOf, S } from '../base/model.ts';
import { follow } from '../base/stream.ts';

export type Frame = { id: number; name: string; module: string; file: string; line: number; col: number; lib: boolean; source: boolean; bp?: boolean; blueprint?: string; fn?: string; object?: string };
export type Stop = { reason: string; text: string; threadId: number; hit: number[]; at: number; by: string; where: Frame | null; mine: number; kind: string; change: { name: string; old: string; now: string } | null; exception: { id: string; text: string } | null; nulls: string[]; line: string };
export type Session = { data?: { name: string; expr: string; old: string; hits: number }[]; libs?: string[]; name: string; kind: string; mode: string; note: string; state: string; started: number; stop: Stop | null; pid: number; ended: { code: number | null; why: string } | null; by: string; steps: number };
export type LiveBp = { verified: boolean; line: number; why: string; pending: boolean; hits: number };
export type Bp = { file: string; line: number; cond?: string; off?: boolean; by: string; at: number; abs: string; live?: LiveBp };
export type Engine = { ready: boolean; os: boolean; dir: string; version: string; missing: string[]; published: boolean; mb: number; licence: string; fake: boolean; installing: boolean; bytes: number };
export type Var = { name: string; value: string; type: string; ref: number; expr: string; kids: number };

export const D = {
  key: '',
  pid: '',
  wid: '',
  session: null as Session | null,
  bps: [] as Bp[],
  output: [] as string[],
  engine: null as Engine | null,
  frames: [] as Frame[],
  frame: 0,
  thread: 0,
  busy: '',
  err: '',
  last: null as Stop | null,
  cardShut: '',
  libs: [] as string[],
  vals: new Map<string, string>(),
  prevVals: new Map<string, string>(),
  valsFn: '',
};

export const acts = {} as { go: () => unknown; stop: (end?: boolean) => unknown; openFrame: (f: Frame | null) => unknown; ask: (text: string) => unknown; runTo: (abs: string, line: number) => unknown; goto: (abs: string, line: number, over: Element | null) => unknown; unwatch: (name: string) => unknown };

const subs = new Set<(why: string) => void>();
export const onDebug = (fn: (why: string) => void) => (subs.add(fn), () => subs.delete(fn));
export const changed = (why: string) => subs.forEach((fn) => fn(why));

export const fold = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
export const live = () => !!D.session && D.session.state !== 'ended';
export const stopped = () => D.session?.state === 'stopped';
export const running = () => D.session?.state === 'running';
export const rootOf = () => projectOf(D.pid)?.path || '';
export const absOf = (rel: string) => {
  const r = rootOf();
  return /^([a-z]:[\\/]|\/)/i.test(rel) || !r ? rel : r.replace(/[\\/]+$/, '') + '/' + rel;
};

export const call = (url: string, body: Record<string, unknown> = {}) => api('POST', url, body, D.pid, D.wid);

let stopFollow: (() => void) | null = null;

function onEvent(e: any) {
  if (e.type === 'all') {
    D.session = e.session;
    if (e.session?.libs?.length) D.libs = e.session.libs;
    D.bps = e.bps || [];
    D.output = e.output || [];
    D.engine = e.engine || null;
    D.frames = [];
    D.frame = 0;
    if (stopped()) loadFrames();
    return changed('all');
  }
  if (e.type === 'state') {
    const was = D.session?.state, stop = e.session?.stop as Stop | null;
    D.session = e.session;
    if (e.session?.libs?.length) D.libs = e.session.libs;
    if (D.session?.state === 'stopped' && stop) {
      D.last = stop;
      D.thread = stop.threadId;
      D.frame = Math.max(0, stop.where ? 0 : stop.mine);
      loadFrames();
    } else if (D.session?.state !== 'stopped') D.frames = [];
    return changed(was === D.session?.state ? 'state' : `state:${D.session?.state || 'none'}`);
  }
  if (e.type === 'bps') {
    D.bps = e.bps || [];
    return changed('bps');
  }
  if (e.type === 'moved') return changed(`moved:${e.abs}#${e.from}#${e.to}`);
  if (e.type === 'output') {
    D.output.push(...(e.lines || []));
    if (D.output.length > 2000) D.output.splice(0, D.output.length - 2000);
    return changed('output');
  }
  if (e.type === 'engine') {
    D.engine = e.engine;
    return changed('engine');
  }
}

export async function loadFrames() {
  const at = D.session?.stop?.at;
  try {
    const r = await call('/api/debug/stack', D.thread ? { threadId: D.thread } : {});
    if (D.session?.stop?.at !== at) return;
    D.frames = r.frames || [];
    const top = D.frames.findIndex((f) => f.source), w = D.session?.stop?.where;
    const pick = w && D.thread === D.session?.stop?.threadId ? D.frames.findIndex((f) => f.id === w.id) : -1;
    D.frame = pick >= 0 ? pick : top >= 0 ? top : 0;
    changed('frames');
  } catch (e) {
    D.err = (e as Error).message;
    changed('err');
  }
}

export function followProject(pid: string, wid: string) {
  const key = pid ? `${wid}|${pid}` : '';
  if (key === D.key) return;
  stopFollow?.();
  stopFollow = null;
  Object.assign(D, { key, pid, wid, session: null, bps: [], output: [], engine: null, frames: [], frame: 0, thread: 0, busy: '', err: '', last: null, cardShut: '', libs: [] });
  changed('all');
  if (!key) return;
  stopFollow = follow({ debug: true }, onEvent, { pid, wid, failed: (m) => ((D.err = m), changed('err')) });
}

export const here = () => ({ pid: S.pid, wid: S.wid });
export const isLib = (abs: string) => !!abs && D.libs.some((d) => fold(abs).startsWith(fold(d) + '/'));
export const bpsIn = (abs: string) => D.bps.filter((b) => fold(b.abs) === fold(abs));
export const frameNow = () => D.frames[D.frame] || null;
export const frameText = (f: Frame) => (f.bp ? `Blueprint ${f.name}${f.object ? ` (${f.object})` : ''}` : `${f.module ? f.module + '!' : ''}${f.name}${f.file ? ` (${f.file}:${f.line})` : ''}`);
