import { onSize } from './measure.ts';

export type Tail = { kick(): void; follow(): void; pinned(): boolean };
const END = 4;
const UP_KEYS = ['PageUp', 'Home', 'ArrowUp'];
export function tail(pane: HTMLElement, tip = 'Newest\nGoes to the end of the log and follows it again.'): Tail {
  let pinned = true, ours = false, lastTop = 0;
  const wrap = document.createElement('div');
  wrap.className = 'tl-wrap';
  wrap.innerHTML = `<button type="button" class="tl-jump" title="${tip.replace(/"/g, '&quot;').replace(/\n/g, '&#10;')}" hidden>↓ newest</button>`;
  const jump = wrap.firstElementChild as HTMLButtonElement;
  pane.append(wrap);
  const seen = () => pane.clientHeight > 0;
  const atEnd = () => pane.scrollHeight - pane.scrollTop - pane.clientHeight <= END;
  function pin(on: boolean) {
    pinned = on;
    jump.hidden = on;
  }
  function toEnd() {
    if (!seen()) return;
    const was = pane.scrollTop;
    pane.scrollTop = pane.scrollHeight;
    ours = pane.scrollTop !== was;
    lastTop = pane.scrollTop;
  }
  const kick = () => {
    if (pane.lastElementChild !== wrap) pane.append(wrap);
    if (pinned) toEnd();
  };
  const follow = () => (pin(true), toEnd());
  const leave = () => seen() && !atEnd() && pin(false);
  pane.addEventListener('wheel', (e) => e.deltaY < 0 && requestAnimationFrame(leave), { passive: true });
  pane.addEventListener('keydown', (e) => UP_KEYS.includes(e.key) && requestAnimationFrame(leave));
  pane.addEventListener('scroll', () => {
    if (!seen()) return;
    const up = pane.scrollTop < lastTop - 1;
    lastTop = pane.scrollTop;
    if (ours) return void (ours = false);
    if (atEnd()) pin(true);
    else if (up) pin(false);
  }, { passive: true });
  jump.addEventListener('click', (e) => (e.stopPropagation(), follow()));
  onSize(pane, { name: 'tail', write: () => pinned && toEnd() });
  return { kick, follow, pinned: () => pinned };
}
