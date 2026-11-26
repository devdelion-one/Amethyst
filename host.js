'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(__dirname, 'public');
const { stripTypeScriptTypes } = require('module');
const strippedCache = new Map();
function stripped(file) {
  const { mtimeMs, size } = fs.statSync(file);
  const hit = strippedCache.get(file);
  if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return hit.code;
  const src = fs.readFileSync(file, 'utf8');
  const code = stripTypeScriptTypes ? stripTypeScriptTypes(src) : src;
  strippedCache.set(file, { mtimeMs, size, code });
  return code;
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ts': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml' };
const HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'",
};

const DIR = process.env.STATS_DIR || path.join(__dirname, 'data');
const STATS = path.join(DIR, 'stats.json'), IDS = path.join(DIR, 'visitors.json'), SALT = path.join(DIR, 'salt');
const BOT = /bot|crawl|spider|preview|curl|wget/i;
const KEEP_DAYS = 400, MAX_REFS = 200, MAX_IDS = 200000, MAX_ONLINE = 1000, ONLINE_MS = 5 * 60000;
const PAGES = { '/index.html': '/', '/privacy.html': '/privacy', '/license.html': '/license', '/download.html': '/download' };
const SHORT = { ...PAGES, '/terms': '/license' };
const REPO = 'devdelion-one/Amethyst', RELEASES = `https://github.com/${REPO}/releases`, LATEST_MS = 10 * 60000, RETRY_MS = 60000;
let latest = { at: 0, version: '', url: '', notes: '' }, asking = null;
async function ask() {
  let found = null;
  try {
    const r = await fetch(process.env.RELEASES_API || `https://api.github.com/repos/${REPO}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'amethyst-site' }, signal: AbortSignal.timeout(5000) });
    const release = r.ok ? await r.json() : null;
    const exe = release?.assets?.find((a) => /^Amethyst-Setup-[\d.]+\.exe$/.test(a.name));
    if (exe) {
      const version = String(release.tag_name).replace(/^v/, '');
      const notes = /^https:\/\/github\.com\//.test(release.html_url) ? release.html_url : `${RELEASES}/tag/${encodeURIComponent(release.tag_name)}`;
      found = { version, url: exe.browser_download_url, notes };
    }
  } catch {}
  latest = found ? { ...found, at: Date.now() } : { ...latest, at: Date.now() - LATEST_MS + RETRY_MS };
  asking = null;
  return latest;
}
const newest = () => (Date.now() - latest.at < LATEST_MS ? Promise.resolve(latest) : (asking ??= ask()));
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
function weekOf(ms) {
  const d = new Date(dayOf(ms) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const n = Math.floor((+d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 / 7) + 1;
  return `${d.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}
let pending = {}, salt, ids, idsOk = false, idsChanged = false, onlineWritten = false;
const online = new Map();

try {
  fs.mkdirSync(DIR, { recursive: true });
  try {
    fs.writeFileSync(SALT, crypto.randomBytes(32), { flag: 'wx' });
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  salt = fs.readFileSync(SALT);
  if (salt.length < 32) throw new Error('the salt file is too short');
  try {
    ids = new Map(Object.entries(JSON.parse(fs.readFileSync(IDS, 'utf8'))));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    ids = new Map();
  }
  idsOk = true;
} catch (e) {
  console.error(`visitor IDs not kept on disk this run: ${e.message}`);
  salt ??= crypto.randomBytes(32);
  ids ??= new Map();
}

const USERS_MIN = Number(process.env.USERS_MIN) || 100, SLOT = '<p class="site-users"></p>';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let appNow = null;
try {
  appNow = JSON.parse(fs.readFileSync(STATS, 'utf8')).app || null;
} catch {}
function usersLine(app, now = Date.now()) {
  const d = new Date(now), month = dayOf(now).slice(0, 7);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const cur = app?.months?.[month] || 0, prev = app?.months?.[last.toISOString().slice(0, 7)] || 0;
  const n = Math.max(cur, prev);
  if (n < USERS_MIN) return '';
  const step = n < 1000 ? 10 : 100, shown = Math.floor(n / step) * step;
  const when = cur >= prev ? 'this month' : `in ${MONTHS[last.getUTCMonth()]}`;
  return `<b>${shown.toLocaleString('en-US')}+</b> people used Amethyst ${when}<span>counted only if they said yes</span>`;
}
let index = { mtimeMs: 0, size: 0, html: '' };
const VERSION_SLOT = '"operatingSystem":"Windows",';
function indexPage(file) {
  const { mtimeMs, size } = fs.statSync(file);
  if (index.mtimeMs !== mtimeMs || index.size !== size) index = { mtimeMs, size, html: fs.readFileSync(file, 'utf8') };
  newest();
  const version = latest.version ? `"softwareVersion":${JSON.stringify(latest.version).replace(/</g, '\\u003c')},` : '';
  return index.html.replace(SLOT, `<p class="site-users">${usersLine(appNow)}</p>`).replace(VERSION_SLOT, VERSION_SLOT + version);
}

const html = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let downloadDoc = { mtimeMs: 0, size: 0, html: '' };
function downloadPage(file) {
  const { mtimeMs, size } = fs.statSync(file);
  if (downloadDoc.mtimeMs !== mtimeMs || downloadDoc.size !== size) downloadDoc = { mtimeMs, size, html: fs.readFileSync(file, 'utf8') };
  const out = latest.version ? /\s*<section data-state="before">[\s\S]*?<\/section>/ : /\s*<section data-state="after">[\s\S]*?<\/section>/;
  return downloadDoc.html.replace(out, '').replace(/\{version\}/g, html(latest.version)).replace(/\{notes\}/g, html(latest.notes));
}

const blank = () => ({ views: {}, visitors: 0, new: 0, download: 0, join: 0, refs: {} });
const bump = (refs, host, n) => {
  const key = host in refs || Object.keys(refs).length < MAX_REFS ? host : '(other)';
  refs[key] = (refs[key] || 0) + n;
};
function referrer(req) {
  try {
    const bare = (h) => h.toLowerCase().replace(/^www\./, '');
    const from = bare(new URL(req.headers.referer).hostname);
    return from && from !== bare((req.headers.host || '').split(':')[0]) ? from.slice(0, 100) : '';
  } catch {
    return '';
  }
}

function hashOf(req, extra) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '';
  const v4 = ip.replace(/^::ffff:/, '');
  const network = /^\d+\.\d+\.\d+\.\d+$/.test(v4) ? v4.replace(/\.\d+$/, '') : ip.split(':').slice(0, 3).join(':');
  return crypto.createHash('sha256').update(salt).update(network + '\n' + extra).digest('hex').slice(0, 16);
}

function count(req, what) {
  const agent = req.headers['user-agent'];
  if (!agent || BOT.test(agent)) return;
  const now = Date.now(), day = dayOf(now);
  const c = (pending[day] ??= blank());
  if (what === 'download' || what === 'join') return void c[what]++;
  c.views[what] = (c.views[what] || 0) + 1;
  const id = hashOf(req, agent);
  const last = ids.get(id);
  if (last !== day) c.visitors++;
  if (last === undefined) c.new++;
  if (last !== day && (last !== undefined || ids.size < MAX_IDS)) {
    ids.set(id, day);
    idsChanged = true;
  }
  if (online.delete(id) || online.size < MAX_ONLINE) online.set(id, { at: now, page: what });
  const ref = referrer(req);
  if (ref) bump(c.refs, ref, 1);
}

const PING_KEYS = new Set(['v', 'first', 'upd', 'w', 'm']), VERSION = /^\d+\.\d+\.\d+(-[\w.]+)?$/, PING_CAP = 20;
const noPings = () => ({ days: {}, weeks: {}, months: {}, installs: 0 });
let pings = noPings(), pinged = false, capDay = '';
const perNet = new Map();
function ping(req, url) {
  const q = url.searchParams, v = q.get('v') || '', seen = new Set();
  if (v.length > 40 || !VERSION.test(v)) return;
  for (const [k, val] of q) {
    if (!PING_KEYS.has(k) || seen.has(k) || (k !== 'v' && val !== '1')) return;
    seen.add(k);
  }
  const now = Date.now(), day = dayOf(now);
  if (capDay !== day) (capDay = day), perNet.clear();
  const net = hashOf(req, 'ping'), n = perNet.get(net) || 0;
  if (n >= PING_CAP || (!n && perNet.size >= MAX_IDS)) return;
  perNet.set(net, n + 1);
  const d = (pings.days[day] ??= { users: 0, new: 0, updates: 0 });
  d.users++;
  if (seen.has('first')) (d.new++, pings.installs++);
  if (seen.has('upd')) d.updates++;
  if (seen.has('w')) {
    const w = (pings.weeks[weekOf(now)] ??= { users: 0, versions: {} });
    w.users++;
    bump(w.versions, v, 1);
  }
  if (seen.has('m')) pings.months[day.slice(0, 7)] = (pings.months[day.slice(0, 7)] || 0) + 1;
  pinged = true;
}
function addPings(all, oldest) {
  const app = (all.app ??= noPings());
  for (const k of ['days', 'weeks', 'months']) app[k] ??= {};
  for (const [day, c] of Object.entries(pings.days)) {
    const a = (app.days[day] ??= { users: 0, new: 0, updates: 0 });
    a.users += c.users;
    a.new += c.new;
    a.updates += c.updates;
  }
  for (const [week, c] of Object.entries(pings.weeks)) {
    const a = (app.weeks[week] ??= { users: 0, versions: {} });
    a.users += c.users;
    for (const [v, n] of Object.entries(c.versions)) bump(a.versions, v, n);
  }
  for (const [month, n] of Object.entries(pings.months)) app.months[month] = (app.months[month] || 0) + n;
  app.installs = (app.installs || 0) + pings.installs;
  const oldWeek = weekOf(Date.parse(oldest)), oldMonth = oldest.slice(0, 7);
  for (const day of Object.keys(app.days)) if (day < oldest) delete app.days[day];
  for (const week of Object.keys(app.weeks)) if (week < oldWeek) delete app.weeks[week];
  for (const month of Object.keys(app.months)) if (month < oldMonth) delete app.months[month];
}

const write = (file, data) => {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data));
  fs.renameSync(file + '.tmp', file);
};

function flush() {
  const now = Date.now();
  for (const [id, o] of online) if (now - o.at > ONLINE_MS) online.delete(id);
  if (!Object.keys(pending).length && !online.size && !onlineWritten && !pinged) return;
  try {
    let all = {};
    try {
      all = JSON.parse(fs.readFileSync(STATS, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    for (const [day, c] of Object.entries(pending)) {
      const a = (all[day] ??= blank());
      for (const [p, n] of Object.entries(c.views)) a.views[p] = (a.views[p] || 0) + n;
      a.visitors += c.visitors;
      a.new = (a.new || 0) + c.new;
      a.download += c.download;
      a.join = (a.join || 0) + c.join;
      for (const [r, n] of Object.entries(c.refs)) bump(a.refs, r, n);
    }
    const oldest = dayOf(now - KEEP_DAYS * 864e5), month = dayOf(now - 29 * 864e5);
    const days = Object.keys(all).filter((k) => /^\d{4}-/.test(k));
    for (const day of days) if (day < oldest) delete all[day];
    if (pinged || all.app) addPings(all, oldest);
    for (const [id, day] of ids) if (day < oldest) (ids.delete(id), (idsChanged = true));
    let last30 = 0;
    for (const day of ids.values()) if (day >= month) last30++;
    const since = all.unique?.since || dayOf(now);
    all.unique = { last30, total: ids.size, since: since < oldest ? oldest : since };
    all.online = [...online].reverse().map(([id, o]) => ({ id, at: new Date(o.at).toISOString().slice(0, 16) + 'Z', page: o.page }));
    fs.mkdirSync(DIR, { recursive: true });
    if (idsOk && idsChanged) write(IDS, Object.fromEntries(ids));
    write(STATS, all);
    appNow = all.app || null;
    pending = {};
    pings = noPings();
    pinged = false;
    idsChanged = false;
    onlineWritten = online.size > 0;
  } catch (e) {
    console.error(`visitor counts not written (kept for the next try): ${e.message}`);
  }
}
setInterval(flush, Number(process.env.STATS_FLUSH_MS) || 60000).unref();
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => (flush(), process.exit(0)));

http
  .createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/hit' && req.method === 'POST') {
      req.resume();
      const e = url.searchParams.get('e');
      if (e === 'download' || e === 'join') count(req, e);
      res.writeHead(204, HEADERS);
      return res.end();
    }
    if (url.pathname === '/ping' && req.method === 'POST') {
      req.resume();
      ping(req, url);
      res.writeHead(204, HEADERS);
      return res.end();
    }
    if (url.pathname === '/latest') {
      return void newest().then(({ version }) => {
        res.writeHead(200, { ...HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
        res.end(JSON.stringify({ version }));
      });
    }
    if (url.pathname === '/download/windows') {
      return void newest().then(({ url: to }) => {
        res.writeHead(302, { ...HEADERS, location: to || '/download', 'cache-control': 'no-cache' });
        res.end();
      });
    }
    if (SHORT[url.pathname]) {
      res.writeHead(301, { ...HEADERS, location: SHORT[url.pathname] + url.search, 'cache-control': 'no-cache' });
      return res.end();
    }
    if (url.pathname === '/') url.pathname = '/index.html';
    if (url.pathname === '/privacy') url.pathname = '/privacy.html';
    if (url.pathname === '/license') url.pathname = '/license.html';
    if (url.pathname === '/download') url.pathname = '/download.html';
    let file;
    try {
      file = path.resolve(PUBLIC, '.' + decodeURIComponent(url.pathname));
    } catch {
      file = '';
    }
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { ...HEADERS, 'content-type': 'text/plain' });
      return res.end('not found');
    }
    if (req.method === 'GET' && PAGES[url.pathname]) count(req, PAGES[url.pathname]);
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { ...HEADERS, 'content-type': type.startsWith('image/') && type !== 'image/svg+xml' ? type : type + '; charset=utf-8', 'cache-control': 'no-cache' });
    if (path.extname(file) === '.ts') return res.end(stripped(file));
    if (url.pathname === '/index.html') return res.end(indexPage(file));
    if (url.pathname === '/download.html') return void newest().then(() => res.end(downloadPage(file)));
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, '0.0.0.0', () => console.log(`Amethyst (hosted) on :${PORT}`));
