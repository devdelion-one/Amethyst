import { sortOf } from './files.ts';

export interface Target {
  kind: 'web' | 'mail' | 'heading' | 'path';
  url?: string;
  abs?: string;
  rel?: string | null;
  line?: number;
  dir?: boolean;
  sort?: string;
}

export const IMG_MD = /!\[[^\]\n]*\]\(\s*(\.amethyst\/images\/[^)\s]+)\s*\)|(?<![\w/.@(-])(\.amethyst\/images\/[\w-]+\.(?:png|jpe?g|gif|webp))/g;
export const imgsIn = (text: unknown): any[] => [...String(text).matchAll(IMG_MD)].map((m) => ({ rel: m[1] || m[2], from: m.index, to: m.index + m[0].length }));
export const imgLink = (rel: string): string => `![](${rel})`;

export function fileLinks(text: unknown, known: (rel: string) => unknown): { from: number; to: number; rel: string }[] {
  const out: { from: number; to: number; rel: string }[] = [];
  for (const m of String(text).matchAll(/(?<!\S)@(\S+)/g)) {
    const rel = m[1].replace(/[.,;:!?)]+$/, '');
    if (known(rel)) out.push({ from: m.index, to: m.index + 1 + rel.length, rel });
  }
  return out;
}

const LINE = /(?:#L(\d+)(?:-L?\d+)?|:(\d+)(?:[-:]\d+)*)$/;
export function splitLine(s: string): [string, string, number | undefined] {
  const m = LINE.exec(s);
  return m ? [s.slice(0, m.index), m[0], +(m[1] || m[2])] : [s, '', undefined];
}

export const outTo = (t?: { kind: string } | null): string => (t?.kind === 'web' ? 'Open in your browser\nOpens the page in your own browser, outside Amethyst.' : t?.kind === 'mail' ? 'Open in the mail app\nStarts a mail to this address.' : 'Show in File Explorer\nOpens File Explorer where it is, with it selected.');
export const outKeys = (t?: { kind: string } | null): string => `=ctrl+shift+click:${t?.kind === 'web' ? 'open in your web browser' : t?.kind === 'mail' ? 'open in the mail app' : 'show in File Explorer'}`;
export const withHint = (tip: string): string => `${tip}\nClick to open it.`;

export const FILE_EXT = /\.(md|txt|json|jsonl|m?js|cjs|tsx?|jsx|css|html?|py|ps1|psm1|sh|bat|cmd|ya?ml|toml|ini|cfg|env|lock|log|csv|xml|svg|png|jpe?g|gif|webp|pdf|cs|c|h|cpp|hpp|go|rs|java|kt|rb|php|vue|svelte|sql|uasset|umap)$/i;
const SEG = `[^\\\\/\\s*?<>|"'$={}]+(?: [^\\\\/\\s*?<>|"'$={}]+)*`;
const PATH = new RegExp(`^(?:[a-z]:[\\\\/]|~[\\\\/]|\\.{1,2}[\\\\/])?(?:${SEG}[\\\\/])+(?:${SEG})?$`, 'i');
export function codePath(code: unknown): { p: string; at: string; dir: boolean } | null {
  const [p, at] = splitLine(String(code).trim());
  if (/^[\\/]{2}/.test(p)) return null;
  const abs = /^([a-z]:|~)[\\/]/i.test(p), dir = /[\\/]$/.test(p);
  const ok = PATH.test(p) ? abs || dir || /^\.|[\\/]\./.test(p) || FILE_EXT.test(p) || (p.match(/[\\/]/g) || []).length >= 2 : !/\s/.test(p) && FILE_EXT.test(p);
  return ok ? { p, at, dir } : null;
}

export const URL_RE = /(?:https?:\/\/|mailto:|file:\/\/\/?)[^\s<>()[\]"'`]*[^\s<>()[\]"'`.,;:!?]/g;
const REL_RE = /(?<=\]\()(?![a-z][a-z0-9+.-]*:|#)[^)\s]+(?=\))/g;
export const LINK_RE = new RegExp(URL_RE.source + '|' + REL_RE.source, 'g');
export function linkAt(text: unknown, pos: number): { kind: string; href: string; from: number; to: number } | null {
  const s = String(text), on = (from: number, to: number) => pos >= from && pos <= to;
  for (const [kind, re] of [['url', URL_RE], ['rel', REL_RE]] as [string, RegExp][]) for (const m of s.matchAll(re)) if (on(m.index, m.index + m[0].length)) return { kind, href: m[0], from: m.index, to: m.index + m[0].length };
  for (const m of s.matchAll(/`([^`\n]+)`/g)) if (on(m.index, m.index + m[0].length) && codePath(m[1])) return { kind: 'code', href: m[1].trim(), from: m.index + 1, to: m.index + 1 + m[1].length };
  return null;
}

const slashes = (s: unknown) => String(s || '').replace(/\\/g, '/').replace(/\/+$/, '');
const winPath = (p: string) => /^([a-z]:|\/\/)/i.test(p);
const floorOf = (p: string) => (/^\/\//.test(p) ? 4 : /^([a-z]:)?\//i.test(p) ? 1 : 0);
function clean(path: string, floor = floorOf(path)): string | null {
  const out: string[] = [];
  for (const [i, seg] of path.split('/').entries()) {
    if (i < floor) out.push(seg);
    else if (seg === '..') {
      if (out.length <= floor) return null;
      out.pop();
    } else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('/');
}
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function relIn(abs: string | null | undefined, root: string | null | undefined): string | null {
  const a = slashes(abs), r = slashes(root);
  if (!r) return null;
  const k = winPath(r) ? (x: string) => x.toLowerCase() : (x: string) => x;
  return k(a) === k(r) ? '' : k(a).startsWith(k(r) + '/') ? a.slice(r.length + 1) : null;
}

export function linkLook(t: { kind: string; dir?: boolean; rel?: string | null; abs?: string } | null | undefined, root = ''): string {
  if (t?.kind === 'path') return `lk ${t.dir ? 'lk-dir' : 'lk-file'}${t.rel == null && relIn(t.abs, root) == null ? ' out' : ''}`;
  return t ? `lk lk-${({ web: 'web', mail: 'mail', heading: 'head' } as Record<string, string>)[t.kind]}` : 'lk';
}

export function target(href: unknown, { root = '', base = '', has = () => false, isDir = () => false }: { root?: string; base?: string; has?: (rel: string) => boolean; isDir?: (rel: string) => boolean } = {}): Target | null {
  let s = String(href ?? '').trim().replace(/^<(.*)>$/, '$1');
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return { kind: 'web', url: s };
  if (/^mailto:/i.test(s)) return { kind: 'mail', url: s };
  if (s.startsWith('#')) return { kind: 'heading', url: decode(s.slice(1)) };
  if (/^file:\/\/(?!\/|localhost(\/|$))/i.test(s)) return null;
  if (/^file:/i.test(s)) s = s.replace(/^file:(\/\/(localhost)?)?/i, '').replace(/^\/(?=[a-z]:)/i, '');
  else if (/^[a-z][a-z\d+.-]+:/i.test(s)) return null;
  const [bare, , line] = splitLine(s);
  const typed = decode(bare.replace(/[?#].*$/, '')).replace(/\\/g, '/');
  const p = typed.replace(/\/+$/, '');
  if (!p) return null;
  const r = slashes(root), known = (rel: string | null | undefined) => rel != null && (has(rel) || isDir(rel));
  const out = (abs: string, rel: string | null | undefined): Target | null => {
    if (/^\/\//.test(abs) && relIn(abs, r) == null) return null;
    const k = known(rel), dir = k ? !has(rel as string) : /\/$/.test(typed);
    return { kind: 'path', abs: winPath(abs) ? abs.replace(/\//g, '\\') : abs, ...(k ? { rel } : {}), ...(line ? { line } : {}), dir, sort: dir ? 'other' : sortOf(abs) };
  };
  if (/^~(\/|$)/.test(p)) return out(p, null);
  if (floorOf(p)) {
    const abs = clean(p);
    if (abs == null) return null;
    const rel = relIn(abs, r);
    const fromRoot = rel == null && /^\/(?!\/)/.test(p) ? clean(p.slice(1), 0) : null;
    return known(fromRoot) ? out(r ? r + '/' + fromRoot : fromRoot!, fromRoot) : out(abs, rel);
  }
  const b = slashes(base);
  let first: [string, string | null | undefined] | null = null;
  for (const from of floorOf(b) ? [b] : b ? [b, ''] : ['']) {
    const q = from ? from + '/' + p : p;
    let abs: string | null | undefined, rel: string | null | undefined;
    if (floorOf(from)) rel = relIn((abs = clean(q)) ?? '', r);
    else {
      rel = clean(q, 0);
      abs = r ? clean(r + '/' + q) : rel ?? q;
    }
    if (abs == null) continue;
    if (known(rel)) return out(abs, rel);
    first ??= [abs, rel];
  }
  return first && out(...first);
}
