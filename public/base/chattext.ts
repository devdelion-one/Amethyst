import { codePath, imgsIn, linkLook, outKeys, outTo, relIn, splitLine, target, URL_RE, withHint } from './links.ts';
import { lastBlock, markdown } from './markdown.ts';
import { hunks, lineCount, lineDiff } from './linediff.ts';
import { esc } from './util.ts';

export interface ChatCtx {
  root?: string;
  main?: string;
  here?: boolean;
  has?: (rel: string) => boolean;
  icon?: (name: string) => string;
  img?: (rel: string) => string;
  quote?: (n: string, text: string) => string;
}
type Quote = { from: string | null; text: string };

export const fullPath = (p: string, c: ChatCtx): string => target(p, { root: c.root })?.abs ?? p;

function mdLink(href: string, html: string, c: ChatCtx): string {
  const t = target(href, { root: c.root });
  if (t?.kind === 'web' || t?.kind === 'mail') return `<a class="${linkLook(t)}" href="${esc(href)}" data-chopen="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(t.kind === 'mail' ? `${String(t.url).replace(/^mailto:/, '')}\nClick to write a mail to it.` : `${t.url}\nClick to open the page in Amethyst.`)}"${t.kind === 'mail' ? '' : ` data-tip-out="${esc(outTo(t))}" data-tip-keys="${outKeys(t)}"`} data-tip-mono>${html}</a>`;
  if (t?.kind !== 'path') return html;
  const full = t.abs + (t.line ? splitLine(href)[1] : '');
  return `<a class="ch-link ${linkLook(t, c.root)}" ${dragOf(href, c)} data-chopen="${esc(href)}" data-full="${esc(full)}" title="${esc(withHint(relIn(full, c.root) || full))}" data-tip-out="${esc(outTo())}" data-tip-keys="${outKeys()}" data-tip-mono>${html}</a>`;
}

export function codeChip(code: string, c: ChatCtx): string | null {
  if (/^\/[\w-]+$/.test(code)) return `<code class="slash">${esc(code)}</code>`;
  const cp = codePath(code);
  if (!cp) return null;
  const { p, at, dir } = cp;
  return pathChip(p, c, { full: fullPath(p, c) + at, at, file: !dir && /\.[^.\\/]+$/.test(p) });
}
export const pathChip = (p: string, c: ChatCtx, { full = p, at = '', file = true, label = p }: { full?: string; at?: string; file?: boolean; label?: string } = {}): string =>
  `<a class="ch-path lk-chip ${linkLook({ ...(target(p, { root: c.root }) ?? { kind: 'path', abs: p }), dir: !file }, c.root)}" ${dragOf(p, c)} data-chopen="${esc(p)}" data-full="${esc(full)}" title="${esc(withHint(relIn(full, c.root) || full))}" data-tip-out="${esc(outTo())}" data-tip-keys="${outKeys()}" data-tip-mono>${c.icon!(file ? 'file' : 'folder')}${esc(label)}${at ? `<span class="ln">${esc(at)}</span>` : ''}<span class="lk-copy" data-copy-path role="button" aria-label="copy path">${c.icon!('copy')}</span></a>`;
const dragOf = (p: string, c: ChatCtx, rel = inProject(p, c)) => (rel ? `draggable="true" data-drag="link:${esc(rel)}"` : '');
export const relOf = (p: string, c: ChatCtx): string => relIn(p, c.root) || p;
export const diffCount = (d: { oldText?: string | null; newText?: string | null }): number[] => lineCount(d.oldText, d.newText);

export const md = (src: unknown, c: ChatCtx, base = 0, seen = new Map<string, number>()): string =>
  markdown(src, {
    link: (href, html) => mdLink(href, html, c),
    code: (x) => (imgsIn(x)[0]?.rel === x ? c.img!(x) : codeChip(x, c)),
    image: (src) => (imgsIn(src)[0]?.rel === src ? c.img!(src) : null),
    imgPath: (rel) => c.img!(rel),
  }, base, seen);

export function youLinks(text: unknown, c: ChatCtx): { from: number; to: number; html: string }[] {
  const t = String(text), out: { from: number; to: number; html: string }[] = [];
  const add = (m: RegExpExecArray, html: string | false | null | undefined) => html && out.push({ from: m.index, to: m.index + m[0].length, html });
  for (const m of t.matchAll(/(?<!!)\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g)) {
    const html = mdLink(m[2], esc(m[1]), c);
    add(m, html !== esc(m[1]) && html);
  }
  for (const m of t.matchAll(URL_RE)) {
    const html = mdLink(m[0], esc(m[0]), c);
    add(m, html !== esc(m[0]) && html);
  }
  for (const m of t.matchAll(/`([^`\n]+)`/g)) add(m, codePath(m[1]) && imgsIn(m[1])[0]?.rel !== m[1] && codeChip(m[1], c));
  return out.sort((a, b) => a.from - b.from);
}

export const QUOTE_RE = /❝([^❝❞\n]+)❞/g;
const NL = '␤';
export const quoteToken = (t: unknown, from?: unknown): string =>
  from
    ? `❝«${String(from).replace(/[❝❞«»\n]/g, '')}»${String(t).replace(/[❝❞]/g, '').replace(/\r/g, '').replace(/\n/g, NL)}❞`
    : `❝${String(t).replace(/[❝❞]/g, '').replace(/\s+/g, ' ').trim().replace(/^«/, '')}❞`;
export function quoteSplit(q: string): Quote {
  const m = /^«([^»]*)»([\s\S]*)$/.exec(q);
  return m ? { from: m[1], text: m[2].replaceAll(NL, '\n') } : { from: null, text: q };
}
const TERM = /^terminal(?: · (.*))?$/;
export const refLabel = (from: string) => (TERM.test(from) ? 'terminal' : from.split('/').pop());
function refHead(from: string): string {
  const t = TERM.exec(from);
  if (t) return `terminal output${t[1] ? ` (${t[1]})` : ''}`;
  const m = /^(.*):(\d+(?:-\d+)?)$/.exec(from);
  return m ? `\`${m[1]}\` line${m[2].includes('-') ? 's' : ''} ${m[2]}` : `\`${from}\``;
}
export function refText(from: string, text: string): string {
  const tick = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  const ext = TERM.test(from) ? '' : (/\.(\w+):[\d-]+$/.exec(from)?.[1] || '').toLowerCase();
  return `${refHead(from)}:\n${tick}${ext}\n${text}\n${tick}`;
}
export function quoteOut(t: string): string {
  const list = [...String(t).matchAll(QUOTE_RE)].map((m) => quoteSplit(m[1]));
  if (!list.length) return t;
  let n = 0;
  const block = (q: Quote, i: number) => (q.from ? `> [${i + 1}] ` + refText(q.from, q.text).replace(/\n/g, '\n> ') : `> [${i + 1}] ${q.text}`);
  return list.map(block).join('\n') + '\n\n' + t.replace(QUOTE_RE, () => `[${++n}]`);
}
function headPlace(h: string): string | null {
  const t = /^terminal output(?: \((.*)\))?:$/.exec(h);
  if (t) return t[1] ? `terminal · ${t[1]}` : 'terminal';
  const m = /^`([^`]+)`(?: lines? (\d+(?:-\d+)?))?:$/.exec(h);
  return m ? (m[2] ? `${m[1]}:${m[2]}` : m[1]) : null;
}
export function quoteParse(t: string): { quotes: string[]; from: number } | null {
  const quotes: string[] = [], line = (a: number) => t.slice(a, t.indexOf('\n', a) < 0 ? t.length : t.indexOf('\n', a));
  const next = (a: number) => (t.indexOf('\n', a) < 0 ? t.length : t.indexOf('\n', a) + 1);
  let at = 0;
  for (;;) {
    const m = new RegExp(`^> \\[${quotes.length + 1}\\] (.+)$`).exec(line(at));
    if (!m) break;
    at = next(at);
    const from = headPlace(m[1]), fence = from != null && /^> (`{3,})\w*$/.exec(line(at));
    if (!fence) {
      quotes.push(m[1]);
      continue;
    }
    const body: string[] = [];
    let b = next(at), closed = false;
    while (b < t.length) {
      const l = line(b);
      b = next(b);
      if (l === '> ' + fence[1]) {
        closed = true;
        break;
      }
      body.push(l.startsWith('> ') ? l.slice(2) : l.replace(/^>/, ''));
    }
    if (!closed) break;
    quotes.push(quoteToken(body.join('\n'), from).slice(1, -1));
    at = b;
  }
  return quotes.length && t[at] === '\n' ? { quotes, from: at + 1 } : null;
}
export function quoteIn(t: string): string {
  const q = quoteParse(String(t));
  return q ? t.slice(q.from).replace(/\[(\d+)\]/g, (m: string, n: number) => (q.quotes[n - 1] ? `❝${q.quotes[n - 1]}❞` : m)) : t;
}
export function quotePieces(t: string, c: ChatCtx): { from: number; to: number; html: string }[] {
  const q = quoteParse(String(t));
  if (!q) return [];
  const out = [{ from: 0, to: q.from, html: '' }];
  for (const m of String(t).slice(q.from).matchAll(/\[(\d+)\]/g))
    if (q.quotes[(m[1] as unknown as number) - 1]) out.push({ from: q.from + m.index, to: q.from + m.index + m[0].length, html: c.quote!(m[1], q.quotes[(m[1] as unknown as number) - 1]) });
  return out;
}

export function streamed(st: { line: number; seen: Map<string, number> }, src: unknown, c: ChatCtx, end = false): { done: string; tail: string } {
  const L = String(src ?? '').replace(/\r\n/g, '\n').split('\n'), k = end ? L.length : lastBlock(L, st.line);
  let done = '';
  if (k > st.line) {
    done = md(L.slice(st.line, k).join('\n'), c, st.line, st.seen);
    st.line = k;
  }
  return { done, tail: k < L.length ? md(L.slice(k).join('\n'), c, k, new Map(st.seen)) : '' };
}

export function shellLine(l: string): string {
  if (!l.trim()) return '';
  if (/^\s*(#|rem\s|::)/i.test(l)) return `<span class="cm">${esc(l)}</span>`;
  let cmd = true, h = '';
  for (const [t] of l.matchAll(/"[^"]*"?|'[^']*'?|\s#.*$|\s+|[|;&]+|[^\s"'|;&]+/g)) {
    if (!t.trim()) h += t;
    else if (/^[|;&]+$/.test(t)) h += esc(t);
    else if (/^\s#/.test(t)) h += `<span class="cm">${esc(t)}</span>`;
    else if (/^["']/.test(t)) h += `<span class="st">${esc(t)}</span>`;
    else h += cmd ? `<span class="fn">${esc(t)}</span>` : t.startsWith('-') ? `<span class="fl">${esc(t)}</span>` : esc(t);
    if (t.trim()) cmd = /^[|;&]+$/.test(t);
  }
  return `<span class="cl">${h}</span>`;
}

export function diffText(oldText: string | null | undefined, newText: string | null | undefined): string {
  const ops = lineDiff(oldText, newText);
  if (!ops.some(([k]) => k !== 'same')) return '<span class="dim">no change</span>';
  const MARK = { same: '  ', del: '- ', add: '+ ', fold: '⋯ ' };
  const lines = hunks(ops).map((p) => `<span class="${p.kind === 'same' ? 'ctx' : p.kind}">${esc(MARK[p.kind] + p.text)}</span>`);
  return lines.slice(0, 400).join('\n') + (lines.length > 400 ? `\n<span class="dim">… ${lines.length - 400} more lines</span>` : '');
}

export const inProject = (p: unknown, c: ChatCtx): string | null => (c.here && c.root && typeof p === 'string' && target(p, { root: c.root, has: c.has })?.rel) || null;
