import { ask as askUser } from '../base/controls.ts';
import { api } from '../base/model.ts';
import { agents } from '../base/stream.ts';
import { setSave, showErr } from '../base/util.ts';
import { refuse, tell } from '../base/notify.ts';
import { pref } from '../base/prefs.ts';
import { DECLINED, record, undoer } from '../base/undo.ts';
import type { Line } from './steps.ts';

type Mount = { restart: (resume?: string | null) => Promise<void>; put: (d: string) => void; id: () => string | null | undefined; from: (id: string | null) => string | null; used: () => boolean };
type NewRec = { to: string | null | undefined; session: string | null | undefined; draft: string };
type RewindRec = { to: string | null | undefined; orig: string | null; session: string | null | undefined; fork: string | null; copy?: boolean; key?: string | null; text: string; undo: unknown };
type RewindItem = { path: string; tick: boolean; how: string; why?: string; clash?: boolean };
type RewindCtx = {
  tab: () => { type: string; chat?: string | null };
  name: () => string;
  busy: () => boolean;
  restart: (resume: string | null) => Promise<void>;
  rewound: (resume: string | null, box: Line) => Promise<void>;
  put: (text: string) => void;
  focus: () => void;
  from: (id: string | null) => void;
};

export const mounts = new Map<string | null | undefined, Mount>();
undoer('chatnew', {
  async undo(d: NewRec) {
    const m = mounts.get(d.to);
    if (!m) return false;
    if (m.used() && !(await askUser({ title: 'Go back to the chat before?', text: 'This chat ends (it stays in its history).', confirm: true }))) return DECLINED;
    await m.restart(d.session);
    m.put(d.draft);
    d.to = m.id();
  },
  async redo(d: NewRec) {
    const m = mounts.get(d.to);
    if (!m) return false;
    await m.restart();
    d.to = m.id();
  },
});
const unrewind = async (d: RewindRec) => {
  if (!d.undo) return true;
  try {
    await api('POST', '/api/agent/rewind/undo', { undo: d.undo });
    return true;
  } catch (e) {
    tell(document.querySelector('#decks') || document.body, { title: "The files can't be put back", line: (e as Error).message, ms: 4000 });
    return false;
  }
};
undoer('rewind', {
  async undo(d: RewindRec) {
    const m = mounts.get(d.to);
    if (!m || !(await unrewind(d))) return false;
    m.from(d.orig);
    await m.restart(d.session);
    m.put('');
    d.to = m.id();
  },
  async redo(d: RewindRec) {
    const m = mounts.get(d.to);
    if (!m || !(await unrewind(d))) return false;
    if (d.copy && !(await api('POST', '/api/agent/fork', { id: d.orig, messageId: d.key }).then(() => true, () => false))) return false;
    if (d.fork || d.copy) m.from(d.orig);
    await m.restart(d.fork);
    m.put(d.text);
    d.to = m.id();
  },
});

export function createRewind({ tab, name, busy, restart, rewound, put, focus, from }: RewindCtx) {
  async function rewind(box: Line, over: Element = box) {
    if (tab().type === 'codex') return refuse(over, { title: `${name()} chats can't go back` });
    if (busy()) return refuse(over, { title: `${name()} is working`, line: 'Stop it first, then go back' });
    const id = tab().chat;
    const plan = pref('rewind:files') ? await api('POST', '/api/agent/rewind', { id, messageId: box.before || null }).catch((e) => ({ none: e.message })) : { none: 'Bring files back when you go back in a chat is off, in Settings, Agents and chat, Providers and tools.' };
    const copied = (tab().type === 'antigravity' || tab().type === 'cursor' || tab().type === 'copilot' || tab().type === 'grok') && !!box.before, short = name().replace(/ Agent$/, '');
    const base = `The chat goes on from before it, with the message in the text box to change and send.${copied ? ` ${name()} can't cut its own chat, so it goes on as a new ${name()} chat that is given the messages before this one.` : ''}`;
    const items: RewindItem[] = plan.items || [];
    const unsure = items.filter((x) => !x.tick).length;
    const hasClash = items.some((x) => x.clash);
    const cant = (plan.cant || []).map((x: { path: string; why: string }) => `${x.path} (${x.why})`);
    const cantNote = cant.length ? `Can't bring back: ${cant.join(', ')}.` : '';
    const wtTip = plan.worktree ? '' : ' Next time, turn on Worktree before starting the chat for clean undo alongside other chats.';
    const others = (xs: string[]) => {
      const q = xs.map((t) => `"${t}"`);
      return q.length === 1 ? `Another chat is working in this folder: ${q[0]}.` : `${q.length} other chats are working in this folder: ${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}.`;
    };
    let ask;
    if (plan.none) {
      ask = { title: 'Go back to this message?', text: base, warn: [`The files stay as they are: ${plan.none}.`, cantNote].filter(Boolean).join(' '), confirm: true };
    } else if (!items.length) {
      ask = cant.length
        ? { title: 'Go back to this message?', text: base, warn: `No tracked files changed, but can't bring back: ${cant.join(', ')}. Those stay as they are.`, confirm: true }
        : { title: 'Go back to this message?', text: base, safe: 'No files changed since then. Safe to go back: nothing on disk will be touched.', confirm: true };
    } else if (plan.busy?.length) {
      const many = plan.busy.length > 1;
      ask = {
        title: 'Go back to this message?',
        text: base,
        warn: [`${others(plan.busy)} Going back now edits the message and leaves files as they are. Wait for ${many ? 'them' : 'it'} or stop ${many ? 'them' : 'it'}, then go back to bring files back too.${wtTip}`, cantNote].filter(Boolean).join(' '),
        confirm: true,
      };
    } else {
      const warn = [
        unsure
          ? `${unsure} file${unsure > 1 ? 's are' : ' is'} unticked because other changes may be mixed in (hover the dot on each to see why). Leaving ${unsure > 1 ? 'them' : 'it'} unticked keeps ${unsure > 1 ? 'them' : 'it'} safe; ticking ${unsure > 1 ? 'them' : 'it'} can overwrite later or other-chat edits${hasClash ? ' (a conflicted file restores the whole file to before the turn, losing all later edits in it)' : ''}.${wtTip}`
          : '',
        cantNote,
      ].filter(Boolean).join(' ');
      ask = {
        title: 'Go back to this message?',
        text: `${base} The ticked files go back to how they were then. Changes made after ${short}'s turns stay.`,
        ...(warn ? { warn } : { safe: "Safe to go back: only this chat's changes will be undone, and edits made after it stay." }),
        checks: { label: `files back as they were (${items.length})`, rows: true, open: true, items: items.map((x) => ({ id: x.path, group: x.tick ? `${short}'s changes` : 'check these', name: `${x.path} · ${x.how}`, on: x.tick, busy: x.why ? `Check this file\n${x.why[0].toUpperCase() + x.why.slice(1)}.` : '' })) },
        choices: [{ label: 'go back', value: true }],
      };
    }
    const ok = await askUser(ask);
    if (!ok) return;
    const picks = ok.ticked || [];
    try {
      const session = agents.all.get(id!)?.session;
      const fork = box.before ? await api('POST', '/api/agent/fork', { id, messageId: box.before }) : null;
      const files = picks.length ? await api('POST', '/api/agent/rewind/files', { id, token: plan.token, picks }) : null;
      from(fork?.sessionId || fork?.copy ? id! : null);
      await rewound(fork?.sessionId || null, box);
      put(box.raw || '');
      focus();
      const done = files?.done.length || 0, skipped = files?.skipped || [];
      if (done || session) record('rewind', done ? `went back to a message: ${done} file${done > 1 ? 's' : ''} back` : 'went back to a message', { to: tab().chat, orig: id, session, fork: fork?.sessionId || null, copy: !!fork?.copy, key: box.before || null, text: box.raw || '', undo: files?.undo || null });
      const kept = items.length - picks.length;
      if (skipped.length) setSave(`${skipped.length} file${skipped.length > 1 ? 's' : ''} stayed as ${skipped.length > 1 ? 'they are' : 'it is'}: a link is on the way, or another repository (${skipped.slice(0, 3).join(', ')})`, true);
      else if (done) setSave(`${done} file${done > 1 ? 's' : ''} back${kept ? `, ${kept} kept as ${kept > 1 ? 'they are' : 'it is'}` : ''} (ctrl z undoes)`);
      else if (session) setSave('went back to a message (ctrl z undoes)');
    } catch (e) {
      showErr(e);
    }
  }
  return rewind;
}
