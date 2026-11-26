import { bound, is, show } from '../base/binds.ts';
import { ask } from '../base/controls.ts';
import { addBarPart, addCodePart } from '../base/codeparts.ts';
import { api, atWs, S } from '../base/model.ts';
import { notify, tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { onPref, pref, setPref } from '../base/prefs.ts';
import { esc, placeKey, showErr, store } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import { goLineOf } from '../app/tabs.ts';
import { columnOn, columnShown, I, mbOf, paint, setHooks, setPopped } from './column.ts';
import { cantStopHere, CODE, debugPart } from './gutter.ts';
import { acts, call, changed, D, fold, followProject, live, onDebug, rootOf, running, stopped } from './state.ts';
import type { Frame } from './state.ts';
import { onPlace } from '../app/places.ts';

addCodePart(debugPart);

const MINI: [string, string, string, string][] = [['go', 'play', 'Continue\nRuns the program on from here.', 'debugGo'], ['pause', 'pause', 'Pause\nPauses the program where it is.', 'debugPause'], ['over', 'over', 'Step over\nRuns this line and stops at the next one.', 'debugOver'], ['into', 'into', 'Step into\nGoes into the call on this line.', 'debugInto'], ['out', 'out', 'Step out\nRuns on to where this function returns.', 'debugOut'], ['stop', 'stop', 'Stop\nDetaches the debugger; the program keeps running.', 'debugStop']];
addBarPart((host, name, abs) => {
  if (!CODE.test(name)) return;
  const box = document.createElement('span');
  box.className = 'dbg-mini';
  host.append(box);
  let drawn = '';
  const draw = () => {
    const a = fold(abs() || ''), w = (D.session?.stop || D.last)?.where;
    const show = !!pref('debug:on') && !!pref('debug:pathbar') && !columnShown() && live() && !!w?.file && fold(w.file) === a;
    const halted = stopped();
    const html = !show ? '' : `<span class="mst${halted ? '' : ' run'}">${halted ? 'stopped' : 'running'}</span>` + MINI.filter(([k]) => (halted ? k !== 'pause' : k === 'pause' || k === 'stop')).map(([k, icon, tip, id]) => `<button class="x" data-m="${k}" title="${esc(tip)}" data-tip-keys="${id}:${tip.split('\n')[0].toLowerCase()}" aria-label="${esc(tip.split('\n')[0])}">${(I as Record<string, string>)[icon]}</button>`).join('');
    if (html === drawn) return;
    drawn = html;
    box.innerHTML = html;
  };
  box.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')?.dataset.m;
    if (k === 'go') go();
    else if (k === 'pause') pause();
    else if (k === 'stop') stop();
    else if (k) step(k);
  });
  draw();
  const offA = onDebug(draw), offB = onPref('debug:col', draw), offC = onPref('debug:pathbar', draw);
  return () => (offA(), offB(), offC(), box.remove());
});

export const DEBUG_KEYS = ['debugGo', 'debugPause', 'debugStop', 'debugOver', 'debugInto', 'debugOut', 'debugColumn', 'debugRunTo', 'debugGoto'];
const desk = window.amethyst;
const here = (): Element => (document.activeElement as Element | null) || document.body;
const keyFor = (id: string, what: string) => (bound(id) ? `${show(bound(id))} ${what}` : '');
const runsAlready = () => tell(here(), { title: 'It runs already', line: keyFor('debugPause', 'pauses'), ms: 2000 });
const notStopped = (over: Element | null = here(), line = '') => tell(over, { title: live() ? "It's running: pause it first" : 'Not debugging', line: line || (live() ? keyFor('debugPause', 'pauses') : keyFor('debugGo', 'starts')), ms: 2000 });

const busy = (t: string) => ((D.busy = t), paint());
const done = () => ((D.busy = ''), paint());
const showColumn = () => columnOn() || setPref('debug:col', true);

async function start(mode: string) {
  if (!pref('debug:on') || !S.pid) return;
  showColumn();
  if (live()) return;
  if (D.engine && !D.engine.ready) return paint();
  busy(mode === 'attach' ? 'attaching…' : mode === 'game' ? 'starting the game…' : 'starting Unreal Editor…');
  try {
    const r = await call('/api/ue/debug', { mode, by: 'you', build: !!pref('debug:build'), ensure: !!pref('debug:ensure'), cpp: !!pref('debug:cpp') });
    if (r.why === 'engine') D.engine = r.engine;
    else if (r.why === 'none' || r.why === 'os') tell(here(), { title: 'The debugger needs an Unreal project for now', line: 'no .uproject in this project', ms: 3000 });
    else if (r.why === 'not-built') notBuilt(r);
    else if (r.why === 'no-editor') tell(here(), { title: "Unreal Editor isn't running this project", line: 'debug the editor starts it', ms: 3000 });
    else if (r.why && r.why !== 'debugging') D.err = r.detail || `can't start: ${r.why}`;
  } catch (e) {
    D.err = (e as Error).message;
  }
  done();
}

function notBuilt(r: { target?: string; config?: string; detail?: string }) {
  const n = notify(`<b>${esc(r.detail || 'not built yet')}</b>. Build it, then debug.`, { ms: 12000 });
  const b = document.createElement('button');
  b.className = 'primary';
  b.textContent = `build ${r.target || ''} ${r.config || ''}`.trim();
  b.addEventListener('click', () => {
    call('/api/ue/run', { action: 'build', target: r.target, config: r.config }).catch(showErr);
    n.remove();
  });
  n.querySelector('.nt')?.append(' ', b);
}

let fronted = false;
async function go() {
  if (!stopped()) return;
  const pid = D.session?.pid || 0;
  if (fronted && pid && pref('debug:giveback') && desk?.focusPid) desk.focusPid(pid).catch(() => {});
  fronted = false;
  try {
    await call('/api/debug/continue');
  } catch (e) {
    showErr(e);
  }
}
async function pause() {
  if (!running()) return tell(here(), { title: live() ? "It's already stopped" : 'Not debugging', ms: 2000 });
  try {
    await call('/api/debug/pause');
  } catch (e) {
    showErr(e);
  }
}
let stepTimer = 0;
async function step(how: string) {
  if (!stopped()) return notStopped();
  clearTimeout(stepTimer);
  stepTimer = setTimeout(() => stopped() || busy('stepping…'), 300) as unknown as number;
  try {
    await call('/api/debug/step', { how });
  } catch (e) {
    showErr(e);
  }
}
async function stop(end = false) {
  if (!live()) return;
  if (end) {
    const ok = await ask({ title: `End ${D.session?.mode === 'launch' ? 'the program' : 'Unreal Editor'}?`, text: 'It closes at once, without saving.', confirm: true });
    if (!ok) return;
  }
  try {
    await call('/api/debug/stop', { end });
  } catch (e) {
    showErr(e);
  }
}
async function restart() {
  if (!live() || D.session?.mode !== 'launch') return;
  const ok = await ask({ title: 'Restart under the debugger?', text: 'The program ends without saving, then starts again.', confirm: true });
  if (!ok) return;
  const kind = D.session.kind;
  await call('/api/debug/stop', { end: true }).catch(showErr);
  setTimeout(() => start(kind === 'game' ? 'game' : 'editor'), 1500);
}
async function remove() {
  if (live()) return tell(here(), { title: 'Stop debugging first', line: 'the debugger is in use', ms: 2500 });
  const ok = await ask({ title: 'Remove the debugger?', text: `Its files go (${mbOf(D.engine?.bytes || 0)}). Breakpoints and watches stay. F5 offers the download again.`, confirm: true });
  if (!ok) return;
  try {
    D.engine = await call('/api/debug/uninstall');
    notify('The debugger was removed.', { ms: 4000 });
  } catch (e) {
    showErr(e);
  }
  paint();
  page.renderSettings?.();
}

let askedEngine = 0;
export async function loadEngine() {
  if (Date.now() - askedEngine < 10e3) return;
  askedEngine = Date.now();
  try {
    D.engine = await api('POST', '/api/debug/engine', {}, '', S.wid);
  } catch {}
  page.renderSettings?.();
}
export const engineNow = () => D.engine;
export async function downloadDebugger() {
  const e = D.engine;
  const ok = await ask({ title: `Download the debugger (${e?.mb || 17} MB)?`, text: `Microsoft's debug engine comes from NuGet under Microsoft's licence (${e?.licence || 'https://aka.ms/WinSDKLicenseURL'}); downloading it means you accept that licence. The adapter is MIT. Both go in Amethyst's own folder.`, confirm: true });
  if (!ok) return;
  await install();
  page.renderSettings?.();
}
export const removeDebugger = () => remove();

async function install() {
  let from = '';
  if (D.engine && !D.engine.published) {
    const picked = desk?.pickFolder ? await desk.pickFolder({ title: 'The folder with dap-dbgeng.exe' }) : await ask({ title: 'The folder with dap-dbgeng.exe', placeholder: 'a full path' });
    if (!picked) return;
    from = String(picked);
  }
  if (D.engine) D.engine.installing = true;
  busy('downloading the debugger…');
  page.renderSettings?.();
  try {
    D.engine = await call('/api/debug/install', { accept: true, ...(from ? { from } : {}) });
  } catch (e) {
    if (D.engine) D.engine.installing = false;
    D.err = (e as Error).message;
  }
  done();
}

async function openFrame(f: Frame | null) {
  if (!f) return;
  if (!f.source || !f.file) return tell(here(), { title: 'No source for this frame', line: f.module ? `${f.module} has no file here` : '', ms: 2500 });
  const root = fold(rootOf()), file = fold(f.file);
  if (root && file.startsWith(root + '/')) await page.openInTab(f.file.replace(/\\/g, '/').slice(root.length + 1), { preview: true });
  else await page.openFiles([f.file], { preview: true });
  goLineOf(f.file, f.line);
}

setHooks({ start, go, pause, step, stop, restart, install, remove, openFrame });
async function runTo(abs: string, line: number) {
  if (!stopped()) return notStopped();
  try {
    await call('/api/debug/runto', { file: abs, line });
  } catch (e) {
    showErr(e);
  }
}
async function gotoLine(abs: string, line: number, over: Element | null) {
  if (!stopped()) return notStopped(over || here(), 'set next statement needs a stopped program');
  try {
    const r = await call('/api/debug/goto', { file: abs, line });
    if (r.error) return tell(over || here(), { title: "Can't set the next statement there", line: r.error, ms: 4500 });
    if (store.get('debug:gotoSeen', false)) return;
    store.set('debug:gotoSeen', true);
    tell(over || here(), { title: `The next statement is line ${r.line}`, line: 'Jumping skips or repeats code; it undoes nothing that already ran', ms: 6000 });
  } catch (e) {
    showErr(e);
  }
}
Object.assign(acts, { unwatch: (name: string) => call('/api/debug/watchpoint', { remove: name }).catch(showErr), runTo, goto: gotoLine, go, stop, openFrame, ask: (text: string) => page.toChat({ text, from: 'debugger' }).catch(showErr) });

function paintDots() {
  const app = document.getElementById('app');
  if (!app) return;
  const x = D.session, crash = x?.stop?.reason === 'exception' && (x.stop.kind === 'crash' || x.stop.kind === 'check');
  const st = !pref('debug:dots') || !live() ? '' : x!.state === 'stopped' ? (crash ? 'crash' : 'stopped') : 'running';
  if (st) app.dataset.dbg = st;
  else delete app.dataset.dbg;
  let css = document.getElementById('dbg-chip-css');
  if (!css) {
    css = document.createElement('style');
    css.id = 'dbg-chip-css';
    document.head.append(css);
  }
  const color = st === 'crash' ? 'var(--danger)' : st === 'stopped' ? 'var(--warn)' : 'var(--accent)';
  css.textContent = st && D.pid ? `#projects .pj-tab[data-pjsel="${CSS.escape(D.pid)}"] { position: relative; } #projects .pj-tab[data-pjsel="${CSS.escape(D.pid)}"]::after { content: ''; position: absolute; left: 15px; bottom: 5px; width: 7px; height: 7px; border-radius: 50%; background: ${color}; box-shadow: 0 0 0 2px var(--bar); pointer-events: none; }` : '';
}
onPref('debug:dots', () => paintDots());

let seen = 0;
onDebug((why) => {
  paintDots();
  if (why === 'frames' && stopped()) {
    clearTimeout(stepTimer);
    if (D.busy === 'stepping…') done();
    const at = D.session?.stop?.at || 0;
    if (at === seen) return;
    seen = at;
    const f = D.frames[D.frame];
    const typing = document.hasFocus() && !!(document.activeElement as HTMLElement | null)?.closest?.('.chat, .ch-box, .cm-chat, [data-chat], .deck, #decks');
    if (typing) {
      const n = notify(`<b>Stopped</b> ${esc(f?.file ? `at ${f.file.split(/[\\/]/).pop()}:${f.line}` : D.session?.stop?.text || '')}`, { ms: 15000 });
      const b = document.createElement('button');
      b.className = 'outline';
      b.textContent = 'go to it';
      b.addEventListener('click', () => (openFrame(f), n.remove()));
      n.querySelector('.nt')?.append(' ', b);
      return;
    }
    if (f?.source) openFrame(f);
    if (pref('debug:front') && WIN === 1 && !document.hasFocus()) {
      fronted = true;
      desk?.showWindow?.('', true);
    }
  }
  if (why.startsWith('state:') && !stopped()) {
    clearTimeout(stepTimer);
    if (D.busy === 'stepping…') done();
  }
});

export function placeDebug() {
  if (WIN !== 1) return;
  const on = pref('debug:on') && !!S.pid && !atWs();
  followProject(on ? S.pid : '', S.wid);
  paint();
}
onPlace(placeDebug);

if (WIN === 1) {
  addEventListener('storage', (e) => {
    if (e.key !== 'mind.debug:cmd' || !e.newValue) return;
    const { k, arg, to } = JSON.parse(e.newValue) as { k: string; arg: any; to: string };
    if (to !== placeKey(S.wid, S.pid)) return;
    if (k === 'start') start(String(arg || 'editor'));
    else if (k === 'go') stopped() ? go() : live() ? runsAlready() : start('editor');
    else if (k === 'pause') pause();
    else if (k === 'step') step(String(arg));
    else if (k === 'stop') stop(!!arg);
    else if (k === 'restart') restart();
    else if (k === 'install') install();
    else if (k === 'remove') remove();
    else if (k === 'open') openFrame(arg as Frame);
  });
  desk?.onQuickPop?.((kinds) => {
    setPopped(kinds.includes('debug'));
  });
}
onPref('debug:col', () => (paint(), page.layout?.()));
const filters = () => live() && call('/api/debug/exceptions', { ensure: !!pref('debug:ensure'), cpp: !!pref('debug:cpp') }).catch(showErr);
onPref('debug:ensure', filters);
onPref('debug:cpp', () => (filters(), paint()));
onPref('debug:on', () => placeDebug());
onPref('debug:off', () => paint());
onPref('debug:fold', () => paint());
onPref('debug:types', () => paint());

const inTerm = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.('.xterm, .term');
export function debugKey(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || !pref('debug:on') || !S.pid || atWs() || inTerm(e)) return false;
  const k = DEBUG_KEYS.find((id) => is(e, id));
  if (!k) return false;
  e.preventDefault();
  if (k === 'debugColumn') setPref('debug:col', !columnOn());
  else if (k === 'debugGo') stopped() ? go() : live() ? runsAlready() : start('editor');
  else if (k === 'debugPause') pause();
  else if (k === 'debugStop') stop();
  else if (k === 'debugOver') step('over');
  else if (k === 'debugInto') step('into');
  else if (k === 'debugOut') step('out');
  else if (k === 'debugRunTo') tell(here(), { title: 'Run to the cursor works in a code file', line: 'put the cursor on a line of C or C++', ms: 2500 });
  else if (k === 'debugGoto') tell(here(), { title: 'Set next statement works in a code file', line: 'put the cursor on a line of the stopped function', ms: 2500 });
  return true;
}

const BP_KEYS = ['debugBp', 'debugBpOff', 'debugBpCond'];
export function breakpointKey(e: KeyboardEvent) {
  if (!BP_KEYS.some((id) => is(e, id)) || !pref('debug:on')) return false;
  const name = page.shownPath?.() || '';
  if (name && CODE.test(name)) return false;
  cantStopHere(here());
  return true;
}

export const debugStart = (mode: string) => start(mode);
export { changed };
