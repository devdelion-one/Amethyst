import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { HttpError } from '../base/routes.ts';
import type { Routes } from '../../public/base/types.ts';
import { ENGINE, modelOf, onRemove } from './voice.ts';

type Proc = { p: ChildProcess; port: number; ready: Promise<void>; dead: boolean };
type Sentence = { text: string; tidy: boolean; from: number; to: number; seg: number };
type Session = { id: string; ws: WebSocket; open: Promise<void>; model: string; audio: Float32Array[]; total: number; sentences: Sentence[]; jobs: Promise<void>[]; seen: number; done: Promise<void>; finish: () => void };

const RATE = 16000;
const IDLE = () => Number(process.env.MIND_VOICE_IDLE_MS) || 120e3;
const LOST = 30e3;

let sherpa: Proc | null = null;
let whisper: (Proc & { model: string }) | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<unknown> = Promise.resolve();
const sessions = new Map<string, Session>();

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

function launch(exe: string, fake: string | undefined, args: string[], cwd: string, ready: (out: string, port: number) => boolean | Promise<boolean>, port: number, env?: NodeJS.ProcessEnv): Proc {
  const p = fake ? spawn(process.execPath, [fake, ...args], { cwd, windowsHide: true, env: { ...process.env, ...env } }) : spawn(exe, args, { cwd, windowsHide: true, env: { ...process.env, ...env } });
  const proc: Proc = { p, port, dead: false, ready: Promise.resolve() };
  let log = '';
  proc.ready = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`it didn't start in 30 s. ${log.slice(-300)}`)), 30e3);
    let polling = false;
    const check = async () => {
      if (await ready(log, port)) {
        clearTimeout(t);
        resolve();
        return true;
      }
      return false;
    };
    const take = (b: Buffer) => {
      log = (log + b.toString()).slice(-4000);
      check().catch(() => {});
    };
    p.stdout?.on('data', take);
    p.stderr?.on('data', take);
    p.on('error', (e) => (clearTimeout(t), reject(e)));
    p.on('exit', (code) => {
      proc.dead = true;
      clearTimeout(t);
      reject(new Error(`it stopped (exit ${code}). ${log.slice(-300).trim()}`));
    });
    const poll = async () => {
      if (polling || proc.dead) return;
      polling = true;
      while (!proc.dead && !(await check().catch(() => false))) await new Promise((r) => setTimeout(r, 150));
    };
    poll();
  });
  proc.ready.catch(() => {});
  return proc;
}

const kill = (x: Proc | null) => {
  if (x && !x.dead) x.p.kill();
};

async function stopAll() {
  for (const s of sessions.values()) s.finish();
  sessions.clear();
  kill(sherpa);
  kill(whisper);
  sherpa = whisper = null;
}
onRemove(stopAll);
process.on('exit', () => (kill(sherpa), kill(whisper)));

function touch() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => {
    if (sessions.size) return touch();
    kill(sherpa);
    kill(whisper);
    sherpa = whisper = null;
  }, IDLE());
  idle.unref?.();
}

const pick = (dir: string, re: RegExp) => {
  const all = fs.readdirSync(dir).filter((f) => re.test(f));
  return path.join(dir, all.find((f) => /int8/.test(f)) || all[0] || '');
};

async function startSherpa() {
  if (sherpa && !sherpa.dead) return sherpa;
  const src = ENGINE.sources(), dir = ENGINE.liveModelDir(), bin = path.join(ENGINE.liveDir(), 'bin'), port = await freePort();
  const args = [`--port=${port}`, `--num-threads=${Math.min(4, ENGINE.threads())}`, `--tokens=${path.join(dir, 'tokens.txt')}`, `--encoder=${pick(dir, /^encoder.*\.onnx$/)}`, `--decoder=${pick(dir, /^decoder.*\.onnx$/)}`, `--joiner=${pick(dir, /^joiner.*\.onnx$/)}`, '--rule2-min-trailing-silence=0.8'];
  const lib = path.join(ENGINE.liveDir(), 'lib');
  sherpa = launch(path.join(bin, ENGINE.LIVE_EXE), src.live.exe, args, bin, (log) => /Listening on/.test(log), port, ENGINE.WIN ? undefined : { LD_LIBRARY_PATH: [lib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') });
  return sherpa;
}

async function startWhisper(model: string) {
  if (whisper && !whisper.dead && whisper.model === model) return whisper;
  kill(whisper);
  const src = ENGINE.sources(), port = await freePort();
  const args = ['-m', ENGINE.modelFile(model), '--host', '127.0.0.1', '--port', String(port), '-t', String(ENGINE.threads()), '-l', 'auto', '-nt'];
  const up = async (_: string, p: number) => {
    try {
      await fetch(`http://127.0.0.1:${p}/`, { signal: AbortSignal.timeout(500) });
      return true;
    } catch {
      return false;
    }
  };
  whisper = Object.assign(launch(path.join(ENGINE.binDir(), ENGINE.SERVER_EXE), src.live.server, args, ENGINE.binDir(), up, port), { model });
  return whisper;
}

function wav(parts: Float32Array[]) {
  const n = parts.reduce((a, p) => a + p.length, 0), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (const p of parts)
    for (const x of p) {
      const c = Math.max(-1, Math.min(1, x));
      buf.writeInt16LE(Math.round(c < 0 ? c * 0x8000 : c * 0x7fff), o);
      o += 2;
    }
  return buf;
}

function slice(s: Session, from: number, to: number) {
  const out: Float32Array[] = [];
  let at = 0;
  for (const p of s.audio) {
    const a = Math.max(from, at), b = Math.min(to, at + p.length);
    if (b > a) out.push(p.subarray(a - at, b - at));
    at += p.length;
    if (at >= to) break;
  }
  return out;
}

const clean = (t: string) => t.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim();

async function transcribe(model: string, data: Buffer) {
  const w = await startWhisper(model);
  await w.ready;
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type: 'audio/wav' }), 'speech.wav');
  form.append('response_format', 'json');
  form.append('temperature', '0.0');
  const r = await fetch(`http://127.0.0.1:${w.port}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(60e3) });
  if (!r.ok) throw new Error(`whisper answered ${r.status}`);
  return clean(String(((await r.json()) as { text?: string }).text || ''));
}

function tidy(s: Session, x: Sentence) {
  if (!x.text.trim()) {
    x.tidy = true;
    return;
  }
  const from = Math.max(0, x.from - RATE * 0.2), to = Math.min(s.total, x.to + RATE * 0.3);
  const run = queue.then(() => transcribe(s.model, wav(slice(s, from, to))));
  queue = run.catch(() => {});
  const job = run
    .then((t: string) => {
      if (t) x.text = t;
    })
    .catch(() => {})
    .finally(() => (x.tidy = true));
  s.jobs.push(job as Promise<void>);
}

function close(s: Session, x: Sentence) {
  if (x.to >= 0) return;
  x.to = s.total;
  tidy(s, x);
}

function onResult(s: Session, data: unknown) {
  let j: { text?: string; segment?: number };
  try {
    j = JSON.parse(String(data));
  } catch {
    if (/^Done/.test(String(data))) s.finish();
    return;
  }
  const seg = Number(j.segment) || 0, text = String(j.text || '').trim();
  let cur = s.sentences.at(-1);
  if (!cur || seg > cur.seg) {
    if (cur) close(s, cur);
    if (!text) return;
    cur = { text: '', tidy: false, from: cur ? cur.to : 0, to: -1, seg };
    s.sentences.push(cur);
  }
  if (cur.seg === seg && !cur.tidy && cur.to < 0) cur.text = text;
}

const view = (s: Session) => ({ sentences: s.sentences.filter((x) => x.text.trim() || !x.tidy).map((x) => ({ text: x.text, tidy: x.tidy })) });

async function start(model: string) {
  const st = ENGINE.state(model);
  if (!st.ready || !st.live.have) throw new HttpError(409, "Live speech to text isn't downloaded yet.");
  touch();
  const sh = await startSherpa();
  startWhisper(model).catch(() => {});
  try {
    await sh.ready;
  } catch (e) {
    throw new HttpError(500, `The live speech program failed: ${(e as Error).message}`);
  }
  const ws = new WebSocket(`ws://127.0.0.1:${sh.port}`);
  ws.binaryType = 'arraybuffer';
  let finish = () => {};
  const done = new Promise<void>((r) => (finish = r));
  const s: Session = { id: crypto.randomUUID(), ws, model, audio: [], total: 0, sentences: [], jobs: [], seen: Date.now(), done, finish: () => finish(), open: Promise.resolve() };
  s.open = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new HttpError(500, "Can't reach the live speech program."));
  });
  ws.onmessage = (e) => onResult(s, e.data);
  ws.onclose = () => finish();
  await s.open;
  sessions.set(s.id, s);
  return { id: s.id };
}

function session(id: unknown) {
  const s = sessions.get(String(id));
  if (!s) throw new HttpError(404, 'That recording has ended.');
  s.seen = Date.now();
  touch();
  return s;
}

function feed(id: unknown, pcm: unknown) {
  const s = session(id);
  if (typeof pcm === 'string' && pcm) {
    const b = Buffer.from(pcm, 'base64'), n = b.length >> 1, f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = b.readInt16LE(i * 2) / 32768;
    s.audio.push(f);
    s.total += n;
    if (s.ws.readyState === WebSocket.OPEN) s.ws.send(f.buffer);
  }
  return view(s);
}

async function stop(id: unknown) {
  const s = session(id);
  sessions.delete(s.id);
  if (s.ws.readyState === WebSocket.OPEN) {
    s.ws.send(new Float32Array(RATE * 0.6).buffer);
    s.ws.send('Done');
    await Promise.race([s.done, new Promise((r) => setTimeout(r, 3000))]);
  }
  try {
    s.ws.close();
  } catch {}
  const last = s.sentences.at(-1);
  if (last) close(s, last);
  await Promise.race([Promise.allSettled(s.jobs), new Promise((r) => setTimeout(r, 20e3))]);
  touch();
  return view(s);
}

setInterval(() => {
  for (const s of sessions.values())
    if (Date.now() - s.seen > LOST) {
      sessions.delete(s.id);
      try {
        s.ws.close();
      } catch {}
    }
}, 10e3).unref();

const ROUTES: Routes = {
  'POST /api/voice/live/start': async (body) => start(modelOf(body?.model)),
  'POST /api/voice/live/feed': async (body) => feed(body?.id, body?.pcm),
  'POST /api/voice/live/stop': async (body) => stop(body?.id),
};

export { ROUTES };
