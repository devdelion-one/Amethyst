import { api, atLaunch, S } from '../base/model.ts';
import { askWorkspace, switchWorkspace } from '../app/levels.ts';
import { ago, CHATS, esc, showErr } from '../base/util.ts';
import { chatOn, chatsOn, pref, PREFS, setOff, setPref, wasSet } from '../base/prefs.ts';
import { notify, tell } from '../base/notify.ts';
import { ask, bands, ICONS, menuHead, popMenu, untipIn } from '../base/controls.ts';
import { POP, WIN } from '../base/windows.ts';
import { basicPins, useTheme } from '../app/header.ts';
import { themeCards } from '../app/themecards.ts';
import { countMore, countNow, countReady, countTog, hasCount, onCount, setCount, toggleCountMore } from '../app/count.ts';
import { COUNT, countDetails } from '../app/count-words.ts';
import { reloadAll } from '../app/views.ts';
import { PLACE_AT, placeBar } from '../app/modeplace.ts';
import type { WorkspaceEntry } from '../base/types.ts';
import { tourDue } from './tutorial.ts';

type Agent = { id: string; name: string; version: string | null; hint: string };
type Found = { path: string; agents: string[]; last: number };
type Engine = { id: string; dir: string; from?: string };
type Place = { key: string; name: string; path: string; draft: boolean };

const MARK: Record<string, [string, string]> = { claude: ['✳', '#d97757'], codex: ['◎', ''], antigravity: ['▲', '#7aa7ff'], cursor: ['◆', '#a3a3a3'], copilot: ['⬢', '#8b7bd8'], grok: ['✦', '#e0a96d'] };
const FRESH = 60 * 24 * 3600e3;
const desk = window.amethyst;

let el: HTMLElement | null = null;
let agents: Agent[] | null = null, projects: Found[] | null = null, more = 0, already = 0, engines: Engine[] | null = null;
let ticked = new Set<string>(), ueOn = false, busy = false;
let pick: boolean | null = null, one = false, pageH = 0, ctPop = false;
let first = false, startAs: 'basics' | 'all' | null = null, hand = new Set<string>(), found: Set<string> | null = null;
let known: WorkspaceEntry[] = [];
let view: 'main' | 'ws' | 'pj' = 'main', drafts: Place[] = [], made: Place[] = [], places = new Map<string, string>(), dflt = '', draftN = 0;

const BASICS: [string, string[]][] = [
  ['modesHidden', ['term', 'research']],
  ['bar:off', ['timer', 'hitch', 'clips']],
  ['drafts:off', ['scratch', 'sketch', 'inbox']],
  ['qterm:off', ['term', 'pwsh', 'agent']],
  ['barend:off', ['pins', 'win']],
  ['act:off', ['github', 'agent setup', 'site']],
];
export function startWith(basics: boolean) {
  for (const [k, ids] of BASICS) setPref(k, basics ? [...new Set([...pref(k), ...ids])] : pref(k).filter((x: string) => !ids.includes(x)));
  setPref('forget:on', !basics);
  basicPins(basics);
}
const START: ['basics' | 'all', string, string][] = [
  ['basics', 'the basics', 'The basics\nThe dock holds the editor, orchestration, agents, usage and settings. Every other button waits in Settings until you turn it on.'],
  ['all', 'everything', 'Everything\nShows every mode, button and tool in the bars.\n\nYou can hide any of them later with a right-click on its bar.'],
];
const startRows = () =>
  `<div class="wl-sts"><span class="wl-dim">start with</span>${START.map(([k, name, line]) => `<button class="chip wl-st${startAs === k ? ' on' : ''}" data-wl-as="${k}" aria-pressed="${startAs === k}" title="${esc(line)}" data-tip-icon="option">${esc(name)}</button>`).join('')}</div>`;
const placeRows = () =>
  `<div class="wl-pls">${PREFS['switch:place'].choices!.map(([v, label, tip]) => {
    const on = pref('switch:place') === v, rec = v === 'slots';
    return `<button class="wl-pl${on ? ' on' : ''}" data-wl-place="${esc(String(v))}" aria-pressed="${on}" title="${esc(String(tip) + (rec ? '\n\nRecommended.' : ''))}" data-tip-icon="move"><span class="wl-bar">${placeBar(String(v))}</span><span class="tx">${esc(PLACE_AT[String(v)]?.[1] || String(label))}</span>${rec ? '<small class="wl-rec">recommended</small>' : ''}</button>`;
  }).join('')}</div>`;

function needs(hint: string) {
  return hint.replace(/^.*?\bneeds\s+/, 'needs ').replace(/:\s+(\S+)\.?$/, ' · $1').replace(/\.$/, '');
}
function agentRows() {
  if (!agents) return '<div class="wl-dim">looking…</div>';
  const last = chatsOn().length === 1;
  return agents
    .map((a) => {
      const [m, c] = MARK[a.id] || ['•', ''], name = a.name.replace(/ Agent$/, ''), can = Object.hasOwn(MARK, a.id), on = !can || chatOn(a.id), lock = can && on && last;
      const tip = lock ? `${name}: in use\nAt least one agent stays on.` : on ? `${name}: in use\n${name} shows in every new agent menu, tile and picker. Click to hide it from all of them.` : `${name}: off\n${name} is hidden from every new agent menu, tile and picker. Click to use it ${a.version ? 'again' : 'once it is installed'}.`;
      const sw = can ? `<button class="wl-sw${on ? ' on' : ''}" data-wl-agent="${esc(a.id)}" role="switch" aria-checked="${on}" aria-label="use ${esc(name)}" title="${esc(tip)}" data-tip-icon="agent"${lock ? ' aria-disabled="true"' : ''}></button>` : '<span></span>';
      const st = a.version ? `<span class="wl-ok">✓ found${a.id === 'claude' ? '' : ' · ' + esc(a.version)}</span>` : '<span class="wl-dim">not found</span>';
      return `<div class="wl-ag${on ? '' : ' wl-off'}">${sw}<span class="wl-an"><i style="${c ? 'color:' + c : ''}">${m}</i>${esc(a.name.replace(/ Agent$/, ''))}</span><span class="wl-hint">${a.version ? '' : esc(needs(a.hint))}</span>${st}</div>`;
    })
    .join('');
}

const dirKey = (p: string) => String(p || '').trim().replace(/[\\/]+/g, '/').replace(/\/$/, '').toLowerCase();
const inside = (p: string, of: string) => dirKey(p) === dirKey(of) || dirKey(p).startsWith(dirKey(of) + '/');
const owned = (): Place[] => [...made, ...known.filter((w) => !w.missing && !made.some((m) => m.key === w.id)).map((w) => ({ key: w.id, name: w.name, path: w.path, draft: false }))];
const allPlaces = () => [...drafts, ...owned()];
const placeAt = (key: string) => (key ? allPlaces().find((w) => w.key === key) || null : null);
const placeOf = (path: string) => {
  const k = places.get(path) ?? dflt;
  return placeAt(k) ? k : allPlaces()[0]?.key || '';
};
const placeName = (key: string) => placeAt(key)?.name || 'no workspace yet';
const tickedPaths = () => (projects || []).map((p) => p.path).filter((p) => ticked.has(p));
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function startSays() {
  const paths = tickedPaths(), by = new Map<string, number>();
  for (const p of paths) by.set(placeOf(p), (by.get(placeOf(p)) || 0) + 1);
  const parts = drafts.map((d) => `makes ${d.name} (${plural(by.get(d.key) || 0, 'project')})`);
  for (const w of owned()) if (by.get(w.key)) parts.push(`adds ${plural(by.get(w.key)!, 'project')} to ${w.name}`);
  if (by.get('')) return `${plural(by.get('')!, 'ticked project')} need${by.get('') === 1 ? 's' : ''} a workspace: make one in step 1.`;
  return parts.length ? `Start ${andList(parts)}.` : 'Start brings in no projects. You can add them later inside a workspace.';
}

function projectRows() {
  const n = projects ? projects.length + more : 0, t = tickedPaths().length;
  const line = !projects ? 'looking for the folders you worked in…' : n ? `${plural(n, 'folder')} where you've worked with an agent · ${t} ticked${drafts.length ? ` · ${plural(drafts.length, 'new workspace')}` : ''}` : `No agent history found${already ? ` · ${already} already here` : ''}. You can add folders by hand.`;
  const says = startSays();
  return `<div class="wl-pjs"><div class="wl-pjs-l"><span class="wl-pjs-n">${esc(line)}</span><span class="wl-says">${esc(says)}</span></div><button class="wl-setup" data-wl-setup title="Set up workspaces and projects&#10;Make workspaces for the projects that belong together, and choose where each found folder goes." data-tip-icon="workspaces"><span class="tx">set up workspaces and projects</span><span aria-hidden="true">›</span></button></div>`;
}

function wsCard(w: Place) {
  const n = tickedPaths().filter((p) => placeOf(p) === w.key).length;
  return `<div class="wl-ws${w.draft ? '' : ' old'}" data-wl-ws="${esc(w.key)}"><b>${esc(w.name)}</b><span class="wl-wsp">${esc(w.path)}</span><span class="wl-wsn">${esc(w.draft ? `${plural(n, 'project')} going in · new` : `already yours${n ? ` · ${plural(n, 'more project')} going in` : ''}`)}</span>${w.draft ? `<button class="wl-x wl-wsm" data-wl-wsmenu="${esc(w.key)}" aria-label="rename or remove">⋯</button>` : ''}</div>`;
}
function wsStep() {
  const list = allPlaces();
  return `<div class="wl-ex"><p>A <b>workspace</b> holds the projects that belong together, like <i>Games</i>, <i>Work</i> or <i>Studies</i>. Your projects stay in their own folders: a workspace only lines them up, so you switch between them in one place.</p><p class="wl-dim">Every project goes in a workspace: make at least one for the folders you bring in. Nothing is made until you press start.</p></div>
  <div class="wl-wss">${list.map(wsCard).join('')}<button class="wl-ws new" data-wl-newws title="New workspace&#10;A workspace holds related project folders. It is made when you press start."><span aria-hidden="true">+</span> new workspace</button></div>
  ${list.length ? '' : '<div class="wl-dim wl-none">No workspace yet. Make one to bring in your projects; with none, start brings in no projects.</div>'}`;
}

const newWs = `<button class="wl-link wl-newws" data-wl-newws title="New workspace&#10;Makes one more workspace to put projects in. It is made when you press start." data-tip-icon="workspaces">+ new workspace</button>`;
function projectStep() {
  const ex = `<div class="wl-ex"><p>${projects && !projects.length ? "Amethyst didn't find folders you've worked in with an agent. Add a project folder below, and choose where it goes." : "Amethyst found these folders, where you've worked with an agent. Tick the ones you want, and choose where each goes."}</p><p class="wl-dim">You can add projects later too, from inside a workspace.</p></div>`;
  const add = `<button class="wl-link" data-wl-addfolder>+ add a folder…</button>${newWs}`;
  if (!projects) return ex + '<div class="wl-imp"><div class="wl-dim">looking…</div></div>';
  if (!projects.length) return ex + `<div class="wl-imp"><div class="wl-dim">No agent history yet${already ? ` · ${already} already here` : ''}.</div>${add}</div>`;
  const all = projects.every((p) => ticked.has(p.path));
  const head = `<div class="wl-ih"><label><input type="checkbox" data-wl-all ${all ? 'checked' : ''}>every folder</label>${newWs}<button class="wl-link wl-allin" data-wl-allin>put all ticked in ▾</button><small>${projects.length + more} found${already ? ` · ${already} already here` : ''}</small></div>`;
  const rows = projects
    .map((p) => {
      const k = placeOf(p.path), on = ticked.has(p.path);
      return `<label class="wl-pj${on ? '' : ' wl-un'}" title="${esc(p.path)}" data-tip-mono data-tip-cut=".wl-path"><input type="checkbox" data-wl-pj="${esc(p.path)}" ${on ? 'checked' : ''} title="Bring it in&#10;Brings this folder into Amethyst when you press start. Nothing in the folder changes."><span class="wl-path">${esc(p.path)}</span>${p.agents.map((a) => `<i class="wl-tag" title="${esc(a)}&#10;You've used it in this folder.">${esc(a)}</i>`).join('')}<span class="wl-ago">${p.last ? esc(ago(p.last)) : ''}</span><button class="wl-to${k ? ' in' : ''}${placeAt(k)?.draft ? ' new' : ''}" data-wl-to="${esc(p.path)}" title="${esc(`Workspace: ${placeName(k)}\nWhere this project goes. Click to choose its workspace.`)}"><span class="tx">${esc(placeName(k))}</span><span aria-hidden="true">▾</span></button></label>`;
    })
    .join('');
  return `${ex}<div class="wl-imp">${head}<div class="wl-list">${rows}</div>${more ? `<div class="wl-dim wl-more">and ${more} older, not listed</div>` : ''}<button class="wl-link" data-wl-addfolder>+ add a folder…</button></div>`;
}

function wizard() {
  const says = startSays(), step = (v: 'ws' | 'pj', n: number, label: string) => `<button class="wl-step${view === v ? ' on' : ''}" data-wl-view="${v}" aria-current="${view === v ? 'step' : 'false'}"><b>${n}</b><span class="tx">${label}</span></button>`;
  return `<div class="wl-page wl-wiz" role="dialog" aria-modal="true" aria-label="Your workspaces and projects"${pageH ? ` style="height:${pageH}px"` : ''}>
    <div class="wl-top"><div class="wl-hd"><h2>Your workspaces and projects</h2><div class="wl-steps">${step('ws', 1, 'make your workspaces')}<span class="wl-dim" aria-hidden="true">›</span>${step('pj', 2, 'put your projects in them')}</div></div><div class="wl-sub">${view === 'ws' ? 'Step 1 of 2. Then you choose which projects go in each.' : 'Step 2 of 2. Add more workspaces here or in step 1.'} Going back keeps everything here. Nothing is made until you press start.</div></div>
    <div class="wl-scroll">${view === 'ws' ? wsStep() : projectStep()}</div>
    <div class="wl-says wl-says-w">${esc(says)}</div>
    <div class="wl-foot"><button class="wl-later" data-wl-back title="${view === 'ws' ? 'Back to welcome&#10;Back to the welcome page. What you made here stays.' : 'Back to step 1&#10;Back to your workspaces. Your ticks and choices here stay.'}" data-tip-keys="=esc:back"><span class="tx">${view === 'ws' ? '‹ back to welcome' : '‹ back to step 1'}</span></button><button class="wl-go" data-wl-next title="${view === 'ws' ? 'Next: your projects&#10;On to step 2: choose where each project goes.' : 'Keep, back to welcome&#10;Keeps what you set up here and goes back to the welcome page. Nothing is made until you press start there.'}" data-tip-keys="=ctrl+enter:${view === 'ws' ? 'next' : 'keep'}"><span class="tx">${view === 'ws' ? 'next: your projects ›' : 'keep, back to welcome ›'}</span><kbd>ctrl enter</kbd></button></div>
  </div>`;
}

function wrongWs(name: string, dir: string, except = '') {
  const others = allPlaces().filter((w) => w.key !== except);
  const twin = name && others.find((w) => w.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (twin) return `There's already a workspace named “${twin.name}”: pick another name`;
  if (!dir) return '';
  const same = others.find((w) => dirKey(w.path) === dirKey(dir));
  if (same) return `That folder already is the workspace “${same.name}”: pick another folder`;
  const pj = (projects || []).find((p) => inside(dir, p.path));
  if (pj) return `That folder is inside the project ${pj.path}: a workspace's folder sits outside its projects`;
  return '';
}
async function newDraft(over: Element | null, old?: Place): Promise<Place | null> {
  let name = old?.name || '', at = old ? { name: old.name, path: old.path } : undefined;
  for (;;) {
    const r = await askWorkspace("One place for the projects that belong together: *Games*, *Work*, *Studies*. It's made when you press start on the welcome page.", name, (dir) => wrongWs('', dir, old?.key), at);
    if (!r) return null;
    const wrong = wrongWs(r.name, r.path, old?.key);
    if (!wrong && old) {
      old.name = r.name.trim() || old.name;
      old.path = r.path;
      return old;
    }
    if (!wrong) {
      const d: Place = { key: `draft:${++draftN}`, name: r.name.trim() || r.path.split(/[\\/]/).filter(Boolean).pop() || 'Workspace', path: r.path, draft: true };
      drafts.push(d);
      return d;
    }
    tell(over || el, { title: wrong, ms: 4000 });
    name = r.name;
    at = { name: r.name, path: r.path };
  }
}
function placeMenu(over: HTMLElement, paths: string[]) {
  const cur = paths.length === 1 ? placeOf(paths[0]) : null, r = over.getBoundingClientRect();
  const item = (key: string, name: string, d: string) => `<button class="mi${cur === key ? ' on' : ''}" data-wt="${esc(key)}"><span class="mi-n">${esc(name)}</span><span class="d">${esc(d)}</span></button>`;
  const html = `<div class="mh"><span class="mh-n">where ${paths.length === 1 ? 'it goes' : `${plural(paths.length, 'project')} go`}</span></div>` + drafts.map((w) => item(w.key, w.name, 'new · made at start')).join('') + owned().map((w) => item(w.key, w.name, 'already yours')).join('') + `<div class="sep"></div><button class="mi" data-wt-new><span class="mi-n">+ new workspace…</span></button>`;
  popMenu(r.left, r.bottom + 2, html, async (b) => {
    let key = b.dataset.wt;
    if ('wtNew' in b.dataset) key = (await newDraft(over))?.key;
    if (key == null) return;
    for (const p of paths) {
      places.set(p, key);
      ticked.add(p);
    }
    draw();
  });
}
function draftMenu(key: string, x: number, y: number) {
  const d = drafts.find((w) => w.key === key);
  if (!d) return;
  const row = (k: string, ic: string, label: string, tip: string) => `<button class="mi" data-dm="${k}" title="${label}&#10;${tip}"><i class="tb-ic">${ic}</i><span class="mi-n">${label}</span></button>`;
  const html = menuHead(ICONS.workspaces, d.name) + bands({ actions: row('change', ICONS.rename, 'change name or folder…', 'Picks another name or another folder for the workspace.') + row('remove', ICONS.unlist, 'remove', 'Its projects go to another workspace.') });
  popMenu(x, y, html, async (b) => {
    if (b.dataset.dm === 'remove') {
      drafts = drafts.filter((w) => w.key !== key);
      for (const [p, k] of places) if (k === key) places.set(p, '');
      return draw();
    }
    if (await newDraft(el?.querySelector(`[data-wl-ws="${CSS.escape(key)}"]`) || el, d)) draw();
  });
}
function go(to: 'main' | 'ws' | 'pj') {
  if (!el) return;
  if (to !== 'main') pageH ||= el.querySelector<HTMLElement>('.wl-page')!.getBoundingClientRect().height;
  view = to;
  untipIn(el);
  tell(null);
  draw();
  el.querySelector<HTMLElement>(to === 'main' ? '[data-wl-setup]' : '[data-wl-next]')?.focus();
}

const engName = (e: Engine) => (/^\d/.test(e.id) ? 'UE ' + e.id : 'UE (source)');
function unrealRows() {
  const list = engines === null ? '<div class="wl-dim">looking…</div>' : engines.length ? engines.map((e) => `<div class="wl-eng"><b>${esc(engName(e))}</b><span>${esc(e.dir)}</span>${e.from === 'added' ? `<button class="wl-x" data-wl-ueremove="${esc(e.dir)}" aria-label="remove">×</button>` : ''}</div>`).join('') : '<div class="wl-dim">no engine found</div>';
  return `<div class="wl-ue"><button class="wl-sw${ueOn ? ' on' : ''}" data-wl-ue role="switch" aria-checked="${ueOn}" aria-label="Unreal Engine 5 support"></button><span class="tx"><b>Unreal Engine 5 support</b> <span class="wl-dim">· build button, build window, C++ help</span></span></div><div class="wl-engs">${list}<button class="wl-link" data-wl-ueadd title="Add an engine folder&#10;Adds an Unreal Engine you copied by hand and never registered, so the app can build with it." data-tip-icon="folder">+ add an engine folder…</button></div>`;
}

const row = (label: string, body: string, extra = '') => `<div class="wl-row"><div class="wl-lbl">${label}${extra}</div><div class="wl-body">${body}</div></div>`;

const countPick = (on: boolean, label: string) => `<button class="chip${pick === on ? ' on' : ''}" data-wl-count="${on ? '1' : ''}" aria-pressed="${pick === on}">${label}</button>`;
const countRows = () =>
  `<div class="wl-ct"><div class="wl-ct-q"><span class="tx"><b>${esc(COUNT.ask)}</b> <span class="wl-ct-s">${esc(COUNT.short)}</span></span></div>` +
  `<div class="wl-ct-pick"><button class="chip wl-ct-more" data-wl-ctpop title="What's sent&#10;Opens a small box with what the app sends, and the yes or no." data-tip-icon="info">what's sent ›</button>${countPick(true, 'Yes, count me')}${countPick(false, 'No thanks')}</div></div>`;
const countPop = () => {
  const n = countNow();
  if (!ctPop || !n) return '';
  return `<div class="wl-pop" data-wl-popout><div class="wl-popbox" role="dialog" aria-modal="true" aria-label="${esc(COUNT.ask)}"><div class="wl-pophd"><h3>${esc(COUNT.ask)}</h3><button class="wl-x" data-wl-popx aria-label="close" title="Close&#10;Closes this box. Nothing is chosen." data-tip-keys="=esc:close">×</button></div><div class="wl-popbd">${countDetails(n)}</div><div class="wl-popft">${countPick(false, 'No thanks')}${countPick(true, 'Yes, count me')}</div></div></div>`;
};
function popCount(on: boolean) {
  if (!el) return;
  ctPop = on;
  untipIn(el);
  draw();
  el.querySelector<HTMLElement>(on ? '.wl-popbox [data-wl-count]' : '[data-wl-ctpop]')?.focus();
}
const showCount = () => hasCount() && !!countNow();

function draw() {
  if (!el) return;
  const top = el.querySelector('.wl-scroll')?.scrollTop || 0;
  el.classList.toggle('wl-one', one);
  if (one) {
    const more = countMore('welcome');
    el.innerHTML = `<div class="wl-page" role="dialog" aria-modal="true" aria-label="${esc(COUNT.ask)}">
    <div class="wl-top"><h2>${esc(COUNT.ask)}</h2><div class="wl-sub wl-ct-q"><span class="tx">${esc(COUNT.short)}</span>${countTog('welcome')}</div></div>
    ${more ? `<div class="wl-scroll">${more}</div>` : ''}
    <div class="wl-foot"><span class="wl-dim">asked once · it stays in settings → updates</span><div class="wl-ct-pick">${countPick(false, 'No thanks')}${countPick(true, 'Yes, count me')}</div></div>
  </div>`;
    return;
  }
  if (view !== 'main') {
    el.innerHTML = wizard();
    const sc = el.querySelector('.wl-scroll');
    if (sc) sc.scrollTop = top;
    return;
  }
  el.innerHTML = `<div class="wl-page" role="dialog" aria-modal="true" aria-label="Welcome to Amethyst"${pageH ? ` style="height:${pageH}px"` : ''}>
    <div class="wl-top"><div class="wl-hd"><h2>Welcome to Amethyst</h2>${startRows()}</div><div class="wl-sub">A few things, then you're in. All of them stay in settings.</div></div>
    <div class="wl-scroll">
      ${row('Theme', themeCards('data-wl-theme'))}
      ${row('Mode buttons', placeRows())}
      ${row('Agents', agentRows(), `<div class="wl-agq">tick the ones you'll use, installed or not</div><button class="wl-again" data-wl-again title="Look again&#10;Looks for the agents again, for one you installed after the app started." data-tip-icon="history">↻ look again</button>`)}
      ${row('Projects', projectRows())}
      ${row('Unreal', unrealRows())}
      ${showCount() ? row('Count', countRows()) : ''}
    </div>
    <div class="wl-foot"><button class="wl-later" data-wl-later title="Set up later&#10;Closes this page and keeps the app as it is.&#10;&#10;The Welcome page row in Settings, General brings it back." data-tip-set="general:g:wl" data-tip-icon="close"><span class="tx">set up later</span></button><button class="wl-go" data-wl-start ${busy ? 'disabled' : ''} title="Start&#10;Keeps these choices, makes the workspaces you set up, and brings in the ticked folders, each where you put it." data-tip-keys="=ctrl+enter:start" data-tip-icon="check"><span class="tx">${busy ? 'starting…' : 'start'}</span><kbd>ctrl enter</kbd></button></div>
  </div>${countPop()}`;
  const sc = el.querySelector('.wl-scroll');
  if (sc) sc.scrollTop = top;
}

function tickFound() {
  const now = new Set(agents!.filter((a) => a.version).map((a) => a.id)), was = found;
  found = now;
  const mine = CHATS.map(([k]) => k).filter((k) => !hand.has(k));
  if (!was) {
    if (!first) return;
    const off = mine.filter((k) => !now.has(k));
    for (const k of mine) setOff('agents:off', k, off.includes(k) && (now.size > 0 || k !== CHATS[0][0]));
    return;
  }
  for (const k of mine) if (now.has(k) && !was.has(k)) setOff('agents:off', k, false);
}
async function lookAgents(again = false) {
  try {
    agents = (await api('GET', '/api/agents' + (again ? '?again=1' : ''))).agents;
    tickFound();
  } catch (e) {
    agents = [];
    showErr(e);
  }
  draw();
}
async function lookProjects() {
  try {
    const r = await api('GET', '/api/welcome');
    projects = r.projects;
    more = r.more || 0;
    already = r.already || 0;
    ticked = new Set(projects!.filter((p) => Date.now() - p.last < FRESH).map((p) => p.path));
  } catch (e) {
    projects = [];
    showErr(e);
  }
  draw();
}
async function lookEngines(body: Record<string, unknown> = {}) {
  try {
    engines = (await api('POST', '/api/ue/engines', body)).engines;
    if (!wasSet('ue:on') && engines!.length && !body.remove) ueOn = true;
  } catch (e) {
    if (engines === null) engines = [];
    showErr(e);
  }
  draw();
}

export function openWelcome(fresh = false) {
  if (el && !one) return;
  if (el) close();
  one = false;
  first = fresh;
  if (fresh && !wasSet('switch:place')) setPref('switch:place', 'slots');
  ctPop = false;
  startAs = fresh ? 'basics' : null;
  hand = new Set();
  found = null;
  pageH = 0;
  toggleCountMore('welcome', false);
  pick = countNow()?.on ?? null;
  agents = projects = engines = null;
  more = already = 0;
  view = 'main';
  drafts = [];
  made = [];
  places = new Map();
  known = [...S.workspaces];
  dflt = !atLaunch() && known.some((w) => w.id === S.wid) ? S.wid : '';
  busy = false;
  ueOn = !!pref('ue:on');
  el = Object.assign(document.createElement('div'), { id: 'welcome' });
  document.body.append(el);
  draw();
  el.querySelector<HTMLElement>('.wl-card.on, .wl-card')?.focus();
  lookAgents();
  lookProjects();
  lookEngines();
  lookWorkspaces();
}
async function lookWorkspaces() {
  try {
    known = (await api('GET', '/api/workspaces', undefined, '', '')).workspaces;
  } catch (e) {
    return showErr(e);
  }
  if (!atLaunch() && known.some((w) => w.id === S.wid)) dflt = S.wid;
  draw();
}

function close() {
  if (el) untipIn(el);
  el?.remove();
  el = null;
}

function openCount() {
  if (el) return;
  one = true;
  toggleCountMore('welcome', false);
  pick = null;
  el = Object.assign(document.createElement('div'), { id: 'welcome' });
  document.body.append(el);
  draw();
  el.querySelector<HTMLElement>('[data-wl-count]')?.focus();
}
function answer(on: boolean) {
  pick = on;
  if (!one) return ctPop ? popCount(false) : draw();
  setCount({ on });
  close();
}
onCount(() => el && draw());

async function leave(start: boolean) {
  if (busy) return;
  busy = true;
  draw();
  try {
    if (start && showCount() && pick === null) {
      busy = false;
      draw();
      const r = el?.querySelector<HTMLElement>('.wl-ct');
      r?.scrollIntoView({ block: 'nearest' });
      tell(r || el, { title: 'Pick yes or no under Count', ms: 2500 });
      return;
    }
    if (startAs && (start || first)) startWith(startAs === 'basics');
    if (start) {
      if (showCount()) await setCount({ on: pick });
      setPref('ue:on', ueOn);
      const paths = tickedPaths(), groups = new Map<string, string[]>(), used = new Set<string>();
      if (paths.some((p) => !placeOf(p))) {
        busy = false;
        draw();
        tell(el?.querySelector('[data-wl-start]') || el, { title: 'Your ticked projects need a workspace', line: 'make one in set up workspaces and projects, or untick them', ms: 4000 });
        return;
      }
      for (const d of [...drafts]) {
        let w;
        try {
          w = await api('POST', '/api/workspace', { name: d.name, path: d.path }, '', '');
        } catch (e) {
          throw new Error(`the new workspace “${d.name}” can't be made at ${d.path}: ${(e as Error).message}. Change its folder from its card (⋯), then start again`);
        }
        made.push({ key: w.id, name: w.name, path: w.path, draft: false });
        drafts = drafts.filter((x) => x !== d);
        for (const [p, k] of places) if (k === d.key) places.set(p, w.id);
        if (dflt === d.key) dflt = w.id;
        used.add(w.id);
      }
      for (const p of paths) groups.set(placeOf(p), [...(groups.get(placeOf(p)) || []), p]);
      const failed: { path: string; error: string }[] = [];
      let added = 0;
      for (const [k, list] of groups) {
        const r = await api('POST', '/api/welcome/import', { paths: list, workspace: k || null }, '', '');
        failed.push(...(r.failed || []));
        added += r.added?.length || 0;
        if (k && r.added?.length) used.add(k);
      }
      if (failed.length) notify(`Not brought in: ${failed.map((f) => `<code>${esc(f.path)}</code> (${esc(f.error)})`).join(', ')}`, { ms: 15000 });
      if (added || made.length) reloadAll();
      const into = atLaunch() && used.size === 1 ? [...used][0] : '';
      if (into) switchWorkspace(into);
    }
    await api('PUT', '/api/welcome', { welcomed: true }, '', '');
    if (!start && showCount()) await setCount({ asked: true });
    const tour = first;
    close();
    if (tour) tourDue();
  } catch (e) {
    busy = false;
    draw();
    showErr(e);
  }
}

async function addFolder() {
  const dir = desk?.pickFolder ? await desk.pickFolder({ title: 'a project folder to bring in' }) : await ask({ title: 'a project folder', text: 'Its full path.', placeholder: 'G:\\Projects\\Game' });
  if (!dir) return;
  const p = String(dir).trim();
  if (!projects) projects = [];
  if (!projects.some((x) => x.path.toLowerCase() === p.toLowerCase())) projects.unshift({ path: p, agents: [], last: Date.now() });
  ticked.add(p);
  draw();
}

async function addEngine() {
  const dir = desk?.pickFolder ? await desk.pickFolder({ title: 'the Unreal Engine folder (the one with Engine in it)' }) : await ask({ title: 'Unreal Engine folder', text: 'Its full path: the folder with Engine in it.', placeholder: 'E:\\Unreal Engine\\UE_5.7' });
  if (dir) lookEngines({ add: String(dir) });
}

document.addEventListener('click', (e) => {
  if (!el) return;
  const t = e.target as HTMLElement, at = (sel: string) => t.closest<HTMLElement>(sel);
  let b: HTMLElement | null;
  if ((b = at('[data-wl-count]'))) answer(!!b.dataset.wlCount);
  else if (at('[data-wl-ctpop]')) popCount(true);
  else if (at('[data-wl-popx]') || t.matches('[data-wl-popout]')) popCount(false);
  else if (ctPop) return;
  else if (at('[data-ct-more]')) {
    if (!one) pageH ||= el.querySelector<HTMLElement>('.wl-page')!.getBoundingClientRect().height;
    toggleCountMore('welcome');
    draw();
    el.querySelector('.ct-more')?.scrollIntoView({ block: 'nearest' });
    el.querySelector<HTMLElement>('[data-ct-more]')?.focus();
  } else if ((b = at('[data-wl-as]'))) {
    startAs = b.dataset.wlAs as 'basics' | 'all';
    draw();
    el.querySelector<HTMLElement>(`[data-wl-as="${startAs}"]`)?.focus();
  } else if ((b = at('[data-wl-place]'))) {
    setPref('switch:place', b.dataset.wlPlace!);
    draw();
    el.querySelector<HTMLElement>(`[data-wl-place="${b.dataset.wlPlace}"]`)?.focus();
  } else if ((b = at('[data-wl-theme]'))) {
    useTheme(b.dataset.wlTheme!);
    draw();
    el.querySelector<HTMLElement>(`[data-wl-theme="${b.dataset.wlTheme}"]`)?.focus();
  } else if (at('[data-wl-again]')) {
    agents = null;
    draw();
    lookAgents(true);
  } else if (at('[data-wl-setup]')) go('ws');
  else if ((b = at('[data-wl-view]'))) go(b.dataset.wlView as 'ws' | 'pj');
  else if (at('[data-wl-back]')) go(view === 'pj' ? 'ws' : 'main');
  else if (at('[data-wl-next]')) go(view === 'ws' ? 'pj' : 'main');
  else if ((b = at('[data-wl-newws]'))) newDraft(b).then((d) => d && (draw(), el?.querySelector<HTMLElement>('[data-wl-newws]')?.focus()));
  else if ((b = at('[data-wl-wsmenu]'))) {
    const r = b.getBoundingClientRect();
    draftMenu(b.dataset.wlWsmenu!, r.left, r.bottom + 2);
  } else if ((b = at('[data-wl-to]'))) {
    e.preventDefault();
    placeMenu(b, [b.dataset.wlTo!]);
  } else if ((b = at('[data-wl-allin]'))) {
    if (!tickedPaths().length) return tell(b, { title: 'Tick some folders first', line: 'then choose one place for all of them', ms: 2500 });
    placeMenu(b, tickedPaths());
  } else if (at('[data-wl-addfolder]')) addFolder();
  else if ((b = at('[data-wl-agent]'))) {
    if (b.ariaDisabled === 'true') return tell(b, { title: 'At least one agent stays on', line: 'turn another one on first', ms: 2500 });
    hand.add(b.dataset.wlAgent!);
    setOff('agents:off', b.dataset.wlAgent!, chatOn(b.dataset.wlAgent!));
    draw();
    el.querySelector<HTMLElement>(`[data-wl-agent="${b.dataset.wlAgent}"]`)?.focus();
  } else if (at('[data-wl-ue]')) {
    ueOn = !ueOn;
    draw();
    el.querySelector<HTMLElement>('[data-wl-ue]')?.focus();
  } else if (at('[data-wl-ueadd]')) addEngine();
  else if ((b = at('[data-wl-ueremove]'))) lookEngines({ remove: b.dataset.wlUeremove });
  else if (at('[data-wl-later]')) leave(false);
  else if (at('[data-wl-start]')) leave(true);
});

document.addEventListener('contextmenu', (e) => {
  if (!el) return;
  const c = (e.target as HTMLElement).closest<HTMLElement>('#welcome [data-wl-ws]');
  if (!c || !drafts.some((w) => w.key === c.dataset.wlWs)) return;
  e.preventDefault();
  draftMenu(c.dataset.wlWs!, e.clientX, e.clientY);
});

document.addEventListener('change', (e) => {
  if (!el) return;
  const t = e.target as HTMLInputElement;
  if (t.dataset.wlPj != null) t.checked ? ticked.add(t.dataset.wlPj) : ticked.delete(t.dataset.wlPj);
  else if ('wlAll' in t.dataset) ticked = new Set(t.checked ? (projects || []).map((p) => p.path) : []);
  else return;
  draw();
  el.querySelector<HTMLElement>(t.dataset.wlPj != null ? `[data-wl-pj="${CSS.escape(t.dataset.wlPj)}"]` : '[data-wl-all]')?.focus();
});

addEventListener(
  'keydown',
  (e) => {
    if (!el || !document.getElementById('keys')?.hidden) return;
    if (one) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        answer(false);
      }
      return;
    }
    if (document.getElementById('colormenu')?.hidden === false) return;
    if (ctPop) {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') popCount(false);
      }
      return;
    }
    if (e.key === 'Escape' && document.getElementById('modal')?.hidden !== false) {
      e.preventDefault();
      e.stopPropagation();
      if (view !== 'main') return go(view === 'pj' ? 'ws' : 'main');
      return leave(false);
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (view !== 'main' && document.getElementById('modal')?.hidden === false) return;
      e.preventDefault();
      e.stopPropagation();
      if (view !== 'main') return go(view === 'ws' ? 'pj' : 'main');
      leave(true);
    }
  },
  true,
);

if (!POP && WIN === 1)
  api('GET', '/api/welcome?status=1', undefined, '', '').then(
    (r) =>
      countReady.then((u) => {
        if (r.welcomed === false) return openWelcome(true);
        if (u && !u.dev && u.on === null && !u.asked) openCount();
      }),
    () => {},
  );
