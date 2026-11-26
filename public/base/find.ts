import { icon } from './icon.ts';

type Match = { at: number; to: number; range: Range };
interface FindScope {
  label: string;
  tip: string;
  root: Node;
  view: Element;
  skip?: (el: Element | null) => unknown;
  reveal: (r: any) => void;
  leave: (m: Match | undefined) => void;
  opened?: () => void;
}


const all = new Highlight(), now = new Highlight();
now.priority = 1;
CSS.highlights.set('ch-find', all);
CSS.highlights.set('ch-find-now', now);

const BLOCK = 'p, li, pre, td, th, h1, h2, h3, h4, h5, h6, summary, blockquote, div';
const re = (q: string) => new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');

function blocks(root: Node, skip?: (el: Element | null) => unknown): Text[][] {
  const by = new Map<Element | null, Text[]>(), walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n: Node | null; (n = walk.nextNode()); ) {
    if (skip?.(n.parentElement)) continue;
    const b = n.parentElement!.closest(BLOCK);
    if (!by.has(b)) by.set(b, []);
    by.get(b)!.push(n as Text);
  }
  return [...by.values()];
}
function rangeIn(nodes: Text[], from: number, to: number): Range {
  const r = new Range();
  let at = 0;
  for (const n of nodes) {
    const end = at + n.length;
    if (from >= at && from < end) r.setStart(n, from - at);
    if (to > at && to <= end) {
      r.setEnd(n, to - at);
      break;
    }
    at = end;
  }
  return r;
}

export function createFind(parent: Element, scopes: Record<string, FindScope>) {
  const bar = document.createElement('div');
  bar.className = 'ch-find';
  bar.setAttribute('role', 'search');
  bar.hidden = true;
  const chips = Object.entries<any>(scopes).map(([k, s]) => `<button type="button" data-find-scope="${k}">${s.label}</button>`).join('');
  bar.innerHTML = `<span class="cf-scopes">${chips}</span><input type="text" placeholder="Find" spellcheck="false" autocomplete="off" aria-label="find"><span class="cf-n" aria-live="polite"></span><button type="button" data-find="-1" title="Previous match&#10;Goes to the match before." data-tip-keys="=shift+enter:previous match" aria-label="previous match">${icon('up')}</button><button type="button" data-find="1" title="Next match&#10;Goes to the next match." data-tip-keys="=enter:next match" aria-label="next match">${icon('down')}</button><button type="button" data-find="close" title="Close\nCloses the find bar." data-tip-keys="=esc:close" aria-label="close">${icon('close')}</button>`;
  parent.append(bar);
  const q = bar.querySelector('input')!, count = bar.querySelector('.cf-n')!;
  let scope: string | null = null, matches: Match[] = [], at = -1, timer: ReturnType<typeof setTimeout> | 0 = 0, lookedAt = 0;
  let typed = false;

  const unmark = () => {
    for (const m of matches) all.delete(m.range);
    if (matches[at]) now.delete(matches[at].range);
  };
  function paint() {
    if (matches[at]) now.add(matches[at].range);
    count.textContent = q.value ? `${matches.length ? at + 1 : 0} / ${matches.length}` : '';
    for (const b of bar.querySelectorAll<HTMLButtonElement>('[data-find="1"], [data-find="-1"]')) b.disabled = !matches.length;
  }
  function look(keep: boolean) {
    unmark();
    const was = at, s = scopes[scope!];
    matches = [];
    at = -1;
    if (q.value) {
      const find = re(q.value);
      for (const nodes of blocks(s.root, s.skip)) {
        const text = nodes.map((n) => n.data).join('');
        for (const m of text.matchAll(find)) matches.push({ at: m.index, to: m.index + m[0].length, range: rangeIn(nodes, m.index, m.index + m[0].length) });
      }
    }
    for (const m of matches) all.add(m.range);
    if (matches.length) at = keep && was >= 0 ? Math.min(was, matches.length - 1) : firstOnScreen(s.view.getBoundingClientRect().top);
    lookedAt = performance.now();
    paint();
    if (!keep && matches.length) s.reveal(matches[at].range);
  }
  function firstOnScreen(top: number) {
    let lo = 0, hi = matches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (matches[mid].range.getBoundingClientRect().top >= top) hi = mid;
      else lo = mid + 1;
    }
    return lo < matches.length ? lo : 0;
  }
  function later() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (scope) look(!typed);
      typed = false;
    }, typed ? 120 : Math.max(120, lookedAt + 1000 - performance.now()));
  }
  const seen = new MutationObserver(later);
  function step(by: number) {
    if (!matches.length) return;
    now.delete(matches[at].range);
    at = (at + by + matches.length) % matches.length;
    paint();
    scopes[scope!].reveal(matches[at].range);
  }
  function setScope(name: string) {
    scope = name;
    for (const b of bar.querySelectorAll<HTMLElement>('[data-find-scope]')) {
      const k = b.dataset.findScope;
      b.setAttribute('aria-pressed', (k === name) as unknown as string);
      b.title = scopes[k!].tip;
      if (Object.keys(scopes).length > 1) b.dataset.tipKeys = 'find:find, again: the other one';
    }
    seen.disconnect();
    scopes[name].opened?.();
    seen.observe(scopes[name].root, { childList: true, subtree: true, characterData: true });
  }
  function shut() {
    clearTimeout(timer);
    typed = false;
    seen.disconnect();
    unmark();
    matches = [];
    at = -1;
    scope = null;
    bar.hidden = true;
  }
  function close() {
    const s = scopes[scope!], m = matches[at];
    shut();
    s.leave(m);
  }
  function open(name: string, seed = '') {
    clearTimeout(timer);
    typed = false;
    bar.hidden = false;
    setScope(name);
    if (seed) q.value = seed;
    q.focus();
    q.select();
    look(false);
  }
  q.addEventListener('input', () => {
    typed = true;
    later();
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  bar.addEventListener('mousedown', (e) => e.target !== q && e.preventDefault());
  bar.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    if (b.dataset.findScope) open(b.dataset.findScope);
    else if (b.dataset.find === 'close') close();
    else step(+b.dataset.find!);
  });
  return { open, shut, scope: () => scope, focused: () => bar.contains(document.activeElement) };
}
