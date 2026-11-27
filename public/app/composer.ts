import { bound, is, modelSlot, show } from '../base/binds.ts';
import { quoteIn, quoteOut, quoteToken } from '../base/chattext.ts';
import { agentMark, agentsOn } from '../base/controls.ts';
import { IMG_TYPES, MAX_IMAGES, notPicture, readB64 } from '../base/chips.ts';
import { icon } from '../base/icon.ts';
import { dirIcon, fileIcon, fileTint } from '../base/filelook.ts';
import { isLifted, land, lift, onOutside } from '../base/lift.ts';
import { attach } from '../base/fmt.ts';
import { span } from '../base/hitch.ts';
import { fileLinks, imgLink, imgsIn } from '../base/links.ts';
import { refuse, tell } from '../base/notify.ts';
import { onPref, pref } from '../base/prefs.ts';
import { esc, setSave, showErr, store } from '../base/util.ts';
import { onSize } from '../base/measure.ts';
import { micClick, micHtml } from './voice.ts';
import type { FmtBox } from '../base/fmt.ts';
import { litOnHover } from '../base/roving.ts';
import { chatsHere, looksLikeCode } from '../base/drive.ts';

export type Opt = { value: string; name: string; description?: string };
export type Picker = { key: string; name: string; category?: string; description?: string; value: any; options: Opt[]; at?: number; kind?: string };
type Pick = { text: string; label?: string; title?: string };
type Chip = { key: string; path?: string; label?: string; title?: string; text?: string };
type Caret = { from: number; to: number; text: string };
type SugItem = { insert: string; label: string; desc: string; run?: string | false; mark?: string; other?: boolean; icon?: string; path?: string; color?: string };
type ComposerInput = HTMLElement & {
  value: string;
  placeholder: string;
  disabled: boolean;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly selectionDirection: string;
  setSelectionRange(a: number, b: number, dir?: string): void;
  setRangeText(t: string, a: number, b: number): void;
  posAt(x: number, y: number): number | null;
  takes: ((e: DragEvent) => boolean) | null;
  fmt: FmtBox;
};
type ComposerOpts = {
  agent: string;
  input: ComposerInput;
  switches: () => Picker[];
  commands: () => { name: string; description?: string; run?: boolean }[];
  files: () => string[];
  sent: () => (string | undefined)[];
  dragLink: () => string | null;
  dragLinks?: () => (string | null)[];
  windowLink: (e: DragEvent) => { rel: string | null; rels: string[] } | null;
  isLink: (rel: string) => unknown;
  live: () => boolean;
  busy: () => boolean;
  sendTip?: () => string;
  onSend: (t: string, images: { path: string }[], go: boolean) => Promise<unknown>;
  onDraft?: () => void;
  imgHere: (rel: string) => Promise<boolean>;
  imgKeep: (img: { name: string; mimeType: string; data: string }) => Promise<string>;
  onSwitch: (key: string, value: any) => Promise<unknown>;
  shrink?: () => boolean | null;
  onShrink?: (on: boolean) => unknown;
  onStop: () => unknown;
  onCommand?: (name: string) => boolean | undefined;
  onOpen: (path: string) => unknown;
  self?: () => string | null;
};

const KEY_DEFAULTS = {
  claude: [{ model: 'opus', effort: 'medium' }, { model: 'opus', effort: 'high' }, { model: 'sonnet', effort: 'medium' }, { model: 'haiku', effort: '' }, { model: '', effort: '' }],
  codex: [{ model: 'luna', effort: 'medium' }, { model: 'luna', effort: 'high' }, { model: 'terra', effort: 'medium' }, { model: 'terra', effort: 'high' }, { model: '', effort: '' }],
  antigravity: [{ model: 'pro', effort: 'high' }, { model: 'pro', effort: 'low' }, { model: 'flash', effort: 'high' }, { model: 'flash', effort: 'low' }, { model: '', effort: '' }],
  cursor: [{ model: 'auto', effort: '' }, { model: 'sonnet', effort: '' }, { model: 'opus', effort: '' }, { model: 'gpt', effort: '' }, { model: '', effort: '' }],
  copilot: [{ model: 'auto', effort: '' }, { model: 'sonnet', effort: 'medium' }, { model: 'opus', effort: 'high' }, { model: 'gpt', effort: 'high' }, { model: '', effort: '' }],
  grok: [{ model: 'grok-4.6', effort: 'high' }, { model: 'grok-4.6', effort: 'xhigh' }, { model: 'grok-4.6', effort: 'medium' }, { model: 'grok-4.5', effort: 'high' }, { model: '', effort: '' }],
};
const INLINE_ABOUT = ['mode', 'model', 'thought_level'];
const firstLine = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim(), m = /^.{20,200}?[.!?](?=\s|$)/.exec(t);
  return m ? m[0] : t.length > 200 ? t.slice(0, 199) + '…' : t;
};
const perAgent = (name: string, agent: string) => (agent === 'claude' ? name : `${name}.${agent}`);
export const modelKeys = (agent = 'claude'): { model: string; effort: string }[] => {
  const mine = store.get(perAgent('modelKeys', agent), []);
  return KEY_DEFAULTS[agent as keyof typeof KEY_DEFAULTS].map((d, i) => ({ ...d, ...mine[i] }));
};
export function setModelKey(agent: string, i: number, part: string, value: string) {
  const keys = modelKeys(agent);
  (keys[i] as Record<string, string>)[part] = value;
  store.set(perAgent('modelKeys', agent), keys);
}
export const seenModels = (agent = 'claude'): { model: Opt[]; effort: Opt[] } => store.get(perAgent('models', agent), { model: [], effort: [] });
export function keepModels(agent: string, switches: Picker[]) {
  const seen = seenModels(agent);
  const opts = (cat: string) => switches.find((p) => p.category === cat)?.options.map(({ value, name }) => ({ value, name })) || [];
  const model = opts('model'), effort = opts('thought_level').filter((o) => o.value !== 'default');
  if (model.length) seen.model = model;
  seen.effort = [...effort, ...seen.effort.filter((x) => !effort.some((o) => o.value === x.value))];
  store.set(perAgent('models', agent), seen);
}
export const HINT_LONG = 'Message, @ to add a file, / for commands', HINT_SHORT = 'Message…';
const HINT_FROM = 360;
const chipCss = document.head.appendChild(document.createElement('style'));
const hideChips = () => (chipCss.textContent = (pref('chrow:chips') as string[]).map((k) => `.ch-opts [data-pick="${CSS.escape(k)}"]:not(.hr-keep)`).join(',') + (pref('chrow:chips').length ? ' { display: none !important; }' : ''));
hideChips();
onPref('chrow:chips', hideChips);
onPref('chat:hint', () => document.querySelectorAll<HTMLElement & { fitHint?: () => void }>('.ch-input').forEach((f) => f.fitHint?.()));
onPref('effort:look', () => document.querySelectorAll<HTMLElement & { drawOpts?: () => void }>('.ch-input').forEach((f) => f.drawOpts?.()));
onPref('chat:shrinkRow', () => document.querySelectorAll<HTMLElement & { drawOpts?: () => void }>('.ch-input').forEach((f) => f.drawOpts?.()));
const LV_SLOTS: Record<string, number> = { claude: 5, codex: 6, antigravity: 5, cursor: 5, copilot: 5, grok: 5 }, LV_WORDS = ['Default', 'Low', 'Medium', 'High', 'Xhigh', 'Max', 'none'];
const CR_W = 8, CR_H = 14, CR_LOW = 7;
const crystal = (i: number, n: number) => {
  if (pref('effort:look') !== 'crystals') {
    const h = +(6 + (CR_H - 6) * i / Math.max(1, n - 1)).toFixed(2);
    return `<svg class="cr-bar" width="7" height="${CR_H}" viewBox="0 0 7 ${CR_H}" aria-hidden="true"><rect y="${CR_H - h}" width="7" height="${h}" rx="1"/></svg>`;
  }
  const top = +(CR_H - (CR_LOW + (CR_H - CR_LOW) * i / Math.max(1, n - 1))).toFixed(2), eave = top + CR_W / 2;
  return `<svg width="${CR_W}" height="${CR_H}" viewBox="0 0 ${CR_W} ${CR_H}" aria-hidden="true"><path d="M0 ${CR_H}V${eave}L${CR_W / 2} ${top}L${CR_W} ${eave}V${CR_H}z"/><path class="cr-shine" d="M0 ${CR_H}V${eave}L${CR_W / 2} ${top}V${CR_H}z"/></svg>`;
};
const crystals = (gems: string[], slots: number) => `<span class="ch-cr">${Array.from({ length: slots }, (_, i) => gems[i] || '<i class="gone"></i>').join('')}</span>`;
const lvWord = (word: string, options: Opt[] = []) => `<b class="ch-val"><span>${esc(word)}</span>${[...LV_WORDS, ...options.map(short)].map((w) => `<span aria-hidden="true">${esc(w)}</span>`).join('')}</b>`;
export const optFor = (options: Opt[], want: string) => want && (options.find((o) => o.value === want) || options.find((o) => `${o.value} ${o.name}`.toLowerCase().includes(want.toLowerCase())));

const TONE: Record<string, string> = { acceptEdits: 'accent', 'accept-edits': 'accent', plan: 'ok', sandbox: 'ok', auto: 'accent', bypassPermissions: 'danger', 'skip-permissions': 'danger', force: 'danger', autopilot: 'danger', 'allow-all': 'danger', 'always-approve': 'danger' };
const DELIBERATE = new Set(['bypassPermissions', 'skip-permissions', 'sandbox', 'force', 'autopilot', 'allow-all', 'always-approve']);
const SHORT: Record<string, string> = { acceptEdits: 'Edit auto', bypassPermissions: 'Bypass', 'skip-permissions': 'Skip permissions', sandbox: 'Sandbox', 'allow-all': 'Allow all', 'always-approve': 'Always approve', claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' };
const MODE_TEXT: Record<string, Partial<Opt>> = {
  default: { description: 'Asks before every change' },
  acceptEdits: { name: 'Edit automatically', description: 'Edits freely, asks before commands' },
  plan: { description: 'Reads and plans, changes nothing' },
  auto: { description: 'Edits and runs; a check stops risks' },
  bypassPermissions: { description: 'Edits and runs anything, no checks' },
};
const modeHint = () => (bound('modeKey') ? `${show(bound('modeKey'))} steps it, shift ${show(bound('modeKey'))} back` : 'pick a key for it in settings');
const MODE_SAY: Record<string, string> = {
  'claude:default': 'The agent asks you before every change it makes.',
  'claude:acceptEdits': 'The agent edits files without asking, and asks before it runs a command.',
  'claude:plan': 'The agent reads and plans, and changes nothing.',
  'claude:auto': 'The agent edits files and runs commands, and a check stops anything risky.',
  'claude:bypassPermissions': 'The agent edits files and runs anything, with no checks.',
  'antigravity:default': 'The agent asks you before it edits a file or runs a command.',
  'antigravity:sandbox': 'Terminal commands run inside a restricted sandbox.',
  'grok:default': 'The agent asks you before editing files or running non-read-only commands.',
  'grok:auto': 'A classifier approves safe tool calls and asks you before risky ones.',
  'grok:always-approve': "Grok's --always-approve (--yolo): approves every tool call without asking. Your deny rules and hooks still apply. Use it only where a mistake can be undone.",
};
const LV_SAY: Record<string, string> = { low: 'the quickest answers, with the least thinking', medium: 'a balance of speed and thinking', high: 'more thinking, for harder problems', max: 'the most thinking this model can do, and the slowest answers' };
const upFirst = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
const sentence = (x: string | undefined) => (x ? upFirst(x.trim()).replace(/([^.!?])$/, '$1.') : '');
const lvTip = (o: Opt) => `${o.name}\nSets the effort to ${o.name}${LV_SAY[o.value] ? ': ' + LV_SAY[o.value] : ''}.`;
const modelAdvice = (agent: string) => {
  const a = show(bound(`model.${agent}.1`)), b = show(bound(`model.${agent}.5`));
  return a && b ? `${upFirst(a)} to ${b} switch to the models you set for this agent in Settings.` : '';
};
const agentName = (agent: string) => SHORT[agent] || 'the agent';
const short = (o: Opt) => SHORT[o.value] || String(o.name).replace(/\s*\(([^)]*)\)/g, (_, x) => (/context/i.test(x) ? ' ' + x.replace(/\s*context\s*/i, '') : ''));

function chipTip(p: Picker, cur: Opt | undefined, agent: string): { text: string; keys: string; set?: string } {
  const name = cur?.name || p.value || '…';
  if (p.category === 'model') {
    const advice = modelAdvice(agent);
    return { text: `Model: ${name}\nThe model this chat answers with. Click to pick another, or scroll over it to step through the list.${advice ? '\n\n' + advice : ''}`, keys: '=arrowup:previous model;=arrowdown:next model', set: 'keys/models' };
  }
  if (p.kind === 'level') return { text: `${p.name}: ${name}\nHow much the model thinks before it answers. Click a mark to set it, or scroll over it to step.\n\nMore effort takes longer and uses more of your limit.`, keys: '=arrowup:less effort;=arrowdown:more effort' };
  if (p.category === 'mode') {
    const say = MODE_SAY[`${agent}:${p.value}`] || sentence(cur?.description);
    return { text: `Mode: ${name}\n${say ? say + ' ' : ''}Click to pick another mode.`, keys: `modeKey:next mode${bound('modeKey') ? `;=shift+${bound('modeKey')}:previous mode` : ''}` };
  }
  const say = sentence(cur?.description);
  return { text: `${p.name}: ${name}\n${say ? say + ' ' : ''}Click to pick another, or scroll over it to step through the list.`, keys: '=arrowup:previous;=arrowdown:next' };
}
export function shapePicker(p: Picker, agent: string) {
  if (p.category === 'mode' && agent === 'claude') p.options = p.options.map((o) => ({ ...o, ...MODE_TEXT[o.value] }));
  p.at = p.options.findIndex((o) => o.value === p.value);
  p.kind = p.category === 'thought_level' ? 'level' : p.options.length === 2 && p.options.every((o) => o.value === 'on' || o.value === 'off') ? 'toggle' : 'list';
  return p;
}
export function chipHtml(p: Picker, agent: string, open?: string) {
  const slots = LV_SLOTS[agent];
  const cur = p.options[p.at!], name = esc(cur?.name || p.value || '…'), key = esc(p.key);
  const val = `<b class="ch-val"><span>${esc(cur ? short(cur) : p.value || '…')}</span>${p.options.map((o) => `<span aria-hidden="true">${esc(short(o))}</span>`).join('')}</b>`;
  if (p.kind === 'toggle') {
    const on = p.value === 'on';
    return `<button type="button" class="ch-chip ch-tg ${on ? 'on' : ''}" data-pick="${key}" data-name="${esc(p.name)}" data-key="${key}" aria-pressed="${on}" aria-label="${esc(p.name)}" title="${esc(`${p.name}: ${on ? 'on' : 'off'}\n${sentence(p.description) ? sentence(p.description) + ' ' : ''}Click to turn it ${on ? 'off' : 'on'}.`)}">${icon(p.key)}</button>`;
  }
  const t = chipTip(p, cur, agent);
  const attrs = `type="button" data-pick="${key}" data-name="${esc(p.name)}" aria-haspopup="listbox" aria-expanded="${open === p.key}" title="${esc(t.text)}" data-tip-keys="${esc(t.keys)}"${t.set ? ` data-tip-set="${t.set}"` : ''}`;
  if (p.kind === 'level') {
    const levels = p.options.filter((o) => o.value !== 'default');
    const lit = levels.findIndex((o) => o.value === p.value);
    const gems = levels.slice(0, slots).map((o, i) => `<i data-lv="${esc(o.value)}" class="${i <= lit ? 'on' : ''}${i === lit ? ' at' : ''}" title="${esc(lvTip(o))}">${crystal(i, slots)}</i>`);
    return `<button class="ch-chip ch-lv" ${attrs} aria-label="${esc(p.name)}: ${name}">${crystals(gems, slots)}${lvWord(cur ? short(cur) : p.value || '…', p.options)}</button>`;
  }
  const tone = p.category === 'mode' && TONE[p.value];
  const ic = icon(p.category === 'mode' ? p.value : p.category === 'model' ? 'model' : p.key);
  const minor = p.category !== 'mode' && p.category !== 'model';
  return `<button class="ch-chip${minor ? ' ch-minor' : ''}${p.category === 'model' ? ' ch-pill' : ''}" ${attrs} ${tone ? `data-tone="${tone}"` : ''}>${ic}${val}</button>`;
}
export function shrinkHtml(on: boolean) {
  const tip = `Improved Handoff: ${on ? 'on' : 'off'}
Before changing model or continuing with another agent, summarizes a long chat on the current one so the next starts light. Click to turn it ${on ? 'off' : 'on'}.

A short chat, or one quiet for over an hour, skips the summary.`;
  return `<button type="button" class="ch-chip ch-tg${on ? ' on' : ''}" data-ch="shrink" aria-pressed="${on}" aria-label="Improved Handoff" title="${esc(tip)}">${icon('shrink')}</button>`;
}

export const WT_OFF_TIP = "Worktree off\nThis chat works in the project's own folder instead, with your uncommitted changes.";
export const wtStripOn = (label: string, note = '') => `${icon('branch')}<span class="wts-k">Worktree on:</span><span class="wts-t">new branch from</span><button type="button" class="wts-pk" data-wt="from" aria-haspopup="menu"><span>${esc(label)}</span>${icon('chev')}</button><span class="grow"></span><span class="wts-n">${esc(note)}</span><button type="button" class="wts-x" data-wt="off" title="${esc(WT_OFF_TIP)}" aria-label="worktree off">${icon('close')}</button>`;
export const wtStripLive = (branch: string, base: string, note = '') => `${icon('branch')}<span class="wts-k">Worktree</span><span class="wts-v wts-b">${esc(branch)}</span><span class="wts-t">from</span><span class="wts-v">${esc(base)}</span><span class="grow"></span><span class="wts-n">${esc(note)}</span>`;
export const composerHtml = ({ chat = false }: { chat?: boolean } = {}) => `<form class="ch-input">
      ${chat ? `<button type="button" class="ch-jump" data-ch="jump" hidden>${icon('down')}<span>new</span></button>
      <div class="ch-queue" hidden></div><div class="ch-wtstrip" hidden></div>` : ''}
      <div class="ch-box">
      <div class="ch-sug" hidden></div><div class="ch-pop" role="listbox" hidden></div>
      <div class="ch-refs" hidden></div>
      <div class="ch-ta"></div>
      <input type="file" class="ch-file-in" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden>
      <div class="ch-row"><button type="button" class="ch-chip ch-attach" data-ch="attach" title="Add an image\nPicks an image from your disk and puts it in your message where the cursor is.\n\nYou can also paste an image, or drop one onto the box." aria-label="add an image">${icon('image')}</button><span class="ch-opts"></span>
        <span class="grow"></span>${chat ? '<span class="ch-usage" data-tip-icon="ring" hidden></span>' : ''}${chat ? `<button type="button" class="ch-chip ch-wt" data-ch="wt" aria-label="worktree">${icon('branch')}</button>` : ''}<span class="ch-mode"></span>${micHtml()}
        <button type="button" class="ch-send ch-stop" data-ch="stop" title="Stop\nStops the agent right away. Everything it did so far stays in the chat.\n\nThen tell it what to do differently, and it carries on from there." data-tip-keys="=escape:stop" aria-label="stop" hidden>${icon('stop')}</button>
        <button class="ch-send" data-ch="send" title="Send" data-tip-keys="=enter:send;=shift+enter:new line" aria-label="send" disabled>${icon('send')}</button></div>
    </div></form>`;

export function createComposer(form: HTMLElement, { agent: first, switches, commands, files, sent, dragLink, dragLinks, windowLink, isLink, live, busy, sendTip, onSend, onDraft, imgHere, imgKeep, onSwitch, shrink, onShrink, onStop, onCommand, onOpen, input, self }: ComposerOpts) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => form.querySelector<T>(s);
  const sug = $('.ch-sug')!, popEl = $('.ch-pop')!;
  let agent = first, slots = LV_SLOTS[agent];
  form.dataset.agent = agent;
  let wantFocus = false;
  let rc = -1;
  const pending = new Map<string, any>(), timers = new Map<string, number>();
  let pop: { key: string; options: Opt[] } | null = null;
  let heard = 0;
  let refs: string[] = [];
  let picks: Pick[] = [];
  let refsOpen = false;
  let reading = 0, read: Promise<unknown> = Promise.resolve();

  const hasDraft = () => !!(input.value.trim() || refs.length || picks.length || reading);
  const refText = () => picks.map((p) => p.text + '\n\n').join('') + refs.map((r) => '@' + r + ' ').join('');
  const canSend = () => {
    const stop = busy() && !hasDraft(), s = $<HTMLButtonElement>('[data-ch="send"]')!;
    $('[data-ch="stop"]')!.hidden = !stop;
    s.hidden = stop;
    s.disabled = !live() || !hasDraft();
    const who = agentName(agent), queue = busy() && !sendTip?.();
    s.title = reading ? 'Reading the picture\nSend comes on once the picture you added is read.' : sendTip?.() || (queue ? `Queue\nYour message waits, and goes to ${who} when it finishes what it is doing.\n\nTo give it to ${who} right away instead, click send now on the queued message.` : `Send\nSends your message to ${who}.\n\nType @ to add a file or another chat, and / for the agent's own commands.`);
    s.dataset.tipKeys = `=enter:${queue ? 'queue' : 'send'};=shift+enter:new line`;
  };
  function update() {
    canSend();
    input.disabled = !live();
    for (const b of form.querySelectorAll('.ch-opts, .ch-mode')) b.classList.toggle('off', input.disabled);
    if (wantFocus && !input.disabled) {
      wantFocus = false;
      input.focus();
    }
  }

  function pickers() {
    const list = switches();
    for (const p of list) {
      if (pending.has(p.key)) p.value = pending.get(p.key);
      shapePicker(p, agent);
    }
    return list;
  }
  const pickerOf = (key: string) => pickers().find((p) => p.key === key);

  const chip = (p: Picker) => chipHtml(p, agent, pop?.key);
  function shrinkChip() {
    const on = shrink?.();
    return on == null || !pref('chat:shrinkRow') ? '' : shrinkHtml(on);
  }
  function renderOpts(roll: { key: string; dir: number } | null = null) {
    const box = $('.ch-opts')!, modeBox = $('.ch-mode')!;
    const act = $('.ch-row')!.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const had = act?.dataset.pick, hadShrink = act?.dataset.ch === 'shrink';
    const list = pickers();
    const rest = list.filter((p) => p.category !== 'mode');
    let html = rest.map(chip);
    const m = rest.findIndex((p) => p.category === 'model');
    if (m >= 0 && !rest.some((p) => p.kind === 'level') && seenModels(agent).effort.length) html.splice(m + 1, 0, `<span class="ch-chip ch-lv off" title="Effort: None\nThis model has no effort levels.">${crystals([], slots)}${lvWord('none')}</span>`);
    box.innerHTML = html.join('') + shrinkChip();
    modeBox.innerHTML = list.filter((p) => p.category === 'mode').map(chip).join('');
    $('.ch-box')!.toggleAttribute('data-ultra', list.some((p) => p.key === 'ultracode' && p.value === 'on'));
    const at = (key: string) => $('.ch-row')!.querySelector<HTMLElement>(`[data-pick="${CSS.escape(key)}"]`);
    if (had) at(had)?.focus();
    else if (hadShrink) box.querySelector<HTMLElement>('[data-ch="shrink"]')?.focus();
    if (roll) at(roll.key)?.querySelector('b')?.classList.add(roll.dir > 0 ? 'roll-down' : 'roll-up');
  }

  function setOpt(key: string, value: any, wait = 0, dir = 0) {
    if (!live()) return;
    pending.set(key, value);
    renderOpts(dir ? { key, dir } : null);
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => commit(key), wait));
  }
  async function commit(key: string) {
    timers.delete(key);
    const value = pending.get(key);
    if (value === undefined) return;
    try {
      if (!(await onSwitch(key, value))) return;
    } catch (e) {
      showErr(e);
      if (pending.get(key) === value) pending.delete(key);
      return renderOpts();
    }
    if (pending.get(key) === value) pending.delete(key);
    renderOpts();
  }
  function stepOpt(key: string, by: number, wrap = false) {
    const p = pickerOf(key);
    if (!p || p.kind === 'toggle') return;
    const ok = p.options.filter((o) => !DELIBERATE.has(o.value) || o.value === p.value);
    let i = ok.findIndex((o) => o.value === p.value) + by;
    if (wrap) i = (i + ok.length) % ok.length;
    else if (i < 0 || i >= ok.length) return;
    setOpt(key, ok[i].value, 400, by);
  }

  function takeKey(e: KeyboardEvent) {
    const n = modelSlot(e, agent);
    if (n) useKey(n);
    return n;
  }

  async function useKey(n: number) {
    if (!live()) return;
    const want = modelKeys(agent)[n - 1], said: string[] = [];
    for (const [cat, part] of [['model', 'model'], ['thought_level', 'effort']] as const) {
      if (!want[part]) continue;
      const p = pickers().find((x) => x.category === cat), o = p && optFor(p.options, want[part]);
      if (!o) {
        said.push(`no ${want[part]} here`);
        continue;
      }
      said.push(o.name);
      if (o.value === p!.value) continue;
      clearTimeout(timers.get(p!.key));
      pending.set(p!.key, o.value);
      renderOpts();
      const h = heard;
      await commit(p!.key);
      const told = () => heard > h && switches().some((x) => x.key === p!.key && x.value === o.value);
      for (let t = 0; t < 60 && cat === 'model' && !told(); t++) await new Promise((r) => setTimeout(r, 50));
    }
    const k = show(bound(`model.${agent}.${n}`)) || `key ${n}`;
    setSave(said.length ? `${k}: ${said.join(' · ')}` : `${k} sets nothing: pick its model in settings`);
  }

  function openPop(b: HTMLElement) {
    const key = b.dataset.pick!;
    if (pop?.key === key) return closePop();
    const p = pickerOf(key);
    if (!p) return;
    pop = { key, options: p.options };
    popEl.setAttribute('aria-label', p.name);
    popEl.innerHTML =
      `<div class="cpp-head"><b>${esc(p.name)}</b><span>${p.category === 'mode' ? esc(modeHint()) : 'or scroll the chip'}</span></div>` +
      p.options
        .map((o, i) => {
          const tone = p.category === 'mode' && TONE[o.value];
          const inline = INLINE_ABOUT.includes(p.category || '');
          const tip = !inline && o.description ? ` title="${esc(`${o.name}\n${firstLine(o.description)}`)}"` : '';
          return `<button type="button" role="option" class="cpo" data-i="${i}" aria-selected="${i === p.at}" ${tone ? `data-tone="${tone}"` : ''}${tip}>${p.category === 'mode' ? icon(o.value) : ''}<span class="cpo-t"><b>${esc(o.name)}</b>${inline && o.description ? `<span>${esc(o.description)}</span>` : ''}</span>${i === p.at ? icon('check', 'tick') : ''}</button>`;
        })
        .join('');
    popEl.hidden = false;
    const at = () => $(`.ch-row [data-pick="${CSS.escape(key)}"]`) || b;
    const spot = () => {
      const c = at(), x = $('.ch-box')!;
      if (!c.checkVisibility() || !x.checkVisibility() || !c.getClientRects().length || !x.getClientRects().length) return null;
      const r = c.getBoundingClientRect(), B = x.getBoundingClientRect();
      return new DOMRect(r.left, B.top, r.width, B.height);
    };
    lift(popEl, spot, { side: 'up', keep: () => $('.ch-box'), away: () => closePop(false) });
    b.setAttribute('aria-expanded', 'true');
    (popEl.querySelector<HTMLElement>('[aria-selected="true"]') || popEl.querySelector<HTMLElement>('.cpo'))?.focus();
    offPop();
    offPop = onOutside([popEl, $('.ch-row')], () => closePop(false));
  }
  function closePop(refocus = true) {
    if (!pop) return;
    pop = null;
    land(popEl);
    popEl.hidden = true;
    $('.ch-row [aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
    offPop();
    if (refocus) input.focus();
  }
  let offPop = () => {};

  function emptyBox() {
    input.value = '';
    rc = -1;
    hideSug();
    canSend();
  }
  async function sendText(go = false) {
    if (!hasDraft() || !live()) return;
    while (reading) await read;
    if (!hasDraft() || !live()) return;
    const text = input.value.trim(), t = quoteOut((refText() + text).trim());
    const cmd = !refs.length && !picks.length && /^\/(\w[\w-]*)$/.exec(input.value);
    if (cmd && onCommand?.(cmd[1])) return emptyBox();
    const images = [...new Set(imgsIn(input.value).map((i) => i.rel))].map((path) => ({ path }));
    if (images.length > MAX_IMAGES) return void tell($('.ch-box'), { title: `at most ${MAX_IMAGES} pictures a message`, line: 'take some out, or send them in two messages', ms: 3000 });
    const was = { value: input.value, refs, picks };
    input.value = '';
    refs = [];
    picks = [];
    rc = -1;
    renderRefs();
    hideSug();
    canSend();
    try {
      await onSend(t, images, go);
    } catch (e) {
      input.value = was.value;
      refs = was.refs;
      picks = was.picks;
      renderRefs();
      canSend();
      onDraft?.();
      showErr(e);
    }
  }

  const caret = (): Caret => ({ from: input.selectionStart, to: input.selectionEnd, text: input.value });
  function putChips(paths: string[], at: Caret | null) {
    if (!paths.length) return;
    const v = input.value, same = at?.text === v, a = same ? at.from : input.selectionStart, b = same ? at.to : input.selectionEnd;
    const pre = a && !/\s$/.test(v.slice(0, a)) ? ' ' : '';
    input.setRangeText(pre + paths.map(imgLink).join(' ') + ' ', a, b);
    if (form.isConnected) input.focus();
    canSend();
    onDraft?.();
  }
  function addImages(files: (File | null | undefined)[], at: Caret | null = caret()) {
    reading++;
    canSend();
    const p = addAll(files as File[], at).finally(() => {
      reading--;
      canSend();
    });
    read = Promise.all([read, p]).catch(() => {});
    return p;
  }
  async function addAll(files: File[], at: Caret | null) {
    const paths: string[] = [];
    for (const f of files) {
      const no = notPicture(f);
      if (no) {
        refuse(form, no);
        continue;
      }
      try {
        paths.push(await imgKeep({ name: /^image\.\w+$/i.test(f.name) ? '' : f.name, mimeType: f.type, data: await readB64(f) }));
      } catch (e) {
        showErr(e);
      }
    }
    putChips(paths, at);
  }
  const imagesIn = (list: DataTransferItemList | undefined) => [...(list || [])].filter((f) => f.kind === 'file' && f.type.startsWith('image/')).map((f) => f.getAsFile()).filter(Boolean);

  const chips = () => [...refs.map((path) => ({ key: 'ref', path, label: path.split('/').pop(), title: path })), ...picks.map((p) => ({ key: 'pick', ...p }))];
  const nameOf = (c: Chip) => (c.path ? `<button type="button" class="ch-rl" data-ropen="${esc(c.path)}" title="${esc(`${c.title}\nClick to open it.`)}" data-tip-mono>${esc(c.label)}</button>` : `<span class="ch-rl${c.key === 'pick' ? ' ch-pk' : ''}" title="${esc(c.title)}"${c.key === 'pick' ? ' data-tip-mono' : ''}>${esc(c.label)}</span>`);
  function renderRefs() {
    const box = $('.ch-refs')!, all = chips();
    box.hidden = !all.length;
    if (!all.length) refsOpen = false;
    const x = (i: number) => `<button type="button" class="ch-rx" data-rx="${i}" aria-label="remove">✕</button>`;
    const old = $('.ch-rlist');
    if (old) land(old);
    box.innerHTML = `<div class="ch-rs">${all.map((c, i) => `<span class="ch-ref">${nameOf(c)}${x(i)}</span>`).join('')}</div><button type="button" class="ch-refn" data-ch="refs" title="Files: ${all.length}\nThe files added to this message. Click for the list, where you can take one out." aria-label="the files in this message" aria-expanded="${refsOpen}">${icon('folder')}<b>${all.length}</b></button><div class="ch-rlist">${all.map((c, i) => `<span class="ch-ref">${nameOf(c)}${x(i)}</span>`).join('')}</div>`;
    fitRefs();
  }
  function fitRefs() {
    const box = $('.ch-refs')!, rs = box.firstElementChild;
    if (box.hidden || !rs) return liftRefs();
    box.classList.remove('fold');
    box.classList.toggle('fold', rs.scrollWidth > rs.clientWidth + 1);
    box.classList.toggle('open', refsOpen);
    liftRefs();
  }
  function liftRefs() {
    const box = $('.ch-refs')!, list = $('.ch-rlist');
    if (!list) return;
    if (!box.hidden && box.classList.contains('fold') && refsOpen) {
      if (!isLifted(list)) lift(list, () => $('.ch-refn'), { side: 'up', keep: () => box, away: () => showRefs(false) });
    } else land(list);
  }
  let offRefs = () => {};
  function showRefs(on: boolean) {
    refsOpen = on;
    $('.ch-refs')!.classList.toggle('open', on);
    $('.ch-refn')?.setAttribute('aria-expanded', String(on));
    liftRefs();
    offRefs();
    offRefs = on ? onOutside([$('.ch-refs')], () => showRefs(false)) : () => {};
  }
  onSize($('.ch-box')!, { name: 'chat.refs', write: fitRefs });
  function addRef(rel: string) {
    if (!refs.includes(rel)) refs.push(rel);
    renderRefs();
    canSend();
    onDraft?.();
    input.focus();
  }

  let sugItems: SugItem[] = [], sugAt = 0, sugFrom = 0, sugWord = '';
  function hideSug() {
    land(sug);
    sug.hidden = true;
    sugItems = [];
    sugWord = '';
  }
  function showSug() {
    const before = input.value.slice(0, input.selectionStart);
    const m = /(?:^|\s)([/$@])([^\s@]*)$/.exec(before), word = m && before.length + m[1] + m[2];
    if (word && word === sugWord && !sug.hidden) return lightSug(Math.min(sugAt, sugItems.length - 1));
    if ((m?.[1] === '/' || m?.[1] === '$') && /^[\w:-]*$/.test(m[2])) {
      const q = m[2].toLowerCase();
      sugItems = commands().filter((c) => c.name.toLowerCase().startsWith(q)).slice(0, 12).map((c) => ({ insert: '/' + c.name + ' ', label: '/' + c.name, desc: c.description || '', run: c.run && c.name }));
    } else if (m?.[1] === '@') {
      const q = m[2].toLowerCase();
      const used = [...new Set(sent().flatMap((t) => fileLinks(t, isLink).map((l) => l.rel).reverse()))], isUsed = new Set(used);
      const all = files(), known = new Set(all), has = (p: string) => p.toLowerCase().includes(q);
      const rest = all.filter((p) => !isUsed.has(p) && has(p)), named = (p: string) => p.replace(/\/$/, '').split('/').pop()!.toLowerCase().startsWith(q);
      const mine: string[] = [], others: string[] = [];
      for (const p of [...used.filter((p) => known.has(p) && has(p)), ...rest.filter(named), ...rest.filter((p) => !named(p))]) {
        const ags = agentsOn(p);
        (ags.length > 0 && !ags.includes(agent) ? others : mine).push(p);
        if (mine.length === 200) break;
      }
      const item = (other: boolean) => (p: string) => {
        const dir = p.endsWith('/'), bare = dir ? p.slice(0, -1) : p, k = bare.lastIndexOf('/'), name = bare.slice(k + 1);
        return { insert: '@' + p + ' ', path: p, label: name + (dir ? '/' : ''), desc: bare.slice(0, k + 1), mark: agentMark(p), other, icon: dir ? `<i class="ch-sic">${dirIcon(false)}</i>` : `<i class="ch-sic" style="${fileTint(name)}">${fileIcon()}</i>` };
      };
      const chats: SugItem[] = chatsHere(self?.() ?? null, m[2]).map((c) => ({ insert: '@' + c.code + ' ', label: c.code, desc: `${c.title || 'a chat'} · ${c.status}`, color: c.color }));
      const found: SugItem[] = [...mine.map(item(false)), ...others.slice(0, 200 - mine.length).map(item(true))];
      sugItems = looksLikeCode(m[2]) ? [...chats, ...found] : [...found.filter((f) => !f.other), ...chats, ...found.filter((f) => f.other)];
    } else return hideSug();
    sugFrom = before.length - m![2].length - 1;
    if (!sugItems.length) return hideSug();
    sugWord = word!;
    sug.innerHTML = sugItems.map((s, i) => s.color ? `<button type="button" class="ch-schat" data-sug="${i}" style="--gem-c:${esc(s.color)}"><span class="dk-code">${esc(s.label)}</span><b>${esc(s.desc)}</b></button>` : s.icon != null
      ? `<button type="button" class="ch-sf${s.other ? ' other' : ''}" data-sug="${i}" data-path="${esc(s.path!)}">${s.icon}<b>${esc(s.label)}</b>${s.desc ? `<span class="ch-sd"><bdi>${esc(s.desc)}</bdi></span>` : ''}${s.mark || ''}</button>`
      : `<button type="button" class="${s.other ? 'other' : ''}" data-sug="${i}"><b>${esc(s.label)}</b>${s.desc ? `<span>${esc(s.desc)}</span>` : ''}${s.mark || ''}</button>`).join('');
    sug.hidden = false;
    if (!isLifted(sug)) lift(sug, () => box, { side: 'up', match: true, away: hideSug });
    lightSug(Math.min(sugAt, sugItems.length - 1));
  }
  function lightSug(i: number) {
    sug.querySelector('.on')?.classList.remove('on');
    sugAt = i;
    const b = sug.children[i] as HTMLElement;
    if (!b) return;
    b.classList.add('on');
    if (b.offsetTop < sug.scrollTop) sug.scrollTop = b.offsetTop;
    else if (b.offsetTop + b.offsetHeight > sug.scrollTop + sug.clientHeight) sug.scrollTop = b.offsetTop + b.offsetHeight - sug.clientHeight;
  }
  function pickSug(i: number, run: boolean) {
    const s = sugItems[i];
    if (!s) return;
    if (run && s.run && live() && onCommand?.(s.run)) return emptyBox();
    const v = input.value, caret = input.selectionStart;
    input.value = v.slice(0, sugFrom) + s.insert + v.slice(caret);
    const at = sugFrom + s.insert.length;
    input.setSelectionRange(at, at);
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendText();
  });
  input.addEventListener('input', () => {
    sugAt = 0;
    rc = -1;
    showSug();
    canSend();
  });
  input.addEventListener('paste', (e) => {
    const files = imagesIn(e.clipboardData?.items);
    if (!files.length) return;
    const links = imgsIn(e.clipboardData!.getData('text/plain'));
    e.preventDefault();
    const at = caret();
    if (!links.length) return void addImages(files, at);
    Promise.all(links.map((l) => imgHere(l.rel).catch(() => false))).then((here) => (here.every(Boolean) ? putChips(links.map((l) => l.rel), at) : addImages(files, at)));
  }, true);
  const box = $('.ch-box')!;
  let ownHint: string | null = null, longHint: boolean | null = null;
  const fitHint = () => hintFor(box.clientWidth);
  function hintFor(w: number) {
    if (ownHint != null) return;
    const long = !!pref('chat:hint') && w > HINT_FROM;
    if (long === longHint) return;
    longHint = long;
    input.placeholder = long ? HINT_LONG : HINT_SHORT;
  }
  function placeholder(text?: string) {
    ownHint = text ?? null;
    longHint = null;
    if (ownHint != null) input.placeholder = ownHint;
    else fitHint();
  }
  (form as HTMLElement & { drawOpts?: () => void }).drawOpts = () => renderOpts();
  (form as HTMLElement & { fitHint?: () => void }).fitHint = () => ((longHint = null), fitHint());
  placeholder();
  onSize(box, { name: 'chat.hint', read: () => box.clientWidth, write: hintFor });
  input.takes = (e) => !!dragLink() || ['Files', 'application/x-pm-file', 'application/x-pm-tab'].some((t) => e.dataTransfer?.types.includes(t));
  const area = form.closest<HTMLElement>('.chat') || box;
  const here = (e: DragEvent) => box.contains(e.target as Node) || !!area.closest('.dk-cell');
  area.addEventListener('dragover', (e) => {
    if (!here(e)) return void box.classList.remove('drop');
    if (windowLink(e)) return void (e.preventDefault(), e.stopPropagation(), box.classList.add('drop'));
    if (dragLink()) return void (e.preventDefault(), box.classList.add('drop'));
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    box.classList.add('drop');
  });
  area.addEventListener('dragleave', (e) => !area.contains(e.relatedTarget as Node | null) && box.classList.remove('drop'));
  area.addEventListener('drop', (e) => {
    box.classList.remove('drop');
    if (here(e)) take(e);
  });
  function take(e: Event) {
    const far = windowLink(e as DragEvent);
    if (far) {
      e.preventDefault();
      e.stopPropagation();
      return void (far.rel && (far.rels || [far.rel]).forEach((p) => addRef(p)));
    }
    const link = dragLink();
    if (link) return void (e.preventDefault(), (dragLinks?.() || [link]).forEach((p) => addRef(p!)));
    const files = [...((e as DragEvent).dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const pathOf = window.amethyst?.pathOf, others = pathOf ? files.filter((f) => !IMG_TYPES.has(f.type)) : [];
    others.forEach((f) => pathOf!(f) && addRef(pathOf!(f).replace(/\\/g, '/')));
    const at = $('.ch-ta')!.contains(e.target as Node) ? input.posAt((e as DragEvent).clientX, (e as DragEvent).clientY) : null;
    addImages(files.filter((f) => !others.includes(f)), at == null ? caret() : { from: at, to: at, text: input.value });
  }
  $('.ch-file-in')!.addEventListener('change', (e) => {
    addImages([...(e.target as HTMLInputElement).files!]);
    (e.target as HTMLInputElement).value = '';
  });
  function recall(by: number) {
    const mine = sent();
    const at = rc + by;
    if (at < -1 || at >= mine.length) return false;
    rc = at;
    input.value = rc < 0 ? '' : quoteIn(mine[rc]!);
    input.setSelectionRange(input.value.length, input.value.length);
    canSend();
    onDraft?.();
    return true;
  }
  const recalled = () => {
    if (!input.value) return true;
    const mine = sent();
    return rc >= 0 && input.value === mine[rc];
  };
  input.addEventListener('focusout', () => setTimeout(hideSug, 150));
  attach(input.fmt, { keys: false });
  input.addEventListener('keydown', (e) => span('box.key', () => onKey(e)), true);
  function onKey(e: KeyboardEvent) {
    if (!sug.hidden && sugItems.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        return lightSug((sugAt + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length);
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        e.stopPropagation();
        return pickSug(sugAt, e.key === 'Enter');
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return hideSug();
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendText(is(e, 'fireGo'));
    } else if (e.key === 'Home' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      e.preventDefault();
      if (e.shiftKey) input.setSelectionRange(0, input.selectionDirection === 'backward' ? input.selectionEnd : input.selectionStart, 'backward');
      else input.setSelectionRange(0, 0);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && recalled()) {
      if (recall(e.key === 'ArrowUp' ? 1 : -1)) e.preventDefault();
    } else if (is(e, 'modeKey')) {
      e.preventDefault();
      const m = pickers().find((p) => p.category === 'mode');
      if (m) stepOpt(m.key, e.shiftKey ? -1 : 1, true);
    } else if (is(e, 'micKey')) {
      e.preventDefault();
      const m = $('.ch-mic');
      if (m && !m.hidden) micClick(m, input);
    } else if (is(e, 'modelNextKey')) {
      e.preventDefault();
      const m = pickers().find((p) => p.category === 'model');
      if (m) stepOpt(m.key, 1, true);
    } else if (is(e, 'modelPrevKey')) {
      e.preventDefault();
      const m = pickers().find((p) => p.category === 'model');
      if (m) stepOpt(m.key, -1, true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
    } else if (e.key === 'Escape' && busy()) {
      e.preventDefault();
      e.stopPropagation();
      onStop();
    }
  }
  sug.addEventListener('mousedown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sug]');
    if (!b) return;
    e.preventDefault();
    pickSug(+b.dataset.sug!, true);
  });
  litOnHover(sug, 'sug', () => sugAt, (i) => (sugAt = i));
  let wheelSum = 0, wheelIdle = 0;
  $('.ch-row')!.addEventListener(
    'wheel',
    (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
      if (!b || b.classList.contains('ch-tg')) return;
      e.preventDefault();
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => (wheelSum = 0), 250);
      wheelSum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(wheelSum) < 50) return;
      const by = Math.sign(wheelSum);
      wheelSum = 0;
      if (busy()) return refuse(b, { title: "Can't change it with the wheel while it answers", line: 'Click it instead' });
      stepOpt(b.dataset.pick!, by);
    },
    { passive: false },
  );
  $('.ch-row')!.addEventListener('keydown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pick]');
    const by = ({ ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 } as Record<string, number>)[e.key];
    if (!b || !by || b.classList.contains('ch-tg')) return;
    e.preventDefault();
    stepOpt(b.dataset.pick!, by);
  });
  popEl.addEventListener('keydown', (e) => {
    const items = [...popEl.querySelectorAll<HTMLElement>('.cpo')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') closePop();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  form.parentElement!.addEventListener('keydown', (e) => {
    if (!takeKey(e)) return;
    e.preventDefault();
    e.stopPropagation();
  });
  form.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ch],[data-pick],.cpo,[data-ropen],[data-rx]');
    if (!b) return;
    const d = b.dataset;
    if (d.ropen != null) return onOpen(d.ropen);
    if (d.rx != null) {
      const c = chips()[+d.rx];
      if (c?.key === 'ref') refs.splice(+d.rx, 1);
      else if (c?.key === 'pick') picks.splice(+d.rx - refs.length, 1);
      renderRefs();
      canSend();
      onDraft?.();
      return input.focus();
    }
    if (d.ch === 'refs') return showRefs(!refsOpen);
    if (d.ch === 'stop') return onStop();
    if (d.ch === 'attach') return $('.ch-file-in')!.click();
    if (d.ch === 'mic') return micClick(b, input);
    if (d.ch === 'shrink') {
      b.focus();
      onShrink?.(b.getAttribute('aria-pressed') !== 'true');
      return renderOpts();
    }
    if (d.pick) {
      const p = pickerOf(d.pick), lv = (e.target as HTMLElement).closest<HTMLElement>('[data-lv]');
      if (!p) return;
      if (p.kind === 'toggle') return setOpt(p.key, p.value === 'on' ? 'off' : 'on');
      if (lv) return setOpt(p.key, lv.dataset.lv);
      return openPop(b);
    }
    if (d.i != null && pop && popEl.contains(b)) {
      setOpt(pop.key, pop.options[+d.i].value);
      return closePop();
    }
  });

  return {
    update,
    placeholder,
    focus() {
      wantFocus = true;
      update();
    },
    takeKey,
    take,
    render() {
      heard++;
      renderOpts();
    },
    agentIs(next: string) {
      if (next === agent) return;
      agent = next;
      slots = LV_SLOTS[agent];
      form.dataset.agent = agent;
      heard++;
      renderOpts();
    },
    link(rel: string) {
      if (refs.includes(rel) || ` ${input.value} `.includes(` @${rel} `)) return null;
      addRef(rel);
      return () => {
        refs = refs.filter((r) => r !== rel);
        renderRefs();
        canSend();
        onDraft?.();
      };
    },
    value: () => refText() + input.value,
    addImages,
    addPick(p: Pick) {
      picks.push(p);
      renderRefs();
      canSend();
      onDraft?.();
    },
    note(t: string | null, from?: string) {
      const re = /❝«↺ rejected[^»]*»[^❞]*❞ ?/, v = input.value, tok = t ? quoteToken(t, from) + ' ' : '';
      input.value = re.test(v) ? v.replace(re, tok) : tok + v;
      canSend();
      onDraft?.();
    },
    addQuote(t: string, from?: string) {
      const a = input.selectionStart, b = input.selectionEnd, v = input.value, pre = a && !/\s$/.test(v.slice(0, a)) ? ' ' : '';
      input.setRangeText(pre + quoteToken(t, from) + ' ', a, b);
      if (!from) input.focus();
      canSend();
      onDraft?.();
    },
    put(t: string) {
      input.value = quoteIn(t);
      canSend();
      onDraft?.();
    },
    append(t: string) {
      const v = input.value.trimEnd();
      input.value = v ? `${v}\n\n${quoteIn(t)}` : quoteIn(t);
      canSend();
      onDraft?.();
    },
    flush() {
      return Promise.all([...pending.keys()].map((key) => {
        clearTimeout(timers.get(key));
        return commit(key);
      }));
    },
    reset() {
      timers.forEach(clearTimeout);
      timers.clear();
      pending.clear();
      refs = [];
      picks = [];
      renderRefs();
      closePop(false);
      renderOpts();
    },
    detach() {
      closePop(false);
      showRefs(false);
    },
    stop() {
      closePop(false);
      showRefs(false);
      timers.forEach(clearTimeout);
    },
  };
}
