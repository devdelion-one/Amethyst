import { setPref } from '../base/prefs.ts';
import { esc } from '../base/util.ts';
import { acts, changed, D, fold, frameText, stopped } from './state.ts';

export type Card = { key: string; line: number; dom: () => HTMLElement };

const STOP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 14.5 13.5h-13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="11.6" r=".9" fill="currentColor"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3.5" width="2.6" height="9" rx=".8" fill="currentColor"/><rect x="9.4" y="3.5" width="2.6" height="9" rx=".8" fill="currentColor"/></svg>';

const stackText = (n = 40) => D.frames.slice(0, n).map(frameText).join('\n');
const btn = (k: string, label: string, cls = 'outline') => `<button class="${cls}" data-c="${k}">${label}</button>`;

function build(key: string, cls: string, icon: string, title: string, body: string, buttons: string, ask: string) {
  const el = document.createElement('div');
  el.className = `dbg-card ${cls}`;
  el.innerHTML = `<div class="bh">${icon}<b>${title}</b><button class="x" data-c="x" title="Hide&#10;Hides this note on why it stopped. The program stays stopped." data-tip-keys="=esc:hide" aria-label="hide">×</button></div>${body ? `<div class="bd">${body}</div>` : ''}<div class="ba">${buttons}</div>`;
  el.addEventListener('mousedown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (!k) return;
    if (k === 'x') return (D.cardShut = key), changed('card');
    if (k === 'go') return acts.go();
    if (k === 'stop') return acts.stop();
    if (k === 'copy') return navigator.clipboard.writeText(stackText());
    if (k === 'ask') return acts.ask(ask);
    if (k === 'undata') return acts.unwatch(D.session?.stop?.change?.name || '');
    if (k === 'noensure') return setPref('debug:ensure', false), acts.go();
    if (k === 'mine') {
      const i = D.session?.stop?.mine ?? -1;
      if (i < 0) return;
      D.frame = i;
      changed('frame');
      return acts.openFrame(D.frames[i]);
    }
  });
  return el;
}

export function cardFor(abs: string): Card | null {
  const st = D.session?.stop;
  if (!stopped() || !st || !abs) return null;
  const w = st.where;
  if (!w || !w.file || fold(w.file) !== fold(abs)) return null;
  const top = D.frames[0];
  const pausedInEngine = st.reason === 'pause' && !!top && top.lib && st.mine > 0;
  const kind = st.reason === 'exception' ? st.kind || 'crash' : st.kind === 'data' ? 'data' : pausedInEngine ? 'engine' : '';
  if (!kind) return null;
  const key = `${st.at}:${kind}`;
  if (D.cardShut === key) return null;
  const code = st.line ? `<code>${esc(st.line)}</code>` : '';
  const ask = (title: string) => `The program stopped in the debugger: ${title}.\n${st.exception?.text ? st.exception.text + '\n' : ''}At ${w.file}:${w.line}${st.line ? `: ${st.line}` : ''}\n\nStack:\n${stackText(15)}`;
  const common = btn('ask', 'ask the agent') + btn('copy', 'copy the stack');
  let card: [string, string, string, string, string, string];
  if (kind === 'crash') {
    const nulls = st.nulls.length ? `<p>Likely null: ${st.nulls.map((n) => `<code>${esc(n)}</code>`).join(', ')}</p>` : '';
    const title = `Crash: ${st.exception?.text || 'an exception'}`;
    card = ['crash', STOP, esc(title), `${nulls}<p>in <span class="m">${esc(w.name)}</span></p>`, common + btn('stop', 'stop'), ask(title)];
  } else if (kind === 'check') {
    card = ['crash', STOP, 'check() failed', `${code}<p>The engine's assert frames are folded; this is your frame.</p>`, common + btn('stop', 'stop'), ask('a check() failed')];
  } else if (kind === 'ensure') {
    card = ['warn', STOP, 'ensure() failed', `${code}<p>The program can go on: an ensure only reports.</p>`, btn('go', 'continue', 'primary') + btn('noensure', "don't stop on ensures") + common, ask('an ensure() failed')];
  } else if (kind === 'data') {
    const c = st.change;
    card = ['warn', PAUSE, esc(`${c?.name || 'it'} changed`), `<code>${esc(c?.old || '?')} → ${esc(c?.now || '?')}</code><p>This line wrote it.</p>`, btn('go', 'continue', 'primary') + btn('undata', 'stop watching it') + btn('copy', 'copy the stack'), ask(`${c?.name} changed`)];
  } else if (kind === 'break') {
    card = ['warn', PAUSE, 'Stopped at a __debugbreak()', code, btn('go', 'continue', 'primary') + common, ask('a __debugbreak() was hit')];
  } else {
    const n = st.mine;
    card = ['quiet', PAUSE, 'Paused in engine code', `<p>${n} engine frame${n === 1 ? '' : 's'} above your code.</p>`, btn('mine', 'go to your code', 'primary') + btn('copy', 'copy the stack'), ask('paused')];
  }
  const [cls, icon, title, body, buttons, text] = card;
  return { key, line: w.line, dom: () => build(key, cls, icon, title, body, buttons, text) };
}
