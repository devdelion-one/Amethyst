import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { declarations } from '../../public/ue/check.ts';
import { members as readMembers } from '../../public/ue/members.ts';
import type { Cls, Member, Read as Parsed, Val } from '../../public/ue/members.ts';

const SKIP = new Set(['thirdparty', 'intermediate', 'binaries', 'saved', 'content', 'deriveddatacache', '.git', '.vs', 'node_modules']);
const HEADER = /\.(h|hpp|hh|hxx|inl)$/i;
const BUILD = /^(.+)\.Build\.cs$/i;
const TYPE_NAME = /^[UAFTEI][A-Z][A-Za-z0-9_]*$/;
const RESCAN = 1500;
const MODULE_DIR = /[\\/]([A-Za-z_]\w*)[\\/](?:Public|Private|Classes|Internal)[\\/]/;
const moduleMacro = (f: string) => {
  const m = MODULE_DIR.exec(f);
  return m ? m[1].toUpperCase() + '_API' : null;
};
const FORMAT = 4;

type Read = { types: [string, number, number?][]; macros: [string, number][]; classes: [string, number, string, number][] };
type List = { files: string[]; types: [string, number, number, number?][]; defs: [string, number, number][]; macros: string[]; modules: [string, string][]; classes: [string, number, string, number][] };
type Engine = { key: string; dir: string; version: string; state: 'none' | 'building' | 'ready' | 'failed'; done: number; total: number; built: number; error?: string; types?: Map<string, number>; macros?: Set<string>; buckets?: Map<string, string[]>; list?: List; at?: Map<string, number[]>; sorted?: string[]; cls?: Map<string, number>; mods?: Map<string, string>; wait?: Promise<void> };
type Proj = { root: string; files: Map<string, { mtime: number; read: Read }>; modules: Map<string, string>; dirs: Map<string, string>; scanned: number; types: Map<string, number>; macros: Set<string>; cls: Map<string, { file: string; base: string; flags: number }>; scanning?: Promise<void> };

let dataDir = '';
const init = ({ dataDir: d }: { dataDir: string }) => (dataDir = d);
const indexDir = () => path.join(dataDir, 'ue-index');

function readHeader(src: string): Read {
  const d = declarations(src);
  return { types: d.types, macros: d.macros, classes: d.classes };
}

function defines(cs: string) {
  const out: string[] = [];
  for (const line of cs.split('\n')) {
    if (!/Definitions/.test(line)) continue;
    for (const m of line.matchAll(/"([A-Za-z_]\w*)(?:=[^"]*)?"/g)) out.push(m[1]);
  }
  return out;
}

async function walk(dir: string, heads: string[], builds: string[], depth = 0) {
  if (depth > 20) return;
  const list = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of list) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name.toLowerCase())) await walk(full, heads, builds, depth + 1);
    } else if (HEADER.test(e.name)) heads.push(full);
    else if (BUILD.test(e.name)) builds.push(full);
  }
}

async function readTree(dirs: string[], progress: (done: number, total: number) => void, base = ''): Promise<List> {
  const heads: string[] = [], builds: string[] = [];
  for (const d of dirs) await walk(d, heads, builds);
  const out: List = { files: [], types: [], defs: [], macros: [], modules: [], classes: [] };
  const macros = new Set<string>();
  for (const b of builds) {
    const name = BUILD.exec(path.basename(b))![1];
    out.modules.push([name, base ? path.relative(base, path.dirname(b)) : path.dirname(b)]);
    macros.add(name.toUpperCase() + '_API');
    for (const m of defines(await fs.promises.readFile(b, 'utf8').catch(() => ''))) macros.add(m);
  }
  let done = 0, next = 0;
  const one = async () => {
    while (next < heads.length) {
      const f = heads[next++];
      const src = await fs.promises.readFile(f, 'utf8').catch(() => '');
      const r = readHeader(src);
      if (r.types.length || r.macros.length) {
        const i = out.files.push(base ? path.relative(base, f) : f) - 1;
        for (const [n, line, fwd] of r.types) out.types.push(fwd ? [n, i, line, 1] : [n, i, line]);
        for (const [n, line] of r.macros) out.defs.push([n, i, line]);
        for (const [n, , base, flags] of r.classes) out.classes.push([n, i, base, flags]);
      }
      for (const [m] of r.macros) macros.add(m);
      const api = moduleMacro(f);
      if (api) macros.add(api);
      if (++done % 500 === 0) progress(done, heads.length);
    }
  };
  progress(0, heads.length);
  await Promise.all(Array.from({ length: 16 }, one));
  progress(heads.length, heads.length);
  out.macros = [...macros];
  return out;
}

if (!isMainThread && workerData?.known) {
  const { dirs, base } = workerData.known as { dirs: string[]; base: string };
  readTree(dirs, (done, total) => parentPort!.postMessage({ done, total }), base)
    .then((list) => parentPort!.postMessage({ list }))
    .catch((e) => parentPort!.postMessage({ error: String(e?.message || e) }));
}

async function versionOf(dir: string) {
  try {
    const v = JSON.parse((await fs.promises.readFile(path.join(dir, 'Engine', 'Build', 'Build.version'), 'utf8')).replace(/^﻿/, ''));
    return [v.MajorVersion, v.MinorVersion, v.PatchVersion].filter((x) => x != null).join('.') + (v.Changelist ? `-${v.Changelist}` : '');
  } catch {
    return '';
  }
}

function bucketsOf(names: Iterable<string>) {
  const b = new Map<string, string[]>();
  for (const n of names) {
    if (!TYPE_NAME.test(n)) continue;
    const k = n[0] + n.length;
    const l = b.get(k);
    if (l) l.push(n);
    else b.set(k, [n]);
  }
  return b;
}

function useList(e: Engine, list: List) {
  e.list = list;
  e.types = new Map();
  for (const t of list.types) if (!e.types.has(t[0])) e.types.set(t[0], e.types.size);
  e.macros = new Set(list.macros);
  e.buckets = bucketsOf(e.types.keys());
  e.cls = new Map();
  list.classes.forEach((c, k) => !e.cls!.has(c[0]) && e.cls!.set(c[0], k));
  e.mods = new Map(list.modules.map(([n, d]) => [path.normalize(d).toLowerCase(), n]));
  e.state = 'ready';
}

const engines = new Map<string, Engine>();

async function engineOf(dir: string, rebuild = false): Promise<Engine> {
  const version = await versionOf(dir);
  const key = `${version || 'unknown'}-${createHash('sha1').update(path.normalize(dir).toLowerCase()).digest('hex').slice(0, 8)}`;
  let e = engines.get(key);
  if (e && !rebuild && e.state !== 'failed') return e;
  if (e?.state === 'building') return e;
  e = { key, dir, version, state: 'none', done: 0, total: 0, built: 0 };
  engines.set(key, e);
  const file = path.join(indexDir(), key + '.json');
  if (!rebuild) {
    try {
      const saved = JSON.parse(await fs.promises.readFile(file, 'utf8'));
      if (saved.format === FORMAT && saved.dir === dir) {
        e.built = saved.built;
        useList(e, saved.list);
        return e;
      }
    } catch {}
  }
  build(e, file);
  return e;
}

function build(e: Engine, file: string) {
  e.state = 'building';
  e.done = e.total = 0;
  const dirs = [path.join(e.dir, 'Engine', 'Source'), path.join(e.dir, 'Engine', 'Plugins')];
  e.wait = new Promise<void>((res) => {
    const finish = async (list: List | null, error?: string) => {
      if (!list) {
        e.state = 'failed';
        e.error = error;
        return res();
      }
      e.built = Date.now();
      useList(e, list);
      try {
        await fs.promises.mkdir(indexDir(), { recursive: true });
        await fs.promises.writeFile(file + '.tmp', JSON.stringify({ format: FORMAT, dir: e.dir, version: e.version, built: e.built, list }));
        await fs.promises.rename(file + '.tmp', file);
      } catch {}
      res();
    };
    let w: Worker;
    try {
      w = new Worker(new URL(import.meta.url), { workerData: { known: { dirs, base: e.dir } } });
    } catch {
      readTree(dirs, (d, t) => ((e.done = d), (e.total = t)), e.dir).then((l) => finish(l), (err) => finish(null, String(err?.message || err)));
      return;
    }
    let over = false;
    w.on('message', (m) => {
      if (m.list) (over = true), finish(m.list);
      else if (m.error) (over = true), finish(null, m.error);
      else ((e.done = m.done), (e.total = m.total));
    });
    w.on('error', (err) => !over && ((over = true), finish(null, String(err?.message || err))));
    w.on('exit', () => !over && ((over = true), finish(null, 'the reader stopped')));
  });
}

const projects = new Map<string, Proj>();

async function projectOf(root: string): Promise<Proj> {
  const k = path.normalize(root).toLowerCase();
  let p = projects.get(k);
  if (!p) projects.set(k, (p = { root, files: new Map(), modules: new Map(), dirs: new Map(), scanned: 0, types: new Map(), macros: new Set(), cls: new Map() }));
  if (Date.now() - p.scanned < RESCAN) return p;
  if (!p.scanning) p.scanning = rescan(p).finally(() => (p!.scanning = undefined));
  await p.scanning;
  return p;
}

async function rescan(p: Proj) {
  const heads: string[] = [], builds: string[] = [];
  for (const sub of ['Source', 'Plugins']) await walk(path.join(p.root, sub), heads, builds);
  const seen = new Set(heads);
  for (const f of [...p.files.keys()]) if (!seen.has(f)) p.files.delete(f);
  let changed = false;
  await Promise.all(
    heads.map(async (f) => {
      const st = await fs.promises.stat(f).catch(() => null);
      if (!st) return;
      const had = p.files.get(f);
      if (had && had.mtime === st.mtimeMs) return;
      p.files.set(f, { mtime: st.mtimeMs, read: readHeader(await fs.promises.readFile(f, 'utf8').catch(() => '')) });
      changed = true;
    }),
  );
  const macros = new Set<string>();
  p.modules.clear();
  p.dirs.clear();
  for (const b of builds) {
    const name = BUILD.exec(path.basename(b))![1];
    p.modules.set(path.normalize(path.dirname(b)).toLowerCase(), name);
    p.dirs.set(path.normalize(path.dirname(b)).toLowerCase(), path.normalize(path.dirname(b)));
    macros.add(name.toUpperCase() + '_API');
    for (const m of defines(await fs.promises.readFile(b, 'utf8').catch(() => ''))) macros.add(m);
  }
  if (changed || p.types.size === 0 || seen.size !== p.files.size) {
    p.types = new Map();
    for (const { read } of p.files.values()) for (const [n, line] of read.types) if (!p.types.has(n)) p.types.set(n, line);
    p.cls = new Map();
    for (const [f, { read }] of p.files) for (const [n, , base, flags] of read.classes) if (!p.cls.has(n)) p.cls.set(n, { file: f, base, flags });
  }
  for (const [f, { read }] of p.files) {
    for (const [m] of read.macros) macros.add(m);
    const api = moduleMacro(f);
    if (api) macros.add(api);
  }
  p.macros = macros;
  p.scanned = Date.now();
}

function distance(a: string, b: string, max: number) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < low) low = cur[j];
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[n];
}

function near(name: string, e: Engine, pb: Map<string, string[]>) {
  if (name.length < 5) return null;
  const max = name.length < 9 ? 1 : 2;
  let best: string | null = null, bd = max + 1;
  for (let len = name.length - max; len <= name.length + max; len++) {
    for (const list of [e.buckets!.get(name[0] + len), pb.get(name[0] + len)]) {
      for (const x of list || []) {
        const d = distance(name, x, max);
        if (d < bd || (d === bd && best && x < best)) [best, bd] = [x, d];
      }
    }
  }
  return best;
}

function moduleOf(file: string, p: Proj) {
  let d = path.normalize(path.dirname(file)).toLowerCase();
  const root = path.normalize(p.root).toLowerCase();
  while (d.startsWith(root)) {
    const m = p.modules.get(d);
    if (m) return m;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

const status = (e: Engine) => ({ state: e.state, version: e.version, done: e.done, total: e.total, built: e.built, names: e.types?.size || 0, macros: e.macros?.size || 0, modules: e.list?.modules.length || 0, error: e.error || null });

async function ask(engineDir: string, root: string, { file = '', types = [], macros = [], parents = [] }: { file?: string; types?: string[]; macros?: string[]; parents?: string[] }) {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return { ready: false, index: status(e) };
  const p = await projectOf(root);
  const t: Record<string, { ok: boolean; near?: string }> = {};
  const pb = bucketsOf(p.types.keys());
  for (const n of types.slice(0, 2000).map(String)) {
    if (e.types!.has(n) || p.types.has(n)) t[n] = { ok: true };
    else {
      const x = near(n, e, pb);
      t[n] = x ? { ok: false, near: x } : { ok: false };
    }
  }
  const m: Record<string, boolean> = {};
  for (const n of macros.slice(0, 2000).map(String)) m[n] = e.macros!.has(n) || p.macros.has(n);
  const mod = file ? moduleOf(path.resolve(root, file), p) : null;
  const pa: Record<string, Awaited<ReturnType<typeof parentInfo>>> = {};
  for (const n of parents.slice(0, 50).map(String)) pa[n] = await parentInfo(e, p, n);
  return { ready: true, types: t, macros: m, parents: pa, module: mod, api: mod ? mod.toUpperCase() + '_API' : null };
}

type Place = { abs: string; line: number; kind: string };

function engineAt(e: Engine) {
  if (e.at) return e.at;
  const at = new Map<string, number[]>();
  e.list!.types.forEach((t, k) => {
    const l = at.get(t[0]);
    if (l) l.push(k);
    else at.set(t[0], [k]);
  });
  e.list!.defs.forEach((d, k) => {
    const l = at.get(d[0]);
    if (l) l.push(-1 - k);
    else at.set(d[0], [-1 - k]);
  });
  return (e.at = at);
}

function placesOf(e: Engine, p: Proj, name: string) {
  const full: (Place & { fwd: boolean })[] = [];
  for (const [f, { read }] of p.files) {
    for (const [n, line, fwd] of read.types) if (n === name) full.push({ abs: f, line, kind: 'type', fwd: !!fwd });
    for (const [n, line] of read.macros) if (n === name) full.push({ abs: f, line, kind: 'macro', fwd: false });
  }
  for (const k of engineAt(e).get(name) || []) {
    const t = k >= 0 ? e.list!.types[k] : null, d = k < 0 ? e.list!.defs[-1 - k] : null;
    const [fi, line] = t ? [t[1], t[2]] : [d![1], d![2]];
    full.push({ abs: path.join(e.dir, e.list!.files[fi]), line, kind: t ? 'type' : 'macro', fwd: !!t?.[3] });
  }
  return full;
}

async function where(engineDir: string, root: string, name: string, inside = '') {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return { ready: false, index: status(e), places: [] };
  const p = await projectOf(root);
  const m = /^(.*\w)::(\w+)$/.exec(name);
  if (inside || m) {
    const r = await memberList(e, p, { from: { type: inside || m![1].split('::').pop()! }, op: '::', name: inside ? name : m![2] });
    return { ready: true, places: r.places };
  }
  const full = placesOf(e, p, name);
  const defs = full.filter((x) => !x.fwd), use = defs.length ? defs : full;
  return { ready: true, places: use.slice(0, 20).map(({ abs, line, kind }) => ({ abs, line, kind })) };
}

const parsed = new Map<string, { mtime: number; r: Parsed }>();
const PARSED = 300;

async function parsedOf(abs: string, uht = false) {
  const st = await fs.promises.stat(abs).catch(() => null);
  if (!st) return null;
  const k = (uht ? 'uht|' : '') + path.normalize(abs).toLowerCase(), had = parsed.get(k);
  parsed.delete(k);
  if (had && had.mtime === st.mtimeMs) {
    parsed.set(k, had);
    return had.r;
  }
  const r = readMembers(await fs.promises.readFile(abs, 'utf8').catch(() => ''), uht);
  parsed.set(k, { mtime: st.mtimeMs, r });
  if (parsed.size > PARSED) parsed.delete(parsed.keys().next().value!);
  return r;
}

type Found = { cls: Cls; abs: string };
const fits = (ns: string, outer: string, qual: string) => !qual || ns === qual || ns.endsWith('::' + qual) || outer === qual.split('::').pop();

async function classNamed(e: Engine, p: Proj, name: string, qual = '', depth = 0): Promise<Found | null> {
  if (!name || depth > 8) return null;
  const places = placesOf(e, p, name).filter((x) => x.kind === 'type' && !x.fwd);
  const seen = new Set<string>();
  const top = (x: { ns: string; outer: string }) => !x.ns && !x.outer;
  let global: Found | null = null, first: Found | null = null, galias: Val | null = null, alias: Val | null = null;
  for (const pl of places) {
    const k = pl.abs.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (seen.size > 24) break;
    const r = await parsedOf(pl.abs);
    if (!r) continue;
    const c = r.classes.filter((x) => x.name === name);
    if (qual) {
      const best = c.find((x) => fits(x.ns, x.outer, qual));
      if (best) return { cls: best, abs: pl.abs };
    }
    const g = c.find(top);
    if (g && !qual) return { cls: g, abs: pl.abs };
    if (g && !global) global = { cls: g, abs: pl.abs };
    if (c[0] && !first) first = { cls: c[0], abs: pl.abs };
    for (const a of r.aliases) {
      if (a.name !== name || a.to.type === name) continue;
      if (qual && fits(a.ns, a.outer, qual)) return classNamed(e, p, a.to.type, a.to.qual || '', depth + 1);
      if (top(a) && !galias) galias = a.to;
      if (!alias) alias = a.to;
    }
  }
  if (global) return global;
  if (galias) return classNamed(e, p, galias.type, galias.qual || '', depth + 1);
  const made = await byMacro(e, p, name);
  if (made) return made;
  if (first) return first;
  if (alias) return classNamed(e, p, alias.type, alias.qual || '', depth + 1);
  return null;
}

const MADE = ['UE_STRING_CLASS'];

async function byMacro(e: Engine, p: Proj, name: string): Promise<Found | null> {
  for (const m of MADE) {
    for (const pl of placesOf(e, p, m)) {
      if (pl.kind !== 'macro') continue;
      const src = await fs.promises.readFile(pl.abs, 'utf8').catch(() => '');
      const at = src.search(new RegExp(`#\\s*define\\s+${m}\\s+${name}\\b`));
      if (at < 0) continue;
      const inc = /#\s*include\s*"([^"]+\.inl)"/.exec(src.slice(at));
      if (!inc) continue;
      const want = path.basename(inc[1]).toLowerCase();
      const abs = placesOf(e, p, m).find((x) => x.kind === 'type' && path.basename(x.abs).toLowerCase() === want)?.abs;
      const c = abs ? (await parsedOf(abs))?.classes.find((x) => x.name === m) : null;
      if (!abs) continue;
      if (c) return { cls: { ...c, name, members: c.members.map((x) => (x.val?.type === m ? { ...x, val: { ...x.val, type: name } } : x)) }, abs };
    }
  }
  return null;
}

async function chainOf(e: Engine, p: Proj, name: string, qual = '') {
  const out: Found[] = [], missing: string[] = [], seen = new Set<string>();
  const queue: [string, string][] = [[name, qual]];
  while (queue.length && out.length < 40) {
    const [n, q] = queue.shift()!;
    if (seen.has(n)) continue;
    seen.add(n);
    const f = await classNamed(e, p, n, q);
    if (!f) {
      missing.push(n);
      continue;
    }
    out.push(f);
    for (const b of f.cls.bases) queue.push([b, f.cls.ns]);
  }
  return { chain: out, missing };
}

const isRet = (m: Member) => !!m.val && (m.val.type !== 'void' || !!m.val.ptr);

async function reflectedOf(f: Found) {
  const r = await parsedOf(f.abs, true);
  return r?.classes.find((c) => c.name === f.cls.name && c.line === f.cls.line) || r?.classes.find((c) => c.name === f.cls.name) || null;
}

async function parentInfo(e: Engine, p: Proj, name: string) {
  const chain: string[] = [], props: [string, string, number][] = [], fns: [string, string, number, number][] = [];
  let cur = name, complete = false, actor = false, deprecated = false;
  for (let k = 0; k < 40 && cur && !chain.includes(cur); k++) {
    const f = await classNamed(e, p, cur);
    if (!f) break;
    chain.push(cur);
    if (cur === 'AActor') actor = true;
    if (cur.includes('DEPRECATED_') || f.cls.specs.includes('deprecated')) deprecated = true;
    const u = await reflectedOf(f);
    for (const m of u?.members || []) {
      if (m.refl === 'UPROPERTY' && m.kind === 'var') props.push([m.name, cur, m.name.includes('_DEPRECATED') ? 1 : 0]);
      else if (m.refl === 'UFUNCTION' && m.kind === 'fn') fns.push([m.name, cur, m.params?.length || 0, isRet(m) ? 1 : 0]);
    }
    if (!f.cls.bases.length) {
      complete = true;
      break;
    }
    cur = f.cls.bases[0];
  }
  if (!chain.length) return { ok: false };
  let iface: { cannot: boolean; fns: [string, number, number, number, string][] } | null = null;
  if (/^I[A-Z]/.test(name)) {
    const uf = await classNamed(e, p, 'U' + name.slice(1)), nf = await classNamed(e, p, name);
    if (uf && nf && uf.cls.macro === 'UINTERFACE') {
      const specs = uf.cls.specs.join(',');
      const cannot = /(^|,)notblueprintable(,|$)/.test(specs) || /cannotimplementinterfaceinblueprint|isblueprintbase\s*=\s*"?false/.test(specs);
      const list: [string, number, number, number, string][] = [];
      for (const owner of [await reflectedOf(uf), await reflectedOf(nf)]) {
        for (const m of owner?.members || []) {
          if (m.refl !== 'UFUNCTION' || m.kind !== 'fn') continue;
          const sp = m.specs || [];
          const flags = (sp.some((x) => x === 'blueprintcallable' || x === 'blueprintpure') ? 1 : 0) | (sp.some((x) => x === 'blueprintimplementableevent' || x === 'blueprintnativeevent') ? 2 : 0);
          list.push([m.name, m.params?.length || 0, isRet(m) ? 1 : 0, flags, m.decl]);
        }
      }
      iface = { cannot, fns: list };
    }
  }
  return { ok: true, chain, complete, actor, deprecated, props, fns, iface };
}

const SMART = new Set(['TObjectPtr', 'TWeakObjectPtr', 'TSharedPtr', 'TSharedRef', 'TUniquePtr', 'TStrongObjectPtr', 'TSoftObjectPtr', 'TLazyObjectPtr', 'TScriptInterface', 'TWeakInterfacePtr', 'TOptional']);
const classOf = (v: Val, op: string) => (op === '->' && SMART.has(v.type) && v.arg ? v.arg : op === '->' && v.type === 'TSubclassOf' ? 'UClass' : v.type);

type Listed = Member & { owner: string; abs: string };
function flat(chain: Found[]) {
  const out: Listed[] = [];
  chain.forEach((f, i) => {
    for (const m of f.cls.members) if (i === 0 || m.access !== 'private') out.push({ ...m, owner: f.cls.name, abs: f.abs });
  });
  return out;
}

function pick(list: Listed[], name: string) {
  const all = list.filter((m) => m.name === name);
  return all.find((m) => m.val && !m.tparams?.includes(m.val.type)) || all[0] || null;
}

type Ask = { from?: Val & { super?: boolean }; steps?: { op: string; name: string }[]; op?: string; name?: string };
type Out = { name: string; kind: string; owner: string; decl: string; abs: string; line: number; static?: boolean };

async function memberList(e: Engine, p: Proj, { from, steps = [], op = '.', name = '' }: Ask): Promise<{ type: string; list: Out[]; places: Out[]; miss?: string }> {
  const none = { type: '', list: [], places: [] };
  if (!from?.type) return none;
  let v: Val = { type: String(from.type), ...(from.arg ? { arg: String(from.arg) } : {}), ...(from.ptr ? { ptr: true } : {}), ...(from.qual ? { qual: String(from.qual) } : {}) };
  if (from.super) {
    const c = await classNamed(e, p, v.type, v.qual);
    if (!c?.cls.bases[0]) return none;
    v = { type: c.cls.bases[0], qual: c.cls.ns };
  }
  for (const s of (Array.isArray(steps) ? steps : []).slice(0, 12)) {
    const { chain } = await chainOf(e, p, classOf(v, String(s.op)), v.qual);
    const m = pick(flat(chain), String(s.name));
    if (!m?.val) return { ...none, miss: String(s.name) };
    v = m.kind === 'type' && m.val.type === m.name ? { type: m.name, qual: chain[0]?.cls.ns } : m.val;
  }
  const type = classOf(v, op);
  const { chain } = await chainOf(e, p, type, v.qual);
  const list = flat(chain);
  const out = (m: Listed): Out => ({ name: m.name, kind: m.kind, owner: m.owner, decl: m.decl, abs: m.abs, line: m.line, ...(m.static ? { static: true } : {}) });
  const shown = chain[0]?.cls.name || type;
  if (name) return { type: shown, list: [], places: list.filter((m) => m.name === name).slice(0, 20).map(out) };
  const seen = new Set<string>(), uniq: Listed[] = [];
  for (const m of list) if (!seen.has(m.name)) seen.add(m.name), uniq.push(m);
  return { type: shown, list: uniq.slice(0, 3000).map(out), places: [] };
}

async function membersOf(engineDir: string, root: string, body: Ask) {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return { ready: false, index: status(e), type: '', list: [], places: [] };
  return { ready: true, ...(await memberList(e, await projectOf(root), body || {})) };
}

const texts = new Map<string, { mtime: number; lines: string[] }>();

async function linesOf(abs: string) {
  const st = await fs.promises.stat(abs).catch(() => null);
  if (!st) return [];
  const k = path.normalize(abs).toLowerCase(), had = texts.get(k);
  if (had && had.mtime === st.mtimeMs) return had.lines;
  const lines = (await fs.promises.readFile(abs, 'utf8').catch(() => '')).split(/\r?\n/);
  texts.set(k, { mtime: st.mtimeMs, lines });
  if (texts.size > 20) texts.delete(texts.keys().next().value!);
  return lines;
}

const count = (s: string, c: string) => s.split(c).length - 1;

function commentAbove(lines: string[], n: number) {
  const own = /[;{]\s*\/\/+<?\s*(.+)$/.exec(lines[n - 1] || '');
  let i = n - 2, depth = 0;
  while (i >= 0) {
    const t = lines[i].trim();
    const more = count(t, ')') - count(t, '(');
    if (depth > 0) {
      depth = Math.max(0, depth + more);
      i--;
      continue;
    }
    if (/^[A-Z][A-Z0-9_]*\s*\(/.test(t) || /^[A-Z][A-Z0-9_]*$/.test(t) || /^template\s*</.test(t)) {
      depth = Math.max(0, more);
      i--;
      continue;
    }
    if (more > 0 && !t.startsWith('//') && !t.endsWith('*/')) {
      depth = more;
      i--;
      continue;
    }
    break;
  }
  const got: string[] = [];
  if (i >= 0 && lines[i].trim().endsWith('*/')) {
    for (; i >= 0; i--) {
      got.unshift(lines[i]);
      if (lines[i].includes('/*')) break;
    }
  } else for (; i >= 0 && lines[i].trim().startsWith('//'); i--) got.unshift(lines[i]);
  const clean = got
    .join('\n')
    .replace(/\/\*+!?|\*+\//g, '')
    .split('\n')
    .map((l) => l.trim().replace(/^(\/\/+[~!<]?|\*(?!\*))\s*/, '').trimEnd())
    .filter((l, k, all) => l || (k > 0 && all[k - 1] !== ''));
  while (clean.length && !clean[0].trim()) clean.shift();
  while (clean.length && !clean[clean.length - 1].trim()) clean.pop();
  const text = (clean.length ? clean : own ? [own[1]] : []).slice(0, 12).join('\n');
  return text.length > 900 ? text.slice(0, 900) + '…' : text;
}

type Card = { kind: string; name: string; owner?: string; decl: string; abs: string; line: number; comment: string };

async function aboutOf(e: Engine, p: Proj, { name = '', from, steps, op }: Ask): Promise<Card | null> {
  if (!name) return null;
  if (from) {
    const m = (await memberList(e, p, { from, steps, op, name })).places[0];
    if (!m) return null;
    return { kind: m.kind, name, owner: m.owner, decl: m.decl, abs: m.abs, line: m.line, comment: commentAbove(await linesOf(m.abs), m.line) };
  }
  const all = placesOf(e, p, name), defs = all.filter((x) => !x.fwd);
  const pl = (defs.length ? defs : all)[0];
  if (!pl) return null;
  const lines = await linesOf(pl.abs);
  let decl = (lines[pl.line - 1] || '').trim(), kind = pl.kind;
  if (pl.kind === 'type') {
    const c = (await parsedOf(pl.abs))?.classes.find((x) => x.name === name && x.line === pl.line);
    if (c) [decl, kind] = [c.decl, c.kind];
  }
  return { kind, name, decl: decl.replace(/\s+/g, ' ').slice(0, 240), abs: pl.abs, line: pl.line, comment: commentAbove(lines, pl.line) };
}

async function about(engineDir: string, root: string, body: Ask) {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return { ready: false, index: status(e), card: null };
  return { ready: true, card: await aboutOf(e, await projectOf(root), body || {}) };
}

async function complete(engineDir: string, root: string, prefix: string) {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready' || prefix.length < 2) return { ready: e.state === 'ready', names: [] };
  const p = await projectOf(root);
  e.sorted ||= [...new Set([...e.types!.keys(), ...e.list!.defs.map((d) => d[0])])].sort();
  const low = prefix.toLowerCase(), out = new Map<string, string>();
  for (const { read } of p.files.values()) {
    for (const [n, , fwd] of read.types) if (!fwd && n.toLowerCase().startsWith(low)) out.set(n, 'project');
    for (const [n] of read.macros) if (n.toLowerCase().startsWith(low) && !out.has(n)) out.set(n, 'project');
  }
  for (const n of e.sorted) if (n.length > 1 && n.toLowerCase().startsWith(low) && !out.has(n)) out.set(n, 'engine');
  for (const n of p.types.keys()) if (n.toLowerCase().startsWith(low) && !out.has(n)) out.set(n, 'project');
  const exact = (n: string) => (n.startsWith(prefix) ? 0 : 1);
  const names = [...out].sort((a, b) => exact(a[0]) - exact(b[0]) || (a[1] === 'project' ? 0 : 1) - (b[1] === 'project' ? 0 : 1) || a[0].length - b[0].length || a[0].localeCompare(b[0])).slice(0, 60);
  return { ready: true, names: names.map(([n, from]) => ({ name: n, from, kind: e.types!.has(n) || p.types.has(n) ? 'type' : 'macro' })) };
}

async function index(engineDir: string, rebuild = false) {
  return status(await engineOf(engineDir, rebuild));
}

async function settle(engineDir: string) {
  const e = await engineOf(engineDir);
  await e.wait;
  return status(e);
}

type Parent = { cls: string; name: string; module: string; include: string; kind: string; from: string; plugin?: string };
const COMMON = ['AActor', 'APawn', 'ACharacter', 'UActorComponent', 'USceneComponent', 'UObject', 'APlayerController', 'AGameModeBase', 'UUserWidget', 'UBlueprintFunctionLibrary'];
const SPECIAL: Parent[] = [
  { cls: 'UInterface', name: 'Unreal Interface', module: 'CoreUObject', include: 'UObject/Interface.h', kind: 'interface', from: 'engine' },
  { cls: '', name: 'None', module: '', include: '', kind: 'plain', from: 'engine' },
];
const OBJECT: Parent = { cls: 'UObject', name: 'Object', module: 'CoreUObject', include: 'UObject/Object.h', kind: 'object', from: 'engine' };
const INNER = new Set(['public', 'classes', 'private', 'internal']);

function upTo(file: string, mods: Map<string, string>, stop = '') {
  let d = path.normalize(path.dirname(file));
  while (d && d !== '.' && (!stop || d.toLowerCase().startsWith(stop))) {
    const n = mods.get(d.toLowerCase());
    if (n) return { name: n, dir: d };
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

function moduleAt(p: Proj, abs: string) {
  const m = upTo(path.join(abs, '_'), p.modules, path.normalize(p.root).toLowerCase());
  return m ? { name: m.name, dir: p.dirs.get(m.dir.toLowerCase()) || m.dir } : null;
}

function placeOf(file: string, mod: { name: string; dir: string }) {
  const rest = path.normalize(file).slice(path.normalize(mod.dir).length).split(/[\\/]/).filter(Boolean);
  const inner = INNER.has(rest[0]?.toLowerCase()) ? rest.shift()!.toLowerCase() : '';
  return { include: rest.join('/'), hidden: inner === 'private' || inner === 'internal' };
}

function lookup(e: Engine, p: Proj, target: string | null) {
  const base = (n: string) => p.cls.get(n)?.base ?? (e.cls!.has(n) ? e.list!.classes[e.cls!.get(n)!][2] : '');
  const kindOf = (n: string) => {
    for (let k = 0; n && k < 64; k++, n = base(n)) {
      if (n === 'AActor') return 'actor';
      if (n === 'UActorComponent') return 'component';
      if (n === 'UWidget') return 'widget';
    }
    return 'object';
  };
  const ok = (n: string, flags: number) => /^[AU][A-Z]/.test(n) && !/DEPRECATED/i.test(n) && !(flags & 2);
  return (n: string): Parent | null => {
    if (n === 'UObject') return OBJECT;
    const own = p.cls.get(n);
    if (own) {
      const mod = upTo(own.file, p.modules);
      if (!mod || !ok(n, own.flags)) return null;
      const pl = placeOf(own.file, { name: mod.name, dir: p.dirs.get(mod.dir.toLowerCase()) || mod.dir });
      const same = mod.name === target;
      if (!same && (pl.hidden || !(own.flags & 5))) return null;
      return { cls: n, name: n.slice(1), module: mod.name, include: pl.include, kind: kindOf(n), from: 'project' };
    }
    const k = e.cls!.get(n);
    if (k == null) return null;
    const [, fi, , flags] = e.list!.classes[k];
    if (!ok(n, flags) || !(flags & 5)) return null;
    const file = e.list!.files[fi], mod = upTo(file, e.mods!);
    if (!mod) return null;
    const pl = placeOf(file, mod);
    if (pl.hidden) return null;
    const parts = mod.dir.split(/[\\/]/), at = parts.map((x) => x.toLowerCase()).lastIndexOf('source');
    const plugin = parts[0]?.toLowerCase() === 'engine' && parts[1]?.toLowerCase() === 'plugins' && at > 2 ? parts.slice(0, at).join('/') : undefined;
    return { cls: n, name: n.slice(1), module: mod.name, include: pl.include, kind: kindOf(n), from: 'engine', ...(plugin ? { plugin } : {}) };
  };
}

async function parents(engineDir: string, root: string, { q = '', dir = '' }: { q?: string; dir?: string }) {
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return { ready: false, index: status(e), list: [] };
  const p = await projectOf(root);
  const target = dir ? moduleAt(p, path.resolve(root, dir))?.name || null : null;
  const one = lookup(e, p, target);
  const low = q.trim().toLowerCase();
  if (!low) return { ready: true, module: target, list: [...COMMON.map(one).filter((x): x is Parent => !!x), ...SPECIAL] };
  const hits: [Parent, number][] = [];
  const consider = (n: string, project: boolean) => {
    const name = n.slice(1).toLowerCase();
    const r = name.startsWith(low) || n.toLowerCase().startsWith(low) ? 0 : name.includes(low) ? 1 : -1;
    if (r < 0) return;
    const x = one(n);
    if (x) hits.push([x, r * 2 + (project ? 0 : 1)]);
  };
  for (const n of p.cls.keys()) consider(n, true);
  for (const n of e.cls!.keys()) if (!p.cls.has(n)) consider(n, false);
  if ('object'.startsWith(low) && !hits.some(([x]) => x.cls === 'UObject')) hits.push([OBJECT, 1]);
  const special = SPECIAL.filter((x) => [x.name, x.kind, x.kind === 'plain' ? 'empty c++' : ''].some((w) => w.toLowerCase().startsWith(low)));
  hits.sort((a, b) => a[1] - b[1] || a[0].cls.length - b[0].cls.length || a[0].cls.localeCompare(b[0].cls));
  return { ready: true, module: target, list: [...special, ...hits.slice(0, 60).map(([x]) => x)] };
}

async function parentOf(engineDir: string, root: string, cls: string, dir: string) {
  if (!cls) return SPECIAL[1];
  if (cls === 'UInterface') return SPECIAL[0];
  const e = await engineOf(engineDir);
  if (e.state !== 'ready') return null;
  const p = await projectOf(root);
  return lookup(e, p, moduleAt(p, path.resolve(root, dir))?.name || null)(cls);
}

async function moduleOfDir(root: string, abs: string) {
  return moduleAt(await projectOf(root), abs);
}

async function forget(root: string) {
  const p = projects.get(path.normalize(root).toLowerCase());
  if (p) p.scanned = 0;
}

export { init, ask, index, settle, readTree, where, complete, membersOf, about, parents, parentOf, moduleOfDir, forget };
