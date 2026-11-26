import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(here, 'desktop', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const args = process.argv.slice(2);
const release = args.includes('--release');
const argVersion = args.find((a) => a !== '--release');
if (release) {
  try {
    process.loadEnvFile(join(here, '.env'));
  } catch {}
  if (!process.env.GH_TOKEN) {
    console.error('npm run release needs GH_TOKEN in Amethyst/.env (.env.example says which token).');
    process.exit(1);
  }
}
const rl = createInterface({ input: stdin, output: stdout });
let version = argVersion;
while (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  if (version) console.log(`"${version}" is not X.Y.Z (three numbers, e.g. 0.0.1).`);
  version = (await rl.question(`Version (current ${pkg.version}, enter X.Y.Z): `)).trim();
}
rl.close();

if (version !== pkg.version) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`desktop/package.json → ${version}`);
}

const needed = ['@xterm/xterm/lib/xterm.mjs', '@xterm/addon-fit/lib/addon-fit.mjs', 'node-pty/prebuilds/win32-x64'];
if (needed.some((p) => !existsSync(join(here, 'node_modules', p)))) {
  console.error('The terminal files are missing from node_modules. Run "npm install" in Amethyst/ first.');
  process.exit(1);
}

console.log("Writing the open-source notices and the installer's license page...");
const noted = spawnSync(process.execPath, [join(here, 'notices.ts')], { cwd: here, stdio: 'inherit' });
if (noted.status !== 0) {
  console.error('The notices step failed (notices.ts), so no installer was made.');
  process.exit(1);
}

async function draftFirst() {
  const { owner, repo } = pkg.build.publish, tag = `v${version}`;
  const url = `https://api.github.com/repos/${owner}/${repo}/releases`;
  const headers = { authorization: `token ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'amethyst-release' };
  const stop = (why: string) => (console.error(why), process.exit(1));
  const list = await fetch(url, { headers });
  if (!list.ok) stop(`GitHub answered ${list.status} for ${owner}/${repo}: check GH_TOKEN.`);
  const same = ((await list.json()) as any[]).find((r) => r.tag_name === tag);
  if (same?.draft) return;
  if (same) stop(`${tag} is already published: use a higher version.`);
  const made = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ tag_name: tag, name: version, draft: true }) });
  if (!made.ok) stop(`GitHub answered ${made.status} when making the draft.`);
}
if (release) await draftFirst();

async function licenseAsset() {
  const { owner, repo } = pkg.build.publish, tag = `v${version}`;
  const headers = { authorization: `token ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'amethyst-release' };
  const list = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, { headers });
  const draft = list.ok ? ((await list.json()) as any[]).find((x) => x.tag_name === tag) : null;
  if (!draft) return console.error(`Could not find the ${tag} draft to add LICENSE.txt: upload public-repo/LICENSE to it as LICENSE.txt by hand.`), false;
  for (const old of draft.assets || []) if (old.name === 'LICENSE.txt') await fetch(old.url, { method: 'DELETE', headers });
  const body = readFileSync(join(here, 'public-repo', 'LICENSE'));
  const up = await fetch(`https://uploads.github.com/repos/${owner}/${repo}/releases/${draft.id}/assets?name=LICENSE.txt`, { method: 'POST', headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' }, body });
  if (!up.ok) return console.error(`GitHub answered ${up.status} when adding LICENSE.txt: upload public-repo/LICENSE to the draft as LICENSE.txt by hand.`), false;
  console.log('LICENSE.txt added to the draft: the app shows it before downloading this version.');
  return true;
}

console.log('Building installer...');
const r = spawnSync('npm', ['run', release ? 'release' : 'dist'], {
  cwd: join(here, 'desktop'),
  stdio: 'inherit',
  shell: true,
});
if (release && r.status === 0 && !(await licenseAsset())) process.exit(1);
process.exit(r.status ?? 1);
