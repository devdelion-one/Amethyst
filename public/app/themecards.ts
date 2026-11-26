import { accentFor, THEMES, themeName } from '../base/theme.ts';
import { esc } from '../base/util.ts';

const CARDS: [string, string][] = [['ink', 'built in'], ['ink-light', 'light'], ['ash', 'calm'], ['slate', 'soft'], ['paper', 'warm light']];

function themeCard(name: string, tag: string, attr: string) {
  const t = THEMES[name], k = t.tokens, on = name === themeName();
  const v = `--w-ground:${k.ground};--w-chrome:${k.chrome};--w-bg:${k.bg};--w-acc:${accentFor(name)};--w-dim:${k['text-dim']};--w-txt:${k.text}`;
  return `<button class="wl-card${on ? ' on' : ''}" ${attr}="${name}" aria-pressed="${on}"><span class="wl-mini" style="${esc(v)}"><i></i><i></i></span><span class="wl-nm"><span class="tx">${esc(t.label)} <small>${esc(tag)}</small></span><span class="wl-tick">✓</span></span></button>`;
}

export const themeCards = (attr: string, names: string[] = CARDS.map(([n]) => n)) =>
  `<div class="wl-cards">${names.map((n) => themeCard(n, CARDS.find(([c]) => c === n)?.[1] || '', attr)).join('')}</div>`;
