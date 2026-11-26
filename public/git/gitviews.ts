import * as groups from '../app/groups.ts';
import * as tabs from '../app/tabs.ts';
import { popMenu } from '../base/controls.ts';
import { esc, showErr } from '../base/util.ts';
import { plural } from '../base/words.ts';
import { G, gapi, say } from './gitstate.ts';
import { page } from '../base/page.ts';

export type Commit = { hash: string; short: string; parents: string[]; author: string; email: string; at: number; refs: string[]; subject: string; body: string; pushed: boolean };
type Changed = { path: string; x: string; from?: string };

export function since(at: number) {
  const m = Math.floor((Date.now() - at) / 60e3);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`;
  if (m < 60 * 24 * 60) return `${Math.floor(m / 1440)}d`;
  return `${Math.floor(m / 43200)}mo`;
}
export const when = (at: number) => new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const inProject = (p: string) => (G.repo ? `${G.repo}/${p}` : p);
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

export async function openChange(f: Changed, a: string | null, b: string | null, label: string) {
  try {
    const q = `path=${encodeURIComponent(f.path)}${f.from ? '&from=' + encodeURIComponent(f.from) : ''}&a=${a || 'none'}&b=${b || 'disk'}`;
    const d = await gapi('GET', `/api/git/diff?${q}`);
    if (d.binary) return say(`${f.path} isn't text: no diff to show`);
    const at = inProject(f.path), cut = at.lastIndexOf('/') + 1;
    const open = groups.openDiff || ((x: any) => x.rel && tabs.openInTab(x.rel));
    open({ path: `${at.slice(0, cut)}${label} · ${at.slice(cut)}`, rel: f.x === 'D' ? null : at, oldText: d.oldText, newText: d.newText });
  } catch (e: any) {
    say(e.message, true);
  }
}

export const fileRows = (files: Changed[]) =>
  files.map((f) => `<button class="gv-f" data-gvf="${esc(f.path)}"><span class="sc-x x-${f.x}">${f.x}</span><span class="nm">${esc(nameOf(f.path))}</span><span class="dir">${esc(f.path.slice(0, Math.max(0, f.path.lastIndexOf('/'))))}</span></button>`).join('');

export const refChips = (refs: string[]) => refs.map((r) => `<span class="gv-ref${r.startsWith('#') ? ' tag' : r.includes('/') ? ' far' : ''}">${esc(r.replace(/^#/, ''))}</span>`).join('');

function shell(html: string) {
  const el = document.createElement('div');
  el.className = 'gv';
  el.innerHTML = html;
  return el;
}

export function openCommit(hash: string) {
  const key = `commit:${G.key}:${G.repo}:${hash}`;
  groups.openPane(key, `${hash.slice(0, 7)} · commit`, () => {
    const el = shell('<p class="dim gv-wait">reading the commit…</p>');
    gapi('GET', `/api/git/show?hash=${encodeURIComponent(hash)}`)
      .then((c: Commit & { files: Changed[] }) => {
        const parent = c.parents[0] || null;
        el.innerHTML = `<div class="gv-head"><h2>${esc(c.subject)}</h2><p class="gv-meta"><b>${esc(c.short)}</b> ${refChips(c.refs)} · ${esc(c.author)} &lt;${esc(c.email)}&gt; · ${esc(when(c.at))}${c.parents.length > 1 ? ` · a merge: its files against ${esc(c.parents[0].slice(0, 7))}` : ''}</p>${c.body ? `<pre class="gv-body">${esc(c.body)}</pre>` : ''}</div>
          <div class="gv-sec"><span class="gv-h">${plural(c.files.length, 'file')}</span></div><div class="gv-files">${fileRows(c.files)}</div>`;
        el.addEventListener('click', (e) => {
          const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gvf]');
          const f = b && c.files.find((x) => x.path === b.dataset.gvf);
          if (f) openChange(f, parent, c.hash, c.short);
        });
      })
      .catch((e: Error) => (el.innerHTML = `<p class="err gv-wait">${esc(e.message)}</p>`));
    return { el };
  });
}

export function openBranch(ref: string, base?: string) {
  const key = `branch:${G.key}:${G.repo}:${ref}:${base || ''}`;
  groups.openPane(key, `${ref} · branch`, () => {
    const el = shell('<p class="dim gv-wait">comparing…</p>');
    let data: any = null;
    const draw = async () => {
      try {
        data = await gapi('GET', `/api/git/compare?ref=${encodeURIComponent(ref)}${base ? '&base=' + encodeURIComponent(base) : ''}`);
      } catch (e: any) {
        el.innerHTML = `<p class="err gv-wait">${esc(e.message)}</p>`;
        return;
      }
      const d = data;
      el.innerHTML = `<div class="gv-head"><h2>What's on ${esc(ref)}</h2><p class="gv-meta">against <b>${esc(d.base)}</b> · ${plural(d.commits.length, 'commit')} ahead${d.behind ? `, ${d.behind} behind` : ''} · ${plural(d.files.length, 'file')} changed</p>
          <div class="gv-acts">${G.info?.remote?.github && !/^(main|master)$/.test(ref) ? '<button class="outline" data-gva="pr" title="Open PR&#10;Opens a pull request from this branch. It is pushed first if GitHub doesn\'t have it yet.">open PR</button>' : ''}<button class="outline" data-gva="chat">→ chat</button><button data-gva="again">⟳</button></div></div>
        <div class="gv-sec"><span class="gv-h">commits</span></div>
        <div class="gv-commits">${d.commits.map((c: Commit) => `<button class="gv-c" data-gvc="${esc(c.hash)}"><span class="gv-sh">${esc(c.short)}</span><span class="nm">${esc(c.subject)}</span><span class="dir">${esc(c.author)} · ${since(c.at)}</span></button>`).join('') || '<p class="dim">nothing that isn’t in the base</p>'}</div>
        <div class="gv-sec"><span class="gv-h">files, against where it began</span></div>
        <div class="gv-files">${fileRows(d.files)}</div>`;
    };
    el.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement, d = data;
      if (!d) return;
      const f = t.closest<HTMLElement>('[data-gvf]');
      if (f) return openChange(d.files.find((x: Changed) => x.path === f.dataset.gvf), d.fork, d.tip, ref.replace(/[\\/]/g, '-'));
      const c = t.closest<HTMLElement>('[data-gvc]');
      if (c) return openCommit(c.dataset.gvc!);
      const a = t.closest<HTMLElement>('[data-gva]')?.dataset.gva;
      if (a === 'again') return draw();
      if (a === 'pr') return page.newPr(ref.replace(/^(origin|upstream)\//, ''));
      if (a === 'chat') {
        const text = `the branch ${ref}${G.repo ? ` (repository ${G.repo})` : ''}: ${plural(d.commits.length, 'commit')} not in ${d.base}${d.behind ? `, ${d.behind} behind it` : ''}:\n${d.commits.map((c: Commit) => `- ${c.short} ${c.subject}`).join('\n')}\nfiles: ${d.files.map((x: Changed) => x.path).join(', ')}`;
        try {
          say(`${ref} → ${await groups.pickToChat({ label: ref, title: `${ref} against ${d.base}`, text })}`);
        } catch (err: any) {
          say(err.message, true);
        }
      }
    });
    draw();
    return { el };
  });
}

export function openBlame(path: string) {
  const key = `blame:${G.key}:${G.repo}:${path}`;
  groups.openPane(key, `${nameOf(path)} · who changed it`, () => {
    const el = shell('<p class="dim gv-wait">reading who changed each line…</p>');
    gapi('GET', `/api/git/blame?path=${encodeURIComponent(path)}`)
      .then((b: { lines: { hash: string; text: string }[]; commits: Record<string, { author: string; at: number; subject: string }> }) => {
        let last = '';
        const rows = b.lines
          .map((l, i) => {
            const c = b.commits[l.hash], first = l.hash !== last, mine = /^0+$/.test(l.hash);
            last = l.hash;
            const who = first ? (mine ? '<span class="gv-sh">not committed</span>' : `<button class="gv-sh" data-gvc="${l.hash}" title="${esc(`${c.subject}\nCommit by ${c.author}, ${when(c.at)}. Click to open it.`)}">${l.hash.slice(0, 7)}</button><span class="gv-who">${esc(c.author)} · ${since(c.at)}</span>`) : '';
            return `<div class="gv-l${first ? ' first' : ''}"><span class="gv-bl">${who}</span><span class="gv-n">${i + 1}</span><code>${esc(l.text) || ' '}</code></div>`;
          })
          .join('');
        el.innerHTML = `<div class="gv-head"><h2>Who changed each line of ${esc(nameOf(path))}</h2><p class="gv-meta">${esc(inProject(path))} · ${plural(Object.keys(b.commits).length, 'commit')}</p></div><div class="gv-blame">${rows}</div>`;
      })
      .catch((e: Error) => (el.innerHTML = `<p class="err gv-wait">${esc(e.message)}</p>`));
    el.addEventListener('click', (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-gvc]');
      if (c) openCommit(c.dataset.gvc!);
    });
    return { el };
  });
}

export async function reflogMenu(x: number, y: number, pick: (hash: string, what: string) => void) {
  try {
    const r = await gapi('GET', `/api/git/reflog?ref=${encodeURIComponent(G.info.detached ? 'HEAD' : G.info.branch)}`);
    const html = `<div class="ml">where ${esc(G.info.detached ? 'HEAD' : G.info.branch)} has been</div>` + (r.list.length ? r.list.slice(0, 30).map((e: any) => `<button class="mi" data-grl="${esc(e.hash)}" title="${esc(`${e.what}\nThe branch was here on ${when(e.at)}. Click to open it, branch from it or reset to it.`)}">${esc(e.what)}<span class="d">${esc(e.short)} · ${since(e.at)}</span></button>`).join('') : '<button class="mi" disabled>nothing yet</button>');
    popMenu(x, y, html, (el: HTMLElement) => pick(el.dataset.grl!, el.textContent || ''));
  } catch (e) {
    showErr(e);
  }
}
