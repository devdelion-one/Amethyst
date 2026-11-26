import { icon } from '../base/icon.ts';
import { api } from '../base/model.ts';
import { esc, showErr } from '../base/util.ts';
import { answersOf, askCard, fieldsOf, inputHtml, readyOf } from '../base/asks.ts';
import type { Field } from '../base/asks.ts';
import { tell } from '../base/notify.ts';
import { bound, show } from '../base/binds.ts';
import { heldKey, onScreen, watchKeys } from '../base/settle.ts';
import type { ChatEvent } from '../base/types.ts';
import { diffBtn } from './steps.ts';
import type { Line, Part, Step } from './steps.ts';

type AskEvent = Extract<ChatEvent, { type: 'ask' }>;
type FormEvent = Extract<AskEvent, { form: object }>;
type CardsCtx = {
  line: (cls: string, html: string) => Line;
  state: (s: string, cls?: string) => void;
  tools: Map<string, Step>;
  asks: Map<string, Line>;
  chat: () => string | null | undefined;
  backToEnd: () => void;
  input: { value: string; contains(n: Node | null): boolean };
};

export function createCards({ line, state, tools, asks, chat, backToEnd, input }: CardsCtx) {
  function ask(ev: AskEvent) {
    if (ev.form) return askForm(ev);
    const tc = ev.toolCall || {}, t = tools.get(tc.toolCallId), { q, what, why, input: args } = askCard(ev, t?.data);
    const opts = ev.options.map((o: { kind: string; optionId: string; name: string }, i: number) => `<button type="button" class="${o.kind === 'allow_once' ? 'p' : ''}" data-opt="${esc(o.optionId)}"><span class="n">${i + 1}</span>${esc(o.name)}</button>`).join('');
    const holder = { diffs: (tc.content || []).filter((c: Part) => c.type === 'diff') };
    const files = holder.diffs.map((c: Part) => `<div class="ch-fileline"><span class="ch-file lk-chip lk lk-file" data-chopen="${esc(c.path)}">${icon('file')}${esc(c.path)}</span>${diffBtn(holder, c)}</div>`).join('');
    const row = line('ch-ask', `<div class="ask-h"><span class="q">${q}</span>${why ? `<span class="why">${esc(why)}</span>` : ''}</div><pre class="ask-cmd">${esc(what)}${inputHtml(args)}</pre>${files}<div class="row">${opts}</div>`);
    row.diffs = holder.diffs;
    row.dataset.ask = '';
    row.askId = ev.ask;
    row.what = what;
    row.toolId = tc.toolCallId;
    if (t) t.row.hidden = true;
    asks.set(ev.ask, row);
    watchKeys(row, '[data-opt]');
    state('waiting for you', 'warn');
  }

  function askForm(ev: FormEvent) {
    const { message, schema } = ev.form, t = tools.get(ev.toolCall?.toolCallId);
    const fields = fieldsOf(schema);
    const part = (f: Field) => {
      const head = f.other || !(f.title || f.description) ? '' : `<span class="t"><b>${esc(f.title || '')}</b> ${esc(f.description || '')}</span>`;
      const body = f.choices
        ? `<div class="ask-opts">${f.choices.map((o: { const: unknown; title?: string; description?: string }, i) => `<button type="button" data-pick="${i}"><span class="n">${i + 1}</span><span>${esc(o.title ?? String(o.const))}${o.description && o.description !== o.title ? ` <span class="d">${esc(o.description)}</span>` : ''}</span></button>`).join('')}</div>`
        : `<input type="text" autocomplete="off" spellcheck="false" placeholder="${f.other ? 'other: type your own answer' : 'your answer'}">`;
      return `<div class="ask-q" data-k="${esc(f.key)}">${head}${body}</div>`;
    };
    const row = line('ch-ask', `<div class="ask-h"><span class="why">${esc(message || 'The agent asks')}</span></div>${fields.map(part).join('')}<div class="row"><button type="button" class="p" data-send-answer>send answer</button></div>`);
    row.dataset.ask = '';
    row.askId = ev.ask;
    row.what = message || 'a question';
    row.toolId = ev.toolCall?.toolCallId;
    row.fields = fields;
    row.addEventListener('input', () => formReady(row));
    formReady(row);
    if (t) t.row.hidden = true;
    asks.set(ev.ask, row);
    watchKeys(row, '[data-pick]');
    state('waiting for you', 'warn');
  }
  const partOf = (row: Line, f: Field) => [...row.querySelectorAll<HTMLElement>('.ask-q')].find((q) => q.dataset.k === f.key)!;
  const formAnswers = (row: Line) => answersOf(row.fields, (f: Field) => (f.choices ? [...partOf(row, f).querySelectorAll<HTMLElement>('.p')].map((b) => +b.dataset.pick!) : partOf(row, f).querySelector('input')!.value));
  function formReady(row: Line) {
    row.querySelector<HTMLButtonElement>('[data-send-answer]')!.disabled = !readyOf(row.fields, formAnswers(row));
  }
  function pickChoice(b: HTMLElement) {
    const q = b.closest<HTMLElement>('.ask-q')!, row = b.closest<Line>('[data-ask]')!;
    const many = row.fields.find((f: Field) => f.key === q.dataset.k).many;
    if (many) b.classList.toggle('p');
    else q.querySelectorAll('[data-pick]').forEach((x) => x.classList.toggle('p', x === b));
    formReady(row);
  }
  function answered(ev: { ask: string; optionId?: string | null }) {
    const row = asks.get(ev.ask);
    asks.delete(ev.ask);
    const held = row?.contains(document.activeElement) ? row.closest<HTMLElement>('.chat') : null;
    queueMicrotask(() => held && !held.contains(document.activeElement) && held.focus({ preventScroll: true }));
    const t = row && tools.get(row.toolId);
    if (t) {
      t.row.hidden = false;
      row.remove();
    } else if (row) {
      row.className = 'ch-note';
      row.textContent = `${ev.optionId ? 'answered' : 'cancelled'} · ${row.what}`;
    }
  }
  const optsOf = (row: Line, from?: Element | null) => {
    if (!row.fields) return [...row.querySelectorAll<HTMLElement>('[data-opt]')];
    const lists = [...row.querySelectorAll('.ask-opts')];
    const list = from?.closest('.ask-opts') || lists.find((l) => !l.querySelector('.p')) || lists.at(-1);
    return [...(list?.querySelectorAll<HTMLElement>('[data-pick]') || [])];
  };
  function waiting() {
    const all = [...asks.values()].filter((r) => r.isConnected);
    return all.find((r) => onScreen(optsOf(r)[0])) || all.at(-1);
  }
  function toQuestion() {
    const row = waiting(), b = row && optsOf(row)[0];
    if (!b) return false;
    b.scrollIntoView({ block: 'nearest' });
    b.focus({ preventScroll: true });
    return true;
  }
  function key(e: KeyboardEvent) {
    const digit = asks.size && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey;
    if (digit && input.contains(e.target as Node)) {
      if (!input.value) tell([...asks.values()].at(-1)!, { title: 'Digits are typed in the box', line: bound('boxKey') ? `${show(bound('boxKey')) === 'ctrl ctrl' ? 'Press ctrl twice' : show(bound('boxKey'))}: go to the question, then 1-9 answer it` : 'Click outside the box, then 1-9 answer it', ms: 2500 });
      return true;
    }
    const own = (e.target as HTMLElement).closest?.<Line>('[data-ask]');
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && own && asks.has(own.askId) && (e.target as HTMLElement).matches('[data-opt], [data-pick]')) {
      const bs = optsOf(own, e.target as Element), i = bs.indexOf(e.target as HTMLElement);
      e.preventDefault();
      bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length]?.focus();
      return true;
    }
    if (digit && !(e.target as HTMLElement).closest('.si-way, .ask-q input, .ch-find')) {
      const target = (row: Line) => optsOf(row, row === own ? (e.target as Element) : null)[+e.key - 1];
      const all = [...asks.values()], row = own && asks.has(own.askId) ? own : all.find((r) => onScreen(target(r))) || all[0];
      const b = target(row);
      if (b) {
        e.preventDefault();
        e.stopPropagation();
        if (!heldKey(row, b)) b.click();
      }
      return true;
    }
    if (e.key === 'Enter' && (e.target as HTMLElement).closest('.ask-q input')) {
      e.preventDefault();
      (e.target as HTMLElement).closest('[data-ask]')!.querySelector<HTMLElement>('[data-send-answer]')!.click();
      return true;
    }
    return false;
  }
  function click(d: DOMStringMap, b: HTMLButtonElement) {
    if (d.pick != null) {
      if (b.closest('.ask-q')) pickChoice(b);
      return true;
    }
    if (d.sendAnswer != null) {
      const row = b.closest<Line>('[data-ask]')!;
      b.disabled = true;
      backToEnd();
      api('POST', '/api/agent/send', { id: chat(), ask: row.askId, content: formAnswers(row) }).catch((err) => {
        formReady(row);
        showErr(err);
      });
      return true;
    }
    if (d.opt) {
      const row = b.closest<Line>('[data-ask]')!;
      backToEnd();
      api('POST', '/api/agent/send', { id: chat(), ask: row.askId, optionId: d.opt }).catch(showErr);
      return true;
    }
    return false;
  }
  return { ask, answered, key, click, toQuestion, waiting: () => !!waiting() };
}
