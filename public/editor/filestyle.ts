import { esc, showErr } from '../base/util.ts';
import { api, colorOf, S } from '../base/model.ts';
import { colorRow, ICONS, markName, trayName } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { col } from '../base/theme.ts';
import { page } from '../base/page.ts';
import type { Note } from '../base/types.ts';

export type StyleItem = { kind: string; path: string };
type Item = StyleItem;

const target = (it: Item) => (it.kind === 'dir' ? S.dirs.get(it.path) : S.thoughts.get(it.path));

function setFileStyle(items: Item[], patch: Record<string, unknown>) {
  const puts: Promise<unknown>[] = [];
  for (const it of items) {
    const x = target(it);
    if (!x) continue;
    x.meta ||= {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete x.meta[k];
      else x.meta[k] = v;
    }
    if (it.kind === 'file') (x as Note).color = colorOf(x);
    puts.push(api('PUT', '/api/meta', { path: it.path, kind: it.kind, patch }).catch(showErr));
  }
  page.render();
  Promise.all(puts).then(() => page.reload()).catch(showErr);
}

export function styleRows(items: Item[], fly: string): string {
  const metas = items.map((it) => target(it)?.meta || {}), one = metas.length === 1 ? metas[0] : null;
  const color = (one?.color as string | undefined) || null, mark = (one?.mark as number | undefined) || 0, glyph = items[0]?.kind === 'dir' ? gem('folder') : gem('file');
  const none = '<i class="pk-ic"><i class="pk-none"></i></i>', mk = (n: number) => `<i class="pk-ic mk-d m${n}">${ICONS['mark' + n]}</i>`;
  const marks = `<button class="sw-mk dft${mark ? '' : ' on'}" data-fs-mark="0" aria-label="None: no mark. The default.">${none}</button>` + [1, 2, 3].map((n) => `<button class="sw-mk fmk mk-d m${n}${mark === n ? ' on' : ''}" data-fs-mark="${n}" aria-label="${esc(markName(n))}">${ICONS['mark' + n]}</button>`).join('');
  return colorRow({ k: 'fsc', label: 'color', tip: 'the color of its icon and name', chip: `<i class="pk-ic" style="color:${esc(color ? col(color) : 'var(--text)')}">${glyph}</i>`, now: color ? trayName(color) : "the theme's", attr: 'fs-color', cls: 'sw', dfltCls: 'sw', dfltTip: "The theme's color. The default.", dfltStyle: '--c:var(--text)', style: (h) => `--c:${col(h)}`, icon: '' }, color, fly) +
    colorRow({ k: 'fsm', label: 'mark', tip: 'a sign beside its name', ic: ICONS.mark2, chip: mark ? mk(mark) : none, now: mark ? markName(mark) : 'none', attr: 'fs-mark', cls: '', dfltCls: '', dfltTip: '', dfltStyle: '', style: () => '', icon: '', grid: marks }, mark ? String(mark) : null, fly);
}
export function pickStyle(items: Item[], b: HTMLElement): boolean {
  if (b.dataset.fsColor != null) setFileStyle(items, { color: b.dataset.fsColor || null });
  else if (b.dataset.fsMark != null) setFileStyle(items, { mark: +b.dataset.fsMark || null });
  else return false;
  return true;
}
