import { icon } from '../base/icon.ts';
import { imgCopy } from '../base/chips.ts';
import { withHint } from '../base/links.ts';
import { api, projectOf, S } from '../base/model.ts';
import { shellLine } from '../base/chattext.ts';
import type { ChatCtx } from '../base/chattext.ts';
import { esc, quietly } from '../base/util.ts';
import type { Line } from './steps.ts';

const CHECKED = 'a.ch-path:not([data-drag]), a.ch-link:not([data-drag])';
export const linkPath = (a: HTMLElement) => (a.dataset.real || a.dataset.full || a.title || a.dataset.tip)!.split('\n')[0].replace(/:\d+(-\d+)?$/, '');
type Roots = { root?: string; main?: string; agent?: string | null; touched?: Set<string> };
type Hit = { full: string; dir: boolean | null; at: number };
const FOLDER: Record<string, string> = { main: "In the project's main folder, not this chat's worktree.", agent: 'In the folder the agent worked in for this answer.' };
const bareOf = (h: string) => {
  const s = h.replace(/[?#].*$/, '').replace(/:\d+(-\d+)?$/, '');
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};
const isRel = (h: string) => !!h && !/^([a-z]:|~|[\\/]|[a-z][a-z\d+.-]+:)/i.test(h);
const joinIn = (dir: string, rel: string) => {
  const sep = dir.includes('\\') ? '\\' : '/';
  return dir.replace(/[\\/]+$/, '') + sep + rel.replace(/^\.[\\/]/, '').replace(/[\\/]/g, sep);
};
const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
function places(a: HTMLElement, r: Roots): { full: string; from: string }[] {
  const href = (a.dataset.rel ||= a.dataset.chopen || a.dataset.recheck || ''), bare = bareOf(href);
  if (!isRel(href) || !r.root) return [{ full: a.dataset.full!, from: '' }];
  const end = '/' + norm(bare).replace(/^\.\//, '');
  const out = [...(r.touched || [])].filter((t) => norm(t).endsWith(end)).map((full) => ({ full, from: 'touched' }));
  const dirs: [string | null | undefined, string][] = [[r.agent, 'agent'], [r.root, ''], [r.main, 'main']];
  for (const [d, from] of dirs) if (d && !out.some((o) => norm(o.full) === norm(joinIn(d, bare)))) out.push({ full: joinIn(d, bare), from });
  return out;
}
function pick(list: { full: string; from: string }[], known: Map<string, Hit | null | undefined>) {
  const got = list.map((p) => ({ ...p, hit: known.get(p.full) }));
  if (got.some((g) => g.hit === undefined)) return undefined;
  const real = got.filter((g) => g.hit);
  return real.find((g) => g.from === 'touched') || real.sort((x, y) => y.hit!.at - x.hit!.at)[0] || null;
}
const ask = (known: Map<string, Hit | null | undefined>, list: string[]) => {
  const want = [...new Set(list)].filter((p) => !known.has(p));
  if (!want.length) return Promise.resolve();
  want.forEach((p) => known.set(p, undefined));
  return api('POST', '/api/paths', { paths: want }).then(({ paths, dirs, times }: { paths: (string | null)[]; dirs?: (boolean | null)[]; times?: (number | null)[] }) =>
    want.forEach((p, i) => known.set(p, paths[i] ? { full: paths[i]!, dir: dirs?.[i] ?? null, at: times?.[i] ?? 0 } : null)));
};
export function checkPaths(box: Line, r: Roots = {}) {
  const known = (box.paths ||= new Map());
  const apply = () => {
    for (const a of box.querySelectorAll<HTMLElement>(CHECKED)) {
      if (a.classList.contains('miss')) continue;
      const got = pick(places(a, r), known);
      if (got === undefined) continue;
      if (got) {
        const real = got.hit!.full, other = got.from === 'main' || got.from === 'agent' || (got.from === 'touched' && norm(real) !== norm(a.dataset.full!.replace(/:\d+(-\d+)?$/, '')));
        if (a.matches('.ch-path') || a.dataset.full!.startsWith('~') || other) a.title = withHint((a.dataset.real = real + (a.querySelector('.ln')?.textContent || '')) + (other ? '\n' + (FOLDER[got.from] || FOLDER.agent) : ''));
        if (other) a.dataset.chopen = real;
        const dir = got.hit!.dir;
        if (a.matches('.ch-path') && dir != null && a.classList.contains('lk-dir') !== dir) {
          a.classList.replace(dir ? 'lk-file' : 'lk-dir', dir ? 'lk-dir' : 'lk-file');
          a.querySelector('svg')?.insertAdjacentHTML('afterend', icon(dir ? 'folder' : 'file'));
          a.querySelector('svg')?.remove();
        }
      } else if (a.matches('.ch-path')) a.replaceWith(Object.assign(document.createElement('code'), { textContent: a.textContent }));
      else {
        a.classList.add('miss');
        a.dataset.recheck = a.dataset.chopen;
        a.removeAttribute('data-chopen');
        a.title = `${a.dataset.full}\nThis file is not on the disk. Click to look again.`;
      }
    }
  };
  apply();
  const list = [...box.querySelectorAll<HTMLElement>(CHECKED)].filter((a) => !a.classList.contains('miss')).flatMap((a) => places(a, r).map((p) => p.full));
  return quietly(ask(known, list).then(apply));
}
export async function recheck(a: HTMLElement, box: Line, r: Roots) {
  const known = (box.paths ||= new Map());
  places(a, r).forEach((p) => known.delete(p.full));
  a.classList.remove('miss');
  a.dataset.chopen = a.dataset.recheck;
  a.removeAttribute('data-recheck');
  await checkPaths(box, r);
  return !a.classList.contains('miss');
}
export const imgSrc = (rel: string, pid: string) => {
  const m = /^\.amethyst\/images\/([^/\\]+)$/.exec(rel);
  const q = `v=1&w=${encodeURIComponent(S.wid)}&p=${encodeURIComponent(pid)}`;
  return m ? `/api/img?name=${encodeURIComponent(m[1])}&${q}` : `/api/raw?path=${encodeURIComponent(rel)}&${q}`;
};
export const imgChip = (src: string, name: string, rel = '', inline = false) =>
  `<span class="ch-imgw${inline ? ' in' : ''}"><button type="button" class="ch-img" ${rel ? `data-img="${esc(rel)}"` : ''}>${icon('image')}<span>${esc(name)}</span><img class="pv" src="${esc(src)}" alt="" loading="lazy"></button>${rel ? imgCopy(rel) : ''}</span>`;
export const imgInText = (rel: string, pid: string) => imgChip(imgSrc(rel, pid), rel.slice(rel.lastIndexOf('/') + 1), rel, true);
export const whereIn = (pid: string): ChatCtx => ({ root: projectOf(pid)?.path || '', here: pid === S.pid, has: (rel: string) => S.thoughts.has(rel), icon, img: (rel: string) => imgInText(rel, pid) });

const CALLS: Record<string, string> = { note: 'info', info: 'info', important: 'info', tip: 'info', hint: 'info', warning: 'warn', caution: 'warn', attention: 'warn', error: 'error', danger: 'error', failure: 'error', bug: 'error' };
const SHELL = /^(powershell|pwsh|ps1?|bash|sh|shell|zsh|cmd|bat|console|terminal)$/i;
const lead = (li: Element) => {
  const b = li.firstChild as HTMLElement | null;
  if (b?.nodeName !== 'B') return null;
  const next = b.nextSibling;
  if (/:\s*$/.test(b.textContent)) return { b, next };
  return next?.nodeType === 3 && /^\s*:/.test(next.textContent!) ? { b, next, colon: true } : null;
};
function shape(box: HTMLElement) {
  for (const ul of box.querySelectorAll('ul')) {
    const items = [...ul.children];
    if (items.length < 2 || !items.every(lead)) continue;
    const dl = document.createElement('dl');
    dl.className = 'ch-kv';
    for (const li of items) {
      const { b, next, colon } = lead(li)!;
      const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = b.textContent.replace(/:\s*$/, '');
      b.remove();
      if (next?.nodeType === 3) next.textContent = next.textContent!.replace(colon ? /^\s*:\s*/ : /^\s+/, '');
      dd.append(...li.childNodes);
      dl.append(dt, dd);
    }
    ul.replaceWith(dl);
  }
  for (const li of box.querySelectorAll('li')) {
    const b = li.firstChild as HTMLElement | null;
    if (b?.nodeName === 'B' && /[.:]\s*$/.test(b.textContent) && b.nextSibling?.textContent!.trim()) li.classList.add('lead');
  }
  for (const ol of box.querySelectorAll<HTMLOListElement>('ol[start]')) ol.style.counterReset = `n ${ol.start - 1}`;
  for (const p of box.querySelectorAll('.md > p, .md > blockquote > p:first-child')) {
    const b = p.firstChild as HTMLElement | null, next = b?.nextSibling;
    const word = b?.nodeName === 'B' && /^\s*(\w+)\s*:?\s*$/.exec(b.textContent)?.[1].toLowerCase();
    if (!CALLS[word as string] || !(/:\s*$/.test(b!.textContent) || /^\s*:/.test(next?.textContent || ''))) continue;
    let q = p.parentElement!;
    if (q.tagName !== 'BLOCKQUOTE') {
      q = document.createElement('blockquote');
      p.replaceWith(q);
      q.append(p);
    }
    q.classList.add('callout');
    q.dataset.kind = word as string;
    b!.className = 'callout-t';
    b!.textContent = b!.textContent.replace(/\s*:\s*$/, '');
    if (next?.nodeType === 3) next.textContent = next.textContent!.replace(/^\s*:?\s*/, '');
  }
  for (const t of box.querySelectorAll('.callout > .callout-t, .callout > p > .callout-t')) t.insertAdjacentHTML('beforebegin', icon(CALLS[t.closest<HTMLElement>('.callout')!.dataset.kind!] || 'info', 'ch-ci'));
  for (const c of box.querySelectorAll('.md-code')) {
    const lang = c.querySelector('.md-codebar span')!.textContent, pre = c.querySelector('pre')!, lines = pre.textContent.split('\n');
    if (/^(diff|patch)$/i.test(lang)) {
      c.classList.add('diff');
      pre.innerHTML = lines.map((l) => `<span class="${({ '+': 'add', '-': 'del', '@': 'hunk' } as Record<string, string>)[l[0]] || 'ctx'}">${esc(l)}</span>`).join('\n');
    } else if (SHELL.test(lang)) pre.innerHTML = lines.map(shellLine).join('\n');
  }
}
export function shaped(html: string) {
  const d = document.createElement('div');
  d.className = 'md';
  d.innerHTML = html;
  shape(d);
  return [...d.childNodes];
}

export function when(ms: number) {
  const t = new Date(ms), day = (d: number) => new Date(d).setHours(0, 0, 0, 0);
  const days = Math.round((day(Date.now()) - day(ms)) / 864e5);
  if (days < 1) return t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (days < 2) return 'yesterday';
  if (days < 7) return t.toLocaleDateString([], { weekday: 'short' });
  return t.toLocaleDateString([], { day: 'numeric', month: 'short', ...(t.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
}
