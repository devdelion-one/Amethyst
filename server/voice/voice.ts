import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { HttpError } from '../base/routes.ts';
import type { Routes } from '../../public/base/types.ts';

interface Source {
  url: string;
  sha256: string;
  bytes?: number;
}
interface Sources {
  bin: Source | null;
  models: Record<string, Source>;
  exe?: string;
  live: { bin: Source | null; model: Source; exe?: string; server?: string };
}

const WIN = process.platform === 'win32';
const RELEASE = 'b5907';
const GH = `https://github.com/ggml-org/whisper.cpp/releases/download/${RELEASE}`;
const HF = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
const BINS: Record<string, Source> = {
  'win32-x64': { url: `${GH}/whisper-bin-x64.zip`, sha256: 'ecca07b277d943e9b9f4712856a144b857271a6b333104e511e1988e80db582b', bytes: 9168428 },
  'linux-x64': { url: `${GH}/whisper-bin-ubuntu-x64.tar.gz`, sha256: 'a6199027fe5b4239c84171d2bca4c0ff44ec86a515494d5a39b237b212d429bd', bytes: 10413708 },
  'linux-arm64': { url: `${GH}/whisper-bin-ubuntu-arm64.tar.gz`, sha256: 'da2e86ac058e1db0281167355428665b82c0d92e4506d186a3894bec55ceefef', bytes: 4623550 },
};
const MODELS: Record<string, Source> = {
  base: { url: `${HF}/ggml-base.bin`, sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', bytes: 147951465 },
  small: { url: `${HF}/ggml-small.bin`, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b', bytes: 487601967 },
};
const SH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';
const LIVE_BINS: Record<string, Source> = {
  'win32-x64': { url: `${SH}/v2.0.3/sherpa-onnx-v2.0.3-win-x64-shared-MD-Release-no-tts.tar.bz2`, sha256: '88adaac47d3b3fe5b341634fd17f8287340d1b99e23ba1b5a57ffc0a2a38d0bc', bytes: 26028350 },
  'linux-x64': { url: `${SH}/v2.0.3/sherpa-onnx-v2.0.3-linux-x64-shared-no-tts.tar.bz2`, sha256: 'c16987540bc90cd10bab271023b2dcfb0864892b5af74cb1c9a9c7f1c4efe3af', bytes: 27264882 },
  'linux-arm64': { url: `${SH}/v2.0.3/sherpa-onnx-v2.0.3-linux-aarch64-shared-cpu.tar.bz2`, sha256: 'c42748225180235bdd4ba10f8c4575b54beb8d5b26a5303bb3051026a0fe4e53', bytes: 29516176 },
};
const LIVE_MODEL: Source = { url: `${SH}/asr-models/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-80ms-int8.tar.bz2`, sha256: '7bd33a914e93370a1ba9c2066d9e841bdcad8613fa2a00537c1ae15d851a14d8', bytes: 102813625 };
const IDS = Object.keys(MODELS);
const EXE = WIN ? 'whisper-cli.exe' : 'whisper-cli';
const SERVER_EXE = WIN ? 'whisper-server.exe' : 'whisper-server';
const KEEP = WIN ? /^(whisper-cli\.exe|whisper-server\.exe|whisper\.dll|ggml.*\.dll)$/i : /^(whisper-cli|whisper-server|libwhisper\.so.*|libggml.*\.so.*)$/;
const LIVE_EXE = WIN ? 'sherpa-onnx-online-websocket-server.exe' : 'sherpa-onnx-online-websocket-server';
const LIVE_KEEP = WIN ? /^(sherpa-onnx-online-websocket-server\.exe|.*\.dll)$/i : /^(sherpa-onnx-online-websocket-server|lib.*\.so.*)$/;
const MARK = 'installed.json';
const PROGRAM_VERSION = 2;

const base = () => process.env.MIND_VOICE_DIR || (WIN ? path.join(process.env.APPDATA || path.join(os.homedir(), '.amethyst'), 'Amethyst', 'voice') : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Amethyst', 'voice'));
const binDir = () => path.join(base(), 'bin');
const modelFile = (id: string) => path.join(base(), 'models', `ggml-${id}.bin`);
const liveDir = () => path.join(base(), 'live');
const liveModelDir = () => path.join(liveDir(), 'model');

function sources(): Sources {
  const file = process.env.MIND_VOICE_SOURCES;
  const live = { bin: LIVE_BINS[`${process.platform}-${process.arch}`] || null, model: LIVE_MODEL };
  if (!file) return { bin: BINS[`${process.platform}-${process.arch}`] || null, models: MODELS, live };
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { bin: j.bin || null, models: { ...MODELS, ...(j.models || {}) }, exe: j.exe, live: { ...live, ...(j.live || {}) } };
}

const progress = { got: 0, total: 0, error: '' };
let installing: Promise<unknown> | null = null;

function sizeOf(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.lstatSync(path.join(dir, e.name)).size;
  } catch {}
  return n;
}

function programHere(src: Sources) {
  try {
    const mark = JSON.parse(fs.readFileSync(path.join(binDir(), MARK), 'utf8'));
    return mark.sha256 === src.bin?.sha256 && mark.version === PROGRAM_VERSION && fs.existsSync(path.join(binDir(), EXE));
  } catch {
    return false;
  }
}
const markOk = (file: string, sha?: string) => {
  try {
    return !!sha && JSON.parse(fs.readFileSync(file, 'utf8')).sha256 === sha;
  } catch {
    return false;
  }
};
const liveProgramHere = (src: Sources) => markOk(path.join(liveDir(), 'bin', MARK), src.live.bin?.sha256) && fs.existsSync(path.join(liveDir(), 'bin', LIVE_EXE));
const liveModelHere = (src: Sources) => markOk(path.join(liveModelDir(), MARK), src.live.model.sha256);

const modelOf = (id: unknown) => {
  const m = id == null || id === '' ? 'base' : String(id);
  if (!IDS.includes(m)) throw new HttpError(400, `There is no speech model called ${m}. Pick ${IDS.join(' or ')}.`);
  return m;
};

function state(model: string) {
  const src = sources(), program = !!src.bin && programHere(src);
  const models: Record<string, { have: boolean; mb: number }> = {};
  for (const id of IDS) models[id] = { have: fs.existsSync(modelFile(id)), mb: Math.round((src.models[id].bytes || 0) / 1e6) };
  const lp = liveProgramHere(src), lm = liveModelHere(src);
  const live = { os: !!src.live.bin, have: !!src.live.bin && lp && lm, mb: Math.round(((lp ? 0 : src.live.bin?.bytes || 0) + (lm ? 0 : src.live.model.bytes || 0) + (program ? 0 : src.bin?.bytes || 0)) / 1e6) };
  return { os: !!src.bin, ready: program && models[model].have, program, models, live, installing: !!installing, got: progress.got, total: progress.total, error: progress.error, bytes: sizeOf(base()) };
}

const run = (exe: string, args: string[], cwd?: string, timeout = 120e3) =>
  new Promise<string>((resolve, reject) =>
    execFile(exe, args, { cwd, windowsHide: true, timeout, maxBuffer: 64e6, encoding: 'utf8' }, (err, out, e) => (err ? reject(new Error(String(e || err.message).trim())) : resolve(out))),
  );

const untar = (file: string, to: string) => run(WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar', ['-xf', file, '-C', to]);

async function fetchTo(src: Source, file: string) {
  let host = src.url;
  try {
    host = new URL(src.url).host;
  } catch {}
  let r: Response;
  try {
    r = await fetch(src.url, { redirect: 'follow', headers: { 'user-agent': 'Amethyst' } });
  } catch (e) {
    throw new HttpError(502, `The download from ${host} failed: ${(e as Error).message}. Nothing was installed.`);
  }
  if (!r.ok || !r.body) throw new HttpError(502, `The download from ${host} failed: it answered ${r.status}. Nothing was installed.`);
  const told = Number(r.headers.get('content-length')) || 0;
  if (!src.bytes && told) progress.total += told;
  const hash = crypto.createHash('sha256'), fh = await fs.promises.open(file, 'w');
  try {
    for await (const c of r.body as unknown as AsyncIterable<Uint8Array>) {
      hash.update(c);
      await fh.write(c);
      progress.got += c.length;
    }
  } catch (e) {
    throw new HttpError(502, `The download from ${host} broke off: ${(e as Error).message}. Nothing was installed.`);
  } finally {
    await fh.close();
  }
  const got = hash.digest('hex');
  if (got !== src.sha256) throw new HttpError(502, `The download from ${host} is not the expected file (its SHA-256 starts ${got.slice(0, 12)}). Nothing was installed.`);
}

function findExe(dir: string, exe = EXE): string | null {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === exe.toLowerCase()) return dir;
    if (e.isDirectory()) {
      const f = findExe(p, exe);
      if (f) return f;
    }
  }
  return null;
}

async function getProgram(src: Source, tmp: string) {
  const pkg = path.join(tmp, 'bin.pkg'), out = path.join(tmp, 'bin-out'), stage = path.join(tmp, 'bin');
  await fs.promises.mkdir(out);
  await fs.promises.mkdir(stage);
  await fetchTo(src, pkg);
  await untar(pkg, out).catch((e) => {
    throw new HttpError(502, `The speech program's download could not be unpacked: ${e.message}. Nothing was installed.`);
  });
  const from = findExe(out);
  if (!from) throw new HttpError(502, `The speech program's download has no ${EXE}. Nothing was installed.`);
  for (const f of fs.readdirSync(from)) if (KEEP.test(f)) await fs.promises.cp(path.join(from, f), path.join(stage, f), { verbatimSymlinks: true });
  if (!WIN) for (const f of fs.readdirSync(stage)) await fs.promises.chmod(path.join(stage, f), 0o755).catch(() => {});
  await fs.promises.writeFile(path.join(stage, MARK), JSON.stringify({ release: RELEASE, version: PROGRAM_VERSION, url: src.url, sha256: src.sha256, at: Date.now() }, null, 1));
  await fs.promises.rm(binDir(), { recursive: true, force: true });
  await fs.promises.rename(stage, binDir());
}

async function getModel(id: string, src: Source, tmp: string) {
  const file = path.join(tmp, `ggml-${id}.bin`);
  await fetchTo(src, file);
  await fs.promises.mkdir(path.dirname(modelFile(id)), { recursive: true });
  await fs.promises.rename(file, modelFile(id));
}

async function unpack(src: Source, tmp: string, name: string) {
  const pkg = path.join(tmp, `${name}.pkg`), out = path.join(tmp, `${name}-out`);
  await fs.promises.mkdir(out);
  await fetchTo(src, pkg);
  await untar(pkg, out).catch((e) => {
    throw new HttpError(502, `The live speech download could not be unpacked: ${e.message}. Nothing was installed.`);
  });
  await fs.promises.rm(pkg, { force: true });
  return out;
}

const copyIf = async (from: string, to: string, keep: RegExp) => {
  await fs.promises.mkdir(to, { recursive: true });
  for (const f of fs.readdirSync(from)) if (keep.test(f)) await fs.promises.cp(path.join(from, f), path.join(to, f), { verbatimSymlinks: true });
};

async function getLiveProgram(src: Source, tmp: string) {
  const out = await unpack(src, tmp, 'live-bin'), stage = path.join(tmp, 'live-stage');
  const from = findExe(out, LIVE_EXE);
  if (!from) throw new HttpError(502, `The live speech download has no ${LIVE_EXE}. Nothing was installed.`);
  await copyIf(from, path.join(stage, 'bin'), LIVE_KEEP);
  const lib = path.join(from, '..', 'lib');
  if (!WIN && fs.existsSync(lib)) await copyIf(lib, path.join(stage, 'lib'), LIVE_KEEP);
  if (!WIN) for (const f of fs.readdirSync(path.join(stage, 'bin'))) await fs.promises.chmod(path.join(stage, 'bin', f), 0o755).catch(() => {});
  await fs.promises.writeFile(path.join(stage, 'bin', MARK), JSON.stringify({ url: src.url, sha256: src.sha256, at: Date.now() }, null, 1));
  await fs.promises.mkdir(liveDir(), { recursive: true });
  for (const d of ['bin', 'lib']) {
    await fs.promises.rm(path.join(liveDir(), d), { recursive: true, force: true });
    if (fs.existsSync(path.join(stage, d))) await fs.promises.rename(path.join(stage, d), path.join(liveDir(), d));
  }
}

function findFile(dir: string, name: string): string | null {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name === name) return dir;
    if (e.isDirectory()) {
      const f = findFile(path.join(dir, e.name), name);
      if (f) return f;
    }
  }
  return null;
}

async function getLiveModel(src: Source, tmp: string) {
  const out = await unpack(src, tmp, 'live-model'), stage = path.join(tmp, 'live-model');
  const from = findFile(out, 'tokens.txt');
  if (!from) throw new HttpError(502, 'The live speech model download has no tokens.txt. Nothing was installed.');
  await copyIf(from, stage, /\.onnx$|^tokens\.txt$/);
  await fs.promises.writeFile(path.join(stage, MARK), JSON.stringify({ url: src.url, sha256: src.sha256, at: Date.now() }, null, 1));
  await fs.promises.mkdir(liveDir(), { recursive: true });
  await fs.promises.rm(liveModelDir(), { recursive: true, force: true });
  await fs.promises.rename(stage, liveModelDir());
}

async function doInstall(model: string, live: boolean) {
  const src = sources(), needBin = !programHere(src), needModel = !fs.existsSync(modelFile(model));
  const needLiveBin = live && !!src.live.bin && !liveProgramHere(src), needLiveModel = live && !!src.live.bin && !liveModelHere(src);
  progress.got = 0;
  progress.total = (needBin ? src.bin!.bytes || 0 : 0) + (needModel ? src.models[model].bytes || 0 : 0) + (needLiveBin ? src.live.bin!.bytes || 0 : 0) + (needLiveModel ? src.live.model.bytes || 0 : 0);
  progress.error = '';
  if (!needBin && !needModel && !needLiveBin && !needLiveModel) return;
  await stopEngines();
  await fs.promises.mkdir(base(), { recursive: true });
  const tmp = await fs.promises.mkdtemp(path.join(base(), 'download-'));
  try {
    if (needBin) await getProgram(src.bin!, tmp);
    if (needModel) await getModel(model, src.models[model], tmp);
    if (needLiveBin) await getLiveProgram(src.live.bin!, tmp);
    if (needLiveModel) await getLiveModel(src.live.model, tmp);
  } finally {
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function install(model: string, live: boolean) {
  if (!sources().bin) throw new HttpError(400, `Speech to text isn't available on ${process.platform === 'darwin' ? 'macOS' : 'this system'} yet.`);
  installing ||= doInstall(model, live)
    .catch((e) => (progress.error = (e as Error).message))
    .finally(() => (installing = null));
  return state(model);
}

async function remove() {
  if (installing) throw new HttpError(409, 'Speech to text is downloading. Wait for it to finish, then remove it.');
  await stopEngines();
  const dir = base();
  if (!process.env.MIND_VOICE_DIR && path.basename(dir) !== 'voice') throw new HttpError(500, `Not removing ${dir}, because it isn't the speech folder.`);
  await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  progress.got = progress.total = 0;
  progress.error = '';
  return state('base');
}

const threads = () => Math.max(1, Math.min(8, (os.availableParallelism?.() || os.cpus().length) - 1));

async function text(model: string, wav: unknown) {
  if (typeof wav !== 'string' || !wav) throw new HttpError(400, 'No recording was sent.');
  const s = state(model);
  if (!s.ready) throw new HttpError(409, s.os ? `Speech to text isn't downloaded yet. Download the ${model} model first.` : "Speech to text isn't available on this system yet.");
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'amethyst-voice-'));
  try {
    const file = path.join(dir, 'speech.wav');
    await fs.promises.writeFile(file, Buffer.from(wav, 'base64'));
    const args = ['-m', modelFile(model), '-f', file, '-nt', '-np', '-l', 'auto', '-t', String(threads())];
    const fake = sources().exe;
    const out = await (fake ? run(process.execPath, [fake, ...args], dir) : run(path.join(binDir(), EXE), args, binDir())).catch((e) => {
      throw new HttpError(500, `The speech program failed: ${e.message}`);
    });
    return { text: out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ') };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const ROUTES: Routes = {
  'POST /api/voice/state': async (body) => state(modelOf(body?.model)),
  'POST /api/voice/install': async (body) => install(modelOf(body?.model), !!body?.live),
  'POST /api/voice/remove': async () => remove(),
  'POST /api/voice/text': async (body) => text(modelOf(body?.model), body?.wav),
};

let stopEngines: () => Promise<void> = async () => {};
const onRemove = (f: () => Promise<void>) => void (stopEngines = f);
const ENGINE = { binDir, modelFile, liveDir, liveModelDir, sources, state, threads, EXE, SERVER_EXE, LIVE_EXE, WIN };

export { ENGINE, modelOf, onRemove, ROUTES };
