import fs from 'fs';
import path from 'path';
import type { Place } from './gitcli.ts';

export type Guards = { pairs: [string, string][]; env: Record<string, string>; noExt: boolean; packs: string[]; keys: string[]; fetchKeys: string[] };
type Entry = { scope: string; origin: string; key: string; value: string };

const NONE: Guards = { pairs: [], env: {}, noExt: false, packs: [], keys: [], fetchKeys: [] };
const LFS: Record<string, string> = { clean: 'git-lfs clean -- %f', smudge: 'git-lfs smudge -- %f', process: 'git-lfs filter-process' };
const NAMES: Record<string, string> = { 'core.sshcommand': 'core.sshCommand', 'core.askpass': 'core.askPass', 'core.gitproxy': 'core.gitProxy', 'diff.external': 'diff.external', 'sequence.editor': 'sequence.editor' };
const GPG: Record<string, string> = { 'gpg.program': 'gpg', 'gpg.openpgp.program': 'gpg', 'gpg.x509.program': 'gpgsm', 'gpg.ssh.program': 'ssh-keygen', 'gpg.ssh.defaultkeycommand': '' };
const PLAIN: Record<string, string> = { 'core.sshcommand': 'ssh', 'core.askpass': '', 'core.editor': 'true', 'sequence.editor': 'true', 'core.pager': 'cat', ...GPG };
const TRUE = /^(true|yes|on|1)$/i;

function parse(listing: string): Entry[] {
  const parts = listing.split('\0'), list: Entry[] = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const nl = parts[i + 2].indexOf('\n');
    list.push({ scope: parts[i], origin: parts[i + 1], key: nl < 0 ? parts[i + 2] : parts[i + 2].slice(0, nl), value: nl < 0 ? '' : parts[i + 2].slice(nl + 1) });
  }
  return list;
}

const shown = (key: string) => NAMES[key] || key;

function guardsOf(listing: string): Guards {
  const all = parse(listing);
  const repo = all.filter((e) => e.scope === 'local' || e.scope === 'worktree');
  if (!repo.length) return NONE;
  const user = all.filter((e) => e.scope === 'system' || e.scope === 'global');
  const userLast = (key: string) => user.filter((e) => e.key === key).at(-1)?.value;
  const pairs: [string, string][] = [], env: Record<string, string> = {}, keys = new Set<string>(), fetchKeys = new Set<string>();
  const set = (key: string, value: string) => {
    if (!pairs.some(([k]) => k === key)) pairs.push([key, value]);
  };
  const packs = new Set<string>();
  let noExt = false, helpers = false, protocol = false;
  for (const { key, value } of repo) {
    const m = /^([^.]+)\.(?:(.*)\.)?([^.]+)$/.exec(key);
    if (!m) continue;
    const [, section, sub, name] = m;
    if (key === 'core.fsmonitor') {
      if (!TRUE.test(value) && !/^(false|no|off|0|)$/i.test(value)) set(key, 'false'), keys.add(key);
    } else if (key in PLAIN) {
      set(key, userLast(key) ?? PLAIN[key]);
      keys.add(key);
      if (key === 'core.sshcommand' || key === 'core.askpass') fetchKeys.add(key);
    } else if (section === 'gpg' && name === 'program') {
      set(key, userLast(key) ?? 'gpg');
      keys.add(key);
    } else if (section === 'credential' && name === 'helper') {
      if (!value) continue;
      helpers = true;
      keys.add('credential.helper');
      fetchKeys.add('credential.helper');
    } else if (section === 'filter' && sub && (name === 'clean' || name === 'smudge' || name === 'process')) {
      if (value === LFS[name]) continue;
      set(key, userLast(key) ?? '');
      if (userLast(key) === undefined) set(`filter.${sub}.required`, 'false');
      keys.add(key);
    } else if (section === 'merge' && sub && name === 'driver') {
      set(key, userLast(key) ?? '');
      keys.add(key);
    } else if (section === 'remote' && sub && (name === 'uploadpack' || name === 'receivepack')) {
      packs.add(name);
      keys.add(key);
      fetchKeys.add(key);
    } else if (key === 'core.gitproxy') {
      if (process.env.GIT_PROXY_COMMAND === undefined) env.GIT_PROXY_COMMAND = '';
      keys.add(key);
      fetchKeys.add(key);
    } else if (section === 'protocol' && name === 'allow') {
      protocol = true;
    } else if (section === 'submodule' && sub && name === 'update' && value.startsWith('!')) {
      set(key, 'checkout');
      keys.add(key);
    } else if (key === 'diff.external' || (section === 'diff' && sub && (name === 'textconv' || name === 'command'))) {
      noExt = true;
      keys.add(key);
    }
  }
  if (helpers) {
    const reset = new Set(['credential.helper', ...repo.filter((e) => /^credential\..*\.helper$/.test(e.key)).map((e) => e.key)]);
    for (const key of reset) pairs.push([key, '']);
    for (const e of user) if (/^credential\.(.*\.)?helper$/.test(e.key)) pairs.push([e.key, e.value]);
  }
  if (protocol) set('protocol.ext.allow', userLast('protocol.ext.allow') ?? 'never');
  if (!pairs.length && !noExt && !packs.size && !Object.keys(env).length) return NONE;
  return { pairs, env, noExt, packs: [...packs], keys: [...keys].map(shown), fetchKeys: [...fetchKeys].map(shown) };
}

const NO_EXT = new Set(['diff', 'show', 'log', 'blame']);
const PACK: Record<string, [string, string]> = { fetch: ['uploadpack', '--upload-pack=git-upload-pack'], pull: ['uploadpack', '--upload-pack=git-upload-pack'], 'ls-remote': ['uploadpack', '--upload-pack=git-upload-pack'], push: ['receivepack', '--receive-pack=git-receive-pack'] };
function withFlags(g: Guards, args: string[]) {
  if (g.noExt && NO_EXT.has(args[0])) return [args[0], '--no-ext-diff', '--no-textconv', ...args.slice(1)];
  const pack = PACK[args[0]];
  if (pack && g.packs.includes(pack[0])) return [args[0], pack[1], ...args.slice(1)];
  return args;
}
const runsGit = (args: string[]) => args.includes('--push') || args.includes('--checkout') || (args[0] === 'pr' && args[1] === 'checkout') || (args[0] === 'repo' && args[1] === 'sync');

const stat = (f: string) => {
  try {
    const s = fs.statSync(f);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return '-';
  }
};
const stampOf = (files: string[]) => files.map(stat).join('|');
const filesOf = (place: Place, listing = '') => {
  const files = new Set([path.join(place.common, 'config'), path.join(place.dir, 'config.worktree'), path.join(place.dir, 'HEAD')]);
  for (const e of parse(listing)) if ((e.scope === 'local' || e.scope === 'worktree') && e.origin.startsWith('file:')) files.add(path.resolve(e.origin.slice(5)));
  return [...files];
};

const cache = new Map<string, { files: string[]; stamp: string; guards: Guards }>();
async function cachedGuards(place: Place, read: () => Promise<string | null>): Promise<Guards> {
  const had = cache.get(place.dir);
  if (had && stampOf(had.files) === had.stamp) return had.guards;
  const listing = await read();
  if (listing === null) return NONE;
  const files = filesOf(place, listing), guards = guardsOf(listing);
  cache.set(place.dir, { files, stamp: stampOf(files), guards });
  return guards;
}

export { NONE, guardsOf, withFlags, runsGit, cachedGuards };
