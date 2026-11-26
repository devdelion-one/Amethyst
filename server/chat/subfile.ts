import fs from 'fs';
import path from 'path';
import { OUT_MAX } from '../../public/base/util.ts';
import type { AgentUpdate } from '../../public/base/types.ts';

type U = Record<string, any>;
export interface Tail {
  at: number;
  cwd: string;
  skip?: Set<string>;
}

const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined);
const HANDBACK = 'SubagentHandback';

export const sizeOf = (file: string) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};
export function json(file: string) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
export function linesFrom(file: string, from: number): { got: any[]; at: number } {
  let fd: number | null = null;
  try {
    const size = fs.statSync(file).size;
    if (size <= from) return { got: [], at: from };
    fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(size - from);
    const n = fs.readSync(fd, buf, 0, buf.length, from);
    const end = buf.subarray(0, n).lastIndexOf(10);
    if (end < 0) return { got: [], at: from };
    const got = buf.toString('utf8', 0, end).split('\n').flatMap((l) => {
      try {
        return l.trim() ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });
    return { got, at: from + end + 1 };
  } catch {
    return { got: [], at: from };
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}
export const outText = (c: unknown) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b: any) => (b?.type === 'text' ? b.text : '')).filter(Boolean).join('\n') : '');

function shown(p: string, cwd: string) {
  if (!cwd) return p;
  const rc = path.resolve(cwd), rf = path.resolve(p);
  return rf === rc || rf.startsWith(rc + path.sep) ? path.relative(rc, rf) : p;
}
function grepTitle(i: U) {
  const mode = typeof i.output_mode === 'string' ? i.output_mode : i['-l'] === true || i['-l'] === 'true' ? 'files_with_matches' : i['-c'] === true || i['-c'] === 'true' ? 'count' : '';
  const at = typeof i.path === 'string' ? i.path : typeof i.file_path === 'string' ? i.file_path : '';
  return ['grep', i['-i'] && '-i', i['-n'] && '-n', i['-A'] !== undefined && `-A ${i['-A']}`, i['-B'] !== undefined && `-B ${i['-B']}`, i['-C'] !== undefined && `-C ${i['-C']}`, mode === 'files_with_matches' ? '-l' : mode === 'count' ? '-c' : '', i.head_limit !== undefined && `| head -${i.head_limit}`, i.glob && `--include="${i.glob}"`, i.type && `--type=${i.type}`, i.multiline && '-P', i.pattern && `"${i.pattern}"`, at].filter(Boolean).join(' ');
}
export function toolInfo(name: string, i: U, cwd: string): { kind: string; title: string } {
  const file = typeof i.file_path === 'string' && i.file_path ? shown(i.file_path, cwd) : '';
  if (name === 'Read') {
    const from = i.offset ?? 1, part = i.limit > 0 ? ` (${from} - ${from + i.limit - 1})` : i.offset ? ` (from line ${i.offset})` : '';
    return { kind: 'read', title: `Read ${file || 'File'}${part}` };
  }
  if (name === 'Write') return { kind: 'edit', title: file ? `Write ${file}` : 'Preparing file…' };
  if (name === 'Edit') return { kind: 'edit', title: file ? `Edit ${file}` : 'Edit' };
  if (name === 'Bash' || name === 'PowerShell') return { kind: 'execute', title: str(i.command) || 'Terminal' };
  if (name === 'Glob') return { kind: 'search', title: ['Find', i.path && `\`${i.path}\``, i.pattern && `\`${i.pattern}\``].filter(Boolean).join(' ') };
  if (name === 'Grep') return { kind: 'search', title: grepTitle(i) };
  if (name === 'WebFetch') return { kind: 'fetch', title: i.url ? `Fetch ${i.url}${i.offset ? ` (from char ${i.offset})` : ''}` : 'Fetch' };
  if (name === 'WebSearch') return { kind: 'fetch', title: i.query ? `Search "${i.query}"` : 'Web search' };
  if (name === 'Agent' || name === 'Task') return { kind: 'think', title: str(i.description) || 'Task' };
  if (name === 'Skill') return { kind: 'other', title: i.skill ? `Load skill: ${i.skill}` : 'Load skill' };
  return { kind: 'other', title: name || 'Unknown Tool' };
}

export function fileSteps(file: string, t: Tail, meta: () => Record<string, unknown>): AgentUpdate[] {
  const { got, at } = linesFrom(file, t.at), out: AgentUpdate[] = [];
  t.at = at;
  for (const j of got) {
    if (j?.type !== 'assistant' && j?.type !== 'user') continue;
    if (typeof j.cwd === 'string') t.cwd = j.cwd;
    for (const b of Array.isArray(j.message?.content) ? j.message.content : []) {
      if (b?.type === 'tool_use' && b.id && b.name === HANDBACK) (t.skip ||= new Set()).add(b.id);
      else if (b?.type === 'tool_use' && b.id) out.push({ sessionUpdate: 'tool_call', toolCallId: b.id, ...toolInfo(String(b.name || ''), b.input || {}, t.cwd), status: 'in_progress', rawInput: b.input || {}, _meta: meta() });
      else if (b?.type === 'tool_result' && b.tool_use_id && !t.skip?.has(b.tool_use_id)) {
        const text = outText(b.content);
        out.push({ sessionUpdate: 'tool_call_update', toolCallId: b.tool_use_id, status: b.is_error ? 'failed' : 'completed', ...(text ? { content: [{ type: 'content', content: { type: 'text', text: text.slice(0, OUT_MAX) } }] } : {}), _meta: meta() });
      }
    }
  }
  return out;
}

export function reportOf(file: string) {
  const { got } = linesFrom(file, 0);
  let said = '';
  for (let i = got.length - 1; i >= 0; i--) {
    const j = got[i];
    if (j?.type !== 'assistant') continue;
    for (const b of Array.isArray(j.message?.content) ? [...j.message.content].reverse() : []) {
      if (b?.type === 'tool_use' && b.name === HANDBACK && typeof b.input?.message === 'string') return b.input.message;
      if (!said && b?.type === 'text' && b.text?.trim()) said = b.text.trim();
    }
  }
  return said;
}
