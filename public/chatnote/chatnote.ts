import { bound, is, show as keyName } from '../base/binds.ts';
import { NOTE_IC } from '../base/agentrow.ts';
import { crystalOf } from '../base/agentlook.ts';
import { chatHere } from '../base/chatat.ts';
import { onOutside } from '../base/lift.ts';
import { api, S } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { agents } from '../base/stream.ts';
import { esc, showErr } from '../base/util.ts';

const SAVE_MS = 400;
const NOTE_MAX = 2000;
const box = document.createElement('section');
box.id = 'chatnote';
box.setAttribute('role', 'dialog');
box.setAttribute('aria-label', 'note');
box.hidden = true;
box.innerHTML = `<div class="cn-head">${NOTE_IC}<span>note on</span><b class="cn-code"></b><span class="cn-t"></span><span class="cn-k"></span></div><textarea class="cn-text" spellcheck="true" maxlength="${NOTE_MAX}" placeholder="a note on this chat" aria-label="the note"></textarea>`;
document.body.append(box);
const text = box.querySelector('textarea')!;
let chat: string | null = null, back: HTMLElement | null = null, kept = '', timer = 0, unOutside: (() => void) | null = null;

const shown = (el: Element | null | undefined): el is HTMLElement => !!el && (el as HTMLElement).isConnected && (el as HTMLElement).offsetWidth > 0;
const viewOf = (id: string) => [...document.querySelectorAll<HTMLElement>('.chat[data-chat]')].find((x) => x.dataset.chat === id && shown(x));

function save() {
  clearTimeout(timer);
  timer = 0;
  const id = chat, now = text.value.trim();
  if (!id || now === kept) return;
  kept = now;
  const a = agents.all.get(id);
  api('POST', '/api/chats/note', { chat: id, text: now }, a?.pid ?? S.pid).catch(showErr);
}

const ROOM = 8, ABOVE = 35;

function place() {
  if (box.hidden) return;
  const v = chat ? viewOf(chat) : null;
  box.style.left = box.style.top = box.style.translate = '';
  if (!v) return;
  const r = v.getBoundingClientRect(), lh = parseFloat(getComputedStyle(text).lineHeight) || 20;
  const w = box.offsetWidth, h = box.querySelector<HTMLElement>('.cn-head')!.offsetHeight + 6 * lh + 20;
  const x = r.left + r.width / 2, y = r.top + r.height / 2 - ABOVE;
  if (w + 2 * ROOM > r.width || y - ROOM < r.top || y + h + ROOM > r.bottom) return;
  box.style.left = `${Math.round(x)}px`;
  box.style.top = `${Math.round(y)}px`;
}

function hide() {
  if (box.hidden) return;
  save();
  box.hidden = true;
  box.style.left = box.style.top = box.style.translate = '';
  unOutside?.();
  unOutside = null;
  const id = chat, to = back;
  chat = back = null;
  if (to?.isConnected && shown(to) && (!id || to.closest('.chat[data-chat]') === viewOf(id))) return to.focus();
  const v = id ? viewOf(id) : null;
  v?.querySelector<HTMLElement>('.ch-ta .cm-content, .ch-ta [contenteditable="true"], .ch-ta textarea')?.focus();
}

function open(id: string) {
  const a = agents.all.get(id);
  if (!a) return;
  if (!box.hidden) hide();
  const { code, color } = crystalOf(id), k = keyName(bound('noteKey'));
  back = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  chat = id;
  kept = (a.note || '').trim();
  box.style.setProperty('--gem-c', color);
  box.querySelector('.cn-code')!.textContent = code;
  box.querySelector('.cn-k')!.innerHTML = k ? esc(k) : '';
  text.value = a.note || '';
  box.hidden = false;
  place();
  text.focus();
  text.setSelectionRange(text.value.length, text.value.length);
  unOutside = onOutside([box, '[data-dk-note]'], hide);
}

export function toggleNote(id: string) {
  if (!box.hidden && chat === id) return hide();
  open(id);
}

window.addEventListener('keydown', (e) => {
  if (!is(e, 'noteKey')) return;
  if (!box.hidden) {
    e.preventDefault();
    e.stopPropagation();
    return hide();
  }
  const f = document.activeElement as HTMLElement | null;
  if (f?.closest?.('.xterm') || document.querySelector('#modal:not([hidden]), #palette:not([hidden]), #fpick:not([hidden])')) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  const id = chatHere();
  if (id && agents.all.has(id)) return open(id);
  const over = (f && f !== document.body ? f.closest<HTMLElement>('.oc, .dk-cell, .grp, section') : null) || document.body;
  tell(over, { title: 'No chat here to note', line: `Press ${keyName(bound('noteKey')) || 'the note key'} in a chat`, ms: 2500 });
}, true);

window.addEventListener('resize', place);

text.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    return hide();
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    return hide();
  }
});
text.addEventListener('input', () => {
  clearTimeout(timer);
  timer = window.setTimeout(save, SAVE_MS);
});

document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest?.<HTMLElement>('[data-dk-note]');
  if (!b?.dataset.dkNote) return;
  e.preventDefault();
  toggleNote(b.dataset.dkNote);
});
