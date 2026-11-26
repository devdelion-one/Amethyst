import { ICONS } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { api, S } from '../base/model.ts';
import { notify, tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { pref } from '../base/prefs.ts';
import { record } from '../base/undo.ts';
import { esc, showErr } from '../base/util.ts';
import { setCreate, ueProjectFiles, ueState } from './ue.ts';

type Kind = 'class' | 'module' | 'plugin';
type Parent = { cls: string; name: string; module: string; include: string; kind: string; from: string; plugin?: string };
type Edit = { path: string; before: string; after: string };
type Template = { id: string; name: string; about: string; icon: string; type: string; phase: string; modules: boolean };

const svg = (d: string) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;
const KIND_IC: Record<string, string> = {
  actor: svg('<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z M2.5 5 8 8.2 13.5 5 M8 8.2v6"/>'),
  component: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><circle cx="8" cy="8" r="2.2"/>'),
  object: svg('<circle cx="8" cy="8" r="5.3"/><circle cx="8" cy="8" r="1.2"/>'),
  widget: svg('<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12M5 9h3"/>'),
  interface: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5" stroke-dasharray="2.2 2"/>'),
  plain: svg('<path d="M6 2.8c-1.6 0-1.6 1.2-1.6 2.6S4 8 2.8 8c1.2 0 1.6 1.2 1.6 2.6S4.4 13.2 6 13.2M10 2.8c1.6 0 1.6 1.2 1.6 2.6S12 8 13.2 8c-1.2 0-1.6 1.2-1.6 2.6s0 2.6-1.6 2.6"/>'),
  module: ICONS.ueModule,
  content: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><circle cx="6" cy="6.2" r="1.3"/><path d="m2.8 12 3.6-3.6 2.4 2.4 1.7-1.7 2.7 2.7"/>'),
  lib: svg('<path d="M3 3h3v10H3zM7 3h3v10H7zM11 3.5l2.6.7-2.4 9-2.6-.7"/>'),
  toolbar: svg('<rect x="2" y="3" width="12" height="4" rx="1"/><path d="M4.5 5h1M7.5 5h1M10.5 5h1M5 10h6M8 7v3"/>'),
  tab: svg('<rect x="2" y="4" width="12" height="9" rx="1.5"/><path d="M2 7h12M4.5 4V2.8h4V4"/>'),
  mode: svg('<path d="M8 2.2 9.6 6l4 .4-3 2.7.9 4-3.5-2.1-3.5 2.1.9-4-3-2.7 4-.4z"/>'),
  dll: svg('<rect x="3" y="2.5" width="10" height="11" rx="1.5"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>'),
};
const CUBE = svg('<path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5z M2.5 5 8 8.2 13.5 5 M8 8.2v6"/>');
const TITLE: Record<Kind, [string, string]> = { class: ['New Unreal class', ICONS.ueClass], module: ['New Unreal module', ICONS.ueModule], plugin: ['New Unreal plugin', ICONS.uePlugin] };
const MODULE_TYPES = ['Runtime', 'Editor', 'UncookedOnly', 'Developer'];
const MODULE_PHASES = ['Default', 'PreDefault', 'PostEngineInit'];

const info = () => ueState().info;
const choice = () => ueState().choice;
const ready = (plugin = false) => {
  const i = info();
  return !!i && (!i.why || (plugin && i.why === 'no-targets'));
};
const baseDir = () => (info()?.uproject || '').replace(/[^/]*$/, '');
function inProject(dir: string) {
  const b = baseDir(), d = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (b && !(d + '/').startsWith(b)) return null;
  return b ? d.slice(b.length) : d;
}
const isClassDir = (r: string) => /^Source\/[^/]+/.test(r) || /^Plugins\/(?:.+\/)?[^/]+\/Source\/[^/]+/.test(r);
const isModuleDir = (r: string) => r === 'Source' || /^Plugins\/(?:.+\/)?[^/]+\/Source$/.test(r);
const pluginOfDir = (r: string) => /^Plugins\/(?:.+\/)?([^/]+)\/Source$/.exec(r)?.[1] || '';

export function createKinds(dir: string): Kind[] {
  if (!pref('ue:on') || !ready(true)) return [];
  const r = inProject(dir);
  if (r == null) return [];
  const out: Kind[] = [];
  if (ready() && isClassDir(r)) out.push('class');
  if (ready() && isModuleDir(r)) out.push('module');
  if (r === '' || r === 'Plugins') out.push('plugin');
  return out;
}

export function createRows(dir: string) {
  if (!pref('ue:new')) return [];
  const label: Record<Kind, [string, string]> = { class: ['new Unreal class…', 'ueClass'], module: ['new Unreal module…', 'ueModule'], plugin: ['new Unreal plugin…', 'uePlugin'] };
  return createKinds(dir).map((k) => ({ label: label[k][0], icon: label[k][1], run: () => openCreate(k, dir) }));
}

export const canCreate = (kind: Kind) => pref('ue:on') && ready(kind === 'plugin');

function later(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function shell(kind: Kind, body: string, hint: string, wide = false) {
  document.getElementById('ue-new')?.remove();
  const veil = document.createElement('div');
  veil.id = 'ue-new';
  const i = info(), [title, icon] = TITLE[kind];
  veil.innerHTML = `<div class="box float nw${wide ? ' nw-wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="nw-head">${icon}<b>${title}</b><span class="nw-where">${CUBE}${esc(i?.name || 'Unreal')}${i?.engine?.id ? ` · UE ${esc(i.engine.id)}` : ''}</span></div>
    ${body}
    <div class="nw-foot"><span class="nw-hint">${esc(hint)}</span><button class="outline" data-nw-cancel><kbd>esc</kbd>cancel</button><button class="primary" data-nw-go><kbd>enter</kbd>make</button></div>
  </div>`;
  const back = document.activeElement as HTMLElement | null;
  document.body.appendChild(veil);
  const box = veil.firstElementChild as HTMLElement;
  let onGo: () => unknown = () => {};
  const close = () => {
    veil.remove();
    back?.focus?.();
  };
  veil.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.shiftKey && !(e.target as HTMLElement).matches?.('button, textarea')) {
      e.preventDefault();
      onGo();
    }
  });
  veil.addEventListener('mousedown', (e) => e.target === veil && close());
  box.querySelector('[data-nw-cancel]')!.addEventListener('click', close);
  box.querySelector('[data-nw-go]')!.addEventListener('click', () => onGo());
  return { box, close, go: (fn: () => unknown) => (onGo = fn), btn: box.querySelector<HTMLButtonElement>('[data-nw-go]')! };
}

const fileRow = (path: string, tag: string, cls = 'ok') => {
  const cut = path.lastIndexOf('/');
  return `<div class="nw-rl">${gem('file')}<span class="nw-p"><span class="nw-d">${esc(path.slice(0, cut + 1))}</span><span class="nw-f">${esc(path.slice(cut + 1))}</span></span><span class="nw-k ${cls}">${tag}</span></div>`;
};
const stopBox = (title: string, line = '') => `<div class="nw-stop"><b>${esc(title)}</b>${line ? `<span>${esc(line)}</span>` : ''}</div>`;

async function finish(r: { made: string[]; edits: Edit[]; manual?: string; editor?: boolean; sln?: boolean }, label: string, open: string[], at?: { line: number; col: number }) {
  record('files', label, { ops: [...r.made.map((p) => ({ op: 'made', path: p })), ...r.edits.map((e) => ({ op: 'text', path: e.path, before: e.before, after: e.after }))] });
  await page.reload();
  for (const p of open) await page.openInTab(p);
  if (at && open.length) (await import('../app/tabs.ts')).goLineIn(open[open.length - 1], at.line);
  if (r.manual) notify(`<b>${esc(label)}</b>: ${esc(r.manual)}`, { ms: 12000 });
  if (r.editor) notify(`<b>Unreal Editor is open</b> · ${esc(label.replace(/^made /, ''))} shows up there after you close it and build`, { ms: 12000 });
  if (r.sln) {
    const n = notify(`<b>${esc(label)}</b> · Visual Studio's project files are out of date <button class="chip" data-nw-sln title="Update them&#10;Runs Generate Project Files, so Visual Studio's project files are up to date.">update them</button>`, { ms: 12000 });
    n.querySelector('[data-nw-sln]')?.addEventListener('click', () => (ueProjectFiles(), n.close?.()));
  }
}

const body = (extra: Record<string, unknown>) => ({ ...choice(), comments: pref('ue:comments'), ...extra });

async function classDialog(dir: string) {
  const r0 = inProject(dir);
  const startDir = r0 != null && isClassDir(r0) ? dir : `${baseDir()}Source/${info()?.name || ''}`;
  const d = shell('class', `<div class="nw-body">
    <label class="nw-fl nw-top"><span>parent</span></label><div><div class="nw-search">${ICONS.search}<input data-nw-q placeholder="search every class: Actor, UserWidget, …" autocomplete="off" spellcheck="false" aria-label="parent class"></div><div class="nw-list" data-nw-list role="listbox" aria-label="parent classes"></div></div>
    <label class="nw-fl" for="nw-name"><span>name</span></label><input id="nw-name" class="nw-mono" data-nw-name autocomplete="off" spellcheck="false" placeholder="MyActor">
    <label class="nw-fl" for="nw-dir"><span>folder</span></label><input id="nw-dir" class="nw-mono" data-nw-dir autocomplete="off" spellcheck="false">
    <span class="nw-fl nw-top"><span>makes</span></span><div class="nw-res" data-nw-res aria-live="polite"></div>
    <span></span><div class="nw-ticks nw-slot"><label class="tick" data-nw-pubrow hidden><input type="checkbox" data-nw-pub checked> public header<span class="nw-why">other modules can include it</span></label><label class="tick" data-nw-deprow hidden><input type="checkbox" data-nw-dep checked> <span data-nw-deptext></span><span class="nw-why">else it fails to link</span></label></div>
  </div>`, 'opens the .h and the .cpp');
  const $ = <T extends HTMLElement>(s: string) => d.box.querySelector<T>(s)!;
  const q = $<HTMLInputElement>('[data-nw-q]'), list = $('[data-nw-list]'), name = $<HTMLInputElement>('[data-nw-name]'), dirIn = $<HTMLInputElement>('[data-nw-dir]'), res = $('[data-nw-res]');
  const pub = $<HTMLInputElement>('[data-nw-pub]'), dep = $<HTMLInputElement>('[data-nw-dep]');
  dirIn.value = startDir;
  let items: Parent[] = [], sel: Parent | null = null, plan: any = null, err = '', seqP = 0, seqD = 0, busy = false, pubTouched = false;
  const paintList = (note = '') => {
    if (note) return void (list.innerHTML = `<div class="nw-none">${note}</div>`);
    if (!items.length) return void (list.innerHTML = `<div class="nw-none">No class you can subclass matches.<br>Classes another module can't use are left out.</div>`);
    const common = !q.value.trim();
    let html = '', last = '';
    items.forEach((p, k) => {
      const g = common ? (p.kind === 'interface' || p.kind === 'plain' ? 'other' : 'common classes') : p.from === 'project' ? `in ${info()?.name}` : 'in the engine';
      if (g !== last) (html += `<div class="nw-grp">${esc(g)}</div>`), (last = g);
      const on = sel && sel.cls === p.cls && sel.kind === p.kind;
      html += `<div class="nw-pr${on ? ' on' : ''}" role="option" aria-selected="${!!on}" data-nw-p="${k}" title="${esc(p.include ? `${p.cls}\nIts header: #include "${p.include}". Click to make the new class a child of it.` : p.kind === 'plain' ? `${p.name}\nA C++ class with no Unreal parent.` : '')}">${KIND_IC[p.kind] || KIND_IC.object}<span class="nw-n">${esc(p.name)}</span><span class="nw-c">${esc(p.cls)}</span><span class="nw-m">${esc(p.module || 'C++')}</span></div>`;
    });
    list.innerHTML = html;
    list.querySelector('.nw-pr.on')?.scrollIntoView({ block: 'nearest' });
  };
  const loadParents = async () => {
    const my = ++seqP;
    try {
      const r = await api('POST', '/api/ue/parents', body({ q: q.value, dir: dirIn.value }));
      if (my !== seqP || !d.box.isConnected) return;
      if (r.why) return paintList('Not an Unreal project here.');
      if (!r.ready) {
        const ix = r.index || {};
        paintList(ix.state === 'failed' ? `The list of classes couldn't be built: ${esc(ix.error || '')}` : `Reading the engine's classes… ${ix.total ? `${Math.round((100 * ix.done) / ix.total)}%` : ''}<br>Once per engine version.`);
        setTimeout(() => my === seqP && d.box.isConnected && loadParents(), 1000);
        return;
      }
      items = r.list;
      if (!sel || !q.value.trim()) sel = sel && items.some((p) => p.cls === sel!.cls && p.kind === sel!.kind) ? sel : items[0] || null;
      paintList();
      dryLater();
    } catch (e) {
      paintList(esc((e as Error).message));
    }
  };
  const paintRes = () => {
    $('[data-nw-pubrow]').hidden = !plan?.split;
    $('[data-nw-deprow]').hidden = !plan?.needs;
    if (plan?.needs) $('[data-nw-deptext]').innerHTML = `add <b>${esc(plan.needs)}</b> to ${esc(plan.module)}.Build.cs${plan.plugin ? ' and turn on its plugin' : ''}`;
    const stop = !name.value.trim() ? '' : err || plan?.stop || '';
    d.btn.disabled = !plan || !!stop || !name.value.trim() || busy;
    if (!name.value.trim()) return void (res.innerHTML = stopBox('Type a name', `the ${sel?.kind === 'plain' ? 'class is named as you type it' : `prefix ${sel?.cls?.[0] || 'U'} is added for you`}`), res.classList.add('idle'));
    res.classList.remove('idle');
    if (stop) return void (res.innerHTML = stopBox(stop.replace(/:.*$/, ''), stop.includes(':') ? stop.replace(/^[^:]*:\s*/, '') : ''));
    if (!plan) return;
    res.innerHTML = `<div class="nw-rl">${KIND_IC[sel?.kind || 'object']}<span class="nw-cls">${esc(plan.cls)}${plan.base ? ` <i>: ${esc(plan.base)}</i>` : ''}</span><span class="nw-k api">${esc(plan.api)}</span></div>` + fileRow(plan.header, 'new') + fileRow(plan.source, 'new') + (plan.needs && dep.checked ? fileRow(plan.build, '+ ' + esc(plan.needs), 'ch') : '');
  };
  const dry = async () => {
    const my = ++seqD;
    if (!sel || !name.value.trim()) {
      plan = null;
      err = '';
      return paintRes();
    }
    try {
      const r = await api('POST', '/api/ue/new', body({ kind: 'class', dry: true, name: name.value.trim(), parent: sel.cls, dir: dirIn.value, ...(pubTouched ? { public: pub.checked } : {}) }));
      if (my !== seqD) return;
      if (r.why) {
        plan = null;
        err = 'Not an Unreal project here';
      } else {
        plan = r;
        err = '';
        if (!pubTouched) pub.checked = r.public;
      }
    } catch (e) {
      if (my !== seqD) return;
      plan = null;
      err = (e as Error).message;
    }
    paintRes();
  };
  const dryLater = later(dry, 120), parentsLater = later(loadParents, 120);
  list.addEventListener('mousedown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nw-p]');
    if (!el) return;
    e.preventDefault();
    sel = items[+el.dataset.nwP!];
    paintList();
    dry();
  });
  q.addEventListener('input', parentsLater);
  q.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const k = Math.max(0, items.findIndex((p) => p === sel)) + (e.key === 'ArrowDown' ? 1 : -1);
    sel = items[Math.min(items.length - 1, Math.max(0, k))] || sel;
    paintList();
    dryLater();
  });
  name.addEventListener('input', () => (paintRes(), dryLater()));
  dirIn.addEventListener('input', () => (dryLater(), parentsLater()));
  pub.addEventListener('change', () => ((pubTouched = true), dry()));
  dep.addEventListener('change', paintRes);
  d.go(async () => {
    if (d.btn.disabled) return tell(d.btn, { title: !name.value.trim() ? 'Type a name first' : err || plan?.stop || 'Pick a parent first', ms: 2500 });
    busy = true;
    paintRes();
    try {
      const r = await api('POST', '/api/ue/new', body({ kind: 'class', name: name.value.trim(), parent: sel!.cls, dir: dirIn.value, public: pub.checked, deps: dep.checked }));
      d.close();
      await finish(r, `made ${r.cls}`, [r.header, r.source], r.at?.source);
    } catch (e) {
      busy = false;
      err = (e as Error).message;
      paintRes();
      showErr(e);
    }
  });
  paintList('…');
  paintRes();
  name.focus();
  loadParents();
}

async function moduleDialog(dir: string) {
  const r0 = inProject(dir) || '';
  let meta: any = null;
  try {
    meta = await api('POST', '/api/ue/templates', body({}));
  } catch (e) {
    return showErr(e);
  }
  if (meta.why) return tell(null, { title: 'Not an Unreal project here', ms: 2500 });
  const targets: { name: string; type: string }[] = meta.targets || [], plugins: string[] = meta.plugins || [];
  let plugin = pluginOfDir(r0), type = 'Runtime', phase = 'Default';
  const ticked = new Set(targets.map((t) => t.name));
  const chips = (key: string, list: string[], on: string, more: string[] = []) => `<div class="nw-chips" data-nw-${key}>${list.map((v) => `<button class="chip${v === on ? ' on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}${more.length ? `<select class="nw-more" data-nw-${key}-more aria-label="more">${['more…', ...more].map((v, k) => `<option${k ? ` value="${esc(v)}"` : ' value=""'}${v === on ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>` : ''}</div>`;
  const d = shell('module', `<div class="nw-body">
    <label class="nw-fl" for="nw-mname"><span>name</span></label><input id="nw-mname" class="nw-mono" data-nw-name autocomplete="off" spellcheck="false" placeholder="MyGameEditor">
    <span class="nw-fl"><span>in</span></span><div class="nw-chips" data-nw-in><button class="chip${plugin ? '' : ' on'}" data-v="">the project</button>${plugins.map((p) => `<button class="chip${p === plugin ? ' on' : ''}" data-v="${esc(p)}">plugin ${esc(p)}</button>`).join('')}</div>
    <span class="nw-fl"><span>type</span></span>${chips('type', MODULE_TYPES, type, (meta.types || []).filter((t: string) => !MODULE_TYPES.includes(t)))}
    <span class="nw-fl"><span>loads</span></span>${chips('phase', MODULE_PHASES, phase, (meta.phases || []).filter((t: string) => !MODULE_PHASES.includes(t)))}
    <span class="nw-fl nw-top" data-nw-tlabel><span>targets</span></span><div class="nw-ticks" data-nw-targets></div>
    <span class="nw-fl nw-top"><span>makes</span></span><div class="nw-res" data-nw-res aria-live="polite"></div>
  </div>`, "opens the module's .cpp");
  const $ = <T extends HTMLElement>(s: string) => d.box.querySelector<T>(s)!;
  const name = $<HTMLInputElement>('[data-nw-name]'), res = $('[data-nw-res]');
  let plan: any = null, err = '', seq = 0;
  const editorish = () => /^Editor|UncookedOnly|Developer/.test(type);
  const paintTargets = () => {
    const box = $('[data-nw-targets]');
    $('[data-nw-tlabel]').hidden = box.hidden = !!plugin || !targets.length;
    box.innerHTML = targets.map((t) => `<label class="tick"><input type="checkbox" data-nw-t="${esc(t.name)}"${ticked.has(t.name) ? ' checked' : ''}> ${esc(t.name)}<span class="nw-why">${t.type === 'Editor' ? 'editor' : editorish() ? `${t.type.toLowerCase()}: an ${type} module stays out` : t.type.toLowerCase()}</span></label>`).join('');
  };
  const paintRes = () => {
    const stop = name.value.trim() ? err || plan?.stop || '' : '';
    d.btn.disabled = !name.value.trim() || !plan || !!stop;
    if (!name.value.trim()) return void (res.innerHTML = stopBox('Type a name', 'a C++ name: letters, digits and _'), res.classList.add('idle'));
    res.classList.remove('idle');
    if (stop) return void (res.innerHTML = stopBox(stop.replace(/:.*$/, ''), stop.includes(':') ? stop.replace(/^[^:]*:\s*/, '') : ''));
    if (!plan) return;
    res.innerHTML = plan.made.map((p: string) => fileRow(p, 'new')).join('') + fileRow(plan.owner, 'changed', 'ch') + plan.targets.map((p: string) => fileRow(p, 'changed', 'ch')).join('');
  };
  const req = (dry: boolean) => body({ kind: 'module', dry, name: name.value.trim(), type, phase, plugin, targets: plugin ? [] : [...ticked] });
  const dry = async () => {
    const my = ++seq;
    if (!name.value.trim()) return paintRes();
    try {
      const r = await api('POST', '/api/ue/new', req(true));
      if (my !== seq) return;
      [plan, err] = r.why ? [null, 'Not an Unreal project here'] : [r, ''];
    } catch (e) {
      if (my === seq) [plan, err] = [null, (e as Error).message];
    }
    if (my === seq) paintRes();
  };
  const dryLater = later(dry, 120);
  const pick = (key: string, v: string) => {
    if (key === 'type') {
      type = v;
      for (const t of targets) (t.type === 'Editor' || !editorish() ? ticked.add(t.name) : ticked.delete(t.name));
      paintTargets();
    } else if (key === 'phase') phase = v;
    else if (key === 'in') {
      plugin = v;
      paintTargets();
    }
    for (const b of d.box.querySelectorAll<HTMLElement>(`[data-nw-${key}] .chip`)) b.classList.toggle('on', b.dataset.v === v);
    const more = d.box.querySelector<HTMLSelectElement>(`[data-nw-${key}-more]`);
    if (more) {
      more.value = [...more.options].some((o) => o.value === v) ? v : '';
      more.classList.toggle('on', !!more.value);
    }
    dry();
  };
  for (const key of ['type', 'phase', 'in']) {
    $(`[data-nw-${key}]`).addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.chip');
      if (b) pick(key, b.dataset.v!);
    });
    d.box.querySelector(`[data-nw-${key}-more]`)?.addEventListener('change', (e) => (e.target as HTMLSelectElement).value && pick(key, (e.target as HTMLSelectElement).value));
  }
  $('[data-nw-targets]').addEventListener('change', (e) => {
    const t = (e.target as HTMLInputElement).dataset.nwT;
    if (!t) return;
    (e.target as HTMLInputElement).checked ? ticked.add(t) : ticked.delete(t);
    dry();
  });
  name.addEventListener('input', () => (paintRes(), dryLater()));
  d.go(async () => {
    if (d.btn.disabled) return tell(d.btn, { title: !name.value.trim() ? 'Type a name first' : err || plan?.stop || 'Not ready yet', ms: 2500 });
    d.btn.disabled = true;
    try {
      const r = await api('POST', '/api/ue/new', req(false));
      d.close();
      await finish(r, `made module ${r.name}`, [r.made[2]]);
    } catch (e) {
      err = (e as Error).message;
      paintRes();
      showErr(e);
    }
  });
  paintTargets();
  paintRes();
  name.focus();
}

async function pluginDialog() {
  let meta: any = null;
  try {
    meta = await api('POST', '/api/ue/templates', body({}));
  } catch (e) {
    return showErr(e);
  }
  if (meta.why) return tell(null, { title: 'Not an Unreal project here', ms: 2500 });
  const list: Template[] = meta.templates || [];
  if (!list.length) return tell(null, { title: "Your engine has no plugin templates", line: 'Engine/Plugins/Editor/PluginBrowser/Templates is empty', ms: 3000 });
  let t = list[0], plan: any = null, err = '', seq = 0;
  const d = shell('plugin', `<div class="nw-pd">
    <div class="nw-tl" role="listbox" aria-label="template"><div class="nw-cap">template</div>${list.map((x, k) => `<div class="nw-tpl" role="option" data-nw-t="${k}" title="${esc(`${x.name}\n${x.about}`)}"><span class="nw-tic">${KIND_IC[x.icon] || KIND_IC.module}</span><span class="nw-tn">${esc(x.name)}<small>${esc(x.modules ? `${x.type} module` : 'no code')}</small></span></div>`).join('')}</div>
    <div class="nw-side">
      <div class="nw-about" data-nw-about></div>
      <div class="nw-body nw-body-in">
        <label class="nw-fl" for="nw-pname"><span>name</span></label><input id="nw-pname" class="nw-mono" data-nw-name autocomplete="off" spellcheck="false" placeholder="MyPlugin">
        <label class="nw-fl" for="nw-pdesc"><span>about</span></label><input id="nw-pdesc" data-nw-desc autocomplete="off" placeholder="optional, goes in the .uplugin">
        <span></span><label class="tick"><input type="checkbox" data-nw-enable checked> turn it on in ${esc(meta.project || 'the project')}.uproject</label>
        <span class="nw-fl nw-top"><span>makes</span></span><div class="nw-res nw-res-files" data-nw-res aria-live="polite"></div>
      </div>
    </div>
  </div>`, "shows the plugin's folder in the explorer", true);
  const $ = <T extends HTMLElement>(s: string) => d.box.querySelector<T>(s)!;
  const name = $<HTMLInputElement>('[data-nw-name]'), desc = $<HTMLInputElement>('[data-nw-desc]'), en = $<HTMLInputElement>('[data-nw-enable]'), res = $('[data-nw-res]');
  const paintT = () => {
    for (const el of d.box.querySelectorAll<HTMLElement>('[data-nw-t]')) el.classList.toggle('on', list[+el.dataset.nwT!] === t);
    $('[data-nw-about]').innerHTML = `<span class="nw-big">${KIND_IC[t.icon] || KIND_IC.module}</span><div><b>${esc(t.name)}</b><p>${esc(t.about)}</p><code>Templates/${esc(t.id)}</code></div>`;
  };
  const paintRes = () => {
    const stop = name.value.trim() ? err || plan?.stop || '' : '';
    d.btn.disabled = !name.value.trim() || !plan || !!stop;
    if (!name.value.trim()) return void (res.innerHTML = stopBox('Type a name', 'a C++ name: letters, digits and _'), res.classList.add('idle'));
    res.classList.remove('idle');
    if (stop) return void (res.innerHTML = stopBox(stop.replace(/:.*$/, ''), stop.includes(':') ? stop.replace(/^[^:]*:\s*/, '') : ''));
    if (!plan) return;
    res.innerHTML = `<div class="nw-rl">${gem('folder')}<span class="nw-p"><span class="nw-f">${esc(plan.dir)}/</span></span><span class="nw-k ok">${plan.made.length} files</span></div><div class="nw-gets">${plan.made.map((p: string) => `<span title="${esc(`${p}\nOne of the files this makes.`)}" data-tip-mono>${gem('file')}${esc(p.split('/').pop()!)}</span>`).join('')}</div>` + (plan.enable ? fileRow(plan.owner, 'changed', 'ch') : '');
  };
  const req = (dry: boolean) => body({ kind: 'plugin', dry, name: name.value.trim(), template: t.id, description: desc.value.trim(), enable: en.checked });
  const dry = async () => {
    const my = ++seq;
    if (!name.value.trim()) return paintRes();
    try {
      const r = await api('POST', '/api/ue/new', req(true));
      if (my !== seq) return;
      [plan, err] = r.why ? [null, 'Not an Unreal project here'] : [r, ''];
    } catch (e) {
      if (my === seq) [plan, err] = [null, (e as Error).message];
    }
    if (my === seq) paintRes();
  };
  const dryLater = later(dry, 120);
  $('.nw-tl').addEventListener('mousedown', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-nw-t]');
    if (!el) return;
    e.preventDefault();
    t = list[+el.dataset.nwT!];
    paintT();
    dry();
  });
  name.addEventListener('input', () => (paintRes(), dryLater()));
  en.addEventListener('change', dry);
  d.go(async () => {
    if (d.btn.disabled) return tell(d.btn, { title: !name.value.trim() ? 'Type a name first' : err || plan?.stop || 'Not ready yet', ms: 2500 });
    d.btn.disabled = true;
    try {
      const r = await api('POST', '/api/ue/new', req(false));
      d.close();
      await finish(r, `made plugin ${r.name}`, []);
      page.reveal(r.made[0]);
    } catch (e) {
      err = (e as Error).message;
      paintRes();
      showErr(e);
    }
  });
  paintT();
  paintRes();
  name.focus();
}

export function openCreate(kind: Kind | string, dir = '') {
  if (!S.pid) return;
  if (!canCreate(kind as Kind)) return tell(null, { title: pref('ue:on') ? 'Not an Unreal project here' : 'Unreal support is off', line: pref('ue:on') ? 'no .uproject, or its engine isn\'t set up' : 'settings → unreal', ms: 2500 });
  if (kind === 'module') return moduleDialog(dir);
  if (kind === 'plugin') return pluginDialog();
  return classDialog(dir);
}

setCreate(openCreate);
