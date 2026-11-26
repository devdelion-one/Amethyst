import fs from 'fs';
import path from 'path';
import { createRequire, stripTypeScriptTypes } from 'module';
import type { Diagnostic } from 'typescript';

const here = (f: string) => path.join(import.meta.dirname, f);
const problems: string[] = [];

const CODE = /\.(ts|js)$/;
const tsIn = (dir: string): string[] => fs.readdirSync(here(dir), { withFileTypes: true }).flatMap((d) => {
  const f = `${dir}/${d.name}`;
  if (d.isDirectory()) return d.name === 'vendor' ? [] : tsIn(f);
  return d.name.endsWith('.ts') ? [f] : [];
});
const modules = tsIn('public').map((f) => f.slice('public/'.length));
const serverFiles = fs.existsSync(here('server')) ? tsIn('server') : [];
const rootCode = (dir: string) => fs.readdirSync(here(dir || '.')).filter((f) => CODE.test(f)).map((f) => (dir ? `${dir}/${f}` : f));
const files = [...rootCode(''), ...serverFiles, ...rootCode('desktop'), ...modules.map((f) => 'public/' + f)];

const ts = fs.existsSync(here('node_modules/typescript')) ? createRequire(import.meta.url)('typescript') : null;
const rel = (abs: string) => path.relative(import.meta.dirname, abs).split(path.sep).join('/');
const say = (d: Diagnostic) => ts.flattenDiagnosticMessageText(d.messageText, '\n');
const where = (d: Diagnostic) => {
  if (!d.file) return say(d);
  const { line } = d.file.getLineAndCharacterOfPosition(d.start || 0);
  return `${rel(d.file.fileName)}:${line + 1} ${say(d)}`;
};
const seen = new Set(), checked = new Set();
const add = (msg: string) => {
  if (seen.has(msg)) return;
  seen.add(msg);
  problems.push(msg);
};
for (const f of files) {
  try {
    stripTypeScriptTypes(fs.readFileSync(here(f), 'utf8'));
    if (!ts) checked.add(f);
  } catch (e) {
    problems.push(`${f} does not parse: ${(e as Error).message}`);
  }
}
for (const config of ts ? ['tsconfig.json', 'public/tsconfig.json', 'test/tsconfig.json'] : []) {
  const parsed = ts.getParsedCommandLineOfConfigFile(here(config), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d: Diagnostic) => add(`${config}: ${say(d)}`) });
  if (!parsed) continue;
  for (const d of parsed.errors) add(`${config}: ${where(d)}`);
  const isJs = (f: string) => f.endsWith('.js');
  const runs: [string[], object][] = [
    [parsed.fileNames.filter((f: string) => !isJs(f)), parsed.options],
    [parsed.fileNames.filter(isJs), { ...parsed.options, strict: false }],
  ];
  for (const [rootNames, options] of runs) {
    if (!rootNames.length) continue;
    const program = ts.createProgram({ rootNames, options });
    for (const d of [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()]) add(`${config}: ${where(d)}`);
    for (const sf of program.getSourceFiles()) {
      const f = rel(sf.fileName);
      if (f.startsWith('..') || f.split('/').includes('node_modules')) continue;
      if (options !== parsed.options && !isJs(f)) continue;
      checked.add(f);
      for (const d of program.getSyntacticDiagnostics(sf)) add(`${where(d)} (does not parse)`);
      for (const d of program.getSemanticDiagnostics(sf)) add(where(d));
    }
  }
}
for (const f of files) if (!checked.has(f)) problems.push(`${f} is in no tsconfig.json, so the compiler does not check it`);

const nameOf = (f: string) => path.posix.basename(f);
const byName = new Map();
for (const f of modules) {
  if (byName.has(nameOf(f))) problems.push(`public/${f} and public/${byName.get(nameOf(f))} have the same name: each browser module's name is unique`);
  else byName.set(nameOf(f), f);
}
const resolve = (from: string, spec: string) => (spec.startsWith('/') ? spec.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
const IMPORT_FROM = /^import\s*(?:\{([^}]*)\}|\*\s*as\s+[\w$]+)?\s*(?:from\s*)?'((?:\.\.?)?\/[^']+\.ts)'/gm;
const DYNAMIC = /import\(\s*'((?:\.\.?)?\/[^']+\.ts)'\s*\)/g;
const srcOf = new Map<string, string>(modules.map((f) => [f, fs.readFileSync(here('public/' + f), 'utf8')] as [string, string]));
const exportsOf = new Map();
for (const f of modules) {
  const src = srcOf.get(f)!, names = new Set();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) names.add(part.trim().split(/\s+as\s+/).pop());
  exportsOf.set(f, names);
}
let imports = 0;
const deps = new Map(), lazy = new Map();
for (const f of modules) {
  const src = srcOf.get(f)!, mine = new Set(), later = new Set();
  for (const [, list, spec] of src.matchAll(IMPORT_FROM)) {
    const to = resolve(f, spec), names = exportsOf.get(to);
    if (!names) {
      problems.push(`public/${f} imports ${spec}, which is not there`);
      continue;
    }
    mine.add(to);
    for (const name of (list || '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s) => s && !/^type\s/.test(s))) {
      imports++;
      if (!names.has(name)) problems.push(`public/${f} imports ${name} from ${spec}, which does not export it`);
    }
  }
  for (const [, spec] of src.matchAll(DYNAMIC)) {
    const to = resolve(f, spec);
    if (!exportsOf.has(to)) problems.push(`public/${f} imports ${spec} when it runs, which is not there`);
    else later.add(to);
  }
  for (const [, spec] of src.matchAll(/new\s+(?:Shared)?Worker\(\s*'([^']+)'/g)) if (!srcOf.has(resolve(f, spec))) problems.push(`public/${f} starts the worker ${spec}, which is not there`);
  deps.set(f, [...mine]);
  lazy.set(f, [...later]);
}

const loops = new Set(), state = new Map(), stack: string[] = [];
const visit = (f: string) => {
  state.set(f, 'open');
  stack.push(f);
  for (const d of deps.get(f)) {
    if (state.get(d) === 'open') loops.add([...stack.slice(stack.indexOf(d)), d].join(' → '));
    else if (!state.has(d)) visit(d);
  }
  stack.pop();
  state.set(f, 'done');
};
for (const f of modules) if (!state.has(f)) visit(f);
for (const loop of loops) problems.push(`public/ imports in a loop: ${loop}`);

const OWNERS = {
  'levels.ts': ['wid', 'pid', 'wsEditor', 'switching', 'ws', 'projects'],
  'model.ts': ['workspaces', 'wsNewSuggest', 'wsSuggest', 'data', 'roots', 'inbox', 'thoughts', 'dirs', 'cut', 'hidden'],
  'actions.ts': ['pins', 'marks', 'side', 'sideView', 'ctx', 'solo'],
  'controls.ts': ['collapsed', 'expanded', 'picked', 'marked'],
  'editor.ts': ['open', 'boardWide', 'saving', 'saveTimer'],
  'float.ts': ['pages'],
  'modes.ts': ['settingsOpen'],
  'views.ts': ['archive', 'query', 'hits'],
  'dnd.ts': ['dragging'],
};
const ownerOf = new Map(Object.entries(OWNERS).flatMap(([f, keys]) => keys.map((k) => [k, f])));
const modelAt = byName.get('model.ts');
const model = srcOf.get(modelAt)!;
const sAt = model.search(/^export const S\b[^=]*= \{/m);
const fields = new Set([...model.slice(sAt, model.indexOf('\n};', sAt)).matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
for (const k of fields) if (!ownerOf.has(k)) problems.push(`S.${k} has no owner: add it to OWNERS in check.ts`);
for (const k of ownerOf.keys()) if (!fields.has(k)) problems.push(`OWNERS in check.ts names S.${k}, which public/${modelAt}'s S doesn't have`);
const LOADS = ['pid', 'wid', 'ws', 'projects', 'wsEditor', 'pins', 'marks', 'ctx', 'solo'];
for (const k of LOADS) if (!fields.has(k)) problems.push(`LOADS in check.ts names S.${k}, which public/${modelAt}'s S doesn't have`);
const INTO = String.raw`(?:!|\??\.\w+|\[[^\]]*\])`;
const S_CHANGES = [
  new RegExp(String.raw`(?<![\w$.])S\.(\w+)${INTO}*\s*(?:[-+*/%&|^]|&&|\|\||\?\?)?=(?![=>])`, 'g'),
  new RegExp(String.raw`(?<![\w$.])S\.(\w+)${INTO}*\s*(?:\+\+|--)`, 'g'),
  new RegExp(String.raw`(?:\+\+|--|\bdelete\s+)S\.(\w+)`, 'g'),
  new RegExp(String.raw`(?<![\w$.])S\.(\w+)${INTO}*?\??\.(?:push|pop|shift|unshift|splice|sort|reverse|fill|set|add|delete|clear)\(`, 'g'),
];
for (const f of modules) {
  const src = srcOf.get(f)!;
  if (f !== modelAt && ![...src.matchAll(IMPORT_FROM)].some(([, list, spec]) => /\bS\b/.test(list || '') && resolve(f, spec) === modelAt)) continue;
  const mine = (k: string) => ownerOf.get(k) === nameOf(f) || (f === modelAt && LOADS.includes(k));
  src.split('\n').forEach((line, i) => {
    const code = line.replace(/(^|\s)\/\/.*$/, '');
    const seen = new Set<string>();
    for (const re of S_CHANGES) for (const [, k] of code.matchAll(re)) if (!mine(k) && !seen.has(k)) {
      seen.add(k);
      problems.push(`public/${f}:${i + 1} changes S.${k}, which ${ownerOf.get(k) || 'no module'} owns`);
    }
  });
}

const MOUNTS = ['actions', 'dnd', 'float', 'groups', 'header', 'keys', 'levels', 'main', 'modes', 'panel', 'setchat', 'setheads', 'setlist', 'setdock', 'setedit', 'setfiles', 'setpages', 'settings', 'settop', 'tabs', 'treemenu', 'views'].map((m) => `app/${m}.ts`);
const EXCEPTIONS: string[] = [];
const folderOf = (f: string) => (f.includes('/') ? f.split('/')[0] : '');
const rule = (from: string, to: string) => {
  const a = folderOf(from), b = folderOf(to);
  if (a === b) return '';
  if (a === 'base') return 'base imports only base';
  if (b === 'base') return '';
  if (a === 'app') return MOUNTS.includes(from) ? '' : `app imports a feature only in the modules that open features (MOUNTS in check.ts)`;
  if (b === 'app') return '';
  return 'a feature imports only its own folder, base and app';
};
const broken = new Set();
for (const f of modules) {
  if (!folderOf(f)) problems.push(`public/${f} is in no folder: each browser module lives in base, app or a feature's folder`);
  for (const to of [...deps.get(f), ...lazy.get(f)]) {
    const why = rule(f, to);
    if (!why) continue;
    const pair = `${f} → ${to}`;
    broken.add(pair);
    if (!EXCEPTIONS.includes(pair)) problems.push(`public/${f} imports public/${to}: ${why}`);
  }
}
for (const pair of EXCEPTIONS) if (!broken.has(pair)) problems.push(`EXCEPTIONS in check.ts lists ${pair}, which the code no longer needs: take it out`);
for (const f of MOUNTS) if (!modules.includes(f) || folderOf(f) !== 'app') problems.push(`MOUNTS in check.ts lists ${f}, which is not a module in public/app/`);

for (const page of fs.readdirSync(here('public')).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(here('public/' + page), 'utf8');
  for (const [, src] of html.matchAll(/(?:src|href)="\.?\/?([^":#?]+\.(?:ts|js|css|svg|png|ico))"/g)) {
    if (!fs.existsSync(here('public/' + src))) problems.push(`${page} points at public/${src}, which is not there`);
  }
  for (const [, src] of html.matchAll(/(?:import\(\s*|from\s*)'\/([^']+\.ts)'/g)) {
    if (!srcOf.has(src)) problems.push(`${page} imports /${src}, which is not there`);
  }
}
for (const f of files.filter((f) => !f.startsWith('public/'))) {
  for (const [, spec] of fs.readFileSync(here(f), 'utf8').matchAll(/(?:require\(|from\s+|import\()'\.\/public\/([^']+)'/g)) {
    if (!srcOf.has(spec)) problems.push(`${f} requires ./public/${spec}, which is not there`);
  }
}

const OLD_NAME = /projectm[i]nd/i;
const KEEP_OLD_NAME: Record<string, number> = { 'server.ts': 1, 'desktop/main.ts': 1 };
const ownText = ['package.json', 'desktop/package.json', ...files, ...fs.readdirSync(here('public')).filter((f) => /\.(html|css|svg)$/.test(f)).map((f) => 'public/' + f), ...(fs.existsSync(here('test')) ? fs.readdirSync(here('test')).map((f) => 'test/' + f) : [])];
for (const f of ownText) {
  const lines = fs.readFileSync(here(f), 'utf8').split('\n').filter((l) => OLD_NAME.test(l)).length;
  if (lines !== (KEEP_OLD_NAME[f] || 0)) problems.push(`${f} names the app by its old name on ${lines} line(s), ${KEEP_OLD_NAME[f] || 0} expected: the app is Amethyst now`);
}

const docWords = (f: string) => (fs.readFileSync(here(f), 'utf8').split(/<div class="fine"|<p>Data controller: |\n(?=Copyright|Data controller: )/)[0].replace(/<[^>]+>/g, ' ').replace(/\]\([^)]*\)/g, ' ').replace(/&amp;/g, '&').replace(/https:\/\//g, '').toLowerCase().match(/[a-z0-9]+/g) || []).join(' ');
const docsDir = fs.existsSync(here('public-repo')) ? 'public-repo/' : '';
for (const [src, out, from] of [[docsDir + 'LICENSE', 'public/license.html', 'amethyst is source available'], [docsDir + 'PRIVACY.md', 'public/privacy.html', 'this notice covers']]) {
  const a = docWords(src), b = docWords(out);
  if (!a.includes(from) || b.slice(b.indexOf(from)) !== a.slice(a.indexOf(from))) problems.push(`${out} does not match ${src}: run node doc-pages.ts`);
}

const packList = JSON.parse(fs.readFileSync(here('desktop/package.json'), 'utf8')).build.extraResources[0].filter;
const isPacked = (f: string) => packList.includes(f) || packList.some((g: string) => g.endsWith('/**/*') && f.startsWith(g.slice(0, -4)));
for (const f of [...rootCode(''), ...serverFiles].filter(isPacked)) {
  const src = fs.readFileSync(here(f), 'utf8');
  for (const [, spec] of src.matchAll(/(?:require\(|from\s+|import\()'(\.{1,2}\/[^']+\.[jt]s)'/g)) {
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (!isPacked(to)) problems.push(`${f} requires ${to}, which desktop/package.json does not pack into the installer`);
  }
  for (const [, name] of src.matchAll(/path\.join\(import.meta.dirname, '([\w-]+\.[jt]s)'\)/g)) {
    const to = path.posix.join(path.posix.dirname(f), name);
    if (!isPacked(to)) problems.push(`${f} runs ${to} by its path, which desktop/package.json does not pack into the installer`);
  }
}

const deskList: string[] = JSON.parse(fs.readFileSync(here('desktop/package.json'), 'utf8')).build.files;
for (const f of deskList.filter((g) => /\.[jt]s$/.test(g))) {
  for (const [, spec] of fs.readFileSync(here('desktop/' + f), 'utf8').matchAll(/(?:require\(|from\s+|import\()'\.\/([^']+\.[jt]s)'/g)) {
    if (!deskList.includes(spec)) problems.push(`desktop/${f} imports ${spec}, which desktop/package.json "files" does not pack into the installer`);
  }
}

const SERVER_EXCEPTIONS: string[] = [];
const serverBroken = new Set();
for (const f of serverFiles) {
  const a = f.split('/')[1];
  for (const [, spec] of fs.readFileSync(here(f), 'utf8').matchAll(/(?:require\(|from\s+|import\()'(\.{1,2}\/[^']+\.[jt]s)'/g)) {
    const to = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
    if (!/^(server|public)\//.test(to)) problems.push(`${f} requires ${to}, outside server/ and public/: only server.ts at the root runs the parts`);
    const b = to.split('/')[1];
    const why = a === b || b === 'base' ? '' : a === 'base' ? 'base requires only base' : 'a feature requires only its own folder and base';
    if (!why) continue;
    const pair = `${f} → ${to}`;
    serverBroken.add(pair);
    if (!SERVER_EXCEPTIONS.includes(pair)) problems.push(`${f} requires ${to}: ${why}`);
  }
}
for (const pair of SERVER_EXCEPTIONS) if (!serverBroken.has(pair)) problems.push(`SERVER_EXCEPTIONS in check.ts lists ${pair}, which the code no longer needs: take it out`);

const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
function jsComments(src: string, from = 0, to = src.length) {
  const out: number[] = [], braces: number[] = [];
  let i = from, regexOk = true;
  const isId = (c: string) => /[\w$]/.test(c);
  while (i < to) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && (n === '/' || n === '*')) {
      const e = n === '/' ? src.indexOf('\n', i) : src.indexOf('*/', i + 2);
      const end = e === -1 || e > to ? to : n === '/' ? e : e + 2;
      out.push(i);
      i = end;
    } else if (c === '\'' || c === '"') {
      i++;
      while (i < to && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      regexOk = false;
    } else if (c === '`' || (c === '}' && braces.at(-1) === 0)) {
      if (c === '}') braces.pop();
      i++;
      while (i < to && src[i] !== '`') {
        if (src[i] === '\\') i += 2;
        else if (src[i] === '$' && src[i + 1] === '{') { braces.push(0); i += 2; break; }
        else i++;
      }
      if (src[i] === '`') { i++; regexOk = false; }
      else regexOk = true;
    } else if (c === '/' && regexOk) {
      let cls = false;
      for (i++; i < to && src[i] !== '\n'; i++) {
        if (src[i] === '\\') i++;
        else if (src[i] === '[') cls = true;
        else if (src[i] === ']') cls = false;
        else if (src[i] === '/' && !cls) break;
      }
      for (i++; i < to && isId(src[i]); i++);
      regexOk = false;
    } else if (isId(c)) {
      let j = i;
      while (j < to && isId(src[j])) j++;
      regexOk = REGEX_AFTER.has(src.slice(i, j));
      i = j;
    } else if (/\s/.test(c)) i++;
    else {
      if (c === '{' && braces.length) braces[braces.length - 1]++;
      else if (c === '}' && braces.length) braces[braces.length - 1]--;
      regexOk = !(c === ')' || c === ']');
      i += (c === '+' || c === '-') && n === c ? 2 : 1;
    }
  }
  return out;
}
function cssComments(src: string, from = 0, to = src.length) {
  const out = [];
  for (let i = from; i < to; i++) {
    if (src[i] === '/' && src[i + 1] === '*') {
      out.push(i);
      const e = src.indexOf('*/', i + 2);
      i = e === -1 ? to : e + 1;
    } else if (src[i] === '\'' || src[i] === '"') {
      const q = src[i];
      for (i++; i < to && src[i] !== q && src[i] !== '\n'; i++) if (src[i] === '\\') i++;
    }
  }
  return out;
}
function htmlComments(src: string) {
  const out = [], tags = /<!--|<(script|style)\b[^>]*>/gi;
  for (let m; (m = tags.exec(src)); ) {
    if (!m[1]) {
      out.push(m.index);
      const e = src.indexOf('-->', m.index + 4);
      tags.lastIndex = e === -1 ? src.length : e + 3;
      continue;
    }
    const close = src.toLowerCase().indexOf(`</${m[1].toLowerCase()}`, tags.lastIndex);
    const end = close === -1 ? src.length : close;
    out.push(...(m[1].toLowerCase() === 'script' ? jsComments : cssComments)(src, tags.lastIndex, end));
    tags.lastIndex = end;
  }
  return out;
}
const NOT_OURS = new Set(['node_modules', 'vendor', 'dist', 'build', 'public-repo']);
const codeFiles = (dir: string): string[] => fs.readdirSync(here(dir), { withFileTypes: true }).flatMap((d) => {
  const f = dir ? `${dir}/${d.name}` : d.name;
  if (d.isDirectory()) return NOT_OURS.has(d.name) || d.name.startsWith('.') ? [] : codeFiles(f);
  return /\.(m?js|cjs|ts|css|html)$/.test(d.name) ? [f] : [];
});
let scanned = 0;
for (const f of codeFiles('')) {
  const src = fs.readFileSync(here(f), 'utf8');
  const at = (/\.html$/.test(f) ? htmlComments : /\.css$/.test(f) ? cssComments : jsComments)(src);
  scanned++;
  for (const i of at) problems.push(`${f}:${src.slice(0, i).split('\n').length} has a comment: the code has none`);
}

const SITE_RULE = /\.site\b|\.site-|#site-/;
const DISABLED = /:disabled|\[aria-disabled|\.off\b/;
const pxOf = (v: string) => v.replace(/calc\([^;]*\)/g, '').match(/(?:^|\s)(\d+(?:\.\d+)?)px(?=\/|\s|$|!)/)?.[1];
for (const f of fs.readdirSync(here('public')).filter((n) => n.endsWith('.css')).map((n) => 'public/' + n)) {
  const src = fs.readFileSync(here(f), 'utf8');
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2], line = src.slice(0, m.index! + m[0].indexOf('{')).split('\n').length;
    if (SITE_RULE.test(sel)) continue;
    const radius = body.match(/(?:^|[;\s])border-radius:\s*([^;]+)/)?.[1];
    if (radius && !/calc\(/.test(radius) && /\d(?:\.\d+)?px/.test(radius)) problems.push(`${f}:${line} sets border-radius in px (${radius.trim()}): use a --r-* token`);
    const size = body.match(/(?:^|[;\s])font-size:\s*([^;]+)/)?.[1], font = body.match(/(?:^|[;\s])font:\s*([^;]+)/)?.[1];
    for (const n of [size && pxOf(' ' + size), font && pxOf(' ' + font)]) if (n && Number(n) <= 18) problems.push(`${f}:${line} sets a ${n}px text size: use a --fs-* token`);
    if (DISABLED.test(sel) && /(?:^|[;\s])opacity:/.test(body)) problems.push(`${f}:${line} fades a disabled control: take --text-faint instead of opacity`);
  }
}

const linesOf = (f: string) => fs.readFileSync(here(f), 'utf8').split('\n');
for (const f of ['server.ts', ...serverFiles]) {
  linesOf(f).forEach((l, i) => {
    if (/\bclass \w+ extends Error\b/.test(l) && f !== 'server/base/routes.ts') problems.push(`${f}:${i + 1} makes its own error class: throw HttpError from server/base/routes.ts`);
    if (/Object\.assign\(new Error\(.*\{ status:/.test(l)) problems.push(`${f}:${i + 1} gives an Error a status by hand: throw new HttpError(status, message)`);
  });
}
const routeAt = new Map<string, string>();
for (const f of ['server.ts', ...serverFiles]) {
  linesOf(f).forEach((l, i) => {
    const key = /^\s*'((?:GET|POST|PUT|PATCH|DELETE) \/api\/[^']*)':/.exec(l)?.[1];
    if (!key) return;
    if (routeAt.has(key)) problems.push(`${f}:${i + 1} names the route ${key}, which ${routeAt.get(key)} already has: a route lives in one table`);
    else routeAt.set(key, `${f}:${i + 1}`);
  });
}
if (/url\.pathname === '\/api\/(?!stream')/.test(fs.readFileSync(here('server.ts'), 'utf8'))) problems.push(`server.ts picks a route by its path before the tables: put it in a table (a route that answers a file returns raw() from server/base/page.ts)`);
for (const f of modules.filter((m) => m !== 'base/util.ts' && !m.startsWith('site/'))) {
  linesOf('public/' + f).forEach((l, i) => {
    if (/\blocalStorage\b/.test(l)) problems.push(`public/${f}:${i + 1} reads or writes localStorage itself: go through store in base/util.ts (pref for what the user sets)`);
  });
}
const SILENT = /\.catch\(\(\) => (?:\{\}|null|false|undefined|\[\]|\(\{[^)]*\}\))\)/;
for (const f of modules) {
  linesOf('public/' + f).forEach((l, i) => {
    if (/\bapi\(/.test(l) && SILENT.test(l)) problems.push(`public/${f}:${i + 1} drops a failed call without a word: .catch(showErr) if the user asked for it, quietly(…) if it runs in the background`);
  });
}

if (problems.length) {
  console.error(problems.join('\n') + `\n\n${problems.length} problem(s). Fix them before deploying.`);
  process.exit(1);
}
const typeNote = ts ? 'no type errors' : 'types not checked: npm install first';
console.log(`check: ${checked.size} files parse (${typeNote}), ${imports} imports name real exports, ${modules.length} browser modules import without a loop and keep to their folders (${EXCEPTIONS.length} exceptions listed), each field of S is set only in its owner, ${scanned} files have no comments`);
