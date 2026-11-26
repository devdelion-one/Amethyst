import { icon } from '../base/icon.ts';
import { fullPath, pathChip } from '../base/chattext.ts';
import type { ChatCtx } from '../base/chattext.ts';
import { esc } from '../base/util.ts';

export type HandItem = { who: 'user' | 'agent' | 'tool' | 'note'; by: string; text: string };
export type HandParts = {
  from: string;
  to: string;
  rules: string | null;
  cwd: string;
  wt: { branch: string; root: string | null } | null;
  firstAsk?: string;
  files: string[];
  filesMore: number;
  failures?: string[];
  plan: { text: string; done: boolean; now: boolean }[];
  earlier: string;
  chat: HandItem[];
  since: boolean;
  cut: boolean;
  saved: string | null;
};
export type HandReply = { text: string; parts: HandParts };

const sec = (label: string, body: string) => `<div class="hof-sec"><span class="hof-k">${label}</span>${body}</div>`;
const chip = (p: string, c: ChatCtx, file = true) => pathChip(p, c, { full: fullPath(p, c), file });
const strip = (t: string) => {
  const s = t.replace(/^\((.*)\)$/s, '$1');
  return s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?…]$/.test(s) ? '' : '.');
};

function chatHtml(p: HandParts) {
  const out: string[] = [];
  let open: string[] | null = null;
  const close = () => {
    if (open) out.push(`<div class="hof-msg">${open.join('')}</div>`);
    open = null;
  };
  for (const it of p.chat) {
    if (it.who === 'tool') {
      (open ||= []).push(`<div class="hof-st">${esc(it.text)}</div>`);
      continue;
    }
    close();
    if (it.who === 'note') out.push(`<div class="hof-nt">${esc(strip(it.text))}</div>`);
    else open = [`<div class="hof-w${it.who === 'user' ? ' u' : ''}">${it.who === 'user' ? 'You' : esc(it.by)}</div><p>${esc(it.text)}</p>`];
  }
  close();
  return out.join('');
}

function readHtml(p: HandParts, c: ChatCtx) {
  const to = esc(p.to), from = esc(p.from);
  const where = [`<div class="hof-chips">${chip(p.cwd, c, false)}${p.rules ? chip(p.rules, c) : ''}</div>`];
  if (p.wt) where.push(`<span class="hof-line">This is a git worktree on branch ${esc(p.wt.branch)}: it was told to work here, not in the main folder.</span>`);
  if (p.rules) where.push(`<span class="hof-line">It was told to read the project's rules first.</span>`);
  const parts = [sec('Where it works', where.join(''))];
  if (p.firstAsk) parts.push(sec('Original ask', `<p class="hof-sum">${esc(p.firstAsk)}</p>`));
  if (p.files.length) parts.push(sec('Files the chat changed', `<div class="hof-chips">${p.files.map((f) => chip(f, c)).join('')}</div>${p.filesMore ? `<span class="hof-line">and ${p.filesMore} more</span>` : ''}`));
  if (p.failures?.length) parts.push(sec('Unresolved failures', `<div class="hof-chat">${p.failures.map((f) => `<div class="hof-st">${esc(f)}</div>`).join('')}</div>`));
  if (p.plan.length) parts.push(sec('The last plan', `<div class="hof-plan">${p.plan.map((e) => `<div class="${e.done ? 'dn' : e.now ? 'nw' : 'td'}"><span class="hof-pm">${e.done ? '✓' : e.now ? '◐' : '○'}</span>${esc(e.text)}</div>`).join('')}</div>`));
  if (p.earlier) parts.push(sec(`Earlier, ${from}'s own summary`, `<p class="hof-sum">${esc(p.earlier)}</p>`));
  parts.push(sec(p.since ? `The chat since ${to} last took part` : 'The chat', p.chat.length ? `<div class="hof-chat">${chatHtml(p)}</div>` : `<span class="hof-line">Nothing happened in the chat since ${to} last took part.</span>`));
  const foot = p.saved ? `<div class="hof-foot">${p.cut ? 'Long parts were cut short. ' : ''}The whole chat is saved in ${chip(p.saved, c)}, and ${to} was told to read it if it needs more.</div>` : '';
  return parts.join('') + foot;
}

export function handCard(r: HandReply, c: ChatCtx, raw = false) {
  const p = r.parts, to = esc(p.to);
  const seg = `<span class="seg hof-seg" role="radiogroup" aria-label="how to show it"><button type="button" class="chip${raw ? '' : ' on'}" role="radio" aria-checked="${!raw}" data-hand-view="read">Read</button><button type="button" class="chip${raw ? ' on' : ''}" role="radio" aria-checked="${raw}" data-hand-view="raw">Exact text</button></span>`;
  const head = `<div class="hof-hd">${icon('agent')}<b>What ${to} was given</b><span class="grow"></span>${seg}<button type="button" class="hof-ib" data-hand-copy aria-label="copy the exact text">${icon('copy')}</button><button type="button" class="hof-ib" data-hand-x aria-label="close">×</button></div>`;
  const lead = `<p class="hof-lead">${to} had none of ${esc(p.from)}'s session, so this went ahead of your message. It was told to check the files itself, since they may have changed.</p>`;
  return `${head}${raw ? `<pre class="hof-raw">${esc(r.text)}</pre>` : lead + readHtml(p, c)}`;
}
