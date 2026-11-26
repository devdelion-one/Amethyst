import readline from 'readline';
import { acts, caller, Failed, run, where } from './call.ts';
import type { Act, Arg, Where } from './call.ts';

type Msg = { jsonrpc?: string; id?: number | string | null; method?: string; params?: any };

const VERSION = '1';
const send = (m: object) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
const log = (s: string) => process.stderr.write(`amethyst mcp: ${s}\n`);
const inChat = !!process.env.AMETHYST_CHAT;

let table: Act[] | null = null, here: Where | null | undefined;
async function tools() {
  if (!table) table = (await acts()).filter((a) => !a.cli);
  return table;
}
async function project() {
  if (inChat) return null;
  if (here === undefined) here = await where(process.cwd()).catch(() => null);
  return here;
}

const schemaOf = (x: Arg) => {
  const t = x.type === 'list' ? { type: 'array', items: { type: 'string' } } : x.type === 'object' ? { type: 'object' } : { type: x.type };
  return { ...t, description: x.about };
};
const named = (s: string) => [...(table || [])].sort((a, b) => b.name.length - a.name.length).reduce((t, a) => t.split(`amethyst ${a.name}`).join(a.tool), s);
const toolOf = (a: Act) => ({
  name: a.tool,
  description: named(a.about),
  inputSchema: { type: 'object', properties: Object.fromEntries(a.args.map((x) => [x.name, { ...schemaOf(x), description: named(x.about) }])), required: a.args.filter((x) => x.required).map((x) => x.name) },
});

async function call(name: string, args: Record<string, unknown>) {
  const a = (await tools()).find((x) => x.tool === name);
  if (!a) throw new Failed(`no tool ${name}`);
  const limit = ({ agent_run: 600, agent_send: 600, agent_wait: 600, chat_wait: 300 } as Record<string, number>)[name];
  if (limit && args.timeout == null) args.timeout = limit;
  for (const x of a.args) {
    if (x.type === 'list' && typeof args[x.name] === 'string') args[x.name] = String(args[x.name]).split(/[\s,]+/).filter(Boolean);
    if (x.type === 'object' && typeof args[x.name] === 'string') {
      try {
        args[x.name] = JSON.parse(String(args[x.name]));
      } catch {}
    }
  }
  const r = await run(a, { ...args, ...caller(), ...(inChat ? {} : { cwd: process.cwd() }) }, await project());
  return typeof r?.text === 'string' ? r.text : JSON.stringify(r, null, 2);
}

async function onMessage(m: Msg) {
  const reply = (result: object) => m.id != null && send({ id: m.id, result });
  const error = (code: number, message: string) => m.id != null && send({ id: m.id, error: { code, message } });
  try {
    if (m.method === 'initialize') return reply({ protocolVersion: m.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'amethyst', title: 'Amethyst', version: VERSION }, instructions: "Amethyst's tools: drive the other chats of this project (send them work, wait for them, read their answers, answer their questions, set their model and options), and debug the project's Unreal Editor or game with the user (debug_status, debug_breakpoints, debug_wait, debug_stack, debug_variables, debug_evaluate, debug_step, …). Chats are named by their code, like Q20." });
    if (m.method === 'ping') return reply({});
    if (m.method === 'tools/list') {
      try {
        return reply({ tools: (await tools()).map(toolOf) });
      } catch (e) {
        log(e instanceof Failed ? e.message : String(e));
        return reply({ tools: [] });
      }
    }
    if (m.method === 'tools/call') {
      try {
        return reply({ content: [{ type: 'text', text: named(await call(String(m.params?.name || ''), { ...(m.params?.arguments || {}) })) }] });
      } catch (e) {
        return reply({ content: [{ type: 'text', text: named(e instanceof Failed ? e.message : String(e)) }], isError: true });
      }
    }
    if (m.method?.startsWith('notifications/')) return;
    error(-32601, `${m.method} is not offered here`);
  } catch (e) {
    error(-32603, String(e));
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let m: Msg;
  try {
    m = JSON.parse(line);
  } catch {
    return send({ id: null, error: { code: -32700, message: 'not JSON' } });
  }
  onMessage(m);
}).on('close', () => process.exit(0));
