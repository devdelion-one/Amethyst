import { every } from './life.ts';
import { logErr } from './util.ts';

interface ScriptTiming extends PerformanceEntry {
  forcedStyleAndLayoutDuration: number;
  sourceURL?: string;
  invokerType: string;
  invoker?: string;
  sourceCharPosition: number;
  sourceFunctionName?: string;
}
interface FrameTiming extends PerformanceEntry {
  scripts: ScriptTiming[];
  renderStart: number;
  styleAndLayoutStart: number;
  blockingDuration: number;
  firstUIEventTimestamp: number;
}
interface EventTiming extends PerformanceEventTiming {
  interactionId?: number;
}
type WithMemory = Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
type Cnt = { n: number; ms: number; bytes: number };
type Tally = { parts: Map<string, Cnt>; places: Map<string, number>; nodes: number; attrs: number; texts: number; fetches: Map<string, Cnt>; loops: Map<string, Cnt> };
type Act = { what: string; tags: string[]; t0: number; last: number; pending: number; acc: Tally };
type InputEv = Event & Partial<Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>> & { button?: number };

const A = window.amethyst;
const on = !!A?.hitchLog && location.pathname !== '/hitch.html';
export const idleFrame = (run: number, render: number) => run + render <= 30;
const unseen = () => document.hidden || new URLSearchParams(location.search).has('spare');
const raf0 = window.requestAnimationFrame.bind(window), si0 = window.setInterval.bind(window);

const out: string[] = [];
let sendT: ReturnType<typeof setTimeout> | 0 = 0;
const say = (text: string) => {
  out.push(text);
  sendT ||= setTimeout(() => {
    sendT = 0;
    while (out.length) A!.hitchLog(out.splice(0, 50));
  }, 1000);
};

const seen: { t: number; kind: string; bytes: number; ms: number }[] = [];
export function note(kind: string, bytes: number, ms: number) {
  if (!on) return;
  const t = performance.now();
  seen.push({ t, kind, bytes, ms });
  while (seen[0] && t - seen[0].t > 30000) seen.shift();
}
function traffic(span: number): string {
  const t = performance.now(), by: Record<string, { n: number; bytes: number; ms: number }> = {};
  for (const e of seen) {
    if (t - e.t > span) continue;
    const k = (by[e.kind] ||= { n: 0, bytes: 0, ms: 0 });
    k.n++;
    k.bytes += e.bytes;
    k.ms += e.ms;
  }
  const rows = Object.entries(by).map(([k, v]) => `${k} ${v.n} events ${Math.round(v.bytes / 1024)} KB ${v.ms.toFixed(0)} ms`);
  return rows.length ? rows.join(', ') : 'none';
}

function state() {
  const m = (performance as WithMemory).memory;
  return `${innerWidth}x${innerHeight} scale ${devicePixelRatio}, ${document.visibilityState}, ${document.getElementsByTagName('*').length} elements, ${document.querySelectorAll('.xterm').length} terminals, ${document.querySelectorAll('webview').length} browser tabs, heap ${m ? Math.round(m.usedJSHeapSize / 1048576) + '/' + Math.round(m.totalJSHeapSize / 1048576) + ' MB' : '?'}`;
}

const sites = new Map<string, { n: number; ms: number; max: number }>();
const where = (what: string) => {
  const E = Error as ErrorConstructor & { stackTraceLimit: number }, lim = E.stackTraceLimit;
  E.stackTraceLimit = 8;
  const stack = new Error().stack || '';
  E.stackTraceLimit = lim;
  const lines = stack.split('\n').slice(1).filter((l) => !l.includes('hitch.ts'));
  const line = lines.find((l) => !l.includes('life.ts')) || lines[0];
  const m = line && line.match(lineRe);
  return m ? `${what} ${m[1]}:${m[2]}` : `${what} unknown`;
};
const lineRe = /\/([\w.-]+\.(?:m?js|ts))(?:\?[^:)]*)?:(\d+):\d+/;
const ran: { t: number; d: number; site: string }[] = [], slowReads: { t: number; d: number; what: string }[] = [];
const keep = <T extends { t: number }>(list: T[], x: T) => {
  list.push(x);
  while (list[0] && x.t - list[0].t > 10000) list.shift();
};
function cost<R>(site: string, fn: () => R): R {
  const t = performance.now();
  try {
    return fn();
  } finally {
    const d = performance.now() - t, s = sites.get(site) || sites.set(site, { n: 0, ms: 0, max: 0 }).get(site)!;
    s.n++;
    s.ms += d;
    if (d > s.max) s.max = d;
    if (d > 50) say(`slow ${site}: ${d.toFixed(0)} ms`);
    if (d >= 4) keep(ran, { t, d, site });
  }
}
function timeReads() {
  const timed = (k: string, f: Function) =>
    function (this: unknown, ...a: unknown[]) {
      const t = performance.now();
      try {
        return f.apply(this, a);
      } finally {
        const d = performance.now() - t;
        if (d >= 4) {
          const at = (new Error().stack || '').split('\n').slice(1).filter((l) => !l.includes('hitch.ts')).map((l) => l.match(lineRe)).filter(Boolean as unknown as (m: RegExpMatchArray | null) => m is RegExpMatchArray).slice(0, 2).map((m) => `${m[1]}:${m[2]}`);
          keep(slowReads, { t, d, what: `${k} ${at.join(' < ') || 'unknown'}` });
        }
      }
    };
  const reads = [[Element.prototype, ['clientWidth', 'clientHeight', 'clientTop', 'clientLeft', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft', 'getBoundingClientRect', 'getClientRects', 'scrollIntoView']], [HTMLElement.prototype, ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'offsetParent', 'innerText', 'focus']]];
  for (const [proto, keys] of reads as [object, string[]][])
    for (const k of keys) {
      const d = Object.getOwnPropertyDescriptor(proto, k);
      if (!d) continue;
      Object.defineProperty(proto, k, d.get ? { ...d, get: timed(k, d.get) } : { ...d, value: timed(k, d.value) });
    }
}
function scriptRow(s: ScriptTiming): string {
  const file = (s.sourceURL || '').split('/').pop()!.split('?')[0];
  const mine = file === 'hitch.ts' && ran.find((r) => r.t >= s.startTime - 1 && r.t <= s.startTime + s.duration);
  return `${s.invokerType} ${s.invoker || ''} ${mine ? mine.site.split(' ').pop() : `${file}@${s.sourceCharPosition} ${s.sourceFunctionName || 'anonymous'}`} ${s.duration.toFixed(0)} ms`;
}
function top(min: number): string {
  const rows = [...sites].filter(([, s]) => s.ms >= min).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, s]) => `${k} x${s.n} ${s.ms.toFixed(0)} ms (slowest ${s.max.toFixed(0)})`);
  sites.clear();
  return rows.join('; ');
}

function install() {
  timeReads();
  let burst: { t0: number; n: number; last: number; lastFrame: number; frames: number; worst: number; first: number; from: string } | null = null;
  const tick = (t: number) => {
    if (!burst) return;
    burst.frames++;
    burst.worst = Math.max(burst.worst, t - burst.lastFrame);
    burst.lastFrame = t;
    if (t - burst.last > 600) {
      say(`resize: ${burst.n} events in ${Math.round(burst.last - burst.t0)} ms, ${burst.from} -> ${innerWidth}x${innerHeight} scale ${devicePixelRatio}, first frame after ${burst.first.toFixed(0)} ms, ${burst.frames} frames, slowest gap ${burst.worst.toFixed(0)} ms; costs: ${top(5) || 'none'}`);
      burst = null;
    } else raf0(tick);
  };
  addEventListener('resize', () => {
    const t = performance.now();
    if (!burst) {
      burst = { t0: t, n: 0, last: t, lastFrame: t, frames: 0, worst: 0, first: 0, from: `${innerWidth}x${innerHeight}` };
      raf0(() => burst && (burst.first = performance.now() - t));
      raf0(tick);
    }
    burst.n++;
    burst.last = t;
  });

  const RO = window.ResizeObserver;
  window.ResizeObserver = class ResizeObserver extends RO {
    constructor(fn: ResizeObserverCallback) {
      const site = where('ResizeObserver');
      super(typeof fn === 'function' ? function (this: ResizeObserver, ...a: Parameters<ResizeObserverCallback>) { return cost(site, () => fn.apply(this, a)); } : fn);
    }
  };
  const add = window.addEventListener, remove = window.removeEventListener, wrapped = new WeakMap<object, (...a: unknown[]) => unknown>();
  window.addEventListener = function (this: Window, type: string, fn: any, opts?: boolean | AddEventListenerOptions) {
    if (type !== 'resize' || typeof fn !== 'function') return add.call(this, type, fn, opts);
    let w = wrapped.get(fn);
    if (!w) {
      const site = where('resize listener');
      wrapped.set(fn, (w = function (this: unknown, ...a: unknown[]) { return cost(site, () => fn.apply(this, a)); }));
    }
    return add.call(this, type, w as EventListener, opts);
  } as typeof window.addEventListener;
  window.removeEventListener = function (this: Window, type: string, fn: any, opts?: boolean | EventListenerOptions) {
    return remove.call(this, type, type === 'resize' && wrapped.get(fn) as EventListener || fn, opts);
  } as typeof window.removeEventListener;

  let askedAt = 0;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as FrameTiming[]) {
        frames.push(e);
        while (frames[0] && e.startTime - frames[0].startTime > 10000) frames.shift();
        if (e.duration < 150 || unseen()) continue;
        const end = e.startTime + e.duration, scripts = [...e.scripts].sort((a, b) => b.duration - a.duration);
        const run = scripts.reduce((n, s) => n + s.duration, 0), forced = scripts.reduce((n, s) => n + s.forcedStyleAndLayoutDuration, 0);
        const rows = scripts.slice(0, 4).map(scriptRow);
        const reads = slowReads.filter((r) => r.t >= e.startTime && r.t <= end).sort((a, b) => b.d - a.d).slice(0, 4).map((r) => `${r.what} ${r.d.toFixed(0)} ms`);
        const render = e.renderStart ? end - e.renderStart : 0, layout = e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0;
        if (idleFrame(run, render)) continue;
        say(`slow frame ${e.duration.toFixed(0)} ms: scripts ${run.toFixed(0)} ms (forced layout ${forced.toFixed(0)}), render ${render.toFixed(0)} ms (style and layout ${layout.toFixed(0)}), blocking ${e.blockingDuration.toFixed(0)} ms${e.firstUIEventTimestamp ? ', first input at +' + (e.firstUIEventTimestamp - e.startTime).toFixed(0) + ' ms' : ''}; ${rows.join(' | ') || 'no script'}${reads.length ? `; laid out by ${reads.join(' | ')}` : ''}; ${state()}; last 3 s: ${traffic(3000)}`);
        if (e.duration >= 500 && performance.now() - askedAt > 5000) {
          askedAt = performance.now();
          A!.hitchMetrics?.(`slow frame ${e.duration.toFixed(0)} ms`);
        }
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as EventTiming[]) {
        if (!e.interactionId || unseen()) continue;
        const t = e.target as Element;
        say(`slow input ${e.name} ${e.duration} ms: waited ${(e.processingStart - e.startTime).toFixed(0)}, handled ${(e.processingEnd - e.processingStart).toFixed(0)}, drawn after ${(e.startTime + e.duration - e.processingEnd).toFixed(0)}; on ${t ? (t.tagName || '') + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '') : 'gone'}`);
      }
    }).observe({ type: 'event', durationThreshold: 100, buffered: true } as PerformanceObserverInit);
  } catch {}

  const scale = () =>
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => (say(`scale changed to ${devicePixelRatio}`), scale()), { once: true });
  scale();
  document.addEventListener('visibilitychange', () => say(`page ${document.visibilityState}`));
  addEventListener('load', () => setTimeout(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (n) say(`page start: dom ready after ${n.domContentLoadedEventEnd.toFixed(0)} ms, loaded after ${n.loadEventEnd.toFixed(0)} ms; ${state()}`);
  }));

  addEventListener('error', (e) => logErr(e.error || e.message, 'uncaught'));
  addEventListener('unhandledrejection', (e) => logErr(e.reason, 'unhandled'));
  watchActions();
  A!.onHitchDump?.(() => ({ lines: out.splice(0), timeline, state: state() }));

  every(30000, () => say(`every 30 s: ${state()}; stream: ${traffic(30000)}; costs: ${top(100) || 'none above 100 ms'}`));
}

const frames: FrameTiming[] = [];
const tally = (): Tally => ({ parts: new Map(), places: new Map(), nodes: 0, attrs: 0, texts: 0, fetches: new Map(), loops: new Map() });
let act: Act | null = null;
let idle = tally(), input = false;
let checkT = 0;
const tallyNow = () => (act ? act.acc : idle);
const bump = (m: Map<string, Cnt>, k: string, ms = 0): Cnt => {
  const x = m.get(k) || m.set(k, { n: 0, ms: 0, bytes: 0 }).get(k)!;
  x.n++;
  x.ms += ms;
  return x;
};
const busy = () => act && (act.last = performance.now());

export function span<R>(name: string, fn: () => R): R {
  if (!on) return fn();
  const t = performance.now(), a = tallyNow();
  const done = () => (bump(a.parts, name, performance.now() - t), busy());
  let r: any;
  try {
    r = fn();
  } catch (e) {
    done();
    throw e;
  }
  if (r && typeof r.then === 'function') return r.finally(done);
  done();
  return r;
}
export function report(text: string) {
  if (on) say(text);
}
export function mark(name: string) {
  if (on) bump(tallyNow().parts, name);
}
export function tag(text: string) {
  if (!on) return;
  if (!act) begin(null);
  act!.tags.push(text);
}

const placed = new WeakMap<Element, string>();
function placeOf(n: Node): string {
  const e = n.nodeType === 1 ? (n as Element) : n.parentElement;
  if (!e) return '?';
  let p = placed.get(e);
  if (p) return p;
  const own = typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '';
  let x: Element | null = e;
  while (x && !x.id) x = x.parentElement;
  p = x ? '#' + x.id + (x !== e && own ? ' ' + own : '') : own || e.tagName.toLowerCase();
  placed.set(e, p);
  return p;
}
const weight = (n: Node) => (n.nodeType === 1 ? 1 + (n as Element).getElementsByTagName('*').length : 1);

function describe(e: InputEv | null): string {
  if (!e) return 'code';
  let what: string;
  if (e.type === 'keydown') {
    const typed = e.key!.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey;
    what = typed ? 'typing' : 'key ' + [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', e.metaKey && 'meta', e.key].filter(Boolean).join('+');
  } else what = e.button === 2 ? 'right click' : 'click';
  const t = e.target instanceof Element ? e.target : null;
  if (!t) return what;
  const b = t.closest<HTMLElement>('button, a, [role=tab], [aria-label], [title], [data-tip]');
  const label = b && (b.getAttribute('aria-label') || b.dataset.tip || b.getAttribute('title') || (b.matches('button, a, [role=tab]') ? b.textContent : ''));
  return `${what} on ${placeOf(t)}${label ? ` "${label.trim().replace(/\s+/g, ' ').slice(0, 40)}"` : ''}`;
}

const ms0 = (v: number) => v.toFixed(0);
const changes = (x: Tally) => x.nodes + x.attrs + x.texts;
function summary(x: Tally): string {
  const places = [...x.places].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${n} ${k}`);
  const parts = [...x.parts].sort((a, b) => b[1].ms - a[1].ms || b[1].n - a[1].n).slice(0, 10).map(([k, v]) => `${k} x${v.n}${v.ms >= 1 ? ' ' + ms0(v.ms) + ' ms' : ''}`);
  const fetches = [...x.fetches].map(([k, v]) => `${k}${v.n > 1 ? ' x' + v.n : ''} ${ms0(v.ms)} ms${v.bytes ? ' ' + Math.round(v.bytes / 1024) + ' KB' : ''}`);
  const loops = [...x.loops].sort((a, b) => b[1].n - a[1].n).slice(0, 5).map(([k, v]) => `${k} x${v.n} ${ms0(v.ms)} ms`);
  return [
    `page changes: ${x.nodes} nodes, ${x.attrs} attributes, ${x.texts} texts${places.length ? ' (most: ' + places.join(', ') + ')' : ''}`,
    parts.length && 'ran ' + parts.join(', '),
    fetches.length && 'fetched ' + fetches.join(', '),
    loops.length && 'timers and frame loops ' + loops.join(', '),
  ].filter(Boolean).join('; ');
}

function begin(e: InputEv | null) {
  if (act) end();
  const t = performance.now();
  act = { what: describe(e), tags: [], t0: t, last: t, pending: 0, acc: tally() };
  input = true;
  if (e) inputs++;
  clearTimeout(checkT);
  checkT = setTimeout(check, 100);
}
function check() {
  if (!act) return;
  const now = performance.now();
  if ((now - act.last >= 200 && !act.pending) || now - act.t0 >= 3000) return end();
  checkT = setTimeout(check, 100);
}
function end() {
  clearTimeout(checkT);
  const a = act;
  act = null;
  if (!a) return;
  const fr = frames.filter((f) => f.startTime + f.duration > a.t0 && f.startTime < a.last + 50);
  const took = Math.max(a.last, ...fr.map((f) => f.startTime + f.duration)) - a.t0;
  if (!a.tags.length && took < 100 && changes(a.acc) < 300) return;
  const worst = Math.max(0, ...fr.map((f) => f.duration));
  const layout = fr.reduce((n, f) => n + (f.styleAndLayoutStart ? f.startTime + f.duration - f.styleAndLayoutStart : 0) + [...f.scripts].reduce((m, s) => m + s.forcedStyleAndLayoutDuration, 0), 0);
  say(`${a.tags.length ? a.tags.join(', ') + ', by ' : 'action '}${a.what}: ${ms0(took)} ms${worst ? `, slowest frame ${ms0(worst)} ms, style and layout ${ms0(layout)} ms` : ''}; ${summary(a.acc)}`);
}

let run: { secs: number; t0: number; acc: Tally } | null = null;
const timeline: Record<string, number>[] = [];
let inputs = 0, secChanges = 0;
function keepSecond() {
  const now = performance.now(), fr = frames.filter((f) => f.startTime > now - 1000), heap = (performance as WithMemory).memory?.usedJSHeapSize;
  let kb = 0;
  for (const e of seen) if (e.t > now - 1000) kb += e.bytes;
  timeline.push({ t: Date.now(), blocked: Math.round(fr.reduce((n, f) => n + f.blockingDuration, 0)), worst: Math.round(Math.max(0, ...fr.map((f) => f.duration))), changes: secChanges, heap: heap ? Math.round(heap / 1048576) : 0, kb: Math.round(kb / 1024), inputs });
  inputs = secChanges = 0;
  if (timeline.length > 60) timeline.shift();
}
function merge(into: Tally, x: Tally) {
  into.nodes += x.nodes;
  into.attrs += x.attrs;
  into.texts += x.texts;
  for (const [k, n] of x.places) into.places.set(k, (into.places.get(k) || 0) + n);
  for (const key of ['parts', 'fetches', 'loops'] as const)
    for (const [k, v] of x[key]) {
      const y = into[key].get(k) || into[key].set(k, { n: 0, ms: 0, bytes: 0 }).get(k)!;
      y.n += v.n;
      y.ms += v.ms;
      y.bytes += v.bytes;
    }
}
function second() {
  const x = idle, quiet = !input && !act && performance.now() > 5000;
  idle = tally();
  input = false;
  keepSecond();
  const busyNow = quiet && (changes(x) > 300 || [...x.parts.values()].some((v) => v.n > 10) || [...x.loops.values()].some((v) => v.n > 30));
  if (busyNow) {
    run ||= { secs: 0, t0: Date.now(), acc: tally() };
    run.secs++;
    merge(run.acc, x);
  }
  if (run && (!busyNow || Date.now() - run.t0 >= 10000)) {
    if (!unseen()) say(`busy with no input for ${run.secs} s: ${summary(run.acc)}`);
    run = null;
  }
}

function watchActions() {
  addEventListener('pointerdown', begin, true);
  addEventListener('keydown', begin, true);

  new MutationObserver((recs) => {
    const a = tallyNow();
    for (const r of recs) {
      let w = 1;
      if (r.type === 'childList') {
        w = 0;
        for (const n of r.addedNodes) w += weight(n);
        for (const n of r.removedNodes) w += weight(n);
        a.nodes += w;
      } else if (r.type === 'attributes') a.attrs++;
      else a.texts++;
      const p = placeOf(r.target);
      a.places.set(p, (a.places.get(p) || 0) + w);
      secChanges += w;
    }
    busy();
  }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });

  const f0 = window.fetch;
  window.fetch = function (this: unknown, input, init) {
    const t = performance.now(), a = tallyNow(), mine = act;
    let key = 'fetch';
    try {
      const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      key = `${(init?.method || (input as Request)?.method || 'GET').toUpperCase()} ${u.origin === location.origin ? u.pathname : u.host}`;
    } catch {}
    if (mine) mine.pending++;
    const done = (bytes: number) => {
      if (mine) mine.pending--;
      bump(a.fetches, key, performance.now() - t).bytes += bytes;
      busy();
    };
    return f0.apply(this, arguments as unknown as [RequestInfo | URL, RequestInit?]).then(
      (res) => (done(+(res.headers.get('content-length') as string) || 0), res),
      (err) => {
        done(0);
        throw err;
      },
    );
  };

  const loop = <R>(site: string, fn: () => R): R => {
    const t = performance.now(), a = tallyNow();
    try {
      return cost(site, fn);
    } finally {
      bump(a.loops, site, performance.now() - t);
    }
  };
  const named = new WeakMap<Function, string>();
  window.requestAnimationFrame = function (fn) {
    if (typeof fn !== 'function') return raf0(fn);
    let site = named.get(fn);
    if (!site) named.set(fn, (site = where('frame loop')));
    return raf0((t) => loop(site, () => fn(t)));
  };
  window.setInterval = function (fn, ms, ...rest) {
    if (typeof fn !== 'function') return si0(fn, ms, ...rest);
    const site = where('timer');
    return si0(function (this: unknown, ...a: unknown[]) {
      return loop(site, () => fn.apply(this, a));
    }, ms, ...rest);
  };

  si0(second, 1000);
}

if (on) install();
