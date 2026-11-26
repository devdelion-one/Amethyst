import { pinDefault, pinsHtml, quickKinds, togglePin } from './header.ts';
import { MODES, PLUS } from './modes.ts';
import { UE_ICON, ueBars } from '../ue/ue.ts';
import { dbarHtml } from '../debug/column.ts';
import { modeOrder, TOPBAR } from '../base/controls.ts';
import { modeGem, workMark } from '../base/kinds.ts';
import { atWs } from '../base/model.ts';
import { BTN_OF, isOff, pref, PREFS } from '../base/prefs.ts';
import { TAB_ICON } from '../base/topbar.ts';
import { esc } from '../base/util.ts';
import { addPart, bigPic, box, isOn, mark, pic, rowHtml, subh, wordsOf } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const TOP_LEAD = 'What shows in the top bar. Click a switch, or a button in the picture, to hide or show it. Right-clicking the top bar does the same.';
type Tray = (typeof TOPBAR)[number];
type TopRow = Tray['rows'][number];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TRAYS: Record<string, [string, string]> = {
  modes: ['Modes', 'The mode buttons, each in its own tray, at the left end.'],
  ue: ['Unreal', 'Only while Unreal Engine 5 support is on, in Settings, Unreal, in a project with a .uproject.'],
  make: ['Create', ''],
  quick: ['Quick tools', ''],
  agent: ['Agents', ''],
  win: ['Windows', 'At the right end.'],
};
const WS_OUT = ['make', 'quick', 'agent'];
const TRAY_ORDER = ['ue', 'make', 'quick', 'agent', 'win'];
const liveRows = (g: Tray) => g.rows.filter((r) => (!r.when || r.when()) && !(atWs() && r.id === 'pins')).sort((a, b) => (g.g === 'modes' ? modeOrder().indexOf(a.id) - modeOrder().indexOf(b.id) : 0));
const trays = () => TOPBAR.filter((g) => TRAYS[g.g] && !(atWs() && WS_OUT.includes(g.g))).map((g) => ({ g: g.g, rows: liveRows(g) })).filter((t) => t.rows.length);

const shownNow = (r: TopRow) => (r.id ? !isOff(r.k, r.id) : !!pref(r.k));
const barTip = (r: TopRow) => () => {
  const name = cap(r.label.replace(/ ▾$/, ''));
  if (r.fixed) return `${name}: always shown\nThis one can't be hidden.`;
  return shownNow(r) ? `${name}: shown\nClick to hide it.` : `${name}: hidden\nClick to show it.`;
};
const barAt = (r: TopRow): At => ({ key: r.k, place: 'top', ...(r.id ? { id: r.id } : {}), ...(r.fixed ? { fix: true, why: "the editor button can't be hidden" } : {}), tip: barTip(r) });
const barRow = (r: TopRow): Row => ({ id: r.id ? `${r.k}:${r.id}` : r.k, key: r.k, at: [barAt(r)] });
const barRows = () => trays().flatMap((t) => t.rows.map(barRow));

const pinned = (k: string) => !!quickKinds().find((q) => q[0] === k)?.[2];
const pinAt = (k: string): At => ({
  key: 'quick:pins', place: 'make', id: k,
  on: () => pinned(k),
  set: (v) => void (pinned(k) !== v && togglePin(k)),
  def: pinDefault(k),
  tip: () => `${wordsOf('quick:pins', k).label}: ${pinned(k) ? 'pinned\nClick to take it out of the top bar.' : 'not pinned\nClick to pin it beside new ▾.'}`,
});
const pinRows = (): Row[] => (atWs() ? [] : quickKinds().map(([k]) => ({ id: `quick:pins:${k}`, key: 'quick:pins', at: [pinAt(String(k))] })));
const alsoRows = (): Row[] => [
  { id: 'work', key: 'edWork', prep: 'on', tail: 'The counts still show.', at: [{ key: 'edWork', place: 'edbtn' }, { key: 'switch:wkOn', place: 'modebtn' }] },
  { id: 'bar:showTab', key: 'bar:showTab', at: [{ key: 'bar:showTab', place: 'edge' }] },
];
const items = (key: string) => (PREFS[key].items || []).map(([id]) => ({ id: `${key}:${id}`, key, at: [{ key, place: key === 'ue:off' ? 'ue' : 'dbg', id }] }) as Row);
const ueRows = (): Row[] => (pref('ue:on') ? items('ue:off') : []);
const dbgRows = (): Row[] => (pref('ue:on') && pref('debug:on') ? items('debug:off') : []);

const WK_SEL: Record<string, string> = { edWork: '.sets[data-kind=editor] .ly-wk', 'switch:wkOn': '.sets[data-kind=chat] .ly-wk', 'bar:showTab': '#bar-tab' };
const topSel = (a: At) => TOPBAR.flatMap((g) => g.rows).find((r) => r.k === a.key && (r.id || '') === (a.id || ''))?.sel || '';
const sel = (a: At) => WK_SEL[a.key] || (a.place === 'top' ? topSel(a) : a.key === 'quick:pins' ? `#quick [data-qk="${a.id}"]` : BTN_OF[`${a.key}:${a.id}`] || '');

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const unoff = (root: ParentNode) => root.querySelectorAll('.off').forEach((x) => x.classList.remove('off'));
const modeGroup = (k: string, inner = '') => `<nav class="sets" data-kind="${k}" aria-label="${k} sets"><button data-mode="${k}"${k === 'editor' ? ' class="on"' : ''} aria-label="${esc(k === 'editor' ? 'Editor' : cap(MODES[k].label!))}">${k === 'editor' ? modeGem('editor') : MODES[k].icon!()}${inner}</button>${!atWs() && ['editor', 'chat', 'term'].includes(k) ? `<button class="ly-add" aria-label="new set">${PLUS}</button>` : ''}</nav>`;

let barCache: string | null = null;
function barHtml() {
  if (barCache != null) return barCache;
  const real = document.querySelector<HTMLElement>('#app > header.bar');
  if (!real) return (barCache = '');
  const bar = real.cloneNode(true) as HTMLElement;
  bar.className = 'bar';
  bar.removeAttribute('data-place');
  bar.querySelector('#here')?.remove();
  bar.querySelector('.tray[data-g=fold]')?.remove();
  const acts = bar.querySelector('.actions');
  for (const g of TRAY_ORDER) {
    const t = acts?.querySelector(`:scope > .tray[data-g=${g}]`) || document.querySelector(`#bar-fold .tray[data-g=${g}]`)?.cloneNode(true);
    if (t) acts!.append(t);
  }
  for (const x of bar.querySelectorAll('.lift, .ph, .sorting')) x.classList.remove('lift', 'ph', 'sorting');
  unoff(bar);
  if (atWs()) {
    for (const g of WS_OUT) bar.querySelector(`.tray[data-g=${g}]`)?.remove();
    bar.querySelector('#btn-pins')?.remove();
  } else bar.querySelector('#quick .q-ws')?.remove();
  if (!pref('ue:on')) bar.querySelector('.tray[data-g=ue]')?.remove();
  const ub = bar.querySelector<HTMLElement>('#btn-ue');
  if (ub && !ub.innerHTML.trim()) ub.innerHTML = `${UE_ICON}<span class="ue-cf">…</span><span class="ue-st"></span>`;
  const sw = bar.querySelector<HTMLElement>('#switch');
  if (sw) {
    sw.hidden = false;
    const want = liveRows(TOPBAR.find((g) => g.g === 'modes')!).map((r) => r.id);
    want.forEach((k, i) => {
      if (sw.querySelector(`.sets[data-kind="${k}"]`)) return;
      const next = want.slice(i + 1).map((n) => sw.querySelector(`.sets[data-kind="${n}"]`)).find(Boolean);
      const g = frag(modeGroup(k));
      if (next) sw.insertBefore(g, next);
      else sw.append(g);
    });
  }
  return (barCache = bar.outerHTML);
}
const moreHtml = () => {
  const b = document.querySelector<HTMLElement>('#app #btn-more')?.cloneNode(true) as HTMLElement | undefined;
  b?.classList.remove('off');
  return b?.outerHTML || '<button id="btn-more">new ▾</button>';
};
const makeTray = () => `<div class="bar hr-mbar"><div class="tray" data-g="make"><span id="quick">${pinsHtml(true)}</span>${moreHtml()}</div></div>`;
const wkPic = (place: string, on: boolean) => `<div class="bar hr-mbar">${place === 'edbtn'
  ? `<nav class="sets" data-kind="editor" aria-label="editor sets"><button data-mode="editor" class="on" aria-label="Editor">${modeGem('editor')}${workMark()}</button><button class="ly" aria-label="layout 2">${modeGem('editor')}${on ? workMark() : ''}</button><button class="ly-add" aria-label="new layout">${PLUS}</button></nav>`
  : modeGroup('chat', `<b class="md-n" data-st="done">2</b>${workMark()}`)}</div>`;
const tabBtn = () => `<button type="button" id="bar-tab" class="near" aria-label="show the top bar">${TAB_ICON}</button>`;
const edgePic = () => `<div class="hr-edge2"><div class="hr-shell"></div>${tabBtn()}</div>`;
const LOG_IDS = ['refresh', 'asfile'];
const ueBar = (id = '') => {
  const f = frag(LOG_IDS.includes(id) ? ueBars().log : ueBars().top);
  return `<div class="hr-uebar">${[...f.children].map((x) => x.outerHTML).join('')}</div>`;
};
const dbgBar = () => {
  const f = frag(dbarHtml());
  unoff(f);
  return `<div class="hr-dbg">${[...f.children].map((x) => x.outerHTML).join('')}</div>`;
};

function example(a: At) {
  if (a.place === 'top') return pic(mark(barHtml(), barRows().map((r) => r.at[0]), sel, a), 'top', ' hr-ex hr-tbar');
  if (a.place === 'make') return pic(mark(makeTray(), pinRows().map((r) => r.at[0]), sel, a), 'make', ' hr-ex hr-fig');
  if (a.place === 'edbtn' || a.place === 'modebtn') return pic(mark(wkPic(a.place, isOn(a)), [a], sel, a), a.place, ' hr-ex hr-fig');
  if (a.place === 'edge') return pic(mark(edgePic(), [a], sel, a), 'edge', ' hr-ex hr-fig');
  if (a.place === 'ue') return pic(mark(ueBar(a.id), ueRows().map((r) => r.at[0]), sel, a), 'ue', ' hr-ex');
  return pic(mark(dbgBar(), dbgRows().map((r) => r.at[0]), sel, a), 'dbg', ' hr-ex');
}

const pick = (html: string, s: string) => {
  const el = s ? frag(html).querySelector<HTMLElement>(s) : null;
  if (!el) return null;
  el.hidden = false;
  el.classList.remove('off');
  return el;
};
function lookOf(r: Row) {
  const a = r.at[0];
  let html = '';
  if (a.place === 'top' && a.key === 'modesHidden') html = modeGroup(a.id!, a.id === 'chat' ? '<b class="md-n" data-st="done">2</b>' : '');
  else if (a.place === 'top') {
    const el = pick(barHtml(), sel(a));
    html = el ? `<div class="tray">${el.outerHTML}</div>` : '';
  } else if (a.place === 'make') html = `<div class="tray"><span id="quick"><span class="q-pj">${pick(makeTray(), sel(a))?.outerHTML || ''}</span></span></div>`;
  else if (r.id === 'work') html = modeGroup('chat', `<b class="md-n" data-st="done">2</b>${r.at.some(isOn) ? workMark() : ''}`);
  else if (a.place === 'edge') html = `<span class="hr-tabk">${tabBtn()}</span>`;
  else if (a.place === 'ue') {
    const el = pick(ueBar(a.id), sel(a));
    html = el ? `<div class="hr-uebar"><div class="${LOG_IDS.includes(a.id!) ? 'ue-lbar' : 'ue-top'}">${el.outerHTML}</div></div>` : '';
  } else {
    const el = pick(dbgBar(), sel(a));
    html = el ? `<div class="hr-dbg"><div class="dbar">${el.outerHTML}</div></div>` : '';
  }
  return html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '').replace(/ draggable="true"/g, '');
}

const topRows = () => [...barRows(), ...pinRows()];
addPart({ rows: () => [...topRows(), ...alsoRows()], sel, look: lookOf, example, home: 'show/top' });
addPart({ rows: ueRows, sel, look: lookOf, example, home: 'show/quick' });
addPart({ rows: dbgRows, sel, look: lookOf, example, home: 'show/edit' });

const sub = (t: string) => (t ? `<div class="hr-sub">${esc(t)}</div>` : '');
const BIG_CAP = 'The top bar, as it looks in the app. Point at a button to find its row, and click it to hide or show it. Dashed and struck through: hidden. The project name at its left end is left out.';
export function topHtml() {
  barCache = null;
  const big = bigPic(pic(mark(barHtml(), barRows().map((r) => r.at[0]), sel, null, true), 'top', ' hr-tbar'), BIG_CAP);
  let rows = '';
  for (const t of trays()) {
    rows += subh(TRAYS[t.g][0]) + sub(TRAYS[t.g][1]) + t.rows.map((r) => rowHtml(barRow(r))).join('');
    if (t.g === 'make' && pinRows().length) rows += subh('Pinned beside new ▾') + sub('Buttons that make one thing in one click. They sit just left of new ▾. Pick which ones.') + pinRows().map(rowHtml).join('');
  }
  return box('top', 'Top bar', big + rows, 'The bar along the top of the main window: the mode buttons at the left end, then trays of buttons up to the right end. Only Window 1 has one.') +
    box('topalso', 'Also on the top bar', alsoRows().map(rowHtml).join(''));
}
export const ueBarHtml = () => (ueRows().length ? box('uebar', "Unreal build window's bar", ueRows().map(rowHtml).join(''), 'The bar at the top of the Unreal build window, and the bar over each of its logs. Right-clicking either bar hides and shows the same buttons.') : '');
export const dbgBarHtml = () => (dbgRows().length ? box('dbgbar', "Debug column's bar", dbgRows().map(rowHtml).join(''), 'The bar at the top of the debug column, with the steps and stop. Right-clicking it hides and shows the same buttons.') : '');
