import { labelOf, noteOf } from '../base/binds.ts';
import { keyWords, labelFor } from '../base/keycap.ts';
import { page } from '../base/page.ts';
import { chatOn, pref } from '../base/prefs.ts';
import { esc, setSave } from '../base/util.ts';
import { PROG } from '../terminal/qterm.ts';
import { modelKeys, optFor, seenModels, setModelKey } from './composer.ts';
import { ESC_KEY, FIXED_KEYS, fixedKeys, keyButton, keyChanged, resetKey } from './keys.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { At, Choice, Row } from './setstd.ts';

type Opt = { value: string; name: string };

export const KEYS_LEAD = 'Click a key, then press the new one. Esc keeps the old key and Backspace clears it. Press ? anywhere to see every key.';

const AGENTS: [string, string][] = [['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['cursor', 'Cursor'], ['copilot', 'Copilot'], ['grok', 'Grok']];
const and = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || '');
const at = (key: string): At => ({ key, place: 'keys', on: () => true });
const NO_KEY = 'No key is set.';
const setTo = (ids: string[]) => {
  const w = ids.map(keyWords).filter(Boolean);
  return w.length ? `Set to ${and(w)}.` : NO_KEY;
};

function keyRow(ids: string | string[]): Row {
  const all = [ids].flat(), main = all.at(-1)!, id = `k:${all.join(',')}`;
  return {
    id, key: id, at: all.map(at), sw: 'none', plain: true, noPic: true,
    own: { label: labelFor(main) },
    state: () => setTo(all), note: () => noteOf(main),
    ctl: () => all.map(keyButton).join(''),
    reset: () => all.forEach(resetKey), changed: () => all.some(keyChanged),
  };
}
const FIXED_STATE = "Always this key. It can't be changed.";
const fixedRow = ([k, what, note]: [string, string, string]): Row => {
  const id = `kf:${k}`;
  return { id, key: id, at: [at(id)], sw: 'none', plain: true, noPic: true, noReset: true, own: { label: what }, state: () => FIXED_STATE, note: () => note, ctl: () => fixedKeys(k) };
};

const ueOn = () => !!pref('ue:on');
const debugOn = () => ueOn() && !!pref('debug:on');
const MODES = [['fn:editor', 'modeEditor'], ['fn:orch', 'modeOrch'], ['fn:term', 'modeTerm'], 'newLayout', 'newSetTerm', 'closeSet', 'projPrev', 'projNext'];
const DECK = ['next', 'cellNext', 'cellPrev', 'newCell', 'benchKey', 'orchKey', 'windowKey', 'boxKey', 'modeKey', 'modelNextKey', 'modelPrevKey', 'micKey', 'railKey', 'quoteKey', 'noteKey', 'clearKey', 'find', 'newAgentKey', 'newChatN'];
const WRITE = () => ['scratch', 'sketch', 'inboxKey', 'newForget', 'quickAgent', 'quickTerm', ...(PROG.pwsh ? ['quickPwsh'] : []), ...(ueOn() ? ['ueBuild', 'ueWindow', 'ueNewClass', 'ueNewModule', 'ueNewPlugin'] : [])];
const TABS = ['split', 'closeTab', 'headerSwitch', 'reopen', 'refreshBrowser', 'tabN', 'tabPrev', 'tabNext', 'grpPrev', 'grpNext'];
const MORE = ['up', 'files', 'commands', 'openFile', 'search', 'explorerKey', 'gitKey', 'pinsKey', 'bottomBarKey', 'dashKey', 'settings', 'newWindowKey', 'winEvery', 'undo', 'redo', 'archive', 'save', 'sheet', 'newWorkspace'];
const DEBUG = ['debugGo', 'debugPause', 'debugStop', 'debugOver', 'debugInto', 'debugOut', 'debugRunTo', 'debugGoto', 'debugColumn', 'debugBp', 'debugBpOff', 'debugBpCond'];

let mkAgent = 'claude';
const agentsOn = () => AGENTS.filter(([k]) => chatOn(k));
const agentNow = () => (chatOn(mkAgent) ? mkAgent : agentsOn()[0]?.[0] || 'claude');
const nameOf = (agent: string) => AGENTS.find(([k]) => k === agent)?.[1] || agent;
const agentRow = (): Row => ({
  id: 'k:agent', key: 'k:agent', at: [at('k:agent')], plain: true, noPic: true, noReset: true,
  own: { label: 'Agent' },
  pick: { get: agentNow, set: (v) => (mkAgent = v), def: 'claude', reset: '', choices: () => agentsOn().map(([k, n]): Choice => [k, n, `Showing ${n}'s five model keys.`]) },
  note: () => 'Each agent has its own five model keys.',
});
const nameIn = (list: Opt[], v: string) => (optFor(list, v) as Opt | undefined)?.name || v;
function modelState(agent: string, i: number) {
  const k = keyWords(`model.${agent}.${i + 1}`), m = modelKeys(agent)[i], seen = seenModels(agent);
  const model = m.model && nameIn(seen.model, m.model), effort = m.effort && nameIn(seen.effort, m.effort);
  if (!k) return NO_KEY;
  if (model && effort) return `${k} switches to ${model}, effort ${effort}.`;
  if (model) return `${k} switches to ${model} and leaves the effort as it is.`;
  if (effort) return `${k} sets the effort to ${effort} and leaves the model as it is.`;
  return `${k} leaves the model and effort as they are.`;
}
function modelSelect(agent: string, i: number, part: 'model' | 'effort', list: Opt[], cur: string) {
  const hit = optFor(list, cur) as Opt | undefined, val = hit?.value ?? cur;
  const opts = [{ value: '', name: '—' }, ...list, ...(cur && !hit ? [{ value: cur, name: cur }] : [])];
  const tip = `${part === 'model' ? 'Model' : 'Effort'} for ${labelOf(`model.${agent}.${i + 1}`)}\nA dash leaves the ${part} as it is.`;
  return `<select data-mk-agent="${agent}" data-mk-key="${i}" data-mk-part="${part}" style="width: 170px" title="${esc(tip)}" aria-label="${esc(part)}">${opts.map((o) => `<option value="${esc(o.value)}"${o.value === val ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
}
function modelRow(agent: string, i: number): Row {
  const id = `model.${agent}.${i + 1}`, rid = `k:${id}`;
  return {
    id: rid, key: rid, at: [at(id)], sw: 'none', plain: true, noPic: true, wide: true,
    own: { label: labelOf(id) },
    state: () => modelState(agent, i),
    note: () => (seenModels(agent).model.length ? noteOf(id) : `Amethyst doesn't know ${nameOf(agent)}'s models yet. Open a ${nameOf(agent)} chat once to list them.`),
    ctl: () => {
      const k = modelKeys(agent)[i], seen = seenModels(agent);
      return modelSelect(agent, i, 'model', seen.model, k.model) + modelSelect(agent, i, 'effort', seen.effort, k.effort) + keyButton(id);
    },
    reset: () => resetKey(id), changed: () => keyChanged(id),
  };
}
const modelRows = (agent: string) => [0, 1, 2, 3, 4].map((i) => modelRow(agent, i));

type Box = { id: string; title: string; caption: string; rows: () => Row[] };
const BOXES: Box[] = [
  { id: 'kmodes', title: 'Modes', caption: 'Keys that switch between the editor, orchestration and terminals, and between projects. They work anywhere in Window 1.', rows: () => MODES.map(keyRow) },
  { id: 'kdeck', title: 'Agents and terminals', caption: 'Keys for chats and terminals in orchestration, agents, terminals and the editor.', rows: () => DECK.map(keyRow) },
  { id: 'kmodels', title: 'Model keys', caption: "Alt 1 to 5 set the model and effort of the chat you're in. Each agent has its own five.", rows: () => agentsOn().flatMap(([a]) => modelRows(a)) },
  { id: 'kwrite', title: 'Write and quick', caption: 'Keys that open the scratch pad, the sketch board, the inbox and the quick windows from anywhere in a project.', rows: () => WRITE().map(keyRow) },
  { id: 'ktabs', title: 'Tabs', caption: 'Keys for the tabs and tab groups in the editor.', rows: () => TABS.map(keyRow) },
  { id: 'kfixed', title: 'In the explorer, the agents list and the tab bars', caption: "Keys that work while the explorer, the agents list or a tab bar has the focus. They can't be changed.", rows: () => FIXED_KEYS.map(fixedRow) },
  { id: 'kmore', title: 'More', caption: 'Keys that work anywhere in the app.', rows: () => [...MORE.map(keyRow), fixedRow(ESC_KEY)] },
  { id: 'kdebug', title: 'Debug', caption: 'Keys for the debugger in Unreal projects. They show while Unreal Engine 5 support and the debugger are on.', rows: () => (debugOn() ? DEBUG.map(keyRow) : []) },
];

addPart({ rows: () => [agentRow(), ...BOXES.flatMap((b) => b.rows())], sel: () => '', look: () => '', example: () => '', home: 'keys' });

const html = (list: Row[]) => list.map(rowHtml).join('');
export function keysHtml(all: boolean) {
  return BOXES.map((b) => {
    if (b.id !== 'kmodels') return b.rows().length ? box(b.id, b.title, html(b.rows()), b.caption) : '';
    const on = agentsOn();
    if (!on.length) return '';
    const rows = all ? on.flatMap(([a]) => modelRows(a)) : [...(on.length > 1 ? [agentRow()] : []), ...modelRows(agentNow())];
    return box(b.id, b.title, html(rows), b.caption);
  }).join('');
}

export function keysInit(root: HTMLElement) {
  root.addEventListener('change', (e: Event) => {
    const mk = (e.target as Element).closest<HTMLSelectElement>('[data-mk-key]');
    if (!mk) return;
    const i = +mk.dataset.mkKey!, agent = mk.dataset.mkAgent!;
    setModelKey(agent, i, mk.dataset.mkPart!, mk.value);
    setSave(modelState(agent, i));
    page.renderSettings();
  });
}
