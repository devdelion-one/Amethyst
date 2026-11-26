import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { qrSvg } from '../base/qr.ts';
import { ago, esc } from '../base/util.ts';
import type { At, Row } from './setstd.ts';

type Phone = { id: string; name: string; paired: number; seen: number };
type State = { on: boolean; listening: boolean; port: number; alerts: boolean; addresses: string[]; code: { url: string; until: number } | null; phones: Phone[] };

const ON = 'Your paired phones can see and control your chats over this Wi-Fi.', OFF = 'Only this PC can see your chats.';
const ALERTS_ON = 'While its page is open, your phone shows a strip and chimes when any chat needs you.', ALERTS_OFF = 'Your phone shows which chats need you only in its list.';
const DESC = "For your home Wi-Fi: the connection isn't encrypted. Windows asks once whether Amethyst may use the network: allow private networks only.";

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

function pairHtml(s: State) {
  const code = s.code
    ? `<div class="sp-pair"><div class="sp-qr">${qrSvg(s.code.url, 4)}</div><div class="sp-info"><b>Pair a phone</b><code class="sp-addr">${esc(s.code.url.replace(/\/#pair=.*/, ''))}</code><span class="sp-exp">The code works once, for 5 minutes.</span></div></div>`
    : `<button class="chip" data-remote-pair>pair a phone</button>`;
  const phones = s.phones.length
    ? `<div class="sp-phones"><span class="sp-hd">Paired phones</span>${s.phones.map((p) => `<div class="sp-phone"><span class="sp-who"><b>${esc(p.name)}</b><span>Last seen ${seen(p.seen)}</span></span><button class="chip" data-remote-forget="${esc(p.id)}">forget</button></div>`).join('')}<button class="chip sp-all" data-remote-forget="">forget all phones</button></div>`
    : '';
  return `<div class="sp-body">${code}${phones}</div>`;
}

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
  );
  return rows;
}

export const phoneMore = (): string => (st?.on ? pairHtml(st) : '');

export function phoneClick(t: Element): boolean {
  const pair = t.closest('[data-remote-pair]');
  if (pair) return void act('/api/remote/code', {}, pair), true;
  const f = t.closest<HTMLElement>('[data-remote-forget]');
  if (f) return void act('/api/remote/forget', { id: f.dataset.remoteForget || '' }, f), true;
  return false;
}
