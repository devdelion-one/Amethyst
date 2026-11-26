import { ICONS } from '../base/controls.ts';
import { api, S } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { THEMES, themeName } from '../base/theme.ts';
import { esc } from '../base/util.ts';

type Bucket = { at: number; tokens: Record<string, number>; chats: number; commits: number; files: number };
type Model = { id: string; agent: string; tokens: number; cost: number | null };
type Data = {
  range: number;
  unit: 'hour' | 'day';
  buckets: Bucket[];
  models: Model[];
  totals: { tokens: number; cost: number; unpriced: boolean; chats: number; commits: number; files: number };
};
type Answer = Data | { reading: { done: number; total: number } };

const RANGES: [number, string][] = [[1, 'past 24h'], [7, '7 days'], [30, '30 days'], [90, '90 days']];
const win = Object.assign(document.createElement('div'), { id: 'dash-win', className: 'float', hidden: true });
win.setAttribute('role', 'dialog');
win.setAttribute('aria-label', 'dashboard');
document.body.append(win);

let scope: 'project' | 'workspace' = 'project', range = 30, wsName = '', asked = 0, poll = 0, openedAt = 0;

const big = (n: number) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const gb = (n: number) => (n / 1e9).toFixed(1);
const rangeWords = () => (range === 1 ? 'in the past 24 hours' : `in the past ${range} days`);
const projectName = () => S.projects.find((p: any) => p.id === S.pid)?.name || '';
const colors = () => THEMES[themeName()]?.palette || THEMES.ink.palette;

function head() {
  const pn = projectName();
  const seg = (on: boolean, attrs: string, label: string, extra = '') => `<button class="${on ? 'on' : ''}" ${attrs}${extra}>${esc(label)}</button>`;
  return `<div class="dh-head float-head"><img src="amethyst.svg" alt="" draggable="false"><span>dashboard</span>
    <div class="dh-seg dh-scope">${seg(scope === 'project', 'data-dh-scope="project"', pn ? `project: ${pn}` : 'project', pn ? '' : ' aria-disabled="true"')}${seg(scope === 'workspace', 'data-dh-scope="workspace"', wsName ? `workspace: ${wsName}` : 'workspace')}</div>
    <i class="dh-gap"></i>
    <div class="dh-seg dh-range">${RANGES.map(([n, l]) => seg(range === n, `data-dh-range="${n}"`, l)).join('')}</div>
    <button class="x" data-dh-close title="Close" data-tip-keys="=esc:close" aria-label="close">${ICONS.wx}</button></div>`;
}

function loading(done: number, total: number) {
  const p = total ? Math.min(100, (done / total) * 100) : 0;
  return `<div class="dh-load"><div class="dh-lt">Reading your agent logs once</div><div class="uw-bar dh-bar" style="--p:${p.toFixed(1)}"></div><div class="dh-ln"><span>${total ? `${gb(done)} of ${gb(total)} GB read` : ''}</span><span>Next time it opens at once.</span></div></div>`;
}

function chart(d: Data, order: string[]) {
  const w = 540, h = 150, n = d.buckets.length, step = n > 1 ? w / (n - 1) : w, pal = colors();
  const sums = d.buckets.map((b) => order.reduce((s, m) => s + (b.tokens[m] || 0), 0));
  const max = Math.max(1, ...sums) * 1.1, y = (v: number) => (h - (v / max) * h).toFixed(1);
  let out = `<svg class="dh-chart" viewBox="0 0 ${w} ${h + 16}" preserveAspectRatio="none" aria-label="tokens per ${d.unit}">`;
  for (let g = 0; g <= 3; g++) out += `<line x1="0" x2="${w}" y1="${h - (h * g) / 3}" y2="${h - (h * g) / 3}" class="dh-grid"/>`;
  let base = d.buckets.map(() => 0);
  order.forEach((m, j) => {
    const top = d.buckets.map((b, i) => base[i] + (b.tokens[m] || 0));
    if (top.every((v, i) => v === base[i])) return;
    const up = top.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).join(' ');
    const down = base.map((v, i) => `${(i * step).toFixed(1)},${y(v)}`).reverse().join(' ');
    out += `<polygon points="${up} ${down}" fill="${pal[j % pal.length]}" fill-opacity=".85" data-model="${esc(m)}"/>`;
    base = top;
  });
  out += '</svg>';
  const when = (at: number) => new Date(at).toLocaleString(undefined, d.unit === 'hour' ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });
  const marks = n ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1].filter((v, i, a) => a.indexOf(v) === i) : [];
  return `${out}<div class="dh-dates">${marks.map((i) => `<span style="left:${n > 1 ? (i / (n - 1)) * 100 : 0}%">${esc(when(d.buckets[i].at))}</span>`).join('')}</div>`;
}

function report(d: Data) {
  const t = d.totals, pal = colors(), order = d.models.map((m) => m.id);
  if (!t.tokens && !t.commits && !t.chats) return '<div class="dh-none">No agent use or commits in this range.</div>';
  const dot = (j: number) => `<i class="dh-dot" style="background:${pal[j % pal.length]}"></i>`;
  const cost = (c: number | null) => (c == null ? 'no price' : money(c));
  const models = d.models.map((m, j) => `<div class="dh-m">${dot(j)}<span class="dh-mn">${esc(m.id)}</span><b class="${m.cost == null ? 'dh-np' : ''}">${cost(m.cost)}</b><i></i><small>${big(m.tokens)} tokens</small></div>`).join('');
  const tot = ([['tokens', big(t.tokens)], ['cost', money(t.cost)], ['chats started', String(t.chats)], ['commits', String(t.commits)], ['files changed', String(t.files)]] as [string, string][])
    .map(([k, v]) => `<div><span class="dh-lbl">${k}</span><b>${v}</b></div>`).join('');
  const rows = d.models.map((m, j) => `<tr><td class="dh-f">${j + 1}</td><td>${dot(j)}${esc(m.id)}</td><td class="dh-d">${esc(m.agent)}</td><td class="r">${big(m.tokens)}</td><td class="r">${m.cost == null || !t.cost ? '' : ((m.cost / t.cost) * 100).toFixed(1) + '%'}</td><td class="r${m.cost == null ? ' dh-np' : ''}">${cost(m.cost)}</td></tr>`).join('');
  return `<div class="dh-top"><div class="dh-left"><div class="dh-big">${money(t.cost)}</div><div class="dh-sub">cost at API prices ${rangeWords()}</div>${t.unpriced ? '<div class="dh-sub">Models with no price are left out of it.</div>' : ''}<div class="dh-ms">${models}</div></div>
    <div class="dh-right"><div class="dh-lbl">tokens per ${d.unit}</div>${chart(d, order)}</div></div>
    <div class="dh-tot">${tot}</div>
    ${d.models.length ? `<div class="dh-lbl dh-by">by model</div><table class="dh-tab"><tr><th>#</th><th>model</th><th>agent</th><th class="r">tokens</th><th class="r">share of cost</th><th class="r">cost</th></tr>${rows}</table>` : ''}`;
}

function paint(body: string) {
  win.innerHTML = head() + `<div class="dh-body">${body}</div>`;
}

async function load() {
  const me = ++asked;
  clearTimeout(poll);
  let a: Answer;
  try {
    a = await api('GET', `/api/usage/dashboard?scope=${scope}&range=${range}`);
  } catch (e) {
    if (me === asked && !win.hidden) paint(`<div class="dh-none">${esc((e as Error).message)}</div>`);
    return;
  }
  if (me !== asked || win.hidden) return;
  if ('reading' in a) {
    paint(loading(a.reading.done, a.reading.total));
    poll = setTimeout(load, 300) as unknown as number;
    return;
  }
  paint(report(a));
}

function onClick(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest('[data-dh-close]')) return close();
  const sc = t.closest<HTMLElement>('[data-dh-scope]');
  if (sc) {
    if (sc.getAttribute('aria-disabled') === 'true') return tell(sc, { title: 'No project is open', line: 'Open a project to see it alone.', ms: 2500 });
    if (sc.dataset.dhScope === scope) return;
    scope = sc.dataset.dhScope as 'project' | 'workspace';
    return pick();
  }
  const r = t.closest<HTMLElement>('[data-dh-range]');
  if (r && Number(r.dataset.dhRange) !== range) {
    range = Number(r.dataset.dhRange);
    pick();
  }
}
function pick() {
  const body = win.querySelector('.dh-body')?.innerHTML || '';
  paint(body);
  load();
}
function away(e: Event) {
  if ((e.target as HTMLElement).closest?.('#dash-win, #tip') || Date.now() - openedAt < 500) return;
  close();
}
function key(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  close();
}
function listen(on: boolean) {
  for (const [type, fn] of [['pointerdown', away], ['keydown', key]] as [string, (e: any) => any][]) (on ? addEventListener : removeEventListener)(type, fn, true);
}
function close() {
  if (win.hidden) return;
  win.hidden = true;
  asked++;
  clearTimeout(poll);
  listen(false);
}

export function openDash() {
  if (!win.hidden) return;
  scope = projectName() ? 'project' : 'workspace';
  range = 30;
  win.hidden = false;
  openedAt = Date.now();
  paint('');
  listen(true);
  load();
  api('GET', '/api/workspace').then((w) => {
    wsName = String(w?.name || '');
    if (!win.hidden) win.querySelector('[data-dh-scope="workspace"]')!.textContent = wsName ? `workspace: ${wsName}` : 'workspace';
  }, () => {});
}

win.addEventListener('click', onClick);
