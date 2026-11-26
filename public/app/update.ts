import { ask, ICONS } from '../base/controls.ts';
import { notify } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { pref } from '../base/prefs.ts';
import { agents } from '../base/stream.ts';
import { $, esc, sinceShort, store } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import { licenseNow, openLicense } from './license.ts';
import { openSettings } from './modes.ts';
import { shows } from './tabs.ts';

interface UpState {
  status: string;
  version: string;
  look: boolean;
  auto: boolean;
  checked: number;
  next?: string;
  notes?: string;
  total?: number;
  done?: number;
  speed?: number;
  percent?: number;
  error?: string;
  stage?: string;
  license?: string;
}
type Say = (s: UpState) => string;

const UPDATE = window.amethyst?.desktop ? window.amethyst.update : null;
let up: UpState | null = null;
const MB = 1024 * 1024;
const A = (v: string | undefined) => `Amethyst ${esc(v || '')}`;
const news = (s: UpState, v: string | undefined, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${esc(s.notes! + v!)}" target="_blank">what’s new</a>`;
const starting = (s: UpState) => s.status === 'downloading' && !s.total;
const pct = (s: UpState) => Math.round(s.percent || 0);

export const SAY = {
  line: ({
    dev: () => 'Running from the code',
    idle: (s) => (s.checked ? 'You have the latest version' : 'Not checked yet'),
    checking: () => 'Checking for updates…',
    available: (s) => `${A(s.next)} is available${s.license ? ' · new license' : ''} · ${news(s, s.next)}`,
    downloading: (s) => (starting(s) ? `Downloading ${A(s.next)}` : `Downloading ${A(s.next)} · ${pct(s)}%`),
    ready: (s) => `${A(s.next)} is downloaded`,
    failed: (s) => (s.stage === 'download' ? `${A(s.next)} didn’t download` : 'Couldn’t check for updates'),
  }) as Record<string, Say>,
  button: { idle: ['check', 'check'], checking: ['check', 'check'], available: ['download', 'Update'], downloading: ['cancel', 'cancel'], ready: ['install', 'Restart'], failed: ['retry', 'try again'] } as Record<string, string[]>,
  icon: ({
    available: (s) => (s.license ? `Update\n${A(s.next)} comes with a new license. Click to read it; it downloads after you agree.` : `Update\n${A(s.next)} is ready to download. Click to update.`),
    downloading: (s) => (starting(s) ? `Update: downloading\n${A(s.next)} is starting to download. Click to see it in Settings.` : `Update: downloading\n${A(s.next)}, ${pct(s)}% so far. Click to see it in Settings.`),
    ready: (s) => `Update: ready\n${A(s.next)} is downloaded. Click to restart and install it.`,
    failed: (s) => `Update: failed\n${A(s.next)} didn’t download. Click to try again.`,
  }) as Record<string, Say>,
  notice: ({
    available: (s) => [`${A(s.next)} is available`, 'update'],
    license: (s) => [`${A(s.next)} comes with a new license`, 'read & update'],
    downloaded: (s) => [`${A(s.next)} is downloaded`, 'restart'],
    failed: (s) => [`${A(s.next)} didn’t download`, 'try again'],
  }) as Record<string, (s: UpState) => string[]>,
  updated: (v: string) => `Amethyst is updated to ${esc(v)}`,
};

function under(s: UpState) {
  if (s.status === 'failed') return s.error!;
  if (s.status === 'ready') return s.total ? `${Math.round(s.total / MB)} MB downloaded` : '';
  if (s.status !== 'downloading') return '';
  if (!s.total) return 'connecting…';
  const left = s.speed ? Math.ceil((s.total - s.done!) / s.speed) : 0;
  return `${Math.round(s.done! / MB)} of ${Math.round(s.total / MB)} MB · ${(s.speed! / MB).toFixed(1)} MB/s${left ? ` · ${left < 90 ? `${left} s` : `${Math.round(left / 60)} min`} left` : ''}`;
}
const barP = (s: UpState) => (s.status === 'downloading' ? s.percent || 0 : s.status === 'ready' ? 100 : 0);
const checkedText = (s: UpState) => (s.checked ? `checked ${sinceShort(s.checked)}` : '');
const card = () => $<HTMLElement | null>('#settings .up-card');
const cardShown = () => shows('settings') && !!card();

export const hasUpdate = () => !!UPDATE;
export const seenUpdate = () => UPDATE?.seen();

type Toggle = (on: unknown, attrs: string, tip?: string) => string;
export function updateGroup({ group, row, chip, tg, rows = '', tail = '' }: { group: (title: string, rows: string) => string; row: (label: string, opts: string, o?: { desc?: string }) => string; chip: (on: unknown, attrs: string, inner: string) => string; tg: Toggle; rows?: string; tail?: string }) {
  dropToast();
  const s: UpState = up || { status: 'idle', version: '', look: true, auto: false, checked: 0 };
  const [act, label] = SAY.button[s.status] || [];
  const off = s.status === 'dev' ? 'disabled' : '';
  return group(
    'amethyst',
    `<div class="up-card">` +
      `<img class="up-gem" src="/amethyst.svg" alt="">` +
      `<div class="up-name">Amethyst <b>${esc(s.version)}</b><span class="up-cr">© 2026 Amethyst</span></div>` +
      `<div class="up-line">${SAY.line[s.status]?.(s) || ''}</div>` +
      `<div class="up-do">${act ? `<button class="up-btn${act === 'download' || act === 'install' ? ' on' : ''}" data-update="${act}"${s.status === 'checking' ? ' disabled' : ''}>${label}</button>` : ''}</div>` +
      `<div class="up-bar${starting(s) ? ' wait' : ''}" style="--p:${barP(s)}"></div>` +
      `<div class="up-under${s.status === 'failed' ? ' err' : ''}" title="${esc(under(s))}" data-tip-cut>${esc(under(s))}</div>` +
      `</div>` +
      row('check for updates',
        `<span class="up-checked">${esc(checkedText(s))}</span>` + tg(s.look, `data-up-look="${s.look ? '' : '1'}" aria-label="check for updates" ${off}`),
        { desc: 'when the app opens, at 12:00 and on entering settings; off: only when you click check' }) +
      row('download', `<span class="seg">${chip(!s.auto, `data-up-auto="" ${off}`, 'on click') + chip(s.auto, `data-up-auto="1" ${off}`, 'by itself')}</span>`,
        { desc: 'an update downloads when you click, or by itself; restarting is always your click' }) +
      rows + tail,
  );
}

function paintCard() {
  const c = card();
  if (!c) return;
  c.querySelector<HTMLElement>('.up-bar')?.style.setProperty('--p', barP(up!) as unknown as string);
  const line = c.querySelector('.up-line'), u = c.querySelector<HTMLElement>('.up-under'), checked = $('#settings .up-checked');
  if (line && up!.status === 'downloading') line.innerHTML = SAY.line.downloading(up!);
  if (u) u.textContent = u.title = under(up!);
  if (checked) checked.textContent = checkedText(up!);
}

export function updateClick(d: DOMStringMap) {
  if (!UPDATE || !up) return false;
  if (d.update === 'download' || d.update === 'retry') return getUpdate(), true;
  if (d.update) return d.update === 'install' ? restartToUpdate() : UPDATE[({ check: 'check', cancel: 'cancel' } as Record<string, 'check' | 'cancel'>)[d.update]](), true;
  if ('upLook' in d) return UPDATE.set({ look: !!d.upLook, auto: up.auto }), true;
  if ('upAuto' in d) return UPDATE.set({ look: up.look, auto: !!d.upAuto }), true;
  return false;
}

function getUpdate() {
  if (up?.license && licenseNow()?.update) return openLicense(true);
  UPDATE!.download();
}

async function restartToUpdate() {
  const n = [...agents.all.values()].filter((a) => a.status === 'working' || a.status === 'starting').length;
  const text = n ? `Amethyst restarts. ${n} ${n === 1 ? 'agent is' : 'agents are'} working: they stop and come back asleep, and terminals close.` : 'Amethyst restarts, and terminals close.';
  if (await ask({ title: `Restart to update to ${up!.next}?`, text, confirm: true })) UPDATE!.install();
}
function seeUpdate() {
  store.set('settings:tab', 'update');
  openSettings();
  if (shows('settings')) page.renderSettings();
  $('#settings').scrollTop = 0;
}

const SVG = (inner: string, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
const ICON: Record<string, string> = {
  available: ICONS.update,
  ready: SVG('<path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3"/>'),
  failed: SVG('<path d="M8 3.5v5.5M8 12v.5"/>'),
  downloading: `<svg class="up-ring" viewBox="0 0 24 24" aria-hidden="true"><circle class="tr" cx="12" cy="12" r="8" pathLength="100"/><circle class="pg" cx="12" cy="12" r="8" pathLength="100"/><path class="ar" d="M12 8.5v7M9.5 13 12 15.5 14.5 13"/></svg>`,
};
const iconState = (s: UpState) => (s.status === 'failed' ? (s.stage === 'download' && s.next ? 'failed' : '') : ICON[s.status] ? s.status : '');
function paintIcon() {
  const b = $<HTMLElement>('#st-update'), k = iconState(up!);
  b.hidden = !k;
  if (!k) return void (b.dataset.state = '');
  if (b.dataset.state !== k) b.innerHTML = ICON[k];
  b.dataset.state = k;
  b.classList.toggle('wait', starting(up!));
  b.style.setProperty('--p', pct(up!) as unknown as string);
  b.title = SAY.icon[k](up!);
  b.ariaLabel = 'update';
  b.dataset.tipSet = 'update';
}
function clickIcon() {
  const k = iconState(up!);
  if (k === 'ready') return restartToUpdate();
  if (k === 'available' || k === 'failed') return getUpdate();
  seeUpdate();
}

const told = () => ([] as string[]).concat(store.get('update.told', []));
const mark = (key: string) => !told().includes(key) && store.set('update.told', [...told(), key].slice(-20));
let toast: { n: ReturnType<typeof notify>; kind: string } | null = null;
function dropToast() {
  toast?.n.close!();
  toast = null;
}
const noticeKind = (s: UpState) => (s.status === 'ready' ? 'downloaded' : s.status === 'available' && s.license ? 'license' : s.status === 'available' && !s.auto ? 'available' : s.status === 'failed' && s.stage === 'download' && s.next ? 'failed' : null);
export function tellUpdate() {
  const s = up;
  if (!s) return;
  if (s.next && ['downloading', 'ready', 'failed'].includes(s.status) && (s.status !== 'failed' || s.stage === 'download')) mark(`${s.next} available`);
  const kind = noticeKind(s);
  if (toast && toast.kind !== kind) dropToast();
  const key = `${s.next} ${kind}`;
  if (!kind || WIN !== 1 || !document.hasFocus() || cardShown() || told().includes(key) || !pref('update:notices')) return;
  mark(key);
  const [text, act] = SAY.notice[kind](s);
  const n = notify(`${text}<b class="nact" data-up-act>${act}</b>${kind === 'available' || kind === 'license' ? news(s, s.next, 'nact dim') : ''}`, { ms: 12000 });
  n.classList.add('up-note', 'up-' + kind);
  n.onclick = (e) => {
    if (getSelection()!.toString()) return;
    n.remove();
    if ((e.target as HTMLElement).closest('a')) return;
    e.stopPropagation();
    if (kind === 'downloaded') restartToUpdate();
    else getUpdate();
  };
  toast = { n, kind };
}

export async function watchUpdate() {
  if (!UPDATE) return;
  const shape = (s: UpState | null) => s && [s.status, s.next, s.look, s.auto, s.error, s.stage, s.license, starting(s)].join();
  const use = (s: UpState) => {
    const same = shape(s) === shape(up);
    up = s;
    paintIcon();
    same ? paintCard() : page.renderSettings();
    tellUpdate();
  };
  $<HTMLElement>('#st-update').onclick = clickIcon;
  UPDATE.onState(use);
  addEventListener('focus', () => up && tellUpdate());
  use(await UPDATE.state());
  if (up!.status === 'dev' || WIN !== 1) return;
  const ran = store.get('update.ran', null);
  store.set('update.ran', up!.version);
  if (ran && ran !== up!.version && pref('update:notices')) notify(`${SAY.updated(up!.version)}${news(up!, up!.version, 'nact')}`, { ms: 12000 }).classList.add('up-note');
}
