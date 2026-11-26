import * as live from '../../base/live.ts';
import * as agents from '../agents.ts';
import { HttpError } from '../../base/routes.ts';
import { fieldsOf } from '../../../public/base/asks.ts';
import { ago, argsOf, callerOf, cfg, chatById, chatOf, codeOf, find, inScope, listOf, mayAnswer, nameFor, quote, route, scopeOf, setCfg, shellFor } from './caller.ts';
import { answerAsk, answerOf, askOut, optionsOf, setOption } from './answer.ts';
import { heldText } from './modes.ts';
import { markRead, seeEvent, sendTo, startChat, started, waitFor } from './track.ts';
import type { Live } from '../../base/live.ts';
import type { Init } from './caller.ts';
import type { Routes } from '../../../public/base/types.ts';

const MAX_TEXT = 40000;

function sayList(rows: Live[]) {
  return rows.map((a) => {
    const c = agents.chatFor(a.id, false), mode = c && (!c.asleep || c.hydrated) ? c.mode() : null;
    return { code: codeOf(a.id), id: a.id, title: a.title || '', agent: a.program || '', model: a.model || '', mode, status: a.status, since: a.at, ...(a.ask ? { asks: a.ask.q || a.ask.form?.message || '' } : {}), ...(a.report ? { report: true } : {}), ...(a.note ? { note: a.note } : {}), ...(a.rang ? { rang: a.rang } : {}), ...(started.has(a.id) ? { startedBy: started.get(a.id) === 'cli' ? 'cli' : codeOf(started.get(a.id)!) } : {}) };
  });
}

function spotOf(v: unknown) {
  if (v === '') return { set: '' };
  const t = String(v ?? '').trim();
  if (!t) return null;
  const ed = /^ed:(.+)$/.exec(t);
  return ed ? { ed: ed[1] } : { set: t };
}

function markReport(a: Live, on: boolean) {
  live.set(a.id, { report: on });
  agents.chatFor(a.id, false)?.saved();
}
const NOTE_MAX = 2000;
function markNote(a: Live, text: string) {
  live.set(a.id, { note: text || undefined });
  agents.chatFor(a.id, false)?.saved();
}
const noteSaid = (code: string, note: string) => (note ? `${code}'s note: ${note}` : `${code} has no note.`);
const reportSaid = (code: string, on: boolean) => (on ? `${code} will notify you: a notification each time it's ready.` : `${code} no longer notifies you.`);
function addDraft(a: Live, text: string) {
  const was = a.draft?.text;
  live.set(a.id, { draft: { text: was ? `${was}\n\n${text}` : text, at: Date.now() } });
}

const ROUTES: Routes = {
  'GET /api/chats': async (body, q, root, pid) => {
    const a = argsOf(body, q), who = callerOf(a), s = scopeOf(who, root, pid);
    const rows = sayList((live.all() as Live[]).filter(inScope(s)).sort((x, y) => (x.started || x.at) - (y.started || y.at)));
    const me = who ? codeOf(who.id) : '';
    const text = rows.length ? rows.map((r) => `${r.code}  ${r.status.padEnd(8)} ${[r.agent, r.model, r.mode].filter(Boolean).join(' · ')}  ${r.title ? `"${quote(r.title, 60)}"` : '(no title yet)'}  since ${ago(r.since)}${r.code === me ? '  (you)' : ''}${r.report ? '  · notifies you' : ''}${r.note ? `  · note: "${quote(r.note.replace(/\s+/g, ' '), 60)}"` : ''}`).join('\n') : 'no chats in this project';
    return { chats: rows, text };
  },

  'POST /api/chats/new': async (body, q, root, pid, R, am = 1) => {
    const who = callerOf(body), s = scopeOf(who, root, pid), follow = body.follow === true && !who;
    const n = body.amethyst == null ? who?.am || am : Number(body.amethyst);
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(400, 'amethyst: the number of an Amethyst');
    const text = String(body.text ?? '').trim(), draft = body.draft === true;
    if (draft && !text) throw new HttpError(400, 'draft: give the text to put in its box');
    const by = nameFor(who, body.by);
    if (text && !draft && !mayAnswer(who)) heldText(text);
    const r = await startChat({ who, agent: String(body.agent || 'claude'), root: s.root, pid: s.pid, R, am: n, q, by: by || null, worktree: body.worktree === true, model: body.model, mode: body.mode });
    const notes = r.notes;
    const place = spotOf(body.set) || (who ? { near: who.id } : follow ? { set: 'now' } : null);
    if (place || n !== (who?.am || am)) await route('PUT /api/agent/owner')({ id: r.id, to: n, place, go: follow }, q, s.root, s.pid, R, who?.am || am).catch(() => {});
    const code = codeOf(r.id);
    if (body.report === true) markReport(live.get(r.id) as Live, true);
    const head = `started ${code} (${r.name})${n !== (who?.am || am) ? ` in Amethyst ${n}` : ''}`;
    if (draft) {
      addDraft(live.get(r.id) as Live, text);
      return { chat: code, id: r.id, agent: r.name, am: n, text: `${head}, with your text in its message box, unsent.${notes.map((x) => ' ' + x).join('')}` };
    }
    if (text || body.attach) {
      const sent = await sendTo({ who, a: live.get(r.id) as Live, text, attach: body.attach, base: String(body.cwd || s.root || root), worktree: body.worktree === true, by });
      return { chat: code, id: r.id, agent: r.name, am: n, qid: sent.qid, text: `${head} and sent it your message (qid ${sent.qid}).${notes.map((x) => ' ' + x).join('')}` };
    }
    return { chat: code, id: r.id, agent: r.name, am: n, text: `${head}.${notes.map((x) => ' ' + x).join('')} Give it work with amethyst chat send ${code}.` };
  },

  'POST /api/chats/draft': async (body, _q, root, pid) => {
    if (body.done != null) {
      const a = chatById(body.id);
      if (a.draft?.at === Number(body.done)) live.set(a.id, { draft: null });
      return { ok: true };
    }
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id);
    if (who && a.id === who.id) throw new HttpError(400, "a chat can't write in its own box");
    if (a.status === 'ended') throw new HttpError(410, `${code} has ended`);
    const text = String(body.text ?? '').trim();
    if (!text) throw new HttpError(400, 'nothing to put in its box: give the text');
    addDraft(a, text);
    return { chat: code, id: a.id, text: `put it in ${code}'s message box, unsent: the user reads it and sends it.` };
  },

  'POST /api/chats/send': async (body, _q, root, pid) => {
    const who = callerOf(body), s = scopeOf(who, root, pid), a = find(body.chat, s), code = codeOf(a.id);
    const by = nameFor(who, body.by);
    const r = await sendTo({ who, a, text: String(body.text ?? '').trim(), attach: body.attach, base: String(body.cwd || s.root || root), worktree: body.worktree === true, now: body.now === true, tell: body.tell !== false, by });
    if (body.report === true) markReport(a, true);
    return { chat: code, id: a.id, qid: r.qid, queued: r.queued, text: `sent to ${code} (qid ${r.qid}): ${r.how}.` };
  },

  'POST /api/chats/stop': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid));
    chatOf(a);
    await route('POST /api/agent/send')({ id: a.id, cancel: true }, new URLSearchParams());
    return { chat: codeOf(a.id), text: `stopped ${codeOf(a.id)}'s turn.` };
  },

  'POST /api/chats/seen': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid));
    const r = await (live.ROUTES['POST /api/agents/seen'] as (...x: any[]) => Promise<any>)({ id: a.id }, new URLSearchParams(), root, pid);
    return { chat: codeOf(a.id), cleared: r.cleared, text: r.cleared ? `${codeOf(a.id)} is marked read.` : `${codeOf(a.id)} wasn't finished and unread; nothing to mark.` };
  },

  'POST /api/chats/wait': async (body, _q, root, pid, _R, _am, gone) => {
    const who = callerOf(body), s = scopeOf(who, root, pid);
    const words = listOf(body.chats ?? body.chat);
    if (!words.length) throw new HttpError(400, 'wait for which chats? give their codes');
    const ids = [...new Set(words.map((w) => find(w, s).id))];
    if (who && ids.includes(who.id)) throw new HttpError(400, "a chat can't wait for itself");
    const secs = Number(body.timeout) > 0 ? Math.min(86400, Math.max(1, Number(body.timeout))) : 86400;
    return waitFor({ who, by: who?.id || 'cli', ids, qid: body.qid ? String(body.qid) : null, secs, again: 'amethyst chat wait', gone });
  },

  'GET /api/chats/read': async (body, q, root, pid) => {
    const x = argsOf(body, q), who = callerOf(x), a = find(x.chat, scopeOf(who, root, pid)), c = chatOf(a), code = codeOf(a.id);
    const r = answerOf(c, x.qid ? String(x.qid) : null, x.full === true || x.full === 'true' || x.full === '1');
    markRead(who?.id || 'cli', a.id, r.qid, !x.qid);
    const from = Math.max(0, Number(x.from) || 0), piece = r.all.slice(from, from + MAX_TEXT), more = from + MAX_TEXT < r.all.length;
    const head = r.status === 'working' ? `[${code} is still working on it; this is what it has said so far]\n\n` : r.status === 'queued' ? `[${code} hasn't started on it yet: it waits in its queue]` : r.status === 'none' ? `[${code} has no messages yet]` : '';
    const tail = more ? `\n\n[cut at ${from + MAX_TEXT} of ${r.all.length} characters: read on with amethyst chat read ${code} from=${from + MAX_TEXT}]` : '';
    return { chat: code, qid: r.qid, status: r.status, asked: r.asked, sentBy: r.sentBy, length: r.all.length, from, text: head + (piece || (r.status === 'done' ? '(no text in its answer)' : '')) + tail };
  },

  'GET /api/chats/asks': async (body, q, root, pid) => {
    const x = argsOf(body, q), who = callerOf(x), a = find(x.chat, scopeOf(who, root, pid)), c = chatOf(a), code = codeOf(a.id);
    const cards = [...(c.cards?.values() || [])].map((k) => askOut(c, k));
    const text = cards.length ? cards.map((k: any) => `[ask ${k.ask}] ${k.kind === 'form' ? `${k.message}\n${k.fields.map((f: any) => `  ${f.key}: ${f.title}${f.about ? ` (${f.about})` : ''}${f.choices ? ` — ${f.choices.join(' / ')}${f.many ? ' (several)' : ''}` : ''}`).join('\n')}` : `${k.q} ${k.what}${k.why ? ` — ${k.why}` : ''}\n  ${k.options.map((o: any, i: number) => `${i + 1}. ${o.name}`).join('  ')}${k.kind === 'permission' && !mayAnswer(who) ? '\n  (a permission ask: the user answers it)' : ''}`}`).join('\n') : `${code} asks nothing now.`;
    return { chat: code, asks: cards, text };
  },

  'POST /api/chats/answer': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid));
    return answerAsk(who, a, body);
  },

  'GET /api/chats/options': async (body, q, root, pid) => {
    const x = argsOf(body, q), who = callerOf(x), a = find(x.chat, scopeOf(who, root, pid)), c = chatOf(a), code = codeOf(a.id);
    const list = optionsOf(c).map(({ mode: _m, ...o }) => o);
    const text = list.length ? list.map((o) => `${o.id} (${o.name}): ${o.value ?? '—'}   takes ${o.choices.length ? o.choices.map((ch: { value: string }) => ch.value).join(', ') : 'any name (its agent lists none and checks it at the first message)'}`).join('\n') : `${code} hasn't said its options yet: it is still starting, or hasn't been opened since Amethyst started (send it something first).`;
    return { chat: code, options: list, text };
  },

  'POST /api/chats/set': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), c = chatOf(a);
    if (body.option == null || body.value == null) throw new HttpError(400, 'give the option and its value: amethyst chat options lists them');
    return { chat: codeOf(a.id), ...(await setOption(c, String(body.option), String(body.value), who)) };
  },

  'POST /api/chats/show': async (body, q, root, pid, R, am = 1) => {
    const who = callerOf(body), s = scopeOf(who, root, pid), a = find(body.chat, s);
    const place = spotOf(body.set) || (who ? { near: who.id, set: 'now' } : { set: 'now' });
    await route('PUT /api/agent/owner')({ id: a.id, place, go: !who }, q, s.root, s.pid, R, who?.am || a.am || am);
    return { chat: codeOf(a.id), text: `showing ${codeOf(a.id)}.` };
  },

  'POST /api/chats/review': async (body, q, root, pid) => {
    if (body.done != null) {
      const a = chatById(body.id);
      if (a.review?.at === Number(body.done)) live.set(a.id, { review: null });
      return { ok: true };
    }
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id);
    const want = String(body.file ?? '').trim();
    let file: string | null = null;
    if (want) {
      const ask = new URLSearchParams({ id: a.id });
      const [l, turns] = await Promise.all([route('GET /api/agent/edits')({}, ask), route('GET /api/agent/edits/turns')({}, ask)]);
      const top = String(l?.top || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
      let rel = want.replace(/\\/g, '/').replace(/^\.\//, '');
      if (top && rel.toLowerCase().startsWith(top + '/')) rel = rel.slice(top.length + 1);
      const all = [...(l?.files || []), ...(turns?.turns || []).flatMap((t: any) => t.files || [])].map((f: any) => String(f.path));
      file = all.find((p) => p === rel) || all.find((p) => p.toLowerCase() === rel.toLowerCase()) || all.find((p) => p.toLowerCase().endsWith('/' + rel.toLowerCase())) || null;
      if (!file) throw new HttpError(404, `${code} didn't change ${want}`);
    }
    live.set(a.id, { review: { path: file, at: Date.now() } });
    return { chat: code, file, text: file ? `opened ${code}'s review at ${file}.` : `opened ${code}'s review.` };
  },

  'POST /api/chats/report': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id);
    const flip = body.on == null && body.off == null;
    const on = body.off === true || body.off === 'true' ? false : flip ? !a.report : body.on !== false && body.on !== 'false';
    markReport(a, on);
    return { chat: code, report: on, text: reportSaid(code, on) };
  },

  'POST /api/chats/note': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id);
    if (body.clear === true || body.clear === 'true') markNote(a, '');
    else if (body.text != null) {
      const text = String(body.text).trim();
      if (text.length > NOTE_MAX) throw new HttpError(400, `a note holds at most ${NOTE_MAX} characters`);
      markNote(a, text);
    }
    const note = a.note || '';
    return { chat: code, note, text: noteSaid(code, note) };
  },

  'POST /api/chats/rename': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id), c = agents.chatFor(a.id, false);
    if (a.kind !== 'chat' || !c) throw new HttpError(400, `${code} is not a chat`);
    const clear = body.clear === true || body.clear === 'true', title = clear || body.title != null ? agents.renameChat(c, clear ? '' : String(body.title)) : a.title || '';
    return { chat: code, title, text: title ? `${code} is named "${title}".` : `${code} has no name yet.` };
  },

  'GET /api/chats/report': async (body, q) => {
    const x = argsOf(body, q), a = chatById(x.id), c = chatOf(a), r = answerOf(c, null, false);
    return { id: a.id, chat: codeOf(a.id), title: a.title || '', agent: c.agent || 'claude', status: a.status, report: !!a.report, pid: a.pid || '', wid: cfg.workspaceOf(a.pid || '', a.cwd), am: a.am || 1, text: r.all, asked: r.asked, asks: [...(c.cards?.values() || [])].map((k) => askOut(c, k)) };
  },

  'POST /api/chats/move': async (body, q, root, pid, R, am = 1) => {
    const who = callerOf(body), s = scopeOf(who, root, pid), words = listOf(body.chats ?? body.chat), n = Number(body.amethyst);
    if (!words.length) throw new HttpError(400, 'move which chats? give their codes');
    if (!Number.isInteger(n) || n < 1 || n > 999) throw new HttpError(400, 'amethyst: the number of an Amethyst, from 1');
    const list = [...new Map(words.map((w) => find(w, s)).map((a) => [a.id, a])).values()];
    const spot = spotOf(body.set), fresh = !!spot && 'set' in spot && spot.set === '+' && list.length > 1;
    const place = fresh ? { set: `+${Date.now().toString(36)}` } : spot || { set: 'now' };
    for (const a of list) await route('PUT /api/agent/owner')({ id: a.id, to: n, place, go: false }, q, s.root, s.pid, R, who?.am || a.am || am);
    const codes = list.map((a) => codeOf(a.id));
    return { chats: codes, amethyst: n, text: `moved ${codes.join(', ')} to Amethyst ${n}; ${codes.length === 1 ? 'it keeps' : 'they keep'} running there.` };
  },

  'POST /api/chats/end': async (body, _q, root, pid) => {
    const who = callerOf(body), a = find(body.chat, scopeOf(who, root, pid)), code = codeOf(a.id);
    if (who && a.id === who.id) throw new HttpError(400, "a chat can't end itself");
    if (who && started.get(a.id) !== who.id) throw new HttpError(403, `${code} wasn't started by this chat: only the user ends it`);
    await route('DELETE /api/agent')({}, new URLSearchParams({ id: a.id }));
    started.delete(a.id);
    return { chat: code, text: `ended ${code}.` };
  },
};

function init(o: Init) {
  setCfg(o);
  agents.setShell(shellFor);
  agents.onEvent(seeEvent);
}

export { callerOf, init, ROUTES };
