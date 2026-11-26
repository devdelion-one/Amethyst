import { exec, execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as live from '../base/live.ts';
import { createRequire } from 'module';
import type { Routes } from '../../public/base/types.ts';
import { firstLine, replaceSync, TAIL, WIN } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';
const require = createRequire(import.meta.url);

interface Program {
  name: string;
  cmd: string;
  alt?: string;
  args?: string[];
  env?: Record<string, string>;
  hooks?: boolean;
  at?: string;
  shell?: boolean;
  fake?: string;
}
type TermEv = Record<string, unknown>;
type Out = (ev: TermEv) => void;
interface Term {
  id: string;
  key: string;
  program: string;
  account?: string;
  am: number;
  P: Program;
  cwd: string;
  out: string;
  pending: string;
  flush: ReturnType<typeof setTimeout> | null;
  clients: Set<Out>;
  status: string;
  lastIn: number;
  quiet: ReturnType<typeof setTimeout> | null;
  marks: boolean;
  ended: boolean;
  closed: boolean;
  osc: string;
  osc7501: string;
  prompt: string;
  quick: boolean;
  qkey: string;
  p?: any;
  code?: number;
}
type ClaudeAccount = (am: number) => { id: string; env: Record<string, string | undefined>; settings?: (root: string) => Record<string, string> | null };

let pty: any = null;
try {
  pty = require('node-pty');
} catch {}

const KEEP = 256 * 1024;
const QUIET = 3000;
const ECHO = 400;
const GONE = 2 * 60e3;
const NO_PTY = 'Terminals need node-pty: run npm install in the Amethyst folder, then start Amethyst again.';

const MARKS = Buffer.from(
  `if (Get-Command PSConsoleHostReadLine -ErrorAction Ignore) {
  $global:__amRead = $function:PSConsoleHostReadLine
  $global:__amPrompt = $function:prompt
  $global:__amRan = $false
  function global:PSConsoleHostReadLine {
    $l = & $global:__amRead
    if ("$l".Trim()) { $global:__amRan = $true; [Console]::Write("$([char]27)]133;C$([char]7)") }
    $l
  }
  function global:prompt {
    $ok = $?; $code = $global:LASTEXITCODE
    $m = ''
    if ($global:__amRan) {
      $global:__amRan = $false
      $m = "$([char]27)]133;D;$(if ($ok) { 0 } elseif ($code) { $code } else { 1 })$([char]7)"
    }
    $p = if ($global:__amPrompt) { & $global:__amPrompt } else { "PS $($executionContext.SessionState.Path.CurrentLocation)> " }
    $global:LASTEXITCODE = $code
    "$m$([char]27)]133;A$([char]7)$p"
  }
}`,
  'utf16le',
).toString('base64');

const PROGRAMS: Record<string, Program> = {
  claude: { name: 'claude', cmd: 'claude', hooks: true },
  codex: { name: 'codex', cmd: 'codex' },
  antigravity: { name: 'agy', cmd: 'agy', at: path.join(os.homedir(), '.gemini', 'bin', WIN ? 'agy.exe' : 'agy'), env: { AGY_CLI_OSC7501: 'on' } },
  cursor: { name: 'agent', cmd: 'agent' },
  copilot: { name: 'copilot', cmd: 'copilot', ...(WIN ? { at: path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'GitHubCopilotCLI', 'copilot.exe') } : {}) },
  grok: { name: 'grok', cmd: 'grok', at: path.join(os.homedir(), '.grok', 'bin', WIN ? 'grok.exe' : 'grok') },
  gemini: { name: 'gemini', cmd: 'gemini' },
  shell: { name: WIN ? 'PowerShell' : 'shell', cmd: WIN ? 'pwsh' : process.env.SHELL || 'bash', alt: WIN ? 'powershell' : 'sh', args: WIN ? ['-NoLogo', '-NoExit', '-EncodedCommand', MARKS] : [], shell: true },
  ...(WIN ? { cmd: { name: 'Command Prompt', cmd: 'cmd.exe' } } : {}),
};
if (process.env.MIND_FAKE_CLAUDE) PROGRAMS.claude.fake = process.env.MIND_FAKE_CLAUDE;
if (process.env.MIND_FAKE_AGY) PROGRAMS.antigravity.fake = process.env.MIND_FAKE_AGY;

const terms = new Map<string, Term>();
const quick = new Map<string, string>();

const found = new Map<string, { at: number; file: string | null }>();
function where(cmd: string): Promise<string | null> {
  const hit = found.get(cmd);
  if (hit && Date.now() - hit.at < 30e3) return Promise.resolve(hit.file);
  return new Promise((resolve) =>
    exec(WIN ? `where ${cmd}` : `command -v ${cmd}`, { windowsHide: true, timeout: 5000 }, (err, out) => {
      const all = err ? [] : String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const file = (WIN ? all.find((f) => /\.(exe|cmd|bat|com)$/i.test(f)) : all[0]) || null;
      found.set(cmd, { at: Date.now(), file });
      resolve(file);
    }),
  );
}
const locate = async (P: Program) => (P.fake ? process.execPath : (await where(P.cmd)) || (P.alt ? await where(P.alt) : null) || (P.at && fs.existsSync(P.at) ? P.at : null));

const q = (s: string) => (/[\s"&|<>^]/.test(s) ? `"${s}"` : s);
const commandOf = (file: string, args: string[]): [string, string | string[]] => (WIN && /\.(cmd|bat)$/i.test(file) ? ['cmd.exe', `/d /s /c "${[file, ...args].map(q).join(' ')}"`] : [file, args]);

let hookFile: string | null = null, hookUrl = '', claudeAccount: ClaudeAccount | null = null;
function init({ dataDir, port, claudeAccount: account, hookPath }: { dataDir: string; port: number; claudeAccount?: ClaudeAccount; hookPath: string }) {
  claudeAccount = account || null;
  hookUrl = `http://127.0.0.1:${port}/api/term/hook`;
  const hook = hookPath.replace(/\\/g, '/');
  let node = 'node';
  if (process.versions.electron) {
    try {
      execSync(WIN ? 'where node' : 'command -v node', { stdio: 'ignore', windowsHide: true, timeout: 5000 });
    } catch {
      node = q(process.execPath.replace(/\\/g, '/'));
    }
  }
  const run = (what: string) => [{ hooks: [{ type: 'command', command: `${node} ${q(hook)} ${what}`, timeout: 10 }] }];
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    hookFile = path.join(dataDir, 'claude-hooks.json');
    replaceSync(hookFile, JSON.stringify({ hooks: { UserPromptSubmit: run('working'), Notification: run('asks'), Stop: run('done') } }, null, 2));
  } catch {
    hookFile = null;
  }
}

function settingsFor(acc: ReturnType<ClaudeAccount> | null, root: string) {
  const extra = acc?.settings?.(root);
  if (!extra) return hookFile!;
  try {
    const file = path.join(path.dirname(hookFile!), `claude-hooks-${acc!.id}-${crypto.createHash('sha1').update(root).digest('hex').slice(0, 10)}.json`);
    replaceSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(hookFile!, 'utf8')), ...extra }, null, 2));
    return file;
  } catch {
    return hookFile!;
  }
}
const send = (t: Term, ev: TermEv) => t.clients.forEach((out) => out(ev));
function flush(t: Term) {
  clearTimeout(t.flush!);
  t.flush = null;
  const data = t.pending;
  t.pending = '';
  if (data) send(t, { type: 'out', data });
}

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[@-_]|[\x00-\x08\x0b-\x1f\x7f]/g;
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const OSC_TITLE = /\x1b\][02];([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const OSC_MARK = /\x1b\]133;([A-D])(?:;(-?\d+))?(?:\x07|\x1b\\)/g;
const OSC_STATUS = /\x1b\]7501;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const REPORT = /^(?:\x1b\[[IO]|\x1b\[\d+;\d+R|\x1b\[[?>][\d;]*c|\x1b\[\?[\d;]+\$y)+$/;
function decodeOscText(s: string) {
  if (!/^[A-Za-z0-9+/=_-]+$/.test(s)) return null;
  try {
    const text = Buffer.from(s, 'base64').toString('utf8');
    return /[\x00-\x1f\x7f]/.test(text) ? null : text.trim();
  } catch {
    return null;
  }
}
function parseOscStatus(raw: string) {
  const fields: Record<string, string> = {};
  for (const part of raw.split(':')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const state = fields.state;
  if (!state || !/^(idle|working|done|blocked|error|failed|clear)$/.test(state)) return null;
  const msg = fields.msg ? decodeOscText(fields.msg) : '';
  const title = fields.title ? decodeOscText(fields.title) : '';
  if (msg === null || title === null) return null;
  const progress = fields.progress && /^(100|[1-9]?\d)$/.test(fields.progress) ? Number(fields.progress) : null;
  return { state, kind: fields.kind || '', msg, title, progress };
}
function applyOscStatus(t: Term, body: string) {
  const p = parseOscStatus(body);
  if (!p) return false;
  t.marks = true;
  clearTimeout(t.quiet!);
  const detail = firstLine(p.msg || p.title);
  if (p.state === 'working') mark(t, 'working', detail || (p.progress != null ? `${p.progress}%` : ''));
  else if (p.state === 'blocked') {
    const fallback = p.kind === 'permission' ? 'needs permission' : p.kind === 'question' ? 'has a question' : p.kind === 'auth' ? 'needs sign-in' : 'needs you';
    mark(t, 'asks', detail || fallback);
  } else if (p.state === 'done') mark(t, 'done', detail || 'finished');
  else if (p.state === 'error' || p.state === 'failed') mark(t, 'done', detail || 'failed');
  else if ((p.state === 'idle' || p.state === 'clear') && t.status !== 'done') mark(t, 'idle', '');
  return true;
}
function lastOut(out: string) {
  const lines = out.slice(-TAIL).split('\n').map((l) => l.split('\r').filter((p) => p.replace(ANSI, '').trim()).pop()?.replace(ANSI, '').trim() || '').filter(Boolean);
  const pick = lines.length > 1 && /[>$#%]$/.test(lines.at(-1)!) ? lines.at(-2) : lines.at(-1);
  return (pick || '').slice(0, 140);
}
function cleanTitle(s: string) {
  const t = String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim().slice(0, 80);
  return /^(claude( code)?|codex|gemini|agy|antigravity|grok|(windows )?powershell|pwsh|cmd|command prompt|bash|zsh|sh)$/i.test(t) || /\.exe$/i.test(t) || /^[a-z]:\\/i.test(t) ? '' : t;
}

function mark(t: Term, status: string, line?: string | null) {
  if (t.ended || t.closed) return;
  t.status = status;
  if (!t.quick) live.set(t.id, { status, ...(line != null ? { line } : {}) });
  send(t, { type: 'status', status });
}
const retitle = (t: Term) => !t.ended && !t.closed && !t.quick && live.set(t.id, { title: t.osc || t.prompt || '' });

function watchOut(t: Term, d: string) {
  let m: RegExpExecArray | null, title: string | null = null;
  OSC_TITLE.lastIndex = 0;
  while ((m = OSC_TITLE.exec(d))) title = m[1];
  if (title != null && cleanTitle(title) !== t.osc) {
    t.osc = cleanTitle(title);
    retitle(t);
  }
  if (t.status === 'starting') mark(t, 'idle', 'ready');
  if (t.P.hooks || t.ended) return;
  const chunk = t.osc7501 + d;
  const start = chunk.lastIndexOf('\x1b]7501;');
  const tail = start >= 0 ? chunk.slice(start + 7) : '';
  if (start >= 0 && !tail.includes('\x07') && !tail.includes('\x1b\\')) t.osc7501 = chunk.slice(start, start + 4096);
  else t.osc7501 = '';
  OSC_STATUS.lastIndex = 0;
  while ((m = OSC_STATUS.exec(chunk))) applyOscStatus(t, m[1]);
  OSC_MARK.lastIndex = 0;
  while ((m = OSC_MARK.exec(d))) {
    t.marks = true;
    clearTimeout(t.quiet!);
    if (m[1] === 'C') mark(t, 'working', '');
    else if (m[1] === 'D' && t.status === 'working') mark(t, 'done', m[2] && m[2] !== '0' ? `exit ${m[2]}` : lastOut(t.out) || 'finished');
  }
  if (t.marks) return;
  const now = Date.now();
  if (!t.lastIn || now - t.lastIn < ECHO) return;
  if (!t.P.shell && d.replace(OSC, '').includes('\x07')) return mark(t, 'asks', 'rang the bell');
  if (t.status !== 'working' && t.status !== 'asks') mark(t, 'working', '');
  clearTimeout(t.quiet!);
  t.quiet = setTimeout(() => t.status === 'working' && mark(t, 'done', (t.P.shell && lastOut(t.out)) || 'finished'), QUIET);
}

function ended(t: Term, code: number) {
  if (t.ended) return;
  flush(t);
  clearTimeout(t.quiet!);
  if (quick.get(t.qkey) === t.id) quick.delete(t.qkey);
  if (!t.closed && !t.quick) live.set(t.id, { status: 'ended', line: code ? `exited (${code})` : 'exited' });
  t.ended = true;
  t.status = 'ended';
  t.code = code;
  send(t, { type: 'exit', code });
  t.clients.clear();
  setTimeout(() => terms.delete(t.id), GONE);
}

function kill(t: Term) {
  if (t.ended) return;
  if (WIN) exec(`taskkill /pid ${t.p.pid} /T /F`, { windowsHide: true }, () => {});
  else {
    try {
      t.p.kill();
    } catch {}
  }
}

const size = (v: string | number, d: number) => (Number.isInteger(+v) && +v >= 2 && +v <= 1000 ? +v : d);
const termOf = (id: unknown) => {
  const t = terms.get(String(id || ''));
  if (!t) throw new HttpError(404, 'that terminal has ended');
  if (t.ended) throw new HttpError(410, 'that terminal has ended');
  return t;
};

const ROUTES: Routes = {
  'GET /api/terms': async () => ({
    available: !!pty,
    why: pty ? '' : NO_PTY,
    programs: await Promise.all(Object.entries(PROGRAMS).map(async ([id, P]) => ({ id, name: P.name, installed: !!(await locate(P)) }))),
  }),
  'POST /api/term': async ({ program, cols, rows, quick: isQuick }, _q, root: string | null, pid, _R, am = 1) => {
    if (!root) throw new HttpError(400, 'a terminal opens inside a project');
    if (!pty) throw new HttpError(424, NO_PTY);
    const P = PROGRAMS[program];
    if (!P) throw new HttpError(400, 'no such program');
    const qkey = isQuick ? `${am}:${pid}:${program}` : '';
    const running = () => {
      const t = qkey && terms.get(quick.get(qkey)!);
      return t && !t.ended ? { id: t.id, name: P.name } : null;
    };
    if (running()) return running();
    const file = await locate(P);
    if (!file) throw new HttpError(424, `${P.name} is not on this PC (it isn't on the PATH)`);
    if (running()) return running();
    const id = 't' + crypto.randomBytes(5).toString('hex'), key = crypto.randomBytes(16).toString('hex');
    const acc = program === 'claude' && claudeAccount ? claudeAccount(am) : null;
    const args = [...(P.fake ? [P.fake] : []), ...(P.args || []), ...(P.hooks && hookFile ? ['--settings', settingsFor(acc, root)] : [])];
    const [f, a] = commandOf(file, args);
    const t: Term = { id, key, program, account: acc?.id, am, P, cwd: root, out: '', pending: '', flush: null, clients: new Set(), status: 'starting', lastIn: 0, quiet: null, marks: false, ended: false, closed: false, osc: '', osc7501: '', prompt: '', quick: !!qkey, qkey };
    try {
      t.p = pty.spawn(f, a, {
        name: 'xterm-256color',
        cols: size(cols, 100),
        rows: size(rows, 30),
        cwd: root,
        env: { ...P.env, ...process.env, ...acc?.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', MIND_TERM_ID: id, MIND_TERM_KEY: key, MIND_TERM_URL: hookUrl },
      });
    } catch (e) {
      throw new HttpError(500, `${P.name} could not start: ${(e as Error).message}`);
    }
    terms.set(id, t);
    if (qkey) quick.set(qkey, id);
    else live.set(id, { kind: 'term', program, cwd: root, pid, status: 'starting' });
    t.p.onData((d: string) => {
      t.out += d;
      if (t.out.length > KEEP * 1.25) {
        const s = t.out.slice(-KEEP), nl = s.indexOf('\n');
        t.out = nl >= 0 && nl < 4096 ? s.slice(nl + 1) : s;
      }
      t.pending += d;
      t.flush ||= setTimeout(() => flush(t), 8);
      watchOut(t, d);
    });
    t.p.onExit(({ exitCode }: { exitCode: number }) => ended(t, exitCode));
    return { id, name: P.name };
  },
  'POST /api/term/send': async ({ id, data, cols, rows, redraw }) => {
    const t = termOf(id);
    if (typeof data === 'string' && data) {
      t.p.write(data.slice(0, 1e6));
      if (!REPORT.test(data)) {
        t.lastIn = Date.now();
        if (t.status === 'asks') mark(t, 'working', '');
      }
    }
    if (cols != null || rows != null) {
      const c = size(cols, t.p.cols), r = size(rows, t.p.rows);
      if (c !== t.p.cols || r !== t.p.rows) t.p.resize(c, r);
      else if (redraw && r > 2) {
        t.p.resize(c, r - 1);
        setTimeout(() => !t.ended && t.p.resize(c, r), 40);
      }
    }
    return { ok: true };
  },
  'DELETE /api/term': async (_b, q) => {
    const t = terms.get(String(q!.get('id') || ''));
    if (t) {
      t.closed = true;
      if (quick.get(t.qkey) === t.id) quick.delete(t.qkey);
      kill(t);
    }
    live.drop(String(q!.get('id') || ''));
    return { ok: true };
  },
  'POST /api/term/hook': async ({ id, key, event, prompt, message, type, text }) => {
    const t = terms.get(String(id || ''));
    const k = Buffer.from(String(key || '')), want = Buffer.from(t?.key || '');
    if (!t || k.length !== want.length || !crypto.timingSafeEqual(k, want)) throw new HttpError(403, 'no such terminal');
    if (event === 'working') {
      if (!t.prompt && prompt) {
        t.prompt = firstLine(prompt, 80);
        retitle(t);
      }
      mark(t, 'working', firstLine(prompt));
    } else if (event === 'asks') {
      if (type === 'idle_prompt' || /waiting for your input/i.test(message || '')) return { ok: true };
      mark(t, 'asks', firstLine(message) || 'needs you');
    } else if (event === 'done') mark(t, 'done', live.lastLine(text) || 'finished');
    return { ok: true };
  },
};

function follow(id: string, out: Out) {
  const t = terms.get(id);
  if (!t) return void out({ type: 'exit', gone: true });
  flush(t);
  if (t.out) out({ type: 'out', data: t.out });
  out({ type: 'status', status: t.status });
  if (t.ended) return void out({ type: 'exit', code: t.code });
  t.clients.add(out);
  return () => t.clients.delete(out);
}

function stopAll() {
  if (WIN) return [...terms.values()].filter((t) => !t.ended).map((t) => t.p.pid);
  for (const t of terms.values()) kill(t);
  return [];
}

const claudeOff = (account?: string, am = 1) => [...terms.values()].filter((t) => t.program === 'claude' && !t.ended && t.account && t.account !== account && (t.am || 1) === am).length;

const claudeOn = (account: string) => [...terms.values()].filter((t) => t.program === 'claude' && !t.ended && t.account === account).length;

export { init, ROUTES, follow, stopAll, claudeOff, claudeOn, PROGRAMS, parseOscStatus, watchOut };
