import { HttpError } from '../../base/routes.ts';
import { callerOf, listOf } from '../drive/caller.ts';
import { waitFor } from '../drive/track.ts';
import { allowed, answer, init, mine, run, secsOf, send, stop } from './workers.ts';
import type { Routes } from '../../../public/base/types.ts';

const ROUTES: Routes = {
  'POST /api/agents/run': async (body, _q, _root, _pid, R, _am, gone) => {
    const who = allowed(callerOf(body));
    return run(who, { agent: String(body.agent ?? 'claude'), prompt: String(body.prompt ?? ''), model: body.model, effort: body.effort, mode: body.mode, worktree: body.worktree === true, secs: secsOf(body.timeout), background: body.background === true, R, am: who.am, gone });
  },

  'POST /api/agents/send': async (body, _q, _root, _pid, _R, _am, gone) => {
    const who = allowed(callerOf(body)), w = mine(who, body.agent);
    const text = String(body.text ?? '').trim();
    if (!text) throw new HttpError(400, 'text: what to tell it');
    return send(who, w, text, body.background === true, secsOf(body.timeout), gone);
  },

  'POST /api/agents/wait': async (body, _q, _root, _pid, _R, _am, gone) => {
    const who = allowed(callerOf(body));
    const list = listOf(body.agents ?? body.agent).map((x) => mine(who, x));
    if (!list.length) throw new HttpError(400, 'wait for which subagents? give their codes');
    if (list.length === 1) return answer(who, list[0], null, '', secsOf(body.timeout), gone);
    const first = await waitFor({ who, by: who.id, ids: list.map((w) => w.id), secs: secsOf(body.timeout), asks: false, again: 'amethyst agent wait', gone });
    const w = list.find((x) => x.id === first.id);
    return w ? answer(who, w, (first.qid as string) || null) : first;
  },

  'POST /api/agents/stop': async (body) => {
    const who = allowed(callerOf(body));
    return stop(mine(who, body.agent));
  },
};

export { init, ROUTES };
