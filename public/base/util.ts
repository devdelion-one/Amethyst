export const $ = <T = any>(s: string): T => document.querySelector(s) as T;
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
export const parentOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

export const fileUrl = (abs: string): string => 'file:///' + abs.replace(/\\/g, '/').replace(/^\//, '').split('/').map(encodeURIComponent).join('/').replace('%3A', ':');

export const uid = () => Math.random().toString(36).slice(2, 10);
export const inText = (a = document.activeElement as HTMLElement) => /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName) || !!a?.isContentEditable || !!a?.closest?.('.xterm');

export const byTitle = (a: { title: string }, b: { title: string }): number => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
export const AM = Math.max(1, Math.floor(Number(typeof location === 'object' ? new URLSearchParams(location.search).get('am') : 0)) || 1);
export const placeKey = (wid: string, pid: string) => `${AM}|${wid}|${pid}`;
export const addrPlace = () => {
  const q = new URLSearchParams(location.search);
  return { wid: q.get('w') ?? '', pid: q.get('p') ?? '' };
};
export const amKey = AM > 1 ? '@' + AM : '';
export const amTag = AM > 1 ? `#${AM} ` : '';
export const amElse = (a: { kind?: string; am?: number } | null | undefined): number => (a?.kind === 'chat' && (a.am || 1) !== AM ? a.am || 1 : 0);
export const OUT_MAX = 20000;
const parsed = new Map<string, { raw: string | null; value: any }>();
export const store = {
  get(k: string, d?: any): any {
    try {
      const raw = localStorage.getItem('mind.' + k), was = parsed.get(k);
      if (was && was.raw === raw) return was.value ?? d;
      const value = JSON.parse(raw as string);
      parsed.set(k, { raw, value });
      return value ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem('mind.' + k, JSON.stringify(v));
    } catch {}
  },
  del(k: string) {
    try {
      localStorage.removeItem('mind.' + k);
    } catch {}
  },
  text(k: string): string | null {
    try {
      return localStorage.getItem('mind.' + k);
    } catch {
      return null;
    }
  },
  setText(k: string, v: string) {
    try {
      localStorage.setItem('mind.' + k, v);
    } catch {}
  },
  keys(): string[] {
    try {
      return Object.keys(localStorage).filter((k) => k.startsWith('mind.')).map((k) => k.slice(5));
    } catch {
      return [];
    }
  },
};

const SPAN = { m: 1, h: 60, d: 1440, w: 10080 };
export const parseSpans = (text: unknown): number[] =>
  [...new Set([...String(text).toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*([mhdw]?)/g)].map((x) => Math.round((x[1] as unknown as number) * (SPAN as Record<string, number>)[x[2] || 'm'])).filter((m) => m > 0))].sort((x, y) => x - y);
export const spanText = (m: number): string => (m % 10080 ? (m % 1440 ? (m % 60 ? `${m}m` : `${m / 60}h`) : `${m / 1440}d`) : `${m / 10080}w`);

let dragOn: { e: PointerEvent; quit: (ev?: Event) => void } | null = null;
export function track(e: PointerEvent, { move, end, capture = null, esc = null }: { move?: (ev: PointerEvent) => void; end?: (ok: boolean, ev: PointerEvent) => void; capture?: Element | null; esc?: (() => boolean) | null }): () => void {
  if (dragOn && dragOn.e !== e) dragOn.quit();
  const same = (ev: Event & { pointerId?: number }) => e.pointerId == null || ev.pointerId == null || ev.pointerId === e.pointerId;
  let done = false;
  const stop = (ok: boolean, ev?: Event) => {
    if (done) return;
    done = true;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onOff);
    document.removeEventListener('lostpointercapture', onOff);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', quit);
    if (dragOn?.quit === quit) dragOn = null;
    end?.(ok, ev as PointerEvent);
  };
  const onMove = (ev: PointerEvent) => same(ev) && move?.(ev);
  const onUp = (ev: PointerEvent) => same(ev) && stop(true, ev);
  const onOff = (ev: PointerEvent) => same(ev) && stop(false, ev);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape' || !esc?.()) return;
    ev.preventDefault();
    ev.stopPropagation();
    stop(false, ev);
  };
  const quit = (ev?: Event) => stop(false, ev);
  dragOn = { e, quit };
  try {
    capture?.setPointerCapture(e.pointerId);
  } catch {}
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onOff);
  document.addEventListener('lostpointercapture', onOff);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', quit);
  return () => quit();
}

let bigDb: Promise<IDBDatabase> | null = null;
const openBig = () =>
  new Promise<IDBDatabase>((ok, fail) => {
    const r = indexedDB.open('mind', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('big');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
const big = async (mode: IDBTransactionMode, ask: (s: IDBObjectStore) => IDBRequest): Promise<any> => {
  try {
    const db = await (bigDb ||= openBig());
    return await new Promise<any>((ok, fail) => {
      const t = db.transaction('big', mode), r = ask(t.objectStore('big'));
      t.oncomplete = () => ok(r.result);
      t.onerror = t.onabort = () => fail(t.error);
    });
  } catch {}
};
export const bigStore = {
  get: (k: IDBValidKey) => big('readonly', (s) => s.get(k)),
  set: (k: IDBValidKey, v: unknown) => big('readwrite', (s) => s.put(v, k)),
  del: (k: IDBValidKey) => big('readwrite', (s) => s.delete(k)),
  keys: async () => (await big('readonly', (s) => s.getAllKeys())) || [],
};

let msg = '', err = '', retrying: ReturnType<typeof setInterval> | 0 = 0, fade: ReturnType<typeof setTimeout> | 0 = 0;
const unsavedNow = new Map<unknown, { label: string; why: string | null; retry: (() => unknown) | null; soon: boolean; trying?: boolean }>();
const failed = () => [...unsavedNow.values()].filter((x) => x.why);

function draw() {
  const el = $('#save-state'), bad = failed();
  if (!el) return;
  el.textContent = bad.length ? `not saved: ${bad.length === 1 ? `${bad[0].label} (${bad[0].why})` : `${bad.length} things`}${bad.some((x) => x.retry) ? ' · retry' : ''}` : err || msg;
  el.title = bad.length ? 'Not saved\n' + bad.map((x) => `${x.label}: ${x.why}.`).join('\n') + '\nClick to try again now.' : err ? 'Error\n' + err + '\nClick to clear it.' : '';
  el.toggleAttribute('data-tip-wide', !!bad.length);
  el.classList.toggle('err', !!(bad.length || err));
  el.onclick = bad.length ? () => retryAll(true) : err ? clearErr : msg ? clearMsg : null;
  el.hidden = !el.textContent;
  el.onmouseenter = () => clearTimeout(fade);
  el.onmouseleave = () => !failed().length && !err && msg && fadeMsg(3000);
  const soon = bad.some((x) => x.soon);
  if (soon && !retrying) retrying = setInterval(retryAll, 5000);
  if (!soon && retrying) retrying = (clearInterval(retrying) ?? 0) as 0;
}
const fadeMsg = (ms = 6000) => (clearTimeout(fade), (fade = setTimeout(clearMsg, ms)));
function clearErr() {
  err = '';
  if (msg) fadeMsg();
  draw();
}
function clearMsg() {
  msg = '';
  draw();
}
function retryAll(clicked = false) {
  for (const [key, x] of unsavedNow) {
    if (!x.why || (!clicked && !x.soon) || x.trying) continue;
    if (!x.retry) unsavedNow.delete(key);
    else {
      x.trying = true;
      Promise.resolve(x.retry()).finally(() => (x.trying = false));
    }
  }
  draw();
}

export function setSave(text: string, isErr = false) {
  if (isErr) err = text;
  else (msg = text), fadeMsg();
  draw();
}
export const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const stackAt = (e: any): string => ((e?.stack || '') as string).split('\n').slice(1).map((l) => l.match(/\/([\w.-]+\.m?js)(?:\?[^:)]*)?:(\d+):\d+/)).filter(Boolean as unknown as (m: RegExpMatchArray | null) => m is RegExpMatchArray).slice(0, 3).map((m) => `${m[1]}:${m[2]}`).join(' < ');
export function logErr(e: any, how = '') {
  const at = stackAt(e);
  window.amethyst?.hitchLog?.([`error ${how ? how + ' ' : ''}${e?.name || 'Error'}: ${e?.message ?? e}${at ? ' at ' + at : ''}`]);
  console.error(e);
}
const BUGS = [TypeError, ReferenceError, RangeError, SyntaxError, EvalError, URIError];
export const showErr = (e: any) => (e?.bug ? logErr(e, `server (${e.bug})`) : e?.status == null && BUGS.some((B) => e instanceof B) ? logErr(e) : setSave('ERR ' + e.message, true));
export const quietly = <T, F = undefined>(p: Promise<T>, fallback?: F): Promise<T | F> => p.catch((e: any) => (e?.status !== 0 && logErr(e, 'quiet'), fallback as F));

export function unsaved(key: unknown, label: string, e: any = null, retry: (() => unknown) | null = null) {
  if (!e && unsavedNow.has(key)) return;
  const refused = e?.status >= 400 && e.status < 500;
  unsavedNow.set(key, { label, why: e && e.message, retry, soon: !!(e && retry && !refused) });
  draw();
}
export function saved(key: unknown) {
  if (unsavedNow.delete(key)) draw();
}
export const anyUnsaved = () => unsavedNow.size > 0;
export const anyFailed = () => [...unsavedNow.values()].some((u) => u.why !== null);

const newest = new Map<unknown, () => Promise<unknown>>();
export function trySave(key: unknown, label: string, send: () => Promise<unknown>): Promise<unknown> {
  newest.set(key, send);
  unsaved(key, label);
  return send().then(
    () => newest.get(key) === send && (newest.delete(key), saved(key)),
    (e: any) => newest.get(key) === send && unsaved(key, label, e, () => trySave(key, label, send)),
  );
}

const DAY = 864e5;
export function ago(ms: number): string {
  const d = Math.floor((Date.now() - ms) / DAY);
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}

export function sinceShort(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 864e2) return `${Math.round(s / 3600)}h ago`;
  return ago(ms);
}

const CHAT_TABS: Record<string, string> = { ai: 'claude', codex: 'codex', antigravity: 'antigravity', cursor: 'cursor', copilot: 'copilot', grok: 'grok' };
export const isChatTab = (type: string): boolean => Object.hasOwn(CHAT_TABS, type);
export const chatProgram = (type: string): string => CHAT_TABS[type] || 'claude';
export const CHATS = [
  ['claude', 'Claude Agent', 'use your Claude sign-in'],
  ['codex', 'Codex Agent', 'use your Codex CLI sign-in'],
  ['antigravity', 'Antigravity Agent', 'use your Antigravity CLI sign-in'],
  ['cursor', 'Cursor Agent', 'use your Cursor CLI sign-in'],
  ['copilot', 'Copilot Agent', 'use your GitHub Copilot CLI sign-in'],
  ['grok', 'Grok Agent', 'use your Grok CLI sign-in'],
];
export const chatTabOf = (program: string | undefined): string => (program === 'codex' || program === 'antigravity' || program === 'cursor' || program === 'copilot' || program === 'grok' ? program : 'ai');
export const agentName = (program: string | undefined): string => ({ codex: 'Codex Agent', antigravity: 'Antigravity Agent', cursor: 'Cursor Agent', copilot: 'Copilot Agent', grok: 'Grok Agent' } as Record<string, string>)[program as string] || 'Claude Agent';
export const AGENT_FILES: Record<string, string[]> = { claude: ['.claude/', 'CLAUDE.md'], codex: ['.codex/', '.agents/', 'AGENTS.md'], antigravity: ['.agents/', 'GEMINI.md'], cursor: ['.cursor/', 'AGENTS.md'], copilot: ['AGENTS.md', 'copilot-instructions.md', '.github/instructions/', '.github/skills/', '.github/agents/'], grok: ['.grok/', 'AGENTS.md'] };
export const agentsOf = (rel: unknown): string[] => {
  const p = String(rel ?? '').replace(/\\/g, '/'), name = p.split('/').pop();
  return Object.keys(AGENT_FILES).filter((a) => AGENT_FILES[a].some((r) => (r.endsWith('/') ? p.startsWith(r) : name === r)));
};
export function onSelEnd(el: HTMLElement, fn: (e: MouseEvent) => void) {
  el.addEventListener('mousedown', () => document.addEventListener('mouseup', fn, { capture: true, once: true }), true);
}

export const pointerNow: { at: [number, number] | null } = { at: null };
if (typeof document !== 'undefined') for (const ev of ['pointermove', 'pointerdown', 'dragover']) document.addEventListener(ev as 'pointermove', (e: MouseEvent) => (pointerNow.at = [e.clientX, e.clientY]), { capture: true, passive: true });
