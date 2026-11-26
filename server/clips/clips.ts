import fs from 'fs';
const fsp = fs.promises;
import path from 'path';
import type { Routes } from '../../public/base/types.ts';
import { replace, stamp } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';
import { raw } from '../base/page.ts';

interface Clip {
  id: string;
  file: string;
  kind: string;
  at: number;
}

let DIR: string | null = null;
const init = (o: { dataDir: string }) => (DIR = path.join(o.dataDir, 'clips'));
const INDEX = () => path.join(DIR!, 'clips.json');

const IMAGE_EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
const MAX_IMAGE = 14 * 1024 * 1024, MAX_TEXT = 1e6, PEEK = 300;
const ID = /^[a-z0-9]{1,24}$/;
const FILE = /^[\w\- ]+\.(png|jpe?g|gif|webp|md)$/i;
const newId = () => Math.random().toString(36).slice(2, 10);

async function readIndex(): Promise<Clip[]> {
  try {
    const list = JSON.parse(await fsp.readFile(INDEX(), 'utf8'));
    return (Array.isArray(list) ? list : []).filter((c: any) => ID.test(c?.id) && FILE.test(c?.file) && (c.kind === 'image' || c.kind === 'text') && Number.isFinite(c.at));
  } catch {
    return [];
  }
}
async function writeIndex(list: Clip[]) {
  await replace(INDEX(), JSON.stringify(list, null, 1) + '\n');
}
let turns: Promise<unknown> = Promise.resolve();
function inTurn<T>(fn: () => Promise<T>) {
  const t = turns.then(fn);
  turns = t.catch(() => {});
  return t;
}
function freeName(dir: string, base: string, ext: string) {
  let name = base + ext;
  for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${ext}`;
  return name;
}
async function clipOf(id: unknown) {
  if (!ID.test(String(id || ''))) throw new HttpError(400, 'bad clip id');
  const c = (await readIndex()).find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'no such clip');
  return c;
}

const ROUTES: Routes = {
  'GET /api/clips/raw': async (_, q) => {
    const c = await clipOf(q!.get('id'));
    if (c.kind !== 'image') throw new HttpError(415, 'not a picture');
    return raw(await fsp.readFile(path.join(DIR!, c.file)), c.file, "default-src 'none'; img-src data:", { 'cache-control': 'max-age=31536000, immutable' });
  },
  'GET /api/clips': async () => {
    const list = await readIndex(), out: (Clip & { text?: string })[] = [];
    for (const c of list) {
      if (c.kind === 'image') out.push(c);
      else {
        try {
          out.push({ ...c, text: (await fsp.readFile(path.join(DIR!, c.file), 'utf8')).slice(0, PEEK) });
        } catch {}
      }
    }
    return { clips: out };
  },

  'POST /api/clips': ({ text, name, mimeType, data }) => inTurn(async () => {
    await fsp.mkdir(DIR!, { recursive: true });
    let file: string, kind: string;
    if (typeof text === 'string') {
      if (!text.trim()) throw new HttpError(400, 'an empty text');
      if (text.length > MAX_TEXT) throw new HttpError(413, 'a text longer than a million characters');
      kind = 'text';
      file = freeName(DIR!, 'text-' + stamp(), '.md');
      await fsp.writeFile(path.join(DIR!, file), text, { flag: 'wx' });
    } else {
      const ext = IMAGE_EXT[mimeType];
      if (!ext || typeof data !== 'string') throw new HttpError(400, 'clips keep pictures and text: png, jpeg, gif, webp');
      const buf = Buffer.from(data, 'base64');
      if (buf.length > MAX_IMAGE) throw new HttpError(413, 'a picture bigger than 14 MB');
      kind = 'image';
      const base = String(name || '').replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'paste-' + stamp();
      file = freeName(DIR!, base, ext);
      await fsp.writeFile(path.join(DIR!, file), buf, { flag: 'wx' });
    }
    const clip = { id: newId(), file, kind, at: Date.now() };
    await writeIndex([clip, ...(await readIndex())]);
    return { clip: kind === 'text' ? { ...clip, text: text.slice(0, PEEK) } : clip };
  }),

  'POST /api/clips/remove': ({ id }) => inTurn(async () => {
    const c = await clipOf(id), gone = path.join(DIR!, 'removed');
    await fsp.mkdir(gone, { recursive: true });
    const ext = path.extname(c.file);
    try {
      await fsp.rename(path.join(DIR!, c.file), path.join(gone, freeName(gone, path.basename(c.file, ext), ext)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await writeIndex((await readIndex()).filter((x) => x.id !== id));
    return { ok: true };
  }),

  'GET /api/clips/text': async (_, q) => {
    const c = await clipOf(q!.get('id'));
    if (c.kind !== 'text') throw new HttpError(415, 'not a text');
    return { text: await fsp.readFile(path.join(DIR!, c.file), 'utf8') };
  },
};


export { init, ROUTES };
