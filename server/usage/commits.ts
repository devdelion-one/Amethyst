import { git } from '../base/gitcli.ts';

export interface Commit {
  hash: string;
  at: number;
  files: number;
}

const KEEP_MS = 60e3;
const kept = new Map<string, { at: number; list: Promise<Commit[]> }>();

async function read(dir: string, days: number): Promise<Commit[]> {
  const r = await git(dir, ['log', '--all', `--since=${days}.days`, '--numstat', '--format=%H%x09%at'], { quiet: true, timeout: 60e3 });
  if (r.code) return [];
  const out: Commit[] = [];
  let now: Commit | null = null;
  for (const line of r.out.split(/\r?\n/)) {
    const head = /^([0-9a-f]{40,64})\t(\d+)$/.exec(line);
    if (head) out.push((now = { hash: head[1], at: Number(head[2]) * 1000, files: 0 }));
    else if (now && line.trim()) now.files++;
  }
  return out;
}

export function commitsIn(dir: string, days: number): Promise<Commit[]> {
  const key = `${days}\t${dir}`, was = kept.get(key);
  if (was && Date.now() - was.at < KEEP_MS) return was.list;
  const list = read(dir, days).catch(() => []);
  kept.set(key, { at: Date.now(), list });
  return list;
}

export async function commitsOf(dirs: string[], days: number): Promise<Commit[]> {
  const seen = new Map<string, Commit>();
  for (const list of await Promise.all(dirs.map((d) => commitsIn(d, days)))) for (const c of list) seen.set(c.hash, c);
  return [...seen.values()];
}
