import { AM, store, uid } from './util.ts';

export type Msg = { t: string; from: string; of: string; n: number; am: number; lv: string; pop?: boolean; [k: string]: any };
type Other = { n: number; pop: boolean; lvl: string; paths: Set<string>; agents: Set<string>; types: Set<string>; spare: boolean };
type Here = { w: string; p: string } | null;

const q = new URLSearchParams(location.search);
export let WIN = Math.max(1, Math.floor(Number(q.get('win'))) || 1);
export let POP = WIN > 1 && q.has('pop');
export let SOLO = POP ? q.get('solo') || '' : '';
let spare = POP && !SOLO && q.has('spare');
if (WIN === 1 && !window.name.startsWith('pm:')) window.name = 'pm:' + uid();
export const ME = WIN === 1 ? window.name.slice(3) : uid();
let lead = WIN === 1 ? ME : q.get('of') || '';
export const leadId = () => lead;

const ch = typeof BroadcastChannel === 'function' && !['/forget.html', '/qterm.html', '/ue.html'].includes(location.pathname) ? new BroadcastChannel('pm-windows') : null;
const subs = new Map<string, ((m: Msg) => void)[]>();
let lvNow = '';
export const send = (t: string, d: Record<string, unknown> | null = {}) => ch?.postMessage({ ...d, t, from: ME, of: lead, n: WIN, am: AM, lv: lvNow, ...(POP ? { pop: true } : {}) });
export function on(t: string, fn: (m: Msg) => void) {
  subs.set(t, [...(subs.get(t) || []), fn]);
}
export const sameLevel = (m: { lv?: string }): boolean => !m.lv || !lvNow || m.lv === lvNow;
export const forMe = (m: { win?: number; lv?: string }): boolean => !spare && m.win === WIN && sameLevel(m);
export const toSpare = (m: { win?: number; lv?: string }): boolean => spare && m.win === WIN && sameLevel(m);

const slot = (n: number, lv = lvNow) => lv + '#' + n;
const open = new Map<string, string>();
const others = new Map<string, Other>();
let focused = { from: ME, n: WIN };
const lockSubs: (() => void)[] = [];
export const onLock = (fn: () => void) => lockSubs.push(fn);
const locks = () => lockSubs.forEach((fn) => fn());
const heldSubs: (() => void)[] = [];
export const onHeld = (fn: () => void) => heldSubs.push(fn);
export const heldElsewhere = (id: string): boolean => [...others.values()].some((o) => o.agents.has(id));
export const popWith = (lvl: string, type: string): number => [...others.values()].find((o) => o.pop && o.lvl === lvl && o.types.has(type))?.n || 0;
export const spareWin = (): number => [...others.values()].find((o) => o.spare)?.n || 0;

export function lockOf(lvl: string, path: string): number {
  if (focused.from === ME) return 0;
  const o = others.get(focused.from);
  return o && o.lvl === lvl && o.paths.has(path) ? focused.n : 0;
}
export function lockText(n: number): string {
  const o = [...others.values()].find((x) => x.n === n && x.pop);
  return o ? `editing in ${o.types.has('quick') ? 'the Quick Window' : 'a small window'}` : `editing in Window ${n}`;
}
const given = new Map<string, number>();
const taken = (n: number) => n === WIN || Date.now() - (given.get(slot(n)) || 0) < 10000;
const anyLevel = (n: number) => [...open.keys()].some((k) => k.endsWith('#' + n)) || [...others.values()].some((o) => o.n === n) || [...given].some(([k, at]) => k.endsWith('#' + n) && Date.now() - at < 10000);
const deadSubs: ((n: number, pop: boolean) => void)[] = [];
export const onDead = (fn: (n: number, pop: boolean) => void) => deadSubs.push(fn);
function dead(n: number) {
  const pop = [...others.values()].some((o) => o.n === n && o.pop && (!o.lvl || o.lvl === lvNow));
  forgetWin(n);
  deadSubs.forEach((fn) => fn(n, pop));
}
const freed = new Map<string, number>();
on('freed', (m) => freed.set(slot(m.win, m.lv), Date.now()));
on('gone', (m) => {
  if (!sameLevel(m)) return;
  if (WIN !== 1) return void (isOpen(m.win) && forgetWin(m.win));
  if (isOpen(m.win)) dead(m.win);
  send('freed', { win: m.win });
});
async function alive(n: number): Promise<boolean> {
  if (!window.amethyst?.windowAlive || (await window.amethyst.windowAlive(lead, n))) return true;
  if (!isOpen(n)) return false;
  if (WIN === 1) return dead(n), false;
  const at = Date.now();
  send('gone', { win: n });
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if ((freed.get(slot(n)) || 0) >= at) return forgetWin(n), false;
  }
  return true;
}
export async function freeNumber(pop = false): Promise<number> {
  for (let n = pop ? 100 : 2; ; n++) {
    if (taken(n) || (isOpen(n) && (pop || (await alive(n))))) continue;
    if (taken(n) || isOpen(n) || (pop && anyLevel(n))) continue;
    given.set(slot(n), Date.now());
    return n;
  }
}
export const address = (n: number, w: string, p: string | null | undefined, pop = false, more = ''): string => `/app?w=${encodeURIComponent(w)}${p ? `&p=${encodeURIComponent(p)}` : ''}&win=${n}${pop ? '&pop=1' : ''}${more}${AM > 1 ? `&am=${AM}` : ''}&of=${encodeURIComponent(lead)}`;
export function forgetAm(n: number) {
  const mark = new RegExp(`@${n}(?=$|[#:])`);
  for (const k of store.keys()) if (mark.test(k)) store.del(k);
  return window.amethyst?.forgetAmethyst?.(n);
}
export const isOpen = (n: number): boolean => open.has(slot(n));
function forgetWin(n: number) {
  open.delete(slot(n));
  for (const [id, o] of others) if (o.n === n && (!o.lvl || o.lvl === lvNow)) others.delete(id);
  locks();
  heldSubs.forEach((fn) => fn());
}
const answered = new Map<string, number>();
const waiters = new Map<string, Set<() => void>>();
on('raised', (m) => {
  const k = slot(m.was || m.n, m.lv);
  answered.set(k, Date.now());
  const ws = waiters.get(k);
  if (ws) (waiters.delete(k), ws.forEach((fn) => fn()));
});
export async function reach(n: number, msgs: [string, Record<string, unknown>][]): Promise<boolean> {
  const at = Date.now(), k = slot(n);
  for (const [t, d] of msgs) send(t, { win: n, ...d });
  if (!isOpen(n)) return true;
  if ((answered.get(k) || 0) >= at) return true;
  const ok = await new Promise<boolean>((resolve) => {
    const done = (v: boolean) => {
      clearTimeout(t);
      waiters.get(k)?.delete(hit);
      resolve(v);
    };
    const hit = () => done(true);
    const t = setTimeout(() => done(false), 600);
    const ws = waiters.get(k) || new Set<() => void>();
    ws.add(hit);
    waiters.set(k, ws);
  });
  if (ok || (answered.get(k) || 0) >= at) return true;
  if (window.amethyst?.windowAlive && (await window.amethyst.windowAlive(lead, n))) return true;
  forgetWin(n);
  return false;
}

let mine: { lvl: string; paths: string[]; agents: string[]; types: string[]; cells: string[]; spare: boolean } = { lvl: '', paths: [], agents: [], types: [], cells: [], spare };
let last: [string, string[], string[], string[]] = ['', [], [], []], held: string | null = null;
let cells: string[] = [];
const kindNow = () => SOLO || (POP && !spare ? 'quick' : '');
export function share(lvl: string, paths: string[], agents: string[] = [], types: string[] = []) {
  last = [lvl, paths, agents, types];
  lvNow = lvl;
  const next = { lvl, paths: [...new Set(paths)].sort(), agents: [...new Set(held ? [...agents, held] : agents)].sort(), types: [...new Set(kindNow() ? [...types, kindNow()] : types)].sort(), cells, spare };
  if (JSON.stringify(next) === JSON.stringify(mine)) return;
  mine = next;
  send('paths', mine);
}
export function shareCells(ids: string[]) {
  cells = [...new Set(ids)].sort();
  share(...last);
}
const away = new Map<string, { am: number; ids: Set<string> }>();
export const openAway = (id: string): number => [...away.values()].find((o) => o.ids.has(id))?.am || 0;
function fromAway(m: Msg) {
  if (m.t === 'bye') return away.delete(m.from);
  if (m.t !== 'paths') return;
  const known = away.has(m.from);
  away.set(m.from, { am: m.am || 1, ids: new Set([...(m.agents || []), ...(m.cells || [])]) });
  if (!known) send('paths', mine);
}
export const isSpare = () => spare;
export function claim(kind = '') {
  spare = false;
  const u = new URL(location.href);
  u.searchParams.delete('spare');
  if (kind) u.searchParams.set('solo', (SOLO = kind));
  history.replaceState(null, '', u);
  share(...last);
}
export function claimWin(n: number) {
  spare = false;
  POP = false;
  SOLO = '';
  WIN = n;
  const u = new URL(location.href);
  u.searchParams.delete('spare');
  u.searchParams.delete('pop');
  u.searchParams.delete('solo');
  u.searchParams.set('win', String(n));
  history.replaceState(null, '', u);
  send('win');
  share(...last);
}
export function hold(id: string | null, lvl: string) {
  held = id;
  share(last[0] || lvl, ...(last.slice(1) as [string[], string[], string[]]));
}

let here: () => Here = () => null;
const tellApp = (h: Here) => h && window.amethyst?.atProject?.(h.w, h.p);
export function hereIs(fn: () => Here) {
  here = fn;
  if (WIN === 1) send('here', fn()), tellApp(fn());
}
export const announce = () => WIN === 1 && (send('here', here()), tellApp(here()));

let leadSeen = WIN === 1, leadAt = 0, candidate: string | null = null;
if (WIN > 1)
  setTimeout(() => {
    if (leadSeen || !candidate) return;
    lead = candidate;
    leadSeen = true;
    const u = new URL(location.href);
    u.searchParams.set('of', lead);
    history.replaceState(null, '', u);
    send('who');
    send('win');
  }, 1000);
function leadGone() {
  const at = leadAt;
  setTimeout(() => leadAt === at && window.close(), 2500);
}

let refused = 0;
export const refusedLately = () => Date.now() - refused < 500;

ch?.addEventListener('message', (e) => {
  const m = e.data;
  if (!m || m.from === ME) return;
  if (m.t === 'refused') return void (refused = Date.now());
  if (WIN > 1 && m.t === 'here' && m.n === 1 && (m.am || 1) === AM && m.from !== lead && !leadSeen && (!candidate || (m.w === q.get('w') && (m.p || '') === (q.get('p') || '')))) candidate = m.from;
  if (WIN === 1 && m.t === 'who' && !m.of) send('here', here());
  if (m.of !== lead) return void (m.of && leadSeen && fromAway(m));
  if (m.n === 1 && m.from === lead) {
    leadSeen = true;
    leadAt = Date.now();
    if (m.t === 'bye') leadGone();
  }
  if (m.t === 'who') {
    if (WIN === 1) send('here', here());
    else send('win');
    send('paths', mine);
    if (focused.from === ME && document.hasFocus()) send('focus');
  }
  const drop = () => open.forEach((id, k) => id === m.from && open.delete(k));
  if (m.n > 1 && (m.t === 'win' || m.t === 'who' || m.t === 'paths')) drop(), open.set(slot(m.n, m.lv), m.from), given.delete(slot(m.n, m.lv));
  if (m.t === 'bye') {
    drop();
    others.delete(m.from);
    if (focused.from === m.from) focused = { from: ME, n: WIN };
    locks();
    heldSubs.forEach((fn) => fn());
  }
  if (m.t === 'paths') {
    others.set(m.from, { n: m.n, pop: !!m.pop, lvl: m.lvl, paths: new Set(m.paths), agents: new Set(m.agents), types: new Set(m.types || []), spare: !!m.spare });
    locks();
    heldSubs.forEach((fn) => fn());
  }
  if (m.t === 'focus') {
    focused = { from: m.from, n: m.n };
    locks();
  }
  for (const fn of subs.get(m.t) || []) fn(m);
});

window.addEventListener('focus', () => {
  focused = { from: ME, n: WIN };
  send('focus');
  locks();
});
window.addEventListener('pagehide', () => send('bye'));
send('who');
if (WIN > 1) send('win');
if (document.hasFocus()) send('focus');
