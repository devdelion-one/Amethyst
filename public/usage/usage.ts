import { barMenu, buttonMenu, chip, ICONS, miRow, rowIcons } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { api } from '../base/model.ts';
import { page } from '../base/page.ts';
import { allLimits, limitsOf, limitsRead, notify, tell, watchLimits } from '../base/notify.ts';
import { chatOn, isOff, onPref, pref, setPref } from '../base/prefs.ts';
import { $, AM, esc, store } from '../base/util.ts';
import { every } from '../base/life.ts';
import { WIN } from '../base/windows.ts';
import { repairLine, setShare, shareChips } from '../base/accounts.ts';
import { plural, tokens } from '../base/words.ts';

type Lim = { key: string; name: string; pct: number; resets?: number; at: number; agent: string; [k: string]: any };
type Acct = { id: string; signedIn?: boolean; email?: string; plan?: string; [k: string]: any };

const POLL = 5 * 60e3, FRESH = 60e3, BG = POLL * 0.9;
const SPANS = { session: 5 * 3600e3, week: 7 * 24 * 3600e3 };
const NAMES = { session: 'Current session', weekly: 'Weekly limit', monthly: 'Monthly limit' };
const STEPS = [50, 75, 80, 90, 100];
const btn = $('#st-usage');
const win = Object.assign(document.createElement('div'), { id: 'usage-win', className: 'float', hidden: true });
document.body.append(win);
let reading = { claude: { tokens: [] }, codex: null, antigravity: null, cursor: null, copilot: null, grok: null } as { claude: any; codex: any; antigravity: any; cursor: any; copilot: any; grok: any }, readAt = 0, asking: string | null = null, again = null as unknown as number, waitTill = 0;

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
function resetLine(ms: number) {
  const d = new Date(ms);
  if (d.toDateString() === new Date().toDateString()) return `resets at ${clock(ms)}`;
  if (ms - Date.now() < SPANS.week) return `resets ${d.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(ms)}`;
  return `resets ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
const sumSince = (list: [number, number][], ms: number) => list.reduce((sum: number, [at, n]) => sum + (at >= ms ? n : 0), 0);

const nowPct = (l: Lim): number => (l.resets && l.resets < Date.now() ? 0 : l.pct);

function tokenLine(l: Lim, list: [number, number][]) {
  const span = (SPANS as Record<string, number>)[l.key];
  if (!span || !l.resets || !list.length) return '';
  const used = sumSince(list, l.resets - span), pct = nowPct(l);
  if (!used) return '';
  return `${tokens(used)} tokens` + (pct >= 5 && pct < 100 ? `, ~${tokens((used / pct) * (100 - pct))} left` : '');
}

const groupOf = (l: Lim) => l.key.split(' ').slice(0, -1).join(' ');
const spanName = (l: Lim) => (l.key.endsWith(' session') ? '5-hour limit' : l.key.endsWith(' week') ? 'Weekly limit' : '');
const limitName = (l: Lim) => (l.agent === 'antigravity' && spanName(l) ? `${groupOf(l)} ${spanName(l).toLowerCase()}`.trim() : (NAMES as Record<string, string>)[l.name] || l.name[0].toUpperCase() + l.name.slice(1) + ' limit');
function leftShort(ms?: number) {
  if (!ms || ms <= Date.now()) return '';
  const m = Math.ceil((ms - Date.now()) / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}
function row(l: Lim, name = limitName(l)) {
  const pct = nowPct(l), live = !!l.resets && l.resets > Date.now();
  const reset = l.resets ? (live ? 'resets in ' + leftShort(l.resets) : 'has reset') : '';
  return `<div class="uw-row"${live ? ` title="${esc(resetLine(l.resets!))}"` : ''}><div class="uw-n"><span>${esc(name)}</span><small>${esc(reset)}</small><b class="uw-pct">${pct}%</b></div><i class="uw-bar ${level(pct)}" style="--p:${pct}"></i></div>`;
}

const planOf = (a: Acct) => (a.plan ? a.plan[0].toUpperCase() + a.plan.slice(1) : 'Claude');
const nameOf = (a: Acct) => `${planOf(a)}${a.email ? ' · ' + a.email.split('@')[0] : ''}`;
export const userOf = (a: Acct) => (!a.signedIn ? 'sign in…' : a.email ? a.email.split('@')[0] : planOf(a));
const CHEVRON = '<svg class="ic uw-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
const PLUS = '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
const CHECK = '<svg class="ic uw-chk" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.4 6.5 11.7 13 4.8"/></svg>';
let menu = false, sel: string | null = null, opening = false;
let agyOpen = false, agyAsk: string | null = null;
const looks = new Map<string, any>(), waking = new Map<string, string>(), held = new Map<string, number>();
const HOLD = 60e3;
let wakingAll = '';
const inUse = () => reading.claude.accounts?.find((a: Acct) => a.id === reading.claude.account) || reading.claude.accounts?.[0];
const lookedAt = () => reading.claude.accounts?.find((a: Acct) => a.id === sel) || inUse();
function look(id: string) {
  sel = id;
  const a = lookedAt();
  if (a.signedIn && a.id !== inUse().id && (!looks.has(id) || looks.get(id) === 'failed')) {
    looks.set(id, 'reading');
    api('GET', '/api/agent/account?id=' + encodeURIComponent(id)).then((r: any) => looks.set(id, r), () => looks.set(id, 'failed')).then(() => menu && draw());
  }
  draw();
}
function moveLine(a: Acct, cur: Acct, r: any) {
  const busy = r?.busy || 0, terms = r?.terms || 0, old = userOf(cur);
  if (!busy && !terms) return `chats move to ${userOf(a)} at their next message, same conversation`;
  return [
    busy && `${busy === 1 ? '1 chat finishes its' : busy + ' chats finish their'} turn on ${old} first.`,
    terms && `${terms === 1 ? '1 claude terminal stays' : terms + ' claude terminals stay'} on ${busy ? 'it' : old}.`,
    'Nothing is closed.',
  ].filter(Boolean).join(' ');
}
function limsOf(a: Acct, cur: Acct = inUse()) {
  const got = looks.get(a.id);
  return (a.signedIn && a.id === cur.id ? (allLimits() as any[]).filter((l) => l.agent === 'claude') : got?.limits ? limitsOf('claude', got.limits) : []).sort((x, y) => (x.key === 'session' ? -1 : y.key === 'session' ? 1 : 0));
}
const runsTill = (lims: Lim[]) => lims.find((l) => l.key === 'session' && l.resets! > Date.now())?.resets || 0;
const fullOf = (lims: Lim[]) => (runsTill(lims) ? undefined : lims.find((l) => l.key !== 'session' && nowPct(l) >= 100));
const isHeld = (id: string) => (held.get(id) || 0) > Date.now();
const HOLD_TIP = 'Start\nThe hi was sent. Waiting for Claude to show the 5-hour window.\n\nStart works again a minute after the last one.';
const WAKE_TIP = "Start\nStarts this account's 5-hour window now. It sends hi to Haiku in a hidden chat, which uses a tiny bit of the session.";
function wakeButton(a: Acct, lims: Lim[], wait: boolean) {
  if (!pref('usage:wake') || !a.signedIn) return '';
  const st = waking.get(a.id), till = runsTill(lims), full = fullOf(lims), hold = isHeld(a.id);
  if (!st && wait) return '<span class="uw-wake"></span>';
  const tip = st === 'sure?' ? 'Start\nClick again to start the 5-hour window.' : st ? '' : till ? `Start\nThe 5-hour window is running already. It ${resetLine(till)}.` : hold ? HOLD_TIP : full ? `Start\nThe ${limitName(full).toLowerCase()} is full.${full.resets ? ` It ${resetLine(full.resets)}.` : ''}` : WAKE_TIP;
  const off = (st && st !== 'sure?') || (!st && (till || hold || full));
  return `<button class="uw-wake${st === 'sure?' ? ' ask' : ''}" data-uw-wake="${esc(a.id)}"${off ? ' aria-disabled="true"' : ''} title="${esc(tip)}">${esc(st || 'Start')}</button>`;
}
function removeButton(a: Acct) {
  const main = a.id === 'default';
  if (main && !a.signedIn) return '<span class="uw-rm"></span>';
  const ask = asking === a.id, word = main ? 'Sign out' : 'Remove';
  const tip = ask ? (main ? 'Sign out?\nClick again to sign out.' : 'Remove?\nClick again to remove it.') : main ? `Sign out\nSigns ${userOf(a)} out of Claude Code. It stays in the list: Sign in signs it in again, as this login or another.` : `Remove\nRemoves ${a.signedIn ? userOf(a) : 'this account'} and signs it out. Its folder ${a.dir || ''} stays, and its chats stay in the main folder.`;
  return `<span class="uw-rm"><button class="${ask ? 'ask' : ''}" data-uw-forget="${esc(a.id)}" title="${esc(tip)}">${ask ? `${word}?` : `${word}…`}</button></span>`;
}
function pane(a: Acct, cur: Acct) {
  const on = a.signedIn && a.id === cur.id, got = looks.get(a.id), wait = a.signedIn && !on && (!got || got === 'reading');
  const lims = limsOf(a, cur);
  const none = (t: string) => `<div class="uw-pnone">${t}</div>`;
  const prow = (l: Lim) => {
    const pct = nowPct(l), reset = l.resets ? (l.resets < Date.now() ? 'has reset' : resetLine(l.resets)) : '';
    return `<div class="uw-prow"><span>${esc(limitName(l))}</span><em>${esc(reset)}</em><i>${pct}%</i><b class="uw-bar ${pct >= 100 ? 'full' : pct > 75 ? 'warn' : ''}" style="--p:${pct}"></b></div>`;
  };
  const body = !a.signedIn ? none('its limits show here after the sign-in')
    : wait ? none('reading its limits…') : got === 'failed' ? none("couldn't read its limits") : lims.length ? lims.map(prow).join('') : none('no limits reported');
  const full = !on && lims.find((l) => nowPct(l) >= 100);
  const note = !a.signedIn ? esc(`Sign-in opens in a terminal window. Claude stays on ${userOf(cur)}.`) : on ? ''
    : (full ? `<span class="full">${esc(`${limitName(full)} is full${full.resets ? ', ' + resetLine(full.resets) : ''}.`)}</span> ` : '') + esc(moveLine(a, cur, got));
  const warn = a.signedIn && !on && (got?.busy || got?.terms);
  const act = !a.signedIn ? `<button class="primary uw-go" data-uw-go title="Sign in\nSigns in to this account in a terminal window.">Sign in…</button>`
    : on ? `<span class="uw-in">${CHECK}<span>In use</span></span>` : `<button class="primary uw-go" data-uw-go title="${esc(`Switch\nSwitches Claude to ${userOf(a)}. Chats move at their next message, nothing is closed.`)}" data-tip-keys="=enter:switch">Switch</button>`;
  const fix = repairLine(a);
  const set = a.dir ? `<div class="uw-pset">${shareChips(a)}</div>${fix ? `<div class="uw-fix" title="${esc(fix)}" data-tip-cut>${esc(fix)}</div>` : ''}` : '';
  const planBadge = a.signedIn && a.plan ? `<span class="uw-pbadge">${esc(a.plan)}</span>` : '';
  const emailLine = !a.signedIn ? 'Not signed in' : a.email || '';
  return `<div class="uw-pane"><div class="uw-ph"><div class="uw-ph-row"><b>${esc(a.signedIn ? userOf(a) : 'This account')}</b>${planBadge}</div>${emailLine ? `<span class="uw-email">${esc(emailLine)}</span>` : ''}</div><div class="uw-lims">${body}</div>${note ? `<div class="uw-pnote${warn ? ' warn' : ''}">${note}</div>` : ''}${set}<div class="uw-pfoot">${removeButton(a)}${wakeButton(a, lims, wait || got === 'failed')}${act}</div></div>`;
}
function wakeAllButton(list: Acct[]) {
  if (!pref('usage:wake')) return '';
  const signed = list.filter((a: Acct) => a.signedIn), off = !wakingAll && signed.every((a) => runsTill(limsOf(a)) || isHeld(a.id) || fullOf(limsOf(a)));
  const tip = wakingAll === 'sure?' ? 'Start all\nClick again to start them.' : wakingAll ? '' : off ? "Start all\nEvery account's 5-hour window is running, just started or has a full limit." : "Start all\nStarts every account's 5-hour window that isn't running. It sends hi to Haiku as each account in a hidden chat, one after another.";
  return `<button class="uw-wake uw-wall${wakingAll === 'sure?' ? ' ask' : ''}" data-uw-wake-all${off || (wakingAll && wakingAll !== 'sure?') ? ' aria-disabled="true"' : ''} title="${esc(tip)}">${esc(wakingAll || 'Start all 5h windows')}</button>`;
}
const acctChip = (cur: Acct) => `<button class="chip uw-acct" data-uw-open aria-haspopup="listbox" aria-expanded="${menu}" title="${esc(`${cur.email || userOf(cur)}\nThe Claude account these limits are for. Click to look at, switch or add an account.`)}"><b>${cur.signedIn && cur.plan ? `<span class="uw-plan">${esc(cur.plan)}</span>` : ''}${esc(userOf(cur))}</b>${CHEVRON}</button>`;
function accounts() {
  const { accounts: list } = reading.claude;
  if (!list?.length || !pref('usage:accounts')) return '';
  const cur = inUse();
  const chip = acctChip(cur);
  if (!menu) return `<span class="uw-sw">${chip}</span>`;
  const shown = lookedAt();
  const items = list.map((a: Acct) => {
    const on = a.id === cur.id;
    const lims = limsOf(a, cur), s5 = lims.find((l) => l.key === 'session');
    const twin = a.signedIn && a.email && list.some((b: Acct) => b !== a && b.signedIn && b.email === a.email);
    const sub = twin
      ? `<span class="uw-rsub"><em class="uw-same" title="${esc(`Same login\nAnother account here is signed in as ${a.email} too, so both use the same limits.\n\nRemove one of them.`)}">same login</em></span>`
      : s5
        ? `<span class="uw-rbar"><i class="uw-bar ${nowPct(s5) >= 100 ? 'full' : nowPct(s5) > 75 ? 'warn' : ''}" style="--p:${nowPct(s5)}"></i><em>${nowPct(s5)}%</em></span>`
        : `<span class="uw-rsub">${esc(!a.signedIn ? 'not signed in' : a.plan ? planOf(a) + ' plan' : 'signed in')}</span>`;
    return `<button class="cpo uw-ritem${on ? ' on' : ''}" role="option" aria-selected="${a.id === shown.id}" data-uw-acct="${esc(a.id)}"><span class="cpo-t"><span class="uw-rtop"><b>${esc(userOf(a))}</b>${on ? `<span class="uw-in uw-rin" title="In use">${CHECK}</span>` : ''}</span>${sub}</span></button>`;
  });
  const pop = opening;
  opening = false;
  const wall = wakeAllButton(list);
  return `<span class="uw-sw">${chip}<div class="uw-menu uw-split-menu${pop ? ' pop' : ''}" role="listbox" aria-label="claude accounts"><div class="uw-rail"><div class="cpp-head"><b>Accounts</b></div><div class="uw-list">${items.join('')}</div><div class="uw-rfoot"><button class="uw-add" data-uw-add title="Add account\nAdds a Claude account. You sign in to it in a terminal window.">${PLUS}<span>Add account</span></button>${wall}</div></div>${pane(shown, cur)}</div></span>`;
}

type AgyTokenEntry = { at: number; total: number; input: number; output: number; cached: number; thinking: number };
type AgyWeek = { total: number; input: number; output: number; cached: number; thinking: number };
type AgyAcct = { id: string; method: string; line: string; inUse: boolean; email?: string | null; tier?: string | null; tokens?: number; tokenLog?: AgyTokenEntry[] };
function agyWeek(log: AgyTokenEntry[] | undefined, since = Date.now() - SPANS.week): AgyWeek {
  const out: AgyWeek = { total: 0, input: 0, output: 0, cached: 0, thinking: 0 };
  if (!Array.isArray(log)) return out;
  for (const e of log) {
    if (!e || e.at < since) continue;
    out.total += e.total || 0;
    out.input += e.input || 0;
    out.output += e.output || 0;
    out.cached += e.cached || 0;
    out.thinking += e.thinking || 0;
  }
  return out;
}
function agySummary(agy: any): { sum: string; tip: string; extra: string } {
  if (!agy) return { sum: '', tip: '', extra: '' };
  if (Array.isArray(agy.tokenLog)) {
    const w = agyWeek(agy.tokenLog);
    if (!w.total) return { sum: `uses ${agy.email || agy.line}`, tip: '', extra: '' };
    const tip = `Last 7 days\nInput: ${tokens(w.input)}\nOutput: ${tokens(w.output)}\nCached: ${tokens(w.cached)}\nThinking: ${tokens(w.thinking)}`;
    const extra = `<div class="uw-split" aria-label="antigravity token breakdown"><span>Input <b>${esc(tokens(w.input))}</b></span><span>Output <b>${esc(tokens(w.output))}</b></span><span>Cached <b>${esc(tokens(w.cached))}</b></span><span>Thinking <b>${esc(tokens(w.thinking))}</b></span></div>`;
    return { sum: `${tokens(w.total)} tokens in the last 7 days`, tip, extra };
  }
  if (agy.tokens) return { sum: `${tokens(agy.tokens)} tokens used`, tip: 'Lifetime tokens\nRecorded before 7-day breakdown tracking started.', extra: '' };
  return { sum: `uses ${agy.email || agy.line}`, tip: '', extra: '' };
}
const AGY_GOOGLE = ['oauth-personal', 'oauth-business'];
const AGY_LOGIN = 'Sign in\nOpens a terminal window that signs in to Antigravity CLI. Sign in there and the next message uses it.';
const AGY_WAYS: Record<string, string> = { 'oauth-personal': 'Google sign-in', 'oauth-business': 'Gemini Enterprise', 'gemini-api-key': 'API key', 'agent-platform': 'Agent Platform' };
function agyAccounts() {
  const g = reading.antigravity;
  if (!g || !pref('usage:accounts')) return '';
  const list: AgyAcct[] = g.accounts || [], cur = list.find((a) => a.inUse), now = cur || (list.length ? null : g);
  const chip = `<button class="chip uw-acct" data-uw-agy-open aria-haspopup="listbox" aria-expanded="${agyOpen}" title="${esc(`Antigravity sign-in\n${cur ? `In use: ${cur.email || cur.line}.` : 'Your Antigravity CLI sign-in.'} Click to switch, add or remove one.`)}"><b>${now?.tier ? `<span class="uw-plan">${esc(now.tier)}</span>` : ''}${esc(now ? now.email || now.line : 'none in use')}</b>${CHEVRON}</button>`;
  if (!agyOpen) return `<span class="uw-sw">${chip}</span>`;
  const row = (a: AgyAcct) => {
    const ask = agyAsk === a.id, google = AGY_GOOGLE.includes(a.method), who = a.email || a.line;
    const login = google ? `<button class="uw-go" data-uw-agy-login="${esc(a.id)}" title="${esc(AGY_LOGIN)}">Sign in…</button>` : '';
    const act = a.inUse ? `<span class="uw-in">${CHECK}<span>In use</span></span>` : `<button class="primary uw-go" data-uw-agy-use="${esc(a.id)}" title="${esc(`Switch\nSwitches Antigravity to ${who}. Open Antigravity chats move at their next message, nothing is closed.`)}">Switch</button>`;
    const rm = `<span class="uw-rm"><button class="${ask ? 'ask' : ''}" data-uw-agy-forget="${esc(a.id)}" title="${esc(ask ? 'Remove?\nClick again to remove it.' : `Remove\nTakes ${who} off Amethyst's list. Antigravity CLI's own sign-in stays as it is.`)}">${ask ? 'Remove?' : 'Remove…'}</button></span>`;
    return `<div class="cpo uw-agy${a.inUse ? ' on' : ''}" role="option" aria-selected="${a.inUse}"><span class="cpo-t"><b>${esc(who)}</b><span>${esc(google && !a.email ? 'signed-in account shows after the first chat' : AGY_WAYS[a.method] || a.method)}</span></span>${rm}${login}${act}</div>`;
  };
  const had = new Set(list.map((a) => a.method));
  const ways = Object.entries(AGY_WAYS).filter(([m]) => m !== 'gemini-api-key' && !had.has(m)).map(([m, n]) => `<button class="uw-add" data-uw-agy-way="${m}" title="${esc(AGY_GOOGLE.includes(m) ? `${n}\nAdds ${n} and uses it, then opens a terminal window that signs in to Antigravity CLI. Sign in there and the next message uses it.` : `${n}\nAdds ${n} as a way to sign in and uses it.`)}">+ ${esc(n)}</button>`).join('');
  const add = `<div class="uw-agy-key"><input type="password" data-uw-agy-key placeholder="add a Gemini API key" autocomplete="off" spellcheck="false" aria-label="a Gemini API key to add"><button class="primary uw-go" data-uw-agy-addkey title="Add\nAdds this key and uses it. It stays on this PC and goes only to Antigravity CLI.">Add</button></div>`;
  const pop = opening;
  opening = false;
  return `<span class="uw-sw">${chip}<div class="uw-menu${pop ? ' pop' : ''}" role="listbox" aria-label="antigravity sign-ins"><div class="cpp-head"><b>Sign-ins</b></div><div class="uw-list">${list.length ? list.map(row).join('') : '<div class="uw-pnone">none added yet: Antigravity uses its own CLI sign-in</div>'}</div>${add}${ways}</div></span>`;
}
function agyMenu(open: boolean) {
  if (agyOpen === open) return;
  if (open) showMenu(false);
  agyOpen = opening = open;
  agyAsk = null;
  document[open ? 'addEventListener' : 'removeEventListener']('pointerdown', agyAway, true);
  document[open ? 'addEventListener' : 'removeEventListener']('keydown', agyKeys as EventListener, true);
  draw();
}
const agyAway = (e: Event) => !(e.target as HTMLElement).closest?.('.uw-sw') && agyMenu(false);
function agyKeys(e: KeyboardEvent) {
  if (e.key === 'Escape') return e.stopPropagation(), agyMenu(false);
  if (e.key === 'Enter' && (e.target as HTMLElement).matches?.('[data-uw-agy-key]')) return e.preventDefault(), agyAdd();
}
function agyTook(r: any, said: string) {
  reading.antigravity = { ...reading.antigravity, ...r };
  draw();
  notify(esc(`${said}${r.busy ? ` ${plural(r.busy, 'chat')} still answering ${r.busy > 1 ? 'move' : 'moves'} when ${r.busy > 1 ? 'they finish' : 'it finishes'}.` : ''}`));
}
async function agyAdd() {
  const box = win.querySelector('[data-uw-agy-key]') as HTMLInputElement | null, key = box?.value.trim() || '';
  if (!key) return tell(box || win, { title: 'Paste a Gemini API key first', line: 'it comes from Google AI Studio', ms: 3000 });
  try {
    const r = await api('PUT', '/api/agent/auth', { agent: 'antigravity', method: 'gemini-api-key', apiKey: key });
    agyTook(r, `Antigravity now uses ${r.line}.`);
  } catch (e) {
    tell(box || win, { title: "The key wasn't added", line: (e as Error).message, ms: 4000 });
  }
}
async function agyLogin(id?: string, way?: string) {
  const row = (reading.antigravity?.accounts || []).find((a: AgyAcct) => a.id === id);
  try {
    const r = way ? await api('PUT', '/api/agent/auth', { agent: 'antigravity', method: way }) : row && !row.inUse ? await api('PUT', '/api/agent/account', { agent: 'antigravity', use: id }) : null;
    if (r) reading.antigravity = { ...reading.antigravity, ...r };
    draw();
    const w = await api('POST', '/api/agent/login', { agent: 'antigravity' });
    notify(esc(w.opened ? 'A terminal window opened. Sign in to Antigravity CLI there and the next message uses it.' : `Sign in to Antigravity CLI in a terminal: ${w.cmd}`));
  } catch (e) {
    tell(win, { title: "The sign-in didn't open", line: (e as Error).message, ms: 4000 });
  }
}
const topBar = (on: boolean) => `<div class="uw-top float-head"><img src="amethyst.svg" alt="" draggable="false"><span>usage and limits</span><button class="uw-dash"${pref('usage:dashBtn') ? '' : ' hidden'} data-uw-dash aria-label="dashboard" title="Dashboard&#10;Opens the dashboard: tokens, cost, chats, commits and files changed per day.">${ICONS.dash}</button><button class="uw-pop"${pref('usage:popBtn') ? '' : ' hidden'} data-uw-pop role="switch" aria-checked="${on}" aria-label="usage pop-ups" title="Usage pop-ups: ${on ? 'on' : 'off'}&#10;A pop-up when a limit reaches 50, 75, 80, 90 and 100%. Click to turn them ${on ? 'off' : 'on'}.">${ICONS.bell}</button><button class="x" data-uw-close title="Close&#10;Closes this window." data-tip-keys="=esc:close" aria-label="close">${ICONS.wx}</button></div>`;
function agyRows(list: Lim[]) {
  const groups = [...new Set(list.map(groupOf))];
  return groups.map((g) => `<div class="uw-grp">${esc(g)}</div>` + list.filter((l) => groupOf(l) === g).sort((a, b) => spanOf(a) - spanOf(b)).map((l) => row(l, spanName(l))).join('')).join('');
}
const OPEN = 'usage:open';
const opened = () => new Set(store.get(OPEN, []) as string[]);
function fold(id: string) {
  const s = opened();
  if (!s.delete(id)) s.add(id);
  store.set(OPEN, [...s]);
  draw();
}
function shortName(l: Lim, label: boolean) {
  const s = spanOf(l), g = groupOf(l).split(' ')[0];
  const span = s === 300 ? '5h' : s === 10080 ? '7d' : /month/.test(l.name) ? 'mo' : s >= 1440 ? Math.round(s / 1440) + 'd' : s ? Math.round(s / 60) + 'h' : l.name;
  return label && g ? `${g} ${span}` : span;
}
function mostUsed(list: Lim[]) {
  const by = (l: Lim) => (l.resets && l.resets > Date.now() ? l.resets : Infinity);
  const two = [...list].sort((a, b) => nowPct(b) - nowPct(a) || by(a) - by(b)).slice(0, 2);
  return two.sort((a, b) => spanOf(a) - spanOf(b) || list.indexOf(a) - list.indexOf(b));
}
function mini(list: Lim[], note: string) {
  if (!list.length) return `<span class="uw-mnote">${esc(note)}</span>`;
  const two = mostUsed(list), label = two.length > 1 && groupOf(two[0]) !== groupOf(two[1]);
  return `<span class="uw-mini">${two.map((l) => {
    const pct = nowPct(l), left = leftShort(l.resets);
    const tip = `${limitName(l)}: ${pct}% used` + (left ? `, ${resetLine(l.resets!)}` : '');
    return `<span class="uw-ml" title="${esc(tip)}"><span>${esc(shortName(l, label))}</span><i class="uw-bar ${level(pct)}" style="--p:${pct}"></i><em>${esc(left)}</em><b>${pct}%</b></span>`;
  }).join('')}</span>`;
}
function agent(id: 'claude' | 'codex' | 'antigravity' | 'cursor' | 'copilot' | 'grok', name: string, note: string, sum: string, sumTip = '', extra = '') {
  if (!chatOn(id)) return '';
  const list = (allLimits() as any[]).filter((l) => l.agent === id).sort((a, b) => (a.key === 'session' ? -1 : b.key === 'session' ? 1 : 0));
  const open = opened().has(id);
  const tip = `${name}\nClick to ${open ? 'hide' : 'show'} its limits in full.`;
  const head = `<div class="uw-head uw-fold" data-uw-fold="${id}" role="button" tabindex="0" aria-expanded="${open}" title="${esc(tip)}"><span>${esc(name)}</span>${open ? (id === 'claude' ? accounts() : id === 'antigravity' ? agyAccounts() : '') : mini(list, note)}</div>`;
  if (!open) return `<section class="uw-agent" data-agent="${id}">${head}</section>`;
  const asOf = id === 'claude' && list.length ? `<div class="uw-asof">as of ${clock(Math.max(...list.map((l) => l.at)))}</div>` : '';
  const rows = !list.length ? `<div class="uw-none">${esc(note)}</div>` : id === 'antigravity' ? agyRows(list) : list.map((l) => row(l)).join('');
  const toks = list.map((l) => [l, tokenLine(l, reading[id]?.tokens || [])] as const).filter(([, t]) => t).map(([l, t]) => `<span>${esc(`${shortName(l, true)}: ${t}`)}</span>`).join('');
  const foot = toks || sum ? `<div class="uw-toks">${toks}${sum ? `<span class="uw-sum"${sumTip ? ` title="${esc(sumTip)}"` : ''}>${esc(sum)}</span>` : ''}</div>` : '';
  return `<section class="uw-agent open" data-agent="${id}">${head}${asOf}${rows}${foot || extra ? `<div class="uw-foot">${foot}${extra}</div>` : ''}</section>`;
}

type UsageSlot = { id: string; agent: string | null; meter: boolean; left: boolean; name: boolean };
const EXTRAS = 'usage:extra' + (AM > 1 ? ':' + AM : '');
const readExtras = (): UsageSlot[] => {
  const raw = store.get(EXTRAS, []);
  return Array.isArray(raw) ? raw.filter((x: any): x is UsageSlot => !!x && typeof x.id === 'string').map((x) => ({
    id: x.id, agent: typeof x.agent === 'string' ? x.agent : null, meter: !!x.meter, left: x.left !== false, name: x.name !== false,
  })) : [];
};
let extras: UsageSlot[] = readExtras();
let anchorBtn: HTMLElement = btn;
const allButtons = () => [...document.querySelectorAll<HTMLElement>('#status > .st-usage')];
const slotOf = (el: HTMLElement) => (el.dataset.usageId ? extras.find((x) => x.id === el.dataset.usageId) || null : null);
const cfgOf = (el: HTMLElement) => {
  const s = slotOf(el);
  return s ? { meter: s.meter, left: s.left, name: s.name, agent: s.agent } : { meter: !!pref('usage:meter'), left: !!pref('usage:left'), name: !!pref('usage:name'), agent: store.get(PICK, null) as string | null };
};
function setCfg(el: HTMLElement, key: 'meter' | 'left' | 'name', v: boolean) {
  const s = slotOf(el);
  if (s) {
    s[key] = v;
    store.set(EXTRAS, extras);
    paintButton(el);
  } else setPref('usage:' + key, v);
}
function setAgent(el: HTMLElement, a: string) {
  const s = slotOf(el);
  if (s) {
    s.agent = a;
    store.set(EXTRAS, extras);
    paintButton(el);
  } else {
    store.set(PICK, a);
    paintButton(el);
  }
}

const level = (pct: number) => (pct >= 100 ? 'full' : pct > 75 ? 'warn' : '');
function paintButton(el: HTMLElement = btn, cfg = cfgOf(el)) {
  const { meter, left: timed, name: named } = cfg;
  el.classList.toggle('meter', meter);
  const top = Math.max(0, ...(allLimits() as any[]).map(nowPct));
  el.classList.toggle('warn', !meter && top > 75 && top < 100);
  el.classList.toggle('full', !meter && top >= 100);
  el.removeAttribute('data-tip-wide');
  if (!meter) {
    el.removeAttribute('data-usage-agent');
    if (!el.querySelector('svg')) el.innerHTML = ICONS.usage;
    el.title = "Usage and limits\nHow much of each agent's limits you have used.\n\nRight-click to pick two bars instead of the gauge.";
    return;
  }
  const { got } = meterAgents(), a = shownAgent(el);
  el.dataset.usageAgent = a;
  el.classList.toggle('named', named);
  el.classList.toggle('timed', timed);
  const name = named ? `<span class="um-n">${esc(a)}</span>` : '';
  if (!REPORTS.includes(a)) {
    el.classList.add('none');
    el.innerHTML = `${name}<span class="um-none">no limits</span>`;
    el.title = `${AGENT_WORD[a]}\n${AGENT_WORD[a]} reports no limits. Claude, Codex and Antigravity do: turn one on in Settings to see its limits here.\n\nClick for usage and limits.`;
    return;
  }
  el.classList.remove('none');
  el.toggleAttribute('data-tip-wide', true);
  const lims = meterLims(a);
  const rows = lims.map((l, i) => {
    const pct = l ? nowPct(l) : null, t = l && timeLeft(l);
    const time = timed ? `<em class="${!t ? 'none' : pct! >= 100 ? 'full' : ''}">${t || (i ? '' : '–:––')}</em>` : '';
    return `<span class="um-r um-${i ? 'w' : 's'} ${l ? level(pct!) : ''}"><i style="--p:${pct ?? 0}"></i>${time}<b>${pct == null ? '–' : pct + '%'}</b></span>`;
  }).join('');
  el.innerHTML = `${name}<span class="um-rows">${rows}</span>`;
  const line = (l: Lim | undefined, name: string) => (l ? `${limitName(l)}: ${nowPct(l)}%${l.resets ? ', ' + (l.resets < Date.now() ? 'has reset' : `${resetLine(l.resets)}, ${leftWords(l.resets)}`) : ''}.` : `${name}: not read yet.`);
  const how = `Click for usage and limits${got.length > 1 ? ', or scroll to switch agent' : ''}.`;
  el.title = `${AGENT_WORD[a]}\n${line(lims[0], 'Current session')}\n${line(lims[1], 'Weekly limit')}\n\n${how}`;
}
const paintButtons = () => allButtons().forEach((el) => paintButton(el));
const SAMPLE: Acct = { id: 'default', signedIn: true, email: 'you', plan: 'max' };
export function usageButtonPic(c: { meter: boolean; left: boolean; name: boolean }) {
  const el = btn.cloneNode(false) as HTMLElement;
  el.className = 'quiet st-usage';
  paintButton(el, { ...cfgOf(btn), ...c });
  return el.outerHTML;
}
export const usageHeadPic = () => topBar(popOn());
export const usageAcctPic = () => `<div class="uw-head"><span>Claude Agent</span><span class="uw-sw">${acctChip(inUse() || SAMPLE)}</span><small></small></div>`;
export const usageWakePic = () => `<div class="uw-pane"><div class="uw-ph"><b>${esc(userOf(inUse() || SAMPLE))}</b></div><div class="uw-pfoot"><button class="uw-wake" data-uw-wake="pic">Start</button><button class="primary uw-go">Switch</button></div></div>`;

const ORDER = ['claude', 'codex', 'antigravity', 'cursor', 'copilot', 'grok'], REPORTS = ['claude', 'codex', 'antigravity'];
const AGENT_WORD: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' };
const PICK = 'usage:agent' + (AM > 1 ? ':' + AM : '');
function meterAgents() {
  const on = ORDER.filter(chatOn), lims = allLimits() as any[];
  return { on, got: on.filter((a) => lims.some((l) => l.agent === a)) };
}
function shownAgent(el: HTMLElement = btn): string {
  const { on, got } = meterAgents(), pick = cfgOf(el).agent;
  return pick && got.includes(pick) ? pick : got[0] || on.find((a) => REPORTS.includes(a)) || on[0] || 'claude';
}
const spanOf = (l: Lim) => {
  const w = l.key.split(' ').pop()!;
  return w === 'session' ? 300 : w === 'week' ? 10080 : parseInt(w) || 0;
};
function meterLims(a: string): (Lim | undefined)[] {
  const list = (allLimits() as any[]).filter((l) => l.agent === a).sort((x, y) => spanOf(x) - spanOf(y));
  if (a === 'claude') return ['session', 'week'].map((key) => list.find((l) => l.key === key));
  if (a === 'antigravity') {
    const g = list.length ? groupOf(list[0]) : '';
    return [' session', ' week'].map((end) => list.find((l) => groupOf(l) === g && l.key.endsWith(end)));
  }
  return [list[0], list.length > 1 ? list[list.length - 1] : undefined];
}
function timeLeft(l: Lim) {
  if (!l.resets || l.resets <= Date.now()) return '';
  const m = Math.ceil((l.resets - Date.now()) / 60e3);
  return m >= 1440 ? Math.floor(m / 1440) + 'd' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function leftWords(ms: number) {
  const m = Math.ceil((ms - Date.now()) / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return (d ? `${d} d ${h} h` : h ? `${h} h ${m % 60} min` : `${m} min`) + ' left';
}
let toldOne = false;
function wireButton(el: HTMLElement) {
  el.addEventListener('click', () => toggle(win.hidden, el));
  el.addEventListener('wheel', (e: WheelEvent) => {
    if (!cfgOf(el).meter) return;
    e.preventDefault();
    const { got } = meterAgents();
    if (got.length < 2) {
      if (!toldOne) tell(el, { title: got.length ? `Only ${AGENT_WORD[got[0]]} reports limits here` : 'No agent here reports limits', line: 'Claude, Codex and Antigravity report them; turn two of them on in settings to switch between them', ms: 3000 });
      toldOne = true;
      return;
    }
    const i = got.indexOf(shownAgent(el));
    setAgent(el, got[(i + (e.deltaY > 0 ? 1 : got.length - 1)) % got.length]);
  }, { passive: false });
}
function makeExtraBtn(s: UsageSlot) {
  const el = document.createElement('button');
  el.className = 'quiet st-usage';
  el.dataset.dk = 'usage:' + s.id;
  el.dataset.usageId = s.id;
  el.dataset.tipIcon = 'usage';
  el.setAttribute('aria-label', 'usage and limits');
  el.setAttribute('aria-expanded', 'false');
  el.classList.toggle('off', isOff('bar:off', el.dataset.dk));
  wireButton(el);
  return el;
}
const syncDockOrder = () => store.set('dock:order', [...document.querySelectorAll<HTMLElement>('#status > [data-dk]')].map((t) => t.dataset.dk));
function duplicateButton(from: HTMLElement) {
  const nextId = String(Math.max(1, ...extras.map((x) => parseInt(x.id, 10) || 1)) + 1);
  const src = cfgOf(from), { got } = meterAgents(), used = new Set(allButtons().map((b) => shownAgent(b)));
  const agent = got.find((a) => !used.has(a)) || got[(got.indexOf(shownAgent(from)) + 1) % Math.max(1, got.length)] || src.agent;
  const slot: UsageSlot = { id: nextId, agent, meter: src.meter, left: src.left, name: src.name };
  extras.push(slot);
  store.set(EXTRAS, extras);
  const el = makeExtraBtn(slot);
  from.after(el);
  syncDockOrder();
  paintButton(el);
}
function removeButtonEl(el: HTMLElement) {
  if (!extras.length) return;
  if (el.dataset.usageId) {
    const dk = el.dataset.dk!;
    extras = extras.filter((x) => x.id !== el.dataset.usageId);
    store.set(EXTRAS, extras);
    if (anchorBtn === el) anchorBtn = btn;
    el.remove();
    if (isOff('bar:off', dk)) setPref('bar:off', (pref('bar:off') as string[]).filter((x) => x !== dk));
    syncDockOrder();
    draw();
    return;
  }
  const keep = document.querySelector<HTMLElement>('#status > .st-usage[data-usage-id]');
  if (!keep) return;
  const keepSlot = slotOf(keep)!, keepDk = keep.dataset.dk!;
  store.set(PICK, keepSlot.agent);
  setPref('usage:meter', keepSlot.meter);
  setPref('usage:left', keepSlot.left);
  setPref('usage:name', keepSlot.name);
  const keepOff = isOff('bar:off', keepDk), barOff = (pref('bar:off') as string[]).filter((x) => x !== keepDk && x !== 'usage');
  if (keepOff) barOff.push('usage');
  setPref('bar:off', barOff);
  keep.before(btn);
  extras = extras.filter((x) => x.id !== keepSlot.id);
  store.set(EXTRAS, extras);
  if (anchorBtn === keep) anchorBtn = btn;
  keep.remove();
  syncDockOrder();
  draw();
}
function reconcileExtras() {
  extras = readExtras();
  const want = new Set(extras.map((x) => x.id));
  for (const el of document.querySelectorAll<HTMLElement>('#status > .st-usage[data-usage-id]')) {
    if (!want.has(el.dataset.usageId!)) {
      if (anchorBtn === el) anchorBtn = btn;
      el.remove();
    }
  }
  let after: HTMLElement = btn;
  for (const s of extras) {
    let el = document.querySelector<HTMLElement>(`#status > .st-usage[data-usage-id="${CSS.escape(s.id)}"]`);
    if (!el) {
      el = makeExtraBtn(s);
      after.after(el);
    }
    after = el;
  }
  paintButtons();
}
wireButton(btn);
{
  let after: HTMLElement = btn;
  for (const s of extras) {
    const el = makeExtraBtn(s);
    after.after(el);
    after = el;
  }
}

function draw() {
  paintButtons();
  if (win.hidden) return;
  const { claude, codex, antigravity: agy, cursor, copilot, grok } = reading;
  const week = sumSince(claude.tokens, Date.now() - SPANS.week);
  const claudeSum = week ? `${tokens(week)} tokens in the last 7 days` : '';
  const codexNote = !codex ? 'not installed' : codex.signedIn ? 'no limits reported' : 'not signed in';
  const on = popOn(), at = win.querySelector('.uw-body')?.scrollTop || 0;
  const typed = win.querySelector<HTMLInputElement>('[data-uw-agy-key]'), kept = typed?.value || '', focused = !!typed && document.activeElement === typed;
  const agySum = agySummary(agy), had = (document.activeElement as HTMLElement)?.dataset?.uwFold;
  const bar = topBar(on);
  win.innerHTML = `${bar}<div class="uw-body">${agent('claude', 'Claude Agent', 'no limits reported', claudeSum)}${agent('codex', 'Codex Agent', codexNote, codex?.credits ? `${codex.credits} credits left` : '')}${agent('antigravity', 'Antigravity Agent', agy ? 'no limits reported' : 'not installed', agySum.sum, agySum.tip, agySum.extra)}${agent('cursor', 'Cursor Agent', !cursor ? 'not installed' : cursor.signedIn ? 'no limits reported' : 'not signed in', cursor?.signedIn ? `uses ${cursor.line}` : '')}${agent('copilot', 'Copilot Agent', copilot ? 'type /usage in a chat' : 'not installed', copilot ? `uses ${copilot.line}` : '')}${agent('grok', 'Grok Agent', grok ? 'type /session-info in a chat' : 'not installed', grok ? `uses ${grok.line}` : '')}</div>`;
  win.querySelector('.uw-body')!.scrollTop = at;
  if (had) (win.querySelector(`[data-uw-fold="${had}"]`) as HTMLElement)?.focus();
  const again = win.querySelector<HTMLInputElement>('[data-uw-agy-key]');
  if (again && kept) again.value = kept;
  if (again && focused) again.focus();
  const ref = anchorBtn.isConnected && !anchorBtn.classList.contains('off') ? anchorBtn : btn;
  const b = ref.getBoundingClientRect();
  win.style.right = Math.max(8, innerWidth - b.right) + 'px';
  win.style.bottom = innerHeight - $('#status').getBoundingClientRect().top + 6 + 'px';
  const m = win.querySelector('.uw-menu') as HTMLElement;
  if (!m) return;
  const c = m.parentElement!.querySelector('.uw-acct')!.getBoundingClientRect(), h = m.offsetHeight;
  const y = c.bottom + 4 + h <= innerHeight - 8 ? c.bottom + 4 : Math.max(8, c.top - 4 - h);
  Object.assign(m.style, { left: Math.max(8, Math.min(c.left, innerWidth - m.offsetWidth - 8)) + 'px', top: y + 'px' });
}

const popOn = () => store.get('usage:pop', false);
const AGENTS = { claude: 'Claude Agent', codex: 'Codex Agent', antigravity: 'Antigravity Agent' };
function popSteps() {
  if (WIN !== 1) return;
  const told = store.get('limits.told' + (AM > 1 ? ':' + AM : ''), {});
  let changed = false;
  for (const l of (allLimits() as any[])) {
    const id = l.agent + ':' + l.key, pct = nowPct(l), step = Math.max(0, ...STEPS.filter((s) => pct >= s));
    const was = told[id], before = was && !(was.resets && was.resets < Date.now()) ? was.step : 0;
    if (step === before || (step < before && l.resets && Math.abs(l.resets - was.resets) < 60e3)) continue;
    told[id] = { step, resets: l.resets };
    changed = true;
    if (step < before || !popOn() || !chatOn(l.agent)) continue;
    const reset = l.resets ? ' · ' + resetLine(l.resets) : '';
    const text = `${limitName(l)} ${step >= 100 ? '100% used, limit reached' : pct + '% used'}${reset}`;
    const who = (AGENTS as Record<string, string>)[l.agent] || l.agent, here = () => notify(`<b>${esc(who)}</b> · ${esc(text)}`, { ms: 10000, pct }).classList.add('uw-note');
    Promise.resolve(window.amethyst?.forgetToast?.({ text: `${who} · ${text}`, from: 'usage' })).then((card) => card === true || here(), here);
  }
  if (changed) store.set('limits.told' + (AM > 1 ? ':' + AM : ''), told);
}

async function read(age?: number) {
  if (age == null) readAt = Date.now();
  try {
    const q = [age != null && `age=${age}`, chatOn('antigravity') && 'agy=1'].filter(Boolean).join('&');
    reading = await api('GET', '/api/agents/usage' + (q ? '?' + q : ''));
  } catch {
    return;
  }
  if (reading.claude.limits) limitsRead('claude', reading.claude.limits, reading.claude.account ?? null);
  limitsRead('codex', reading.codex?.limits || []);
  limitsRead('antigravity', reading.antigravity?.limits || []);
  draw();
  clearTimeout(again);
  if (!win.hidden && Date.now() < waitTill && reading.claude.accounts?.some((a: Acct) => !a.signedIn)) again = setTimeout(read, 3e3);
}

function took(auth: any) {
  reading.claude = { ...reading.claude, accounts: auth.accounts, account: auth.account };
  draw();
}
async function signIn(id: string | null) {
  const r = await api('POST', '/api/agent/account', id ? { id } : {});
  took(r.auth);
  waitTill = Date.now() + 5 * 60e3;
  notify(r.opened ? 'Finish the Claude sign-in in the window that opened; the account shows here when it is done.' : `Sign in in a terminal: <code>${esc(r.cmd)}</code>`, { ms: 12000 });
  read();
}
async function use(id: string) {
  const r = await api('PUT', '/api/agent/account', { use: id });
  took(r);
  const a = r.accounts.find((x: Acct) => x.id === id);
  const later = [r.busy && `${plural(r.busy, 'chat')} still answering finish on the account before`, r.terms && `${plural(r.terms, 'claude terminal')} keep the account before until restarted`].filter(Boolean);
  notify(`${AM > 1 ? `Amethyst ${AM}` : 'Claude'} now uses ${esc(nameOf(a))}.${later.length ? ' ' + esc(later.join('; ')) + '.' : ''}`);
  readAt = 0;
  read();
}
async function forget(id: string) {
  asking = null;
  const a = (reading.claude.accounts || []).find((x: Acct) => x.id === id), who = a?.signedIn ? userOf(a) : 'the account';
  took(await api('PUT', '/api/agent/account', { forget: id }));
  if (id === 'default') notify(esc(`${who} is signed out of Claude Code. Sign in… in its pane signs it in again.`));
  read();
}
function arm(set: (t: string) => unknown, get: () => string | undefined) {
  set('sure?');
  setTimeout(() => get() === 'sure?' && set(''), 3e3);
}
const setWake = (id: string) => (t: string) => (t ? waking.set(id, t) : waking.delete(id), draw());
function hold(id: string) {
  held.set(id, Date.now() + HOLD);
  setTimeout(() => {
    held.delete(id);
    if (id === inUse()?.id) (readAt = 0), read();
    else if (looks.has(id)) looks.delete(id), menu && sel === id ? look(id) : draw();
    else draw();
  }, HOLD);
}
async function wake(id: string) {
  const say = setWake(id);
  say('starting…');
  hold(id);
  try {
    const r = await api('POST', '/api/agent/account/wake', { id });
    say('sent…');
    if (id === inUse()?.id) {
      readAt = 0;
      await read();
    } else if (menu) looks.set(id, { ...(typeof looks.get(id) === 'object' ? looks.get(id) : {}), limits: r.limits });
    if (r.late) {
      const a = (reading.claude.accounts || []).find((x: Acct) => x.id === id);
      notify(`The hi reached ${esc(a ? userOf(a) : 'the account')}, but Claude doesn't show its 5-hour window yet. It can take a few minutes; open the menu again later to see the reset time.`, { ms: 12000 });
    }
    say('done');
    setTimeout(() => waking.get(id) === 'done' && say(''), 3e3);
  } catch (e: any) {
    if (e.status !== 429) held.delete(id);
    say('');
    throw e;
  }
}
const setAll = (t: string) => ((wakingAll = t), draw());
async function wakeAll() {
  const list = (reading.claude.accounts || []).filter((a: Acct) => a.signedIn && !runsTill(limsOf(a)) && !isHeld(a.id) && !fullOf(limsOf(a)));
  const bad: string[] = [];
  for (const [i, a] of list.entries()) {
    setAll(`${i + 1}/${list.length}…`);
    await wake(a.id).catch((e: any) => e.status === 409 || bad.push(`${userOf(a)} (${e.status === 429 ? 'limit reached' : e.message})`));
  }
  setAll('done');
  setTimeout(() => wakingAll === 'done' && setAll(''), 3e3);
  if (bad.length) notify(`Couldn't start the 5-hour window for ${esc(bad.join(', '))}.`, { ms: 12000 });
}
const fail = (what: string) => (err: Error) => ((notify(what).querySelector('.nt') as HTMLElement).title = `What went wrong\n${err.message}`);
const retry = (what: string) => fail(`couldn't ${what}: try again, or sign in from a chat`);
function act() {
  const a = lookedAt();
  if (!a || (a.signedIn && a.id === inUse().id)) return;
  showMenu(false);
  (a.signedIn ? use(a.id) : signIn(a.id)).catch(retry(a.signedIn ? 'switch the account' : 'sign in'));
}
win.addEventListener('keydown', (e) => {
  const f = (e.target as HTMLElement).closest?.('[data-uw-fold]') as HTMLElement;
  if (!f || f !== e.target || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  fold(f.dataset.uwFold!);
});
win.addEventListener('click', (e) => {
  const f = (e.target as HTMLElement).closest('[data-uw-fold]') as HTMLElement;
  if (f && !(e.target as HTMLElement).closest('.uw-sw')) return fold(f.dataset.uwFold!);
  if ((e.target as HTMLElement).closest('[data-uw-close]')) return toggle(false);
  if ((e.target as HTMLElement).closest('[data-uw-dash]')) return toggle(false), page.openDash();
  if ((e.target as HTMLElement).closest('[data-uw-pop]')) return store.set('usage:pop', !popOn()), draw();
  if ((e.target as HTMLElement).closest('[data-uw-open]')) return agyMenu(false), showMenu(!menu);
  if ((e.target as HTMLElement).closest('[data-uw-agy-open]')) return agyMenu(!agyOpen);
  if ((e.target as HTMLElement).closest('[data-uw-agy-addkey]')) return agyAdd();
  const ag = (e.target as HTMLElement).closest('[data-uw-agy-use],[data-uw-agy-forget],[data-uw-agy-way],[data-uw-agy-login]') as HTMLElement;
  if (ag) {
    const d = ag.dataset;
    if (d.uwAgyLogin != null || AGY_GOOGLE.includes(d.uwAgyWay || '')) return agyLogin(d.uwAgyLogin, d.uwAgyWay);
    if (d.uwAgyForget != null && agyAsk !== d.uwAgyForget) {
      agyAsk = d.uwAgyForget;
      draw();
      setTimeout(() => agyAsk === d.uwAgyForget && ((agyAsk = null), draw()), 3e3);
      return;
    }
    const body = d.uwAgyUse != null ? { agent: 'antigravity', use: d.uwAgyUse } : d.uwAgyForget != null ? { agent: 'antigravity', forget: d.uwAgyForget } : null;
    const done = body ? api('PUT', '/api/agent/account', body) : api('PUT', '/api/agent/auth', { agent: 'antigravity', method: d.uwAgyWay });
    return done.then((r) => agyTook(r, d.uwAgyForget != null ? 'Removed from Amethyst.' : `Antigravity now uses ${r.line}.`), fail("couldn't change the Antigravity sign-in: try again"));
  }
  if ((e.target as HTMLElement).closest('[data-uw-go]')) return act();
  const sh = (e.target as HTMLElement).closest('[data-acc-share]') as HTMLElement;
  if (sh) {
    if (sh.classList.contains('on')) return;
    return setShare(sh.dataset.accShare!, sh.dataset.accTo!).then((r) => took(r), fail("couldn't change its setup: try again"));
  }
  const w = (e.target as HTMLElement).closest('[data-uw-wake]') as HTMLElement, wa = (e.target as HTMLElement).closest('[data-uw-wake-all]') as HTMLElement;
  if ((w || wa)?.getAttribute('aria-disabled') === 'true') {
    const id = w?.dataset.uwWake!, busy = w ? waking.has(id) : !!wakingAll;
    if (busy) return;
    const a = w && (reading.claude.accounts || []).find((x: Acct) => x.id === id), lims = a ? limsOf(a) : [], full = a && !runsTill(lims) && fullOf(lims);
    if (w && !runsTill(lims) && isHeld(id)) return tell(w, { title: 'Waiting for Claude to show the 5-hour window', line: 'Start works again a minute after the last one', ms: 2500 });
    if (full) return tell(w, { title: `This account's ${limitName(full).toLowerCase()} is full`, line: full.resets ? `Start works again when it ${resetLine(full.resets)}` : 'Start works again after it resets', ms: 3000 });
    return tell(w || wa, { title: w ? "This account's 5-hour window is already running" : "Every account's 5-hour window is already running", line: 'Start works again after it resets', ms: 2500 });
  }
  if (w) {
    const id = w.dataset.uwWake!, say = setWake(id);
    if (waking.get(id) !== 'sure?') return arm(say, () => waking.get(id));
    return wake(id).catch((e: any) => (e.status === 429 ? notify(esc(e.message), { ms: 12000 }) : fail("couldn't start the 5-hour window: try again")(e)));
  }
  if (wa) {
    if (wakingAll !== 'sure?') return arm(setAll, () => wakingAll);
    return wakeAll();
  }
  const x = (e.target as HTMLElement).closest('[data-uw-forget]') as HTMLElement, b = (e.target as HTMLElement).closest('[data-uw-acct],[data-uw-add]') as HTMLElement;
  if (x) {
    const id = x.dataset.uwForget!;
    if (asking === id) return forget(id).catch(fail(id === 'default' ? "couldn't sign out: try again" : "couldn't remove the account: try again"));
    asking = x.dataset.uwForget!;
    draw();
    setTimeout(() => asking === x.dataset.uwForget && ((asking = null), draw()), 3e3);
    return;
  }
  if (!b) return;
  if (b.dataset.uwAcct != null) return look(b.dataset.uwAcct);
  showMenu(false);
  signIn(null).catch(retry('add the account'));
});

function showMenu(open: boolean) {
  if (menu === open) return;
  menu = opening = open;
  asking = sel = null;
  looks.clear();
  document[open ? 'addEventListener' : 'removeEventListener']('pointerdown', outside, true);
  document[open ? 'addEventListener' : 'removeEventListener']('keydown', keys as EventListener, true);
  draw();
}
const outside = (e: Event) => !(e.target as HTMLElement).closest?.('.uw-sw') && showMenu(false);
function keys(e: KeyboardEvent) {
  if (e.key === 'Escape') return e.stopPropagation(), showMenu(false);
  const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key], list = reading.claude.accounts || [];
  if ((!step && e.key !== 'Enter') || !list.length || (e.target as HTMLElement).closest?.('input, textarea, [contenteditable]')) return;
  e.preventDefault();
  e.stopPropagation();
  if (!step) return act();
  look(list[(list.indexOf(lookedAt()) + step + list.length) % list.length].id);
}

let armed = false;
function away(e: Event) {
  if ((e.target as HTMLElement).closest?.('#usage-win, .st-usage, #colormenu')) return (armed = false);
  if (armed) return toggle(false);
  armed = true;
}
function closeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || menu) return;
  e.preventDefault();
  e.stopPropagation();
  toggle(false);
}

function toggle(open: boolean, from?: HTMLElement) {
  if (open && from) anchorBtn = from;
  win.hidden = !open;
  for (const el of allButtons()) {
    const on = open && el === anchorBtn;
    el.classList.toggle('on', on);
    el.setAttribute('aria-expanded', String(on));
  }
  armed = false;
  for (const [type, fn] of [['pointerdown', away], ['keydown', closeKey]] as [string, (e: any) => any][]) (open ? addEventListener : removeEventListener)(type, fn, true);
  if (!open) return agyMenu(false), showMenu(false);
  draw();
  if (Date.now() - readAt > FRESH) read();
}

buttonMenu('.st-usage', {
  name: 'usage',
  icon: () => ICONS.usage,
  rows: () => miRow('data-bm="dup"', PLUS, 'duplicate', '', 'Adds another usage button next to this one in the dock, with its own settings and agent.')
    + (extras.length ? miRow('data-bm="rm"', ICONS.wx, 'remove', '', 'Removes this usage button from the dock.') : ''),
  opts: (el) => {
    const cfg = cfgOf(el);
    const chk = (k: 'meter' | 'left' | 'name', ic: string, label: string, tip: string) => `<button class="mi pick chk tb-row${cfg[k] ? ' on' : ''}" data-bm="${k}" title="${esc(tip)}"><i class="tb-ic">${ic}</i><span class="nm">${label}</span></button>`;
    let html = chk('meter', ICONS.bars, 'two bars instead of the gauge', 'Two bars instead of the gauge\nShows the session and weekly limits as two bars, instead of the gauge icon.');
    if (!cfg.meter) return html;
    html += chk('left', ICONS.history, 'time left', 'Time left\nShows the time until the session resets, between the bar and the %. The weekly row shows days left.');
    html += chk('name', icon('agent'), 'agent name', 'Agent name\nShows which agent the bars are for, on their left.');
    return html;
  },
  band: (el) => {
    const { got } = meterAgents(), cur = shownAgent(el);
    if (!cfgOf(el).meter || got.length < 2) return undefined;
    return ['agent', got.map((a) => {
      const s = meterLims(a)[0];
      return `<button class="mi pick chk tb-row${a === cur ? ' on' : ''}" data-bm="agent" data-ag="${a}" title="${esc(`${AGENT_WORD[a]}\nShows ${AGENT_WORD[a]}'s limits in the bars.\n\nScrolling over the bars does the same.`)}"><i class="tb-ic">${icon('agent')}</i><span class="nm">${AGENT_WORD[a]}</span>${s ? chip(`${nowPct(s)}%`) : ''}</button>`;
    }).join('')];
  },
  pick: (b, el) => {
    const k = b.dataset.bm!;
    if (k === 'dup') return duplicateButton(el);
    if (k === 'rm') return removeButtonEl(el);
    if (k === 'agent') return setAgent(el, b.dataset.ag!);
    if (k === 'meter' || k === 'left' || k === 'name') setCfg(el, k, !cfgOf(el)[k]);
  },
});
onPref('usage:meter', draw);
onPref('usage:left', draw);
onPref('usage:name', draw);
every(60e3, () => allButtons().some((el) => cfgOf(el).meter) && paintButtons());
onPref('bar:off', () => !win.hidden && isOff('bar:off', anchorBtn.dataset.dk || 'usage') && toggle(false));
watchLimits(() => (popSteps(), draw()));
addEventListener('storage', (e) => {
  if (e.key === 'mind.usage:pop') draw();
  if (e.key === 'mind.' + PICK) paintButtons();
  if (e.key === 'mind.' + EXTRAS) reconcileExtras();
});
onPref('usage:accounts', draw);
onPref('usage:wake', draw);
onPref('usage:popBtn', draw);
onPref('usage:dashBtn', draw);
onPref('agents:off', draw);
rowIcons({ 'usage:dashBtn': () => ICONS.dash, 'usage:popBtn': () => ICONS.bell, 'usage:accounts': () => icon('agent'), 'usage:wake': () => icon('fast') });
barMenu('.uw-top', 'usage');
popSteps();
draw();
setTimeout(() => read(BG), 3e3);
every(POLL, () => read(BG));
