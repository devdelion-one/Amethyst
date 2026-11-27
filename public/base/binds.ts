import { store } from './util.ts';

type Keyish = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };

export const TWICE = 'ctrl ctrl';
export const BINDS = [
  ['modeEditor', 'modes', 'Open the editor', 'alt+e'],
  ['modeTerm', 'modes', 'Open terminals', 'alt+t'],
  ['modeOrch', 'modes', 'Open orchestration', 'alt+q'],
  ['newLayout', 'modes', 'New editor layout', 'alt+shift+e'],
  ['newSetTerm', 'modes', 'New terminal set', ''],
  ['closeSet', 'modes', 'Close the layout or set on screen', 'alt+x'],
  ['projPrev', 'modes', 'Previous project', 'alt+shift+arrowleft'],
  ['projNext', 'modes', 'Next project', 'alt+shift+arrowright'],
  ['next', 'agents and terminals', 'Go to the next chat or terminal that needs you', 'alt+n'],
  ['cellNext', 'agents and terminals', 'Next window in the set', 'alt+j'],
  ['cellPrev', 'agents and terminals', 'Previous window in the set', 'alt+k'],
  ['newCell', 'agents and terminals', 'New empty window in the terminal set', 'ctrl+q'],
  ['benchKey', 'agents and terminals', 'Bench the selected terminal', 'alt+b'],
  ['orchKey', 'agents and terminals', 'Move a chat tab to orchestration', ''],
  ['railKey', 'agents and terminals', 'Show or hide the terminals list', 'alt+h'],
  ['windowKey', 'agents and terminals', 'Next chat, top to bottom', 'tab', 'shift'],
  ['boxKey', 'agents and terminals', "Move between a chat's question and its message box", TWICE],
  ['modeKey', 'agents and terminals', 'Next chat mode', 'alt+m', 'shift'],
  ['modelNextKey', 'agents and terminals', 'Next model', 'alt+c'],
  ['modelPrevKey', 'agents and terminals', 'Previous model', 'alt+z'],
  ['micKey', 'agents and terminals', 'Speak your message', 'alt+v'],
  ['quoteKey', 'agents and terminals', 'Quote the selected reply text', 'shift+r'],
  ['find', 'agents and terminals', 'Find', 'ctrl+f'],
  ['newChatN', 'agents and terminals', 'New chat with a numbered agent', 'ctrl', 'n'],
  ['noteKey', 'agents and terminals', "Show or hide the chat's note", 'ctrl+n'],
  ['clearKey', 'agents and terminals', 'Clear the chat', 'ctrl+t'],
  ['quickTerm', 'agents and terminals', 'Show or hide the quick terminal', 'ctrl+`'],
  ['quickPwsh', 'agents and terminals', 'Show or hide the quick PowerShell', 'ctrl+~'],
  ['quickAgent', 'agents and terminals', 'Show or hide the Quick Agent', 'ctrl+shift+ '],
  ['scratch', 'write', 'Open the scratch pad', 'alt+s'],
  ['sketch', 'write', 'Open the sketch board', 'alt+d'],
  ['inboxKey', 'write', 'Open the inbox', 'alt+i'],
  ['newForget', 'write', "New don't forget", 'ctrl+j'],
  ['split', 'tabs', 'Split the editor', 'ctrl+\\'],
  ['closeTab', 'tabs', 'Close the tab', 'alt+w'],
  ['headerSwitch', 'tabs', 'Open the matching header or source file', 'alt+o'],
  ['reopen', 'tabs', 'Bring back the closed tab', 'alt+shift+t'],
  ['newAgentKey', 'agents and terminals', 'Start a new agent chat', 'ctrl+r'],
  ['refreshBrowser', 'tabs', 'Refresh the browser tab', 'ctrl+shift+r'],
  ['tabN', 'tabs', 'Go to tab 1 to 9', 'alt', 'n'],
  ['tabPrev', 'tabs', 'Previous tab', 'alt+arrowleft'],
  ['tabNext', 'tabs', 'Next tab', 'alt+arrowright'],
  ['grpPrev', 'tabs', 'Previous tab group', 'ctrl+alt+arrowleft'],
  ['grpNext', 'tabs', 'Next tab group', 'ctrl+alt+arrowright'],
  ['files', 'more', 'Find a file or chat', 'ctrl+p'],
  ['openFile', 'more', 'Open a file', 'ctrl+o'],
  ['commands', 'more', 'Find a command', 'ctrl+shift+p'],
  ['settings', 'more', 'Open Settings', 'ctrl+,'],
  ['ueBuild', 'more', 'Build the Unreal project', 'ctrl+shift+b'],
  ['ueWindow', 'more', 'Show or hide the Unreal build window', ''],
  ['ueNewClass', 'more', 'New Unreal class', ''],
  ['ueNewModule', 'more', 'New Unreal module', ''],
  ['ueNewPlugin', 'more', 'New Unreal plugin', ''],
  ['debugGo', 'debug', 'Start debugging or continue', 'f5'],
  ['debugPause', 'debug', 'Pause', 'f6'],
  ['debugStop', 'debug', 'Stop debugging', 'shift+f5'],
  ['debugOver', 'debug', 'Step over', 'f10'],
  ['debugInto', 'debug', 'Step into', 'f11'],
  ['debugOut', 'debug', 'Step out', 'shift+f11'],
  ['debugRunTo', 'debug', 'Run to the cursor', 'ctrl+f10'],
  ['debugGoto', 'debug', 'Set the next statement', 'ctrl+shift+f10'],
  ['debugColumn', 'debug', 'Show or hide the debug column', 'ctrl+shift+d'],
  ['debugBp', 'debug', 'Add or remove a breakpoint', 'f9'],
  ['debugBpOff', 'debug', 'Turn a breakpoint off or on', 'ctrl+f9'],
  ['debugBpCond', 'debug', 'Condition for a breakpoint', 'ctrl+shift+f9'],
  ['newWindowKey', 'more', 'New window of the app', 'alt+shift+n'],
  ['winEvery', 'more', 'Keep this window when you switch projects', ''],
  ['undo', 'more', 'Undo', 'ctrl+z'],
  ['redo', 'more', 'Redo', 'ctrl+shift+z'],
  ['save', 'more', 'Save now', 'ctrl+s'],
  ['up', 'more', "Up to this workspace's projects", '', 'plain'],
  ['search', 'more', 'Search the explorer', '/', 'plain'],
  ['bottomBarKey', 'more', 'Show or hide the bottom bar', 'ctrl+g'],
  ['dashKey', 'more', 'Show or hide the dashboard', 'ctrl+d'],
  ['explorerKey', 'more', 'Show or hide the explorer', 'ctrl+e'],
  ['gitKey', 'more', 'Show or hide source control', 'ctrl+shift+g'],
  ['pinsKey', 'more', 'Show or hide the Pinned list', 'alt+p'],
  ['newWorkspace', 'more', 'New workspace', 'w', 'plain'],
  ['archive', 'more', 'Archive what is open', 'delete', 'plain'],
  ['sheet', 'more', 'Show every key', '?', 'plain'],
  ...[['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['cursor', 'Cursor'], ['copilot', 'Copilot'], ['grok', 'Grok']].flatMap(([a, name]) => [1, 2, 3, 4, 5].map((n) => [`model.${a}.${n}`, 'agents and terminals', `Model key ${n} in a ${name} chat`, `alt+${n}`])),
];
const UE_ONLY = 'Only while Unreal Engine 5 support is on.', ANYWHERE = 'It works from anywhere in a project.', IN_BOX = "It works in a chat's message box.", BP = 'On the cursor line of a C or C++ file.';
const NOTES: Record<string, string> = {
  modeEditor: 'Pressed again, it goes to the next layout.',
  modeOrch: 'Orchestration shows one chat at a time. Tab goes to the next chat.',
  modeTerm: 'Terminals shows every terminal at once.',
  newLayout: 'Its button goes in the first free spot of the rail.',
  newSetTerm: 'Its button goes in the first free spot of the rail.',
  closeSet: "It asks first. The first one can't close, so it's emptied instead.",
  projPrev: 'The same order as the project buttons in the bottom bar.',
  projNext: 'The same order as the project buttons in the bottom bar.',
  next: 'It opens in the next empty window.',
  benchKey: 'The terminal keeps running under Benched. In the editor, the key moves a chat tab to orchestration.',
  orchKey: "The chat keeps running in orchestration's list.",
  windowKey: 'With Shift, the one before. A chat that asks a question is picked first.',
  boxKey: 'Ctrl twice means pressing Ctrl two times quickly.',
  modeKey: `With Shift, the one before. ${IN_BOX}`,
  modelNextKey: IN_BOX,
  modelPrevKey: IN_BOX,
  micKey: `Pressed again, it stops and types what you said into the message box. ${IN_BOX}`,
  quoteKey: 'The text you select in a reply goes into your message.',
  clearKey: 'It asks first.',
  find: 'In a chat it searches the message box, and pressed again the whole chat. In Settings it finds a setting.',
  newAgentKey: 'It works like the New agent button in the dashboard. The agent picker opens at the pointer.',
  newChatN: 'Ctrl and 1 starts a Claude chat, 2 Codex, 3 Antigravity, 4 Cursor, 5 Copilot and 6 Grok. It works in orchestration and the editor.',
  scratch: ANYWHERE,
  sketch: ANYWHERE,
  inboxKey: 'The inbox window shows every file in the inbox.',
  newForget: ANYWHERE,
  quickAgent: "The project's Quick Agent opens in its own window.",
  quickPwsh: 'Only when PowerShell is installed.',
  ueBuild: `While it builds, the key opens the build window. ${UE_ONLY}`,
  ueWindow: UE_ONLY,
  ueNewClass: UE_ONLY,
  ueNewModule: UE_ONLY,
  ueNewPlugin: UE_ONLY,
  split: 'It opens a new group of tabs on the right.',
  headerSwitch: 'For C and C++ files, Foo.h opens Foo.cpp and Foo.cpp opens Foo.h.',
  tabN: 'In the tab group you are in.',
  files: 'By its name or a word in it.',
  openFile: 'It works from anywhere.',
  winEvery: 'Pressed again, the window goes back to following the project.',
  undo: 'It first takes you to the last thing you did, then undoes it.',
  redo: 'Ctrl+Y works too.',
  newWorkspace: 'It works on the workspaces screen.',
  debugGo: 'It starts Unreal Editor under the debugger, or attaches to it when it is open. While stopped, it runs on.',
  debugPause: 'It pauses the program where it is.',
  debugStop: 'The debugger lets go and the program keeps running.',
  debugOver: 'It runs this line and stops at the next one.',
  debugInto: 'It goes into the call on this line.',
  debugOut: 'It runs on to where this function returns.',
  debugRunTo: 'It runs the program until it reaches the cursor line.',
  debugGoto: 'It moves the arrow to the cursor line, within the function, without running the lines between.',
  debugBp: BP,
  debugBpOff: `${BP} The breakpoint stays where it is.`,
  debugBpCond: `${BP} The program stops there only when the condition holds.`,
};
export const noteOf = (id: string): string => NOTES[id] || (id.startsWith('model.') ? 'Each agent has its own five.' : '');
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
const WORD: Record<string, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', arrowleft: 'Left arrow', arrowright: 'Right arrow', arrowup: 'Up arrow', arrowdown: 'Down arrow', ' ': 'Space', escape: 'Esc', delete: 'Delete' };
const wordOf = (t: string) => WORD[t] || (t.length === 1 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1));
export const comboWords = (combo: string, id = ''): string => {
  if (!combo) return '';
  if (combo === TWICE) return 'Ctrl twice';
  const w = combo.split(/\+(?!$)/).map(wordOf).join('+');
  return BY.get(id)?.[4] === 'n' ? `${w}+1 to ${w}+${id === 'newChatN' ? 6 : 9}` : w;
};
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
