import { setSolid, setTheme } from '../base/theme.ts';
import { store } from '../base/util.ts';
import { noticeCard } from './card.ts';
import type { Got, Why } from './card.ts';

const desk = window.amethyst?.report;
const q = new URLSearchParams(location.search);
const id = q.get('id') || '';
const why = (['done', 'error', 'asks', 'cold'].includes(q.get('w') || '') ? q.get('w') : 'done') as Why;
const line = q.get('l') || '';
const am = Math.max(1, Number(q.get('am')) || 1);

const act = (what: 'size' | 'close' | 'go', n = 0) => {
  document.body.dataset.act = what === 'size' ? document.body.dataset.act || '' : what;
  desk?.act?.(what, n);
};

setTheme(store.text('theme3')!);
setSolid(store.text('solid')!);
addEventListener('storage', (e) => (e.key === 'mind.theme3' ? setTheme(e.newValue!) : e.key === 'mind.solid' && setSolid(e.newValue!)));

async function load(): Promise<Got> {
  try {
    const r = await fetch('/api/chats/report?id=' + encodeURIComponent(id));
    const j = await r.json();
    if (r.ok) return j;
  } catch {}
  return { id, chat: q.get('c') || '', title: q.get('t') || '', status: 'ended', am, pid: '', report: true, text: '', asked: '', asks: [] };
}

const g = await load();
const card = noticeCard(g, why, line, { close: () => act('close'), go: () => act('go', g.am || am) });
document.body.append(card);
document.title = `${g.chat} · notice · Amethyst`;
const fit = () => act('size', Math.ceil(card.getBoundingClientRect().height));
new ResizeObserver(fit).observe(card);
fit();
const lit = (on: boolean) => card.classList.toggle('sel', on);
addEventListener('focus', () => {
  lit(true);
  if (!card.contains(document.activeElement)) card.focus();
});
addEventListener('blur', () => lit(false));
document.addEventListener('pointerdown', () => lit(true));
