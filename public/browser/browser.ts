import { MAX_IMAGE } from '../base/chips.ts';
import { barMenu, buttonMenu, chip, ICONS, popMenu, rowIcons } from '../base/controls.ts';
import { EDIT_ICONS, editHead, editMenu, editRowsFor, writeText } from '../base/editmenu.ts';
import { isOff, onPref, pref, setPref, wasSet } from '../base/prefs.ts';
import type { EditRow } from '../base/editmenu.ts';
import { $, esc, fileUrl, setSave, showErr, store, track } from '../base/util.ts';
import type { Tab } from '../base/types.ts';
import { onSize } from '../base/measure.ts';
import { onOutside } from '../base/lift.ts';

type Rect = { x: number; y: number; w: number; h: number };
type Pick = { url: string; selector: string; name: string; text: string; html: string; rect: Rect };
type ChatRef = { id: string; title: string; code?: string };
type LastChat = { title: string; code?: string };
type Seen = { url?: string; title?: string; chatTo?: string | null };
type PickItem = { pick: { label: string; title: string; text: string } };
type Send = (item: PickItem, to?: string) => Promise<string>;
type Pt = { x: number; y: number };
type Stroke = { tool: string; pts: Pt[] };
type WebEvent = Event & { url: string; isMainFrame: boolean; title: string; errorCode: number; validatedURL: string; errorDescription: string };
interface WebView extends HTMLElement {
  src: string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  setZoomFactor(f: number): void;
  getZoomFactor(): number;
  loadURL(url: string): Promise<void>;
  reload(): void;
  reloadIgnoringCache(): void;
  stop(): void;
  goBack(): void;
  goForward(): void;
  executeJavaScript(code: string): Promise<unknown>;
  insertCSS(css: string): Promise<string>;
  getWebContentsId(): number;
  cut(): void;
  copy(): void;
  paste(): void;
  selectAll(): void;
  copyImageAt(x: number, y: number): void;
}
type MenuParams = { x: number; y: number; linkURL: string; linkText: string; mediaType: string; hasImageContents: boolean; selectionText: string; isEditable: boolean; editFlags: { canCut: boolean; canPaste: boolean; canSelectAll: boolean } };

declare global {
  interface Window {
    __amHeld?: (ev?: Event) => void;
    __amMark?: () => void;
  }
}

const WEBVIEW = !!window.amethyst?.webview;
const BARS = '::-webkit-scrollbar{width:6px;height:6px;background:transparent}::-webkit-scrollbar-track,::-webkit-scrollbar-corner{background:transparent}::-webkit-scrollbar-thumb{background:rgba(128,128,128,.35);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:rgba(128,128,128,.6)}';
const ICON = {
  back: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5"/></svg>',
  forward: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5L11 8l-4.5 4.5"/></svg>',
  refresh: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5M13 2v3h-3"/></svg>',
  reset: ICONS.reset,
  stop: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  paint: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3-7.5 7.5H3v-3z"/><path d="M9 4l3 3"/></svg>',
  pen: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 11c2-4 4 1 6-2.5s3.5-3 5-1.5"/></svg>',
  box: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="4" width="10" height="8" rx="1"/></svg>',
  snap: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5h2.5l1.2-1.8h3.6L11 5.5h2.5v7h-11z"/><circle cx="8" cy="9" r="2.2"/></svg>',
  to: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.5l3 3 3-3"/></svg>',
  inspect: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 13H3.5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1V7"/><path d="M8 8l6 2-2.6 1.4L10 14z"/></svg>',
};
const INK = '#ff3b30', LINE = 3;
const TOOLS = 'browserTools';
if (store.get(TOOLS, {}).hidden) {
  if (!wasSet('br:off')) setPref('br:off', ['inspect', 'paint', 'to']);
  store.set(TOOLS, { ...store.get(TOOLS, {}), hidden: false });
}
const toolOff = (k: string) => isOff('br:off', k);
const SLEEP = 30;

function picker() {
  return new Promise<Pick | null>((done) => {
    window.__amPick?.cancel();
    window.__amHeld?.();
    const mark = (css: string) => Object.assign(document.createElement('div'), { style: `position:fixed;z-index:2147483647;pointer-events:none;display:none;${css}` });
    const frame = mark('border:2px solid #ff3b30;background:rgba(255,59,48,.08);border-radius:2px');
    const label = mark('font:12px/18px monospace;padding:0 6px;border-radius:3px;background:#ff3b30;color:#fff;white-space:nowrap');
    document.documentElement.append(frame, label);
    const esc = (x: string) => CSS.escape(x);
    const name = (e: Element) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 2).map((c) => '.' + c).join('');
    const selector = (e: Element) => {
      const parts: string[] = [];
      for (let n: Element | null = e; n && n !== document.documentElement; n = n.parentElement) {
        if (n.id && document.querySelectorAll('#' + esc(n.id)).length === 1) {
          parts.unshift('#' + esc(n.id));
          break;
        }
        const same = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n!.tagName) : [];
        parts.unshift(n.tagName.toLowerCase() + [...n.classList].slice(0, 2).map((c) => '.' + esc(c)).join('') + (same.length > 1 ? `:nth-of-type(${same.indexOf(n) + 1})` : ''));
        if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
      }
      return parts.join(' > ');
    };
    let at: Element | null = null;
    const show = (e: Element) => {
      const r = e.getBoundingClientRect();
      Object.assign(frame.style, { display: 'block', left: r.left - 2 + 'px', top: r.top - 2 + 'px', width: r.width + 'px', height: r.height + 'px' });
      label.textContent = name(e);
      Object.assign(label.style, { display: 'block', left: Math.max(0, r.left - 2) + 'px', top: (r.top > 22 ? r.top - 22 : r.bottom + 4) + 'px' });
    };
    const move = (ev: PointerEvent) => {
      const e = document.elementFromPoint(ev.clientX, ev.clientY);
      if (e && e !== at) show((at = e));
    };
    const block = (ev: Event) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    const html = (e: Element) => (e.outerHTML.length > 1500 ? e.outerHTML.slice(0, 1500) + '…' : e.outerHTML);
    const click = (ev: MouseEvent) => {
      block(ev);
      if (!at) return finish(null);
      const r = at.getBoundingClientRect();
      finish({ url: location.href, selector: selector(at), name: name(at), text: ((at as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120), html: html(at), rect: { x: r.left, y: r.top, w: r.width, h: r.height } }, true);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      block(ev);
      finish(null);
    };
    const on = { pointermove: move, click, keydown: key, pointerdown: block, mousedown: block, pointerup: block, mouseup: block, auxclick: block, contextmenu: block };
    const finish = (v: Pick | null, keep?: boolean) => {
      for (const [k, fn] of Object.entries(on)) removeEventListener(k, fn as EventListener, true);
      const drop = () => {
        frame.remove();
        label.remove();
      };
      if (keep) window.__amMark = drop;
      else drop();
      delete window.__amPick;
      done(v);
    };
    for (const [k, fn] of Object.entries(on)) addEventListener(k, fn as EventListener, true);
    window.__amPick = { cancel: () => finish(null) };
  });
}

function holdPick() {
  return new Promise<boolean>((done) => {
    const kinds = ['scroll', 'wheel', 'pointerdown', 'keydown', 'resize'];
    const end = (ev?: Event) => {
      if (ev?.type === 'keydown' && (ev as KeyboardEvent).key !== 'Escape') return;
      for (const k of kinds) removeEventListener(k, end, true);
      window.__amMark?.();
      delete window.__amMark;
      delete window.__amHeld;
      done(true);
    };
    for (const k of kinds) addEventListener(k, end, true);
    window.__amHeld = end;
  });
}

const layer = $<HTMLElement>('#webs'), all = new Set<ReturnType<typeof createBrowser>>();
onPref('br:off', () => all.forEach((b) => {
  if (toolOff('paint')) b.unpaint();
  b.tools();
}));
rowIcons({ 'br:off:inspect': () => ICON.inspect, 'br:off:paint': () => ICON.paint, 'br:off:to': () => ICON.to, 'br:off:zoom': () => ICON.reset });
barMenu('.br-bar', (el) => (el.querySelector('.br-tools, .br-zoom') ? 'browser' : ''));
buttonMenu('.br-bar [data-br="refresh"]', {
  name: 'refresh',
  icon: () => ICON.refresh,
  rows: () => `<button class="mi" data-bm title="hard refresh&#10;Loads the page again without the cached copy."><i class="tb-ic">${ICON.refresh}</i><span class="mi-n">hard refresh</span>${chip('ctrl F5')}</button>`,
  pick: (_b, el) => el.dispatchEvent(new Event('hardreload')),
});
export const placeBrowsers = () => all.forEach((b) => b.place());
onSize($('#main'), { name: 'browser.place', live: true, write: placeBrowsers });
window.amethyst?.onBrowserZoom?.(({ id, factor }) => all.forEach((b) => b.guest() === id && b.showZoom(factor)));
const through = (on: boolean) => () => layer.classList.toggle('through', on);
document.addEventListener('dragstart', through(true), true);
for (const ev of ['dragend', 'drop']) document.addEventListener(ev, through(false), true);

const LOCAL = /^(\[|localhost$|.*\.localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;
export function normalize(text: string) {
  const s = text.trim();
  if (/^([a-z]:[\\/]|\/)/i.test(s)) return fileUrl(s);
  if (!s || /\s/.test(s)) return null;
  if (/^file:\/\/\//i.test(s)) return s;
  let url = s;
  if (!/^https?:\/\//i.test(s)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+([/?#]|$)/.test(s)) return null;
    const host = s.split(/[/:?#]/)[0], port = /^[^/]*:\d+/.test(s);
    if (!host.includes('.') && !LOCAL.test(host) && !port) return null;
    url = `${LOCAL.test(host) || !host.includes('.') ? 'http' : 'https'}://${s}`;
  }
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

export const brBarHtml = (tools: boolean, zoom: boolean) => `<div class="br-bar"><button data-br="back" title="Back\nThe page before." aria-label="back" disabled>${ICON.back}</button><button data-br="forward" title="Forward\nThe page after." aria-label="forward" disabled>${ICON.forward}</button><button data-br="refresh" aria-label="refresh"></button>${tools ? `<span class="br-tools"><button data-br="inspect" aria-label="inspect" aria-pressed="false" title="Pick an element\nClick an element of the page, then copy it or add it to a chat." data-tip-keys="=ctrl+shift+c:pick an element;=esc:stop">${ICON.inspect}</button><button data-br="paint" aria-label="paint" aria-pressed="false" title="Paint\nDraws over the page, to show a chat what you mean." data-tip-keys="=ctrl+z:take back a line;=delete:clear it all;=ctrl+enter:copy as a picture;=esc:stop">${ICON.paint}</button><button data-br="tool" aria-label="pen or box" disabled></button><button data-br="snap" aria-label="snap" title="Copy as a picture\nCopies the page with your drawing, to paste into a chat." data-tip-keys="=ctrl+enter:copy as a picture" disabled>${ICON.snap}</button><button data-br="to" aria-label="which chat" title="Chat to add to\nPicks where an element you pick goes: the chat used last, an open chat, or a new one.">${ICON.to}</button></span>` : ''}<input class="br-url" spellcheck="false" autocomplete="off" aria-label="address" placeholder="an address, like localhost:3000">${zoom ? `<span class="br-zoom"><span data-br="level">100 %</span><button data-br="zoom" aria-label="back to 100 %" title="Reset zoom\nBack to 100 %." data-tip-keys="=ctrl+0:reset zoom" disabled>${ICON.reset}</button></span>` : ''}</div>`;
export const brBarPic = () => brBarHtml(true, true).replace('aria-label="refresh"></button>', `aria-label="refresh">${ICON.refresh}</button>`).replace('aria-label="pen or box" disabled></button>', `aria-label="pen or box" disabled>${ICON.pen}</button>`);

export function createBrowser(t: Tab & { chatTo?: string | null }, { changed = () => {}, picked = () => {}, chats = () => [], last = () => null, send = null }: { changed?: (seen: Seen) => void; picked?: () => unknown; chats?: () => ChatRef[]; last?: () => LastChat | null; send?: Send | null } = {}) {
  const el = document.createElement('div');
  el.className = 'browser';
  el.innerHTML = `${brBarHtml(WEBVIEW && !!send, WEBVIEW)}<div class="br-slot"><p class="br-note" hidden></p></div>`;
  const input = el.querySelector('.br-url') as HTMLInputElement, slot = el.querySelector('.br-slot') as HTMLElement, note = el.querySelector('.br-note') as HTMLElement;
  const btn = (k: string) => el.querySelector(`[data-br="${k}"]`) as HTMLButtonElement;
  let url = t.url || '', box: HTMLDivElement | null = null, view: WebView | null = null, ready = false, loading = false, gone = false, z = 20, nap: number | null = null, zoom = 1;
  input.value = url;
  let ink: HTMLCanvasElement | null = null, painting = false, tool = 'pen', strokes: Stroke[] = [], drawing: Stroke | null = null;
  let picking = false, picks = 0, pbar: HTMLDivElement | null = null, held: Pick | null = null, holds = 0;

  const paintButtons = () => {
    if (WEBVIEW && ready) {
      btn('back').disabled = !view!.canGoBack();
      btn('forward').disabled = !view!.canGoForward();
    }
    const b = btn('refresh');
    if (b.dataset.on === String(loading)) return;
    b.dataset.on = loading as unknown as string;
    b.innerHTML = loading ? ICON.stop : ICON.refresh;
    b.title = loading ? '' : 'Refresh\nLoads the page again.\n\nRight-click for a hard refresh.';
    b.dataset.tipKeys = loading ? '' : 'refreshBrowser:refresh';
  };
  const showZoom = (f: number) => {
    if (!WEBVIEW) return;
    zoom = f;
    btn('level').textContent = Math.round(f * 100) + ' %';
    btn('zoom').disabled = Math.abs(f - 1) < 0.001;
  };
  const say = (text: string) => {
    note.textContent = text;
    note.hidden = !text;
    place();
  };
  const seen = (now: string) => {
    url = now;
    if (document.activeElement !== input) input.value = now;
    changed({ url: now });
    paintButtons();
  };
  const make = () => {
    box = document.createElement('div');
    box.className = 'br-view';
    box.style.zIndex = z as unknown as string;
    view = document.createElement(WEBVIEW ? 'webview' : 'iframe') as WebView;
    if (WEBVIEW) {
      view.setAttribute('partition', 'persist:browser');
      view.setAttribute('allowpopups', '');
      view.addEventListener('dom-ready', () => {
        const woke = !ready && Math.abs(zoom - 1) > 0.001;
        ready = true;
        view!.insertCSS(BARS).catch(() => {});
        paintButtons();
        if (woke) view!.setZoomFactor(zoom);
        showZoom(woke ? zoom : view!.getZoomFactor());
      });
      view.addEventListener('did-navigate', (e) => {
        seen((e as WebEvent).url);
        if (ready) showZoom(view!.getZoomFactor());
        if (picking) inspect(false);
        unpick(false);
      });
      view.addEventListener('did-navigate-in-page', (e) => (e as WebEvent).isMainFrame && seen((e as WebEvent).url));
      view.addEventListener('page-title-updated', (e) => changed({ title: (e as WebEvent).title }));
      view.addEventListener('context-menu', (e) => {
        if (!pref('editmenu:on')) return;
        const p = (e as Event & { params: MenuParams }).params, r = view!.getBoundingClientRect(), f = p.editFlags;
        const image = p.mediaType === 'image' && p.hasImageContents;
        const more: EditRow[] = [
          ...(p.linkURL ? [{ icon: EDIT_ICONS.link, label: 'copy address', tip: "Copy address\nCopies the link's address.", run: () => writeText(p.linkURL) }] : []),
          ...(image ? [{ icon: EDIT_ICONS.image, label: 'copy image', run: () => view!.copyImageAt(p.x, p.y) }] : []),
        ];
        const rows = editRowsFor({ text: p.selectionText.trim() ? p.selectionText : '', cut: p.isEditable && f.canCut, paste: p.isEditable && f.canPaste, all: p.isEditable && f.canSelectAll }, (what) => view![what]());
        const where = p.linkURL ? 'link' : image ? 'image' : p.isEditable ? 'text box' : 'selected text';
        editMenu(r.left + p.x, r.top + p.y, editHead(where), [more, ...rows]);
      });
      for (const [ev, on] of [['did-start-loading', true], ['did-stop-loading', false]] as [string, boolean][])
        view.addEventListener(ev, () => {
          loading = on;
          paintButtons();
        });
      view.addEventListener('did-fail-load', (e) => (e as WebEvent).isMainFrame && (e as WebEvent).errorCode !== -3 && say(`${(e as WebEvent).validatedURL || url} didn't load (${(e as WebEvent).errorDescription})`));
      view.addEventListener('focus', () => {
        picked();
        view!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
      });
    }
    view.src = url;
    box.append(view);
    layer.append(box);
  };
  const place = () => {
    if (gone) return;
    const r = slot.getBoundingClientRect(), on = slot.isConnected && r.width > 0 && r.height > 0 && !!url && note.hidden;
    if (on && !box) make();
    if (!box) return;
    if (on) {
      clearTimeout(nap as number);
      nap = null;
    } else if (!nap) {
      const min = store.get('browserSleep', SLEEP);
      if (min > 0) nap = setTimeout(sleep, min * 60000);
    }
    box.style.display = on ? '' : 'none';
    if (on) Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    if (on && painting) inkSize();
    if (!on && painting) paint(false);
    if (!on && picking) inspect(false);
    if (!on) unpick();
  };
  const sleep = () => {
    nap = null;
    box?.remove();
    unpick(false);
    box = view = ink = pbar = null;
    ready = loading = false;
    btn('back').disabled = btn('forward').disabled = true;
    paintButtons();
  };
  const load = (to: string) => {
    if (!WEBVIEW || !ready) view!.src = to;
    else view!.loadURL(to).catch(() => {});
  };
  const go = (text: string) => {
    const to = normalize(text);
    if (!to) return say(`not a web address: ${text.trim()}`);
    const had = !!view;
    url = to;
    input.value = to;
    say('');
    changed({ url: to });
    if (had) load(to);
  };
  const reload = (hard = false) => {
    if (!view) return input.value.trim() && go(input.value);
    const failed = !note.hidden;
    say('');
    if (failed) load(url);
    else if (!WEBVIEW) view.src = url;
    else if (ready) hard ? view.reloadIgnoringCache() : view.reload();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      go(input.value);
      if (note.hidden) input.blur();
    } else if (e.key === 'Escape') {
      input.value = url;
      input.blur();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  el.querySelector('.br-bar')!.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-br]')?.dataset.br;
    if (k === 'refresh') loading ? view?.stop() : reload();
    else if (k === 'back' && ready) view!.goBack();
    else if (k === 'forward' && ready) view!.goForward();
    else if (k === 'paint') paint(!painting);
    else if (k === 'inspect') inspect(!picking);
    else if (k === 'tool') {
      tool = tool === 'pen' ? 'box' : 'pen';
      tools();
      ink?.focus();
    } else if (k === 'snap') snap();
    else if (k === 'zoom' && ready) {
      view!.setZoomFactor(1);
      showZoom(1);
    }
  });
  btn('refresh').addEventListener('hardreload', () => reload(true));

  el.addEventListener('keydown', (e) => {
    if (!send || !WEBVIEW || toolOff('inspect')) return;
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') inspect(!picking);
    else if (e.key === 'Escape' && picking) inspect(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  function inspect(on: boolean) {
    if (on && (!box || !ready)) return;
    const n = ++picks;
    picking = on;
    tools();
    if (!on) return void view?.executeJavaScript('window.__amPick?.cancel()').catch(() => {});
    if (painting) paint(false);
    unpick();
    view!
      .executeJavaScript(`(${picker})()`)
      .then((r) => {
        if (n !== picks) return;
        picking = false;
        tools();
        if (r) showPick(r as Pick);
      })
      .catch((e) => {
        if (n !== picks) return;
        inspect(false);
        showErr(e);
      });
  }
  const blockOf = (r: Pick) => `[element on ${r.url}]\nselector: ${r.selector}\n${r.html}`;
  async function sendPick(r: Pick) {
    const pick = { label: `‹${r.name}›${r.text ? ' ' + (r.text.length > 30 ? r.text.slice(0, 30) + '…' : r.text) : ''}`, title: `${r.selector}\n\n${r.url}`, text: blockOf(r) };
    try {
      const to = await send!({ pick }, target() as string | undefined);
      if (to) setSave(`picked into ${to}`);
    } catch (e) {
      showErr(e);
    }
  }
  async function copyPick(r: Pick) {
    try {
      await navigator.clipboard.writeText(blockOf(r));
      setSave('element copied');
    } catch {
      setSave('could not copy', true);
    }
  }
  let off = () => {};
  function makeBar() {
    pbar = document.createElement('div');
    pbar.className = 'br-pick';
    pbar.setAttribute('role', 'toolbar');
    pbar.innerHTML = '<button type="button" data-pk="copy" title="Copy\nCopies the element\'s page, selector and HTML, to paste into any chat.">copy</button><i class="pk-sep" aria-hidden="true"></i><button type="button" data-pk="add"><span>＋ add to</span><span class="pk-to"></span></button>';
    pbar.addEventListener('mousedown', (e) => e.preventDefault());
    pbar.addEventListener('click', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-pk]')?.dataset.pk, r = held;
      if (!k || !r) return;
      unpick();
      if (k === 'copy') copyPick(r);
      else sendPick(r);
    });
    pbar.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      unpick();
    });
  }
  function addLabel() {
    const to = target(), c = to === 'new' ? null : to ? chats().find((x) => x.id === to) : last();
    const b = pbar!.querySelector<HTMLElement>('[data-pk="add"]')!, name = b.querySelector('.pk-to')!;
    const what = c ? (c.code ? `chat ${c.code} · ${c.title}` : c.title) : 'new chat';
    name.textContent = what;
    b.title = !c ? 'Add to a new chat\nOpens a new chat with the element in its message.' : `Add to chat\nPuts the element in a message to ${c.code ? `${c.code} ` : ''}${c.title}, ${to ? 'the chat you picked with the arrow' : 'the chat you used last'}.\n\nThe arrow on the bar picks another chat.`;
  }
  function showPick(r: Pick) {
    if (!box || !ready) return;
    if (!pbar) makeBar();
    if (pbar!.parentElement !== box) box.append(pbar!);
    held = r;
    addLabel();
    pbar!.hidden = false;
    const w = pbar!.offsetWidth, h = pbar!.offsetHeight, bw = box.clientWidth, bh = box.clientHeight, k = zoom;
    const top = r.rect.y * k, bottom = (r.rect.y + r.rect.h) * k;
    const y = bottom + 4 + h <= bh ? bottom + 4 : top - h - 4 >= 0 ? top - h - 4 : bh - h - 8;
    pbar!.style.left = Math.max(4, Math.min(r.rect.x * k, bw - w - 4)) + 'px';
    pbar!.style.top = Math.max(4, Math.min(y, bh - h - 4)) + 'px';
    off();
    off = onOutside(() => [pbar], () => unpick(), { trusted: true });
    const n = ++holds;
    view!
      .executeJavaScript(`(${holdPick})()`)
      .catch(() => {})
      .then(() => n === holds && unpick(false));
  }
  function unpick(inPage = true) {
    if (!held) return;
    held = null;
    holds++;
    if (pbar) pbar.hidden = true;
    off();
    if (inPage && ready) view?.executeJavaScript('window.__amHeld?.()').catch(() => {});
  }

  function tools() {
    const zm = el.querySelector('.br-zoom') as HTMLElement, bx = el.querySelector('.br-tools') as HTMLElement;
    if (zm) zm.hidden = toolOff('zoom');
    if (!bx) return;
    for (const k of ['inspect', 'paint', 'to']) btn(k).hidden = toolOff(k);
    btn('tool').hidden = btn('snap').hidden = toolOff('paint');
    bx.hidden = ['inspect', 'paint', 'to'].every(toolOff);
    btn('inspect').classList.toggle('on', picking);
    btn('inspect').setAttribute('aria-pressed', String(picking));
    btn('paint').classList.toggle('on', painting);
    btn('paint').setAttribute('aria-pressed', String(painting));
    btn('tool').disabled = btn('snap').disabled = !painting;
    btn('tool').innerHTML = ICON[tool as keyof typeof ICON];
    btn('tool').title = tool === 'pen' ? 'Tool: Pen\nDraws free lines. Click to draw boxes instead.' : 'Tool: Box\nDraws boxes. Click to draw free lines instead.';
  }
  function inkSize() {
    const dpr = window.devicePixelRatio || 1, w = Math.round(box!.clientWidth * dpr), h = Math.round(box!.clientHeight * dpr);
    if (ink!.width !== w || ink!.height !== h) Object.assign(ink!, { width: w, height: h });
    redraw();
  }
  function strokesOn(g: CanvasRenderingContext2D, k: number) {
    g.save();
    g.scale(k, k);
    Object.assign(g, { strokeStyle: INK, lineWidth: LINE, lineCap: 'round', lineJoin: 'round' });
    for (const s of drawing ? [...strokes, drawing] : strokes) {
      const a = s.pts[0], b = s.pts[s.pts.length - 1];
      g.beginPath();
      if (s.tool === 'box') g.rect(a.x, a.y, b.x - a.x, b.y - a.y);
      else s.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
    }
    g.restore();
  }
  function redraw() {
    const g = ink!.getContext('2d')!;
    g.clearRect(0, 0, ink!.width, ink!.height);
    strokesOn(g, window.devicePixelRatio || 1);
  }
  const at = (e: PointerEvent) => {
    const r = ink!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function makeInk() {
    ink = document.createElement('canvas');
    ink.className = 'br-ink';
    ink.tabIndex = -1;
    ink.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      drawing = { tool, pts: [at(e)] };
      track(e, {
        capture: ink,
        move: (m) => {
          if (!drawing) return;
          if (drawing.tool === 'box') drawing.pts[1] = at(m);
          else drawing.pts.push(at(m));
          redraw();
        },
        end: () => {
          if ((drawing?.pts.length as number) > 1) strokes.push(drawing!);
          drawing = null;
          redraw();
        },
      });
    });
    ink.addEventListener('keydown', (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') strokes.pop();
      else if (e.key === 'Delete' || e.key === 'Backspace') strokes = [];
      else if (e.key === 'Escape') paint(false);
      else if (ctrl && e.key === 'Enter') snap();
      else return;
      e.preventDefault();
      e.stopPropagation();
      if (painting) redraw();
    });
    box!.append(ink);
  }
  function paint(on: boolean) {
    if (on && (!box || !ready)) return;
    if (on && picking) inspect(false);
    if (on) unpick();
    painting = on;
    strokes = [];
    drawing = null;
    if (on && !ink) makeInk();
    if (ink) ink.hidden = !on;
    if (on) {
      inkSize();
      ink!.focus();
    }
    tools();
  }
  const target = () => (t.chatTo && (t.chatTo === 'new' || chats().some((c) => c.id === t.chatTo)) ? t.chatTo : null);
  const blobOf = (c: HTMLCanvasElement, type: string) => new Promise<Blob | null>((ok) => c.toBlob(ok, type));
  async function snap() {
    if (!painting || !ready) return;
    try {
      const png = await window.amethyst!.capturePage(view!.getWebContentsId());
      if (!png) throw new Error("the page's picture couldn't be taken");
      const img = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const k = img.width / box!.clientWidth;
      let blob = null;
      for (let f = 1; !blob || (blob.size > MAX_IMAGE && f > 0.1); f *= 0.75) {
        const c = document.createElement('canvas');
        Object.assign(c, { width: Math.max(1, Math.round(img.width * f)), height: Math.max(1, Math.round(img.height * f)) });
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0, c.width, c.height);
        strokesOn(g, k * f);
        blob = await blobOf(c, 'image/png');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      paint(false);
      setSave('screenshot copied');
    } catch (e) {
      showErr(e);
    }
  }
  function pickChat(e: MouseEvent) {
    const now = target(), r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const row = (id: string, label: string, d = '') => `<button class="mi" data-to="${esc(id)}">${now === (id || null) ? '✓ ' : ''}${esc(label)}${d ? `<span class="d">${esc(d)}</span>` : ''}</button>`;
    const html = row('', 'the chat used last', 'the one you last clicked or typed in') + chats().map((c) => row(c.id, c.title)).join('') + row('new', 'a new chat', 'opens beside this tab');
    popMenu(r.left, r.bottom + 2, html, (b) => {
      t.chatTo = b.dataset.to || null;
      changed({ chatTo: t.chatTo });
      tools();
    });
  }
  if (send && WEBVIEW) {
    btn('to').addEventListener('click', pickChat);
  }

  let shows = false;
  const seenSlot = onSize(slot, {
    name: 'browser.slot',
    live: true,
    write: (_, [e]) => {
      shows = e.contentRect.width > 0 && e.contentRect.height > 0;
      place();
    },
  });
  paintButtons();
  tools();
  const me = {
    el,
    place: () => shows && place(),
    reload,
    raise(n: number) {
      z = n;
      if (box) box.style.zIndex = n as unknown as string;
    },
    guest: () => (WEBVIEW && ready ? view!.getWebContentsId() : null),
    showZoom,
    tools,
    unpaint: () => {
      if (painting) paint(false);
      if (picking) inspect(false);
      unpick();
    },
    focus: () => input.select(),
    stop() {
      gone = true;
      unpick(false);
      clearTimeout(nap as number);
      seenSlot.disconnect();
      box?.remove();
      all.delete(me);
    },
  };
  all.add(me);
  return me;
}
