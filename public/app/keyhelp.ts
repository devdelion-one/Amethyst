import { ICONS } from '../base/controls.ts';
import { keyText } from '../base/keycap.ts';
import { modeFns } from '../base/model.ts';
import { isOff, onPref } from '../base/prefs.ts';
import { $, esc } from '../base/util.ts';

const GROUPS: [string, [string, string][]][] = [
  ['Go to', [['modeChat', 'Agents'], ['modeEditor', 'Editor'], ['modeTerm', 'Terminals'], ['modeOrch', 'Orchestration']]],
  ['Chats', [['newAgentKey', 'New chat'], ['modelNextKey', 'Next model'], ['modelPrevKey', 'Model before'], ['modeKey', 'Next mode'], ['clearKey', 'Clear the chat'], ['find', 'Find']]],
  ['Show and hide', [['explorerKey', 'Explorer'], ['quickTerm', 'Quick terminal'], ['bottomBarKey', 'Bottom bar']]],
  ['', [['commands', 'Every command']]],
];
const MODE: Record<string, string> = { modeChat: 'chat', modeEditor: 'editor', modeTerm: 'term', modeOrch: 'orch' };

const btn = document.querySelector<HTMLElement>('#btn-keys');
let box: HTMLElement = null as unknown as HTMLElement;

const keyOf = (id: string) => keyText(id) || (MODE[id] && modeFns()[MODE[id]]) || '';
const caps = (k: string) => (k ? k.split(' ').map((p) => `<kbd>${esc(p)}</kbd>`).join('') : '<span class="kh-none">no key</span>');

function draw() {
  box.innerHTML = GROUPS.map(([head, rows]) => `<div class="kh-g${head ? '' : ' kh-last'}">${head ? `<div class="kh-h">${esc(head)}</div>` : ''}${rows.map(([id, name]) => `<div class="kh-r"><span>${esc(name)}</span><span class="kh-k">${caps(keyOf(id))}</span></div>`).join('')}</div>`).join('');
}

function place() {
  const b = btn!.getBoundingClientRect();
  box.style.right = Math.max(8, innerWidth - b.right) + 'px';
  box.style.bottom = innerHeight - $('#status').getBoundingClientRect().top + 6 + 'px';
}

function away(e: PointerEvent) {
  if (!(e.target as Element).closest?.('#keyhelp, #btn-keys')) toggle(false);
}
function closeKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  toggle(false);
}

function toggle(open: boolean) {
  box.hidden = !open;
  btn!.classList.toggle('on', open);
  btn!.setAttribute('aria-expanded', String(open));
  for (const [type, fn] of [['pointerdown', away], ['keydown', closeKey]] as [string, (e: any) => any][]) (open ? addEventListener : removeEventListener)(type, fn, true);
  (open ? addEventListener : removeEventListener)('resize', place);
  if (!open) return btn!.blur();
  draw();
  place();
}

if (btn) {
  btn.innerHTML = ICONS.help;
  box = Object.assign(document.createElement('section'), { id: 'keyhelp', className: 'float', hidden: true });
  box.setAttribute('aria-label', 'keys');
  document.body.append(box);
  btn.addEventListener('click', () => toggle(box.hidden));
  onPref('bar:off', () => !box.hidden && isOff('bar:off', 'keys') && toggle(false));
}
