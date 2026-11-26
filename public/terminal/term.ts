import { BINDS, bound, howOf, is } from '../base/binds.ts';
import { editSource } from '../base/editmenu.ts';
import { span } from '../base/hitch.ts';
import { api, modeOfFn, S, seenWhenPicked } from '../base/model.ts';
import { selHide, selShow } from '../base/quote.ts';
import { follow as stream } from '../base/stream.ts';
import { esc, onSelEnd, quietly, showErr } from '../base/util.ts';
import { onSize } from '../base/measure.ts';
import type { Sizes } from '../base/measure.ts';
import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

const SHELL = ['files', 'commands', 'openFile', 'settings', 'newWindowKey', 'newForget', 'refreshBrowser', 'find', 'save', 'undo', 'redo', 'windowKey', 'quoteKey', 'modeKey', 'modelNextKey', 'modelPrevKey', 'fireGo', 'newChatN', 'newAgentKey'];
const APP = BINDS.map(([id]) => id).filter((id) => !SHELL.includes(id) && !id.startsWith('model.'));
const passes = (e: KeyboardEvent, id: string) => is(e, id) && (howOf(id) !== 'plain' || /^(ctrl|alt)\+./.test(bound(id)));

type Lib = { Terminal: typeof import('@xterm/xterm').Terminal; FitAddon: typeof import('@xterm/addon-fit').FitAddon };
let lib: Promise<Lib> | null = null;
function load() {
  if (!lib) {
    if (!document.querySelector('link[href="/vendor/xterm.css"]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/vendor/xterm.css';
      document.head.append(css);
    }
    lib = Promise.all([import('/vendor/xterm.mjs'), import('/vendor/addon-fit.mjs')]).then(([x, f]) => ({ Terminal: x.Terminal, FitAddon: f.FitAddon }));
    lib.catch(() => (lib = null));
  }
  return lib;
}
export function warmTerm() {
  void load();
}

const css = (k: string) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
const themeOf = () => ({ background: css('--bg'), foreground: css('--text'), cursor: css('--accent'), cursorAccent: css('--bg'), selectionBackground: css('--accent') + '55' });
const shown = new Set<import('@xterm/xterm').Terminal>(), fits = new Map<import('@xterm/xterm').Terminal, (x?: boolean) => void>();
const fontOf = () => ({ fontFamily: css('--mono') || 'Consolas, monospace', fontSize: parseFloat(css('--code-size')) || 13 });
new MutationObserver(() =>
  shown.forEach((x) => {
    x.options.theme = themeOf();
    const f = fontOf();
    if (x.options.fontFamily !== f.fontFamily || x.options.fontSize !== f.fontSize) {
      Object.assign(x.options, f);
      fits.get(x)?.(true);
    }
  }),
).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-look'] });

export function createTerm(agent: { id?: string | null; program?: string | null; quick?: boolean; pid?: string; wid?: string }, { started = () => {}, ended = () => {} }: { started?: (...a: any[]) => void; ended?: (...a: any[]) => void } = {}) {
  const el = document.createElement('div');
  el.className = 'term';
  el.innerHTML = `<div class="tm-screen"></div><p class="tm-note" hidden></p>`;
  const screen = el.firstElementChild as HTMLElement, note = el.lastElementChild as HTMLElement;
  let id: string | null = agent.id || null, term: Terminal | null = null, fit: FitAddon | null = null, unfollow: (() => void) | null = null, ro: Sizes | null = null, gone = false, dead = false;
  let replaying = false;
  let up = { x: 0, y: 0, top: 0 };
  const sel = {
    el: screen,
    get: () => (term?.hasSelection() && term.getSelection().trim() ? { text: term.getSelection().replace(/[ \t]+$/gm, ''), from: 'terminal' } : null),
    at: () => up,
    clear: () => term?.clearSelection(),
  };
  const seen = seenWhenPicked(el, () => id);
  const say = (html: string, cls = '') => {
    note.innerHTML = html;
    note.className = 'tm-note ' + cls;
    note.hidden = !html;
  };
  const over = (why: string) => {
    gone = true;
    term?.write(`\r\n\x1b[2m[${why}]\x1b[0m\r\n`);
    ended();
  };

  let queue = '', sending = false;
  async function pump() {
    if (sending || !queue || !id || gone) return;
    sending = true;
    const data = queue;
    queue = '';
    try {
      await api('POST', '/api/term/send', { id, data });
    } catch (e: any) {
      if (e.status === 404 || e.status === 410) over('this terminal has ended');
      else say(esc(e.message), 'err');
    }
    sending = false;
    pump();
  }

  let sized = '', sizeTimer = 0;
  function fitNow(redraw = false) {
    if (!term || !el.isConnected || screen.clientWidth < 40 || screen.clientHeight < 30) return;
    try {
      span('term.fit', () => fit!.fit());
    } catch {}
    const s = `${term.cols}x${term.rows}`;
    if (s === sized && !redraw) return;
    sized = s;
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(() => id && !gone && quietly(api('POST', '/api/term/send', { id, cols: term!.cols, rows: term!.rows, redraw })), redraw ? 0 : 80);
  }

  function follow() {
    unfollow?.();
    let first = true;
    replaying = true;
    const again = () => {
      term?.reset();
      first = replaying = true;
    };
    unfollow = stream({ term: id }, (ev) => {
      if (!term) return;
      if (ev.type === 'out') term.write(ev.data);
      else if (ev.type === 'status') {
        if (ev.status === 'done') seen.due();
        if (first) {
          term.write('', () => (replaying = false));
          fitNow(true);
        }
        first = false;
      } else if (ev.type === 'exit') {
        unfollow?.();
        over(ev.gone ? 'this terminal has ended' : `exited${ev.code ? ` (${ev.code})` : ''}`);
      }
    }, { again });
  }

  const early = !id
    ? api('POST', '/api/term', { program: agent.program || 'shell', cols: 80, rows: 24, quick: !!agent.quick }, agent.pid ?? S.pid, agent.wid ?? S.wid).then(
        (r) => {
          if (dead) return void quietly(api('DELETE', '/api/term?id=' + encodeURIComponent(r.id), {}));
          id = r.id;
          started(id, r.name);
          if (term) {
            follow();
            fitNow(true);
          }
        },
        (e: any) => {
          gone = true;
          say(esc(e.message), 'err');
          ended();
        },
      )
    : null;

  function keys(e: KeyboardEvent) {
    if (e.type !== 'keydown') return true;
    const k = e.key.toLowerCase();
    if (e.ctrlKey && !e.altKey && !e.shiftKey && k === 'c' && term!.hasSelection()) {
      navigator.clipboard?.writeText(term!.getSelection());
      term!.clearSelection();
      return false;
    }
    if (e.ctrlKey && !e.altKey && k === 'v') return false;
    if (modeOfFn(e.key) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return false;
    if (!e.ctrlKey && !e.altKey && !e.metaKey) return true;
    return !APP.some((id) => passes(e, id));
  }

  load().then(
    ({ Terminal, FitAddon }) => {
      if (dead) return;
      term = new Terminal({ ...fontOf(), lineHeight: 1.15, cursorBlink: true, scrollback: 5000, minimumContrastRatio: 3, theme: themeOf() });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(screen);
      shown.add(term);
      fits.set(term, fitNow);
      term.attachCustomKeyEventHandler(keys);
      editSource(screen, { name: 'terminal', text: () => (term!.hasSelection() ? term!.getSelection().replace(/[ \t]+$/gm, '') : ''), paste: true, focus: () => term!.focus(), selectAll: () => term!.selectAll() });
      onSelEnd(screen, (e) => {
        up = { x: e.clientX, y: e.clientY + 6, top: e.clientY - 6 };
        setTimeout(() => selShow(sel), 0);
      });
      screen.addEventListener('focusout', () => setTimeout(() => !screen.contains(document.activeElement) && selHide(sel), 0));
      term!.onSelectionChange(() => !term!.hasSelection() && selHide(sel));
      term.onData((d) => {
        if (replaying) return;
        queue += d;
        pump();
      });
      ro = onSize(screen, {
        name: 'term.fit',
        read: () => (term && el.isConnected && screen.clientWidth >= 40 && screen.clientHeight >= 30 ? fit!.proposeDimensions() : undefined),
        write: (d: { cols: number; rows: number } | undefined) => d && (d.cols !== term!.cols || d.rows !== term!.rows || `${d.cols}x${d.rows}` !== sized) && fitNow(),
      });
      fitNow();
      if (id) follow();
      else void early;
    },
    (e) => say(`The terminal could not load (${esc(e.message)}). Run <code>npm install</code> in the Amethyst folder, then start Amethyst again.`, 'err'),
  );

  function detach() {
    dead = true;
    selHide(sel);
    unfollow?.();
    ro?.disconnect();
    seen.stop();
    clearTimeout(sizeTimer);
    if (term) {
      shown.delete(term);
      fits.delete(term);
      term.dispose();
      term = null;
    }
  }
  return {
    el,
    get id() {
      return id;
    },
    focus() {
      term?.focus();
    },
    detach,
    stop() {
      detach();
      if (id && !gone) api('DELETE', '/api/term?id=' + encodeURIComponent(id), {}).catch(showErr);
    },
  };
}
