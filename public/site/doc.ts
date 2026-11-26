import { discordAsk } from './discord.ts';

discordAsk();
for (const a of document.querySelectorAll('.site-download')) a.addEventListener('click', () => navigator.sendBeacon('/hit?e=download'));

const box = document.querySelector('.doc-modal') as HTMLDialogElement | null;
if (box) {
  document.querySelector('.doc-open')!.addEventListener('click', () => box.showModal());
  box.querySelector('.doc-close')!.addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
}

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORDS = ['every agent', 'every terminal', 'every file', 'every project', 'every idea'];
const word = document.querySelector('.doc-foot-words span')!;
let n = 0;
setInterval(() => {
  n = (n + 1) % WORDS.length;
  word.textContent = WORDS[n];
  if (!still) word.animate([{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 500, easing: 'cubic-bezier(.2,.7,.2,1)' });
}, 2600);

const mark = document.querySelector('.doc-foot-mark > span') as HTMLElement;
const fit = () => {
  mark.style.fontSize = '100px';
  mark.style.fontSize = `min(${(100 * 100) / mark.scrollWidth}cqw, 22vh)`;
};
document.fonts.ready.then(fit);
addEventListener('resize', fit);
