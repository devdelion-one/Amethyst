import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, Notification, powerMonitor, screen, session, shell, Tray, utilityProcess, webContents } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { settle } from './update-state.ts';
import { accept, accepted, blocks, last, readRecord, versionOf } from './license-state.ts';
import type { LicenseRecord, LicenseText } from './license-state.ts';
import { due } from './usage-state.ts';
import type { Usage } from './usage-state.ts';
import { execFile, execSync } from 'child_process';
import { createRequire } from 'module';
import hitch from './hitch.ts';
import { ownedWindows, SITE } from './owned.ts';
import { amIn, amOf, inEvery, intoView, kindIn, leftBehind, noticePlan, ownAddr, ownKey, portPlan, projIn, projOf, sizeBox, soloIn, stays, userKey, userUrls, WAIT, withUser, zoneBox, zoneOf } from './snap.ts';
import type { NoticeAm } from './snap.ts';
import type { BrowserWindowConstructorOptions, NativeImage, Point, Rectangle, UtilityProcess, WebContents } from 'electron';
import type { AppUpdater, CancellationToken } from 'electron-updater';
const require = createRequire(import.meta.url);

const SRC = app.isPackaged ? path.join(process.resourcesPath, 'app-src') : path.join(import.meta.dirname, '..');

if (app.isPackaged) app.setAppUserModelId('dev.enthr.amethyst');

const PORT = Number(process.env.PORT) || 4777;
const BASE = `http://localhost:${PORT}`;
const ICON = path.join(import.meta.dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const APPDATA = process.env.APPDATA || app.getPath('appData');
const DATA = process.env.MIND_DESKTOP_DATA || path.join(APPDATA, fs.existsSync(path.join(APPDATA, 'Amethyst', 'desktop', 'windows.json')) || !fs.existsSync(path.join(APPDATA, 'ProjectMind', 'desktop')) ? 'Amethyst' : 'ProjectMind', 'desktop');
const STATE = path.join(DATA, 'windows.json');
app.setPath('userData', DATA);
app.commandLine.appendSwitch('disable-features', 'HideCursorWhileTyping');

const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const replaceSync = (file: string, text: string) => {
  const tmp = file + '.tmp';
  try {
    fs.writeFileSync(tmp, text);
    for (let i = 0; ; i++) {
      try {
        return fs.renameSync(tmp, file);
      } catch (e) {
        if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes((e as NodeJS.ErrnoException).code || '')) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1));
      }
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
};
const given = (argv: string[]) => argv.slice(app.isPackaged ? 1 : 2);
const named = (a: string) => !a.startsWith('-') && a !== '.';
const filesIn = (argv: string[], cwd: string) => given(argv).filter(named).map((a) => path.resolve(cwd, a)).filter(isFile);
const serverArgs = given(process.argv).filter((a) => a.startsWith('--workspace=') || (named(a) && !isFile(a)));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let serverUp: Promise<unknown> = Promise.resolve();
function answers() {
  return new Promise<boolean>((done) => {
    const req = http.get(`http://127.0.0.1:${PORT}/api/acts`, { timeout: 1500 }, (res) => {
      res.resume();
      done(res.statusCode === 200);
    });
    req.on('error', () => done(false));
    req.on('timeout', () => req.destroy());
  });
}

const opens = (host: string) => new Promise((done) => {
  const s = net.connect({ host, port: PORT, timeout: 1000 }, () => (s.destroy(), done(true)));
  s.on('error', () => done(false));
  s.on('timeout', () => (s.destroy(), done(false)));
});
const taken = async () => (await Promise.all(['127.0.0.1', '::1'].map(opens))).some(Boolean);

const user = userKey(() => crypto.randomBytes(32).toString('hex'));
app.whenReady().then(() => session.defaultSession.webRequest.onBeforeSendHeaders({ urls: userUrls(PORT) }, (d, answer) => answer({ requestHeaders: withUser(d.url, d.requestHeaders, PORT, user.now()) })));

let server: UtilityProcess | null = null;
let quitting = false;
async function ensureServer(): Promise<{ forked: number; up: number } | null> {
  const plan = await portPlan({ packaged: app.isPackaged, answers, taken, wait });
  if (plan === 'join') return null;
  if (plan === 'used') throw new Error(`Port ${PORT} is used by another program, so Amethyst can not open there.

Close that program (often a dev server started with npm run dev) or move it to another port, then start Amethyst again.`);
  let log = '', up = false;
  const forked = Date.now();
  const { MIND_USER_SECRET: _, ...env } = process.env;
  const proc = utilityProcess.fork(path.join(SRC, 'server.ts'), serverArgs, { cwd: SRC, env: { ...env, PORT: String(PORT) }, stdio: 'pipe', serviceName: 'Amethyst server' });
  server = proc;
  const key = user.start((m) => proc.postMessage(m));
  proc.once('spawn', key.again);
  proc.once('exit', key.end);
  const keep = (d: Buffer) => {
    if (!app.isPackaged) process.stdout.write(d);
    log = (log + d).slice(-4000);
  };
  proc.stdout!.on('data', keep);
  proc.stderr!.on('data', keep);
  await new Promise<void>((done, fail) => {
    const failed = () => fail(new Error(log.trim() || 'The server did not start.'));
    const timer = setTimeout(failed, 15000);
    proc.on('message', (m) => {
      if (m?.report) return void ringReport(m.report);
      if (m?.unring) return void unring(String(m.unring));
      if (m?.up !== true) return hitchLog.fromServer(m);
      key.up();
      clearTimeout(timer);
      up = true;
      done();
    });
    proc.on('exit', () => {
      clearTimeout(timer);
      if (!up) failed();
      if (server !== proc) return;
      server = null;
      if (quitting) app.quit();
      else if (up && wins.size) revive();
    });
  });
  return { forked, up: Date.now() };
}

async function revive() {
  try {
    await wait(500);
    await ensureServer();
    for (const w of BrowserWindow.getAllWindows()) w.webContents.reload();
  } catch (e) {
    dialog.showErrorBox('Amethyst stopped', String((e as Error).message || e));
    app.quit();
  }
}

let state: { open: string[]; places: Record<string, any>; [k: string]: any } = { open: [], places: {} };
try {
  state = { ...state, ...JSON.parse(fs.readFileSync(STATE, 'utf8')) };
} catch {}
let saveTimer: NodeJS.Timeout | null = null;
function writeState() {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    replaceSync(STATE, JSON.stringify(state, null, 2));
  } catch {}
}
function save() {
  clearTimeout(saveTimer!);
  saveTimer = setTimeout(writeState, 300);
}

const ours = (url: string) => {
  try {
    return new URL(url).origin === BASE;
  } catch {
    return false;
  }
};
const addrOf = (url: string) => {
  const u = new URL(url, BASE);
  u.searchParams.delete('of');
  u.searchParams.delete('act');
  return u.pathname + u.search;
};
const isExtra = (addr: string) => new URL(addr, BASE).searchParams.has('win');
const placeOf = (addr: string, old = false) => {
  const q = new URL(addr, BASE).searchParams;
  if (q.has('win') && q.has('pop')) return `pop:${q.get('solo') || 'quick'}`;
  return q.has('win') ? `/app?w=${encodeURIComponent(q.get('w') ?? '')}${old ? '' : `&p=${encodeURIComponent(q.get('p') ?? '')}`}&win=${q.get('win')}${isPop(addr) ? '&pop=1' : ''}${amOf(addr) > 1 ? `&am=${amOf(addr)}` : ''}` : addr;
};
const isPop = (addr: string) => isExtra(addr) && new URL(addr, BASE).searchParams.has('pop');
const onScreen = (b: Rectangle) => screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 10 && b.y < a.y + a.height - 60);

const wins = new Map<BrowserWindow, string>();

app.on('web-contents-created', (e, wc) => {
  wc.on('will-attach-webview', (ev, prefs, params) => {
    delete prefs.preload;
    Object.assign(prefs, { nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false });
    params.partition = 'persist:browser';
  });
  if (wc.getType() === 'webview') browsing(wc, () => wc.hostWebContents);
});
const SHELL_EXES: Record<string, string[]> = { PowerShell: ['pwsh.exe', 'powershell.exe'], 'Command Prompt': ['cmd.exe'] };
const shellIcons = new Map<string, Promise<NativeImage | null>>();
const whereExe = (exe: string) => new Promise<string | null>((done) => execFile('where', [exe], { windowsHide: true }, (err, out) => done(err ? null : String(out).split(/\r?\n/)[0].trim() || null)));
async function badged(name: string) {
  let file: string | null = null;
  for (const exe of SHELL_EXES[name]) if ((file = await whereExe(exe))) break;
  if (!file) return null;
  const S = 32, B = 16;
  const base = (await app.getFileIcon(file, { size: 'large' })).resize({ width: S, height: S });
  const mark = nativeImage.createFromPath(ICON).resize({ width: B, height: B });
  if (base.isEmpty() || mark.isEmpty()) return null;
  const px = Buffer.from(base.toBitmap()), m = mark.toBitmap();
  for (let y = 0; y < B; y++)
    for (let x = 0; x < B; x++) {
      const s = (y * B + x) * 4, d = ((S - B + y) * S + (S - B + x)) * 4, a = m[s + 3] / 255;
      for (let c = 0; c < 4; c++) px[d + c] = Math.round(m[s + c] + px[d + c] * (1 - a));
    }
  return nativeImage.createFromBitmap(px, { width: S, height: S });
}
const shellIconed = new WeakSet<BrowserWindow>();
async function iconFor(w: BrowserWindow, title: string) {
  const name = Object.keys(SHELL_EXES).find((n) => new RegExp(`^(#\\d+ )?${n} · `).test(title));
  if (!name) {
    if (shellIconed.delete(w) && !w.isDestroyed()) w.setIcon(ICON);
    return;
  }
  if (!shellIcons.has(name)) shellIcons.set(name, badged(name).catch(() => null));
  const img = await shellIcons.get(name);
  if (img && !w.isDestroyed()) w.setIcon(img), shellIconed.add(w);
}
if (process.platform === 'win32') app.on('browser-window-created', (e, w) => w.on('page-title-updated', (ev, title) => void iconFor(w, title)));
const HARMLESS = new Set(['fullscreen', 'clipboard-sanitized-write']);
app.whenReady().then(() => session.fromPartition('persist:browser').setPermissionRequestHandler((wc, what, answer) => answer(HARMLESS.has(what))));
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
function zoomBy(wc: WebContents, dir: number, host: () => WebContents | null) {
  const now = wc.getZoomFactor();
  const to = dir === 0 ? 1 : dir > 0 ? ZOOMS.find((z) => z > now + 0.001) : ZOOMS.findLast((z) => z < now - 0.001);
  if (!to) return;
  wc.setZoomFactor(to);
  const h = host();
  if (h && !h.isDestroyed()) h.send('browser-zoom', { id: wc.id, factor: to });
}
function browsing(wc: WebContents, host: () => WebContents | null) {
  wc.setZoomMode('isolated');
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const zoom = input.control || input.meta ? ({ '+': 1, '=': 1, '-': -1, 0: 0 } as Record<string, number>)[input.key] : undefined;
    if (zoom !== undefined) zoomBy(wc, zoom, host);
    else if (input.key === 'F5' && input.control) wc.reloadIgnoringCache();
    else if (input.key === 'F5') wc.reload();
    else if (input.key === 'F12') wc.toggleDevTools();
    else return;
    e.preventDefault();
  });
  wc.on('zoom-changed', (e, dir) => zoomBy(wc, dir === 'in' ? 1 : -1, host));
  wc.setWindowOpenHandler(({ url, frameName, features, disposition }) => {
    if (!/^https?:/i.test(url)) return { action: 'deny' };
    if (features || (frameName && frameName !== '_blank')) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 680, webPreferences: { session: wc.session, sandbox: true, contextIsolation: true, nodeIntegration: false } } };
    const to = host();
    if (to && !to.isDestroyed()) to.send('browser-open', { url, from: wc.id, behind: disposition === 'background-tab' });
    return { action: 'deny' };
  });
  wc.on('did-create-window', (w) => {
    w.removeMenu();
    browsing(w.webContents, host);
    const to = host(), from = to && BrowserWindow.fromWebContents(to);
    if (from) owned.add(w, ownKey(SITE, projFrom(from)));
  });
}

let lastMain: BrowserWindow | null = null;
const spares = new Set<BrowserWindow>();
const PARK_AFTER = 15 * 60e3;
const ofProject = (w: BrowserWindow, addr: string) => isExtra(addr) && !spares.has(w);
const hiddenAway = new Map<BrowserWindow, NodeJS.Timeout>();
const atNow = new Map<number, string>();
function placeExtra(w: BrowserWindow, addr: string) {
  const here = atNow.get(amOf(addr));
  if (here === undefined || w.isDestroyed() || !ofProject(w, addr)) return;
  if (stays(addr, here)) {
    if (hiddenAway.has(w)) (clearTimeout(hiddenAway.get(w)), hiddenAway.delete(w), [...away.values()].includes(w) || w.showInactive());
  } else if (!hiddenAway.has(w)) {
    hiddenAway.set(w, setTimeout(() => (closeOk.set(w, true), w.close()), PARK_AFTER));
    w.hide();
  }
}
const owned = ownedWindows<BrowserWindow>({ here: (am) => atNow.get(am), away: (k, w) => away.get(k) === w, after: PARK_AFTER, tell: () => tellOwned() });
const addrProj = (a: string) => (isExtra(a) ? projOf(a) : (atNow.get(amOf(a)) ?? projOf(a)));
function projFrom(w: BrowserWindow | null): string {
  const key = owned.keyOf(w), a = w && wins.get(w);
  if (key) return projIn(key);
  if (a) return addrProj(a);
  const m = someMain();
  return m ? addrProj(wins.get(m)!) : '1||';
}
function newOwned(kind: string, proj: string, page: string, o: BrowserWindowConstructorOptions, still = false) {
  const w = new BrowserWindow({
    maximizable: false,
    frame: false,
    backgroundColor: ground(),
    show: false,
    icon: ICON,
    ...o,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, ...o.webPreferences },
  });
  owned.add(w, ownKey(kind, proj));
  w.removeMenu();
  w.once('ready-to-show', () => owned.ready(w, still));
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.loadURL(BASE + ownAddr(page, proj));
  return w;
}
const ownOut = (proj: string) => owned.kinds(proj).filter((k) => QUICK.includes(k));
function tellOwned() {
  for (const [w, a] of wins) {
    if (w.isDestroyed()) continue;
    const proj = addrProj(a);
    w.webContents.send('quick-pop', ownOut(proj));
    w.webContents.send('forget-pop', !!owned.at('forget', proj));
    if (!isExtra(a)) w.webContents.send('hitch-pop', !!owned.at('hitch', proj));
  }
}
function keepParked(addr: string) {
  const k = projOf(addr);
  state.parked = { ...state.parked, [k]: [...new Set([...(state.parked?.[k] || []), addr])] };
  save();
}
function remember() {
  state.open = [...wins].filter(([w]) => !spares.has(w) && !hiddenAway.has(w)).map(([, a]) => a);
  for (const [w, addr] of wins) if (!w.isDestroyed() && !spares.has(w)) state.places[placeOf(addr)] = { ...w.getNormalBounds(), max: w.isMaximized() };
  for (const [w, addr] of wins) if (!w.isDestroyed() && !isExtra(addr) && !amLeaving.has(amOf(addr))) keepAm(amOf(addr), addr);
  save();
}
function keepAm(n: number, addr: string) {
  const extras = [...wins].filter(([w, a]) => !w.isDestroyed() && !spares.has(w) && !hiddenAway.has(w) && isExtra(a) && !isPop(a) && amOf(a) === n).map(([, a]) => a);
  state.ams = { ...state.ams, [n]: { addr, extras } };
  state.amNext = Math.max(state.amNext || 2, n + 1);
}
const amLeaving = new Set<number>();
const mainOf = (n: number) => [...wins].find(([w, a]) => !w.isDestroyed() && !isExtra(a) && amOf(a) === n)?.[0] || null;

const fresh = (from: BrowserWindow) => {
  const b = from.getBounds(), a = screen.getDisplayMatching(b).workArea, width = Math.min(a.width, Math.max(320, Math.round(a.width / 2))), height = Math.min(a.height, Math.max(200, Math.round(a.height / 2)));
  return {
    x: Math.max(a.x, Math.min(Math.round(b.x + (b.width - width) / 2), a.x + a.width - width)),
    y: Math.max(a.y, Math.min(Math.round(b.y + (b.height - height) / 2), a.y + a.height - height)),
    width,
    height,
  };
};
function openWindow(addr = '/app', url = BASE + addr, at: Rectangle | null = null, from: BrowserWindow | null = null) {
  const place = state.places[placeOf(addr)] || state.places[placeOf(addr, true)], pop = isPop(addr), here = at && onScreen(at) ? at : null;
  let kept = place && place.width && onScreen(place) ? { x: place.x, y: place.y, width: place.width, height: place.height } : null;
  const spare = pop && new URL(addr, BASE).searchParams.has('spare');
  if (pop && !here && from && !from.isDestroyed()) kept = fresh(from);
  const bounds = (pop ? here || kept : kept || here) || (pop ? { width: 720, height: 520 } : { width: 1400, height: 900 });
  const w = new BrowserWindow({
    ...bounds,
    frame: false,
    backgroundColor: ground(),
    ...(pop ? { maximizable: false, minWidth: 320, minHeight: 200 } : { minWidth: 640, minHeight: 420 }),
    show: false,
    title: 'Amethyst',
    icon: ICON,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: true, backgroundThrottling: !spare },
  });
  w.removeMenu();
  wins.set(w, addr);
  if (spare) spares.add(w);
  if (!isExtra(addr)) w.once('show', () => setTimeout(ensureHint, 3000));
  w.once('ready-to-show', () => {
    if (spare) return;
    if (hiddenAway.has(w)) return;
    const max = place?.max && !pop;
    if (quiet) return void (hidden.push(w), max && w.once('show', () => w.maximize()));
    if (max) w.maximize();
    w.show();
  });
  const wc = w.webContents;
  wc.setWindowOpenHandler(({ url, features }) => {
    if (ours(url) && new URL(url).pathname === '/app') openWindow(addrOf(url), url, featureBounds(features), w);
    else if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (ours(url) && new URL(url).pathname === '/app') return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  wc.on('will-prevent-unload', (e) => {
    if (holds.delete(w)) return;
    shuts.delete(w);
    reveal(w);
    if (!w.isVisible()) w.show();
    const leave = dialog.showMessageBoxSync(w, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 1, cancelId: 1, message: 'Some changes are not saved yet.', detail: 'Leave anyway? They are lost.' });
    if (leave === 0) e.preventDefault();
    else closingAll = installing = leaving = lastGoing = false;
  });
  const moved = (url: string) => {
    if (!ours(url)) return;
    const was = wins.get(w)!, addr = addrOf(url);
    wins.set(w, addr);
    if (inEvery(was) !== inEvery(addr) || projOf(was) !== projOf(addr)) placeExtra(w, addr);
    remember();
  };
  const forgetAsk = () => closeOk.get(w) !== true && (clearTimeout(closeOk.get(w) as NodeJS.Timeout), closeOk.delete(w));
  wc.on('did-navigate', (e, url) => (forgetAsk(), shuts.delete(w), moved(url)));
  wc.on('render-process-gone', forgetAsk);
  wc.on('did-navigate-in-page', (e, url) => moved(url));
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5') wc.reload();
    else if (input.key === 'F12' && !app.isPackaged) wc.toggleDevTools();
    else return;
    e.preventDefault();
  });
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) w.on(ev as 'resized', remember);
  w.on('resized', () => tellSize(w));
  w.on('focus', () => !isExtra(wins.get(w)!) && (lastMain = w));
  w.on('close', (e) => {
    shuts.add(w);
    if (closingAll) return;
    const a = wins.get(w)!;
    if (isExtra(a) && !isPop(a) && closeOk.get(w) !== true) {
      shuts.delete(w);
      e.preventDefault();
      if (closeOk.has(w)) return;
      closeOk.set(w, setTimeout(() => (closeOk.set(w, true), w.close()), 3000));
      return w.webContents.send('ask-close');
    }
    remember();
    const n = amOf(a), others = [...wins].filter(([x, b]) => x !== w && !isExtra(b));
    if (!isExtra(a) && others.length && !others.some(([, b]) => amOf(b) === n)) {
      amLeaving.add(n);
      w.once('closed', () => amLeaving.delete(n));
      closeLeft(w, a, 'close');
    }
    if (isExtra(wins.get(w)!) || [...wins].some(([x, a]) => x !== w && !isExtra(a))) return;
    if (trayPrefs().on) return void (shuts.delete(w), e.preventDefault(), toTray());
    lastGoing = w;
  });
  w.on('session-end', () => {
    closingAll = true;
    session.defaultSession.flushStorageData();
  });
  w.on('closed', () => {
    const gone = wins.get(w)!, parked = hiddenAway.has(w);
    if (parked) (clearTimeout(hiddenAway.get(w)), hiddenAway.delete(w), keepParked(gone));
    if (!parked && !closingAll && isExtra(gone) && !isPop(gone) && !amLeaving.has(amOf(gone))) (delete state.places[placeOf(gone)], delete state.places[placeOf(gone, true)]);
    wins.delete(w);
    if (!isExtra(gone)) closeLeft(w, gone, 'closed');
    spares.delete(w);
    closeOk.delete(w);
    shuts.delete(w);
    holds.delete(w);
    if (w === lastGoing) {
      lastGoing = null;
      closingAll = true;
      for (const x of wins.keys()) if (!x.isDestroyed()) x.close();
      closeToasts();
    }
    if (wins.size && !closingAll) remember();
    if (!anyMain()) owned.leave(null);
    else if (!isExtra(gone) && !mainOf(amOf(gone))) owned.leave(amOf(gone));
    if (!anyMain()) dropHint();
  });
  if (!isExtra(addr)) {
    w.on('minimize', () => downWith(w));
    w.on('restore', () => upWith(w));
    w.once('closed', () => anyMain() && upWith(w));
  }
  serverUp.then(() => void (w.isDestroyed() || w.loadURL(url)), () => {});
  return w;
}
let closingAll = false;
function closeLeft(w: BrowserWindow, addr: string, at: string) {
  const rest = [...wins].filter(([x]) => x !== w && !x.isDestroyed()), left = leftBehind(rest.map(([, a]) => a), addr).map((i) => rest[i]);
  hitchLog(addr, `${at}: Amethyst ${amOf(addr)} main window, closingAll ${closingAll}, ${left.length ? `closing its floating windows: ${left.map(([x, a]) => kindOf(x) || a).join(', ')}` : 'no floating windows of its own left'}`);
  for (const [x] of left) if (!shuts.has(x)) (closeOk.set(x, true), x.close());
}
let lastGoing: BrowserWindow | false | null = null;
const closeOk = new Map<BrowserWindow, NodeJS.Timeout | true | 'asking'>();
ipcMain.on('close-window', (e, answer) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !closeOk.has(w) || closeOk.get(w) === true) return;
  clearTimeout(closeOk.get(w) as NodeJS.Timeout);
  if (answer === 'asking') return void closeOk.set(w, 'asking');
  if (answer !== true) return void closeOk.delete(w);
  closeOk.set(w, true);
  w.close();
});
const shuts = new Set<BrowserWindow>(), holds = new Set<BrowserWindow>();
ipcMain.on('hold-close', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const hold = !!(ours(e.senderFrame?.url || '') && w && shuts.has(w));
  if (hold) holds.add(w!);
  e.returnValue = hold;
});
ipcMain.handle('close-held', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !shuts.has(w)) return false;
  w.close();
  return true;
});
ipcMain.handle('claim-spare', (e, of) => {
  const from = BrowserWindow.fromWebContents(e.sender), a = from && wins.get(from);
  const w = a && [...spares].find((x) => !x.isDestroyed() && amOf(wins.get(x)!) === amOf(a));
  if (!ours(e.senderFrame?.url || '') || !from || !w) return false;
  spares.delete(w);
  w.webContents.setBackgroundThrottling(true);
  w.setBounds(fresh(from));
  w.show();
  remember();
  return true;
});
ipcMain.handle('at-project', (e, wid, pid) => {
  const from = BrowserWindow.fromWebContents(e.sender), a = from && wins.get(from);
  if (!ours(e.senderFrame?.url || '') || !a || isExtra(a)) return;
  const n = amOf(a), here = `${n}|${wid ?? ''}|${pid ?? ''}`;
  atNow.set(n, here);
  for (const [w, b] of wins) if (amOf(b) === n) placeExtra(w, b);
  for (const k of owned.arrive(here)) reopenOwned(k, here, from);
  tellAway();
  const back = state.parked?.[here] || [];
  if (back.length) {
    state.parked = { ...state.parked };
    delete state.parked[here];
    back.forEach((addr: string) => openWindow(addr));
  }
  remember();
});
ipcMain.handle('window-alive', (e, of, n) => {
  const from = BrowserWindow.fromWebContents(e.sender), at = from && wins.get(from);
  if (!ours(e.senderFrame?.url || '') || !at) return false;
  return [...wins].some(([w, a]) => !w.isDestroyed() && w !== from && projOf(a) === projOf(at) && Number(new URL(a, BASE).searchParams.get('win')) === Number(n));
});
function featureBounds(features = '') {
  const f = Object.fromEntries(String(features).split(',').map((kv) => kv.trim().split('=')));
  const b = { x: +f.left, y: +f.top, width: +f.width, height: +f.height };
  return Object.values(b).every(Number.isFinite) && b.width > 0 ? b : null;
}

const pending = filesIn(process.argv, process.cwd());
function giveFiles(paths: string[]) {
  pending.push(...paths);
  const w = lastMain && !lastMain.isDestroyed() ? lastMain : [...wins].find(([, a]) => !isExtra(a))?.[0];
  if (!w) return;
  if (w.isMinimized()) w.restore();
  w.focus();
  w.webContents.send('files');
}

ipcMain.handle('pick-folder', async (e, { title, defaultPath } = {}) => {
  if (!ours(e.senderFrame?.url || '')) return null;
  let at = defaultPath || '';
  while (at && !fs.existsSync(at)) at = path.dirname(at) === at ? '' : path.dirname(at);
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, {
    title: title || 'Choose a folder',
    defaultPath: at || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0] || null;
});

ipcMain.handle('pick-files', async (e) => {
  if (!ours(e.senderFrame?.url || '')) return [];
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender)!, { title: 'Open a file', properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});

const EDITS: Record<string, (wc: WebContents) => void> = { cut: (wc) => wc.cut(), copy: (wc) => wc.copy(), paste: (wc) => wc.paste(), selectAll: (wc) => wc.selectAll() };
ipcMain.on('edit', (e, what) => {
  if (ours(e.senderFrame?.url || '') && Object.hasOwn(EDITS, what)) EDITS[what](e.sender);
});
ipcMain.handle('clipboard-files', (e) => {
  if (!ours(e.senderFrame?.url || '') || process.platform !== 'win32') return [];
  return new Promise((done) => {
    execFile('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Format FileDropList | % FullName'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      done(err ? [] : String(out).split(/\r?\n/).filter((x) => x.trim()));
    });
  });
});

ipcMain.handle('capture-page', async (e, id) => {
  const wc = ours(e.senderFrame?.url || '') && webContents.fromId(+id);
  if (!wc || wc.getType() !== 'webview' || wc.hostWebContents?.id !== e.sender.id) return null;
  return (await wc.capturePage()).toPNG();
});

ipcMain.handle('take-files', (e) => (ours(e.senderFrame?.url || '') ? pending.splice(0) : []));

ipcMain.handle('default-apps', (e) => {
  if (ours(e.senderFrame?.url || '')) return shell.openExternal('ms-settings:defaultapps?registeredAppUser=Amethyst');
});

ipcMain.handle('new-amethyst', (e) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const n = Math.max(state.amNext || 2, ...[...wins.values()].map((a) => amOf(a) + 1));
  state.amNext = n + 1;
  openWindow(`/app?w=&am=${n}`);
});
ipcMain.handle('amethysts', (e) => {
  if (!ours(e.senderFrame?.url || '')) return [];
  const ns = [...new Set([1, ...Object.keys(state.ams || {}).map(Number), ...[...wins.values()].filter((a) => !isExtra(a)).map(amOf)])].sort((x, y) => x - y);
  return ns.map((n) => {
    const w = mainOf(n), q = new URL(w ? wins.get(w)! : state.ams?.[n]?.addr || '/app', BASE).searchParams;
    return { n, open: !!w, w: q.get('w') || '', p: q.get('p') || '' };
  });
});
ipcMain.handle('open-amethyst', (e, n) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const w = mainOf(n), kept = state.ams?.[n];
  if (w) return void (w.isMinimized() && w.restore(), w.show(), w.focus());
  if (n > 1 && !kept) return;
  const wc = openWindow(kept?.addr || '/app').webContents;
  wc.once('did-stop-loading', () => (kept?.extras || []).forEach((a: string) => openWindow(a)));
});
ipcMain.handle('forget-amethyst', (e, n) => {
  if (!ours(e.senderFrame?.url || '') || !(n > 1) || mainOf(n)) return false;
  const { [n]: gone, ...rest } = state.ams || {};
  state.ams = rest;
  save();
  return true;
});

const anyMain = () => [...wins.values()].some((a) => !isExtra(a));
function openForget(at: Rectangle | null, proj: string, still = false) {
  if (at) {
    const a = screen.getDisplayMatching(at).workArea;
    at = { ...at, x: Math.max(a.x, Math.min(at.x, a.x + a.width - at.width)), y: Math.max(a.y, Math.min(at.y, a.y + a.height - at.height)) };
  }
  const open = owned.at('forget', proj);
  if (open) {
    if (at) open.setBounds(at);
    reveal(open);
    return open.focus();
  }
  const kept = state.forget;
  const b = at ? at : kept?.width && onScreen(kept) ? { x: kept.x, y: kept.y, width: kept.width, height: kept.height } : { width: 240, height: 160 };
  const w = newOwned('forget', proj, '/forget.html', { ...b, minWidth: 180, minHeight: 80, skipTaskbar: true, title: "don't forget", webPreferences: { backgroundThrottling: false } }, still);
  const keep = () => {
    state.forget = w.getBounds();
    save();
  };
  w.on('resized', keep);
  w.on('moved', keep);
  keep();
  tellOwned();
}
ipcMain.handle('forget-window', (e, at) => {
  if (!ours(e.senderFrame?.url || '')) return false;
  const proj = projFrom(BrowserWindow.fromWebContents(e.sender)), open = owned.at('forget', proj);
  if (at && typeof at === 'object' && [at.x, at.y, at.width, at.height].every(Number.isFinite))
    openForget(at.near && (open || (state.forget?.width && onScreen(state.forget))) ? null : { x: at.x, y: at.y, width: at.width, height: at.height }, proj);
  else if (at === null && open) open.close();
  return !!owned.at('forget', proj) && at !== null;
});

const TOAST = { w: 300, h: 76, gap: 8, max: 4, ms: 10000 };
const toasts: BrowserWindow[] = [];
type Card = { h: number; w: number; asker: WebContents | null; timer?: NodeJS.Timeout; disp?: number };
const cards = new Map<BrowserWindow, Card>();
let noticeMain = false;
const dispFor = (c: Card | undefined) => (c?.disp == null || noticeMain ? null : screen.getAllDisplays().find((d) => d.id === c.disp)) || screen.getPrimaryDisplay();
function placeToasts() {
  const tops = new Map<number, number>();
  for (const w of toasts.slice().reverse()) {
    const c = cards.get(w)!, d = dispFor(c), a = d.workArea;
    const y = (tops.get(d.id) ?? a.y + a.height - 12) - c.h;
    w.setBounds({ x: a.x + a.width - c.w - 12, y, width: c.w, height: c.h });
    tops.set(d.id, y - TOAST.gap);
  }
}
function closeToasts() {
  toasts.slice().forEach((w) => !w.isDestroyed() && w.close());
}
ipcMain.handle('forget-toast', (e, o) => {
  if (!ours(e.senderFrame?.url || '') || !o || typeof o.text !== 'string') return;
  const q = new URLSearchParams({ t: o.text.slice(0, 200), v: String(Math.min(3, Math.max(1, Math.floor(+o.level) || 1))) });
  if (/^[a-z0-9]{1,24}$/.test(o.id)) q.set('id', o.id), q.set('a', String(o.again || '').slice(0, 12));
  const usage = o.from === 'usage';
  if (usage) q.set('k', 'usage');
  return !!toast(e.sender, TOAST.h, TOAST.ms, q.toString(), usage ? 'usage' : "don't forget");
});
ipcMain.handle('forget-list', (e, list) => {
  if (!ours(e.senderFrame?.url || '') || !list || typeof list !== 'object') return;
  const id = (x: string) => (/^[a-z0-9]{1,24}$/.test(x) ? x : '');
  const items = (Array.isArray(list.items) ? list.items : []).slice(0, 8).map((i: any) => ({ id: id(i?.id), text: String(i?.text ?? '').slice(0, 200), time: String(i?.time ?? '').slice(0, 8) }));
  const more = Math.max(0, Math.floor(+list.more) || 0);
  const h = items.length ? 66 + items.length * 24 + (more ? 18 : 0) : 96;
  toast(e.sender, h, 20000, 'l=' + encodeURIComponent(JSON.stringify({ items, more })));
});
type ToastOpts = { page?: string; width?: number; focusable?: boolean; sized?: boolean; disp?: number; force?: boolean };
function toast(asker: WebContents | null, h: number, ms: number, query: string, title = "don't forget", o: ToastOpts = {}) {
  if (!o.force && BrowserWindow.getAllWindows().some((x) => x.isFocused() && !toasts.includes(x) && kindIn(owned.keyOf(x)) !== 'forget')) return null;
  if (toasts.length >= TOAST.max) toasts[0].close();
  const width = o.width || TOAST.w;
  const w = new BrowserWindow({
    width,
    height: h,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: !!o.focusable,
    show: false,
    title,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.removeMenu();
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (ev) => ev.preventDefault());
  toasts.push(w);
  const timer = ms > 0 ? setTimeout(() => !w.isDestroyed() && w.close(), ms) : undefined;
  cards.set(w, { h, w: width, asker, timer, disp: o.disp });
  if (o.sized) setTimeout(() => !w.isDestroyed() && !w.isVisible() && w.showInactive(), 2500);
  else w.once('ready-to-show', () => w.showInactive());
  w.on('closed', () => {
    clearTimeout(timer);
    toasts.splice(toasts.indexOf(w), 1);
    cards.delete(w);
    placeToasts();
  });
  placeToasts();
  w.loadURL(BASE + (o.page || '/forget-toast.html') + '?' + query);
  return w;
}
ipcMain.on('forget-toast-act', (e, what) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '')) return;
  const key = owned.keyOf(w);
  if (kindIn(key) === 'forget' && what === 'settings') {
    const m = someMain(amIn(key));
    if (!m) return;
    if (inTray()) fromTray();
    m.webContents.send('forget-act', 'settings');
    if (m.isMinimized()) m.restore();
    m.show();
    return m.focus();
  }
  if (!toasts.includes(w!)) return;
  if (what === 'hold') return clearTimeout(cards.get(w!)!.timer);
  const asker = cards.get(w!)!.asker, main = !!asker && !asker.isDestroyed() && BrowserWindow.fromWebContents(asker);
  w!.close();
  const answer = /^(again|ok|done):[a-z0-9]{1,24}$/.test(what) || /^confirm:[a-z0-9]{1,24}(,[a-z0-9]{1,24}){0,7}$/.test(what);
  if ((['add', 'settings'].includes(what) || answer) && main) main.webContents.send('forget-act', what);
  if (!['add', 'settings'].includes(what)) return;
  if (inTray()) fromTray();
  const t = main || (lastMain && !lastMain.isDestroyed() ? lastMain : [...wins].find(([x, a]) => !isExtra(a) && !x.isDestroyed())?.[0]);
  if (!t) return;
  if (t.isMinimized()) t.restore();
  t.show();
  t.focus();
});

type Ring = { id: string; code: string; title: string; line: string; text: string; why: 'done' | 'error' | 'asks' | 'cold'; am: number; ask: { q: string; options: string[] } | null };
const RING_ID = /^[a-z0-9]{1,24}$/;
const cut = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
function ringOf(r: any): Ring | null {
  if (!r || !RING_ID.test(String(r.id))) return null;
  const why = r.why === 'asks' || r.why === 'error' || r.why === 'cold' ? r.why : 'done';
  const ask = r.ask && typeof r.ask === 'object' ? { q: cut(r.ask.q, 300), options: (Array.isArray(r.ask.options) ? r.ask.options : []).slice(0, 8).map((o: unknown) => cut(o, 40)).filter(Boolean) } : null;
  return { id: String(r.id), code: cut(r.code, 12), title: cut(r.title, 80), line: cut(r.line, 300), text: String(r.text ?? '').slice(0, 1200), why, am: Math.max(1, Math.floor(+r.am) || 1), ask };
}
const RING_WORD = { done: 'is ready', error: 'failed', asks: 'asks you', cold: 'runs out of cache' };
let cacheNotice = true;
const rings = new Map<string, Notification>();
const ringWins = new Map<string, Set<BrowserWindow>>();
const ringAm = new Map<BrowserWindow, number>();
const NOTICE = { w: 380, h: 120 };
const QUIET_PS = `$t=(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings' -Name NOC_GLOBAL_SETTING_TOASTS_ENABLED -ErrorAction SilentlyContinue).NOC_GLOBAL_SETTING_TOASTS_ENABLED; Add-Type -Namespace Am -Name Q -MemberDefinition '[DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int s);'; $n=0; [void][Am.Q]::SHQueryUserNotificationState([ref]$n); "t=$t n=$n"`;
let hush: { at: number; on: Promise<boolean> } | null = null;
function hushed(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  if (hush && Date.now() - hush.at < 60e3) return hush.on;
  hush = { at: Date.now(), on: hushNow() };
  return hush.on;
}
function hushNow(): Promise<boolean> {
  return new Promise((done) =>
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', QUIET_PS], { timeout: 6000, windowsHide: true }, (err, out) => {
      const t = /t=(\d*)/.exec(String(out))?.[1], n = Number(/n=(\d+)/.exec(String(out))?.[1]);
      done(!err && (t === '0' || [1, 2, 3, 4, 6, 7].includes(n)));
    }),
  );
}
function unring(id: string, tell = true) {
  rings.get(id)?.close();
  rings.delete(id);
  const ws = ringWins.get(id);
  ringWins.delete(id);
  for (const w of ws || []) if (!w.isDestroyed()) w.close();
  if (tell) for (const w of wins.keys()) if (!w.isDestroyed()) w.webContents.send('report-unring', id);
}
const shownOf = (n: number) => {
  if (inTray()) return null;
  const all = [...wins].filter(([w, a]) => !w.isDestroyed() && !spares.has(w) && !isPop(a) && amOf(a) === n && w.isVisible() && !w.isMinimized()).map(([w]) => w);
  return all.find((w) => w.isFocused()) || all.find((w) => w === mainOf(n)) || all[0] || null;
};
function lookOf(n: number): NoticeAm & { w: BrowserWindow | null } {
  const shown = shownOf(n), main = mainOf(n), w = shown || main;
  const kept = n > 1 && !w ? state.places[placeOf(state.ams?.[n]?.addr || '')] : null;
  const box = w ? w.getNormalBounds() : kept && Number.isFinite(kept.x) ? { x: kept.x, y: kept.y, width: kept.width, height: kept.height } : null;
  return { n, shown: !!shown, open: !!main, disp: box ? screen.getDisplayMatching(box).id : null, w };
}
function ringReport(raw: unknown) {
  const r = ringOf(raw);
  if (!r || (r.why === 'cold' && !cacheNotice)) return;
  unring(r.id, false);
  const ams = [lookOf(r.am)];
  const send = (q: boolean) => {
    const plan = noticePlan(ams, { hushed: q, main: noticeMain, primary: screen.getPrimaryDisplay().id });
    for (const n of plan.inApp) inApp({ ...r, am: n }, ams.find((x) => x.n === n)!.w);
    let native = plan.native;
    for (const t of plan.toasts) if (!ringToast(r, t.n, t.disp)) native = true;
    if (native) ringNative(r);
  };
  if (ams.every((x) => x.shown)) return send(false);
  hushed().then(send);
}
function ringToast(r: Ring, n: number, disp: number) {
  const q = new URLSearchParams({ id: r.id, w: r.why, l: r.line, c: r.code, t: r.title, am: String(n) });
  const w = toast(null, r.why === 'asks' || r.why === 'cold' || r.text ? NOTICE.h : 80, 0, q.toString(), `${r.code} ${RING_WORD[r.why]} · Amethyst`, { page: '/notice.html', width: NOTICE.w, focusable: true, sized: true, disp, force: true });
  if (!w) return false;
  const set = ringWins.get(r.id) || ringWins.set(r.id, new Set()).get(r.id)!;
  set.add(w);
  ringAm.set(w, n);
  w.on('closed', () => {
    ringWins.get(r.id)?.delete(w);
    if (!ringWins.get(r.id)?.size) ringWins.delete(r.id);
    ringAm.delete(w);
  });
  return true;
}
const ringOfWin = (w: BrowserWindow | null) => [...ringWins].find(([, x]) => !!w && x.has(w))?.[0] || '';
ipcMain.on('cache-notice', (e, v) => {
  if (ours(e.senderFrame?.url || '')) cacheNotice = v !== false;
});
ipcMain.on('notice-screen', (e, v) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const main = v === 'main';
  if (main === noticeMain) return;
  noticeMain = main;
  if (main) for (const ws of ringWins.values()) [...ws].slice(1).forEach((w) => !w.isDestroyed() && w.close());
  placeToasts();
});
ipcMain.on('ring-act', (e, what, n) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !ours(e.senderFrame?.url || '') || !toasts.includes(w)) return;
  const c = cards.get(w)!;
  if (what === 'size') {
    const a = dispFor(c).workArea, h = Math.max(40, Math.min(Math.round(+n) || c.h, a.height - 24));
    if (h !== c.h || !w.isVisible()) {
      c.h = h;
      placeToasts();
    }
    if (!w.isVisible()) w.showInactive();
    return;
  }
  const id = ringOfWin(w);
  if (what === 'go' && id) goToChat(id, ringAm.get(w) || Math.max(1, Math.floor(+n) || 1));
  if (what === 'go' || what === 'close') w.close();
});
ipcMain.on('report-seen', (e, id) => {
  if (!ours(e.senderFrame?.url || '') || !RING_ID.test(String(id))) return;
  unring(String(id));
});
function ringNative(r: Ring) {
  if (!Notification.isSupported()) return inApp(r, null);
  rings.get(r.id)?.close();
  const n = new Notification({
    id: 'amethyst-' + r.id,
    title: `${r.code} ${RING_WORD[r.why]}${r.title ? ' · ' + r.title : ''}`,
    body: (r.why === 'asks' ? r.ask?.q || r.line : r.line).replace(/^\s*`{3}.*$/, '') || (r.why === 'error' ? 'something went wrong' : 'finished'),
    icon: ICON,
    actions: [{ type: 'button' as const, text: 'go to' }],
  });
  rings.set(r.id, n);
  const done = () => rings.get(r.id) === n && rings.delete(r.id);
  n.on('click', () => (done(), goToChat(r.id, r.am)));
  n.on('action', () => (done(), goToChat(r.id, r.am)));
  n.on('close', (d: any) => d?.reason !== 'timedOut' && done());
  n.on('failed', () => (done(), inApp(r, null)));
  n.show();
}
const someMain = (am = 1) => mainOf(am) || (lastMain && !lastMain.isDestroyed() ? lastMain : [...wins].find(([x, a]) => !isExtra(a) && !x.isDestroyed())?.[0]) || null;
function inApp(r: Ring, w: BrowserWindow | null) {
  const t = w || someMain(r.am);
  if (!t) return;
  t.webContents.send('report-ring', r);
  if (!t.isFocused()) t.flashFrame(true);
}
function goToChat(id: string, am: number) {
  if (inTray()) fromTray();
  let w = mainOf(am);
  if (!w && am > 1 && state.ams?.[am]?.addr) w = openWindow(state.ams[am].addr);
  w ||= someMain();
  if (!w) w = openWindow('/app');
  const t = w;
  if (t.isMinimized()) t.restore();
  t.show();
  t.focus();
  if (t.webContents.isLoading()) t.webContents.once('did-stop-loading', () => !t.isDestroyed() && t.webContents.send('report-go', id));
  else t.webContents.send('report-go', id);
}
ipcMain.on('report-open', (e, id, am) => {
  if (!ours(e.senderFrame?.url || '') || !RING_ID.test(String(id))) return;
  goToChat(String(id), Math.max(1, Math.floor(+am) || 1));
});

const QUICK = ['term', 'pwsh', 'ue', 'debug'];
const QT_PAGE: Record<string, string> = { ue: '/ue.html', debug: '/debug.html' }, QT_TITLE: Record<string, string> = { term: 'terminal', pwsh: 'PowerShell', ue: 'build', debug: 'debugger' };
const qtKept = (k: string): Rectangle | null => {
  const b = state.qt?.[k];
  return b?.width && onScreen(b) ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
};
function openQuick(kind: string, at: Rectangle | null, from: BrowserWindow | null, proj: string, still = false) {
  if (at) {
    const a = screen.getDisplayMatching(at).workArea;
    at = { ...at, x: Math.max(a.x, Math.min(at.x, a.x + a.width - at.width)), y: Math.max(a.y, Math.min(at.y, a.y + a.height - at.height)) };
  }
  const open = owned.at(kind, proj);
  if (open) {
    const was = owned.unhide(open);
    if (at) open.setBounds(at);
    else if (was && from) open.setBounds(qtKept(kind) || fresh(from));
    if (away.get(ownKey(kind, proj)) === open) reveal(open);
    else if (!open.isVisible()) open.show();
    if (was) tellOwned();
    return open.focus();
  }
  const b = at || qtKept(kind) || (from ? fresh(from) : { width: 720, height: 420 });
  const w = newOwned(kind, proj, QT_PAGE[kind] || `/qterm.html?kind=${kind}`, { ...b, minWidth: 320, minHeight: 160, title: `${QT_TITLE[kind]} · Amethyst` }, still);
  const keep = () => {
    state.qt = { ...state.qt, [kind]: w.getBounds() };
    save();
  };
  w.on('resized', () => (keep(), tellSize(w)));
  w.on('moved', keep);
  tellOwned();
}
ipcMain.handle('quick-window', (e, kind, at) => {
  if (!ours(e.senderFrame?.url || '') || !QUICK.includes(kind)) return [];
  const from = BrowserWindow.fromWebContents(e.sender), proj = projFrom(from), open = owned.at(kind, proj);
  if (at && typeof at === 'object' && [at.x, at.y, at.width, at.height].every(Number.isFinite)) openQuick(kind, at, from, proj);
  else if (at === 'show') openQuick(kind, null, from, proj);
  else if (at === null && open && owned.hide(open)) tellOwned();
  return ownOut(proj).filter((k) => !(k === kind && at === null));
});

function openHitch(from: BrowserWindow | null, proj: string, still = false) {
  const open = owned.at('hitch', proj);
  if (open) {
    reveal(open);
    return open.focus();
  }
  const kept = state.hitch;
  const here = kept?.width && onScreen(kept) && (!from || screen.getDisplayMatching(kept).id === screen.getDisplayMatching(from.getBounds()).id);
  const b = here ? { x: kept.x, y: kept.y, width: kept.width, height: kept.height } : from ? fresh(from) : { width: 720, height: 420 };
  const w = newOwned('hitch', proj, '/hitch.html', { ...b, minWidth: 320, minHeight: 160, skipTaskbar: true, title: 'freeze log · Amethyst' }, still);
  const keep = () => {
    state.hitch = w.getBounds();
    save();
  };
  w.on('resized', () => (keep(), tellSize(w)));
  w.on('moved', keep);
  tellOwned();
}
ipcMain.handle('hitch-window', (e, on) => {
  if (!ours(e.senderFrame?.url || '')) return false;
  const from = BrowserWindow.fromWebContents(e.sender), proj = projFrom(from);
  if (on === true) openHitch(from, proj);
  else if (on === null) owned.at('hitch', proj)?.close();
  return !!owned.at('hitch', proj) && on !== null;
});

function openGuide(proj: string, still = false) {
  const open = owned.at('fgguide', proj);
  if (open) {
    reveal(open);
    return open.focus();
  }
  const m = someMain(amIn(ownKey('', proj)));
  const width = 340, height = 360, b = m?.getBounds(), a = b && screen.getDisplayMatching(b).workArea;
  const at = b ? { x: Math.max(a!.x, Math.round(b.x + (b.width - width) / 2)), y: Math.max(a!.y, Math.round(b.y + (b.height - height) / 2)) } : {};
  newOwned('fgguide', proj, '/forget-guide.html', { ...at, width, height, minWidth: 240, minHeight: 160, skipTaskbar: true, title: "don't forget · how to write it" }, still);
}
ipcMain.handle('forget-guide', (e, on) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const proj = projFrom(BrowserWindow.fromWebContents(e.sender));
  if (on === true) openGuide(proj);
  else if (on === null) owned.at('fgguide', proj)?.close();
});
function reopenOwned(kind: string, proj: string, from: BrowserWindow | null) {
  if (kind === 'forget') openForget(null, proj, true);
  else if (kind === 'hitch') openHitch(from, proj, true);
  else if (kind === 'fgguide') openGuide(proj, true);
  else openQuick(kind, null, from, proj, true);
}

const floaters = () => [...[...wins].filter(([, a]) => isPop(a)).map(([w]) => w), ...owned.floating()].filter((w) => !w.isDestroyed());
const kindOf = (w: BrowserWindow | null | undefined) => {
  const k = kindIn(owned.keyOf(w));
  if (k && k !== SITE) return k;
  const a = wins.get(w!);
  return a && isPop(a) ? placeOf(a).slice(4) : '';
};

const hitchLog = hitch({ app, BrowserWindow, clipboard, ipcMain, powerMonitor, screen, shell, dir: DATA, ours, version: app.getVersion(), nameOf: (w) => (w === hint ? 'snap frame' : kindOf(w) || wins.get(w) || ''), viewers: () => owned.winsOf('hitch'), server: () => server, target: () => (lastMain && !lastMain.isDestroyed() ? lastMain : [...wins].find(([x, a]) => !isExtra(a) && !x.isDestroyed())?.[0]) });

const down = new Map<BrowserWindow, BrowserWindow[]>();
function downWith(m: BrowserWindow) {
  const n = amOf(wins.get(m)!);
  const mine = floaters().filter((w) => w.isVisible() && (wins.has(w) ? amOf(wins.get(w)!) : amIn(owned.keyOf(w))) === n);
  mine.forEach((w) => w.hide());
  down.set(m, [...(down.get(m) || []), ...mine]);
}
function upWith(m: BrowserWindow) {
  const back = down.get(m) || [];
  down.delete(m);
  back.forEach((w) => !w.isDestroyed() && !w.isVisible() && !owned.gone(w) && !hiddenAway.has(w) && w.showInactive());
}

const away = new Map<string, BrowserWindow>();
const awayKey = (w: BrowserWindow | null | undefined) => {
  const k = kindOf(w), a = w && wins.get(w), o = owned.keyOf(w);
  if (k && o) return o;
  return k && a ? `${k}@${projOf(a)}` : k;
};
const awayFor = (a: string | undefined) => [...away.keys()].filter((k) => a && projIn(k) === addrProj(a)).map(kindIn);
function tellAway() {
  wins.forEach((a, w) => !w.isDestroyed() && !isExtra(a) && w.webContents.send('away', awayFor(a)));
  tellOwned();
}
function reveal(w: BrowserWindow | null | undefined) {
  const k = awayKey(w);
  if (!k || away.get(k) !== w) return;
  away.delete(k);
  w!.show();
  tellAway();
}
ipcMain.handle('window-away', (e) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const w = BrowserWindow.fromWebContents(e.sender), k = awayKey(w);
  if (!k || away.has(k)) return;
  away.set(k, w!);
  w!.once('closed', () => away.get(k) === w && (away.delete(k), tellAway()));
  w!.hide();
  tellAway();
});
const FRONT = "Add-Type -Name W -Namespace AmFront -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(IntPtr h, int c); [DllImport(\"user32.dll\")] public static extern bool IsIconic(IntPtr h);'";
ipcMain.handle('focus-pid', (e, pid) => {
  const n = Math.floor(Number(pid));
  if (!ours(e.senderFrame?.url || '') || !(n > 0) || process.platform !== 'win32') return false;
  const ps = `$p = Get-Process -Id ${n} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { ${FRONT}; if ([AmFront.W]::IsIconic($p.MainWindowHandle)) { [void][AmFront.W]::ShowWindowAsync($p.MainWindowHandle, 9) }; [void][AmFront.W]::SetForegroundWindow($p.MainWindowHandle) }`;
  return new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 10000 }, (err) => res(!err)));
});
ipcMain.handle('flash-frame', (e) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && !w.isDestroyed() && !w.isFocused()) w.flashFrame(true);
});
ipcMain.handle('window-back', (e, kind, focus) => {
  if (!ours(e.senderFrame?.url || '')) return;
  const from = BrowserWindow.fromWebContents(e.sender), w = kind ? away.get(ownKey(String(kind), projFrom(from))) : from;
  reveal(w);
  if (focus && w && !w.isDestroyed()) (w.isMinimized() && w.restore(), keepInView(w), w.show(), w.moveTop(), w.focus());
});
function keepInView(w: BrowserWindow) {
  if (w.isMaximized() || w.isFullScreen()) return;
  const box = intoView(w.getBounds(), screen.getAllDisplays().map((d) => d.workArea));
  if (box) (w.setBounds(box), hitchLog(kindOf(w), 'brought back on screen'));
}
ipcMain.handle('quick-of', (e) => {
  const from = BrowserWindow.fromWebContents(e.sender), at = from && wins.get(from);
  if (!ours(e.senderFrame?.url || '') || !at) return 0;
  const hit = [...wins].find(([w, a]) => w !== from && !w.isDestroyed() && !spares.has(w) && placeOf(a) === 'pop:quick' && projOf(a) === projOf(at));
  return hit ? Number(new URL(hit[1], BASE).searchParams.get('win')) || 0 : 0;
});
ipcMain.handle('solo-front', (e, kind) => {
  const from = BrowserWindow.fromWebContents(e.sender), at = from && wins.get(from);
  if (!ours(e.senderFrame?.url || '') || !at || !kind) return 0;
  const live = [...wins].filter(([w]) => !w.isDestroyed() && !spares.has(w));
  const addr = soloIn(live.map(([, a]) => a), String(kind), projOf(at));
  const w = addr && live.find(([, a]) => a === addr)![0];
  if (!w) return 0;
  reveal(w);
  if (w.isMinimized()) w.restore();
  keepInView(w);
  w.show();
  w.moveTop();
  w.focus();
  return Number(new URL(addr, BASE).searchParams.get('win')) || 0;
});
ipcMain.handle('away-list', (e) => (ours(e.senderFrame?.url || '') ? awayFor(wins.get(BrowserWindow.fromWebContents(e.sender)!)) : []));

function ground() {
  return /^#[0-9a-f]{6}$/i.test(state.ground || '') ? state.ground : '#000000';
}
ipcMain.on('ground', (e, color) => {
  if (!ours(e.senderFrame?.url || '') || !/^#[0-9a-f]{6}$/i.test(String(color)) || color === state.ground) return;
  state.ground = color;
  save();
  for (const w of BrowserWindow.getAllWindows()) if (w !== hint && !toasts.includes(w)) w.setBackgroundColor(color);
});

function sizeFor(w: BrowserWindow, k: number) {
  const b = w.getBounds();
  return sizeBox(screen.getDisplayMatching(b).workArea, b, k, w.getMinimumSize());
}
const sizeNow = (w: BrowserWindow) => {
  const b = w.getBounds();
  return [1, 2, 4].find((k) => { const s = sizeFor(w, k); return Math.abs(s.width - b.width) <= 2 && Math.abs(s.height - b.height) <= 2; }) || 0;
};
const ownSize = new WeakMap<BrowserWindow, Rectangle>();
const sizable = (w: BrowserWindow | null | undefined) => !!kindOf(w) || (!!w && isExtra(wins.get(w) || BASE));
const tellSize = (w: BrowserWindow) => {
  if (w.isDestroyed() || !sizable(w)) return;
  const k = sizeNow(w);
  if (!k) ownSize.set(w, w.getBounds());
  w.webContents.send('size', k);
};
ipcMain.handle('size-now', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return ours(e.senderFrame?.url || '') && w && sizable(w) ? sizeNow(w) : 0;
});
ipcMain.handle('window-size', (e, k) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !sizable(w) || ![1, 2, 4].includes(k)) return;
  w.setBounds(sizeFor(w, k));
  w.emit('resized');
});
const unzoomed = new WeakMap<BrowserWindow, Rectangle>();
ipcMain.handle('window-zoom', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !kindOf(w)) return;
  const back = unzoomed.get(w) || ownSize.get(w);
  unzoomed.delete(w);
  if (sizeNow(w) === 1) w.setBounds(back && onScreen(back) ? back : fresh(w));
  else (unzoomed.set(w, w.getBounds()), w.setBounds(sizeFor(w, 1)));
  w.emit('resized');
});
ipcMain.handle('window-os', (e, what) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !wins.has(w) || isPop(wins.get(w)!)) return false;
  if (what === 'ask') return true;
  if (what === 'min') w.minimize();
  else if (what === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
});

const VIOLET = '#b994ec';
let hint: BrowserWindow | null = null, hintColor = VIOLET, hintBox: Rectangle | null = null;
function ensureHint() {
  if ((hint && !hint.isDestroyed()) || !anyMain()) return;
  hint = new BrowserWindow({ width: 200, height: 200, frame: false, transparent: true, focusable: false, skipTaskbar: true, resizable: false, hasShadow: false, show: false, alwaysOnTop: true });
  hint.setIgnoreMouseEvents(true);
  hint.webContents.on('did-start-loading', () => (hintColor = VIOLET));
  hintColor = VIOLET;
  hintBox = null;
  hint.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;--c:${VIOLET};--b:${VIOLET}24"><div style="position:fixed;inset:0;box-sizing:border-box;border:2px solid var(--c);border-radius:8px;background:var(--b)"></div>`));
}
function dropHint() {
  if (hint && !hint.isDestroyed()) hint.destroy();
  hint = null;
}
function showHint(box: Rectangle | '' | null) {
  if (!hint || hint.isDestroyed()) return;
  if (box && hintBox && (['x', 'y', 'width', 'height'] as const).every((k) => box[k] === hintBox![k])) return;
  if (!box && !hintBox) return;
  hintBox = box || null;
  if (!box) return hint.hide();
  hint.setBounds(box);
  hint.showInactive();
}
function boxAt(g: any, p: Point) {
  const d = screen.getDisplayNearestPoint(p), { z: raw, shared } = zoneOf(p, d.bounds, g.all), now = performance.now();
  if (raw !== g.first) g.first = null;
  if (raw !== g.zone) (g.zone = raw, (g.since = now));
  const z = g.moved && raw !== g.first ? raw : '';
  g.waiting = !!z && shared && now - g.since < WAIT;
  return z && !g.waiting ? zoneBox(d.workArea, z, g.w.getMinimumSize()) : null;
}
function place(g: any, p: Point) {
  g.moved ||= Math.hypot(p.x - g.from.x, p.y - g.from.y) > 3;
  const t = performance.now();
  g.w.setBounds({ x: g.b.x + p.x - g.from.x, y: g.b.y + p.y - g.from.y, width: g.b.width, height: g.b.height });
  g.slow = Math.max(g.slow, performance.now() - t);
  g.done++;
  g.due = false;
}
function tick(g: any) {
  if ((!g.due && !g.waiting) || g.w.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  if (g.due) place(g, p);
  const box = boxAt(g, p);
  if (box) g.shown = true;
  showHint(box);
}
let drag: any = null;
function endDrag() {
  const g = drag;
  if (!g) return null;
  drag = null;
  clearInterval(g.timer);
  if (!g.w.isDestroyed()) (g.w.off('closed', g.stop), g.w.webContents.off('did-start-loading', g.stop));
  showHint(null);
  hitchLog(g.kind, `drag: ${Date.now() - g.t0} ms, ${g.got} moves received, ${g.done} applied, slowest setBounds ${g.slow.toFixed(1)} ms, snap frame ${g.shown ? 'shown' : 'not shown'}`);
  return g;
}
ipcMain.on('window-drag', (e, phase, color) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!ours(e.senderFrame?.url || '') || !w || !kindOf(w)) return;
  if (phase === 'start') {
    endDrag();
    ensureHint();
    color = /^#[0-9a-f]{6}$/i.test(color) ? color : VIOLET;
    if (color !== hintColor && hint) {
      hintColor = color;
      hint.webContents.executeJavaScript(`document.body.style.setProperty('--c','${color}');document.body.style.setProperty('--b','${color}24')`).catch(() => {});
    }
    const p = screen.getCursorScreenPoint(), all = screen.getAllDisplays().map((d) => d.bounds);
    const g: any = { w, kind: kindOf(w), from: p, b: w.getBounds(), all, moved: false, due: false, zone: '', since: 0, waiting: false, t0: Date.now(), got: 0, done: 0, slow: 0, shown: false };
    g.first = zoneOf(p, screen.getDisplayNearestPoint(p).bounds, all).z;
    g.stop = () => drag === g && endDrag();
    g.timer = setInterval(() => tick(g), 16);
    w.once('closed', g.stop);
    w.webContents.once('did-start-loading', g.stop);
    drag = g;
    return;
  }
  if (!drag || drag.w !== w || w.isDestroyed()) return;
  if (phase === 'move') return void (drag.got++, (drag.due = true));
  const g = endDrag(), p = screen.getCursorScreenPoint();
  if (g.due) place(g, p);
  const box = phase === 'end' && boxAt(g, p);
  if (box) w.setBounds(box);
  else keepInView(w);
  w.emit('resized');
});

const FEED = { provider: 'github' as const, owner: 'devdelion-one', repo: 'Amethyst' };
const NOTES = `https://github.com/${FEED.owner}/${FEED.repo}/releases/tag/v`;
const OFTEN = 10 * 60 * 1000, MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
interface Update {
  status: string;
  version: string;
  next: string | null;
  percent: number;
  done: number;
  total: number;
  speed: number;
  stage: string;
  error: string;
  notes: string;
  checked: number;
  look: boolean;
  auto: boolean;
  started: string;
  license: string;
  looking: boolean;
}
const update: Update = { status: app.isPackaged ? 'idle' : 'dev', version: app.getVersion(), next: null, percent: 0, done: 0, total: 0, speed: 0, stage: '', error: '', notes: NOTES, checked: state.update?.checked || 0, look: state.update?.look !== false, auto: !!state.update?.auto, started: state.update?.started && state.update.started !== app.getVersion() ? state.update.started : '', license: '', looking: false };
let updater: AppUpdater | null = null, looking = false, looked = 0, wanted = false, stopDownload: CancellationToken | null = null, installing = false, sent = 0, noonTimer: NodeJS.Timeout | null = null;

function tellUpdate(change: Partial<Update>, tick = false) {
  Object.assign(update, change);
  if (tick && Date.now() - sent < 200) return;
  sent = Date.now();
  for (const w of wins.keys()) if (!w.isDestroyed()) w.webContents.send('update', update);
}
const keepUpdate = () => ((state.update = { look: update.look, auto: update.auto, checked: update.checked, started: update.started }), save());
const whyFailed = (e: any) => (/\b404\b/.test(e?.message) ? 'no release found' : /\b40[13]\b|rate limit/i.test(e?.message) ? 'GitHub said no for now · try again later' : /sha512|checksum/i.test(e?.message) ? 'the file came damaged' : 'couldn’t reach the update server');

function feed() {
  if (!app.isPackaged) return false;
  if (!updater) {
    updater = require('electron-updater').autoUpdater as AppUpdater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('download-progress', (p) => tellUpdate({ percent: p.percent, done: p.transferred, total: p.total, speed: p.bytesPerSecond }, true));
    updater.setFeedURL(FEED);
  }
  return true;
}

async function look(asked = false) {
  if (looking || update.status === 'downloading' || !feed()) return;
  looking = true;
  looked = Date.now();
  if (asked) tellUpdate(update.status === 'ready' ? { looking: true } : { status: 'checking', stage: '', error: '' });
  try {
    const r = await updater!.checkForUpdates();
    const next = r?.isUpdateAvailable ? r.updateInfo.version : null;
    const { change, get } = settle(update, next, asked);
    if (get) Object.assign(update, change);
    else tellUpdate(change);
    keepUpdate();
    if (next) await licenseFor(next);
    tellUpdate({ license: newLicense()?.version || '' });
    if (get || wanted) download();
  } catch (e) {
    if (update.status === 'checking') tellUpdate({ status: 'failed', stage: 'look', error: whyFailed(e) });
  } finally {
    looking = wanted = false;
    if (update.looking) tellUpdate({ looking: false });
  }
}

function getNewest() {
  if (Date.now() - looked < MINUTE) return download();
  wanted = true;
  look(true);
}

async function download() {
  if (stopDownload || licensing || !update.next || !(update.status === 'available' || update.status === 'failed')) return;
  if (!licenses.has(update.next)) {
    licensing = true;
    await licenseFor(update.next);
    licensing = false;
    if (!licenses.has(update.next)) return void tellUpdate({ status: 'failed', stage: 'download', error: 'couldn’t read the new version’s license' });
  }
  const asks = newLicense();
  if (asks) return void (tellUpdate({ license: asks.version }), tellLicense());
  const stop = (stopDownload = new (require('builder-util-runtime').CancellationToken)());
  tellUpdate({ status: 'downloading', percent: 0, done: 0, total: 0, speed: 0, stage: '', error: '', started: update.next });
  keepUpdate();
  try {
    await updater!.downloadUpdate(stop);
    tellUpdate({ status: 'ready', percent: 100, done: update.total });
  } catch (e) {
    tellUpdate(stop.cancelled ? { status: 'available', started: '' } : { status: 'failed', stage: 'download', error: whyFailed(e) });
    if (stop.cancelled) keepUpdate();
  }
  stopDownload = null;
}

function installUpdate() {
  if (update.status !== 'ready') return;
  remember();
  writeState();
  installing = closingAll = true;
  for (const w of wins.keys()) if (!w.isDestroyed()) w.close();
  closeToasts();
}

function atNoon() {
  clearTimeout(noonTimer!);
  const last = new Date();
  last.setHours(12, 0, 0, 0);
  if ((last as any) > Date.now()) last.setDate(last.getDate() - 1);
  if (update.look && update.checked < +last) look();
  noonTimer = setTimeout(atNoon, +last + DAY - Date.now());
}

const asks = {
  state: () => update,
  seen: () => void (update.look && Date.now() - looked > OFTEN && look()),
  check: () => void look(true),
  download: () => void (update.status === 'failed' && update.stage === 'look' ? look(true) : getNewest()),
  cancel: () => stopDownload?.cancel(),
  install: installUpdate,
  set: ({ look: on, auto }: { look?: boolean; auto?: boolean } = {}) => {
    tellUpdate({ look: !!on, auto: !!auto });
    keepUpdate();
    if (update.auto) download();
  },
};
for (const [name, fn] of Object.entries(asks)) ipcMain.handle('update-' + name, (e, a) => (ours(e.senderFrame?.url || '') ? fn(a) : null));

const PING = 'https://amethyst.run/ping';
let pinging = false;
const usageNow = () => {
  const u: Usage = state.usage || {};
  return { on: u.on ?? null, asked: !!u.asked, sent: u.sent || null, version: app.getVersion(), dev: !app.isPackaged, to: PING };
};
const tellUsage = () => {
  for (const w of wins.keys()) if (!w.isDestroyed()) w.webContents.send('usage', usageNow());
};
async function ping() {
  if (!app.isPackaged || pinging) return;
  const d = due(state.usage || {}, app.getVersion());
  if (!d) return;
  pinging = true;
  try {
    const r = await fetch(`${PING}?${d.query}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      state.usage = { ...state.usage, ...d.next, sent: { at: Date.now(), query: d.query } };
      save();
      tellUsage();
    }
  } catch {
  } finally {
    pinging = false;
  }
}
const usageAsks = {
  state: usageNow,
  set: ({ on, asked }: { on?: boolean | null; asked?: boolean } = {}) => {
    const u: Usage = { ...state.usage };
    if (on === true || on === false) u.on = on;
    if (on === true || on === false || asked) u.asked = true;
    state.usage = u;
    save();
    tellUsage();
    if (u.on) ping();
    return usageNow();
  },
};
for (const [name, fn] of Object.entries(usageAsks)) ipcMain.handle('usage-' + name, (e, a) => (ours(e.senderFrame?.url || '') ? fn(a) : null));

const LICENSE_AT = app.isPackaged ? path.join(SRC, 'LICENSE') : path.join(SRC, 'public-repo', 'LICENSE');
const RECORD = path.join(path.dirname(DATA), 'license.json');
const licenses = new Map<string, LicenseText | null>();
let licensing = false;
let ownLicense: LicenseText = { version: '', text: '' };
let record: LicenseRecord = { accepted: [] };
function readLicense() {
  const text = fs.readFileSync(LICENSE_AT, 'utf8').replace(/^﻿/, '');
  ownLicense = { version: versionOf(text), text };
  if (!ownLicense.version) throw new Error(`${LICENSE_AT} has no version on its second line`);
  try {
    record = readRecord(JSON.parse(fs.readFileSync(RECORD, 'utf8')));
  } catch {}
  if (app.isPackaged && !record.accepted.length) keepRecord(accept(record, ownLicense.version, new Date(), 'installer'));
}
function keepRecord(r: LicenseRecord) {
  record = r;
  try {
    fs.mkdirSync(path.dirname(RECORD), { recursive: true });
    fs.writeFileSync(RECORD, JSON.stringify(record, null, 2));
  } catch {}
}
async function licenseFor(version: string) {
  if (licenses.has(version)) return;
  try {
    const r = await fetch(`https://github.com/${FEED.owner}/${FEED.repo}/releases/download/v${version}/LICENSE.txt`, { signal: AbortSignal.timeout(15000) });
    if (r.status === 404) return void licenses.set(version, null);
    if (!r.ok) return;
    const text = (await r.text()).replace(/^﻿/, '');
    licenses.set(version, versionOf(text) ? { version: versionOf(text), text } : null);
  } catch {}
}
const newLicense = () => (update.next ? blocks(licenses.get(update.next), record) : null);
const licenseNow = () => {
  const lic = newLicense();
  return { version: ownLicense.version, text: ownLicense.text, accepted: accepted(record, ownLicense.version), last: last(record, ownLicense.version) || last(record), update: lic ? { next: update.next, version: lic.version, text: lic.text } : null, site: 'https://amethyst.run/license' };
};
const tellLicense = () => {
  for (const w of wins.keys()) if (!w.isDestroyed()) w.webContents.send('license', licenseNow());
};
const licenseAsks = {
  state: licenseNow,
  accept: ({ version }: { version?: string } = {}) => {
    const lic = newLicense();
    const via = lic && version === lic.version ? 'update' : version === ownLicense.version ? 'app' : null;
    if (!via) return licenseNow();
    keepRecord(accept(record, version!, new Date(), via));
    tellLicense();
    tellUpdate({ license: newLicense()?.version || '' });
    if (via === 'update') download();
    return licenseNow();
  },
};
for (const [name, fn] of Object.entries(licenseAsks)) ipcMain.handle('license-' + name, (e, a) => (ours(e.senderFrame?.url || '') ? fn(a) : null));

const trayPrefs = () => ({ on: true, login: true, told: false, ...state.tray });
let tray: Tray | null = null;
let hidden: BrowserWindow[] = [];
let quiet = process.argv.includes('--tray');
let leaving = false;
const inTray = () => quiet || hidden.some((w) => !w.isDestroyed());
function makeTray() {
  if (tray) return;
  tray = new Tray(process.platform === 'win32' ? ICON : nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Amethyst');
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open Amethyst', click: fromTray }, { type: 'separator' }, { label: 'Quit Amethyst', click: quitAll }]));
  tray.on('click', fromTray);
}
function toTray() {
  hidden = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !toasts.includes(w));
  for (const w of hidden) w.hide();
  makeTray();
  if (trayPrefs().told) return;
  tray!.displayBalloon({ iconType: 'info', title: 'Amethyst', content: 'Amethyst is still running in the tray' });
  state.tray = { ...trayPrefs(), told: true };
  save();
}
function fromTray() {
  const back = hidden.filter((w) => !w.isDestroyed() && !owned.gone(w) && !hiddenAway.has(w));
  hidden = [];
  quiet = false;
  if (!back.some((w) => wins.has(w) && !isExtra(wins.get(w)!))) back.push(...[...wins].filter(([x, a]) => !isExtra(a) && !x.isDestroyed()).map(([x]) => x));
  for (const w of back) w.show();
  const m = lastMain && !lastMain.isDestroyed() ? lastMain : back.find((w) => wins.has(w) && !isExtra(wins.get(w)!));
  if (m) (m.isMinimized() && m.restore(), m.focus());
}
function quitAll() {
  remember();
  writeState();
  leaving = closingAll = true;
  for (const w of wins.keys()) if (!w.isDestroyed()) w.close();
  closeToasts();
}
const login = () => app.isPackaged && app.setLoginItemSettings({ openAtLogin: trayPrefs().login, name: 'Amethyst', args: ['--tray'] });
ipcMain.handle('tray-state', (e) => (ours(e.senderFrame?.url || '') ? { on: trayPrefs().on, login: trayPrefs().login } : null));
ipcMain.handle('tray-set', (e, c) => {
  if (!ours(e.senderFrame?.url || '')) return null;
  state.tray = { ...trayPrefs(), ...(c && 'on' in c ? { on: !!c.on } : {}), ...(c && 'login' in c ? { login: !!c.login } : {}) };
  save();
  login();
  if (trayPrefs().on) makeTray();
  else if (tray && !inTray()) (tray.destroy(), (tray = null));
  return { on: trayPrefs().on, login: trayPrefs().login };
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (e, argv, cwd) => {
    const files = filesIn(argv, cwd);
    app.whenReady().then(() => {
      const back = inTray();
      if (back) fromTray();
      if (files.length) return giveFiles(files);
      if (back) return;
      const m = lastMain && !lastMain.isDestroyed() ? lastMain : [...wins].find(([x, a]) => !isExtra(a) && !x.isDestroyed())?.[0];
      if (!m) return openWindow('/app');
      if (m.isMinimized()) m.restore();
      m.show();
      m.focus();
    });
  });
  app.whenReady().then(async () => {
    const ready = Date.now(), starting = ensureServer();
    serverUp = starting;
    const open = (state.open || []).filter((a) => typeof a === 'string' && a.startsWith('/app'));
    const mains = open.filter((a) => !isExtra(a));
    const loaded = (mains.length ? mains : ['/app']).map((addr, i) => new Promise<void>((up) => {
      const wc = openWindow(addr).webContents;
      wc.once('did-stop-loading', up);
      wc.once('destroyed', up);
      if (i === 0) wc.once('did-start-loading', () => starting.then((t) => hitchLog('app', t ? `start: server listening after ${t.up - ready} ms (forked at ${t.forked - ready} ms), windows loading at ${Date.now() - ready} ms` : `start: server already running, windows loading at ${Date.now() - ready} ms`)));
    }));
    try {
      readLicense();
      await starting;
    } catch (e) {
      closingAll = true;
      dialog.showErrorBox('Amethyst could not start', String((e as Error).message || e));
      return app.quit();
    }
    await Promise.all(loaded);
    for (const addr of open.filter(isExtra)) openWindow(addr);
    if (trayPrefs().on || quiet) makeTray();
    login();
    if (!app.isPackaged) return;
    feed();
    ping();
    setInterval(ping, 60 * 60 * 1000);
    powerMonitor.on('resume', ping);
    setTimeout(() => {
      if (update.look) look();
      atNoon();
      powerMonitor.on('resume', atNoon);
    }, 10000);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', (e) => {
    session.defaultSession.flushStorageData();
    if (!server) {
      if (!installing) return;
      installing = false;
      e.preventDefault();
      updater!.quitAndInstall(true, true);
      setTimeout(() => app.exit(0), 5000);
      return;
    }
    e.preventDefault();
    if (quitting) return;
    quitting = true;
    const s = server;
    s.postMessage('quit');
    setTimeout(() => {
      if (process.platform === 'win32')
        try {
          execSync(`taskkill /pid ${s.pid} /T /F`, { stdio: 'ignore', windowsHide: true });
        } catch {}
      else s.kill();
      app.exit(0);
    }, 3000);
  });
}
