import { bound, is, show } from '../base/binds.ts';
import { ask, barMenu, dragWindow, fwHead, ICONS, keepMenu, keyChip, menuHead, MENU_IC, popMenu, rowIcons, sizeBar, TOPBAR, topBarMenu, topRow, winX } from '../base/controls.ts';
import { onFileSaved } from '../base/checkers.ts';
import { createFind } from '../base/find.ts';
import { every } from '../base/life.ts';
import { api, projectOf, S } from '../base/model.ts';
import { notify, tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { isOff, onPref, pref } from '../base/prefs.ts';
import { UE_CONFIGS } from './configs.ts';
import { follow } from '../base/stream.ts';
import { setTheme } from '../base/theme.ts';
import { $, addrPlace, amTag, esc, placeKey, setSave, showErr, store } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import { askAgent, refreshChecks, setBuildProblems, setUht } from './checks.ts';
import type { Uht } from './checks.ts';
import { onPlace } from '../app/places.ts';
import './ask.ts';

const POP = location.pathname === '/ue.html';
const desk = window.amethyst;
const OWN = !!desk?.quickWindow;
export const UEKEY = 'ueBuild';
export const UEWINKEY = 'ueWindow';
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((z) => `<i data-rs="${z}"></i>`).join('');
const svg = (d: string, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const CUBE = '<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z M2.5 5 8 8.2 13.5 5 M8 8.2v6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>';
export const UE_ICON = svg(CUBE, 'ue-ic');
export const ueHead = (pop: boolean) => fwHead('Build', UE_ICON, winX('–', `data-uehide aria-label="${pop ? 'minimize' : 'hide'}"`) + winX('×', 'data-uex title="Close&#10;A running build goes on." aria-label="close"'), '<span class="qt-pj"></span>');
const I_ENG = svg(CUBE);
const I_CFG = svg('<path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="6" cy="4.5" r="1.6" fill="var(--raised)" stroke="currentColor" stroke-width="1.2"/><circle cx="10.5" cy="8" r="1.6" fill="var(--raised)" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="11.5" r="1.6" fill="var(--raised)" stroke="currentColor" stroke-width="1.2"/>');
const I_EXT = svg('<path d="M6 3.5H3.5v9h9V10M9 2.5h4.5V7M13.5 2.5l-6 6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>');
export const I_WIN = svg('<rect x="2" y="2.5" width="12" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4.5 6h5M4.5 8.5h7M4.5 11h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>');
const I_MORE = svg('<circle cx="3.5" cy="8" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12.5" cy="8" r="1.3" fill="currentColor"/>');
const I_PLAY = svg('<path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/>');
const I_STOP = svg('<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>');
const I_BOLT = svg('<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" fill="currentColor"/>');
const I_AGAIN = svg('<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>');
const I_FILES = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5H4.5v11h7V5zM9 2.5V5h2.5M6.5 8.5h3M6.5 11h3" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/></svg>';
const I_FILT = svg('<path d="M2.5 3.5h11l-4.2 5v4l-2.6-1.3V8.5z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>');
const I_ERR = svg('<circle cx="8" cy="8" r="5.8" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" stroke-width="1.4"/>');
const I_WARN = svg('<path d="M8 2.4L14 13H2Z" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/><path d="M8 6.4v3.2M8 11.2v.4" stroke="currentColor" stroke-width="1.4"/>');
const TABS = [['out', 'Output'], ['problems', 'Problems'], ['ubt', 'UBT log'], ['editor', 'Editor log']];
const ACTS = { build: 'Build', rebuild: 'Rebuild', clean: 'Clean', generate: 'Project files' };

type Engine = { id: string; dir: string; how?: string; from?: string };
type Target = { name: string; type: string };
type Info = { uproject: string; path: string; name: string; assoc: string; engine: Engine | null; targets: Target[]; engines: Engine[]; why: string | null; detail: string; ok: boolean };
type Problem = { sev: string; file: string; line: number; col: number; code: string; text: string; n: number };
type Run = { id: number; action: string; target: string; config: string; state: string; phase: string; started: number; ms: number; hint: string };
type Where = { wid: string; pid: string; name: string };
type Risk = { path: string; why: string };
type Ed = { open: boolean; linked: boolean; playing: boolean; guard: Risk[] };
type Row = { n: number; at: number; t: string; c: string; v: string; x: string };
type UeEvent = { type: string; run: Run; lines: string[]; skipped: number; problems: Problem[]; id: number; p: Problem; rows: Row[]; reset: boolean; path: string } & Ed;
type Note = { title: string; text?: string; btns?: string[][] };
type Foot = { cls: string; mark: string; word: string; time: string; what: string; tip: string; counts: boolean };
type Win = { el: HTMLElement; pj: HTMLElement; note: HTMLElement; foot: HTMLElement; lines: HTMLElement; skip: HTMLElement; out: HTMLElement; plist: HTMLElement; go: HTMLButtonElement; eng: HTMLButtonElement; cfgb: HTMLButtonElement; fr: { fit(): void } | null; logs: Record<string, any>; find?: ReturnType<typeof createFind> };

const NO_ED: Ed = { open: false, linked: false, playing: false, guard: [] };
const st: { key: string; where: Where | null; choice: any; info: Info | null; err: string; run: Run | null; lines: string[]; first: number; problems: Problem[]; stop: (() => void) | null; ed: Ed; elog: Row[]; elogPath: string } = { key: '', where: null, choice: {} as any, info: null, err: '', run: null, lines: [], first: 0, problems: [], stop: null, ed: NO_ED, elog: [], elogPath: '' };
const live = (run: Run | null | undefined) => run?.state === 'running' || run?.state === 'waiting';
const lcOn = () => !!pref('ue:livebuild') && st.ed.linked && cfg().t?.type === 'Editor';
const guardSig = () => `${st.key}#${st.ed.guard.map((r) => r.path).join('|')}`;
const guarded = () => lcOn() && !!pref('ue:guard') && st.ed.guard.length > 0;
const call = (method: string, url: string, body?: unknown) => api(method, url, body, st.where?.pid || '', st.where?.wid || '');

const place = () => (POP ? addrPlace() : { wid: S.wid, pid: S.pid });
const placeNow = () => placeKey(place().wid, place().pid);
const nameKey = () => `ue:name:${place().wid}|${place().pid}`;
const here = (): Where => ({ ...place(), name: POP ? store.get(nameKey(), '') : projectOf(S.pid)?.name || '' });
function keepName() {
  const { name } = here();
  if (name && store.get(nameKey(), '') !== name) store.set(nameKey(), name);
}

function cfg() {
  const ts = st.info?.targets || [];
  const t = ts.find((x) => x.name === st.choice.target) || ts[0] || null;
  const list = t ? (UE_CONFIGS as Record<string, string[]>)[t.type] : [];
  return { t, config: list.includes(st.choice.config) ? st.choice.config : list[0] || 'Development' };
}
const label = (t: Target | null | undefined, c: string, short = false) => (short ? ({ Development: 'Dev', DebugGame: 'Debug', Shipping: 'Ship' } as Record<string, string>)[c] || c : c) + (t?.type && t.type !== 'Game' ? ' ' + t.type : '');
const engineName = (e: Engine | null | undefined) => (e ? (/^\d/.test(e.id) ? `UE ${e.id}` : e.id ? 'UE (source)' : 'engine') : 'no engine');
const took = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const countOf = (sev: string) => st.problems.filter((p) => p.sev === sev).length;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function whyText(): Note | null {
  const i = st.info;
  if (st.err) return { title: st.err };
  if (!i) return null;
  const pj = i.name || st.where?.name || 'this project', eng = [['engine', 'choose the engine…']];
  return ({
    os: { title: 'Unreal builds are Windows only for now' },
    none: { title: 'No Unreal project here', text: `No .uproject in this folder${st.choice.uproject ? ` (chosen: ${st.choice.uproject})` : ''}.`, btns: [['uproject', 'choose .uproject…']] },
    'bad-json': { title: `${i.uproject} doesn't read`, text: `It isn't valid JSON: ${i.detail}`, btns: [['openproj', 'open it']] },
    'no-engine': { title: `Engine ${i.assoc || '(none named)'} isn't installed`, text: `${i.uproject} asks for it (EngineAssociation).`, btns: eng },
    'not-engine': { title: 'That engine folder has no Build.bat', text: `No Engine\\Build\\BatchFiles\\Build.bat in ${i.engine?.dir}.`, btns: eng },
    unlisted: { title: "Amethyst doesn't know this engine", text: i.engine?.dir, btns: eng },
    'no-targets': { title: 'Nothing to build', text: `${pj} is Blueprint-only: no Source/*.Target.cs.` },
  } as Record<string, Note>)[i.why as string] || null;
}
const whyLine = () => {
  const w = whyText();
  return w ? (w.text ? `${w.title}: ${w.text}` : w.title) : '';
};

const FROM: Record<string, string> = { launcher: 'It was found in the Epic Games Launcher’s list.', source: 'It was found in Windows’ list of engines built from source.', added: 'You added it.' };
const askOk = () => !!st.info?.engine && !st.info.ok && (!st.info.why || st.info.why === 'no-targets');
function okText(): Note {
  const i = st.info!, e = i.engine!;
  return { title: 'Use this engine?', text: [`${engineName(e)} in ${e.dir}.`, FROM[e.from || ''], `Building, opening or debugging ${i.name}, and checking its headers, also runs the project’s own code: its build rules, its plugins and its header tool DLLs.`].filter(Boolean).join('\n'), btns: [['useeng', 'use this engine', 'primary']] };
}
function noteNow(): Note | null {
  const w = whyText(), warn = store.get('ue:warn', null);
  if (askOk()) return okText();
  if (w) return w;
  if (guarded() && store.get('ue:guardoff', '') !== guardSig() && !live(st.run))
    return { title: "Live Coding can't apply these changes safely", text: st.ed.guard.slice(0, 6).map((r) => `${r.path}: ${r.why}`).join('\n') + (st.ed.guard.length > 6 ? `\n…and ${st.ed.guard.length - 6} more` : '') + '\nSave, close the editor, build and open it again. Unsaved work goes through Unreal’s save dialog first.', btns: [['restart', 'restart and build', 'primary'], ['lcanyway', 'live coding anyway'], ['guardoff', 'cancel']] };
  if (warn?.key === st.key && st.info && st.ed.open && !st.ed.linked) return { title: `Unreal Editor is open on ${st.info.name}, but Amethyst can't reach it`, text: "It wasn't opened from Amethyst. Close it and open it from here (the editor button), or turn on Python Editor Script Plugin and Enable Remote Execution in its Project Settings. A full build is blocked while Live Coding is on.", btns: [['anyway', 'build anyway', 'primary'], ['nowarn', 'cancel']] };
  if (warn?.key === st.key && st.info) return { title: `Unreal Editor is open on ${st.info.name}`, text: st.ed.linked ? 'Live Coding blocks a full build. Use “patch the open editor” in the Unreal menu, or close the editor.' : 'Live Coding blocks a full build. Close the editor, or press Ctrl+Alt+F11 in it to use Live Coding.', btns: [['anyway', 'build anyway', 'primary'], ['nowarn', 'cancel']] };
  const r = st.run, h = r?.state === 'failed' ? r.hint : '';
  if (r?.action === 'livecoding' && r.state === 'ok' && r.hint === 'restart' && store.get('ue:restartoff', 0) !== r.id) return { title: 'Live Coding took a header change: restart the editor', text: 'The shape of a class changed. Unreal warns this may crash, or break assets that use it. Save, then restart and build before you trust it.', btns: [['restart', 'restart and build', 'primary'], ['restartoff', 'not now']] };
  if (h === 'notsaved') return { title: 'Nothing was closed', text: 'The save dialog was cancelled, or a save failed. The editor stays open.' };
  if (h === 'livecoding') return { title: 'Live Coding refused the build', text: st.ed.linked ? 'Live Coding is on in Unreal Editor. Use “patch the open editor” in the Unreal menu, or close the editor.' : 'Live Coding is on in Unreal Editor. Close the editor, or open it from Amethyst to build with Live Coding from here (or press Ctrl+Alt+F11 in it).' };
  if (h === 'dll-locked') return { title: "A module couldn't be written", text: 'Unreal Editor (or the game) has it loaded. Close it and build again.' };
  return null;
}

const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function progress() {
  for (let k = st.lines.length - 1, end = Math.max(0, k - 400); k >= end; k--) {
    const m = /^\s*\[(\d+)\/(\d+)\]/.exec(st.lines[k]);
    if (m) return { n: +m[1], of: +m[2] };
  }
  return null;
}
function footNow(): Foot {
  const i = st.info, r = st.run, f = { cls: '', mark: '', word: '', time: '', what: '', tip: '', counts: false };
  if (!i) return { ...f, cls: st.err ? 'warn' : '', mark: st.err ? '!' : '', word: st.err ? 'No answer' : 'Looking…' };
  if (i.why) return { ...f, cls: i.why === 'none' || i.why === 'os' ? 'idle' : 'warn', mark: i.why === 'none' || i.why === 'os' ? '○' : '!', word: i.why === 'none' || i.why === 'os' ? 'Not Unreal' : i.why === 'no-targets' ? 'No C++' : 'Set up' };
  const edWhat = st.ed.playing ? ', playing in the editor' : st.ed.linked ? ', editor linked' : st.ed.open ? ', editor open' : '';
  if (!r) return { ...f, cls: 'idle', mark: '○', word: 'Ready', what: `${i.name}, ${engineName(i.engine)}${edWhat}` };
  const what = r.action === 'generate' ? 'project files' : r.action === 'livecoding' ? `${r.target} in the open editor` : `${r.target}, ${label(i.targets.find((t) => t.name === r.target), r.config)}`;
  const counts = r.action === 'build' || r.action === 'rebuild' || r.action === 'livecoding' || r.action === 'restart';
  if (live(r)) {
    const p = r.state === 'running' ? progress() : null;
    const phase = ({ saving: 'Saving', closing: 'Closing', waiting: 'Waiting', building: 'Building', opening: 'Opening' } as Record<string, string>)[r.phase];
    const word = r.state === 'waiting' ? 'Waiting' : phase || ({ build: 'Building', rebuild: 'Rebuilding', clean: 'Cleaning', generate: 'Making files', livecoding: 'Hot Reload', restart: 'Restarting' } as Record<string, string>)[r.action] || 'Building';
    const doing = r.phase === 'waiting' ? 'close Unreal Editor to go on' : r.phase === 'saving' ? 'answer Unreal’s save dialog if it shows' : what;
    return { ...f, cls: 'run', mark: '<i class="ue-ring"></i>', word, time: clock(Date.now() - r.started), what: (p ? `${p.n} / ${p.of} ` : '') + (r.state === 'waiting' ? 'for another build to finish' : doing), tip: `started at ${hhmm(r.started)}`, counts };
  }
  const tip = `finished at ${hhmm(r.started + (r.ms || 0))}`, time = took(r.ms);
  if (r.state === 'cancelled') return { ...f, cls: 'stop', mark: '✕', word: r.action === 'livecoding' ? 'Not followed' : 'Cancelled', time, what, tip, counts };
  if (r.state === 'ok' && r.action === 'livecoding' && r.hint === 'restart') return { ...f, cls: 'warn', mark: '!', word: 'Patched', time, what: 'a header change: restart the editor', tip, counts };
  if (r.state === 'ok') return { ...f, cls: 'ok', mark: '✓', word: ({ clean: 'Cleaned', generate: 'Files made', rebuild: 'Rebuilt', livecoding: r.hint === 'nochanges' ? 'No changes' : 'Patched', restart: 'Reopened' } as Record<string, string>)[r.action] || 'Built', time, what, tip, counts };
  return { ...f, cls: 'fail', mark: '✕', word: 'Failed', time, what, tip, counts };
}

const KIND = 'ue:kind';
const unreal = (i: Info) => i.why !== 'none' && i.why !== 'os';
const isUnreal = () => (st.info ? unreal(st.info) : !!st.key && !!store.get(KIND, {})[st.key]);
function remember(key: string, i: Info) {
  const k = store.get(KIND, {});
  if (k[key] !== unreal(i)) store.set(KIND, { ...k, [key]: unreal(i) });
}

async function load(again = false) {
  const key = st.key;
  try {
    const { ue } = await call('GET', '/api/ue');
    if (key !== st.key) return;
    st.choice = ue || {};
    const info = await call('POST', '/api/ue/find', { uproject: st.choice.uproject, engine: st.choice.engine, again });
    if (key !== st.key) return;
    st.info = info;
    st.err = '';
    remember(key, info);
  } catch (e) {
    if (key !== st.key) return;
    st.err = (e as Error).message;
  }
  paint();
}

const changed = () => store.set('ue:changed', Date.now());
async function choose(patch: Record<string, string | undefined>) {
  st.choice = { ...st.choice, ...patch };
  for (const k of Object.keys(st.choice)) if (!st.choice[k]) delete st.choice[k];
  try {
    await call('PUT', '/api/ue', { ue: st.choice });
  } catch (e) {
    showErr(e);
  }
  changed();
  if ('engine' in patch || 'uproject' in patch) return load();
  paint();
}

function onEvent(e: UeEvent) {
  if (e.type === 'all') {
    st.run = e.run;
    st.lines = e.lines || [];
    st.first = e.skipped || 0;
    st.problems = e.problems || [];
    drawAll();
  } else if (e.type === 'lines' && e.id === st.run?.id) {
    const from = st.first + st.lines.length;
    st.lines.push(...e.lines);
    drawLines(e.lines, from);
  } else if (e.type === 'problem' && e.id === st.run?.id) {
    st.problems.push(e.p);
    markLine(e.p);
    drawProblemsSoon();
  } else if (e.type === 'state' && e.run.id === st.run?.id) {
    const was = st.run!.state;
    st.run = e.run;
    if ((was === 'running' || was === 'waiting') && !live(e.run)) ended(e.run);
  } else if (e.type === 'editor') {
    st.ed = { open: !!e.open, linked: !!e.linked, playing: !!e.playing, guard: e.guard || [] };
    return paint();
  } else if (e.type === 'uht') {
    return setUht(e as unknown as Uht);
  } else if (e.type === 'elog') {
    if (e.reset) st.elog = [];
    if (e.path) st.elogPath = e.path;
    st.elog.push(...(e.rows || []));
    const extra = st.elog.length - ELOG_KEEP;
    if (extra > 0) st.elog.splice(0, extra);
    return e.reset || extra > 0 ? drawElog() : addElog(e.rows || []);
  }
  setBuildProblems(st.run?.id || 0, st.problems);
  paint();
}

function attach(where: Where | null) {
  const key = where?.pid ? `${where.wid}|${where.pid}` : '';
  if (key === st.key) return;
  st.stop?.();
  Object.assign(st, { key, where, choice: {}, info: null, err: '', run: null, lines: [], first: 0, problems: [], stop: null, ed: NO_ED, elog: [], elogPath: '' });
  setBuildProblems(0, []);
  setUht(null);
  if (W) W.logs = {};
  drawAll();
  drawElog();
  if (!key) return paint();
  const stopUe = follow({ ue: true }, onEvent, { pid: where!.pid, wid: where!.wid, failed: (m) => ((st.err = m), paint()) });
  const stopFiles = POP ? null : follow({ files: true }, onFiles, { pid: where!.pid, wid: where!.wid });
  st.stop = () => (stopUe(), stopFiles?.());
  load();
}
function onFiles(e: { all?: boolean; paths?: string[] }) {
  const chosen = (st.choice.uproject || '').replace(/\\/g, '/').toLowerCase();
  const hit = (p: string) => (/^[^/\\]+\.uproject$/i.test(p) && !chosen) || p.replace(/\\/g, '/').toLowerCase() === chosen;
  if (e.all || !e.paths || e.paths.some(hit)) load();
  headersChanged(e.paths);
}
function headersChanged(paths: string[] = []) {
  if (paths.some((p) => /^(Source|Plugins)[\\/].+\.(h|hh|hpp|hxx|inl)$/i.test(p)) && pref('ue:on') && pref('ue:uht') && st.info && !st.info.why) call('POST', '/api/ue/uht', { uproject: st.choice.uproject, engine: st.choice.engine, soon: true }).catch(() => {});
}
onFileSaved((e) => e.pid === st.where?.pid && headersChanged([e.path]));
async function lookAgain() {
  await load(true);
  const i = st.info, name = i?.name || st.where?.name || 'this project';
  if (i && unreal(i)) return tell(null, { title: `${name}: Unreal`, line: 'its buttons are in the top bar', ms: 2500 });
  tell(null, { title: 'No Unreal project here', line: st.choice.uproject ? `no ${st.choice.uproject}` : "no .uproject in this project's top folder", ms: 3000 });
}

async function act(action: string, force = false) {
  if (!st.info || st.info.why) return showWindow();
  const { t, config } = cfg();
  store.set('ue:warn', null);
  if (action === 'build' && !force && guarded()) {
    store.set('ue:guardoff', '');
    return showWindow('out');
  }
  if (action === 'build' && !force && lcOn()) return liveCoding();
  try {
    const r = await call('POST', '/api/ue/run', { action, target: t?.name, config, force, uproject: st.choice.uproject, engine: st.choice.engine });
    if (r.editor) {
      store.set('ue:warn', { key: st.key, action });
      showWindow();
    } else if (r.why) {
      await load();
      showWindow();
    } else if (r.running) showWindow('out');
    else if (winShown()) setTab('out');
  } catch (e) {
    showErr(e);
  }
  paint();
}
const cancel = () => call('POST', '/api/ue/cancel', {}).catch(showErr);
const where = () => ({ uproject: st.choice.uproject, engine: st.choice.engine });
async function openEditor() {
  try {
    const r = await call('POST', '/api/ue/editor', { ...where(), plain: !pref('ue:link') });
    if (r.why === 'unconfirmed') return (await load(), showWindow());
    setSave(r.open ? `Unreal Editor is open on ${st.info?.name} already` : r.why ? whyLine() || r.why : `opening Unreal Editor on ${st.info?.name}…`, !!r.why);
  } catch (e) {
    showErr(e);
  }
}
const NOT_LINKED: Record<string, string> = { unlinked: "Amethyst can't reach this Unreal Editor: it wasn't opened from Amethyst", closed: 'Unreal Editor is not open: open it from Amethyst first (the editor button)' };
async function liveCoding(anyway = false) {
  if (!anyway && !(await ask({ title: 'Hot Reload', text: 'Are you sure you want to do Hot Reload?', choices: [{ label: 'Hot Reload', value: true, main: true }] }))) return;
  try {
    const r = await call('POST', '/api/ue/livecoding', { ...where(), anyway });
    if (r.refused) {
      store.set('ue:guardoff', '');
      st.ed = { ...st.ed, guard: r.files || [] };
      showWindow('out');
    } else if (r.why) {
      if (NOT_LINKED[r.why]) setSave(NOT_LINKED[r.why], true);
      await load();
      showWindow();
    } else if (r.running) showWindow('out');
    else if (winShown()) setTab('out');
  } catch (e) {
    showErr(e);
  }
  paint();
}
async function restartBuild() {
  const { t, config } = cfg();
  store.set('ue:guardoff', guardSig());
  try {
    const r = await call('POST', '/api/ue/restart', { ...where(), target: t?.name, config, plain: !pref('ue:link') });
    if (r.why) {
      await load();
      showWindow();
    } else showWindow('out');
  } catch (e) {
    showErr(e);
  }
  paint();
}
async function playStop() {
  try {
    const r = await call('POST', '/api/ue/play', { ...where(), stop: st.ed.playing });
    if (r.why) setSave(NOT_LINKED[r.why] || r.why, true);
    else st.ed = { ...st.ed, playing: !!r.playing };
  } catch (e) {
    showErr(e);
  }
  paint();
}

function openAt(abs: string, line = 0) {
  if (POP) return store.set('ue:open', { abs, line, to: placeNow(), at: Date.now() });
  openHere(abs, line);
}
async function openHere(abs: string, line: number) {
  await page.openFiles([abs]);
  if (line) (await import('../app/tabs.ts')).goLineOf(abs, line);
}

export function ueClick() {
  if (!pref('ue:on') || !S.pid) return;
  if (live(st.run)) return showWindow('out');
  if (!st.info || st.info.why) return showWindow();
  if (st.run?.state === 'failed' && !winShown()) return showWindow('problems');
  if (winShown()) showWindow('out');
  act('build');
}
let create: ((kind: string, dir?: string) => unknown) | null = null;
export const setCreate = (fn: (kind: string, dir?: string) => unknown) => (create = fn);
export const ueState = () => ({ info: POP ? null : st.info, choice: { uproject: st.choice.uproject, engine: st.choice.engine } });
export const ueProjectFiles = () => act('generate');

export function ueKey() {
  if (!pref('ue:on') || !S.pid) return;
  if (live(st.run)) return showWindow('out');
  if (!st.info || st.info.why) return showWindow();
  act('build');
}

function buttonTip() {
  const i = st.info, r = st.run;
  if (!i) return st.err ? `Unreal build\n${st.err}` : 'Unreal build\nLooking for the project.';
  if (i.why === 'none') return 'Unreal build\nNo Unreal project here: this folder has no .uproject.';
  if (i.why === 'os') return 'Unreal build\nUnreal builds work on Windows only for now.';
  if (i.why === 'bad-json') return "Unreal build\nThe .uproject can't be read. Click to see why.";
  if (i.why === 'no-engine') return `Unreal build\nEngine ${i.assoc || '?'} is not found. Click to choose its folder.`;
  if (i.why === 'not-engine') return 'Unreal build\nThe chosen engine folder has no Build.bat. Click to fix it.';
  if (i.why === 'unlisted') return "Unreal build\nAmethyst doesn't know the chosen engine. Click to choose its folder.";
  if (i.why === 'no-targets') return 'Unreal build\nThis project has no C++ targets.';
  if (r?.state === 'running') return `${r.action === 'livecoding' ? 'Live Coding' : r.action === 'restart' ? 'Restarting the editor' : 'Building'}: ${clock(Date.now() - r.started)}\nClick to show the build window.`;
  if (r?.state === 'waiting') return 'Waiting\nAnother build runs first. Click to show the build window.';
  if (r?.state === 'failed' && !winShown()) return `${r.action === 'livecoding' ? 'Live Coding' : 'Build'} failed\n${plural(countOf('error'), 'error')}. Click to see the problems.`;
  const { t, config } = cfg();
  if (guarded()) return `Live Coding is off\n${st.ed.guard[0].path} changed outside a function body. Click to see it and restart the editor.`;
  if (lcOn()) return `Live Coding: ${i.name}\nPatches the open editor.`;
  return `Build ${i.name}\nBuilds the ${label(t, config)} target.\n\nRight-click for the other builds and options.`;
}

function paintButton() {
  const b = $('#btn-ue');
  if (!b || POP) return;
  const no = !pref('ue:on') || !isUnreal();
  $('#btn-uewin')?.classList.toggle('off', no || !pref('ue:winbtn'));
  b.classList.toggle('off', no || !pref('ue:btn'));
  const i = st.info, r = st.run, why = i?.why;
  const { t, config } = cfg();
  const cls = !i ? '' : why === 'none' || why === 'os' ? 'none' : why && why !== 'no-targets' ? 'warn' : live(r) ? 'run' : r?.state === 'ok' ? 'ok' : r?.state === 'failed' ? 'fail' : r?.state === 'cancelled' ? 'stop' : '';
  b.className = b.className.replace(/\bue-\w+\b/g, '').trim() + (cls ? ` ue-${cls}` : '');
  const cf = !i ? '…' : why === 'none' || why === 'os' ? 'not Unreal' : why && why !== 'no-targets' ? 'set up' : why ? 'no C++' : guarded() ? 'Restart' : lcOn() ? 'Live' : label(t, config, true);
  const stHtml = live(r) ? `<i class="ue-ring"></i><span class="ue-tm">${clock(Date.now() - r!.started)}</span>` : cls === 'ok' ? '✓' : cls === 'fail' ? `✕ ${countOf('error')}` : cls === 'stop' ? '✕' : cls === 'warn' ? '!' : '';
  const html = `${UE_ICON}<span class="ue-cf">${esc(cf)}</span><span class="ue-st">${stHtml}</span>`;
  if (b.dataset.html !== html) {
    b.innerHTML = html;
    b.dataset.html = html;
  }
  b.setAttribute('aria-label', `Unreal build · ${cf}`);
  if (i && !i.why) b.dataset.tipKeys = `${UEKEY}:${live(r) ? 'show the build window' : lcOn() ? 'patch' : 'build'}`;
  else delete b.dataset.tipKeys;
  if (b.matches(':hover')) b.title = buttonTip();
}
export const ueTip = () => buttonTip();

const I_CLEAN = '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/></svg>';
const ACT_ROWS: Record<string, [string, string, string]> = {
  build: [I_PLAY, 'build', 'Builds the configuration ticked below.'],
  rebuild: [I_AGAIN, 'rebuild', 'Cleans, then builds everything again.'],
  clean: [I_CLEAN, 'clean', 'Deletes what the last build made.'],
  generate: [I_FILES, 'make project files', 'Makes the project files again (the .sln), for Visual Studio or Rider.'],
};
export function ueMenu(e: MouseEvent) {
  e.preventDefault();
  const i = st.info, ok = i && !i.why, run = live(st.run), { t, config } = cfg();
  const mi = (attrs: string, ic: string, text: string, tip: string, key = '', off = false) => `<button class="mi" ${attrs}${off ? ' disabled' : ''} title="${esc(`${text.charAt(0).toUpperCase() + text.slice(1)}
${tip}`)}"><i class="tb-ic">${ic}</i><span class="mi-n">${esc(text)}</span>${key}</button>`;
  const groups: string[] = [];
  let cfgs = '';
  if (ok) {
    for (const x of i.targets) for (const c of (UE_CONFIGS as Record<string, string[]>)[x.type]) cfgs += topRow(x.name === t?.name && c === config, `data-uecfg="${esc(x.name)}|${c}" title="${esc(`${label(x, c)}
Builds ${x.name} as ${label(x, c)}.`)}"`, I_CFG, esc(label(x, c)));
    if (run) groups.push(mi('data-ueact="cancel"', I_STOP, st.run?.action === 'livecoding' ? 'stop following Live Coding' : 'cancel the build', st.run?.action === 'livecoding' ? 'Amethyst stops following this Live Coding compile. Unreal has no way to cancel it from outside.' : 'Stops the build that is running.'));
    else {
      groups.push(Object.entries(ACT_ROWS).map(([a, [ic, text, tip]]) => mi(`data-ueact="${a}"`, ic, text, tip, a === 'build' ? keyChip(UEKEY) : '')).join(''));
      if (st.ed.linked) groups.push(mi('data-ueact="live"', I_BOLT, 'Hot Reload the open editor', guarded() ? 'A change needs a restart first: this shows why.' : 'Live Coding: builds your change and patches it into the editor while it runs.') + (guarded() ? mi('data-ueact="restart"', I_AGAIN, 'restart and build', 'Saves, closes the editor, builds and opens it again.') : ''));
    }
    if (st.ed.linked) groups.push(mi('data-ueact="play"', st.ed.playing ? I_STOP : I_PLAY, st.ed.playing ? 'stop playing' : 'play in the editor', st.ed.playing ? 'Stops playing in the open editor.' : 'Starts playing in the open editor.'));
  }
  if (ok && create && pref('ue:new')) groups.push(mi('data-uenew="class"', ICONS.ueClass, 'new class…', `Adds a C++ class to ${i.name}.`, keyChip('ueNewClass')) + mi('data-uenew="module"', ICONS.ueModule, 'new module…', 'Adds a C++ module.', keyChip('ueNewModule')) + mi('data-uenew="plugin"', ICONS.uePlugin, 'new plugin…', 'Adds a plugin.', keyChip('ueNewPlugin')));
  if (ok && pref('debug:on')) groups.push(mi('data-ueact="debug"', ICONS.bug, 'debug the editor', st.ed.open ? 'Attaches the debugger to the open editor.' : 'Starts the editor under the debugger.'));
  groups.push(mi('data-ueact="window"', I_WIN, 'show the build window', 'The build’s output, problems and logs.', keyChip(UEWINKEY)) + (i?.engine ? mi('data-ueact="editor"', I_EXT, 'open the editor', 'Opens the project in the Unreal Editor.', '', !i.path) : ''));
  topBarMenu(e.clientX, e.clientY, { tray: 'ue', head: menuHead(UE_ICON, 'Unreal build'), acts: groups.join('<div class="sep"></div>'), pick: cfgs ? ['configuration', cfgs] : undefined, onPick: (b) => {
    const d = b.dataset;
    if (d.uecfg) {
      const [target, c] = d.uecfg.split('|');
      return choose({ target, config: c });
    }
    if (d.uenew) return create?.(d.uenew);
    if (d.ueact === 'window') return showWindow();
    if (d.ueact === 'debug') return page.debug('editor');
    if (d.ueact === 'editor') return openEditor();
    if (d.ueact === 'cancel') return cancel();
    if (d.ueact === 'live') return guarded() ? (store.set('ue:guardoff', ''), showWindow('out')) : liveCoding();
    if (d.ueact === 'restart') return restartBuild();
    if (d.ueact === 'play') return playStop();
    if (d.ueact) act(d.ueact);
  } });
  keepMenu(() => ueMenu(e));
}

function ended(r: Run) {
  if (POP || WIN !== 1 || r.state === 'cancelled') return;
  const name = esc(st.info?.name || 'the project'), e = countOf('error');
  if (r.action === 'livecoding' && r.state === 'ok' && r.hint === 'restart') {
    const n = notify(`<b>${name}</b>: Live Coding took a header change. Restart the editor before you trust it.`, { ms: 12000 });
    (n.querySelector('.nt') as HTMLElement).style.cursor = 'pointer';
    n.querySelector('.nt')!.addEventListener('click', () => showWindow('out'));
    return;
  }
  if (winShown()) return;
  const done = ({ clean: 'cleaned', generate: 'project files made', livecoding: r.hint === 'nochanges' ? 'Live Coding found no changes' : 'patched', restart: 'built and reopened' } as Record<string, string>)[r.action] || 'built';
  const n = notify(r.state === 'ok' ? `<b>${name}</b>: ${done} in ${took(r.ms)}` : `<b>${name}</b>: ${r.action === 'livecoding' ? 'Live Coding' : 'build'} failed · ${plural(e, 'error')}`, { ms: 9000 });
  (n.querySelector('.nt') as HTMLElement).style.cursor = 'pointer';
  n.querySelector('.nt')!.addEventListener('click', () => showWindow(r.state === 'ok' ? 'out' : 'problems'));
}

const winKey = () => `ue:win:${placeNow()}`, tabKey = () => `ue:tab:${placeNow()}`;
const boxState = () => store.get(winKey(), { open: false });
let outNow = false;
const winShown = () => (OWN ? outNow : boxState().open);

export function showWindow(tab = '') {
  if (POP || WIN !== 1 || !pref('ue:on') || !S.pid) return;
  if (tab) store.set(tabKey(), tab);
  if (OWN) {
    keepName();
    outNow = true;
    desk!.quickWindow('ue', 'show');
    return paint();
  }
  store.set(winKey(), { open: true });
  page.layout();
}
function hideWindow() {
  if (POP) return desk!.quickWindow('ue', null);
  if (OWN) {
    outNow = false;
    return desk!.quickWindow('ue', null);
  }
  store.set(winKey(), { open: false });
  page.layout();
}
Object.assign(MENU_IC, { ue: () => I_WIN });
rowIcons({ 'ue:btn': () => UE_ICON, 'ue:winbtn': () => I_WIN, 'ue:off:editor': () => I_EXT, 'ue:off:play': () => I_PLAY, 'ue:off:more': () => I_MORE, 'ue:off:refresh': () => I_AGAIN, 'ue:off:asfile': () => ICONS.tab });
const ueRow = (k: string) => TOPBAR.find((g) => g.g === 'ue')!.rows.find((r) => r.k === k)!;
if (!POP) {
  const g = TOPBAR.find((x) => x.g === 'ue')!;
  const why = () => (st.key && !isUnreal() ? 'hidden: no .uproject here' : '');
  ueRow('ue:btn').why = why;
  ueRow('ue:winbtn').why = why;
  g.acts = () => (S.pid ? `<button class="mi" data-tbact="ue" data-ue="again">look for Unreal again<span class="d">the top folder</span></button><button class="mi" data-tbact="ue" data-ue="uproject">choose .uproject…<span class="d">one in a subfolder</span></button>` : '');
  g.onAct = (b) => (b.dataset.ue === 'uproject' ? pickUproject() : lookAgain());
}
export const toggleUe = () => (winShown() ? hideWindow() : showWindow());
export const ueWinTip = () => "Build window\nThe Unreal build's output, problems and logs, in a window of its own.";

let W: Win | null = null;
const baseOf = (p: string) => p.split(/[\\/]/).pop() || p;
const LOG_FILE = (name = 'Open as file') => `<button class="ue-lfile" data-ue="asfile" data-tip-mono title="Open as file&#10;Opens the log as a file tab in the Editor.">${I_FILES}<span class="ue-lfname">${esc(name)}</span></button>`;
const LOG_REF = `<button class="ue-lic" data-ue="refresh" aria-label="Refresh" title="Refresh&#10;Reads the log again, from its file.">${I_AGAIN}</button>`;
const UE_TOP = (go = '', play = '') => `<div class="ue-top"><button class="ue-pick ue-eng" data-ue="engines"></button><button class="ue-pick ue-cfg" data-ue="cfgs"></button><span class="grow"></span><button class="ue-ed" data-ue="editor">${I_EXT}<span>Editor</span></button><button class="ue-play" data-ue="play">${play}</button><button class="ue-sq" data-ue="more" aria-label="More actions">${I_MORE}</button><button class="primary ue-go" data-ue="go">${go}</button></div>`;
export const ueBars = () => ({ top: W?.el.querySelector('.ue-top')?.outerHTML || UE_TOP(`${I_PLAY}<span>Build</span>`, `${I_PLAY}<span>Play</span>`), log: `<div class="ue-lbar">${LOG_FILE('Project.log')}<span class="grow"></span>${LOG_REF}</div>` });
const tabNow = () => (TABS.some(([k]) => k === store.get(tabKey())) ? store.get(tabKey()) : 'out');
function setTab(k: string) {
  store.set(tabKey(), k);
  paintTabs();
}

barMenu('.ue-top, .ue-lbar', 'ue');

function makeWin() {
  const el = document.createElement('section');
  el.className = 'box qtwin uewin';
  el.hidden = true;
  el.setAttribute('aria-label', 'Unreal build');
  const tabs = TABS.map(([k, l]) => `<button class="ue-tab" role="tab" data-uetab="${k}">${l}${k === 'problems' ? '<i class="ue-pdot"></i>' : ''}</button>`).join('');
  const log = (k: string) => `<div class="ue-pane ue-log" data-pane="${k}"><div class="ue-lbar">${LOG_FILE('Log.txt')}<span class="grow"></span>${LOG_REF}</div><pre class="ue-ltext"></pre></div>`;
  const elog = `<div class="ue-pane ue-log ue-elog" data-pane="editor"><div class="ue-lbar"><button class="ue-tg e" data-uelv="err">${I_ERR}<span>Errors</span></button><button class="ue-tg w" data-uelv="warn">${I_WARN}<span>Warnings</span></button><button class="ue-tg ue-lcat" data-uelcat title="Categories&#10;Chooses which of the log's categories show. The count is how many show now.">${I_FILT}<span>Categories 0/0 ▾</span></button><span class="grow"></span>${LOG_FILE('Editor.log')}${LOG_REF}</div><div class="ue-lskip dim" hidden></div><div class="ue-lrows"></div></div>`;
  el.innerHTML = ueHead(POP) +
    UE_TOP() +
    `<div class="ue-note" role="status" hidden></div>` +
    `<div class="ue-tabs" role="tablist">${tabs}</div>` +
    `<div class="ue-panes"><div class="ue-pane ue-out" data-pane="out"><div class="ue-skip dim" hidden></div><div class="ue-lines"></div></div>` +
    `<div class="ue-pane ue-probs" data-pane="problems"><div class="ue-pf"><button class="ue-tg e" data-uepf="error">${I_ERR}<span>0 Errors</span></button><button class="ue-tg w" data-uepf="warning">${I_WARN}<span>0 Warnings</span></button></div><div class="ue-plist"></div></div>` +
    log('ubt') + elog + `</div>` +
    `<div class="ue-foot" aria-live="polite"><i class="ue-pbar"></i><span class="ue-fs"></span><button class="ue-fc ue-fe" data-uetab="problems" data-uefilter="error"></button><button class="ue-fc ue-fw" data-uetab="problems" data-uefilter="warning"></button><span class="ue-ft"></span><span class="ue-fwhat"></span></div>${POP ? '' : RS}`;
  ($('#app') || document.body).append(el);
  const q = <T = HTMLElement>(s: string) => el.querySelector(s) as T;
  W = { el, pj: q('.qt-pj'), note: q('.ue-note'), foot: q('.ue-foot'), lines: q('.ue-lines'), skip: q('.ue-skip'), out: q('.ue-out'), plist: q('.ue-plist'), go: q<HTMLButtonElement>('.ue-go'), eng: q<HTMLButtonElement>('.ue-eng'), cfgb: q<HTMLButtonElement>('.ue-cfg'), fr: null, logs: {} };
  W.find = createFind(q('.ue-panes'), { out: { label: 'output', tip: 'Find in the output\nLooks in the build output.', root: W.lines, view: W.out, reveal: (r) => r.startContainer.parentElement?.closest('.ul')?.scrollIntoView({ block: 'center' }), leave: () => {} } });
  if (POP && desk?.onSize) desk.onSize(sizeBar(q('.fw-head'), (k) => desk.sizeWindow(k), 'ue'));
  if (POP) dragWindow(q('.fw-head'));
  q('[data-uehide]').title = POP ? '' : 'Hide\nA running build goes on.';
  const paintOff = () => el.querySelectorAll<HTMLElement>('.ue-top [data-ue], .ue-lbar [data-ue]').forEach((b: HTMLElement) => (b.hidden = isOff('ue:off', b.dataset.ue!)));
  paintOff();
  onPref('ue:off', paintOff);
  el.addEventListener('click', onClick);
  const ep = el.querySelector<HTMLElement>('[data-pane="editor"]')!;
  ep.addEventListener('scroll', () => ep.clientHeight && (elogStick = elogBottom(ep)), { passive: true });
  el.addEventListener('keydown', (e) => {
    if (!is(e, 'find')) return;
    e.preventDefault();
    setTab('out');
    W!.find!.open('out');
  });
  return W;
}

async function onClick(e: MouseEvent) {
  const b = (e.target as Element).closest<HTMLElement>('button,[data-at]');
  if (!b) return;
  const d = b.dataset;
  if ('uehide' in d) return POP ? desk!.minimizeWindow() : hideWindow();
  if ('uex' in d) return hideWindow();
  if ('ueask' in d) {
    const p = st.problems[Number(d.ueask)];
    if (!p) return;
    if (POP) return store.set('ue:ask', { p, to: placeNow(), at: Date.now() });
    return askAgent(p);
  }
  if (d.uetab) {
    if (d.uefilter) {
      store.set('ue:pf', d.uefilter);
      drawProblems();
    }
    return setTab(d.uetab);
  }
  if (d.uepf) {
    const cur = ['error', 'warning'].includes(store.get('ue:pf')) ? store.get('ue:pf') : 'all';
    const next = cur === 'all' ? d.uepf : 'all';
    store.set('ue:pf', next);
    return drawProblems();
  }
  if (d.at) {
    const [abs, line] = d.at.split('|');
    return openAt(abs, +line);
  }
  if (d.uesay === 'anyway') {
    const w = store.get('ue:warn', null);
    store.set('ue:warn', null);
    return act(w?.action || 'build', true);
  }
  if (d.uesay === 'nowarn') return (store.set('ue:warn', null), paint());
  if (d.uesay === 'uproject') return pickUproject();
  if (d.uesay === 'engine') return engineMenu(b);
  if (d.uesay === 'useeng') return useEngine(st.info!.engine!.dir);
  if (d.uesay === 'openproj') return openAt(st.info!.path);
  if (d.uesay === 'restart') return restartBuild();
  if (d.uesay === 'lcanyway') return (store.set('ue:guardoff', guardSig()), liveCoding(true));
  if (d.uesay === 'guardoff') return (store.set('ue:guardoff', guardSig()), paint());
  if (d.uesay === 'restartoff') return (store.set('ue:restartoff', st.run?.id || 0), paint());
  if (d.uelv) {
    const cur = logf();
    store.set('ue:logf', { ...cur, v: cur.v === d.uelv ? 'all' : d.uelv });
    return drawElog();
  }
  if ('uelcat' in d) return catMenu(b);
  const a = d.ue;
  if (!a) return;
  if (a === 'go') return live(st.run) ? cancel() : guarded() ? restartBuild() : act('build');
  if (a === 'engines') return engineMenu(b);
  if (a === 'cfgs') return cfgMenu(b);
  if (a === 'more') return moreMenu(b);
  if (a === 'editor') return openEditor();
  if (a === 'play') return st.ed.linked ? playStop() : tell(b, { title: "Can't play from here yet", line: st.ed.open ? "Amethyst can't reach this Unreal Editor: it wasn't opened from Amethyst" : 'Open the editor from Amethyst first (the editor button)', ms: 2600 });
  if (a === 'refresh') return tabNow() === 'editor' ? refreshElog() : readLog(tabNow(), true);
  if (a === 'asfile') return tabNow() === 'editor' ? st.elogPath && openAt(st.elogPath) : W!.logs[tabNow()]?.path && openAt(W!.logs[tabNow()].path);
  if (ACTS[a as keyof typeof ACTS]) act(a);
}

const below = (b: Element) => b.getBoundingClientRect();
function moreMenu(b: Element) {
  const off = !st.info || !!st.info.why || live(st.run);
  const what: Record<string, string> = { rebuild: 'clean, then build', clean: 'delete what the build made', generate: 'the Visual Studio / Rider files, again' };
  const html = Object.entries(what).map(([a, d]) => `<button class="mi" data-ueact="${a}"${off ? ' disabled' : ''}>${ACTS[a as keyof typeof ACTS]}<span class="d">${esc(d)}</span></button>`).join('');
  const r = below(b);
  popMenu(r.left, r.bottom + 2, html, (m) => act(m.dataset.ueact!));
}
function cfgMenu(b: Element) {
  const i = st.info, { t, config } = cfg();
  if (!i?.targets?.length) return;
  let html = '<div class="ml">Configuration (Win64)</div>';
  for (const x of i.targets) for (const c of (UE_CONFIGS as Record<string, string[]>)[x.type]) html += `<button class="mi" data-uecfg="${esc(x.name)}|${c}">${x.name === t?.name && c === config ? '✓' : '&nbsp;&nbsp;'} ${esc(label(x, c))}<span class="d">${esc(x.name)}</span></button>`;
  html += `<div class="sep"></div><button class="mi" data-ueup>.uproject: ${esc(i.uproject)}<span class="d">${st.choice.uproject ? 'chosen' : 'found'}, click to choose another</span></button>`;
  const r = below(b);
  popMenu(r.left, r.bottom + 2, html, (m) => {
    if ('ueup' in m.dataset) return pickUproject();
    const [target, c] = m.dataset.uecfg!.split('|');
    choose({ target, config: c });
  });
}
function engineMenu(b: Element) {
  const i = st.info, all = i?.engines || [], cur = i?.engine;
  let html = '<div class="ml">Engine</div>';
  html += all.map((x) => `<button class="mi" data-ueeng="${esc(x.dir)}" data-ueid="${esc(x.id)}">${cur && cur.dir.toLowerCase() === x.dir.toLowerCase() ? '✓' : '&nbsp;&nbsp;'} ${esc(engineName(x))}${x.id === i?.assoc ? ' (project)' : ''}<span class="d">${esc(x.dir)}</span></button>`).join('') || '<div class="ml">None found on this PC</div>';
  html += `<div class="sep"></div><button class="mi" data-uechoose>choose folder…<span class="d">the folder with Engine in it</span></button>`;
  if (st.choice.engine) html += `<button class="mi" data-uedetect>use the one EngineAssociation names</button>`;
  html += `<button class="mi" data-ueagain>look again</button>`;
  const r = below(b);
  popMenu(r.left, r.bottom + 2, html, async (m) => {
    const d = m.dataset;
    if ('ueagain' in d) return load(true);
    if ('uedetect' in d) return choose({ engine: '' });
    if ('uechoose' in d) return pickEngine();
    useEngine(d.ueeng!, { engine: d.ueid && d.ueid === i?.assoc ? '' : d.ueeng });
  });
}
async function useEngine(dir: string, patch: Record<string, string | undefined> | null = null, add = false) {
  if (!(await changeEngines({ ...(add ? { add: dir } : {}), ok: dir, uproject: st.choice.uproject }, st.where))) return;
  if (patch) return choose(patch);
  changed();
  return load();
}
async function pickEngine() {
  const dir = desk?.pickFolder ? await desk.pickFolder({ title: 'the Unreal Engine folder (the one with Engine in it)', defaultPath: st.info?.engine?.dir || '' }) : await ask({ title: 'Unreal Engine folder', text: 'Its full path: the folder with Engine in it.', value: st.info?.engine?.dir || '', placeholder: 'E:\\Unreal Engine\\UE_5.7' });
  if (dir) useEngine(String(dir), { engine: String(dir) }, true);
}
async function pickUproject() {
  const v = await ask({ title: 'which .uproject?', text: "Its path from the project's folder; empty: the one at the top.", value: st.choice.uproject || '', placeholder: 'Game/Game.uproject', blank: true });
  if (v != null) choose({ uproject: String(v).trim() });
}

const isPath = (f: string | null | undefined) => /^([a-z]:[\\/]|\/)/i.test(f || '');
const lineEl = (text: string, n: number) => {
  const d = document.createElement('div');
  d.className = 'ul';
  d.dataset.n = n as unknown as string;
  d.textContent = text;
  return d;
};
function markLine(p: Problem) {
  const el = W?.lines.children[p.n - st.first] as HTMLElement | undefined;
  if (!el || el.dataset.p) return;
  el.dataset.p = '1';
  el.classList.add(p.sev === 'error' ? 'e' : 'w');
  const mk = document.createElement('i');
  mk.className = 'ue-mk';
  mk.textContent = p.sev === 'error' ? '✕' : '▲';
  if (!p.file || !isPath(p.file) || !p.text || !el.textContent!.includes(p.file)) return el.prepend(mk);
  const a = document.createElement('a');
  a.className = 'ue-at';
  a.dataset.at = `${p.file}|${p.line}`;
  a.dataset.tipMono = '';
  a.textContent = (p.file.split(/[\\/]/).pop() || p.file) + (p.line ? `:${p.line}` : '');
  const parts: (Node | string)[] = [mk, a];
  if (p.code) {
    const c = document.createElement('span');
    c.className = 'ue-cd';
    c.textContent = p.code;
    parts.push(c);
  }
  el.replaceChildren(...parts, p.text);
}
const atBottom = () => W!.out.scrollHeight - W!.out.scrollTop - W!.out.clientHeight < 40;
function drawLines(lines: string[], from: number) {
  if (!W) return;
  const stick = atBottom(), f = document.createDocumentFragment();
  lines.forEach((t, k) => f.append(lineEl(t, from + k)));
  W.lines.append(f);
  const extra = W.lines.children.length - 50000;
  if (extra > 0) {
    for (let k = 0; k < extra; k++) W.lines.firstChild!.remove();
    st.lines.splice(0, extra);
    st.first += extra;
  }
  if (stick) W.out.scrollTop = W.out.scrollHeight;
}
function drawAll() {
  if (!W) return;
  W.lines.replaceChildren();
  W.skip.hidden = !st.first;
  W.skip.textContent = st.first ? `(${st.first} earlier lines not shown)` : '';
  drawLines(st.lines, st.first);
  for (const p of st.problems) markLine(p);
  W.out.scrollTop = W.out.scrollHeight;
  drawProblems();
}

let probTimer = 0;
const drawProblemsSoon = () => (probTimer ||= requestAnimationFrame(() => ((probTimer = 0), drawProblems())));
function drawProblems() {
  if (!W) return;
  const pf = ['error', 'warning'].includes(store.get('ue:pf')) ? store.get('ue:pf') : 'all';
  const ec = countOf('error'), wc = countOf('warning');
  for (const b of W.el.querySelectorAll<HTMLElement>('[data-uepf]')) {
    const k = b.dataset.uepf!;
    b.classList.toggle('off', pf !== 'all' && pf !== k);
    b.classList.toggle('on', pf === k);
    b.setAttribute('aria-pressed', String(pf === 'all' || pf === k));
    b.querySelector('span')!.textContent = k === 'error' ? `${ec} ${ec === 1 ? 'Error' : 'Errors'}` : `${wc} ${wc === 1 ? 'Warning' : 'Warnings'}`;
  }
  const list = st.problems.filter((p) => pf === 'all' || p.sev === pf);
  const by = new Map<string, Problem[]>();
  for (const p of list) {
    const k = isPath(p.file) ? p.file : '';
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(p);
  }
  const row = (p: Problem) => `<div class="ue-prow ${p.sev}" ${p.file && isPath(p.file) ? `data-at="${esc(p.file)}|${p.line}"` : ''}><span class="ue-sev">${p.sev === 'error' ? '✕' : '▲'}</span><span class="ue-ln">${p.line ? `${p.line}${p.col ? ':' + p.col : ''}` : ''}</span><span class="ue-code">${esc(p.code)}</span><span class="ue-txt">${esc(p.text)}</span>${pref('ue:ask') && p.text ? `<button class="ue-ask" data-ueask="${st.problems.indexOf(p)}" title="Ask the agent&#10;Puts this ${p.sev === 'error' ? 'error' : 'warning'} into the chat you used last in this project, or a new one, to ask the agent to fix it.">Ask agent</button>` : '<span></span>'}</div>`;
  const keys = [...by.keys()].sort((a, b) => ((!a) as unknown as number) - ((!b) as unknown as number) || a.localeCompare(b));
  const groups = keys.map((k) => `<div class="ue-pfile" ${k ? `title="${esc(k)}" data-tip-mono data-tip-cut=".dim"` : ''}><b>${esc(k ? k.split(/[\\/]/).pop() : 'no file')}</b><span class="dim">${esc(k ? k.split(/[\\/]/).slice(0, -1).join('\\') : '')}</span><span class="ue-c">${by.get(k)!.length}</span></div>${by.get(k)!.map(row).join('')}`).join('');
  W.plist.innerHTML = (groups || `<div class="empty">${st.run ? (pf === 'all' ? 'No errors or warnings.' : `No ${pf}s.`) : 'Nothing built yet.'}</div>`);
}

async function readLog(which: string, again = false) {
  if (!W || !st.key) return;
  const pane = W.el.querySelector<HTMLElement>(`[data-pane="${which}"]`)!;
  if (W.logs[which] && !again) return;
  pane.querySelector('.ue-ltext')!.textContent = 'reading…';
  try {
    const r = await call('POST', '/api/ue/log', { which, uproject: st.choice.uproject, engine: st.choice.engine });
    W.logs[which] = r;
    const fb = pane.querySelector<HTMLElement>('.ue-lfile')!;
    fb.querySelector('.ue-lfname')!.textContent = r.path ? baseOf(r.path) : 'Log.txt';
    fb.title = r.path ? `Open as file\n${r.path}` : 'Open as file\nOpens the log as a file tab in the Editor.';
    const txt = pane.querySelector('.ue-ltext')!;
    txt.textContent = r.missing ? `No log yet at ${r.path}.` : r.why ? whyLine() : (r.cut ? '(the start is cut: only the last 2 MB)\n' : '') + r.text;
    pane.scrollTop = pane.scrollHeight;
  } catch (e) {
    pane.querySelector('.ue-ltext')!.textContent = (e as Error).message;
  }
}

const ELOG_KEEP = 20000;
const ELOG_SHOW = 3000;
const LV_RANK: Record<string, number> = { Fatal: 4, Error: 3, Warning: 2 };
const logf = (): { v: string; off: string[] } => {
  const f = store.get('ue:logf', null);
  return { v: ['all', 'warn', 'err'].includes(f?.v) ? f.v : 'all', off: Array.isArray(f?.off) ? f.off : [] };
};
function passes(r: Row, f = logf()) {
  const min = f.v === 'err' ? 3 : f.v === 'warn' ? 2 : 0;
  return (LV_RANK[r.v] || 0) >= min && !f.off.includes(r.c || '—');
}
function rowEl(r: Row) {
  const d = document.createElement('div');
  d.className = `ue-lr${LV_RANK[r.v] >= 3 ? ' e' : r.v === 'Warning' ? ' w' : r.v === 'Verbose' || r.v === 'VeryVerbose' ? ' v' : ''}`;
  const t = document.createElement('span'), c = document.createElement('span'), x = document.createElement('span');
  t.className = 'ue-lt';
  t.textContent = r.t;
  c.className = 'ue-lc';
  c.textContent = r.c;
  c.title = r.c;
  c.dataset.tipCut = '';
  x.className = 'ue-lx';
  x.textContent = (r.v === 'Log' || r.v === 'Display' ? '' : r.v + ': ') + r.x;
  d.append(t, c, x);
  return d;
}
const elogPane = () => W?.el.querySelector<HTMLElement>('[data-pane="editor"]') || null;
const elogBottom = (p: HTMLElement) => p.scrollHeight - p.scrollTop - p.clientHeight < 40;
let elogStick = true;
const elogFollow = (p: HTMLElement) => elogStick && (p.scrollTop = p.scrollHeight);
function paintElogBar() {
  const pane = elogPane();
  if (!pane) return;
  const f = logf(), cats = new Set(st.elog.map((r) => r.c || '—'));
  for (const b of pane.querySelectorAll<HTMLElement>('[data-uelv]')) {
    const lv = b.dataset.uelv!;
    b.classList.toggle('on', f.v === lv);
    b.classList.toggle('off', f.v === 'err' && lv === 'warn');
    b.setAttribute('aria-pressed', String(f.v === lv));
  }
  const hid = f.off.filter((c) => cats.has(c)).length;
  pane.querySelector('.ue-lcat > span')!.textContent = `Categories ${cats.size - hid}/${cats.size} ▾`;
  const fb = pane.querySelector<HTMLElement>('.ue-lfile')!;
  fb.querySelector('.ue-lfname')!.textContent = st.elogPath ? baseOf(st.elogPath) : 'Editor.log';
  fb.title = st.elogPath ? `Open as file\n${st.elogPath}` : 'Open as file\nOpens the log as a file tab in the Editor.';
}
function drawElog() {
  const pane = elogPane();
  if (!pane) return;
  const list = st.elog.filter((r) => passes(r)), shown = list.slice(-ELOG_SHOW), f = document.createDocumentFragment();
  for (const r of shown) f.append(rowEl(r));
  const box = pane.querySelector<HTMLElement>('.ue-lrows')!, skip = pane.querySelector<HTMLElement>('.ue-lskip')!;
  box.replaceChildren(f);
  if (!shown.length) box.innerHTML = `<div class="empty">${st.elog.length ? 'No lines match the filter.' : st.elogPath ? 'No editor log yet: it starts when Unreal Editor opens this project.' : 'Unreal Editor’s log shows here while it runs.'}</div>`;
  skip.hidden = list.length <= ELOG_SHOW;
  skip.textContent = `(${list.length - ELOG_SHOW} earlier lines not shown: open as a file tab to read them)`;
  paintElogBar();
  elogFollow(pane);
}
function addElog(rows: Row[]) {
  const pane = elogPane();
  if (!pane) return;
  const box = pane.querySelector<HTMLElement>('.ue-lrows')!, f = document.createDocumentFragment();
  const add = rows.filter((r) => passes(r));
  if (add.length && box.querySelector('.empty')) box.replaceChildren();
  for (const r of add) f.append(rowEl(r));
  box.append(f);
  for (let k = box.children.length - ELOG_SHOW; k > 0; k--) box.firstElementChild!.remove();
  paintElogBar();
  elogFollow(pane);
}
async function refreshElog() {
  try {
    const r = await call('POST', '/api/ue/log', { which: 'editor', rows: true, lines: ELOG_KEEP, ...where() });
    st.elog = r.rows || [];
    if (r.path) st.elogPath = r.path;
  } catch (e) {
    showErr(e);
  }
  drawElog();
}
function catMenu(b: Element) {
  const f = logf(), n = new Map<string, number>();
  for (const r of st.elog) n.set(r.c || '—', (n.get(r.c || '—') || 0) + 1);
  const cats = [...n.keys()].sort((a, b) => a.localeCompare(b));
  let html = `<div class="mh"><i class="mh-ic">${I_FILT}</i><span class="mh-n">Categories</span><span class="ue-cat-acts"><button data-uecat="*">All</button><button data-uecat="!">None</button></span></div>`;
  html += cats.map((c) => `<button class="mi pick chk${f.off.includes(c) ? '' : ' on'}" data-uecat="${esc(c)}"><span class="mi-n">${esc(c)}</span><span class="d">${n.get(c)}</span></button>`).join('') || '<div class="ml">None yet</div>';
  const r = below(b);
  popMenu(r.left, r.bottom + 2, html, (m) => {
    const c = m.dataset.uecat!, now = logf();
    const off = c === '*' ? [] : c === '!' ? cats : now.off.includes(c) ? now.off.filter((x) => x !== c) : [...now.off, c];
    store.set('ue:logf', { ...now, off });
    drawElog();
    if (c === '*' || c === '!') catMenu(b);
  });
  keepMenu(() => catMenu(b));
}

function paintTabs() {
  if (!W) return;
  const k = tabNow();
  for (const b of W.el.querySelectorAll<HTMLElement>('[data-uetab]')) {
    b.classList.toggle('on', b.dataset.uetab === k);
    b.setAttribute('aria-selected', (b.dataset.uetab === k) as unknown as string);
  }
  for (const p of W.el.querySelectorAll<HTMLElement>('[data-pane]')) p.hidden = p.dataset.pane !== k;
  if (k === 'ubt') readLog(k);
  if (k === 'editor') {
    paintElogBar();
    const pane = elogPane();
    if (pane) elogFollow(pane);
  }
}

function paintWin() {
  if (!W) return;
  const i = st.info, ok = i && !i.why, run = live(st.run), { t, config } = cfg();
  W.pj.textContent = st.where?.name ? ` ${st.where.name}` : '';
  const put = (el: HTMLElement, html: string) => {
    if (el.dataset.html === html) return;
    el.innerHTML = html;
    el.dataset.html = html;
  };
  put(W.eng, `${I_ENG}<span class="ue-pt">${esc(engineName(i?.engine))}</span><span class="cv">▾</span>`);
  W.eng.title = i?.engine ? `Engine: ${engineName(i.engine)}\n${i.engine.how === 'detected' ? `Found from EngineAssociation ${i.assoc}` : 'Chosen for this project'}, in ${i.engine.dir}. Click to choose another.` : '';
  W.eng.disabled = !i || i.why === 'none' || i.why === 'os';
  put(W.cfgb, `${I_CFG}<span class="ue-pt">${esc(t ? label(t, config) : 'No configuration')}</span>${t ? '<span class="cv">▾</span>' : ''}`);
  W.cfgb.title = t ? `Target: ${t.name}, ${label(t, config)}\nWhat a build makes, for Win64. Click to choose another target or configuration.` : 'Target and configuration\nNone to build yet.';
  W.cfgb.disabled = !ok;
  const g = guarded(), lc = lcOn();
  put(W.go, `${run ? I_STOP : g ? I_AGAIN : lc ? I_BOLT : I_PLAY}<span>${run ? 'Cancel' : g ? 'Restart and build' : lc ? 'Hot Reload' : 'Build'}</span>`);
  W.go.title = run ? (st.run?.action === 'livecoding' ? 'Cancel\nStops following this Hot Reload compile. Unreal has no way to cancel it from outside.' : '') : g ? `Restart and build\nSaves, closes Unreal Editor, builds, and opens it again. Live Coding is off for this change: ${st.ed.guard[0].path} changed outside a function body.` : lc ? 'Hot Reload\nPatches the open Unreal Editor with your changes using Live Coding.' : `Build\nBuilds ${t?.name || 'the project'}, ${label(t, config)}.`;
  W.go.dataset.tipKeys = run ? '' : `${UEKEY}:${g ? 'restart and build' : lc ? 'Hot Reload' : 'build'}`;
  W.go.classList.toggle('stop', run);
  W.go.disabled = !ok;
  const edb = W.el.querySelector<HTMLButtonElement>('.ue-top [data-ue="editor"]')!;
  edb.disabled = !i?.engine || !i.path || ['bad-json', 'not-engine', 'unlisted'].includes(i.why as string);
  edb.classList.toggle('linked', !!st.ed.linked);
  edb.classList.toggle('open', !st.ed.linked && !!st.ed.open);
  edb.title = st.ed.linked ? 'Editor: linked\nUnreal Editor is open and linked to Amethyst. Hot Reload, play and stop work from here.' : st.ed.open ? "Editor: not linked\nUnreal Editor is open, but it wasn't opened from Amethyst, so Amethyst can't reach it.\n\nClose it and open it from here to link it." : pref('ue:link') ? 'Editor\nOpens the project in Unreal Editor, linked to Amethyst, so Hot Reload, play and stop work from here.' : 'Editor\nOpens the project in Unreal Editor.';
  const pb = W.el.querySelector<HTMLButtonElement>('.ue-top [data-ue="play"]')!;
  put(pb, `${st.ed.playing ? I_STOP : I_PLAY}<span>${st.ed.playing ? 'Stop' : 'Play'}</span>`);
  pb.classList.toggle('on', st.ed.playing);
  pb.setAttribute('aria-disabled', String(!st.ed.linked));
  pb.title = st.ed.playing ? '' : st.ed.linked ? 'Play\nPlays the project in Unreal Editor (Play In Editor).' : st.ed.open ? "Play\nNot possible now. Amethyst can't reach this Unreal Editor: it wasn't opened from Amethyst." : 'Play\nNot possible now. Open the editor from Amethyst first, with the Editor button.';
  const nt = noteNow();
  W.note.hidden = !nt;
  put(W.note, nt ? `<i>!</i><div><b>${esc(nt.title)}</b>${nt.text ? `<p>${esc(nt.text)}</p>` : ''}${nt.btns ? `<div class="row">${nt.btns.map(([k, l, c]) => `<button${c ? ` class="${c}"` : ''} data-uesay="${k}">${esc(l)}</button>`).join('')}</div>` : ''}</div>` : '');
  const n = countOf('error'), wn = countOf('warning'), f = footNow();
  W.foot.className = 'ue-foot' + (f.cls ? ` ${f.cls}` : '');
  put(W.foot.querySelector('.ue-fs')!, `<i>${f.mark}</i><span>${esc(f.word)}</span>`);
  const fc = (sel: string, k: number, mark: string, cls: string) => {
    const b = W!.foot.querySelector<HTMLElement>(sel)!;
    b.textContent = `${mark} ${k}`;
    b.className = `ue-fc ${sel.slice(1)}${!f.counts ? ' no' : k ? ` ${cls}` : ''}`;
  };
  fc('.ue-fe', n, '✕', 'e');
  fc('.ue-fw', wn, '▲', 'w');
  W.foot.querySelector('.ue-ft')!.textContent = f.time;
  W.foot.querySelector('.ue-fwhat')!.textContent = f.what;
  const p = st.run?.state === 'running' ? progress() : null;
  W.foot.querySelector<HTMLElement>('.ue-pbar')!.style.width = p && p.of ? `${Math.min(100, (100 * p.n) / p.of)}%` : '0';
  W.el.querySelector('.ue-pdot')!.className = 'ue-pdot' + (n ? ' e' : wn ? ' w' : '');
  paintTabs();
}

function paint() {
  paintButton();
  paintWin();
}

let engs: Engine[] | null = null;
export const ueEngines = () => engs;
export async function lookEngines(again = false) {
  try {
    engs = (await api('POST', '/api/ue/engines', { again })).engines;
  } catch (e) {
    engs = [];
    showErr(e);
  }
  if (again) refreshChecks();
  page.renderSettings?.();
}
export async function changeEngines(body: { add?: string; remove?: string; ok?: string; uproject?: string }, at: Where | null = null) {
  let ok = false;
  try {
    engs = (await (at ? api('POST', '/api/ue/engines', body, at.pid, at.wid) : api('POST', '/api/ue/engines', body))).engines;
    ok = true;
    refreshChecks();
    store.set('ue:engines', Date.now());
  } catch (e) {
    showErr(e);
  }
  page.renderSettings?.();
  return ok;
}
export async function addEngine() {
  const dir = desk?.pickFolder ? await desk.pickFolder({ title: 'the Unreal Engine folder (the one with Engine in it)' }) : await ask({ title: 'Unreal Engine folder', text: 'Its full path: the folder with Engine in it.', placeholder: 'E:\\Unreal Engine\\UE_5.7' });
  if (dir) changeEngines({ add: String(dir) });
}

type Index = { state: string; version: string; done: number; total: number; built: number; names: number; error: string | null; engine?: string };
let index: Index | null = null, indexKey = '', indexAsked = '', indexSoon = 0;
export { ueUht } from './checks.ts';
export async function runUht() {
  try {
    setUht(await call('POST', '/api/ue/uht', { uproject: st.choice.uproject, engine: st.choice.engine, run: true }));
  } catch (e) {
    showErr(e);
  }
}

export const ueIndex = () => {
  if (st.key && indexAsked !== st.key) lookIndex();
  return indexKey === st.key ? index : null;
};
export async function lookIndex(rebuild = false) {
  const key = (indexAsked = st.key);
  clearTimeout(indexSoon);
  const was = index?.state;
  try {
    const r = await call('POST', '/api/ue/index', { uproject: st.choice.uproject, engine: st.choice.engine, rebuild });
    if (key !== st.key) return;
    index = r.index ? { ...r.index, engine: r.engine } : null;
    indexKey = key;
  } catch (e) {
    if (rebuild) showErr(e);
  }
  if (index?.state === 'building') indexSoon = setTimeout(() => lookIndex(), 1000) as unknown as number;
  if (was === 'building' && index?.state === 'ready') refreshChecks();
  page.renderSettings?.();
}

export function placeUe() {
  if (POP || WIN !== 1) return;
  const on = pref('ue:on') && !!S.pid;
  if (on) {
    keepName();
    attach(here());
  } else attach(null);
  if (!pref('ue:on') && OWN && outNow) hideWindow();
  paint();
  if (!W) return;
  const open = on && boxState().open;
  W.el.hidden = !open;
  if (open) W.fr?.fit();
}
onPlace(placeUe);

if (POP) {
  makeWin();
  document.body.classList.add('qt-pop');
  setTheme(store.text('theme3')!);
  W!.el.hidden = false;
  document.title = amTag + 'build · Amethyst';
  attach(here());
  paint();
  addEventListener('storage', (e) => {
    if (e.key === 'mind.' + nameKey()) {
      if (st.where) st.where.name = here().name;
      paint();
    } else if (e.key === 'mind.ue:changed') load();
    else if (e.key === 'mind.' + tabKey() || e.key === 'mind.ue:warn') paint();
    else if (e.key === 'mind.theme3') setTheme(e.newValue as string);
  });
  addEventListener('keydown', (e) => is(e, UEKEY) && (e.preventDefault(), live(st.run) || act('build')));
} else if (WIN === 1) {
  addEventListener('focus', () => placeUe());
  if (!OWN) {
    makeWin();
    import('../app/float.ts').then(({ frame, preset }) => {
      W!.fr = frame(W!.el, 'ueWin', () => preset(4));
      page.layout();
    });
  } else {
    desk!.onQuickPop?.((kinds) => {
      const was = outNow;
      outNow = kinds.includes('ue');
      if (outNow && !pref('ue:on')) return hideWindow();
      if (was !== outNow) paint();
    });
    desk!.quickWindow('ue').then((kinds: string[]) => (outNow = kinds.includes('ue')));
  }
  addEventListener('storage', (e) => {
    if (e.key === 'mind.ue:changed' && st.key) load();
    else if (e.key === 'mind.ue:engines' && engs) lookEngines();
    else if (e.key === 'mind.' + winKey()) page.layout();
    else if (e.key === 'mind.ue:ask' && e.newValue) {
      const o = JSON.parse(e.newValue);
      if (o?.p && o.to === placeNow()) askAgent(o.p).then(() => window.focus());
    } else if (e.key === 'mind.ue:open' && e.newValue) {
      const o = JSON.parse(e.newValue);
      if (o?.abs && o.to === placeNow()) openHere(o.abs, o.line).then(() => window.focus());
    }
  });
  onPref('ue:on', (on) => on && !engs && lookEngines());
  onPref('ue:ask', () => drawProblems());
  if (pref('ue:on')) lookEngines();
}
every(1000, () => live(st.run) && paint());
