import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface Entry {
  sig: string;
  mtime: number;
  size: number;
}
type Snap = Map<string, Entry>;
interface Risk {
  path: string;
  why: string;
}
interface Base {
  snap: Snap;
  pid: number;
}

const SKIP = new Set(['intermediate', 'binaries', 'saved', 'deriveddatacache', '.vs', '.git', '.idea', 'content']);
const HEADER = /\.(h|hpp|hh|inl)$/i;
const CPP = /\.(cpp|cc|cxx|c)$/i;
const RULES = /\.(build|target)\.cs$/i;
const PROJ = /\.(uproject|uplugin)$/i;
const REFLECT = /\b(UCLASS|USTRUCT|UENUM|UINTERFACE|UPROPERTY|UFUNCTION|UMETA|UPARAM|GENERATED_BODY|GENERATED_UCLASS_BODY|GENERATED_USTRUCT_BODY|UDELEGATE)\b/;

const bases = new Map<string, Base>();
const cache = new Map<string, Entry>();
let store = '';
const init = (dataDir: string) => (store = path.join(dataDir, 'ue-guard'));
const fileOf = (key: string) => path.join(store, crypto.createHash('sha1').update(key).digest('hex').slice(0, 16) + '.json');

async function save(key: string, base: Base) {
  if (!store) return;
  try {
    await fs.promises.mkdir(store, { recursive: true });
    await fs.promises.writeFile(fileOf(key) + '.tmp', JSON.stringify({ pid: base.pid, snap: [...base.snap] }));
    await fs.promises.rename(fileOf(key) + '.tmp', fileOf(key));
  } catch {}
}
async function load(key: string, pid: number): Promise<Base | null> {
  if (!store || !pid) return null;
  try {
    const j = JSON.parse(await fs.promises.readFile(fileOf(key), 'utf8'));
    return j?.pid === pid && Array.isArray(j.snap) ? { pid, snap: new Map(j.snap) } : null;
  } catch {
    return null;
  }
}

const hash = (s: string) => crypto.createHash('sha1').update(s).digest('hex');
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
const kind = (f: string) => (HEADER.test(f) ? 'h' : CPP.test(f) ? 'cpp' : RULES.test(f) ? 'rules' : PROJ.test(f) ? 'proj' : '');

function sigOf(file: string, text: string) {
  const k = kind(file);
  if (k === 'cpp') return hash(bare(text).split(/(?<=[;{}])/).filter((s) => REFLECT.test(s)).join('\n'));
  return hash(bare(text));
}

async function walk(dir: string, out: string[], depth = 0) {
  let list: fs.Dirent[];
  try {
    list = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of list) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name.toLowerCase()) && depth < 24) await walk(full, out, depth + 1);
    } else if (kind(e.name)) out.push(full);
  }
}

async function files(projDir: string) {
  const out: string[] = [];
  for (const f of await fs.promises.readdir(projDir).catch(() => [] as string[])) if (/\.uproject$/i.test(f)) out.push(path.join(projDir, f));
  await walk(path.join(projDir, 'Source'), out);
  for (const p of await fs.promises.readdir(path.join(projDir, 'Plugins'), { withFileTypes: true }).catch(() => [] as fs.Dirent[])) {
    if (!p.isDirectory()) continue;
    const pd = path.join(projDir, 'Plugins', p.name);
    for (const f of await fs.promises.readdir(pd).catch(() => [] as string[])) if (/\.uplugin$/i.test(f)) out.push(path.join(pd, f));
    await walk(path.join(pd, 'Source'), out);
  }
  return out;
}

async function snapshot(projDir: string) {
  const snap: Snap = new Map();
  for (const f of await files(projDir)) {
    let st: fs.Stats;
    try {
      st = await fs.promises.stat(f);
    } catch {
      continue;
    }
    const was = cache.get(f);
    if (was && was.mtime === st.mtimeMs && was.size === st.size) {
      snap.set(f, was);
      continue;
    }
    const text = await fs.promises.readFile(f, 'utf8').catch(() => null);
    if (text == null) continue;
    const e = { sig: sigOf(f, text), mtime: st.mtimeMs, size: st.size };
    cache.set(f, e);
    snap.set(f, e);
  }
  return snap;
}

const WHY: Record<string, string> = {
  h: 'a header changed (the shape of a class can change)',
  cpp: 'a UCLASS, UPROPERTY or UFUNCTION line changed',
  rules: 'module rules changed',
  proj: 'the project or a plugin file changed',
};

function diff(base: Base, now: Snap, projDir: string) {
  const out: Risk[] = [];
  const rel = (f: string) => path.relative(projDir, f).replace(/\\/g, '/');
  for (const [f, e] of now) {
    const b = base.snap.get(f);
    if (!b) out.push({ path: rel(f), why: kind(f) === 'h' || kind(f) === 'cpp' ? 'a new file (a new class needs a restart)' : WHY[kind(f)] });
    else if (b.sig !== e.sig) out.push({ path: rel(f), why: WHY[kind(f)] + (b.sig === '' ? ', after the editor started' : '') });
  }
  for (const f of base.snap.keys()) if (!now.has(f)) out.push({ path: rel(f), why: 'a file was removed' });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function rebase(key: string, projDir: string, pid?: number) {
  const base = { snap: await snapshot(projDir), pid: pid ?? bases.get(key)?.pid ?? 0 };
  bases.set(key, base);
  await save(key, base);
}

async function ensure(key: string, projDir: string, started = 0, pid = 0) {
  const was = bases.get(key);
  if (was && (!pid || !was.pid || was.pid === pid)) {
    if (pid && !was.pid) save(key, Object.assign(was, { pid }));
    return;
  }
  const kept = await load(key, pid);
  if (kept) return void bases.set(key, kept);
  const snap = await snapshot(projDir);
  if (started) for (const [f, e] of snap) if (e.mtime > started && kind(f) !== 'cpp') snap.set(f, { ...e, sig: '' });
  const base = { snap, pid };
  bases.set(key, base);
  await save(key, base);
}

async function risks(key: string, projDir: string) {
  const base = bases.get(key);
  if (!base) return [];
  return diff(base, await snapshot(projDir), projDir);
}

const drop = (key: string) => bases.delete(key);
const has = (key: string) => bases.has(key);

function watchDir(key: string, projDir: string, onChange: (r: Risk[]) => void) {
  const ws: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null, last = '';
  const again = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      const r = await risks(key, projDir).catch(() => [] as Risk[]);
      const s = JSON.stringify(r);
      if (s !== last) {
        last = s;
        onChange(r);
      }
    }, 300);
  };
  for (const d of [projDir, path.join(projDir, 'Source'), path.join(projDir, 'Plugins')]) {
    try {
      ws.push(fs.watch(d, { recursive: d !== projDir }, (_, f) => (!f || kind(String(f))) && !/[\\/](Intermediate|Binaries)[\\/]/i.test(String(f)) && again()));
    } catch {}
  }
  for (const w of ws) w.on('error', () => {});
  return () => {
    if (timer) clearTimeout(timer);
    for (const w of ws) w.close();
  };
}

export { init, ensure, rebase, risks, drop, has, watchDir, snapshot, sigOf };
export type { Risk };
