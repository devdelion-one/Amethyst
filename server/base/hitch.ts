import os from 'os';
import inspector from 'inspector';
import { execFile } from 'child_process';
import { monitorEventLoopDelay } from 'perf_hooks';
import type { ServerResponse } from 'http';

type Read = { p: number; n: string; c: number; m: number; io: number; ts: number };
type Row = { pid: number; name: string; cpu: number; mb: number; io: number };
type Probe = { t: number; why: string; cpu: number | null; disk: number | null; rows: Row[]; error?: string };
type Cpu = { t: number; cpu: number; free: number };
type Port = { postMessage(m: unknown): void; on(ev: 'message', fn: (e: { data: any }) => void): void };

const parent = () => (process as unknown as { parentPort?: Port }).parentPort;

const KEEP = 60000, SILENT = 3000, AGAIN = 10000;
const flight = new Set<{ key: string; at: number }>();

export function inFlight(key: string, res: ServerResponse) {
  if (!parent()) return;
  const f = { key, at: Date.now() };
  flight.add(f);
  res.once('close', () => flight.delete(f));
}

export function busiest(a: Read[], b: Read[], cores: number, n = 5): Row[] {
  const bare = (n: unknown) => String(n || '?').replace(/#\d+$/, ''), key = (r: Read) => `${r.p}|${bare(r.n)}`, before = new Map(a.map((r) => [key(r), r]));
  const rows: Row[] = [];
  for (const r of b) {
    const r0 = before.get(key(r)), dt = r0 ? r.ts - r0.ts : 0;
    if (!r.p || !r0 || dt <= 0 || r.n === '_Total') continue;
    rows.push({
      pid: r.p,
      name: bare(r.n),
      cpu: Math.max(0, Math.round(((r.c - r0.c) / dt / Math.max(cores, 1)) * 100)),
      mb: Math.round(r.m || 0),
      io: Math.max(0, Math.round((r.io - r0.io) / (dt / 1e7) / 1048576)),
    });
  }
  return rows.sort((x, y) => y.cpu - x.cpu || y.io - x.io || y.mb - x.mb).slice(0, n);
}

const sayRow = (r: Row) => `${r.name} #${r.pid} ${r.cpu}% ${r.mb} MB${r.io ? `, I/O ${r.io} MB/s` : ''}`;

export function sayProbe(p: { cpu: number | null; disk: number | null; rows: Row[]; error?: string }, max?: number) {
  if (p.error && !p.rows.length) return `the PC couldn't be sampled: ${p.error}`;
  const pct = max == null ? `${p.cpu ?? '?'}%` : `avg ${p.cpu ?? '?'}%, max ${max}%`, disk = p.disk == null ? '' : `, disk ${p.disk}% busy`;
  if (quiet(p)) return `the PC was quiet (CPU ${pct}${disk}): the load wasn't other programs`;
  return `the PC was busy (CPU ${pct}${disk}); busiest: ${p.rows.map(sayRow).join('; ')}`;
}
const quiet = (p: { cpu: number | null; disk: number | null }) => p.cpu != null && p.cpu < 30 && (p.disk == null || p.disk < 50);

const SCRIPT = `$q = { Get-CimInstance Win32_PerfRawData_PerfProc_Process -Property Name,IDProcess,PercentProcessorTime,WorkingSet,IODataBytesPersec,Timestamp_Sys100NS | Select-Object @{n='p';e={$_.IDProcess}}, @{n='n';e={$_.Name}}, @{n='c';e={$_.PercentProcessorTime}}, @{n='m';e={[math]::Round($_.WorkingSet / 1MB)}}, @{n='io';e={$_.IODataBytesPersec}}, @{n='ts';e={$_.Timestamp_Sys100NS}} }
$a = & $q; Start-Sleep -Milliseconds 1000; $b = & $q
$d = try { (Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -Filter "Name='_Total'" -ErrorAction Stop).PercentIdleTime } catch { $null }
[pscustomobject]@{ a = @($a); b = @($b); idle = $d } | ConvertTo-Json -Compress -Depth 3`;
const ENCODED = Buffer.from(SCRIPT, 'utf16le').toString('base64');

export function startHitch() {
  const port = parent();
  if (!port) return;
  const tell = (m: unknown) => port.postMessage(m);
  const trim = (list: { t: number }[]) => {
    while (list[0] && Date.now() - list[0].t > KEEP) list.shift();
  };
  const waiting = () => [...flight].map((f) => `${f.key} (${((Date.now() - f.at) / 1000).toFixed(1)} s)`).slice(0, 10);
  let last = Date.now();
  setInterval(() => {
    const now = Date.now(), late = now - last - 100;
    last = now;
    if (late > 300) tell({ hitch: 'line', text: `stalled ${late} ms; ${flight.size ? 'in flight: ' + waiting().join(', ') : 'no request in flight'}` });
  }, 100).unref();
  const delay = monitorEventLoopDelay({ resolution: 20 }), loop: { t: number; max: number; p99: number }[] = [];
  delay.enable();
  setInterval(() => {
    loop.push({ t: Date.now(), max: Math.round(delay.max / 1e6), p99: Math.round(delay.percentile(99) / 1e6) });
    if (loop.length > 12) loop.shift();
    delay.reset();
  }, 5000).unref();

  const cpu: Cpu[] = [], probes: Probe[] = [];
  const times = () =>
    os.cpus().reduce(
      (s, { times: t }) => ((s.busy += t.user + t.nice + t.sys + t.irq), (s.all += t.user + t.nice + t.sys + t.irq + t.idle), s),
      { busy: 0, all: 0 },
    );
  let prev = times();
  setInterval(() => {
    const now = times(), all = now.all - prev.all;
    cpu.push({ t: Date.now(), cpu: all > 0 ? Math.round(((now.busy - prev.busy) / all) * 100) : 0, free: Math.round(os.freemem() / 1048576) });
    prev = now;
    trim(cpu);
  }, 1000).unref();
  const over = (from: number, to: number) => {
    const xs = cpu.filter((c) => c.t > from && c.t <= to + 1000).map((c) => c.cpu);
    if (!xs.length && cpu.length) xs.push(cpu.at(-1)!.cpu);
    return xs.length ? { avg: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), max: Math.max(...xs) } : null;
  };

  let probing = false, pending: (() => void) | null = null;
  function probe(why: string, done?: (p: Probe) => void) {
    if (probing) return;
    probing = true;
    const t = Date.now();
    const finish = (p: Omit<Probe, 'cpu'>) => {
      const full = { ...p, cpu: over(t, Date.now())?.avg ?? null };
      probes.push(full);
      trim(probes);
      probing = false;
      done?.(full);
      const next = pending;
      pending = null;
      next?.();
    };
    if (process.platform !== 'win32') return finish({ t, why, disk: null, rows: [], error: 'not sampled on this system' });
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', ENCODED], { windowsHide: true, timeout: 8000, maxBuffer: 16 << 20 }, (err, out) => {
      try {
        const j = JSON.parse(String(out).replace(/^﻿/, ''));
        finish({ t, why, disk: j.idle == null ? null : Math.max(0, Math.round(100 - j.idle)), rows: busiest([].concat(j.a || []), [].concat(j.b || []), os.cpus().length) });
      } catch {
        finish({ t, why, disk: null, rows: [], error: err ? String(err.message).slice(0, 200) : 'unreadable answer' });
      }
    });
  }

  let beat = 0, silentSince = 0, nextProbe = 0, tick = Date.now();
  function back(now: number) {
    const from = silentSince;
    silentSince = 0;
    const mine = probes.filter((p) => p.t >= from);
    const c = over(from, now), top = new Map<number, Row>();
    for (const p of mine) for (const r of p.rows) if (!top.has(r.pid) || top.get(r.pid)!.cpu < r.cpu) top.set(r.pid, r);
    const disks = mine.map((p) => p.disk).filter((d) => d != null);
    const sum = { cpu: c?.avg ?? null, disk: disks.length ? Math.max(...disks) : null, rows: [...top.values()].sort((a, b) => b.cpu - a.cpu).slice(0, 5), error: mine.find((p) => p.error)?.error };
    const said = sayProbe(sum, c?.max);
    tell({ hitch: 'line', text: `the app's main process was silent ${((now - from) / 1000).toFixed(1)} s; ${mine.length ? said : 'the PC: not sampled'}` });
  }
  setInterval(() => {
    const now = Date.now(), late = now - tick - 500;
    tick = now;
    if (!beat) return;
    if (late > SILENT) {
      beat = now;
      silentSince = 0;
      return;
    }
    if (now - beat < SILENT) return;
    if (!silentSince) (silentSince = beat), (nextProbe = now);
    if (now >= nextProbe) (nextProbe = now + AGAIN), probe('main process stalled');
  }, 500).unref();

  port.on('message', ({ data: m }) => {
    if (m?.hitch === 'beat') {
      const now = Date.now();
      if (silentSince && !pending) {
        if (probing) pending = () => back(now);
        else back(now);
      }
      beat = now;
    } else if (m?.hitch === 'probe') {
      probe(String(m.why || 'asked').slice(0, 80), (p) => tell({ hitch: 'line', text: `sampled the PC (${p.why}): ${sayProbe(p)}` }));
    } else if (m?.hitch === 'state') {
      const mem = process.memoryUsage(), span = m.span || 40000, keep = (l: { t: number }) => Date.now() - l.t <= span;
      tell({ id: m.id, rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576), flight: waiting(), loop: loop.filter(keep), cpu: cpu.filter(keep), probes: probes.filter(keep) });
    } else if (m?.hitch === 'profile') {
      const s = new inspector.Session();
      const fail = (e: any) => (s.disconnect(), tell({ id: m.id, error: String(e?.message || e) }));
      s.connect();
      s.post('Profiler.enable', (e) => {
        if (e) return fail(e);
        s.post('Profiler.setSamplingInterval', { interval: 1000 }, () =>
          s.post('Profiler.start', (e2) => {
            if (e2) return fail(e2);
            setTimeout(() => s.post('Profiler.stop', (e3, r) => (e3 ? fail(e3) : (s.disconnect(), tell({ id: m.id, profile: r.profile })))), Math.min(+m.ms || 10000, 30000));
          }),
        );
      });
    }
  });
}
