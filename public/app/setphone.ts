import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { qrSvg } from '../base/qr.ts';
import { ago, esc } from '../base/util.ts';
import { rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';

type Phone = { id: string; name: string; paired: number; seen: number };
type State = { on: boolean; listening: boolean; port: number; alerts: boolean; addresses: string[]; code: { url: string; until: number } | null; phones: Phone[] };

const ON = 'Your paired phones can see and control your chats over this Wi-Fi.', OFF = 'Only this PC can see your chats.';
const ALERTS_ON = 'While its page is open, your phone shows a strip and chimes when any chat needs you.', ALERTS_OFF = 'Your phone shows which chats need you only in its list.';
const DESC = "For your home Wi-Fi: the connection isn't encrypted. Windows asks once whether Amethyst may use the network. Allow private networks only.";
const FORGET = 'They have to pair again. Nothing on this PC is deleted.';

let st: State | null = null, asked = false, timer = 0;
const at = (key: string, o: Partial<At> = {}): At => ({ key, place: 'g-none', on: () => true, ...o });
const send = (method: string, url: string, body?: unknown) =>
  fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j as State;
  });

function later() {
  clearTimeout(timer);
  if (!st?.on) return;
  const until = st.code ? st.code.until - Date.now() + 200 : 15000;
  timer = window.setTimeout(() => (document.querySelector('[data-hr="g:remote"]') ? void load() : undefined), Math.max(1000, Math.min(until, 15000)));
}
async function load() {
  try {
    st = await send('GET', '/api/remote/state');
  } catch {
    st = null;
  }
  later();
  page.renderSettings();
}
const now = (): State | null => {
  if (!st && !asked) {
    asked = true;
    void load();
  }
  return st;
};
async function act(url: string, body: unknown, from?: Element) {
  try {
    st = await send('POST', url, body);
    later();
  } catch (e) {
    if (from) tell(from as HTMLElement, { title: "Phone remote control didn't change", line: (e as Error).message, ms: 5000 });
  }
  page.renderSettings();
}

const seen = (ms: number) => {
  const m = Math.floor((Date.now() - ms) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} minute${m > 1 ? 's' : ''} ago` : m < 24 * 60 ? `${Math.floor(m / 60)} hour${m >= 120 ? 's' : ''} ago` : ago(ms);
};

const codeHtml = (s: State) => (s.code
  ? `<div class="sp-body"><div class="sp-pair"><div class="sp-qr">${qrSvg(s.code.url, 4)}</div><div class="sp-info"><b>Pair a phone</b><code class="sp-addr">${esc(s.code.url.replace(/\/#pair=.*/, ''))}</code><span class="sp-exp">The code works once, for 5 minutes.</span></div></div></div>`
  : '');
const paired = (k: number) => (!k ? 'No phone is paired yet.' : k === 1 ? '1 phone is paired.' : `${k} phones are paired.`);
const pairRow = (s: State): Row => ({
  id: 'g:rpair', key: 'g:rpair', sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: 'Pair a phone', desc: "Scan the code with your phone's camera while it is on the same Wi-Fi.", find: 'pair a phone code QR' },
  at: [at('g:rpair')],
  state: () => (s.code ? 'A pairing code is shown. It works once, for 5 minutes.' : paired(s.phones.length)),
  note: () => "Scan the code with your phone's camera while it is on the same Wi-Fi.",
  btn: { label: s.code ? 'new code' : 'pair a phone', tip: 'Pair a phone\nShows a code to scan. It works once, for 5 minutes.', run: (el) => void act('/api/remote/code', {}, el) },
});
const phonesRow = (s: State): Row => ({
  id: 'g:rphones', key: 'g:rphones', sw: 'none', plain: true, noPic: true, noReset: true,
  own: { label: 'Paired phones', desc: 'A phone you forget has to pair again. Nothing on this PC is deleted.', find: 'forget all phones' },
  at: [at('g:rphones')],
  state: () => `${paired(s.phones.length)} Each one shows its name and when it was last seen.`,
  note: () => 'A phone you forget has to pair again. Nothing on this PC is deleted.',
  list: () => s.phones.map((p) => ({ id: p.id, name: p.name, sub: `Last seen ${seen(p.seen)}`, remove: { label: `Forget ${p.name}`, tip: `Forget ${p.name}\nIt has to pair again. Nothing on this PC is deleted.`, run: (el: HTMLElement) => void act('/api/remote/forget', { id: p.id }, el) } })),
  add: { label: 'Forget all phones', tip: `Forget all phones\n${FORGET}`, run: (el) => void act('/api/remote/forget', { id: '' }, el) },
});

export function phoneRows(): Row[] {
  const s = now();
  const on = !!s?.on;
  const rows: Row[] = [
    {
      id: 'g:remote', key: 'g:remote', sw: 'onoff', plain: true, noPic: true,
      own: { label: 'Phone remote control', desc: '', find: `${ON} ${OFF} ${DESC}` },
      at: [at('g:remote', { on: () => !!st?.on, set: (v) => void act('/api/remote/on', { on: v }, document.querySelector('[data-hr="g:remote"]') || undefined), def: false })],
      state: () => (st?.on ? ON : OFF), alt: () => (st?.on ? OFF : ON),
      note: () => (st?.on && !st.listening ? "It's on, but phones can't reach Amethyst yet. Turn it off and on again." : DESC),
      reset: () => void act('/api/remote/on', { on: false }), changed: () => !!st?.on,
    },
  ];
  if (!on || !s) return rows;
  rows.push(
    {
      id: 'g:ralerts', key: 'g:ralerts', sw: 'onoff', plain: true, noPic: true,
      own: { label: 'Alerts on the phone', desc: 'The chime plays after your first tap on the page. An iPhone on silent stays quiet.', find: `${ALERTS_ON} ${ALERTS_OFF}` },
      at: [at('g:ralerts', { on: () => !!st?.alerts, set: (v) => void act('/api/remote/alerts', { on: v }), def: true })],
      state: () => (st?.alerts ? ALERTS_ON : ALERTS_OFF), alt: () => (st?.alerts ? ALERTS_OFF : ALERTS_ON),
      reset: () => void act('/api/remote/alerts', { on: true }), changed: () => !st?.alerts,
    },
    pairRow(s),
  );
  if (s.phones.length) rows.push(phonesRow(s));
  return rows;
}

export const phoneHtml = (): string => phoneRows().map((r) => rowHtml(r) + (r.id === 'g:rpair' && st ? codeHtml(st) : '')).join('');
