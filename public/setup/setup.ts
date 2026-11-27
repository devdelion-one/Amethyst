import { ask, offClasses, popMenu } from '../base/controls.ts';
import { api, atLaunch, levelKey } from '../base/model.ts';
import { openExternal } from '../app/tabs.ts';
import { $, esc, setSave, showErr, store } from '../base/util.ts';
import { chatOn, chatsOn, onPref } from '../base/prefs.ts';

const AGENTS = [['claude', 'Claude'], ['codex', 'Codex'], ['antigravity', 'Antigravity'], ['cursor', 'Cursor'], ['copilot', 'Copilot'], ['grok', 'Grok']];
const U: { key: string | null; info: any; agent: string } = { key: null, info: null, agent: store.get('setup:agent', 'claude') };
const panel = $('#setup');
const shown = () => {
  const a = $('#app');
  return !document.documentElement.classList.contains('xwin') && !a.classList.contains('ws') && !a.classList.contains('launch') && !a.classList.contains('side-hidden') && a.classList.contains('setup');
};
const nameOf = () => AGENTS.find(([k]) => k === U.agent)?.[1] || U.agent;
const base = (p: string) => p.split(/[\\/]/).pop()!;

let seq = 0;
async function load() {
  if (!chatOn(U.agent)) U.agent = chatsOn()[0][0];
  const n = ++seq, agent = U.agent;
  let info: any;
  try {
    info = await api('GET', '/api/setup?agent=' + agent);
  } catch (e) {
    info = { error: (e as Error).message };
  }
  if (n !== seq || agent !== U.agent) return;
  U.info = info;
  draw();
}
export function refreshSetup() {
  if (shown()) load();
}
export function renderSetup() {
  const key = atLaunch() ? '' : levelKey();
  if (key === U.key) return;
  U.key = key;
  U.info = null;
  draw();
  if (key && shown()) load();
}

type Scope = 'global' | 'project';
const tag = (w: Scope) => `<span class="su-sc ${w}">${w}</span>`;
const whose = (w: Scope, kind: string) => {
  const a = U.info?.account;
  if (!a || !kind || (w !== 'global' && kind !== 'memory')) return '';
  return a.shared?.[kind] ? (a.share === 'main' ? "It is the main account's, shared with added accounts." : 'It is shared with the main account.') : `Only ${a.name} uses it.`;
};
const row = (w: Scope, abs: string, name: string, hint = '', del = '', about = '', kind = '') =>
  `<div class="su-r" data-su-open="${esc(abs)}" title="${esc([abs, about, `${whose(w, kind) ? whose(w, kind) + ' ' : ''}Click to open it.`].filter(Boolean).join('\n'))}"${about || whose(w, kind) ? '' : ' data-tip-mono'}>${tag(w)}<span class="nm">${esc(name)}</span>${hint ? `<span class="d">${esc(hint)}</span>` : ''}${del}</div>`;
const delBtn = (attrs: string, what: string) => `<button class="su-x" ${attrs} aria-label="remove ${esc(what)}">×</button>`;
const make = (w: Scope, attrs: string, word: string, where = '') =>
  `<div class="su-r su-make" ${attrs}>${tag(w)}<span class="nm">${esc(word)}</span>${where ? `<span class="d">${esc(where)}</span>` : ''}</div>`;
const none = (w: Scope, word: string) => `<div class="su-r su-none">${tag(w)}<span class="nm">${esc(word)}</span></div>`;
const plus = (attrs: string, tip: string) => `<button class="su-add" ${attrs} aria-label="${esc(tip)}">+</button>`;

const folded = (): string[] => store.get('setup:fold', []);
function section(key: string, count: number, acts: string, rows: string) {
  const shut = folded().includes(key);
  return `<div class="su-sec${shut ? ' shut' : ''}" data-su-sec="${key}"><div class="su-h" data-su-fold="${key}"><span class="su-chev">▾</span><span class="w">${key}</span><span class="su-n">${count}</span><span class="su-acts">${acts}</span></div><div class="su-list">${rows}</div></div>`;
}

function instructions(i: any) {
  const file = (w: Scope, f: any) => (f.exists ? row(w, f.abs, base(f.abs), '', '', '', 'instructions') : make(w, `data-su="file" data-su-w="${f.which}" data-su-f="${esc(base(f.abs))}"`, `create ${base(f.abs)}`));
  const g = i.instructions.find((f: any) => f.which === 'global'), p = i.instructions.find((f: any) => f.which === 'project');
  const gRules = (i.rules || []).map((r: any) => row('global', r.abs, r.name, 'rule', '', '', 'rules'));
  const pRules = (i.projectRules || []).map((r: any) => row('project', r.abs, r.name, 'rule', '', '', 'rules'));
  const rows = [g ? file('global', g) : '', ...gRules, p ? file('project', p) : none('project', i.project ? 'none for this agent' : 'open a project to see its own'), ...pRules];
  const n = (g?.exists ? 1 : 0) + gRules.length + (p?.exists ? 1 : 0) + pRules.length;
  const tip = i.ruleScopes?.project ? 'new rule' : 'new rule, for every project';
  return section('instructions', n, i.hasRules ? plus('data-su="rule"', tip) : '', rows.join(''));
}
function memory(i: any) {
  const m = i.memory;
  if (!m.dir) return section('memory', 0, '', none('project', m.note || (i.project ? 'not known for this agent yet' : 'open a project to see its memory')));
  const clear = m.files.length ? `<button class="su-clear" data-su="clear">clear</button>` : '';
  const rows = m.files.map((f: any) => row('project', f.abs, f.name, f.name === 'MEMORY.md' ? 'the index' : '', delBtn(`data-su="del-mem" data-su-n="${esc(f.name)}"`, `memory ${f.name}`), '', 'memory')).join('');
  const first = m.files.length ? '' : make('project', 'data-su="file" data-su-w="memory"', 'create memory', 'MEMORY.md');
  return section('memory', m.files.length, clear + plus('data-su="memory"', 'new memory, for this project'), first + rows);
}
function skills(i: any) {
  const list = (w: Scope) => i.skills[w].list.map((k: any) => row(w, k.abs, k.name, '', delBtn(`data-su="del-skill" data-su-w="${w}" data-su-n="${esc(k.name)}"`, `skill ${k.name}`), k.description || '', 'skills')).join('');
  const own = i.skills.project.dir ? list('project') : none('project', 'open a project to see its own');
  const n = i.skills.global.list.length + i.skills.project.list.length;
  const add = i.skills.global.dir || i.skills.project.dir ? plus('data-su="skill-where"', 'new skill') : '';
  return section('skills', n, add, list('global') + own);
}
function config(i: any) {
  const list = i.configs || [];
  if (!list.length) return '';
  const item = (c: any) => (c.exists ? row(c.which, c.abs, base(c.abs), c.label, '', c.about) : make(c.which, `data-su="file" data-su-w="${c.which}" data-su-k="${esc(c.kind)}" data-su-f="${esc(base(c.abs))}"`, `create ${base(c.abs)}`, c.label));
  const rows = list.map(item);
  if (!i.project) rows.push(none('project', 'open a project to see its own'));
  const n = list.filter((c: any) => c.exists).length;
  return section('config', n, '', rows.join(''));
}
function plugins(i: any) {
  const p = i.plugins;
  if (!p) return '';
  const list = (w: Scope) => p[w].list.map((k: any) => row(w, k.abs, k.name, k.disabled ? 'disabled' : '', delBtn(`data-su="del-plugin" data-su-w="${w}" data-su-n="${esc(k.id)}"`, `plugin ${k.name}`), k.description || '')).join('');
  const own = p.project.dir ? list('project') : none('project', 'open a project to see its own');
  const n = p.global.list.length + p.project.list.length;
  const add = p.global.dir || p.project.dir ? plus('data-su="plugin-where"', 'new plugin') : '';
  return section('plugins', n, add, list('global') + own);
}

export const setupPic = () => `<div class="su-agents">${AGENTS.filter(([k]) => chatOn(k)).slice(0, 2).map(([k, w], i) => `<button class="chip${i ? '' : ' on'}" data-su-agent="${k}">${esc(w)}</button>`).join('')}</div><div class="su-acct"><b>main</b><span class="su-dir">~/.claude</span><span class="su-mode">${SHARE_WORDS.main}</span></div><div class="su-body">${section('memory', 2, `<button class="su-clear" data-su="clear">clear</button>${plus('data-su="pic"', 'new memory')}`, row('project', 'dock-order.md', 'dock-order.md') + row('project', 'themes.md', 'themes.md'))}</div>`;
const SHARE_WORDS: Record<string, string> = { main: 'the main setup', all: 'shared with main', own: 'its own setup' };
function account(i: any) {
  const a = U.agent === 'claude' && U.key && !i?.error ? i?.account : null;
  if (!a) return '<div class="su-acct"></div>';
  const what = a.share === 'own' ? 'It has its own CLAUDE.md, settings, rules, skills and memory.' : a.share === 'all' ? "It uses the main account's CLAUDE.md, settings, rules, skills and memory." : 'Added accounts share its setup, unless set to their own.';
  const tip = `${a.name}\nThe Claude account in use. ${what}\n\nChange it in Settings, Agents and chat, Providers and tools, or in the usage window's account menu.`;
  return `<div class="su-acct" title="${esc(tip)}" data-tip-set="agents"><b>${esc(a.name)}</b><span class="su-dir">${esc(a.dir)}</span><span class="su-mode">${esc(SHARE_WORDS[a.share] || '')}</span></div>`;
}
function draw() {
  const i = U.info;
  const chips = AGENTS.filter(([k]) => chatOn(k)).map(([k, w]) => `<button class="chip ${k === U.agent ? 'on' : ''}" data-su-agent="${k}" title="${esc(w)}\nThe skills, memory and instructions ${esc(w)} uses here." data-tip-icon="agent">${esc(w)}</button>`).join('');
  const body = !U.key ? `<p class="su-empty">open a workspace or a project</p>` : !i ? '' : i.error ? `<p class="su-empty err">${esc(i.error)}</p>` : instructions(i) + memory(i) + skills(i) + config(i) + plugins(i);
  panel.innerHTML = `<div class="su-agents">${chips}</div>${account(i)}<div class="su-body">${body}</div>`;
}

const run = async (call: () => Promise<any>, word?: string) => {
  try {
    const r = await call();
    if (word) setSave(word);
    if (r?.abs) openExternal(r.abs);
  } catch (e) {
    showErr(e);
  }
  load();
};
const post = (url: string, body?: Record<string, unknown>) => api('POST', url, { agent: U.agent, ...body });
async function takeOut(title: string, text: string, body: Record<string, unknown>, word: string) {
  const a = (await ask({ title, text, tick: 'delete forever (from disk, no undo)' })) as any;
  if (a) run(() => post('/api/setup/remove', { ...body, forever: a.tick }), a.tick ? `deleted ${word} for good` : `archived ${word}`);
}
async function newSkill(w: Scope) {
  const name = await ask({ title: `New ${nameOf()} skill`, text: w === 'global' ? 'For every project.' : 'For this project.', placeholder: 'its name, e.g. review-pr' });
  if (name) run(() => post('/api/setup/skill', { where: w, name }));
}
async function newRule(w: Scope) {
  const name = await ask({ title: `New ${nameOf()} rule`, text: w === 'global' ? 'For every project.' : 'For this project.', placeholder: 'its name, e.g. keep-it-short' });
  if (name) run(() => post('/api/setup/rule', { where: w, name }));
}
async function newPlugin(w: Scope) {
  const name = await ask({ title: `New ${nameOf()} plugin`, text: w === 'global' ? 'For every project.' : 'For this project.', placeholder: 'its name, e.g. team-tools' });
  if (name) run(() => post('/api/setup/plugin', { where: w, name }));
}
function pickScope(b: HTMLElement, hasGlobal: boolean, hasProject: boolean, fn: (w: Scope) => unknown) {
  if (!hasProject) return fn('global');
  if (!hasGlobal) return fn('project');
  const r = b.getBoundingClientRect();
  popMenu(r.left, r.bottom + 4, `<button class="mi" data-w="global">for every project</button><button class="mi" data-w="project">for this project</button>`, (m) => fn(m.dataset.w as Scope));
}

const ACTS: Record<string, (b: HTMLElement) => unknown> = {
  'skill-where': (b: HTMLElement) => pickScope(b, !!U.info?.skills?.global?.dir, !!U.info?.skills?.project?.dir, newSkill),
  'plugin-where': (b: HTMLElement) => pickScope(b, !!U.info?.plugins?.global?.dir, !!U.info?.plugins?.project?.dir, newPlugin),
  memory: async () => {
    const name = await ask({ title: 'New memory', text: "Claude reads it in this project; it goes into MEMORY.md, the index.", placeholder: 'its name, e.g. user-prefers-short-answers' });
    if (name) run(() => post('/api/setup/memory', { name }));
  },
  rule: (b: HTMLElement) => pickScope(b, !!U.info?.ruleScopes?.global, !!U.info?.ruleScopes?.project, newRule),
  file: async (b: HTMLElement) => {
    const w = b.dataset.suW, k = b.dataset.suK;
    if (w !== 'memory' && !(await ask({ title: `Create ${b.dataset.suF}?`, text: `For: ${w === 'global' ? 'global user (your whole PC)' : 'this project'}`, confirm: true }))) return;
    run(() => post('/api/setup/file', k ? { which: w, kind: k } : { which: w }));
  },
  'del-skill': (b: HTMLElement) => takeOut(`Remove the skill “${b.dataset.suN}”?`, 'Its whole folder goes to the archive.', { kind: 'skill', where: b.dataset.suW, name: b.dataset.suN }, `skill ${b.dataset.suN}`),
  'del-plugin': (b: HTMLElement) => takeOut(`Remove the plugin “${b.dataset.suN}”?`, 'Its whole folder goes to the archive.', { kind: 'plugin', where: b.dataset.suW, name: b.dataset.suN }, `plugin ${b.dataset.suN}`),
  'del-mem': (b: HTMLElement) => takeOut(`Remove “${b.dataset.suN}” from memory?`, 'It goes to the archive, and its line leaves MEMORY.md.', { kind: 'memory', name: b.dataset.suN }, b.dataset.suN!),
  clear: () => takeOut("Clear this project's memory?", 'All its memory files go to the archive, MEMORY.md too.', { kind: 'memories' }, "this project's memory"),
};

function fold(key: string) {
  const list = folded(), shut = !list.includes(key);
  store.set('setup:fold', shut ? [...list, key] : list.filter((k) => k !== key));
  const sec = panel.querySelector(`[data-su-sec="${key}"]`) as HTMLElement | null;
  sec?.classList.toggle('shut', shut);

}

panel.addEventListener('click', (e: MouseEvent) => {
  const chip = (e.target as Element).closest<HTMLElement>('[data-su-agent]');
  if (chip) {
    store.set('setup:agent', (U.agent = chip.dataset.suAgent!));
    U.info = null;
    draw();
    return load();
  }
  const a = (e.target as Element).closest<HTMLElement>('[data-su]');
  if (a) return ACTS[a.dataset.su!]?.(a);
  const h = (e.target as Element).closest<HTMLElement>('[data-su-fold]');
  if (h) return fold(h.dataset.suFold!);
  const r = (e.target as Element).closest<HTMLElement>('[data-su-open]');
  if (r) openExternal(r.dataset.suOpen!);
});
addEventListener('focus', refreshSetup);
offClasses('setup:off', 'setup');
onPref('agents:off', () => shown() && load());
