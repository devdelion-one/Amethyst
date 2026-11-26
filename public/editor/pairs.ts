const HEAD = new Set(['h', 'hpp', 'hh', 'hxx']);
const SRC = new Set(['cpp', 'cc', 'cxx', 'c']);
const SPLIT = new Set(['public', 'private', 'classes', 'internal', 'include', 'inc', 'src', 'source']);

function parts(path: string) {
  const dirs = path.replace(/\\/g, '/').split('/');
  const file = dirs.pop() || '';
  const dot = file.lastIndexOf('.');
  return { dirs: dirs.map((d) => d.toLowerCase()), file, base: (dot > 0 ? file.slice(0, dot) : file).toLowerCase(), ext: dot > 0 ? file.slice(dot + 1).toLowerCase() : '' };
}

export const isPairable = (path: string): boolean => {
  const { ext } = parts(path);
  return HEAD.has(ext) || SRC.has(ext);
};

export const isHeader = (path: string): boolean => HEAD.has(parts(path).ext);

const same = (a: string[], b: string[]) => a.length === b.length && a.every((s, i) => s === b[i]);

function split(dirs: string[]): number {
  for (let i = dirs.length - 1; i >= 0; i--) if (SPLIT.has(dirs[i])) return i;
  return -1;
}

function rank(a: string[], b: string[]): number {
  if (same(a, b)) return 0;
  const ia = split(a), ib = split(b);
  if (ia < 0 || ib < 0 || !same(a.slice(0, ia), b.slice(0, ib))) return 3;
  return same(a.slice(ia + 1), b.slice(ib + 1)) ? 1 : 2;
}

export function counterparts(path: string, files: string[]): string[] {
  const me = parts(path);
  const want = HEAD.has(me.ext) ? SRC : SRC.has(me.ext) ? HEAD : null;
  if (!want) return [];
  return files
    .map((f) => ({ f, p: parts(f) }))
    .filter(({ f, p }) => f !== path && p.base === me.base && want.has(p.ext))
    .map(({ f, p }) => ({ f, r: rank(me.dirs, p.dirs) }))
    .sort((x, y) => x.r - y.r || x.f.length - y.f.length || x.f.localeCompare(y.f))
    .map((x) => x.f);
}
