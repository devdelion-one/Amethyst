import { S } from '../base/model.ts';
import { tell } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { counterparts, isHeader, isPairable } from './pairs.ts';

const anchor = (): Element => {
  const a = document.activeElement;
  return a instanceof Element && a !== document.body ? a : document.querySelector('#main') || document.body;
};

export function openCounterpart() {
  const path = page.shownPath?.();
  if (!path || !isPairable(path)) return tell(anchor(), { title: 'Not a C or C++ file', line: 'this key switches between a header and its source, like Foo.h and Foo.cpp', ms: 2500 });
  const name = path.replace(/^.*\//, ''), base = name.replace(/\.[^.]+$/, '');
  const [best] = counterparts(path, [...S.thoughts.values()].map((t) => t.path));
  if (!best) return tell(anchor(), { title: `No ${isHeader(path) ? 'source' : 'header'} for ${name}`, line: `nothing named ${base}.${isHeader(path) ? 'cpp' : 'h'} (or .cc, .hpp …) in this project`, ms: 2500 });
  page.openInTab(best);
}
