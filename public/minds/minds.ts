import { barMenu, offClasses } from '../base/controls.ts';
import { page } from '../base/page.ts';
import { nextUndo, record, undo, undoer } from '../base/undo.ts';
import { createWeb } from './web.ts';
import type { Cb, View } from './paint.ts';

type Web = ReturnType<typeof createWeb>;
type Mind = { el: HTMLElement; w: Web; on?: boolean; stale?: boolean };
type Call<K extends keyof Web> = (...a: Parameters<Web[K]>) => ReturnType<Web[K]>;

offClasses('web:off', 'web');
barMenu('.web-tools', 'web');

let on: Cb | null = null;
let inUseId: () => string | null | undefined = () => null;
export function handle(handlers: Cb, mindInUse: () => string | null | undefined) {
  on = handlers;
  inUseId = mindInUse;
}

export const webBar = () => `<div class="web-tools"><button data-web="undo" data-tip-keys="undo:undo"><kbd>ctrl z</kbd>undo</button><button data-web="reset" title="Default&#10;Lays every folder out fresh and forgets the spots you dragged them to.&#10;&#10;Undo brings them back.">default</button><button data-web="fit"><kbd>0</kbd>fit</button><button data-web="home"><kbd>h</kbd>center</button></div>`;
const minds = new Map<string, Mind>();
const last: any = {};
export function mindOf(id: string) {
  let m = minds.get(id);
  if (!m) {
    const el = document.createElement('div');
    el.className = 'mind';
    el.innerHTML = `<canvas class="web"></canvas>${webBar()}`;
    const w = createWeb(el.firstElementChild as HTMLCanvasElement, { ...on!, onStep: (label, items) => record('mind', label, { items }) });
    const ub = el.querySelector('[data-web="undo"]') as HTMLElement;
    ub.addEventListener('pointerenter', () => (ub.title = nextUndo() ? `Undo\nUndoes the last step: ${nextUndo()}.` : 'Undo\nNothing to undo yet.'));
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-web]') as HTMLElement;
      if (b) (b.dataset.web === 'undo' ? undo() : w[b.dataset.web as 'reset' | 'fit' | 'home']());
    });
    if (last.level !== undefined) w.level(last.level);
    if (last.setData) w.setData(...(last.setData as [any]));
    w.setView(last.view || {});
    minds.set(id, (m = { el, w }));
  }
  return m.el;
}
export function keepMinds(ids: Set<string>) {
  for (const [id, m] of minds)
    if (!ids.has(id)) {
      m.w.stop();
      minds.delete(id);
    }
}
export function runWeb(ids: Iterable<string>) {
  const shown = new Set(ids);
  for (const [id, m] of minds) {
    m.on = shown.has(id);
    if (!m.on) {
      m.w.stop();
      continue;
    }
    if (m.stale) {
      m.stale = false;
      if (last.setData) m.w.setData(...(last.setData as [any]));
      m.w.setView(last.view || {});
    }
    m.w.start();
  }
}

const inUse = () => (minds.get(inUseId() as string) || minds.values().next().value)?.w;
const all = <K extends keyof Web>(fn: K) => (...a: Parameters<Web[K]>) => {
  last[fn] = a;
  for (const m of minds.values()) (m.w[fn] as Call<K>)(...a);
};
const shownOnly = <K extends keyof Web>(fn: K) => (...a: Parameters<Web[K]>) => {
  last[fn] = a;
  for (const m of minds.values()) m.on ? (m.w[fn] as Call<K>)(...a) : (m.stale = true);
};
const one = <K extends keyof Web>(fn: K) => (...a: Parameters<Web[K]>) => (inUse() as { [k in K]: Call<K> } | undefined)?.[fn](...a);
let dropOn: Web | null = null;
export const web = {
  setData: shownOnly('setData'),
  setView(v: Partial<View>) {
    last.view = { ...last.view, ...v };
    for (const m of minds.values()) m.on ? m.w.setView(v) : (m.stale = true);
  },
  level(key: string) {
    last.level = key;
    for (const m of minds.values()) m.w.level(key);
  },
  renamePath: all('renamePath'),
  refreshTheme: all('refreshTheme'),
  fit: one('fit'),
  home: one('home'),
  glideTo: one('glideTo'),
  zoomTo: one('zoomTo'),
  spotOf: one('spotOf'),
  screenOf: one('screenOf'),
  chipOf: one('chipOf'),
  dropAt(e: MouseEvent | null) {
    if (e) dropOn = [...minds.values()].find((m) => m.el.firstElementChild === (e.target as HTMLElement).closest?.('.web'))?.w || dropOn;
    return dropOn?.dropAt(e);
  },
};

undoer('mind', {
  there: () => page.shows('mind'),
  go: () => page.openView('mind'),
  undo(d) {
    const back = inUse()?.apply(d.items);
    if (!back) return false;
    d.back = back;
  },
  redo(d) {
    const items = d.back && inUse()?.apply(d.back);
    if (!items) return false;
    d.items = items;
  },
});
