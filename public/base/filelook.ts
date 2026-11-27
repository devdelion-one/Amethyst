import { page } from './page.ts';
import { onPref, pref, PREFS, setPref } from './prefs.ts';
import { col } from './theme.ts';
import { esc, setSave, store } from './util.ts';

const KEY = 'files:extColors';
export const EXT_DEFAULTS: Record<string, string> = {
  '.md': '#59c2ff', '.txt': '#d9e0d3', '.ts': '#5c9cf5', '.tsx': '#5c9cf5', '.js': '#e6b450', '.mjs': '#e6b450',
  '.json': '#ff8f40', '.css': '#c39bff', '.scss': '#e08cc0', '.html': '#f07178', '.cpp': '#7aa6da', '.c': '#7aa6da',
  '.h': '#b294bb', '.hpp': '#b294bb', '.cs': '#7fd962', '.py': '#95e6cb', '.sh': '#a6d189', '.ps1': '#6c9ef8',
  '.yml': '#f0a3a3', '.toml': '#f0a3a3', '.png': '#d19a66', '.jpg': '#d19a66', '.svg': '#d19a66',
};
const HEX = /^#[0-9a-f]{6}$/i;
export const cleanExt = (x: string): string => {
  const e = String(x).trim().toLowerCase().replace(/^\*?\.?/, '');
  return /^[a-z0-9_+-]{1,16}$/.test(e) ? '.' + e : '';
};

export function extColors(): Record<string, string> {
  const v = store.get(KEY, null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...EXT_DEFAULTS };
  return Object.fromEntries(Object.entries(v).filter(([e, c]) => cleanExt(e) === e && typeof c === 'string' && HEX.test(c))) as Record<string, string>;
}
const subs: (() => void)[] = [];
export const onExtColors = (fn: () => void) => subs.push(fn);
export function setExtColors(map: Record<string, string> | null) {
  if (map) store.set(KEY, map);
  else store.del(KEY);
  for (const fn of subs) fn();
}
addEventListener('storage', (e) => e.key === 'mind.' + KEY && subs.forEach((fn) => fn()));

export const extOf = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 && i < name.length - 1 ? name.slice(i) : '';
};
const extColor = (name: string): string | null => {
  const c = extColors()[extOf(name).toLowerCase()];
  return c ? col(c) : null;
};

export const nameHtml = (name: string): string => {
  const e = extOf(name);
  if (!e) return esc(name);
  const c = extColor(name);
  return `${esc(name.slice(0, -e.length))}<span class="ext"${c ? ` style="--ec:${esc(c)}"` : ''}>${esc(e)}</span>`;
};
export const fileTint = (_name: string, own?: string | null): string => (own ? `--ic:${esc(own)}` : '');

const svg = (d: string, box = '0 0 16 16') => `<svg class="ol" viewBox="${box}" aria-hidden="true"><path d="${d}"/></svg>`;
const DIR_C = 'M1.75 4.25a1 1 0 0 1 1-1h3.1l1.4 1.4h6a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z';
const DIR_O = 'M1.75 12.25V4.25a1 1 0 0 1 1-1h3.1l1.4 1.4h5a1 1 0 0 1 1 1v1.1M1.75 12.25l1.7-4.6a1 1 0 0 1 .94-.65h9.6a.6.6 0 0 1 .56.8l-1.6 4.3a1 1 0 0 1-.94.65H2.3a.55.55 0 0 1-.55-.5z';
const FILE = 'M4 1.75h5.1l3.15 3.15v8.35a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1zM9 1.9v3.1h3.1';
const BOARD = 'M-.615 -.769L.692 -.769L.385 .308L-.923 .308ZM-.385 -.308L.923 -.308L.615 .769L-.692 .769Z';
export const dirIcon = (open: boolean): string => svg(open ? DIR_O : DIR_C).replace('class="ol"', `class="ol ${open ? 'open' : 'shut'}"`);
export const fileIcon = (board = false): string => (board ? svg(BOARD, '-1.25 -1.25 2.5 2.5') : svg(FILE));

const EXT_INK: Record<string, string> = { plain: 'var(--text)', dim: 'var(--text-faint)', color: 'var(--c-cyan, #59c2ff)' };
const extModes = () => PREFS['explorer:ext'].choices as [string, string, string][];
export const extLabel = (): string => PREFS['explorer:ext'].label;
export const extMenu = (): string => {
  const now = pref('explorer:ext');
  return extModes().map(([v, word, tip]) => `<button class="mi pick chk tb-row${now === v ? ' on' : ''}" data-fext="${v}" title="${esc(`${word}\n${tip}`)}"><i class="tb-ic"><b class="tb-tx" style="font-size:9px;letter-spacing:-.02em;color:${EXT_INK[v]}">.md</b></i><span class="nm">${esc(word)}</span></button>`).join('');
};
export function pickExt(b: HTMLElement): boolean {
  const v = b.dataset.fext;
  if (v) {
    setPref('explorer:ext', v);
    setSave(`${extLabel()}: ${extModes().find(([k]) => k === v)![1]}`);
    return true;
  }
  if (!('fextcol' in b.dataset)) return false;
  store.set('settings:tab', 'files');
  page.openSettings?.();
  setTimeout(() => document.querySelector('[data-hr="f:extcol"]')?.scrollIntoView({ block: 'center' }), 100);
  return true;
}

const mark = () => {
  const r = document.documentElement.dataset;
  r.ext = pref('explorer:ext');
  for (const [p, k] of [['explorer', 'guidesEx'], ['wsx', 'guidesWsx']]) {
    if (pref('explorer:guides', p)) r[k] = '';
    else delete r[k];
  }
};
mark();
onPref('explorer:ext', mark);
onPref('explorer:guides', mark);
