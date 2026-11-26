import { onOutside, raise } from '../base/lift.ts';
import { api } from '../base/model.ts';
import { esc } from '../base/util.ts';
import { tokens } from '../base/words.ts';
import { when } from './shape.ts';

type Item = { name: string; tokens: number; kind?: string };
type Memory = { path: string; tokens: number; kind?: string; name?: string; real?: string; shared?: boolean };
type Context = { model: string; used: number; size: number; parts: Item[]; memory: Memory[]; mcp: Item[] };
type Seen = { busy?: boolean; context?: Context; at?: number };

const HUES = ['var(--accent)', 'var(--ok)', 'var(--warn)', 'var(--danger)', 'var(--text-dim)', 'color-mix(in srgb, var(--accent) 50%, var(--ok))', 'color-mix(in srgb, var(--warn) 50%, var(--danger))'];
const TOP = 5;
let open: { box: HTMLElement; ring: HTMLElement; off: () => void; again: ReturnType<typeof setTimeout> | 0 } | null = null;

const memoryName = (m: Memory) => {
  const n = m.name || '';
  switch (m.kind) {
    case 'global': return 'Your global instructions';
    case 'global-rule': return `Your global rule ${n}`;
    case 'project': return "This project's instructions";
    case 'project-local': return "This project's private instructions";
    case 'project-rule': return `This project's rule ${n}`;
    case 'folder': return `Instructions for ${n}`;
    case 'auto': return 'Auto memory for this project';
    default: return m.path.split(/[\\/]/).pop() || m.path;
  }
};
export const memoryRow = (m: Memory) => {
  const name = memoryName(m);
  return { name, tokens: m.tokens, tip: `${name}\n${m.real || m.path}${m.shared ? '\n\nShared with your main account: the same file.' : ''}`, mono: true };
};

const share = (n: number, of: number) => {
  const p = of ? (n / of) * 100 : 0;
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`;
};

function list(title: string, rows: { name: string; tokens: number; tip?: string; wide?: boolean; mono?: boolean }[]) {
  if (!rows.length) return '';
  const shown = rows.slice(0, TOP), rest = rows.slice(TOP);
  const more: typeof rows = rest.length ? [{ name: `${rest.length} more`, tokens: rest.reduce((a, r) => a + r.tokens, 0), tip: `${rest.length} more\n${rest.map((r) => r.name).join('\n')}`, wide: true }] : [];
  return `<div class="cx-sub">${esc(title)}</div>` + [...shown, ...more].map((r) => `<div class="cx-row cx-file" ${r.tip ? `title="${esc(r.tip)}"${r.wide ? ' data-tip-wide' : ''}${r.mono ? ' data-tip-mono' : ''}` : `title="${esc(r.name)}" data-tip-cut=".cx-name"`}><span class="cx-name">${esc(r.name)}</span><span class="cx-n">${tokens(r.tokens)}</span></div>`).join('');
}

function body(s: Seen) {
  const c = s.context;
  if (!c) return `<div class="cx-none">${s.busy ? "The agent is working. Its context can be counted once it's done." : 'Nothing counted yet.'}</div>`;
  const used = c.parts.filter((p) => p.kind === 'used'), held = c.parts.filter((p) => p.kind === 'buffer' || p.kind === 'free'), size = c.size || 1;
  const bar = used.map((p, i) => `<i style="width:${(p.tokens / size) * 100}%;background:${HUES[i % HUES.length]}"></i>`).join('');
  const row = (p: Item, hue: string) => `<div class="cx-row"><i class="cx-dot" style="background:${hue}"></i><span class="cx-name">${esc(p.name)}</span><span class="cx-n">${tokens(p.tokens)}</span><span class="cx-p">${share(p.tokens, size)}</span></div>`;
  const deferred = c.parts.filter((p) => p.kind === 'deferred');
  return `<div class="cx-bar">${bar}</div>`
    + used.map((p, i) => row(p, HUES[i % HUES.length])).join('')
    + (held.length ? '<div class="cx-sep"></div>' + held.map((p) => row(p, p.kind === 'free' ? 'transparent' : 'var(--line)')).join('') : '')
    + (deferred.length ? `<div class="cx-sub">Not loaded yet</div>` + deferred.map((p) => row(p, 'transparent')).join('') : '')
    + list('Largest memory files', c.memory.map(memoryRow))
    + list('Largest MCP servers', c.mcp);
}

function paint(box: HTMLElement, s: Seen, err = '') {
  const c = s.context;
  box.innerHTML = `<div class="cx-head"><b>What this chat's context is made of</b><small>${c ? `${tokens(c.used)} of ${tokens(c.size)}` : ''}</small></div>`
    + `<div class="cx-body">${err ? `<div class="cx-none err">${esc(err)}</div>` : ''}${body(s)}</div>`
    + `<div class="cx-foot"><span class="cx-age">${s.at ? (s.busy ? `from ${when(s.at)}, the agent is working` : Date.now() - s.at < 5000 ? 'just now' : when(s.at)) : ''}${c?.model ? `<span class="cx-model">${esc(c.model)}</span>` : ''}</span><button class="quiet cx-again">refresh</button></div>`;
}

function place(box: HTMLElement, ring: HTMLElement) {
  box.style.maxHeight = '';
  const r = ring.getBoundingClientRect(), b = box.getBoundingClientRect();
  const above = r.top - 14, below = innerHeight - r.bottom - 14, up = above >= Math.min(b.height, 200) || above >= below;
  box.style.maxHeight = Math.max(120, up ? above : below) + 'px';
  const h = box.getBoundingClientRect().height;
  box.style.left = Math.max(8, Math.min(r.right - b.width, innerWidth - b.width - 8)) + 'px';
  box.style.top = (up ? r.top - 6 - h : r.bottom + 6) + 'px';
}

export function closeContext() {
  if (!open) return;
  open.off();
  clearTimeout(open.again || undefined);
  open.box.remove();
  open = null;
}

export async function openContext(ring: HTMLElement, chat: string) {
  closeContext();
  const box = document.createElement('div');
  box.className = 'cx-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', "what this chat's context is made of");
  document.body.append(box);
  raise(box);
  const me = (open = { box, ring, off: onOutside([box], closeContext, { esc: true }), again: 0 });
  let seen: Seen = {};
  const load = async () => {
    clearTimeout(me.again || undefined);
    paint(box, seen);
    box.classList.add('loading');
    place(box, ring);
    let err = '';
    try {
      seen = await api('GET', `/api/agent/context?id=${encodeURIComponent(chat)}`);
    } catch (e: any) {
      err = e?.message || "couldn't count it";
    }
    if (open !== me) return;
    box.classList.remove('loading');
    paint(box, seen, err);
    place(box, ring);
    if (seen.busy) me.again = setTimeout(() => open === me && load(), 1500);
  };
  box.addEventListener('click', (e) => (e.target as Element).closest('.cx-again') && load());
  await load();
}
