import { ask, barMenu, floatBox, ICONS, rowIcons, tipTo } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { guideHtml, paintColors } from './fgguide.ts';
import { api, atLaunch, S } from '../base/model.ts';
import { notify } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { setSolid, setTheme } from '../base/theme.ts';
import { $, addrPlace, esc, placeKey, showErr, spanText, store, trySave, uid } from '../base/util.ts';
import { every } from '../base/life.ts';
import { WIN } from '../base/windows.ts';
import { onPlace } from '../app/places.ts';

const HOUR = 3600e3;
const MIN_W = 180, MIN_H = 80;
const LEVELS = ['general', 'soon', 'urgent'];
type Fg = { id: string; text: string; due: number | null; span: number | null; pid: string; level: string; every?: boolean; at?: number | null };
const lv = (n: { level: string }) => LEVELS.indexOf(n.level) + 1 || 1;
const btn = $('#fg-btn'), win = $('#forget'), form = $('#fg-form'), input = $('#fg-text'), list = $('#fg-list'), head = $('#fg-head');
const mir = $('#fg-form .fg-mir'), pv = $('#fg-form .fg-pv'), hint = $('#fg-form .fg-hint');
let mirDrawn: string | null = null;
const drawnHtml = new WeakMap<Element, string>();
const put = (el: Element, html: string) => drawnHtml.get(el) !== html && (drawnHtml.set(el, html), (el.innerHTML = html));
const POP = location.pathname === '/forget.html';
const desk = window.amethyst!;
const OUT = !POP && WIN === 1 && !!desk?.forgetWindow;
let popped = false, awayNow = false;
let fitted = '';

const here = () => (POP ? addrPlace() : { wid: S.wid, pid: S.pid });
const addKey = () => `forget:add:${placeKey(here().wid, here().pid)}`;

let notes: Fg[] = [];
let loaded = '';
let loading = Promise.resolve();
let changes = 0;
let saving = 0;
let open = store.get('forget:open', false), adding = false, lit = '', pin: { x: number; y: number } | null = null;
let drawn = '', fresh = '';
const popOn = () => !!desk?.forgetToast && store.get('forget:pop', true);
const told = new Set<string>();
const rang = new Set<string>();
const LIST: { on: boolean; at: number[] } = { on: true, at: [720] };
let listAt = LIST;
const born = Date.now();
let dueTimer = 0, listTimer = 0;

const lineOn = () => adding || pref('forget:addLine');
const sorted = () => [...notes].sort((a, b) => (a.due || Infinity) - (b.due || Infinity));
const isDue = (n: Fg) => n.due && n.due <= Date.now();

function save(pid: string) {
  const { wid } = here(), items = notes.filter((n) => n.pid === pid);
  changes++;
  saving++;
  trySave(`forget:${wid}:${pid}`, "don't forget", () => api('PUT', '/api/forget', { items }, pid, wid).then(() => store.set('forget:saved', Date.now()))).finally(() => saving--);
}

function fetchNotes() {
  const at = loaded, { wid, pid } = here(), from = changes;
  const get = (p: string) => api('GET', '/api/forget', undefined, p, wid).then((r) => ({ list: r.list, items: r.items.filter((n: any) => !n.done).map((n: any) => ({ ...n, pid: p })) }));
  loading = Promise.all([get(''), pid ? get(pid) : { items: [] }]).then(
    ([g, p]) => {
      if (at !== loaded || from !== changes || saving) return;
      notes = [...g.items, ...p.items];
      listAt = g.list || LIST;
      paint();
      page.renderSettings?.();
    },
    (e) => {
      if (at !== loaded) return;
      loaded = '';
      notes = [];
      paint();
      showErr(e);
    },
  );
}

export function placeForget() {
  if (WIN > 1) return;
  const h = here(), at = pref('forget:on') && (POP ? h.wid : !atLaunch()) ? `${h.wid}/${h.pid}` : '';
  if (at !== loaded) {
    loaded = at;
    notes = [];
    listAt = LIST;
    if (at) fetchNotes();
  }
  paint();
}
onPlace(placeForget);

function outWindow(on: boolean, ev?: MouseEvent) {
  if (!on) return desk.forgetWindow(null);
  if (awayNow) return desk.showWindow('forget');
  const z = store.get('forget:size', null), w = z?.w || 240, h = z?.h || 160, f = (outerWidth - innerWidth) / 2;
  const ox = ev?.detail ? ev.screenX - ev.clientX : screenX + f, oy = ev?.detail ? ev.screenY - ev.clientY : screenY + outerHeight - innerHeight - f;
  const b = btn.getBoundingClientRect(), top = $('#status').getBoundingClientRect().top;
  return desk.forgetWindow({ x: Math.round(ox + b.right - w), y: Math.round(oy + top - 6 - h), width: w, height: h, near: true });
}

function setOpen(on: boolean) {
  store.set('forget:open', (open = on));
  paint();
}

function setAdding(on: boolean) {
  const r = win.getBoundingClientRect();
  if (!win.hidden && !store.get('forget:at', null)) pin = { x: r.left, y: r.top };
  adding = on;
  paint();
  (on ? input : win).focus();
}

export function newForget() {
  if (OUT) return store.set(addKey(), Date.now()), outWindow(true);
  adding = true;
  setOpen(true);
  input.focus();
}

function readLine(raw: string, pid: string = here().pid) {
  const m = raw.match(/^(\$?)(([!#])\3*)?(?:(\d{1,2}):(\d{2})|(\d*))\s*([\s\S]*)$/);
  const at = m?.[4] && +m[4] < 24 && +m[5] < 60 ? (m[4] as unknown as number) * 60 + +m[5] : null;
  const min = m && (m[1] || m[2]) && !m[4] ? Math.min(+m[6] || 0, 525600) : 0;
  const timed = !!(m?.[1] || m?.[2]) && (min > 0 || at !== null);
  if (!m || (m[4] && at === null) || ((!m[2] || m[1]) && !timed)) return { text: raw.trim(), min: 0, at: null, pid: '', level: 1, every: false, tok: '' };
  return { text: m[7].trim(), min, at, pid: m[3] === '!' ? pid : '', level: Math.min(m[2]?.length || 1, 3), every: !!m[1], tok: m[1] + (m[2] || '') + (m[4] ? `${m[4]}:${m[5]}` : m[6]) };
}

function nextAt(at: number) {
  const now = Date.now(), d = new Date(now);
  d.setHours(Math.floor(at / 60), at % 60, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function shake() {
  form.querySelector('.fg-line').animate([{ transform: 'none' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], 180);
}

async function add() {
  const typed = input.value, r = readLine(typed);
  if (!r.text) return shake();
  input.value = '';
  paintForm();
  await loading;
  if (!loaded) return void ((input.value ||= typed), paintForm());
  const time = r.min * 60e3, clocked = r.at !== null;
  fresh = uid();
  notes.push({
    id: fresh, text: r.text, due: clocked ? nextAt(r.at!) : time ? Date.now() + time : null, span: clocked ? (r.every ? 24 * HOUR : null) : time || null,
    pid: r.pid, level: LEVELS[r.level - 1], ...(r.every ? { every: true } : {}), ...(clocked ? { at: r.at } : {}),
  });
  save(r.pid);
  paint();
}

async function finish(n: Fg, sure = false) {
  if (!sure && !(await ask({ title: 'done?', text: `“${n.text}”: are you sure you finished that?`, confirm: true }))) return;
  notes = notes.filter((x) => x !== n);
  save(n.pid);
  rang.delete(n.id);
  if (n.id === lit) lit = '';
  paint();
}

function finishAll(ids: string[]) {
  const gone = notes.filter((n) => ids.includes(n.id));
  if (!gone.length) return;
  notes = notes.filter((n) => !gone.includes(n));
  for (const n of gone) {
    rang.delete(n.id);
    if (n.id === lit) lit = '';
  }
  for (const pid of new Set(gone.map((n) => n.pid))) save(pid);
  paint();
}

function snooze(n: Fg) {
  if (n.id === lit) lit = '';
  n.due = Date.now() + (n.span || HOUR);
  save(n.pid);
  paint();
}

const left = (n: Fg) => (n.due! <= Date.now() ? 'now' : length(n.due! - Date.now()));

function length(ms: number) {
  if (ms >= 24 * HOUR) return Math.ceil(ms / (24 * HOUR)) + 'd';
  return ms > HOUR - 60e3 ? Math.ceil(ms / HOUR) + 'h' : Math.ceil(ms / 60e3) + 'm';
}

const inTime = (n: Fg) => 'in ' + length(n.due! - Date.now()).replace(/m$/, 'min');

function row(n: Fg) {
  const time = rang.has(n.id)
    ? `<button class="fg-later fg-ok" data-fgok title="Seen&#10;Stops this reminder. It repeats, so the next one comes in ${left(n)}.">ok</button>`
    : isDue(n) ? `<button class="fg-later" data-fgsnooze>again ${length(n.span || HOUR)}</button>` : n.due ? `<span class="fg-time">${inTime(n)}</span>` : '';
  const rep = n.every ? `<span class="fg-every" title="Repeats&#10;It comes back every ${n.at != null ? `day at ${clock(n.at)}` : length(n.span || HOUR)}.">↻</span>` : '';
  return `<div class="fg-row${isDue(n) || rang.has(n.id) ? ' due' : ''}${n.id === lit ? ' lit' : ''}${n.id === fresh ? ' new' : ''}" data-fg="${n.id}" style="--c: var(--fg-c${lv(n)})"><button class="fg-check" data-fgfin title="Done&#10;Marks it done and takes it off the list." aria-label="mark it done">✓</button><span class="fg-txt">${esc(n.text)}</span>${rep}${time}</div>`;
}

function paintList(all: Fg[]) {
  list.hidden = !all.length;
  const html = all.map(row).join('');
  if (html !== drawn) list.innerHTML = drawn = html;
  fresh = '';
}

function whenAt(ms: number) {
  const d = new Date(ms), t = d.toTimeString().slice(0, 5);
  return d.toDateString() === new Date().toDateString() ? t : 'tomorrow ' + t;
}

function paintForm() {
  const v = input.value, r = readLine(v), proj = !!r.pid, clocked = r.at !== null;
  const where = proj ? 'this project' : 'workspace', urg = r.level > 1 ? ` · ${LEVELS[r.level - 1]}` : '';
  const due = clocked ? nextAt(r.at!) : Date.now() + r.min * 60e3, span = clocked ? clock(r.at!) : spanText(r.min);
  const c = r.tok ? `var(--fg-c${r.level})` : 'var(--accent)';
  if (form.style.getPropertyValue('--c') !== c) form.style.setProperty('--c', c);
  const m = r.tok ? `<i>${esc(r.tok)}</i>${esc(v.slice(r.tok.length))}` : esc(v);
  if (m !== mirDrawn) {
    mir.innerHTML = mirDrawn = m;
    mir.scrollLeft = input.scrollLeft;
  }
  pv.classList.toggle('set', !!r.tok);
  put(pv, v.trim() ? (proj ? ICONS.projects : ICONS.workspaces) + `<span>${r.min || clocked ? (r.every ? '↻ ' : '') + span : 'no timer'}</span>` : '');
  put(hint, !v.trim()
    ? ''
    : !r.text ? `${where}${urg} · now the message`
    : r.every && clocked ? `${where} · repeats every day at <em>${span}</em>, first ${whenAt(due).startsWith('tomorrow') ? 'tomorrow' : 'today'}${urg}`
    : r.every ? `${where} · repeats every <em>${span}</em>, first at ${whenAt(due)}${urg}`
    : r.min || clocked ? `${where} · reminds you at <em>${whenAt(due)}</em>${urg}`
    : `${where}${urg} · no timer: it stays in the list`);
}

const after = (n: Fg) => n.at != null ? nextAt(n.at) : n.due! +(Math.floor((Date.now() - n.due!) / (n.span || HOUR)) + 1) * (n.span || HOUR);

function remind(all: Fg[]) {
  const due = all.filter(isDue);
  for (const id of rang) if (!notes.some((n) => n.id === id)) rang.delete(id);
  for (const n of due) {
    const k = `${n.id}:${n.due}`;
    if (told.has(k)) continue;
    told.add(k);
    lit = n.id;
    if (!POP) {
      const again = n.every ? 'ok' : `again ${length(n.span || HOUR)}`;
      card(n, again);
      if (popOn()) desk.forgetToast({ text: n.text, level: lv(n), id: n.id, again });
      if (n.every) {
        rang.add(n.id);
        n.due = after(n);
        save(n.pid);
      }
    }
  }
}

function card(n: Fg, again: string) {
  const what = n.every ? 'ok' : 'again', tip = n.every ? 'OK\nYou saw it. It repeats, so it comes back at its next time.' : `Remind again\nThe reminder comes back in ${length(n.span || HOUR)}.`;
  const c = notify(`<b>don't forget:</b> ${esc(n.text)}<span class="fg-ans"><button data-fn="${what}" title="${esc(tip)}">${again}</button><button data-fn="done">done</button></span>`, { ms: 10000 });
  c.classList.add('fg-note');
  c.style.setProperty('--c', `var(--fg-c${lv(n)})`);
  c.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-fn]') as HTMLElement;
    if (!b) return;
    c.close!();
    answer(n.id, b.dataset.fn!);
  });
}

function answer(id: string, what: string) {
  const n = notes.find((x) => x.id === id);
  if (!n) return;
  if (what === 'again' && isDue(n)) snooze(n);
  else if (what === 'ok') seen(n);
  else if (what === 'done') finish(n, true);
}

function seen(n: Fg) {
  rang.delete(n.id);
  if (lit === n.id) lit = '';
  paint();
}

export const forgetColors = () => store.get('forget:colors', ['', '', '']);
export function setForgetColor(level: number, hex: string) {
  store.set('forget:colors', forgetColors().with(level - 1, hex));
  paintColors();
}

function arm() {
  clearTimeout(dueTimer);
  clearTimeout(listTimer);
  if (POP || WIN !== 1 || !loaded) return;
  const now = Date.now(), next = Math.min(...notes.map((n) => (n.due! > now ? n.due! : Infinity)));
  if (next < Infinity) dueTimer = setTimeout(paint, Math.min(next - now + 250, 2 ** 31 - 1));
  if (!listAt.on) return;
  const day = new Date(now).setHours(0, 0, 0, 0), times = [0, 1].flatMap((d) => listAt.at.map((m) => new Date(day).setDate(new Date(day).getDate() + d) + m * 60e3));
  const soon = times.find((t) => t > now - 250);
  listTimer = setTimeout(() => listDue(soon!), soon! - now + 250);
}

function listDue(t: number) {
  const { wid } = here(), key = `${wid}@${t}`;  if (loaded && listAt.on && t >= born && Date.now() - t < 10 * 60e3 && store.get('forget:listShown', '') !== key) {
    store.set('forget:listShown', key);
    showList();
  }
  paint();
}

const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const forgetListHere = () => !!loaded;
export const forgetListOn = () => listAt.on;
export const forgetListText = () => listAt.at.map(clock).join(' ');
export function setForgetListText(text: string) {
  const out: number[] = [], every = /every\s*(\d+(?:\.\d+)?)\s*([hm]?)/gi;
  for (const [, n, u] of text.matchAll(every)) {
    const step = Math.round((n as unknown as number) * (u.toLowerCase() === 'm' ? 1 : 60));
    if (step >= 15) for (let m = 0; m < 1440; m += step) out.push(m);
  }
  for (const [, h, m = '0'] of text.replace(every, ' ').matchAll(/\b(\d{1,2})(?::(\d{2}))?\b/g)) if (+h < 24 && +m < 60) out.push((h as unknown as number) * 60 + +m);
  const at = [...new Set(out)].sort((a, b) => a - b).slice(0, 96);
  if (at.length) saveList({ ...listAt, at });
}
export const setForgetListOn = (on: boolean) => saveList({ ...listAt, on });
function saveList(l: typeof LIST) {
  if (!loaded) return;
  const { wid } = here();
  listAt = l;
  trySave(`forget-list:${wid}`, "don't forget", () => api('PUT', '/api/forget-list', l, '', wid));
  paint();
  page.renderSettings?.();
}

function showList() {
  const all = sorted(), more = Math.max(0, all.length - 8);
  const items = all.slice(0, 8).map((n) => ({ id: n.id, text: n.text, time: n.due ? left(n) : '' }));
  const head = `<span class="fl-h"><b>don't forget</b><span class="fl-n">${all.length}</span><span class="fl-bt"><button data-fl="settings" title="Settings&#10;The don't forget settings." data-tip-set="general" aria-label="settings">${ICONS.settings}</button><button class="x" title="Close&#10;Closes this window." aria-label="close">×</button></span></span>`;
  const rows = all.length
    ? `${items.map((i) => `<span class="fl-r${i.time === 'now' ? ' due' : ''}" data-id="${esc(i.id)}"><span class="fl-t">${esc(i.text)}</span><i>${i.time}</i><span class="fl-bt"><button class="fl-done" aria-label="done" aria-pressed="false">${ICONS.check}</button><button class="fl-rm" aria-label="remove" aria-pressed="false">${ICONS.bin}</button></span></span>`).join('')}${more ? `<span class="fl-more">and ${more} more</span>` : ''}`
    : `<span class="fl-empty">nothing to remember yet</span>`;
  const btns = all.length ? `<button data-fl="confirm" title="Confirm&#10;The ones you marked done or removed leave the list." disabled>confirm</button>` : `<button data-fl="add">add one</button>`;
  const n = notify(`<span class="fl">${head}<span class="fl-rows">${rows}</span><span class="fl-b">${btns}</span></span>`, { ms: 20000 });
  n.classList.add('fl-note');
  (n.querySelector('.fl-h .x') as HTMLElement).onclick = n.close!;
  n.addEventListener('click', (e) => {
    const pick = (e.target as HTMLElement).closest('.fl-done, .fl-rm') as HTMLElement;
    if (!pick) return;
    const row = pick.closest('.fl-r')!, on = pick.ariaPressed !== 'true';
    row.querySelectorAll('.fl-bt button').forEach((x) => (x.ariaPressed = String(on && x === pick)));
    const any = !!n.querySelector('.fl-r [aria-pressed="true"]');
    (n.querySelector('[data-fl="confirm"]') as HTMLButtonElement).disabled = !any;
    if (any) n.onmouseleave = null;
  });
  n.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-fl]') as HTMLElement;
    if (!b) return;
    const ids = [...n.querySelectorAll('.fl-r:has([aria-pressed="true"])')].map((r) => (r as HTMLElement).dataset.id);
    n.close!();
    listAct(b.dataset.fl === 'confirm' ? `confirm:${ids.join(',')}` : b.dataset.fl!);
  });
  if (popOn()) desk.forgetList?.({ items, more, empty: !all.length });
}

function listAct(what: string) {
  const [act, id] = what.split(':');
  if (act === 'confirm') return finishAll((id || '').split(','));
  if (id) return answer(id, act);
  if (what === 'add') return newForget();
  if (what === 'settings') toSettings();
}

function toSettings() {
  store.set('settings:tab', 'general');
  page.openSettings();
  setTimeout(() => {
    const at = document.querySelector('[data-forget-list], [data-forget-color]') as HTMLElement;
    at?.scrollIntoView({ block: 'center' });
    at?.focus();
  }, 100);
}

function paint() {
  const all = sorted();
  if (btn) (btn.hidden = !loaded), btn.setAttribute('aria-expanded', OUT ? popped && !awayNow : open);
  tipTo(input, "New don't forget\nWrite what not to forget, then press enter.");
  input.dataset.tipKeys = "newForget:new don't forget";
  const plus = head.querySelector('[data-fgnew]');
  plus.setAttribute('aria-expanded', adding);
  tipTo(plus, adding ? 'Hide the add line\nHides the line where you write a new one.' : "New don't forget\nOpens the line to write what not to forget.");
  plus.dataset.tipKeys = "newForget:new don't forget";
  plus.hidden = pref('forget:addLine');
  form.hidden = !lineOn();
  paintForm();
  const pop = head.querySelector('[data-fgpop]');
  pop.hidden = !desk?.forgetToast || !pref('forget:popBtn');
  pop.setAttribute('aria-checked', String(store.get('forget:pop', true)));
  const popNow = store.get('forget:pop', true);
  pop.title = `Corner reminders: ${popNow ? 'on' : 'off'}\nA reminder also shows in the corner of the screen, outside the app. Click to turn it ${popNow ? 'off' : 'on'}.`;
  head.querySelector('[data-fginfo]').hidden = !pref('forget:info');
  head.querySelector('[data-fgset]').hidden = !pref('forget:setBtn');
  remind(all);
  if (btn) {
    const waiting = all.filter((n) => isDue(n) || rang.has(n.id)).length;
    btn.classList.toggle('due', waiting > 0);
    btn.title = `Don't forget\nYour reminders, in one list.${waiting ? ` ${waiting} ${waiting === 1 ? 'is' : 'are'} waiting.` : ''}`;
  }
  arm();
  paintList(all);
  win.hidden = !loaded || !open || OUT;
  if (win.hidden) (pin = null), (fitted = '');
  else if (!POP) fit();
}

function fit(again = false) {
  if (win.classList.contains('moving')) return;
  const at = store.get('forget:at', null) || pin, z = store.get('forget:size', null);
  const key = JSON.stringify([at, z, innerWidth, innerHeight, lineOn(), drawn]);
  if (key === fitted && !again) return;
  fitted = key;
  const b = btn.getBoundingClientRect();
  win.classList.toggle('sized', !!z);
  Object.assign(win.style, z ? { width: Math.min(Math.max(MIN_W, z.w), innerWidth - 16) + 'px', height: Math.min(Math.max(MIN_H, z.h), innerHeight - 16) + 'px' } : { width: '', height: '' });
  if (!at) {
    Object.assign(win.style, { left: '', top: '', right: Math.max(8, innerWidth - b.right) + 'px', bottom: innerHeight - $('#status').getBoundingClientRect().top + 6 + 'px' });
    return;
  }
  const r = win.getBoundingClientRect();
  Object.assign(win.style, { right: '', bottom: '', left: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)) + 'px', top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) + 'px' });
}

if (!POP)
  floatBox(win, {
    head,
    when: (e) => !e.target.closest('button'),
    min: [MIN_W, MIN_H],
    keep: ({ x, y, w, h }) => {
      w = Math.min(w, innerWidth - 16);
      h = Math.min(h, innerHeight - 16);
      return { w, h, x: Math.max(8, Math.min(x, innerWidth - w - 8)), y: Math.max(8, Math.min(y, innerHeight - h - 8)) };
    },
    frame: ({ edge }) => edge && (win.classList.add('sized'), Object.assign(win.style, { right: '', bottom: '' })),
    drop(b, { edge, moved }) {
      if (!moved) return edge && fit(true);
      if (edge) store.set('forget:size', { w: b.w, h: b.h });
      store.set('forget:at', { x: b.x, y: b.y });
      fit();
    },
  });

btn?.addEventListener('click', (e: MouseEvent) => (OUT ? outWindow(!popped || awayNow, e) : setOpen(!open)));
win.addEventListener('click', (e: MouseEvent) => {
  const d = (e.target as Element).closest<HTMLElement>('[data-fgx],[data-fgpop],[data-fginfo],[data-fgset],[data-fgnew],[data-fgfin],[data-fgsnooze],[data-fgok]');
  if (!d) return;
  if ('fgx' in d.dataset) return POP ? window.close() : OUT ? desk.forgetWindow(null) : setOpen(false);
  if ('fginfo' in d.dataset) return desk?.forgetGuide ? desk.forgetGuide(true) : notify(guideHtml(), { ms: 30000 }).classList.add('fgg-note');
  if ('fgpop' in d.dataset) return store.set('forget:pop', !store.get('forget:pop', true)), paint();
  if ('fgset' in d.dataset) return POP ? desk.toastAct('settings') : toSettings();
  const r = d.closest<HTMLElement>('[data-fg]'), n = notes.find((x) => x.id === r?.dataset.fg), s = d.dataset;
  if (r && !n) return;
  if ('fgnew' in s) return setAdding(!adding);
  if ('fgfin' in s) return finish(n!);
  if ('fgsnooze' in s) return snooze(n!);
  if ('fgok' in s) seen(n!);
  (adding ? input : win).focus();
});
input.addEventListener('input', paintForm);
input.addEventListener('scroll', () => (mir.scrollLeft = input.scrollLeft));
input.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter') add();
  else if (e.key === 'Escape') input.value ? ((input.value = ''), paintForm()) : setAdding(false);
  else return;
  e.stopPropagation();
});
win.addEventListener('focusin', () => win.classList.add('sel'));
win.addEventListener('focusout', (e: FocusEvent) => !win.contains(e.relatedTarget) && win.classList.remove('sel'));
win.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.target !== win || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;
  adding = true;
  paint();
  input.focus();
  e.stopPropagation();
});
paintColors();
rowIcons({ 'forget:popBtn': () => ICONS.bell, 'forget:info': () => ICONS.info, 'forget:setBtn': () => ICONS.settings, 'forget:addLine': () => icon('plus') });
barMenu('#fg-head', 'forget');
for (const k of ['forget:popBtn', 'forget:info', 'forget:setBtn', 'forget:addLine']) onPref(k, () => paint());
head.querySelector('[data-fgset]').innerHTML = ICONS.settings;
head.querySelector('[data-fginfo]').innerHTML = ICONS.info;
head.querySelector('[data-fgpop]').innerHTML = ICONS.bell.replace('</svg>', '<path class="fg-slash" d="M2.5 2.5l11 11"/></svg>');
if (POP) {
  document.body.classList.add('fg-pop');
  document.documentElement.classList.add('wbar');
  open = true;
  const toAdd = () => ((adding = true), paint(), input.focus());
  setTheme(store.text('theme3')!);
  addEventListener('storage', (e) => (e.key === 'mind.' + addKey() ? toAdd() : e.key === 'mind.forget:pop' ? paint() : e.key === 'mind.forget:colors' ? paintColors() : e.key === 'mind.solid' ? setSolid(e.newValue!) : e.key === 'mind.theme3' && setTheme(e.newValue!)));
  placeForget();
  if (Date.now() - store.get(addKey(), 0) < 5000) toAdd();
} else if (OUT) {
  const out = (on: unknown) => ((popped = !!on), paint());
  desk.onForgetPop(out);
  desk.forgetWindow().then(out);
  desk.onAway?.((kinds) => ((awayNow = kinds.includes('forget')), paint()));
}
if (!POP && WIN === 1) desk?.onForgetAct?.(listAct);
if (WIN === 1) {
  addEventListener('resize', () => !win.hidden && !POP && fit());
  every(10000, () => loaded && paint());
  addEventListener('storage', (e) => e.key === 'mind.forget:saved' && loaded && fetchNotes());
  addEventListener('focus', () => {
    if (loaded) fetchNotes();
  });
}
