import { bands, chip, menuHead, popMenu } from './controls.ts';
import { pref } from './prefs.ts';
import { esc, setSave } from './util.ts';

type EditCtx = { target: Element; text: string; editable: boolean };
export type EditRow = { icon: string; label: string; key?: string; tip?: string; run: () => unknown };
type Src = { name: string; text(): string; paste?: boolean; focus?(): void; selectAll?(): void };
type What = 'cut' | 'copy' | 'paste' | 'selectAll';

const svg = (d: string) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
export const EDIT_ICONS = {
  cut: svg('<circle cx="4.5" cy="11.5" r="2"/><circle cx="11.5" cy="11.5" r="2"/><path d="M5.8 9.9 12 2.5M10.2 9.9 4 2.5"/>'),
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>'),
  paste: svg('<rect x="3" y="3.5" width="10" height="10.5" rx="1.5"/><path d="M6 3.5v-1h4v1M5.5 7.5h5M5.5 10.5h3"/>'),
  all: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke-dasharray="2.2 1.6"/><path d="M5.5 6.5h5M5.5 9.5h3"/>'),
  text: svg('<path d="M6 2.5h4M6 13.5h4M8 2.5v11"/>'),
  add: svg('<path d="M8 3v10M3 8h10"/>'),
  link: svg('<path d="M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.8.8M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.8-.8"/>'),
  image: svg('<rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="6" cy="6.6" r="1.2"/><path d="M2.6 12l3.6-3.6 2.4 2.4 2-2 2.8 2.8"/>'),
};

const SRC = new WeakMap<Element, Src>();
export const editSource = (el: Element, src: Src) => void SRC.set(el, src);
const MORE: ((c: EditCtx) => EditRow[])[] = [];
export const editRows = (fn: (c: EditCtx) => EditRow[]) => void MORE.push(fn);

const editRow = (r: EditRow, i: number) => `<button class="mi em" data-em="${i}"${r.tip ? ` title="${esc(r.tip)}"` : ''}><i class="tb-ic">${r.icon}</i><span class="mi-n">${esc(r.label)}</span>${chip(r.key || '')}</button>`;

export const editHead = (where: string) => menuHead(where === 'link' ? EDIT_ICONS.link : where === 'image' ? EDIT_ICONS.image : EDIT_ICONS.text, where);

export function editMenuHtml(head: string, groups: EditRow[][]) {
  let i = 0;
  return head + bands({ actions: groups.filter((g) => g.length).map((g) => g.map((r) => editRow(r, i++)).join('')).join('<div class="sep"></div>') });
}
export function editMenu(x: number, y: number, head: string, groups: EditRow[][]) {
  const rows = groups.flat();
  if (!rows.length) return false;
  popMenu(x, y, editMenuHtml(head, groups), (b) => rows[+b.dataset.em!]?.run());
  return true;
}

export const editRowsFor = (o: { text: string; cut: boolean; paste: boolean; all: boolean }, run: (what: What) => unknown, copy: () => unknown = () => run('copy')): EditRow[][] => [
  [
    ...(o.text && o.cut ? [{ icon: EDIT_ICONS.cut, label: 'cut', key: 'ctrl x', run: () => run('cut') }] : []),
    ...(o.text ? [{ icon: EDIT_ICONS.copy, label: 'copy', key: 'ctrl c', run: copy }] : []),
    ...(o.paste ? [{ icon: EDIT_ICONS.paste, label: 'paste', key: 'ctrl v', run: () => run('paste') }] : []),
  ],
  o.all ? [{ icon: EDIT_ICONS.all, label: 'select all', key: 'ctrl a', run: () => run('selectAll') }] : [],
];

const FIELD = 'textarea, input:not([type]), input:is([type=text], [type=search], [type=url], [type=email], [type=tel], [type=password], [type=number]), [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
function ownOf(t: Element) {
  for (let n: Element | null = t; n; n = n.parentElement) {
    const s = SRC.get(n);
    if (s) return s;
  }
  return null;
}
function picked(box: HTMLInputElement | HTMLTextAreaElement) {
  try {
    return box.selectionStart == null || box.selectionEnd == null ? '' : box.value.slice(box.selectionStart, box.selectionEnd);
  } catch {
    return '';
  }
}
export const writeText = (text: string) => navigator.clipboard.writeText(text).catch(() => setSave('could not copy', true));

addEventListener('contextmenu', (e) => {
  const edit = window.amethyst?.edit;
  if (e.defaultPrevented || !(e.target instanceof Element) || !edit || !pref('editmenu:on') || e.target.closest('#colormenu')) return;
  const t = e.target, own = ownOf(t), field = own ? null : t.closest<HTMLElement>(FIELD) || t.closest('.cm-editor')?.querySelector<HTMLElement>(':scope > .cm-scroller > .cm-content[contenteditable="true"]') || null;
  const box = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field : null;
  const editable = !!field && !(box && (box.readOnly || box.disabled)), secret = box?.type === 'password';
  const sel = getSelection(), range = !own && !box && sel?.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0).cloneRange() : null;
  const text = secret ? '' : own ? own.text() : box ? picked(box) : range ? sel!.toString() : '';
  const more = MORE.flatMap((fn) => fn({ target: t, text, editable }));
  if (!text.trim() && !editable && !own?.paste && !more.length) return;
  e.preventDefault();
  const run = (what: What) => {
    if (own) {
      if (what === 'selectAll') return own.selectAll?.();
      own.focus?.();
    } else if (range) {
      const s = getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
    }
    edit(what);
  };
  const rows = editRowsFor({ text: text.trim() ? text : '', cut: !own && editable && !secret, paste: own ? !!own.paste : editable, all: own ? !!own.selectAll : editable }, run, own ? () => writeText(text) : undefined);
  editMenu(e.clientX, e.clientY, editHead(own?.name || (field ? 'text box' : 'selected text')), [more, ...rows]);
});
