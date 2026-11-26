import fs from 'fs';
import path from 'path';
import { relOf } from './store.ts';

type Msg = Record<string, any>;

const fnOf = (f: Msg) => String(f.name || '?').replace(/\+0x[0-9a-f]+$/i, '');

const REASON: Record<string, string> = { breakpoint: 'at a breakpoint', step: 'after a step', pause: 'paused', goto: 'moved', cursor: 'ran to the cursor', entry: 'at the start', 'function breakpoint': 'at a function breakpoint', 'data breakpoint': 'a value changed' };
const KIND: Record<string, string> = { crash: 'crashed', check: 'check() failed', ensure: 'ensure() failed', break: 'hit a __debugbreak', data: 'a value changed' };

function codeLine(file: string, n: number) {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/)[n - 1]?.trim().slice(0, 200) || '';
  } catch {
    return '';
  }
}

export const placeOf = (root: string, f: Msg | null | undefined, short = false) => {
  if (!f) return '';
  if (f.bp) return `Blueprint ${f.blueprint}${f.fn ? ` · ${f.fn}` : ''}`;
  if (!f.file) return `${f.module ? f.module + '!' : ''}${fnOf(f)} (no source)`;
  return `${short ? path.basename(f.file) : relOf(root, f.file)}:${f.line}`;
};

export function sayState(root: string, s: Msg | null, bps: Msg[] = []) {
  const nBps = bps.length ? ` ${bps.length} breakpoint${bps.length === 1 ? '' : 's'} set (debug break --list).` : '';
  if (!s) return `not debugging. debug start starts Unreal Editor under the debugger (or attaches to the open one); --game the game.${nBps}`;
  const by = (x: string) => (x === 'agent' ? ' (by an agent)' : '');
  const how = s.mode === 'attach' ? 'attached' : 'launched';
  if (s.state === 'building') return `${s.note || 'building'}, then ${s.name} starts under the debugger. debug wait returns when it stops or ends.`;
  if (s.state === 'starting') return `starting ${s.name} under the debugger…`;
  if (s.state === 'running') return `running · ${s.name} (${how}${s.pid ? `, pid ${s.pid}` : ''})${by(s.by)}. debug wait returns at the next stop; debug pause stops it now.${nBps}`;
  if (s.state === 'ended') {
    const e = s.ended || {};
    const why = e.why === 'detached' ? 'detached: the program keeps running' : e.why === 'ended' ? 'the program was ended' : e.why === 'exited' ? `the program exited${e.code != null ? ` (exit code ${e.code})` : ''}` : String(e.why || 'ended');
    return `not debugging any more: ${why}.`;
  }
  if (s.state !== 'stopped' || !s.stop) return `${s.state} · ${s.name}`;
  const st = s.stop, w = st.where;
  let what = st.kind && KIND[st.kind] ? KIND[st.kind] : REASON[st.reason] || (st.reason === 'exception' ? 'stopped on an exception' : st.reason);
  if (st.kind === 'data' && st.change) what = `changed · ${st.change.name}: ${st.change.old || '?'} → ${st.change.now || '?'}`;
  if (st.reason === 'goto' && w) what = `moved to line ${w.line}`;
  const lines = [`stopped ${/^(at|after) /.test(what) ? what : `· ${what}`} · ${placeOf(root, w)}${by(st.by)}`];
  if (st.exception?.text && st.kind !== 'data') lines.push(`  ${st.exception.text.split('\n')[0].slice(0, 300)}`);
  if (w && !w.bp) {
    const code = w.source ? st.line || codeLine(w.file, w.line) : '';
    lines.push(`  in ${fnOf(w)}${code ? `: ${code}` : ''}`);
  }
  if (st.nulls?.length) lines.push(`  likely null: ${st.nulls.join(', ')}`);
  lines.push(`  ${s.name} (${how}). debug stack, debug vars, debug eval <expr>; then debug continue or debug step.`);
  return lines.join('\n');
}

export function sayStack(root: string, frames: Msg[], all = false) {
  if (!frames.length) return 'no frames on this thread';
  const out: string[] = [];
  const label = (f: Msg) => (f.bp ? `[Blueprint] ${f.blueprint}${f.fn ? ` · ${f.fn}` : ''}${f.object ? `  (${f.object})` : ''}` : `${fnOf(f)}  ${f.file ? `${placeOf(root, f, true)}${f.lib ? '  (engine)' : ''}` : `${f.module ? f.module + ', ' : ''}no source`}`);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    let j = i;
    while (!all && j < frames.length && frames[j].lib && !frames[j].bp) j++;
    if (j - i >= 4) {
      out.push(`#${i}–#${j - 1}  ${j - i} engine frames (debug stack --all shows them)`);
      i = j - 1;
      continue;
    }
    out.push(`#${i} ${label(f)}`);
  }
  return out.join('\n');
}

const varLine = (v: Msg, pad: string) => `${pad}${v.name} = ${v.value}${v.type ? `  · ${v.type}` : ''}${v.ref && !v.children ? '  {…}' : ''}`;
export function sayVars(list: Msg[], pad = '  '): string[] {
  const out: string[] = [];
  for (const v of list) {
    out.push(varLine(v, pad));
    if (v.children?.length) out.push(...sayVars(v.children, pad + '  '));
  }
  return out;
}

export function sayScopes(scopes: Msg[], frame: string) {
  const out = [`variables of ${frame}:`];
  for (const sc of scopes) {
    out.push(sc.name);
    out.push(...(sc.vars?.length ? sayVars(sc.vars) : ['  (none)']));
  }
  out.push('{…} opens with a larger --depth (at most 4), or debug eval <name>.');
  return out.join('\n');
}

export function sayBps(root: string, bps: Msg[]) {
  if (!bps.length) return 'no breakpoints. debug break <file:line> sets one.';
  const rows = bps.map((b) => {
    const l = b.live, bits: string[] = [];
    if (b.cond) bits.push(`if ${b.cond}`);
    if (b.off) bits.push('off');
    else if (l) bits.push(l.verified ? 'bound' : l.pending ? 'waiting for its module to load' : l.why ? `not bound: ${l.why}` : 'not bound');
    if (l?.hits) bits.push(`${l.hits} hit${l.hits === 1 ? '' : 's'}`);
    if (b.by === 'agent') bits.push('set by an agent');
    return `  ${relOf(root, b.abs || b.file)}:${b.line}${bits.length ? '  ' + bits.join(' · ') : ''}`;
  });
  return `${bps.length} breakpoint${bps.length === 1 ? '' : 's'}:\n${rows.join('\n')}`;
}
