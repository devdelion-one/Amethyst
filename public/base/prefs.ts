import { bound, show } from './binds.ts';
import { page } from './page.ts';
import type { Page } from './page.ts';
import { CHATS, store } from './util.ts';


export interface Pref {
  def: any;
  box?: string;
  part?: string;
  menu?: string | string[];
  group?: 'own' | 'part';
  item?: string;
  label?: any;
  on?: string;
  off?: string;
  all?: string;
  allTip?: string;
  redraw?: keyof Page;
  quiet?: boolean;
  fixed?: boolean;
  local?: boolean;
  desktop?: boolean;
  under?: string;
  when?: () => boolean;
  items?: [string, string][];
  tips?: Record<string, string>;
  parts?: Record<string, string>;
  list?: (from: Element | null) => [string, string][];
  icon?: (id: string, from: Element | null) => string;
  choices?: unknown[][];
  picks?: [string, string, string][];
  picked?: (id: string, on: boolean) => unknown;
  pill?: (label: string, off: boolean) => string;
  tip?: string;
  card?: string;
  name?: string;
  desc?: string;
  adv?: boolean;
  places?: string[];
  each?: Record<string, Words>;
  offWhen?: [string, string];
  blocked?: [string, string];
}
export type Words = { label: string; on: string; off: string; fixed?: string; offWhen?: [string, string]; blocked?: [string, string] };
export const keyed = (s: string): string => s.replace(/\{(\w+):([^}]*)\}/g, (_m: string, id: string, t: string) => {
  const k = show(bound(id));
  if (!k) return '';
  const out = t.replace('%', k);
  return /^\s*%/.test(t) ? out.replace(/^(\s*)(\S)/, (_x: string, sp: string, c: string) => sp + c.toUpperCase()) : out;
});

const chipName = (n: string): string => (n === 'Ultracode' ? n : n.toLowerCase());
const chipsOf = (from: Element | null): HTMLElement[] => [...((from?.closest('.ch-row') || document.querySelector('.ch-row'))?.querySelectorAll<HTMLElement>('.ch-opts [data-pick]') || [])];

const LISTS: Record<string, { p: string; menu: string; subs: string }> = {
  orch: { p: 'orch:', menu: 'orch', subs: 'subagents:list' },
};
export const listKey = (list: string, k: string) => (k === 'subs' ? LISTS[list].subs : LISTS[list].p + k);
function listPrefs(list: string): Record<string, Pref> {
  const { menu } = LISTS[list], k = (x: string) => listKey(list, x), at = { box: 'show', part: 'list', redraw: 'render' as const };
  return {
    [k('folders')]: { ...at, def: true, quiet: true, menu: [menu], label: 'Your folders', on: 'Your folders show in the list, with the chats you put in them.', off: 'No folders. Every chat shows under Live or All. Your folders are kept, and come back as they were.', desc: "A folder holds the chats you put in it, and folds shut. You make one with new folder in the list's right-click menu, and drag chats into it." },
    [k('newBtn')]: { ...at, def: true, quiet: true, menu: [menu], label: 'New agent button at the top of the list', on: 'The button sits at the top of the list, where the first count was.', off: "The top of the list shows its count. The dashboard's new agent button still starts a chat.", desc: 'It starts a new chat with an agent, like the new agent button in the dashboard.' },
    [k('look')]: { ...at, def: 'detailed', label: 'Look of the list', desc: "How much each chat shows in the list. The list's right-click menu has the same two picks.", choices: [
      ['calm', 'Calm', 'One line per chat: its state, its title, small subagent bars and your mark.'],
      ['detailed', 'Detailed', 'Each chat is a card with a top meta row, full-width title, fixed icon columns and a subagent tray underneath.'],
    ] },
    [k('sort')]: { ...at, def: 'mine', label: 'Order of the chats', desc: 'Chats at work or waiting for you stay on top under Live either way. The order is for the chats under All and Benched.', choices: [
      ['mine', 'My order', 'You drag a chat up or down to place it. A new chat goes to the top.'],
      ['latest', 'Latest activity', 'The chat that changed last is at the top.'],
    ] },
    [k('code')]: { ...at, def: false, menu: [menu], label: "Chat's code before each title", on: "Each card shows the chat's code, like K42.", off: "No code in the list. The chat's header still shows it.", desc: 'The short code that names a chat. Ctrl p finds a chat by it.' },
    [k('tools')]: { ...at, def: true, menu: [menu], label: 'Which tool runs it, before each title', on: 'Each card shows a small sign of the tool that runs the chat.', off: "No tool sign in the list. The chat's header still shows its model.", desc: 'The sign tells Claude, Codex, Antigravity, Cursor, Copilot and Grok chats apart. Point at it to read the model.' },
    [k('wt')]: { ...at, def: true, menu: [menu], label: 'Worktree or branch on each card', on: 'Each card shows its worktree branch, or main when it works in the main folder.', off: 'No worktree or main label in the list.', desc: 'Tells chats working in their own git worktree apart from chats on main.' },
    [k('answer')]: { ...at, def: false, menu: [menu], label: 'Answer a waiting chat in the list', on: "A waiting chat's question and its answers open in its card in the list.", off: "A waiting chat pulses in its status column and opens when clicked.", desc: 'When a chat needs you, you pick an answer right in the list and send it, without opening the chat. Open chat still takes you there.' },
  };
}
const listSubs = (list: string): Record<string, Pref> => ({ [listKey(list, 'subs')]: { def: true, box: 'show', part: 'list', label: 'Subagents under each chat', on: "Detailed cards list running subagents and a finished summary in a tray underneath. Calm rows show a small bar for each.", off: "No subagents in the list. Agent activity in the chat's header still shows them.", desc: 'Subagents are helpers a chat starts for part of its work. Click one to open them all in Agent activity. They need Subagents get their own window and list rows, in Agents and chat, Providers and tools.', redraw: 'render' } });
const CHIP_WORDS: Record<string, Words> = {
  model: { label: 'Model', on: 'The model is shown. Click it to pick another.', off: "The model is hidden in the chat box. The chat's header still shows it, and the model keys still change it.", offWhen: ['deck:model', 'The model is hidden in the chat box, and in the header too. The model keys still change it.'] },
  effort: { label: 'Effort', on: 'The effort is shown. Click a mark to set it.', off: "The effort is hidden in the chat box. The chat's header still shows it, and the chat keeps the effort it has.", offWhen: ['deck:model', 'The effort is hidden in the chat box, and in the header too. The chat keeps the effort it has.'] },
  fast: { label: 'Fast mode switch', on: 'The switch is shown.', off: 'The switch is hidden. Each chat keeps the setting it had.' },
  ultracode: { label: 'Ultracode switch', on: 'The switch is shown.', off: 'The switch is hidden. Hiding it does not turn Ultracode off: a chat that has it on keeps it, and its box stays red.' },
};

const STARTS_ON = ['claude', 'codex', 'antigravity', 'cursor', 'copilot'];
const PILLS: [string, string][] =[['history', 'earlier chats'], ['signin', 'sign-in'], ['clear', 'clear'], ['swap', 'continue with']];
const PILL_HEAD = "A button in every chat's header.";
const PILL_MENU = "A row in the chat's ⋯ menu.";
export const PREFS: Record<string, Pref> = {
  'agents:off': { desc: 'Turning an agent off removes it from every + list, tile and picker. Its chats stay. At least one agent stays on.', def: CHATS.map(([k]) => k).filter((k) => !STARTS_ON.includes(k)), box: 'agents', items: CHATS.map(([k, label]) => [k, label] as [string, string]), label: 'Agents you can start', on: 'It can start new chats.', off: "This agent can't start new chats. Its chats stay.", pill: (l, off) => (off ? `${l}: off\nNo new ${l.replace(/ Agent$/, '')} chats in any menu, tile or picker. The chats you have stay. Click to bring it back.` : `${l}: in use\n${l.replace(/ Agent$/, '')} shows in every new agent menu, tile and picker. Click to hide it from all of them.`), redraw: 'render' },
  'writer:use': { def: { agent: 'claude', models: {} }, quiet: true, label: 'Writing helper' },
  'agent:pin': { def: { same: true, all: '', at: {} }, quiet: true },
  'clear:ask': { def: true, box: 'agents', label: 'Ask before clearing a chat', on: 'Clearing a chat, by its key, the clear button or its menu, asks first.', off: 'Clearing a chat happens at once. Ctrl z brings it back.', desc: "Clearing empties the chat and starts it over. The question has a don't ask again tick, and this switch turns asking back on. Typing /clear never asks." },
  'agent:pinRings': { def: true, box: 'agents', label: 'Pin rings in the + lists', on: 'Each agent in a + list has a ring on its right. Click it to pin that agent.', off: 'The + lists have no rings. You pin an agent in the row above.', desc: 'The ring shows in the list a + opens when you click or right-click it.', when: () => chatsOn().length > 1 },
  'work:mark': { desc: "It shows on chat tabs, agent rows, list headers, the chat's Working line, project tabs and the mode buttons' corner.", def: 'star', box: 'agents', label: 'Working mark', choices: [
    ['star', 'Sparkle', 'The sparkle is used. The AI sparkle turns and breathes.'],
    ['ring', 'Ring', 'The ring is used. A small star sits inside a spinning arc.'],
    ['orbit', 'Orbit', 'The orbit is used. A small star has dots circling it.'],
    ['arc', 'Turning arc', 'The turning arc is used. An arc turns at one speed.'],
    ['squares', 'Two squares', 'Two squares are used. They shine in turn.'],
    ['bars', 'Three bars', 'Three bars are used. They rise and fall in turn.'],
    ['dot', 'Circling dot', 'The circling dot is used. A dot runs round a faint ring.'],
    ['square', 'Turning square', 'The turning square is used. One square turns at one speed.'],
  ] },
  'effort:look': { desc: 'Click a mark in the chat box to set that effort.', def: 'bars', box: 'show', part: 'chat', label: 'Effort marks in the chat box', choices: [
    ['bars', 'Bars', 'Bars are used. They rise in height, like a phone signal.'],
    ['crystals', 'Crystals', 'Crystals are used. They rise in height.'],
  ] },
  'work:moves': { def: true, box: 'agents', label: 'Working mark moves', on: 'The mark moves while something works.', off: 'The mark stands still.', desc: 'It goes for the mark you pick above, in every place it shows.' },
  'cache:notice': { def: true, box: 'agents', desktop: true, label: "Notice before a chat's cache runs out", on: "A notice comes 15 minutes before a Claude chat's cache runs out. A chat's menu can stop it for that chat.", off: "No notice comes before a Claude chat's cache runs out.", desc: 'The first message after the cache is gone costs more, because the whole chat is sent again. Only in the desktop app.' },
  'cache:color': { def: true, box: 'agents', label: "Color a chat's time as its cache runs out", on: "A waiting Claude chat's time in the lists turns yellow at 45 minutes and red from an hour, when its cache is gone.", off: 'The time stays grey.', desc: "The time is at the right of a chat's row, in the chat lists." },
  'notice:screen': { desc: 'It only counts while that Amethyst is minimized.', def: 'own', box: 'agents', desktop: true, label: 'Monitor for chat notifications', choices: [
    ['own', "Its Amethyst's monitor", "A chat's notification shows at the bottom right of the monitor its Amethyst is on."],
    ['main', 'The main monitor', "Every chat's notification shows on Windows' main monitor."],
  ] },
  'tab:done': { desc: "It stays until you click the tab or the chat. The tab's right-click menu changes the same setting.", def: 'tint', box: 'agents', label: "Finished chat's tab", choices: [
    ['tint', 'Whole tab', 'The whole tab turns green when its chat finishes, and red while it asks you something.'],
    ['icon', 'Only its icon', "Only the tab's icon turns green or red. The tab keeps its colour."],
  ] },
  'newfile:to': { card: 'files', desc: 'The tick in the folder picker sets this too.', def: '', box: 'files', label: 'Where a new file goes when no folder is picked', choices: [
    ['', 'Ask each time', 'Amethyst asks each time, with a small folder picker.'],
    ['inbox', 'The inbox', 'New files go into the inbox.'],
    ['project', 'The project folder', 'New files go into the project folder.'],
  ] },
  'chat:beside': { def: '', box: 'agents', label: 'Ctrl click on an earlier chat', choices: [
    ['', 'Ask', 'It asks where, the next time, and keeps your answer.'],
    ['tab', 'Tab', 'It opens as a tab in the selected group.'],
    ['group', 'New group', 'It opens in a new group on the right.'],
  ] },
  'subagents:on': { desc: 'Subagents are helpers a chat starts for part of its work.', def: true, box: 'agents', label: 'Subagents get their own window and list rows', on: "Agent activity opens a chat's subagents in a window of its own, and the lists show them under each chat.", off: "A chat's subagents show only as lanes in the chat. A click folds one open.", redraw: 'render' },
  'subagents:chat': { item: 'agent activity', desc: "Shows how many subagents the chat runs; it opens them and the chat's commands in a window of its own. It shows only while the chat has some.", def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Agent activity button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", redraw: 'render' },
  ...listSubs('orch'),
  'scratch:chatGo': { def: false, box: 'agents', label: 'Go to the chat you send scratch text to', on: 'You go to the chat.', off: 'The chat gets the text and you stay in the scratch pad.', desc: 'Ctrl click on a row in the + chat menu does the other one, once. The arrow in that menu flips this setting too.' },
  'deck:moveGo': { def: true, box: 'agents', label: 'Go with a chat you move', on: 'You go with the chat, to its layout or to the Amethyst it went to.', off: 'The chat moves and you stay where you are.', desc: 'Ctrl click on a row in the Move menu does the other one, once. The arrow in that menu flips this setting too.', redraw: 'render' },
  'deck:setAms': { def: false, box: 'agents', label: 'Other Amethysts in the Move menu', on: 'Every Amethyst is a row in the Move menu that unfolds to its places.', off: "The Move menu lists only this Amethyst's places.", desc: 'It shows only while more than one Amethyst is open.', when: () => !!window.amethyst?.amethysts, redraw: 'render' },
  'subagents:open': { def: 'here', quiet: true, redraw: 'render' },
  'orch:order': { def: ['files', 'chat', 'list'], quiet: true, redraw: 'render' },
  'orch:term': { group: 'part', def: false, quiet: true, menu: ['orch', 'ochead'], item: 'terminal under the chat', desc: 'Shows a terminal under the chat in Orchestration.', label: 'terminal under the chat in Orchestration', off: "no terminal; the terminal button on the chat's bar shows it again", redraw: 'render' },
  'orch:termBtn': { item: 'terminal', def: true, quiet: true, menu: ['orch', 'ochead'], label: 'Terminal button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", desc: 'Shows the button that opens a terminal under the chat, in the project folder. Hiding the terminal leaves it running.', redraw: 'render' },
  'orch:termX': { def: true, quiet: true, menu: ['orch', 'ochead'], item: 'terminal close', desc: 'Shows × on the terminal under the chat, which closes it. The terminal button hides it either way.', label: 'close × on the terminal under the chat in Orchestration', off: "no ×; the terminal button on the chat's bar hides it", redraw: 'render' },
  'orch:folderBtn': { item: 'move to folder', def: true, quiet: true, menu: ['orch', 'ochead'], label: 'Move to folder button', on: 'The button is shown.', off: "Move to folder is in the chat's ⋯ menu instead.", desc: "Shows the button that opens the list of your folders: pick one and the chat moves into it in Orchestration's list. It keeps running.", redraw: 'render' },
  'orch:closeBtn': { item: 'close', desc: "Shows the button that closes the chat. Close is in the header's right-click menu either way.", def: true, quiet: true, menu: ['orch', 'ochead'], label: 'Close button', on: 'The button is shown.', off: "Close is in the chat's ⋯ menu and in the header's right-click menu instead.", redraw: 'render' },
  ...listPrefs('orch'),
  'list:eyeOrder': { def: ['tool', 'code', 'wt'], quiet: true, redraw: 'render' },
  'orch:files': { group: 'part', desc: 'Shows your files beside or under the chat in Orchestration, split and in tabs like the Editor.', def: true, box: 'show', part: 'orch', menu: ['orch', 'ochead', 'tbar'], item: 'files', label: 'Files in Orchestration', on: 'The files are shown beside or under the chat.', off: 'The files are hidden. A file you open from the chat shows them again.', redraw: 'render' },
  'orch:under': { group: 'part', desc: 'A narrow window, or one taller than wide, puts them under the chat either way.', def: false, box: 'show', part: 'orch', menu: ['orch', 'ochead', 'tbar'], when: () => pref('orch:files'), item: 'files under the chat', label: 'Files under the chat', on: 'The files are under the chat.', off: 'The files are beside the chat.', redraw: 'render' },
  'orch:list': { group: 'part', desc: "Shows the list of this project's chats in Orchestration. Click a chat in it to open it.", def: true, box: 'show', part: 'orch', menu: ['orch', 'ochead', 'tbar'], item: 'list of chats', label: 'Chat list in Orchestration', on: 'The list of chats is shown.', off: "The list of chats is hidden. Right-click the chat's header or the files' tab bar to show it again.", redraw: 'render' },
  'chat:recent': { def: true, box: 'agents', label: 'Open long chats at the end', on: 'A long chat opens with its last part. Older messages come back as you scroll up.', off: 'A long chat opens whole, so it opens slowly.' },
  'rewind:files': { def: true, box: 'agents', label: 'Bring files back when you go back in a chat', on: 'Edit on a message can put your files back as they were then.', off: 'Going back brings back only the chat. No restore points are made.', desc: 'Amethyst keeps a restore point of the files at each message you send.' },
  'rail:hideBtn': { def: true, box: 'show', part: 'list', label: 'Hide the list button', on: 'The button sits at the top right of the terminals list.', off: "No button. Alt h, or dragging the list's edge all the way right, still hides the list.", desc: 'It hides the terminals list, so your terminals get its room.' },
  'rail:showBtn': { def: true, box: 'show', part: 'list', label: 'Show the list button, while the list is hidden', on: 'While the terminals list is hidden, a small button on the edge brings it back.', off: 'While the terminals list is hidden, only a thin line marks the edge. Click it, drag it left, or press alt h to bring the list back.', desc: "For Terminals mode's list." },
  'web:off': { def: [], box: 'show', part: 'pages', menu: 'web', tips: { undo: 'Takes back the last thing you did on the web.', reset: 'Lays every folder out fresh and forgets the spots you dragged them to. Undo brings them back.', fit: 'Everything on screen at once.', home: 'Back to the middle of the web.' }, items: [['undo', 'undo'], ['reset', 'default layout'], ['fit', 'fit'], ['home', 'center']], each: { undo: { label: 'Undo button on the mind web', on: "The button is shown in the web's bar.", off: 'Hidden.{undo: % still undoes.}' }, reset: { label: 'Default layout button on the mind web', on: "The button is shown in the web's bar.", off: "Hidden. Right-click the web's bar to show it again." }, fit: { label: 'Fit button on the mind web', on: "The button is shown in the web's bar.", off: "Hidden. Right-click the web's bar to show it again." }, home: { label: 'Center button on the mind web', on: "The button is shown in the web's bar.", off: "Hidden. Right-click the web's bar to show it again." } }, label: (x: string) => x, off: "Hidden. Right-click the web's bar to show it again." },
  'bar:off': {
    def: [], box: 'show', part: 'dock', menu: 'bar',
    items: [['usage', 'usage'], ['timer', 'timer'], ['windows', 'minimized windows'], ['update', 'update'], ['hitch', 'freeze log'], ['clips', 'clips'], ['keys', 'keys help']],
    list: () => {
      const base: [string, string][] = [['usage', 'usage'], ['timer', 'timer'], ['windows', 'minimized windows'], ['update', 'update'], ['hitch', 'freeze log'], ['clips', 'clips'], ['keys', 'keys help']];
      const extras = [...document.querySelectorAll<HTMLElement>('#status > .st-usage[data-usage-id]')];
      if (!extras.length) return base;
      const lbl = (el: HTMLElement | null, n: number) => (el?.dataset.usageAgent ? `usage ${n} (${el.dataset.usageAgent})` : `usage ${n}`);
      base[0] = ['usage', lbl(document.querySelector<HTMLElement>('#st-usage'), 1)];
      base.splice(1, 0, ...extras.map((el, i): [string, string] => [el.dataset.dk!, lbl(el, i + 2)]));
      return base;
    },
    icon: (id) => (id === 'usage' || id.startsWith('usage:') ? '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 14.5a7.5 7.5 0 1 1 13 0"/><path d="m10 11.5 3.5-4"/><circle cx="10" cy="11.5" r="1.25"/></svg>' : ''),
    tips: {
      usage: "How much of each agent's limits you have used. Click it for the usage window. Right-click it to pick two bars instead of the gauge, or to add another usage button next to it, with its own agent.",
      timer: 'Each click goes to the next of the times set in Settings, and it starts 1.5 seconds after your last click. A click while it runs moves it up to the next time. Right-click it to reset it.',
      windows: 'When you minimize a quick window, such as the scratch pad or the quick terminal, its button waits here. Click it to show the window again. The dock only shows this while a window is minimized.',
      update: 'Shows when a new version of Amethyst is ready to install. Click it to update. The dock only shows it while there is one.',
      hitch: 'Shows or hides a live window of what was slow, and what each click redrew and loaded. Only in the desktop app.',
      clips: 'Clips: screenshots, photos and texts you kept for later. The button opens the clips window.',
      keys: "The keys you'll use most, in a short list. Change any of them in Settings, Keys.",
      settings: 'Theme, fonts, code colors, archive and keys.',
    },
    each: {
      usage: { label: 'Usage button', on: 'The button is shown.', off: 'The button is hidden. Your limits are still read, and the usage pop-ups still come. Right-click the dock to show it again.' },
      timer: { label: 'Timer', on: 'The timer is shown.', off: 'The timer is hidden. Right-click the dock to show it again.' },
      windows: { label: 'Minimized windows', on: 'The windows you minimize wait here, one button each.', off: "Hidden. A minimized window's own button in the rail, or its key, still brings it back. Right-click the dock to show it again." },
      update: { label: 'Update icon', on: 'Shown while a new version is ready.', off: 'Hidden. Settings, Updates still shows a new version, and the update notices still come.' },
      hitch: { label: 'Freeze log button', on: 'The button is shown.', off: 'The button is hidden. The log is still written. Right-click the dock to show it again.' },
      clips: { label: 'Clips button', on: 'The button is shown.', off: 'The button is hidden. Your clips are kept. Right-click the dock to show it again.' },
      keys: { label: 'Keys help button', on: 'The button is shown.', off: 'The button is hidden. Settings, Keys still lists every key. Right-click the dock to show it again.' },
      settings: { label: 'Settings button', on: '', off: '', fixed: "Always shown. It opens Settings, so it can't be hidden." },
    },
    label: (x: string) => `${x} in the dock`, off: 'Hidden. Right-click the dock to show it again.',
  },
  'usage:meter': { def: false, box: 'show', part: 'dock', label: 'Gauge or two bars', desc: 'Right-clicking the usage button switches it too. Each usage button you add keeps its own look.' },
  'usage:left': { def: true, box: 'show', part: 'dock', label: 'Time left in the bars', on: 'The time until the session resets shows between each bar and its %. The weekly row shows days left.', off: 'Only the percentages. The tooltip still says the time.', desc: 'The time counts down to the reset of your current session.' },
  'usage:name': { def: true, box: 'show', part: 'dock', label: 'Agent name in the bars', on: 'The agent the bars are for shows on their left.', off: 'No name. The tooltip still says which agent it is.', desc: 'With more than one agent that reports limits, scroll over the bars to switch agent.' },
  'usage:dashBtn': { def: true, box: 'show', part: 'dock', menu: 'usage', item: 'dashboard button', label: 'Dashboard button', on: "The dashboard button is shown in the window's header.", off: "The button is hidden, so the dashboard can't be opened.", desc: 'Opens the dashboard: tokens, cost, chats, commits and files changed per day.' },
  'usage:popBtn': { def: true, box: 'show', part: 'dock', menu: 'usage', item: 'pop-ups bell', label: 'Pop-ups bell', on: "The bell is shown in the window's header.", off: 'The bell is hidden. The pop-ups stay as they were set.', desc: 'Usage pop-ups: a pop-up when a limit reaches 50, 75, 80, 90 and 100%. The bell turns them on and off.' },
  'usage:accounts': { def: true, box: 'show', part: 'dock', menu: 'usage', item: 'account', label: 'Account', on: 'The Claude account the limits are for shows beside Claude Agent.', off: 'Hidden. The chat sign-in still names the account.', desc: 'Click it to look at, switch or add an account.' },
  'usage:wake': { def: true, box: 'show', part: 'dock', menu: 'usage', item: 'start buttons', label: 'Start buttons', on: 'Each account in the accounts menu has a Start button.', off: 'No Start buttons. The five-hour window starts at your first message, as before.', desc: 'Start begins the five-hour window now, so it resets sooner. Without it, the window starts at your first message.' },
  'clips:add': { def: true, box: 'show', part: 'dock', menu: 'clips', item: 'add pictures', label: 'Add pictures button', on: "The + is shown in the clips window's header.", off: 'The + is hidden. Paste or drop a picture into the window to add it.', desc: 'Picks a picture from your disk and keeps it in your clips.' },
  'hgbar:off': { def: [], box: 'show', part: 'dock', menu: 'hgbar', items: [['file', 'file'], ['snaps', 'snapshot and record']], tips: { file: "Shows hitch.log, the freeze log's file, in Explorer.", snaps: 'Snapshot saves the last 40 seconds to a file of its own and copies its path, to paste to an agent. Record 10 s profiles Window 1 and the server for 10 seconds, then saves a snapshot.' }, each: { file: { label: 'File button', on: "The button is shown on the freeze log's bar.", off: 'The button is hidden. The log is still written to its file, hitch.log.' }, snaps: { label: 'Snapshot and record buttons', on: "Both buttons are shown on the freeze log's bar.", off: 'Both buttons are hidden. The log is still written.' } }, label: (x: string) => x, off: "Hidden. Right-click the freeze log's bar to show it again." },
  'settings:find': { desc: 'Type a word, and Settings shows only what has it.', def: true, box: 'show', part: 'all', menu: 'settings', item: 'find field', label: 'Find field in settings', on: 'The field above the sections finds a setting or a key.', off: 'No field.{find: % still opens it while Settings is open.}' },
  'settings:changed': { desc: '↺ beside a setting or a key you changed, reset this section at the top of a section, and Changed at the end of the sections.', def: true, box: 'show', part: 'all', label: '↺ and Changed in settings', on: 'A ↺ beside a setting you changed puts it back, and Changed lists every one.', off: 'None of them show. Every setting keeps its value.' },
  'tell:on': { desc: 'Such as a tab dropped into a window of another project, or a folder dropped into itself.', def: true, box: 'show', part: 'all', label: 'Notices on a refused drop or click', on: "A card by the pointer says why it can't be done there, and often what to do instead.", off: 'No card. Some refused drops and clicks still say why in a notice at the bottom right. The others say nothing.' },
  'editmenu:on': { desc: 'Only in the desktop app.', def: true, box: 'show', part: 'all', desktop: true, label: 'Copy, cut and paste on a right-click', on: 'Right-click selected text or a text box for cut, copy, paste and select all.', off: 'No menu. Ctrl c, x and v still work.' },
  'update:notices': { desc: 'The notice has a button to update or restart.', def: true, box: 'amethyst', desktop: true, label: 'Notice when an update is ready', on: 'A notice pops up when a new version is ready and after it is installed.', off: 'No notice. The update icon in the dock and this box still show a new version.' },
  'forget:on': { def: true, box: 'show', part: 'dock', menu: 'bar', label: "Don't forget button in the dock", item: "don't forget", on: 'The ! in the dock opens your reminders.', off: "Hidden, and with it the key{newForget:, %,} and the reminders. Your notes are kept: turn it back on and they're all there.", desc: "Don't forget: your reminders, in one list. Start a note with ! for this project or # for the whole workspace, then minutes or a time.", redraw: 'render', quiet: true },
  'forget:popBtn': { def: true, box: 'show', part: 'dock', menu: 'forget', item: 'reminders bell', label: 'Reminders bell', on: "The bell is shown in don't forget's header.", off: 'The bell is hidden. The corner reminders stay as they were set.', desc: 'Corner reminders: a reminder also shows in the corner of the screen, outside the app. The bell turns them on and off. Only in the desktop app.', when: () => !!window.amethyst?.forgetToast },
  'forget:info': { desc: 'How to write a note, with the marks for when it reminds you.', def: true, box: 'show', part: 'dock', menu: 'forget', item: 'how to write it', label: "How-to-write button in don't forget", on: "The (i) in the window's header explains how to write a note.", off: 'No (i). The marks still work: ! for this project, # for the whole workspace.', redraw: 'render' },
  'forget:addLine': { desc: 'Where you write a new note.', def: true, box: 'show', part: 'dock', menu: 'forget', item: 'add line', label: "Add line in don't forget", on: 'A line under the header adds a note.', off: 'No line. A + beside the title opens it.' },
  'forget:setBtn': { desc: "Opens Settings at the times your don't forget list comes up.", def: true, box: 'show', part: 'dock', menu: 'forget', item: 'settings', label: "Settings button in don't forget", on: 'The button in the header opens the reminder times.', off: "No button. The times are still in Settings, General, under Don't forget's reminders." },
  'pad:off': { def: [], box: 'show', part: 'edit', menu: 'pad', items: [['move', 'move'], ['paint', 'paint'], ['bg', 'background']], tips: { move: 'Drag to move the board and its pictures around.', paint: 'Paint on the board, with its colors, line widths and eraser.', bg: "Picks the board's color." }, each: { move: { label: "Move button", on: "The button is shown on the sketch board's toolbar.", off: "The button is hidden. Esc still comes back to moving from paint. Right-click the toolbar to show it again." }, paint: { label: "Paint button", on: "The button is shown on the sketch board's toolbar.", off: "The button is hidden. Right-click the toolbar to show it again." }, bg: { label: "Background button", on: "The button is shown on the sketch board's toolbar.", off: "The button is hidden. The board keeps its color. Right-click the toolbar to show it again." } }, label: (x: string) => x, off: 'Hidden. Right-click the sketch toolbar to show it again.' },
  'fmt:off': { def: [], box: 'show', part: 'edit', menu: 'fmt', items: [['bar', 'shows over selected text'], ['bold', 'bold'], ['italic', 'italic'], ['strike', 'strikethrough'], ['code', 'code'], ['link', 'link'], ['file', 'file'], ['chat', 'chat']], parts: { bold: 'format', italic: 'format', strike: 'format', code: 'format', link: 'format', file: 'send on', chat: 'send on' }, tips: { bar: 'Bold, italic, strikethrough, code and link, one click each, for the text you selected.', bold: 'Makes the selected text bold.', italic: 'Slants the selected text.', strike: 'Draws a line through the selected text.', code: 'Marks the selected text as code.', link: 'Makes the selected text a link. Type the address in the brackets after it.', file: 'Makes the selected text a file in the inbox, and takes it out of the scratch pad.', chat: 'Sends the selected text to a chat you pick, a new one or an open one, and takes it out of the scratch pad.' }, each: { bar: { label: "Formatting bar over selected text", on: "The bar shows over text you select.", off: "No bar. The keys still format: ctrl b still makes text bold." }, bold: { label: "Bold button", on: "The button is shown.", off: "The button is hidden. Ctrl b still makes text bold." }, italic: { label: "Italic button", on: "The button is shown.", off: "The button is hidden. Right-click the formatting bar to show it again." }, strike: { label: "Strikethrough button", on: "The button is shown.", off: "The button is hidden. Right-click the formatting bar to show it again." }, code: { label: "Code button", on: "The button is shown.", off: "The button is hidden. Right-click the formatting bar to show it again." }, link: { label: "Link button", on: "The button is shown.", off: "The button is hidden. Right-click the formatting bar to show it again." }, file: { label: "+ file on selected text", on: "Select text in the scratch pad, and + file shows beside the formatting bar.", off: "The button is hidden. Right-click the formatting bar to show it again." }, chat: { label: "+ chat on selected text", on: "Select text in the scratch pad, and + chat shows beside the formatting bar.", off: "The button is hidden. Right-click the formatting bar to show it again." } }, label: (x: string) => x, off: "Hidden. Right-click the formatting bar to show it again." },
  'quote:on': { card: 'in a chat', desc: 'Add to reply puts the text you selected in your message, as a quote, so you can answer that part. Copy copies it.', def: true, box: 'show', part: 'chat', menu: 'quote', label: 'Add to reply and copy on text you select', item: 'add to reply and copy', on: 'When you select text in a reply, a small bar offers add to reply and copy.', off: 'No bar shows over text you select in a reply, and the add to reply key does nothing. Ctrl c still copies.' },
  'tochat:on': { def: true, box: 'show', part: 'edit', menu: 'quote', item: 'add to chat', label: 'Add to chat bar', on: 'Select text in a file or a terminal, and a bar with add to chat, ▾ and copy shows beside it.', off: 'No bar. Ctrl c still copies the text.', desc: 'Add to chat opens a chat beside the file with the selected text. Copy copies it with the file and lines it is from, to paste into a chat.' },
  'tochat:pick': { def: true, box: 'show', part: 'edit', menu: 'quote', item: 'pick a chat ▾', label: 'Chat picker beside add to chat', on: 'The ▾ shows beside add to chat.', off: 'No ▾. Add to chat goes to the chat beside the file.', desc: 'Picks another chat, or a new one, for the selected text.' },
  'drafts:off': { def: ['sketch', 'inbox'], box: 'show', part: 'top', menu: 'drafts', items: [['scratch', 'scratch pad'], ['sketch', 'sketch board'], ['inbox', 'inbox']], label: (x: string) => `${x} in the rail`, on: 'The button is shown.', off: 'The button is hidden.', tips: { scratch: 'The scratch pad is a page to write on quickly, from anywhere.', sketch: 'The sketch board is a board to paint on and drop images onto.', inbox: 'The inbox is a window with every file in the inbox.' }, each: {
    scratch: { label: 'Scratch pad button', on: 'The button is shown.', off: 'The button is hidden.{scratch: Its key, %, still opens the scratch pad.}' },
    sketch: { label: 'Sketch board button', on: 'The button is shown.', off: 'The button is hidden.{sketch: Its key, %, still opens the sketch board.}' },
    inbox: { label: 'Inbox button', on: 'The button is shown.', off: 'The button is hidden.{inboxKey: Its key, %, still opens the inbox.}' },
  } },
  'inbox:off': { def: [], box: 'show', part: 'files', menu: 'inbox', tips: { new: 'Makes a new file in the inbox. Type its name, then press enter.' }, items: [['new', 'new file']], each: { new: { label: 'New file button', on: 'The + new file button is shown first in the list.', off: 'Hidden. Press n in the list to make a new file.' } }, label: (x: string) => `${x} in the inbox window`, off: 'Hidden. Right-click the list to show it again.' },
  'archive:off': { def: [], box: 'show', part: 'files', menu: 'archive', tips: { show: 'Opens the folder the archived things are in.' }, items: [['show', 'show in File Explorer']], each: { show: { label: 'Show in File Explorer button', on: 'The button is shown at the top right of the archive.', off: 'The button is hidden. Right-click the archive to show it again.' } }, label: (x: string) => `${x} in the archive`, off: 'The button is hidden. Right-click the archive to show it again.' },
  'txbar:off': { tips: { preview: 'Shows the text as it reads, read only.', move: 'Moves a file from outside your projects into one.' }, def: [], box: 'show', part: 'files', menu: 'txbar', items: [['preview', 'preview'], ['move', 'move to project']], each: { preview: { label: 'Preview button', on: "The button is shown on a .md file's bar.", off: "Hidden. Right-click the file's bar to show it again." }, move: { label: 'Move to project button', on: 'The button is shown on the bar of a file from outside your projects.', off: "Hidden. Right-click the file's bar to show it again." } }, label: (x: string) => `${x} button on a file's bar`, off: "Hidden. Right-click the file's bar to show it again." },
  'tbar:off': { def: [], box: 'show', part: 'files', menu: 'tbar', items: [['split', 'split buttons'], ['gclose', 'close group']], tips: { split: 'Split right makes a new group of tabs on the right, split down a new group below.', gclose: 'Closes this group and every tab in it. It asks first if the group holds several.' }, each: { split: { label: 'Split buttons', on: 'Split right and split down are shown at the right of the tab bar.', off: 'Hidden. Right-clicking the tab bar still has split right and split down.{split: Its key, %, still splits.}' }, gclose: { label: 'Close group button', on: 'The × is shown at the right end of the tab bar.', off: 'Hidden. Right-clicking the tab bar still closes the group.' } }, label: (x: string) => (x === 'split buttons' ? "Split buttons on the editor's tab bar" : "Close group button on the editor's tab bar"), off: 'Hidden. Right-click the tab bar to show it again.', redraw: 'render' },
  'br:off': { def: [], box: 'show', part: 'edit', menu: 'browser', items: [['inspect', 'inspect'], ['paint', 'paint'], ['to', 'chat to add to'], ['zoom', 'zoom']], tips: { inspect: 'Click an element of the page, then copy it or add it to a chat.', paint: 'Draws over the page, to show a chat what you mean, then copies the page with your drawing as a picture.', to: 'Picks where an element you pick goes: the chat used last, an open chat, or a new one.', zoom: 'How far the page is zoomed. The button sets it back to 100 %.' }, each: { inspect: { label: "Pick an element button", on: "The button is shown on the browser tab's bar.", off: "The button is hidden. Right-click the bar to show it again." }, paint: { label: "Paint buttons", on: "Paint, its pen or box, and copy as a picture are shown.", off: "The three buttons are hidden. Right-click the bar to show them again." }, to: { label: "Chat to add to button", on: "The ▾ is shown after the paint buttons.", off: "The button is hidden. A picked element goes to the chat used last. Right-click the bar to show it again." }, zoom: { label: "Zoom", on: "The page's zoom and its reset button are shown at the right end.", off: "Both are hidden. Right-click the bar to show them again." } }, label: (x: string) => x, off: "Hidden. Right-click the bar to show it again." },
  'qterm:off': { def: ['agent'], box: 'show', part: 'top', menu: 'drafts', items: [['term', 'quick terminal'], ['pwsh', 'quick PowerShell'], ['agent', 'Quick Agent'], ['newchat', 'new agent chat']], label: (x: string) => `${x} in the rail`, on: 'The button is shown.', off: 'The button is hidden.', tips: { term: "Shows the project's quick terminal from anywhere. Hidden, it keeps running.", pwsh: "Shows the project's quick PowerShell from anywhere. Hidden, it keeps running.", agent: "Shows the project's Quick Agent from anywhere. Hidden, it keeps working. Right-click it to pick the agent a new quick chat uses.", newchat: 'Starts a new chat with the agent you pick: a tab in the editor, or a chat in orchestration.' }, each: {
    term: { label: 'Quick terminal button', on: 'The button is shown.', off: 'The button is hidden.{quickTerm: Its key, %, still shows the quick terminal.}' },
    pwsh: { label: 'Quick PowerShell button', on: 'The button is shown.', off: 'The button is hidden.{quickPwsh: Its key, %, still shows quick PowerShell.}' },
    agent: { label: 'Quick Agent button', on: 'The button is shown.', off: 'The button is hidden.{quickAgent: Its key, %, still shows the Quick Agent.}' },
    newchat: { label: 'New agent chat button', on: 'The button is shown.', off: 'The button is hidden.{newAgentKey: Its key, %, still starts a new chat.}' },
  } },
  'barend:off': { def: ['pins', 'win'], box: 'show', part: 'top', menu: 'drafts', items: [['more', 'new'], ['pins', 'pinned'], ['win', 'new window']], label: (x: string) => `${x} in the rail`, on: 'The button is shown.', off: 'The button is hidden. Right-click the rail to show it again.', tips: { more: 'Opens a menu that makes a new folder, file, .md file or .txt file, in the inbox or the project folder. Right-click it to pick the buttons pinned under it.', pins: 'Shows or hides the list of the files and chats you pinned.', win: 'Opens another window of this Amethyst, or a new Amethyst with its own tabs, chats and account.' }, each: {
    more: { label: 'New button', on: 'The button is shown.', off: 'The button is hidden. The buttons pinned under it stay. Right-click the rail to show it again.' },
    pins: { label: 'Pinned button', on: 'The button is shown.', off: 'The button is hidden.{pinsKey: Its key, %, still shows the list.}' },
    win: { label: 'New window button', on: 'The button is shown.', off: 'The button is hidden.{newWindowKey: Its key, %, still opens a new window.}' },
  } },
  'ue:on': { desc: 'When it is on, this row also says whether the project you are in is an Unreal project.', def: false, box: 'unreal', label: 'Unreal Engine support', on: 'On. Unreal projects get the build button, its key and window, and help while you write C++.', off: "Off. Amethyst doesn't look for Unreal projects.", redraw: 'render' },
  'ue:btn': { def: true, box: 'show', part: 'top', menu: 'drafts', when: () => pref('ue:on'), desc: 'Builds the project. The button says which build, such as Dev, and how the last one went. Right-click it for the other builds and options.', label: 'Unreal build button', item: 'Unreal build', on: 'The button is shown.', off: 'The button is hidden.{ueBuild: Its key, %, still builds.}', redraw: 'render' },
  'ue:winbtn': { def: true, box: 'show', part: 'top', menu: 'drafts', when: () => pref('ue:on'), desc: "The Unreal build's output, problems and logs, in a window of its own.", label: 'Build window button', item: 'build window', on: 'The button is shown.', off: 'The button is hidden. Right-clicking the Unreal build button still shows the window.{ueWindow: Its key, %, shows it too.}', redraw: 'render' },
  'ue:off': { def: [], box: 'show', part: 'quick', menu: 'ue', when: () => pref('ue:on'), items: [['editor', 'open the editor'], ['play', 'play'], ['more', 'more'], ['refresh', 'refresh'], ['asfile', 'open as a file']], tips: { editor: 'Opens Unreal Editor on this project. Its dot shows while the editor is open.', play: 'Plays the game in the open editor, or stops it.', more: 'The ⋯ menu: rebuild, clean and make project files.', refresh: 'Reads the log again, from its file.', asfile: 'Opens the log as a file tab in the editor.' }, label: (x: string) => `${x} in the Unreal build window`, on: 'The button is shown.', off: "The button is hidden. Right-click the build window's bar to show it again.", each: {
    editor: { label: 'Open the editor button', on: 'The button is shown.', off: "The button is hidden. Right-click the build window's bar to show it again." },
    play: { label: 'Play button', on: 'The button is shown.', off: "The button is hidden. Right-click the build window's bar to show it again." },
    more: { label: 'More button', on: 'The button is shown.', off: "The button is hidden. Right-click the build window's bar to show it again." },
    refresh: { label: 'Refresh button', on: 'The button is shown on each log.', off: "The button is hidden on each log. Right-click a log's bar to show it again." },
    asfile: { label: 'Open as a file button', on: 'The button is shown on each log.', off: "The button is hidden on each log. Right-click a log's bar to show it again." },
  } },
  'ue:checks': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Unreal checks while you type', on: 'Marks from the Unreal checks show as you write.', off: 'No marks from the Unreal checks. A build still reports its errors.' },
  'ue:spechelp': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Explain specifiers on hover', on: "Resting the pointer on a specifier in UPROPERTY(…), UFUNCTION(…) and the like shows what it does, from the engine's own notes.", off: 'No card on hover. The completion list still explains them.' },
  'ue:namehelp': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Explain names on hover', on: 'Resting the pointer on a type, a member, a macro or a local shows its declaration and its comment.', off: 'No card on names. F12 still goes to the declaration.' },
  'ue:uht': { desc: "Epic's Unreal Header Tool checks the project and writes nothing. A header added since the last build is checked after the next build.", def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Unreal Header Tool after saving a header', on: 'It runs a moment after you save a header, here or in another editor, and its messages show on their lines.', off: 'It runs only when you build.' },
  'ue:buildmarks': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Build errors marked in the code', on: "A build's errors are marked on their lines in the code.", off: 'The errors stay in the build window only.' },
  'ue:big': { def: false, box: 'unreal', when: () => pref('ue:on'), label: 'Bigger Unreal build button', on: 'The build button shows which build, its timer and result, with an open-the-editor part. It is 4 cells wide in the dashboard and 4 tall on the rail.', off: 'The build button is a single icon in the dashboard and on the rail.', desc: 'Right-click the build button to switch it too.', redraw: 'render' },
  'ue:clickeditor': { def: false, box: 'unreal', when: () => pref('ue:on'), label: 'A click on the build button also opens the editor', on: 'A click, or the build key, builds the Editor target, then opens Unreal Editor when the build succeeds.', off: 'A click, or the build key, only builds.', desc: 'When Unreal Editor is already open, a click works as if this were off. Right-click the build button to switch it too.' },
  'ue:edlog': { def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Show the logs when the editor opens', on: "Opening Unreal Editor from Amethyst opens the build window on the editor's log.", off: 'The build window stays as it is when the editor opens.', desc: "The editor's log fills as it starts. Right-click the build button to switch it too." },
  'ue:link': { desc: "The link needs Amethyst's own key, so other programs can't use it. Nothing is installed or written in the project.", def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Open the editor with the Amethyst link', on: "Live Coding, play and the agents' Unreal tools reach an editor opened from Amethyst.", off: 'The editor opens plain, with no Live Coding or play from Amethyst. The live log still works.' },
  'ue:livebuild': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Build with Live Coding while the editor is open', on: 'With the editor linked, the build button and its key run Live Coding.', off: 'The build button builds as before. Live Coding is in the Unreal menu.' },
  'ue:guard': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Live Coding only for changes it can apply safely', on: 'Live Coding runs only for changes inside function bodies. After a change to a header, a new file or a .Build.cs file, restart the editor and build.', off: 'Live Coding always runs. A warning comes after a risky change.' },
  'ue:ask': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Ask the agent button on build errors', on: "An ask the agent button shows in the Problems list and in a build error's hover card.", off: 'No ask the agent button in the Problems list or in the hover card.', redraw: 'render' },
  'marks:text': { desc: '', def: 'all', box: 'unreal', when: () => pref('ue:on'), label: 'Problem messages in the code', choices: [
    ['all', 'Every line with a problem', 'The message shows at the end of every line with a problem.'],
    ['cursor', "The cursor's line", "The message shows only at the end of the line you're on."],
    ['off', 'None', 'No message in the code. Point at the underline to read it.'],
  ] },
  'ue:rpc': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Network labels on RPC functions', on: "Server, Client or Multicast shows at the end of a network function's line, in its header and on its _Implementation in the .cpp file.", off: 'No labels. The UFUNCTION line still says it.' },
  'ue:new': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'New class, module and plugin in menus', on: "They are in the explorer's right-click menu and the Unreal menu. The palette has them too.", off: "They aren't in the explorer's right-click menu or the Unreal menu. The palette still has them." },
  'ue:comments': { adv: true, desc: '', def: false, box: 'unreal', when: () => pref('ue:on'), label: "Keep Unreal's template comments", on: 'New files keep Unreal\'s template comments, such as "// Sets default values".', off: 'New files leave out Unreal\'s template comments, such as "// Sets default values".' },
  'debug:on': { desc: 'The debugger is a 17 MB download the first time.', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Debugger', on: 'Breakpoints show left of the line numbers, and the debug column and its keys F5, F9, F10 and F11 work.', off: 'No breakpoints, debug column or debug keys.', redraw: 'render' },
  'debug:col': { def: false },
  'debug:build': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Build before debugging', on: 'F5 builds the DebugGame Editor target first, then starts it. Attaching never builds.', off: "F5 starts what's built. If it isn't built, it says so." },
  'debug:ensure': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Stop on ensure()', on: 'An ensure() that fails stops there, as in Visual Studio.', off: 'A failed ensure() only goes to the log, and the program runs on.' },
  'debug:readonly': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Open engine files read-only', on: 'Engine files opened while debugging are read-only, with edit anyway above the code.', off: 'Engine files open like any other.' },
  'debug:dots': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Debug state on the Unreal button and the dock', on: "A dot on the Unreal button and the project's chip in the dock shows it. It is the accent colour while running, yellow when stopped and red after a crash.", off: 'Only the debug column shows it.' },
  'debug:cpp': { desc: 'Unreal code rarely throws.', def: false, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Stop on C++ exceptions', on: 'It stops where a C++ exception is thrown, before anything catches it.', off: 'Only an exception nothing catches stops it, as a crash.' },
  'debug:inline': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Values at line ends', on: "While stopped, the lines that already ran show their variables' values at their ends. A value is yellow when the last step changed it.", off: 'Only the variables list shows them.' },
  'debug:pathbar': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Step buttons in the path row', on: "With the debug column hidden, the code's path row shows continue, the steps and stop.", off: 'Only the keys. Ctrl shift d shows the column.' },
  'debug:giveback': { desc: 'Only in the desktop app.', def: true, desktop: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Give the focus back to Unreal when you continue', on: 'When it stopped and brought Amethyst to the front, continue (F5) puts Unreal Editor back in front.', off: 'Amethyst stays in front.' },
  'debug:fold': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Fold engine frames in the call stack', on: 'Runs of engine frames fold into one row. Click it to see them.', off: 'Every frame has its own row.' },
  'debug:types': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Types after values', on: 'The type shows, dimmed, after each value.', off: 'Values only. The tooltip has the type.' },
  'debug:hover': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Values on hover', on: 'While stopped, pointing at a variable shows its value.', off: 'No value cards. The variables list has them.' },
  'debug:front': { desc: '', def: true, box: 'unreal', when: () => pref('ue:on') && pref('debug:on'), label: 'Bring Amethyst to the front when it stops', on: 'When it stops at a breakpoint, Amethyst comes to the front on that line.', off: 'Amethyst stays behind. The debug column shows the stop.' },
  'debug:off': { def: [], box: 'show', part: 'edit', menu: 'debug', when: () => pref('ue:on') && pref('debug:on'), items: [['over', 'step over'], ['into', 'step into'], ['out', 'step out'], ['stop', 'stop'], ['restart', 'restart'], ['more', 'the ⋯ menu']], tips: { over: 'Runs this line and stops at the next one.', into: 'Goes into the call on this line.', out: 'Runs on to where this function returns.', stop: 'Detaches the debugger, and the program keeps running. Its arrow ends the program instead.', restart: 'Ends the program and starts it again under the debugger.', more: 'Opens the debugger menu. Without it, the menu is only on a right-click of the bar.' }, label: (x: string) => `${x} in the debug bar`, on: 'The button is shown.', off: 'The button is hidden. Right-click the debug bar to show it again.', each: {
    over: { label: 'Step over button', on: 'The button is shown.', off: 'The button is hidden.{debugOver: Its key, %, still steps over.}' },
    into: { label: 'Step into button', on: 'The button is shown.', off: 'The button is hidden.{debugInto: Its key, %, still steps into.}' },
    out: { label: 'Step out button', on: 'The button is shown.', off: 'The button is hidden.{debugOut: Its key, %, still steps out.}' },
    stop: { label: 'Stop button', on: 'The button is shown.', off: 'The button is hidden.{debugStop: Its key, %, still stops.}' },
    restart: { label: 'Restart button', on: 'The button is shown.', off: 'The button is hidden. Right-click the debug bar to show it again.' },
    more: { label: 'Menu button', on: 'The button is shown.', off: 'The button is hidden. Right-click the debug bar for the menu.' },
  } },
  'marks:gutter': { adv: true, desc: '', def: true, box: 'unreal', when: () => pref('ue:on'), label: 'Problem marks beside the line numbers', on: 'Problems are marked beside the line numbers.', off: 'No marks beside the line numbers. The underlines stay.' },
  'colors:add': { def: true, box: 'show', part: 'all', label: '+ after the colors in a color menu', on: 'A + follows the colors in every color menu.', off: 'No +. Settings, Look, Color tray still adds and changes the colors.', desc: 'Opens the color tray in Settings, where you add, change or remove the colors of every color menu.' },
  chatMarks: { card: 'in a chat', desc: "A short line where each message starts: yours in the accent color, the agent's in grey. They help you find your way back in a long chat.", def: true, box: 'show', part: 'chat', label: 'Message marks on the scrollbar', on: "Each message has a small mark on the chat's right edge.", off: "The chat's right edge has no marks. Scrolling works the same." },
  liveCmds: { card: 'in a chat', desc: 'When the agent runs a command, its box in the chat has what was typed in, then what the command printed.', def: true, box: 'show', part: 'chat', label: 'Command output while it runs', on: 'A command shows its output as it comes, with a cursor at the end while it runs.', off: "A command's output shows once the command has ended.", redraw: 'render' },
  'chat:holdStart': { card: 'in a chat', desc: 'When an answer grows taller than the chat, the chat stops with its first line at the top, so you read it from the start. The down arrow says new while more comes in below.', def: true, box: 'show', part: 'chat', menu: ['head', 'ochead'], label: 'Long answers stop at their start', on: "The chat stops when a long answer's first line reaches the top. Scroll down to read on.", off: 'The chat follows each answer to its end while it is written.' },
  'chat:off': { card: 'in a chat', name: 'rows and marks in a chat', def: [], box: 'show', part: 'chat', items: [['color', 'usage meter color while the chat compacts'], ['compact', 'compaction rows in the messages'], ['notice', 'notices from the agent'], ['switch', 'continue with another agent'], ['time', 'time a message was sent, on hover'], ['up', 'up arrow to the start of a message']], tips: { up: "A small arrow in the top right corner of the chat. Each click goes up to the start of one more message, yours or the agent's.", color: 'When the chat gets full, the agent compacts it: it sums up the older messages so it can carry on.', compact: "Compacting sums up a full chat's older messages so the agent can carry on. The row shows how much smaller the chat got, and opens to the summary.", notice: 'Some agents send a short notice that is not part of the answer, such as a warning about a limit. It shows as a row marked notice, warning or error.', time: 'Point at one of your messages or an answer to see when it was sent. A message from an earlier day also shows the date.' }, each: {
    color: { label: 'Usage meter color while the chat compacts', on: 'The meter changes color while the chat compacts, then shows green for a few seconds, or red if it failed.', off: 'The meter keeps its usual color while and after the chat compacts. The compaction row in the messages still says it.' },
    compact: { label: 'Compaction rows in the messages', on: 'A row in the messages says where the chat was compacted. Click it to read the summary.', off: 'No row in the messages when the chat is compacted. The chat is compacted the same way.' },
    notice: { label: 'Notices from the agent', on: 'Notices the agent sends show as a row in the messages.', off: 'Notices from the agent are hidden. Nothing else in the chat changes.' },
    time: { label: 'Time a message was sent, on hover', on: 'Pointing at a message shows when it was sent, beside its buttons.', off: 'No time beside the buttons. The buttons still show when you point at a message.' },
    up: { label: 'Up arrow to the start of a message', on: 'A small up arrow in the top right corner of the chat goes up to the start of a message, one more with each click.', off: 'No up arrow. Scrolling up works the same.' },
  }, label: (x: string) => x, on: 'It is shown.', off: 'It is hidden.' },
  linkCopy: { def: true, box: 'show', part: 'links', label: 'Copy button on a file link', on: 'Each file link in a chat ends with a copy button.', off: 'No copy button. Right-click the link to copy its path.', desc: 'A file link is a file an agent names in its answer. Click it to open the file. The copy button copies its path.' },
  picCopy: { def: true, box: 'show', part: 'links', label: 'Copy button on a picture', on: 'Each picture chip ends with a copy button, and so does each picture in a chat.', off: 'No copy button. In the chat box, right-click the picture to copy it. In the scratch pad, click it to open it, then right-click it to copy.', desc: 'Copies the picture, to paste into a chat or another app.' },
  accentNewBtn: { def: false, box: 'look', label: 'Accent color on the new agent button', on: 'The new agent button, in the rail and at the top of the chat list, is in the accent color.', off: "The new agent button is grey, in the theme's own greys.", desc: 'The button that starts a new chat with an agent.' },
  'newbtn:big': { def: false, box: 'look', label: 'Bigger new agent button', on: 'The new agent button shows its label, like + Agent or + Claude, taking 4 cells in the dashboard and showing its label at the top of the chat list.', off: 'The new agent button is a single icon.', desc: 'Applies to the new agent button in the dashboard and at the top of the chat list. Right-click the button to switch it too.', redraw: 'render' },
  'slot:big': { def: {}, quiet: true, label: 'Bigger button instances', desc: 'Which rail, dashboard or chat list buttons are shown in their bigger form.' },
  'newbtn:color': { def: '', quiet: true, label: 'New agent button color', desc: 'The color of the new agent button in the dashboard, rail and chat list: default, clear, accent or any color.' },
  accentTurnLines: { def: false, box: 'look', label: 'Colour of the lines between turns', on: "The line where an agent's turn starts and ends is in the accent color.", off: "The line is grey, in the theme's own greys.", desc: "The line runs across a chat between your message and the agent's turn, and after the turn ends." },
  chipX: { def: true, box: 'show', part: 'links', label: '× that removes a chip', on: 'Each chip in a text box has an × that takes it out.', off: 'No ×. Select the chip and press delete to take it out.', desc: 'A chip is a picture or a file you added to a text box, such as the chat box or the scratch pad. Click a picture chip to see the picture.' },
  linkMarks: { def: true, box: 'show', part: 'links', label: 'Globe and envelope after web and mail links', on: 'A globe follows each web link, and an envelope each mail link.', off: 'No globe or envelope. The links work the same, and their tooltip still says where they go.', desc: 'A web link opens the page in Amethyst. A mail link starts a new mail to that address.' },
  'deck:spotBtn': { item: 'spotlight', def: true, box: 'show', part: 'chat', menu: 'head', label: 'Spotlight button', on: 'The button is shown.', off: "The button is in the ⋯ menu instead. Double-clicking the header still puts it in the spotlight.", desc: 'Shows the spotlight button: it makes this chat one tall column, full height, beside the others in its set. It needs a second chat on screen.', redraw: 'render' },
  'deck:more': { item: 'more', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'More button', on: 'The button is shown.', off: "The button is hidden. It comes back when the header runs out of room; otherwise the ⋯ menu's rows are at the top of the header's right-click menu.", desc: "Shows the ⋯ button: the chat's other actions, such as earlier chats, sign-in, clear, continue with, and the header buttons you unticked.", redraw: 'render' },
  'deck:markBtn': { item: 'mark', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Mark button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", desc: 'Shows the mark button: it gives the chat a colored mark, to tell it apart in the agents list.', redraw: 'render' },
  'deck:markShow': { item: 'mark, while its button is in ⋯', group: 'part', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Mark sign when the mark button is hidden', on: 'A marked chat shows its mark in the header. Click it to change the mark.', off: 'With the mark button hidden, the header shows no mark. The agents list still does.', desc: "Shows a marked chat's mark in the header while the mark button is in ⋯; a click changes it. The agents list shows the mark either way.", redraw: 'render' },
  'deck:reportBtn': { item: 'notify me', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Notify me bell', on: 'The bell is shown.', off: "Notify me is in the chat's ⋯ menu instead.", desc: 'Shows the notify me bell: a notification each time the chat is ready while you are not looking at it.', redraw: 'render' },
  'deck:noteBtn': { item: 'note', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Note button', on: 'The button is shown.', off: "Notes are in the chat's ⋯ menu instead, or press ctrl n in the chat.", desc: 'Shows the note button: it opens a note you write on this chat. A dot on it shows when the chat has one.', redraw: 'render' },
  'deck:noteShow': { item: 'note sign, while its button is in ⋯', group: 'part', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Note sign when the note button is hidden', on: 'A chat with a note shows the note sign in the header. Click it to read or change the note.', off: "With the note button hidden, the header shows no note sign. The note is still in the chat's ⋯ menu, or press ctrl n in the chat.", desc: 'Shows the note sign on a chat with a note while the note button is in ⋯; a click opens the note. ctrl n opens it either way.', redraw: 'render' },
  'deck:pinBtn': { item: 'pin', def: false, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Pin button', on: 'The button is shown.', off: "Pin is in the chat's ⋯ menu instead.", desc: 'Shows the pin button: it keeps the chat or terminal in your pinned list, under pinned in the rail.', redraw: 'render' },
  'deck:benchBtn': { item: 'bench', def: true, box: 'show', part: 'chat', menu: 'head', label: 'Bench button', on: 'The button is shown.', off: "Bench is in the chat's ⋯ menu instead, or press alt b.", desc: "Shows the bench button: it takes a terminal, or a workspace's chat, out of its window. It keeps running and waits under Benched in the agents list.", redraw: 'render' },
  'deck:setBtn': { item: 'move to another set', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Move to another set button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", desc: 'Shows the button that moves the chat to another set, or to a tab in the Editor.', redraw: 'render' },
  'deck:orchBtn': { item: 'move to Orchestration', def: true, box: 'show', part: 'chat', menu: 'head', label: 'Move to Orchestration button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead, and in the move menu.", desc: "Shows the button that moves the chat out of this set into Orchestration's list. The chat keeps running.", redraw: 'render' },
  'deck:tabBtn': { item: 'move to the Editor', def: false, box: 'show', part: 'chat', menu: 'head', label: 'Move to the Editor button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", desc: 'Shows the button that moves the chat or terminal to the Editor you used last, as a tab.', redraw: 'render' },
  'deck:closeBtn': { item: 'close', def: true, box: 'show', part: 'chat', menu: 'head', label: 'Close button', on: 'The button is shown.', off: "Close is in the chat's ⋯ menu and in the header's right-click menu instead.", desc: "Shows the × close button, always last in the header. Unticked, close is in the ⋯ menu and in this menu's actions.", redraw: 'render' },
  'deck:doneBadge': { def: true, box: 'show', part: 'chat', places: ['win', 'oc'], label: 'Finished badge above the message box', on: 'The badge shows over a chat or terminal that is done, just above its message box.', off: 'No badge. The header still says done, and the window stays tinted green.', desc: 'It says the chat or terminal has finished, and how long ago.', redraw: 'render' },
  'deck:model': { item: 'model and effort', group: 'part', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: 'Model and effort', on: 'The model and effort are shown.', off: "The model and effort are hidden. The chat's box still shows them.", desc: 'Shows which model the chat runs on, and how hard it thinks. The chat box shows them either way.', redraw: 'render' },
  'deck:code': { item: 'code', group: 'part', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: "Chat's code", on: 'The code is shown, like K42.', off: 'The code is hidden.', desc: 'Shows the short code that names the chat, like K42, in its color.', redraw: 'render' },
  'deck:title': { item: 'title', group: 'part', def: false, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: "Chat's title", on: "The title is shown next to the chat's code.", off: "The title is hidden. Point at the chat's code to read it.", desc: "Shows the chat's title beside its code. Pointing at the code shows it either way.", redraw: 'render' },
  'marks:on': { desc: 'A mark is a colored sign you give a chat, to tell it apart. The mark names are just above this row.', def: true, box: 'agents', label: 'Marks on chats', on: 'You can mark a chat. Its mark shows in the agents list, in its header and in orchestration.', off: 'Chats have no mark button and show no marks. The marks you set are kept and come back when you turn this on.', redraw: 'render' },
  'chpill:off': { group: 'own', def: ['history', 'signin', 'clear', 'swap'], box: 'show', part: 'chat', menu: ['head', 'ochead'], items: PILLS, each: Object.fromEntries(PILLS.map(([id, l]) => [id, { label: l.charAt(0).toUpperCase() + l.slice(1), on: PILL_HEAD, off: PILL_MENU }])), tips: { history: 'Opens the chats you had before in this folder, so you can pick one up again.', signin: "Shows how this chat's agent signs in.", clear: 'Empties the chat and forgets it, to start over.', swap: 'Carries this chat on with another agent, such as Codex, or copies it as a handoff to paste anywhere.' }, label: (x: string) => x, on: PILL_HEAD, off: PILL_MENU, offWhen: ['deck:more', "A row in the header's right-click menu, as the ⋯ button is hidden."], picks: [['head', 'Header button', PILL_HEAD], ['menu', 'Menu row', PILL_MENU], ['hid', 'Hidden', 'Hidden, so a chat stays with the agent it started with. Nothing in the chat changes.']], picked: (id: string) => id === 'swap' && setOff('chat:off', 'switch', false), redraw: 'render' },
  'chrow:off': { def: [], box: 'show', part: 'chat', menu: 'chrow', items: [['attach', 'add an image button'], ['usage', 'usage meter'], ['mode', 'mode']], tips: { attach: 'It picks an image from your disk and puts it in your message where the cursor is.', usage: 'How much of what the model can hold at once this chat fills, like 42k. Click it to see what fills it, in Claude chats. Right-click it to see the last compaction.', mode: 'How much the agent may do without asking you first, such as plan, accept edits or auto.' }, each: {
    attach: { label: 'Add an image button', on: 'The button is shown.', off: 'The button is hidden. You can still paste an image, or drop one onto the box.' },
    usage: { label: 'Usage meter', on: 'The usage meter shows how full the chat is.', off: 'The usage meter is hidden. The chat still compacts itself when it gets full.' },
    mode: { label: 'Mode', on: 'The mode is shown. Click it to pick another.', off: 'The mode is hidden. The chat keeps its mode, and alt m still steps through the modes.' },
  }, label: (x: string) => `${x} in a chat box`, on: 'It is shown.', off: 'It is hidden.' },
  'edits:head': { item: 'review', def: true, box: 'show', part: 'chat', places: ['win', 'oc'], menu: ['head', 'ochead'], label: '± review button', on: 'The button is shown.', off: "The button is in the chat's ⋯ menu instead.", desc: 'Shows the ± button: it opens Review, what this chat changed, in a window of its own. It shows once the chat has changed files.' },
  'edits:strip': { card: 'in a chat', desc: 'The bar says how many files the chat changed and how many lines were added and removed. Click it to open the list of files.', def: true, box: 'show', part: 'chat', menu: 'edits', item: 'list of changed files above the chat box', label: 'List of changed files above the chat box', on: 'Once the chat has changed files, a bar above its box says how many, with Review, Reject all and Keep all.', off: "No bar above the chat box. The ± review button in the chat's header still opens Review." },
  'chat:artifacts': { card: 'in a chat', desc: 'Only Antigravity chats make artifacts: plans, pictures and other files for you to read. When it asks for your feedback, the bar has a Proceed button that tells it to carry on.', def: true, box: 'show', part: 'chat', menu: 'artifacts', item: "Antigravity's artifacts bar", label: "Antigravity's artifacts bar", on: 'When an Antigravity chat makes files for you to look at, a bar at the top of the chat lists them.', off: "No artifacts bar. The files stay on disk and in the chat's messages." },
  'chat:worktree': { def: true, box: 'show', part: 'chat', menu: 'chrow', item: 'worktree button', label: 'Worktree button', desc: 'It gives a new chat its own copy of the project to work in, so its changes stay apart from your files.', on: 'The button is shown.', off: 'The button is hidden, so new chats work in the project folder. A chat already in a worktree stays there.' },
  'chat:mic': { def: true, box: 'show', part: 'chat', menu: 'chrow', item: 'mic button', label: 'Mic button (speak a message)', desc: 'Click it and speak: your words go into the box, ready to send. Speech turns into text on this computer.', on: 'The button is shown, left of send.', off: 'The button is hidden. Its key does nothing, and a downloaded speech model stays.' },
  'voice:live': { def: true, box: 'show', part: 'chat', card: 'speech to text', label: 'Show words as you speak', on: 'Your words show up in the box as you speak, and the mic stops by itself when you go quiet. Whisper then tidies each sentence.', off: 'Click the mic, speak, click it again: Whisper writes it all in once you stop.', desc: 'The live words come from a second, smaller speech model that knows English only. For other languages, turn this off.' },
  'voice:model': { def: 'small', box: 'show', part: 'chat', card: 'speech to text', label: 'Speech model', desc: 'Whisper, on this computer. Changing it downloads the other model the next time you click the mic.', choices: [
    ['base', 'Smaller and faster', 'About 150 MB. Text comes in about a second, and it misses more words.'],
    ['small', 'More accurate', 'About 490 MB. Text comes in a few seconds.'],
  ] },
  'chat:wtStrip': { def: true, box: 'show', part: 'chat', menu: 'chrow', item: 'worktree strip', label: 'Worktree strip above the message box', desc: "With the worktree on, it says the chat will start on a new branch and lets you pick what that starts from: the last commit, your uncommitted changes too, or another branch. Once the worktree is made, it names its branch and how far it is ahead.", on: "The strip shows above the message box in a chat with a worktree, or one that will get one.", off: 'The strip is hidden. The worktree button still turns the worktree on and off, and a new branch starts from what you last picked on the strip.' },
  'chat:hint': { def: true, box: 'show', part: 'chat', menu: 'chrow', item: 'tips in the empty chat box', label: 'Tips in the empty chat box', desc: 'The words in the chat box before you type. They show only when the box is wide enough for them; a narrow box says "Message…" either way.', on: 'The empty box says "Message, @ to add a file, / for commands".', off: 'The empty box says only "Message…". Typing @ or / works the same.' },
  'chrow:chips': { def: [], box: 'show', part: 'chat', menu: 'chrow', all: 'chat box: every option shown', allTip: 'shows every option in the chat box', list: (from) => chipsOf(from).map((b) => [b.dataset.pick!, CHIP_WORDS[b.dataset.pick!]?.label.toLowerCase() || chipName(b.dataset.name || b.dataset.pick!)]), tips: { model: 'Which model answers in this chat. You can scroll over it to step through the models.', effort: 'How much the model thinks before it answers. More effort takes longer and uses more of your limit.', fast: 'Fast mode makes the same model answer faster, and it costs more.', ultracode: 'Ultracode runs big jobs as workflows of many agents, which uses far more tokens. While it is on, the chat box has a red border.' }, each: CHIP_WORDS, icon: (id, from) => chipsOf(from).find((b) => b.dataset.pick === id)?.querySelector('svg')?.outerHTML || '', label: (x: string) => `${x} in a chat box`, on: 'It is shown in every chat box.', off: 'It is hidden in every chat box. Its keys still change it.' },
  'chat:shrinkRow': { def: true, box: 'show', part: 'chat', menu: 'chrow', item: 'Improved Handoff switch', label: 'Improved Handoff switch', on: "The switch is shown, after the agent's own buttons.", off: 'The switch is hidden. Each chat keeps the setting it had.', desc: 'Before changing model or continuing with another agent, a long chat is first summarized on the current one so the next starts light. A short chat, or one quiet for over an hour, skips the summary.' },
  'chat:handoffAsk': { def: true, box: 'show', part: 'chat', label: 'Ask about Improved Handoff when switching agents', on: 'When Improved Handoff is off on a long chat, continuing with another agent asks whether to summarize first.', off: 'Switches right away without asking. Turn this back on any time to restore the prompt.', desc: 'Controlled by the "Don\'t ask again" checkbox in the Continue with dialog.' },
  'scm:off': { def: [], box: 'show', part: 'files', menu: 'scm', items: [['remote', 'GitHub link'], ['check', 'remote check'], ['pull', 'pull and push'], ['sync', 'sync and publish'], ['ai', 'write the message'], ['model', "who writes, in the message box"], ['push', 'commit & push'], ['last', 'amend and undo'], ['who', 'chat that changed a file'], ['history', 'history'], ['stashes', 'stashes'], ['parts', 'commit part of a file'], ['pr', 'pull request']], tips: { remote: 'The link to the project\'s GitHub page, or the button that connects one.', check: 'When the remote was last checked, with a button to check now.', pull: 'Pull and push, with how many commits wait each way.', sync: 'Sync and publish for a branch that has no upstream yet.', ai: 'Reads the changes and writes a short commit message.', model: 'The model that writes when you click ✦. Click it to pick another agent or model.', push: 'Commits, then pushes to the remote in one click.', last: 'Amend changes the last commit instead of making a new one. Undo last commit takes it back and keeps its changes.', who: 'The chat that changed each file, beside its name.', history: 'The history of commits.', stashes: 'The stashes.', parts: 'The buttons that commit or discard part of a file, in its diff.', pr: 'The pull request of the branch you are on.' }, each: { remote: { label: 'GitHub link', on: 'Shown at the top of source control.', off: 'Hidden. Right-click the source control bar to show it again.' }, check: { label: 'Remote check', on: 'Shown at the top of source control.', off: 'Hidden. Right-click the source control bar to show it again.' }, pull: { label: 'Pull and push', on: 'Shown at the top of source control.', off: 'Hidden. Right-click the source control bar to show it again.' }, sync: { label: 'Sync and publish', on: 'Shown for a branch that has no upstream yet.', off: 'Hidden. Right-click the source control bar to show it again.' }, ai: { label: 'Write the message button', on: 'The ✦ is shown beside the message.', off: 'Hidden. Right-click the source control bar to show it again.' }, model: { label: "Writing model's name in the message box", on: 'The name is shown at the bottom of the message box, while ✦ is shown.', off: 'Hidden. Right-click ✦ to pick another agent or model.' }, push: { label: 'Commit & push button', on: 'Commit & push is shown beside commit.', off: 'Hidden. Right-click the source control bar to show it again.' }, last: { label: 'Amend and undo last commit', on: 'Both are shown under the message.', off: 'Hidden. Right-click the source control bar to show it again.' }, who: { label: 'Chat that changed a file', on: 'Shown beside each changed file.', off: 'Hidden. Right-click the source control bar to show it again.' }, history: { label: 'History', on: 'Shown under the changes.', off: 'Hidden. Right-click the source control bar to show it again.' }, stashes: { label: 'Stashes', on: 'Shown under the changes.', off: 'Hidden. Right-click the source control bar to show it again.' }, parts: { label: 'Commit part of a file', on: 'Shown in a file\'s diff.', off: 'Hidden. Right-click the source control bar to show it again.' }, pr: { label: 'Pull request', on: 'Shown at the top of source control.', off: 'Hidden. Right-click the source control bar to show it again.' } }, label: (x: string) => `${x} in source control`, off: 'Hidden. Right-click the source control bar to show it again.' },
  'setup:off': { def: [], box: 'show', part: 'files', menu: 'setup', tips: { tag: 'Whether each row is used in every project (global) or in this one only (project). Its tooltip says it either way.', count: 'How many rows each section\'s head holds.', add: 'A new rule, memory or skill.', clear: 'All of this project\'s memory goes to the archive. It asks first. Each memory\'s × removes it either way.', account: 'The Claude account in use: its name, its folder and what it shares with the main account. Only for Claude.' }, items: [['tag', 'global or project on each row'], ['count', 'how many in each section'], ['add', 'new'], ['clear', 'clear memory'], ['account', 'which Claude account is in use']], each: { tag: { label: 'Global or project on each row', on: 'Shown on each row.', off: 'Hidden. Right-click the agent setup bar to show it again.' }, count: { label: 'How many in each section', on: 'Shown on each section\'s head.', off: 'Hidden. Right-click the agent setup bar to show it again.' }, add: { label: 'New buttons', on: 'The + is shown on each section\'s head.', off: 'Hidden. Right-click the agent setup bar to show it again.' }, clear: { label: 'Clear memory button', on: 'Shown on memory.', off: 'Hidden. Right-click the agent setup bar to show it again.' }, account: { label: 'Which Claude account is in use', on: 'Shown at the top.', off: 'Hidden. Right-click the agent setup bar to show it again.' } }, label: (x: string) => (x === 'new' ? 'new buttons' : x === 'clear memory' ? 'clear memory button' : x) + ' in agent setup', off: 'Hidden. Right-click the agent setup bar to show it again.' },
  'wsx:off': { def: [], box: 'show', part: 'files', menu: 'wsx', tips: { new: 'Makes a new file in the workspace\'s folder.', dir: 'Makes a new folder in the workspace\'s folder.', fold: 'Closes every open folder in the list.', load: 'Reads the folder again, to show files changed outside the app.' }, items: [['new', 'new file'], ['dir', 'new folder'], ['fold', 'fold all'], ['load', 'refresh']], each: { new: { label: '+ file button', on: 'Shown in the workspace explorer\'s head.', off: 'Hidden. Right-click the workspace explorer\'s head to show it again.' }, dir: { label: '+ folder button', on: 'Shown in the workspace explorer\'s head.', off: 'Hidden. Right-click the workspace explorer\'s head to show it again.' }, fold: { label: 'Fold button', on: 'Shown in the workspace explorer\'s head.', off: 'Hidden. Right-click the workspace explorer\'s head to show it again.' }, load: { label: 'Refresh button', on: 'Shown in the workspace explorer\'s head.', off: 'Hidden. Right-click the workspace explorer\'s head to show it again.' } }, label: (x: string) => `${x} in the workspace explorer`, off: 'Hidden. Right-click the workspace explorer\'s head to show it again.' },
  'barmenu:open': { def: true, box: 'show', part: 'all', label: "Open on a button's row in right-click menus", on: "Point at a button's row in a bar's right-click menu, and open shows at its end.", off: 'No open. To use a hidden button, tick it to show it, then click it in its bar.', desc: 'Open uses that button from the menu, even while the button is hidden from its bar.' },
  'edfoot:off': { def: [], box: 'show', part: 'edit', menu: 'edfoot', items: [['tab', 'tab'], ['wide', 'wide']], tips: { tab: 'Opens what the editor shows here, the scratch pad, the sketch board, a file or a board, in a tab of its own.', wide: 'The board takes the whole screen. Click it again for its usual size.' }, each: { tab: { label: "⇥ tab button", on: "Shown in the bar under the scratch pad and the sketch board.", off: "Hidden. Right-click the bar under them to show it again." }, wide: { label: "Wide button", on: "Shown in the bar under a board that is open outside a tab.", off: "Hidden. Right-click the bar under the board to show it again." } }, label: (x: string) => x, off: 'Hidden. Right-click the bar to show it again.', redraw: 'layout' },
  'gh:notify': { def: true, box: 'show', part: 'files', label: 'Pull request notifications', on: 'A notification when checks finish, a review comes in or a pull request merges, and when someone asks you for a review.', off: 'No notifications. The GitHub view and the source control chip still show it all.', desc: 'Only for your own pull requests and reviews asked of you.' },
  'git:worktrees': { def: true, box: 'show', part: 'files', label: 'Worktrees list', on: 'The list is shown in source control.', off: 'No list. The worktrees stay on disk.', desc: "The project's worktrees: other folders with a branch of their own." },
  'filestyle:on': { def: true, box: 'show', part: 'files', label: 'Colour and mark on files and folders', on: 'Marks show on files and folders, and their right-click menu has colour and mark.', off: 'No marks, and no colour and mark in the right-click menu. Colours you already gave still show. Nothing is deleted: turn it back on and every mark is back.', desc: 'Right-click a file or folder to give it a colour or a mark, so you find it at a glance. The mark also shows on its tab.', redraw: 'render' },
  agentMarks: { def: true, box: 'show', part: 'files', label: 'Agent marks on files', on: "A file an agent reads has the agent's name beside it, and the @ list puts those files first.", off: 'No marks, and the @ list keeps its plain order. The agents still read the same files.', desc: 'A file Claude, Codex or Antigravity reads for its instructions, skills or settings, such as CLAUDE.md.', redraw: 'render' },
  'tabdirty:on': { def: true, box: 'show', part: 'files', label: '* on a tab until the file is saved', on: 'A file you changed has * on its tab until it is saved.', off: 'No * on the tab. The dock still says not saved.', desc: 'Files save as you type. The * shows the few moments before a file is saved.', redraw: 'render' },
  'wspage:off': { def: [], box: 'show', part: 'pages', menu: 'wspage', items: [['desc', 'description'], ['note', 'workspace.md'], ['newpj', 'new project'], ['head', 'column titles'], ['folder', 'folder column'], ['eye', 'in the dock']], tips: { desc: 'What the workspace is for, in one line you write yourself.', note: "A note for the whole workspace. It is the file workspace.md in the workspace's folder.", newpj: 'Adds a project to this workspace.', head: 'The line above the projects that names their columns.', folder: 'Where the project is on your disk.', eye: 'A project hidden from the dock stays in the workspace.' }, each: { desc: { label: 'Workspace description', on: "The workspace's description shows under its name. Click it to write it.", off: 'Hidden. The description is kept. Right-click the page to show it again.' }, note: { label: 'workspace.md note', on: 'The workspace.md note shows beside the projects, with edit to change it.', off: "Hidden. The file stays in the workspace's folder. Right-click the page to show it again." }, newpj: { label: 'New project button', on: 'The button is shown above the projects.', off: 'Hidden. Right-click the page to show it again.' }, head: { label: 'Column titles over the projects', on: 'The titles show above the projects.', off: 'No titles. The projects show the same.' }, folder: { label: 'Folder under each project', on: 'Each project shows its folder under its name.', off: 'Hidden. Point at a project to see its folder.' }, eye: { label: 'Eye that hides a project from the dock', on: 'Point at a project, and an eye at its right end hides it from the dock or shows it there.', off: 'No eye. Right-click a project to choose which projects show in the dock.' } }, label: (x: string) => x, off: 'Hidden. Right-click the page to show it again.', redraw: 'render' },
  'launch:off': { def: [], box: 'show', part: 'pages', menu: 'launch', items: [['pin', 'pin']], tips: { pin: 'Without a pin, the workspace you opened last comes first.' }, each: { pin: { label: 'Pin on a workspace tile', on: "Point at a workspace's tile, and a pin at its top right keeps it in its place.", off: 'No pin. Pinned workspaces keep their place, the others move with the last opened. Right-click the launch screen to show it again.' } }, label: (x: string) => x, off: 'Hidden. Right-click the launch screen to show it again.', redraw: 'render' },
  'palette:chats': { card: 'Ctrl p', desc: 'Ctrl p opens the box that finds anything by typing a few letters of it.', def: true, box: 'show', part: 'all', label: 'Chats in ctrl p', on: 'Ctrl p lists open chats first, and finds chats by code, title or what was said.', off: 'Ctrl p finds files and commands only. The @ list and earlier chats still find chats.' },
  'deck:rowCode': { desc: 'The short code that names a terminal, in its color. Ctrl p finds it by it.', def: true, box: 'show', part: 'list', label: "Terminal's code", on: "Each row starts with the terminal's code, like T07.", off: "No code in the rows. The terminal's header still shows it.", redraw: 'render' },
  'deck:title2': { desc: "For terminals whose titles are too long for one line. A terminal's title is what the program in it calls itself.", def: true, box: 'show', part: 'list', label: 'Long titles on two lines', on: 'A long title wraps onto a second, smaller line.', off: 'Each title is one line, cut with …. Point at the row to read all of it.', blocked: ['deck:rowInfo', 'Not used while the program and last line show under each title: the second line is theirs.'], redraw: 'render' },
  'deck:rowInfo': { desc: 'The last line is what the terminal last reported, like finished or exit 1. It is empty while the terminal works. While this is on, long titles stay on one line.', def: false, box: 'show', part: 'list', label: 'Program and last line under each title', on: 'Each row has a second line: what runs in the terminal, like claude or shell, then the last line it sent.', off: "Each row shows only the terminal's title.", redraw: 'render' },
  winSize: { def: true, box: 'show', part: 'quick', places: ['quick', 'qagent', 'scratch', 'sketch', 'inbox', 'qterm', 'pwsh', 'hitch', 'activity', 'review', 'ue', 'win2'], menu: ['size', 'qagent'], label: 'Size buttons', item: 'size', on: 'The buttons are shown.', off: 'The buttons are hidden. Dragging an edge still resizes the window.', desc: 'Shows the buttons that make the window a quarter of the screen, half of it, or full size. Dragging an edge resizes it either way.' },
  'qagent:new': { def: true, box: 'show', part: 'quick', menu: 'qagent', label: '+ New chat button', item: 'new chat', on: 'The button is shown.', off: 'The button is hidden. Close the chat to start a new one.', desc: 'Shows + in the Quick Agent, which starts a fresh chat. The one you had moves to Orchestration and keeps running.' },
  'win:every': { def: true, desktop: true, box: 'show', part: 'win2', menu: 'size', label: '"Keep this window when you switch projects" button', item: 'keep this window when you switch projects', on: 'The button is shown.', off: 'The button is hidden. A key for it can be set in Settings, Keys.', desc: 'Shows the button that keeps Window 2 when the main window switches project. Window 2 belongs to its project and hides until you come back. Click the button and it stays, click again and it belongs to its project again.' },
  'marks:names': { def: ['', '', '', '', '', ''], redraw: 'render' },
  'deck:foldOrder': { def: ['spot', 'mark', 'pin', 'pills', 'bench', 'set', 'tab'] },
  'newtab-hidden': { def: ['mind', 'board', 'txt', 'open', 'list', 'archive', 'scratch', 'sketch', 'codex', 'antigravity', 'cursor', 'copilot', 'grok'], box: 'show', part: 'pages', menu: 'tiles', tips: { md: 'It makes a new markdown file in this group.', text: 'It makes a new file in this group: any name, any extension.', browser: 'A website in a tab: a local server or any address.', ai: 'An AI agent that works in this project with you.', term: 'A terminal in the project folder.', mind: 'The web of everything here.', board: 'It makes a new board to draw on in this group.', txt: 'It makes a new text file in this group.', open: 'Any file on this PC, left where it is.', list: 'Everything, as boxes of rows.', archive: 'Archived things, to bring back.', scratch: 'One plain text that is always there.', sketch: 'A board to paint on and drop images onto.', codex: 'Codex in this project, with its own account and permissions.', antigravity: 'Antigravity in this project, with its own account and permissions.', cursor: 'Cursor in this project, with its own account and permissions.', copilot: 'GitHub Copilot in this project, with its own account and permissions.', grok: 'Grok in this project, with its own account and permissions.', more: 'Which tiles this group shows.' }, each: { md: { label: '.md file tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, text: { label: 'File tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, browser: { label: 'Browser tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, ai: { label: 'Claude Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, term: { label: 'Terminal tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, mind: { label: 'Mind tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, board: { label: 'Board tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, txt: { label: '.txt file tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, open: { label: 'Open a file tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, list: { label: 'List tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, archive: { label: 'Archive tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, scratch: { label: 'Scratch tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, sketch: { label: 'Sketch tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, codex: { label: 'Codex Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, antigravity: { label: 'Antigravity Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, cursor: { label: 'Cursor Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, copilot: { label: 'Copilot Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, grok: { label: 'Grok Agent tile', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.' }, more: { label: '⋯ at the end of the tiles', on: '⋯ ends the tiles. It opens the list of tiles to choose from.', off: 'No ⋯. Right-clicking the page still opens the list.' } }, label: 'New tab tiles', on: 'The tile is on the page.', off: 'Not on the page. Right-click the page, or click ⋯, to put it back.', redraw: 'render' },
  'act:off': { tips: { "explorer": "Shows the explorer button: the project's files and folders. ctrl e opens the explorer either way.", "git": "Shows the source control button: commit, push and switch branches. ctrl shift g opens it either way.", "github": "Shows the GitHub button: the project's pull requests and issues.", "agent setup": "Shows the agent setup button: the skills, memory and instructions each agent uses in this project.", "site": "Shows the site button: the project's site, its pages and how it builds." }, def: ['site'], menu: 'strip', items: [['explorer', 'explorer'], ['git', 'source control'], ['github', 'GitHub'],['agent setup', 'agent setup'], ['site', 'site']], label: (x: string) => `${x} in the rail`, on: 'The button is shown.', off: 'The button is hidden. Right-click the rail to show it again.', each: {
    explorer: { label: 'Explorer button', on: 'The button is shown.', off: 'The button is hidden.{explorerKey: Its key, %, still opens the explorer.}' },
    git: { label: 'Source control button', on: 'The button is shown.', off: 'The button is hidden.{gitKey: Its key, %, still opens source control.}' },
    github: { label: 'GitHub button', on: 'The button is shown.', off: 'The button is hidden. Right-click the rail to show it again.' },
    'agent setup': { label: 'Agent setup button', on: 'The button is shown.', off: 'The button is hidden. Right-click the rail to show it again.' },
    site: { label: 'Site button', on: 'The button is shown.', off: 'The button is hidden. Right-click the rail to show it again.' },
  } },
  modesHidden: { def: ['term'], menu: 'modes', items: [['editor', 'editor'], ['orch', 'orchestration'], ['term', 'terminals']], on: 'The button is shown.', off: 'The button is hidden.', tips: { editor: 'The editor: the explorer and your tabs. Its key again goes to the next layout. Right-click it for a new layout.', orch: 'Orchestration shows one chat at a time.', term: 'Terminals shows every terminal at once. Right-click it for another set.' }, each: {
    editor: { label: 'Editor button', on: 'The button is shown.', off: '', fixed: "Always shown. The editor is where your files and tabs are, so its button can't be hidden." },
    orch: { label: 'Orchestration button', on: 'The button is shown.', off: 'The button is hidden, except while you are in orchestration.{modeOrch: Its key, %, still opens it.}' },
    term: { label: 'Terminals button', on: 'The button is shown.', off: 'The button is hidden, except while you are in terminals.{modeTerm: Its key, %, still opens it.}' },
  } },
  'rail:right': { def: false, box: 'show', part: 'top', label: 'Edge the rail sits at', on: 'The rail is at the right edge of the window. The explorer opens from the same side.', off: 'The rail is at the left edge of the window. The explorer opens from the same side.', desc: 'You can also drag an empty spot of the rail to the other edge.', redraw: 'layout' },
  'explorer:side': { def: '', quiet: true, redraw: 'layout' },
  'dash:on': { def: true, box: 'show', part: 'top', label: 'Dashboard', on: 'The dashboard is shown above the windows.', off: 'The dashboard is hidden, with the buttons in it.{dashKey: % shows it again.} New agent is still in the agents list{newAgentKey: and on %}.', desc: 'A row above the windows with the buttons you keep near the top, such as New agent.' },
  'switch:wkOn': { def: true, box: 'show', part: 'top', menu: 'modes', label: 'Working mark on the other mode buttons', item: 'working mark on the other mode buttons', on: 'The other mode buttons show the working mark in their corner while a chat or terminal in them works.', off: 'No working mark on the other mode buttons. The counts still show.', desc: 'The working mark in the corner of orchestration and terminals, and of each terminal set button, while a chat or terminal in it works. The counts show either way.', redraw: 'render' },
  edWork: { def: true, box: 'show', part: 'top', menu: 'modes', label: 'Working mark on the mode buttons', item: 'working mark on the editor buttons', on: 'Mode buttons show the working mark in their corner while a chat or terminal in them works.', off: 'No working mark on the mode buttons. The counts still show.', desc: "The working mark is the one picked in Agents and chat, Providers and tools. It sits in the bottom-right corner of a mode button while a chat or terminal in it works. On the editor buttons it means a chat in one of that layout's tabs is working. The counts in the top corner, such as 2 finished, show either way.", redraw: 'render' },
  'quick:pins': { def: [], quiet: true, items: [['folder', 'folder'], ['file', 'file'], ['md', '.md file'], ['txt', '.txt file'], ['board', 'board'], ['term', 'terminal'], ['browser', 'browser'], ['project', 'project'], ['clone', 'project from git']], on: 'Pinned under new in the rail.', off: 'Not pinned.', tips: {
    folder: 'Makes a new folder. With a folder selected, it makes a subfolder in it. Or drag the button onto the place it should go.',
    file: 'Makes a new file with any name and extension. Or drag the button onto the place it should go.',
    md: 'A new markdown file. Or drag the button onto the place it should go.',
    txt: 'A new text file. Or drag the button onto the place it should go.',
    board: 'A new board to draw on. Or drag the button onto the place it should go.',
    term: 'A terminal in the project folder.',
    browser: 'A website in a tab: a local server or any address.',
    project: 'A folder you work in, with its own tabs, chats and terminals, added to this workspace.',
    clone: 'A copy of a repository: an address, or one of yours on GitHub.',
  }, each: {
    folder: { label: 'New folder', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
    file: { label: 'New file', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
    md: { label: 'New .md file', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
    txt: { label: 'New .txt file', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
    board: { label: 'New board', on: 'Pinned under new in the rail.', off: 'Not pinned.' },
    term: { label: 'New terminal', on: 'Pinned under new in the rail.', off: 'Not pinned.' },
    browser: { label: 'New browser', on: 'Pinned under new in the rail.', off: 'Not pinned.' },
    project: { label: 'New project', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
    clone: { label: 'New project from git', on: 'Pinned under new in the rail.', off: 'Not pinned. New still makes one.' },
  } },
  'pins:on': { def: false, local: true },
  inboxShortcut: { def: true, box: 'show', part: 'files', menu: 'explorer', label: "Inbox button on the project's row", item: 'inbox', on: "The button is shown at the right of the project's row.", off: 'No inbox button. The INBOX is still at the end of the tree.', desc: 'Shows the files in the inbox.', redraw: 'renderTree' },
  foldAll: { def: true, box: 'show', part: 'files', menu: 'explorer', label: 'Collapse all button', item: 'collapse all', on: "The button is shown in the explorer's head.", off: 'No collapse all button. Each folder still collapses by its arrow.', desc: 'Closes every folder in the explorer. When all are closed, it reads expand all and opens them.', redraw: 'renderTree' },
  focusBtn: { def: true, box: 'show', part: 'files', menu: 'explorer', label: 'Focus button', item: 'focus', on: "The button is shown in the explorer's head.", off: "No focus button. Focus is still in a folder's right-click menu.", desc: 'Shows only the selected folder in the explorer. Click it again to show everything.', redraw: 'renderTree' },
  'explorer:guides': { def: false, box: 'show', part: 'files', menu: ['explorer', 'wsx'], places: ['explorer', 'wsx'], label: 'Lines that show how folders nest', item: 'lines show how folders nest', on: 'Lines are drawn in the explorer and the workspace explorer.', off: 'No lines. Folders still indent.', desc: 'Draws a line down from each open folder, beside its files.' },
  'side:follow': { card: 'files', def: false, box: 'files', label: 'Explorer open or closed the same in every tab', on: 'Opening or closing the explorer once does the same in every tab, layout and project.', off: 'Each tab, layout and project keeps the explorer open or closed on its own.', desc: "The explorer's right-click menu has this switch too, with the same words." },
  'side:over': { def: [], redraw: 'layout' },
  'explorer:linkDock': { card: 'files', def: true, box: 'files', label: 'Open the docked explorer when a link opens a file', on: 'The explorer opens and shows the file.', off: 'The explorer stays closed. The file is selected in it, and the explorer shows it when you open it.', desc: 'For a file link in a chat, or a file you pick in search, while the explorer is a column beside the page. When this is on, the explorer opens on the file. When it is off, the explorer stays closed, and the file is selected in it for when you open it.' },
  'explorer:linkOver': { card: 'files', def: false, box: 'files', label: 'Open the explorer on top when a link opens a file', on: 'The explorer opens on top of the page and shows the file.', off: 'The explorer stays closed. The file is selected in it, and the explorer shows it when you open it.', desc: 'For a file link in a chat, or a file you pick in search, while the explorer opens on top of the page. When this is on, the explorer opens on the file. When it is off, the explorer stays closed, and the file is selected in it for when you open it.' },
  'explorer:ext': { card: 'files', desc: "The same in the workspace explorer and ctrl p. The explorer's right-click menu has this choice too.", def: 'dim', box: 'files', label: 'File extensions in the explorer', choices: [
    ['dim', 'Dimmed', 'The extension is fainter than the name.'],
    ['plain', 'Plain', 'The extension looks like the rest of the name.'],
    ['color', 'Coloured', 'Each extension is in its own colour, set below. One without a colour is dimmed.'],
  ] },
};
export const PLACES: Record<string, [string, string, string]> = {
  win: ['a chat window', 'In a chat window', 'the chats in a set, side by side, and a chat opened as a tab'],
  oc: ['orchestration', 'In orchestration', "the chat you open from orchestration's list"],
  qagent: ['the Quick Agent', 'The Quick Agent', 'the small chat window from the Quick Agent button in the rail'],
  quick: ['the Quick Window', 'The Quick Window', 'where a file opens when you pick "open in the Quick Window" in its right-click menu'],
  scratch: ['the scratch pad', 'The scratch pad', 'from its button in the rail'],
  sketch: ['the sketch board', 'The sketch board', 'from its button in the rail'],
  inbox: ['the inbox', 'The inbox', 'from its button in the rail'],
  qterm: ['the quick terminal', 'The quick terminal', 'from its button in the rail'],
  pwsh: ['quick PowerShell', 'Quick PowerShell', 'from its button in the rail'],
  hitch: ['the freeze log', 'The freeze log', 'from its button in the dock'],
  activity: ['Agent activity', 'Agent activity', "from the Agent activity button in a chat's header"],
  review: ['Review', 'Review', "from the ± review button in a chat's header"],
  ue: ['the Unreal build window', 'The Unreal build window', 'from the build window button in the rail'],
  win2: ['Window 2, 3…', 'Window 2, Window 3 and so on', 'what "new window" in the rail opens: another window of this Amethyst, for example for a second screen'],
  head: ["every chat's header", "Every chat's header", 'in an editor chat tab, orchestration and the Quick Agent'],
  menu: ["the chat's ⋯ menu", "The chat's ⋯ menu", "from ⋯ in the chat's header"],
  box: ["every chat's box", "Every chat's box", 'where you type, under the messages of every chat, in a chat window, orchestration and the Quick Agent'],
  sel: ['a reply', 'Over text you select in a reply', 'drag over some words the agent wrote'],
  scroll: ['the scrollbar', "On the chat's right edge", 'once the chat is long enough to scroll'],
  cmd: ["a command's box", "In a command's box in the messages", 'when the agent runs a command, like a build or a test'],
  comp: ['the messages', 'In the messages', 'where the chat was compacted, once it got full'],
  notice: ['the messages', 'In the messages', 'where the agent sent the notice'],
  time: ['a message', 'On a message', 'when you point at one of your messages or an answer'],
  up: ['the chat', "The chat's top right corner", 'once a message starts above what you see'],
  hold: ['the messages', 'In the messages', 'while the agent writes an answer taller than the chat'],
  edits: ['above the chat box', 'Above the chat box', 'once the chat has changed files'],
  art: ['an Antigravity chat', 'At the top of an Antigravity chat', 'once it has made files for you to look at'],
  orch: ['Orchestration', 'Orchestration', "the list beside the chat you have open, from Orchestration's button in the rail"],
  terms: ['Terminals mode', 'Terminals mode', "the list beside your terminals, from Terminals mode's button in the rail"],
  marks: ['every chat', 'Everywhere a chat shows', 'the agents list, every chat header and orchestration'],
  ctrlp: ['ctrl p', 'Ctrl p', 'the box that finds files, commands and chats'],
  dash: ['the dashboard', 'The dashboard', 'the row above the windows. Only Window 1 has one.{dashKey: % shows or hides it.}'],
  top: ['the rail', 'The rail', 'down the edge of the main window it sits at. Only Window 1 has one'],
  make: ['new and its pins', 'New and its pins', "in the rail, with every button new can pin under it. Dashed ones aren't pinned"],
  edbtn: ['the editor buttons', 'The editor buttons', 'the editor button and each layout button, in the rail'],
  modebtn: ['the other mode buttons', 'The other mode buttons', 'orchestration and terminals, and each terminal set button, in the rail'],
  dbg: ['the debug column', 'The debug column', 'on the right of the editor while you debug'],
  dock: ['the dock', 'The dock', 'along the bottom of the main window'],
  'g-x': ['the window bar', 'The window bar', 'at the top of each main window'],
  'g-icon': ["Amethyst's icon", "Amethyst's icon", 'the same icon sits in the tray'],
  'g-list': ['the list', 'The list as it comes up', 'at the bottom right of the window'],
  'g-col': ["don't forget's window", "Don't forget's window", 'one note of each color'],
  'g-timer': ['the timer', 'The timer', 'in the dock'],
  'lk-accent': ['a picked button', 'A picked button', 'in the accent colour'],
  'lk-bar': ['the title bar', 'The title bar', 'at the top of each window'],
  'lk-corners': ['two buttons', 'Two buttons', 'with rounded and with square corners'],
  ugauge: ['the gauge', 'The gauge', 'in the dock'],
  ubars: ['two bars', 'Two bars', 'in the dock'],
  ubtn: ['the usage button', 'The usage button in the dock', 'with two bars'],
  uwin: ['the usage window', 'The usage window', 'click the usage button in the dock'],
  uacct: ['the accounts menu', 'The accounts menu', 'click the account in the usage window. The pane at its foot'],
  clips: ['the clips window', 'The clips window', 'click the clips button in the dock'],
  fgwin: ["don't forget", "Don't forget", 'click the ! in the dock'],
  explorer: ['the explorer', 'The explorer', 'beside the editor.{explorerKey: % shows or hides it.}'],
  wsx: ['the workspace explorer', 'The workspace explorer', "on a workspace's page"],
  tabbar: ['the tab bar', 'The tab bar', 'of a group of tabs in the editor'],
  txbar: ["a file's bar", "A file's bar", 'under the tab bar'],
  scm: ['source control', 'Source control', 'in the side panel: the git button in the activity bar'],
  diff: ["a file's diff", "A file's diff", 'click a changed file in source control. The bar under each changed part'],
  ghnote: ['a notice', 'A notice', 'at the bottom right of the window. While the app is in the background it is a Windows notification instead'],
  setup: ['agent setup', 'Agent setup', 'in the side panel: the agent setup button in the activity bar'],
  archive: ['the archive', 'The archive', 'press 4, or pick archive in a new tab'],
  ibwin: ['the inbox window', 'The inbox window', '{inboxKey:%, or }the inbox button in the rail'],
  chatlk: ['a chat', 'A chat', "an agent's answer. File links are the grey ones with a file icon"],
  chipbox: ['the scratch pad', 'The scratch pad', 'a text box. The scratch pad button in the rail opens it{scratch:, and so does %}. The chat box shows chips the same way'],
  board: ['the sketch board', 'The sketch board', 'the sketch board button in the rail. Its toolbar floats at the bottom of the board'],
  sfoot: ['the scratch pad', 'The scratch pad', 'the bar under it'],
  kfoot: ['the sketch board', 'The sketch board', 'the bar under it'],
  wfoot: ['a board', 'A board', 'open outside a tab: the bar under it'],
  ssel: ['the scratch pad', 'The scratch pad', 'with text selected. + file and + chat sit beside the formatting bar'],
  fmtsel: ['the scratch pad', 'The scratch pad', 'with text selected. A file shows the same bar'],
  fsel: ['a file', 'A file', 'with text selected. Its bar sits beside the formatting bar. A terminal shows the same bar'],
  brbar: ["a browser tab's bar", 'A browser tab', 'its bar, at the top of the tab'],
  bmenu: ["a bar's right-click menu", "A bar's right-click menu", "here the browser tab's bar. The pointer is on the paint row"],
  cmenu: ['a color menu', 'A color menu', 'right-click a file or a folder, then color'],
  wspage: ["a workspace's page", "A workspace's page", 'click a workspace on the launch screen'],
  launch: ['the launch screen', 'The launch screen', 'click all workspaces at the left end of the dock'],
  newtab: ['the new tab page', 'The new tab page', 'click + at the end of the tabs'],
  web: ['the mind web', 'The mind web', 'a mind tab. Its bar, at the bottom right'],
  setfind: ['Settings', 'Settings', 'its side, above the sections'],
  setchg: ['Settings', 'Settings', 'a section with a setting you changed'],
  tellcard: ['the app', 'A notice', 'a tab dropped into a window of another project'],
  editmenu: ['the right-click menu', 'The right-click menu', 'right-click selected text or a text box'],
};
export const BTN_OF: Record<string, string> = {
  'bar:off:usage': '#st-usage', 'bar:off:timer': '#btn-timer', 'bar:off:windows': '#aw-dock', 'bar:off:update': '#st-update', 'bar:off:hitch': '#st-hitch', 'bar:off:clips': '#btn-clips', 'bar:off:keys': '#btn-keys', 'forget:on': '#fg-btn',
  'act:off:explorer': '#btn-index', 'act:off:git': '#btn-git', 'act:off:github': '#btn-github', 'act:off:agent setup': '#btn-setup', 'act:off:site': '#btn-site',
  'hgbar:off:file': '[data-hgdir]', 'hgbar:off:snaps': '[data-hgsnap]',
  'pad:off:move': '[data-pd="move"]', 'pad:off:paint': '[data-pd="paint"]', 'pad:off:bg': '[data-pd="bg"]',
  'fmt:off:bold': '[data-fmt="bold"]', 'fmt:off:italic': '[data-fmt="italic"]', 'fmt:off:strike': '[data-fmt="strike"]', 'fmt:off:code': '[data-fmt="code"]', 'fmt:off:link': '[data-fmt="link"]', 'fmt:off:file': '#ed-split', 'fmt:off:chat': '#ed-chat',
  'txbar:off:preview': '.tx-pv', 'txbar:off:move': '.tx-move',
  'tbar:off:split': '[data-split="row"]', 'tbar:off:gclose': '[data-gclose]',
  'br:off:inspect': '[data-br="inspect"]', 'br:off:paint': '[data-br="paint"]', 'br:off:to': '[data-br="to"]', 'br:off:zoom': '.br-zoom',
  'debug:off:over': '[data-dbtn="over"]', 'debug:off:into': '[data-dbtn="into"]', 'debug:off:out': '[data-dbtn="out"]', 'debug:off:stop': '[data-dbtn="stop"]', 'debug:off:restart': '[data-dbtn="restart"]', 'debug:off:more': '[data-dbtn="more"]',
  'ue:off:editor': '[data-ue="editor"]', 'ue:off:play': '[data-ue="play"]', 'ue:off:more': '[data-ue="more"]', 'ue:off:refresh': '[data-ue="refresh"]', 'ue:off:asfile': '[data-ue="asfile"]',
  'chpill:off:history': '.ch-pill[data-ch="history"]', 'chpill:off:signin': '.ch-pill[data-ch="signin"]', 'chpill:off:clear': '.ch-pill[data-ch="clear"]', 'chpill:off:swap': '.ch-pill[data-ch="swap"]',
  'edits:head': '.ch-rev', 'subagents:chat': '.ch-subs', 'chat:worktree': '.ch-wt', 'chat:mic': '.ch-mic',
  'chrow:off:attach': '.ch-attach', 'chrow:off:usage': '.ch-usage', 'chrow:off:mode': '.ch-mode',
  'deck:spotBtn': '[data-dk-spot]', 'deck:markBtn': '[data-dk-mark]:not(.mk-sign)', 'deck:markShow': '.dk-ch .mk-sign', 'deck:reportBtn': '[data-dk-report]', 'deck:noteBtn': '[data-dk-note]:not(.nt-sign)', 'deck:noteShow': '.dk-ch .nt-sign', 'deck:pinBtn': '[data-dk-pin]', 'deck:benchBtn': '[data-dk-bench]', 'deck:setBtn': '[data-dk-set]', 'deck:orchBtn': '[data-dk-orch]', 'deck:tabBtn': '[data-dk-tab]', 'deck:closeBtn': '[data-dk-out]', 'deck:more': ':is(.ch-more, [data-dk-fmore])',
  'scm:off:sync': '[data-gact="sync"]', 'scm:off:check': '.sc-chk', 'scm:off:pull': '.sc-io', 'scm:off:last': '.sc-last', 'scm:off:who': '.sc-by', 'scm:off:history': '.sc-hh', 'scm:off:stashes': '.sc-sh, .sc-sts', 'scm:off:parts': '.df-part', 'scm:off:pr': '.sc-pr', 'scm:off:ai': '[data-gact="ai"]', 'scm:off:model': '.sc-mod', 'scm:off:push': '[data-gact="push"]', 'scm:off:remote': '.sc-remote',
  'wsx:off:new': '[data-wxnew]', 'wsx:off:dir': '[data-wxdir]', 'wsx:off:fold': '[data-wxfold]', 'wsx:off:load': '[data-wxload]',
  'edfoot:off:tab': '#ed-tab', 'edfoot:off:wide': '#ed-wide', 'wspage:off:newpj': '.st-newg', 'wspage:off:eye': '[data-pjeye]', 'launch:off:pin': '.wt-pin',
  'web:off:undo': '[data-web="undo"]', 'web:off:reset': '[data-web="reset"]', 'web:off:fit': '[data-web="fit"]', 'web:off:home': '[data-web="home"]',
  'usage:dashBtn': '.uw-dash', 'usage:popBtn': '.uw-pop', 'clips:add': '[data-cl-add]', 'settings:find': '#set-find-at',
  'forget:popBtn': '[data-fgpop]', 'forget:info': '[data-fginfo]', 'forget:setBtn': '[data-fgset]',
  'inboxShortcut': '.ib-go', 'setup:off:add': '.su-add', 'setup:off:clear': '.su-clear', 'inbox:off:new': '.fwi-new', 'archive:off:show': '.arc-disk',
  'orch:termBtn': '[data-oc-term]', 'orch:folderBtn': '[data-oc-folder]', 'orch:folders': '.oc-rail .cf-h', 'orch:newBtn': '.oc-rail [data-oc-new]', 'decklist:folders': '.dk-rail .cf-h', 'decklist:newBtn': '.dk-rail [data-oc-new]', 'orch:closeBtn': '.oc-bar [data-dk-out]', 'qagent:new': '[data-qanew]', 'win:every': '#win-every', winSize: '.szs', foldAll: '#tree-fold', focusBtn: '#tree-focus',
};

export const BAR_ORDER: Record<string, string[]> = {
  head: ['subagents:chat', 'edits:head', 'deck:spotBtn', 'deck:markBtn', 'deck:markShow', 'deck:reportBtn', 'deck:noteBtn', 'deck:noteShow', 'deck:pinBtn', 'deck:benchBtn', 'deck:setBtn', 'deck:orchBtn', 'deck:tabBtn', 'chpill:off:history', 'chpill:off:signin', 'chpill:off:clear', 'chpill:off:swap', 'deck:more', 'deck:closeBtn'],
};
BAR_ORDER.chrow = ['chrow:off:attach', 'chrow:off:usage', 'chat:worktree', 'chrow:off:mode', 'chat:mic'];
BAR_ORDER.ochead = [...BAR_ORDER.head, 'orch:folderBtn', 'orch:closeBtn', 'orch:termBtn'];
export const BAR_LAST: Record<string, string[]> = { head: ['deck:closeBtn'], ochead: ['orch:closeBtn', 'orch:termBtn'] };
export const BAR_SHARE: Record<string, string> = { ochead: 'head' };

export const MENUS: Record<string, string> = { inbox: 'inbox', archive: 'archive', edits: 'edits list', artifacts: 'artifacts bar', bar: 'dock', strip: 'strip', modes: 'modes', pad: 'sketch toolbar', fmt: 'formatting bar', quote: 'selection bar', txbar: 'file bar', drafts: 'rail', head: 'chat header', ochead: 'chat header', tiles: 'new tab', size: 'window', qagent: 'Quick Agent', forget: "don't forget", usage: 'usage window', clips: 'clips', settings: 'settings', hgbar: 'freeze log', ue: 'build window', browser: 'browser bar', tbar: 'tab bar', scm: 'source control', setup: 'agent setup', wsx: 'workspace explorer', web: 'mind web', chrow: 'chat box', edfoot: 'under the scratch pad and sketch board', wspage: 'workspace page', launch: 'launch screen', explorer: 'explorer', orch: 'Orchestration list', decklist: 'agents list' };

function valid(e: Pref, v: unknown): boolean {
  if (e.choices) return e.choices.some(([c]) => c === v);
  if (Array.isArray(e.def)) return Array.isArray(v) && v.every((x) => typeof x === 'string');
  if (e.places && v && typeof v === 'object') return Object.values(v).every((x) => typeof x === 'boolean');
  return typeof v === typeof e.def;
}
const PEEK = new Map<string, Set<string>>();
export function pref(key: string, place?: string): any {
  const v = saved(key, place), p = PEEK.get(key);
  return !p ? v : Array.isArray(v) ? v.filter((x) => !p.has(x)) : true;
}
export function peek(key: string, id: string, on: boolean) {
  const p = PEEK.get(key) || new Set<string>();
  if (on) p.add(id);
  else p.delete(id);
  if (p.size) PEEK.set(key, p);
  else PEEK.delete(key);
  const e = PREFS[key];
  if (e.redraw) (page[e.redraw] as () => void)?.();
  for (const fn of subs[key] || []) fn(pref(key));
}
export function saved(key: string, place?: string): any {
  const e = PREFS[key], v = store.get(key, null);
  if (e.fixed) return e.def;
  if (e.places) {
    const ok = v !== null && valid(e, v), at = (p: string) => (!ok ? e.def : typeof v === 'boolean' ? v : typeof v[p] === 'boolean' ? v[p] : e.def);
    return place ? at(place) : e.places.some(at);
  }
  return v !== null && valid(e, v) ? v : Array.isArray(e.def) ? [...e.def] : e.def;
}
export const placesOf = (key: string): string[] => PREFS[key].places || [];
export const prefAt = (key: string, place: string | null | undefined): boolean => !!(place && PREFS[key].places ? pref(key, place) : pref(key));
export function setAt(key: string, place: string | null | undefined, v: boolean) {
  const ps = PREFS[key].places;
  if (!ps || !place) return setPref(key, v);
  const now: Record<string, boolean> = Object.fromEntries(ps.map((p) => [p, !!saved(key, p)]));
  now[place] = v;
  setPref(key, ps.every((p) => now[p] === now[ps[0]]) ? now[ps[0]] : now);
}
export const wasSet = (key: string): boolean => store.get(key, null) !== null;

const subs: Record<string, ((v: any) => void)[]> = {};
export function onPref(key: string, fn: (v: any) => void): () => void {
  (subs[key] ||= []).push(fn);
  return () => (subs[key] = subs[key].filter((f) => f !== fn));
}
export const listeners = (key: string): number => subs[key]?.length ?? 0;
export function setPref(key: string, v: unknown) {
  const e = PREFS[key];
  if (!valid(e, v)) return;
  store.set(key, v);
  if (e.redraw) (page[e.redraw] as () => void)?.();
  for (const fn of subs[key] || []) fn(v);
}

addEventListener('storage', (e) => {
  const key = e.key?.startsWith('mind.') ? e.key.slice(5) : '', en = PREFS[key];
  if (!en) return;
  if (en.redraw) (page[en.redraw] as () => void)?.();
  for (const fn of subs[key] || []) fn(pref(key));
});

export const isOff = (key: string, id: string): boolean => pref(key).includes(id);
export const chatOn = (program: string): boolean => chatsOn().some(([k]) => k === program);
export const chatsOn = (): string[][] => {
  const off = pref('agents:off'), on = CHATS.filter(([k]) => !off.includes(k));
  return on.length ? on : CHATS.slice(0, 1);
};
export const termOn = (id: string): boolean => id === 'claude' || !CHATS.some(([k]) => k === id) || chatOn(id);
export const savedOff = (key: string, id: string): boolean => saved(key).includes(id);
export const setOff = (key: string, id: string, off: boolean) => setPref(key, saved(key).filter((x: string) => x !== id).concat(off ? [id] : []));
export const pillAt = (id: string): string => (id === 'swap' && isOff('chat:off', 'switch') ? 'hid' : isOff('chpill:off', id) ? 'menu' : 'head');
export function setPillAt(id: string, v: string) {
  setOff('chpill:off', id, v !== 'head');
  if (id === 'swap') setOff('chat:off', 'switch', v === 'hid');
}

const sorted = (v: string[]) => [...new Set(v)].sort().join();
const same = (e: Pref, v: any): boolean =>
  !Array.isArray(e.def) ? v === e.def : e.items || e.all ? sorted(v) === sorted(e.def) : JSON.stringify(v) === JSON.stringify(e.def);
export const isChanged = (key: string): boolean => (PREFS[key].places ? PREFS[key].places!.some((p) => pref(key, p) !== PREFS[key].def) : !same(PREFS[key], pref(key)));
export function resetPref(key: string) {
  const e = PREFS[key];
  store.del(key);
  if (e.redraw) (page[e.redraw] as () => void)?.();
  for (const fn of subs[key] || []) fn(pref(key));
}

if (store.get('wk:split', null) === null) {
  if (store.get('switch:wkOn', null) === false && store.get('edWork', null) === null) store.set('edWork', false);
  store.set('wk:split', true);
}
{
  const ws = store.get('wspage:off', null), gone = ['branch', 'changed', 'agents', 'opened'];
  if (Array.isArray(ws) && ws.some((x) => gone.includes(x))) store.set('wspage:off', ws.filter((x) => !gone.includes(x)));
}
