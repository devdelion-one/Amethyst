import { bound, is, show } from './binds.ts';
import { QUOTE_RE, quoteToken, refText } from './chattext.ts';
import { copy } from './chips.ts';
import { icon } from './icon.ts';
import { hideMenu, ICONS, popMenu, rowIcons } from './controls.ts';
import { EDIT_ICONS, editRows } from './editmenu.ts';
import type { EditRow } from './editmenu.ts';
import { tell } from './notify.ts';
import { onSize } from './measure.ts';
import { page } from './page.ts';
import { onPref, pref } from './prefs.ts';
import { agentMenu, launchAgent } from './agentmenu.ts';
import { esc, onSelEnd, setSave, showErr } from './util.ts';

interface Quoter {
  log: HTMLElement;
  replyOf(r: Range): Element | null;
  add(sel: Range): void;
  clear(): void;
  flash(text: string): void;
  shut(): void;
}
type Sel = { text: string; from: string };
interface SelSrc {
  el?: Element;
  joins?: boolean;
  get(): Sel | null;
  at(): { x: number; y: number; top: number };
  clear(): unknown;
}
interface Quote {
  text: string;
  range: StaticRange;
  tag: HTMLSpanElement;
  n: number;
}

const marks = new Highlight(), now = new Highlight();
now.priority = 1;
CSS.highlights.set('ch-quote', marks);
CSS.highlights.set('ch-quote-now', now);

rowIcons({ 'quote:on': () => icon('compose'), 'tochat:on': () => ICONS.toChat, 'tochat:pick': () => ICONS.chevDown });

const owners = new Set<any>();
let bar: HTMLDivElement | null = null, cur: { q: Quoter; range: Range } | null = null;

export const quoteBar = () => `<button type="button" data-quote title="Add to reply&#10;Puts the selected text in your message, as a quote." data-tip-keys="quoteKey:add to reply">＋ add to reply</button><button type="button" class="sb-copy" data-copy aria-label="copy">${icon('copy')}</button>`;
function make() {
  bar = document.createElement('div');
  bar.id = 'quote-bar';
  bar.hidden = true;
  bar.className = 'quote-bar';
  bar.innerHTML = quoteBar();
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || !cur) return;
    if (b.matches('[data-copy]')) return copy(cur.range.toString(), b);
    cur.q.add(cur.range);
  });
  bar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hideMenu(e.clientX, e.clientY, 'quote');
  });
  document.body.append(bar);
  onPref('quote:on', () => pref('quote:on') || hide());
}
function hide(q?: Quoter) {
  if (q && cur?.q !== q) return;
  if (bar) bar.hidden = true;
  cur = null;
}
function place(q: Quoter, range: Range, back: boolean, box: HTMLElement) {
  if (!bar) make();
  const add = bar!.querySelector<HTMLElement>('[data-quote]')!;
  add.textContent = '＋ add to reply';
  add.title = 'Add to reply\nPuts the selected text in your message, as a quote.';
  add.dataset.tipKeys = 'quoteKey:add to reply';
  cur = { q, range };
  bar!.hidden = false;
  const rects = range.getClientRects(), r = (back ? rects[0] : rects[rects.length - 1]) || range.getBoundingClientRect();
  const h = bar!.offsetHeight, w = bar!.offsetWidth;
  const v = box.getBoundingClientRect(), top = Math.max(v.top, 0), bottom = Math.min(v.bottom, innerHeight);
  const left = Math.max(v.left, 0), right = Math.min(v.right, innerWidth);
  const under = r.bottom + 4, over = r.top - h - 4;
  const y = back ? (over >= top ? over : under) : under + h > bottom ? over : under;
  bar!.style.top = Math.max(top + 4, Math.min(y, bottom - h - 4)) + 'px';
  bar!.style.left = Math.max(left + 4, Math.min(r.right, right - w - 4)) + 'px';
}

const clean = (t: string) => quoteToken(t).slice(1, -1);
function rectsOf(s: StaticRange) {
  const r = new Range();
  try {
    r.setStart(s.startContainer, s.startOffset);
    r.setEnd(s.endContainer, s.endOffset);
  } catch {
    return [];
  }
  return r.getClientRects();
}

let sbar: HTMLDivElement | null = null, scur: SelSrc | null = null;
export const selBarHtml = (add = '') => `<button type="button" data-add>${add}</button><button type="button" class="sb-to" data-to aria-haspopup="menu">▾</button><button type="button" class="sb-copy" data-copy>${icon('copy')}</button>`;
function smake() {
  sbar = document.createElement('div');
  sbar.id = 'sel-bar';
  sbar.hidden = true;
  sbar.innerHTML = selBarHtml();
  sbar.addEventListener('mousedown', (e) => e.preventDefault());
  sbar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'), v = scur?.get();
    if (!b || !v) return selHide();
    if (b.matches('[data-copy]')) return copy(refText(v.from, v.text), b);
    if (b.matches('[data-to]')) return pickChat(b, scur!, v);
    toNew(b, scur!, v, 'beside');
  });
  sbar.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hideMenu(e.clientX, e.clientY, 'quote');
  });
  document.body.append(sbar);
  onPref('tochat:on', () => pref('tochat:on') || selHide());
  onPref('tochat:pick', () => sbar && !sbar.hidden && label());
  addEventListener('scroll', () => scur && selPlace(), true);
}
type ChatRef = { id: string; title: string; code?: string };
const named = (c: ChatRef) => (c.code ? `${c.code} · ${c.title}` : c.title);
function addTip(src: SelSrc | null) {
  const f = page.chatsFor?.(src?.el);
  if (!f) return 'Add to chat\nAdds the selected text to the chat you used last.';
  const to = (c: ChatRef) => (c.code ? `${c.code} “${c.title}”` : `“${c.title}”`);
  if (f.to) return `Add to chat\nAdds the selected text to ${to(f.to)}, ${f.beside ? 'the chat beside this file' : 'the chat used last'}.`;
  return f.beside ? 'Add to chat\nOpens a chat beside this file with the selected text.' : 'Add to chat\nStarts a new chat with the selected text.';
}
function label() {
  const add = sbar!.querySelector<HTMLElement>('[data-add]')!, to = sbar!.querySelector<HTMLElement>('[data-to]')!, cp = sbar!.querySelector<HTMLElement>('[data-copy]')!;
  add.hidden = !page.toChat;
  to.hidden = add.hidden || !page.chatsFor || !pref('tochat:pick');
  add.textContent = '＋ add to chat';
  add.title = addTip(scur);
  to.setAttribute('aria-label', 'pick the chat');
  cp.title = "Copy\nCopies the selected text with the file and lines it is from, to paste into a chat.\n\nRight-click to choose this bar's buttons.";
  cp.setAttribute('aria-label', 'copy');
}
function pickChat(btn: HTMLElement, src: SelSrc, v: Sel) {
  const { to, beside, all } = page.chatsFor(src.el), r = btn.getBoundingClientRect();
  const row = (k: string, name: string, d = '') => `<button class="mi" data-to="${esc(k)}">${esc(name)}${d ? `<span class="d">${esc(d)}</span>` : ''}</button>`;
  const first = to ? row(beside ? 'beside' : '', named(to), beside ? 'beside this file' : 'used last') : '';
  const html = '<div class="ml">add the selected text to</div>' + first + all.map((c) => row(c.id, named(c))).join('') + row('new', 'a new chat', !beside ? '' : to ? 'a tab beside this file' : 'beside this file');
  popMenu(r.left, r.bottom + 4, html, (b) => toNew(btn, src, v, b.dataset.to!), false, (b, e) => {
    if (b.dataset.to === 'new') agentMenu(e.clientX, e.clientY, (k) => addSel(src, v, 'new:' + k), '', 'chat:', false, { place: 'tochat' });
  });
}
function toNew(btn: HTMLElement, src: SelSrc, v: Sel, to: string) {
  if (to !== 'new' && (to !== 'beside' || page.chatsFor?.(src.el)?.to)) return addSel(src, v, to);
  const r = btn.getBoundingClientRect();
  launchAgent('tochat', r.left, r.bottom + 4, (k) => addSel(src, v, 'new:' + k));
}
async function addSel(src: SelSrc, v: Sel, to: string) {
  try {
    const name = await page.toChat(v, to, src.el);
    setSave(`added to ${name}`);
  } catch (e) {
    showErr(e);
  }
  src.clear();
  selHide(src);
}
export function selHide(src?: SelSrc) {
  if (src && scur !== src) return;
  if (sbar) sbar.hidden = true;
  if (sbar?.dataset.join) delete document.getElementById('fmt-bar')?.dataset.join;
  scur = null;
}
export function selShow(src: SelSrc) {
  const v = pref('tochat:on') && src.get();
  if (!v) return selHide(src);
  if (!sbar) smake();
  scur = src;
  label();
  sbar!.hidden = false;
  selPlace();
}
function selPlace() {
  const fb = document.getElementById('fmt-bar'), h = sbar!.offsetHeight, w = sbar!.offsetWidth;
  let x: number, y: number;
  delete sbar!.dataset.join;
  if (fb && !fb.hidden && scur!.joins) {
    const r = fb.getBoundingClientRect(), after = r.right - 1 + w <= innerWidth - 4;
    x = after ? r.right - 1 : r.left + 1 - w;
    y = r.top;
    fb.dataset.join = sbar!.dataset.join = after ? 'after' : 'before';
  } else {
    const p = scur!.at();
    x = p.x;
    y = p.y + 4 + h > innerHeight ? p.top - h - 4 : p.y + 4;
  }
  sbar!.style.top = Math.max(4, Math.min(y, innerHeight - h - 4)) + 'px';
  sbar!.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
}

editRows(({ target, text }) => {
  const rows: EditRow[] = [], q = cur, s = scur;
  if (q && bar && !bar.hidden && text.trim() && q.q.log.contains(target)) {
    const k = show(bound('quoteKey'));
    rows.push({ icon: EDIT_ICONS.add, label: 'add to reply', key: k, tip: 'Add to reply\nAdds the selected text to your message, as a quote.', run: () => q.q.add(q.range) });
  }
  const v = s && sbar && !sbar.hidden && !sbar.querySelector<HTMLElement>('[data-add]')!.hidden && s.el?.contains(target) ? s.get() : null;
  if (s && v) {
    rows.push({ icon: EDIT_ICONS.add, label: 'add to chat', tip: addTip(s), run: () => addSel(s, v, 'beside') });
  }
  return rows;
});

document.addEventListener(
  'keydown',
  (e) => {
    if (!owners.size || e.defaultPrevented || !pref('quote:on') || !is(e, 'quoteKey') || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const sel = getSelection()!;
    if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0), q = [...owners].find((o) => o.log.contains(r.commonAncestorContainer));
    if (!q) return;
    e.preventDefault();
    e.stopPropagation();
    if (q.replyOf(r) && clean(r.toString())) q.add(r.cloneRange());
    else tell(q.log, { title: 'You can only add a reply to your message', line: 'Select text inside one reply', ms: 2500 });
  },
  true,
);

export function quoting({ log, flow, input, composer }: { log: HTMLElement; flow: HTMLElement; input: HTMLElement & { value: string }; composer: { addQuote(t: string): unknown } }) {
  const quotes: Quote[] = [];
  const layer = Object.assign(document.createElement('div'), { className: 'quote-tags' });
  log.append(layer);
  const self: Quoter = { log, replyOf, add, clear, flash, shut };

  function replyOf(r: Range) {
    const n = r.commonAncestorContainer, md = (n.nodeType === 1 ? (n as Element) : n.parentElement)?.closest('.ch-ai .md');
    return md && log.contains(md) ? md : null;
  }
  function add(sel: Range) {
    const text = clean(sel.toString());
    if (!text) return;
    const range = new StaticRange({ startContainer: sel.startContainer, startOffset: sel.startOffset, endContainer: sel.endContainer, endOffset: sel.endOffset });
    const tag = Object.assign(document.createElement('span'), { className: 'quote-tag' });
    layer.append(tag);
    marks.add(range);
    quotes.push({ text, range, tag, n: 0 });
    getSelection()!.removeAllRanges();
    hide(self);
    composer.addQuote(text);
    sync();
  }

  function sync() {
    const used = new Set<Quote>();
    [...input.value.matchAll(QUOTE_RE)].forEach((m, i) => {
      const q = quotes.find((x) => !used.has(x) && x.text === m[1]);
      if (q) (used.add(q), (q.n = i + 1));
    });
    quotes.filter((q) => !used.has(q)).forEach(drop);
    tags();
  }
  function drop(q: Quote) {
    marks.delete(q.range);
    now.delete(q.range);
    q.tag.remove();
    quotes.splice(quotes.indexOf(q), 1);
  }
  function clear() {
    [...quotes].forEach(drop);
  }
  type At = [Quote, number, number] | [Quote];
  function tagsAt(): At[] {
    if (!quotes.length) return [];
    const lr = layer.getBoundingClientRect(), k = flow.getBoundingClientRect().height / flow.offsetHeight || 1;
    return quotes.map((q): At => {
      const rects = rectsOf(q.range), r = rects[rects.length - 1];
      return r ? [q, (r.right - lr.left) / k - 3, (r.top - lr.top) / k] : [q];
    });
  }
  function putTags(all: At[]) {
    for (const [q, x, y] of all) {
      q.tag.hidden = x == null;
      if (x == null) continue;
      q.tag.textContent = q.n as unknown as string;
      q.tag.style.left = `${x}px`;
      q.tag.style.top = `${y}px`;
    }
  }
  const tags = () => putTags(tagsAt());
  function flash(text: string) {
    const q = quotes.find((x) => x.text === text);
    if (!q) return;
    q.range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    now.add(q.range);
    setTimeout(() => now.delete(q.range), 800);
  }

  const look = () => {
    const sel = getSelection()!, r = sel.rangeCount && !sel.isCollapsed && sel.getRangeAt(0);
    if (!r || !pref('quote:on') || !log.contains(r.commonAncestorContainer) || !replyOf(r) || !clean(r.toString())) return hide(self);
    place(self, r.cloneRange(), sel.focusNode === r.startContainer && sel.focusOffset === r.startOffset && !(sel.anchorNode === r.startContainer && sel.anchorOffset === r.startOffset), log);
  };
  const later = () => setTimeout(look, 0);
  onSelEnd(log, later);
  log.addEventListener('keyup', later);
  log.addEventListener('dblclick', (e) => {
    const c = (e.target as HTMLElement).closest?.('code');
    if (!c || c.closest('pre') || !c.closest('.md') || !log.contains(c)) return;
    const r = new Range();
    r.selectNodeContents(c);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(r);
    later();
  });
  log.addEventListener('scroll', () => hide(self));
  const gone = () => cur?.q === self && getSelection()!.isCollapsed && hide(self);
  document.addEventListener('selectionchange', gone);
  input.addEventListener('input', sync);
  const ro = onSize([log, flow], { name: 'quote.tags', live: true, read: tagsAt, write: putTags });

  owners.add(self);
  function shut() {
    owners.delete(self);
    clear();
    layer.remove();
    ro.disconnect();
    document.removeEventListener('selectionchange', gone);
    hide(self);
  }
  return self;
}
