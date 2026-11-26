import { esc } from '../base/util.ts';

export const COUNT = {
  ask: 'Can I count you?',
  short: "Once a day the app says it's running. Nothing about you.",
  long: (v: string) =>
    `I'm one person building Amethyst, and I'd love to know how many people actually use it. If you say yes, once a day the app tells amethyst.run "I'm running, version ${v}", plus four yes/no answers so I can tell new users, updates, and weekly and monthly users apart. That's all. No name, no ID, nothing about your projects, agents or files, and I never keep your IP address. You can turn it off any time in settings → updates.`,
};

export const SENT: [string, string, string][] = [
  ['v', 'version', 'version'],
  ['first', 'first time ever?', 'first time'],
  ['upd', 'just updated?', 'just updated'],
  ['w', 'first time this week?', 'first this week'],
  ['m', 'first time this month?', 'first this month'],
];

const PRIVACY = 'https://amethyst.run/privacy';

const two = (n: number) => String(n).padStart(2, '0');
function when(at: number, now = Date.now()) {
  const d = new Date(at), t = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(new Date(now))) return `today at ${t}`;
  if (day(d) === day(new Date(now - 864e5))) return `yesterday at ${t}`;
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} at ${t}`;
}

export function sentText(query: string) {
  const q = new URLSearchParams(query);
  return SENT.filter(([k]) => q.has(k)).map(([k, , said]) => (k === 'v' ? `${said} ${q.get('v')}` : said)).join(' · ');
}

export function countDetails(o: { version: string; to: string; sent: { at: number; query: string } | null; on: boolean | null }, now = Date.now()) {
  const host = o.to.replace(/^https?:\/\//, '');
  const list = SENT.map(([k, label]) => `<span class="ct-k">${esc(label)}</span><span class="ct-v">${k === 'v' ? esc(o.version) : 'yes / no'}</span>`).join('');
  const last = o.sent
    ? `<span class="ct-k">${esc(when(o.sent.at, now))}</span><span class="ct-v ct-req"><code>${esc(host)}</code> ${esc(sentText(o.sent.query))}</span>`
    : `<span class="ct-k">${o.on ? 'nothing sent yet' : 'nothing sent'}</span><span></span>`;
  return `<div class="ct-more"><p class="ct-long">${esc(COUNT.long(o.version))} <a href="${PRIVACY}" target="_blank">The privacy notice</a> says the same.</p>` +
    `<div class="ct-h">what's sent, once a day</div><div class="ct-list">${list}</div>` +
    `<div class="ct-h">last sent</div><div class="ct-list">${last}</div></div>`;
}
