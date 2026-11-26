import { ICONS } from '../base/controls.ts';
import { keyed, pref, PREFS, setPref } from '../base/prefs.ts';
import { usageAcctPic, usageButtonPic, usageHeadPic, usageWakePic } from '../usage/usage.ts';
import { hgBar, hgHead } from '../freeze-log/hgbar.ts';
import { awayHtml } from './float.ts';
import { addPart, box, isOn, mark, pic, rowHtml, subh } from './setstd.ts';
import type { At, Pick, Row } from './setstd.ts';

export const DOCK_LEAD = 'What shows in the dock, and in the windows its buttons open. Click a switch, or the ringed part in the picture a row opens, to hide or show it. Right-clicking it in the app does the same.';

const SEL: Record<string, string> = {
  'bar:off:windows': '#aw-dock', 'bar:off:hitch': '#st-hitch', 'bar:off:timer': '#btn-timer', 'bar:off:clips': '#btn-clips', 'bar:off:usage': '#st-usage', 'bar:off:update': '#st-update', 'bar:off:keys': '#btn-keys', 'bar:off:settings': '#btn-settings',
  'forget:on': '#fg-btn', 'usage:meter': '#st-usage', 'usage:left': '.um-s em', 'usage:name': '.um-n',
  'usage:popBtn': '.uw-pop', 'usage:accounts': '.uw-acct', 'usage:wake': '.uw-wake', 'clips:add': '[data-cl-add]',
  'hgbar:off:file': '[data-hgdir]', 'hgbar:off:snaps': '.hr-snaps', 'forget:popBtn': '[data-fgpop]', 'forget:info': '[data-fginfo]', 'forget:addLine': '#fg-form', 'forget:setBtn': '[data-fgset]',
};
const sel = (a: At) => SEL[a.id ? `${a.key}:${a.id}` : a.key] || '';
const shown = (k: string) => !PREFS[k].when || PREFS[k].when!();

const barAt = (id: string): At => (id === 'settings' ? { key: 'bar:off', place: 'dock', id, fix: true, why: "it opens Settings, so it can't be hidden" } : { key: 'bar:off', place: 'dock', id });
const barRow = (id: string): Row => ({ id: `bar:off:${id}`, key: 'bar:off', at: [barAt(id)] });
const one = (key: string, place: string, o: Partial<Row> = {}): Row => ({ id: key, key, at: [{ key, place }], ...o });
const item = (key: string, id: string, place: string): Row => ({ id: `${key}:${id}`, key, at: [{ key, place, id }] });

const BEFORE = ['windows', 'hitch', 'timer', 'clips', 'usage'], AFTER = ['update', 'keys', 'settings'];
const METER: [string, string, string][] = [
  ['ugauge', 'gauge', 'A gauge icon. It turns amber, then red, as a limit fills.'],
  ['ubars', 'two bars', 'Two bars: the current session on top, the weekly limit under it.'],
];
const meterPick: Pick = { get: () => (pref('usage:meter') ? 'ubars' : 'ugauge'), set: (v) => setPref('usage:meter', v === 'ubars'), def: 'ugauge', reset: 'p:usage:meter', choices: () => METER };
const meterRow = (): Row => ({
  id: 'usage:meter', key: 'usage:meter', pick: meterPick, keep: true,
  here: (a) => (isOn(a) ? 'picked' : 'click it to pick it'),
  at: [{ key: 'usage:meter', place: 'ugauge', on: () => !pref('usage:meter') }, { key: 'usage:meter', place: 'ubars', on: () => !!pref('usage:meter') }],
});
const onlyBars = () => (pref('usage:meter') ? '' : 'Only shows with two bars.');
const lookRows = (): Row[] => [meterRow(), one('usage:left', 'ubtn', { note: onlyBars }), one('usage:name', 'ubtn', { note: onlyBars })];
const dockRows = (): Row[] => [...BEFORE.map(barRow), ...lookRows(), ...AFTER.map(barRow)];
const uwinRows = (): Row[] => [one('usage:popBtn', 'uwin'), one('usage:accounts', 'uwin'), one('usage:wake', 'uacct')];
const clipsRows = (): Row[] => [one('clips:add', 'clips')];
const hitchRows = (): Row[] => [item('hgbar:off', 'file', 'hitch'), item('hgbar:off', 'snaps', 'hitch')];
const bellRows = (): Row[] => (shown('forget:popBtn') ? [one('forget:popBtn', 'fgwin')] : []);
const forgetRows = (): Row[] => [one('forget:on', 'dock'), ...bellRows()];
const fgwinRows = (): Row[] => [one('forget:info', 'fgwin'), one('forget:addLine', 'fgwin', { adv: true }), one('forget:setBtn', 'fgwin', { adv: true })];

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
const filled = (root: ParentNode, s: string, html: string) => {
  const el = root.querySelector<HTMLElement>(s);
  if (el && !el.innerHTML.trim()) el.innerHTML = html;
};
let dockCache: string | null = null;
function dockHtml() {
  if (dockCache != null) return dockCache;
  const real = document.getElementById('status');
  if (!real) return (dockCache = '');
  const d = real.cloneNode(true) as HTMLElement;
  for (const x of d.querySelectorAll(':scope > :is(#ws-all, #ws-btn, #projects, #pw-dock, i.dock-sep:not([data-dk])), [data-usage-id]')) x.remove();
  for (const x of d.querySelectorAll<HTMLElement>('[data-dk]')) {
    x.classList.remove('off', 'lone', 'lift', 'ph', 'on');
    x.hidden = false;
  }
  const aw = d.querySelector('#aw-dock');
  if (aw && !aw.children.length) aw.innerHTML = awayHtml(['scratch']);
  filled(d, '#st-update', ICONS.update);
  filled(d, '#st-hitch', ICONS.bug);
  filled(d, '#btn-clips', ICONS.clip);
  return (dockCache = d.outerHTML);
}
const dockAts = () => [...BEFORE, ...AFTER].map(barAt).concat([{ key: 'forget:on', place: 'dock' }]);
const usageBar = (c: { meter: boolean; left: boolean; name: boolean }) => `<footer id="status" class="hr-ubar">${usageButtonPic(c)}</footer>`;
const win = (inner: string, cls = '') => `<div class="float hr-fw${cls}">${inner}</div>`;
const cloneOf = (s: string) => (document.querySelector(s)?.cloneNode(true) as HTMLElement | undefined) || null;
function clipsHtml() {
  const h = cloneOf('#clips .cl-head');
  return h ? win(h.outerHTML) : '';
}
function hitchHtml() {
  const bar = frag(hgBar()).querySelector('.hg-bar')!, snaps = [...bar.querySelectorAll('[data-hgsnap]')];
  const g = document.createElement('span');
  g.className = 'hr-snaps';
  snaps[0].before(g);
  g.append(...snaps);
  return win(`${hgHead()}<div class="hg-body">${bar.outerHTML}</div>`, ' hr-hg');
}
function forgetHtml() {
  const w = cloneOf('#forget');
  if (!w) return '';
  for (const n of [w, ...w.querySelectorAll('*')]) for (const x of ['title', 'data-tip', 'data-tip-keys', 'data-tip-set']) n.removeAttribute(x);
  for (const x of w.querySelectorAll('[data-rs], #fg-list')) x.remove();
  for (const x of w.querySelectorAll('.fg-mir, .fg-pv, .fg-hint')) x.replaceChildren();
  w.removeAttribute('style');
  w.removeAttribute('tabindex');
  w.className = 'hr-fg';
  w.hidden = false;
  const input = w.querySelector<HTMLInputElement>('#fg-text')!;
  input.readOnly = true;
  input.tabIndex = -1;
  w.querySelector<HTMLElement>('[data-fgnew]')!.hidden = !!pref('forget:addLine');
  return w.outerHTML;
}
const uwinHtml = () => win(`${usageHeadPic()}<div class="uw-body hr-uwb">${usageAcctPic()}</div>`, ' hr-uw');

const ring = (a: At) => (isOn(a) || !a.on ? a : null);
function example(a: At) {
  const p = (html: string, ats: At[], r: At | null = a) => pic(mark(html, ats, sel, r), a.place, ' hr-dk');
  if (a.place === 'dock') return p(dockHtml(), dockAts());
  if (a.place === 'ugauge' || a.place === 'ubars') return p(usageBar({ meter: a.place === 'ubars', left: true, name: true }), [a], ring(a));
  if (a.place === 'ubtn') return p(usageBar({ meter: true, left: true, name: true }), lookRows().slice(1).map((r) => r.at[0]));
  if (a.place === 'uwin') return p(uwinHtml(), uwinRows().slice(0, 2).map((r) => r.at[0]));
  if (a.place === 'uacct') return p(win(usageWakePic(), ' hr-uw'), [a]);
  if (a.place === 'clips') return p(clipsHtml(), [a]);
  if (a.place === 'hitch') return p(hitchHtml(), hitchRows().map((r) => r.at[0]));
  return p(forgetHtml(), [...bellRows(), ...fgwinRows()].map((r) => r.at[0]));
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
  if (r.id === 'usage:meter') html = usageBar({ meter: !!pref('usage:meter'), left: !!pref('usage:left'), name: !!pref('usage:name') });
  else if (a.key === 'usage:left' || a.key === 'usage:name') html = usageBar({ meter: true, left: a.key === 'usage:left', name: a.key === 'usage:name' });
  else if (a.place === 'dock') {
    const el = pick(dockHtml(), sel(a));
    html = el ? `<footer id="status" class="hr-lk">${el.outerHTML}</footer>` : '';
  } else {
    const src = a.place === 'uwin' || a.place === 'uacct' ? win(usageHeadPic() + usageAcctPic() + usageWakePic()) : a.place === 'clips' ? clipsHtml() : a.place === 'hitch' ? hitchHtml() : forgetHtml();
    const el = pick(src, sel(a));
    const wrap = a.place === 'hitch' ? 'hg-bar hr-lkbar' : a.place === 'uacct' ? 'uw-pfoot' : 'float-head hr-lkbar';
    html = el ? (a.key === 'forget:addLine' ? `<div id="forget" class="hr-lkfg">${el.outerHTML}</div>` : `<div class="${wrap}">${el.outerHTML}</div>`) : '';
  }
  return html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
}

addPart({ rows: () => [...dockRows(), ...uwinRows(), ...clipsRows(), ...hitchRows(), ...forgetRows(), ...fgwinRows()], sel, look: lookOf, example, home: 'show/dock', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function dockPartHtml() {
  dockCache = null;
  const dk = rows(BEFORE.map(barRow)) + `<div class="hr-sublook">${subh("The usage button's look")}${rows(lookRows())}</div>` + rows(AFTER.map(barRow));
  return box('dock', 'Dock', dk, "The bar along the bottom of the main window. Open a row to see its item in the dock, ringed. The ! is don't forget: its row is in the Don't forget box below.") +
    box('uwin', 'Usage window', rows(uwinRows()), "What you see when you click the usage button in the dock: each agent's limits.") +
    (clipsHtml() ? box('clips', 'Clips window', rows(clipsRows()), 'What you see when you click the clips button in the dock: your screenshots, photos and texts.') : '') +
    box('hitch', 'Freeze log window', rows(hitchRows()), 'What you see when you click the freeze log button in the dock: a live list of what made the app slow. Only in the desktop app.') +
    box('forget', "Don't forget", rows(forgetRows()), keyed("The ! in the dock, and the window it opens: your reminders.{newForget: % writes a new one from anywhere.}")) +
    box('fgwin', "Don't forget's window", rows(fgwinRows()), 'The window the ! in the dock opens: your reminders. Its header and the line that adds a note.');
}
