import { bound, is } from '../base/binds.ts';
import { dragWindow } from '../base/controls.ts';
import { setTheme } from '../base/theme.ts';
import { addrPlace, amTag, placeKey, store } from '../base/util.ts';
import { paint, setHooks } from './column.ts';
import { D, followProject, onDebug } from './state.ts';
import type { Frame } from './state.ts';

const at = addrPlace();
const send = (k: string, arg: unknown = null) => store.set('debug:cmd', { k, arg, to: placeKey(at.wid, at.pid), at: Date.now() });

setHooks({
  start: (mode) => send('start', mode),
  go: () => send('go'),
  pause: () => send('pause'),
  step: (how) => send('step', how),
  stop: (end) => send('stop', !!end),
  restart: () => send('restart'),
  install: () => send('install'),
  remove: () => send('remove'),
  openFrame: (f: Frame) => send('open', f),
});

setTheme(store.text('theme3')!);
document.title = amTag + 'debugger · Amethyst';
followProject(at.pid, at.wid);
paint();
const head = document.querySelector<HTMLElement>('#dbg .dhd');
if (head) dragWindow(head);

addEventListener('storage', (e) => {
  if (e.key === 'mind.theme3') setTheme(e.newValue as string);
});
onDebug(() => (document.title = `${D.session?.state === 'stopped' ? '● ' : ''}${amTag}debugger · Amethyst`));

const KEYS: [string, string, unknown?][] = [['debugGo', 'go'], ['debugPause', 'pause'], ['debugStop', 'stop', false], ['debugOver', 'step', 'over'], ['debugInto', 'step', 'into'], ['debugOut', 'step', 'out']];
addEventListener('keydown', (e) => {
  const hit = KEYS.find(([id]) => bound(id) && is(e, id));
  if (!hit) return;
  e.preventDefault();
  send(hit[1], hit[2] ?? null);
});
