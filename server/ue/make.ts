import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { guard, HttpError } from '../base/routes.ts';
import * as names from './known.ts';

type Found = { path: string; name: string; engine: { dir: string } | null; targets: { name: string; type: string }[] };
type Edit = { path: string; before: string; after: string };
type Cursor = { line: number; col: number };

const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CTRL = /[\x00-\x1f\x7f]/;
const HEADER: Record<string, string> = { AActor: 'ActorClass', APawn: 'PawnClass', ACharacter: 'CharacterClass', UActorComponent: 'ActorComponentClass', USceneComponent: 'ActorComponentClass' };
const TYPES = ['Runtime', 'RuntimeNoCommandlet', 'RuntimeAndProgram', 'CookedOnly', 'UncookedOnly', 'Developer', 'DeveloperTool', 'Editor', 'EditorNoCommandlet', 'EditorAndProgram', 'Program', 'ServerOnly', 'ClientOnly', 'ClientOnlyNoCommandlet'];
const PHASES = ['EarliestPossible', 'PostConfigInit', 'PostSplashScreen', 'PreEarlyLoadingScreen', 'PreLoadingScreen', 'PreDefault', 'Default', 'PostDefault', 'PostEngineInit', 'None'];
const PLUGIN_TEXT = new Set(['cs', 'cpp', 'h', 'vcxproj', 'uplugin']);
const PLUGIN_SKIP = new Set(['opensdf', 'sdf', 'user', 'suo']);
const KNOWN_TEMPLATES: Record<string, { name: string; about: string; icon: string; content: boolean; type: string; phase: string; modules: boolean; order: number }> = {
  Blank: { name: 'Blank', about: 'One module with as little code as possible. Start here if you set everything up yourself.', icon: 'module', content: true, type: 'Runtime', phase: 'Default', modules: true, order: 0 },
  ContentOnly: { name: 'Content only', about: 'Holds only content: no Source folder and nothing to build.', icon: 'content', content: true, type: 'Runtime', phase: 'Default', modules: false, order: 1 },
  BlueprintLibrary: { name: 'Blueprint library', about: 'A function library whose static functions show up as Blueprint nodes.', icon: 'lib', content: true, type: 'Runtime', phase: 'PreLoadingScreen', modules: true, order: 2 },
  Basic: { name: 'Toolbar button', about: "A button in the Level Editor's toolbar. Start in the OnButtonClicked function it makes.", icon: 'toolbar', content: false, type: 'Editor', phase: 'Default', modules: true, order: 3 },
  Advanced: { name: 'Editor window', about: 'A toolbar button that opens an empty editor window of its own, ready for your UI.', icon: 'tab', content: false, type: 'Editor', phase: 'Default', modules: true, order: 4 },
  EditorMode: { name: 'Editor mode', about: 'An editor mode with a panel in the Modes tab and two example tools.', icon: 'mode', content: false, type: 'Editor', phase: 'Default', modules: true, order: 5 },
  ThirdPartyLibrary: { name: 'Third-party library', about: 'Loads an included third-party library: an example of how to ship, load and call a .dll.', icon: 'dll', content: true, type: 'Runtime', phase: 'Default', modules: true, order: 6 },
};

const classTemplates = (engine: string) => path.join(engine, 'Engine', 'Content', 'Editor', 'Templates');
const pluginBrowser = (engine: string) => path.join(engine, 'Engine', 'Plugins', 'Editor', 'PluginBrowser');
const slash = (p: string) => p.replace(/\\/g, '/');
const exists = (p: string) => fs.existsSync(p);
const isDir = (p: string) => fs.statSync(p, { throwIfNoEntry: false })?.isDirectory() || false;
const inside = (dir: string, p: string) => {
  const a = path.normalize(dir).toLowerCase(), b = path.normalize(p).toLowerCase();
  return b === a || b.startsWith(a + path.sep);
};
const eolOf = (t: string) => (t.includes('\r\n') ? '\r\n' : '\n');

async function template(file: string) {
  try {
    return (await fs.promises.readFile(file, 'utf8')).replace(/^﻿/, '');
  } catch {
    throw new HttpError(404, `the engine has no ${path.basename(file)}`);
  }
}

async function copyright(projDir: string) {
  const ini = await fs.promises.readFile(path.join(projDir, 'Config', 'DefaultGame.ini'), 'utf8').catch(() => '');
  const v = /^\s*CopyrightNotice\s*=(.*)$/m.exec(ini)?.[1].trim().replace(/^"(.*)"$/, '$1') || '';
  return v ? '// ' + v : '';
}

function drop(t: string, key: string) {
  const re = new RegExp(`^[ \\t]*%${key}%[ \\t]*\\n`, 'm');
  return re.test(t) ? t.replace(re, '') : t.split(`%${key}%`).join('');
}

function fields(t: string, values: Record<string, string>, copy: string) {
  t = copy ? t.split('%COPYRIGHT_LINE%').join(copy) : t.replace(/%COPYRIGHT_LINE%\n(\n)?/, '');
  for (const [k, v] of Object.entries(values)) t = v ? t.split(`%${k}%`).join(v) : drop(t, k);
  return t;
}

function stripComments(t: string, keepFirst: boolean) {
  const lines = t.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '/**') {
      let j = i + 1;
      while (j < lines.length && /^\s*\*(?!\/)/.test(lines[j]) && /^\s*\*\s*(%CURSORFOCUSLOCATION%)?\s*$/.test(lines[j])) j++;
      if (j < lines.length && lines[j].trim() === '*/') {
        i = j;
        continue;
      }
    }
    if (/^\s*\/\//.test(l) && !(i === 0 && keepFirst)) continue;
    out.push(l);
  }
  return out.join('\n');
}

function tidy(t: string) {
  return t
    .split('\n')
    .map((l) => (/^[ \t]+$/.test(l) ? '' : l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n(?=[ \t]*};?[ \t]*(\n|$))/g, '\n')
    .replace(/\n+$/, '\n');
}

function cursorOf(t: string): [string, Cursor] {
  const lines = t.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].indexOf('%CURSORFOCUSLOCATION%');
    if (c >= 0) return [t.replace('%CURSORFOCUSLOCATION%', ''), { line: i + 1, col: c + 1 }];
  }
  return [t, { line: 1, col: 1 }];
}

function finish(t: string, eol: string, keepComments: boolean, copy: string): [string, Cursor] {
  if (!keepComments) t = stripComments(t, !!copy);
  const [text, at] = cursorOf(tidy(t));
  return [text.split('\n').join(eol), at];
}

function scan(text: string, from: number, each: (c: string, i: number, depth: number) => boolean | void) {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? text.length : e + 1;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    if (each(c, i, depth)) return i;
    if (c === '}' || c === ']' || c === ')') depth--;
  }
  return -1;
}

const indentAt = (text: string, i: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', i) + 1))![0];

function addToList(text: string, key: string, item: Record<string, unknown>) {
  const json = JSON.parse(text.replace(/^﻿/, ''));
  const eol = eolOf(text);
  const want = (o: any) => Array.isArray(o?.[key]) && o[key].some((x: any) => JSON.stringify(x) === JSON.stringify(item));
  const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(text);
  if (m && Array.isArray(json[key]) && json[key].length) {
    const open = m.index + m[0].length - 1;
    let last = -1;
    const close = scan(text, open, (c, i, d) => {
      if (c === '}' && d === 2) last = i;
      return c === ']' && d === 1;
    });
    if (close > 0 && last > 0) {
      const ind = indentAt(text, scan(text, open, (c, _, d) => c === '{' && d === 2));
      const body = JSON.stringify(item, null, '\t').split('\n').map((l) => ind + l).join(eol);
      const out = text.slice(0, last + 1) + ',' + eol + body + text.slice(last + 1);
      try {
        if (want(JSON.parse(out.replace(/^﻿/, '')))) return out;
      } catch {}
    }
  }
  json[key] = [...(Array.isArray(json[key]) ? json[key] : []), item];
  return JSON.stringify(json, null, '\t').split('\n').join(eol) + (/\r?\n$/.test(text) ? eol : '');
}

function mentions(cs: string, mod: string) {
  const code = cs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return code.includes(`"${mod}"`);
}

function parseIdList(raw: unknown, label: string): string[] {
  if (raw == null || raw === '') return [];
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : null;
  if (!items) throw new HttpError(400, `${label} must be a list of module names`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const rawStr = String(item ?? '');
    if (CTRL.test(rawStr)) throw new HttpError(400, `${label} cannot contain control characters`);
    const s = rawStr.trim();
    if (!s) continue;
    if (!ID.test(s)) throw new HttpError(400, `"${s}" isn't a valid module name: letters, digits and _, not starting with a digit`);
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function cleanMeta(raw: unknown, label: string, max = 200): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw);
  if (CTRL.test(s)) throw new HttpError(400, `${label} cannot contain control characters`);
  const trimmed = s.trim();
  if (trimmed.length > max) throw new HttpError(400, `${label} is too long (max ${max} characters)`);
  return trimmed;
}

function addDependency(cs: string, mod: string, scope: 'Public' | 'Private' = 'Public') {
  const prop = scope === 'Private' ? 'PrivateDependencyModuleNames' : 'PublicDependencyModuleNames';
  const eol = eolOf(cs);
  const re = new RegExp(`${prop}\\s*\\.\\s*AddRange\\s*\\(\\s*new\\s+string\\s*\\[\\s*\\]\\s*\\{`, 'g');
  for (let m; (m = re.exec(cs)); ) {
    if (/\/\/[^\n]*$/.test(cs.slice(cs.lastIndexOf('\n', m.index) + 1, m.index))) continue;
    const open = m.index + m[0].length - 1;
    const close = scan(cs, open, (c, _, d) => c === '}' && d === 1);
    if (close < 0) return null;
    let lastLit = -1, lastEnd = -1;
    for (let i = open + 1; i < close; i++) {
      if (cs[i] === '/' && cs[i + 1] === '/') {
        while (i < close && cs[i] !== '\n') i++;
        continue;
      }
      if (cs[i] === '"') {
        lastLit = i;
        i = cs.indexOf('"', i + 1);
        lastEnd = i;
      }
    }
    const inner = cs.slice(open + 1, close);
    if (lastLit < 0) return cs.slice(0, open + 1) + ` "${mod}" ` + cs.slice(close);
    if (inner.includes('\n')) {
      const comma = /^[ \t]*,/.test(cs.slice(lastEnd + 1));
      const nl = cs.indexOf('\n', lastEnd);
      const end = nl < 0 || nl > close ? close : cs[nl - 1] === '\r' ? nl - 1 : nl;
      const line = eol + indentAt(cs, lastLit) + `"${mod}"` + (comma ? ',' : '');
      return (comma ? cs.slice(0, end) : cs.slice(0, lastEnd + 1) + ',' + cs.slice(lastEnd + 1, end)) + line + cs.slice(end);
    }
    return cs.slice(0, lastEnd + 1) + `, "${mod}"` + cs.slice(lastEnd + 1);
  }
  const one = new RegExp(`^([ \\t]*)${prop}\\s*\\.\\s*Add\\s*\\(\\s*"[^"]*"\\s*\\)\\s*;[^\\n]*$`, 'm').exec(cs);
  if (one) {
    const end = one.index + one[0].length;
    return cs.slice(0, end) + eol + one[1] + `${prop}.Add("${mod}");` + cs.slice(end);
  }
  if (scope === 'Private') {
    const pub = /^([ \t]*)PublicDependencyModuleNames\s*\.\s*Add(?:Range)?\s*\(/m.exec(cs);
    if (pub) {
      const semi = scan(cs, pub.index + pub[0].length - 1, (c, _, d) => c === ';' && d === 0);
      if (semi >= 0) {
        return cs.slice(0, semi + 1) + eol + eol + pub[1] + `PrivateDependencyModuleNames.AddRange(new string[] { "${mod}" });` + cs.slice(semi + 1);
      }
    }
  }
  return null;
}

function addTargetModule(cs: string, mod: string) {
  const eol = eolOf(cs);
  const all = [...cs.matchAll(/^([ \t]*)ExtraModuleNames\s*\.\s*Add(Range)?\s*\(/gm)];
  const m = all.at(-1);
  if (!m) return null;
  const semi = scan(cs, m.index! + m[0].length - 1, (c, _, d) => c === ';' && d === 0);
  if (semi < 0) return null;
  return cs.slice(0, semi + 1) + eol + m[1] + `ExtraModuleNames.Add("${mod}");` + cs.slice(semi + 1);
}

async function readEdit(file: string, change: (t: string) => string | null, root: string): Promise<Edit | null> {
  const before = await fs.promises.readFile(file, 'utf8');
  const after = change(before);
  return after == null || after === before ? null : { path: slash(path.relative(root, file)), before, after };
}

async function writeAll(root: string, files: [string, string | Buffer][], edits: Edit[], dirs: string[] = []) {
  const done: string[] = [];
  try {
    for (const d of dirs) await fs.promises.mkdir(d, { recursive: true });
    for (const [f, body] of files) {
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, body, { flag: 'wx' });
      done.push(f);
    }
  } catch (e) {
    for (const f of done) await fs.promises.rm(f, { force: true });
    throw new HttpError(409, `could not write ${path.basename(done.length < files.length ? files[done.length][0] : '')}: ${(e as Error).message}`);
  }
  for (const e of edits) await fs.promises.writeFile(path.join(root, e.path), e.after);
}

function engineOf(f: Found) {
  if (!f.engine) throw new HttpError(400, 'this project has no engine set up');
  return f.engine.dir;
}

async function pluginEdit(engine: string, f: Found, rel: string | undefined, root: string) {
  if (!rel) return null;
  const dir = path.join(engine, rel);
  const file = (await fs.promises.readdir(dir).catch(() => [])).find((x) => /\.uplugin$/i.test(x));
  if (!file) return null;
  const desc = JSON.parse((await fs.promises.readFile(path.join(dir, file), 'utf8')).replace(/^﻿/, '') || '{}');
  if (desc.EnabledByDefault) return null;
  const name = file.replace(/\.uplugin$/i, '');
  return readEdit(f.path, (t) => {
    const u = JSON.parse(t.replace(/^﻿/, ''));
    return (u.Plugins || []).some((p: any) => p.Name === name && p.Enabled) ? null : addToList(t, 'Plugins', { Name: name, Enabled: true });
  }, root);
}

async function newClass(f: Found, root: string, b: any) {
  const engine = engineOf(f), projDir = path.dirname(f.path);
  const name = String(b.name || '').trim(), dir = guard(String(b.dir || '')), abs = path.join(root, dir);
  if (!name) throw new HttpError(400, 'type a name');
  if (!ID.test(name)) throw new HttpError(400, `"${name}" isn't a C++ name: letters, digits and _, not starting with a digit`);
  if (!inside(projDir, abs)) throw new HttpError(400, 'this folder is outside the Unreal project');
  const mod = await names.moduleOfDir(projDir, abs);
  if (!mod) throw new HttpError(400, "this folder isn't inside a module: pick one under Source/ or a plugin's Source/");
  const parent = await names.parentOf(engine, projDir, String(b.parent || ''), path.relative(projDir, abs));
  if (!parent) throw new HttpError(400, `${b.parent} can't be a parent here: it isn't a class another module can subclass, or the list of classes isn't ready yet`);
  const kind = parent.kind, cls = kind === 'plain' ? name : (kind === 'interface' ? 'U' : parent.cls[0]) + name;
  const M = mod.dir, pub = path.join(M, 'Public'), priv = path.join(M, 'Private');
  const split = inside(pub, abs) || inside(priv, abs) || (path.normalize(abs).toLowerCase() === path.normalize(M).toLowerCase() && (isDir(pub) || isDir(priv)));
  const sub = inside(pub, abs) ? path.relative(pub, abs) : inside(priv, abs) ? path.relative(priv, abs) : '';
  const isPublic = split && (b.public == null ? !inside(priv, abs) : !!b.public);
  const hdir = split ? path.join(isPublic ? pub : priv, sub) : abs, cdir = split ? path.join(priv, sub) : abs;
  const hfile = path.join(hdir, name + '.h'), cfile = path.join(cdir, name + '.cpp');
  const cppAsH = path.join(cdir, name + '.h');
  const own = slash(inside(priv, cppAsH) ? path.relative(priv, cppAsH) : inside(pub, cppAsH) ? path.relative(pub, cppAsH) : path.relative(M, cppAsH));
  const taken = [hfile, cfile].find(exists);
  const why = taken ? `${path.basename(taken)} is already there: nothing is overwritten` : '';
  const buildFile = path.join(M, mod.name + '.Build.cs');
  const buildText = await fs.promises.readFile(buildFile, 'utf8').catch(() => '');
  const needs = parent.module && parent.module !== mod.name && !mentions(buildText, parent.module) ? parent.module : '';
  const plan = { cls: kind === 'interface' ? `U${name} + I${name}` : cls, base: parent.cls, module: mod.name, api: isPublic || !split ? mod.name.toUpperCase() + '_API' : '', split, public: isPublic, header: slash(path.relative(root, hfile)), source: slash(path.relative(root, cfile)), build: slash(path.relative(root, buildFile)), needs, plugin: parent.plugin || null, stop: why };
  if (b.dry) return plan;
  if (why) throw new HttpError(409, why);
  const tname = kind === 'interface' ? 'InterfaceClass' : kind === 'plain' ? 'EmptyClass' : HEADER[parent.cls] || 'UObjectClass';
  const hraw = await template(path.join(classTemplates(engine), tname + '.h.template'));
  const craw = await template(path.join(classTemplates(engine), tname + '.cpp.template'));
  const eol = eolOf(hraw), copy = await copyright(projDir), keep = !!b.comments;
  const common = { UNPREFIXED_CLASS_NAME: name, PREFIXED_CLASS_NAME: kind === 'plain' ? name : cls, MODULE_NAME: mod.name };
  const [h, hAt] = finish(fields(hraw.replace(/\r\n/g, '\n'), { ...common, CLASS_MODULE_API_MACRO: plan.api ? plan.api + ' ' : '', UCLASS_SPECIFIER_LIST: kind === 'interface' ? 'MinimalAPI' : '', PREFIXED_BASE_CLASS_NAME: kind === 'interface' ? 'UInterface' : parent.cls, BASE_CLASS_INCLUDE_DIRECTIVE: kind === 'interface' || !parent.include ? '' : `#include "${parent.include}"`, EVENTUAL_CONSTRUCTOR_DECLARATION: '', CLASS_PROPERTIES: '', CLASS_FUNCTION_DECLARATIONS: '' }, copy), eol, keep, copy);
  const [c, cAt] = finish(fields(craw.replace(/\r\n/g, '\n'), { ...common, PCH_INCLUDE_DIRECTIVE: '', MY_HEADER_INCLUDE_DIRECTIVE: `#include "${own}"`, ADDITIONAL_INCLUDE_DIRECTIVES: '', EVENTUAL_CONSTRUCTOR_DEFINITION: '', ADDITIONAL_MEMBER_DEFINITIONS: '' }, copy), eol, keep, copy);
  const edits: Edit[] = [];
  let manual = '';
  if (needs && b.deps) {
    const e = await readEdit(buildFile, (t) => addDependency(t, needs), root);
    if (e) edits.push(e);
    else manual = `add "${needs}" to ${mod.name}.Build.cs by hand: its dependency list wasn't found`;
    const p = await pluginEdit(engine, f, parent.plugin, root);
    if (p) edits.push(p);
  }
  await writeAll(root, [[hfile, h], [cfile, c]], edits);
  await names.forget(projDir);
  return { ...plan, made: [plan.header, plan.source], edits, manual, at: { header: hAt, source: cAt } };
}

async function projectPlugins(projDir: string) {
  const out: { name: string; dir: string; file: string }[] = [];
  const walk = async (d: string, depth: number) => {
    if (depth > 3) return;
    for (const e of await fs.promises.readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (e.isFile() && /\.uplugin$/i.test(e.name)) out.push({ name: e.name.replace(/\.uplugin$/i, ''), dir: d, file: path.join(d, e.name) });
      else if (e.isDirectory() && !/^(Source|Content|Binaries|Intermediate|Resources|Config)$/i.test(e.name)) await walk(path.join(d, e.name), depth + 1);
    }
  };
  await walk(path.join(projDir, 'Plugins'), 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function newModule(f: Found, root: string, b: any) {
  const engine = engineOf(f), projDir = path.dirname(f.path);
  const name = String(b.name || '').trim(), type = String(b.type || 'Runtime'), phase = String(b.phase || 'Default');
  if (!name) throw new HttpError(400, 'type a name');
  if (!ID.test(name)) throw new HttpError(400, `"${name}" isn't a C++ name: letters, digits and _, not starting with a digit`);
  if (!TYPES.includes(type)) throw new HttpError(400, `no module type ${type}`);
  if (!PHASES.includes(phase)) throw new HttpError(400, `no loading phase ${phase}`);
  const extraPub = parseIdList(b.deps, 'deps');
  const extraPriv = parseIdList(b['private-deps'] ?? b.privateDeps, 'private-deps');
  const rawClass = b.class == null ? '' : String(b.class);
  if (CTRL.test(rawClass)) throw new HttpError(400, 'class cannot contain control characters');
  const clsIn = rawClass.trim();
  if (clsIn && !ID.test(clsIn)) throw new HttpError(400, `"${clsIn}" isn't a C++ class name: letters, digits and _, not starting with a digit`);
  const modClass = clsIn ? (/^F[A-Z_]/.test(clsIn) ? clsIn : 'F' + clsIn) : '';
  const plugins = await projectPlugins(projDir);
  const plugin = b.plugin ? plugins.find((p) => p.name === b.plugin) : null;
  if (b.plugin && !plugin) throw new HttpError(404, `no plugin ${b.plugin} in this project`);
  const base = path.join(plugin ? plugin.dir : projDir, 'Source', name);
  if (!inside(projDir, base) || !inside(root, base)) throw new HttpError(400, 'module folder is outside the Unreal project');
  const owner = plugin ? plugin.file : f.path;
  const targets = plugin ? [] : (Array.isArray(b.targets) ? b.targets.map(String) : []).filter((t: string) => f.targets.some((x) => x.name === t));
  const ownerJson = JSON.parse((await fs.promises.readFile(owner, 'utf8')).replace(/^﻿/, '') || '{}');
  const why = exists(base) ? `Source/${name} is already there: nothing is overwritten` : (ownerJson.Modules || []).some((m: any) => m.Name === name) ? `${path.basename(owner)} already has a module named ${name}` : '';
  const rel = (p: string) => slash(path.relative(root, p));
  const files = [path.join(base, name + '.Build.cs'), path.join(base, 'Public', name + '.h'), path.join(base, 'Private', name + '.cpp')];
  const plan = { name, type, phase, plugin: plugin?.name || null, made: files.map(rel), owner: rel(owner), targets: targets.map((t: string) => rel(path.join(projDir, 'Source', t + '.Target.cs'))), plugins: plugins.map((p) => p.name), stop: why };
  if (b.dry) return plan;
  if (why) throw new HttpError(409, why);
  const dir = classTemplates(engine);
  const braw = await template(path.join(dir, 'GameModule.Build.cs.template')), hraw = await template(path.join(dir, 'GameModule.h.template'));
  const eol = eolOf(braw), copy = await copyright(projDir), keep = !!b.comments;
  const list = (xs: string[]) => xs.map((x) => `"${x}"`).join(', ');
  const pubDeps = [...new Set(['Core', 'CoreUObject', 'Engine', ...extraPub])];
  const privDeps = [...new Set([...(/^Editor/.test(type) ? ['UnrealEd'] : []), ...extraPriv])];
  const [bc] = finish(fields(braw.replace(/\r\n/g, '\n'), { MODULE_NAME: name, PUBLIC_DEPENDENCY_MODULE_NAMES: list(pubDeps), PRIVATE_DEPENDENCY_MODULE_NAMES: list(privDeps) || ' ' }, copy), eol, keep, copy);
  const h = modClass
    ? [...(copy ? [copy, ''] : []), '#pragma once', '', '#include "CoreMinimal.h"', '#include "Modules/ModuleManager.h"', '', `class ${modClass} : public IModuleInterface`, '{', 'public:', '\tvirtual void StartupModule() override;', '\tvirtual void ShutdownModule() override;', '};', ''].join(eol)
    : finish(fields(hraw.replace(/\r\n/g, '\n'), { MODULE_NAME: name, PUBLIC_HEADER_INCLUDES: '' }, copy), eol, keep, copy)[0];
  const c = modClass
    ? [...(copy ? [copy, ''] : []), `#include "${name}.h"`, '', `void ${modClass}::StartupModule()`, '{', '}', '', `void ${modClass}::ShutdownModule()`, '{', '}', '', `IMPLEMENT_MODULE(${modClass}, ${name});`, ''].join(eol)
    : [...(copy ? [copy, ''] : []), `#include "${name}.h"`, '#include "Modules/ModuleManager.h"', '', `IMPLEMENT_MODULE(FDefaultModuleImpl, ${name});`, ''].join(eol);
  const edits: Edit[] = [];
  const o = await readEdit(owner, (t) => addToList(t, 'Modules', { Name: name, Type: type, LoadingPhase: phase }), root);
  if (o) edits.push(o);
  const manual: string[] = [];
  for (const t of targets) {
    const file = path.join(projDir, 'Source', t + '.Target.cs');
    const e = await readEdit(file, (x) => addTargetModule(x, name), root).catch(() => null);
    if (e) edits.push(e);
    else manual.push(`add ExtraModuleNames.Add("${name}"); to ${t}.Target.cs by hand`);
  }
  await writeAll(root, [[files[0], bc], [files[1], h], [files[2], c]], edits);
  await names.forget(projDir);
  return { ...plan, edits, manual: manual.join('; ') };
}

async function pluginTemplates(engine: string) {
  const dir = path.join(pluginBrowser(engine), 'Templates');
  const ids = (await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && e.name !== 'Resources').map((e) => e.name);
  return ids
    .map((id) => ({ id, ...(KNOWN_TEMPLATES[id] || { name: id, about: 'A plugin template found in your engine.', icon: 'module', content: true, type: 'Runtime', phase: 'Default', modules: isDir(path.join(dir, id, 'Source')), order: 99 }) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ order, ...t }) => t);
}

async function filesOf(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesOf(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

async function newPlugin(f: Found, root: string, b: any) {
  const engine = engineOf(f), projDir = path.dirname(f.path);
  const name = String(b.name || '').trim(), id = String(b.template || 'Blank');
  if (!name) throw new HttpError(400, 'type a name');
  if (!ID.test(name)) throw new HttpError(400, `"${name}" isn't a C++ name: letters, digits and _, not starting with a digit`);
  const friendlyName = cleanMeta(b['friendly-name'] ?? b.friendlyName, 'friendly-name');
  const category = cleanMeta(b.category, 'category');
  const all = await pluginTemplates(engine), t = all.find((x) => x.id === id);
  if (!t) throw new HttpError(404, `the engine has no plugin template ${id}`);
  const src = path.join(pluginBrowser(engine), 'Templates', id), dest = path.join(projDir, 'Plugins', name);
  if (!inside(projDir, dest) || !inside(root, dest)) throw new HttpError(400, 'plugin folder is outside the Unreal project');
  const why = exists(dest) ? `Plugins/${name} is already there: nothing is overwritten` : '';
  const rel = (p: string) => slash(path.relative(root, p));
  const copies = (await filesOf(src)).filter((x) => !PLUGIN_SKIP.has(path.extname(x).slice(1).toLowerCase())).map((x) => {
    const to = x.split('PLUGIN_NAME').join(name);
    return { from: path.join(src, x), to: path.join(dest, /\.uplugin$/i.test(to) ? path.join(path.dirname(to), name + '.uplugin') : to) };
  });
  const upluginFile = path.join(dest, name + '.uplugin');
  const ownDesc = !copies.some((c) => path.normalize(c.to).toLowerCase() === path.normalize(upluginFile).toLowerCase());
  const icon = path.join(dest, 'Resources', 'Icon128.png');
  const needIcon = !copies.some((c) => path.normalize(c.to).toLowerCase() === path.normalize(icon).toLowerCase());
  const made = [...(ownDesc ? [upluginFile] : []), ...(needIcon ? [icon] : []), ...copies.map((c) => c.to)];
  const plan = { name, template: id, dir: rel(dest), made: made.map(rel), enable: b.enable !== false, owner: rel(f.path), stop: why };
  if (b.dry) return plan;
  if (why) throw new HttpError(409, why);
  const files: [string, string | Buffer][] = [];
  const uproject = await fs.promises.readFile(f.path, 'utf8');
  const eol = eolOf(uproject);
  if (ownDesc) {
    const desc = { FileVersion: 3, Version: 1, VersionName: '1.0', FriendlyName: friendlyName || name, Description: String(b.description || ''), Category: category || 'Other', CreatedBy: '', CreatedByURL: '', DocsURL: '', MarketplaceURL: '', SupportURL: '', CanContainContent: t.content, IsBetaVersion: false, IsExperimentalVersion: false, Installed: false, ...(t.modules ? { Modules: [{ Name: name, Type: t.type, LoadingPhase: t.phase }] } : {}) };
    files.push([upluginFile, JSON.stringify(desc, null, '\t').split('\n').join(eol)]);
  }
  if (needIcon) {
    const fallback = path.join(pluginBrowser(engine), 'Resources', 'DefaultIcon128.png');
    if (exists(fallback)) files.push([icon, await fs.promises.readFile(fallback)]);
    else plan.made = plan.made.filter((m) => m !== rel(icon));
  }
  for (const c of copies) {
    const ext = path.extname(c.from).slice(1).toLowerCase();
    if (PLUGIN_TEXT.has(ext)) {
      let text = (await fs.promises.readFile(c.from, 'utf8')).split('PLUGIN_NAME').join(name);
      text = text.split(name + '_API').join(name.toUpperCase() + '_API');
      if (ext === 'uplugin') {
        const parsed = JSON.parse(text.replace(/^﻿/, ''));
        if (friendlyName) parsed.FriendlyName = friendlyName;
        if (category) parsed.Category = category;
        if (b.description != null && String(b.description) !== '') parsed.Description = String(b.description);
        text = JSON.stringify(parsed, null, '\t').split('\n').join(eolOf(text));
      }
      files.push([c.to, text]);
    } else files.push([c.to, await fs.promises.readFile(c.from)]);
  }
  const edits: Edit[] = [];
  if (plan.enable) {
    const e = await readEdit(f.path, (x) => addToList(x, 'Plugins', { Name: name, Enabled: true }), root);
    if (e) edits.push(e);
  }
  await writeAll(root, files, edits, t.id === 'ContentOnly' ? [path.join(dest, 'Content')] : []);
  await names.forget(projDir);
  return { ...plan, edits };
}

async function addModuleDeps(f: Found, root: string, b: any) {
  const projDir = path.dirname(f.path);
  const rawMod = String(b.module ?? '');
  if (CTRL.test(rawMod)) throw new HttpError(400, 'module name cannot contain control characters');
  const modName = rawMod.trim();
  if (!modName) throw new HttpError(400, 'give a module name');
  if (!ID.test(modName)) throw new HttpError(400, `"${modName}" isn't a valid module name: letters, digits and _, not starting with a digit`);
  const pubDeps = parseIdList(b.add, 'add');
  const privDeps = parseIdList(b['private-add'] ?? b.privateAdd, 'private-add');
  if (!pubDeps.length && !privDeps.length) throw new HttpError(400, 'give at least one dependency with --add or --private-add');
  const rawPlugin = b.plugin == null ? '' : String(b.plugin);
  if (CTRL.test(rawPlugin)) throw new HttpError(400, 'plugin name cannot contain control characters');
  const pluginName = rawPlugin.trim();
  if (pluginName && !ID.test(pluginName)) throw new HttpError(400, `"${pluginName}" isn't a valid plugin name: letters, digits and _, not starting with a digit`);
  const plugins = await projectPlugins(projDir);
  let buildFile = '';
  if (pluginName) {
    const p = plugins.find((x) => x.name === pluginName);
    if (!p) throw new HttpError(404, `no plugin ${pluginName} in this project`);
    const cand = path.join(p.dir, 'Source', modName, modName + '.Build.cs');
    if (!exists(cand)) throw new HttpError(404, `no module ${modName} in plugin ${pluginName}`);
    buildFile = cand;
  } else {
    const direct = path.join(projDir, 'Source', modName, modName + '.Build.cs');
    if (exists(direct)) buildFile = direct;
    else {
      const hits = plugins.map((p) => path.join(p.dir, 'Source', modName, modName + '.Build.cs')).filter(exists);
      if (hits.length > 1) throw new HttpError(409, `more than one plugin has a module named ${modName}: pass --plugin`);
      if (hits.length === 1) buildFile = hits[0];
    }
  }
  if (!buildFile) throw new HttpError(404, `no module ${modName} in this project`);
  if (!inside(projDir, buildFile) || !inside(root, buildFile)) throw new HttpError(400, 'module is outside the Unreal project');
  const rel = slash(guard(path.relative(root, buildFile)));
  let text = await fs.promises.readFile(buildFile, 'utf8');
  const before = text;
  const added: string[] = [];
  const skipped: string[] = [];
  for (const dep of pubDeps) {
    if (mentions(text, dep)) {
      skipped.push(dep);
      continue;
    }
    const next = addDependency(text, dep, 'Public');
    if (next == null) throw new HttpError(400, `could not find PublicDependencyModuleNames in ${rel}`);
    text = next;
    added.push(dep);
  }
  for (const dep of privDeps) {
    if (mentions(text, dep)) {
      skipped.push(dep);
      continue;
    }
    const next = addDependency(text, dep, 'Private');
    if (next == null) throw new HttpError(400, `could not find PrivateDependencyModuleNames in ${rel}`);
    text = next;
    added.push(dep);
  }
  if (text !== before) {
    await fs.promises.writeFile(buildFile, text);
    await names.forget(projDir);
  }
  return { module: modName, file: rel, added, skipped };
}

async function create(f: Found, root: string, b: any) {
  const kind = String(b?.kind || 'class');
  if (kind === 'class') return newClass(f, root, b);
  if (kind === 'module') return newModule(f, root, b);
  if (kind === 'plugin') return newPlugin(f, root, b);
  throw new HttpError(400, 'kind is class, module or plugin');
}

const UE_GITIGNORE = [
  'Binaries/',
  'DerivedDataCache/',
  'Intermediate/',
  'Saved/',
  'Build/',
  '.vs/',
  '.idea/',
  '.vscode/',
  '*.sln',
  '*.suo',
  '*.opensdf',
  '*.sdf',
  '*.VC.db',
  '*.VC.opendb',
  '*.xcodeproj',
  '*.xcworkspace',
  '.amethyst/',
  '.env',
  '.env.*',
  '!.env.example',
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
];

async function newProject(root: string, b: { name?: string; engine: { id: string } }) {
  const name = String(b.name || '').trim();
  if (!name) throw new HttpError(400, 'type a name');
  if (!ID.test(name)) throw new HttpError(400, `"${name}" isn't a C++ name: letters, digits and _, not starting with a digit`);
  const there = (await fs.promises.readdir(root).catch(() => [])).find((f) => /\.uproject$/i.test(f));
  if (there) throw new HttpError(409, `${there} is already here: one Unreal project per folder, nothing is overwritten`);
  const eol = '\r\n', lines = (xs: string[]) => xs.join(eol) + eol;
  const target = (cls: string, type: string) =>
    lines(['using UnrealBuildTool;', 'using System.Collections.Generic;', '', `public class ${cls} : TargetRules`, '{', `\tpublic ${cls}(TargetInfo Target) : base(Target)`, '\t{', `\t\tType = TargetType.${type};`, '\t\tDefaultBuildSettings = BuildSettingsVersion.Latest;', '\t\tIncludeOrderVersion = EngineIncludeOrderVersion.Latest;', `\t\tExtraModuleNames.Add("${name}");`, '\t}', '}']);
  const uproject = { FileVersion: 3, EngineAssociation: b.engine.id, Category: '', Description: '', Modules: [{ Name: name, Type: 'Runtime', LoadingPhase: 'Default' }] };
  const ignore = path.join(root, '.gitignore');
  const files: [string, string][] = [
    [path.join(root, name + '.uproject'), JSON.stringify(uproject, null, '\t').split('\n').join(eol) + eol],
    [path.join(root, 'Source', name + '.Target.cs'), target(name + 'Target', 'Game')],
    [path.join(root, 'Source', name + 'Editor.Target.cs'), target(name + 'EditorTarget', 'Editor')],
    [path.join(root, 'Source', name, name + '.Build.cs'), lines(['using UnrealBuildTool;', '', `public class ${name} : ModuleRules`, '{', `\tpublic ${name}(ReadOnlyTargetRules Target) : base(Target)`, '\t{', '\t\tPCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;', '', '\t\tPublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "InputCore" });', '\t}', '}'])],
    [path.join(root, 'Source', name, name + '.h'), lines(['#pragma once', '', '#include "CoreMinimal.h"'])],
    [path.join(root, 'Source', name, name + '.cpp'), lines([`#include "${name}.h"`, '#include "Modules/ModuleManager.h"', '', `IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, ${name}, "${name}");`])],
    [path.join(root, 'Config', 'DefaultEngine.ini'), lines(['[/Script/HardwareTargeting.HardwareTargetingSettings]', 'TargetedHardwareClass=Desktop', 'AppliedTargetedHardwareClass=Desktop', 'DefaultGraphicsPerformance=Maximum', 'AppliedDefaultGraphicsPerformance=Maximum'])],
    [path.join(root, 'Config', 'DefaultGame.ini'), lines(['[/Script/EngineSettings.GeneralProjectSettings]', `ProjectID=${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`, `ProjectName=${name}`])],
    ...(exists(ignore) ? [] : ([[ignore, lines(UE_GITIGNORE)]] as [string, string][])),
  ];
  await writeAll(root, files, [], [path.join(root, 'Content')]);
  return { name, engine: b.engine.id, made: [...files.map(([f]) => slash(path.relative(root, f))), 'Content/'] };
}

export { newProject, create, addModuleDeps, pluginTemplates, projectPlugins, addDependency, addToList, addTargetModule, TYPES, PHASES };
