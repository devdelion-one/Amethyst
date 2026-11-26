import { md, pathChip } from '../base/chattext.ts';
import { imgTag } from '../base/chips.ts';
import { icon } from '../base/icon.ts';
import { addPart, box, markAll, pic, rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';

export const LINKS_LEAD = 'Links in chats, and chips in text boxes. Click a switch, or the ringed part in the picture a row opens, to hide or show it.';

const SEL: Record<string, string> = { linkCopy: '.lk-copy', linkMarks: '.hr-lkmk', chipX: '.chip-x', picCopy: '.img-copy' };
const sel = (a: At) => SEL[a.key] || '';
const one = (key: string, place: string): Row => ({ id: key, key, at: [{ key, place }] });
const linkRows = (): Row[] => [one('linkCopy', 'chatlk'), one('linkMarks', 'chatlk')];
const chipRows = (): Row[] => [one('chipX', 'chipbox'), one('picCopy', 'chipbox')];

const CTX = { root: 'C:/project', icon };
const PIC = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14"><rect width="14" height="14" fill="#cfd6e4"/><rect y="9" width="14" height="5" fill="#8fa3c0"/><circle cx="10" cy="4" r="2" fill="#f5f0d8"/></svg>');
const ANSWER = 'Changed `docs/notes.md` and `plan.md:3`. See [the guide](https://example.com/guide) or mail [ana@example.com](mailto:ana@example.com).';
const marked = (html: string) => html.replace(/(<a class="lk lk-(?:web|mail)"[^>]*>)([^<]*)<\/a>/g, '$1$2<span class="hr-lkmk"><i class="hr-lkmark"></i></span></a>');
const chatHtml = () => `<div class="ch-ai hr-chatlk">${marked(md(ANSWER, CTX))}</div>`;
const chip = () => imgTag('sketch.png', PIC);
const textHtml = () => `<div class="hr-tx"><span class="hr-gut">1</span><span class="hr-ln">look at ${chip()} and the plan</span></div>`;

function example(a: At) {
  const ats = (a.place === 'chatlk' ? linkRows() : chipRows()).map((r) => r.at[0]);
  return pic(markAll(a.place === 'chatlk' ? chatHtml() : textHtml(), ats, sel, a), a.place, ' hr-dk');
}
function lookOf(r: Row) {
  const a = r.at[0];
  const html = a.key === 'linkCopy' ? `<span class="ch-ai hr-lkl">${pathChip('docs/notes.md', CTX)}</span>`
    : a.key === 'linkMarks' ? `<span class="ch-ai hr-lkl">${marked(md('[the guide](https://example.com/guide)', CTX)).replace(/<\/?p>/g, '')}</span>`
    : `<span class="hr-tx hr-lkl">${chip()}</span>`;
  const t = document.createElement('template');
  t.innerHTML = html.replace(/<button /g, '<button tabindex="-1" ').replace(/ title="[^"]*"/g, '');
  for (const el of t.content.querySelectorAll(sel(a))) el.classList.add('hr-keep');
  return t.innerHTML;
}

addPart({ rows: () => [...linkRows(), ...chipRows()], sel, look: lookOf, example, home: 'show/links', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function linksPartHtml() {
  return box('links', 'Links in chats', rows(linkRows()), "Links in an agent's answer, in a chat. A file link opens the file, a web link the page, a mail link a new mail. Open a row to see its part, ringed.") +
    box('chips', 'Chips in a text box', rows(chipRows()), 'A picture or a file you add to a text box, such as the chat box or the scratch pad, shows as a small chip in the text.');
}
