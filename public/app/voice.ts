import { api } from '../base/model.ts';
import { icon } from '../base/icon.ts';
import { land, lift, onOutside } from '../base/lift.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { onPref, pref } from '../base/prefs.ts';
import { esc, quietly } from '../base/util.ts';

export type VoiceState = { os: boolean; ready: boolean; program: boolean; models: Record<string, { have: boolean; mb: number }>; installing: boolean; got: number; total: number; error: string; bytes: number };
type Box = HTMLElement & { setRangeText(t: string, a: number, b: number): void; readonly selectionStart: number; readonly selectionEnd: number; value: string; focus(): void };

const MIC_TIP = 'Speak your message\nClick to start, click again to stop. Whisper turns it into text on this computer, so nothing you say leaves it.';
export const micHtml = () => `<button type="button" class="ch-chip ch-mic" data-ch="mic" aria-label="speak your message" aria-pressed="false" title="${esc(MIC_TIP)}" data-tip-keys="micKey:start or stop"${pref('chat:mic') ? '' : ' hidden'}>${icon('mic')}</button>`;
export const MODEL_NAME: Record<string, string> = { base: 'Smaller and faster', small: 'More accurate' };

let state: VoiceState | null = null;
let poll = 0;
const model = () => (pref('voice:model') === 'base' ? 'base' : 'small');
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
  state = await api('POST', '/api/voice/install', { model: model() });
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

let askEl: HTMLElement | null = null, askAt: HTMLElement | null = null, askBox: Box | null = null, askMode: 'ask' | 'failed' = 'ask', offAsk = () => {};
const sizeMb = () => {
  const s = state, m = s?.models[model()];
  return (m && !m.have ? m.mb : 0) + (s && !s.program ? 10 : 0) || m?.mb || 490;
};
function askHtml() {
  const s = state;
  if (s?.installing) {
    const pct = s.total ? Math.min(100, (100 * s.got) / s.total) : 0;
    return `<b>Downloading the speech model</b><span class="dim">${mb(s.got)} MB of ${s.total ? mb(s.total) + ' MB' : 'about ' + sizeMb() + ' MB'}. You can close this, it carries on.</span><div class="vk-bar"><i style="width:${pct.toFixed(1)}%"></i></div><div class="vk-btns"><button type="button" class="chip" data-vk="close">Close</button></div>`;
  }
  if (askMode === 'failed') return `<b>The download didn't finish</b><span class="dim">${esc(s?.error || 'Nothing was installed.')} Nothing was installed.</span><div class="vk-btns"><button type="button" class="chip" data-vk="close">Not now</button><button type="button" class="chip on" data-vk="get">Try again</button></div>`;
  return `<b>Download the speech model?</b><span class="dim">About ${sizeMb()} MB, once, from Hugging Face. Then speech turns into text on this computer, offline.</span><div class="vk-btns"><button type="button" class="chip" data-vk="close">Not now</button><button type="button" class="chip on" data-vk="get">Download</button></div>`;
}
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
  lift(askEl, spot, { side: 'up', align: 'end', keep: box, away: () => closeAsk() });
  at.setAttribute('aria-expanded', 'true');
  askEl.querySelector<HTMLElement>('.chip.on, .chip')?.focus();
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

async function record(): Promise<Rec> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1), parts: Float32Array[] = [];
  node.onaudioprocess = (e) => parts.push(new Float32Array(e.inputBuffer.getChannelData(0)));
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

export async function micClick(btn: HTMLElement, box: Box) {
  if (working) return;
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
  if (s.installing || !s.ready) {
    askBox = box;
    return showAsk(btn);
  }
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
