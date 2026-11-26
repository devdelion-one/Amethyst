import { IMG_TYPES, pastedImages, readB64 } from '../base/chips.ts';
import { bands, barMenu, chip, copyPicture, ICONS, menuHead, popMenu, rowIcons, viewImage } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { isOff, onPref, pref } from '../base/prefs.ts';
import { api } from '../base/model.ts';
import { notify, tell } from '../base/notify.ts';
import { $, esc } from '../base/util.ts';
import { SOLO, WIN } from '../base/windows.ts';

const MAX = 14 * 1024 * 1024;
const raw = (id: string) => `/api/clips/raw?id=${encodeURIComponent(id)}`;
const COPY = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>';
const TICK = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"/></svg>';
const X = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/></svg>';

const btn = $('#btn-clips');
type Clip = { id: string; kind: string; at: number; text?: string; file?: string };
let list: Clip[] = [], box: HTMLElement = null as unknown as HTMLElement, copied = '';

function dayOf(at: number) {
  const d = new Date(at), now = new Date(), key = (x: Date) => x.toDateString();
  if (key(d) === key(now)) return 'today';
  if (key(d) === key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'yesterday';
  return d.toLocaleDateString();
}

function draw() {
  if (!box) return;
  box.querySelector('.cl-n')!.textContent = (list.length || '') as unknown as string;
  const had = box.contains(document.activeElement);
  let day: string | null = null, odd = true;
  box.querySelector('.cl-list')!.innerHTML = !list.length ? `<div class="cl-empty">${ICONS.clip}<p>Paste or drop a screenshot, a photo or a text.</p><kbd>ctrl v</kbd></div>`
    : `<div class="cl-grid">${list.map((c) => {
      const d = dayOf(c.at);
      if (d !== day) (day = d), (odd = !odd);
      const inner = c.kind === 'image' ? `<img src="${raw(c.id)}" alt="" loading="lazy" draggable="false">` : `<p>${esc(c.text)}</p>`;
      const when = d === 'today' || d === 'yesterday' ? d : `on ${d}`, tip = `${c.kind === 'image' ? esc(c.file) : 'Text'}\nKept ${esc(when)}. Click to copy it.`;
      return `<div class="cl-c${c.kind === 'text' ? ' t' : ''}${odd ? ' odd' : ''}${c.id === copied ? ' done' : ''}" data-clip="${c.id}" title="${tip}">${inner}<button class="cl-rm" data-cl-rm title="Remove\nMoves the clip to removed/ in the clips folder." aria-label="remove">${X}</button><span class="cl-cp">${c.id === copied ? TICK : COPY}</span></div>`;
    }).join('')}</div>`;
  if (had && !box.contains(document.activeElement)) box.focus();
}

const fail = (what: string, e: any) => notify(`${what}: ${esc(e.message)}`);

async function load() {
  try {
    list = (await api('GET', '/api/clips')).clips;
  } catch (e) {
    return fail('couldn’t load the clips', e);
  }
  draw();
}

async function add(body: Record<string, unknown>) {
  try {
    const { clip } = await api('POST', '/api/clips', body);
    list = [clip, ...list];
    draw();
  } catch (e) {
    fail('couldn’t add it', e);
  }
}
async function addFiles(files: File[]) {
  for (const f of files) {
    if (!IMG_TYPES.has(f.type)) tell(box, { title: 'clips keep pictures and text', line: `${f.name || 'that file'} isn't one: png, jpeg, gif or webp only`, ms: 2500 });
    else if (f.size > MAX) tell(box, { title: 'Clips keep pictures up to 14 MB', line: `${f.name || 'that picture'} is bigger: make it smaller first`, ms: 2500 });
    else await add({ name: /^image\.\w+$/i.test(f.name) ? '' : f.name, mimeType: f.type, data: await readB64(f) });
  }
}

async function copy(id: string) {
  const c = list.find((x) => x.id === id);
  if (!c) return;
  try {
    if (c.kind === 'image') await copyPicture(raw(id));
    else await navigator.clipboard.writeText((await api('GET', `/api/clips/text?id=${id}`)).text);
  } catch (e) {
    return fail('couldn’t copy it', e);
  }
  copied = id;
  draw();
  setTimeout(() => copied === id && ((copied = ''), draw()), 1500);
}

async function remove(id: string) {
  try {
    await api('POST', '/api/clips/remove', { id });
  } catch (e) {
    return fail('couldn’t remove it', e);
  }
  list = list.filter((x) => x.id !== id);
  draw();
}

function place() {
  const b = btn.getBoundingClientRect();
  box.style.right = Math.max(8, innerWidth - b.right) + 'px';
  box.style.bottom = innerHeight - $('#status').getBoundingClientRect().top + 6 + 'px';
}

let armed = false;
function away(e: any) {
  if ((e.target as Element).closest?.('#clips, #btn-clips, #colormenu, .img-view')) return (armed = false);
  if (armed) return toggle(false);
  armed = true;
}
function closeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !$('#colormenu').hidden || $('.img-view')) return;
  e.preventDefault();
  e.stopPropagation();
  toggle(false);
}

function toggle(open: boolean) {
  box.hidden = !open;
  btn.classList.toggle('on', open);
  btn.setAttribute('aria-expanded', open as unknown as string);
  armed = false;
  for (const [type, fn] of [['pointerdown', away], ['keydown', closeKey]] as [string, (e: any) => any][]) (open ? addEventListener : removeEventListener)(type, fn, true);
  (open ? addEventListener : removeEventListener)('resize', place);
  if (!open) return;
  place();
  box.focus();
  load();
}

if (SOLO === 'clips') window.close();
else if (WIN === 1 && btn) {
  btn.innerHTML = ICONS.clip;
  btn.hidden = false;
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => toggle(box.hidden));

  box = Object.assign(document.createElement('section'), { id: 'clips', className: 'float', hidden: true, tabIndex: -1 });
  box.setAttribute('aria-label', 'clips');
  box.innerHTML = `<div class="cl-head float-head"><img src="amethyst.svg" alt="" draggable="false"><span>clips<i class="cl-n"></i></span><button data-cl-add title="Add a picture\nPicks a picture from your disk and keeps it here.\n\nYou can also paste one, or drop it here." data-tip-keys="=ctrl+v:paste a picture" aria-label="add pictures">${ICONS.wplus}</button><button class="x" data-cl-close title="Close\nCloses this window." data-tip-keys="=esc:close" aria-label="close">${ICONS.wx}</button></div><div class="cl-list"></div>`;
  document.body.append(box);
  const addBtn = box.querySelector('[data-cl-add]') as HTMLElement, paintAdd = () => (addBtn.hidden = !pref('clips:add'));
  paintAdd();
  onPref('clips:add', paintAdd);
  onPref('bar:off', () => !box.hidden && isOff('bar:off', 'clips') && toggle(false));
  rowIcons({ 'clips:add': () => icon('plus') });
  barMenu('.cl-head', 'clips');
  const pick = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp', multiple: true, hidden: true });
  pick.addEventListener('change', () => addFiles([...pick.files!]).then(() => (pick.value = '')));
  box.append(pick);

  box.addEventListener('paste', (e) => {
    if ((e.target as Element).closest?.('input, textarea, [contenteditable]')) return;
    e.preventDefault();
    const imgs = pastedImages(e);
    if (imgs.length) return void addFiles(imgs);
    const text = e.clipboardData?.getData('text/plain');
    if (text?.trim()) return void add({ text });
    if (e.clipboardData?.files.length) addFiles([...e.clipboardData.files]);
  });
  box.addEventListener('dragover', (e) => {
    const t = e.dataTransfer!.types;
    if (t.includes('Files') || t.includes('text/plain')) e.preventDefault();
  });
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...e.dataTransfer!.files];
    if (files.length) return void addFiles(files);
    const text = e.dataTransfer!.getData('text/plain');
    if (text?.trim()) add({ text });
  });
  box.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-cl-close]')) return toggle(false);
    if ((e.target as Element).closest('[data-cl-add]')) return pick.click();
    const c = (e.target as Element).closest<HTMLElement>('[data-clip]');
    if (!c) return;
    if ((e.target as Element).closest('[data-cl-rm]')) remove(c.dataset.clip!);
    else copy(c.dataset.clip!);
  });
  box.addEventListener('dblclick', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('[data-clip]');
    if (c && !(e.target as Element).closest('[data-cl-rm]') && list.find((x) => x.id === c.dataset.clip!)?.kind === 'image') viewImage(raw(c.dataset.clip!));
  });
  box.addEventListener('contextmenu', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('[data-clip]');
    if (!c) return;
    e.preventDefault();
    const id = c.dataset.clip!, pic = list.find((x) => x.id === id)?.kind === 'image';
    const clip = list.find((x) => x.id === id)!, row = (a: string, ic: string, label: string, tip: string, key = '') => `<button class="mi" data-a="${a}" title="${label}&#10;${tip}"><i class="tb-ic">${ic}</i><span class="mi-n">${label}</span>${chip(key)}</button>`;
    const name = pic ? clip.file || 'picture' : (clip.text || 'text').replace(/\s+/g, ' ').trim().slice(0, 32) || 'text';
    const html = menuHead(pic ? icon('image') : icon('file'), name) + bands({ actions: row('copy', icon('copy'), 'copy', pic ? 'Copies the picture to paste elsewhere.' : 'Copies the text to paste elsewhere.', 'click') + (pic ? row('view', icon('search'), 'view large', 'Opens the picture large over the window; a click closes it.', 'double-click') : '') + '<div class="sep"></div>' + row('remove', icon('close'), 'remove', 'Moves the clip to removed/ in the clips folder.') });
    popMenu(e.clientX, e.clientY, html, (b) => {
      const a = b.dataset.a;
      if (a === 'copy') copy(id);
      else if (a === 'view') viewImage(raw(id));
      else remove(id);
    });
  });
}
