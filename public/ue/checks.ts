import { addChecker, checksChanged } from '../base/checkers.ts';
import { api, projectOf, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { quietly, setSave } from '../base/util.ts';
import { checkUnreal, lex, rpcDefs, rpcs } from './check.ts';
import type { Known as Names, Parent, Rpc } from './check.ts';
import { bare, receiver } from './members.ts';
import type { Recv } from './members.ts';

export type BuildProblem = { sev: string; file: string; line: number; col: number; code: string; text: string };
let build: { run: number; list: BuildProblem[] } = { run: 0, list: [] };
const anchors = new Map<string, string>();
const norm = (p: string) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
let soon = 0;

export function setBuildProblems(run: number, list: BuildProblem[]) {
  if (run !== build.run) anchors.clear();
  const was = build;
  build = { run, list: list.filter((p) => p.file && p.line > 0) };
  if (was.run === run && was.list.length === build.list.length) return;
  clearTimeout(soon);
  soon = setTimeout(checksChanged, 150) as unknown as number;
}

function nearest(lines: string[], i0: number, want: string): number {
  if (lines[i0] === want) return i0;
  if (!want.trim()) return -1;
  for (let d = 1; d <= 400; d++) {
    if (lines[i0 - d] === want) return i0 - d;
    if (lines[i0 + d] === want) return i0 + d;
  }
  return -1;
}

export type Uht = { state: string; why: string; last: { at: number; ms: number; state: string; messages: BuildProblem[]; manifest: string } | null };
let uhtNow: Uht | null = null;
const uhtAnchors = new Map<string, string>();

export function setUht(v: Uht | null) {
  if (v?.last?.at !== uhtNow?.last?.at) uhtAnchors.clear();
  const redraw = v?.last?.at !== uhtNow?.last?.at;
  uhtNow = v;
  if (redraw) checksChanged();
  page.renderSettings?.();
}
export const ueUht = () => uhtNow;

function placeBuild(text: string, abs: string | null, list = build.list, marks = anchors, source = 'build') {
  if (!abs || !list.length) return [];
  const me = norm(abs), mine = list.filter((p) => norm(p.file) === me);
  if (!mine.length) return [];
  const lines = text.split('\n'), starts: number[] = [];
  for (let i = 0, at = 0; i < lines.length; at += lines[i].length + 1, i++) starts.push(at);
  const out = [];
  for (const p of mine) {
    const key = `${me}|${p.line}`;
    let want = marks.get(key);
    if (want == null) {
      if (p.line > lines.length) continue;
      want = lines[p.line - 1];
      marks.set(key, want);
    }
    const i = nearest(lines, Math.min(p.line - 1, lines.length - 1), want);
    if (i < 0) continue;
    const ls = starts[i], le = ls + lines[i].length, indent = lines[i].length - lines[i].trimStart().length;
    const from = Math.min(le, ls + (p.col > 0 ? p.col - 1 : indent));
    out.push({
      from,
      to: le,
      severity: p.sev === 'error' ? 'error' : 'warning',
      source,
      message: `${p.code ? p.code + ': ' : ''}${p.text}`,
      actions: pref('ue:ask') ? [{ name: 'Ask the agent', run: () => askAgent(p) }] : [],
    });
  }
  return out;
}

export async function askAgent(p: BuildProblem) {
  const root = norm(projectOf(S.pid)?.path || ''), file = p.file.replace(/\\/g, '/');
  const rel = root && norm(file).startsWith(root + '/') ? file.slice(root.length + 1) : file;
  const what = p.sev === 'error' ? 'error' : 'warning';
  const who = await page.toChat?.({ text: `Fix this build ${what}${p.code ? ' ' + p.code : ''}: ${p.text}`, from: p.line ? `${rel}:${p.line}` : rel });
  if (who) setSave(`build ${what} added to ${who}: write what you want, then send`);
}

type Known = { busy?: boolean; unreal?: boolean; tables?: Record<string, string[]> | null; docs?: Docs; engine?: string; failed?: boolean };
const known = new Map<string, Known>();
const keyOf = () => `${S.wid || ''}|${S.pid || ''}`;

async function load(key: string, pid: string, wid: string) {
  known.set(key, { busy: true });
  try {
    const choice = (await api('GET', '/api/ue', undefined, pid, wid))?.ue || {};
    const r = await api('POST', '/api/ue/specs', { uproject: choice.uproject || '', engine: choice.engine || '' }, pid, wid);
    known.set(key, { unreal: !['none', 'bad-json', 'os'].includes(r.why), tables: r.tables || null, docs: r.docs || {}, engine: r.engine || '' });
  } catch {
    known.set(key, { unreal: false, tables: null, failed: true });
  }
  checksChanged();
  page.renderSettings?.();
}

function project() {
  if (!S.pid) return null;
  const key = keyOf();
  const k = known.get(key);
  if (!k) loading.set(key, load(key, S.pid, S.wid || ''));
  return k && !k.busy ? k : null;
}

const loading = new Map<string, Promise<void>>();
async function projectNow() {
  const p = project();
  if (p || !S.pid) return p;
  await loading.get(keyOf());
  return project();
}

type Answers = { types: Map<string, { ok: boolean; near?: string; at: number }>; macros: Map<string, { ok: boolean; at: number }>; parents: Map<string, { r: Parent; at: number }>; api: Map<string, string | null>; busy: boolean; again: number };
const PARENTS = 10000;
const answers = new Map<string, Answers>();
const STALE = 4000;
const RETRY = 3000;

function answersFor(key: string) {
  let a = answers.get(key);
  if (!a) answers.set(key, (a = { types: new Map(), macros: new Map(), parents: new Map(), api: new Map(), busy: false, again: 0 }));
  return a;
}

function names(abs: string | null): Names {
  const a = answersFor(keyOf()), now = Date.now();
  const fresh = (r: { ok: boolean; at: number } | undefined) => (r && (r.ok || now - r.at < STALE) ? r : undefined);
  const file = abs || '';
  return {
    type: (n) => fresh(a.types.get(n)),
    macro: (n) => fresh(a.macros.get(n))?.ok,
    api: a.api.has(file) ? a.api.get(file) : undefined,
    parent(n) {
      const r = a.parents.get(n);
      if (r && now - r.at > PARENTS) this.ask.parents!.add(n);
      return r?.r;
    },
    ask: { types: new Set(), macros: new Set(), parents: new Set() },
  };
}

async function ask(n: Names, abs: string | null) {
  const key = keyOf(), a = answersFor(key), pid = S.pid, wid = S.wid || '';
  const file = abs || '';
  if (a.busy || Date.now() < a.again || !pid) return;
  const parents = n.ask.parents || new Set<string>();
  if (!n.ask.types.size && !n.ask.macros.size && !parents.size && (n.api !== undefined || !file)) return;
  a.busy = true;
  try {
    const choice = (await api('GET', '/api/ue', undefined, pid, wid))?.ue || {};
    const r = await api('POST', '/api/ue/known', { uproject: choice.uproject || '', engine: choice.engine || '', file, types: [...n.ask.types], macros: [...n.ask.macros], parents: [...parents] }, pid, wid);
    if (!r?.ready) {
      a.again = Date.now() + RETRY;
      setTimeout(checksChanged, RETRY + 50);
      return;
    }
    const at = Date.now();
    for (const [k, v] of Object.entries(r.types || {}) as [string, { ok: boolean; near?: string }][]) a.types.set(k, { ...v, at });
    for (const [k, v] of Object.entries(r.macros || {})) a.macros.set(k, { ok: !!v, at });
    const changed = Object.entries(r.parents || {}).some(([k, v]) => JSON.stringify(a.parents.get(k)?.r) !== JSON.stringify(v));
    for (const [k, v] of Object.entries(r.parents || {}) as [string, Parent][]) a.parents.set(k, { r: v, at });
    if (!changed && !n.ask.types.size && !n.ask.macros.size && (n.api !== undefined || !file)) return;
    if (file) a.api.set(file, r.api || null);
    checksChanged();
  } catch {
    a.again = Date.now() + RETRY * 5;
  } finally {
    a.busy = false;
  }
}

export const ueChecksFor = () => project();

export function refreshChecks() {
  known.clear();
  answers.clear();
  owners.clear();
  heads.clear();
  checksChanged();
}

addChecker({
  id: 'unreal',
  wants: (name) => pref('ue:on') && /\.(h|hpp)$/i.test(name),
  run(text: string, name: string, abs: string | null) {
    if (!pref('ue:on')) return [];
    const p = project();
    if (!p?.unreal) return [];
    let marks: ReturnType<typeof checkUnreal> = [];
    if (pref('ue:checks')) {
      const n = names(abs);
      marks = checkUnreal(text, name, p.tables as Record<string, string[]> | null, n);
      ask(n, abs);
    }
    if (!pref('ue:uht') || !uhtNow?.last?.messages.length) return marks;
    const lineOf = (at: number) => text.slice(0, at).split('\n').length;
    const ours = new Set(marks.filter((m) => m.severity !== 'hint').map((m) => lineOf(m.from)));
    const uht = placeBuild(text, abs, uhtNow.last.messages, uhtAnchors, 'Unreal Header Tool').filter((m) => !ours.has(lineOf(m.from)));
    return [...marks, ...uht];
  },
});

addChecker({
  id: 'unreal-build',
  wants: (name) => pref('ue:on') && /\.(h|hh|hpp|hxx|inl|c|cc|cpp|cxx|cs)$/i.test(name),
  run(text: string, _name: string, abs: string | null) {
    if (!pref('ue:on') || !pref('ue:buildmarks')) return [];
    return placeBuild(text, abs);
  },
});

const SPEC_MACROS = new Set(['UCLASS', 'USTRUCT', 'UENUM', 'UINTERFACE', 'UFUNCTION', 'UPROPERTY', 'UPARAM', 'UDELEGATE', 'UMETA']);
const REFLECT = ['UPROPERTY', 'UFUNCTION', 'UCLASS', 'USTRUCT', 'UENUM', 'UINTERFACE', 'UMETA', 'UPARAM', 'GENERATED_BODY'];
const LOOK = 2000;
type At = { macro: string; meta: boolean; name: boolean };

export function specAt(text: string, pos: number): At | null {
  const stack: { word: string; meta: boolean }[] = [];
  let i = 0;
  for (; i < pos; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (j >= pos) return null;
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      const j = text.indexOf('\n', i);
      if (j < 0 || j >= pos) return null;
      i = j;
    } else if (c === '/' && text[i + 1] === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0 || j + 2 > pos) return null;
      i = j + 1;
    } else if (c === '(') {
      const m = /(\w+)\s*(=\s*)?$/.exec(text.slice(Math.max(0, i - 80), i));
      stack.push({ word: m ? m[1] : '', meta: !!m && m[1].toLowerCase() === 'meta' });
    } else if (c === ')') stack.pop();
    else if ((c === ';' || c === '{' || c === '}') && stack.length) stack.length = 0;
  }
  let k = stack.length - 1;
  while (k >= 0 && !SPEC_MACROS.has(stack[k].word)) k--;
  if (k < 0) return null;
  const inner = stack.slice(k + 1);
  if (inner.length > 1 || (inner.length === 1 && !inner[0].meta)) return null;
  const meta = inner.length === 1 && stack[k].word !== 'UMETA';
  let j = pos - 1;
  while (j >= 0 && /\s/.test(text[j])) j--;
  return { macro: stack[k].word, meta, name: j >= 0 && (text[j] === '(' || text[j] === ',') };
}

type Doc = { text: string; value?: string };
type Docs = Record<string, Record<string, Doc>> & { meta?: Record<string, Record<string, Doc>> };

function docOf(p: Known, at: At, name: string): Doc | null {
  const map = at.meta ? p.docs?.meta?.[at.macro] : p.docs?.[at.macro];
  if (!map) return null;
  const low = name.toLowerCase();
  for (const k in map) if (k.toLowerCase() === low) return map[k];
  return null;
}

const COMMON: Record<string, string[]> = {
  UPROPERTY: ['EditAnywhere', 'EditDefaultsOnly', 'EditInstanceOnly', 'VisibleAnywhere', 'VisibleDefaultsOnly', 'VisibleInstanceOnly', 'BlueprintReadWrite', 'BlueprintReadOnly', 'Category', 'meta', 'Transient', 'Replicated', 'ReplicatedUsing', 'SaveGame', 'Config', 'Instanced', 'BlueprintAssignable', 'BlueprintCallable', 'AdvancedDisplay', 'NoClear', 'Interp', 'Export'],
  UFUNCTION: ['BlueprintCallable', 'BlueprintPure', 'BlueprintImplementableEvent', 'BlueprintNativeEvent', 'Category', 'meta', 'Server', 'Client', 'NetMulticast', 'Reliable', 'Unreliable', 'WithValidation', 'CallInEditor', 'Exec', 'BlueprintAuthorityOnly', 'BlueprintCosmetic'],
  UCLASS: ['Blueprintable', 'BlueprintType', 'Abstract', 'NotBlueprintable', 'meta', 'ClassGroup', 'Config', 'EditInlineNew', 'DefaultToInstanced', 'MinimalAPI', 'Within', 'Transient', 'HideCategories', 'ShowCategories', 'Placeable', 'NotPlaceable', 'Const', 'Deprecated'],
  USTRUCT: ['BlueprintType', 'meta', 'Atomic', 'Immutable', 'NoExport'],
  UENUM: ['BlueprintType', 'meta', 'Flags'],
  UINTERFACE: ['Blueprintable', 'BlueprintType', 'MinimalAPI', 'meta', 'NotBlueprintable'],
  UPARAM: ['ref', 'DisplayName', 'meta'],
};
const GROUPS = [
  ['editanywhere', 'editdefaultsonly', 'editinstanceonly', 'visibleanywhere', 'visibledefaultsonly', 'visibleinstanceonly'],
  ['blueprintreadonly', 'blueprintreadwrite'],
  ['server', 'client', 'netmulticast'],
  ['reliable', 'unreliable'],
  ['blueprintimplementableevent', 'blueprintnativeevent'],
  ['blueprintable', 'notblueprintable'],
  ['placeable', 'notplaceable'],
];

function argsAround(before: string, after: string, macro: string) {
  const re = new RegExp(`\\b${macro}\\s*\\(`, 'g');
  let open = -1;
  for (let m; (m = re.exec(before)); ) open = m.index + m[0].length;
  if (open < 0) return '';
  let d = 0, end = after.length;
  for (let i = 0; i < after.length; i++) {
    if (after[i] === '(') d++;
    else if (after[i] === ')' && d-- === 0) {
      end = i;
      break;
    }
  }
  return before.slice(open) + '\u0000' + after.slice(0, end);
}

function usedIn(args: string) {
  const used = new Set<string>();
  let d = 0, word = '', key = true;
  for (const c of args + ',') {
    if (c === '(') d++;
    else if (c === ')') d--;
    if (d > 0) continue;
    if (/\w/.test(c) && key) word += c;
    else {
      if (c === '\u0000') word = '';
      if (word) used.add(word.toLowerCase());
      word = '';
      if (c === '=') key = false;
      if (c === ',') key = true;
    }
  }
  return used;
}

function privateAt(before: string) {
  let best: { at: number; kind: string } | null = null;
  for (const m of before.matchAll(/\b(UCLASS|USTRUCT|UINTERFACE)\s*\([^)]*\)\s*(class|struct)\b/g)) best = { at: m.index! + m[0].length, kind: m[2] };
  if (!best) return false;
  const body = before.slice(best.at);
  let access = best.kind === 'class' ? 'private' : 'public';
  for (const m of body.matchAll(/\b(public|private|protected)\s*:(?!:)|\bGENERATED_(UCLASS|USTRUCT|UINTERFACE)_BODY\b/g)) access = m[1] || 'public';
  return access === 'private';
}

export function fitSpecs(names: string[], at: At, before: string, after: string) {
  if (at.meta) return names.map((n) => ({ n, boost: 0 }));
  const args = argsAround(before, after, at.macro), used = usedIn(args);
  const gone = new Set(used);
  for (const g of GROUPS) if (g.some((x) => used.has(x))) g.forEach((x) => gone.add(x));
  if (at.macro === 'UPROPERTY' && !/AllowPrivateAccess/i.test(args) && privateAt(before)) ['blueprintreadonly', 'blueprintreadwrite'].forEach((x) => gone.add(x));
  const common = (COMMON[at.macro] || []).map((x) => x.toLowerCase());
  return names.filter((n) => !gone.has(n.toLowerCase())).map((n) => {
    const i = common.indexOf(n.toLowerCase());
    return { n, boost: i < 0 ? -50 : 40 - i };
  });
}

function specNames(p: Known, at: At): string[] {
  if (at.meta) return Object.keys(p.docs?.meta?.[at.macro] || {}).sort((a, b) => a.localeCompare(b));
  const list = (p.tables as Record<string, string[]> | null)?.[at.macro];
  if (list) return list;
  return Object.keys(p.docs?.[at.macro] || {}).sort((a, b) => a.localeCompare(b));
}
const ue = async (url: string, body: Record<string, unknown>) => {
  const pid = S.pid, wid = S.wid || '';
  const choice = (await api('GET', '/api/ue', undefined, pid, wid))?.ue || {};
  return api('POST', url, { uproject: choice.uproject || '', engine: choice.engine || '', ...body }, pid, wid);
};

const RPC = { server: ['Server', 'Called on the owning client, it runs on the server.'], client: ['Client', 'Called on the server, it runs on the owning client.'], multicast: ['Multicast', 'Called on the server, it runs on the server and every client.'] };
const HEADER = /\.(h|hh|hpp|hxx|inl)$/i;
const owners = new Map<string, { header: string | null; busy: boolean; again: number }>();
const heads = new Map<string, { names: Map<string, Rpc>; sig: string; at: number; busy: boolean }>();
const label = (r: Rpc, at: number) => ({ at, text: RPC[r.kind][0], tip: `${RPC[r.kind][0]} RPC\n${RPC[r.kind][1]} ${r.reliable ? 'Reliable: it always arrives.' : 'Unreliable: it can be dropped when the network is busy.'}` });

function remember(abs: string, list: Rpc[]) {
  const key = norm(abs), sig = list.map((r) => `${r.cls}::${r.name}:${r.kind}:${r.reliable}`).join('|');
  const was = heads.get(key);
  heads.set(key, { names: new Map(list.map((r) => [`${r.cls}::${r.name}`, r])), sig, at: Date.now(), busy: false });
  if (was && was.sig !== sig) setTimeout(checksChanged);
}

async function readHead(abs: string) {
  const key = norm(abs), root = projectOf(S.pid)?.path || '', file = abs.replace(/\\/g, '/');
  const h = heads.get(key);
  if (h?.busy) return;
  heads.set(key, { names: h?.names || new Map(), sig: h?.sig || '', at: Date.now(), busy: true });
  const inside = root && key.startsWith(norm(root) + '/');
  const text = inside ? ((await quietly(api('GET', '/api/file?path=' + encodeURIComponent(file.slice(norm(root).length + 1))), null)) as { content?: string } | null)?.content || '' : '';
  remember(abs, rpcs(text));
}

async function findOwner(key: string, cls: string) {
  owners.set(key, { header: null, busy: true, again: 0 });
  const r = await quietly(ue('/api/ue/where', { name: cls }), null);
  if (!r?.ready) {
    owners.set(key, { header: null, busy: false, again: Date.now() + RETRY });
    if (r) setTimeout(checksChanged, RETRY + 50);
    return;
  }
  const header = (r.places as { abs: string; kind: string }[]).find((x) => x.kind === 'type' && HEADER.test(x.abs))?.abs || null;
  owners.set(key, { header, busy: false, again: Infinity });
  if (!header) return;
  await readHead(header);
  checksChanged();
}

function rpcOf(cls: string, fn: string) {
  const key = `${keyOf()}|${cls}`, o = owners.get(key);
  if (!o || (!o.busy && !o.header && Date.now() > o.again)) {
    findOwner(key, cls);
    return null;
  }
  if (!o.header) return null;
  const h = heads.get(norm(o.header));
  if (!h || Date.now() - h.at > STALE) readHead(o.header);
  return h?.names.get(`${cls}::${fn}`) || null;
}

function rpcLabels(text: string, name: string, abs: string | null) {
  if (!pref('ue:on') || !pref('ue:rpc') || !project()?.unreal) return [];
  if (HEADER.test(name)) {
    const list = rpcs(text);
    if (abs) remember(abs, list);
    return list.map((r) => label(r, r.at));
  }
  return rpcDefs(text).flatMap((d) => {
    const r = rpcOf(d.cls, d.name);
    return r ? [label(r, d.at)] : [];
  });
}

async function openAt(abs: string, line: number) {
  await page.openFiles([abs]);
  (await import('../app/tabs.ts')).goLineOf(abs, line);
  return true;
}

export async function goToName(word: string, from: string | null) {
  const p = await projectNow();
  if (!p?.unreal) return false;
  const r = await ue('/api/ue/where', { name: word }).catch(() => null);
  const places: { abs: string; line: number }[] = r?.places || [];
  if (!places.length) return false;
  const here = norm(from || '');
  const best = places.find((x) => norm(x.abs) !== here) || places[0];
  return openAt(best.abs, best.line);
}

type Listed = { name: string; kind: string; owner: string; decl: string; abs: string; line: number; static?: boolean };
type MemberAsk = { from: Recv['from']; steps?: Recv['steps']; op: string; name?: string };
const asked = new Map<string, { at: number; r: Promise<{ type: string; list: Listed[]; places: Listed[] } | null> }>();

let indexBusy = false;

function memberAsk(q: MemberAsk) {
  const key = `${keyOf()}|${JSON.stringify(q)}`, now = Date.now(), had = asked.get(key);
  if (had && now - had.at < STALE) return had.r;
  const r: Promise<{ type: string; list: Listed[]; places: Listed[] } | null> = ue('/api/ue/members', q).then(
    (x) => {
      indexBusy = !x?.ready && /^(none|building)$/.test(x?.index?.state || '');
      if (!x?.ready && asked.get(key)?.r === r) asked.delete(key);
      return x?.ready ? x : null;
    },
    () => null,
  );
  asked.set(key, { at: now, r });
  if (asked.size > 200) asked.delete(asked.keys().next().value!);
  return r;
}

const lineAt = (text: string, pos: number) => {
  let n = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < pos; i = text.indexOf('\n', i + 1)) n++;
  return n;
};

async function goToMember(word: string, abs: string | null, ctx: { text: string; pos: number; jump(at: number): void }) {
  const p = await projectNow();
  if (!p?.unreal) return false;
  const here = norm(abs || ''), line = lineAt(ctx.text, ctx.pos);
  const away = (x: Listed) => !(norm(x.abs) === here && x.line === line);
  const rc = receiver(ctx.text, ctx.pos);
  if (rc) {
    const r = await memberAsk({ from: rc.from, steps: rc.steps, op: rc.op, name: word });
    const best = r?.places.find(away) || null;
    if (best) return openAt(best.abs, best.line);
    return rc.op === '::' ? goToName(word, abs) : false;
  }
  const b = bare(ctx.text, ctx.pos, ctx.pos + word.length);
  if (b.local) {
    ctx.jump(b.local.at);
    return true;
  }
  if (b.self) {
    const r = await memberAsk({ from: { type: b.self }, op: '.', name: word });
    const best = r?.places.find(away) || null;
    if (best) return openAt(best.abs, best.line);
  }
  return goToName(word, abs);
}

const MEMBER_KIND: Record<string, string> = { fn: 'method', var: 'property', type: 'class', value: 'enum' };
const option = (m: Listed, boost = 0) => ({ label: m.name, type: MEMBER_KIND[m.kind] || 'variable', detail: m.owner, info: m.decl, boost });

async function memberOptions(text: string, from: number, alive: () => boolean) {
  if (!/(->|\.|::)\s*$/.test(text.slice(Math.max(0, from - 8), from))) return null;
  const rc = receiver(text, from);
  if (!rc) return null;
  const q = { from: rc.from, steps: rc.steps, op: rc.op };
  let r = await memberAsk(q);
  for (let i = 0; !r && indexBusy && alive() && i < 120; i++) {
    await new Promise((ok) => setTimeout(ok, 1000));
    if (alive()) r = await memberAsk(q);
  }
  if (!r?.list.length) return null;
  const owners = [...new Set(r.list.map((m) => m.owner))];
  return r.list.map((m) => option(m, -Math.min(30, owners.indexOf(m.owner))));
}

async function selfOptions(text: string, from: number, to: number): Promise<ReturnType<typeof option>[]> {
  const b = bare(text, from, to);
  if (!b.inFn || !b.self) return [];
  const r = await memberAsk({ from: { type: b.self }, op: '.' });
  const low = text.slice(from, to).toLowerCase();
  return (r?.list || []).filter((m) => m.kind !== 'value' && m.name.toLowerCase().startsWith(low)).map((m) => option(m, 10));
}

const KEYWORDS = new Set(('alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue decltype default delete do double dynamic_cast else enum explicit export extern false final float for friend goto if inline int long mutable namespace new noexcept not nullptr operator or override private protected public register reinterpret_cast return short signed sizeof static static_assert static_cast struct switch template this throw true try typedef typeid typename union unsigned using virtual void volatile while').split(' '));

function inCode(text: string, at: number) {
  const toks = lex(text.slice(0, at + 1));
  const last = toks[toks.length - 1];
  return !!last && last.t === 'id' && last.from === at;
}

type Card = { kind: string; name: string; owner?: string; decl: string; abs: string; line: number; comment: string };
const cards = new Map<string, { at: number; r: Promise<Card | null> }>();

function aboutAsk(q: Record<string, unknown>) {
  const key = `${keyOf()}|${JSON.stringify(q)}`, now = Date.now(), had = cards.get(key);
  if (had && now - had.at < STALE) return had.r;
  const r: Promise<Card | null> = ue('/api/ue/about', q).then((x) => (x?.ready ? x.card || null : null), () => null);
  cards.set(key, { at: now, r });
  if (cards.size > 200) cards.delete(cards.keys().next().value!);
  return r;
}

const fileOf = (abs: string) => abs.split(/[\\/]/).pop() || abs;
const KIND: Record<string, string> = { fn: 'function', var: 'property', value: 'value', type: 'type', class: 'class', struct: 'struct', enum: 'enum', union: 'union', macro: 'macro' };

function shownCard(c: Card) {
  const who = c.owner ? `${c.owner}::${c.name}` : c.name;
  return { title: `${who}, ${KIND[c.kind] || c.kind} in ${fileOf(c.abs)}:${c.line}`, code: c.decl, text: c.comment };
}

async function nameCard(doc: string, from: number, name: string, abs: string | null) {
  const rc = receiver(doc, from);
  if (rc) {
    const c = await aboutAsk({ from: rc.from, steps: rc.steps, op: rc.op, name });
    return c ? shownCard(c) : null;
  }
  const b = bare(doc, from, from + name.length);
  if (b.local) {
    const ls = doc.lastIndexOf('\n', b.local.at) + 1, le = doc.indexOf('\n', b.local.at);
    return { title: `${name}, a local variable`, code: doc.slice(ls, le < 0 ? doc.length : le).trim(), text: '' };
  }
  if (b.self) {
    const c = await aboutAsk({ from: { type: b.self }, op: '.', name });
    if (c) return shownCard(c);
  }
  const c = await aboutAsk({ name });
  return c ? shownCard(c) : null;
}

addChecker({
  id: 'unreal-nav',
  wants: (name) => pref('ue:on') && /\.(h|hh|hpp|hxx|inl|c|cc|cpp|cxx)$/i.test(name),
  run: () => [],
  labels: rpcLabels,
  goto: (word: string, _name: string, abs: string | null, ctx?: { text: string; pos: number; jump(at: number): void }) => (ctx ? goToMember(word, abs, ctx) : goToName(word, abs)),
  async complete(ctx: { pos: number; explicit: boolean; aborted: boolean; matchBefore(re: RegExp): { from: number; to: number; text: string } | null; state: { sliceDoc(a: number, b: number): string } }) {
    const p = await projectNow();
    if (!p?.unreal) return null;
    const start = Math.max(0, ctx.pos - LOOK);
    const word = ctx.matchBefore(/[A-Za-z_]\w*/);
    const from = word ? word.from : ctx.pos;
    const text = ctx.state.sliceDoc(start, ctx.pos);
    const at = specAt(text, from - start);
    if (at) {
      if (!at.name) return null;
      const options = fitSpecs(specNames(p, at), at, ctx.state.sliceDoc(0, ctx.pos), ctx.state.sliceDoc(ctx.pos, ctx.pos + 1000)).map(({ n, boost }) => {
        const d = docOf(p, at, n);
        return { label: n, boost, type: 'keyword', detail: d?.value ? `${at.meta ? 'meta' : at.macro} = ${d.value}` : at.meta ? `${at.macro} meta` : at.macro, ...(d ? { info: d.text } : {}) };
      });
      return options.length ? { from, options, validFor: /^\w*$/ } : null;
    }
    const upto = ctx.state.sliceDoc(0, ctx.pos);
    const mem = await memberOptions(upto, from, () => !ctx.aborted);
    if (mem) return { from, options: mem, validFor: /^\w*$/ };
    if (word && !ctx.explicit && /^[a-z]/.test(word.text)) {
      const low = word.text.toLowerCase();
      const hits = word.text.length >= 3 ? REFLECT.filter((m) => m.toLowerCase().startsWith(low)) : [];
      const own = word.text.length >= 2 ? await selfOptions(upto, word.from, ctx.pos) : [];
      const options = [...own, ...hits.map((m) => ({ label: m, type: 'constant', detail: 'Unreal' }))];
      return options.length ? { from: word.from, options } : null;
    }
    if (!word || word.text.length < 2 || (!ctx.explicit && !/^[A-Z]/.test(word.text))) return null;
    const [r, own] = await Promise.all([ue('/api/ue/complete', { prefix: word.text }).catch(() => null), selfOptions(upto, word.from, ctx.pos)]);
    const seen = new Set(own.map((o) => o.label));
    const names = (r?.names || []).filter((n: { name: string }) => !seen.has(n.name)).map((n: { name: string; from: string; kind: string }) => ({ label: n.name, type: n.kind === 'type' ? 'class' : 'constant', detail: n.from }));
    const options = [...own, ...names];
    return options.length ? { from: word.from, options } : null;
  },
  async hover(text: string, pos: number, _name: string, abs: string | null, ctx?: { text(): string; pos: number }) {
    const p = project();
    if (!p?.unreal) return null;
    let a = pos, b = pos;
    while (a > 0 && /\w/.test(text[a - 1])) a--;
    while (b < text.length && /\w/.test(text[b])) b++;
    if (a === b || !/^[A-Za-z_]/.test(text[a])) return null;
    const at = specAt(text, a);
    const name = text.slice(a, b);
    if (at?.name) {
      if (!pref('ue:spechelp')) return null;
      const d = docOf(p, at, name);
      if (!d) return null;
      const known = at.meta ? Object.keys(p.docs?.meta?.[at.macro] || {}) : Object.keys(p.docs?.[at.macro] || {});
      const shown = known.find((k) => k.toLowerCase() === name.toLowerCase()) || name;
      return { from: a, to: b, title: `${shown}, a ${at.meta ? 'meta' : at.macro} specifier`, text: d.text };
    }
    if (!pref('ue:namehelp') || !ctx || KEYWORDS.has(name) || !inCode(text, a)) return null;
    const card = await nameCard(ctx.text(), ctx.pos - (pos - a), name, abs);
    return card ? { from: a, to: b, ...card } : null;
  },
});

onPref('ue:on', () => refreshChecks());
onPref('ue:checks', () => checksChanged());
onPref('ue:buildmarks', () => checksChanged());
onPref('ue:ask', () => checksChanged());
onPref('ue:rpc', () => checksChanged());
onPref('ue:uht', () => checksChanged());
