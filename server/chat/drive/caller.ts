import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as live from '../../base/live.ts';
import * as agents from '../agents.ts';
import { HttpError } from '../../base/routes.ts';
import { gate, isUser } from '../../base/user.ts';
import { WIN } from '../../base/util.ts';
import { CODE, crystalOf } from '../../../public/base/codes.ts';
import { runTime } from '../../../public/base/words.ts';
import type { Live } from '../../base/live.ts';
import type { Chat } from '../agents.ts';

export type Settings = { chats: boolean; asks: boolean };
type Cli = { command: string; script: string; env: Record<string, string>; dir: string };
export type Init = { url: string; cli: Cli; settings: () => Settings; projectName: (pid: string) => string; workspaceOf: (pid: string, cwd: string) => string };
export type Scope = { pid: string; root: string };
export type Caller = { id: string; pid: string; root: string; am: number } | null;
export type Args = Record<string, any>;

export let cfg: Init = { url: '', cli: { command: process.execPath, script: '', env: {}, dir: '' }, settings: () => ({ chats: true, asks: false }), projectName: () => 'another project', workspaceOf: () => '' };
export const setCfg = (o: Init) => void (cfg = o);
const keys = new Map<string, string>();

const sameDir = (a: string, b: string) => {
  const x = path.resolve(a || ''), y = path.resolve(b || '');
  return WIN ? x.toLowerCase() === y.toLowerCase() : x === y;
};
export const codeOf = (id: string) => crystalOf(id).code;
const nameOf = (a: Live) => `${codeOf(a.id)}${a.title ? ` · ${a.title}` : ''}`;
export const ago = (t: number) => runTime(Math.max(0, Math.round((Date.now() - t) / 1000)));
export const route = (key: string) => agents.ROUTES[key] as (...a: any[]) => Promise<any>;
export const quote = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
export const listOf = (v: unknown) => (Array.isArray(v) ? v : String(v ?? '').split(/[\s,]+/)).map((x) => String(x).trim()).filter(Boolean);

function keyOf(id: string) {
  if (!keys.has(id)) keys.set(id, crypto.randomBytes(16).toString('hex'));
  return keys.get(id)!;
}

let launcher = '';
function launcherDir() {
  const { command, script, env, dir } = cfg.cli;
  if (!script || !dir) return '';
  const slash = (p: string) => p.replace(/\\/g, '/');
  const sh = `#!/bin/sh\n${Object.entries(env).map(([k, v]) => `${k}=${v} `).join('')}exec "${slash(command)}" "${slash(script)}" "$@"\n`;
  const files: [string, string][] = [['amethyst', sh]];
  if (WIN) files.push(['amethyst.cmd', `@echo off\r\nsetlocal\r\n${Object.entries(env).map(([k, v]) => `set ${k}=${v}\r\n`).join('')}"${command}" "${script}" %*\r\nexit /b %errorlevel%\r\n`]);
  const text = files.map((f) => f[1]).join('');
  if (launcher !== text) {
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, body] of files) {
      const file = path.join(dir, name);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== body) fs.writeFileSync(file, body, { mode: 0o755 });
    }
    launcher = text;
  }
  return dir;
}

export function shellFor(c: Chat): { env: Record<string, string>; bin: string; cli: { command: string; script: string; env: Record<string, string> } } | null {
  if (!cfg.url || (live.get(c.id) as Live | undefined)?.under) return null;
  return { env: { AMETHYST_URL: cfg.url, AMETHYST_CHAT: c.id, AMETHYST_PASS: keyOf(c.id) }, bin: launcherDir(), cli: { command: cfg.cli.command, script: cfg.cli.script, env: cfg.cli.env } };
}

export function argsOf(body: Args, q: URLSearchParams | undefined): Args {
  const out: Args = { ...(body || {}) };
  for (const [k, v] of q || []) if (!(k in out)) out[k] = v;
  return out;
}

export function knownCaller(a: Args): Caller {
  const by = String(a.by || '');
  if (!by || by === 'cli') return null;
  const key = keys.get(by);
  if (!key || key !== String(a.key || '')) throw new HttpError(403, "that key isn't this chat's: Amethyst tools work only from the chat Amethyst started them for");
  const me = live.get(by) as Live | undefined;
  if (!me) throw new HttpError(404, 'the calling chat has ended');
  return { id: by, pid: me.pid || '', root: me.cwd, am: me.am || 1 };
}

export function callerOf(a: Args): Caller {
  const who = knownCaller(a);
  if (who && !cfg.settings().chats) throw new HttpError(403, "Amethyst tools are off: the user turned off \"Chats can drive other chats\" in settings.");
  return who;
}

export const byUser = (who: Caller) => (gate.on ? isUser() : !who);
export const mayAnswer = (who: Caller) => byUser(who) || cfg.settings().asks;
export const nameFor = (who: Caller, by: unknown) => who?.id || (by || !byUser(who) ? 'cli' : '');

export const scopeOf = (who: Caller, root?: string, pid?: string): Scope => (who ? { pid: who.pid, root: who.root } : { pid: pid || '', root: root || '' });
export const inScope = (s: Scope) => (a: Live) => a.kind === 'chat' && !a.under && (a.pid ? a.pid === s.pid : !s.pid && sameDir(a.cwd, s.root));

export function find(word: unknown, s: Scope): Live {
  const w = String(word ?? '').trim();
  if (!w) throw new HttpError(400, 'which chat? give its code (Q20), its title or its id');
  const chats = (live.all() as Live[]).filter((a) => a.kind === 'chat' && !a.under);
  const m = CODE.exec(w);
  let hits = m ? chats.filter((a) => codeOf(a.id) === m[1].toUpperCase()) : chats.filter((a) => a.id === w);
  if (!hits.length && !m) {
    const t = w.replace(/^@/, '').toLowerCase();
    hits = chats.filter((a) => (a.title || '').toLowerCase() === t);
    if (!hits.length) hits = chats.filter((a) => (a.title || '').toLowerCase().includes(t));
  }
  const mine = hits.filter(inScope(s));
  const open = mine.filter((a) => a.status !== 'ended');
  if (open.length === 1 || (mine.length === 1 && !open.length)) return open[0] || mine[0];
  if (mine.length > 1) throw new HttpError(409, `${w} names ${mine.length} chats here: ${mine.map((a) => `${nameOf(a)} (id ${a.id})`).join('; ')}. Give the id.`);
  if (hits.length) throw new HttpError(403, `${codeOf(hits[0].id)} is in ${cfg.projectName(hits[0].pid || '')}; chats can only drive chats in their own project.`);
  throw new HttpError(404, `no chat ${w} in this project: amethyst chat list shows them`);
}

export function chatOf(a: Live) {
  const c = agents.chatFor(a.id);
  if (!c) throw new HttpError(410, `${codeOf(a.id)} has ended`);
  return c;
}

export function chatById(id: unknown): Live {
  const a = live.get(String(id ?? '')) as Live | undefined;
  if (!a || a.kind !== 'chat') throw new HttpError(404, 'no such chat');
  return a;
}
