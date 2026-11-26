import fs from 'fs';
import path from 'path';
import type { App, BrowserWindow, Clipboard, IpcMain, PowerMonitor, ProcessMetric, Rectangle, Screen, Shell, UtilityProcess, WebContents } from 'electron';

interface HitchDeps {
  app: App;
  BrowserWindow: typeof BrowserWindow;
  clipboard: Clipboard;
  ipcMain: IpcMain;
  powerMonitor: PowerMonitor;
  screen: Screen;
  shell: Shell;
  dir: string;
  ours: (url: string) => boolean;
  nameOf: (w: BrowserWindow) => string;
  version: string;
  viewers: () => BrowserWindow[];
  server: () => UtilityProcess | null;
  target: () => BrowserWindow | null | undefined;
}
type Second = { t: number; blocked: number; worst: number; changes: number; heap: number; kb: number; inputs: number };
type Page = { who: string; hung: boolean; timeline: Second[]; state: string };
type Proc = { t: number; rows: { name: string; cpu: number; mem: number }[] };
type Probe = { t: number; why: string; cpu: number | null; disk: number | null; rows: { pid: number; name: string; cpu: number; mb: number; io: number }[]; error?: string };
type Prof = { pageWhy: string; serverWhy: string; page?: any; server?: any };

const MAX = 4 * 1024 * 1024;
const MB = (kb: number) => Math.round(kb / 1024);
const SPAN = 40000, KEEP = 60000, SNAPS = 20, RECORD = 10000;

export default function hitch({ app, BrowserWindow, clipboard, ipcMain, powerMonitor, screen, shell, dir, ours, nameOf, version, viewers, server, target }: HitchDeps) {
  const file = path.join(dir, 'hitch.log'), snapDir = path.join(dir, 'snapshots');
  let queue: string[] = [], timer: NodeJS.Timeout | null = null;
  const recent: { t: number; line: string }[] = [], procs: Proc[] = [];
  const trim = (list: { t: number }[]) => {
    while (list[0] && Date.now() - list[0].t > KEEP) list.shift();
  };

  const stamp = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 23).replace('T', ' ');
  let writing: Promise<unknown> = Promise.resolve();
  async function shrink() {
    const h = await fs.promises.open(file, 'r');
    let half: Buffer;
    try {
      const size = (await h.stat()).size;
      if (size <= MAX) return;
      half = Buffer.alloc(size >> 1);
      await h.read(half, 0, half.length, size - half.length);
    } finally {
      await h.close();
    }
    const tmp = file + '.tmp';
    await fs.promises.writeFile(tmp, half.subarray(half.indexOf(10) + 1));
    await fs.promises.rename(tmp, file);
  }
  function take() {
    clearTimeout(timer!);
    timer = null;
    if (!queue.length) return '';
    const text = queue.join('');
    queue = [];
    for (const v of viewers()) v.webContents.send('hitch-lines', text);
    return text;
  }
  function flush() {
    const text = take();
    if (!text) return;
    writing = writing
      .then(async () => {
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.appendFile(file, text);
        if ((await fs.promises.stat(file)).size > MAX) await shrink();
      })
      .catch(() => {});
  }
  function flushSync() {
    const text = take();
    if (!text) return;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(file, text);
    } catch {}
  }
  const log = (who: string, text: string) => {
    const line = `${stamp()} [${who}] ${text}`;
    queue.push(line + '\n');
    recent.push({ t: Date.now(), line });
    trim(recent);
    timer ||= setTimeout(flush, 500);
  };
  const nameOfWin = (w: BrowserWindow | null) => (w && !w.isDestroyed() ? nameOf(w) || 'window' : 'app');
  const rect = (b: Rectangle) => `${b.width}x${b.height}@${b.x},${b.y}`;
  const display = (b: Rectangle) => {
    const d = screen.getDisplayMatching(b);
    return `display ${d.id} ${d.bounds.width}x${d.bounds.height} scale ${d.scaleFactor}`;
  };

  const procName = (m: ProcessMetric) => `${m.type}${m.name && m.name !== m.type ? ' ' + m.name : ''} #${m.pid}`;
  const metrics = (why: string) => {
    const parts = app.getAppMetrics().map((m) => `${procName(m)} cpu ${m.cpu.percentCPUUsage.toFixed(0)}% wake ${m.cpu.idleWakeupsPerSecond} mem ${MB(m.memory.workingSetSize)}MB`);
    const sys = process.getSystemMemoryInfo();
    log('app', `metrics ${why}: ${parts.join(' | ')} | system free ${MB(sys.free)}/${MB(sys.total)}MB`);
  };

  ipcMain.on('hitch-log', (e, lines) => {
    if (!ours(e.senderFrame?.url || '') || !Array.isArray(lines)) return;
    const who = nameOfWin(BrowserWindow.fromWebContents(e.sender));
    for (const l of lines.slice(0, 50)) log(who, String(l).slice(0, 2000));
  });
  ipcMain.on('hitch-metrics', (e, why) => ours(e.senderFrame?.url || '') && metrics(String(why).slice(0, 60)));

  ipcMain.handle('hitch-tail', (e) => {
    if (!ours(e.senderFrame?.url || '')) return '';
    try {
      const size = fs.statSync(file).size, n = Math.min(size, 512 * 1024), buf = Buffer.alloc(n), fd = fs.openSync(file, 'r');
      try {
        fs.readSync(fd, buf, 0, n, size - n);
      } finally {
        fs.closeSync(fd);
      }
      const lines = buf.toString('utf8').split('\n');
      if (n < size) lines.shift();
      return lines.slice(-2001).join('\n');
    } catch {
      return '';
    }
  });
  ipcMain.handle('hitch-folder', (e) => ours(e.senderFrame?.url || '') && fs.existsSync(file) && shell.showItemInFolder(file));

  const asked = new Map<number, (m: any) => void>();
  let askN = 0;
  log.fromServer = (m: any) => {
    if (m?.hitch === 'line') return log('server', String(m.text).slice(0, 2000));
    const w = asked.get(m?.id);
    if (w) (asked.delete(m.id), w(m));
  };
  const askServer = (what: string, ms: number, extra = {}) =>
    new Promise<any>((done) => {
      const p = server();
      if (!p) return done(null);
      const id = ++askN, t = setTimeout(() => (asked.delete(id), done(null)), ms);
      asked.set(id, (m) => (clearTimeout(t), done(m)));
      try {
        p.postMessage({ hitch: what, id, ...extra });
      } catch {
        clearTimeout(t);
        asked.delete(id);
        done(null);
      }
    });
  const dumps = new Map<number, (wc: WebContents, d: any) => void>();
  ipcMain.on('hitch-dump', (e, d) => {
    if (!ours(e.senderFrame?.url || '')) return;
    const w = dumps.get(d?.id);
    if (w) w(e.sender, d);
  });
  async function askPages(): Promise<Page[]> {
    const pages = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && !viewers().includes(w) && ours(w.webContents.getURL()) && !w.webContents.getURL().includes('/hitch.html'));
    const id = ++askN, got = new Map();
    await new Promise<void>((done) => {
      const t = setTimeout(done, 1000);
      dumps.set(id, (wc, d) => {
        got.set(wc.id, d);
        if (got.size === pages.length) (clearTimeout(t), done());
      });
      for (const w of pages) w.webContents.send('hitch-dump', id);
      if (!pages.length) (clearTimeout(t), done());
    });
    dumps.delete(id);
    return pages.map((w) => {
      const d = got.get(w.webContents.id), who = nameOfWin(w);
      if (d) for (const l of (Array.isArray(d.lines) ? d.lines : []).slice(0, 200)) log(who, String(l).slice(0, 2000));
      return { who, hung: !d, timeline: Array.isArray(d?.timeline) ? d.timeline : [], state: String(d?.state || '') };
    });
  }

  const stampOf = (f: string) => f.match(/^snap-([\d_-]+)/)?.[1];
  function prune() {
    try {
      const stamps = [...new Set(fs.readdirSync(snapDir).map(stampOf).filter(Boolean))].sort();
      const old = new Set(stamps.slice(0, -SNAPS));
      for (const f of fs.readdirSync(snapDir)) if (old.has(stampOf(f))) fs.rmSync(path.join(snapDir, f), { force: true });
    } catch {}
  }

  async function snapshot(prof: Prof | null = null) {
    const end = Date.now(), from = end - SPAN - (prof ? RECORD : 0);
    const [pages, srv] = await Promise.all([askPages(), askServer('state', 1000, { span: end - from })]);
    const lines = recent.filter((r) => r.t >= from).map((r) => r.line), mine = procs.filter((p) => p.t >= from);
    const name = `snap-${stamp().slice(0, 19).replace(' ', '_').replace(/:/g, '-')}`;
    const out = [
      `Amethyst freeze snapshot · ${stamp().slice(0, 19)} · the last ${Math.round((end - from) / 1000)} s (${clockOf(from)} → ${clockOf(end)})${prof ? ', the last 10 s profiled' : ''}`,
      `Amethyst ${version}, Electron ${process.versions.electron}, ${process.platform} ${process.getSystemVersion()}`,
      '',
      '## In short',
      ...inShort({ lines, pages, procs: mine, server: srv, hasServer: !!server() }).map((l) => '- ' + l),
      '',
      '## Each second',
      '(blocked: ms of frames over 50 ms that held input; worst: the longest frame; changes: page nodes, attributes and texts changed; stream: KB the server sent)',
    ];
    for (const p of pages) {
      out.push(`### ${p.who}${p.hung ? " (didn't answer: hung)" : ''}`, 'time      blocked  worst  changes  heap MB  stream KB  inputs');
      for (const s of p.timeline.filter((s) => s.t >= from)) out.push(`${clockOf(s.t)}  ${pad(s.blocked, 7)}  ${pad(s.worst, 5)}  ${pad(s.changes, 7)}  ${pad(s.heap, 7)}  ${pad(s.kb, 9)}  ${pad(s.inputs, 6)}`);
    }
    out.push('### processes every 2 s (those over 1% CPU or 200 MB)');
    for (const p of mine) out.push(`${clockOf(p.t)}  ${p.rows.filter((r) => r.cpu >= 1 || r.mem >= 200).map((r) => `${r.name} ${r.cpu}% ${r.mem}MB`).join(' | ') || 'all idle'}`);
    if (srv?.cpu?.length) {
      out.push('### the PC every second (the whole machine: CPU of all cores, free memory)', 'time      CPU %  free MB');
      for (const c of srv.cpu) out.push(`${clockOf(c.t)}  ${pad(c.cpu, 5)}  ${pad(c.free, 7)}`);
    }
    if (srv?.probes?.length) {
      out.push('### the busiest programs on the PC (sampled during a stall or a hang; CPU as % of the whole PC; I/O: disk, network and devices)');
      for (const p of srv.probes as Probe[]) {
        out.push(`${clockOf(p.t)}  ${p.why}: PC CPU ${p.cpu ?? '?'}%${p.disk == null ? '' : `, disk ${p.disk}% busy`}${p.error ? ` (${p.error})` : ''}`);
        if (p.rows.length) out.push('  ' + p.rows.map((r) => `${r.name} #${r.pid} ${r.cpu}% ${r.mb} MB${r.io ? ` I/O ${r.io} MB/s` : ''}`).join(' | '));
      }
    }
    if (srv?.loop?.length) {
      out.push("### the server's event loop every 5 s (how late it ran)");
      for (const l of srv.loop) out.push(`${clockOf(l.t)}  max ${l.max} ms, p99 ${l.p99} ms`);
    }
    out.push('', `## Lines (hitch.log, ${clockOf(from)} → ${clockOf(end)})`, ...(lines.length ? lines : ['none']), '', '## Now');
    out.push(...app.getAppMetrics().map((m) => `${procName(m)} cpu ${m.cpu.percentCPUUsage.toFixed(0)}% mem ${MB(m.memory.workingSetSize)}MB`));
    const sys = process.getSystemMemoryInfo();
    out.push(`system free ${MB(sys.free)}/${MB(sys.total)}MB`);
    for (const p of pages) out.push(`${p.who}: ${p.hung ? "didn't answer within 1 s (hung)" : p.state}`);
    out.push(srv ? `server: rss ${srv.rss} MB, heap ${srv.heap} MB, ${srv.flight?.length ? 'in flight: ' + srv.flight.join(', ') : 'no request in flight'}` : server() ? "server: didn't answer within 1 s (busy or hung)" : 'server: not started by this app, not measured');
    fs.mkdirSync(snapDir, { recursive: true });
    if (prof) {
      out.push('', '## Profile, the last 10 s (self time: spent in the function itself, not in what it called)');
      for (const [who, p, why] of [['Window 1 page', prof.page, prof.pageWhy], ['server', prof.server, prof.serverWhy]]) {
        out.push(`### ${who}`);
        if (!p) {
          out.push(why);
          continue;
        }
        const f = `${name}-${who === 'server' ? 'server' : 'page'}.cpuprofile`;
        fs.writeFileSync(path.join(snapDir, f), JSON.stringify(p));
        out.push(...digest(p), `(the whole profile: ${f}; it opens in DevTools → Performance)`);
      }
    }
    const at = path.join(snapDir, name + '.txt');
    fs.writeFileSync(at, out.join('\n') + '\n');
    prune();
    clipboard.writeText(at);
    log('app', `snapshot saved: ${at}`);
    return { path: at };
  }

  let recording = false;
  async function record() {
    if (recording) return { busy: true };
    recording = true;
    try {
      const w = target(), prof: Prof ={ pageWhy: 'no Window 1 open', serverWhy: server() ? "the server didn't answer" : 'the server was not started by this app, not measured' };
      let dbg = null;
      if (w && !w.isDestroyed()) {
        try {
          dbg = w.webContents.debugger;
          dbg.attach('1.3');
          await dbg.sendCommand('Profiler.enable');
          await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
          await dbg.sendCommand('Profiler.start');
        } catch (e) {
          if (dbg?.isAttached()) dbg.detach();
          dbg = null;
          prof.pageWhy = /attach/i.test((e as Error).message) ? 'not recorded: DevTools (or another debugger) is open on Window 1, and only one can attach' : `not recorded: ${(e as Error).message}`;
        }
      }
      const srv = askServer('profile', RECORD + 5000, { ms: RECORD });
      await new Promise((r) => setTimeout(r, RECORD));
      if (dbg) {
        try {
          prof.page = (await dbg.sendCommand('Profiler.stop')).profile;
        } catch (e) {
          prof.pageWhy = `not recorded: ${(e as Error).message}`;
        }
        try {
          dbg.detach();
        } catch {}
      }
      const s = await srv;
      if (s?.profile) prof.server = s.profile;
      else if (s?.error) prof.serverWhy = `not recorded: ${s.error}`;
      return { ...(await snapshot(prof)), devtools: !prof.page && /DevTools/.test(prof.pageWhy) };
    } finally {
      recording = false;
    }
  }
  ipcMain.handle('hitch-snapshot', (e) => (ours(e.senderFrame?.url || '') ? snapshot().catch((err) => ({ error: err.message })) : null));
  ipcMain.handle('hitch-record', (e) => (ours(e.senderFrame?.url || '') ? record().catch((err) => ({ error: err.message })) : null));

  function burst(w: BrowserWindow, kind: string) {
    const s = { n: 0, t0: Date.now(), from: w.getBounds(), timer: null as NodeJS.Timeout | null };
    return () => {
      s.n++;
      clearTimeout(s.timer!);
      s.timer = setTimeout(() => {
        if (w.isDestroyed()) return;
        const b = w.getBounds();
        log(nameOfWin(w), `${kind}: ${s.n} events in ${Date.now() - s.t0} ms, ${rect(s.from)} -> ${rect(b)}, ${display(b)}${w.isMaximized() ? ', maximized' : ''}`);
        metrics(`after ${kind}`);
        setTimeout(() => metrics(`1 s after ${kind}`), 1000);
        s.n = 0;
        s.t0 = Date.now();
        s.from = b;
      }, 400);
    };
  }
  function watch(w: BrowserWindow) {
    const wc = w.webContents, say = (t: string) => log(nameOfWin(w), t);
    const size = burst(w, 'resize'), move = burst(w, 'move');
    w.on('resize', size);
    w.on('move', move);
    for (const ev of ['maximize', 'unmaximize', 'minimize', 'restore', 'enter-full-screen', 'leave-full-screen', 'show', 'hide', 'close']) w.on(ev as 'show', () => say(ev));
    w.on('unresponsive', () => {
      say('window unresponsive: the page is hung');
      metrics('unresponsive');
      try {
        server()?.postMessage({ hitch: 'probe', why: `${nameOfWin(w)} unresponsive` });
      } catch {}
    });
    w.on('responsive', () => say('window responsive again'));
    wc.on('unresponsive', () => say('page unresponsive'));
    wc.on('responsive', () => say('page responsive again'));
    wc.on('render-process-gone', (e, d) => say(`page process gone: ${d.reason} (${d.exitCode})`));
    wc.on('did-start-loading', () => say('page loading (reload or navigation)'));
    wc.on('did-finish-load', () => say('page loaded'));
  }

  app.on('browser-window-created', (e, w) => watch(w));
  app.on('child-process-gone', (e, d) => log('app', `process gone: ${d.type} ${d.name || ''} ${d.reason} (${d.exitCode})`));
  app.on('web-contents-created', (e, wc) => {
    if (wc.getType() !== 'webview') return;
    wc.on('unresponsive', () => log('app', 'a browser tab is unresponsive'));
    wc.on('render-process-gone', (ev, d) => log('app', `a browser tab's process is gone: ${d.reason}`));
  });
  app.on('will-quit', flushSync);
  let last = Date.now(), ticks = 0;
  setInterval(() => {
    const now = Date.now(), late = now - last - 100;
    last = now;
    if (++ticks % 5 === 0)
      try {
        server()?.postMessage({ hitch: 'beat' });
      } catch {}
    if (late > 300) log('app', `the app's own process stalled ${late} ms`);
  }, 100).unref();
  setInterval(() => metrics('every 30 s'), 30000).unref();
  setInterval(() => {
    procs.push({ t: Date.now(), rows: app.getAppMetrics().map((m) => ({ name: procName(m), cpu: Math.round(m.cpu.percentCPUUsage), mem: MB(m.memory.workingSetSize) })) });
    trim(procs);
  }, 2000).unref();

  app.whenReady().then(async () => {
    for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) {
      screen.on(ev as 'display-metrics-changed', (e, d, changed) => log('app', `${ev} ${d.id} ${d.bounds.width}x${d.bounds.height} scale ${d.scaleFactor}${changed ? ' changed: ' + ([] as string[]).concat(changed).join(',') : ''}`));
    }
    for (const ev of ['suspend', 'resume', 'lock-screen', 'unlock-screen', 'on-ac', 'on-battery']) powerMonitor.on(ev as 'suspend', () => log('app', `power ${ev}`));
    let gpuSaid = '';
    const gpuLine = async () => {
      const gpu = (await app.getGPUInfo('basic').catch(() => null)) as { gpuDevice?: { vendorId: number; deviceId: number; driverVersion: string }[] } | null, dev = gpu?.gpuDevice?.[0];
      const t = `gpu: ${dev ? `${dev.vendorId}:${dev.deviceId} driver ${dev.driverVersion}` : 'unknown'}, features ${JSON.stringify(app.getGPUFeatureStatus())}`;
      if (t !== gpuSaid) log('app', (gpuSaid ? 'changed, ' : '') + (gpuSaid = t));
    };
    log('app', `start: Amethyst ${version}, Electron ${process.versions.electron}, Chromium ${process.versions.chrome}, ${process.platform} ${process.getSystemVersion()}`);
    await gpuLine();
    setTimeout(gpuLine, 10000).unref();
    app.on('gpu-info-update', gpuLine);
    for (const d of screen.getAllDisplays()) log('app', `display ${d.id}: ${d.bounds.width}x${d.bounds.height} at ${d.bounds.x},${d.bounds.y}, scale ${d.scaleFactor}, ${d.displayFrequency} Hz, rotation ${d.rotation}`);
    metrics('start');
  });
  return log;
};

const pad = (v: unknown, n: number) => String(v ?? '').padStart(n);
const clockOf = (t: number) => new Date(t - new Date().getTimezoneOffset() * 60000).toISOString().slice(11, 19);

function digest(p: any, n = 15) {
  const nodes = new Map<any, any>(p.nodes.map((x: any) => [x.id, x])), self = new Map(), deltas = p.timeDeltas || [];
  for (let i = 0; i < (p.samples || []).length; i++) {
    const x = nodes.get(p.samples[i]);
    if (!x) continue;
    const c = x.callFrame, file = (c.url || '').split(/[\\/]/).pop().split('?')[0];
    const key = `${c.functionName || '(anonymous)'}${file ? `  ${file}:${c.lineNumber + 1}` : ''}`;
    self.set(key, (self.get(key) || 0) + (deltas[i + 1] ?? 0) / 1000);
  }
  const total = [...self.values()].reduce((a, b) => a + b, 0) || 1, idle = self.get('(idle)') || 0;
  const rows = [...self].filter(([k]) => k !== '(idle)' && k !== '(root)').sort((a, b) => b[1] - a[1]).slice(0, n);
  return [`busy ${Math.round(total - idle)} ms of ${Math.round(total)} ms (idle ${Math.round((idle / total) * 100)}%)`, ...rows.map(([k, ms]) => `${pad(Math.round(ms), 6)} ms ${pad(Math.round((ms / total) * 100), 3)}%  ${k}`)];
}

function inShort({ lines, pages = [], procs = [], server = null, hasServer = true }: { lines: string[]; pages?: Page[]; procs?: Proc[]; server?: { loop?: { max: number }[]; cpu?: { t: number; cpu: number }[]; probes?: Probe[] } | null; hasServer?: boolean }) {
  const out = [], hangs = [];
  let worst = null;
  for (const l of lines) {
    const m = l.match(/^\S+ (\S+) \[([^\]]*)\] (.*)$/);
    if (!m) continue;
    const [, time, who, text] = m;
    if (/unresponsive|gone:/.test(text)) hangs.push(`${time.slice(0, 8)} [${who}] ${text}`);
    if (!/^(slow |action |switch )|stalled /.test(text)) continue;
    const ms = +(text.match(/(\d+) ms/)?.[1] || 0);
    if (!worst || ms > worst.ms) worst = { ms, time, who, text };
  }
  if (worst) out.push(`worst: ${worst.time.slice(0, 8)} [${worst.who}] ${worst.text.length > 400 ? worst.text.slice(0, 400) + '…' : worst.text}`);
  if (hangs.length) out.push(`hangs: ${hangs.slice(0, 5).join('; ')}`);
  for (const p of pages) {
    if (p.hung) out.push(`${p.who} didn't answer the snapshot within 1 s: it is hung now`);
    let run = null, best = null;
    for (const s of p.timeline || []) {
      if (s.blocked < 200) {
        run = null;
        continue;
      }
      run ||= { from: s.t, to: s.t, ms: 0 };
      run.to = s.t;
      run.ms += s.blocked;
      if (!best || run.ms > best.ms) best = { ...run };
    }
    if (best) {
      const secs = Math.round((best.to - best.from) / 1000) + 1;
      out.push(`busiest: ${p.who}, ${secs} s from ${clockOf(best.from)}, blocked ${(best.ms / 1000).toFixed(1)} s of them`);
    }
    const heaps = (p.timeline || []).map((s) => s.heap).filter((h) => h > 0);
    if (heaps.length > 1 && heaps.at(-1)! - heaps[0] >= 50) out.push(`${p.who}'s heap grew ${heaps[0]} → ${heaps.at(-1)} MB`);
  }
  const top = procs.flatMap((p) => p.rows.map((r) => ({ ...r, t: p.t }))).sort((a, b) => b.cpu - a.cpu)[0];
  if (top && top.cpu >= 25) out.push(`dearest process: ${top.name} at ${top.cpu}% CPU (${clockOf(top.t)})`);
  const stalls = lines.filter((l) => /\[server\] stalled/.test(l)).length;
  if (stalls) out.push(`the server stalled ${stalls} time${stalls > 1 ? 's' : ''}`);
  const probes = server?.probes || [];
  for (const p of probes.slice(0, 5)) {
    const disk = p.disk == null ? '' : `, disk ${p.disk}% busy`;
    if (p.error && !p.rows.length) out.push(`${clockOf(p.t)}, ${p.why}: the PC couldn't be sampled (${p.error})`);
    else if (p.cpu != null && p.cpu < 30 && (p.disk == null || p.disk < 50)) out.push(`${clockOf(p.t)}, ${p.why}: the PC was quiet (CPU ${p.cpu}%${disk}): the load wasn't other programs`);
    else out.push(`${clockOf(p.t)}, ${p.why}: the PC was at ${p.cpu ?? '?'}% CPU${disk}; busiest: ${p.rows.slice(0, 3).map((r) => `${r.name} #${r.pid} ${r.cpu}%${r.io ? ` (I/O ${r.io} MB/s)` : ''}`).join(', ')}`);
  }
  if (!probes.length) {
    let run = null, best = null;
    for (const c of server?.cpu || []) {
      if (c.cpu < 80) {
        run = null;
        continue;
      }
      run ||= { from: c.t, n: 0 };
      run.n++;
      if (!best || run.n > best.n) best = { ...run };
    }
    if (best && best.n >= 3) out.push(`the PC was busy: CPU at 80% or more for ${best.n} s from ${clockOf(best.from - 1000)}`);
  }
  const loop = Math.max(0, ...(server?.loop || []).map((l) => l.max));
  if (loop >= 100) out.push(`the server's event loop ran up to ${loop} ms late`);
  if (!out.length) out.push('nothing slow in this time');
  if (!hasServer) out.push('the server was not started by this app: not measured');
  return out;
}

export { digest, inShort };
