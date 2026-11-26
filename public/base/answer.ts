import { answersOf, fieldsOf, inputHtml, readyOf } from './asks.ts';
import { api } from './model.ts';
import { tell } from './notify.ts';
import { esc } from './util.ts';
import type { Field } from './asks.ts';
import type { Agent } from './stream.ts';
import type { AskCard } from './types.ts';

export type Ask = AskCard;

const opt = (n: number | string, text: string, data: string, cls = '') => `<button type="button" class="dk-aopt${cls}" ${data}><span class="n">${n}</span><span class="t">${text}</span></button>`;
const words = (o: { const: unknown; title?: string; description?: string }) => `${esc(o.title ?? String(o.const))}${o.description && o.description !== o.title ? `<span class="d">${esc(o.description)}</span>` : ''}`;
const foot = (send: boolean) => `<div class="dk-afoot"><button type="button" class="dk-ago" data-dk-goto>open chat ↗</button>${send ? '<button type="button" class="dk-asend" data-dk-send disabled>send answer</button>' : '<span></span>'}</div>`;

function allowHtml(k: Ask) {
  const files = k.files.length ? `<div class="dk-afiles">${k.files.map((f) => `<div class="dk-afile"><span class="p">${esc(f.path)}</span><span class="df">${f.add ? `<b class="a">+${f.add}</b>` : ''}${f.del ? ` <b class="r">−${f.del}</b>` : ''}${f.fresh ? ' · new' : ''}</span></div>`).join('')}</div>` : '';
  const opts = k.options.map((o, i) => opt(i + 1, esc(o.name), `data-dk-opt="${esc(o.optionId)}"`, o.kind === 'allow_once' ? ' p' : '')).join('');
  return `<div class="dk-aq">${esc(k.q)}${k.why ? `<span class="why">${esc(k.why)}</span>` : ''}</div><pre class="dk-acmd">${esc(k.what)}${inputHtml(k.input)}</pre>${files}<div class="dk-aopts">${opts}</div>${foot(false)}`;
}

function formHtml(k: Ask, fields: Field[]) {
  const base = (f: Field) => fields.find((x) => x.key === f.key.slice(0, -7));
  const part = (f: Field) => {
    const head = f.other || !(f.title || f.description) ? '' : `<span class="dk-at"><b>${esc(f.title || '')}</b> ${esc(f.description || '')}</span>`;
    const body = f.choices
      ? `<div class="dk-aopts">${f.choices.map((o, i) => opt(i + 1, `${f.many ? '<i class="dk-abox"></i>' : ''}${words(o)}`, `data-dk-pick="${i}"`)).join('')}</div>`
      : `<label class="dk-aother"><span class="n">${f.other ? (base(f)?.choices?.length || 0) + 1 : ''}</span><input type="text" autocomplete="off" spellcheck="false" placeholder="${f.other ? 'other: type your own answer' : 'your answer'}"></label>`;
    return `<div class="dk-apart" data-k="${esc(f.key)}">${head}${body}</div>`;
  };
  return `<div class="dk-aq">${esc(k.form!.message || 'The agent asks')}</div>${fields.map(part).join('')}${foot(true)}`;
}

export const askHtml = (k: Ask) => `<div class="dk-ask">${k.form ? formHtml(k, fieldsOf(k.form.schema)) : allowHtml(k)}</div>`;

export function answers(open: (id: string) => unknown) {
  const kept = new Map<string, HTMLElement>();
  function build(a: Agent) {
    const k: Ask = a.ask!, el = document.createElement('div');
    el.className = 'dk-ask';
    el.dataset.tip = '';
    const fields = k.form ? fieldsOf(k.form.schema) : null;
    el.innerHTML = fields ? formHtml(k, fields) : allowHtml(k);
    const partOf = (f: Field) => [...el.querySelectorAll<HTMLElement>('.dk-apart')].find((p) => p.dataset.k === f.key);
    const got = () => answersOf(fields!, (f) => (f.choices ? [...partOf(f)!.querySelectorAll<HTMLElement>('.dk-aopt.sel')].map((b) => +b.dataset.dkPick!) : partOf(f)!.querySelector('input')!.value));
    const sendBtn = el.querySelector('[data-dk-send]') as HTMLButtonElement;
    let busy = false;
    const ready = () => sendBtn && (sendBtn.disabled = busy || !readyOf(fields!, got()));
    const post = (body: Record<string, unknown>) => {
      busy = true;
      el.classList.add('sending');
      ready();
      api('POST', '/api/agent/send', { id: a.id, ask: k.id, ...body }).catch((err) => {
        busy = false;
        el.classList.remove('sending');
        ready();
        tell(el, { title: 'Not answered', line: err.message || String(err), ms: 3000 });
      });
    };
    const send = () => !busy && readyOf(fields!, got()) && post({ content: got() });
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b || busy) return;
      const d = b.dataset;
      if (d.dkGoto != null) return open(a.id);
      if (d.dkOpt) return post({ optionId: d.dkOpt });
      if (d.dkSend != null) return send();
      if (d.dkPick != null) {
        const f = fields!.find((x) => x.key === (b.closest('.dk-apart') as HTMLElement).dataset.k);
        if (f!.many) b.classList.toggle('sel');
        else partOf(f!)!.querySelectorAll('[data-dk-pick]').forEach((x) => x.classList.toggle('sel', x === b));
        ready();
      }
    });
    el.addEventListener('input', ready);
    el.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      if (e.key === 'Enter' && t.matches('input')) {
        e.preventDefault();
        send();
        return;
      }
      if (t.matches('input') || e.ctrlKey || e.altKey || e.metaKey) return;
      const bs = [...(t.closest('.dk-aopts') || el.querySelector('.dk-aopts'))?.querySelectorAll<HTMLElement>('.dk-aopt') || []];
      if (/^[1-9]$/.test(e.key) && bs[+e.key - 1]) {
        e.preventDefault();
        e.stopPropagation();
        bs[+e.key - 1].click();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && bs.length) {
        e.preventDefault();
        const i = bs.indexOf(t);
        bs[(i + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length].focus();
      }
    });
    ready();
    return el;
  }
  return {
    card(a: Agent) {
      const key = `${a.id} ${a.ask!.id}`;
      if (!kept.has(key)) kept.set(key, build(a));
      return kept.get(key)!;
    },
    keep(keys: Set<string>) {
      for (const k of kept.keys()) if (!keys.has(k)) kept.delete(k);
    },
  };
}
