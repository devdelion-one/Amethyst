import { pref, PREFS } from '../base/prefs.ts';
import { addPart, box, rowHtml } from './setstd.ts';
import type { Row } from './setstd.ts';

export const ORCH_LEAD = "How Orchestration lays out a chat: the files beside it or under it, and the list of this project's chats.";

const row = (key: string, old: string, o: Partial<Row> = {}): Row => {
  const e = PREFS[key];
  return {
    id: key, key, noPic: true, at: [{ key, place: 'oc' }],
    own: { label: e.label, desc: e.desc, find: `${old} ${e.on} ${e.off}` },
    state: () => (pref(key) ? e.on! : e.off!), alt: () => (pref(key) ? e.off! : e.on!), ...o,
  };
};
const UNDER_OFF = 'The files are hidden, so where they sit counts once they show again.';
const orchRows = (): Row[] => [
  row('orch:files', 'files in Orchestration'),
  row('orch:under', 'files under the chat in Orchestration', { sw: 'onoff', plain: true, state: () => (!pref('orch:files') ? UNDER_OFF : pref('orch:under') ? PREFS['orch:under'].on! : PREFS['orch:under'].off!) }),
  row('orch:list', 'list of chats in Orchestration'),
];

addPart({ rows: orchRows, sel: () => '', look: () => '', example: () => '', home: 'show/orch' });

export const orchHtml = () => box('orch', 'Orchestration', orchRows().map(rowHtml).join(''), "The files and the list beside the chat in Orchestration. Right-clicking the chat's header or the files' tab bar there changes the same things.");
