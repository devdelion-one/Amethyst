import { checkersFor, onChecksChanged } from './checkers.ts';
import { onPref, pref } from './prefs.ts';
import { tell } from './notify.ts';
import type { Checker } from './checkers.ts';
import type * as CM from '/vendor/codemirror.mjs';
import type { Compartment, StateEffectType, ChangeSpec } from '@codemirror/state';
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view';
import type { Diagnostic } from '@codemirror/lint';
import type { CompletionContext } from '@codemirror/autocomplete';

type Lib = typeof CM;
type Fix = { name: string; changes?: ChangeSpec; run?: () => unknown };
type Abs = () => string | null;
type Label = { at: number; text: string; tip: string };
type Found = { from: number; to: number; severity: Diagnostic['severity']; source?: string; message: string; actions?: Fix[] };

const views = new Set<EditorView>();
const RANK = { error: 3, warning: 2, info: 1, hint: 0 };

function found(list: Checker[], text: string, name: string, abs: Abs) {
  const out: Found[] = [];
  for (const c of list) {
    try {
      out.push(...(c.run(text, name, abs()) || []));
    } catch {}
  }
  return out;
}

function fresh(v: EditorView, list: Checker[], name: string, abs: Abs, d: Found, a: Fix, at: number) {
  const now = found(list, v.state.doc.toString(), name, abs).filter((x) => x.message === d.message && x.actions?.some((y) => y.name === a.name));
  if (!now.length) return tell(v.dom, { title: 'nothing to fix here any more' });
  const best = now.reduce((p, x) => (Math.abs(x.from - at) < Math.abs(p.from - at) ? x : p));
  v.dispatch({ changes: best.actions!.find((y) => y.name === a.name)!.changes, userEvent: 'input' });
}

function lintable(L: Lib, list: Checker[], name: string, abs: Abs) {
  return (view: EditorView): Diagnostic[] => {
    const doc = view.state.doc, n = doc.length;
    return found(list, doc.toString(), name, abs).map((d) => {
      const from = Math.max(0, Math.min(n, d.from)), to = Math.max(from, Math.min(n, d.to));
      return {
        from,
        to,
        severity: d.severity,
        source: d.source,
        message: d.message,
        actions: (d.actions || []).map((a) => ({
          name: a.name,
          apply(v: EditorView, at: number) {
            if (a.run) return void a.run();
            if (v.state.doc === doc) v.dispatch({ changes: a.changes, userEvent: 'input' });
            else fresh(v, list, name, abs, d, a, at);
          },
        })),
      };
    });
  };
}

function labelsOf(list: Checker[], text: string, name: string, abs: Abs) {
  const out: Label[] = [];
  for (const c of list) {
    try {
      out.push(...(c.labels(text, name, abs()) || []));
    } catch {}
  }
  return out;
}

type EndNote = { text: string; severity: string };

function lineTexts(L: Lib, list: Checker[], name: string, abs: Abs, again: StateEffectType<null>) {
  class End extends L.WidgetType {
    declare label: Label | null;
    declare note: EndNote | null;
    constructor(label: Label | null, note: EndNote | null) {
      super();
      this.label = label;
      this.note = note;
    }
    eq(o: End) {
      return o.label?.text === this.label?.text && o.label?.tip === this.label?.tip && o.note?.text === this.note?.text && o.note?.severity === this.note?.severity;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'cm-pm-end';
      if (this.label) {
        const b = document.createElement('span');
        b.className = 'cm-pm-label';
        b.textContent = this.label.text;
        b.title = this.label.tip;
        el.append(b);
      }
      if (this.note) {
        const n = document.createElement('span');
        n.className = `cm-pm-note cm-pm-note-${this.note.severity}`;
        n.textContent = this.note.text;
        el.append(n);
      }
      return el;
    }
    ignoreEvent() {
      return true;
    }
  }
  const tagged = list.filter((c) => c.labels);
  const relabel = L.StateEffect.define<null>();
  const build = (view: EditorView, labels: Label[]) => {
    const mode = pref('marks:text');
    const doc = view.state.doc, ends = new Map<number, { label?: Label; note?: Diagnostic; at: number; start: number }>();
    const slot = (line: { number: number; from: number; to: number }) => {
      let e = ends.get(line.number);
      if (!e) ends.set(line.number, (e = { at: line.to, start: line.from }));
      return e;
    };
    for (const l of labels) {
      const e = slot(doc.lineAt(Math.max(0, Math.min(l.at, doc.length))));
      e.label ||= l;
    }
    if (mode !== 'off') {
      const cursor = mode === 'cursor' ? doc.lineAt(view.state.selection.main.head).number : 0;
      L.forEachDiagnostic(view.state, (d, from) => {
        if (d.severity === 'hint') return;
        const line = doc.lineAt(Math.min(from, doc.length));
        if (cursor && line.number !== cursor) return;
        const e = slot(line);
        if (!e.note || RANK[d.severity] > RANK[e.note.severity]) e.note = d;
      });
    }
    const marks = [...ends.values()].flatMap(({ label, note, at, start }) => [L.Decoration.line({ class: 'cm-pm-has' }).range(start), L.Decoration.widget({ widget: new End(label || null, note ? { text: note.message, severity: note.severity } : null), side: 1 }).range(at)]);
    return L.Decoration.set(marks, true);
  };
  return L.ViewPlugin.fromClass(
    class {
      declare decorations: DecorationSet;
      declare view: EditorView;
      declare labels: Label[];
      declare timer: ReturnType<typeof setTimeout> | undefined;
      constructor(view: EditorView) {
        this.view = view;
        this.labels = this.read();
        this.decorations = build(view, this.labels);
      }
      read() {
        return tagged.length ? labelsOf(tagged, this.view.state.doc.toString(), name, abs) : [];
      }
      update(u: ViewUpdate) {
        if (u.docChanged) {
          this.labels = this.labels.map((l) => ({ ...l, at: u.changes.mapPos(l.at, 1) }));
          clearTimeout(this.timer);
          if (tagged.length)
            this.timer = setTimeout(() => {
              this.labels = this.read();
              this.view.dispatch({ effects: relabel.of(null) });
            }, 150);
        } else if (u.transactions.some((tr) => tr.effects.some((e) => e.is(again)))) this.labels = this.read();
        if (u.docChanged || u.selectionSet || u.viewportChanged || u.transactions.length) this.decorations = build(u.view, this.labels);
      }
      destroy() {
        clearTimeout(this.timer);
      }
    },
    { decorations: (p) => p.decorations },
  );
}

function fixAtCursor(L: Lib) {
  return (view: EditorView) => {
    const head = view.state.selection.main.head;
    let hit = null as { d: Diagnostic; from: number; to: number } | null;
    L.forEachDiagnostic(view.state, (d, from, to) => {
      if (!hit && from <= head && head <= to && d.actions?.length) hit = { d, from, to };
    });
    if (!hit) {
      tell(view.dom, { title: 'no quick fix here' });
      return true;
    }
    hit.d.actions![0].apply(view, hit.from, hit.to);
    return true;
  };
}

const gutters = new WeakMap<EditorView, { L: Lib; gutter: Compartment }>();
let recheck = null as StateEffectType<null> | null;

const wavy = (c: string) => ({ backgroundImage: 'none', textDecoration: `underline wavy ${c}`, textDecorationSkipInk: 'none', textUnderlineOffset: '3px', textDecorationThickness: '1px' });
const note = (c: string) => ({ color: `color-mix(in srgb, ${c} 72%, var(--text-dim))` });
const looks = (L: Lib) =>
  L.EditorView.theme({
    '.cm-lintRange-error': wavy('var(--danger)'),
    '.cm-lintRange-warning': wavy('var(--warn)'),
    '.cm-lintRange-info': wavy('var(--accent)'),
    '.cm-lintRange-hint': { backgroundImage: 'none', textDecoration: 'underline dotted color-mix(in srgb, var(--text-dim) 70%, transparent)', textUnderlineOffset: '3px' },
    '.cm-lintRange-active': { backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' },
    '.cm-line.cm-pm-has': { position: 'relative', overflow: 'hidden' },
    '.cm-pm-end': { position: 'absolute', marginLeft: '3ch', whiteSpace: 'pre', pointerEvents: 'none' },
    '.cm-pm-note': { fontFamily: 'var(--font)', fontSize: '0.86em', fontStyle: 'italic' },
    '.cm-pm-label': { fontFamily: 'var(--font)', fontSize: '0.78em', color: 'var(--text-dim)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '0 5px', marginRight: '1.5ch', pointerEvents: 'auto', cursor: 'default' },
    '.cm-pm-note-error': note('var(--danger)'),
    '.cm-pm-note-warning': note('var(--warn)'),
    '.cm-pm-note-info': { color: 'var(--text-dim)' },
    '.cm-tooltip.cm-tooltip-lint': { padding: '0', maxWidth: '520px' },
    '.cm-diagnostic': { padding: '6px 10px', marginLeft: '0', borderLeft: '3px solid var(--line)', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', whiteSpace: 'pre-wrap' },
    '.cm-diagnostic-error': { borderLeftColor: 'var(--danger)' },
    '.cm-diagnostic-warning': { borderLeftColor: 'var(--warn)' },
    '.cm-diagnostic-info, .cm-diagnostic-hint': { borderLeftColor: 'var(--text-dim)' },
    '.cm-diagnosticSource': { color: 'var(--text-dim)', fontSize: '0.85em', marginTop: '2px' },
    '.cm-diagnosticAction': { font: 'inherit', backgroundColor: 'var(--hover)', color: 'var(--accent)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '1px 8px', margin: '6px 6px 0 0', cursor: 'pointer' },
  });

const cardLook = (L: Lib) =>
  L.EditorView.theme({
    '.cm-tooltip-hover:has(.cm-hovercard)': { padding: '0' },
    '.cm-hovercard': { padding: 'var(--tip-pad)', borderLeft: '3px solid var(--accent)', fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', maxWidth: '520px', whiteSpace: 'normal', overflowWrap: 'break-word' },
    '.cm-hovercard-title': { color: 'var(--text-dim)', fontSize: '0.85em', marginBottom: '2px' },
    '.cm-hovercard-code': { fontFamily: 'var(--mono)', fontSize: 'var(--code-size, 0.95em)', whiteSpace: 'pre-wrap', margin: '2px 0 4px' },
    '.cm-hovercard-text': { whiteSpace: 'pre-wrap' },
    '.cm-completionInfo': { fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', padding: '6px 10px', maxWidth: '360px', whiteSpace: 'normal' },
  });

type HoverCard = { from: number; to: number; title: string; text: string; code?: string };

export function codeNav(L: Lib, name: string, abs: Abs = () => null) {
  const list = checkersFor(name).filter((c) => c.goto || c.complete || c.hover);
  if (!list.length) return [];
  const tips = list.filter((c) => c.hover);
  const hover = async (v: EditorView, pos: number) => {
    let marked = false;
    L.forEachDiagnostic(v.state, (_d, a, b) => {
      if (a <= pos && pos <= b) marked = true;
    });
    if (marked) return null;
    const doc = v.state.doc, from = Math.max(0, pos - 2000), text = doc.sliceString(from, Math.min(doc.length, pos + 200));
    const ctx = { text: () => doc.toString(), pos };
    for (const c of tips) {
      let h: HoverCard | null = null;
      try {
        h = await c.hover(text, pos - from, name, abs(), ctx);
      } catch {}
      if (!h) continue;
      const card = h;
      return {
        pos: from + card.from,
        end: from + card.to,
        create() {
          const dom = document.createElement('div');
          dom.className = 'cm-hovercard';
          const title = document.createElement('div');
          title.className = 'cm-hovercard-title';
          title.textContent = card.title;
          dom.append(title);
          if (card.code) {
            const code = document.createElement('div');
            code.className = 'cm-hovercard-code';
            code.textContent = card.code;
            dom.append(code);
          }
          if (card.text) {
            const body = document.createElement('div');
            body.className = 'cm-hovercard-text';
            body.textContent = card.text;
            dom.append(body);
          }
          return { dom };
        },
      };
    }
    return null;
  };
  const go = async (v: EditorView, pos: number) => {
    const w = v.state.wordAt(pos), word = w && v.state.sliceDoc(w.from, w.to);
    if (!w || !word || !/^[A-Za-z_]\w*$/.test(word)) return false;
    const ctx = {
      text: v.state.doc.toString(),
      pos: w.from,
      jump(at: number) {
        v.dispatch({ selection: { anchor: at }, scrollIntoView: true });
        v.focus();
      },
    };
    for (const c of list) if (c.goto && (await c.goto(word, name, abs(), ctx))) return true;
    tell(v.dom, { title: `No definition found for '${word}'`, ms: 2000 });
    return true;
  };
  const complete = async (ctx: CompletionContext) => {
    for (const c of list) {
      const r = c.complete && (await c.complete(ctx, name, abs()));
      if (r) return r;
    }
    return null;
  };
  return [
    L.keymap.of([{ key: 'F12', run: (v) => (go(v, v.state.selection.main.head), true) }]),
    L.Prec.highest(L.keymap.of([{ key: 'Tab', run: L.moveCompletionSelection(true), shift: L.moveCompletionSelection(false) }])),
    L.EditorView.domEventHandlers({
      mousedown(e, v) {
        if (e.button !== 0 || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return false;
        const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
        const w = pos == null ? null : v.state.wordAt(pos);
        if (!w) return false;
        e.preventDefault();
        go(v, pos!);
        return true;
      },
    }),
    L.EditorState.languageData.of(() => [{ autocomplete: complete }]),
    tips.length ? [L.hoverTooltip(hover), cardLook(L)] : [],
  ];
}

export function problemMarks(L: Lib, name: string, abs: Abs = () => null) {
  const list = checkersFor(name);
  if (!list.length) return [];
  const gutter = new L.Compartment();
  recheck ||= L.StateEffect.define();
  const again = recheck;
  const ext = [
    L.linter(lintable(L, list, name, abs), { delay: 150, needsRefresh: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(again))) }),
    gutter.of(pref('marks:gutter') ? L.lintGutter({ markerFilter: (ds) => ds.filter((d) => d.severity !== 'hint') }) : []),
    lineTexts(L, list, name, abs, again),
    looks(L),
    L.keymap.of([
      { key: 'F8', run: L.nextDiagnostic },
      { key: 'Shift-F8', run: L.previousDiagnostic },
      { key: 'Alt-Enter', run: fixAtCursor(L) },
    ]),
    L.ViewPlugin.fromClass(
      class {
        declare view: EditorView;
        constructor(view: EditorView) {
          this.view = view;
          gutters.set(view, { L, gutter });
          views.add(view);
        }
        destroy() {
          views.delete(this.view);
        }
      },
    ),
  ];
  return ext;
}

onChecksChanged(() => {
  for (const v of views) if (recheck) v.dispatch({ effects: recheck.of(null) });
});

onPref('marks:gutter', (on) => {
  for (const v of views) {
    const g = gutters.get(v);
    if (g) v.dispatch({ effects: g.gutter.reconfigure(on ? g.L.lintGutter({ markerFilter: (ds) => ds.filter((d) => d.severity !== 'hint') }) : []) });
  }
});

onPref('marks:text', () => {
  for (const v of views) v.dispatch({});
});
