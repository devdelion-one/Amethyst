import { activity, close, items, lex } from './check.ts';
import type { Tok } from './check.ts';

export type Val = { type: string; arg?: string; ptr?: boolean; qual?: string };
export type Member = { name: string; kind: 'fn' | 'var' | 'type' | 'value'; line: number; access: string; decl: string; val?: Val; tparams?: string[]; static?: boolean; virtual?: boolean; deprecated?: boolean; refl?: string; specs?: string[]; params?: string[] };
export type Cls = { name: string; kind: string; line: number; ns: string; outer: string; bases: string[]; macro: string; specs: string[]; decl: string; members: Member[] };
export type Alias = { name: string; line: number; ns: string; outer: string; to: Val };
export type Read = { classes: Cls[]; aliases: Alias[] };

const ALLCAPS = /^[A-Z][A-Z0-9_]*$/;
const MODS = new Set(['virtual', 'static', 'inline', 'explicit', 'constexpr', 'consteval', 'constinit', 'mutable', 'FORCEINLINE', 'FORCENOINLINE', 'FORCEINLINE_DEBUGGABLE', 'UE_NODISCARD', 'UE_FORCEINLINE_HINT', 'UE_REWRITE']);
const QUAL = new Set(['const', 'volatile', 'class', 'struct', 'union', 'typename', 'enum', 'mutable', 'static', 'virtual', 'inline', 'constexpr', 'explicit', 'unsigned', 'signed', 'register', 'thread_local']);
const KEYS = new Set(['class', 'struct', 'union', 'enum']);
const ACCESS = /^(public|protected|private)$/;
const TYPE_MACROS = new Set(['UCLASS', 'USTRUCT', 'UINTERFACE', 'UENUM']);
const MACRO_WORD = /^[A-Z][A-Z0-9]*_[A-Z0-9_]*$/;
const bareMacro = (x: Tok | undefined, next: Tok | undefined) => !!x && x.t === 'id' && MACRO_WORD.test(x.v) && next?.t === 'id';
const callMacro = (v: string) => ALLCAPS.test(v) || /^DECLARE_\w+$/.test(v);

const sym = (t: Tok | undefined, v: string) => !!t && t.t === 'sym' && t.v === v;

function angleEnd(s: Tok[], k: number) {
  let d = 0;
  for (let j = k; j < s.length; j++) {
    const v = s[j].v;
    if (s[j].t !== 'sym') continue;
    if (v === '(') {
      const e = close(s, j);
      if (e < 0) return s.length;
      j = e;
    } else if (v === '<') d++;
    else if (v === '>' && --d === 0) return j;
  }
  return s.length;
}

function split(s: Tok[]) {
  const out: Tok[][] = [];
  let cur: Tok[] = [], d = 0;
  for (let k = 0; k < s.length; k++) {
    const t = s[k];
    if (t.t === 'sym') {
      if (t.v === '(' || t.v === '[' || t.v === '{') d++;
      else if (t.v === ')' || t.v === ']' || t.v === '}') d--;
      else if (t.v === '<' && s[k - 1]?.t === 'id') d++;
      else if (t.v === '>' && d > 0) d--;
      else if (t.v === ',' && d === 0) {
        out.push(cur);
        cur = [];
        continue;
      }
    }
    cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

export function valOf(tt: Tok[]): Val | null {
  let j = 0;
  while (j < tt.length && tt[j].t === 'id' && (QUAL.has(tt[j].v) || /_API$/.test(tt[j].v))) j++;
  if (sym(tt[j], ':') && sym(tt[j + 1], ':')) j += 2;
  if (tt[j]?.t !== 'id') return null;
  let name = tt[j].v;
  const qual: string[] = [];
  while (sym(tt[j + 1], ':') && sym(tt[j + 2], ':') && tt[j + 3]?.t === 'id') {
    qual.push(name);
    j += 3;
    name = tt[j].v;
  }
  let k = j + 1, arg = '';
  if (sym(tt[k], '<')) {
    const e = angleEnd(tt, k);
    const first = split(tt.slice(k + 1, e))[0];
    const inner = first ? valOf(first) : null;
    if (inner) arg = inner.type;
    k = e + 1;
  }
  let ptr = false;
  for (; k < tt.length; k++) if (sym(tt[k], '*')) ptr = true;
  const v: Val = { type: name };
  if (arg) v.arg = arg;
  if (ptr) v.ptr = true;
  if (qual.length) v.qual = qual.join('::');
  return v;
}

function lines(src: string) {
  const nl: number[] = [];
  for (let i = src.indexOf('\n'); i >= 0; i = src.indexOf('\n', i + 1)) nl.push(i);
  return (p: number) => {
    let lo = 0, hi = nl.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (nl[m] < p) lo = m + 1;
      else hi = m;
    }
    return lo + 1;
  };
}

const text = (src: string, a: Tok, b: Tok) => src.slice(a.from, b.to).replace(/\s+/g, ' ').slice(0, 240);

function delegateName(toks: Tok[], i: number, e: number) {
  const m = toks[i].v;
  const want = /DERIVED_EVENT/.test(m) ? 2 : /EVENT|RetVal/.test(m) ? 1 : 0;
  let arg = 0, d = 0;
  for (let j = i + 2; j < e; j++) {
    const x = toks[j];
    if (x.v === '(' || x.v === '<') d++;
    else if (x.v === ')' || x.v === '>') d--;
    else if (x.v === ',' && d === 0) arg++;
    else if (arg === want && x.t === 'id' && d === 0) return x;
  }
  return null;
}

function cpp(all: Tok[]) {
  const out: Tok[] = [], stack: { off: boolean; flip: boolean }[] = [];
  const cond = (rest: string) => {
    const r = rest.trim();
    return { off: /^(!\s*CPP|0)\b/.test(r), flip: /^CPP\b/.test(r) };
  };
  for (const t of all) {
    if (t.t !== 'pp') {
      if (!stack.some((x) => x.off)) out.push(t);
      continue;
    }
    if (t.v === 'if') stack.push(cond(t.rest || ''));
    else if (t.v === 'ifdef' || t.v === 'ifndef') stack.push({ off: false, flip: false });
    else if (t.v === 'elif' && stack.length) stack[stack.length - 1] = { off: /^0\b/.test((t.rest || '').trim()), flip: false };
    else if (t.v === 'else' && stack.length) {
      const top = stack[stack.length - 1];
      stack[stack.length - 1] = { off: top.flip, flip: false };
    } else if (t.v === 'endif') stack.pop();
  }
  return out;
}

function uhtView(all: Tok[]) {
  activity(all);
  return all.filter((t) => t.t !== 'pp' && t.on);
}

export function members(src: string, uht = false): Read {
  const toks = uht ? uhtView(lex(src)) : cpp(lex(src));
  const lineOf = lines(src);
  const n = toks.length;
  const classes: Cls[] = [], aliases: Alias[] = [];

  const block = (k: number) => {
    let d = 0;
    for (let j = k; j < n; j++) {
      if (toks[j].t !== 'sym') continue;
      if (toks[j].v === '{') d++;
      else if (toks[j].v === '}' && --d === 0) return j;
    }
    return n;
  };

  const headOf = (s: Tok[]) => {
    let a = 0;
    for (;;) {
      if (bareMacro(s[a], s[a + 1])) a++;
      else if (s[a]?.t === 'id' && ALLCAPS.test(s[a].v) && sym(s[a + 1], '(')) {
        const e = close(s, a + 1);
        if (e < 0) return null;
        a = e + 1;
      } else break;
    }
    if (s[a]?.v === 'template' && sym(s[a + 1], '<')) a = angleEnd(s, a + 1) + 1;
    const kw = s[a];
    if (!kw || kw.t !== 'id' || !KEYS.has(kw.v)) return null;
    let j = a + 1;
    if (kw.v === 'enum' && (s[j]?.v === 'class' || s[j]?.v === 'struct')) j++;
    while (j < s.length) {
      const x = s[j];
      if (x.t === 'id' && (x.v === 'alignas' || ALLCAPS.test(x.v)) && sym(s[j + 1], '(')) {
        const e = close(s, j + 1);
        if (e < 0) return null;
        j = e + 1;
      } else if (sym(x, '[') && sym(s[j + 1], '[')) {
        while (j < s.length && !(sym(s[j], ']') && sym(s[j + 1], ']'))) j++;
        j += 2;
      } else if (x.t === 'id' && ALLCAPS.test(x.v) && s[j + 1]?.t === 'id') j++;
      else break;
    }
    let name: Tok | null = null;
    if (s[j]?.t === 'id' && s[j].v !== 'final') name = s[j++];
    if (s[j]?.v === 'final') j++;
    if (j < s.length && !(sym(s[j], ':') && !sym(s[j + 1], ':'))) return null;
    const bases: string[] = [];
    if (j < s.length && kw.v !== 'enum') {
      for (const part of split(s.slice(j + 1))) {
        let q = 0;
        while (part[q]?.t === 'id' && /^(public|protected|private|virtual)$/.test(part[q].v)) q++;
        const v = valOf(part.slice(q));
        if (v) bases.push(v.type);
      }
    }
    return { kind: kw.v, name, bases, first: s[0], last: s[s.length - 1] };
  };

  const alias = (r: Tok[], ns: string[], cls: Cls | null, access: string) => {
    let name: Tok | null = null, to: Val | null = null;
    if (r[0].v === 'using') {
      if (r[1]?.t !== 'id' || !sym(r[2], '=')) return;
      name = r[1];
      to = valOf(r.slice(3));
    } else {
      const body = r.slice(1);
      const fp = body.findIndex((x, k) => sym(x, '(') && sym(body[k + 1], '*'));
      if (fp >= 0) return;
      let d = 0;
      for (const x of body) {
        if (sym(x, '<') || sym(x, '(') || sym(x, '[')) d++;
        else if (sym(x, '>') || sym(x, ')') || sym(x, ']')) d--;
        else if (x.t === 'id' && d === 0) name = x;
      }
      if (!name) return;
      to = valOf(body.slice(0, body.indexOf(name)));
    }
    if (!name || !to) return;
    aliases.push({ name: name.v, line: lineOf(name.from), ns: ns.join('::'), outer: cls?.name || '', to });
    if (cls) cls.members.push({ name: name.v, kind: 'type', line: lineOf(name.from), access, decl: text(src, r[0], r[r.length - 1]), val: to });
  };

  const member = (s: Tok[], cls: Cls, access: string, refl: { macro: string; specs: string[] } | null, dep: boolean, ns: string[]) => {
    let a = 0, isStatic = false, isVirtual = false, tparams: string[] = [], keep: Tok | null = null;
    while (a < s.length) {
      const x = s[a];
      if (x.v === 'template' && sym(s[a + 1], '<')) {
        const e = angleEnd(s, a + 1);
        for (const q of split(s.slice(a + 2, e))) {
          const stop = q.findIndex((y) => sym(y, '='));
          const last = (stop < 0 ? q : q.slice(0, stop)).filter((y) => y.t === 'id').pop();
          if (last) tparams.push(last.v);
        }
        a = e + 1;
      }
      else if (sym(x, '[') && sym(s[a + 1], '[')) {
        while (a < s.length && !(sym(s[a], ']') && sym(s[a + 1], ']'))) a++;
        a += 2;
      } else if (x.t === 'id' && ALLCAPS.test(x.v) && sym(s[a + 1], '(')) {
        if (/DEPRECATED/.test(x.v)) dep = true;
        const e = close(s, a + 1);
        if (e < 0) return;
        a = e + 1;
      } else if (x.t === 'id' && (/_API$/.test(x.v) || MODS.has(x.v) || bareMacro(x, s[a + 1]))) {
        if (x.v === 'static') isStatic = true;
        if (!keep && /^(virtual|static|inline|explicit|constexpr|consteval|mutable)$/.test(x.v)) keep = x;
        if (x.v === 'virtual') isVirtual = true;
        a++;
      } else break;
    }
    const r = s.slice(a);
    if (!r.length) return;
    const w = r[0].v;
    if (w === 'friend' || w === 'static_assert' || r.some((x) => x.t === 'id' && x.v === 'operator')) return;
    if (w === 'using' || w === 'typedef') return alias(r, ns, cls, access);
    let p = -1, d = 0;
    for (let k = 0; k < r.length; k++) {
      const t = r[k];
      if (t.t !== 'sym') continue;
      if (t.v === '<' && r[k - 1]?.t === 'id') d++;
      else if (t.v === '>' && d > 0) d--;
      else if (t.v === '(' && d === 0) {
        p = k;
        break;
      } else if (t.v === '(') {
        const e = close(r, k);
        if (e < 0) return;
        k = e;
      } else if ((t.v === '=' || t.v === '{') && d === 0) break;
    }
    const extra = { ...(tparams.length ? { tparams } : {}), ...(isStatic ? { static: true } : {}), ...(isVirtual ? { virtual: true } : {}), ...(dep ? { deprecated: true } : {}), ...(refl ? { refl: refl.macro, specs: refl.specs } : {}) };
    if (p > 0) {
      const name = r[p - 1];
      if (name.t !== 'id' || name.v === cls.name || sym(r[p - 2], '~') || sym(r[p + 1], '*')) return;
      const val = valOf(r.slice(0, p - 1));
      if (!val) return;
      const e = close(r, p);
      if (e < 0) return;
      const params: string[] = [];
      const inner = r.slice(p + 1, e);
      if (!(inner.length === 1 && inner[0].v === 'void')) {
        for (const q of split(inner)) {
          const stop = q.findIndex((x) => sym(x, '='));
          const head = stop < 0 ? q : q.slice(0, stop);
          const last = head[head.length - 1];
          params.push(last?.t === 'id' && head.filter((x) => x.t === 'id' && x.v !== 'UPARAM').length > 1 ? last.v : '');
        }
      }
      let end = e;
      while (r[end + 1]?.t === 'id' && /^(const|override|final|noexcept)$/.test(r[end + 1].v)) end++;
      cls.members.push({ name: name.v, kind: 'fn', line: lineOf(name.from), access, decl: text(src, keep || r[0], r[end]), val, params, ...extra });
      return;
    }
    const parts = split(r);
    let base: Val | null = null, typeText = '';
    for (let q = 0; q < parts.length; q++) {
      const part = parts[q];
      let b = part.findIndex((x, k) => sym(x, '=') || sym(x, '[') || sym(x, '{') || (sym(x, ':') && !sym(part[k + 1], ':') && !sym(part[k - 1], ':')));
      if (b < 0) b = part.length;
      const name = part[b - 1];
      if (!name || name.t !== 'id') return;
      if (q === 0) {
        if (b < 2) return;
        base = valOf(part.slice(0, b - 1));
        if (!base) return;
        typeText = text(src, keep || part[0], part[b - 2]);
      }
      const ptr = part.slice(0, b - 1).some((x) => sym(x, '*'));
      const val: Val = q === 0 ? base! : { ...base!, ...(ptr ? { ptr: true } : {}) };
      cls.members.push({ name: name.v, kind: 'var', line: lineOf(name.from), access, decl: `${typeText}${q && ptr ? '*' : ''} ${name.v}`, val, ...extra });
    }
  };

  const enumBody = (k: number, c: Cls) => {
    const e = block(k);
    let start = true, d = 0;
    for (let j = k + 1; j < e; j++) {
      const x = toks[j];
      if (sym(x, '(') || sym(x, '{') || sym(x, '[')) d++;
      else if (sym(x, ')') || sym(x, '}') || sym(x, ']')) d--;
      else if (sym(x, ',') && d === 0) start = true;
      else if (start && x.t === 'id' && d === 0) {
        start = false;
        c.members.push({ name: x.v, kind: 'value', line: lineOf(x.from), access: 'public', decl: `${c.name}::${x.v}`, val: { type: c.name } });
      }
    }
    return e;
  };

  const scope = (k: number, cls: Cls | null, ns: string[]): number => {
    let s: Tok[] = [], access = cls?.kind === 'class' ? 'private' : 'public', refl: { macro: string; specs: string[] } | null = null, dep = false, tm: { macro: string; specs: string[] } | null = null;
    const done = () => {
      if (s.length) {
        if (cls) member(s, cls, access, refl, dep, ns);
        else if (s[0].v === 'using' || s[0].v === 'typedef') alias(s, ns, null, 'public');
      }
      s = [];
      refl = null;
      dep = false;
    };
    while (k < n) {
      const t = toks[k];
      if (t.t === 'sym') {
        if (t.v === '}') {
          done();
          return k;
        }
        if (t.v === ';') {
          done();
          tm = null;
          k++;
          continue;
        }
        if (t.v === '(') {
          const e = close(toks, k);
          if (e < 0) return n;
          for (let j = k; j <= e; j++) s.push(toks[j]);
          k = e + 1;
          continue;
        }
        if (t.v === '{') {
          const h = headOf(s);
          if (h) {
            const c: Cls = { name: h.name?.v || '', kind: h.kind, line: lineOf((h.name || h.first).from), ns: ns.join('::'), outer: cls?.name || '', bases: h.bases, macro: tm?.macro || '', specs: tm?.specs || [], decl: text(src, h.first, h.last), members: [] };
            tm = null;
            const end = h.kind === 'enum' ? enumBody(k, c) : scope(k + 1, c, ns);
            if (h.kind !== 'enum' && !c.name && cls) cls.members.push(...c.members);
            else if (c.name) {
              if (c.macro === 'UCLASS' || c.macro === 'UINTERFACE') c.members.push({ name: 'StaticClass', kind: 'fn', line: c.line, access: 'public', decl: 'static UClass* StaticClass()', val: { type: 'UClass', ptr: true }, static: true, params: [] });
              if (c.macro === 'USTRUCT') c.members.push({ name: 'StaticStruct', kind: 'fn', line: c.line, access: 'public', decl: 'static UScriptStruct* StaticStruct()', val: { type: 'UScriptStruct', ptr: true }, static: true, params: [] });
              if (c.macro && c.macro !== 'UENUM' && c.bases[0]) c.members.push({ name: 'Super', kind: 'type', line: c.line, access: 'public', decl: `typedef ${c.bases[0]} Super`, val: { type: c.bases[0] } });
              if (c.macro && c.macro !== 'UENUM') c.members.push({ name: 'ThisClass', kind: 'type', line: c.line, access: 'public', decl: `typedef ${c.name} ThisClass`, val: { type: c.name } });
              classes.push(c);
              if (cls) cls.members.push({ name: c.name, kind: 'type', line: c.line, access, decl: c.decl, val: { type: c.name } });
            }
            s = [];
            refl = null;
            k = end + 1;
            continue;
          }
          if (s[0]?.v === 'namespace' || s[0]?.v === 'extern') {
            const name = s[0].v === 'namespace' ? s.filter((x) => x.t === 'id').slice(1).map((x) => x.v) : [];
            s = [];
            const inner = ns.concat(name), from = classes.length;
            k = scope(k + 1, null, inner) + 1;
            const last = name[name.length - 1];
            if (last && /^E[A-Z]/.test(last)) {
              const t2 = classes.slice(from).find((c) => c.kind === 'enum' && c.name === 'Type' && c.ns === inner.join('::'));
              if (t2) classes.push({ ...t2, name: last, ns: ns.join('::'), members: t2.members.map((m) => ({ ...m, decl: `${last}::${m.name}`, val: { type: last } })) });
            }
            continue;
          }
          const e = block(k);
          if (cls && s.length) done();
          else s = [];
          k = e + 1;
          continue;
        }
        if (t.v === ':' && cls && s.length === 1 && ACCESS.test(s[0].v)) {
          access = s[0].v;
          s = [];
          k++;
          continue;
        }
        s.push(t);
        k++;
        continue;
      }
      if (t.t === 'id' && s.every((x) => x.t === 'id' && MACRO_WORD.test(x.v)) && callMacro(t.v) && sym(toks[k + 1], '(')) {
        s = [];
        const e = close(toks, k + 1);
        if (e < 0) return n;
        if (t.v === 'UPROPERTY' || t.v === 'UFUNCTION' || TYPE_MACROS.has(t.v)) {
          const list = items(toks, k + 1, e) || [];
          const specs = list.map((x) => x.low + (x.low === 'meta' && x.value ? '=' + x.value.toLowerCase() : ''));
          if (TYPE_MACROS.has(t.v)) tm = { macro: t.v, specs };
          else refl = { macro: t.v, specs };
        } else if (/^GENERATED_/.test(t.v) && cls) {
          if (t.v !== 'GENERATED_BODY') access = 'public';
        } else if (/^DECLARE_\w*(DELEGATE|EVENT)\w*$/.test(t.v) && cls) {
          const x = delegateName(toks, k, e);
          if (x) cls.members.push({ name: x.v, kind: 'type', line: lineOf(x.from), access, decl: text(src, t, toks[e]), val: { type: x.v } });
        } else if (/DEPRECATED/.test(t.v)) dep = true;
        k = e + 1;
        continue;
      }
      s.push(t);
      k++;
    }
    done();
    return n;
  };

  scope(0, null, []);
  return { classes, aliases };
}

export type Step = { op: string; name: string };
export type Recv = { from: Val & { super?: boolean }; steps: Step[]; op: string; self: string };
export type Local = { at: number; to: number; val: Val | null };

const CASTS = new Set(['Cast', 'CastChecked', 'ExactCast', 'NewObject', 'CreateDefaultSubobject', 'SpawnActor', 'SpawnActorDeferred', 'GetComponentByClass', 'FindComponentByClass', 'FindComponentByInterface', 'GetSubsystem', 'GetGameInstance', 'GetWorldSubsystem', 'GetGameInstanceSubsystem', 'GetLocalPlayerSubsystem', 'GetEngineSubsystem', 'GetEditorSubsystem', 'LoadObject', 'FindObject', 'DuplicateObject', 'GetOwner', 'GetPawn', 'GetController', 'GetPlayerState', 'GetGameState', 'GetAuthGameMode', 'GetTypedOuter', 'GetOuterOfType', 'StaticLoadObject', 'MakeShared', 'MakeUnique', 'FindFirstObject', 'GetDefault', 'GetMutableDefault', 'AddComponentByClass']);
const NOT_TYPE = new Set(['return', 'new', 'delete', 'case', 'goto', 'else', 'throw', 'co_return', 'co_yield', 'sizeof', 'do', 'if', 'while', 'for', 'switch', 'operator', 'typename', 'template', 'public', 'private', 'protected', 'using', 'namespace']);
const FOLLOW = new Set(['=', ';', '(', '{', ',', ')', ':', '[']);

type Frame = { kind: 'ns' | 'cls' | 'fn' | 'blk'; cls?: string; body?: number; params?: [number, number] };

function frames(toks: Tok[]) {
  const stack: Frame[] = [];
  let start = 0;
  const outer = () => {
    for (let q = stack.length - 1; q >= 0; q--) if (stack[q].kind === 'cls') return stack[q].cls;
    return '';
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'sym') continue;
    if (t.v === ';') start = i + 1;
    else if (t.v === '}') {
      stack.pop();
      start = i + 1;
    } else if (t.v === '{') {
      const top = stack[stack.length - 1];
      const s = toks.slice(start, i);
      let f: Frame = { kind: 'blk' };
      if (!top || top.kind === 'ns' || top.kind === 'cls') {
        const kw = s.findIndex((x, k) => x.t === 'id' && (x.v === 'class' || x.v === 'struct') && !['<', ',', 'enum', 'friend'].includes(s[k - 1]?.v));
        const after = kw >= 0 ? s.findIndex((x, k) => k > kw && sym(x, '(') && !(s[k - 1]?.t === 'id' && ALLCAPS.test(s[k - 1].v))) : -1;
        const paren = s.findIndex((x, k) => sym(x, '(') && s[k - 1]?.t === 'id' && !ALLCAPS.test(s[k - 1].v));
        if (s[0]?.v === 'namespace' || s[0]?.v === 'extern') f = { kind: 'ns' };
        else if (kw >= 0 && after < 0) {
          let j = kw + 1, name = '';
          while (s[j]?.t === 'id' && s[j].v !== 'final') {
            if (sym(s[j + 1], '(')) {
              const e = close(s, j + 1);
              if (e < 0) break;
              j = e + 1;
              continue;
            }
            name = s[j++].v;
          }
          f = { kind: 'cls', cls: name };
        } else if (paren > 0) {
          let cls = '', open = paren;
          for (let k = 0; k + 3 < s.length; k++) {
            if (s[k].t !== 'id' || !sym(s[k + 1], ':') || !sym(s[k + 2], ':')) continue;
            const dtor = sym(s[k + 3], '~') ? 1 : 0;
            if (s[k + 3 + dtor]?.t === 'id' && sym(s[k + 4 + dtor], '(')) {
              cls = s[k].v;
              open = k + 4 + dtor;
              break;
            }
          }
          if (!cls && top?.kind === 'cls') cls = outer() || '';
          const e = close(toks, start + open);
          f = { kind: 'fn', cls, body: i, params: [start + open, e < 0 ? i : e] };
        }
      }
      stack.push(f);
      start = i + 1;
    } else if (t.v === '(') {
      const e = close(toks, i);
      if (e < 0) break;
      i = e;
    }
  }
  const fn = [...stack].reverse().find((f) => f.kind === 'fn') || null;
  const self = fn?.cls || outer() || '';
  return { fn, self };
}

function typeBefore(toks: Tok[], k: number): Val | null {
  let j = k - 1, ptr = false;
  while (j >= 0 && (sym(toks[j], '*') || sym(toks[j], '&') || toks[j].v === 'const')) {
    if (sym(toks[j], '*')) ptr = true;
    j--;
  }
  const end = j;
  if (sym(toks[j], '>')) {
    let d = 0;
    for (; j >= 0; j--) {
      if (sym(toks[j], '>')) d++;
      else if (sym(toks[j], '<') && --d === 0) break;
    }
    j--;
  }
  if (toks[j]?.t !== 'id' || NOT_TYPE.has(toks[j].v)) return null;
  while (j >= 2 && sym(toks[j - 1], ':') && sym(toks[j - 2], ':') && toks[j - 3]?.t === 'id') j -= 3;
  while (j > 0 && toks[j - 1].t === 'id' && QUAL.has(toks[j - 1].v)) j--;
  if (sym(toks[j - 1], '.') || sym(toks[j - 1], '>') && sym(toks[j - 2], '-')) return null;
  const v = valOf(toks.slice(j, end + 1));
  if (!v) return null;
  if (ptr) v.ptr = true;
  if (v.type === 'auto') {
    if (!sym(toks[k + 1], '=')) return null;
    const a = toks[k + 2], b = toks[k + 3];
    if (a?.t === 'id' && CASTS.has(a.v) && sym(b, '<')) {
      const e = angleEnd(toks, k + 3);
      const inner = valOf(toks.slice(k + 4, e));
      return inner ? { type: inner.type, ptr: true } : null;
    }
    if (a?.v === 'new' && b?.t === 'id') return { type: b.v, ptr: true };
    return null;
  }
  return v;
}

function localIn(toks: Tok[], fn: Frame | null, name: string, end: number): Local | null {
  if (!fn) return null;
  const look = (a: number, b: number) => {
    for (let k = b - 1; k >= a; k--) {
      const t = toks[k];
      if (t.t !== 'id' || t.v !== name || !FOLLOW.has(toks[k + 1]?.v)) continue;
      if (sym(toks[k - 1], '.') || sym(toks[k - 1], ':') || (sym(toks[k - 1], '>') && sym(toks[k - 2], '-'))) continue;
      const val = typeBefore(toks, k);
      if (val || (toks[k - 1]?.v === 'auto' || (sym(toks[k - 1], '*') && toks[k - 2]?.v === 'auto'))) return { at: t.from, to: t.to, val };
    }
    return null;
  };
  return look(fn.body! + 1, end) || look(fn.params![0] + 1, fn.params![1]);
}

function chainBack(toks: Tok[], k: number) {
  const els: { name: string; call: boolean; tmpl: string }[] = [], ops: string[] = [];
  for (;;) {
    const t = toks[k];
    if (!t) return null;
    if (sym(t, ')')) {
      let d = 0, o = k;
      for (; o >= 0; o--) {
        if (sym(toks[o], ')')) d++;
        else if (sym(toks[o], '(') && --d === 0) break;
      }
      let ni = o - 1, tmpl = '';
      if (sym(toks[ni], '>')) {
        let dd = 0, lt = ni;
        for (; lt >= 0; lt--) {
          if (sym(toks[lt], '>')) dd++;
          else if (sym(toks[lt], '<') && --dd === 0) break;
        }
        tmpl = valOf(toks.slice(lt + 1, ni))?.type || '';
        ni = lt - 1;
      }
      if (toks[ni]?.t !== 'id') return null;
      els.unshift({ name: toks[ni].v, call: true, tmpl });
      k = ni - 1;
    } else if (t.t === 'id') {
      els.unshift({ name: t.v, call: false, tmpl: '' });
      k--;
    } else return null;
    const a = toks[k], b = toks[k - 1];
    if (sym(a, '>') && sym(b, '-') && b.to === a.from) {
      ops.unshift('->');
      k -= 2;
    } else if (sym(a, '.')) {
      ops.unshift('.');
      k--;
    } else if (sym(a, ':') && sym(b, ':')) {
      ops.unshift('::');
      k -= 2;
    } else break;
  }
  return { els, ops };
}

function opAt(toks: Tok[]) {
  const a = toks[toks.length - 1], b = toks[toks.length - 2];
  if (sym(a, '>') && sym(b, '-') && b.to === a.from) return { op: '->', k: toks.length - 3 };
  if (sym(a, '.')) return { op: '.', k: toks.length - 2 };
  if (sym(a, ':') && sym(b, ':')) return { op: '::', k: toks.length - 3 };
  return null;
}

export function receiver(src: string, pos: number): Recv | null {
  const toks = lex(src.slice(0, pos)).filter((t) => t.t !== 'pp');
  const at = opAt(toks);
  if (!at) return null;
  const { fn, self } = frames(toks);
  const c = chainBack(toks, at.k);
  if (!c || !c.els.length) return null;
  const ops = [...c.ops, at.op];
  let from: Recv['from'] | null = null, steps: Step[] = [];
  let i = 0;
  for (let q = c.els.length - 1; q >= 0; q--) {
    const e = c.els[q];
    if (e.call && e.tmpl && CASTS.has(e.name)) {
      from = { type: e.tmpl, ptr: true };
      i = q + 1;
      break;
    }
  }
  if (!from) {
    const e = c.els[0], op = ops[0];
    if (e.name === 'this') from = { type: self, ptr: true };
    else if (e.name === 'Super' && op === '::') from = { type: self, super: true };
    else if (e.name === 'ThisClass') from = { type: self };
    else {
      const local = !e.call ? localIn(toks, fn, e.name, toks.length) : null;
      if (local) {
        if (!local.val) return null;
        from = local.val;
      } else if (op === '::' && !e.call) from = { type: e.name };
      else if (self) {
        from = { type: self };
        steps.push({ op: '.', name: e.name });
      } else return null;
    }
    i = 1;
    if (!from.type) return null;
  }
  for (let q = i; q < c.els.length; q++) steps.push({ op: ops[q - 1], name: c.els[q].name });
  return { from, steps, op: ops[ops.length - 1], self };
}

export function bare(src: string, from: number, to: number): { local: Local | null; self: string; inFn: boolean } {
  const toks = lex(src.slice(0, from)).filter((t) => t.t !== 'pp');
  const { fn, self } = frames(toks);
  const name = src.slice(from, to);
  let local = localIn(toks, fn, name, toks.length);
  if (!local && fn) {
    const more = lex(src.slice(0, Math.min(src.length, to + 80))).filter((t) => t.t !== 'pp');
    const k = more.findIndex((t) => t.from === from);
    if (k > 0 && FOLLOW.has(more[k + 1]?.v) && !sym(more[k - 1], '.') && !sym(more[k - 1], ':') && !(sym(more[k - 1], '>') && sym(more[k - 2], '-'))) {
      const val = typeBefore(more, k);
      if (val || more[k - 1]?.v === 'auto' || (sym(more[k - 1], '*') && more[k - 2]?.v === 'auto')) local = { at: from, to, val };
    }
  }
  return { local, self, inFn: !!fn };
}
