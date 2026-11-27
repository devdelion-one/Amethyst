import { ask } from '../base/controls.ts';
import { cleanExt, EXT_DEFAULTS, extColors, setExtColors } from '../base/filelook.ts';
import { api, S } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { pref, PREFS, setPref } from '../base/prefs.ts';
import { esc, setSave, showErr, store } from '../base/util.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { At, Choice, Item, Pick, Row } from './setstd.ts';

export const GIT_LEAD = 'Where new files go, how the explorer opens and shows names, the archive, this project\'s branch names, what opens outside Amethyst and the settings file.';

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
const redraw = () => page.renderSettings();
const at = (key: string, place: string, o: Partial<At> = {}): At => ({ key, place, on: () => true, ...o });
const draft: Record<string, string> = {};
const typed = (k: string, sel: string, now: string) => (document.activeElement?.matches(sel) && draft[k] != null ? draft[k] : now);
const field = (k: string, attr: string, now: string, label: string, ph = '', off = false) =>
  `<input class="hr-in" ${attr} value="${esc(typed(k, `[${attr}]`, now))}" aria-label="${esc(label)}" spellcheck="false"${ph ? ` placeholder="${esc(ph)}"` : ''}${off ? ' disabled' : ''}>`;

type Arch = { archive?: string; default?: string; browser?: string };
let arch: Arch | null = null, archAsked = false;
function archNow() {
  if (!archAsked) {
    archAsked = true;
    api('GET', '/api/settings').then((r: Arch) => ((arch = r), redraw()), showErr);
  }
  return arch;
}

const prefPick = (k: string): Pick => ({ get: () => pref(k), set: (v) => setPref(k, v), def: PREFS[k].def, choices: () => PREFS[k].choices as Choice[], reset: `p:${k}` });
const pickRow = (k: string): Row => ({ id: k, key: k, plain: true, noPic: true, at: [{ key: k, place: 'f-none' }], pick: prefPick(k), note: () => PREFS[k].desc || '' });
const followRow = (): Row => {
  const k = 'side:follow', e = PREFS[k];
  return { id: k, key: k, sw: 'onoff', plain: true, noPic: true, at: [{ key: k, place: 'f-none', on: () => !!pref(k), set: (v) => setPref(k, v), def: e.def }], state: () => (pref(k) ? e.on! : e.off!), alt: () => (pref(k) ? e.off! : e.on!), note: () => e.desc || '' };
};

const OPENS = 'opens and shows the file', SHUT = 'stays closed, with the file selected in it for when you open it';
const LINK_NOTE = 'For a file link in a chat, or a file you pick in search.';
const DOCK = 'explorer:linkDock', OVER = 'explorer:linkOver';
function linkState() {
  const d = !!pref(DOCK), o = !!pref(OVER);
  if (d && o) return `The explorer ${OPENS}, beside the page and on top of it.`;
  if (!d && !o) return `The explorer ${SHUT}.`;
  return `Beside the page, the explorer ${d ? OPENS : SHUT}. On top of the page, it ${o ? OPENS : SHUT}.`;
}
const placeAt = (k: string, place: string): At => ({ key: k, place, on: () => !!pref(k), set: (v) => setPref(k, v), def: PREFS[k].def });
const placeItem = (id: string, name: string, k: string): Item => ({ id, name, on: !!pref(k), set: (v) => setPref(k, v) });
const linkRow = (): Row => ({
  id: 'f:link', key: 'f:link', sw: 'onoff', plain: true, noPic: true,
  own: { label: 'Open the explorer on the file when a link opens it', desc: LINK_NOTE, find: `${PREFS[DOCK].label}. ${PREFS[OVER].label}.` },
  at: [placeAt(DOCK, 'f-dock'), placeAt(OVER, 'f-over')],
  state: linkState, note: () => LINK_NOTE,
  list: () => [placeItem('dock', 'Beside the page', DOCK), placeItem('over', 'On top of the page', OVER)],
});

const sameExt = () => JSON.stringify(extColors()) === JSON.stringify(EXT_DEFAULTS);
const EXT_NOTE = 'An extension with no colour is dimmed. Putting the list back to the defaults drops your changes to it.';
const saveExt = (map: Record<string, string> | null, msg: string) => (setExtColors(map), setSave(msg));
function renameExt(from: string, v: string) {
  const to = cleanExt(v), m = extColors();
  if (!to) return { title: "That extension can't be used", line: 'Write one like .md or cpp.' };
  if (to === from) return;
  if (m[to]) return { title: `${to} already has a colour`, line: 'Each extension has one colour. Change that one, or remove it first.' };
  saveExt(Object.fromEntries(Object.entries(m).map(([k, c]) => [k === from ? to : k, c])), `Colours of each extension: ${from} is now ${to}`);
}
async function addExt() {
  const x = cleanExt((await ask({ title: 'Add an extension', text: 'The extension to give a colour, like .md or cpp.', value: '.' })) || '');
  if (!x) return;
  const m = extColors();
  if (!m[x]) m[x] = '#d9e0d3';
  saveExt(m, `Colours of each extension: ${x} added`);
  redraw();
}
async function renameAsk(from: string, el: HTMLElement) {
  const v = await ask({ title: `Rename ${from}`, text: 'The extension this colour is for, like .md or cpp.', label: 'extension', value: from });
  if (v == null) return;
  const bad = renameExt(from, v);
  if (bad) return void tell(el.isConnected ? el : null, { ...bad, ms: 4000 });
  redraw();
}
const extItem = ([x, hex]: [string, string]): Item => ({
  id: x, name: x,
  look: `<input type="color" class="ct-dot" data-ec-color="${esc(x)}" value="${esc(hex)}" title="${esc(`Colour of ${x}: ${hex}\nClick to change it.`)}" aria-label="${esc(`${x} colour`)}">`,
  btn: { label: 'rename…', tip: `Rename ${x}\nGives this colour to another extension.`, run: (el) => void renameAsk(x, el) },
  remove: { label: `Remove ${x}`, tip: `Remove ${x}\nTakes the colour off ${x}. Its files show dimmed.`, run: () => {
    const m = extColors();
    delete m[x];
    saveExt(m, `Colours of each extension: ${x} removed`);
  } },
});
const extColRow = (): Row => ({
  id: 'f:extcol', key: 'f:extcol', sw: 'none', plain: true, noPic: true,
  own: { label: 'Colours of each extension', desc: EXT_NOTE, find: 'extension colors' },
  at: [at('f:extcol', 'f-none')],
  state: () => (pref('explorer:ext') === 'color' ? 'Each extension in the list shows in its colour.' : `File extensions are ${pref('explorer:ext') === 'plain' ? 'plain' : 'dimmed'} now, so these colours don't show. Set them to coloured above to see them.`),
  note: () => EXT_NOTE,
  list: () => Object.entries(extColors()).map(extItem),
  add: { label: '+ add an extension', tip: 'Add an extension\nGives one more extension a colour.', run: () => void addExt() },
  reset: () => saveExt(null, 'Colours of each extension: the defaults'), changed: () => !sameExt(),
});

const ARCH_NOTE = 'Changing it moves everything already archived to the new folder. Nothing is deleted. On the same drive as a project, archiving only moves a thing. On another drive it is copied there, then removed from the project, and copied back when you restore it.';
async function moveArchive(to: string, near: Element | null) {
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', { archive: to })) };
    setSave(`Archive folder: ${arch!.archive}`);
  } catch (e) {
    redraw();
    return near?.isConnected ? tell(near, { title: "The archive can't go there", line: (e as Error).message, ms: 5000 }) : showErr(e);
  }
  redraw();
}
async function changeArchive(near: Element) {
  const now = arch?.archive || '';
  const to = DESKTOP
    ? await DESKTOP.pickFolder({ title: 'The archive folder', defaultPath: now })
    : await ask({ title: 'Archive folder', text: 'Where archived things go: an empty folder, or a new one, outside your projects. Everything archived now moves along. Nothing is deleted.', label: 'folder', value: now });
  if (to && to.trim() && to.trim() !== now) await moveArchive(to.trim(), near);
}
const openArchRow = (): Row => ({
  id: 'f:arch', key: 'f:arch', sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: 'Open the archive', desc: 'Everything you archived, to bring back.', find: 'archived things' },
  at: [at('f:arch', 'f-none')],
  state: () => 'Everything you archived, to bring back.',
  ctl: () => `<button class="chip" data-view="archive" title="Open the archive&#10;Bring archived things back from here." data-tip-keys="=4:open the archive"><kbd>4</kbd>open the archive</button>`,
});
const archDirRow = (): Row => ({
  id: 'f:archdir', key: 'f:archdir', sw: 'none', plain: true, noPic: true,
  own: { label: 'Archive folder', desc: ARCH_NOTE, find: 'archive folder' },
  at: [at('f:archdir', 'f-none')],
  state: () => (archNow() ? `Archived things are in ${arch!.archive}.` : 'Looking for the archive folder.'),
  note: () => ARCH_NOTE,
  value: () => archNow()?.archive || '',
  btn: { label: 'change…', tip: 'Change\nAnother folder for the archive. Everything archived moves along. Nothing is deleted.', run: (el) => void changeArchive(el) },
  reset: () => void moveArchive('', null), changed: () => !!arch && arch.archive !== arch.default,
});

type BranchNames = { names: Record<string, string>; saved: Record<string, string>; defaults: Record<string, string>; examples: Record<string, string> };
let bn: { pid: string | null; at: BranchNames | null } = { pid: null, at: null };
function bnNow() {
  if (S.pid && bn.pid !== S.pid) {
    bn = { pid: S.pid, at: null };
    api('GET', '/api/git/branch-names').then((r: BranchNames) => ((bn.at = r), redraw()), showErr);
  }
  return bn.at;
}
const BN: [string, string, string, (ex: string) => string, string][] = [
  ['chat', "Branch of a chat's own worktree", 'chat worktree', (ex) => `A chat's own worktree gets a branch like ${ex}.`, "You can use {chat}, the chat's code, and {user}, your git user name."],
  ['issue', 'Branch for an issue you start on', 'issue', (ex) => `Starting on issue 12 makes a branch like ${ex}.`, "It needs {n}, the issue's number. You can also use {title}, the issue's title, and {user}, your git user name."],
  ['pr', 'Branch of a pull request opened in its own folder', 'pull request folder', (ex) => `Pull request 12 opens in its own folder on a branch like ${ex}.`, "It needs {n}, the pull request's number. You can also use {user}, your git user name."],
  ['new', 'What the new branch box starts with', 'new branch box', (ex) => (ex ? `The new branch box in source control starts with ${ex}.` : 'The new branch box in source control starts empty.'), 'You can use {user}, your git user name.'],
];
async function saveBn(k: string, v: string) {
  let why = '';
  try {
    bn.at = await api('PUT', '/api/git/branch-names', { [k]: v });
    delete draft['bn' + k];
    setSave(`${BN.find((x) => x[0] === k)![1]}: ${bn.at!.names[k] || 'empty'}`);
  } catch (e) {
    draft['bn' + k] = v;
    why = (e as Error).message;
  }
  redraw();
  if (why) tell(document.querySelector(`#settings [data-bn="${k}"]`), { title: "That pattern can't be used", line: why, ms: 4000 });
}
const bnRow = ([k, label, old, said, note]: (typeof BN)[number]): Row => ({
  id: `f:bn:${k}`, key: `f:bn:${k}`, sw: 'none', plain: true, noPic: true, wide: true,
  own: { label, desc: note, find: old },
  at: [at(`f:bn:${k}`, 'f-none')],
  state: () => {
    const a = bnNow();
    return a ? said(a.examples[k] || (k === 'new' ? '' : a.names[k])) : "Reading this project's branch names.";
  },
  note: () => note,
  ctl: () => field('bn' + k, `data-bn="${k}"`, bn.at?.names[k] ?? '', label, bn.at?.defaults[k] || 'empty', !bn.at),
  reset: () => void saveBn(k, ''), changed: () => !!bn.at && bn.at.saved[k] != null,
});

const EDGE = 'Web links open in Microsoft Edge (msedge).';
async function saveBrowser(v: string) {
  if (v === (arch?.browser || '')) return;
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', { browser: v })) };
    delete draft.browser;
    setSave(`Browser for web links: ${v || 'msedge'}`);
  } catch (e) {
    draft.browser = v;
    redraw();
    return void tell(document.querySelector('#settings [data-browser]'), { title: "That browser isn't found", line: `${(e as Error).message} Web links still open in ${arch?.browser || 'msedge'}.`, ms: 6000 });
  }
  redraw();
}
const browserRow = (): Row => ({
  id: 'f:browser', key: 'f:browser', sw: 'none', plain: true, noPic: true, wide: true,
  own: { label: 'Browser for web links', desc: "Type a program's name, such as chrome, or its full path. A name Windows can't find says so.", find: 'browser for outside links msedge' },
  at: [at('f:browser', 'f-none')],
  state: () => (archNow()?.browser ? `Web links open in ${arch!.browser}.` : EDGE),
  note: () => "Type a program's name, such as chrome, or its full path. A name Windows can't find says so.",
  ctl: () => field('browser', 'data-browser', arch?.browser || '', 'Browser for web links', 'msedge'),
  reset: () => void saveBrowser(''), changed: () => !!arch?.browser,
});
const button = (id: string, label: string, state: string, desc: string, find: string, btn: Row['btn']): Row => ({
  id, key: id, sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label, desc, find }, at: [at(id, 'f-none')], state: () => state, note: () => desc, btn,
});
const outsideRows = (): Row[] => [
  browserRow(),
  ...(DESKTOP ? [button('f:apps', 'Make Amethyst the app for text and Markdown files', "Windows decides which app opens .txt and .md files. The button opens Windows' default apps on Amethyst.", 'Only in the desktop app.', 'text and markdown files make Amethyst their default app in Windows', { label: 'open default apps', tip: "Open default apps\nOpens Windows' default apps on Amethyst.", run: () => DESKTOP!.defaultApps() })] : []),
];

const SAVED = () => ['theme3', 'far', 'solid', 'look', 'code', 'codePreset', 'setColors', 'colors:tray', 'files:extColors', ...Object.keys(PREFS).filter((k) => !PREFS[k].local), 'newtab-order', 'timer:steps', 'forget:colors', 'modelKeys', 'modelKeys.codex', 'modelKeys.antigravity', 'modelKeys.cursor', 'modelKeys.copilot', 'modelKeys.grok'];
function download(file: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function exportSettings() {
  const [k, s] = await Promise.all([api('GET', '/api/keys'), api('GET', '/api/settings')]);
  const browser = Object.fromEntries(SAVED().map((key) => [key, store.text(key)]));
  download('amethyst-settings.json', JSON.stringify({ amethyst: 'settings', version: 1, browser, ...(k.broken ? {} : { keys: k.keys }), openWith: s.browser || '' }, null, 2) + '\n');
  setSave(k.broken ? `Saved your settings to a file, but not your keys: ${k.path} can't be read.` : 'Saved every setting to amethyst-settings.json.');
}
async function importSettings(text: string) {
  const f = JSON.parse(text);
  if (f?.amethyst !== 'settings' || !f.browser || typeof f.browser !== 'object') throw new Error("it isn't an Amethyst settings file");
  if (Object.values(f.browser).some((v) => v !== null && typeof v !== 'string')) throw new Error('a setting in it is not text');
  if (f.keys != null) await api('PUT', '/api/keys', { keys: f.keys });
  if (typeof f.openWith === 'string') await api('PUT', '/api/settings', { browser: f.openWith }).catch(showErr);
  for (const key of SAVED().filter((x) => x in f.browser)) {
    if (f.browser[key] === null) store.del(key);
    else store.setText(key, f.browser[key]);
  }
  location.reload();
}
const pickAll = document.createElement('input');
pickAll.type = 'file';
pickAll.accept = '.json,application/json';
pickAll.addEventListener('change', async () => {
  const f = pickAll.files![0];
  pickAll.value = '';
  if (!f) return;
  try {
    await importSettings(await f.text());
  } catch (e) {
    setSave(`${f.name}: ${(e as Error).message}. Nothing changed.`, true);
  }
});
export const LOAD_ASK = { title: 'Load settings from a file?', text: "Replaces your settings with the file's and reloads this window. Folders and branch names stay as they are." };
async function loadAsk() {
  if (!(await ask({ ...LOAD_ASK, confirm: true }))) return;
  pickAll.click();
}
const fileRows = (): Row[] => [
  button('f:save', 'Save every setting to a file', 'Saves amethyst-settings.json with your settings and your keys.', "The archive folder, the worktrees folder, branch names and Amethyst tools aren't in it.", 'settings file export every setting in one file, to load on another PC', { label: 'save to a file', tip: 'Save to a file\nSaves amethyst-settings.json with every setting and your keys.', run: () => void exportSettings().catch(showErr) }),
  button('f:load', 'Load settings from a file', "Asks first, then replaces your settings with the file's and reloads this window.", "Settings that aren't in the file stay as they are.", 'settings file import loads a settings file and reloads this window', { label: 'load a file', tip: 'Load a file\nAsks first, then loads a settings file and reloads this window.', run: () => void loadAsk() }),
];

const newRows = (): Row[] => [pickRow('newfile:to')];
const exRows = (): Row[] => [followRow(), linkRow(), pickRow('explorer:ext'), extColRow()];
const archRows = (): Row[] => [openArchRow(), archDirRow()];
const bnRows = (): Row[] => (S.pid ? BN.map(bnRow) : []);

addPart({ rows: () => [...newRows(), ...exRows(), ...archRows(), ...bnRows(), ...outsideRows(), ...fileRows()], sel: () => '', look: () => '', example: () => '', home: 'files' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function gitHtml() {
  return box('fnew', 'New files', rows(newRows()), 'Making a new file when no folder is picked in the explorer.') +
    box('fex', 'Explorer', rows(exRows()), 'The file tree, as a column beside the page or on top of it.') +
    box('farch', 'Archive', rows(archRows()), 'Where the things you archive go, to bring back later. Press 4 to open it.') +
    box('fbn', 'Branch names in this project', S.pid ? rows(bnRows()) : '<div class="cc-help" data-bn-none>Open a project to set its branch names.</div>', 'The names Amethyst gives new branches in the project you are in. Each project keeps its own.') +
    box('fout', 'Opening things outside Amethyst', rows(outsideRows()), 'Web links and files that Amethyst hands to another program.') +
    box('ffile', 'Settings file', rows(fileRows()), 'Every setting in one file, to move them to another PC.');
}

const FIELDS = '[data-bn], [data-browser]';
const busy = new Set<string>();
async function apply(f: HTMLInputElement) {
  const k = f.matches('[data-browser]') ? 'browser' : f.dataset.bn!;
  if (busy.has(k) || (k !== 'browser' && f.value === (bn.at?.names[k] ?? ''))) return;
  busy.add(k);
  try {
    await (k === 'browser' ? saveBrowser(f.value.trim()) : saveBn(k, f.value));
  } finally {
    busy.delete(k);
  }
}
export function gitInit(root: HTMLElement) {
  document.addEventListener('focusin', (e: FocusEvent) => {
    const t = e.target as Element;
    for (const k of Object.keys(draft)) if (!t.matches?.(k === 'browser' ? '[data-browser]' : `[data-bn="${k.slice(2)}"]`)) delete draft[k];
  });
  root.addEventListener('keydown', (e: KeyboardEvent) => {
    const f = (e.target as Element).closest<HTMLInputElement>(FIELDS);
    if (!f || e.key !== 'Enter') return;
    e.preventDefault();
    void apply(f);
  });
  root.addEventListener('input', (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches(FIELDS)) draft[t.matches('[data-browser]') ? 'browser' : 'bn' + t.dataset.bn] = t.value;
  });
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches(FIELDS)) return void apply(t);
    if (t.dataset.ecColor == null) return;
    const hex = t.value.toLowerCase();
    saveExt({ ...extColors(), [t.dataset.ecColor]: hex }, `Colours of each extension: ${t.dataset.ecColor} is ${hex}`);
    redraw();
  });
}
