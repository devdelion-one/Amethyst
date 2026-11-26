import type * as CM from '/vendor/codemirror.mjs';
import type { Extension, RangeSet as Ranges, StateEffectType, StateField as Field, Transaction } from '@codemirror/state';
import type { DecorationSet, EditorView, GutterMarker as Marker } from '@codemirror/view';
import { bound, is, show } from '../base/binds.ts';
import { ask, bands, menuHead, popMenu } from '../base/controls.ts';
import { icon } from '../base/icon.ts';
import { tell } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { esc, showErr } from '../base/util.ts';
import { mrow } from './menu.ts';
import { acts, bpsIn, call, changed, D, fold, frameNow, isLib, live, onDebug, stopped } from './state.ts';
import { cardFor } from './stopcards.ts';
import type { Card } from './stopcards.ts';
import type { Bp } from './state.ts';

type L = typeof CM;
const KEYS = ['debugBp', 'debugBpOff', 'debugBpCond', 'debugRunTo', 'debugGoto'];
type Look = { line: number; cls: string; tip: string; keys: string; bp: Bp | null };
type Inline = { line: number; text: string; changed: boolean };
type Mk = Marker & { look: Look };
type Kit = {
  setBps: StateEffectType<Look[]>;
  setHere: StateEffectType<{ line: number; cls: string } | null>;
  bps: Field<Ranges<Mk>>;
  here: Field<{ line: number; cls: string } | null>;
  lines: Field<DecorationSet>;
  arrow: (cls: string) => Marker;
  mark: (look: Look) => Mk;
  setCard: StateEffectType<Card | null>;
  setInline: StateEffectType<Inline[]>;
  inline: Field<DecorationSet>;
  card: Field<Card | null>;
};

export const CODE = /\.(c|cc|cpp|cxx|c\+\+|h|hh|hpp|hxx|inl|ipp|tpp)$/i;
const kits = new WeakMap<object, Kit>();
const ARROW = '<path d="M2 5.5h7V2l7 6-7 6v-3.5H2z" fill="currentColor" stroke-linejoin="round"/>';
const pending = new Map<string, ReturnType<typeof setTimeout>>();

function lookOf(b: Bp): Look {
  const l = b.live, on = live(), c = b.cond ? ` only if ${b.cond}` : '';
  let cls = 'bp', state = `Stops the program at line ${b.line}${c} when it runs under the debugger.`;
  if (b.off) (cls += ' off'), (state = `Turned off: the program runs past line ${b.line}.`);
  else if (on && l?.verified) state = `The program stops at line ${b.line}${c}.`;
  else if (on && l?.pending) (cls += ' pend'), (state = `Waits for its module to load, then stops at line ${b.line}${c}.`);
  else if (on && l) (cls += ' fail'), (state = `It can't stop at line ${b.line}: ${l.why || 'no code there in the running build'}.`);
  else if (on) (cls += ' pend'), (state = 'Not sent to the debugger yet.');
  if (b.cond) cls += ' cond';
  if (b.by === 'agent') cls += ' agent';
  const tip = `Breakpoint${b.off ? ': off' : ''}\n${state} Set by ${b.by === 'agent' ? 'an agent' : 'you'}${l?.hits ? `, ${l.hits} hit${l.hits === 1 ? '' : 's'}` : ''}. Click to remove it.\n\nDouble-click for a condition, or drag it to another line.`;
  return { line: b.line, cls, tip, keys: '=alt+click:turn off or on', bp: b };
}

function kit(L: L): Kit {
  const had = kits.get(L);
  if (had) return had;
  class BpMark extends L.GutterMarker {
    look: Look;
    constructor(look: Look) {
      super();
      this.look = look;
    }
    eq(o: Marker) {
      return o instanceof BpMark && o.look.cls === this.look.cls && o.look.tip === this.look.tip;
    }
    toDOM() {
      const i = document.createElement('i');
      i.className = this.look.cls;
      i.title = this.look.tip;
      i.dataset.tipKeys = this.look.keys;
      return i;
    }
  }
  class Arrow extends L.GutterMarker {
    cls: string;
    constructor(cls: string) {
      super();
      this.cls = cls;
    }
    eq(o: Marker) {
      return o instanceof Arrow && o.cls === this.cls;
    }
    toDOM() {
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', `dbg-arr ${this.cls}`);
      s.setAttribute('viewBox', '0 0 18 16');
      s.innerHTML = this.cls === 'caller' ? '<path d="M2 5.5h7V2l7 6-7 6v-3.5H2z" fill="none" stroke-linejoin="round"/>' : ARROW;
      return s as unknown as HTMLElement;
    }
  }
  const setBps = L.StateEffect.define<Look[]>();
  const setHere = L.StateEffect.define<{ line: number; cls: string } | null>();
  const build = (doc: { lines: number; line: (n: number) => { from: number } }, looks: Look[]) => {
    const seen = new Set<number>();
    const list = looks.filter((k) => k.line >= 1 && k.line <= doc.lines && !seen.has(k.line) && seen.add(k.line)).sort((a, b) => a.line - b.line);
    return L.RangeSet.of(list.map((k) => new BpMark(k).range(doc.line(k.line).from)));
  };
  const bps = L.StateField.define<Ranges<Mk>>({
    create: () => L.RangeSet.empty as Ranges<Mk>,
    update(set, tr: Transaction) {
      for (const e of tr.effects) if (e.is(setBps)) return build(tr.state.doc, e.value);
      return tr.docChanged ? set.map(tr.changes) : set;
    },
  });
  const here = L.StateField.define<{ line: number; cls: string } | null>({
    create: () => null,
    update(v, tr: Transaction) {
      for (const e of tr.effects) if (e.is(setHere)) return e.value;
      return v;
    },
  });
  const lineDeco = (cls: string) => L.Decoration.line({ class: `cm-dbg-${cls}` });
  const lines = L.StateField.define<DecorationSet>({
    create: () => L.Decoration.none,
    update(set, tr: Transaction) {
      for (const e of tr.effects)
        if (e.is(setHere)) {
          const h = e.value;
          return h && h.line >= 1 && h.line <= tr.state.doc.lines ? L.Decoration.set([lineDeco(h.cls).range(tr.state.doc.line(h.line).from)]) : L.Decoration.none;
        }
      return tr.docChanged ? set.map(tr.changes) : set;
    },
    provide: (f) => L.EditorView.decorations.from(f),
  });
  const arrows = new Map<string, Marker>();
  const arrow = (cls: string) => arrows.get(cls) || (arrows.set(cls, new Arrow(cls)), arrows.get(cls)!);
  const setCard = L.StateEffect.define<Card | null>();
  const card = L.StateField.define<Card | null>({
    create: () => null,
    update(v, tr: Transaction) {
      for (const e of tr.effects) if (e.is(setCard)) return e.value;
      return v;
    },
    provide: (f) =>
      L.showTooltip.compute([f], (st) => {
        const c = st.field(f);
        if (!c || c.line < 1 || c.line > st.doc.lines) return null;
        return { pos: st.doc.line(c.line).from, above: false, strictSide: true, arrow: false, create: () => ({ dom: c.dom() }) };
      }),
  });
  class Val extends L.WidgetType {
    text: string;
    changed: boolean;
    constructor(text: string, changed: boolean) {
      super();
      this.text = text;
      this.changed = changed;
    }
    eq(o: Val) {
      return o.text === this.text && o.changed === this.changed;
    }
    toDOM() {
      const s = document.createElement('span');
      s.className = `dbg-val${this.changed ? ' ch' : ''}`;
      s.textContent = this.text;
      return s;
    }
    ignoreEvent() {
      return true;
    }
  }
  const setInline = L.StateEffect.define<Inline[]>();
  const inline = L.StateField.define<DecorationSet>({
    create: () => L.Decoration.none,
    update(set, tr: Transaction) {
      for (const e of tr.effects)
        if (e.is(setInline)) {
          const list = e.value.filter((x) => x.line >= 1 && x.line <= tr.state.doc.lines).sort((a, b) => a.line - b.line);
          return L.Decoration.set(list.map((x) => L.Decoration.widget({ widget: new Val(x.text, x.changed), side: 1 }).range(tr.state.doc.line(x.line).to)));
        }
      return tr.docChanged ? L.Decoration.none : set;
    },
    provide: (f) => L.EditorView.decorations.from(f),
  });
  const k: Kit = { setBps, setHere, bps, here, lines, arrow, mark: (look) => new BpMark(look) as Mk, setCard, card, setInline, inline };
  kits.set(L, k);
  return k;
}

function linesNow(v: EditorView, K: Kit) {
  const out: Look[] = [];
  const it = v.state.field(K.bps).iter();
  while (it.value) {
    out.push({ ...it.value.look, line: v.state.doc.lineAt(it.from).number });
    it.next();
  }
  return out;
}

function sendSoon(abs: string, v: EditorView, K: Kit, ms = 500) {
  clearTimeout(pending.get(fold(abs)));
  pending.set(fold(abs), setTimeout(() => {
    const lines = linesNow(v, K).map((k) => ({ line: k.line, cond: k.bp?.cond, off: !!k.bp?.off, by: k.bp?.by }));
    call('/api/debug/breakpoints', { file: abs, lines })
      .catch(showErr)
      .finally(() => pending.delete(fold(abs)));
  }, ms));
}

function setLine(v: EditorView, K: Kit, abs: string, line: number, change: (b: Bp | null) => Partial<Bp> | null) {
  const now = linesNow(v, K), at = now.find((k) => k.line === line);
  const next = change(at?.bp || null);
  const rest = now.filter((k) => k.line !== line);
  if (next) {
    const b: Bp = { file: abs, abs, line, by: 'you', at: Date.now(), ...(at?.bp || {}), ...next } as Bp;
    rest.push(lookOf(b));
  }
  v.dispatch({ effects: K.setBps.of(rest) });
  sendSoon(abs, v, K, 0);
}

function dragIn(v: EditorView, from: number, down: MouseEvent, how: { ghost: string; fromCls: string; click: () => unknown; drop: (to: number) => unknown }) {
  const src = (down.target as HTMLElement).closest('.cm-gutterElement');
  const gut = (down.target as HTMLElement).closest('.cm-gutter');
  let dragging = false, ghost: HTMLElement | null = null;
  const lineAtY = (y: number) => {
    const box = v.contentDOM.getBoundingClientRect();
    const pos = v.posAtCoords({ x: box.left + 2, y: Math.max(box.top + 1, Math.min(y, box.bottom - 1)) });
    return pos == null ? from : v.state.doc.lineAt(pos).number;
  };
  const showAt = (n: number) => {
    if (!gut) return;
    if (!ghost) {
      ghost = document.createElement('div');
      ghost.className = 'dbg-ghost';
      ghost.innerHTML = how.ghost;
      v.dom.append(ghost);
    }
    const blk = v.lineBlockAt(v.state.doc.line(n).from), box = v.dom.getBoundingClientRect(), g = gut.getBoundingClientRect();
    Object.assign(ghost.style, { left: `${g.left - box.left}px`, top: `${blk.top + v.documentTop - box.top}px`, width: `${g.width}px`, height: `${blk.height}px` });
    ghost.classList.toggle('home', n === from);
  };
  const move = (e: MouseEvent) => {
    if (!dragging && Math.abs(e.clientY - down.clientY) < 4) return;
    dragging = true;
    v.dom.classList.add('dbg-drag');
    src?.classList.add(how.fromCls);
    showAt(lineAtY(e.clientY));
  };
  const up = (e: MouseEvent) => {
    window.removeEventListener('mousemove', move, true);
    window.removeEventListener('mouseup', up, true);
    v.dom.classList.remove('dbg-drag');
    src?.classList.remove(how.fromCls);
    ghost?.remove();
    if (!dragging) return how.click();
    const to = lineAtY(e.clientY);
    if (to !== from) how.drop(to);
  };
  window.addEventListener('mousemove', move, true);
  window.addEventListener('mouseup', up, true);
}

function dragDot(v: EditorView, K: Kit, abs: string, from: number, down: MouseEvent) {
  dragIn(v, from, down, { ghost: '<i class="bp"></i>', fromCls: 'dbg-from', click: () => toggle(v, K, abs, from), drop: (to) => {
    const now = linesNow(v, K), b = now.find((k) => k.line === from)?.bp;
    if (!b) return;
    if (now.some((k) => k.line === to)) return tell(v.dom, { title: 'There is a breakpoint on that line already', ms: 2000 });
    const rest = now.filter((k) => k.line !== from);
    rest.push(lookOf({ ...b, line: to }));
    v.dispatch({ effects: K.setBps.of(rest) });
    sendSoon(abs, v, K, 0);
  } });
}

function dragArrow(v: EditorView, K: Kit, abs: string, from: number, down: MouseEvent) {
  dragIn(v, from, down, { ghost: `<svg class="dbg-arr cur" viewBox="0 0 18 16">${ARROW}</svg>`, fromCls: 'dbg-from-arr', click: () => toggle(v, K, abs, from), drop: (to) => acts.goto(abs, to, v.dom) });
}

const toggle = (v: EditorView, K: Kit, abs: string, line: number) => setLine(v, K, abs, line, (b) => (b ? null : { off: false }));
const turnOff = (v: EditorView, K: Kit, abs: string, line: number) => setLine(v, K, abs, line, (b) => ({ off: b ? !b.off : true }));

async function condition(v: EditorView, K: Kit, abs: string, line: number) {
  const b = linesNow(v, K).find((k) => k.line === line)?.bp;
  const cond = await ask({ title: `Stop at line ${line} only if`, value: b?.cond || '', placeholder: 'a C++ expression, for example Health <= 0', about: 'Leave it empty to stop every time.' });
  if (cond == null) return;
  setLine(v, K, abs, line, () => ({ cond: String(cond).trim() || undefined, off: false }));
}

function menu(v: EditorView, K: Kit, abs: string, line: number, e: MouseEvent) {
  const b = linesNow(v, K).find((k) => k.line === line)?.bp;
  const key = (id: string) => show(bound(id));
  const run = mrow('data-b="run"', icon('move'), 'run to here', { tip: 'Runs the program until it reaches this line.', key: key('debugRunTo'), off: !stopped() }) + mrow('data-b="goto"', icon('send'), 'set next statement here', { tip: 'Moves the arrow to this line, within the function, without running the lines between.', key: key('debugGoto'), off: !stopped() });
  const actions = b
    ? mrow('data-b="cond"', icon('findOptions'), 'condition…', { tip: b.cond ? `Stops only if ${b.cond}.` : 'Stops only if a condition holds.', key: b.cond ? '' : 'double-click' }) + mrow('data-b="off"', icon(b.off ? 'eye' : 'eyeOff'), b.off ? 'turn on' : 'turn off', { tip: b.off ? 'Stops at this breakpoint again.' : 'Keeps the breakpoint but does not stop at it.', key: key('debugBpOff') }) + run + '<div class="sep"></div>' + mrow('data-b="rm"', icon('close'), 'remove', { key: key('debugBp'), cls: 'def' }) + mrow('data-b="rmall"', icon('clear'), 'remove all in this file', { tip: "Removes every breakpoint in this file.", cls: 'danger' })
    : mrow('data-b="add"', icon('plus'), 'add a breakpoint', { key: key('debugBp'), cls: 'def' }) + mrow('data-b="addc"', icon('findOptions'), 'add a conditional breakpoint…', { tip: 'Adds a breakpoint that stops only if a condition holds.', key: key('debugBpCond') }) + run;
  const html = menuHead(icon(b ? 'stop' : 'file'), b ? `breakpoint on line ${line}` : `line ${line}`) + bands({ actions });
  popMenu(e.clientX, e.clientY, html, (btn) => {
    const k = btn.dataset.b;
    if (k === 'run') return acts.runTo(abs, line);
    if (k === 'goto') return acts.goto(abs, line, v.dom);
    if (k === 'cond' || k === 'addc') return condition(v, K, abs, line);
    if (k === 'off') return turnOff(v, K, abs, line);
    if (k === 'rm' || k === 'add') return toggle(v, K, abs, line);
    if (k === 'rmall') {
      v.dispatch({ effects: K.setBps.of([]) });
      sendSoon(abs, v, K, 0);
    }
  });
}

const NOT = new Set(['if', 'else', 'for', 'while', 'do', 'return', 'const', 'auto', 'void', 'int', 'int32', 'int64', 'uint8', 'uint32', 'float', 'double', 'bool', 'true', 'false', 'nullptr', 'this', 'class', 'struct', 'new', 'delete', 'static', 'switch', 'case', 'break', 'continue', 'Super', 'TEXT', 'check', 'ensure', 'checkf']);

function inlineFor(abs: string, doc: { lines: number; line: (n: number) => { text: string } }): Inline[] {
  if (!stopped() || !pref('debug:inline') || !D.vals.size) return [];
  const f = frameNow();
  if (!f || !f.source || fold(f.file) !== fold(abs) || f.line < 2 || f.line > doc.lines) return [];
  const out: Inline[] = [];
  for (let n = f.line - 1; n >= Math.max(1, f.line - 60); n--) {
    const text = doc.line(n).text;
    if (/^\{/.test(text)) break;
    if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
    const seen = new Set<string>(), parts: string[] = [];
    let changedAny = false;
    for (const w of text.match(/[A-Za-z_]\w*/g) || []) {
      if (seen.has(w) || NOT.has(w) || !D.vals.has(w) || parts.length >= 3) continue;
      seen.add(w);
      const v = D.vals.get(w)!, was = D.prevVals.get(w);
      if (was !== undefined && was !== v) changedAny = true;
      parts.push(`${w} = ${v.length > 40 ? v.slice(0, 39) + '…' : v}`);
    }
    if (parts.length) out.push({ line: n, text: parts.join(', '), changed: changedAny });
  }
  return out;
}

function hereFor(abs: string) {
  if (!stopped() || !D.frames.length) return null;
  const f = frameNow(), top = D.frames.find((x) => x.source) || null;
  if (f && f.source && fold(f.file) === fold(abs)) return { line: f.line, cls: f === top ? (D.session?.stop?.reason === 'exception' ? 'crash' : 'cur') : 'caller' };
  if (top && fold(top.file) === fold(abs) && f !== top) return { line: top.line, cls: D.session?.stop?.reason === 'exception' ? 'crash' : 'cur' };
  return null;
}

async function hoverValue(v: EditorView, pos: number) {
  if (!stopped() || !pref('debug:hover')) return null;
  const w = v.state.wordAt(pos);
  if (!w) return null;
  const word = v.state.sliceDoc(w.from, w.to);
  if (!/^[A-Za-z_]\w*$/.test(word) || /^(if|for|while|return|const|auto|void|int|float|bool|true|false|nullptr|class|struct)$/.test(word)) return null;
  const f = frameNow();
  const r = await call('/api/debug/eval', { expr: word, context: 'hover', frameId: f?.id }).catch(() => null);
  if (!r?.ok || !r.value || r.value === '(no output)') return null;
  return { pos: w.from, end: w.to, above: true, create: () => {
    const dom = document.createElement('div');
    dom.className = 'dbg-hover';
    const type = (t: string) => t.replace(/\b(class|struct|enum|union) /g, '');
    const row = (name: string, value: string, t: string, ref: number, depth: number, expr: string) =>
      `<div class="hr" style="--dp:${depth}"${ref ? ` data-ref="${ref}" data-dp="${depth}"` : ''}><span class="tw">${ref ? '▸' : ''}</span><span class="e">${esc(name)}</span><span class="vv" title="${esc(value)}" data-tip-mono data-tip-cut>${esc(value)}</span>${t ? `<span class="ty2">${esc(type(t))}</span>` : ''}${depth === 0 ? `<button class="x" data-copy aria-label="copy the value">⧉</button><button class="x" data-watch title="Add to watch&#10;Adds it to the watch list, to follow its value as you step.">+</button>` : expr ? `<button class="x" data-watchx="${esc(expr)}" title="Add to watch&#10;Adds it to the watch list, to follow its value as you step.">+</button>` : ''}</div>`;
    dom.innerHTML = row(word, r.value, r.type, r.ref, 0, word);
    dom.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-watch]')) return changed(`watch:${word}`);
      const wx = t.closest<HTMLElement>('[data-watchx]');
      if (wx) return changed(`watch:${wx.dataset.watchx}`);
      if (t.closest('[data-copy]')) return navigator.clipboard.writeText(r.value);
      const hr = t.closest<HTMLElement>('.hr[data-ref]');
      if (!hr) return;
      const tw = hr.querySelector('.tw')!;
      const next = hr.nextElementSibling as HTMLElement | null;
      if (hr.dataset.open) {
        delete hr.dataset.open;
        tw.textContent = '▸';
        const dp = Number(hr.dataset.dp);
        for (let n = hr.nextElementSibling as HTMLElement | null; n && Number(n.style.getPropertyValue('--dp')) > dp; ) {
          const gone = n;
          n = n.nextElementSibling as HTMLElement | null;
          gone.remove();
        }
        return;
      }
      hr.dataset.open = '1';
      tw.textContent = '▾';
      const k = await call('/api/debug/vars', { ref: Number(hr.dataset.ref) }).catch(() => ({ vars: [] }));
      const dp = Number(hr.dataset.dp) + 1;
      const html = ((k.vars || []) as { name: string; value: string; type: string; ref: number; expr: string }[]).slice(0, 200).map((x) => row(x.name, x.value, x.type, dp < 4 ? x.ref : 0, dp, x.expr)).join('');
      if (next) next.insertAdjacentHTML('beforebegin', html);
      else dom.insertAdjacentHTML('beforeend', html);
    });
    return { dom };
  } };
}

const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

function lockPart(L: L, abs: () => string | null): Extension {
  const a = abs() || '';
  if (!pref('debug:readonly') || !isLib(a)) return [];
  const ro = new L.Compartment();
  let locked = true;
  const dom = document.createElement('div');
  dom.className = 'dbg-lock';
  const draw = () => {
    dom.classList.toggle('open', !locked);
    dom.innerHTML = locked ? `${LOCK}<span>engine source · read-only</span><button class="tx" data-l="open">edit anyway</button>` : `${LOCK}<span>engine source · editing</span><button class="tx" data-l="lock">lock it</button>`;
  };
  draw();
  const tellLocked = (v: EditorView) => tell(v.dom, { title: 'This engine file is read-only here', line: '"edit anyway" above the code unlocks it', ms: 2500 });
  return [
    ro.of(L.EditorState.readOnly.of(true)),
    L.showPanel.of((v: EditorView) => {
      dom.onclick = (e) => {
        const k = (e.target as HTMLElement).closest<HTMLElement>('[data-l]')?.dataset.l;
        if (!k) return;
        locked = k === 'lock';
        v.dispatch({ effects: ro.reconfigure(L.EditorState.readOnly.of(locked)) });
        draw();
        if (!locked) v.focus();
      };
      return { dom, top: true };
    }),
    L.EditorView.domEventHandlers({
      keydown(e: KeyboardEvent, v: EditorView) {
        if (!locked || e.ctrlKey || e.metaKey || e.altKey) return false;
        if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          tellLocked(v);
          return true;
        }
        return false;
      },
      paste(e: ClipboardEvent, v: EditorView) {
        if (!locked) return false;
        e.preventDefault();
        tellLocked(v);
        return true;
      },
    }),
  ];
}

export function debugPart(L: L, name: string, abs: () => string | null): Extension {
  if (!CODE.test(name)) return [];
  const lock = lockPart(L, abs);
  const K = kit(L);
  const fileNow = () => abs() || '';
  const sync = (v: EditorView) => {
    const a = fileNow();
    if (!a || pending.has(fold(a))) return;
    v.dispatch({ effects: K.setBps.of(bpsIn(a).map(lookOf)) });
  };
  const place = (v: EditorView) => {
    const a = fileNow();
    const h = a ? hereFor(a) : null;
    const was = v.state.field(K.here);
    if (was?.line === h?.line && was?.cls === h?.cls) return;
    v.dispatch({ effects: K.setHere.of(h) });
  };
  const showCard = (v: EditorView) => {
    const c = cardFor(fileNow());
    const was = v.state.field(K.card);
    if (was?.key === c?.key) return;
    v.dispatch({ effects: K.setCard.of(c) });
  };
  const hideCard = (v: EditorView) => {
    const c = v.state.field(K.card);
    if (c) D.cardShut = c.key;
    v.dispatch({ effects: K.setCard.of(null) });
  };
  const showInline = (v: EditorView) => {
    const list = inlineFor(fileNow(), v.state.doc);
    const key = JSON.stringify(list);
    if ((v as unknown as { dbgInline?: string }).dbgInline === key) return;
    (v as unknown as { dbgInline?: string }).dbgInline = key;
    v.dispatch({ effects: K.setInline.of(list) });
  };
  const plugin = L.ViewPlugin.fromClass(
    class {
      off: () => void;
      constructor(v: EditorView) {
        queueMicrotask(() => (sync(v), place(v)));
        this.off = onDebug((why) => {
          if (why === 'bps' || why === 'all' || why.startsWith('state')) sync(v);
          if (why === 'frames' || why === 'frame' || why === 'all' || why.startsWith('state')) place(v);
          if (why === 'frames' || why === 'all' || why.startsWith('state') || why === 'card') showCard(v);
          if (why === 'vals' || why === 'frame' || why.startsWith('state') || why === 'all') showInline(v);
        });
      }
      update(u: { docChanged: boolean; view: EditorView; startState: { field: (f: Field<Ranges<Mk>>) => Ranges<Mk> }; state: { field: (f: Field<Ranges<Mk>>) => Ranges<Mk> } }) {
        if (!u.docChanged) return;
        const a = fileNow();
        if (a && u.startState.field(K.bps).size) sendSoon(a, u.view, K, 800);
      }
      destroy() {
        this.off();
      }
    },
  );
  const at = (v: EditorView, from: number) => v.state.doc.lineAt(from).number;
  return [
    lock,
    K.bps,
    K.here,
    K.lines,
    K.card,
    K.inline,
    plugin,
    L.keymap.of([{ key: 'Escape', run: (v: EditorView) => (v.state.field(K.card) ? (hideCard(v), true) : false) }]),
    L.Prec.highest(
      L.gutter({
        class: 'cm-bp-gutter',
        renderEmptyElements: true,
        markers: (v: EditorView) => {
          const h = v.state.field(K.here);
          const arrowSet = h && h.line <= v.state.doc.lines ? L.RangeSet.of([K.arrow(h.cls).range(v.state.doc.line(h.line).from)]) : L.RangeSet.empty;
          return [v.state.field(K.bps), arrowSet] as any;
        },
        domEventHandlers: {
          mousedown(v: EditorView, line: { from: number }, ev: Event) {
            const e = ev as MouseEvent, a = fileNow();
            if (!a) return false;
            if (e.button === 2) {
              e.preventDefault();
              menu(v, K, a, at(v, line.from), e);
              return true;
            }
            if (e.button !== 0) return false;
            e.preventDefault();
            if (e.detail === 2) {
              condition(v, K, a, at(v, line.from));
              return true;
            }
            const from = at(v, line.from);
            if (e.altKey) return turnOff(v, K, a, from), true;
            const h = v.state.field(K.here);
            if (stopped() && h && h.line === from && h.cls !== 'caller') return dragArrow(v, K, a, from, e), true;
            if (!linesNow(v, K).some((k) => k.line === from)) return toggle(v, K, a, from), true;
            dragDot(v, K, a, from, e);
            return true;
          },
          contextmenu(_v: EditorView, _l: unknown, ev: Event) {
            ev.preventDefault();
            return true;
          },
        },
      }),
    ),
    L.Prec.high(
      L.EditorView.domEventHandlers({
        keydown(e: KeyboardEvent, v: EditorView) {
          const a = fileNow(), k = a && !e.defaultPrevented ? KEYS.find((id) => is(e, id)) : undefined;
          if (!a || !k) return false;
          e.preventDefault();
          const line = at(v, v.state.selection.main.head);
          if (k === 'debugBp') toggle(v, K, a, line);
          else if (k === 'debugBpOff') turnOff(v, K, a, line);
          else if (k === 'debugBpCond') condition(v, K, a, line);
          else if (k === 'debugRunTo') acts.runTo(a, line);
          else acts.goto(a, line, v.dom);
          return true;
        },
      }),
    ),
    L.hoverTooltip((v: EditorView, pos: number) => hoverValue(v, pos) as any, { hoverTime: 350 }),
  ];
}

export const cantStopHere = (over: Element | null) => tell(over, { title: "The debugger can't stop in this file", line: 'breakpoints go in C and C++ files', ms: 2500 });
