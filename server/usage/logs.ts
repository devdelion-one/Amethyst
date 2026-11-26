import fs from 'fs';
import path from 'path';
import { claudeDirs, codexDir, copilotDir } from '../base/agentdirs.ts';
import { replace, WIN } from '../base/util.ts';
import type { Sums } from './prices.ts';

export const AGENTS = ['Claude Code', 'Codex', 'Copilot'] as const;
export type Agent = (typeof AGENTS)[number];
export const KEEP = 90 * 864e5;
const CHUNK = 1 << 20, STATS = 64, CACHE = 'usage-cache.json', VERSION = 1;

type Ctx = { s?: string; cwd?: string; model?: string; total?: number[]; sub?: boolean; n?: number };
export interface FileRec {
  offset: number;
  size: number;
  ctx: Ctx;
}
export type Turn = [at: number, folder: number, model: number, agent: number, ...sums: Sums];
export type Session = [at: number, folder: number, agent: number];
interface Saved {
  v: number;
  files: Record<string, FileRec>;
  folders: string[];
  models: string[];
  turns: Record<string, Turn>;
  sessions: Record<string, Session>;
}
export interface Opts {
  dataDir: string;
  claudeDirs?: () => string[];
}
export interface Progress {
  done: number;
  total: number;
}
type Job = { planned: Promise<number>; done: Promise<void> };
type Found = { file: string; kind: number; size: number; mtime: number };

const keyOf = (p: string) => (WIN ? p.toLowerCase() : p);
const NEEDLES = [['"usage"'], ['"token_count"', '"session_meta"', '"turn_context"'], ['"session.usage_record"', '"cwd"']].map((l) => l.map((s) => Buffer.from(s)));
const sumOf = (t: number[], from = 4) => t.slice(from).reduce((a, b) => a + b, 0);
const n0 = (v: unknown) => (typeof v === 'number' && v > 0 ? v : 0);

async function walk(dir: string, keep: (rel: string) => boolean) {
  const names = (await fs.promises.readdir(dir, { recursive: true }).catch(() => [])) as string[];
  return names.filter(keep).map((n) => path.join(dir, n));
}

async function eachLine(file: string, start: number, end: number, needles: Buffer[], fn: (line: string) => void, onBytes: (n: number) => void) {
  let parts: Buffer[] = [], at = start, upTo = start;
  const stream = fs.createReadStream(file, { start, end: end - 1, highWaterMark: CHUNK });
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    let from = 0, nl;
    while ((nl = chunk.indexOf(10, from)) !== -1) {
      const line = parts.length ? Buffer.concat([...parts, chunk.subarray(from, nl)]) : chunk.subarray(from, nl);
      parts = [];
      if (needles.some((n) => line.includes(n))) fn(line.toString('utf8'));
      from = nl + 1;
      upTo = at + from;
    }
    if (from < chunk.length) parts.push(chunk.subarray(from));
    at += chunk.length;
    onBytes(chunk.length);
  }
  return upTo;
}

const parse = (line: string) => {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
};

export function reader(o: Opts) {
  let files: Record<string, FileRec> = {}, folders: string[] = [], models: string[] = [];
  let turns = new Map<string, Turn>(), sessions = new Map<string, Session>();
  const folderIx = new Map<string, number>(), modelIx = new Map<string, number>();
  let loaded = false, ever = false, job: Job | null = null, progress: Progress = { done: 0, total: 0 }, lastEnd = 0;
  const cacheFile = path.join(o.dataDir, CACHE);

  const ix = (list: string[], map: Map<string, number>, v: string) => {
    let i = map.get(v);
    if (i === undefined) map.set(v, (i = list.push(v) - 1));
    return i;
  };
  const folder = (cwd: unknown) => ix(folders, folderIx, typeof cwd === 'string' && cwd ? path.resolve(cwd) : '');
  const model = (m: string) => ix(models, modelIx, m);

  function load() {
    if (loaded) return;
    loaded = true;
    let s: Saved | null = null;
    try {
      s = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch {}
    if (!s || s.v !== VERSION) return;
    files = s.files || {};
    folders = s.folders || [];
    models = s.models || [];
    folders.forEach((f, i) => folderIx.set(f, i));
    models.forEach((m, i) => modelIx.set(m, i));
    turns = new Map(Object.entries(s.turns || {}));
    sessions = new Map(Object.entries(s.sessions || {}));
    ever = true;
  }

  const addSession = (key: string, at: number, fi: number, ai: number) => {
    const was = sessions.get(key);
    if (!was || at < was[0]) sessions.set(key, [at, fi, ai]);
  };
  const addTurn = (id: string, at: number, fi: number, mi: number, ai: number, s: Sums) => {
    const was = turns.get(id);
    if (was && sumOf(was) >= sumOf(s, 0)) return;
    turns.set(id, [was ? was[0] : at, fi, mi, ai, ...s]);
  };

  function lineOf(kind: number, file: string, ctx: Ctx, since: number) {
    const sub = kind === 0 && file.split(/[\\/]/).includes('subagents');
    return (line: string) => {
      const e = parse(line);
      if (!e) return;
      if (kind === 0) {
        const m = e.message, u = m?.usage;
        if (e.type !== 'assistant' || !u || !m.model || m.model === '<synthetic>') return;
        const at = Date.parse(e.timestamp);
        if (!at || at < since) return;
        const c1 = n0(u.cache_creation?.ephemeral_1h_input_tokens), c5 = Math.max(0, n0(u.cache_creation_input_tokens) - c1);
        const fi = folder(e.cwd);
        addTurn(`c:${m.id || e.uuid}`, at, fi, model(m.model), 0, [n0(u.input_tokens), c5, c1, n0(u.cache_read_input_tokens), n0(u.output_tokens)]);
        if (!sub && !e.isSidechain && e.sessionId) addSession(`c:${e.sessionId}`, at, fi, 0);
        return;
      }
      if (kind === 1) {
        const p = e.payload || {};
        if (e.type === 'session_meta') {
          ctx.s = p.id || p.session_id || ctx.s;
          if (p.cwd) ctx.cwd = p.cwd;
          ctx.sub = !!(p.source && typeof p.source === 'object' && p.source.subagent);
          return;
        }
        if (e.type === 'turn_context') {
          if (p.model) ctx.model = p.model;
          if (p.cwd) ctx.cwd = p.cwd;
          return;
        }
        const info = p.type === 'token_count' ? p.info : null;
        if (e.type !== 'event_msg' || !info?.total_token_usage) return;
        const raw = (u: any) => (u ? [n0(u.input_tokens), n0(u.cached_input_tokens), n0(u.cache_write_input_tokens), n0(u.output_tokens)] : [0, 0, 0, 0]);
        const total = raw(info.total_token_usage), prev = ctx.total || [0, 0, 0, 0];
        let d = total.map((v, i) => v - prev[i]);
        if (d.some((v) => v < 0)) d = raw(info.last_token_usage);
        ctx.total = total;
        if (!d.some((v) => v > 0)) return;
        const at = Date.parse(e.timestamp);
        ctx.n = (ctx.n || 0) + 1;
        if (!at || at < since) return;
        const fi = folder(ctx.cwd);
        addTurn(`x:${keyOf(file)}:${ctx.n}`, at, fi, model(ctx.model || 'codex'), 1, [Math.max(0, d[0] - d[1] - d[2]), d[2], 0, d[1], d[3]]);
        if (!ctx.sub && ctx.s) addSession(`x:${ctx.s}`, at, fi, 1);
        return;
      }
      const cwd = e.data?.context?.cwd;
      if (typeof cwd === 'string' && cwd) ctx.cwd = cwd;
      if (e.type !== 'session.usage_record') return;
      const u = e.data?.usage, at = Date.parse(e.timestamp);
      ctx.n = (ctx.n || 0) + 1;
      if (!u || !at || at < since) return;
      const fi = folder(ctx.cwd), cr = n0(u.cacheReadTokens), cw = n0(u.cacheWriteTokens);
      addTurn(`p:${e.id || `${keyOf(file)}:${ctx.n}`}`, at, fi, model(u.model || 'copilot'), 2, [Math.max(0, n0(u.inputTokens) - cr - cw), cw, 0, cr, n0(u.outputTokens)]);
      addSession(`p:${path.basename(path.dirname(file))}`, at, fi, 2);
    };
  }

  async function listAll(): Promise<Found[]> {
    const seen = new Set<string>(), lists: { file: string; kind: number }[] = [];
    const add = (kind: number) => (fs: string[]) => {
      for (const file of fs) if (!seen.has(keyOf(file))) seen.add(keyOf(file)), lists.push({ file, kind });
    };
    const dirs = [...claudeDirs(), ...(o.claudeDirs?.() || [])].map((d) => path.join(path.resolve(d), 'projects'));
    const real = new Set<string>();
    for (const d of dirs) {
      const r = keyOf(await fs.promises.realpath(d).catch(() => d));
      if (real.has(r)) continue;
      real.add(r);
      add(0)(await walk(d, (n) => n.endsWith('.jsonl')));
    }
    add(1)(await walk(path.join(codexDir(), 'sessions'), (n) => path.basename(n).startsWith('rollout-') && n.endsWith('.jsonl')));
    const cp = path.join(copilotDir(), 'session-state');
    const ids = await fs.promises.readdir(cp).catch(() => [] as string[]);
    add(2)(ids.map((id) => path.join(cp, id, 'events.jsonl')));
    const out: Found[] = [];
    for (let i = 0; i < lists.length; i += STATS) {
      const part = lists.slice(i, i + STATS);
      const st = await Promise.all(part.map((f) => fs.promises.stat(f.file).catch(() => null)));
      part.forEach((f, j) => st[j]?.isFile() && out.push({ ...f, size: st[j]!.size, mtime: st[j]!.mtimeMs }));
    }
    return out;
  }

  function prune(since: number, found: Found[]) {
    for (const [id, t] of turns) if (t[0] < since) turns.delete(id);
    for (const [id, s] of sessions) if (s[0] < since) sessions.delete(id);
    const live = new Set(found.map((f) => f.file));
    for (const f of Object.keys(files)) if (!live.has(f)) delete files[f];
  }

  async function save() {
    const s: Saved = { v: VERSION, files, folders, models, turns: Object.fromEntries(turns), sessions: Object.fromEntries(sessions) };
    await fs.promises.mkdir(o.dataDir, { recursive: true });
    await replace(cacheFile, JSON.stringify(s));
  }

  function run(): Job {
    let plan: (n: number) => void = () => {};
    const planned = new Promise<number>((r) => (plan = r));
    const done = (async () => {
      const since = Date.now() - KEEP, found = await listAll(), todo: Found[] = [];
      for (const f of found) {
        const rec = files[f.file];
        if (rec && f.size < rec.offset) delete files[f.file];
        const from = files[f.file]?.offset || 0;
        if (f.size > from && (files[f.file] || f.mtime >= since)) todo.push(f);
      }
      progress = { done: 0, total: todo.reduce((a, f) => a + f.size - (files[f.file]?.offset || 0), 0) };
      plan(progress.total);
      for (const f of todo) {
        const rec = (files[f.file] ||= { offset: 0, size: 0, ctx: {} });
        const start = rec.offset;
        const upTo = await eachLine(f.file, start, f.size, NEEDLES[f.kind], lineOf(f.kind, f.file, rec.ctx, since), (n) => (progress.done += n)).catch(() => start);
        rec.offset = upTo;
        rec.size = f.size;
      }
      prune(since, found);
      await save();
      ever = true;
    })().finally(() => {
      plan(0);
      job = null;
      lastEnd = Date.now();
    });
    return { planned, done };
  }

  return {
    refresh(): Job {
      load();
      return (job ||= run());
    },
    reading: (): Progress | null => (job ? { ...progress } : null),
    ready: () => (load(), ever),
    since: () => lastEnd,
    files: () => files,
    data: () => ({ turns: [...turns.values()], sessions: [...sessions.values()], folders, models }),
  };
}

export type Reader = ReturnType<typeof reader>;
