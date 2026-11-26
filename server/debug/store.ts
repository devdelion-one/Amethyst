import fs from 'fs';
import path from 'path';
import { DOT } from '../base/routes.ts';

export interface Bp {
  file: string;
  line: number;
  cond?: string;
  off?: boolean;
  by: string;
  at: number;
}

const FILE = 'breakpoints.json';
const WIN = process.platform === 'win32';
export const fold = (p: string) => {
  const s = path.resolve(p).replace(/\\/g, '/');
  return WIN ? s.toLowerCase() : s;
};
export const absOf = (root: string, file: string) => (path.isAbsolute(file) ? path.resolve(file) : path.resolve(root, file));
export const relOf = (root: string, abs: string) => {
  const r = path.relative(root, abs);
  return !r || r.startsWith('..') || path.isAbsolute(r) ? path.resolve(abs).replace(/\\/g, '/') : r.replace(/\\/g, '/');
};

const cache = new Map<string, Bp[]>();

const clean = (b: any): Bp | null => {
  const line = Math.floor(Number(b?.line));
  if (typeof b?.file !== 'string' || !b.file || !(line >= 1)) return null;
  return { file: b.file.replace(/\\/g, '/'), line, ...(b.cond ? { cond: String(b.cond).slice(0, 2000) } : {}), ...(b.off ? { off: true } : {}), by: b.by === 'agent' ? 'agent' : 'you', at: Number(b.at) || Date.now() };
};

export function readBps(root: string): Bp[] {
  const k = fold(root);
  if (cache.has(k)) return cache.get(k)!;
  let list: Bp[] = [];
  try {
    const j = JSON.parse(fs.readFileSync(path.join(root, DOT, FILE), 'utf8'));
    list = (Array.isArray(j?.list) ? j.list : []).map(clean).filter(Boolean) as Bp[];
  } catch {}
  cache.set(k, list);
  return list;
}

export async function writeBps(root: string, list: Bp[]) {
  const seen = new Set<string>();
  const out = list.filter((b) => {
    const k = `${fold(absOf(root, b.file))}#${b.line}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  cache.set(fold(root), out);
  const dir = path.join(root, DOT);
  if (!out.length && !fs.existsSync(path.join(dir, FILE))) return out;
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${FILE}.${process.pid}.tmp`);
  await fs.promises.writeFile(tmp, JSON.stringify({ v: 1, list: out }, null, 1));
  await fs.promises.rename(tmp, path.join(dir, FILE));
  return out;
}

export function setFile(root: string, file: string, lines: { line: number; cond?: string; off?: boolean; by?: string }[], by: string) {
  const abs = fold(absOf(root, file)), rel = relOf(root, absOf(root, file));
  const all = readBps(root);
  const before = new Map(all.filter((b) => fold(absOf(root, b.file)) === abs).map((b) => [b.line, b]));
  const rest = all.filter((b) => fold(absOf(root, b.file)) !== abs);
  const mine = lines.map((l) => {
    const was = before.get(Math.floor(l.line));
    return clean({ file: rel, line: l.line, cond: l.cond, off: l.off, by: l.by || was?.by || by, at: was?.at || Date.now() });
  }).filter(Boolean) as Bp[];
  return writeBps(root, [...rest, ...mine]);
}

export const forget = (root: string) => cache.delete(fold(root));
