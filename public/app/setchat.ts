import { chipHtml, composerHtml, HINT_LONG, shapePicker, shrinkHtml, wtStripLive } from './composer.ts';
import type { Picker } from './composer.ts';
import { chatRowHtml } from './palette.ts';
import { winHead } from './setheads.ts';
import { compactHtml, noticeHtml, usageInner } from '../chat/ring.ts';
import { cmdPic } from '../chat/steps.ts';
import { editsBar } from '../chat/editstrip.ts';
import { artifactsInner } from '../chat/artbar.ts';
import { markBtn } from '../base/agentrow.ts';
import { counts } from '../base/edits.ts';
import { quoteBar } from '../base/quote.ts';
import { icon } from '../base/icon.ts';
import { pref, PREFS, setPref } from '../base/prefs.ts';
import type { Artifact } from '../base/types.ts';
import type { Agent } from '../base/stream.ts';
import { esc } from '../base/util.ts';
import { tokens } from '../base/words.ts';
import { addPart, bigPic, box, mark, pic, rowHtml } from './setstd.ts';
import type { At, Choice, Row } from './setstd.ts';

const one = (key: string, place: string): Row => ({ id: key, key, at: [{ key, place }] });
const item = (key: string, id: string, place: string, name?: string): Row => ({ id: `${key}:${id}`, key, at: [{ key, place, id }], name });

const CHIPS = ['model', 'effort', 'fast', 'ultracode'];
const extraChips = () => (PREFS['chrow:chips'].list!(null) as [string, string][]).filter(([id]) => !CHIPS.includes(id));
const boxRows = (): Row[] => [
  one('chat:hint', 'box'),
  item('chrow:off', 'attach', 'box'),
  ...CHIPS.map((id) => item('chrow:chips', id, 'box')),
  ...extraChips().map(([id, name]) => item('chrow:chips', id, 'box', name.charAt(0).toUpperCase() + name.slice(1))),
  one('chat:shrinkRow', 'box'),
  item('chrow:off', 'usage', 'box'),
  item('chat:off', 'color', 'box'),
  one('chat:worktree', 'box'),
  one('chat:wtStrip', 'box'),
  item('chrow:off', 'mode', 'box'),
  one('chat:mic', 'box'),
];
const msgRows = (): Row[] => [one('chat:artifacts', 'art'), one('quote:on', 'sel'), one('liveCmds', 'cmd'), item('chat:off', 'compact', 'comp'), item('chat:off', 'notice', 'notice'), item('chat:off', 'time', 'time'), one('chatMarks', 'scroll'), item('chat:off', 'up', 'up'), one('chat:holdStart', 'hold'), one('edits:strip', 'edits')];
const turnRows = (): Row[] => [{ ...one('accentTurnLines', 'turns'), sw: 'onoff', plain: true, noPic: true }];
const marksRows = (): Row[] => [one('marks:on', 'marks')];
const ctrlpRows = (): Row[] => [one('palette:chats', 'ctrlp')];

const effortRows = (): Row[] => {
  const e = PREFS['effort:look'];
  return [{ id: 'effort:look', key: 'effort:look', plain: true, at: [{ key: 'effort:look', place: 'box' }], own: { label: e.label, desc: e.desc, find: 'Effort shows as' }, pick: { get: () => pref('effort:look'), set: (v) => setPref('effort:look', v), def: e.def, choices: () => e.choices as Choice[], reset: 'p:effort:look' } }];
};
const SEL: Record<string, string> = {
  'effort:look': '[data-pick="effort"]', 'chat:hint': '.ch-ta .hr-ph', 'chrow:off:attach': '.ch-attach', 'chrow:off:usage': '.ch-usage', 'chrow:off:mode': '.ch-mode', 'chat:shrinkRow': '[data-ch="shrink"]', 'chat:off:color': '.ch-usage', 'chat:worktree': '.ch-wt', 'chat:mic': '.ch-mic', 'chat:wtStrip': '.ch-wtstrip',
  'chat:artifacts': '.ch-artifacts', 'quote:on': '.quote-bar', liveCmds: '.ch-io:has(pre.term)', 'chat:off:compact': '.st.compact', 'chat:off:notice': '.st.ch-notice', 'chat:off:time': '.ch-time', chatMarks: '.ch-marks', 'chat:off:up': '.ch-up', 'chat:holdStart': '.hr-hold', 'edits:strip': '.ch-edits',
  'marks:on': '[data-dk-mark]:not(.mk-sign)', 'palette:chats': '.hr-pal ul',
};
const sel = (a: At) => (a.key === 'chrow:chips' ? `[data-pick="${CSS.escape(a.id!)}"]` : SEL[a.id ? `${a.key}:${a.id}` : a.key]);

const opts = (list: [string, string][]) => list.map(([value, name]) => ({ value, name }));
const pickers = (): Picker[] => [
  { key: 'model', name: 'Model', category: 'model', value: 'opus', options: opts([['opus', 'Opus 5.5'], ['sonnet', 'Sonnet 5'], ['haiku', 'Haiku 5']]) },
  { key: 'effort', name: 'Effort', category: 'thought_level', value: 'medium', options: opts([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Xhigh'], ['max', 'Max']]) },
  { key: 'fast', name: 'Fast mode', value: 'off', options: opts([['on', 'on'], ['off', 'off']]) },
  { key: 'ultracode', name: 'Ultracode', value: 'off', options: opts([['on', 'on'], ['off', 'off']]) },
  { key: 'mode:', name: 'Mode', category: 'mode', value: 'acceptEdits', options: opts([['default', 'Default'], ['acceptEdits', 'Accept edits'], ['plan', 'Plan'], ['auto', 'Auto']]) },
].map((p) => shapePicker(p, 'claude'));
function chatBox(color = false) {
  const t = document.createElement('template');
  t.innerHTML = composerHtml({ chat: true });
  const f = t.content, ps = pickers();
  f.querySelector('.ch-ta')!.innerHTML = `<div class="cm-content"><span class="cm-placeholder hr-ph">${esc(HINT_LONG)}</span></div>`;
  f.querySelector('.ch-opts')!.innerHTML = ps.filter((p) => p.category !== 'mode').map((p) => chipHtml(p, 'claude')).join('') + shrinkHtml(true);
  f.querySelector('.ch-mode')!.innerHTML = ps.filter((p) => p.category === 'mode').map((p) => chipHtml(p, 'claude')).join('');
  const u = f.querySelector<HTMLElement>('.ch-usage')!;
  u.hidden = false;
  u.innerHTML = usageInner(tokens(color ? 41000 : 42000));
  u.style.setProperty('--ch-p', '21');
  u.classList.toggle('compacted', color);
  const s = f.querySelector<HTMLElement>('.ch-wtstrip')!;
  s.hidden = false;
  s.innerHTML = wtStripLive('chat/k3f9q', 'main', '2 commits ahead');
  for (const x of f.querySelectorAll('.ch-file-in, .ch-jump, .ch-queue, .ch-sug, .ch-pop, .ch-refs, [data-ch="stop"]')) x.remove();
  return `<div class="hr-cbox">${t.innerHTML}</div>`;
}

const ARTS: Artifact[] = [
  { path: 'implementation_plan.md', name: 'implementation_plan.md', kind: 'doc', summary: 'The plan for the login fix', requestFeedback: true },
  { path: 'login_mock.png', name: 'login_mock.png', kind: 'image', summary: 'How the login page looks on a phone', requestFeedback: false },
];
const M = {
  art: () => `<div class="ch-artifacts needs-fb">${artifactsInner(ARTS, true)}</div>`,
  you: (t = 'Why does the login page fail on mobile?') => `<div class="ch-you">${esc(t)}</div>`,
  quote: () => `<div class="ch-ai"><p>The form posts before the token is set, so <span class="hr-sel">the first request has no token</span> <span class="quote-bar">${quoteBar()}</span> and the server turns it away.</p></div>`,
  ai: (t: string) => `<div class="ch-ai"><p>${esc(t)}</p></div>`,
  timed: (t: string) => `<div class="ch-msg ch-ai"><div class="md"><p>${esc(t)}</p></div><span class="ch-acts hr-on"><button type="button" aria-label="Copy">${icon('copy')}</button><span class="ch-time">14:32</span></span></div>`,
  cmd: () => cmdPic('npm test', 'Run the tests', '✓ login.test.ts (12)\n✓ form.test.ts (29)', true),
  comp: () => compactHtml('completed', 182000, 41000),
  note: () => noticeHtml('warning', 'You are close to your usage limit'),
  edits: () => `<div class="ch-edits">${editsBar('3 files', counts(24, 6))}</div>`,
  up: () => `<button type="button" class="ch-up">${icon('up')}</button>`,
  hold: () => `<div class="ch-ai hr-hold"><p>Here is the whole plan, from the first step.</p><p>1. Set the token before the form posts.</p><p>2. Test it on a small screen.</p></div>`,
  more: () => `<span class="ch-jump new hr-new">${icon('down')}<span>new</span></span>`,
  marks: () => `<div class="ch-marks" aria-hidden="true"><i class="you" style="top:6%"></i><i style="top:20%"></i><i style="top:44%"></i><i class="you" style="top:70%"></i><i style="top:84%"></i></div>`,
};
const chat = (top: string, flow: string, under = '') => `<div class="chat hr-msgs">${top}<div class="ch-log"><div class="ch-flow">${flow}</div></div>${under}</div>`;
const allMsgs = () => chat(M.art(), M.you() + M.quote() + M.ai('Let me run the tests.') + M.cmd() + M.comp() + M.note() + M.timed('The tests pass now.'), M.marks() + M.up() + M.edits() + '<div class="hr-msg">Message…</div>');
function msgEx(k: string) {
  if (k === 'chat:artifacts') return chat(M.art(), M.you('Make a plan for the login fix.'));
  if (k === 'quote:on') return chat('', M.quote());
  if (k === 'liveCmds') return chat('', M.ai('Let me run the tests.') + M.cmd());
  if (k === 'chat:off:compact') return chat('', M.ai('Here is what I found so far.') + M.comp());
  if (k === 'chat:off:notice') return chat('', M.ai('Let me run the tests.') + M.note());
  if (k === 'chat:off:time') return chat('', M.you() + M.timed('The form posts before the token is set.'));
  if (k === 'chat:off:up') return chat('', M.you() + M.ai('The form posts before the token is set.') + M.you('Can you fix it?'), M.marks() + M.up());
  if (k === 'chat:holdStart') return chat('', M.hold(), M.more());
  if (k === 'chatMarks') return chat('', M.you() + M.ai('The form posts before the token is set.') + M.you('Can you fix it?'), M.marks());
  return chat('', M.ai('The tests pass now.'), M.edits() + '<div class="hr-msg">Message…</div>');
}

const ago = (s: number) => Date.now() - s * 1000;
const AGENTS = () => [
  { id: 'sample-1074-a', kind: 'chat', program: 'claude', status: 'done', title: 'Fix the login page', model: 'Opus 5.5 · Medium', line: 'The tests pass now.', note: 'Check the form on mobile', session: 'sample-1074-a', at: ago(120) },
  { id: 'sample-1074-b', kind: 'chat', program: 'claude', status: 'working', title: 'Check the login form on mobile and the sign-up page', model: 'Opus 5.5 · High', line: 'Running the tests on a small screen', session: 'sample-1074-b', at: ago(5) },
] as unknown as Agent[];

function marksEx() {
  const t = document.createElement('template');
  t.innerHTML = winHead({ show: ['deck:markBtn'] });
  if (!t.content.querySelector('[data-dk-mark]')) t.content.querySelector('.dk-tools')?.insertAdjacentHTML('afterbegin', markBtn({ id: 'sample-992', kind: 'chat', session: 'sample-992' } as unknown as Agent, '', true));
  return t.innerHTML;
}
function ctrlp() {
  const [a, b] = AGENTS(), ph = document.querySelector<HTMLInputElement>('#palette input')?.placeholder || '';
  return `<div class="hr-pal"><div class="box"><input tabindex="-1" placeholder="${esc(ph)}" readonly><ul><li class="pc on">${chatRowHtml(a)}</li><li class="pc">${chatRowHtml(b)}</li></ul></div></div>`;
}

const tok = (a: At) => (a.id ? `${a.key}:${a.id}` : a.key);
function example(a: At) {
  const k = tok(a), m = (html: string, cls: string) => pic(mark(html, [a], sel, a), a.place, ' hr-ex ' + cls);
  if (a.place === 'box') return m(chatBox(k === 'chat:off:color'), 'hr-exbox');
  if (a.place === 'marks') return m(marksEx(), 'hr-cell');
  if (a.place === 'ctrlp') return m(ctrlp(), 'hr-expal');
  return m(msgEx(k), 'hr-exmsg');
}
let looks: Record<string, string> = {};
function lookOf(r: Row) {
  if (looks[r.id] != null) return looks[r.id];
  if (r.id === 'chat:holdStart') return (looks[r.id] = `<span class="chat hr-lkmsg"><i class="tb-ic">${icon('toStart')}</i></span>`);
  const a = r.at[0], p = a.place, t = document.createElement('template');
  t.innerHTML = p === 'box' ? chatBox(r.id === 'chat:off:color') : p === 'marks' ? marksEx() : p === 'ctrlp' ? ctrlp() : allMsgs();
  const el = t.content.querySelector<HTMLElement>(sel(a));
  let html = '';
  if (el) {
    el.hidden = false;
    el.classList.add('hr-keep');
    const wrap = p === 'box' ? 'ch-row' : p === 'marks' ? 'dk-ch hr-mini' : p === 'ctrlp' ? 'hr-pal' : 'chat hr-lkmsg';
    html = `<span class="${wrap}">${el.outerHTML}</span>`;
  }
  html = html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
  return (looks[r.id] = html);
}

const part = (rows: () => Row[], home: string) => addPart({ rows, sel, look: lookOf, example, home });
part(boxRows, 'show/chat');
part(effortRows, 'show/chat');
part(msgRows, 'show/chat');
part(turnRows, 'show/chat');
part(marksRows, 'agents');
part(ctrlpRows, 'show/all');

const bigOf = (html: string, rows: Row[], place: string, cap: string, flat = false) => bigPic(pic(mark(html, rows.flatMap((r) => r.at).filter((a) => a.key !== 'chat:off' || a.id !== 'color'), sel, null, true), place), cap, flat);
export const CHAT_LEAD = 'What shows in every chat, wherever it is: in a chat window, in orchestration and in the Quick Agent. Click a switch, or a thing in a picture, to hide or show it.';
export function chatPartsHtml() {
  looks = {};
  return box('cbox', 'Chat box', bigOf(chatBox(), boxRows(), 'box', 'The box under every chat, as it looks in the app. Point at a part to find its row, click it to hide or show it. Dashed and struck through: hidden.') + [...boxRows(), ...effortRows()].map(rowHtml).join(''), 'Where you type, under the messages of every chat. Right-clicking its bar in the app hides and shows the same things.') +
    box('msgs', 'In the messages', bigOf(allMsgs(), msgRows(), 'msgs', "A chat's messages, with every part that has a switch. Point at a part to find its row, click it to hide or show it. Dashed and struck through: hidden.", true) + [...msgRows(), ...turnRows()].map(rowHtml).join(''), "What shows among a chat's messages, and just above its box.");
}
export const marksRowHtml = () => ((looks = {}), marksRows().map(rowHtml).join(''));
export const ctrlpHtml = () => ((looks = {}), box('ctrlp', 'Ctrl p', ctrlpRows().map(rowHtml).join(''), 'The box that finds files, commands and chats, from ctrl p.'));
