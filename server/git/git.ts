import type { RouteHandler, Routes } from '../../public/base/types.ts';
import { hands, dirOf, touched } from './status.ts';
import { ROUTES as REPOS, repoDir } from './repos.ts';
import { ROUTES as COMMIT } from './commit.ts';
import { ROUTES as SYNC } from './sync.ts';
import { ROUTES as BRANCHES } from './branches.ts';
import { ROUTES as HISTORY } from './history.ts';

function init(o: Partial<typeof hands>) {
  Object.assign(hands, o);
}

const WHOLE = new Set(['GET /api/git/repos', 'POST /api/git/login', 'POST /api/git/clone', 'GET /api/gh/repos', 'GET /api/git/identity', 'POST /api/git/identity', 'GET /api/git/doing', 'POST /api/git/cancel']);
const inPicked =
  (key: string, handler: RouteHandler): RouteHandler =>
  (body, q, root, ...rest) => {
    const at = root || hands.chatRoot({ by: body?.by ?? q?.get('by'), key: body?.key ?? q?.get('key') });
    return handler(body, q, at && !WHOLE.has(key) ? repoDir(at, body?.repo ?? q?.get('repo')) : at, ...rest);
  };

const PARTS: Routes = { ...REPOS, ...COMMIT, ...SYNC, ...BRANCHES, ...HISTORY };
const ROUTES: Routes = Object.fromEntries(Object.entries(PARTS).map(([key, handler]) => [key, inPicked(key, handler)]));

export { ROUTES, init, dirOf, touched };
