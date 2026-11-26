const MACROS = new Set(['UCLASS', 'UINTERFACE', 'USTRUCT', 'UENUM', 'UFUNCTION', 'UDELEGATE', 'UPROPERTY', 'UPARAM']);
const REFLECT = new Set(['UCLASS', 'UINTERFACE', 'USTRUCT', 'UENUM', 'UFUNCTION', 'UDELEGATE', 'UPROPERTY']);
const BYREF = new Set(['FString', 'TArray', 'TOptional', 'FAnsiString', 'FUtf8String']);
const EXPOSED = new Set([...['editanywhere', 'editinstanceonly', 'editdefaultsonly', 'visibleanywhere', 'visibleinstanceonly', 'visibledefaultsonly'], 'blueprintreadonly', 'blueprintreadwrite', 'blueprintgetter', 'blueprintsetter', 'interp', 'blueprintassignable', 'blueprintcallable']);
const BPVISIBLE = new Set(['blueprintreadonly', 'blueprintreadwrite', 'blueprintgetter', 'blueprintsetter', 'interp']);
const ENUM_BASES = new Set(['uint8', 'uint16', 'uint32', 'uint64', 'int8', 'int16', 'int32', 'int64', 'int']);
const RIGVM = ['input', 'output', 'visible', 'constant'];
const RANGE = new Set(['clampmin', 'clampmax', 'uimin', 'uimax']);
const TYPE_MACROS = new Set(['UCLASS', 'UINTERFACE', 'USTRUCT']);
const GENERATED = /^GENERATED_(BODY|UCLASS_BODY|USTRUCT_BODY|UINTERFACE_BODY|IINTERFACE_BODY|BODY_LEGACY)$/;
const EDIT = new Set(['editanywhere', 'editinstanceonly', 'editdefaultsonly', 'visibleanywhere', 'visibleinstanceonly', 'visibledefaultsonly']);
const NET = new Set(['server', 'client', 'netmulticast']);
const SERVICE = new Set(['servicerequest', 'serviceresponse']);
const MODIFIERS = new Set(['virtual', 'static', 'inline', 'explicit', 'constexpr', 'friend', 'FORCEINLINE', 'FORCENOINLINE', 'FORCEINLINE_DEBUGGABLE']);
const RECOGNIZED = new Set(['WITH_EDITORONLY_DATA', 'WITH_EDITOR', 'WITH_ENGINE', 'WITH_COREUOBJECT', 'WITH_VERSE_VM', 'WITH_VERSE_BPVM', 'WITH_TESTS']);
const NOT_WORD = { WITH_ENGINE: 1, WITH_COREUOBJECT: 1 };

const ALLCAPS = /^[A-Z][A-Z0-9_]*$/;
const TYPE_NAME = /^[UAFTEI][A-Z][A-Za-z0-9_]*$/;
const SLOT = { class: 'UCLASS', struct: 'USTRUCT', enum: 'UENUM' } as Record<string, string>;

export type Parent = { ok: boolean; chain?: string[]; complete?: boolean; actor?: boolean; deprecated?: boolean; props?: [string, string, number][]; fns?: [string, string, number, number][]; iface?: { cannot: boolean; fns: [string, number, number, number, string][] } | null };
export type Known = { type(n: string): { ok: boolean; near?: string } | undefined; macro(n: string): boolean | undefined; api: string | null | undefined; parent?(n: string): Parent | undefined; ask: { types: Set<string>; macros: Set<string>; parents?: Set<string> } };

export type Tok = { t: string; v: string; rest?: string; from: number; to: number; on?: boolean; why?: { tok: Tok; skip: boolean; open: Tok } };
type Item = { name: string; low: string; tok: Tok; value: string | null; at: number };
type Change = { from: number; to: number; insert: string };
type Action = { name: string; changes: Change[] };
type Mark = { from: number; to: number; severity: string; message: string; source: string; actions?: Action[] };
type Fn = { macro: Tok; end: Tok; name: Tok | null; event: boolean; callable: boolean; internal: boolean; params: (Tok | null)[]; ret: boolean };
type UType = { macro: string; tok: Tok; noExport: boolean; keyword: boolean; gen?: boolean; closed?: boolean; kind?: string; name?: Tok | null; api?: Tok | null; base?: boolean; bases?: string[]; list?: Item[] | null; end?: Tok; rbrace?: Tok; fns: Fn[]; props?: Tok[]; native?: UType; bp?: Mark; rig?: boolean };

export function lex(src: string) {
  const out: Tok[] = [], n = src.length;
  let i = 0, lineStart = true;
  const isId = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$' || (c >= '0' && c <= '9');
  while (i < n) {
    const c = src[i];
    if (c === '\n') {
      lineStart = true;
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') {
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '#' && lineStart) {
      const from = i;
      let text = '';
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\' && (src[i + 1] === '\n' || (src[i + 1] === '\r' && src[i + 2] === '\n'))) {
          i += src[i + 1] === '\r' ? 3 : 2;
          text += ' ';
          continue;
        }
        if (src[i] === '/' && src[i + 1] === '/') {
          while (i < n && src[i] !== '\n') i++;
          break;
        }
        if (src[i] === '/' && src[i + 1] === '*') {
          const e = src.indexOf('*/', i + 2);
          i = e < 0 ? n : e + 2;
          text += ' ';
          continue;
        }
        text += src[i++];
      }
      const m = /^#\s*(\w+)\s*([\s\S]*)$/.exec(text.trim());
      out.push({ t: 'pp', v: m ? m[1] : '', rest: m ? m[2].trim() : '', from, to: from + text.trimEnd().length });
      continue;
    }
    lineStart = false;
    const from = i;
    if (isId(c) && !(c >= '0' && c <= '9')) {
      while (i < n && isId(src[i])) i++;
      const v = src.slice(from, i);
      if (src[i] === '"' && /^(R|LR|uR|UR|u8R)$/.test(v)) {
        const open = src.indexOf('(', i);
        const delim = open < 0 ? '' : src.slice(i + 1, open);
        const close = open < 0 ? -1 : src.indexOf(')' + delim + '"', open);
        i = close < 0 ? n : close + delim.length + 2;
        out.push({ t: 'str', v: '', from, to: i });
        continue;
      }
      if ((src[i] === '"' || src[i] === "'") && /^(L|u|U|u8)$/.test(v)) continue;
      out.push({ t: 'id', v, from, to: i });
      continue;
    }
    if (c >= '0' && c <= '9') {
      while (i < n && (isId(src[i]) || src[i] === '.' || src[i] === "'" || ((src[i] === '+' || src[i] === '-') && /[eEpP]/.test(src[i - 1])))) i++;
      out.push({ t: 'num', v: src.slice(from, i), from, to: i });
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      out.push({ t: 'str', v: src.slice(from + 1, i - 1), from, to: i });
      continue;
    }
    out.push({ t: 'sym', v: c, from, to: i + 1 });
    i++;
  }
  return out;
}

function directive(rest: string) {
  const m = /^(!?)\s*([A-Za-z_]\w*|\d+)/.exec(rest);
  if (!m) return 'other';
  const not = !!m[1], w = m[2];
  if (w === '0') return 'zero';
  if (w === '1') return 'one';
  if (w === 'CPP') return not ? 'notcpp' : 'cpp';
  if (w === 'WITH_HOT_RELOAD') return 'parsed';
  if (/^UE_VERSION_(NEWER_THAN_OR_EQUAL|NEWER_THAN|OLDER_THAN)$/.test(w)) return 'version';
  if (RECOGNIZED.has(w)) return not ? 'other' : NOT_WORD[w as keyof typeof NOT_WORD] ? 'engine' : 'parsed';
  return 'other';
}

const SKIPPED = new Set(['zero', 'cpp', 'other', 'version']);
const ELSE = { zero: 'one', one: 'zero', notcpp: 'cpp', cpp: 'notcpp', engine: 'other' };

export function activity(tokens: Tok[]) {
  const stack: { d: string; w: string; tok: Tok; open: Tok }[] = [];
  const word = (rest: string) => /^!?\s*([A-Za-z_]\w*|\d+)/.exec(rest)?.[1] || '';
  let bad = false;
  for (const t of tokens) {
    if (t.t !== 'pp') {
      t.on = !stack.some((e) => SKIPPED.has(e.d));
      if (t.t !== 'id' || !REFLECT.has(t.v)) continue;
      const top = stack[stack.length - 1];
      if (!t.on && top.d !== 'zero' && top.d !== 'version' && top.w !== 'WITH_EDITORONLY_DATA') t.why = { tok: top.tok, skip: true, open: top.open };
      const eng = t.on && stack.find((e) => e.d === 'engine');
      if (eng) t.why = { tok: eng.tok, skip: false, open: eng.open };
      continue;
    }
    if (t.v === 'if') stack.push({ d: directive(t.rest!), w: word(t.rest!), tok: t, open: t });
    else if (t.v === 'ifdef' || t.v === 'ifndef') stack.push({ d: 'other', w: '', tok: t, open: t });
    else if (t.v === 'elif') {
      if (!stack.length) bad = true;
      else Object.assign(stack[stack.length - 1], { d: directive(t.rest!), w: word(t.rest!), tok: t });
    } else if (t.v === 'else') {
      if (!stack.length) bad = true;
      else {
        const top = stack[stack.length - 1];
        Object.assign(top, { d: ELSE[top.d as keyof typeof ELSE] || top.d, tok: t });
      }
    } else if (t.v === 'endif') {
      if (!stack.length) bad = true;
      else stack.pop();
    }
    t.on = !stack.some((e) => SKIPPED.has(e.d));
  }
  return !bad && !stack.length;
}

export function close(toks: Tok[], i: number) {
  let d = 0;
  for (let j = i; j < toks.length; j++) {
    if (toks[j].v === '(' && toks[j].t === 'sym') d++;
    else if (toks[j].v === ')' && toks[j].t === 'sym' && --d === 0) return j;
  }
  return -1;
}

export function items(toks: Tok[], open: number, end: number) {
  const out: Item[] = [];
  let k = open + 1;
  while (k < end) {
    const name = toks[k];
    if (name.t !== 'id') return null;
    let j = k + 1, value: string | null = null;
    if (toks[j]?.v === '=' && toks[j].t === 'sym') {
      j++;
      const from = j;
      let d = 0;
      while (j < end && !(d === 0 && toks[j].v === ',' && toks[j].t === 'sym')) {
        if (toks[j].t === 'sym' && toks[j].v === '(') d++;
        if (toks[j].t === 'sym' && toks[j].v === ')') d--;
        j++;
      }
      value = toks.slice(from, j).map((t) => (t.t === 'str' ? t.v : t.v)).join('');
    }
    if (j < end && !(toks[j].v === ',' && toks[j].t === 'sym')) return null;
    out.push({ name: name.v, low: name.v.toLowerCase(), tok: name, value, at: k });
    k = j + 1;
  }
  return out;
}

function distance(a: string, b: string) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

function nearest(name: string, list: string[]) {
  const low = name.toLowerCase();
  let best: string | null = null, bd = Infinity;
  for (const x of list) {
    const d = distance(low, x.toLowerCase());
    if (d < bd) [best, bd] = [x, d];
  }
  return best && bd <= Math.max(1, Math.min(3, Math.floor(name.length / 4))) ? best : null;
}

const truthy = (v: string | null) => v == null || !/^(false|0)$/i.test(v.trim());

function declaration(toks: Tok[], from: number) {
  let j = from, paren = -1;
  while (j < toks.length) {
    const t = toks[j];
    if (t.t === 'sym' && (t.v === ';' || t.v === '{' || t.v === '}')) return null;
    if (t.t === 'sym' && t.v === '(') {
      const prev = toks[j - 1];
      if (prev?.t === 'id' && /^[A-Z][A-Z0-9_]*$/.test(prev.v) && j - 1 > from && toks[j - 2]?.t === 'id') {
        const e = close(toks, j);
        if (e < 0) return null;
        j = e + 1;
        continue;
      }
      if (prev?.t === 'id' && j - 1 === from) {
        const e = close(toks, j);
        if (e < 0) return null;
        j = e + 1;
        continue;
      }
      paren = j;
      break;
    }
    j++;
  }
  if (paren < 0 || toks[paren - 1]?.t !== 'id') return null;
  const end = close(toks, paren);
  if (end < 0) return null;
  const pre: any = [];
  for (let k = from; k < paren - 1; k++) {
    const t = toks[k];
    if (t.t === 'id' && /^[A-Z][A-Z0-9_]*$/.test(t.v) && toks[k + 1]?.v === '(') {
      k = close(toks, k + 1);
      if (k < 0) return null;
      continue;
    }
    if (t.t === 'id' && (MODIFIERS.has(t.v) || /_API$/.test(t.v))) {
      if (t.v === 'static') pre.static = true;
      if (t.v === 'virtual') pre.virtual = t;
      if (/_API$/.test(t.v)) pre.api = t;
      continue;
    }
    pre.push(t);
  }
  const params: Tok[][] = [];
  let cur: Tok[] = [], d = 0;
  for (let k = paren + 1; k < end; k++) {
    const t = toks[k];
    if (t.t === 'sym' && (t.v === '(' || t.v === '<' || t.v === '[')) d++;
    if (t.t === 'sym' && (t.v === ')' || t.v === '>' || t.v === ']')) d--;
    if (d === 0 && t.t === 'sym' && t.v === ',') {
      params.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) params.push(cur);
  let fin: Tok | null = null;
  for (let k = end + 1; k < toks.length && k < end + 24; k++) {
    if (toks[k].v === ';' || toks[k].v === '{' || toks[k].v === '}') break;
    if (toks[k].t === 'id' && toks[k].v === 'final') fin = toks[k];
  }
  return { pre, params, name: toks[paren - 1], fin };
}

function typed(p: Tok[]) {
  const q: Tok[] = [];
  for (let k = 0; k < p.length; k++) {
    if (p[k].t === 'id' && p[k].v === 'UPARAM' && p[k + 1]?.v === '(') {
      const e = close(p, k + 1);
      if (e < 0) return null;
      k = e;
      continue;
    }
    q.push(p[k]);
  }
  let j = 0, isConst = false;
  while (q[j]?.t === 'id' && /^(const|class|struct|enum|mutable)$/.test(q[j].v)) {
    if (q[j].v === 'const') isConst = true;
    j++;
  }
  const type = q[j];
  if (!type || type.t !== 'id') return null;
  let e = j;
  while (q[e + 1]?.v === ':' && q[e + 2]?.v === ':' && q[e + 3]?.t === 'id') e += 3;
  let inner: Tok[] = [];
  if (q[e + 1]?.v === '<') {
    const from = e + 2;
    let d = 0;
    for (e = e + 1; e < q.length; e++) {
      if (q[e].v === '<') d++;
      else if (q[e].v === '>' && --d === 0) break;
    }
    if (e >= q.length) return null;
    inner = q.slice(from, e);
  }
  let ref = '', r = e + 1;
  while (q[r] && (q[r].v === 'const' || q[r].v === '&' || q[r].v === '*')) {
    if (q[r].v === 'const') isConst = true;
    else ref += q[r].v;
    r++;
  }
  const name = q[r]?.t === 'id' ? q[r] : null;
  const rest = name ? q.slice(r + 1) : [];
  const stop = rest.findIndex((x) => x.v === '=' || x.v === '{');
  const tail = stop < 0 ? rest : rest.slice(0, stop);
  return { type, last: q[e], inner, isConst, ref, name, arr: tail[0]?.v === '[', bits: tail[0]?.v === ':' && tail[1]?.v !== ':', first: q[0] };
}

function isOutput(param: Tok[]) {
  let d = 0, amp = false, isConst = false;
  for (let k = 0; k < param.length; k++) {
    const t = param[k];
    if (t.t === 'id' && t.v === 'UPARAM') {
      const e = close(param, k + 1);
      if (e < 0) return false;
      k = e;
      continue;
    }
    if (t.t === 'sym' && (t.v === '<' || t.v === '(')) d++;
    if (t.t === 'sym' && (t.v === '>' || t.v === ')')) d--;
    if (d !== 0) continue;
    if (t.t === 'id' && t.v === 'const') isConst = true;
    if (t.t === 'sym' && t.v === '&') amp = true;
    if (t.t === 'sym' && t.v === '=') break;
  }
  return amp && !isConst;
}

export function declarations(src: string): { types: [string, number, number?][]; macros: [string, number][]; classes: [string, number, string, number][] } {
  const all = lex(src), code = all.filter((t) => t.t !== 'pp'), types: [string, number, number?][] = [], macros: [string, number][] = [], classes: [string, number, string, number][] = [];
  const nl: number[] = [];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) nl.push(i);
  const lineOf = (p: number) => {
    let lo = 0, hi = nl.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (nl[m] < p) lo = m + 1;
      else hi = m;
    }
    return lo + 1;
  };
  for (const t of all) {
    if (t.t !== 'pp' || t.v !== 'define') continue;
    const m = /^([A-Za-z_]\w*)/.exec(t.rest || '');
    if (m) macros.push([m[1], lineOf(t.from)]);
  }
  const at = (j: number) => code[j];
  const named = (j: number) => {
    while (j < code.length) {
      const x = code[j];
      if (x.t === 'id' && x.v === 'alignas' && at(j + 1)?.v === '(') j = close(code, j + 1) + 1;
      else if (x.v === '[' && at(j + 1)?.v === '[') {
        while (j < code.length && !(code[j].v === ']' && at(j + 1)?.v === ']')) j++;
        j += 2;
      } else if (x.t === 'id' && ALLCAPS.test(x.v) && at(j + 1)?.v === '(') j = close(code, j + 1) + 1;
      else if (x.t === 'id' && ALLCAPS.test(x.v) && at(j + 1)?.t === 'id') j++;
      else break;
      if (j <= 0) return -1;
    }
    return j;
  };
  const reflected = (i: number) => {
    if (at(i - 1)?.v !== ')') return null;
    let d = 0, k = i - 1;
    for (; k >= 0; k--) {
      if (code[k].v === ')') d++;
      else if (code[k].v === '(' && --d === 0) break;
    }
    const m = at(k - 1);
    if (k < 1 || m?.t !== 'id' || (m.v !== 'UCLASS' && m.v !== 'UINTERFACE')) return null;
    return { macro: m.v, minimal: code.slice(k, i).some((x) => x.t === 'id' && x.v === 'MinimalAPI') };
  };
  const baseOf = (k: number) => {
    if (at(k)?.v === 'final') k++;
    if (at(k)?.v !== ':') return '';
    k++;
    while (at(k)?.t === 'id' && ['public', 'protected', 'private', 'virtual'].includes(at(k).v)) k++;
    let name = '';
    while (at(k)?.t === 'id') {
      name = at(k).v;
      if (at(k + 1)?.v === ':' && at(k + 2)?.v === ':') k += 3;
      else break;
    }
    return name;
  };
  for (let i = 0; i < code.length; i++) {
    const t = code[i];
    if (t.t !== 'id') continue;
    const prev = code[i - 1]?.v;
    if ((t.v === 'class' || t.v === 'struct' || t.v === 'union' || t.v === 'enum') && prev !== '<' && prev !== ',') {
      let j = i + 1;
      if (t.v === 'enum' && (at(j)?.v === 'class' || at(j)?.v === 'struct')) j++;
      if (t.v !== 'enum' && prev === 'enum') continue;
      j = named(j);
      const n = at(j), next = at(j + 1);
      if (n?.t === 'id' && next && ['{', ':', ';', '<', '*', '&', 'final'].includes(next.v)) types.push([';', '*', '&'].includes(next.v) ? [n.v, lineOf(n.from), 1] : [n.v, lineOf(n.from)]);
      if (t.v === 'class' && n?.t === 'id' && next && next.v !== ';') {
        const r = reflected(i);
        if (r) classes.push([n.v, lineOf(n.from), baseOf(j + 1), (code.slice(i + 1, j).some((x) => x.t === 'id' && /_API$/.test(x.v)) ? 1 : 0) | (r.macro === 'UINTERFACE' ? 2 : 0) | (r.minimal ? 4 : 0)]);
      }
    } else if (t.v === 'using' && at(i + 1)?.t === 'id' && at(i + 2)?.v === '=') types.push([at(i + 1).v, lineOf(at(i + 1).from)]);
    else if (t.v === 'namespace' && at(i + 1)?.t === 'id') types.push([at(i + 1).v, lineOf(at(i + 1).from)]);
    else if (t.v === 'typedef') {
      let d = 0, last: Tok | null = null, fn: Tok | null = null;
      for (let j = i + 1; j < code.length && j < i + 400; j++) {
        const x = code[j];
        if (x.v === '(' || x.v === '{' || x.v === '[') d++;
        else if (x.v === ')' || x.v === '}' || x.v === ']') d--;
        else if (x.v === ';' && d <= 0) break;
        if (x.t === 'id' && d <= 0) last = x;
        if (x.v === '*' && at(j + 1)?.t === 'id' && at(j + 2)?.v === ')' && !fn) fn = at(j + 1);
      }
      const n = fn || last;
      if (n) types.push([n.v, lineOf(n.from)]);
    } else if (/^DECLARE_\w*(DELEGATE|EVENT)\w*$/.test(t.v) && at(i + 1)?.v === '(') {
      const want = /DERIVED_EVENT/.test(t.v) ? 2 : /EVENT|RetVal/.test(t.v) ? 1 : 0;
      let arg = 0, d = 0;
      for (let j = i + 2; j < code.length; j++) {
        const x = code[j];
        if (x.v === '(' || x.v === '<') d++;
        else if (x.v === ')' || x.v === '>') {
          if (d === 0) break;
          d--;
        } else if (x.v === ',' && d === 0) arg++;
        else if (arg === want && x.t === 'id' && d === 0) {
          types.push([x.v, lineOf(x.from)]);
          break;
        }
      }
    }
  }
  return { types, macros, classes };
}

export type Rpc = { at: number; to: number; name: string; cls: string; kind: 'server' | 'client' | 'multicast'; reliable: boolean };

function compiled(src: string) {
  const all = lex(src);
  activity(all);
  return all.filter((t) => t.t !== 'pp' && t.on);
}

export function rpcs(src: string): Rpc[] {
  const toks = compiled(src), out: Rpc[] = [], scopes: string[] = [];
  let pending = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'sym') {
      if (t.v === '{') {
        scopes.push(pending);
        pending = '';
      } else if (t.v === '}') scopes.pop();
      else if (t.v === ';') pending = '';
      continue;
    }
    if (t.t !== 'id') continue;
    const prev = toks[i - 1]?.v;
    if ((t.v === 'class' || t.v === 'struct') && prev !== '<' && prev !== ',' && prev !== 'enum') {
      let j = i + 1, name = '';
      while (toks[j]?.t === 'id' && toks[j].v !== 'final') {
        if (toks[j + 1]?.v === '(') {
          const e = close(toks, j + 1);
          if (e < 0) break;
          j = e + 1;
          continue;
        }
        name = toks[j++].v;
      }
      if (name && ['{', ':', 'final'].includes(toks[j]?.v)) pending = name;
      continue;
    }
    if (t.v !== 'UFUNCTION' || toks[i + 1]?.v !== '(') continue;
    const end = close(toks, i + 1);
    if (end < 0) break;
    const list = items(toks, i + 1, end) || [];
    i = end;
    const net = list.find((x) => NET.has(x.low));
    const d = net && declaration(toks, end + 1);
    if (!net || !d) continue;
    const kind = net.low === 'netmulticast' ? 'multicast' : (net.low as 'server' | 'client');
    out.push({ at: d.name.from, to: d.name.to, name: d.name.v, cls: [...scopes].reverse().find(Boolean) || '', kind, reliable: list.some((x) => x.low === 'reliable') });
  }
  return out;
}

export function rpcDefs(src: string) {
  const toks = compiled(src), out: { at: number; to: number; cls: string; name: string }[] = [];
  for (let i = 3; i + 1 < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || toks[i + 1].v !== '(' || toks[i - 1].v !== ':' || toks[i - 2].v !== ':' || toks[i - 3].t !== 'id') continue;
    const m = /^(\w+)_(Implementation|Validate)$/.exec(t.v);
    if (m) out.push({ at: t.from, to: t.to, cls: toks[i - 3].v, name: m[1] });
  }
  return out;
}

export function checkUnreal(src: string, fileName = '', tables: Record<string, string[]> | null = null, known: Known | null = null) {
  const out: Mark[] = [];
  const add = (from: number, to: number, severity: string, message: string, actions?: Action[] | null) => out.push({ from, to, severity, message, source: 'Unreal', ...(actions ? { actions } : {}) });
  const all = lex(src);
  const balanced = activity(all);
  const pp = all.filter((t) => t.t === 'pp');
  const toks = all.filter((t) => t.t !== 'pp' && t.on);
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const genName = base ? `${base}.generated.h`.toLowerCase() : '';
  const sets: Record<string, Set<string>> = {};
  if (tables) for (const [m, list] of Object.entries(tables)) sets[m] = new Set(list.map((x) => x.toLowerCase()));

  const types: UType[] = [];
  const manual = new Set<number>();
  {
    const opens: { from: number; depth: number | null; at: number }[] = [];
    let d = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t === 'id' && TYPE_MACROS.has(t.v)) opens.push({ from: t.from, depth: null, at: i });
      if (t.t === 'sym' && t.v === '{') {
        d++;
        const o = opens.find((x) => x.depth === null && x.at < i);
        if (o) o.depth = d;
      }
      if (t.t === 'sym' && t.v === '}') d--;
      if (t.t === 'id' && t.v === 'AddReferencedObjects') {
        const o = [...opens].reverse().find((x) => x.depth !== null && x.depth <= d);
        if (o) manual.add(o.from);
      }
    }
  }
  const scopes: any[] = [{ kind: 'file' }];
  let pending: UType | null = null, underflow = false;
  const head = (i: number) => {
    const k = skipMacros(i + 1);
    if (k < 0 || toks[k]?.t !== 'id') return null;
    const api = toks.slice(i + 1, k).find((x) => x.t === 'id' && /_API$/.test(x.v)) || null;
    let j = k + 1;
    if (toks[j]?.v === 'final') j++;
    return { name: toks[k], api, base: toks[j]?.v === ':' && toks[j + 1]?.v !== ':', body: ['{', ':'].includes(toks[j]?.v) };
  };

  const loose: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const top = scopes[scopes.length - 1];
    const after = top.after;
    top.after = null;
    if (t.t === 'sym') {
      if (t.v === '{') {
        if (pending?.keyword) {
          const type = pending;
          type.gen = false;
          types.push(type);
          if (type.macro === 'native') {
            const u = types.find((x) => x.macro === 'UINTERFACE' && x.name?.v === 'U' + type.name!.v.slice(1));
            if (u) u.native = type;
          }
          scopes.push({ kind: 'type', type, stmt: [], prop: false, access: type.kind === 'struct' ? 'public' : 'private', after: `the '{' that opens ${type.name?.v || 'the type'}` });
          pending = null;
        } else {
          if (top.kind === 'type') top.stmt.push(t);
          scopes.push({ kind: 'block' });
        }
        continue;
      }
      if (t.v === '}') {
        if (scopes.length === 1) underflow = true;
        else {
          const was = scopes.pop();
          if (was.kind === 'type') Object.assign(was.type, { closed: true, rbrace: t });
          const now = scopes[scopes.length - 1];
          if (now.kind === 'type' && was.kind === 'block' && now.stmt.length && now.stmt[now.stmt.length - 1].v === '{') {
            now.stmt = [];
            now.prop = false;
          }
        }
        continue;
      }
      if (t.v === ';') {
        if (pending && !pending.keyword) pending = null;
        else if (pending?.keyword) pending = null;
        if (top.kind === 'type' && after && !top.stmt.length) {
          add(t.from, t.to, 'error', `Unreal Header Tool doesn't allow a ';' after ${after}`, [{ name: "Remove the ';'", changes: [{ from: t.from, to: t.to, insert: '' }] }]);
          top.after = after;
          continue;
        }
        if (top.kind === 'type') {
          member(top);
          top.stmt = [];
          top.prop = false;
        }
        continue;
      }
      if (t.v === ':' && top.kind === 'type' && top.stmt.length === 1 && /^(public|protected|private)$/.test(top.stmt[0].v)) {
        top.access = top.stmt[0].v;
        top.stmt = [];
        continue;
      }
      if (top.kind === 'type') top.stmt.push(t);
      continue;
    }
    if (t.t === 'id' && MACROS.has(t.v) && toks[i + 1]?.v === '(' && toks[i + 1].t === 'sym') {
      const end = close(toks, i + 1);
      if (end < 0) break;
      const list = items(toks, i + 1, end);
      if (list) specifiers(t, list, toks[end]);
      if (TYPE_MACROS.has(t.v)) pending = { macro: t.v, tok: t, noExport: !!list?.some((x) => x.low === 'noexport'), keyword: false, list, end: toks[end], fns: [] };
      if ((t.v === 'UPROPERTY' || t.v === 'UFUNCTION') && top.kind === 'file') loose.push(t);
      if (t.v === 'UFUNCTION' && list) func(t, list, toks[end], end + 1, top);
      if (t.v === 'UPROPERTY' && top.kind === 'type') {
        top.prop = true;
        if (list) prop(list, end + 1, top);
      }
      if (t.v === 'UENUM' && list) uenum(list, end + 1);
      i = end;
      continue;
    }
    if (t.t === 'id' && GENERATED.test(t.v) && top.kind === 'type') {
      top.type.gen = true;
      if (t.v !== 'GENERATED_BODY') top.access = 'public';
      const e = toks[i + 1]?.v === '(' ? close(toks, i + 1) : -1;
      if (e > 0) {
        i = e;
        top.stmt = [];
        top.after = `${t.v}()`;
        if (top.type.macro === 'USTRUCT' && toks[i + 1]?.v === ';') {
          i++;
          top.after = `${t.v}();`;
        }
        continue;
      }
    }
    if (top.kind === 'type' && t.t === 'id' && /^(public|protected|private)$/.test(t.v) && toks[i + 1]?.v === ':' && toks[i + 2]?.v !== ':') {
      top.access = t.v;
      top.stmt = [];
      top.after = `${t.v}:`;
      i++;
      continue;
    }
    if (top.kind === 'type' && t.t === 'id' && /^(public|protected|private)$/.test(t.v) && !top.stmt.length && toks[i + 1]?.v !== ':') {
      const n = toks[i + 1], semi = n?.v === ';';
      add(t.from, semi ? n.to : t.to, 'error', `'${t.v}' needs a ':' after it`, [{ name: `Write ${t.v}:`, changes: [semi ? { from: n.from, to: n.to, insert: ':' } : { from: t.to, to: t.to, insert: ':' }] }]);
      top.access = t.v;
      top.after = `${t.v}:`;
      if (semi) i++;
      continue;
    }
    if (pending && !pending.keyword && t.t === 'id' && (t.v === 'class' || t.v === 'struct')) {
      pending.keyword = true;
      pending.kind = t.v;
      const h = head(i);
      if (h) Object.assign(pending, { name: h.name, api: h.api, base: h.base, bases: basesAt(toks.indexOf(h.name) + 1) });
      typeHead(pending);
    } else if (!pending && t.t === 'id' && t.v === 'class' && top.kind !== 'type' && !['<', ',', 'enum', 'friend'].includes(toks[i - 1]?.v)) {
      const h = head(i);
      if (h?.body && /^I[A-Z]/.test(h.name.v) && types.some((x) => x.macro === 'UINTERFACE' && x.name?.v === 'U' + h.name.v.slice(1))) pending = { macro: 'native', tok: h.name, noExport: false, keyword: true, kind: 'class', name: h.name, api: h.api, base: h.base, list: null, fns: [] };
    }
    if (t.t === 'id' && /^DECLARE_DYNAMIC_\w*DELEGATE\w*$/.test(t.v) && toks[i + 1]?.v === '(') delegate(t, i + 1);
    if (top.kind === 'type') top.stmt.push(t);
  }

  function basesAt(k: number) {
    const out: string[] = [];
    if (toks[k]?.v === 'final') k++;
    if (toks[k]?.v !== ':' || toks[k + 1]?.v === ':') return out;
    let name = '', d = 0;
    for (let j = k + 1; j < toks.length && j < k + 200; j++) {
      const x = toks[j];
      if (x.v === '{' && d === 0) break;
      if (x.v === '<') d++;
      else if (x.v === '>') d--;
      else if (x.v === ',' && d === 0) {
        if (name) out.push(name);
        name = '';
      } else if (x.t === 'id' && d === 0 && !/^(public|protected|private|virtual)$/.test(x.v)) name = x.v;
    }
    if (name) out.push(name);
    return out;
  }

  function skipMacros(k: number) {
    while (toks[k]?.t === 'id' && (ALLCAPS.test(toks[k].v) || toks[k].v === 'alignas')) {
      if (toks[k + 1]?.v === '(') {
        k = close(toks, k + 1) + 1;
        if (k <= 0) return -1;
      } else if (toks[k + 1]?.t === 'id') k++;
      else break;
    }
    return k;
  }

  function removeItem(list: Item[], k: number, endTok: Tok): Change {
    const it = list[k];
    if (k < list.length - 1) return { from: it.tok.from, to: list[k + 1].tok.from, insert: '' };
    if (k > 0) return { from: toks[it.at - 2].to, to: endTok.from, insert: '' };
    return { from: it.tok.from, to: endTok.from, insert: '' };
  }
  function addItem(list: Item[], endTok: Tok, text: string): Change {
    return { from: endTok.from, to: endTok.from, insert: (list.length ? ', ' : '') + text };
  }
  function removeTok(t: Tok): Change {
    return { from: t.from, to: toks[toks.indexOf(t) + 1]?.from ?? t.to, insert: '' };
  }
  function find(list: Item[] | null | undefined, ...names: string[]) {
    return list?.find((x) => names.includes(x.low) && truthy(x.value));
  }

  function metaOf(list: Item[] | null | undefined) {
    const out = new Map<string, { key: Tok; vals: Tok[] }>();
    const m = list?.find((x) => x.low === 'meta');
    if (!m || toks[m.at + 1]?.v !== '=' || toks[m.at + 2]?.v !== '(') return { out, open: null as Tok | null };
    const open = m.at + 2, e = close(toks, open);
    if (e < 0) return { out, open: null };
    let k = open + 1;
    while (k < e) {
      const key = toks[k];
      const vals: Tok[] = [];
      let j = k + 1, d = 0;
      if (toks[j]?.v === '=') {
        j++;
        while (j < e && !(d === 0 && toks[j].v === ',')) {
          if (toks[j].v === '(') d++;
          if (toks[j].v === ')') d--;
          vals.push(toks[j++]);
        }
      }
      if (key.t === 'id') out.set(key.v.toLowerCase(), { key, vals });
      while (j < e && toks[j].v !== ',') j++;
      k = j + 1;
    }
    return { out, open: toks[open] };
  }
  function metaTrue(meta: Map<string, { vals: Tok[] }>, key: string) {
    const m = meta.get(key);
    return !!m && truthy(m.vals.length ? m.vals.map((x) => x.v).join('') : null);
  }

  function typeHead(ty: UType) {
    const name = ty.name;
    if (ty.macro === 'USTRUCT' && name && !/^[FT]/.test(name.v)) add(name.from, name.to, 'error', `A USTRUCT's name must start with F: '${name.v}'`, [{ name: `Change to F${name.v}`, changes: [{ from: name.from, to: name.to, insert: 'F' + name.v }] }]);
    const minimal = ty.macro === 'UCLASS' && ty.api ? ty.list?.findIndex((x) => x.low === 'minimalapi') ?? -1 : -1;
    if (minimal >= 0) {
      const it = ty.list![minimal];
      add(it.tok.from, it.tok.to, 'error', `MinimalAPI can't be used with ${ty.api!.v}: the class is already fully exported`, [{ name: 'Remove MinimalAPI', changes: [removeItem(ty.list!, minimal, ty.end!)] }]);
    }
  }

  function delegate(t: Tok, open: number) {
    const e = close(toks, open);
    if (e < 0) return;
    const want = /RetVal/i.test(t.v) ? 1 : 0;
    let arg = 0, d = 0, first: Tok | null = null, count = 0;
    for (let j = open + 1; j < e; j++) {
      const x = toks[j];
      if (x.v === '(' || x.v === '<') d++;
      else if (x.v === ')' || x.v === '>') d--;
      else if (x.v === ',' && d === 0) {
        arg++;
        continue;
      }
      if (arg === want) {
        first = first || x;
        count++;
      }
    }
    if (first?.t === 'id' && count === 1 && !first.v.startsWith('F')) add(first.from, first.to, 'error', `A delegate type's name must start with F: '${first.v}'`, [{ name: `Change to F${first.v}`, changes: [{ from: first.from, to: first.to, insert: 'F' + first.v }] }]);
  }

  function specifiers(macro: Tok, list: Item[], endTok: Tok) {
    const set = sets[macro.v];
    if (set) {
      for (const it of list) {
        if (set.has(it.low)) continue;
        const near = nearest(it.name, tables![macro.v]);
        add(it.tok.from, it.tok.to, 'error', `Unknown specifier '${it.name}' in ${macro.v}`, near ? [{ name: `Change to ${near}`, changes: [{ from: it.tok.from, to: it.tok.to, insert: near }] }] : null);
      }
    }
    if (macro.v === 'UPROPERTY') {
      let seen = false;
      for (const it of list) {
        if (!EDIT.has(it.low)) continue;
        if (seen) add(it.tok.from, it.tok.to, 'error', `More than one edit/visibility specifier: '${it.name}'. Only one of EditAnywhere, EditInstanceOnly, EditDefaultsOnly, VisibleAnywhere, VisibleInstanceOnly or VisibleDefaultsOnly is allowed`);
        seen = true;
      }
      const ro = list.findIndex((x) => x.low === 'blueprintreadonly'), rw = list.findIndex((x) => x.low === 'blueprintreadwrite');
      if (ro >= 0 && rw >= 0) {
        const it = list[Math.max(ro, rw)];
        add(it.tok.from, it.tok.to, 'error', 'BlueprintReadOnly and BlueprintReadWrite can\'t be used together', [{ name: `Remove ${it.name}`, changes: [removeItem(list, Math.max(ro, rw), endTok)] }]);
      }
    }
    for (const [key, m] of metaOf(list).out) {
      if (!RANGE.has(key) || m.vals.length !== 1 || m.vals[0].t !== 'str') continue;
      const last = m.vals[0], text = last.v;
      if (!text || /^[+-]?\d*\.?\d*$/.test(text)) continue;
      const fix = /^[+-]?\d*\.?\d*f$/i.test(text) ? `"${text.slice(0, -1)}"` : null;
      add(m.key.from, last.to, 'error', `${m.key.v} must be a plain number: '${text}'`, fix != null ? [{ name: `Change to ${text.slice(0, -1)}`, changes: [{ from: last.from, to: last.to, insert: fix }] }] : null);
    }
  }

  function func(macro: Tok, list: Item[], endTok: Tok, at: number, scope: any) {
    const has = (s: Set<string> | string) => list.some((x) => (s as Set<string>).has ? (s as Set<string>).has(x.low) : x.low === s);
    const net = has(NET), service = has(SERVICE);
    const reliable = has('reliable'), unreliable = has('unreliable');
    const pure = list.some((x) => x.low === 'blueprintpure' && truthy(x.value));
    const at0 = macro.from, at1 = macro.to;
    if (net && (has('blueprintimplementableevent') || has('blueprintnativeevent') || has('exec'))) add(at0, at1, 'error', 'A replicated function (Server, Client, NetMulticast) can\'t be a Blueprint event or Exec');
    if (net && !service && !reliable && !unreliable) add(at0, at1, 'error', 'A replicated function (Server, Client, NetMulticast) needs Reliable or Unreliable', [{ name: 'Add Reliable', changes: [{ from: endTok.from, to: endTok.from, insert: ', Reliable' }] }, { name: 'Add Unreliable', changes: [{ from: endTok.from, to: endTok.from, insert: ', Unreliable' }] }]);
    if (net && !service && reliable && unreliable) add(at0, at1, 'error', 'Reliable and Unreliable can\'t be used together');
    if (!net && reliable) add(at0, at1, 'error', 'Reliable without Server, Client or NetMulticast');
    if (!net && !reliable && unreliable) add(at0, at1, 'error', 'Unreliable without Server, Client or NetMulticast');
    const owner: UType | null = scope?.kind === 'type' ? scope.type : null;
    const iface = owner?.macro === 'native' || owner?.macro === 'UINTERFACE';
    const bie = list.find((x) => x.low === 'blueprintimplementableevent'), bne = list.find((x) => x.low === 'blueprintnativeevent');
    const event = bie || bne;
    if (event && scope?.access === 'private') add(event.tok.from, event.tok.to, 'error', `A ${event.name} can't be private`);
    const d = declaration(toks, at);
    const ret0 = d ? d.pre.map((t: Tok) => t.v).join(' ') : '';
    owner?.fns.push({ macro, end: endTok, name: d?.name || null, event: !!event, callable: has('blueprintcallable') || pure, internal: !!find(list, 'blueprintinternaluseonly') || metaTrue(metaOf(list).out, 'blueprintinternaluseonly'), params: d ? d.params.filter((q) => !(q.length === 1 && q[0].v === 'void')).map((q) => typed(q)?.name || null) : [], ret: !!ret0 && ret0 !== 'void' });
    if (!d) return;
    if (net && d.pre.static) add(at0, at1, 'error', 'Static functions can\'t be replicated');
    const unvirtual = d.pre.virtual ? [{ name: 'Remove virtual', changes: [removeTok(d.pre.virtual)] }] : null;
    if (d.pre.virtual && event) {
      if (iface) add(d.pre.virtual.from, d.pre.virtual.to, 'error', 'A Blueprint event in an interface can\'t be virtual', unvirtual);
      else if (bne) add(d.pre.virtual.from, d.pre.virtual.to, 'error', 'A BlueprintNativeEvent can\'t be virtual: override its _Implementation instead', unvirtual);
      else add(d.pre.virtual.from, d.pre.virtual.to, 'warning', 'A BlueprintImplementableEvent shouldn\'t be virtual. Use BlueprintNativeEvent instead', unvirtual);
    }
    if (iface && !d.pre.virtual && !event) add(d.name.from, d.name.to, 'error', 'Interface functions must be virtual, or a Blueprint event', [{ name: 'Add virtual', changes: [{ from: toks[at].from, to: toks[at].from, insert: 'virtual ' }] }]);
    const explicitPure = find(list, 'blueprintpure');
    if (iface && explicitPure) add(explicitPure.tok.from, explicitPure.tok.to, 'error', 'BlueprintPure isn\'t allowed on interface functions');
    if (iface && d.fin) add(d.fin.from, d.fin.to, 'error', 'Interface functions can\'t be final', [{ name: 'Remove final', changes: [{ from: toks[toks.indexOf(d.fin) - 1].to, to: d.fin.to, insert: '' }] }]);
    if (owner?.api && d.pre.api) add(d.pre.api.from, d.pre.api.to, 'error', `${d.pre.api.v} isn't needed here: the class already has ${owner.api.v}`, [{ name: `Remove ${d.pre.api.v}`, changes: [removeTok(d.pre.api)] }]);
    const objectPtr = (x: ReturnType<typeof typed>, what: string) => {
      if (x?.type.v !== 'TObjectPtr') return;
      const one = x.inner.length === 1 && x.inner[0].t === 'id' ? x.inner[0].v : null;
      add(x.type.from, x.last.to, 'error', `A UFUNCTION can't ${what} a TObjectPtr: use a raw pointer`, one ? [{ name: `Change to ${one}*`, changes: [{ from: x.type.from, to: x.last.to, insert: one + '*' }] }] : null);
    };
    objectPtr(typed(d.pre), 'return');
    for (const p of d.params) {
      const x = typed(p);
      if (!x) continue;
      objectPtr(x, 'take');
      if (!net || service) continue;
      const span = [x.first.from, (x.name || x.last).to];
      if (BYREF.has(x.type.v) && !(x.isConst && x.ref === '&') && !x.arr) {
        const changes: Change[] = [];
        if (!x.isConst) changes.push({ from: x.first.from, to: x.first.from, insert: 'const ' });
        if (!x.ref) changes.push({ from: x.last.to, to: x.last.to, insert: '&' });
        add(span[0], span[1], 'error', `Replicated ${x.type.v} parameters must be passed by const reference`, x.ref === '*' ? null : [{ name: `Change to const ${x.type.v}&`, changes }]);
      } else if (x.ref === '&' && !x.isConst) add(span[0], span[1], 'error', 'Replicated functions can\'t have out parameters (a non-const reference)', [{ name: 'Add const', changes: [{ from: x.first.from, to: x.first.from, insert: 'const ' }] }]);
      if (x.type.v === 'TMap' || x.type.v === 'TSet') add(x.type.from, x.last.to, 'error', `${x.type.v === 'TMap' ? 'Maps' : 'Sets'} aren't supported in a replicated function`);
    }
    const ret = d.pre.map((t: Tok) => t.v).join(' ');
    if (!ret) return;
    const isVoid = ret === 'void';
    if (net && !service && !isVoid) add(at0, at1, 'error', 'Replicated functions can\'t return a value');
    if (pure && isVoid && !d.params.some(isOutput)) add(at0, at1, 'error', 'BlueprintPure needs a return value or an output parameter (a non-const reference)');
  }

  function prop(list: Item[], from: number, scope: any) {
    const ty: UType = scope.type;
    const endTok = toks[from - 1];
    const decl: Tok[] = [];
    for (let j = from, d = 0; j < toks.length && j < from + 300; j++) {
      const x = toks[j];
      if (x.v === '(' || x.v === '{') d++;
      else if (x.v === ')' || x.v === '}') {
        if (--d < 0) break;
      } else if (x.v === ';' && d === 0) break;
      decl.push(x);
    }
    const x = typed(decl);
    const meta = metaOf(list);
    const replicated = list.find((it) => it.low === 'replicated' || it.low === 'replicatedusing');
    const struct = ty.macro === 'USTRUCT';
    if (replicated && struct) add(replicated.tok.from, replicated.tok.to, 'error', 'Struct members can\'t be replicated');
    const notRep = list.find((it) => it.low === 'notreplicated');
    if (notRep && !struct) add(notRep.tok.from, notRep.tok.to, 'error', 'Only struct members can be NotReplicated');
    const using = list.find((it) => it.low === 'replicatedusing');
    if (using && !using.value) add(using.tok.from, using.tok.to, 'error', 'ReplicatedUsing needs the name of a function to call');
    if (replicated && (x?.type.v === 'TMap' || x?.type.v === 'TSet')) add(replicated.tok.from, replicated.tok.to, 'error', `Replicated ${x.type.v === 'TMap' ? 'maps' : 'sets'} aren't supported`);
    const visible = list.find((it) => BPVISIBLE.has(it.low));
    const rw = list.find((it) => it.low === 'blueprintreadwrite' || it.low === 'blueprintreadonly');
    if (rw && scope.access === 'private' && !metaTrue(meta.out, 'allowprivateaccess')) {
      const fix = meta.open ? { from: meta.open.to, to: meta.open.to, insert: 'AllowPrivateAccess = "true"' + (toks[toks.indexOf(meta.open) + 1]?.v === ')' ? '' : ', ') } : addItem(list, endTok, 'meta = (AllowPrivateAccess = "true")');
      add(rw.tok.from, rw.tok.to, 'error', `${rw.name} can't be used on a private member without meta = (AllowPrivateAccess = "true")`, meta.out.has('allowprivateaccess') ? null : [{ name: 'Add AllowPrivateAccess', changes: [fix] }]);
    }
    const rig = RIGVM.some((k) => meta.out.has(k));
    if (rig) ty.rig = true;
    const category = list.find((it) => it.low === 'category' && it.value);
    if (category && !rig && !list.some((it) => EXPOSED.has(it.low))) add(category.tok.from, category.tok.to, 'warning', 'Category does nothing here: the property isn\'t shown in the editor or in Blueprints');
    const callable = list.some((it) => it.low === 'blueprintassignable' || it.low === 'blueprintcallable');
    if (visible && !callable && x?.arr && x.name) add(x.name.from, x.name.to, 'error', 'A static array can\'t be exposed to Blueprints');
    if (visible && !callable && struct && !ty.base && !ty.bp && !find(ty.list, 'blueprinttype', 'blueprintable', 'blueprintinternaluseonly', 'blueprintinternaluseonlyhierarchical') && !metaTrue(metaOf(ty.list).out, 'blueprinttype')) {
      const fix = ty.list && ty.end ? [{ name: 'Add BlueprintType to the USTRUCT', changes: [addItem(ty.list, ty.end, 'BlueprintType')] }] : undefined;
      ty.bp = { from: visible.tok.from, to: visible.tok.to, severity: 'error', message: `${visible.name} needs a struct with BlueprintType: '${ty.name?.v || 'this struct'}' isn't one`, source: 'Unreal', ...(fix ? { actions: fix } : {}) };
    }
    if (x?.name) (ty.props ||= []).push(x.name);
    if (x?.type.v === 'bool' && x.bits) add(x.type.from, x.type.to, 'error', 'bool bitfields aren\'t supported: use uint8', [{ name: 'Change to uint8', changes: [{ from: x.type.from, to: x.type.to, insert: 'uint8' }] }]);
  }

  function uenum(list: Item[], at: number) {
    if (toks[at]?.v !== 'enum') return;
    const isClass = toks[at + 1]?.v === 'class' || toks[at + 1]?.v === 'struct';
    const k = skipMacros(at + (isClass ? 2 : 1));
    const name = toks[k];
    if (k < 0 || name?.t !== 'id') return;
    const base = toks[k + 1]?.v === ':' && toks[k + 2]?.t === 'id' ? toks[k + 2] : null;
    if (base && !ENUM_BASES.has(base.v.toLowerCase())) add(base.from, base.to, 'error', `Unsupported enum base type '${base.v}': use uint8, uint16, uint32, uint64, int8, int16, int32 or int64`);
    else if (isClass && find(list, 'blueprinttype') && base?.v.toLowerCase() !== 'uint8') {
      const where = base || name;
      add(where.from, where.to, 'error', 'A BlueprintType enum must be uint8', [{ name: base ? 'Change to uint8' : 'Add : uint8', changes: [base ? { from: base.from, to: base.to, insert: 'uint8' } : { from: name.to, to: name.to, insert: ' : uint8' }] }]);
    }
    const flags = list.find((x) => x.low === 'flags');
    if (flags && !isClass) add(flags.tok.from, flags.tok.to, 'error', 'Flags can only be used on an enum class');
  }

  function member(scope: { type: UType; stmt: Tok[]; prop: boolean }) {
    const s = scope.stmt;
    if (manual.has(scope.type.tok.from) || scope.type.macro === 'native') return;
    if (scope.prop || !s.length || s.some((t) => t.v === '(' || t.v === '{' || t.v === '::')) return;
    if (s[0].t !== 'id' || /^(static|friend|using|typedef|class|struct|enum|template|public|protected|private|constexpr)$/.test(s[0].v)) return;
    let k = s[0].v === 'mutable' ? 1 : 0;
    let type: string | null = null, nameTok: Tok | null = null;
    if (s[k]?.t === 'id' && /^[UA][A-Z]\w*$/.test(s[k].v) && s[k + 1]?.v === '*' && s[k + 2]?.t === 'id') [type, nameTok] = [s[k].v + '*', s[k + 2]];
    else if (s[k]?.v === 'TObjectPtr' && s[k + 1]?.v === '<' && s[k + 2]?.t === 'id' && /^[UA][A-Z]\w*$/.test(s[k + 2].v) && s[k + 3]?.v === '>' && s[k + 4]?.t === 'id') [type, nameTok] = [`TObjectPtr<${s[k + 2].v}>`, s[k + 4]];
    if (!type) return;
    const rest = s.slice(s.indexOf(nameTok!) + 1);
    if (rest.length && rest[0].v !== '=') return;
    add(nameTok!.from, nameTok!.to, 'hint', `'${nameTok!.v}' (${type}) has no UPROPERTY: the garbage collector doesn't see it, so the object can be destroyed while this still points to it`);
  }

  const sound = balanced && !underflow && scopes.length === 1;
  if (sound) for (const t of loose) add(t.from, t.to, 'error', t.v === 'UPROPERTY' ? 'UPROPERTY can only be used inside a class or struct' : 'UFUNCTION can only be used inside a class');
  for (const ty of types) if (ty.bp && !ty.rig) out.push(ty.bp);
  if (sound) {
    for (const ty of types) {
      if (!ty.closed || ty.gen || (ty.macro === 'USTRUCT' && ty.noExport)) continue;
      add(ty.tok.from, ty.tok.to, 'error', ty.macro === 'native' ? `Interface ${ty.tok.v} needs GENERATED_BODY() in its body` : `${ty.macro} needs GENERATED_BODY() in its body`);
    }
    for (const ty of types) {
      const seen = new Map<string, Tok>();
      for (const f of ty.fns) {
        if (!f.name) continue;
        const low = f.name.v.toLowerCase(), was = seen.get(low);
        if (was && !pp.some((t) => (t.v === 'else' || t.v === 'elif') && t.from > was.from && t.from < f.name!.from)) add(f.name.from, f.name.to, 'error', `UFUNCTION '${f.name.v}' is declared twice: UFUNCTIONs can't be overloaded`);
        if (!was) seen.set(low, f.name);
      }
      if (ty.macro !== 'UINTERFACE') continue;
      const has = (n: string) => ty.list?.some((x) => x.low === n);
      const meta = metaOf(ty.list).out;
      const can = !!find(ty.list, 'blueprintable');
      const cannot = (!can && (has('blueprintable') || has('notblueprintable'))) || meta.has('cannotimplementinterfaceinblueprint');
      const blueprintable = ty.list?.findIndex((x) => x.low === 'blueprintable') ?? -1;
      for (const f of [...ty.fns, ...(ty.native?.fns || [])]) {
        const at = f.name || f.macro;
        if (f.event && !f.internal && cannot) add(at.from, at.to, 'error', 'A NotBlueprintable interface can\'t have Blueprint events');
        if (!f.callable || f.event) continue;
        if (can) add(at.from, at.to, 'error', 'A Blueprintable interface can only have BlueprintCallable functions that are BlueprintImplementableEvents. Make the interface NotBlueprintable to keep this one', blueprintable >= 0 ? [{ name: 'Change to NotBlueprintable', changes: [{ from: ty.list![blueprintable].tok.from, to: ty.list![blueprintable].tok.to, insert: 'NotBlueprintable' }] }] : null);
        else if (!cannot) add(at.from, at.to, 'warning', 'An interface with BlueprintCallable functions but no events should be NotBlueprintable', ty.list && ty.end ? [{ name: 'Add NotBlueprintable to the UINTERFACE', changes: [addItem(ty.list, ty.end, 'NotBlueprintable')] }] : null);
      }
    }
  }

  if (balanced) {
    for (let k = 0; k < all.length; k++) {
      const t = all[k];
      if (!t.why || all[k + 1]?.v !== '(') continue;
      const open = t.why.open, block = `#${open.v} ${open.rest}`.trim();
      const where = t.why.tok === open ? block : `#${t.why.tok.v} ${t.why.tok.rest}`.trim() + (t.why.tok.v === 'else' ? ` (of ${block})` : '');
      add(t.from, t.to, 'error', t.why.skip ? `${t.v} can't be inside ${where}: Unreal Header Tool skips this block` : `${t.v} can't be inside ${where}: only WITH_EDITOR, WITH_EDITORONLY_DATA and WITH_TESTS blocks may hold it`);
    }
  }

  if (genName) {
    const incs = pp.filter((t) => t.v === 'include');
    const target = (t: Tok) => {
      const m = /^["<]([^">]+)[">]/.exec(t.rest!);
      return m ? m[1].replace(/^.*[\\/]/, '').toLowerCase() : '';
    };
    const gen = incs.find((t) => t.on && target(t) === genName);
    if (gen) {
      const after = incs.filter((t) => t.on && t.from > gen.from);
      for (const t of after) add(t.from, t.to, 'error', `#include after "${base}.generated.h": the .generated.h include must be the last one`, [{ name: `Move "${base}.generated.h" to the end of the includes`, changes: moveGen(gen, after[after.length - 1]) }]);
    } else if (sound && !incs.some((t) => target(t) === genName)) {
      const first = types.find((ty) => (ty.macro === 'UCLASS' || ty.macro === 'UINTERFACE') && !ty.noExport);
      if (first) {
        const last = incs.filter((t) => t.on).pop() || pp.find((t) => t.on && t.v === 'pragma');
        const at = last ? lineEnd(last.to) : 0;
        add(first.tok.from, first.tok.to, 'error', `A header with ${first.macro} must include "${base}.generated.h" as its last include`, [{ name: `Add #include "${base}.generated.h"`, changes: [{ from: at, to: at, insert: (at ? '\n' : '') + `#include "${base}.generated.h"` + (at ? '' : '\n') }] }]);
      }
    }
  }

  function lineEnd(p: number) {
    const e = src.indexOf('\n', p);
    return e < 0 ? src.length : src[e - 1] === '\r' ? e - 1 : e;
  }
  function moveGen(gen: Tok, last: Tok) {
    const ls = src.lastIndexOf('\n', gen.from - 1) + 1;
    const le = src.indexOf('\n', gen.to);
    const line = src.slice(gen.from, lineEnd(gen.to));
    const at = lineEnd(last.to);
    return [{ from: ls, to: le < 0 ? src.length : le + 1, insert: '' }, { from: at, to: at, insert: '\n' + line }];
  }

  if (known) names(known);
  if (known && sound) parents(known);
  if (known && sound) {
    for (const ty of types) {
      if (ty.macro !== 'UINTERFACE' || ty.native || !ty.name || !/^U[A-Z]/.test(ty.name.v)) continue;
      const want = 'I' + ty.name.v.slice(1);
      if (toks.some((x) => x.v === want)) continue;
      const r = known.type(want);
      if (r === undefined) known.ask.types.add(want);
      else if (!r.ok) add(ty.name.from, ty.name.to, 'error', `UINTERFACE ${ty.name.v} needs a matching class ${want}`);
    }
  }

  function engineName(v: string) {
    if (/^[IAU]/.test(v)) return v.length > 12 && v.slice(1).startsWith('DEPRECATED_') ? v.slice(12) : v.slice(1);
    return /^[FT]/.test(v) ? v.slice(1) : v;
  }

  function parents(k: Known) {
    if (!k.parent) return;
    const info = (n: string) => {
      const r = k.parent!(n);
      if (r === undefined) k.ask.parents?.add(n);
      return r && r.ok ? r : null;
    };
    const lineStart = (p: number) => src.lastIndexOf('\n', p - 1) + 1;
    const rename = (name: Tok, want: string) => [{ name: `Rename to ${want} in this file`, changes: toks.filter((x) => x.t === 'id' && x.v === name.v).map((x) => ({ from: x.from, to: x.to, insert: want })) }];
    const dropMacro = (f: Fn): Change[] => {
      const next = toks[toks.indexOf(f.end) + 1];
      if (!next) return [];
      const ls = lineStart(f.macro.from);
      const alone = !src.slice(ls, f.macro.from).trim() && src.slice(f.end.to, next.from).includes('\n');
      return [{ from: alone ? ls : f.macro.from, to: alone ? lineStart(next.from) : next.from, insert: '' }];
    };
    for (const ty of types) {
      if (!ty.closed || !ty.name || (ty.macro !== 'UCLASS' && ty.macro !== 'UINTERFACE')) continue;
      const name = ty.name, bases = ty.bases || [];
      if (ty.list?.some((x) => x.low.startsWith('verse'))) continue;
      const deprecated = !!ty.list?.some((x) => x.low === 'deprecated') || name.v.includes('DEPRECATED_');
      if (ty.macro === 'UINTERFACE') {
        const want = 'U' + engineName(name.v);
        if (!deprecated && want !== name.v) add(name.from, name.to, 'error', `Interface '${name.v}' should be '${want}': a UINTERFACE starts with U`, rename(name, want));
        continue;
      }
      const sup = bases[0] ? info(bases[0]) : null;
      if (!sup) continue;
      if (sup.complete && sup.chain?.includes('UObject') && !sup.deprecated && !deprecated) {
        const actor = sup.actor || name.v === 'AActor';
        const want = (actor ? 'A' : 'U') + engineName(name.v);
        if (want !== name.v) add(name.from, name.to, 'error', `Class '${name.v}' should be '${want}': ${actor ? 'an Actor class starts with A' : 'a UObject class starts with U'}`, rename(name, want));
      }
      const props = new Map<string, string>(), fns = new Map<string, string>();
      for (const [n, owner, dep] of sup.props || []) if (!dep && !props.has(n.toLowerCase())) props.set(n.toLowerCase(), owner);
      for (const [n, owner] of sup.fns || []) if (!fns.has(n.toLowerCase())) fns.set(n.toLowerCase(), owner);
      for (const f of ty.fns) {
        if (!f.name) continue;
        const owner = fns.get(f.name.v.toLowerCase());
        if (owner) add(f.macro.from, f.end.to, 'error', `'${f.name.v}' overrides a UFUNCTION of ${owner}: remove UFUNCTION(), it keeps ${owner}'s`, [{ name: 'Remove UFUNCTION(…)', changes: dropMacro(f) }]);
      }
      for (const n of ty.props || []) {
        if (n.v.includes('_DEPRECATED')) continue;
        const low = n.v.toLowerCase();
        if (props.has(low)) add(n.from, n.to, 'error', `'${n.v}' is already a property of ${props.get(low)}`);
        else if (fns.has(low)) add(n.from, n.to, 'error', `'${n.v}' is already a function of ${fns.get(low)}`);
      }
      for (const f of ty.fns) {
        for (const q of f.params) {
          if (!q) continue;
          const low = q.v.toLowerCase();
          const mine = (ty.props || []).find((x) => x.from < q.from && x.v.toLowerCase() === low && !x.v.includes('_DEPRECATED'));
          if (props.has(low)) add(q.from, q.to, 'error', `'${q.v}' is already a property of ${props.get(low)}`);
          else if (mine) add(q.from, q.to, 'error', `'${q.v}' is already a property of ${name.v}`);
        }
      }
      for (const b of bases.slice(1)) {
        if (!/^I[A-Z]/.test(b)) continue;
        const bi = info(b);
        if (!bi?.iface) continue;
        for (const [fname, params, ret, flags, decl] of bi.iface.fns) {
          const mine = ty.fns.find((f) => f.name?.v === fname);
          const callable = !!(flags & 1), event = !!(flags & 2);
          if (!mine) {
            if (callable && !event && !bi.iface.cannot) {
              const at = ty.rbrace ? lineStart(ty.rbrace.from) : -1;
              const line = `${/^virtual\b/.test(decl) ? '' : 'virtual '}${decl} override;`;
              add(name.from, name.to, 'error', `'${fname}' from ${b} needs a UFUNCTION() in ${name.v}`, at >= 0 ? [{ name: `Add ${fname}`, changes: [{ from: at, to: at, insert: `public:\n\tUFUNCTION(BlueprintCallable)\n\t${line}\n` }] }] : null);
            }
            continue;
          }
          const at = mine.name!;
          if (event && !mine.event) add(at.from, at.to, 'error', `'${fname}' must be a Blueprint event, as in ${b}`);
          if (mine.params.length !== params) add(at.from, at.to, 'error', `'${fname}' has ${mine.params.length} parameter${mine.params.length === 1 ? '' : 's'}; ${b}'s has ${params}`);
          else if (mine.ret !== !!ret) add(at.from, at.to, 'error', `'${fname}' ${mine.ret ? 'returns a value' : 'returns nothing'}; ${b}'s ${ret ? 'returns one' : "doesn't"}`);
        }
      }
    }
  }

  function names(k: Known) {
    const own = declarations(src);
    const ownTypes = new Set(own.types.map((x) => x[0])), ownMacros = new Set(own.macros.map((x) => x[0]));
    for (let i = 1; i < toks.length; i++) if ((toks[i].v === 'typename' || toks[i].v === 'class') && (toks[i - 1].v === '<' || toks[i - 1].v === ',') && toks[i + 1]?.t === 'id') ownTypes.add(toks[i + 1].v);
    const macro = (tok: Tok, message: string, fix: string | null | undefined) => {
      if (ownMacros.has(tok.v) || MACROS.has(tok.v)) return;
      const r = k.macro(tok.v);
      if (r === undefined) k.ask.macros.add(tok.v);
      else if (!r) add(tok.from, tok.to, 'error', message, fix && fix !== tok.v ? [{ name: `Change to ${fix}`, changes: [{ from: tok.from, to: tok.to, insert: fix }] }] : null);
    };
    const type = (tok: Tok) => {
      if (!TYPE_NAME.test(tok.v) || ALLCAPS.test(tok.v) || ownTypes.has(tok.v)) return;
      const r = k.type(tok.v);
      if (r === undefined) k.ask.types.add(tok.v);
      else if (!r.ok && r.near) add(tok.from, tok.to, 'error', `Unknown type '${tok.v}'`, [{ name: `Change to ${r.near}`, changes: [{ from: tok.from, to: tok.to, insert: r.near }] }]);
    };
    const span = (list: Tok[], skipName: boolean, top = false) => {
      let d = 0, last: Tok | null = null, ids = 0;
      const seen: Tok[] = [];
      for (let j = 0; j < list.length; j++) {
        const x = list[j];
        if (x.v === '(') {
          const e = close(list, j);
          if (e < 0) return;
          j = e;
          continue;
        }
        if (x.v === '<') d++;
        else if (x.v === '>') d--;
        if (x.t !== 'id') continue;
        const before = list[j - 1]?.v, after = list[j + 1]?.v;
        if (d === 0) (last = x), ids++;
        if (before === '.' || (before === ':' && list[j - 2]?.v === ':') || before === '>' && list[j - 2]?.v === '-') continue;
        if (after === '(' || (top && d !== 0)) continue;
        seen.push(x);
      }
      for (const x of seen) if (!(skipName && x === last && ids > 1)) type(x);
    };
    const until = (from: number, stop: (x: Tok, j: number) => boolean) => {
      const out: Tok[] = [];
      let p = 0;
      for (let j = from; j < toks.length && j < from + 300; j++) {
        const x = toks[j];
        if (x.v === '(') p++;
        else if (x.v === ')') p--;
        if (p === 0 && stop(x, j)) break;
        if (x.v === ';' || x.v === '{' || x.v === '}') break;
        out.push(x);
      }
      return out;
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t !== 'id') continue;
      const prev = toks[i - 1];
      const edge = !prev || prev.v === ';' || prev.v === '}' || prev.v === '{' || (prev.v === ':' && /^(public|protected|private)$/.test(toks[i - 2]?.v || ''));
      if (edge && ALLCAPS.test(t.v) && toks[i + 1]?.v === '(') {
        const e = close(toks, i + 1), kw = toks[e + 1];
        if (e > 0 && kw?.t === 'id' && SLOT[kw.v]) macro(t, `Undefined macro '${t.v}'`, SLOT[kw.v]);
      }
      if ((t.v === 'class' || t.v === 'struct') && prev?.v !== '<' && prev?.v !== ',' && prev?.v !== 'enum' && prev?.v !== 'friend') {
        const w = toks[i + 1], n = toks[i + 2], after = toks[i + 3];
        let at = i + 2;
        if (w?.t === 'id' && ALLCAPS.test(w.v) && w.v.length > 1 && n?.t === 'id' && n.v !== 'final' && after && ['{', ':', 'final'].includes(after.v)) {
          macro(w, `Unknown API macro '${w.v}'`, k.api === undefined ? null : k.api);
          at = i + 3;
        } else if (w?.t === 'id' && (n?.v === ':' || n?.v === 'final')) at = i + 2;
        else continue;
        if (toks[at]?.v === 'final') at++;
        if (toks[at]?.v === ':' && toks[at + 1]?.v !== ':') span(until(at + 1, () => false), false, true);
      }
      if (t.v === 'UPROPERTY' && toks[i + 1]?.v === '(') {
        const e = close(toks, i + 1);
        if (e < 0) continue;
        span(until(e + 1, (x, j) => x.v === '=' || x.v === '[' || (x.v === ':' && toks[j + 1]?.v !== ':' && toks[j - 1]?.v !== ':')), true);
      }
      if (t.v === 'UFUNCTION' && toks[i + 1]?.v === '(') {
        const e = close(toks, i + 1);
        const d = e > 0 ? declaration(toks, e + 1) : null;
        if (!d) continue;
        span(d.pre, false);
        for (const p of d.params) {
          const q = p.findIndex((x, j) => x.v === '=' && p[j - 1]?.v !== '=');
          span(q < 0 ? p : p.slice(0, q), true);
        }
      }
    }
  }

  return out.sort((a, b) => a.from - b.from);
}
