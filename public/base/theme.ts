import { store } from './util.ts';
export const COLORS = [
  { name: 'green', hex: '#7fd962' },
  { name: 'amber', hex: '#e6b450' },
  { name: 'cyan', hex: '#59c2ff' },
  { name: 'violet', hex: '#c39bff' },
  { name: 'red', hex: '#f07178' },
  { name: 'mint', hex: '#95e6cb' },
  { name: 'orange', hex: '#ff8f40' },
  { name: 'white', hex: '#d9e0d3' },
];

export interface Theme {
  label: string;
  light?: boolean;
  ui: { bg: string; text: string; strong: string; dim: string; line: string; accent: string };
  tokens: Record<string, string>;
  palette: string[];
  code?: Record<string, Record<string, unknown>>;
}

export const THEMES: Record<string, Theme> = {
  ink: {
    label: 'ink dark',
    ui: { bg: '#26262a', text: '#e2e2e7', strong: '#ffffff', dim: '#8f8f99', line: '#3a3a40', accent: '#a47dff' },
    tokens: {
      ground: '#141416', bg: '#26262a', chrome: '#1f1f23', bar: '#1f1f23', raised: '#2e2e33', hover: '#323237', line: '#3a3a40',
      text: '#e2e2e7', 'text-strong': '#ffffff', 'text-dim': '#8f8f99', 'text-faint': '#5c5c64',
      accent: '#a47dff', 'on-accent': '#000000', danger: '#ff596b', warn: '#fcc100', ask: '#ff5a64', ok: '#40d868', 'on-ask': '#000000',
      float: '0 0 0 1px #44444a, 0 18px 44px rgb(0 0 0 / .6)',
    },
    palette: ['#40d868', '#fcc100', '#10bfff', '#a47dff', '#ff596b', '#19e3c2', '#fe7802', '#e2e2e7'],
  },
  'ink-light': {
    label: 'ink light',
    light: true,
    ui: { bg: '#f2f2f4', text: '#232327', strong: '#0f0f12', dim: '#686871', line: '#d4d4d9', accent: '#6a22f0' },
    tokens: {
      ground: '#d6d6db', bg: '#f2f2f4', chrome: '#e9e9ec', bar: '#e9e9ec', raised: '#fafafb', hover: '#e1e1e5', line: '#d4d4d9',
      text: '#232327', 'text-strong': '#0f0f12', 'text-dim': '#686871', 'text-faint': '#a0a0a8',
      accent: '#6a22f0', 'on-accent': '#ffffff', danger: '#c8243f', warn: '#a87300', ask: '#d92b38', ok: '#0a8a3a', 'on-ask': '#ffffff',
      float: '0 0 0 1px #c4c4ca, 0 18px 44px rgb(20 20 30 / .22)',
    },
    palette: ['#008e37', '#9b7500', '#0182b0', '#7e4ed7', '#cc2443', '#008976', '#c35b00', '#232327'],
  },
};
THEMES.ash = {
  label: 'ash dark',
  ui: { bg: '#232427', text: '#d4d4d8', strong: '#f2f2f4', dim: '#8c8e94', line: '#44464b', accent: '#9fb0c2' },
  tokens: {
    ground: '#3a3c41', veil: '#18191b', tray: '#131417', bg: '#232427', chrome: '#1d1e21', bar: '#1d1e21', raised: '#2a2b2f', hover: '#2e3034', line: '#44464b',
    text: '#d4d4d8', 'text-strong': '#f2f2f4', 'text-dim': '#8c8e94', 'text-faint': '#5f6166',
    accent: '#9fb0c2', 'on-accent': '#1a1b1d', work: '#78b4c8', danger: '#d97c84', warn: '#d2b469', ask: '#ff5a64', ok: '#86b890', 'on-ask': '#000000', 'done-tint': '#40d868',
    float: '0 0 0 1px #3d3f44, 0 18px 44px rgb(0 0 0 / .55)',
  },
  palette: ['#86b890', '#d2b469', '#78b4c8', '#a99cc8', '#d97c84', '#82c0ae', '#d39a6a', '#d4d4d8'],
};
THEMES['ash-light'] = {
  label: 'ash light',
  light: true,
  ui: { bg: '#e4e5e8', text: '#2e3034', strong: '#141518', dim: '#606369', line: '#c9cbcf', accent: '#4f6378' },
  tokens: {
    ground: '#b5b7bc', bg: '#e4e5e8', chrome: '#dadbdf', bar: '#dadbdf', raised: '#eeeff1', hover: '#d4d5d9', line: '#c9cbcf',
    text: '#2e3034', 'text-strong': '#141518', 'text-dim': '#606369', 'text-faint': '#94979c',
    accent: '#4f6378', 'on-accent': '#ffffff', work: '#2f6d84', danger: '#9c4652', warn: '#7d6216', ask: '#d92b38', ok: '#3f6f48', 'on-ask': '#ffffff',
    float: '0 0 0 1px #a9abb0, 0 18px 44px rgb(20 22 26 / .25)',
  },
  palette: ['#4f7d58', '#86691c', '#38718a', '#675f8f', '#a24d58', '#3c7769', '#975e33', '#2e3034'],
};
THEMES.slate = {
  label: 'slate dark',
  ui: { bg: '#383a3f', text: '#dcdde1', strong: '#f6f6f8', dim: '#979aa1', line: '#4a4d53', accent: '#8e9eb1' },
  tokens: {
    ground: '#26282c', bg: '#383a3f', chrome: '#2f3136', bar: '#2f3136', raised: '#404247', hover: '#424449', line: '#4a4d53',
    text: '#dcdde1', 'text-strong': '#f6f6f8', 'text-dim': '#979aa1', 'text-faint': '#6b6e75',
    accent: '#8e9eb1', 'on-accent': '#26282c', work: '#78afc2', danger: '#d9868f', warn: '#cbae68', ask: '#ff5a64', ok: '#82b38c', 'on-ask': '#000000', 'done-tint': '#40d868',
    float: '0 0 0 1px #52555b, 0 18px 44px rgb(0 0 0 / .45)',
  },
  palette: ['#82b38c', '#cbae68', '#78afc2', '#a99ec8', '#d9868f', '#7fb8a8', '#cf996c', '#dcdde1'],
};
THEMES['slate-light'] = {
  label: 'slate light',
  light: true,
  ui: { bg: '#d3d6db', text: '#1d2025', strong: '#0d0f12', dim: '#4f545b', line: '#bbbfc5', accent: '#3d5b7c' },
  tokens: {
    ground: '#bdc1c7', bg: '#d3d6db', chrome: '#cacdd2', bar: '#cacdd2', raised: '#dcdfe3', hover: '#c5c9ce', line: '#bbbfc5',
    text: '#1d2025', 'text-strong': '#0d0f12', 'text-dim': '#4f545b', 'text-faint': '#7f848b',
    accent: '#3d5b7c', 'on-accent': '#ffffff', work: '#2b6077', danger: '#8a3a45', warn: '#6c5412', ask: '#c8303a', ok: '#355f3e', 'on-ask': '#ffffff',
    float: '0 0 0 1px #a6abb3, 0 18px 44px rgb(15 20 30 / .28)',
  },
  palette: ['#3f6d48', '#735a14', '#2b6077', '#5a5281', '#8f3d49', '#2f6759', '#844f27', '#1d2025'],
};
THEMES.paper = {
  label: 'paper',
  light: true,
  ui: { bg: '#f8f2e5', text: '#27231c', strong: '#110e09', dim: '#72695a', line: '#dcd3bf', accent: '#6a22f0' },
  tokens: {
    ground: '#ddd4c0', bg: '#f8f2e5', chrome: '#f0e9d9', bar: '#f0e9d9', raised: '#fdfaf2', hover: '#e6decc', line: '#dcd3bf',
    text: '#27231c', 'text-strong': '#110e09', 'text-dim': '#72695a', 'text-faint': '#a59d8e',
    accent: '#6a22f0', 'on-accent': '#ffffff', danger: '#c41f3e', warn: '#a36d00', ask: '#d92b38', ok: '#2a7f22', 'on-ask': '#ffffff',
    float: '0 0 0 1px #b8ad96, 0 18px 44px rgb(60 45 20 / .28)',
  },
  palette: ['#2f8a24', '#a87300', '#0079b0', '#7444d8', '#c41f3e', '#00826d', '#c95800', '#27231c'],
};
const LIGHT_GONE = ['clear-quartz', 'prasiolite', 'linen', 'snow', 'memphis', 'lavender-quartz', 'office-80s', 'platinum', 'polaroid'];
const MOVED: Record<string, string> = { ...Object.fromEntries(LIGHT_GONE.map((n) => [n, 'paper'])), 'ink-blue': 'ink', 'paper-blue': 'paper' };

export const ACCENTS = { violet: '#8b5cf6', blue: '#3b82f6', teal: '#14b8a6', green: '#22c55e', amber: '#f59e0b', orange: '#f97316', red: '#ef4444', pink: '#ec4899' };
export const STRENGTHS = [40, 55, 70, 85, 100];

const IDX = new Map(COLORS.map((c, i) => [c.hex.toLowerCase(), i]));
let current = 'ink';
let tokens: Record<string, string> = {};

export const themeName = () => current;
export const theme = () => tokens;

export function col(hex: string): string;
export function col(hex: string | null | undefined): string | null | undefined;
export function col(hex: string | null | undefined): string | null | undefined {
  if (!hex) return hex;
  const i = IDX.get(String(hex).toLowerCase());
  return i == null ? hex : THEMES[current].palette[i];
}

export function mix(a: string, b: string, t: number): string {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

export function contrast(a: string, b: string): number {
  const lum = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const paleOnFlip = (c: string | null | undefined) => !!c && /^#[0-9a-f]{6}$/i.test(c) && contrast(c, THEMES[current].tokens['text-strong']) < 1.5;
export function accentFor(name: string): string {
  const t = THEMES[name], own = t.tokens.accent;
  if (!look.accent && look.strength === 100) return own;
  const pick = look.accent || own, n = parseInt(pick.slice(1), 16);
  const g = Math.round(0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  let c = mix('#' + ((1 << 24) | (g << 16) | (g << 8) | g).toString(16).slice(1), pick, look.strength / 100);
  for (let i = 0; i < 20 && contrast(c, t.tokens.bg) < 4.5; i++) c = mix(c, t.light ? t.ui.strong : '#ffffff', 0.08);
  return c;
}

export function setTheme(name: string): string {
  name = MOVED[name] || name;
  current = THEMES[name] ? name : 'ink';
  const t = THEMES[current], u = t.ui, light = !!t.light;
  const [green, amber, , , red] = t.palette;
  const bg = light ? u.bg : mix(u.bg, u.text, 0.07);
  tokens = {
    bg,
    chrome: light ? mix(bg, u.text, 0.07) : mix(u.bg, bg, 0.5),
    bar: light ? mix(bg, u.text, 0.13) : u.bg,
    text: u.text,
    'text-strong': u.strong,
    'text-dim': u.dim,
    'text-faint': mix(bg, u.dim, 0.62),
    line: u.line,
    hover: mix(bg, u.text, light ? 0.06 : 0.07),
    raised: light ? mix(bg, '#ffffff', 0.6) : mix(bg, u.text, 0.06),
    accent: u.accent,
    'on-accent': light ? '#ffffff' : bg,
    danger: light ? mix(red, u.strong, 0.3) : red,
    warn: light ? mix(amber, u.strong, 0.3) : amber,
    ask: light ? mix('#d92b38', u.strong, 0.15) : '#ff5a64',
    ok: light ? mix(green, u.strong, 0.3) : green,
    ground: light ? mix(bg, u.text, 0.13) : '#000000',
    'on-ask': light ? '#ffffff' : '#000000',
    ...t.tokens,
  };
  const acc = accentFor(current);
  if (acc !== tokens.accent) {
    const dark = light ? u.strong : tokens['on-accent'];
    tokens.accent = acc;
    tokens['on-accent'] = contrast(acc, '#ffffff') >= contrast(acc, dark) ? '#ffffff' : dark;
  }
  tokens.veil ??= tokens.ground;
  tokens.tray ??= tokens.ground;
  tokens.work ??= tokens.accent;
  tokens['done-tint'] ??= tokens.ok;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty('--' + k, v);
  COLORS.forEach((c, i) => root.style.setProperty('--c-' + c.name, t.palette[i]));
  applyCode();
  root.dataset.theme = current;
  root.toggleAttribute('data-light', light);
  root.style.colorScheme = light ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tokens.bar);
  (globalThis as unknown as Window).amethyst?.setGround?.(tokens.ground);
  try {
    store.setText('theme3', current);
  } catch {}
  return current;
}

export function nextTheme(): string {
  const names = Object.keys(THEMES);
  return names[(names.indexOf(current) + 1) % names.length];
}

export const FAR_LOOKS: Record<string, string> = { soft: 'soft squares', glint: 'glint', marks: 'marks' };
let far = 'soft';
export const farLook = () => far;
export function setFarLook(name: string): string {
  far = FAR_LOOKS[name] ? name : 'soft';
  try {
    store.setText('far', far);
  } catch {}
  return far;
}

export const SOLIDS: Record<string, string> = { v1: 'v1 · Solid', v2: 'v2 · Square' };
let solid = 'v1';
export const solidLook = () => solid;
export function setSolid(name: string): string {
  solid = SOLIDS[name] ? name : 'v1';
  document.documentElement.dataset.solid = solid;
  try {
    store.setText('solid', solid);
  } catch {}
  return solid;
}

export const FONTS: Record<string, { label: string; css: string | null }> = {
  app: { label: 'Segoe UI', css: null },
};
export const MONOS: Record<string, { label: string; css: string | null }> = {
  cascadia: { label: 'Cascadia Mono', css: null },
};
export const CODE_SIZES = [12, 13, 14, 16];
export const CHAT_SIZES = [70, 80, 90, 100, 110, 120, 130, 140, 150, 160];
export const BRIGHTS = [70, 75, 80, 85, 90, 95, 100];
export interface Look {
  font: string;
  mono: string;
  size: number;
  chat: number;
  bright: number;
  accent: string;
  strength: number;
}
export const LOOK: Look = { font: 'app', mono: 'cascadia', size: 13, chat: 100, bright: 100, accent: '', strength: 100 };
let look = { ...LOOK };
export const lookOf = (): Look => look;
export function setLook(key: string, value: unknown, keep = true): Look {
  const ok = ({ font: (v) => FONTS[v], mono: (v) => MONOS[v], size: (v) => CODE_SIZES.includes(v), chat: (v) => CHAT_SIZES.includes(v), bright: (v) => BRIGHTS.includes(v), accent: (v) => v === '' || HEX.test(v), strength: (v) => STRENGTHS.includes(v) } as Record<string, (v: any) => unknown>)[key];
  if (!ok?.(value)) return look;
  const was = (look as unknown as Record<string, unknown>)[key];
  look = { ...look, [key]: value };
  if ((key === 'accent' || key === 'strength') && was !== value) setTheme(current);
  const root = document.documentElement.style, font = FONTS[look.font].css, mono = MONOS[look.mono].css;
  for (const [k, v] of [['--font', font], ['--font-display', font], ['--mono', mono], ['--code-size', look.size === LOOK.size ? null : look.size + 'px']] as [string, string | null][]) v ? root.setProperty(k, v) : root.removeProperty(k);
  document.documentElement.dataset.look = `${look.font} ${look.mono} ${look.size} ${look.accent || 'own'} ${look.strength}`;
  root.filter = look.bright === 100 ? '' : `brightness(${look.bright / 100})`;
  if (keep)
    try {
      store.set('look', look);
    } catch {}
  return look;
}

export const CODE_ROLES = [
  { id: 'keyword', label: 'keyword', eg: 'return, if, for', def: ['red'] },
  { id: 'declaration', label: 'declaration keyword', eg: 'class, struct, namespace', def: ['red'] },
  { id: 'modifier', label: 'modifier', eg: 'const, static, virtual', def: ['red'] },
  { id: 'type', label: 'type / class', eg: 'Player, std::string', def: ['amber'] },
  { id: 'builtin', label: 'built-in type', eg: 'int, float, bool', def: ['amber'] },
  { id: 'namespace', label: 'namespace', eg: 'std::, game::', def: ['amber'] },
  { id: 'function', label: 'function', eg: 'update(), obj.draw()', def: ['cyan'] },
  { id: 'member', label: 'member', eg: 'obj.health, this->pos', def: ['violet'] },
  { id: 'variable', label: 'variable', eg: 'x, count', def: ['text'] },
  { id: 'string', label: 'string · char · escape', eg: '"hi", \'a\', \\n', def: ['green'] },
  { id: 'number', label: 'number · bool · null', eg: '42, true, nullptr', def: ['orange'] },
  { id: 'comment', label: 'comment', eg: '// a note', def: ['soft', false, true] },
  { id: 'preproc', label: 'preprocessor', eg: '#include, #define', def: ['mint'] },
  { id: 'macro', label: 'macro', eg: 'MAX_SIZE', def: ['mint'] },
  { id: 'operator', label: 'operator · punctuation', eg: '+ = -> ; { }', def: ['dim'] },
];
export const CODE_LANGS = [
  { id: 'cpp', label: 'C++', exts: ['c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'inl'] },
  { id: 'js', label: 'JavaScript', exts: ['js', 'mjs', 'cjs', 'jsx'] },
];
export const langOf = (name: unknown): string => {
  const ext = String(name).includes('.') ? String(name).split('.').pop()!.toLowerCase() : '';
  return CODE_LANGS.find((l) => l.exts.includes(ext))?.id || '';
};
type CodeStyle = { color?: string; bold?: boolean; italic?: boolean; [k: string]: unknown };
let code: Record<string, Record<string, Record<string, CodeStyle>>> = {};
let presets: Record<string, string> = {};

type PresetRole = [string, boolean?, boolean?];
export const CODE_PRESETS: { id: string; label: string; note: string; roles: Record<string, PresetRole> }[] = [
  { id: '', label: 'Bright', note: "The original: the app's colors at full strength.", roles: {} },
  { id: 'quiet', label: 'Quiet', note: 'Soft lavender keywords and soft blue functions. Types and members stay plain.', roles: { keyword: ['#b3a3e6'], declaration: ['#b3a3e6'], modifier: ['#b3a3e6'], type: ['text'], builtin: ['#b3a3e6'], namespace: ['text'], function: ['#8fb3e0'], member: ['text'], variable: ['text'], string: ['#9cc08c'], number: ['#7db7c2'], comment: ['#80828d'], preproc: ['#8a8d9a'], macro: ['#d4ae7e'], operator: ['#9a9aa6'] } },
  { id: 'classic', label: 'Classic IDE', note: 'Muted orange keywords, gold functions, purple fields. Types stay plain.', roles: { keyword: ['#c98a5e'], declaration: ['#c98a5e'], modifier: ['#c98a5e'], type: ['text'], builtin: ['#c98a5e'], namespace: ['text'], function: ['#dcc07f'], member: ['#b48ec9'], variable: ['text'], string: ['#8fb07c'], number: ['#6f9fc8'], comment: ['#80838e'], preproc: ['#b8a96f'], macro: ['#b8a96f'], operator: ['#a0a0aa'] } },
  { id: 'steel', label: 'Blue steel', note: 'Blue keywords, teal types, pale-yellow functions.', roles: { keyword: ['#6a9fd8'], declaration: ['#6a9fd8'], modifier: ['#6a9fd8'], type: ['#58b4a6'], builtin: ['#6a9fd8'], namespace: ['#58b4a6'], function: ['#d3c58b'], member: ['#92c3e8'], variable: ['#a8cbe6'], string: ['#c9977f'], number: ['#a6c89b'], comment: ['#78907a'], preproc: ['#b588b8'], macro: ['#c29bd0'], operator: ['#a4a8b4'] } },
];
export const codePresetOf = (name: string): string => presets[name] || '';
function fit(c: string, t: Theme, role: string): string {
  const need = role === 'comment' || role === 'operator' ? 3 : 4.5;
  for (let i = 0; i < 30 && contrast(c, t.ui.bg) < need; i++) c = mix(c, t.light ? t.ui.strong : '#ffffff', 0.08);
  return c;
}
function presetRole(name: string, id: string | undefined, role: string): { color: string; bold: boolean; italic: boolean } | null {
  const r = CODE_PRESETS.find((p) => p.id === id)?.roles[role], t = THEMES[name];
  return r && t ? { color: fit(r[0] === 'text' ? t.ui.text : r[0], t, role), bold: !!r[1], italic: !!r[2] } : null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const inks = (t: Theme): Record<string, string> => ({ text: t.ui.text, dim: t.ui.dim, strong: t.ui.strong, soft: t.light ? t.ui.dim : mix(t.ui.bg, t.ui.dim, 0.8) });
function themeRole(name: string, role: string): CodeStyle & { color: string; bold: boolean; italic: boolean } {
  const t = THEMES[name], r = CODE_ROLES.find((x) => x.id === role), [c, bold = false, italic = false] = r!.def as [string, boolean?, boolean?];
  const i = COLORS.findIndex((x) => x.name === c);
  const color = i < 0 ? inks(t)[c] : t.light ? mix(t.palette[i], t.ui.strong, 0.25) : t.palette[i];
  return { color, bold, italic, ...t.code?.[role] };
}
const baseRole = (name: string, role: string): CodeStyle & { color: string; bold: boolean; italic: boolean } => ({ ...themeRole(name, role), ...presetRole(name, presets[name], role) });
export const codePresetColor = (name: string, id: string, role: string): string => (presetRole(name, id, role) || themeRole(name, role)).color;
export function codeRole(name: string, lang: string | null | undefined, role: string): CodeStyle & { color: string; bold: boolean; italic: boolean } {
  const mine = code[name] || {};
  return { ...baseRole(name, role), ...mine.all?.[role], ...(lang && lang !== 'all' ? mine[lang]?.[role] : null) };
}
export const codeChanged = (name: string, lang: string | null | undefined, role: string): CodeStyle => ({ ...code[name]?.[lang || 'all']?.[role] });
export function codeVars(name: string, lang: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const { id } of CODE_ROLES) {
    const r = codeRole(name, lang, id);
    v[`--code-${id}`] = r.color;
    v[`--code-${id}-b`] = r.bold ? '700' : '400';
    v[`--code-${id}-i`] = r.italic ? 'italic' : 'normal';
  }
  return v;
}
function applyCode() {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(codeVars(current, 'all'))) root.style.setProperty(k, v);
  const base = codeVars(current, 'all');
  const css = CODE_LANGS.map((l) => {
    const own = Object.entries(codeVars(current, l.id)).filter(([k, v]) => base[k] !== v);
    return own.length ? `[data-lang="${l.id}"] { ${own.map(([k, v]) => `${k}: ${v};`).join(' ')} }` : '';
  }).join('\n');
  let el = document.getElementById('code-langs');
  if (!el) {
    el = document.createElement('style');
    el.id = 'code-langs';
    document.head.append(el);
  }
  el.textContent = css;
}
function keepCode() {
  try {
    store.set('code', code);
    store.set('codePreset', presets);
  } catch {}
  applyCode();
}
export function setCodePreset(name: string, id: string) {
  if (!THEMES[name] || !CODE_PRESETS.some((p) => p.id === id)) return;
  if (id) presets[name] = id;
  else delete presets[name];
  delete code[name];
  keepCode();
}
export function setCodeRole(name: string, lang: string | null | undefined, role: string, change: CodeStyle) {
  if (!THEMES[name] || !CODE_ROLES.some((r) => r.id === role)) return;
  lang = lang || 'all';
  const below = lang === 'all' ? baseRole(name, role) : codeRole(name, 'all', role);
  const mine: CodeStyle = { ...code[name]?.[lang]?.[role], ...change };
  for (const k of Object.keys(mine)) if (mine[k] === below[k] || mine[k] == null) delete mine[k];
  code[name] ||= {};
  code[name][lang] ||= {};
  if (Object.keys(mine).length) code[name][lang][role] = mine;
  else delete code[name][lang][role];
  keepCode();
}
export function resetCode(name: string, lang: string | null | undefined, role: string | null = null) {
  const lv = code[name]?.[lang || 'all'];
  if (!lv) return;
  if (role) delete lv[role];
  else delete code[name][lang || 'all'];
  keepCode();
}
export function exportCode(name: string, lang: string | null = null): string {
  const levels = lang ? [lang] : ['all', ...CODE_LANGS.map((l) => l.id)];
  const out = { amethyst: 'code colors', theme: name, languages: {} as Record<string, unknown> };
  for (const lv of levels) out.languages[lv] = Object.fromEntries(CODE_ROLES.map(({ id }) => [id, codeRole(name, lv, id)]));
  return JSON.stringify(out, null, 2);
}
export function importCode(name: string, text: string): Record<string, boolean> {
  let f: any;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('not a code colors file (it is not JSON)');
  }
  const levels = Object.keys(f?.languages || {});
  const known = ['all', ...CODE_LANGS.map((l) => l.id)];
  if (f?.amethyst !== 'code colors' || !levels.length || levels.some((l) => !known.includes(l))) throw new Error('not a code colors file');
  for (const l of levels)
    for (const [role, r] of Object.entries<any>(f.languages[l] || {}))
      if (!CODE_ROLES.some((x) => x.id === role) || (r.color != null && !HEX.test(r.color)) || (r.bold != null && typeof r.bold !== 'boolean') || (r.italic != null && typeof r.italic !== 'boolean')) throw new Error(`a broken color: ${l} › ${role}`);
  const changed: Record<string, boolean> = {};
  for (const l of levels.sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : 0))) {
    const before = JSON.stringify(code[name]?.[l] || {});
    for (const [role, r] of Object.entries<any>(f.languages[l])) setCodeRole(name, l, role, { color: r.color?.toLowerCase(), bold: r.bold, italic: r.italic });
    changed[l] = before !== JSON.stringify(code[name]?.[l] || {});
  }
  return changed;
}

let saved: string | null = null, savedLook: any = null;
try {
  saved = store.text('theme3');
  far = FAR_LOOKS[store.text('far')!] ? store.text('far')! : 'soft';
  savedLook = store.get('look', null);
  code = structuredClone(store.get('code', {}) || {});
  code = Object.fromEntries(Object.entries(code).filter(([n]) => THEMES[n]));
  presets = store.get('codePreset', {}) || {};
  presets = Object.fromEntries(Object.entries(presets).filter(([n, id]) => THEMES[n] && id && CODE_PRESETS.some((p) => p.id === id)));
  solid = SOLIDS[store.text('solid')!] ? store.text('solid')! : 'v1';
} catch {}
setTheme(saved as string);
setSolid(solid);
for (const k of Object.keys(LOOK)) setLook(k, savedLook?.[k] ?? (LOOK as unknown as Record<string, unknown>)[k], false);
if ((saved === 'ink-blue' || saved === 'paper-blue') && !look.accent) setLook('accent', ACCENTS.blue);
addEventListener('storage', (e) => {
  if (e.key === 'mind.solid') return void setSolid(e.newValue as string);
  if (e.key !== 'mind.look') return;
  try {
    const v = JSON.parse(e.newValue || 'null');
    for (const k of ['bright', 'accent', 'strength']) setLook(k, v?.[k] ?? (LOOK as unknown as Record<string, unknown>)[k], false);
  } catch {}
});
