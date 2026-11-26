import { barMenu, chip, floatBox, ICONS, sizeBar } from '../base/controls.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { fileIcon, fileTint, nameHtml } from '../base/filelook.ts';
import { flushNow } from '../editor/editor.ts';
import { tell } from '../base/notify.ts';
import { gem, NAME } from '../base/kinds.ts';
import { inboxLoc, levelKey, mode, pageUrl, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { placeBrowsers } from '../browser/browser.ts';
import { activate, activeGroup, browsers, fileNamed, makeFile, openBrowser, openInTab, scratch, sketch, storeTab, tab as newTab, takeTabs, urlTab } from './tabs.ts';
import { browserOf, openWindow } from './groups.ts';
import { $, esc, fileUrl, setSave, store } from '../base/util.ts';
import { isOpen, isSpare, leadId, POP, popWith, reach, send, SOLO, spareWin, WIN } from '../base/windows.ts';
import { tag } from '../base/hitch.ts';
import type { FloatTabs } from '../base/types.ts';
import { onSize } from '../base/measure.ts';
import { onPlace } from './places.ts';

type FTab = { id: string; kind: string; path?: string | null; url?: string; title?: string };
type Msg = [string, Record<string, unknown>];
type Quick = { act?: string; type?: string; path?: string | null; url?: string; line?: number; text?: boolean };
type Box = { x: number; y: number; w: number; h: number };

const hint = $<HTMLElement>('#fw-snap');
const MIN_W = 320, MIN_H = 200;

const ibTab = Object.assign(document.createElement('div'), { id: 'inbox-tab' });
const ibDrawn = new Map<HTMLElement, string>();
const NEW_IB = '<span class="pl">+</span><span class="nm">new file</span>';
const noNew = () => ibTab.classList.toggle('no-new', isOff('inbox:off', 'new'));
noNew();
onPref('inbox:off', noNew);
barMenu('.fwi-list', 'inbox', { order: false, skip: '.fwi-f', make: () => ({ acts: `<button class="mi" data-fwnewrow title="Asks for a name, then makes the file in the ${NAME.inbox}."><i class="tb-ic">${ICONS.newFile}</i><span class="mi-n">new file…</span>${chip('n')}</button>`, onPick: (b) => 'fwnewrow' in b.dataset && nameNew(ibTab) }) });
const newRow = () => `<div class="fwi-new" data-fwnew role="button" title="New file\nMakes a new file in the ${NAME.inbox}. Type its name, then press enter." data-tip-keys="=n:new file">${NEW_IB}</div>`;
const fileBtn = (t: { path: string; name: string; board?: unknown }) => `<button class="fwi-f" data-fwopen="${esc(t.path)}"><i class="fwi-ic" style="${fileTint(t.name)}">${fileIcon(!!t.board)}</i><span class="nm">${nameHtml(t.name)}</span></button>`;
export const inboxPic = () => `<div class="fwi-list">${newRow()}<div class="fwi-files">${[...(S.inbox?.thoughts || [])].slice(0, 2).map(fileBtn).join('')}</div></div>`;
function drawInbox(el = ibTab) {
  const root = S.dirs.get('');
  if (!root || !S.inbox) return;
  if (!el.querySelector('.fwi-files')) {
    el.innerHTML = `<div class="fwi-list" tabindex="0">${newRow()}<div class="fwi-files"></div></div>`;
    ibDrawn.delete(el);
  }
  const list = [...S.inbox.thoughts].sort((a, b) => (b.touched || 0) - (a.touched || 0));
  const files = list.map(fileBtn).join('');
  const html = files || `<div class="empty">No files in the ${NAME.inbox.toUpperCase()} yet. New files and anything you drop here show up in this list.</div>`;
  if (html !== ibDrawn.get(el)) (el.querySelector('.fwi-files')!.innerHTML = html), ibDrawn.set(el, html);
}
export function inboxTab() {
  drawInbox(ibTab);
  return ibTab;
}
const ibOpen = (p: string | null | undefined) => p && (POP ? send('openq', { path: p }) : openInTab(p, { beside: true }));
function nameNew(el: HTMLElement) {
  const box = el.querySelector<HTMLElement>('.fwi-new');
  if (!box) return;
  const was = box.querySelector('input');
  if (was) return was.focus();
  box.classList.add('naming');
  box.innerHTML = `<i class="fwi-ic">${fileIcon()}</i><input class="fwi-name" spellcheck="false" autocomplete="off" placeholder="like test.md" aria-label="name of the new file">`;
  const input = box.querySelector('input')!, ic = box.querySelector<HTMLElement>('.fwi-ic')!;
  let done = false;
  const end = () => {
    done = true;
    box.classList.remove('naming');
    box.innerHTML = NEW_IB;
  };
  input.addEventListener('input', () => ic.setAttribute('style', fileTint(input.value.trim())));
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      end();
      el.querySelector<HTMLElement>('.fwi-list')?.focus();
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = input.value.trim();
    end();
    const list = el.querySelector<HTMLElement>('.fwi-list');
    list?.focus();
    if (name) fileNamed(inboxLoc(), name).then(() => !el.contains(document.activeElement) && list?.focus());
  });
  input.addEventListener('blur', () => setTimeout(() => !done && document.activeElement !== input && end()));
  input.focus();
}
ibTab.addEventListener('mousedown', (e) => {
  const b = (e.target as HTMLElement).closest('.fwi-new');
  if (!b || b.querySelector('input')) return;
  e.preventDefault();
  nameNew(ibTab);
});
ibTab.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey || !t.matches('.fwi-list')) return;
  e.preventDefault();
  e.stopPropagation();
  nameNew(ibTab);
});
ibTab.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-fwopen]') as HTMLElement;
  if (b) ibOpen(b.dataset.fwopen);
});
ibTab.addEventListener('contextmenu', (e) => {
  const b = (e.target as HTMLElement).closest('.fwi-f');
  if (!b) return;
  e.preventDefault();
  tell(b, { title: 'No menu on a file here', line: "open it to work on it; right-click an empty spot for the list's own menu", ms: 2500 });
});

export const desk = () => !!window.amethyst?.desktop && WIN === 1 && !!S.pid;
let quick: { n: number; at: number; lvl: string } | null = null;
async function liveWin() {
  const own = (await window.amethyst?.quickOf?.()) || 0, kept = quick && quick.lvl === levelKey() && (isOpen(quick.n) || Date.now() - quick.at < 3000) ? quick.n : 0, heard = popWith(levelKey(), 'quick');
  const n = own || kept || heard;
  tag(`quick window: the app knows ${own || 'none'}, remembered ${kept || 'none'}, heard ${heard || 'none'}`);
  return n;
}
async function quickOut(t: Quick) {
  const n = await liveWin();
  if (n && (await reach(n, [['quickopen', { open: t }], ['raise', {}]]))) return void tag(`quick window: reused ${n}`);
  tag(`quick window: ${n ? `${n} did not answer, ` : ''}a new one`);
  quick = null;
  if (!(await quickNew(t))) setSave('the Quick Window could not open', true);
}
const solos = new Map<string, { n: number; at: number }>();
type SoloOpts = { more?: string; msgs?: Msg[]; warm?: Msg | null };
const opening = new Map<string, Promise<void>>();
export function soloOut(kind: string, o: SoloOpts = {}) {
  const was = opening.get(kind);
  const p: Promise<void> = (was ? was.catch(() => {}).then(() => soloGo(kind, o)) : soloGo(kind, o)).finally(() => opening.get(kind) === p && opening.delete(kind));
  opening.set(kind, p);
  return p;
}
async function soloGo(kind: string, { more = '', msgs = [], warm = null }: SoloOpts) {
  const own = (await window.amethyst?.soloFront?.(kind)) || 0;
  tag(`${kind} window: the app knows ${own || 'none'}`);
  if (own) return void msgs.forEach(([t, d]) => send(t, { win: own, ...d }));
  const m = solos.get(levelKey() + '|' + kind);
  const n = popWith(levelKey(), kind) || (m && (isOpen(m.n) || Date.now() - m.at < 3000) ? m.n : 0);
  if (n && (await reach(n, [...msgs, ['raise', {}]]))) return;
  const s = warm && (await fromSpare(warm));
  if (s) return void solos.set(levelKey() + '|' + kind, { n: s, at: Date.now() });
  const w = await openWindow(undefined, undefined, { w: kind === 'inbox' ? 1000 : 720, h: 520, pop: true, more: `&solo=${kind}${more}` });
  if (!w) return;
  takeTabs(w);
  if (kind !== 'qagent' && !kind.startsWith('activity-')) storeTab(w, newTab(kind));
  solos.set(levelKey() + '|' + kind, { n: w, at: Date.now() });
}
const home = () => ({ w: S.wid, p: S.pid });
let spareDue = true, spareAt = 0;
async function fromSpare(msg: Msg) {
  const s = desk() && spareWin();
  if (!s) return 0;
  spareDue = true;
  if ((await reach(s, [[msg[0], { ...msg[1], ...home() }]])) && (await window.amethyst!.claimSpare(leadId()))) return s;
  send('close', { win: s });
  return 0;
}
async function ensureSpare() {
  if (!desk() || spareWin() || Date.now() - spareAt < 10000) return;
  spareAt = Date.now();
  const n = await openWindow(undefined, undefined, { w: 720, h: 520, pop: true, more: '&spare=1' });
  if (!n) return;
  takeTabs(n);
  spareAt = Date.now();
}
const nextSpare = () => ((spareDue = false), setTimeout(() => requestIdleCallback(ensureSpare), 2000));
async function quickNew(t: Quick) {
  const s = desk() && spareWin();
  if (s) {
    quick = { n: s, at: Date.now(), lvl: levelKey() };
    spareDue = true;
    if ((await reach(s, [['claim', { open: t, ...home() }]])) && (await window.amethyst!.claimSpare(leadId()))) return true;
    quick = null;
    send('close', { win: s });
  }
  const n = await openWindow(null, null, { pop: true, more: t.act ? '&act=board' : '' });
  if (!n) return false;
  takeTabs(n);
  if (!t.act) storeTab(n, t.url ? { ...newTab('browser'), url: t.url } : newTab(t.type!, t.path || null));
  quick = { n, at: Date.now(), lvl: levelKey() };
  return true;
}

const AWAY: Record<string, string[]> = { quick: ['file', 'the Quick Window', 'Quick Window'], qagent: ['ai', 'the quick agent', 'Quick Agent'], scratch: ['scratch', 'the scratch', 'Scratch pad'], sketch: ['sketch', 'the sketch', 'Sketch board'], inbox: ['inbox', `the ${NAME.inbox}`, 'Inbox'], term: ['term', 'the terminal', 'Quick terminal'], pwsh: ['', 'PowerShell', 'Quick PowerShell'], hitch: ['', 'the freeze log', 'Freeze log'] };
const awayDock = $<HTMLElement>('#aw-dock');
export const awayHtml = (kinds: string[]) => kinds.filter((k) => AWAY[k]).map((k) => `<button data-aw="${k}" title="${AWAY[k][2]}\nShows the window again. You minimized it here." aria-label="show ${AWAY[k][1]}">${AWAY[k][0] ? gem(AWAY[k][0]) : (k === 'hitch' ? ICONS.bug : '<b class="aw-ps">ps</b>')}</button>`).join('');
export function paintAway(kinds: string[]) {
  awayDock.innerHTML = awayHtml(kinds);
  awayDock.hidden = !awayDock.children.length;
}
if (WIN === 1) {
  window.amethyst?.onAway?.(paintAway);
  awayDock.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-aw]');
    if (b) window.amethyst!.showWindow(b.dataset.aw);
  });
}

const inQuick = () => POP && !SOLO && !isSpare();
const noProject = () => tell($('header.bar'), { title: 'No project open', line: 'the small windows belong to a project: open one first', ms: 2500 });

export function toggleInbox() {
  if (!S.pid) return noProject();
  return soloOut('inbox');
}

export async function floatMake(kind: string, ext = '', dir: string | null = null) {
  if (kind === 'text' && !S.pid) return makeFile(dir, ext).then((path) => path && openInTab(path));
  if (!S.pid) return noProject();
  if (kind === 'scratch' || kind === 'sketch') return soloOut(kind);
  if (kind === 'text') return makeFile(dir, ext).then((path) => path && quickOut({ type: 'text', path }));
  return quickOut(kind === 'board' ? { act: 'board' } : { type: kind });
}

export function padOut(kind: 'scratch' | 'sketch') {
  if (SOLO === kind) return void window.amethyst?.minimizeWindow?.();
  if (window.amethyst?.desktop || mode() !== 'editor') return floatMake(kind);
  return kind === 'scratch' ? scratch() : sketch();
}

const kindOf = (path: string) => {
  const th = S.thoughts.get(path);
  return th && (th.board ? 'board' : th.code ? 'text' : '');
};
export function floatOpen(path: string, line = 0, text = false) {
  const url = !text && pageUrl(path);
  if (url) return openPage(url), true;
  const kind = text ? 'text' : kindOf(path);
  if (!kind || !S.pid || inQuick()) return false;
  return quickOut({ type: kind, path, ...(line ? { line } : {}), ...(text ? { text } : {}) }), true;
}

const name = (x: FTab) => x.title || pageName(x);
let pwDrawn = '', pwDocked = '';
function placeFloat() {
  if (spareDue && desk()) nextSpare();
  placePages();
  stack();
  placeBrowsers();
}
onPlace(placeFloat);

let areaNow: { left: number; right: number; top: number; bottom: number; width: number; height: number } | null = null;
function area() {
  if (areaNow) return areaNow;
  const top = $('.bar').getBoundingClientRect().bottom, bottom = $('#status').getBoundingClientRect().top;
  return (areaNow = { left: 0, right: innerWidth, top, bottom, width: innerWidth, height: bottom - top });
}
onSize([$('.bar'), $('#status')], { name: 'float.area', live: true, write: () => (areaNow = null) });
addEventListener('resize', () => (areaNow = null));
function within(at: Box) {
  const d = area();
  const w = Math.min(Math.max(MIN_W, at.w), d.width - 16), h = Math.min(Math.max(MIN_H, at.h), d.height - 16);
  return { w, h, x: Math.min(Math.max(d.left + 8, at.x), d.right - w - 8), y: Math.min(Math.max(d.top + 8, at.y), d.bottom - h - 8) };
}
function sizeOf(k: number) {
  const d = area(), w = k === 1 ? d.width - 16 : k === 8 ? d.width / 4 - 10 : d.width / 2 - 12, h = k >= 4 ? d.height / 2 - 12 : d.height - 16;
  return { w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) };
}
export function preset(k: number, at: { x: number; y: number } | null = null) {
  const d = area(), { w, h } = sizeOf(k);
  return within({ w, h, x: at ? at.x : d.right - w - 8, y: at ? at.y : d.bottom - h - 8 });
}
function snapBox(z: string) {
  const d = area(), { w, h } = sizeOf(z.length > 1 ? 4 : 2);
  return { w, h, x: z.includes('w') ? d.left + 8 : d.right - w - 8, y: z.includes('n') ? d.top + 8 : d.bottom - h - 8 };
}
const PUSH = 16;
function pushedAt(raw: Box) {
  const d = area(), wide = raw.w >= d.width - 17, tall = raw.h >= d.height - 17;
  const side = wide ? '' : raw.x < d.left + 8 - PUSH ? 'w' : raw.x + raw.w > d.right - 8 + PUSH ? 'e' : '';
  const end = tall ? '' : raw.y < d.top + 8 - PUSH ? 'n' : raw.y + raw.h > d.bottom - 8 + PUSH ? 's' : '';
  return side ? end + side : null;
}
const EDGE = 24, CORNER = 80;
function zoneAt(x: number, y: number) {
  const d = area();
  const side = (m: number) => (x < d.left + m ? 'w' : x > d.right - m ? 'e' : '');
  const end = (m: number) => (y < d.top + m ? 'n' : y > d.bottom - m ? 's' : '');
  if (side(CORNER) && end(CORNER)) return end(CORNER) + side(CORNER);
  return side(EDGE) || null;
}
function showHint(z: string | null) {
  hint.classList.toggle('on', !!z);
  if (!z) return;
  const r = snapBox(z);
  Object.assign(hint.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
const BOX_PLACE: Record<string, string> = { pageWin: 'quick', actWin: 'activity', qaWin: 'qagent', revWin: 'review', 'qtWin:term': 'qterm', 'qtWin:pwsh': 'pwsh', ueWin: 'ue' };
const placeOfBox = (key: string) => BOX_PLACE[key] || 'quick';
export function frame(box: HTMLElement, key: string, first: () => Box): { fit: () => void } {
function fit() {
  const kept = store.get(key, null);
  const b = within(kept?.snap ? snapBox(kept.snap) : kept?.preset ? preset(kept.preset, kept) : kept || first());
  Object.assign(box.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
  lit([1, 2, 4].find((k) => { const s = sizeOf(k); return Math.abs(s.w - b.w) <= 2 && Math.abs(s.h - b.h) <= 2; }) || 0);
  placeBrowsers();
}
const lit = sizeBar(box.querySelector('.fw-head')!, (k) => {
  store.set(key, { preset: k, x: parseFloat(box.style.left), y: parseFloat(box.style.top) });
  fit();
}, placeOfBox(key), false);
let shown: string | null = null;
floatBox(box, {
  head: box.querySelector<HTMLElement>('.fw-head')!,
  when: (e) => !e.target.closest('button,.fw-tab'),
  min: [MIN_W, MIN_H],
  keep: within,
  frame({ raw, edge, ev }) {
    placeBrowsers();
    const zone = edge ? null : zoneAt(ev.clientX, ev.clientY) || pushedAt(raw);
    if (zone !== shown) showHint((shown = zone));
  },
  drop(b, { raw, edge, moved, ev }) {
    const zone = moved && !edge ? zoneAt(ev.clientX, ev.clientY) || pushedAt(raw) : null;
    showHint((shown = null));
    if (zone) store.set(key, { ...snapBox(zone), snap: zone });
    else if (moved) {
      const kept = store.get(key, null), k = !edge && (kept?.preset || (kept?.snap ? (kept.snap.length > 1 ? 4 : 2) : 0));
      store.set(key, k ? { preset: k, x: b.x, y: b.y } : b);
    }
    fit();
  },
});
addEventListener('resize', () => !box.hidden && fit());
return { fit };
}
async function tabEnd(e: DragEvent, f: FloatTabs | null, closeIt: (id: string) => unknown) {
  const t = f?.tabs.find((x) => x.id === (e.target as HTMLElement).closest?.<HTMLElement>('[data-fwtab]')?.dataset.fwtab);
  if (!t) return;
  const out = e.screenX < screenX || e.screenY < screenY || e.screenX > screenX + outerWidth || e.screenY > screenY + outerHeight;
  if (e.dataTransfer!.dropEffect !== 'move' && !out) return;
  if (e.dataTransfer!.dropEffect !== 'move') {
    const n = await openWindow(e.screenX - 120, e.screenY - 20);
    if (!n) return;
    await flushNow();
    storeTab(n, { ...newTab('browser'), url: t.url });
  }
  closeIt(t.id);
}

const pw = $<HTMLElement>('#pagewin'), pwBody = $<HTMLElement>('#pw-body'), pwStrip = $<HTMLElement>('#pw-tabs'), pwDock = $<HTMLElement>('#pw-dock');
const pages = frame(pw, 'pageWin', () => snapBox('w'));

function tabsHtml(f: FloatTabs) {
  return f.tabs.map((x: FTab) => `<div class="tab fw-tab${x.id === f.on ? ' on' : ''}" draggable="true" data-fwtab="${x.id}" title="${esc(x.url ? `${x.url}\nThe page this browser tab shows.` : name(x))}"${x.url ? ' data-tip-mono' : ''}><i class="tm">${gem('link')}</i><span class="nm">${esc(name(x))}</span><button class="tx" data-fwx="${x.id}" title="Close&#10;Closes this tab." aria-label="close">×</button></div>`).join('');
}
function pageName(x: FTab) {
  try {
    return decodeURIComponent(new URL(x.url!).pathname.split('/').pop()!) || x.url;
  } catch {
    return x.url;
  }
}
function dropPage(id: string) {
  browsers.get(id)?.stop();
  browsers.delete(id);
}
pw.style.zIndex = '32';
function stack() {
  const f = S.pages, t = f?.tabs.find((x) => x.id === f.on && x.kind === 'browser');
  if (t) browserOf(t).raise(33);
}

function showPage(id: string) {
  S.pages!.on = id;
  S.pages!.min = false;
  page.layout();
}
export function openPage(to: string) {
  const url = /^(https?|file):/i.test(to) ? to : fileUrl(to);
  if (mode() === 'editor') {
    const have = urlTab(url);
    return have ? activate(have.g, have.t) : openBrowser(url, null, false, activeGroup());
  }
  if (desk()) return void quickOut({ url });
  const open = S.pages?.tabs.find((t) => t.url === url);
  if (open) return showPage(open.id);
  if (S.pages?.pid !== S.pid) closePages();
  S.pages ||= { pid: S.pid, tabs: [], on: null };
  const t = { id: Math.random().toString(36).slice(2, 9), kind: 'browser', url };
  S.pages.tabs.push(t);
  showPage(t.id);
}
function closePages() {
  S.pages?.tabs.forEach((t) => dropPage(t.id));
  S.pages = null;
  page.layout();
}
function closePage(id: string) {
  const f = S.pages!, i = f.tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  dropPage(id);
  f.tabs.splice(i, 1);
  if (!f.tabs.length) return closePages();
  if (f.on === id) f.on = f.tabs[Math.min(i, f.tabs.length - 1)].id;
  page.layout();
}
function placePages() {
  const f = S.pages;
  if (f && f.pid !== S.pid) return closePages();
  if (f && mode() === 'editor') {
    const tabs = [...f.tabs];
    closePages();
    return tabs.forEach((t) => openBrowser(t.url, null, false, activeGroup()));
  }
  const t = f?.tabs.find((x) => x.id === f.on);
  pw.hidden = !t || !!f!.min;
  const docks = t && f!.min ? `<button class="fwd-show" data-pwshow><i class="tm">${gem('link')}</i><span class="nm">${esc(name(t))}</span></button><button class="x" data-pwclose aria-label="close">×</button>` : '';
  if (docks !== pwDocked) {
    pwDock.innerHTML = pwDocked = docks;
    pwDock.hidden = !docks;
  }
  if (!t) {
    pwDrawn = '';
    return;
  }
  const html = tabsHtml(f!);
  if (html !== pwDrawn) {
    pwStrip.innerHTML = pwDrawn = html;
    pwStrip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const el = browserOf(t).el;
  for (const c of [...pwBody.children]) if (c !== el) c.remove();
  if (el.parentNode !== pwBody) pwBody.append(el);
  pages.fit();
}
function onPages(e: MouseEvent) {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-fwx],[data-fwtab],[data-pwclose],[data-pwmin],[data-pwshow]');
  if (!b || !S.pages) return;
  const d = b.dataset;
  if (d.fwx) return closePage(d.fwx);
  if (d.fwtab) return d.fwtab !== S.pages.on && showPage(d.fwtab);
  if ('pwclose' in d) return closePages();
  S.pages.min = 'pwmin' in d;
  page.layout();
}
pw.addEventListener('click', onPages);
pwDock.addEventListener('click', onPages);
pwStrip.addEventListener('wheel', (e) => (pwStrip.scrollLeft += e.deltaY), { passive: true });
pwStrip.addEventListener('dragstart', (e) => {
  const t = S.pages?.tabs.find((x) => x.id === (e.target as HTMLElement).closest?.<HTMLElement>('[data-fwtab]')?.dataset.fwtab);
  if (!t) return;
  e.dataTransfer!.setData('text/plain', 'page');
  e.dataTransfer!.effectAllowed = 'move';
});
pwStrip.addEventListener('dragend', (e) => tabEnd(e, S.pages, closePage));
