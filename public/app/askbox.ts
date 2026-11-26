import { answers } from '../base/answer.ts';
import { codeOf, crystalOf, markOf, titleOf } from '../base/agentlook.ts';
import { projectOf } from '../base/model.ts';
import { page } from '../base/page.ts';
import { heldKey, watchKeys } from '../base/settle.ts';
import { agents, onAgents } from '../base/stream.ts';
import { amElse, esc, sinceShort } from '../base/util.ts';
import type { Agent } from '../base/stream.ts';

const box = document.createElement('div');
box.id = 'askbox';
box.hidden = true;
box.tabIndex = -1;
box.innerHTML = `<div class="ab-h"><b class="ab-pj"></b><span class="ab-n"></span><span class="ab-keys">Tab next · 1-9 answer · Esc</span><button type="button" class="ab-x" data-ab-x title="Close\nThe questions wait in their chats." data-tip-keys="=esc:close" aria-label="close">×</button></div><div class="ab-list"></div>`;
document.body.append(box);
const list = box.querySelector<HTMLElement>('.ab-list')!;
const cards = answers((id) => go(id));
let pid = '', sel = 0, back: HTMLElement | null = null;

const keyOf = (a: Agent) => `${a.id} ${a.ask?.id ?? ''}`;
const waiting = () => [...agents.all.values()].filter((a) => a.pid === pid && a.status === 'asks' && !amElse(a)).sort((x, y) => +!x.ask - +!y.ask || x.at - y.at);
const countOf = () => document.querySelector<HTMLElement>(`#projects .pj-tab[data-pjsel="${CSS.escape(pid)}"]:not(.pj-ghost) [data-pjask]`);
const stops = () => [...list.querySelectorAll<HTMLElement>('.ab-card')].flatMap((c) => {
  const parts = [...c.querySelectorAll<HTMLElement>('.dk-apart')], keys = new Set(parts.map((p) => p.dataset.k));
  const own = parts.filter((p) => !(p.dataset.k!.endsWith('_custom') && keys.has(p.dataset.k!.slice(0, -7))));
  return own.length ? own : parts.length ? parts : [c];
});

function who(a: Agent) {
  const t = titleOf(a);
  return `<div class="ab-who" style="--gem-c:${crystalOf(a.id).color}"><i class="dk-mark">${markOf(a)}</i>${codeOf(a.id, t)}<b title="${esc(t)}" data-tip-cut>${esc(t)}</b><span class="ab-at">${esc(sinceShort(a.at))}</span></div>`;
}
function build(a: Agent) {
  const c = document.createElement('section');
  c.className = 'ab-card';
  c.dataset.ab = keyOf(a);
  c.dataset.abId = a.id;
  c.innerHTML = who(a);
  if (a.ask) {
    c.append(cards.card(a));
    watchKeys(c, '[data-dk-opt], [data-dk-pick]');
  }
  else c.insertAdjacentHTML('beforeend', `<pre class="dk-acmd ab-line">${esc(a.line || 'It is waiting for you.')}</pre><div class="dk-afoot"><button type="button" class="dk-ago" data-ab-go>open ${a.kind === 'term' ? 'terminal' : 'chat'} ↗</button><span></span></div>`);
  return c;
}

function paint() {
  if (box.hidden) return;
  const all = waiting();
  if (!all.length || !countOf()) return closeAskBox();
  const was = new Map([...list.querySelectorAll<HTMLElement>('.ab-card')].map((c) => [c.dataset.ab!, c]));
  const now = all.map((a) => {
    const c = was.get(keyOf(a)) || build(a);
    c.querySelector('.ab-at')!.textContent = sinceShort(a.at);
    return c;
  });
  cards.keep(new Set(all.filter((a) => a.ask).map((a) => `${a.id} ${a.ask!.id}`)));
  if (now.length !== list.children.length || now.some((c, i) => list.children[i] !== c)) list.replaceChildren(...now);
  const project = projectOf(pid);
  box.querySelector('.ab-pj')!.textContent = project?.name || '';
  box.querySelector('.ab-n')!.textContent = `${all.length} need${all.length === 1 ? 's' : ''} you`;
  select(sel, false);
  place();
}

function select(i: number, focus = true) {
  const s = stops();
  if (!s.length) return;
  sel = Math.max(0, Math.min(i, s.length - 1));
  s.forEach((x, j) => x.classList.toggle('ab-sel', j === sel));
  const at = s[sel], now = document.activeElement;
  if (!focus && (box.contains(now) || (now && now !== document.body))) return;
  const input = at.querySelector<HTMLInputElement>('input');
  (input || box).focus({ preventScroll: true });
  at.scrollIntoView({ block: 'nearest' });
}

function place() {
  const count = countOf();
  if (!count) return;
  count.classList.add('open');
  const top = document.getElementById('shell')!.getBoundingClientRect().top;
  const dock = document.getElementById('status')!.getBoundingClientRect().top;
  box.style.bottom = `${innerHeight - dock + 4}px`;
  box.style.maxHeight = `${Math.max(160, dock - top - 12)}px`;
  const w = box.getBoundingClientRect().width;
  box.style.left = `${Math.max(8, Math.min(count.getBoundingClientRect().left - 8, innerWidth - w - 8))}px`;
}

export function openAskBox(id: string) {
  if (!box.hidden && pid === id) return closeAskBox();
  if (!box.hidden) closeAskBox();
  pid = id;
  sel = 0;
  back = document.activeElement as HTMLElement | null;
  list.replaceChildren();
  box.hidden = false;
  paint();
  if (!box.hidden) select(0);
}
export function closeAskBox() {
  if (box.hidden) return;
  box.hidden = true;
  document.querySelectorAll('#projects [data-pjask].open').forEach((x) => x.classList.remove('open'));
  if (box.contains(document.activeElement)) (back?.isConnected ? back : document.body).focus?.({ preventScroll: true });
  back = null;
}

async function go(id: string) {
  const a = agents.all.get(id);
  closeAskBox();
  if (!a) return;
  await page.switchLevel(a.pid);
  page.showAgent(a);
}

function pick(n: number) {
  const at = stops()[sel];
  if (!at) return;
  const form = at.matches('.dk-apart');
  const b = at.querySelectorAll<HTMLElement>(form ? '[data-dk-pick]' : '[data-dk-opt]')[n - 1];
  if (!b || heldKey(at.closest<HTMLElement>('.ab-card')!, b)) return;
  b.click();
  if (!form || at.querySelector('.dk-abox')) return;
  const card = at.closest('.ab-card')!, s = stops();
  const next = s.findIndex((x, j) => j > sel && card.contains(x) && !x.querySelector('.dk-aopt.sel'));
  if (next >= 0) select(next);
}

box.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    return closeAskBox();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    const n = stops().length;
    return n && select((sel + (e.shiftKey ? -1 : 1) + n) % n);
  }
  if (t.matches('input')) return void e.stopPropagation();
  if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault();
    e.stopPropagation();
    return pick(+e.key);
  }
  if (e.key === 'Enter' && !e.defaultPrevented) {
    e.stopPropagation();
    const send = stops()[sel]?.closest('.ab-card')?.querySelector<HTMLButtonElement>('[data-dk-send]');
    if (send && !send.disabled) {
      e.preventDefault();
      send.click();
    }
  }
});
box.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement, s = stops();
  const i = s.findIndex((x) => x.contains(t));
  if (i >= 0 && i !== sel) select(i, !t.closest('button, input'));
});
box.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-ab-x]')) return closeAskBox();
  const g = t.closest('[data-ab-go]');
  if (g) go(g.closest<HTMLElement>('.ab-card')!.dataset.abId!);
});
document.addEventListener('pointerdown', (e) => {
  const t = e.target as HTMLElement;
  if (!box.hidden && !box.contains(t) && !t.closest('[data-pjask]')) closeAskBox();
}, true);
addEventListener('resize', () => box.hidden || place());
onAgents(({ lineOnly }) => lineOnly || paint());
