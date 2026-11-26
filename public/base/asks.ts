import { diffCount } from './chattext.ts';

export interface Field {
  key: string;
  type?: string;
  choices: { const: unknown; title?: string; description?: string }[] | null;
  many: boolean;
  other: boolean;
  required: boolean;
  [k: string]: any;
}

const ASKS: Record<string, string> = { execute: 'Run this?', edit: 'Edit this?', delete: 'Delete this?', move: 'Move this?', fetch: 'Fetch this?', read: 'Read this?' };

export function askCard(ev: any, tool: any) {
  if (ev.form) return { id: ev.ask, form: { message: ev.form.message || '', schema: ev.form.schema || {} } };
  const tc = ev.toolCall || {}, d = { ...tool, ...tc };
  const what = d.rawInput?.command || d.title || 'The agent asks to go on';
  const why = d.rawInput?.description && d.rawInput.description !== what ? String(d.rawInput.description) : '';
  const files = (d.content || []).filter((c: any) => c?.type === 'diff' && c.path).map((c: any) => {
    const [add, del] = diffCount(c);
    return { path: c.path, add, del, fresh: !c.oldText };
  });
  const options = (ev.options || []).map(({ optionId, name, kind }: { optionId: string; name: string; kind?: string }) => ({ optionId, name, ...(kind ? { kind } : {}) }));
  return { id: ev.ask, q: ASKS[d.kind] || 'Allow this?', why, what: String(what), files, options };
}

const choicesOf = (f: any): { const: unknown; title?: string; description?: string }[] | null => (f.type === 'boolean' ? [{ const: true, title: 'yes' }, { const: false, title: 'no' }] : f.oneOf || f.items?.anyOf || (f.enum || f.items?.enum)?.map((v: unknown) => ({ const: v, title: String(v) })) || null);

export const fieldsOf = (schema: any): Field[] => Object.entries(schema?.properties || {}).map(([key, f]: [string, any]) => ({ key, ...f, choices: choicesOf(f), many: f.type === 'array', other: key.endsWith('_custom') && !!schema.properties[key.slice(0, -7)], required: !!schema.required?.includes(key) }));

export function answersOf(fields: Field[], valueOf: (f: Field) => any): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const f of fields) {
    const v = valueOf(f);
    if (f.choices) {
      const picked = (v || []).map((i: number) => f.choices![i]?.const);
      if (f.many ? picked.length : picked.length === 1) content[f.key] = f.many ? picked : picked[0];
    } else {
      const t = String(v || '').trim();
      if (t) content[f.key] = f.type === 'number' || f.type === 'integer' ? Number(t) : t;
    }
  }
  return content;
}

export const readyOf = (fields: Field[], got: Record<string, unknown>): boolean => fields.every((f) => f.other || f.key in got || f.key + '_custom' in got || !(f.required || fields.some((x) => x.key === f.key + '_custom')));
