import { tell } from '../base/notify.ts';
import { isOff, keyed, PLACES, pref, PREFS, setAt, setOff, setPref } from '../base/prefs.ts';
import { esc, setSave } from '../base/util.ts';

export type At = { place: string; key: string; id?: string; on?: () => boolean; tip?: () => string; set?: (v: boolean) => void; def?: boolean; fix?: boolean; why?: string };
export type Pick = { get: () => string; set: (v: string) => void; def: string; choices: () => [string, string, string][]; reset: string };
export type Row = { id: string; key: string; at: At[]; name?: string; linked?: boolean; choice?: boolean; blocked?: () => string; pick?: Pick; prep?: string; tail?: string; note?: () => string; here?: (a: At) => string; keep?: boolean; adv?: boolean };
export type Kit = { rsBtn: (tok: string, on: boolean) => string; redraw: () => void };
export type StdKit = Kit & { fold: (key: string, rows: string) => { cls: string; more: string } };
export type Part = {
  rows: () => Row[];
  sel: (a: At) => string;
  look: (r: Row) => string;
  example: (a: At) => string;
  extra?: (a: At) => string;
  home: string;
  each?: boolean;
};

const PARTS: Part[] = [];
let selectedRow = '';
let lit = '';
let kit: StdKit | null = null;
export const addPart = (p: Part) => (PARTS.push(p), p);
export const selectRow = (id: string) => { selectedRow = id; };

export const fixed = (a: At) => !!a.fix || (!a.id && !!PREFS[a.key].fixed);
export const isOn = (a: At) => (a.on ? a.on() : fixed(a) || (a.id ? !isOff(a.key, a.id) : !!pref(a.key, a.place)));
const setOn = (a: At, v: boolean) => (a.set ? (a.set(v), kit?.redraw()) : a.id ? setOff(a.key, a.id, !v) : setAt(a.key, a.place, v));
const defOf = (a: At) => a.def ?? (a.id ? !PREFS[a.key].def.includes(a.id) : PREFS[a.key].def);
export const tokOf = (a: At) => `${a.key}|${a.place}${a.id ? '|' + a.id : ''}`;
const atOfTok = (t: string): At => {
  const [key, place, id] = t.split('|');
  return id ? { key, place, id } : { key, place };
};

export function wordsOf(key: string, id?: string, name?: string) {
  const e = PREFS[key];
  if (!id) return { label: String(e.label || ''), on: keyed(e.on || ''), off: keyed(e.off || ''), fixed: '', desc: keyed(e.desc || ''), offWhen: e.offWhen, blocked: e.blocked };
  const w = e.each?.[id];
  return { label: w?.label || name || id, on: keyed(w?.on || e.on || ''), off: keyed(w?.off || e.off || ''), fixed: keyed(w?.fixed || ''), desc: keyed(e.tips?.[id] || ''), offWhen: w?.offWhen, blocked: w?.blocked };
}
const wordsAt = (a: At, r?: Row) => wordsOf(a.key, a.id, r?.name);

export const tipOf = (a: At, all = false, r?: Row) => a.tip ? a.tip() : `${wordsAt(a, r).label}: ${fixed(a) ? "always shown\nThis one can't be hidden." : all || rowOfAt(tokOf(a))?.linked ? (isOn(a) ? 'shown\nClick to hide it in every place.' : 'hidden\nClick to show it in every place.') : isOn(a) ? `shown ${prepOf(a)} ${PLACES[a.place][0]}\nClick to hide it there.` : `hidden ${prepOf(a)} ${PLACES[a.place][0]}\nClick to show it there.`}`;
export function mark(html: string, ats: At[], sel: (a: At) => string, ring: At | null = null, all = false) {
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const a of ats) {
    const el = t.content.querySelector<HTMLElement>(sel(a));
    if (!el) continue;
    el.dataset.hrAt = tokOf(a);
    el.classList.add('hr-keep');
    el.classList.toggle('hr-off', !isOn(a));
    el.classList.toggle('hr-ring', !!ring && tokOf(ring) === tokOf(a));
    el.hidden = false;
    el.title = tipOf(a, all);
    el.removeAttribute('data-tip');
  }
  for (const b of t.content.querySelectorAll<HTMLElement>('button:not([data-hr-at]), [tabindex="0"]:not([data-hr-at])')) b.tabIndex = -1;
  return t.innerHTML;
}
export function markAll(html: string, ats: At[], sel: (a: At) => string, ring: At) {
  const t = document.createElement('template');
  t.innerHTML = mark(html, ats, sel, ring);
  for (const a of ats) {
    const first = t.content.querySelector<HTMLElement>(`[data-hr-at="${CSS.escape(tokOf(a))}"]`);
    if (!first) continue;
    for (const el of t.content.querySelectorAll<HTMLElement>(sel(a))) {
      if (el === first) continue;
      el.dataset.hrAt = first.dataset.hrAt;
      el.classList.add('hr-keep');
      el.classList.toggle('hr-off', !isOn(a));
      el.classList.toggle('hr-ring', first.classList.contains('hr-ring'));
      el.title = first.title;
    }
  }
  return t.innerHTML;
}
export const pic = (html: string, place: string, cls = '') => `<div class="hr-pic${cls}" data-place="${place}">${html}</div>`;

const prepOf = (a: At) => rowOfAt(tokOf(a))?.prep || 'in';
const partOf = (r: Row) => PARTS.find((p) => p.rows().some((x) => x.id === r.id))!;
const choicesOf = (key: string) => (PREFS[key].choices || []) as [string, string, string][];
const segOf = (cur: string | null, attr: (v: string) => string, tip: (t: string) => string, key: string) =>
  `<span class="seg hr-seg${cur == null ? ' mix' : ''}">${choicesOf(key).map(([v, label, t]) => `<button class="chip${cur === v ? ' on' : ''}" ${attr(v)} aria-pressed="${cur === v}" title="${esc(`${label}\n${tip(t)}`)}">${esc(label)}</button>`).join('')}</span>`;
const placeSeg = (a: At) => `<div class="hr-pseg">${segOf(pref(a.key), (v) => `data-hr-ch="${esc(`${a.key}|${a.place}|${v}`)}"`, (t) => t, a.key)}<span>sets ${esc(PLACES[a.place][0])} only</span></div>`;
const placeSwitch = (a: At, label: string) => {
  const on = isOn(a);
  return `<div class="rail-place"><span>${esc(label)}</span><button class="set-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-hr-place="${esc(tokOf(a))}" aria-label="${esc(label)}"><span class="sw-o">Hidden</span><span class="sw-i">Shown</span></button></div>`;
};
function examples(r: Row, p: Part) {
  const many = !r.linked && !r.choice && !r.pick && r.at.filter((x) => !fixed(x)).length > 1;
  return r.at.map((a) => {
    const [, title, how] = PLACES[a.place];
    const ctl = r.choice ? placeSeg(a) : many && !fixed(a) ? placeSwitch(a, title) : '';
    const extra = p.extra?.(a) || '';
    return `<figure class="rail-fig"><figcaption><b>${esc(title)}</b> ${esc(keyed(how))}${extra}</figcaption>${ctl}<div class="rail-pic-ro">${p.example(a)}</div></figure>`;
  }).join('');
}
const names = (as: At[]) => {
  const w = as.map((a) => PLACES[a.place][0]);
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w.at(-1)}` : w[0];
};
const pickOf = (a: At) => choicesOf(a.key).find(([v]) => v === pref(a.key)) || ['', '', ''];
const same = (r: Row) => r.at.every((a) => pref(a.key) === pref(r.at[0].key));
function choiceState(r: Row) {
  if (same(r)) {
    const [, label, tip] = pickOf(r.at[0]);
    return `${esc(label)}${r.at.length === 2 ? ' in both lists' : r.at.length > 2 ? ' everywhere' : ''}. ${esc(tip)}`;
  }
  return r.at.map((a) => `${esc(pickOf(a)[1])} in ${esc(PLACES[a.place][0])}.`).join(' ');
}
const pickNow = (p: Pick) => p.choices().find(([v]) => v === p.get()) || ['', '', ''];
const pickState = (p: Pick) => (p.get() === 'hid' ? `<span class="h">${esc(pickNow(p)[2])}</span>` : esc(pickNow(p)[2]));
const noteOf = (r: Row) => {
  const n = r.note?.();
  return n ? ` <span class="q">${esc(n)}</span>` : '';
};
function stateOf(r: Row) {
  return stateWords(r) + noteOf(r);
}
function stateWords(r: Row) {
  const w = wordsAt(r.at[0], r), on = r.at.filter(isOn), off = r.at.filter((a) => !isOn(a));
  if (r.choice) return choiceState(r);
  if (r.pick) return pickState(r.pick);
  if (r.at.every(fixed)) return esc(w.fixed || "Always shown. It can't be hidden.");
  const why = r.blocked?.();
  if (why) return `<span class="h">${esc(why)}</span>`;
  if (w.blocked && pref(w.blocked[0])) return `<span class="h">${esc(w.blocked[1])}</span>`;
  if (!off.length) return esc(w.on);
  if (!on.length) return `<span class="h">${esc(w.offWhen && !pref(w.offWhen[0]) ? w.offWhen[1] : w.off)}</span>`;
  const p = r.prep || 'in';
  return `Shown ${p} ${esc(names(on))}. <span class="h">Hidden ${p} ${esc(names(off))}.${r.tail ? ' ' + esc(r.tail) : ''}</span>`;
}
function resetTok(r: Row) {
  if (r.pick) return r.pick.reset;
  const ats = r.at.filter((a) => !fixed(a));
  if (ats.some((a) => a.set)) return `s:${r.id}`;
  if (ats[0]?.id) return ats.map((a) => `i:${a.key}|${a.id}`).join(' ');
  return [...new Set(ats.map((a) => a.key))].map((k) => {
    const mine = r.at.filter((a) => a.key === k).map((a) => a.place), all = PREFS[k].places;
    return !all || all.every((p) => mine.includes(p)) ? `p:${k}` : `a:${k}|${mine.join(',')}`;
  }).join(' ');
}
const changed = (r: Row) => (r.pick ? r.pick.get() !== r.pick.def : r.choice ? r.at.some((a) => pref(a.key) !== PREFS[a.key].def) : r.at.some((a) => !fixed(a) && isOn(a) !== defOf(a)));
export const resetRow = (id: string) => rowById(id)?.at.forEach((a) => a.set?.(defOf(a)));
export const resetItem = (tok: string) => {
  const [k, id] = tok.split('|');
  setOff(k, id, PREFS[k].def.includes(id));
};

const findOf = (r: Row, w: ReturnType<typeof wordsOf>) => [w.desc, ...(r.pick ? r.pick.choices().flat() : [w.on, w.off, w.blocked?.[1], w.offWhen?.[1], ...choicesOf(r.at[0].key).flat()])].filter(Boolean).join(' ');
const pickSeg = (r: Row, p: Pick) => `<span class="seg hr-seg">${p.choices().map(([v, label, t]) => `<button class="chip${p.get() === v ? ' on' : ''}" data-hr-pk="${esc(`${r.id}|${v}`)}" aria-pressed="${p.get() === v}" title="${esc(`${label}
${t}`)}">${esc(label)}</button>`).join('')}</span>`;
const allSeg = (r: Row) => segOf(same(r) ? pref(r.at[0].key) : null, (v) => `data-hr-chall="${esc(`${r.id}|${v}`)}"`, (t) => `${t}${r.at.length > 1 ? '\nSets both lists.' : ''}`, r.at[0].key);
export function rowHtml(r: Row) {
  const w = wordsAt(r.at[0], r), on = r.choice ? r.at : r.pick ? (r.pick.get() === 'hid' ? [] : r.at) : r.at.filter(isOn), off = r.choice || r.pick ? [] : r.at.filter((a) => !isOn(a));
  const many = !r.linked && r.at.filter((a) => !fixed(a)).length > 1;
  const sw = r.pick ? pickSeg(r, r.pick) : r.choice ? allSeg(r) : r.at.every(fixed) ? '' : `<button class="set-sw${off.length ? (on.length ? ' mix' : '') : ' on'}" role="switch" aria-checked="${off.length ? (on.length ? 'mixed' : 'false') : 'true'}" data-hr-sw="${esc(r.id)}" aria-label="${esc(w.label)}"${many ? ' title="Every place&#10;Turns it on or off in every place at once."' : ''}><span class="sw-o">Hidden</span><span class="sw-i">Shown</span></button>`;
  return `<div class="set-row hr-row${r.choice || r.pick ? ' hr-ch' : ''}${selectedRow === r.id ? ' active' : ''}${on.length ? '' : ' hid'}${r.adv ? ' set-adv' : ''}${lit === r.id ? ' lit' : ''}" data-row="${esc(r.id)}" data-hr="${esc(r.id)}" data-hr-keys="${esc([...new Set(r.at.map((a) => a.key))].join(' '))}" data-find="${esc(findOf(r, w))}">` +
    `<button class="sr-t hr-fold" data-hr-fold="${esc(r.id)}"><span class="lbl">${esc(w.label)}</span><span class="hr-state">${stateOf(r)}</span></button>` +
    `${kit!.rsBtn(resetTok(r), changed(r))}<span class="set-opts">${sw}</span></div>`;
}
export function railHtml(root: ParentNode): string {
  const rows = [...root.querySelectorAll<HTMLElement>('.hr-row:not(.set-miss)')];
  if (!rows.length) return '';
  let active = rows.find((x) => x.dataset.hr === selectedRow);
  if (!active) {
    active = rows[0];
    selectedRow = active.dataset.hr || '';
  }
  for (const x of rows) x.classList.toggle('active', x === active);
  const r = rowById(selectedRow);
  if (!r) return '';
  const p = partOf(r), w = wordsAt(r.at[0], r);
  return `<div class="rail-kicker">Visual reference</div>` +
    `<div class="rail-title">${esc(w.label)}</div>` +
    (w.desc ? `<div class="rail-desc">${esc(w.desc)}</div>` : '') +
    `<div class="rail-where">${examples(r, p)}</div>` +
    `<div class="rail-ro">Previews are read-only. Use the controls on the left to change settings.</div>`;
}
export function box(id: string, title: string, inner: string, sub = '') {
  const { cls, more } = kit!.fold(id, inner);
  return `<div class="box set-grp hr-grp${cls}" data-hr-box="${id}"><span class="bt">${esc(title)}</span>${sub ? `<div class="hr-sub">${esc(sub)}</div>` : ''}${inner}${more}</div>`;
}
export const subh = (t: string) => `<div class="hr-subh">${esc(t)}</div>`;
export const bigPic = (html: string, cap: string, flat = false, each = false) => `<div class="hr-big${flat ? ' flat' : ''}${each ? ' each' : ''}">${html}<div class="hr-cap">${esc(cap)}</div></div>`;

const allRows = () => PARTS.flatMap((p) => p.rows());
export const stdKeys = (): string[] => [...new Set(allRows().flatMap((r) => r.at.map((a) => a.key)))];
export const homeOf = (k: string) => PARTS.find((p) => p.rows().some((r) => r.id === k || r.key === k || r.at.some((a) => a.key === k)))?.home || '';
const rowById = (id: string) => allRows().find((r) => r.id === id);
const rowOfAt = (tok: string) => allRows().find((r) => r.at.some((a) => tokOf(a) === tok));
const say = (r: Row, v: boolean, many: boolean) => setSave(`${wordsAt(r.at[0], r).label}: ${v ? 'shown' : 'hidden'}${many ? ' everywhere' : ''}`);
const pickSay = (r: Row, v: string, where: string) => setSave(`${wordsAt(r.at[0], r).label}: ${(r.pick ? r.pick.choices() : choicesOf(r.at[0].key)).find(([c]) => c === v)?.[1] || v}${where}`);
const pickTo = (r: Row, v: string) => (r.pick!.set(v), pickSay(r, v, ''), true);
export function stdClick(t: Element): boolean {
  if (t.closest('.rail-pic-ro')) return true;
  const pl = t.closest<HTMLElement>('[data-hr-place]');
  if (pl) {
    const r = rowOfAt(pl.dataset.hrPlace!), a = r?.at.find((x) => tokOf(x) === pl.dataset.hrPlace) || atOfTok(pl.dataset.hrPlace!);
    if (!r || fixed(a)) return true;
    selectedRow = r.id;
    setOn(a, !isOn(a));
    setSave(`${wordsAt(a, r).label}: ${isOn(a) ? 'shown' : 'hidden'} in ${PLACES[a.place][0]}`);
    return true;
  }
  const pk = t.closest<HTMLElement>('[data-hr-pk]');
  if (pk) {
    const [id, v] = pk.dataset.hrPk!.split('|');
    selectedRow = id;
    return pickTo(rowById(id)!, v);
  }
  const ch = t.closest<HTMLElement>('[data-hr-ch]');
  if (ch) {
    const [key, place, v] = ch.dataset.hrCh!.split('|'), r = allRows().find((x) => x.at.some((a) => a.key === key));
    if (r) selectedRow = r.id;
    setPref(key, v);
    if (r) pickSay(r, v, ` in ${PLACES[place][0]}`);
    return true;
  }
  const chall = t.closest<HTMLElement>('[data-hr-chall]');
  if (chall) {
    const [id, v] = chall.dataset.hrChall!.split('|'), r = rowById(id)!;
    selectedRow = id;
    for (const a of r.at) setPref(a.key, v);
    pickSay(r, v, r.at.length > 1 ? ' everywhere' : '');
    return true;
  }
  const sw = t.closest<HTMLElement>('[data-hr-sw]');
  if (sw) {
    const r = rowById(sw.dataset.hrSw!)!, ats = r.at.filter((a) => !fixed(a)), v = !ats.every(isOn);
    selectedRow = r.id;
    for (const a of ats) setOn(a, v);
    say(r, v, ats.length > 1);
    return true;
  }
  const at = t.closest<HTMLElement>('[data-hr-at]');
  if (at) {
    const r = rowOfAt(at.dataset.hrAt!), a = r?.at.find((x) => tokOf(x) === at.dataset.hrAt) || atOfTok(at.dataset.hrAt!);
    if (fixed(a)) return tell(at, { title: 'This one always shows', line: a.why || "the close button can't be hidden in a chat window", ms: 2500 }), true;
    if (!r) return true;
    selectedRow = r.id;
    if (r.pick) return pickTo(r, r.keep ? a.place : r.pick.get() === a.place ? r.at.find((x) => x.place !== a.place)!.place : a.place);
    const big = at.closest('.hr-big');
    if (big) lit = r.id;
    if ((big && !big.classList.contains('each')) || r.linked) {
      const v = !isOn(a), ats = r.at.filter((x) => !fixed(x));
      for (const x of ats) setOn(x, v);
      say(r, v, ats.length > 1);
      return true;
    }
    setOn(a, !isOn(a));
    setSave(`${wordsAt(a, r).label}: ${isOn(a) ? 'shown' : 'hidden'} in ${PLACES[a.place][0]}`);
    return true;
  }
  const f = t.closest<HTMLElement>('[data-hr-fold]');
  if (f) {
    selectedRow = f.dataset.hrFold!;
    kit!.redraw();
    return true;
  }
  return !!t.closest('.hr-pic, .hr-look');
}
export function stdHover(root: HTMLElement, t: Element) {
  const b = t.closest<HTMLElement>('.hr-pic [data-hr-at]');
  const id = b ? rowOfAt(b.dataset.hrAt!)?.id || '' : t.closest('.hr-big') ? lit : '';
  if (id === lit) return;
  lit = id;
  root.querySelectorAll<HTMLElement>('.hr-row').forEach((r) => r.classList.toggle('lit', r.dataset.hr === lit));
}
export const stdInit = (k: StdKit) => (kit = k);

const LOOK_H = 36;
const BAR_MIN = 0.6;
const rgba = (color: string): number[] => {
  const n = (color.match(/[\d.]+(?:e-?\d+)?/g) || []).map(Number), [r, g, b] = color.startsWith('color(') ? n.map((x) => x * 255) : n;
  return [r, g, b, n[3] ?? 1];
};
export function drawnLeft(cell: Element, it: Element): number {
  let left = Infinity;
  const under = rgba(getComputedStyle(cell.closest('.hr-grp') || cell).backgroundColor);
  const seen = (color: string) => {
    const c = rgba(color);
    return c[3] > 0 && c.slice(0, 3).some((x, i) => Math.abs(x - under[i]) > 2);
  };
  for (const n of [it, ...it.querySelectorAll<HTMLElement>('*')]) {
    const q = n.getBoundingClientRect();
    if ((!q.width && !q.height) || n.parentElement?.closest('svg')) continue;
    const c = getComputedStyle(n), lined = (side: string) => c.getPropertyValue(`${side}-style`) !== 'none' && parseFloat(c.getPropertyValue(`${side}-width`)) > 0 && seen(c.getPropertyValue(`${side}-color`));
    if (n.matches('svg, img, canvas, input') || seen(c.backgroundColor) || c.backgroundImage !== 'none' || c.boxShadow !== 'none' || ['border-left', 'border-top', 'border-bottom', 'outline'].some(lined)) left = Math.min(left, c.animationName === 'none' ? q.left : q.left + q.width / 2 - (parseFloat(c.width) || q.width) / 2);
    for (const t of n.childNodes) {
      if (t.nodeType !== 3 || !t.nodeValue?.trim()) continue;
      const r = new Range();
      r.selectNodeContents(t);
      left = Math.min(left, r.getBoundingClientRect().left);
    }
    for (const part of ['::before', '::after']) {
      const p = getComputedStyle(n, part);
      if (p.content === 'none' || p.content === 'normal' || p.display === 'none') continue;
      left = Math.min(left, q.left + (p.position === 'absolute' && c.position !== 'static' ? parseFloat(p.left) || 0 : parseFloat(c.paddingLeft) || 0));
    }
  }
  return left;
}
export function fitLooks(root: ParentNode) {
  const cells = [...root.querySelectorAll<HTMLElement>('.hr-look')].map((cell) => ({ cell, it: cell.firstElementChild as HTMLElement | null })).filter((c) => c.it && c.cell.getClientRects().length);
  for (const { it } of cells) it!.style.transform = '';
  const plans = cells.map(({ cell, it }) => {
    const box = cell.getBoundingClientRect();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const n of [it!, ...it!.querySelectorAll('*')]) {
      const q = n.getBoundingClientRect();
      if (!q.width && !q.height) continue;
      l = Math.min(l, q.left);
      t = Math.min(t, q.top);
      r = Math.max(r, q.right);
      b = Math.max(b, q.bottom);
    }
    const w = r - l, h = b - t, o = it!.getBoundingClientRect();
    if (!(w > 0 && h > 0) || !box.width) return null;
    const at = drawnLeft(cell, it!);
    const sc = Math.min(LOOK_H / h, box.width / w, 1), ox = o.left + o.width / 2, oy = o.top + o.height / 2;
    return { it: it!, sc, tx: box.left - ox - sc * ((at < r ? at : l) - ox), ty: box.top + box.height / 2 - oy - sc * ((t + b) / 2 - oy) };
  });
  for (const p of plans) if (p) p.it.style.transform = `translate(${p.tx.toFixed(2)}px, ${p.ty.toFixed(2)}px) scale(${p.sc.toFixed(4)})`;
  for (const f of root.querySelectorAll<HTMLElement>('.hr-tbar')) {
    const bar = f.firstElementChild as HTMLElement | null;
    if (!bar || !f.getClientRects().length) continue;
    bar.style.zoom = '';
    const z = f.clientWidth / bar.scrollWidth;
    if (z < 1) bar.style.zoom = String(Math.max(BAR_MIN, Math.floor(z * 1000) / 1000));
  }
}
