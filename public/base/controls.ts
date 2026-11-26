import { bound, onTwice, show } from './binds.ts';
import { CAPTURE_NOTE, keyText, pressKey, pressTwice } from './keycap.ts';
import { tipCard } from './tipcard.ts';
import type { TipKey } from './tipcard.ts';
import { icon } from './icon.ts';
import { dirIcon, fileIcon, fileTint, nameHtml } from './filelook.ts';
import { onOutside, raise } from './lift.ts';
import { DEFAULT, gem, GLYPH, modeGem, NAME, workGem } from './kinds.ts';
import { tell } from './notify.ts';
import { atWs, dirGem, hexOr, inboxLoc, inboxTint, levelKey, matches, S, styleMark, tintOf, within } from './model.ts';
import { page } from './page.ts';
import { BAR_LAST, BAR_ORDER, BAR_SHARE, BTN_OF, chatOn, isOff, MENUS, onPref, peek, pref, PREFS, saved, savedOff, setAt, setOff, setPref } from './prefs.ts';
import { onPrefUndo, prefStep } from './prefundo.ts';
import { col, COLORS } from './theme.ts';
import { $, agentsOf, esc, parentOf, setSave, store, track } from './util.ts';
import type { Pref } from './prefs.ts';
import type { Folder, Note } from './types.ts';

type Swatch = { hex: string; name: string };
type HideOpts = { name?: string; ic?: string; only?: (key: string) => boolean; items?: string[][]; fixed?: string[]; acts?: string; opts?: string; pick?: [string, string] | [string, string][]; other?: string; onPick?: (b: HTMLElement) => unknown; up?: boolean; again?: boolean; from?: Element | null; place?: string; seq?: string[]; move?: (keys: string[]) => unknown; remake?: () => HideOpts };
type BarOpts = HideOpts & { skip?: string; make?: (el: HTMLElement, e: MouseEvent) => HideOpts; open?: (el: HTMLElement, e: MouseEvent) => unknown; order?: string | false; flat?: boolean; at?: (el: HTMLElement) => string };
type BtnMenu = { sel: string; name: string; icon?: () => string; rows: (el: HTMLElement) => string; opts?: (el: HTMLElement) => string; band?: (el: HTMLElement) => [string, string] | undefined; pick: (b: HTMLElement, el: HTMLElement) => unknown };
type BarMenu = string | ((el: HTMLElement, e: MouseEvent) => string | null | undefined);
type Rect = { x: number; y: number; w: number; h: number };
type AskCheck = { id: string; name: string; group?: string; on?: boolean; busy?: string; mark?: string };
interface AskOpts {
  title: string;
  text?: string;
  warn?: string;
  safe?: string;
  value?: string;
  placeholder?: string;
  confirm?: boolean;
  choices?: { label: unknown; value: unknown; main?: boolean }[] | null;
  pick?: [number, number] | null;
  tick?: string | null;
  tick2?: string | null;
  label?: string;
  about?: string;
  folder?: { follow(name: string): string; note?(path: string): string; about?: string; pick?: ((path: string) => Promise<string | null | undefined>) | null } | null;
  blank?: boolean;
  list?: { kind: string; names: string[] }[] | null;
  checks?: { items: AskCheck[]; label: string; rows?: boolean; open?: boolean } | null;
  ticks?: { items: { id: string; html: string; off?: boolean }[]; say?: (n: number, all: number, ticked: string[]) => string; change?: (id: string, on: boolean, tick: (id: string, on: boolean) => void) => void } | null;
  menu?: { label: string; open: (btn: HTMLElement, pick: (v: unknown) => void, ticked: string[]) => void } | null;
  end?: { label: string; value: unknown } | null;
  main?: { label: string; value: unknown } | null;
}

export const MARK_NOS = [1, 2, 3, 4, 5, 6];
export const markName = (n: number): string => pref('marks:names')[n - 1]?.trim() || `mark ${n}`;
export const markBadge = (n: number | undefined): string => (n && MARK_NOS.includes(n) ? `<i class="fs-mk m${n}">${ICONS['mark' + n]}</i>` : '');
export const agentsOn = (rel: string): string[] => (pref('agentMarks') ? agentsOf(rel).filter(chatOn) : []);
const AGENT_WORD: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' };
export const agentWords = (ags: string[]): string => ags.map((a) => AGENT_WORD[a]).join(' and ');
export const agentTag = (a: string): string => `<span class="ag-mk" data-ag="${a}" title="Read by ${AGENT_WORD[a]}&#10;A file ${AGENT_WORD[a]} reads for its instructions, skills or settings.">${AGENT_WORD[a]}</span>`;
export const agentMark = (rel: string): string => agentsOn(rel).map(agentTag).join('');
export const colorTray = (): Swatch[] => {
  const t = store.get('colors:tray', null);
  return Array.isArray(t) ? t.filter((c: Swatch) => /^#[0-9a-f]{6}$/i.test(c?.hex)) : COLORS.map((c) => ({ ...c }));
};
export function setColorTray(list: { hex: string; name?: string }[]) {
  const seen = new Set<string>();
  store.set('colors:tray', list.map((c) => ({ hex: c.hex.toLowerCase(), name: String(c.name ?? '').trim() || c.hex.toLowerCase() })).filter((c) => !seen.has(c.hex) && seen.add(c.hex)));
}
const tray = colorTray;
export const SW_ADD = '<button class="sw-add" data-sw-add title="Add or change colors&#10;Opens the color tray in Settings, where you add, change or remove the colors of every color menu." aria-label="add or change colors">+</button>';
const trayAdd = () => (pref('colors:add') ? SW_ADD : '');
function toColorTray() {
  store.set('settings:tab', 'look');
  page.openSettings?.();
  setTimeout(() => document.querySelector('#settings [data-ct-box]')?.scrollIntoView({ block: 'start' }));
}
export const swatches = (on: unknown, attr: string): string => tray().map((c) => `<button class="sw ${c.hex === on ? 'on' : ''}" data-${attr}="${c.hex}" aria-label="${esc(c.name)}" style="--c:${col(c.hex)}"></button>`).join('') + trayAdd();
function toSetColors() {
  store.set('settings:tab', 'look');
  page.openSettings?.();
  setTimeout(() => {
    const g = document.querySelector('#settings [data-sc-kind]')?.closest<HTMLElement>('.set-grp');
    g?.scrollIntoView({ block: 'start' });
    g?.classList.add('flash');
    setTimeout(() => g?.classList.remove('flash'), 1600);
  });
}
export const trayName = (hex: string): string => tray().find((c) => c.hex === hex)?.name || hex;
export type ColorPick = { k: string; label: string; tip: string; chip: string; now: string; title?: string; attr: string; cls: string; dfltCls: string; dfltTip: string; dfltStyle: string; style: (hex: string) => string; icon: string; name?: (c: Swatch) => string; foot?: string; line?: boolean; ic?: string; grid?: string };
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export function colorRow(o: ColorPick, own: string | null | undefined, fly: string): string {
  const cell = (cls: string, on: boolean, v: string, tip: string, style: string) => `<button class="${cls}${on ? ' on' : ''}" data-${o.attr}="${esc(v)}" aria-label="${esc(tip)}"${style ? ` style="${esc(style)}"` : ''}>${o.icon}</button>`;
  const grid = o.grid ?? cell(`${o.dfltCls} dft`, !own, '', o.dfltTip, o.dfltStyle) + tray().map((c) => cell(o.cls, c.hex === own, c.hex, o.name ? o.name(c) : c.name, o.style(c.hex))).join('') + trayAdd();
  const open = fly === o.k, pop = `<div class="pk-fly"><div class="mh pk-h"><span class="mh-n">${esc(o.label)}</span></div><div class="pk-grid">${grid}</div>${o.foot || ''}</div>`;
  const tip = `${cap(o.label)}&#10;${esc(cap(o.tip))}${/[.!?]$/.test(o.tip) ? '' : '.'}`;
  return `<div class="pk-row"><button class="mi pk pk-line${open ? ' open' : ''}" data-fly="${o.k}" title="${tip}"><i class="tb-ic">${o.ic ?? ICONS.drop}</i><span class="mi-n">${esc(o.label)}</span><span class="pk-cur" title="${esc(o.now)}">${o.chip}</span><span class="pk-ar">›</span></button>${open ? pop : ''}</div>`;
}
export function setSwatches(icon: string, own: string | null | undefined, mark: string | null | undefined, base: string, place: string, fly = ''): string {
  const tint = (c: string) => (c ? ` style="--ly-c:${esc(c)}"` : '');
  const cfg = `<div class="sep"></div><button class="mi pk-cfg" data-pkcfg title="Place colors&#10;The colors sets get by their place. Opens them in Settings.">${ICONS.settings}place colors…</button>`;
  return colorRow({ k: 'col', label: 'color', tip: "the icon's color", chip: `<i class="pk-ic sw-ic"${tint(base)}>${icon}</i>`, now: own ? trayName(own) : 'by place', attr: 'sc', cls: 'sw-ic', dfltCls: 'sw-ic', dfltTip: 'By place: the color its place gives. The default.', dfltStyle: place ? `--ly-c:${place}` : '', style: (h) => `--ly-c:${col(h)}`, icon, foot: cfg }, own, fly) +
    colorRow({ k: 'mk', label: 'mark', tip: 'a bookmark on the button', ic: ICONS.mark2, chip: mark ? `<i class="pk-ic sw-mk mk" style="--mk:${col(mark)}">${icon}</i>` : '<i class="pk-ic"><i class="pk-none"></i></i>', now: mark ? trayName(mark) : 'none', attr: 'smk', cls: 'sw-mk mk', dfltCls: 'sw-mk', dfltTip: 'None: no bookmark. The default.', dfltStyle: '', style: (h) => `--mk:${col(h)}`, icon, name: (c) => `${c.name} mark` }, mark, fly);
}
export const flyFocus = () => ($('#colormenu .pk-fly .pk-grid .on') || $('#colormenu .pk-fly .pk-grid button')) as HTMLElement | null;

export const ICONS: Record<string, string> = {
  note: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h6l3 3v8h-9z M6 8h4 M6 10.5h4"/></svg>',
  mark0: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" stroke-dasharray="2 2.4"/></svg>',
  mark1: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2.8 5l10.4 6M13.2 5 2.8 11"/></svg>',
  mark2: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 14V2.5M4 3h8l-2 3 2 3H4"/></svg>',
  mark3: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h7v11L8 10.5l-3.5 3z"/></svg>',
  mark4: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5"/></svg>',
  mark5: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14 8 8 14 2 8z"/></svg>',
  mark6: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="m8 2 1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4l-3.7 2.1.8-4.2L2 6.4l4.2-.5z"/></svg>',
  foldAll: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l3 3 3-3M5 13l3-3 3 3"/></svg>',
  unfoldAll: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6l3-3 3 3M5 10l3 3 3-3"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5h4l-.5 4 2.5 2.5h-8l2.5-2.5zM8 9v4.5"/></svg>',
  history: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 8a5.4 5.4 0 1 0 1.8-4M2.6 2.8v2.6h2.6M8 5.2V8l2 1.4"/></svg>',
  archive: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.4 3.4h11.2v3H2.4zM3.4 6.4v6.4h9.2V6.4M6.4 9h3.2"/></svg>',
  bell: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 11V7a4 4 0 0 1 8 0v4l1.2 1.5H2.8zM6.5 14h3"/></svg>',
  check: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"/></svg>',
  bin: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/></svg>',
  moon: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.5 10.2A5.2 5.2 0 0 1 5.8 3.5a5.2 5.2 0 1 0 6.7 6.7z"/></svg>',
  bench: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5h11M2.5 8.5h11M3.5 5v7.5M12.5 5v7.5"/></svg>',
  explorer: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="6" height="4.5" rx="1"/><rect x="10" y="9" width="7.5" height="3.5" rx="1"/><rect x="10" y="14.5" width="7.5" height="3.5" rx="1"/><path d="M5.5 7.5v9.25H10M5.5 10.75H10"/></svg>',
  search: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5"/><path d="m12.3 12.3 4.7 4.7"/></svg>',
  editor: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/><path d="M2.5 7h15M7 7v9.5"/></svg>',
  projects: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>',
  workspaces: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14 5 8 8 2 5Z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/></svg>',
  site: '<i class="ic site-ic" aria-hidden="true"></i>',
  git: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="6" cy="4.5" r="2"/><circle cx="6" cy="15.5" r="2"/><circle cx="14" cy="6.5" r="2"/><path d="M6 6.5v7M14 8.5c0 3.5-8 2.5-8 5"/></svg>',
  pr: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="5.5" cy="4.5" r="2"/><circle cx="5.5" cy="15.5" r="2"/><circle cx="14.5" cy="15.5" r="2"/><path d="M5.5 6.5v7M14.5 13.5V8.5a3 3 0 0 0-3-3H9M11 3.5l-2 2 2 2"/></svg>',
  setup: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M10 6.2l1.1 2.7 2.7 1.1-2.7 1.1-1.1 2.7-1.1-2.7-2.7-1.1 2.7-1.1z"/></svg>',
  settings: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.72 4.88L7.98 2.47A7.8 7.8 0 0 1 12.02 2.47L12.28 4.88A5.6 5.6 0 0 1 13.29 5.47L15.52 4.48A7.8 7.8 0 0 1 17.53 7.98L15.57 9.41A5.6 5.6 0 0 1 15.57 10.59L17.53 12.02A7.8 7.8 0 0 1 15.52 15.52L13.29 14.53A5.6 5.6 0 0 1 12.28 15.12L12.02 17.53A7.8 7.8 0 0 1 7.98 17.53L7.72 15.12A5.6 5.6 0 0 1 6.71 14.53L4.48 15.52A7.8 7.8 0 0 1 2.47 12.02L4.43 10.59A5.6 5.6 0 0 1 4.43 9.41L2.47 7.98A7.8 7.8 0 0 1 4.48 4.48L6.71 5.47A5.6 5.6 0 0 1 7.72 4.88Z"/><circle cx="10" cy="10" r="2.4"/></svg>',
  usage: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 14.5a7.5 7.5 0 1 1 13 0"/><path d="m10 11.5 3.5-4"/><circle cx="10" cy="11.5" r="1.25"/></svg>',
  ring: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" opacity=".35"/><path d="M8 2.5A5.5 5.5 0 1 1 2.5 8"/></svg>',
  chev: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4"/></svg>',
  chevDown: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>',
  bug: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="6" width="7" height="10.5" rx="3.5"/><path d="M8 6.5a2 2 0 0 1 4 0M10 9.5v7M3.5 9.5l3 1M16.5 9.5l-3 1M3.5 13.5h3M16.5 13.5h-3M4.5 17l2.5-2M15.5 17 13 15M8 3.5l1 1.5M12 3.5l-1 1.5"/></svg>',
  follow: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="8.5" y="2.5" width="6" height="11" rx="1.3"/><path d="M1.5 8h8.5M7.5 5.5 10 8l-2.5 2.5"/></svg>',
  window: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="6.5" width="10.5" height="9" rx="1.5"/><path d="M6.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 17.5 5v6.5A1.5 1.5 0 0 1 16 13h-3"/></svg>',
  info: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5M10 6.2v.1"/></svg>',
  wmin: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 5.5h10"/></svg>',
  wx: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M0 0l10 10M10 0L0 10"/></svg>',
  wplus: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0v10M0 5h10"/></svg>',
  ueClass: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 4.2A4 4 0 1 0 8.5 11.8M11.8 6v4M9.8 8h4"/></svg>',
  ueModule: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="4.3" rx="1"/><rect x="2.5" y="9.2" width="11" height="4.3" rx="1"/><path d="M5 4.65h1.5M5 11.35h1.5"/></svg>',
  uePlugin: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v3M10 2v3M4 5h8v2.5a4 4 0 0 1-8 0zM8 11.5V14"/></svg>',
  help: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M7.7 7.9a2.4 2.4 0 1 1 3.4 2.2c-.7.35-1.1.9-1.1 1.6v.5"/><circle cx="10" cy="14.6" r=".45"/></svg>',
  clip: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="3" width="9.6" height="11" rx="1.2"/><path d="M6 3V2h4v1M5.8 7h4.4M5.8 9.6h3"/></svg>',
  newFile: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M9 2.5H4.5v11h7V5zM9 2.5V5h2.5M8 7.5v4M6 9.5h4"/></svg>',
  newAny: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M8 5.2v5.6M5.2 8h5.6"/></svg>',
  newBoard: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6.5h11M6.5 6.5v7"/></svg>',
  newFolder: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5v8h12V6H8L6.5 4.5zM8 8v3M6.5 9.5h3"/></svg>',
  tab: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 13.5h13M3 13.5v-8h5v-2h5.5v10"/></svg>',
  quick: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3" width="13" height="10.5" rx="1.5" stroke-dasharray="2 1.6" opacity=".55"/><rect x="6" y="6" width="7.5" height="6" rx="1"/><path d="M6 7.8h7.5"/></svg>',
  newWin: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="5.5" width="9" height="8" rx="1.3"/><path d="M5 5.5V4a1.3 1.3 0 0 1 1.3-1.3h6.9A1.3 1.3 0 0 1 14.5 4v5.6a1.3 1.3 0 0 1-1.3 1.3h-2.7"/></svg>',
  group: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M8 2.5v11M10 8h2.6M11.3 6.7v2.6"/></svg>',
  outBrowser: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="9" r="5"/><path d="M2 9h10M7 4c-1.6 1.6-1.6 8.4 0 10M7 4c1.6 1.6 1.6 8.4 0 10M10 2h4v4M14 2l-4 4"/></svg>',
  page: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-2 10 0 12M8 2c2 2 2 10 0 12"/></svg>',
  toChat: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11V11H7l-3 2.5V11H2.5zM8 5.5v3.6M6.2 7.3h3.6"/></svg>',
  drop: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2c2.4 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1.6-4 4-7z"/></svg>',
  rename: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.8l2.7 2.7L6 12.7l-3.3.6.6-3.3zM9.3 4L12 6.7"/></svg>',
  copy: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.3"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>',
  unlist: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11M2.5 8h11M2.5 12h5M10 12h4"/></svg>',
  reveal: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5v8h12V6H8L6.5 4.5zM9 8.5l2 2M11 8.5v2H9"/></svg>',
  blank: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"></svg>',
  dock: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v9h-11zM2.5 10h11M5 11.25h1M7.5 11.25h1M10 11.25h1"/></svg>',
  topBar: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v9h-11zM2.5 6h11M4.75 4.75h1M7.25 4.75h1M9.75 4.75h1"/></svg>',
  modes: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 5.5h3.5v5h-3.5zM6.25 5.5h3.5v5h-3.5zM11 5.5h3.5v5h-3.5z"/></svg>',
  create: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg>',
  strip: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11zM6.5 2.5v11M3.75 5h1.5M3.75 7.5h1.5M3.75 10h1.5"/></svg>',
  fmtBar: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 2.5h13v6h-13zM4.5 4.5v2M7 4.5v2M9.5 4.5v2M12 4.5v2M3 12.5h10"/></svg>',
  sepAdd: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v11M3.5 8h1.5M11 8h1.5"/></svg>',
  dash: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5"/></svg>',
  bars: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 5.5h10M3 10.5h6"/></svg>',
  reset: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3"/></svg>',
  update: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10"/></svg>',
  splitRow: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M8 2.5v11"/></svg>',
  splitCol: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M1.5 8h13"/></svg>',
  x: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  at: '<b class="tb-tx">@</b>',
  bang: '<b class="tb-tx">!</b>',
  header: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v9h-11zM2.5 6.5h11"/></svg>',
  rail: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v9h-11zM9.5 3.5v9M11 6h1M11 8h1M11 10h1"/></svg>',
  guides: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11M8 5.5v8M5.5 5.5h6M9.5 9h4M9.5 12.5h4"/></svg>',
  tag: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h5l6 6-5 5-6-6zM5.25 5.25h.5"/></svg>',
  person: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8a2.5 2.5 0 1 0 0-5a2.5 2.5 0 1 0 0 5zM3 13.5c.5-2.5 2.5-3.5 5-3.5s4.5 1 5 3.5"/></svg>',
  undo: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8h-2"/></svg>',
  defLayout: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h4v4H3zM9.5 8.5h4v4h-4zM7 5.5h2.5v3"/></svg>',
  fit: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg>',
  center: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"/></svg>',
  editsList: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h7M2.5 7.5h7M2.5 11.5h4M12 2v4M10 4h4M10 11h4"/></svg>',
  review: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v6M5 5.5h6M5 12.5h6"/></svg>',
  keepAll: '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.5 3.2 3L13 4.5"/></svg>',
  usageRing: '<span class="ch-usage tb-ring"><span class="ch-ring" style="--ch-p:65"></span></span>',
};

const folder = (loc: string) => S.dirs.get(loc)?.kind === 'folder';
const pkey = (loc: string) => levelKey() + '|' + loc;
export const isOpen = (loc: string): boolean => !!S.query || (folder(loc) ? S.expanded.has(pkey(loc)) : !S.collapsed.has(loc));
export function setOpen(loc: string, open: boolean) {
  if (folder(loc)) open ? S.expanded.add(pkey(loc)) : S.expanded.delete(pkey(loc));
  else open ? S.collapsed.delete(loc) : S.collapsed.add(loc);
  store.set('collapsed', [...S.collapsed]);
  store.set('expanded', [...S.expanded]);
}
export function pick(path: string | null) {
  S.picked = path;
}
let anchor: string | null = null;
export function mark(key: string | null, how: string): boolean {
  if (how === 'clear' || how === 'one') {
    S.marked = new Set(how === 'one' ? [key!] : []);
    anchor = how === 'one' ? key : null;
    return true;
  }
  if (!S.marked.size && S.picked) S.marked = new Set([S.picked]);
  if (how === 'toggle') {
    if (S.marked.has(key!)) S.marked.delete(key!);
    else S.marked.add(key!);
    anchor = key;
    return true;
  }
  const a = S.thoughts.get(anchor as string), t = S.thoughts.get(key!);
  if (!a || !t || a.dir !== t.dir) return false;
  const rows = (S.dirs.get(a.dir)?.thoughts ?? []).filter(matches).map((t) => t.path);
  const i = rows.indexOf(anchor as string), j = rows.indexOf(key!);
  if (i < 0 || j < 0) return false;
  S.marked = new Set(rows.slice(Math.min(i, j), Math.max(i, j) + 1));
  return true;
}
const marked = (key: string) => S.marked.size > 1 && S.marked.has(key);
export function dragKeys(key: string): string[] {
  const keys = S.marked.size > 1 && S.marked.has(key) ? [...S.marked] : [key];
  const parent = (k: string) => S.thoughts.get(k)?.dir ?? S.dirs.get(k)?.parent;
  return keys.filter((k) => !keys.some((f) => f !== k && S.dirs.has(f) && parent(k) != null && within(parent(k)!, f)));
}
const foldButton = (loc: string, has: unknown) => (has ? `<b class="tg ${isOpen(loc) ? 'open' : ''}" data-toggle="${esc(loc)}" aria-label="${isOpen(loc) ? 'fold' : 'unfold'}"></b>` : '<b class="tg"></b>');
const hid = (name: unknown) => (String(name).startsWith('.') ? 'hid' : '');
const ROW_CLS: Record<string, string> = { inbox: 'inbox-ti', folder: 'tf' };

export const inboxGo = (): string => `<button class="ib-go" data-gotoinbox tabindex="-1" title="Inbox\nShows the files in the inbox." aria-label="show the inbox">${gem('inbox')}</button>`;
export type TreeRow = { key: string; depth: number; html: () => string };

function fileRow(t: Note, depth: number, lit: string | null | undefined): string {
  const drag = `data-th="${esc(t.path)}" draggable="true" data-drag="file:${esc(t.path)}"`;
  return `<div class="ti tt ${hid(t.title)} ${S.open?.path === t.path || lit === t.path ? 'on' : ''} ${(S.marked.size > 1 ? marked(t.path) : S.picked === t.path) ? 'sel' : ''}" data-open="${esc(t.path)}" ${drag} title="${esc(t.title)}" data-tip-cut=".nm" style="--d:${depth};--tc:${esc(col(t.color))}"><b class="tg"></b><i class="gl" style="${fileTint(t.name, hexOr(t.meta?.color, null) ? col(t.meta!.color as string) : t.board ? col(DEFAULT.board) : null)}">${fileIcon(t.board)}</i><span class="nm">${nameHtml(t.title)}</span>${agentsOf(parentOf(t.path) + '/').length ? '' : agentMark(t.path)}${markBadge(styleMark(t))}</div>`;
}

function inboxRow(ib: Folder, depth: number): string {
  const attrs = `data-drop="${esc(ib.loc)}"`;
  const n = ib.thoughts.filter(matches).length;
  return `<div class="ti inbox-ti ib-ti ${S.ctx === inboxLoc() ? 'on' : ''}" data-inbox ${attrs} style="--d:${depth};--bc:${esc(inboxTint())}">${foldButton('#inbox', ib.thoughts.length || ib.kids.length)}<i class="sq">${gem('inbox')}</i><span class="nm">${NAME.inbox.toUpperCase()}</span><span class="n">${n || ''}</span></div>`;
}

function folderRow(c: Folder, depth: number, top: boolean): string {
  const tip = top && c.path ? ` title="${esc(`${c.path}
Where this folder is on disk.`)}" data-tip-mono` : '';
  const attrs = `data-drop="${esc(c.loc)}" ${c.kind !== 'inbox' && !c.path.includes('/') ? 'data-fold' : ''} ${c.loc === '' ? '' : `draggable="true" data-drag="dir:${esc(c.loc)}"`}`;
  return `<div class="ti ${ROW_CLS[c.kind]} ${S.ctx === c.loc ? 'on' : ''} ${marked(c.loc) ? 'sel' : ''}" data-dir="${esc(c.loc)}"${tip} ${attrs} style="--d:${depth};--bc:${esc(tintOf(c))}">${foldButton(c.loc, c.thoughts.length || c.kids.length)}${c.kind === 'inbox' && c.path ? `<i class="sq">${dirGem(c)}</i>` : `<i class="sq" style="${top ? '--ic:var(--bc)' : hexOr(c.meta?.color, null) ? `--ic:${esc(col(c.meta!.color as string))}` : ''}">${dirIcon(isOpen(c.loc))}</i>`}<span class="nm">${esc(c.name)}</span>${c.path && !agentsOf(parentOf(c.path) + '/').length ? agentMark(c.path + '/') : ''}${markBadge(styleMark(c))}${!c.path && S.inbox && pref('inboxShortcut') ? inboxGo() : ''}</div>`;
}

let kept = '';
export const keepShown = (path: string) => (kept = path);

export function treeRows(root: Folder): TreeRow[] {
  const out: TreeRow[] = [], lit = page.shownPath?.();
  const files = (list: Note[], depth: number) => {
    for (const t of list) if (matches(t)) out.push({ key: 'f:' + t.path, depth, html: () => fileRow(t, depth, lit) });
  };
  const folder = (c: Folder, depth: number) => {
    const at = out.length;
    out.push({ key: 'd:' + c.loc, depth, html: () => folderRow(c, depth, c === root) });
    if (!isOpen(c.loc) || depth > 40) return;
    for (const k of c.kids) folder(k, depth + 1);
    files(c.thoughts, depth + 1);
    if (S.query && c !== root && out.length === at + 1 && kept !== c.loc && !kept.startsWith(c.loc + '/')) return void (out.length = at);
    const ib = S.inbox;
    if (c.path || !ib) return;
    out.push({ key: 'i', depth: depth + 1, html: () => inboxRow(ib, depth + 1) });
    if (!isOpen('#inbox')) return;
    for (const k of ib.kids) folder(k, depth + 2);
    files(ib.thoughts, depth + 2);
  };
  folder(root, 0);
  return out;
}

export function containerOptions(skip: string | null = null, indent = 0): string {
  let h = '';
  const opt = (c: Folder, depth: number) => {
    if (c.loc === skip) return;
    const ib = c === S.inbox;
    h += `<option value="${esc(c.loc)}">${'&nbsp;&nbsp;'.repeat(depth + indent)}${ib ? GLYPH.inbox : c.kind === 'inbox' ? GLYPH.project : GLYPH[c.kind]} ${esc(ib ? NAME.inbox.toUpperCase() : c.kind === 'inbox' ? c.name.toUpperCase() : c.name)}</option>`;
    if (c.kind === 'inbox' && S.inbox) opt(S.inbox, depth + 1);
    if (depth < 40) for (const k of c.kids) opt(k, depth + 1);
  };
  for (const r of S.roots) opt(r, 0);
  return h;
}

const NOTE_MAX = 28;
let menuAgain: (() => unknown) | null = null, lastBack: HTMLElement | null = null, pops = 0, inPlace = false, offOut = () => {};
let menuMoves: Record<string, (keys: string[]) => unknown> = {};
let subPick: ((b: HTMLButtonElement) => unknown) | null = null, subLeave = 0;
const SUB_GAP = 2, EDGE = 8;
export function closeSub(focus = true) {
  clearTimeout(subLeave);
  subLeave = 0;
  const m = $<HTMLElement>('#colormenu'), f = m.querySelector('.sub-fly');
  if (!f) return false;
  const row = m.querySelector<HTMLElement>('[data-sub].on'), had = f.contains(document.activeElement);
  f.remove();
  subPick = null;
  row?.classList.remove('on');
  row?.setAttribute('aria-expanded', 'false');
  if (focus || had) row?.focus({ preventScroll: true });
  return true;
}
function placeSub(row: HTMLElement, f: HTMLElement) {
  f.style.maxHeight = '';
  const m = $<HTMLElement>('#colormenu'), mr = m.getBoundingClientRect(), rr = row.getBoundingClientRect(), fw = f.offsetWidth, fh = f.offsetHeight;
  const right = innerWidth - EDGE - (mr.right + SUB_GAP), left = mr.left - SUB_GAP - EDGE;
  let x: number, y = rr.top + rr.height / 2, room = innerHeight - 2 * EDGE;
  if (fw <= right || fw <= left) {
    x = fw <= right ? mr.right + SUB_GAP : mr.left - SUB_GAP - fw;
    if (y + fh > innerHeight - EDGE) y = Math.max(EDGE, innerHeight - EDGE - fh);
  } else {
    x = right >= left ? Math.max(EDGE, innerWidth - EDGE - fw) : EDGE;
    const below = innerHeight - EDGE - (rr.bottom + SUB_GAP), above = rr.top - SUB_GAP - EDGE;
    if (fh <= below || below >= above) (y = rr.bottom + SUB_GAP), (room = below);
    else (room = above), (y = rr.top - SUB_GAP - Math.min(fh, above));
  }
  if (fh > room) f.style.maxHeight = Math.max(0, room) + 'px';
  const fixed = m.classList.contains('scroll');
  f.style.position = fixed ? 'fixed' : '';
  f.style.left = x - (fixed ? 0 : mr.left) + 'px';
  f.style.top = y - (fixed ? 0 : mr.top) + 'px';
}
export function subMenu(row: HTMLElement, html: string, onPick: (b: HTMLButtonElement) => unknown) {
  const m = $<HTMLElement>('#colormenu');
  closeSub(false);
  const f = document.createElement('div');
  f.className = 'pk-fly sub-fly';
  f.setAttribute('role', 'menu');
  f.innerHTML = html;
  m.append(f);
  subPick = onPick;
  row.classList.add('on');
  row.setAttribute('aria-expanded', 'true');
  placeSub(row, f);
  return f;
}
export function arrowIntoSub(row: HTMLElement | null | undefined, first = '.sub-fly button:not(:disabled)') {
  row?.addEventListener('keydown', (k) => {
    if (k.key !== 'ArrowRight') return;
    k.preventDefault();
    k.stopPropagation();
    if (!row.classList.contains('on')) row.click();
    $<HTMLElement>('#colormenu').querySelector<HTMLElement>(first)?.focus();
  });
}
export function placeSubAgain() {
  const m = $<HTMLElement>('#colormenu'), f = m.querySelector<HTMLElement>('.sub-fly'), row = m.querySelector<HTMLElement>('[data-sub].on');
  if (f && row) placeSub(row, f);
}
export const keepMenu = (fn: () => unknown) => (menuAgain = fn);
export const moveMenu = (id: string, fn: (keys: string[]) => unknown) => (menuMoves[id] = fn);
export function holdFocus(find: () => HTMLElement | undefined | null) {
  const m = $<HTMLElement>('#colormenu'), put = () => !m.hidden && !m.contains(document.activeElement) && find()?.focus({ preventScroll: true });
  put();
  requestAnimationFrame(put);
  setTimeout(put, 150);
}
const rowSig = (b: HTMLElement) => JSON.stringify({ ...b.dataset });
function rowFinder(b: HTMLElement): () => HTMLElement | undefined {
  const m = $<HTMLElement>('#colormenu'), sig = rowSig(b), at = [...m.querySelectorAll('button')].indexOf(b as HTMLButtonElement);
  return () => {
    const bs = [...m.querySelectorAll<HTMLButtonElement>('button')];
    const got = bs.find((x) => rowSig(x) === sig) || bs[at];
    return got && !got.disabled ? got : m.querySelector<HTMLElement>('button:not(:disabled)') || undefined;
  };
}
function againInPlace(): boolean {
  if (!menuAgain || $<HTMLElement>('#colormenu').hidden) return false;
  inPlace = true;
  try {
    menuAgain();
  } finally {
    inPlace = false;
  }
  return true;
}
export function redrawMenu() {
  const m = $<HTMLElement>('#colormenu'), act = document.activeElement as HTMLElement | null;
  if (m.hidden || !menuAgain) return;
  const find = act && m.contains(act) && act.matches('button') ? rowFinder(act) : null;
  againInPlace();
  if (find) holdFocus(find);
}
onPrefUndo(redrawMenu);
let endEsc = () => {};
const flip = (b: HTMLElement) => b.classList.toggle('on');
function tick(b: HTMLButtonElement, onPick: (b: HTMLButtonElement) => unknown) {
  const find = rowFinder(b), n = pops;
  onPick(b);
  if (pops === n && !againInPlace() && b.isConnected) flip(b);
  holdFocus(find);
}
const KEEP = '.mi.chk';
sortable(document, {
  item: '#colormenu .tb-ords[data-mv] > .tb-ord[data-ord]',
  grip: '.tb-grip',
  drop: (all: HTMLElement[]) => {
    const fn = menuMoves[all[0]?.parentElement?.dataset.mv || ''];
    if (!fn) return;
    fn(all.map((r) => r.dataset.ord!));
    againInPlace();
  },
});
let scrolled = 0;
function placeFly() {
  const m = $<HTMLElement>('#colormenu'), fly = m.querySelector<HTMLElement>('.pk-fly:not(.sub-fly)');
  if (!fly) return;
  if (!m.classList.contains('scroll')) {
    const f = fly.getBoundingClientRect();
    if (f.right > innerWidth - EDGE) fly.classList.add('left');
    if (f.bottom > innerHeight - EDGE) fly.style.top = `${fly.offsetTop - (f.bottom - innerHeight + EDGE)}px`;
    return;
  }
  const rr = fly.parentElement!.getBoundingClientRect(), fw = fly.offsetWidth, fh = fly.offsetHeight;
  const x = rr.right + 10 + fw <= innerWidth - EDGE ? rr.right + 10 : Math.max(EDGE, rr.left - 10 - fw);
  Object.assign(fly.style, { position: 'fixed', left: x + 'px', right: 'auto', top: Math.max(EDGE, Math.min(rr.top - 6, innerHeight - EDGE - fh)) + 'px' });
}
let menuBy: Element | null = null, menuWas: Element | null = null, opener: Element | null = null, openAt = 0, shut = () => {};
document.addEventListener('pointerdown', (e) => (menuWas = menuBy && !$('#colormenu').hidden && menuBy.contains(e.target as Node) ? menuBy : null), true);
export function menuButton(btn: HTMLElement, open: (e: MouseEvent) => unknown) {
  btn.addEventListener('click', (e) => {
    const again = menuWas === btn;
    menuWas = null;
    if (again) return void (!$('#colormenu').hidden && shut());
    opener = btn;
    openAt = Date.now();
    open(e);
  });
}
export function popMenu(x: number, y: number, html: string, onPick: (b: HTMLButtonElement) => unknown, up = false, onRight?: (b: HTMLButtonElement, e: MouseEvent) => unknown) {
  const m = $('#colormenu');
  const back = m.contains(document.activeElement) && lastBack ? lastBack : (document.activeElement as HTMLElement);
  const was = inPlace && !m.hidden ? [parseFloat(m.style.left), parseFloat(m.style.top)] : null, me = ++pops;
  lastBack = back;
  if (!inPlace || m.hidden) menuBy = opener && Date.now() - openAt < 1500 ? opener : null;
  opener = null;
  menuAgain = null;
  menuMoves = {};
  subPick = null;
  clearTimeout(subLeave);
  subLeave = 0;
  offOut();
  offOut = () => {};
  m.innerHTML = html;
  const top = m.firstElementChild;
  if (top?.matches('.ml')) top.className = 'mh';
  for (const d of m.querySelectorAll('.mi > .d') as NodeListOf<HTMLElement>) {
    const t = d.textContent!.trim();
    if (t.length <= NOTE_MAX) continue;
    const b = d.parentElement!;
    d.remove();
    b.title ||= `${cap(b.textContent!.trim())}
${cap(t)}${/[.!?]$/.test(t) ? '' : '.'}`;
  }
  m.hidden = false;
  raise(m);
  m.classList.remove('scroll');
  m.style.maxHeight = '';
  const flyNow = m.querySelector('.pk-fly') as HTMLElement | null;
  if (flyNow) flyNow.style.display = 'none';
  if (m.offsetHeight > innerHeight - 2 * EDGE) {
    m.classList.add('scroll');
    m.style.maxHeight = innerHeight - 2 * EDGE + 'px';
  }
  if (flyNow) flyNow.style.display = '';
  const r = m.getBoundingClientRect(), fitX = (v: number) => Math.max(8, Math.min(v, innerWidth - r.width - 8)), fitY = (v: number) => Math.max(8, Math.min(v, innerHeight - r.height - 8));
  m.style.left = fitX(was ? was[0] : x) + 'px';
  m.style.top = fitY(was ? was[1] : up ? y - r.height : y) + 'px';
  m.scrollTop = was ? scrolled : 0;
  scrolled = m.scrollTop;
  placeFly();
  m.onscroll = () => {
    if (m.scrollTop === scrolled) return;
    scrolled = m.scrollTop;
    closeSub(false);
    placeFly();
  };
  endEsc();
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (m.hidden) return endEsc();
    e.stopPropagation();
    e.preventDefault();
    close();
  };
  endEsc = () => document.removeEventListener('keydown', onEsc, true);
  document.addEventListener('keydown', onEsc, true);
  const close = () => {
    m.hidden = true;
    endEsc();
    offOut();
    offOut = () => {};
    if (m.contains(document.activeElement)) back?.focus?.();
    m.dispatchEvent(new Event('menuclose'));
  };
  shut = close;
  setTimeout(() => me === pops && !m.hidden && (offOut = onOutside([m], close)), 0);
  m.onclick = (e: MouseEvent) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    if (b.dataset.sub != null && !b.closest('.sub-fly')) return closeSub() || onPick(b);
    const sub = b.closest('.sub-fly') ? subPick : null;
    if (!sub && b.matches(KEEP) && !('shut' in b.dataset)) return tick(b, onPick);
    close();
    if (sub) return sub(b);
    if ('swAdd' in b.dataset) return toColorTray();
    if ('pkcfg' in b.dataset) return toSetColors();
    onPick(b);
  };
  m.oncontextmenu = onRight
    ? (e: MouseEvent) => {
        const b = (e.target as Element).closest('button');
        e.preventDefault();
        if (b) onRight(b, e);
      }
    : null;
  m.onpointermove = (e: PointerEvent) => {
    const t = e.target as Element;
    if (m.querySelector('.sub-fly')) {
      if (!t.closest('.sub-fly, [data-sub]') && t.closest('button')) subLeave ||= window.setTimeout(() => closeSub(false), 300);
      else clearTimeout(subLeave), (subLeave = 0);
    }
    const b = t.closest<HTMLElement>('button.mi:not(:disabled)');
    if (b && b !== document.activeElement && m.contains(document.activeElement)) b.focus({ preventScroll: true });
  };
  m.onkeydown = (e: KeyboardEvent) => {
    const at = document.activeElement as HTMLElement | null, fly = at?.closest('.sub-fly');
    const bs = [...(fly || m).querySelectorAll('button')].filter((b) => fly || !b.closest('.sub-fly')), i = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') closeSub() || close();
    else if (e.key === 'ArrowLeft' && fly) closeSub();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && at?.parentElement?.matches('.mk-strip')) (((e.key === 'ArrowLeft' ? at.previousElementSibling : at.nextElementSibling) || at) as HTMLElement).focus();
    else if (e.key === 'ArrowRight' && at?.dataset.fly != null && !at.classList.contains('open')) at.click();
    else if (e.key === 'ArrowLeft' && at?.closest('.pk-fly')) (m.querySelector('.pk.open') as HTMLElement | null)?.click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
}

export const menuHead = (icon: string, name: string, style = '') => `<div class="mh">${icon ? `<i class="mh-ic"${style ? ` style="${esc(style)}"` : ''}>${icon}</i>` : ''}<span class="mh-n">${esc(name)}</span></div>`;
export const band = (name: string) => `<div class="ml tb-rule">${esc(name)}</div>`;
export const subLabel = (name: string) => `<div class="ml tb-rule sublbl">${esc(name)}</div>`;
export type Bands = { actions?: string; options?: string; buttons?: string; pick?: [string, string] | [string, string][]; other?: string };
export const bands = ({ actions, options, buttons, pick, other }: Bands): string =>
  ([['actions', actions], ['options', options], ['buttons', buttons], ...(Array.isArray(pick?.[0]) ? (pick as [string, string][]) : [pick as [string, string] | undefined]).map((p) => [p?.[0] || '', p?.[1]]), ['other', other]] as [string, string | undefined][]).map(([n, h]) => (h ? band(n) + h : '')).join('');
export const chip = (text: string | string[]): string => {
  const keys = ([] as string[]).concat(text).filter(Boolean);
  return keys.length ? `<span class="kc">${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>` : '';
};
export const keyChip = (id: string): string => chip(show(bound(id)));
export const miRow = (attrs: string, ic: string, label: string, key = '', tip = '', cls = '') => `<button class="mi${cls ? ' ' + cls : ''}" ${attrs}${tip ? ` title="${esc(label)}&#10;${esc(tip)}"` : ''}><i class="tb-ic">${ic}</i><span class="mi-n">${esc(label)}</span>${chip(key)}</button>`;
export const fileManager =(): string => (/mac/i.test(navigator.platform) ? 'Finder' : /win/i.test(navigator.platform) ? 'File Explorer' : 'the file manager');
export const extColors = (): string => `<button class="mi" data-fextcol title="Opens Settings at the color of each extension."><i class="tb-ic">${ICONS.drop}</i><span class="mi-n">extension colors</span>${chip('›')}</button>`;
const GRIP = '<span class="tb-grip" title="Move&#10;Drag to change the order.">⠿</span>';
export const gripRow = (key: string, html: string) => `<div class="tb-ord" data-ord="${esc(key)}">${html}${GRIP}</div>`;
export const actRow = (key: string, html: string, act: string, grip = true) => `<div class="tb-ord tb-use"${grip ? ` data-ord="${esc(key)}"` : ''}>${html}${act}${grip ? GRIP : ''}</div>`;
export const openBtn = (k: string, id: string, sel: string, name: string) => `<button class="tb-open" data-use="${esc(k)}" data-use-i="${esc(id)}" data-use-sel="${esc(sel)}" title="Open ${name}&#10;Uses it from here, even while it's hidden.">open</button>`;
const useRow = (k: string, id: string, sel: string | undefined, name: string, html: string, grip: boolean) => {
  if (!sel || !pref('barmenu:open')) return grip ? gripRow(id ? `${k}:${id}` : k, html) : html;
  return actRow(id ? `${k}:${id}` : k, html, openBtn(k, id, sel, name), grip);
};
const onScreen = (el: Element | null | undefined): el is HTMLElement => !!el && el.getClientRects().length > 0;
const findIn = (from: Element | null | undefined, sel: string): HTMLElement | null => {
  for (let a = from?.isConnected ? from : null; a; a = a.parentElement) {
    const hit = a.querySelector<HTMLElement>(sel);
    if (hit) return hit;
  }
  return document.querySelector<HTMLElement>(sel);
};
const hit = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-mode]') || el;
const opens = (el: Element) => el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup');
function useBtn(b: HTMLElement, from: Element | null | undefined) {
  const k = b.dataset.use!, id = b.dataset.useI || '', sel = b.dataset.useSel!, mode = k === 'modesHidden', now = findIn(from, sel);
  if (onScreen(now) || (now && !mode && !opens(now))) return void hit(now).click();
  peek(k, id, true);
  requestAnimationFrame(() => {
    const el = findIn(from, sel);
    if (!el) {
      peek(k, id, false);
      return void tell(from, { title: "It can't open here", line: "This button isn't in this bar right now" });
    }
    el.classList.add('peek');
    hit(el).click();
    if (mode) peek(k, id, false);
    else if (!opens(el)) return void (el.classList.remove('peek'), peek(k, id, false));
    let seen = false;
    const t0 = Date.now(), timer = setInterval(() => {
      const cur = findIn(from, sel), open = mode ? onScreen(cur) : cur?.getAttribute('aria-expanded') === 'true';
      seen ||= open;
      if (open || (!seen && Date.now() - t0 < 1500)) return void cur?.classList.add('peek');
      clearInterval(timer);
      for (const p of document.querySelectorAll('.peek')) p.classList.remove('peek');
      if (!mode) peek(k, id, false);
    }, 200);
  });
}
export function gripRuns(id: string, rows: { html: string; grip: boolean }[]): string {
  let out = '', run = '';
  const end = () => {
    if (run) out += `<div class="tb-ords" data-mv="${esc(id)}">${run}</div>`;
    run = '';
  };
  for (const r of rows) {
    if (r.grip) run += r.html;
    else end(), (out += r.html);
  }
  end();
  return out;
}

const BTN_MENUS: BtnMenu[] = [];
export function buttonMenu(sel: string, o: Omit<BtnMenu, 'sel'>) {
  BTN_MENUS.push({ sel, ...o });
}
let ctxAt: Element | null = null;
document.addEventListener('contextmenu', (e) => (ctxAt = e.target instanceof Element ? e.target : null), true);
const ownOf = (from: Element | null | undefined) => {
  for (const m of BTN_MENUS) {
    const el = from?.closest?.<HTMLElement>(m.sel);
    if (el) return { m, el };
  }
  return null;
};
export const ROW_IC: Record<string, () => string> = {
  'bar:off:usage': () => ICONS.usage, 'bar:off:timer': () => gem('timer'), 'bar:off:windows': () => ICONS.window, 'bar:off:update': () => ICONS.update, 'bar:off:hitch': () => ICONS.bug, 'bar:off:clips': () => ICONS.clip, 'forget:on': () => ICONS.bang,
  'chrow:off:attach': () => icon('image'), 'chrow:off:usage': () => ICONS.usageRing, 'chat:worktree': () => icon('branch'), 'chat:wtStrip': () => icon('branch'), 'chrow:off:mode': () => icon('default'), 'chat:mic': () => icon('mic'), 'chat:hint': () => ICONS.at, 'chat:shrinkRow': () => icon('shrink'),
  'tbar:off:split': () => ICONS.splitRow, 'tbar:off:gclose': () => ICONS.x,
  'act:off:explorer': () => ICONS.explorer, 'act:off:git': () => ICONS.git, 'act:off:github': () => ICONS.pr, 'act:off:agent setup': () => ICONS.setup, 'act:off:site': () => ICONS.site,
  'drafts:off:scratch': () => gem('scratch'), 'drafts:off:sketch': () => gem('sketch'), 'drafts:off:inbox': () => gem('inbox'),
  'qterm:off:term': () => gem('term'), 'qterm:off:pwsh': () => gem('term') + '<b class="qk-tag">ps</b>', 'qterm:off:agent': () => gem('ai'), 'qterm:off:newchat': () => gem('ai') + '<b class="qk-tag">+</b>',
  'barend:off:more': () => ICONS.newAny, 'barend:off:pins': () => ICONS.pin, 'barend:off:win': () => ICONS.window,
  'modesHidden:editor': () => modeGem('editor'), 'modesHidden:orch': () => modeGem('orch'), 'modesHidden:chat': () => modeGem('ai'), 'modesHidden:term': () => gem('term'), 'modesHidden:research': () => gem('research'),
  'switch:wkOn': () => workGem(), edWork: () => modeGem('editor'),
  'deck:markShow': () => ICONS.mark1, 'deck:noteShow': () => ICONS.note,
  foldAll: () => ICONS.foldAll, winSize: () => ICONS.window, 'win:every': () => ICONS.pin,
  'explorer:guides': () => ICONS.guides, inboxShortcut: () => gem('inbox'),
  'wsx:off:new': () => ICONS.newFile, 'wsx:off:dir': () => ICONS.newFolder, 'wsx:off:fold': () => ICONS.foldAll, 'wsx:off:load': () => ICONS.reset,
  'setup:off:tag': () => ICONS.tag, 'setup:off:count': () => '<b class="tb-tx">3</b>', 'setup:off:account': () => ICONS.person, 'setup:off:add': () => '<b class="tb-tx">+</b>', 'setup:off:clear': () => ICONS.archive,
  'inbox:off:new': () => ICONS.newFile, 'archive:off:show': () => ICONS.reveal, 'web:off:undo': () => ICONS.undo, 'web:off:reset': () => ICONS.defLayout, 'web:off:fit': () => ICONS.fit, 'web:off:home': () => ICONS.center, 'edits:strip': () => ICONS.editsList, 'chat:artifacts': () => gem('file'),
};
export const rowIcons = (m: Record<string, () => string>) => Object.assign(ROW_IC, m);
export const MENU_IC: Record<string, () => string> = {
  bar: () => ICONS.dock, chrow: () => ICONS.toChat, tbar: () => ICONS.tab, drafts: () => ICONS.strip, modes: () => ICONS.modes, strip: () => ICONS.strip, tiles: () => gem('link'), txbar: () => gem('file'), fmt: () => ICONS.fmtBar, pad: () => gem('sketch'),
  explorer: () => ICONS.explorer, scm: () => ICONS.git, setup: () => ICONS.setup, usage: () => ICONS.usage, clips: () => ICONS.clip, settings: () => ICONS.settings, hgbar: () => ICONS.bug, forget: () => ICONS.bang, wsx: () => ICONS.explorer,
  orch: () => modeGem('orch'), decklist: () => ICONS.rail, ochead: () => modeGem('orch'), head: () => ICONS.header, qagent: () => gem('ai'), size: () => ICONS.window, quote: () => ICONS.toChat, edfoot: () => gem('scratch'), wspage: () => ICONS.workspaces, launch: () => ICONS.workspaces, browser: () => gem('link'), inbox: () => gem('inbox'), archive: () => gem('archive'), edits: () => ICONS.editsList, artifacts: () => gem('file'), web: () => gem('core'),
};
const SEEN = new Map<string, string>();
function iconOf(key: string): string {
  const fixed = ROW_IC[key]?.();
  if (fixed) return fixed;
  const el = BTN_OF[key] ? document.querySelector(BTN_OF[key]) : null, svg = el?.querySelector('svg')?.outerHTML, txt = el?.textContent?.trim() || '';
  const got = svg || (txt && txt.length <= 2 ? `<b class="tb-tx">${esc(txt)}</b>` : '');
  if (got) SEEN.set(key, got);
  return SEEN.get(key) || '';
}
const keysOf = (menu: string) =>
  Object.entries(PREFS).filter(([, e]) => ([] as unknown[]).concat(e.menu).includes(menu)).flatMap(([k, e]) => (Array.isArray(e.def) ? (e.items || []).map(([id]) => `${k}:${id}`) : [k]));
function orderOf(menu: string): string[] {
  const def = BAR_ORDER[menu] || [], last = BAR_LAST[menu] || [], at = (k: string) => (def.includes(k) ? def.indexOf(k) : def.length);
  const keys = keysOf(menu).filter((k) => BTN_OF[k]).map((k, i) => ({ k, i })).sort((a, b) => at(a.k) - at(b.k) || a.i - b.i).map((x) => x.k), saved: string[] = (store.get('bar:order', {})[BAR_SHARE[menu] || menu] || []).filter((k: string) => keys.includes(k));
  for (const [i, k] of keys.entries()) if (!saved.includes(k)) saved.splice(i ? saved.indexOf(keys[i - 1]) + 1 : 0, 0, k);
  const own = (k: string) => PREFS[k.split(':').slice(0, 2).join(':')]?.group === 'own', mine = keys.filter(own), rest = saved.filter((k) => !last.includes(k) && !own(k)), m = rest.indexOf('deck:more');
  rest.splice(m < 0 ? rest.length : m, 0, ...mine);
  return [...rest, ...saved.filter((k) => last.includes(k))];
}
export const menuButtons = (menu: string): string[] => orderOf(menu);
export const btnIcon = (key: string): string => iconOf(key);
type HideRow = { key: string; html: string; raw: string; group: string; sub: string; btn: boolean; grip: boolean };
export function hideMenu(x: number, y: number, menu: string, opts: HideOpts = {}) {
  const { fixed = [], onPick, up, again = true, place, only } = opts;
  const { acts = '', opts: more = '', pick, other = '', move, items, seq, name, ic } = { ...opts, ...(opts.remake?.() || {}) };
  const at0 = opts.from === undefined ? ctxAt : opts.from, own = ownOf(at0), from = own?.el || at0;
  const here = menu ? Object.entries<any>(PREFS).filter(([k, e]) => ([] as unknown[]).concat(e.menu).includes(menu) && (!e.when || e.when()) && (!only || only(k))) : [];
  const order = seq || (menu ? orderOf(menu) : []);
  const mover = move || (ORDERS.some((o) => o.menu === menu) ? (keys: string[]) => setBarOrder(menu, keys) : null);
  const rows: HideRow[] = [];
  let group = '', sub = '', btn = false;
  const row = (key: string, on: unknown, attrs: string, label: string, off: boolean, tip: string, ic?: string) => {
    const last = !!BAR_LAST[menu]?.includes(key), say = last ? "It stays in the corner; it can't be hidden." : tip, grip = btn && !!mover && order.includes(key) && !last;
    const html = topRow(!!on, attrs + (say ? ` title="${label}&#10;${esc(say)}"` : ''), ic || iconOf(key), label, '', off);
    const [pk, pi = ''] = attrs.match(/data-pk="([^"]*)"(?: data-pi="([^"]*)")?/)!.slice(1), use = (g: boolean) => (btn ? useRow(pk, pi, BTN_OF[key], label, html, g) : g ? gripRow(key, html) : html);
    rows.push({ key, group, sub, btn, grip, raw: use(false), html: use(grip) });
  };
  const listOf = (e: Pref) => (e.list ? e.list(from) : items || e.items || []);
  for (const [key, e] of here) {
    group = e.group || '';
    sub = '';
    if (!Array.isArray(e.def)) {
      btn = !!BTN_OF[key] && e.group !== 'part';
      row(key, saved(key, place), `data-pk="${key}"`, esc(e.item || e.label), !!e.fixed, e.desc || '');
    } else
      for (const [id, label] of listOf(e)) {
        sub = e.parts?.[id] || '';
        btn = !!BTN_OF[`${key}:${id}`] || !!e.list || !!seq;
        row(`${key}:${id}`, fixed.includes(id) || !savedOff(key, id), `data-pk="${key}" data-pi="${esc(id)}"`, esc(label), fixed.includes(id), e.tips?.[id] || '', e.icon?.(id, from));
      }
  }
  const at = (k: string) => (order.includes(k) ? order.indexOf(k) : -1);
  const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => (at(a.key) < 0 || at(b.key) < 0 ? a.i - b.i : at(a.key) - at(b.key)));
  const runs = new Map<string, number>(), runKey = (r: HideRow) => `${r.btn}|${r.group}|${r.sub}`;
  for (const r of sorted) if (r.grip) runs.set(runKey(r), (runs.get(runKey(r)) || 0) + 1);
  for (const r of sorted) if (r.grip && runs.get(runKey(r))! < 2) (r.grip = false), (r.html = r.raw);
  const part = (list: HideRow[]) => [...new Set(list.map((r) => r.sub))].map((n) => (n ? subLabel(n) : '') + gripRuns('m', list.filter((r) => r.sub === n))).join('');
  const ownKey = own && Object.keys(BTN_OF).find((k) => BTN_OF[k] === own.m.sel);
  const head = own ? menuHead(own.m.icon?.() || (ownKey ? iconOf(ownKey) : ''), own.m.name) : menuHead(ic ?? (MENU_IC[menu]?.() || ''), name || MENUS[menu] || menu);
  const ownActs = own?.m.rows(own.el) || '';
  const html = head + bands({
    actions: ownActs && acts ? `${ownActs}<div class="sep"></div>${acts}` : ownActs + acts,
    options: (own?.m.opts?.(own.el) || '') + part(sorted.filter((r) => !r.btn)) + more,
    buttons: part(sorted.filter((r) => r.btn)),
    pick: pick || own?.m.band?.(own.el),
    other,
  });
  const again2 = () => hideMenu(x, y, menu, { ...opts, from });
  popMenu(x, y, html, (b) => {
    const { pk, pi } = b.dataset, e = PREFS[pk as string];
    if ('bm' in b.dataset && own) return own.m.pick(b, own.el);
    if ('use' in b.dataset) return useBtn(b, from);
    if (!pk) return onPick?.(b);
    if (pi == null) return setAt(pk, place, !saved(pk, place));
    const off = !savedOff(pk, pi);
    setOff(pk, pi, off);
    e.picked?.(pi, !off);
    if (e.on) setSave(`${b.textContent!.trim()}: ${off ? e.off : e.on}`);
  }, up);
  if (again) keepMenu(again2);
  if (mover) moveMenu('m', mover);
}

export function offClasses(key: string, prefix: string) {
  const paint = () => PREFS[key].items!.forEach(([id]) => document.documentElement.classList.toggle(`no-${prefix}-${id}`, isOff(key, id)));
  paint();
  onPref(key, paint);
}

type TopRow = { k: string; id: string; label: string; sel: string; icon: () => string; fixed?: boolean; when?: () => boolean; d?: string; tip?: string; why?: () => string };
type TopPre = { rows: (grip?: boolean) => string; pick: (b: HTMLElement) => boolean; move: [string, (keys: string[]) => unknown] };
type TopOpts = { tray?: string; head?: string; acts?: string; opts?: string; buttons?: string; pick?: [string, string]; onPick?: (b: HTMLElement) => unknown };
const shownBtn = (sel: string) => () => !atWs() && !document.querySelector(sel)?.hasAttribute('hidden');
const rowIc = (k: string) => () => ROW_IC[k]?.() || '';
export const TOPBAR: { g: string; name: string; sel: string; icon?: () => string; rows: TopRow[]; acts?: () => string; onAct?: (b: HTMLElement) => unknown; move?: (keys: string[]) => unknown; pre?: TopPre }[] = [
  { g: 'strip', name: 'panels', sel: '#switch > .sv[data-g=strip]', icon: () => ICONS.strip, rows: [
    { k: 'act:off', id: 'explorer', label: 'explorer', sel: '#btn-index', icon: rowIc('act:off:explorer') },
    { k: 'act:off', id: 'git', label: 'source control', sel: '#btn-git', icon: rowIc('act:off:git'), when: () => !atWs() },
    { k: 'act:off', id: 'github', label: 'GitHub', sel: '#btn-github', icon: rowIc('act:off:github'), when: () => !atWs() },
    { k: 'act:off', id: 'agent setup', label: 'agent setup', sel: '#btn-setup', icon: rowIc('act:off:agent setup'), when: () => !atWs() },
    { k: 'act:off', id: 'site', label: 'site', sel: '#btn-site', icon: rowIc('act:off:site') },
  ] },
  { g: 'modes', name: 'modes', sel: '#switch', icon: () => ICONS.modes, rows: [
    { k: 'modesHidden', id: 'editor', label: 'editor', sel: '#switch .sets[data-kind=editor]', icon: rowIc('modesHidden:editor'), fixed: true },
    { k: 'modesHidden', id: 'orch', label: 'orchestration', sel: '#switch .sets[data-kind=orch]', icon: rowIc('modesHidden:orch'), when: () => !atWs() },
    { k: 'modesHidden', id: 'chat', label: 'agents', sel: '#switch .sets[data-kind=chat]', icon: rowIc('modesHidden:chat') },
    { k: 'modesHidden', id: 'term', label: 'terminals', sel: '#switch .sets[data-kind=term]', icon: rowIc('modesHidden:term') },
    { k: 'modesHidden', id: 'research', label: 'research', sel: '#switch .sets[data-kind=research]', icon: rowIc('modesHidden:research'), when: () => !atWs() },
  ] },
  { g: 'agent', name: 'agents', sel: '#switch > .sv[data-g=agent]', icon: () => gem('ai'), rows: [{ k: 'qterm:off', id: 'newchat', label: 'new agent chat', sel: '#btn-newchat', icon: rowIc('qterm:off:newchat'), when: () => !atWs() }] },
  { g: 'make', name: 'create', sel: '#switch > .sv[data-g=make]', icon: () => ICONS.create, rows: [{ k: 'barend:off', id: 'more', label: 'new', sel: '#btn-more', icon: rowIc('barend:off:more'), d: 'Right-click it for its buttons.', when: () => !atWs() }] },
  { g: 'quick', name: 'quick tools', sel: '#switch > .sv[data-g=quick]', icon: () => ICONS.quick, rows: [
    { k: 'drafts:off', id: 'scratch', label: 'scratch pad', sel: '#btn-scratch', icon: rowIc('drafts:off:scratch'), when: () => !atWs() },
    { k: 'drafts:off', id: 'sketch', label: 'sketch board', sel: '#btn-sketch', icon: rowIc('drafts:off:sketch'), when: () => !atWs() },
    { k: 'qterm:off', id: 'term', label: 'quick terminal', sel: '#btn-qterm', icon: rowIc('qterm:off:term'), when: shownBtn('#btn-qterm') },
    { k: 'qterm:off', id: 'pwsh', label: 'quick PowerShell', sel: '#btn-qpwsh', icon: rowIc('qterm:off:pwsh'), when: shownBtn('#btn-qpwsh') },
    { k: 'qterm:off', id: 'agent', label: 'Quick Agent', sel: '#btn-qagent', icon: rowIc('qterm:off:agent'), when: () => !atWs() },
    { k: 'drafts:off', id: 'inbox', label: 'inbox', sel: '#btn-inbox', icon: rowIc('drafts:off:inbox'), when: () => !atWs() },
  ] },
  { g: 'ue', name: 'Unreal', sel: '#switch > .sv[data-g=ue]', rows: [
    { k: 'ue:winbtn', id: '', label: 'build window', sel: '#btn-uewin', icon: rowIc('ue:winbtn'), when: () => !!pref('ue:on') },
    { k: 'ue:btn', id: '', label: 'Unreal build', sel: '#btn-ue', icon: rowIc('ue:btn'), when: () => !!pref('ue:on') },
  ] },
  { g: 'win', name: 'windows', sel: '#switch > .sv[data-g=win]', icon: () => ICONS.window, rows: [
    { k: 'barend:off', id: 'pins', label: 'pinned', sel: '#btn-pins', icon: rowIc('barend:off:pins'), when: () => !atWs() },
    { k: 'barend:off', id: 'win', label: 'new window', sel: '#btn-win', icon: rowIc('barend:off:win') },
  ] },
];
const MODE_KINDS = ['editor', 'orch', 'chat', 'term', 'research'];
export const modeOrder = (): string[] => {
  const saved = store.get('modes:order', []).filter((k: string) => MODE_KINDS.includes(k));
  for (const [i, k] of MODE_KINDS.entries()) if (!saved.includes(k)) saved.splice(i ? saved.indexOf(MODE_KINDS[i - 1]) + 1 : 0, 0, k);
  return saved;
};
const rowOn = (r: TopRow) => (r.id ? !savedOff(r.k, r.id) : !!saved(r.k));
const live = (rows: TopRow[]) => rows.filter((r) => !r.when || r.when()).sort((a, b) => (a.k === 'modesHidden' && b.k === 'modesHidden' ? modeOrder().indexOf(a.id) - modeOrder().indexOf(b.id) : 0));
export const topRow = (on: boolean, attrs: string, icon: string, label: string, end = '', off = false) =>
  `<button class="mi pick chk tb-row${on ? ' on' : ''}" ${attrs}${off ? ' disabled' : ''}><i class="tb-ic">${icon}</i><span class="nm">${label}</span>${end}</button>`;
export function topBarMenu(x: number, y: number, o: TopOpts = {}) {
  const row = (r: TopRow, g: (typeof TOPBAR)[number]) => {
    const say = r.why?.() || r.tip || (r.id ? PREFS[r.k].tips?.[r.id] : PREFS[r.k].desc) || r.d || '';
    const html = topRow(rowOn(r) || !!r.fixed, `data-tk="${r.k}" data-ti="${r.id}"${say ? ` title="${esc(cap(r.label))}&#10;${esc(say)}"` : ''}`, r.icon(), esc(r.label), '', r.fixed);
    return { html: useRow(r.k, r.id, r.sel, esc(r.label), html, !!g.move), grip: !!g.move };
  };
  const rowsOf = (g: (typeof TOPBAR)[number]) => gripRuns(g.g, live(g.rows).map((r) => row(r, g)));
  const flat = (g: (typeof TOPBAR)[number]) => live(g.rows).map((r) => row(r, { ...g, move: undefined }).html).join('');
  let html: string;
  if (!o.tray) {
    const band = (name: string, gs: string[]) => {
      const inner = TOPBAR.filter((g) => gs.includes(g.g)).map((g) => flat(g) + (g.pre?.rows(false) || '')).join('');
      return inner ? subLabel(name) + inner : '';
    };
    const tools = TOPBAR.map((g) => g.g).filter((g) => g !== 'strip' && g !== 'modes');
    html = menuHead(ICONS.strip, 'rail') + bands({ actions: (o.acts ?? railActs.rows()) || undefined, buttons: band('panels', ['strip']) + band('modes', ['modes']) + band('tools', tools) });
  } else {
    const g = TOPBAR.find((t) => t.g === o.tray)!;
    html = (o.head || menuHead(g.icon?.() || '', g.name)) + bands({ actions: (o.acts || '') + (g.acts?.() || ''), options: o.opts, buttons: (o.buttons || '') + rowsOf(g), pick: o.pick, other: `<button class="mi tb-all" data-tball><i class="tb-ic">${ICONS.strip}</i><span class="mi-n">all rail buttons</span><span class="kc">›</span></button>` });
  }
  popMenu(x, y, html, (b) => {
    const d = b.dataset;
    if (d.tk) {
      const r = TOPBAR.flatMap((t) => t.rows).find((t) => t.k === d.tk && t.id === d.ti)!;
      return r.id ? setOff(r.k, r.id, rowOn(r)) : setPref(r.k, !saved(r.k));
    }
    if ('use' in d) return useBtn(b, null);
    if (!o.tray && TOPBAR.some((g) => g.pre?.pick(b))) return;
    if (d.tbact) return TOPBAR.find((g) => g.g === d.tbact)?.onAct?.(b);
    if ('tball' in d) return topBarMenu(x, y);
    if (!o.tray && !o.onPick) return railActs.pick(b, null);
    return o.onPick?.(b);
  });
  keepMenu(() => topBarMenu(x, y, o));
  if (o.tray) for (const g of TOPBAR) if (g.move) moveMenu(g.g, g.move);
}
const railActs: { rows: () => string; pick: (b: HTMLElement, at: number | null) => unknown } = { rows: () => '', pick: () => {} };
export const railActions = (rows: () => string, pick: (b: HTMLElement, at: number | null) => unknown) => Object.assign(railActs, { rows, pick });
export const topBarRows = (g: string, pre: TopPre) => void (TOPBAR.find((t) => t.g === g)!.pre = pre);
const ORDERS: { sel: string; menu: string; flat?: boolean }[] = [];
let ALL_BARS = '';
let sortBox: Element | null = null;
function orderBar(bar: Element, menu: string, flat = false) {
  const order = orderOf(menu);
  if (order.length < 2) return;
  if (flat) {
    const last = BAR_LAST[menu] || [];
    order.forEach((k, i) => {
      const el = bar.querySelector<HTMLElement>(BTN_OF[k]);
      if (!el) return;
      el.style.order = String(last.includes(k) ? 999 : i + 1);
      if (last.includes(k)) return;
      el.dataset.bo = `${menu} ${k}`;
      el.dataset.flat = '';
    });
    return;
  }
  if (bar.querySelector('.sorting') || bar.matches('.sorting')) return;
  for (const k of order) {
    const el = bar.querySelector<HTMLElement>(BTN_OF[k]);
    if (el) el.dataset.bo = `${menu} ${k}`;
  }
  const slots = slotsOf(bar, menu);
  groupsOf(menu, slots.length).forEach((keys, i) => {
    const { box, at } = slots[i];
    let cur: Node | null = at;
    for (const k of keys) {
      const el = bar.querySelector<HTMLElement>(BTN_OF[k]);
      if (!el || el.parentNode !== box) continue;
      const want = cur ? cur.nextSibling : box.firstChild;
      if (want !== el) box.insertBefore(el, want);
      cur = el;
    }
  });
}
type Slot = { box: Element; at: Element | null };
const SLOTS = new WeakMap<Element, Slot[]>(), HOME_GROUP: Record<string, Record<string, number>> = {};
const skipped = (n: Element) => n.classList.contains('pj-ghost') || n.classList.contains('dg-drop') || (n as HTMLElement).hidden;
export function wallOf(n: Element, isItem: (x: Element) => boolean): Element | null {
  for (let p = n.previousElementSibling; p; p = p.previousElementSibling) if (!skipped(p) && !isItem(p)) return p;
  return null;
}
const isBo = (x: Element) => x.hasAttribute('data-bo');
function slotsOf(bar: Element, menu: string): Slot[] {
  const had = SLOTS.get(bar);
  if (had && had.every((s) => s.box.isConnected && bar.contains(s.box) && (!s.at || s.at.parentNode === s.box))) return had;
  const slots: Slot[] = [], home: Record<string, number> = {};
  for (const k of orderOf(menu)) {
    const el = bar.querySelector<HTMLElement>(BTN_OF[k]);
    if (!el?.parentElement) continue;
    const box = el.parentElement, at = wallOf(el, isBo);
    let i = slots.findIndex((s) => s.box === box && s.at === at);
    if (i < 0) i = slots.push({ box, at }) - 1;
    home[k] = i;
  }
  const order = (a: Slot, b: Slot) => {
    const x = a.at || a.box, y = b.at || b.box;
    return x === y ? 0 : a.box === b.box && !a.at ? -1 : a.box === b.box && !b.at ? 1 : x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };
  const sorted = [...slots].sort(order);
  for (const k of Object.keys(home)) home[k] = sorted.indexOf(slots[home[k]]);
  if (!had) HOME_GROUP[menu] ||= home;
  SLOTS.set(bar, sorted);
  return sorted;
}
function groupsOf(menu: string, n: number): string[][] {
  const flat = orderOf(menu), home = HOME_GROUP[menu] || {};
  const saved: string[] = store.get('bar:order', {})[BAR_SHARE[menu] || menu] || [];
  const byHome = () => Array.from({ length: n }, (_, i) => flat.filter((k) => (home[k] ?? 0) === i));
  if (!saved.includes('|')) return byHome();
  const groups: string[][] = [[]];
  for (const k of saved) k === '|' ? groups.push([]) : flat.includes(k) && groups.at(-1)!.push(k);
  if (groups.length !== n) return byHome();
  for (const k of flat) if (!groups.some((g) => g.includes(k))) groups[Math.min(home[k] ?? 0, n - 1)].push(k);
  return groups;
}
function setBarGroups(bar: Element, box: Element, moved: string[][]) {
  const [menu] = bar.querySelector<HTMLElement>('[data-bo]')!.dataset.bo!.split(' ');
  const slots = slotsOf(bar, menu), mine = slots.map((s, i) => (s.box === box ? i : -1)).filter((i) => i >= 0);
  const groups = groupsOf(menu, slots.length), shown = new Set(moved.flat());
  mine.forEach((gi, j) => {
    const want = moved[j] || [], out: string[] = [];
    let w = 0;
    for (const k of groups[gi]) if (!shown.has(k)) out.push(k);
    else if (w < want.length) out.push(want[w++]);
    groups[gi] = [...out, ...want.slice(w)];
  });
  for (const [gi, g] of groups.entries()) if (!mine.includes(gi)) groups[gi] = g.filter((k) => !shown.has(k));
  store.set('bar:order', { ...store.get('bar:order', {}), [menu]: groups.flatMap((g, i) => (i ? ['|', ...g] : g)) });
  orderAll(menu);
}
export const barSlots = (box: Element): (Element | null)[] | null => {
  const o = ORDERS.find((x) => box.closest(x.sel)), bar = o && box.closest(o.sel);
  if (!o || !bar) return null;
  return slotsOf(bar, o.menu).filter((s) => s.box === box).map((s) => s.at);
};
const orderAll = (menu?: string) => ORDERS.filter((o) => !menu || o.menu === menu).forEach((o) => document.querySelectorAll(o.sel).forEach((b) => orderBar(b, o.menu, o.flat)));
let todo = new Set<Element>(), soon = 0;
new MutationObserver((recs) => {
  if (!ORDERS.length) return;
  const all = ALL_BARS, seen = new Set<Node>();
  for (const r of recs) {
    let added = false;
    for (const n of r.addedNodes) {
      if (!(n instanceof Element)) continue;
      added = true;
      if (n.matches(all)) todo.add(n);
      else if (n.firstElementChild) n.querySelectorAll(all).forEach((x) => todo.add(x));
    }
    if (!added || seen.has(r.target)) continue;
    seen.add(r.target);
    const b = (r.target as Element).closest?.(all);
    if (b) todo.add(b);
  }
  if (todo.size && !soon)
    soon = requestAnimationFrame(() => {
      const bars = todo;
      todo = new Set();
      soon = 0;
      for (const b of bars) if (b.isConnected) for (const o of ORDERS) if (b.matches(o.sel)) orderBar(b, o.menu, o.flat);
    });
}).observe(document.body, { childList: true, subtree: true });
export const barOrder = (menu: string) => orderOf(menu).filter((k) => !BAR_LAST[menu]?.includes(k));
export const resetBarOrder = (menu: string) => {
  const { [menu]: _, ...rest } = store.get('bar:order', {});
  store.set('bar:order', rest);
  orderAll(menu);
};
const keepOrder = (all: HTMLElement[]) => {
  const [menu] = all[0].dataset.bo!.split(' ');
  setBarOrder(menu, all.map((el) => el.dataset.bo!.split(' ')[1]));
};
const keepGroups = (all: HTMLElement[], _to: number, groups: HTMLElement[][]) => {
  const box = all[0].parentElement!, o = ORDERS.find((x) => box.closest(x.sel)), bar = o && box.closest(o.sel);
  if (!bar) return keepOrder(all);
  setBarGroups(bar, box, groups.map((g) => g.map((el) => el.dataset.bo!.split(' ')[1])));
};
export function setBarOrder(menu: string, moved: string[]) {
  const order = orderOf(menu);
  const slots = order.map((k, i) => (moved.includes(k) ? i : -1)).filter((i) => i >= 0);
  slots.forEach((s, i) => (order[s] = moved[i]));
  store.set('bar:order', { ...store.get('bar:order', {}), [menu]: order });
  orderAll(menu);
}
const awayTell = (ev: PointerEvent | null) => tell(ev ? document.body : null, { title: 'It moves only along its own bar' });
sortable(document, { item: '[data-bo]:not([hidden], [data-flat])', groups: barSlots, drop: keepGroups, away: awayTell });
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as Element).closest?.<HTMLElement>('[data-bo][data-flat]');
  const menu = el?.dataset.bo!.split(' ')[0], o = ORDERS.find((x) => x.menu === menu && x.flat), bar = o && el!.closest(o.sel);
  if (!el || !bar || e.button !== 0) return;
  const mine = () => [...bar.querySelectorAll<HTMLElement>('[data-bo][data-flat]')].filter((x) => x.dataset.bo!.startsWith(menu + ' ') && x.getClientRects().length).sort((a, b) => +a.style.order - +b.style.order);
  const home = mine(), x0 = e.clientX, y0 = e.clientY;
  let on = false, now = home;
  const put = (seq: HTMLElement[]) => {
    if (seq.every((x, i) => x === now[i])) return;
    const slots = home.map((x) => +x.style.order).sort((a, b) => a - b);
    flipMove(home, () => seq.forEach((x, i) => (x.style.order = String(slots[i]))), el);
    now = seq;
  };
  const out = (ev: PointerEvent) => {
    const r = bar.getBoundingClientRect();
    return ev.clientX < r.left - 24 || ev.clientX > r.right + 24 || ev.clientY < r.top - 24 || ev.clientY > r.bottom + 24;
  };
  let ghost: ReturnType<typeof dragGhost> | null = null;
  const frame = Object.assign(document.createElement('div'), { className: 'dg-grp' });
  const paintFrame = (hot: boolean) => {
    const bs = home.map(layoutBox);
    if (!frame.isConnected) document.body.append(frame);
    frame.classList.toggle('hot', hot);
    Object.assign(frame.style, { left: `${Math.min(...bs.map((b) => b.left))}px`, top: `${Math.min(...bs.map((b) => b.top))}px`, width: `${Math.max(...bs.map((b) => b.right)) - Math.min(...bs.map((b) => b.left))}px`, height: `${Math.max(...bs.map((b) => b.bottom)) - Math.min(...bs.map((b) => b.top))}px` });
  };
  const move = (ev: PointerEvent) => {
    if (!on) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      on = true;
      bar.classList.add('sorting');
      sortBox = bar;
      ghost = dragGhost(el, el.parentElement!, x0, y0);
      el.classList.add('ph', 'dg-ph');
    }
    ghost!.move(ev.clientX, ev.clientY);
    const [gx] = ghost!.centre(ev.clientX, ev.clientY);
    if (out(ev)) {
      bar.classList.add('out');
      awayTell(ev);
      put(home);
      paintFrame(false);
    } else {
      bar.classList.remove('out');
      const rest = home.filter((x) => x !== el), to = rest.filter((x) => { const b = layoutBox(x); return (b.left + b.right) / 2 < gx; }).length;
      put([...rest.slice(0, to), el, ...rest.slice(to)]);
      paintFrame(true);
    }
  };
  const end = (ok: boolean, ev: PointerEvent) => {
    if (!on) return;
    noClick = Date.now() + 300;
    const back = !ok || out(ev);
    frame.remove();
    awayTell(null);
    bar.classList.remove('sorting', 'out');
    if (sortBox === bar) sortBox = null;
    if (back) put(home);
    ghost!.glide(el, () => {
      el.classList.remove('ph', 'dg-ph');
      if (!back && !now.every((x, i) => x === home[i])) keepOrder(now);
    });
  };
  track(e, { move, end, esc: () => true });
});

const BARS: { sel: string; menu: BarMenu; opts: BarOpts }[] = [];
const NOTHING = { title: 'Nothing to hide on this bar', ms: 2500 };
export function barMenu(sel: string, menu: BarMenu, opts: BarOpts = {}) {
  BARS.push({ sel, menu, opts });
  const o = opts.order ?? (typeof menu === 'string' ? menu : '');
  if (!o || ORDERS.some((x) => x.sel === sel)) return;
  ORDERS.push({ sel, menu: o, flat: opts.flat });
  ALL_BARS = ORDERS.map((x) => x.sel).join(',');
  if (ORDERS.length === 1) setTimeout(() => orderAll());
}
document.addEventListener('contextmenu', (e) => {
  if (e.defaultPrevented || !(e.target instanceof Element)) return;
  const text = e.target.closest('input, textarea, select, [contenteditable="true"]');
  for (let el: Element | null = e.target; el && el !== document.documentElement; el = el.parentElement) {
    const b = BARS.findLast((b) => el!.matches(b.sel));
    if (!b) continue;
    const { skip, make, open, at, ...o } = b.opts;
    if (open && !text && !(skip && e.target.closest(skip))) {
      e.preventDefault();
      return open(el as HTMLElement, e);
    }
    const menu = typeof b.menu === 'function' ? b.menu(el as HTMLElement, e) : b.menu;
    if (menu == null || text || (skip && e.target.closest(skip))) return;
    e.preventDefault();
    if (!menu && !ownOf(e.target)) return tell(el, NOTHING);
    return hideMenu(e.clientX, e.clientY, menu, { ...(make ? make(el as HTMLElement, e) : o), ...(at ? { place: at(el as HTMLElement) } : {}), ...(make ? { remake: () => make(el as HTMLElement, e) } : {}) });
  }
  if (!text && ownOf(e.target)) {
    e.preventDefault();
    hideMenu(e.clientX, e.clientY, '');
  }
});

const frames = () => document.documentElement.classList.toggle('no-btn-frame', !pref('btnFrame'));
frames();
onPref('btnFrame', frames);
const accents = () => {
  document.documentElement.classList.toggle('accent-newbtn', !!pref('accentNewBtn'));
  document.documentElement.classList.toggle('accent-lines', !!pref('accentTurnLines'));
};
accents();
onPref('accentNewBtn', accents);
onPref('accentTurnLines', accents);
export const placeClass = (key: string, place: string) => `off-${key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${place}`;
const PLACED = Object.keys(PREFS).filter((k) => PREFS[k].places);
const paintPlaces = () => PLACED.forEach((k) => PREFS[k].places!.forEach((p) => document.documentElement.classList.toggle(placeClass(k, p), !pref(k, p))));
paintPlaces();
PLACED.forEach((k) => onPref(k, paintPlaces));

const SIZES: [number, string, string, string][] = [[4, 'Quarter', 'A quarter of the screen, in the middle.', 'M2 2h6v4H2z'], [2, 'Half', 'Half the screen.', 'M2 2h6v8H2z'], [1, 'Full', 'The whole screen.', 'M2 2h12v8H2z']];
export const sizeButtons = (zoom = !!window.amethyst?.zoomWindow) => SIZES.map(([k, n, t, d]) => `<button class="sz" data-size="${k}" title="${n}&#10;${t}${k === 1 && zoom ? '&#10;&#10;Double-click the bar to do the same, and again to go back.' : ''}" aria-label="${n.toLowerCase()}"><svg viewBox="0 0 16 12" aria-hidden="true"><rect x=".5" y=".5" width="15" height="11" rx="1.5"/><path d="${d}"/></svg></button>`).join('');
export const winX = (inner: string, attrs = '') => `<button class="x" ${attrs}>${inner}</button>`;
export const maxBtn = () => winX('<svg viewBox="0 0 10 10" aria-hidden="true"><rect x=".5" y=".5" width="9" height="9"/></svg>', 'aria-label="maximize"');
export const fwHead = (name: string, ic = '', acts = winX(ICONS.wmin, 'aria-label="minimize"') + winX(ICONS.wx, 'aria-label="close"'), pj = '') => `<div class="fw-head"><span class="qt-name">${ic}<span class="nm">${name}</span>${pj}</span><span class="szs"></span>${acts}</div>`;
export function sizeBar(head: Element, set: (k: number) => void, place: string, os = true): (k: number) => void {
  const box = head.querySelector<HTMLElement>('.szs')!;
  box.dataset.place = place;
  box.innerHTML = sizeButtons();
  box.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-size]');
    if (b) set(+b.dataset.size!);
  });
  const zoom = os ? zoomButton(head) : null;
  const paint = () => ((box.hidden = !pref('winSize', place)), zoom && (zoom.hidden = box.hidden));
  paint();
  onPref('winSize', paint);
  return (k) => box.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.classList.toggle('on', +b.dataset.size! === k));
}
function zoomButton(head: Element): HTMLElement | null {
  if (!window.amethyst?.zoomWindow) return null;
  let z = head.querySelector<HTMLElement>('#pop-max');
  if (!z) {
    const xs = head.querySelectorAll(':scope > button.x');
    const frag = Object.assign(document.createElement('template'), { innerHTML: maxBtn() }).content;
    xs.length ? xs[xs.length - 1].before(frag) : head.append(frag);
    z = head.querySelector<HTMLElement>(':scope > [aria-label="maximize"]')!;
  }
  z.addEventListener('click', () => window.amethyst!.zoomWindow());
  return z;
}
export const sizePlace = (el: Element | null) => el?.querySelector<HTMLElement>('.szs[data-place]')?.dataset.place || 'quick';
barMenu('.fw-head, #winbar', 'size', { at: sizePlace });

export function dragWindow(head: Element, when: ((e: PointerEvent) => unknown) | null = null) {
  if (!window.amethyst?.dragWindow) return;
  if (!when) head.classList.add('mv');
  let onHead = false;
  head.addEventListener('dblclick', () => onHead && window.amethyst!.zoomWindow?.());
  (head as HTMLElement).addEventListener('pointerdown', (e) => {
    onHead = !(e.button !== 0 || (e.target as Element).closest('button,input,select,textarea,a,[contenteditable],[data-rs]') || (when && !when(e)));
    if (!onHead) return;
    const desk = window.amethyst!;
    e.preventDefault();
    desk.dragWindow('start', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    track(e, { capture: head, move: () => desk.dragWindow('move'), end: (ok) => desk.dragWindow(ok ? 'end' : 'cancel') });
  });
}

export const hint = (text: string): string => `<i class="hint" tabindex="0" role="img" aria-label="${esc(text)}"></i>`;
const TIPPED = '.hint,[title],[data-tip]';
const MODS = new Set(['Control', 'Shift', 'Alt', 'Meta']);
const TIP_WAIT = 800, TIP_NOW = 50, TIP_CROSS = 300;
let tipOf: HTMLElement | null = null, tipNext: HTMLElement | null = null, tipWait: ReturnType<typeof setTimeout> | 0 = 0, tipLeave: ReturnType<typeof setTimeout> | 0 = 0;
let tipCap: string | null = null, tipMsg = '';
export function tipTo(el: HTMLElement, text: string) {
  if ((el.dataset.tip ?? el.getAttribute('title') ?? '') === text) return;
  el.removeAttribute('title');
  delete el.dataset.tip;
  if (text) el.title = text;
}
function untitle(el: HTMLElement) {
  if (!el.hasAttribute('title')) return;
  el.dataset.tip = el.title;
  if (!el.textContent!.trim() && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  el.removeAttribute('title');
}
function tipIcon(el: HTMLElement): string {
  const named = el.dataset.tipIcon;
  if (named) return ICONS[named] || icon(named);
  const svg = el.querySelector<SVGSVGElement>('svg.ic') || el.querySelector<SVGSVGElement>('svg');
  if (!svg) {
    const drawn = el.querySelector('i.ic');
    if (drawn) return drawn.outerHTML;
    const g = el.textContent!.trim();
    return g && [...g].length <= 3 && !/[\p{L}\p{N}\s]/u.test(g) ? `<b class="tip-g">${esc(g)}</b>` : '';
  }
  const c = svg.cloneNode(true) as SVGSVGElement, cs = getComputedStyle(svg);
  c.removeAttribute('id');
  c.style.color = 'inherit';
  c.style.fill = cs.fill === 'none' ? 'none' : 'currentColor';
  c.style.stroke = cs.stroke === 'none' ? 'none' : 'currentColor';
  return c.outerHTML;
}
function tipKeys(el: HTMLElement): TipKey[] | null {
  const list = el.dataset.tipKeys;
  if (list == null) return null;
  return list.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
    const at = x.indexOf(':', x.startsWith('fn:') ? 3 : 0), key = (at < 0 ? x : x.slice(0, at)).trim(), what = at < 0 ? '' : x.slice(at + 1).trim();
    if (key.startsWith('=')) return { parts: show(key.slice(1)).split(' '), what };
    const t = keyText(key);
    return { parts: t ? t.split(' ') : [], what, id: key, on: tipCap === key };
  });
}
const tipLive = () => !!tipOf && $('#tip').classList.contains('live');
function menuBox(menu: HTMLElement): Box {
  const u = menu.getBoundingClientRect(), b = { left: u.left, top: u.top, right: u.right, bottom: u.bottom };
  for (const f of menu.querySelectorAll<HTMLElement>('.pk-fly, .sub-fly, [role="menu"]')) {
    if (!f.checkVisibility()) continue;
    const r = f.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    b.left = Math.min(b.left, r.left), b.top = Math.min(b.top, r.top), b.right = Math.max(b.right, r.right), b.bottom = Math.max(b.bottom, r.bottom);
  }
  return b;
}
function tipSpot(r: DOMRect, w: number, h: number, gem: boolean, menu: Box | null): [number, number] {
  const E = 8, G = 8, W = innerWidth, H = innerHeight;
  const cx = (x: number) => Math.max(E, Math.min(x, W - w - E)), cy = (y: number) => Math.max(E, Math.min(y, H - h - E));
  const on = (x: number, y: number, b: Box) => x < b.right && x + w > b.left && y < b.bottom && y + h > b.top;
  const midX = r.left + r.width / 2 - w / 2, midY = r.top + r.height / 2 - h / 2;
  type Way = (b: Box) => [number, number];
  const below: Way = (b) => [cx(midX), b.bottom + G], above: Way = (b) => [cx(midX), b.top - G - h];
  const right: Way = (b) => [b.right + G, cy(midY)], left: Way = (b) => [b.left - G - w, cy(midY)];
  const ways = [...(menu ? [right, left, below, above].map((f) => f(menu)) : []), ...(gem ? [above, below, right, left] : [below, above, right, left]).map((f) => f(r))];
  const fit = ([x, y]: [number, number]) => x >= E && y >= E && x + w <= W - E && y + h <= H - E && !on(x, y, r);
  const spot = ways.find(fit);
  if (spot) return spot;
  const over = ([x, y]: [number, number]) => (menu ? Math.max(0, Math.min(x + w, menu.right) - Math.max(x, menu.left)) * Math.max(0, Math.min(y + h, menu.bottom) - Math.max(y, menu.top)) : 0);
  const held = ways.map(([x, y]): [number, number] => [cx(x), cy(y)]), free = held.filter(([x, y]) => !on(x, y, r));
  return free.length ? free.reduce((a, b) => (over(b) < over(a) ? b : a)) : held[0];
}
function showTip(el: HTMLElement) {
  const t = $('#tip'), gem = el.matches('.hint');
  const out = !gem && document.body.classList.contains('out-mod') && el.dataset.tipOut;
  const text = gem ? el.getAttribute('aria-label') : out || el.dataset.tip;
  if (!text || el.matches('[data-sub], [data-fly]')) return hideTip();
  const cut = el.dataset.tipCut, part = cut == null ? null : cut ? el.querySelector<HTMLElement>(cut) : el;
  if (cut != null && (!part || (part.scrollWidth <= part.clientWidth + 1 && part.scrollHeight <= part.clientHeight + 1))) return hideTip();
  if (tipOf !== el) (tipCap = null), (tipMsg = '');
  const keys = gem || out ? null : tipKeys(el), set = gem || out ? '' : el.dataset.tipSet || '';
  t.innerHTML = tipCard(text, { gem, icon: gem ? '' : tipIcon(el), keys, set, setName: set && (page.settingsName?.(set) || set.split(':')[0]), gear: ICONS.settings, msg: tipMsg });
  t.classList.toggle('live', !!set || !!keys?.some((k) => k.id));
  t.classList.toggle('of-gem', gem);
  t.classList.toggle('mono', !gem && !out && el.hasAttribute('data-tip-mono'));
  t.classList.toggle('wide', !gem && !out && el.hasAttribute('data-tip-wide'));
  t.hidden = false;
  raise(t);
  const menu = !gem && el.closest<HTMLElement>('#colormenu, [role="menu"]'), rail = !gem && !menu && !el.closest('.rf-box') && el.closest<HTMLElement>('#activity');
  const [x, y] = tipSpot(el.getBoundingClientRect(), t.offsetWidth, t.offsetHeight, gem, menu ? menuBox(menu) : rail ? rail.getBoundingClientRect() : null);
  t.style.left = x + 'px';
  t.style.top = y + 'px';
  tipOf = el;
  tipNext = null;
}
export const retip = () => tipOf?.isConnected && showTip(tipOf);
export const untipIn = (box: Element) => (tipOf || tipNext) && box.contains(tipOf || tipNext) && hideTip();
function hideTip() {
  clearTimeout(tipWait);
  clearTimeout(tipLeave);
  const t = $('#tip');
  t.hidden = true;
  t.classList.remove('live');
  tipOf = tipNext = null;
  tipCap = null;
  tipMsg = '';
}
const leaveTip = () => {
  clearTimeout(tipLeave);
  tipLeave = setTimeout(() => !tipCap && hideTip(), TIP_CROSS);
};
const held = () => (sortBox?.isConnected && sortBox.classList.contains('sorting')) || document.body.classList.contains('resizing-x') || document.body.classList.contains('resizing-y');
document.addEventListener('mouseover', (e) => {
  const at = e.target as HTMLElement;
  if (tipOf && at.closest?.('#tip')) return void clearTimeout(tipLeave);
  const el = at.closest?.<HTMLElement>(TIPPED);
  if (el && el === tipOf) return void clearTimeout(tipLeave);
  if (!el || el === tipNext || held() || tipCap) return;
  untitle(el);
  hideTip();
  if (el.matches('.hint')) return showTip(el);
  tipNext = el;
  tipWait = setTimeout(() => tipNext === el && el.isConnected && showTip(el), el.hasAttribute('data-tip-now') ? TIP_NOW : TIP_WAIT);
});
document.addEventListener('mouseout', (e) => {
  const t = $('#tip'), to = e.relatedTarget as Node | null;
  if (tipOf && t.contains(e.target as Node)) {
    if (!to || !(t.contains(to) || tipOf.contains(to))) leaveTip();
    return;
  }
  const cur = tipOf || tipNext;
  if (!cur || (e.target as HTMLElement).closest?.(TIPPED) !== cur || cur.contains(to) || (cur.matches('.hint') && document.activeElement === cur)) return;
  if (tipLive()) return void (to && t.contains(to) ? clearTimeout(tipLeave) : leaveTip());
  hideTip();
});
document.addEventListener('focusin', (e) => (e.target as HTMLElement).matches?.('.hint') && showTip(e.target as HTMLElement));
document.addEventListener('focusout', (e) => e.target === tipOf && hideTip());
document.addEventListener('scroll', (e) => (tipOf || tipNext) && !$('#tip').contains(e.target as Node) && hideTip(), true);
for (const ev of ['pointerdown', 'mousedown', 'keydown']) document.addEventListener(ev, (e) => (tipOf || tipNext) && !(e.type !== 'keydown' && $('#tip').contains(e.target as Node)) && !(e.type === 'keydown' && (tipCap || tipOf?.matches('.hint') || MODS.has((e as KeyboardEvent).key))) && hideTip(), true);
addEventListener('blur', () => hideTip());
addEventListener(
  'keydown',
  (e) => {
    if (e.key !== 'Escape' || !(tipCap || tipLive())) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!tipCap) return hideTip();
    tipCap = null;
    tipMsg = '';
    retip();
  },
  true,
);
document.addEventListener(
  'keydown',
  (e) => {
    if (!tipCap) return;
    e.stopPropagation();
    e.preventDefault();
    const r = pressKey(tipCap, e);
    if (!r) return;
    tipMsg = r.msg;
    if (r.done) tipCap = null;
    retip();
  },
  true,
);
onTwice(null, () => {
  const said = tipCap && pressTwice(tipCap);
  if (!said) return;
  tipMsg = said;
  tipCap = null;
  retip();
});
document.addEventListener('keys-changed', () => tipOf && !tipCap && retip());
document.addEventListener('click', (e) => {
  const t = $('#tip'), at = e.target as HTMLElement;
  if (!tipOf || !t.contains(at)) return;
  const go = at.closest<HTMLElement>('[data-tip-go]'), key = at.closest<HTMLElement>('[data-tip-bind]');
  if (go) {
    hideTip();
    return page.openSettingsAt?.(go.dataset.tipGo!);
  }
  if (!key) return;
  tipCap = key.dataset.tipBind!;
  tipMsg = CAPTURE_NOTE;
  retip();
});
new MutationObserver((list) => {
  for (const m of list) {
    if (!(m.target as Element).hasAttribute('title')) continue;
    untitle(m.target as HTMLElement);
    if (m.target === tipOf) showTip(tipOf);
  }
}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['title'] });

export function ask({ title, text = '', warn = '', safe = '', value = '', placeholder = '', confirm = false, choices = null, pick = null, tick = null, tick2 = null, label = '', about = '', folder = null, blank = false, list = null, checks = null, ticks = null, menu = null, end = null, main = null }: AskOpts) {
  return new Promise<any>((resolve) => {
    const m = $('#modal');
    const inp = m.querySelector('input');
    const row = m.querySelector('.row');
    const plain = row.innerHTML;
    const top = () => Math.max(0, choices?.findIndex((c) => c.main) ?? 0);
    const back = document.activeElement as HTMLElement;
    const added: Element[] = [];
    let tks: HTMLInputElement[] = [];
    const mb = (): HTMLButtonElement | null => row.querySelector('[data-mn]') || (tks.length && !menu ? row.querySelector('[data-ok]') : null);
    const said = () => tks.filter((x) => x.checked).map((x) => x.dataset.tk!);
    const sayIt = (s: string) => (m.querySelector('p').innerHTML = esc(s).replace(/\*(.+?)\*/g, '<b>$1</b>'));
    const reTick = () => {
      const n = said().length, b = mb(), mm = row.querySelector('[data-main]');
      if (b) b.disabled = !!tks.length && !n;
      if (mm) mm.disabled = !!tks.length && !n;
      if (ticks?.say) sayIt(ticks.say(n, tks.length, said()));
    };
    const tickOne = (id: string, on: boolean) => tks.forEach((x) => x.dataset.tk === id && (x.checked = on));
    const onTick = (e: Event) => {
      const x = e.target as HTMLInputElement;
      if (x.dataset?.tk) ticks?.change?.(x.dataset.tk, x.checked, tickOne);
      reTick();
    };
    if (ticks?.items.length && (menu || choices)) {
      row.insertAdjacentHTML('beforebegin', `<div class="m-ticks">${ticks.items.map((x) => `<label class="tick m-tk"><input type="checkbox" data-tk="${esc(x.id)}"${x.off ? '' : ' checked'}>${x.html}</label>`).join('')}</div>`);
      added.push(row.previousElementSibling);
      tks = [...row.previousElementSibling.querySelectorAll('[data-tk]')];
      row.previousElementSibling.addEventListener('change', onTick);
    }
    if (menu) {
      confirm = true;
      row.innerHTML = `<button data-cancel>cancel</button>${end ? `<button class="m-end" data-end>${esc(end.label)}</button>` : ''}<button class="${main ? '' : 'primary '}m-mn" data-mn aria-haspopup="menu">${esc(menu.label)}<span class="m-chev">▾</span></button>${main ? `<button class="primary m-main" data-main><kbd>enter</kbd>${esc(main.label)}</button>` : ''}`;
    }
    let box: HTMLInputElement | null = null, box2: HTMLInputElement | null = null;
    if (tick) {
      confirm = true;
      row.insertAdjacentHTML('beforebegin', `<label class="tick"><input type="checkbox"> ${esc(tick)}</label>`);
      added.push(row.previousElementSibling);
      box = row.previousElementSibling.firstElementChild;
      if (tick2) {
        row.insertAdjacentHTML('beforebegin', `<label class="tick"><input type="checkbox"> ${esc(tick2)}</label>`);
        added.push(row.previousElementSibling);
        box2 = row.previousElementSibling.firstElementChild;
        box!.addEventListener('change', () => box!.checked && (box2!.checked = false));
        box2!.addEventListener('change', () => box2!.checked && (box!.checked = false));
      }
    }
    if (choices) {
      confirm = true;
      row.innerHTML = `<button data-cancel><kbd>esc</kbd>cancel</button>` + choices.map((c, i) => `<button data-choice="${i}" ${i === top() ? 'data-ok class="primary"' : ''}>${i === top() ? '<kbd>enter</kbd>' : ''}${esc(c.label)}</button>`).join('');
    }
    let ticked: (() => string[]) | null = null;
    if (checks) {
      confirm = true;
      const groups = [...new Set(checks.items.map((x) => x.group))], many = groups.length > 1;
      const item = (x: AskCheck) => `<label class="mc-it"${x.busy ? ` title="${esc(x.busy)}"` : ''}><input type="checkbox" data-mc="${esc(x.id)}"${x.on ? ' checked' : ''}>${x.mark || ''}<span>${esc(x.name)}</span>${x.busy ? '<b class="mc-busy">•</b>' : ''}</label>`;
      const rows = groups.map((g) => `<div class="mc-grp">${many ? `<button type="button" class="mc-g" data-mc-g="${esc(g)}">${esc(g)}</button>` : ''}<span class="mc-items">${checks.items.filter((x) => x.group === g).map(item).join('')}</span></div>`).join('');
      row.insertAdjacentHTML('beforebegin', `<div class="m-checks${checks.rows ? ' mc-rows' : ''}"><div class="mc-top"><label class="tick"><input type="checkbox" data-mc-all> ${esc(checks.label)}</label><button type="button" class="mc-fold" data-mc-fold></button></div><div class="mc-list"${checks.open ? '' : ' hidden'}>${rows}</div></div>`);
      const el = row.previousElementSibling, all = el.querySelector('[data-mc-all]'), fold = el.querySelector('[data-mc-fold]'), panel = el.querySelector('.mc-list');
      const items = [...el.querySelectorAll('[data-mc]')];
      added.push(el);
      ticked = () => items.filter((x) => x.checked).map((x) => x.dataset.mc as string);
      const paint = () => {
        const n = ticked!().length;
        all.checked = n > 0;
        all.indeterminate = n > 0 && n < items.length;
        fold.textContent = `${panel.hidden && !n ? 'choose' : n === items.length ? 'all' : n ? `${n} of ${items.length}` : 'none'} ${panel.hidden ? '▸' : '▾'}`;
      };
      const set = (xs: HTMLInputElement[], on: boolean) => xs.forEach((x) => (x.checked = on));
      all.addEventListener('change', () => (set(items, all.checked), paint()));
      el.addEventListener('change', (e: Event) => (e.target as Element).matches('[data-mc]') && paint());
      el.addEventListener('click', (e: MouseEvent) => {
        if ((e.target as Element).closest('[data-mc-fold]')) {
          panel.hidden = !panel.hidden;
          if (!panel.hidden && !ticked!().length) set(items, true);
          return paint();
        }
        const g = (e.target as Element).closest('[data-mc-g]');
        if (!g) return;
        const mine = [...g.parentElement!.querySelectorAll<HTMLInputElement>('[data-mc]')];
        set(mine, !mine.every((x) => x.checked));
        paint();
      });
      paint();
    }
    if (label) {
      inp.insertAdjacentHTML('beforebegin', `<span class="m-lbl">${esc(label)}${about ? hint(about) : ''}</span>`);
      added.push(inp.previousElementSibling);
    }
    let path: HTMLInputElement | null = null, note: HTMLElement | null = null, own = false;
    const follow = () => {
      if (!own) path!.value = folder!.follow(inp.value.trim());
      if (document.activeElement !== path) path!.scrollLeft = path!.scrollWidth;
      note!.textContent = folder!.note?.(path!.value.trim()) || '';
    };
    if (folder) {
      inp.insertAdjacentHTML('afterend', `<div class="m-folder"><span class="m-lbl">folder${folder.about ? hint(folder.about) : ''}</span><div class="m-frow"><input class="m-path" autocomplete="off" spellcheck="false">${folder.pick ? '<button class="outline" data-browse>browse…</button>' : ''}</div><span class="m-note"></span></div>`);
      const fd = inp.nextElementSibling;
      added.push(fd);
      path = fd.querySelector('.m-path') as HTMLInputElement;
      note = fd.querySelector('.m-note');
      row.querySelector('[data-ok]').innerHTML = '<kbd>enter</kbd>create';
      path.addEventListener('input', () => {
        own = true;
        follow();
      });
      inp.addEventListener('input', follow);
    }
    m.querySelector('.bt').textContent = title;
    sayIt(text);
    if (menu || tks.length) reTick();
    if (warn) {
      m.querySelector('p').insertAdjacentHTML('afterend', `<p class="m-warn">${esc(warn)}</p>`);
      added.push(m.querySelector('.m-warn'));
    }
    if (safe) {
      m.querySelector('p').insertAdjacentHTML('afterend', `<p class="m-safe">${esc(safe)}</p>`);
      added.push(m.querySelector('.m-safe'));
    }
    const lines = (list || []).filter((l) => l.names.length);
    if (lines.length) {
      m.querySelector('p').insertAdjacentHTML('afterend', `<div class="m-list">${lines.map((l) => `<div class="m-li"><i aria-label="${esc(l.kind)}s">${gem(l.kind)}</i><span>${l.names.map(esc).join(', ')}</span></div>`).join('')}</div>`);
      added.push(m.querySelector('.m-list'));
    }
    inp.hidden = confirm;
    inp.value = value;
    inp.placeholder = placeholder;
    m.hidden = false;
    if (folder) follow();
    const para = m.querySelector('p') as HTMLElement;
    if (ticks?.say && tks.length) {
      const ids = tks.map((x) => x.dataset.tk!), now = para.innerHTML;
      let h = 0;
      for (const on of [ids, ids.slice(1), []]) {
        sayIt(ticks.say(on.length, ids.length, on));
        h = Math.max(h, para.offsetHeight);
      }
      para.innerHTML = now;
      para.style.minHeight = h + 'px';
    }
    let over = false;
    const opened = performance.now();
    const done = (v: unknown) => {
      over = true;
      m.hidden = true;
      row.innerHTML = plain;
      for (const el of added) el.remove();
      para.style.minHeight = '';
      if (folder) inp.removeEventListener('input', follow);
      hideTip();
      document.removeEventListener('keydown', onKey, true);
      m.removeEventListener('click', onClick);
      m.removeEventListener('wheel', onWheel);
      if (back?.isConnected) back.focus();
      resolve(v);
    };
    const made = () => {
      const name = inp.value.trim(), at = path!.value.trim();
      if (!name && !own) return inp.focus();
      if (!at) return path!.focus();
      done({ name, path: at });
    };
    const browse = async () => {
      const r = await folder!.pick!(path!.value.trim());
      if (!r || m.hidden) return;
      path!.value = r;
      own = true;
      if (!inp.value.trim()) inp.value = r.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
      follow();
      inp.focus();
    };
    const chose = (v: unknown) => (tks.length && !said().length ? undefined : done(ticked ? { value: v, ticked: ticked() } : tks.length ? { value: v, ticked: said() } : box ? { value: v, tick: box.checked, ...(box2 && { tick2: box2.checked }) } : v));
    const ok = () => (folder ? made() : choices ? chose(choices[top()].value) : done(box ? { tick: box.checked } : confirm ? true : inp.value.trim() || (blank ? '' : null)));
    const cancel = () => done(choices || box || menu ? null : confirm ? false : null);
    const openMenu = () => {
      const b = mb();
      if (!b || b.disabled) return;
      menu!.open(b, (v) => !over && done({ value: v, ticked: said() }), said());
      const cm = $('#colormenu');
      cm.addEventListener('menuclose', () => (shut = performance.now()), { once: true });
      (cm.querySelector('.set-rows button.mi:not(:disabled)') as HTMLElement | null)?.focus();
    };
    let shut = 0;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element).closest?.('#colormenu')) return;
      if (menu && e.key !== 'Escape') {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          ((e.target as HTMLElement).closest?.<HTMLElement>('#modal button') || (main ? (row.querySelector('[data-main]') as HTMLElement) : null))?.click();
        }
        return;
      }
      if (box && e.key === ' ' && e.target !== box && e.target !== box2) {
        e.preventDefault();
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change'));
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        e.key === 'Escape' ? cancel() : (e.target as Element).matches?.('[data-browse]') ? browse() : ok();
      }
    };
    const onClick = (e: MouseEvent) => {
      const c = (e.target as Element).closest<HTMLElement>('[data-choice]');
      if ((e.target as Element).closest('[data-mn]')) openMenu();
      else if ((e.target as Element).closest('[data-end]')) done({ value: end!.value, ticked: said() });
      else if ((e.target as Element).closest('[data-main]')) !(e.target as Element).closest<HTMLButtonElement>('[data-main]')!.disabled && done({ value: main!.value, ticked: said() });
      else if (c) chose(choices![+c.dataset.choice!].value);
      else if ((e.target as Element).closest('[data-browse]')) browse();
      else if ((e.target as Element).closest('[data-ok]')) ok();
      else if ((e.target as Element).closest('[data-cancel]') || (e.target === m && performance.now() - shut > 500 && performance.now() - opened > 400)) cancel();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.target !== m) return;
      m.style.pointerEvents = 'none';
      let el = document.elementFromPoint(e.clientX, e.clientY);
      m.style.pointerEvents = '';
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      for (; el; el = el.parentElement) {
        const { overflowY, overflowX } = getComputedStyle(el);
        const y = /auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight && e.deltaY;
        const x = /auto|scroll/.test(overflowX) && el.scrollWidth > el.clientWidth && e.deltaX;
        if (y || x) return el.scrollBy(x ? e.deltaX * k : 0, y ? e.deltaY * k : 0);
      }
    };
    document.addEventListener('keydown', onKey, true);
    m.addEventListener('click', onClick);
    m.addEventListener('wheel', onWheel, { passive: true });
    setTimeout(() => {
      if (over) return;
      (menu ? (main && m.querySelector('[data-main]')) || mb() || m.querySelector('[data-cancel]') : confirm ? m.querySelector('[data-ok]') : inp).focus();
      if (pick && !confirm) inp.setSelectionRange(...pick);
    }, 0);
  });
}

let hovered: Element | null = null;
const hoverCard = () => {
  let c = $('#img-hover');
  if (!c) {
    c = document.createElement('div');
    c.id = 'img-hover';
    c.innerHTML = '<img alt=""><code></code>';
    document.body.append(c);
  }
  return c;
};
export function imgHover(el: Element | null, url?: string, rel?: string) {
  if (el === hovered) return;
  hovered = el;
  const c = hoverCard();
  c.hidden = !el;
  if (!el) return;
  c.querySelector('img').src = url;
  c.querySelector('code').textContent = rel;
  const r = el.getBoundingClientRect(), up = r.top > innerHeight / 2;
  c.style.left = Math.max(8, Math.min(r.left, innerWidth - 330)) + 'px';
  c.style.top = up ? 'auto' : r.bottom + 6 + 'px';
  c.style.bottom = up ? innerHeight - r.top + 6 + 'px' : 'auto';
}
addEventListener('keydown', () => imgHover(null), true);

export async function copyPicture(src: string, link?: string | null) {
  const png = (async () => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.convertToBlob({ type: 'image/png' });
  })();
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, ...(link ? { 'text/plain': new Blob([link], { type: 'text/plain' }) } : {}) })]);
  } catch (e) {
    if (!link) throw e;
    await navigator.clipboard.writeText(link);
  }
}

const COPY_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 3.8V3.5a1.6 1.6 0 0 0-1.6-1.6H3.5A1.6 1.6 0 0 0 1.9 3.5v5.4a1.6 1.6 0 0 0 1.6 1.6h.3"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 5"/></svg>';

export function viewImage(src: string, link?: string | null, open?: Record<string, () => unknown>) {
  const back = document.activeElement as HTMLElement;
  const v = document.createElement('div');
  v.className = 'img-view';
  v.tabIndex = -1;
  v.innerHTML = `<img src="${esc(src)}" alt=""><button type="button" class="img-view-copy" aria-label="copy the image">${COPY_SVG}</button>${open ? `<div class="img-view-open"><button type="button" data-o="tab">open in a tab</button><button type="button" data-o="out">show in ${fileManager()}</button></div>` : ''}`;
  const btn = v.querySelector('.img-view-copy') as HTMLButtonElement & { back?: ReturnType<typeof setTimeout> };
  const doCopy = async () => {
    try {
      await copyPicture(src, link);
      btn.innerHTML = CHECK_SVG;
      btn.removeAttribute('title');
    } catch {
      btn.title = 'Could not copy\nThe image did not reach the clipboard. Click to try again.';
    }
    clearTimeout(btn.back);
    btn.back = setTimeout(() => {
      btn.innerHTML = COPY_SVG;
      btn.removeAttribute('title');
    }, 1200);
  };
  const close = () => {
    v.remove();
    back?.focus?.();
  };
  const img = v.querySelector('img')!;
  let s = 1, x = 0, y = 0, dragged = false;
  const apply = () => {
    const w = img.clientWidth * s / 2, h = img.clientHeight * s / 2;
    x = Math.max(-w, Math.min(w, x));
    y = Math.max(-h, Math.min(h, y));
    img.style.transform = s === 1 ? '' : `translate(${x}px, ${y}px) scale(${s})`;
    img.style.imageRendering = img.naturalWidth && s * img.clientWidth / img.naturalWidth >= 2 ? 'pixelated' : '';
    v.classList.toggle('zoomed', s > 1);
  };
  const zoomTo = (k: number, px = 0, py = 0) => {
    const max = Math.max(8, img.naturalWidth ? 32 * img.naturalWidth / img.clientWidth : 8), to = Math.max(1, Math.min(max, s * k));
    x = to === 1 ? 0 : px - (px - x) * to / s;
    y = to === 1 ? 0 : py - (py - y) * to / s;
    s = to;
    apply();
  };
  v.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    zoomTo(Math.exp(-Math.sign(d) * Math.min(Math.abs(d) * (e.ctrlKey ? 0.01 : 0.0015), 0.5)), e.clientX - innerWidth / 2, e.clientY - innerHeight / 2);
  }, { passive: false });
  img.addEventListener('pointerdown', (e) => {
    dragged = false;
    if (e.button !== 0 || s === 1) return;
    let lx = e.clientX, ly = e.clientY, from = [lx, ly];
    v.classList.add('moving');
    track(e, {
      capture: img,
      move: (m) => {
        if (Math.hypot(m.clientX - from[0], m.clientY - from[1]) > 4) dragged = true;
        x += m.clientX - lx;
        y += m.clientY - ly;
        lx = m.clientX;
        ly = m.clientY;
        apply();
      },
      end: () => v.classList.remove('moving'),
    });
  });
  v.addEventListener('click', (e) => {
    if (dragged) return void (dragged = false);
    const o = (e.target as Element).closest<HTMLElement>('[data-o]');
    if (o) return close(), open![o.dataset.o!]();
    (e.target as Element).closest('button') ? doCopy() : close();
  });
  img.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = (k: string, ic: string, label: string, tip: string) => `<button class="mi" data-k="${k}" title="${label}&#10;${tip}"><i class="tb-ic">${ic}</i><span class="mi-n">${label}</span></button>`;
    const url = new URL(src, location.href), path = url.searchParams.get('path') || '', name = path.split(/[\/]/).pop() || 'picture';
    const html = menuHead(icon('image'), name) + bands({ actions: row('copy', icon('copy'), 'copy image', 'Copies the picture to paste elsewhere.') + (open ? '<div class="sep"></div>' + row('tab', icon('file'), 'open in a tab', 'Opens the picture as a tab of its own.') + row('out', icon('folder'), `show in ${fileManager()}`, 'Opens the folder that holds the picture, with the picture selected.') : '') });
    popMenu(e.clientX, e.clientY, html, (b) => {
      if (b.dataset.k === 'copy') return doCopy();
      close();
      open?.[b.dataset.k!]?.();
    });
  });
  v.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === '+' || k === '=') zoomTo(1.25);
    else if (k === '-') zoomTo(0.8);
    else if (k === '0') zoomTo(1 / s);
    else if (k !== 'Escape') return;
    e.stopPropagation();
    e.preventDefault();
    if (k === 'Escape') close();
  });
  document.body.append(v);
  v.focus();
}

let noClick = 0;
window.addEventListener('click', (e) => Date.now() < noClick && (e.stopPropagation(), e.preventDefault()), true);
export const sorting = (box: Element): boolean => box.classList.contains('sorting');
type Box = { left: number; top: number; right: number; bottom: number };
export const layoutBox = (t: HTMLElement): Box => {
  const o = t.offsetParent as HTMLElement | null, own = !!o && o !== document.body;
  const r = own ? o!.getBoundingClientRect() : { left: -scrollX, top: -scrollY };
  const x = r.left + (own ? o!.clientLeft - o!.scrollLeft : 0) + t.offsetLeft, y = r.top + (own ? o!.clientTop - o!.scrollTop : 0) + t.offsetTop;
  return { left: x, top: y, right: x + t.offsetWidth, bottom: y + t.offsetHeight };
};
export function flipMove(els: HTMLElement[], change: () => void, skip?: HTMLElement) {
  const before = new Map(els.map((t) => [t, t.getBoundingClientRect()]));
  change();
  for (const t of els) {
    if (t === skip || !t.isConnected) continue;
    t.style.transition = 'none';
    t.style.transform = '';
    const a = before.get(t)!, b = t.getBoundingClientRect();
    if (a.left === b.left && a.top === b.top) continue;
    t.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px)`;
    void t.offsetWidth;
    t.style.transition = 'transform 160ms ease';
    t.style.transform = '';
    setTimeout(() => t.style.transform || (t.style.transition = ''), 200);
  }
}
export function dragGhost(el: HTMLElement, box: Element, x0: number, y0: number) {
  const r = el.getBoundingClientRect(), dx = x0 - r.left, dy = y0 - r.top;
  const ghost = el.cloneNode(true) as HTMLElement;
  for (const n of [ghost, ...ghost.querySelectorAll('*')]) for (const { name } of [...n.attributes]) if (name.startsWith('data-') || name === 'id' || name === 'title') n.removeAttribute(name);
  ghost.classList.add('pj-ghost');
  ghost.classList.remove('ph', 'dg-ph');
  Object.assign(ghost.style, { position: 'fixed', left: '0px', top: '0px', width: `${r.width}px`, height: `${r.height}px`, transform: '', transition: 'none', order: '' });
  box.append(ghost);
  const g = ghost.getBoundingClientRect(), bx = g.left, by = g.top;
  const to = (x: number, y: number) => Object.assign(ghost.style, { left: `${x - bx}px`, top: `${y - by}px` });
  to(r.left, r.top);
  return {
    el: ghost,
    move: (x: number, y: number) => to(x - dx, y - dy),
    centre: (x: number, y: number) => [x - dx + r.width / 2, y - dy + r.height / 2],
    glide(target: HTMLElement, done: () => void) {
      if (!target.isConnected || !ghost.isConnected) return ghost.remove(), done();
      const t = layoutBox(target);
      ghost.style.transition = 'left 140ms ease, top 140ms ease';
      to(t.left, t.top);
      setTimeout(() => (ghost.remove(), done()), 150);
    },
  };
}
type Shape = 'row' | 'col' | 'grid';
function shapeOf(all: HTMLElement[]): Shape {
  if (all.length < 2) return 'row';
  const bs = all.map(layoutBox), a = bs[0];
  if (bs.every((b) => b.left < a.right && a.left < b.right) && bs.some((b) => b.top >= a.bottom)) return 'col';
  return bs.some((b) => b.top >= a.bottom || b.bottom <= a.top) ? 'grid' : 'row';
}
const docOrder = (a: Element | null, b: Element | null) => (a === b ? 0 : !a ? -1 : !b ? 1 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
export function sortable(root: HTMLElement | Document, { item, skip, grip, groups: groupsFor, drop, away, moved: onMove }: { item: string; end?: string; skip?: string; grip?: string; lift?: boolean; line?: boolean; moved?: (el: HTMLElement, all: HTMLElement[], state: 'in' | 'out' | 'end') => void; groups?: (box: Element) => (Element | null)[] | null; drop: (all: any[], to: number, groups: any[][]) => void; away?: (ev: PointerEvent | null) => void }) {
  (root as HTMLElement).addEventListener('pointerdown', (e) => {
    const el = (e.target as Element).closest?.<HTMLElement>(item);
    if (!el || e.button !== 0 || (skip && (e.target as Element).closest(skip)) || (grip && !(e.target as Element).closest(grip))) return;
    if (grip) e.preventDefault();
    const box = el.parentNode as HTMLElement;
    const tiles = () => ([...box.children] as HTMLElement[]).filter((t) => t.matches(item) && !t.matches('.pj-ghost') && t.getClientRects().length);
    const isItem = (x: Element) => x.matches(item) || isBo(x);
    const x0 = e.clientX, y0 = e.clientY, homeAt = tiles().indexOf(el);
    let on = false, ghost: ReturnType<typeof dragGhost> | null = null, shape: Shape = 'row', focused: Element | null = null;
    const tellAway = away || ((ev: PointerEvent | null) => tell(ev ? document.body : null, { title: `It moves only ${shape === 'grid' ? 'within its own grid' : shape === 'col' ? 'along its own list' : 'along its own bar'}` }));
    let anchors: (Element | null)[] = [], state: HTMLElement[][] = [], home: HTMLElement[][] = [];
    const drops = new Map<number, HTMLElement>(), frames: HTMLElement[] = [];
    const groupOf = (t: Element) => {
      for (let k = anchors.length - 1; k > 0; k--) if (anchors[k] && anchors[k]!.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) return k;
      return 0;
    };
    const fillDrops = (want: HTMLElement[][]) =>
      want.forEach((g, k) => {
        const d = drops.get(k);
        if (anchors.length > 1 && !g.length) {
          const z = d || document.createElement('span');
          z.className = 'dg-drop';
          drops.set(k, z);
          box.insertBefore(z, anchors[k] ? anchors[k]!.nextSibling : box.firstChild);
        } else if (d) {
          d.remove();
          drops.delete(k);
        }
      });
    const place = (want: HTMLElement[][]) => {
      if (want.every((g, k) => g.length === state[k].length && g.every((t, i) => t === state[k][i]))) return;
      flipMove(tiles(), () => {
        want.forEach((g, k) => {
          let cur: Node | null = anchors[k];
          for (const t of g) {
            const at = cur ? cur.nextSibling : box.firstChild;
            if (at !== t) box.insertBefore(t, at);
            cur = t;
          }
        });
        fillDrops(want);
      }, el);
      state = want.map((g) => [...g]);
    };
    const spanOf = (k: number): Box | null => {
      const bs = [...state[k], ...(drops.has(k) ? [drops.get(k)!] : [])].map(layoutBox);
      if (!bs.length) return null;
      return { left: Math.min(...bs.map((b) => b.left)), top: Math.min(...bs.map((b) => b.top)), right: Math.max(...bs.map((b) => b.right)), bottom: Math.max(...bs.map((b) => b.bottom)) };
    };
    const paintFrames = (hot: number) => {
      anchors.forEach((_, k) => {
        const f = (frames[k] ||= Object.assign(document.createElement('div'), { className: 'dg-grp' }));
        if (!f.isConnected) document.body.append(f);
        const b = spanOf(k);
        f.hidden = !b;
        if (!b) return;
        f.classList.toggle('hot', k === hot);
        Object.assign(f.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.right - b.left}px`, height: `${b.bottom - b.top}px` });
      });
    };
    const outside = (ev: PointerEvent) => {
      const r = box.getBoundingClientRect();
      return ev.clientX < r.left - 24 || ev.clientX > r.right + 24 || ev.clientY < r.top - 24 || ev.clientY > r.bottom + 24;
    };
    const before = (t: HTMLElement, px: number, py: number) => {
      const b = layoutBox(t), cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
      if (shape === 'row') return cx < px;
      if (shape === 'col') return cy < py;
      return b.bottom <= py || (b.top <= py && cx < px);
    };
    const dist = (b: Box, px: number, py: number) => {
      const dx = Math.max(b.left - px, 0, px - b.right), dy = Math.max(b.top - py, 0, py - b.bottom);
      return shape === 'row' ? dx : shape === 'col' ? dy : Math.hypot(dx, dy);
    };
    const move = (ev: PointerEvent) => {
      if (!on) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        on = true;
        const all = tiles();
        shape = shapeOf(all);
        const given = groupsFor?.(box);
        anchors = (given?.length ? [...given] : [...new Set(all.map((t) => wallOf(t, isItem)))]).sort(docOrder);
        state = anchors.map(() => []);
        for (const t of all) state[groupOf(t)].push(t);
        home = state.map((g) => [...g]);
        box.classList.add('sorting');
        sortBox = box;
        focused = document.activeElement;
        ghost = dragGhost(el, box, x0, y0);
        el.classList.add('ph', 'dg-ph');
        if (state.some((g) => !g.length)) flipMove(tiles(), () => fillDrops(state), el);
      }
      ghost!.move(ev.clientX, ev.clientY);
      const out = outside(ev);
      box.classList.toggle('out', out);
      if (out) {
        tellAway(ev);
        place(home);
        paintFrames(-1);
        return onMove?.(el, tiles(), 'out');
      }
      const [px, py] = ghost!.centre(ev.clientX, ev.clientY);
      let best = 0, bd = Infinity;
      state.forEach((_, k) => {
        const b = spanOf(k), d = b ? dist(b, px, py) : Infinity;
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      const want = state.map((g) => g.filter((t) => t !== el));
      want[best].splice(want[best].filter((t) => before(t, px, py)).length, 0, el);
      place(want);
      paintFrames(best);
      onMove?.(el, tiles(), 'in');
    };
    const end = (ok: boolean, ev: PointerEvent) => {
      if (!on) return;
      noClick = Date.now() + 300;
      const out = !ok || outside(ev);
      if (out) place(home);
      for (const d of drops.values()) d.remove();
      for (const f of frames) f.remove();
      tellAway(null);
      box.classList.remove('sorting', 'out');
      if (sortBox === box) sortBox = null;
      const all = tiles(), to = all.indexOf(el);
      onMove?.(el, all, 'end');
      const moved = !out && (to !== homeAt || state.some((g, k) => g.length !== home[k].length)), groups = state.map((g) => [...g]);
      ghost!.glide(el, () => {
        el.classList.remove('ph', 'dg-ph');
        if (focused instanceof HTMLElement && focused.isConnected && (!document.activeElement || document.activeElement === document.body)) focused.focus({ preventScroll: true });
        if (moved) drop(all, to, groups);
      });
    };
    track(e, { move, end, esc: () => true });
  });
}

export function floatBox(box: HTMLElement, { head, when = () => true, min: [mw, mh] = [0, 0], keep = (b) => b, frame, drop }: { head: HTMLElement; when?: (e: PointerEvent & { target: HTMLElement }) => unknown; min?: [number, number]; keep?: (b: Rect) => Rect; frame?: (o: { b: Rect; raw: Rect; edge: string; ev: PointerEvent }) => void; drop?: (b: Rect, o: { raw: Rect; edge: string; moved: boolean; ev: PointerEvent; ok: boolean }) => void }) {
  const start = (e: PointerEvent, edge: string) => {
    if (e.button !== 0 || !when(e as PointerEvent & { target: HTMLElement })) return;
    e.preventDefault();
    const el = e.currentTarget as Element, r = box.getBoundingClientRect(), a: Rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    let moved = false, raw = a, b = a, last = e, raf = 0;
    const put = () => {
      raf = 0;
      if (edge) Object.assign(box.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      else box.style.transform = `translate(${b.x - a.x}px, ${b.y - a.y}px)`;
      frame?.({ b, raw, edge, ev: last });
    };
    const move = (ev: PointerEvent) => {
      last = ev;
      const dx = ev.clientX - e.clientX, dy = ev.clientY - e.clientY;
      if (!(moved ||= Math.hypot(dx, dy) > 3)) return;
      raw = edge ? { ...a } : { ...a, x: a.x + dx, y: a.y + dy };
      if (edge.includes('e')) raw.w = Math.max(mw, a.w + dx);
      if (edge.includes('s')) raw.h = Math.max(mh, a.h + dy);
      if (edge.includes('w')) (raw.w = Math.max(mw, a.w - dx)), (raw.x = a.x + a.w - raw.w);
      if (edge.includes('n')) (raw.h = Math.max(mh, a.h - dy)), (raw.y = a.y + a.h - raw.h);
      b = keep(raw);
      raf ||= requestAnimationFrame(put);
    };
    const noSelect = (ev: Event) => ev.preventDefault();
    document.addEventListener('selectstart', noSelect);
    box.classList.add('moving');
    track(e, {
      capture: el,
      move,
      end(ok, ev) {
        if (ok) last = ev;
        document.removeEventListener('selectstart', noSelect);
        cancelAnimationFrame(raf);
        box.classList.remove('moving');
        box.style.transform = '';
        drop?.(b, { raw, edge, moved, ev: last, ok });
      },
    });
  };
  head.addEventListener('pointerdown', (e) => start(e, ''));
  for (const r of box.querySelectorAll<HTMLElement>('[data-rs]')) r.addEventListener('pointerdown', (e) => start(e, r.dataset.rs!));
}

const SELECT_SCOPE = '.chat, .dk-cell, .dk-rail, aside, .box, #start, #launch';
let scope: Element | null = null, pointerAt: PointerEvent | null = null;
const letGo = () => setTimeout(() => (scope = null), 50);
document.addEventListener(
  'pointerdown',
  (e) => {
    pointerAt = e;
    scope = e.button === 0 && !(e.target as Element).closest?.('input, textarea, select, [contenteditable="true"], .cm-editor, .xterm') ? (e.target as Element).closest?.(SELECT_SCOPE) || null : null;
  },
  true,
);
document.addEventListener('pointermove', (e) => scope && (pointerAt = e), true);
for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, letGo, true);
window.addEventListener('blur', () => (scope = null));
document.addEventListener('selectionchange', () => {
  const s = getSelection()!;
  if (!scope || !s.anchorNode || !scope.contains(s.anchorNode) || scope.contains(s.focusNode)) return;
  const r = document.createRange(), b = scope.getBoundingClientRect();
  r.selectNodeContents(scope);
  const first = pointerAt!.clientY < b.top || (pointerAt!.clientY < b.bottom && pointerAt!.clientX < b.left);
  s.setBaseAndExtent(s.anchorNode, s.anchorOffset, first ? r.startContainer : r.endContainer, first ? 0 : r.endOffset);
});
