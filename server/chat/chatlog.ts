import fs from 'fs';
import path from 'path';
import { CALM, exists, replace, replaceSync } from '../base/util.ts';
import { OUT_MAX } from '../../public/base/util.ts';

type Ev = Record<string, any>;
const fsp = fs.promises;
let listFile: string | null = null, dir: string | null = null, timer: ReturnType<typeof setTimeout> | null = null, listing: Promise<unknown> = Promise.resolve(), leaving = false;
const entries = new Map<string, any>();
const lines = new Map<string, string>();
const due = new Map<string, () => any>();
const chains = new Map<string, Promise<unknown>>();

const fileOf = (id: string) => path.join(dir!, id + '.jsonl');
const inLine = (id: string, fn: () => Promise<unknown>) => {
  const run = (chains.get(id) || Promise.resolve()).then(fn).catch(() => {});
  chains.set(id, run);
  run.then(() => chains.get(id) === run && chains.delete(id));
  return run;
};
const listText = () => JSON.stringify([...entries.values()]);
const writeList = () => (listing = replace(listFile!, listText()).catch(() => {}));

function init(dataDir: string) {
  listFile = path.join(dataDir, 'chats.json');
  dir = path.join(dataDir, 'chats');
  let all: any = [];
  try {
    all = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  } catch {}
  for (const e of Array.isArray(all) ? all : []) {
    if (e?.session && e.id) entries.set(e.id, e);
    else if (e?.id) fs.rmSync(fileOf(e.id), { force: true });
  }
  return [...entries.values()];
}

function push() {
  clearTimeout(timer!);
  timer = null;
  for (const [id, text] of lines)
    inLine(id, async () => {
      await fsp.mkdir(dir!, { recursive: true });
      await fsp.appendFile(fileOf(id), text);
    });
  lines.clear();
  if (!due.size) return;
  for (const [id, now] of due) entries.set(id, now());
  due.clear();
  writeList();
}
async function flush() {
  push();
  while (chains.size) await Promise.all([...chains.values()]);
  await listing;
}
function flushSync() {
  clearTimeout(timer!);
  timer = null;
  for (const [id, text] of lines) {
    try {
      fs.mkdirSync(dir!, { recursive: true });
      fs.appendFileSync(fileOf(id), text);
    } catch {}
  }
  lines.clear();
  if (!due.size) return;
  for (const [id, now] of due) entries.set(id, now());
  due.clear();
  try {
    replaceSync(listFile!, listText());
  } catch {}
}
const soon = () => (timer ||= setTimeout(push, CALM));

function add(id: string, ev: Ev | null, now?: (() => any) | null) {
  if (ev) lines.set(id, (lines.get(id) || '') + JSON.stringify(ev) + '\n');
  if (now) due.set(id, now);
  soon();
}
function parse(text: string) {
  const out: Ev[] = [];
  for (const l of text.split('\n')) {
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}
function read(id: string) {
  try {
    return parse(fs.readFileSync(fileOf(id), 'utf8'));
  } catch {
    return [];
  }
}
async function readSlowly(id: string) {
  try {
    return await parseSlowly(await fsp.readFile(fileOf(id), 'utf8'));
  } catch {
    return [];
  }
}
const sizeOf = (id: string) => fsp.stat(fileOf(id)).then((s) => s.size, () => 0);
function write(id: string, events: Ev[]) {
  const text = events.map((e) => JSON.stringify(e) + '\n').join('');
  return inLine(id, () => replace(fileOf(id), text));
}
function forget(id: string) {
  lines.delete(id);
  due.delete(id);
  inLine(id, () => fsp.rm(fileOf(id), { force: true }));
  if (entries.delete(id)) writeList();
}
const breathe = () => new Promise((ok) => setImmediate(ok));
async function parseSlowly(text: string) {
  const out: Ev[] = [];
  let i = 0;
  for (const l of text.split('\n')) {
    if (++i % 2000 === 0) await breathe();
    if (!l) continue;
    try {
      out.push(JSON.parse(l));
    } catch {}
  }
  return out;
}
async function slimOld(open: (id: string) => boolean) {
  const mark = path.join(dir!, '.tidied');
  if (!dir || (await exists(mark))) return;
  const names = await fsp.readdir(dir).catch(() => [] as string[]);
  const files = await Promise.all(names.filter((n) => n.endsWith('.jsonl')).map(async (n) => ({ id: n.slice(0, -6), size: (await fsp.stat(path.join(dir!, n)).catch(() => null))?.size || 0 })));
  files.sort((a, b) => b.size - a.size);
  const busy = (id: string) => leaving || open(id) || lines.has(id) || chains.has(id);
  for (const { id } of files) {
    if (leaving) return;
    if (!entries.has(id) || busy(id)) continue;
    const text = await fsp.readFile(fileOf(id), 'utf8').catch(() => null);
    if (text == null || busy(id)) continue;
    const { events, changed } = tidy(await parseSlowly(text));
    await breathe();
    if (changed && !busy(id)) await write(id, events);
    await breathe();
  }
  if (!leaving) await fsp.writeFile(mark, '').catch(() => {});
}
const leave = () => {
  leaving = true;
  return flush();
};

const TEXT = /^(agent_message|agent_thought|user_message|compaction_summary)_chunk$/;
function joins(prev: Ev | undefined, ev: Ev) {
  const p = prev?.update, u = ev?.update;
  return TEXT.test(u?.sessionUpdate) && u.content?.type === 'text' && p?.sessionUpdate === u.sessionUpdate && p.content?.type === 'text' && p.messageId === u.messageId;
}
function cut(c: any) {
  const im = c?.type === 'content' && c.content?.type === 'image' && typeof c.content.data === 'string' ? c.content : null;
  if (im) {
    const { data, ...rest } = im;
    return { ...c, content: { ...rest, bytes: Math.floor((data.length * 3) / 4) } };
  }
  const t = c?.type === 'content' && c.content?.type === 'text' ? c.content.text : null;
  if (typeof t !== 'string' || t.length <= OUT_MAX) return c;
  const f = t.match(/^(```\w*\n)([\s\S]*?)(\n?```\s*)$/);
  const text = f ? f[1] + f[2].slice(0, OUT_MAX) + f[3] : t.slice(0, OUT_MAX);
  return text === t ? c : { ...c, content: { ...c.content, text } };
}
function slim(u: any) {
  if (u?.sessionUpdate !== 'tool_call' && u?.sessionUpdate !== 'tool_call_update') return u;
  const cc = u._meta?.claudeCode, cuts = Array.isArray(u.content) ? u.content.map(cut) : null;
  const content = cuts?.some((c: any, i: number) => c !== u.content[i]) ? cuts : u.content;
  const term = u._meta?.terminal_output, long = term?.data?.length > OUT_MAX;
  if (!('rawOutput' in u) && !(cc && 'toolResponse' in cc) && content === u.content && !long) return u;
  const { rawOutput, ...out } = u;
  if (cc && 'toolResponse' in cc) {
    const { toolResponse, ...rest } = cc;
    out._meta = { ...u._meta, claudeCode: rest };
  }
  if (long) out._meta = { ...(out._meta || u._meta), terminal_output: { ...term, data: term.data.slice(-OUT_MAX) } };
  if (content !== u.content) out.content = content;
  return out;
}

function tidy(all: Ev[]) {
  const out: Ev[] = [], open = new Map(), queued = new Set();
  let running = false, changed = false;
  const ready = all.findLastIndex((e) => e.type === 'status' && e.state === 'ready');
  all.forEach((ev, i) => {
    if (ev.type === 'end' || (ev.type === 'status' && i !== ready)) return void (changed = true);
    const u = ev.type === 'update' ? slim(ev.update) : ev.update;
    if (u !== ev.update) {
      ev = { ...ev, update: u };
      changed = true;
    }
    if (joins(out.at(-1), ev)) {
      out.at(-1)!.update.content.text += ev.update.content.text;
      return void (changed = true);
    }
    if (ev.type === 'ask') open.set(ev.ask, ev);
    else if (ev.type === 'answered') open.delete(ev.ask);
    else if (ev.type === 'queued') queued.add(ev.qid);
    else if (ev.type === 'unqueued') (ev.qids || []).forEach((q: string) => queued.delete(q));
    else if (ev.type === 'you') {
      queued.delete(ev.qid);
      running = true;
    } else if (ev.type === 'own') running = true;
    else if (ev.type === 'shrink') running = ev.state === 'start';
    else if (ev.type === 'turn') running = false;
    out.push(ev);
  });
  const lost = new Set(open.values());
  const kept = out.filter((ev) => !lost.has(ev));
  const at = Date.now();
  if (queued.size) kept.push({ type: 'unqueued', qids: [...queued], at });
  if (running) kept.push({ type: 'turn', stopReason: 'interrupted', at });
  return { events: kept, changed: changed || !!lost.size || !!queued.size || running };
}

export { init, add, read, readSlowly, sizeOf, write, forget, flush, flushSync, leave, slimOld, tidy, joins, slim };
