export type {};

declare let onconnect: (e: MessageEvent) => void;

const c = Math.random().toString(36).slice(2) + Date.now().toString(36);
const ports = new Map<MessagePort, Set<string>>();
const owner = new Map<string, { port: MessagePort; wid: string }>();
const early = new Map<string, { at: number; list: unknown[] }>();
const KEEP = 10e3;
let es: EventSource | null = null, open = false;

const all = (m: unknown) => ports.forEach((_, p) => p.postMessage(m));
function connect() {
  es = new EventSource('/api/stream?c=' + c);
  es.onopen = () => ((open = true), all({ t: 'open', c }));
  es.onmessage = (m) => {
    const { f, e } = JSON.parse(m.data), msg = { t: 'e', f, e, n: m.data.length }, o = owner.get(f);
    if (o) return o.port.postMessage(msg);
    const now = Date.now();
    for (const [k, v] of early) if (now - v.at > KEEP) early.delete(k);
    const q = early.get(f) || { at: now, list: [] };
    q.list.push(msg);
    early.set(f, q);
  };
  es.onerror = () => {
    open = false;
    if (es!.readyState !== EventSource.CLOSED) return;
    es = null;
    all({ t: 'failed' });
  };
}

function drop(f: string, tell: boolean) {
  early.delete(f);
  const o = owner.get(f);
  if (!o) return;
  owner.delete(f);
  ports.get(o.port)?.delete(f);
  if (tell && open) fetch('/api/stream', { method: 'POST', headers: { 'x-mind-workspace': o.wid, 'x-mind-project': '', 'content-type': 'application/json' }, body: JSON.stringify({ c, f, stop: true }) }).catch(() => {});
}
function leave(port: MessagePort) {
  for (const f of ports.get(port) || []) drop(f, true);
  ports.delete(port);
}

onconnect = ({ ports: [port] }) => {
  port.onmessage = ({ data: d }) => {
    if (d.t === 'join') {
      ports.set(port, ports.get(port) || new Set());
      if (!es) connect();
      else if (open) port.postMessage({ t: 'open', c });
    } else if (d.t === 'follow') {
      owner.set(d.f, { port, wid: d.wid });
      ports.get(port)?.add(d.f);
      for (const m of early.get(d.f)?.list || []) port.postMessage(m);
      early.delete(d.f);
    } else if (d.t === 'stop') drop(d.f, false);
    else if (d.t === 'bye') leave(port);
  };
  port.addEventListener('close', () => leave(port));
};
