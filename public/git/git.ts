import { filesChanged } from '../app/actions.ts';
import { ask, barMenu, hideMenu, ICONS, rowIcons } from '../base/controls.ts';
import { writerBody, writerModel, writerName, writerTip, writerUnder } from '../base/writer.ts';
import { icon } from '../base/icon.ts';
import { $, esc, store } from '../base/util.ts';
import { every } from '../base/life.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { tell } from '../base/notify.ts';
import { G, panel, shown, files, taken, stagedMode, fullyStaged, secretsIn, stage, load, refreshGit, gitCount, setKey, doing, post, onDraw, say, pickRepo } from './gitstate.ts';
import { drawFiles, wireFiles, showDiff, changesMenu, setHtml, rowOf } from './gitfiles.ts';
import { drawHead, drawNote, NET } from './githead.ts';
import { branchMenu } from './gitbranches.ts';
import { STASH_HTML, drawStashes, foldStashes, stashClick, wireStashes } from './gitstashes.ts';
import { WTS_HTML, wireWts, wtClick, foldWts, drawWts } from './gitworktrees.ts';
import { HIST_HTML, wireHist, drawHist, foldHist, resetHist, histFor } from './githistory.ts';
import { openBranch, openBlame, openChange } from './gitviews.ts';
import { page } from '../base/page.ts';

export { gitCount, refreshGit };
export { cloneProject } from './gitclone.ts';

const drafts = () => store.get('gitMsg', {});
let box: HTMLTextAreaElement | null = null;
const draftKey = (key: string | null) => (G.repo ? `${key}\n${G.repo}` : key!);
const setDraft = (key: string | null, text?: string) => store.set('gitMsg', { ...drafts(), [draftKey(key)]: text || undefined });
const saveDraft = () => setDraft(G.key, box!.value);
let drawnFor = '';

export function renderGit() {
  if (!setKey()) return;
  resetHist();
  build();
  draw();
  if (shown()) load();
  else if (G.key) refreshGit(280);
}

every(10e3, () => G.key && !G.busy && shown() && load());
onPref('git:worktrees', () => G.key && load());
onPref('scm:off', () => box && G.info && draw());
const GLYPH = (g: string) => `<b class="tb-tx">${g}</b>`;
rowIcons({ 'scm:off:remote': () => ICONS.git, 'scm:off:check': () => GLYPH('⟳'), 'scm:off:pull': () => GLYPH('↓↑'), 'scm:off:sync': () => GLYPH('⇅'), 'scm:off:ai': () => GLYPH('✦'), 'scm:off:model': () => icon('agent'), 'scm:off:push': () => icon('send'), 'scm:off:last': () => ICONS.reset, 'scm:off:who': () => icon('agent'), 'scm:off:history': () => ICONS.history, 'scm:off:stashes': () => ICONS.archive, 'scm:off:parts': () => icon('check'), 'scm:off:pr': () => ICONS.pr });
barMenu('.sc-head, .sc-net, .sc-acts, .sc-last, .sc-box, .sc-sh', 'scm');
const allButtons = (x: number, y: number): [string, () => unknown] => ['all source control buttons', () => hideMenu(x, y, 'scm')];
barMenu('#scm .sc-ai, #scm .sc-mod', () => null, { open: (el) => openWriter(el) });
const openWriter = (b: HTMLElement) => {
  const r = b.getBoundingClientRect();
  writerUnder(b, allButtons(r.left, r.bottom + 6));
};
const msgTip = () => writerTip('Write the message', 'reads the changes and writes a short commit message.');
function drawWriter() {
  const q = (s: string) => panel.querySelector<HTMLElement>(s), noMod = isOff('scm:off', 'ai') || isOff('scm:off', 'model');
  q('[data-gact="ai"]')!.title = msgTip();
  q('.sc-box')!.classList.toggle('no-mod', noMod);
  q('.sc-modr')!.hidden = noMod;
  q('.sc-mod span')!.textContent = writerModel();
}
onPref('writer:use', () => box && drawWriter());
addEventListener('focus', () => G.key && shown() && refreshGit(100));

async function commit(push: boolean) {
  const i = G.info, message = box!.value.trim(), amend = G.amend;
  if (!message && i.state !== 'merge' && !amend) {
    say('Write a message first (or let ✦ write one).', true);
    return box!.focus();
  }
  let force = false;
  if (amend && i.pushed) {
    if (!(await ask({ title: 'Amend a commit that is on the remote?', text: `“${i.head.subject}” was pushed already. Amending it makes a new commit here, and pushing it replaces the remote's one: fine on your own branch, trouble on a shared one.`, confirm: true }))) return;
    force = true;
  }
  const word = `${amend ? 'amending' : 'committing'}${push ? ' and pushing' : ''}…`;
  doing(word, post('/api/git/commit', { message, push, amend, force }), (r: any, key: string | null) => {
    G.amend = false;
    if (key !== G.key) return setDraft(key, '');
    box!.value = '';
    saveDraft();
  });
}

function writeMessage() {
  const was = box!.value;
  doing(`${writerName()} is writing the message…`, post('/api/git/message', writerBody()), (r: any, key: string | null) => {
    if (key !== G.key) {
      if ((drafts()[draftKey(key)] || '') === was) setDraft(key, r.message);
      return;
    }
    if (box!.value && box!.value !== was) return (G.note = '✦ wrote a message; the box has yours');
    box!.value = r.message;
    saveDraft();
    box!.focus();
  });
}

const whyNoUndo = (i: any) => (i.state ? `Finish or abort the ${i.state} first` : i.detached ? 'Switch to a branch first' : !i.commits || !i.head?.parents ? 'It is the first commit' : 'It is on the remote already: undoing it here would not undo it there');

function undo(btn: HTMLElement) {
  const i = G.info;
  if (!i.canUndo) {
    const line = whyNoUndo(i);
    return tell(btn, { title: "Can't undo the last commit", line, ms: 2500 });
  }
  doing('undoing the last commit…', post('/api/git/undo'), (r: any, key: string | null) => {
    filesChanged();
    if (key !== G.key || !r.message || box!.value.trim()) return;
    box!.value = r.message;
    saveDraft();
  });
}
function amend(el: HTMLInputElement) {
  const i = G.info;
  if (!i.commits || i.state) {
    el.checked = false;
    return tell(el.closest('label')!, { title: "Can't amend now", line: i.state ? `Finish or abort the ${i.state} first` : 'There is no commit yet', ms: 2500 });
  }
  G.amend = el.checked;
  draw();
}

const repoName = () => (G.info?.name || '').trim().replace(/\s+/g, '-').replace(/[^\w.-]/g, '').slice(0, 100) || 'project';

const ACTS = {
  ...NET,
  init: () => doing('starting git…', post('/api/git/init'), filesChanged),
  retry: () => load(),
  commit: () => commit(false),
  push: () => commit(true),
  ai: writeMessage,
  model: openWriter,
  undo,
  amend,
  more: (el: HTMLElement) => changesMenu(el),
  branches: (el: HTMLElement) => branchMenu(el),
  connect: () => {
    G.connect = true;
    draw();
    panel.querySelector<HTMLInputElement>('#sc-name')?.select();
  },
  cancelconn: () => {
    G.connect = false;
    draw();
  },
  create: () => doing('making the repository on GitHub…', post('/api/git/connect', { name: panel.querySelector<HTMLInputElement>('#sc-name')!.value, private: G.vis === 'private' }), () => (G.connect = false)),
  link: () => doing('connecting…', post('/api/git/connect', { url: panel.querySelector<HTMLInputElement>('#sc-url')!.value }), () => (G.connect = false)),
  login: () =>
    doing('opening the GitHub sign-in…', post('/api/git/login'), (r: any) => {
      G.note = r.opened ? 'Sign in in the window that opened, then come back here.' : `Sign in from a terminal: ${r.cmd}`;
    }),
  all: (el: HTMLInputElement) => {
    const on = !(stagedMode() && fullyStaged());
    el.checked = on;
    el.indeterminate = false;
    stage({ all: true, on }, (f) => (!on ? undefined : (f.secret && !f.staged) || f.dir ? null : true));
  },
  sfold: () => {
    foldStashes();
    draw();
  },
  hfold: () => {
    foldHist();
    draw();
  },
  wfold: () => {
    foldWts();
    draw();
  },
};

export const scmHtml = () => `
    <div class="sc-none"></div>
    <div class="sc-repo">
      <div class="sc-head"></div>
      <div class="sc-net"></div>
      <div class="sc-body">
        <div class="sc-box"><textarea id="sc-msg" rows="3" spellcheck="true" placeholder="what changed · ctrl enter commits"></textarea>
          <button class="sc-ai" data-gact="ai" data-tip-set="agents:writer:use" title="${esc(msgTip())}">✦</button><div class="sc-modr"><button class="sc-mod" data-gact="model" data-tip-set="agents:writer:use" aria-haspopup="menu" title="Writing helper&#10;Click to pick another agent or model."><span>${esc(writerModel())}</span><i>▾</i></button></div></div>
        <div class="sc-acts">
          <button class="primary" data-gact="commit" title="Commit&#10;Saves these changes as a commit." data-tip-keys="=ctrl+enter:commit">commit</button>
          <button class="outline" data-gact="push">commit &amp; push</button>
        </div>
        <div class="sc-last">
          <label class="sc-amend" title="Amend&#10;Changes the last commit instead of making a new one. What is staged goes into it, and a message here replaces its message.&#10;&#10;With nothing staged, only the message changes."><input type="checkbox" data-gact="amend">amend</label>
          <span class="grow"></span>
          <button class="sc-b sc-undo" data-gact="undo">undo last commit</button>
        </div>
      </div>
      <div class="sc-conn"></div>
      <div class="sc-say"><p class="sc-note"></p><span class="sc-do"></span></div>
      <div class="sc-fh"><input type="checkbox" data-gact="all" title="Stage all&#10;Stages every change. Files that look like secrets stay out."><span>changes</span><span class="n"></span><button class="sc-b sc-dots" data-gact="more" title="More&#10;Stash or discard the changes." aria-label="more for the changes">⋯</button></div>
      <div class="sc-files"></div>
      ${STASH_HTML}
      ${HIST_HTML}
      ${WTS_HTML}
    </div>`;
function build() {
  if (box) return;
  panel.innerHTML = scmHtml();
  wireWts();
  wireHist();
  wireStashes();
  wireFiles(panel.querySelector<HTMLElement>('.sc-files')!);
  box = panel.querySelector<HTMLTextAreaElement>('#sc-msg')!;
  box.addEventListener('input', saveDraft);
  box.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      commit(e.shiftKey);
    }
  });
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const a = t.closest('[data-gact]') as HTMLButtonElement | null;
    if (a) {
      if ((a as HTMLInputElement).type !== 'checkbox') e.preventDefault();
      return !a.disabled && (ACTS as Record<string, ((el: any) => unknown) | undefined>)[a.dataset.gact!]?.(a);
    }
    const repo = t.closest<HTMLElement>('[data-grepo]');
    if (repo) return pickRepo(repo.dataset.grepo!);
    const take = t.closest('[data-gtake]') as HTMLInputElement | null;
    if (take) {
      const p = take.dataset.gtake!, on = rowOf(p)?.staged !== true;
      take.checked = on;
      take.indeterminate = false;
      return stage({ paths: [p], on }, (f) => (f.path === p ? (on ? true : undefined) : null));
    }
    if (stashClick(t)) return;
    const vis = t.closest<HTMLElement>('[data-gvis]');
    if (vis) {
      G.vis = vis.dataset.gvis!;
      return draw();
    }
    if (wtClick(t)) return;
    const row = t.closest<HTMLElement>('[data-gfile]');
    const f = row && rowOf(row.dataset.gfile!);
    if (f) showDiff(f);
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).id === 'sc-url') ACTS.link();
    if (e.key === 'Enter' && (e.target as HTMLElement).id === 'sc-name' && G.info?.gh === 'in') ACTS.create();
  });
}

function drawNone(i: any) {
  const many = (G.repos?.length || 0) > 0;
  const none = !i.available
    ? `<p>${esc(i.why)}</p>`
    : i.error
    ? `<p class="err">${esc(i.error)}</p><button class="outline" data-gact="retry">try again</button>`
    : i.project === false
    ? '<p class="dim">Source control works inside a project.</p>'
    : !i.git
    ? `<p>${esc(i.why || "git isn't on this PC.")}</p><p class="dim sc-fine">Install it from git-scm.com, then come back.</p>`
    : many
    ? `<p>This project holds ${G.repos!.length === 1 ? 'a repository' : `${G.repos!.length} repositories`} of its own.</p>
       ${G.repos!.map((r) => `<button class="outline" data-grepo="${esc(r.path)}">${esc(r.name)}</button>`).join('')}
       <p class="dim sc-fine">Pick one to see its changes and branches. Git isn't started around them: that would wrap them in another repository.</p>`
    : `<p>This project isn't in git yet.</p>
       <button class="primary" data-gact="init" ${G.busy ? 'disabled' : ''}>start git here</button>
       <p class="dim sc-fine">Git keeps every version of your files. This makes a first commit of everything (.env and other secrets left out).</p>
       <p class="sc-note ${G.err ? 'err' : ''}">${esc(G.busy || G.note)}</p>`;
  panel.querySelector('.sc-none')!.innerHTML = none;
}

function drawPanel() {
  const i = G.info;
  const repo = !!i?.repo;
  panel.dataset.state = !i ? 'wait' : repo ? (G.connect ? 'conn' : 'repo') : 'none';
  if (!i) return;
  if (!repo) return drawNone(i);
  const here = `${G.key}\n${G.repo}`;
  if (here !== drawnFor) {
    drawnFor = here;
    box!.value = drafts()[draftKey(G.key)] || '';
  }
  const r = i.remote, busy = !!G.busy, n = taken(), merging = i.state === 'merge', stuck = !!i.state && i.state !== 'merge', amend = G.amend;
  const q = (s: string) => panel.querySelector<any>(s);
  drawHead();
  q('[data-gact="ai"]').hidden = isOff('scm:off', 'ai');
  q('[data-gact="ai"]').disabled = busy || !n;
  drawWriter();
  const can = !busy && !stuck && (n > 0 || merging || amend);
  const go = q('[data-gact="commit"]');
  go.disabled = !can;
  go.textContent = amend ? 'amend' : 'commit';
  const left = secretsIn();
  const all = n === 1 ? 'the one change' : `all ${n} changes`;
  go.title = stuck ? 'Commit\nSomething is under way: finish or abort it below.' : amend ? `Amend\nChanges the last commit, ${i.head?.subject || ''}.\n${stagedMode() ? `The ${i.staged} staged ${i.staged === 1 ? 'change goes' : 'changes go'} into it.` : 'Nothing is staged, so only the message changes.'}` : stagedMode() ? `Commit\nCommits the ${i.staged} staged ${i.staged === 1 ? 'change' : 'changes'}.` : n ? `Commit\nNothing is staged, so the commit takes ${all}.${left ? `\n${left} that look like secrets stay out.` : ''}` : left ? 'Commit\nOnly files that look like secrets changed. Check one to commit it.' : 'Commit\nNothing to commit.';
  go.dataset.tipKeys = '=ctrl+enter:commit';
  const push = q('[data-gact="push"]');
  push.hidden = isOff('scm:off', 'push');
  push.disabled = !can || !r || i.detached;
  push.textContent = amend ? 'amend & push' : 'commit & push';
  push.title = !r ? `${amend ? 'Amend' : 'Commit'} and push\nThis project has no remote yet. Put it on GitHub first, with connect above.` : amend ? `Amend and push\nAmends, then pushes to ${r.label}.` : `Commit and push\nCommits, then pushes to ${r.label}.`;
  const last = q('.sc-amend'), tick = q('.sc-amend input'), back = q('.sc-undo');
  q('.sc-last').hidden = isOff('scm:off', 'last');
  tick.checked = amend;
  last.classList.toggle('off', !i.commits || !!i.state);
  back.classList.toggle('off', !i.canUndo);
  back.setAttribute('aria-disabled', String(!i.canUndo));
  back.title = i.canUndo ? `Undo last commit\nUndoes ${i.head?.subject || 'the last commit'}. Its changes come back to the list, its message to the box.` : `Undo last commit\nNot possible now. ${whyNoUndo(i)}.`;
  box!.placeholder = amend ? `keeps: ${i.head?.subject || 'the message'}` : 'what changed · ctrl enter commits';
  if (G.connect) q('.sc-conn').innerHTML = connectForm(i);
  drawNote();
  drawFiles();
  drawStashes(setHtml);
  drawHist();
  drawWts(setHtml);
}

function connectForm(i: any) {
  const gh = i.gh;
  const make =
    gh === 'in'
      ? `<button class="primary" data-gact="create" ${G.busy ? 'disabled' : ''}>create on GitHub</button>`
      : gh === 'out'
      ? `<button class="primary" data-gact="login" ${G.busy ? 'disabled' : ''}>sign in to GitHub</button><p class="dim sc-fine">It opens in a terminal window. Then come back and create it.</p>`
      : gh == null
      ? '<button class="primary" disabled>create on GitHub</button>'
      : gh === 'offline'
      ? `<button class="primary" disabled>create on GitHub</button><p class="dim sc-fine">Can't reach GitHub right now: are you online? This looks again by itself.</p>`
      : `<button class="primary" disabled>create on GitHub</button><p class="dim sc-fine">Making one from here needs the GitHub CLI (cli.github.com). Or connect one below.</p>`;
  return `<p class="sc-ct">Put it on GitHub</p>
    ${i.commits ? '' : '<p class="dim sc-fine">Commit something first: GitHub gets your commits.</p>'}
    <span class="lbl">a new repository on your account</span>
    <input id="sc-name" value="${esc(repoName())}" spellcheck="false" autocomplete="off">
    <div class="row"><button class="chip ${G.vis === 'private' ? 'on' : ''}" data-gvis="private">private</button><button class="chip ${G.vis === 'public' ? 'on' : ''}" data-gvis="public">public</button></div>
    ${make}
    <span class="lbl">or one that is already there</span>
    <input id="sc-url" placeholder="https://github.com/you/repo" spellcheck="false" autocomplete="off">
    <div class="row"><button class="outline" data-gact="link" ${G.busy ? 'disabled' : ''}>connect</button><span class="grow"></span><button data-gact="cancelconn">cancel</button></div>`;
}

function drawBadge() {
  const btn = $('#btn-git');
  let badge = btn.querySelector('.act-n');
  if (!badge) btn.append((badge = Object.assign(document.createElement('span'), { className: 'act-n' })));
  const mine = G.info?.repo ? (G.info.total ?? files().length + (G.info.more || 0)) : 0;
  const n = G.repo ? mine : (G.count ?? mine);
  badge.hidden = !n;
  badge.textContent = n > 99 ? '99+' : n;
}

function draw() {
  if (!box) return;
  if (shown()) drawPanel();
  drawBadge();
}
onDraw({ all: draw, badge: drawBadge });

function repoOf(rel: string) {
  const list = G.repos || [];
  const hit = list.filter((r) => r.path && (rel === r.path || rel.startsWith(r.path + '/'))).sort((a, b) => b.path.length - a.path.length)[0];
  if (hit) return { repo: hit.path, path: rel.slice(hit.path.length + 1) };
  return { repo: list.some((r) => r.path === '') ? '' : G.repo, path: rel };
}
async function inRepoOf(rel: string) {
  if (!G.repos) await load(true);
  const at = repoOf(rel);
  if (at.repo !== G.repo) pickRepo(at.repo);
  return at.path;
}
export async function fileHistory(rel: string) {
  page.showGit();
  const p = await inRepoOf(rel);
  histFor({ path: p });
}
export async function fileBlame(rel: string) {
  openBlame(await inRepoOf(rel));
}
export async function gitShow(e: { what: string; repo?: string; path?: string; ref?: string; base?: string; a?: string; b?: string }) {
  if (!G.repos) await load(true);
  if ((e.repo || '') !== G.repo) pickRepo(e.repo || '');
  if (e.what === 'pr' && (e as { n?: number }).n) return page.openPr((e as { n?: number }).n!);
  if (e.what === 'issue' && (e as { n?: number }).n) return page.openIssue((e as { n?: number }).n!);
  if (e.what === 'history') {
    page.showGit();
    return histFor({ path: e.path, ref: e.ref });
  }
  if (e.what === 'branch') return openBranch(e.ref || 'HEAD', e.base);
  if (e.what === 'blame' && e.path) return openBlame(e.path);
  if (e.what === 'diff' && e.path) {
    if (!e.a && !e.b) return showDiff({ path: e.path, x: 'M' });
    return openChange({ path: e.path, x: 'M' }, e.a || null, e.b || null, e.b ? e.b.slice(0, 7) : 'now');
  }
}
export const gitRepoNow = () => G.repo;
export function prChanged() {
  G.pr = null;
  refreshGit(0);
}
