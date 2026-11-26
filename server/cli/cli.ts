import path from 'path';
import { acts, caller, Failed, run, where } from './call.ts';
import type { Act, Arg } from './call.ts';

const argv = process.argv.slice(2);
const out = (s: string) => process.stdout.write(s.endsWith('\n') ? s : s + '\n');
const fail = (s: string, code = 1) => {
  process.stderr.write(s.endsWith('\n') ? s : s + '\n');
  process.exitCode = code;
};

const usageOf = (a: Act) => `amethyst ${a.name}${a.args.filter((x) => x.pos).map((x) => ` ${x.required ? '<' : '['}${x.name}${x.rest || x.type === 'list' ? '…' : ''}${x.required ? '>' : ']'}`).join('')}${a.args.filter((x) => !x.pos).map((x) => ` [--${x.name}${x.type === 'boolean' ? '' : ` <${x.type === 'list' ? 'a,b' : x.type === 'object' ? 'json' : x.name}>`}]`).join('')}`;

function helpOf(list: Act[], feature?: string) {
  const mine = feature ? list.filter((a) => a.name.split(' ')[0] === feature) : list;
  if (feature && !mine.length) return null;
  const lines = feature
    ? mine.flatMap((a) => [usageOf(a), `    ${a.about}`, ...a.args.map((x) => `    ${x.pos ? x.name : '--' + x.name}: ${x.about}`), ...(a.example ? [`    e.g. ${a.example}`] : []), ''])
    : [
        'amethyst <feature> <action> [words] [--flags]',
        '',
        ...[...new Set(list.map((a) => a.name.split(' ')[0]))].map((f) => `  ${f}: ${list.filter((a) => a.name.startsWith(f + ' ')).map((a) => a.name.split(' ')[1]).join(', ')}`),
        '  mcp: run the MCP server (amethyst mcp), or show how to add it to an agent (amethyst mcp add)',
        '',
        'amethyst help <feature>   every action of a feature, with its words and flags',
        'Flags for every action: --json (the whole answer as JSON), --project <name> (instead of the folder you are in), --am <n> (which Amethyst window)',
      ];
  return lines.join('\n');
}

function valueOf(x: Arg, v: string) {
  if (x.type === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Failed(`--${x.name} takes a number`, 2);
    return n;
  }
  if (x.type === 'boolean') return !/^(false|no|off|0)$/i.test(v);
  if (x.type === 'list') return v.split(',').map((s) => s.trim()).filter(Boolean);
  if (x.type === 'object') {
    try {
      return JSON.parse(v);
    } catch {
      throw new Failed(`--${x.name} takes JSON, e.g. {"color":"Red"}`, 2);
    }
  }
  return v;
}

function parse(a: Act, words: string[]) {
  const args: Record<string, unknown> = {}, pos: string[] = [];
  const opts = { json: false, project: '', am: 0 };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === '--') {
      pos.push(...words.slice(i + 1));
      break;
    }
    const m = /^--(no-)?([\w-]+)(?:=(.*))?$/s.exec(w);
    if (!m) {
      pos.push(w);
      continue;
    }
    const [, no, name, eq] = m;
    if (name === 'json') {
      opts.json = true;
      continue;
    }
    if (name === 'project' || name === 'am') {
      const v = eq ?? words[++i];
      if (v == null) throw new Failed(`--${name} needs a value`, 2);
      if (name === 'project') opts.project = v;
      else opts.am = Number(v) || 0;
      continue;
    }
    const x = a.args.find((y) => y.name === name);
    if (!x) throw new Failed(`${a.name} has no --${name}\n${usageOf(a)}`, 2);
    if (x.type === 'boolean') args[name] = no ? false : eq == null ? true : valueOf(x, eq);
    else {
      const v = eq ?? words[++i];
      if (v == null) throw new Failed(`--${name} needs a value\n${usageOf(a)}`, 2);
      args[name] = x.type === 'list' && Array.isArray(args[name]) ? [...(args[name] as string[]), ...(valueOf(x, v) as string[])] : valueOf(x, v);
    }
  }
  const slots = a.args.filter((x) => x.pos);
  slots.forEach((x, i) => {
    if (i >= pos.length) return;
    const last = i === slots.length - 1;
    if (x.type === 'list') args[x.name] = pos.slice(i).flatMap((p) => valueOf(x, p) as string[]);
    else args[x.name] = last && x.rest ? pos.slice(i).join(' ') : valueOf(x, pos[i]);
  });
  if (pos.length > slots.length && !slots.some((x) => x.rest || x.type === 'list')) throw new Failed(`too many words\n${usageOf(a)}`, 2);
  for (const x of a.args) if (x.required && args[x.name] == null) throw new Failed(`${a.name} needs ${x.pos ? x.name : '--' + x.name}\n${usageOf(a)}`, 2);
  if (Array.isArray(args.attach)) args.attach = (args.attach as string[]).map((p) => path.resolve(p));
  return { args, opts };
}

function mcpAdd() {
  const win = process.platform === 'win32';
  return [
    'Claude Code:',
    `  claude mcp add amethyst -- ${win ? 'cmd /c ' : ''}amethyst mcp`,
    'Codex (~/.codex/config.toml):',
    `  [mcp_servers.amethyst]\n  command = "${win ? 'cmd' : 'amethyst'}"\n  args = [${win ? '"/c", "amethyst", ' : ''}"mcp"]`,
    'Other agents (JSON):',
    '  ' + JSON.stringify({ mcpServers: { amethyst: { command: win ? 'cmd' : 'amethyst', args: win ? ['/c', 'amethyst', 'mcp'] : ['mcp'] } } }),
    '',
    "The agent works on the project of the folder it runs in. Antigravity chats inside Amethyst get these tools on their own; other chats inside Amethyst use the amethyst command from their own terminal.",
  ].join('\n');
}

async function main() {
  const [feature, action, ...rest] = argv;
  if (feature === 'mcp' && !action) {
    await import('./mcp.ts');
    return;
  }
  if (feature === 'mcp' && action === 'add') return out(mcpAdd());
  if (!feature || feature === 'help' || feature === '--help' || feature === '-h') {
    const list = (await acts()).filter((x) => x.cli !== false);
    const h = helpOf(list, action);
    return h ? out(h) : fail(`no feature ${action}\n${helpOf(list)}`, 2);
  }
  const list = (await acts()).filter((x) => x.cli !== false);
  const a = list.find((x) => x.name === `${feature} ${action}`);
  if (!a) {
    const h = helpOf(list, feature);
    return fail(h ? `${feature} has no action ${action ?? ''}\n\n${h}` : `no feature ${feature}\n\n${helpOf(list)}`, 2);
  }
  if (rest.includes('--help') || rest.includes('-h')) return out(helpOf([a], feature)!);
  const { args, opts } = parse(a, rest);
  const at = await where(process.cwd(), opts.project || undefined);
  const r = await run(a, { ...args, ...caller(), cwd: process.cwd() }, at, opts.am || undefined);
  out(opts.json ? JSON.stringify(r, null, 2) : typeof r?.text === 'string' ? r.text : JSON.stringify(r, null, 2));
}

main().catch((e) => fail(e instanceof Failed ? e.message : String(e?.stack || e), e instanceof Failed ? e.code : 1));
