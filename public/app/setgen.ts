import { forgetColors, forgetListChanged, forgetListHere, forgetListOn, forgetListText, forgetListTimes, forgetRows, listCard, listItem, resetForgetList, setForgetColor, setForgetListOn, setForgetListText } from '../forget/forget.ts';
import type { FgNote } from '../forget/forget.ts';
import { openWelcome } from '../welcome/welcome.ts';
import { openTour } from '../welcome/tutorial.ts';
import { noticeInner, tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { pref } from '../base/prefs.ts';
import { esc, setSave } from '../base/util.ts';
import { resetSteps, setStepsText, stepsChanged, stepsShown, stepsText } from './header.ts';
import { dockPic, forgetHtml } from './setdock.ts';
import { phoneClick, phoneMore, phoneRows } from './setphone.ts';
import { addPart, box, mark, pic, rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const GEN_LEAD = "Closing and starting, don't forget's reminders, the timer, the welcome page, the tutorial and phone remote control.";

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;
const and = (w: string[]) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0] || '');
const at = (key: string, place: string, o: Partial<At> = {}): At => ({ key, place, on: () => true, ...o });

let tray: { on: boolean; login: boolean } | null = null, asked = false;
function trayNow() {
  if (!tray && !asked && DESKTOP?.trayState) {
    asked = true;
    DESKTOP.trayState().then((s: { on: boolean; login: boolean } | null) => s && ((tray = s), page.renderSettings()));
  }
  return tray || { on: true, login: true };
}
async function setTray(c: { on?: boolean; login?: boolean }) {
  tray = { ...trayNow(), ...c };
  page.renderSettings();
  tray = (await DESKTOP!.traySet(c)) || tray;
  page.renderSettings();
}
const TRAY_ON = 'Closing the last main window with × hides Amethyst in the tray. You quit from the tray icon.', TRAY_OFF = 'Closing the last main window with × quits Amethyst.';
const LOGIN_ON = 'Amethyst starts in the tray each time you sign in to Windows.', LOGIN_OFF = 'Amethyst starts only when you open it.';
const closeRows = (): Row[] => (DESKTOP?.trayState ? [
  {
    id: 'g:tray', key: 'g:tray', sw: 'onoff', plain: true,
    own: { label: 'Keep Amethyst in the tray when you close it', desc: 'Only the last main window counts: with another main window open, × just closes that one.', find: `${TRAY_ON} ${TRAY_OFF}` },
    at: [at('g:tray', 'g-x', { on: () => trayNow().on, set: (v) => void setTray({ on: v }), def: true })],
    state: () => (trayNow().on ? TRAY_ON : TRAY_OFF), alt: () => (trayNow().on ? TRAY_OFF : TRAY_ON),
    reset: () => void setTray({ on: true }), changed: () => !trayNow().on,
  },
  {
    id: 'g:login', key: 'g:login', sw: 'onoff', plain: true,
    own: { label: 'Start Amethyst when you sign in to Windows', desc: 'It starts in the tray, so no window opens until you click its icon there.', find: `${LOGIN_ON} ${LOGIN_OFF}` },
    at: [at('g:login', 'g-icon', { on: () => trayNow().login, set: (v) => void setTray({ login: v }), def: true })],
    state: () => (trayNow().login ? LOGIN_ON : LOGIN_OFF), alt: () => (trayNow().login ? LOGIN_OFF : LOGIN_ON), note: () => 'Only an installed Amethyst does this.',
    reset: () => void setTray({ login: true }), changed: () => !trayNow().login,
  },
] : []);

const draft: Record<string, string> = {};
const typed = (k: string, sel: string, now: string) => (document.activeElement?.matches(sel) && draft[k] != null ? draft[k] : now);
const LIST_HOW = 'Write times like 12:00, 9 13:30 18, or every 6h';
const listUsable = () => !!pref('forget:on') && forgetListHere();
const listRow = (): Row => ({
  id: 'g:list', key: 'g:list', sw: listUsable() ? 'onoff' : 'none', plain: true,
  own: { label: "Show your don't forget list at set times", desc: `${LIST_HOW}, then press Enter.`, find: 'Your whole list comes up every day. Your list never comes up by itself.' },
  at: [at('g:list', 'g-list', { on: forgetListOn, set: setForgetListOn, def: true })],
  state: () => (!pref('forget:on') ? "Don't forget is turned off, so its list can't come up. Turn it on in Layout and bars, Dock." : !forgetListHere() ? 'Open a workspace to set its times: each workspace has its own.' : forgetListOn() ? `Your whole list comes up every day at ${and(forgetListTimes())}.` : 'Your list never comes up by itself.'),
  alt: () => (!listUsable() ? '' : forgetListOn() ? 'Your list never comes up by itself.' : `Your whole list comes up every day at ${and(forgetListTimes())}.`),
  note: () => (listUsable() ? "These times are this workspace's." : ''),
  ctl: () => (listUsable() ? `<input class="hr-in" data-forget-list value="${esc(typed('list', '[data-forget-list]', forgetListText()))}" aria-label="times">` : ''),
  reset: resetForgetList, changed: () => listUsable() && forgetListChanged(),
});
const LEVELS: [string, string][] = [['normal', 'Normal'], ['soon', 'Soon'], ['urgent', 'Urgent']];
function colorInputs() {
  const css = getComputedStyle(document.documentElement);
  const hex = (n: number) => {
    const v = css.getPropertyValue(`--fg-c${n}`).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : '#888888';
  };
  return LEVELS.map(([w, name], i) => `<input type="color" value="${hex(i + 1)}" data-forget-color="${i + 1}" title="${name}" aria-label="${w} color">`).join('');
}
const colorsSet = () => forgetColors().some(Boolean);
const COLORS_MINE = 'Normal, soon and urgent notes take the colors you picked.', COLORS_THEME = "Normal, soon and urgent notes take the theme's colors.";
const colorRow = (): Row => ({
  id: 'g:col', key: 'g:col', sw: 'none', plain: true,
  own: { label: "Colors of your don't forget notes", desc: 'A note written with ! is normal, with !! soon, and with !!! urgent.' },
  at: [at('g:col', 'g-col')],
  state: () => (colorsSet() ? COLORS_MINE : COLORS_THEME), alt: () => (colorsSet() ? COLORS_THEME : COLORS_MINE),
  ctl: colorInputs,
  reset: () => [1, 2, 3].forEach((n) => setForgetColor(n, '')), changed: colorsSet,
});
const TIMER_HOW = 'Write times like 5m 20m 1h';
const timerRow = (): Row => ({
  id: 'g:timer', key: 'g:timer', sw: 'none', plain: true,
  own: { label: 'Times a click on the timer goes through', desc: `${TIMER_HOW}, then press Enter.` },
  at: [at('g:timer', 'g-timer')],
  state: () => `Each click goes to the next time: ${and(stepsShown())}, then back to 0:00. It starts 1.5 seconds after your last click.`,
  ctl: () => `<input class="hr-in" data-timer-steps value="${esc(typed('timer', '[data-timer-steps]', stepsText()))}" aria-label="timer times">`,
  reset: resetSteps, changed: stepsChanged,
});
const button = (id: string, label: string, state: string, desc: string, btn: string): Row => ({
  id, key: id, sw: 'none', plain: true, noReset: true, noPic: true,
  own: { label, desc }, at: [at(id, 'g-none')], state: () => state, ctl: () => btn,
});
const welcomeRows = (): Row[] => [
  button('g:wl', 'Welcome page', 'Opens the page from your first start again, to set things up.', 'Opening it changes nothing. What you pick on it changes at once.', '<button class="chip" data-welcome-open>open the welcome page</button>'),
  button('g:tour', 'Tutorial', 'A few steps to try in the app. It takes about a minute.', 'It runs in the project you have open. With none open, it starts when you open one.', '<button class="chip" data-tour-open>start the tutorial</button>'),
];
const forgetRowsOf = (): Row[] => [listRow(), colorRow()];

function winBar() {
  const real = document.getElementById('winbar');
  if (!real) return '';
  const bar = real.cloneNode(true) as HTMLElement;
  for (const n of [bar, ...bar.querySelectorAll('[id]')]) n.removeAttribute('id');
  bar.hidden = false;
  bar.querySelector('.xw-n')!.textContent = 'Amethyst';
  bar.querySelector('.szs')?.remove();
  const max = bar.querySelector<HTMLElement>('[aria-label="maximize"]'), every = bar.querySelector<HTMLElement>('.xw-every');
  if (max) max.hidden = false;
  if (every) every.hidden = true;
  return `<div class="wbar hr-win">${bar.outerHTML}</div>`;
}
const HOUR = 3600e3;
const SAMPLE = (): FgNote[] => [
  { id: 'n2', text: 'a note due soon', due: Date.now() + 4 * HOUR, span: null, pid: '', level: 'soon' },
  { id: 'n3', text: 'an urgent note', due: Date.now() + 48 * HOUR, span: null, pid: '', level: 'urgent' },
  { id: 'n1', text: 'a normal note', due: null, span: null, pid: '', level: 'general' },
];
const SEL: Record<string, string> = { 'g-x': '.xw-x', 'g-icon': '.wb-gem', 'g-list': '.notice', 'g-col': '#fg-list' };
const sel = (a: At) => SEL[a.place] || '';
function example(a: At) {
  const shown = { ...a, on: () => true };
  if (a.place === 'g-timer') return dockPic('timer');
  if (a.place === 'g-x' || a.place === 'g-icon') return pic(mark(winBar(), [shown], sel, shown), a.place, ' hr-ex');
  if (a.place === 'g-list') {
    const notes = SAMPLE();
    return pic(mark(`<div class="hr-ntc"><div class="notice float fl-note" role="status">${noticeInner(listCard(notes.map(listItem), notes.length))}</div></div>`, [shown], sel), a.place, ' hr-fig hr-tbar');
  }
  if (a.place === 'g-col') return pic(mark(forgetHtml(forgetRows(SAMPLE())), [shown], sel), a.place, ' hr-fig');
  return '';
}

addPart({ rows: () => [...closeRows(), ...forgetRowsOf(), timerRow(), ...welcomeRows(), ...phoneRows()], sel, look: () => '', example, home: 'general' });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function genHtml() {
  const close = closeRows();
  return (close.length ? box('gclose', 'Closing and starting', rows(close), 'Only in the desktop app.') : '') +
    box('gforget', "Don't forget's reminders", rows(forgetRowsOf())) +
    box('gtimer', 'Timer', rows([timerRow()])) +
    box('gwelcome', 'Welcome page and tutorial', rows(welcomeRows())) +
    box('gphone', 'Phone remote control', rows(phoneRows()) + phoneMore());
}

export function genClick(t: Element): boolean {
  if (phoneClick(t)) return true;
  const b = t.closest<HTMLElement>('[data-welcome-open], [data-tour-open]');
  if (!b) return false;
  if (b.matches('[data-welcome-open]')) openWelcome();
  else openTour();
  return true;
}

const FIELDS = '[data-timer-steps], [data-forget-list]';
function applyTimes(f: HTMLInputElement) {
  const timer = f.matches('[data-timer-steps]'), k = timer ? 'timer' : 'list';
  draft[k] = f.value;
  const ok = timer ? setStepsText(f.value) : setForgetListText(f.value);
  if (ok) delete draft[k];
  if (!ok) return tell(f, { title: "That time can't be read", line: `${timer ? TIMER_HOW : LIST_HOW}. Your times stay as they were.`, ms: 4000 });
  setSave(timer ? `Timer times: ${stepsText()}` : `Don't forget list times: ${forgetListText()}`);
  page.renderSettings();
}
function paintColors(root: HTMLElement) {
  const now = root.querySelector('[data-hr="g:col"]'), t = document.createElement('template');
  t.innerHTML = rowHtml(colorRow());
  const next = t.content.firstElementChild;
  if (!now || !next) return;
  now.querySelector('.hr-fold')!.replaceWith(next.querySelector('.hr-fold')!);
  now.querySelector('.sr-rs')!.replaceWith(next.querySelector('.sr-rs')!);
}
export function genInit(root: HTMLElement) {
  document.addEventListener('focusin', (e: FocusEvent) => {
    const t = e.target as Element;
    if (!t.matches?.('[data-timer-steps]')) delete draft.timer;
    if (!t.matches?.('[data-forget-list]')) delete draft.list;
  });
  root.addEventListener('keydown', (e: KeyboardEvent) => {
    const f = (e.target as Element).closest<HTMLInputElement>(FIELDS);
    if (!f || e.key !== 'Enter') return;
    e.preventDefault();
    applyTimes(f);
  });
  root.addEventListener('change', (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches(FIELDS)) return void setTimeout(() => applyTimes(t));
    if (!t.matches('[data-forget-color]')) return;
    setSave(`Don't forget colors: ${LEVELS[+t.dataset.forgetColor! - 1][0]} is ${t.value}`);
    page.renderSettings();
  });
  root.addEventListener('input', (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.matches(FIELDS)) draft[t.matches('[data-timer-steps]') ? 'timer' : 'list'] = t.value;
    if (!t.matches('[data-forget-color]')) return;
    setForgetColor(+t.dataset.forgetColor!, t.value);
    paintColors(root);
  });
}
