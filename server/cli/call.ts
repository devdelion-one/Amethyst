import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

export type ArgType = 'string' | 'number' | 'boolean' | 'list' | 'object';
export type Arg = { name: string; type: ArgType; about: string; required?: boolean; pos?: boolean; rest?: boolean };
export type Act = { name: string; tool: string; about: string; args: Arg[]; route: string; example?: string; cli?: boolean };
export type Where = { workspace: string; project: string; name: string; path: string };
type Reply = { status: number; body: any };

export const NOT_RUNNING = "Amethyst isn't running. Start it and try again.";

export class Failed {
  message: string;
  code: number;
  constructor(message: string, code = 1) {
    this.message = message;
    this.code = code;
  }
}

export const serverFile = () => path.join(process.env.APPDATA || os.homedir(), process.env.APPDATA ? 'Amethyst' : '.amethyst', '.amethyst', 'server.json');

export function serverUrl(): string | null {
  if (process.env.AMETHYST_URL) return process.env.AMETHYST_URL.replace(/\/+$/, '');
  try {
    const s = JSON.parse(fs.readFileSync(serverFile(), 'utf8'));
    return Number.isInteger(s.port) ? `http://127.0.0.1:${s.port}` : null;
  } catch {
    return null;
  }
}

export function request(method: string, route: string, body: unknown = null, headers: Record<string, string> = {}): Promise<Reply> {
  const base = serverUrl();
  if (!base) return Promise.reject(new Failed(NOT_RUNNING));
  const url = new URL(route, base), data = body == null ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers: { ...headers, ...(data ? { 'content-type': 'application/json', 'content-length': String(data.length) } : {}) } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (text += d));
      res.on('end', () => {
        let parsed: any = null;
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { error: text.slice(0, 500) };
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    req.on('error', (e: NodeJS.ErrnoException) => reject(new Failed(e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET' ? NOT_RUNNING : `can't reach Amethyst at ${base}: ${e.message}`)));
    if (data) req.write(data);
    req.end();
  });
}

export async function acts(): Promise<Act[]> {
  const r = await request('GET', '/api/acts');
  if (r.status !== 200) throw new Failed(r.body?.error || `Amethyst answered ${r.status}`);
  return r.body.acts;
}

export async function where(dir: string, project?: string): Promise<Where | null> {
  const q = new URLSearchParams(project ? { project } : { path: dir });
  const r = await request('GET', '/api/where?' + q);
  if (r.status === 200) return r.body;
  if (project) throw new Failed(r.body?.error || `no project ${project}`);
  return null;
}

export async function run(act: Act, args: Record<string, unknown>, at: Where | null, am?: number): Promise<any> {
  const [method, route] = act.route.split(' ');
  const headers: Record<string, string> = { 'x-mind-workspace': at?.workspace || '', 'x-mind-project': at?.project || '', ...(am ? { 'x-mind-am': String(am) } : {}) };
  let r: Reply;
  if (method === 'GET') {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(args)) if (v != null) q.set(k, Array.isArray(v) ? v.join(',') : typeof v === 'object' ? JSON.stringify(v) : String(v));
    r = await request('GET', route + (q.size ? '?' + q : ''), null, headers);
  } else r = await request(method, route, args, headers);
  if (r.status !== 200) throw new Failed(r.body?.error || `Amethyst answered ${r.status}`);
  return r.body;
}

export const caller = () => (process.env.AMETHYST_CHAT && process.env.AMETHYST_PASS ? { by: process.env.AMETHYST_CHAT, key: process.env.AMETHYST_PASS } : { by: 'cli' });
