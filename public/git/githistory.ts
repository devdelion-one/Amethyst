import { filesChanged } from '../app/actions.ts';
import { ask, bands, ICONS, menuHead, popMenu } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import * as groups from '../app/groups.ts';
import { esc, store, track } from '../base/util.ts';
import { copy } from '../base/chips.ts';
import { isOff } from '../base/prefs.ts';
import { plural } from '../base/words.ts';
import { page } from '../base/page.ts';
import { G, gitRow, panel, gapi, doing, post, say, draw, okWhileWorking } from './gitstate.ts';
import { openChange, openCommit, openBranch, fileRows, refChips, reflogMenu, since, when } from './gitviews.ts';
import type { Commit } from './gitviews.ts';

type Changed = { path: string; x: string; from?: string };
const H = {
  q: '',
  ref: '',
  path: '',
  range: '',
  list: [] as Commit[],
  more: false,
  sig: '',
  seq: 0,
  busy: false,
  err: '',
  sel: new Set<string>(),
  last: '',
  files: new Map<string, Changed[] | null>(),
};

const isOpen = () => !isOff('scm:off', 'history') && !store.get('git:histFold', true);
const plain = () => !H.ref && !H.path && !H.range && !H.q;

export const HIST_HTML = `<div class="sc-split sc-hsplit" title="Resize&#10;Drag to give the history or the changes more room."></div>
      <button type="button" class="sc-fh sc-hh" data-gact="hfold"><span class="cv">▸</span><span>history</span><span class="n"></span></button>
      <div class="sc-hist">
        <div class="sc-hbar"><input class="sc-hq" placeholder="search · author:name · code:text" spellcheck="false" title="Search the history&#10;Words search the commit messages. author:name finds someone's commits, code:text finds when a text came in or went."><button class="sc-hof" data-ghof>this branch ▾</button></div>
        <div class="sc-hscope"></div>
        <div class="sc-hl"></div>
      </div>`;

async function fetchList(more = false) {
  const n = ++H.seq;
  H.busy = true;
  const q = new URLSearchParams();
  if (H.q) q.set('q', H.q);
  if (H.ref) q.set('ref', H.ref);
  if (H.path) q.set('path', H.path);
  if (H.range) q.set('range', H.range);
  if (more) q.set('skip', String(H.list.length));
  try {
    const r = await gapi('GET', `/api/git/log?${q}`);
    if (n !== H.seq) return;
    H.list = more ? [...H.list, ...r.list] : r.list;
    H.more = r.more;
    H.err = '';
    if (!more) H.sel.clear();
  } catch (e: any) {
    if (n !== H.seq) return;
    H.err = e.message;
    H.list = [];
  } finally {
    if (n === H.seq) H.busy = false;
  }
  drawHist();
}

export function histFor(o: { path?: string; ref?: string; range?: string }) {
  Object.assign(H, { path: o.path || '', ref: o.ref || '', range: o.range || '', q: '', sig: '' });
  store.set('git:histFold', false);
  const q = panel.querySelector<HTMLInputElement>('.sc-hq');
  if (q) q.value = '';
  draw();
}
export function resetHist() {
  Object.assign(H, { q: '', ref: '', path: '', range: '', list: [], more: false, sig: '', err: '' });
  H.sel.clear();
  H.files.clear();
  const q = panel.querySelector<HTMLInputElement>('.sc-hq');
  if (q) q.value = '';
}

const row = (c: Commit, i: number) => {
  const files = H.files.get(c.hash), open = H.files.has(c.hash), merge = c.parents.length > 1;
  const tip = `${c.subject}\nCommit ${c.short} by ${c.author}, ${when(c.at)}.${c.pushed ? '' : ' Not pushed yet.'}${merge ? ' It is a merge.' : ''}\nClick to list its files.`;
  return `<div class="sc-hc${H.sel.has(c.hash) ? ' sel' : ''}${open ? ' open' : ''}" data-ghc="${esc(c.hash)}" data-i="${i}" title="${esc(tip)}" data-tip-keys="=double-click:open it;=ctrl+click:pick several"><span class="sc-up">${c.pushed ? '' : '↑'}</span><span class="nm">${esc(c.subject)}</span>${refChips(c.refs.slice(0, 1))}<span class="dir">${esc(c.author.split(' ')[0])} · ${since(c.at)}</span></div>${open ? `<div class="sc-hfs" data-ghfs="${esc(c.hash)}">${files ? fileRows(files) || '<p class="dim sc-more">no files changed</p>' : '<p class="dim sc-more">…</p>'}</div>` : ''}`;
};

export function drawHist() {
  const q = (s: string) => panel.querySelector<any>(s);
  const head = q('.sc-hh'), box = q('.sc-hist'), split = q('.sc-hsplit');
  if (!head) return;
  const off = isOff('scm:off', 'history'), on = isOpen();
  head.hidden = off;
  box.hidden = split.hidden = !on;
  q('.sc-hh .cv').textContent = on ? '▾' : '▸';
  head.title = `History\nThe commits of this branch: what each changed, and what to do with them. Click to ${on ? 'fold' : 'show'} it.`;
  head.dataset.tipIcon = on ? 'chevDown' : 'chev';
  if (!on || !G.info?.repo) return;
  box.style.height = (store.get('git:histH', 0) || 220) + 'px';
  const sig = [G.key, G.repo, G.info.branch, G.info.head?.hash, H.q, H.ref, H.path, H.range].join('|');
  if (sig !== H.sig) {
    H.sig = sig;
    H.files.clear();
    fetchList();
  }
  q('.sc-hof').textContent = `${H.ref || 'this branch'} ▾`;
  const scope = H.path ? `history of <b>${esc(H.path)}</b>` : H.range ? `what came in: <b>${plural(H.list.length, 'commit')}</b>` : '';
  q('.sc-hscope').innerHTML = scope ? `<span>${scope}</span><button class="sc-b" data-ghx>×</button>` : '';
  q('.sc-hscope').hidden = !scope;
  q('.sc-hh .n').textContent = H.sel.size > 1 ? `${H.sel.size} picked` : '';
  const list = q('.sc-hl');
  if (H.err) return (list.innerHTML = `<p class="err sc-more">${esc(H.err)}</p>`);
  const foot = (H.more ? '<button class="sc-b sc-hmore" data-ghmore>more…</button>' : '') + (plain() && G.info.commits ? '<button class="sc-b sc-hmore" data-ghref title="Where this branch has been&#10;The commits it pointed to before. After a reset, an amend or a rebase, nothing is lost for a while.">where this branch has been…</button>' : '');
  list.innerHTML = H.list.length ? H.list.map(row).join('') + `<div class="sc-hfoot">${foot}</div>` : `<p class="dim sc-more">${H.busy ? '…' : H.q ? 'no commit matches' : 'no commits yet'}</p>`;
}

async function unfoldCommit(c: Commit) {
  if (H.files.has(c.hash)) {
    H.files.delete(c.hash);
    return drawHist();
  }
  H.files.set(c.hash, null);
  drawHist();
  try {
    const r = await gapi('GET', `/api/git/show?hash=${c.hash}`);
    if (H.files.has(c.hash)) H.files.set(c.hash, r.files);
  } catch (e: any) {
    H.files.delete(c.hash);
    say(e.message, true);
  }
  drawHist();
}

const HIST_IC: Record<string, () => string> = { open: () => ICONS.page, copy: () => ICONS.copy, branch: () => icon('branch'), try: () => icon('eye'), compare: () => ICONS.history, two: () => ICONS.history, pick: () => icon('move'), revert: () => ICONS.reset, reset: () => icon('clear'), reword: () => ICONS.rename, squash: () => icon('shrink'), bisect: () => ICONS.toChat, chat: () => ICONS.toChat };
const mi = (act: string, label: string, note = '', off = false) => gitRow(`data-gh="${act}"`, (HIST_IC[act] || (() => ICONS.blank))(), label, note, off);
function newestRun(sel: Commit[]) {
  if (!plain() || !sel.length || sel.some((c) => c.pushed)) return false;
  const idx = sel.map((c) => H.list.indexOf(c)).sort((a, b) => a - b);
  return idx.every((v, i) => v === i);
}
async function toChat(text: string, label: string) {
  try {
    say(`${label} → ${await groups.pickToChat({ label, title: label, text })}`);
  } catch (e: any) {
    say(e.message, true);
  }
}
function commitMenu(c: Commit, x: number, y: number) {
  if (!H.sel.has(c.hash)) {
    H.sel.clear();
    H.sel.add(c.hash);
    drawHist();
  }
  const sel = H.list.filter((k) => H.sel.has(k.hash)), i = G.info, busy = !!G.busy || !!i.state, br = i.detached ? 'HEAD' : i.branch;
  const run = newestRun(sel);
  let html = '';
  if (sel.length === 1) {
    const merge = c.parents.length > 1, other = !!(H.ref || H.range);
    html +=
      mi('open', 'open', 'its message and files') +
      mi('copy', 'copy hash', c.short) +
      mi('branch', 'new branch from here…') +
      mi('try', 'try this commit', 'look at the files as they were', busy) +
      mi('compare', 'show what changed since', 'from here to what you have now') +
      `<div class="sep"></div>` +
      (other ? mi('pick', `cherry-pick onto ${br}`, 'copy it here as a new commit', busy || i.detached) : '') +
      mi('revert', 'revert…', merge ? 'undo what the merge brought in' : 'a new commit that undoes it', busy) +
      mi('reset', `reset ${br} to here…`, 'later commits leave the branch', busy || i.detached || other) +
      (run ? mi('reword', 'reword…', 'change its message: not pushed yet', busy) : '') +
      `<div class="sep"></div>` +
      mi('chat', 'ask a chat about it', 'ask an agent about it');
  } else {
    const [newer, older] = sel.length === 2 ? sel : [sel[0], sel[sel.length - 1]];
    html +=
      mi('two', 'compare these', `${older.short} → ${newer.short}`) +
      (run ? mi('squash', `squash ${sel.length} into one…`, 'not pushed yet', busy) : '') +
      mi('bisect', 'ask a chat which one broke it', 'the agent tries them in between') +
      mi('chat', 'ask a chat about them', 'ask an agent about them');
  }
  popMenu(x, y, menuHead(ICONS.git, sel.length > 1 ? `${sel.length} commits` : c.short) + bands({ actions: html }), async (el: HTMLElement) => {
    const act = el.dataset.gh;
    if (act === 'open') return openCommit(c.hash);
    if (act === 'copy') return copy(c.hash);
    if (act === 'compare') return openBranch('HEAD', c.hash);
    if (act === 'two') {
      const [newer, older] = [sel[0], sel[sel.length - 1]];
      return openBranch(newer.hash, older.hash);
    }
    if (act === 'branch') {
      const name = await ask({ title: `New branch from ${c.short}`, text: `It starts at “${c.subject}”; your uncommitted changes come along.`, placeholder: 'its name, e.g. fix-from-here' });
      if (name) doing('making the branch…', post('/api/git/branch', { do: 'create', name, from: c.hash }), filesChanged);
      return;
    }
    if (act === 'try') {
      if (await okWhileWorking('Trying a commit')) doing('switching…', post('/api/git/try', { hash: c.hash }), filesChanged);
      return;
    }
    if (act === 'pick') return doing('cherry-picking…', post('/api/git/pick', { hash: c.hash }), filesChanged);
    if (act === 'revert') {
      const merge = c.parents.length > 1;
      const text = merge ? `A new commit undoes everything “${c.subject}” brought into this branch. The merge itself stays in the history.` : `A new commit undoes what “${c.subject}” changed. It stays in the history, and so does the undo.`;
      if (await ask({ title: `Revert ${c.short}?`, text, confirm: true })) doing('reverting…', post('/api/git/revert', { hash: c.hash }), filesChanged);
      return;
    }
    if (act === 'reset') {
      const after = H.list.indexOf(c);
      const how = await ask({
        title: `Reset ${br} to ${c.short}?`,
        text: `${plural(after, 'commit')} after it leave the branch (“where this branch has been” keeps them for a while).\n\nKeep their changes: they come back as uncommitted changes.\n\nDrop everything: those commits and your uncommitted changes are gone from the files.`,
        choices: [{ label: 'keep their changes', value: 'soft' }, { label: 'drop everything', value: 'hard' }],
      });
      if (!how) return;
      if (how === 'hard' && !(await ask({ title: 'Drop everything after it?', text: `The files go back to ${c.short} exactly. Uncommitted changes go too, and they are not kept anywhere.`, warn: "This can't be undone from here.", confirm: true }))) return;
      if (await okWhileWorking('Resetting')) doing('resetting…', post('/api/git/reset', { hash: c.hash, how }), filesChanged);
      return;
    }
    if (act === 'reword' || act === 'squash') {
      const message = await ask({ title: act === 'reword' ? `New message for ${c.short}` : `One commit instead of ${sel.length}`, text: act === 'reword' ? 'Only the message changes.' : `Their changes become one commit, with this message. ${sel.map((k) => `“${k.subject}”`).join(', ')}.`, value: act === 'reword' ? `${c.subject}${c.body ? '\n\n' + c.body : ''}` : sel[sel.length - 1].subject, placeholder: 'the message' });
      if (message) doing(act === 'reword' ? 'rewording…' : 'squashing…', post('/api/git/squash', { hashes: sel.map((k) => k.hash), message }), filesChanged);
      return;
    }
    if (act === 'bisect') {
      const [newer, older] = [sel[0], sel[sel.length - 1]];
      return toChat(`find which commit between ${older.short} (“${older.subject}”, works) and ${newer.short} (“${newer.subject}”, broken) broke it: try them with git bisect, then tell me which one and why. What broke: `, `${older.short}..${newer.short}`);
    }
    if (act === 'chat') return toChat(sel.map((k) => `commit ${k.short} “${k.subject}” by ${k.author}, ${when(k.at)}`).join('\n'), sel.length > 1 ? `${sel.length} commits` : c.short);
  });
}

async function refMenu(btn: HTMLElement) {
  const b = btn.getBoundingClientRect();
  let r: any;
  try {
    r = await gapi('GET', '/api/git/branches');
  } catch (e: any) {
    return say(e.message, true);
  }
  const item = (ref: string, d = '') => `<button class="mi${ref === H.ref ? ' on' : ''}" data-ghr="${esc(ref)}">${esc(ref || 'this branch')}${d ? `<span class="d">${esc(d)}</span>` : ''}</button>`;
  const html = `<div class="ml">whose history</div>` + item('', G.info.branch) + r.local.filter((l: any) => l.name !== G.info.branch).map((l: any) => item(l.name)).join('') + r.remote.map((x: string) => item(x, 'on the remote')).join('') + r.tags.slice(0, 10).map((t: string) => item(t, 'tag')).join('');
  popMenu(b.left, b.bottom + 4, html, (el: HTMLElement) => {
    Object.assign(H, { ref: el.dataset.ghr || '', range: '', sig: '' });
    drawHist();
  });
}

let typing = 0;
let lastClick = { hash: '', at: 0 };
export function wireHist() {
  panel.querySelector<HTMLElement>('.sc-hsplit')!.addEventListener('pointerdown', (e) => {
    const box = panel.querySelector<HTMLElement>('.sc-hist')!, y0 = e.clientY, h0 = box.offsetHeight;
    e.preventDefault();
    track(e, {
      capture: e.target as Element,
      move: (ev) => {
        const max = Math.max(120, panel.querySelector<HTMLElement>('.sc-repo')!.offsetHeight - 260);
        box.style.height = Math.round(Math.min(max, Math.max(80, h0 - (ev.clientY - y0)))) + 'px';
      },
      end: () => store.set('git:histH', box.offsetHeight),
    });
  });
  const input = panel.querySelector<HTMLInputElement>('.sc-hq')!;
  input.addEventListener('input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => {
      H.q = input.value.trim();
      drawHist();
    }, 350);
  });
  const box = panel.querySelector<HTMLElement>('.sc-hist')!;
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ghof]')) return refMenu(t.closest<HTMLElement>('[data-ghof]')!);
    if (t.closest('[data-ghx]')) return Object.assign(H, { path: '', range: '', ref: '' }), drawHist();
    if (t.closest('[data-ghmore]')) return fetchList(true);
    if (t.closest('[data-ghref]'))
      return reflogMenu(e.clientX, e.clientY, (hash, what) => {
        popMenu(e.clientX, e.clientY, menuHead(ICONS.git, hash.slice(0, 7)) + bands({ actions: mi('open', 'open') + mi('branch', 'new branch from here…') + mi('reset', `reset ${G.info.branch} to here…`, '', !!G.busy || !!G.info.state || G.info.detached) }), async (m: HTMLElement) => {
          if (m.dataset.gh === 'open') return openCommit(hash);
          if (m.dataset.gh === 'branch') {
            const name = await ask({ title: `New branch from ${hash.slice(0, 7)}`, placeholder: 'its name, e.g. rescued' });
            if (name) doing('making the branch…', post('/api/git/branch', { do: 'create', name, from: hash }), filesChanged);
            return;
          }
          if (await ask({ title: `Reset ${G.info.branch} to ${hash.slice(0, 7)}?`, text: 'The branch and its files go back to that commit. Your uncommitted changes stay; git refuses if that commit would overwrite one of them.', confirm: true })) doing('resetting…', post('/api/git/reset', { hash, how: 'keep' }), filesChanged);
        });
      });
    const f = t.closest<HTMLElement>('[data-gvf]');
    if (f) {
      const hash = f.closest<HTMLElement>('[data-ghfs]')!.dataset.ghfs!, c = H.list.find((k) => k.hash === hash)!, file = H.files.get(hash)?.find((x) => x.path === f.dataset.gvf);
      if (file) openChange(file, c.parents[0] || null, c.hash, c.short);
      return;
    }
    const r = t.closest<HTMLElement>('[data-ghc]');
    if (!r) return;
    const c = H.list.find((k) => k.hash === r.dataset.ghc)!;
    if (e.ctrlKey || e.metaKey) {
      H.sel.has(c.hash) ? H.sel.delete(c.hash) : H.sel.add(c.hash);
      H.last = c.hash;
      return drawHist();
    }
    if (e.shiftKey && H.last) {
      const a = H.list.findIndex((k) => k.hash === H.last), b = H.list.indexOf(c);
      H.sel.clear();
      for (const k of H.list.slice(Math.min(a, b), Math.max(a, b) + 1)) H.sel.add(k.hash);
      return drawHist();
    }
    H.sel.clear();
    H.last = c.hash;
    const twice = e.detail > 1 || (lastClick.hash === c.hash && e.timeStamp - lastClick.at < 450);
    lastClick = { hash: c.hash, at: e.timeStamp };
    if (twice) return openCommit(c.hash);
    unfoldCommit(c);
  });
  box.addEventListener('dblclick', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-ghc]');
    if (r) openCommit(r.dataset.ghc!);
  });
  box.addEventListener('contextmenu', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-ghc]');
    const c = r && H.list.find((k) => k.hash === r.dataset.ghc);
    if (!c) return;
    e.preventDefault();
    e.stopPropagation();
    commitMenu(c, e.clientX, e.clientY);
  });
}
export function foldHist() {
  store.set('git:histFold', isOpen());
}
export function seeCame() {
  if (!G.came) return;
  page.showGit();
  histFor({ range: `${G.came.from}..${G.came.to}` });
}
