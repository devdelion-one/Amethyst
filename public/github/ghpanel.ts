import { atLaunch, levelKey, api } from '../base/model.ts';
import { $, esc, setSave, showErr, store } from '../base/util.ts';
import { notify } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { ghapi, ago, checkMark, reviewMark, link } from './ghbase.ts';
import { openPr, newPr } from './ghpr.ts';
import { openIssue, newIssue } from './ghissue.ts';

type Row = { n: number; title: string; author: string; draft: boolean; head: string; base: string; review: string; checks: string; at: number; url: string };
type IssueRow = { n: number; title: string; author: string; labels: { name: string; color: string }[]; comments: number; assignees: string[]; at: number };
const P = {
  key: null as string | null,
  where: null as any,
  list: null as any[] | null,
  err: '',
  note: '',
  kind: store.get('gh:kind', 'prs') as 'prs' | 'issues',
  show: store.get('gh:show', 'mine') as string,
  ishow: store.get('gh:ishow', 'mine') as string,
  q: '',
  busy: false,
};
const panel = $<HTMLElement>('#github');
const shown = () => panel.offsetParent !== null;
const TABS: [string, string][] = [
  ['mine', 'mine'],
  ['review', 'to review'],
  ['open', 'all open'],
];
const ITABS: [string, string][] = [
  ['mine', 'mine'],
  ['open', 'open'],
  ['closed', 'closed'],
];

let seq = 0;
async function load(fresh = false) {
  const n = ++seq, key = P.key, kind = P.kind;
  P.busy = true;
  draw();
  try {
    P.where = await ghapi('GET', '/api/gh/where');
    if (n !== seq || key !== P.key) return;
    if (P.where.gh === 'in' && P.where.repo) {
      const url = kind === 'prs' ? `/api/gh/prs?show=${P.show}` : `/api/gh/issues?show=${P.ishow}${P.q ? '&q=' + encodeURIComponent(P.q) : ''}`;
      const r = await ghapi('GET', url + (fresh ? '&fresh=1' : ''));
      if (n !== seq || key !== P.key || kind !== P.kind) return;
      Object.assign(P, { list: r.list, err: '' });
    }
  } catch (e: any) {
    if (n !== seq) return;
    Object.assign(P, { err: e.message, list: null });
  } finally {
    if (n === seq) P.busy = false;
  }
  draw();
}
export function renderGithub() {
  const key = atLaunch() ? '' : levelKey();
  if (key === P.key) return;
  Object.assign(P, { key, where: null, list: null, err: '', note: '' });
  draw();
  if (key && shown()) load();
}
export function refreshGithub(fresh = false) {
  if (shown() && P.key) load(fresh);
}
addEventListener('focus', () => refreshGithub());

const prRow = (p: Row) =>
  `<button class="gh-row" data-ghpr="${p.n}"><span class="gh-n">#${p.n}</span><span class="gh-t"><span class="nm">${esc(p.title)}</span><span class="dir">${esc(p.author)} · ${esc(p.head)} → ${esc(p.base)}${p.draft ? ' · draft' : ''}</span></span>${reviewMark(p.review)}${checkMark(p.checks)}<span class="gh-age">${ago(p.at)}</span></button>`;
const issueRow = (i: IssueRow) =>
  `<button class="gh-row" data-ghis="${i.n}"><span class="gh-n">#${i.n}</span><span class="gh-t"><span class="nm">${esc(i.title)}</span><span class="dir">${i.labels.map((l) => `<span class="gh-lab">${esc(l.name)}</span>`).join('')}${esc(i.author)}</span></span><span class="gh-cm">${i.comments || ''}</span><span class="gh-age">${ago(i.at)}</span></button>`;

function draw() {
  const w = P.where;
  let html = '';
  if (!P.key) html = '<p class="dim gh-msg">GitHub works inside a project.</p>';
  else if (!w) html = `<p class="dim gh-msg">${P.err ? esc(P.err) : '…'}</p>`;
  else if (w.gh === 'none') html = `<p class="gh-msg">Pull requests and issues go through the GitHub CLI.</p><p class="dim gh-msg">Install it from ${link('https://cli.github.com', 'cli.github.com')}, then come back.</p>`;
  else if (w.gh === 'out') html = `<p class="gh-msg">Sign in to GitHub to see the pull requests and issues.</p><button class="primary" data-gha="login">sign in to GitHub</button><p class="dim gh-msg">${esc(P.note || 'It opens in a terminal window.')}</p>`;
  else if (w.gh === 'offline') html = `<p class="gh-msg">Can't reach GitHub right now.</p><button class="outline" data-gha="again">try again</button>`;
  else if (!w.repo) html = `<p class="gh-msg">${esc(w.why || 'This project is not on GitHub.')}</p><p class="dim gh-msg">Put it there from source control: “not on GitHub · connect”.</p>`;
  else {
    const prs = P.kind === 'prs', now = prs ? P.show : P.ishow;
    const tabs = (prs ? TABS : ITABS).map(([k, label]) => `<button class="chip ${now === k ? 'on' : ''}" data-ghshow="${k}">${label}</button>`).join('');
    const empty = prs ? (P.show === 'mine' ? 'You have no open pull request here.' : P.show === 'review' ? 'Nothing waits for your review.' : 'No open pull request.') : P.q ? 'No issue matches.' : P.ishow === 'mine' ? 'No open issue is assigned to you.' : P.ishow === 'closed' ? 'No closed issue.' : 'No open issue.';
    const list = P.err ? `<p class="err gh-msg">${esc(P.err)}</p>` : !P.list ? '<p class="dim gh-msg">…</p>' : P.list.length ? P.list.map(prs ? prRow : issueRow).join('') : `<p class="dim gh-msg">${empty}</p>`;
    html = `<div class="gh-head">${link(`https://github.com/${w.repo}/${prs ? 'pulls' : 'issues'}`, esc(w.repo) + ' ↗')}${w.fork ? '<button class="sc-b" data-gha="sync">update my fork</button>' : ''}<span class="grow"></span><button class="gh-b" data-gha="again" aria-label="ask GitHub again"${P.busy ? ' disabled' : ''}>⟳</button></div>
      <div class="gh-kinds"><button class="${prs ? 'on' : ''}" data-ghkind="prs">pull requests</button><button class="${prs ? '' : 'on'}" data-ghkind="issues">issues</button></div>
      <div class="gh-tabs">${tabs}</div>
      ${prs ? '' : `<input class="gh-q" placeholder="search the issues" spellcheck="false" value="${esc(P.q)}">`}
      <button class="outline gh-new" data-gha="new">${prs ? '+ new pull request' : '+ new issue'}</button>
      <div class="gh-list">${list}</div>`;
  }
  const had = document.activeElement === panel.querySelector('.gh-q');
  panel.innerHTML = html;
  if (had) {
    const q = panel.querySelector<HTMLInputElement>('.gh-q');
    q?.focus();
    q?.setSelectionRange(q.value.length, q.value.length);
  }
}

let typing = 0;
panel.addEventListener('input', (e) => {
  const q = (e.target as HTMLElement).closest<HTMLInputElement>('.gh-q');
  if (!q) return;
  clearTimeout(typing);
  typing = window.setTimeout(() => {
    P.q = q.value.trim();
    P.list = null;
    load();
  }, 400);
});
panel.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const pr = t.closest<HTMLElement>('[data-ghpr]');
  if (pr) return openPr(Number(pr.dataset.ghpr));
  const is = t.closest<HTMLElement>('[data-ghis]');
  if (is) return openIssue(Number(is.dataset.ghis));
  const k = t.closest<HTMLElement>('[data-ghkind]');
  if (k) {
    P.kind = k.dataset.ghkind as 'prs' | 'issues';
    store.set('gh:kind', P.kind);
    P.list = null;
    return load();
  }
  const s = t.closest<HTMLElement>('[data-ghshow]');
  if (s) {
    if (P.kind === 'prs') store.set('gh:show', (P.show = s.dataset.ghshow!));
    else store.set('gh:ishow', (P.ishow = s.dataset.ghshow!));
    P.list = null;
    return load();
  }
  const a = t.closest<HTMLElement>('[data-gha]')?.dataset.gha;
  if (a === 'again') return load(true);
  if (a === 'new') return P.kind === 'prs' ? newPr() : newIssue();
  if (a === 'sync') {
    try {
      setSave((await ghapi('POST', '/api/gh/sync')).line);
    } catch (err) {
      showErr(err);
    }
    return;
  }
  if (a === 'login') {
    try {
      const r = await api('POST', '/api/git/login');
      P.note = r.opened ? 'Sign in in the window that opened, then come back here.' : `Sign in from a terminal: ${r.cmd}`;
    } catch (err: any) {
      P.note = err.message;
    }
    draw();
  }
});

export function ghNote(e: { n: number; title: string; text: string }) {
  if (!pref('gh:notify')) return;
  refreshGithub(true);
  const head = `#${e.n} ${e.title}`;
  if (document.hidden || !document.hasFocus()) {
    try {
      const n = new Notification(`${head}: ${e.text}`, { body: 'Amethyst · click to open it', tag: `gh-${e.n}` });
      n.onclick = () => {
        window.focus();
        openPr(e.n);
      };
      return;
    } catch {}
  }
  const box = notify(`<b>${esc(head)}</b>: ${esc(e.text)} <button class="sc-b" data-ghnote>open it</button>`, { ms: 10000 });
  box.querySelector('[data-ghnote]')?.addEventListener('click', () => (openPr(e.n), box.close?.()));
}
