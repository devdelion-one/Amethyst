import { counts, editsOf, editsSoon, keepSome, loadEdits, onEdits, rejectAll, rejectSome, rowLabel, rowTip, TIPS } from '../base/edits.ts';
import type { EditRow } from '../base/edits.ts';
import { tell } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { esc } from '../base/util.ts';
import { plural } from '../base/words.ts';
import { onOutside } from '../base/lift.ts';


export const editsBar = (n = '', c = '') => `<div class="ed-bar"><button type="button" class="ed-tg" data-ed="fold" aria-expanded="false"><svg class="ic chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg><span class="ed-t">Edits</span><span class="ed-n">${esc(n)}</span><span class="ed-c">${c}</span></button><span class="grow"></span><button type="button" class="ed-b" data-ed="review" title="${TIPS.review}">Review</button><button type="button" class="ed-b" data-ed="reject" title="${TIPS.rejectAll}">Reject all</button><button type="button" class="ed-b pri" data-ed="keep" title="${TIPS.keepAll}">Keep all</button></div>`;
export function editsStrip(chatOf: () => string | null | undefined, { review, openFile, beside }: { review: (path?: string) => void; openFile: (abs: string, rel: string) => void; beside: () => boolean }) {
  const el = document.createElement('div');
  el.className = 'ch-edits';
  el.hidden = true;
  el.innerHTML = `<div class="ed-list" role="list"></div>${editsBar()}`;
  const list = el.querySelector<HTMLElement>('.ed-list')!, tg = el.querySelector<HTMLElement>('.ed-tg')!;
  let open = false, rows: EditRow[] = [];
  const rowTitle = (f: EditRow) => (f.none ? `${f.path}\nThere is no copy from before, so only the tool card's open diff shows its edits.` : beside() ? `${f.path}\nClick to open it beside this chat, with the changes marked.` : `${f.path}\nClick to show it in the Review window, with the changes marked.`);
  list.addEventListener('pointerenter', () => list.querySelectorAll<HTMLElement>('.ed-row[data-i]').forEach((r) => rows[+r.dataset.i!] && (r.title = rowTitle(rows[+r.dataset.i!]))));
  const fold = (on: boolean) => {
    open = on && rows.length > 0;
    el.classList.toggle('open', open);
    tg.setAttribute('aria-expanded', String(open));
  };
  function draw() {
    const chat = chatOf(), l = chat ? editsOf(chat) : null;
    rows = l?.files || [];
    el.hidden = !rows.length || !pref('edits:strip');
    el.closest('.chat')?.classList.toggle('has-edits', !el.hidden);
    if (el.hidden) return fold(false);
    const [a, d] = rows.reduce((s, f) => [s[0] + f.add, s[1] + f.del], [0, 0]);
    el.querySelector('.ed-n')!.textContent = plural(rows.length, 'file');
    el.querySelector('.ed-c')!.innerHTML = counts(a, d);
    list.innerHTML = rows
      .map((f, i) => {
        const at = f.path.lastIndexOf('/'), name = f.path.slice(at + 1), dir = at > 0 ? f.path.slice(0, at) : '';
        const acts = f.none ? '' : `<span class="ed-acts"><button type="button" class="ed-b" data-ed="r1" data-i="${i}" title="${rowTip(f)}">Reject</button><button type="button" class="ed-b pri" data-ed="k1" data-i="${i}" title="${TIPS.keep}">Keep</button></span>`;
        return `<div class="ed-row${f.gone ? ' gone' : ''}" role="listitem" data-ed="open" data-i="${i}" title="${esc(rowTitle(f))}" data-tip-mono><span class="ed-nm">${esc(name)}</span><span class="ed-dir">${esc(dir)}</span>${rowLabel(f)}<span class="ed-c">${f.none || f.bin ? '' : counts(f.add, f.del)}</span>${acts}</div>`;
      })
      .join('');
    if (open) fold(true);
  }
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ed]'), chat = chatOf();
    if (!b || !chat) return;
    const f = rows[+b.dataset.i!];
    switch (b.dataset.ed) {
      case 'fold':
        return fold(!open);
      case 'review':
        fold(false);
        return review();
      case 'reject':
        fold(false);
        return rejectAll(chat, rows, b);
      case 'keep':
        fold(false);
        return keepSome(chat, rows.filter((x) => !x.none).map((x) => x.path), b);
      case 'r1':
        e.stopPropagation();
        return rejectSome(chat, [f.path], b);
      case 'k1':
        e.stopPropagation();
        return keepSome(chat, [f.path], b);
      case 'open': {
        if (f.none) return tell(b, { title: 'No copy from before', line: `restore points keep none of this file (${f.none}): the tool card's open diff shows each edit`, ms: 3000 });
        const l = editsOf(chat);
        fold(false);
        return openFile(l?.top ? l.top.replace(/[\\/]+$/, '') + '/' + f.path : f.path, f.path);
      }
    }
  });
  const offOut = onOutside([el], () => open && fold(false));
  const off = onEdits((c) => c === chatOf() && draw());
  return {
    el,
    load: () => {
      const c = chatOf();
      if (c) loadEdits(c);
    },
    soon: () => {
      const c = chatOf();
      if (c) editsSoon(c);
    },
    draw,
    stop: () => (off(), offOut()),
  };
}
