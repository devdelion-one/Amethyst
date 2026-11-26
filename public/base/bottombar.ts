import { $ } from './util.ts';

export function toggleBottomBar(hide = !$('#app')?.classList.contains('nostatus')) {
  $('#app')?.classList.toggle('nostatus', hide);
}
