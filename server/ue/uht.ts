import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { checkUnreal } from '../../public/ue/check.ts';

type Msg = { sev: string; file: string; line: number; col: number; code: string; text: string };
type Last = { at: number; ms: number; state: 'ok' | 'failed' | 'error'; messages: Msg[]; manifest: string };
type St = { running: boolean; again: boolean; timer: ReturnType<typeof setTimeout> | null; child: ChildProcessWithoutNullStreams | null; last: Last | null; why: string };
type Ctx = { key: string; root: string; uproject: string; engine: string; busy: () => boolean; parse: (s: string) => Msg | null; tell: (e: Record<string, unknown>) => void; log: string };

const SOON = 2000;
const states = new Map<string, St>();
const ready = new Map<string, Promise<boolean>>();

const stOf = (k: string) => {
  let s = states.get(k);
  if (!s) states.set(k, (s = { running: false, again: false, timer: null, child: null, last: null, why: '' }));
  return s;
};

function dotnet(engine: string) {
  const dll = path.join(engine, 'Engine', 'Binaries', 'DotNET', 'UnrealBuildTool', 'UnrealBuildTool.dll');
  if (!fs.existsSync(dll)) return null;
  const base = path.join(engine, 'Engine', 'Binaries', 'ThirdParty', 'DotNet');
  let want = '';
  try {
    want = /set\s+UE_DOTNET_VERSION=(\S+)/i.exec(fs.readFileSync(path.join(engine, 'Engine', 'Build', 'BatchFiles', 'GetDotnetPath.bat'), 'utf8'))?.[1] || '';
  } catch {}
  const dirs = (() => {
    try {
      return fs.readdirSync(base);
    } catch {
      return [];
    }
  })();
  const pick = [want, ...dirs.sort().reverse()].filter(Boolean).map((v) => path.join(base, v, 'win-x64')).find((d) => fs.existsSync(path.join(d, 'dotnet.exe')));
  if (!pick) return { exe: path.join(path.dirname(dll), 'UnrealBuildTool.exe'), pre: [] as string[], env: {} as Record<string, string> };
  return { exe: path.join(pick, 'dotnet.exe'), pre: [dll], env: { DOTNET_ROOT: pick, DOTNET_MULTILEVEL_LOOKUP: '0', DOTNET_ROLL_FORWARD: 'LatestMajor' } };
}

function launch(engine: string, root: string, args: string[]) {
  const fake = process.env.MIND_FAKE_UBT;
  if (fake) return spawn(process.execPath, [fake, ...args], { cwd: root, windowsHide: true });
  const d = dotnet(engine);
  if (!d) return null;
  return spawn(d.exe, [...d.pre, ...args], { cwd: root, windowsHide: true, env: { ...process.env, ...d.env, NoDefaultCurrentDirectoryInExePath: '1' } });
}

function supported(engine: string, root: string) {
  const k = path.normalize(engine).toLowerCase();
  let p = ready.get(k);
  if (!p) {
    p = new Promise<boolean>((res) => {
      const child = launch(engine, root, ['-Mode=UnrealHeaderTool', '-NoLog']);
      if (!child) return res(false);
      let out = '';
      const done = (ok: boolean) => res(ok);
      child.stdout.on('data', (b) => (out += b));
      child.stderr.on('data', (b) => (out += b));
      child.on('error', () => done(false));
      child.on('close', () => done(/-NoOutput\b/.test(out)));
      setTimeout(() => child.kill(), 60000);
    });
    ready.set(k, p);
  }
  return p;
}

async function manifestOf(root: string) {
  const base = path.join(root, 'Intermediate', 'Build', 'Win64');
  let best = '', at = 0;
  for (const t of await fs.promises.readdir(base).catch(() => [] as string[])) {
    for (const c of await fs.promises.readdir(path.join(base, t)).catch(() => [] as string[])) {
      const f = path.join(base, t, c, `${t}.uhtmanifest`);
      const st = await fs.promises.stat(f).catch(() => null);
      if (st && st.mtimeMs > at) [best, at] = [f, st.mtimeMs];
    }
  }
  return best;
}

async function missed(c: Ctx, messages: Msg[]) {
  const lines: string[] = [];
  const byFile = new Map<string, Msg[]>();
  for (const m of messages) if (m.file && m.line) byFile.set(m.file, [...(byFile.get(m.file) || []), m]);
  for (const [file, list] of byFile) {
    const src = await fs.promises.readFile(file, 'utf8').catch(() => '');
    if (!src) continue;
    const starts = [0];
    for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) starts.push(i + 1);
    const marked = new Set(checkUnreal(src, path.basename(file)).map((x) => starts.findLastIndex((s) => s <= x.from) + 1));
    for (const m of list) if (!marked.has(m.line)) lines.push(`${new Date().toISOString()}\t${file}(${m.line}): ${m.sev}: ${m.text}`);
  }
  if (lines.length) await fs.promises.appendFile(c.log, lines.join('\n') + '\n').catch(() => {});
}

async function run(c: Ctx) {
  const s = stOf(c.key);
  if (s.running) return void (s.again = true);
  if (c.busy()) {
    s.why = 'building';
    return c.tell({ type: 'uht', ...view(s) });
  }
  s.running = true;
  s.again = false;
  const stop = (why: string) => {
    s.running = false;
    s.why = why;
    c.tell({ type: 'uht', ...view(s) });
  };
  if (!(await supported(c.engine, c.root))) return stop('unsupported');
  const manifest = await manifestOf(c.root);
  if (!manifest) return stop('no-manifest');
  const child = launch(c.engine, c.root, ['-Mode=UnrealHeaderTool', c.uproject, manifest, '-NoOutput', '-NoLog', '-FromMsBuild']);
  if (!child) return stop('unsupported');
  s.why = '';
  s.child = child;
  c.tell({ type: 'uht', ...view(s) });
  const t0 = Date.now(), messages: Msg[] = [];
  let result = '';
  for (const io of [child.stdout, child.stderr])
    readline.createInterface({ input: io, crlfDelay: Infinity }).on('line', (l) => {
      const p = c.parse(l);
      if (p && p.file && messages.length < 500) messages.push(p);
      if (/^Result:\s*(\w+)/.test(l.trim())) result = l.trim();
    });
  const code = await new Promise<number>((res) => {
    child.on('error', () => res(-1));
    child.on('close', (n) => res(n ?? -1));
  });
  s.running = false;
  s.child = null;
  const state = code === 0 ? 'ok' : messages.length || /Failed/.test(result) ? 'failed' : 'error';
  s.last = { at: Date.now(), ms: Date.now() - t0, state, messages, manifest };
  c.tell({ type: 'uht', ...view(s) });
  if (messages.length) missed(c, messages);
  if (s.again) soon(c);
}

function soon(c: Ctx, ms = SOON) {
  const s = stOf(c.key);
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(() => {
    s.timer = null;
    run(c);
  }, ms);
}

const view = (s: St) => ({ state: s.running ? 'running' : s.timer || s.again ? 'queued' : 'idle', why: s.why, last: s.last });

function uht(c: Ctx, { run: now = false, soon: later = false }: { run?: boolean; soon?: boolean }) {
  if (now) run(c);
  else if (later) soon(c);
  return view(stOf(c.key));
}

function stopUht() {
  for (const s of states.values()) {
    if (s.timer) clearTimeout(s.timer);
    s.child?.kill();
  }
}

export { uht, stopUht, manifestOf };
export type { Ctx as UhtCtx };
