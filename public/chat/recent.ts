export const BUDGET = 4000;

type Opts = {
  on: () => boolean;
  may: () => boolean;
  pinned: () => boolean;
  stay: () => void;
  keep: () => void;
  paint: (rows: HTMLElement[]) => void;
  shown: (rows: HTMLElement[]) => void;
};

const weight = (e: Element) => 1 + e.getElementsByTagName('*').length;
const isTurn = (e: Element) => e.classList.contains('ch-you');

export function recentRows(log: HTMLElement, flow: HTMLElement, { on, may, pinned, stay, keep, paint, shown }: Opts) {
  const held: HTMLElement[] = [];
  let more: HTMLButtonElement | null = null, raf = 0;

  const rows = () => [...flow.children].filter((e) => e !== more && !e.classList.contains('ch-working')) as HTMLElement[];
  function showMore() {
    if (!held.length) return void (more?.remove(), (more = null));
    if (!more) {
      more = document.createElement('button');
      more.type = 'button';
      more.className = 'ch-earlier';
    }
    if (flow.firstElementChild !== more) flow.prepend(more);
    const n = held.length;
    more.textContent = `show earlier · ${n} row${n === 1 ? '' : 's'}`;
  }
  function startOf(list: HTMLElement[], i: number) {
    while (i > 0 && !isTurn(list[i])) i--;
    return i;
  }
  function hold(list: HTMLElement[], i: number) {
    const cut = Math.min(startOf(list, i), list.findLastIndex(isTurn));
    if (cut <= 0) return false;
    const out = list.slice(0, cut);
    for (const e of out) e.remove();
    held.push(...out);
    showMore();
    return true;
  }

  function trim() {
    if (!on() || !may() || !pinned()) return;
    if (flow.getElementsByTagName('*').length <= 2 * BUDGET) return;
    const list = rows();
    let i = list.length, sum = 0;
    while (i > 0 && sum < BUDGET) sum += weight(list[--i]);
    hold(list, i);
  }

  function settle() {
    const list = rows();
    if (!on() || !may() || !pinned()) return paint(list);
    let i = list.length, sum = 0, at = -1, over = false;
    while (i > 0 && !over) {
      paint([list[--i]]);
      sum += weight(list[i]);
      over = sum > 2 * BUDGET;
      if (at >= 0 || sum < BUDGET) continue;
      at = i;
      let least = sum;
      for (let k = 0; k < i && least <= 2 * BUDGET; k++) least += weight(list[k]);
      over = least > 2 * BUDGET;
    }
    if (!over || !hold(list, at)) return paint(list);
    paint(rows());
  }

  function back(all = false) {
    cancelAnimationFrame(raf);
    if (!held.length) return;
    let i = held.length, sum = 0;
    if (all) i = 0;
    else {
      while (i > 0 && sum < BUDGET) {
        paint([held[--i]]);
        sum += weight(held[i]);
      }
      i = startOf(held, i);
    }
    const got = held.splice(i);
    paint(got);
    stay();
    const h = log.scrollHeight, top = log.scrollTop;
    flow.prepend(...got);
    showMore();
    log.scrollTop = top + (log.scrollHeight - h);
    keep();
    shown(got);
  }

  const near = () => held.length && on() && log.clientHeight && log.scrollTop < log.clientHeight;
  log.addEventListener('scroll', () => {
    if (!near() || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (near()) back();
    });
  }, { passive: true });
  flow.addEventListener('click', (e) => {
    if (more && e.target === more) back();
  });

  return {
    trim,
    settle,
    back,
    all: () => back(true),
    has(x: unknown) {
      const n = x as Node | null | undefined;
      return !!n && (n.isConnected || held.some((r) => r.contains(n)));
    },
    held: () => held,
    reset() {
      cancelAnimationFrame(raf);
      raf = 0;
      held.length = 0;
      more?.remove();
      more = null;
    },
  };
}
