import { store } from '../base/util.ts';

const RESET = 1159;
const KEYS = ['act:off', 'drafts:off', 'qterm:off', 'barend:off', 'modesHidden', 'quick', 'quick:order'];
if ((Number(store.get('rail:reset', 0)) || 0) < RESET) {
  for (const k of [...store.keys().filter((x) => x.startsWith('switch:rail')), ...KEYS]) store.del(k);
  store.set('rail:reset', RESET);
}
