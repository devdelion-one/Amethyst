import fs from 'fs';
import os from 'os';
import path from 'path';
import { configDir } from './agentdirs.ts';
import { replaceSync, stamp, WIN } from './util.ts';

export type Share = 'all' | 'own';
export interface Account {
  id: string;
  dir?: string;
  share?: Share;
}
export interface Ready {
  fixed: string[];
  kept: string[];
  waits: string[];
}
export interface Item {
  name: string;
  path: string;
  shared: boolean;
}

const ALWAYS = ['projects', 'file-history', 'todos', 'plans', 'history.jsonl'];
const SETUP = ['CLAUDE.md', 'settings.json', 'rules', 'skills', 'plugins', 'agents', 'commands', 'output-styles'];
const FILES = new Set(['history.jsonl', 'CLAUDE.md', 'settings.json']);
const MADE = new Set(['projects']);

let archive: ((from: string, label: string) => Promise<unknown>) | null = null;
let inUse: (am: number) => Account = () => ({ id: 'default' });
export const init = (o: { archive?: (from: string, label: string) => Promise<unknown>; inUse?: (am: number) => Account }) => {
  if (o.archive) archive = o.archive;
  if (o.inUse) inUse = o.inUse;
};
export const accountInUse = (am = 1) => inUse(am);

export const shareOf = (a: Account): Share | 'main' => (!a.dir ? 'main' : a.share === 'own' ? 'own' : 'all');
const numberOf = (a: Account) => (a.dir && /-(\d+)$/.exec(a.dir)?.[1]) || a.id;
export const tagOf = (a: Account) => `account ${numberOf(a)}`;
export const slug = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');
const isShared = (a: Account, n: string) => shareOf(a) !== 'own' || ALWAYS.includes(n);

export function homeOf(a: Account) {
  const own = shareOf(a) === 'own';
  return {
    dir: a.dir || configDir(),
    setup: own ? a.dir! : configDir(),
    memory: (root: string) => (own ? path.join(a.dir!, 'memory', slug(root)) : path.join(configDir(), 'projects', slug(root), 'memory')),
    own,
  };
}
export const memorySetting = (a: Account, root: string) => (shareOf(a) === 'own' ? { autoMemoryDirectory: homeOf(a).memory(root) } : null);

export function items(a: Account): Item[] {
  const dir = a.dir || configDir();
  return [...SETUP, ...ALWAYS].map((n) => ({ name: n, path: path.join(isShared(a, n) ? configDir() : dir, n), shared: !a.dir || isShared(a, n) }));
}

const lst = (p: string) => {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
};
const plain = (p: string) => path.resolve(p.replace(/^\\\\\?\\/, ''));
const samePath = (a: string, b: string) => (WIN ? plain(a).toLowerCase() === plain(b).toLowerCase() : plain(a) === plain(b));
const pointsTo = (p: string, to: string) => {
  try {
    return samePath(fs.readlinkSync(p), to);
  } catch {
    return false;
  }
};
const sameFile = (a: string, b: string) => {
  try {
    const x = fs.statSync(a, { bigint: true }), y = fs.statSync(b, { bigint: true });
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
};
const sameBytes = (a: string, b: string) => {
  try {
    return fs.statSync(a).size === fs.statSync(b).size && fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
};
function unlinkLink(p: string) {
  try {
    fs.unlinkSync(p);
  } catch {
    fs.rmdirSync(p);
  }
}
function freeName(dir: string, name: string, tag: string) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let i = 1; ; i++) {
    const p = path.join(dir, `${stem} (${tag}${i > 1 ? ' ' + i : ''})${ext}`);
    if (!lst(p)) return p;
  }
}
const lines = (p: string) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim());
function appendTo(dst: string, add: string[]) {
  if (!add.length) return;
  const text = fs.readFileSync(dst, 'utf8');
  fs.appendFileSync(dst, (text && !text.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n');
}
const uuidOf = (l: string) => {
  try {
    const u = JSON.parse(l)?.uuid;
    return typeof u === 'string' ? u : null;
  } catch {
    return null;
  }
};
function mergeJsonl(src: string, dst: string) {
  const have = lines(dst), uuids = new Set(have.map(uuidOf).filter(Boolean)), seen = new Set(have);
  appendTo(dst, lines(src).filter((l) => {
    const u = uuidOf(l);
    return u ? !uuids.has(u) : !seen.has(l);
  }));
}
function mergeLines(src: string, dst: string) {
  const seen = new Set(lines(dst).map((l) => l.trim()));
  appendTo(dst, lines(src).filter((l) => !seen.has(l.trim())));
}

function mergeInto(src: string, dst: string, tag: string, kept: string[]) {
  fs.mkdirSync(dst, { recursive: true });
  const key = (n: string) => (WIN ? n.toLowerCase() : n);
  const there = new Map(fs.readdirSync(dst).map((n) => [key(n), n]));
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const s = path.join(src, e.name), hit = there.get(key(e.name)), d = path.join(dst, hit || e.name), at = hit ? lst(d) : null;
    if (e.isDirectory()) {
      if (!at) fs.cpSync(s, d, { recursive: true });
      else if (at.isDirectory() && !at.isSymbolicLink()) mergeInto(s, d, tag, kept);
      else {
        const k = freeName(dst, e.name, tag);
        fs.cpSync(s, k, { recursive: true });
        kept.push(k);
      }
    } else if (e.isFile()) {
      if (!at) fs.copyFileSync(s, d);
      else if (at.isFile() && sameBytes(s, d)) continue;
      else if (at.isFile() && /\.jsonl$/i.test(e.name)) mergeJsonl(s, d);
      else if (at.isFile() && e.name.toLowerCase() === 'memory.md') mergeLines(s, d);
      else {
        const k = freeName(dst, e.name, tag);
        fs.copyFileSync(s, k);
        kept.push(k);
      }
    }
  }
}

function putAway(a: Account, from: string, name: string) {
  const label = `${stamp()} ${tagOf(a)} ${name}`;
  try {
    archive?.(from, label).catch(() => {});
  } catch {}
}

function swapDir(a: Account, n: string, from: string, to: string, r: Ready) {
  const kept: string[] = [];
  mergeInto(to, from, tagOf(a), kept);
  const old = path.join(a.dir!, '.merged', `${stamp()}-${n}`);
  fs.mkdirSync(path.dirname(old), { recursive: true });
  try {
    fs.renameSync(to, old);
  } catch {
    r.waits.push(n);
    return;
  }
  fs.symlinkSync(from, to, 'junction');
  mergeInto(old, from, tagOf(a), kept);
  r.fixed.push(n);
  r.kept.push(...kept);
  putAway(a, old, n);
}

function dirItem(a: Account, n: string, from: string, to: string, idle: boolean, r: Ready) {
  let st = lst(to);
  if (isShared(a, n)) {
    if (st?.isSymbolicLink()) {
      if (pointsTo(to, from) && fs.existsSync(from)) return;
      unlinkLink(to);
      st = null;
    }
    if (!st) {
      if (MADE.has(n)) fs.mkdirSync(from, { recursive: true });
      if (fs.existsSync(from)) fs.symlinkSync(from, to, 'junction');
      return;
    }
    if (!st.isDirectory()) return;
    if (!idle) return void r.waits.push(n);
    swapDir(a, n, from, to, r);
    return;
  }
  if (st?.isSymbolicLink()) {
    unlinkLink(to);
    st = null;
  }
  if (!st && fs.existsSync(from)) fs.cpSync(from, to, { recursive: true, filter: (p) => !(n === 'plugins' && samePath(p, path.join(from, 'cache'))) });
}

function fileItem(a: Account, n: string, from: string, to: string, r: Ready) {
  let st = lst(to);
  if (st?.isSymbolicLink()) {
    unlinkLink(to);
    st = null;
  }
  if (!isShared(a, n)) {
    if (st && sameFile(to, from)) {
      const buf = fs.readFileSync(to);
      fs.unlinkSync(to);
      fs.writeFileSync(to, buf);
    } else if (!st && fs.existsSync(from)) fs.copyFileSync(from, to);
    return;
  }
  if (!st) {
    if (fs.existsSync(from)) fs.linkSync(from, to);
    return;
  }
  if (!st.isFile() || sameFile(to, from)) return;
  if (!fs.existsSync(from)) {
    fs.linkSync(to, from);
    return;
  }
  if (n === 'history.jsonl') mergeJsonl(to, from);
  else if (!sameBytes(to, from)) {
    const k = freeName(path.dirname(from), n, tagOf(a));
    fs.copyFileSync(to, k);
    r.kept.push(k);
  }
  fs.unlinkSync(to);
  fs.linkSync(from, to);
  r.fixed.push(n);
}

function syncMcp(a: Account) {
  const mainJson = process.env.CLAUDE_CONFIG_DIR ? path.join(configDir(), '.claude.json') : path.join(os.homedir(), '.claude.json');
  const own = path.join(a.dir!, '.claude.json');
  try {
    const m = JSON.parse(fs.readFileSync(mainJson, 'utf8')), o = JSON.parse(fs.readFileSync(own, 'utf8'));
    const want = { ...o.mcpServers, ...m.mcpServers };
    if (!m.mcpServers || JSON.stringify(want) === JSON.stringify(o.mcpServers || {})) return;
    replaceSync(own, JSON.stringify({ ...o, mcpServers: want }, null, 2), { tmp: own + '.amethyst.tmp' });
  } catch {}
}

export function ready(a: Account, idle: boolean): Ready {
  const r: Ready = { fixed: [], kept: [], waits: [] };
  if (!a.dir) return r;
  const base = configDir();
  try {
    fs.mkdirSync(path.join(base, 'projects'), { recursive: true });
    fs.mkdirSync(a.dir, { recursive: true });
  } catch {
    return r;
  }
  for (const n of [...ALWAYS, ...SETUP]) {
    const from = path.join(base, n), to = path.join(a.dir, n);
    try {
      if (FILES.has(n)) fileItem(a, n, from, to, r);
      else dirItem(a, n, from, to, idle, r);
    } catch {
      if (!r.waits.includes(n)) r.waits.push(n);
    }
  }
  if (idle && shareOf(a) === 'all') syncMcp(a);
  return r;
}

export function memoryOut(a: Account) {
  const projects = path.join(configDir(), 'projects');
  for (const p of fs.readdirSync(projects, { withFileTypes: true })) {
    const from = path.join(projects, p.name, 'memory'), to = path.join(a.dir!, 'memory', p.name);
    if (p.isDirectory() && fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });
  }
}
export function memoryBack(a: Account, r: Ready) {
  const own = path.join(a.dir!, 'memory');
  if (!fs.existsSync(own)) return;
  const projects = path.join(configDir(), 'projects');
  for (const p of fs.readdirSync(own, { withFileTypes: true })) if (p.isDirectory()) mergeInto(path.join(own, p.name), path.join(projects, p.name, 'memory'), tagOf(a), r.kept);
  const old = path.join(a.dir!, '.merged', `${stamp()}-memory`);
  fs.mkdirSync(path.dirname(old), { recursive: true });
  try {
    fs.renameSync(own, old);
    putAway(a, old, 'memory');
  } catch {
    r.waits.push('memory');
  }
}
