import path from 'path';
import { placeOf } from '../base/gitcli.ts';
import { tagOf } from '../base/worktrees.ts';
import { HttpError } from '../base/routes.ts';
import { WIN } from '../base/util.ts';
import { AGENTS, reader } from './logs.ts';
import { commitsOf } from './commits.ts';
import { costOf } from './prices.ts';
import type { Routes } from '../../public/base/types.ts';
import type { Reader } from './logs.ts';
import type { Sums } from './prices.ts';

export interface Init {
  dataDir: string;
  projectsOf: (dir: string) => string[];
  worktreesDir: () => string;
  claudeDirs?: () => string[];
}

const RANGES = [1, 7, 30, 90];
const BIG = 64 << 20, FRESH = 5e3, HOUR = 3600e3;
let opts: Init | null = null, logs: Reader | null = null;

export function init(o: Init) {
  opts = o;
  logs = reader({ dataDir: o.dataDir, claudeDirs: o.claudeDirs });
}

const keyOf = (p: string) => (WIN ? p.toLowerCase() : p);
const inside = (a: string, b: string) => {
  const r = path.relative(b, a);
  return !r || (!r.startsWith('..') && !path.isAbsolute(r));
};

async function matcher(projects: string[], worktrees: string) {
  const roots = projects.map((p) => path.resolve(p));
  const tops = await Promise.all(roots.map((r) => placeOf(r).then((p) => p?.top || r, () => r)));
  const tags = tops.map((t) => keyOf(`${path.basename(t)}-${tagOf(t)}`));
  const wt = path.resolve(worktrees), memo = new Map<string, boolean>();
  return (f: string) => {
    let hit = memo.get(f);
    if (hit !== undefined) return hit;
    hit = !!f && (roots.some((r) => inside(f, r)) || (inside(f, wt) && tags.some((t) => {
      const first = keyOf(path.relative(wt, f).split(path.sep)[0] || '');
      return first === t || first.startsWith(`${t}-`);
    })));
    memo.set(f, hit);
    return hit;
  };
}

function bucketStarts(range: number, now = new Date()) {
  const out: number[] = [];
  if (range === 1) {
    const h = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    for (let k = 23; k >= 0; k--) out.push(h.getTime() - k * HOUR);
  } else for (let k = range - 1; k >= 0; k--) out.push(new Date(now.getFullYear(), now.getMonth(), now.getDate() - k).getTime());
  return out;
}

const slotOf = (starts: number[], at: number) => {
  if (at < starts[0]) return -1;
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

export async function dashboard(projects: string[], range: number, now = new Date()) {
  if (!opts || !logs) throw new HttpError(500, 'usage is not started');
  const starts = bucketStarts(range, now), end = now.getTime();
  const [match, commits] = await Promise.all([matcher(projects, opts.worktreesDir()), commitsOf(projects, range + 1)]);
  const { turns, sessions, folders, models: names } = logs.data();
  const buckets = starts.map((at) => ({ at, tokens: {} as Record<string, number>, chats: 0, commits: 0, files: 0 }));
  const per = new Map<string, { id: string; agent: string; sums: Sums }>();
  for (const t of turns) {
    const slot = t[0] > end ? -1 : slotOf(starts, t[0]);
    if (slot < 0 || !match(folders[t[1]])) continue;
    const id = names[t[2]], agent = AGENTS[t[3]], k = `${agent}\t${id}`, n = t[4] + t[5] + t[6] + t[7] + t[8];
    const m = per.get(k) || per.set(k, { id, agent, sums: [0, 0, 0, 0, 0] }).get(k)!;
    for (let i = 0; i < 5; i++) m.sums[i] += t[4 + i];
    buckets[slot].tokens[id] = (buckets[slot].tokens[id] || 0) + n;
  }
  for (const s of sessions) {
    const slot = s[0] > end ? -1 : slotOf(starts, s[0]);
    if (slot >= 0 && match(folders[s[1]])) buckets[slot].chats++;
  }
  for (const c of commits) {
    const slot = c.at > end ? -1 : slotOf(starts, c.at);
    if (slot < 0) continue;
    buckets[slot].commits++;
    buckets[slot].files += c.files;
  }
  const models = [...per.values()]
    .map((m) => ({ id: m.id, agent: m.agent, tokens: m.sums.reduce((a, b) => a + b, 0), cost: m.agent === 'Copilot' ? null : costOf(m.id, m.sums) }))
    .filter((m) => m.tokens > 0)
    .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokens - a.tokens);
  const sum = (f: (b: (typeof buckets)[number]) => number) => buckets.reduce((a, b) => a + f(b), 0);
  return {
    range,
    unit: range === 1 ? 'hour' : 'day',
    buckets,
    models,
    totals: {
      tokens: models.reduce((a, m) => a + m.tokens, 0),
      cost: models.reduce((a, m) => a + (m.cost || 0), 0),
      unpriced: models.some((m) => m.cost === null),
      chats: sum((b) => b.chats),
      commits: sum((b) => b.commits),
      files: sum((b) => b.files),
    },
  };
}

export async function answer(projects: string[], range: number) {
  if (!logs) throw new HttpError(500, 'usage is not started');
  if (!logs.ready()) {
    logs.refresh();
    return { reading: logs.reading() || { done: 0, total: 0 } };
  }
  if (logs.reading() || Date.now() - logs.since() > FRESH) {
    const job = logs.refresh();
    if ((await job.planned) > BIG) return { reading: logs.reading() || { done: 0, total: 0 } };
    await job.done;
  }
  return dashboard(projects, range);
}

export const ROUTES: Routes = {
  'GET /api/usage/dashboard': (_b, q, projectPath) => {
    if (!opts) throw new HttpError(500, 'usage is not started');
    const range = Number(q?.get('range') || 30), scope = q?.get('scope') || 'project';
    if (!RANGES.includes(range)) throw new HttpError(400, 'range is 1, 7, 30 or 90');
    if (scope !== 'project' && scope !== 'workspace') throw new HttpError(400, 'scope is project or workspace');
    if (typeof projectPath !== 'string' || !projectPath) throw new HttpError(400, 'no project');
    const projects = scope === 'workspace' ? opts.projectsOf(projectPath) : [projectPath];
    return answer(projects.length ? projects : [projectPath], range);
  },
};
