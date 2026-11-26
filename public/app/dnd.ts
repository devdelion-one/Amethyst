import { copyIn, moveDir, moveItem, moveMany, newFolder, placeThought, reorderFolder } from './actions.ts';
import { dragKeys } from '../base/controls.ts';
import { web } from '../minds/minds.ts';
import { levelKey, S, within } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { newFile, newInTab, TYPES } from './tabs.ts';
import { $ } from '../base/util.ts';

function createAt(kind: string, to: string | null | undefined, pos?: { x: number; y: number }) {
  if (kind === 'folder') return newFolder(to ?? '', pos);
  if (kind === 'text' || TYPES[kind]?.ext) return newFile(to ?? null, null, TYPES[kind]?.ext);
  return newInTab('board', null, to ?? '');
}

const clearOver = () => document.querySelectorAll('.over, .over-before, .over-after').forEach((el) => el.classList.remove('over', 'over-before', 'over-after'));
const draggedKeys = (src = S.dragging) => (/^(file|dir):/.test(src || '') ? dragKeys(src!.slice(src!.indexOf(':') + 1)) : []);
const several = (src: string | null) => draggedKeys(src).length > 1;
const thoughtSpot = (e: DragEvent, src: string | null) => {
  const th = src?.startsWith('file:') && !several(src) && (e.target as HTMLElement).closest?.<HTMLElement>('[data-th]');
  if (!th || th.dataset.th === src!.slice(5)) return null;
  const r = th.getBoundingClientRect();
  return { el: th, path: th.dataset.th!, after: e.clientY > r.top + r.height / 2 };
};

document.addEventListener('dragstart', (e) => {
  const el = (e.target as HTMLElement).closest?.('[data-drag]') as HTMLElement;
  if (!el) return;
  S.dragging = el.dataset.drag!;
  const link = S.dragging!.startsWith('link:');
  e.dataTransfer!.setData('text/plain', link ? '@' + S.dragging!.slice(5) : S.dragging!);
  const paths = draggedKeys().filter((k) => S.thoughts.has(k));
  if (link || S.dragging!.startsWith('file:') || paths.length) e.dataTransfer!.setData('application/x-pm-file', JSON.stringify({ lvl: levelKey(), path: paths[0] ?? S.dragging!.slice(5), paths }));
  e.dataTransfer!.effectAllowed = 'move';
  requestAnimationFrame(() => document.body.classList.add('dragging'));
  if (el.closest('#colormenu')) setTimeout(() => ($('#colormenu').hidden = true), 0);
  el.addEventListener('dragend', (ev) => el.isConnected || document.dispatchEvent(new DragEvent('dragend', ev)), { once: true });
});
document.addEventListener('dragend', () => {
  S.dragging = null;
  clearOver();
  document.body.classList.remove('dragging');
});
function alreadyIn(src: string, drop: string | undefined) {
  if (several(src)) return draggedKeys(src).every((k) => (S.thoughts.get(k)?.dir ?? S.dirs.get(k)?.parent) === drop);
  const i = src.indexOf(':');
  const kind = src.slice(0, i), key = src.slice(i + 1);
  const t = kind === 'file' && S.thoughts.get(key);
  const c = kind === 'dir' && S.dirs.get(key);
  if (t) return drop === t.dir;
  return !!c && drop === c.parent;
}
function intoItself(src: string, drop: string | undefined) {
  if (drop == null) return '';
  const keys = several(src) ? draggedKeys(src) : src.startsWith('dir:') ? [src.slice(4)] : [];
  for (const k of keys) {
    const c = S.dirs.get(k);
    if (c?.path && drop !== k && within(drop, k)) return c.name;
  }
  return '';
}
const reorderZone = (e: DragEvent, t: HTMLElement, src: string) => {
  if (!src.startsWith('dir:') || src.startsWith('dir:@') || several(src) || !t.closest('#tree') || !('fold' in t.dataset) || src.slice(4).includes('/')) return false;
  const r = t.getBoundingClientRect();
  return e.clientY < r.top + r.height * 0.45;
};

const overWeb = (e: DragEvent) => S.dragging?.startsWith('new:') && (e.target as HTMLElement).closest?.('.web');
const notForRows = () => S.dragging?.startsWith('link:');
const osRow = (e: DragEvent) => (!S.dragging && window.amethyst?.pathOf && e.dataTransfer?.types.includes('Files') && (e.target as HTMLElement).closest?.<HTMLElement>('[data-drop]')) || null;
document.addEventListener('dragleave', (e) => {
  if ((e.target as HTMLElement).classList?.contains('web')) web.dropAt(null);
  if (!e.relatedTarget && !S.dragging) clearOver();
});
document.addEventListener('dragover', (e) => {
  const os = osRow(e);
  if (os) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    clearOver();
    return void os.classList.add('over');
  }
  if (!S.dragging) return;
  if (overWeb(e)) {
    e.preventDefault();
    clearOver();
    web.dropAt(e);
    return;
  }
  const spot = thoughtSpot(e, S.dragging);
  clearOver();
  if (spot) {
    e.preventDefault();
    spot.el.classList.add(spot.after ? 'over-after' : 'over-before');
    return;
  }
  const t = (e.target as HTMLElement).closest?.('[data-drop]') as HTMLElement;
  if (!t || notForRows()) return;
  const inside = intoItself(S.dragging, t.dataset.drop);
  if (inside) return void tell(t, { title: `Can't put “${inside}” inside itself` });
  const reorder = reorderZone(e, t, S.dragging);
  if (!reorder && alreadyIn(S.dragging, t.dataset.drop)) return;
  e.preventDefault();
  t.classList.add(reorder ? 'over-before' : 'over');
});
document.addEventListener('drop', async (e) => {
  const os = osRow(e);
  if (os) {
    e.preventDefault();
    clearOver();
    return copyIn([...e.dataTransfer!.files].map((f) => window.amethyst!.pathOf(f)).filter(Boolean), os.dataset.drop!);
  }
  if (overWeb(e)) {
    e.preventDefault();
    const kind = S.dragging!.slice(4), hit = web.dropAt(e);
    web.dropAt(null);
    S.dragging = null;
    document.body.classList.remove('dragging');
    return createAt(kind, hit!.dir, hit!.at);
  }
  const spot = thoughtSpot(e, S.dragging);
  if (spot) {
    e.preventDefault();
    const src = S.dragging!.slice(5);
    S.dragging = null;
    clearOver();
    document.body.classList.remove('dragging');
    return placeThought(src, spot.path, spot.after);
  }
  const t = (e.target as HTMLElement).closest?.('[data-drop]') as HTMLElement;
  if (!S.dragging || !t || notForRows()) return;
  e.preventDefault();
  const src = S.dragging;
  S.dragging = null;
  clearOver();
  document.body.classList.remove('dragging');
  const i = src.indexOf(':');
  const kind = src.slice(0, i), path = src.slice(i + 1), to = t.dataset.drop!;
  if (kind === 'new') return createAt(path, to);
  if (several(src)) return moveMany(draggedKeys(src), to);
  if (kind === 'file') return moveItem(path, to);
  if (reorderZone(e, t, src)) return path !== to && reorderFolder(path, to);
  moveDir(path, to);
});
