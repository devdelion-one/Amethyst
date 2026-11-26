import { spawn, exec, execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import * as chatlog from './chatlog.ts';
import * as agyStore from '../base/agystore.ts';
import * as copilotStore from '../base/copilotstore.ts';
import { WRITERS } from '../../public/base/writers.ts';
import * as grokStore from '../base/grokstore.ts';
import { configDir, transcriptsDir, memoryFiles, globalFiles, hasProjectClaude, textIndex, firstAsked, search, snippet, claudeTokens } from './transcripts.ts';
import * as live from '../base/live.ts';
import * as points from './checkpoints.ts';
import * as review from './review.ts';
import { handoff, lastSpoke } from './handoff.ts';
import { AGENT_FILES, OUT_MAX } from '../../public/base/util.ts';
import type { Review } from './checkpoints.ts';
import * as tails from './tails.ts';
import * as submodel from './submodel.ts';
import * as subend from './subend.ts';
import * as agysubs from './agysubs.ts';
import * as agysteps from './agysteps.ts';
import { agyQuota, type AgyLimit } from './agyquota.ts';
import * as workflows from './workflows.ts';
import * as subs from './subs.ts';
import { heldText, statusNotice, type Turn } from './statusline.ts';
import { chatUse, shrinkSkip, type Use } from './shrink.ts';
import { subagents, nameOf as subName } from '../../public/chat/subagents.ts';
import { askCard } from '../../public/base/asks.ts';
import { crystalOf } from '../../public/base/codes.ts';
import './cachewarn.ts';
import { placeOf } from '../base/gitcli.ts';
import { makeWorktree, removeWorktree } from '../base/worktrees.ts';
import type { StartFrom } from '../base/worktrees.ts';
import * as accts from '../base/accounts.ts';
import type { Account, Share } from '../base/accounts.ts';
import { memoryFile } from './memoryfiles.ts';
import type { ChildProcess, ChildProcessWithoutNullStreams } from 'child_process';
import type { ChatEvent, ChatPlace, Routes } from '../../public/base/types.ts';
import { firstLine, replaceSync, stamp, TAIL, WIN } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';

interface AgentDef {
  name: string;
  program: string;
  cmd: string;
  args: string[];
  adapter?: string | null;
  probe: string;
  hint: string;
  subs: ((u: any) => any) | 'threads' | null;
}
interface Ev {
  type?: string;
  update?: any;
  at?: number;
  [key: string]: any;
}
interface RpcMsg {
  id?: any;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}
interface Waiter {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  method: string;
}
interface ChatImage {
  path: string;
  mimeType: string;
  data: string;
}
interface Ctx {
  path: string;
  abs: string;
  sel: string;
  lines: number;
}
interface Queued {
  qid: string;
  text: string;
  images: ChatImage[];
  ctx: Ctx | null;
  from?: string | null;
}
interface Wt {
  root: string;
  path: string;
  cwd: string;
  branch: string;
  base: string;
  gone?: boolean;
  [key: string]: any;
}
interface CodexModel {
  model: string;
  displayName?: string;
  description?: string;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: { reasoningEffort: string; description?: string }[];
}
interface Chat {
  id: string;
  agy?: any;
  agySteps?: any;
  own?: { at: number; timer: ReturnType<typeof setTimeout> | null } | null;
  agyQuota?: string;
  limitHit?: string;
  nextId: number;
  waiting: Map<any, Waiter>;
  asks: Map<any, any>;
  events: Ev[];
  state: Map<string, Ev>;
  clients: Set<(ev: Ev) => void>;
  stderr: string;
  busy: boolean;
  queue: Queued[];
  said: string;
  named: boolean;
  mine?: string;
  auto?: string;
  images: Set<string>;
  points: any[];
  saved(): void;
  mode(): string | null;
  words?: string | null;
  review?: Review | null;
  seg?: any;
  agent: string;
  cwd: string;
  sessionId?: string | null;
  meta?: any;
  wt?: Wt | null;
  kept?: boolean;
  quiet?: boolean;
  helper?: boolean;
  asleep?: boolean;
  hydrated?: boolean;
  ended?: boolean;
  spoke?: boolean;
  ahead?: boolean;
  proc?: ChildProcessWithoutNullStreams | null;
  booting?: Promise<void> | null;
  init?: Promise<any> | null;
  inited?: boolean;
  rousing?: boolean;
  woken?: Promise<void> | null;
  replaying?: boolean;
  canList?: boolean;
  canFork?: boolean;
  canSteer?: boolean;
  subs?: ReturnType<typeof subagents>;
  cards?: Map<any, any>;
  agySkip?: boolean;
  agySandbox?: boolean;
  cursorForce?: boolean;
  cursorKey?: string;
  cursorTodos?: Map<string, any>;
  copilotAll?: boolean;
  copilotKey?: string;
  copilotModel?: string;
  copilotEffort?: string;
  copilotEffortRan?: string;
  copilotTurn?: Turn;
  grokMode?: string;
  grokKey?: string;
  sessions?: Record<string, string>;
  carry?: { from: string; since: number } | null;
  codexPlanId?: string;
  codexOut?: Map<string, string>;
  codexMcpCall?: Map<string, string>;
  codexSubs?: subs.CodexSubs;
  codexModels: CodexModel[];
  codexModePresets: { mode: string; name: string }[];
  codexModel?: string;
  codexEffort?: string;
  codexMode?: string;
  turnId?: string | null;
  turnDone?: ((turn: any) => void) | null;
  stopped?: boolean;
  sending?: Queued | null;
  napAfter?: boolean;
  agyKey?: string;
  agyAcc?: string | null;
  agyAt?: number;
  homing?: Promise<void> | null;
  wantWt?: StartFrom | null;
  pointsOff?: boolean;
  forked?: { session: string; key: string | null; copy?: boolean };
  lastAi?: string | null;
  acct?: string | null;
  memory?: Record<string, string> | null;
  shrinking?: { failed: string; said: string; to: any; after?: number } | null;
  peek?: { got: any; said: string } | null;
  ctxSeen?: { context: any; at: number } | null;
  codexUse?: Use & { thread: string };
}
type AgyTokenEntry = { at: number; total: number; input: number; output: number; cached: number; thinking: number };
type AgySeen = { email?: string; tier?: string; tokens?: number; tokenLog?: AgyTokenEntry[] };
type AgyAccount = AgySeen & { id: string; method: string; apiKey?: string; fresh?: boolean };
interface AuthCfg {
  method?: string;
  anthropicApiKey?: string;
  off?: boolean;
  account?: string;
  accounts?: Account[];
  ams?: Record<string, string>;
  antigravity?: { method?: string; apiKey?: string; fresh?: boolean; accounts?: AgyAccount[]; use?: string; own?: AgySeen };
  cursor?: { apiKey?: string };
  copilot?: { token?: string };
  grok?: { apiKey?: string };
  bedrock?: Record<string, string>;
  aws?: Record<string, string>;
  vertex?: Record<string, string>;
  foundry?: Record<string, string>;
}
interface How {
  method: string | null;
  cfg: AuthCfg;
}
interface Limit {
  label: string;
  mins: number;
  pct: number;
  resets: number;
}

const PROTOCOL = 1;
const quoteCommand = (cmd: string) => (/\s/.test(cmd) ? `"${cmd}"` : cmd);
const CODEX_CMD = (() => {
  if (!WIN) return 'codex';
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const installed = path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  return fs.existsSync(installed) ? installed : 'codex';
})();

const AGY_CMD = (() => {
  const installed = path.join(os.homedir(), '.gemini', 'bin', WIN ? 'agy.exe' : 'agy');
  return fs.existsSync(installed) ? installed : 'agy';
})();

const cursorCmd = () => {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const spots = [path.join(os.homedir(), '.local', 'bin', WIN ? 'agent.exe' : 'agent'), ...(WIN ? [path.join(local, 'cursor-agent', 'agent.cmd'), path.join(local, 'cursor-agent', 'agent.exe')] : [])];
  return spots.find((p) => fs.existsSync(p)) || 'agent';
};
const CURSOR_HINT = WIN
  ? "Cursor Agent needs Cursor's CLI on this PC. Install it in PowerShell: irm 'https://cursor.com/install?win32=true' | iex (cursor.com/docs/cli/installation)."
  : "Cursor Agent needs Cursor's CLI on this PC. Install it in a terminal: curl https://cursor.com/install -fsS | bash (cursor.com/docs/cli/installation).";

const copilotCmd = () => {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const spots = WIN ? [path.join(local, 'GitHubCopilotCLI', 'copilot.exe'), path.join(roaming, 'npm', 'copilot.cmd')] : [path.join(os.homedir(), '.local', 'bin', 'copilot')];
  return spots.find((p) => fs.existsSync(p)) || 'copilot';
};
const COPILOT_HINT = WIN
  ? 'Copilot Agent needs GitHub Copilot CLI on this PC. Install it in a terminal: winget install GitHub.Copilot (or npm install -g @github/copilot), see docs.github.com/copilot/how-tos/copilot-cli.'
  : 'Copilot Agent needs GitHub Copilot CLI on this PC. Install it in a terminal: brew install copilot-cli (or npm install -g @github/copilot), see docs.github.com/copilot/how-tos/copilot-cli.';

const grokCmd = () => {
  const roaming = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const spots = WIN
    ? [path.join(os.homedir(), '.grok', 'bin', 'grok.exe'), path.join(roaming, 'npm', 'grok.cmd')]
    : [path.join(os.homedir(), '.grok', 'bin', 'grok'), path.join(os.homedir(), '.local', 'bin', 'grok')];
  return spots.find((p) => fs.existsSync(p)) || 'grok';
};
const GROK_HINT = WIN
  ? 'Grok Agent needs Grok Build CLI on this PC. Install it in PowerShell: irm https://x.ai/cli/install.ps1 | iex (or npm install -g @xai-official/grok), see docs.x.ai/build/overview.'
  : 'Grok Agent needs Grok Build CLI on this PC. Install it in a terminal: curl -fsSL https://x.ai/cli/install.sh | bash (or npm install -g @xai-official/grok), see docs.x.ai/build/overview.';

const ADAPTER = '@agentclientprotocol/claude-agent-acp@0.97.0';
const AGENTS: Record<string, AgentDef> = {
  claude: {
    name: 'Claude Agent', program: 'claude', cmd: 'npx', args: ['-y', ADAPTER], adapter: ADAPTER,
    probe: 'npx --version', hint: 'Claude Agent needs Node.js (with npx) on this PC: nodejs.org.', subs: subs.claudeSub,
  },
  codex: {
    name: 'Codex Agent', program: 'codex', cmd: CODEX_CMD, args: ['app-server', '--listen', 'stdio://'],
    probe: `${quoteCommand(CODEX_CMD)} --version`, hint: 'Codex Agent needs the Codex CLI on this PC: developers.openai.com/codex/cli.', subs: 'threads',
  },
  antigravity: {
    name: 'Antigravity Agent', program: 'antigravity', cmd: AGY_CMD, args: ['acp'],
    probe: `${quoteCommand(AGY_CMD)} --version`, hint: 'Antigravity Agent needs Antigravity CLI 1.5 or newer on this PC: antigravity.google/docs/cli.', subs: null,
  },
  cursor: {
    name: 'Cursor Agent', program: 'cursor', get cmd() { return cursorCmd(); }, args: ['acp'],
    get probe() { return `${quoteCommand(cursorCmd())} --version`; }, hint: CURSOR_HINT, subs: null,
  },
  copilot: {
    name: 'Copilot Agent', program: 'copilot', get cmd() { return copilotCmd(); }, args: ['--acp'],
    get probe() { return `${quoteCommand(copilotCmd())} --version`; }, hint: COPILOT_HINT, subs: null,
  },
  grok: {
    name: 'Grok Agent', program: 'grok', get cmd() { return grokCmd(); }, args: ['agent', '--no-leader', 'stdio'],
    get probe() { return `${quoteCommand(grokCmd())} --version`; }, hint: GROK_HINT, subs: null,
  },
};
const sessionMeta = (c: Chat) => {
  if (c.agent === 'antigravity') return { ...c.meta, antigravity: { ...c.meta?.antigravity, systemPrompt: { ...c.meta?.antigravity?.systemPrompt, append: agysteps.agySystemAppend(c, shellOf(c)) } } };
  if (c.agent === 'cursor') return {};
  if (c.agent === 'copilot') return {};
  if (c.agent === 'grok') return grokMeta(c.grokMode);
  const options = { thinking: { type: 'adaptive', display: 'summarized' }, ...(c.wt && !c.wt.gone ? { projectConfigRoot: c.wt.root } : {}), ...c.meta?.claudeCode?.options };
  if (c.memory) options.settings = { ...c.memory, ...c.meta?.claudeCode?.options?.settings };
  return { ...c.meta, claudeCode: { ...c.meta?.claudeCode, options, emitRawSDKMessages: [{ type: 'assistant' }] } };
};
const home = (c: Chat) => c.wt?.root || c.cwd;
if (process.env.MIND_FAKE_AGENT) Object.assign(AGENTS.claude, { cmd: 'node', args: [process.env.MIND_FAKE_AGENT], adapter: null, probe: 'node --version' });
if (process.env.MIND_FAKE_CODEX) Object.assign(AGENTS.codex, { cmd: process.execPath, args: [process.env.MIND_FAKE_CODEX], probe: 'node --version' });
if (process.env.MIND_FAKE_CURSOR) Object.defineProperties(AGENTS.cursor, { cmd: { value: process.execPath }, args: { value: [process.env.MIND_FAKE_CURSOR, 'acp'] }, probe: { value: 'node --version' } });
if (process.env.MIND_FAKE_COPILOT) Object.defineProperties(AGENTS.copilot, { cmd: { value: process.execPath }, args: { value: [process.env.MIND_FAKE_COPILOT, '--acp'] }, probe: { value: 'node --version' } });
if (process.env.MIND_FAKE_GROK) Object.defineProperties(AGENTS.grok, { cmd: { value: process.execPath }, args: { value: [process.env.MIND_FAKE_GROK, 'agent', '--no-leader', 'stdio'] }, probe: { value: 'node --version' } });
if (process.env.MIND_FAKE_ANTIGRAVITY) Object.assign(AGENTS.antigravity, { cmd: process.execPath, args: [process.env.MIND_FAKE_ANTIGRAVITY, 'acp'], probe: 'node --version' });

const chats = new Map<string, Chat>();
const KEEP = 2 * 60e3;
type Seen = (c: Chat, ev: Ev) => void;
type Mark = (c: Chat, u: any) => any;
const seen: Seen[] = [];
const marks: Mark[] = [];
let shellOf: (c: Chat) => { env: Record<string, string>; bin: string; cli?: { command: string; script: string; env: Record<string, string> } } | null = () => null;
let aliasOf: (from: string, to: string) => void = () => {};
const onEvent = (fn: Seen) => void seen.push(fn);
const onUpdate = (fn: Mark) => void marks.push(fn);
const tellSeen = (c: Chat, ev: Ev) => seen.forEach((fn) => fn(c, ev));
const setShell = (fn: typeof shellOf) => void (shellOf = fn);
const setAlias = (fn: typeof aliasOf) => void (aliasOf = fn);
function withShell(c: Chat, env: NodeJS.ProcessEnv) {
  const s = c.quiet && !spares.some((x) => x.c === c) ? null : shellOf(c);
  if (!s) return env;
  const out = { ...env, ...s.env };
  if (s.bin) {
    const key = Object.keys(out).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    out[key] = s.bin + path.delimiter + (out[key] || '');
  }
  return out;
}
async function mcpFor(c: Chat) {
  if (c.agent !== 'antigravity' || c.helper) return [];
  try {
    return agysteps.mcpServers(shellOf(c), await c.init);
  } catch {
    return [];
  }
}
const HISTORY = 10000;
const KEY = /^sk-ant-[\w-]{20,}$/;

const tooOld = (e: any) => /unknown option/i.test(e.data?.details || '');
const whyOf = (e: any) => (tooOld(e) ? 'Claude Code needs an update: run "claude update" in a terminal, then start a new chat.' : (e.code === -32603 && e.data?.details) || e.message);

let authFile: string | null = null, claudeTermsOff: (id?: string, am?: number) => number = () => 0, claudeTermsOn: (id: string) => number = () => 0;
type Init = { dataDir: string; claudeTerms?: (id?: string, am?: number) => number; claudeTermsOn?: (id: string) => number; archive?: (from: string, label: string) => Promise<unknown>; checkpoints?: string };
function init({ dataDir, claudeTerms, claudeTermsOn: on, archive, checkpoints }: Init) {
  authFile = path.join(dataDir, 'agents.json');
  if (claudeTerms) claudeTermsOff = claudeTerms;
  if (on) claudeTermsOn = on;
  accts.init({ archive, inUse: (am) => accountNow(readAuth(), am) });
  for (const e of chatlog.init(dataDir)) sleeper(e);
  points.init({ ...(checkpoints ? { home: () => checkpoints } : {}), placeOf, nameOf: (id: string) => live.get(id)?.title || null });
  setTimeout(() => points.tidy(new Set(chats.keys())), 5000).unref?.();
  live.setSeen((id?: string) => {
    const c = chats.get(id!);
    if (c?.kept) chatlog.add(id!, null, () => entryNow(c));
  });
}
const METHODS: Record<string, { label: string; login?: string }> = {
  claude: { label: 'Claude Code' },
  console: { label: 'Anthropic Console account', login: '--console' },
  key: { label: 'Anthropic API key' },
  bedrock: { label: 'Amazon Bedrock' },
  aws: { label: 'Claude Platform on AWS' },
  vertex: { label: 'Google Cloud' },
  foundry: { label: 'Microsoft Foundry' },
};
const readAuth = (): AuthCfg => {
  try {
    return JSON.parse(fs.readFileSync(authFile!, 'utf8'));
  } catch {
    return {};
  }
};
function saveAuth(obj: AuthCfg) {
  modelLists.clear();
  replaceSync(authFile!, JSON.stringify(obj), { mode: 0o600 });
}
function writeAuth(patch: AuthCfg) {
  saveAuth({ ...readAuth(), ...patch });
}

const accountsOf = (a = readAuth()): Account[] => [{ id: 'default' }, ...(a.accounts || [])];
const accountNow = (a = readAuth(), am = 1) => accountsOf(a).find((x) => x.id === ((am > 1 && a.ams?.[am]) || a.account)) || accountsOf(a)[0];
function pinAm(am: number) {
  const a = readAuth();
  if (am > 1 && !a.ams?.[am]) writeAuth({ ams: { ...a.ams, [am]: accountNow(a).id } });
}
const amOf = (c: Chat): number => live.get(c.id)?.am || 1;
const accountDirs = () => accountsOf().flatMap((a) => (a.dir ? [a.dir] : []));
const accountEnv = (acc: Account) => (acc.dir ? { CLAUDE_CONFIG_DIR: acc.dir } : {});
const repairs = new Map<string, accts.Ready>();
const runsOn = (id: string) => [...chats.values()].filter((c) => c.acct === id && !c.ended && c.proc && c.proc.exitCode == null).length + claudeTermsOn(id);
function tidy(acc: Account) {
  if (!acc.dir) return null;
  const r = accts.ready(acc, !runsOn(acc.id));
  const was = repairs.get(acc.id);
  if (r.fixed.length || r.kept.length || r.waits.length) repairs.set(acc.id, { fixed: [...new Set([...(was?.fixed || []), ...r.fixed])], kept: [...new Set([...(was?.kept || []), ...r.kept])], waits: r.waits });
  else if (was) repairs.set(acc.id, { ...was, waits: [] });
  return r;
}
const tidyLater = (id: string) => setTimeout(() => {
  const acc = accountsOf().find((x) => x.id === id);
  if (acc && repairs.get(id)?.waits.length) tidy(acc);
}, 1500).unref?.();
const claudeAccount = (am = 1) => {
  pinAm(am);
  const acc = accountNow(readAuth(), am);
  tidy(acc);
  return { id: acc.id, env: accountEnv(acc), settings: (root: string) => accts.memorySetting(acc, root) };
};
const tilde = (p: string) => (p.toLowerCase().startsWith(os.homedir().toLowerCase() + path.sep) ? '~' + p.slice(os.homedir().length).split(path.sep).join('/') : p);
function accountSetup(acc: Account) {
  const r = repairs.get(acc.id);
  return { id: acc.id, dir: acc.dir || configDir(), where: tilde(acc.dir || configDir()), share: accts.shareOf(acc), items: accts.items(acc), fixed: r?.fixed || [], kept: r?.kept || [], waits: r?.waits || [], running: runsOn(acc.id) };
}
const FAKE_CC = process.env.MIND_CLAUDE_CODE;
let claudeCode: { path: string | null; signedIn: boolean; accounts: Partial<Record<string, { signedIn: boolean; email: string; plan: string }>>; at: number } = { path: null, signedIn: false, accounts: {}, at: 0 }, ccReading: Promise<void> | null = null;
const ccRun = (file: string, args: string[], env: NodeJS.ProcessEnv) => new Promise<string>((res) => execFile(FAKE_CC ? process.execPath : file, FAKE_CC ? [FAKE_CC, ...args] : args, { timeout: 15e3, windowsHide: true, env }, (_err, out) => res(String(out || ''))));
function ccProgram(found: string[]) {
  const real = found.find((p) => !WIN || /\.exe$/i.test(p));
  if (real) return real;
  for (const p of found) {
    const pkg = path.join(path.dirname(p), 'node_modules', '@anthropic-ai', 'claude-code');
    const hit = [path.join(pkg, 'bin', 'claude.exe'), path.join(pkg, 'cli.js')].find((x) => fs.existsSync(x));
    if (hit) return hit;
  }
  return null;
}
async function ccLocate() {
  if (FAKE_CC !== undefined) return FAKE_CC || null;
  const out = await new Promise<string>((res) => exec(WIN ? 'where claude' : 'command -v claude', { timeout: 15e3, windowsHide: true }, (_e, o) => res(String(o || ''))));
  const usual = path.join(os.homedir(), '.local', 'bin', WIN ? 'claude.exe' : 'claude');
  return ccProgram([...out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), ...(fs.existsSync(usual) ? [usual] : [])]);
}
function readClaudeCode() {
  return (ccReading ||= (async () => {
    const file = await ccLocate();
    const accounts: typeof claudeCode.accounts = {};
    if (file) {
      await Promise.all(accountsOf().map(async (acc) => {
        tidy(acc);
        let s: any = {};
        try {
          s = JSON.parse(await ccRun(file, ['auth', 'status'], { ...envFor({ method: null, cfg: {} }), ...accountEnv(acc) }));
        } catch {}
        accounts[acc.id] = { signedIn: s.loggedIn === true, email: String(s.email || ''), plan: String(s.subscriptionType || '') };
      }));
    }
    claudeCode = { path: file, signedIn: !!accounts[accountNow().id]?.signedIn, accounts, at: Date.now() };
    ccReading = null;
  })());
}
async function claudeCodeNow() {
  const p = readClaudeCode();
  if (!claudeCode.signedIn) await p;
}

function auth(am = 1) {
  const a = readAuth(), acc = accountNow(a, am).id;
  let method = a.method || (a.anthropicApiKey ? 'key' : null);
  if (!method && process.env.ANTHROPIC_API_KEY) method = 'env';
  if (!method && !a.off) method = 'claude';
  if (method === 'claude' && !claudeCode.accounts[acc]?.signedIn) method = null;
  return { method, cfg: { ...a, account: acc } };
}
const tail = (s: unknown) => (s ? '…' + String(s).slice(-4) : '');
function authInfo(am = 1) {
  const { method, cfg } = auth(am);
  const b = cfg.bedrock || {}, w = cfg.aws || {}, v = cfg.vertex || {}, f = cfg.foundry || {};
  const who: { plan?: string; email?: string } = claudeCode.accounts[accountNow(cfg).id] || {};
  const line = ({
    claude: `your Claude Code sign-in${who.plan || who.email ? ` (${[who.plan && who.plan[0].toUpperCase() + who.plan.slice(1), who.email].filter(Boolean).join(' · ')})` : ''}`,
    console: 'your Anthropic Console account',
    key: `API key ${tail(cfg.anthropicApiKey)}`,
    env: `API key ${tail(process.env.ANTHROPIC_API_KEY)} (from the environment)`,
    bedrock: `Amazon Bedrock · ${b.region || 'your AWS region'}${b.apiKey ? ' · key ' + tail(b.apiKey) : b.profile ? ' · profile ' + b.profile : ''}`,
    aws: `Claude Platform on AWS · ${w.workspaceId || ''}`,
    vertex: `Google Cloud · ${v.project || ''} · ${v.region || 'global'}`,
    foundry: `Microsoft Foundry · ${f.resource || ''}${f.apiKey ? ' · key ' + tail(f.apiKey) : ''}`,
  } as Record<string, string>)[method as string];
  const accounts = accountsOf(cfg).map((x) => ({ id: x.id, signedIn: false, email: '', plan: '', ...claudeCode.accounts[x.id], dir: tilde(x.dir || configDir()), share: accts.shareOf(x), running: runsOn(x.id), repair: repairs.get(x.id) || null }));
  return { method, line: line || null, methods: Object.keys(METHODS), claudeCode: { installed: !!claudeCode.path, signedIn: !!claudeCode.accounts[cfg.account]?.signedIn }, accounts, account: cfg.account };
}

const ROUTING = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_MANTLE', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'AWS_BEARER_TOKEN_BEDROCK', 'ANTHROPIC_AWS_API_KEY', 'ANTHROPIC_AWS_WORKSPACE_ID', 'ANTHROPIC_FOUNDRY_API_KEY', 'ANTHROPIC_FOUNDRY_AUTH_TOKEN', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_VERTEX_PROJECT_ID'];
function envFor({ method, cfg }: How) {
  const env = { ...process.env };
  for (const k of ROUTING) if (!(method === 'env' && k === 'ANTHROPIC_API_KEY')) delete env[k];
  const set = (k: string, v: unknown) => v && (env[k] = String(v));
  if (method === 'key') set('ANTHROPIC_API_KEY', cfg.anthropicApiKey);
  if (method === 'claude') {
    set('CLAUDE_CODE_EXECUTABLE', claudeCode.path);
    const acc = accountNow(cfg);
    tidy(acc);
    Object.assign(env, accountEnv(acc));
  }
  if (method === 'bedrock') {
    const b = cfg.bedrock || {};
    env.CLAUDE_CODE_USE_BEDROCK = '1';
    set('AWS_REGION', b.region);
    set('AWS_PROFILE', b.profile);
    set('AWS_BEARER_TOKEN_BEDROCK', b.apiKey);
  }
  if (method === 'aws') {
    const w = cfg.aws || {};
    env.CLAUDE_CODE_USE_ANTHROPIC_AWS = '1';
    set('ANTHROPIC_AWS_WORKSPACE_ID', w.workspaceId);
    set('AWS_REGION', w.region);
    set('AWS_PROFILE', w.profile);
    set('ANTHROPIC_AWS_API_KEY', w.apiKey);
  }
  if (method === 'vertex') {
    const v = cfg.vertex || {};
    env.CLAUDE_CODE_USE_VERTEX = '1';
    set('ANTHROPIC_VERTEX_PROJECT_ID', v.project);
    env.CLOUD_ML_REGION = v.region || 'global';
  }
  if (method === 'foundry') {
    const f = cfg.foundry || {};
    env.CLAUDE_CODE_USE_FOUNDRY = '1';
    set('ANTHROPIC_FOUNDRY_RESOURCE', f.resource);
    set('ANTHROPIC_FOUNDRY_API_KEY', f.apiKey);
  }
  return env;
}

const text = (v: any, re: RegExp, what: string) => {
  v = String(v ?? '').trim();
  if (v && !re.test(v)) throw new HttpError(400, `That ${what} doesn't look right.`);
  return v || undefined;
};
const need = <T>(v: T, what: string) => {
  if (!v) throw new HttpError(400, `Fill in the ${what}.`);
  return v;
};
const REGION = /^[a-z]{2}(-gov)?-[a-z]+-\d$/;
function settingsFor(method: string, body: any): AuthCfg {
  if (method === 'key') return { anthropicApiKey: need(text(body.apiKey, KEY, 'API key (they start with sk-ant-)'), 'API key') };
  if (method === 'bedrock') return { bedrock: { region: text(body.region, REGION, 'AWS region'), profile: text(body.profile, /^[\w.@-]{1,64}$/, 'AWS profile'), apiKey: text(body.apiKey, /^\S{20,4000}$/, 'Bedrock API key') } };
  if (method === 'aws') return { aws: { workspaceId: need(text(body.workspaceId, /^wrkspc_\w{6,}$/, 'workspace ID'), 'workspace ID'), region: text(body.region, REGION, 'AWS region'), profile: text(body.profile, /^[\w.@-]{1,64}$/, 'AWS profile'), apiKey: text(body.apiKey, KEY, 'workspace API key') } };
  if (method === 'vertex') return { vertex: { project: need(text(body.project, /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/, 'project ID'), 'project ID'), region: text(body.region, /^[a-z0-9-]{2,30}$/, 'region') } };
  if (method === 'foundry') return { foundry: { resource: need(text(body.resource, /^[A-Za-z0-9-]{2,64}$/, 'resource name (the name alone, not a URL)'), 'resource name'), apiKey: text(body.apiKey, /^\S{16,4000}$/, 'Foundry API key') } };
  return {};
}

function openLogin(method: string | null, agent = 'claude') {
  const cmd = ({ codex: `${quoteCommand(AGENTS.codex.cmd)} login`, antigravity: `${quoteCommand(AGY_CMD)} acp --login`, cursor: `${quoteCommand(AGENTS.cursor.cmd)} login`, copilot: `${quoteCommand(AGENTS.copilot.cmd)} login`, grok: `${quoteCommand(AGENTS.grok.cmd)} login` } as Record<string, string>)[agent] || `npx -y ${ADAPTER} --cli auth login ${METHODS[method!]?.login}`;
  return openWindow(`Sign in to ${AGENTS[agent].name}`, cmd);
}
function openWindow(title: string, cmd: string, env: Record<string, string | undefined> = {}) {
  if (process.env.MIND_FAKE_AGENT || process.env.MIND_FAKE_CODEX) return { cmd, opened: false };
  const line = Object.entries(env).map(([k, v]) => `${k}='${v}' `).join('') + cmd;
  try {
    if (WIN) spawn('cmd.exe', ['/c', `start "${title}" cmd /k ${cmd}`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, env: { ...process.env, ...env } }).unref();
    else if (process.platform === 'darwin') spawn('osascript', ['-e', `tell application "Terminal" to do script "${line}"`], { detached: true, stdio: 'ignore' }).unref();
    else spawn('x-terminal-emulator', ['-e', cmd], { detached: true, stdio: 'ignore', env: { ...process.env, ...env } }).unref();
    return { cmd, opened: true };
  } catch {
    return { cmd, opened: false };
  }
}

const signedCache = new Map<string, { at: number; ok: boolean; p: Promise<boolean> }>();
function cachedSignIn(key: string, check: () => Promise<boolean>) {
  const hit = signedCache.get(key), age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < (hit.ok ? 60e3 : 5e3)) return hit.p;
  const p = check().catch(() => false);
  const e = { at: Date.now(), ok: false, p };
  signedCache.set(key, e);
  p.then((v) => (e.ok = v));
  return p;
}
function codexSignedIn() {
  if (process.env.OPENAI_API_KEY || process.env.CODEX_ACCESS_TOKEN) return Promise.resolve(true);
  return cachedSignIn('codex', () => new Promise((resolve) => exec(`${quoteCommand(AGENTS.codex.cmd)} login status`, { timeout: 10e3, windowsHide: true }, (err) => resolve(!err))));
}

let agyWays = [
  { id: 'oauth-personal', name: 'Log in with Google', description: 'Log in with your Google account' },
  { id: 'oauth-business', name: 'Log in with Gemini Enterprise', description: 'Log in with your Gemini Enterprise account' },
  { id: 'gemini-api-key', name: 'Gemini API key', description: 'Use an API key with Gemini Developer API' },
  { id: 'agent-platform', name: 'Gemini Enterprise Agent Platform', description: 'Use Gemini Enterprise Agent Platform (formerly Vertex AI) with Application Default Credentials' },
];
const AGY_KEY = 'gemini-api-key', SKIP = 'skip-permissions', SANDBOX = 'sandbox';
function agyAccounts() {
  const a = readAuth().antigravity || {};
  if (a.accounts) return { accounts: a.accounts, use: a.accounts.some((x) => x.id === a.use) ? a.use : undefined };
  return a.method ? { accounts: [{ id: 'g1', method: a.method, ...(a.apiKey ? { apiKey: a.apiKey } : {}), ...(a.fresh ? { fresh: true } : {}) }], use: 'g1' } : { accounts: [] as AgyAccount[], use: undefined };
}
function saveAgy(accounts: AgyAccount[], use: string | undefined) {
  const a = readAuth(), own = a.antigravity?.own;
  saveAuth({ ...a, antigravity: { accounts, ...(use ? { use } : {}), ...(own ? { own } : {}) } });
}
function agyWay(): { id?: string; method: string | null; apiKey?: string; fresh?: boolean } {
  const { accounts, use } = agyAccounts(), acc = accounts.find((x) => x.id === use);
  return acc ? { id: acc.id, method: acc.method, apiKey: acc.apiKey, fresh: acc.fresh } : { method: process.env.GEMINI_API_KEY ? AGY_KEY : null };
}
function agyNote(id: string | null | undefined, fn: (x: AgySeen) => AgySeen) {
  if (id) {
    const { accounts, use } = agyAccounts(), acc = accounts.find((x) => x.id === id);
    if (acc) saveAgy(accounts.map((x) => (x === acc ? { ...x, ...fn(x) } : x)), use);
    return;
  }
  const a = readAuth(), g = a.antigravity || {};
  saveAuth({ ...a, antigravity: { ...g, own: { ...g.own, ...fn(g.own || {}) } } });
}
const AGY_GOOGLE = new Set(['oauth-personal', 'oauth-business']);
const AGY_LOG = /^acp-server-(\d{4})(\d\d)(\d\d)_(\d\d)(\d\d)(\d\d)-(\d+)\.log$/;
async function agyEmail(c: Chat) {
  const dir = path.join(agyStore.agyHome(), 'log'), from = Math.floor((c.agyAt || 0) / 1e3) * 1e3, pid = c.proc?.pid;
  const logs: { name: string; start: number; mine: boolean }[] = [];
  for (const name of await fs.promises.readdir(dir).catch(() => [] as string[])) {
    const m = AGY_LOG.exec(name), start = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0;
    if (!m || start < from) continue;
    const st = await fs.promises.stat(path.join(dir, name)).catch(() => null);
    if (st && st.mtimeMs >= from) logs.push({ name, start, mine: +m[7] === pid });
  }
  logs.sort((x, y) => +y.mine - +x.mine || x.start - y.start);
  for (const l of logs) {
    const found = [...(await fs.promises.readFile(path.join(dir, l.name), 'utf8').catch(() => '')).matchAll(/applyAuthResult: email=([^,\s]+)/g)];
    if (found.length) return found[found.length - 1][1];
  }
  return null;
}
const AGY_KEEP_MS = 30 * 24 * 3600e3;
function pruneAgyLog(log: AgyTokenEntry[] | undefined, now = Date.now()): AgyTokenEntry[] {
  if (!Array.isArray(log)) return [];
  return log.filter((e) => e && typeof e.at === 'number' && now - e.at <= AGY_KEEP_MS && e.total > 0);
}
function recordAgyUsage(usage: any, at = Date.now()): AgyTokenEntry | null {
  if (!usage || typeof usage !== 'object') return null;
  const input = Number(usage.inputTokens ?? usage.input ?? 0) || 0;
  const output = Number(usage.outputTokens ?? usage.output ?? 0) || 0;
  const cached = (Number(usage.cachedReadTokens ?? usage.cached ?? 0) || 0) + (Number(usage.cachedWriteTokens ?? 0) || 0);
  const thinking = Number(usage.thoughtTokens ?? usage.thinking ?? 0) || 0;
  const total = Number(usage.totalTokens ?? usage.total ?? 0) || input + output + cached + thinking;
  return total > 0 ? { at, total, input, output, cached, thinking } : null;
}
async function agySeen(c: Chat, s: any) {
  const tier = s?._meta?.antigravity?.tier?.name, acc = agyAccounts().accounts.find((x) => x.id === c.agyAcc);
  if (typeof tier === 'string' && tier) agyNote(c.agyAcc, () => ({ tier }));
  if (acc ? !AGY_GOOGLE.has(acc.method) : agyWay().method) return;
  for (const ms of [0, 1e3, 5e3, 30e3]) {
    if (ms) await new Promise((r) => setTimeout(r, ms).unref?.());
    const email = await agyEmail(c);
    if (email) return agyNote(c.agyAcc, (x) => (x.email === email ? {} : { email, ...(x.email ? { tokens: 0, tokenLog: [] } : {}) }));
  }
}
const agyLine = (w: { method: string | null; apiKey?: string }) => (!w.method ? 'your Antigravity CLI sign-in' : w.method === AGY_KEY ? `API key ${tail(w.apiKey || process.env.GEMINI_API_KEY)}${w.apiKey ? '' : ' (from the environment)'}` : agyWays.find((x) => x.id === w.method)?.name || w.method);
function agyInfo() {
  const way = agyWay(), { accounts, use } = agyAccounts(), now = Date.now();
  const seen = (x: AgySeen = {}) => {
    const hasLog = Array.isArray(x.tokenLog);
    const tokenLog = hasLog ? pruneAgyLog(x.tokenLog, now) : undefined;
    const tokens = hasLog ? tokenLog!.reduce((s, e) => s + e.total, 0) : x.tokens || 0;
    return { email: x.email || null, tier: x.tier || null, tokens, ...(hasLog ? { tokenLog } : {}) };
  };
  const list = accounts.map((x) => ({ id: x.id, method: x.method, line: agyLine(x), inUse: x.id === use, ...seen(x) }));
  return { method: way.method, line: agyLine(way), ways: agyWays, accounts: list, use: use || null, ...seen(accounts.find((x) => x.id === use) || readAuth().antigravity?.own) };
}
const agyKeyNow = () => {
  const w = agyWay();
  return `${w.method}|${w.apiKey || ''}`;
};
function agyEnv() {
  const env = { ...process.env }, { method, apiKey } = agyWay();
  if (method !== AGY_KEY) delete env.GEMINI_API_KEY;
  else if (apiKey) env.GEMINI_API_KEY = apiKey;
  return env;
}
function saveAgyWay(method: string | null, apiKey: unknown) {
  if (method && !agyWays.some((w) => w.id === method)) throw new HttpError(400, 'no such way to sign in');
  const { accounts, use } = agyAccounts(), now = accounts.find((x) => x.id === use);
  if (!method) return saveAgy(accounts, undefined), agySwitched();
  const key = method === AGY_KEY ? text(apiKey, /^\S{20,200}$/, 'API key') || (now?.method === AGY_KEY ? now.apiKey : undefined) : undefined;
  if (method === AGY_KEY) need(key || process.env.GEMINI_API_KEY, 'API key');
  let acc = accounts.find((x) => x.method === method && (method !== AGY_KEY || x.apiKey === key));
  if (!acc) {
    let n = 1;
    while (accounts.some((x) => x.id === 'g' + n)) n++;
    acc = { id: 'g' + n, method, ...(key ? { apiKey: key } : {}) };
  }
  const id = acc.id;
  saveAgy([...accounts.filter((x) => x.id !== id), { ...acc, fresh: true }], id);
  return agySwitched();
}
function useAgy(id: string) {
  const { accounts } = agyAccounts(), acc = accounts.find((x) => x.id === id);
  if (!acc) throw new HttpError(404, 'no such account');
  saveAgy(accounts.map((x) => (x.id === id ? { ...x, fresh: true } : x)), id);
  return agySwitched();
}
function forgetAgy(id: string) {
  const { accounts, use } = agyAccounts();
  if (!accounts.some((x) => x.id === id)) throw new HttpError(404, 'no such account');
  saveAgy(accounts.filter((x) => x.id !== id), use === id ? undefined : use);
  return use === id ? agySwitched() : 0;
}
function agySwitched() {
  for (const sp of spares.filter((x) => x.agent === 'antigravity')) spares.splice(spares.indexOf(sp), 1), stop(sp.c, 'not needed');
  let busy = 0;
  for (const c of chats.values()) {
    if (c.agent !== 'antigravity' || c.quiet || !c.kept || c.asleep || c.ended) continue;
    if (c.busy || c.queue.length || c.own) busy += +(c.napAfter = true);
    else if (c.inited && c.sessionId && !c.rousing) {
      c.hydrated = true;
      nap(c);
    }
  }
  return busy;
}
async function agySignIn(c: Chat) {
  const { id, method, fresh } = agyWay();
  if (!method || (!fresh && method !== AGY_KEY)) return;
  await rpc(c, 'authenticate', { methodId: method });
  if (!fresh || !id) return;
  const { accounts, use } = agyAccounts();
  saveAgy(accounts.map((x) => (x.id === id ? { ...x, fresh: undefined } : x)), use);
}
const SANDBOX_OPTION = { value: SANDBOX, name: 'Sandbox', description: 'Runs terminal commands inside a restricted sandbox with workspace access and no network. Fewer approval prompts without skipping all permissions.' };
const SKIP_OPTION = { value: SKIP, name: 'Dangerously skip permissions', description: 'Approves every tool request without asking: file edits, commands, web requests and MCP tools. Your deny rules still apply and protected commands still ask. Use it only where a mistake can be undone.' };
const agyNoModels = (s: any) => Array.isArray(s?.configOptions) && !s.configOptions.find((o: any) => o.id === 'model')?.options?.length;
const agyOptions = (c: Chat, list: any[]) => list?.map((o) => (o.id !== 'mode' ? o : { ...o, options: [...o.options, SANDBOX_OPTION, SKIP_OPTION], ...(c.agySkip ? { currentValue: SKIP } : c.agySandbox ? { currentValue: SANDBOX } : {}) }));
async function setAgyMode(c: Chat, mode: string) {
  if (c.busy) throw new HttpError(409, 'Wait for this turn to end, or stop it, then change this mode.');
  const skip = mode === SKIP, sandbox = mode === SANDBOX;
  const wasSkip = !!c.agySkip, wasSandbox = !!c.agySandbox;
  if (wasSkip !== skip || wasSandbox !== sandbox) {
    c.agySkip = skip;
    c.agySandbox = sandbox;
    c.hydrated = true;
    nap(c);
    try {
      await wake(c).woken;
    } catch (e: any) {
      c.agySkip = wasSkip;
      c.agySandbox = wasSandbox;
      throw e;
    }
    c.saved();
  }
  return skip || sandbox ? null : rpc(c, 'session/set_config_option', { sessionId: c.sessionId, configId: 'mode', value: mode });
}

const cursorSaved = () => readAuth().cursor?.apiKey || '';
const cursorKeyNow = () => cursorSaved() || process.env.CURSOR_API_KEY || '';
function cursorEnv() {
  const env = { ...process.env }, key = cursorSaved();
  if (key) env.CURSOR_API_KEY = key;
  return env;
}
function cursorSignedIn() {
  if (cursorKeyNow()) return Promise.resolve(true);
  const a = AGENTS.cursor, line = [a.cmd, ...a.args.slice(0, -1), 'status', '--format', 'json'].map(quoteCommand).join(' ');
  return cachedSignIn('cursor', () => new Promise<boolean>((res) => exec(line, { timeout: 15e3, windowsHide: true, env: cursorEnv() }, (err, out) => {
    try {
      res(!err && JSON.parse(String(out)).isAuthenticated === true);
    } catch {
      res(false);
    }
  })));
}
async function cursorInfo() {
  const saved = cursorSaved(), key = cursorKeyNow();
  return { signedIn: await cursorSignedIn(), saved: !!saved, line: key ? `API key ${tail(key)}${saved ? '' : ' (from the environment)'}` : 'your Cursor CLI sign-in' };
}
function saveCursorKey(apiKey: unknown) {
  const key = apiKey == null ? undefined : need(text(apiKey, /^\S{20,400}$/, 'API key'), 'API key');
  const { cursor, ...rest } = readAuth();
  saveAuth(key ? { ...rest, cursor: { apiKey: key } } : rest);
  signedCache.delete('cursor');
  for (const sp of spares.filter((x) => x.agent === 'cursor')) spares.splice(spares.indexOf(sp), 1), stop(sp.c, 'not needed');
}
const FORCE = 'force';
const FORCE_TEXT = "Cursor's --yolo (--force): every command and edit runs without asking, unless your Cursor settings deny it. Use it only where a mistake can be undone.";
const cursorOptions = (c: Chat, list: any[]) => list?.map((o) => (o.id !== 'mode' ? o : { ...o, options: [...o.options.filter((x: any) => x.value !== FORCE), { value: FORCE, name: 'Run Everything', description: FORCE_TEXT }], ...(c.cursorForce ? { currentValue: FORCE } : {}) }));
const cursorModes = (c: Chat, m: any) => (Array.isArray(m?.availableModes) ? { ...m, availableModes: [...m.availableModes.filter((x: any) => x.id !== FORCE), { id: FORCE, name: 'Run Everything', description: FORCE_TEXT }], ...(c.cursorForce ? { currentModeId: FORCE } : {}) } : m);
function cursorForce(c: Chat, mode: unknown, config: any) {
  const to = typeof mode === 'string' ? mode : config.value, on = to === FORCE;
  c.cursorForce = on;
  c.saved();
  const go = on ? Promise.resolve(null) : typeof mode === 'string' ? rpc(c, 'session/set_mode', { sessionId: c.sessionId, modeId: mode }) : rpc(c, 'session/set_config_option', { sessionId: c.sessionId, configId: 'mode', value: to });
  return go.then((r) => {
    if (typeof mode === 'string') return emit(c, { type: 'update', update: { sessionUpdate: 'current_mode_update', currentModeId: to } });
    const list = r?.configOptions || setNow(c).configs;
    if (list) emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: cursorOptions(c, list) } });
  });
}
function cursorMessage(c: Chat, m: RpcMsg) {
  const p = m.params || {};
  if (m.method === 'cursor/ask_question') {
    const questions = Array.isArray(p.questions) ? p.questions : [], properties: Record<string, any> = {};
    for (const q of questions) {
      const choices = (q.options || []).map((o: any) => ({ const: o.id, title: o.label }));
      properties[q.id] = q.allowMultiple ? { type: 'array', title: q.prompt, items: { anyOf: choices } } : { type: 'string', title: q.prompt, oneOf: choices };
    }
    const title = p.title || 'Cursor asks';
    c.asks.set(m.id, { cursor: 'question', questions });
    return emit(c, { type: 'ask', ask: m.id, form: { message: title, schema: { type: 'object', properties, required: questions.map((q: any) => q.id) } }, toolCall: { toolCallId: p.toolCallId, title }, options: [] });
  }
  if (m.method === 'cursor/create_plan') {
    const text = [p.name && `## ${p.name}`, p.overview, p.plan].filter(Boolean).join('\n\n');
    if (text) emit(c, { type: 'update', update: { sessionUpdate: 'agent_message_chunk', messageId: `plan-${p.toolCallId}`, content: { type: 'text', text: '\n\n' + text } } });
    if (Array.isArray(p.todos)) cursorTodos(c, p.todos, false);
    c.asks.set(m.id, { cursor: 'plan' });
    return emit(c, { type: 'ask', ask: m.id, toolCall: { toolCallId: p.toolCallId, kind: 'switch_mode', title: p.name ? `Build this plan: ${p.name}` : 'Build this plan' }, options: [{ optionId: 'accepted', name: 'Accept the plan', kind: 'allow_once' }, { optionId: 'rejected', name: 'Reject', kind: 'reject_once' }] });
  }
  if (m.method === 'cursor/update_todos' && Array.isArray(p.todos)) return cursorTodos(c, p.todos, !!p.merge);
  if (m.method === 'cursor/task' && p.toolCallId) {
    const done = p.durationMs != null, type = typeof p.subagentType === 'string' ? p.subagentType : p.subagentType?.custom;
    const sub = { agent: true, name: p.description || undefined, type: type && type !== 'unspecified' ? type : undefined, prompt: p.prompt || undefined, model: p.model || undefined, ...(done ? { end: 'done' } : {}) };
    return emit(c, { type: 'update', update: { sessionUpdate: toolOf(c, p.toolCallId) ? 'tool_call_update' : 'tool_call', toolCallId: p.toolCallId, kind: 'other', title: p.description || 'Sub-agent', status: done ? 'completed' : 'in_progress', rawInput: { description: p.description, prompt: p.prompt }, _meta: { sub } } });
  }
  if (m.id != null) send(c, { id: m.id, error: { code: -32601, message: `${m.method} is not offered by this client` } });
}
function cursorTodos(c: Chat, todos: any[], merge: boolean) {
  const all = merge && c.cursorTodos ? c.cursorTodos : new Map<string, any>();
  for (const t of todos) if (t?.id != null) all.set(String(t.id), t);
  c.cursorTodos = all;
  const entries = [...all.values()].filter((t) => t.status !== 'cancelled').map((t) => ({ content: String(t.content || ''), status: t.status === 'in_progress' || t.status === 'completed' ? t.status : 'pending', priority: 'medium' }));
  emit(c, { type: 'update', update: { sessionUpdate: 'plan', entries } });
}

const copilotSaved = () => readAuth().copilot?.token || '';
const copilotKeyNow = () => copilotSaved() || ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].map((k) => process.env[k]).find(Boolean) || '';
function copilotEnv() {
  const env = { ...process.env }, token = copilotSaved();
  if (token) env.COPILOT_GITHUB_TOKEN = token;
  return env;
}
function copilotInfo() {
  const saved = copilotSaved(), key = copilotKeyNow();
  return { saved: !!saved, line: key ? `token ${tail(key)}${saved ? '' : ' (from the environment)'}` : 'your Copilot CLI sign-in' };
}
function saveCopilotToken(token: unknown) {
  const t = token == null ? undefined : need(text(token, /^\S{20,400}$/, 'token'), 'token');
  if (t && /^ghp_/.test(t)) throw new HttpError(400, "Copilot doesn't take classic tokens (ghp_…): make a fine-grained token with the Copilot Requests permission.");
  const { copilot, ...rest } = readAuth();
  saveAuth(t ? { ...rest, copilot: { token: t } } : rest);
  for (const sp of spares.filter((x) => x.agent === 'copilot')) spares.splice(spares.indexOf(sp), 1), stop(sp.c, 'not needed');
}
const COPILOT_MODE = 'https://agentclientprotocol.com/protocol/session-modes#';
const ALL = 'allow-all';
const ALL_TEXT = "Copilot's --allow-all (--yolo): every tool, file path and web request is approved without asking. Your deny rules still apply. Use it only where a mistake can be undone.";
const COPILOT_MODES = new Set(['default', 'plan', 'autopilot', ALL]);
const copilotId = (v: unknown) => {
  const s = String(v ?? ''), k = s.startsWith(COPILOT_MODE) ? s.slice(COPILOT_MODE.length) : s;
  return k === 'agent' ? 'default' : k;
};
const copilotRaw = (v: string) => COPILOT_MODE + (v === 'default' ? 'agent' : v);
const copilotShown = (c: Chat, mode: unknown) => (c.copilotAll && copilotId(mode) !== 'autopilot' ? ALL : copilotId(mode));
const COPILOT_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const COPILOT_LATER = 'Copilot takes effort only when it starts, so it starts again with this level before your next message. The conversation stays.';
const copilotEffortOption = (c: Chat) => ({ type: 'select', id: 'reasoning_effort', name: 'Reasoning Effort', category: 'thought_level', description: COPILOT_LATER, currentValue: c.copilotEffort || 'default', options: [{ value: 'default', name: 'Default', description: `Copilot's own level. ${COPILOT_LATER}` }, ...COPILOT_EFFORTS.map((v) => ({ value: v, name: v, description: COPILOT_LATER }))], _meta: { amethyst: true } });
const copilotOwnEffort = (c: Chat) => !!setNow(c).configs?.find((o: any) => o.id === 'reasoning_effort')?._meta?.amethyst;
function copilotOptions(c: Chat, list: any[]) {
  if (!Array.isArray(list)) return list;
  const all = list.find((o) => o.id === 'allow_all');
  if (all) c.copilotAll = all.currentValue === 'on';
  const shown = list
    .filter((o) => o.id !== 'allow_all')
    .map((o) => (o.id !== 'mode' ? o : { ...o, options: [...o.options.map((x: any) => ({ ...x, value: copilotId(x.value) })).filter((x: any) => x.value !== ALL), { value: ALL, name: 'Allow all', description: ALL_TEXT }], currentValue: copilotShown(c, o.currentValue) }));
  return shown.some((o) => o.id === 'reasoning_effort') ? shown : [...shown, copilotEffortOption(c)];
}
function copilotEffort(c: Chat, value: unknown) {
  const v = String(value ?? '').trim().toLowerCase();
  if (v !== 'default' && !COPILOT_EFFORTS.includes(v)) throw new HttpError(400, `Copilot's reasoning effort is one of default, ${COPILOT_EFFORTS.join(', ')}.`);
  c.copilotEffort = v === 'default' ? '' : v;
  c.saved();
  const configs = setNow(c).configs || [];
  emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: configs.map((o: any) => (o.id === 'reasoning_effort' ? copilotEffortOption(c) : o)) } });
}
const copilotModes = (c: Chat, m: any) => (Array.isArray(m?.availableModes) ? { ...m, availableModes: [...m.availableModes.map((x: any) => ({ ...x, id: copilotId(x.id) })).filter((x: any) => x.id !== ALL), { id: ALL, name: 'Allow all', description: ALL_TEXT }], currentModeId: copilotShown(c, m.currentModeId) } : m);
const copilotSet = (c: Chat, configId: string, value: string) => rpc(c, 'session/set_config_option', { sessionId: c.sessionId, configId, value });
async function copilotMode(c: Chat, to: string) {
  if (!COPILOT_MODES.has(to)) throw new HttpError(400, 'That Copilot mode is not available.');
  let r: any;
  if (to === ALL) r = await copilotSet(c, 'allow_all', 'on');
  else {
    if (c.copilotAll) r = await copilotSet(c, 'allow_all', 'off');
    r = await copilotSet(c, 'mode', copilotRaw(to));
  }
  c.copilotAll = to === ALL;
  const list = r?.configOptions && copilotOptions(c, r.configOptions);
  if (list) emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: list } });
  emit(c, { type: 'update', update: { sessionUpdate: 'current_mode_update', currentModeId: copilotShown(c, to) } });
}

const grokSaved = () => readAuth().grok?.apiKey || '';
const grokKeyNow = () => grokSaved() || process.env.XAI_API_KEY || '';
function grokEnv() {
  const env = { ...process.env }, key = grokSaved();
  if (key) env.XAI_API_KEY = key;
  return env;
}
function grokInfo() {
  const saved = grokSaved(), key = grokKeyNow();
  return { saved: !!saved, line: key ? `API key ${tail(key)}${saved ? '' : ' (from the environment)'}` : 'your Grok CLI sign-in' };
}
function saveGrokKey(apiKey: unknown) {
  const k = apiKey == null ? undefined : need(text(apiKey, /^\S{10,400}$/, 'API key'), 'API key');
  const { grok, ...rest } = readAuth();
  saveAuth(k ? { ...rest, grok: { apiKey: k } } : rest);
  for (const sp of spares.filter((x) => x.agent === 'grok')) spares.splice(spares.indexOf(sp), 1), stop(sp.c, 'not needed');
}
const GROK_ALWAYS = 'always-approve';
const GROK_ALWAYS_TEXT = "Grok's --always-approve (--yolo): approves every tool call without asking. Your deny rules and hooks still apply. Use it only where a mistake can be undone.";
const GROK_MODES = new Set(['default', 'auto', GROK_ALWAYS]);
const grokMeta = (mode: string | undefined, reloading = false) =>
  mode === GROK_ALWAYS ? { yoloMode: true } : mode === 'auto' ? { autoMode: true } : reloading ? { yoloMode: false } : {};
const grokModeOption = (c: Chat) => ({
  type: 'select',
  id: 'mode',
  name: 'Mode',
  category: 'mode',
  currentValue: c.grokMode || 'default',
  options: [
    { value: 'default', name: 'Ask', description: 'Asks before editing files or running non-read-only commands.' },
    { value: 'auto', name: 'Auto', description: 'Classifier approves safe tool calls and prompts on risky ones.' },
    { value: GROK_ALWAYS, name: 'Always approve', description: GROK_ALWAYS_TEXT },
  ],
});
function grokOptions(c: Chat, list: any[]) {
  const base = Array.isArray(list) ? list : [];
  return base.some((o) => o.id === 'mode') ? base : [...base, grokModeOption(c)];
}
async function grokMode(c: Chat, to: string) {
  if (!GROK_MODES.has(to)) throw new HttpError(400, 'That Grok mode is not available.');
  c.grokMode = to;
  c.saved();
  let r: any = null;
  if (c.sessionId) {
    c.replaying = true;
    try {
      r = await rpc(c, 'session/load', { sessionId: c.sessionId, cwd: c.cwd, mcpServers: await mcpFor(c), _meta: grokMeta(to, true) });
    } finally {
      c.replaying = false;
    }
  }
  const configs = r?.configOptions || setNow(c).configs || [];
  emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: grokOptions(c, configs.filter((o: any) => o.id !== 'mode')) } });
  emit(c, { type: 'update', update: { sessionUpdate: 'current_mode_update', currentModeId: to } });
}
async function copilotAsBefore(c: Chat, s: any, was: ReturnType<typeof setNow>) {
  for (const o of was.configs || []) {
    const now = s?.configOptions?.find((x: any) => x.id === o.id);
    if (!now) continue;
    let steps: [string, string][] = [];
    if (o.id === 'mode') {
      const all = s.configOptions.find((x: any) => x.id === 'allow_all')?.currentValue === 'on', want = String(o.currentValue);
      if (!COPILOT_MODES.has(want)) continue;
      if (want === ALL) steps = all ? [] : [['allow_all', 'on']];
      else steps = [...(all && want !== 'autopilot' ? [['allow_all', 'off'] as [string, string]] : []), ...(copilotId(now.currentValue) !== want ? [['mode', copilotRaw(want)] as [string, string]] : [])];
    } else if (now.currentValue !== o.currentValue) steps = [[o.id, o.currentValue]];
    for (const [id, v] of steps) {
      const r = await copilotSet(c, id, v).catch(() => null);
      if (r?.configOptions) s = { ...s, configOptions: r.configOptions };
    }
  }
  if (c.copilotModel && !s?.configOptions?.some((x: any) => x.id === 'model')) await rpc(c, 'session/set_model', { sessionId: c.sessionId, modelId: c.copilotModel }).catch(() => null);
  return s;
}

const probes = new Map<string, { at: number; p: Promise<string | null>; ok: boolean }>();
function installed(a: AgentDef) {
  const hit = probes.get(a.probe);
  if (hit && (hit.ok || Date.now() - hit.at < 60e3)) return hit.p;
  const p = new Promise<string | null>((res) => exec(a.probe, { timeout: 15e3, windowsHide: true }, (err, out) => res(err ? null : String(out).trim().split('\n')[0])));
  const e = { at: Date.now(), p, ok: false };
  probes.set(a.probe, e);
  p.then((v) => (e.ok = !!v));
  return p;
}

let npmCache: Promise<string | null> | null = null, entryBad = false;
const cacheDir = () =>
  (npmCache ||= new Promise<string | null>((res) =>
    exec('npm config get cache', { timeout: 15e3, windowsHide: true }, (err, out) => {
      const dir = err ? '' : String(out).trim();
      if (!dir) npmCache = null;
      res(dir || null);
    }),
  ));
async function entryOf(a: AgentDef) {
  if (!a.adapter || entryBad) return null;
  const dir = await cacheDir();
  if (!dir) return null;
  const at = a.adapter.lastIndexOf('@'), name = a.adapter.slice(0, at);
  const pkg = path.join(dir, '_npx', crypto.createHash('sha512').update(a.adapter).digest('hex').slice(0, 16), 'node_modules', ...name.split('/'));
  try {
    const p = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
    const bin = typeof p.bin === 'string' ? p.bin : Object.values(p.bin || {})[0];
    const entry = bin && path.join(pkg, bin);
    return p.version === a.adapter.slice(at + 1) && fs.existsSync(entry) ? entry : null;
  } catch {
    return null;
  }
}
function warmUp() {
  for (const a of Object.values(AGENTS)) installed(a);
  readClaudeCode();
  if (AGENTS.claude.adapter) cacheDir();
}

const { lastLine } = live;
function modelOf(configs: any[]) {
  const pick = (cat: string) => {
    const c = (configs || []).find((o) => o.category === cat && o.type === 'select');
    const name = c?.options?.flatMap((o: any) => o.options || o).find((o: any) => o.value === c.currentValue)?.name;
    return name && (cat === 'model' || c.currentValue !== 'default') ? name.replace(/\s*\([^)]*\)/g, '') : '';
  };
  return [pick('model'), pick('thought_level')].filter(Boolean).join(' · ');
}
function report(c: Chat, ev: Ev) {
  const t = ev.type;
  const configs = t === 'status' ? ev.configOptions : ev.update?.sessionUpdate === 'config_option_update' ? ev.update.configOptions : null;
  if (configs) live.set(c.id, { model: modelOf(configs) });
  if (t === 'status') return live.set(c.id, ev.state === 'ready' ? { status: c.busy || c.own ? 'working' : 'idle', line: lastLine(c.said) || 'ready' } : { line: firstLine(ev.text) });
  if (t === 'you') {
    c.said = '';
    unring(c);
    if (!c.named) c.auto = firstLine(ev.text, 80);
    return live.set(c.id, { status: 'working', line: firstLine(ev.text), ...(c.named || c.mine ? {} : { title: c.auto }) });
  }
  if (t === 'update') {
    const u = ev.update || {}, kind = u.sessionUpdate, text = u.content?.type === 'text' ? u.content.text : '';
    if (kind === 'agent_message_chunk' && text) {
      c.said = (c.said + text).slice(-TAIL);
      return live.set(c.id, { line: lastLine(c.said) });
    }
    if (/^tool_call/.test(kind) && (c.subs ||= subagents()).feed(u)) return live.set(c.id, { subs: subsNow(c.subs) });
    if (kind === 'tool_call' && u.title) return live.set(c.id, { line: firstLine(u.title) });
    if (kind === 'compaction_update' && u.status === 'in_progress') return live.set(c.id, { line: 'compacting the chat…' });
    if (kind === 'user_message_chunk' && text && !c.named && !c.auto && !live.get(c.id)?.title) {
      c.auto = firstLine(text, 80);
      return c.mine ? undefined : live.set(c.id, { title: c.auto });
    }
    if (kind === 'session_info_update' && u.title && !c.named) {
      c.named = true;
      c.auto = firstLine(u.title, 80);
      return c.mine ? undefined : live.set(c.id, { title: c.auto });
    }
    return;
  }
  if (t === 'ask') {
    (c.cards ||= new Map()).set(ev.ask, askCard(ev, toolOf(c, ev.toolCall?.toolCallId)));
    live.set(c.id, { status: 'asks', line: firstLine(ev.toolCall?.title) || 'asks to go on', ask: firstCard(c) });
    return ring(c, 'asks', live.get(c.id).line);
  }
  if (t === 'answered') {
    c.cards?.delete(ev.ask);
    if (!c.asks.size) unring(c);
    return live.set(c.id, c.asks.size ? { ask: firstCard(c) } : { status: c.busy || c.own ? 'working' : 'idle', ask: null });
  }
  if (t === 'own') {
    c.said = '';
    unring(c);
    return live.set(c.id, { status: 'working', line: ev.line || 'working on its own' });
  }
  if (t === 'turn') {
    const r = ev.stopReason;
    const wait = c.agent === 'antigravity' && r === 'end_turn' && !ev.own ? agysubs.waiting(c) : '';
    if (wait) return live.set(c.id, { status: 'working', line: wait });
    if (r === 'cancelled') return live.set(c.id, { status: 'idle', line: 'stopped' });
    if (c.asks.size) {
      live.set(c.id, { status: 'asks', line: firstLine(c.asks.values().next().value?.toolCall?.title) || 'asks to go on', ask: firstCard(c) });
      return ring(c, 'asks', live.get(c.id).line);
    }
    const line = r === 'end_turn' ? lastLine(c.said) || 'finished' : r === 'error' ? firstLine(ev.text) || 'something went wrong' : r === 'refusal' ? 'declined to go on' : r.replace(/_/g, ' ');
    live.set(c.id, { status: 'done', line });
    if (r === 'error' || !c.queue.length) ring(c, r === 'error' ? 'error' : 'done', line);
    return;
  }
  if (t === 'shrink') return live.set(c.id, ev.state === 'start' ? { status: 'working', line: `summarizing the chat on ${ev.from || 'the old model'}…` } : { status: 'idle', line: ev.state === 'done' ? `summarized the chat on ${ev.from}, now on ${ev.to}` : ev.state === 'failed' ? `couldn't summarize the chat on ${ev.from}, so ${ev.to} got the whole chat` : `stopped summarizing, so ${ev.to} got the whole chat` });
  if (t === 'end') {
    c.subs?.stopAll();
    c.cards?.clear();
    live.set(c.id, { status: 'ended', line: firstLine(ev.why), ask: null, ...(c.subs ? { subs: subsNow(c.subs) } : {}) });
  }
}
const firstCard = (c: Chat) => c.cards?.values().next().value || null;
const parentPort = () => (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
function ring(c: Chat, why: 'done' | 'error' | 'asks', line: string) {
  const a = live.get(c.id);
  if (!a?.report) return;
  const k = why === 'asks' ? firstCard(c) : null;
  live.set(c.id, { rang: { at: Date.now(), why } });
  const ask = k ? { q: k.form ? String(k.form.message || '') : [k.q, k.what].filter(Boolean).join(' '), options: k.form ? [] : (k.options || []).map((o: { name: string }) => o.name) } : null;
  const text = why === 'done' ? tailOf(String(c.said || '')) : '';
  parentPort()?.postMessage({ report: { id: c.id, code: crystalOf(c.id).code, title: a.title || '', line, text, why, am: a.am || 1, pid: a.pid || '', ask } });
}
function unring(c: Chat) {
  if (live.get(c.id)?.rang) parentPort()?.postMessage({ unring: c.id });
}
function tailOf(said: string, n = 700) {
  const parts = said.trim().split(/\n\s*\n/);
  let out = parts.pop() || '';
  while (parts.length && out.length + parts.at(-1)!.length < n) out = parts.pop() + '\n\n' + out;
  return out.length > n ? '…' + out.slice(-n) : out;
}
function toolOf(c: Chat, id: string) {
  if (!id) return null;
  let tool = null as Record<string, any> | null;
  for (const ev of c.events) {
    const u = ev.type === 'update' && ev.update;
    if (u && /^tool_call/.test(u.sessionUpdate) && u.toolCallId === id) tool = { ...tool, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v != null)) };
  }
  return tool;
}
const subsNow = (m: ReturnType<typeof subagents>) => [...m.all.values()].slice(-20).map((s) => ({ id: s.id, name: subName(s), type: s.type, status: s.status, now: s.steps.at(-1)?.title || '', start: s.start, end: s.end, ...(s.status === 'failed' ? { why: String(s.result || '').replace(/\s+/g, ' ').trim().slice(0, 1000) } : {}) }));

const stateOf = (ev: Ev) => (ev.type === 'status' ? (ev.state === 'ready' ? 'ready' : null) : ev.type === 'worktree' ? 'worktree' : ev.type === 'shrinkMode' ? 'shrinkMode' : /^(available_commands|current_mode|config_option)_update$|^artifacts$/.test(ev.update?.sessionUpdate) ? ev.update.sessionUpdate : null);
function emit(c: Chat, sent: ChatEvent, { pass = false } = {}) {
  const ev: Ev = sent;
  if (ev.type === 'update' && marks.length) ev.update = marks.reduce((u, fn) => fn(c, u), ev.update);
  if (pass) {
    ev.at = Date.now();
    for (const out of c.clients) out(ev);
    return;
  }
  if (!c.quiet) report(c, ev);
  points.see(c, ev);
  ev.at = Date.now();
  if (c.kept) chatlog.add(c.id, ev, /_chunk$/.test(ev.update?.sessionUpdate) ? null : () => entryNow(c));
  const last = c.events.at(-1)!;
  if (chatlog.joins(last, ev)) c.events[c.events.length - 1] = { ...last, update: { ...last.update, content: { ...last.update.content, text: last.update.content.text + ev.update.content.text } } };
  else c.events.push(ev);
  const kind = stateOf(ev);
  if (kind) {
    c.state.delete(kind);
    c.state.set(kind, ev);
  }
  if (c.events.length > HISTORY) c.events.splice(0, c.events.length - HISTORY);
  for (const out of c.clients) out(ev);
  if (ev.type === 'you' && c.agent === 'antigravity') agysteps.clearFeedback(c, (update) => !c.ended && emit(c, { type: 'update', update }));
  if (!c.quiet) tellSeen(c, ev);
}

function send(c: Chat, msg: RpcMsg) {
  if (c.proc?.stdin.writable) c.proc.stdin.write(JSON.stringify(c.agent === 'codex' ? msg : { jsonrpc: '2.0', ...msg }) + '\n');
}
function rpc(c: Chat, method: string, params: any) {
  const id = ++c.nextId;
  send(c, { id, method, params });
  return new Promise<any>((resolve, reject) => c.waiting.set(id, { resolve, reject, method }));
}

const decisionName: Record<string, string> = { accept: 'Allow once', acceptForSession: 'Always allow this session', decline: 'Decline', cancel: 'Cancel' };
function codexTool(item: any, status: string = item.status) {
  if (!item) return null;
  const kinds: Record<string, string> = { commandExecution: 'execute', fileChange: 'edit', mcpToolCall: 'other', dynamicToolCall: 'other', webSearch: 'fetch' };
  const kind = kinds[item.type];
  if (!kind) return null;
  const command = item.command || '';
  const changes = item.changes || [];
  const title = command || changes.map((x: any) => x.path).join(', ') || item.toolName || item.query || item.type;
  const state = ({ inProgress: 'in_progress', completed: 'completed', failed: 'failed', declined: 'failed' } as Record<string, string>)[status] || 'pending';
  const output = item.aggregatedOutput || item.output || '';
  return {
    toolCallId: item.id,
    kind,
    title,
    status: state,
    ...(command ? { rawInput: { command } } : { rawInput: item.arguments || { changes } }),
    ...(output ? { content: [{ type: 'content', content: { type: 'text', text: String(output).slice(0, OUT_MAX) } }] } : {}),
    ...(changes.length ? { locations: changes.map((x: any) => ({ path: x.path })) } : {}),
  };
}
const kidSays = (c: Chat, p: any, text: string) => {
  const k = subs.kidOf(c.codexSubs, p?.threadId);
  return k ? `${k.name}: ${text}` : text;
};
const emitSub = (c: Chat, update: any) => emit(c, { type: 'update', update });
function addAsk(c: Chat, ask: string, ev: any, onAnswer: (optionId: string | null, content?: any) => void) {
  c.asks.set(ask, { ...ev, onAnswer });
  emit(c, { ...ev, type: 'ask', ask });
}
function dropAsk(c: Chat, ask: string) {
  if (!c.asks.delete(ask)) return;
  emit(c, { type: 'answered', ask, optionId: null });
}
const codexEmit = (c: Chat, us: any[]) => us.forEach((update) => emitSub(c, update));
function codexKidMessage(c: Chat, m: RpcMsg) {
  const p = m.params || {}, k = subs.kidOf(c.codexSubs, p.threadId);
  if (!k) return;
  if (m.method === 'item/completed') c.codexOut?.delete(p.item?.id);
  if (m.method === 'item/commandExecution/outputDelta' && p.delta) {
    const runs = (c.codexOut ||= new Map()), data = ((runs.get(p.itemId) || '') + p.delta).slice(-tails.TAIL);
    runs.set(p.itemId, data);
    return emit(c, liveEv(p.itemId, k.id, { data: tails.clean(data) }), { pass: true });
  }
  codexEmit(c, subs.codexKid(c.codexSubs!, m, codexTool));
}
function codexAsk(c: Chat, m: RpcMsg) {
  const p = m.params || {}, isCommand = m.method === 'item/commandExecution/requestApproval';
  const decisionSet = Array.isArray(p.availableDecisions) ? p.availableDecisions : ['accept', 'acceptForSession', 'decline', 'cancel'];
  const options = decisionSet.filter((d: unknown) => typeof d === 'string' && decisionName[d]).map((d: string) => ({ optionId: d, name: decisionName[d], kind: d === 'accept' ? 'allow_once' : undefined }));
  const toolCall = {
    toolCallId: p.itemId,
    kind: isCommand ? 'execute' : 'edit',
    title: kidSays(c, p, isCommand ? p.command || p.reason || 'Run command' : p.reason || 'Apply file changes'),
    ...(isCommand && p.command ? { rawInput: { command: p.command, description: p.reason } } : {}),
  };
  c.asks.set(m.id, { codex: true, method: m.method, toolCall });
  emit(c, { type: 'ask', ask: m.id, toolCall, options });
}
function codexQuestions(c: Chat, m: RpcMsg) {
  const { questions = [], itemId: toolCallId } = m.params || {};
  const properties: Record<string, any> = {};
  for (const q of questions) {
    properties[q.id] = { type: 'string', title: q.header, description: q.question, ...(q.options?.length ? { oneOf: q.options.map((o: any) => ({ const: o.label, title: o.label, description: o.description })) } : {}) };
    if (q.isOther) properties[`${q.id}_custom`] = { type: 'string', title: 'Other' };
  }
  c.asks.set(m.id, { codex: true, questions, toolCall: { toolCallId } });
  emit(c, { type: 'ask', ask: m.id, form: { message: kidSays(c, m.params, 'Codex asks'), schema: { type: 'object', properties, required: questions.map((q: any) => q.id) } }, toolCall: { toolCallId, title: kidSays(c, m.params, 'Codex asks') }, options: [] });
}
const persistName: Record<string, string> = { session: 'Always allow this session' };
function codexElicit(c: Chat, m: RpcMsg) {
  const p = m.params || {}, meta = p._meta || {}, toolCallId = c.codexMcpCall?.get(p.threadId) || `elicit-${m.id}`;
  if (meta.codex_approval_kind === 'mcp_tool_call') {
    const tool = /tool "([^"]+)"/.exec(p.message || '')?.[1];
    const params = meta.tool_params && typeof meta.tool_params === 'object' && Object.keys(meta.tool_params).length ? meta.tool_params : null;
    const toolCall = { toolCallId, kind: 'other', title: kidSays(c, p, tool ? `${p.serverName}: ${tool}${params ? ' ' + JSON.stringify(params).slice(0, 300) : ''}` : p.message || 'Run an MCP tool') };
    const persist = (Array.isArray(meta.persist) ? meta.persist : []).filter((x: unknown) => typeof x === 'string' && persistName[x]);
    const options = [{ optionId: 'accept', name: 'Allow once', kind: 'allow_once' }, ...persist.map((x: string) => ({ optionId: x, name: persistName[x], kind: 'allow_always' })), { optionId: 'decline', name: 'Decline', kind: 'reject_once' }];
    c.asks.set(m.id, { codexElicit: true, toolCall });
    return emit(c, { type: 'ask', ask: m.id, toolCall, options });
  }
  if (p.mode === 'url') {
    const toolCall = { toolCallId, kind: 'fetch', title: kidSays(c, p, `${p.message || `${p.serverName} asks you to open a page`} ${p.url || ''}`.trim()) };
    c.asks.set(m.id, { codexElicit: true, toolCall });
    return emit(c, { type: 'ask', ask: m.id, toolCall, options: [{ optionId: 'accept', name: 'Opened it', kind: 'allow_once' }, { optionId: 'decline', name: 'Decline', kind: 'reject_once' }] });
  }
  const message = kidSays(c, p, p.message || `${p.serverName} asks`);
  c.asks.set(m.id, { codexElicit: true, form: true });
  emit(c, { type: 'ask', ask: m.id, form: { message, schema: p.requestedSchema || { type: 'object', properties: {} } }, toolCall: { toolCallId, title: message }, options: [] });
}
function codexElicitReply(optionId: string | null, content: any) {
  if (content) return { action: 'accept', content, _meta: null };
  if (optionId === 'accept') return { action: 'accept', content: {}, _meta: null };
  if (optionId && persistName[optionId]) return { action: 'accept', content: {}, _meta: { persist: optionId } };
  return { action: optionId === 'decline' ? 'decline' : 'cancel', content: null, _meta: null };
}
function codexPermissions(c: Chat, m: RpcMsg) {
  const p = m.params || {}, want = p.permissions || {}, fs = want.fileSystem || {}, asked: string[] = [];
  if (want.network?.enabled) asked.push('use the network');
  if (fs.read?.length) asked.push(`read ${fs.read.join(', ')}`);
  if (fs.write?.length) asked.push(`write ${fs.write.join(', ')}`);
  if (fs.entries?.length && !fs.read?.length && !fs.write?.length) asked.push(`reach ${fs.entries.length} more path${fs.entries.length === 1 ? '' : 's'}`);
  const granted = Object.fromEntries(Object.entries(want).filter(([, v]) => v != null));
  const toolCall = { toolCallId: p.itemId, kind: 'other', title: kidSays(c, p, `More permissions: ${asked.join('; ') || 'more than the sandbox allows'}`), ...(p.reason ? { rawInput: { description: p.reason } } : {}) };
  c.asks.set(m.id, { codexPermissions: granted, toolCall });
  emit(c, { type: 'ask', ask: m.id, toolCall, options: [{ optionId: 'turn', name: 'Allow for this turn', kind: 'allow_once' }, { optionId: 'session', name: 'Always allow this session', kind: 'allow_always' }, { optionId: 'decline', name: 'Decline', kind: 'reject_once' }] });
}
function codexPlan(c: Chat, id: string, text: string) {
  const first = c.codexPlanId !== id;
  c.codexPlanId = id;
  emit(c, { type: 'update', update: { sessionUpdate: 'agent_message_chunk', messageId: id, content: { type: 'text', text: (first ? '\n\n' : '') + text } } });
}
function codexTurn(c: Chat, id: string) {
  if (!id) return;
  c.turnId = id;
  if (!c.stopped) return;
  c.stopped = false;
  rpc(c, 'turn/interrupt', { threadId: c.sessionId, turnId: id }).catch(() => {});
}
function onCodexMessage(c: Chat, m: RpcMsg) {
  if (m.id != null && !m.method) {
    const w = c.waiting.get(m.id);
    if (!w) return;
    c.waiting.delete(m.id);
    return m.error ? w.reject(Object.assign(new Error(m.error.message || 'Codex app-server error'), { code: m.error.code, data: m.error.data })) : w.resolve(m.result);
  }
  if (m.method === 'item/commandExecution/requestApproval' || m.method === 'item/fileChange/requestApproval') return codexAsk(c, m);
  if (m.method === 'item/tool/requestUserInput') return codexQuestions(c, m);
  if (m.method === 'mcpServer/elicitation/request') return codexElicit(c, m);
  if (m.method === 'item/permissions/requestApproval') return codexPermissions(c, m);
  if (m.id != null) return send(c, { id: m.id, error: { code: -32601, message: `${m.method} is not offered by this client` } });
  const p = m.params || {};
  if (m.method === 'item/started' && p.item?.type === 'mcpToolCall' && typeof p.threadId === 'string') (c.codexMcpCall ||= new Map()).set(p.threadId, p.item.id);
  if (m.method === 'serverRequest/resolved') return void (c.asks.delete(p.requestId) && emit(c, { type: 'answered', ask: p.requestId, optionId: 'accept' }));
  if (typeof p.threadId === 'string' && c.sessionId && p.threadId !== c.sessionId) return codexKidMessage(c, m);
  if (m.method === 'thread/tokenUsage/updated') {
    const n = p.tokenUsage?.last?.inputTokens, thread = String(p.threadId || c.sessionId || '');
    if (typeof n === 'number' && n > 0) c.codexUse = { used: n, base: c.codexUse?.thread === thread ? c.codexUse.base : n, thread };
    return;
  }
  if ((m.method === 'item/started' || m.method === 'item/completed') && p.item) {
    const us = subs.codexMainItem((c.codexSubs ||= subs.codexSubs()), p.item);
    if (us) return codexEmit(c, us);
  }
  if (m.method === 'turn/started') return codexTurn(c, p.turn?.id);
  if (m.method === 'item/agentMessage/delta' && p.delta) return emit(c, { type: 'update', update: { sessionUpdate: 'agent_message_chunk', messageId: p.itemId, content: { type: 'text', text: p.delta } } });
  if (m.method === 'item/plan/delta' && p.delta) return codexPlan(c, p.itemId, p.delta);
  if (m.method === 'item/completed' && p.item?.type === 'plan' && p.item.text && c.codexPlanId !== p.item.id) return codexPlan(c, p.item.id, p.item.text);
  if (m.method === 'item/reasoning/summaryTextDelta' && p.delta) return emit(c, { type: 'update', update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: p.delta } } });
  if (m.method === 'item/started' || m.method === 'item/completed') {
    if (m.method === 'item/completed') c.codexOut?.delete(p.item?.id);
    const u = codexTool(p.item, m.method === 'item/started' ? 'inProgress' : p.item?.status);
    if (u) return emit(c, { type: 'update', update: { sessionUpdate: m.method === 'item/started' ? 'tool_call' : 'tool_call_update', ...u } });
  }
  if (m.method === 'item/commandExecution/outputDelta' && p.delta) {
    const runs = (c.codexOut ||= new Map()), data = ((runs.get(p.itemId) || '') + p.delta).slice(-tails.TAIL);
    runs.set(p.itemId, data);
    return emit(c, liveEv(p.itemId, null, { data: tails.clean(data) }), { pass: true });
  }
  if (m.method === 'turn/plan/updated') return emit(c, { type: 'update', update: { sessionUpdate: 'plan', entries: (p.plan || []).map((x: any) => ({ content: x.step, status: ({ pending: 'pending', inProgress: 'in_progress', completed: 'completed' } as Record<string, string>)[x.status] || 'pending' })) } });
  if (m.method === 'thread/name/updated' && p.name) return emit(c, { type: 'update', update: { sessionUpdate: 'session_info_update', title: p.name } });
  if (m.method === 'turn/completed') {
    const turn = p.turn || {};
    c.turnId = null;
    codexEmit(c, subs.behind(c.codexSubs));
    c.turnDone?.(turn);
  }
}

const CODEX_MODE_TEXT: Record<string, string> = { plan: 'Reads and plans, changes nothing', default: 'Follows your Codex approvals' };
const codexModelNow = (c: Chat) => c.codexModels.find((m) => m.model === c.codexModel);
const codexEfforts = (m: CodexModel | undefined) => (m?.supportedReasoningEfforts || []).map((e) => e.reasoningEffort);
function codexConfigs(c: Chat) {
  const models: Partial<CodexModel>[] = !c.codexModels.length || codexModelNow(c) ? c.codexModels : [...c.codexModels, { model: c.codexModel, displayName: c.codexModel }];
  const efforts = codexModelNow(c)?.supportedReasoningEfforts || [];
  return [
    { id: 'codex:model', name: 'Model', category: 'model', type: 'select', currentValue: c.codexModel, options: models.map((m) => ({ value: m.model, name: m.displayName || m.model, description: m.description })) },
    { id: 'codex:effort', name: 'Effort', category: 'thought_level', type: 'select', currentValue: c.codexEffort, options: efforts.map((e) => ({ value: e.reasoningEffort, name: e.reasoningEffort[0].toUpperCase() + e.reasoningEffort.slice(1), description: e.description })) },
  ].filter((x) => x.options.length);
}
const codexModes = (c: Chat) => (c.codexModePresets.length ? { currentModeId: c.codexMode, availableModes: c.codexModePresets.map((m) => ({ id: m.mode, name: m.name, description: CODEX_MODE_TEXT[m.mode] })) } : null);
const codexConfigEvent = (c: Chat) => emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: codexConfigs(c) } });
function replayCodex(c: Chat, thread: any) {
  const S = subs.codexSubs();
  for (const turn of thread?.turns || []) for (const item of turn.items || []) {
    const us = subs.codexMainItem(S, item);
    if (us) codexEmit(c, us);
    else if (item.type === 'userMessage') {
      for (const part of item.content || []) if (part.type === 'text' && part.text) emit(c, { type: 'update', update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: part.text } } });
    } else if ((item.type === 'agentMessage' || item.type === 'plan') && item.text) emit(c, { type: 'update', update: { sessionUpdate: 'agent_message_chunk', messageId: item.id, content: { type: 'text', text: (item.type === 'plan' ? '\n\n' : '') + item.text } } });
    else if (item.type === 'reasoning' && item.summary?.length) emit(c, { type: 'update', update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: item.summary.map((x: any) => x.text || '').join('') } } });
    else {
      const u = codexTool(item);
      if (u) emit(c, { type: 'update', update: { sessionUpdate: 'tool_call_update', ...u } });
    }
  }
  codexEmit(c, subs.leftover(S));
}

function updateOut(c: Chat, u: any) {
  if (c.peek && /^agent_(message|thought)_chunk$/.test(u?.sessionUpdate)) {
    if (u.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') c.peek.said += u.content.text;
    return;
  }
  const k = c.shrinking && u?.sessionUpdate;
  if (k === 'compaction_update') {
    if (u.status === 'failed') c.shrinking!.failed = String(u.error || 'the compaction failed');
  } else if (k === 'usage_update') {
    if (c.shrinking!.after === undefined && typeof u.used === 'number') c.shrinking!.after = u.used;
  } else if (k === 'agent_message_chunk' || k === 'agent_thought_chunk') {
    if (k === 'agent_message_chunk' && u.content?.type === 'text') c.shrinking!.said += u.content.text;
    return;
  }
  const rl = u?.sessionUpdate === 'usage_update' && u._meta?.['_claude/rateLimit'];
  if (rl && c.acct) rl.account = c.acct;
  const ends = ownSeen(c, u);
  emit(c, { type: 'update', update: c.agent === 'antigravity' && u?.configOptions ? { ...u, configOptions: agyOptions(c, u.configOptions) } : c.agent === 'cursor' && u?.configOptions ? { ...u, configOptions: cursorOptions(c, u.configOptions) } : c.agent === 'cursor' && c.cursorForce && u?.sessionUpdate === 'current_mode_update' ? { ...u, currentModeId: FORCE } : c.agent === 'copilot' && u?.configOptions ? { ...u, configOptions: copilotOptions(c, u.configOptions) } : c.agent === 'copilot' && u?.sessionUpdate === 'current_mode_update' ? { ...u, currentModeId: copilotShown(c, u.currentModeId) } : c.agent === 'grok' && u?.configOptions ? { ...u, configOptions: grokOptions(c, u.configOptions) } : u });
  const out = liveOut(c, u);
  if (ends) ownEnd(c);
  return out;
}

function onMessage(c: Chat, m: RpcMsg) {
  if (c.agent === 'codex') return onCodexMessage(c, m);
  if (m.id != null && !m.method) {
    const w = c.waiting.get(m.id);
    if (!w) return;
    c.waiting.delete(m.id);
    return m.error ? w.reject(Object.assign(new Error(m.error.message || 'agent error'), { code: m.error.code, data: m.error.data })) : w.resolve(m.result);
  }
  if (/claude\/sdkMessage$/.test(m.method || '')) {
    const u = m.params?.message?.context_usage;
    if (u && c.peek) c.peek.got = u;
    return;
  }
  if (m.method === 'session/update') {
    if (c.replaying && !stateOf({ update: m.params?.update })) return;
    const agy = c.agent === 'antigravity', raw = agy ? agysteps.fix(m.params?.update) : m.params?.update;
    const tr = AGENTS[c.agent]?.subs, u0 = typeof tr === 'function' ? tr(chatlog.slim(raw)) : chatlog.slim(raw);
    if (agy && agyQuotaHeld(c, u0)) return;
    if (c.agent === 'claude' && limitHeld(c, u0)) return;
    const put = (update: any) => !c.ended && emit(c, { type: 'update', update });
    const u = agy ? agysteps.see(c, agysubs.map(c, u0, put), put) : u0;
    if (c.agent === 'copilot' && !c.replaying) return statusNotice((c.copilotTurn ||= {}), u).forEach((x) => updateOut(c, x));
    return updateOut(c, u);
  }
  if (m.method === 'session/request_permission') {
    const yes = c.agent === 'cursor' && c.cursorForce && (m.params?.options || []).find((o: any) => o.kind === 'allow_once');
    if (yes) return send(c, { id: m.id, result: { outcome: { outcome: 'selected', optionId: yes.optionId } } });
    c.asks.set(m.id, m.params);
    return emit(c, { type: 'ask', ask: m.id, toolCall: m.params?.toolCall, options: m.params?.options || [] });
  }
  if (m.method === 'elicitation/create' && m.params?.mode === 'form') {
    const { message, requestedSchema: schema, toolCallId } = m.params;
    c.asks.set(m.id, { form: true });
    return emit(c, { type: 'ask', ask: m.id, form: { message, schema }, toolCall: { toolCallId, title: message }, options: [] });
  }
  if (c.agent === 'cursor' && m.method?.startsWith('cursor/')) return cursorMessage(c, m);
  if (m.id != null) send(c, { id: m.id, error: { code: -32601, message: `${m.method} is not offered by this client` } });
}

const AGY_QUIET = 1500, AGY_WAKE = 45000;
const AGY_QUOTA = /^\s*⚠\s*([^\n]*quota[^\n]*?)\s*$/i;
function agyQuotaHeld(c: Chat, u: any) {
  const t = u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text' ? String(u.content.text || '') : '';
  const m = t.match(AGY_QUOTA);
  if (!m) return false;
  const h = m[1].match(/Resets in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/), ms = h ? ((+h[1] || 0) * 3600 + (+h[2] || 0) * 60 + (+h[3] || 0)) * 1000 : 0;
  const when = ms ? new Date(Date.now() + ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  c.agyQuota = `${when ? `Out of quota until ${when}.` : 'Out of quota.'} Antigravity said: ${m[1].replace(/\s*Resets in [\dhms]+\.?$/, '').trim()}`;
  if (!c.busy && !c.ended && !c.replaying) {
    ownStart(c);
    agySettle(c);
  }
  return true;
}
const CLAUDE_LIMIT = /^You['’]ve hit your (?:.{1,40} )?limit · .{1,80}$/;
function limitHeld(c: Chat, u: any) {
  if (u?.sessionUpdate !== 'agent_message_chunk' || u.content?.type !== 'text' || u._meta?.claudeCode?.parentToolUseId || u._meta?.sub) return false;
  const text = String(u.content.text || '').trim();
  if (!CLAUDE_LIMIT.test(text) || c.quiet || c.peek || c.shrinking || c.ended) return false;
  if ([...c.waiting.values()].some((w) => w.method === 'session/load')) {
    emit(c, { type: 'update', update: { sessionUpdate: 'notice', severity: 'error', title: text } });
    return true;
  }
  c.limitHit = text;
  if (!c.busy) {
    ownStart(c);
    ownEnd(c);
  }
  return true;
}
function heldTurn(c: Chat, ev: any) {
  const text = c.agyQuota || c.limitHit;
  if (!text) return ev;
  c.agyQuota = c.limitHit = '';
  return { ...ev, stopReason: 'error', text };
}
const OWN_OUTPUT = /^(agent_message_chunk|agent_thought_chunk|tool_call|tool_call_update|plan)$/;
function ownSeen(c: Chat, u: any) {
  if (c.busy || c.replaying || c.ended || c.quiet || !c.sessionId) return false;
  if (c.agent === 'claude') return claudeOwn(c, u);
  if (c.agent !== 'antigravity') return false;
  const k = u?.sessionUpdate || '';
  if (k === 'usage_update') return void (c.own && agyLater(c, AGY_QUIET));
  if (!OWN_OUTPUT.test(k)) return false;
  ownStart(c);
  agyLater(c, k === 'tool_call_update' && /^(completed|failed)$/.test(u.status || '') ? AGY_WAKE : null);
  return false;
}
function claudeOwn(c: Chat, u: any) {
  const k = u?.sessionUpdate || '';
  if (k === 'usage_update') return !!(c.own && u.cost);
  if (!OWN_OUTPUT.test(k) || u._meta?.claudeCode?.parentToolUseId || u._meta?.sub) return false;
  ownStart(c);
  return false;
}
function ownEnd(c: Chat) {
  const o = c.own;
  if (!o) return;
  ownQuiet(c);
  emit(c, heldTurn(c, { type: 'turn', stopReason: 'end_turn', own: true, since: o.at }));
}
function ownStart(c: Chat, line = '') {
  if (c.own) return;
  c.own = { at: Date.now(), timer: null };
  emit(c, { type: 'own', line: line || 'working on its own' });
}
function agyLater(c: Chat, ms: number | null) {
  const o = c.own;
  if (!o) return;
  clearTimeout(o.timer!);
  o.timer = ms == null ? null : setTimeout(() => agySettle(c), ms);
}
function agySettle(c: Chat) {
  const o = c.own;
  if (!o || c.busy || c.ended) return;
  const wait = c.agyQuota ? '' : agysubs.waiting(c);
  if (wait) {
    clearTimeout(o.timer!);
    o.timer = null;
    return void live.set(c.id, { status: 'working', line: wait });
  }
  ownQuiet(c);
  emit(c, heldTurn(c, { type: 'turn', stopReason: 'end_turn', own: true, since: o.at }));
}
function ownQuiet(c: Chat) {
  if (c.own) clearTimeout(c.own.timer!);
  c.own = null;
}
function agyAfter(c: Chat) {
  if (c.agent !== 'antigravity' || c.ended) return;
  const wait = agysubs.waiting(c);
  if (wait) ownStart(c, wait);
}

const liveEv = (id: string, parent: string | null, liveOutput: Record<string, unknown>): ChatEvent => ({ type: 'update', update: { sessionUpdate: 'tool_call_update', toolCallId: id, _meta: { ...(parent ? { sub: { parent } } : {}), liveOutput } } });
function liveOut(c: Chat, u: any) {
  const id = u?.toolCallId, m = u?._meta;
  if (!id || !m || !/^tool_call/.test(u.sessionUpdate)) return;
  const parent = m.sub?.parent || null;
  if (c.agent === 'claude' && m.claudeCode?.toolName === 'Agent' && u.status === 'completed' && subs.claudeSub(u)._meta?.sub?.bg) subend.watch(c, id, (us) => !c.ended && us.forEach((update) => emit(c, { type: 'update', update })));
  if (c.agent === 'claude' && m.claudeCode?.toolName === 'Agent' && u.status !== 'completed' && u.status !== 'failed') submodel.watch(c, id, (ranOn: string) => !c.ended && emit(c, { type: 'update', update: subs.claudeRan(id, ranOn) }));
  if (c.agent === 'claude' && m.claudeCode?.toolName === 'Workflow') workflows.see(c, u, (us) => us.forEach((update) => emit(c, { type: 'update', update })));
  if (m.terminal_info && !m.terminal_output && !tails.has(c, id)) tails.watch(c, id, (data: string) => emit(c, liveEv(id, parent, { data }), { pass: true }));
  if (m.terminal_output && !tails.named(c, id, m.terminal_output.data)) tails.end(c, id);
  if (m.terminal_exit && tails.isBg(c, id)) setTimeout(() => {
    const r = tails.end(c, id);
    if (r && !c.ended) emit(c, liveEv(id, parent, { data: r.data, exit: r.exit, done: true }));
  }, 800);
  if ((u.status === 'completed' || u.status === 'failed') && !tails.isBg(c, id)) tails.end(c, id);
}

function stop(c: Chat, why: string) {
  if (c.ended) return;
  c.ended = true;
  tails.stopAll(c);
  submodel.stopAll(c);
  subend.stopAll(c).forEach((update) => emit(c, { type: 'update', update }));
  agysubs.stopAll(c);
  agysteps.stopAll(c);
  ownQuiet(c);
  workflows.stopAll(c).forEach((update) => emit(c, { type: 'update', update }));
  for (const w of c.waiting.values()) w.reject(new Error('the agent stopped'));
  c.waiting.clear();
  emit(c, { type: 'end', why });
  c.clients.clear();
  killTree(c.proc);
  setTimeout(() => {
    chats.delete(c.id);
    if (c.kept) chatlog.forget(c.id);
  }, KEEP);
}
function killTree(p: ChildProcess | null | undefined) {
  if (!p || p.exitCode != null) return;
  if (WIN) exec(`taskkill /pid ${p.pid} /T /F`, { windowsHide: true }, () => {});
  else p.kill('SIGTERM');
}

async function boot(c: Chat, a: AgentDef, how: How | null) {
  const entry = await entryOf(a);
  const env = withShell(c, c.agent === 'antigravity' ? agyEnv() : c.agent === 'cursor' ? cursorEnv() : c.agent === 'copilot' ? copilotEnv() : c.agent === 'grok' ? grokEnv() : how ? envFor(how) : { ...process.env });
  if (c.agent === 'antigravity') Object.assign(c, { agyKey: agyKeyNow(), agyAcc: agyWay().id || null, agyAt: Date.now() });
  if (c.agent === 'cursor') c.cursorKey = cursorKeyNow();
  if (c.agent === 'copilot') c.copilotKey = copilotKeyNow();
  if (c.agent === 'grok') c.grokKey = grokKeyNow();
  const acc = c.agent === 'claude' && how?.method === 'claude' ? accountNow(how.cfg) : null;
  c.acct = acc?.id || null;
  c.memory = acc ? accts.memorySetting(acc, home(c)) : null;
  if (c.agent === 'copilot') c.copilotEffortRan = c.copilotEffort || '';
  const args = [...a.args, ...(c.agySkip ? ['--dangerously-skip-permissions'] : []), ...(c.agySandbox ? ['--sandbox'] : []), ...(c.agent === 'copilot' && c.copilotEffort ? ['--reasoning-effort', c.copilotEffort] : [])];
  if (c.ended) throw new HttpError(409, 'the agent stopped');
  if (entry) c.proc = spawn(process.versions.electron ? 'node' : process.execPath, [entry], { cwd: home(c), env, windowsHide: true, stdio: 'pipe' });
  else if (WIN) {
    const line = [a.cmd, ...args].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(' ');
    c.proc = spawn(line, { cwd: home(c), env, shell: true, windowsHide: true, stdio: 'pipe' });
  } else c.proc = spawn(a.cmd, args, { cwd: home(c), env, windowsHide: true, stdio: 'pipe' });
  const proc = c.proc;
  let buf = '';
  c.proc.stdout.setEncoding('utf8');
  c.proc.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0; ) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!l) continue;
      try {
        onMessage(c, JSON.parse(l));
      } catch {}
    }
  });
  c.proc.stderr.setEncoding('utf8');
  c.proc.stderr.on('data', (d) => (c.stderr = (c.stderr + d).slice(-TAIL)));
  c.proc.stdin.on('error', () => {});
  const gone = (why: string) => {
    if (c.proc !== proc) return;
    if (entry && !c.inited && !c.ended) entryBad = true;
    if (c.rousing) nap(c);
    else stop(c, why);
  };
  c.proc.on('error', (e) => gone(e.message));
  c.proc.on('exit', () => c.acct && tidyLater(c.acct));
  c.proc.on('exit', (code) => gone(code ? `the agent exited (${code})${c.stderr ? ': ' + c.stderr.trim().split('\n').pop() : ''}` : 'the agent exited'));
  c.init = rpc(
    c,
    'initialize',
    c.agent === 'codex'
      ? { clientInfo: { name: 'amethyst', title: 'Amethyst', version: '0.1.3' }, capabilities: { experimentalApi: true } }
      : { protocolVersion: PROTOCOL, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, elicitation: { form: {} }, session: { compaction: {}, notices: {} }, _meta: { terminal_output: true } }, clientInfo: { name: 'amethyst', title: 'Amethyst', version: '0.1' } },
  );
  c.init.then(() => (c.inited = true), () => {});
}

async function start(c: Chat, a: AgentDef, how: How | null, resume: string | null | undefined) {
  emit(c, { type: 'status', state: 'starting', text: resume ? 'opening the chat…' : `starting ${a.name}…` });
  try {
    await (c.booting ||= boot(c, a, how));
    const init = await c.init;
    if (c.agent === 'codex') {
      send(c, { method: 'initialized', params: {} });
      let r;
      if (resume) r = await rpc(c, 'thread/resume', { threadId: resume, cwd: c.cwd });
      else r = await rpc(c, 'thread/start', { cwd: c.cwd, ...(c.helper ? { sandbox: 'read-only', approvalPolicy: 'on-request', ephemeral: true } : {}) });
      if (c.helper && r?.sandbox?.type !== 'readOnly') throw new Error('it could not be started read-only.');
      const was = c.rousing && { model: c.codexModel, effort: c.codexEffort, mode: c.codexMode };
      c.sessionId = r?.thread?.id;
      if (!c.sessionId) throw new HttpError(502, 'Codex did not return a thread ID.');
      c.codexModels = [];
      c.codexModePresets = [];
      const [models, modes] = await Promise.all([rpc(c, 'model/list', {}).catch(() => null), rpc(c, 'collaborationMode/list', {}).catch(() => null)]);
      c.codexModels = (models?.data || []).filter((m: CodexModel) => m.model);
      c.codexModePresets = (modes?.data || []).filter((m: { mode: string }) => m.mode);
      c.codexModel = r.model || (c.codexModels.find((m) => m.isDefault) || c.codexModels[0])?.model || '';
      c.codexEffort = r.reasoningEffort || codexModelNow(c)?.defaultReasoningEffort || '';
      c.codexMode = r.collaborationMode?.mode || 'default';
      if (was) {
        if (c.codexModels.some((m) => m.model === was.model)) c.codexModel = was.model;
        c.codexEffort = was.effort || c.codexEffort;
        c.codexMode = was.mode || c.codexMode;
      }
      c.canList = true;
      c.canFork = false;
      live.set(c.id, { session: c.sessionId });
      if (resume && !c.rousing) replayCodex(c, r?.thread);
      emit(c, { type: 'status', state: 'ready', text: 'ready', program: c.agent, agent: { name: a.name }, modes: codexModes(c), configOptions: codexConfigs(c), canList: true, canFork: false, auth: { line: 'your Codex CLI sign-in' } });
      return;
    }
    const agy = c.agent === 'antigravity';
    if (agy) {
      if (init?.authMethods?.length) agyWays = init.authMethods;
      await agySignIn(c);
    }
    if (c.agent === 'cursor') {
      const late = new Promise((_, no) => setTimeout(() => no(new Error("Cursor didn't accept the sign-in: run agent login in a terminal, or check the API key.")), 20e3).unref?.());
      await Promise.race([rpc(c, 'authenticate', { methodId: 'cursor_login' }), late]).catch((e) => Promise.reject(Object.assign(e, { code: -32000 })));
    }
    if (c.agent === 'grok') {
      const methods: { id: string }[] = Array.isArray(init?.authMethods) ? init.authMethods : [];
      const methodId = init?._meta?.defaultAuthMethodId || (grokKeyNow() && methods.some((m) => m.id === 'xai.api_key') ? 'xai.api_key' : null);
      if (!methodId) throw Object.assign(new Error('Not signed in yet.'), { code: -32000 });
      await rpc(c, 'authenticate', { methodId, _meta: { headless: true } }).catch((e) => Promise.reject(Object.assign(e, { code: -32000 })));
    }
    const caps = init?.agentCapabilities || {};
    c.canList = !!caps.sessionCapabilities?.list;
    c.canSteer = !!init?._meta?.steering?.supported;
    const was = c.rousing && setNow(c);
    let s;
    if (resume) {
      c.sessionId = resume;
      c.replaying = !!c.rousing;
      s = await rpc(c, 'session/load', { sessionId: resume, cwd: c.cwd, mcpServers: await mcpFor(c), _meta: sessionMeta(c) }).finally(() => (c.replaying = false));
    } else {
      s = await rpc(c, 'session/new', { cwd: c.cwd, mcpServers: await mcpFor(c), _meta: sessionMeta(c) });
      c.sessionId = s.sessionId;
    }
    if (agy && agyNoModels(s)) throw Object.assign(new Error('Not signed in yet.'), { code: -32000 });
    if (agy) agysteps.begin(c);
    if (agy) agySeen(c, s).catch(() => {});
    if (was) s = await setAsBefore(c, s, was);
    live.set(c.id, { session: c.sessionId });
    const copilot = c.agent === 'copilot', grok = c.agent === 'grok', opts = copilot ? copilotOptions(c, s?.configOptions) : grok ? grokOptions(c, s?.configOptions) : null;
    emit(c, { type: 'status', state: 'ready', text: 'ready', program: c.agent, agent: init?.agentInfo || null, modes: (c.agent === 'cursor' ? cursorModes(c, s?.modes) : copilot ? copilotModes(c, s?.modes) : s?.modes) || null, configOptions: (agy ? agyOptions(c, s?.configOptions) : c.agent === 'cursor' ? cursorOptions(c, s?.configOptions) : copilot || grok ? opts : s?.configOptions) || null, canList: c.canList, canFork: !agy && c.agent !== 'cursor' && !copilot && !grok, canLoad: !!caps.loadSession, auth: agy ? agyInfo() : copilot ? copilotInfo() : grok ? grokInfo() : authInfo(amOf(c)), ahead: !!c.ahead });
  } catch (e: any) {
    if (c.rousing) throw e;
    const signIn = e.code === -32000 || (c.agent === 'codex' && /auth|login|signed out/i.test(e.message));
    if (signIn) signedCache.delete(c.agent);
    emit(c, { type: 'status', state: 'error', text: signIn ? 'Not signed in yet.' : whyOf(e), signIn, update: tooOld(e) });
    stop(c, 'could not start');
  }
}
const newChat = (more: Partial<Chat>) => ({ id: Math.random().toString(36).slice(2, 12), nextId: 0, waiting: new Map(), asks: new Map(), events: [], state: new Map(), clients: new Set(), stderr: '', busy: false, queue: [], said: '', named: false, images: new Set(), points: [], saved() { if (this.kept) chatlog.add(this.id, null, () => entryNow(this)); }, mode() { return modeNow(this as Chat); }, ...more }) as Chat;
function modeNow(c: Chat) {
  if (c.agent === 'codex') return c.codexMode || null;
  if (c.agySkip) return SKIP;
  if (c.agySandbox) return SANDBOX;
  if (c.cursorForce) return FORCE;
  if (c.agent === 'grok' && c.grokMode) return c.grokMode;
  const st = (k: string) => c.state.get(k) as any, cfg = (list: any) => list?.find?.((o: any) => o.id === 'mode')?.currentValue;
  const m = st('current_mode_update')?.update?.currentModeId ?? cfg(st('config_option_update')?.update?.configOptions) ?? st('ready')?.modes?.currentModeId ?? cfg(st('ready')?.configOptions);
  return m ? String(m) : null;
}

function entryNow(c: Chat) {
  const a = live.get(c.id) || {};
  return { id: c.id, session: c.sessionId || null, agent: c.agent, program: a.program, cwd: c.cwd, pid: a.pid, title: a.title, named: c.named, ...(c.mine ? { mine: c.mine } : {}), ...(c.auto ? { auto: c.auto } : {}), model: a.model, line: a.line, status: a.status, at: a.at, started: a.started, am: a.am, spoke: !!c.spoke, images: [...c.images], ...(c.agent === 'codex' ? { codex: { model: c.codexModel, effort: c.codexEffort, mode: c.codexMode } } : {}), ...(c.agySkip ? { agySkip: true } : {}), ...(c.agySandbox ? { agySandbox: true } : {}), ...(c.cursorForce ? { cursorForce: true } : {}), ...(c.copilotModel || c.copilotEffort ? { copilot: { model: c.copilotModel || '', effort: c.copilotEffort || '' } } : {}), ...(c.grokMode ? { grokMode: c.grokMode } : {}), ...(c.sessions && Object.keys(c.sessions).length ? { sessions: c.sessions } : {}), ...(c.carry ? { carry: c.carry } : {}), ...(c.wt ? { wt: c.wt } : {}), ...(c.points?.length ? { points: c.points, lastAi: c.lastAi || null } : {}), ...(c.review && Object.keys(c.review.files).length ? { review: c.review } : {}), ...(a.report ? { report: true } : {}), ...(a.cacheOff ? { cacheOff: true } : {}), ...(a.note ? { note: a.note } : {}) };
}
function sleeper(e: any) {
  if (!AGENTS[e.agent]) return;
  const { model, effort, mode } = e.codex || {};
  chats.set(e.id, newChat({ id: e.id, agent: e.agent, cwd: e.cwd, sessionId: e.session, named: !!e.named, mine: typeof e.mine === 'string' && e.mine ? e.mine : undefined, auto: typeof e.auto === 'string' ? e.auto : e.mine ? undefined : e.title || undefined, spoke: !!e.spoke, images: new Set(e.images || []), asleep: true, kept: true, codexModel: model, codexEffort: effort, codexMode: mode, agySkip: !!e.agySkip, agySandbox: !!e.agySandbox, cursorForce: !!e.cursorForce, copilotModel: e.copilot?.model || undefined, copilotEffort: e.copilot?.effort || undefined, grokMode: typeof e.grokMode === 'string' && GROK_MODES.has(e.grokMode) ? e.grokMode : undefined, sessions: e.sessions && typeof e.sessions === 'object' ? e.sessions : undefined, carry: e.carry?.from ? e.carry : null, wt: e.wt?.root ? e.wt : null, points: Array.isArray(e.points) ? e.points : [], lastAi: e.lastAi || null, review: e.review?.files ? e.review : null }));
  live.set(e.id, { kind: 'chat', program: e.program, cwd: e.wt?.root || e.cwd, pid: e.pid, ...(e.wt?.path && !e.wt.gone ? { wt: e.wt.path, ...(e.wt.branch ? { wtBranch: e.wt.branch } : {}) } : {}), title: e.title || '', model: e.model || '', line: e.line || '', session: e.session, status: e.status === 'done' ? 'done' : 'idle', started: e.started || e.at, am: e.am, ...(e.report ? { report: true } : {}), ...(e.cacheOff ? { cacheOff: true } : {}), ...(e.note ? { note: String(e.note) } : {}) });
  live.get(e.id).at = e.at || Date.now();
}
function hydrate(c: Chat) {
  if (c.hydrated) return;
  c.hydrated = true;
  const { events, changed } = chatlog.tidy(chatlog.read(c.id));
  for (const ev of events) {
    const kind = stateOf(ev);
    if (kind) {
      c.state.delete(kind);
      c.state.set(kind, ev);
    }
  }
  for (const ev of events) if (ev.type === 'update' && ev.update?._meta?.claudeCode && !ev.update._meta.sub) ev.update = subs.claudeSub(ev.update);
  const left = [...workflows.leftover(events), ...subend.leftover(c, events)];
  events.push(...left);
  c.events = events.slice(-HISTORY);
  if (changed || left.length || c.events.length < events.length) chatlog.write(c.id, [...[...c.state.values()].filter((ev) => !c.events.includes(ev)), ...c.events]);
}
function setNow(c: Chat) {
  const evs = [...c.state.values()], last = (f: (e: Ev) => any) => evs.map(f).filter(Boolean).pop();
  return { configs: last((e) => e.configOptions || e.update?.configOptions), mode: last((e) => e.modes?.currentModeId || e.update?.currentModeId) };
}
async function setAsBefore(c: Chat, s: any, was: ReturnType<typeof setNow>) {
  if (c.agent === 'copilot') return copilotAsBefore(c, s, was);
  for (const o of was.configs || []) {
    const now = s?.configOptions?.find((x: any) => x.id === o.id);
    if (!now || now.currentValue === o.currentValue || o.currentValue === SKIP || o.currentValue === SANDBOX || ((c.agySkip || c.agySandbox) && o.id === 'mode')) continue;
    if (o.currentValue === FORCE || (c.cursorForce && o.id === 'mode')) continue;
    const r = await rpc(c, 'session/set_config_option', { sessionId: c.sessionId, configId: o.id, value: o.currentValue }).catch(() => null);
    if (r?.configOptions) s = { ...s, configOptions: r.configOptions };
  }
  if (was.mode && was.mode !== FORCE && s?.modes && s.modes.currentModeId !== was.mode) {
    const r = await rpc(c, 'session/set_mode', { sessionId: c.sessionId, modeId: was.mode }).catch(() => null);
    if (r) s = { ...s, modes: { ...s.modes, currentModeId: was.mode } };
  }
  return s;
}
function wake(c: Chat) {
  if (!c.asleep) return c;
  hydrate(c);
  const spare = spares.length && !c.agySkip && !c.agySandbox && !(c.agent === 'copilot' && c.copilotEffort) ? take(c.agent, c.agent === 'claude' ? auth(amOf(c)) : null) : null;
  if (spare) {
    const wasId = spare.id;
    const { id, cwd, sessionId, events, state, clients, images, named, mine, auto, spoke, wt, sessions, carry, review, points: marks, lastAi, copilotModel, copilotEffort, grokMode, agySteps } = c;
    aliasOf(wasId, id);
    Object.assign(spare, { id, cwd, sessionId, events, state, clients, images, named, mine, auto, spoke, wt, sessions, carry, review, points: marks, lastAi, copilotModel, copilotEffort, grokMode, agySteps, kept: true, hydrated: true });
    chats.set(id, spare);
    c = spare;
  }
  c.asleep = false;
  const chat = c;
  chat.woken = rouse(chat).finally(() => (chat.woken = null));
  chat.woken.catch(() => {});
  return chat;
}
async function canStart(agent: string, am: number) {
  const a = AGENTS[agent];
  if (!a) throw new HttpError(400, 'no such agent');
  if (agent === 'claude' && !claudeCode.at) await readClaudeCode();
  const how = agent === 'claude' ? auth(am) : null;
  if (how && !how.method) throw new HttpError(401, 'Choose how to sign in first.');
  if (!(await installed(a))) throw new HttpError(424, a.hint);
  if (agent === 'codex' && !(await codexSignedIn())) throw new HttpError(401, 'Sign in to Codex first.');
  if (agent === 'cursor' && !(await cursorSignedIn())) throw new HttpError(401, 'Sign in to Cursor first.');
  return { a, how };
}
async function rouse(c: Chat) {
  c.rousing = true;
  try {
    const { a, how } = await canStart(c.agent, amOf(c));
    if (c.wt && !c.wt.gone && !fs.existsSync(c.cwd)) {
      c.cwd = c.wt.root;
      c.wt = { ...c.wt, gone: true };
      live.set(c.id, { wt: null, wtBranch: null });
      emit(c, { type: 'worktree', wt: c.wt });
    }
    want(c.agent);
    await start(c, a, how, c.spoke ? c.sessionId : null);
  } catch (e: any) {
    nap(c);
    throw e;
  } finally {
    c.rousing = false;
  }
}
function nap(c: Chat) {
  const p = c.proc;
  Object.assign(c, { proc: null, booting: null, init: null, inited: false, asleep: true });
  for (const w of c.waiting.values()) w.reject(new Error('the agent stopped'));
  c.waiting.clear();
  killTree(p);
  tails.stopAll(c);
  submodel.stopAll(c);
  subend.stopAll(c).forEach((update) => emit(c, { type: 'update', update }));
  agysubs.stopAll(c);
  agysteps.stopAll(c);
  ownQuiet(c);
  workflows.stopAll(c).forEach((update) => emit(c, { type: 'update', update }));
  live.set(c.id, { status: live.get(c.id)?.status === 'done' ? 'done' : 'idle' });
}

async function intoWorktree(c: Chat, start: StartFrom = {}) {
  const root = c.cwd;
  const step = (s: 'making' | 'starting') => (emit(c, { type: 'wtstep', step: s }, { pass: true }), live.set(c.id, { step: s }));
  step('making');
  let wt;
  try {
    wt = { ...(await makeWorktree(root, c.id, start)), root };
  } catch (e) {
    live.set(c.id, { step: '' });
    throw e;
  }
  step('starting');
  const old = { cwd: c.cwd, sessionId: c.sessionId }, was = setNow(c);
  c.cwd = wt.cwd;
  c.wt = wt;
  try {
    if (c.agent === 'codex') {
      const r = await rpc(c, 'thread/start', { cwd: c.cwd });
      if (!r?.thread?.id) throw new HttpError(502, 'Codex did not return a thread ID.');
      c.sessionId = r.thread.id;
    } else {
      let s = await rpc(c, 'session/new', { cwd: c.cwd, mcpServers: await mcpFor(c), _meta: sessionMeta(c) });
      c.sessionId = s.sessionId;
      if (c.agent === 'antigravity') agysteps.begin(c);
      s = await setAsBefore(c, s, was);
      if (s?.configOptions) emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: c.agent === 'antigravity' ? agyOptions(c, s.configOptions) : c.agent === 'cursor' ? cursorOptions(c, s.configOptions) : c.agent === 'copilot' ? copilotOptions(c, s.configOptions) : c.agent === 'grok' ? grokOptions(c, s.configOptions) : s.configOptions } });
    }
  } catch (e: any) {
    Object.assign(c, old, { wt: null });
    live.set(c.id, { step: '' });
    await removeWorktree(root, wt.path).catch(() => {});
    throw new HttpError(502, `${AGENTS[c.agent].name} couldn't start in the worktree: ${whyOf(e)}`);
  }
  live.set(c.id, { session: c.sessionId, wt: wt.path, wtBranch: wt.branch || null, step: '' });
  emit(c, { type: 'worktree', wt });
}
async function touchedIn(dir: string) {
  const d = path.resolve(dir), low = (p: string) => (WIN ? p.toLowerCase() : p), under = low(d + path.sep);
  const out: { id: string; title: string; working: boolean; files: string[] }[] = [];
  for (const c of chats.values()) {
    if (c.ended) continue;
    const abs = await review.touched(c).catch(() => null);
    const files = (abs || []).filter((p) => low(p).startsWith(under)).map((p) => path.relative(d, p).replace(/\\/g, '/'));
    const mine = !c.wt?.path && (low(path.resolve(c.cwd)) === low(d) || low(path.resolve(c.cwd)).startsWith(under) || under.startsWith(low(path.resolve(c.cwd)) + path.sep));
    if (!files.length && !(mine && c.busy)) continue;
    out.push({ id: c.id, title: (live.get(c.id) as { title?: string } | undefined)?.title || '', working: mine && c.busy, files });
  }
  return out;
}

async function napIn(dir: string) {
  const d = path.resolve(dir), low = (p: string) => (WIN ? p.toLowerCase() : p);
  const inside = (p: string) => !!p && (low(path.resolve(p)) === low(d) || low(path.resolve(p)).startsWith(low(d) + path.sep));
  const waits: Promise<unknown>[] = [];
  for (const c of chats.values()) {
    if (c.ended || c.asleep || !inside(c.cwd)) continue;
    const p = c.proc;
    if (p && p.exitCode == null) waits.push(new Promise((ok) => (p.once('exit', ok), setTimeout(ok, 5000))));
    c.hydrated = true;
    nap(c);
  }
  await Promise.all(waits);
}

const SPARES = 1, IDLE = 15 * 60e3;
const spares: { c: Chat; agent: string; key: string; at: number }[] = [];
const wanted = new Set<string>(['claude']);
let idle: NodeJS.Timeout | null = null, filling = false;
const stalled = new Set<string>();
const keyOf = (how: How) => JSON.stringify({ ...how, cfg: { ...how.cfg, ams: undefined } });
const spareKey = (agent: string, how: How | null) => (agent === 'claude' ? (how?.method ? keyOf(how) : null) : agent === 'codex' ? 'codex' : agent === 'antigravity' ? 'agy:' + JSON.stringify(agyWay()) : agent === 'cursor' ? 'cursor:' + cursorKeyNow() : agent === 'copilot' ? 'copilot:' + copilotKeyNow() : agent === 'grok' ? 'grok:' + grokKeyNow() : null);
function want(agent?: string) {
  if (agent && spareKey(agent, agent === 'claude' ? auth() : null)) wanted.add(agent);
  clearTimeout(idle!);
  idle = setTimeout(() => ((idle = null), clearSpares()), IDLE);
  idle!.unref();
  stalled.clear();
  fill();
}
async function fill() {
  if (filling || !idle) return;
  const agent = [...wanted].find((x) => !stalled.has(x) && spares.filter((s) => s.agent === x).length < SPARES);
  if (!agent) return;
  const a = AGENTS[agent], how = agent === 'claude' ? auth() : null, key = spareKey(agent, how);
  if (!key) return void (stalled.add(agent), fill());
  filling = true;
  try {
    if (!(await installed(a))) return void stalled.add(agent);
    const s = { c: newChat({ agent, quiet: true, cwd: os.tmpdir() }), agent, key, at: Date.now() };
    spares.push(s);
    s.c.clients.add((ev) => {
      if (ev.type !== 'end' || !spares.includes(s)) return;
      spares.splice(spares.indexOf(s), 1);
      if (Date.now() - s.at < 10e3) stalled.add(agent);
      else fill();
    });
    s.c.booting = boot(s.c, a, how);
    await s.c.booting.then(() => s.c.init).catch(() => {});
  } finally {
    filling = false;
  }
  fill();
}
function take(agent: string, how: How | null) {
  const key = spareKey(agent, how);
  if (!key || (agent === 'claude' && key !== keyOf(auth()))) return null;
  for (const s of spares.filter((x) => x.agent === agent)) {
    spares.splice(spares.indexOf(s), 1);
    if (s.key === key && !s.c.ended) {
      s.c.clients.clear();
      s.c.quiet = false;
      s.c.ahead = true;
      return s.c;
    }
    stop(s.c, 'not needed');
  }
  return null;
}
function clearSpares() {
  for (const s of spares.splice(0)) stop(s.c, 'not needed');
}
const awake = (c: Chat) => c.agent === 'claude' && !c.quiet && c.kept && !c.asleep && !c.ended;
const answering = (c: Chat) => awake(c) && (c.busy || c.queue.length);
function switched(am = 1) {
  if (am === 1) {
    clearSpares();
    fill();
  }
  if (auth(am).method !== 'claude') return 0;
  let busy = 0;
  for (const c of chats.values()) if (amOf(c) === am) busy += moveOver(c);
  return busy;
}
function moveOver(c: Chat) {
  if (!awake(c)) return 0;
  if (answering(c)) return (c.napAfter = true), 1;
  if (c.inited && c.sessionId && !c.rousing) {
    c.hydrated = true;
    nap(c);
  }
  return 0;
}
function setShare(id: string, share: string | null, am: number) {
  const a = readAuth(), acc = (a.accounts || []).find((x) => x.id === id);
  if (!acc) throw new HttpError(id === 'default' ? 400 : 404, id === 'default' ? 'The main account is the main setup; pick an added account.' : 'no such account');
  if (share != null && share !== 'all' && share !== 'own') throw new HttpError(400, 'share: all or own');
  let busy = 0;
  const done: accts.Ready = { fixed: [], kept: [], waits: [] };
  const next = { ...acc, ...(share ? { share: share as Share } : {}) };
  if (share && accts.shareOf(acc) !== share) {
    writeAuth({ accounts: (a.accounts || []).map((x) => (x.id === id ? next : x)) });
    if (share === 'own') accts.memoryOut(next);
    else accts.memoryBack(next, done);
    for (const c of chats.values()) if (c.acct === id) busy += moveOver(c);
  }
  const r = tidy(next);
  if (r) for (const k of ['fixed', 'kept', 'waits'] as const) done[k].push(...r[k]);
  if (done.waits.length) tidyLater(id);
  return { ...authInfo(am), busy, terms: claudeTermsOn(id), done, setup: accountSetup(next) };
}
function placeIn(p: any, go: boolean, from: number): ChatPlace {
  const name = (v: unknown) => (typeof v === 'string' && v.length <= 60 && /^[\w+-]*$/.test(v) ? v : null);
  const o = p && typeof p === 'object' ? p : {}, set = 'set' in o ? name(o.set) : null, ed = 'ed' in o ? name(o.ed) : null, near = 'near' in o ? name(o.near) : null;
  if (o.orch === true) return { orch: true, go, from, at: Date.now() };
  if (set == null && ed == null && near == null) throw new HttpError(400, 'place: { set }, { ed } or { orch: true }, an id or + for a new one');
  return { ...(set != null ? { set } : ed != null ? { ed } : {}), ...(near ? { near } : {}), go, from, at: Date.now() };
}
function giveTo(c: Chat, am = 1) {
  const was = accountNow(readAuth(), amOf(c)).id;
  live.set(c.id, { am });
  if (c.kept) chatlog.add(c.id, null, () => entryNow(c));
  if (c.agent === 'claude' && accountNow(readAuth(), am).id !== was) moveOver(c);
}

const IMAGE_DIR = '.amethyst/images';
const IMAGE_EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
const MIME_OF: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const MAX_IMAGE = 5 * 1024 * 1024, MAX_IMAGES = 6, MAX_ALL = 12 * 1024 * 1024;
function storeImage(cwd: string, im: any): ChatImage {
  const ext = IMAGE_EXT[im?.mimeType];
  if (!ext || typeof im.data !== 'string') throw new HttpError(400, 'images: png, jpeg, gif or webp only');
  const buf = Buffer.from(im.data, 'base64');
  if (buf.length > MAX_IMAGE) throw new HttpError(413, 'an image is bigger than 5 MB');
  const dir = path.join(cwd, IMAGE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const base = String(im.name || '').replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'paste-' + stamp();
  let name = base + ext;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${ext}`;
  fs.writeFileSync(path.join(dir, name), buf, { flag: 'wx' });
  return { path: IMAGE_DIR + '/' + name, mimeType: im.mimeType, data: im.data };
}
const IMAGE_REL = /^\.amethyst\/images\/[\w\- ]+\.(png|jpe?g|gif|webp)$/i;
function saveImages(c: Chat, images: any): ChatImage[] {
  if (!Array.isArray(images) || !images.length) return [];
  if (images.length > MAX_IMAGES) throw new HttpError(400, `at most ${MAX_IMAGES} images a message`);
  const out: ChatImage[] = [];
  for (const im of images) {
    const file = typeof im?.path === 'string' && IMAGE_REL.test(im.path) ? path.join(home(c), im.path) : null;
    if (file && fs.existsSync(file)) out.push({ path: im.path, mimeType: MIME_OF[path.extname(file).toLowerCase()], data: fs.readFileSync(file).toString('base64') });
    else if (typeof im?.data === 'string') out.push(storeImage(home(c), im));
  }
  if (out.reduce((n, r) => n + (r.data.length * 3) / 4, 0) > MAX_ALL) throw new HttpError(413, 'these images are more than 12 MB together');
  for (const r of out) c.images.add(r.path);
  return out;
}
function unuseImage(cwd: string, rel: string) {
  const from = path.join(cwd, rel), dir = path.join(cwd, IMAGE_DIR, 'unused');
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(rel), base = path.basename(rel, ext);
  let name = base + ext;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${ext}`;
  fs.renameSync(from, path.join(dir, name));
}
function dropImages(c: Chat) {
  if (!c.images?.size || !c.cwd) return;
  const kept = new Set<string>();
  for (const other of chats.values()) if (other !== c && home(other) === home(c)) for (const p of other.images) kept.add(p);
  for (const rel of c.images) {
    if (kept.has(rel)) continue;
    try { unuseImage(home(c), rel); } catch {}
  }
  c.images.clear();
}
function contextOf(c: Chat, ctx: any): Ctx | null {
  if (!ctx || typeof ctx.path !== 'string') return null;
  const p = path.resolve(c.cwd, ctx.path);
  if (!p.toLowerCase().startsWith(path.resolve(c.cwd).toLowerCase() + path.sep) || !fs.existsSync(p)) return null;
  const sel = typeof ctx.sel === 'string' && ctx.sel.trim() ? ctx.sel.slice(0, 50000) : '';
  return { path: ctx.path.replace(/\\/g, '/'), abs: p, sel, lines: sel ? sel.split('\n').length : 0 };
}
const NAMES = Object.fromEntries(Object.entries(AGENTS).map(([k, a]) => [k, a.name]));
const rulesFiles = (agent: string) => {
  const main = AGENT_FILES[agent]?.find((f) => !f.endsWith('/'));
  if (!main) return [];
  return agent === 'claude' ? [main, `.claude/${main}`] : [main];
};
function rulesFor(c: Chat, from: string, to: string) {
  const mine = rulesFiles(from), yours = rulesFiles(to);
  if (!mine.length || !yours.length || mine[0] === yours[0]) return null;
  const has = (f: string) => [home(c), c.cwd].some((d) => fs.existsSync(path.join(d, f)));
  if (yours.some(has)) return null;
  return mine.find(has) || null;
}
function handoffOf(c: Chat, to: string, o: { from?: string; since?: number; before?: number; all?: boolean; write?: boolean } = {}) {
  const from = o.from || c.agent;
  const since = o.since ?? lastSpoke(c.events, to, c.agent);
  const events = o.before ? c.events.filter((e) => (e.at || 0) < o.before!) : c.events;
  const k = events.filter((e) => e.type === 'switch').length;
  const file = path.join('.amethyst', 'handoffs', `${c.id}-${k}.md`);
  const made = handoff(events, { from, to, since: o.all ? 0 : since, cwd: c.cwd, wt: c.wt && !c.wt.gone ? c.wt : null, files: Object.keys(c.review?.files || {}), rules: rulesFor(c, from, to), saved: o.all ? null : path.join(home(c), file), budget: o.all ? Infinity : undefined, names: NAMES });
  if (o.write) {
    try {
      const at = path.join(home(c), file);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, made.full + '\n');
    } catch {}
  }
  return { ...made, from, since, k };
}
function eventsBefore(events: Ev[], key: string | null) {
  if (!key) return [];
  const last = events.findLastIndex((e) => e.update?.messageId === key);
  if (last < 0) return [];
  const next = events.findIndex((e, i) => i > last && e.type === 'you');
  const kept = (e: Ev) => e.type === 'you' || e.type === 'turn' || e.type === 'switch' || (e.type === 'update' && !stateOf(e) && e.update?.sessionUpdate !== 'usage_update');
  return events.slice(0, next < 0 ? events.length : next).filter(kept).map((e) => ({ ...e }));
}
function blocksOf(c: Chat, { text, images, ctx }: Queued, carried?: string | null) {
  const link = (rel: string, at = c.cwd) => ({ type: 'resource_link', uri: pathToFileURL(path.join(at, rel)).href, name: rel });
  const out: any[] = text ? [{ type: 'text', text: text.replace(/^\/clear(?=\s|$)/, ' $&') }] : [];
  if (carried) out[text.startsWith('/') ? 'push' : 'unshift']({ type: 'text', text: carried });
  for (const im of images) out.push({ type: 'image', data: im.data, mimeType: im.mimeType }, link(im.path, home(c)));
  if (ctx) out.push(ctx.sel ? { type: 'resource', resource: { uri: pathToFileURL(ctx.abs).href, mimeType: 'text/plain', text: ctx.sel } } : link(ctx.path));
  return out;
}

async function prompt(c: Chat, msg: Queued) {
  c.busy = true;
  ownQuiet(c);
  const spoke = c.spoke;
  c.spoke = true;
  const carry = c.carry, carried = carry ? handoffOf(c, c.agent, { from: carry.from, since: carry.since, write: true }) : null;
  emit(c, { type: 'you', text: msg.text, qid: msg.qid, images: msg.images.map((i) => ({ path: i.path })), ctx: msg.ctx && { path: msg.ctx.path, lines: msg.ctx.lines }, ...(msg.from ? { from: msg.from } : {}), ...(carried ? { handoff: { from: carried.from, to: c.agent, since: carried.since, turns: carried.turns } } : {}) });
  let failed = false;
  c.sending = msg;
  try {
    await c.woken;
    const want = c.wantWt;
    c.wantWt = null;
    if (want && !c.wt && !c.stopped) {
      const h: Promise<void> = (c.homing = intoWorktree(c, want).finally(() => c.homing === h && (c.homing = null)));
      try {
        await h;
      } catch (e) {
        emit(c, { type: 'worktree', wt: null });
        throw e;
      }
    }
    if (((c.agent === 'antigravity' && c.agyKey && c.agyKey !== agyKeyNow()) || (c.agent === 'cursor' && c.cursorKey != null && c.cursorKey !== cursorKeyNow()) || (c.agent === 'copilot' && ((c.copilotKey != null && c.copilotKey !== copilotKeyNow()) || (c.copilotEffortRan != null && c.copilotEffortRan !== (c.copilotEffort || '')))) || (c.agent === 'grok' && c.grokKey != null && c.grokKey !== grokKeyNow())) && !c.ended) {
      c.hydrated = true;
      nap(c);
      c.asleep = false;
      if (!spoke) c.spoke = false;
      const w: Promise<void> = (c.woken = rouse(c).finally(() => {
        c.spoke = true;
        if (c.woken === w) c.woken = null;
      }));
      await w;
    }
    c.sending = null;
    if (c.stopped) {
      emit(c, { type: 'unsent', qid: msg.qid, text: msg.text, images: msg.images.map((i) => ({ path: i.path })) });
      emit(c, { type: 'turn', stopReason: 'cancelled' });
    }
    else if (c.agent === 'codex') {
      points.busy(c, true);
      const context = msg.ctx ? `\n\nCurrent file: ${msg.ctx.path}${msg.ctx.sel ? `\nSelected text:\n${msg.ctx.sel}` : ''}` : '';
      const input: any[] = [];
      if (msg.text || context || carried) input.push({ type: 'text', text: (carried ? carried.text + '\n\n' : '') + (msg.text || '') + context });
      for (const im of msg.images) input.push({ type: 'localImage', path: path.resolve(home(c), im.path) });
      const done = new Promise<any>((resolve) => (c.turnDone = resolve));
      const mode = c.codexModePresets.find((m) => m.mode === c.codexMode);
      const params: any = { threadId: c.sessionId, input };
      if (c.codexModel) params.model = c.codexModel;
      if (c.codexEffort) params.effort = c.codexEffort;
      if (mode && c.codexModel) params.collaborationMode = { mode: mode.mode, settings: { model: c.codexModel, reasoning_effort: c.codexEffort || null, developer_instructions: null } };
      const started = rpc(c, 'turn/start', params);
      if (carried) {
        c.carry = null;
        c.saved();
      }
      const r = await started;
      if (r?.turn?.status && r.turn.status !== 'inProgress') c.turnDone?.(r.turn);
      else codexTurn(c, r?.turn?.id);
      const turn = await done;
      c.turnDone = null;
      c.turnId = null;
      const stopReason = turn?.status === 'interrupted' ? 'cancelled' : turn?.status === 'failed' ? 'error' : 'end_turn';
      emit(c, { type: 'turn', stopReason, ...(turn?.error?.message ? { text: turn.error.message } : {}) });
    } else {
      points.busy(c, true);
      c.words = msg.text.replace(/\s+/g, ' ').trim().slice(0, 160) || null;
      await points.begin(c);
      c.copilotTurn = {};
      const sent = rpc(c, 'session/prompt', { sessionId: c.sessionId, prompt: blocksOf(c, msg, carried?.text) });
      if (carried) {
        c.carry = null;
        c.saved();
      }
      const r = await sent;
      if (c.agent === 'antigravity') {
        const entry = recordAgyUsage(r?.usage);
        if (entry) agyNote(c.agyAcc, (x) => ({ tokens: (x.tokens || 0) + entry.total, tokenLog: [...pruneAgyLog(x.tokenLog, entry.at), entry] }));
      }
      heldText(c.copilotTurn).forEach((x) => updateOut(c, x));
      points.busy(c, false);
      await points.end(c);
      emit(c, heldTurn(c, { type: 'turn', stopReason: r?.stopReason || 'end_turn' }));
    }
  } catch (e: any) {
    failed = true;
    const signIn = e.code === -32000 || (c.agent === 'codex' && /auth|login|signed out/i.test(e.message));
    if (signIn && carry && !c.carry) c.carry = carry;
    heldText(c.copilotTurn).forEach((x) => updateOut(c, x));
    emit(c, { type: 'turn', stopReason: 'error', text: signIn ? 'Signed out: sign in again to go on.' : c.limitHit || whyOf(e), signIn });
    c.limitHit = '';
  } finally {
    c.busy = false;
    c.sending = null;
    c.stopped = false;
    points.busy(c, false);
    points.end(c);
  }
  if (failed) unqueue(c, null, true);
  if (!c.ended && !c.queue.length) agyAfter(c);
  const next = !c.ended && c.queue.shift();
  if (next) prompt(c, next).catch(() => {});
  else if (c.napAfter && !c.ended) {
    c.napAfter = false;
    c.hydrated = true;
    nap(c);
  }
}
async function sendNow(c: Chat, qid: string) {
  const msg = c.queue.find((m) => m.qid === qid);
  if (!msg) return;
  if (!c.canSteer) throw new HttpError(400, 'This agent cannot take a message while it answers.');
  c.queue = c.queue.filter((m) => m !== msg);
  try {
    await points.cut(c);
    const r = await rpc(c, '_session/steering', { sessionId: c.sessionId, prompt: blocksOf(c, msg), _meta: { steering: { idleBehavior: 'promptRequired' } } });
    if (r?.outcome === 'injected') emit(c, { type: 'you', text: msg.text, qid: msg.qid, images: msg.images.map((i) => ({ path: i.path })), ctx: msg.ctx && { path: msg.ctx.path, lines: msg.ctx.lines }, ...(msg.from ? { from: msg.from } : {}) });
    else if (c.busy) c.queue.unshift(msg);
    else prompt(c, msg).catch(() => {});
  } catch (e: any) {
    c.queue.unshift(msg);
    throw e;
  }
}
function unqueue(c: Chat, qid: string | null, back = false) {
  const gone = c.queue.filter((m) => qid == null || m.qid === qid);
  if (!gone.length) return;
  c.queue = c.queue.filter((m) => !gone.includes(m));
  emit(c, { type: 'unqueued', qids: gone.map((m) => m.qid), back });
}

function answer(c: Chat, ask: any, optionId: string | null, content?: any) {
  if (!c.asks.has(ask)) throw new HttpError(404, 'that question was already answered');
  const request = c.asks.get(ask);
  c.asks.delete(ask);
  if (request?.onAnswer) {
    request.onAnswer(optionId, content);
    emit(c, { type: 'answered', ask, optionId: optionId || (content ? 'answered' : null) });
    return;
  }
  if (request?.codexElicit) {
    send(c, { id: ask, result: codexElicitReply(optionId, content) });
    emit(c, { type: 'answered', ask, optionId: optionId || (content ? 'answered' : null) });
    return;
  }
  if (request?.codexPermissions) {
    const yes = optionId === 'turn' || optionId === 'session';
    send(c, { id: ask, result: { permissions: yes ? request.codexPermissions : {}, scope: optionId === 'session' ? 'session' : 'turn' } });
    emit(c, { type: 'answered', ask, optionId: optionId || null });
    return;
  }
  if (request?.form) {
    send(c, { id: ask, result: content ? { action: 'accept', content } : { action: 'cancel' } });
    emit(c, { type: 'answered', ask, optionId: content ? 'answered' : null });
    return;
  }
  if (request?.cursor === 'question') {
    const answers = request.questions.map((q: any) => ({ questionId: q.id, selectedOptionIds: [content?.[q.id]].flat().filter((v) => v != null).map(String) }));
    send(c, { id: ask, result: { outcome: content ? { outcome: 'answered', answers } : { outcome: 'cancelled' } } });
    emit(c, { type: 'answered', ask, optionId: content ? 'answered' : null });
    return;
  }
  if (request?.cursor === 'plan') {
    send(c, { id: ask, result: { outcome: { outcome: optionId === 'accepted' || optionId === 'rejected' ? optionId : 'cancelled' } } });
    emit(c, { type: 'answered', ask, optionId: optionId || null });
    return;
  }
  if (request?.questions) {
    const answers: Record<string, { answers: unknown[] }> = {};
    for (const q of request.questions) answers[q.id] = { answers: [content?.[q.id], content?.[`${q.id}_custom`]].flat().filter((v) => v != null) };
    send(c, { id: ask, result: { answers } });
    emit(c, { type: 'answered', ask, optionId: content ? 'answered' : null });
    return;
  }
  if (request?.codex) {
    send(c, { id: ask, result: { decision: optionId || 'cancel' } });
    emit(c, { type: 'answered', ask, optionId: optionId || null });
    return;
  }
  send(c, { id: ask, result: { outcome: optionId ? { outcome: 'selected', optionId } : { outcome: 'cancelled' } } });
  emit(c, { type: 'answered', ask, optionId: optionId || null });
}

async function setOption(c: Chat, config: any) {
  if (c.agent === 'codex') {
    if (config.id === 'codex:model') {
      const model = c.codexModels.find((m) => m.model === config.value);
      if (!model) throw new HttpError(400, 'That Codex model is not available.');
      c.codexModel = model.model;
      if (!codexEfforts(model).includes(c.codexEffort!)) c.codexEffort = model.defaultReasoningEffort || '';
    } else if (config.id === 'codex:effort') {
      if (!codexEfforts(codexModelNow(c)).includes(config.value)) throw new HttpError(400, 'That reasoning effort is not available for this Codex model.');
      c.codexEffort = config.value;
    } else throw new HttpError(400, 'That Codex option is not available.');
    return codexConfigEvent(c);
  }
  if (c.agent === 'copilot' && config.id === 'model' && !setNow(c).configs?.some((o: any) => o.id === 'model')) {
    await rpc(c, 'session/set_model', { sessionId: c.sessionId, modelId: String(config.value) });
    c.copilotModel = String(config.value);
    return c.saved();
  }
  const r = await rpc(c, 'session/set_config_option', { sessionId: c.sessionId, configId: config.id, value: config.value });
  if (r?.configOptions) emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: c.agent === 'antigravity' ? agyOptions(c, r.configOptions) : c.agent === 'cursor' ? cursorOptions(c, r.configOptions) : c.agent === 'copilot' ? copilotOptions(c, r.configOptions) : c.agent === 'grok' ? grokOptions(c, r.configOptions) : r.configOptions } });
}
const shrinkOn = (c: Chat) => !!(c.state.get('shrinkMode') as any)?.on;
const isModel = (c: Chat, config: any) => typeof config?.id === 'string' && (config.id === 'model' || setNow(c).configs?.find((o: any) => o.id === config.id)?.category === 'model');
const modelNow = (c: Chat, config: any) => setNow(c).configs?.find((o: any) => o.id === config.id)?.currentValue ?? (c.agent === 'copilot' ? c.copilotModel : undefined);
const modelName = (c: Chat, config: any, value: unknown) => String(setNow(c).configs?.find((o: any) => o.id === config.id)?.options?.find((o: any) => o.value === value)?.name || value || 'the old model');
const useOf = (c: Chat) => (c.agent === 'codex' ? c.codexUse || null : chatUse(c.events));
function canCompactNow(c: Chat) {
  if (c.agent === 'cursor' || !c.sessionId || c.busy || c.queue.length || c.homing) return false;
  if (c.agent !== 'codex' && !(c.state.get('available_commands_update') as any)?.update?.availableCommands?.some((x: any) => x.name === 'compact')) return false;
  return !shrinkSkip(c.events, Date.now(), useOf(c));
}
function shrinks(c: Chat, config: any) {
  return shrinkOn(c) && modelNow(c, config) !== config.value && canCompactNow(c);
}
function saveWhole(c: Chat) {
  const n = 1 + c.events.filter((e) => e.type === 'shrink' && e.state === 'done').length;
  const file = path.join('.amethyst', 'handoffs', `${c.id}-shrink-${n}.md`), at = path.join(home(c), file);
  try {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, handoffOf(c, c.agent, { all: true }).full + '\n');
    return { file: file.split(path.sep).join('/'), at };
  } catch {
    return null;
  }
}
type Shrunk = { state: 'done' | 'failed' | 'stopped'; text: string };
async function compactCodex(c: Chat): Promise<Shrunk> {
  const done = new Promise<any>((resolve) => (c.turnDone = resolve));
  try {
    await rpc(c, 'thread/compact/start', { threadId: c.sessionId });
    const turn = await done;
    if (turn?.status === 'interrupted') return { state: 'stopped', text: '' };
    if (turn?.status === 'failed') return { state: 'failed', text: String(turn.error?.message || 'the compaction failed') };
    return { state: 'done', text: '' };
  } finally {
    c.turnDone = null;
    c.turnId = null;
  }
}
async function compactAcp(c: Chat, saved: { at: string } | null): Promise<Shrunk> {
  c.copilotTurn = {};
  const ask = saved ? `/compact Keep file paths, numbers, decisions and errors word for word. The full chat before this summary is saved at ${saved.at}: read it when you need a detail.` : '/compact';
  const r = await rpc(c, 'session/prompt', { sessionId: c.sessionId, prompt: [{ type: 'text', text: ask }] });
  heldText(c.copilotTurn).forEach((x) => updateOut(c, x));
  if (r?.stopReason === 'cancelled') return { state: 'stopped', text: '' };
  if (c.shrinking!.failed) return { state: 'failed', text: c.shrinking!.failed };
  if (/^error\b/i.test(c.shrinking!.said.trim())) return { state: 'failed', text: firstLine(c.shrinking!.said.trim()) };
  return { state: 'done', text: '' };
}
async function shrinkThen(c: Chat, config: any) {
  c.busy = true;
  const from = modelName(c, config, modelNow(c, config)), before = useOf(c)?.used;
  c.shrinking = { failed: '', said: '', to: config };
  emit(c, { type: 'shrink', state: 'start', from, to: modelName(c, config, config.value) });
  const saved = saveWhole(c);
  let got: Shrunk;
  try {
    got = c.agent === 'codex' ? await compactCodex(c) : await compactAcp(c, saved);
  } catch (e: any) {
    got = { state: 'failed', text: whyOf(e) };
  }
  const { state, text } = got;
  const { to, after } = c.shrinking!;
  c.shrinking = null;
  const toName = modelName(c, to, to.value);
  try {
    if (!c.ended) await setOption(c, to);
  } finally {
    c.busy = false;
    c.stopped = false;
    const smaller = state === 'done' && after != null && before != null && after < before;
    if (!c.ended) emit(c, { type: 'shrink', state, from, to: toName, ...(before != null ? { before } : {}), ...(smaller ? { after } : {}), ...(saved ? { file: saved.file } : {}), ...(text ? { text } : {}) });
    const next = !c.ended && c.queue.shift();
    if (next) prompt(c, next).catch(() => {});
    else if (c.napAfter && !c.ended) {
      c.napAfter = false;
      c.hydrated = true;
      nap(c);
    }
  }
  return { shrink: state, ...(text ? { why: text } : {}) };
}

const byTokens = (a: { tokens: number }, b: { tokens: number }) => b.tokens - a.tokens;
function contextShape(u: any, c: Chat) {
  const acc = accountsOf().find((x) => x.id === c.acct) || accountNow();
  const servers = new Map<string, number>();
  for (const t of u.mcp_tools || []) servers.set(String(t.server_name), (servers.get(String(t.server_name)) || 0) + (Number(t.tokens) || 0));
  return {
    model: String(u.model || ''),
    used: Number(u.total_tokens) || 0,
    size: Number(u.raw_max_tokens) || 0,
    parts: (u.categories || []).filter((x: any) => Number(x.tokens) > 0).map((x: any) => ({ name: String(x.name), tokens: Number(x.tokens), kind: String(x.kind || 'used') })),
    memory: (u.memory_files || []).map((x: any) => memoryFile(String(x.path), Number(x.tokens) || 0, home(c) || null, acc)).sort(byTokens),
    mcp: [...servers].map(([name, tokens]) => ({ name, tokens })).sort(byTokens),
  };
}
async function peekContext(c: Chat) {
  c.busy = true;
  const peek = (c.peek = { got: null, said: '' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const late = new Promise((_, no) => (timer = setTimeout(() => no(new HttpError(504, 'Claude took too long to count its context. Try again.')), 30000)));
    await Promise.race([rpc(c, 'session/prompt', { sessionId: c.sessionId, prompt: [{ type: 'text', text: '/context' }] }), late]);
  } catch (e) {
    if (!peek.got) {
      send(c, { method: 'session/cancel', params: { sessionId: c.sessionId } });
      throw e instanceof HttpError ? e : new HttpError(502, whyOf(e));
    }
  } finally {
    clearTimeout(timer);
    c.peek = null;
    c.busy = false;
    const next = !c.ended && c.queue.shift();
    if (next) prompt(c, next).catch(() => {});
  }
  if (!peek.got) throw new HttpError(502, peek.said.trim() ? 'This Claude Code is too old to split its context into parts. Update Claude Code, or type /context in the chat to see it as a table.' : 'Claude did not answer with its context.');
  return (c.ctxSeen = { context: contextShape(peek.got, c), at: Date.now() });
}

function cancel(c: Chat) {
  if (!c.sessionId) return;
  unqueue(c, null, true);
  if (c.sending) return void (c.stopped = true);
  if (c.agent === 'codex') {
    if (c.turnId) rpc(c, 'turn/interrupt', { threadId: c.sessionId, turnId: c.turnId }).catch(() => {});
    else if (c.busy) c.stopped = true;
    for (const t of subs.kidTurns(c.codexSubs)) rpc(c, 'turn/interrupt', t).catch(() => {});
  } else send(c, { method: 'session/cancel', params: { sessionId: c.sessionId } });
  if (c.agent === 'antigravity') agysubs.cancel(c);
  if (c.own && !c.busy) {
    ownQuiet(c);
    emit(c, { type: 'turn', stopReason: 'cancelled', own: true });
  }
  for (const ask of [...c.asks.keys()]) answer(c, ask, null);
  tellSeen(c, { type: 'cancel' });
}

const chatOf = (id: unknown) => {
  const c = chats.get(String(id || ''));
  if (!c) throw new HttpError(404, 'that chat has ended');
  if (c.ended) throw new HttpError(410, 'that chat has ended');
  return c;
};
async function pointed<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e: any) {
    throw new HttpError(e.status || 500, e.message);
  }
}
function otherBusy(c: Chat, what: string) {
  const other = [...chats.values()].find((x) => x !== c && x.busy && !x.ended && points.overlaps(x.cwd, c.cwd));
  if (other) throw new HttpError(409, `${live.get(other.id)?.title || 'Another chat'} is working in this folder. ${what === 'keep' ? 'Keep' : 'Reject'} waits until it's done.`);
}

function askCodex() {
  return new Promise<any>((resolve) => {
    const a = AGENTS.codex, line = [a.cmd, ...a.args].map((s) => (/\s/.test(s) ? `"${s}"` : s)).join(' ');
    const p = WIN ? spawn(line, { cwd: os.homedir(), shell: true, windowsHide: true, stdio: 'pipe' }) : spawn(a.cmd, a.args, { cwd: os.homedir(), windowsHide: true, stdio: 'pipe' });
    const said: any = {};
    const done = () => {
      clearTimeout(late);
      if (WIN) exec(`taskkill /pid ${p.pid} /T /F`, { windowsHide: true }, () => {});
      else p.kill('SIGTERM');
      resolve(said);
    };
    const late = setTimeout(done, 15e3);
    const ask = (m: RpcMsg) => p.stdin.write(JSON.stringify(m) + '\n');
    let buf = '';
    p.on('error', done);
    p.stdin.on('error', () => {});
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0; ) {
        const l = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(l);
        } catch {
          continue;
        }
        if (m.id === 1) {
          ask({ method: 'initialized', params: {} });
          ask({ id: 2, method: 'account/rateLimits/read' });
          ask({ id: 3, method: 'account/usage/read' });
        } else if (m.id === 2) said.limits = m.result || null;
        else if (m.id === 3) said.usage = m.result || null;
        if ('limits' in said && 'usage' in said) return done();
      }
    });
    ask({ id: 1, method: 'initialize', params: { clientInfo: { name: 'amethyst', title: 'Amethyst', version: '0.1.3' }, capabilities: { experimentalApi: true } } });
  });
}
async function readCodex() {
  const { limits, usage } = await askCodex();
  const buckets = Object.values<any>(limits?.rateLimitsByLimitId || (limits?.rateLimits ? { codex: limits.rateLimits } : {}));
  return {
    signedIn: !!limits,
    limits: buckets.flatMap((b) => [b.primary, b.secondary].filter(Boolean).map((w) => ({ label: b.limitName || '', mins: w.windowDurationMins, pct: w.usedPercent, resets: w.resetsAt }))),
    credits: buckets.find((b) => b.credits?.balance)?.credits.balance || null,
    tokens: (usage?.dailyUsageBuckets || []).map((d: any) => [Date.parse(d.startDate), d.tokens]),
  };
}
let codexRead: { at: number; said: ReturnType<typeof readCodex> } | null = null;
let agyRead: { at: number; key: string; said: Promise<AgyLimit[] | null> } | null = null;
function agyLimits(max = 60e3) {
  const { method } = agyWay();
  if (method && !AGY_GOOGLE.has(method)) return Promise.resolve(null);
  const key = agyKeyNow();
  if (!agyRead || agyRead.key !== key || Date.now() - agyRead.at > max) {
    const fake = process.env.MIND_FAKE_AGY_HUB;
    agyRead = { at: Date.now(), key, said: agyQuota(fake ? process.execPath : AGY_CMD, fake ? [fake] : [], agyEnv()) };
  }
  return agyRead.said;
}

async function codexUsage(max = 60e3) {
  if (!(await installed(AGENTS.codex))) return null;
  if (Date.now() - (codexRead?.at || 0) > max) codexRead = { at: Date.now(), said: readCodex() };
  return codexRead!.said;
}

function askClaude(how: How) {
  return new Promise<any>((resolve) => {
    const file = claudeCode.path!, script = FAKE_CC || /\.js$/i.test(file);
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--no-session-persistence'];
    const p = spawn(script ? process.execPath : file, script ? [file, ...args] : args, { cwd: os.homedir(), env: envFor(how), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    const done = (said: any) => {
      clearTimeout(late);
      p.kill();
      resolve(said);
    };
    const late = setTimeout(() => done(null), 15e3);
    const ask = (id: string, request: Record<string, unknown>) => p.stdin.write(JSON.stringify({ type: 'control_request', request_id: id, request }) + '\n');
    let buf = '';
    p.on('error', () => done(null));
    p.on('exit', () => done(null));
    p.stdin.on('error', () => {});
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0; ) {
        const l = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let m;
        try {
          m = JSON.parse(l);
        } catch {
          continue;
        }
        if (m.type !== 'control_response') continue;
        if (m.response?.request_id === 'init') ask('usage', { subtype: 'get_usage', skip_behaviors: true });
        if (m.response?.request_id === 'usage') return done(m.response.response?.rate_limits || null);
      }
    });
    ask('init', { subtype: 'initialize' });
  });
}
function claudeWindows(r: any) {
  const row = (label: string, mins: number, w: any): Limit[] => (w?.utilization == null ? [] : [{ label, mins, pct: w.utilization, resets: w.resets_at ? Math.floor(Date.parse(w.resets_at) / 1000) : 0 }]);
  return [...row('', 300, r.five_hour), ...row('', 10080, r.seven_day), ...(r.model_scoped || []).flatMap((w: any) => row(w.display_name, 10080, w))];
}
const claudeReads = new Map<string, { at: number; said: Promise<Limit[] | null> }>();
async function claudeLimits(id: string | null | undefined, max = 60e3, am = 1) {
  if (!claudeCode.at) await readClaudeCode();
  let how = auth(am), acc = how.cfg.account;
  if (id != null && id !== acc) {
    if (!claudeCode.path || !claudeCode.accounts[id]?.signedIn) return null;
    how = { method: 'claude', cfg: { ...how.cfg, account: id } };
    acc = id;
  }
  if (how.method !== 'claude' || !claudeCode.path) return null;
  if (Date.now() - (claudeReads.get(acc)?.at || 0) > max) {
    const read = { at: Date.now(), said: askClaude(how).then((r) => (r ? claudeWindows(r) : null)) };
    claudeReads.set(acc, read);
    read.said.then((list) => list || (read.at = 0));
  }
  return claudeReads.get(acc!)!.said;
}
function wakeClaude(how: How) {
  return new Promise<string | null>((resolve) => {
    const file = claudeCode.path!, script = FAKE_CC || /\.js$/i.test(file);
    const args = ['-p', 'hi', '--model', 'haiku', '--no-session-persistence', '--output-format', 'json'];
    const p = execFile(script ? process.execPath : file, script ? [file, ...args] : args, { cwd: os.tmpdir(), env: envFor(how), timeout: 60e3, windowsHide: true }, (err, out) => {
      let r: any = null;
      try {
        r = JSON.parse(String(out || '').trim().split('\n').pop()!);
      } catch {}
      resolve(r && !r.is_error ? null : r?.result || (err?.killed ? 'Claude Code took too long.' : 'Claude Code did not answer.'));
    });
    p.stdin?.end();
  });
}
const wakes = new Map<string, Promise<{ limits: Limit[] | null; late?: boolean }>>();
const WAKE_WAIT = Number(process.env.MIND_WAKE_WAIT) || 30e3;
const windowRuns = (list: Limit[] | null) => !!list?.some((l) => l.mins === 300 && l.resets * 1000 > Date.now());

const ROUTES: Routes = {
  'POST /api/image': async (im, _q, cwd) => ({ path: storeImage(cwd, im).path }),
  'GET /api/agents': async (_b, q, _r, _p, _R, am = 1) => {
    pinAm(am);
    if (q?.get('again')) {
      Object.values(AGENTS).forEach((a) => probes.delete(a.probe));
      signedCache.clear();
      modelLists.clear();
    }
    const [, codexOk, cursor, agents] = await Promise.all([
      claudeCodeNow(),
      codexSignedIn(),
      cursorInfo(),
      Promise.all(Object.entries(AGENTS).map(async ([id, a]) => ({ id, name: a.name, version: await installed(a), hint: a.hint }))),
    ]);
    return {
      available: true,
      auth: authInfo(am),
      codex: { signedIn: codexOk, line: 'your Codex CLI sign-in' },
      antigravity: agyInfo(),
      cursor,
      copilot: copilotInfo(),
      grok: grokInfo(),
      agents,
    };
  },
  'GET /api/agent/models': async (_b, q) => {
    const agent = String(q?.get('agent') || '');
    helperDef(agent);
    return helperModels(agent);
  },
  'GET /api/agents/usage': async (_b, q, _r, _p, _R, am = 1) => {
    pinAm(am);
    const age = Number(q?.get('age')), bg = q?.has('age') && age >= 60e3 ? age : 0;
    const [tokens, limits, codex, agy, cursor, copilot, grok] = await Promise.all([claudeTokens(), claudeLimits(undefined, bg || 60e3, am), codexUsage(bg || 60e3), installed(AGENTS.antigravity).catch(() => false), installed(AGENTS.cursor).then((v) => (v ? cursorInfo() : null), () => null), installed(AGENTS.copilot).then((v) => (v ? copilotInfo() : null), () => null), installed(AGENTS.grok).then((v) => (v ? grokInfo() : null), () => null), (!bg || Date.now() - claudeCode.at > bg) && readClaudeCode()]);
    const agyLims = agy && q?.get('agy') === '1' ? await agyLimits(bg || 60e3) : null;
    const { accounts, account } = authInfo(am), a = readAuth();
    const ams = Object.fromEntries([1, ...Object.keys(a.ams || {}).map(Number)].map((n) => [n, accountNow(a, n).id]));
    return { claude: { tokens, limits, accounts: claudeCode.path ? accounts : null, account, ams }, codex, antigravity: agy ? { ...agyInfo(), limits: agyLims || [] } : null, cursor, copilot, grok };
  },
  'PUT /api/agent/auth': async (body) => {
    const method = body.method == null ? null : String(body.method);
    if (body.agent === 'antigravity') {
      const busy = saveAgyWay(method, body.apiKey);
      return { ...agyInfo(), busy };
    }
    if (body.agent === 'cursor') {
      saveCursorKey(body.apiKey);
      return cursorInfo();
    }
    if (body.agent === 'copilot') {
      saveCopilotToken(body.token);
      return copilotInfo();
    }
    if (body.agent === 'grok') {
      saveGrokKey(body.apiKey);
      return grokInfo();
    }
    if (method && !METHODS[method]) throw new HttpError(400, 'no such way to sign in');
    const { antigravity, cursor, copilot, grok, accounts, account, ams } = readAuth();
    saveAuth({ ...(method ? { method, ...settingsFor(method, body) } : { off: true }), antigravity, cursor, copilot, grok, accounts, account, ams });
    clearSpares();
    fill();
    return authInfo();
  },
  'POST /api/agent/account': async ({ id }) => {
    if (!claudeCode.at) await readClaudeCode();
    if (!claudeCode.path) throw new HttpError(424, 'Install Claude Code first, then add an account.');
    const a = readAuth();
    let acc = id == null ? null : accountsOf(a).find((x) => x.id === id);
    if (id != null && !acc) throw new HttpError(404, 'no such account');
    if (!acc) {
      let n = 2;
      while ((a.accounts || []).some((x) => x.id === 'a' + n)) n++;
      acc = { id: 'a' + n, dir: `${path.resolve(configDir())}-${n}` };
      writeAuth({ accounts: [...(a.accounts || []), acc] });
    }
    tidy(acc);
    const exe = claudeCode.path, run = /\.js$/i.test(exe) ? `node ${quoteCommand(exe)}` : quoteCommand(exe);
    const env = accountEnv(acc), shown = acc.dir ? (WIN ? `$env:CLAUDE_CONFIG_DIR="${acc.dir}"; claude auth login` : `CLAUDE_CONFIG_DIR='${acc.dir}' claude auth login`) : 'claude auth login';
    const r = FAKE_CC !== undefined ? { opened: false } : openWindow('Sign in to Claude', `${run} auth login`, env);
    return { opened: r.opened, cmd: shown, id: acc.id, auth: authInfo() };
  },
  'GET /api/agent/account': async (_b, q, _r, _p, _R, am = 1) => {
    if (!claudeCode.at) await readClaudeCode();
    const id = String(q?.get('id') ?? ''), a = readAuth();
    if (!accountsOf(a).some((x) => x.id === id)) throw new HttpError(404, 'no such account');
    if (!claudeCode.accounts[id]?.signedIn) throw new HttpError(409, 'That account is not signed in yet.');
    const limits = await claudeLimits(id, undefined, am);
    const busy = auth(am).method === 'claude' ? [...chats.values()].filter((c) => amOf(c) === am && answering(c)).length : 0;
    return { limits, busy, terms: id === accountNow(a, am).id ? 0 : claudeTermsOff(id, am) };
  },
  'POST /api/agent/account/wake': async ({ id }, _q, _r, _p, _R, am = 1) => {
    if (!claudeCode.at) await readClaudeCode();
    const base = auth(am);
    if (!accountsOf(readAuth()).some((x) => x.id === id)) throw new HttpError(404, 'no such account');
    if (base.method !== 'claude' || !claudeCode.path) throw new HttpError(400, 'Only a Claude subscription sign-in has a 5-hour window.');
    if (!claudeCode.accounts[id]?.signedIn) throw new HttpError(409, 'That account is not signed in yet.');
    if (!wakes.has(id)) {
      const run = (async () => {
        const now = await claudeLimits(id, 0, am);
        if (windowRuns(now)) throw new HttpError(409, "This account's 5-hour window is already running.");
        const full = now?.find((l) => l.pct >= 100 && l.resets * 1000 > Date.now());
        if (full) throw new HttpError(429, `This account's ${full.label ? full.label + ' ' : ''}${full.mins === 300 ? '5-hour' : 'weekly'} limit is full until ${new Date(full.resets * 1000).toLocaleString()}, so a hi can't start the window.`);
        const why = await wakeClaude({ method: 'claude', cfg: { ...base.cfg, account: id } });
        if (why) throw new HttpError(/limit/i.test(why) ? 429 : 502, /limit/i.test(why) ? `Claude says the limit is reached: ${why}` : why);
        const until = Date.now() + WAKE_WAIT;
        for (;;) {
          claudeReads.delete(id);
          const limits = await claudeLimits(id, 0, am);
          if (windowRuns(limits)) return { limits };
          if (Date.now() >= until) return { limits, late: true };
          await new Promise((r) => setTimeout(r, 2e3));
        }
      })();
      wakes.set(id, run);
      run.finally(() => wakes.delete(id)).catch(() => {});
    }
    return wakes.get(id);
  },
  'GET /api/agent/accounts/setup': async (_b, _q, _r, _p, _R, am = 1) => {
    if (!claudeCode.at) await readClaudeCode();
    const a = readAuth();
    return { inUse: accountNow(a, am).id, accounts: accountsOf(a).map((x) => ({ ...accountSetup(x), ...claudeCode.accounts[x.id] })) };
  },
  'PUT /api/agent/account': async ({ agent, use, forget, dropAm, id: which, share, repair }, _q, _r, _p, _R, am = 1) => {
    if (agent === 'antigravity') {
      const busy = use != null ? useAgy(String(use)) : forgetAgy(String(forget ?? ''));
      return { ...agyInfo(), busy };
    }
    if (!claudeCode.at) await readClaudeCode();
    if (share != null || repair) return setShare(String(which ?? ''), share == null ? null : String(share), am);
    if (dropAm != null) {
      const n = Number(dropAm), { [n]: gone, ...rest } = readAuth().ams || {};
      if (n > 1) writeAuth({ ams: rest });
      for (const c of chats.values()) if (n > 1 && amOf(c) === n) giveTo(c);
      return authInfo(am);
    }
    const a = readAuth(), id = String(use ?? forget ?? ''), was = accountNow(a, am).id;
    const acc = accountsOf(a).find((x) => x.id === id);
    if (!acc) throw new HttpError(404, 'no such account');
    if (forget != null && !acc.dir) {
      if (claudeCode.path) await ccRun(claudeCode.path, ['auth', 'logout'], envFor({ method: null, cfg: {} }));
      claudeReads.delete(id);
    } else if (forget != null) {
      const ams = Object.fromEntries(Object.entries(a.ams || {}).filter(([, x]) => x !== id));
      writeAuth({ accounts: a.accounts!.filter((x) => x.id !== id), account: a.account === id ? undefined : a.account, ams });
      if (claudeCode.path) ccRun(claudeCode.path, ['auth', 'logout'], { ...envFor({ method: null, cfg: {} }), ...accountEnv(acc) }).catch(() => {});
      claudeReads.delete(id);
    } else {
      await readClaudeCode();
      if (!claudeCode.accounts[id]?.signedIn) throw new HttpError(409, 'That account is not signed in yet.');
      writeAuth(am > 1 ? { ams: { ...a.ams, [am]: id } } : { account: id });
    }
    const now = accountNow(readAuth(), am).id, moved = now !== was;
    const busy = moved ? switched(am) : 0;
    await readClaudeCode();
    return { ...authInfo(am), busy, terms: moved ? claudeTermsOff(now, am) : 0 };
  },
  'PUT /api/agent/owner': async ({ id, to, place, go, done }, _q, _r, _p, _R, am = 1) => {
    const c = chats.get(String(id || ''));
    if (!c || !live.get(c.id)) throw new HttpError(404, 'no such chat');
    if (done != null) {
      if (live.get(c.id).place?.at === Number(done)) live.set(c.id, { place: null });
      return { ok: true, am: amOf(c) };
    }
    const n = to == null ? am : Number(to);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(400, 'to: the number of an Amethyst');
    const where = place ? placeIn(place, go !== false, am) : null;
    pinAm(n);
    if (amOf(c) !== n) giveTo(c, n);
    live.set(c.id, { place: where });
    return { ok: true, am: n };
  },
  'POST /api/agent/login': async ({ method, agent = 'claude' }) => {
    if (agent === 'codex') {
      if (!(await installed(AGENTS.codex))) throw new HttpError(424, AGENTS.codex.hint);
      signedCache.delete('codex');
      clearSpares();
      return openLogin(null, 'codex');
    }
    if (agent === 'antigravity') {
      if (!(await installed(AGENTS.antigravity))) throw new HttpError(424, AGENTS.antigravity.hint);
      return openLogin(null, 'antigravity');
    }
    if (agent === 'cursor') {
      if (!(await installed(AGENTS.cursor))) throw new HttpError(424, AGENTS.cursor.hint);
      signedCache.delete('cursor');
      return openLogin(null, 'cursor');
    }
    if (agent === 'copilot') {
      if (!(await installed(AGENTS.copilot))) throw new HttpError(424, AGENTS.copilot.hint);
      return openLogin(null, 'copilot');
    }
    if (agent === 'grok') {
      if (!(await installed(AGENTS.grok))) throw new HttpError(424, AGENTS.grok.hint);
      return openLogin(null, 'grok');
    }
    if (!METHODS[method]?.login) throw new HttpError(400, 'that way signs in without a terminal');
    clearSpares();
    return openLogin(method);
  },
  'POST /api/agent/warm': async (b, _q, root) => {
    if (!root) return { ok: false };
    const agent = typeof b?.agent === 'string' && AGENTS[b.agent] ? b.agent : undefined;
    want(agent);
    return { ok: true };
  },
  'POST /api/agent': async ({ id, agent, resume, from, under, shrink }, _q, root, pid, _R, am = 1) => {
    if (!root) throw new HttpError(400, 'AI agents work inside a project');
    pinAm(am);
    const { a, how } = await canStart(agent, am);
    const parent = typeof under === 'string' && under ? chats.get(under) : null;
    if (under && !parent) throw new HttpError(404, 'the chat to start it under has ended');
    const wantId = typeof id === 'string' && /^[a-z0-9]{6,24}$/i.test(id) && !chats.has(id) ? id : null;
    const c = (parent ? null : take(agent, how)) || newChat({ ...(wantId ? { id: wantId } : {}), agent });
    if (wantId && c.id !== wantId) {
      aliasOf(c.id, wantId);
      c.id = wantId;
    }
    c.cwd = root;
    const named = typeof from === 'string' ? chats.get(from) : null;
    const copy = named?.forked?.copy && !resume && named.agent === agent ? named : null;
    const was = resume || copy ? named : null;
    if (was?.wt && !was.wt.gone && was.wt.root === root && fs.existsSync(was.cwd)) {
      c.wt = was.wt;
      c.cwd = was.cwd;
    }
    if (copy) {
      const key = copy.forked!.key;
      copy.forked = undefined;
      c.events = eventsBefore(copy.events, key);
      if (c.events.some((e) => e.type === 'you')) c.carry = { from: copy.agent, since: 0 };
      chatlog.write(c.id, c.events);
      points.carry(copy, c, key);
    } else if (was && was.forked?.session === resume) points.carry(was, c, was.forked!.key);
    else if (was && was.sessionId === resume) points.carry(was, c);
    c.kept = !parent;
    c.spoke = !!resume;
    want(agent);
    chats.set(c.id, c);
    live.set(c.id, { kind: 'chat', program: a.program, cwd: root, pid, status: 'starting', am, ...(c.wt ? { wt: c.wt.path } : {}), ...(parent ? { under: parent.id } : {}) });
    if (c.wt) emit(c, { type: 'worktree', wt: c.wt });
    if (named?.mine && named !== c) renameChat(c, named.mine);
    if (shrink === true) emit(c, { type: 'shrinkMode', on: true });
    const going = start(c, a, how, typeof resume === 'string' && resume ? resume : null);
    c.woken = going;
    going.finally(() => c.woken === going && (c.woken = null)).catch(() => {});
    return { id: c.id, name: a.name };
  },
  'POST /api/agent/send': async ({ id, prompt: text, images, ctx, cancel: stopTurn, unqueue: qid, now, ask, optionId, content, mode, config, worktree, points: keep, from, qid: asQid }) => {
    const c1 = chatOf(id);
    if (c1.agent === 'copilot' && config?.id === 'reasoning_effort') {
      if (c1.asleep) hydrate(c1);
      else if (c1.woken) await c1.woken;
      if (copilotOwnEffort(c1)) {
        copilotEffort(c1, config.value);
        return { ok: true };
      }
    }
    const needsAgent = !stopTurn && qid == null && ask == null;
    const c = needsAgent ? wake(c1) : c1;
    if (typeof mode === 'string' || config) await c.woken;
    if (config && !stopTurn && qid == null && now == null && ask == null && isModel(c, config)) {
      if (c.shrinking) {
        c.shrinking.to = config;
        return { ok: true, shrink: 'after' };
      }
      if (shrinks(c, config)) return { ok: true, ...(await shrinkThen(c, config)) };
    }
    if (stopTurn) cancel(c);
    else if (qid != null) unqueue(c, String(qid));
    else if (now != null) await sendNow(c, String(now));
    else if (ask != null) answer(c, ask, optionId, content);
    else if (c.agent === 'codex' && typeof mode === 'string') {
      if (!c.codexModePresets.some((m) => m.mode === mode)) throw new HttpError(400, 'That Codex mode is not available.');
      c.codexMode = mode;
      emit(c, { type: 'update', update: { sessionUpdate: 'current_mode_update', currentModeId: mode } });
    } else if (c.agent === 'antigravity' && config?.id === 'mode' && (config.value === SKIP || config.value === SANDBOX || c.agySkip || c.agySandbox)) {
      const r = await setAgyMode(c, config.value);
      if (r?.configOptions) emit(c, { type: 'update', update: { sessionUpdate: 'config_option_update', configOptions: agyOptions(c, r.configOptions) } });
    } else if (c.agent === 'cursor' && (mode === FORCE || (config?.id === 'mode' && config.value === FORCE) || (c.cursorForce && (typeof mode === 'string' || config?.id === 'mode')))) {
      await cursorForce(c, mode, config);
    } else if (c.agent === 'copilot' && config?.id === 'model' && !setNow(c).configs?.some((o: any) => o.id === 'model')) {
      await setOption(c, config);
    } else if (c.agent === 'copilot' && (typeof mode === 'string' || config?.id === 'mode')) {
      await copilotMode(c, String(typeof mode === 'string' ? mode : config.value));
    } else if (c.agent === 'grok' && (typeof mode === 'string' || config?.id === 'mode')) {
      await grokMode(c, String(typeof mode === 'string' ? mode : config.value));
    } else if (c.agent === 'codex' && config && typeof config.id === 'string') {
      await setOption(c, config);
    }
    else if (typeof mode === 'string') {
      await rpc(c, 'session/set_mode', { sessionId: c.sessionId, modeId: mode });
      emit(c, { type: 'update', update: { sessionUpdate: 'current_mode_update', currentModeId: mode } });
    } else if (config && typeof config.id === 'string') {
      await setOption(c, config);
    } else if ((typeof text === 'string' && text.trim()) || images?.length) {
      if (!c.sessionId && c.woken) await c.woken.catch(() => {});
      if (!c.sessionId) throw new HttpError(409, 'the agent is not ready yet');
      c.pointsOff = keep === false;
      if ((worktree === true || (worktree && typeof worktree === 'object')) && !c.spoke && !c.wt && !c.busy && !c.homing) c.wantWt = worktree === true ? {} : { from: typeof worktree.from === 'string' ? worktree.from : undefined, carry: worktree.carry === true };
      const msg = { qid: typeof asQid === 'string' && /^[a-z0-9]{1,12}$/.test(asQid) ? asQid : Math.random().toString(36).slice(2, 10), text: String(text || '').trim().slice(0, 100000), images: saveImages(c, images), ctx: contextOf(c, ctx), ...(typeof from === 'string' && /^[\w-]{1,40}$/.test(from) ? { from } : {}) };
      if (!c.busy) prompt(c, msg).catch(() => {});
      else {
        c.queue.push(msg);
        emit(c, { type: 'queued', qid: msg.qid, text: msg.text, images: msg.images.map((i) => ({ path: i.path })), ...(msg.from ? { from: msg.from } : {}) });
      }
      return { ok: true, images: msg.images.map((i) => i.path), qid: msg.qid, queued: c.queue.includes(msg) };
    } else throw new HttpError(400, 'nothing to send');
    return { ok: true };
  },
  'GET /api/agent/shrink/can': (_b, q) => {
    const c = chatOf(q!.get('id'));
    if (c.asleep) hydrate(c);
    return { can: canCompactNow(c), on: shrinkOn(c) };
  },
  'POST /api/agent/shrink': ({ id, on }) => {
    const c = chatOf(id);
    if (c.asleep) hydrate(c);
    if (shrinkOn(c) !== !!on) emit(c, { type: 'shrinkMode', on: !!on });
    return { ok: true, on: !!on };
  },
  'GET /api/agent/context': async (_b, q) => {
    const c1 = chatOf(q!.get('id'));
    if (c1.agent !== 'claude') throw new HttpError(400, 'Only Claude chats can show what their context is made of.');
    const held = (x: Chat) => x.busy || x.queue.length || x.asks.size || x.homing || x.rousing || x.shrinking;
    if (held(c1)) return { busy: true, ...(c1.ctxSeen || {}) };
    const c = wake(c1);
    if (!c.sessionId && c.woken) await c.woken.catch(() => {});
    if (!c.sessionId) throw new HttpError(409, 'The agent is not ready yet.');
    if (held(c)) return { busy: true, ...(c.ctxSeen || {}) };
    return await peekContext(c);
  },
  'POST /api/agent/switch': async ({ id, to, shrink }) => {
    const c0 = chatOf(id), from = c0.agent;
    if (typeof to !== 'string' || !AGENTS[to]) throw new HttpError(400, 'no such agent');
    if (to === from) throw new HttpError(400, `This chat already runs on ${AGENTS[from].name}.`);
    if (c0.busy || c0.queue.length || c0.asks.size || c0.homing || c0.rousing) throw new HttpError(409, 'Wait for this turn to end, or stop it, then continue with another agent.');
    const { a } = await canStart(to, amOf(c0));
    if (c0.asleep) hydrate(c0);
    const said = c0.events.some((e) => e.type === 'you' || e.update?.sessionUpdate === 'user_message_chunk');
    let shrinkState: Shrunk['state'] | undefined, shrinkWhy = '';
    const wantShrink = shrink === true || (shrink !== false && shrinkOn(c0));
    if (said && wantShrink && canCompactNow(c0)) {
      c0.busy = true;
      const before = useOf(c0)?.used;
      c0.shrinking = { failed: '', said: '', to: null };
      emit(c0, { type: 'shrink', state: 'start', from: AGENTS[from].name, to: a.name });
      const saved = saveWhole(c0);
      let got: Shrunk;
      try {
        got = c0.agent === 'codex' ? await compactCodex(c0) : await compactAcp(c0, saved);
      } catch (e: any) {
        got = { state: 'failed', text: whyOf(e) };
      }
      const after = c0.shrinking?.after;
      c0.shrinking = null;
      c0.busy = false;
      c0.stopped = false;
      shrinkState = got.state;
      shrinkWhy = got.text;
      const smaller = got.state === 'done' && after != null && before != null && after < before;
      if (!c0.ended) emit(c0, { type: 'shrink', state: got.state, from: AGENTS[from].name, to: a.name, ...(before != null ? { before } : {}), ...(smaller ? { after } : {}), ...(saved ? { file: saved.file } : {}), ...(got.text ? { text: got.text } : {}) });
    }
    const was = { agent: from, sessionId: c0.sessionId, spoke: c0.spoke, sessions: c0.sessions, carry: c0.carry, state: new Map(c0.state), asleep: c0.asleep, codexModel: c0.codexModel, codexEffort: c0.codexEffort, codexMode: c0.codexMode, codexModels: c0.codexModels, codexModePresets: c0.codexModePresets, agySkip: c0.agySkip, agySandbox: c0.agySandbox, cursorForce: c0.cursorForce, copilotAll: c0.copilotAll, grokMode: c0.grokMode, canList: c0.canList, canFork: c0.canFork, canSteer: c0.canSteer };
    const since = lastSpoke(c0.events, to, from);
    const sessions = { ...c0.sessions, ...(c0.sessionId ? { [from]: c0.sessionId } : {}) };
    nap(c0);
    for (const kind of ['ready', 'available_commands_update', 'current_mode_update', 'config_option_update']) c0.state.delete(kind);
    Object.assign(c0, { agent: to, sessions, sessionId: sessions[to] || null, spoke: !!sessions[to], carry: said ? { from, since } : null, hydrated: true, codexModel: undefined, codexEffort: undefined, codexMode: undefined, codexModels: [], codexModePresets: [], codexUse: undefined, agySkip: false, agySandbox: false, agySteps: null, cursorForce: false, copilotAll: false, grokMode: undefined, canList: undefined, canFork: undefined, canSteer: undefined });
    const c = wake(c0);
    try {
      await c.woken;
    } catch (e: any) {
      Object.assign(c, { ...was, state: was.state });
      nap(c);
      const ready = was.state.get('ready');
      if (ready) emit(c, { ...ready } as ChatEvent);
      throw e instanceof HttpError ? e : new HttpError(502, `${a.name} couldn't start: ${whyOf(e)}`);
    }
    if (said) emit(c, { type: 'switch', from, to });
    live.set(c.id, { program: a.program });
    c.saved();
    return { ok: true, agent: to, name: a.name, ...(shrinkState ? { shrink: shrinkState } : {}), ...(shrinkWhy ? { shrinkWhy } : {}) };
  },
  'GET /api/agent/handoff': (_b, q) => {
    const c = chatOf(q!.get('id'));
    if (c.asleep) hydrate(c);
    const to = q!.get('to') || c.agent, from = q!.get('from') || undefined;
    if (!AGENTS[to] || (from && !AGENTS[from])) throw new HttpError(400, 'no such agent');
    const since = q!.has('since') ? Number(q!.get('since')) : undefined, before = Number(q!.get('before')) || undefined;
    const h = handoffOf(c, to, { from, since: Number.isFinite(since) ? since : undefined, before, all: q!.get('all') === '1' });
    const rel = h.parts.saved && path.relative(c.cwd, h.parts.saved);
    const saved = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.replace(/\\/g, '/') : h.parts.saved;
    return { text: h.text, turns: h.turns, from: h.from, to, parts: { ...h.parts, saved } };
  },
  'POST /api/agent/fork': async ({ id, messageId }) => {
    const c = wake(chatOf(id));
    await c.woken;
    if (c.agent === 'codex') throw new HttpError(400, `${AGENTS[c.agent].name} cannot rewind a chat here.`);
    const cut = c.events.findLastIndex((e) => e.type === 'switch');
    if (cut >= 0 && typeof messageId === 'string' && messageId && c.events.findIndex((e) => e.update?.messageId === messageId) < cut) throw new HttpError(400, 'This message is from before the chat changed agents: go back only to messages after that.');
    if (!c.sessionId) throw new HttpError(409, 'the agent is not ready yet');
    if (c.agent === 'antigravity' || c.agent === 'cursor' || c.agent === 'copilot' || c.agent === 'grok') {
      if (typeof messageId === 'string' && messageId && !c.events.some((e) => e.update?.messageId === messageId)) throw new HttpError(404, "That message isn't in this chat's log, so the chat can't go back to it.");
      c.forked ={ session: '', key: typeof messageId === 'string' ? messageId : null, copy: true };
      return { copy: true };
    }
    const at = typeof messageId === 'string' && messageId ? { _meta: { jetbrains: { air: { fork: { version: 1, messageId } } } } } : {};
    const r = await rpc(c, 'session/fork', { sessionId: c.sessionId, cwd: c.cwd, mcpServers: await mcpFor(c), ...at });
    if (!r?.sessionId) throw new HttpError(502, 'the agent could not go back');
    c.forked = { session: r.sessionId, key: typeof messageId === 'string' ? messageId : null };
    return { sessionId: r.sessionId };
  },
  'POST /api/agent/rewind': async ({ id, messageId }) => {
    const c = chatOf(id);
    const busy = [...chats.values()].filter((x) => x !== c && x.busy && !x.ended && points.overlaps(x.cwd, c.cwd)).map((x) => live.get(x.id)?.title || 'another chat');
    try {
      return { busy, worktree: !!(c.wt && !c.wt.gone), ...(await points.plan(c, typeof messageId === 'string' ? messageId : null)) };
    } catch (e: any) {
      throw new HttpError(e.status || 500, e.message);
    }
  },
  'POST /api/agent/rewind/files': async ({ id, token, picks }) => {
    const c = chatOf(id);
    if (c.busy) throw new HttpError(409, 'Stop the chat first, then go back.');
    const other = [...chats.values()].find((x) => x !== c && x.busy && !x.ended && points.overlaps(x.cwd, c.cwd));
    if (other) {
      const who = live.get(other.id)?.title;
      throw new HttpError(409, `${who ? `Another chat (“${who}”)` : 'Another chat'} is working in this folder: the files stay as they are. Wait for it or stop it, then go back.`);
    }
    try {
      return await points.apply(c, String(token || ''), Array.isArray(picks) ? picks.map(String) : []);
    } catch (e: any) {
      throw new HttpError(e.status || 500, e.message);
    }
  },
  'POST /api/agent/rewind/undo': async ({ undo }) => {
    try {
      return await points.unapply(String(undo || ''));
    } catch (e: any) {
      throw new HttpError(e.status || 500, e.message);
    }
  },
  'GET /api/agent/edits': (_b, q) => pointed(() => review.list(chatOf(q!.get('id')))),
  'GET /api/agent/edits/file': (_b, q) => pointed(() => review.file(chatOf(q!.get('id')), String(q!.get('path') || ''))),
  'GET /api/agent/edits/turns': (_b, q) => pointed(() => review.turns(chatOf(q!.get('id')))),
  'GET /api/agent/edits/turn': (_b, q) => pointed(() => review.turnFile(chatOf(q!.get('id')), Number(q!.get('n')), String(q!.get('path') || ''))),
  'POST /api/agent/edits/keep': ({ id, paths, path: one, base }) => {
    const c = chatOf(id);
    otherBusy(c, 'keep');
    return pointed(() => review.keep(c, { paths: Array.isArray(paths) ? paths.map(String) : undefined, path: typeof one === 'string' ? one : undefined, base: typeof base === 'string' ? base : null }));
  },
  'POST /api/agent/edits/reject': ({ id, paths }) => {
    const c = chatOf(id);
    if (c.busy) throw new HttpError(409, 'Wait for this turn to end, or stop it, then reject.');
    otherBusy(c, 'reject');
    return pointed(() => review.reject(c, Array.isArray(paths) ? paths.map(String) : []));
  },
  'POST /api/agent/edits/undo': ({ undo }) => pointed(() => review.unreject(String(undo || ''))),
  'POST /api/agent/edits/write': ({ id, path: one, text, mtime }) => {
    const c = chatOf(id);
    if (c.busy) throw new HttpError(409, 'Wait for this turn to end, or stop it, then reject.');
    otherBusy(c, 'reject');
    return pointed(() => review.save(c, String(one || ''), String(text ?? ''), Number(mtime)));
  },
  'GET /api/agent/memory': async (_b, _q, root, _p, _R, am = 1) => {
    const h = accts.homeOf(accountNow(readAuth(), am));
    return { files: await memoryFiles(root, h.memory(root)), global: await globalFiles(h.setup), projectClaude: await hasProjectClaude(root) };
  },
  'POST /api/agent/global-claude': async (_b, _q, _r, _p, _R, am = 1) => {
    const dir = accts.homeOf(accountNow(readAuth(), am)).setup, abs = path.join(dir, 'CLAUDE.md');
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(abs, '', { flag: 'a' });
    return { abs };
  },
  'GET /api/agent/sessions': async (_b, q) => {
    const c = wake(chatOf(q!.get('id')));
    await c.woken;
    if (!c.canList) return { sessions: [] };
    if (c.agent === 'codex') {
      const r = await rpc(c, 'thread/list', { cwd: c.cwd, limit: 100 });
      const sessions = (r?.data || []).map((s: any) => ({ id: s.id, title: s.name || s.preview || null, updatedAt: s.updatedAt || null, ...(s.id === c.sessionId ? { current: true } : {}) }));
      return { sessions };
    }
    const r = await rpc(c, 'session/list', { cwd: c.cwd });
    const dir = c.agent === 'claude' ? transcriptsDir(c.cwd) : null;
    if (dir) textIndex(dir).catch(() => {});
    const sessions: any[] = (r?.sessions || []).filter((s: any) => /^[\w-]+$/.test(s.sessionId || ''));
    const now = (s: any): any => s.sessionId === c.sessionId;
    sessions.sort((x, y) => now(y) - now(x) || String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
    const title = async (s: any) => {
      const t = String(s.title || '').trim();
      return t && !/^\/\S+$/.test(t) ? t : (dir && (await firstAsked(path.join(dir, s.sessionId + '.jsonl')).catch(() => null))) || null;
    };
    return { sessions: await Promise.all(sessions.map(async (s) => ({ id: s.sessionId, title: await title(s), updatedAt: s.updatedAt || null, ...(s.sessionId === c.sessionId ? { current: true } : {}) }))) };
  },
  'GET /api/agent/sessions/search': async (_b, q, root) => {
    const c = chats.get(String(q!.get('id') || ''));
    if (c && (c.agent === 'codex' || c.agent === 'cursor')) return { hits: [] };
    const words = [...new Set(String(q!.get('q') || '').slice(0, 200).toLowerCase().split(/\s+/).filter(Boolean))];
    if (!root || !words.length) return { hits: [] };
    if (c?.agent === 'antigravity') return { hits: await agyStore.search(c.cwd, words) };
    if (c?.agent === 'copilot') return { hits: await copilotStore.search(c.cwd, words) };
    if (c?.agent === 'grok') return { hits: await grokStore.search(c.cwd, words) };
    return { hits: await search(transcriptsDir(root), words) };
  },
  'GET /api/agent/chats/search': async (_b, q, root, pid) => {
    const words = [...new Set(String(q!.get('q') || '').slice(0, 200).toLowerCase().split(/\s+/).filter(Boolean))];
    if (!root || !words.length) return { hits: [] };
    const mine = (live.all() as any[]).filter((a) => a.kind === 'chat' && !a.under && (a.pid || '') === (pid || ''));
    const open = mine.filter((a) => a.status !== 'ended'), held = new Map(open.filter((a) => a.session).map((a) => [a.session, a]));
    const hits: { chat?: string; session?: string; program: string; title: string; snip: string; at: number }[] = [], seen = new Set<string>();
    const add = (a: any, snip: string) => !seen.has(a.id) && (seen.add(a.id), hits.push({ chat: a.id, program: a.program || '', title: a.title || '', snip, at: a.at || 0 }));
    for (const a of open) {
      const text = await saidIn(a.id);
      const low = text.toLowerCase();
      if (text && words.every((w) => low.includes(w))) add(a, snippet(text, words[0]));
    }
    const shut = (session: string, program: string, title: string, snip: string, at: number) => {
      const a = held.get(session);
      if (a) return void add(a, snip);
      if (seen.has(session)) return;
      seen.add(session);
      const was = mine.find((m) => m.session === session);
      hits.push({ session, program, title: was?.title || title, snip, at });
    };
    const dir = transcriptsDir(root);
    for (const h of await search(dir, words).catch(() => [])) shut(h.id, 'claude', (await firstAsked(path.join(dir, h.id + '.jsonl')).catch(() => null)) || '', h.snip, h.at);
    for (const h of await agyStore.search(root, words).catch(() => [])) shut(h.id, 'antigravity', h.title, h.snip, h.at);
    const opened = hits.filter((h) => h.chat), earlier = hits.filter((h) => !h.chat).sort((x, y) => y.at - x.at);
    return { hits: [...opened.sort((x, y) => y.at - x.at), ...earlier].slice(0, 30).map(({ at, ...h }) => h) };
  },
  'DELETE /api/agent': async (_b, q) => {
    const c = chats.get(String(q!.get('id') || ''));
    if (c) {
      c.kept = false;
      chatlog.forget(c.id);
      saidCache.delete(c.id);
      stop(c, 'closed');
      dropImages(c);
    }
    live.drop(String(q!.get('id') || ''));
    return { ok: true };
  },
};

const HELPER_TIME = 5 * 60e3, LIST_TIME = 120e3, LIST_KEEP = 10 * 60e3;
const ONLY_WRITES: Record<string, string> = { cursor: 'ask', antigravity: 'plan' };
const COPILOT_ERROR = /^Error: Execution failed:\s*/;
const NO_TOOLS = { tools: [], persistSession: false, settingSources: [], strictMcpConfig: true, mcpServers: {}, promptSuggestions: false, maxTurns: 1 };
function helperDef(agent: unknown): AgentDef {
  if (typeof agent !== 'string' || !WRITERS.includes(agent)) throw new HttpError(400, 'That agent cannot be the writing helper.');
  return AGENTS[agent];
}
const HELPER_DIR = 'amethyst-helper-';
let swept = false;
function sweepHelpers() {
  if (swept) return;
  swept = true;
  for (const n of fs.readdirSync(os.tmpdir()).filter((x) => x.startsWith(HELPER_DIR))) {
    const at = path.join(os.tmpdir(), n);
    try {
      if (Date.now() - fs.statSync(at).mtimeMs > 3600e3) fs.rmdirSync(at);
    } catch {}
  }
}
const modelOption = (c: Chat) => setNow(c).configs?.find((o: any) => o.category === 'model' || o.id === 'model');
const modelChoices = (o: any): any[] => (o?.options || []).flatMap((x: any) => x.options || [x]);
async function holdToWriting(c: Chat) {
  const mode = ONLY_WRITES[c.agent];
  if (mode) {
    if (!(c.state.get('ready') as any)?.modes?.availableModes?.some((m: any) => m.id === mode)) throw new Error(`it has no ${mode} mode to keep it from changing files.`);
    await rpc(c, 'session/set_mode', { sessionId: c.sessionId, modeId: mode });
  }
  if (c.agent === 'copilot') await copilotMode(c, 'default');
}
async function pickModel(c: Chat, a: AgentDef, agent: string, model: string) {
  const o = modelOption(c);
  if (agent === 'copilot' && !o) return setOption(c, { id: 'model', value: model });
  if (!modelChoices(o).some((x) => x.value === model)) throw new HttpError(409, `${a.name} does not have the model ${model} any more. Right-click ✦ to pick another.`);
  if (o.currentValue !== model) await setOption(c, { id: o.id, value: model });
}
async function aside<T>(agent: string, { meta, timeout, what }: { meta?: Record<string, unknown>; timeout: number; what: string }, run: (c: Chat, a: AgentDef, ended: Promise<never>) => Promise<T>): Promise<T> {
  const a = helperDef(agent);
  let how: How | null = null;
  if (agent === 'claude') {
    how = auth();
    if (!how.method) throw new HttpError(401, 'Choose how Claude Agent signs in first (in a Claude Agent tab).');
    if (!(await installed(a))) throw new HttpError(424, a.hint);
  } else await canStart(agent, 1);
  sweepHelpers();
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), HELPER_DIR));
  const c = newChat({ id: 'ask-' + Math.random().toString(36).slice(2, 10), quiet: true, helper: true, ...(agent === 'claude' ? {} : { agent }), ...(meta ? { meta } : {}), cwd: dir });
  const ended = new Promise<never>((_, no) =>
    c.clients.add((ev) => {
      if (ev.type === 'ask') queueMicrotask(() => c.asks.has(ev.ask) && answer(c, ev.ask, agent === 'codex' && c.asks.get(ev.ask)?.codex ? 'decline' : null));
      if (ev.type === 'end') no(new Error(ev.why));
    }));
  ended.catch(() => {});
  let late = false;
  const timer = setTimeout(() => ((late = true), stop(c, 'took too long')), timeout);
  try {
    await start(c, a, how, null);
    if (!c.sessionId || c.ended) {
      const e = c.events.findLast((x) => x.type === 'status' && x.state === 'error');
      throw Object.assign(new Error(e?.text || c.events.findLast((x) => x.type === 'end')?.why || 'it could not start.'), { code: e?.signIn ? -32000 : 0 });
    }
    return await run(c, a, ended);
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    if (late) throw new HttpError(502, `${a.name} took too long. Try again.`);
    if (e.code === -32000 || (agent === 'codex' && /\bauth|login|signed out/i.test(e.message))) throw new HttpError(401, `${a.name} is not signed in. Sign in in a ${a.name} tab, then try again.`);
    throw new HttpError(502, `${a.name} could not ${what}: ${whyOf(e)}`);
  } finally {
    clearTimeout(timer);
    stop(c, 'answered');
    fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
  }
}
async function helperTurn(c: Chat, agent: string, text: string, ended: Promise<never>) {
  if (agent !== 'codex') {
    const r = await Promise.race([rpc(c, 'session/prompt', { sessionId: c.sessionId, prompt: [{ type: 'text', text }] }), ended]);
    if (agent === 'antigravity') recordAgyUsage(r?.usage);
    return r?.stopReason;
  }
  const done = new Promise<any>((resolve) => (c.turnDone = resolve));
  const r = await Promise.race([rpc(c, 'turn/start', { threadId: c.sessionId, input: [{ type: 'text', text }], ...(c.codexModel ? { model: c.codexModel } : {}), ...(c.codexEffort ? { effort: c.codexEffort } : {}) }), ended]);
  const turn = r?.turn?.status && r.turn.status !== 'inProgress' ? r.turn : await Promise.race([done, ended]);
  if (turn?.status === 'failed') throw new Error(turn.error?.message || 'the turn failed.');
  return turn?.status;
}
type AskOpts = { system?: string; agent?: unknown; model?: unknown; clean?: (said: string) => string };
async function ask(text: string, { system, agent: from, model: picked, clean = (s) => s.trim() }: AskOpts = {}): Promise<string> {
  const agent = from == null || from === '' ? 'claude' : String(from);
  const free = agent === 'claude' && picked == null, model = free ? 'haiku' : picked == null ? '' : String(picked).slice(0, 200);
  const once = (use: string) => {
    const meta = agent === 'claude' ? { ...(system ? { systemPrompt: system } : {}), claudeCode: { options: { ...NO_TOOLS, ...(free && use ? { model: use } : {}) } } } : undefined;
    return aside(agent, { meta, timeout: HELPER_TIME, what: 'write it' }, async (c, a, ended) => {
      let said = '';
      c.clients.add((ev) => {
        const u = ev.type === 'update' ? ev.update : null;
        if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.type === 'text') said += u.content.text;
      });
      await holdToWriting(c);
      if (use && !free) await pickModel(c, a, agent, use);
      if (agent === 'antigravity') c.busy = true;
      c.copilotTurn = {};
      const stopped = await helperTurn(c, agent, agent === 'claude' || !system ? text : `${system}\n\n${text}`, ended);
      heldText(c.copilotTurn).forEach((x) => updateOut(c, x));
      if (stopped === 'refusal') throw new HttpError(502, `${a.name} declined to answer.`);
      const whole = said.trim();
      const held = c.agyQuota || c.limitHit || (agent === 'claude' && CLAUDE_LIMIT.test(whole) ? whole : '') || (agent === 'copilot' && COPILOT_ERROR.test(whole) ? whole.replace(COPILOT_ERROR, '') : '');
      if (held) throw new HttpError(502, `${a.name} could not write it: ${held}`);
      const out = clean(said);
      if (!out) throw new HttpError(502, `${a.name} did not write anything. Try again.`);
      return out;
    });
  };
  if (!free) return once(model);
  return once(model).catch((e) => {
    if (!(e instanceof HttpError) || e.status !== 502 || !/model/i.test(e.message)) throw e;
    return once('');
  });
}

type ModelList = { models: { id: string; name: string; about?: string }[]; typed: boolean };
const modelLists = new Map<string, { at: number; p: Promise<ModelList> }>();
function helperModels(agent: string): Promise<ModelList> {
  const hit = modelLists.get(agent);
  if (hit && Date.now() - hit.at < LIST_KEEP) return hit.p;
  const p = aside(agent, { meta: agent === 'claude' ? { claudeCode: { options: NO_TOOLS } } : undefined, timeout: LIST_TIME, what: 'list its models' }, async (c) => {
    const o = modelOption(c);
    const models = modelChoices(o).filter((x) => x.value && !/^default(\[\])?$/.test(x.value)).map((x) => ({ id: String(x.value), name: String(x.name || x.value), ...(x.description ? { about: String(x.description) } : {}) }));
    return { models, typed: agent === 'copilot' && !o };
  });
  const e = { at: Date.now(), p };
  modelLists.set(agent, e);
  p.catch(() => modelLists.get(agent) === e && modelLists.delete(agent));
  return p;
}

const toolEv = (ev: Ev) => ev.type === 'end' || (ev.type === 'update' && /^tool_call/.test(ev.update?.sessionUpdate || ''));
function follow(id: string, all: (ev: Ev) => unknown, { tools = false } = {}) {
  const c = chats.get(id);
  const out = tools ? (ev: Ev) => toolEv(ev) && all(ev) : all;
  if (!c) return void out({ type: 'end', why: 'that chat has ended', gone: true });
  if (c.asleep) hydrate(c);
  const kept = new Set(c.events);
  const events = [...[...c.state.values()].filter((ev) => !kept.has(ev)), ...c.events].filter((ev) => !tools || toolEv(ev));
  all({ type: 'history', events });
  if (c.ended) return;
  c.clients.add(out);
  return () => c.clients.delete(out);
}

const leave = () => chatlog.leave();
const slimOld = () => chatlog.slimOld((id) => {
  const c = chats.get(id);
  return !c || !c.asleep || !!c.hydrated;
});
function stopAll() {
  chatlog.flushSync();
  const pids = [];
  for (const c of [...chats.values(), ...spares.map((s) => s.c)]) {
    if (!c.proc || c.proc.exitCode != null) continue;
    if (WIN) pids.push(c.proc.pid);
    else
      try {
        c.proc.kill('SIGTERM');
      } catch {}
  }
  return pids;
}

const saidCache = new Map<string, { size: number; n: number; last: Ev | undefined; text: string }>();
function saidText(evs: Ev[]) {
  let text = '';
  for (const e of evs) {
    if (e.type === 'you' && e.text) text += (text ? '\n\n' : '') + e.text + '\n\n';
    else if (e.type === 'update' && e.update?.sessionUpdate === 'agent_message_chunk' && e.update.content?.type === 'text' && !e.update._meta?.sub?.parent) text += e.update.content.text;
  }
  return text.trim();
}
async function saidIn(id: string) {
  const c = chats.get(id);
  if (!c) return '';
  const disk = c.kept && !c.hydrated && !c.events.length;
  const size = disk ? await chatlog.sizeOf(id) : -1, n = c.events.length, last = c.events.at(-1);
  const had = saidCache.get(id);
  if (had && had.size === size && had.n === n && had.last === last) return had.text;
  const text = saidText(disk ? await chatlog.readSlowly(id) : c.events);
  saidCache.set(id, { size, n, last, text });
  return text;
}

const NAME_MAX = 80;
function renameChat(c: Chat, title: string) {
  c.mine = firstLine(title, NAME_MAX) || undefined;
  const shown = c.mine || c.auto || '';
  live.set(c.id, { title: shown });
  c.saved();
  emit(c, { type: 'renamed', title: shown, mine: !!c.mine });
  return shown;
}
function chatFor(id: string, full = true) {
  const c = chats.get(id);
  if (full && c?.asleep) hydrate(c);
  return c;
}

export type { Chat };
export { init, ROUTES, accountDirs, renameChat, follow, stopAll, leave, slimOld, warmUp, ask, claudeAccount, napIn, touchedIn, onEvent, onUpdate, emitSub, addAsk, dropAsk, setShell, setAlias, sessionMeta, chatFor, NAMES };
