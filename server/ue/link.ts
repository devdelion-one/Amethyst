import crypto from 'crypto';
import dgram from 'dgram';
import net from 'net';
import path from 'path';

interface Node {
  id: string;
  root: string;
  name: string;
  engine: string;
  seen: number;
}
interface Result {
  success: boolean;
  result: string;
  output: { type: string; output: string }[];
}
interface Conn {
  sock: net.Socket;
  busy: Promise<unknown>;
}

const GROUP = '239.0.0.1';
const BIND = '127.0.0.1';
const PORT = () => Number(process.env.MIND_UE_LINK_PORT) || 6766;
const MAGIC = 'ue_py';
const PING_MS = 1000;
const LOST_MS = 5000;
const IDLE_MS = 60e3;

const me = crypto.randomUUID();
const nodes = new Map<string, Node>();
const conns = new Map<string, Conn>();
let udp: dgram.Socket | null = null;
let pinger: ReturnType<typeof setInterval> | null = null;
let used = 0;

const norm = (p: string) => path.normalize(String(p || '')).replace(/[\\/]+$/, '').toLowerCase();
const msg = (type: string, dest?: string, data?: unknown) => Buffer.from(JSON.stringify({ version: 1, magic: MAGIC, type, source: me, ...(dest ? { dest } : {}), ...(data ? { data } : {}) }), 'utf8');

function read(buf: Buffer) {
  try {
    const m = JSON.parse(buf.toString('utf8'));
    if (m?.version !== 1 || m.magic !== MAGIC || m.source === me || (m.dest && m.dest !== me)) return null;
    return m;
  } catch {
    return null;
  }
}

function send(type: string, dest?: string, data?: unknown) {
  if (udp) udp.send(msg(type, dest, data), PORT(), GROUP, () => {});
}

function open() {
  used = Date.now();
  if (udp) return;
  const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp = s;
  s.on('error', () => shut());
  s.on('message', (buf) => {
    const m = read(buf);
    if (m?.type !== 'pong' || !m.data) return;
    nodes.set(m.source, { id: m.source, root: norm(m.data.project_root), name: String(m.data.project_name || ''), engine: String(m.data.engine_version || ''), seen: Date.now() });
  });
  s.bind(PORT(), BIND, () => {
    try {
      s.setMulticastLoopback(true);
      s.setMulticastTTL(0);
      s.setMulticastInterface(BIND);
      s.addMembership(GROUP, BIND);
    } catch {}
    send('ping');
  });
  pinger = setInterval(() => {
    const now = Date.now();
    for (const [id, n] of nodes) if (now - n.seen > LOST_MS) drop(id);
    if (now - used > IDLE_MS && !conns.size) return shut();
    send('ping');
  }, PING_MS);
  pinger.unref?.();
}

function drop(id: string) {
  nodes.delete(id);
  conns.get(id)?.sock.destroy();
  conns.delete(id);
}

function shut() {
  if (pinger) clearInterval(pinger);
  pinger = null;
  for (const id of [...conns.keys()]) drop(id);
  nodes.clear();
  try {
    udp?.close();
  } catch {}
  udp = null;
}

const nodeOf = (dir: string) => [...nodes.values()].filter((n) => n.root === norm(dir)).sort((a, b) => b.seen - a.seen)[0] || null;

async function find(dir: string, wait = 2500) {
  open();
  for (const end = Date.now() + wait; ; ) {
    const n = nodeOf(dir);
    if (n || Date.now() >= end) return n;
    await new Promise((r) => setTimeout(r, 100));
  }
}

function connect(n: Node) {
  const was = conns.get(n.id);
  if (was && !was.sock.destroyed) return Promise.resolve(was);
  return new Promise<Conn>((res, rej) => {
    const srv = net.createServer();
    let tries = 0, timer: ReturnType<typeof setInterval> | null = null;
    const end = (e: Error | null, sock?: net.Socket) => {
      if (timer) clearInterval(timer);
      srv.close();
      if (e || !sock) return rej(e || new Error('the editor did not connect'));
      const c: Conn = { sock, busy: Promise.resolve() };
      sock.on('close', () => conns.get(n.id) === c && conns.delete(n.id));
      sock.on('error', () => {});
      conns.set(n.id, c);
      res(c);
    };
    srv.on('connection', (sock) => end(null, sock));
    srv.on('error', (e) => end(e));
    srv.listen(0, BIND, () => {
      const port = (srv.address() as net.AddressInfo).port;
      const ask = () => {
        if (++tries > 10) return end(new Error('the editor did not open the command connection'));
        send('open_connection', n.id, { command_ip: BIND, command_port: port });
      };
      ask();
      timer = setInterval(ask, 1000);
    });
  });
}

function exchange(c: Conn, n: Node, command: string, mode: string, ms: number) {
  return new Promise<Result>((res, rej) => {
    let buf = Buffer.alloc(0);
    const done = (e: Error | null, r?: Result) => {
      clearTimeout(timer);
      c.sock.off('data', onData);
      c.sock.off('close', onClose);
      if (e) {
        c.sock.destroy();
        return rej(e);
      }
      res(r!);
    };
    const onData = (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const m = read(buf);
      if (m?.type === 'command_result') done(null, { success: !!m.data?.success, result: String(m.data?.result ?? ''), output: Array.isArray(m.data?.output) ? m.data.output : [] });
    };
    const onClose = () => done(new Error('the editor closed the connection'));
    const timer = setTimeout(() => done(new Error(`the editor did not answer in ${Math.round(ms / 1000)} s (busy, or a dialog is open in it)`)), ms);
    c.sock.on('data', onData);
    c.sock.on('close', onClose);
    c.sock.write(msg('command', n.id, { command, unattended: true, exec_mode: mode }));
  });
}

async function py(dir: string, command: string, { mode = 'ExecuteStatement', ms = 15e3 } = {}) {
  const n = await find(dir);
  if (!n) throw new Error('no linked Unreal Editor for this project');
  const c = await connect(n);
  const run = c.busy.then(() => exchange(c, n, command, mode, ms));
  c.busy = run.catch(() => {});
  return run;
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

export { state, py, liveCompile, liveCancel, play, stop, isPlaying, save, quit, shut };
