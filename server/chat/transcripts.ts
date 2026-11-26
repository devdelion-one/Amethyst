import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { configDir } from '../base/agentdirs.ts';

const projectsDir = () => path.join(configDir(), 'projects');
type Said = { you: boolean; t: string };
interface Text {
  size: number;
  mtimeMs: number;
  offset: number;
  text: string;
  low: string;
  first: string | null;
}
const transcriptsDir = (cwd: string) => path.join(projectsDir(), cwd.replace(/[^a-zA-Z0-9]/g, '-'));
async function mdIn(dir: string) {
  const names = (await fs.promises.readdir(dir).catch(() => [])).filter((n) => /.md$/i.test(n));
  const stats = await Promise.all(names.map((n) => fs.promises.stat(path.join(dir, n)).catch(() => null)));
  return names.flatMap((name, i) => (stats[i]?.isFile() ? [{ name, abs: path.join(dir, name), mtime: stats[i]!.mtimeMs }] : []));
}
const memoryFiles = (cwd: string, dir = path.join(transcriptsDir(cwd), 'memory')) => mdIn(dir);
async function globalFiles(dir = configDir()) {
  const [top, rules] = await Promise.all([mdIn(dir), mdIn(path.join(dir, 'rules'))]);
  return [...top.filter((f) => /^claude\.md$/i.test(f.name)), ...rules.map((f) => ({ ...f, rule: true }))];
}
const hasProjectClaude = async (cwd: string) =>
  (await Promise.all(['CLAUDE.md', '.claude/CLAUDE.md'].map((f) => fs.promises.stat(path.join(cwd, f)).catch(() => null)))).some((s) => s?.isFile());
const texts = new Map<string, Text>();
const building = new Map<string, Promise<string[]>>();
const WRAPS = /<(system-reminder|command-[a-z-]+|local-command-[a-z-]+)>[\s\S]*?<\/\1>/g;

function saidIn(line: Buffer): Said | null {
  if ((!line.includes('"type":"user"') && !line.includes('"type":"assistant"')) || line.includes('"tool_use_id"')) return null;
  let m;
  try {
    m = JSON.parse(line.toString('utf8'));
  } catch {
    return null;
  }
  if ((m.type !== 'user' && m.type !== 'assistant') || m.isMeta || m.isSidechain || m.isCompactSummary) return null;
  const c = m.message?.content;
  const t = (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('\n') : '').replace(WRAPS, '').trim();
  return t ? { you: m.type === 'user', t } : null;
}
function readSaid(file: string, start: number, end?: number): Promise<{ said: Said[]; at: number }> {
  return new Promise((resolve) => {
    const said: Said[] = [];
    let buf: Buffer = Buffer.alloc(0), at = start;
    const s = fs.createReadStream(file, { start, end });
    s.on('data', (d: string | Buffer) => {
      buf = buf.length ? Buffer.concat([buf, d as Buffer]) : d as Buffer;
      for (let i: number; (i = buf.indexOf(10)) >= 0; ) {
        const x = saidIn(buf.subarray(0, i));
        if (x) said.push(x);
        at += i + 1;
        buf = buf.subarray(i + 1);
      }
    });
    s.on('close', () => resolve({ said, at }));
  });
}
const firstOf = (said: Said[]) => said.find((x) => x.you)?.t.replace(/\s+/g, ' ').slice(0, 80) || null;
async function transcript(file: string) {
  let st;
  try {
    st = await fs.promises.stat(file);
  } catch {
    texts.delete(file);
    return null;
  }
  const was = texts.get(file);
  if (was && was.size === st.size && was.mtimeMs === st.mtimeMs) return was;
  const from = was && st.size >= was.offset && st.mtimeMs >= was.mtimeMs ? was : null;
  const { said, at } = await readSaid(file, from?.offset || 0);
  const add = said.map((x) => x.t).join('\n');
  const text = from?.text && add ? from.text + '\n' + add : from?.text || add;
  const e = { size: st.size, mtimeMs: st.mtimeMs, offset: at, text, low: text.toLowerCase(), first: from?.first || firstOf(said) };
  texts.set(file, e);
  return e;
}
function textIndex(dir: string) {
  if (building.has(dir)) return building.get(dir)!;
  const run = (async () => {
    const names = await fs.promises.readdir(dir).catch(() => []);
    const files = names.filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dir, n));
    const now = new Set(files);
    for (const f of texts.keys()) if (path.dirname(f) === dir && !now.has(f)) texts.delete(f);
    for (const f of files) await transcript(f);
    return files;
  })().finally(() => building.delete(dir));
  building.set(dir, run);
  return run;
}
async function firstAsked(file: string) {
  if (texts.get(file)?.first) return texts.get(file)!.first;
  return firstOf((await readSaid(file, 0, 256 * 1024 - 1)).said);
}
function snippet(text: string, word: string) {
  const m = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').exec(text);
  if (!m) return '';
  let a = Math.max(0, m.index - 45), b = Math.min(text.length, m.index + m[0].length + 75);
  const sa = text.indexOf(' ', a);
  if (a > 0 && sa >= 0 && sa < m.index) a = sa + 1;
  const sb = text.lastIndexOf(' ', b);
  if (b < text.length && sb > m.index + m[0].length) b = sb;
  return (a > 0 ? '…' : '') + text.slice(a, b).replace(/\s+/g, ' ').trim() + (b < text.length ? '…' : '');
}
async function search(dir: string, words: string[]) {
  const hits: { id: string; snip: string; at: number }[] = [];
  for (const f of await textIndex(dir)) {
    const e = texts.get(f);
    if (e && words.every((w) => e.low.includes(w))) hits.push({ id: path.basename(f, '.jsonl'), snip: snippet(e.text, words[0]), at: e.mtimeMs });
  }
  hits.sort((x, y) => y.at - x.at);
  return hits.slice(0, 100);
}

const TOKEN_STEP = 10 * 60e3, TOKEN_KEEP = 8 * 24 * 3600e3;
const readTo = new Map<string, number>();
const claudeTurns = new Map<string, { at: number; n: number }>();
async function readTranscript(file: string, start: number, end: number) {
  for await (const l of readline.createInterface({ input: fs.createReadStream(file, { start, end, encoding: 'utf8' }), crlfDelay: Infinity })) {
    if (!l.includes('"usage"')) continue;
    let o;
    try {
      o = JSON.parse(l);
    } catch {
      continue;
    }
    const u = o.message?.usage, at = Date.parse(o.timestamp);
    if (o.type !== 'assistant' || !u || !at) continue;
    const n = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.output_tokens || 0), id = o.message.id || o.uuid;
    if (n > (claudeTurns.get(id)?.n || 0)) claudeTurns.set(id, { at, n });
  }
}
let tokensRead: Promise<[number, number][]> | null = null;
function claudeTokens() {
  return (tokensRead ||= (async () => {
    const dir = projectsDir(), since = Date.now() - TOKEN_KEEP, steps = new Map<number, number>();
    for (const name of await fs.promises.readdir(dir, { recursive: true }).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue;
      const file = path.join(dir, name), st = await fs.promises.stat(file).catch(() => null), from = readTo.get(file) || 0;
      if (!st || st.mtimeMs < since || st.size <= from) continue;
      await readTranscript(file, from, st.size - 1).catch(() => {});
      readTo.set(file, st.size);
    }
    for (const [id, t] of claudeTurns) {
      const step = t.at - (t.at % TOKEN_STEP);
      if (t.at < since) claudeTurns.delete(id);
      else steps.set(step, (steps.get(step) || 0) + t.n);
    }
    return [...steps];
  })().finally(() => (tokensRead = null)));
}

export { configDir, transcriptsDir, memoryFiles, globalFiles, hasProjectClaude, textIndex, firstAsked, search, snippet, claudeTokens };
