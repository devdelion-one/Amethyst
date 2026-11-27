import { addEngine, changeEngines, lookEngines, lookIndex, runUht, ueEngines, ueIndex, ueUht } from '../ue/ue.ts';
import { ueChecksFor } from '../ue/checks.ts';
import { downloadDebugger, engineNow, loadEngine, removeDebugger } from '../debug/debug.ts';
import { mbOf } from '../debug/column.ts';
import { S } from '../base/model.ts';
import { pref, PREFS, setPref } from '../base/prefs.ts';
import { addPart, box, rowHtml, wordsOf } from './setstd.ts';
import type { At, Choice, Item, Row } from './setstd.ts';

export const UE_LEAD = 'Unreal Engine projects: the engines, the build button and its window, help while you write C++, and the debugger.';

const DESKTOP = !!window.amethyst?.desktop;
const and = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || '');
const at = (key: string, o: Partial<At> = {}): At => ({ key, place: 'ue', ...o });
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ueName = (id: string) => (/^\d/.test(id) ? 'UE ' + id : 'UE (source)');
const many = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

const words = (k: string) => wordsOf(k);
const sw = (k: string, o: Partial<Row> = {}): Row => ({
  id: k, key: k, sw: 'onoff', plain: true, noPic: true, adv: !!PREFS[k].adv, at: [at(k)],
  state: () => (pref(k) ? words(k).on : words(k).off),
  alt: () => (pref(k) ? words(k).off : words(k).on),
  note: () => words(k).desc,
  ...o,
});
const shown = (k: string) => !PREFS[k].desktop || DESKTOP;

const ON_GIVES = 'Turn it on and Unreal projects get the build button, its key and window, and help while you write C++.';
function projectLine() {
  if (!S.pid) return '';
  const k = ueChecksFor();
  return !k ? '' : k.unreal ? 'This project is an Unreal project.' : "This project isn't an Unreal project.";
}
const supportRow = () => sw('ue:on', {
  state: () => (pref('ue:on') ? `${words('ue:on').on} ${projectLine()}`.trim() : words('ue:on').off),
  note: () => (pref('ue:on') ? '' : ON_GIVES),
});

type Engine = { id: string; dir: string; from?: string };
function enginesState() {
  const list = ueEngines() as Engine[] | null;
  if (list === null) return 'Looking for engines.';
  if (!list.length) return 'No engines found.';
  return `${list.length === 1 ? '1 engine' : `${list.length} engines`} found: ${and(list.map((e) => ueName(e.id)))}.`;
}
const engineItems = (): Item[] => ((ueEngines() || []) as Engine[]).map((e) => ({
  id: e.dir, name: ueName(e.id), sub: e.dir,
  ...(e.from === 'added' ? { remove: { label: `Take ${ueName(e.id)} off the list`, tip: `Take it off the list\nAmethyst stops building with ${e.dir}. Nothing is deleted.`, run: () => void changeEngines({ remove: e.dir }) } } : {}),
}));
const enginesRow = (): Row => ({
  id: 'ue:engines', key: 'ue:engines', sw: 'none', plain: true, noPic: true, noReset: true, at: [at('ue:engines', { on: () => true })],
  own: { label: 'Engines on this PC', desc: 'Add an engine you copied by hand and never registered, so Amethyst can build with it. Only an engine you added has a × to take it off the list.', find: 'engines on this pc Add an engine folder' },
  state: enginesState,
  note: () => 'Add an engine you copied by hand and never registered, so Amethyst can build with it. Only an engine you added has a × to take it off the list.',
  list: engineItems,
  add: { label: 'Add an engine folder…', tip: 'Add an engine folder\nAn Unreal Engine you copied by hand and never registered.', run: () => void addEngine() },
  btn: { label: 'Look again', tip: 'Look again\nLooks for the engines on this PC once more.', run: () => void lookEngines(true) },
});

const INDEX_DESC = 'The types, macros and modules of the engine and this project, so a misspelled name is marked as you type.';
function indexRow(): Row[] {
  const x = ueIndex();
  if (!x) return [];
  const name = x.engine ? ueName(x.engine) : 'the engine';
  const state = x.state === 'building' ? `Building, ${x.total ? Math.floor((100 * x.done) / x.total) : 0} % done.` : x.state === 'ready' ? `Built at ${clock(x.built)} from ${name}, with ${x.names.toLocaleString('en-US')} names.` : x.state === 'failed' ? `Couldn't read ${name}.` : 'Not built yet.';
  return [{
    id: 'ue:index', key: 'ue:index', sw: 'none', plain: true, noPic: true, noReset: true, at: [at('ue:index', { on: () => true })],
    own: { label: 'Engine names for spelling checks', desc: INDEX_DESC, find: 'engine list' },
    state: () => state,
    note: () => (x.state === 'failed' && x.error ? `${x.error.replace(/[.\s]+$/, '')}.` : INDEX_DESC),
    ...(x.state === 'building' ? {} : { btn: { label: x.state === 'ready' || x.state === 'failed' ? 'Rebuild' : 'Build', tip: 'Rebuild\nReads the engine and this project again.', run: () => void lookIndex(true) } }),
  }];
}

const UHT_WHY: Record<string, string> = {
  'no-manifest': 'It first runs after a build, as it reads the list of headers the build writes.',
  unsupported: "This engine's build tool can't run it alone.",
  building: 'It waits while a build runs.',
  unconfirmed: 'It waits for your OK in the build window.',
};
function uhtNow() {
  const x = ueUht();
  if (x?.state === 'running') return 'It is running now.';
  if (x?.state === 'queued') return 'It is about to run.';
  if (x && UHT_WHY[x.why]) return UHT_WHY[x.why];
  const l = x?.last;
  if (!l) return '';
  if (l.state === 'error') return `It last ran at ${clock(l.at)} and didn't finish.`;
  const n = l.messages.filter((m) => m.sev === 'error').length, w = l.messages.length - n;
  const found = n || w ? and([n ? many(n, 'error') : '', w ? many(w, 'warning') : ''].filter(Boolean)) : 'no problems';
  return `It last ran at ${clock(l.at)}, took ${(l.ms / 1000).toFixed(1)} seconds and found ${found}.`;
}
const uhtRow = () => sw('ue:uht', {
  state: () => (pref('ue:uht') ? `${words('ue:uht').on} ${uhtNow()}`.trim() : words('ue:uht').off),
  ...(pref('ue:uht') && ueUht()?.state !== 'running' ? { btn: { label: 'Run now', tip: 'Run now\nRuns the Unreal Header Tool over the project now.', run: () => void runUht() } } : {}),
});

const pickRow = (k: string): Row => ({
  id: k, key: k, plain: true, noPic: true, at: [at(k)],
  pick: { get: () => pref(k), set: (v) => setPref(k, v), def: PREFS[k].def, choices: () => PREFS[k].choices as Choice[], reset: `p:${k}` },
});

const DBG_DESC = "Microsoft's debug engine and its adapter, in Amethyst's own folder. Removing them deletes these files, and F5 offers the download again.";
function filesRow(): Row {
  const e = engineNow();
  if (!e) loadEngine();
  const state = !e ? 'Looking for the debugger files.' : !e.os ? 'Only on Windows for now.' : e.installing ? 'Downloading.' : e.ready ? `Downloaded, ${mbOf(e.bytes)}, version ${e.version}.` : `Not downloaded yet. It is a ${e.mb} MB download.`;
  const btn = !e?.os || e.installing ? null : e.ready ? (e.fake ? null : { label: 'Remove', tip: "Remove\nDeletes the debugger's files. F5 offers the download again.", run: () => void removeDebugger() }) : { label: 'Download…', tip: "Download\nGets Microsoft's debug engine and the adapter, after you accept Microsoft's license.", run: () => void downloadDebugger() };
  return {
    id: 'debug:files', key: 'debug:files', sw: 'none', plain: true, noPic: true, noReset: true, at: [at('debug:files', { on: () => true })],
    own: { label: 'Debugger files', desc: DBG_DESC, find: 'the debugger' },
    state: () => state, note: () => DBG_DESC,
    ...(btn ? { btn } : {}),
  };
}

const on = () => !!pref('ue:on');
const dbg = () => on() && !!pref('debug:on');
const ueRows = () => [supportRow(), ...(on() ? [enginesRow(), ...indexRow()] : [])];
const buildRows = () => (on() ? ['ue:big', 'ue:clickeditor', 'ue:edlog', 'ue:link', 'ue:livebuild', 'ue:guard'].map((k) => sw(k)) : []);
const cppRows = () => (on() ? [sw('ue:checks'), sw('ue:spechelp'), sw('ue:namehelp'), uhtRow(), sw('ue:buildmarks'), pickRow('marks:text'), sw('marks:gutter'), sw('ue:ask'), sw('ue:rpc')] : []);
const newRows = () => (on() ? [sw('ue:new'), sw('ue:comments')] : []);
const startRows = () => (on() ? [sw('debug:on'), ...(dbg() ? [filesRow(), sw('debug:build')] : [])] : []);
const stopRows = () => (dbg() ? ['debug:ensure', 'debug:cpp', 'debug:front', 'debug:giveback', 'debug:readonly', 'debug:pathbar', 'debug:dots'].filter(shown).map((k) => sw(k)) : []);
const valueRows = () => (dbg() ? ['debug:inline', 'debug:hover', 'debug:types', 'debug:fold'].map((k) => sw(k)) : []);

addPart({ rows: () => [...ueRows(), ...buildRows(), ...cppRows(), ...newRows(), ...startRows(), ...stopRows(), ...valueRows()], sel: () => '', look: () => '', example: () => '', home: 'unreal' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
const part = (id: string, title: string, list: Row[], sub: string, end = '') => (list.length ? box(id, title, rows(list) + end, sub) : '');
const SHOW_LINE = '<div class="hr-sub hr-go">The build button and the build window button are shown or hidden in Layout and bars. <button class="up-link" data-set-go="show:ue:btn" title="Open it&#10;Opens Layout and bars at the build button\'s switch.">Open it</button></div>';
export function ueHtml() {
  return part('ue', 'Unreal Engine', ueRows(), "Amethyst's help for Unreal Engine 5 projects. It is one switch for every project.") +
    part('uebuild', 'Build button and window', buildRows(), 'The Unreal build button in the dashboard and on the rail, the build window it opens, and Unreal Editor opened from Amethyst.', SHOW_LINE) +
    part('uecpp', 'While you write C++', cppRows(), 'Marks and help in the C++ files of an Unreal project.') +
    part('uenew', 'New classes and modules', newRows(), 'Making a new Unreal class, module or plugin.') +
    part('dbgstart', 'Before it starts', startRows(), 'The debugger for Unreal projects, before it runs. F5 starts it.') +
    part('dbgstop', 'When it stops', stopRows(), 'What happens when the program stops at a breakpoint, a failed ensure() or an exception.') +
    part('dbgvals', 'Call stack and values', valueRows(), "The debug column's call stack and variables, and values in the code, while the program is stopped.");
}
