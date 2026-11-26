import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

type Summary = { id: string; title: string; preview: string; at: number; folders: string[] };

const MAX_TEXT = 2e6;
const MAX_FILES = 300;
const RUN = /[^\x00-\x1f�]{4,}/g;
const ID = /^[\s\W]*[\w$"!:(-]*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|^[\s\W]*[0-9a-f]{24,}\b/i;

export const agyHome = () => process.env.MIND_AGY_HOME || path.join(os.homedir(), '.gemini', 'antigravity-cli');
const home = agyHome;
const key = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const texts = new Map<string, { at: number; text: string }>();
let sqlite: any = null;

async function open(file: string) {
  sqlite ||= await import('node:sqlite');
  return new sqlite.DatabaseSync(file, { readOnly: true });
}

function folderOf(uri: string) {
  try {
    return path.resolve(fileURLToPath(decodeURIComponent(uri)));
  } catch {
    return null;
  }
}

async function summaries(): Promise<Summary[]> {
  const file = path.join(home(), 'conversation_summaries.db');
  if (!fs.existsSync(file)) return [];
  let db: any = null;
  try {
    db = await open(file);
    const rows = db.prepare('select conversation_id id, title, preview, last_modified_time at, workspace_uris uris, step_count n from conversation_summaries').all();
    return rows
      .filter((r: any) => r.n > 0)
      .map((r: any) => {
        let uris: string[] = [];
        try {
          uris = JSON.parse(r.uris || '[]');
        } catch {}
        return { id: String(r.id), title: String(r.title || ''), preview: String(r.preview || ''), at: Date.parse(r.at) || 0, folders: uris.map(folderOf).filter(Boolean) as string[] };
      });
  } catch {
    return [];
  } finally {
    db?.close();
  }
}

async function textOf(id: string) {
  const file = path.join(home(), 'conversations', id + '.db');
  let at = 0;
  try {
    at = fs.statSync(file).mtimeMs;
  } catch {
    return '';
  }
  const had = texts.get(id);
  if (had?.at === at) return had.text;
  let db: any = null, text = '';
  try {
    db = await open(file);
    for (const r of db.prepare('select step_payload p from steps order by idx').iterate()) {
      const runs = Buffer.from(r.p || []).toString('utf8').match(RUN) || [];
      for (const run of runs) if (!ID.test(run)) text += run.trim() + '\n';
      if (text.length > MAX_TEXT) break;
    }
  } catch {
    text = '';
  } finally {
    db?.close();
  }
  texts.set(id, { at, text });
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
  const mine = (await summaries()).filter((s) => s.folders.some((f) => key(f) === here)).sort((a, b) => b.at - a.at).slice(0, MAX_FILES);
  const hits: { id: string; snip: string; title: string; at: number }[] = [];
  for (const s of mine) {
    const text = await textOf(s.id);
    const low = text.toLowerCase();
    if (text && words.every((w) => low.includes(w))) hits.push({ id: s.id, snip: snipOf(text, words), title: s.title, at: s.at });
  }
  return hits;
}

export async function folders() {
  const list = await summaries();
  const out = new Map<string, number>();
  for (const s of list) for (const f of s.folders) out.set(f, Math.max(out.get(f) || 0, s.at));
  return out;
}
