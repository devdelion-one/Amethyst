import { editHead, editMenuHtml, editRowsFor } from '../base/editmenu.ts';
import { tellInner } from '../base/notify.ts';
import { keyed } from '../base/prefs.ts';
import { FAR_TAB } from './groups.ts';
import { launchRows } from './setpages.ts';
import { addPart, box, markAll, pic, rowHtml, wordsOf } from './setstd.ts';
import type { At, Row } from './setstd.ts';

type Draw = { rsBtn: (tok: string, on: boolean) => string; head: (top: string, sub: string | undefined, lead: string) => string };

export const POPS_LEAD = "Ctrl p, the right-click menus and color menus, the menu a right-click on text opens, the notice when a drop or a click can't work, and this settings window. Click a switch, or the ringed part in the picture a row opens, to hide or show it.";

let draw: Draw | null = null;
export const popsInit = (d: Draw) => (draw = d);

const SEL: Record<string, string> = { 'editmenu:on': '.hr-cm', 'tell:on': '.hr-tell', 'settings:find': '#set-find-at', 'settings:changed': '.hr-chg :is(.sr-rs, .set-rsall, .set-chg)' };
const sel = (a: At) => SEL[a.key];
const one = (key: string, place: string): Row => ({ id: key, key, at: [{ key, place }] });
const editRow = (): Row[] => (window.amethyst?.desktop ? [one('editmenu:on', 'editmenu')] : []);
const tellRow = (): Row[] => [one('tell:on', 'tellcard')];
const setRows = (): Row[] => [one('settings:find', 'setfind'), one('settings:changed', 'setchg')];

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const still = (n: HTMLElement) => {
  for (const el of [n, ...n.querySelectorAll<HTMLElement>('*')])
    for (const x of [...el.attributes]) if (x.name === 'title' || x.name === 'role' || (x.name.startsWith('data-') && x.name !== 'data-em')) el.removeAttribute(x.name);
  return n;
};
const cloneOf = (s: string) => still(document.querySelector<HTMLElement>(s)!.cloneNode(true) as HTMLElement);
const editHtml = () => `<div class="hr-cm hr-em">${editMenuHtml(editHead('text box'), editRowsFor({ text: 'text', cut: true, paste: true, all: true }, () => {}))}</div>`;
const tellHtml = () => `<div class="hr-tell">${tellInner(FAR_TAB.title, FAR_TAB.line)}</div>`;
function findField() {
  const at = cloneOf('#set-find-at'), input = at.querySelector<HTMLInputElement>('input')!;
  at.hidden = false;
  at.querySelector('#set-find-n')!.textContent = '';
  input.readOnly = true;
  input.tabIndex = -1;
  return at;
}
function findHtml() {
  const side = cloneOf('#set-side'), secs = side.querySelector('#set-secs')!;
  side.querySelector('#set-find-at')!.replaceWith(findField());
  secs.replaceChildren(...[...secs.querySelectorAll('.ss')].slice(0, 3));
  for (const b of secs.children) b.classList.remove('on', 'in');
  return side.outerHTML;
}
function changedHtml() {
  const row = frag(rowHtml(launchRows()[0])).firstElementChild as HTMLElement;
  row.querySelector('.hr-look')!.remove();
  row.querySelector('.hr-detail')?.remove();
  row.classList.remove('open', 'lit');
  row.classList.add('hid');
  row.querySelector('.sr-rs')!.classList.add('on');
  row.querySelector('.set-sw')!.classList.remove('on');
  row.querySelector('.hr-state')!.textContent = wordsOf('launch:off', 'pin').off;
  const head = frag(draw!.head('Show and hide', 'Pages', '')).firstElementChild as HTMLElement;
  const chg = cloneOf('#set-secs .set-chg.ss');
  chg.classList.remove('on');
  chg.querySelector('.n')!.textContent = '1';
  for (const n of [still(row), still(head)]) for (const x of n.querySelectorAll('[aria-checked], [aria-expanded]')) (x.removeAttribute('aria-checked'), x.removeAttribute('aria-expanded'));
  return `<div class="hr-chg"><div class="hr-chgside" id="set-secs">${chg.outerHTML}</div><div class="hr-chgmain">${head.outerHTML}<div class="box set-grp hr-grp">${row.outerHTML}</div></div></div>`;
}
function example(a: At) {
  const html = a.key === 'editmenu:on' ? editHtml() : a.key === 'tell:on' ? tellHtml() : a.key === 'settings:find' ? findHtml() : changedHtml();
  return pic(markAll(html, [a], sel, a), a.place, ' hr-dk');
}
function lookOf(r: Row) {
  const a = r.at[0];
  const html = a.key === 'editmenu:on' ? `<span class="hr-cm hr-lkem">${frag(editHtml()).querySelector('[data-em="1"]')!.outerHTML}</span>`
    : a.key === 'tell:on' ? `<div class="hr-tell hr-lktell">${tellInner(FAR_TAB.title)}</div>`
    : a.key === 'settings:find' ? `<div class="hr-lkfind">${findField().outerHTML}</div>`
    : `<span class="hr-lkbtn">${(still(frag(draw!.rsBtn('', true)).firstElementChild as HTMLElement)).outerHTML.replace('class="', 'class="hr-keep ')}</span>`;
  return html.replace(/<button /g, '<button tabindex="-1" ');
}

addPart({ rows: () => [...editRow(), ...tellRow(), ...setRows()], sel, look: lookOf, example, home: 'show/all', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function popsHtml() {
  return (editRow().length ? box('edtext', 'Right-click on text', rows(editRow()), 'The menu a right-click on selected text or a text box opens: cut, copy, paste and select all. Only in the desktop app.') : '') +
    box('tell', 'Notices on a refused drop or click', rows(tellRow()), "A small card by the pointer when a drop or a click can't work where you tried it.") +
    box('settings', 'Settings', rows(setRows()), keyed('This window.{settings: % opens it.} The settings button at the right end of the dock opens it too.'));
}
