import fs from 'fs';
const fsp = fs.promises;
import os from 'os';
import path from 'path';
import { accountInUse, homeOf, items, shareOf, tagOf } from '../base/accounts.ts';
import type { Routes } from '../../public/base/types.ts';
import { stamp } from '../base/util.ts';
import { HttpError } from '../base/routes.ts';

type Skill = { name: string; abs: string; description: string };
type Plugin = { id: string; name: string; abs: string; disabled: boolean; description: string };
type ConfigSpec = { kind: string; label: string; about: string; seed: string; paths: Record<string, (root: string) => string[]> };
type MoveAcross = (from: string, to: string) => Promise<{ left?: string }>;
interface SetupAgent {
  skills: Record<string, (root: string) => string>;
  instructions: Record<string, (root: string) => string[]>;
  rules?: Record<string, (root: string) => string>;
  configs?: ConfigSpec[];
  plugins?: Record<string, (root: string) => string[]>;
  memory: ((root: string) => string) | null;
  note?: string;
}

let archiveAt = (sub: string) => path.join(os.tmpdir(), 'amethyst-archive', sub), moveAcross: MoveAcross | null = null;
const init = (o: { archiveAt: (sub: string) => string; moveAcross: MoveAcross }) => ({ archiveAt, moveAcross } = o);

const codexDir = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const geminiDir = () => process.env.GEMINI_HOME || path.join(os.homedir(), '.gemini');
const copilotDir = () => process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot');
const grokDir = () => process.env.GROK_HOME || path.join(os.homedir(), '.grok');

const claudeOf = (am: number): SetupAgent => {
  const h = homeOf(accountInUse(am));
  return {
    skills: { global: () => path.join(h.setup, 'skills'), project: (root) => path.join(root, '.claude', 'skills') },
    instructions: { global: () => [path.join(h.setup, 'CLAUDE.md')], project: (root) => [path.join(root, '.claude', 'CLAUDE.md'), path.join(root, 'CLAUDE.md')] },
    rules: { global: () => path.join(h.setup, 'rules') },
    memory: (root) => h.memory(root),
  };
};
const AGENTS: Record<string, SetupAgent> = {
  codex: {
    skills: { global: () => path.join(codexDir(), 'skills'), project: (root) => path.join(root, '.agents', 'skills') },
    instructions: { global: () => [path.join(codexDir(), 'AGENTS.md')], project: (root) => [path.join(root, 'AGENTS.md')] },
    memory: null,
    note: 'Codex keeps its memory itself, not in files',
  },
  antigravity: {
    skills: { global: () => path.join(geminiDir(), 'config', 'skills'), project: (root) => path.join(root, '.agents', 'skills') },
    instructions: { global: () => [path.join(geminiDir(), 'GEMINI.md')], project: (root) => [path.join(root, 'GEMINI.md'), path.join(root, 'AGENTS.md')] },
    rules: { global: () => path.join(geminiDir(), 'config', 'rules'), project: (root) => path.join(root, '.agents', 'rules') },
    configs: [
      {
        kind: 'hooks',
        label: 'hooks',
        about: 'Lifecycle hooks for Antigravity.',
        seed: '{\n}\n',
        paths: {
          global: () => [path.join(geminiDir(), 'config', 'hooks.json'), path.join(geminiDir(), 'antigravity-cli', 'hooks.json')],
          project: (root) => [path.join(root, '.agents', 'hooks.json')],
        },
      },
      {
        kind: 'mcp',
        label: 'mcp',
        about: 'MCP servers configured for Antigravity.',
        seed: '{\n  "mcpServers": {}\n}\n',
        paths: {
          global: () => [path.join(geminiDir(), 'config', 'mcp_config.json'), path.join(geminiDir(), 'antigravity-cli', 'mcp_config.json')],
          project: (root) => [path.join(root, '.agents', 'mcp_config.json')],
        },
      },
    ],
    plugins: {
      global: () => [path.join(geminiDir(), 'config', 'plugins'), path.join(geminiDir(), 'antigravity-cli', 'plugins')],
      project: (root) => [path.join(root, '.agents', 'plugins')],
    },
    memory: null,
    note: 'Antigravity keeps no memory files: its /learn command writes skills and rules instead',
  },
  cursor: {
    skills: { global: () => path.join(os.homedir(), '.cursor', 'skills'), project: (root) => path.join(root, '.cursor', 'skills') },
    instructions: { project: (root) => [path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md')] },
    memory: null,
    note: 'Cursor keeps no memory files: its project rules are in .cursor/rules',
  },
  copilot: {
    skills: { global: () => path.join(copilotDir(), 'skills'), project: (root) => path.join(root, '.github', 'skills') },
    instructions: { global: () => [path.join(copilotDir(), 'copilot-instructions.md')], project: (root) => [path.join(root, '.github', 'copilot-instructions.md'), path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md')] },
    memory: null,
    note: 'Copilot keeps its memories itself, not in files: it also reads .agents/skills, .claude/skills and .github/instructions',
  },
  grok: {
    skills: { global: () => path.join(grokDir(), 'skills'), project: (root) => path.join(root, '.grok', 'skills') },
    instructions: { project: (root) => [path.join(root, 'AGENTS.md'), path.join(root, 'CLAUDE.md')] },
    rules: { global: () => path.join(grokDir(), 'rules'), project: (root) => path.join(root, '.grok', 'rules') },
    memory: null,
    note: 'Grok keeps cross-session memory under ~/.grok/memory-v2 (run /memory in a chat to browse it); it also reads .agents/skills, .claude/skills and .cursor/skills',
  },
};

const agentOf = (id: unknown, am = 1) => {
  if (id === 'claude') return claudeOf(am);
  const a = Object.hasOwn(AGENTS, id as PropertyKey) && AGENTS[id as string];
  if (!a) throw new HttpError(400, 'which agent?');
  return a;
};
const NAME = /^[\w.\- ]{1,100}$/;
const nameOf = (n: unknown) => {
  const s = String(n ?? '').trim();
  if (!NAME.test(s) || /^\.+$/.test(s) || s.includes('..')) throw new HttpError(400, 'use letters, digits, spaces, - _ or .');
  return s;
};
const statOf = (p: string) => fsp.stat(p).catch(() => null);
const whereOf = (w: unknown) => {
  if (w !== 'global' && w !== 'project') throw new HttpError(400, 'global or project?');
  return w;
};
const needRoot = (root: string | null) => {
  if (!root) throw new HttpError(409, 'open a project first');
  return root;
};

async function describe(file: string) {
  const text = await fsp.readFile(file, 'utf8').catch(() => '');
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const m = fm && /^description:\s*(.*)$/m.exec(fm[1]);
  return m ? m[1].replace(/^(["'])(.*)\1$/, '$2').trim() : '';
}
async function skillsIn(dir: string) {
  const names = await fsp.readdir(dir).catch(() => []);
  const rows = await Promise.all(
    names.map(async (name) => {
      const abs = path.join(dir, name, 'SKILL.md');
      return (await statOf(abs))?.isFile() ? { name, abs, description: await describe(abs) } : null;
    }),
  );
  return (rows.filter(Boolean) as Skill[]).sort((a, b) => a.name.localeCompare(b.name));
}
async function mdIn(dir: string) {
  const names = (await fsp.readdir(dir).catch(() => [])).filter((n) => /\.md$/i.test(n));
  const stats = await Promise.all(names.map((n) => statOf(path.join(dir, n))));
  return names.flatMap((name, i) => (stats[i]?.isFile() ? [{ name, abs: path.join(dir, name) }] : [])).sort((a, b) => (a.name === 'MEMORY.md' ? -1 : b.name === 'MEMORY.md' ? 1 : a.name.localeCompare(b.name)));
}
const PLUGIN_MANIFESTS = ['plugin.json', path.join('.antigravity-plugin', 'plugin.json'), path.join('.gemini-plugin', 'plugin.json')];
async function pluginsIn(dirs: string[]) {
  const seen = new Set<string>(), out: Plugin[] = [];
  for (const dir of dirs) {
    const names = await fsp.readdir(dir).catch(() => []);
    for (const id of names) {
      let abs = '';
      for (const rel of PLUGIN_MANIFESTS) {
        const p = path.join(dir, id, rel);
        if ((await statOf(p))?.isFile()) {
          abs = p;
          break;
        }
      }
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      let name = id, disabled = false, description = '';
      try {
        const raw = JSON.parse(await fsp.readFile(abs, 'utf8'));
        if (typeof raw?.name === 'string' && raw.name.trim()) name = raw.name.trim();
        if (raw?.disabled === true) disabled = true;
        if (typeof raw?.description === 'string' && raw.description.trim()) description = raw.description.trim();
      } catch {}
      out.push({ id, name, abs, disabled, description });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
async function firstOf(list: string[]) {
  for (const p of list) if ((await statOf(p))?.isFile()) return { abs: p, exists: true };
  return { abs: list[0], exists: false };
}

async function takeOut(abs: string, label: string, forever: boolean) {
  if (forever) return fsp.rm(abs, { recursive: true, force: true });
  return moveAcross!(abs, path.join(archiveAt('agent setup'), `${stamp()} ${label}`));
}

const ROUTES: Routes = {
  'GET /api/setup': async (_b, q, root: string | null, _p, _R, am = 1) => {
    const id = q!.get('agent'), a = agentOf(id, am);
    const skills: Record<string, { dir: string | null; list: Skill[] }> = {};
    for (const w of ['global', 'project']) {
      const dir = w === 'project' && !root ? null : a.skills[w](root!);
      skills[w] = { dir, list: dir ? await skillsIn(dir) : [] };
    }
    const instructions: { which: string; abs: string; exists: boolean }[] = [];
    for (const w of ['global', 'project']) if (a.instructions[w] && (w === 'global' || root)) instructions.push({ which: w, ...(await firstOf(a.instructions[w](root!))) });
    const rules = a.rules?.global ? await mdIn(a.rules.global(root!)) : [];
    const projectRules = a.rules?.project && root ? await mdIn(a.rules.project(root)) : [];
    const ruleScopes = { global: !!a.rules?.global, project: !!(a.rules?.project && root) };
    const configs: { kind: string; label: string; about: string; which: string; abs: string; exists: boolean }[] = [];
    for (const c of a.configs || []) {
      for (const w of ['global', 'project']) {
        if (c.paths[w] && (w === 'global' || root)) configs.push({ kind: c.kind, label: c.label, about: c.about, which: w, ...(await firstOf(c.paths[w](root!))) });
      }
    }
    let plugins: Record<string, { dir: string | null; list: Plugin[] }> | null = null;
    if (a.plugins) {
      plugins = {};
      for (const w of ['global', 'project'] as const) {
        const dirs = w === 'project' && !root ? [] : a.plugins[w] ? a.plugins[w]!(root!) : [];
        plugins[w] = { dir: dirs[0] || null, list: dirs.length ? await pluginsIn(dirs) : [] };
      }
    }
    let memory: any = { note: a.note || '' };
    if (a.memory && root) {
      const dir = a.memory(root);
      memory = { dir, exists: !!(await statOf(dir))?.isDirectory(), files: await mdIn(dir) };
    }
    let account = null;
    if (id === 'claude') {
      const acc = accountInUse(am), h = homeOf(acc), list = items(acc);
      const mine = (n: string) => !!list.find((x) => x.name === n)?.shared;
      account = { id: acc.id, name: acc.dir ? tagOf(acc) : 'main account', dir: h.dir, share: shareOf(acc), shared: { instructions: mine('CLAUDE.md'), rules: mine('rules'), skills: mine('skills'), memory: !h.own } };
    }
    return { agent: id, project: !!root, skills, instructions, rules, projectRules, hasRules: !!a.rules, ruleScopes, configs, plugins, memory, account };
  },
  'POST /api/setup/skill': async ({ agent, where, name }, _q, root: string | null, _p, _R, am = 1) => {
    const a = agentOf(agent, am), n = nameOf(name), w = whereOf(where);
    const dir = path.join(a.skills[w](w === 'project' ? needRoot(root) : root!), n);
    if (await statOf(dir)) throw new HttpError(409, `there is a skill called ${n} already`);
    await fsp.mkdir(dir, { recursive: true });
    const abs = path.join(dir, 'SKILL.md');
    await fsp.writeFile(abs, `---\nname: ${n}\ndescription: \n---\n\n`);
    return { abs };
  },
  'POST /api/setup/plugin': async ({ agent, where, name }, _q, root: string | null, _p, _R, am = 1) => {
    const a = agentOf(agent, am), n = nameOf(name), w = whereOf(where);
    const dirFn = a.plugins?.[w];
    if (!dirFn) throw new HttpError(400, 'this agent has no plugins folder');
    const dirs = w === 'project' ? dirFn(needRoot(root)) : dirFn(root!);
    const dir = path.join(dirs[0], n);
    if (await statOf(dir)) throw new HttpError(409, `there is a plugin called ${n} already`);
    await fsp.mkdir(dir, { recursive: true });
    const abs = path.join(dir, 'plugin.json');
    await fsp.writeFile(abs, `{\n  "name": ${JSON.stringify(n)}\n}\n`);
    return { abs };
  },
  'POST /api/setup/file': async ({ agent, which, kind }, _q, root: string | null, _p, _R, am = 1) => {
    const a = agentOf(agent, am);
    let abs: string, seed = '';
    if (which === 'memory') {
      if (!a.memory) throw new HttpError(400, 'this agent keeps no memory files');
      abs = path.join(a.memory(needRoot(root)), 'MEMORY.md');
    } else if (kind) {
      const w = whereOf(which);
      const spec = a.configs?.find((c) => c.kind === kind);
      if (!spec?.paths[w]) throw new HttpError(400, 'this agent has no such file');
      abs = (await firstOf(spec.paths[w](w === 'project' ? needRoot(root) : root!))).abs;
      seed = spec.seed;
    } else {
      const w = whereOf(which);
      if (!a.instructions[w]) throw new HttpError(400, 'this agent has no such file');
      abs = (await firstOf(a.instructions[w](w === 'project' ? needRoot(root) : root!))).abs;
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    if (!(await statOf(abs))) await fsp.writeFile(abs, seed);
    return { abs };
  },
  'POST /api/setup/rule': async ({ agent, name, where }, _q, root: string | null, _p, _R, am = 1) => {
    const a = agentOf(agent, am);
    const w = where ? whereOf(where) : 'global';
    const dirFn = a.rules?.[w];
    if (!dirFn) throw new HttpError(400, 'this agent has no rules folder');
    const dir = dirFn(w === 'project' ? needRoot(root) : root!);
    const n = nameOf(name).replace(/\.md$/i, ''), abs = path.join(dir, `${n}.md`);
    if (await statOf(abs)) throw new HttpError(409, `there is a rule called ${n} already`);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, `# ${n}

`);
    return { abs };
  },
  'POST /api/setup/memory': async ({ name }, _q, root: string | null, _p, _R, am = 1) => {
    const n = nameOf(name).replace(/\.md$/i, ''), dir = claudeOf(am).memory!(needRoot(root));
    const file = `${n}.md`, abs = path.join(dir, file);
    if (file.toLowerCase() === 'memory.md' || (await statOf(abs))) throw new HttpError(409, `there is a memory called ${n} already`);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(abs, `---\nname: ${n}\ndescription: \n---\n\n`);
    const index = path.join(dir, 'MEMORY.md');
    const old = await fsp.readFile(index, 'utf8').catch(() => '');
    await fsp.writeFile(index, `${old}${old && !old.endsWith('\n') ? '\n' : ''}- [${n}](${file})\n`);
    return { abs };
  },
  'POST /api/setup/remove': async ({ agent, kind, where, name, forever }, _q, root: string | null, _p, _R, am = 1) => {
    const a = agentOf(agent, am);
    if (kind === 'skill') {
      const n = nameOf(name), w = whereOf(where);
      const dir = path.join(a.skills[w](w === 'project' ? needRoot(root) : root!), n);
      if (!(await statOf(dir))?.isDirectory()) throw new HttpError(404, 'no such skill');
      return { ok: true, ...(await takeOut(dir, `${agent} skill ${n}`, !!forever)) };
    }
    if (kind === 'plugin') {
      const n = nameOf(name), w = whereOf(where);
      const dirFn = a.plugins?.[w];
      if (!dirFn) throw new HttpError(400, 'this agent has no plugins folder');
      const dirs = w === 'project' ? dirFn(needRoot(root)) : dirFn(root!);
      let found = '';
      for (const baseDir of dirs) {
        const d = path.join(baseDir, n);
        if ((await statOf(d))?.isDirectory()) {
          found = d;
          break;
        }
      }
      if (!found) throw new HttpError(404, 'no such plugin');
      return { ok: true, ...(await takeOut(found, `${agent} plugin ${n}`, !!forever)) };
    }
    if (!a.memory) throw new HttpError(400, 'this agent keeps no memory files');
    const dir = a.memory(needRoot(root));
    if (kind === 'memories') {
      if (!(await statOf(dir))?.isDirectory()) throw new HttpError(404, 'no memory here');
      return { ok: true, ...(await takeOut(dir, `${agent} memory ${path.basename(root!)}`, !!forever)) };
    }
    if (kind !== 'memory') throw new HttpError(400, 'what to remove?');
    const n = nameOf(name), abs = path.join(dir, n);
    if (!/\.md$/i.test(n) || !(await statOf(abs))?.isFile()) throw new HttpError(404, 'no such memory');
    const out = await takeOut(abs, `${agent} memory ${n}`, !!forever);
    const index = path.join(dir, 'MEMORY.md');
    const text = await fsp.readFile(index, 'utf8').catch(() => null);
    if (text != null && n !== 'MEMORY.md') {
      const kept = text.split('\n').filter((l) => !l.includes(`](${n})`));
      await fsp.writeFile(index, kept.join('\n'));
    }
    return { ok: true, ...out };
  },
};

export { init, ROUTES };
