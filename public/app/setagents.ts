import { ask, ICONS, MARK_NOS, markName } from '../base/controls.ts';
import { setToolsNow } from '../base/drive.ts';
import type { Tools } from '../base/drive.ts';
import { repairLine, setShare } from '../base/accounts.ts';
import { gem } from '../base/kinds.ts';
import { api } from '../base/model.ts';
import { page } from '../base/page.ts';
import { chatOn, isChanged, isOff, keyed, pref, PREFS, setOff, setPref } from '../base/prefs.ts';
import { CHATS, setSave, showErr } from '../base/util.ts';
import { writerLine, writerRowClick, writerRowHtml } from '../base/writer.ts';
import { marksRowHtml } from './setchat.ts';
import { pinClick, pinHtml, pinInit } from './setpin.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { At, Choice, Item, Row } from './setstd.ts';

export const AGENTS_LEAD = 'Which agents you use, what a click on + opens, the writing helper, how working and finished chats show, Claude\'s cache, marks, worktrees, Claude accounts and what chats may do with Amethyst\'s tools.';

type Arch = { worktrees?: string; worktreesDefault?: string; tools?: Tools };
type Acc = { id: string; email?: string; where?: string; share?: 'main' | 'all' | 'own'; fixed?: string[]; kept?: string[]; waits?: string[] };

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
const redraw = () => page.renderSettings();
const and = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || '');
const at = (key: string, o: Partial<At> = {}): At => ({ key, place: 'ag', ...o });
const shown = (key: string) => {
  const e = PREFS[key];
  return (!!DESKTOP || !e.desktop) && (!e.when || e.when());
};
const short = (label: string) => label.replace(/ Agent$/, '');

const sw = (key: string, old: string, o: Partial<Row> = {}): Row => {
  const e = PREFS[key], on = () => keyed(e.on || ''), off = () => keyed(e.off || '');
  return {
    id: key, key, sw: 'onoff', plain: true, noPic: true, at: [at(key)],
    own: { label: e.label, desc: e.desc, find: `${old} ${e.on} ${e.off}` },
    state: () => (pref(key) ? on() : off()), alt: () => (pref(key) ? off() : on()), ...o,
  };
};
const pk = (key: string, old: string): Row => {
  const e = PREFS[key], cs = () => e.choices as Choice[];
  return {
    id: key, key, plain: true, noPic: true, at: [at(key)],
    own: { label: e.label, desc: e.desc, find: `${old} ${cs().flatMap(([, l, t]) => [l, t]).join(' ')}` },
    pick: { get: () => pref(key), set: (v) => setPref(key, v), def: e.def, choices: cs, reset: `p:${key}` },
  };
};

const agentsOn = () => CHATS.filter(([k]) => !isOff('agents:off', k));
const agentsRow = (): Row => ({
  id: 'ag:agents', key: 'agents:off', sw: 'none', plain: true, noPic: true, at: [at('agents:off')],
  own: { label: PREFS['agents:off'].label, desc: PREFS['agents:off'].desc, find: 'agents in use' },
  state: () => {
    const on = agentsOn().map(([, l]) => short(l)), off = CHATS.filter(([k]) => isOff('agents:off', k)).map(([, l]) => short(l));
    return `${and(on)} can start new chats.${off.length ? ` ${and(off)} can't. Their chats stay.` : ''}`;
  },
  list: () => {
    const last = agentsOn().length === 1;
    return CHATS.map(([k, l]): Item => {
      const on = !isOff('agents:off', k);
      return { id: k, name: short(l), look: gem('ai'), on, set: (v) => setOff('agents:off', k, !v), lock: on && last ? 'At least one agent stays on. Turn another one on first.' : '' };
    });
  },
  changed: () => isChanged('agents:off'),
});

const ringsRows = (): Row[] => (shown('agent:pinRings') ? [sw('agent:pinRings', 'Pin rings in the agent lists')] : []);

const writerRow = (): Row => ({
  id: 'ag:writer', key: 'writer:use', sw: 'none', plain: true, noPic: true, at: [at('writer:use')],
  own: { label: 'Who writes commit messages and pull request descriptions', desc: 'It writes when you click ✦. Pick the agent first, then its model.', find: 'Writing helper' },
  state: writerLine, ctl: writerRowHtml, changed: () => isChanged('writer:use'),
});

const workRows = (): Row[] => [pk('work:mark', 'Something working shows'), sw('work:moves', 'Working mark moves'), pk('tab:done', 'a tab whose agent finished')];
const cacheRows = (): Row[] => [...(shown('cache:notice') ? [sw('cache:notice', "Notice before a chat's cache runs out")] : []), sw('cache:color', "Color a chat's time as its cache runs out")];
const noticeRows = (): Row[] => (shown('notice:screen') ? [pk('notice:screen', 'chat notifications show on')] : []);
const moveRows = (): Row[] => [
  pk('chat:beside', 'ctrl click on an earlier chat'),
  sw('scratch:chatGo', 'follow the chat you send scratch text to'),
  sw('deck:moveGo', 'follow a chat you move with »'),
  ...(shown('deck:setAms') ? [sw('deck:setAms', 'other Amethysts in the » menu')] : []),
];
const subRows = (): Row[] => [sw('subagents:on', 'Advanced subagents mode')];
const clearRows = (): Row[] => [sw('clear:ask', 'Ask before clearing a chat'), sw('rewind:files', 'restore points for going back')];
const longRows = (): Row[] => [sw('chat:recent', 'draw only the recent part of long chats')];

const markLook = (n: number) => `<i class="mk-d m${n}">${ICONS['mark' + n]}</i>`;
function setMark(n: number, v: string) {
  const names = [...pref('marks:names')];
  names[n - 1] = v.trim().slice(0, 40);
  for (let i = 0; i < names.length; i++) names[i] ??= '';
  setPref('marks:names', names);
}
const marksRow = (): Row => ({
  id: 'ag:marks', key: 'marks:names', sw: 'none', plain: true, noPic: true, at: [at('marks:names')],
  own: { label: 'Mark names', desc: 'What each mark means to you, on chats, files and folders.', find: 'marks' },
  state: () => `Your marks are called ${and(MARK_NOS.map(markName))}.`,
  list: () => MARK_NOS.map((n): Item => ({ id: String(n), name: `Mark ${n}`, look: markLook(n), field: { get: () => pref('marks:names')[n - 1] ?? '', set: (v) => setMark(n, v), label: `Name of mark ${n}`, ph: `mark ${n}` } })),
  changed: () => isChanged('marks:names'),
});

let arch: Arch | null = null, archAsked = false;
function archNow(): Arch {
  if (!archAsked) {
    archAsked = true;
    api('GET', '/api/settings').then((r: Arch) => ((arch = r), redraw()), showErr);
  }
  return arch || {};
}
async function putArch(body: Record<string, unknown>, said: () => string) {
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', body)) };
    setSave(said());
  } catch (e) {
    showErr(e);
  }
  redraw();
}
const setWorktrees = (to: string) => putArch({ worktrees: to }, () => `Worktrees folder: ${arch!.worktrees}`);
async function changeWorktrees() {
  const now = archNow().worktrees || '';
  const to = DESKTOP
    ? await DESKTOP.pickFolder({ title: 'the worktrees folder', defaultPath: now })
    : await ask({ title: 'Worktrees folder', text: "Where new chats' worktrees go: a folder outside your projects. The ones made already stay where they are.", label: 'folder', value: now });
  if (to && to.trim() && to.trim() !== now) await setWorktrees(to.trim());
}
const worktreesRow = (): Row => ({
  id: 'ag:wt', key: 'ag:wt', sw: 'none', plain: true, noPic: true, at: [at('ag:wt', { on: () => true })],
  own: { label: 'Worktrees folder', desc: 'It must be outside every project. The worktrees made already stay where they are. On your projects\' drive, paths are shorter and the system drive stays free.', find: 'worktrees folder' },
  state: () => (archNow().worktrees ? `New chats' worktrees go in ${archNow().worktrees}.` : 'Looking for the worktrees folder.'),
  value: () => archNow().worktrees || '',
  btn: { label: 'Change…', tip: 'Change\nAnother folder for new worktrees. The ones already made stay where they are.', run: () => void changeWorktrees() },
  reset: () => void setWorktrees(''), changed: () => !!arch?.worktrees && arch.worktrees !== arch.worktreesDefault,
});

const TOOL_DEF: Tools = { chats: true, asks: false, path: true, debug: true };
const TOOLS: [keyof Tools, string, string, string, string, string][] = [
  ['chats', 'Chats can drive other chats', 'chats can drive other chats', "A chat you ask can send work to this project's other chats, wait for them, read their answers and set their model.", "Only you start and drive chats, in Amethyst's own window. @ lists only files.", "Agents outside Amethyst and terminals follow the same switch. An agent's own built-in subagents work either way."],
  ['asks', "Chats can answer other chats' permission asks", "chats answer other chats' permission asks", "Other chats, agents outside Amethyst and terminals can allow a chat's asks for you.", 'Only you answer when a chat asks to run a command or edit a file.', "This is a big change: with it on, other chats can let a chat run commands without you. Adding a project, building, debugging and a repo's hooks still ask you first."],
  ['path', 'The amethyst command in terminals', 'the amethyst command in terminals', 'New terminals can run the amethyst command.', "New terminals don't know the amethyst command.", 'Agents outside Amethyst connect with amethyst mcp add.'],
  ['debug', 'Chats can control the debugger', 'agents can control the debugger', 'A chat you ask can start, step and pause the debugger, set breakpoints and change values. You see each step in the debug column.', 'Chats can only read where it stopped, the stack and the variables.', 'Agents outside Amethyst and terminals follow the same switch. Ending Unreal Editor needs them to say so outright.'],
];
const toolNow = (k: keyof Tools) => (archNow().tools || TOOL_DEF)[k];
const setTool = (k: keyof Tools, v: boolean, label: string) => putArch({ tools: { [k]: v } }, () => (setToolsNow(arch!.tools!), `${label}: ${arch!.tools![k] ? 'on' : 'off'}`));
const toolRows = (): Row[] => TOOLS.map(([k, label, old, on, off, desc]) => ({
  id: `ag:tool:${k}`, key: `ag:tool:${k}`, sw: 'onoff', plain: true, noPic: true,
  at: [at(`ag:tool:${k}`, { on: () => toolNow(k), set: (v) => void setTool(k, v, label), def: TOOL_DEF[k] })],
  own: { label, desc, find: `${old} ${on} ${off}` },
  state: () => (toolNow(k) ? on : off), alt: () => (toolNow(k) ? off : on),
  reset: () => void setTool(k, TOOL_DEF[k], label), changed: () => toolNow(k) !== TOOL_DEF[k],
}));

const SHARE: Choice[] = [
  ['all', 'Shared with main', "This account uses the main account's CLAUDE.md, settings, rules, skills, plugins and memory."],
  ['own', 'Its own', 'This account has its own copies of CLAUDE.md, settings, rules, skills, plugins and memory.'],
];
let accs: Acc[] | null = null, accsAsked = false;
function accsNow() {
  if (!accsAsked) {
    accsAsked = true;
    api('GET', '/api/agent/accounts/setup').then((r) => ((accs = r.accounts), redraw()), () => ((accs = []), redraw()));
  }
  return accs || [];
}
const added = () => accsNow().filter((a) => a.share && a.share !== 'main');
const whoOf = (a: Acc) => (a.id === 'default' ? 'Main account' : a.email ? a.email.split('@')[0] : a.id);
function accState() {
  const own = added().filter((a) => a.share === 'own').map(whoOf), all = added().filter((a) => a.share !== 'own').map(whoOf);
  if (!added().length) return 'Only the main account is set up.';
  return [all.length ? `${and(all)} ${all.length > 1 ? 'use' : 'uses'} the main account's CLAUDE.md, settings, rules, skills, plugins and memory.` : '', own.length ? `${and(own)} ${own.length > 1 ? 'have their' : 'has its'} own copies.` : ''].filter(Boolean).join(' ');
}
const accRows = (): Row[] => (accsNow().length && chatOn('claude') ? [{
  id: 'ag:accounts', key: 'ag:accounts', sw: 'none', plain: true, noPic: true, noReset: true, at: [at('ag:accounts', { on: () => true })],
  own: { label: 'What each Claude account shares with the main one', desc: 'Chat history is shared either way, so chats move between accounts.', find: 'claude accounts shared with main its own' },
  state: accState,
  list: () => accsNow().map((a): Item => {
    const fix = repairLine({ ...a, repair: a.share === 'main' ? null : { fixed: a.fixed || [], kept: a.kept || [], waits: a.waits || [] } });
    const sub = [a.where || '', fix ? `${fix[0].toUpperCase()}${fix.slice(1)}.` : ''].filter(Boolean).join(' ');
    return {
      id: a.id, name: whoOf(a), sub,
      ...(a.share && a.share !== 'main' ? { pick: { get: () => a.share as string, set: (v: string) => void (a.share !== v && setShare(a.id, v).then(() => ((accsAsked = false), redraw()), showErr)), choices: () => SHARE } } : {}),
    };
  }),
}] : []);

const parts = [agentsRow, ringsRows, writerRow, workRows, cacheRows, noticeRows, moveRows, subRows, clearRows, longRows, marksRow, worktreesRow, accRows, toolRows];
addPart({ rows: () => parts.flatMap((f) => f()), sel: () => '', look: () => '', example: () => '', home: 'agents' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
const boxOf = (id: string, title: string, list: Row[], sub: string, pre = '', post = '') => (list.length || pre ? box(id, title, pre + rows(list) + post, sub) : '');
export function agentsHtml() {
  return boxOf('ag-use', 'Agents you use', [agentsRow()], 'The agents in every + list, new chat tile and picker. You open them from any + in the app.') +
    boxOf('ag-new', 'New chat (+)', ringsRows(), 'The + buttons that start a chat: the new agent button in the dashboard and in the chat list, + new in Agents, + chat in the scratch pad, Add to chat and the Quick Agent.', pinHtml()) +
    boxOf('ag-writer', 'Writing helper (✦)', [writerRow()], "The ✦ button in source control's commit box and in a new pull request.") +
    boxOf('ag-work', 'Working and finished', workRows(), "How a chat shows it is working or done: on chat tabs, agent rows, list headers, the chat's Working line, project tabs and the mode buttons' corner.") +
    boxOf('ag-cache', "Claude's cache", cacheRows(), "A Claude chat keeps its cache for an hour after its last turn. The time at the right of a chat's row in the chat lists counts it.") +
    boxOf('ag-notice', 'Notifications', noticeRows(), 'The notification a chat sends while its Amethyst is minimized. Only in the desktop app.') +
    boxOf('ag-move', 'Opening and moving chats', moveRows(), 'Ctrl click in the list of earlier chats, sending scratch text with + chat, and the » Move menu on a chat.') +
    boxOf('ag-subs', 'Subagents', subRows(), "The helpers a chat starts for part of its work. Agent activity in the chat's header shows them.") +
    boxOf('ag-clear', 'Clearing and going back', clearRows(), "Clear in a chat's header and menu, and edit on one of your messages to go back to it.") +
    boxOf('ag-long', 'Long chats', longRows(), 'Any chat with many messages, wherever it is open.') +
    boxOf('ag-marks', 'Marks', [marksRow()], "The colored signs you give a chat, a file or a folder to tell it apart. You set one from a chat's mark button or a right-click.", '', marksRowHtml()) +
    boxOf('ag-wt', 'Worktrees', [worktreesRow()], "A chat's own copy of the project, made when you start a chat in its own worktree.") +
    boxOf('ag-acc', 'Claude accounts', accRows(), 'The Claude accounts you added, each with its own sign-in folder. The usage window shows the same setup.') +
    boxOf('ag-tools', 'Amethyst tools', toolRows(), "What chats, agents outside Amethyst and terminals may do with the amethyst command and the MCP server.");
}

export const agentsClick = (t: Element): boolean => pinClick(t) || writerRowClick(t);
export const agentsInit = (root: HTMLElement) => pinInit(root);
