type Go = (row: HTMLElement | undefined) => void;
export function roving(root: HTMLElement, sel: string, { across = false, group = null, pick = false, on = {}, mark = null }: { across?: boolean; group?: string | null; pick?: boolean; on?: Record<string, (row: HTMLElement, go: Go, rows: HTMLElement[]) => unknown>; mark?: ((r: any) => unknown) | null } = {}) {
  const rowsOf = (row: HTMLElement) => [...(group ? row.closest(group)! : root).querySelectorAll<HTMLElement>(sel)];
  const go = (row: HTMLElement | undefined) => {
    if (!row) return;
    for (const r of rowsOf(row)) r.tabIndex = r === row ? 0 : -1;
    row.focus();
    if (pick) row.click();
  };
  const [back, fwd] = across ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  root.addEventListener('keydown', (e) => {
    const row = e.target as HTMLElement;
    if (!row.matches?.(sel) || e.ctrlKey || e.altKey || e.metaKey) return;
    const rows = rowsOf(row), i = rows.indexOf(row);
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      const r = row.getBoundingClientRect();
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 16, clientY: r.bottom }));
      document.querySelector<HTMLElement>('#colormenu:not([hidden]) button')?.focus();
    } else if (e.shiftKey) return;
    else if (on[e.key]) on[e.key](row, go, rows);
    else if (e.key === back || e.key === fwd) go(rows[i + (e.key === fwd ? 1 : -1)]);
    else if (e.key === 'Home' || e.key === 'End') go(rows[e.key === 'Home' ? 0 : rows.length - 1]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  if (!mark) return;
  const idOf = (r: HTMLElement) => r.dataset.open ?? r.dataset.dir ?? ('inbox' in r.dataset ? '#inbox' : r.querySelector<HTMLElement>('[data-toggle]')?.dataset.toggle);
  let last: string | null | undefined = null, at = 0, inside = false;
  document.addEventListener('focusin', (e) => {
    inside = root.contains(e.target as Node | null);
    if (inside && (e.target as Element).matches(sel)) {
      last = idOf(e.target as HTMLElement);
      at = [...root.querySelectorAll<HTMLElement>(sel)].indexOf(e.target as HTMLElement);
    }
  });
  document.addEventListener('pointerdown', (e) => (inside = root.contains(e.target as Node | null)), true);
  new MutationObserver((recs) => {
    for (const rec of recs)
      for (const r of rec.addedNodes)
        if (r instanceof HTMLElement && r.matches(sel)) {
          r.tabIndex = -1;
          mark(r);
        }
    const rows = [...root.querySelectorAll<HTMLElement>(sel)];
    const cur = rows.find((r) => last != null && idOf(r) === last) || (inside && rows[Math.min(at, rows.length - 1)]) || rows.find((r) => r.classList.contains('on')) || rows[0];
    if (!cur) return;
    for (const r of root.querySelectorAll<HTMLElement>('[tabindex="0"]')) if (r !== cur && r.matches(sel)) r.tabIndex = -1;
    cur.tabIndex = 0;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (inside && lost) cur.focus({ preventScroll: true });
  }).observe(root, { childList: true });
}

export function litOnHover(list: HTMLElement, key: string, at: () => number, go: (i: number) => void, swap = true) {
  list.addEventListener('pointermove', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>(`[data-${key}]`), i = row ? +row.dataset[key]! : NaN;
    if (!row || !list.contains(row) || i === at()) return;
    if (swap) {
      list.querySelector('.on')?.classList.remove('on');
      row.classList.add('on');
    }
    go(i);
  });
}
