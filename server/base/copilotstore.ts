import fs from 'fs';
import os from 'os';
import path from 'path';

type Summary = { id: string; cwd: string; at: number; dir: string };

const MAX_TEXT = 2e6;
const MAX_READ = 8e6;
const MAX_FILES = 300;
const ID = /^[\w-]{8,80}$/;

const home = () => process.env.MIND_COPILOT_HOME || process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
const key = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const texts = new Map<string, { at: number; text: string }>();

function valueOf(yaml: string, name: string) {
  const m = new RegExp(`^${name}:[ \\t]*(.*)$`, 'm').exec(yaml);
  if (!m) return '';
  const v = m[1].trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  return v.startsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : v;
}

async function summaries(): Promise<Summary[]> {
  const root = path.join(home(), 'session-state');
  const names = await fs.promises.readdir(root).catch(() => [] as string[]);
  const out = await Promise.all(
    names.filter((n) => ID.test(n)).map(async (id) => {
      const dir = path.join(root, id);
      const [yaml, st] = await Promise.all([fs.promises.readFile(path.join(dir, 'workspace.yaml'), 'utf8').catch(() => ''), fs.promises.stat(path.join(dir, 'events.jsonl')).catch(() => null)]);
      const cwd = valueOf(yaml, 'cwd');
      if (!cwd || !st || !st.size) return null;
      return { id, cwd, at: Date.parse(valueOf(yaml, 'updated_at')) || st.mtimeMs, dir };
    }),
  );
  return out.filter(Boolean) as Summary[];
}

async function textOf(s: Summary) {
  const file = path.join(s.dir, 'events.jsonl');
  let at = 0, size = 0;
  try {
    const st = await fs.promises.stat(file);
    at = st.mtimeMs;
    size = st.size;
  } catch {
    return '';
  }
  const had = texts.get(s.id);
  if (had?.at === at) return had.text;
  let text = '';
  try {
    const fd = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(Math.min(size, MAX_READ));
    await fd.read(buf, 0, buf.length, 0).finally(() => fd.close());
    for (const line of buf.toString('utf8').split('\n')) {
      if (!/"type":"(user|assistant)\.message"/.test(line)) continue;
      try {
        const e = JSON.parse(line), t = e?.data?.content;
        if (typeof t === 'string' && t.trim()) text += t.trim() + '\n';
      } catch {}
      if (text.length > MAX_TEXT) break;
    }
  } catch {
    text = '';
  }
  texts.set(s.id, { at, text });
  return text;
}

function snipOf(text: string, words: string[]) {
  const low = text.toLowerCase();
  const at = low.indexOf(words[0]);
  const from = Math.max(0, at - 60), to = Math.min(text.length, at + words[0].length + 100);
  return ((from ? '…' : '') + text.slice(from, to) + (to < text.length ? '…' : '')).replace(/\s+/g, ' ').trim();
}

export async function search(root: string, words: string[]) {
  const here = key(root);
  const mine = (await summaries()).filter((s) => key(s.cwd) === here).sort((a, b) => b.at - a.at).slice(0, MAX_FILES);
  const hits: { id: string; snip: string }[] = [];
  for (const s of mine) {
    const text = await textOf(s);
    const low = text.toLowerCase();
    if (text && words.every((w) => low.includes(w))) hits.push({ id: s.id, snip: snipOf(text, words) });
  }
  return hits;
}

export async function folders() {
  const out = new Map<string, number>();
  for (const s of await summaries()) out.set(s.cwd, Math.max(out.get(s.cwd) || 0, s.at));
  return out;
}
