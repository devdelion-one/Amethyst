import { filesChanged } from '../app/actions.ts';
import { ask, bands, ICONS, menuHead, popMenu } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { icon } from '../base/icon.ts';
import * as groups from '../app/groups.ts';
import * as tabs from '../app/tabs.ts';
import { esc } from '../base/util.ts';
import { copy } from '../base/chips.ts';
import { isOff } from '../base/prefs.ts';
import { crystalOf } from '../base/codes.ts';
import { onSize } from '../base/measure.ts';
import { plural } from '../base/words.ts';
import { G, gitRow, panel, files, rows, total, sizeOf, chats, chatCode, okWhileWorking, unfold, stagedMode, fullyStaged, stage, gapi, doing, post, say, pickRepo, refreshGit } from './gitstate.ts';
import type { GitFile } from './gitstate.ts';
import { api } from '../base/model.ts';
import type { DiffParts } from '../base/types.ts';

const inProject = (p: string) => (G.repo ? `${G.repo}/${p}` : p);
const nameOf = (p: string) => p.replace(/\/$/, '').slice(p.replace(/\/$/, '').lastIndexOf('/') + 1);
export const rowOf = (p: string) => rows().find((f) => f.path === p);

export async function showDiff(f: GitFile, side?: 'mine' | 'theirs') {
  if (f.sub) return pickRepo(inProject(f.path));
  if (f.dir) return unfold(f.path);
  try {
    const d = await gapi('GET', `/api/git/diff?path=${encodeURIComponent(f.path)}${f.from ? '&from=' + encodeURIComponent(f.from) : ''}${side ? '&side=' + side : f.x === 'M' && !G.info?.state ? '&parts=1' : ''}`);
    if (d.binary) return say(`${f.path} isn't text: no diff to show`);
    if (d.eol) return say(`${nameOf(f.path)}: only its line endings changed (CRLF and LF), so there is nothing to show`);
    const open = groups.openDiff || ((x: any) => x.rel && tabs.openInTab(x.rel));
    const at = inProject(f.path), cut = at.lastIndexOf('/') + 1;
    open({ path: side ? `${at.slice(0, cut)}${side === 'mine' ? 'yours' : 'theirs'} · ${at.slice(cut)}` : at, rel: f.x === 'D' ? null : at, oldText: d.oldText, newText: d.newText, ...(d.parts && !isOff('scm:off', 'parts') ? { parts: partsOf(f.path, d) } : {}) });
  } catch (e: any) {
    say(e.message, true);
  }
}

function partsOf(p: string, d: any): DiffParts {
  const repo = G.repo, q = (url: string) => url + (repo ? '&repo=' + encodeURIComponent(repo) : '');
  let sig = d.sig;
  const parts: DiffParts = { list: d.parts, runs: d.runs, gen: () => G.stageGen, act: async () => ({}) };
  const took = (r: any, line = r.line || '', undo = !!r.undo) => {
    sig = r.sig;
    parts.list = r.parts || [];
    parts.runs = r.runs || [];
    return { oldText: r.oldText, newText: r.newText, line, undo };
  };
  const fresh = () => api('GET', q(`/api/git/diff?path=${encodeURIComponent(p)}&parts=1`));
  parts.act = async (what, k) => {
    try {
      if (what === 'fresh') return took(await fresh(), '');
      if (what === 'undo') {
        const u = await api('POST', '/api/git/discard/undo', repo ? { repo } : {});
        filesChanged();
        refreshGit(0);
        return took(await fresh(), u.line);
      }
      const r = await api('POST', what === 'discard' ? '/api/git/discard' : '/api/git/stage', { path: p, part: k, on: what === 'stage', sig, ...(repo ? { repo } : {}) });
      if (what === 'discard') filesChanged();
      refreshGit(0);
      return took(r);
    } catch (e: any) {
      return { line: e.message, err: true };
    }
  };
  return parts;
}

const who = () => !isOff('scm:off', 'who');
function byOf(f: GitFile) {
  if (!who()) return '';
  const ids = f.by || [];
  if (!ids.length) return '<span class="sc-by"></span>';
  const one = ids.length === 1, titles = ids.map((id) => chats().find((x) => x.id === id)?.title || chatCode(id));
  const tip = `Changed by ${ids.map(chatCode).join(' and ')}\nThe chat${one ? '' : 's'} ${titles.join(' and ')} changed this file.`;
  return `<span class="sc-by" title="${esc(tip)}" data-tip-icon="agent">${esc(crystalOf(ids[ids.length - 1]).code)}${ids.length > 1 ? '+' : ''}</span>`;
}
function markOf(f: GitFile) {
  if (f.sub) return '<span class="sc-warn sc-sub">repository</span>';
  if (f.lock) return `<span class="sc-warn" title="${esc(`Locked\n${f.lock} holds the lock on this file. Only they can push it.`)}">locked</span>`;
  if (f.dir && f.secrets?.length) return `<span class="sc-warn" title="${esc(`Secret?\n${plural(f.secrets.length, 'file')} in this folder ${f.secrets.length === 1 ? 'looks like a secret. It stays' : 'look like secrets. They stay'} out of the commit unless you check ${f.secrets.length === 1 ? 'it' : 'them'}.`)}">secret?</span>`;
  if (f.mine) return '<span class="sc-warn sc-sub" title="Yours&#10;You hold this file\'s lock. Unlock it once it is pushed.">yours</span>';
  if (f.eol) return '<span class="sc-warn sc-sub">line endings</span>';
  if (f.staged === 'part') return '<span class="sc-warn sc-sub">part</span>';
  if (f.secret) return '<span class="sc-warn">secret?</span>';
  return '';
}

const fileRow = (f: GitFile) => {
  const shown = f.dir ? f.path.replace(/\/$/, '') : f.path;
  const cut = f.kid ? f.kid.length - 1 : shown.lastIndexOf('/'), name = f.kid ? shown.slice(f.kid.length) : shown.slice(cut + 1), dir = f.kid ? '' : cut > 0 ? shown.slice(0, cut) : '';
  const staged = stagedMode(), merging = !!G.info.state;
  const on = f.staged === true;
  const fold = f.dir ? `<span class="sc-cv">${G.open.has(f.path) ? '▾' : '▸'}</span>` : '';
  return `<div class="sc-f${f.x === 'D' ? ' gone' : ''}${staged && !f.staged ? ' out' : ''}${f.kid ? ' kid' : ''}${f.dir ? ' dir' : ''}" data-gfile="${esc(f.path)}" data-tip-mono data-tip-icon="${f.dir ? 'folder' : 'file'}">
    <input type="checkbox" data-gtake="${esc(f.path)}" title="${esc(merging ? 'Stage\nGit holds the stage until this is finished.' : on ? 'Staged\nUncheck to take this file out of the next commit.' : f.staged === 'part' ? 'Partly staged\nCheck to stage all of this file.' : 'Stage\nCheck to stage this file for the next commit.')}" data-tip-icon="check" ${on ? 'checked' : ''}${f.staged === 'part' ? ' data-gpart' : ''} ${merging ? 'disabled' : ''}>
    <span class="sc-x x-${f.x}">${f.kid ? '' : f.x}</span>${fold}<span class="nm">${esc(name)}${f.dir ? `<span class="sc-n">${f.n}</span>` : ''}</span><span class="dir">${esc(dir)}</span>${markOf(f)}${byOf(f)}</div>`;
};

const drawn = new WeakMap<Element, string>();
export function setHtml(el: Element, html: string) {
  if (drawn.get(el) === html && el.innerHTML) return;
  el.innerHTML = html;
  drawn.set(el, html);
}

const WINDOW_AT = 200, AROUND = 20, STEP = 10;
const fileList = () => panel.querySelector<HTMLElement>('.sc-files');
const windowed = () => !!G.info?.repo && rows().length > WINDOW_AT;
function rowHeight(el: HTMLElement) {
  const h = el.querySelector('.sc-f')?.getBoundingClientRect().height;
  return h || parseFloat(getComputedStyle(el).getPropertyValue('--tree-row')) || 24;
}
const pad = (n: number, h: number) => (n ? `<div class="sc-pad" style="height:${n * h}px"></div>` : '');

export function drawFiles() {
  const el = fileList(), i = G.info;
  if (!el || !i?.repo) return;
  const q = (s: string) => panel.querySelector<any>(s);
  const all_ = total(), staged = stagedMode(), merging = !!i.state, full = staged && fullyStaged();
  const all = q('.sc-fh input');
  all.checked = !!files().length && full;
  all.indeterminate = staged && !full;
  all.disabled = merging || !files().length;
  all.title = full ? 'Unstage all\nUnchecks every change, so nothing is staged.' : 'Stage all\nStages every change. Files that look like secrets stay out.';
  all.dataset.tipIcon = 'check';
  q('.sc-fh .n').textContent = !files().length ? '' : staged ? `${i.staged} of ${all_}` : all_;
  q('.sc-fh .n').title = staged ? `Staged: ${i.staged} of ${all_}\nStaged as git sees it, a terminal too. The commit takes exactly those.` : `Changes: ${all_}\nNothing is staged, so a commit takes every change except files that look like secrets.\n\nCheck files to commit only those.`;
  const list = rows(), end = i.more ? `<p class="dim sc-more">and ${i.more} more</p>` : '';
  if (!list.length) return setHtml(el, '<p class="dim sc-more">No changes since the last commit.</p>');
  const had = document.activeElement as HTMLElement | null, held = el.contains(had) ? had!.dataset.gtake : undefined;
  if (!windowed()) {
    setHtml(el, list.map(fileRow).join('') + end);
    halves(el);
    if (held != null && !el.contains(document.activeElement)) focusTake(held);
    return;
  }
  const h = rowHeight(el), top = el.scrollTop, first = Math.floor(top / h), seen = Math.ceil((el.clientHeight || h * 30) / h);
  const a = Math.max(0, Math.floor((first - AROUND) / STEP) * STEP), b = Math.min(list.length, Math.ceil((first + seen + AROUND) / STEP) * STEP);
  const k = held == null ? -1 : list.findIndex((f) => f.path === held);
  const runs = k >= 0 && k < a ? [[k, k + 1], [a, b]] : k >= b ? [[a, b], [k, k + 1]] : [[a, b]];
  let html = '', at = 0;
  for (const [x, y] of runs) {
    html += pad(x - at, h) + list.slice(x, y).map(fileRow).join('');
    at = y;
  }
  setHtml(el, html + pad(list.length - at, h) + end);
  halves(el);
  if (el.scrollTop !== top) el.scrollTop = top;
  if (held != null && !el.contains(document.activeElement)) focusTake(held);
}
function halves(el: HTMLElement) {
  for (const c of el.querySelectorAll<HTMLInputElement>('[data-gtake]')) c.indeterminate = 'gpart' in c.dataset;
}
let moving = false;
function focusTake(p: string) {
  moving = true;
  [...fileList()!.querySelectorAll<HTMLInputElement>('[data-gtake]')].find((c) => c.dataset.gtake === p)?.focus({ preventScroll: true });
  moving = false;
}
let frame = 0;
const soonFiles = () => windowed() && (frame ||= requestAnimationFrame(() => ((frame = 0), drawFiles())));

function focusRow(k: number) {
  const el = fileList()!, h = rowHeight(el), y = k * h;
  if (y < el.scrollTop) el.scrollTop = y;
  else if (y + h > el.scrollTop + el.clientHeight) el.scrollTop = y + h - el.clientHeight;
  drawFiles();
  focusTake(rows()[k].path);
}
let tabbing = 0;
addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  tabbing = e.shiftKey ? -1 : 1;
  setTimeout(() => (tabbing = 0));
}, true);

async function discard(list: GitFile[], what = '') {
  const mine = list.filter((f) => !f.sub && f.x !== 'C');
  if (!mine.length) return;
  const fresh = mine.filter((f) => f.fresh).reduce((n, f) => n + sizeOf(f), 0), old = mine.filter((f) => !f.fresh).length, one = mine.length === 1 && !mine[0].dir;
  const text = [
    old ? `${old === 1 && one ? nameOf(mine[0].path) : plural(old, 'changed file')} ${old === 1 ? 'goes' : 'go'} back to the last commit. This can't be undone.` : '',
    fresh ? `${fresh === 1 && one ? nameOf(mine[0].path) + ' is new: it goes' : plural(fresh, 'new file') + (fresh === 1 ? ' goes' : ' go')} to the archive, not deleted.` : '',
  ].filter(Boolean).join('\n\n');
  const all = old + fresh;
  if (!(await ask({ title: one ? `Discard the changes to ${nameOf(mine[0].path)}?` : `Discard ${what || `all ${all}`} changes?`, text, confirm: true }))) return;
  if (!(await okWhileWorking('Discarding'))) return;
  doing('discarding…', post('/api/git/discard', { paths: mine.map((f) => f.path) }), filesChanged);
}
async function toChat(f: GitFile) {
  const i = G.info, text = `a ${i.state || 'merge'} conflict in ${inProject(f.path)} (branch ${i.branch}): resolve it so both sides' changes are kept where they can be, and say what you chose`;
  try {
    say(`${nameOf(f.path)} → ${await groups.pickToChat({ label: nameOf(f.path), title: inProject(f.path), text })}`);
  } catch (e: any) {
    say(e.message, true);
  }
}
function ignore(f: GitFile, kind: string) {
  doing('ignoring…', post('/api/git/ignore', { path: f.path, kind }), (r: any) => {
    if (r.tracked) G.note = `${r.line} · it is tracked already: “stop tracking” leaves it out`;
  });
}
async function untrack(f: GitFile) {
  const text = `Git forgets ${f.path} at the next commit, and adds it to .gitignore so it stays out. The file stays on your disk. For everyone who pulls that commit, git deletes their copy, so keep one if they need it.`;
  if (!(await ask({ title: `Stop tracking ${nameOf(f.path)}?`, text, confirm: true }))) return;
  doing('untracking…', async () => {
    await gapi('POST', '/api/git/ignore', { path: f.path, kind: 'file' });
    return gapi('POST', '/api/git/untrack', { path: f.path });
  });
}
const FILE_IC: Record<string, () => string> = { open: () => icon('folder'), diff: () => icon('eye'), ours: () => icon('eye'), 'theirs-d': () => icon('eye'), mine: () => icon('check'), theirs: () => icon('check'), chat: () => ICONS.toChat, file: () => icon('file'), copy: () => ICONS.copy, lock: () => icon('key'), unlock: () => icon('key'), untrack: () => ICONS.unlist, discard: () => ICONS.bin, eol: () => ICONS.bin, stash: () => ICONS.archive, nobody: () => icon('agent') };
const mi = (act: string, label: string, note = '', off = false) => gitRow(`data-gm="${act}"`, (FILE_IC[act] || (act.startsWith('ignore') ? () => icon('eyeOff') : act.startsWith('only:') ? () => icon('agent') : () => ICONS.blank))(), label, note, off);
function ignoreRows(f: GitFile) {
  if (f.sub || f.x === 'C' || f.x === 'D') return '';
  const name = nameOf(f.path), ext = /\.[\w-]{1,16}$/.exec(name)?.[0], parent = f.path.replace(/\/$/, '').split('/').slice(0, -1).pop();
  if (!f.fresh) return mi('untrack', 'stop tracking…', 'Stop tracking\nGit forgets the file; the file stays.');
  return (
    (f.dir ? mi('ignore-dir', 'ignore this folder', 'adds it to .gitignore') : mi('ignore-file', 'ignore this file', 'adds it to .gitignore')) +
    (!f.dir && parent ? mi('ignore-folder', `ignore the folder ${parent}`) : '') +
    (!f.dir && ext ? mi('ignore-ext', `ignore all ${ext} files`) : '')
  );
}
function rowMenu(f: GitFile, x: number, y: number) {
  const busy = !!G.busy, state = G.info.state, lock = G.info.locks && !f.dir && !f.fresh && !f.lock;
  const rows =
    (f.sub
      ? mi('open', 'open this repository', 'its changes and branches, here')
      : (f.dir ? mi('diff', G.open.has(f.path) ? 'fold its files' : 'list its files') : mi('diff', 'show what changed')) +
        (f.x === 'C' ? mi('ours', 'show what I changed', 'yours against where both began') + mi('theirs-d', 'show what they changed', 'theirs against where both began') + mi('mine', 'take mine', 'keep your own side', busy) + mi('theirs', 'take theirs', 'keep the other side', busy) + mi('chat', 'ask a chat to fix it', 'ask an agent to fix it') : '') +
        (f.x === 'D' || f.dir ? '' : mi('file', 'open the file')) +
        mi('copy', 'copy path') +
        (lock ? (f.mine ? mi('unlock', 'unlock', 'others can push it again', busy) : mi('lock', 'lock', 'only you can push it', busy)) : '') +
        (ignoreRows(f) ? `<div class="sep"></div>` + ignoreRows(f) : '') +
        (f.x === 'C' ? '' : `<div class="sep"></div>` + mi('discard', 'discard changes…', state ? `not during a ${state}` : f.fresh ? `the new ${f.dir ? 'folder' : 'file'} goes to the archive` : 'Discard changes\nThe file goes back to the last commit.', busy || !!state)));
  const html = menuHead(gem(f.dir || f.sub ? 'folder' : 'file'), nameOf(f.path)) + bands({ actions: rows });
  popMenu(x, y, html, (el: HTMLElement) => {
    const act = el.dataset.gm;
    if (act === 'open' || act === 'diff') showDiff(f);
    else if (act === 'ours') showDiff(f, 'mine');
    else if (act === 'theirs-d') showDiff(f, 'theirs');
    else if (act === 'file') tabs.openInTab(inProject(f.path));
    else if (act === 'copy') copy(inProject(f.path));
    else if (act === 'discard') discard([f]);
    else if (act === 'chat') toChat(f);
    else if (act === 'untrack') untrack(f);
    else if (act?.startsWith('ignore-')) ignore(f, act.slice(7));
    else if (act === 'lock' || act === 'unlock') doing(act === 'lock' ? 'locking…' : 'unlocking…', post('/api/git/lock', { path: f.path, do: act }));
    else if (act === 'mine' || act === 'theirs') doing(act === 'mine' ? 'taking your side…' : 'taking their side…', post('/api/git/take', { path: f.path, side: act }), filesChanged);
  });
}
export function changesMenu(btn: HTMLElement) {
  const b = btn.getBoundingClientRect(), i = G.info, busy = !!G.busy, none = !files().length, state = i.state;
  const why = state ? `not during a ${state}` : '';
  const own = chats().filter((c) => files().some((f) => f.by?.includes(c.id)));
  const eol = files().filter((f) => f.eol);
  const html =
    `<div class="ml">changes</div>` +
    (own.length && !state ? own.map((c) => mi('only:' + c.id, `only ${chatCode(c.id)}’s files`, c.title || 'stage those, take the rest out')).join('') + mi('nobody', 'only files no chat changed') + `<div class="sep"></div>` : '') +
    mi('stash', 'stash all changes…', why || 'put them aside, bring them back later', busy || none || !!state) +
    `<div class="sep"></div>` +
    (eol.length ? mi('eol', `discard ${plural(eol.length, 'line-ending change')}…`, why || 'the files keep their content', busy || !!state) : '') +
    mi('discard', 'discard all changes…', why || 'back to the last commit', busy || none || !!state);
  popMenu(b.right - 200, b.bottom + 4, html, async (el: HTMLElement) => {
    const act = el.dataset.gm || '';
    if (act.startsWith('only:') || act === 'nobody') {
      const id = act.slice(5), want = (f: GitFile) => (act === 'nobody' ? !f.by?.length : !!f.by?.includes(id));
      stage({ paths: files().filter(want).map((f) => f.path), only: true }, (f) => (want(f) ? (f.dir ? null : true) : undefined));
      return say(act === 'nobody' ? 'staged: the files no chat changed' : `staged: ${chatCode(id)}’s files`);
    }
    if (act === 'discard') discard(files());
    else if (act === 'eol') discard(eol, `${eol.length} line-ending`);
    else if (act === 'stash') {
      const name = await ask({ title: `Stash ${plural(total(), 'change')}`, text: 'They leave the files and wait in the stash list (new files too). Bring them back from “stashes…”.', placeholder: 'a name for it (optional)', blank: true });
      if (name != null && (await okWhileWorking('Stashing'))) doing('stashing…', post('/api/git/stash', { do: 'save', message: name }), filesChanged);
    }
  });
}

export function wireFiles(el: HTMLElement) {
  el.addEventListener('scroll', soonFiles, { passive: true });
  onSize(el, { name: 'git.files', live: true, write: () => soonFiles() });
  el.addEventListener('contextmenu', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-gfile]');
    const f = row && rowOf(row.dataset.gfile!);
    if (!f) return;
    e.preventDefault();
    e.stopPropagation();
    rowMenu(f, e.clientX, e.clientY);
  });
  el.addEventListener('keydown', (e) => {
    const p = (e.target as HTMLElement).dataset?.gtake;
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || p == null || !windowed()) return;
    const list = rows(), k = list.findIndex((f) => f.path === p) + (e.shiftKey ? -1 : 1);
    if (k < 0 || k >= list.length) return;
    e.preventDefault();
    focusRow(k);
  });
  el.addEventListener('focusin', (e) => {
    if (moving || !tabbing || !windowed() || el.contains(e.relatedTarget as Node | null)) return;
    const list = rows(), k = tabbing > 0 ? 0 : list.length - 1;
    if ((e.target as HTMLElement).dataset?.gtake !== list[k].path) focusRow(k);
  });
}
