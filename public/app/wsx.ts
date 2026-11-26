import { ask, barMenu, extColors } from '../base/controls.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { dirIcon, extMenu, fileIcon, fileTint, nameHtml, onExtColors, pickExt } from '../base/filelook.ts';
import { api, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { $, esc, showErr, store } from '../base/util.ts';

interface WsDir {
  dir: string;
  entries: { name: string; dir: boolean }[];
  err?: string;
}

let wid: string | null = null, drawn = '', sel = '';
const dirs = new Map<string, WsDir>();
const loading = new Set<string>();
const opened = () => new Set<string>(store.get('wsxOpen', {})[S.wid] || []);
function setOpened(set: Set<string>) {
  const all = store.get('wsxOpen', {});
  all[S.wid] = [...set];
  store.set('wsxOpen', all);
}
const key = (p: string) => String(p).replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
const parentRel = (rel: string) => rel.slice(0, Math.max(rel.lastIndexOf('/'), 0));
const absOf = (rel: string) => {
  const d = dirs.get(parentRel(rel))?.dir || '';
  return d + (d.includes('\\') ? '\\' : '/') + rel.split('/').pop();
};

async function fetchDir(rel: string) {
  if (loading.has(rel)) return;
  loading.add(rel);
  const at = S.wid;
  try {
    const r = await api('GET', '/api/wsdir?path=' + encodeURIComponent(rel), undefined, '');
    if (at === wid) dirs.set(rel, r);
  } catch (e) {
    if (at === wid) dirs.set(rel, { err: (e as Error).message } as WsDir);
  } finally {
    loading.delete(rel);
  }
  renderWsx();
}

export const wxRow = (e: { name: string; dir?: boolean }, p: string, d: number, on: boolean, isPj = false, cur = false) => `<button class="wx-i${e.dir ? ' dir' : ''}${isPj ? ' pj' : ''}${cur ? ' on' : ''}" style="--d:${d}" data-wx="${esc(p)}" role="treeitem"${e.dir ? ` aria-expanded="${on}"` : ''}${isPj ? ' title="Project&#10;A project of this workspace. Click to show or hide its files here."' : ''}><span class="ch">${e.dir ? (on ? '▾' : '▸') : ''}</span><i class="wx-ic"${e.dir ? '' : ` style="${fileTint(e.name)}"`}>${e.dir ? dirIcon(on) : fileIcon()}</i><span class="nm">${e.dir ? esc(e.name) : nameHtml(e.name)}</span></button>`;
export function renderWsx() {
  if (!S.wid || S.pid || !S.ws) return;
  if (wid !== S.wid) {
    wid = S.wid;
    dirs.clear();
    sel = '';
  }
  if (!$('#app').classList.contains('wsx')) return;
  const open = opened(), pj = new Set(S.projects.map((p) => key(p.path)));
  const out = [`<div class="wx-root" title="${esc(S.ws.dir)}&#10;The workspace's folder." data-tip-mono data-tip-icon="workspaces">${esc(S.ws.name)}</div>`];
  const walk = (rel: string, d: number) => {
    const r = dirs.get(rel);
    if (!r) return fetchDir(rel);
    if (r.err) return out.push(`<div class="wx-note">${esc(r.err)}</div>`);
    if (!r.entries.length && !rel) out.push('<div class="wx-note">empty: + file starts one</div>');
    for (const e of r.entries) {
      const p = rel ? `${rel}/${e.name}` : e.name, on = e.dir && open.has(p);
      const isPj = e.dir && pj.has(key(`${r.dir}/${e.name}`));
      out.push(wxRow(e, p, d, on, isPj, p === sel));
      if (on) walk(p, d + 1);
    }
  };
  walk('', 0);
  const html = out.join('');
  if (html !== drawn) $('#wx-tree').innerHTML = drawn = html;
}

function reloadWsx() {
  dirs.clear();
  renderWsx();
}

async function make(folder: boolean) {
  const name = await ask({ title: folder ? 'new folder' : 'new file', text: `In the folder of ${S.ws!.name}.`, value: folder ? '' : 'untitled.md', pick: folder ? null : [0, 8] });
  if (!name) return;
  try {
    const r = await api('POST', '/api/wsfile', { name, folder: !!folder }, '');
    dirs.delete('');
    if (!folder) {
      sel = r.rel.replace(/\\/g, '/');
      await page.openFiles([r.path]);
    }
    renderWsx();
  } catch (e) {
    showErr(e);
  }
}

$<HTMLElement>('#wx-tree').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-wx]');
  if (!b) return;
  const rel = b.dataset.wx!;
  if (b.classList.contains('dir')) {
    const open = opened();
    if (!open.delete(rel)) open.add(rel);
    setOpened(open);
  } else {
    sel = rel;
    page.openFiles([absOf(rel)]);
  }
  renderWsx();
});
const WX = { new: 'wxnew', dir: 'wxdir', fold: 'wxfold', load: 'wxload' };
const paintWx = () => Object.entries(WX).forEach(([k, d]) => ($(`#wsx [data-${d}]`).hidden = isOff('wsx:off', k)));
paintWx();
onPref('wsx:off', paintWx);
onExtColors(renderWsx);
barMenu('#wsx .wx-head', 'wsx', { make: () => ({ pick: ['extensions', extMenu()], other: extColors(), onPick: pickExt, place: 'wsx' }) });
$<HTMLElement>('#wsx .wx-head').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if ('wxnew' in b.dataset) make(false);
  if ('wxdir' in b.dataset) make(true);
  if ('wxfold' in b.dataset) (setOpened(new Set()), renderWsx());
  if ('wxload' in b.dataset) reloadWsx();
});
