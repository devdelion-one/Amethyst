import { editFile, keepBase, noteReject, onEdits, reviewOf } from './edits.ts';
import { tell } from './notify.ts';
import { agents } from './stream.ts';
import type { EditorView } from '/vendor/codemirror.mjs';
import { quietly } from './util.ts';

type Rev = { chat: string; rel: string; base: string };
const FOLLOW = ['input', 'delete', 'move'];

export function markButton(type: 'accept' | 'reject', run: (btn: HTMLElement) => void) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `ed-b rv-mc${type === 'accept' ? ' pri' : ''}`;
  btn.textContent = type === 'accept' ? 'Keep' : 'Reject';
  btn.title = type === 'accept' ? 'Keep\nKeeps this change: the file stays as it is on disk, and the marks go away.' : 'Reject\nThese lines go back to how they were. The file saves as you type.';
  btn.onmousedown = (e) => {
    e.preventDefault();
    run(btn);
  };
  return btn;
}

export function chunkMeta(L: any) {
  const lines = (doc: any, from: number, to: number) => (to <= from ? 0 : doc.lineAt(Math.max(from, to - 1)).number - doc.lineAt(from).number + 1);
  const paint = (view: EditorView) => {
    const chunks = L.getChunks(view.state)?.chunks;
    if (!chunks?.length) return;
    const orig = L.getOriginalDoc(view.state);
    for (const bar of view.contentDOM.querySelectorAll<HTMLElement>('.cm-deletedChunk > .cm-chunkButtons')) {
      let pos: number;
      try {
        pos = view.posAtDOM(bar);
      } catch {
        continue;
      }
      const idx = chunks.findIndex((c: any) => pos >= c.fromB && pos <= Math.max(c.toB, c.fromB));
      if (idx < 0) continue;
      const c = chunks[idx];
      const del = lines(orig, c.fromA, c.toA), add = lines(view.state.doc, c.fromB, c.toB);
      let meta = bar.querySelector<HTMLElement>(':scope > .rv-ch-meta');
      if (!meta) {
        meta = document.createElement('span');
        meta.className = 'rv-ch-meta';
        bar.prepend(meta);
      }
      const sig = `${idx + 1}:${del}:${add}`;
      if (meta.dataset.sig === sig) continue;
      meta.dataset.sig = sig;
      meta.innerHTML = `<span class="rv-ch-lbl">Change ${idx + 1}</span><span class="rv-ch-cnt">${del ? `<span class="c-del">-${del}</span>` : ''}${add ? `<span class="c-add">+${add}</span>` : ''}</span>`;
    }
  };
  return L.ViewPlugin.fromClass(
    class {
      constructor(view: EditorView) {
        queueMicrotask(() => paint(view));
      }
      update(u: any) {
        paint(u.view);
      }
    },
  );
}

export function reviewMarks(L: any, absOf: () => string | null, bar: (text: string) => void) {
  const comp = new L.Compartment();
  let view: EditorView | null = null, rev: Rev | null = null, post = 0, gen = 0, off: (() => unknown) | null = null;

  const merge = (base: string) =>
    L.unifiedMergeView({
      original: base,
      gutter: true,
      highlightChanges: false,
      syntaxHighlightDeletions: true,
      allowInlineDiffs: false,
      mergeControls: (type: 'accept' | 'reject') =>
        markButton(type, (btn) => {
          if (!view || !rev) return;
          const pos = view.posAtDOM(btn);
          if (type === 'accept') return void L.acceptChunk(view, pos);
          const ch = L.getChunks(view.state)?.chunks.find((c: any) => pos >= c.fromB && pos <= Math.max(c.toB, c.fromB));
          const back = ch ? L.getOriginalDoc(view.state).sliceString(ch.fromA, ch.toA).replace(/\n$/, '') : '';
          const line = ch ? view.state.doc.lineAt(ch.fromB).number : 0;
          if (!L.rejectChunk(view, pos)) return tell(btn, { title: 'Nothing to reject here', line: 'the change moved: try again', ms: 2000 });
          noteReject(rev.chat, rev.rel, back ? `from line ${line}, back to:\n${back}` : `the lines you added at line ${line} are gone again`);
        }),
    });

  const follow = L.EditorState.transactionExtender.of((tr: any) => {
    if (!rev || !tr.docChanged || !FOLLOW.some((k) => tr.isUserEvent(k))) return null;
    const chunks = L.getChunks(tr.startState)?.chunks;
    if (!chunks) return null;
    const specs: { from: number; to: number; insert: string }[] = [];
    tr.changes.iterChanges((from: number, to: number, _fb: number, _tb: number, ins: any) => {
      if (chunks.some((c: any) => from <= c.toB && to >= c.fromB)) return;
      let delta = 0;
      for (const c of chunks) if (c.toB <= from) delta += c.toA - c.fromA - (c.toB - c.fromB);
      specs.push({ from: from + delta, to: to + delta, insert: ins.toString() });
    });
    if (!specs.length) return null;
    const orig = L.getOriginalDoc(tr.startState);
    return { effects: L.originalDocChangeEffect(tr.startState, L.ChangeSet.of(specs, orig.length)) };
  });

  const posted = L.EditorView.updateListener.of((u: any) => {
    if (!rev || !u.transactions.some((t: any) => t.effects.some((e: any) => e.is(L.updateOriginalDoc)))) return;
    clearTimeout(post);
    post = setTimeout(() => {
      if (!rev || !view) return;
      const b = L.getOriginalDoc(view.state).toString();
      if (b === rev.base) return;
      rev.base = b;
      quietly(keepBase(rev.chat, rev.rel, b));
    }, 500) as unknown as number;
  });

  async function sync() {
    if (!view) return;
    const abs = absOf(), hits = abs ? reviewOf(abs) : [], my = ++gen;
    if (!hits.length) {
      if (rev) {
        rev = null;
        view.dispatch({ effects: comp.reconfigure([]) });
      }
      return bar('');
    }
    const h = hits[0];
    let base: string;
    try {
      base = ((await editFile(h.chat, h.row.path)).base ?? '').replace(/\r\n?/g, '\n');
    } catch {
      return;
    }
    if (my !== gen || !view) return;
    const others = hits.slice(1).map((x) => agents.all.get(x.chat)?.title || 'another chat');
    bar(others.length ? `${others.join(', ')} changed this file too. The marks start from the oldest copy, so they can include ${others.length > 1 ? 'their' : 'its'} changes.` : '');
    if (rev && rev.chat === h.chat && rev.rel === h.row.path && rev.base === base) return;
    rev = { chat: h.chat, rel: h.row.path, base };
    view.dispatch({ effects: comp.reconfigure(merge(base)) });
  }

  return {
    ext: [comp.of([]), follow, posted, chunkMeta(L)],
    attach(v: EditorView) {
      view = v;
      off ||= onEdits(() => sync());
      sync();
    },
    sync,
    stop() {
      off?.();
      off = null;
      clearTimeout(post);
      view = null;
    },
  };
}
