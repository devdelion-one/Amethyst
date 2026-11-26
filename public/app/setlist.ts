import { NEW_BTN, ocHead, ocRow } from './chatlist.ts';
import { closedInner, HIDE_BTN, SHOW_BTN, TERM_NEW } from '../decks/deck.ts';
import { agentRow } from '../base/agentrow.ts';
import { askHtml } from '../base/answer.ts';
import { boxHtml } from '../base/chatfolders.ts';
import { listKey, pref } from '../base/prefs.ts';
import type { Agent } from '../base/stream.ts';
import { addPart, bigPic, box, mark, pic, rowHtml, subh } from './setstd.ts';
import type { At, Row } from './setstd.ts';

type Sample = Agent & { pos: number; bench?: boolean; folder?: boolean };

const TWO = ['deck', 'orch'];
const both = (x: string, more: Partial<Row> = {}): Row => ({ id: listKey('deck', x), key: listKey('deck', x), at: TWO.map((place) => ({ key: listKey(place, x), place })), ...more });
const calmBoth = () => (TWO.every((p) => pref(listKey(p, 'look')) === 'calm') ? 'Not used while the list is calm: calm rows are one line each.' : '');
const chatRows = (): Row[] => [both('look', { choice: true }), both('sort', { choice: true }), both('folders'), both('newBtn'), both('code'), both('tools'), both('answer', { blocked: calmBoth }), both('subs', { blocked: calmBoth })];
const linked = (key: string): Row => ({ id: key, key, at: [{ key, place: 'deck' }, { key, place: 'terms' }], linked: true });
const alsoRows = (): Row[] => [{ id: 'closed:on', key: 'closed:on', at: [{ key: 'closed:on', place: 'deck' }] }, linked('rail:hideBtn'), linked('rail:showBtn')];
const termRows = (): Row[] => ['deck:rowCode', 'deck:title2', 'deck:rowInfo'].map((key) => ({ id: key, key, at: [{ key, place: 'terms' }] }));
const clRows = () => [...chatRows(), ...alsoRows()];

const shortOf = (key: string) => (key === 'subagents:list' || key === 'decklist:subs' ? 'subs' : key.replace(/^(orch|decklist):/, ''));
const SEL: Record<string, string> = {
  folders: '.cf-box', newBtn: '.oc-new', code: '.oc-code', tools: '.oc-tool', answer: '.dk-ask', subs: '.oc-subs',
  'closed:on': '.dk-closed', 'rail:hideBtn': '.dk-hide', 'rail:showBtn': '.dk-show',
  'deck:rowCode': '.dk-row .dk-r1 > .dk-code', 'deck:title2': '.dk-row.hr-long .dk-topic', 'deck:rowInfo': '.dk-row .dk-r2',
};
const sel = (a: At) => SEL[shortOf(a.key)] || '';
const LOOK_SEL: Record<string, string> = { look: '.oc-gh[data-st="done"] + .oc-row', sort: '.oc-gh[data-st="done"]', folders: '.cf-box > .cf-h', answer: '.dk-ask .dk-aopt', subs: '.oc-subs > .oc-sub', 'closed:on': '.dk-closed > .dk-cb', 'rail:showBtn': '.hr-edge' };

const ago = (s: number) => Date.now() - s * 1000;
const sub = (id: string, name: string, status: string, s: number) => ({ id, name, status, start: ago(s) });
const FORM = (message: string, opts: string[]) => ({ id: 'hr-ask', q: '', why: '', what: '', files: [], options: [], form: { message, schema: { properties: { pick: { type: 'string', enum: opts } } } } });
const SAMPLES: Record<string, () => Sample[]> = {
  deck: () => [
    { id: 'hr-1079-a1', kind: 'chat', program: 'claude', status: 'asks', title: 'Pick the database for sign-up', line: '', ask: FORM('Which database should the sign-up page use?', ['Postgres, like the rest of the app', 'SQLite, a file next to the server']), at: ago(60), pos: 2 },
    { id: 'hr-1079-a2', kind: 'chat', program: 'claude', status: 'working', title: 'Fix the login page on mobile', line: 'Running the tests on a small screen', subs: [sub('s1', 'Explore the login form', 'running', 72), sub('s2', 'Run the tests', 'running', 24), sub('s3', 'Read the logs', 'done', 300)], at: ago(5), pos: 0 },
    { id: 'hr-1079-a3', kind: 'chat', program: 'claude', status: 'idle', title: 'Sign-up page colors', line: '', report: true, at: ago(3600), pos: 1 },
    { id: 'hr-1079-a4', kind: 'chat', program: 'codex', status: 'done', title: 'Read the server logs', line: '', note: 'Check the logs again tomorrow', subs: [sub('s4', 'a', 'done', 900), sub('s5', 'b', 'done', 900), sub('s6', 'c', 'done', 900)], at: ago(120), pos: 3 },
    { id: 'hr-1079-a5', kind: 'chat', program: 'claude', status: 'idle', title: 'Check the form on a small phone', line: '', at: ago(3 * 3600), pos: 4, folder: true },
    { id: 'hr-1079-a6', kind: 'chat', program: 'claude', status: 'idle', title: 'Write the release notes', line: '', at: ago(86400), pos: 5, bench: true },
  ] as unknown as Sample[],
  orch: () => [
    { id: 'hr-1079-o1', kind: 'chat', program: 'claude', status: 'asks', title: 'Name the new settings page', line: '', ask: FORM('Which name should the page use?', ['Show and hide', 'Look']), at: ago(90), pos: 2 },
    { id: 'hr-1079-o2', kind: 'chat', program: 'claude', status: 'working', title: 'Move the chat list switches', line: 'Reading the settings code', subs: [sub('s7', 'Find every list switch', 'running', 48), sub('s8', 'Check the tooltips', 'done', 200)], at: ago(8), pos: 0 },
    { id: 'hr-1079-o3', kind: 'chat', program: 'claude', status: 'idle', title: 'Draw the preview', line: '', at: ago(7200), pos: 1 },
    { id: 'hr-1079-o4', kind: 'chat', program: 'codex', status: 'done', title: 'Check the menu words', line: '', note: 'Ask about the order', at: ago(300), pos: 3 },
    { id: 'hr-1079-o5', kind: 'chat', program: 'claude', status: 'idle', title: 'Write the change notes', line: '', at: ago(2 * 86400), pos: 4, folder: true },
  ] as unknown as Sample[],
};
const FOLDER: Record<string, string> = { deck: 'Login work', orch: 'Release' };
const CLOSED = () => [{ session: 'c1', title: 'Old login work', at: ago(3600) }, { session: 'c2', title: 'Sign-up page colors', at: ago(7200) }, { session: 'c3', title: 'Read the logs', at: ago(86400) }];
const ALL_PARTS = ['live', 'all', 'bench', 'folder', 'closed', 'hide'];

function listPic(p: string, parts = ALL_PARTS) {
  const L = SAMPLES[p](), calm = pref(listKey(p, 'look')) === 'calm', has = (x: string) => parts.includes(x);
  const live = L.filter((a) => a.status === 'asks' || a.status === 'working').sort((x, y) => (x.status === 'asks' ? -1 : 0) - (y.status === 'asks' ? -1 : 0));
  const ord = (xs: Sample[]) => (pref(listKey(p, 'sort')) === 'latest' ? xs.sort((x, y) => y.at - x.at) : xs.sort((x, y) => x.pos - y.pos));
  const rest = ord(L.filter((a) => !live.includes(a) && !a.bench && !a.folder)), bench = p === 'deck' ? ord(L.filter((a) => a.bench)) : [];
  const showOf = (a: Sample) => (a.status === 'asks' ? ['code', 'tools', 'answer'] : a.status === 'working' ? ['subs'] : []);
  const row = (a: Sample, isLive: boolean) => {
    const html = ocRow(a, { list: p, attr: 'data-hr-agent', calm, tight: false, live: isLive, cur: null, show: showOf(a) }).html;
    return a.ask ? html.replace(/<div class="dk-askslot"[^>]*><\/div>/, askHtml(a.ask)) : html;
  };
  let top = true;
  const head = (k: string, label: string, n: number) => {
    const add = top && !!pref(listKey(p, 'newBtn')), h = ocHead(k, label, n, add).html;
    const out = top && !add ? h.replace('</h4>', NEW_BTN + '</h4>') : h;
    top = false;
    return out;
  };
  let h = '';
  if (has('live')) h += head('working', 'Live', live.length) + live.map((a) => row(a, true)).join('');
  if (has('all')) h += head('done', 'All', rest.length) + rest.map((a) => row(a, false)).join('');
  if (has('bench') && bench.length) h += head('bench', 'Benched', bench.length) + bench.map((a) => row(a, false)).join('');
  if (has('folder')) {
    const kids = L.filter((a) => a.folder);
    h += boxHtml(p, { id: 'hr-1079-f', name: FOLDER[p], at: '', shut: false, icon: 'folder', ic: '', bg: '' }, kids.map((a) => ({ a }))).replace('<div class="cf-in"></div>', `<div class="cf-in">${kids.map((a) => row(a, false)).join('')}</div>`);
  }
  if (p === 'orch') return `<aside class="oc-rail hr-crail"><div class="oc-list dk-list">${h}</div></aside>`;
  return `<aside class="dk-rail hr-crail">${has('hide') ? HIDE_BTN : ''}<div class="dk-list oc-list">${h}</div>${has('closed') ? `<div class="dk-closed">${closedInner(CLOSED(), false)}</div>` : ''}</aside>`;
}
const edgePic = () => `<div class="deck hr-edge" data-rail="hidden"><div class="hr-edge-in"><i></i><i></i><i></i><i></i></div><aside class="dk-rail"><div class="dk-grip">${SHOW_BTN}</div></aside></div>`;

const TERMS = () => [
  { id: 'hr-1079-t1', kind: 'term', program: 'claude', status: 'done', title: 'Fix the build', line: 'The build passes now.', at: ago(120) },
  { id: 'hr-1079-t2', kind: 'term', program: 'shell', status: 'working', title: 'npm run dev', line: '', at: ago(3) },
  { id: 'hr-1079-t3', kind: 'term', program: 'codex', status: 'idle', title: 'Check the login form on mobile and the sign-up page', line: '', at: ago(3600) },
] as unknown as Agent[];
const termHead = () => `<header class="dk-rhead"><span class="grow"></span>${HIDE_BTN}${TERM_NEW}</header>`;
function termPic(rows = true) {
  const [a, b, c] = TERMS();
  const list = rows ? `<div class="dk-list">${agentRow(a, { attr: 'data-hr-agent', show: ['deck:rowCode', 'deck:rowInfo'] }).html}${agentRow(b, { attr: 'data-hr-agent' }).html}${agentRow(c, { attr: 'data-hr-agent', cls: 'hr-long' }).html}</div>` : '';
  return `<aside class="dk-rail hr-crail hr-trail">${termHead()}${list}</aside>`;
}

const PARTS: Record<string, string[]> = { look: ['live', 'all'], sort: ['all'], folders: ['all', 'folder'], newBtn: ['live'], code: ['live'], tools: ['live'], answer: ['live'], subs: ['live', 'all'], 'closed:on': ['all', 'closed'], 'rail:hideBtn': ['live', 'hide'] };
function picOf(a: At) {
  const k = shortOf(a.key);
  if (k === 'rail:showBtn') return edgePic();
  if (a.place === 'terms') return termPic(k !== 'rail:hideBtn');
  return listPic(a.place, PARTS[k]);
}
const example = (a: At) => pic(mark(picOf(a), atsIn([...clRows(), ...termRows()], a.place), sel, a), a.place, ' hr-ex hr-exlist');

let looks: Record<string, string> = {};
function lookOf(r: Row) {
  if (looks[r.id] != null) return looks[r.id];
  const a = r.at[0], k = shortOf(a.key), t = document.createElement('template');
  t.innerHTML = picOf(a);
  const el = t.content.querySelector<HTMLElement>(LOOK_SEL[k] || sel(a));
  let html = '';
  if (el) {
    el.hidden = false;
    for (const x of el.querySelectorAll<HTMLElement>('[hidden]')) x.hidden = false;
    html = a.place === 'terms' && k !== 'rail:hideBtn' ? `<span class="dk-row hr-lkrow">${el.outerHTML}</span>` : `<span class="oc-list dk-list hr-lk">${el.outerHTML}</span>`;
  }
  html = html.replace(/<button /g, '<button tabindex="-1" ').replace(/ tabindex="0"/g, ' tabindex="-1"').replace(/ title="[^"]*"/g, '');
  return (looks[r.id] = html);
}

addPart({ rows: () => [...clRows(), ...termRows()], sel, look: lookOf, example, home: 'show/list' });

const atsIn = (rows: Row[], place: string) => rows.filter((r) => !r.choice).flatMap((r) => r.at).filter((a) => a.place === place && sel(a));
const termBig = () => bigPic(`<div class="hr-pair"><figure><figcaption><b>Terminals mode</b></figcaption>${pic(mark(termPic(), [...atsIn(termRows(), 'terms'), { key: 'rail:hideBtn', place: 'terms' }], sel), 'terms', ' hr-lpic')}</figure></div>`, 'Three terminals as Terminals mode lists them. Click the code, the line under a title, or the long title to change them.', false, true);

export const LIST_LEAD = 'The lists of chats in Agents mode and Orchestration, and of terminals in Terminals mode. Click a switch, or a thing in a picture, to hide or show it.';
export const LIST_MOVED = "The chat list's look, order and what shows in it are in Show and hide, Agents list.";
export function listHtml() {
  looks = {};
  return box('clist', 'Chat list', chatRows().map(rowHtml).join('') + subh("Also on Agents mode's list") + alsoRows().map(rowHtml).join(''), 'One list, in two places: Agents mode and Orchestration. Each chat is a row under Live, All or Benched. A chat at work or waiting for you is a card.') +
    box('tlist', 'Terminals list', termBig() + termRows().map(rowHtml).join(''), 'Each terminal is a row: its sign, its code and title, and how long ago it last changed.');
}
