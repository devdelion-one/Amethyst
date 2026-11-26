import { page } from './page.ts';
import { drawRows } from './agentrow.ts';
import type { Drawn, Row } from './agentrow.ts';
import { bands, colorRow, dragGhost, flyFocus, holdFocus, ICONS, keepMenu, menuHead, popMenu, subMenu, trayName } from './controls.ts';
import { ANCHORS, canFile, dockFolder, dropFolder, fileChat, folderById, folderOf, folders, makeFolder, moveFolder, setFolder } from './folders.ts';
import type { ChatFolder } from './folders.ts';
import { icon } from './icon.ts';
import { gem } from './kinds.ts';
import { tell } from './notify.ts';
import { COLORS } from './theme.ts';
import { esc, track } from './util.ts';
import type { AgentInfo as Agent } from './types.ts';

export type Group = { k: string; label: string; list: Agent[] };
type Kid = { a: Agent; k: string };
type Edit = { list: string; id: string; put: string | null; start: string; value: string; el: HTMLInputElement | null };
type Sort = { on: () => boolean; put: (a: Agent, ref: string, after: boolean) => void };
type HostOpts = { list: string; attr: string; agentOf: (id: string) => Agent | null | undefined; repaint: () => void; on?: boolean; sort?: Sort };
type Block = { key: string; st: string; els: HTMLElement[]; top: number; bottom: number; dock?: boolean };

export const FOLDER_ICONS: [string, string, () => string][] = [
  ['folder', 'folder', () => icon('folder')],
  ['bug', 'bugs', () => ICONS.bug],
  ['agents', 'agents', () => gem('ai')],
  ['done', 'done', () => ICONS.check],
  ['ring', 'ring', () => gem('core')],
  ['moon', 'moon', () => ICONS.moon],
  ['files', 'files', () => ICONS.explorer],
];
const iconEntry = (k: string) => FOLDER_ICONS.find(([id]) => id === k) || FOLDER_ICONS[0];
export const folderIcon = (k: string) => iconEntry(k)[2]();
export const tone = (hex: string) => {
  const c = COLORS.find((x) => x.hex.toLowerCase() === String(hex).toLowerCase());
  return c ? `var(--c-${c.name})` : hex;
};
const icTone = (f: ChatFolder) => (f.ic ? tone(f.ic) : 'var(--text-dim)');

let edit: Edit | null = null, fly = '', dragEnd = 0;
const repaints = new Set<() => void>();
const repaintAll = () => repaints.forEach((f) => f());

export function newFolder(list: string, put: Agent | null = null) {
  edit = { list, id: '', put: put?.session || null, start: '', value: '', el: null };
  repaintAll();
}
function renameFolder(list: string, id: string) {
  const f = folderById(list, id);
  if (!f) return;
  edit = { list, id, put: null, start: f.name, value: f.name, el: null };
  repaintAll();
}
function commit(keep: boolean) {
  const e = edit;
  if (!e) return;
  edit = null;
  const name = e.value.trim();
  if (keep && name && !e.id) return void makeFolder(e.list, name, e.put);
  if (keep && name && e.id && name !== folderById(e.list, e.id)?.name) return setFolder(e.list, e.id, { name });
  repaintAll();
}

const nameBox = (value: string) => `<input class="cf-name" type="text" value="${esc(value)}" aria-label="folder name" placeholder="folder name" spellcheck="false" autocomplete="off" maxlength="120">`;
export function boxHtml(list: string, f: ChatFolder, kids: { a: Agent }[]) {
  const editing = edit?.list === list && edit.id === f.id, style = [f.ic && `--icn:${tone(f.ic)}`, f.bg && `--bc:${tone(f.bg)}`].filter(Boolean).join(';');
  const bell = f.shut && !editing && kids.some((x) => x.a.status === 'asks') ? `<i class="cf-bell" title="Needs you&#10;A chat in this folder is waiting for your answer.">${ICONS.bell}</i>` : '';
  return `<div class="cf-box${f.shut ? ' cf-shut' : ''}${f.dock ? ' cf-dock' : ''}" data-cf="${esc(f.id)}"${style ? ` style="${esc(style)}"` : ''}><div class="dk-cb cf-h" data-cf-h="${esc(f.id)}" role="button" tabindex="0" aria-expanded="${!f.shut}"><i class="cf-fi">${folderIcon(f.icon)}</i><i class="cf-chev">${icon('chev')}</i>${editing ? nameBox(edit!.start) : `<b>${esc(f.name)}</b>`}${bell}</div><div class="cf-in"></div></div>`;
}
const draftHtml = () => `<div class="cf-box cf-new" data-cf=""><div class="dk-cb cf-h" role="button" aria-expanded="true"><i class="cf-fi">${folderIcon('folder')}</i><i class="cf-chev">${icon('chev')}</i>${nameBox(edit!.start)}</div><div class="cf-in"></div></div>`;
const unit = (key: string, html: string): Row => ({ key, html, cmp: html, shape: '', text: '', at: 0, a: null });

export function folderRows(list: string, a: Agent) {
  const now = folderOf(list, a)?.id;
  const rows = folders(list).map((f) => `<button class="mi${f.id === now ? ' on' : ''}" data-cfto="${esc(f.id)}""><i class="tb-ic cf-mi" style="color:${icTone(f)}">${folderIcon(f.icon)}</i><span class="mi-n">${esc(f.name)}</span>${f.id === now ? '<span class="d">in it</span>' : ''}</button>`).join('');
  const out = now ? `<button class="mi" data-cfout>${icon('close')}<span class="mi-n">out of the folder</span></button>` : '';
  return `${rows}${out}${rows || out ? '<div class="sep"></div>' : ''}<button class="mi" data-cfnew>${ICONS.newFolder}<span class="mi-n">new folder…</span></button>`;
}
export function folderPick(list: string, a: Agent, b: HTMLElement) {
  const d = b.dataset;
  if (d.cfto) return fileChat(list, a, d.cfto), true;
  if ('cfout' in d) return fileChat(list, a, null), true;
  if ('cfnew' in d) return newFolder(list, a), true;
  return false;
}
export const moveItem = (list: string, a: Agent) => (canFile(list, a) ? `<button class="mi" data-cf-mv data-sub aria-haspopup="menu" aria-expanded="false"><i class="tb-ic">${icon('folder')}</i><span class="mi-n">move to folder</span><span class="pk-ar">›</span></button>` : '');
export const moveSub = (list: string, a: Agent, row: HTMLElement) => subMenu(row, folderRows(list, a), (b) => folderPick(list, a, b));

let shut = { k: '', at: 0 }, open: { k: string; label: string | null } | null = null;
document.addEventListener('pointerdown', (e) => {
  const b = (e.target as Element).closest?.('button');
  if (open && b && b.getAttribute('aria-label') === open.label && !document.getElementById('colormenu')?.hidden) shut = { k: open.k, at: performance.now() };
}, true);
export function moveMenu(list: string, a: Agent, btn: HTMLElement, at: HTMLElement = btn) {
  const k = a.id;
  if (shut.k === k && performance.now() - shut.at < 250) return;
  const r = (at.offsetWidth ? at : btn).getBoundingClientRect(), label = btn.getAttribute('aria-label');
  popMenu(r.left, r.bottom + 4, `<div class="mh"><i class="mh-ic">${icon('folder')}</i><span class="mh-n">move to folder</span></div>${folderRows(list, a)}`, (b) => folderPick(list, a, b));
  const m = document.getElementById('colormenu');
  if (!m) return;
  open = { k, label };
  m.querySelector<HTMLElement>('button.mi')?.focus();
  holdFocus(() => m.querySelector<HTMLElement>('button.mi'));
  m.addEventListener('menuclose', () => {
    open = null;
    if (document.activeElement?.getAttribute('aria-label') === label) (document.activeElement as HTMLElement).blur();
  }, { once: true });
}

function iconRow(f: ChatFolder) {
  const open = fly === 'icon', name = iconEntry(f.icon)[1], c = icTone(f);
  const cells = FOLDER_ICONS.map(([id, n, ic], i) => `<button class="sw-ic${i === 0 ? ' dft' : ''}${id === (iconEntry(f.icon)[0]) ? ' on' : ''}" data-cfi="${id}" aria-label="${esc(i ? n : 'folder, the default')}" style="--ly-c:${c}">${ic()}</button>`).join('');
  const pop = open ? `<div class="pk-fly"><div class="mh pk-h"><span class="mh-n">icon</span></div><div class="pk-grid">${cells}</div></div>` : '';
  return `<div class="pk-row"><button class="mi pk pk-line${open ? ' open' : ''}" data-fly="icon" title="Icon&#10;The icon the folder has in the list."><i class="tb-ic">${icon('folder')}</i><span class="mi-n">icon</span><span class="pk-cur" title="${esc(name)}"><i class="pk-ic sw-ic" style="--ly-c:${c}">${folderIcon(f.icon)}</i></span><span class="pk-ar">›</span></button>${pop}</div>`;
}
const bgSwatch = (hex: string) => `<i class="cf-sw${hex ? '' : ' dfl'}"${hex ? ` style="--bc:${tone(hex)}"` : ''}></i>`;
function folderMenu(list: string, id: string, x: number, y: number, again = false) {
  const f = folderById(list, id);
  if (!f) return;
  if (!again) fly = '';
  const ic = folderIcon(f.icon), c = icTone(f);
  const icRow = colorRow({ k: 'ic', label: 'icon color', tip: "the color of the folder's icon", chip: `<i class="pk-ic sw-ic" style="--ly-c:${c}">${ic}</i>`, now: f.ic ? trayName(f.ic) : 'default', title: 'color of the icon', attr: 'cfc', cls: 'sw-ic', dfltCls: 'sw-ic', dfltTip: 'default, a dim icon', dfltStyle: '--ly-c:var(--text-dim)', style: (h) => `--ly-c:${tone(h)}`, icon: ic, line: true }, f.ic, fly);
  const bgRow = colorRow({ k: 'bg', label: 'background', tip: "the color of the folder's box in the list", chip: `<i class="pk-ic">${bgSwatch(f.bg)}</i>`, now: f.bg ? trayName(f.bg) : 'default', title: 'background of the folder', attr: 'cfb', cls: 'sw-ic cf-bgc', dfltCls: 'sw-ic cf-bgc cf-dfl', dfltTip: 'default, the grey box', dfltStyle: '', style: (h) => `--bc:${tone(h)}`, icon: '<i class="cf-sw"></i>', line: true }, f.bg, fly);
  const item = (attrs: string, ic2: string, label: string) => `<button class="mi" ${attrs}>${ic2}<span class="mi-n">${label}</span></button>`;
  const html = menuHead(ic, f.name, `color:${c}`) + bands({ actions: item('data-cfm="rename" title="Rename&#10;Lets you type a new name in the list."', ICONS.rename, 'rename') + item('data-cfm="delete" title="Delete&#10;The folder goes, and its chats go back under their states. No chat is closed."', icon('clear'), 'delete') + (f.dock ? item('data-cfm="undock" title="Undock&#10;The folder goes back to the bottom of the list and scrolls with it."', ICONS.dock, 'undock') : item('data-cfm="dock" title="Dock to bottom&#10;Keeps the folder on the bottom edge of the list, also when you scroll."', ICONS.dock, 'dock to bottom')) + '<div class="sep"></div>' + iconRow(f) + icRow + bgRow });
  popMenu(x, y, html, (b) => {
    const d = b.dataset;
    const back = (focusFly: boolean) => {
      folderMenu(list, id, x, y, true);
      return (focusFly ? flyFocus() : document.querySelector<HTMLElement>(`#colormenu [data-fly="${d.fly}"]`))?.focus();
    };
    if (d.fly) {
      fly = fly === d.fly ? '' : d.fly;
      return back(!!fly);
    }
    if (d.cfi != null) return setFolder(list, id, { icon: d.cfi }), back(true);
    if (d.cfc != null) return setFolder(list, id, { ic: d.cfc }), back(true);
    if (d.cfb != null) return setFolder(list, id, { bg: d.cfb }), back(true);
    if (d.cfm === 'rename') return renameFolder(list, id);
    if (d.cfm === 'delete') return dropFolder(list, id);
    if (d.cfm === 'dock' || d.cfm === 'undock') return dockFolder(list, id, d.cfm === 'dock');
  });
  keepMenu(() => folderMenu(list, id, x, y, true));
}

const anchorOf = (f: ChatFolder) => (f.dock ? 'dock' : ANCHORS.includes(f.at) ? f.at : '');
function arrange(list: string, groups: Group[], on = true) {
  const fs = on ? folders(list) : [], kids = new Map<string, Kid[]>(fs.map((f) => [f.id, []]));
  const rest = groups.map((g) => ({ ...g, list: g.list.filter((a) => {
    const f = folderOf(list, a), box = f && kids.get(f.id);
    if (!box) return true;
    box.push({ a, k: g.k });
    return false;
  }) }));
  return { fs, kids, rest };
}
export function listOrder(list: string, groups: Group[]): string[] {
  const { fs, kids, rest } = arrange(list, groups), out: string[] = [];
  for (const k of ANCHORS) {
    for (const f of fs) if (anchorOf(f) === k && !f.shut) out.push(...kids.get(f.id)!.map((x) => x.a.id));
    out.push(...(rest.find((x) => x.k === k)?.list || []).map((a) => a.id));
  }
  for (const f of fs) if (f.dock && !f.shut) out.push(...kids.get(f.id)!.map((x) => x.a.id));
  return out;
}

export function folderHost(list: HTMLElement, o: HostOpts) {
  let outer: Drawn = { cmp: null, units: new Map() };
  const inner = new Map<string, { box: Element; d: Drawn }>();
  repaints.add(o.repaint);
  const key = o.attr.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());

  function paint(groups: Group[], head: (g: Group) => Row, row: (a: Agent, k: string) => Row, none: string, card: (a: Agent) => HTMLElement) {
    const { fs, kids, rest } = arrange(o.list, groups, o.on !== false);
    const units: Row[] = [], rows: Row[] = [], order: string[] = [], open = new Map<string, Row[]>();
    const place = (f: ChatFolder) => {
      const ks = kids.get(f.id)!, rs = f.shut ? [] : ks.map((x) => row(x.a, x.k));
      units.push(unit('f:' + f.id, boxHtml(o.list, f, ks)));
      open.set(f.id, rs);
      rows.push(...rs);
      if (!f.shut) order.push(...ks.map((x) => x.a.id));
    };
    for (const k of ANCHORS) {
      for (const f of fs) if (anchorOf(f) === k) place(f);
      const g = rest.find((x) => x.k === k);
      if (!g || !g.list.length) continue;
      units.push(head(g));
      for (const a of g.list) {
        const r = row(a, g.k);
        units.push(r);
        rows.push(r);
        order.push(a.id);
      }
    }
    if (edit && edit.list === o.list && !edit.id) units.push(unit('f:', draftHtml()));
    for (const f of fs) if (f.dock) place(f);
    outer = drawRows(list, outer, units, none, card);
    for (const [id, rs] of open) {
      const box = list.querySelector<HTMLElement>(`:scope > .cf-box[data-cf="${CSS.escape(id)}"]`), body = box?.querySelector<HTMLElement>(':scope > .cf-in');
      if (!box || !body) continue;
      let st = inner.get(id);
      if (!st || st.box !== box) inner.set(id, (st = { box, d: { cmp: null, units: new Map() } }));
      st.d = drawRows(body, st.d, rs, '', card);
    }
    for (const id of [...inner.keys()]) if (!open.has(id)) inner.delete(id);
    dockFit();
    if (edit && edit.list === o.list) {
      const inp = list.querySelector<HTMLInputElement>('.cf-name');
      if (inp && inp !== edit.el) {
        const first = !edit.el;
        edit.el = inp;
        inp.value = edit.value;
        inp.focus();
        if (first) inp.select(), inp.closest('.cf-box')?.scrollIntoView({ block: 'nearest' });
        else inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }
    return { order, rows };
  }

  let docked: HTMLElement[] = [];
  const fit = new ResizeObserver(() => stack());
  function stack() {
    let below = 0;
    for (const b of [...docked].reverse()) {
      const h = b.offsetHeight + parseFloat(getComputedStyle(b).marginBottom || '0');
      b.style.setProperty('--cf-below', below + 'px');
      b.style.setProperty('--cf-h', h + 'px');
      below += h + parseFloat(getComputedStyle(b).marginTop || '0');
    }
  }
  function dockFit() {
    const now = [...list.querySelectorAll<HTMLElement>(':scope > .cf-dock')];
    if (now.length === docked.length && now.every((b, i) => b === docked[i])) return stack();
    fit.disconnect();
    docked = now;
    if (docked.length) fit.observe(list), docked.forEach((b) => fit.observe(b));
    stack();
  }
  const fold = (id: string) => {
    const f = folderById(o.list, id);
    if (f) setFolder(o.list, id, { shut: !f.shut });
  };
  const onClick = (e: MouseEvent) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>('[data-cf-h]');
    if (!h || (e.target as HTMLElement).closest('input') || Date.now() < dragEnd) return;
    e.stopPropagation();
    fold(h.dataset.cfH!);
  };
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.matches('.cf-name')) {
      if (e.key === 'Enter') e.preventDefault(), e.stopPropagation(), commit(true);
      else if (e.key === 'Escape') e.preventDefault(), e.stopPropagation(), commit(false);
      return;
    }
    const h = t.closest<HTMLElement>('[data-cf-h]');
    if (!h || h !== t || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    fold(h.dataset.cfH!);
  };
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (edit && t.matches('.cf-name')) edit.value = t.value;
  };
  const onOut = (e: FocusEvent) => {
    const t = e.target as HTMLInputElement;
    if (!t.matches?.('.cf-name')) return;
    setTimeout(() => edit && edit.el === t && t.isConnected && document.activeElement !== t && commit(true));
  };
  const onMenu = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.cf-name')) return;
    const h = t.closest<HTMLElement>('[data-cf-h]');
    if (!h) return;
    e.preventDefault();
    e.stopPropagation();
    folderMenu(o.list, h.dataset.cfH!, e.clientX, e.clientY);
  };
  const onDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || t.closest('input, button, textarea, .dk-ask, .dk-strip, [data-oc-part]')) return;
    dragEnd = 0;
    const h = t.closest<HTMLElement>('[data-cf-h]');
    if (h) return headDrag(e, h);
    const r = t.closest<HTMLElement>(`[${o.attr}]`);
    if (r) rowDrag(e, r);
  };
  list.addEventListener('click', onClick);
  list.addEventListener('keydown', onKey);
  list.addEventListener('input', onInput);
  list.addEventListener('focusout', onOut);
  list.addEventListener('contextmenu', onMenu);
  list.addEventListener('pointerdown', onDown);

  function blocks(): Block[] {
    const out: Block[] = [];
    for (const c of list.children as HTMLCollectionOf<HTMLElement>) {
      const r = c.getBoundingClientRect();
      if (c.matches('.cf-box')) out.push({ key: 'f:' + c.dataset.cf, st: '', els: [c], top: r.top, bottom: r.bottom, dock: c.matches('.cf-dock') });
      else if (c.matches('.dk-gh')) out.push({ key: 'g:' + c.dataset.st, st: c.dataset.st || '', els: [c], top: r.top, bottom: r.bottom });
      else if (out.length && out[out.length - 1].st) {
        const b = out[out.length - 1];
        b.els.push(c);
        b.bottom = Math.max(b.bottom, r.bottom);
      }
    }
    return out.filter((b) => b.key !== 'f:');
  }
  const inList = (x: number, y: number) => {
    const r = list.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const edgeScroll = (y: number) => {
    const r = list.getBoundingClientRect();
    if (y < r.top + 24) list.scrollTop -= 10;
    else if (y > r.bottom - 24) list.scrollTop += 10;
  };

  function headDrag(e: PointerEvent, h: HTMLElement) {
    const id = h.dataset.cfH!, box = h.closest<HTMLElement>('.cf-box')!, x0 = e.clientX, y0 = e.clientY;
    let g: ReturnType<typeof dragGhost> | null = null, line: HTMLElement | null = null, at = -2;
    const aim = (x: number, y: number) => {
      if (!inList(x, y)) return -1;
      const bs = blocks(), own = bs.findIndex((b) => b.key === 'f:' + id);
      if (!bs.length || own < 0) return -2;
      const ys = [bs[0].top, ...bs.slice(1).map((b, i) => (b.dock && !bs[i].dock ? b.top - 3 : (bs[i].bottom + b.top) / 2)), bs[bs.length - 1].bottom];
      let best = 0;
      ys.forEach((v, i) => Math.abs(v - y) < Math.abs(ys[best] - y) && (best = i));
      if (best === own || best === own + 1) return -2;
      const lr = list.getBoundingClientRect();
      line!.style.cssText = `left:${lr.left + 6}px;top:${Math.round(ys[best]) - 1}px;width:${lr.width - 12}px`;
      return best;
    };
    const move = (ev: PointerEvent) => {
      if (!g) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        g = dragGhost(h, list.parentElement || document.body, x0, y0);
        line = document.createElement('div');
        line.className = 'cf-line';
        box.classList.add('cf-lift');
        document.body.classList.add('dk-sorting');
      }
      g.move(ev.clientX, ev.clientY);
      edgeScroll(ev.clientY);
      at = aim(ev.clientX, ev.clientY);
      if (at >= 0) !line!.isConnected && document.body.append(line!);
      else line!.remove();
    };
    const end = (ok: boolean, ev: PointerEvent) => {
      if (!g) return;
      dragEnd = Date.now() + 300;
      g.el.remove();
      line?.remove();
      box.classList.remove('cf-lift');
      document.body.classList.remove('dk-sorting');
      if (!ok) return;
      const to = ev ? aim(ev.clientX, ev.clientY) : at;
      if (to === -1) return tell(list.isConnected ? list : document.body, { title: 'Folders move only within the list', line: 'Drop it above, between or below the groups', ms: 2500 });
      if (to < 0) return;
      const bs = blocks(), own = bs.findIndex((b) => b.key === 'f:' + id), rest = bs.filter((_, i) => i !== own), pos = to > own ? to - 1 : to;
      const dock = !!rest[pos - 1]?.dock || (box.matches('.cf-dock') && !!rest[pos]?.dock);
      const anchor = dock ? '' : rest.slice(pos).find((b) => b.st)?.st || '';
      const ids = rest.filter((b) => !b.st).map((b) => b.key.slice(2));
      ids.splice(rest.slice(0, pos).filter((b) => !b.st).length, 0, id);
      moveFolder(o.list, id, anchor, ids, dock);
    };
    track(e, { move, end, esc: () => !!g });
  }

  function rowDrag(e: PointerEvent, r: HTMLElement) {
    const a = o.agentOf(r.dataset[key] || ''), files = canFile(o.list, a), panel = page.agentPanel();
    if (!a || (!files && !panel && !o.sort)) return;
    const from = folderOf(o.list, a)?.id || null, x0 = e.clientX, y0 = e.clientY, sort = o.sort;
    let g: ReturnType<typeof dragGhost> | null = null, lit: HTMLElement | null = null, line: HTMLElement | null = null;
    type Gap = { ref: string; after: boolean; moves: boolean; y: number; box: HTMLElement };
    const gap = (x: number, y: number): Gap | null => {
      if (!sort || !inList(x, y)) return null;
      const fb = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cf-box');
      const box = fb && list.contains(fb) ? fb.querySelector<HTMLElement>(':scope > .cf-in') : list;
      if (!box || !box.offsetHeight) return null;
      const all = [...box.children].filter((c) => c.matches(`[${o.attr}]`)) as HTMLElement[], rows = all.filter((c) => c !== r);
      if (!rows.length) return null;
      let i = rows.findIndex((c) => {
        const b = c.getBoundingClientRect();
        return y < b.top + b.height / 2;
      });
      const after = i < 0;
      if (after) i = rows.length;
      const own = all.indexOf(r), ref = rows[after ? rows.length - 1 : i];
      const b = ref.getBoundingClientRect();
      return { ref: ref.getAttribute(o.attr) || '', after, moves: own < 0 || own !== i, y: after ? b.bottom + 1 : b.top - 1, box };
    };
    const showGap = (gp: Gap | null) => {
      if (!gp || !gp.moves || !sort!.on()) return line?.remove();
      line ||= Object.assign(document.createElement('div'), { className: 'cf-line' });
      const lr = gp.box.getBoundingClientRect();
      line.style.cssText = `left:${lr.left + 4}px;top:${Math.round(gp.y) - 1}px;width:${lr.width - 8}px`;
      if (!line.isConnected) document.body.append(line);
    };
    const aim = (x: number, y: number): string | null => {
      if (!inList(x, y)) return null;
      const box = document.elementFromPoint(x, y)?.closest<HTMLElement>('.cf-box');
      return box && list.contains(box) && box.dataset.cf ? box.dataset.cf : '';
    };
    const light = (to: string | null) => {
      const el = to ? list.querySelector<HTMLElement>(`:scope > .cf-box[data-cf="${CSS.escape(to)}"]`) : to === '' && from ? list : null;
      const want = to === from ? null : el;
      if (want === lit) return;
      lit?.classList.remove('oc-drop');
      lit = want;
      lit?.classList.add('oc-drop');
    };
    const move = (ev: PointerEvent) => {
      if (!g) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        g = dragGhost(r, list.parentElement || document.body, x0, y0);
        r.classList.add('oc-lift');
        document.body.classList.add('dk-sorting');
      }
      g.move(ev.clientX, ev.clientY);
      if (panel?.over(ev.clientX, ev.clientY)) return light(null);
      edgeScroll(ev.clientY);
      if (files) light(aim(ev.clientX, ev.clientY));
      showGap(gap(ev.clientX, ev.clientY));
    };
    const end = (ok: boolean, ev: PointerEvent) => {
      if (!g) return;
      dragEnd = Date.now() + 300;
      g.el.remove();
      r.classList.remove('oc-lift');
      lit?.classList.remove('oc-drop');
      lit = null;
      line?.remove();
      document.body.classList.remove('dk-sorting');
      panel?.hide();
      if (!ok) return;
      if (ev && panel?.drop(a, ev.clientX, ev.clientY)) return;
      const gp = ev ? gap(ev.clientX, ev.clientY) : null, by = !!gp && gp.moves && sort!.on();
      if (by) sort!.put(a, gp!.ref, gp!.after);
      const to = files && ev ? aim(ev.clientX, ev.clientY) : null;
      if (to && to !== from) return void fileChat(o.list, a, to);
      if (to === '' && from) return void fileChat(o.list, a, null);
      if (gp?.moves) return by ? undefined : tell(r.isConnected ? r : list, { title: 'Pick My order to place chats by hand', ms: 2500 });
      if (!files) return;
      if (to === from && to !== null) return;
      const over = r.isConnected ? r : list;
      if (to === null) return tell(over, from ? { title: 'Drop it on the list to take it out of its folder', ms: 2500 } : { title: 'Drop it on a folder to put it there', ms: 2500 });
      if (!folders(o.list).length) tell(over, { title: 'There is no folder to put it in', line: 'Right-click the list: new folder', ms: 2500 });
    };
    track(e, { move, end, esc: () => !!g });
  }

  return {
    paint,
    dragged: () => Date.now() < dragEnd,
    off() {
      repaints.delete(o.repaint);
      fit.disconnect();
      list.removeEventListener('click', onClick);
      list.removeEventListener('keydown', onKey);
      list.removeEventListener('input', onInput);
      list.removeEventListener('focusout', onOut);
      list.removeEventListener('contextmenu', onMenu);
      list.removeEventListener('pointerdown', onDown);
    },
  };
}
