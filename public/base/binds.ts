import { store } from './util.ts';

type Keyish = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export const TWICE = 'ctrl ctrl';
export const BINDS = [
  ['modeEditor', 'modes', 'the editor (again: the next layout)', 'alt+e'],
  ['modeChat', 'modes', 'agents (again: the next set)', 'alt+a'],
  ['modeTerm', 'modes', 'terminals', 'alt+t'],
  ['modeResearch', 'modes', 'research', 'alt+r'],
  ['modeOrch', 'modes', 'orchestration', 'alt+q'],
  ['newSetChat', 'modes', 'a new agents set (slots: in the first free slot)', 'alt+shift+a'],
  ['newLayout', 'modes', 'a new editor layout (slots: in the first free slot)', 'alt+shift+e'],
  ['newSetTerm', 'modes', 'a new terminals set (slots: in the first free slot)', ''],
  ['closeSet', 'modes', 'close the set or layout on screen (the first: clear it), asked first', 'alt+x'],
  ['projPrev', 'modes', 'the project before', 'alt+shift+arrowleft'],
  ['projNext', 'modes', 'the project after', 'alt+shift+arrowright'],
  ['next', 'agents and terminals', 'the next one that needs you', 'alt+n'],
  ['cellNext', 'agents and terminals', 'the next cell', 'alt+j'],
  ['cellPrev', 'agents and terminals', 'the cell before', 'alt+k'],
  ['newCell', 'agents and terminals', 'a new empty cell in the set on screen', 'ctrl+q'],
  ['benchKey', 'agents and terminals', 'bench the selected chat or terminal: a chat moves to orchestration (where there is one), a terminal keeps running under Benched', 'alt+b'],
  ['orchKey', 'agents and terminals', "move the selected chat to orchestration: out of its set, it keeps running in orchestration's list", ''],
  ['railKey', 'agents and terminals', 'the agents or terminals list: hide / show', 'alt+h'],
  ['windowKey', 'agents and terminals', 'the next chat, top to bottom (shift: the one before); a chat with a question lands on it', 'tab', 'shift'],
  ['boxKey', 'agents and terminals', "a chat: between its question and its text box", TWICE],
  ['modeKey', 'agents and terminals', "in a chat's text box: step the mode (shift: back)", 'alt+m', 'shift'],
  ['modelNextKey', 'agents and terminals', "in a chat's text box: the next model", 'alt+c'],
  ['modelPrevKey', 'agents and terminals', "in a chat's text box: the model before", 'alt+z'],
  ['micKey', 'agents and terminals', "in a chat's text box: speak your message (again: stop and type it in)", 'alt+v'],
  ['quoteKey', 'agents and terminals', 'a chat: add the text selected in a reply to your message', 'shift+r'],
  ['find', 'agents and terminals', 'a chat: find in its box or in the whole chat (again: the other); settings: find a setting', 'ctrl+f'],
  ['newChatN', 'agents and terminals', 'agents, orchestration and the editor: a new chat (1 Claude Agent, 2 Codex Agent, 3 Antigravity Agent, 4 Cursor Agent, 5 Copilot Agent, 6 Grok Agent)', 'ctrl', 'n'],
  ['noteKey', 'agents and terminals', 'a chat: its note, show / hide', 'ctrl+n'],
  ['clearKey', 'agents and terminals', 'a chat: clear it (asks first)', 'ctrl+t'],
  ['fireGo', 'agents and terminals', "research's box: send it and go with it", 'ctrl+enter'],
  ['quickTerm', 'agents and terminals', "the project's quick terminal: show / hide, from anywhere", 'ctrl+`'],
  ['quickPwsh', 'agents and terminals', "the project's quick PowerShell: show / hide, from anywhere", 'ctrl+~'],
  ['quickAgent', 'agents and terminals', "the project's Quick Agent: show / hide, from anywhere", 'ctrl+shift+ '],
  ['scratch', 'write', 'scratch pad, from anywhere', 'alt+s'],
  ['sketch', 'write', 'sketch board, from anywhere', 'alt+d'],
  ['inboxKey', 'write', 'the inbox window: every file in it', 'alt+i'],
  ['newForget', 'write', "new don't forget, from anywhere", 'ctrl+j'],
  ['split', 'tabs', 'split: a new group on the right', 'ctrl+\\'],
  ['closeTab', 'tabs', 'close the tab', 'alt+w'],
  ['headerSwitch', 'tabs', 'C and C++: open the other half (Foo.h ↔ Foo.cpp)', 'alt+o'],
  ['reopen', 'tabs', 'bring the closed tab back', 'alt+shift+t'],
  ['newAgentKey', 'agents and terminals', "a new chat, like the top bar's + agent (the picker opens at the pointer)", 'ctrl+r'],
  ['refreshBrowser', 'tabs', 'refresh the browser tab', 'ctrl+shift+r'],
  ['tabN', 'tabs', 'tab 1 to 9 of the group (keys, then a digit)', 'alt', 'n'],
  ['tabPrev', 'tabs', 'the tab before', 'alt+arrowleft'],
  ['tabNext', 'tabs', 'the tab after', 'alt+arrowright'],
  ['grpPrev', 'tabs', 'the group before', 'ctrl+alt+arrowleft'],
  ['grpNext', 'tabs', 'the group after', 'ctrl+alt+arrowright'],
  ['files', 'more', 'go to a file or chat: by its name or a word in it', 'ctrl+p'],
  ['openFile', 'more', 'open a file from anywhere', 'ctrl+o'],
  ['commands', 'more', 'every command by its name', 'ctrl+shift+p'],
  ['settings', 'more', 'settings', 'ctrl+,'],
  ['ueBuild', 'more', 'Unreal: build the project (while building: the build window)', 'ctrl+shift+b'],
  ['ueWindow', 'more', 'Unreal: the build window, show / hide', ''],
  ['ueNewClass', 'more', 'Unreal: new class…', ''],
  ['ueNewModule', 'more', 'Unreal: new module…', ''],
  ['ueNewPlugin', 'more', 'Unreal: new plugin…', ''],
  ['debugGo', 'debug', 'debug: start (the editor, or attach to it) / continue', 'f5'],
  ['debugPause', 'debug', 'debug: pause', 'f6'],
  ['debugStop', 'debug', 'debug: stop (detach: the program keeps running)', 'shift+f5'],
  ['debugOver', 'debug', 'debug: step over', 'f10'],
  ['debugInto', 'debug', 'debug: step into', 'f11'],
  ['debugOut', 'debug', 'debug: step out', 'shift+f11'],
  ['debugRunTo', 'debug', 'debug: run to the cursor', 'ctrl+f10'],
  ['debugGoto', 'debug', 'debug: set next statement (move the arrow to the cursor, within the function)', 'ctrl+shift+f10'],
  ['debugColumn', 'debug', 'the debug column: show / hide', 'ctrl+shift+d'],
  ['debugBp', 'debug', 'a C or C++ file: add or remove a breakpoint on the cursor line', 'f9'],
  ['debugBpOff', 'debug', 'a C or C++ file: turn the breakpoint on the cursor line off / on', 'ctrl+f9'],
  ['debugBpCond', 'debug', 'a C or C++ file: a condition for the breakpoint on the cursor line', 'ctrl+shift+f9'],
  ['newWindowKey', 'more', 'a new window of the app', 'alt+shift+n'],
  ['winEvery', 'more', 'keep this window when you switch projects, on / off', ''],
  ['undo', 'more', 'undo the last thing you did', 'ctrl+z'],
  ['redo', 'more', 'redo', 'ctrl+shift+z'],
  ['save', 'more', 'save now', 'ctrl+s'],
  ['up', 'more', 'up a level', '', 'plain'],
  ['search', 'more', 'search', '/', 'plain'],
  ['topBarKey', 'more', 'the top bar: hide / show', 'ctrl+d'],
  ['bottomBarKey', 'more', 'the bottom bar: hide / show', 'ctrl+g'],
  ['explorerKey', 'more', 'the explorer: show / hide', 'ctrl+e'],
  ['gitKey', 'more', 'source control: show / hide', 'ctrl+shift+g'],
  ['pinsKey', 'more', 'the Pinned list: show / hide', 'alt+p'],
  ['newWorkspace', 'more', 'the workspaces screen: make a workspace', 'w', 'plain'],
  ['archive', 'more', 'archive what is open', 'delete', 'plain'],
  ['sheet', 'more', 'the keys sheet', '?', 'plain'],
  ...[['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['cursor', 'Cursor'], ['copilot', 'Copilot'], ['grok', 'Grok']].flatMap(([a, name]) => [1, 2, 3, 4, 5].map((n) => [`model.${a}.${n}`, 'agents and terminals', `a ${name} chat: the model of row ${n} in settings`, `alt+${n}`])),
];
const BY = new Map(BINDS.map((b) => [b[0], b]));
let mine: Record<string, any> = {}, write: (keys: Record<string, any>) => void = () => {};
export const setMine = (keys: Record<string, any>) => (mine = keys);
export const onWrite = (fn: (keys: Record<string, any>) => void) => (write = fn);
function put(id: string, v: unknown) {
  mine = { ...mine, [id]: v };
  if (v === undefined) delete mine[id];
  write(mine);
}

export const bound = (id: string): string => (typeof mine[id] === 'string' ? mine[id] : BY.get(id)![3]);
export const setBound = (id: string, combo: string | undefined) => put(id, combo === BY.get(id)![3] ? undefined : combo);
export const resetAll = () => {
  mine = {};
  write(mine);
};
export const fnKeys = (): Record<string, string> => Object.fromEntries(Object.entries(mine).filter(([k, v]) => k.startsWith('fn:') && typeof v === 'string').map(([k, v]) => [k.slice(3), v]));
export const setFnKey = (m: string, key?: string) => put('fn:' + m, key);

const OLD = ['modeKey', 'modelNextKey', 'modelPrevKey', 'windowKey', 'newWindowKey'];
const oldName = (id: string) => (OLD.includes(id) ? id : 'bind.' + id);
const plainIds = () => BINDS.map(([id]) => id).filter((id) => !id.startsWith('model.'));
export function oldKeys() {
  const out: Record<string, string> = {}, str = (v: unknown): v is string => typeof v === 'string';
  for (const id of plainIds()) {
    const v = store.get(oldName(id));
    if (str(v) && v !== BY.get(id)![3]) out[id] = v;
  }
  const m = store.get('bind.modelN');
  if (str(m) && m !== 'alt') for (const [id] of BINDS) if (id.startsWith('model.')) out[id] = m && `${m}+${id.slice(-1)}`;
  for (const [mode, key] of Object.entries(store.get('modeFns', {}))) if (str(key)) out['fn:' + mode] = key;
  return out;
}
export const dropOld = () => [...plainIds().map(oldName), 'bind.modelN', 'modeFns'].forEach((k) => store.del(k));

const MODS = ['control', 'alt', 'shift', 'meta', 'altgraph'];
export const mods = (e: Keyish): string[] => [(e.ctrlKey || e.metaKey) && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean) as string[];
export const comboOf = (e: Keyish, noShift?: boolean): string => {
  const k = e.key.toLowerCase();
  if (MODS.includes(k)) return '';
  const sym = k.length === 1 && k !== ' ' && k === k.toUpperCase();
  return [...mods(e).filter((m) => !((noShift || sym) && m === 'shift')), k].join('+');
};
export function is(e: Keyish, id: string): boolean {
  const b = bound(id), how = BY.get(id)![4];
  if (!b) return false;
  if (how === 'n') return /^[1-9]$/.test(e.key) && mods(e).join('+') === b;
  return comboOf(e, how === 'shift') === b;
}

const GLYPH: Record<string, string> = { [TWICE]: 'ctrl ctrl', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', ' ': 'space', escape: 'esc', delete: 'del' };
export const show = (combo: string | null | undefined): string => (combo ? combo.split(/\+(?!$)/).map((t) => GLYPH[t] || t).join(' ') : '');
export const modelSlot = (e: Keyish, agent: string): number => [1, 2, 3, 4, 5].find((n) => is(e, `model.${agent}.${n}`)) || 0;
const isModel = (id: string) => id.startsWith('model.');
const digitOf = (combo: string, other: string) => other.startsWith(combo + '+') && /^[1-9]$/.test(other.slice(combo.length + 1));
function shared(id: string, o: string, combo: string): boolean {
  const b = bound(o), n = BY.get(id)?.[4] === 'n', on = BY.get(o)![4] === 'n';
  if (o === id || !b || (n && on) || (isModel(id) && o === 'tabN') || (id === 'tabN' && isModel(o))) return false;
  if (isModel(id) && isModel(o) && id.split('.')[1] !== o.split('.')[1]) return false;
  return n ? digitOf(combo, b) : on ? digitOf(b, combo) : b === combo;
}
export const taken = (id: string, combo: string): string | undefined => BINDS.find(([o]) => shared(id, o, combo))?.[0];
export const labelOf = (id: string): string => BY.get(id)![2];
export const howOf = (id: string): string | undefined => BY.get(id)![4];
export const defaultOf = (id: string): string => BY.get(id)![3];
export const modeBind = (m: string): string => 'mode' + m[0].toUpperCase() + m.slice(1);

function readKeys() {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/api/keys', false);
    x.send();
    return x.status === 200 ? JSON.parse(x.responseText) : null;
  } catch {
    return null;
  }
}
export const firstKeys = readKeys();
if (firstKeys && !firstKeys.broken) setMine(firstKeys.keys);

const twice: [string, () => void][] = [];
export const onTwice = (id: string | null, fn: () => void) => twice.push([id || '', fn]);
let downAt = 0, solo = false, upAt = 0;
export function tappedTwice(e: KeyboardEvent) {
  const now = performance.now();
  if (e.type === 'keydown') {
    if (e.key === 'Control' && !e.repeat && !e.altKey && !e.shiftKey && !e.metaKey) (downAt = now), (solo = true);
    else if (e.key !== 'Control') (solo = false), (upAt = 0);
    return false;
  }
  if (e.key !== 'Control') return false;
  if (!solo || now - downAt > 350) return (upAt = 0), false;
  solo = false;
  if (upAt && now - upAt < 450) return (upAt = 0), true;
  upAt = now;
  return false;
}
if (typeof document !== 'undefined') {
  const watch = (e: KeyboardEvent) => {
    if (!tappedTwice(e)) return;
    for (const [id, fn] of twice) if (!id || bound(id) === TWICE) fn();
  };
  document.addEventListener('keydown', watch, true);
  document.addEventListener('keyup', watch, true);
  document.addEventListener('pointerdown', () => (upAt = 0), true);
  addEventListener('blur', () => (upAt = 0));
}
