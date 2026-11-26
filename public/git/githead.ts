import { filesChanged } from '../app/actions.ts';
import { ask, ICONS, popMenu } from '../base/controls.ts';
import { esc, store } from '../base/util.ts';
import { isOff } from '../base/prefs.ts';
import { plural } from '../base/words.ts';
import { G, panel, doing, post, say, pickRepo, okWhileWorking, gapi } from './gitstate.ts';
import { seeCame } from './githistory.ts';
import { page } from '../base/page.ts';
import { setHtml } from './gitfiles.ts';

function since(at: number) {
  const m = Math.floor((Date.now() - at) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h ago`;
  return `${Math.floor(m / 1440)} d ago`;
}

const hows = () => store.get('git:pull', {});
const pullHow = (): string => hows()[G.key!] || G.info?.pullMode || '';
const setHow = (how?: string) => store.set('git:pull', { ...hows(), [G.key!]: how });
const moved = (r: any) => {
  if (!r.pulled) return;
  filesChanged();
  if (r.from && r.to && r.from !== r.to) Object.assign(G, { came: { from: r.from.slice(0, 12), to: r.to.slice(0, 12) }, fix: G.fix || 'came' });
};

export async function moveCommits() {
  const name = await ask({ title: 'Move your commits to a new branch', text: `${plural(G.info.ahead, 'commit')} leave ${G.info.branch} for the new branch; ${G.info.branch} goes back to where the remote has it. Then publish the branch.`, placeholder: 'its name, e.g. fix-login' });
  if (name) doing('moving the commits…', post('/api/git/branch', { do: 'move', name }), filesChanged);
}
export const NET = {
  fetch: () => doing('checking the remote…', post('/api/git/fetch')),
  down: async (how?: string) => (await okWhileWorking('Pulling')) && doing('pulling…', post('/api/git/pull', { how: how || pullHow() || undefined }), moved),
  up: () => doing(G.info.upstream ? 'pushing…' : 'publishing…', post('/api/git/push')),
  sync: async () => (!G.info.behind || (await okWhileWorking('Pulling'))) && doing(G.info.upstream ? 'syncing…' : 'publishing…', post('/api/git/sync', { how: pullHow() || undefined }), moved),
  rebase: () => (setHow('rebase'), NET.down('rebase')),
  merge: () => (setHow('merge'), NET.down('merge')),
  again: () => (setHow(undefined), say('')),
  abort: async () => {
    const what = G.info.state;
    if (!(await ask({ title: `Abort the ${what}?`, text: `Everything goes back to how it was before the ${what} began. What you fixed in the conflict files so far is lost.`, confirm: true }))) return;
    if (!(await okWhileWorking('Aborting'))) return;
    doing('aborting…', post('/api/git/abort'), filesChanged);
  },
  go: () => doing('going on…', post('/api/git/continue'), filesChanged),
  cancel: () => post('/api/git/cancel')().catch((e: Error) => say(e.message, true)),
  details: () => ask({ title: 'What git said', text: G.detail.split('\n').slice(-40).join('\n'), confirm: true }),
  lease: async () => {
    if (!(await ask({ title: 'Push over the old version?', text: `The remote's copy of ${G.info.branch} is replaced by yours. It only goes through if nobody pushed there since (git's “force with lease”).`, confirm: true }))) return;
    doing('pushing…', post('/api/git/push', { lease: true }));
  },
  move: () => moveCommits(),
  came: () => seeCame(),
  fork: async () => {
    if (await ask({ title: 'Fork it on GitHub?', text: `GitHub makes a copy of ${G.info.remote?.label || 'the repository'} on your account. Your copy becomes origin, the original becomes upstream, and ${G.info.branch} is pushed to your copy. Then open a pull request to the original.`, confirm: true })) doing('forking…', post('/api/gh/fork'));
  },
  back: () => doing(`back to ${G.info.back}…`, post('/api/git/branch', { name: G.info.back }), filesChanged),
  skip: () => doing('skipping the commit…', post('/api/git/skip'), filesChanged),
  undiscard: () => doing('putting it back…', post('/api/git/discard/undo'), filesChanged),
  identity: async () => {
    let now: any = {};
    try {
      now = await gapi('GET', '/api/git/identity');
    } catch {}
    const name = await ask({ title: 'Your name in commits', text: 'Git writes it into every commit, with your email. Everyone who sees the history sees it.', value: now.name || now.suggest?.name || '', placeholder: 'e.g. Ana Silva' });
    if (!name) return;
    const email = await ask({ title: 'Your email in commits', text: `GitHub links commits to your account by this address. ${now.suggest ? 'The one filled in keeps your real address private.' : 'GitHub can give you a private one: Settings → Emails.'}`, value: now.email || now.suggest?.email || '', placeholder: 'you@example.com' });
    if (email) doing('saving…', post('/api/git/identity', { name, email }));
  },
  remotes: (btn: HTMLElement) => {
    const b = btn.getBoundingClientRect(), i = G.info, list: any[] = i.remotes || [];
    const html =
      (i.remote?.web ? `<div class="ml">${esc(i.remote.label)}</div><button class="mi" data-grm="web">open it in the browser</button><div class="sep"></div>` : '<div class="ml">remotes</div>') +
      list.map((x) => `<button class="mi" data-grm="one" data-gname="${esc(x.name)}">${esc(x.name)}<span class="d">${esc(x.label)}</span></button>`).join('') +
      `<div class="sep"></div><button class="mi" data-grm="add">+ add a remote…<span class="d">another copy to fetch from</span></button>`;
    popMenu(b.left, b.bottom + 4, html, async (el: HTMLElement) => {
      const what = el.dataset.grm, name = el.dataset.gname || '';
      if (what === 'web') return Object.assign(document.createElement('a'), { href: i.remote.web, target: '_blank', rel: 'noopener' }).click();
      if (what === 'add') {
        const n = await ask({ title: 'Add a remote', text: 'A name for it: upstream is the usual one for the project you forked from.', value: list.some((x) => x.name === 'upstream') ? '' : 'upstream', placeholder: 'upstream' });
        const u = n && (await ask({ title: `The address of ${n}`, text: 'Git fetches its branches right away.', placeholder: 'https://github.com/owner/repo' }));
        if (u) doing('adding the remote…', post('/api/git/remote', { do: 'add', name: n, url: u }));
        return;
      }
      const x = list.find((r) => r.name === name);
      if (!x) return;
      popMenu(b.left, b.bottom + 4, `<div class="ml">${esc(x.name)}</div>${x.web ? '<button class="mi" data-grm="web">open it in the browser</button>' : ''}<button class="mi" data-grm="set">change its address…</button><div class="sep"></div><button class="mi" data-grm="rm">remove…<span class="d">only the link: nothing on it changes</span></button>`, async (m: HTMLElement) => {
        if (m.dataset.grm === 'web') return Object.assign(document.createElement('a'), { href: x.web, target: '_blank', rel: 'noopener' }).click();
        if (m.dataset.grm === 'set') {
          const u = await ask({ title: `The address of ${x.name}`, value: x.url, placeholder: 'https://github.com/owner/repo' });
          if (u && u !== x.url) doing('changing the address…', post('/api/git/remote', { do: 'set', name: x.name, url: u }));
          return;
        }
        if (await ask({ title: `Remove the remote ${x.name}?`, text: `This repository forgets ${x.label}. Nothing there changes, and you can add it again.`, confirm: true })) doing('removing the remote…', post('/api/git/remote', { do: 'remove', name: x.name }));
      });
    });
  },
  openpr: () => G.pr?.n && page.openPr(G.pr.n),
  newpr: () => page.newPr(),
  repos: (btn: HTMLElement) => {
    const b = btn.getBoundingClientRect(), kind = { own: 'the project', sub: 'a submodule', below: 'its own repository' };
    const html = `<div class="ml">repository</div>` + G.repos!.map((r) => `<button class="mi ${r.path === G.repo ? 'on' : ''}" data-grepo="${esc(r.path)}">${esc(r.name)}<span class="d">${kind[r.kind]}</span></button>`).join('');
    popMenu(b.left, b.bottom + 4, html, (el: HTMLElement) => pickRepo(el.dataset.grepo!));
  },
};

const FIX: Record<string, [string, string, string]> = {
  login: ['login', 'sign in', 'Sign in\nOpens the GitHub sign-in, then come back here.'],
  pull: ['down', 'pull', 'Pull\nGets the remote\u2019s commits, so you can push again.'],
  lease: ['lease', 'push over it', 'Push over it\nReplaces the remote\u2019s old version of the branch with yours. It asks first.'],
  undo: ['undo', 'undo commit', 'Undo commit\nTakes the last commit back. Its changes stay.'],
  branch: ['move', 'move to a branch', 'Move to a branch\nPuts your commits on a new branch.'],
  identity: ['identity', 'set name and email', 'Set name and email\nThe name and email that go into your commits.'],
  undone: ['undiscard', 'undo', 'Undo\nPuts the discarded changes back.'],
  fork: ['fork', 'fork it', 'Fork it\nMakes your own copy on GitHub and pushes there. It asks first.'],
  came: ['came', 'see them', 'See them\nShows the commits that came in, in the history.'],
};
const btn = ([act, label, tip]: string[], busy: boolean) => `<button class="sc-b" data-gact="${act}" title="${esc(tip)}"${busy ? ' disabled' : ''}>${esc(label)}</button>`;

export function drawHead() {
  const i = G.info, r = i.remote, busy = !!G.busy;
  const q = (s: string) => panel.querySelector<any>(s);
  const many = (G.repos?.length || 0) > 1, mine = G.repos?.find((x) => x.path === G.repo);
  setHtml(
    q('.sc-head'),
    (many ? `<button class="sc-pick" data-gact="repos"><span class="nm">${esc(mine?.name || i.name)}</span><span class="caret">▾</span></button>` : '') +
      `<button class="sc-branch" data-gact="branches" title="Branch: ${esc(i.branch || 'none')}&#10;The branch you are on. Click to switch to another, or to start a new one.">${ICONS.git}<span class="nm">${esc(i.branch || 'no branch')}</span>${i.detached ? '<span class="dim">(no branch)</span>' : ''}<span class="caret">▾</span></button>` +
      (isOff('scm:off', 'remote')
        ? ''
        : r
        ? r.web
          ? `<button class="sc-remote" data-gact="remotes" title="${esc(r.url)}&#10;The remote this project pushes to. Click to open it in the browser, or to see the remotes." data-tip-mono>${esc(r.label)}${(i.remotes?.length || 0) > 1 ? ` +${i.remotes.length - 1}` : ''} ▾</button>`
          : `<button class="sc-remote" data-gact="remotes" title="${esc(r.url)}&#10;The remote this project pushes to. Click to see the remotes." data-tip-mono>${esc(r.label)} ▾</button>`
        : `<button class="sc-remote sc-connect" data-gact="connect">not on GitHub · connect</button>`) +
      (isOff('scm:off', 'pr') || !r?.github ? '' : `<span class="grow"></span>${prSlot()}`),
  );
  const net = q('.sc-net'), can = !!r && !i.detached && i.commits;
  net.hidden = !can;
  if (!can) return;
  const up = !!i.upstream, slot = (show: boolean, html: string) => (show ? html : html.replace('class="', 'class="none '));
  const when = i.fetchError ? 'no answer' : i.fetchedAt ? since(i.fetchedAt) : 'not checked';
  setHtml(
    net,
    (isOff('scm:off', 'check')
      ? '<span class="sc-when"></span>'
      : `<button class="sc-chk" data-gact="fetch" title="Check now&#10;Asks the remote for new commits now." aria-label="check the remote now"${busy ? ' disabled' : ''}>⟳</button>` +
        `<span class="sc-when${i.fetchError ? ' warn' : ''}" title="${esc(i.fetchError ? `No answer\n${r.label} did not answer when asked for new commits.\n${i.fetchError}` : `${when === 'not checked' ? 'Not checked yet' : when === 'now' ? 'Checked just now' : `Checked ${when} ago`}\nWhen ${r.label} was last asked for new commits.\n\nIt is asked every few minutes while this panel shows.`)}">${esc(when)}</span>`) +
      (isOff('scm:off', 'pull')
        ? ''
        : slot(up && i.behind > 0, `<button class="outline sc-io" data-gact="down" title="${esc(`Pull\nGets ${plural(i.behind, 'commit')} from ${r.label}.`)}"${busy ? ' disabled' : ''}>↓${i.behind}</button>`) +
          slot(up && i.ahead > 0, `<button class="outline sc-io" data-gact="up" title="${esc(`Push\nSends ${plural(i.ahead, 'commit')} to ${r.label}.`)}"${busy ? ' disabled' : ''}>↑${i.ahead}</button>`)) +
      (isOff('scm:off', 'sync')
        ? ''
        : slot(!up || i.ahead > 0 || i.behind > 0, `<button class="outline sc-sync" data-gact="sync" ${busy ? 'disabled' : ''} title="${esc(!up ? `Publish\nPushes this branch to ${r.label} for the first time.` : `Sync\nPulls first, then pushes: ${plural(i.behind, 'commit')} down, ${plural(i.ahead, 'commit')} up.`)}">${up ? 'sync' : 'publish'}</button>`)),
  );
}

function prSlot() {
  const p = G.pr, i = G.info;
  if (!p || (!p.n && !p.none)) return '<span class="sc-pr"></span>';
  if (p.none) return i.upstream ? `<button class="sc-pr new" data-gact="newpr">open PR</button>` : '<span class="sc-pr"></span>';
  const mark = ({ pass: '✓', fail: '✗', running: '●' } as Record<string, string>)[p.roll || ''] || '';
  const tip = `#${p.n} ${p.title || ''}\n${p.roll === 'fail' ? 'A check fails.' : p.roll === 'running' ? 'Checks are running.' : p.roll === 'pass' ? 'Checks pass.' : 'No checks.'}${p.review ? ' ' + ({ approved: 'It is approved.', changes: 'Changes are asked.', waiting: 'It waits for a review.' } as Record<string, string>)[p.review] : ''}\n\nClick to open it.`;
  return `<button class="sc-pr${p.roll && p.roll !== 'none' ? ' r-' + p.roll : ''}" data-gact="openpr" title="${esc(tip)}">#${p.n}${mark ? ` <b>${mark}</b>` : ''}</button>`;
}

export function drawNote() {
  const i = G.info, busy = !!G.busy, st = i.state;
  const q = (s: string) => panel.querySelector<any>(s);
  const split = !st && !!i.upstream && i.ahead > 0 && i.behind > 0, how = pullHow();
  let text = '';
  const btns: string[][] = [];
  let lfs = false;
  if (busy) {
    text = G.progress ? `${G.busy} ${G.progress}` : G.busy;
    if (G.long) btns.push(['cancel', 'stop', 'Stop\nStops what git is doing.']);
  } else {
    text = G.note;
    if (G.fix && FIX[G.fix]) btns.push(FIX[G.fix]);
    if (G.detail) btns.push(['details', 'details', 'Details\nEverything git said.']);
    if (st === 'rebase' || st === 'pick' || st === 'revert') {
      const word = { rebase: 'Rebase', pick: 'Cherry-pick', revert: 'Revert' }[st as 'rebase'], low = word.toLowerCase();
      text ||= `${word}${st === 'rebase' && i.steps ? ` ${i.step} of ${i.steps}` : ''} stopped: fix the C files`;
      btns.push(['go', 'continue', `Continue\nThe conflicts are fixed: goes on with the ${low}.`], ['skip', 'skip', 'Skip\nLeaves out the commit that clashes and goes on.'], ['abort', 'abort', `Abort\nUndoes the ${low}, back to before it began. It asks first.`]);
    } else if (st === 'unstash') {
      text ||= 'Your changes clash with what came in: fix the C files';
      btns.push(['go', 'done', 'Done\nThe files are fixed: keeps them as changes not yet committed.'], ['abort', 'put back', 'Put back\nPuts the clashing files back as they came in. Your changes stay in the stash list.']);
    } else if (st === 'merge') {
      text ||= 'Merging: fix the files marked C, then commit.';
      btns.push(['abort', 'abort', 'Abort\nUndoes the merge, back to before it began. It asks first.']);
    } else if (i.detached && !G.err) {
      text ||= `Looking at ${i.branch}, not on a branch`;
      if (i.back) btns.push(['back', `back to ${i.back}`, `Back to ${i.back}\nSwitches to ${i.back} again. Your branch is where you left it.`]);
    } else if (!text && i.lfs === 'missing') {
      text = "Uses Git LFS, which isn't installed: its big files are only pointers here.";
      lfs = true;
    } else if (split && (!how || G.fix === 'choose')) {
      if (!G.err) text = 'Both sides have new commits: pull by';
      btns.push(['rebase', 'rebase', 'Rebase\nPuts your commits on top of theirs.\n\nThe choice is remembered for this project.'], ['merge', 'merge', 'Merge\nJoins both with a merge commit.\n\nThe choice is remembered for this project.']);
    } else if (split && !text) {
      text = `Both sides have new commits: pull will ${how}.`;
      if (!i.pullMode) btns.push(['again', 'change', 'Change\nLets you pick rebase or merge again.']);
    }
  }
  const note = q('.sc-say .sc-note');
  note.textContent = text;
  note.title = text;
  note.dataset.tipCut = '';
  note.classList.toggle('err', !busy && G.err);
  note.classList.toggle('busy', busy);
  setHtml(q('.sc-do'), btns.map((b) => btn(b, busy && b[0] !== 'cancel')).join('') + (lfs ? '<a class="sc-b" href="https://git-lfs.com" target="_blank" rel="noopener" title="Get it&#10;Opens git-lfs.com, to install Git LFS.&#10;&#10;Then run git lfs pull here.">get it</a>' : ''));
}
