import fs from 'fs';
import os from 'os';
import path from 'path';

const EVERY = 500;
const TAIL = 8192;
const BASH = /^b[a-z0-9]+\.output$/;
const NAMED = /Output is being written to: (.+?[\\/]tasks[\\/][^\s\\/]+?\.output)(?=\.(?!\w)|\s|$)/;
const ENDED = /\n*\[exited with code (\d+)\]\s*$/;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[@-_]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const root = () => path.join(os.tmpdir(), 'claude');

interface Cmd {
  id: string;
  on: (data: string) => void;
  file: string | null;
  size: number;
  data: string;
  bg: boolean;
  start: number;
}
interface Tails {
  dir: string | null;
  cmds: Map<string, Cmd>;
  claimed: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
}
interface TailChat {
  tails?: Tails;
  sessionId?: string | null;
  ended?: boolean;
}

const clean = (t: string) => t.split('\n').map((l) => (l.split('\r').filter(Boolean).pop() || '').replace(ANSI, '')).join('\n');

const of = (c: TailChat): Tails => (c.tails ||= { dir: null, cmds: new Map(), claimed: new Set(), timer: null });
function dirOf(sid: string) {
  let hs: string[] = [];
  try {
    hs = fs.readdirSync(root()).filter((h) => /^[0-9a-f]{16}$/.test(h));
  } catch {
    return null;
  }
  for (const h of hs) {
    const d = path.join(root(), h, sid, 'tasks');
    if (fs.existsSync(d)) return d;
  }
  return null;
}

function read(x: Cmd) {
  let st;
  try {
    st = fs.statSync(x.file!);
  } catch {
    return false;
  }
  if (st.size === x.size) return false;
  x.size = st.size;
  const n = Math.min(TAIL, st.size), buf = Buffer.alloc(n);
  let fd: number | null = null;
  try {
    fd = fs.openSync(x.file!, 'r');
    fs.readSync(fd, buf, 0, n, st.size - n);
  } catch {
    return false;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
  let t = buf.toString('utf8');
  if (st.size > n) t = t.slice(t.indexOf('\n') + 1);
  x.data = clean(t);
  return true;
}

function poll(c: TailChat) {
  const T = of(c);
  if (!T.cmds.size || c.ended) return void (clearInterval(T.timer!), (T.timer = null));
  const waiting = [...T.cmds.values()].filter((x) => !x.file);
  if (waiting.length && c.sessionId && (T.dir ||= dirOf(c.sessionId))) {
    const since = waiting[0].start - 2000;
    let files: { f: string; at: number }[] = [];
    try {
      files = fs.readdirSync(T.dir).filter((f) => BASH.test(f) && !T.claimed.has(f)).map((f) => ({ f, at: fs.statSync(path.join(T.dir!, f)).birthtimeMs })).filter((x) => x.at >= since).sort((a, b) => a.at - b.at);
    } catch {}
    for (const { f } of files) {
      const x = waiting.shift();
      if (!x) break;
      T.claimed.add(f);
      x.file = path.join(T.dir!, f);
    }
  }
  for (const x of T.cmds.values()) if (x.file && read(x)) x.on(x.data);
}

function watch(c: TailChat, id: string, on: (data: string) => void) {
  const T = of(c);
  if (T.cmds.has(id)) return;
  T.cmds.set(id, { id, on, file: null, size: -1, data: '', bg: false, start: Date.now() });
  T.timer ||= setInterval(() => poll(c), EVERY);
}
const has = (c: TailChat, id: string) => !!c.tails?.cmds.has(id);
const isBg = (c: TailChat, id: string) => !!c.tails?.cmds.get(id)?.bg;

function named(c: TailChat, id: string, text: unknown) {
  const x = c.tails?.cmds.get(id), m = typeof text === 'string' && text.match(NAMED);
  if (!x || !m) return false;
  const file = path.resolve(m[1]);
  if (!file.toLowerCase().startsWith(root().toLowerCase() + path.sep)) return false;
  if (x.file !== file) Object.assign(x, { file, size: -1 });
  x.bg = true;
  return true;
}

function end(c: TailChat, id: string) {
  const T = c.tails, x = T?.cmds.get(id);
  if (!x) return null;
  T!.cmds.delete(id);
  if (x.file) read(x);
  const m = x.data.match(ENDED);
  return { data: m ? x.data.slice(0, m.index) : x.data, exit: m ? Number(m[1]) : null };
}

function stopAll(c: TailChat) {
  if (!c.tails) return;
  clearInterval(c.tails.timer!);
  c.tails.timer = null;
  c.tails.cmds.clear();
}

export { watch, has, isBg, named, end, stopAll, clean, TAIL };
