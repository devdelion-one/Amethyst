import { api } from '../base/model.ts';
import { notify } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { agents, onAgents } from '../base/stream.ts';
import { showErr } from '../base/util.ts';
import { noticeCard } from './card.ts';
import type { Got } from './card.ts';
import type { ReportRing } from '../base/types.ts';

const desk = window.amethyst?.report;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function inView(id: string) {
  for (const el of document.querySelectorAll<HTMLElement>(`.chat[data-chat="${CSS.escape(id)}"]`)) {
    if (!el.checkVisibility() || !el.offsetParent) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 40 && r.height > 40 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) return true;
  }
  return false;
}

const cards = new Map<string, ReturnType<typeof notify>>();
const holds = new Map<string, { st: string; met: boolean }>();
onAgents(() => {
  for (const [id, h] of holds) {
    const now = agents.all.get(id)?.status;
    if (now === h.st) h.met = true;
    else if (h.met || !now) cards.get(id)?.close?.();
  }
});
export function ringCard(r: ReportRing) {
  cards.get(r.id)?.close?.();
  const n = notify('', { ms: 0 });
  n.classList.add('rp-card');
  n.onclick = null;
  n.onmouseleave = null;
  cards.set(r.id, n);
  const st = r.why === 'asks' ? 'asks' : r.why === 'cold' ? agents.all.get(r.id)?.status || 'idle' : 'done';
  holds.set(r.id, { st, met: agents.all.get(r.id)?.status === st });
  const was = n.close!;
  n.close = () => (cards.get(r.id) === n && (cards.delete(r.id), holds.delete(r.id)), was());
  const a = agents.all.get(r.id);
  const fallback: Got = { id: r.id, chat: r.code, title: r.title, status: a?.status || 'done', am: r.am, pid: a?.pid || '', report: true, text: r.text || '', asked: '', asks: [] };
  api('GET', '/api/chats/report?id=' + encodeURIComponent(r.id), undefined, a?.pid)
    .catch(() => fallback)
    .then((g: Got) => {
      if (cards.get(r.id) !== n) return;
      const card = noticeCard(g, r.why, r.line, {
        close: () => n.close?.(),
        go: () => (n.close?.(), desk ? desk.open(r.id, r.am) : void go(r.id).catch(showErr)),
      }, r.until);
      n.querySelector('.nt')!.replaceChildren(card);
    });
  return n;
}

async function go(id: string) {
  let a = agents.all.get(id);
  for (let i = 0; !a && i < 40; i++) {
    await sleep(250);
    a = agents.all.get(id);
  }
  if (!a || a.status === 'ended') return void notify('That chat has ended.');
  await page.switchLevel(a.pid);
  await page.showAgent(a);
}

desk?.onRing((r) => {
  if (document.hasFocus() && inView(r.id)) return;
  ringCard(r);
});
const seen = (id: string | undefined) => {
  if (!id) return;
  desk?.seen?.(id);
  cards.get(id)?.close?.();
};
addEventListener('focus', () => document.querySelectorAll<HTMLElement>('.chat[data-chat]').forEach((el) => inView(el.dataset.chat!) && seen(el.dataset.chat)));
document.addEventListener('pointerdown', (e) => seen((e.target as Element).closest?.<HTMLElement>('.chat[data-chat]')?.dataset.chat), true);
desk?.onGo((id) => void go(id).catch(showErr));
desk?.onUnring?.((id) => cards.get(id)?.close?.());
const screenNow = () => desk?.noticeScreen?.(pref('notice:screen'));
screenNow();
onPref('notice:screen', screenNow);
const cacheNow = () => desk?.cacheNotice?.(!!pref('cache:notice'));
cacheNow();
onPref('cache:notice', cacheNow);
