import { setTheme } from '../base/theme.ts';
import { store } from '../base/util.ts';

type Row = { id?: string; text: string; time: string };

setTheme(store.text('theme3')!);
const q = new URLSearchParams(location.search), card = document.getElementById('ft')!, t = document.getElementById('ft-t')!;
if (q.get('k') === 'usage') document.title = 'usage · Amethyst';
const el = (tag: string, cls: string, text?: string) => Object.assign(document.createElement(tag), { className: cls, textContent: text ?? '' });
const act = (what: string) => window.amethyst!.toastAct(what);
const button = (label: string, tip: string, what: string) => Object.assign(el('button', '', label) as HTMLButtonElement, { title: tip, onclick: () => act(what) });
const close = card.querySelector(':scope > button') as HTMLButtonElement;
if (q.has('l')) {
  const { items, more } = JSON.parse(q.get('l')!) as { items: Row[]; more: number };
  card.classList.add('list');
  t.classList.add('fl');
  const svg = (d: string, s = 20) => `<svg class="ic" viewBox="0 0 ${s} ${s}" aria-hidden="true">${d}</svg>`;
  const set = button('', 'change the times', 'settings');
  set.dataset.fl = 'settings';
  set.ariaLabel = 'settings';
  set.innerHTML = svg('<path d="M3 5.5h7.5M14.5 5.5H17M3 10h2.5M9.5 10H17M3 14.5h6.5M13.5 14.5H17"/><circle cx="12.5" cy="5.5" r="2"/><circle cx="7.5" cy="10" r="2"/><circle cx="11.5" cy="14.5" r="2"/>');
  const h = el('span', 'fl-h'), hb = el('span', 'fl-bt');
  hb.append(set, close);
  h.append(el('b', '', "don't forget"), el('span', 'fl-n', String(items.length + more)), hb);
  const rows = el('span', 'fl-rows');
  const pick = (cls: string, tip: string, label: string, ic: string) => Object.assign(el('button', cls), { title: tip, ariaLabel: label, ariaPressed: 'false', innerHTML: ic });
  for (const i of items) {
    const r = el('span', 'fl-r' + (i.time === 'now' ? ' due' : '')), bt = el('span', 'fl-bt');
    r.dataset.id = i.id || '';
    bt.append(pick('fl-done', 'done', 'done', svg('<path d="m3 8.5 3.2 3L13 4.5"/>', 16)), pick('fl-rm', 'remove from the list', 'remove', svg('<path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/>')));
    r.append(el('span', 'fl-t', i.text), el('i', '', i.time), bt);
    rows.append(r);
  }
  if (more) rows.append(el('span', 'fl-more', `and ${more} more`));
  if (!items.length) rows.append(el('span', 'fl-empty', "nothing to remember yet"));
  t.append(h, rows);
  const b = el('span', 'fl-b'), go = items.length ? button('confirm', 'the picked ones leave the list', '') : button('add one', "a new don't forget", 'add');
  go.dataset.fl = items.length ? 'confirm' : 'add';
  go.disabled = !!items.length;
  let held = false;
  rows.onclick = (e) => {
    const p = (e.target as Element).closest('.fl-done, .fl-rm');
    if (!p) return;
    const on = p.ariaPressed !== 'true';
    p.closest('.fl-bt')!.querySelectorAll('button').forEach((x) => (x.ariaPressed = String(on && x === p)));
    const any = !!rows.querySelector('[aria-pressed="true"]');
    go.disabled = !any;
    if (any && !held) (held = true), act('hold');
  };
  if (items.length) go.onclick = () => act('confirm:' + [...rows.querySelectorAll<HTMLElement>('.fl-r:has([aria-pressed="true"])')].map((r) => r.dataset.id).join(','));
  b.append(go);
  t.append(b);
} else if (q.has('id')) {
  const set = store.get('forget:colors', []) as (string | null)[];
  set.forEach((c, i) => c && document.documentElement.style.setProperty(`--fg-c${i + 1}`, c));
  card.style.setProperty('--c', `var(--fg-c${q.get('v') || 1})`);
  card.classList.add('ans');
  const x = el('span', 'ft-x');
  x.append(el('b', '', "don't forget: "), q.get('t') || '');
  const b = el('span', 'fg-ans'), id = q.get('id'), again = q.get('a') || 'again', ok = again === 'ok';
  for (const [act, label, tip] of [[ok ? 'ok' : 'again', again, ok ? 'seen: it keeps counting' : 'remind me again'], ['done', 'done', 'mark it done']])
    b.append(button(label, tip, `${act}:${id}`));
  t.append(x, b);
} else t.textContent = q.get('t') || '';
close.onclick = () => act('close');
