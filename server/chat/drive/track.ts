import fs from 'fs';
import path from 'path';
import * as live from '../../base/live.ts';
import * as agents from '../agents.ts';
import { HttpError } from '../../base/routes.ts';
import { ago, codeOf, mayAnswer, quote, route } from './caller.ts';
import { askOut, optionsLine, permissionLike, setOption } from './answer.ts';
import { heldText } from './modes.ts';
import type { Live } from '../../base/live.ts';
import type { Chat } from '../agents.ts';
import type { Caller } from './caller.ts';

type State = 'queued' | 'working' | 'asks' | 'done' | 'ended';
type Tool = 'chat' | 'agent';
interface Sent {
  qid: string;
  by: string;
  worker: string;
  at: number;
  tell: boolean;
  tool: Tool;
  state: State;
  reason?: string;
  end?: number;
  seen: boolean;
  told: boolean;
  askTold?: string;
  notice?: string;
}
type Told = { s: Sent; ask: string | null };
interface Waiter {
  by: string;
  ids: string[];
  qid: string | null;
  asks: boolean;
  may: boolean;
  at: number;
  done: (r: Result) => void;
}
export type Result = { status: string; text: string; [k: string]: unknown };

export const MAX_TURN = 50;
const TELL_AFTER = 1500;
const IMAGES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

const sent = new Map<string, Sent>();
const current = new Map<string, string>();
export const started = new Map<string, string>();
const turnSends = new Map<string, number>();
const wantWt = new Set<string>();
const reported = new Map<string, string>();
const waiters = new Set<Waiter>();
const tells = new Map<string, ReturnType<typeof setTimeout>>();
const notices = new Map<string, { by: string; told: Told[] }>();

export function seeEvent(c: Chat, ev: any) {
  const t = ev.type;
  if (t === 'you') {
    drop(ev.qid);
    turnSends.delete(c.id);
    if (ev.qid) current.set(c.id, ev.qid);
    const s = sent.get(ev.qid);
    if (s) s.state = 'working';
  } else if (t === 'ask') {
    const s = sent.get(current.get(c.id) || '');
    if (s && s.state === 'working') (s.state = 'asks'), changed(s);
  } else if (t === 'answered') {
    const s = sent.get(current.get(c.id) || '');
    if (s && s.state === 'asks' && !c.asks.size) s.state = 'working';
  } else if (t === 'turn') {
    const s = sent.get(current.get(c.id) || '');
    current.delete(c.id);
    if (s) Object.assign(s, { state: 'done', reason: ev.stopReason || 'end_turn', end: Date.now() }), changed(s);
  } else if (t === 'unqueued') {
    for (const q of ev.qids || []) drop(q);
    for (const q of ev.qids || []) {
      const s = sent.get(q);
      if (s && s.state === 'queued') Object.assign(s, { state: 'done', reason: 'unsent', end: Date.now() }), changed(s);
    }
  } else if (t === 'end') {
    for (const s of sent.values()) if (s.worker === c.id && s.state !== 'done' && s.state !== 'ended') Object.assign(s, { state: 'ended', reason: ev.why || 'ended', end: Date.now() }), changed(s);
  } else return;
  poke();
  recheck();
}


const waitingFor = (by: string, worker: string) => [...waiters].some((w) => w.by === by && w.ids.includes(worker));

function changed(s: Sent) {
  if (s.by === 'cli' || !s.tell || s.seen || waitingFor(s.by, s.worker) || (s.tool === 'agent' && s.state === 'asks')) return;
  if (s.state === 'asks' ? s.askTold === askNow(s.worker) : s.told) return;
  clearTimeout(tells.get(s.by));
  tells.set(s.by, setTimeout(() => tellNow(s.by), TELL_AFTER));
}

const askNow = (id: string) => String((live.get(id) as Live | undefined)?.ask?.id ?? '');

function lineOf(s: Sent) {
  const a = live.get(s.worker) as Live | undefined, code = codeOf(s.worker), took = ago(s.at), read = s.tool === 'agent' ? `amethyst agent wait ${code}` : `amethyst chat read ${code}`;
  if (s.state === 'asks') {
    const k = a?.ask;
    return `${code} asks${k ? `: ${quote(k.form?.message || `${k.q} ${k.what}`, 160)}` : ''}. See it with amethyst chat asks ${code}; answer with amethyst chat answer (permission asks are the user's).`;
  }
  if (s.state === 'ended') return `${code} ended (${s.reason || 'closed'}) before it answered.`;
  if (s.reason === 'cancelled') return `${code} was stopped (${took}).`;
  if (s.reason === 'unsent') return `${code} didn't take your message: it was taken back from its queue.`;
  if (s.reason === 'error') return `${code} failed (${took}): ${s.tool === 'agent' ? `${read} gives what it said` : `read what it said with ${read}`}.`;
  return `${code} finished (${took}): ${s.tool === 'agent' ? `${read} gives its answer` : `read it with ${read}`}.`;
}

function tellNow(by: string) {
  tells.delete(by);
  if (!live.get(by) || live.get(by).status === 'ended') return;
  const due = [...sent.values()].filter((s) => s.by === by && s.tell && !s.seen && !waitingFor(by, s.worker) && (s.state === 'asks' ? s.askTold !== askNow(s.worker) : (s.state === 'done' || s.state === 'ended') && !s.told));
  if (!due.length) return;
  for (const s of due) {
    if (s.state === 'asks') s.askTold = askNow(s.worker);
    else s.told = true;
  }
  const told = due.map((s) => ({ s, ask: s.state === 'asks' ? s.askTold! : null }));
  route('POST /api/agent/send')({ id: by, prompt: due.map(lineOf).join('\n'), from: 'amethyst' }, new URLSearchParams())
    .then((r) => {
      if (!r?.queued) return;
      notices.set(r.qid, { by, told });
      for (const s of due) s.notice = r.qid;
      recheck();
    })
    .catch(() => {});
}

function drop(qid: string) {
  const n = qid ? notices.get(qid) : undefined;
  if (!n) return;
  notices.delete(qid);
  for (const { s } of n.told) if (s.notice === qid) delete s.notice;
}

const stale = ({ s, ask }: Told) => s.seen || (ask != null && (s.state !== 'asks' || askNow(s.worker) !== ask));

function recheck() {
  for (const [qid, n] of [...notices]) {
    if (!n.told.some(stale)) continue;
    drop(qid);
    if (!agents.chatFor(n.by, false)?.queue.some((m) => m.qid === qid)) continue;
    route('POST /api/agent/send')({ id: n.by, unqueue: qid }, new URLSearchParams()).catch(() => {});
    for (const t of n.told) {
      if (stale(t)) continue;
      if (t.ask != null) delete t.s.askTold;
      else t.s.told = false;
      changed(t.s);
    }
  }
}

function readyOf(w: Waiter, id: string) {
  const a = live.get(id) as Live | undefined;
  const mine = [...sent.values()].filter((s) => s.by === w.by && s.worker === id && !s.seen && (!s.told || s.qid === w.qid) && (!w.qid || s.qid === w.qid));
  const seenAsk = reported.get(`${w.by}:${id}`);
  const asks = w.asks && a?.status === 'asks' && a.ask && String(a.ask.id) !== seenAsk;
  if (mine.length || w.qid) {
    const s = mine.find((x) => x.state === 'done' || x.state === 'ended');
    if (s) return { s, a };
    if (mine.some((x) => x.state === 'asks') && asks) return { asks: true, a };
    if (!mine.length) return { gone: true, a };
    return null;
  }
  if (!a) return { a };
  if (asks) return { asks: true, a };
  if (a.status === 'working' || a.status === 'starting') return null;
  return { a };
}

function result(w: Waiter, id: string, r: NonNullable<ReturnType<typeof readyOf>>) {
  const code = codeOf(id), a = r.a, base = { chat: code, id, title: a?.title || '' };
  if ('s' in r && r.s) {
    r.s.seen = true;
    recheck();
    const status = r.s.state === 'ended' ? 'ended' : r.s.reason === 'cancelled' ? 'stopped' : r.s.reason === 'error' ? 'failed' : r.s.reason === 'unsent' ? 'unsent' : 'done';
    return { ...base, status, qid: r.s.qid, took: ago(r.s.at), text: lineOf(r.s) };
  }
  if ('asks' in r && a?.ask) {
    reported.set(`${w.by}:${id}`, String(a.ask.id));
    const c = agents.chatFor(id, false);
    return { ...base, status: 'asks', ask: askOut(c, a.ask), text: `${code} asks: ${quote(a.ask.form?.message || `${a.ask.q} ${a.ask.what}`, 300)}\nOptions: ${optionsLine(a.ask)}\nAnswer with amethyst chat answer ${code} <option>${permissionLike(c, a.ask) && !w.may ? " (this one is a permission ask: the user must answer it)" : ''}.` };
  }
  if ('gone' in r) return { ...base, status: a?.status || 'ended', text: `${code}: there is no message of yours to wait for${w.qid ? ` with qid ${w.qid}` : ''}; it is ${a?.status || 'ended'}.` };
  const st = a?.status || 'ended';
  markRead(w.by, id, null, true);
  return { ...base, status: st, text: `${code} is ${st === 'done' ? 'done' : st}${a ? ` (since ${ago(a.at)})` : ''}.` };
}

function poke() {
  for (const w of [...waiters]) {
    for (const id of w.ids) {
      const r = readyOf(w, id);
      if (r) {
        waiters.delete(w);
        w.done(result(w, id, r));
        break;
      }
    }
  }
}

export async function attachOf(list: unknown, base: string) {
  const images: { name: string; mimeType: string; data: string }[] = [], refs: string[] = [];
  for (const p of (Array.isArray(list) ? list : list ? [list] : []).map(String)) {
    const abs = path.resolve(base, p);
    const st = await fs.promises.stat(abs).catch(() => null);
    if (!st?.isFile()) throw new HttpError(404, `not a file: ${abs}`);
    const mime = IMAGES[path.extname(abs).toLowerCase()];
    if (mime) images.push({ name: path.basename(abs), mimeType: mime, data: (await fs.promises.readFile(abs)).toString('base64') });
    else refs.push('@' + (/\s/.test(abs) ? `"${abs}"` : abs));
  }
  return { images, refs };
}

type Start = { who: Caller; agent: string; root: string; pid: string; R: unknown; am: number; q?: URLSearchParams; by?: string | null; worktree?: boolean; model?: unknown; mode?: unknown; effort?: unknown; under?: string };

export async function startChat(o: Start) {
  const r = await route('POST /api/agent')({ agent: o.agent || 'claude', ...(o.under ? { under: o.under } : {}) }, o.q || new URLSearchParams(), o.root, o.pid, o.R, o.am);
  if (o.by) started.set(r.id, o.by);
  if (o.worktree === true) wantWt.add(r.id);
  const c = agents.chatFor(r.id);
  const notes: string[] = [];
  const want = [['model', o.model], ['effort', o.effort], ['mode', o.mode]] as const;
  if (c?.woken && want.some(([, v]) => v)) await c.woken.catch(() => {});
  for (const [k, v] of want) {
    if (!v || !c) continue;
    try {
      notes.push((await setOption(c, k, String(v), o.who)).text);
    } catch (e) {
      notes.push(`${k} not set: ${(e as Error).message}`);
    }
  }
  return { id: r.id as string, name: r.name as string, notes };
}

type Picture = { name: string; mimeType: string; data: string } | { path: string };
type Send = { who: Caller; a: Live; text: string; attach?: unknown; images?: Picture[]; base: string; worktree?: boolean; now?: boolean; tell?: boolean; by: string; tool?: Tool };

export async function sendTo(o: Send) {
  const { who, a } = o, code = codeOf(a.id);
  if (who && a.id === who.id) throw new HttpError(400, "a chat can't send to itself");
  if (!o.text && !o.attach && !o.images?.length) throw new HttpError(400, 'nothing to send: give the text');
  if (!mayAnswer(who)) heldText(o.text);
  if (who) {
    const n = (turnSends.get(who.id) || 0) + 1;
    if (n > MAX_TURN) throw new HttpError(429, `that is ${MAX_TURN} messages in this turn, the most one turn sends: end the turn (or ask the user) before sending more`);
    turnSends.set(who.id, n);
  }
  if (a.status === 'ended') throw new HttpError(410, `${code} has ended`);
  const { images, refs } = await attachOf(o.attach, o.base);
  const prompt = [o.text, ...refs].filter(Boolean).join(' ');
  const r = await route('POST /api/agent/send')({ id: a.id, prompt, images: [...images, ...(o.images || [])], worktree: o.worktree === true || wantWt.has(a.id), ...(o.by ? { from: o.by } : {}) }, new URLSearchParams());
  wantWt.delete(a.id);
  const st: State = current.get(a.id) === r.qid ? 'working' : 'queued';
  sent.set(r.qid, { qid: r.qid, by: o.by || 'cli', worker: a.id, at: Date.now(), tell: o.tell !== false, tool: o.tool || 'chat', state: st, seen: false, told: false });
  if (o.now === true && r.queued) await route('POST /api/agent/send')({ id: a.id, now: r.qid }, new URLSearchParams()).catch(() => {});
  const how = r.queued && current.get(a.id) !== r.qid ? `queued: ${code} is busy, it takes it when its turn ends` : `${code} works on it now`;
  return { qid: r.qid as string, queued: !!r.queued, how };
}

type Wait = { who: Caller; by: string; ids: string[]; qid?: string | null; secs: number; asks?: boolean; again: string; gone?: AbortSignal };

export function waitFor(o: Wait): Promise<Result> {
  const { by, ids } = o;
  return new Promise((done) => {
    const w: Waiter = { by, ids, qid: o.qid || null, asks: o.asks !== false, may: mayAnswer(o.who), at: Date.now(), done: () => {} };
    const giveUp = () => {
      if (!waiters.delete(w)) return;
      clearTimeout(timer);
      o.gone?.removeEventListener('abort', giveUp);
      const still = ids.map((id) => live.get(id) as Live | undefined).filter((x): x is Live => !!x && (x.status === 'working' || x.status === 'starting'));
      done({ status: 'waiting', working: still.map((x) => ({ chat: codeOf(x.id), id: x.id, since: x.at })), text: `still working: ${still.map((x) => `${codeOf(x.id)} (${ago(x.at)})`).join(', ') || 'none'}. Call ${o.again} again to keep waiting.` });
      for (const x of sent.values()) if (x.by === by && ids.includes(x.worker)) changed(x);
    };
    const timer = setTimeout(giveUp, o.secs * 1000);
    w.done = (r) => {
      clearTimeout(timer);
      o.gone?.removeEventListener('abort', giveUp);
      done(r);
    };
    if (o.gone?.aborted) return void (waiters.add(w), giveUp());
    o.gone?.addEventListener('abort', giveUp);
    for (const id of ids) {
      const r = readyOf(w, id);
      if (r) return w.done(result(w, id, r));
    }
    waiters.add(w);
  });
}

export function markRead(by: string, worker: string, qid: string | null, all: boolean) {
  for (const s of sent.values()) if (s.by === by && s.worker === worker && (s.qid === qid || (all && (s.state === 'done' || s.state === 'ended')))) s.seen = true;
  recheck();
}
