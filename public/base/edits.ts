import { api } from './model.ts';
import { lineDiff } from './linediff.ts';
import { ask } from './controls.ts';
import { notify, tell } from './notify.ts';
import { esc, showErr } from './util.ts';
import { on, send } from './windows.ts';
import { plural } from './words.ts';

export type EditRow = { path: string; add: number; del: number; fresh?: boolean; gone?: boolean; bin?: boolean; none?: string; also?: string[]; t: number };
type EditList = { top: string | null; files: EditRow[]; changed: boolean };
type EditFile = { path: string; abs: string; base: string | null; now: string | null; mtime: number };
export type Turn = { n: number; key: string; mode: string | null; words: string | null; t0: number; t1: number; files: { path: string; add: number; del: number; bin?: boolean }[] };
type Undone = { done: string[]; skipped: string[]; undo: string };

const lists = new Map<string, EditList>();
const listeners = new Set<(chat: string) => void>();
const timers = new Map<string, number>();
const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export const editsOf = (chat: string): EditList | null => lists.get(chat) || null;
export function onEdits(fn: (chat: string) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const tellAll = (chat: string) => listeners.forEach((fn) => fn(chat));
const shout = (chat: string) => send('edits', { chat });
on('edits', (m) => typeof m.chat === 'string' && lists.has(m.chat) && editsSoon(m.chat, 60));

export async function loadEdits(chat: string) {
  try {
    const r = (await api('GET', `/api/agent/edits?id=${encodeURIComponent(chat)}`)) as EditList;
    lists.set(chat, r);
  } catch {
    lists.delete(chat);
  }
  tellAll(chat);
  return lists.get(chat) || null;
}
export function editsSoon(chat: string, ms = 250) {
  clearTimeout(timers.get(chat));
  timers.set(chat, setTimeout(() => (timers.delete(chat), loadEdits(chat)), ms) as unknown as number);
}

export function firstChange(base: string | null, now: string | null) {
  let n = 0;
  for (const [k] of lineDiff(base, now)) {
    if (k !== 'del') n++;
    if (k !== 'same') return Math.max(1, k === 'del' ? n + 1 : n);
  }
  return 1;
}
export const absOf = (l: EditList, rel: string) => (l.top ? l.top.replace(/[\\/]+$/, '') + '/' + rel : rel);
export function reviewOf(abs: string) {
  const want = norm(abs), hits: { chat: string; row: EditRow }[] = [];
  for (const [chat, l] of lists)
    for (const row of l.files) if (!row.none && !row.bin && l.top && norm(absOf(l, row.path)) === want) hits.push({ chat, row });
  hits.sort((a, b) => a.row.t - b.row.t);
  return hits;
}

export const editFile = (chat: string, path: string) => api('GET', `/api/agent/edits/file?id=${encodeURIComponent(chat)}&path=${encodeURIComponent(path)}`) as Promise<EditFile>;
export const editTurns = (chat: string) => api('GET', `/api/agent/edits/turns?id=${encodeURIComponent(chat)}`).then((r: any) => r.turns as Turn[]);
export const turnFile = (chat: string, n: number, path: string) => api('GET', `/api/agent/edits/turn?id=${encodeURIComponent(chat)}&n=${n}&path=${encodeURIComponent(path)}`) as Promise<{ path: string; before: string | null; after: string | null }>;

async function keepFiles(chat: string, paths: string[]) {
  await api('POST', '/api/agent/edits/keep', { id: chat, paths });
  shout(chat);
  return loadEdits(chat);
}
export async function keepBase(chat: string, path: string, base: string | null) {
  await api('POST', '/api/agent/edits/keep', { id: chat, path, base });
  shout(chat);
  editsSoon(chat, 60);
}
async function rejectFiles(chat: string, paths: string[]) {
  const l = lists.get(chat);
  const rows = (l?.files || []).filter((f) => paths.includes(f.path));
  const r = (await api('POST', '/api/agent/edits/reject', { id: chat, paths })) as Undone;
  for (const f of rows) if (r.done.includes(f.path)) noteReject(chat, f.path, f.fresh ? 'deleted again: you made it, the user took it out' : 'the whole file is back to how it was before your changes', f.add + f.del ? 1 : 0, true);
  shout(chat);
  await loadEdits(chat);
  return r;
}
export async function unreject(chat: string, undo: string, paths: string[]) {
  await api('POST', '/api/agent/edits/undo', { undo });
  for (const p of paths) unnote(chat, p);
  shout(chat);
  return loadEdits(chat);
}
export async function writeEdit(chat: string, path: string, text: string, mtime: number) {
  const r = (await api('POST', '/api/agent/edits/write', { id: chat, path, text, mtime })) as { mtime: number };
  shout(chat);
  editsSoon(chat, 60);
  return r;
}

type Note = { n: number; parts: string[] };
const notes = new Map<string, Map<string, Note>>();
const noteFns = new Set<(chat: string) => void>();
export function onNote(fn: (chat: string) => void) {
  noteFns.add(fn);
  return () => noteFns.delete(fn);
}
export function noteReject(chat: string, path: string, what: string, n = 1, whole = false) {
  const m = notes.get(chat) || new Map<string, Note>();
  notes.set(chat, m);
  const was = whole ? null : m.get(path);
  m.set(path, { n: (was?.n || 0) + Math.max(1, n), parts: [...(was?.parts || []), what] });
  noteFns.forEach((fn) => fn(chat));
}
function unnote(chat: string, path: string) {
  if (notes.get(chat)?.delete(path)) noteFns.forEach((fn) => fn(chat));
}
export const clearNote = (chat: string) => notes.delete(chat);
export function noteOf(chat: string): { from: string; text: string } | null {
  const m = notes.get(chat);
  if (!m?.size) return null;
  const n = [...m.values()].reduce((s, x) => s + x.n, 0);
  const name = (p: string) => p.split('/').pop();
  const from = m.size === 1 ? `↺ rejected ${n} change${n > 1 ? 's' : ''} · ${name([...m.keys()][0])}` : `↺ rejected ${n} changes in ${m.size} files`;
  const text = 'Since your last turn I rejected some of your changes; these files are back to how they were:\n' + [...m].map(([p, x]) => `\n${p}:\n${x.parts.join('\n')}`).join('\n');
  return { from, text };
}

export const counts = (a: number, d: number) => `<span class="add">+${a}</span><span class="del">−${d}</span>`;
export const TIPS = {
  keepAll: 'Keep all\nLeaves every file as it is on disk and clears the marks.',
  rejectAll: 'Reject all\nWrites every file back to how it was before this chat changed it. It asks first.',
  keep: 'Keep\nLeaves this file as it is on disk and takes it off the list.',
  reject: 'Reject\nWrites this file back to how it was before this chat changed it.',
  rejectNew: 'Reject\nDeletes this file; this chat created it.',
  review: 'Review\nEvery file this chat changed, with the changes marked, in a window of its own.',
};
export const rowTip = (f: EditRow) => (f.fresh ? TIPS.rejectNew : TIPS.reject);
export function rowLabel(f: EditRow) {
  if (f.none) return `<span class="ed-why" title="No copy from before&#10;Restore points keep no copy of this file, because it is ${esc(f.none)}.">no copy from before</span>`;
  return `${f.fresh ? '<span class="ed-tag">new</span>' : ''}${f.gone ? '<span class="ed-tag">deleted</span>' : ''}${f.also?.length ? `<span class="ed-tag also" title="${esc(`Changed by another chat too\n${f.also.join(', ')} changed this file too. The marks start from the oldest copy, so they can show those changes as well.`)}">also ${esc(f.also[0])}</span>` : ''}${f.bin ? '<span class="ed-tag">binary</span>' : ''}`;
}

export async function rejectAll(chat: string, files: EditRow[], over: HTMLElement) {
  const can = files.filter((f) => !f.none);
  if (!can.length) return;
  const made = can.filter((f) => f.fresh).map((f) => f.path.split('/').pop());
  const n = plural(can.length, 'file');
  const ok = await ask({ title: `Reject ${n}?`, text: `Each file goes back to how it was before this chat changed it${made.length ? `, and ${made.join(', ')}, which this chat created, ${made.length > 1 ? 'are' : 'is'} deleted` : ''}. The notice afterwards can undo it.`, confirm: true });
  if (!ok) return;
  await rejectSome(chat, can.map((f) => f.path), over);
}
export async function rejectSome(chat: string, paths: string[], over: HTMLElement) {
  try {
    const r = await rejectFiles(chat, paths);
    if (r.skipped.length) tell(over, { title: `${plural(r.skipped.length, 'file')} left as ${r.skipped.length > 1 ? 'they are' : 'it is'}`, line: 'a link or a submodule: Amethyst doesn’t write through those', ms: 3000 });
    if (!r.done.length) return;
    const n = notify(`rejected ${r.done.length > 1 ? plural(r.done.length, 'file') : esc(r.done[0].split('/').pop())} <button class="nact" data-undo>undo</button>`, { ms: 10000 });
    n.querySelector('[data-undo]')!.addEventListener('click', async () => {
      n.close?.();
      try {
        await unreject(chat, r.undo, r.done);
      } catch (e) {
        showErr(e);
      }
    });
  } catch (e: any) {
    if (e.status === 409) tell(over, { title: 'Nothing was rejected', line: e.message, ms: 4000 });
    else showErr(e);
  }
}
export async function keepSome(chat: string, paths: string[], over: HTMLElement) {
  try {
    await keepFiles(chat, paths);
  } catch (e: any) {
    if (e.status === 409) tell(over, { title: 'Nothing was kept', line: e.message, ms: 4000 });
    else showErr(e);
  }
}

