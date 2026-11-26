import { popMenu } from '../base/controls.ts';
import { copy } from '../base/chips.ts';
import { showPath } from '../base/follow.ts';
import { api, projectOf, S } from '../base/model.ts';
import { agents } from '../base/stream.ts';
import { esc, quietly, setSave, store } from '../base/util.ts';
import { tell } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { plural } from '../base/words.ts';
import { wtStripLive, wtStripOn } from '../app/composer.ts';
import type { ChatWorktree } from '../base/types.ts';
import { whereIn } from './shape.ts';

type Wt = ChatWorktree;
type WtNow = { path: string; inMain?: boolean; tip?: string; ahead: number; changes: number; base?: string };
type From = { from?: string; carry?: boolean };
type Branches = { local: { name: string }[]; remote: string[] };
type WtCtx = {
  el: HTMLElement & { renderWt?: () => void };
  btn: HTMLElement;
  cwd: HTMLElement;
  pid: () => string;
  chat: () => string | null | undefined;
  line: (cls: string, html: string) => unknown;
};

export function wtChip({ el, btn, cwd, pid, chat, line }: WtCtx) {
  let wt: Wt | null = null, wtNow: WtNow | null = null, spoke = false;
  let main: { base: string | null; changed: number } | null = null, mainRead = 0, menuOpen = false, again = false;
  const strip = el.querySelector<HTMLElement>('.ch-wtstrip');
  const wtOn = () => !!store.get('worktreeOn', {})[pid()];
  const fromOf = (): From => store.get('worktreeFrom', {})[pid()] || {};
  const setFrom = (f: From) => {
    store.set('worktreeFrom', { ...store.get('worktreeFrom', {}), [pid()]: f });
    renderWt();
  };
  const where = (p: string) => (wt && !wt.gone ? { ...whereIn(p), root: wt.cwd, main: whereIn(p).root, here: false } : whereIn(p));
  const merged = () => !!(wtNow && wtNow.inMain && wtNow.tip && wtNow.tip !== wt!.from);
  const isSet = () => {
    const id = chat();
    return !!wt || spoke || !!(id && agents.all.get(id)?.title);
  };
  const before = () => !isSet() && wtOn() && !!pref('chat:worktree') && !!pid();
  const baseName = () => main?.base || 'main';
  function renderStrip() {
    if (!strip) return;
    const live = !!wt && !wt.gone, on = !live && before();
    strip.hidden = !pref('chat:wtStrip') || (!live && !on);
    strip.classList.toggle('live', live);
    strip.classList.toggle('merged', live && merged());
    if (on) {
      const f = fromOf(), n = main?.changed || 0;
      const label = f.from || (f.carry && n ? `${baseName()} + ${plural(n, 'change')}` : baseName());
      const note = !f.from && !f.carry && n ? `${plural(n, 'change')} ${n === 1 ? 'stays' : 'stay'} in ${baseName()}` : '';
      const html = wtStripOn(label, note);
      if (strip.dataset.html !== html) {
        strip.innerHTML = html;
        strip.dataset.html = html;
      }
      strip.removeAttribute('title');
      strip.querySelector('.wts-pk')?.setAttribute('aria-expanded', String(menuOpen));
    } else if (live) {
      const st = !wtNow ? '' : merged() ? '✓ merged' : [wtNow.ahead ? `${plural(wtNow.ahead, 'commit')} ahead` : '', wtNow.changes ? plural(wtNow.changes, 'uncommitted file') : ''].filter(Boolean).join(', ');
      const html = wtStripLive(wt!.branch, wtNow?.base || wt!.base, st);
      if (strip.dataset.html !== html) {
        strip.innerHTML = html;
        strip.dataset.html = html;
      }
      strip.title = `Worktree: ${wt!.branch}\n${wt!.path}\n\nClick to copy its path or open its folder.`;
    } else {
      strip.dataset.html = '';
      strip.removeAttribute('title');
    }
  }
  function renderWt() {
    const b = btn, set = isSet();
    b.hidden = !pref('chat:worktree') || !pid();
    b.classList.toggle('on', !set && wtOn());
    b.classList.toggle('live', !!wt && !wt.gone && !merged());
    b.classList.toggle('merged', !!wt && !wt.gone && merged());
    b.classList.toggle('dimmed', !!(set && (!wt || wt.gone)));
    b.setAttribute('aria-pressed', String(!set && wtOn()));
    b.removeAttribute('data-tip-mono');
    b.removeAttribute('data-tip-wide');
    if (!set) b.title = wtOn()
      ? "Worktree: on\nYour first message makes this chat a folder of its own on a new branch. Pick what it starts from on the strip above the message box. Click to work in the project's own folder instead.\n\nnode_modules is not there yet, so the agent installs it; .env comes along if .worktreeinclude lists it."
      : "Worktree: off\nThis chat will work in the project's own folder. Click to give it a worktree instead: a folder of its own on a new branch, made when you send the first message.\n\nWith a worktree, the agent's changes stay apart from your files until you merge them.";
    else if (!wt) b.title = "Worktree\nThis chat works in the project's own folder, so its changes go straight into your files.\n\nTo keep a chat's changes on a branch of their own, turn the worktree on in a new chat before its first message.";
    else if (wt.gone) b.title = `Worktree: gone\nIts branch ${wt.branch} was removed. This chat works in the project's own folder now.`;
    else {
      const base = wtNow?.base || wt.base;
      const st = !wtNow ? '' : merged() ? `merged into ${base}` : [`${plural(wtNow.ahead, 'commit')} not in ${base}`, `${plural(wtNow.changes, 'uncommitted file')}`].join(', ');
      b.title = `Worktree: ${wt.branch}\n${wt.path}${st ? '\n' + st : ''}\nTo finish, ask the agent to merge it or open a PR, or do it yourself. Source control then removes it.\n\nClick to copy its path or open its folder.`;
      b.toggleAttribute('data-tip-wide', true);
    }
    renderStrip();
    if (before() && Date.now() - mainRead > 5000) readMain();
  }
  async function readMain() {
    if (!pid()) return;
    mainRead = Date.now();
    const r = await quietly(api('GET', '/api/git/worktrees', undefined, pid()), null);
    main = r && r.repo !== false ? { base: r.base || null, changed: r.changed || 0 } : null;
    const f = fromOf();
    if (f.from && r && r.repo !== false) {
      const b: Branches | null = await quietly(api('GET', '/api/git/branches', undefined, pid()), null);
      if (b && ![...b.local.map((x) => x.name), ...b.remote].includes(f.from)) setFrom({});
    }
    renderWt();
  }
  async function readWt() {
    if (!wt || wt.gone || !pid()) return;
    try {
      const r = await api('GET', '/api/git/worktrees', undefined, pid());
      wtNow = (r.list || []).find((x: WtNow) => x.path.toLowerCase() === wt!.path.toLowerCase()) || null;
    } catch {}
    renderWt();
  }
  function liveMenu(b: HTMLElement) {
    const r = b.getBoundingClientRect();
    popMenu(r.left, r.top, `<button class="mi" data-k="copy">copy path<span class="d">${esc(wt!.path)}</span></button><button class="mi" data-k="open">open folder<span class="d">in the file manager</span></button>`, (m) => (m.dataset.k === 'copy' ? copy(wt!.path).then(() => setSave('path copied')) : showPath(wt!.path)), true);
  }
  async function wtClick(b: HTMLElement) {
    if (wt && !wt.gone) return liveMenu(b);
    if (wt || spoke) return tell(el, { title: "This chat's folder is set", line: 'A chat gets a worktree before its first message: start a new chat for one', ms: 2500 });
    if (!wtOn()) {
      const r = await quietly(api('GET', '/api/git/worktrees', undefined, pid()), null);
      if (r && r.repo === false) return tell(el, { title: 'Worktrees need git', line: 'This project is not a git repository yet: start git here in source control first', ms: 3000 });
    }
    store.set('worktreeOn', { ...store.get('worktreeOn', {}), [pid()]: !wtOn() });
    renderWt();
  }
  function opened(pk: HTMLElement) {
    menuOpen = true;
    pk.setAttribute('aria-expanded', 'true');
    const press = (e: Event) => {
      const t = e.target as Element | null;
      again = !!t?.closest?.('.wts-pk') && !!strip?.contains(t);
      if (!again) return;
      e.stopImmediatePropagation();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    };
    document.addEventListener('pointerdown', press, true);
    document.getElementById('colormenu')!.addEventListener('menuclose', () => {
      menuOpen = false;
      strip?.querySelector('.wts-pk')?.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', press, true);
    }, { once: true });
  }
  function fromMenu(pk: HTMLElement) {
    const r = pk.getBoundingClientRect(), f = fromOf(), n = main?.changed || 0, base = esc(baseName());
    const plain = !f.from && !(f.carry && n);
    const html = `<button class="mi${plain ? ' on' : ''}" data-wf="main">${base}<span class="d">its last commit</span></button>` +
      (n ? `<button class="mi${!f.from && f.carry ? ' on' : ''}" data-wf="carry">${base} + your ${plural(n, 'uncommitted change')}<span class="d">copied in, your folder stays as it is</span></button>` : '') +
      `<div class="sep"></div><button class="mi${f.from ? ' on' : ''}" data-wf="other">${f.from ? esc(f.from) : 'other branches…'}<span class="d">${f.from ? 'other branches…' : 'start from another branch'}</span></button>`;
    popMenu(r.left, r.top - 4, html, (m) => {
      const k = m.dataset.wf;
      if (k === 'main') setFrom({});
      else if (k === 'carry') setFrom({ carry: true });
      else if (k === 'other') branchMenu(pk);
    }, true);
    opened(pk);
  }
  async function branchMenu(pk: HTMLElement) {
    const b: Branches | null = await quietly(api('GET', '/api/git/branches', undefined, pid()), null);
    if (!b) return tell(el, { title: "Couldn't list the branches", line: 'Source control shows what git says about this project', ms: 3000 });
    const own = main?.base, cur = fromOf().from;
    const names = [...b.local.map((x) => x.name).filter((x) => x !== own), ...b.remote];
    if (!names.length) return tell(el, { title: 'No other branches yet', line: `The worktree starts from ${own || 'the last commit'}`, ms: 2500 });
    const r = pk.getBoundingClientRect();
    const html = `<div class="ml">start from</div><input class="mi-find" placeholder="find a branch" spellcheck="false" autocomplete="off">` +
      names.map((x) => `<button class="mi${x === cur ? ' on' : ''}" data-wb="${esc(x)}">${esc(x)}${b.remote.includes(x) ? `<span class="d">on ${esc(x.slice(0, x.indexOf('/')))}</span>` : ''}</button>`).join('');
    popMenu(r.left, r.top - 4, html, (m) => m.dataset.wb && setFrom({ from: m.dataset.wb }), true);
    opened(pk);
    const m = document.getElementById('colormenu')!, find = m.querySelector<HTMLInputElement>('.mi-find');
    if (!find) return;
    find.focus();
    find.addEventListener('input', () => {
      const q = find.value.trim().toLowerCase();
      for (const x of m.querySelectorAll<HTMLElement>('[data-wb]')) x.hidden = !!q && !x.dataset.wb!.toLowerCase().includes(q);
    });
    find.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      m.querySelector<HTMLElement>('[data-wb]:not([hidden])')?.click();
    });
  }
  if (strip) {
    strip.addEventListener('click', (e) => {
      const t = e.target as Element, pk = t.closest<HTMLElement>('.wts-pk');
      if (t.closest('.wts-x')) return wtClick(btn);
      if (pk && again) return void (again = false);
      if (pk) return fromMenu(pk);
      if (wt && !wt.gone) liveMenu(strip);
    });
    strip.addEventListener('pointerenter', () => {
      if (before() && Date.now() - mainRead > 3000) readMain();
      else if (wt && !wt.gone && Date.now() - wtRead > 5000) {
        wtRead = Date.now();
        readWt();
      }
    });
  }
  el.addEventListener('focusin', () => before() && Date.now() - mainRead > 5000 && readMain());
  function wtLine(w: Wt) {
    const c = (s: string) => `<code data-tip-mono>${esc(s)}</code>`;
    if (w.gone) return line('ch-note', `Its worktree ${c(w.branch)} is gone: from here on this chat works in the project's folder.`);
    const extra = [w.copied?.length ? `Copied: ${w.copied.slice(0, 4).map(c).join(', ')}${w.copied.length > 4 ? ` and ${w.copied.length - 4} more` : ''}.` : '', w.carried ? `Your ${plural(w.carried, 'uncommitted change')} from the main folder ${w.carried === 1 ? 'is' : 'are'} in it, not committed.` : '', w.left ? `Your ${plural(w.left, 'uncommitted change')} in the main folder ${w.left === 1 ? 'is' : 'are'} not in it.` : ''].filter(Boolean).join(' ');
    line('ch-note ch-wtnote', `Works in its own worktree: ${c(w.path)} on ${c(w.branch)}, from ${c(w.base)}${w.from ? ` at ${esc(w.from.slice(0, 7))}` : ''}.${extra ? ' ' + extra : ''}`);
  }
  el.renderWt = renderWt;
  let wtRead = 0;
  btn.addEventListener('pointerenter', () => {
    if (!wt || wt.gone || Date.now() - wtRead < 5000) return;
    wtRead = Date.now();
    readWt();
  });
  function showCwd() {
    const at = wt && !wt.gone ? wt.cwd : pid() ? projectOf(pid())?.path || '' : S.ws?.dir || '';
    cwd.textContent = at;
    renderWt();
  }
  function setSpoke(on: boolean) {
    spoke = on;
    renderWt();
  }
  function event(w: Wt | null | undefined) {
    wt = w?.path ? w : null;
    wtNow = null;
    if (wt) wtLine(wt);
    showCwd();
    readWt();
  }
  function turnEnded(at: number | undefined) {
    if (wt && !wt.gone && Date.now() - (at || 0) < 5000) readWt();
  }
  function reset() {
    wt = wtNow = null;
    spoke = false;
    showCwd();
  }
  const wants = (): false | true | From => {
    if (spoke || wt || !wtOn() || !pref('chat:worktree') || !pid()) return false;
    const f = fromOf();
    return f.from ? { from: f.from } : f.carry ? { carry: true } : true;
  };
  return { where, render: renderWt, click: wtClick, showCwd, spoke: () => spoke, setSpoke, event, turnEnded, reset, wants };
}
