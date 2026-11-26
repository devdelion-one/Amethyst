import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { HttpError } from '../base/routes.ts';
import { git, must, placeOf } from '../base/gitcli.ts';
import { lineDiff } from '../../public/base/linediff.ts';

type Run = { a: number; b: number; c: number; d: number };
type Seg = { a: number; b: number; w: Run[]; i: Run[]; wFrom: number; wTo: number; iFrom: number; iTo: number; state: true | false | 'part' | null };
type Texts = { top: string; prefix: string; mode: string; h: string[]; i: string[]; w: string[] };

const MAX = 2e6;
const split = (t: string) => (t ? t.split('\n') : []);
const strip = (l: string) => (l.endsWith('\r') ? l.slice(0, -1) : l);
const flat = (x: string[]) => x.map(strip).join('\n');
const same = (x: string[], y: string[]) => x.length === y.length && x.every((l, k) => strip(l) === strip(y[k]));
const delta = (rs: Run[]) => rs.reduce((n, r) => n + (r.d - r.c) - (r.b - r.a), 0);

function runsOf(x: string[], y: string[]): Run[] {
  const out: Run[] = [];
  let i = 0, j = 0, cur: Run | null = null;
  for (const [k] of lineDiff(flat(x), flat(y))) {
    if (k === 'same') {
      if (cur) out.push(cur), (cur = null);
      i++, j++;
      continue;
    }
    cur ||= { a: i, b: i, c: j, d: j };
    if (k === 'del') cur.b = ++i;
    else cur.d = ++j;
  }
  if (cur) out.push(cur);
  return out;
}

function segsOf(t: Texts): Seg[] {
  const hw = runsOf(t.h, t.w), hi = runsOf(t.h, t.i);
  const all = [...hw.map((r) => ({ r, w: true })), ...hi.map((r) => ({ r, w: false }))].sort((p, q) => p.r.a - q.r.a || p.r.b - q.r.b);
  const segs: Seg[] = [];
  for (const { r, w } of all) {
    const last = segs.at(-1);
    if (last && r.a <= last.b) {
      last.b = Math.max(last.b, r.b);
      (w ? last.w : last.i).push(r);
    } else segs.push({ a: r.a, b: r.b, w: w ? [r] : [], i: w ? [] : [r], wFrom: 0, wTo: 0, iFrom: 0, iTo: 0, state: null });
  }
  for (const s of segs) {
    s.wFrom = s.a + delta(hw.filter((r) => r.b < s.a));
    s.iFrom = s.a + delta(hi.filter((r) => r.b < s.a));
    s.wTo = s.wFrom + (s.b - s.a) + delta(s.w);
    s.iTo = s.iFrom + (s.b - s.a) + delta(s.i);
    if (!s.w.length) continue;
    const i = t.i.slice(s.iFrom, s.iTo);
    s.state = same(i, t.w.slice(s.wFrom, s.wTo)) ? true : same(i, t.h.slice(s.a, s.b)) ? false : 'part';
  }
  return segs;
}

const no = (line: string): never => {
  throw new HttpError(409, line);
};
const odd = (...t: string[]) => t.some((x) => x.includes('\0') || x.includes('�'));

async function textsOf(cwd: string, rel: string): Promise<Texts> {
  const place = await placeOf(cwd);
  if (!place) no('This project is not in git yet.');
  const idx = (await git(cwd, ['ls-files', '-s', '--', ':(literal)' + rel])).out.split(/\r?\n/).filter(Boolean);
  if (idx.length !== 1 || !/^\d{6} [0-9a-f]+ 0\t/.test(idx[0])) no(`${rel} is not a plain tracked file here: stage it whole.`);
  const attrs = (await git(cwd, ['check-attr', 'filter', 'ident', '--', rel])).out;
  if (/: (filter|ident): (?!unspecified|unset)/.test(attrs)) no(`${rel} goes through a git filter: stage it whole.`);
  const abs = path.join(cwd, rel);
  let w = '';
  try {
    if (fs.statSync(abs).size > MAX) no(`${rel} is too big to take in parts.`);
    w = fs.readFileSync(abs, 'utf8');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    no(`${rel} is not on the disk.`);
  }
  const [h, i] = await Promise.all([`HEAD:./${rel}`, `:./${rel}`].map((x) => git(cwd, ['cat-file', 'blob', x], { timeout: 30e3 })));
  if (h.code) no(`${rel} is new: stage it whole.`);
  must(i);
  if (odd(h.out, i.out, w) || h.out.length > MAX) no(`${rel} isn't plain text: stage it whole.`);
  return { top: place!.top, prefix: place!.prefix, mode: idx[0].slice(0, 6), h: split(h.out), i: split(i.out), w: split(w) };
}

const sigOf = (t: Texts) => crypto.createHash('sha1').update(flat(t.h) + '\0' + flat(t.w)).digest('hex').slice(0, 16);

function viewOf(rel: string, t: Texts) {
  const segs = segsOf(t), shown = segs.filter((s) => s.w.length);
  const runs = shown.flatMap((s, k) => s.w.map(() => k));
  return { path: rel, oldText: flat(t.h), newText: flat(t.w), parts: shown.map((s) => s.state), runs, sig: sigOf(t) };
}

async function partsOf(cwd: string, rel: string) {
  return viewOf(rel, await textsOf(cwd, rel));
}

function indexWith(t: Texts, segs: Seg[], pick: (s: Seg) => 'on' | 'off' | 'keep', clean: string[]) {
  const out: string[] = [];
  let at = 0;
  for (const s of segs) {
    out.push(...t.i.slice(at, s.iFrom));
    const how = s.w.length ? pick(s) : 'keep';
    out.push(...(how === 'on' ? clean.slice(s.wFrom, s.wTo) : how === 'off' ? t.h.slice(s.a, s.b) : t.i.slice(s.iFrom, s.iTo)));
    at = s.iTo;
  }
  out.push(...t.i.slice(at));
  return out.join('\n');
}

async function writeIndex(cwd: string, rel: string, t: Texts, text: string) {
  const sha = must(await git(cwd, ['hash-object', '-w', '--no-filters', '--stdin'], { input: text })).trim();
  must(await git(t.top, ['update-index', '--cacheinfo', `${t.mode},${sha},${t.prefix}${rel}`]));
}

async function cleanOf(cwd: string, rel: string, t: Texts) {
  const sha = must(await git(cwd, ['hash-object', '-w', '--', rel])).trim();
  const out = split(must(await git(cwd, ['cat-file', 'blob', sha], { timeout: 30e3 })));
  if (out.length !== t.w.length) no(`git changes ${rel} on the way in: stage it whole.`);
  return out;
}

async function fresh(cwd: string, rel: string, sig: unknown, k: unknown) {
  const t = await textsOf(cwd, rel), segs = segsOf(t), shown = segs.filter((s) => s.w.length);
  if (sig !== sigOf(t)) return { t, stale: { ...viewOf(rel, t), stale: true, line: `${rel} changed since: this is how it is now` } };
  const n = Number(k);
  if (!Number.isInteger(n) || n < 0 || n >= shown.length) no('That part is not in the file any more.');
  return { t, segs, part: shown[n] };
}

async function stagePart(cwd: string, rel: string, k: unknown, on: boolean, sig: unknown) {
  const r = await fresh(cwd, rel, sig, k);
  if (r.stale) return r.stale;
  const { t, segs, part } = r as { t: Texts; segs: Seg[]; part: Seg };
  const clean = on ? await cleanOf(cwd, rel, t) : t.w;
  await writeIndex(cwd, rel, t, indexWith(t, segs, (s) => (s === part ? (on ? 'on' : 'off') : 'keep'), clean));
  const view = await partsOf(cwd, rel);
  return { ...view, line: on ? 'that part is staged' : 'that part is out of the stage' };
}

async function dropPart(cwd: string, rel: string, k: unknown, sig: unknown) {
  const r = await fresh(cwd, rel, sig, k);
  if (r.stale) return { view: r.stale, done: false };
  const { t, segs, part } = r as { t: Texts; segs: Seg[]; part: Seg };
  const w = [...t.w.slice(0, part.wFrom), ...t.h.slice(part.a, part.b), ...t.w.slice(part.wTo)];
  if (t.w.some((l) => l.endsWith('\r')) && !t.h.some((l) => l.endsWith('\r')))
    for (let x = part.wFrom; x < part.wFrom + (part.b - part.a); x++) if (x < w.length - 1 && !w[x].endsWith('\r')) w[x] += '\r';
  if (part.state !== false) await writeIndex(cwd, rel, t, indexWith(t, segs, (s) => (s === part ? 'off' : 'keep'), t.w));
  fs.writeFileSync(path.join(cwd, rel), w.join('\n'));
  return { view: await partsOf(cwd, rel), done: true };
}

export { partsOf, stagePart, dropPart };
