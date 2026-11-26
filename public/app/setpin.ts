import { NEW_BTN } from './chatlist.ts';
import { ncInner } from './header.ts';
import { agentMenu, agentShort, newHint, PIN_PLACES, pinOf, pinSame, ringSvg, setPin, setPinSame } from '../base/agentmenu.ts';
import { gem } from '../base/kinds.ts';
import { chatsOn, pref } from '../base/prefs.ts';
import { selBarHtml } from '../base/quote.ts';
import { esc, setSave } from '../base/util.ts';

const PLACE: Record<string, [string, string]> = {
  top: ['New agent button in the dashboard', "It makes a tab in the Editor, a window in Agents, or a chat in Orchestration's list."],
  list: ['New agent button in the chat list', 'The button at the top of the list of chats, in Agents and in Orchestration.'],
  agents: ['+ new on an empty spot in Agents', 'It fills that spot with a new chat. A right-click on the empty grid shows the same list.'],
  text: ['+ chat on selected text in the scratch', 'Select text in the scratch and pick where. The new chat starts with that text.'],
  tochat: ['Add to chat on text in a file or terminal', 'When no chat is open for that text yet, it starts a new one with it.'],
  quick: ['The Quick Agent', 'The button in the rail that opens a small chat over everything.'],
};

const TILE: Record<string, [string, string]> = {
  top: ['new agent button', 'The new agent button in the dashboard.'],
  list: ['new agent button', 'The new agent button at the top of the list of chats.'],
  agents: ['+ new', 'The + new on an empty spot in agents.'],
  text: ['+ chat', 'The + chat on text selected in the scratch pad.'],
  tochat: ['Add to chat', 'The add to chat on text in a file or terminal.'],
  quick: ['Quick Agent', 'The Quick Agent.'],
};

const nameOf = (k: string) => chatsOn().find(([c]) => c === k)?.[1] || k;
const differs = () => !pinSame() && new Set(PIN_PLACES.map(pinOf)).size > 1;
const lower = (n: string) => n.replace(/^The /, 'the ');
const list = (ns: string[]) => (ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns.at(-1)}` : ns[0]);

function stateLine() {
  if (!differs()) {
    const k = pinOf('top');
    return k ? `${nameOf(k)} is pinned. A click on any + opens it straight away.` : 'Nothing is pinned. A click on any + shows the list of agents.';
  }
  const by = new Map<string, string[]>();
  for (const p of PIN_PLACES) {
    const k = pinOf(p);
    by.set(k, [...(by.get(k) || []), lower(PLACE[p][0])]);
  }
  return [...by].map(([k, ns]) => `${k ? `${nameOf(k)} is pinned for` : 'Nothing is pinned for'} ${list(ns)}.`).join(' ');
}
const does = (p: string) => {
  const k = pinOf(p);
  return k ? `A click now opens ${esc(nameOf(k))}.` : 'A click now shows the list of agents.';
};

function quiet(html: string) {
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const n of t.content.querySelectorAll<HTMLElement>('*')) {
    for (const a of [...n.attributes]) if (a.name === 'id' || a.name === 'title' || a.name.startsWith('data-') || a.name.startsWith('aria-')) n.removeAttribute(a.name);
    n.hidden = false;
    if (n.matches('button')) n.tabIndex = -1;
  }
  return t.innerHTML;
}
function real(id: string, cls: string, inner?: string) {
  const r = document.getElementById(id);
  if (!r) return '';
  const c = r.cloneNode(true) as HTMLElement;
  c.className = cls;
  if (inner != null) c.innerHTML = inner;
  return quiet(c.outerHTML);
}
const pics: Record<string, () => string> = {
  top: () => `<span class="tray pn-tray">${real('btn-newchat', 'pn-nc', ncInner())}</span>`,
  list: () => `<span class="oc-gh pn-lh">${quiet(NEW_BTN)}</span>`,
  agents: () => `<span class="dk-hint pn-hint">${quiet(newHint('chat'))}</span>`,
  text: () => `<span class="pn-col"><span class="pn-edsel">${real('ed-chat', '')}</span><span class="pn-seltxt">some selected text</span></span>`,
  tochat: () => `<span class="pn-col"><span class="pn-sel">${quiet(selBarHtml('＋ add to chat')).replace('<button type="button" class="sb-to"', `<button type="button" class="sb-to"${pref('tochat:pick') ? '' : ' hidden'}`)}</span><span class="pn-seltxt">some selected text</span></span>`,
  quick: () => `<span class="tray pn-tray">${real('btn-qagent', 'pn-qa')}</span>`,
};

const seg = (cur: string | null, attr: (k: string) => string, short: boolean, label: string) =>
  `<span class="seg pn-seg${short ? ' sm' : ''}" role="group" aria-label="${esc(label)}">${[['', 'Nothing pinned'], ...chatsOn().map(([k, n]) => [k, short ? agentShort(k) : n])].map(([k, n]) => `<button class="chip${cur === k ? ' on' : ''}" ${attr(k)} aria-pressed="${cur === k}" title="${esc(k ? `Pin ${nameOf(k)}\nA click on ${label ? lower(label) : '+'} starts ${agentShort(k)}${label ? '' : ' in every place'}, without asking.` : `Nothing pinned\nA click on ${label ? lower(label) : '+'} shows the list of agents.`)}">${k ? gem('ai') : ''}${esc(n)}</button>`).join('')}</span>`;

function tile(p: string, same: boolean) {
  const [name, what] = PLACE[p];
  const tip = `${TILE[p][0]}\n${TILE[p][1]} Click or right-click it for its list of agents, to pin one.`;
  return `<div class="pn-tile" data-pin-tile="${p}"><span class="pn-tn">${esc(name)}</span>` +
    `<div class="pn-pic" data-pin-pic="${p}" role="button" tabindex="0" title="${esc(tip)}" aria-label="${esc(name)}">${pics[p]()}</div>` +
    `<span class="pn-tw">${esc(what)}</span><span class="pn-does">${does(p)}</span>` +
    (same ? '' : seg(pinOf(p), (k) => `data-pin-at="${p}" data-pin-k="${esc(k)}"`, true, name)) + '</div>';
}

export function pinHtml() {
  if (chatsOn().length < 2) return '';
  const same = pinSame(), mixed = differs();
  return `<div class="pn-box" data-pinbox>` +
    `<div class="pn-head"><span class="pn-ico">${ringSvg(true)}</span><div class="pn-words"><span class="pn-name">Pinned agent</span><span class="pn-state">${esc(stateLine())}</span><span class="pn-desc">The agent a click on + opens without asking. You can also pin one in the list a + shows, with the ring on its right.</span></div></div>` +
    seg(mixed ? null : pinOf('top'), (k) => `data-pin-all="${esc(k)}"`, false, '') +
    `<label class="pn-same"><input type="checkbox" data-pin-same${same ? ' checked' : ''}><span>The same pinned agent in every place</span><small>${same ? 'Untick it to pin a different one in each place.' : 'Each place below has its own.'}</small></label>` +
    `<div class="pn-tiles">${PIN_PLACES.map((p) => tile(p, same)).join('')}</div></div>`;
}

const said = (p: string, k: string) => setSave(`pinned agent${p === '*' || pinSame() ? '' : ` for ${lower(PLACE[p][0])}`}: ${k ? nameOf(k) : 'nothing'}`);
function openList(pic: HTMLElement, x: number, y: number, focus: boolean) {
  const p = pic.dataset.pinPic!;
  agentMenu(x, y, (k) => (setPin(p, k), said(p, k)), '', 'chat:', focus, { place: p });
}

export function pinClick(t: Element): boolean {
  const box = t.closest('[data-pinbox]');
  if (!box) return false;
  const same = t.closest<HTMLInputElement>('input[data-pin-same]');
  if (same) {
    setPinSame(same.checked);
    setSave(same.checked ? 'pinned agent: the same in every place' : 'pinned agent: one for each place');
    return true;
  }
  const all = t.closest<HTMLElement>('[data-pin-all]');
  if (all) {
    setPin('*', all.dataset.pinAll!);
    said('*', all.dataset.pinAll!);
    return true;
  }
  const at = t.closest<HTMLElement>('[data-pin-at]');
  if (at) {
    setPin(at.dataset.pinAt!, at.dataset.pinK!);
    said(at.dataset.pinAt!, at.dataset.pinK!);
    return true;
  }
  const pic = t.closest<HTMLElement>('[data-pin-pic]');
  if (pic) {
    const r = pic.getBoundingClientRect();
    openList(pic, r.left, r.bottom + 4, false);
    return true;
  }
  return !t.closest('label');
}

export function pinInit(root: HTMLElement) {
  root.addEventListener('contextmenu', (e: MouseEvent) => {
    const pic = (e.target as Element).closest<HTMLElement>('[data-pinbox] [data-pin-pic]');
    if (!pic) return;
    e.preventDefault();
    e.stopPropagation();
    openList(pic, e.clientX, e.clientY, false);
  });
  root.addEventListener('keydown', (e: KeyboardEvent) => {
    const pic = (e.target as Element).closest?.<HTMLElement>('[data-pinbox] [data-pin-pic]');
    if (!pic || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    const r = pic.getBoundingClientRect();
    openList(pic, r.left, r.bottom + 4, true);
  });
}
