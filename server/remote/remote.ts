import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { HttpError } from '../base/routes.ts';
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import type { Socket } from 'net';
import type { Routes } from '../../public/base/types.ts';

export type Phone = { id: string; name: string; hash: string; paired: number; seen: number };
type Store = { on: boolean; port: number; alerts: boolean; phones: Phone[] };
export type Via = { phone: Phone | null };
type Serve = (req: IncomingMessage, res: ServerResponse, via: Via) => unknown;

export const COOKIE = 'am_phone';
const PORT = 4778;
const CODE_LIFE = Number(process.env.MIND_REMOTE_CODE_MS) || 5 * 60e3;
const TRIES = 5;
const AGE = 400 * 24 * 3600;
const PAIR_FIRST = 'Pair this phone first: scan the code in Amethyst, Settings, General, Phone remote control.';
const NOT_HERE = 'Not available from the phone.';
const VIRTUAL = /vmware|virtualbox|vbox|vethernet|hyper-v|wsl|docker|loopback|bluetooth|npcap/i;
const LATE = /tailscale|zerotier|wireguard|vpn/i;

const ALLOW = new Set([
  'GET /api/workspaces',
  'GET /api/workspace',
  'GET /api/stream',
  'POST /api/stream',
  'GET /api/keys',
  'GET /api/welcome',
  'GET /api/forget',
  'GET /api/agents/usage',
  'GET /api/agent/edits',
  'POST /api/agent/warm',
  'POST /api/agent/send',
  'POST /api/agents/seen',
  'POST /api/agent',
  'GET /api/tree',
  'POST /api/paths',
  'GET /api/git',
  'GET /api/git/repos',
]);
const FOLLOWS = new Set(['c', 'f', 'chat', 'agents', 'tools', 'stop', 'scope']);

let file = '';
let st: Store = { on: false, port: PORT, alerts: true, phones: [] };
let code: { value: string; until: number } | null = null;
let wrong: number[] = [];
let srv: http.Server | null = null;
let serveIt: Serve | null = null;
const sockets = new Set<Socket>();
const streams = new Map<string, Set<ServerResponse>>();

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const save = () => {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(st, null, 1) + '\n');
};

export function addresses(): string[] {
  const all: { ip: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      all.push({ ip: a.address, rank: VIRTUAL.test(name) ? 3 : LATE.test(name) || a.address.startsWith('100.') ? 2 : a.address.startsWith('169.254.') ? 4 : 1 });
    }
  }
  return all.sort((a, b) => a.rank - b.rank).map((a) => a.ip);
}
const hosts = () => new Set([...addresses(), '127.0.0.1', 'localhost'].map((h) => `${h}:${st.port}`));
const foreign = (h: IncomingHttpHeaders) => {
  const site = h['sec-fetch-site'];
  return (h.origin !== undefined && h.origin !== `http://${h.host}`) || (site !== undefined && site !== 'same-origin' && site !== 'none');
};
const cookieOf = (h: IncomingHttpHeaders) => {
  for (const part of String(h.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return '';
};
let seenSaved = 0;
function phoneOf(h: IncomingHttpHeaders): Phone | null {
  const tok = cookieOf(h);
  if (!/^[0-9a-f]{64}$/.test(tok)) return null;
  const want = Buffer.from(sha(tok), 'hex');
  const p = st.phones.find((x) => crypto.timingSafeEqual(Buffer.from(x.hash, 'hex'), want)) || null;
  if (p) {
    p.seen = Date.now();
    if (p.seen - seenSaved > 60e3) {
      seenSaved = p.seen;
      save();
    }
  }
  return p;
}
const nameOf = (ua: string) => {
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android phone' : /Windows/.test(ua) ? 'Windows PC' : /Mac OS/.test(ua) ? 'Mac' : 'Phone';
  const browser = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser';
  return `${device}, ${browser}`;
};
const json = (res: ServerResponse, status: number, obj: unknown, head: Record<string, string> = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...head });
  res.end(JSON.stringify(obj));
};
const bodyOf = (req: IncomingMessage) =>
  new Promise<any>((ok) => {
    let s = '';
    req.on('data', (d) => {
      s += d;
      if (s.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        ok(JSON.parse(s || '{}'));
      } catch {
        ok({});
      }
    });
  });

export const allows = (key: string) => ALLOW.has(key);
export function followOk(body: any) {
  const bad = Object.keys(body || {}).find((k) => !FOLLOWS.has(k) && body[k] != null && body[k] !== false);
  if (bad) throw new HttpError(403, NOT_HERE);
}

async function pair(req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  wrong = wrong.filter((t) => now - t < 60e3);
  if (wrong.length >= TRIES) return json(res, 429, { error: 'Too many tries. Wait a minute, then scan the code again.' });
  const { code: got } = await bodyOf(req);
  const live = code && code.until > now ? code : null;
  const ok = live && typeof got === 'string' && got.length === live.value.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(live.value));
  if (!ok) {
    wrong.push(now);
    return json(res, 403, { error: 'This code no longer works. In Amethyst, press Pair a phone for a new one.' });
  }
  code = null;
  const tok = crypto.randomBytes(32).toString('hex');
  const p: Phone = { id: crypto.randomBytes(6).toString('hex'), name: nameOf(String(req.headers['user-agent'] || '')), hash: sha(tok), paired: now, seen: now };
  st.phones.push(p);
  save();
  json(res, 200, { ok: true, name: p.name }, { 'set-cookie': `${COOKIE}=${tok}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${AGE}` });
}

async function onRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    if (!hosts().has(String(req.headers.host || ''))) return json(res, 403, { error: 'forbidden host' });
    if (foreign(req.headers)) return json(res, 403, { error: "Only Amethyst's own pages can use this address." });
    const url = new URL(req.url || '/', 'http://localhost');
    const key = `${req.method} ${url.pathname}`;
    if (key === 'POST /api/remote/pair') return await pair(req, res);
    const phone = phoneOf(req.headers);
    if (!phone) {
      if (url.pathname.startsWith('/api/')) return json(res, 401, { error: PAIR_FIRST });
      const own = url.pathname === '/phone/pair.ts';
      req.url = own ? url.pathname : '/phone/pair.html';
      return await serveIt!(req, res, { phone: null });
    }
    if (key === 'GET /') {
      res.writeHead(302, { location: '/app?phone=1', 'cache-control': 'no-store' });
      return res.end();
    }
    if (key === 'GET /api/remote/me') return json(res, 200, { name: phone.name, alerts: st.alerts });
    if (url.pathname.startsWith('/api/') && !ALLOW.has(key)) return json(res, 403, { error: NOT_HERE });
    if (key === 'GET /api/stream') {
      const set = streams.get(phone.id) || new Set<ServerResponse>();
      streams.set(phone.id, set.add(res));
      res.once('close', () => set.delete(res));
    }
    await serveIt!(req, res, { phone });
  } catch (e) {
    if (!res.headersSent) json(res, (e as HttpError).status || 500, { error: (e as Error).message });
  }
}

const cut = (id?: string) => {
  for (const [pid, set] of streams) if (!id || pid === id) for (const r of set) r.destroy();
};

function start(): Promise<void> {
  if (srv) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = http.createServer((req, res) => void onRequest(req, res));
    s.on('connection', (sock) => {
      sockets.add(sock);
      sock.once('close', () => sockets.delete(sock));
    });
    s.once('error', (e: NodeJS.ErrnoException) => fail(new HttpError(409, e.code === 'EADDRINUSE' ? `Port ${st.port} is taken by another program, so phones can't reach Amethyst.` : e.message)));
    s.listen(st.port, '0.0.0.0', () => {
      srv = s;
      ok();
    });
  });
}
function stop() {
  code = null;
  if (!srv) return;
  srv.close();
  for (const s of sockets) s.destroy();
  sockets.clear();
  srv = null;
}

const urlOf = (ip: string) => `http://${ip}:${st.port}`;
const state = () => ({
  on: st.on,
  listening: !!srv,
  port: st.port,
  alerts: st.alerts,
  addresses: addresses().map(urlOf),
  code: code && code.until > Date.now() ? { url: `${urlOf(addresses()[0] || '127.0.0.1')}/#pair=${code.value}`, until: code.until } : null,
  phones: st.phones.map(({ id, name, paired, seen }) => ({ id, name, paired, seen })),
});

export const ROUTES: Routes = {
  'GET /api/remote/state': async () => state(),
  'POST /api/remote/on': async ({ on }) => {
    if (on) {
      await start();
      st.on = true;
    } else {
      st.on = false;
      stop();
    }
    save();
    return state();
  },
  'POST /api/remote/code': async () => {
    if (!srv) throw new HttpError(409, 'Turn on Phone remote control first.');
    code = { value: crypto.randomBytes(9).toString('base64url'), until: Date.now() + CODE_LIFE };
    return state();
  },
  'POST /api/remote/alerts': async ({ on }) => {
    st.alerts = !!on;
    save();
    return state();
  },
  'POST /api/remote/forget': async ({ id }) => {
    st.phones = id ? st.phones.filter((p) => p.id !== id) : [];
    cut(id || undefined);
    save();
    return state();
  },
};

export function init(dir: string, serve: Serve) {
  file = path.join(dir, 'remote.json');
  serveIt = serve;
  try {
    const got = JSON.parse(fs.readFileSync(file, 'utf8'));
    st = { on: !!got.on, port: Number(got.port) || PORT, alerts: got.alerts !== false, phones: Array.isArray(got.phones) ? got.phones : [] };
  } catch {}
  if (process.env.MIND_REMOTE_PORT) st.port = Number(process.env.MIND_REMOTE_PORT);
  if (st.on) start().catch((e) => console.error(`Phone remote control: ${e.message}`));
}
