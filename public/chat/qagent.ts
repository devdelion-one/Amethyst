import { ask, barMenu, ICONS, rowIcons, winX } from '../base/controls.ts';
import { icon } from '../base/icon.ts';

export const qaPlus = () => winX('+', 'title="New chat&#10;Starts a new quick chat. This one moves to orchestration and keeps running." aria-label="new chat"');
import { createChat } from './chat.ts';
import { gem } from '../base/kinds.ts';
import { agentPin, api, levelKey, modeOfOne, projectOf, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { chatOn, chatsOn, onPref, pref, PREFS } from '../base/prefs.ts';
import { agentShort, pinnedAt, pinOf, ringSvg, setPin } from '../base/agentmenu.ts';
import { agents, onAgents, started } from '../base/stream.ts';
import { openQuick } from '../app/tabs.ts';
import { $, agentName, AM, chatProgram, chatTabOf, setSave, showErr, store, uid } from '../base/util.ts';
import { heldElsewhere, hold, on, onHeld, popWith, send, SOLO, WIN } from '../base/windows.ts';
import { onPlace } from '../app/places.ts';
import { agentHead, HEAD_BTNS, HEAD_SEL, headClick, paintHead, toolsSlot } from '../app/chathead.ts';
import type { HeadCan } from '../app/chathead.ts';
import { setMark, togglePin } from '../app/actions.ts';
import { markMenu } from '../base/agentrow.ts';
import { crystalOf } from '../base/codes.ts';
import { titleOf } from '../base/agentlook.ts';
import { owner, place } from '../base/place.ts';
type QRec = { id: string; program: string };
type QTab = { id: string; type: string; chat?: string; pid: string; resume?: string; title?: string };
type Cur = { key: string; program: any; tab: QTab; view: ReturnType<typeof createChat>; frame?: HTMLElement };
type QWin = { el: HTMLElement; body: HTMLElement; pj: HTMLElement; cur: Cur | null; fr: any };

export const QAKEY = 'quickAgent';
const AGENTS = [['claude', 'use your Claude sign-in'], ['codex', 'use your Codex CLI sign-in'], ['antigravity', 'use your Antigravity CLI sign-in'], ['cursor', 'use your Cursor CLI sign-in'], ['copilot', 'use your GitHub Copilot CLI sign-in'], ['grok', 'use your Grok CLI sign-in']];
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((z) => `<i data-rs="${z}"></i>`).join('');

const state = () => store.get('qagent', { open: false });
const QA_CAN: HeadCan = { mark: true, pin: true, set: true, tab: true, bench: false, closeTip: 'close the chat: it asks whether to end it, or move it to Orchestration (it keeps running there)', where: 'Quick Agent' };
const qaAgent = () => (w?.cur?.tab.chat ? agents.all.get(w.cur.tab.chat) : undefined);
function paintQa() {
  const cur = w?.cur, f = cur?.frame;
  if (!cur || !f) return;
  const a = qaAgent(), hd = f.firstElementChild as HTMLElement;
  const h = a ? agentHead(a, QA_CAN) : `<i class="dk-mark">${gem('ai')}</i><b class="dk-title">new chat</b><span class="grow"></span>${toolsSlot()}`;
  if (a) f.style.setProperty('--gem-c', crystalOf(a.id).color);
  hd.toggleAttribute('data-ask', a?.status === 'asks');
  paintHead(hd, h, { bar: cur.view.bar, menu: cur.view.el.querySelector('.ch-menu'), home: () => cur.view.home?.() });
}
const GO = { go: true, am: AM, label: '', open: true };
function moveOut(id: string, to: unknown, how: typeof GO) {
  if (w?.cur?.tab.chat !== id) return;
  w.cur.view.detach();
  w.cur = null;
  w.body.replaceChildren();
  if (SOLO) hold(null, levelKey());
  fresh();
  if (SOLO) return void send('qamove', { id, to, how });
  return page.chatTo(id, to, how);
}
async function toEditor(id: string) {
  const r = modeOfOne() === 'editor' ? 'go' : await ask({ title: 'Move the chat to the Editor?', text: 'It becomes a tab in the Editor you used last. Stay where you are, or go to the Editor to see it.', choices: [{ label: 'send and stay', value: 'stay' }, { label: 'send and go', value: 'go' }] });
  if (!r) return;
  await moveOut(id, { ed: '' }, (r.value ?? r) === 'go' ? GO : STAY);
  requestAnimationFrame(() => w?.cur?.view.focus?.());
}
function frameOf(cur: Cur) {
  const f = document.createElement('div');
  f.className = 'dk-cell qa-cell';
  f.innerHTML = '<header class="dk-ch"></header><div class="dk-body"></div>';
  f.lastElementChild!.append(cur.view.el);
  f.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>(HEAD_SEL);
    if (!b || !f.contains(b) || w?.cur !== cur) return;
    headClick(b, {
      agent: qaAgent,
      out: (_, sure) => close(false, sure),
      set: (at) => {
        const a = qaAgent();
        if (a) page.chatPlaces(a, at, (to, how) => moveOut(a.id, to, how));
      },
      tab: () => {
        const a = qaAgent();
        if (a) toEditor(a.id);
      },
      pin: (a) => togglePin(agentPin(a, titleOf(a))),
      mark: (a, x, y) => markMenu(a, x, y, setMark, paintQa),
    }, e);
  });
  return f;
}
const OWN = !!window.amethyst?.desktop;
const setState = (st: { open: boolean }) => store.set('qagent', st);
const chats = () => store.get('qagent:chats', {});
const HERE = { in: 'qagent' };
const letGo = (id: string) => owner(id)?.in === HERE.in && place(id, null);
export const isQuickChat = (id: string) => owner(id)?.in === HERE.in && chats()[levelKey()]?.id === id;
const live = (rec: QRec | undefined) => (rec && agents.all.get(rec.id)?.status !== 'ended' && agents.all.has(rec.id) ? rec : null);

let w: QWin | null = null;

function make() {
  const el = document.createElement('section');
  el.className = 'box qtwin qawin';
  el.hidden = true;
  el.setAttribute('aria-label', 'quick agent');
  el.innerHTML = `<div class="fw-head"><span class="qt-name">${gem('ai')}<span class="nm">Quick Agent</span></span><span class="szs"></span><button class="x" data-qanew title="New chat&#10;Starts a new quick chat. This one moves to orchestration and keeps running." aria-label="new chat">${ICONS.wplus}</button><button class="x" data-qahide aria-label="hide">${ICONS.wmin}</button><button class="x" data-qax title="Close&#10;Closes the chat, or moves it to orchestration." aria-label="close">${ICONS.wx}</button></div><div class="qt-body"></div>${RS}`;
  ($('#app') || document.body).append(el);
  w = { el, body: el.querySelector<HTMLElement>('.qt-body')!, pj: el.querySelector<HTMLElement>('.qt-name')!, cur: null, fr: null };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-qanew],[data-qahide],[data-qax]') as HTMLElement;
    if (!b) return;
    if ('qahide' in b.dataset) return hide();
    if ('qanew' in b.dataset) return renew();
    close(true, e.shiftKey);
  });
  const hideBtn = el.querySelector<HTMLElement>('[data-qahide]')!;
  hideBtn.title = 'Hide\nHides the Quick Agent. The chat keeps working.';
  hideBtn.dataset.tipKeys = `${QAKEY}:show or hide`;
  const plus = el.querySelector('[data-qanew]') as HTMLElement, paint = () => (plus.hidden = !pref('qagent:new'));
  paint();
  onPref('qagent:new', paint);
}
rowIcons({ 'qagent:new': () => icon('plus') });
barMenu('.qawin .fw-head', 'qagent', { at: () => 'qagent' });

function chooser() {
  w!.cur?.view.detach();
  w!.cur = null;
  const rings = pref('agent:pinRings'), cur = pinnedAt('quick');
  const ring = (p: string) => {
    if (!rings) return '';
    const mine = cur === p, tip = mine ? `Unpin ${agentShort(p)}&#10;A new quick chat asks which agent again.` : `Pin ${agentShort(p)}&#10;A new quick chat starts with ${agentShort(p)}, without asking.`;
    return `<button class="am-pin qa-pin${mine ? ' on' : ''}" data-qapin="${p}" title="${tip}" data-tip-set="agents" aria-label="${mine ? 'unpin' : 'pin ' + agentShort(p)}" aria-pressed="${mine}">${ringSvg(mine)}</button>`;
  };
  const row = ([p, tip]: string[]) => `<div class="qa-row"><button class="qa-opt" data-qa="${p}"><i>${gem('ai')}</i><span class="qa-t"><span class="nm">${agentName(p)}</span><span class="d">${tip}</span></span></button>${ring(p)}</div>`;
  w!.body.innerHTML = `<div class="qa-pick"><div class="qa-card"><span class="qa-h">which agent?</span><div class="qa-list">${AGENTS.filter(([p]) => chatOn(p)).map(row).join('')}</div><div class="qa-foot"><button class="qa-set" data-qaset>change it in settings</button></div></div></div>`;
  w!.body.querySelector('.qa-pick')!.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-qaset]')) return toSettings();
    const pin = (e.target as HTMLElement).closest<HTMLElement>('[data-qapin]');
    if (pin) {
      const k = pin.dataset.qapin!;
      setPin('quick', cur === k ? '' : k);
      chooser();
      return w!.body.querySelector<HTMLElement>(`[data-qapin="${k}"]`)?.focus();
    }
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-qa]');
    if (b) mount(b.dataset.qa!);
  });
}

function toSettings() {
  if (SOLO) return send('qasettings');
  openPref();
}

function openPref() {
  store.set('settings:tab', 'agents');
  page.openSettings?.();
  setTimeout(() => document.querySelector('#settings [data-pinbox]')?.scrollIntoView({ block: 'center' }));
}

function mount(program: string, rec: QRec | null = null, more: { resume?: string; title?: string } = {}) {
  const key = levelKey();
  w!.cur?.view.detach();
  const tab = { id: 'qa-' + uid(), type: 'ai', chat: rec?.id, pid: S.pid, ...more };
  tab.type = chatTabOf(program);
  const cur = { key, program, tab } as { key: string; program: any; tab: typeof tab; view: ReturnType<typeof createChat>; frame?: HTMLElement };
  const onSaved = () => {
    const now = chatProgram(tab.type), kept = chats()[key];
    if (!tab.chat || (kept?.id === tab.chat && kept.program === now)) return;
    cur.program = now;
    store.set('qagent:chats', { ...chats(), [key]: { id: tab.chat, program: now } });
    if (kept?.id === tab.chat) return;
    if (kept) letGo(kept.id);
    started({ id: tab.chat, kind: 'chat', program: now, pid: tab.pid }, HERE);
    if (SOLO) hold(tab.chat, key);
  };
  cur.view = createChat(tab, {
    saved: onSaved,
    filesChanged() {},
    openFile: (p) => (SOLO ? send('openq', { path: p }) : openQuick(p)),
    titled() {},
    openBeside: (x) => mount(x.program || program, null, { resume: x.session, title: x.title }),
  });
  if (!rec && tab.chat) onSaved();
  w!.cur = cur;
  cur.frame = frameOf(cur);
  w!.body.replaceChildren(cur.frame);
  paintQa();
  if (rec) place(rec.id, HERE);
  if (SOLO && rec) hold(rec.id, key);
  if (!rec) requestAnimationFrame(() => cur.view.focus?.());
}

const wanted = () => {
  const x = store.get('qagent:want', null);
  return x && x.key === levelKey() && chatOn(x.program) ? String(x.program) : '';
};
function attach() {
  if (!S.pid) return;
  const key = levelKey(), want = wanted(), rec = chats()[key];
  if (want && (w!.cur?.key === key || live(rec))) return renew();
  if (w!.cur?.key === key) return;
  if (rec && !agents.loaded) return;
  if (live(rec)) return mount(rec.program, rec);
  if (want) {
    store.del('qagent:want');
    return mount(want);
  }
  const k = pinOf('quick'), on = chatsOn();
  if (k) return mount(k);
  if (on.length === 1) return mount(on[0][0]);
  w!.cur?.view.detach();
  w!.cur = null;
  chooser();
}
export function newQuickAgent(program: string) {
  if (WIN !== 1 || !S.pid) return;
  store.set('qagent:want', { key: levelKey(), program });
  if (!OWN && w && state().open && !out()) attach();
  showQuickAgent();
}

function fresh() {
  const rec = chats()[levelKey()];
  if (rec) letGo(rec.id);
  if (rec) store.set('qagent:chats', Object.fromEntries(Object.entries(chats()).filter(([k]) => k !== levelKey())));
  w!.cur?.view.detach();
  w!.cur = null;
  attach();
}

const TO_ORCH = { orch: true }, STAY = { ...GO, go: false };
const sentId = () => {
  const a = qaAgent();
  return a && (a.title || w!.cur!.view.el.querySelector('.ch-you')) ? a.id : undefined;
};
function renew() {
  const id = sentId();
  id ? moveOut(id, TO_ORCH, STAY) : fresh();
}

async function close(shut = true, sure = false) {
  const id = sentId();
  const move = id ? [{ label: 'move to Orchestration', value: 'orch' }] : [];
  const text = id ? "Move it to Orchestration: it leaves the Quick Agent and keeps running in Orchestration's list. Or close it for good (it stays in its history)." : 'Nothing was sent in it yet, so there is nothing to keep.';
  const r = sure ? 'close' : await ask({ title: 'Close the quick chat?', text, choices: [...move, { label: 'close the chat', value: 'close' }] });
  if (!r) return;
  const v = r.value ?? r;
  if (v === 'orch' && id) {
    moveOut(id, TO_ORCH, STAY);
    if (shut) hide();
    return;
  }
  const rec = chats()[levelKey()];
  if (w!.cur) w!.cur.view.stop();
  else if (rec) api('DELETE', `/api/agent?id=${encodeURIComponent(rec.id)}`, {}).catch(showErr);
  if (rec) agents.all.delete(rec.id);
  w!.cur = null;
  w!.body.replaceChildren();
  fresh();
  if (shut) hide();
}

function hide() {
  setState({ open: false });
  page.layout();
}

const out = () => {
  const rec = chats()[levelKey()];
  return !!rec && heldElsewhere(rec.id);
};

let soloOut: typeof import('../app/float.ts').soloOut | null = null;
export function toggleQuickAgent() {
  if (WIN !== 1 || !S.pid) return;
  if (OWN || !state().open) return showQuickAgent();
  if (!w || out()) return;
  hide();
}
export function showQuickAgent() {
  if (WIN !== 1 || !S.pid) return;
  if (OWN) return void soloOut?.('qagent');
  if (!w || out()) return;
  setState({ open: true });
  page.layout();
  requestAnimationFrame(() => w!.cur?.view.focus?.());
}

export function placeQuickAgent() {
  if (SOLO === 'qagent') {
    if (!w || !S.pid) return;
    w.el.hidden = false;
    attach();
    return paintQa();
  }
  if (WIN !== 1) return;
  const open = !!S.pid && (OWN ? !!popWith(levelKey(), 'qagent') : state().open), away = !OWN && out();
  $('#btn-qagent')?.classList.toggle('on', open || away);
  $('#btn-qagent')?.classList.toggle('ask', agents.all.get(chats()[levelKey()]?.id)?.status === 'asks');
  if (!w) return;
  if (away && w.cur) (w.cur.view.detach(), (w.cur = null));
  w.el.hidden = !open || away;
  if (!open || away) return;
  attach();
  paintQa();
  w.fr?.fit();
}
onPlace(placeQuickAgent);
for (const k of [...HEAD_BTNS, 'deck:model', 'deck:code', 'deck:title', 'deck:doneBadge', 'marks:on', 'pins']) if (PREFS[k]) onPref(k, paintQa);

if (SOLO === 'qagent') {
  document.documentElement.classList.add('xqa');
  make();
  $('#pop-acts').insertAdjacentHTML('afterbegin', qaPlus());
  const plus = $('#pop-acts').firstElementChild as HTMLElement;
  plus.addEventListener('click', renew);
  const paint = () => (plus.hidden = !pref('qagent:new'));
  paint();
  onPref('qagent:new', paint);
  barMenu('#winbar', 'qagent', { at: () => 'qagent' });
  onAgents(() => placeQuickAgent());
  addEventListener('storage', (e) => e.key === 'mind.qagent:want' && wanted() && placeQuickAgent());
} else if (WIN === 1) {
  if (!OWN) make();
  import('../app/float.ts').then((f) => {
    soloOut = f.soloOut;
    if (w) w.fr = f.frame(w.el, 'qaWin', () => f.preset(4));
    page.layout();
  });
  onAgents(() => placeQuickAgent());
  onHeld(() => page.layout());
  on('qasettings', () => (window.amethyst?.showWindow?.(undefined, true), openPref()));
  on('qamove', (m) => page.chatTo(String(m.id), m.to, m.how as typeof GO));
  addEventListener('storage', (e) => e.key === 'mind.qagent' && page.layout());
}
