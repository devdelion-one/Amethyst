import { tipTo } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { onSize } from '../base/measure.ts';
import type { Sizes } from '../base/measure.ts';
import { diffCount, diffText, pathChip, relOf } from '../base/chattext.ts';
import type { ChatCtx } from '../base/chattext.ts';
import { esc, OUT_MAX } from '../base/util.ts';
import { tell } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { every } from '../base/life.ts';
import { runTime } from '../base/words.ts';

export type Line = HTMLDivElement & { raw?: string; before?: any; qid?: any; diffs?: any[]; askId?: any; what?: string; toolId?: any; fields?: any; t0?: number; raf?: number; imgs?: number; st?: { line: number; seen: Map<string, number>; n: number }; paths?: Map<string, { full: string; dir: boolean | null; at: number } | null | undefined>; from?: string | null; unfolded?: Set<number>; shape?: string; fills?: Fill[]; body?: HTMLElement; res?: HTMLElement; status?: string | null; summary?: string; error?: string; at?: number; waits?: boolean; show?: () => void };
export type Step = { data: any; row: Line; t0: number; t1?: number; t2?: number; out?: string; bg?: boolean; live?: string; ended?: boolean; exit?: number | null; running?: boolean; words?: string[] };
export type Part = { type: string; path: string; oldText?: string | null; newText?: string | null; content?: { type: string; text: string } };

const VERB: Record<string, string> = { read: 'Read', edit: 'Edit', delete: 'Delete', move: 'Move', search: 'Search', execute: 'Bash', think: 'Think', fetch: 'Fetch', switch_mode: 'Mode', other: 'Tool' };
const CHANGES = new Set(['edit', 'delete', 'move', 'execute']);
export const ioBox = (k: string, html: string, cls = 'ch-out') => `<div class="ch-io"><button type="button" class="io-k">${k}</button><pre class="${cls}">${html}</pre><button type="button" class="ch-mini" data-copy-io>copy</button></div>`;
export const newFits = () => onSize(null, {
  name: 'chat.fits',
  read: (seen) => seen.map(({ target: p }) => p).filter((p) => p.isConnected && !p.parentElement!.classList.contains('open')).map((p) => [p, p.scrollHeight > p.clientHeight + 1] as const),
  write: (got: (readonly [Element, boolean])[]) => got.forEach(([p, long]) => p.parentElement!.classList.toggle('long', long)),
});
export function setFold(box: Element, open: boolean) {
  box.classList.add('long');
  box.classList.toggle('open', open);
}
export const liveCmds = () => pref('liveCmds');
export const cmdsWin = () => pref('subagents:chat');
export type Fill = { text?: string; html?: string; term?: boolean };
const HOLE = '\u0001';
const holes = () => {
  const fills: Fill[] = [];
  return { fills, put: (f: Fill) => (fills.push(f), HOLE) };
};
const filled = (shape: string, fills: Fill[]) => {
  let i = 0;
  return shape.replace(/\u0001/g, () => {
    const f = fills[i++];
    return f.html ?? esc(f.text);
  });
};
function execIO(cmd: string, out: string | null | undefined, run: boolean | undefined, put: (f: Fill) => string, live = liveCmds()) {
  out = (out || '').replace(/\n+$/, '').slice(-OUT_MAX);
  const inBox = ioBox('IN', put({ text: cmd }));
  if (!live) return inBox + (out ? ioBox('OUT', put({ text: out })) : '');
  const cur = run ? '<i class="io-cur"></i>' : '';
  const body = out ? `<span class="io-txt">${put({ text: out, term: true })}${cur}</span>` : run ? put({ html: `<span class="io-txt"><span class="io-wait">no output yet</span>${cur}</span>` }) : '';
  return inBox + (body ? ioBox('OUT', body, `ch-out term${run ? ' run' : ''}`) : '');
}
export function cmdPic(cmd: string, why: string, out: string, run: boolean) {
  const { fills, put } = holes();
  const shape = `<details open><summary class="row"><span class="v">${VERB.execute}</span><span class="o"><span>${esc(why)}</span></span><span class="m"></span></summary><div class="more">${execIO(cmd, out, run, put, true)}</div></details>`;
  return `<div class="ch-tool st s-${run ? 'run' : 'done'} k-execute">${filled(shape, fills)}</div>`;
}
const BG = /^Command running in background with ID:/;
function cmdOut(t: Step, u: any) {
  const m = u._meta || {};
  if (m.terminal_output) Object.assign(t, { out: m.terminal_output.data, bg: BG.test(m.terminal_output.data) });
  if (m.liveOutput) {
    t.live = m.liveOutput.data;
    if (m.liveOutput.bg) t.bg = true;
  }
  if (m.terminal_exit) Object.assign(t, { ended: true, exit: m.terminal_exit.exit_code ?? t.exit ?? null });
  if (m.liveOutput?.done) Object.assign(t, { ended: true, exit: m.liveOutput.exit ?? t.exit ?? null });
  if (t.ended) t.t2 ||= Date.now();
}
const textOut = (content: Part[] | undefined) => (content || [])
  .filter((c) => c.type === 'content' && c.content?.type === 'text')
  .map((c) => c.content!.text.replace(/^```\w*\n([\s\S]*?)\n?```\s*$/, '$1'))
  .join('\n');
function shownOut(t: Step, content: Part[] | undefined) {
  const live = liveCmds() ? t.live : null;
  const out = (t.out != null && !t.bg ? t.out : null) ?? live ?? t.out ?? textOut(content);
  return t.exit ? out.replace(new RegExp(`^Exit code ${t.exit}\\n`), '') : out;
}
function cmdSlot(t: Step, st: string) {
  if (t.running) return (t.bg ? 'bg · ' : '') + runTime(Math.max(0, Math.round((Date.now() - t.t0) / 1000)));
  if (t.exit) return 'exit ' + t.exit;
  if (st === 'failed') return 'failed';
  if (t.bg) return t.exit === 0 ? runTime(Math.round(((t.t2 || t.t1)! - t.t0) / 1000)) : 'ended';
  const n = t.t1 ? Math.round((t.t1 - t.t0) / 1000) : 0;
  return n >= 1 ? runTime(n) : '';
}
const SLOT_TIP = { run: 'Running\nHow long the command has run so far.', bg: 'In the background\nThe command runs on its own: the turn can end before it does.', exit: 'Exit code\nThe command ended with this code, so it failed. One that succeeds shows its time instead.', ended: 'Ended\nThe command ran in the background and ended. The agent gave no exit code.' };
const slotTip = (t: Step) => (t.running ? (t.bg ? SLOT_TIP.bg : SLOT_TIP.run) : t.exit ? SLOT_TIP.exit : t.bg && t.exit !== 0 ? SLOT_TIP.ended : '');
export const runTell = (box: Element) => tell(box, { title: "This shows the agent's command; it takes no typing", line: 'Stop (■) stops the whole turn; to answer a command, tell the agent in the message box', ms: 3000 });
document.addEventListener('keydown', (e) => {
  if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || document.activeElement !== document.body) return;
  const box = document.querySelector('pre.term.run:hover')?.parentElement;
  if (box) runTell(box);
});
const ticking = new Set<Step>();
let tickT: (() => void) | null = null;
export function tickRun(t: Step) {
  if (t.running) ticking.add(t);
  else ticking.delete(t);
  if (ticking.size && !tickT) tickT = every(1000, () => {
    for (const x of ticking) {
      const m = x.row.isConnected && x.row.querySelector(':scope > details > summary > .m');
      if (m) m.textContent = cmdSlot(x, x.data.status);
      if (!m || !x.running) ticking.delete(x);
    }
    if (!ticking.size) (tickT!(), (tickT = null));
  });
}
export function stopRuns(ts: Iterable<Step>) {
  for (const t of ts) if (t.running) Object.assign(t, { ended: true, running: false });
}
export const diffBtn = (row: { diffs?: any[] }, c: unknown) => `<button type="button" class="ch-mini" data-diff="${row.diffs!.indexOf(c)}" title="Open diff\nThe old and new file side by side, in a tab.">open diff</button>`;
const stepWhat = (d: any) => {
  const verb = VERB[d.kind] || VERB.other, cmd = d.kind === 'execute' ? d.rawInput?.command || d.title : '';
  return { verb, cmd, why: cmd && d.rawInput?.description, named: String(d.title || d.name || '').replace(new RegExp(`^${verb}\\s+`, 'i'), '') };
};
export function foldStep(t: Step, u: any, here: ChatCtx): boolean {
  const was = t.data.status;
  cmdOut(t, u);
  for (const [k, v] of Object.entries(u)) if (v != null) t.data[k] = v;
  const d = t.data, st = d.status || 'pending';
  const fin = st === 'completed' || st === 'failed';
  if (fin) t.t1 ||= Date.now();
  t.row.diffs = (d.content || []).filter((c: Part) => c.type === 'diff');
  const { verb, cmd, why, named } = stepWhat(d);
  t.running = !!cmd && !t.ended && (!fin || (t.bg && st !== 'failed'));
  const file = d.locations?.[0] || t.row.diffs![0];
  t.words = [verb, file ? relOf(file.path, here) : why || cmd || named];
  return st === 'completed' && was !== 'completed' && CHANGES.has(d.kind);
}
export function drawStep(t: Step, u: any, { here, fits, changed = () => {}, pop = false }: { here: ChatCtx; fits: Sizes; changed?: () => void; pop?: boolean }) {
  const done = foldStep(t, u, here);
  paintStep(t, { here, fits, pop });
  if (done) changed();
}
export function paintStep(t: Step, { here, fits, pop = false }: { here: ChatCtx; fits: Sizes; pop?: boolean }) {
  const d = t.data, st = d.status || 'pending';
  const { verb, cmd, why, named } = stepWhat(d);
  const { fills, put } = holes();
  const detail = cmd ? execIO(cmd, shownOut(t, d.content), t.running, put) : (d.content || [])
    .map((c: Part) => {
      if (c.type === 'diff') return `<div class="ch-fileline"><span class="ch-file lk-chip lk lk-file" data-chopen="${esc(c.path)}">${icon('file')}${esc(c.path)}</span>${t.row.diffs!.length > 1 ? diffBtn(t.row, c) : ''}</div>${ioBox('DIFF', put({ html: diffText(c.oldText, c.newText) }), 'ch-diff')}`;
      if (c.type === 'content' && c.content?.type === 'text') return ioBox('OUT', put({ text: c.content!.text.slice(0, OUT_MAX) }));
      return '';
    })
    .join('');
  const raw = !detail && d.rawInput ? ioBox('IN', put({ text: JSON.stringify(d.rawInput, null, 2).slice(0, 4000) })) : '';
  const file = d.locations?.[0] || t.row.diffs![0];
  const what = file
    ? pathChip(file.path, here, { full: file.path + (file.line ? `:${file.line}` : ''), at: file.line ? `:${file.line}` : '', label: relOf(file.path, here) })
    : why
      ? `<span>${esc(why)}</span>`
      : `<span class="${cmd ? 'cmd' : ''}">${esc(cmd || named)}</span>`;
  const sec = t.t1 ? Math.round((t.t1 - t.t0) / 1000) : 0;
  const [add, del] = t.row.diffs!.reduce((n, c) => diffCount(c).map((x, i) => n[i] + x), [0, 0]);
  const live = cmd && liveCmds();
  const slot = live ? cmdSlot(t, st) : st === 'failed' ? 'failed' : st === 'in_progress' ? '…' : t.row.diffs!.length && st === 'completed' ? [add && `<span class="add">+${add}</span>`, del && `<span class="del">−${del}</span>`].filter(Boolean).join(' ') : sec >= 1 ? sec + 's' : '';
  const s = live && t.running ? 'run' : st === 'failed' || (live && t.exit) ? 'fail' : st === 'completed' ? 'done' : 'run';
  const cls = `ch-tool st s-${s} k-${d.kind || 'other'}`;
  if (t.row.className !== cls) t.row.className = cls;
  const popBtn = pop && cmd && cmdsWin() ? `<button type="button" class="ch-pop" data-cmd-pop="${esc(d.toolCallId || '')}" title="Open in Agent activity\nShows this command's whole output in the chat's Agent activity. It stays there after the command ends.">${icon('subWin')}</button>` : '';
  const shape = `<details><summary class="row"><span class="v">${verb}</span><span class="o">${what}</span>${t.row.diffs!.length === 1 ? diffBtn(t.row, t.row.diffs![0]) : ''}${popBtn}<span class="m"></span></summary>${detail || raw ? `<div class="more">${detail}${raw}</div>` : ''}</details>`;
  if (shape !== t.row.shape || !patchStep(t.row, fills, fits)) buildStep(t.row, shape, fills, fits, d.kind === 'execute');
  t.row.fills = fills;
  const m = t.row.querySelector<HTMLElement>(':scope > details > summary > .m')!, tip = live ? slotTip(t) : '';
  if (m.innerHTML !== slot) m.innerHTML = slot;
  tipTo(m, tip);
  if (live) tickRun(t);
}
function buildStep(row: Line, shape: string, fills: Fill[], fits: Sizes, openFirst: boolean) {
  const open = row.querySelector('details')?.open ?? openFirst;
  row.querySelectorAll('.ch-io pre').forEach((p) => fits.unobserve(p));
  row.innerHTML = filled(shape, fills);
  row.shape = shape;
  row.querySelector('details')!.open = open;
  row.unfolded ||= new Set();
  row.querySelectorAll('.ch-io').forEach((box, i) => {
    if (row.unfolded!.has(i)) setFold(box, true);
    fits.observe(box.querySelector('pre')!);
  });
}
function patchStep(row: Line, fills: Fill[], fits: Sizes) {
  const was = row.fills || [], pres = row.querySelectorAll<HTMLElement>('.ch-io pre');
  if (pres.length !== fills.length) return false;
  const grew: HTMLElement[] = [];
  for (let i = 0; i < fills.length; i++) {
    const f = fills[i], p = was[i], pre = pres[i];
    if (f.html != null) {
      if (f.html === p?.html) continue;
      pre.innerHTML = f.html;
    } else if (f.text === p?.text) continue;
    else if (f.term) {
      const node = pre.querySelector('.io-txt')?.firstChild;
      if (!(node instanceof Text) || p?.text == null) return false;
      if (f.text!.startsWith(p.text)) node.appendData(f.text!.slice(p.text.length));
      else node.data = f.text!;
    } else pre.textContent = f.text!;
    grew.push(pre);
  }
  for (const pre of grew) if (!pre.parentElement!.classList.contains('long')) fits.observe(pre);
  return true;
}
