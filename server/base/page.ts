import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { stripTypeScriptTypes } from 'module';
import { HttpError } from './routes.ts';
import type { IncomingMessage, ServerResponse } from 'http';

const fsp = fs.promises;
const ROOT = path.join(import.meta.dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');
const ENTRY = '/app/main.ts';

export const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon' };
export class Raw {
  body: Uint8Array;
  head: Record<string, string>;
  constructor(body: Uint8Array, head: Record<string, string>) {
    this.body = body;
    this.head = head;
  }
}
export const raw = (body: Uint8Array, file: string, csp: string, { type = 'application/octet-stream', ...head }: Record<string, string> = {}) =>
  new Raw(body, { 'content-type': TYPES[path.extname(file).toLowerCase()] || type, 'content-security-policy': csp, 'cache-control': 'no-cache', ...head });
const SAFE = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-src http: https: file:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'x-content-type-options': 'nosniff',
};
const VENDOR: Record<string, string> = { '/vendor/xterm.mjs': '@xterm/xterm/lib/xterm.mjs', '/vendor/xterm.css': '@xterm/xterm/css/xterm.css', '/vendor/addon-fit.mjs': '@xterm/addon-fit/lib/addon-fit.mjs' };
const PAGES: Record<string, string> = { '/': '/index.html', '/app': '/app.html' };

const STATIC_IMPORT = /^import\s+(?!type\b)(?:[^'";]*?\bfrom\s*)?'([^']+)'/gm;

type Stat = { mtimeMs: number; size: number };
const tagOf = (s: Stat) => `${s.size.toString(36)}-${Math.floor(s.mtimeMs).toString(36)}`;

function fileOf(url: string) {
  if (VENDOR[url]) return path.join(ROOT, 'node_modules', VENDOR[url]);
  const file = path.resolve(PUBLIC, '.' + decodeURIComponent(url));
  if (!file.startsWith(PUBLIC + path.sep)) throw new HttpError(404, 'not found');
  return file;
}

const strippedCache = new Map<string, Stat & { code: string }>();
async function stripped(file: string, s: Stat) {
  const hit = strippedCache.get(file);
  if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return hit.code;
  const code = stripTypeScriptTypes(await fsp.readFile(file, 'utf8'));
  strippedCache.set(file, { mtimeMs: s.mtimeMs, size: s.size, code });
  return code;
}

const importsCache = new Map<string, Stat & { list: string[] }>();
async function importsOf(url: string) {
  const file = fileOf(url), s = await fsp.stat(file);
  const hit = importsCache.get(file);
  if (hit && hit.mtimeMs === s.mtimeMs && hit.size === s.size) return { s, list: hit.list };
  const src = await fsp.readFile(file, 'utf8');
  const list = [...src.matchAll(STATIC_IMPORT)].map(([, spec]) => spec).filter((spec) => /^(\.{1,2})?\//.test(spec)).map((spec) => new URL(spec, 'http://x' + url).pathname);
  importsCache.set(file, { mtimeMs: s.mtimeMs, size: s.size, list });
  return { s, list };
}

export async function modules(entry = ENTRY) {
  const seen = new Map<string, Stat>(), todo = [entry];
  while (todo.length) {
    const url = todo.pop()!;
    if (seen.has(url)) continue;
    try {
      const { s, list } = await importsOf(url);
      seen.set(url, s);
      todo.push(...list);
    } catch {}
  }
  return seen;
}

async function appPage(file: string, s: Stat) {
  const mods = await modules();
  const tag = [tagOf(s), ...[...mods].map(([u, m]) => `${u}:${tagOf(m)}`)].join('|');
  const links = [...mods.keys()].map((u) => `<link rel="modulepreload" href="${u}">`).join('\n  ');
  return { tag, body: async () => (await fsp.readFile(file, 'utf8')).replace('</head>', `  ${links}\n</head>`) };
}

export async function serveStatic(pathname: string, req: IncomingMessage, res: ServerResponse) {
  const page = PAGES[pathname] || pathname;
  const file = fileOf(page), s = await fsp.stat(file);
  const ext = path.extname(file), ts = ext === '.ts', app = page === '/app.html';
  const built = app ? await appPage(file, s) : null;
  const etag = `W/"${built ? crypto.createHash('sha1').update(built.tag).digest('base64url').slice(0, 20) : tagOf(s)}"`;
  const head = { ...SAFE, 'content-type': (ts ? 'text/javascript' : TYPES[ext] || 'application/octet-stream') + '; charset=utf-8', 'cache-control': 'no-cache', etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ...SAFE, 'cache-control': 'no-cache', etag });
    return res.end();
  }
  const body = built ? await built.body() : ts ? await stripped(file, s) : await fsp.readFile(file);
  res.writeHead(200, head);
  res.end(body);
}
