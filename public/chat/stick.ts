import { onSize } from '../base/measure.ts';

type StickOpts = { el?: HTMLElement | null; selected?: (() => boolean) | null; grew?: ((growing: boolean) => void) | null; up?: HTMLElement | null; live?: (() => HTMLElement | null) | null; hold?: (() => boolean) | null };
const GAP = 6, HERE = 4, EASE_MAX = 120, MSGS = '.ch-you, .ch-ai';
export function stick(log: HTMLElement, inner: HTMLElement, jump: HTMLElement, { el = null, selected = null, grew = null, up = null, live = null, hold = null }: StickOpts = {}) {
  let holding: HTMLElement | null = null;
  const wasHeld = new WeakSet<HTMLElement>();
  let pinned = true, here = false, innerH = 0, line = 0, goal: number | null = null, ease = 0, trackpad = 0, top = 0, away = false, held = false, hand = -Infinity, wasSel = false;
  const off = new AbortController(), sig = { signal: off.signal };
  const atEnd = () => log.scrollHeight - log.scrollTop - log.clientHeight <= 2;
  const yOf = (m: Element) => {
    const k = inner.getBoundingClientRect().height / inner.offsetHeight || 1;
    return log.scrollTop + (m.getBoundingClientRect().top - log.getBoundingClientRect().top - log.clientTop * k) / k;
  };
  const starts = () => [...inner.querySelectorAll<HTMLElement>(MSGS)].filter((m) => m.getClientRects().length).map((m) => Math.max(0, Math.round(yOf(m)) - GAP));
  const showUp = () => {
    if (!up) return;
    const first = inner.querySelector<HTMLElement>(MSGS);
    up.hidden = !first || log.scrollTop <= Math.max(0, yOf(first) - GAP) + HERE;
  };
  const touched = () => (holding = null);
  function pin(on: boolean) {
    pinned = on;
    if (on) holding = null;
    here = !on && !!selected?.();
    jump.hidden = on;
    if (on) jump.classList.remove('new');
  }
  const toEnd = () => (log.scrollTop = log.scrollHeight);
  const stopEase = () => { cancelAnimationFrame(ease); goal = null; };
  function easeTo(y: number) {
    goal = y;
    cancelAnimationFrame(ease);
    let was = Infinity, frames = 0;
    const done = (to: number) => { log.scrollTop = to; top = log.scrollTop; goal = null; if (atEnd()) pin(true); };
    const step = () => {
      const H = log.scrollHeight, to = Math.min(goal!, H - log.clientHeight), from = log.scrollTop, d = to - from;
      if (pinned && goal === Infinity && H > was) { log.scrollTop = H; goal = null; return; }
      was = H;
      if (Math.abs(d) < 1 || ++frames > EASE_MAX) return done(to);
      log.scrollTop = from + Math.sign(d) * Math.min(Math.abs(d), Math.max(2, Math.abs(d) * 0.35));
      top = log.scrollTop;
      if (top === from) return done(to);
      ease = requestAnimationFrame(step);
    };
    step();
  }
  const ro = onSize([log, inner], {
    name: 'chat.stick',
    live: true,
    read: () => {
      const ch = log.clientHeight;
      if (!ch) return null;
      line = parseFloat(getComputedStyle(log.querySelector('.ch-msg') || log).lineHeight) || 20;
      const m = live?.() || null, first = up && inner.querySelector<HTMLElement>(MSGS);
      const hy = m && m.isConnected && hold?.() && !wasHeld.has(m) && (pinned || holding) ? Math.max(0, Math.round(yOf(m)) - GAP) : null;
      return { ch, ih: inner.offsetHeight, sh: log.scrollHeight, at: log.scrollTop, m, hy, fy: first ? Math.max(0, yOf(first) - GAP) : null, lt: up ? log.offsetTop : 0 };
    },
    write: (r: { ch: number; ih: number; sh: number; at: number; m: HTMLElement | null; hy: number | null; fy: number | null; lt: number } | null) => {
      if (!r) return void (away = true);
      const { ch, ih, sh } = r, back = away && !pinned;
      let at = r.at;
      if (back) log.scrollTop = at = Math.min(top, sh - ch);
      away = false;
      const more = ih > innerH;
      innerH = ih;
      const sel = !!selected?.();
      if (!pinned && here && wasSel && !sel) pin(true);
      wasSel = sel;
      const moved = !!holding && ((!!r.m && r.m !== holding) || !hold?.());
      if (r.hy != null && r.m && (pinned || moved) && r.hy < sh - ch) {
        stopEase();
        pin(false);
        here = false;
        holding = r.m;
        wasHeld.add(r.m);
        log.scrollTop = at = top = r.hy;
        if (more) jump.classList.add('new');
      } else if (pinned || moved) {
        stopEase();
        if (!pinned) pin(true);
        if (at < sh - ch - 1) log.scrollTop = sh;
        at = sh - ch;
      } else if (more) jump.classList.add('new');
      jump.hidden = pinned || sh - at - ch <= 2;
      if (up) {
        up.style.top = `${r.lt + 6}px`;
        up.hidden = r.fy == null || at <= r.fy + HERE;
      }
      grew?.(more && !back);
    },
  });
  if (el) for (const k of ['pointerdown', 'focusin']) el.addEventListener(k, () => (here = !pinned && !holding), sig);
  log.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return;
    touched();
    const dir = Math.sign(e.deltaY);
    for (let n = e.target as HTMLElement | null; n && n !== log; n = n.parentElement)
      if (n.scrollHeight > n.clientHeight && /auto|scroll/.test(getComputedStyle(n).overflowY)
        && (dir < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1)) return;
    e.preventDefault();
    line ||= parseFloat(getComputedStyle(log.querySelector('.ch-msg') || log).lineHeight) || 20;
    const px = e.deltaMode === 1 ? e.deltaY * line : e.deltaMode === 2 ? e.deltaY * log.clientHeight : e.deltaY;
    let lines = 0;
    if (Math.abs(px) >= 50) lines = 2 * dir;
    else {
      trackpad += px;
      lines = Math.trunc(trackpad / line);
      trackpad -= lines * line;
    }
    if (!lines) return;
    if (lines < 0) pin(false);
    const max = log.scrollHeight - log.clientHeight;
    const from = Math.min(goal ?? log.scrollTop, max);
    easeTo(Math.min(max, Math.max(0, Math.round(from / line) * line + lines * line)));
  }, { passive: false, signal: off.signal });
  const release = () => {
    held = false;
    removeEventListener('pointerup', release);
    removeEventListener('pointercancel', release);
  };
  log.addEventListener('pointerdown', () => {
    touched();
    stopEase();
    held = true;
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
  }, sig);
  for (const k of ['keydown', 'touchmove']) log.addEventListener(k, () => ((hand = performance.now()), touched()), { passive: true, signal: off.signal });
  log.addEventListener('scroll', () => {
    if (log.clientHeight) showUp();
    if (goal != null || !log.clientHeight) return;
    top = log.scrollTop;
    const end = atEnd();
    if (end) pin(true);
    else if (held || performance.now() - hand < 500) pin(false);
    jump.hidden = end;
  }, { passive: true, signal: off.signal });
  up?.addEventListener('click', () => {
    const from = Math.min(goal ?? log.scrollTop, log.scrollHeight - log.clientHeight), ys = starts().filter((y) => y < from - HERE);
    touched();
    pin(false);
    easeTo(ys.length ? Math.max(...ys) : 0);
  }, sig);
  return {
    pin,
    toEnd,
    easeTo,
    stopEase,
    atEnd,
    pinned: () => pinned,
    back() {
      pin(true);
      easeTo(Infinity);
    },
    settle: () => (innerH = inner.offsetHeight),
    reset() {
      innerH = 0;
      ro.observe(inner);
    },
    stop() {
      ro.disconnect();
      stopEase();
      release();
      off.abort();
    },
  };
}
