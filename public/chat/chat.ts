import { bound, is, onTwice, show as keyName } from '../base/binds.ts';
import { ask, barMenu, holdFocus, ICONS, offClasses, popMenu, viewImage } from '../base/controls.ts';
import { chatHere, shownEl } from '../base/chatat.ts';
import { composerHtml, createComposer, keepModels } from '../app/composer.ts';
import { copy } from '../base/chips.ts';
import { icon } from '../base/icon.ts';
import { chatHead, chatMenu, signinTip, swapRow } from '../base/agentrow.ts';
import { artifactsInner } from './artbar.ts';
import { land, lift } from '../base/lift.ts';
import { report, span } from '../base/hitch.ts';
import { dropFrame, nextFrame } from '../base/measure.ts';
import { stick } from './stick.ts';
import { recentRows } from './recent.ts';
import { chatBox } from '../base/textbox.ts';
import { fileLinks, IMG_MD, imgLink, imgsIn, outKeys, outTo, relIn, withHint } from '../base/links.ts';
import { showPath } from '../base/follow.ts';
import { api, edShown, isSelected, mode, S, seenWhenPicked } from '../base/model.ts';
import { fullPath, inProject, quotePieces, quoteSplit, quoteToken, refLabel, streamed, youLinks } from '../base/chattext.ts';
import { agents, follow as stream, forgetAgent, onAgents, started } from '../base/stream.ts';
import { agentName, bigStore, chatProgram, chatTabOf, esc, quietly, setSave, showErr, store, uid } from '../base/util.ts';
import { on, POP, send } from '../base/windows.ts';
import { editsStrip } from './editstrip.ts';
import { clearNote, editFile, editsOf, firstChange, noteOf, onEdits, onNote } from '../base/edits.ts';
import { draftOf, keepDraft as putDraft } from '../base/place.ts';
import { gem, workGem } from '../base/kinds.ts';
import { limitUpdate, refuse, tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { chatOn, onPref, pref, setPref } from '../base/prefs.ts';
import { quoting } from '../base/quote.ts';
import { record } from '../base/undo.ts';
import { CHAT_SIZES, lookOf } from '../base/theme.ts';
import { every } from '../base/life.ts';
import { cmdRuns, subagents } from './subagents.ts';
import type { AgentUpdate, Artifact, ChatConfig, ChatEvent, ChatModes } from '../base/types.ts';
import { modelTip, runTime, sentTime, timeHtml, tokens } from '../base/words.ts';
import { drawStep, foldStep, ioBox, liveCmds, newFits, paintStep, runTell, setFold, stopRuns, tickRun } from './steps.ts';
import type { Line, Step } from './steps.ts';
import { checkPaths, imgChip, imgInText, imgSrc, linkPath, recheck, shaped } from './shape.ts';
import { linkRoots } from './linkroots.ts';
import { fromTag } from '../base/drive.ts';

import { createRefs } from './refs.ts';
import { pastChatsPopup } from './pastchats.ts';
import { createSignIn } from './signin.ts';
import { createCards } from './cards.ts';
import { createLanes } from './lanes.ts';
import { createRing } from './ring.ts';
import { createRewind, mounts } from './rewind.ts';
import { chatFind } from './chatfind.ts';
import { stepWord } from '../base/agentlook.ts';
import { wtChip } from './wtchip.ts';
import { handCard } from './handoff.ts';
import type { HandReply } from './handoff.ts';
import type { Earlier } from './pastchats.ts';
type Hand = NonNullable<Extract<ChatEvent, { type: 'you' }>['handoff']>;
type ChatEl = HTMLDivElement & { renderWt?: () => void; marks?: () => void; draws?: { events: number; frames: number }; showModel?: () => void; showParts?: () => void; showAll?: () => void; showArtifacts?: () => void; missed?: string };
type Tab = { id: string; type: string; chat?: string | null; pid?: string; title?: string | null; zoom?: number; draft?: string; resume?: string | null };
type Switch = { key: string; name: string; category?: string; description?: string; value: unknown; options: any[] };
type Starter = { extras(): Switch[]; pick(key: string, value: unknown): void; seed?: { modes: any; configs: any[] } | null; placeholder: string; firing: (o: { go: boolean; text: string; done: Promise<void> }) => void };
type Modes = ChatModes;
type Config = ChatConfig;
type Diff = { path: string; rel: string | null; oldText: string; newText: string };
type ChatOpts = {
  saved: () => void;
  filesChanged: () => void;
  openFile: (path: string) => unknown;
  titled: (title: string | null) => void;
  openDiff?: ((d: Diff) => unknown) | null;
  openBeside: (s: Earlier) => unknown;
  box?: Starter | null;
  openSub?: ((id: string, keep: boolean) => unknown) | null;
};

offClasses('chpill:off', 'ch');
offClasses('chat:off', 'chpart');
offClasses('chrow:off', 'ch');
barMenu('.ch-row', 'chrow');
barMenu('.ch-artifacts', 'artifacts');
barMenu('.sv-head', '');
const EDIT_ACTS: [string, string, string, string][] = [['review', 'review', ICONS.review, 'Every file this chat changed, with the changes marked, in a window of its own.'], ['keep', 'keep all', ICONS.keepAll, 'Leaves every file as it is on disk and clears the marks.'], ['reject', 'reject all…', ICONS.x, 'Writes every file back to how it was before this chat changed it. It asks first.']];
barMenu('.ch-edits', 'edits', { make: (el) => ({ acts: EDIT_ACTS.map(([k, n, ic, tip]) => `<button class="mi" data-edact="${k}" title="${tip}"><i class="tb-ic">${ic}</i><span class="mi-n">${n}</span></button>`).join(''), onPick: (b) => el.querySelector<HTMLElement>(`[data-ed="${b.dataset.edact}"]`)?.click() }), at: (el) => (el.closest('.oc-chat') ? 'oc' : el.closest('.qawin, .xqa') ? 'qagent' : 'win') });
const diffAnywhere = (d: Diff) => (POP ? send('opendiff', { d }) : page.openDiff?.(d));
onPref('chatMarks', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.marks?.()));
onPref('deck:model', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.showModel?.()));
onPref('chat:worktree', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.renderWt?.()));
onPref('chat:wtStrip', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.renderWt?.()));
onPref('chat:artifacts', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.showArtifacts?.()));
onPref('chat:off', () => document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.showParts?.()));
onPref('chat:recent', (on) => !on && document.querySelectorAll<ChatEl>('.chat').forEach((c) => c.showAll?.()));

const QUIET = 20000;
let agentList: { at: number; p: Promise<any>; v?: any } | null = null;
function agentsSoon() {
  if (agentList && Date.now() - agentList.at < 15e3) return agentList;
  const e = { at: Date.now(), p: api('GET', '/api/agents'), v: agentList?.v };
  agentList = e;
  e.p.then((v) => (e.v = v), () => agentList === e && (agentList = null));
  return e;
}
const handTip = (to: string, open: boolean) => (open ? `With the chat so far\nClick to fold what ${agentName(to)} was given.` : `With the chat so far\n${agentName(to)} got the chat so far with this message. Click to see what it was given.`);
const nameOf = (tab: Tab) => agentName(chatProgram(tab.type));
const NAME = nameOf;
const agentOf = (tab: Tab) => chatProgram(tab.type);

const flat = (opts: any[] | undefined) => (opts || []).flatMap((o) => (Array.isArray(o.options) ? o.options : [o]));


bigStore.keys().then((keys) => {
  const named = new Set(Object.values(store.get('chatImages', {})).flat().map((a: any) => 'img:' + a.id));
  for (const k of keys as string[]) if (!named.has(k)) bigStore.del(k);
});

const boxes = new Set<any>();
function redraft(id: string | null | undefined, skip: unknown) {
  if (!id) return;
  const d = draftOf(id);
  for (const b of boxes) if (b !== skip && b.tab.chat === id && b.composer.value() !== d) b.composer.put(d);
}
let lastUsed: Tab | null = null;
let lastNew: string | null = null;
const lastTab = () => lastUsed || (lastNew && [...boxes].find((b) => b.tab.id === lastNew)?.tab) || null;
export const lastChatId = () => lastTab()?.chat || null;
export function lastNewChat() {
  const t = lastTab();
  return t && !t.chat && [...boxes].some((b) => b.tab === t) ? t.id : null;
}
export const chatShown = (key: string) => [...boxes].some((b) => (b.tab.chat === key || b.tab.id === key) && b.el.isConnected && b.el.checkVisibility() && b.el.offsetWidth > 0);
export function usedNew(id: string | null) {
  lastUsed = null;
  lastNew = id;
}
export function addText(id: string, text: string) {
  const b = [...boxes].filter((x) => x.tab.chat === id).sort((x, y) => y.el.isConnected - x.el.isConnected)[0];
  if (b) return b.composer.append(text);
  const d = draftOf(id).trimEnd();
  putDraft(id, d ? `${d}\n\n${text}` : text);
  send('redraft', { id });
}
on('redraft', (m) => redraft(String(m.id), null));
export async function toChat(key: string, { image, pick, quote }: { image?: File; pick?: { text: string }; quote?: { text: string; from?: string } }) {
  const b = [...boxes].filter((x) => x.tab.chat === key || x.tab.id === key).sort((x, y) => y.el.isConnected - x.el.isConnected)[0];
  if (b && quote) return b.composer.addQuote(quote.text, quote.from);
  if (b && pick) return b.composer.addPick(pick);
  if (b) return b.composer.addImages([image]);
  if (quote) {
    const d = draftOf(key).trimEnd();
    return putDraft(key, (d ? d + ' ' : '') + quoteToken(quote.text, quote.from) + ' ');
  }
  if (pick) return putDraft(key, pick.text + '\n\n' + draftOf(key));
  const all = store.get('chatImages', {}), list = all[key] || [];
  const a = { id: uid(), name: '', mimeType: image!.type, size: image!.size };
  store.set('chatImages', { ...all, [key]: [...list, a] });
  await bigStore.set('img:' + a.id, image);
}

const pool = new Map();
const HEAR_MS = 8000, HEAR_MAX = 30000, HEAR_FAILED = 1000, HEAR_TRIES = 3, HEAR_SHOW = 15000;
const NOOP = () => {};
const loose = (id: string, a: any): Tab => ({ id: 'pool-' + uid(), type: chatTabOf(a?.program), chat: id, pid: a?.pid ?? S.pid });
const LOOSE = { saved: NOOP, filesChanged: NOOP, openFile: NOOP, titled: NOOP, openBeside: NOOP };
const toggles = new WeakMap<Element, () => unknown>();
onTwice('boxKey', () => {
  const c = document.activeElement?.closest?.('.chat');
  if (c) toggles.get(c)?.();
});

export function createChat(tab: Tab, opts: ChatOpts) {
  const v = tab.chat && !opts.box && pool.get(tab.chat);
  if (!v) return makeChat(tab, opts);
  pool.delete(tab.chat);
  v.adopt(tab, opts);
  return v;
}
export const pooled = () => [...pool.keys()];
let warming = 0;
function warm() {
  for (const [id, v] of pool) if (!agents.all.has(id)) v.shut();
  if (POP || !agents.loaded || warming) return;
  const have = new Set([...boxes].map((b) => b.tab.chat));
  const todo = [...agents.all.values()].filter((a) => a.kind === 'chat' && !have.has(a.id));
  if (!todo.length) return;
  warming = requestIdleCallback(() => {
    warming = 0;
    const now = new Set([...boxes].map((b) => b.tab.chat));
    for (const a of todo.filter((a) => agents.all.has(a.id) && !now.has(a.id)).slice(0, 3)) pool.set(a.id, makeChat(loose(a.id, a), LOOSE));
    warm();
  }, { timeout: 500 });
}
onAgents(warm);

function signTip(line: string) {
  const m = /^(.*?)(?: \((.*)\))?$/.exec(line)!, extra = (m[2] || '').split(' · ').filter(Boolean);
  const email = extra.find((x) => x.includes('@')), plan = extra.find((x) => x !== email && !/environment/.test(x)), rest = extra.filter((x) => x !== email && x !== plan);
  if (!line) return 'Sign-in\nNot read yet.';
  return `Sign-in${plan ? `: ${plan}` : ''}\nThis chat uses ${m[1]}${[email, ...rest].filter(Boolean).map((x) => `, ${x}`).join('')}.`;
}

function makeChat(tab: Tab, { saved, filesChanged, openFile, titled, openDiff = null, openBeside, box = null, openSub = null }: ChatOpts) {
  let name = NAME(tab);
  let named = !!tab.title, own = false;
  let starter = box, seed = box?.seed || null, ready = false;
  const waits: { ok: () => void; no: (e: Error) => void }[] = [], agentReady = () => (ready ? Promise.resolve() : new Promise<void>((ok, no) => waits.push({ ok, no })));
  const settle = (why?: string) => {
    for (const w of waits.splice(0)) why ? w.no(new Error(why)) : w.ok();
  };
  openDiff ||= diffAnywhere;
  let editStrip: ReturnType<typeof editsStrip> | null = null;
  const el = document.createElement('div') as ChatEl;
  el.className = 'chat';
  if (tab.chat) el.dataset.chat = tab.chat;
  el.classList.toggle('no-diff', !openDiff);
  el.tabIndex = -1;
  el.innerHTML = `
    ${chatHead(name)}
    ${chatMenu()}
    <div class="ch-plan" hidden></div>
    <div class="ch-artifacts" hidden></div>
    <div class="ch-find-at"></div>
    <div class="ch-rules" aria-hidden="true"></div><div class="ch-log"><div class="ch-flow"></div></div><div class="ch-marks" aria-hidden="true"></div>
    ${composerHtml({ chat: true })}`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;

  let fromChat: string | null = null;
  const wtc = wtChip({ el, btn: $('.ch-wt'), cwd: $('.ch-cwd'), pid: () => pid(), chat: () => tab.chat, line: (c: string, h: string) => line(c, h) });
  const where = wtc.where, roots = linkRoots();
  const rootsOf = (box: Line) => ({ ...where(pid()), agent: box.from, touched: roots.touched() });
  const shuts: (() => void)[] = [], onShut = (fn: () => void) => shuts.push(fn);
  const shutAll = () => {
    for (const fn of shuts.splice(0)) {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    }
  };
  const bar = $('.ch-tools'), head = $('.ch-head');
  const log = $('.ch-log');
  const refs = createRefs({ el, log, pid: () => pid(), where: (p: string) => where(p), openFile: (p: string) => openFile(p) });
  const { isLink, dragLink, dragLinks, windowLink, rawOf, openRef, refMenu } = refs;
  const shownPath = (rel: string) => {
    const c = where(pid()), f = fullPath(rel, c);
    return relIn(f, c.root) || f;
  };
  const input = chatBox($('.ch-ta'), {
    label: `message to ${name}`,
    acts: { url: (rel: string) => rawOf(rel), known: (rel: string) => isLink(rel), tip: (rel: string) => withHint(shownPath(rel)), open: (rel: string, e: MouseEvent) => openRef(rel, e), menu: (e: MouseEvent, rel: string, kind: string) => refMenu(e, rel, kind), quote: (text: string) => quote.flash(text) },
  });
  const size = () => tab.zoom ?? store.get('chatsize', {})[tab.chat as string] ?? lookOf().chat;
  const zoomed = () => (log.style.zoom = (size() / 100) as unknown as string);
  zoomed();
  let wheelSum = 0, wheelIdle = 0;
  el.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey || e.defaultPrevented) return;
      e.preventDefault();
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => (wheelSum = 0), 250);
      wheelSum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(wheelSum) < 50) return;
      const i = CHAT_SIZES.indexOf(size()) - Math.sign(wheelSum);
      wheelSum = 0;
      if (i < 0 || i >= CHAT_SIZES.length) return;
      tab.zoom = CHAT_SIZES[i];
      if (tab.chat) store.set('chatsize', { ...store.get('chatsize', {}), [tab.chat]: tab.zoom });
      zoomed();
      saved();
    },
    { passive: false },
  );
  let unfollow: (() => void) | null = null, busy = false, ended = false, text: Line | null = null, thought: Line | null = null, you: Line | null = null, steps: Line | null = null;
  let modes: Modes | null = null, configs: Config[] = [], commands: { name: string; description?: string; run?: boolean }[] = [];
  let last: Record<string, string> | null = null, said = 0, shrinkOn = false;
  let setting: Promise<void> | null = null;
  let working: Line | null = null, since = 0, tick: (() => void) | null = null, turnAt = 0;
  const tools = new Map<string, Step>(), asks = new Map<string, Line>();
  const subs = subagents();
  let runs = cmdRuns();
  const queued = new Map<string, { text: string; images: string[]; row: HTMLElement }>();
  let lastAi: string | null = null;
  const pid = () => tab.pid ?? S.pid;
  const seen = seenWhenPicked(el, () => tab.chat);
  onShut(seen.stop);

  const flow = $('.ch-flow'), jump = $('.ch-jump');
  const st = stick(log, flow, jump, { el, selected: () => isSelected(el), grew: (g: boolean) => marks(g) });
  onShut(() => st.stop());
  const { pin, easeTo, atEnd, toEnd } = st;
  let finding: (() => boolean) | null = null;
  const recent = recentRows(log, flow, {
    on: () => !!pref('chat:recent'),
    may: () => !finding?.(),
    pinned: st.pinned,
    stay: () => (st.stopEase(), pin(false)),
    keep: st.settle,
    paint: paintRows,
    shown(rows) {
      if (liveCmds()) for (const t of tools.values()) if (t.running && rows.some((r) => r.contains(t.row))) tickRun(t);
      marks();
    },
  });
  el.showAll = () => recent.all();
  let trimT: ReturnType<typeof setTimeout> | 0 = 0;
  onShut(() => clearTimeout(trimT));
  const everywhere = (sel: string) => [...recent.held().flatMap((r) => [...(r.matches(sel) ? [r] : []), ...r.querySelectorAll<HTMLElement>(sel)]), ...flow.querySelectorAll<HTMLElement>(sel)];
  const backToEnd = () => {
    pin(true);
    toEnd();
  };
  function tickedRows() {
    let ai = false;
    return [...flow.children].filter((m) => {
      if (m.classList.contains('ch-you')) return (ai = false) || true;
      if (ai || !m.matches('.ch-steps, .ch-ai')) return false;
      return (ai = true);
    });
  }
  const strip = $('.ch-marks');
  let marksT = 0, marksAt = -Infinity;
  const marksJob = {
    name: 'chat.marks',
    read: () => {
      marksAt = performance.now();
      const H = log.scrollHeight;
      if (!pref('chatMarks') || !log.clientHeight || H <= log.clientHeight + 2) return null;
      const lr = log.getBoundingClientRect(), fr = flow.getBoundingClientRect(), elTop = el.getBoundingClientRect().top;
      const k = fr.height / flow.offsetHeight || 1, pad = parseFloat(getComputedStyle(log).paddingTop) || 0;
      const ticks = tickedRows().map((m): [string, number] => [m.classList.contains('ch-you') ? 'you' : 'ai', m.getBoundingClientRect().top]);
      return { top: lr.top - elTop, height: lr.height, html: ticks.map(([c, t]) => `<i class="${c}" style="top:${(((t - fr.top) / k + pad) / H * 100).toFixed(3)}%"></i>`).join('') };
    },
    write: (r: { top: number; height: number; html: string } | null) => {
      if (!r) return void (strip.hidden = true, strip.replaceChildren());
      strip.style.top = `${r.top}px`;
      strip.style.height = `${r.height}px`;
      strip.innerHTML = r.html;
      strip.hidden = false;
    },
  };
  const rules = $('.ch-rules');
  const rulesJob = {
    name: 'chat.rules',
    read: () => {
      const er = el.getBoundingClientRect(), lr = log.getBoundingClientRect(), k = er.height / el.offsetHeight || 1;
      const ys = [...flow.querySelectorAll<HTMLElement>(':scope > .ch-steps + .ch-ai')].map((m) => (m.getBoundingClientRect().top - lr.top) / k).filter((y) => y > -2 && y < lr.height / k + 2);
      return { top: (lr.top - er.top) / k, height: lr.height / k, html: ys.map((y) => `<i style="top:${y.toFixed(2)}px"></i>`).join('') };
    },
    write: (r: { top: number; height: number; html: string }) => {
      rules.style.top = `${r.top}px`;
      rules.style.height = `${r.height}px`;
      if (rules.innerHTML !== r.html) rules.innerHTML = r.html;
    },
  };
  log.addEventListener('scroll', () => nextFrame(rulesJob), { passive: true });
  onShut(() => dropFrame(rulesJob));
  function marks(growing = false) {
    nextFrame(rulesJob);
    dropFrame(marksJob);
    clearTimeout(marksT);
    const wait = growing ? marksAt + 250 - performance.now() : 0;
    if (wait > 0) return void (marksT = setTimeout(marks, wait));
    nextFrame(marksJob);
  }
  el.marks = () => marks();
  el.draws = { events: 0, frames: 0 };
  onShut(() => (dropFrame(marksJob), clearTimeout(marksT)));
  log.addEventListener('click', (e) => {
    const sum = (e.target as HTMLElement).closest('.st:is(.think, .compact) > details > summary');
    if (!sum) return;
    e.preventDefault();
    const d = sum.parentElement as HTMLDetailsElement;
    if (!(d.open = !d.open)) return;
    st.settle();
    const r = d.closest('.st')!.getBoundingClientRect(), box = log.getBoundingClientRect(), css = getComputedStyle(log);
    const up = box.top + parseFloat(css.paddingTop), down = box.top + log.clientHeight - parseFloat(css.paddingBottom);
    pin(false);
    easeTo(log.scrollTop + Math.min(Math.max(0, r.bottom - down), r.top - up));
  });
  const line = (cls: string, html: string, into: HTMLElement | null = null) => {
    const d = document.createElement('div') as Line;
    d.className = cls;
    d.innerHTML = html;
    if (text) endText(text);
    finishThought();
    if (into) into.append(d);
    else if (working?.parentElement === flow) flow.insertBefore(d, working);
    else flow.append(d);
    text = thought = you = null;
    return d;
  };
  const timeline = () => (steps?.parentElement === flow ? steps : (steps = line('ch-steps', '')));
  function closeSteps() {
    finishThought();
    if (steps && !steps.children.length) steps.remove();
    steps = null;
  }
  function finishThought() {
    if (!thought?.t0) return;
    const sec = Math.round((Date.now() - thought.t0) / 1000);
    thought.querySelector('.v')!.textContent = sec >= 1 ? `Thought for ${sec}s` : 'Thought';
    thought.t0 = 0;
  }
  const state = (s: string, cls = '') => {
    $('.ch-state').textContent = s;
    $('.ch-state').className = 'ch-state ' + cls;
  };
  const setBusy = (b: boolean) => {
    const was = busy;
    busy = b;
    composer.update();
    el.classList.toggle('busy', b);
    if (b && !was) startWorking();
    if (!b) stopWorking();
  };


  function startWorking() {
    since = Date.now();
    working = document.createElement('div') as Line;
    working.className = 'ch-working';
    flow.append(working);
    working!.innerHTML = `<i class="ch-spin">${workGem()}</i><span></span><span class="dim"></span><span class="dim ch-wk-subs"></span>`;
    const [what, when, many] = working!.querySelectorAll('span');
    const show = () => {
      const s = Math.round((Date.now() - since) / 1000), n = subs.running();
      what.textContent = asks.size ? 'Waiting for you' : 'Generating…';
      when.textContent = runTime(s) + (ring.usage() ? ` · ${tokens(ring.usage()!.used)} tokens in the chat` : '');
      many.textContent = n ? `· ${n} agent${n > 1 ? 's' : ''} running` : '';
    };
    working!.show = show;
    show();
    tick?.();
    tick = every(1000, show);
  }
  function stopWorking() {
    tick?.();
    tick = null;
    working?.remove();
    working = null;
  }
  onShut(stopWorking);

  function switches() {
    const list = [...(starter?.extras() || [])];
    const hasModeOpt = configs.some((c) => c.category === 'mode');
    if (modes?.availableModes?.length && !hasModeOpt) list.push({ key: 'mode:', name: 'Mode', category: 'mode', value: modes.currentModeId, options: modes.availableModes.map((m) => ({ value: m.id, name: m.name, description: m.description })) });
    for (const c of configs) if (c.type === 'select') list.push({ key: c.id, name: c.name, category: c.category, description: c.description, value: c.currentValue, options: flat(c.options) });
    return list;
  }
  function setConfigs(list: Config[] | undefined) {
    configs = list || [];
    said++;
    keepModels(agentOf(tab), switches());
    showModel();
  }
  function showModel() {
    const words = ['model', 'thought_level'].map((cat) => {
      const c = configs.find((x) => x.category === cat && x.type === 'select');
      const name = flat(c?.options || []).find((o) => o.value === c!.currentValue)?.name;
      return name && (cat === 'model' || c!.currentValue !== 'default') ? name.replace(/\s*\([^)]*\)/g, '') : '';
    }).filter(Boolean).join(' · ');
    const shown = pref('deck:model') ? words : '';
    bar.querySelector('.ch-model')!.textContent = shown;
    bar.querySelector<HTMLElement>('.ch-model')!.title = shown ? modelTip(words) : '';
  }
  el.showModel = showModel;
  const lastKey = () => (agentOf(tab) === 'claude' ? pid() : `${agentOf(tab)}:${pid()}`);
  async function setSwitch(key: string, value: string) {
    if (starter?.extras().some((p) => p.key === key)) return starter.pick(key, value), true;
    if (starter && !ready) {
      const c = configs.find((x) => x.id === key), cat = key === 'mode:' ? 'mode' : c?.category;
      if (c) c.currentValue = value;
      else if (modes) modes.currentModeId = value;
      if (cat) {
        store.set('switches', { ...store.get('switches', {}), [lastKey()]: { ...store.get('switches', {})[lastKey()], [cat]: value } });
        last = { ...last, [cat]: value };
      }
      return true;
    }
    const chat = tab.chat;
    if (!chat) return false;
    const known = key === 'mode:' ? modes?.currentModeId : configs.find((c) => c.id === key)?.currentValue;
    if (value !== known) {
      const r = await api('POST', '/api/agent/send', key === 'mode:' ? { id: chat, mode: value } : { id: chat, config: { id: key, value } });
      if (r?.shrink === 'failed') tell($('.ch-box'), { title: "Couldn't summarize the chat first", line: `${r.why ? r.why + '. ' : ''}The new model got the whole chat.`, ms: 5000 });
      if (tab.chat !== chat) return false;
    }
    if (key === 'mode:' && modes) modes.currentModeId = value;
    const c = configs.find((x) => x.id === key);
    if (c && c.currentValue === known) c.currentValue = value;
    showModel();
    const cat = key === 'mode:' ? 'mode' : c?.category;
    if (cat) store.set('switches', { ...store.get('switches', {}), [lastKey()]: { ...store.get('switches', {})[lastKey()], [cat]: value } });
    return true;
  }
  const canShrink = () => agentOf(tab) !== 'cursor' && (agentOf(tab) === 'codex' || commands.some((c) => c.name === 'compact'));
  function setShrink(on: boolean) {
    store.set('chat:shrink', on);
    shrinkOn = on;
    composer.render();
    if (tab.chat) api('POST', '/api/agent/shrink', { id: tab.chat, on }).catch(showErr);
  }
  async function useLast(want: Record<string, string>) {
    const chat = tab.chat;
    for (const cat of ['model', 'thought_level', 'mode']) {
      const p = want[cat] && switches().find((x) => x.category === cat);
      if (!p || p.value === want[cat] || !p.options.some((o: any) => o.value === want[cat])) continue;
      const h = said;
      if (!(await quietly(setSwitch(p.key, want[cat]), false))) return;
      for (let t = 0; t < 60 && cat === 'model' && said === h; t++) await new Promise((r) => setTimeout(r, 50));
    }
    if (tab.chat === chat) composer.render();
  }

  const partOff = (k: string) => pref('chat:off').includes(k);
  const ring = createRing({ u0: $('.ch-usage'), recent, st, line, timeline, busy: () => busy, partOff, onShut, chat: () => tab.chat, agent: () => agentOf(tab) });
  el.showParts = () => {
    el.classList.toggle('no-swap', partOff('switch'));
    el.classList.toggle('no-time', partOff('time'));
    everywhere('.st.compact').forEach((r) => (r.hidden = partOff('compact')));
    everywhere('.ch-notice').forEach((r) => (r.hidden = partOff('notice')));
    if (partOff('color')) ring.tint(null);
    ring.render();
  };

  flow.addEventListener('mouseover', (e) => {
    const t = (e.target as Element).closest('.ch-msg')?.querySelector<HTMLElement>(':scope > .ch-acts > .ch-time');
    if (t) t.textContent = sentTime(+t.dataset.at!);
  });

  const quoteChip = (n: string, raw: string) => {
    const { from, text: q } = quoteSplit(raw), said = q.length > 200 ? q.slice(0, 200) + '…' : q, title = from != null ? `${from}\n“${said}”` : `Quote ${n}\n“${said}”`;
    return `<span class="quote-chip" title="${esc(title)}"><span class="in"><span class="qn">${n}</span><span class="qt">${esc(from != null ? refLabel(from) : q)}</span></span></span>`;
  };
  function youText(t: string) {
    let h = '', at = 0;
    const file = (l: { from: number; to: number; rel: string }) => ({ ...l, html: `<span class="ch-lk lk lk-note" draggable="true" data-drag="link:${esc(l.rel)}" data-chopen="${esc(l.rel)}" title="${esc(withHint(shownPath(l.rel)))}" data-tip-out="${esc(outTo())}" data-tip-keys="${outKeys()}" data-tip-mono>${esc(t.slice(l.from, l.to))}</span>` });
    const pieces = [...fileLinks(t, isLink).map(file), ...imgsIn(t).map((i) => ({ ...i, html: imgInText(i.rel, pid()) })), ...youLinks(t, where(pid())), ...quotePieces(t, { quote: quoteChip })];
    for (const l of pieces.sort((a, b) => a.from - b.from)) {
      if (l.from < at) continue;
      h += esc(t.slice(at, l.from)) + l.html;
      at = l.to;
    }
    return h + esc(t.slice(at));
  }
  function youBox(t = '', images: { path: string }[] = [], ctx: { lines?: number; path: string } | null = null, hand: Hand | null = null, at = 0) {
    closeSteps();
    const b = line('ch-msg ch-you', '');
    b.raw = t;
    b.at = at;
    b.before = lastAi;
    const lines = ctx?.lines ? ` · ${ctx.lines} line${ctx.lines > 1 ? 's' : ''}` : '';
    const inText = new Set(imgsIn(t).map((i) => i.rel));
    b.innerHTML = `<div class="tx"></div><div class="ch-imgs">${images.filter((i) => !inText.has(i.path)).map((i) => imgChip(rawOf(i.path), i.path.split('/').pop()!, i.path)).join('')}</div>${ctx ? `<div class="ch-in">${icon('eye')}${esc(ctx.path)}${lines}</div>` : ''}${hand ? `<button type="button" class="ch-hand" data-hand="${esc(JSON.stringify({ ...hand, at }))}" aria-expanded="false" title="${esc(handTip(hand.to, false))}">${icon('agent')}with the chat so far, from ${esc(agentName(hand.from))}</button>` : ''}<span class="ch-acts">${timeHtml(at)}${tab.type === 'codex' ? '' : '<button type="button" data-edit title="Edit&#10;The chat goes back to before this message, which comes into the box to change and send again. It asks first.">edit</button>'}<button type="button" data-copy-msg aria-label="Copy">${icon('copy')}</button></span>`;
    b.querySelector('.tx')!.innerHTML = youText(t);
    return b;
  }

  let batch = false;
  const due = new Map<Element, () => void>(), fresh = new Set<Element>();
  const later = (e: Element, fn: () => void) => {
    due.set(e, fn);
    fresh.add(e);
    e.classList.add('ch-due');
  };
  function paintOne(e: Element) {
    const fn = due.get(e);
    if (!fn) return;
    due.delete(e);
    e.classList.remove('ch-due');
    fn();
  }
  function paintRows(rows: Element[]) {
    for (const r of rows) {
      if (r.classList.contains('ch-due')) paintOne(r);
      r.querySelectorAll('.ch-due').forEach(paintOne);
    }
  }
  const paintShown = () => {
    for (const e of fresh) if (flow.contains(e)) paintOne(e);
    fresh.clear();
  };
  function endText(box: Line) {
    cancelAnimationFrame(box.raf!);
    if (batch) later(box, () => drawText(box, true));
    else drawText(box, true);
  }
  function chunk(kind: string, t: string, at = 0) {
    if (kind === 'you') {
      if (!you) you = youBox('', [], null, null, at);
      you!.raw += t;
      you!.querySelector('.tx')!.innerHTML = youText(you!.raw!);
      return;
    }
    if (kind === 'text') {
      if (!text) {
        const html = `<div class="md"></div><span class="ch-acts"><button type="button" data-copy-msg aria-label="Copy">${icon('copy')}</button>${timeHtml(at)}</span>`;
        if (steps) closeSteps();
        text = Object.assign(line('ch-msg ch-ai', html), { raw: '', from: roots.agent(), at });
      }
      const box = text;
      box.raw += t;
      cancelAnimationFrame(box.raf!);
      if (batch && !document.hidden) later(box, () => drawText(box));
      else box.raf = requestAnimationFrame(() => drawText(box));
    } else {
      if (!thought) {
        thought = line('st think', '<details><summary class="row"><span class="v">Thinking…</span><span class="m"></span></summary><div class="more"></div></details>', timeline());
        thought.raw = '';
        thought.t0 = Date.now();
      }
      thought!.raw += t;
      thought!.querySelector('.more')!.textContent = thought!.raw!;
    }
  }
  function drawText(box: Line, end = false) {
    cancelAnimationFrame(box.raf!);
    if (due.delete(box)) box.classList.remove('ch-due');
    const el = box.firstElementChild!, st = (box.st ||= { line: 0, seen: new Map(), n: 0 });
    const { done, tail } = streamed(st, box.raw, where(pid()), end);
    while (el.childNodes.length > st.n) el.lastChild!.remove();
    if (done) {
      el.append(...shaped(done));
      st.n = el.childNodes.length;
      checkPaths(box, rootsOf(box));
    }
    if (tail) el.append(...shaped(tail));
  }

  function toolRow(u: any, host: HTMLElement | null = null) {
    let t = tools.get(u.toolCallId);
    if (!t) {
      const row = host ? host.appendChild(document.createElement('div')) : line('ch-tool st', '', timeline());
      t = { data: {}, row, t0: Date.now() };
      tools.set(u.toolCallId, t);
      t.row.hidden = [...asks.values()].some((a) => a.toolId === u.toolCallId);
    }
    if (!batch) return drawStep(t, u, { here: where(pid()), fits, changed: filesChanged, pop: !host });
    if (foldStep(t, u, where(pid()))) filesChanged();
    const step = t;
    later(t.row, () => paintStep(step, { here: where(pid()), fits, pop: !host }));
  }


  function plan(entries: { status: string; content: string }[] | undefined) {
    const p = $('.ch-plan');
    p.hidden = !entries?.length;
    const done = (entries || []).filter((e) => e.status === 'completed').length;
    p.innerHTML = `<div class="cp-head">plan <span class="dim">${done} / ${entries?.length || 0}</span></div>` + (entries || []).map((e) => `<div class="cp-step st-${esc(e.status)}"><i class="ck ${e.status === 'completed' ? 'on' : ''}"></i><span>${esc(e.content)}</span></div>`).join('');
  }
  let artifactsList: Artifact[] = [], artifactsOpen = true;
  function renderArtifacts() {
    const box = $('.ch-artifacts');
    const show = artifactsList.length > 0 && !!pref('chat:artifacts');
    box.hidden = !show;
    if (!show) return;
    box.classList.toggle('collapsed', !artifactsOpen);
    box.classList.toggle('needs-fb', artifactsList.some((a) => a.requestFeedback));
    box.innerHTML = artifactsInner(artifactsList, artifactsOpen);
  }
  el.showArtifacts = renderArtifacts;
  function clearArtifactsFeedback() {
    if (!artifactsList.some((a) => a.requestFeedback)) return;
    artifactsList = artifactsList.map((a) => (a.requestFeedback ? { ...a, requestFeedback: false } : a));
    renderArtifacts();
  }

  const fits = newFits();
  onShut(() => fits.disconnect());
  const lanes = createLanes({ el, bar, form: $('.ch-input'), log, flow, st, line, timeline, tools, toolRow, fits: () => fits, state, busy: () => busy, ended: () => ended, working: () => working, subs, runs: () => runs, chat: () => tab.chat, openSub, onShut });
  function toggleFold(box: HTMLElement) {
    if (!getSelection()!.isCollapsed) return;
    const row = box.closest<Line>('.ch-tool, .sa')!, i = [...row.querySelectorAll('.ch-io')].indexOf(box), open = !box.classList.contains('open');
    setFold(box, open);
    row.unfolded![open ? 'add' : 'delete'](i);
    if (open) pin(false);
    else log.scrollTop += Math.min(0, box.getBoundingClientRect().top - log.getBoundingClientRect().top);
    st.settle();
    if (atEnd()) pin(true);
  }

  const cards = createCards({ line, state, tools, asks, chat: () => tab.chat, backToEnd, input });

  function onUpdate(u: AgentUpdate, at?: number) {
    const kind = u.sessionUpdate;
    if (kind === 'agent_message_chunk' && u.messageId) lastAi = u.messageId;
    if (kind === 'agent_message_chunk' && u.content?.type === 'text') chunk('text', u.content.text, at);
    else if (kind === 'agent_thought_chunk' && u.content?.type === 'text') chunk('thought', u.content.text);
    else if (kind === 'user_message_chunk' && u.content?.type === 'text') chunk('you', u.content.text, at);
    else if (kind === 'user_message_chunk' && u.content?.type === 'image' && u.content.data) {
      if (!you) you = youBox('', [], null, null, at);
      you!.imgs = (you!.imgs || 0) + 1;
      if (you!.imgs > new Set(imgsIn(you!.raw).map((i) => i.rel)).size) you!.querySelector('.ch-imgs')!.insertAdjacentHTML('beforeend', imgChip(`data:${u.content.mimeType};base64,${u.content.data}`, 'image'));
    }
    else if (kind === 'tool_call' || kind === 'tool_call_update') {
      roots.see(u);
      lanes.runUpdate(u, at);
      lanes.subUpdate(u, at) || toolRow(u);
    }
    else if (kind === 'plan') plan(u.entries);
    else if (kind === 'artifacts') {
      artifactsList = Array.isArray(u.artifacts) ? u.artifacts : [];
      renderArtifacts();
    }
    else if (kind === 'compaction_update' || kind === 'compaction_summary_chunk') ring.compact(u, at);
    else if (kind === 'notice') ring.notice(u);
    else if (kind === 'usage_update') {
      ring.setUsage(u);
      limitUpdate(u._meta?.['_claude/rateLimit'], at);
      ring.render();
    } else if (kind === 'available_commands_update') {
      commands = u.availableCommands || [];
      composer.render();
    }
    else if (kind === 'current_mode_update' && modes) {
      modes.currentModeId = u.currentModeId;
      composer.render();
    } else if (kind === 'config_option_update') {
      setConfigs(u.configOptions);
      composer.render();
    } else if (kind === 'session_info_update' && u.title && !named) {
      named = true;
      if (!own) titled(u.title);
    }
  }

  const kTok = (n: number) => (n >= 1000 ? Math.round(n / 1000) + 'K' : String(n));
  function shrunkLine(ev: Extract<ChatEvent, { type: 'shrink' }>) {
    const from = esc(ev.from || 'the old model'), to = esc(ev.to);
    if (ev.state === 'failed') return `Couldn't summarize the chat on ${from}${ev.text ? ' (' + esc(ev.text) + ')' : ''}, so ${to} got the whole chat.`;
    if (ev.state === 'stopped') return `Stopped summarizing, so ${to} got the whole chat.`;
    const size = ev.before == null ? '' : ev.after != null ? `: ${kTok(ev.before)} → ${kTok(ev.after)} tokens` : `: it was ${kTok(ev.before)} tokens`;
    const saved = ev.file ? `. The <span class="ch-lk lk lk-note" data-chopen="${esc(ev.file)}" title="${esc(`${ev.file}
The whole chat from before it was summarized. Click to open it.`)}" data-tip-mono>full chat is saved</span>.` : '.';
    return `Summarized the chat on ${from}, now on ${to}${size}${saved}`;
  }
  const updateCard = () => line('ch-update ch-ai', `<b>Update Claude Code to continue</b><p>The Claude Code on this PC is too old for Amethyst.</p><ol><li>Open a terminal. A terminal tab here works.</li><li>Run this command and wait for it to finish:<div class="md-code"><div class="md-codebar"><span>terminal</span><button type="button" data-copy>copy</button></div><pre>claude update</pre></div></li><li>Come back here and start a new chat.</li></ol>`);

  let hush = 0;
  function waitFor(ev: ChatEvent) {
    clearTimeout(hush);
    hush = 0;
    if (ev.type !== 'you' || tab.type !== 'antigravity' || Date.now() - (ev.at || 0) > 5000) return;
    hush = window.setTimeout(() => {
      hush = 0;
      line('ch-note', `No answer yet from ${esc(name)} · the chat keeps waiting`);
    }, QUIET);
  }
  function onEvent(ev: ChatEvent) {
    if (ev.type === 'you' || ev.type === 'turn' || ev.type === 'end' || ev.type === 'update') waitFor(ev);
    if (ev.type === 'turn' || (ev.type === 'update' && /^tool_call/.test(ev.update?.sessionUpdate) && /completed|failed/.test(ev.update.status || ''))) editStrip?.soon();
    if (ev.type === 'status') {
      if (ev.state === 'ready' && typeof ev.program === 'string' && agentOf(tab) !== ev.program) {
        tab.type = chatTabOf(ev.program);
        paintAgent();
      }
      state(ev.state === 'ready' ? 'ready' : ev.update ? 'update needed' : ev.text, ev.state === 'error' ? 'err' : '');
      if (ev.state === 'error' && ev.signIn) return void signIn.show(ev.text);
      if (ev.state === 'error') {
        if (ev.update) updateCard();
        else line('ch-note err', esc(ev.text));
        settle(ev.text);
      }
      if (ev.state === 'ready') {
        closeSteps();
        modes = ev.modes ?? null;
        setConfigs(ev.configOptions);
        [...el.querySelectorAll('[data-ch="history"]'), ...bar.querySelectorAll('[data-ch="history"]')].forEach((h) => ((h as HTMLElement).hidden = !ev.canList));
        const si = bar.querySelector<HTMLElement>('[data-ch="signin"]');
        if (si) {
          si.title = signTip(ev.auth?.line || '');
          si.lastElementChild!.textContent = 'signed-in';
          el.querySelector('.ch-menu [data-ch="signin"]')!.lastChild!.textContent = 'signed-in';
        }
        composer.render();
        setBusy(busy);
        const want = last;
        last = null;
        if (want)
          setting = useLast(want).finally(() => {
            setting = null;
            markReady();
          });
        else markReady();
      }
    } else if (ev.type === 'you') {
      clearArtifactsFeedback();
      unqueue([ev.qid]);
      const you = youBox(ev.text || '', ev.images || [], ev.ctx || null, ev.handoff || null, ev.at || 0);
      you.qid = ev.qid;
      if (ev.from) you.insertAdjacentHTML('afterbegin', fromTag(ev.from));
      turnAt = ev.at ?? 0;
      setBusy(true);
      state('working…');
      if (!wtc.spoke()) wtc.setSpoke(true);
    } else if (ev.type === 'own') {
      turnAt = ev.at ?? 0;
      setBusy(true);
      state(ev.line || 'working on its own…');
    } else if (ev.type === 'switch') {
      closeSteps();
      line('ch-switch', `<span>continued with ${esc(agentName(ev.to))} · ${esc(agentName(ev.from))}'s session is kept</span>`);
      everywhere('.ch-you [data-edit]').forEach((b) => b.remove());
    } else if (ev.type === 'shrinkMode') {
      if (shrinkOn !== ev.on) {
        shrinkOn = ev.on;
        composer.render();
      }
    } else if (ev.type === 'shrink') {
      if (ev.state === 'start') {
        setBusy(true);
        state('summarizing the chat…');
      } else {
        setBusy(false);
        state('ready');
        line(ev.state === 'failed' ? 'ch-note err ch-shrunk' : 'ch-note ch-shrunk', shrunkLine(ev));
      }
    } else if (ev.type === 'wtstep') {
      state(stepWord(ev.step, agentOf(tab)));
    } else if (ev.type === 'worktree') {
      wtc.event(ev.wt);
      if (busy && ev.wt) state('working…');
    } else if (ev.type === 'renamed') {
      own = ev.mine;
      titled(ev.title || null);
    } else if (ev.type === 'queued') {
      const row = document.createElement('div');
      row.className = 'ch-q';
      row.innerHTML = `<span class="k">queued</span><span class="tt"></span><button type="button" data-now="${esc(ev.qid)}" title="Send now\nGives this message to Claude right away, while it keeps working. It does not stop what Claude is doing." data-tip-icon="send" aria-label="send it now">send now</button><button type="button" data-unq="${esc(ev.qid)}" title="Take it out of the queue\nRemoves this message from the queue, so it is not sent." aria-label="take it out of the queue">✕</button>`;
      row.querySelector('.tt')!.textContent = (ev.text || '').replace(IMG_MD, (_: string, a: string, b: string) => (a || b).split('/').pop()!) || (ev.images?.length ? `${ev.images.length} image${ev.images.length > 1 ? 's' : ''}` : '');
      $('.ch-queue').append(row);
      queued.set(ev.qid, { text: ev.text || '', images: (ev.images || []).map((i: { path: string }) => i.path).filter(Boolean), row });
      $('.ch-queue').hidden = false;
    } else if (ev.type === 'unqueued') {
      const back = unqueue(ev.qids || []);
      if (ev.back && Date.now() - (ev.at || 0) < 5000 && back.length) composer.put([...back, input.value.trim()].filter(Boolean).join('\n\n'));
    } else if (ev.type === 'unsent') {
      [...el.querySelectorAll<Line>('.ch-you')].findLast((b) => b.qid === ev.qid)?.remove();
      const t = [notInText(ev.images || [], ev.text).map((i: { path: string }) => imgLink(i.path)).join(' '), ev.text || ''].filter(Boolean).join(' ');
      if (t && Date.now() - (ev.at || 0) < 5000) composer.put([t, input.value.trim()].filter(Boolean).join('\n\n'));
    } else if (ev.type === 'update') onUpdate(ev.update || {}, ev.at);
    else if (ev.type === 'ask') cards.ask(ev);
    else if (ev.type === 'answered') {
      cards.answered(ev);
      if (!asks.size) state(busy ? 'working…' : ended ? 'ended' : 'ready');
      working?.show?.();
    } else if (ev.type === 'turn') {
      ring.turnEnded();
      closeSteps();
      setBusy(false);
      lanes.lanesRun();
      wtc.turnEnded(ev.at);
      seen.due();
      if (ev.stopReason === 'cancelled') line('ch-note', 'stopped');
      else if (ev.stopReason === 'interrupted') line('ch-note', 'stopped when Amethyst closed · send a message to go on');
      else if (ev.stopReason === 'refusal') line('ch-note warn', `${name} declined to go on with this.`);
      else if (ev.stopReason === 'error' && ev.signIn) signIn.show(ev.text);
      else if (ev.stopReason === 'error') line('ch-note err', esc(ev.text || 'something went wrong'));
      else if (ev.stopReason !== 'end_turn') line('ch-note', esc(ev.stopReason.replace(/_/g, ' ')));
      else line('ch-done', turnAt ? `${icon('model')}Worked for ${runTime(Math.round(((ev.at ?? 0) - turnAt) / 1000))}` : 'Finished');
    } else if (ev.type === 'end') {
      closeSteps();
      ended = true;
      setBusy(false);
      subs.stopAll(ev.at);
      runs.stopAll(ev.at);
      stopRuns(tools.values());
      subs.all.forEach(lanes.lane);
      lanes.lanesRun();
      state('ended');
      settle('the chat ended');
      line('ch-note', `This chat has ended (${esc(ev.why || 'closed')}). <button class="outline" data-ch="new">new chat</button>`);
      unfollow?.();
    }
  }

  const mount = { restart, put: (d: string) => composer.put(d), id: () => tab.chat, from: (id: string | null) => (fromChat = id), used: () => !!everywhere('.ch-you').length || !!composer.value() };
  let mountedAt: string | null = null;
  let feed = { queued: () => 0, frame: () => false }, drawn = { type: '', at: 0 }, hearing = () => true;
  function follow(id: string, tries = 0, since = Date.now()) {
    unfollow?.();
    mounts.set((mountedAt = id), mount);
    let queue: ChatEvent[] = [], raf = 0, heard = false, wd = 0;
    hearing = () => heard;
    feed = { queued: () => queue.length, frame: () => raf !== 0 };
    const drop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      queue = [];
    };
    const draw = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      const evs = queue;
      queue = [];
      el.draws!.frames++;
      let replay = false;
      span('chat.draw', () => {
        batch = true;
        try {
          for (const ev of evs) {
            if (ev.type === 'history') replay = true;
            for (const one of ev.type === 'history' ? ev.events : [ev]) {
              drawn = { type: one.type, at: performance.now() };
              try {
                onEvent(one);
              } catch (e) {
                showErr(e);
              }
            }
          }
        } finally {
          batch = false;
        }
        if (replay) recent.settle();
        paintShown();
      });
      if (!document.hidden) recent.trim();
      else trimT ||= setTimeout(() => ((trimT = 0), recent.trim()), 200);
    };
    const on = (ev: ChatEvent) => {
      el.draws!.events++;
      if (!heard) {
        heard = true;
        clearTimeout(wd);
        unheardLine(false);
        drop();
        if (flow.childElementCount) reset(true);
      }
      queue.push(ev);
      if (document.hidden) draw();
      else raf ||= requestAnimationFrame(draw);
    };
    const wait = (ms = HEAR_MS) => {
      clearTimeout(wd);
      wd = window.setTimeout(() => {
        if (heard || mountedAt !== id) return;
        if (tries + 1 >= HEAR_TRIES || Date.now() - since >= HEAR_SHOW) unheardLine(true);
        follow(id, tries + 1, since);
      }, Math.min(ms * 2 ** tries, HEAR_MAX));
    };
    const stop = stream({ chat: id }, on, {
      again: () => (drop(), (heard = false), wait()),
      failed: () => ((heard = false), wait(HEAR_FAILED)),
    });
    wait();
    unfollow = () => (drop(), clearTimeout(wd), stop());
  }
  let unheard: HTMLElement | null = null;
  function unheardLine(on: boolean) {
    if (!on) return void (unheard?.remove(), (unheard = null));
    unheard ||= Object.assign(document.createElement('div'), { className: 'ch-note err ch-unheard' });
    unheard.innerHTML = `Not loaded yet · retrying <button type="button" class="outline" data-ch="refollow" title="ask Amethyst's server for this chat again">try now</button>`;
    flow.append(unheard);
  }
  onShut(() => unfollow?.());
  onShut(() => mounts.get(mountedAt) === mount && mounts.delete(mountedAt));

  const redrawn = new Set<string>();
  let missT = 0;
  function waitingAsk() {
    const a = tab.chat ? agents.all.get(tab.chat) : null;
    if (!a?.ask || a.status !== 'asks' || ended || !el.isConnected) return null;
    const row = asks.get(a.ask.id);
    return row && flow.contains(row) && !row.hidden ? null : a.ask.id;
  }
  function missLine(id: string) {
    const row = asks.get(id), kids = [...flow.children] as HTMLElement[];
    const rowAt = row ? `${row.isConnected ? 'in ' + (row.parentElement?.className || '?') : 'detached'}${row.hidden ? ', hidden' : ''}` : 'none';
    const workAt = !working ? 'none' : working.isConnected ? `${kids.indexOf(working)} of ${kids.length}` : 'detached';
    const last = kids.slice(-4).map((e) => (e.className.split(' ')[0] || e.tagName.toLowerCase()) + (e.hidden ? '[hidden]' : '')).join(' ');
    return `chat ${tab.chat}: ask ${id} waits but is not in the chat; following ${!!unfollow}, pooled ${pool.get(tab.chat) === view}, last drawn ${drawn.type || 'nothing'}${drawn.at ? ` ${Math.round(performance.now() - drawn.at)} ms ago` : ''}, queued ${feed.queued()}, frame pending ${feed.frame()}, page hidden ${document.hidden}, its row ${rowAt}, asks ${asks.size}, last rows ${last}, working row ${workAt}, log ${Math.round(log.scrollTop)}/${log.scrollHeight}/${log.clientHeight}, pinned ${st.pinned()}, jump ${jump.hidden ? 'hidden' : 'shown'}`;
  }
  function checkAsk() {
    if (missT || !waitingAsk()) return;
    missT = window.setTimeout(() => {
      missT = 0;
      const id = waitingAsk();
      if (!id) return;
      el.missed = missLine(id);
      report(el.missed);
      if (redrawn.has(`${tab.chat} ${id}`)) return;
      redrawn.add(`${tab.chat} ${id}`);
      reset(true);
      follow(tab.chat!);
    }, 1500);
  }
  onShut(onAgents(checkAsk));
  onShut(() => clearTimeout(missT));

  function reset(following = false) {
    if (starter) composer.flush();
    if (!following) {
      unfollow?.();
      unfollow = null;
    }
    stopWorking();
    fits.disconnect();
    recent.reset();
    due.clear();
    fresh.clear();
    flow.innerHTML = '';
    st.reset();
    tools.clear();
    roots.reset();
    runs = cmdRuns();
    asks.clear();
    steps = null;
    plan([]);
    artifactsList = [];
    artifactsOpen = true;
    renderArtifacts();
    modes = null;
    configs = [];
    commands = [];
    shrinkOn = false;
    ring.reset();
    composer.reset();
    ring.render();
    ended = false;
    busy = false;
    cancelAnimationFrame(text?.raf!);
    text = thought = you = null;
    lastAi = null;
    unqueue([...queued.keys()]);
    pin(true);
    wtc.reset();
  }
  const notInText = (images: any[], t: string | undefined) => images.filter((i) => !imgsIn(t || '').some((l) => l.rel === (i.path ?? i)));
  function unqueue(qids: string[]) {
    const texts: string[] = [];
    for (const q of qids) {
      const m = queued.get(q);
      if (!m) continue;
      m.row.remove();
      queued.delete(q);
      const t = [notInText(m.images, m.text).map(imgLink).join(' '), m.text].filter(Boolean).join(' ');
      if (t) texts.push(t);
    }
    $('.ch-queue').hidden = !queued.size;
    return texts;
  }

  const signIn = createSignIn({ el, tab: () => tab, name: () => name, line, state, ended: () => ended, end: () => ((ended = true), setBusy(false)), close: () => close(), reset: () => reset(), restart: () => restart() });

  let held: HTMLElement | null = null, heldT = 0;
  function unhold() {
    clearTimeout(heldT);
    if (!held) return;
    held.remove();
    held = null;
    flow.hidden = false;
    toEnd();
  }
  function hold(box: Line) {
    unhold();
    const keep = [...flow.children].slice(0, [...flow.children].indexOf(box));
    if (!keep.length) return;
    const top = log.scrollTop;
    held = document.createElement('div');
    held.className = 'ch-flow ch-held';
    held.append(...keep);
    flow.before(held);
    flow.hidden = true;
    log.scrollTop = top;
    heldT = window.setTimeout(unhold, 8000);
  }
  onShut(() => clearTimeout(heldT));
  const markReady = () => {
    ready = true;
    unhold();
    settle();
  };
  let starts = 0, starting: Promise<unknown> | null = null, dead = false, posted = false;
  const begin = (resume: string | null = null, initial = false) => (starting = start(++starts, resume, initial));
  async function start(n: number, resume: string | null, initial = false): Promise<unknown> {
    const gone = () => dead || n !== starts;
    const after = () => (dead ? undefined : starting);
    reset();
    ready = false;
    posted = false;
    if (seed) {
      ({ modes, configs } = seed);
      seed = null;
      composer.render();
    }
    const agent = agentOf(tab);
    const from = fromChat;
    fromChat = null;
    wtc.setSpoke(!!resume);
    const id = Math.random().toString(36).slice(2, 12);
    tab.chat = id;
    el.dataset.chat = id;
    started({ id, kind: 'chat', program: agent, pid: pid(), title: tab.title || '' }, null, initial);
    keepDraft();
    if (tab.zoom) store.set('chatsize', { ...store.get('chatsize', {}), [id]: tab.zoom });
    last = resume ? null : store.get('switches', {})[lastKey()] || null;
    if (!initial) saved();
    setBusy(false);
    state(resume ? 'opening the chat…' : `starting ${name}…`, '');
    try {
      const r = await api('POST', '/api/agent', { id, agent, resume, ...(from ? { from } : {}), ...(!resume && store.get('chat:shrink', false) ? { shrink: true } : {}) }, pid());
      if (gone()) {
        forgetAgent(id);
        quietly(api('DELETE', '/api/agent?id=' + encodeURIComponent(r.id), {}));
        return after();
      }
      posted = true;
      if (r.id !== id) {
        forgetAgent(id);
        tab.chat = r.id;
        el.dataset.chat = r.id;
        started({ id: r.id, kind: 'chat', program: agent, pid: pid(), title: tab.title || '' });
        keepDraft();
        if (tab.zoom) store.set('chatsize', { ...store.get('chatsize', {}), [r.id]: tab.zoom });
        saved();
      }
      follow(r.id);
    } catch (e) {
      forgetAgent(id);
      if (tab.chat === id) {
        tab.chat = null;
        delete el.dataset.chat;
        saved();
      }
      if (gone()) return after();
      const msg = (e as Error).message || '';
      if (/no such endpoint/i.test(msg)) {
        ended = true;
        setBusy(false);
        state('not here', 'warn');
        return line('ch-note', esc('The Amethyst server on this PC is older than this page. Close Amethyst and start it again.'));
      }
      if (/sign in/i.test(msg)) {
        let list: any = null;
        try {
          list = await api('GET', '/api/agents');
        } catch (err) {
          showErr(err);
        }
        if (gone()) return after();
        if (list) return signIn.screen(signIn.infoOf(list), msg);
      }
      ended = true;
      setBusy(false);
      state('could not start', 'err');
      line('ch-note err', esc(msg));
    }
  }

  async function sendText(t: string, images: unknown[], go = false) {
    keepDraft();
    if (starter) await fire(t, images, go);
    else {
      backToEnd();
      await composer.flush();
      if (setting) await setting;
      await post(t, images);
      if (tab.chat) clearNote(tab.chat);
    }
    quote.clear();
  }
  async function post(t: string, images: unknown[]) {
    if (starting) await starting;
    if (ended || !tab.chat) return;
    const worktree = wtc.wants();
    const r = await api('POST', '/api/agent/send', { id: tab.chat, prompt: t, images, points: !!pref('rewind:files'), ...(worktree ? { worktree } : {}) });
    wtc.setSpoke(true);
    if (!hearing() && tab.chat) follow(tab.chat);
    if (r.images?.length) filesChanged();
  }
  function fire(t: string, images: unknown[], go: boolean) {
    if (ended) throw new Error(`${name} can't start here: see the box`);
    composer.flush();
    const { firing } = starter!;
    starter = null;
    composer.placeholder();
    composer.render();
    const done = agentReady().then(() => post(t, images));
    firing({ go, text: t, done });
    return done;
  }

  const rewind = createRewind({ tab: () => tab, name: () => name, busy: () => busy, restart: (r: string | null) => restart(r), rewound: (r: string | null, box: Line) => rewound(r, box), put: (t: string) => composer.put(t), focus: () => input.focus(), from: (id: string | null) => (fromChat = id) });
  const stopTurn = () => tab.chat && api('POST', '/api/agent/send', { id: tab.chat, cancel: true }).catch(showErr);
  const close = () => {
    const id = tab.chat, wasPosted = posted;
    posted = false;
    if (id && wasPosted) api('DELETE', '/api/agent?id=' + encodeURIComponent(id), {}).catch(showErr);
    else if (id) forgetAgent(id);
    mounts.delete(id);
    tab.chat = null;
    delete el.dataset.chat;
    saved();
  };
  async function restart(resume: string | null = null) {
    quote.clear();
    close();
    named = own = false;
    titled(null);
    await begin(resume);
  }
  async function rewound(resume: string | null, box: Line) {
    if (!resume) return restart(resume);
    hold(box);
    quote.clear();
    close();
    try {
      await begin(resume);
    } finally {
      if (ended) unhold();
    }
  }

  async function newChat() {
    const d = { session: agents.all.get(tab.chat as string)?.session, draft: composer.value() } as { session: any; draft: string; to?: any };
    const keep = !!tab.chat && !!(d.session || d.draft);
    await restart();
    d.to = tab.chat;
    if (keep && d.to) record('chatnew', 'started a new chat', d);
  }
  async function clearAsk(from: HTMLElement) {
    if (!tab.chat || !posted || !(agents.all.get(tab.chat)?.session || composer.value())) return tell(from, { title: 'This chat is already empty', ms: 2500 });
    if (pref('clear:ask')) {
      const u = keyName(bound('undo'));
      const r = await ask({ title: 'Clear this chat?', text: `It starts over, empty.${u ? ` ${u} brings it back.` : ''}`, tick: "don't ask again" });
      if (!r) return;
      if (r.tick) setPref('clear:ask', false);
    }
    return newChat();
  }

  const menu = {
    open: false,
    show(on: boolean) {
      menu.open = on;
      $('.ch-menu').hidden = !on;
      if (on) lift($('.ch-menu'), () => { const m = bar.querySelector<HTMLElement>('.ch-more'); return m?.offsetWidth ? m : bar; }, { side: 'down', align: 'end', gap: 4, keep: () => el, away: () => menu.show(false) });
      else land($('.ch-menu'));
      bar.querySelector('.ch-more')!.setAttribute('aria-expanded', String(on));
      document[on ? 'addEventListener' : 'removeEventListener']('pointerdown', menu.away, true);
      if (on) $('.ch-menu button:not([hidden])')?.focus();
    },
    away(e: Event) {
      if (!$('.ch-menu').contains(e.target as Node) && !bar.querySelector('.ch-more')!.contains(e.target as Node)) menu.show(false);
    },
  };
  onShut(() => menu.show(false));
  let swapHover = 0;
  for (const x of [el, bar]) x.addEventListener('pointerover', (e) => (e.target as Element).closest?.('[data-ch="swap"]') && agentsSoon());
  $('.ch-menu').addEventListener('pointerover', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.ch-menu > button');
    clearTimeout(swapHover);
    if (row?.dataset.ch === 'swap') swapHover = window.setTimeout(() => swapMenu(row, true), 200);
  });

  const AGENT_IDS = ['claude', 'codex', 'antigravity', 'cursor', 'copilot', 'grok'];
  let swapping = false;
  function paintAgent() {
    name = NAME(tab);
    $('.ch-name span').textContent = name;
    el.querySelectorAll<HTMLElement>('[data-ch="signin"]').forEach((b) => (b.hidden = tab.type === 'codex'));
    const si = bar.querySelector<HTMLElement>('[data-ch="signin"]');
    if (si) si.title = signinTip(name);
    el.querySelector('.cm-content')?.setAttribute('aria-label', `message to ${name}`);
    composer.agentIs(agentOf(tab));
    el.classList.toggle('no-swap', partOff('switch'));
    el.classList.toggle('no-time', partOff('time'));
    const more = bar.querySelector<HTMLElement>('.ch-more');
    if (more && !more.dataset.base) more.title = partOff('switch') ? 'More\nEverything else for this chat: earlier chats, sign-in and clear.' : 'More\nEverything else for this chat: earlier chats, sign-in, clear and continue with.';
    el.querySelectorAll('.ch-menu .ch-sw').forEach((r) => r.remove());
    $('.ch-menu [data-ch="clear"]').insertAdjacentHTML('afterend', swapRow());
  }
  let swapOn: HTMLElement | null = null, swapShut = { b: null as HTMLElement | null, at: -Infinity }, swapSkip: HTMLElement | null = null;
  const swapPress = (e: PointerEvent) => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-ch="swap"]');
    swapSkip = b && swapShut.b === b && performance.now() - swapShut.at < 50 ? b : null;
  };
  el.addEventListener('pointerdown', swapPress);
  bar.addEventListener('pointerdown', (e) => !el.contains(bar) && swapPress(e));
  async function swapMenu(b: HTMLElement, beside = false) {
    if (swapSkip === b) return void (swapSkip = null);
    if (swapping || swapOn === b) return;
    const got = agentsSoon();
    let list: any = got.v;
    if (!list)
      try {
        list = await got.p;
      } catch (e) {
        return showErr(e);
      }
    const stateOf = (id: string) => {
      const a = list.agents?.find((x: { id: string }) => x.id === id);
      if (!a?.version) return { note: 'not installed', hint: a?.hint || '' };
      if (id === 'claude' && !list.auth?.method) return { note: 'not signed in', hint: 'Start a Claude Agent chat once to sign in.' };
      if (id === 'codex' && !list.codex?.signedIn) return { note: 'not signed in', hint: 'Sign in to Codex first: start a Codex Agent chat once.' };
      if (id === 'cursor' && !list.cursor?.signedIn) return { note: 'not signed in', hint: 'Sign in to Cursor first: start a Cursor Agent chat once.' };
      return { note: '', hint: '' };
    };
    const ags = AGENT_IDS.filter((a) => a !== agentOf(tab) && chatOn(a)).map((a) => {
      const s = stateOf(a);
      return `<button class="mi" data-k="${a}"${s.note ? ` aria-disabled="true" data-why="${esc(s.hint)}"` : ''} title="${esc(`Continue with ${agentName(a)}\n${s.note ? s.hint || `${agentName(a)} is not installed.` : `${agentName(a)} carries this chat on: it gets the chat so far with your next message.`}`)}">${icon('agent')}continue with ${agentName(a)}<span class="d">${esc(s.note)}</span></button>`;
    }).join('');
    const ih = canShrink() ? `<div class="sep"></div><button class="mi chk${shrinkOn ? ' on' : ''}" data-k="shrink" role="menuitemcheckbox" aria-checked="${shrinkOn}" title="Improved Handoff\nBefore changing model or continuing with another agent, summarizes a long chat on the current one so the next starts light.">${icon('shrink')}Improved Handoff</button>` : '';
    const rows = (ags ? ags + ih + '<div class="sep"></div>' : ih ? ih + '<div class="sep"></div>' : '') + `<button class="mi" data-k="copy">${icon('copy')}copy the chat as a handoff</button>`;
    const r = b.getBoundingClientRect();
    if (beside && (!b.isConnected || $('.ch-menu').hidden)) return;
    const moreBtn = bar.querySelector<HTMLElement>('.ch-more'), at = () => (!beside ? b : moreBtn?.offsetWidth ? moreBtn : el.parentElement?.closest('.dk-cell, .qawin, .oc-main')?.querySelector<HTMLElement>('.dk-ch') || el);
    popMenu(beside ? r.right + 2 : r.left, beside ? r.top - 4 : r.bottom + 4, rows, (m) => {
      if (m.dataset.k === 'shrink') {
        setShrink(!shrinkOn);
        m.setAttribute('aria-checked', String(shrinkOn));
        return;
      }
      if (beside) menu.show(false);
      if (m.dataset.k === 'copy') return copyHandoff(at());
      if (m.getAttribute('aria-disabled')) return tell(at(), { title: `Can't continue with ${agentName(m.dataset.k)}`, line: m.dataset.why || '', ms: 4000 });
      return swapTo(m.dataset.k!, at());
    });
    const pop = document.getElementById('colormenu'), box = $('.ch-menu').getBoundingClientRect();
    if (beside && pop && box.right + 2 + pop.offsetWidth > innerWidth - 8) pop.style.left = Math.max(8, box.left - pop.offsetWidth - 2) + 'px';
    if (!pop || beside) return;
    swapOn = b;
    pop.addEventListener('menuclose', () => ((swapShut = { b, at: performance.now() }), (swapOn = null)), { once: true });
    holdFocus(() => pop.querySelector<HTMLElement>('button.mi'));
  }
  async function swapTo(to: string, at: HTMLElement) {
    if (swapping || partOff('switch')) return;
    const refuse = (line: string) => tell(at, { title: `Can't continue with ${agentName(to)} yet`, line, ms: 3500 });
    if (!tab.chat || ended || starter) return refuse('This chat has not started.');
    if (busy || queued.size || asks.size) return refuse('Wait for this turn to end, or stop it, then continue with another agent.');
    let shrink: boolean | undefined;
    if (!shrinkOn && pref('chat:handoffAsk') && canShrink()) {
      const elig = await quietly(api('GET', `/api/agent/shrink/can?id=${encodeURIComponent(tab.chat)}`), null);
      if (elig?.can) {
        const picked = await ask({
          title: `Continue with ${agentName(to)}`,
          text: 'This chat is long. Use Improved Handoff to summarize it on the current agent first so the next starts light?',
          choices: [{ label: 'Instant handoff', value: 'instant' }, { label: 'Improved Handoff', value: 'improved', main: true }],
          tick: "Don't ask again",
        });
        if (!picked) return;
        if (picked.tick) setPref('chat:handoffAsk', false);
        shrink = picked.value === 'improved';
      }
    }
    swapping = true;
    const was = tab.type;
    tab.type = chatTabOf(to);
    paintAgent();
    modes = null;
    configs = [];
    last = null;
    composer.render();
    showModel();
    const done = api('POST', '/api/agent/switch', { id: tab.chat, to, ...(shrink !== undefined ? { shrink } : {}) });
    setting = done.then(() => {}, () => {}).finally(() => (setting = null));
    try {
      const r = await done;
      if (r?.shrink === 'failed') tell(at, { title: "Couldn't summarize the chat", line: r.shrinkWhy || 'Switched using the chat log instead.', ms: 5000 });
      saved();
    } catch (e) {
      tab.type = was;
      paintAgent();
      tell(at, { title: `Can't continue with ${agentName(to)}`, line: (e as Error).message, ms: 4500 });
    } finally {
      swapping = false;
    }
  }
  async function copyHandoff(at: HTMLElement) {
    try {
      const r = await api('GET', `/api/agent/handoff?id=${encodeURIComponent(tab.chat as string)}&to=${AGENT_IDS.find((a) => a !== agentOf(tab))}&all=1`);
      await copy(r.text, at);
      setSave('the chat copied as a handoff');
    } catch (e) {
      showErr(e);
    }
  }
  const hands = new WeakMap<HTMLElement, HandReply>();
  const handChip = (card: Element | null) => card?.previousElementSibling?.querySelector<HTMLElement>('.ch-hand') || null;
  function markHand(chip: HTMLElement, open: boolean) {
    const h = JSON.parse(chip.dataset.hand!);
    chip.classList.toggle('on', open);
    chip.setAttribute('aria-expanded', String(open));
    chip.title = handTip(h.to, open);
  }
  function foldHand(card: HTMLElement, focus = true) {
    const chip = handChip(card), msg = card.previousElementSibling;
    const fold = () => {
      card.remove();
      if (!chip) return;
      markHand(chip, false);
      if (focus) chip.focus({ preventScroll: true });
    };
    if (msg) handStill(msg, fold);
    else fold();
  }
  async function toggleHand(chip: HTMLElement) {
    const msg = chip.closest<HTMLElement>('.ch-you');
    if (!msg) return;
    const had = msg.nextElementSibling as HTMLElement | null;
    if (had?.classList.contains('hof')) return foldHand(had);
    if (chip.dataset.busy) return;
    const h: Hand & { at: number } = JSON.parse(chip.dataset.hand!);
    chip.dataset.busy = '1';
    let r: HandReply;
    try {
      r = await api('GET', `/api/agent/handoff?id=${encodeURIComponent(tab.chat as string)}&to=${h.to}&from=${h.from}&since=${h.since}&before=${h.at}`);
    } catch (e) {
      return showErr(e);
    } finally {
      delete chip.dataset.busy;
    }
    if (!msg.isConnected || (msg.nextElementSibling as HTMLElement | null)?.classList.contains('hof')) return;
    const card = document.createElement('div');
    card.className = 'hof';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', `what ${agentName(h.to)} was given`);
    hands.set(card, r);
    card.innerHTML = handCard(r, where(pid()));
    handStill(msg, () => msg.after(card));
    markHand(chip, true);
  }
  function handStill(at: Element, fn: () => void) {
    const y = at.getBoundingClientRect().top;
    fn();
    st.pin(false);
    st.settle();
    log.scrollTop += at.getBoundingClientRect().top - y;
  }
  function handView(card: HTMLElement, raw: boolean) {
    const r = hands.get(card);
    if (!r) return;
    handStill(card, () => {
      card.innerHTML = handCard(r, where(pid()), raw);
      card.querySelector<HTMLElement>(`[data-hand-view="${raw ? 'raw' : 'read'}"]`)?.focus({ preventScroll: true });
    });
  }

  const hist = pastChatsPopup({ el, tab: () => tab, pid, input, blank: () => !flow.querySelector('.ch-msg') && !composer.value().trim(), openBeside: (s: Earlier) => openBeside(s), restart: (r: string | null) => restart(r), retitle: (t: string) => ((named = true), titled(t)) });
  onShut(hist.shut);

  const composer = createComposer($('.ch-input'), {
    agent: agentOf(tab),
    input,
    switches,
    commands: () => [{ name: 'clear', description: 'End this chat and start a new one', run: true }, ...commands.filter((c) => c.name !== 'clear')],
    files: () => [...S.thoughts.keys(), ...[...S.dirs.keys()].filter(Boolean).map((p) => p + '/')],
    sent: () => (everywhere('.ch-you') as Line[]).map((b) => b.raw).filter(Boolean).reverse(),
    dragLink,
    dragLinks,
    windowLink,
    isLink,
    live: () => !!starter || (!ended && !!tab.chat),
    busy: () => busy,
    sendTip: () => (starter ? 'Send\nStarts a new chat with this message, right here in this tab.' : ''),
    onSend: sendText,
    onDraft: () => keepDraft(),
    imgHere: (rel: string) => fetch(imgSrc(rel, pid())).then((r) => r.ok),
    imgKeep: ({ name, mimeType, data }: { name: string; mimeType: string; data: string }) => api('POST', '/api/image', { name, mimeType, data }, pid()).then((r) => r.path),
    onSwitch: setSwitch,
    shrink: () => (canShrink() ? shrinkOn : null),
    onShrink: setShrink,
    onStop: stopTurn,
    onOpen: (path: string) => openFile(path),
    self: () => tab.chat || null,
    onCommand: (name: string) => {
      if (name === 'clear') { newChat(); return true; }
    },
  });
  paintAgent();
  editStrip = editsStrip(() => tab.chat, { review: () => tab.chat && page.review?.(tab.chat), openFile: (abs, rel) => openReviewed(abs, rel), beside: () => besideHere() });
  $('.ch-input').insertBefore(editStrip.el, $('.ch-box'));
  onShut(editStrip.stop);
  const revBtn = bar.querySelector<HTMLElement>('.ch-rev')!;
  const paintRev = () => {
    const l = tab.chat ? editsOf(tab.chat) : null;
    revBtn.hidden = !pref('edits:head') || !(l && (l.changed || l.files.length));
  };
  onShut(onEdits((c) => c === tab.chat && paintRev()));
  onShut(onPref('edits:head', paintRev));
  onShut(onPref('edits:strip', () => editStrip!.draw()));
  onShut(onNote((c) => {
    if (c !== tab.chat) return;
    const n = noteOf(c);
    composer.note(n?.text ?? null, n?.from);
  }));
  function besideHere() {
    return !POP && (mode() === 'orch' || (edShown() && !!el.closest('.grp[data-g]')));
  }
  async function openReviewed(abs: string, rel: string) {
    const chat = tab.chat;
    if (!chat) return;
    if (!besideHere()) return page.review?.(chat, rel);
    let line = 1;
    try {
      const f = await editFile(chat, rel);
      line = firstChange(f.base, f.now);
    } catch {}
    page.openReviewFile?.(chat, abs, line, editStrip!.el);
  }
  editStrip.load();
  const mine = { tab, el, composer, keepDraft: () => keepDraft(), clear: () => clearAsk(el) };
  boxes.add(mine);
  onShut(() => boxes.delete(mine));
  for (const k of ['pointerdown', 'focusin'])
    el.addEventListener(k, () => {
      lastUsed = tab;
      lastNew = null;
    });
  const keepDraft = () => putDraft(tab.chat || tab.id, composer.value(), tab.id);
  const draft = tab.draft || draftOf(tab.chat) || draftOf(tab.id);
  if (draft) composer.put(draft);
  if (tab.draft) keepDraft();
  delete tab.draft;
  input.addEventListener('input', keepDraft);
  const quote = quoting({ log, flow, input, composer });
  onShut(quote.shut);
  for (const key of new Set([tab.chat, tab.id])) {
    const list = key && store.get('chatImages', {})[key];
    if (!list) continue;
    Promise.all(list.map((a: { id: string }) => bigStore.get('img:' + a.id)))
      .then((blobs) => composer.addImages(blobs.filter(Boolean)))
      .then(() => {
        store.set('chatImages', { ...store.get('chatImages', {}), [key]: undefined });
        for (const a of list as { id: string }[]) bigStore.del('img:' + a.id);
      })
      .catch(showErr);
  }

  const { find, shut: findShut, inChat } = chatFind({ at: $('.ch-find-at'), el, input, flow, log, recent, st, size });
  finding = inChat;
  onShut(findShut);

  const boxToggle = () => {
    if (!input.contains(document.activeElement)) return composer.focus();
    if (!cards.toQuestion()) tell(el, { title: 'No question waits in this chat', ms: 1500 });
  };
  toggles.set(el, boxToggle);
  el.addEventListener('keydown', (e) => {
    if (is(e, 'find')) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) find();
      return;
    }
    if (is(e, 'boxKey')) {
      e.preventDefault();
      e.stopPropagation();
      return boxToggle();
    }
    if (is(e, 'windowKey') && (e.target as HTMLElement).closest('.ch-ask') && !el.closest('.deck, .oc')) {
      e.preventDefault();
      e.stopPropagation();
      return composer.focus();
    }
    if (cards.key(e)) return;
    signIn.enter(e);
  });
  const onClick = (e: MouseEvent) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-art],[data-ch],[data-hand],[data-hand-view],[data-hand-copy],[data-hand-x],[data-opt],[data-pick],[data-send-answer],[data-chopen],[data-recheck],[data-si-use],[data-si-login],[data-si-save],[data-si-start],[data-si-back],[data-si-out],[data-copy],[data-copy-msg],[data-copy-io],[data-copy-img],[data-copy-path],[data-unq],[data-now],[data-img],.ch-img,[data-diff],[data-edit],.ch-io.long,.sa > .row,.sa > .sa-now,[data-sv-back],[data-cmd-pop],.ch-io:has(> pre.term.run)');
    if (!b) return;
    if (b.dataset.art === 'toggle') {
      artifactsOpen = !artifactsOpen;
      return renderArtifacts();
    }
    if (b.dataset.art === 'proceed') {
      clearArtifactsFeedback();
      return void sendText('Proceed', []).catch(showErr);
    }
    if (b.dataset.cmdPop != null) {
      e.preventDefault();
      return page.activity?.(tab.chat, null, b.dataset.cmdPop);
    }
    if (b.matches('.ch-io:not(.long)')) return getSelection()!.isCollapsed && runTell(b);
    if (b.matches('.ch-io')) return toggleFold(b);
    if (b.matches('.sa > *')) return lanes.clickRow(b, e);
    const d = b.dataset;
    if (d.svBack != null) return lanes.hideSub();
    if (d.recheck != null) {
      const box = b.closest<Line>('.ch-ai')!;
      return void recheck(b, box, rootsOf(box)).then((ok) => (ok ? openRef(b.dataset.chopen!, e) : tell(b, { title: 'This file is not on the disk', line: b.dataset.full!, ms: 2500 })));
    }
    if (d.ch === 'subs') return page.activity?.(tab.chat);
    if (d.ch === 'review') return tab.chat && page.review?.(tab.chat);
    if (d.ch === 'new') return newChat();
    if (d.ch === 'refollow') return void (tab.chat && follow(tab.chat));
    if (d.ch === 'wt') return void wtc.click(b).catch(showErr);
    if (d.ch === 'jump') {
      st.back();
      return input.focus();
    }
    if (d.copy != null) return copy(b.closest('.md-code')!.querySelector('pre')!.textContent, b);
    if (d.copyMsg != null) return copy(b.closest<Line>('.ch-msg')!.raw || '', b);
    if (d.copyIo != null) return copy(b.closest('.ch-io')!.querySelector('pre')!.textContent, b);
    if (d.copyImg != null) return copy(imgLink(d.copyImg), b, rawOf(d.copyImg));
    if (d.copyPath != null) return copy(linkPath(b.closest<HTMLElement>('.ch-path')!), b);
    if (d.edit != null) return rewind(b.closest<Line>('.ch-you')!, b);
    if (d.fromChat) {
      const a = agents.all.get(d.fromChat);
      return a ? void page.showAgent(a).catch(showErr) : refuse(b, { title: 'That chat has ended' });
    }
    if (d.unq != null) return api('POST', '/api/agent/send', { id: tab.chat, unqueue: d.unq }).catch(showErr);
    if (d.now != null) return api('POST', '/api/agent/send', { id: tab.chat, now: d.now }).catch(showErr);
    if (b.classList.contains('ch-img')) {
      if (b.dataset.img && (e.ctrlKey || e.metaKey) && e.shiftKey) return void showPath(fullPath(b.dataset.img, where(pid())));
      return viewImage(b.querySelector<HTMLImageElement>('.pv')!.src, b.dataset.img && imgLink(b.dataset.img));
    }
    if (d.diff != null) {
      e.preventDefault();
      const c = b.closest<Line>('.ch-tool, .ch-ask')?.diffs?.[+d.diff];
      if (c) openDiff?.({ path: c.path, rel: inProject(c.path, where(pid())), oldText: c.oldText || '', newText: c.newText || '' });
      return;
    }
    if (d.ch === 'more') return menu.show(!menu.open);
    if (d.ch === 'swap' && b.closest('.ch-menu')) return swapMenu(b, true);
    const inMenu = b.closest('.ch-menu');
    if (inMenu) menu.show(false);
    const moreBtn = bar.querySelector<HTMLElement>('.ch-more')!, at = !inMenu ? b : moreBtn.offsetWidth ? moreBtn : el.parentElement?.closest('.dk-cell, .qawin, .oc-main')?.querySelector<HTMLElement>('.dk-ch') || moreBtn;
    if (d.ch === 'swap') return swapMenu(at);
    if (d.ch === 'swapto') return swapTo(d.to!, at);
    if (d.ch === 'swapcopy') return copyHandoff(at);
    if (d.hand != null) return toggleHand(b);
    if (d.handView) return handView(b.closest<HTMLElement>('.hof')!, d.handView === 'raw');
    if (d.handCopy != null) return copy(hands.get(b.closest<HTMLElement>('.hof')!)?.text || '', b);
    if (d.handX != null) return foldHand(b.closest<HTMLElement>('.hof')!);
    if (d.ch === 'clear') return clearAsk(at);
    if (d.ch === 'history') return hist.toggle(at);
    if (d.ch === 'signin') return signIn.show();
    if (d.siBack != null) return void b.closest('.si-win')!.remove();
    if (signIn.click(d, b)) return;
    if (cards.click(d, b)) return;
    if (d.chopen) {
      e.preventDefault();
      openRef(d.chopen, e);
    }
  };
  refs.listen();
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', (e) => {
    const card = e.key === 'Escape' && (e.target as Element).closest?.<HTMLElement>('.hof');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
    foldHand(card);
  });
  bar.addEventListener('click', (e) => {
    if (!el.contains(bar)) onClick(e);
  });

  setBusy(false);
  if (starter) {
    composer.placeholder(starter.placeholder);
    composer.render();
  }
  if (tab.chat) {
    posted = true;
    wtc.showCwd();
    follow(tab.chat);
  } else {
    begin(tab.resume || null, true);
    delete tab.resume;
  }

  const escKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return false;
    if (lanes.seeing()) return lanes.hideSub(), true;
    if (!busy) return false;
    stopTurn();
    return true;
  };
  const view = {
    el,
    focus: () => composer.focus(),
    land(wait = 0) {
      if (cards.toQuestion()) return;
      composer.focus();
      const t0 = performance.now(), box = document.activeElement;
      const tick = () => document.activeElement === box && !cards.toQuestion() && performance.now() - t0 < wait && requestAnimationFrame(tick);
      if (wait) requestAnimationFrame(tick);
    },
    draft: () => input.value,
    clear: () => newChat(),
    said: () => ({ modes, configs }),
    key: (e: KeyboardEvent) => composer.takeKey(e) || escKey(e),
    find,
    attach: (rel: string) => (pid() === S.pid ? composer.link(rel) : null),
    take: (e: Event) => composer.take(e),
    showSub: (id: string) => lanes.want(id),
    bar,
    home: () => head.append(bar),
    detach() {
      head.append(bar);
      composer.detach();
      const id = tab.chat;
      redraft(id, mine);
      if (!id || starter || pool.has(id) || !agents.all.has(id)) {
        dead = true;
        return shutAll();
      }
      el.remove();
      view.adopt(loose(id, agents.all.get(id)), LOOSE);
      pool.set(id, view);
    },
    adopt(t: Tab, o: ChatOpts) {
      tab = mine.tab = t;
      redraft(t.chat, null);
      ({ saved, filesChanged, openFile, titled, openDiff = null, openBeside } = o);
      openDiff ||= diffAnywhere;
      editStrip?.load();
      named ||= !!t.title;
      el.classList.toggle('no-diff', !openDiff);
      zoomed();
      requestAnimationFrame(checkAsk);
    },
    shut() {
      if (pool.get(tab.chat) === view) pool.delete(tab.chat);
      shutAll();
    },
    stop() {
      dead = true;
      head.append(bar);
      composer.stop();
      input.value = '';
      keepDraft();
      if (lastUsed === tab) lastUsed = null;
      shutAll();
      close();
    },
  };
  return view;
}

window.addEventListener('keydown', (e) => {
  if (!is(e, 'clearKey')) return;
  const f = document.activeElement as HTMLElement | null;
  if (f?.closest?.('.xterm') || document.querySelector('#modal:not([hidden]), #palette:not([hidden]), #fpick:not([hidden])')) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  const id = chatHere(), live = [...boxes].filter((b) => shownEl(b.el));
  const b = (f && f !== document.body && live.find((x) => x.el.contains(f))) || (id && live.find((x) => x.tab.chat === id));
  if (b) return b.clear();
  const over = (f && f !== document.body ? f.closest<HTMLElement>('.oc, .dk-cell, .grp, section') : null) || document.body;
  tell(over, { title: 'No chat here to clear', line: `Press ${keyName(bound('clearKey')) || 'the clear key'} in a chat`, ms: 2500 });
}, true);
