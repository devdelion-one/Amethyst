import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const here = (...p: string[]) => path.join(import.meta.dirname, ...p);
const DOCS = fs.existsSync(here('public-repo')) ? here('public-repo') : import.meta.dirname;
const LICENSE = path.join(DOCS, 'LICENSE');
const LICENSE_PAGE = here('desktop', 'build', 'license.txt');
const NOTICES = path.join(DOCS, 'THIRD-PARTY-NOTICES.txt');
const SHIPPED = ['@xterm/xterm', '@xterm/addon-fit', 'node-pty'];
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

async function vendored() {
  const esbuild = require('esbuild');
  const r = await esbuild.build({ metafile: true, write: false, logLevel: 'silent', entryPoints: [here('codemirror.ts')], bundle: true, format: 'esm' });
  const names = new Set<string>();
  for (const file of Object.keys(r.metafile.inputs)) {
    const m = file.replace(/\\/g, '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
    if (m) names.add(m[1]);
  }
  return names;
}

function desktopParts() {
  const lock = JSON.parse(fs.readFileSync(here('desktop', 'package-lock.json'), 'utf8'));
  const parts = new Map([['electron', here('desktop', 'node_modules', 'electron')]]);
  for (const [key, p] of (Object.entries(lock.packages) as [string, any][])) if (key && !p.dev) parts.set(key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length), here('desktop', key));
  return parts;
}

function entry(name: string, dir: string) {
  if (!fs.existsSync(dir)) throw new Error(`${path.relative(import.meta.dirname, dir)} is missing: run "npm install" in Amethyst/ and Amethyst/desktop/ first`);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = fs.readdirSync(dir).find((n) => /^(licen[cs]e|copying)/i.test(n));
  const head = `${name} ${pkg.version} (${pkg.license || 'license below'})`;
  if (file) return [head, fs.readFileSync(path.join(dir, file), 'utf8').trim()];
  if (pkg.license !== 'MIT') throw new Error(`${name} ships no license file: add its license text to the notices by hand before releasing`);
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  return [head, `No license file ships with this package; its package.json says MIT. The MIT License:\n\nCopyright (c) ${author || `the ${name} authors`}\n\n${MIT}`];
}

async function notices() {
  const parts = new Map<string, [string, string]>();
  for (const name of [...SHIPPED, ...(await vendored())]) parts.set(`${name}@root`, [name, here('node_modules', name)]);
  for (const [name, dir] of desktopParts()) parts.set(`${name}@${path.relative(import.meta.dirname, dir)}`, [name, dir]);
  const seen = new Set();
  const out = ['Amethyst includes the open-source software below. Each part is licensed under its own license, given here in full.', 'The installed app also holds Electron\'s Chromium notices in LICENSES.chromium.html next to Amethyst.exe.', ''];
  for (const [name, dir] of [...parts.values()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [head, text] = entry(name, dir);
    if (seen.has(head)) continue;
    seen.add(head);
    out.push('-'.repeat(72), head, '', text, '');
  }
  fs.writeFileSync(NOTICES, out.join('\n'));
  return seen.size;
}

function licensePage() {
  if (!fs.existsSync(LICENSE)) throw new Error('public-repo/LICENSE is missing: the installer shows it on its license page');
  const text = fs.readFileSync(LICENSE, 'utf8').replace(/^﻿/, '');
  if (/\[YOUR [A-Z ]+\]/.test(text)) throw new Error('public-repo/LICENSE still has a [YOUR ...] placeholder: fill it in before releasing');
  fs.mkdirSync(path.dirname(LICENSE_PAGE), { recursive: true });
  fs.writeFileSync(LICENSE_PAGE, '﻿' + text.replace(/\r?\n/g, '\r\n'));
}

async function main() {
  const n = await notices();
  licensePage();
  console.log(`public-repo/THIRD-PARTY-NOTICES.txt lists ${n} open-source packages; desktop/build/license.txt written from public-repo/LICENSE`);
}

if (path.resolve(process.argv[1] || '') === import.meta.filename) main().catch((e) => (console.error(e.message || e), process.exit(1)));
