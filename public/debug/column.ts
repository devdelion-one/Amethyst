import { bound, show } from '../base/binds.ts';
import { ask, bands, ICONS, keepMenu, menuHead, popMenu, rowIcons, topRow } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { gem } from '../base/kinds.ts';
import { projectOf } from '../base/model.ts';
import { page } from '../base/page.ts';
import { isOff, pref, PREFS, setPref } from '../base/prefs.ts';
import { $, esc, showErr, store } from '../base/util.ts';
import { tell } from '../base/notify.ts';
import { mrow } from './menu.ts';
import { acts, call, changed, D, fold, frameText, live, loadFrames, onDebug, running, stopped } from './state.ts';
import type { Bp, Frame, Var } from './state.ts';

const svg = (d: string, fill = false) => `<svg viewBox="0 0 16 16" aria-hidden="true">${fill ? d : `<g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</g>`}</svg>`;
export const I = {
  bug: svg('<path d="M5.5 5.5a2.5 2.5 0 0 1 5 0M4.5 6.5h7v3.5a3.5 3.5 0 0 1-7 0zM8 6.5V13.5M2.5 8h2M11.5 8h2M3 12l1.8-1.2M13 12l-1.8-1.2M3.5 4.5l1.5 1.3M12.5 4.5 11 5.8"/>'),
  play: svg('<path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/>', true),
  pause: svg('<rect x="4" y="3.5" width="2.6" height="9" rx=".8" fill="currentColor"/><rect x="9.4" y="3.5" width="2.6" height="9" rx=".8" fill="currentColor"/>', true),
  over: svg('<path d="M2.5 9.5a5.5 5.5 0 0 1 10.6-2M13.6 3.8v4h-4"/><circle cx="8" cy="12.6" r="1.3" fill="currentColor" stroke="none"/>'),
  into: svg('<path d="M8 2.2v7M4.8 6.2 8 9.4l3.2-3.2"/><circle cx="8" cy="13" r="1.3" fill="currentColor" stroke="none"/>'),
  out: svg('<path d="M8 10.2v-7M4.8 6.4 8 3.2l3.2 3.2"/><circle cx="8" cy="13" r="1.3" fill="currentColor" stroke="none"/>'),
  stop: svg('<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>', true),
  again: svg('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>'),
  more: svg('<circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/>', true),
  down: svg('<path d="M4 6l4 4 4-4"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  pop: svg('<path d="M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5l-6 6"/>'),
  frame: svg('<path d="M2 5.5h7V2l7 6-7 6v-3.5H2z" fill="currentColor"/>', true),
  blueprint: svg('<rect x="2.5" y="3" width="11" height="10" rx="2"/><path d="M2.5 6.2h11"/><circle cx="5.5" cy="9.6" r="1"/><path d="M8.5 9.6h2.5"/>'),
};

type Hooks = { start: (mode: string) => unknown; go: () => unknown; pause: () => unknown; step: (how: string) => unknown; stop: (end?: boolean) => unknown; restart: () => unknown; install: () => unknown; remove: () => unknown; openFrame: (f: Frame) => unknown };
let H: Hooks;
let el: HTMLElement | null = null;
const open = new Map<string, boolean>();
const kids = new Map<number, Var[]>();
const shut = (k: string, def = false) => store.get(`debug:shut:${k}`, def) as boolean;
const keyOf = (id: string) => show(bound(id));
const watches = () => (store.get(`debug:watch:${D.pid}`, []) as string[]).filter((s) => typeof s === 'string');
const setWatches = (l: string[]) => store.set(`debug:watch:${D.pid}`, l.slice(0, 50));
let watchVals = new Map<string, { ok: boolean; value: string; type: string; ref: number; error?: string }>();
let scopes: { name: string; ref: number; expensive: boolean }[] = [];
let scopeOf = -1;
let unfold = new Set<number>();

export const columnOn = () => pref('debug:col') as boolean;

export const POP = location.pathname === '/debug.html';
const desk = window.amethyst;
export const canPop = () => !!desk?.quickWindow;
let popped = false;
export const setPopped = (on: boolean) => {
  popped = on;
  changed('popped');
};
export const columnShown = () => (POP ? true : columnOn() && !popped);

const DBAR = (go: string) => `<div class="dbar"><button class="bb go" data-d="go">${go}</button><button class="bb" data-d="over" data-dbtn="over" aria-label="step over">${I.over}</button><button class="bb" data-d="into" data-dbtn="into" aria-label="step into">${I.into}</button><button class="bb" data-d="out" data-dbtn="out" aria-label="step out">${I.out}</button><i class="sep"></i><button class="bb stopb" data-d="stop" data-dbtn="stop" aria-label="stop">${I.stop}<span class="cv2">${I.down}</span></button><button class="bb" data-d="restart" data-dbtn="restart" aria-label="restart">${I.again}</button><span class="grow"></span><button class="bb" data-d="more" data-dbtn="more" aria-label="more">${I.more}</button></div>`;
export const dbarHtml = () => (el?.querySelector('.dbar') as HTMLElement | null)?.outerHTML || DBAR(`${I.play}<span>debug</span>`);
function make() {
  el = document.createElement('aside');
  el.id = 'dbg';
  el.setAttribute('aria-label', 'debugger');
  el.innerHTML = `<div class="dhd"><span class="nm">${I.bug}debug</span><span class="pj"></span><span class="grow"></span>${canPop() ? `<button class="x" data-d="pop" aria-label="${POP ? 'back into the editor' : 'own window'}" title="${POP ? 'Back into the editor\nPuts the debugger back in the editor, as a column.' : 'Own window\nMoves the debugger into a window of its own, for a second screen.'}">${I.pop}</button>` : ''}<button class="x" data-d="hide" aria-label="hide" title="${POP ? 'minimize' : 'hide the column (ctrl shift d)'}">${POP ? '–' : I.x}</button></div>
${DBAR('')}
<div class="dstate"><i class="sd"></i><span class="t"></span></div>
<div class="pbar hide"><i></i></div>
<div class="secs"></div>
<div class="dgrip"></div>`;
  if (POP) {
    document.body.append(el);
    document.body.classList.add('dbg-pop');
  } else {
    const shell = $('#shell'), pins = $('#pins');
    shell.insertBefore(el, pins);
  }
  el.addEventListener('click', onClick);
  el.addEventListener('contextmenu', onMenu);
  el.addEventListener('dblclick', onDouble);
  el.addEventListener('keydown', onKey);
  grip(el.querySelector('.dgrip')!);
  const w = Number(store.get('debug:width', 380));
  el.style.setProperty('--dbg-w', `${Math.max(280, Math.min(w, 900))}px`);
}

function grip(g: HTMLElement) {
  g.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    g.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = el!.getBoundingClientRect().width;
    const move = (m: PointerEvent) => el!.style.setProperty('--dbg-w', `${Math.max(280, Math.min(w0 + x0 - m.clientX, 900))}px`);
    const up = () => {
      g.removeEventListener('pointermove', move);
      store.set('debug:width', Math.round(el!.getBoundingClientRect().width));
      page.layout?.();
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up, { once: true });
  });
}

const s = () => D.session;
function goLook(): { cls: string; html: string; tip: string; keys: string } {
  const k = (id: string) => (keyOf(id) ? `<span class="k">${esc(keyOf(id))}</span>` : '');
  if (!live()) return { cls: 'go pri', html: `${I.bug}<span>debug</span><span class="cv" data-d="gomenu">${I.down}</span>`, tip: 'Debug\nStarts Unreal Editor under the debugger, or attaches to it when it is open.\n\nThe arrow picks the game, or a program to attach to.', keys: 'debugGo:start or attach' };
  if (s()!.state === 'building') return { cls: 'go', html: `${I.stop}<span>cancel</span>`, tip: 'Cancel\nCancels the build, so nothing starts.', keys: '' };
  if (s()!.state === 'starting') return { cls: 'go', html: `${I.stop}<span>cancel</span>`, tip: 'Cancel\nStops starting and detaches the debugger.', keys: '' };
  if (running()) return { cls: 'go', html: `${I.pause}<span>pause</span>${k('debugPause')}`, tip: 'Pause\nPauses the program where it is.', keys: 'debugPause:pause' };
  return { cls: 'go pri', html: `${I.play}<span>continue</span>${k('debugGo')}`, tip: 'Continue\nRuns the program on from here.', keys: 'debugGo:continue' };
}

function stateLine(): { color: string; html: string } {
  const x = s();
  if (D.busy) return { color: 'var(--work)', html: `<span class="t">${esc(D.busy)}</span>` };
  if (!x) return { color: 'var(--text-faint)', html: `<span class="t">not debugging${keyOf('debugGo') ? ` · ${esc(keyOf('debugGo'))} starts` : ''}</span>` };
  const by = x.by === 'agent' ? `<span class="ag">${I.bug}an agent</span>` : '';
  if (x.state === 'building') return { color: 'var(--work)', html: `<span class="t">${esc(x.note || 'building')}… then it starts</span>` };
  if (x.state === 'starting') return { color: 'var(--work)', html: `<span class="t">starting ${esc(x.name)}…</span>` };
  if (x.state === 'running') return { color: 'var(--work)', html: `<b>running</b><span class="t">${esc(x.name)}${x.mode === 'attach' ? ' · attached' : ''}</span>${by}` };
  if (x.state === 'stopped') {
    const st = x.stop, w = st?.where, kind = st?.reason === 'exception' ? st.kind || 'crash' : '';
    const crash = kind === 'crash' || kind === 'check';
    const head = kind === 'crash' ? 'crashed' : kind === 'check' ? 'check() failed' : kind === 'ensure' ? 'ensure() failed' : st?.kind === 'data' ? 'changed' : 'stopped';
    const why = kind === 'crash' ? st?.exception?.text || st?.text || '' : kind ? '' : st?.kind === 'data' && st.change ? `${st.change.name}: ${st.change.old || '?'} → ${st.change.now || '?'}` : st?.reason === 'breakpoint' ? 'at a breakpoint' : st?.reason === 'step' ? 'after a step' : st?.reason === 'cursor' ? 'ran to the cursor' : st?.reason === 'goto' && w ? `moved to line ${w.line}` : st?.reason === 'pause' ? 'paused' : st?.text || st?.reason || '';
    const at = w ? `${why ? ' · ' : ''}${w.file ? w.file.split(/[\\/]/).pop() + (st?.reason === 'goto' ? '' : ':' + w.line) : w.name}` : '';
    return { color: crash ? 'var(--danger)' : 'var(--warn)', html: `<b>${head}</b><span class="t">${esc(why + at)}</span>${by}` };
  }
  const e = x.ended;
  const why = e?.why === 'detached' ? 'detached: it keeps running' : e?.why === 'ended' ? 'ended' : e?.why === 'exited' ? `it exited${e.code != null ? ` (${e.code})` : ''}` : e?.why || 'ended';
  return { color: 'var(--text-faint)', html: `<b>ended</b><span class="t">${esc(why)}</span>` };
}

const sec = (k: string, label: string, body: string, extra = '', def = false) => `<div class="sec${shut(k, def) ? ' shut' : ''}" data-sec="${k}"><div class="sh" data-d="sec" data-k="${k}"><svg class="tw" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg><span class="label">${label}</span>${extra}<span class="grow"></span></div><div class="sb">${body}</div></div>`;

function card(): string {
  const e = D.engine;
  if (e && !e.os) return `<div class="dcard"><div class="t1">The debugger is Windows only for now</div></div>`;
  if (e && !e.ready) {
    const from = !e.published ? `<p>The adapter isn't published yet: pick the folder with <code>dap-dbgeng.exe</code> when asked.</p>` : '';
    return `<div class="dcard"><div class="t1">Download the debugger · ${e.mb} MB</div><p>Microsoft's debug engine (dbgeng, from NuGet) and the adapter. It goes in Amethyst's own folder; nothing is installed in Windows.</p><p>Microsoft's licence for it: <a href="${esc(e.licence)}" target="_blank" rel="noreferrer">the Windows SDK licence</a>. Downloading it means you accept it.</p>${from}<div class="row"><button class="primary" data-d="install" ${e.installing ? 'disabled' : ''}>${e.installing ? 'downloading…' : 'accept and download'}</button></div></div>`;
  }
  if (live()) return '';
  return `<div class="dcard"><div class="t1">Debug ${esc(projectName())}</div><p>Unreal Editor starts under the debugger (DebugGame Editor shows every variable). If it's already open, the debugger attaches to it.</p><div class="row"><button class="primary" data-d="start" data-m="editor">${I.bug}debug the editor${keyOf('debugGo') ? `<kbd>${esc(keyOf('debugGo'))}</kbd>` : ''}</button><button class="outline" data-d="start" data-m="attach">attach</button><button class="outline" data-d="start" data-m="game">the game</button></div></div>`;
}
const projectName = () => projectOf(D.pid)?.name || 'this project';

function frameRows(): string {
  if (!stopped()) return `<div class="empty">${live() ? 'shows when it stops' : 'not debugging'}</div>`;
  if (!D.frames.length) return '<div class="empty">reading the stack…</div>';
  const foldOn = pref('debug:fold');
  const out: string[] = [];
  const keep = (i: number) => i === 0 || i === D.frame || !D.frames[i].lib || unfold.has(i);
  for (let i = 0; i < D.frames.length; ) {
    if (foldOn && !keep(i)) {
      let j = i;
      while (j < D.frames.length && !keep(j)) j++;
      if (j - i >= 2) {
        out.push(`<div class="fr fold" data-d="unfold" data-a="${i}" data-b="${j}"><span></span><span class="fn2">${j - i} engine frames</span><span></span></div>`);
        i = j;
        continue;
      }
    }
    const f = D.frames[i];
    const where = f.file ? `${f.file.split(/[\\/]/).pop()}:${f.line}` : f.module;
    if (f.bp) {
      out.push(`<div class="fr bpf${i === D.frame ? ' on' : ''}" data-d="frame" data-i="${i}"><span class="fa">${i === 0 ? I.frame : ''}</span><span class="fn2"><span class="bpi">${I.blueprint}</span><span class="bpn">${esc(f.name)}</span></span><span class="wh">${esc(f.object || '')}</span></div>`);
      i++;
      continue;
    }
    out.push(`<div class="fr${i === D.frame ? ' on' : ''}${f.lib ? ' eng' : ''}${f.source ? '' : ' nosrc'}" data-d="frame" data-i="${i}"><span class="fa">${i === 0 ? I.frame : ''}</span><span class="fn2">${esc(f.name)}</span><span class="wh">${esc(where)}</span></div>`);
    i++;
  }
  return out.join('');
}

const typeText = (t: string) => t.replace(/\b(class|struct|enum|union) /g, '');
const shownValue = (v: Var) => (v.value === v.type || /^(class|struct) /.test(v.value) ? '{…}' : v.value);
const valueCls = (v: Var) => (/^(nullptr|0x0+)$/.test(v.value) ? ' nul' : /optimized away|unavailable/i.test(v.value) ? ' opt' : '');
let prev = new Map<string, string>(), seenNow = new Map<string, string>(), prevFn = '', nowFn = '';
let threads: { id: number; name: string }[] = [];
const changedVal = (id: string, value: string) => {
  seenNow.set(id, value);
  return nowFn === prevFn && prev.has(id) && prev.get(id) !== value;
};
function varRows(list: Var[], depth: number, path: string): string {
  return list.map((v, i) => {
    const id = `${path}/${i}`, isOpen = open.get(id) ?? (depth <= 1 && v.name === 'this' && !path.includes('/'));
    const tw = v.ref ? `<span class="tw" data-d="twist" data-id="${esc(id)}" data-ref="${v.ref}" data-o="${isOpen ? 1 : 0}">${isOpen ? '▾' : '▸'}</span>` : '<span class="tw"></span>';
    const row = `<div class="vr" data-d="var" data-id="${esc(id)}" data-expr="${esc(v.expr || v.name)}" style="--dp:${depth}"><span class="vn">${tw}<span class="nm2">${esc(v.name)}</span></span><span class="vv${valueCls(v)}${changedVal(id, v.value) ? ' ch' : ''}" title="${esc(v.value)}${v.type ? esc(`\nType: ${v.type}.`) : ''}" data-tip-mono>${esc(shownValue(v))}${v.type && pref('debug:types') ? `<span class="ty2">${esc(typeText(v.type))}</span>` : ''}</span></div>`;
    if (!v.ref || !isOpen) return row;
    const k = kids.get(v.ref);
    if (!k) {
      loadKids(v.ref);
      return row + `<div class="vr" style="--dp:${depth + 1}"><span class="vn"><span class="tw"></span><span class="nm2 faint">…</span></span><span></span></div>`;
    }
    return row + varRows(k, depth + 1, id);
  }).join('');
}

const loading = new Set<number>();
async function loadKids(ref: number) {
  if (loading.has(ref)) return;
  loading.add(ref);
  try {
    const r = await call('/api/debug/vars', { ref });
    kids.set(ref, r.vars || []);
  } catch (e) {
    kids.set(ref, [{ name: '(error)', value: (e as Error).message, type: '', ref: 0, expr: '', kids: 0 }]);
  } finally {
    loading.delete(ref);
    paint();
    shareVals();
  }
}

function shareVals() {
  const locals = scopes.find((x) => x.name === 'Locals');
  const top = locals ? kids.get(locals.ref) || [] : [];
  const me = top.find((v) => v.name === 'this');
  if (me?.ref && !kids.has(me.ref) && !loading.has(me.ref)) loadKids(me.ref);
  const vals = new Map<string, string>();
  for (const v of [...(me?.ref ? kids.get(me.ref) || [] : []), ...top]) if (v.name !== 'this' && !/^\[/.test(v.name)) vals.set(v.name, shownValue(v));
  if (me && !me.ref) vals.set('this', me.value);
  const fn = D.frames[D.frame]?.name || '';
  if (fn !== D.valsFn) {
    D.prevVals = D.valsFn === fn ? D.vals : new Map();
    D.valsFn = fn;
  }
  D.vals = vals;
  changed('vals');
}

async function loadScopes() {
  const f = D.frames[D.frame];
  if (!f || scopeOf === f.id) return;
  scopeOf = f.id;
  scopes = [];
  kids.clear();
  try {
    const r = await call('/api/debug/scopes', { frameId: f.id });
    if (scopeOf !== f.id) return;
    scopes = r.scopes || [];
    for (const sc of scopes) if (sc.name === 'Locals' || (!sc.expensive && sc.name !== 'Registers')) await loadKids(sc.ref);
  } catch (e) {
    D.err = (e as Error).message;
  }
  paint();
}

function scopeRows(): string {
  if (!stopped()) return `<div class="empty">${live() ? 'shows when it stops' : 'not debugging'}</div>`;
  if (!scopes.length) return '<div class="empty">reading…</div>';
  return scopes.map((sc) => {
    const id = `scope:${sc.name}`, isOpen = open.get(id) ?? sc.name === 'Locals';
    const head = scopes.length > 1 ? `<div class="vr scope" data-d="twist" data-id="${esc(id)}" data-ref="${sc.ref}" data-o="${isOpen ? 1 : 0}"><span class="vn"><span class="tw">${isOpen ? '▾' : '▸'}</span><span class="nm2">${esc(sc.name)}</span></span><span></span></div>` : '';
    if (!isOpen && scopes.length > 1) return head;
    const k = kids.get(sc.ref);
    if (!k) {
      loadKids(sc.ref);
      return head + '<div class="empty">reading…</div>';
    }
    return head + (k.length ? varRows(k, scopes.length > 1 ? 1 : 0, id) : '<div class="empty">no variables here</div>');
  }).join('');
}

async function evalWatches() {
  const list = watches(), f = D.frames[D.frame];
  if (!stopped() || !list.length) return;
  const next = new Map<string, any>();
  for (const e of list) next.set(e, await call('/api/debug/eval', { expr: e, frameId: f?.id, context: 'watch' }).catch((x) => ({ ok: false, error: x.message })));
  watchVals = next;
  paint();
}

function dist(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
  return d[a.length][b.length];
}
function near(expr: string) {
  const word = /([A-Za-z_]\w*)\s*$/.exec(expr)?.[1];
  if (!word || D.vals.has(word)) return '';
  let best = '', score = 3;
  for (const n of D.vals.keys()) {
    const k = dist(word, n);
    if (k < score) (best = n), (score = k);
  }
  return best && expr.slice(0, expr.length - word.length) + best;
}

function watchRows(): string {
  const list = watches();
  const rows = list.map((e, i) => {
    const r = watchVals.get(e);
    const v: Var = r?.ok ? { name: e, value: r.value, type: r.type, ref: r.ref, expr: e, kids: 0 } : { name: e, value: stopped() ? r?.error || '…' : '', type: '', ref: 0, expr: e, kids: 0 };
    const err = r && !r.ok;
    if (err && stopped()) v.value = `${v.value}${near(e) ? ` · did you mean ${near(e)}?` : ''}`;
    if (!r?.ok || !v.ref) return `<div class="vr" data-d="watch" data-i="${i}"><span class="vn"><span class="tw"></span><span class="nm2">${esc(e)}</span></span><span class="vv${err ? ' err' : ''}">${esc(v.value)}</span><button class="x wx" data-d="unwatch" data-i="${i}" aria-label="remove">${I.x}</button></div>`;
    return varRows([v], 0, `watch:${i}`).replace('class="vr"', `class="vr" data-wi="${i}"`);
  }).join('');
  return rows + `<div class="vr add" data-d="addwatch"><span class="vn"><span class="tw">+</span><span class="nm2">add an expression</span></span><span></span></div>`;
}

function bpRows(): string {
  const list = D.bps;
  const rows = list.map((b: Bp, i) => {
    const l = b.live, st = b.off ? 'off' : live() && l ? (l.verified ? '' : l.pending ? 'pend' : 'fail') : live() ? 'pend' : '';
    const name = b.file.split('/').pop();
    const facts = [l?.hits ? `${l.hits} hit${l.hits === 1 ? '' : 's'}` : '', b.by === 'agent' ? 'agent' : ''].filter(Boolean);
    return `<div class="br" data-d="bp" data-i="${i}" title="${esc(`${b.abs}:${b.line}\n${l?.why ? `It can't stop here: ${l.why}.` : 'Click to go to the line.'}`)}" data-tip-mono><span class="cb${b.off ? ' off' : ''}" data-d="bpoff" data-i="${i}"><svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span class="d2"><i class="bp${st ? ' ' + st : ''}${b.cond ? ' cond' : ''}${b.by === 'agent' ? ' agent' : ''}"></i></span><span class="loc">${esc(name || b.file)}:${b.line}${b.cond ? `<small>if ${esc(b.cond)}</small>` : ''}</span><span class="chips">${facts.map((f) => `<span class="chip${f === 'agent' ? ' ag' : ''}">${esc(f)}</span>`).join('')}<button class="x" data-d="bprm" data-i="${i}" aria-label="remove">${I.x}</button></span></div>`;
  }).join('');
  const data = (s()?.data || []).map((d) => `<div class="br"><span></span><span class="d2"><i class="bp data"></i></span><span class="loc">when ${esc(d.expr || d.name)} changes${d.old ? `<small>last ${esc(d.old)}</small>` : ''}</span><span class="chips">${d.hits ? `<span class="chip">${d.hits} hit${d.hits === 1 ? '' : 's'}</span>` : ''}<button class="x" data-d="undata" data-n="${esc(d.expr || d.name)}" aria-label="remove">${I.x}</button></span></div>`).join('');
  return (rows || (data ? '' : `<div class="empty">none: ${bound('debugBp') ? `${esc(keyOf('debugBp'))} on a line, or click` : 'click'} left of its number</div>`)) + data + `<div class="exr"><span class="cb"><svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span>on a crash<small>always</small></span></div><div class="exr" data-d="cpp"><span class="cb${pref('debug:cpp') ? '' : ' off'}"><svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span>on C++ exceptions<small>when thrown</small></span></div><div class="exr" data-d="ensure"><span class="cb${pref('debug:ensure') ? '' : ' off'}"><svg viewBox="0 0 10 10"><path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span><span>on ensure()</span></div>`;
}

function outRows(): string {
  const lines = D.output.slice(-200);
  return lines.length ? `<pre class="dout">${esc(lines.join('\n'))}</pre>` : '<div class="empty">nothing yet</div>';
}

let drawn = '';
export function paint() {
  if (!el) {
    if (!columnShown() || !pref('debug:on')) return;
    make();
  }
  const on = columnShown() && pref('debug:on') && !!D.pid;
  if (!POP) $('#app').classList.toggle('dbg-on', on);
  if (!on) return;
  const x = s();
  el!.querySelector('.pj')!.textContent = x ? x.name : projectName();
  const g = goLook(), go = el!.querySelector<HTMLButtonElement>('[data-d="go"]')!;
  if (go.dataset.html !== g.html) (go.innerHTML = g.html), (go.dataset.html = g.html);
  go.className = `bb ${g.cls}`;
  go.title = g.tip;
  if (g.keys) go.dataset.tipKeys = g.keys;
  else delete go.dataset.tipKeys;
  const halted = stopped();
  const setB = (k: string, on: boolean, tip: string, keys = '') => {
    const b = el!.querySelector<HTMLButtonElement>(`[data-d="${k}"]`)!;
    b.disabled = !on;
    b.title = tip;
    if (keys) b.dataset.tipKeys = keys;
    else delete b.dataset.tipKeys;
    b.classList.toggle('off', isOff('debug:off', k));
  };
  setB('over', halted, 'Step over\nRuns this line and stops at the next one.', 'debugOver:step over');
  setB('into', halted, 'Step into\nGoes into the call on this line.', 'debugInto:step into');
  setB('out', halted, 'Step out\nRuns on to where this function returns.', 'debugOut:step out');
  setB('stop', live(), 'Stop\nDetaches the debugger; the program keeps running.\n\nThe arrow ends the program instead.', 'debugStop:stop');
  setB('restart', live() && x?.mode === 'launch' && x?.state !== 'building', 'Restart\nEnds the program and starts it again under the debugger.');
  setB('more', true, 'More\nHow the debugger shows frames, types and values, and its settings.');
  const st = stateLine();
  const row = el!.querySelector<HTMLElement>('.dstate')!;
  (row.querySelector('.sd') as HTMLElement).style.background = st.color;
  const html = `<i class="sd" style="background:${st.color}"></i>${st.html}`;
  if (row.dataset.html !== html) (row.innerHTML = html), (row.dataset.html = html);
  el!.querySelector('.pbar')!.classList.toggle('hide', !(D.busy || x?.state === 'starting' || x?.state === 'building'));
  const tn = threads.find((t) => t.id === D.thread)?.name || '';
  const tname = tn.replace(/( \(current\))?( \(\d+\))?( \(current\))?$/, '');
  const thread = halted && tn ? `<button class="pick" data-d="thread" title="Thread: ${esc(tname)}&#10;The thread whose call stack this is. Click to pick another.">${esc(tname)}${I.down}</button>` : '';
  const hint = stopped() && x?.kind !== 'game' && !store.get('debug:frozenSeen', false) ? `<div class="dhint">Unreal Editor looks frozen while it's stopped: F5 lets it run<button class="x" data-d="frozenok" aria-label="got it">${I.x}</button></div>` : '';
  const body = hint + card() + (D.err ? `<div class="derr">${esc(D.err)}<button class="x" data-d="clearerr">${I.x}</button></div>` : '') + sec('stack', 'call stack', frameRows(), thread) + sec('vars', 'variables', scopeRows()) + sec('watch', 'watch', watchRows()) + sec('bps', 'breakpoints', bpRows(), `<span class="cnt">${D.bps.length || ''}</span>`) + sec('out', 'output', outRows(), '', true);
  const secs = el!.querySelector<HTMLElement>('.secs')!;
  if (body !== drawn) {
    const top = secs.scrollTop;
    secs.innerHTML = drawn = body;
    secs.scrollTop = top;
    const o = secs.querySelector('.dout');
    if (o) o.scrollTop = o.scrollHeight;
  }
}

async function onClick(e: MouseEvent) {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-d]');
  if (!t || (t as HTMLButtonElement).disabled) return;
  const d = t.dataset.d!;
  if (d === 'gomenu') {
    e.stopPropagation();
    return startMenu(t);
  }
  if (d === 'go') return live() ? (running() ? H.pause() : stopped() ? H.go() : H.stop()) : H.start('editor');
  if (d === 'over' || d === 'into' || d === 'out') return H.step(d);
  if (d === 'stop') {
    const r = t.getBoundingClientRect();
    if (e.clientX > r.right - 14) return stopMenu(t);
    return H.stop();
  }
  if (d === 'restart') return H.restart();
  if (d === 'more') return moreMenu(t);
  if (d === 'hide') return POP ? desk?.minimizeWindow?.() : setPref('debug:col', false);
  if (d === 'pop') return desk?.quickWindow?.('debug', POP ? null : 'show');
  if (d === 'undata') return call('/api/debug/watchpoint', { remove: t.dataset.n }).catch(showErr);
  if (d === 'cpp' || d === 'ensure') return setPref(`debug:${d}`, !pref(`debug:${d}`));
  if (d === 'install') return H.install();
  if (d === 'start') return H.start(t.dataset.m || 'editor');
  if (d === 'frozenok') return store.set('debug:frozenSeen', true), paint();
  if (d === 'clearerr') return (D.err = ''), paint();
  if (d === 'sec') {
    const k = t.dataset.k!;
    store.set(`debug:shut:${k}`, !shut(k, k === 'out'));
    drawn = '';
    return paint();
  }
  if (d === 'thread') {
    e.stopPropagation();
    return threadMenu(t);
  }
  if (d === 'unfold') {
    for (let i = Number(t.dataset.a); i < Number(t.dataset.b); i++) unfold.add(i);
    return paint();
  }
  if (d === 'frame') {
    D.frame = Number(t.dataset.i);
    changed('frame');
    const f = D.frames[D.frame];
    if (f?.bp) return tell(t, { title: "A Blueprint frame can't be opened as a file yet", line: 'its variables are in the list below', ms: 2500 });
    return H.openFrame(f);
  }
  if (d === 'twist') {
    open.set(t.dataset.id!, t.dataset.o !== '1');
    return paint();
  }
  if (d === 'addwatch') return addWatch();
  if (d === 'unwatch') {
    const l = watches();
    l.splice(Number(t.dataset.i), 1);
    setWatches(l);
    return paint();
  }
  if (d === 'bp') return goBp(D.bps[Number(t.dataset.i)]);
  if (d === 'bpoff' || d === 'bprm') {
    e.stopPropagation();
    const b = D.bps[Number(t.dataset.i)];
    const rest = D.bps.filter((x) => fold(x.abs) === fold(b.abs) && x !== b).map((x) => ({ line: x.line, cond: x.cond, off: x.off, by: x.by }));
    const lines = d === 'bprm' ? rest : [...rest, { line: b.line, cond: b.cond, off: !b.off, by: b.by }];
    return call('/api/debug/breakpoints', { file: b.abs, lines }).catch(showErr);
  }
}

function onDouble(e: MouseEvent) {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-d="var"]');
  if (!t) return;
  editValue(t);
}

function onKey(e: KeyboardEvent) {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-d="var"]');
  if (t && e.key === 'F2') {
    e.preventDefault();
    editValue(t);
  }
}

async function watchData(t: HTMLElement, expr: string, value: string) {
  if ((s()?.data || []).length >= 4) return tell(t, { title: 'The processor can watch 4 places at once', line: 'remove one in the breakpoints list first', ms: 3000 });
  const id = t.dataset.id!, parent = id.slice(0, id.lastIndexOf('/'));
  const ref = parent.startsWith('scope:') && !parent.includes('/') ? scopes.find((x) => `scope:${x.name}` === parent)?.ref : findRef(parent);
  const name = t.querySelector('.nm2')?.textContent || expr;
  try {
    await call('/api/debug/watchpoint', { ref, name, expr, value });
  } catch (e) {
    tell(t, { title: `Can't watch ${name}`, line: (e as Error).message, ms: 3500 });
  }
}

async function editValue(t: HTMLElement) {
  if (!stopped()) return;
  const id = t.dataset.id!, expr = t.dataset.expr || '';
  const parent = id.slice(0, id.lastIndexOf('/'));
  const pref_ = parent.startsWith('scope:') && !parent.includes('/') ? scopes.find((x) => `scope:${x.name}` === parent)?.ref : findRef(parent);
  const name = t.querySelector('.nm2')?.textContent || '';
  const now = t.querySelector('.vv')?.textContent || '';
  const value = await ask({ title: `Change ${expr || name}`, value: now, placeholder: 'a value or a C++ expression' });
  if (value == null || !pref_) return;
  try {
    await call('/api/debug/set', { ref: pref_, name, value });
    kids.delete(pref_);
    paint();
  } catch (e) {
    showErr(e);
  }
}
function findRef(id: string): number | undefined {
  const row = el?.querySelector<HTMLElement>(`[data-d="twist"][data-id="${CSS.escape(id)}"]`);
  return row ? Number(row.dataset.ref) : undefined;
}

async function addWatch(text?: string) {
  const e = text ?? (await ask({ title: 'Watch an expression', placeholder: 'a variable or a C++ expression, for example this->Health' }));
  if (!e || !String(e).trim()) return;
  const l = watches();
  if (!l.includes(String(e).trim())) l.push(String(e).trim());
  setWatches(l);
  paint();
  evalWatches();
}

function goBp(b: Bp | undefined) {
  if (!b) return;
  H.openFrame({ id: 0, name: '', module: '', file: b.abs, line: b.live?.line || b.line, col: 0, lib: false, source: true });
}

function onMenu(e: MouseEvent) {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-d="var"], [data-d="frame"], .dbar');
  if (!t) return;
  e.preventDefault();
  if (t.matches('.dbar')) return barMenu(e);
  if (t.dataset.d === 'var') {
    const expr = t.dataset.expr || '', value = t.querySelector('.vv')?.firstChild?.textContent || '';
    const full = (s()?.data || []).length >= 4;
    const html = menuHead(icon('option'), expr) + bands({ actions: mrow('data-v="watch"', icon('eye'), 'add to watch', { tip: 'Adds the expression to the watch list.', cls: 'def' }) + mrow('data-v="set"', ICONS.rename, 'change the value', { tip: 'Writes a new value into the running program.', key: 'f2', off: !stopped() }) + mrow('data-v="data"', I.pause, 'break when it changes', { tip: full ? 'Stops the program when the value changes. All 4 data breakpoints are in use.' : 'Stops the program when the value changes.', off: !stopped() }) + '<div class="sep"></div>' + mrow('data-v="copy"', icon('copy'), 'copy the value') + mrow('data-v="copyx"', icon('copy'), 'copy the expression') });
    return popMenu(e.clientX, e.clientY, html, (b) => {
      const k = b.dataset.v;
      if (k === 'data') return watchData(t, expr, value);
      if (k === 'copy') return navigator.clipboard.writeText(value);
      if (k === 'copyx') return navigator.clipboard.writeText(expr);
      if (k === 'watch') return addWatch(expr);
      if (k === 'set') return editValue(t);
    });
  }
  const f = D.frames[Number(t.dataset.i)];
  if (!f) return;
  const stack = D.frames.map(frameText).join('\n');
  const html = menuHead(I.frame, f.name) + bands({
    actions: mrow('data-f="go"', I.pop, 'go to the code', { tip: 'Opens the file at this frame.', off: !f.source, cls: 'def' }) + '<div class="sep"></div>' + mrow('data-f="copy"', icon('copy'), 'copy the frame') + mrow('data-f="stack"', icon('copy'), 'copy the stack') + mrow('data-f="ask"', gem('ai'), 'ask the agent about it', { tip: 'Sends the frame and the stack to an agent.' }),
    options: `<button class="mi pick chk tb-row${pref('debug:fold') ? ' on' : ''}" data-f="fold" title="fold engine frames&#10;Folds the engine's frames in the stack into one line."><i class="tb-ic">${ICONS.foldAll}</i><span class="nm">fold engine frames</span></button>`,
  });
  popMenu(e.clientX, e.clientY, html, (b) => {
    const k = b.dataset.f;
    if (k === 'go') return H.openFrame(f);
    if (k === 'copy') return navigator.clipboard.writeText(frameText(f));
    if (k === 'stack') return navigator.clipboard.writeText(stack);
    if (k === 'ask') return acts.ask(`The program is stopped in the debugger, in ${frameText(f)}.

Stack:
${stack}`);
    if (k === 'fold') return setPref('debug:fold', !pref('debug:fold'));
  });
}

rowIcons({ 'debug:off:over': () => I.over, 'debug:off:into': () => I.into, 'debug:off:out': () => I.out, 'debug:off:stop': () => I.stop, 'debug:off:restart': () => I.again, 'debug:off:more': () => I.more });
function barMenu(e: MouseEvent) {
  const off = (k: string) => isOff('debug:off', k);
  const icons: Record<string, string> = { over: I.over, into: I.into, out: I.out, stop: I.stop, restart: I.again, more: I.more };
  const html = menuHead(I.bug, 'debug bar') + bands({ buttons: PREFS['debug:off'].items!.map(([k, l]) => topRow(!off(k), `data-k="${k}" title="${esc(l.charAt(0).toUpperCase() + l.slice(1))}&#10;${esc(PREFS['debug:off'].tips![k])}"`, icons[k], esc(l))).join('') });
  popMenu(e.clientX, e.clientY, html, (b) => {
    const k = b.dataset.k!, list = (pref('debug:off') as string[]) || [];
    setPref('debug:off', off(k) ? list.filter((x) => x !== k) : [...list, k]);
  });
  const self = barMenu;
  keepMenu(() => self(e));
}

function startMenu(t: HTMLElement) {
  const r = t.getBoundingClientRect();
  const mi = (m: string, text: string, d = '', cls = '') => `<button class="mi${cls ? ' ' + cls : ''}" data-m="${m}">${text}${d ? `<span class="d">${esc(d)}</span>` : ''}</button>`;
  popMenu(r.left, r.bottom + 4, `<div class="mh">${I.bug}debug</div>${mi('editor', 'debug the editor', keyOf('debugGo'), 'def')}${mi('attach', 'attach to the open editor')}${mi('game', 'debug the game', '-game')}`, (b) => H.start(b.dataset.m!));
}

function stopMenu(t: HTMLElement) {
  const r = t.getBoundingClientRect();
  const launched = s()?.mode === 'launch';
  popMenu(r.left, r.bottom + 4, `<div class="mh">${I.stop}stop</div><button class="mi def" data-s="detach">detach<span class="d">it keeps running</span></button><button class="mi danger" data-s="end">end ${esc(launched ? 'the program' : 'Unreal Editor')}<span class="d">unsaved work is lost</span></button>`, (b) => H.stop(b.dataset.s === 'end'));
}

function moreMenu(t: HTMLElement) {
  const r = t.getBoundingClientRect();
  const chk = (k: string, label: string) => `<button class="mi pick chk${pref(`debug:${k}`) ? ' on' : ''}" data-o="${k}">${label}</button>`;
  popMenu(r.right - 240, r.bottom + 4, `<div class="mh">${I.bug}debugger</div>${chk('fold', 'fold engine frames')}${chk('types', 'show types')}${chk('hover', 'values on hover')}${chk('front', 'come to the front when it stops')}<div class="sep"></div><button class="mi" data-o="refresh"${stopped() ? '' : ' disabled'}>read the stack again</button><button class="mi" data-o="settings">settings…</button>${D.engine?.ready && !D.engine.fake ? `<div class="sep"></div><button class="mi danger" data-o="remove"${live() ? ' disabled' : ''}>remove the debugger<span class="d">${esc(mbOf(D.engine.bytes))}</span></button>` : ''}`, (b) => {
    if (b.dataset.o === 'remove') return H.remove();
    const o = b.dataset.o;
    if (o === 'refresh') return loadFrames();
    if (o === 'settings') return page.openSettings?.();
    if (o) setPref(`debug:${o}`, !pref(`debug:${o}`));
  });
  keepMenu(() => t.isConnected && moreMenu(t));
}

async function loadThreads() {
  try {
    threads = (await call('/api/debug/threads')).threads || [];
    paint();
  } catch {}
}

function threadMenu(t: HTMLElement) {
  const r = t.getBoundingClientRect();
  const list = [...threads].sort((a, b) => Number(b.id === D.session?.stop?.threadId) - Number(a.id === D.session?.stop?.threadId) || Number(/^Thread \d+$/.test(a.name)) - Number(/^Thread \d+$/.test(b.name)) || a.name.localeCompare(b.name));
  const rows = list.slice(0, 80).map((x) => `<button class="mi pick${x.id === D.thread ? ' on' : ''}" data-t="${x.id}">${esc(x.name)}${x.id === D.session?.stop?.threadId ? '<span class="d">stopped here</span>' : ''}</button>`).join('');
  popMenu(r.left, r.bottom + 4, `<div class="mh">threads<span class="h">${threads.length}</span></div>${rows}`, (b) => {
    D.thread = Number(b.dataset.t);
    D.frames = [];
    paint();
    loadFrames();
  });
}

export const mbOf = (bytes: number) => `${Math.max(1, Math.round(bytes / 1048576))} MB`;

export function setHooks(h: Hooks) {
  H = h;
}

onDebug((why) => {
  if (why === 'frames' || why === 'frame') {
    scopeOf = -1;
    loadScopes();
    evalWatches();
  }
  if (why === 'frames' && stopped() && !threads.length) loadThreads();
  if (why.startsWith('state:stopped')) {
    D.prevVals = D.vals;
    D.vals = new Map();
    prev = seenNow;
    prevFn = nowFn;
    seenNow = new Map();
    nowFn = '';
  }
  if (why === 'frames' || why === 'frame') nowFn = D.frames[D.frame]?.name || '';
  if (why.startsWith('state:')) {
    threads = [];
    unfold = new Set();
    if (!stopped()) {
      scopes = [];
      scopeOf = -1;
      kids.clear();
    }
  }
  if (why === 'state:running' && D.last && !store.get('debug:frozenSeen', false)) store.set('debug:frozenSeen', true);
  if (why.startsWith('watch:')) return addWatch(why.slice(6));
  paint();
});
