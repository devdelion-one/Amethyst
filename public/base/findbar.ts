import type * as CM from '/vendor/codemirror.mjs';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { icon } from './icon.ts';
import { store } from './util.ts';

type Ctl = { replace(on: boolean): void };
const CAP = 1000;
const ctl = new WeakMap<EditorView, Ctl>();

export function openReplace(L: typeof CM, view: EditorView) {
  L.openSearchPanel(view);
  ctl.get(view)?.replace(true);
  return true;
}

export function findBar(L: typeof CM) {
  return [
    L.search({ top: true, createPanel: (view: EditorView) => panel(L, view) }),
    L.EditorView.theme({
      '.cm-panels.cm-panels-top:has(> .cm-find:only-child)': { borderBottom: '0', backgroundColor: 'transparent' },
      '.cm-panel.cm-find': { position: 'absolute', right: '10px', top: 'calc(100% + 8px)', zIndex: '5', display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px', backgroundColor: 'var(--raised)', boxShadow: 'var(--float)', borderRadius: 'var(--r-panel)' },
      '.cm-find .fb-ln': { display: 'flex', alignItems: 'center', gap: '2px', height: '24px' },
      '.cm-find .fb-ln[hidden]': { display: 'none' },
      '.cm-find .fb-fld': { display: 'flex', alignItems: 'center', width: '190px', height: '24px', marginRight: '4px', backgroundColor: 'var(--bg)', borderRadius: 'var(--r-sm)' },
      '.cm-find .fb-fld:focus-within': { outline: '1px solid var(--accent)' },
      '.cm-find .fb-fld input': { flex: '1', minWidth: '0', height: '24px', padding: '0 8px', border: '0', outline: '0', background: 'none', color: 'var(--text)', font: 'inherit' },
      '.cm-find .fb-n': { flex: 'none', width: '64px', paddingRight: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 'var(--fs-xs)', color: 'var(--text-dim)', whiteSpace: 'nowrap' },
      '.cm-find .fb-n.none': { color: 'var(--danger)' },
      '.cm-find .fb-sq': { position: 'relative', flex: 'none', width: '22px', height: '22px', minHeight: '0', padding: '0', display: 'inline-grid', placeItems: 'center', border: '0', borderRadius: 'var(--r-sm)', background: 'none', color: 'var(--text-dim)', fontFamily: 'var(--mono)', fontSize: 'var(--fs-xs)', fontWeight: '600', cursor: 'pointer' },
      '.cm-find .fb-sq:hover': { backgroundColor: 'var(--hover)', color: 'var(--text)' },
      '.cm-find .fb-sq.on': { backgroundColor: 'var(--flip)', color: 'var(--flip-ink)' },
      '.cm-find .fb-sq .ic': { width: '14px', height: '14px' },
      '.cm-find .fb-sq.dot::after': { content: '""', position: 'absolute', right: '3px', top: '3px', width: '5px', height: '5px', borderRadius: '50%', backgroundColor: 'var(--accent)' },
      '.cm-find .fb-dv': { flex: 'none', width: '1px', height: '14px', margin: '0 3px', backgroundColor: 'var(--line)' },
    }),
  ];
}

function panel(L: typeof CM, view: EditorView) {
  const el = (tag: string, cls: string, html = '') => Object.assign(document.createElement(tag), { className: cls, innerHTML: html });
  const sq = (title: string, html: string, run: () => unknown, keys = '') => {
    const b = el('button', 'fb-sq', html) as HTMLButtonElement;
    b.type = 'button';
    b.title = title;
    if (keys) b.dataset.tipKeys = keys;
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => run();
    return b;
  };
  const field = (ph: string, name: string) => {
    const box = el('div', 'fb-fld'), input = el('input', '') as HTMLInputElement;
    Object.assign(input, { placeholder: ph, name, spellcheck: false });
    input.setAttribute('aria-label', ph);
    box.append(input);
    return { box, input };
  };
  const dv = () => el('span', 'fb-dv');
  const dom = el('div', 'cm-find');
  const find = field('Find', 'search'), rep = field('Replace', 'replace');
  find.input.setAttribute('main-field', 'true');
  const count = el('span', 'fb-n');
  find.box.append(count);
  let more = !!store.get('find.more', false);
  const prev = sq('Previous match\nSelects the match before this one.', icon('up'), () => L.findPrevious(view), '=shift+enter:previous match');
  const next = sq('Next match\nSelects the next match.', icon('down'), () => L.findNext(view), '=enter:next match');
  const repBtn = sq('Replace\nShows the line to replace the matches with.', icon('findReplace'), () => replace(rep.box.parentElement!.hidden), '=ctrl+h:replace');
  const moreBtn = sq('More options\nMatch case, whole word, regular expression and select all.', icon('findOptions'), () => setMore(!more));
  const close = sq('Close\nCloses the find bar.', icon('close'), () => L.closeSearchPanel(view), '=esc:close');
  const flag = (title: string, html: string, key: 'caseSensitive' | 'wholeWord' | 'regexp') => {
    const b = sq(title, html, () => commit({ [key]: !L.getSearchQuery(view.state)[key] }));
    b.dataset.k = key;
    return b;
  };
  const flags = [flag('Match case\nFinds only text with the same capitals.', 'Aa', 'caseSensitive'), flag('Whole word\nFinds only whole words, not parts of longer ones.', '<u>ab</u>', 'wholeWord'), flag('Regular expression\nReads what you type as a pattern.', '.*', 'regexp')];
  const all = sq('Select all matches\nPuts a cursor on every match, to change them all at once.', icon('findAll'), () => L.selectMatches(view), '=alt+enter:select all matches');
  const line1 = el('div', 'fb-ln'), line2 = el('div', 'fb-ln'), line3 = el('div', 'fb-ln');
  line1.append(find.box, prev, next, dv(), repBtn, moreBtn, close);
  line2.append(rep.box, sq('Replace\nReplaces this match and goes to the next.', icon('findReplaceOne'), () => L.replaceNext(view), '=enter:replace'), sq('Replace all\nReplaces every match.', icon('findReplaceAll'), () => L.replaceAll(view), '=ctrl+alt+enter:replace all'));
  line3.append(...flags, dv(), all);
  line2.hidden = true;
  line3.hidden = !more;
  dom.append(line1, line2, line3);

  function commit(over: Partial<{ caseSensitive: boolean; wholeWord: boolean; regexp: boolean }> = {}) {
    const q = L.getSearchQuery(view.state);
    const nq = new L.SearchQuery({ search: find.input.value, replace: rep.input.value, caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regexp: q.regexp, literal: q.literal, ...over });
    if (!nq.eq(q)) view.dispatch({ effects: L.setSearchQuery.of(nq) });
  }
  function replace(on: boolean) {
    line2.hidden = !on;
    repBtn.classList.toggle('on', on);
    (on ? rep.input : find.input).focus();
    if (on) rep.input.select();
  }
  function setMore(on: boolean) {
    more = on;
    store.set('find.more', on);
    line3.hidden = !on;
    show();
  }
  function counted() {
    const q = L.getSearchQuery(view.state);
    if (!q.search || !q.valid) return '';
    const sel = view.state.selection.main, cur = q.getCursor(view.state) as Iterator<{ from: number; to: number }>;
    let n = 0, at = 0;
    for (let r = cur.next(); !r.done; r = cur.next()) {
      n++;
      if (!at && r.value.from === sel.from && r.value.to === sel.to) at = n;
      if (n >= CAP) return `${CAP}+`;
    }
    return n ? `${at || '-'} of ${n}` : 'none';
  }
  function show() {
    const q = L.getSearchQuery(view.state);
    if (document.activeElement !== find.input && find.input.value !== q.search) find.input.value = q.search;
    if (document.activeElement !== rep.input && rep.input.value !== q.replace) rep.input.value = q.replace;
    for (const b of flags) b.classList.toggle('on', !!q[b.dataset.k as 'caseSensitive']);
    moreBtn.classList.toggle('on', more);
    moreBtn.classList.toggle('dot', !more && (q.caseSensitive || q.wholeWord || q.regexp));
    const t = counted();
    count.textContent = t;
    count.classList.toggle('none', t === 'none');
  }
  const keys = (e: KeyboardEvent, input: HTMLInputElement) => {
    if (L.runScopeHandlers(view, e, 'search-panel')) return e.preventDefault();
    const go = (f: (v: EditorView) => boolean) => (e.preventDefault(), f(view));
    if (e.key === 'Escape') return go(L.closeSearchPanel);
    if (e.key !== 'Enter') return;
    if (input === rep.input) return go(e.ctrlKey && e.altKey ? L.replaceAll : L.replaceNext);
    go(e.altKey ? L.selectMatches : e.shiftKey ? L.findPrevious : L.findNext);
  };
  for (const f of [find, rep]) {
    f.input.oninput = () => commit();
    f.input.onkeydown = (e) => keys(e, f.input);
  }
  ctl.set(view, { replace });
  show();
  return {
    dom,
    top: true,
    mount: () => (find.input.focus(), find.input.select()),
    update: (u: ViewUpdate) => {
      if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.some((x) => x.is(L.setSearchQuery)))) show();
    },
    destroy: () => ctl.delete(view),
  };
}
