import fs from 'fs';
import path from 'path';
import { blobs, g, key, must, nameOfChat, ready, remember, REVIEW_MODES, serial, storeOf, unapply, write, z } from './checkpoints.ts';
import type { Entry, PointChat, RevFile, Store } from './checkpoints.ts';
import { lineCount } from '../../public/base/linediff.ts';
import { replaceSync } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';

interface Row {
  path: string;
  add: number;
  del: number;
  fresh?: boolean;
  gone?: boolean;
  bin?: boolean;
  none?: string;
  also?: string[];
  t: number;
}
interface Base {
  oid: string | null;
  mode: string;
}

const MAX = 4 * 1024 * 1024;
const binary = (b: Buffer | null) => !!b && b.subarray(0, 8000).includes(0);
const rel = (s: Store, abs: string) => path.relative(s.top, abs).replace(/\\/g, '/');
const outside = (r: string) => r.startsWith('..') || path.isAbsolute(r);

async function where(c: PointChat) {
  const cwd = c.review?.cwd || c.seg?.cwd || c.cwd;
  return storeOf(cwd);
}

function pending(c: PointChat, s: Store) {
  const files: Record<string, RevFile> = { ...(c.review?.files || {}) };
  const seg = c.seg;
  const live = new Set<string>();
  if (seg && REVIEW_MODES.has(seg.mode) && key(seg.cwd) === key(c.review?.cwd || seg.cwd))
    for (const abs of seg.edits) {
      const r = rel(s, abs);
      live.add(r);
      files[r] ||= { at: seg.b, t: Date.now() };
    }
  return { files, live };
}

async function baseOf(s: Store, r: string, e: RevFile): Promise<Base> {
  if (e.oid !== undefined) return { oid: e.oid, mode: '100644' };
  const line = z((await g(s, ['ls-tree', '-z', '--full-tree', e.at!, '--', r])).out)[0];
  if (!line) return { oid: null, mode: '100644' };
  const [mode, , oid] = line.slice(0, line.indexOf('\t')).split(' ');
  return { oid, mode };
}

async function whyNone(s: Store, r: string) {
  if (outside(r)) return 'outside the project';
  if (s.meta?.big.includes(r)) return 'over 50 MB';
  return (await g(s, ['check-ignore', '-q', '--no-index', '--', r])).code === 0 ? 'ignored by git' : null;
}

const disk = (s: Store, r: string) => {
  try {
    return fs.readFileSync(path.join(s.top, r));
  } catch {
    return null;
  }
};

function alsoOf(c: PointChat, r: string, since: number) {
  const ids = new Set<string>();
  for (const p of c.points || []) if (p.t1 >= since) for (const [id, theirs] of Object.entries(p.by || {})) if (theirs.includes(r)) ids.add(id);
  return [...ids].map((id) => nameOfChat(id) || 'another chat');
}

async function touched(c: PointChat) {
  if (!c.review && !c.seg) return null;
  const { s } = await where(c);
  const paths = Object.keys(pending(c, s).files).filter((r) => !outside(r));
  return paths.length ? paths.map((r) => path.join(s.top, r)) : null;
}

async function list(c: PointChat) {
  if (!c.review && !c.seg) return { top: null, files: [] as Row[], changed: (c.points || []).some((p) => p.edits?.length) };
  const { s } = await where(c);
  return serial(s, async () => {
    ready(s);
    const { files, live } = pending(c, s);
    const rows: Row[] = [];
    let dropped = false;
    for (const [r, e] of Object.entries(files)) {
      const now = disk(s, r);
      const base = await baseOf(s, r, e);
      if (!base.oid) {
        const why = now ? await whyNone(s, r) : null;
        if (why) {
          rows.push({ path: r, add: 0, del: 0, none: why, t: e.t });
          continue;
        }
      }
      const was = base.oid ? (await blobs(s, [base.oid])).get(base.oid)! : null;
      if ((!was && !now) || (was && now && was.equals(now))) {
        if (!live.has(r) && c.review?.files[r]) {
          delete c.review.files[r];
          dropped = true;
        }
        continue;
      }
      const also = alsoOf(c, r, e.t);
      const row: Row = { path: r, add: 0, del: 0, t: e.t, ...(!was ? { fresh: true } : {}), ...(!now ? { gone: true } : {}), ...(also.length ? { also } : {}) };
      if (binary(was) || binary(now)) row.bin = true;
      else [row.add, row.del] = lineCount(was?.toString('utf8') ?? null, now?.toString('utf8') ?? null);
      rows.push(row);
    }
    if (dropped) c.saved?.();
    rows.sort((a, b) => a.path.localeCompare(b.path));
    return { top: s.top, files: rows, changed: (c.points || []).some((p) => p.edits?.length) };
  });
}

async function file(c: PointChat, r: string) {
  const { s } = await where(c);
  return serial(s, async () => {
    const e = pending(c, s).files[r];
    if (!e) throw new HttpError(404, `${r} isn't in this chat's review any more`);
    const base = await baseOf(s, r, e);
    const was = base.oid ? (await blobs(s, [base.oid])).get(base.oid)! : null;
    const now = disk(s, r);
    if ((was?.length || 0) > MAX || (now?.length || 0) > MAX) throw new HttpError(413, `${r} is too big to show here`);
    if (binary(was) || binary(now)) throw new HttpError(415, `${r} isn't text`);
    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(s.top, r)).mtimeMs;
    } catch {}
    return { path: r, abs: path.join(s.top, r), base: was?.toString('utf8') ?? null, now: now?.toString('utf8') ?? null, mtime };
  });
}

async function pin(s: Store, c: PointChat) {
  const oids = Object.values(c.review?.files || {}).map((e) => e.oid).filter(Boolean) as string[];
  const ref = `refs/review/${c.id}`;
  if (!oids.length) return void (await g(s, ['update-ref', '-d', ref]));
  const tree = must(await g(s, ['mktree'], { input: oids.map((o, i) => `100644 blob ${o}\t${i}\n`).join('') }), 'review').trim();
  const commit = must(await g(s, ['commit-tree', tree, '-m', 'review']), 'review').trim();
  must(await g(s, ['update-ref', ref, commit]), 'review');
}

async function keep(c: PointChat, { paths, path: one, base }: { paths?: string[]; path?: string; base?: string | null }) {
  const { s } = await where(c);
  return serial(s, async () => {
    ready(s);
    const { files } = pending(c, s);
    c.review ||= { cwd: c.seg?.cwd || c.cwd, files: {} };
    const put = async (r: string, text: Buffer | null) => {
      const oid = text == null ? null : must(await g(s, ['hash-object', '-w', '--no-filters', '--stdin'], { input: text }), 'review').trim();
      c.review!.files[r] = { oid, t: files[r]?.t || Date.now() };
    };
    if (typeof one === 'string') {
      if (!files[one]) throw new HttpError(404, `${one} isn't in this chat's review any more`);
      await put(one, base == null ? null : Buffer.from(eol(base, disk(s, one)), 'utf8'));
    } else for (const r of paths || []) if (files[r]) await put(r, disk(s, r));
    await pin(s, c);
    c.saved?.();
    return { ok: true };
  });
}

const eol = (text: string, like: Buffer | null) => (like && like.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text);

async function save(c: PointChat, r: string, text: string, mtime: number) {
  const { s } = await where(c);
  return serial(s, async () => {
    if (!pending(c, s).files[r] || outside(r)) throw new HttpError(404, `${r} isn't in this chat's review any more`);
    const abs = path.join(s.top, r);
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(abs);
    } catch {}
    if (!st) throw new HttpError(404, `${r} is gone from the disk`);
    if (Number.isFinite(mtime) && Math.abs(st.mtimeMs - mtime) >= 2) throw new HttpError(409, `${r} changed on disk after Review read it, so nothing was rejected. Review now shows the file as it is.`);
    const now = disk(s, r);
    const bom = now && now[0] === 0xef && now[1] === 0xbb && now[2] === 0xbf ? '﻿' : '';
    replaceSync(abs, bom + eol(text.replace(/^﻿/, ''), now), { tmp: `${abs}.amethyst-${Date.now().toString(36)}` });
    return { ok: true, mtime: fs.statSync(abs).mtimeMs };
  });
}

const undone = new Map<string, { c: PointChat; files: Record<string, RevFile> }>();
async function reject(c: PointChat, paths: string[]) {
  const { s } = await where(c);
  return serial(s, async () => {
    ready(s);
    const { files } = pending(c, s);
    const entries: Entry[] = [];
    const there: string[] = [];
    for (const r of paths) {
      const e = files[r];
      if (!e || outside(r)) continue;
      const base = await baseOf(s, r, e);
      if (!base.oid && disk(s, r) && (await whyNone(s, r))) continue;
      if (fs.existsSync(path.join(s.top, r))) there.push(r);
      entries.push({ path: r, from: null, to: base.oid ? { mode: base.mode, oid: base.oid } : null });
    }
    if (there.length) {
      const oids = must(await g(s, ['hash-object', '-w', '--no-filters', '--stdin-paths'], { input: there.join('\n') + '\n' }), 'review').trim().split(/\r?\n/);
      there.forEach((r, i) => (entries.find((e) => e.path === r)!.from = { mode: '100644', oid: oids[i] }));
    }
    const go = entries.filter((e) => e.from?.oid !== e.to?.oid);
    const r = await write(s, go);
    const undo = remember(s, go, r.done);
    const kept: Record<string, RevFile> = {};
    for (const p of r.done) {
      if (c.review?.files[p]) kept[p] = c.review.files[p];
      if (c.review) delete c.review.files[p];
    }
    undone.set(undo, { c, files: kept });
    if (undone.size > 20) undone.delete(undone.keys().next().value!);
    await pin(s, c);
    c.saved?.();
    return { ...r, undo };
  });
}

async function unreject(token: string) {
  const r = await unapply(token);
  const u = undone.get(token);
  if (u) {
    u.c.review ||= { cwd: u.c.cwd, files: {} };
    Object.assign(u.c.review.files, u.files);
    undone.delete(token);
    u.c.saved?.();
  }
  return r;
}

async function turns(c: PointChat) {
  const ps = c.points || [];
  if (!ps.length) return { turns: [] };
  const { s } = await storeOf(ps.at(-1)!.cwd);
  return serial(s, async () => {
    const out = [];
    for (let i = ps.length - 1; i >= 0 && out.length < 60; i--) {
      const p = ps[i];
      const r = await g(s, ['diff-tree', '-r', '-z', '--numstat', '--no-renames', p.b, p.a]);      if (r.code) continue;
      const parts = z(r.out), files = [];
      for (const x of parts) {
        const [a, d, f] = x.split('\t');
        if (!f || p.late.includes(f)) continue;
        files.push({ path: f, add: a === '-' ? 0 : +a, del: d === '-' ? 0 : +d, ...(a === '-' ? { bin: true } : {}) });
      }
      if (files.length) out.push({ n: i + 1, key: p.key, mode: p.mode ?? null, words: p.words ?? null, t0: p.t0, t1: p.t1, files });
    }
    return { turns: out };
  });
}

async function turnFile(c: PointChat, n: number, r: string) {
  const p = (c.points || [])[n - 1];
  if (!p) throw new HttpError(404, 'That turn is gone');
  const { s } = await storeOf(p.cwd);
  return serial(s, async () => {
    const at = async (commit: string) => {
      const line = z((await g(s, ['ls-tree', '-z', '--full-tree', commit, '--', r])).out)[0];
      if (!line) return null;
      const oid = line.slice(0, line.indexOf('\t')).split(' ')[2];
      const b = (await blobs(s, [oid])).get(oid)!;
      if (b.length > MAX) throw new HttpError(413, `${r} is too big to show here`);
      if (binary(b)) throw new HttpError(415, `${r} isn't text`);
      return b.toString('utf8');
    };
    return { path: r, before: await at(p.b), after: await at(p.a) };
  });
}

export { list, touched, file, keep, reject, unreject, save, turns, turnFile };
