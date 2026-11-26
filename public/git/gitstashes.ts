import { filesChanged } from '../app/actions.ts';
import { ask, bands, ICONS, menuHead, popMenu } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { esc, store } from '../base/util.ts';
import { isOff } from '../base/prefs.ts';
import { G, gitRow, panel, gapi, doing, post, say, draw } from './gitstate.ts';
import { openChange, fileRows, since } from './gitviews.ts';

type Stash = { id: string; sha: string; name: string; on: string; kept: string; at: number };
type Kept = { path: string; x: string; from?: string; a: string | null; b: string };
const T = { list: [] as Stash[], sig: '', err: '', open: '', files: new Map<string, Kept[]>() };

export const STASH_HTML = `<button type="button" class="sc-fh sc-sh" data-gact="sfold"><span class="cv">▸</span><span>stashes</span><span class="n"></span></button>
      <div class="sc-sts"></div>`;

const isOpen = () => !!store.get('git:stashOpen', false);
export function foldStashes() {
  store.set('git:stashOpen', !isOpen());
}
const labelOf = (s: Stash) => (s.kept ? `left on ${s.kept}` : s.name || 'changes');

async function fetchList(sig: string) {
  try {
    const r = await gapi('GET', '/api/git/stashes');
    if (sig !== T.sig) return;
    T.list = r.list;
    T.err = '';
  } catch (e: any) {
    if (sig !== T.sig) return;
    T.err = e.message;
  }
  draw();
}

const row = (s: Stash) => {
  const open = T.open === s.sha, files = open ? T.files.get(s.sha) : null;
  return `<div class="sc-st${open ? ' on' : ''}" data-gst="${esc(s.sha)}"><span class="cv">${open ? '▾' : '▸'}</span><span class="nm">${esc(labelOf(s))}</span><span class="dir">${esc(s.on)}</span><span class="sc-age">${esc(since(s.at))}</span><button type="button" class="sc-b sc-dots" data-gstm="${esc(s.sha)}" aria-label="more for this stash">⋯</button></div>` + (open ? `<div class="sc-stf">${files ? (files.length ? fileRows(files) : '<p class="dim sc-more">no files</p>') : '<p class="dim sc-more">…</p>'}</div>` : '');
};

export function drawStashes(setHtml: (el: Element, html: string) => void) {
  const head = panel.querySelector<HTMLElement>('.sc-sh'), box = panel.querySelector<HTMLElement>('.sc-sts');
  if (!head || !box) return;
  const off = isOff('scm:off', 'stashes'), on = isOpen(), n = G.info?.stashes || 0;
  head.hidden = off;
  box.hidden = off || !on;
  head.querySelector('.cv')!.textContent = on ? '▾' : '▸';
  head.querySelector('.n')!.textContent = n ? String(n) : '';
  head.title = `Stashes\nChanges put aside: by Stash all changes in the changes menu, by a branch switch that left them behind, or by git stash in a terminal. Click to ${on ? 'fold' : 'show'} them.`;
  head.dataset.tipIcon = on ? 'chevDown' : 'chev';
  if (off || !on || !G.info?.repo) return;
  const sig = [G.key, G.repo, n, G.info.head?.hash].join('|');
  if (sig !== T.sig) {
    T.sig = sig;
    fetchList(sig);
  }
  if (T.err) return setHtml(box, `<p class="err sc-more">${esc(T.err)}</p>`);
  setHtml(box, T.list.length ? T.list.map(row).join('') : '<p class="dim sc-more">Nothing is put aside. “stash all changes…” in the changes menu (⋯) puts them here.</p>');
}

async function unfold(s: Stash) {
  if (T.open === s.sha) {
    T.open = '';
    return draw();
  }
  T.open = s.sha;
  draw();
  if (T.files.has(s.sha)) return;
  try {
    const r = await gapi('GET', `/api/git/stash?id=${encodeURIComponent(s.id)}`);
    T.files.set(s.sha, r.files);
  } catch (e: any) {
    T.open = '';
    say(e.message, true);
  }
  draw();
}

function menu(s: Stash, x: number, y: number) {
  const mi = (act: string, ic: string, label: string, note: string) => gitRow(`data-gs="${act}"`, ic, label, note);
  popMenu(x, y, menuHead(ICONS.archive, labelOf(s)) + bands({ actions: mi('files', icon('folder'), T.open === s.sha ? 'fold its files' : 'show its files', 'each opens what it changed') + mi('pop', ICONS.reset, 'bring it back', 'onto the files as they are now') + `<div class="sep"></div>` + mi('drop', ICONS.bin, 'drop it…', 'throw these changes away') }), async (b: HTMLElement) => {
    const act = b.dataset.gs;
    if (act === 'files') return unfold(s);
    if (act === 'pop') return doing('bringing the changes back…', post('/api/git/stash', { do: 'pop', id: s.id }), filesChanged);
    if (act === 'drop' && (await ask({ title: `Drop the stash “${labelOf(s)}”?`, text: "Its changes are thrown away. This can't be undone.", confirm: true }))) doing('dropping the stash…', post('/api/git/stash', { do: 'drop', id: s.id }));
  });
}

const stashOf = (el: Element | null) => T.list.find((s) => s.sha === el?.closest<HTMLElement>('[data-gst]')?.dataset.gst);

export function stashClick(t: HTMLElement): boolean {
  if (!t.closest('.sc-sts')) return false;
  const dots = t.closest<HTMLElement>('[data-gstm]');
  if (dots) {
    const s = stashOf(dots), r = dots.getBoundingClientRect();
    if (s) menu(s, r.right - 200, r.bottom + 4);
    return true;
  }
  const f = t.closest<HTMLElement>('[data-gvf]');
  if (f) {
    const file = T.files.get(T.open)?.find((k) => k.path === f.dataset.gvf);
    if (file) openChange(file, file.a, file.b, 'stash');
    return true;
  }
  const s = stashOf(t);
  if (s) unfold(s);
  return true;
}

export function wireStashes() {
  panel.querySelector<HTMLElement>('.sc-sts')!.addEventListener('contextmenu', (e) => {
    const s = stashOf(e.target as Element);
    if (!s) return;
    e.preventDefault();
    e.stopPropagation();
    menu(s, e.clientX, e.clientY);
  });
}
