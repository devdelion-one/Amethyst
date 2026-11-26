import { ask } from '../base/controls.ts';
import { api } from '../base/model.ts';
import { follow } from '../base/stream.ts';
import { $, showErr } from '../base/util.ts';
import { WIN } from '../base/windows.ts';

type Item = { id: number };
type Ev<T> = { type: string; ask?: T; id?: number };
type Prompt = { title: string; text: string; warn: string; code?: string };

export function askQueue<T extends Item>(what: Record<string, unknown>, show: (a: T) => Prompt, answer: (a: T, yes: boolean) => Promise<unknown>) {
  if (WIN !== 1 || location.pathname === '/ue.html') return;
  const desk = window.amethyst;
  const queue: T[] = [];
  const gone = new Set<number>();
  let open: T | null = null;
  const next = async () => {
    if (open || !queue.length) return;
    if (!$<HTMLElement>('#modal').hidden) return void setTimeout(next, 500);
    const a = (open = queue.shift()!);
    desk?.flash?.();
    const said = ask({ ...show(a), choices: [{ label: 'Allow', value: true, main: true }], held: true });
    const no = $<HTMLElement | null>('#modal [data-cancel]');
    if (no) no.innerHTML = '<kbd>esc</kbd>not now';
    const yes = await said;
    open = null;
    if (!gone.delete(a.id)) await answer(a, yes === true).catch(showErr);
    next();
  };
  follow(what, (e: Ev<T>) => {
    if (e.type === 'ask' && e.ask) {
      if (open?.id === e.ask.id || queue.some((a) => a.id === e.ask!.id)) return;
      queue.push(e.ask);
      return void next();
    }
    if (e.type !== 'end') return;
    const i = queue.findIndex((a) => a.id === e.id);
    if (i >= 0) queue.splice(i, 1);
    if (open && open.id === e.id) {
      gone.add(e.id);
      $<HTMLElement | null>('#modal [data-cancel]')?.click();
    }
  });
}

askQueue<Item & Prompt>({ runask: true }, (a) => ({ title: a.title, text: a.text, warn: a.warn, code: a.code }), (a, yes) => api('POST', '/api/runs/ask', { id: a.id, yes }));
