import { api, S } from '../base/model.ts';
import { ask, popMenu } from '../base/controls.ts';
import { esc, quietly, setSave, showErr } from '../base/util.ts';
import { page } from '../base/page.ts';

type Mine = { name: string; private: boolean; at: number; desc: string };
const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
const under = (parent: string, name: string) => parent.replace(/[\\/]+$/, '') + (parent.includes('\\') ? '\\' : '/') + name.replace(/[\\/:*?"<>|]/g, ' ').trim();
const nameOf = (addr: string) =>
  addr
    .trim()
    .replace(/[\\/]+$/, '')
    .split(/[\\/:]/)
    .pop()!
    .replace(/\.git$/i, '') || '';
const SHOWN = 12;

function since(at: number) {
  const d = Math.floor((Date.now() - at) / 86400e3);
  return d < 1 ? 'today' : d < 60 ? `${d} d ago` : `${Math.floor(d / 30)} mo ago`;
}

async function cloneInto(value = '') {
  const r = await ask({
    title: 'project from git',
    text: 'A copy of a repository on this PC, with its whole history, as a new project. Its submodules come along.',
    label: 'address',
    value,
    about: 'The repository to copy: https://github.com/owner/repo, git@github.com:owner/repo.git, or owner/repo for GitHub.',
    placeholder: 'https://github.com/owner/repo, or owner/repo',
    folder: {
      follow: (addr) => under(S.wsSuggest, nameOf(addr) || 'repository'),
      pick: DESKTOP && ((at) => DESKTOP.pickFolder({ title: 'where the copy goes', defaultPath: at })),
      about: 'A new, empty folder: the copy goes in it.',
    },
  });
  if (!r) return;
  let poll = 0;
  const watch = () =>
    (poll = window.setTimeout(async () => {
      const d = await quietly(api('GET', `/api/git/doing?at=${encodeURIComponent(r.path)}`), null);
      if (d?.line) setSave(`cloning ${nameOf(r.name)}… ${d.line}`);
      watch();
    }, 700));
  setSave(`cloning ${nameOf(r.name)}…`);
  watch();
  try {
    const c = await api('POST', '/api/git/clone', { url: r.name, into: r.path, add: false });
    clearTimeout(poll);
    await page.addProject({ name: nameOf(r.name), path: c.path });
    if (c.lfs === 'missing') setSave("cloned · it uses Git LFS, which isn't installed: its big files are only pointers (git-lfs.com)", true);
  } catch (e) {
    clearTimeout(poll);
    setSave('');
    showErr(e);
  }
}

export async function cloneProject() {
  const r = await quietly(api('GET', '/api/gh/repos'), null);
  const list: Mine[] = r?.list || [];
  if (!list.length) return cloneInto();
  const x = Math.round(innerWidth / 2 - 160), y = 96;
  const html =
    `<div class="ml">project from git</div>` +
    list.slice(0, SHOWN).map((m) => `<button class="mi" data-gclone="${esc(m.name)}" ${m.desc ? `title="${esc(`${m.name}\n${m.desc}\nClick to copy it to this PC as a new project. It asks where the copy goes first.`)}"` : ''}>${esc(m.name)}<span class="d">${m.private ? 'private · ' : ''}${since(m.at)}</span></button>`).join('') +
    `<div class="sep"></div><button class="mi" data-gclone="">an address…<span class="d">any repository</span></button>`;
  popMenu(x, y, html, (el: HTMLElement) => cloneInto(el.dataset.gclone || ''));
}
