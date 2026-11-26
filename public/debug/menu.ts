import { chip } from '../base/controls.ts';
import { esc } from '../base/util.ts';

export const mrow = (attrs: string, ic: string, label: string, o: { tip?: string; key?: string; off?: boolean; cls?: string } = {}) =>
  `<button class="mi${o.cls ? ' ' + o.cls : ''}" ${attrs}${o.tip ? ` title="${esc(label)}&#10;${esc(o.tip)}"` : ''}${o.off ? ' disabled' : ''}><i class="tb-ic">${ic}</i><span class="mi-n">${esc(label)}</span>${chip(o.key || '')}</button>`;
