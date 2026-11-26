import { savePins, togglePin } from './actions.ts';
import type { Agent } from '../base/stream.ts';
import { sortable, sorting } from '../base/controls.ts';
import { markOf, titleOf } from '../base/agentlook.ts';
import { gem } from '../base/kinds.ts';
import { atWs, gemOf, S, samePin, toEditor } from '../base/model.ts';
import { resumeChat, showAgent } from './modes.ts';
import { page } from '../base/page.ts';
import { pref, setPref } from '../base/prefs.ts';
import { agents, onAgents } from '../base/stream.ts';
import { openInTab } from './tabs.ts';
import { $, esc } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import type { Pin } from '../base/types.ts';

const list = $<HTMLElement>('#pins-list');
let drawn = '', shownPins: Pin[] = [];

const shown = () => pref('pins:on');
const agentOf = (p: Pin): Agent | null => (p.kind === 'file' ? null : [...agents.all.values()].find((a) => (p.kind === 'chat' ? a.session === p.session : a.id === p.id)) || null);
const ended = (a: Agent | null) => !a || a.status === 'ended';

function tidy() {
  if (!S.pins.length || WIN > 1 || atWs() || S.switching) return;
  const next = S.pins.flatMap((p): Pin[] => {
    if (p.kind === 'file') return !S.cut && !S.thoughts.has(p.path) ? [] : [p];
    if (!agents.loaded) return [p];
    const a = agentOf(p);
    if (p.kind === 'term' && ended(a)) return [];
    return [a && titleOf(a) !== p.title ? { ...p, title: titleOf(a) } : p];
  });
  if (next.length !== S.pins.length || next.some((p, i) => p !== S.pins[i])) savePins(next);
}

function rowOf(p: Pin, i: number) {
  const t = p.kind === 'file' ? S.thoughts.get(p.path) : null, a = agentOf(p);
  const name = t ? t.title : a ? titleOf(a) : (p as { title?: string }).title || (p.kind === 'term' ? 'terminal' : 'chat');
  const mark = t ? gemOf(t) : a ? markOf(a) : gem(p.kind === 'term' ? 'term' : 'ai');
  const dot = p.kind === 'file' ? '' : `<i class="pn-dot"${a ? ` data-st="${esc(a.status)}"` : ''}></i>`;
  return `<div class="pn-row" data-pin="${i}" role="button" tabindex="0" title="${esc(name)}" data-tip-cut=".nm"><span class="pn-grip" data-pn-grip>⠿</span><i class="gl">${mark}</i><span class="nm">${esc(name)}</span>${dot}<button class="pn-x" data-pn-x aria-label="unpin">×</button></div>`;
}

export function renderPins() {
  tidy();
  $('#app').classList.toggle('pins-on', shown());
  $('#btn-pins').classList.toggle('on', shown());
  if (sorting(list)) return;
  shownPins = S.pins.slice();
  const html = S.pins.map(rowOf).join('') || '<p class="pn-none">nothing pinned</p>';
  if (html !== drawn) list.innerHTML = drawn = html;
}
onAgents(({ lineOnly }) => lineOnly || renderPins());

export function togglePanel() {
  setPref('pins:on', !shown());
  page.render();
}

function openPin(p: Pin) {
  if (p.kind === 'file') {
    toEditor();
    openInTab(p.path);
    return page.render();
  }
  const a = agentOf(p);
  if (!ended(a)) return showAgent(a!);
  resumeChat(p as Extract<Pin, { kind: 'chat' }>);
}

list.addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('[data-pin]'), p = S.pins[row?.dataset.pin as unknown as number];
  if (!p || (e.target as HTMLElement).closest('[data-pn-grip]')) return;
  (e.target as HTMLElement).closest('[data-pn-x]') ? togglePin(p) : openPin(p);
});
list.addEventListener('keydown', (e) => {
  const p = S.pins[(e.target as HTMLElement).closest?.<HTMLElement>('[data-pin]')?.dataset.pin as unknown as number];
  if (p && e.key === 'Enter' && !(e.target as HTMLElement).closest('[data-pn-x]')) openPin(p);
});

sortable(list, {
  item: '.pn-row',
  grip: '[data-pn-grip]',
  drop(all) {
    const order = all.map((r) => shownPins[r.dataset.pin]);
    const now = (p: Pin) => S.pins.find((x) => samePin(x, p));
    savePins([...(order.map(now).filter(Boolean) as Pin[]), ...S.pins.filter((x) => !order.some((p) => samePin(x, p)))]);
    renderPins();
  },
});
