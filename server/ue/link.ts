import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import path from 'path';

interface Node {
  id: number;
  root: string;
  name: string;
  engine: string;
  pid: number;
  seen: number;
  sock: net.Socket;
}
interface Result {
  success: boolean;
  result: string;
  output: { type: string; output: string }[];
}
interface Wait {
  res: (r: Result) => void;
  rej: (e: Error) => void;
  sock: net.Socket;
  timer: ReturnType<typeof setTimeout>;
}

const BIND = '127.0.0.1';
const MAX_MSG = 4 * 1024 * 1024;
const HELLO_MS = 5000;
const SCRIPT = path.join(import.meta.dirname, 'link.py');

const nodes = new Map<number, Node>();
const waits = new Map<number, Wait>();
let srv: net.Server | null = null;
let key = Buffer.alloc(0);
let file = '';
let written = '';
let ids = 0;

const norm = (p: string) => path.normalize(String(p || '')).replace(/[\\/]+$/, '').toLowerCase();
const proof = (role: string, nonce: string) => crypto.createHmac('sha256', key).update(`${role}|${nonce}`).digest('hex');
const same = (a: unknown, b: string) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const line = (sock: net.Socket, m: unknown) => sock.write(JSON.stringify(m) + '\n');

function onConn(sock: net.Socket) {
  const nonce = crypto.randomBytes(32).toString('hex');
  let stage: 'hello' | 'info' | 'ready' = 'hello', buf = '', id = 0, theirs = '';
  const timer = setTimeout(() => sock.destroy(), HELLO_MS);
  sock.setNoDelay(true);
  sock.on('error', () => {});
  sock.on('close', () => {
    clearTimeout(timer);
    if (id && nodes.get(id)?.sock === sock) nodes.delete(id);
  });
  const handle = (m: any) => {
    if (stage === 'hello') {
      if (m?.t !== 'hello' || typeof m.nonce !== 'string' || m.nonce.length < 32 || !same(m.proof, proof('editor', nonce))) return sock.destroy();
      theirs = m.nonce;
      stage = 'info';
      return line(sock, { t: 'proof', proof: proof('server', theirs) });
    }
    if (stage === 'info') {
      const pid = Number(m?.pid);
      if (m?.t !== 'info' || !Number.isInteger(pid) || pid <= 0) return sock.destroy();
      clearTimeout(timer);
      stage = 'ready';
      id = ++ids;
      nodes.set(id, { id, root: norm(m.project_root), name: String(m.project_name || ''), engine: String(m.engine_version || ''), pid, seen: Date.now(), sock });
      return;
    }
    if (m?.t !== 'result') return;
    const w = waits.get(Number(m.id));
    if (!w) return;
    waits.delete(Number(m.id));
    clearTimeout(w.timer);
    w.res({ success: !!m.success, result: String(m.result ?? ''), output: Array.isArray(m.output) ? m.output : [] });
  };
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    if (buf.length > MAX_MSG) {
      for (const w of [...waits.values()]) if (w.sock === sock) w.rej(new Error('the editor returned more than 4 MB of output'));
      return sock.destroy();
    }
    for (let i = buf.indexOf('\n'); i >= 0 && !sock.destroyed; i = buf.indexOf('\n')) {
      const raw = buf.slice(0, i);
      buf = buf.slice(i + 1);
      let m: unknown;
      try {
        m = JSON.parse(raw);
      } catch {
        return sock.destroy();
      }
      handle(m);
    }
  });
  line(sock, { t: 'hello', nonce });
}

function init(dir: string) {
  file = path.join(dir, 'ue-link.json');
  if (srv) return;
  key = crypto.randomBytes(32);
  const s = net.createServer(onConn);
  srv = s;
  s.on('error', () => {});
  s.listen(0, BIND, () => {
    const body = JSON.stringify({ port: (s.address() as net.AddressInfo).port, key: key.toString('hex') });
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, body, { mode: 0o600 });
      fs.renameSync(tmp, file);
      written = body;
    } catch {}
  });
  s.unref();
}

const linkFile = () => file;
const launch = () => ({ script: SCRIPT, file });

function shut() {
  for (const n of nodes.values()) n.sock.destroy();
  nodes.clear();
  for (const w of [...waits.values()]) w.rej(new Error('Amethyst closed the link'));
  srv?.close();
  srv = null;
  try {
    if (written && fs.readFileSync(file, 'utf8') === written) fs.rmSync(file, { force: true });
  } catch {}
  written = '';
}

const nodeOf = (dir: string, pid?: number) => [...nodes.values()].filter((n) => n.root === norm(dir) && (pid === undefined || n.pid === pid)).sort((a, b) => b.seen - a.seen)[0] || null;

async function find(dir: string, wait = 2500, pid?: number) {
  for (const end = Date.now() + wait; ; ) {
    const n = nodeOf(dir, pid);
    if (n || Date.now() >= end) return n;
    await new Promise((r) => setTimeout(r, 100));
  }
}

function exchange(n: Node, command: string, mode: string, ms: number) {
  return new Promise<Result>((res, rej) => {
    if (n.sock.destroyed) return rej(new Error('the editor closed the connection'));
    const id = ++ids;
    const fail = (e: Error) => {
      if (!waits.delete(id)) return;
      clearTimeout(timer);
      n.sock.off('close', onClose);
      rej(e);
    };
    const onClose = () => fail(new Error('the editor closed the connection'));
    const timer = setTimeout(() => fail(new Error(`the editor did not answer in ${Math.round(ms / 1000)} s (busy, or a dialog is open in it)`)), ms);
    waits.set(id, { res: (r) => (n.sock.off('close', onClose), res(r)), rej: fail, sock: n.sock, timer });
    n.sock.once('close', onClose);
    line(n.sock, { t: 'command', id, command, exec_mode: mode });
  });
}

async function py(dir: string, command: string, { mode = 'ExecuteStatement', ms = 15e3 } = {}) {
  const n = await find(dir);
  if (!n) throw new Error('no linked Unreal Editor for this project');
  return exchange(n, command, mode, ms);
}

const evalPy = async (dir: string, expr: string, ms?: number) => (await py(dir, expr, { mode: 'EvaluateStatement', ms })).result;
const yes = (s: string) => /^true$/i.test(String(s).trim());
const LES = 'unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)';

async function state(dir: string, wait = 2500) {
  const n = await find(dir, wait);
  return n ? { linked: true, engine: n.engine, name: n.name } : { linked: false, engine: '', name: '' };
}
const console_ = (dir: string, cmd: string) => py(dir, `unreal.SystemLibrary.execute_console_command(None, ${JSON.stringify(cmd)})`);
const liveCompile = (dir: string) => console_(dir, 'LiveCoding.Compile');
const liveCancel = (dir: string) => console_(dir, 'LiveCoding.Cancel');
const play = (dir: string) => py(dir, `${LES}.editor_request_begin_play()`);
const stop = (dir: string) => py(dir, `${LES}.editor_request_end_play()`);
const isPlaying = async (dir: string) => yes(await evalPy(dir, `${LES}.is_in_play_in_editor()`));
const save = async (dir: string) => yes(await evalPy(dir, 'unreal.EditorLoadingAndSavingUtils.save_dirty_packages_with_dialog(True, True)', 30 * 60e3));
const quit = (dir: string) => py(dir, 'unreal.SystemLibrary.quit_editor()');

async function verifyNode(dir: string, expectedPid?: number, wait = 2500) {
  if (expectedPid !== undefined && (!Number.isInteger(expectedPid) || expectedPid <= 0)) return null;
  return find(dir, wait, expectedPid);
}

type ExecMode = 'ExecuteFile' | 'ExecuteStatement' | 'EvaluateStatement';

async function execPython(dir: string, code: string, { mode = 'ExecuteFile', ms = 15e3 }: { mode?: ExecMode; ms?: number } = {}) {
  return py(dir, code, { mode, ms });
}

async function execPythonJson<T = unknown>(dir: string, script: string, ms = 15e3): Promise<T> {
  const r = await execPython(dir, script, { mode: 'ExecuteFile', ms });
  if (!r.success) {
    const detail = r.output.map((o) => o.output).filter(Boolean).join('\n') || r.result || 'Python execution failed';
    throw new Error(detail);
  }
  const lines = r.output.map((o) => String(o.output || '').trim()).filter(Boolean);
  const raw = lines.length ? lines[lines.length - 1] : String(r.result || '').trim();
  return JSON.parse(raw) as T;
}

async function readFromOffset(file: string, offset: number) {
  let fh: fs.promises.FileHandle;
  try {
    fh = await fs.promises.open(file, 'r');
  } catch {
    return '';
  }
  try {
    const st = await fh.stat();
    const from = st.size < offset ? 0 : offset;
    const len = Math.min(st.size - from, MAX_MSG);
    if (len <= 0) return '';
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, from);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

function sliceSentinels(chunk: string, start: string, end: string) {
  const rawLines = chunk.split(/\r?\n/);
  const sIdx = rawLines.findIndex((l) => l.includes(start));
  if (sIdx < 0) return null;
  const eIdx = rawLines.findIndex((l, i) => i > sIdx && l.includes(end));
  if (eIdx < 0) return null;
  return rawLines.slice(sIdx + 1, eIdx).map((l) => l.replace(/\r+$/, ''));
}

async function execConsole(dir: string, logPath: string, cmd: string, { ms = 15e3 }: { ms?: number } = {}) {
  const offset = await fs.promises.stat(logPath).then((s) => s.size).catch(() => 0);
  const token = crypto.randomBytes(6).toString('hex');
  const start = `__AMETHYST_CMD_START_${token}__`;
  const end = `__AMETHYST_CMD_END_${token}__`;
  const script = [
    'import unreal',
    `unreal.log(${JSON.stringify(start)})`,
    'try:',
    `    unreal.SystemLibrary.execute_console_command(None, ${JSON.stringify(cmd)})`,
    'finally:',
    `    unreal.log(${JSON.stringify(end)})`,
  ].join('\n');
  const r = await execPython(dir, script, { mode: 'ExecuteFile', ms });
  const deadline = Date.now() + 2000;
  let lines: string[] | null = null;
  while (Date.now() < deadline) {
    const chunk = await readFromOffset(logPath, offset);
    lines = sliceSentinels(chunk, start, end);
    if (lines !== null) break;
    await new Promise((res) => setTimeout(res, 50));
  }
  const out = lines || [];
  return { success: r.success, lines: out, raw: out.join('\n'), output: r.output, result: r.result };
}

export { init, linkFile, launch, state, py, verifyNode, execPython, execPythonJson, execConsole, liveCompile, liveCancel, play, stop, isPlaying, save, quit, shut };
export type { Result, ExecMode };
