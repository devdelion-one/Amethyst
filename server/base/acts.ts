export type ArgType = 'string' | 'number' | 'boolean' | 'list' | 'object';

export interface Arg {
  name: string;
  type: ArgType;
  about: string;
  required?: boolean;
  pos?: boolean;
  rest?: boolean;
}

export interface Act {
  name: string;
  tool: string;
  about: string;
  args: Arg[];
  route: string;
  example?: string;
  cli?: boolean;
  need?: string;
}

const NAME = /^[a-z][a-z-]* [a-z][a-z-]*$/, TOOL = /^[a-z][a-z_]{1,63}$/, ROUTE = /^(GET|POST|PUT|DELETE) \/api\/\S+$/;

export function checkActs(acts: Act[]): string[] {
  const out: string[] = [], names = new Set<string>(), tools = new Set<string>();
  for (const a of acts) {
    if (!NAME.test(a.name)) out.push(`action "${a.name}": a name is two words, "<feature> <action>"`);
    if (!TOOL.test(a.tool)) out.push(`action "${a.name}": its tool name "${a.tool}" is lower case with _`);
    if (!ROUTE.test(a.route)) out.push(`action "${a.name}": its route "${a.route}" is "<METHOD> /api/…"`);
    if (names.has(a.name)) out.push(`action "${a.name}" is named twice`);
    if (tools.has(a.tool)) out.push(`tool "${a.tool}" is named twice`);
    if (!a.about.trim()) out.push(`action "${a.name}" says nothing about itself`);
    const rest = a.args.findIndex((x) => x.rest || (x.pos && x.type === 'list'));
    if (rest >= 0 && a.args.slice(rest + 1).some((x) => x.pos)) out.push(`action "${a.name}": only the last word takes the rest`);
    if (a.args.some((x) => x.name === 'by' || x.name === 'key')) out.push(`action "${a.name}": by and key name the caller, not an argument`);
    names.add(a.name);
    tools.add(a.tool);
  }
  return out;
}
