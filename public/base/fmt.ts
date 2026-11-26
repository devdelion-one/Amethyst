import { hideMenu, ICONS, rowIcons } from './controls.ts';
import { isOff, onPref } from './prefs.ts';
import { onSelEnd } from './util.ts';

type Sliceable = { slice(a: number, b?: number): string };
export interface FmtBox {
  el?: HTMLElement;
  get(): { text: Sliceable; from: number; to: number };
  put(from: number, to: number, text: string, a: number, b: number): void;
  at(): { x: number; y: number; top: number };
}

const STYLES = [
  ['bold', 'B', '**', '**', 'Bold\nMakes the selected text bold.'],
  ['italic', 'I', '_', '_', 'Italic\nSlants the selected text.'],
  ['strike', 'S', '~~', '~~', 'Strikethrough\nDraws a line through the selected text.'],
  ['code', '&lt;&gt;', '`', '`', 'Code\nMarks the selected text as code.'],
  ['link', '[]', '[', ']()', 'Link\nMakes the selected text a link; type the address in the brackets after it.'],
];

export function styled(text: Sliceable, from: number, to: number, open: string, close: string): [number, number, string, number, number] {
  const sel = text.slice(from, to), o = open.length, c = close.length;
  if (close !== ']()') {
    if (text.slice(from - o, from) === open && text.slice(to, to + c) === close) return [from - o, to + c, sel, from - o, to - o];
    if (sel.length >= o + c && sel.startsWith(open) && sel.endsWith(close)) return [from, to, sel.slice(o, -c), from, to - o - c];
  }
  const ins = open + sel + close;
  return close === ']()' ? [from, to, ins, from + ins.length - 1, from + ins.length - 1] : [from, to, ins, from + o, to + o];
}

export const fmtBarHtml = () => STYLES.map(([id, l, , , tip]) => `<button data-fmt="${id}" title="${tip}"${id === 'bold' ? ' data-tip-keys="=ctrl+b:bold"' : ''}>${l}</button>`).join('');
let bar!: HTMLDivElement, box: FmtBox | null = null;
function make() {
  bar = document.createElement('div');
  bar.id = 'fmt-bar';
  bar.hidden = true;
  bar.innerHTML = fmtBarHtml();
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-fmt]');
    if (b && box) apply(box, b.dataset.fmt!);
  });
  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hideMenu(e.clientX, e.clientY, 'fmt');
  });
  document.body.append(bar);
  addEventListener('scroll', () => box && show(box), true);
  onPref('fmt:off', () => box && show(box));
}

function apply(bx: FmtBox, id: string) {
  const [, , open, close] = STYLES.find((s) => s[0] === id)!;
  const { text, from, to } = bx.get();
  if (from === to && id !== 'link') return false;
  bx.put(...styled(text, from, to, open, close));
  show(bx);
  return true;
}

function show(bx: FmtBox) {
  if (!bar) make();
  delete bar.dataset.join;
  const { from, to } = bx.get();
  const on = !isOff('fmt:off', 'bar') && bx.el!.contains(document.activeElement) && from !== to && STYLES.some((s) => !isOff('fmt:off', s[0]));
  box = on ? bx : box === bx ? null : box;
  bar.hidden = !on;
  if (!on) return;
  for (const b of bar.children as HTMLCollectionOf<HTMLElement>) b.hidden = isOff('fmt:off', b.dataset.fmt!);
  const p = bx.at();
  const h = bar.offsetHeight, w = bar.offsetWidth;
  bar.style.top = (p.y + 4 + h > innerHeight ? p.top - h - 4 : p.y + 4) + 'px';
  bar.style.left = Math.max(4, Math.min(p.x, innerWidth - w - 4)) + 'px';
}

function hideFmt() {
  if (bar) bar.hidden = true;
  box = null;
}

export function fmtKey(bx: FmtBox, e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  const id = ({ b: 'bold' } as Record<string, string>)[e.key.toLowerCase()];
  return !!id && apply(bx, id);
}

export function attach(bx: FmtBox, { keys = true }: { keys?: boolean } = {}): () => void {
  const later = () => setTimeout(() => show(bx), 0);
  for (const ev of ['keyup', 'select']) bx.el!.addEventListener(ev, later);
  onSelEnd(bx.el!, later);
  bx.el!.addEventListener('focusout', () => setTimeout(() => !bx.el!.contains(document.activeElement) && box === bx && hideFmt(), 0));
  if (keys) bx.el!.addEventListener('keydown', (e) => fmtKey(bx, e) && e.preventDefault());
  return () => show(bx);
}

const letter = (t: string) => () => `<b class="tb-tx">${t}</b>`;
rowIcons({ 'fmt:off:bar': () => ICONS.fmtBar, 'fmt:off:bold': letter('B'), 'fmt:off:italic': letter('I'), 'fmt:off:strike': letter('S'), 'fmt:off:code': letter('&lt;&gt;'), 'fmt:off:link': letter('[]'), 'fmt:off:file': () => ICONS.newFile, 'fmt:off:chat': () => ICONS.toChat });
