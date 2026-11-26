import fs from 'fs';
import path from 'path';
import { git } from './gitcli.ts';
import * as runs from './runs.ts';
import { WIN } from './util.ts';

const NAMES = new Set([
  'applypatch-msg', 'pre-applypatch', 'post-applypatch', 'pre-commit', 'pre-merge-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit',
  'pre-rebase', 'post-checkout', 'post-merge', 'pre-push', 'pre-receive', 'update', 'proc-receive', 'post-receive', 'post-update',
  'reference-transaction', 'push-to-checkout', 'pre-auto-gc', 'post-rewrite', 'sendemail-validate', 'fsmonitor-watchman', 'p4-changelist',
  'p4-prepare-changelist', 'p4-post-changelist', 'p4-pre-submit', 'post-index-change',
]);
const LFS_OPEN = 'command -v git-lfs >/dev/null 2>&1 || { printf >&2 "\\n%s\\n\\n" "';
const LFS_CLOSE = '"; exit 2; }';

function isLfs(name: string, text: string) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  if (lines[0] !== '#!/bin/sh' || lines[lines.length - 1] !== `git lfs ${name} "$@"`) return false;
  if (lines.length === 2) return true;
  const m = lines[1];
  return lines.length === 3 && m.startsWith(LFS_OPEN) && m.endsWith(LFS_CLOSE) && !/["$`\\]/.test(m.slice(LFS_OPEN.length, -LFS_CLOSE.length));
}

export async function hooksIn(cwd: string): Promise<string[]> {
  const r = await git(cwd, ['rev-parse', '--git-path', 'hooks'], { timeout: 15e3 });
  if (r.code) return [];
  const dir = path.resolve(cwd, r.out.trim());
  const names = await fs.promises.readdir(dir).catch(() => [] as string[]);
  const out: string[] = [];
  for (const n of names) {
    const name = WIN && /\.exe$/i.test(n) ? n.slice(0, -4) : n;
    if (!NAMES.has(name)) continue;
    const file = path.join(dir, n);
    const st = await fs.promises.stat(file).catch(() => null);
    if (!st?.isFile()) continue;
    const text = st.size < 4096 ? await fs.promises.readFile(file, 'utf8').catch(() => '') : '';
    if (!isLfs(n, text)) out.push(name);
  }
  return [...new Set(out)].sort();
}

const DOING: Record<string, string> = {
  '/api/git/commit': 'a commit',
  '/api/git/fetch': 'a fetch',
  '/api/git/pull': 'a pull',
  '/api/git/push': 'a push',
  '/api/git/sync': 'a sync',
  '/api/git/branch': 'a branch change',
  '/api/git/abort': 'an abort',
  '/api/git/skip': 'a skip',
  '/api/git/continue': 'a continue',
  '/api/git/tag': 'a tag',
  '/api/gh/pr': 'a push for a pull request',
  '/api/gh/pr/merge': 'a pull request merge',
  '/api/gh/release': 'a release push',
  '/api/gh/pr/checkout': 'a pull request checkout',
  '/api/gh/issue/start': 'a branch for an issue',
};

export async function hooksOk(key: string, body: Record<string, unknown> | null | undefined, cwd: string | null) {
  const doing = key.startsWith('POST ') ? DOING[key.slice(5)] : '';
  if (!doing || !cwd || runs.free(body)) return;
  const hooks = await hooksIn(cwd);
  if (!hooks.length) return;
  const list = hooks.length === 1 ? `a ${hooks[0]} hook` : `hooks (${hooks.join(', ')})`;
  await runs.mayRun(body, (who) => ({ title: `Allow ${doing} in ${path.basename(cwd)}?`, text: `${who} asks for it. The repo has ${list}, which git may run with it.`, warn: "This runs the repo's own code: its hooks." }));
}
