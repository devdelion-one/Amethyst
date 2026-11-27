import { colorTray, popMenu, setColorTray, sortable, swatches, trayName } from '../base/controls.ts';
import { page } from '../base/page.ts';
import { ACCENTS, BRIGHTS, CHAT_SIZES, col, COLORS, LOOK, lookOf, setLook, setSolid, solidLook, STRENGTHS, theme as tokens, themeName, THEMES } from '../base/theme.ts';
import { $, esc, setSave } from '../base/util.ts';
import { resetSetColors, setColors, setColorsChanged, setSetColors } from '../decks/deck.ts';
import { useTheme } from './header.ts';
import { winBar } from './setgen.ts';
import { addPart, box, pic, rowHtml, selectRow } from './setstd.ts';
import type { At, Choice, Item, Row } from './setstd.ts';
import { themeCards } from './themecards.ts';

export const LOOK_LEAD = 'The theme, the accent colour, the title bar, brightness, corners and chat text size for every window. Also the colours offered in colour menus, and the colours new editors and terminals get.';

const at = (key: string, place: string): At => ({ key, place, on: () => true });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const and = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || '');
const HEX = /^#[0-9a-f]{6}$/i;
const dot = (c: string) => `<span class="tsw"><i style="background:${esc(c)}"></i></span>`;
const pickOf = (r: Row, id: string, def: string, choices: () => Choice[], get: () => string, set: (v: string) => void): Row => ({
  ...r, pick: { get, set, def, choices, reset: `s:${id}` }, state: () => (choices().find(([v]) => v === get()) || ['', '', ''])[2],
});

function pickHex(from: Element | null, now: string, put: (hex: string) => void) {
  document.querySelector('.lk-pick')?.remove();
  const b = from?.getBoundingClientRect(), i = document.createElement('input');
  i.type = 'color';
  i.value = HEX.test(now) ? now : '#888888';
  i.className = 'lk-pick';
  i.tabIndex = -1;
  i.style.cssText = `position:fixed;left:${b ? b.left : 0}px;top:${b ? b.bottom : 0}px;width:1px;height:1px;opacity:0;pointer-events:none`;
  document.body.append(i);
  i.addEventListener('change', () => (put(i.value.toLowerCase()), i.remove()));
  try {
    i.showPicker();
  } catch {
    i.click();
  }
}
const chipAt = (id: string, v: string) => document.querySelector(`#settings [data-hr-pk="${CSS.escape(`${id}|${v}`)}"]`);

function pickAccent(key: string, v: unknown) {
  setLook(key, v);
  useTheme(themeName());
}

const themeRow = (): Row => ({
  id: 'look:theme', key: 'look:theme', sw: 'none', plain: true, noPic: true, wide: true,
  own: { label: 'Theme', desc: 'It sets the colours of every window. Each theme comes in dark and light, and paper is warm light.', find: Object.values(THEMES).map((t) => t.label).join(' ') },
  at: [at('look:theme', 'lk-theme')],
  state: () => `${cap(THEMES[themeName()].label)} is used.`,
  ctl: () => themeCards('data-set-theme', Object.keys(THEMES)),
  reset: () => useTheme('ink'), changed: () => themeName() !== 'ink',
});

const ACCENT_ANY = 'The colour you picked is used in every theme.';
const accentNow = () => {
  const a = lookOf().accent;
  return !a ? '' : Object.keys(ACCENTS).find((n) => ACCENTS[n as keyof typeof ACCENTS] === a) || 'any';
};
const accentChoices = (): Choice[] => {
  const a = lookOf().accent, any = a && accentNow() === 'any' ? a : '#888888';
  return [
    ['', "Theme's own", "The theme's own accent is used.", dot(tokens().accent)],
    ...Object.entries(ACCENTS).map(([n, h]): Choice => [n, cap(n), `${cap(n)} is used in every theme.`, dot(h)]),
    ['any', 'Any colour', ACCENT_ANY, dot(any)],
  ];
};
const accentRow = (): Row => pickOf({
  id: 'look:accent', key: 'look:accent', plain: true,
  own: { label: 'Accent colour', desc: 'Each theme makes the accent lighter or darker so it stays readable.', find: "accent the color of what's picked and what's working" },
  at: [at('look:accent', 'lk-accent')],
  reset: () => pickAccent('accent', LOOK.accent), changed: () => lookOf().accent !== LOOK.accent,
}, 'look:accent', '', accentChoices, accentNow, (v) => {
  if (v !== 'any') return pickAccent('accent', v ? ACCENTS[v as keyof typeof ACCENTS] : '');
  pickHex(chipAt('look:accent', 'any'), lookOf().accent, (hex) => (pickAccent('accent', hex), setSave(`Accent colour: ${hex}`)));
});

const STRONG: Record<number, string> = { 100: 'The accent is at full strength.', 85: 'The accent is at 85 %, a little closer to grey.', 40: 'The accent is at 40 %, nearly grey.' };
const strengthChoices = (): Choice[] => [...STRENGTHS].sort((a, b) => b - a).map((n) => [String(n), `${n} %`, STRONG[n] || `The accent is at ${n} %, closer to grey.`]);
const strengthRow = (): Row => pickOf({
  id: 'look:strength', key: 'look:strength', plain: true,
  own: { label: 'How strong the accent is', desc: 'Lower takes the accent toward grey in every theme.', find: 'accent strength softens the accent toward grey' },
  at: [at('look:strength', 'lk-accent')],
  reset: () => pickAccent('strength', LOOK.strength), changed: () => lookOf().strength !== LOOK.strength,
}, 'look:strength', String(LOOK.strength), strengthChoices, () => String(lookOf().strength), (v) => pickAccent('strength', Number(v)));

const barNow = () => {
  const w = lookOf().winbar;
  return w === 'accent' ? 'accent' : HEX.test(w) ? 'any' : '';
};
const barChoices = (): Choice[] => {
  const w = lookOf().winbar;
  return [
    ['', 'Grey', 'The title bar is grey, like the other bars.'],
    ['accent', 'Accent tint', 'The title bar is tinted with the accent colour.', dot(tokens().accent)],
    ['any', 'Any colour', 'The title bar is in the colour you picked. Its text turns light or dark to stay readable.', dot(HEX.test(w) ? w : '#888888')],
  ];
};
const barRow = (): Row => pickOf({
  id: 'look:winbar', key: 'look:winbar', plain: true,
  own: { label: 'Title bar colour', desc: "It holds the window's name and its minimize, maximize and close buttons.", find: "title bar the color of the window's top bar" },
  at: [at('look:winbar', 'lk-bar')],
  reset: () => pickAccent('winbar', LOOK.winbar), changed: () => lookOf().winbar !== LOOK.winbar,
}, 'look:winbar', '', barChoices, barNow, (v) => {
  if (v !== 'any') return pickAccent('winbar', v);
  pickHex(chipAt('look:winbar', 'any'), lookOf().winbar, (hex) => (pickAccent('winbar', hex), setSave(`Title bar colour: ${hex}`)));
});

const brightChoices = (): Choice[] => [...BRIGHTS].sort((a, b) => b - a).map((n) => [String(n), `${n} %`, n === 100 ? 'Every window is at full brightness.' : `Every window is dimmed to ${n} %.`]);
const brightRow = (): Row => pickOf({
  id: 'look:bright', key: 'look:bright', plain: true, noPic: true,
  own: { label: 'Brightness of every window', desc: 'It darkens everything Amethyst shows, pictures included.', find: 'brightness dims the whole app, every window' },
  at: [at('look:bright', 'lk-bright')],
  reset: () => void setLook('bright', LOOK.bright), changed: () => lookOf().bright !== LOOK.bright,
}, 'look:bright', String(LOOK.bright), brightChoices, () => String(lookOf().bright), (v) => void setLook('bright', Number(v)));

const CORNERS: Choice[] = [['v1', 'Rounded', 'Corners are rounded.'], ['v2', 'Square', 'Corners are square.']];
const cornersRow = (): Row => pickOf({
  id: 'look:solid', key: 'look:solid', plain: true,
  own: { label: 'Corners', desc: 'It changes buttons, boxes, menus and windows in every part of the app.', find: 'corners the look every part follows' },
  at: [at('look:solid', 'lk-corners')],
  reset: () => void setSolid('v1'), changed: () => solidLook() !== 'v1',
}, 'look:solid', 'v1', () => CORNERS, solidLook, (v) => void setSolid(v));

const KEPT = 'A chat you resized with ctrl and the wheel keeps its own size.';
const chatChoices = (): Choice[] => CHAT_SIZES.map((n) => [String(n), `${n} %`, `Chats show their text at ${n} %. ${KEPT}`]);
const chatRow = (): Row => pickOf({
  id: 'look:chat', key: 'look:chat', plain: true, noPic: true,
  own: { label: 'Text size in chats', desc: 'Ctrl and the mouse wheel change the size of one chat.', find: "text size of new chats a new chat's text, ctrl wheel changes one chat" },
  at: [at('look:chat', 'lk-chat')],
  reset: () => void setLook('chat', LOOK.chat), changed: () => lookOf().chat !== LOOK.chat,
}, 'look:chat', String(LOOK.chat), chatChoices, () => String(lookOf().chat), (v) => void setLook('chat', Number(v)));

const BUILT = new Set(COLORS.map((c) => c.hex));
const missing = () => COLORS.filter((c) => !colorTray().some((t) => t.hex === c.hex));
const saveTray = (list: { hex: string; name?: string }[], msg: string) => (setColorTray(list), page.paintSwitch(), setSave(msg));
const trayState = () => {
  const n = colorTray().length;
  return !n ? 'No colours. Colour menus have none to offer until you add one.' : n === 1 ? '1 colour. It is the only one in every colour menu.' : `${n} colours, in this order. The first one is first in every colour menu, the last one is last.`;
};
function addColor(hex: string) {
  const t = colorTray();
  if (t.some((c) => c.hex === hex)) return (setSave(`${hex} is already in the colour menus`), page.renderSettings());
  saveTray([...t, { hex, name: hex }], `Colours you can pick: ${hex} added`);
  page.renderSettings();
}
const trayItems = (): Item[] => colorTray().map((c) => ({
  id: c.hex, name: c.hex, sub: BUILT.has(c.hex) ? 'Built in' : '', grip: true,
  look: `<input type="color" class="ct-dot" data-ct-color="${esc(c.hex)}" value="${esc(c.hex)}" title="${esc(`${cap(c.name)}\nClick to change this colour.`)}" aria-label="${esc(c.name)} colour">`,
  field: {
    get: () => colorTray().find((x) => x.hex === c.hex)?.name || c.hex, label: `${c.hex} name`,
    set: (v) => void (setColorTray(colorTray().map((x) => (x.hex === c.hex ? { ...x, name: v.trim().slice(0, 40) || x.hex } : x))), page.paintSwitch()),
  },
  remove: { label: `Remove ${c.name}`, tip: `Remove ${c.name}\nWhat's already painted ${c.name} keeps its colour.`, run: () => saveTray(colorTray().filter((x) => x.hex !== c.hex), `Colours you can pick: ${c.name} removed`) },
}));
const trayRow = (): Row => {
  const gone = missing();
  return {
    id: 'look:tray', key: 'look:tray', sw: 'none', plain: true, noPic: true,
    own: { label: 'Colours you can pick', desc: "Drag a colour to change the order. Changing or removing one leaves what's already painted as it is.", find: 'color tray The colors in every color menu: workspaces, projects, files, sets. Something painted keeps its color when you change or remove one here.' },
    at: [at('look:tray', 'lk-tray')],
    state: trayState,
    list: trayItems,
    add: { label: '+ Add a colour', tip: 'Add a colour\nPick a colour to add at the end.', run: (el) => pickHex(el, '#888888', addColor) },
    btn: gone.length ? { label: `Bring back the built-in colours (${gone.length})`, tip: 'Bring back the built-in colours\nThe built-in colours you removed or changed come back at the end. Your own colours stay.', run: () => saveTray([...colorTray(), ...missing()], `Colours you can pick: ${and(gone.map((c) => c.name))} back`) } : undefined,
    move: (id, to) => {
      const t = colorTray(), from = t.findIndex((c) => c.hex === id);
      if (from < 0) return;
      const [c] = t.splice(from, 1);
      t.splice(to, 0, c);
      setColorTray(t);
      page.paintSwitch();
    },
    reset: () => (setColorTray(COLORS), page.paintSwitch()),
    changed: () => JSON.stringify(colorTray()) !== JSON.stringify(COLORS),
  };
};

const SC: [string, string][] = [['editor', 'editor'], ['term', 'terminal']];
const shown = (c: string | null | undefined) => (c ? col(c) : 'var(--text-dim)');
const nameOf = (hex: string) => (hex ? trayName(hex) : 'grey');
function scStrip(k: string, word: string) {
  const c = setColors(k);
  const inner = c.same
    ? `<button class="sc-one" data-sc-at="one" style="--ly-c:${esc(shown(c.one))}" title="${esc(`${cap(word)} colour\nThe one colour every new ${word} gets. Click to change it.`)}" aria-label="the one colour of new ${word}s"></button>`
    : `<span class="sc-row">${c.order.map((x: string, i: number) => `<button class="sc-n" data-sc-at="${i}" style="--ly-c:${esc(shown(x))}" title="${esc(`${cap(word)} ${i + 1}: ${nameOf(x)}\nClick to change its colour.\nDrag it to change the order.`)}" aria-label="${esc(`${word} ${i + 1}`)}"></button>`).join('')}</span>`;
  return `<span class="sc-line" data-sc-kind="${k}">${inner}</span>`;
}
function scTurn(k: string, word: string) {
  const o = setColors(k).order.map(nameOf);
  return o.length > 4 ? `The first ${word} is ${o[0]}, then ${o.slice(1, 4).join(', ')} and the rest in turn.` : o.length > 1 ? `The first ${word} is ${o[0]}, then ${and(o.slice(1))} in turn.` : `Every new ${word} is ${o[0] || 'grey'}.`;
}
const scRow = ([k, word]: [string, string]): Row => pickOf({
  id: `look:sc:${k}`, key: `look:sc:${k}`, plain: true, noPic: true, wide: true,
  own: { label: `Colour of each new ${word}`, desc: `Click a colour to change it, or drag it to change the order. A${word === 'editor' ? 'n' : ''} ${word} you painted yourself keeps its colour.`, find: `set colors ${word}s click a number to change its color, drag it to change the order, new views take these in turn, or the one color with all the same` },
  at: [at(`look:sc:${k}`, 'lk-sc')],
  ctl: () => scStrip(k, word),
  reset: () => (resetSetColors(k), page.paintSwitch()), changed: () => setColorsChanged(k),
}, `look:sc:${k}`, 'turn', () => [['turn', 'In turn', scTurn(k, word)], ['same', 'All the same', `Every new ${word} gets the one colour you picked.`]], () => (setColors(k).same ? 'same' : 'turn'), (v) => saveColors(k, { same: v === 'same' }));
const saveColors = (k: string, patch: Record<string, unknown>) => (setSetColors(k, patch), page.paintSwitch());
function pickColor(b: HTMLElement) {
  const k = b.closest<HTMLElement>('[data-sc-kind]')!.dataset.scKind!, i = b.dataset.scAt!, c = setColors(k), now = i === 'one' ? c.one : c.order[+i];
  selectRow(`look:sc:${k}`);
  const put = (v: string | undefined) => {
    saveColors(k, i === 'one' ? { one: v, same: true } : { order: c.order.with(+i, v) });
    document.querySelector<HTMLElement>(`#settings [data-sc-kind="${k}"] [data-sc-at="${i}"]`)?.style.setProperty('--ly-c', shown(v));
  };
  const r = b.getBoundingClientRect(), hex = col(now) || tokens()['text-dim'];
  popMenu(r.left, r.bottom + 4, `<div class="row">${swatches(now, 'sc-c')}</div><button class="mi" data-sc-c="">grey</button><label class="mi sc-custom">any colour<input type="color" value="${esc(hex)}"></label>`, (o) => (put(o.dataset.scC), page.renderSettings()));
  const input = $('#colormenu input') as HTMLInputElement;
  input.oninput = () => put(input.value);
  input.onchange = () => page.renderSettings();
}

const themeRows = (): Row[] => [themeRow()];
const accentRows = (): Row[] => [accentRow(), strengthRow()];
const scRows = (): Row[] => SC.map(scRow);
const rest = (): Row[] => [barRow(), brightRow(), cornersRow(), chatRow(), trayRow()];

const PIC: Record<string, () => string> = {
  'lk-accent': () => `<span class="seg"><button class="chip on" tabindex="-1">${dot('var(--accent)')}Picked</button></span>`,
  'lk-bar': winBar,
  'lk-corners': () => `<span class="seg"><button class="chip on" tabindex="-1">Rounded</button></span> <span class="seg" style="--r-xs:0px;--r-sm:1px;--r-md:1px;--r-lg:2px;--r-pill:1px"><button class="chip on" tabindex="-1">Square</button></span>`,
};
const example = (a: At) => (PIC[a.place] ? pic(PIC[a.place](), a.place, ' hr-ex') : '');
addPart({ rows: () => [...themeRows(), ...accentRows(), ...rest(), ...scRows()], sel: () => '', look: () => '', example, home: 'look' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function lookHtml() {
  const [bar, bright, corners, chat, tray] = rest();
  return box('lktheme', 'Theme', rows(themeRows()), 'The colours of every Amethyst window.') +
    box('lkaccent', 'Accent colour', rows(accentRows()), "The colour that marks what's picked and what's working, in every window.") +
    box('lkbar', 'Title bar', rows([bar]), 'The strip at the very top of each Amethyst window and of each floating window.') +
    box('lkbright', 'Brightness', rows([bright]), 'How bright everything Amethyst shows is, in every window.') +
    box('lkcorners', 'Corners', rows([corners]), 'The shape of buttons, boxes, menus and windows everywhere in the app.') +
    box('lkchat', 'Chat text', rows([chat]), 'The text in every chat, wherever it is open.') +
    box('lktray', 'Colours in colour menus', rows([tray]), 'The colours every colour menu offers: for workspaces, projects, files and sets.') +
    box('lksc', 'Colours of new editors and terminals', rows(scRows()), "The colour each new editor and each new terminal gets, by its place. The colour menu's place colours entry opens this box.");
}

export function lookClick(t: Element): boolean {
  const th = t.closest<HTMLElement>('[data-set-theme]');
  if (th) {
    selectRow('look:theme');
    useTheme(th.dataset.setTheme!);
    setSave(`Theme: ${cap(THEMES[themeName()].label)}`);
    return true;
  }
  const sc = t.closest<HTMLElement>('#settings [data-sc-at]');
  if (sc) return pickColor(sc), true;
  return false;
}

export function lookInit(root: HTMLElement) {
  root.addEventListener('change', (e: Event) => {
    const i = e.target as HTMLInputElement, from = i.dataset?.ctColor;
    if (from == null) return;
    const t = colorTray(), hex = i.value.toLowerCase(), c = t.find((x) => x.hex === from);
    selectRow('look:tray');
    if (!c || hex === from) return;
    if (t.some((x) => x.hex === hex)) return (setSave(`${hex} is already in the colour menus`), page.renderSettings());
    saveTray(t.map((x) => (x.hex === from ? { ...x, hex, name: x.name === from ? hex : x.name } : x)), `Colours you can pick: ${c.name} is ${hex}`);
    page.renderSettings();
  });
  sortable(root, {
    item: '.sc-n',
    drop(all: HTMLElement[], to: number) {
      const k = all[to].closest<HTMLElement>('[data-sc-kind]')!.dataset.scKind!, { order } = setColors(k);
      saveColors(k, { order: all.map((x) => order[+x.dataset.scAt!]) });
      setSave(`Colour of each new ${SC.find(([x]) => x === k)?.[1] || k}: order changed`);
      page.renderSettings();
    },
  });
}
