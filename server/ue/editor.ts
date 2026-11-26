import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import * as link from './link.ts';
import * as guard from './guard.ts';

interface Row {
  n: number;
  at: number;
  t: string;
  c: string;
  v: string;
  x: string;
}
interface Proj {
  root: string;
  path: string;
  name: string;
}
interface Ed {
  open: boolean;
  linked: boolean;
  playing: boolean;
  guard: guard.Risk[];
}
type Out = (e: Record<string, unknown>) => void;
interface Watch {
  key: string;
  proj: Proj;
  file: string;
  subs: Set<Out>;
  rows: Row[];
  n: number;
  off: number;
  ino: number;
  rest: Buffer;
  ed: Ed;
  started: number;
  pid: number;
  timer: ReturnType<typeof setInterval> | null;
  ticks: number;
  busy: boolean;
  stopGuard: (() => void) | null;
}

const WIN = process.platform === 'win32';
const KEEP = 20000;
const SEND = 5000;
const TAIL = 2 * 1024 * 1024;
const VERB = ['Fatal', 'Error', 'Warning', 'Display', 'Log', 'Verbose', 'VeryVerbose'];
const LINE = /^(?:\[(\d{4})\.(\d\d)\.(\d\d)-(\d\d)\.(\d\d)\.(\d\d):(\d{3})\]\[\s*\d+\])?([A-Za-z_][\w]*): (?:(Fatal|Error|Warning|Display|Log|Verbose|VeryVerbose): )?(.*)$/;
const PIE_ON = /Play in editor total start time/;
const PIE_OFF = /BeginTearingDown for \S*UEDPIE_/;

const logFile = (p: { path: string; name: string }) => path.join(path.dirname(p.path), 'Saved', 'Logs', p.name + '.log');
const pad = (n: number) => String(n).padStart(2, '0');

function parseLines(text: string, prev: Row | null, n: number) {
  const out: Row[] = [];
  let last = prev;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, '').replace(/\r+$/, '');
    if (!line.trim()) continue;
    const m = LINE.exec(line);
    if (m && (m[1] || /^Log|^PIE$/.test(m[8]) || VERB.includes(m[8]))) {
      const at = m[1] ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7]) : last?.at || 0;
      const d = new Date(at);
      const cat = VERB.includes(m[8]) ? '' : m[8];
      const v = VERB.includes(m[8]) ? m[8] : m[9] || 'Log';
      last = { n: n++, at, t: at ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '', c: cat, v, x: VERB.includes(m[8]) && m[9] ? `${m[9]}: ${m[10]}` : m[10] };
      out.push(last);
    } else if (last) {
      if (out[out.length - 1] === last) last.x += '\n' + line;
      else {
        last = { ...last, n: n++, x: line };
        out.push(last);
      }
    } else {
      last = { n: n++, at: 0, t: '', c: '', v: 'Log', x: line };
      out.push(last);
    }
  }
  return out;
}

const RANK: Record<string, number> = { Fatal: 4, Error: 3, Warning: 2, Display: 1, Log: 1, Verbose: 0, VeryVerbose: 0 };
function filter(rows: Row[], { category = '', verbosity = '', since = 0, lines = 0 }: { category?: string; verbosity?: string; since?: number; lines?: number } = {}) {
  const cats = String(category || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const min = verbosity ? (RANK[VERB.find((v) => v.toLowerCase() === String(verbosity).toLowerCase()) || 'Verbose'] ?? 0) : -1;
  let out = rows.filter((r) => (!cats.length || cats.includes(r.c.toLowerCase())) && (RANK[r.v] ?? 1) >= min && (!since || r.at >= since));
  if (lines > 0) out = out.slice(-lines);
  return out;
}

async function readTail(file: string) {
  let fh: fs.promises.FileHandle;
  try {
    fh = await fs.promises.open(file, 'r');
  } catch {
    return null;
  }
  try {
    const st = await fh.stat();
    const from = Math.max(0, st.size - TAIL), buf = Buffer.alloc(st.size - from);
    await fh.read(buf, 0, buf.length, from);
    let text = buf.toString('utf8');
    if (from > 0) text = text.slice(text.indexOf('\n') + 1);
    return { text, size: st.size, ino: st.ino, cut: from > 0 };
  } finally {
    await fh.close();
  }
}

async function readRows(p: Proj, q: Parameters<typeof filter>[1] = {}) {
  const file = logFile(p), r = await readTail(file);
  if (!r) return { path: file, missing: true, rows: [] as Row[] };
  return { path: file, cut: r.cut, rows: filter(parseLines(r.text, null, 0), q) };
}

function fakeOpen() {
  const v = process.env.MIND_FAKE_UE_EDITOR || '';
  if (v === '1' || v === '0') return v === '1';
  try {
    const t = fs.readFileSync(v, 'utf8').trim();
    return t === '1' || t === 'stay';
  } catch {
    return false;
  }
}

type Proc = { open: boolean; started: number; pid: number };
type CloseReq = 'sent' | 'nowindow' | 'gone' | 'error';
type CloseResult = { closed: boolean; open: boolean; pid: number; why?: string };
const fakePid = () => Number(process.env.MIND_FAKE_UE_PID) || 4242;
function editorProc(full: string): Promise<Proc> {
  if (process.env.MIND_FAKE_UE_EDITOR) return Promise.resolve(fakeOpen() ? { open: true, started: 0, pid: fakePid() } : { open: false, started: 0, pid: 0 });
  if (!WIN) return Promise.resolve({ open: false, started: 0, pid: 0 });
  const norm = (s: string) => String(s).replace(/\//g, '\\').toLowerCase();
  const ps = "Get-CimInstance Win32_Process -Filter \"Name LIKE 'UnrealEditor%'\" | ForEach-Object { [string]$_.ProcessId + ' ' + [string]([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() + ' ' + $_.CommandLine }";
  return new Promise<Proc>((res) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15e3 }, (err, out) => {
      const hit = String(out || '').split(/\r?\n/).find((l) => norm(l).includes(norm(full)));
      const [pid, started] = hit ? hit.split(' ').map(Number) : [0, 0];
      res(hit ? { open: true, started: started || 0, pid: pid || 0 } : { open: false, started: 0, pid: 0 });
    }),
  );
}
const editorOpen = async (full: string) => (await editorProc(full)).open;

function requestClose(pid: number): Promise<CloseReq> {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve('gone');
  const fake = process.env.MIND_FAKE_UE_EDITOR;
  if (fake) {
    if (fake === '0') return Promise.resolve('gone');
    if (fake === '1') return Promise.resolve('sent');
    try {
      const t = fs.readFileSync(fake, 'utf8').trim();
      if (t === '1') {
        fs.writeFileSync(fake, '0');
        return Promise.resolve('sent');
      }
      if (t === 'stay') return Promise.resolve('sent');
      return Promise.resolve('gone');
    } catch {
      return Promise.resolve('gone');
    }
  }
  if (!WIN) return Promise.resolve('gone');
  const id = Math.trunc(pid);
  const ps = `$p = Get-Process -Id ${id} -ErrorAction SilentlyContinue; if (-not $p -or $p.ProcessName -notlike 'UnrealEditor*') { 'gone' } elseif ($p.CloseMainWindow()) { 'sent' } else { 'nowindow' }`;
  return new Promise<CloseReq>((res) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 15e3 }, (err, out) => {
      if (err) return res('error');
      const v = String(out || '').trim();
      res(v === 'sent' || v === 'nowindow' || v === 'gone' ? v : 'error');
    }),
  );
}

async function closeEditor(full: string, timeoutSec = 15): Promise<CloseResult> {
  const p = await editorProc(full);
  if (!p.open) return { closed: false, open: false, pid: 0 };
  if (!Number.isInteger(p.pid) || p.pid <= 0) return { closed: false, open: true, pid: 0, why: 'error' };
  const req = await requestClose(p.pid);
  if (req === 'error') return { closed: false, open: true, pid: p.pid, why: 'error' };
  if (req === 'gone') {
    const after = await editorProc(full);
    if (!after.open || (after.pid && after.pid !== p.pid)) return { closed: true, open: false, pid: p.pid };
  }
  const waitMs = Math.max(0, Math.min(Number(timeoutSec) || 0, 120)) * 1000;
  const pollMs = process.env.MIND_FAKE_UE_EDITOR ? 50 : 500;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const cur = await editorProc(full);
    if (!cur.open || (cur.pid && cur.pid !== p.pid)) return { closed: true, open: false, pid: p.pid };
    if (Date.now() >= deadline) return { closed: false, open: true, pid: p.pid, why: req === 'nowindow' ? 'nowindow' : 'timeout' };
    await new Promise((r) => setTimeout(r, Math.min(pollMs, Math.max(10, deadline - Date.now()))));
  }
}

function anyEditor() {
  if (process.env.MIND_FAKE_UE_EDITOR) return Promise.resolve(fakeOpen());
  if (!WIN) return Promise.resolve(false);
  return new Promise<boolean>((res) => execFile('tasklist', ['/FI', 'IMAGENAME eq UnrealEditor.exe', '/NH'], { windowsHide: true, timeout: 10e3 }, (err, out) => res(/UnrealEditor/i.test(String(out || '')))));
}

const watches = new Map<string, Watch>();
const send = (w: Watch, e: Record<string, unknown>) => w.subs.forEach((out) => out(e));

async function readNew(w: Watch) {
  let st: fs.Stats;
  try {
    st = await fs.promises.stat(w.file);
  } catch {
    return;
  }
  if (st.size < w.off || (w.ino && st.ino !== w.ino)) {
    Object.assign(w, { off: 0, rows: [], rest: Buffer.alloc(0), ino: st.ino });
    send(w, { type: 'elog', reset: true, rows: [], path: w.file });
  }
  w.ino = st.ino;
  if (st.size === w.off) return;
  const fh = await fs.promises.open(w.file, 'r');
  try {
    const len = Math.min(st.size - w.off, 8 * 1024 * 1024), buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, w.off);
    w.off += len;
    const all = Buffer.concat([w.rest, buf]), cut = all.lastIndexOf(10);
    w.rest = cut < 0 ? all : all.subarray(cut + 1);
    const tail = w.rest.toString('utf8');
    if (PIE_ON.test(tail)) setEd(w, { playing: true });
    else if (PIE_OFF.test(tail)) setEd(w, { playing: false });
    if (cut < 0) return;
    const rows = parseLines(all.subarray(0, cut).toString('utf8'), w.rows[w.rows.length - 1] || null, w.n);
    if (!rows.length) return;
    w.n = rows[rows.length - 1].n + 1;
    w.rows.push(...rows);
    if (w.rows.length > KEEP + 2000) w.rows.splice(0, w.rows.length - KEEP);
    for (const r of rows) {
      if (PIE_ON.test(r.x)) setEd(w, { playing: true });
      else if (PIE_OFF.test(r.x)) setEd(w, { playing: false });
    }
    send(w, { type: 'elog', rows });
  } finally {
    await fh.close();
  }
}

function setEd(w: Watch, patch: Partial<Ed>) {
  const next = { ...w.ed, ...patch };
  if (!next.open) Object.assign(next, { linked: false, playing: false, guard: [] });
  if (JSON.stringify(next) === JSON.stringify(w.ed)) return;
  w.ed = next;
  send(w, { type: 'editor', ...w.ed });
}

async function look(w: Watch) {
  const dir = path.dirname(w.proj.path);
  const s = await link.state(dir, 0);
  if (s.linked) {
    if (!w.ed.linked) {
      const p = await editorProc(w.proj.path);
      Object.assign(w, { started: p.started || w.started || Date.now(), pid: p.pid || w.pid });
      setEd(w, { open: true, linked: true, playing: await link.isPlaying(dir).catch(() => w.ed.playing) });
    }
  } else if (w.ed.linked || w.ticks % 10 === 0) {
    const p = (await anyEditor()) ? await editorProc(w.proj.path) : { open: false, started: 0, pid: 0 };
    Object.assign(w, { started: p.started, pid: p.pid });
    setEd(w, { open: p.open, linked: false });
  }
  if (w.ed.open && !w.stopGuard) {
    await guard.ensure(w.key, dir, w.started, w.pid);
    w.stopGuard = guard.watchDir(w.key, dir, (risks) => setEd(w, { guard: risks }));
    setEd(w, { guard: await guard.risks(w.key, dir) });
  } else if (!w.ed.open && w.stopGuard) {
    w.stopGuard();
    w.stopGuard = null;
    guard.drop(w.key);
  }
}

async function tick(w: Watch) {
  if (w.busy) return;
  w.busy = true;
  try {
    await readNew(w);
    if (w.ticks++ % 2 === 0) await look(w);
  } catch {
  } finally {
    w.busy = false;
  }
}

async function start(key: string, proj: Proj) {
  const w: Watch = { key, proj, file: logFile(proj), subs: new Set(), rows: [], n: 0, off: 0, ino: 0, rest: Buffer.alloc(0), ed: { open: false, linked: false, playing: false, guard: [] }, started: 0, pid: 0, timer: null, ticks: 0, busy: true, stopGuard: null };
  watches.set(key, w);
  const r = await readTail(w.file);
  if (r) {
    w.rows = parseLines(r.text, null, 0).slice(-KEEP);
    w.n = w.rows.length ? w.rows[w.rows.length - 1].n + 1 : 0;
    Object.assign(w, { off: r.size, ino: r.ino });
    for (const row of w.rows) {
      if (PIE_ON.test(row.x)) w.ed.playing = true;
      else if (PIE_OFF.test(row.x)) w.ed.playing = false;
    }
  }
  w.busy = false;
  w.ticks = 0;
  await look(w).catch(() => {});
  w.timer = setInterval(() => tick(w), 500);
  return w;
}

const starting = new Map<string, Promise<Watch>>();
async function watch(key: string, proj: Proj, out: Out) {
  let w = watches.get(key);
  if (w && w.proj.path.toLowerCase() !== proj.path.toLowerCase()) {
    stopWatch(w);
    w = undefined;
  }
  if (!w) {
    if (!starting.has(key)) starting.set(key, start(key, proj).finally(() => starting.delete(key)));
    w = await starting.get(key)!;
  }
  w.subs.add(out);
  out({ type: 'elog', reset: true, rows: w.rows.slice(-SEND), path: w.file, skipped: Math.max(0, w.rows.length - SEND) });
  out({ type: 'editor', ...w.ed });
  return () => {
    w!.subs.delete(out);
    if (!w!.subs.size) stopWatch(w!);
  };
}

function stopWatch(w: Watch) {
  if (w.timer) clearInterval(w.timer);
  w.stopGuard?.();
  if (watches.get(w.key) === w) watches.delete(w.key);
}

const now = (key: string) => watches.get(key)?.ed || null;
async function recheck(key: string) {
  const w = watches.get(key);
  if (w?.ed.open) setEd(w, { guard: await guard.risks(key, path.dirname(w.proj.path)).catch(() => w.ed.guard) });
}
const opened = (key: string, pid = 0) => {
  const w = watches.get(key);
  if (w) Object.assign(w, { started: Date.now(), pid });
};

function stopAll() {
  for (const w of [...watches.values()]) stopWatch(w);
  link.shut();
}

export { watch, now, recheck, opened, readRows, filter, parseLines, editorOpen, editorProc, closeEditor, fakePid, logFile, stopAll, PIE_ON, PIE_OFF };
export type { Row, Proj, Ed };
