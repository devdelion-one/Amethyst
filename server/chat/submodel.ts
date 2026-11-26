import fs from 'fs';
import path from 'path';
import { transcriptsDir } from './transcripts.ts';

const EVERY = 1000;
const GIVE_UP = 120000;
const HEAD = 65536;
const META = /^agent-([\w-]+)\.meta\.json$/;
const MODEL = /"model":"([\w.:-]+)"/;

interface Want {
  on: (model: string) => void;
  start: number;
}
interface Sub {
  want: Map<string, Want>;
  seen: Set<string>;
  timer: ReturnType<typeof setInterval> | null;
}
interface SubChat {
  submodel?: Sub;
  cwd?: string;
  sessionId?: string | null;
  ended?: boolean;
}

const of = (c: SubChat): Sub => (c.submodel ||= { want: new Map(), seen: new Set(), timer: null });
const dirOf = (c: SubChat) => (c.cwd && c.sessionId ? path.join(transcriptsDir(c.cwd), c.sessionId, 'subagents') : null);

function json(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
function firstModel(file: string) {
  let fd: number | null = null;
  try {
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(HEAD);
    const n = fs.readSync(fd, buf, 0, HEAD, 0);
    return buf.toString('utf8', 0, n).match(MODEL)?.[1] || null;
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function modelIn(dir: string, name: string, meta: any) {
  if (typeof meta.pickedEffortModel === 'string' && meta.pickedEffortModel) return meta.pickedEffortModel;
  if (typeof meta.model === 'string' && /^claude-/.test(meta.model)) return meta.model;
  return firstModel(path.join(dir, name.replace(/\.meta\.json$/, '.jsonl')));
}

function poll(c: SubChat) {
  const M = of(c), now = Date.now();
  for (const [id, w] of M.want) if (now - w.start > GIVE_UP) M.want.delete(id);
  if (!M.want.size || c.ended) return void (clearInterval(M.timer!), (M.timer = null));
  const dir = dirOf(c);
  if (!dir) return;
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => META.test(n));
  } catch {
    return;
  }
  for (const name of names) {
    const meta = json(path.join(dir, name));
    const id = meta && typeof meta.toolUseId === 'string' ? meta.toolUseId : null;
    const w = id && M.want.get(id);
    if (!w) continue;
    const model = modelIn(dir, name, meta);
    if (!model) continue;
    M.want.delete(id!);
    M.seen.add(id!);
    w.on(model);
  }
}

function watch(c: SubChat, id: string, on: (model: string) => void) {
  const M = of(c);
  if (!id || M.want.has(id) || M.seen.has(id)) return;
  M.want.set(id, { on, start: Date.now() });
  M.timer ||= setInterval(() => poll(c), EVERY);
}
function stopAll(c: SubChat) {
  if (!c.submodel) return;
  clearInterval(c.submodel.timer!);
  c.submodel.timer = null;
  c.submodel.want.clear();
}

export { watch, stopAll, poll };
