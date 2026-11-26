type Ev = Record<string, any>;
interface Where {
  root?: string;
  path?: string;
  cwd?: string;
  branch?: string;
}
interface Input {
  from: string;
  to: string;
  since?: number;
  cwd: string;
  wt?: Where | null;
  files?: string[];
  rules?: string | null;
  saved?: string | null;
  budget?: number;
  names?: Record<string, string>;
}
interface Item {
  who: 'user' | 'agent' | 'tool' | 'note';
  text: string;
  by?: string;
}

const BUDGET = 40000;
const AGENT_HEAD = 160;
const AGENT_TAIL = 240;
const USER_KEEP = 1200;
const PROTECT_TURNS = 2;
const LINE = 200;
const TEXTS = /^(user_message|agent_message)_chunk$/;
const NOISY_KIND = /^(read|search|grep|glob|list)$/i;
const NOISY_TITLE = /^(read|search|grep|rg|glob|list)\b/i;
const READ_CMD = /^(grep|rg|select-string|ls|dir|get-childitem|cat|type|get-content|head|tail|find|wc|cut|sort|uniq|pwd|echo|cd|select-object|where-object|foreach-object|measure-object|git\s+(status|log|diff|show|branch)|sed\s+-n)\b/i;

const one = (s: unknown, n = LINE) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const slash = (p: string) => p.replace(/\\/g, '/');

function clipMiddle(s: string, head: number, tail: number) {
  if (s.length <= head + tail + 7) return s;
  return `${s.slice(0, head).trimEnd()} […] ${s.slice(s.length - tail).trimStart()}`;
}

function isReadOnlyShell(cmd: string) {
  const clean = cmd.trim();
  if (!clean || /[>]|2>&1|\btee\b|\brm\b|\bmv\b|\bcp\b|\bmkdir\b/i.test(clean)) return false;
  const parts = clean.split(/\s*(?:&&|\|\||;|\|)\s*/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => READ_CMD.test(p));
}

function isNoisyTool(t: Ev) {
  if (t.status === 'failed') return false;
  if (t.kind === 'edit' || t.kind === 'delete' || t.kind === 'move') return false;
  if (typeof t.kind === 'string' && NOISY_KIND.test(t.kind)) return true;
  if (t.kind === 'execute') return isReadOnlyShell(String(t.rawInput?.command || t.title || ''));
  return !t.kind && NOISY_TITLE.test(String(t.title || ''));
}

function pathsOf(t: Ev, cwd: string) {
  const out = new Set<string>();
  const add = (p: unknown) => {
    if (typeof p !== 'string' || !p) return;
    let q = slash(p);
    const base = slash(cwd).replace(/\/$/, '');
    if (base && q.toLowerCase().startsWith(base.toLowerCase() + '/')) q = q.slice(base.length + 1);
    out.add(q);
  };
  for (const l of t.locations || []) add(l?.path);
  for (const c of t.content || []) if (c?.type === 'diff') add(c.path);
  for (const c of t.rawInput?.changes || []) add(c?.path);
  return [...out];
}

function toolLine(t: Ev, cwd: string) {
  const files = pathsOf(t, cwd);
  const cmd = t.rawInput?.command;
  const title = one(t.title || t.kind || 'tool');
  const state = t.status === 'failed' ? 'failed' : t.status === 'completed' ? 'completed' : '';
  const tail = state ? `: ${state}` : '';
  if (t.kind === 'edit') return `edited ${files.join(', ') || title}${state === 'failed' ? ' (failed)' : ''}`;
  if (t.kind === 'delete') return `deleted ${files.join(', ') || title}${state === 'failed' ? ' (failed)' : ''}`;
  if (t.kind === 'move') return `moved ${files.join(', ') || title}`;
  if (t.kind === 'read') return `read ${files.join(', ') || title}`;
  if (t.kind === 'execute') return `ran \`${one(cmd || t.title, 160)}\`${tail}`;
  return `${title}${tail}`;
}

function planOf(events: Ev[]) {
  let plan: any[] | null = null;
  for (const ev of events) if (ev.type === 'update' && ev.update?.sessionUpdate === 'plan' && Array.isArray(ev.update.entries)) plan = ev.update.entries;
  return plan;
}

function latestSummary(events: Ev[], since: number) {
  let text = '', id: unknown = null, at = 0;
  for (const ev of events) {
    const u = ev.update;
    if (ev.type !== 'update' || u?.sessionUpdate !== 'compaction_summary_chunk') continue;
    if (u.compactionId !== id) text = '';
    id = u.compactionId;
    at = ev.at || at;
    text += u.content?.text || '';
  }
  const clean = text.trim();
  if (!clean) return { text: '', cut: since };
  if (at > since) return { text: clean, cut: at };
  return { text: since ? clean : '', cut: since };
}

function walk(events: Ev[], since: number, cwd: string, names: Record<string, string>, agent: string, filterNoise = false) {
  const items: Item[] = [];
  const tools = new Map<string, Ev>();
  const order: { id: string; at: number }[] = [];
  let turns = 0, who = agent;
  const push = (it: Item) => {
    const last = items.at(-1);
    if (last && last.who === it.who && last.by === it.by && (it.who === 'agent' || it.who === 'user')) last.text += it.text;
    else items.push(it);
  };
  for (const ev of events) {
    if (ev.type === 'switch') {
      who = ev.to;
      if ((ev.at || 0) > since) items.push({ who: 'note', text: `(the chat went on with ${names[ev.to] || ev.to})` });
      continue;
    }
    if ((ev.at || 0) <= since) continue;
    if (ev.type === 'you') {
      turns++;
      const extra = [ev.images?.length ? ` [images: ${ev.images.map((i: Ev) => i.path).join(', ')}]` : '', ev.ctx?.path ? ` [open file: ${ev.ctx.path}]` : ''].join('');
      items.push({ who: 'user', text: String(ev.text || '') + extra });
    } else if (ev.type === 'turn') {
      if (ev.stopReason === 'cancelled') items.push({ who: 'note', text: '(the user stopped that turn)' });
      else if (ev.stopReason === 'error') items.push({ who: 'note', text: `(that turn failed${ev.text ? ': ' + one(ev.text, 160) : ''})` });
    } else if (ev.type === 'update') {
      const u = ev.update || {};
      if (u._meta?.sub?.parent || u._meta?.claudeCode?.parentToolUseId) continue;
      if (u.sessionUpdate === 'user_message_chunk' && u.content?.type === 'text') {
        const last = items.at(-1);
        if (!(last?.who === 'user')) turns++;
        push({ who: 'user', text: u.content.text });
      } else if (TEXTS.test(u.sessionUpdate) && u.content?.type === 'text') {
        push({ who: 'agent', by: names[who] || who, text: u.content.text });
      } else if ((u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') && u.toolCallId) {
        const had = tools.get(u.toolCallId);
        if (!had) {
          items.push({ who: 'tool', text: '' });
          order.push({ id: u.toolCallId, at: items.length - 1 });
        }
        tools.set(u.toolCallId, { ...had, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v != null)) });
      }
    }
  }
  if (/^\(the chat went on with /.test(items.at(-1)?.text || '')) items.pop();
  const drop = new Set<number>();
  for (const { id, at } of order) {
    const t = tools.get(id)!;
    if (filterNoise && isNoisyTool(t)) drop.add(at);
    else items[at].text = toolLine(t, cwd);
  }
  const clean = drop.size ? items.filter((_, i) => !drop.has(i)) : items;
  return { items: clean, turns };
}

function protectIndex(list: Item[]) {
  let seen = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].who === 'user' && ++seen >= PROTECT_TURNS) return i;
  }
  return 0;
}

function shrink(items: Item[], budget: number) {
  const size = (list: Item[]) => list.reduce((n, it) => n + it.text.length + 12, 0);
  const list = items.map((it) => ({ ...it }));
  let cut = false;
  if (size(list) <= budget) return { list, cut };
  let protect = protectIndex(list);
  for (let i = 0; i < protect; i++) {
    if (size(list) <= budget) break;
    const it = list[i];
    if (it.who === 'agent' && it.text.length > AGENT_HEAD + AGENT_TAIL + 7) {
      it.text = clipMiddle(it.text, AGENT_HEAD, AGENT_TAIL);
      cut = true;
    }
  }
  let dropped = 0;
  while (size(list) > budget) {
    const at = list.findIndex((it, i) => i < protect && (it.who === 'tool' || it.who === 'note'));
    if (at < 0) break;
    list.splice(at, 1);
    protect--;
    dropped++;
  }
  for (let i = 0; i < protect; i++) {
    if (size(list) <= budget) break;
    const it = list[i];
    if (it.who === 'user' && it.text.length > USER_KEEP) {
      it.text = clipMiddle(it.text, 500, 500);
      cut = true;
    }
  }
  while (protect > 0 && size(list) > budget) {
    list.splice(0, 1);
    protect--;
    dropped++;
  }
  for (let i = protect; i < list.length; i++) {
    if (size(list) <= budget) break;
    const it = list[i];
    if (it.who === 'agent' && it.text.length > AGENT_HEAD + AGENT_TAIL + 7) {
      it.text = clipMiddle(it.text, AGENT_HEAD, AGENT_TAIL);
      cut = true;
    }
  }
  for (let i = protect; i < list.length; i++) {
    if (size(list) <= budget) break;
    const it = list[i];
    if (it.who === 'user' && it.text.length > USER_KEEP) {
      it.text = clipMiddle(it.text, 500, 500);
      cut = true;
    }
  }
  while (list.length > 1 && size(list) > budget) {
    const at = list.findIndex((it) => it.who === 'tool' || it.who === 'note');
    list.splice(at < 0 ? 0 : at, 1);
    dropped++;
  }
  if (dropped) {
    list.unshift({ who: 'note', text: `(${dropped} earlier steps left out)` });
    cut = true;
  }
  return { list, cut };
}

function render(list: Item[]) {
  return list
    .map((it, i) => {
      const line = it.who === 'user' ? `User: ${it.text.trim()}` : it.who === 'agent' ? `${it.by}: ${it.text.trim()}` : it.who === 'tool' ? `  - ${it.text}` : it.text;
      if (!i) return line;
      return (it.who === 'tool' && list[i - 1].who === 'tool' ? '\n' : '\n\n') + line;
    })
    .join('');
}

function unresolvedFailures(items: Item[]) {
  const key = (s: string) => s.replace(/(?::\s*(?:failed|completed)|\s*\(failed\))$/i, '').trim();
  const open = new Map<string, string>();
  for (const it of items) {
    if (it.who !== 'tool') continue;
    const k = key(it.text);
    if (/(: failed|\(failed\))$/.test(it.text)) open.set(k, it.text);
    else open.delete(k);
  }
  return [...open.values()].slice(0, 10);
}
export function lastSpoke(events: Ev[], agent: string, now: string) {
  let who = events.find((e) => e.type === 'switch')?.from || now, at = 0;
  for (const ev of events) {
    if (ev.type === 'switch') who = ev.to;
    else if (ev.type === 'turn' && who === agent && ev.stopReason !== 'interrupted') at = ev.at || at;
  }
  return at;
}

export function handoff(events: Ev[], o: Input) {
  const names = o.names || {};
  const since = o.since || 0;
  const budget = o.budget ?? BUDGET;
  const from = names[o.from] || o.from, to = names[o.to] || o.to;
  const first = events.find((e) => e.type === 'switch')?.from || o.from;
  const sum = latestSummary(events, since);
  const win = walk(events, sum.cut, o.cwd, names, first, true);
  const now = shrink(win.items, budget);
  const all = walk(events, 0, o.cwd, names, first, false);

  const files = [...new Set([...(o.files || []), ...all.items.filter((i) => i.who === 'tool' && /^edited /.test(i.text)).flatMap((i) => i.text.slice(7).replace(/ \(failed\)$/, '').split(', '))])].filter(Boolean);
  const plan = planOf(events);
  const earlier = sum.text;
  const firstAsk = now.cut ? one(all.items.find((i) => i.who === 'user')?.text || '', 300) : '';
  const failures = now.cut ? unresolvedFailures(all.items) : [];

  const head: string[] = [
    `[Handoff from Amethyst. Read it; don't answer it. The user's message follows it.]`,
    `You take over this chat from ${from}. You have none of its session: what you know of it is below, built from the chat log. The user sees the whole chat, so don't repeat it back. Files may have changed since: check them and \`git status\` yourself before you rely on what's here.`,
  ];
  if (o.rules) head.push(`This project's rules are in ${o.rules}: read it first.`);
  head.push(`Working folder: ${o.cwd}${o.wt?.branch ? `\nThis is a git worktree on branch ${o.wt.branch}${o.wt.root ? ` of ${o.wt.root}` : ''}: work here, not in the main folder.` : ''}`);
  if (firstAsk) head.push(`Original ask: ${firstAsk}`);
  if (files.length) head.push(`Files this chat changed:\n${files.slice(0, 80).map((f) => `- ${f}`).join('\n')}${files.length > 80 ? `\n- … and ${files.length - 80} more` : ''}`);
  if (failures.length) head.push(`Unresolved failures:\n${failures.map((f) => `- ${f}`).join('\n')}`);
  if (plan?.length) head.push(`The last plan:\n${plan.map((e: Ev) => `- [${e.status === 'completed' ? 'x' : e.status === 'in_progress' ? '~' : ' '}] ${one(e.content)}`).join('\n')}`);
  if (earlier) head.push(`Earlier, ${from}'s own summary of the chat up to then:\n${earlier.slice(0, 6000)}`);

  const chat = render(now.list);
  const foot: string[] = [];
  if (o.saved) foot.push(`${now.cut ? 'Parts above are cut short. ' : ''}The whole chat, without cuts, is in ${o.saved}: read it if you need more.`);
  foot.push(`[End of the handoff.]`);

  const text = [...head, win.items.length ? `The chat${since ? ` since ${to} last took part` : ''}, oldest first:\n\n${chat}` : `Nothing happened in the chat since ${to} last took part.`, ...foot].join('\n\n');
  const full = [`# Chat handed from ${from} to ${to}`, files.length ? `Files changed:\n${files.map((f) => `- ${f}`).join('\n')}` : '', render(all.items)].filter(Boolean).join('\n\n');
  const parts = {
    from,
    to,
    rules: o.rules || null,
    cwd: o.cwd,
    wt: o.wt?.branch ? { branch: o.wt.branch, root: o.wt.root || null } : null,
    firstAsk,
    files: files.slice(0, 80),
    filesMore: Math.max(0, files.length - 80),
    failures,
    plan: (plan || []).map((e: Ev) => ({ text: one(e.content), done: e.status === 'completed', now: e.status === 'in_progress' })),
    earlier: earlier ? earlier.slice(0, 6000) : '',
    chat: now.list.map((it) => ({ who: it.who, by: it.by || '', text: it.text.trim() })),
    since: !!since,
    cut: !!o.saved && now.cut,
    saved: o.saved || null,
  };
  return { text, turns: win.turns, full, parts };
}
