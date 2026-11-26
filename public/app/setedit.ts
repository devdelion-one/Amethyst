import { actRow, band, menuHead, MENU_IC, openBtn, ROW_IC, SW_ADD, topRow } from '../base/controls.ts';
import { fmtBarHtml } from '../base/fmt.ts';
import { BTN_OF, isOff, keyed, MENUS, PREFS } from '../base/prefs.ts';
import { selBarHtml } from '../base/quote.ts';
import { esc } from '../base/util.ts';
import { brBarPic } from '../browser/browser.ts';
import { styleRows } from '../editor/filestyle.ts';
import { padBarPic } from '../editor/pad.ts';
import { addPart, box, isOn, mark, pic, rowHtml, subh } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const EDIT_LEAD = 'The sketch board, the scratch pad, the bars over selected text, a browser tab and the debug column. Click a switch, or the ringed part in the picture a row opens, to hide or show it. Right-clicking it in the app does the same.';

const SEL: Record<string, string> = {
  'fmt:off:bar': '.hr-fmt', 'fmt:off:file': '[data-ed="file"]', 'fmt:off:chat': '[data-ed="chat"]',
  'tochat:on': '.hr-selbar', 'tochat:pick': '.sb-to', 'br:off:paint': '.hr-paint', 'br:off:zoom': '.br-zoom',
  'edfoot:off:tab': '[data-ed="tab"]', 'edfoot:off:wide': '[data-ed="wide"]', 'barmenu:open': '.hr-hov > .tb-open', 'colors:add': '.sw-add',
};
const sel = (a: At) => SEL[a.id ? `${a.key}:${a.id}` : a.key] || BTN_OF[`${a.key}:${a.id}`] || '';

const item = (key: string, id: string, place: string, o: Partial<Row> = {}): Row => ({ id: `${key}:${id}`, key, at: [{ key, place, id }], ...o });
const one = (key: string, place: string): Row => ({ id: key, key, at: [{ key, place }] });
const barNote = () => (isOff('fmt:off', 'bar') ? 'Only shows while the formatting bar shows.' : '');
const footHere = (a: At) => (a.place === 'kfoot' ? 'follows the same switch' : isOn(a) ? 'shown here: click the ringed part to hide it' : 'hidden here: click it to show it');

const sketchRows = (): Row[] => ['move', 'paint', 'bg'].map((id) => item('pad:off', id, 'board'));
const scratchRows = (): Row[] => ['file', 'chat'].map((id) => item('fmt:off', id, 'ssel'));
const footRows = (): Row[] => [
  { id: 'edfoot:off:tab', key: 'edfoot:off', linked: true, here: footHere, at: [{ key: 'edfoot:off', place: 'sfoot', id: 'tab' }, { key: 'edfoot:off', place: 'kfoot', id: 'tab' }] },
  item('edfoot:off', 'wide', 'wfoot'),
];
const fmtBtnRows = (): Row[] => ['bold', 'italic', 'strike', 'code', 'link'].map((id) => item('fmt:off', id, 'fmtsel', { note: barNote }));
const fmtRows = (): Row[] => [item('fmt:off', 'bar', 'fmtsel'), ...fmtBtnRows()];
const selRows = (): Row[] => [one('tochat:on', 'fsel'), one('tochat:pick', 'fsel')];
const brRows = (): Row[] => ['inspect', 'paint', 'to', 'zoom'].map((id) => item('br:off', id, 'brbar'));
const menuRows = (): Row[] => [one('barmenu:open', 'bmenu'), one('colors:add', 'cmenu')];

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const outer = (f: DocumentFragment) => [...f.children].map((x) => x.outerHTML).join('');
const fmtBar = (join = '') => `<div class="hr-fmt"${join ? ` data-join="${join}"` : ''}>${fmtBarHtml()}</div>`;
function edSel() {
  const real = document.getElementById('ed-sel');
  const f = frag(real ? real.outerHTML : '<span><button>+ file</button><button>+ chat</button></span>');
  const s = f.firstElementChild as HTMLElement;
  s.removeAttribute('id');
  s.hidden = false;
  s.className = 'pn-edsel';
  s.dataset.join = 'after';
  const [file, chat] = [...s.querySelectorAll('button')];
  file?.removeAttribute('id');
  chat?.removeAttribute('id');
  if (file) file.dataset.ed = 'file';
  if (chat) chat.dataset.ed = 'chat';
  return s.outerHTML;
}
function footBtns() {
  const b = (id: string, ed: string, word: string) => {
    const real = document.getElementById(id)?.cloneNode(true) as HTMLElement | undefined;
    if (!real) return `<button data-ed="${ed}">${word}</button>`;
    real.removeAttribute('id');
    real.dataset.ed = ed;
    return real.outerHTML;
  };
  return [b('ed-tab', 'tab', '⇥ tab'), b('ed-wide', 'wide', 'wide')];
}
const footHtml = (kind: string) => {
  const [tab, wide] = footBtns();
  return `<div class="panel hr-edfoot" data-kind="${kind}"><div class="hr-above"></div><div class="foot"><span class="grow"></span>${tab}${kind === 'wfoot' ? wide : ''}</div></div>`;
};
const boardHtml = () => `<div class="hr-board">${padBarPic()}</div>`;
const selText = (inner: string, row: string) => `<div class="hr-tx hr-seltx"><span class="hr-gut">1</span><div class="hr-ln">${inner}<div class="hr-selrow">${row}</div></div></div>`;
const scratchSel = () => selText('<span class="hr-selt">the plan for the sketch board</span>', fmtBar('after') + edSel());
function fileSel() {
  const f = frag(fmtBar('after'));
  const bar = f.firstElementChild as HTMLElement;
  for (const b of bar.querySelectorAll<HTMLElement>('[data-fmt]')) b.hidden = isOff('fmt:off', b.dataset.fmt!);
  if (isOff('fmt:off', 'bar')) bar.classList.add('hr-gone');
  return selText('The <span class="hr-selt">sketch board first,</span> then the browser.', bar.outerHTML + `<div class="pn-sel hr-selbar" data-join="after">${selBarHtml('＋ add to chat')}</div>`);
}
function brHtml() {
  const f = frag(brBarPic());
  const paint = [...f.querySelectorAll('[data-br="paint"], [data-br="tool"], [data-br="snap"]')];
  if (paint.length) {
    const g = document.createElement('span');
    g.className = 'hr-paint';
    paint[0].before(g);
    g.append(...paint);
  }
  f.querySelector('.br-url')?.setAttribute('value', 'http://localhost:3000/');
  return `<div class="hr-brbar">${outer(f)}</div>`;
}
function menuHtml() {
  const e = PREFS['br:off'];
  const rows = (e.items || []).map(([id, label]) => {
    const k = `br:off:${id}`, say = e.tips?.[id] || '';
    const row = topRow(!isOff('br:off', id), `data-pk="br:off" data-pi="${esc(id)}"${say ? ` title="${esc(label)}&#10;${esc(say)}"` : ''}`, ROW_IC[k]?.() || '', esc(label));
    const html = actRow(k, row, openBtn('br:off', id, BTN_OF[k] || '', esc(label)), false);
    return id === 'paint' ? html.replace('class="tb-ord tb-use"', 'class="tb-ord tb-use hr-hov"') : html;
  }).join('');
  return `<div class="hr-cm">${menuHead(MENU_IC.browser?.() || '', MENUS.browser)}${band('buttons')}${rows}</div>`;
}
function colorHtml() {
  const fly = frag(styleRows([], 'fsc')).querySelector<HTMLElement>('.pk-fly');
  if (!fly) return '';
  const grid = fly.querySelector('.pk-grid');
  if (grid && !grid.querySelector('.sw-add')) grid.insertAdjacentHTML('beforeend', SW_ADD);
  return `<div class="hr-cm hr-cfly">${fly.outerHTML}</div>`;
}

const ats = (list: Row[], place?: string) => list.flatMap((r) => r.at).filter((a) => !place || a.place === place);
function example(a: At) {
  const p = (html: string, list: At[]) => pic(mark(html, list, sel, a), a.place, ' hr-dk');
  if (a.place === 'board') return p(boardHtml(), ats(sketchRows()));
  if (a.place === 'sfoot' || a.place === 'kfoot') return p(footHtml(a.place), ats(footRows(), a.place));
  if (a.place === 'wfoot') return p(footHtml(a.place), [footRows()[0].at[0], a]);
  if (a.place === 'ssel') return p(scratchSel(), ats(scratchRows()));
  if (a.place === 'fmtsel') return p(scratchSel(), ats(fmtRows()).concat(ats(scratchRows())));
  if (a.place === 'fsel') return p(fileSel(), ats(selRows()));
  if (a.place === 'brbar') return p(brHtml(), ats(brRows()));
  if (a.place === 'bmenu') return p(menuHtml(), [a]);
  return p(colorHtml(), [a]);
}
const pickEl = (html: string, s: string) => {
  const el = s ? frag(html).querySelector<HTMLElement>(s) : null;
  if (!el) return null;
  el.hidden = false;
  return el;
};
function lookOf(r: Row) {
  const a = r.at[0], k = a.id ? `${a.key}:${a.id}` : a.key;
  let html = '';
  if (k === 'fmt:off:bar') html = fmtBar();
  else if (a.key === 'fmt:off' && (a.id === 'file' || a.id === 'chat')) html = `<span class="pn-edsel">${pickEl(edSel(), sel(a))?.outerHTML || ''}</span>`;
  else if (a.key === 'fmt:off') html = `<div class="hr-fmt">${pickEl(fmtBar(), sel(a))?.outerHTML || ''}</div>`;
  else if (a.key === 'pad:off') html = `<div class="pd-bar hr-lkbar">${pickEl(padBarPic(), sel(a))?.outerHTML || ''}</div>`;
  else if (a.key === 'edfoot:off') html = `<div class="panel hr-lkfoot"><div class="foot">${pickEl(footHtml('wfoot'), sel(a))?.outerHTML || ''}</div></div>`;
  else if (k === 'tochat:on') html = `<div class="pn-sel">${selBarHtml('＋ add to chat')}</div>`;
  else if (k === 'tochat:pick') html = `<div class="pn-sel">${pickEl(selBarHtml(), '.sb-to')?.outerHTML || ''}</div>`;
  else if (a.key === 'br:off') html = `<div class="br-bar hr-lkbar">${pickEl(brHtml(), sel(a))?.outerHTML || ''}</div>`;
  else if (k === 'barmenu:open') html = `<span class="hr-cm hr-lkopen">${openBtn('br:off', 'paint', BTN_OF['br:off:paint'], 'paint')}</span>`;
  else html = `<span class="hr-cm"><span class="pk-grid">${SW_ADD}</span></span>`;
  return html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
}

addPart({ rows: () => [...sketchRows(), ...scratchRows(), ...footRows(), ...fmtRows(), ...selRows(), ...brRows()], sel, look: lookOf, example, home: 'show/edit', each: true });
addPart({ rows: menuRows, sel, look: lookOf, example, home: 'show/all', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function editPartHtml() {
  return box('sketch', 'Sketch board', rows(sketchRows()), 'A board to paint on and drop pictures into. The sketch board button in the top bar opens it. Its toolbar floats at the bottom of the board.') +
    box('scratch', 'Scratch pad', rows(scratchRows()), keyed('A page for quick notes. The scratch pad button in the top bar opens it{scratch:, and so does %}. These buttons show beside the formatting bar when you select text in it.')) +
    box('edfoot', 'The bar under the scratch pad, sketch board and boards', rows(footRows()), "The bar along the bottom of the editor's panel while it shows the scratch pad, the sketch board, or a board open outside a tab. Right-clicking it hides and shows the same buttons.") +
    box('fmt', 'Formatting bar', rows([fmtRows()[0]]) + `<div class="hr-sublook">${subh('Its buttons')}${rows(fmtBtnRows())}</div>`, 'The small bar that shows over text you select in a file or in the scratch pad.') +
    box('sel', 'Text selected in a file or terminal', rows(selRows()), 'Select text in a file or a terminal, and a small bar shows beside it.') +
    box('br', "Browser tab's bar", rows(brRows()), 'The bar at the top of a browser tab, with its address. Right-clicking it hides and shows the same buttons. Only in the desktop app.');
}
export const menusHtml = () => box('menus', 'Right-click menus and color menus', rows(menuRows()), "Every bar's right-click menu, and every color menu: right-click a file or a folder, then color.");
