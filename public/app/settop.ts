import { pinDefault, pinsHtml, quickKinds, togglePin } from './header.ts';
import { MODES, railViews } from './modes.ts';
import { btnShown, dashPicHtml, inDash, picHtml, railSel } from './slots.ts';
import type { SlotView } from './slots.ts';
import { UE_ICON, ueBars } from '../ue/ue.ts';
import { dbarHtml } from '../debug/column.ts';
import { keyChip, modeOrder, TOPBAR } from '../base/controls.ts';
import { modeGem, workMark } from '../base/kinds.ts';
import { atWs } from '../base/model.ts';
import { BTN_OF, isOff, pref, PREFS } from '../base/prefs.ts';
import { esc } from '../base/util.ts';
import { addPart, box, isOn, mark, markAll, pic, rowHtml, subh, wordsOf } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const TOP_LEAD = 'What shows in the rail, and which edge it sits at. Click a switch to hide or show a button. Right-clicking the rail does the same, and dragging a button moves it to another cell, also into the dashboard and back.';
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
const sideRow = (): Row => ({ id: 'rail:right', key: 'rail:right', sw: 'onoff', plain: true, at: [{ key: 'rail:right', place: 'top' }] });
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

addPart({ rows: () => [sideRow(), ...barRows(), ...pinRows(), ...alsoRows(), dashRow()], sel, look: () => '', example, home: 'show/top' });
addPart({ rows: ueRows, sel, look: () => '', example, home: 'show/quick' });
addPart({ rows: dbgRows, sel, look: () => '', example, home: 'show/edit' });

const sub = (t: string) => (t ? `<div class="hr-sub">${esc(t)}</div>` : '');
export function topHtml() {
  let rows = '';
  for (const t of trays()) {
    rows += subh(TRAYS[t.g][0]) + sub(TRAYS[t.g][1]) + t.rows.map((r) => rowHtml(barRow(r))).join('');
    if (t.g === 'make' && pinRows().length) rows += subh('Pinned under new') + sub('Buttons that make one thing in one click. They sit just under new. Pick which ones.') + pinRows().map(rowHtml).join('');
  }
  return box('top', 'Rail', rowHtml(sideRow()) + rows, 'The column of buttons down the left or right edge of the main window: the panels at the top, then the modes, and the tools at the bottom. Drag a button to another cell to move it, or up into the dashboard. Drag an empty spot of the rail to move it to the other edge. Only Window 1 has one.') +
    box('topalso', 'Also on the rail', alsoRows().map(rowHtml).join('')) +
    box('dash', 'Dashboard', rowHtml(dashRow()), 'The row above the windows. It starts with start agent at its right end. Drag any rail button into it, or back to the rail. Right-click an empty cell to put a button there. Only Window 1 has one.');
}
export const ueBarHtml = () => (ueRows().length ? box('uebar', "Unreal build window's bar", ueRows().map(rowHtml).join(''), 'The bar at the top of the Unreal build window, and the bar over each of its logs. Right-clicking either bar hides and shows the same buttons.') : '');
export const dbgBarHtml = () => (dbgRows().length ? box('dbgbar', "Debug column's bar", dbgRows().map(rowHtml).join(''), 'The bar at the top of the debug column, with the steps and stop. Right-clicking it hides and shows the same buttons.') : '');
