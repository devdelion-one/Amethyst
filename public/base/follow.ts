import { target } from './links.ts';
import { bands, ICONS, menuHead, miRow, popMenu, retip, viewImage } from './controls.ts';
import { gem } from './kinds.ts';
import { api, edShown, projectOf, S } from './model.ts';
import { page } from './page.ts';
import { onPref, pref } from './prefs.ts';
import { showErr } from './util.ts';
import type { Target } from './links.ts';

const outMod = (e: KeyboardEvent | MouseEvent) => {
  const was = document.body.classList.contains('out-mod'), on = (e.ctrlKey || e.metaKey) && e.shiftKey;
  document.body.classList.toggle('out-mod', on);
  if (was !== on) retip();
};
for (const ev of ['keydown', 'keyup', 'mousemove']) addEventListener(ev as 'keydown', outMod, true);
addEventListener('blur', () => {
  document.body.classList.remove('out-mod');
  retip();
});
const marks = () => document.documentElement.classList.toggle('no-lk-marks', !pref('linkMarks'));
marks();
onPref('linkMarks', marks);
const copyBtn = () => document.documentElement.classList.toggle('no-lk-copy', !pref('linkCopy'));
copyBtn();
onPref('linkCopy', copyBtn);
const picBtn = () => document.documentElement.classList.toggle('no-pic-copy', !pref('picCopy'));
picBtn();
onPref('picCopy', picBtn);
const chipX = () => document.documentElement.classList.toggle('no-chip-x', !pref('chipX'));
chipX();
onPref('chipX', chipX);

export const outside = (to: string) => api('POST', '/api/open-outside', { target: to }).catch(showErr);
export const openDefault = (to: string) => api('POST', '/api/open-default', { path: to }).catch(showErr);
export const showPath = (to: string) => api('POST', '/api/show-path', { path: to }).catch(showErr);

export const isPicture = (abs: string): boolean => /\.(png|jpe?g|gif|webp|bmp|ico)$/i.test(abs);
const viewPicture = (abs: string) => viewImage('/api/ext/raw?path=' + encodeURIComponent(abs), null, { tab: () => page.openPage(abs), out: () => showPath(abs) });

export const here = (href: unknown, base = ''): Target | null => target(href, { root: projectOf(S.pid)?.path, base, has: (p) => S.thoughts.has(p), isDir: (p) => S.dirs.has(p) });

export function follow(t: Target | null | undefined, { out = false, openFile = null, reveal = page.reveal }: { out?: boolean; openFile?: ((rel: string) => unknown) | null; reveal?: (rel: string) => unknown } = {}): boolean {
  if (t?.kind === 'mail' || (out && t?.kind === 'web')) return outside(t.url!), true;
  if (t?.kind === 'web') {
    if (window.amethyst?.webview) page.openPage(t.url!);
    else window.open(t.url, '_blank', 'noopener');
    return true;
  }
  if (t?.kind !== 'path') return false;
  if (out) return showPath(t.abs!), true;
  if (t.abs!.startsWith('~')) return outside(t.abs!), true;
  if (t.dir) return (t.rel != null ? reveal(t.rel) : outside(t.abs!)), true;
  const editor = edShown(), th = t.rel != null ? S.thoughts.get(t.rel) : null;
  if (!th?.board && isPicture(t.abs!)) return viewPicture(t.abs!), true;
  const asPage = !th?.board && ((t.sort === 'page' && window.amethyst?.webview) || t.sort === 'image' || t.sort === 'pdf');
  if (asPage) page.openPage(t.abs!);
  else if (th && openFile && (editor || !th.file)) openFile(t.rel!);
  else if (!th && editor) page.openFiles([t.abs!]);
  else outside(t.abs!);
  return true;
}
export function linkMenu(e: MouseEvent, t: Target | null | undefined, { openFile = null }: { openFile?: ((rel: string) => unknown) | null } = {}): boolean {
  if (!['web', 'path', 'mail'].includes(t?.kind as string)) return false;
  const file = t?.kind === 'path' && !t.dir && !t.abs!.startsWith('~');
  const web = t?.kind === 'web', what = web ? 'page' : 'file';
  const items: [string, string, string, string, string][] = [
    ['open', ICONS.tab, web ? 'open in a tab' : 'open', web ? 'Opens the page in a browser tab here.' : t?.kind === 'mail' ? 'Opens the address in your mail app.' : t?.dir ? 'Shows the folder.' : 'Opens the file here.', web ? 'ctrl click' : ''],
    ...(web || file ? [['window', ICONS.newWin, 'open in a new window', `Opens the ${what} in a tab in a new window of the app.`, ''] as [string, string, string, string, string]] : []),
    ...(web || (file && t!.sort !== 'other') ? [['out', ICONS.outBrowser, 'open in your web browser', `Opens the ${what} in the web browser your system uses (Chrome, Edge…).`, web ? 'ctrl shift click' : ''] as [string, string, string, string, string]] : []),
  ];
  const name = web ? t!.url!.replace(/^[a-z]+:\/\/(www\.)?/i, '').replace(/\/$/, '') : t?.kind === 'mail' ? t.url!.replace(/^mailto:/i, '') : t!.abs!.split(/[\\/]/).pop() || t!.abs!;
  e.preventDefault();
  const html = menuHead(web || t?.kind === 'mail' ? ICONS.page : gem('file'), name) + bands({ actions: items.map(([k, ic, l, tip, key]) => miRow(`data-k="${k}"`, ic, l, key, tip)).join('') });
  popMenu(e.clientX, e.clientY, html, (b) => {
    const k = b.dataset.k;
    if (k === 'open') follow(t, { openFile });
    else if (k === 'window') page.openInWindow(t);
    else outside((t!.kind === 'web' ? t!.url : t!.abs) as string);
  });
  return true;
}
