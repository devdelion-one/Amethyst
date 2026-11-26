import { dirGem, dirLabel, inboxLoc, inboxTint, projectOf, S, tintOf } from '../base/model.ts';
import { gem, NAME } from '../base/kinds.ts';
import { tell } from '../base/notify.ts';
import { setPref } from '../base/prefs.ts';
import { fit, rank, type Rankable } from '../base/rank.ts';
import { $, esc } from '../base/util.ts';
import { litOnHover } from '../base/roving.ts';

interface Row extends Rankable {
  dir: string;
  pin?: 'inbox' | 'project';
  html: string;
}

const box = $<HTMLElement>('#fpick');
const head = box.querySelector<HTMLElement>('.fp-t')!;
const tick = box.querySelector<HTMLInputElement>('.fp-tick input')!;
const inp = box.querySelector<HTMLInputElement>('.fp-q')!;
const list = box.querySelector('ul')!;
let pins: Row[] = [], folders: Row[] = [], hits: Row[] = [], at = 0, back: HTMLElement | null = null, settle: ((dir: string | null) => void) | null = null;

const row = (gemHtml: string, tint: string, name: string, where: string) => `<i class="gl" style="--tc:${esc(tint)}">${gemHtml}</i><span class="nm">${esc(name)}</span><span class="pa">${esc(where)}</span>`;

function rows() {
  const pj = S.dirs.get('');
  pins = [];
  if (S.inbox) pins.push({ dir: inboxLoc(), pin: 'inbox', name: NAME.inbox.toUpperCase(), rest: 'inbox', html: row(gem('inbox'), inboxTint(), NAME.inbox.toUpperCase(), '') });
  if (pj) pins.push({ dir: '', pin: 'project', name: pj.name, rest: '/ project', html: row(dirGem(pj), tintOf(pj), pj.name || projectOf(S.pid)?.name || 'project', 'the project') });
  folders = [...S.dirs.values()]
    .filter((c) => c.path && !c.missing && c !== S.inbox)
    .map((c) => ({ dir: c.path, name: c.name, rest: c.path, touched: Math.max(0, ...c.thoughts.map((t) => t.touched || 0)), html: row(dirGem(c), tintOf(c), c.name, c.parent ? dirLabel(c.parent) : '') }));
}

function folderHits(q: string) {
  q = q.trim().toLowerCase();
  return [...pins.filter((p) => !q || fit(q, p) >= 0), ...rank(folders, q)];
}

function find() {
  hits = folderHits(inp.value);
  at = 0;
  draw();
}
function draw(follow = false) {
  list.innerHTML = hits.map((r, i) => `<li class="${i === at ? 'on' : ''}${r.pin && !hits[i + 1]?.pin ? ' fp-last' : ''}" data-i="${i}">${r.html}</li>`).join('') || `<li class="none">no folder by that name</li>`;
  if (follow) list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  else list.scrollTop = 0;
  tick.disabled = !hits[at]?.pin;
}

function close(dir: string | null) {
  box.hidden = true;
  document.removeEventListener('keydown', onKey, true);
  const done = settle;
  settle = null;
  if (dir === null) back?.focus?.();
  back = null;
  done?.(dir);
}
function pick(i: number) {
  const r = hits[i];
  if (!r) return;
  if (tick.checked && r.pin) setPref('newfile:to', r.pin);
  close(r.dir);
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close(null);
  else if (e.key === 'Enter') pick(at);
  else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && hits.length) {
    at = (at + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    draw(true);
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

export function pickFolder(ext = ''): Promise<string | null> {
  if (settle) close(null);
  back = document.activeElement as HTMLElement | null;
  document.addEventListener('keydown', onKey, true);
  head.textContent = `new ${ext ? ext + ' ' : ''}file in`;
  tick.checked = false;
  rows();
  inp.value = '';
  box.hidden = false;
  find();
  inp.focus();
  return new Promise((resolve) => (settle = resolve));
}

inp.addEventListener('input', find);
box.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const li = t.closest<HTMLElement>('li[data-i]');
  if (li) return pick(+li.dataset.i!);
  if (t.closest('.fp-tick') && tick.disabled) return tell(t.closest('.fp-tick'), { title: 'only the inbox or the project folder', line: 'pick one of those two to go straight there next time' });
  if (t === box) close(null);
});
box.addEventListener('change', () => inp.focus());
litOnHover(list, 'i', () => at, (i) => {
  at = i;
  tick.disabled = !hits[at]?.pin;
});
