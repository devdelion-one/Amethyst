import { isOff } from '../base/prefs.ts';
import type { Project, WorkspaceEntry } from '../base/types.ts';
import { webBar } from '../minds/minds.ts';
import { newTabHtml } from './groups.ts';
import { addPart, box, markAll, pic, rowHtml } from './setstd.ts';
import type { At, Row } from './setstd.ts';
import { newTabOrder, tileOn } from './tabs.ts';
import { startPic, wsTile } from './views.ts';

export const PAGES_LEAD = "A workspace's page, the launch screen, the new tab page and the mind web. Click a switch, or the ringed part in the picture a row opens, to hide or show it. Right-clicking the page in the app, or the mind web's bar, does the same.";

const SEL: Record<string, string> = {
  'wspage:off:desc': '#st-desc', 'wspage:off:note': '#st-note', 'wspage:off:newpj': '.st-newg', 'wspage:off:head': '.pjr.head', 'wspage:off:folder': '.pr-p', 'wspage:off:eye': '.pr-eye',
  'launch:off:pin': '.wt-pin', 'newtab-hidden:more': '.nt-more',
};
const sel = (a: At) => SEL[`${a.key}:${a.id}`] || (a.key === 'web:off' ? `[data-web="${a.id}"]` : `[data-newtype="${a.id}"]`);

const item = (key: string, id: string, place: string, o: Partial<Row> = {}): Row => ({ id: `${key}:${id}`, key, at: [{ key, place, id }], ...o });
const TILES = 'newtab-hidden';
const noWay = (id: string) => (isOff(TILES, id) && isOff(TILES, 'more') ? 'Not on the page. Right-click the page to put it back.' : '');
const tiles = () => newTabOrder().filter(tileOn);
const wsRows = (): Row[] => ['desc', 'note', 'newpj', 'head', 'folder', 'eye'].map((id) => item('wspage:off', id, 'wspage'));
export const launchRows = (): Row[] => [item('launch:off', 'pin', 'launch')];
const tileRows = (): Row[] => [...tiles().map((id) => item(TILES, id, 'newtab', { blocked: () => noWay(id) })), item(TILES, 'more', 'newtab')];
const webRows = (): Row[] => ['undo', 'reset', 'fit', 'home'].map((id) => item('web:off', id, 'web', { adv: true }));

const pj = (name: string): Project => ({ id: `sample-1090-${name}`, name, path: `D:\\Sites\\Northwind\\${name}`, desc: '', color: null });
const PROJECTS = ['Atlas', 'Beacon', 'Cobalt'].map(pj);
const ws = (name: string, projects: Project[]): WorkspaceEntry => ({ id: `sample-1090-${name}`, name, path: `D:\\Sites\\${name}`, home: false, missing: false, projects });

const frag = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
};
function bare(html: string) {
  const f = frag(html);
  for (const el of f.querySelectorAll<HTMLElement>('*'))
    for (const x of [...el.attributes]) if (x.name === 'title' || x.name === 'role' || (x.name.startsWith('data-') && x.name !== 'data-newtype' && x.name !== 'data-web')) el.removeAttribute(x.name);
  return [...f.children].map((x) => x.outerHTML).join('');
}
const startHtml = () => bare(startPic('Northwind', 'The three client sites and their shared tools.', '# Northwind\n\nAtlas ships first, then Beacon.', PROJECTS));
const launchHtml = () => bare(`<div class="hr-la">${wsTile(ws('Northwind', PROJECTS), true)}${wsTile(ws('Studio', []), true)}</div>`);
const tilesHtml = (keys: string[], more: boolean) => bare(`<div class="newtab hr-nt">${newTabHtml(keys, more ? [] : null)}</div>`);
const webHtml = () => bare(`<div class="mind hr-mind">${webBar()}</div>`);

function example(a: At) {
  const p = (html: string, rows: Row[]) => pic(markAll(html, rows.map((r) => r.at[0]), sel, a), a.place, ' hr-dk');
  if (a.place === 'wspage') return p(startHtml(), wsRows());
  if (a.place === 'launch') return p(launchHtml(), launchRows());
  if (a.place === 'web') return p(webHtml(), webRows());
  const on = tileRows().filter((r) => r.at[0].id === a.id || !isOff(TILES, r.at[0].id!)), ids = on.map((r) => r.at[0].id!);
  return p(tilesHtml(ids.filter((id) => id !== 'more'), ids.includes('more')), on);
}
const LOOK: Record<string, string> = { note: '#st-note .st-sec', head: '.pjr.head > :nth-child(2)' };
function lookOf(r: Row) {
  const a = r.at[0], place = a.place;
  const f = frag(place === 'wspage' ? startHtml() : place === 'launch' ? launchHtml() : place === 'web' ? webHtml() : tilesHtml(a.id === 'more' ? [] : [a.id!], a.id === 'more'));
  const el = f.querySelector<HTMLElement>((place === 'wspage' && LOOK[a.id!]) || sel(a));
  if (!el) return '';
  if (a.id === 'note') el.querySelector('.grow')?.remove();
  el.classList.add('hr-keep');
  const html = place === 'wspage' ? `<section id="start" class="hr-lkst">${el.outerHTML}</section>` : place === 'web' ? `<div class="web-tools hr-lkbar">${el.outerHTML}</div>` : `<span class="hr-lkbtn">${el.outerHTML}</span>`;
  return html.replace(/<button /g, '<button tabindex="-1" ');
}

addPart({ rows: () => [...wsRows(), ...launchRows(), ...tileRows(), ...webRows()], sel, look: lookOf, example, home: 'show/pages', each: true });

const rows = (list: Row[]) => list.map(rowHtml).join('');
export function pagesPartHtml() {
  return box('wspage', "A workspace's page", rows(wsRows()), "The page with a workspace's name, its projects and its workspace.md. Click a workspace on the launch screen to open it. Right-clicking the page hides and shows the same parts.") +
    box('launch', 'Launch screen', rows(launchRows()), 'Every workspace as a tile. All workspaces, at the left end of the dock, opens it. Right-clicking it hides and shows the same buttons.') +
    box('newtab', 'New tab page', rows(tileRows()), 'What a new tab shows: a tile for each kind of tab, then your recent files. The + at the end of the tabs opens it. Right-clicking it chooses the same tiles.') +
    box('web', 'Mind web', rows(webRows()), "A map of the folders and files in a project. The mind tile on the new tab page opens it. That tile is hidden at first. Right-clicking the map's bar hides and shows the same buttons.");
}
