import { api } from '../base/model.ts';
import { icon } from '../base/icon.ts';
import { land, lift, onOutside } from '../base/lift.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { esc, quietly } from '../base/util.ts';

export type VoiceState = { os: boolean; ready: boolean; program: boolean; models: Record<string, { have: boolean; mb: number }>; live: { os: boolean; have: boolean; mb: number }; installing: boolean; got: number; total: number; error: string; bytes: number };
type Box = HTMLElement & { setRangeText(t: string, a: number, b: number): void; readonly selectionStart: number; readonly selectionEnd: number; value: string; focus(): void };

const MIC_TIP = 'Speak your message\nClick to start, click again to stop. Whisper turns it into text on this computer, so nothing you say leaves it.';
const LIVE_TIP = 'Speak your message\nClick and talk. Your words show up as you speak, and it stops by itself when you go quiet. Whisper then tidies each sentence, all on this computer, so nothing you say leaves it.';
const micTip = () => (pref('voice:live') ? LIVE_TIP : MIC_TIP);
export const micHtml = () => `<button type="button" class="ch-chip ch-mic" data-ch="mic" aria-label="speak your message" aria-pressed="false" title="${esc(micTip())}" data-tip-keys="micKey:start or stop"${pref('chat:mic') ? '' : ' hidden'}>${icon('mic')}</button>`;
export const MODEL_NAME: Record<string, string> = { base: 'Smaller and faster', small: 'More accurate' };

let state: VoiceState | null = null;
let poll = 0;
const model = () => (pref('voice:model') === 'base' ? 'base' : 'small');
const liveOn = () => !!pref('voice:live') && !!state?.live?.os;
const needLive = (s: VoiceState) => liveOn() && !s.live.have;
const mb = (n: number) => Math.round(n / 1e6);
export const voiceNow = () => state;

export async function loadVoice() {
  state = await quietly(api('POST', '/api/voice/state', { model: model() }), null);
  paint();
  return state;
}
function paint() {
  for (const b of document.querySelectorAll<HTMLElement>('.ch-mic')) b.classList.toggle('getting', !!state?.installing);
  paintAsk();
  page.renderSettings?.();
}
function watch() {
  clearInterval(poll);
  poll = setInterval(async () => {
    const was = state?.installing;
    await loadVoice();
    if (state?.installing) return;
    clearInterval(poll);
    if (was && state?.error) showAsk(null, 'failed');
    else if (was && state?.ready) closeAsk();
  }, 500) as unknown as number;
}
export async function voiceGet() {
  state = await api('POST', '/api/voice/install', { model: model(), live: liveOn() });
  paint();
  watch();
}
export async function voiceRemove() {
  try {
    await api('POST', '/api/voice/remove', {});
  } catch (e) {
    tell(document.querySelector('[data-voice-remove]'), { title: "Can't remove it now", line: String((e as Error).message || e), ms: 3000 });
  }
  await loadVoice();
}
onPref('voice:model', () => loadVoice());
onPref('voice:live', () => {
  for (const b of document.querySelectorAll<HTMLElement>('.ch-mic')) b.title = micTip();
  loadVoice();
});

let askEl: HTMLElement | null = null, askAt: HTMLElement | null = null, askBox: Box | null = null, askMode: 'ask' | 'failed' = 'ask', offAsk = () => {};
const sizeMb = () => {
  const s = state, m = s?.models[model()];
  if (s && s.ready && needLive(s)) return s.live.mb;
  return (m && !m.have ? m.mb : 0) + (s && !s.program ? 10 : 0) + (s && needLive(s) ? s.live.mb - (s.program ? 0 : 10) : 0) || m?.mb || 490;
};
function askHtml() {
  const s = state;
  if (s?.installing) {
    const pct = s.total ? Math.min(100, (100 * s.got) / s.total) : 0;
    return `<b>Downloading the speech model</b><span class="dim">${mb(s.got)} MB of ${s.total ? mb(s.total) + ' MB' : 'about ' + sizeMb() + ' MB'}. You can close this, it carries on.</span><div class="vk-bar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="vk-btns"><button type="button" class="vk-b" data-vk="close">Close</button></div>`;
  }
  if (askMode === 'failed') return `<b>The download didn't finish</b><span class="dim">${esc(s?.error || 'Nothing was installed.')} Nothing was installed.</span><div class="vk-btns"><button type="button" class="vk-b" data-vk="close">Not now</button><button type="button" class="vk-b on" data-vk="get">Try again</button></div>`;
  const addLive = !!s?.ready && needLive(s);
  return `<b>${addLive ? 'Download live text?' : 'Download the speech model?'}</b><span class="dim">${addLive ? `About ${sizeMb()} MB, once, so your words show up as you speak. Or turn off Show words as you speak in Settings, speech to text.` : `About ${sizeMb()} MB, once.`}</span><span class="vk-safe">${icon('sandbox')}<span>Runs on this computer. Works offline, and nothing you say leaves it.</span></span>` +
    `<button type="button" class="vk-tog" data-vk="more" aria-expanded="${askMore}">details<span aria-hidden="true">${askMore ? '▾' : '▸'}</span></button>${askMore ? MORE : ''}` +
    `<div class="vk-btns"><button type="button" class="vk-b" data-vk="close">Not now</button><button type="button" class="vk-b on" data-vk="get">Download</button></div>`;
}
let askMore = false;
const MORE = `<div class="vk-more"><span class="k">What</span><span>Whisper, free open speech recognition made by OpenAI, run by whisper.cpp, a free open source program.</span>` +
  `<span class="k">From</span><span>The model from <a href="https://huggingface.co/ggerganov/whisper.cpp" target="_blank">Hugging Face</a>, the biggest public library of open AI models. The program from <a href="https://github.com/ggml-org/whisper.cpp" target="_blank">GitHub</a>.</span>` +
  `<span class="k">Live text</span><span>sherpa-onnx, a free open source program from <a href="https://github.com/k2-fsa/sherpa-onnx" target="_blank">GitHub</a>, with NVIDIA's NeMo streaming English model (CC-BY-4.0). It writes words as you say them, and Whisper tidies each sentence.</span>` +
  `<span class="k">Checked</span><span>Amethyst knows each file's fingerprint in advance. A download that doesn't match is thrown away and nothing is installed.</span>` +
  `<span class="k">Kept in</span><span>Amethyst's own folder. Remove it any time in Settings, speech to text.</span></div>`;
function paintAsk() {
  if (askEl && !askEl.hidden) askEl.innerHTML = askHtml();
}
function showAsk(at: HTMLElement | null, mode: 'ask' | 'failed' = 'ask') {
  askMode = mode;
  at ||= askAt && askAt.isConnected ? askAt : null;
  if (!at) return tell(document.querySelector('.ch-mic:not([hidden])'), { title: "The speech model didn't download", line: state?.error || 'Click the mic to try again', ms: 4000 });
  askAt = at;
  if (!askEl) {
    askEl = Object.assign(document.createElement('div'), { className: 'ch-pop ch-vask', hidden: true });
    askEl.setAttribute('role', 'dialog');
    askEl.setAttribute('aria-label', 'speech model');
    askEl.addEventListener('click', (e) => {
      const v = (e.target as HTMLElement).closest<HTMLElement>('[data-vk]')?.dataset.vk;
      if (v === 'close') closeAsk(true);
      if (v === 'more') {
        askMore = !askMore;
        paintAsk();
        askEl?.querySelector<HTMLElement>('[data-vk="more"]')?.focus();
      }
      if (v === 'get') voiceGet().catch((err) => tell(askEl, { title: "Can't download it now", line: String(err.message || err), ms: 3000 }));
    });
    document.body.append(askEl);
  }
  askEl.innerHTML = askHtml();
  askEl.hidden = false;
  const box = () => at!.closest('.ch-box');
  const spot = () => {
    const x = box();
    if (!at!.checkVisibility() || !x?.checkVisibility()) return null;
    const r = at!.getBoundingClientRect(), B = x.getBoundingClientRect();
    return new DOMRect(r.left, B.top, r.width, B.height);
  };
  lift(askEl, spot, { side: 'up', align: 'end', stick: true, keep: box, away: () => closeAsk() });
  at.setAttribute('aria-expanded', 'true');
  askEl.querySelector<HTMLElement>('.vk-b.on, .vk-b')?.focus();
  offAsk();
  const off = onOutside([askEl, at], () => closeAsk());
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    closeAsk(true);
  };
  document.addEventListener('keydown', esc, true);
  offAsk = () => (off(), document.removeEventListener('keydown', esc, true));
}
function closeAsk(refocus = false) {
  if (!askEl || askEl.hidden) return;
  land(askEl);
  askEl.hidden = true;
  offAsk();
  offAsk = () => {};
  askAt?.setAttribute('aria-expanded', 'false');
  if (refocus && askBox?.isConnected) askBox.focus();
}

type Rec = { stop: () => Promise<Blob | null>; drop: () => void };
let rec: { btn: HTMLElement; r: Rec; box: Box; at: number } | null = null;
let working: HTMLElement | null = null;

async function record(onChunk?: (f: Float32Array) => void): Promise<Rec> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(onChunk ? 1024 : 4096, 1, 1), parts: Float32Array[] = [];
  node.onaudioprocess = (e) => {
    const f = new Float32Array(e.inputBuffer.getChannelData(0));
    if (onChunk) onChunk(f);
    else parts.push(f);
  };
  src.connect(node);
  node.connect(ctx.destination);
  const end = () => {
    node.disconnect();
    src.disconnect();
    for (const t of stream.getTracks()) t.stop();
    ctx.close().catch(() => {});
  };
  return {
    stop: async () => {
      end();
      const n = parts.reduce((a, p) => a + p.length, 0);
      return n < ctx.sampleRate * 0.3 ? null : wav(parts, n, ctx.sampleRate);
    },
    drop: end,
  };
}
function wav(parts: Float32Array[], n: number, rate: number) {
  const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  let o = 44;
  for (const p of parts)
    for (const x of p) {
      const c = Math.max(-1, Math.min(1, x));
      v.setInt16(o, c < 0 ? c * 0x8000 : c * 0x7fff, true);
      o += 2;
    }
  return new Blob([buf], { type: 'audio/wav' });
}
const b64 = (b: Blob) => b.arrayBuffer().then((a) => {
  const u = new Uint8Array(a);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
});

function lit(btn: HTMLElement, on: boolean) {
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', String(on));
}
function micError(btn: HTMLElement, e: unknown) {
  const name = (e as DOMException)?.name;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return tell(btn, { title: 'No microphone found', line: 'Plug one in, then click the mic again', ms: 3500 });
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return tell(btn, { title: 'The microphone is blocked', line: navigator.platform.startsWith('Win') ? 'Turn on microphone access for desktop apps in Windows Settings, Privacy and security, Microphone' : 'Allow Amethyst to use the microphone in your system settings', ms: 5000 });
  if (name === 'NotReadableError') return tell(btn, { title: "Can't use the microphone", line: 'Another program may be using it', ms: 3500 });
  tell(btn, { title: "Can't record", line: String((e as Error)?.message || e), ms: 3500 });
}

function put(box: Box, at: number, text: string) {
  const v = box.value, i = Math.min(at, v.length);
  const before = i > 0 && !/\s/.test(v[i - 1]) ? ' ' : '', after = i < v.length && !/\s/.test(v[i]) ? ' ' : '';
  box.focus();
  box.setRangeText(before + text + after, i, i);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

async function finish(btn: HTMLElement, box: Box, at: number, r: Rec) {
  lit(btn, false);
  btn.classList.add('busy');
  working = btn;
  try {
    const blob = await r.stop();
    if (!blob) return;
    const { text } = await api('POST', '/api/voice/text', { model: model(), wav: await b64(blob) });
    if (text && btn.isConnected) put(box, at, String(text));
    else if (!text) tell(btn, { title: "Didn't hear any words", line: 'Click the mic and speak, then click it again', ms: 2500 });
  } catch (e) {
    tell(btn, { title: "Can't turn it into text", line: String((e as Error).message || e), ms: 3500 });
  } finally {
    btn.classList.remove('busy');
    working = null;
  }
}

type Live = { btn: HTMLElement; box: Box; at: number; ins: string; own: string; text: string; id: string; r: Rec | null; queue: Int16Array[]; busy: boolean; stopping: boolean; t0: number; changed: number; loud: number; floor: number; off: () => void };
let live: Live | null = null;
const QUIET_MS = 2000, QUIET_NOISY_MS = 4000, NOTHING_MS = 8000;

const pcmOf = (f: Float32Array) => Int16Array.from(f, (x) => {
  const c = Math.max(-1, Math.min(1, x));
  return c < 0 ? c * 0x8000 : c * 0x7fff;
});
function b64pcm(parts: Int16Array[]) {
  const n = parts.reduce((a, p) => a + p.length, 0), all = new Int16Array(n);
  let o = 0;
  for (const p of parts) all.set(p, (o += p.length) - p.length);
  const u = new Uint8Array(all.buffer);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

const ours = (L: Live) => L.box.value.slice(L.at, L.at + L.ins.length) === L.ins;
function show(L: Live, sentences: { text: string }[]) {
  const t = sentences.map((x) => x.text.trim()).filter(Boolean).join(' ');
  if (t === L.text || !ours(L)) return;
  const box = L.box, v = box.value, a = L.at, b = L.at + L.ins.length;
  const before = t && a > 0 && !/\s/.test(v[a - 1]) ? ' ' : '', after = t && b < v.length && !/\s/.test(v[b]) ? ' ' : '';
  const ins = t ? before + t + after : '';
  const focused = document.activeElement === box;
  L.ins = ins;
  L.text = t;
  L.changed = Date.now();
  L.own = v.slice(0, a) + ins + v.slice(b);
  box.setRangeText(ins, a, b);
  if (focused) (box as unknown as HTMLTextAreaElement).setSelectionRange?.(a + before.length + t.length, a + before.length + t.length);
  box.dispatchEvent(new Event('input', { bubbles: true }));
}

async function pump(L: Live) {
  if (L.busy || !L.id) return;
  L.busy = true;
  try {
    while (L.queue.length && live === L && !L.stopping) {
      const r = await api('POST', '/api/voice/live/feed', { id: L.id, pcm: b64pcm(L.queue.splice(0)) });
      if (live === L && !L.stopping) show(L, r.sentences || []);
    }
  } catch (e) {
    if (live === L && !L.stopping) {
      tell(L.btn, { title: "Can't turn it into text", line: String((e as Error).message || e), ms: 3500 });
      endLive(L, false);
    }
  } finally {
    L.busy = false;
  }
}

function hear(L: Live, f: Float32Array) {
  if (L.stopping) return;
  let sum = 0;
  for (const x of f) sum += x * x;
  const rms = Math.sqrt(sum / f.length), now = Date.now();
  L.floor = rms < L.floor ? rms : L.floor * 0.995 + rms * 0.005;
  if (rms > Math.max(0.012, L.floor * 2.5)) L.loud = now;
  L.queue.push(pcmOf(f));
  pump(L);
  if (!L.text && now - L.t0 > NOTHING_MS) return endLive(L, true);
  if (L.text && now - L.changed > QUIET_MS && (now - L.loud > QUIET_MS * 0.6 || now - L.changed > QUIET_NOISY_MS)) endLive(L, true);
}

async function endLive(L: Live, keep: boolean) {
  if (L.stopping) return;
  L.stopping = true;
  L.r?.drop();
  L.off();
  lit(L.btn, false);
  if (!keep || !L.id) {
    if (live === L) live = null;
    if (L.id) quietly(api('POST', '/api/voice/live/stop', { id: L.id }), null);
    return;
  }
  L.btn.classList.add('busy');
  working = L.btn;
  try {
    while (L.busy) await new Promise((r) => setTimeout(r, 20));
    if (L.queue.length) await quietly(api('POST', '/api/voice/live/feed', { id: L.id, pcm: b64pcm(L.queue.splice(0)) }), null);
    const r = await api('POST', '/api/voice/live/stop', { id: L.id });
    if (L.btn.isConnected) show(L, r.sentences || []);
    if (!L.text) tell(L.btn, { title: "Didn't hear any words", line: 'Click the mic and speak', ms: 2500 });
  } catch (e) {
    tell(L.btn, { title: "Can't turn it into text", line: String((e as Error).message || e), ms: 3500 });
  } finally {
    L.btn.classList.remove('busy');
    working = null;
    if (live === L) live = null;
  }
}

async function startLive(btn: HTMLElement, box: Box) {
  const at = box.selectionStart ?? box.value.length, now = Date.now();
  const L: Live = { btn, box, at, ins: '', own: box.value, text: '', id: '', r: null, queue: [], busy: false, stopping: false, t0: now, changed: now, loud: 0, floor: 1, off: () => {} };
  try {
    L.r = await record((f) => hear(L, f));
  } catch (e) {
    return micError(btn, e);
  }
  live = L;
  lit(btn, true);
  const typed = (e: Event) => {
    const v = L.box.value;
    if (v === L.own) return;
    const d = v.length - L.own.length, end = L.at + L.ins.length;
    if (d > 0 && v.slice(L.at + d, end + d) === L.ins && v.slice(end + d) === L.own.slice(end)) L.at += d;
    endLive(L, true);
  };
  box.addEventListener('input', typed);
  L.off = () => box.removeEventListener('input', typed);
  try {
    const { id } = await api('POST', '/api/voice/live/start', { model: model() });
    L.id = id;
    if (L.stopping) return void quietly(api('POST', '/api/voice/live/stop', { id }), null);
    L.t0 = L.changed = Date.now();
    pump(L);
  } catch (e) {
    if (live !== L) return;
    tell(btn, { title: "Can't start live text", line: String((e as Error).message || e), ms: 4000 });
    endLive(L, false);
  }
}

export async function micClick(btn: HTMLElement, box: Box) {
  if (working) return;
  if (live) {
    const L = live;
    if (L.btn === btn) return endLive(L, true);
    endLive(L, false);
  }
  if (rec) {
    const { r, btn: was, box: bx, at } = rec;
    rec = null;
    if (was !== btn) {
      r.drop();
      lit(was, false);
    } else return finish(btn, bx, at, r);
  }
  if (askEl && !askEl.hidden && askAt === btn) return closeAsk(true);
  const s = state && !state.installing ? state : await loadVoice();
  if (!s) return tell(btn, { title: "Can't reach speech to text", line: 'Try again in a moment', ms: 2500 });
  if (!s.os) return tell(btn, { title: 'Speech to text is not on this system yet', line: 'It works on Windows and Linux', ms: 3000 });
  if (s.installing || !s.ready || needLive(s)) {
    askBox = box;
    return showAsk(btn);
  }
  if (liveOn()) return startLive(btn, box);
  const at = box.selectionStart ?? box.value.length;
  try {
    const r = await record();
    rec = { btn, r, box, at };
    lit(btn, true);
  } catch (e) {
    micError(btn, e);
  }
}

function dropRec() {
  if (live) endLive(live, false);
  if (!rec) return;
  rec.r.drop();
  lit(rec.btn, false);
  rec = null;
}
onPref('chat:mic', () => {
  const on = !!pref('chat:mic');
  for (const b of document.querySelectorAll<HTMLElement>('.ch-mic')) b.hidden = !on;
  if (!on) {
    dropRec();
    closeAsk();
  }
});
