type Timer = { ms: number; fn: () => void; at: number; id: number | ReturnType<typeof setInterval> };
const timers = new Set<Timer>();

function start(t: Timer) {
  t.id = setInterval(() => run(t), t.ms);
}
function run(t: Timer) {
  if (document.hidden) return;
  t.at = Date.now();
  t.fn();
}

export function every(ms: number, fn: () => void): () => void {
  const t = { ms, fn, at: Date.now(), id: 0 };
  timers.add(t);
  if (!document.hidden) start(t);
  return () => {
    clearInterval(t.id);
    timers.delete(t);
  };
}

document.addEventListener('visibilitychange', () => {
  for (const t of timers) {
    clearInterval(t.id);
    if (document.hidden) continue;
    start(t);
    if (Date.now() - t.at >= t.ms) {
      try {
        run(t);
      } catch (e) {
        console.error(e);
      }
    }
  }
});
