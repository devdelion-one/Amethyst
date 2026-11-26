import { esc } from './util.ts';

const HIDDEN = /\r(?!\n)|[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\u00AD\u034F\u061C\u180E\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

const tag = (c: string) => `‹U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}›`;

export function codeBox(code: string) {
  const lines = code.replace(/\r\n/g, '\n').split('\n').length;
  const parts = code.split(HIDDEN).map(esc), hid = code.match(HIDDEN) || [];
  const body = parts.reduce((html, part, i) => `${html}<span class="m-hid">${esc(tag(hid[i - 1]))}</span>${part}`);
  return `<div class="m-codebox">${lines > 1 ? `<span class="m-lines">${lines} lines</span>` : ''}<pre class="ask-cmd m-code">\n${body}</pre></div>`;
}
