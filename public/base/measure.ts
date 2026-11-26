import { report, span } from './hitch.ts';

type Seen = ResizeObserverEntry[];
type SizeJob<T = unknown> = { name: string; read?: (seen: Seen) => T; write: (got: T, seen: Seen) => void; live?: boolean };
export type Sizes = { observe(el: Element): void; unobserve(el: Element): void; disconnect(): void };
type Job = SizeJob<any> & { els: Set<Element>; held: Map<Element, ResizeObserverEntry> };

export const resizing = () => document.body.classList.contains('resizing-x') || document.body.classList.contains('resizing-y');

const timed = (name: string, ms: number) => ms > 30 && report(`slow size job ${name}: ${ms.toFixed(0)} ms`);
function run(batch: [{ name: string; read?: (seen: Seen) => unknown; write: (got: any, seen: Seen) => void }, Seen][]) {
  const got = batch.map(([j, seen]) => {
    try {
      const t = performance.now(), v = j.read ? span(j.name, () => j.read!(seen)) : undefined;
      timed(`${j.name} (measuring)`, performance.now() - t);
      return { v };
    } catch (e) {
      reportError(e);
      return null;
    }
  });
  batch.forEach(([j, seen], i) => {
    const g = got[i];
    if (!g) return;
    try {
      const t = performance.now();
      span(j.name, () => j.write(g.v, seen));
      timed(j.name, performance.now() - t);
    } catch (e) {
      reportError(e);
    }
  });
}

const jobsOf = new WeakMap<Element, Set<Job>>();
const held = new Set<Job>();
let ro: ResizeObserver | null = null;
let watching: MutationObserver | null = null;

function letGo() {
  if (!held.size || resizing()) return;
  const all = [...held];
  held.clear();
  run(all.map((j) => {
    const seen = [...j.held.values()].filter((e) => e.target.isConnected);
    j.held.clear();
    return [j, seen];
  }));
}

function seen(es: ResizeObserverEntry[]) {
  const per = new Map<Job, ResizeObserverEntry[]>();
  for (const e of es) for (const j of jobsOf.get(e.target) || []) (per.get(j) || per.set(j, []).get(j)!).push(e);
  const hold = resizing(), now: [Job, Seen][] = [];
  for (const [j, es2] of per) {
    if (hold && !j.live) {
      for (const e of es2) j.held.set(e.target, e);
      held.add(j);
      (watching ||= new MutationObserver(letGo)).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    } else now.push([j, es2]);
  }
  run(now);
}

export function onSize<T>(els: Element | Iterable<Element> | null, job: SizeJob<T>): Sizes {
  const j: Job = { ...job, els: new Set(), held: new Map() };
  const sizes: Sizes = {
    observe(el) {
      ro ||= new ResizeObserver(seen);
      j.els.add(el);
      (jobsOf.get(el) || jobsOf.set(el, new Set()).get(el)!).add(j);
      ro.unobserve(el);
      ro.observe(el);
    },
    unobserve(el) {
      j.els.delete(el);
      j.held.delete(el);
      const js = jobsOf.get(el);
      if (!js) return;
      js.delete(j);
      if (js.size) return;
      jobsOf.delete(el);
      ro?.unobserve(el);
    },
    disconnect() {
      for (const el of [...j.els]) sizes.unobserve(el);
      held.delete(j);
    },
  };
  if (els) for (const el of els instanceof Element ? [els] : els) sizes.observe(el);
  return sizes;
}

type FrameJob = { name: string; read?: () => unknown; write: (got: any) => void };
const queued = new Set<FrameJob>();
let frame = 0;
export function nextFrame(job: FrameJob) {
  queued.add(job);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    const all = [...queued];
    queued.clear();
    run(all.map((j) => [{ name: j.name, read: j.read && (() => j.read!()), write: (v: unknown) => j.write(v) }, []]));
  });
}
export const dropFrame = (job: FrameJob) => queued.delete(job);
