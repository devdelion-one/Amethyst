import { ghState } from '../base/ghcli.ts';
import { target, ghJson, login, hands } from './prs.ts';

const EVERY = 2 * 60e3;
type Seen = { roll: string; review: string; asked: boolean; state: string; title: string };
const seen = new Map<string, Map<number, Seen>>();

function roll(list: any[]) {
  const s = (list || []).map((c: any) => {
    if (c.__typename === 'StatusContext' || c.context) return String(c.state || '').toUpperCase() === 'SUCCESS' ? 'pass' : /FAIL|ERROR/i.test(c.state) ? 'fail' : 'running';
    if (String(c.status || '').toUpperCase() !== 'COMPLETED') return 'running';
    return /SUCCESS|NEUTRAL|SKIPPED/i.test(c.conclusion || '') ? 'pass' : 'fail';
  });
  return !s.length ? 'none' : s.includes('fail') ? 'fail' : s.includes('running') ? 'running' : 'pass';
}

async function look(root: string) {
  const t = await target(root).catch(() => null);
  if (!t) return;
  const me = await login(root);
  const list = (await ghJson(root, ['pr', 'list', '-R', t.repo, '--search', 'involves:@me', '--state', 'all', '--limit', '30', '--json', 'number,title,author,state,statusCheckRollup,reviewDecision,reviewRequests'])) || [];
  const before = seen.get(`${root}|${t.repo}`), now = new Map<number, Seen>();
  for (const p of list) {
    const mine = p.author?.login === me;
    const s: Seen = { roll: roll(p.statusCheckRollup), review: p.reviewDecision || '', asked: (p.reviewRequests || []).some((r: any) => r.login === me), state: p.state, title: p.title };
    now.set(p.number, s);
    const was = before?.get(p.number);
    if (!before) continue;
    const say = (text: string) => hands.show(root, { what: 'note', n: p.number, title: p.title, text });
    if (s.asked && !was?.asked && !mine) say(`${p.author?.login || 'someone'} asks for your review`);
    if (!was) continue;
    if (mine && s.state === 'MERGED' && was.state !== 'MERGED') say('merged');
    if (mine && s.roll !== was.roll && was.roll === 'running' && (s.roll === 'pass' || s.roll === 'fail')) say(s.roll === 'pass' ? 'checks pass' : 'a check fails');
    if (mine && s.review !== was.review && (s.review === 'APPROVED' || s.review === 'CHANGES_REQUESTED')) say(s.review === 'APPROVED' ? 'approved' : 'changes asked');
  }
  seen.set(`${root}|${t.repo}`, now);
}

let timer: ReturnType<typeof setInterval> | null = null;
function startWatch(roots: () => string[]) {
  if (timer) return;
  timer = setInterval(async () => {
    if ((await ghState()) !== 'in') return;
    for (const root of roots()) await look(root).catch(() => {});
  }, EVERY);
  timer.unref?.();
}

export { startWatch, look };
