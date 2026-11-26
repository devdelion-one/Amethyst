import { run, guardsAt } from './gitcli.ts';
import { runsGit } from './gitconfig.ts';
import type { RunOpts } from './gitcli.ts';

const FAKE = process.env.MIND_FAKE_GH;
async function gh(cwd: string, args: string[], o?: RunOpts) {
  const g = await guardsAt(cwd, o?.env);
  if (g.packs.length && runsGit(args)) return { out: '', err: `fatal: gh would run git with this repository's own ${g.packs.join(', ')}`, code: 1, missing: false, timedOut: false, guarded: g.keys };
  return FAKE ? run(process.execPath, [FAKE, ...args], cwd, o, g) : run('gh', args, cwd, o, g);
}

const githubAnswers = () => fetch('https://api.github.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) }).then(() => true, () => false);
async function ghAsk() {
  const r = await gh(process.cwd(), ['auth', 'status', '--hostname', 'github.com'], { timeout: 15e3 });
  if (r.missing) return 'none';
  if (!r.code) return 'in';
  if (r.timedOut) return 'offline';
  if (/not logged in/i.test(r.err + r.out)) return 'out';
  return (await githubAnswers()) ? 'out' : 'offline';
}
let seen: { at: number; state: string | null } = { at: 0, state: null }, asking: Promise<string> | null = null;
function ghState() {
  const keep = FAKE ? 0 : seen.state === 'in' ? 5 * 60e3 : 15e3;
  if (seen.state && Date.now() - seen.at < keep) return Promise.resolve(seen.state);
  return (asking ||= ghAsk()
    .then((state) => {
      seen = { at: Date.now(), state };
      return state;
    })
    .finally(() => (asking = null)));
}
const ghSeen = () => seen.state;
const ghForget = () => {
  seen = { at: 0, state: null };
};

export { gh, ghState, ghSeen, ghForget };
