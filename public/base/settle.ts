import { tell } from './notify.ts';

const WAIT = 1000;
const since = new Map<Element, number>();
const drawn = new WeakMap<Element, number>();
const io = new IntersectionObserver((list) => {
  for (const e of list) {
    if (e.isIntersecting) since.has(e.target) || since.set(e.target, performance.now());
    else {
      since.delete(e.target);
      const t = e.target;
      if (!t.isConnected) setTimeout(() => t.isConnected || io.unobserve(t), 2000);
    }
  }
}, { threshold: 1 });
addEventListener('focus', () => {
  const now = performance.now();
  for (const el of since.keys()) since.set(el, now);
});

function seenNow(b: Element) {
  if (!b.isConnected) return false;
  const r = b.getBoundingClientRect();
  if (!r.width || !r.height || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return false;
  const hit = (x: number, y: number) => {
    const at = document.elementFromPoint(x, y);
    return !!at && (b === at || b.contains(at));
  };
  if (!hit(r.left + r.width / 2, r.top + r.height / 2) || !hit(r.left + 2, r.top + 2) || !hit(r.right - 2, r.bottom - 2)) return false;
  io.observe(b);
  since.set(b, Math.max(performance.now() - WAIT, drawn.get(b) ?? 0));
  return true;
}

export const onScreen = (b: Element | null | undefined) => !!b && (since.has(b) || seenNow(b));
export const watchKeys = (card: Element, sel: string) =>
  card.querySelectorAll(sel).forEach((b) => {
    drawn.has(b) || drawn.set(b, performance.now());
    io.observe(b);
  });

export function heldKey(card: HTMLElement, b: Element) {
  const at = since.get(b) ?? (seenNow(b) ? since.get(b) : undefined);
  if (at === undefined) {
    tell(card, { title: 'The question is out of view', line: 'Scroll to it, then 1-9 answers it', ms: 2500 });
    return true;
  }
  const left = Math.ceil(WAIT - (performance.now() - at));
  if (left <= 0) return false;
  tell(card, { title: 'This question just appeared', line: 'Read it first: 1-9 answers it in a moment', ms: left + 900 });
  if (!card.classList.contains('ask-wait')) {
    card.style.setProperty('--wait', left + 'ms');
    card.classList.add('ask-wait');
    setTimeout(() => {
      card.classList.remove('ask-wait');
      card.classList.add('ask-ready');
      setTimeout(() => card.classList.remove('ask-ready'), 700);
    }, left);
  }
  return true;
}

export function holdFor(b: HTMLElement, ms = WAIT) {
  let from = 0;
  let t: ReturnType<typeof setTimeout> | undefined;
  const start = () => {
    from = performance.now();
    clearTimeout(t);
    b.classList.remove('ask-wait', 'ask-ready');
    b.style.setProperty('--wait', ms + 'ms');
    void b.offsetWidth;
    b.classList.add('ask-wait');
    t = setTimeout(() => {
      b.classList.remove('ask-wait');
      b.classList.add('ask-ready');
      t = setTimeout(() => b.classList.remove('ask-ready'), 700);
    }, ms);
  };
  start();
  addEventListener('focus', start);
  return {
    held() {
      const left = Math.ceil(ms - (performance.now() - from));
      if (left <= 0) return false;
      tell(b, { title: 'This prompt just appeared', line: 'Read it first: Enter allows it in a moment', ms: left + 900 });
      return true;
    },
    stop() {
      removeEventListener('focus', start);
      clearTimeout(t);
      b.classList.remove('ask-wait', 'ask-ready');
    },
  };
}
