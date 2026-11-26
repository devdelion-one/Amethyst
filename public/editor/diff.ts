import { ask, barMenu } from '../base/controls.ts';
import { esc } from '../base/util.ts';
import type { DiffNotes, DiffParts, FileDiff } from '../base/types.ts';
import { lineDiff, type Op } from '../base/linediff.ts';

type Row = { same?: boolean; ln: number | null; rn: number | null; l: string | null; r: string | null };

barMenu('.df-head', '');

const CTX = 3;
const FOLD = 8;

function rows(ops: Op[]) {
  const out: Row[] = [];
  let o = 0, n = 0;
  for (let k = 0; k < ops.length; ) {
    if (ops[k][0] === 'same') {
      out.push({ same: true, ln: ++o, rn: ++n, l: ops[k][1], r: ops[k][2] });
      k++;
      continue;
    }
    const dels: (string | null)[] = [], adds: (string | null)[] = [];
    for (; k < ops.length && ops[k][0] !== 'same'; k++) (ops[k][0] === 'del' ? dels : adds).push(ops[k][0] === 'del' ? ops[k][1] : ops[k][2]);
    for (let i = 0; i < Math.max(dels.length, adds.length); i++)
      out.push({ ln: i < dels.length ? ++o : null, l: dels[i] ?? null, rn: i < adds.length ? ++n : null, r: adds[i] ?? null });
  }
  return out;
}

const cell = (num: number | null, text: string | null, cls: string, side: string) => `<span class="df-n"${num ? ` data-side="${side}" data-line="${num}"` : ''}>${num ?? ''}</span><span class="df-t ${text == null ? 'none' : cls}">${text == null ? '' : esc(text) || ' '}</span>`;
function liner(notes?: DiffNotes) {
  const at = (side: string, n: number | null) => (n ? (notes?.list || []).filter((x) => x.side === side && x.line === n).map((x) => `<div class="df-note">${x.html}</div>`).join('') : '');
  return (r: Row) => `<div class="df-row">${cell(r.ln, r.l, r.same ? '' : 'del', 'old')}${cell(r.rn, r.r, r.same ? '' : 'add', 'new')}</div>${at('old', r.same ? null : r.ln)}${at('new', r.rn)}`;
}

function block(all: Row[], folds: Row[][], line: (r: Row) => string, before: (run: number) => string) {
  let html = '', run = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j < all.length && all[j].same) j++;
    const n = j - i, head = i === 0, tail = j === all.length;
    const keepA = head ? 0 : CTX, keepB = tail ? 0 : CTX;
    if (n > FOLD && n > keepA + keepB) {
      html += all.slice(i, i + keepA).map(line).join('');
      folds.push(all.slice(i + keepA, j - keepB));
      html += `<button class="df-fold" data-fold="${folds.length - 1}">⋯ ${n - keepA - keepB} unchanged lines</button>`;
      html += all.slice(j - keepB, j).map(line).join('');
    } else html += all.slice(i, j).map(line).join('');
    i = j;
    if (i < all.length) html += before(run++);
    while (i < all.length && !all[i].same) html += line(all[i++]);
  }
  return html;
}

const TIPS = {
  on: 'Staged part\nThe next commit takes this part; the rest of the file waits.\n\nUncheck to take it out of the stage.',
  off: 'Stage this part\nThe next commit takes this part; the rest of the file waits.',
  half: 'Partly staged\nSome of these lines were staged from a terminal. Check to stage the whole part.',
};
function partBar(p: DiffParts | undefined) {
  if (!p || p.runs.length === 0) return () => '';
  return (run: number) => {
    const k = p.runs[run];
    if (k == null || p.runs.indexOf(k) !== run) return '';
    const s = p.list[k], half = s === 'part';
    return `<div class="df-part"><label class="df-pk" title="${esc(half ? TIPS.half : s ? TIPS.on : TIPS.off)}" data-tip-icon="check"><input type="checkbox" data-df-stage="${k}"${s === true ? ' checked' : ''}${half ? ' data-half' : ''}>commit this part</label><button class="df-pb" data-df-drop="${k}" title="Discard\nThese lines go back to the last commit.\n\nUndo is offered after.">discard…</button></div>`;
  };
}

export function createDiff(d: FileDiff, { openFile }: { openFile: (rel: string) => unknown }) {
  const el = document.createElement('div');
  el.className = 'diff';
  el.tabIndex = -1;
  let folds: Row[][] = [], gen = d.parts?.gen() ?? 0, busy = false;
  const line = liner(d.notes);
  el.innerHTML = `<header class="df-head"><b>${esc(d.path.split(/[\\/]/).pop())}</b><span class="dim df-path">${esc(d.path)}</span>
    <span class="df-sum"></span><span class="grow"></span><span class="dim df-said"></span><button class="outline df-undo" data-df-undo hidden>undo</button>
    ${d.rel ? `<button class="outline" data-df-open>open the file</button>` : ''}</header>
    <div class="df-cols"><span>${!d.oldText ? 'new file' : 'before'}</span><span>after</span></div>${d.notes?.hint ? `<p class="dim df-hint">${esc(d.notes.hint)}</p>` : ''}
    <div class="df-body"></div>`;
  const body = el.querySelector<HTMLElement>('.df-body')!, said = el.querySelector<HTMLElement>('.df-said')!, undo = el.querySelector<HTMLButtonElement>('.df-undo')!;
  function paint() {
    const ops = lineDiff(d.oldText, d.newText);
    const added = ops.filter((x) => x[0] === 'add').length, removed = ops.filter((x) => x[0] === 'del').length;
    el.querySelector('.df-sum')!.innerHTML = `<span class="add">+${added}</span> <span class="del">−${removed}</span>`;
    folds = [];
    const top = body.scrollTop;
    body.innerHTML = added || removed ? block(rows(ops), folds, line, partBar(d.parts)) : '<p class="dim df-none">no change</p>';
    for (const c of body.querySelectorAll<HTMLInputElement>('[data-df-stage]')) c.indeterminate = 'half' in c.dataset;
    body.scrollTop = top;
    if (d.parts) gen = d.parts.gen();
  }
  paint();
  async function act(what: 'stage' | 'unstage' | 'discard' | 'undo' | 'fresh', k?: number) {
    if (!d.parts || busy) return;
    busy = true;
    el.classList.add('df-busy');
    const was = JSON.stringify([d.oldText, d.newText, d.parts.list, d.parts.runs]);
    try {
      const r = await d.parts.act(what, k);
      if (r.oldText != null) d.oldText = r.oldText;
      if (r.newText != null) d.newText = r.newText;
      if (what !== 'fresh' || r.line) {
        said.textContent = r.line || '';
        said.classList.toggle('err', !!r.err);
        undo.hidden = !r.undo;
      }
      if (what === 'fresh' && !r.line && JSON.stringify([d.oldText, d.newText, d.parts.list, d.parts.runs]) === was) gen = d.parts.gen();
      else paint();
    } finally {
      busy = false;
      el.classList.remove('df-busy');
    }
  }
  const stale = () => d.parts && !busy && d.parts.gen() !== gen && act('fresh');
  el.addEventListener('pointerenter', stale);
  el.addEventListener('click', async (e) => {
    const t = e.target as Element;
    const f = t.closest('[data-fold]') as HTMLElement;
    if (f) return f.replaceWith(Object.assign(document.createElement('template'), { innerHTML: folds[+f.dataset.fold!].map(line).join('') }).content);
    if (t.closest('[data-df-open]')) openFile(d.rel!);
    if (t.closest('[data-df-undo]')) return act('undo');
    const box = t.closest<HTMLInputElement>('[data-df-stage]');
    if (box) return act(d.parts?.list[+box.dataset.dfStage!] === true ? 'unstage' : 'stage', +box.dataset.dfStage!);
    const drop = t.closest<HTMLElement>('[data-df-drop]');
    if (drop) {
      const k = +drop.dataset.dfDrop!;
      if (await ask({ title: `Discard this part of ${d.path.split(/[\\/]/).pop()}?`, text: 'Its lines go back to how they are in the last commit, in the file and in the stage. The rest of the file stays. Undo is offered after.', confirm: true })) act('discard', k);
      return;
    }
    const n = t.closest<HTMLElement>('.df-n[data-line]');
    if (n && d.notes?.write) return writeNote(n);
    const cancel = t.closest('[data-df-cancel]');
    if (cancel) return cancel.closest('.df-write')!.remove();
    const add = t.closest<HTMLElement>('[data-df-add]');
    if (add) {
      const box = add.closest<HTMLElement>('.df-write')!, text = box.querySelector('textarea')!.value.trim();
      if (!text) return;
      add.setAttribute('disabled', '');
      d.notes!.write!(box.dataset.side as 'old' | 'new', +box.dataset.line!, text).then(
        (html) => (html ? box.replaceWith(Object.assign(document.createElement('div'), { className: 'df-note', innerHTML: html })) : box.remove()),
        () => add.removeAttribute('disabled'),
      );
    }
  });
  function writeNote(n: HTMLElement) {
    el.querySelector('.df-write')?.remove();
    const row = n.closest('.df-row')!;
    let after: Element = row;
    while (after.nextElementSibling?.classList.contains('df-note')) after = after.nextElementSibling;
    after.insertAdjacentHTML('afterend', `<div class="df-write" data-side="${n.dataset.side}" data-line="${n.dataset.line}"><textarea rows="3" placeholder="a comment on line ${n.dataset.line}"></textarea><div class="df-wrow"><button class="primary" data-df-add>add</button><button data-df-cancel>cancel</button></div></div>`);
    (after.nextElementSibling!.querySelector('textarea') as HTMLTextAreaElement).focus();
  }
  return el;
}
