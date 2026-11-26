const ENTERED = /worktree at [“"']([^”"']+)[”"']/i;
const textOf = (u: any) => (Array.isArray(u.content) ? u.content : []).map((c: any) => (c?.content?.type === 'text' ? c.content.text : '')).join('\n');

export function linkRoots() {
  let agent: string | null = null;
  const enter = new Map<string, string | null>(), exit = new Set<string>(), touched = new Set<string>();
  function see(u: any) {
    const id = u.toolCallId, name = u._meta?.claudeCode?.toolName;
    if (name === 'EnterWorktree' && !enter.has(id)) enter.set(id, null);
    if (name === 'ExitWorktree') exit.add(id);
    if (enter.has(id)) {
      if (typeof u.rawInput?.path === 'string' && u.rawInput.path) enter.set(id, u.rawInput.path);
      if (u.status === 'completed') agent = ENTERED.exec(textOf(u))?.[1] || enter.get(id) || agent;
    }
    if (exit.has(id) && u.status === 'completed') agent = null;
    for (const l of u.locations || []) if (typeof l?.path === 'string') touched.add(l.path);
    for (const c of u.content || []) if (c?.type === 'diff' && typeof c.path === 'string') touched.add(c.path);
  }
  function reset() {
    agent = null;
    enter.clear();
    exit.clear();
    touched.clear();
  }
  return { see, reset, agent: () => agent, touched: () => touched };
}
