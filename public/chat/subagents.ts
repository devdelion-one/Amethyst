interface ToolUpdate {
  toolCallId?: string;
  kind?: string;
  title?: string;
  status?: string;
  rawInput?: Record<string, any>;
  content?: any[];
  _meta?: any;
}
export interface Step {
  id: string;
  kind: string;
  title: string;
  status: string;
  at: number;
}
export interface SubMeta {
  agent?: boolean;
  parent?: string;
  name?: string;
  title?: string;
  type?: string;
  prompt?: string;
  model?: string;
  effort?: string;
  ran?: string;
  ranFrom?: string;
  bg?: boolean;
  end?: 'done' | 'failed' | 'stopped';
  endAt?: number;
  result?: string;
  handback?: boolean;
  again?: boolean;
}
export interface Sub {
  id: string;
  name: string;
  title: string;
  type: string;
  prompt: string;
  model: string;
  effort: string;
  status: string;
  bg: boolean;
  start: number;
  end: number;
  result: string;
  steps: Step[];
  ran?: string;
  ranFrom?: string;
}
export interface Run {
  id: string;
  input: Record<string, any>;
  title: string;
  status: string;
  bg: boolean;
  start: number;
  end: number;
  exit: number | null;
  seen?: string;
}
const KEEP = ['name', 'title', 'type', 'prompt', 'model', 'effort', 'ran', 'ranFrom'] as const;
const subOf = (u: ToolUpdate | null | undefined): SubMeta | null => u?._meta?.sub || null;

export function subagents() {
  const all = new Map<string, Sub>();
  function feed(u: ToolUpdate, at = Date.now()) {
    const m = subOf(u);
    if (!m || !u.toolCallId) return null;
    if (m.agent) {
      let s: Sub | undefined = all.get(u.toolCallId);
      if (!s) all.set(u.toolCallId, (s = { id: u.toolCallId, name: '', title: '', type: '', prompt: '', model: '', effort: '', status: 'running', bg: false, start: at, end: 0, result: '', steps: [] }));
      for (const k of KEEP) if (typeof m[k] === 'string' && m[k]) s[k] = m[k];
      if (m.bg) s.bg = true;
      if (m.again && s.status !== 'running') Object.assign(s, { status: 'running', end: 0 });
      if (m.end && s.status === 'running') end(s, m.end, m.result || '', m.endAt || at);
      else if (m.result) s.result = m.result;
      return { sub: s, step: null };
    }
    const s = m.parent && all.get(m.parent);
    if (!s) return null;
    if (m.end || m.handback) {
      if (m.result) s.result = m.result;
      if (m.end && s.status === 'running') end(s, m.end, s.result, at);
      return { sub: s, step: null };
    }
    let step = s.steps.find((x: Step) => x.id === u.toolCallId);
    if (!step) s.steps.push((step = { id: u.toolCallId, kind: u.kind || 'other', title: '', status: 'pending', at }));
    if (u.kind) step.kind = u.kind;
    if (u.title) step.title = u.title;
    if (u.status) step.status = u.status;
    return { sub: s, step };
  }
  function end(s: Sub, status: string, result: string, at: number) {
    s.status = status;
    if (result) s.result = result;
    s.end = at;
  }
  return {
    all,
    feed,
    get: (id: string) => all.get(id)!,
    running: () => [...all.values()].filter((s) => s.status === 'running').length,
    stopAll: (at = Date.now()) => all.forEach((s) => s.status === 'running' && end(s, 'stopped', '', at)),
  };
}

const BG = /^Command running in background with ID:/;
export function cmdRuns() {
  const all = new Map<string, Run>();
  function feed(u: ToolUpdate, at = Date.now()) {
    const m = u?._meta || {};
    if (!u?.toolCallId || m.sub) return null;
    let r = all.get(u.toolCallId);
    if (!r) {
      if (u.kind !== 'execute') return null;
      all.set(u.toolCallId, (r = { id: u.toolCallId, input: {}, title: '', status: 'running', bg: false, start: at, end: 0, exit: null }));
    }
    if (u.rawInput) Object.assign(r.input, u.rawInput);
    if (u.title) r.title = u.title;
    if (BG.test(m.terminal_output?.data || '') || m.liveOutput?.bg) r.bg = true;
    if (m.terminal_exit) r.exit = m.terminal_exit.exit_code;
    if (m.liveOutput?.exit != null) r.exit = m.liveOutput.exit;
    const over = u.status === 'failed' || (u.status === 'completed' && !r.bg) || (r.bg && (m.terminal_exit || m.liveOutput?.done));
    if (over && r.status === 'running') endRun(r, u.status === 'failed' || r.exit ? 'failed' : 'done', at);
    return r;
  }
  return {
    all,
    feed,
    get: (id: string) => all.get(id),
    running: () => [...all.values()].filter((r) => r.status === 'running').length,
    behind: () => [...all.values()].filter((r) => r.bg && r.status === 'running').length,
    stopAll: (at = Date.now()) => all.forEach((r) => r.status === 'running' && endRun(r, 'stopped', at)),
  };
}
function endRun(r: Run, status: string, at: number) {
  r.status = status;
  r.end = at;
}
const CD = /^\s*cd\s+(?:\/d\s+)?(?:"([^"]+)"|'([^']+)'|([^\s;&]+))\s*(?:&&|;)\s*/i;
export function cdOf(command: unknown) {
  const all = typeof command === 'string' ? command : '', m = CD.exec(all);
  if (!m || !all.slice(m[0].length).trim()) return { dir: '', cmd: all };
  const path = m[1] || m[2] || m[3], parts = path.split(/[\\/]+/).filter((x) => x && !/^[a-z]:$/i.test(x));
  const last = parts.at(-1) || path, up = parts.at(-2);
  return { dir: up && up !== last && up.toLowerCase().startsWith(last.toLowerCase()) ? up : last, cmd: all.slice(m[0].length) };
}
export const runName = (r: Run) => r.input.description || cdOf(r.input.command).cmd || r.title || 'command';

export const nameOf = (s: Sub) => s.name || s.title || 'subagent';
const FAMILY = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/;
export const modelName = (id: unknown) => {
  const m = typeof id === 'string' && id.match(FAMILY);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}` : id || '';
};
export const chipsOf = (s: Sub) => [s.type, [modelName(s.ran) || s.model, s.effort && `${s.effort} effort`].filter(Boolean).join(' · '), s.bg && 'background'].filter(Boolean) as string[];
export const ranTip = (s: Sub) => `the model this subagent ran on${s.ranFrom ? ', ' + s.ranFrom : ''}`;
export const tipOf = (s: Sub, c: string) => (s.ran && c.startsWith(modelName(s.ran) as string) ? ranTip(s) : c === 'background' ? 'runs in the background: the turn can end before it does' : '');
