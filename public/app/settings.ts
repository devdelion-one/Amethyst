import { ask, barMenu, rowIcons, colorTray, ICONS, markName, popMenu, resetBarOrder, setColorTray, sortable, swatches, TOPBAR } from '../base/controls.ts';
import { BINDS, bound, is, show } from '../base/binds.ts';
import { modelKeys, optFor, seenModels, setModelKey } from './composer.ts';
import { icon } from '../base/icon.ts';
import { resetSetColors, SET_GROUPS, setColors, setColorsChanged, setSetColors } from '../decks/deck.ts';
import { codeView } from '../base/textbox.ts';
import { chatHeadHtml, headsInit, QUICK_LEAD, quickHtml, WIN2_LEAD, win2Html } from './setheads.ts';
import { CHAT_LEAD, chatPartsHtml, ctrlpHtml, marksRowHtml } from './setchat.ts';
import { LIST_LEAD, LIST_MOVED, listHtml } from './setlist.ts';
import { fitLooks, homeOf, railHtml, resetItem, resetRow, selectRow, stdClick, stdHover, stdInit, stdKeys } from './setstd.ts';
import { pinClick, pinHtml, pinInit } from './setpin.ts';
import { writerLine, writerRowClick, writerRowHtml } from '../base/writer.ts';
import { forgetColors, forgetListHere, forgetListOn, forgetListText, setForgetColor, setForgetListOn, setForgetListText } from '../forget/forget.ts';
import { setStepsText, stepsText, useTheme } from './header.ts';
import { dbgBarHtml, TOP_LEAD, topHtml, ueBarHtml } from './settop.ts';
import { DOCK_LEAD, dockPartHtml } from './setdock.ts';
import { FILES_LEAD, filesPartHtml } from './setfiles.ts';
import { LINKS_LEAD, linksPartHtml } from './setlinks.ts';
import { EDIT_LEAD, editPartHtml, menusHtml } from './setedit.ts';
import { PAGES_LEAD, pagesPartHtml } from './setpages.ts';
import { POPS_LEAD, popsHtml, popsInit } from './setpops.ts';
import { api, S } from '../base/model.ts';
import { cleanExt, EXT_DEFAULTS, extColors, setExtColors } from '../base/filelook.ts';
import { page } from '../base/page.ts';
import { chatOn, isChanged, isOff, onPref, pref, PREFS, resetPref, setAt, setOff, setPref } from '../base/prefs.ts';
import { shows } from './tabs.ts';
import { addEngine, changeEngines, lookEngines, lookIndex, runUht, ueEngines, ueIndex, ueUht } from '../ue/ue.ts';
import { downloadDebugger, engineNow, loadEngine, removeDebugger } from '../debug/debug.ts';
import { mbOf } from '../debug/column.ts';
import { openWelcome } from '../welcome/welcome.ts';
import { openTour } from '../welcome/tutorial.ts';
import { ACCENTS, BRIGHTS, CHAT_SIZES, CODE_LANGS, col, COLORS, theme as tokens, CODE_PRESETS, CODE_ROLES, CODE_SIZES, codeChanged, codePresetColor, codePresetOf, codeRole, codeVars, exportCode, FAR_LOOKS, farLook, FONTS, importCode, LOOK, lookOf, MONOS, resetCode, setCodePreset, setCodeRole, setFarLook, setLook, setSolid, solidLook, SOLIDS, STRENGTHS, themeName, THEMES } from '../base/theme.ts';
import { $, esc, setSave, showErr, store } from '../base/util.ts';
import { setToolsNow } from '../base/drive.ts';
import type { Tools } from '../base/drive.ts';
import { repairLine, setShare, shareChips } from '../base/accounts.ts';
import { hasUpdate, seenUpdate, tellUpdate, updateClick, updateGroup } from './update.ts';
import { tell } from '../base/notify.ts';
import { prefStep } from '../base/prefundo.ts';
import { countClick, countRow } from './count.ts';
import { capturingKey, fixedKeys, keyButton, keyChanged, keyGroups, keyNote, resetKey } from './keys.ts';
import { themeCards } from './themecards.ts';
import type { Pref } from '../base/prefs.ts';
import { licenseClick, licenseState } from './license.ts';

type Opt = { value: string; name: string };
type Arch = { archive?: string; default?: string; worktrees?: string; worktreesDefault?: string; browser?: string; tools?: Tools; cli?: string };
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
let railOn = store.get('settings:rail', true) !== false;

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
const keyOf = (agent: string, i: number) => show(bound(`model.${agent}.${i + 1}`)) || '—';
function modelKeyRows(agent: string, named: boolean) {
  const seen = seenModels(agent);
  const pick = (i: number, part: string, list: Opt[], cur: string) => {
    const at = optFor(list, cur) as Opt | undefined;
    const opts = [{ value: '', name: '—' }, ...list, ...(cur && !at ? [{ value: cur, name: cur }] : [])];
    const key = keyOf(agent, i), now = opts.find((o) => o.value === (at?.value ?? cur))?.name || '—';
    return `<select data-mk-agent="${agent}" data-mk-key="${i}" data-mk-part="${part}" style="width: 170px" title="${esc(`${cap(key)}: ${now}\nThe ${part} ${key} picks in a ${AGENT_NAME[agent]} chat. A dash leaves the ${part} as it is.`)}">${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === (at?.value ?? cur) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}</select>`;
  };
  return (
    modelKeys(agent).map((k: { model: string; effort: string }, i: number) => {
      const id = `model.${agent}.${i + 1}`;
      return row(keyButton(id) + (named ? ` <span class="sr-who">a ${AGENT_NAME[agent]} chat</span>` : ''), pick(i, 'model', seen.model, k.model) + pick(i, 'effort', seen.effort, k.effort), { rs: 'k:' + id, on: keyChanged(id), cls: 'set-mk', attrs: ` data-keyrow="${id}"` });
    }).join('') +
    `<div class="cc-help" ${seen.model.length ? 'style="visibility:hidden"' : ''}>Open a ${AGENT_NAME[agent]} Agent chat once: the models it offers show here.</div>`
  );
}

const isDefault = (hex: string) => COLORS.some((c) => c.hex === hex);
const missingDefaults = () => COLORS.filter((c) => !colorTray().some((t) => t.hex === c.hex));
function colorTrayBox() {
  const rows = colorTray().map((c, i) => `<div class="ct-row" data-ct="${i}"><span class="ct-grip" title="Move&#10;Drag to change the order.">⋮⋮</span>` +
    `<input type="color" class="ct-dot" data-ct-color="${i}" value="${c.hex}" title="Color: ${esc(c.name)}&#10;Click to change this color." aria-label="${esc(c.name)} color">` +
    `<input class="ct-name" data-ct-name="${i}" value="${esc(c.name)}" title="Name&#10;The color's name, shown when you point at it in color menus." aria-label="name">` +
    `<code class="ct-hex">${c.hex}</code><span class="ct-tag">${isDefault(c.hex) ? 'default' : ''}</span>` +
    `<button class="ct-x" data-ct-del="${i}" aria-label="remove ${esc(c.name)}">×</button></div>`).join('');
  const n = missingDefaults().length;
  return `<div class="box set-grp" data-ct-box><span class="bt">color tray</span>` +
    `<div class="cc-help">The colors in every color menu: workspaces, projects, files, sets. Something painted keeps its color when you change or remove one here.</div>` +
    `<div class="ct-list">${rows || '<span class="dim">no colors: add one</span>'}</div>` +
    `<div class="ct-acts"><label class="chip ct-add" title="Add a color&#10;Pick a color to add at the end.">+ add a color<input type="color" data-ct-add value="#888888"></label>` +
    `<button class="chip" data-ct-back title="Bring back the defaults&#10;The built-in colors you removed or changed come back at the end. Your own colors stay." ${n ? '' : 'style="visibility:hidden"'}>bring back the defaults${n ? ` (${n} missing)` : ''}</button></div></div>`;
}
function extColorsBox() {
  const map = extColors(), same = JSON.stringify(map) === JSON.stringify(EXT_DEFAULTS);
  const rows = Object.entries(map).map(([x, hex]) => `<div class="ct-row ec-row">` +
    `<input type="color" class="ct-dot" data-ec-color="${esc(x)}" value="${hex}" title="Color of ${esc(x)}&#10;Click to change it." aria-label="${esc(x)} color">` +
    `<input class="ct-name" data-ec-name="${esc(x)}" value="${esc(x)}" title="Extension&#10;Change it to rename the extension this color is for." aria-label="extension">` +
    `<code class="ct-hex">${hex}</code><span class="ec-eg" style="color:${esc(col(hex))}">name${esc(x)}</span>` +
    `<button class="ct-x" data-ec-del="${esc(x)}" title="Remove ${esc(x)}&#10;Takes the color off ${esc(x)}: its files show dimmed." aria-label="remove ${esc(x)}">×</button></div>`).join('');
  return `<div class="box set-grp" data-ec-box><span class="bt">extension colors</span>` +
    `<div class="cc-help">Tint the file icons in the explorer, and color the extensions when file extensions are set to colored.</div>` +
    `<div class="ct-list">${rows || '<span class="dim">no colors: every extension is dimmed</span>'}</div>` +
    `<div class="ct-acts"><button class="chip" data-ec-add title="Add an extension&#10;Gives one more extension a color.">+ add an extension</button>` +
    `<button class="chip" data-ec-back title="Bring back the defaults&#10;The built-in list comes back, and your changes to it go." ${same ? 'style="visibility:hidden"' : ''}>bring back the defaults</button></div></div>`;
}
const saveExt = (map: Record<string, string> | null, msg: string) => (setExtColors(map), setSave(msg), renderSettings());
const saveTray = (list: { hex: string; name?: string }[], msg: string) => (setColorTray(list), page.paintSwitch(), setSave(msg), renderSettings());
sortable(el, {
  item: '.ct-row',
  grip: '.ct-grip',
  drop(all) {
    const t = colorTray();
    saveTray(all.map((x) => t[x.dataset.ct]), 'color tray: new order');
  },
});

const shown = (c: string | null | undefined) => (c ? col(c) : 'var(--text-dim)');
function colorLine([k, word]: string[]) {
  const c = setColors(k);
  const slots = c.order.map((x: string, i: number) => `<button class="sc-n" data-sc-at="${i}" style="--ly-c:${esc(shown(x))}" title="Set ${i + 1} of ${word}&#10;Click to pick its color.&#10;&#10;Drag to move it." aria-label="set ${i + 1} of ${word}" ${c.same ? 'disabled' : ''}></button>`).join('');
  return row(word, `<span class="sc-line" data-sc-kind="${k}"><span class="sc-row">${slots}</span>` +
    chip(c.same, `data-sc-same title="All the same&#10;Every ${word} set in one color."`, 'all the same') +
    `<button class="sc-one" data-sc-at="one" style="--ly-c:${esc(shown(c.one))}" title="${cap(word)} color&#10;The one color every ${word} set takes." aria-label="the one color of ${word}"></button>` +
    `<button class="quiet" data-sc-reset ${setColorsChanged(k) ? '' : 'style="visibility:hidden"'}>reset</button></span>`);
}
const saveColors = (k: string, patch: Record<string, unknown>) => (setSetColors(k, patch), page.paintSwitch());
function pickColor(b: HTMLElement) {
  const k = b.closest<HTMLElement>('[data-sc-kind]')!.dataset.scKind!, at = b.dataset.scAt!, c = setColors(k), now = at === 'one' ? c.one : c.order[at];
  const put = (v: string | undefined) => {
    saveColors(k, at === 'one' ? { one: v, same: true } : { order: c.order.with(+at, v) });
    el.querySelector(`[data-sc-kind="${k}"] [data-sc-at="${at}"]`).style.setProperty('--ly-c', shown(v));
  };
  const r = b.getBoundingClientRect(), hex = col(now) || tokens()['text-dim'];
  popMenu(r.left, r.bottom + 4, `<div class="row">${swatches(now, 'sc-c')}</div><button class="mi" data-sc-c="">grey</button><label class="mi sc-custom">custom<input type="color" value="${esc(hex)}"></label>`, (o) => (put(o.dataset.scC), renderSettings()));
  const input = $('#colormenu input');
  input.oninput = () => put(input.value);
  input.onchange = () => renderSettings();
}
sortable(el, {
  item: '.sc-n:not(:disabled)',
  drop(all, to) {
    const k = all[to].closest('[data-sc-kind]').dataset.scKind, { order } = setColors(k);
    saveColors(k, { order: all.map((x) => order[x.dataset.scAt]) });
    renderSettings();
  },
});

const SAMPLE: Record<string, { name: string; doc: string }> = {
  cpp: { name: 'sample.cpp', doc: '#include <string>\n#define MAX_HP 100\n\nnamespace game {\n// a player in the world\nclass Player : public Entity {\npublic:\n  static const int start = 3;\n  void hit(float damage) {\n    if (damage > 0) health -= damage;\n    name = "hurt\\n";\n  }\nprivate:\n  float health = MAX_HP;\n  std::string name;\n};\n}\n\nint main() {\n  auto p = new game::Player();\n  p->hit(2.5f);\n  return nullptr == p ? 1 : 0;\n}\n' },
  js: { name: 'sample.js', doc: "import { load } from './data.js';\n\n// a player in the world\nexport class Player extends Entity {\n  static start = 3;\n  constructor(name) {\n    super();\n    this.name = name ?? 'hero';\n    this.health = 100;\n  }\n  hit(damage) {\n    if (damage > 0) this.health -= damage;\n    return this.health <= 0 ? null : `${this.name} is hurt`;\n  }\n}\n\nconst p = new Player(await load('/me'));\np.hit(2.5);\n" },
};
let ccTheme: string | null = null;
let ccLang = 'all';
const ccName = (): string => (THEMES[ccTheme as string] ? ccTheme! : themeName());
const langLabel = (l: string) => (l === 'all' ? 'all languages' : CODE_LANGS.find((x) => x.id === l)!.label);
const changedAt = (name: string, l: string) => CODE_ROLES.some((r) => Object.keys(codeChanged(name, l, r.id)).length);
const changedAny = (name: string) => ['all', ...CODE_LANGS.map((l) => l.id)].some((l) => changedAt(name, l));
const setLabel = (name: string) => CODE_PRESETS.find((p) => p.id === codePresetOf(name))!.label;
const baseWords = (name: string) => (codePresetOf(name) ? `the ${setLabel(name)} set` : "the theme's");
const SWATCH_ROLES = ['keyword', 'function', 'string', 'number', 'macro'];

const prev = document.createElement('div');
prev.className = 'cc-prev';
let prevFor: string | null = null;
function paintPreview() {
  const name = ccName(), t = THEMES[name], lang = ccLang === 'all' ? 'cpp' : ccLang;
  for (const [k, v] of Object.entries({ '--bg': t.ui.bg, '--text': t.ui.text, '--accent': t.ui.accent, ...codeVars(name, ccLang) })) prev.style.setProperty(k, v);
  if (prevFor === lang) return;
  prevFor = lang;
  prev.textContent = '';
  codeView(prev, SAMPLE[lang].name, SAMPLE[lang].doc);
}

function roleRow(name: string, r: (typeof CODE_ROLES)[number]) {
  const v = codeRole(name, ccLang, r.id), mine = Object.keys(codeChanged(name, ccLang, r.id)).length > 0;
  return `<div class="cc-role" data-role="${r.id}">
    <span class="cc-name"><i class="cc-dot ${mine ? '' : 'off'}"${mine ? ' title="Changed&#10;You changed this color here. Reset brings back the one before."' : ''}></i>${esc(r.label)}<span class="cc-eg">${esc(r.eg)}</span></span>
    <input type="color" value="${v.color}" data-cc-color="${r.id}" aria-label="${esc(r.label)} color">
    <code class="cc-hex">${v.color}</code>
    <button class="cc-bi ${v.bold ? 'on' : ''}" data-cc-bold="${r.id}" title="Bold&#10;Shows this code color in bold." aria-pressed="${v.bold}"><b>B</b></button>
    <button class="cc-bi ${v.italic ? 'on' : ''}" data-cc-italic="${r.id}" title="Italic&#10;Shows this code color in italic." aria-pressed="${v.italic}"><i>I</i></button>
    <button class="quiet cc-reset" data-cc-reset="${r.id}" title="Reset&#10;Back to ${ccLang === 'all' ? baseWords(name) : "all languages'"} color." ${mine ? '' : 'style="visibility:hidden"'}>reset</button>
  </div>`;
}

function codeGroup() {
  const name = ccName(), lname = langLabel(ccLang);
  const themes = Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${k === name ? 'selected' : ''}>${esc(t.label)}${k === themeName() ? ' (in use)' : ''}</option>`).join('');
  const langs = ['all', ...CODE_LANGS.map((l) => l.id)].map((l) => chip(l === ccLang, `data-cc-lang="${l}"`, `${esc(langLabel(l))}<i class="cc-dot ${changedAt(name, l) ? '' : 'off'}"></i>`)).join('');
  const sets = CODE_PRESETS.map((p) => chip(codePresetOf(name) === p.id, `data-cc-preset="${p.id}" title="${esc(p.label)}&#10;${esc(p.note)}${changedAny(name) ? '&#10;&#10;It replaces the colors you changed for this theme.' : ''}"`, `<span class="tsw">${SWATCH_ROLES.map((r) => `<i style="background:${codePresetColor(name, p.id, r)}"></i>`).join('')}</span>${esc(p.label)}`)).join('');
  const look = lookOf();
  return group(
    'code',
    row('code font', fonts(MONOS, 'mono'), { ...lk('mono'), desc: 'code, terminals and paths' }) +
      row('code size', seg(CODE_SIZES.map((n) => chip(look.size === n, `data-set-size="${n}" title="Code size: ${n} px&#10;Code in files and terminals at ${n} px."`, `${n} px`)).join('')), { ...lk('size'), desc: 'code in files and terminals' }) +
      row('theme', `<select data-cc-theme title="Theme&#10;The theme whose code colors you change." aria-label="theme">${themes}</select>`, { desc: 'the theme whose code colors you change' }) +
      row('color set', sets, { desc: 'a whole set of code colors for this theme', cls: 'wide' }) +
      row('language', langs, { desc: 'all languages, or one on top of them (● changed)', cls: 'wide' }) +
      `<div class="cc-help">Every language starts from all languages' colors and keeps only what you change for it (marked ●). Languages not listed here use all languages'.</div>` +
      `<div class="cc-body"><div class="cc-roles">${CODE_ROLES.map((r) => roleRow(name, r)).join('')}</div><div class="cc-prev-slot"></div></div>` +
      `<div class="cc-acts">
        <button class="chip cc-exp" data-cc-export="${ccLang}" title="Export ${esc(lname)}&#10;Saves ${esc(THEMES[name].label)}'s colors for ${esc(lname)} to a file.">export ${esc(lname)}</button>
        <button class="chip" data-cc-export="" title="Export the whole theme&#10;Saves every code color of ${esc(THEMES[name].label)} to a file.">export the whole theme</button>
        <button class="chip" data-cc-import title="Import&#10;Reads a file of code colors into ${esc(THEMES[name].label)}.">import…</button>
        <span class="grow"></span>
        <button class="quiet" data-cc-resetall ${changedAt(name, ccLang) ? '' : 'disabled'}>reset ${esc(lname)}</button>
      </div>`,
  );
}

const pick = document.createElement('input');
pick.type = 'file';
pick.accept = '.json,application/json';
pick.addEventListener('change', async () => {
  const f = pick.files![0];
  pick.value = '';
  if (!f) return;
  const name = ccName();
  try {
    const changed = importCode(name, await f.text());
    const what = Object.entries(changed).filter(([, c]) => c).map(([l]) => langLabel(l));
    setSave(what.length ? `imported into ${THEMES[name].label}: ${what.join(', ')}` : `nothing new in ${f.name}`);
  } catch (e) {
    setSave(`${f.name}: ${(e as Error).message}; nothing changed`, true);
  }
  renderSettings();
});
function download(file: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const SAVED = ['theme3', 'far', 'solid', 'look', 'code', 'codePreset', 'setColors', 'colors:tray', 'files:extColors', ...Object.keys(PREFS).filter((k) => !PREFS[k].local), 'newtab-order', 'timer:steps', 'forget:colors', 'modelKeys', 'modelKeys.codex', 'modelKeys.antigravity', 'modelKeys.cursor', 'modelKeys.copilot', 'modelKeys.grok'];
async function exportSettings() {
  const [k, s] = await Promise.all([api('GET', '/api/keys'), api('GET', '/api/settings')]);
  const browser = Object.fromEntries(SAVED.map((key) => [key, store.text(key)]));
  download('amethyst-settings.json', JSON.stringify({ amethyst: 'settings', version: 1, browser, ...(k.broken ? {} : { keys: k.keys }), openWith: s.browser || '' }, null, 2) + '\n');
  setSave(k.broken ? `exported the settings, but not the keys: ${k.path} doesn't parse` : 'exported every setting');
}
async function importSettings(text: string) {
  const f = JSON.parse(text);
  if (f?.amethyst !== 'settings' || !f.browser || typeof f.browser !== 'object') throw new Error('not an amethyst settings file');
  if (Object.values(f.browser).some((v) => v !== null && typeof v !== 'string')) throw new Error('a setting that is not text');
  if (f.keys != null) await api('PUT', '/api/keys', { keys: f.keys });
  if (typeof f.openWith === 'string') await api('PUT', '/api/settings', { browser: f.openWith });
  for (const key of SAVED.filter((x) => x in f.browser)) {
    if (f.browser[key] === null) store.del(key);
    else store.setText(key, f.browser[key]);
  }
  location.reload();
}
const pickAll = document.createElement('input');
pickAll.type = 'file';
pickAll.accept = '.json,application/json';
pickAll.addEventListener('change', async () => {
  const f = pickAll.files![0];
  pickAll.value = '';
  if (!f) return;
  try {
    await importSettings(await f.text());
  } catch (e) {
    setSave(`${f.name}: ${(e as Error).message}; nothing changed`, true);
  }
});

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
let arch: Arch | null = null;
function archiveRow() {
  if (!arch) api('GET', '/api/settings').then((r) => ((arch = r), renderSettings()), showErr);
  const at = arch?.archive || '';
  return row(
    'archive folder',
    `<span class="set-path set-at" title="${esc(at)}" data-tip-mono data-tip-cut>${esc(at)}</span>` +
      `<button class="chip" data-arch-change title="Change&#10;Another folder for the archive. What is archived moves along.">change…</button>` +
      `<button class="chip" data-arch-default ${!arch || at === arch.default ? 'disabled' : ''} title="Default&#10;Back to ${esc(arch?.default || '')}." data-tip-mono>default</button>`,
    { desc: 'On the same drive as a project, archiving only moves it. On another drive it is copied there, then removed from the project (and copied back to restore).', cls: 'wide' },
  );
}
async function moveArchive(to: string) {
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', { archive: to })) };
    setSave(`archive folder: ${arch!.archive}`);
  } catch (e) {
    showErr(e);
  }
  renderSettings();
}
async function changeArchive() {
  const to = DESKTOP
    ? await DESKTOP.pickFolder({ title: 'the archive folder', defaultPath: arch?.archive })
    : await ask({ title: 'archive folder', text: 'Where archived things go: an empty folder, or a new one, outside your projects. What is archived now moves along.', label: 'folder', value: arch?.archive || '' });
  if (to && to.trim() && to.trim() !== arch?.archive) await moveArchive(to.trim());
}

function worktreesRow() {
  if (!arch) api('GET', '/api/settings').then((r) => ((arch = r), renderSettings()), showErr);
  const at = arch?.worktrees || '';
  return row(
    'worktrees folder',
    `<span class="set-path set-at" title="${esc(at)}" data-tip-mono data-tip-cut>${esc(at)}</span>` +
      `<button class="chip" data-wt-change title="Change&#10;Another folder for new worktrees. The ones already made stay where they are.">change…</button>` +
      `<button class="chip" data-wt-default ${!arch || at === arch.worktreesDefault ? 'disabled' : ''} title="Default&#10;Back to ${esc(arch?.worktreesDefault || '')}." data-tip-mono>default</button>`,
    { desc: "Where a chat's own worktree goes: outside every project. On the projects' drive, paths are shorter and the system drive stays free.", cls: 'wide' },
  );
}
async function setWorktrees(to: string) {
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', { worktrees: to })) };
    setSave(`worktrees folder: ${arch!.worktrees}`);
  } catch (e) {
    showErr(e);
  }
  renderSettings();
}
async function changeWorktrees() {
  const to = DESKTOP
    ? await DESKTOP.pickFolder({ title: 'the worktrees folder', defaultPath: arch?.worktrees })
    : await ask({ title: 'worktrees folder', text: "Where new chats' worktrees go: a folder outside your projects. The ones made already stay where they are.", label: 'folder', value: arch?.worktrees || '' });
  if (to && to.trim() && to.trim() !== arch?.worktrees) await setWorktrees(to.trim());
}

const TOOLS: Record<keyof Tools, string> = { chats: 'chats can drive other chats', asks: "chats answer other chats' permission asks", path: 'the amethyst command in terminals', debug: 'agents can control the debugger' };
function toolsRows() {
  if (!arch) api('GET', '/api/settings').then((r) => ((arch = r), renderSettings()), showErr);
  const t = arch?.tools || { chats: true, asks: false, path: true, debug: true };
  return (
    row(TOOLS.chats, tg(t.chats, 'data-tools="chats"'), { desc: "When you tell a chat to, it can use the amethyst command from its own terminal to send the project's other chats work, wait for them, read their answers, answer their questions and set their model and options. Nothing is added to what agents see. @ in a chat's box lists the chats. Off: chats can't, from their next try, and @ lists only files." }) +
    row(TOOLS.asks, tg(t.asks, 'data-tools="asks"'), { desc: "Off: only you, in Amethyst's own window, answer when a chat asks to run a command or edit a file, approve a plan so that it works without asking, or put a chat in a mode that does. Other chats, agents outside Amethyst and terminals can't. On: they can." }) +
    row(TOOLS.path, tg(t.path, 'data-tools="path"'), { desc: `amethyst <feature> <action> in a new terminal, and amethyst mcp add for agents outside Amethyst. ${arch?.cli || ''}`.trim() }) +
    row(TOOLS.debug, tg(t.debug, 'data-tools="debug"'), { desc: "When you tell a chat to, it can use the amethyst command from its own terminal to start and stop the debugger, step, continue, pause, set the next statement, set and remove breakpoints and change values; you see each one in the debug column, marked as an agent's. Ending Unreal Editor needs them to say so outright. Off: they can still read where it stopped, the stack and the variables, and evaluate expressions without calls." })
  );
}
async function setTools(k: keyof Tools) {
  const t = arch?.tools || { chats: true, asks: false, path: true, debug: true };
  try {
    arch = { ...arch, ...(await api('PUT', '/api/settings', { tools: { [k]: !t[k] } })) };
    setToolsNow(arch!.tools!);
    setSave(`${TOOLS[k]}: ${arch!.tools![k] ? 'on' : 'off'}`);
  } catch (e) {
    showErr(e);
  }
  renderSettings();
}

function browserRow() {
  const cur = arch?.browser || '';
  return row(
    'browser for outside links',
    `<input class="set-browser" type="text" value="${esc(cur)}" placeholder="msedge" style="width: 180px">` +
      `<button class="chip" data-browser-save>save</button>`,
    { desc: 'the browser for everything opened outside Amethyst; empty: msedge' },
  );
}

const SOURCE_URL = 'https://github.com/devdelion-one/Amethyst.exe';
const DOCS_URL = `${SOURCE_URL}/blob/main/docs`;
const LICENSE_URL = 'https://amethyst.run/license';
const DOC_GROUPS: [string, [string, string, string][]][] = [
  ['start here', [
    ['Getting started', 'getting-started.md', 'Install on Windows, set up workspaces and projects, sign in to your agents, and learn the core workflow.'],
    ['Modes, browser tab, quick tools, and shortcuts', 'modes-and-shortcuts.md', 'Editor, Agents, Terminals, Research, Orchestration, The Mind, browser element picker, quick windows, Freeze Log, and default keys.'],
    ['Agent setup and accounts', 'agent-setup-and-accounts.md', 'Where each agent keeps instructions, skills, rules, and memory, plus multi-account Claude switching and usage limits.'],
    ['Reviewing edits and rewind', 'review-and-rewind.md', 'Review agent file edits per file or per turn, keep or reject changes, and rewind chats and files with restore points.'],
  ]],
  ['agent workflows and automation', [
    ['Agents from other models as subagents', 'agents.md', 'Start Claude, Codex, Antigravity, Cursor, GitHub Copilot, or Grok as a subagent from inside any chat with amethyst agent run.'],
    ['Driving other chats (orchestration)', 'orchestration.md', 'Have one chat or your terminal start, message, wait for, read, and organize other chats in the same project.'],
    ['CLI and MCP server', 'cli-and-mcp.md', 'Use the amethyst command from your terminal or scripts, and connect outside agents through amethyst mcp.'],
    ['Command and MCP reference', 'commands.md', 'Complete reference of every amethyst CLI command, flag, and MCP tool name.'],
    ['Worktrees and context handoff', 'worktrees-and-handoff.md', 'Isolate parallel chats in git worktrees, copy gitignored files with .worktreeinclude, and switch agents mid-chat.'],
  ]],
  ['project tools', [
    ['Git, pull requests, and issues', 'git-and-github.md', 'Open diffs, history, branch comparisons, PRs, and issues in Amethyst from an agent, and customize branch naming patterns.'],
    ['Unreal Engine and the debugger', 'unreal-debugger.md', 'Set up the native Windows debugger and let agents inspect or control a live Unreal Editor or game session.'],
  ]],
];
const docsBox = () =>
  DOC_GROUPS.map(([title, items]) =>
    card(
      title,
      items
        .map(([name, file, desc]) =>
          row(
            esc(name),
            `<a class="up-link" href="${DOCS_URL}/${file}" target="_blank" rel="noopener" title="${esc(name)}&#10;Opens ${esc(file)} on GitHub in your browser.">open</a>`,
            { desc },
          ),
        )
        .join(''),
    ),
  ).join('');
const licenseRow = () => row('license',
  `<span class="up-free">free beta</span>` +
  `<a class="up-link" href="${LICENSE_URL}" target="_blank" data-license="terms" title="Terms&#10;The license, in your browser. Free until 30 days after 1.0.0.">terms</a>` +
  `<a class="up-link" href="${SOURCE_URL}" target="_blank" data-license="source" title="Source&#10;All of Amethyst's code, on GitHub.">source</a>` +
  licenseState(), { desc: 'free until 30 days after 1.0.0; all of the code is on GitHub' });


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
const descOf = (e: Pref) => e.desc ?? (e.choices ? e.tip || '' : Array.isArray(e.def) ? 'dashed = hidden' : e.on ? `${e.on}; off: ${e.off}` : e.off ? `off: ${e.off}` : '');
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
type BranchNames = { names: Record<string, string>; saved: Record<string, string>; defaults: Record<string, string>; examples: Record<string, string> };
let bn: { pid: string | null; at: BranchNames | null } = { pid: null, at: null };
const loadBn = () => api('GET', '/api/git/branch-names').then((r) => ((bn.at = r), renderSettings()), showErr);
const BN_ROWS: [string, string, string, string][] = [
  ['chat', 'chat worktree', "the branch of a chat's own worktree", "Chat branch\nThe branch name of a chat's own worktree. Here you can use {chat} and {user}.\n\n{chat} is the chat's code, {user} your git user name."],
  ['issue', 'issue', 'the branch made when you start on an issue', "Issue branch\nThe branch made when you start on an issue. Here you can use {n}, which it needs, {title} and {user}.\n\n{n} is the number, {title} the issue's title, {user} your git user name."],
  ['pr', 'pull request folder', 'the branch of a pull request opened in its own folder', 'Pull request branch\nThe branch of a pull request opened in its own folder. Here you can use {n}, which it needs, and {user}.\n\n{n} is the number, {user} your git user name.'],
  ['new', 'new branch box', 'what the new branch box in source control starts with', 'New branch\nWhat the new branch box in source control starts with. Here you can use {user}.\n\n{user} is your git user name.'],
];
function branchNamesRows() {
  if (!S.pid) return '';
  if (bn.pid !== S.pid) {
    bn = { pid: S.pid, at: null };
    loadBn();
  }
  const a = bn.at;
  return BN_ROWS.map(([k, label, desc, tip]) => {
    const v = a?.names[k] ?? '', def = a?.defaults[k] || '', ex = a?.examples[k] || '';
    return row(
      label,
      `<input class="set-bn" type="text" data-bn="${k}" value="${esc(v)}" placeholder="${esc(def || 'empty')}" spellcheck="false" style="width: 180px" ${a ? '' : 'disabled'} title="${esc(tip)}">` +
        `<span class="set-at">${ex ? esc('e.g. ' + ex) : ''}</span>` +
        `<button class="chip" data-bn-default="${k}" ${a && a.saved[k] != null ? '' : 'disabled'} title="Default&#10;Back to ${esc(def || 'empty')}.">default</button>`,
      { desc, cls: 'wide' },
    );
  }).join('');
}
async function saveBn(k: string, v: string) {
  let why = '';
  try {
    bn.at = await api('PUT', '/api/git/branch-names', { [k]: v });
    setSave(`branch names: ${k} is ${bn.at!.names[k] || 'empty'}`);
  } catch (e) {
    why = (e as Error).message;
  }
  renderSettings();
  if (why) tell(el.querySelector(`[data-bn="${k}"]`), { title: "That pattern can't be used", line: why, ms: 4000 });
}
for (const k of Object.keys(PREFS)) onPref(k, () => renderSettings());
rowIcons({ 'settings:find': () => icon('search') });
barMenu('.sw-head', 'settings');

const topRows = () => TOPBAR.flatMap((g) => g.rows.filter((r) => !r.when || r.when()).map((r) => ({ ...r, g: g.g })));
const pictured = () => new Set([...topRows().map((r) => r.k), ...stdKeys()]);
const showCards = (part: string, pre: [string, string][] = [], post: [string, string][] = []) =>
  prefCards('show', { part, pre, post, skip: pictured() });
const SHOW_PARTS: { id: string; name: string; lead: string; html: () => string }[] = [
  { id: 'chat', name: 'Chat', lead: CHAT_LEAD, html: () => chatHeadHtml() + chatPartsHtml() + showCards('chat') },
  { id: 'list', name: 'Agents list', lead: LIST_LEAD, html: () => listHtml() + showCards('list') },
  { id: 'win2', name: 'Window 2, 3…', lead: WIN2_LEAD, html: () => win2Html() + showCards('win2') },
  { id: 'quick', name: 'Quick windows', lead: QUICK_LEAD, html: () => quickHtml() + ueBarHtml() + showCards('quick') },
  { id: 'top', name: 'Top bar', lead: TOP_LEAD, html: () => topHtml() + showCards('top') },
  { id: 'dock', name: 'Dock', lead: DOCK_LEAD, html: () => dockPartHtml() + showCards('dock') },
  { id: 'files', name: 'Files and explorer', lead: FILES_LEAD, html: () => filesPartHtml(dirsBox()) + showCards('files') },
  { id: 'links', name: 'Links and chips', lead: LINKS_LEAD, html: () => linksPartHtml() + showCards('links') },
  { id: 'edit', name: 'Editing', lead: EDIT_LEAD, html: () => editPartHtml() + dbgBarHtml() + showCards('edit') },
  { id: 'pages', name: 'Pages', lead: PAGES_LEAD, html: () => pagesPartHtml() + showCards('pages') },
  { id: 'all', name: 'Menus and pop-ups', lead: POPS_LEAD, html: () => ctrlpHtml() + menusHtml() + popsHtml() + showCards('all') },
];

const LOOKS: Record<string, [string, () => boolean, () => void]> = {
  theme: ['theme', () => themeName() !== 'ink', () => useTheme('ink')],
  accent: ['accent', () => lookOf().accent !== LOOK.accent, () => pickAccent('accent', LOOK.accent)],
  strength: ['accent strength', () => lookOf().strength !== LOOK.strength, () => pickAccent('strength', LOOK.strength)],
  bright: ['brightness', () => lookOf().bright !== LOOK.bright, () => setLook('bright', LOOK.bright)],
  solid: ['corners', () => solidLook() !== 'v1', () => setSolid('v1')],
  far: ['zoomed-out mind web', () => farLook() !== 'soft', () => setFarLook('soft')],
  font: ['text font', () => lookOf().font !== LOOK.font, () => setLook('font', LOOK.font)],
  chat: ['text size of new chats', () => lookOf().chat !== LOOK.chat, () => setLook('chat', LOOK.chat)],
  mono: ['code font', () => lookOf().mono !== LOOK.mono, () => setLook('mono', LOOK.mono)],
  size: ['code size', () => lookOf().size !== LOOK.size, () => setLook('size', LOOK.size)],
};
const lk = (k: string): RowOpts => ({ rs: 'x:' + k, on: LOOKS[k][1](), attrs: ` data-row="x:${k}"` });
const lookSel = (key: 'strength' | 'bright' | 'chat', list: number[], tip: (n: number) => string) =>
  `<select data-look="${key}" aria-label="${esc(LOOKS[key][0])}">${list.map((n) => `<option value="${n}" ${lookOf()[key] === n ? 'selected' : ''} title="${esc(tip(n))}">${n} %</option>`).join('')}</select>`;
function fonts(list: Record<string, { label: string; css: string | null }>, key: 'font' | 'mono') {
  const look = lookOf();
  return seg(Object.entries(list).map(([k, f]: [string, any]) => chip(look[key] === k, `data-set-${key}="${k}" title="${key === 'font' ? 'Font' : 'Code font'}: ${esc(f.label)}&#10;${key === 'font' ? "The app's text" : 'Code, terminals and paths'} in ${esc(f.label)}."`, `${esc(f.label)} · best`, `font-family: ${f.css || `var(--${key === 'font' ? 'font' : 'mono'})`}`)).join(''));
}
function lookBox() {
  const look = lookOf();
  const dot = (c: string) => `<span class="tsw"><i style="background:${c}"></i></span>`, any = look.accent && !Object.values(ACCENTS).includes(look.accent) ? look.accent : '';
  const themes = `<div class="set-row set-themes" data-row="x:theme"><div class="sr-t"><span class="lbl">theme</span>${themeCards('data-set-theme', Object.keys(THEMES))}</div>${rsBtn('x:theme', LOOKS.theme[1]())}<span class="set-opts"></span></div>`;
  return card('theme', themes) +
    card('accent and light',
      row('accent', chip(!look.accent, `data-set-accent="" title="Theme's own&#10;Each theme keeps its own accent."`, "theme's own") +
        Object.entries(ACCENTS).map(([n, h]) => chip(look.accent === h, `data-set-accent="${h}" title="${cap(n)}&#10;${cap(n)} in every theme, fitted to its page."`, dot(h) + n)).join('') +
        `<label class="chip ct-add ${any ? 'on' : ''}" title="Any color&#10;Pick one accent for every theme.">${dot(any || '#888888')}any color<input type="color" data-set-accent-pick value="${any || '#888888'}"></label>`, { ...lk('accent'), desc: "the color of what's picked and what's working", cls: 'wide' }) +
      row('accent strength', lookSel('strength', STRENGTHS, (n) => `the accent at ${n} % of its color`), { ...lk('strength'), desc: 'softens the accent toward grey' }) +
      row('brightness', lookSel('bright', BRIGHTS, (n) => `every window at ${n} % brightness`), { ...lk('bright'), desc: 'dims the whole app, every window' }) +
      (Object.keys(SOLIDS).length > 1 ? row('corners', seg(Object.entries(SOLIDS).map(([k, label]) => chip(solidLook() === k, `data-set-solid="${k}" title="Look: ${esc(label.replace(/ · /g, ' '))}&#10;The look every part of the app follows."`, esc(label))).join('')), { ...lk('solid'), desc: 'the look every part follows' }) : '') +
      row('zoomed-out mind web', seg(Object.entries(FAR_LOOKS).map(([k, label]) => chip(farLook() === k, `data-set-far="${k}" title="${esc(cap(label))}&#10;How the mind web's hubs look zoomed far out."`, esc(label))).join('')), { ...lk('far'), desc: "how the mind web's hubs look zoomed far out" }) +
      prefRows('look')) +
    card('text',
      row('text font', fonts(FONTS, 'font'), { ...lk('font'), desc: "the app's text" }) +
      row('text size of new chats', lookSel('chat', CHAT_SIZES, (n) => `a new chat's text at ${n} %`), { ...lk('chat'), desc: "a new chat's text; ctrl wheel changes one chat" }));
}

const markRow = () => row('marks', [1, 2, 3].map((n) => `<i class="mk-d m${n}">${ICONS['mark' + n]}</i><input data-mark-name="${n}" value="${esc(pref('marks:names')[n - 1])}" placeholder="${esc(markName(n))}" style="width: 110px" title="Mark name&#10;What this mark means to you, on chats, files and folders.">`).join(''), { desc: 'what each mark means to you, on chats, files and folders', rs: 'p:marks:names', on: isChanged('marks:names'), cls: 'wide', attrs: ' data-row="marks:names"' });

headsInit(el, { rsBtn, redraw: () => renderSettings() });
stdInit({ rsBtn, redraw: () => renderSettings(), fold: foldAdv });
popsInit({ rsBtn, head: secHead });
pinInit(el);
el.addEventListener('mouseover', (e: MouseEvent) => stdHover(el, e.target as Element));
new ResizeObserver(() => fitLooks(el)).observe(el);
document.fonts?.ready.then(() => fitLooks(el));

let accs: any[] | null = null, accsAsked = false;
function accountsRow() {
  if (!accsAsked) {
    accsAsked = true;
    api('GET', '/api/agent/accounts/setup').then((r) => ((accs = r.accounts), renderSettings()), () => ((accs = []), renderSettings()));
  }
  if (!accs?.length || !chatOn('claude')) return '';
  const line = (a: any) => {
    const who = a.id === 'default' ? 'main account' : a.email ? a.email.split('@')[0] : a.id;
    const fix = repairLine({ ...a, repair: { fixed: a.fixed, kept: a.kept, waits: a.waits } });
    return `<span class="acc-row"><b${a.email ? ` title="${esc(`${a.email}\nThe address this account signs in with.`)}"` : ''}>${esc(who)}</b><span class="set-path" data-tip-mono data-tip-cut title="${esc(a.where)}">${esc(a.where)}</span>${shareChips(a)}${fix ? `<span class="acc-fix">${esc(fix)}</span>` : ''}</span>`;
  };
  return row('claude accounts', accs.map(line).join(''), { desc: "Each added account has its own folder for its sign-in. Shared with main: it uses the main account's CLAUDE.md, settings, rules, skills, plugins and memory. Its own: its own copies. Chat history is shared either way, so chats move between accounts.", cls: 'wide' });
}

const writerRow = () => row('Writing helper', writerRowHtml(), { cls: 'wide', attrs: ' data-row="x:writer"', rs: 'p:writer:use', on: isChanged('writer:use'), desc: `${writerLine()} It writes commit messages and pull request descriptions when you click ✦.` });
const agentsBox = () => prefCards('agents', { title: 'agents', skip: new Set(['marks:on']), pre: [['agents', ''], ['Pinned agent', pinHtml()], ['Writing helper', writerRow()]], post: [['the chat list', `<div class="set-row set-moved" data-row="x:moved"><div class="sr-t"><span class="lbl">${esc(LIST_MOVED)}</span></div><span class="sr-rs-no"></span><span class="set-opts"><button class="chip" data-set-go="show/list" title="Show and hide, Agents list&#10;Opens the section with the chat list's switches.">Open it</button></span></div>`], ['marks', markRow() + marksRowHtml()], ['worktrees and accounts', worktreesRow() + accountsRow()], ['Amethyst tools', toolsRows()]] });

const generalBox = () =>
  prefCards('windows', { title: 'windows', post: [['windows', trayRows()]] }) +
  card("don't forget", listRow() + forgetColorsRow()) +
  card('timer', row('timer steps', `<input data-timer-steps value="${esc(stepsText())}" style="width: 180px" title="Timer steps&#10;What each click on the timer goes through, after 0: like 15m 30m 1h 1d." aria-label="timer steps">`, { desc: 'what a click on the timer goes through, after 0: like 15m 30m 1h 1d' })) +
  card('welcome page', row('first launch', `<button class="chip" data-welcome-open title="Show the welcome page again&#10;The basics or everything, theme, mode buttons, agents, your workspaces and projects, Unreal and keys.">show the welcome page again</button>`, { desc: 'start with the basics or everything, theme, where the mode buttons sit, which agents you use, your workspaces and projects, Unreal and a few keys' }) + row('easy tutorial', `<button class="chip" data-tour-open title="Start the tutorial&#10;A few steps to try, about a minute.">start the tutorial</button>`, { desc: 'a few steps to try: hide the bars, open the explorer and a new chat, then the editor, orchestration and agents tabs' }));

let tray: { on: boolean; login: boolean } | null = null;
function trayRows() {
  if (!DESKTOP?.trayState) return '';
  if (!tray) DESKTOP.trayState().then((s) => s && ((tray = s), renderSettings()));
  const s = tray || { on: true, login: true };
  return row('× keeps it in the tray', tg(s.on, `data-tray-on="${s.on ? '' : '1'}" aria-label="× keeps it in the tray"`), { desc: '× hides it in the tray and you quit from the tray icon; off: × quits Amethyst' }) +
    row('start with windows', tg(s.login, `data-tray-login="${s.login ? '' : '1'}" aria-label="start with windows"`), { desc: 'starts in the tray when you sign in to Windows; off: only when you start it' });
}
async function setTray(c: { on?: boolean; login?: boolean }) {
  tray = await DESKTOP!.traySet(c);
  setSave('on' in c ? `× keeps it in the tray: ${tray!.on ? 'on' : 'off'}` : `start with windows: ${tray!.login ? 'on' : 'off'}`);
  renderSettings();
}

function forgetColorsRow() {
  const css = getComputedStyle(document.documentElement);
  const hex = (n: number) => {
    const v = css.getPropertyValue(`--fg-c${n}`).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888';
  };
  return row("don't forget colors", [['!', 'normal', "a normal don't forget"], ['!!', 'soon', "a don't forget due soon"], ['!!!', 'urgent', "an urgent don't forget"]].map(([m, w, d], i) => `<input type="color" value="${hex(i + 1)}" data-forget-color="${i + 1}" title="${cap(w)}: ${m}&#10;The color of ${d}. Click to change it." aria-label="${w} color">`).join('') +
    `<button class="quiet" data-forget-colors-reset ${forgetColors().some(Boolean) ? '' : 'style="visibility:hidden"'}>reset</button>`, { desc: '! normal, !! soon, !!! urgent' });
}

const listRow = () => {
  const on = forgetListOn(), here = forgetListHere();
  return row("don't forget list at", here
    ? `<input data-forget-list value="${esc(forgetListText())}" style="width: 180px" title="Times&#10;This workspace's times: like 12:00, 12 16 20, or every 6h." aria-label="times">` + tg(on, `data-forget-list-on="${on ? '' : '1'}" aria-label="don't forget list at"`)
    : `<span class="dim">${pref('forget:on') ? 'open a workspace' : "don't forget is off"}</span>`, { desc: "the whole list comes up at this workspace's times, like 12:00, 12 16 20 or every 6h; off: it never comes up by itself" });
};

const filesBox = () => prefCards('files', {
  title: 'files',
  post: [['the archive', row('archived things', `<button class="chip" data-view="archive" title="Open the archive&#10;Bring archived things back from here." data-tip-keys="=4:open the archive"><kbd>4</kbd>open the archive</button>`, { desc: 'everything archived, to bring back' }) + archiveRow()],
    ['branch names in this project', branchNamesRows()],
    ['opening files', browserRow() + (DESKTOP ? row('text and markdown files', `<button class="chip" data-default-apps>choose in windows</button>`, { desc: 'make Amethyst their default app in Windows' }) : '')],
    ['settings file', row('settings file', `<button class="chip" data-all-export>export…</button><button class="chip" data-all-import title="Import&#10;Loads a settings file and reloads this window.">import…</button>`, { desc: 'every setting in one file, to load on another PC' })]],
});

function unrealBox() {
  const list = ueEngines();
  const engines = list === null ? '<span class="dim">looking…</span>' : list.length ? list.map((e: { id: string; dir: string; from?: string }) => `<span class="ue-seteng" title="${esc(e.dir)}" data-tip-mono data-tip-cut=".dim"><b>${esc(/^\d/.test(e.id) ? 'UE ' + e.id : 'UE (source)')}</b> <span class="dim">${esc(e.dir)}</span>${e.from === 'added' ? `<button class="quiet" data-ue-remove="${esc(e.dir)}" aria-label="remove">×</button>` : ''}</span>`).join('') : '<span class="dim">none found</span>';
  return prefCards('unreal', { title: 'unreal engine' }) + (pref('ue:on') ? card('engines', row('engines on this pc', engines + `<button class="chip" data-ue-look>look again</button><button class="chip" data-ue-add title="Add an engine folder&#10;Adds an Unreal Engine you copied by hand and never registered, so the app can build with it.">add an engine folder…</button>`, { cls: 'wide' }) + indexRow() + uhtRow()) + debuggerCard() : '');
}

function uhtRow() {
  if (!pref('ue:uht')) return '';
  const x = ueUht();
  const n = x?.last?.messages.filter((m) => m.sev === 'error').length || 0, w = (x?.last?.messages.length || 0) - n;
  const last = x?.last ? `last run ${new Date(x.last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${(x.last.ms / 1000).toFixed(1)} s · ${x.last.state === 'error' ? "it didn't finish" : n || w ? [n ? `${n} error${n === 1 ? '' : 's'}` : '', w ? `${w} warning${w === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ') : 'no errors'}` : '';
  const why = !x ? '' : x.why === 'no-manifest' ? 'runs after the first build: it reads the list of headers the build writes' : x.why === 'unsupported' ? "this engine's build tool can't run it alone" : x.why === 'building' ? 'waits while a build runs' : x.why === 'unconfirmed' ? 'waits for your OK in the build window' : '';
  const what = x?.state === 'running' ? 'running…' : x?.state === 'queued' ? 'about to run' : why || last || 'runs after you save a header';
  const tip = "Epic's Unreal Header Tool over the project, writing nothing. A header added since the last build isn't in its list until the next build";
  return row('header tool', `<span class="ue-uht dim">${esc(what)}</span>${x?.state === 'running' ? '' : `<button class="chip" data-ue-uht>run</button>`}`, { desc: tip });
}

function debuggerCard() {
  if (!pref('debug:on')) return '';
  const e = engineNow();
  if (!e) {
    loadEngine();
    return card('debugger', row('the debugger', '<span class="dim">looking…</span>'));
  }
  if (!e.os) return card('debugger', row('the debugger', '<span class="dim">Windows only for now</span>'));
  const what = e.installing ? 'downloading…' : e.ready ? `downloaded · ${mbOf(e.bytes)} · ${e.version}` : `not downloaded · ${e.mb} MB`;
  const btn = e.installing ? '' : e.ready ? (e.fake ? '' : `<button class="chip" data-dbg-remove title="Remove&#10;Deletes the debugger's files. F5 offers the download again.">remove</button>`) : `<button class="chip" data-dbg-get title="Download&#10;Gets Microsoft's debug engine and the adapter, after you accept Microsoft's license.">download…</button>`;
  return card('debugger', row('the debugger', `<span class="dim">${esc(what)}</span>${btn}`, { desc: "Microsoft's debug engine and the adapter, in Amethyst's own folder; it comes the first time you press F5" }));
}

function indexRow() {
  const x = ueIndex();
  if (!x) return '';
  const name = x.engine ? (/^\d/.test(x.engine) ? 'UE ' + x.engine : 'UE (source)') : 'the engine';
  const what = x.state === 'building' ? `building… ${x.total ? Math.floor((100 * x.done) / x.total) : 0}%` : x.state === 'ready' ? `${name} · ${x.names >= 1000 ? Math.round(x.names / 1000) + 'k' : x.names} names · built ${new Date(x.built).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : x.state === 'failed' ? `couldn't read ${name}${x.error ? ': ' + x.error : ''}` : 'not built yet';
  const tip = 'the types, macros and modules of the engine and this project, so a misspelled name is marked as you type';
  return row('engine list', `<span class="ue-index dim">${esc(what)}</span>${x.state === 'building' ? '' : `<button class="chip" data-ue-index>rebuild</button>`}`, { desc: tip });
}

let mkAgent = 'claude';
function modelBox(all: boolean) {
  const on = Object.entries(AGENT_NAME).filter(([k]) => chatOn(k)), at = chatOn(mkAgent) ? mkAgent : on[0][0];
  const pick = on.length > 1 && !all ? row('in a chat of', seg(on.map(([k, name]) => chip(k === at, `data-mk-pick="${k}" title="${esc(name)}&#10;The five model keys in a ${esc(name)} chat."`, name)).join('')), { desc: 'each agent has its own five' }) : '';
  return card('', pick + (all ? on.map(([k]) => k) : [at]).map((a) => modelKeyRows(a, all)).join(''));
}
const keyRow = ([k, what, , ids]: [string, string, unknown?, string[]?]) =>
  ids ? row(esc(what), ids.map(keyButton).join(''), { rs: 'k:' + ids.join(','), on: ids.some(keyChanged), cls: 'set-key', attrs: ` data-keyrow="${esc(ids.join(','))}"` })
    : row(esc(what), fixedKeys(k), { cls: 'set-key set-fixed' });
const KEY_LEAD = 'Click a key and press the new one: esc keeps it, backspace clears it. ? shows these keys from anywhere.';
const keyParts = (): Sub[] => {
  const gs = keyGroups().map((g) => ({ id: `keys/${g.id}`, label: g.name, name: `Shortcuts › ${g.name}`, lead: KEY_LEAD, html: () => g.cards.map(([t, rows]) => card(t, rows.map(keyRow).join(''))).join('') }));
  const models: Sub = { id: 'keys/models', label: 'Model keys', name: 'Shortcuts › Model keys', lead: "Alt 1-5 set the model and effort of the chat you're in; each agent has its own five. Click a key to change it.", html: () => modelBox(finding) };
  return [...gs.slice(0, 2), models, ...gs.slice(2)];
};
const updateBox = () => {
  const rows = prefRows('amethyst') + countRow(row, tg);
  return hasUpdate() ? updateGroup({ group: card, row, chip, tg, rows, tail: licenseRow() }) : card('amethyst', rows + licenseRow());
};

const showSub = (id: string, group: string, label?: string): Sub => {
  const p = SHOW_PARTS.find((x) => x.id === id)!;
  return { id: `show/${p.id}`, label: label || p.name, name: `${group} › ${label || p.name}`, lead: p.lead, html: p.html };
};
const lookFullHtml = () => lookBox() + colorTrayBox() + card('set colors', `<div class="cc-help">click a number to change its color, drag it to change the order${pref('switch:place') === 'slots' ? '; with place: slots, new views take these in turn, or the one color with all the same' : ''}</div>` + SET_GROUPS.map(colorLine).join(''));
const SVG = (d: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const SECTIONS: Sec[] = [
  { id: 'general', name: 'General', icon: '<path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/><circle cx="8" cy="8" r="2.6"/>', lead: "Windows, don't forget, the timer, the welcome page and the tutorial.", html: generalBox },
  {
    id: 'look', name: 'Appearance', icon: '<circle cx="8" cy="8" r="6"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/>',
    subs: () => [
      { id: 'look', label: 'Theme and look', name: 'Appearance › Theme and look', lead: 'Theme, accent, brightness and type for the whole app, and the colors in color menus.', html: lookFullHtml },
      { id: 'code', label: 'Code colors', name: 'Appearance › Code colors', lead: 'The code font and size, and the colors in files, per theme and language.', html: codeGroup },
    ],
  },
  {
    id: 'show', name: 'Layout and bars', icon: '<rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12M6 6v7.5"/>',
    subs: () => [
      showSub('top', 'Layout and bars'),
      showSub('dock', 'Layout and bars'),
      showSub('quick', 'Layout and bars'),
      showSub('win2', 'Layout and bars'),
      showSub('all', 'Layout and bars'),
    ],
  },
  {
    id: 'agents', name: 'Agents and chat', icon: '<path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2M12.6 3.4l-9.2 9.2"/>',
    subs: () => [
      { id: 'agents', label: 'Providers and tools', name: 'Agents and chat › Providers and tools', lead: 'Claude, Codex and Antigravity: which you use, pinned agent, marks, worktrees and accounts.', html: agentsBox },
      showSub('chat', 'Agents and chat', 'Chat window'),
      showSub('list', 'Agents and chat', 'Agents list'),
    ],
  },
  {
    id: 'files', name: 'Files and editor', icon: '<path d="M4 1.5h5l3.5 3.5v9.5h-8.5z"/><path d="M9 1.5v3.5h3.5"/>',
    subs: () => [
      { id: 'files', label: 'Files and git', name: 'Files and editor › Files and git', lead: 'New files, the archive, branch names, outside links, extension colors and the settings file.', html: () => filesBox() + extColorsBox() },
      showSub('files', 'Files and editor', 'Explorer'),
      showSub('edit', 'Files and editor', 'Editing'),
      showSub('links', 'Files and editor', 'Links and chips'),
      showSub('pages', 'Files and editor', 'Pages'),
    ],
  },
  { id: 'unreal', name: 'Unreal', icon: '<path d="M8 1.5 14 5v6l-6 3.5L2 11V5z"/><path d="M2 5l6 3.5L14 5M8 8.5v6"/>', lead: 'The build button, its window, and C++ help for Unreal projects.', html: unrealBox },
  { id: 'keys', name: 'Shortcuts', icon: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 7h1M7 7h1M10 7h1M4.5 9.5h7"/>', subs: keyParts },
  {
    id: 'update', name: 'Updates and docs', icon: '<path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11"/>',
    subs: () => [
      { id: 'update', label: 'Updates', name: 'Updates and docs › Updates', lead: 'The version, updates, the install count and the license.', html: updateBox },
      { id: 'docs', label: 'Docs', name: 'Updates and docs › Docs', lead: 'Guides for Amethyst, its CLI and MCP tools, and how to tell your agents to use them.', html: docsBox },
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
  const find = (): Element | null => el.querySelector(`[data-keyrow="${q}"], [data-rs="k:${q}"], [data-rs="p:${q}"], .set-row:has([data-pref="${q}"]), .hr-row[data-row="${q}"], .hr-row[data-row^="${q}:"], .hr-row[data-hr-keys~="${q}"]`);
  const hit = find();
  const adv = hit?.closest('.set-adv')?.closest('.set-grp:not(.adv-open)')?.querySelector<HTMLElement>('[data-adv]')?.dataset.adv;
  if (adv) (openAdv.add(adv), renderSettings());
  const hr = hit?.closest<HTMLElement>('.hr-row');
  if (hr?.dataset.hr) (selectRow(hr.dataset.hr), renderSettings());
  find()?.scrollIntoView({ block: 'center' });
}
const EXTRA_PREFS = ['marks:names', 'writer:use', 'deck:foldOrder', 'modesHidden'];
const tracked = () => Object.keys(PREFS).filter((k) => (PREFS[k].box || EXTRA_PREFS.includes(k)) && visible(k));
const keyIds = () => [...new Set([...keyGroups().flatMap((g) => g.cards.flatMap(([, rows]) => rows.flatMap((r) => r[3] || []))), ...Object.keys(AGENT_NAME).filter(chatOn).flatMap((a) => [1, 2, 3, 4, 5].map((n) => `model.${a}.${n}`))])];
function changedTokens(): string[] {
  return [...tracked().filter(isChanged).map((k) => 'p:' + k), ...keyIds().filter(keyChanged).map((id) => 'k:' + id), ...Object.keys(LOOKS).filter((k) => LOOKS[k][1]()).map((k) => 'x:' + k)];
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
      else if (kind === 'k') id.split(',').forEach(resetKey);
      else LOOKS[id]?.[2]();
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
  railOn = !railOn;
  store.set('settings:rail', railOn);
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
    (cur.startsWith('keys/') ? `<div class="set-kmsg" aria-live="polite">${esc(keyNote())}</div>` : '');
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
  const top = el.scrollTop, ws = wordsOf(findQ), cur = sectionAt(store.get('settings:tab')), had = focusKey();
  finding = ws.length > 0 || cur === 'changed';
  seenUpdate();
  found.clear();
  findN.textContent = '';
  win.classList.toggle('no-rs', !changesOn());
  renderNav(cur, ws.length > 0);
  el.classList.toggle('set-all', finding);
  el.innerHTML = head(cur, ws) + (finding ? parts().map((p) => wrap(p, true)).join('') : wrap(parts().find((x) => x.id === cur)!, false));
  building = '';
  const slot = el.querySelector('.cc-prev-slot');
  if (slot) (slot.append(prev), paintPreview());
  for (const o of el.querySelectorAll('.set-of[data-tab-name]:not([data-tab-name=""])') as NodeListOf<HTMLElement>) for (const t of o.querySelectorAll<HTMLElement>('.set-grp > .bt')) t.dataset.tab = o.dataset.tabName;
  if (ws.length) applyFind(ws);
  else if (cur === 'changed') applyChanged();
  const rs = el.querySelector('[data-rs-sec]');
  if (rs) rs.style.visibility = el.querySelector('.sr-rs.on[data-rs]') ? '' : 'hidden';
  const rHtml = railHtml(el), hasRail = !!rHtml, showRail = hasRail && railOn;
  railBtn.hidden = !hasRail;
  railBtn.textContent = railOn ? 'Hide preview' : 'Show preview';
  railBtn.classList.toggle('on', railOn);
  rail.hidden = !showRail;
  swBody.classList.toggle('has-rail', showRail);
  rail.innerHTML = showRail ? rHtml : '';
  el.scrollTop = top;
  fitLooks(el);
  if (showRail) fitLooks(rail);
  if (had) (el.querySelector(had) as HTMLElement | null)?.focus({ preventScroll: true });
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
  if (pinClick(e.target as Element)) return e.stopPropagation();
  if (writerRowClick(e.target as Element)) return e.stopPropagation();
  const fixed = (e.target as Element).closest<HTMLElement>('.kb.fixed, [data-fixed]');
  if (fixed) return tell(fixed, fixed.matches('.kb') ? { title: 'This key is fixed', line: 'it does the same everywhere and cannot be changed', ms: 2500 } : { title: 'This one always shows', line: 'the editor button stays in the top bar', ms: 2500 });
  const b = (e.target as Element).closest('button');
  if (!b) return;
  const d = b.dataset, name = ccName();
  if (d.setTab) return openTab(d.setTab);
  if (d.setGo) return settingsAt(d.setGo);
  if (d.rs) return resetTokens([d.rs]);
  if ('rsSec' in d) return resetTokens([...el.querySelectorAll('.sr-rs.on[data-rs]')].map((x: HTMLElement) => x.dataset.rs!));
  if ('rsAll' in d) return resetTokens(changedTokens());
  if (d.adv) {
    openAdv.has(d.adv) ? openAdv.delete(d.adv) : openAdv.add(d.adv);
    return renderSettings();
  }
  if ('defaultApps' in d) return DESKTOP!.defaultApps();
  if ('ueLook' in d) return lookEngines(true);
  if ('ueAdd' in d) return addEngine();
  if ('ueIndex' in d) return lookIndex(true);
  if ('ueUht' in d) return runUht();
  if (d.ueRemove) return changeEngines({ remove: d.ueRemove });
  if ('dbgGet' in d) return downloadDebugger();
  if ('dbgRemove' in d) return removeDebugger();
  if ('welcomeOpen' in d) return openWelcome();
  if ('tourOpen' in d) return openTour();
  if (updateClick(d)) return;
  if (countClick(d)) return;
  if (licenseClick(d)) return;
  if ('trayOn' in d) return setTray({ on: !!d.trayOn });
  if ('trayLogin' in d) return setTray({ login: !!d.trayLogin });
  if ('forgetColorsReset' in d) {
    [1, 2, 3].forEach((n) => setForgetColor(n, ''));
    setSave("don't forget colors: the theme's");
    return renderSettings();
  }
  if ('forgetListOn' in d) {
    setForgetListOn(!!d.forgetListOn);
    setSave(`don't forget list: ${d.forgetListOn ? 'on' : 'off'}`);
    return renderSettings();
  }
  if (d.ecDel) {
    const m = extColors();
    delete m[d.ecDel];
    return saveExt(m, `extension colors: ${d.ecDel} removed`);
  }
  if ('ecBack' in d) return saveExt(null, 'extension colors: the defaults');
  if ('ecAdd' in d) {
    const x = cleanExt((await ask({ title: 'a color for an extension', text: 'The extension, like .md or cpp.', value: '.' })) || '');
    if (!x) return;
    const m = extColors();
    if (!m[x]) m[x] = '#d9e0d3';
    return saveExt(m, `extension colors: ${x} added`);
  }
  if (d.ctDel) {
    const t = colorTray(), [gone] = t.splice(+d.ctDel, 1);
    return saveTray(t, `color tray: ${gone.name} removed`);
  }
  if ('ctBack' in d) {
    const back = missingDefaults();
    return saveTray([...colorTray(), ...back], `color tray: ${back.map((c) => c.name).join(', ')} back`);
  }
  if (d.scAt) return pickColor(b);
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
  if ('scSame' in d || 'scReset' in d) {
    const k = b.closest<HTMLElement>('[data-sc-kind]')!.dataset.scKind!;
    'scSame' in d ? saveColors(k, { same: !setColors(k).same }) : (resetSetColors(k), page.paintSwitch());
    return renderSettings();
  }
  if (d.hideDir) return flipFolder(d.hideDir);
  if (d.setTheme) {
    useTheme(d.setTheme);
    return setSave(`theme: ${THEMES[themeName()].label}`);
  }
  if (d.setAccent != null || d.setStrength) return pickAccent(d.setStrength ? 'strength' : 'accent', d.setStrength ? Number(d.setStrength) : d.setAccent);
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
  if ('allExport' in d) return exportSettings().catch(showErr);
  if ('allImport' in d) return pickAll.click();
  if ('archChange' in d) return changeArchive();
  if ('archDefault' in d) return moveArchive('');
  if (d.accShare != null) {
    if (b.classList.contains('on')) return;
    return setShare(d.accShare, d.accTo!).then(() => ((accsAsked = false), renderSettings()), showErr);
  }
  if (d.tools) return setTools(d.tools as keyof Tools);
  if ('wtChange' in d) return changeWorktrees();
  if ('wtDefault' in d) return setWorktrees('');
  if (d.bnDefault) return saveBn(d.bnDefault, '');
  if ('browserSave' in d) {
    const v = el.querySelector('.set-browser')?.value.trim() || '';
    try {
      arch = { ...arch, ...(await api('PUT', '/api/settings', { browser: v })) };
      setSave(`open files in: ${v || 'msedge (default)'}`);
    } catch (e) { showErr(e); }
    return renderSettings();
  }
  if (d.mkPick) mkAgent = d.mkPick;
  else if (d.setFar) setSave(`far out: ${FAR_LOOKS[setFarLook(d.setFar)]}`);
  else if (d.setSolid) setSave(`look: ${SOLIDS[setSolid(d.setSolid)]}`);
  else if (d.setFont) setSave(`text font: ${FONTS[setLook('font', d.setFont).font].label}`);
  else if (d.setMono) setSave(`code font: ${MONOS[setLook('mono', d.setMono).mono].label}`);
  else if (d.setChat) setSave(`chat size: ${setLook('chat', Number(d.setChat)).chat} %`);
  else if (d.setBright) setSave(`brightness: ${setLook('bright', Number(d.setBright)).bright} %`);
  else if (d.setSize) setSave(`code size: ${setLook('size', Number(d.setSize)).size} px`);
  else if ('ccPreset' in d) {
    const label = CODE_PRESETS.find((p) => p.id === d.ccPreset)?.label;
    if (label == null) return;
    if (changedAny(name) && !(await ask({ title: 'code color set', text: `Use ${label} for ${THEMES[name].label}? The code colors you changed for this theme will be replaced.`, confirm: true }))) return;
    setCodePreset(name, d.ccPreset ?? '');
    setSave(`code colors: ${THEMES[name].label}: ${label}`);
  } else if (d.ccLang) ccLang = d.ccLang;
  else if (d.ccBold) setCodeRole(name, ccLang, d.ccBold, { bold: !codeRole(name, ccLang, d.ccBold).bold });
  else if (d.ccItalic) setCodeRole(name, ccLang, d.ccItalic, { italic: !codeRole(name, ccLang, d.ccItalic).italic });
  else if (d.ccReset) resetCode(name, ccLang, d.ccReset);
  else if ('ccResetall' in d) {
    if (!(await ask({ title: 'reset code colors', text: `Put ${THEMES[name].label}'s ${langLabel(ccLang)} colors back to ${ccLang === 'all' ? (codePresetOf(name) ? baseWords(name) : "the theme's own") : "all languages'"}?`, confirm: true }))) return;
    resetCode(name, ccLang);
  } else if ('ccExport' in d) {
    const lang = d.ccExport || null;
    download(`${name}-${lang || 'code'}.json`, exportCode(name, lang));
    return setSave(`exported ${THEMES[name].label}'s ${lang ? langLabel(lang) : 'code'} colors`);
  } else if ('ccImport' in d) return pick.click();
  else return;
  renderSettings();
});
function pickAccent(key: string, v: unknown) {
  setLook(key, v);
  useTheme(themeName());
  const l = lookOf();
  setSave(key === 'strength' ? `accent strength: ${l.strength} %` : `accent: ${Object.keys(ACCENTS).find((n) => ACCENTS[n as keyof typeof ACCENTS] === l.accent) || l.accent || "the theme's own"}`);
}
el.addEventListener('change', (e: Field) => {
  const ct = e.target.dataset;
  if (ct.setAccentPick != null) return pickAccent('accent', e.target.value.toLowerCase());
  if (ct.ecColor != null) return saveExt({ ...extColors(), [ct.ecColor]: e.target.value.toLowerCase() }, `extension colors: ${ct.ecColor} is ${e.target.value.toLowerCase()}`);
  if (ct.ecName != null) {
    const from = ct.ecName, to = cleanExt(e.target.value), m = extColors();
    if (!to || to === from) return renderSettings();
    if (m[to]) return (setSave(`${to} already has a color`), renderSettings());
    return saveExt(Object.fromEntries(Object.entries(m).map(([k, v]) => [k === from ? to : k, v])), `extension colors: ${from} is now ${to}`);
  }
  if (ct.ctAdd != null || ct.ctColor != null || ct.ctName != null) {
    const t = colorTray(), v = e.target.value, hex = v.toLowerCase(), at = (ct.ctColor ?? ct.ctName) as unknown as number;
    if (ct.ctName != null) return saveTray(t.with(+at, { ...t[at], name: v.trim().slice(0, 40) || t[at].hex }), `color tray: ${t[at].hex} named ${v.trim() || t[at].hex}`);
    if (t.some((c, i) => c.hex === hex && i !== +(at ?? -1))) return (setSave(`${hex} is already in the color tray`), renderSettings());
    if (ct.ctAdd != null) return saveTray([...t, { hex, name: hex }], `color tray: ${hex} added`);
    return saveTray(t.with(+at, { ...t[at], hex }), `color tray: ${t[at].name} is ${hex}`);
  }
  if (e.target.matches('[data-mark-name]')) {
    const names = pref('marks:names');
    names[(e.target.dataset.markName as unknown as number) - 1] = e.target.value.trim().slice(0, 40);
    setPref('marks:names', names);
    return renderSettings();
  }
  if (e.target.matches('[data-timer-steps]')) {
    setStepsText(e.target.value);
    setSave(`timer steps: ${stepsText()}`);
    return renderSettings();
  }
  if (ct.bn != null) return saveBn(ct.bn, e.target.value);
  if (e.target.matches('[data-hide]')) {
    hide.text = e.target.value;
    return saveHide(hideListOf());
  }
  if (e.target.matches('[data-forget-color]')) return setSave("don't forget colors");
  if (e.target.matches('[data-forget-list]')) {
    setForgetListText(e.target.value);
    setSave(`don't forget list at: ${forgetListText()}`);
    return renderSettings();
  }
  if (e.target.matches('select[data-pref-sel]')) {
    const k = e.target.dataset.pref!, e2 = PREFS[k];
    setPref(k, JSON.parse(e.target.value));
    return setSave(`${nameOf(e2)}: ${(e.target as unknown as HTMLSelectElement).selectedOptions[0].text}`);
  }
  if (e.target.matches('select[data-look]')) {
    const key = e.target.dataset.look!, n = Number(e.target.value);
    if (key === 'strength') return pickAccent('strength', n);
    setSave(`${LOOKS[key][0]}: ${setLook(key, n)[key as 'bright' | 'chat']} %`);
    return renderSettings();
  }
  const mk = e.target.closest<HTMLSelectElement>('[data-mk-key]');
  if (mk) {
    const i = +mk.dataset.mkKey!, agent = mk.dataset.mkAgent!;
    setModelKey(agent, i, mk.dataset.mkPart!, mk.value);
    return setSave(`${agent} ${keyOf(agent, i)}: ${[...mk.parentElement!.querySelectorAll('select')].map((s) => (s.value ? s.selectedOptions[0].text : '—')).join(' · ')}`);
  }
  if (e.target.matches('[data-cc-theme]')) {
    ccTheme = e.target.value;
    renderSettings();
  } else if (e.target.matches('[data-cc-color]')) renderSettings();
});
el.addEventListener('input', (e: Field) => {
  if (e.target.matches('[data-forget-color]')) {
    setForgetColor(+e.target.dataset.forgetColor!, e.target.value);
    el.querySelector('[data-forget-colors-reset]').style.visibility = '';
    return;
  }
  const c = e.target.closest<HTMLInputElement>('[data-cc-color]');
  if (!c) return;
  const name = ccName(), role = c.dataset.ccColor!;
  setCodeRole(name, ccLang, role, { color: c.value });
  const r = c.closest('.cc-role')!;
  r.querySelector('.cc-hex')!.textContent = c.value;
  const mine = Object.keys(codeChanged(name, ccLang, role)).length > 0;
  r.querySelector('.cc-dot')!.classList.toggle('off', !mine);
  r.querySelector<HTMLElement>('.cc-reset')!.style.visibility = mine ? '' : 'hidden';
  paintPreview();
});

document.addEventListener('keys-changed', () => el.offsetParent && renderSettings());
