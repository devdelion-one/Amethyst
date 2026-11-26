import { onPref, pref, setPref } from './prefs.ts';
import { store } from './util.ts';

export const NAME = { inbox: 'inbox', folder: 'folder', subfolder: 'subfolder' };
export const NAMES = { inbox: 'inboxes', folder: 'folders', subfolder: 'subfolders' };

export const GLYPH: Record<string, string> = { inbox: '◎', folder: '⁂', project: '◉' };

export const DEFAULT: Record<string, string> = { inbox: '#ff8f40', folder: '#59c2ff', project: '#d9e0d3', board: '#7fd962' };

const RING = { d: 'M0 -1A1 1 0 1 1 0 1A1 1 0 1 1 0 -1ZM0 -.615A.615 .615 0 1 0 0 .615A.615 .615 0 1 0 0 -.615Z', a: 'M0 -.308L.308 0L0 .308L-.308 0Z' };
export const GEMS: Record<string, { d: string; a: string }> = {
  board: { d: 'M-.615 -.769L.692 -.769L.385 .308L-.923 .308ZM-.385 -.308L.923 -.308L.615 .769L-.692 .769Z', a: 'M-.385 -.308L.56 -.308L.385 .308L-.56 .308Z' },
  file: { d: 'M-.6 -.9L.15 -.9L.7 -.35L.7 .9L-.6 .9Z', a: 'M.15 -.9L.7 -.35L.15 -.35Z' },
  core: RING,
  inbox: RING,
  folder: { d: 'M-1 .846L-.538 -.231L-.077 .846ZM.077 .846L.538 -.231L1 .846ZM-.462 .846L0 -.846L.462 .846Z', a: 'M-.462 .846L-.312 .298L-.077 .846ZM.077 .846L.312 .298L.462 .846Z' },
  project: { d: 'M0 -1L.866 -.5L.866 .5L0 1L-.866 .5L-.866 -.5Z', a: 'M0 -1L.866 -.5L0 0Z' },
  scratch: { d: 'M.462 -.923L.923 -.462L-.308 .769L-.769 .308Z', a: 'M-.769 .308L-.308 .769L-.923 .923Z' },
  sketch: { d: 'M.769 -1L1 -.769L.154 .231L-.077 0Z', a: 'M-.077 0L.154 .231L-.077 .692L-.538 .923L-1 1L-.769 .538L-.538 .308Z' },
  timer: { d: 'M-.692 -.923L.692 -.923L0 .308ZM0 -.308L.692 .923L-.692 .923Z', a: 'M-.173 0L0 -.308L.173 0L0 .308Z' },
  link: { d: 'M.269 0L-.058 .566L-.712 .566L-1.038 0L-.712 -.566L-.058 -.566ZM1.038 0L.712 .566L.058 .566L-.269 0L.058 -.566L.712 -.566Z', a: 'M-.269 0L0 -.466L.269 0L0 .466Z' },
  ai: { d: 'M0 0', a: 'M0 -1Q.191 -.462 .212 -.212Q.462 -.191 1 0Q.462 .191 .212 .212Q.191 .462 0 1Q-.191 .462 -.212 .212Q-.462 .191 -1 0Q-.462 -.191 -.212 -.212Q-.191 -.462 0 -1Z' },
  deck: { d: 'M-.923 -.923L-.077 -.923L-.077 -.077L-.923 -.077ZM.077 -.923L.923 -.923L.923 -.077L.077 -.077ZM-.923 .077L-.077 .077L-.077 .923L-.923 .923ZM.077 .077L.923 .077L.923 .923L.077 .923Z', a: 'M.077 -.923L.923 -.923L.923 -.077L.077 -.077Z' },
  orch: { d: 'M-.923 -.923L-.462 -.923L-.462 -.462L-.923 -.462ZM-.923 -.23L-.462 -.23L-.462 .23L-.923 .23ZM-.923 .462L-.462 .462L-.462 .923L-.923 .923ZM-.231 -.923L.923 -.923L.923 .923L-.231 .923Z', a: 'M-.846 -.846L-.539 -.846L-.539 -.539L-.846 -.539Z' },
  research: { d: 'M-.308 -.923A.615 .615 0 1 1 -.308 .308A.615 .615 0 1 1 -.308 -.923ZM-.308 -.615A.308 .308 0 1 0 -.308 0A.308 .308 0 1 0 -.308 -.615ZM.2 .05L.923 .77L.77 .923L.05 .2Z', a: 'M-.308 -.46L-.154 -.308L-.308 -.154L-.462 -.308Z' },
  term: { d: 'M-.923 -.769L.923 -.769L.923 .769L-.923 .769Z', a: 'M-.615 -.462L-.077 0L-.615 .462L-.615 .231L-.346 0L-.615 -.231ZM0 .308L.538 .308L.538 .462L0 .462Z' },
  archive: { d: 'M-.923 -.692L.923 -.692L.923 -.231L-.923 -.231ZM-.769 -.077L.769 -.077L.769 .769L-.769 .769Z', a: 'M-.308 .077L.308 .077L.308 .308L-.308 .308Z' },
  settings: { d: 'M-.923 -.692L.923 -.692L.923 -.538L-.923 -.538ZM-.923 -.077L.923 -.077L.923 .077L-.923 .077ZM-.923 .538L.923 .538L.923 .692L-.923 .692Z', a: 'M.154 -.923L.462 -.923L.462 -.308L.154 -.308ZM-.538 -.308L-.231 -.308L-.231 .308L-.538 .308ZM.231 .308L.538 .308L.538 .923L.231 .923Z' },
};
export const gemKind = (t: { board?: boolean }): string => (t.board ? 'board' : 'file');
export const gem = (kind: string): string => {
  const g = GEMS[kind] || GEMS.file;
  return `<svg class="gem" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true"><path class="b" d="${g.d}"/><path d="${g.a}"/></svg>`;
};

const TRAIL = '<circle cx="0" cy="-.98" r=".17"/><circle cx="-.399" cy="-.895" r=".14" opacity=".7"/><circle cx="-.705" cy="-.681" r=".11" opacity=".45"/><circle cx="-.895" cy="-.399" r=".085" opacity=".28"/><circle cx="-.975" cy="-.102" r=".06" opacity=".14"/>';
const NEW_MARKS = `<g class="nw" transform="translate(-1.25 -1.25) scale(.25)"><g class="wm-arc"><circle cx="5" cy="5" r="3.6"/></g><g class="wm-sq"><rect x=".6" y="3" width="4" height="4"/><rect x="5.4" y="3" width="4" height="4"/></g><g class="wm-bars"><rect x=".8" y="1" width="2.2" height="8"/><rect x="3.9" y="1" width="2.2" height="8"/><rect x="7" y="1" width="2.2" height="8"/></g><g class="wm-dot"><circle class="t" cx="5" cy="5" r="3.6"/><circle class="d" cx="5" cy="1.4" r="1.5"/></g><g class="wm-one"><rect x="2" y="2" width="6" height="6"/></g></g>`;
export const workGem = (): string =>
  `<svg class="gem wkg" viewBox="-1.25 -1.25 2.5 2.5" aria-hidden="true"><circle class="wk-track" r="1.05"/><circle class="wk-arc" r="1.05"/><g class="wk-trail">${TRAIL}</g><g class="wk-core"><path class="wk-st" d="${GEMS.ai.a}"/></g>${NEW_MARKS}</svg>`;
export const workCorner = (): string => `<b class="wk-corner">${workGem()}</b>`;
export const busyNow = (a?: { status?: string }): boolean => a?.status === 'working' || a?.status === 'starting';
if (store.get('work:mark', null) === 'still') (setPref('work:mark', 'star'), setPref('work:moves', false));
const markWork = () => {
  document.documentElement.dataset.work = pref('work:mark');
  document.documentElement.dataset.workStill = pref('work:moves') ? '' : '1';
};
markWork();
onPref('work:mark', markWork);
onPref('work:moves', markWork);

export const pjMark = () => '<svg class="pjm" viewBox="0 0 18 14" aria-hidden="true"><rect x="3.5" y="1.5" width="13" height="9" rx="1" fill="var(--raised)" stroke="var(--pc)"/><rect x="1.5" y="3.5" width="13" height="9" rx="1" fill="var(--raised)" stroke="currentColor"/></svg>';

let tintN = 0;
export const stackSvg = (color: string, tint = false): string => {
  const card = (d: number, a: number) => `<rect x="${8 + d}" y="${24 - d}" width="84" height="56" rx="1.5" fill="var(--raised)" stroke="${color}" stroke-opacity="${a}"/>`;
  const id = `tint${tintN++}`;
  const defs = tint ? `<defs><filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer result="g"><feFuncR type="linear" slope="1.5"/><feFuncG type="linear" slope="1.5"/><feFuncB type="linear" slope="1.5"/></feComponentTransfer><feFlood style="flood-color:${color}"/><feBlend in="g" mode="multiply"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>` : '';
  return `<svg class="stack" viewBox="0 0 112 84" aria-hidden="true">${defs}${card(12, 0.3)}${card(6, 0.55)}${card(0, 1)}<rect x="8" y="24" width="84" height="56" rx="1.5" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-width="1.4"/><image href="amethyst.svg" x="37" y="32" width="26" height="40"${tint ? ` filter="url(#${id})"` : ''}/></svg>`;
};


const rr = (x: number, y: number, w: number, h: number, r: number) => `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
const dot = (x: number, y: number, r: number) => `M${+(x - r).toFixed(2)} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const MODE_GEMS: Record<string, { d: string; a: string }> = {
  ai: { d: rr(1.5, 4.6, 10, 9.8, 2) + dot(4.6, 9.4, 1.25) + dot(8.4, 9.4, 1.25), a: 'M5.2 3.4V3.1a1.5 1.5 0 0 1 1.5-1.5H12.9a1.5 1.5 0 0 1 1.5 1.5V9.9a1.5 1.5 0 0 1-1.5 1.5H12.7V6.4a3 3 0 0 0-3-3Z' },
  orch: { d: rr(1.5, 2, 13, 5, 1.2), a: rr(1.5, 9.5, 3.6, 4.5, 1) + rr(6.2, 9.5, 3.6, 4.5, 1) + rr(10.9, 9.5, 3.6, 4.5, 1) },
  editor: { d: rr(2.2, 2, 1.9, 12, 0.95), a: rr(6.6, 3, 7.9, 2, 1) + rr(6.6, 7, 5, 2, 1) + rr(6.6, 11, 6.6, 2, 1) },
};
export const modeGem = (kind: string): string => {
  const g = MODE_GEMS[kind];
  return `<svg class="gem mgem" viewBox="0 0 16 16" aria-hidden="true"><path class="b" fill-rule="evenodd" d="${g.d}"/><path d="${g.a}"/></svg>`;
};
export const workMark = (): string => `<b class="ly-wk" data-st="working">${workGem()}</b>`;
