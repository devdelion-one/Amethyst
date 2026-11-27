import { ask } from '../base/controls.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { codeView } from '../base/textbox.ts';
import { CODE_LANGS, CODE_PRESETS, CODE_ROLES, CODE_SIZES, codeChanged, codePresetColor, codePresetOf, codeRole, codeVars, exportCode, importCode, LOOK, lookOf, resetCode, setCodePreset, setCodeRole, setLook, themeName, THEMES } from '../base/theme.ts';
import { esc, setSave } from '../base/util.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const CODE_LEAD = 'The size of code, and the colours code shows in, for each theme and language.';

const SAMPLE: Record<string, { name: string; doc: string }> = {
  cpp: { name: 'sample.cpp', doc: '#include <string>\n#define MAX_HP 100\n\nnamespace game {\n// a player in the world\nclass Player : public Entity {\npublic:\n  static const int start = 3;\n  void hit(float damage) {\n    if (damage > 0) health -= damage;\n    name = "hurt\\n";\n  }\nprivate:\n  float health = MAX_HP;\n  std::string name;\n};\n}\n\nint main() {\n  auto p = new game::Player();\n  p->hit(2.5f);\n  return nullptr == p ? 1 : 0;\n}\n' },
  js: { name: 'sample.js', doc: "import { load } from './data.js';\n\n// a player in the world\nexport class Player extends Entity {\n  static start = 3;\n  constructor(name) {\n    super();\n    this.name = name ?? 'hero';\n    this.health = 100;\n  }\n  hit(damage) {\n    if (damage > 0) this.health -= damage;\n    return this.health <= 0 ? null : `${this.name} is hurt`;\n  }\n}\n\nconst p = new Player(await load('/me'));\np.hit(2.5);\n" },
};
const SET_WORDS: Record<string, string> = {
  '': "the app's colours at full strength.",
  quiet: 'soft lavender keywords and soft blue functions.',
  classic: 'muted orange keywords, gold functions and purple fields.',
  steel: 'blue keywords, teal types and pale yellow functions.',
};
const SWATCH_ROLES = ['keyword', 'function', 'string', 'number', 'macro'];

let ccTheme: string | null = null;
let ccLang = 'all';
const ccName = (): string => (THEMES[ccTheme as string] ? ccTheme! : themeName());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const themeLabel = (name: string) => cap(THEMES[name].label);
const langLabel = (l: string) => (l === 'all' ? 'all languages' : CODE_LANGS.find((x) => x.id === l)!.label);
const langOwn = (l: string) => (l === 'all' ? "all languages'" : `${langLabel(l)}'s`);
const changedAt = (name: string, l: string) => CODE_ROLES.some((r) => Object.keys(codeChanged(name, l, r.id)).length);
const changedAny = (name: string) => ['all', ...CODE_LANGS.map((l) => l.id)].some((l) => changedAt(name, l));
const presetOf = (id: string) => CODE_PRESETS.find((p) => p.id === id);
const baseWords = (name: string) => (codePresetOf(name) ? `the ${presetOf(codePresetOf(name))!.label} set` : "the theme's own");
const at = (id: string): At[] => [{ key: id, place: 'c-none', on: () => true }];
const redraw = () => page.renderSettings();

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
export function codeMount(root: HTMLElement) {
  const slot = root.querySelector('.cc-prev-slot');
  if (slot) (slot.append(prev), paintPreview());
}

const SIZE_STATE = (n: number) => `Code shows at ${n} px in files, terminals and code blocks.`;
const sizeRow = (): Row => ({
  id: 'c:size', key: 'c:size', plain: true, noPic: true,
  own: { label: 'Code size' },
  at: at('c:size'),
  pick: { get: () => String(lookOf().size), set: (v) => void setLook('size', Number(v)), def: String(LOOK.size), reset: '', choices: () => CODE_SIZES.map((n) => [String(n), `${n} px`, SIZE_STATE(n)]) },
  reset: () => void setLook('size', LOOK.size), changed: () => lookOf().size !== LOOK.size,
});

async function choose(id: string) {
  const name = ccName(), p = presetOf(id);
  if (!p) return;
  if (changedAny(name) && !(await ask({ title: 'Code colour set', text: `Use the ${p.label} set for ${themeLabel(name)}? It replaces the colours you changed for this theme.`, confirm: true }))) return;
  setCodePreset(name, id);
  setSave(`Code colour set: ${p.label} for ${themeLabel(name)}`);
  redraw();
}
const setChips = (name: string) => `<span class="seg hr-seg">${CODE_PRESETS.map((p) => {
  const on = codePresetOf(name) === p.id;
  return `<button class="chip${on ? ' on' : ''}" data-cc-preset="${esc(p.id)}" aria-pressed="${on}" title="${esc(`${p.label}\n${cap(SET_WORDS[p.id] || p.note)}${changedAny(name) ? '\nIt replaces the colours you changed for this theme.' : ''}`)}"><span class="tsw">${SWATCH_ROLES.map((r) => `<i style="background:${codePresetColor(name, p.id, r)}"></i>`).join('')}</span>${esc(p.label)}</button>`;
}).join('')}</span>`;
const setRow = (): Row => ({
  id: 'c:set', key: 'c:set', sw: 'none', plain: true, noPic: true,
  own: { label: 'Code colour set', desc: 'A whole set of code colours for the theme you picked.', find: CODE_PRESETS.map((p) => p.label).join(' ') },
  at: at('c:set'),
  state: () => {
    const name = ccName(), id = codePresetOf(name);
    return `${themeLabel(name)} uses the ${presetOf(id)!.label} set: ${SET_WORDS[id] || presetOf(id)!.note}`;
  },
  note: () => 'Picking one replaces the colours you changed.',
  ctl: () => setChips(ccName()),
  reset: () => void choose(''), changed: () => codePresetOf(ccName()) !== '',
});
const rolesRow = (): Row => ({
  id: 'c:roles', key: 'c:roles', sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: 'Colour of each part of the code', desc: 'Click a colour to change it. B makes that part bold and I makes it italic. Reset puts back the colour it had before you changed it.', find: CODE_ROLES.map((r) => r.label).join(' ') },
  at: at('c:roles'),
  state: () => 'Each part of the code shows in the colour beside it. A dot marks one you changed.',
});
const btnRow = (id: string, label: string, state: string, note: string, btns: () => string, desc = ''): Row => ({
  id, key: id, sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label, desc: desc || note }, at: at(id), state: () => state, note: () => note, ctl: btns,
});
const saveRow = () => btnRow('c:save', 'Save these colours to a file', 'Saves the colours of the language you picked, or of the whole theme.', 'Nothing changes in the app.', () => {
  const name = ccName(), l = langLabel(ccLang);
  return `<button class="chip" data-cc-export="${ccLang}" title="${esc(`Save this language\nSaves ${themeLabel(name)}'s colours for ${l} to a file.`)}">Save this language</button>` +
    `<button class="chip" data-cc-export="" title="${esc(`Save the whole theme\nSaves every code colour of ${themeLabel(name)} to a file.`)}">Save the whole theme</button>`;
});
const loadRow = () => btnRow('c:load', 'Load colours from a file', 'Reads a file of code colours into the theme you picked.', 'Only the colours in the file change.', () => `<button class="chip" data-cc-import title="${esc(`Load a file\nReads a file of code colours into ${themeLabel(ccName())}.`)}">Load a file</button>`);
const backRow = () => {
  const name = ccName(), mine = changedAt(name, ccLang);
  return btnRow('c:back', `Put back ${langOwn(ccLang)} colours`, 'Puts the colours you changed for this language back as they were. It asks first.', 'Other languages and other themes stay as they are.', () => `<button class="chip" data-cc-resetall${mine ? '' : ' aria-disabled="true"'} title="${esc(mine ? `Put them back\n${themeLabel(name)}'s colours for ${langLabel(ccLang)} go back to ${ccLang === 'all' ? baseWords(name) : "all languages'"}.` : `Nothing to put back\nYou haven't changed ${langOwn(ccLang)} colours for ${themeLabel(name)}.`)}">Put them back</button>`);
};

function roleHtml(name: string, r: (typeof CODE_ROLES)[number]) {
  const v = codeRole(name, ccLang, r.id), mine = Object.keys(codeChanged(name, ccLang, r.id)).length > 0;
  return `<div class="cc-role" data-role="${r.id}">
    <span class="cc-name"><i class="cc-dot ${mine ? '' : 'off'}"${mine ? ' title="Changed&#10;You changed this colour here. Reset brings back the one before."' : ''}></i>${esc(r.label)}<span class="cc-eg">${esc(r.eg)}</span></span>
    <input type="color" value="${v.color}" data-cc-color="${r.id}" aria-label="${esc(r.label)} colour" title="${esc(`${r.label}\nClick to change its colour.`)}">
    <code class="cc-hex">${v.color}</code>
    <button class="cc-bi ${v.bold ? 'on' : ''}" data-cc-bold="${r.id}" title="Bold&#10;Shows this part of the code in bold." aria-pressed="${v.bold}"><b>B</b></button>
    <button class="cc-bi ${v.italic ? 'on' : ''}" data-cc-italic="${r.id}" title="Italic&#10;Shows this part of the code in italic." aria-pressed="${v.italic}"><i>I</i></button>
    <button class="quiet cc-reset" data-cc-reset="${r.id}" title="${esc(`Reset\nBack to ${ccLang === 'all' ? baseWords(name) : "all languages'"} colour.`)}" ${mine ? '' : 'style="visibility:hidden"'}>reset</button>
  </div>`;
}
function forHtml(name: string) {
  const themes = Object.entries(THEMES).map(([k, t]) => `<option value="${k}" ${k === name ? 'selected' : ''}>${esc(cap(t.label))}${k === themeName() ? ' (in use)' : ''}</option>`).join('');
  const langs = ['all', ...CODE_LANGS.map((l) => l.id)].map((l) => {
    const on = l === ccLang, mine = changedAt(name, l);
    return `<button class="chip${on ? ' on' : ''}" data-cc-lang="${l}" aria-pressed="${on}" title="${esc(`${cap(langLabel(l))}\n${l === 'all' ? 'Change the colours every language starts from.' : `Change ${langLabel(l)} only, on top of all languages' colours.`}${mine ? '\nYou changed some of its colours.' : ''}`)}">${esc(cap(langLabel(l)))}<i class="cc-dot ${mine ? '' : 'off'}"></i></button>`;
  }).join('');
  const themeState = name === themeName() ? `You're changing ${themeLabel(name)}'s code colours. It's the theme in use.` : "You're changing the code colours of the theme you picked. It isn't the one in use.";
  const langState = ccLang === 'all' ? "You're changing the colours of all languages." : `You're changing ${langLabel(ccLang)} only. It starts from all languages' colours.`;
  return `<div class="cc-for"><span class="cc-for-l">Colours for:</span><select data-cc-theme title="Theme&#10;The theme whose code colours you change." aria-label="Colours for theme">${themes}</select><span class="seg">${langs}</span></div>` +
    `<div class="cc-help" data-cc-now>${esc(themeState)} ${esc(langState)}</div>` +
    `<div class="cc-help q">Each theme has its own code colours. Every language starts from all languages' colours and keeps only what you change for it. A dot marks a language with its own changes. Languages not listed here use all languages' colours.</div>`;
}

const allRows = (): Row[] => [sizeRow(), setRow(), rolesRow(), saveRow(), loadRow(), backRow()];
addPart({ rows: allRows, sel: () => '', look: () => '', example: () => '', home: 'code' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function codeHtml() {
  const name = ccName();
  return box('ctext', 'Code text', rows([sizeRow()]), 'Code in files, terminals and code blocks in chats.') +
    box('ccolors', 'Code colours',
      forHtml(name) + rows([setRow(), rolesRow()]) +
      `<div class="cc-body"><div class="cc-roles">${CODE_ROLES.map((r) => roleHtml(name, r)).join('')}</div><div class="cc-prev-slot"></div></div>` +
      rows([saveRow(), loadRow(), backRow()]),
      'The colours code shows in, in files and the editor. The sample beside the colours shows them as they are.');
}

const file = document.createElement('input');
file.type = 'file';
file.accept = '.json,application/json';
file.addEventListener('change', async () => {
  const f = file.files![0];
  file.value = '';
  if (!f) return;
  const name = ccName();
  try {
    const changed = importCode(name, await f.text());
    const what = Object.entries(changed).filter(([, c]) => c).map(([l]) => langLabel(l));
    setSave(what.length ? `Loaded into ${themeLabel(name)}: ${what.join(', ')}` : `Nothing new in ${f.name}`);
  } catch (e) {
    setSave(`${f.name} can't be read: ${(e as Error).message}. Nothing changed.`, true);
  }
  redraw();
});
function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function putBack(b: HTMLElement) {
  const name = ccName();
  if (!changedAt(name, ccLang)) return tell(b, { title: 'Nothing to put back', line: `You haven't changed ${langOwn(ccLang)} colours for ${themeLabel(name)}.`, ms: 2500 });
  if (!(await ask({ title: 'Put back the colours', text: `Put ${themeLabel(name)}'s colours for ${langLabel(ccLang)} back to ${ccLang === 'all' ? baseWords(name) : "all languages'"}?`, confirm: true }))) return;
  resetCode(name, ccLang);
  setSave(`Put back ${themeLabel(name)}'s colours for ${langLabel(ccLang)}`);
  redraw();
}

export function codeClick(t: Element): boolean {
  const b = t.closest<HTMLElement>('[data-cc-preset], [data-cc-lang], [data-cc-bold], [data-cc-italic], [data-cc-reset], [data-cc-resetall], [data-cc-export], [data-cc-import]');
  if (!b) return false;
  const d = b.dataset, name = ccName();
  if (d.ccPreset != null) return void choose(d.ccPreset), true;
  if (d.ccResetall != null) return void putBack(b), true;
  if (d.ccImport != null) return file.click(), true;
  if (d.ccExport != null) {
    const lang = d.ccExport || null;
    download(`${name}-${lang || 'code'}.json`, exportCode(name, lang));
    setSave(`Saved ${themeLabel(name)}'s ${lang ? `colours for ${langLabel(lang)}` : 'code colours'} to a file`);
    return true;
  }
  if (d.ccLang) ccLang = d.ccLang;
  else if (d.ccBold) setCodeRole(name, ccLang, d.ccBold, { bold: !codeRole(name, ccLang, d.ccBold).bold });
  else if (d.ccItalic) setCodeRole(name, ccLang, d.ccItalic, { italic: !codeRole(name, ccLang, d.ccItalic).italic });
  else if (d.ccReset) resetCode(name, ccLang, d.ccReset);
  redraw();
  return true;
}

export function codeInit(root: HTMLElement) {
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches('[data-cc-theme]')) {
      ccTheme = t.value;
      redraw();
    } else if (t.matches('[data-cc-color]')) redraw();
  });
  root.addEventListener('input', (e: Event) => {
    const c = (e.target as Element).closest<HTMLInputElement>('[data-cc-color]');
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
}
