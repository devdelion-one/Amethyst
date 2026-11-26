import type { RouteHandler, Routes } from '../../public/base/types.ts';
import { repoDir } from '../base/gitdiff.ts';
import { hooksOk } from '../base/githooks.ts';
import { ROUTES as PRS, hands as prHands } from './prs.ts';
import { ROUTES as REVIEW } from './review.ts';
import { ROUTES as ISSUES } from './issues.ts';
import { startWatch, look } from './watch.ts';

const hands = {
  chatRoot: (_a: { by?: unknown; key?: unknown }): string | null => null,
  ask: prHands.ask,
  show: prHands.show,
  napIn: prHands.napIn,
  roots: (): string[] => [],
};
function init(o: Partial<typeof hands>) {
  Object.assign(hands, o);
  prHands.ask = hands.ask;
  prHands.show = hands.show;
  prHands.napIn = hands.napIn;
  if (!process.env.MIND_FAKE_GH) startWatch(() => hands.roots());
}

const inPicked =
  (key: string, handler: RouteHandler): RouteHandler =>
  async (body, q, root, ...rest) => {
    const at = root || hands.chatRoot({ by: body?.by ?? q?.get('by'), key: body?.key ?? q?.get('key') });
    const dir = at ? repoDir(at, body?.repo ?? q?.get('repo')) : at;
    await hooksOk(key, body, dir);
    return handler(body, q, dir, ...rest);
  };

const PARTS: Routes = {
  ...PRS,
  ...REVIEW,
  ...ISSUES,
  'POST /api/gh/watch': async (_b, _q, root: string | null) => {
    if (!root || !process.env.MIND_FAKE_GH) return { ok: false };
    await look(root);
    return { ok: true };
  },
};
const ROUTES: Routes = Object.fromEntries(Object.entries(PARTS).map(([key, handler]) => [key, inPicked(key, handler)]));

export { ROUTES, init };
