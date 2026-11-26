import { codeLib, lineNumbers } from '../base/textbox.ts';
import { chunkMeta } from '../base/reviewmarks.ts';
import { counts, editFile, editsOf, editsSoon, editTurns, keepBase, keepSome, loadEdits, noteReject, onEdits, rejectAll, rejectSome, rowLabel, rowTip, TIPS, turnFile, writeEdit } from '../base/edits.ts';
import type { EditRow, Turn } from '../base/edits.ts';
import { ICONS } from '../base/controls.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { agents, onAgents } from '../base/stream.ts';
import { $, amTag, esc, onSelEnd, showErr } from '../base/util.ts';
import { claim, forMe, isSpare, on, POP, send, SOLO } from '../base/windows.ts';
import { selHide, selShow } from '../base/quote.ts';
import type { EditorView } from '/vendor/codemirror.mjs';
import { plural } from '../base/words.ts';

type Lib = Awaited<ReturnType<typeof codeLib>>;
type Block = { key: string; path: string; el: HTMLElement; view: EditorView | null; mtime: number; text: string; base: string; ro: boolean; turn?: number; open: boolean; merge: any };
type Opts = { docked: boolean; dock: () => void; close?: () => void };

const OWN = !!window.amethyst?.desktop;
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((z) => `<i data-rs="${z}"></i>`).join('');
const MODE: Record<string, string> = { default: 'Manual', acceptEdits: 'Edit automatically', 'accept-edits': 'Edit automatically', plan: 'Plan', sandbox: 'Sandbox', auto: 'Auto', bypassPermissions: 'Bypass', 'skip-permissions': 'Skip permissions', autopilot: 'Autopilot', 'allow-all': 'Allow all' };
const split = (p: string) => {
  const at = p.lastIndexOf('/');
  return [p.slice(at + 1), at > 0 ? p.slice(0, at) : ''];
};
const when = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function reviewView(chat: string, o: Opts) {
  const el = document.createElement('div');
  el.className = 'rv-view';
  el.tabIndex = -1;
  el.innerHTML = `<div class="rv-top"><span class="rv-seg" role="tablist"><button type="button" role="tab" data-rv="part" data-p="review" title="To review&#10;The files this chat changed that you haven't kept yet.">To review<span class="rv-n"></span></button><button type="button" role="tab" data-rv="part" data-p="all" title="All of this chat&#10;What this chat changed, turn after turn, kept changes too.">All of this chat</button></span><span class="grow"></span><span class="rv-sum"></span><button type="button" class="ed-b" data-rv="reject" title="${TIPS.rejectAll}">Reject all</button><button type="button" class="ed-b pri" data-rv="keep" title="${TIPS.keepAll}">Keep all</button><button type="button" class="rv-ic" data-rv="dock" title="${o.docked ? 'Undock&#10;Back to a window of its own, on top.' : 'Dock&#10;Puts the review in a tab in the editor.'}" aria-label="${o.docked ? 'undock' : 'dock'}">${o.docked ? '⧉' : '⤢'}</button></div><div class="rv-find" hidden><input type="text" placeholder="Find in this review" spellcheck="false" autocomplete="off" aria-label="find in this review"><span class="rv-fn"></span><button type="button" class="rv-ic" data-rv="prev" title="Previous match&#10;Goes to the match before this one." data-tip-keys="=shift+enter:previous match" aria-label="previous match">↑</button><button type="button" class="rv-ic" data-rv="next" title="Next match&#10;Goes to the match after this one." data-tip-keys="=enter:next match" aria-label="next match">↓</button><button type="button" class="rv-ic" data-rv="unfind" title="Close&#10;Closes the find bar." data-tip-keys="=esc:close" aria-label="close find">${ICONS.wx}</button></div><div class="rv-body"></div>`;
  const body = el.querySelector<HTMLElement>('.rv-body')!, findBar = el.querySelector<HTMLElement>('.rv-find')!, findIn = findBar.querySelector('input')!;
  let L: Lib | null = null, part: 'review' | 'all' = 'review', turns: Turn[] | null = null, stopped = false;
  const blocks = new Map<string, Block>();
  const openTurns = new Set<number>();
  let q = '', hits: { b: Block; at: number }[] = [], cur = 0, findFx: any = null;
  let want: string | null = null, ready = false;

  function controls(b: Block) {
    return (type: 'accept' | 'reject') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `ed-b rv-mc${type === 'accept' ? ' pri' : ''}`;
      btn.textContent = type === 'accept' ? 'Keep' : 'Reject';
      btn.title = type === 'accept' ? 'Keep\nKeeps this change: the file stays as it is on disk, and the marks go away.' : 'Reject\nWrites only these lines back to how they were, on disk.';
      btn.onmousedown = (e) => {
        e.preventDefault();
        if (b.view) (type === 'accept' ? keepOne : rejectOne)(b, b.view.posAtDOM(btn), btn);
      };
      return btn;
    };
  }
  async function keepOne(b: Block, pos: number, btn: HTMLElement) {
    if (!L || !b.view) return;
    L.acceptChunk(b.view, pos);
    b.base = L.getOriginalDoc(b.view.state).toString();
    try {
      await keepBase(chat, b.path, b.base);
    } catch (e: any) {
      tell(btn, { title: 'Nothing was kept', line: e.message, ms: 4000 });
      refill(b);
    }
  }
  async function rejectOne(b: Block, pos: number, btn: HTMLElement) {
    if (!L || !b.view) return;
    const ch = L.getChunks(b.view.state)?.chunks.find((c: any) => pos >= c.fromB && pos <= Math.max(c.toB, c.fromB));
    const back = ch ? L.getOriginalDoc(b.view.state).sliceString(ch.fromA, ch.toA).replace(/\n$/, '') : '';
    const line = ch ? b.view.state.doc.lineAt(ch.fromB).number : 0;
    L.rejectChunk(b.view, pos);
    try {
      const r = await writeEdit(chat, b.path, b.view.state.doc.toString(), b.mtime);
      b.mtime = r.mtime;
      b.text = b.view.state.doc.toString();
      noteReject(chat, b.path, back ? `from line ${line}, back to:\n${back}` : `the lines you added at line ${line} are gone again`);
    } catch (e: any) {
      tell(btn, { title: 'Nothing was rejected', line: e.status === 409 ? e.message : e.message || 'it could not be saved', ms: 4500 });
      refill(b);
    }
  }

  const mergeOf = (b: Block, folded: boolean) =>
    L!.unifiedMergeView({ original: b.base, mergeControls: b.ro ? false : (controls(b) as any), gutter: true, highlightChanges: false, syntaxHighlightDeletions: true, allowInlineDiffs: false, ...(folded ? { collapseUnchanged: { margin: 3, minSize: 5 } } : {}) });
  function mount(b: Block, base: string | null, now: string | null) {
    if (!L || stopped) return;
    b.base = base ?? '';
    b.text = now ?? '';
    b.view?.destroy();
    const host = b.el.querySelector<HTMLElement>('.rv-code')!;
    host.innerHTML = '';
    b.merge = new L.Compartment();
    const name = b.path.split('/').pop()!;
    b.view = new L.EditorView({
      parent: host,
      state: L.EditorState.create({
        doc: b.text,
        extensions: [L.codeSetup, lineNumbers(L, false), L.look, L.languageFor(name), L.EditorState.readOnly.of(true), b.merge.of(mergeOf(b, !(q && has(b)))), chunkMeta(L), hitDeco(b)],
      }),
    });
    selTo(b);
    land();
  }
  async function refill(b: Block) {
    try {
      const f = await editFile(chat, b.path);
      b.mtime = f.mtime;
      mount(b, f.base, f.now);
    } catch (e: any) {
      b.el.querySelector('.rv-code')!.innerHTML = `<p class="rv-note">${esc(e.message)}</p>`;
    }
  }

  function selTo(b: Block) {
    const v = b.view!;
    const src = {
      el: v.dom,
      joins: false,
      get() {
        const { from, to } = v.state.selection.main, text = v.state.sliceDoc(from, to);
        if (!v.hasFocus || !text.trim()) return null;
        const doc = v.state.doc, a = doc.lineAt(from).number, e = doc.lineAt(to), z = e.from === to && e.number > a ? e.number - 1 : e.number;
        return { text: text.replace(/\n+$/, ''), from: `${b.path}:${a === z ? a : `${a}-${z}`}` };
      },
      at() {
        const c = v.coordsAtPos(v.state.selection.main.head) || v.dom.getBoundingClientRect();
        return { x: c.left, y: c.bottom, top: c.top };
      },
      clear: () => v.dispatch({ selection: { anchor: v.state.selection.main.head } }),
    };
    const later = () => setTimeout(() => selShow(src), 0);
    v.dom.addEventListener('keyup', later);
    onSelEnd(v.dom, later);
    v.dom.addEventListener('focusout', () => setTimeout(() => !v.dom.contains(document.activeElement) && selHide(src), 0));
  }

  const has = (b: Block) => !!q && (b.text.toLowerCase().includes(q) || b.base.toLowerCase().includes(q));
  function hitDeco(b: Block) {
    const Lb = L!;
    return Lb.ViewPlugin.fromClass(
      class {
        decorations: any;
        constructor(v: EditorView) {
          this.decorations = this.make(v);
        }
        update(u: any) {
          if (u.docChanged || u.viewportChanged || u.transactions.some((t: any) => t.effects.some((e: any) => e.is(findFx)))) this.decorations = this.make(u.view);
        }
        make(v: EditorView) {
          if (!q) return Lb.Decoration.none;
          const out: any[] = [], text = v.state.doc.toString().toLowerCase();
          for (const { from, to } of v.visibleRanges)
            for (let i = text.indexOf(q, Math.max(0, from - q.length)); i >= 0 && i < to; i = text.indexOf(q, i + 1)) {
              const now = hits[cur]?.b === b && hits[cur].at === i;
              out.push(Lb.Decoration.mark({ class: now ? 'rv-hit now' : 'rv-hit' }).range(i, i + q.length));
            }
          return Lb.Decoration.set(out, true);
        }
      },
      { decorations: (p: any) => p.decorations },
    );
  }
  function runFind(scroll: boolean) {
    q = findIn.value.toLowerCase();
    hits = [];
    for (const b of blocks.values()) {
      if (!b.view) continue;
      if (q && has(b) && !b.open) foldBlock(b, true);
      b.view.dispatch({ effects: b.merge.reconfigure(mergeOf(b, !(q && has(b)))) });
      if (!q) continue;
      const text = b.view.state.doc.toString().toLowerCase();
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + 1)) hits.push({ b, at: i });
    }
    if (cur >= hits.length) cur = 0;
    paintFind(scroll);
  }
  function paintFind(scroll: boolean) {
    for (const b of blocks.values()) b.view?.dispatch({ effects: findFx.of(null) });
    el.querySelector('.rv-fn')!.textContent = q ? (hits.length ? `${cur + 1}/${hits.length}` : 'none') : '';
    const h = hits[cur];
    if (scroll && h?.b.view) h.b.view.dispatch({ effects: L!.EditorView.scrollIntoView(h.at, { y: 'center' }) });
  }
  const step = (d: number) => hits.length && ((cur = (cur + d + hits.length) % hits.length), paintFind(true));
  function openFind() {
    findBar.hidden = false;
    findIn.focus();
    findIn.select();
    if (part === 'all' && turns) turns.forEach((t) => openTurns.add(t.n)), drawAll(true);
  }
  function closeFind() {
    findBar.hidden = true;
    findIn.value = '';
    runFind(false);
  }
  findIn.addEventListener('input', () => ((cur = 0), runFind(true)));
  findIn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') (e.preventDefault(), step(e.shiftKey ? -1 : 1));
    if (e.key === 'Escape') (e.preventDefault(), closeFind());
  });
  el.addEventListener(
    'keydown',
    (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        openFind();
      }
    },
    true,
  );

  function foldBlock(b: Block, on: boolean) {
    b.open = on;
    b.el.classList.toggle('shut', !on);
    b.el.querySelector('[data-rv="fold"]')?.setAttribute('aria-expanded', String(on));
  }
  function head(name: string, dir: string, extra: string, acts: string, key: string) {
    return `<div class="rv-bh"><button type="button" class="rv-chev" data-rv="fold" data-k="${esc(key)}" aria-expanded="true" aria-label="fold this file"><svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg></button><span class="rv-nm" data-tip-mono>${esc(name)}</span><span class="rv-dir" data-tip-mono>${esc(dir)}</span>${extra}<span class="grow"></span>${acts}</div><div class="rv-code"></div>`;
  }

  function drawReview() {
    const rows = editsOf(chat)?.files || [];
    const keep = new Set(rows.map((f) => 'r:' + f.path));
    for (const [k, b] of blocks) if (!keep.has(k) || b.turn != null) (b.view?.destroy(), b.el.remove(), blocks.delete(k));
    if (!rows.length) {
      body.innerHTML = `<div class="rv-empty"><b>Nothing left to review</b><span>Every change this chat made in Edit automatically is kept or rejected. All of this chat still shows them.</span></div>`;
      return;
    }
    body.querySelector('.rv-empty')?.remove();
    rows.forEach((f, i) => {
      const key = 'r:' + f.path;
      let b = blocks.get(key);
      const [name, dir] = split(f.path);
      const acts = f.none ? '' : `<span class="ed-c">${f.bin ? '' : counts(f.add, f.del)}</span><button type="button" class="ed-b" data-rv="open" data-k="${esc(key)}" title="Open file&#10;Opens the file at its first change.">Open file</button><button type="button" class="ed-b" data-rv="r1" data-k="${esc(key)}" title="${rowTip(f)}">Reject</button><button type="button" class="ed-b pri" data-rv="k1" data-k="${esc(key)}" title="${TIPS.keep}">Keep</button>`;
      const sig = JSON.stringify(f);
      if (!b) {
        const blk = document.createElement('section');
        blk.className = 'rv-blk';
        b = { key, path: f.path, el: blk, view: null, mtime: 0, text: '', base: '', ro: false, open: true, merge: null };
        blocks.set(key, b);
        blk.dataset.sig = '';
      }
      if (b.el.dataset.sig !== sig) {
        const code = b.el.querySelector('.rv-code');
        b.el.innerHTML = head(name, dir, rowLabel(f), acts, key);
        if (code && b.view) b.el.querySelector('.rv-code')!.replaceWith(code);
        else if (f.none) b.el.querySelector('.rv-code')!.innerHTML = `<p class="rv-note">Restore points keep no copy of this file from before (${esc(f.none)}): the tool card's open diff shows each edit.</p>`;
        else if (f.bin) b.el.querySelector('.rv-code')!.innerHTML = '<p class="rv-note">Not text: no lines to show.</p>';
        else refill(b);
        if (b.el.dataset.sig && b.view) refill(b);
        b.el.dataset.sig = sig;
        foldBlock(b, b.open);
      }
      if (body.children[i] !== b.el) body.insertBefore(b.el, body.children[i] || null);
    });
  }

  async function drawAll(load = false) {
    if (!turns || load) {
      try {
        turns = await editTurns(chat);
      } catch (e) {
        return showErr(e);
      }
    }
    if (stopped || part !== 'all') return;
    const wn = want ? turns.find((t) => t.files.some((f) => f.path === want)) : null;
    if (wn) openTurns.add(wn.n);
    if (!openTurns.size && turns[0]) openTurns.add(turns[0].n);
    for (const [k, b] of blocks) if (b.turn == null) (b.view?.destroy(), blocks.delete(k));
    if (!turns.length) {
      body.innerHTML = `<div class="rv-empty"><b>No changes yet</b><span>Once this chat changes a file, every turn shows here, in any mode.</span></div>`;
      return;
    }
    body.innerHTML = turns
      .map((t) => {
        const [a, d] = t.files.reduce((s, f) => [s[0] + f.add, s[1] + f.del], [0, 0]);
        const mode = t.mode ? MODE[t.mode] || t.mode : '';
        return `<section class="rv-turn${openTurns.has(t.n) ? '' : ' shut'}" data-n="${t.n}"><button type="button" class="rv-th" data-rv="turn" data-n="${t.n}" aria-expanded="${openTurns.has(t.n)}"><svg class="ic rv-tchev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg><b>turn ${t.n}</b>${mode ? `<span class="ed-tag${/auto|bypass|skip/i.test(t.mode!) ? ' auto' : ''}">${esc(mode)}</span>` : ''}<span class="rv-tw">${esc(t.words || '')}</span><span class="rv-tt">${when(t.t1)}</span><span class="ed-c">${plural(t.files.length, 'file')} ${counts(a, d)}</span></button><div class="rv-tb"></div></section>`;
      })
      .join('');
    for (const t of turns) if (openTurns.has(t.n)) fillTurn(t);
  }
  function fillTurn(t: Turn) {
    const box = body.querySelector<HTMLElement>(`.rv-turn[data-n="${t.n}"] .rv-tb`);
    if (!box || box.childElementCount) return;
    for (const f of t.files) {
      const key = `t${t.n}:${f.path}`, [name, dir] = split(f.path);
      const blk = document.createElement('section');
      blk.className = 'rv-blk';
      blk.innerHTML = head(name, dir, f.bin ? '<span class="ed-tag">binary</span>' : '', `<span class="ed-c">${f.bin ? '' : counts(f.add, f.del)}</span>`, key);
      box.append(blk);
      const b: Block = { key, path: f.path, el: blk, view: null, mtime: 0, text: '', base: '', ro: true, turn: t.n, open: true, merge: null };
      blocks.set(key, b);
      if (f.bin) blk.querySelector('.rv-code')!.innerHTML = '<p class="rv-note">Not text: no lines to show.</p>';
      else
        turnFile(chat, t.n, f.path)
          .then((d) => (mount(b, d.before, d.after), q && runFind(false)))
          .catch((e) => (blk.querySelector('.rv-code')!.innerHTML = `<p class="rv-note">${esc(e.message)}</p>`));
    }
  }

  function paintTop() {
    const rows = editsOf(chat)?.files || [];
    const [a, d] = rows.reduce((s, f) => [s[0] + f.add, s[1] + f.del], [0, 0]);
    el.querySelector('.rv-n')!.textContent = rows.length ? String(rows.length) : '';
    el.querySelectorAll<HTMLElement>('[data-rv="part"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.p === part)));
    const live = part === 'review' && rows.length > 0;
    el.querySelector('.rv-sum')!.innerHTML = live ? `${plural(rows.length, 'file')} <span class="ed-c">${counts(a, d)}</span>` : '';
    el.querySelectorAll<HTMLElement>('[data-rv="reject"], [data-rv="keep"]').forEach((b) => (b.hidden = !live));
  }
  function draw() {
    if (stopped) return;
    paintTop();
    if (part === 'review') (drawReview(), land());
    else drawAll().then(land);
  }
  function wanted() {
    if (!want) return null;
    if (part === 'review') return blocks.get('r:' + want) || null;
    const n = turns?.find((t) => t.files.some((f) => f.path === want))?.n;
    return n == null ? null : blocks.get(`t${n}:${want}`) || null;
  }
  function land() {
    const b = wanted();
    if (!b) return;
    if (!b.open) foldBlock(b, true);
    body.scrollTop += b.el.getBoundingClientRect().top - body.getBoundingClientRect().top;
  }
  function show(path: string) {
    want = path;
    if (!ready) return;
    const rows = editsOf(chat)?.files || [];
    const p = rows.some((f) => f.path === path) ? 'review' : 'all';
    if (p === 'all') {
      const n = turns?.find((t) => t.files.some((f) => f.path === path))?.n;
      if (n != null) openTurns.add(n);
    }
    if (p !== part) return setPart(p);
    if (p === 'all' && turns) return drawAll().then(land);
    land();
  }
  body.addEventListener('wheel', () => (want = null), { passive: true });
  body.addEventListener('pointerdown', () => (want = null));
  el.addEventListener('keydown', (e) => ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key) && (want = null));
  function setPart(p: 'review' | 'all') {
    if (p === part) return;
    part = p;
    for (const b of blocks.values()) b.view?.destroy();
    blocks.clear();
    body.innerHTML = '';
    if (p === 'all') turns = null;
    draw();
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-rv]');
    if (!b) return;
    const blk = blocks.get(b.dataset.k || ''), rows = editsOf(chat)?.files || [];
    const row = blk && rows.find((f) => f.path === blk.path);
    switch (b.dataset.rv) {
      case 'part':
        return setPart(b.dataset.p as 'review' | 'all');
      case 'dock':
        return o.dock();
      case 'reject':
        return rejectAll(chat, rows, b);
      case 'keep':
        return keepSome(chat, rows.filter((f) => !f.none).map((f) => f.path), b);
      case 'r1':
        return row && rejectSome(chat, [row.path], b);
      case 'k1':
        return row && keepSome(chat, [row.path], b);
      case 'fold':
        return blk && foldBlock(blk, !blk.open);
      case 'open':
        return blk && openAt(blk);
      case 'turn': {
        const n = +b.dataset.n!, t = turns?.find((x) => x.n === n);
        if (openTurns.has(n)) openTurns.delete(n);
        else openTurns.add(n);
        b.closest('.rv-turn')!.classList.toggle('shut', !openTurns.has(n));
        b.setAttribute('aria-expanded', String(openTurns.has(n)));
        if (t && openTurns.has(n)) fillTurn(t);
        return;
      }
      case 'prev':
        return step(-1);
      case 'next':
        return step(1);
      case 'unfind':
        return closeFind();
    }
  });
  function openAt(b: Block) {
    const l = editsOf(chat);
    const abs = l?.top ? l.top.replace(/[\\/]+$/, '') + '/' + b.path : b.path;
    const ch = b.view && L ? L.getChunks(b.view.state)?.chunks[0] : null;
    const line = ch && b.view ? b.view.state.doc.lineAt(ch.fromB).number : 1;
    if (POP) return send('openrev', { chat, path: abs, line });
    page.openReviewFile?.(chat, abs, line);
  }

  const off = onEdits((c) => c === chat && draw());
  codeLib().then((lib) => {
    L = lib;
    findFx = L.StateEffect.define();
    loadEdits(chat).then((l) => {
      if (stopped) return;
      ready = true;
      if (!l?.files.length && l?.changed) part = 'all';
      if (want) return show(want);
      draw();
    });
  });
  return {
    el,
    refresh: () => editsSoon(chat, 0),
    show,
    find: openFind,
    stop() {
      stopped = true;
      off();
      for (const b of blocks.values()) b.view?.destroy();
      blocks.clear();
    },
  };
}

type Shell = { el: HTMLElement; v: ReturnType<typeof reviewView>; fr: any };
const shells = new Map<string, Shell>();
let float: typeof import('../app/float.ts') | null = null;
const titleOf = (chat: string) => agents.all.get(chat)?.title || 'a chat';
function shell(chat: string) {
  const el = document.createElement('section');
  el.className = 'box qtwin revwin';
  el.setAttribute('aria-label', 'Review');
  el.innerHTML = `<div class="fw-head"><span class="qt-name"><span class="rv-gem">±</span><span class="nm">Review</span><span class="rv-of dim"></span></span><span class="szs"></span><button class="x" data-rv-close aria-label="close" title="Close&#10;The review stays; ± in the chat's header opens it again.">${ICONS.wx}</button></div><div class="qt-body"></div>${RS}`;
  ($('#app') || document.body).append(el);
  const v = reviewView(chat, { docked: false, dock: () => dock(chat), close: () => close(chat) });
  el.querySelector('.qt-body')!.append(v.el);
  const s: Shell = { el, v, fr: null };
  el.querySelector('[data-rv-close]')!.addEventListener('click', () => close(chat));
  el.addEventListener('pointerdown', () => raise(el));
  if (float) s.fr = float.frame(el, 'revWin', () => float!.preset(2));
  shells.set(chat, s);
  title(chat);
  return s;
}
function title(chat: string) {
  const at = shells.get(chat)?.el.querySelector('.rv-of');
  if (at) at.textContent = ` · ${titleOf(chat)}`;
  if (SOLO === `review-${chat}`) document.title = amTag + `Review · ${titleOf(chat)}`;
}
let top = 34;
const raise = (el: HTMLElement) => (el.style.zIndex = String(++top));
function close(chat: string) {
  const s = shells.get(chat);
  if (!s) return;
  s.v.stop();
  s.el.remove();
  shells.delete(chat);
  if (SOLO === `review-${chat}`) window.close();
}
function dock(chat: string) {
  if (SOLO) {
    send('reviewtab', { chat });
    return window.close();
  }
  close(chat);
  page.reviewTab?.(chat);
}

export function openReview(chat: string, path?: string | null) {
  if (!chat) return;
  if (OWN && !SOLO.startsWith('review-'))
    return void import('../app/float.ts').then((f) =>
      f.soloOut(`review-${chat}`, { more: path ? `&at=${encodeURIComponent(path)}` : '', msgs: path ? [['revto', { chat, path }]] : [], warm: ['claimrev', { chat, path: path || null }] }),
    );
  const s = shells.get(chat) || shell(chat);
  raise(s.el);
  s.v.refresh();
  if (path) s.v.show(path);
  s.fr?.fit();
}

function beReview(chat: string, path?: string | null) {
  document.documentElement.classList.add('xsolo', 'xrev');
  const s = shell(chat);
  if (path) s.v.show(path);
  onAgents(() => title(chat));
}
if (SOLO.startsWith('review-')) beReview(SOLO.slice('review-'.length), new URLSearchParams(location.search).get('at'));
else if (!OWN) {
  import('../app/float.ts').then((f) => {
    float = f;
    shells.forEach((s) => ((s.fr = f.frame(s.el, 'revWin', () => f.preset(2))), s.fr.fit()));
  });
  onAgents(() => shells.forEach((_, chat) => title(chat)));
}
if (POP)
  on('revto', (m) => {
    if (!forMe(m) || SOLO !== `review-${m.chat}` || typeof m.path !== 'string') return;
    shells.get(String(m.chat))?.v.show(m.path);
  });
if (isSpare())
  on('claimrev', (m) => {
    if (!forMe(m) || !isSpare() || !m.chat) return;
    claim(`review-${m.chat}`);
    beReview(String(m.chat), typeof m.path === 'string' ? m.path : null);
    page.render?.();
    send('raised');
  });
