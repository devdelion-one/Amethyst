import fs from 'fs';
import os from 'os';
import path from 'path';

type Summary = { id: string; cwd: string; at: number; dir: string; title: string };

const MAX_TEXT = 2e6;
const MAX_READ = 8e6;
const MAX_FILES = 300;
const ID = /^[\w-]{8,80}$/;

const home = () => process.env.MIND_GROK_HOME || process.env.GROK_HOME || path.join(os.homedir(), '.grok');
const key = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const texts = new Map<string, { at: number; text: string }>();

async function summaries(): Promise<Summary[]> {
  const root = path.join(home(), 'sessions');
  const groups = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
  const out: Summary[] = [];
  for (const g of groups) {
    if (!g.isDirectory()) continue;
    const gdir = path.join(root, g.name);
    const ids = await fs.promises.readdir(gdir, { withFileTypes: true }).catch(() => [] as fs.Dirent[]);
    const items = await Promise.all(
      ids.filter((e) => e.isDirectory() && ID.test(e.name)).map(async (e) => {
        const dir = path.join(gdir, e.name);
        const raw = await fs.promises.readFile(path.join(dir, 'summary.json'), 'utf8').catch(() => '');
        if (!raw) return null;
        try {
          const s = JSON.parse(raw);
          const cwd = String(s?.info?.cwd || '').trim();
          const id = String(s?.info?.id || e.name);
          if (!cwd) return null;
          const at = Date.parse(s?.updated_at || s?.last_active_at || s?.created_at || '') || 0;
          const title = String(s?.generated_title || s?.session_summary || '').trim();
          return { id, cwd, at, dir, title };
        } catch {
          return null;
        }
      }),
    );
    for (const x of items) if (x) out.push(x);
  }
  return out;
}

async function textOf(s: Summary) {
  const file = path.join(s.dir, 'updates.jsonl');
  let at = 0, size = 0;
  try {
    const st = await fs.promises.stat(file);
    at = st.mtimeMs;
    size = st.size;
  } catch {
    return s.title;
  }
  const had = texts.get(s.id);
  if (had?.at === at) return had.text;
  let text = s.title ? s.title + '\n' : '';
  try {
    const fd = await fs.promises.open(file, 'r');
    const buf = Buffer.alloc(Math.min(size, MAX_READ));
    await fd.read(buf, 0, buf.length, 0).finally(() => fd.close());
    for (const line of buf.toString('utf8').split('\n')) {
      if (!/"(user|agent)_message_chunk"/.test(line)) continue;
      try {
        const e = JSON.parse(line), u = e?.params?.update || e?.update || e;
        const t = u?.content?.text;
        if (typeof t === 'string' && t) text += t;
      } catch {}
      if (text.length > MAX_TEXT) break;
    }
  } catch {
    text = s.title;
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
