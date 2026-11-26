import os from 'os';
import { HttpError } from './routes.ts';
import { git } from './gitcli.ts';

type Kind = 'chat' | 'issue' | 'pr' | 'new';
type Names = Record<Kind, string>;
type Vars = { chat?: string; n?: string | number; title?: string };

const KINDS: Kind[] = ['chat', 'issue', 'pr', 'new'];
const DEFAULTS: Names = { chat: 'chat/{chat}', issue: '{n}-{title}', pr: 'pr/{n}', new: '' };
const LABEL: Names = { chat: 'chat worktree', issue: 'issue', pr: 'pull request folder', new: 'new branch box' };
const MAY: Record<Kind, string[]> = { chat: ['chat', 'user'], issue: ['n', 'title', 'user'], pr: ['n', 'user'], new: ['user'] };
const NEED: Partial<Record<Kind, string>> = { issue: 'n', pr: 'n' };
const SAMPLE: Vars = { chat: 'q20', n: 12, title: 'fix-login' };

const slug = (s: string, max = 36) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '');
const chatSlug = (id: string) => String(id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'chat';

type Store = { get: (dir: string) => unknown; set: (dir: string, names: Partial<Names>) => Promise<unknown> };
let store: Store = {
  get: () => undefined,
  set: async () => {
    throw new HttpError(503, 'Branch names are not ready yet.');
  },
};
const setStore = (s: Store) => (store = s);

function cleanBranchNames(o: unknown): Partial<Names> {
  const out: Partial<Names> = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const k of KINDS) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim() && v.trim() !== DEFAULTS[k]) out[k] = v.trim().slice(0, 120);
  }
  return out;
}
const savedAt = (dir: string) => cleanBranchNames(store.get(dir));
const namesAt = (dir: string): Names => ({ ...DEFAULTS, ...savedAt(dir) });

async function userOf(cwd: string) {
  const r = await git(cwd, ['config', 'user.name']);
  let who = '';
  try {
    who = os.userInfo().username;
  } catch {}
  return slug(r.code ? '' : r.out.trim(), 24) || slug(who, 24) || 'me';
}

function fill(kind: Kind, pattern: string, vars: Vars & { user?: string }) {
  const out = pattern
    .replace(/\{(\w+)\}/g, (m, k: string) => (k === 'n' ? String(vars.n ?? '') : k === 'chat' || k === 'title' || k === 'user' ? String(vars[k] ?? '') : m))
    .replace(/\/{2,}/g, '/')
    .replace(/-{2,}/g, '-')
    .replace(/(^|\/)-+/g, '$1')
    .replace(/-+(\/|$)/g, '$1');
  return kind === 'new' ? out.replace(/^\/+/, '') : out.replace(/^\/+|\/+$/g, '');
}

async function fillAt(kind: Kind, pattern: string, cwd: string, vars: Vars) {
  const user = /\{user\}/.test(pattern) ? await userOf(cwd) : '';
  return fill(kind, pattern, { ...vars, user });
}

async function nameFor(kind: Kind, dir: string, vars: Vars = {}) {
  const v = { ...vars, ...(vars.chat != null ? { chat: chatSlug(vars.chat) } : {}), ...(vars.title != null ? { title: slug(vars.title) } : {}) };
  const made = await fillAt(kind, namesAt(dir)[kind], dir, v);
  return made || (kind === 'new' ? '' : fill(kind, DEFAULTS[kind], v));
}

async function whyNot(kind: Kind, pattern: string, cwd: string) {
  const used = [...pattern.matchAll(/\{(\w*)\}/g)].map((m) => m[1]);
  const odd = used.find((k) => !MAY[kind].includes(k));
  if (odd != null) return `{${odd}} can't be used here; it can have ${MAY[kind].map((k) => `{${k}}`).join(', ')}`;
  if (/[{}]/.test(pattern.replace(/\{\w+\}/g, ''))) return 'a { or } that is not part of a placeholder';
  const need = NEED[kind];
  if (need && !used.includes(need)) return `it needs {${need}}, or every one gets the same branch`;
  const made = await fillAt(kind, pattern, cwd, SAMPLE);
  if (!made) return kind === 'new' ? '' : 'it makes an empty name';
  const test = kind === 'new' ? made + 'x' : made;
  if (test.startsWith('-') || (await git(cwd, ['check-ref-format', '--branch', test])).code) return `git can't use “${made}” as a branch name`;
  return '';
}

async function examplesOf(names: Names, cwd: string) {
  const out = {} as Names;
  for (const k of KINDS) out[k] = await fillAt(k, names[k], cwd, SAMPLE);
  return out;
}

async function shown(dir: string) {
  const names = namesAt(dir), saved = savedAt(dir), examples = await examplesOf(names, dir);
  const text = KINDS.map((k) => `${k.padEnd(6)}${(names[k] || '(empty)').padEnd(28)}${examples[k] ? `e.g. ${examples[k]}` : ''}${saved[k] == null ? ' (default)' : ''}`).join('\n');
  return { names, saved, defaults: DEFAULTS, examples, text };
}

async function setNames(dir: string, body: Record<string, unknown>) {
  const now: Partial<Names> = body.reset ? {} : savedAt(dir);
  for (const k of KINDS) {
    if (body[k] == null) continue;
    const v = String(body[k]).trim();
    if (!v || v === DEFAULTS[k]) {
      delete now[k];
      continue;
    }
    const why = await whyNot(k, v, dir);
    if (why) throw new HttpError(400, `${LABEL[k]}: ${why}`);
    now[k] = v.slice(0, 120);
  }
  const changed = body.reset || KINDS.some((k) => body[k] != null);
  if (changed) await store.set(dir, now);
  return shown(dir);
}

export { DEFAULTS, KINDS, LABEL, cleanBranchNames, nameFor, setNames, setStore, shown, slug, chatSlug };
export type { Kind, Names };
