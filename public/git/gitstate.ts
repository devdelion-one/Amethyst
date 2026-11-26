import { api, atWs, levelKey } from '../base/model.ts';
import { $, quietly, store } from '../base/util.ts';
import { pref } from '../base/prefs.ts';
import { ask, miRow } from '../base/controls.ts';
import { crystalOf } from '../base/codes.ts';
import { onSize } from '../base/measure.ts';

export type GitFile = { path: string; from?: string; x: string; secret?: boolean; staged?: true | 'part'; fresh?: boolean; sub?: boolean; dir?: boolean; n?: number; secrets?: string[]; eol?: boolean; lock?: string; mine?: boolean; by?: string[]; kid?: string };
export type Chat = { id: string; title: string; working: boolean };
export type Wt = { path: string; branch?: string; exists?: boolean; changes?: number; ahead?: number; locked?: boolean };
export type Repo = { path: string; name: string; kind: 'own' | 'sub' | 'below' };

export const G = {
  key: null as string | null,
  info: null as any,
  at: 0,
  busy: '',
  long: false,
  progress: '',
  note: '',
  err: false,
  fix: '',
  detail: '',
  staging: 0,
  stageGen: 0,
  stageSig: '',
  connect: false,
  vis: 'private',
  wts: null as any,
  count: null as number | null,
  repo: '',
  repos: null as Repo[] | null,
  amend: false,
  came: null as { from: string; to: string } | null,
  pr: null as { sig: string; at: number; n?: number; roll?: string; review?: string; title?: string; none?: boolean } | null,
  open: new Set<string>(),
  kids: new Map<string, GitFile[]>(),
};

export const panel = $<HTMLElement>('#scm');
let on = false;
export const shown = () => on;
const wantWts = () => on && pref('git:worktrees');
onSize(panel, {
  name: 'git.shown',
  live: true,
  write: (_, [e]) => {
    const now = e.contentRect.width > 0 || e.contentRect.height > 0;
    if (now === on) return;
    on = now;
    if (on && G.key) {
      G.repos = null;
      refreshGit(0);
    }
  },
});
export const files = (): GitFile[] => G.info?.files || [];
export const stagedMode = () => !!G.info?.staged;
export const sizeOf = (f: GitFile) => (f.n ? f.n : 1);
export const total = () => files().reduce((n, f) => n + sizeOf(f), 0) + (G.info?.more || 0);
export const secretsIn = () => files().reduce((n, f) => n + (f.secret && !f.staged ? 1 : f.secrets?.length || 0), 0);
export const taken = () => (stagedMode() ? G.info.staged : total() - secretsIn());
export const fullyStaged = () => files().every((f) => f.staged === true || (f.secret && !f.staged) || (f.dir && f.n === f.secrets?.length));
export function rows(): GitFile[] {
  const out: GitFile[] = [];
  for (const f of files()) {
    out.push(f);
    if (f.dir && G.open.has(f.path)) for (const k of G.kids.get(f.path) || []) out.push({ ...k, kid: f.path });
  }
  return out;
}
export const chats = (): Chat[] => G.info?.chats || [];
export const chatCode = (id: string) => crystalOf(id).code;
export const chatName = (id: string) => {
  const c = chats().find((x) => x.id === id);
  return `${crystalOf(id).code}${c?.title ? ' · ' + c.title : ''}`;
};
export async function okWhileWorking(what: string) {
  const at = chats().filter((c) => c.working);
  if (!at.length) return true;
  const one = at.length === 1, who = at.map((c) => chatCode(c.id)).join(', '), names = at.map((c) => (c.title ? `${chatCode(c.id)} (${c.title})` : chatCode(c.id))).join(' and ');
  return !!(await ask({ title: `${who} ${one ? 'is' : 'are'} at work in this folder`, text: `${what} changes the files under ${names}: what ${one ? 'it writes' : 'they write'} next may land on the wrong branch, or clash. Go on anyway?`, confirm: true }));
}
export async function unfold(d: string) {
  if (G.open.has(d)) {
    G.open.delete(d);
    return draw();
  }
  const key = G.key, repo = G.repo;
  try {
    const r = await gapi('GET', `/api/git/folder?path=${encodeURIComponent(d)}`);
    if (key !== G.key || repo !== G.repo) return;
    G.kids.set(d, r.files);
    G.open.add(d);
    draw();
  } catch (e: any) {
    say(e.message, true);
  }
}

const painters = { all: () => {}, badge: () => {} };
export const onDraw = (p: typeof painters) => Object.assign(painters, p);
export const draw = () => painters.all();
export function say(note: string, err = false, more: { fix?: string; detail?: string } = {}) {
  Object.assign(G, { note, err, fix: more.fix || '', detail: more.detail || '' });
  draw();
}

const picks = () => store.get('git:repo', {});
export function pickRepo(path: string) {
  if (path === G.repo) return;
  store.set('git:repo', { ...picks(), [G.key!]: path || undefined });
  Object.assign(G, { repo: path, info: null, wts: null, count: null, note: '', err: false, fix: '', detail: '', connect: false, amend: false });
  G.open.clear();
  G.kids.clear();
  draw();
  load();
}
const withRepo = (url: string) => (G.repo ? url + (url.includes('?') ? '&' : '?') + 'repo=' + encodeURIComponent(G.repo) : url);
export function gapi(method: string, url: string, body?: object): Promise<any> {
  if (method === 'GET') return api(method, withRepo(url));
  return api(method, url, G.repo ? { ...body, repo: G.repo } : body || {});
}

let seq = 0, wseq = 0, soon = 0, cseq = 0;
export async function loadWts(paint = true) {
  const key = G.key, repo = G.repo, n = ++wseq;
  if (!key) return;
  const wts = await quietly(gapi('GET', '/api/git/worktrees'), null);
  if (n !== wseq || key !== G.key || repo !== G.repo) return;
  G.wts = wts;
  if (paint) draw();
}
async function loadRepos(key: string) {
  const r = await quietly(api('GET', '/api/git/repos'), null);
  if (key !== G.key || !r) return;
  G.repos = r.list as Repo[];
  const has = (p: string) => G.repos!.some((x) => x.path === p);
  let want = picks()[key] || '';
  if (!has(want)) want = has('') ? '' : G.repos[0]?.path || '';
  G.repo = want;
}
export async function load() {
  const key = G.key, n = ++seq, c = cseq;
  if (!key) return;
  if (!G.repos) await loadRepos(key);
  if (n !== seq || key !== G.key) return;
  const repo = G.repo;
  let info: any;
  try {
    info = await gapi('GET', '/api/git?fetch=1');
  } catch (e: any) {
    info = { error: e.message };
  }
  if (n !== seq || key !== G.key || repo !== G.repo || G.staging) return;
  if (info.repo && wantWts()) await loadWts(false);
  if (n !== seq || key !== G.key || repo !== G.repo || G.staging) return;
  if (!info.repo) G.wts = null;
  G.info = info;
  G.at = Date.now();
  if (c === cseq) G.count = null;
  const dirs = files().filter((f) => f.dir).map((f) => f.path);
  for (const d of [...G.open]) if (!dirs.includes(d)) G.open.delete(d), G.kids.delete(d);
  const sig = `${key}|${repo}|${info.head?.hash}|` + files().map((f) => `${f.path}:${f.staged || ''}`).join('|');
  if (sig !== G.stageSig) (G.stageSig = sig), G.stageGen++;
  if (!info.commits || info.state) G.amend = false;
  draw();
  if (info.repo && info.gh === null && shown()) refreshGit(2000);
  prChip();
}
const BASES = new Set(['main', 'master', 'develop', 'dev', 'trunk']);
let prSeq = 0;
export async function prChip(force = false) {
  const i = G.info;
  const can = i?.repo && i.remote?.github && i.gh === 'in' && !i.detached && i.commits && i.branch && !BASES.has(i.branch);
  if (!can) {
    if (G.pr) (G.pr = null), draw();
    return;
  }
  const sig = `${G.key}|${G.repo}|${i.branch}`, old = G.pr?.sig === sig ? G.pr : null, age = old ? Date.now() - old.at : Infinity;
  if (!force && old && age < (old.roll === 'running' ? 30e3 : 120e3)) return;
  const n = ++prSeq;
  if (!old) G.pr = { sig, at: Date.now() };
  try {
    const r = await gapi('GET', `/api/gh/pr?branch=${encodeURIComponent(i.branch)}`);
    if (n !== prSeq) return;
    G.pr = { sig, at: Date.now(), n: r.n, roll: r.roll, review: r.review, title: r.title };
  } catch (e: any) {
    if (n !== prSeq) return;
    G.pr = e.status === 404 ? { sig, at: Date.now(), none: true } : { sig, at: Date.now() };
  }
  draw();
}
export function gitCount(e: { n: number }) {
  if (!G.key) return;
  cseq++;
  G.count = e.n;
  painters.badge();
  if (shown()) refreshGit();
}
export function refreshGit(ms = 300) {
  clearTimeout(soon);
  soon = setTimeout(load, ms);
}

export function setKey(): boolean {
  const key = atWs() ? '' : levelKey();
  if (key === G.key) return false;
  Object.assign(G, { key, info: null, at: 0, note: '', err: false, fix: '', detail: '', connect: false, wts: null, count: null, repo: '', repos: null, amend: false });
  G.open.clear();
  G.kids.clear();
  return true;
}

let poll = 0;
function watch() {
  clearTimeout(poll);
  poll = setTimeout(async () => {
    if (!G.busy) return;
    const d = await quietly(gapi('GET', '/api/git/doing'), null);
    if (!G.busy) return;
    const line = d?.line || '', long = !!d?.what;
    if (line !== G.progress || long !== G.long) {
      Object.assign(G, { progress: line, long });
      draw();
    }
    watch();
  }, 700);
}

export async function doing(word: string, call: () => Promise<any>, after?: (r: any, key: string | null) => unknown) {
  if (G.busy) return;
  const key = G.key;
  Object.assign(G, { busy: word, note: '', err: false, fix: '', detail: '', progress: '', long: false });
  draw();
  watch();
  try {
    const r = await call();
    Object.assign(G, { note: r?.error || r?.line || '', err: !!r?.error, fix: r?.fix || '', detail: r?.detail || '' });
    after?.(r, key);
  } catch (e: any) {
    Object.assign(G, { note: e.message, err: true, fix: e.fix || '', detail: e.detail || '' });
  } finally {
    Object.assign(G, { busy: '', progress: '', long: false });
    clearTimeout(poll);
    await load();
    draw();
  }
}
export const post = (url: string, body = {}) => () => gapi('POST', url, body);

let line = Promise.resolve();
export function stage(body: { paths?: string[]; on?: boolean; only?: boolean; all?: boolean }, mark: (f: GitFile) => GitFile['staged'] | null) {
  const key = G.key, repo = G.repo;
  if (!G.info?.repo) return;
  const count = () => files().filter((f) => f.staged).length, before = count();
  for (const f of files()) {
    const to = mark(f);
    if (to !== null) to ? (f.staged = to) : delete f.staged;
  }
  const after = count();
  G.info.staged = body.all ? (body.on === false ? 0 : Math.max(after, (G.info.total ?? after) - secretsIn())) : body.only ? after : Math.max(0, (G.info.staged || 0) + after - before);
  G.staging++;
  draw();
  line = line
    .then(() => gapi('POST', '/api/git/stage', body))
    .catch((e: any) => key === G.key && repo === G.repo && say(e.message, true))
    .then(() => {
      if (--G.staging === 0 && key === G.key && repo === G.repo) dirsAgain().then(load);
    });
}
export async function dirsAgain() {
  for (const d of G.open) {
    const r = await quietly(gapi('GET', `/api/git/folder?path=${encodeURIComponent(d)}`), null);
    if (r) G.kids.set(d, r.files);
  }
}

const noteTip = (n: string) => {
  const t = n.includes('\n') ? n.slice(n.indexOf('\n') + 1) : n;
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.') : '';
};
export const gitRow = (attrs: string, ic: string, label: string, note = '', off = false) => miRow(attrs + (off ? ' disabled' : ''), ic, label, '', noteTip(note));
