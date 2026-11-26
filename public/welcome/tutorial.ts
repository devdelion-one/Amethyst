import { toggleIndex } from '../app/header.ts';
import { setMode } from '../app/modes.ts';
import { sideShown } from '../app/views.ts';
import { bound, is, show } from '../base/binds.ts';
import { atLaunch, atWs, mode, S } from '../base/model.ts';
import { nextFrame } from '../base/measure.ts';
import { notify } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { toggleBottomBar, toggleTopBar, topBarHidden } from '../base/topbar.ts';
import { pref, chatOn } from '../base/prefs.ts';
import { $, CHATS, esc, store } from '../base/util.ts';
import { WIN } from '../base/windows.ts';

type Step = {
  title: string;
  line: string;
  key?: string;
  at?: () => HTMLElement | null;
  flip?: () => boolean;
  mode?: string;
  acted?: boolean;
  also?: string;
  digit?: () => number;
  grow?: boolean;
  pill?: boolean;
  need?: string;
};

const shown = (sel: string) => {
  const b = document.querySelector<HTMLElement>(sel);
  return b && b.getClientRects().length ? b : null;
};
const modeBtn = (k: string) => () => shown(`#switch .sets[data-kind="${k}"] button`);
const listOpen = () => !$('#colormenu').hidden;
const popOpen = () => !!document.querySelector('.ch-pop:popover-open');
const menuOpen = () => listOpen() || popOpen();
const bottomHidden = () => $('#app').classList.contains('nostatus');
const explorerOpen = () => sideShown() && S.sideView === 'tree';
const chats = () => [...document.querySelectorAll<HTMLElement>('.ch-ta')];
const pill = () => {
  const mine = document.activeElement?.closest('.chat')?.querySelector<HTMLElement>('.ch-pill[data-pick]');
  if (mine && mine.getClientRects().length) return mine;
  return [...document.querySelectorAll<HTMLElement>('.ch-pill[data-pick]')].find((b) => b.getClientRects().length) || null;
};
const firstChat = () => CHATS.findIndex(([k]) => chatOn(k)) + 1;
const chatName = () => (CHATS[firstChat() - 1]?.[1] || '').replace(/ Agent$/, '');

const STEPS: Step[] = [
  { title: 'Hide the top bar', line: 'Press it once to hide the bar at the top, and again to bring it back.', key: 'topBarKey', flip: topBarHidden },
  { title: 'Hide the bottom bar', line: 'The same for the bar at the bottom: once to hide it, again to bring it back.', key: 'bottomBarKey', flip: bottomHidden },
  { title: 'The explorer', line: "Opens your project's files on the side. Press it again to close them.", key: 'explorerKey', at: () => shown('#btn-index'), flip: explorerOpen },
  { title: 'A new chat', line: 'Opens the list of agents. Pick one to start a chat with it.', key: 'newAgentKey', at: () => shown('#btn-newchat'), grow: true },
  { title: 'Change the model', line: 'The model is the pill under the text box. Click it, or press the keys in the text box for the next model or the one before.', key: 'modelNextKey', also: 'modelPrevKey', at: pill, pill: true, need: 'newAgentKey' },
  { title: 'A chat in one key', line: '', key: 'newChatN', digit: firstChat, grow: true },
  { title: 'The editor', line: 'Your files, with chats as tabs beside them. Press the key or click the lit button.', key: 'modeEditor', at: modeBtn('editor'), mode: 'editor' },
  { title: 'Orchestration', line: 'One chat at a time, big. Tab goes to the next one.', key: 'modeOrch', at: modeBtn('orch'), mode: 'orch' },
  { title: 'Agents', line: 'Every chat at once, side by side.', key: 'modeChat', at: modeBtn('chat'), mode: 'chat' },
];

let el: HTMLElement | null = null, ring: HTMLElement | null = null, at = 0, first = false, list: Step[] = [], start = 0;
let was: { top: boolean; bottom: boolean; explorer: boolean; mode: string } | null = null;
let flipped = false, ticked = 0, modeAt = '', seen = new Set<HTMLElement>(), poll = 0;
let model: { el: HTMLElement | null; text: string } = { el: null, text: '' };
const TICK = { name: 'tutorial', write: () => (el ? place() : maybeStart()) };

const capsOf = (id: string) => show(bound(id)).split(' ').filter(Boolean).map((k) => k[0].toUpperCase() + k.slice(1));
const keysOf = (s: Step) => {
  const k = capsOf(s.key || '');
  return k.length && s.digit ? [...k, String(s.digit())] : k;
};
const caps = (k: string[]) => k.map((x) => `<kbd>${esc(x)}</kbd>`).join('');
const lineOf = (s: Step) => (s.digit ? `Opens a ${chatName()} chat straight away, without the list. The other numbers open the other agents.` : s.line);
const usable = (s: Step) => {
  if (s.key === 'topBarKey' && WIN > 1) return false;
  if (s.mode) return !!s.at?.();
  if (s.pill) return !(pref('chrow:chips') as string[]).includes('model');
  if (s.digit && !s.digit()) return false;
  return !!keysOf(s).length;
};

export function tourDue() {
  store.set('tour:due', 'first');
  nextFrame(TICK);
}
export function openTour() {
  if (S.settingsOpen) page.openSettings(true);
  if (el) return;
  store.set('tour:due', 'settings');
  nextFrame({
    name: 'tutorial open',
    write: () => {
      maybeStart();
      if (!el) notify('The tutorial starts when you open a project.', { ms: 6000 });
    },
  });
}

function maybeStart() {
  const due = store.get('tour:due', '');
  if (el || !due || document.getElementById('welcome') || atLaunch() || atWs()) return;
  store.del('tour:due');
  first = due === 'first';
  list = STEPS.filter(usable).map((s) => ({ ...s, acted: false }));
  was = { top: topBarHidden(), bottom: bottomHidden(), explorer: explorerOpen(), mode: mode() };
  at = 0;
  el = Object.assign(document.createElement('div'), { id: 'tutorial' });
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'tutorial');
  ring = Object.assign(document.createElement('div'), { id: 'tutorial-ring' });
  ring.hidden = true;
  document.body.append(ring, el);
  draw();
}

const total = () => list.length + 2;

function begin() {
  const s = list[at - 1];
  flipped = false;
  start = s?.flip ? +s.flip() : 0;
  modeAt = mode();
  seen = new Set(chats());
  const p = pill();
  model = { el: p?.closest<HTMLElement>('.chat') || null, text: p?.textContent || '' };
  clearInterval(poll);
  if (s?.grow || s?.pill) poll = setInterval(() => nextFrame({ name: 'tutorial check', write: check }), 300);
  if (s) s.acted = false;
}

function draw() {
  if (!el) return;
  const s = list[at - 1], last = at === total() - 1, n = `<div class="tu-n">Step ${at + 1} of ${total()}</div>`;
  const dots = `<div class="tu-dots">${Array.from({ length: total() }, (_, i) => `<i${i <= at ? ' class="on"' : ''}></i>`).join('')}</div>`;
  const x = `<button class="tu-x" data-tu-close aria-label="close the tutorial" title="Close the tutorial&#10;You can always open it from Settings.">✕</button>`;
  let body = '', foot = '';
  if (at === 0) {
    body = first
      ? `<h3>Do you want a quick tutorial?</h3><p>A few steps to try, about a minute.</p><p class="tu-dim">You can always open it from Settings.</p>`
      : `<h3>A quick walk round Amethyst</h3><p>Try each thing as you go. It takes about a minute.</p>`;
    foot = `<div></div><div class="tu-btns"><button data-tu-close title="${first ? 'Skip for now&#10;You can always start it later from Settings.' : 'Close&#10;You can always start it later from Settings.'}">${first ? 'skip' : 'close'}</button><button class="tu-go" data-tu-next>start</button></div>`;
  } else if (last) {
    body = `<h3>That's it</h3><p>You can start the tutorial again any time from Settings.</p>`;
    foot = `${dots}<div class="tu-btns"><button data-tu-back>back</button><button class="tu-go" data-tu-done>done</button></div>`;
  } else {
    const more = s.also && capsOf(s.also).length ? `<span class="tu-or">or</span>${caps(capsOf(s.also))}` : '';
    const need = s.need ? `<div class="tu-keys tu-need" hidden><span class="tu-or">Open a chat first:</span>${caps(capsOf(s.need))}</div>` : '';
    body = `<h3>${esc(s.title)}</h3><p>${esc(lineOf(s))}</p><div class="tu-keys tu-do">${caps(keysOf(s))}${more}<span class="tu-tick" hidden>✓ done</span></div>${need}`;
    foot = `${dots}<div class="tu-btns"><button data-tu-back>back</button><button class="tu-go" data-tu-next>next</button></div>`;
  }
  el.innerHTML = `${x}${at ? n : ''}${body}<div class="tu-f">${foot}</div>`;
  el.dataset.step = String(at);
  place();
  if (!menuOpen()) el.querySelector<HTMLElement>('[data-tu-next], [data-tu-done]')?.focus({ preventScroll: true });
}

function place() {
  if (!el || !ring) return;
  const s = list[at - 1], t = s?.at?.();
  const need = el.querySelector<HTMLElement>('.tu-need'), done = !!el.querySelector('.tu-tick:not([hidden])');
  if (need) {
    need.hidden = !!t || done;
    el.querySelector<HTMLElement>('.tu-do')!.hidden = !t && !done;
  }
  ring.hidden = !t;
  if (!t) return;
  const r = t.getBoundingClientRect();
  Object.assign(ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px' });
}

function go(to: number) {
  if (!el) return;
  clearTimeout(ticked);
  clearInterval(poll);
  at = Math.max(0, Math.min(to, total() - 1));
  begin();
  draw();
}

function note() {
  const s = list[at - 1];
  if (el && s?.flip && +s.flip() !== start) flipped = true;
}

function check() {
  note();
  const s = list[at - 1];
  if (!el || !s || el.querySelector('.tu-tick:not([hidden])')) return;
  let ok = false;
  if (s.pill) {
    const p = pill();
    const c = p?.closest<HTMLElement>('.chat') || null;
    if (c !== model.el) model = { el: c, text: p?.textContent || '' };
    ok = !!p && p.textContent !== model.text;
  } else if (s.grow) ok = !!s.acted && chats().some((c) => !seen.has(c));
  else if (s.flip) {
    ok = flipped && +s.flip() === start;
  } else if (s.mode) ok = mode() === s.mode && (s.acted || modeAt !== s.mode);
  else ok = !!s.acted;
  if (!ok) return place();
  el.querySelector('.tu-tick')?.removeAttribute('hidden');
  el.querySelectorAll('.tu-keys kbd').forEach((k) => k.classList.add('ok'));
  const here = at, on = () => {
    if (at !== here) return;
    if (menuOpen()) return void (ticked = setTimeout(on, 300));
    go(at + 1);
  };
  ticked = setTimeout(on, 900);
}

function end(quit: boolean) {
  clearTimeout(ticked);
  clearInterval(poll);
  const w = was;
  el?.remove();
  ring?.remove();
  el = ring = null;
  was = null;
  store.set('tour:done', true);
  if (!w) return;
  if (topBarHidden() !== w.top && WIN === 1) toggleTopBar(w.top);
  if (bottomHidden() !== w.bottom) toggleBottomBar(w.bottom);
  if (explorerOpen() !== w.explorer) toggleIndex(w.explorer);
  if (mode() !== w.mode) setMode(w.mode);
  if (quit) notify('Closed. You can always open the tutorial from Settings.', { ms: 5000 });
}

document.addEventListener('click', (e) => {
  if (!el) return;
  const t = e.target as HTMLElement;
  if (el.contains(t)) {
    if (t.closest('[data-tu-close]')) return end(true);
    if (t.closest('[data-tu-done]')) return end(false);
    if (t.closest('[data-tu-next]')) return go(at + 1);
    if (t.closest('[data-tu-back]')) return go(at - 1);
    return;
  }
  const s = list[at - 1];
  if (s && s.at?.()?.contains(t)) s.acted = true;
  nextFrame({ name: 'tutorial check', write: check });
});
addEventListener(
  'keydown',
  (e) => {
    if (!el) return;
    if (e.key === 'Escape') {
      if (popOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (!listOpen()) return end(true);
      return void $('#colormenu').onkeydown?.(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
    const s = list[at - 1];
    if (s?.key && is(e, s.key)) s.acted = true;
    nextFrame({ name: 'tutorial check', write: check });
  },
  true,
);
addEventListener('resize', () => el && nextFrame(TICK));
new MutationObserver(() => nextFrame(TICK)).observe($('#switch'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(() => {
  if (!el) return;
  note();
  nextFrame({ name: 'tutorial check', write: check });
}).observe($('#app'), { attributes: true, attributeFilter: ['class'] });
