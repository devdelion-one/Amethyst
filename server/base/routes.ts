import type { FileInfo, FileMeta, Pin, TreeNode } from '../../public/base/types.ts';
import { BOARD_EXT, MAX_PATHS, TEXT_EXT } from '../../public/base/files.ts';

interface DiskEntry {
  name: string;
  dir: boolean;
  file: boolean;
}
interface DiskStat {
  dir: boolean;
  size: number;
  mtime: number;
}
export interface Disk {
  caseless: boolean;
  read(rel: string): Promise<string | null>;
  bytes(rel: string, n: number): Promise<Uint8Array>;
  write(rel: string, text: string, opts?: { fresh?: boolean; atomic?: boolean }): Promise<unknown>;
  stat(rel: string): Promise<DiskStat | null>;
  list(rel: string): Promise<DiskEntry[]>;
  mkdir(rel: string): Promise<unknown>;
  move(rel: string, dest: string): Promise<unknown>;
  remove(rel: string): Promise<unknown>;
}
export interface ArchiveStore {
  abs(rel: string): string;
  read(rel: string): Promise<string | null>;
  stat(rel: string): Promise<DiskStat | null>;
  list(rel: string): Promise<DiskEntry[]>;
  mkdir(rel: string): Promise<unknown>;
  remove(rel: string): Promise<unknown>;
  take(rel: string, dest: string): Promise<{ left?: string }>;
  give(rel: string, dest: string): Promise<{ left?: string }>;
}
export interface RootMeta {
  v?: number;
  files: Record<string, FileMeta>;
  dirs: Record<string, Record<string, unknown>>;
  layout: Record<string, unknown>;
  order: string[];
  archive?: any[];
  [key: string]: any;
}
interface ArchiveEntry {
  id: string;
  type: string;
  title: string;
  name: string;
  from?: string;
  at: number;
  meta?: Record<string, Record<string, unknown>>;
  order?: number;
}
type PinLike = Pin & { path?: string; session?: string; id?: string };
type Rule = (rel: string, dir?: boolean) => boolean;
type Ignored = ((rel: string, dir: boolean) => boolean) & { listed: Rule; shown: Set<string>; ignored: Rule };
interface ForgetItem {
  id: string;
  text: string;
  level: string;
  due: number | null;
  span: number | null;
  done: number | null;
  every: boolean;
  at: number | null;
}

export class HttpError extends Error {
  declare status: number;
  declare detail?: string;
  declare fix?: string;
  constructor(status: number, msg: string, more: { detail?: string; fix?: string } = {}) {
    super(msg);
    this.status = status;
    if (more.detail) this.detail = more.detail;
    if (more.fix) this.fix = more.fix;
  }
}

const IGNORE = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store']);
export const DOT = '.amethyst';
const HIDDEN = new Set(['.git', DOT]);
const BUILT_IN = new Set(['.git', DOT, 'node_modules']);
const CODE_EXT = /\.(js|mjs|cjs|jsx|ts|tsx|json|jsonc|css|scss|less|html?|xml|ya?ml|toml|ini|cfg|conf|env|sh|bash|ps1|psm1|bat|cmd|py|rb|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|fs|php|lua|sql|r|dart|vue|svelte|astro|gradle|properties|csv|tsv|log|gitignore|gitattributes|editorconfig|dockerfile|makefile|lock|uproject|uplugin|ini)$/i;
const BINARY_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|psd|pdf|zip|7z|rar|gz|tgz|tar|exe|dll|so|dylib|bin|dat|pak|uasset|umap|fbx|obj|blend|wav|mp3|ogg|flac|mp4|mov|avi|mkv|webm|woff2?|ttf|otf|eot|db|sqlite|pdb|lib|a|o|class|jar|wasm)$/i;
export const MAX_TEXT = 2e6;
export const knownBinary = (name: string) => BINARY_EXT.test(name);
const MAX_ENTRIES = 10000;
export const ID = /^[a-z0-9]{1,24}$/;
export const HEX = /^#[0-9a-f]{6}$/i;
const META = `${DOT}/meta.json`;
const SCRATCH = `${DOT}/scratch.json`;
const SCRATCH_TEXT = `${DOT}/scratch.md`;
const HIDE = `${DOT}/hide.json`;
const UE_HIDE = ['Intermediate', 'Binaries', 'Saved', 'DerivedDataCache', '.vs'];

export const kindOf = (name: string) => (TEXT_EXT.test(name) ? 'code' : BOARD_EXT.test(name) ? 'board' : 'file');
export const titleOf = (name: string) => name.replace(BOARD_EXT, '');

export const newId = () => Math.random().toString(36).slice(2, 10);
const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1);
const parentOf = (rel: string) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const extOf = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i) : '';
};
const utf8 = new TextDecoder();

function limiter(n: number) {
  let busy = 0;
  const wait: (() => void)[] = [];
  return async <T>(f: () => Promise<T>): Promise<T> => {
    if (busy < n) busy++;
    else await new Promise<void>((r) => wait.push(r));
    try {
      return await f();
    } finally {
      const w = wait.shift();
      if (w) w();
      else busy--;
    }
  };
}

type CachedFile = { title: string; kind: FileInfo['kind']; size: number; mtime: number };
type CachedDir = { list?: DiskEntry[]; dirs: Map<string, CachedDir>; files: Map<string, CachedFile> };
const HOLD = 2000, MAX_HOLDS = 200;
function treeCache(caseless: boolean) {
  const empty = (): CachedDir => ({ dirs: new Map(), files: new Map() });
  const key = (rel: string) => (caseless ? rel.toLowerCase() : rel);
  const holds = new Map<string, number>();
  let on = false, root = empty(), all = 0;
  const dirAt = (rel: string, make: boolean): CachedDir | null => {
    let d = root;
    if (rel)
      for (const n of key(rel).split('/')) {
        let k = d.dirs.get(n);
        if (!k) {
          if (!make) return null;
          d.dirs.set(n, (k = empty()));
        }
        d = k;
      }
    return d;
  };
  const held = (rel: string, listing: boolean) => {
    const now = Date.now(), k = key(rel);
    let hit = now - all < HOLD;
    for (const [h, at] of holds)
      if (now - at >= HOLD) holds.delete(h);
      else hit ||= h === k || k.startsWith(h + '/') || (listing && (!k || h.startsWith(k + '/')));
    return hit;
  };
  function changed(rel: string | null) {
    const now = Date.now();
    if (!rel) {
      root = empty();
      all = now;
      holds.clear();
      return;
    }
    if (holds.size >= MAX_HOLDS) {
      holds.clear();
      all = now;
    }
    const parts = key(rel).split('/');
    holds.set(parts.join('/'), now);
    let d: CachedDir | undefined = root;
    for (let i = 0; d && i < parts.length; i++) {
      d.list = undefined;
      if (i < parts.length - 1) d = d.dirs.get(parts[i]);
      else {
        d.dirs.delete(parts[i]);
        d.files.delete(parts[i]);
      }
    }
  }
  return {
    get on() {
      return on;
    },
    start: () => void (on = true),
    stop() {
      on = false;
      root = empty();
    },
    forget: () => void (root = empty()),
    changed,
    listed: (rel: string) => (on ? dirAt(rel, false)?.list : undefined),
    known: (rel: string) => (on ? dirAt(parentOf(rel), false)?.files.get(key(baseName(rel))) : undefined),
    async list(rel: string, read: () => Promise<DiskEntry[]>): Promise<DiskEntry[]> {
      if (!on) return read();
      const got = dirAt(rel, false)?.list;
      if (got) return got;
      const list = await read();
      if (on && !held(rel, true)) dirAt(rel, true)!.list = list;
      return list;
    },
    async file(rel: string, read: () => Promise<CachedFile>): Promise<CachedFile> {
      if (!on) return read();
      const name = key(baseName(rel)), dir = parentOf(rel);
      const got = dirAt(dir, false)?.files.get(name);
      if (got) return got;
      const info = await read();
      if (on && !held(rel, false)) dirAt(dir, true)!.files.set(name, info);
      return info;
    },
  };
}

export function cleanName(s: unknown, dot = false) {
  let n = String(s || '')
    .replace(/[?*"<>|\x00-\x1f]/g, '')
    .replace(/\s*[:/\\]\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, dot ? '.' : '')
    .replace(/[. ]+$/, '')
    .slice(0, 80);
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(n)) n = '_' + n;
  return n;
}
function fileName(s: unknown) {
  const n = cleanName(s, true);
  if (HIDDEN.has(n.toLowerCase())) throw new HttpError(400, `${n} is kept by the app itself`);
  return n;
}

function cleanPins(list: unknown) {
  const out: PinLike[] = [], name = (v: unknown) => String(v ?? '').slice(0, 200);
  for (const p of Array.isArray(list) ? list : []) {
    const pin: PinLike | null = p?.kind === 'file' && typeof p.path === 'string' && p.path ? { kind: 'file', path: p.path }
      : p?.kind === 'chat' && typeof p.session === 'string' && p.session ? { kind: 'chat', session: p.session, program: p.program === 'codex' || p.program === 'antigravity' || p.program === 'cursor' || p.program === 'copilot' || p.program === 'grok' ? p.program : 'claude', title: name(p.title) }
      : p?.kind === 'term' && typeof p.id === 'string' && p.id ? { kind: 'term', id: p.id, title: name(p.title) }
      : null;
    if (pin && !out.some((o) => o.kind === pin.kind && (o.path ?? o.session ?? o.id) === (pin.path ?? pin.session ?? pin.id))) out.push(pin);
  }
  return out.slice(0, 200);
}


function cleanUe(o: any) {
  const out: Record<string, string> = {};
  for (const k of ['target', 'config', 'uproject', 'engine']) {
    const v = typeof o?.[k] === 'string' ? o[k].trim().slice(0, 400) : '';
    if (v) out[k] = v;
  }
  return out;
}

function cleanMarks(o: unknown) {
  const out: Record<string, number> = {};
  for (const [session, n] of Object.entries<any>(o && typeof o === 'object' ? o : {})) if (session && [1, 2, 3, 4, 5, 6].includes(n)) out[session] = n;
  return out;
}

function cleanForget(list: unknown) {
  const out: ForgetItem[] = [], when = (v: number) => (Number.isFinite(v) && v > 0 ? Math.round(v) : null);
  for (const n of Array.isArray(list) ? list : []) {
    const id = String(n?.id || ''), text = String(n?.text ?? '').slice(0, 4000);
    if (!ID.test(id) || !text.trim() || out.some((o) => o.id === id)) continue;
    out.push({ id, text, level: ['soon', 'urgent'].includes(n.level) ? n.level : 'general', due: when(n.due), span: when(n.span), done: when(n.done), every: n.every === true, at: Number.isInteger(n.at) && n.at >= 0 && n.at < 1440 ? n.at : null });
  }
  return out.slice(-300);
}
function cleanForgetList(o: any) {
  const at = [...new Set<number>((Array.isArray(o?.at) ? o.at : []).filter((m: number) => Number.isInteger(m) && m >= 0 && m < 1440))].sort((a, b) => a - b).slice(0, 96);
  return { on: o?.on !== false, at: at.length ? at : [720] };
}

export function guard(rel = '') {
  if (typeof rel !== 'string') throw new HttpError(400, 'path required');
  if (/^([\\/]|[a-z]:)/i.test(rel)) throw new HttpError(400, 'path outside root');
  const out: string[] = [];
  for (const s of rel.split(/[\\/]/)) {
    if (!s || s === '.') continue;
    if (s !== '..') out.push(s);
    else if (!out.pop()) throw new HttpError(400, 'path outside root');
  }
  if (out[0]?.toLowerCase() === DOT && out[1]?.toLowerCase() === 'agents.json') throw new HttpError(400, 'hidden path');
  return out.join('/');
}

function charSet(line: string, i: number): [string, number] | null {
  let j = i + 1, out = '';
  const not = line[j] === '!' || line[j] === '^';
  if (not) j++;
  for (const first = j; j < line.length; j++) {
    if (line[j] === ']' && j > first) return [`[${not ? '^/' : ''}${out}]`, j];
    const esc = line[j] === '\\' && j + 1 < line.length;
    const c = esc ? line[++j] : line[j];
    out += (esc ? /[\\\]^[-]/ : /[\\\]^[]/).test(c) ? '\\' + c : c;
  }
  return null;
}

function gitignore(text: string | null, caseless: boolean) {
  const rules: { neg: boolean; dirOnly: boolean; re: RegExp }[] = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    const neg = line.startsWith('!');
    if (neg) line = line.slice(1);
    const dirOnly = line.endsWith('/');
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);
    let re = '', set;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '*' && line[i + 1] === '*') {
        re += '.*';
        i += line[i + 2] === '/' ? 2 : 1;
      } else if (ch === '*') re += '[^/]*';
      else if (ch === '?') re += '[^/]';
      else if (ch === '[' && (set = charSet(line, i))) {
        re += set[0];
        i = set[1];
      } else re += (ch === '\\' && i + 1 < line.length ? line[++i] : ch).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (re) rules.push({ neg, dirOnly, re: new RegExp((anchored ? '^' : '(^|/)') + re + '$', caseless ? 'i' : '') });
  }
  return (rel: string, isDir?: boolean) => {
    let out = false;
    for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(rel)) out = !r.neg;
    return out;
  };
}

const META_KEYS = ['pin', 'ring', 'seen', 'color', 'mark'];
const STYLE_OK: Record<string, (v: unknown) => boolean> = { color: (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v), mark: (v) => [1, 2, 3, 4, 5, 6].includes(v as number) };
const pickMeta = (m: Record<string, any> = {}) =>
  Object.fromEntries(
    Object.entries(m)
      .filter(([k, v]) => META_KEYS.includes(k) && (!STYLE_OK[k] || v === null || STYLE_OK[k](v)))
      .map(([k, v]) => [k, k === 'color' && v ? v.toLowerCase() : v]),
  );

export function openRoot(disk: Disk, saved: string | null, store: ArchiveStore) {
  const same = (a: string, b: string) => (disk.caseless ? a.toLowerCase() === b.toLowerCase() : a === b);
  const isDir = async (rel: string) => !!(await disk.stat(rel))?.dir;
  const tree = treeCache(disk.caseless), raw = disk;
  const wrote = <T>(f: () => Promise<T>, ...rels: string[]): Promise<T> => {
    rels.forEach((r) => tree.changed(r));
    return f().finally(() => rels.forEach((r) => tree.changed(r)));
  };
  disk = {
    ...raw,
    write: (rel, text, opts) => wrote(() => raw.write(rel, text, opts), rel),
    mkdir: (rel) => wrote(() => raw.mkdir(rel), rel),
    move: (rel, dest) => wrote(() => raw.move(rel, dest), rel, dest),
    remove: (rel) => wrote(() => raw.remove(rel), rel),
  };
  const kept = store;
  store = { ...kept, take: (rel, dest) => wrote(() => kept.take(rel, dest), rel), give: (rel, dest) => wrote(() => kept.give(rel, dest), dest) };

  function parseMeta(text: string | null): RootMeta {
    const m: any = { files: {}, dirs: {}, layout: {}, order: [], ...(text == null ? {} : JSON.parse(text)) };
    if (!m.v) {
      for (const f of Object.values<any>(m.files)) if (f.color === '#7fd962') delete f.color;
      m.v = 2;
    }
    if (m.v < 3) {
      const L = m.layout;
      if (L['#core'] && !L['#inbox:main']) L['#inbox:main'] = L['#core'];
      delete L['#core'];
      for (const k of Object.keys(L))
        if (k === '#mind' || k.startsWith('#mind:')) {
          L['#core' + k.slice(5)] = L[k];
          delete L[k];
        }
      delete m.grid;
      m.v = 3;
    }
    if (m.v < 4) {
      for (const x of [...Object.values<any>(m.files), ...Object.values<any>(m.dirs)]) {
        delete x.node;
        delete x.size;
      }
      m.v = 4;
    }
    if (m.v < 5) {
      const archive = Array.isArray(m.archive) ? m.archive : [];
      for (const files of [m.files, ...archive.map((a: any) => a?.meta?.files)])
        for (const f of Object.values<any>(files || {})) if (f && typeof f === 'object') for (const k of ['category', 'color', 'done', 'tags']) delete f[k];
      for (const dirs of [m.dirs, ...archive.map((a: any) => a?.meta?.dirs)]) for (const d of Object.values<any>(dirs || {})) if (d && typeof d === 'object') delete d.category;
      const stuck = [...(Array.isArray(m.stickies) ? m.stickies : []), ...archive.filter((a: any) => a?.type === 'sticky').map((a: any) => a.sticky)];
      if (text != null) moved = stuck.map((s) => String(s?.text ?? '').trim()).filter(Boolean);
      delete m.stickies;
      if (Array.isArray(m.archive)) m.archive = archive.filter((a: any) => a?.type !== 'sticky');
      m.v = 5;
    }
    if (m.v < 6) {
      const archive = Array.isArray(m.archive) ? m.archive : [];
      for (const files of [m.files, ...archive.map((a: any) => a?.meta?.files)]) for (const f of Object.values<any>(files || {})) if (f && typeof f === 'object') delete f.desc;
      for (const dirs of [m.dirs, ...archive.map((a: any) => a?.meta?.dirs)]) for (const d of Object.values<any>(dirs || {})) if (d && typeof d === 'object') for (const k of ['color', 'desc', 'inboxColor']) delete d[k];
      m.v = 6;
    }
    return m;
  }
  let meta: RootMeta, broken: string | null = null, moved: string[] | null = null;
  function load(text: string | null) {
    try {
      meta = parseMeta(text);
      broken = null;
    } catch (e) {
      meta ??= parseMeta(null);
      broken = (e as Error).message;
    }
  }
  load(saved);
  disk.remove(`${DOT}/prio.json`).catch(() => {});
  const unsaved = () => new HttpError(409, `${META} doesn't parse (${broken}): fix it and try again`);

  let metaWrite: Promise<unknown> = Promise.resolve(), writing = 0, known: number | null | undefined, checking: Promise<void> | null = null;
  function saveMeta() {
    if (broken) return Promise.reject(unsaved());
    const json = JSON.stringify(meta, null, 1);
    const add = moved?.join('\n\n');
    moved = null;
    writing++;
    const w = metaWrite
      .then(async () => {
        if (!add) return;
        try {
          const was = (await disk.read(SCRATCH_TEXT)) ?? '';
          await disk.write(SCRATCH_TEXT, was.trim() ? `${was.replace(/\s+$/, '')}\n\n${add}\n` : `${add}\n`, { atomic: true });
        } catch (e) {
          moved = [add, ...(moved || [])];
          throw e;
        }
      })
      .then(() => disk.write(META, json, { atomic: true }))
      .then(() => disk.stat(META))
      .then((s) => (known = s?.mtime))
      .finally(() => writing--);
    metaWrite = w.catch(() => {});
    return w.catch((e) => {
      throw new Error(`could not save ${META}: ` + (e as Error).message);
    });
  }

  function fresh() {
    return (checking ||= (async () => {
      if (moved && !broken) await saveMeta();
      if (writing) return;
      const mtime = (await disk.stat(META))?.mtime ?? null;
      if (mtime === known || writing) return;
      if ((known !== undefined || broken) && mtime !== null) {
        const text = await disk.read(META);
        if (writing) return;
        load(text);
      }
      known = mtime;
      if (moved && !broken) await saveMeta();
    })()
      .catch(() => {})
      .finally(() => (checking = null)));
  }

  function remap(from: string, to: string | null) {
    for (const key of ['files', 'dirs', 'layout']) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(meta[key])) {
        if (k === from || k.startsWith(from + '/')) {
          if (to !== null) out[to + k.slice(from.length)] = v;
        } else out[k] = v;
      }
      meta[key] = out;
    }
    const i = meta.order.indexOf(from);
    if (i >= 0) {
      if (to && !to.includes('/')) meta.order[i] = to;
      else meta.order.splice(i, 1);
    }
    meta.pins = cleanPins(meta.pins).flatMap((p) => (p.kind !== 'file' || (p.path !== from && !p.path.startsWith(from + '/')) ? [p] : to === null ? [] : [{ ...p, path: to + p.path.slice(from.length) }]));
  }

  async function uniquePath(dir: string, base: string, ext: string, self?: string | null, on: { stat(rel: string): Promise<unknown> } = disk) {
    for (let i = 1; ; i++) {
      const p = join(dir, (i === 1 ? base : `${base} (${i})`) + ext);
      if ((self && same(p, self)) || !(await on.stat(p))) return p;
    }
  }

  const head = async (rel: string, n = 600) => utf8.decode(await disk.bytes(rel, n));

  async function textOf(rel: string, size: number) {
    let raw;
    try {
      raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await disk.bytes(rel, size));
    } catch {
      throw new HttpError(415, 'not saved as UTF-8: Amethyst does not open it, saving would rewrite its letters');
    }
    const bom = raw.startsWith('﻿'), text = bom ? raw.slice(1) : raw;
    const crlf = (text.match(/\r\n/g) || []).length;
    return { text: text.replace(/\r\n/g, '\n'), bom, crlf: crlf > 0 && crlf >= (text.match(/\n/g) || []).length - crlf };
  }

  async function isText(rel: string, size: number) {
    const name = baseName(rel);
    if (CODE_EXT.test(name) || /^(dockerfile|makefile|license|readme|changelog)$/i.test(name)) return size <= MAX_TEXT;
    if (BINARY_EXT.test(name) || size > MAX_TEXT) return false;
    if (!size) return true;
    return !(await disk.bytes(rel, 4096)).includes(0);
  }

  let ignoreRule: { at: number; test: (rel: string, dir?: boolean) => boolean } = { at: -1, test: () => false }, hideRule: { at: number; test: (rel: string, dir?: boolean) => boolean; shown: Set<string> } = { at: -1, test: () => false, shown: new Set() }, seeded = false;
  const cleanHide = (l: unknown): string[] => (Array.isArray(l) ? l : []).map((n) => String(n).trim()).filter((n) => n && n.length <= 200 && !/[\r\n]/.test(n)).slice(0, 200);
  async function hideList() {
    try {
      return cleanHide(JSON.parse((await disk.read(HIDE)) ?? '[]'));
    } catch {
      return [];
    }
  }
  let rules: { at: number; p: Promise<Ignored> } | null = null;
  const ignores = () => (rules && Date.now() - rules.at < 300 ? rules : (rules = { at: Date.now(), p: readRules() })).p;
  function rulesChanged() {
    tree.forget();
    ignoreRule.at = hideRule.at = -1;
    rules = null;
    return ignores().catch(() => {});
  }
  async function readRules(): Promise<Ignored> {
    const at = (await disk.stat('.gitignore'))?.mtime || 0;
    if (at !== ignoreRule.at) ignoreRule = { at, test: at ? gitignore(await disk.read('.gitignore'), disk.caseless) : () => false };
    let hat = (await disk.stat(HIDE))?.mtime || 0;
    if (!hat && !seeded) {
      seeded = true;
      if ((await disk.list('')).some((e) => e.file && /\.uproject$/i.test(e.name))) {
        await disk.write(HIDE, JSON.stringify(UE_HIDE, null, 2) + '\n', { atomic: true });
        hat = (await disk.stat(HIDE))?.mtime || 0;
      }
    }
    if (hat !== hideRule.at) {
      const list = hat ? await hideList() : [];
      hideRule = { at: hat, test: hat ? gitignore(list.join('\n'), disk.caseless) : () => false, shown: new Set(list.filter((n) => n.startsWith('!')).map((n) => n.slice(1).replace(/^\/|\/$/g, '').toLowerCase())) };
    }
    const test = (rel: string, dir: boolean) => ignoreRule.test(rel, dir) || hideRule.test(rel, dir);
    test.listed = hideRule.test;
    test.shown = hideRule.shown;
    test.ignored = ignoreRule.test;
    return test;
  }
  const leftOut = (name: string, rel: string, dir: boolean, ignored: Ignored) => {
    const low = name.toLowerCase();
    return IGNORE.has(name) || (BUILT_IN.has(low) ? !ignored.shown.has(low) : ignored(rel, dir));
  };
  const hiddenTop = (rel: string) => {
    const top = rel.split('/')[0].toLowerCase();
    return BUILT_IN.has(top) && !hideRule.shown.has(top);
  };
  const listed = async (rel: string) => (await disk.list(rel)).sort((a, b) => a.name.localeCompare(b.name));

  const slots = limiter(8);
  const listing = (rel: string) => tree.list(rel, () => slots(() => listed(rel)));
  const quiet = <T>(p: Promise<T>) => (p.catch(() => {}), p);

  async function scan(rel: string): Promise<TreeNode> {
    const ignored = await ignores(), budget = { left: MAX_ENTRIES, hidden: 0, cut: false };
    const jobs: Promise<unknown>[] = [], ahead = new Map<string, Promise<DiskEntry[]>>();
    const walk = async (rel: string): Promise<TreeNode> => {
      const node: TreeNode = { path: rel, name: baseName(rel), dirs: [], files: [] };
      const list = tree.listed(rel) ?? (await (ahead.get(rel) ?? listing(rel)));
      for (const e of list) {
        const r = join(rel, e.name);
        if (e.dir && budget.left > 0 && !ahead.has(r) && !leftOut(e.name, r, true, ignored)) ahead.set(r, quiet(listing(r)));
      }
      for (const e of list) {
        const r = join(rel, e.name);
        if (leftOut(e.name, r, e.dir, ignored)) {
          if (ignored.listed(r, e.dir)) budget.hidden++;
          continue;
        }
        if (budget.left-- <= 0) {
          budget.cut = true;
          break;
        }
        if (e.dir) node.dirs.push(await walk(r));
        else if (e.file) {
          const c = tree.known(r);
          if (c) {
            node.files.push(infoOf(r, e.name, c));
            continue;
          }
          const f = {} as FileInfo;
          node.files.push(f);
          jobs.push(quiet(fileInfo(r).then((i) => Object.assign(f, i))));
        }
      }
      return node;
    };
    const node = await walk(rel);
    await Promise.all(jobs);
    if (!rel && budget.cut) node.cut = MAX_ENTRIES;
    if (!rel && budget.hidden) node.hidden = budget.hidden;
    return node;
  }

  async function fileInfo(rel: string): Promise<FileInfo> {
    const name = baseName(rel);
    const c = await tree.file(rel, () =>
      slots(async () => {
        const st = (await disk.stat(rel))!;
        const c: CachedFile = { title: titleOf(name), kind: kindOf(name), size: st.size, mtime: st.mtime };
        if (c.kind === 'file' && (await isText(rel, st.size).catch(() => false))) c.kind = 'code';
        if (c.kind === 'board' && !(await head(rel).catch(() => 'data-mind="board"')).includes('data-mind="board"')) Object.assign(c, { kind: 'code', title: name });
        return c;
      }),
    );
    return infoOf(rel, name, c);
  }
  const infoOf = (rel: string, name: string, c: CachedFile): FileInfo => ({ path: rel, name, title: c.title, kind: c.kind, size: c.size, mtime: c.mtime, meta: meta.files[rel] || {} });

  async function skips(rel: string) {
    const ignored = await ignores(), parts = rel.split('/');
    const out = (dir: boolean) => parts.some((name, i) => leftOut(name, parts.slice(0, i + 1).join('/'), dir || i < parts.length - 1, ignored));
    return out(false) || (out(true) && !!(await disk.stat(rel))?.dir);
  }

  async function* walkFiles(rel: string, ignored: Ignored | null = null): AsyncGenerator<string> {
    ignored ??= await ignores();
    for (const e of await disk.list(rel)) {
      const r = join(rel, e.name);
      if (leftOut(e.name, r, e.dir, ignored)) continue;
      if (e.dir) yield* walkFiles(r, ignored);
      else if (e.file) yield r;
    }
  }

  const MAX_INDEX = 64e6, MAX_DIRTY = 1000;
  const index: { on: boolean; files: Map<string, string | false | null> | null; kept: number; dirty: Set<string>; waiting: Set<Promise<unknown>>; all: boolean; syncing: Promise<void> | null } = { on: false, files: null, kept: 0, dirty: new Set(), waiting: new Set(), all: true, syncing: null };
  const searched = (rel: string) => TEXT_EXT.test(rel) || CODE_EXT.test(rel);
  async function searchText(rel: string, room = Infinity): Promise<string | false | null> {
    if (!searched(rel)) return false;
    const st = await disk.stat(rel);
    if (!st || st.size > MAX_TEXT) return false;
    if (st.size > room) return null;
    return (await disk.read(rel))?.toLowerCase() ?? false;
  }
  async function keep(rel: string) {
    const t: string | false | null = await searchText(rel, MAX_INDEX - index.kept).catch(() => false);
    index.files!.set(rel, t);
    if (t) index.kept += t.length;
  }
  async function redo(rel: string) {
    for (const [r, t] of index.files!)
      if (same(r, rel) || (disk.caseless ? r.toLowerCase().startsWith(rel.toLowerCase() + '/') : r.startsWith(rel + '/'))) {
        index.files!.delete(r);
        if (t) index.kept -= t.length;
      }
    const st = await disk.stat(rel);
    if (!st || (await skips(rel))) return;
    if (st.dir) for await (const r of walkFiles(rel)) await keep(r);
    else await keep(rel);
  }
  function sync() {
    return (index.syncing ||= (async () => {
      while (index.waiting.size) await Promise.all(index.waiting);
      while (index.all || index.dirty.size) {
        if (index.all) {
          Object.assign(index, { all: false, files: new Map(), kept: 0 });
          index.dirty.clear();
          for await (const r of walkFiles('')) await keep(r);
          continue;
        }
        const list = [...index.dirty];
        index.dirty.clear();
        for (const r of list) await redo(r);
      }
    })()
      .catch((e) => {
        index.all = true;
        throw e;
      })
      .finally(() => {
        index.syncing = null;
        if (!index.on) drop();
      }));
  }
  const drop = () => index.syncing || Object.assign(index, { files: null, kept: 0 });
  const search = {
    start: () => (index.on = true),
    stop() {
      Object.assign(index, { on: false, all: true });
      index.dirty.clear();
      drop();
    },
    touched(rel: string | null, skip?: Promise<boolean>) {
      if (!index.on) return;
      if (rel == null || same(rel, '.gitignore') || same(rel, HIDE)) return void (index.all = true);
      const p = (skip ?? skips(rel))
        .then((skip) => skip || (index.dirty.size >= MAX_DIRTY ? (index.all = true) : index.dirty.add(rel)), () => {})
        .finally(() => index.waiting.delete(p));
      index.waiting.add(p);
    },
    async query(needle: string, inText?: string[]) {
      const paths: string[] = [];
      const hit = async (rel: string, t: string | false | null) => {
        const named = rel.toLowerCase().includes(needle);
        if (named && !inText) return true;
        if (t === null) t = await searchText(rel).catch(() => false);
        const said = !!t && t.includes(needle);
        if (said) inText?.push(rel);
        return named || said;
      };
      if (index.on && (await sync().then(() => index.on, () => false))) {
        for (const [rel, t] of index.files!) if (await hit(rel, t)) paths.push(rel);
      } else for await (const rel of walkFiles('')) if (await hit(rel, null)) paths.push(rel);
      return paths;
    },
  };

  const MAX_LINE_FILES = 40, LINES_PER_FILE = 3;
  const clipLine = (l: string, at: number, len: number) => {
    const lead = l.length - l.trimStart().length;
    const from = at - lead > 50 ? at - 40 : lead;
    const to = Math.min(l.length, Math.max(from + 120, at + len + 20));
    const cut = from > lead ? 1 : 0;
    return { text: (cut ? '…' : '') + l.slice(from, to).trimEnd() + (to < l.length ? '…' : ''), at: at - from + cut };
  };
  async function linesOf(rel: string, needle: string) {
    const text = await disk.read(rel).catch(() => null);
    if (!text) return null;
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const lines: { line: number; text: string; at: number }[] = [];
    let more = 0, next = 0, n = 0;
    for (const l of text.split(/\r?\n/)) {
      n++;
      const m = re.exec(l);
      if (!m) continue;
      if (lines.length < LINES_PER_FILE) lines.push({ line: n, ...clipLine(l, m.index, m[0].length) });
      else if (!more++) next = n;
    }
    return lines.length ? { path: rel, lines, more, next } : null;
  }

  const fileEntry = (a: ArchiveEntry) => typeof a.name === 'string' && !/[\\/]/.test(a.name) && !a.name.startsWith('.');
  const archiveList = (): ArchiveEntry[] => (Array.isArray(meta.archive) ? meta.archive.filter((a) => a && ID.test(a.id) && a.type !== 'sticky' && fileEntry(a)) : []);
  const archivedPath = (a: ArchiveEntry) => `${a.type === 'folder' ? 'folders' : 'thoughts'}/${a.name}`;

  async function countFiles(dir: string): Promise<number> {
    let n = 0;
    for (const e of await store.list(dir)) {
      if (HIDDEN.has(e.name) || IGNORE.has(e.name)) continue;
      if (e.dir) n += await countFiles(join(dir, e.name));
      else if (e.file) n++;
    }
    return n;
  }

  async function relocate(from: string, dest: string) {
    await disk.move(from, dest);
    remap(from, dest);
    await saveMeta();
    return { path: dest, title: titleOf(baseName(dest)) };
  }

  const ROUTES: Record<string, (...a: any[]) => any> = {
    'GET /api/tree': async () => ({ root: await scan(''), order: meta.order, layout: meta.layout, dirs: meta.dirs, pins: cleanPins(meta.pins), marks: cleanMarks(meta.marks) }),

    'PUT /api/pins': async ({ pins }) => {
      if (!Array.isArray(pins)) throw new HttpError(400, 'pins must be a list');
      meta.pins = cleanPins(pins);
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/marks': async ({ marks }) => {
      if (!marks || typeof marks !== 'object' || Array.isArray(marks)) throw new HttpError(400, 'marks must be an object');
      meta.marks = cleanMarks(marks);
      await saveMeta();
      return { ok: true };
    },

    'GET /api/hidden': async () => {
      const hidden = await hideList(), ignored = await ignores();
      const named = new Set(hidden.filter((n) => !n.startsWith('!')).map((n) => n.replace(/^\/|\/$/g, '').toLowerCase()));
      const names = new Set([...BUILT_IN, ...(await disk.list('')).filter((e) => e.dir).map((e) => e.name)]);
      const folders = [...names].sort((a, b) => a.localeCompare(b)).map((name) => {
        const built = BUILT_IN.has(name.toLowerCase()), out = leftOut(name, name, true, ignored);
        return { name, built, hidden: out, flip: built || (!ignored.ignored(name, true) && (!out || named.has(name.toLowerCase()))) };
      });
      return { hidden, folders };
    },

    'PUT /api/hidden': async ({ hidden }) => {
      if (!Array.isArray(hidden)) throw new HttpError(400, 'hidden must be a list');
      await disk.write(HIDE, JSON.stringify(cleanHide(hidden), null, 2) + '\n', { atomic: true });
      await rulesChanged();
      return { ok: true };
    },

    'GET /api/ue': async () => ({ ue: cleanUe(meta.ue) }),

    'PUT /api/ue': async ({ ue }) => {
      if (!ue || typeof ue !== 'object' || Array.isArray(ue)) throw new HttpError(400, 'ue must be an object');
      meta.ue = cleanUe(ue);
      if (!Object.keys(meta.ue).length) delete meta.ue;
      await saveMeta();
      return { ok: true };
    },

    'GET /api/forget': async () => ({ items: cleanForget(meta.forget), list: cleanForgetList(meta.forgetList) }),

    'PUT /api/forget-list': async (list) => {
      if (!list || typeof list !== 'object') throw new HttpError(400, 'list must be an object');
      meta.forgetList = cleanForgetList(list);
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/forget': async ({ items }) => {
      if (!Array.isArray(items)) throw new HttpError(400, 'items must be a list');
      meta.forget = cleanForget(items);
      await saveMeta();
      return { ok: true };
    },

    'GET /api/file': async (_, q) => {
      const rel = q.get('path');
      const r = guard(rel);
      const st = await disk.stat(r);
      if (!st || st.dir) throw new HttpError(404, 'no such file');
      if (kindOf(r) === 'file' && !(await isText(r, st.size))) throw new HttpError(415, 'not a text file: Amethyst lists it but does not open it');
      return { path: rel, content: (await textOf(r, st.size)).text, mtime: st.mtime };
    },

    'PUT /api/file': async ({ path: rel, content, mtime }) => {
      const r = guard(rel);
      const st = r && (await disk.stat(r));
      if (!st || st.dir) throw new HttpError(404, 'no such file');
      if (Number.isFinite(mtime) && Math.abs(st.mtime - mtime) >= 2) throw new HttpError(409, 'changed on disk');
      if (kindOf(r) === 'file' && !(await isText(r, st.size))) throw new HttpError(415, 'not a text file: it can not be saved from Amethyst');
      const old = await textOf(r, st.size);
      const text = old.crlf ? String(content ?? '').replace(/\r?\n/g, '\r\n') : String(content ?? '');
      await disk.write(r, (old.bom ? '﻿' : '') + text);
      return { ok: true, mtime: (await disk.stat(r))!.mtime };
    },

    'POST /api/file': async ({ dir = '', title, name, content = '', kind, meta: m }) => {
      const d = guard(dir);
      await disk.mkdir(d).catch(() => {});
      if (!(await isDir(d))) throw new HttpError(404, 'no such folder');
      const whole = name != null && fileName(name), ext = whole ? extOf(whole) : kind === 'board' ? '.svg' : '.md';
      const rel = await uniquePath(d, (whole ? whole.slice(0, whole.length - ext.length) : cleanName(title)) || 'untitled', ext);
      await disk.write(rel, String(content), { fresh: true });
      meta.files[rel] = { ...pickMeta(m), created: Date.now() };
      await saveMeta();
      return { path: rel, title: titleOf(baseName(rel)), mtime: (await disk.stat(rel))!.mtime };
    },

    'POST /api/move': async ({ from, toDir = '' }) => {
      if (!from) throw new HttpError(400, 'from required');
      const src = guard(from);
      const dir = guard(toDir);
      const srcIsDir = await isDir(src);
      if (srcIsDir && (same(dir, src) || dir.toLowerCase().startsWith(src.toLowerCase() + '/'))) throw new HttpError(400, 'cannot move a folder into itself');
      await disk.mkdir(dir).catch(() => {});
      if (!(await isDir(dir))) throw new HttpError(404, 'no such folder');
      let r;
      if (same(parentOf(src), dir)) r = { path: from, title: titleOf(baseName(src)) };
      else {
        const name = baseName(src);
        const ext = srcIsDir ? '' : extOf(name);
        r = await relocate(src, await uniquePath(dir, name.slice(0, name.length - ext.length), ext));
      }
      await saveMeta();
      return r;
    },

    'POST /api/rename': async ({ path: rel, name, whole }) => {
      if (!rel) throw new HttpError(400, 'path required');
      const src = guard(rel);
      let base = (whole ? fileName(name) : cleanName(name)) || 'untitled';
      const ext = (await isDir(src)) ? '' : whole ? extOf(base) : extOf(baseName(src));
      if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) base = base.slice(0, -ext.length);
      const dest = await uniquePath(parentOf(src), base, ext, src);
      if (dest === src) return { path: rel, title: titleOf(baseName(src)) };
      return relocate(src, dest);
    },

    'POST /api/dir': async ({ path: rel }) => {
      const clean = String(rel || '').split('/').map(fileName).filter(Boolean).join('/');
      if (!clean) throw new HttpError(400, 'name required');
      await disk.mkdir(guard(clean));
      return { path: clean };
    },

    'GET /api/archive': async () => {
      const items = await Promise.all(
        archiveList().map(async (a) => {
          const parent = a.from ? parentOf(a.from) : '';
          const home = parent && (await isDir(parent)) ? parent : '';
          const p = archivedPath(a);
          let preview = '', count = 0;
          try {
            if (a.type === 'folder') count = await countFiles(p);
            else if (TEXT_EXT.test(a.name)) preview = ((await store.read(p)) ?? '').slice(0, 300);
          } catch {}
          return { id: a.id, type: a.type, title: a.title, from: a.from, at: a.at, back: home, known: !!a.from, lost: !!a.from && !!parent && !home, preview, count, board: BOARD_EXT.test(a.name) };
        }),
      );
      return { items };
    },

    'POST /api/archive': async ({ path: rel }) => {
      if (!rel) throw new HttpError(400, 'path required');
      const src = guard(rel);
      const st = await disk.stat(src);
      if (!st) throw new HttpError(404, 'not there');
      const dir = st.dir ? 'folders' : 'thoughts';
      await store.mkdir(dir);
      const name = baseName(src);
      const ext = st.dir ? '' : extOf(name);
      const dest = await uniquePath(dir, name.slice(0, name.length - ext.length), ext, null, store);
      const { left } = (await store.take(src, dest)) ?? {};
      const kept: Record<string, Record<string, unknown>> = {};
      for (const key of ['files', 'dirs', 'layout']) {
        kept[key] = {};
        for (const [k, v] of Object.entries(meta[key])) if (k === src || k.startsWith(src + '/')) kept[key][k.slice(src.length)] = v;
      }
      const order = meta.order.indexOf(src);
      remap(src, null);
      meta.archive = archiveList();
      const id = newId();
      meta.archive.unshift({ id, type: st.dir ? 'folder' : 'thought', title: titleOf(name), name: baseName(dest), from: src, at: Date.now(), meta: kept, order: order >= 0 ? order : undefined });
      await saveMeta();
      return { ok: true, id, left };
    },

    'POST /api/restore': async ({ id }) => {
      const a = archiveList().find((x) => x.id === id);
      if (!a) throw new HttpError(404, 'not in the archive');
      const src = archivedPath(a);
      if (!(await store.stat(src))) {
        meta.archive = archiveList().filter((x) => x !== a);
        await saveMeta();
        throw new HttpError(404, 'its file is gone from the archive');
      }
      let parent = parentOf(a.from || a.name);
      if (!parent || parent.split('/').some((s) => s.startsWith('.')) || !(await isDir(parent))) parent = '';
      const back = !!a.from && parentOf(a.from) === parent;
      const name = a.from ? baseName(a.from) : a.name;
      const ext = a.type === 'folder' ? '' : extOf(name);
      const to = await uniquePath(guard(parent), name.slice(0, name.length - ext.length), ext);
      const { left } = (await store.give(src, to)) ?? {};
      for (const key of ['files', 'dirs', 'layout']) for (const [k, v] of Object.entries(a.meta?.[key] || {})) meta[key][to + k] = v;
      const bag = a.type === 'folder' ? meta.dirs : meta.files;
      if (!back) {
        delete meta.layout[to];
        delete bag[to]?.pin;
      }
      if (!to.includes('/') && a.type === 'folder' && !meta.order.includes(to)) meta.order.splice(Math.min(a.order ?? Infinity, meta.order.length), 0, to);
      meta.archive = archiveList().filter((x) => x !== a);
      await saveMeta();
      return { path: to, back, left };
    },

    'POST /api/purge': async ({ id }) => {
      const a = archiveList().find((x) => x.id === id);
      if (!a) throw new HttpError(404, 'not in the archive');
      await store.remove(archivedPath(a));
      meta.archive = archiveList().filter((x) => x !== a);
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/meta': async ({ path: rel, kind = 'file', patch }) => {
      const r = guard(rel);
      const bag = kind === 'dir' ? meta.dirs : meta.files;
      bag[r] = { ...bag[r], ...pickMeta(patch) };
      for (const k of Object.keys(STYLE_OK)) if (bag[r][k] === null) delete bag[r][k];
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/layout': async ({ layout = {} }) => {
      for (const [k, v] of Object.entries<any>(layout)) {
        if (v === null) delete meta.layout[k];
        else if (v && Number.isFinite(v.x) && Number.isFinite(v.y)) meta.layout[k] = { x: Math.round(v.x), y: Math.round(v.y), ...(v.rel ? { rel: 1 } : {}) };
      }
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/ranks': async ({ paths }) => {
      if (!Array.isArray(paths)) throw new HttpError(400, 'paths must be a list');
      paths.slice(0, 2000).forEach((p, i) => {
        const r = guard(p);
        meta.files[r] = { ...meta.files[r], rank: i };
      });
      await saveMeta();
      return { ok: true };
    },

    'PUT /api/order': async ({ order }) => {
      if (!Array.isArray(order)) throw new HttpError(400, 'order must be a list');
      meta.order = order.map(String);
      await saveMeta();
      return { ok: true };
    },

    'GET /api/scratch': async (_, q) => {
      if (q.get('mode') === 'text') return { content: (await disk.read(SCRATCH_TEXT)) ?? '' };
      const content = (await disk.read(SCRATCH)) ?? '';
      let d: { items?: { type?: string; text?: unknown }[] } | null = null;
      try {
        d = JSON.parse(content);
      } catch {}
      const texts = Array.isArray(d?.items) ? d.items.filter((n) => n?.type === 'text') : [];
      if (!texts.length) return { content };
      const add = texts.map((n) => String(n.text ?? '').trim()).filter(Boolean).join('\n\n');
      const was = (await disk.read(SCRATCH_TEXT)) ?? '';
      if (add) await disk.write(SCRATCH_TEXT, was.trim() ? `${was.replace(/\s+$/, '')}\n\n${add}\n` : `${add}\n`, { atomic: true });
      d!.items = d!.items!.filter((n) => n?.type !== 'text');
      const next = JSON.stringify(d);
      await disk.write(SCRATCH, next, { atomic: true });
      return { content: next };
    },

    'PUT /api/scratch': async ({ content, mode }) => {
      await disk.write(mode === 'text' ? SCRATCH_TEXT : SCRATCH, String(content ?? ''), { atomic: true });
      return { ok: true };
    },

    'GET /api/search': async (_, q) => {
      const needle = String(q.get('q') || '').toLowerCase().trim();
      if (q.get('lines') !== '1') return { paths: needle ? await search.query(needle) : [] };
      if (!needle) return { paths: [], hits: [] };
      const inText: string[] = [];
      const paths = await search.query(needle, inText);
      const hits = [];
      for (const rel of inText.slice(0, MAX_LINE_FILES)) {
        const h = await linesOf(rel, needle);
        if (h) hits.push(h);
      }
      return { paths, hits };
    },

    'GET /api/entries': async (_, q) => {
      let paths;
      try {
        paths = JSON.parse(q.get('paths') || '[]');
      } catch {}
      if (!Array.isArray(paths) || paths.length > MAX_PATHS || !paths.every((p) => typeof p === 'string')) throw new HttpError(400, `paths must be a list of up to ${MAX_PATHS}`);
      const entries: { path: string; gone?: boolean; dir?: boolean; info?: FileInfo }[] = [];
      for (const p of paths) {
        let r;
        try {
          r = guard(p);
        } catch {
          entries.push({ path: p, gone: true });
          continue;
        }
        const st = await disk.stat(r);
        if (!st || (await skips(r))) entries.push({ path: r, gone: true });
        else if (st.dir) entries.push({ path: r, dir: true });
        else entries.push({ path: r, info: await fileInfo(r) });
      }
      return { entries, pins: cleanPins(meta.pins) };
    },
  };

  const NO_META = new Set(['PUT /api/file', 'POST /api/dir', 'PUT /api/scratch', 'PUT /api/hidden']);
  for (const [key, f] of Object.entries(ROUTES))
    if (!key.startsWith('GET ') && !NO_META.has(key))
      ROUTES[key] = async (...a) => {
        if (broken) throw unsaved();
        return f(...a);
      };

  return { ROUTES, disk, archivePlace: () => store.abs(''), walkFiles, skips, hiddenTop, rulesChanged, search, tree, saveMeta, fresh, get meta() { return meta; }, get broken() { return broken; } };
}
