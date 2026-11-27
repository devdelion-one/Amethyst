import { esc, ago } from '../base/util.ts';
import { countMore, countNow, countTog, hasCount, setCount } from './count.ts';
import { licenseNow } from './license.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { At, Choice, Row } from './setstd.ts';
import { hasUpdate, setUp, updateCard, upNow } from './update.ts';

export const UPD_LEAD = 'Your version of Amethyst, how it gets updates, the install count and the license.';
export const DOCS_LEAD = 'Guides for Amethyst, its CLI and its MCP tools. Each one opens on GitHub in your browser.';

const SOURCE_URL = 'https://github.com/devdelion-one/Amethyst';
const DOCS_URL = `${SOURCE_URL}/blob/main/docs`;
const LICENSE_URL = 'https://amethyst.run/license';

const at = (key: string, o: Partial<At> = {}): At => ({ key, place: 'g-none', on: () => true, ...o });
const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const since = (ms: number) => {
  const m = Math.floor((Date.now() - ms) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${n(m, 'minute', 'minutes')} ago` : m < 24 * 60 ? `${n(Math.floor(m / 60), 'hour', 'hours')} ago` : ago(ms);
};

const LOOK_ON = 'Amethyst looks for updates when it opens, at noon and when you open Settings.', LOOK_OFF = 'Amethyst looks for updates only when you click check.';
const lookRow = (): Row => ({
  id: 'u:look', key: 'u:look', sw: 'onoff', plain: true, noPic: true,
  own: { label: 'Look for updates by itself', desc: 'You can always look now with the button on the card.', find: `check for updates ${LOOK_ON} ${LOOK_OFF}` },
  at: [at('u:look', { on: () => upNow().look, set: (v) => setUp({ look: v }), def: true })],
  state: () => (upNow().look ? LOOK_ON : LOOK_OFF), alt: () => (upNow().look ? LOOK_OFF : LOOK_ON),
  note: () => (upNow().checked ? `Last checked ${since(upNow().checked)}.` : ''),
  ctl: () => {
    const s = upNow();
    return s.status === 'ready' ? `<button class="chip" data-update="check" title="${esc(`Look again\nLooks for a newer version than Amethyst ${s.next}. If there is one, it downloads in its place.`)}"${s.looking ? ' disabled' : ''}>${s.looking ? 'looking…' : 'look again'}</button>` : '';
  },
  reset: () => setUp({ look: true }), changed: () => !upNow().look,
});
const AUTO: Choice[] = [
  ['click', 'When I click', 'An update waits for your click before it downloads.'],
  ['self', 'By itself', 'An update downloads by itself.'],
];
const autoRow = (): Row => ({
  id: 'u:auto', key: 'u:auto', plain: true, noPic: true,
  own: { label: 'Download updates', desc: 'Restarting to install is always your click.', find: 'download on click by itself' },
  at: [at('u:auto')],
  note: () => 'Restarting to install is always your click.',
  pick: { get: () => (upNow().auto ? 'self' : 'click'), set: (v) => setUp({ auto: v === 'self' }), def: 'click', reset: '', choices: () => AUTO },
  reset: () => setUp({ auto: false }), changed: () => upNow().auto,
});
const noticeRow = (): Row => ({
  id: 'update:notices', key: 'update:notices', sw: 'onoff', plain: true, noPic: true,
  at: [{ key: 'update:notices', place: 'g-none' }],
  note: () => 'The notice has a button to update or restart.',
});
const COUNT_ON = 'Once a day Amethyst tells amethyst.run it is running, with the version and four yes or no answers.', COUNT_OFF = 'Nothing is sent.';
const countRow = (): Row => {
  const dev = !!countNow()?.dev, on = () => countNow()?.on === true;
  return {
    id: 'u:count', key: 'u:count', sw: dev ? 'none' : 'onoff', plain: true, noPic: true, noReset: true,
    own: { label: 'Count this install', desc: 'Nothing about you, your projects or your files.', find: `count this install ${COUNT_ON} ${COUNT_OFF}` },
    at: [at('u:count', { on, set: (v) => void setCount({ on: v }), def: false })],
    state: () => (dev ? 'Only an installed Amethyst counts. This one runs from the code.' : on() ? COUNT_ON : COUNT_OFF), alt: () => (dev ? '' : on() ? COUNT_OFF : COUNT_ON),
    note: () => 'Nothing about you, your projects or your files. Details shows exactly what is sent.',
  };
};
const countHtml = () => (hasCount() && countNow() ? rowHtml(countRow()) + `<div class="cc-help ct-set"><span class="ct-line">${countTog('settings')}</span>${countMore('settings')}</div>` : '');
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
const licenseRow = (): Row => ({
  id: 'u:license', key: 'u:license', sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: 'License', desc: 'Amethyst is free until 30 days after version 1.0.0. All of its code is on GitHub.', find: 'license terms source free beta I agree accepted' },
  at: [at('u:license')],
  state: () => {
    const l = licenseNow();
    if (l && !l.accepted) return "You haven't accepted the new license yet.";
    return l?.last ? `Free beta. You accepted the license on ${day(l.last.at)}.` : 'Free beta.';
  },
  note: () => 'Amethyst is free until 30 days after version 1.0.0. All of its code is on GitHub.',
  ctl: () => `<a class="chip" href="${LICENSE_URL}" target="_blank" data-license="terms" title="Terms&#10;The license, in your browser.">terms</a>` +
    `<a class="chip" href="${SOURCE_URL}" target="_blank" data-license="source" title="Source&#10;All of Amethyst's code, on GitHub.">source</a>` +
    (licenseNow() && !licenseNow()!.accepted ? `<button class="chip on" data-lic-open title="I agree&#10;Opens the license to read and accept it.">I agree…</button>` : ''),
});
const updRows = (): Row[] => [...(hasUpdate() ? [lookRow(), autoRow(), noticeRow()] : []), ...(hasCount() && countNow() ? [countRow()] : []), licenseRow()];
addPart({ rows: updRows, sel: () => '', look: () => '', example: () => '', home: 'update' });

export function updHtml() {
  if (!hasUpdate()) return box('upd', 'License', countHtml() + rowHtml(licenseRow()));
  return box('upd', 'Amethyst version and updates', updateCard() + [lookRow(), autoRow(), noticeRow()].map(rowHtml).join('') + countHtml() + rowHtml(licenseRow()), 'The version you have, and how a new one reaches you. Only in the desktop app.');
}

const DOCS: [string, string, [string, string, string][]][] = [
  ['dstart', 'Start here', [
    ['Getting started', 'getting-started.md', 'Install on Windows, set up workspaces and projects, sign in to your agents, and learn the core workflow.'],
    ['Modes, browser tab, quick tools, and shortcuts', 'modes-and-shortcuts.md', 'Editor, Orchestration, Terminals, The Mind, browser element picker, quick windows, Freeze Log, and default keys.'],
    ['Agent setup and accounts', 'agent-setup-and-accounts.md', 'Where each agent keeps instructions, skills, rules, and memory, plus multi-account Claude switching and usage limits.'],
    ['Reviewing edits and rewind', 'review-and-rewind.md', 'Review agent file edits per file or per turn, keep or reject changes, and rewind chats and files with restore points.'],
  ]],
  ['dagents', 'Agents and automation', [
    ['Agents from other models as subagents', 'agents.md', 'Start Claude, Codex, Antigravity, Cursor, GitHub Copilot, or Grok as a subagent from inside any chat with amethyst agent run.'],
    ['Driving other chats (orchestration)', 'orchestration.md', 'Have one chat or your terminal start, message, wait for, read, and organize other chats in the same project.'],
    ['CLI and MCP server', 'cli-and-mcp.md', 'Use the amethyst command from your terminal or scripts, and connect outside agents through amethyst mcp.'],
    ['Command and MCP reference', 'commands.md', 'Complete reference of every amethyst CLI command, flag, and MCP tool name.'],
    ['Worktrees and context handoff', 'worktrees-and-handoff.md', 'Isolate parallel chats in git worktrees, copy gitignored files with .worktreeinclude, and switch agents mid-chat.'],
  ]],
  ['dtools', 'Project tools', [
    ['Git, pull requests, and issues', 'git-and-github.md', 'Open diffs, history, branch comparisons, pull requests, and issues in Amethyst from an agent, and customize branch naming patterns.'],
    ['Unreal Engine and the debugger', 'unreal-debugger.md', 'Set up the native Windows debugger and let agents inspect or control a live Unreal Editor or game session.'],
  ]],
];
const docRow = ([name, file, desc]: [string, string, string]): Row => ({
  id: `d:${file}`, key: `d:${file}`, sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: name, desc, find: file }, at: [at(`d:${file}`)],
  state: () => 'Opens the guide on GitHub in your browser.', note: () => desc,
  btn: { label: 'open on GitHub', tip: `${name}\nOpens ${file} on GitHub in your browser.`, run: () => void window.open(`${DOCS_URL}/${file}`, '_blank') },
});
addPart({ rows: () => DOCS.flatMap(([, , items]) => items.map(docRow)), sel: () => '', look: () => '', example: () => '', home: 'docs' });

export const docsHtml = () => DOCS.map(([id, title, items]) => box(id, title, items.map((d) => rowHtml(docRow(d))).join(''), 'Each guide opens on GitHub in your browser.')).join('');
