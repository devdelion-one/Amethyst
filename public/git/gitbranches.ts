import { filesChanged } from '../app/actions.ts';
import { ask, bands, ICONS, menuHead, popMenu } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { $, esc } from '../base/util.ts';
import { S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { openBranch } from './gitviews.ts';
import { moveCommits } from './githead.ts';
import { plural } from '../base/words.ts';
import { G, files, gitRow, gapi, doing, post, say, okWhileWorking } from './gitstate.ts';

type Branch = { name: string; at: number; upstream: string; ahead: number; behind: number; gone: boolean };
const go = async (word: string, body: { do?: string; [k: string]: unknown }) => (!['switch', 'merge', 'rebase', undefined].includes(body.do) || (await okWhileWorking(word === 'switching…' ? 'Switching' : body.do === 'merge' ? 'Merging' : 'Rebasing'))) && doing(word, post('/api/git/branch', body), filesChanged);
const BRANCH_IC: Record<string, () => string> = { switch: () => icon('chev'), merge: () => icon('branch'), rebase: () => icon('up'), what: () => icon('eye'), new: () => icon('plus'), folder: () => icon('folder'), move: () => icon('move'), rename: () => ICONS.rename, delete: () => ICONS.bin, push: () => icon('up'), release: () => icon('send') };
const mi = (act: string, label: string, note = '', off = false) => gitRow(`data-gb="${act}"`, (BRANCH_IC[act] || (() => ICONS.blank))(), label, note, off);

async function switchTo(name: string) {
  const n = files().length;
  let changes = 'carry';
  if (n) {
    const pick = await ask({
      title: `Switch to ${name} with ${plural(n, 'changed file')}?`,
      text: `Bring them along: they come with you to ${name} (git refuses if they clash with it).\n\nStash them here: they wait on ${G.info.branch} and come back when you switch back.`,
      choices: [{ label: 'bring them along', value: 'carry' }, { label: 'stash them here', value: 'stash' }],
    });
    if (!pick) return;
    changes = pick;
  }
  go('switching…', { name, changes });
}
async function newBranch(from?: string) {
  const start = (await gapi('GET', '/api/git/branch-names').catch(() => null))?.examples?.new || '';
  const name = await ask({ title: from ? `New branch from ${from}` : 'New branch', text: from ? `It starts at ${from}; your changes come along.` : 'It starts where you are now, and your changes come along.', value: start, placeholder: 'its name, e.g. new-look' });
  if (name) go('making the branch…', { do: 'create', name, from });
}
async function rename(name: string) {
  const to = await ask({ title: `Rename ${name}`, text: 'Only on this PC: a branch already pushed keeps its old name on the remote.', value: name, placeholder: 'its new name' });
  if (to && to !== name) go('renaming…', { do: 'rename', name, to });
}
async function remove(name: string) {
  if (!(await ask({ title: `Delete the branch ${name}?`, text: 'Only on this PC: the remote keeps its copy, if it has one.', confirm: true }))) return;
  try {
    say((await gapi('POST', '/api/git/branch', { do: 'delete', name })).line);
  } catch (e: any) {
    if (e.fix !== 'force') return say(e.message, true);
    if (await ask({ title: `Delete ${name} with its commits?`, text: e.message, warn: "This can't be undone from here.", confirm: true })) go('deleting…', { do: 'delete', name, force: true });
  }
}

function oneMenu(x: number, y: number, name: string, ref: string, local: boolean) {
  const cur = G.info.branch, here = local && name === cur && !G.info.detached, lone = G.info.detached;
  const rows =
    (here
      ? mi('new', 'new branch from here…') + (G.info.upstream && G.info.ahead ? mi('move', 'move my commits to a new branch…', `the ${G.info.ahead} not pushed; ${name} goes back to the remote's`) : '') + mi('rename', 'rename…')
      : mi('switch', 'switch to it') +
        mi('merge', `merge it into ${cur}`, 'its commits come here', lone) +
        mi('rebase', `rebase ${cur} onto it`, 'your commits go on top of it', lone) +
        mi('what', "show what's on it", 'its commits and files against main') +
        mi('new', 'new branch from it…') +
        mi('folder', 'open it in its own folder', 'a worktree, as a project of its own') +
        (local ? `<div class="sep"></div>` + mi('rename', 'rename…') + mi('delete', 'delete…') : ''));
  popMenu(x, y, menuHead(icon('branch'), ref) + bands({ actions: rows }), (el: HTMLElement) => {
    const act = el.dataset.gb;
    if (act === 'switch') switchTo(name);
    else if (act === 'new') newBranch(here ? undefined : ref);
    else if (act === 'rename') rename(name);
    else if (act === 'move') moveCommits();
    else if (act === 'delete') remove(name);
    else if (act === 'merge') go('merging…', { do: 'merge', name: ref });
    else if (act === 'rebase') go('rebasing…', { do: 'rebase', name: ref });
    else if (act === 'folder') inFolder(local ? name : ref);
    else if (act === 'what') openBranch(ref);
  });
}

async function inFolder(branch: string) {
  const here = S.projects.find((p) => p.id === S.pid)?.name || 'project';
  doing(`opening ${branch} in its own folder…`, post('/api/git/worktree', { branch }), (r: any) => r.path && page.addProject({ name: `${here} · ${branch.replace(/^(origin|upstream)\//, '')}`, path: r.path }));
}

async function newTag(push: boolean) {
  const name = await ask({ title: push ? `Tag this commit and push it to ${G.info.remote.label}` : 'Tag this commit', text: 'A name that stays on the commit you are on, usually a version.', placeholder: 'e.g. v1.2.0' });
  if (name) doing(push ? 'tagging and pushing…' : 'tagging…', post('/api/git/tag', { name, push }));
}
function tagMenu(x: number, y: number, tags: string[]) {
  const html = `<div class="ml">tags</div>` + (tags.length ? tags.map((t) => `<button class="mi" data-gtag="${esc(t)}">${esc(t)}</button>`).join('') : '<button class="mi" disabled>no tags yet</button>') + `<div class="sep"></div><button class="mi" data-gtag="" data-gnew="here">+ tag this commit…</button>` + (G.info.remote ? `<button class="mi" data-gtag="" data-gnew="push">+ tag it and push…</button>` : '');
  popMenu(x, y, html, (el: HTMLElement) => {
    const t = el.dataset.gtag;
    if (!t) return newTag(el.dataset.gnew === 'push');
    const remote = G.info.remote;
    popMenu(x, y, `<div class="ml">${esc(t)}</div>` + mi('new', 'new branch from it…') + mi('folder', 'open it in its own folder', 'a worktree, as a project of its own') + (remote ? mi('push', `push it to ${remote.label}`) + (remote.github ? mi('release', 'make a GitHub release…', 'notes written by GitHub') : '') : '') + `<div class="sep"></div>` + mi('delete', 'delete…'), async (m: HTMLElement) => {
      const act = m.dataset.gb;
      if (act === 'new') newBranch(t);
      else if (act === 'folder') inFolder(t);
      else if (act === 'release') {
        if (await ask({ title: `Release ${t} on GitHub?`, text: `The tag is pushed if it isn't yet, and GitHub publishes the release ${t} with notes it writes from the pull requests since the last one.`, confirm: true })) doing('making the release…', post('/api/gh/release', { tag: t }));
      } else if (act === 'push') doing('pushing the tag…', post('/api/git/tag', { name: t, do: 'push' }));
      else if (act === 'delete') {
        const r = await ask({ title: `Delete the tag ${t}?`, text: 'Its commit stays.', tick: remote ? `also on ${remote.label}` : null, confirm: true });
        if (r) doing('deleting the tag…', post('/api/git/tag', { name: t, do: 'delete', push: typeof r === 'object' && !!r.tick }));
      }
    });
  });
}

export async function branchMenu(btn: HTMLElement) {
  let r: { local: Branch[]; remote: string[]; tags: string[] };
  try {
    r = await gapi('GET', '/api/git/branches');
  } catch (e: any) {
    return say(e.message, true);
  }
  const cur = G.info.branch, b = btn.getBoundingClientRect(), x = b.left, y = b.bottom + 4;
  const dots = '<span class="k sc-dots" data-gmore>⋯</span>';
  const track = (l: Branch) => (l.gone ? 'gone on the remote' : [l.name === cur ? 'here' : '', l.ahead ? `↑${l.ahead}` : '', l.behind ? `↓${l.behind}` : ''].filter(Boolean).join(' '));
  const html =
    `<div class="ml">switch to</div>` +
    r.local.map((l) => `<button class="mi ${l.name === cur ? 'on' : ''}" data-gbr="${esc(l.name)}" data-gref="${esc(l.name)}" data-glocal>${esc(l.name)}<span class="d">${esc(track(l))}</span>${dots}</button>`).join('') +
    r.remote.map((ref) => `<button class="mi" data-gbr="${esc(ref.slice(ref.indexOf('/') + 1))}" data-gref="${esc(ref)}">${esc(ref.slice(ref.indexOf('/') + 1))}<span class="d">on ${esc(ref.slice(0, ref.indexOf('/')))}</span>${dots}</button>`).join('') +
    `<div class="sep"></div><button class="mi" data-gbrnew>+ new branch<span class="d">from here, with your changes</span></button>` +
    `<button class="mi" data-gtags>tags…<span class="d">${r.tags.length ? r.tags[0] : 'none yet'}</span></button>`;
  const m = $('#colormenu');
  let more = false;
  const press = (e: Event) => (more = e.type === 'contextmenu' || !!(e.target as Element).closest('[data-gmore]'));
  const menu = (e: MouseEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-gbr]');
    if (!row) return;
    e.preventDefault();
    press(e);
    row.click();
  };
  m.addEventListener('pointerdown', press, true);
  m.addEventListener('contextmenu', menu);
  m.addEventListener('menuclose', () => (m.removeEventListener('pointerdown', press, true), m.removeEventListener('contextmenu', menu)), { once: true });
  popMenu(x, y, html, (el: HTMLElement) => {
    if ('gbrnew' in el.dataset) return newBranch();
    if ('gtags' in el.dataset) return tagMenu(x, y, r.tags);
    const name = el.dataset.gbr!;
    if (more) return oneMenu(x, y, name, el.dataset.gref!, 'glocal' in el.dataset);
    if (name !== cur || G.info.detached) switchTo(name);
  });
}
