import { pinDefault, pinsHtml, quickKinds, togglePin } from './header.ts';
import { MODES, railViews } from './modes.ts';
import { btnShown, dashPicHtml, inDash, picHtml, railSel } from './slots.ts';
import type { SlotView } from './slots.ts';
import { UE_ICON, ueBars } from '../ue/ue.ts';
import { dbarHtml } from '../debug/column.ts';
import { colorTray, keyChip, modeOrder, NB_LOOKS, newBtnColor, setNewBtnColor, TOPBAR } from '../base/controls.ts';
import { modeGem, workMark } from '../base/kinds.ts';
import { atWs } from '../base/model.ts';
import { BTN_OF, isOff, pref, PREFS, setPref } from '../base/prefs.ts';
import { esc } from '../base/util.ts';
import { addPart, box, isOn, mark, markAll, pic, rowHtml, subh, wordsOf } from './setstd.ts';
import type { At, Choice, Row } from './setstd.ts';

export const TOP_LEAD = 'What shows in the rail and the dashboard, and which edge the rail sits at. Click a switch to hide or show a button. Right-clicking the rail does the same, and dragging a button moves it to another cell, also into the dashboard and back.';
type Tray = (typeof TOPBAR)[number];
type TopRow = Tray['rows'][number];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TRAYS: Record<string, [string, string]> = {
  strip: ['Panels', 'They start at the top of the rail.'],
  modes: ['Modes', 'They start under the panels. Each layout and set has a button of its own under its mode.'],
  agent: ['Agents', 'New agent starts in the dashboard, at its right end.'],
  make: ['Create', 'The tools from here on start at the bottom of the rail, above the site button.'],
  quick: ['Quick tools', ''],
  ue: ['Unreal', 'Only while Unreal Engine 5 support is on, in Settings, Unreal, in a project with a .uproject.'],
  win: ['Windows', ''],
};
const liveRows = (g: Tray) => g.rows.filter((r) => !r.when || r.when()).sort((a, b) => (g.g === 'modes' ? modeOrder().indexOf(a.id) - modeOrder().indexOf(b.id) : 0));
const trays = () => TOPBAR.filter((g) => TRAYS[g.g]).map((g) => ({ g: g.g, rows: liveRows(g) })).filter((t) => t.rows.length);

const shownNow = (r: TopRow) => (r.id ? !isOff(r.k, r.id) : !!pref(r.k));
const barTip = (r: TopRow) => () => {
  const name = cap(r.label);
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
  tip: () => `${wordsOf('quick:pins', k).label}: ${pinned(k) ? 'pinned\nClick to take it out of the rail.' : 'not pinned\nClick to pin it under new.'}`,
});
const pinRows = (): Row[] => (atWs() ? [] : quickKinds().map(([k]) => ({ id: `quick:pins:${k}`, key: 'quick:pins', at: [pinAt(String(k))] })));
const alsoRows = (): Row[] => [
  { id: 'work', key: 'edWork', prep: 'on', tail: 'The counts still show.', at: [{ key: 'edWork', place: 'edbtn' }, { key: 'switch:wkOn', place: 'modebtn' }] },
];
const items = (key: string) => (PREFS[key].items || []).map(([id]) => ({ id: `${key}:${id}`, key, at: [{ key, place: key === 'ue:off' ? 'ue' : 'dbg', id }] }) as Row);
const ueRows = (): Row[] => (pref('ue:on') ? items('ue:off') : []);
const dbgRows = (): Row[] => (pref('ue:on') && pref('debug:on') ? items('debug:off') : []);

const WK_SEL: Record<string, string> = { edWork: '.sets[data-kind=editor] .ly-wk', 'switch:wkOn': '.sets[data-kind=orch] .ly-wk' };
const rowOf = (a: At) => TOPBAR.flatMap((g) => g.rows).find((r) => r.k === a.key && (r.id || '') === (a.id || ''));
const topSel = (a: At) => (a.key === 'modesHidden' ? `:is(#switch, #dash) .sets[data-kind=${a.id}] > button` : rowOf(a)?.sel || '');
const sel = (a: At) => DASH_SEL[a.key] || WK_SEL[a.key] || (a.place === 'top' ? topSel(a) : a.key === 'quick:pins' ? `[data-qk="${a.id}"]` : BTN_OF[`${a.key}:${a.id}`] || '');

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const unoff = (root: ParentNode) => root.querySelectorAll('.off').forEach((x) => x.classList.remove('off'));

const liveModes = () => liveRows(TOPBAR.find((g) => g.g === 'modes')!).map((r) => r.id);
const rowOfBtn = (ref: string) => TOPBAR.flatMap((g) => g.rows).find((r) => r.sel === railSel(ref));
const inPic = (v: SlotView) => {
  if (v.kind !== 'btn') return liveModes().includes(v.kind);
  if (v.ref.startsWith('pin:')) return v.shown;
  if (btnShown(v.ref)) return true;
  const r = rowOfBtn(v.ref);
  return !!r && (!r.when || r.when()) && !shownNow(r);
};
const fill = (v: SlotView) => {
  if (v.kind !== 'btn' || v.html) return v.html;
  const el = document.querySelector<HTMLElement>(`#app ${railSel(v.ref)}`)?.cloneNode(true) as HTMLElement | undefined;
  if (!el) return '';
  el.hidden = false;
  el.classList.remove('off', 'lift', 'landed', 'peek');
  el.querySelector(atWs() ? '.q-pj' : '.q-ws')?.remove();
  if (el.id === 'btn-ue' && !el.innerHTML.trim()) el.innerHTML = `${UE_ICON}<span class="ue-cf">…</span><span class="ue-st"></span>`;
  return el.outerHTML;
};
const railHtml = () => picHtml(railViews().filter(inPic), fill);
const dashPic = () => dashPicHtml(railViews().filter(inPic), fill);
const rowInDash = (a: At) => {
  if (a.key === 'modesHidden') return !!railViews().find((v) => v.kind === a.id && inDash(v.ref));
  const r = rowOf(a), ref = r && railViews().find((v) => v.kind === 'btn' && railSel(v.ref) === r.sel)?.ref;
  return !!ref && inDash(ref);
};
const DASH_SEL: Record<string, string> = { 'dash:on': '#dash' };
const EDGES: Choice[] = [['left', 'Left', 'The rail is at the left edge of the window. The explorer opens from the same side.'], ['right', 'Right', 'The rail is at the right edge of the window. The explorer opens from the same side.']];
const sideRow = (): Row => ({
  id: 'rail:right', key: 'rail:right', plain: true, at: [{ key: 'rail:right', place: 'top' }],
  pick: { get: () => (pref('rail:right') ? 'right' : 'left'), set: (v) => setPref('rail:right', v === 'right'), def: 'left', reset: 'p:rail:right', choices: () => EDGES },
  note: () => 'You can also drag an empty spot of the rail to the other edge.',
});
const NB_HEX = /^#[0-9a-f]{6}$/i;
let nbHex = '';
const nbNow = () => {
  const c = newBtnColor();
  return NB_HEX.test(c) ? 'any' : c || 'dft';
};
const NB: Choice[] = [...NB_LOOKS.map(([v, l, t]): Choice => [v || 'dft', l, t]), ['any', 'Any colour', 'The button is in the colour you picked.']];
const nbPick = (v: string) => setNewBtnColor(v === 'dft' ? '' : v === 'any' ? nbHex || colorTray()[0]?.hex || '#3a6df0' : v);
const nbColorRow = (): Row => ({
  id: 'newbtn:color', key: 'newbtn:color', plain: true, noPic: true,
  own: { label: 'New agent button colour', desc: 'The button that starts a new chat with an agent, in the dashboard, the rail and at the top of the chat list.', find: 'Accent color on the new agent button New agent button color default clear accent any color' },
  at: [{ key: 'newbtn:color', place: 'g-none', on: () => true }],
  pick: { get: nbNow, set: nbPick, def: 'dft', reset: '', choices: () => NB },
  note: () => 'Right-click the button to change it there too.',
  ctl: () => {
    const c = newBtnColor();
    if (!NB_HEX.test(c)) return '';
    nbHex = c;
    return `<input type="color" class="hr-nbc" data-nb-hex value="${esc(c)}" aria-label="the new agent button's colour" title="Any colour&#10;Pick the new agent button's colour.">`;
  },
  reset: () => setNewBtnColor(''), changed: () => newBtnColor() !== '',
});
const NB_BIG_ON = 'The new agent button shows its label, like + Agent or + Claude, taking 4 cells in the dashboard and showing its label at the top of the chat list.', NB_BIG_OFF = 'The new agent button is a single icon.';
const nbBigRow = (): Row => ({
  id: 'newbtn:big', key: 'newbtn:big', sw: 'onoff', plain: true, noPic: true,
  own: { label: 'New agent button size', desc: 'Applies to the new agent button in the dashboard and at the top of the chat list.', find: `Bigger new agent button ${NB_BIG_ON} ${NB_BIG_OFF}` },
  at: [{ key: 'newbtn:big', place: 'g-none' }],
  state: () => (pref('newbtn:big') ? NB_BIG_ON : NB_BIG_OFF), alt: () => (pref('newbtn:big') ? NB_BIG_OFF : NB_BIG_ON),
  note: () => 'Right-click the button to change it there too.',
});
const nbRows = () => [nbColorRow(), nbBigRow()];
document.addEventListener('input', (e: Event) => {
  const t = e.target as HTMLInputElement;
  if (t.matches?.('#settings [data-nb-hex]')) setNewBtnColor((nbHex = t.value));
});
const dashRow = (): Row => ({ id: 'dash:on', key: 'dash:on', at: [{ key: 'dash:on', place: 'dash' }], ctl: () => keyChip('dashKey') });

const cells = (navs: string[]) => `<nav id="activity" class="hr-rail" style="height:${navs.length * 32}px"><div id="switch" class="slots">${navs.map((n, i) => n.replace('<nav ', `<nav style="top:${i * 32}px" `)).join('')}</div></nav>`;
const moreHtml = () => {
  const b = document.querySelector<HTMLElement>('#app #btn-more')?.cloneNode(true) as HTMLElement | undefined;
  b?.classList.remove('off');
  return b?.outerHTML || '';
};
const makePic = () => {
  const n = quickKinds().length;
  return `<nav id="activity" class="hr-rail" style="height:${(n + 1) * 32}px"><div id="switch" class="slots"><nav class="sv sb" data-g="make" style="top:0">${moreHtml()}</nav><nav class="sv sb" data-g="make" data-span="${n}" style="top:32px;--span:${n}"><span id="quick">${pinsHtml(true)}</span></nav></div></nav>`;
};
const modeNav = (k: string, inner: string) => `<nav class="sets sv" data-kind="${k}">${inner}</nav>`;
const wkPic = (place: string, on: boolean) => cells(place === 'edbtn'
  ? [modeNav('editor', `<button data-mode="editor" class="on" aria-label="Editor">${modeGem('editor')}${workMark()}</button>`), modeNav('editor', `<button class="ly" aria-label="layout 2">${modeGem('editor')}${on ? workMark() : ''}</button>`)]
  : [modeNav('orch', `<button data-mode="orch" aria-label="${esc(cap(MODES.orch.label!))}">${MODES.orch.icon!()}<b class="md-n" data-st="done">2</b>${workMark()}</button>`)]);
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
  if (a.place === 'dash') return pic(mark(dashPic(), [a], sel, a), 'dash', ' hr-ex');
  if (a.place === 'top' && rowInDash(a)) return pic(mark(dashPic(), [a], sel, a), 'top', ' hr-ex');
  const edge = pref('rail:right') ? ' hr-rright' : a.key === 'rail:right' ? ' hr-rleft' : '';
  if (a.key === 'rail:right') return pic(railHtml(), 'top', ' hr-ex hr-railfig' + edge);
  if (a.place === 'top') return pic(markAll(railHtml(), barRows().map((r) => r.at[0]), sel, a), 'top', ' hr-ex hr-railfig' + edge);
  if (a.place === 'make') return pic(mark(makePic(), pinRows().map((r) => r.at[0]), sel, a), 'make', ' hr-ex hr-railfig');
  if (a.place === 'edbtn' || a.place === 'modebtn') return pic(mark(wkPic(a.place, isOn(a)), [a], sel, a), a.place, ' hr-ex hr-railfig');
  if (a.place === 'ue') return pic(mark(ueBar(a.id), ueRows().map((r) => r.at[0]), sel, a), 'ue', ' hr-ex');
  return pic(mark(dbgBar(), dbgRows().map((r) => r.at[0]), sel, a), 'dbg', ' hr-ex');
}

addPart({ rows: () => [sideRow(), ...barRows(), ...pinRows(), ...alsoRows(), dashRow(), ...nbRows()], sel, look: () => '', example, home: 'show/top' });
addPart({ rows: ueRows, sel, look: () => '', example, home: 'show/quick' });
addPart({ rows: dbgRows, sel, look: () => '', example, home: 'show/edit' });

const sub = (t: string) => (t ? `<div class="hr-sub">${esc(t)}</div>` : '');
export function topHtml() {
  let rows = '';
  for (const t of trays()) {
    rows += subh(TRAYS[t.g][0]) + sub(TRAYS[t.g][1]) + t.rows.map((r) => rowHtml(barRow(r))).join('');
    if (t.g === 'make' && pinRows().length) rows += subh('Pinned under new') + sub('Buttons that make one thing in one click. They sit just under new. Pick which ones.') + pinRows().map(rowHtml).join('');
  }
  return box('top', 'Rail', rowHtml(sideRow()) + rows, 'The column of buttons down the left or right edge of the main window. Drag an empty spot of the rail to move it to the other edge. Only Window 1 has one.') +
    box('topalso', 'Also on the rail', alsoRows().map(rowHtml).join('')) +
    box('dash', 'Dashboard', rowHtml(dashRow()), 'The row above the windows. New agent sits at its right end. Drag any rail button into it, or back to the rail. Right-click an empty spot to put a button there. Only Window 1 has one.') +
    box('newbtn', 'New agent button', nbRows().map(rowHtml).join(''), 'The button that starts a new chat, in the dashboard and at the top of the chat list.');
}
export const ueBarHtml = () => (ueRows().length ? box('uebar', "Unreal build window's bar", ueRows().map(rowHtml).join(''), 'The bar at the top of the Unreal build window, and the bar over each of its logs. Right-clicking either bar hides and shows the same buttons.') : '');
export const dbgBarHtml = () => (dbgRows().length ? box('dbgbar', "Debug column's bar", dbgRows().map(rowHtml).join(''), 'The bar at the top of the debug column, with the steps and stop. Right-clicking it hides and shows the same buttons.') : '');
