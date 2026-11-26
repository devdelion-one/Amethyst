import { every } from './life.ts';
import { gem, workGem } from './kinds.ts';
import { agentName, esc, store } from './util.ts';
import { crystalOf } from './codes.ts';
import { ask } from './controls.ts';
export { crystalOf };
const STILL: Record<string, string> = { idle: gem('ai'), ended: gem('ai'), done: '✓' };
const VERBS = ['Amethystying', 'Clauding', 'Deciphering', 'Pondering', 'Conjuring', 'Crystallizing', 'Faceting', 'Polishing', 'Brewing', 'Musing', 'Mulling', 'Scheming', 'Weaving', 'Distilling'];
const still = matchMedia('(prefers-reduced-motion: reduce)');
let verb = 'Working', spin: (() => void) | null = null;
export const spark = (st: string) => {
  if (!STILL[st] && !still.matches) spin ||= every(3120, tick);
  return `<i class="dk-spk" data-st="${st}">${STILL[st] || (st === 'asks' ? gem('ai') : workGem())}</i>`;
};
export const clearedOf = (chat: string) => new Set<string>(store.get('subagents:cleared', {})[chat] || []);
const clearWatch = new Set<() => void>();
export const onCleared = (fn: () => void) => (clearWatch.add(fn), () => void clearWatch.delete(fn));
addEventListener('storage', (e) => e.key === 'mind.subagents:cleared' && clearWatch.forEach((fn) => fn()));
export function setCleared(chat: string, ids: Iterable<string>) {
  const all = store.get('subagents:cleared', {});
  store.set('subagents:cleared', { ...all, [chat]: [...ids] });
  clearWatch.forEach((fn) => fn());
}
export const workVerb = () => verb;
const rest = () => (spin!(), (spin = null));
function tick() {
  if (still.matches || !document.querySelector('.dk-spk:is([data-st="working"], [data-st="asks"])')) return rest();
  let v: string;
  do v = VERBS[Math.floor(Math.random() * VERBS.length)]; while (v === verb);
  verb = v;
  for (const e of document.querySelectorAll('.dk-wd')) if (e.textContent !== verb + '…') e.textContent = verb + '…';
}
export const groupOf = (a: { status?: string }) => (a.status === 'starting' ? 'working' : a.status === 'ended' ? 'idle' : a.status as string);
export const markOf = (a: { kind: string }) => gem(a.kind === 'term' ? 'term' : 'ai');
export const stepWord = (step: string | undefined, program?: string) => (step === 'making' ? 'making the worktree…' : step === 'starting' ? `starting ${agentName(program)} in it…` : '');
export const providerOf = (a: { kind: string; program?: string }) => (a.kind === 'chat' ? agentName(a.program) : a.program || 'terminal');
export const codeOf = (id: string, title = '', tip = true) => `<span class="dk-code">${crystalOf(id).code}</span>`;
export const titleOf = (a: { kind: string; title?: string; program?: string }) => a.title || providerOf(a);
export function addClosed(a: { kind: string; title?: string; program?: string; session?: string | null; pid?: string | null }) {
  if (a.kind !== 'chat' || !a.session) return;
  const rest = store.get('deck:closed', []).filter((c: { session: string }) => c.session !== a.session);
  store.set('deck:closed', [{ session: a.session, title: titleOf(a), pid: a.pid || '', program: a.program, at: Date.now() }, ...rest].slice(0, 100));
}
export const stillAt = (a: { status?: string } | null | undefined) => ({ working: 'It is still at work.', asks: 'It is waiting for you.', done: 'It finished, and its answer hasn’t been read yet.' } as Record<string, string>)[a?.status as string] || '';
export async function askEnd(title: string, why: string, after: string, restart = true): Promise<'close' | 'restart' | null> {
  const choices = [...(restart ? [{ label: 'restart', value: 'restart' }] : []), { label: 'close', value: 'close', main: true }];
  const text = `${why} ${after}${restart ? ' Restart starts a fresh chat here with the same agent.' : ''} Shift+click on × closes without asking.`;
  return (await ask({ title, text, choices })) || null;
}
