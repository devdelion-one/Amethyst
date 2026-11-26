import { IMG_MD } from './links.ts';
import { esc } from './util.ts';

function frontRows(lines: string[]) {
  const rows: [string, string][] = [];
  for (const l of lines) {
    const kv = /^([\w .-]+):\s*(.*)$/.exec(l);
    if (kv) rows.push([kv[1].trim(), kv[2].trim()]);
    else if (rows.length && l.trim()) rows.at(-1)![1] += (rows.at(-1)![1] ? ', ' : '') + l.trim().replace(/^-\s*/, '');
  }
  return rows;
}

const isWeb = (href: string): boolean => /^(https?:|mailto:)/i.test(href);
const webLink = (href: string, html: string) => (isWeb(href) ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${html}</a>` : html);
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[`*_~=[\]()]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');

interface MdOptions {
  front?: boolean;
  plain?: boolean;
  link?: (href: string, html: string) => string;
  code?: (code: string) => string | null;
  image?: (src: string, alt?: string) => string | null;
  imgPath?: (rel: string) => string;
}

function inline(s: string, opt: MdOptions, kept: string[] = [], deep = false): string {
  const keep = (html: string) => `\u0001${kept.push(html) - 1}\u0001`;
  const link = (href: string, html: string) => (opt.link || webLink)(href, html);
  if (!opt.plain)
    s = s.replace(/\\([\\`*_{}[\]()#+\-.!@~|<>=])|`([^`\n]+)`|(?<![^\s(])([a-z]:\\[^\s<>"'|*?`]*[^\s<>"'|*?`().,;:!])/gi, (_: string, e: string, c: string, p: string) => {
      if (e) return keep(esc(e));
      if (c) return keep((!deep && opt.code?.(c)) || `<code>${esc(c)}</code>`);
      const h = !deep && opt.code?.(p);
      return h ? keep(h) : p;
    });
  if (!deep) {
    s = s
      .replace(/!\[([^\]\n]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"\n]*")?\s*\)/g, (_: string, alt: string, src: string) => keep(opt.image?.(src, alt) || link(src, esc(alt || src))))
      .replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"\n]*")?\s*\)/g, (_: string, t: string, href: string) => keep(link(href, inline(t, opt, kept, true))))
      .replace(/<((?:https?:\/\/|mailto:)[^\s<>]+)>/g, (_: string, u: string) => keep(link(u, esc(u))))
      .replace(/(^|[\s(])(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_~])/g, (_: string, pre: string, u: string) => pre + keep(link(u, esc(u))));
    if (opt.imgPath) s = s.replace(IMG_MD, (_: string, a: string, b: string) => keep(opt.imgPath!(a || b)));
  }
  let h = esc(s);
  if (!opt.plain)
    h = h
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/__([^_\n]+)__/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?![*\w])/g, '$1<i>$2</i>')
      .replace(/(^|[^_\w])_([^_\s][^_\n]*?)_(?![_\w])/g, '$1<i>$2</i>')
      .replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  return h.replace(/\u0001(\d+)\u0001/g, (_: string, i: number) => kept[i]);
}

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TASK = /^\[([ xX])\](?:\s+|$)/;
function list(lines: string[], at: number, opt: MdOptions): string {
  let html = '';
  const open: { ind: number; tag: string }[] = [];
  lines.forEach((l, k) => {
    const m = LIST.exec(l);
    if (!m) return void (html += '<br>' + inline(l.trim(), opt));
    const ind = m[1].replace(/\t/g, '    ').length, tag = /\d/.test(m[2]) ? 'ol' : 'ul';
    while (open.length > 1 && ind < open.at(-1)!.ind) html += `</li></${open.pop()!.tag}>`;
    if (open.length && ind === open.at(-1)!.ind && tag !== open.at(-1)!.tag) html += `</li></${open.pop()!.tag}>`;
    const box = TASK.exec(m[3]);
    const li = `<li${box ? ` class="task${box[1] === ' ' ? '' : ' done'}"` : ''} data-line="${at + k}">`;
    if (!open.length || ind > open.at(-1)!.ind) {
      open.push({ ind, tag });
      const n = parseInt(m[2], 10);
      html += `<${tag}${tag === 'ol' && n !== 1 ? ` start="${n}"` : ''}${open.length === 1 ? ` data-line="${at + k}"` : ''}>${li}`;
    } else html += `</li>${li}`;
    html += box ? `<i class="ck${box[1] === ' ' ? '' : ' on'}" data-task="${at + k}"></i>${inline(m[3].slice(box[0].length), opt)}` : inline(m[3], opt);
  });
  while (open.length) html += `</li></${open.pop()!.tag}>`;
  return html;
}

const cellsOf = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const RULE_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const CALLOUT = /^\[!(\w+)\][+-]?\s*(.*)$/;

function front(lines: string[]): string {
  return `<dl class="md-props" data-line="0">${frontRows(lines).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v.replace(/^["']|["']$/g, '')) || '&nbsp;'}</dd>`).join('')}</dl>`;
}

export function markdown(src: unknown, opt: MdOptions = {}, base = 0, seen = new Map<string, number>()): string {
  const L = String(src ?? '').replace(/\r\n/g, '\n').split('\n'), out: string[] = [], para: string[] = [];
  let from = 0;
  const flush = () => {
    if (para.length) out.push(`<p data-line="${base + from}">${para.map((l) => inline(l, opt)).join('<br>')}</p>`);
    para.length = 0;
  };
  let i = 0;
  if (opt.front && base === 0 && L[0]?.trim() === '---') {
    const end = L.findIndex((l, k) => k > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) {
      out.push(front(L.slice(1, end)));
      i = end + 1;
    }
  }
  while (i < L.length) {
    const l = L[i], at = base + i;
    let m: RegExpExecArray | null;
    if (!l.trim()) {
      flush();
      i++;
    } else if (opt.plain) {
      if (!para.length) from = i;
      para.push(l);
      i++;
    } else if ((m = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(l))) {
      flush();
      const fence = m[1], code: string[] = [];
      for (i++; i < L.length && !(L[i].trim().startsWith(fence) && !L[i].trim().slice(fence.length).trim()); i++) code.push(L[i]);
      i++;
      out.push(`<div class="md-code" data-line="${at}"><div class="md-codebar"><span>${esc(m[2])}</span><button type="button" data-copy>copy</button></div><pre>${esc(code.join('\n'))}</pre></div>`);
    } else if ((m = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(l))) {
      flush();
      const s = slug(m[2]) || 'section', n = seen.get(s) || 0;
      seen.set(s, n + 1);
      out.push(`<h${m[1].length} data-line="${at}" data-anchor="${esc(n ? `${s}-${n}` : s)}">${inline(m[2], opt)}</h${m[1].length}>`);
      i++;
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      flush();
      out.push(`<hr data-line="${at}">`);
      i++;
    } else if (/^\s*>/.test(l)) {
      flush();
      const q: string[] = [];
      while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*> ?/, ''));
      const c = CALLOUT.exec(q[0]);
      if (c) {
        const kind = c[1].toLowerCase();
        out.push(`<blockquote class="callout" data-kind="${esc(kind)}" data-line="${at}"><b class="callout-t">${c[2] ? inline(c[2], opt) : esc(kind[0].toUpperCase() + kind.slice(1))}</b>${markdown(['', ...q.slice(1)].join('\n'), opt, at, seen)}</blockquote>`);
      } else out.push(`<blockquote data-line="${at}">${markdown(q.join('\n'), opt, at, seen)}</blockquote>`);
    } else if (l.includes('|') && RULE_ROW.test(L[i + 1] || '')) {
      flush();
      const head = cellsOf(l);
      const al = cellsOf(L[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? ' style="text-align:center"' : ' style="text-align:right"') : ''));
      const rows: string[][] = [];
      for (i += 2; i < L.length && L[i].includes('|') && L[i].trim(); i++) rows.push(cellsOf(L[i]));
      const tr = (cells: string[], tag: string) => `<tr>${head.map((h, k) => `<${tag}${al[k] || ''}${tag === 'td' ? ` data-label="${esc(h)}"` : ''}>${inline(cells[k] || '', opt)}</${tag}>`).join('')}</tr>`;
      out.push(`<div class="md-table" data-line="${at}"><table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r, 'td')).join('')}</tbody></table></div>`);
    } else if (LIST.test(l)) {
      flush();
      const items: string[] = [];
      while (i < L.length && (LIST.test(L[i]) || (L[i].trim() && /^\s{2,}/.test(L[i])))) items.push(L[i++]);
      out.push(list(items, at, opt));
    } else {
      if (!para.length) from = i;
      para.push(l);
      i++;
    }
  }
  flush();
  return out.join('');
}

export function lastBlock(L: string[], from = 0): number {
  let cut = from, i = from, m: RegExpExecArray | null;
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) {
      if (++i < L.length) cut = i;
    } else if ((m = /^\s*(`{3,}|~{3,})/.exec(l))) {
      for (i++; i < L.length && !(L[i].trim().startsWith(m[1]) && !L[i].trim().slice(m[1].length).trim()); i++);
      i++;
    } else if (/^#{1,6}\s/.test(l) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(l)) {
      i++;
    } else if (/^\s*>/.test(l)) {
      while (i < L.length && /^\s*>/.test(L[i])) i++;
    } else if (l.includes('|') && RULE_ROW.test(L[i + 1] || '')) {
      for (i += 2; i < L.length && L[i].includes('|') && L[i].trim(); i++);
    } else if (LIST.test(l)) {
      while (i < L.length && (LIST.test(L[i]) || (L[i].trim() && /^\s{2,}/.test(L[i])))) i++;
    } else i++;
  }
  return cut;
}
