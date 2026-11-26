import { createFind } from '../base/find.ts';
import type { chatBox } from '../base/textbox.ts';
import type { recentRows } from './recent.ts';
import type { stick } from './stick.ts';
import { setFold } from './steps.ts';

type FindCtx = {
  at: HTMLElement;
  el: HTMLElement;
  input: ReturnType<typeof chatBox>;
  flow: HTMLElement;
  log: HTMLElement;
  recent: ReturnType<typeof recentRows>;
  st: ReturnType<typeof stick>;
  size: () => number;
};

export function chatFind({ at, el, input, flow, log, recent, st, size }: FindCtx) {
  const finder = createFind(at, {
    box: {
      label: 'box',
      tip: 'Find in the text box\nLooks only in the message you are writing.',
      root: input,
      view: input,
      skip: (e) => e!.closest('.img-chip'),
      reveal: (r) => input.showMatch(r),
      leave(m) {
        if (m) input.selectMatch(m.range);
        else input.focus();
      },
    },
    chat: {
      label: 'chat',
      tip: 'Find in the whole chat\nLooks in every message of this chat.',
      root: flow,
      opened: () => recent.all(),
      view: log,
      skip: (e) => e!.closest('button, svg, [aria-hidden="true"], .ch-working'),
      reveal(r) {
        const n = r.startContainer.parentElement, zoom = size() / 100;
        for (let d = n.closest('details:not([open])'); d; d = d.parentElement.closest('details:not([open])')) d.open = true;
        const io = n.closest('.ch-io'), pre = n.closest('pre');
        if (io && !io.classList.contains('open') && pre.scrollHeight > pre.clientHeight + 1) {
          setFold(io, true);
          const row = io.closest('.ch-tool');
          row.unfolded.add([...row.querySelectorAll('.ch-io')].indexOf(io));
        }
        st.pin(false);
        st.settle();
        if (pre && pre.scrollHeight > pre.clientHeight + 1) {
          const p = pre.getBoundingClientRect();
          pre.scrollTop += (r.getBoundingClientRect().top - p.top - p.height / 2) / zoom;
        }
        const v = log.getBoundingClientRect(), m = r.getBoundingClientRect();
        if (m.top < v.top + 48 || m.bottom > v.bottom) st.easeTo(log.scrollTop + (m.top - v.top - v.height / 2) / zoom);
      },
      leave: () => input.focus(),
    },
  });
  function find() {
    if (finder.focused()) return finder.open(finder.scope() === 'box' ? 'chat' : 'box');
    const inBox = input.focused();
    const sel = inBox ? input.value.slice(input.selectionStart, input.selectionEnd) : el.contains(getSelection()!.anchorNode) ? String(getSelection()) : '';
    finder.open(inBox && input.value ? 'box' : 'chat', sel.includes('\n') ? '' : sel);
  }
  return { find, shut: finder.shut, inChat: () => finder.scope() === 'chat' };
}
