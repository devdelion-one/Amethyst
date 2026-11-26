import { QUOTE_RE, quoteSplit, refLabel, refText } from './chattext.ts';
import { chipCopy, chipX, copy, fileTag, imgTag, notPicture, pastedImages, readB64 } from './chips.ts';
import { refuse } from './notify.ts';
import { barMenu, imgHover, rowIcons, viewImage } from './controls.ts';
import { fmtKey, attach } from './fmt.ts';
import { follow as followLink, here, linkMenu, openDefault, showPath } from './follow.ts';
import { FILE_EXT, IMG_MD, imgLink, imgsIn, LINK_RE, linkAt, outKeys, outTo, relIn, withHint } from './links.ts';
import { markdown } from './markdown.ts';
import { codeNav, problemMarks } from './codemarks.ts';
import { fileSaved } from './checkers.ts';
import { barParts, codeParts } from './codeparts.ts';
import { reviewMarks } from './reviewmarks.ts';
import { span } from './hitch.ts';
import { api, atWs, imgUrl, levelKey, projectOf, S, sizeOf } from './model.ts';
import { page } from './page.ts';
import { isOff, onPref, pref } from './prefs.ts';
import { SAFE_OPEN } from './files.ts';
import { follow } from './stream.ts';
import { langOf } from './theme.ts';
import { selHide, selShow } from './quote.ts';
import { findBar, openReplace } from './findbar.ts';
import { record } from './undo.ts';
import { esc, now, onSelEnd, parentOf, quietly, saved, setSave, showErr, unsaved } from './util.ts';
import { lockOf, lockText, on, onLock, send } from './windows.ts';
import type { Tab } from './types.ts';
import type * as CM from '/vendor/codemirror.mjs';
import type { Compartment, EditorState, Extension, Range as Ranged } from '@codemirror/state';
import type { EditorView, ViewUpdate, DecorationSet, Decoration, WidgetType } from '@codemirror/view';
import type { CompletionContext } from '@codemirror/autocomplete';

type Live = { path: string; take(content: string): unknown; dirty(): boolean; text(): string; lock(): void; flush(): Promise<unknown> };
type Lib = typeof CM & { look: ReturnType<typeof look> };

const live = new Set<Live>();
const twins = (x: Live) => [...live].filter((o) => o !== x && o.path === x.path);
on('text', (m) => {
  if (m.kind !== 'text' || m.lvl !== levelKey()) return;
  for (const x of live) if (x.path === m.path) x.take(m.content);
});
on('want', (m) => {
  if (m.lvl !== levelKey()) return;
  const x = [...live].find((o) => o.path === m.path && o.dirty());
  if (x) send('text', { kind: 'text', lvl: m.lvl, path: m.path, content: x.text() });
});
onLock(() => live.forEach((x) => x.lock()));
const FOLD_WORDS = { fold: 'Fold\nFolds the lines under this one.', unfold: 'Unfold\nShows the folded lines again.' };
export const flushTexts = () => Promise.all([...live].map((x) => x.flush()));

let lib = null as Promise<Lib> | null;
function cm() {
  if (!lib) {
    lib = import('/vendor/codemirror.mjs').then((L) => ({ ...L, look: look(L) }));
    lib.catch(() => (lib = null));
  }
  return lib;
}
export const warmCode = () => quietly(cm());
export const codeLib = () => cm();

const ROLE_TAGS = (t: typeof CM.tags) => ({
  keyword: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.self],
  declaration: t.definitionKeyword,
  modifier: t.modifier,
  type: [t.typeName, t.className, t.tagName],
  builtin: [t.standard(t.typeName), t.standard(t.variableName)],
  namespace: t.namespace,
  function: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))],
  member: [t.propertyName, t.attributeName],
  variable: [t.variableName, t.definition(t.variableName), t.labelName],
  string: [t.string, t.special(t.string), t.character, t.regexp, t.escape],
  number: [t.number, t.bool, t.null, t.atom, t.unit, t.literal],
  comment: t.comment,
  preproc: [t.processingInstruction, t.meta],
  macro: [t.macroName, t.special(t.name), t.annotation],
  operator: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator],
});

function look(L: typeof CM) {
  const t = L.tags, mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
  return [
    findBar(L),
    L.EditorView.theme({
      '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--bg)', fontSize: 'var(--code-size)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.55' },
      '.cm-content:focus-visible': { outline: 'none' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: mix('var(--accent)', 28) },
      '.cm-content': { caretColor: 'var(--accent)' },
      '.cm-gutters': { backgroundColor: `color-mix(in srgb, var(--text) 3%, var(--bg))`, color: 'color-mix(in srgb, var(--text-dim) 80%, var(--bg))', border: 'none' },
      '.cm-lineNumbers': { fontSize: 'calc(var(--code-size) - 2px)' },
      '.cm-lineNumbers .cm-gutterElement': { minWidth: '0', padding: '0' },
      '.cm-num': { display: 'block', boxSizing: 'border-box', minWidth: 'calc(3ch + 14px)', padding: '0 6px 0 8px', lineHeight: 'calc(var(--code-size) * 1.55)' },
      '.cm-num-h1 .cm-num': { lineHeight: 'calc(var(--code-size) * 1.55 * 1.4)' },
      '.cm-num-h2 .cm-num': { lineHeight: 'calc(var(--code-size) * 1.55 * 1.2)' },
      '.cm-num-h3 .cm-num': { lineHeight: 'calc(var(--code-size) * 1.55 * 1.08)' },
      '.cm-num-fold': { cursor: 'pointer' },
      '.cm-num-fold:hover': { color: 'var(--text-strong)' },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '&.cm-focused .cm-activeLine': { backgroundColor: mix('var(--text)', 3) },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
      '&.cm-focused .cm-activeLineGutter': { backgroundColor: mix('var(--text)', 3) },
      '.cm-foldPlaceholder': { backgroundColor: 'var(--hover)', border: '1px solid var(--line)', color: 'var(--text-dim)' },
      '&.cm-focused .cm-matchingBracket': { backgroundColor: mix('var(--accent)', 22), outline: '1px solid ' + mix('var(--accent)', 50) },
      '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: mix('var(--danger)', 25) },
      '.cm-selectionMatch': { backgroundColor: mix('var(--accent)', 14) },
      '.cm-searchMatch': { backgroundColor: mix('var(--warn)', 25), outline: '1px solid ' + mix('var(--warn)', 55) },
      '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: mix('var(--accent)', 40) },
      '.cm-panels': { backgroundColor: 'var(--raised)', color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)' },
      '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
      '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
      '.cm-panel input, .cm-panel button, .cm-panel label': { fontSize: 'var(--fs-sm)' },
      '.cm-panel label': { display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)' },
      '.cm-textfield': { height: '24px', backgroundColor: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' },
      '.cm-panel button': { minHeight: '24px', height: '24px', padding: '0 8px' },
      '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--hover)', color: 'var(--text)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)' },
      '.cm-tooltip': { backgroundColor: 'var(--tip-bg)', color: 'var(--text)', border: 'none', borderRadius: 'var(--tip-r)', boxShadow: 'var(--tip-shadow)' },
      '.cm-tooltip.cm-tooltip-autocomplete': { padding: '4px', borderRadius: 'var(--r-lg)', boxShadow: 'var(--float)' },
      '.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--mono)', maxHeight: '18em', minWidth: '16em' },
      '.cm-tooltip-autocomplete > ul > li': { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 10px 3px 6px', lineHeight: '1.55', borderRadius: 'var(--r-sm)' },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: mix('var(--accent)', 26), color: 'var(--text-strong)' },
      '.cm-completionIcon': { width: 'auto', padding: '0', opacity: '0.55', fontSize: '0.85em' },
      '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--accent)', fontWeight: '600' },
      'li[aria-selected] .cm-completionMatchedText': { color: 'inherit' },
      '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '1.5em', fontStyle: 'normal', fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'var(--text-dim)' },
      '.cm-tooltip.cm-completionInfo': { padding: '8px 12px', maxWidth: '380px', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', lineHeight: '1.45', borderRadius: 'var(--r-lg)', boxShadow: 'var(--float)' },
      '.cm-macro, .cm-macro *': { color: 'var(--code-macro)', fontWeight: 'var(--code-macro-b)', fontStyle: 'var(--code-macro-i)' },
      '.cm-builtin, .cm-builtin *': { color: 'var(--code-builtin)', fontWeight: 'var(--code-builtin-b)', fontStyle: 'var(--code-builtin-i)' },
      '.cm-md-fence': { backgroundColor: mix('var(--text)', 5) },
      '.cm-md-fence *': { backgroundColor: 'transparent' },
      '.cm-md-code': { backgroundColor: mix('var(--accent)', 10), borderRadius: 'var(--r-xs)' },
      '.cm-md-tick, .cm-md-tick *': { color: mix('var(--text-faint)', 45), backgroundColor: 'transparent' },
      '.cm-content.pm-mod .cm-pm-link': { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px', cursor: 'pointer' },
    }),
    L.syntaxHighlighting(
      L.HighlightStyle.define([
        ...Object.entries(ROLE_TAGS(t)).map(([role, tag]) => ({ tag, color: `var(--code-${role})`, fontWeight: `var(--code-${role}-b)`, fontStyle: `var(--code-${role}-i)` })),
        { tag: [t.processingInstruction, t.contentSeparator, t.url], color: 'var(--text-faint)', fontWeight: 'normal', fontStyle: 'normal' },
        { tag: t.heading, color: 'var(--text-strong)', fontWeight: 'bold' },
        { tag: t.heading1, fontSize: '1.4em' },
        { tag: t.heading2, fontSize: '1.2em' },
        { tag: t.heading3, fontSize: '1.08em' },
        { tag: t.strong, color: 'var(--text-strong)', fontWeight: 'bold' },
        { tag: t.emphasis, fontStyle: 'italic' },
        { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-dim)' },
        { tag: t.monospace, color: 'var(--accent)' },
        { tag: t.quote, color: 'var(--text-dim)' },
        { tag: t.link, color: 'var(--accent)' },
        { tag: t.invalid, color: 'var(--danger)' },
      ]),
    ),
  ];
}

const foldIn = (L: Lib, state: EditorState, from: number, to: number) => {
  let hit = null as { from: number; to: number } | null;
  L.foldedRanges(state).between(from, to, (a, b) => {
    if (!hit || hit.from > a) hit = { from: a, to: b };
  });
  return hit as { from: number; to: number } | null;
};
const headingAt = (L: Lib, state: EditorState, from: number, to: number) => {
  let level = 0;
  L.syntaxTree(state).iterate({ from, to, enter: (n) => void (level ||= +(/^(?:ATX|Setext)Heading([1-3])$/.exec(n.name)?.[1] || 0)) });
  return level;
};

export function lineNumbers(L: Lib, folds: boolean): Extension {
  class Num extends L.GutterMarker {
    n: string;
    tip: string;
    elementClass: string;
    constructor(n: string, tip = '', cls = '') {
      super();
      this.n = n;
      this.tip = tip;
      this.elementClass = cls;
    }
    eq(o: Num) {
      return this.n === o.n && this.tip === o.tip && this.elementClass === o.elementClass;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'cm-num';
      el.textContent = this.n;
      if (this.tip) el.title = this.tip, el.dataset.tipIcon = this.tip === FOLD_WORDS.fold ? 'foldAll' : 'unfoldAll';
      return el;
    }
  }
  const widest = (state: EditorState) => '9'.repeat(Math.max(3, String(state.doc.lines).length));
  return L.gutter({
    class: 'cm-lineNumbers',
    lineMarker(v, b) {
      const { state } = v, line = state.doc.lineAt(b.from);
      const tip = !folds ? '' : foldIn(L, state, b.from, b.to) ? FOLD_WORDS.unfold : L.foldable(state, b.from, b.to) ? FOLD_WORDS.fold : '';
      const h = headingAt(L, state, line.from, line.to);
      return new Num(String(line.number), tip, [h && `cm-num-h${h}`, tip && 'cm-num-fold'].filter(Boolean).join(' '));
    },
    lineMarkerChange: (u) => L.syntaxTree(u.startState) !== L.syntaxTree(u.state) || L.foldedRanges(u.startState) !== L.foldedRanges(u.state) || u.startState.facet(L.language) !== u.state.facet(L.language),
    initialSpacer: (v) => new Num(widest(v.state)),
    updateSpacer: (was, u) => ((was as Num).n === widest(u.state) ? was : new Num(widest(u.state))),
    domEventHandlers: {
      mousedown(v, b, ev) {
        const e = ev as MouseEvent;
        if (!folds || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return false;
        const shut = foldIn(L, v.state, b.from, b.to), open = shut ? null : L.foldable(v.state, b.from, b.to);
        if (!shut && !open) return false;
        v.dispatch({ effects: shut ? L.unfoldEffect.of(shut) : L.foldEffect.of(open!) });
        return true;
      },
    },
  });
}

export async function codeView(parent: HTMLElement, name: string, doc: string) {
  const L = await cm();
  return new L.EditorView({ parent, state: L.EditorState.create({ doc, extensions: [L.languageFor(name), L.look, /\.(md|markdown)$/i.test(name) ? mdLook(L) : [], L.EditorState.readOnly.of(true), L.EditorView.editable.of(false)] }) });
}

export async function noteView(parent: HTMLElement, doc: string, more: (L: Lib) => Extension) {
  const L = await cm();
  const extensions = [more(L), L.codeSetup, lineNumbers(L, true), L.languageFor('.md'), L.look, mdLook(L), L.EditorView.lineWrapping, linkDeco(L), atDeco(L), atFiles(L), imgChips(L), pathChips(L)];
  return new L.EditorView({ parent, state: L.EditorState.create({ doc, extensions }) });
}

export function chatBox(host: HTMLElement & { takes?: ((e: DragEvent) => boolean) | null }, { label, acts }: { label: string; acts: ChipActs }) {
  let view = null as EditorView | null, L = null as Lib | null, comp = null as { ed: Compartment; ph: Compartment } | null, text = '', sel = [0, 0], want = false, off = false, hint = '';
  const doc = () => (view ? view.state.doc.toString() : text);
  const range = () => (view ? view.state.selection.main : { anchor: sel[0], head: sel[1], from: Math.min(...sel), to: Math.max(...sel) });
  const fmt = {
    el: host,
    get: () => ({ text: doc(), from: range().from, to: range().to }),
    put: (from: number, to: number, insert: string, a: number, b: number) => view?.dispatch({ changes: { from, to, insert }, selection: { anchor: a, head: b }, userEvent: 'input' }),
    at() {
      const c = view?.coordsAtPos(view.state.selection.main.head) || host.getBoundingClientRect();
      return { x: c.left, y: c.bottom, top: c.top };
    },
  };
  const editable = () => [L!.EditorView.editable.of(!off), L!.EditorState.readOnly.of(off)];
  const exts = () => [
    L!.keymap.of([
      { key: 'Mod-b', run: () => fmtKey(fmt, { ctrlKey: true, key: 'b' }) },
      { key: 'Shift-Enter', run: (v) => (v.dispatch(v.state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input' }), true) },
    ]),
    L!.minimalSetup,
    L!.EditorView.lineWrapping,
    L!.EditorView.contentAttributes.of({ 'aria-label': label }),
    comp!.ed.of(editable()),
    comp!.ph.of(hint ? L!.placeholder(hint) : []),
    L!.EditorView.updateListener.of((u) => u.docChanged && span('box.input', () => host.dispatchEvent(new Event('input')))),
    L!.EditorView.domEventHandlers({ dragover: (e) => !!host.takes?.(e), drop: (e) => !!host.takes?.(e) }),
    imgChips(L!, acts),
    fileChips(L!, acts),
    pathChips(L!, acts),
    quoteChips(L!, acts),
  ];
  host.addEventListener('input', (e) => e.isTrusted && e.stopPropagation(), true);
  cm()
    .then((lib) => {
      L = lib;
      comp = { ed: new L.Compartment(), ph: new L.Compartment() };
      view = new L.EditorView({ parent: host, state: L.EditorState.create({ doc: text, selection: { anchor: Math.min(sel[0], text.length), head: Math.min(sel[1], text.length) }, extensions: exts() }) });
      if (want) view.focus();
      host.dispatchEvent(new Event('ready'));
    })
    .catch(showErr);
  const api = {
    fmt,
    takes: null as ((e: DragEvent) => boolean) | null,
    get value() {
      return doc();
    },
    set value(v: string) {
      v = String(v);
      if (!view) {
        text = v;
        sel = [v.length, v.length];
        return;
      }
      view.setState(L!.EditorState.create({ doc: v, selection: { anchor: v.length }, extensions: exts() }));
    },
    get selectionStart() {
      return range().from;
    },
    get selectionEnd() {
      return range().to;
    },
    get selectionDirection() {
      return range().anchor > range().head ? 'backward' : 'forward';
    },
    setSelectionRange(a: number, b: number, dir?: string) {
      if (!view) return void (sel = dir === 'backward' ? [b, a] : [a, b]);
      view.dispatch({ selection: dir === 'backward' ? { anchor: b, head: a } : { anchor: a, head: b }, scrollIntoView: true });
    },
    setRangeText(t: string, a: number, b: number) {
      if (view) view.dispatch({ changes: { from: a, to: b, insert: t }, selection: { anchor: a + t.length }, userEvent: 'input' });
      else (text = text.slice(0, a) + t + text.slice(b)), (sel = [a + t.length, a + t.length]);
    },
    posAt: (x: number, y: number) => view?.posAtCoords({ x, y }) ?? null,
    get disabled() {
      return off;
    },
    set disabled(v: boolean) {
      if (off === !!v) return;
      off = !!v;
      host.classList.toggle('off', off);
      view?.dispatch({ effects: comp!.ed.reconfigure(editable()) });
    },
    set placeholder(v: string) {
      hint = v;
      view?.dispatch({ effects: comp!.ph.reconfigure(hint ? L!.placeholder(hint) : []) });
    },
    focus() {
      if (view) view.focus();
      else want = true;
    },
    focused: () => host.contains(document.activeElement),
    showMatch(r: Range) {
      if (view) view.dispatch({ effects: L!.EditorView.scrollIntoView(view.posAtDOM(r.startContainer, r.startOffset), { y: 'center' }) });
    },
    selectMatch(r: Range) {
      if (!view) return;
      view.focus();
      try {
        view.dispatch({ selection: { anchor: view.posAtDOM(r.startContainer, r.startOffset), head: view.posAtDOM(r.endContainer, r.endOffset) }, scrollIntoView: true });
      } catch {}
    },
  };
  return Object.defineProperties(host, Object.getOwnPropertyDescriptors(api)) as typeof host & typeof api;
}

const mdLook = (L: Lib) => {
  const band = L.Decoration.line({ class: 'cm-md-fence' });
  const code = L.Decoration.mark({ class: 'cm-md-code' }), tick = L.Decoration.mark({ class: 'cm-md-tick' });
  const lines = (v: EditorView) => {
    const out: Ranged<Decoration>[] = [], doc = v.state.doc;
    for (const { from, to } of v.visibleRanges)
      L.syntaxTree(v.state).iterate({
        from,
        to,
        enter(n) {
          if (n.name === 'InlineCode') {
            const marks = n.node.getChildren('CodeMark');
            if (marks.length < 2) return false;
            const a = marks[0], b = marks[marks.length - 1];
            out.push(tick.range(a.from, a.to), tick.range(b.from, b.to));
            if (a.to < b.from) out.push(code.range(a.to, b.from));
            return false;
          }
          if (n.name !== 'FencedCode') return;
          for (let at = doc.lineAt(Math.max(n.from, from)); ; at = doc.line(at.number + 1)) {
            out.push(band.range(at.from));
            if (at.to >= Math.min(n.to, to) || at.number === doc.lines) break;
          }
          return false;
        },
      });
    return L.Decoration.set(out, true);
  };
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = lines(v);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || L.syntaxTree(u.startState) !== L.syntaxTree(u.state)) this.decorations = lines(u.view);
      }
    },
    { decorations: (p) => p.decorations },
  );
};

const linkDeco = (L: Lib) => {
  const deco = new L.MatchDecorator({ regexp: new RegExp(LINK_RE), decoration: L.Decoration.mark({ class: 'cm-pm-link' }) });
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = deco.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = deco.updateDeco(u, this.decorations);
      }
    },
    { decorations: (p) => p.decorations },
  );
};
const replaced = (L: Lib, regexp: RegExp, widgetOf: (m: RegExpExecArray) => WidgetType | null) => {
  const deco = new L.MatchDecorator({ regexp: new RegExp(regexp), decoration: (m: any) => ((m = widgetOf(m)) ? L.Decoration.replace({ widget: m }) : null) });
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = deco.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = deco.updateDeco(u, this.decorations);
      }
    },
    { decorations: (p) => p.decorations, provide: (p) => L.EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? L.Decoration.none) },
  );
};
const removeChip = (view: EditorView, el: Element, len: number) => {
  try {
    const from = view.posAtDOM(el);
    view.dispatch({ changes: { from, to: from + len }, userEvent: 'delete' });
    view.focus();
  } catch {}
};
const keepCaret = (e: MouseEvent) => (e.target as Element).closest('.chip-x, .img-copy') && e.preventDefault();
const chipSel = (L: Lib) =>
  L.EditorView.updateListener.of((u) => {
    if (!u.selectionSet && !u.docChanged && !u.viewportChanged && !u.focusChanged) return;
    const v = u.view, rs = v.state.selection.ranges.filter((r) => !r.empty);
    for (const el of v.contentDOM.querySelectorAll('.img-chip, .quote-chip')) {
      let at = -1;
      if (rs.length) try { at = v.posAtDOM(el); } catch {}
      el.classList.toggle('sel', rs.some((r) => at >= r.from && at < r.to));
    }
  });
const imgChips = (L: Lib, acts: ChipActs = {}) => {
  class Chip extends L.WidgetType {
    declare rel: string;
    declare len: number;
    constructor(rel: string, len: number) {
      super();
      this.rel = rel;
      this.len = len;
    }
    eq(o: Chip) {
      return o.rel === this.rel && o.len === this.len;
    }
    toDOM(view: EditorView) {
      const t = document.createElement('template'), { rel, len } = this, url = (acts.url || imgUrl)(rel);
      t.innerHTML = imgTag(rel, url);
      const el = t.content.firstChild as HTMLElement;
      el.addEventListener('mouseenter', () => imgHover(el, url, rel));
      el.addEventListener('mouseleave', () => imgHover(null));
      el.addEventListener('mousedown', keepCaret);
      el.addEventListener('click', (e) => {
        const b = (e.target as Element).closest('.img-copy');
        if ((e.target as Element).closest('.chip-x')) removeChip(view, el, len);
        else if (b) copy(imgLink(rel), b, url);
        else viewImage(url, imgLink(rel));
      });
      if (acts.menu) el.addEventListener('contextmenu', (e) => (e.preventDefault(), acts.menu!(e, rel, 'img')));
      return el;
    }
  }
  return [replaced(L, IMG_MD, (m) => new Chip(m[1] || m[2], m[0].length)), chipSel(L)];
};
type ChipActs = { url?: (rel: string) => string; menu?: (e: MouseEvent, rel: string, kind: string) => void; known?: (rel: string) => boolean; open?: (rel: string, e: MouseEvent) => void; tip?: (rel: string) => string; quote?: (text: string) => void };
const PATH_LINE = /^(?:[A-Za-z]:[\\/][^\n]*?|\/[^\s/]+(?:\/[^\s/]+)+)(?=[ \t]*$)/;
const pathOk = (p: string) => !/^[A-Za-z]:/.test(p) || !/\s/.test(p.split(/[\\/]/).pop()!) || FILE_EXT.test(p);
const pathChips = (L: Lib, acts?: ChipActs) => {
  class Chip extends L.WidgetType {
    declare abs: string;
    declare len: number;
    constructor(abs: string, len: number) {
      super();
      this.abs = abs;
      this.len = len;
    }
    eq(o: Chip) {
      return o.abs === this.abs && o.len === this.len;
    }
    toDOM(view: EditorView) {
      const t = document.createElement('template'), { abs, len } = this;
      t.innerHTML = fileTag(abs.replace(/\\/g, '/'));
      const el = t.content.firstChild as HTMLElement;
      const rel = projectRel(abs);
      el.title = rel != null && acts?.known?.(rel) ? withHint(rel) : `${abs}\nA file outside the project, named in your message.`;
      el.dataset.tipOut = outTo();
      el.dataset.tipKeys = outKeys();
      el.setAttribute('data-tip-mono', '');
      el.addEventListener('mousedown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => {
        const b = (e.target as Element).closest('.img-copy'), rel = projectRel(abs);
        if ((e.target as Element).closest('.chip-x')) removeChip(view, el, len);
        else if (b) (copy as (text: string, b: Element, pic?: string) => Promise<unknown>)(abs, b);
        else if (rel != null && acts?.known!(rel)) acts.open!(rel, e);
      });
      return el;
    }
  }
  const build = (v: EditorView) => {
    const doc = v.state.doc, caret = v.hasFocus ? doc.lineAt(v.state.selection.main.head).number : -1, out: Ranged<Decoration>[] = [];
    let done = 0;
    for (const { from, to } of v.visibleRanges) {
      for (let n = Math.max(doc.lineAt(from).number, done + 1), end = doc.lineAt(to).number; n <= end; n++) {
        done = n;
        if (n === caret) continue;
        const line = doc.line(n), m = PATH_LINE.exec(line.text), abs = m?.[0].trimEnd();
        if (abs && pathOk(abs)) out.push(L.Decoration.replace({ widget: new Chip(abs, m![0].length) }).range(line.from, line.from + m![0].length));
      }
    }
    return L.Decoration.set(out);
  };
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = build(v);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.focusChanged || u.viewportChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (p) => p.decorations, provide: (p) => L.EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? L.Decoration.none) },
  );
};
const quoteChips = (L: Lib, acts: ChipActs) => {
  class Chip extends L.WidgetType {
    declare n: number;
    declare text: string;
    declare len: number;
    constructor(n: number, text: string, len: number) {
      super();
      this.n = n;
      this.text = text;
      this.len = len;
    }
    eq(o: Chip) {
      return o.n === this.n && o.text === this.text;
    }
    toDOM(view: EditorView) {
      const el = document.createElement('span'), { text, len } = this, q = quoteSplit(text), ref = q.from != null;
      el.className = 'quote-chip';
      const said = q.text.length > 200 ? q.text.slice(0, 200) + '…' : q.text;
      el.title = ref ? `${q.from!.replace(/^terminal · /, 'Terminal output: ').replace(/^terminal$/, 'Terminal output')}\n“${said}”` : `Quote ${this.n}\n“${said}”\nClick to show where it is in the chat.`;
      el.innerHTML = `<span class="in">${chipX}<span class="qn">${this.n}</span><span class="qt">${esc(ref ? refLabel(q.from!) : text)}</span>${ref ? chipCopy('reference') : ''}</span>`;
      el.addEventListener('mousedown', keepCaret);
      el.addEventListener('click', (e) => {
        const b = (e.target as Element).closest('.img-copy');
        if ((e.target as Element).closest('.chip-x')) removeChip(view, el, len);
        else if (b) (copy as (text: string, b: Element, pic?: string) => Promise<unknown>)(refText(q.from!, q.text), b);
        else if (!ref) acts.quote?.(text);
      });
      return el;
    }
  }
  const build = (v: EditorView) => {
    let n = 0;
    return L.Decoration.set([...v.state.doc.toString().matchAll(QUOTE_RE)].map((m) => L.Decoration.replace({ widget: new Chip(++n, m[1], m[0].length) }).range(m.index, m.index + m[0].length)));
  };
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = build(v);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = build(u.view);
      }
    },
    { decorations: (p) => p.decorations, provide: (p) => L.EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? L.Decoration.none) },
  );
};
const fileChips = (L: Lib, acts: ChipActs) => {
  class Chip extends L.WidgetType {
    declare rel: string;
    constructor(rel: string) {
      super();
      this.rel = rel;
    }
    eq(o: Chip) {
      return o.rel === this.rel;
    }
    toDOM(view: EditorView) {
      const t = document.createElement('template'), { rel } = this;
      t.innerHTML = fileTag(rel);
      const el = t.content.firstChild as HTMLElement;
      el.title = acts.tip!(rel);
      el.dataset.tipOut = outTo();
      el.dataset.tipKeys = outKeys();
      el.setAttribute('data-tip-mono', '');
      el.draggable = true;
      el.dataset.drag = 'link:' + rel;
      el.addEventListener('dragend', (e) => {
        if (e.dataTransfer!.dropEffect === 'none') return;
        try {
          const from = view.posAtDOM(el), to = from + 1 + rel.length;
          if (view.state.sliceDoc(from, to) === '@' + rel) view.dispatch({ changes: { from, to }, userEvent: 'delete' });
        } catch {}
      });
      el.addEventListener('mousedown', keepCaret);
      el.addEventListener('click', (e) => {
        const b = (e.target as Element).closest('.img-copy');
        if ((e.target as Element).closest('.chip-x')) removeChip(view, el, 1 + rel.length);
        else if (b) (copy as (text: string, b: Element, pic?: string) => Promise<unknown>)(rel, b);
        else acts.open!(rel, e);
      });
      el.addEventListener('contextmenu', (e) => (e.preventDefault(), acts.menu!(e, rel, 'file')));
      return el;
    }
  }
  return replaced(L, AT_RE, (m) => (acts.known!(m[0].slice(1)) ? new Chip(m[0].slice(1)) : null));
};
export async function saveImages(files: File[], over: Element = document.body) {
  const paths: string[] = [];
  for (const f of files) {
    const no = notPicture(f);
    if (no) refuse(over, no);
    else {
      try {
        const name = /^image\.\w+$/i.test(f.name) ? '' : f.name;
        paths.push((await api('POST', '/api/image', { name, mimeType: f.type, data: await readB64(f) })).path);
      } catch (e) {
        showErr(e);
      }
    }
  }
  return paths;
}
function linkUnder(view: EditorView, e: MouseEvent, at: boolean) {
  const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
  if (pos == null) return null;
  const line = view.state.doc.lineAt(pos), x = pos - line.from, hit = linkAt(line.text, x);
  if (hit?.kind === 'url' || hit?.kind === 'rel') return hit;
  if (!at) return null;
  for (const m of line.text.matchAll(AT_RE)) if (x >= m.index && x <= m.index + m[0].length && known(m[0].slice(1))) return { kind: 'at', href: m[0].slice(1) };
  return null;
}

const AT_RE = /(?<!\S)@\S+?(?=[.,;:!?)]*(?:\s|$))/g;
const known = (p: string) => S.thoughts.has(p) || S.dirs.has(p.endsWith('/') ? p.slice(0, -1) : p);
const atDeco = (L: Lib) => {
  const mark = L.Decoration.mark({ class: 'cm-pm-link' });
  const deco = new L.MatchDecorator({ regexp: new RegExp(AT_RE), decoration: (m) => (known(m[0].slice(1)) ? mark : null) });
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = deco.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = deco.updateDeco(u, this.decorations);
      }
    },
    { decorations: (p) => p.decorations },
  );
};
const atData = [
  {
    autocomplete: (c: CompletionContext) => {
      const m = c.matchBefore(/(?<!\S)@[^\s@]*/);
      if (!m) return null;
      const q = m.text.slice(1).toLowerCase(), first = (t: { name: string }) => (t.name.toLowerCase().startsWith(q) ? 0 : 1);
      const fit = [...S.thoughts.values(), ...[...S.dirs.values()].filter((d) => d.path).map((d) => ({ path: d.path + '/', name: d.name }))].filter((t) => t.path.toLowerCase().includes(q)).sort((a, b) => first(a) - first(b) || a.path.localeCompare(b.path));
      return { from: m.from, filter: false, options: fit.slice(0, 50).map((t) => ({ label: '@' + t.path, apply: '@' + t.path + ' ' })) };
    },
  },
];
const atFiles = (L: Lib) => L.EditorState.languageData.of(() => atData);
export const projectRel = (abs: string, root = projectOf(S.pid)?.path) => relIn(abs, root);

export function fileCard(abs: string, { size, pic = '', note = '' }: { size?: number | null; pic?: string; note?: string }) {
  const name = abs.split(/[\\/]/).pop(), a = esc(abs);
  const open = SAFE_OPEN.test(abs) ? `<button class="outline" data-card="open" data-abs="${a}">open with default app</button>` : '';
  return `<div class="tx-view fcard">${pic}<p><b>${esc(name)}</b> <span class="dim">${esc([size != null && sizeOf(size), note].filter(Boolean).join(' · '))}</span></p><p class="dim" data-tip-mono data-tip-cut title="${a}">${a}</p><div class="fc-btns">${open}<button class="outline" data-card="show" data-abs="${a}">show in Explorer</button></div></div>`;
}
document.addEventListener('click', (e) => {
  const b = (e.target as Element).closest('[data-card]') as HTMLElement;
  if (b) (b.dataset.card === 'open' ? openDefault : showPath)(b.dataset.abs!);
});

barMenu('.tx-bar', 'txbar');

const hists = new Map<string, { text: string; json: unknown }>();
function histKeep(k: string, text: string, json: unknown) {
  hists.delete(k);
  hists.set(k, { text, json });
  while (hists.size > 30) hists.delete(hists.keys().next().value!);
}
function histTake(k: string, text: string) {
  const h = hists.get(k);
  hists.delete(k);
  return h && h.text === text ? h.json : null;
}

export const txBar = (ext: boolean, md: boolean, path = '') => `<div class="tx-bar"><span class="tx-path">${esc(path)}</span><span class="tx-state dim"></span><span class="tx-rev" hidden></span><span class="grow"></span><span class="tx-disk" hidden></span>${ext ? '<button class="outline tx-move" data-tx="move" hidden>move to project</button>' : ''}${md ? '<button class="outline tx-pv" data-tx="preview" title="Preview\nShows the text as it reads, read only.">preview</button>' : ''}<span class="tx-extra"></span></div>`;
export function createText(tab: Tab, { openFile = (p: string) => page.openInTab(p, { beside: true }) }: { openFile?: (p: string) => unknown } = {}) {
  const el = document.createElement('div');
  el.className = 'textfile';
  const ext = tab.type === 'ext', file = (ext ? tab.abs : tab.path) as string;
  const md = /\.(md|markdown)$/i.test(file);
  el.innerHTML = `${txBar(ext, md)}<div class="tx-wrap"></div>${md ? '<div class="tx-preview ch-ai" hidden><div class="md"></div></div>' : ''}`;
  const $ = (s: string) => el.querySelector(s) as HTMLElement;
  const disk = $('.tx-disk');
  let view = null as EditorView | null, mtime = null as number | null, dirty = false, timer = 0, loading = null as Promise<any> | null, saving = Promise.resolve();
  let writing = 0;
  let quiet = false;
  let wantFocus = false, wantLine = 0;
  let locked = 0, sendTimer = 0;
  let viewed = false, unfollow = null as (() => void) | null;
  let unpref = null as (() => void) | null, stopped = false;
  let keepHist = null as (() => void) | null;
  let marks = null as ReturnType<typeof reviewMarks> | null;
  const absNow = () => {
    const root = projectOf(S.pid)?.path;
    return ext ? tab.abs! : root ? root.replace(/[\\/]+$/, '') + '/' + tab.path : null;
  };

  const state = (t: string) => ($('.tx-state').textContent = t);
  const text = () => view?.state.doc.toString() ?? '';
  let edits = 0;
  function edited() {
    edits++;
    for (const x of twins(me)) x.take(text());
    clearTimeout(sendTimer);
    if (!ext) sendTimer = setTimeout(() => send('text', { kind: 'text', lvl: levelKey(), path: tab.path, content: text() }), 40);
    dirty = true;
    mark();
    unsaved(el, name());
    page.keepTab(tab.id);
    const line = view!.state.doc.lineAt(view!.state.selection.main.head).number;
    if (!ext) record('typing', `typed in “${name()}” at line ${line}`, { path: tab.path, line });
    state('…');
    clearTimeout(timer);
    timer = setTimeout(save, 800);
  }
  const dropped = (e: DragEvent) => {
    const f = [...(e.dataTransfer?.files || [])];
    return !ext && f.length && f.every((x) => x.type.startsWith('image/')) ? f : null;
  };
  async function addImages(v: EditorView, files: File[], from: number, to: number) {
    if (locked) return;
    const insert = (await saveImages(files, v.dom)).map(imgLink).join('\n'), n = v.state.doc.length;
    if (insert) v.dispatch({ changes: { from: Math.min(from, n), to: Math.min(to, n), insert }, selection: { anchor: Math.min(from, n) + insert.length }, userEvent: 'input.paste' });
  }
  function make(L: Lib, content: string) {
    const fbx = {
      get: () => ({ text: { slice: (a: number, b: number) => view!.state.sliceDoc(Math.max(0, a), Math.min(b, view!.state.doc.length)) }, from: view!.state.selection.main.from, to: view!.state.selection.main.to }),
      put: (from: number, to: number, insert: string, a: number, b: number) => view!.dispatch({ changes: { from, to, insert }, selection: { anchor: a, head: b }, userEvent: 'input' }),
      at() {
        const c = view!.coordsAtPos(view!.state.selection.main.head) || view!.dom.getBoundingClientRect();
        return { x: c.left, y: c.bottom, top: c.top };
      },
    };
    const keys = L.keymap.of([
      { key: 'Mod-b', run: () => fmtKey(fbx, { ctrlKey: true, key: 'b' }) },
      { key: 'Tab', run: L.insertTab, shift: L.indentLess },
      { key: 'Mod-s', preventDefault: true, run: () => ((dirty = true), save(), true) },
      { key: 'Mod-g', preventDefault: true, run: (v) => (L.gotoLine(v), v.dom.querySelector<HTMLInputElement>('.cm-goto-line input')?.select(), true) },
      { key: 'Mod-h', preventDefault: true, run: (v) => openReplace(L, v) },
    ]);
    const mentions = !ext && /\.(md|markdown|txt)$/i.test(name());
    const linkTo = (v: EditorView, e: MouseEvent) => {
      const hit = linkUnder(v, e, mentions);
      return hit && (hit.kind === 'at' ? here(hit.href) : here(hit.href, parentOf(ext ? tab.abs!.replace(/\\/g, '/') : tab.path!)));
    };
    marks = reviewMarks(L, absNow, (t: string) => Object.assign($('.tx-rev'), { hidden: !t, textContent: t }));
    const extensions = [
      keys,
      L.codeSetup,
      lineNumbers(L, true),
      marks.ext,
      L.languageFor(name()),
      problemMarks(L, name(), absNow),
      codeParts(L, name(), absNow),
      L.look,
      L.EditorView.lineWrapping,
      L.EditorView.updateListener.of((u) => {
        if (u.docChanged && !quiet) edited();
        if (u.focusChanged && !u.view.hasFocus) save();
      }),
      L.EditorState.transactionFilter.of((tr) => (locked && tr.docChanged && !quiet ? [] : tr)),
      L.EditorView.domEventHandlers({
        paste(e, v) {
          const files = ext ? [] : pastedImages(e);
          if (!files.length || imgsIn(e.clipboardData!.getData('text/plain')).length) return false;
          e.preventDefault();
          const { from, to } = v.state.selection.main;
          addImages(v, files, from, to);
          return true;
        },
        dragover(e) {
          if (!ext && [...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) e.preventDefault();
          return false;
        },
        drop(e, v) {
          const files = dropped(e);
          if (files) {
            e.preventDefault();
            const at = v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.doc.length;
            addImages(v, files, at, at);
            return true;
          }
          return ['application/x-pm-tab', 'application/x-pm-file', 'Files'].some((k) => e.dataTransfer?.types.includes(k));
        },
        mousedown(e, v) {
          if (e.button !== 0 || !(e.ctrlKey || e.metaKey)) return false;
          const to = linkTo(v, e);
          if (!to) return false;
          e.preventDefault();
          return followLink(to, { out: e.shiftKey, openFile });
        },
        contextmenu(e, v) {
          const to = linkTo(v, e);
          return !!to && linkMenu(e, to, { openFile });
        },
      }),
      linkDeco(L),
      codeNav(L, name(), absNow),
      mentions ? [atDeco(L), atFiles(L)] : [],
      ext ? [] : imgChips(L),
      /\.(md|markdown)$/i.test(name()) ? mdLook(L) : [],
    ];
    const mod = (e: MouseEvent | KeyboardEvent) => view?.contentDOM.classList.toggle('pm-mod', e.ctrlKey || e.metaKey);
    $('.tx-wrap').dataset.lang = langOf(name());
    $('.tx-wrap').classList.toggle('prose', /\.(md|markdown|txt)$/i.test(name()));
    const hk = ext ? 'ext:' + tab.abs : levelKey() + ':' + tab.path, was = histTake(hk, content);
    keepHist = () => view && histKeep(hk, view.state.doc.toString(), view.state.toJSON({ history: L.historyField }));
    const start = () => {
      try {
        if (was) return L.EditorState.fromJSON(was, { extensions }, { history: L.historyField });
      } catch {}
      return L.EditorState.create({ doc: content, extensions });
    };
    view = span('editor.file built', () => new L.EditorView({ parent: $('.tx-wrap'), state: start() }));
    marks.attach(view);
    view.dom.classList.toggle('takes-images', !ext);
    (fbx as typeof fbx & { el?: HTMLElement }).el = view.dom;
    attach(fbx, { keys: false });
    const sel = {
      el: view.dom,
      joins: true,
      get() {
        const { from, to } = view!.state.selection.main, text = view!.state.sliceDoc(from, to);
        if (!view!.hasFocus || !text.trim()) return null;
        const doc = view!.state.doc, a = doc.lineAt(from).number, e = doc.lineAt(to), b = e.from === to && e.number > a ? e.number - 1 : e.number;
        return { text: text.replace(/\n+$/, ''), from: `${ext ? tab.abs!.replace(/\\/g, '/') : tab.path}:${a === b ? a : `${a}-${b}`}` };
      },
      at: fbx.at,
      clear: () => view!.dispatch({ selection: { anchor: view!.state.selection.main.head } }),
    };
    const later = () => setTimeout(() => selShow(sel), 0);
    view.dom.addEventListener('keyup', later);
    onSelEnd(view.dom, later);
    view!.dom.addEventListener('focusout', () => setTimeout(() => !view!.dom.contains(document.activeElement) && selHide(sel), 0));
    for (const ev of ['mousemove', 'keydown', 'keyup'] as const) view.dom.addEventListener(ev, mod);
    view!.dom.addEventListener('mouseleave', () => view!.contentDOM.classList.remove('pm-mod'));
    if (wantFocus) view.focus();
    if (wantLine) goLine(wantLine);
    const twin = twins(me).find((x) => x.text());
    if (twin) put(twin.text());
    else if (!ext) send('want', { lvl: levelKey(), path: tab.path });
    if (pv) paint();
  }
  function put(content: string) {
    const old = text();
    let a = 0, b = 0;
    while (a < old.length && a < content.length && old[a] === content[a]) a++;
    while (b < old.length - a && b < content.length - a && old[old.length - 1 - b] === content[content.length - 1 - b]) b++;
    if (a === old.length && a === content.length) return false;
    quiet = true;
    view!.dispatch({ changes: { from: a, to: old.length - b, insert: content.slice(a, content.length - b) } });
    quiet = false;
    if (pv) paint();
    return true;
  }
  function viewer(r: { mtime: number; kind: string; size: number; why?: string }) {
    viewed = true;
    mtime = r.mtime;
    state('');
    const img = r.kind === 'image' ? `<img class="pboard" src="/api/ext/raw?path=${encodeURIComponent(file)}&v=${r.mtime}" alt="" draggable="false">` : '';
    $('.tx-wrap').innerHTML = fileCard(file, { size: r.size, pic: img, note: r.why });
  }
  async function load(discard = false) {
    loading = api('GET', (ext ? '/api/ext' : '/api/file') + '?path=' + encodeURIComponent(file));
    const was = edits;
    try {
      const [L, r] = await Promise.all([cm(), loading]);
      if (stopped) return (loading = null), false;
      if (ext && r.kind !== 'text') {
        loading = null;
        return void viewer(r);
      }
      if (dirty && !discard) {
        loading = null;
        return ask();
      }
      if (edits !== was && !discard) {
        loading = null;
        return false;
      }
      const changed = view ? put(r.content) : (make(L, r.content), false);
      mtime = r.mtime ?? null;
      dirty = false;
      mark();
      saved(el);
      disk.hidden = true;
      state('');
      loading = null;
      return changed;
    } catch (e: any) {
      view?.destroy();
      view = null;
      state(e.message);
    }
    loading = null;
    return false;
  }
  function save(force = false) {
    clearTimeout(timer);
    if (!dirty || !view) return saving;
    const content = text();
    dirty = false;
    writing++;
    saving = saving.then(async () => {
      try {
        const pid = S.pid;
        const r = await api('PUT', ext ? '/api/ext' : '/api/file', { path: file, content, mtime: force ? undefined : mtime ?? undefined }, pid);
        if (!ext) fileSaved(pid, file);
        mtime = r.mtime ?? mtime;
        disk.hidden = true;
        state('saved ' + now());
        saved(el);
        mark();
        if (dirty) unsaved(el, name());
      } catch (e: any) {
        dirty = true;
        state('not saved');
        if (e.status === 409) {
          ask();
          unsaved(el, name(), e);
        } else unsaved(el, name(), e, () => save());
      } finally {
        writing--;
      }
    });
    return saving;
  }
  const name = () => file.split(/[\\/]/).pop()!;
  const barOffs = barParts($('.tx-extra'), name(), absNow);
  const mark = () => document.querySelector(`.tab[data-tab="${tab.id}"]`)?.toggleAttribute('data-dirty', dirty && pref('tabdirty:on'));
  function goLine(n: number) {
    if (!view) return (wantLine = n);
    const l = view.state.doc.line(Math.max(1, Math.min(n, view.state.doc.lines)));
    const box = view.scrollDOM.getBoundingClientRect(), at = view.coordsAtPos(l.from);
    const seen = !!at && at.top >= box.top && at.bottom <= box.bottom;
    const EV = view.constructor as typeof EditorView;
    view.dispatch({ selection: { anchor: l.from }, effects: seen ? [] : EV.scrollIntoView(l.from, { y: 'center' }) });
    view.focus();
  }
  function ask() {
    disk.innerHTML = `${esc(name())} changed on disk <button class="outline" data-tx="reload">reload it</button><button class="quiet" data-tx="keep">keep mine</button>`;
    disk.hidden = false;
    state('not saved');
  }

  let pv = false, pvTop = 0;
  const base = () => parentOf(ext ? file.replace(/\\/g, '/') : tab.path!);
  const pvImg = (src: string, alt = '') => {
    const t = ext || /^[a-z][a-z\d+.-]*:/i.test(src) ? null : here(src, base());
    const rel = /^\.amethyst\//.test(src) ? src : t?.rel;
    return rel ? `<img src="${esc(imgUrl(rel))}" alt="${esc(alt)}">` : null;
  };
  function paint() {
    $('.tx-preview .md').innerHTML = markdown(text(), {
      front: true,
      link: (href, html) => `<a href="#" data-lk="${esc(href)}">${html}</a>`,
      image: (src, alt) => pvImg(src, alt),
      imgPath: (rel) => pvImg(rel) as string,
    });
  }
  function showPreview(on: boolean) {
    on = md && on && !isOff('txbar:off', 'preview');
    if (on === pv) return;
    const wrap = $('.tx-wrap'), box = $('.tx-preview');
    if (on) pvTop = view?.scrollDOM.scrollTop ?? 0;
    pv = on;
    if (on) paint();
    wrap.hidden = on;
    box.hidden = !on;
    $('.tx-pv').classList.toggle('on', on);
    $('.tx-pv').setAttribute('aria-pressed', on as unknown as string);
    if (!on && view) view.scrollDOM.scrollTop = pvTop;
  }
  unpref = onPref('txbar:off', () => {
    if (ext) moveBtn();
    if (!md) return;
    $('.tx-pv').hidden = isOff('txbar:off', 'preview');
    if (isOff('txbar:off', 'preview')) showPreview(false);
  });
  if (md) {
    $('.tx-pv').hidden = isOff('txbar:off', 'preview');
    $('.tx-preview').addEventListener('click', (e) => {
      const a = (e.target as Element).closest<HTMLElement>('[data-lk]');
      if (!a) return;
      e.preventDefault();
      const href = a.dataset.lk!;
      if (href.startsWith('#')) return void [...$('.tx-preview').querySelectorAll<HTMLElement>('[data-anchor]')].find((h) => h.dataset.anchor === decodeURIComponent(href.slice(1)))?.scrollIntoView();
      const to = here(href, base());
      if (to) followLink(to, { out: e.shiftKey, openFile });
    });
  }

  function moveBtn() {
    const b = $('.tx-move'), none = !S.projects.some((p) => !p.missing);
    b.hidden = !atWs() || isOff('txbar:off', 'move') || S.projects.some((p) => projectRel(file, p.path) != null);
    b.classList.toggle('off', none);
    if (none) b.title = 'Move into a project\nThis workspace has no project yet to move the file into.'; else b.removeAttribute('title');
  }

  el.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest('[data-tx]') as HTMLElement;
    if (b?.dataset.tx === 'preview') {
      showPreview(!pv);
      if (!pv) view?.focus();
    }
    if (b?.dataset.tx === 'move') {
      await save();
      if (!dirty) page.moveExt(tab);
    }
    if (b?.dataset.tx === 'reload') {
      clearTimeout(timer);
      load(true);
    }
    if (b?.dataset.tx === 'keep') {
      dirty = true;
      save(true);
    }
  });

  $('.tx-path').textContent = file;
  if (ext) {
    Object.assign($('.tx-path'), { title: file }).setAttribute('data-tip-mono', '');
    unfollow = follow({ path: file }, (e) => {
      if (e.mtime == null) state('not on the disk');
      else if (view || viewed) seen({ mtime: e.mtime });
      else load();
    });
  }
  load();

  const me = {
    path: file,
    text,
    dirty: () => dirty,
    flush: () => save(),
    take: (content: string) => view && put(content),
    lock() {
      locked = lockOf(levelKey(), tab.path as string);
      $('.tx-wrap').classList.toggle('locked', !!locked);
      $('.tx-wrap').dataset.lock = locked ? lockText(locked) : '';
    },
  };
  live.add(me);
  me.lock();

  function seen(th: { mtime?: number | null } | null | undefined) {
    if (!th || loading || writing || mtime == null || !th.mtime || Math.abs(th.mtime - mtime) < 2) return;
    if (!dirty) return load();
    ask();
  }

  return {
    el,
    seen,
    moveBtn,
    focus: () => (view ? view.focus() : (wantFocus = true)),
    goLine,
    text,
    dirty: () => dirty,
    flush: () => save(),
    topLine: () => (view ? view.state.doc.lineAt(view.lineBlockAtHeight(view.scrollDOM.scrollTop).from).number - 1 : 0),
    stop: () => {
      for (const off of barOffs) off();
      marks?.stop();
      live.delete(me);
      unfollow?.();
      unpref?.();
      stopped = true;
      const s = quietly(save());
      keepHist?.();
      view?.destroy();
      return s;
    },
  };
}

rowIcons({
  'txbar:off:preview': () => '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4a2 2 0 1 0 0-4z"/></svg>',
  'txbar:off:move': () => '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4h4.5l1.5 1.5h7v8h-13zM5 9.5h5M8 7.5l2 2-2 2"/></svg>',
});
