import { fwHead, ICONS, winX } from '../base/controls.ts';

export const KINDS = [
  ['slow', 'slow', 'Slow\nSlow frames, slow inputs, hangs and stalls. Click to show or hide these lines.'],
  ['act', 'actions', 'Actions\nWhat each click, key and tab switch took, redrew and loaded. Click to show or hide these lines.'],
  ['busy', 'busy', 'Busy\nRedraws and loops while you do nothing. Click to show or hide these lines.'],
  ['app', 'app', 'App\nWindows, screens, processes and page loads. Click to show or hide these lines.'],
  ['err', 'errors', 'Errors\nErrors in the code, shown here instead of as a notice. Click to show or hide these lines.'],
];
export const SNAPS = [
  ['snap', 'snapshot', 'path copied', 'save the last 40 s to a file of its own\n\nits path is copied, to paste to an agent'],
  ['rec', 'record 10 s', 'recording 10 s', 'profile Window 1 and the server for 10 s, then save a snapshot\n\nwith the functions that took the most time'],
];
export const hgHead = () => fwHead('freeze log', '', winX(ICONS.wmin, 'data-hghide aria-label="minimize"') + winX(ICONS.wx, 'data-hgx title="Close&#10;The log goes on being written." aria-label="close"'));
export const hgBar = () => `<div class="hg-bar">${KINDS.map(([k, w, d]) => `<button class="hg-k" data-hgk="${k}" title="${d}" aria-pressed="true">${w}</button>`).join('')}<button class="hg-k" data-hgdir title="File&#10;Shows hitch.log, the freeze log's file, in Explorer." aria-label="show the file">file</button>${SNAPS.map(([k, w, widest, d]) => `<button class="hg-k hg-snap" data-hgsnap="${k}" title="${d}"><b>${w}</b><i aria-hidden="true">${widest}</i></button>`).join('')}</div>`;
