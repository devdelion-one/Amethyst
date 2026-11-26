import fs from 'fs';
import path from 'path';

const MACROS = { UCLASS: 'Class', UINTERFACE: 'Interface', USTRUCT: 'ScriptStruct', UENUM: 'Enum', UFUNCTION: 'Function', UDELEGATE: 'Function', UPROPERTY: 'PropertyMember', UPARAM: 'PropertyArgument' };
const SKIP = new Set(['intermediate', 'binaries', 'saved', 'content', 'deriveddatacache', '.git', '.vs', 'node_modules']);
type Tree = Record<string, string | null>;
type Own = Record<string, Set<string>>;
const uhtDir = (engine: string) => path.join(engine, 'Engine', 'Source', 'Programs', 'Shared', 'EpicGames.UHT');

function parents(src: string) {
  const out: Tree = {};
  const re = /CreateTables\(\s*tables\s*,\s*UhtTableNames\.(\w+)\s*,\s*"[^"]*"\s*,[^,]+,\s*(?:UhtTableNames\.(\w+)|null)/g;
  for (let m; (m = re.exec(src)); ) out[m[1]] = m[2] || null;
  return out;
}

function declared(src: string, into: Own) {
  const re = /\[UhtSpecifier\s*\(([^\]]*)\)\s*\]/g;
  for (let m; (m = re.exec(src)); ) {
    const args = m[1];
    const table = /Extends\s*=\s*(?:UhtTableNames\.(\w+)|"(\w+)")/.exec(args);
    if (!table) continue;
    let name = /\bName\s*=\s*"([^"]+)"/.exec(args)?.[1];
    if (!name) {
      const method = /\b(\w+)Specifier\s*\(/.exec(src.slice(re.lastIndex, re.lastIndex + 2000));
      name = method?.[1];
    }
    if (!name) continue;
    const t = table[1] || table[2];
    (into[t] ||= new Set()).add(name);
  }
}

async function csFiles(dir: string, out: string[], depth = 0): Promise<string[]> {
  if (depth > 8 || out.length > 5000) return out;
  const list = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of list) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name.toLowerCase())) await csFiles(path.join(dir, e.name), out, depth + 1);
    } else if (/\.cs$/i.test(e.name) && !/\.(Build|Target)\.cs$/i.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

const engineCache = new Map<string, { stamp: number; tree: Tree; own: Own }>();
async function engineTables(engine: string) {
  const dir = uhtDir(engine);
  const stamp = (await fs.promises.stat(path.join(dir, 'Specifiers')).catch(() => null))?.mtimeMs;
  if (stamp == null) return null;
  const hit = engineCache.get(engine);
  if (hit && hit.stamp === stamp) return hit;
  const tree = parents(await fs.promises.readFile(path.join(dir, 'Utils', 'UhtTables.cs'), 'utf8').catch(() => ''));
  const own: Own = {};
  for (const f of await fs.promises.readdir(path.join(dir, 'Specifiers')).catch(() => [])) {
    if (/\.cs$/i.test(f)) declared(await fs.promises.readFile(path.join(dir, 'Specifiers', f), 'utf8'), own);
  }
  const r = { stamp, tree, own };
  engineCache.set(engine, r);
  return r;
}

const projectCache = new Map<string, Own>();
async function projectTables(root: string, again: boolean) {
  if (!again && projectCache.has(root)) return projectCache.get(root)!;
  const own: Own = {};
  for (const sub of ['Source', 'Plugins']) {
    for (const f of await csFiles(path.join(root, sub), [])) {
      const src = await fs.promises.readFile(f, 'utf8').catch(() => '');
      if (src.includes('UhtSpecifier')) declared(src, own);
    }
  }
  projectCache.set(root, own);
  return own;
}

function resolve(tree: Tree, own: Own, extra: Own) {
  const all = (t: string | null, seen = new Set<string>()): string[] => {
    if (!t || seen.has(t)) return [];
    seen.add(t);
    return [...(own[t] || []), ...(extra[t] || []), ...all(tree[t], seen)];
  };
  const out: Record<string, string[]> = {};
  for (const [macro, table] of Object.entries(MACROS)) out[macro] = [...new Set(all(table))].sort((a, b) => a.localeCompare(b));
  return out;
}

async function specs(engine: string, root: string | null, again = false) {
  const e = await engineTables(engine);
  if (!e || !Object.keys(e.own).length || !e.tree.Class) return null;
  const extra = root ? await projectTables(root, again) : {};
  return resolve(e.tree, e.own, extra);
}

type Doc = { text: string; value?: string };
type Docs = Record<string, Record<string, Doc>> & { meta?: Record<string, Record<string, Doc>> };
const ALL = ['UCLASS', 'UINTERFACE', 'USTRUCT', 'UENUM', 'UFUNCTION', 'UDELEGATE', 'UPROPERTY', 'UPARAM'];
const NS: Record<string, string[]> = { UC: ['UCLASS'], UI: ['UINTERFACE'], UF: ['UFUNCTION', 'UDELEGATE'], UP: ['UPROPERTY', 'UPARAM'], US: ['USTRUCT'] };
const TAGS: Record<string, string> = { ClassMetadata: 'UCLASS', StructMetadata: 'USTRUCT', PropertyMetadata: 'UPROPERTY', FunctionMetadata: 'UFUNCTION', InterfaceMetadata: 'UINTERFACE', EnumMetadata: 'UENUM' };
const TWINS: Record<string, string> = { UFUNCTION: 'UDELEGATE', UPROPERTY: 'UPARAM' };
const OURS: Record<string, Record<string, string>> = {
  UENUM: { BlueprintType: 'Exposes this enum as a type that can be used for variables in Blueprints.', Flags: 'Marks this enum as bit flags, so its values can be combined.' },
  UPARAM: { ref: 'Makes a reference parameter an input pin in Blueprints instead of an output.', DisplayName: "The name of this parameter's pin in Blueprints." },
  UMETA: { DisplayName: 'The name shown for this enum value in the editor and Blueprints.', ToolTip: 'The tooltip shown for this enum value.', Hidden: 'Hides this enum value in the editor and Blueprints.' },
};
const META = 'Metadata for the editor and Blueprints: meta=(Key="Value", …).';
const HEADER = path.join('Engine', 'Source', 'Runtime', 'CoreUObject', 'Public', 'UObject', 'ObjectMacros.h');

function brief(lines: string[]) {
  const para: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(l.trim());
  }
  let text = para.join(' ').replace(/\[(\w+Metadata)\]\s*/g, '').replace(/\s+/g, ' ').trim();
  if (text.length > 300) {
    const cut = text.slice(0, 300).lastIndexOf('. ');
    text = cut > 60 ? text.slice(0, cut + 1) : text.slice(0, 299).trimEnd() + '…';
  }
  return text;
}

function readDocs(src: string): Docs {
  const out: Docs = { meta: {} };
  let ns = '', section: string[] = [], inEnum = false, open = false, buf: string[] = [];
  const put = (into: Record<string, Record<string, Doc>>, macros: string[], name: string, doc: Doc) => {
    for (const m of macros) for (const x of TWINS[m] ? [m, TWINS[m]] : [m]) (into[x] ||= {})[name] ||= doc;
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const n = /^namespace\s+(\w+)/.exec(line);
    if (n) {
      ns = n[1];
      section = [];
      continue;
    }
    if (!NS[ns] && ns !== 'UM') continue;
    if (!inEnum) {
      if (line === '}') {
        ns = '';
        continue;
      }
      const usable = /^\/\/\s*Metadata usable in\s+(any UField|U[A-Z]+)/.exec(line);
      if (usable) section = usable[1] === 'any UField' ? ALL : [usable[1]];
      if (/^enum\b/.test(line)) {
        inEnum = true;
        open = line.includes('{');
        buf = [];
      }
      continue;
    }
    if (!open) {
      if (line.startsWith('{')) open = true;
      continue;
    }
    if (line.startsWith('}')) {
      inEnum = false;
      if (ns !== 'UM') ns = '';
      continue;
    }
    const c = /^\/\/\/?(.*)$/.exec(line);
    if (c) {
      buf.push(c[1]);
      continue;
    }
    const m = /^([A-Za-z_]\w*)\s*(?:=[^,/]*)?,?\s*(?:\/\*\s*=?\s*(.*?)\s*\*\/)?/.exec(line);
    if (!m) continue;
    const text = brief(buf), tags = buf.join(' ');
    buf = [];
    if (!text) continue;
    const doc: Doc = m[2] ? { text, value: m[2] } : { text };
    if (ns === 'UM') {
      const tagged = [...tags.matchAll(/\[(\w+Metadata)\]/g)].map((t) => TAGS[t[1]]).filter(Boolean);
      put(out.meta!, [...new Set([...section, ...tagged])], m[1], doc);
    } else put(out, NS[ns], m[1], doc);
  }
  return out;
}

function addOurs(d: Docs) {
  const has = (map: Record<string, Doc> | undefined, k: string) => !!map && Object.keys(map).some((x) => x.toLowerCase() === k.toLowerCase());
  for (const [macro, list] of Object.entries(OURS)) for (const [k, text] of Object.entries(list)) if (!has(d[macro], k)) (d[macro] ||= {})[k] = { text };
  for (const m of ALL) if (!has(d[m], 'meta')) (d[m] ||= {}).meta = { text: META };
  return d;
}

const docCache = new Map<string, { stamp: number; docs: Docs }>();
async function specDocs(engine: string): Promise<Docs> {
  const file = path.join(engine, HEADER);
  const stamp = (await fs.promises.stat(file).catch(() => null))?.mtimeMs;
  if (stamp == null) return {};
  const hit = docCache.get(engine);
  if (hit && hit.stamp === stamp) return hit.docs;
  let docs: Docs = {};
  try {
    docs = readDocs(await fs.promises.readFile(file, 'utf8'));
  } catch {}
  docs = Object.keys(docs).length > 1 || Object.keys(docs.meta || {}).length ? addOurs(docs) : {};
  docCache.set(engine, { stamp, docs });
  return docs;
}

export { specs, specDocs, readDocs, MACROS };
