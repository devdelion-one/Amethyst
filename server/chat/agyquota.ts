import { spawn } from 'child_process';
import crypto from 'crypto';
import net from 'net';
import os from 'os';

export type AgyLimit = { label: string; mins: number; pct: number; resets: number };

const CALL = '/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary';
const WINDOWS: Record<string, number> = { '5h': 300, weekly: 10080 };
const GIVE_UP = 15e3, EVERY = 500;

const freePort = () => new Promise<number>((res, rej) => {
  const s = net.createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address() as net.AddressInfo;
    s.close(() => res(port));
  });
});

export function limitsOfSummary(r: any): AgyLimit[] | null {
  const groups = r?.response?.groups;
  if (!Array.isArray(groups)) return null;
  return groups.flatMap((g: any) => (Array.isArray(g?.buckets) ? g.buckets : []).flatMap((b: any) => {
    const mins = WINDOWS[b?.window], left = Number(b?.remainingFraction);
    if (!mins || !Number.isFinite(left)) return [];
    const at = b.resetTime ? Date.parse(b.resetTime) : NaN;
    return [{ label: String(g.displayName || ''), mins, pct: Math.max(0, Math.min(100, Math.round((1 - left) * 100))), resets: Number.isFinite(at) ? Math.floor(at / 1000) : 0 }];
  }));
}

let reading: Promise<AgyLimit[] | null> | null = null;

export function agyQuota(cmd: string, pre: string[], env: NodeJS.ProcessEnv): Promise<AgyLimit[] | null> {
  return (reading ||= ask(cmd, pre, env).finally(() => (reading = null)));
}

async function ask(cmd: string, pre: string[], env: NodeJS.ProcessEnv): Promise<AgyLimit[] | null> {
  const port = await freePort().catch(() => 0);
  if (!port) return null;
  const token = crypto.randomUUID();
  const hub = spawn(cmd, [...pre, '--hub', `--hub-port=${port}`, '--app_data_dir=antigravity-cli', `--csrf_token=${token}`], { cwd: os.homedir(), env, windowsHide: true, stdio: 'ignore' });
  let gone = false;
  hub.once('error', () => (gone = true));
  hub.once('exit', () => (gone = true));
  try {
    const end = Date.now() + GIVE_UP;
    while (!gone && Date.now() < end) {
      await new Promise((r) => setTimeout(r, EVERY));
      const r = await fetch(`http://127.0.0.1:${port}${CALL}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', 'x-codeium-csrf-token': token },
        body: '{}',
        signal: AbortSignal.timeout(5e3),
      }).catch(() => null);
      if (!r) continue;
      if (r.status === 401) return null;
      if (r.status !== 200) continue;
      const got = limitsOfSummary(await r.json().catch(() => null));
      if (got) return got;
    }
    return null;
  } finally {
    if (!gone) hub.kill();
  }
}
