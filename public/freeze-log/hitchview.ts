import { barMenu, dragWindow, rowIcons, sizeBar } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { tell } from '../base/notify.ts';
import { setSolid, setTheme } from '../base/theme.ts';
import { esc, store } from '../base/util.ts';
import { hgBar, hgHead, KINDS, SNAPS } from './hgbar.ts';

const desk = window.amethyst!;
const MAX = 2000;
const kindOf = (t: string) => (/^error /.test(t) ? 'err' : /^busy/.test(t) ? 'busy' : /^(action|switch)\b/.test(t) ? 'act' : /^slow |unresponsive|stalled| gone:/.test(t) ? 'slow' : 'app');
const bad = (k: string, t: string) => k === 'err' || /unresponsive|stalled| gone:/.test(t) || ((k === 'slow' || k === 'act') && +(t.match(/(\d+) ms/)?.[1] || 0) >= 500);

document.body.insertAdjacentHTML(
  'beforeend',
  `<section class="qtwin hgwin" aria-label="freeze log">${hgHead()}<div class="hg-body"><div class="hg-lines" tabindex="0"></div><p class="hg-empty" hidden>nothing yet: lines come when a frame is slow, a click takes long, the page keeps redrawing, a window is resized or moved, the app hangs or something in the code fails</p>${hgBar()}<button class="hg-new" hidden>↓ new lines</button></div></section>`,
);
const win = document.querySelector('.hgwin')!, head = win.querySelector('.fw-head')!, list = win.querySelector('.hg-lines') as HTMLElement;
const empty = win.querySelector('.hg-empty') as HTMLElement, more = win.querySelector('.hg-new') as HTMLElement;

let off = new Set(store.get('hitch:off', []));
function paintKinds() {
  for (const [k] of KINDS) {
    list.classList.toggle('no-' + k, off.has(k));
    win.querySelector(`[data-hgk="${k}"]`)!.setAttribute('aria-pressed', String(!off.has(k)));
  }
}
paintKinds();
const paintBar = () => {
  (win.querySelector('[data-hgdir]') as HTMLElement).hidden = isOff('hgbar:off', 'file');
  win.querySelectorAll('[data-hgsnap]').forEach((b) => ((b as HTMLElement).hidden = isOff('hgbar:off', 'snaps')));
};
paintBar();
onPref('hgbar:off', paintBar);
rowIcons({ 'hgbar:off:file': () => icon('file'), 'hgbar:off:snaps': () => icon('image') });
barMenu('.hg-bar', 'hgbar');
win.querySelector('.hg-bar')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if ('hgdir' in b.dataset) return desk.hitchFolder();
  if (b.dataset.hgsnap) return snap(b);
  const k = b.dataset.hgk!;
  off.has(k) ? off.delete(k) : off.add(k);
  store.set('hitch:off', [...off]);
  paintKinds();
});

let busy = false;
async function snap(b: HTMLElement) {
  if (busy) return;
  busy = true;
  const label = b.querySelector('b')!, rest = label.textContent, rec = b.dataset.hgsnap === 'rec';
  let left = 10, tick: any = 0;
  if (rec) {
    label.textContent = `recording ${left} s`;
    tick = setInterval(() => (label.textContent = `recording ${Math.max(1, --left)} s`), 1000);
  } else label.textContent = 'saving';
  const r = await (rec ? desk.hitchRecord() : desk.hitchSnapshot());
  clearInterval(tick);
  label.textContent = r?.path ? 'path copied' : 'failed';
  if (r?.devtools) tell(win.querySelector('.hg-body'), { title: "Window 1's page wasn't profiled", line: 'DevTools is open on it: close DevTools, then record again (the server was profiled)', ms: 4000 });
  else if (r?.error) tell(win.querySelector('.hg-body'), { title: 'the snapshot failed', line: r.error, ms: 4000 });
  setTimeout(() => ((label.textContent = rest), (busy = false)), 2000);
}

const atEnd = () => list.scrollHeight - list.scrollTop - list.clientHeight < 8;
function add(text: string) {
  const rows = text.split('\n').filter(Boolean);
  if (!rows.length) return;
  const follow = atEnd();
  list.insertAdjacentHTML(
    'beforeend',
    rows
      .map((r: string) => {
        const m = r.match(/^\S+ (\S+) \[([^\]]*)\] (.*)$/);
        if (!m) return `<div class="hg-l k-app">${esc(r)}</div>`;
        const k = kindOf(m[3]);
        return `<div class="hg-l k-${k}${bad(k, m[3]) ? ' bad' : ''}"><span class="hg-t">${esc(m[1])}</span> <span class="hg-w">${esc(m[2])}</span> ${esc(m[3])}</div>`;
      })
      .join(''),
  );
  for (let n = list.childElementCount - MAX; n > 0; n--) list.firstElementChild!.remove();
  empty.hidden = true;
  if (follow) list.scrollTop = list.scrollHeight;
  else more.hidden = false;
}
list.addEventListener('scroll', () => atEnd() && (more.hidden = true));
more.addEventListener('click', () => ((list.scrollTop = list.scrollHeight), (more.hidden = true)));

let ready = false;
desk.onHitch((text) => ready && add(text));
desk.hitchTail().then((text) => {
  ready = true;
  add(text);
  empty.hidden = list.childElementCount > 0;
  list.scrollTop = list.scrollHeight;
});

setTheme(store.text('theme3')!);
addEventListener('storage', (e) => (e.key === 'mind.theme3' ? setTheme(e.newValue!) : e.key === 'mind.solid' && setSolid(e.newValue!)));
if (desk.onSize) desk.onSize(sizeBar(head, (k) => desk.sizeWindow(k), 'hitch'));
dragWindow(head);
document.documentElement.classList.add('wbar');
head.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-hghide]')) desk.minimizeWindow();
  else if ((e.target as HTMLElement).closest('[data-hgx]')) desk.hitchWindow(null);
});
