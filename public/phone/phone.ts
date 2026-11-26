import { createChatList } from '../app/chatlist.ts';
import { pinOf } from '../base/agentmenu.ts';
import { popMenu } from '../base/controls.ts';
import { api, projectOf, S } from '../base/model.ts';
import { page } from '../base/page.ts';
import { place } from '../base/place.ts';
import { agents, onAgents } from '../base/stream.ts';
import { every } from '../base/life.ts';
import { amElse, esc, quietly, store } from '../base/util.ts';
import type { Agent } from '../base/stream.ts';

const ON = typeof location === 'object' && new URLSearchParams(location.search).has('phone');
const SCOPE = 'phone:scope';
const WS = 'phone:wid';
const LOST = "Can't reach Amethyst. Is the PC awake and on this Wi-Fi?";
const CHEV = '<svg class="ph-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>';
const BACK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4l-6 6 6 6"/></svg>';

let scope: string = store.get(SCOPE, '');
let cur: string | null = null;
let alerts = true;
let lost = false;
let sound: AudioContext | null = null;
const was = new Map<string, string>();
let primed = false;

const mine = (a: Agent) => a.kind === 'chat' && a.status !== 'ended' && !amElse(a) && (!scope || a.pid === scope);
const nameOf = (pid: string) => projectOf(pid)?.name || 'Project';
const tabOf = (pid: string) => document.querySelector<HTMLElement>(`#projects .pj-tab[data-pjsel="${CSS.escape(pid)}"]`);

function start() {
  document.documentElement.classList.add('phone');
  const root = document.createElement('div');
  root.id = 'phone';
  root.innerHTML = `
    <div class="ph-strip" role="status" hidden></div>
    <header class="ph-top"><button type="button" class="ph-ws" data-ph-ws title="Workspace&#10;Tap to pick another workspace."></button><button type="button" class="ph-dd" data-ph-dd aria-haspopup="menu" title="Which chats&#10;All chats in the workspace, or one project's."></button></header>
    <div class="ph-list oc-list dk-list"></div>
    <header class="ph-head" hidden><button type="button" class="ph-back" data-ph-back aria-label="back to the chats" title="Back&#10;To the list of chats.">${BACK}</button><div class="ph-tt"><b></b><span></span></div></header>`;
  document.body.append(root);
  const el = root.querySelector<HTMLElement>('.ph-list')!, strip = root.querySelector<HTMLElement>('.ph-strip')!;
  const lst = createChatList({
    list: 'orch',
    el,
    attr: 'data-ph',
    mine,
    cur: () => cur,
    shown: () => true,
    repaint: () => paint(),
    open: (id) => void openChat(id),
    close: () => {},
    mark: () => {},
    sub: () => {},
    newChat: (b, p) => void newChat(b, p),
    none: () => (scope ? `No open chats in ${esc(nameOf(scope))}.` : 'No open chats in this workspace.'),
  });

  function paint() {
    lst.paint();
    for (const r of el.querySelectorAll<HTMLElement>('.oc-row[data-ph]')) {
      r.querySelector('.oc-x')?.remove();
      if (scope || r.querySelector('.ph-pj')) continue;
      const a = agents.all.get(r.dataset.ph!);
      const eye = r.querySelector('.oc-eye-l');
      if (!a || !eye) continue;
      eye.insertAdjacentHTML('beforeend', `<span class="ph-pj">${tabOf(a.pid || '')?.querySelector('.pjm')?.outerHTML || ''}${esc(nameOf(a.pid || ''))}</span>`);
    }
    root.querySelector<HTMLElement>('.ph-ws')!.textContent = S.workspaces.find((w) => w.id === S.wid)?.name || 'Workspace';
    root.querySelector<HTMLElement>('.ph-dd')!.innerHTML = `${esc(scope ? nameOf(scope) : 'All chats')}${CHEV}`;
    head();
  }

  function head() {
    const a = cur ? agents.all.get(cur) : null;
    root.querySelector<HTMLElement>('.ph-head')!.hidden = !cur;
    document.documentElement.classList.toggle('ph-in', !!cur);
    if (!a) return;
    root.querySelector('.ph-tt b')!.textContent = a.title || 'New chat';
    root.querySelector('.ph-tt span')!.textContent = nameOf(a.pid || '');
  }

  async function toProject(pid: string) {
    if (pid && pid !== S.pid) await page.switchLevel(pid);
  }

  async function openChat(id: string) {
    const a = agents.all.get(id);
    if (!a) return;
    await toProject(a.pid || '');
    place(id, { in: 'orch' });
    cur = id;
    head();
    await page.showAgent(a);
    calm(id);
  }

  function back() {
    cur = null;
    head();
    paint();
  }

  function projectRows(withAll: boolean) {
    const tabs = [...document.querySelectorAll<HTMLElement>('#projects .pj-tab')];
    const rows = tabs.length ? tabs.map((t) => `<button class="mi pj-mi${t.dataset.pjsel === scope ? ' on' : ''}" data-pj="${esc(t.dataset.pjsel!)}" style="${esc(t.getAttribute('style') || '')}">${t.innerHTML}</button>`) : S.projects.map((p) => `<button class="mi${p.id === scope ? ' on' : ''}" data-pj="${esc(p.id)}"><span class="mi-n">${esc(p.name)}</span></button>`);
    return (withAll ? `<button class="mi${scope ? '' : ' on'}" data-pj=""><span class="mi-n">All chats</span></button>` : '') + rows.join('');
  }
  const below = (b: HTMLElement) => b.getBoundingClientRect();
  let menuFrom: HTMLElement | null = null;
  function menu(b: HTMLElement, html: string, pick: (btn: HTMLButtonElement) => unknown) {
    const m = document.querySelector<HTMLElement>('#colormenu');
    if (menuFrom === b && m && !m.hidden) {
      menuFrom = null;
      return void (m.hidden = true);
    }
    menuFrom = b;
    m?.classList.add('ph-menu');
    const r = below(b);
    popMenu(r.left, r.bottom + 4, html, (btn) => ((menuFrom = null), pick(btn)));
  }

  async function newChat(b: HTMLElement, program?: string) {
    const go = async (pid: string) => {
      await toProject(pid);
      const r = await api('POST', '/api/agent', { agent: program || pinOf('list') || 'claude' }, pid);
      const id = r?.id;
      for (let i = 0; i < 50 && id && !agents.all.has(id); i++) await new Promise((ok) => setTimeout(ok, 100));
      if (id) await openChat(id);
    };
    if (scope) return go(scope);
    menu(b, projectRows(false), (btn) => go(btn.dataset.pj!));
  }

  let press = 0;
  el.addEventListener('pointerdown', (e) => {
    const nb = (e.target as HTMLElement).closest<HTMLElement>('[data-oc-new]');
    if (!nb || e.pointerType === 'mouse') return;
    press = window.setTimeout(() => nb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY })), 550);
  });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(t, () => clearTimeout(press));
  el.addEventListener('click', (e) => lst.click(e));

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-ph-back]')) return back();
    const dd = t.closest<HTMLElement>('[data-ph-dd]');
    if (dd)
      return menu(dd, projectRows(true), (btn) => {
        scope = btn.dataset.pj || '';
        store.set(SCOPE, scope);
        paint();
      });
    const ws = t.closest<HTMLElement>('[data-ph-ws]');
    if (ws) {
      const { workspaces } = await api('GET', '/api/workspaces');
      const list = (workspaces || []).filter((w: { missing?: boolean; home?: boolean }) => !w.missing && !w.home);
      return menu(ws, list.map((w: { id: string; name: string }) => `<button class="mi${w.id === S.wid ? ' on' : ''}" data-ws="${esc(w.id)}"><span class="mi-n">${esc(w.name)}</span></button>`).join(''), async (btn) => {
        scope = '';
        store.set(SCOPE, '');
        back();
        await page.switchWorkspace(btn.dataset.ws!);
        store.set(WS, S.wid);
        await land();
      });
    }
    const go = t.closest<HTMLElement>('[data-ph-go]');
    if (go) return void openChat(go.dataset.phGo!);
  });

  function chime() {
    if (!sound) return;
    const o = sound.createOscillator(), g = sound.createGain(), t = sound.currentTime;
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(1320, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(sound.destination);
    o.start(t);
    o.stop(t + 0.4);
  }
  addEventListener('pointerdown', () => {
    if (sound) return;
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (A) sound = new A();
    void sound?.resume();
  }, { capture: true });

  function show(html: string, kind: string) {
    strip.innerHTML = html;
    strip.dataset.kind = kind;
    strip.hidden = false;
    document.documentElement.classList.add('ph-strip-on');
  }
  function calm(id?: string) {
    if (strip.dataset.kind !== 'ask' || (id && strip.dataset.id !== id)) return;
    strip.hidden = true;
    document.documentElement.classList.remove('ph-strip-on');
  }
  function watch() {
    for (const a of agents.all.values()) {
      if (a.kind !== 'chat' || amElse(a)) continue;
      const before = was.get(a.id);
      was.set(a.id, a.status);
      if (strip.dataset.id === a.id && a.status !== 'asks') calm(a.id);
      if (!primed || before === 'asks' || a.status !== 'asks' || !alerts || lost || a.id === cur) continue;
      strip.dataset.id = a.id;
      show(`<button type="button" class="ph-alert" data-ph-go="${esc(a.id)}"><b>${esc(a.title || 'A chat')}</b> needs you</button>`, 'ask');
      chime();
    }
    primed = agents.loaded;
  }

  async function ping() {
    try {
      const r = await fetch('/api/remote/me', { cache: 'no-store' });
      if (r.status === 401) return location.replace('/');
      const me = await r.json();
      alerts = me.alerts !== false;
      if (lost) location.reload();
    } catch {
      lost = true;
      show(`<span>${esc(LOST)}</span>`, 'lost');
    }
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void ping());
  every(5000, () => void ping());
  void ping();

  onAgents(() => {
    if (cur && !agents.all.has(cur)) back();
    watch();
    paint();
  });
  async function land() {
    if (!S.wid) {
      const { workspaces = [] } = await api('GET', '/api/workspaces');
      const ok = workspaces.filter((w: { missing?: boolean; home?: boolean; projects?: unknown[] }) => !w.missing && (w.projects?.length || !w.home));
      const want = ok.find((w: { id: string }) => w.id === store.get(WS, '')) || ok[0];
      if (want) await page.switchWorkspace(want.id);
    }
    for (let i = 0; i < 200 && (!agents.loaded || S.switching); i++) await new Promise((ok) => setTimeout(ok, 100));
    store.set(WS, S.wid);
    if (scope && !projectOf(scope)) {
      scope = '';
      store.set(SCOPE, '');
    }
    if (!S.pid && S.projects.length) await quietly(toProject(scope || S.projects[0].id));
    paint();
  }
  setTimeout(() => void land(), 300);
}

if (ON) start();
