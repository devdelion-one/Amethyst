import { bound, is, show } from '../base/binds.ts';
import { ask, dragWindow, fwHead, ICONS, sizeBar, winX } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { createTerm, warmTerm } from './term.ts';
import { setTheme } from '../base/theme.ts';
import { $, addrPlace, amTag, placeKey, store } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import { onPlace } from '../app/places.ts';

const POP = location.pathname === '/qterm.html';
const desk = window.amethyst;
const WINOS = /Windows/.test(navigator.userAgent);
const NAMES: Record<string, string> = { term: 'terminal', pwsh: 'PowerShell' };
export const qtHead = (kind: string, pop: boolean) => fwHead(NAMES[kind], gem('term'), winX(ICONS.wmin, `data-qthide aria-label="${pop ? 'minimize' : 'hide'}"`) + winX(ICONS.wx, 'data-qtx title="Close&#10;Its shell ends; the next one starts fresh." aria-label="close"'));
export const QKEYS: Record<string, string> = { term: 'quickTerm', pwsh: 'quickPwsh' };
export const PROG: Record<string, string | null> = { term: WINOS ? 'cmd' : 'shell', pwsh: WINOS ? 'shell' : null };
const KINDS = Object.keys(NAMES).filter((k) => PROG[k] && (!POP || k === new URLSearchParams(location.search).get('kind')));
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((z) => `<i data-rs="${z}"></i>`).join('');

const OWN = !!desk?.quickWindow;
const here = () => (POP ? addrPlace() : { wid: S.wid, pid: S.pid });
const stKey = (kind: string) => `qterm:${kind}:${placeKey(here().wid, here().pid)}`;
const isOpen = (kind: string) => (OWN ? outNow.includes(kind) : !!store.get(stKey(kind), false));
const setOpen = (kind: string, on: boolean) => OWN || store.set(stKey(kind), on);
let outNow: string[] = [];

type Cur = { key: string; ended: boolean; view: ReturnType<typeof createTerm> };
type Win = { kind: string; el: HTMLElement; body: HTMLElement; pj: HTMLElement; cur: Cur | null; fr: { fit(): void } | null };
const wins: Record<string, Win> = {};
function makeWin(kind: string): Win {
  const el = document.createElement('section');
  el.className = 'box qtwin';
  el.dataset.qt = kind;
  el.hidden = true;
  el.setAttribute('aria-label', 'quick ' + NAMES[kind]);
  el.innerHTML = `${qtHead(kind, POP)}<div class="qt-body"></div>${POP ? '' : RS}`;
  ($('#app') || document.body).append(el);
  const w = { kind, el, body: el.querySelector('.qt-body') as HTMLElement, pj: el.querySelector('.qt-name') as HTMLElement, cur: null, fr: null };
  if (POP && (desk!.onSize as unknown)) desk!.onSize(sizeBar(el.querySelector('.fw-head')!, (k) => desk!.sizeWindow(k), kind === 'pwsh' ? 'pwsh' : 'qterm'));
  if (POP) dragWindow(el.querySelector('.fw-head')!);
  if (POP) document.documentElement.classList.add('wbar');
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-qthide],[data-qtx]') as HTMLElement;
    if (!b) return;
    if ('qthide' in b.dataset) return POP ? desk!.minimizeWindow() : hide(kind);
    restart(w);
  });
  el.querySelector('[data-qthide]')!.addEventListener('mouseover', (e) => {
    const hb = e.currentTarget as HTMLElement;
    hb.title = POP ? '' : 'Hide\nHides this terminal. The shell keeps running.';
    hb.dataset.tipKeys = POP ? '' : `${QKEYS[kind]}:show or hide`;
  });
  return (wins[kind] = w);
}
export const keyHint = (kind: string) => {
  const k = show(bound(QKEYS[kind]));
  return k ? ` (${k})` : '';
};

function attach(w: Win, { wid, pid }: { wid: string; pid: string }) {
  if (!pid) return;
  const key = `${wid}|${pid}`;
  if (w.cur?.key === key) return;
  w.cur?.view.detach();
  const cur = { key, ended: false } as Cur;
  cur.view = createTerm({ program: PROG[w.kind], pid, wid, quick: true }, { ended: () => (cur.ended = true) });
  w.cur = cur;
  w.body.replaceChildren(cur.view.el);
}
function letGo(w: Win) {
  w.cur?.view.detach();
  w.cur = null;
  w.body.replaceChildren();
}
const freshIfEnded = (w?: Win) => w?.cur?.ended && letGo(w);

async function restart(w: Win) {
  if (!(await ask({ title: `close the ${NAMES[w.kind]}?`, text: 'its shell ends; the next one starts fresh', confirm: true }))) return;
  w.cur?.view.stop();
  w.cur = null;
  w.body.replaceChildren();
  hide(w.kind);
}

function hide(kind: string) {
  setOpen(kind, false);
  if (POP) return desk!.quickWindow(kind, null);
  page.layout();
}

export function toggleQuick(kind: string) {
  if (POP || WIN !== 1 || !wins[kind] || !S.pid) return;
  const open = isOpen(kind);
  if (OWN) return desk.quickWindow(kind, open ? null : 'show');
  if (!open) freshIfEnded(wins[kind]);
  setOpen(kind, !open);
  page.layout();
  if (!open) requestAnimationFrame(() => wins[kind].cur?.view.focus());
}

export function placeQuick() {
  if (POP || WIN !== 1) return;
  for (const kind of KINDS) {
    const w = wins[kind], open = !!S.pid && isOpen(kind);
    $('#btn-q' + kind)?.classList.toggle('on', open);
    const show = open && !OWN;
    w.el.hidden = !show;
    if (OWN && w.cur) letGo(w);
    if (!show) continue;
    attach(w, here());
    w.fr?.fit();
  }
}
onPlace(placeQuick);

if (POP) {
  document.body.classList.add('qt-pop');
  setTheme(store.text('theme3')!);
  addEventListener('storage', (e) => e.key === 'mind.theme3' && setTheme(e.newValue!));
  let mounted = false;
  const mountPop = (kind: string, place: { wid: string; pid: string }, am = 0) => {
    if (mounted || !PROG[kind]) return;
    mounted = true;
    const w = makeWin(kind);
    w.el.hidden = false;
    const tag = am ? (am > 1 ? `#${am} ` : '') : amTag;
    document.title = tag + `${NAMES[kind]} · Amethyst`;
    attach(w, place);
    w.cur?.view.focus();
    addEventListener('keydown', (e) => is(e, QKEYS[kind]) && (e.preventDefault(), hide(kind)));
    addEventListener('focus', () => {
      freshIfEnded(w);
      if (!w.cur) attach(w, here());
      w.cur?.view.focus();
    });
  };
  if (new URLSearchParams(location.search).has('spare')) {
    warmTerm();
    desk?.onQtermClaim?.((d) => {
      if (!d.kind || !PROG[d.kind]) return;
      const u = new URL('/qterm.html', location.origin);
      u.searchParams.set('kind', d.kind);
      u.searchParams.set('w', d.wid);
      u.searchParams.set('p', d.pid);
      if (d.am > 1) u.searchParams.set('am', String(d.am));
      history.replaceState(null, '', u);
      mountPop(d.kind, { wid: d.wid, pid: d.pid }, d.am);
    });
  } else if (KINDS[0]) mountPop(KINDS[0], here());
} else if (WIN === 1) {
  KINDS.forEach(makeWin);
  import('../app/float.ts').then(({ frame, preset }) => {
    for (const kind of KINDS) {
      const w = wins[kind];
      w.fr = frame(w.el, 'qtWin:' + kind, () => preset(4));
    }
    page.layout();
  });
  const fix = (kinds: string[]) => {
    outNow = kinds;
    page.layout();
  };
  if (desk?.onQuickPop) {
    desk.onQuickPop(fix);
    desk.quickWindow('term').then(fix);
  }
  addEventListener('storage', (e) => /^mind\.qterm:(term|pwsh):/.test(e.key || '') && page.layout());
}
