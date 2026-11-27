import { ask, barMenu, rowIcons, resetBarOrder, TOPBAR } from '../base/controls.ts';
import { is } from '../base/binds.ts';
import { icon } from '../base/icon.ts';
import { chatHeadHtml, headsInit, QUICK_LEAD, quickHtml, WIN2_LEAD, win2Html } from './setheads.ts';
import { CHAT_LEAD, chatPartsHtml, ctrlpHtml } from './setchat.ts';
import { LIST_LEAD, listHtml } from './setlist.ts';
import { fitLooks, homeOf, ownChanged, railHtml, resetItem, resetRow, selectRow, stdClick, stdHover, stdInit, stdKeys } from './setstd.ts';
import { GEN_LEAD, genClick, genHtml, genInit } from './setgen.ts';
import { GIT_LEAD, gitHtml, gitInit } from './setgit.ts';
import { LOOK_LEAD, lookClick, lookHtml, lookInit } from './setlook.ts';
import { CODE_LEAD, codeClick, codeHtml, codeInit, codeMount } from './setcode.ts';
import { agentsClick, agentsHtml, agentsInit, AGENTS_LEAD } from './setagents.ts';
import { ORCH_LEAD, orchHtml } from './setorch.ts';
import { dbgBarHtml, TOP_LEAD, topHtml, ueBarHtml } from './settop.ts';
import { DOCK_LEAD, dockPartHtml } from './setdock.ts';
import { FILES_LEAD, filesPartHtml } from './setfiles.ts';
import { LINKS_LEAD, linksPartHtml } from './setlinks.ts';
import { EDIT_LEAD, editPartHtml, menusHtml } from './setedit.ts';
import { PAGES_LEAD, pagesPartHtml } from './setpages.ts';
import { POPS_LEAD, popsHtml, popsInit } from './setpops.ts';
import { api, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { chatOn, isChanged, isOff, onPref, pref, PREFS, resetPref, setAt, setOff, setPref } from '../base/prefs.ts';
import { shows } from './tabs.ts';
import { UE_LEAD, ueHtml } from './setue.ts';
import { loadVoice, MODEL_NAME, voiceGet, voiceNow, voiceRemove } from './voice.ts';
import { col } from '../base/theme.ts';
import { $, esc, setSave, showErr, store } from '../base/util.ts';
import { seenUpdate, tellUpdate, updateClick } from './update.ts';
import { DOCS_LEAD, docsHtml, UPD_LEAD, updHtml } from './setupd.ts';
import { tell } from '../base/notify.ts';
import { prefStep } from '../base/prefundo.ts';
import { countClick } from './count.ts';
import { capturingKey, keyNote } from './keys.ts';
import { KEYS_LEAD, keysHtml, keysInit } from './setkeys.ts';
import type { Pref } from '../base/prefs.ts';
import { licenseClick } from './license.ts';

type Opt = { value: string; name: string };
type HideFolder = { name: string; hidden: boolean; built: boolean; flip: boolean };
type Field = Event & { target: HTMLInputElement };
type RowOpts = { desc?: string; rs?: string; on?: boolean; cls?: string; attrs?: string };
type Sub = { id: string; label: string; name: string; lead: string; html: () => string };
type Sec = { id: string; name: string; icon: string; lead?: string; html?: () => string; subs?: () => Sub[] };

const el = $('#settings');
const secs = $('#set-secs');
const win = $('#setwin');
const rail = $('#set-rail');
const railBtn = $('#set-rail-btn');
const swBody = $('#setwin .sw-body');
const swBox = swBody.parentElement as HTMLElement;
const tight = () => (swBox.clientWidth || Math.min(1100, innerWidth - 128)) < 1080;
const railKey = () => (tight() ? 'settings:rail-narrow' : 'settings:rail');
const railOn = () => (tight() ? store.get(railKey(), false) === true : store.get(railKey(), true) !== false);
let wasTight = tight();
new ResizeObserver(() => {
  if (tight() === wasTight) return;
  wasTight = tight();
  if (!win.hidden) renderSettings();
}).observe(swBox);

const chip = (on: unknown, attrs: string, inner: string, style = '') => `<button class="chip ${on ? 'on' : ''}" ${attrs}${style ? ` style="${esc(style)}"` : ''}>${inner}</button>`;
const seg = (chips: string) => `<span class="seg">${chips}</span>`;
const tg = (on: unknown, attrs: string, tip = '') => `<button class="set-sw${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" ${attrs}${tip ? ` title="${esc(tip)}"` : ''}><span class="sw-o">Off</span><span class="sw-i">On</span></button>`;
const rsBtn = (tok: string, on: boolean) => `<button class="sr-rs${on ? ' on' : ''}" data-rs="${esc(tok)}" title="Default&#10;Puts this one back to its default." aria-label="back to the default"${on ? '' : ' tabindex="-1"'}>↺</button>`;
const row = (label: string, opts: string, o: RowOpts = {}) =>
  `<div class="set-row${o.cls ? ' ' + o.cls : ''}"${o.attrs || ''}><div class="sr-t"><span class="lbl">${label}</span>${o.desc ? `<span class="sr-d">${esc(o.desc)}</span>` : ''}</div>${o.rs ? rsBtn(o.rs, !!o.on) : '<span class="sr-rs-no"></span>'}<span class="set-opts">${opts}</span></div>`;
let building = '';
const openAdv = new Set<string>();
const ADV_ROW = /class="set-row[^"]*\bset-adv\b/g;
function foldAdv(key: string, rows: string) {
  const at = `${building}/${key}`, n = (rows.match(ADV_ROW) || []).length, open = openAdv.has(at);
  return { cls: open ? ' adv-open' : '', more: n ? `<button class="set-more" data-adv="${esc(at)}" aria-expanded="${open}">${open ? '▴ fewer' : `▾ rarely used (${n})`}</button>` : '' };
}
function card(title: string, rows: string, attrs = '') {
  if (!rows) return '';
  const { cls, more } = foldAdv(title, rows);
  return `<div class="box set-grp${cls}"${attrs}><span class="bt">${title}</span>${rows}${more}</div>`;
}
const group = card;

const AGENT_NAME: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' };
const isChatKey = (c: unknown) => typeof c === 'string' && Object.hasOwn(AGENT_NAME, c);
const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;



const visible = (k: string) => { const e = PREFS[k]; return (!!DESKTOP || !e.desktop) && (!e.when || e.when()); };
const nameOf = (e: Pref) => String((typeof e.label === 'function' ? e.name : e.label) || '');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ended = (s: string) => (/[.!?)]$/.test(s) ? s : s + '.');
const pillName = (s: string) => cap(s.replace(/\s*▾$/, '').replace(/^[⇥✦]\s*/, ''));
function pillTip(e: Pref, label: string, hid: boolean) {
  const fn = typeof e.label === 'function', m = fn ? String(e.label(label)).match(/^(.*?[^,])\s+((?:in|on|under)\s.*)$/) : null;
  const where = fn ? m?.[2] || '' : (hid ? e.off : e.on) || '';
  return `${pillName(m ? m[1] : fn ? String(e.label(label)) : label)}: ${hid ? 'hidden' : 'shown'}\n${where ? cap(ended(where)) + ' ' : ''}Click to ${hid ? 'show' : 'hide'} it.`;
}
const choiceTip =(label: unknown, tip: unknown) => (!tip ? '' : String(tip).includes('\n') ? String(tip) : `${cap(String(label))}\n${cap(ended(String(tip)))}`);
const descOf = (e: Pref) => e.desc ?? (e.choices ? e.tip || '' : Array.isArray(e.def) ? 'Click a button below to hide or show it.' : e.on ? `${e.on}; off: ${e.off}` : e.off ? `off: ${e.off}` : '');
function prefRow(key: string) {
  const e = PREFS[key], v = pref(key), at = `data-pref="${key}"`, name = nameOf(e);
  const o: RowOpts = { desc: descOf(e), rs: 'p:' + key, on: isChanged(key), attrs: ` data-row="${esc(key)}"`, cls: [e.under && 'set-under', e.under && !pref(e.under) && 'set-off', e.adv && 'set-adv'].filter(Boolean).join(' ') };
  if (e.choices) {
    const list = e.choices.filter(([c]) => !isChatKey(c) || chatOn(c as string));
    const ctl = list.length > 4
      ? `<select ${at} data-pref-sel aria-label="${esc(name)}">${[...list, ...(list.some(([c]) => c === v) ? [] : [[v, v]])].map(([c, label, tip]) => `<option value="${esc(JSON.stringify(c))}" ${c === v ? 'selected' : ''}${tip ? ` title="${esc(choiceTip(label, tip))}"` : ''}>${esc(String(label))}</option>`).join('')}</select>`
      : seg(list.map(([c, label, tip]) => chip(v === c, `${at} data-pref-v="${esc(JSON.stringify(c))}"${tip ? ` title="${esc(choiceTip(label, tip))}"` : ''}`, esc(String(label)))).join(''));
    return row(esc(name), ctl, o);
  }
  if (!Array.isArray(e.def)) return row(esc(name), tg(v, `${at} data-pref-v="${!v}" aria-label="${esc(name)}"`), o);
  const items = e.items!;
  const last = key === 'agents:off' && items.filter(([id]) => !v.includes(id)).length === 1;
  const one = (label: string) => (typeof e.label === 'function' ? e.label(label) : label);
  const pills = items.map(([id, label]) => {
    const hid = v.includes(id), lock = last && !hid;
    const tip = lock ? `${one(label)}: in use\nAt least one agent stays on.` : e.pill ? e.pill(label, hid) : pillTip(e, label, hid);
    return `<button class="pill${hid ? ' off' : ''}" ${at} data-pref-item="${esc(id)}" aria-pressed="${!hid}" title="${esc(tip)}"${lock ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;
  }).join('');
  return row(esc(name), `<span class="pills">${pills}${e.all ? chip(false, `${at} data-pref-all ${v.length ? '' : 'disabled'}`, 'show all') : ''}</span>`, { ...o, cls: o.cls + ' set-pills' });
}
const prefKeys = (box: string, part?: string, skip?: Set<string>) => Object.keys(PREFS).filter((k) => PREFS[k].box === box && (!part || PREFS[k].part === part) && visible(k) && !skip?.has(k));
const prefRows = (box: string) => prefKeys(box).map(prefRow).join('');
type CardOpts = { part?: string; pre?: [string, string][]; post?: [string, string][]; skip?: Set<string>; title?: string };
function prefCards(box: string, o: CardOpts = {}) {
  const cards = new Map<string, [string, string, string]>();
  const add = (t: string, i: 0 | 1 | 2, html: string) => {
    const c = cards.get(t) || ['', '', ''];
    c[i] += html;
    cards.set(t, c);
  };
  for (const [t, html] of o.pre || []) add(t, 0, html);
  for (const k of prefKeys(box, o.part, o.skip)) add(PREFS[k].card ?? o.title ?? '', PREFS[k].adv ? 2 : 0, prefRow(k));
  for (const [t, html] of o.post || []) add(t, 1, html);
  return [...cards].map(([t, c]) => card(t, c.join(''))).join('');
}
let hide: { pid: string | null; text: string | null; folders: HideFolder[] } = { pid: null, text: '', folders: [] };
const loadHide = () => api('GET', '/api/hidden').then((r) => ((hide.text = r.hidden.join('\n')), (hide.folders = r.folders), renderSettings()), showErr);
function saveHide(list: string[]) {
  api('PUT', '/api/hidden', { hidden: list }).then(() => (setSave(`hidden folders: ${list.length}`), page.reload(), loadHide()), showErr);
}
const hideListOf = () => hide.text!.split('\n').map((n) => n.trim()).filter(Boolean);
function flipFolder(name: string) {
  const f = hide.folders.find((x) => x.name === name)!, low = name.toLowerCase();
  const same = (n: string, bang: boolean) => n.startsWith('!') === bang && n.slice(bang ? 1 : 0).replace(/^\/|\/$/g, '').toLowerCase() === low;
  const list = hideListOf();
  saveHide(f.built ? (f.hidden ? [...list, `!${name}`] : list.filter((n) => !same(n, true))) : f.hidden ? list.filter((n) => !same(n, false)) : [...list, name]);
}
function dirsBox() {
  if (!S.pid) return '';
  if (hide.pid !== S.pid) {
    hide = { pid: S.pid, text: null, folders: [] };
    loadHide();
  }
  const tip = (f: HideFolder) => `${f.name}: ${f.hidden ? 'hidden' : 'shown'}\n` + (f.flip ? (f.hidden ? 'Hidden in the explorer. Agents still see it. Click to show it.' : 'Shown in the explorer. Click to hide it.') : 'Hidden by a pattern or the .gitignore.\n\nChange it there.') +
    (f.flip && f.hidden && f.built && f.name !== 'node_modules' ? '\n\nEditing it is at your own risk.' : '');
  const list = hide.folders.map((f) => `<button class="set-dl${f.hidden ? '' : ' on'}" data-hide-dir="${esc(f.name)}" ${f.flip ? '' : 'disabled'} role="checkbox" aria-checked="${!f.hidden}" title="${esc(tip(f))}"><span class="set-cb" aria-hidden="true"></span><span class="dn">${esc(f.name)}</span>${f.built ? '<span class="dq">hidden by default</span>' : ''}</button>`).join('');
  return `<div class="box set-grp hr-grp" data-hr-box="dirs"><span class="bt">Folders hidden in this project</span><div class="hr-sub">Folders the explorer leaves out, in this project only. Ticked folders show in the explorer. Agents see every folder either way.</div>` +
    `<div class="set-row set-dirs" data-row="x:hidden" data-find="hidden folders"><div class="set-dlist">${list || '<span class="dim">…</span>'}</div></div>` +
    row('Hidden by a pattern', `<textarea data-hide rows="4" style="width: 260px" ${hide.text === null ? 'disabled' : ''} title="Hide&#10;One per line, like .gitignore: Intermediate, *.log.&#10;&#10;A line !name shows a built-in like .git.">${esc(hide.text ?? '')}</textarea>`, { desc: 'One per line, like .gitignore: Intermediate, *.log. A line !name shows a built-in like .git.' }) + '</div>';
}
for (const k of Object.keys(PREFS)) onPref(k, () => renderSettings());
rowIcons({ 'settings:find': () => icon('search') });
barMenu('.sw-head', 'settings');

const topRows = () => TOPBAR.flatMap((g) => g.rows.filter((r) => !r.when || r.when()).map((r) => ({ ...r, g: g.g })));
const pictured = () => new Set([...topRows().map((r) => r.k), ...stdKeys()]);
const showCards = (part: string, pre: [string, string][] = [], post: [string, string][] = []) =>
  prefCards('show', { part, pre, post, skip: pictured() });
const SHOW_PARTS: { id: string; name: string; lead: string; html: () => string }[] = [
  { id: 'chat', name: 'Chat', lead: CHAT_LEAD, html: () => chatHeadHtml() + chatPartsHtml() + showCards('chat', [], [['speech to text', voiceRow()]]) },
  { id: 'list', name: 'Agents list', lead: LIST_LEAD, html: () => listHtml() + showCards('list') },
  { id: 'win2', name: 'Window 2, 3…', lead: WIN2_LEAD, html: () => win2Html() + showCards('win2') },
  { id: 'orch', name: 'Orchestration', lead: ORCH_LEAD, html: () => orchHtml() + showCards('orch') },
  { id: 'quick', name: 'Quick windows', lead: QUICK_LEAD, html: () => quickHtml() + ueBarHtml() + showCards('quick') },
  { id: 'top', name: 'Rail and dashboard', lead: TOP_LEAD, html: () => topHtml() + showCards('top') },
  { id: 'dock', name: 'Dock', lead: DOCK_LEAD, html: () => dockPartHtml() + showCards('dock') },
  { id: 'files', name: 'Files and explorer', lead: FILES_LEAD, html: () => filesPartHtml(dirsBox()) + showCards('files') },
  { id: 'links', name: 'Links and chips', lead: LINKS_LEAD, html: () => linksPartHtml() + showCards('links') },
  { id: 'edit', name: 'Editing', lead: EDIT_LEAD, html: () => editPartHtml() + dbgBarHtml() + showCards('edit') },
  { id: 'pages', name: 'Pages', lead: PAGES_LEAD, html: () => pagesPartHtml() + showCards('pages') },
  { id: 'all', name: 'Menus and pop-ups', lead: POPS_LEAD, html: () => ctrlpHtml() + menusHtml() + popsHtml() + showCards('all') },
];


headsInit(el, { rsBtn, redraw: () => renderSettings() });
stdInit({ rsBtn, redraw: () => renderSettings(), fold: foldAdv });
popsInit({ rsBtn, head: secHead });
agentsInit(el);
genInit(el);
gitInit(el);
keysInit(el);
lookInit(el);
codeInit(el);
el.addEventListener('mouseover', (e: MouseEvent) => stdHover(el, e.target as Element));
new ResizeObserver(() => fitLooks(el)).observe(el);
document.fonts?.ready.then(() => fitLooks(el));




let voiceAsked = false;
function voiceRow() {
  const v = voiceNow();
  if (!v && !voiceAsked) {
    voiceAsked = true;
    loadVoice().finally(() => (voiceAsked = false));
  }
  if (!v) return row('Downloaded', '<span class="dim">looking…</span>');
  if (!v.os) return row('Downloaded', '<span class="dim">not on this system yet</span>');
  const m = pref('voice:model') === 'base' ? 'base' : 'small', have = Object.entries(v.models).filter(([, x]) => x.have);
  const what = v.installing ? `downloading, ${Math.round(v.got / 1e6)} of ${Math.round(v.total / 1e6) || v.models[m].mb} MB` : have.length ? `${have.map(([k]) => MODEL_NAME[k]).join(' and ')}, ${Math.round(v.bytes / 1e6)} MB` : 'nothing yet';
  const btn = v.installing ? '' : v.bytes ? `<button class="chip" data-voice-remove title="Remove&#10;Deletes the speech models, Whisper and the live text program. The mic asks to download again.">remove</button>` : `<button class="chip" data-voice-get title="Download&#10;Gets Whisper and the ${esc(MODEL_NAME[m].toLowerCase())} model${pref('voice:live') && v.live?.os ? ', and the live text model' : ''}, about ${v.models[m].mb + (v.program ? 0 : 10) + (pref('voice:live') && v.live?.os ? v.live.mb - (v.program ? 0 : 10) : 0)} MB, from GitHub and Hugging Face.">download</button>`;
  return row('Downloaded', `<span class="dim">${esc(what)}</span>${btn}`, { desc: "Whisper, its speech model and the live text model, in Amethyst's own folder. The mic asks before the first download." });
}

const showSub = (id: string, group: string, label?: string): Sub => {
  const p = SHOW_PARTS.find((x) => x.id === id)!;
  return { id: `show/${p.id}`, label: label || p.name, name: `${group} › ${label || p.name}`, lead: p.lead, html: p.html };
};
const SVG = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const SECTIONS: Sec[] = [
  { id: 'general', name: 'General', icon: '<path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/><circle cx="8" cy="8" r="2.6"/>', lead: GEN_LEAD, html: genHtml },
  {
    id: 'look', name: 'Appearance', icon: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/>',
    subs: () => [
      { id: 'look', label: 'Theme and look', name: 'Appearance › Theme and look', lead: LOOK_LEAD, html: lookHtml },
      { id: 'code', label: 'Code colors', name: 'Appearance › Code colors', lead: CODE_LEAD, html: codeHtml },
    ],
  },
  {
    id: 'show', name: 'Layout and bars', icon: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M6 6v7.5"/>',
    subs: () => [
      showSub('top', 'Layout and bars'),
      showSub('dock', 'Layout and bars'),
      showSub('quick', 'Layout and bars'),
      showSub('win2', 'Layout and bars'),
      showSub('orch', 'Layout and bars'),
      showSub('all', 'Layout and bars'),
    ],
  },
  {
    id: 'agents', name: 'Agents and chat', icon: '<path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/>',
    subs: () => [
      { id: 'agents', label: 'Providers and tools', name: 'Agents and chat › Providers and tools', lead: AGENTS_LEAD, html: agentsHtml },
      showSub('chat', 'Agents and chat', 'Chat window'),
      showSub('list', 'Agents and chat', 'Agents list'),
    ],
  },
  {
    id: 'files', name: 'Files and editor', icon: '<path d="M4 1.5h5l3.5 3.5v9.5h-8.5z"/><path d="M9 1.5v3.5h3.5"/>',
    subs: () => [
      { id: 'files', label: 'Files and git', name: 'Files and editor › Files and git', lead: GIT_LEAD, html: gitHtml },
      showSub('files', 'Files and editor', 'Explorer'),
      showSub('edit', 'Files and editor', 'Editing'),
      showSub('links', 'Files and editor', 'Links and chips'),
      showSub('pages', 'Files and editor', 'Pages'),
    ],
  },
  { id: 'unreal', name: 'Unreal', icon: '<path d="M8 1.5 14 5v6l-6 3.5L2 11V5z"/><path d="M2 5l6 3.5L14 5M8 8.5v6"/>', lead: UE_LEAD, html: ueHtml },
  { id: 'keys', name: 'Shortcuts', icon: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 7h1M7 7h1M10 7h1M4.5 9.5h7"/>', lead: KEYS_LEAD, html: () => keysHtml(finding) },
  {
    id: 'update', name: 'Updates and docs', icon: '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/>',
    subs: () => [
      { id: 'update', label: 'Updates', name: 'Updates and docs › Updates', lead: UPD_LEAD, html: updHtml },
      { id: 'docs', label: 'Docs', name: 'Updates and docs › Docs', lead: DOCS_LEAD, html: docsHtml },
    ],
  },
];
const CHANGED_ICON = '<path d="M3 8a5 5 0 1 0 1.5-3.6"/><path d="M3 2.5v2.5h2.5"/>';
const parts = (): Sub[] => SECTIONS.flatMap((s) => (s.subs ? s.subs() : [{ id: s.id, label: s.name, name: s.name, lead: s.lead || '', html: s.html! }]));
const secOf = (cur: string): Sec | undefined => SECTIONS.find((s) => s.id === cur || s.subs?.().some((p) => p.id === cur));
const changesOn = () => !!pref('settings:changed');
function sectionAt(t: unknown): string {
  const raw = String(t || '');
  if (raw === 'changed') return changesOn() ? 'changed' : 'general';
  const all = parts();
  if (all.some((p) => p.id === raw)) return raw;
  const [s] = raw.split('/');
  const sec = SECTIONS.find((x) => x.id === s);
  if (!sec) return 'general';
  return sec.subs ? sec.subs()[0].id : sec.id;
}

export const settingsName = (at: string) => {
  const [sec, ...line] = at.split(':');
  return (parts().find((p) => p.id === sectionAt(homeAt(sec, line.join(':'))))?.name || 'General').toLowerCase();
};
const OLD_AT: Record<string, string> = { 'show/head': 'show/win2' };
function homeAt(sec: string, line: string) {
  const e = line ? PREFS[line] : null;
  return (line && homeOf(line)) || (e?.box === 'show' && e.part ? `show/${e.part}` : '') || OLD_AT[sec] || sec;
}
export function settingsAt(at: string) {
  const [sec, ...rest] = at.split(':'), line = rest.join(':');
  store.set('settings:tab', sectionAt(homeAt(sec, line)));
  findQ = '';
  el.scrollTop = 0;
  if (S.settingsOpen) renderSettings();
  else page.openSettings();
  if (!line) return;
  const q = CSS.escape(line);
  const find = (): Element | null => el.querySelector(`[data-rs="p:${q}"], .set-row:has([data-pref="${q}"]), .hr-row[data-row="${q}"], .hr-row[data-row^="${q}:"], .hr-row[data-hr-keys~="${q}"]`);
  const hit = find();
  const adv = hit?.closest('.set-adv')?.closest('.set-grp:not(.adv-open)')?.querySelector<HTMLElement>('[data-adv]')?.dataset.adv;
  if (adv) (openAdv.add(adv), renderSettings());
  const hr = hit?.closest<HTMLElement>('.hr-row');
  if (hr?.dataset.hr) (selectRow(hr.dataset.hr), renderSettings());
  find()?.scrollIntoView({ block: 'center' });
}
const EXTRA_PREFS = ['marks:names', 'writer:use', 'deck:foldOrder', 'modesHidden'];
const tracked = () => Object.keys(PREFS).filter((k) => (PREFS[k].box || EXTRA_PREFS.includes(k)) && visible(k));
function changedTokens(): string[] {
  return [...tracked().filter(isChanged).map((k) => 'p:' + k), ...ownChanged()];
}
let holding = false;
function resetTokens(toks: string[]) {
  holding = true;
  try {
    for (const t of toks.flatMap((x) => x.split(' ')).filter(Boolean)) {
      const kind = t[0], id = t.slice(2);
      if (kind === 'p') resetPref(id);
      else if (kind === 'i') resetItem(id);
      else if (kind === 's') resetRow(id);
      else if (kind === 'a') {
        const [k, ps] = id.split('|');
        ps.split(',').forEach((p) => setAt(k, p, PREFS[k].def));
      }
    }
  } finally {
    holding = false;
  }
  renderSettings();
}

function renderNav(cur: string, finding: boolean) {
  const n = changesOn() ? changedTokens().length : 0;
  const activeSec = !finding ? secOf(cur)?.id : '';
  secs.innerHTML = SECTIONS.map((s) => {
    const isOn = activeSec === s.id;
    return `<button class="ss${isOn ? ' on' : ''}" data-set-tab="${s.id}" role="tab" aria-selected="${isOn}">${SVG(s.icon)}<span class="ss-t">${esc(s.name)}</span></button>`;
  }).join('') +
    `<hr class="set-chg"><button class="ss set-chg${!finding && cur === 'changed' ? ' on' : ''}" data-set-tab="changed" role="tab" aria-selected="${!finding && cur === 'changed'}" title="Changed&#10;Every setting and key that isn't at its default.">${SVG(CHANGED_ICON)}<span class="ss-t">Changed</span><span class="n">${n || ''}</span></button>`;
}
function openTab(tab: string) {
  store.set('settings:tab', sectionAt(tab));
  findQ = '';
  el.scrollTop = 0;
  renderSettings();
}
secs.addEventListener('click', (e: MouseEvent) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-set-tab]');
  if (b) openTab(b.dataset.setTab!);
});
railBtn.addEventListener('click', () => {
  store.set(railKey(), !railOn());
  renderSettings();
});
rail.addEventListener('click', (e: MouseEvent) => {
  if (stdClick(e.target as Element)) e.stopPropagation();
});

const findAt = $('#set-find-at');
const findIn = $('#set-find');
const findN = $('#set-find-n');
const found = new Highlight();
CSS.highlights.set('set-find', found);
let findQ = '', findShown = false, finding = false;
const SMALL = new Set(['a', 'an', 'the', 'for', 'of', 'in', 'to', 'on', 'and', 'or', 'with']);
const wordsOf = (q: string) => q.toLowerCase().split(/\s+/).filter((w) => w && !SMALL.has(w));
const UNIT = '.set-row, .ct-row, .cc-role';
const textOf = (n: HTMLElement) => [n.textContent, ...[n, ...n.querySelectorAll<HTMLElement>('[title], [aria-label], [placeholder]')].filter((x) => !x.closest('.hr-ord')).flatMap((x) => [x.title, x.getAttribute('aria-label'), x.getAttribute('placeholder'), x.dataset.find])].filter(Boolean).join(' ').toLowerCase();

function paintField() {
  findAt.hidden = !pref('settings:find') && !findShown;
  findIn.title = 'Find\nFinds a setting or a key by a word in it.';
  findIn.dataset.tipKeys = 'find:find';
  if (findIn.value !== findQ) findIn.value = findQ;
}
function families(g: Element) {
  const out: HTMLElement[][] = [];
  for (const u of g.querySelectorAll<HTMLElement>(UNIT)) {
    if (u.classList.contains('set-under') && out.length) out.at(-1)!.push(u);
    else if (!u.closest('.hr-pic')) out.push([u]);
  }
  return out;
}
function prune(node: Element, keep: Set<Element>): boolean {
  let any = false;
  for (const c of node.children) {
    if (c.classList.contains('bt')) continue;
    if (c.matches(UNIT)) {
      const on = keep.has(c);
      c.classList.toggle('set-miss', !on);
      any ||= on;
    } else if (c.querySelector(UNIT)) {
      const on = prune(c, keep);
      c.classList.toggle('set-miss', !on);
      any ||= on;
    } else c.classList.add('set-miss');
  }
  return any;
}
function mark(root: Node, ws: string[]) {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n: Text | null; (n = walk.nextNode() as Text | null); ) {
    if (n.parentElement!.closest('.set-miss, option, select, textarea')) continue;
    const low = n.data.toLowerCase();
    for (const w of ws) {
      for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + w.length)) {
        const r = new Range();
        r.setStart(n, i);
        r.setEnd(n, i + w.length);
        found.add(r);
      }
    }
  }
}
const note = (text: string) => el.querySelector('.set-ph')!.insertAdjacentHTML('afterend', `<div class="cc-help set-closest">${text}</div>`);
function applyFind(ws: string[]) {
  const boxes = [...el.querySelectorAll('.set-grp')].map((g) => {
    const low = (g.querySelector('.bt')?.textContent || '').toLowerCase();
    return { g, whole: ws.every((w) => low.includes(w)), fams: families(g).map((f) => {
      const t = low + ' ' + f.map(textOf).join(' ');
      return { f, n: ws.filter((w) => t.includes(w)).length };
    }) };
  });
  const best = Math.max(0, ...boxes.flatMap((b) => b.fams.map((x) => x.n)));
  let count = 0;
  for (const b of boxes) {
    if (b.whole && best === ws.length) {
      b.g.classList.remove('set-miss');
      count += b.fams.length;
      continue;
    }
    const keep = new Set(b.fams.filter((x) => best && x.n === best).flatMap((x) => x.f));
    count += b.fams.filter((x) => best && x.n === best).length;
    b.g.classList.toggle('set-miss', !prune(b.g, keep));
  }
  if (best && best < ws.length) note('no setting has every word; the closest:');
  if (!count) note('no setting has these words');
  findN.textContent = count ? `${count}` : 'none';
  el.querySelector('.set-ph h3')!.textContent = count ? `Found ${count}` : 'Found none';
  for (const g of el.querySelectorAll('.set-grp:not(.set-miss)')) mark(g, ws);
}
function applyChanged() {
  let any = false;
  for (const g of el.querySelectorAll('.set-grp')) {
    const keep = new Set([...g.querySelectorAll(UNIT)].filter((u) => u.querySelector(':scope > .sr-rs.on')));
    const on = prune(g, keep);
    g.classList.toggle('set-miss', !on);
    any ||= on;
  }
  if (!any) note('Everything is at its default.');
}

function secHead(top: string, sub: string | undefined, lead: string) {
  return `<div class="set-ph"><div><h3>${sub ? `<span class="crumb">${esc(top)} › </span>${esc(sub)}` : esc(top)}</h3><p class="lead">${esc(lead)}</p></div><button class="set-rsall" data-rs-sec title="Reset this section&#10;Puts every setting here back to its default.">reset this section</button></div>`;
}
function head(cur: string, ws: string[]) {
  if (ws.length) return `<div class="set-ph"><div><h3>Found</h3><p class="lead">in every section, keys too; the section's name is over each card</p></div></div>`;
  if (cur === 'changed') return `<div class="set-ph"><div><h3>Changed</h3><p class="lead">Every setting and key that isn't at its default. ↺ puts one back; things kept per project, like hidden folders, are not here.</p></div><button class="set-rsall" data-rs-all ${changedTokens().length ? '' : 'disabled'}>reset all</button></div>`;
  const p = parts().find((x) => x.id === cur)!, sec = secOf(cur), subs = sec?.subs?.();
  const [top, sub] = p.name.split(' › ');
  const pills = subs && subs.length > 1
    ? `<div class="set-subpills" role="tablist">${subs.map((s) => `<button class="set-subpill${s.id === cur ? ' on' : ''}" data-set-tab="${esc(s.id)}" role="tab" aria-selected="${s.id === cur}">${esc(s.label)}</button>`).join('')}</div>`
    : '';
  return secHead(top, sub, p.lead) + pills +
    (cur === 'keys' ? `<div class="set-kmsg" aria-live="polite">${esc(keyNote())}</div>` : '');
}
const wrap = (p: Sub, named: boolean) => {
  building = p.id;
  return `<div class="set-of" data-part="${p.id}" data-tab-name="${esc(named ? p.name : '')}">${p.html()}</div>`;
};

export function renderSettings() {
  if (holding) return;
  paintField();
  if (!shows('settings')) {
    findQ = '';
    findShown = false;
    found.clear();
    tellUpdate();
    return paintField();
  }
  const top = el.scrollTop, ws = wordsOf(findQ), cur = sectionAt(store.get('settings:tab')), had = focusKey(), caret = caretOf();
  finding = ws.length > 0 || cur === 'changed';
  seenUpdate();
  found.clear();
  findN.textContent = '';
  win.classList.toggle('no-rs', !changesOn());
  renderNav(cur, ws.length > 0);
  el.classList.toggle('set-all', finding);
  el.innerHTML = head(cur, ws) + (finding ? parts().map((p) => wrap(p, true)).join('') : wrap(parts().find((x) => x.id === cur)!, false));
  building = '';
  codeMount(el);
  for (const o of el.querySelectorAll('.set-of[data-tab-name]:not([data-tab-name=""])') as NodeListOf<HTMLElement>) for (const t of o.querySelectorAll<HTMLElement>('.set-grp > .bt')) t.dataset.tab = o.dataset.tabName;
  if (ws.length) applyFind(ws);
  else if (cur === 'changed') applyChanged();
  const rs = el.querySelector('[data-rs-sec]');
  if (rs) rs.style.visibility = el.querySelector('.sr-rs.on[data-rs]') ? '' : 'hidden';
  const rHtml = railHtml(el), hasRail = !!rHtml, showRail = hasRail && railOn();
  railBtn.hidden = !hasRail;
  railBtn.textContent = showRail ? 'Hide preview' : 'Show preview';
  railBtn.classList.toggle('on', showRail);
  rail.hidden = !showRail;
  swBody.classList.toggle('has-rail', showRail);
  rail.innerHTML = showRail ? rHtml : '';
  el.scrollTop = top;
  fitLooks(el);
  if (showRail) fitLooks(rail);
  if (had) refocus(had, caret);
}
function caretOf() {
  const a = document.activeElement;
  if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement) || a.selectionStart == null) return null;
  return { start: a.selectionStart, end: a.selectionEnd ?? a.selectionStart, atEnd: a.selectionEnd === a.value.length };
}
function refocus(had: string, caret: ReturnType<typeof caretOf>) {
  const n = el.querySelector(had) as HTMLElement | null;
  if (!n) return;
  n.focus({ preventScroll: true });
  if (!caret || !(n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement) || n.selectionStart == null) return;
  const len = n.value.length;
  if (caret.atEnd) n.setSelectionRange(len, len);
  else n.setSelectionRange(Math.min(caret.start, len), Math.min(caret.end, len));
}
function focusKey() {
  const a = document.activeElement as HTMLElement | null;
  if (!a || !el.contains(a) || a === el) return '';
  const attrs = [...a.attributes].filter((x) => x.name.startsWith('data-') && !['data-pref-v', 'data-tip', 'data-bo', 'data-flat'].includes(x.name));
  return attrs.length ? a.tagName.toLowerCase() + attrs.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('') : '';
}
export function settingsAudit() {
  const pics = pictured(), out: { key: string; rule: string; part: string; fail: boolean }[] = [];
  for (const p of SHOW_PARTS) {
    building = 'show/' + p.id;
    const t = document.createElement('template');
    t.innerHTML = p.html();
    building = '';
    for (const g of t.content.querySelectorAll('.set-grp')) {
      const untitled = !g.querySelector(':scope > .bt')?.textContent?.trim();
      for (const r of g.querySelectorAll<HTMLElement>('.set-row[data-row]:not(.hr-row, .set-pic, .hr-orow)')) {
        const key = r.dataset.row!;
        if (untitled) out.push({ key, rule: 'every box has a heading (rule 9): its row sits in a box with no heading', part: p.id, fail: ['win2', 'quick'].includes(p.id) });
        if (pics.has(key)) out.push({ key, rule: 'one switch per thing (rule 10): it has a button in a picture and a row of its own', part: p.id, fail: true });
        if (/\boff:/.test(r.querySelector('.sr-d')?.textContent || '')) out.push({ key, rule: 'a state sentence, never "off:" (rule 2)', part: p.id, fail: false });
      }
      const std = ['dock', 'files', 'links', 'edit', 'pages', 'all'].includes(p.id);
      for (const r of g.querySelectorAll<HTMLElement>('.hr-row')) {
        const t = `${r.querySelector('.lbl')?.textContent || ''} ${r.querySelector('.hr-state')?.textContent || ''}`;
        if (/\boff:|→|·/i.test(t)) out.push({ key: r.dataset.hr!, rule: 'a state sentence, never "off:", arrows or "·" (rule 2)', part: p.id, fail: std });
      }
      if (g.querySelector('.hr-big') && g.querySelector('.hr-row')) out.push({ key: g.getAttribute('data-hr-box') || '', rule: 'no big picture over rows that open their own (rule 10)', part: p.id, fail: std });
    }
  }
  return out;
}

function findSettings() {
  if (!S.settingsOpen) return;
  findShown = true;
  paintField();
  findIn.focus();
  findIn.select();
}
findIn.addEventListener('input', () => {
  findQ = findIn.value;
  el.scrollTop = 0;
  renderSettings();
  el.scrollTop = 0;
});
findIn.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && findIn.value) {
    e.preventDefault();
    e.stopPropagation();
    findIn.value = findQ = '';
    return renderSettings();
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    el.querySelector(`.set-grp:not(.set-miss) :is(${UNIT}):not(.set-miss) :is(button, input, select, textarea):not(:disabled)`)?.focus();
  }
});
document.addEventListener('keydown', (e) => {
  if (!S.settingsOpen || capturingKey() || !is(e, 'find') || !$('#modal').hidden || document.activeElement?.closest?.('.xterm')) return;
  e.preventDefault();
  e.stopPropagation();
  findSettings();
}, true);

el.addEventListener('click', async (e: MouseEvent) => {
  if (stdClick(e.target as Element)) return e.stopPropagation();
  if (agentsClick(e.target as Element)) return e.stopPropagation();
  if (genClick(e.target as Element)) return e.stopPropagation();
  if (lookClick(e.target as Element)) return e.stopPropagation();
  if (codeClick(e.target as Element)) return e.stopPropagation();
  const fixed = (e.target as Element).closest<HTMLElement>('.kb.fixed, [data-fixed]');
  if (fixed) return tell(fixed, fixed.matches('.kb') ? { title: 'This key is fixed', line: 'it does the same everywhere and cannot be changed', ms: 2500 } : { title: 'This one always shows', line: 'the editor button stays in the rail', ms: 2500 });
  const b = (e.target as Element).closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.setTab) return openTab(d.setTab);
  if (d.setGo) return settingsAt(d.setGo);
  if (d.rs) return resetTokens([d.rs]);
  if ('rsSec' in d) return resetTokens([...el.querySelectorAll('.sr-rs.on[data-rs]')].map((x: HTMLElement) => x.dataset.rs!));
  if ('rsAll' in d) return resetTokens(changedTokens());
  if (d.adv) {
    openAdv.has(d.adv) ? openAdv.delete(d.adv) : openAdv.add(d.adv);
    return renderSettings();
  }
  if ('voiceGet' in d) return voiceGet();
  if ('voiceRemove' in d) return voiceRemove();
  if (updateClick(d)) return;
  if (countClick(d)) return;
  if (licenseClick(d)) return;
  if ('hoReset' in d) {
    resetBarOrder('head');
    setSave("a chat window's head: the default order");
    return renderSettings();
  }
  if ('foReset' in d) {
    setPref('deck:foldOrder', [...PREFS['deck:foldOrder'].def]);
    setSave('folds first: the default order');
    return renderSettings();
  }
  if (d.hideDir) return flipFolder(d.hideDir);
  if (d.pref) {
    const k = d.pref, e = PREFS[k], lbl = b.getAttribute('aria-label') || b.closest('.set-row')!.querySelector('.lbl')!.textContent;
    if ('prefAll' in d) (prefStep(`${e.name || (typeof e.label === 'string' ? e.label : k)}: show all`, [k], () => setPref(k, [])), setSave(e.all!));
    else if (b.ariaDisabled === 'true') tell(b, { title: 'At least one agent stays on', line: 'turn another one on first', ms: 2500 });
    else if (d.prefV == null) {
      const off = !isOff(k, d.prefItem!);
      setOff(k, d.prefItem!, off);
      setSave(`${b.getAttribute('aria-label') || b.textContent}: ${off ? (e.on ? e.off : 'hidden') : e.on || 'shown'}`);
    } else {
      const v = JSON.parse(d.prefV);
      if (d.prefItem != null) setOff(k, d.prefItem, !v);
      else setPref(k, v);
      if (!e.quiet) setSave(`${lbl}: ${e.choices ? b.textContent : v ? 'on' : 'off'}`);
    }
    return;
  }
});
el.addEventListener('change', (e: Field) => {
  const ct = e.target.dataset;
  if (e.target.matches('[data-hide]')) {
    hide.text = e.target.value;
    return saveHide(hideListOf());
  }
  if (e.target.matches('select[data-pref-sel]')) {
    const k = e.target.dataset.pref!, e2 = PREFS[k];
    setPref(k, JSON.parse(e.target.value));
    return setSave(`${nameOf(e2)}: ${(e.target as unknown as HTMLSelectElement).selectedOptions[0].text}`);
  }
});

document.addEventListener('keys-changed', () => el.offsetParent && renderSettings());
