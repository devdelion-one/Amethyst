import { ask, bands, chip, closeSub, ICONS, keepMenu, menuHead, placeSubAgain, popMenu, subMenu } from './controls.ts';
import { gem } from './kinds.ts';
import { api } from './model.ts';
import { chatOn, pref, setPref } from './prefs.ts';
import { $, agentName, esc, setSave } from './util.ts';
import { WRITERS } from './writers.ts';

type Model = { id: string; name: string };
type Use = { agent: string; models: Record<string, Model> };
type List = { models: (Model & { about?: string })[]; typed: boolean };

const use = (): Use => {
  const v = pref('writer:use') || {};
  return { agent: WRITERS.includes(v.agent) ? v.agent : 'claude', models: v.models && typeof v.models === 'object' ? v.models : {} };
};
const short = (agent: string) => agentName(agent).replace(/ Agent$/, '');
const own = (agent: string): string => `${short(agent)}'s own default`;
const picked = (agent: string): Model | undefined => use().models[agent];

export const writerAgent = (): string => use().agent;
export const writerName = (): string => agentName(writerAgent());
export function writerModel(agent = writerAgent()): string {
  const m = picked(agent);
  return m ? m.name || own(agent) : agent === 'claude' ? 'Haiku' : own(agent);
}
export function writerBody(): { agent: string; model?: string } {
  const agent = writerAgent(), m = picked(agent);
  return { agent, ...(m ? { model: m.id } : {}) };
}
export const writerTip = (name: string, does: string): string => {
  const m = picked(writerAgent()), known = !m ? writerAgent() === 'claude' : !!m.id;
  return `${name}\n${writerName()}${known ? `, with ${writerModel()},` : ''} ${does}\n\nRight-click to pick another agent or model.`;
};
export const writerLine = (): string => `${writerName()} writes, with ${writerModel()}.`;

function setAgent(agent: string) {
  setPref('writer:use', { ...use(), agent });
  setSave(`${agentName(agent)} writes, with ${writerModel(agent)}`);
}
function setModel(agent: string, m: Model) {
  const u = use();
  setPref('writer:use', { ...u, models: { ...u.models, [agent]: m } });
  setSave(`${agentName(agent)} writes, with ${m.name || own(agent)}`);
}

const pickRow = (attrs: string, on: boolean, label: string, ic = '') =>
  `<button class="mi pick chk${on ? ' on' : ''}" role="menuitemradio" aria-checked="${on}" ${attrs}>${ic ? `<i class="tb-ic">${ic}</i>` : ''}<span class="mi-n">${esc(label)}</span></button>`;
const agentRows = (): string =>
  WRITERS.filter((k) => chatOn(k) || k === writerAgent()).map((k) => pickRow(`data-wa="${k}"`, k === writerAgent(), agentName(k), gem('ai'))).join('');

function modelRows(agent: string, l: List): string {
  const m = picked(agent), now = m ? m.id : agent === 'claude' ? 'haiku' : '';
  const known = !now || l.models.some((x) => x.id === now);
  const all = [...(known || !m ? [] : [m]), ...l.models];
  return pickRow('data-wm=""', !now, own(agent)) +
    all.map((x) => pickRow(`data-wm="${esc(x.id)}"`, x.id === now, x.name)).join('') +
    (l.typed ? `<button class="mi" data-wt><span class="mi-n">type a model's name…</span></button>` : '');
}
async function typeModel(agent: string) {
  const name = await ask({ title: `${short(agent)}'s model`, text: `${short(agent)} doesn't list its models, so type the name of the one to write with.`, value: picked(agent)?.id || '', placeholder: 'the model, as the agent names it' });
  const id = typeof name === 'string' ? name.trim() : '';
  if (id) setModel(agent, { id, name: id });
}
function modelPick(agent: string, l: List, b: HTMLElement) {
  if (b.dataset.wt != null) return typeModel(agent);
  if (b.dataset.wm == null) return;
  const id = b.dataset.wm;
  setModel(agent, { id, name: id ? l.models.find((x) => x.id === id)?.name || picked(agent)?.name || id : '' });
}
const note = (text: string) => `<div class="wr-note">${esc(text)}</div>`;
const read = (agent: string) => api('GET', `/api/agent/models?agent=${agent}`) as Promise<List>;

async function openModels(row: HTMLElement) {
  const agent = writerAgent();
  let l: List | null = null;
  const f = subMenu(row, note('Reading the models…'), (b) => l && modelPick(agent, l, b));
  f.classList.add('wr-fly');
  const html = await read(agent).then((r) => modelRows(agent, (l = r)), (e) => note(e.message));
  if (!f.isConnected) return;
  f.innerHTML = html;
  placeSubAgain();
  f.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}

let shownFor: HTMLElement | null = null, pressed: HTMLElement | null = null;
document.addEventListener('pointerdown', (e) => {
  const m = $<HTMLElement>('#colormenu');
  pressed = shownFor && m && !m.hidden && shownFor.contains(e.target as Node) ? shownFor : null;
}, true);
function tie(btn: HTMLElement | null) {
  const m = $<HTMLElement>('#colormenu');
  shownFor = btn;
  m.addEventListener('menuclose', () => {
    shownFor = null;
    if (btn && document.activeElement === btn) btn.blur();
  }, { once: true });
}

function writerMenu(x: number, y: number, btn: HTMLElement | null = null, tail?: [string, () => unknown], again = false) {
  const other = tail ? `<button class="mi" data-tail><i class="tb-ic">${ICONS.git}</i><span class="mi-n">${esc(tail[0])}</span>${chip('›')}</button>` : '';
  const model = `<button class="mi" data-wsub data-sub aria-haspopup="menu" aria-expanded="false"><span class="mi-n">${esc(writerModel())}</span>${chip('›')}</button>`;
  popMenu(x, y, menuHead('✦', 'writing helper') + bands({ pick: [['agent', agentRows()], ['model', model]], other }), (b) => {
    if (b.dataset.wa) return setAgent(b.dataset.wa);
    if (b.dataset.wsub != null) return openModels(b);
    if (b.dataset.tail != null) tail?.[1]();
  });
  keepMenu(() => {
    closeSub(false);
    writerMenu(x, y, btn, tail, true);
  });
  if (!again) tie(btn);
}
export function writerUnder(btn: HTMLElement, tail?: [string, () => unknown]) {
  if (pressed === btn) return void (pressed = null);
  const r = btn.getBoundingClientRect();
  writerMenu(r.left, r.bottom + 6, btn, tail);
}

function listMenu(btn: HTMLElement, html: string, pick: (b: HTMLElement) => unknown) {
  const r = btn.getBoundingClientRect();
  popMenu(r.left, r.bottom + 6, html, pick);
  $<HTMLElement>('#colormenu').querySelectorAll('.chk').forEach((x) => x.setAttribute('data-shut', ''));
  tie(btn);
}
export const writerRowHtml = (): string =>
  `<button class="chip" data-writer="agent" aria-haspopup="menu">${esc(writerName())} ▾</button><button class="chip wr-model" data-writer="model" aria-haspopup="menu">${esc(writerModel())} ▾</button>`;
export function writerRowClick(t: Element): boolean {
  const b = t.closest<HTMLElement>('[data-writer]');
  if (!b) return false;
  if (pressed === b) return (pressed = null), true;
  if (b.dataset.writer === 'agent') return listMenu(b, menuHead('✦', 'writing helper') + bands({ pick: ['agent', agentRows()] }), (x) => x.dataset.wa && setAgent(x.dataset.wa)), true;
  const agent = writerAgent(), head = menuHead('✦', 'writing helper');
  listMenu(b, head + note('Reading the models…'), () => {});
  read(agent).then((l) => [bands({ pick: ['model', modelRows(agent, l)] }), l] as [string, List], (e) => [note(e.message), null] as [string, null]).then(([html, l]) => {
    if (shownFor !== b || !b.isConnected) return;
    listMenu(b, head + html, (x) => l && modelPick(agent, l, x));
  });
  return true;
}
