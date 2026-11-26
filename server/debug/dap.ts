import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';

type Msg = Record<string, any>;
type Waiter = { resolve: (m: Msg) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; command: string };

export interface Dap {
  req: (command: string, args?: unknown, ms?: number) => Promise<Msg>;
  on: (fn: (event: string, body: Msg) => void) => void;
  onExit: (fn: (code: number | null, why: string) => void) => void;
  kill: () => void;
  alive: () => boolean;
  pid: () => number;
  stderr: () => string[];
}

const HEAD = '\r\n\r\n';

export function startDap(exe: string, args: string[], cwd: string): Dap {
  const child: ChildProcessWithoutNullStreams = spawn(exe, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let seq = 1, buf = Buffer.alloc(0), dead = false, why = '';
  const waiting = new Map<number, Waiter>();
  const handlers: ((event: string, body: Msg) => void)[] = [];
  const exits: ((code: number | null, why: string) => void)[] = [];
  const errLines: string[] = [];

  const write = (m: Msg) => {
    if (dead) return;
    const s = JSON.stringify(m);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(s, 'utf8')}${HEAD}${s}`);
  };

  const answer = (m: Msg) => {
    const known = m.command === 'runInTerminal' || m.command === 'startDebugging';
    write({ seq: seq++, type: 'response', request_seq: m.seq, command: m.command, success: false, message: known ? 'Amethyst runs programs itself' : `Amethyst does not answer ${m.command}` });
  };

  const take = (m: Msg) => {
    if (m.type === 'response') {
      const w = waiting.get(m.request_seq);
      if (!w) return;
      waiting.delete(m.request_seq);
      clearTimeout(w.timer);
      if (m.success) w.resolve(m);
      else w.reject(Object.assign(new Error(m.message || m.body?.error?.format || `${w.command} failed`), { dap: m }));
    } else if (m.type === 'event') for (const fn of handlers) fn(m.event, m.body || {});
    else if (m.type === 'request') answer(m);
  };

  child.stdout.on('data', (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const start = buf.indexOf('Content-Length:');
      if (start < 0) {
        if (buf.length > 1 << 16) buf = Buffer.alloc(0);
        return;
      }
      if (start > 0) buf = buf.subarray(start);
      const end = buf.indexOf(HEAD);
      if (end < 0) return;
      const len = Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0, end).toString('ascii'))?.[1]);
      if (!Number.isFinite(len)) {
        buf = buf.subarray(end + HEAD.length);
        continue;
      }
      const from = end + HEAD.length;
      if (buf.length < from + len) return;
      const text = buf.subarray(from, from + len).toString('utf8');
      buf = buf.subarray(from + len);
      try {
        take(JSON.parse(text));
      } catch {}
    }
  });
  child.stderr.on('data', (d: Buffer) => {
    for (const l of d.toString('utf8').split(/\r?\n/)) if (l.trim()) errLines.push(l.slice(0, 400));
    if (errLines.length > 200) errLines.splice(0, errLines.length - 200);
  });
  const gone = (code: number | null) => {
    if (dead) return;
    dead = true;
    for (const w of waiting.values()) {
      clearTimeout(w.timer);
      w.reject(new Error(`the debug adapter ended while waiting for ${w.command}`));
    }
    waiting.clear();
    for (const fn of exits) fn(code, why);
  };
  child.on('error', (e) => {
    why = e.message;
    gone(null);
  });
  child.on('exit', (code) => gone(code));
  child.stdin.on('error', () => {});

  return {
    req(command, args, ms = 30e3) {
      if (dead) return Promise.reject(new Error('the debug adapter is not running'));
      const s = seq++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(s);
          reject(new Error(`the debug adapter did not answer ${command} in ${Math.round(ms / 1000)} s`));
        }, ms);
        waiting.set(s, { resolve, reject, timer, command });
        write({ seq: s, type: 'request', command, arguments: args ?? {} });
      });
    },
    on: (fn) => void handlers.push(fn),
    onExit: (fn) => void exits.push(fn),
    kill() {
      if (dead) return;
      try {
        child.kill();
      } catch {}
    },
    alive: () => !dead,
    pid: () => child.pid || 0,
    stderr: () => errLines.slice(),
  };
}
