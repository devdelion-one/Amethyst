import { track, uid } from './util.ts';

export interface Split {
  id?: string;
  split: string;
  kids: SplitNode[];
  sizes: number[];
}
type SplitNode = Split | object | string;

const isSplit = (n: unknown): n is Split => Array.isArray((n as Split | null)?.kids);
export const leaves = (n: SplitNode | null | undefined, out: SplitNode[] = []): SplitNode[] => {
  if (isSplit(n)) n.kids.forEach((x) => leaves(x, out));
  else if (n != null) out.push(n);
  return out;
};
export const even = (n: Split): Split => ({ ...n, sizes: n.kids.map(() => 1) });
export function without(n: SplitNode, k: SplitNode): SplitNode | null {
  if (!isSplit(n)) return n === k ? null : n;
  const kids = (n.kids.map((x) => without(x, k)).filter(Boolean) as SplitNode[]).flatMap((x) => ((x as Split).split === n.split ? (x as Split).kids : [x]));
  if (kids.length < 2) return kids[0] || null;
  return kids.length === n.kids.length ? { ...n, kids, sizes: [...n.sizes] } : even({ ...n, kids });
}
export function beside(n: SplitNode, at: SplitNode, k: SplitNode, edge: string): SplitNode {
  const split = edge === 'left' || edge === 'right' ? 'row' : 'col', after = edge === 'right' || edge === 'bottom';
  if (n === at) return { id: uid(), split, kids: after ? [at, k] : [k, at], sizes: [1, 1] };
  if (!isSplit(n)) return n;
  const i = n.kids.indexOf(at);
  if (i < 0 || n.split !== split) return { ...n, kids: n.kids.map((x) => beside(x, at, k, edge)), sizes: [...n.sizes] };
  return even({ ...n, kids: n.kids.toSpliced(i + (after ? 1 : 0), 0, k) });
}
export const swapped = (n: SplitNode, a: SplitNode, b: SplitNode): SplitNode => (isSplit(n) ? { ...n, kids: n.kids.map((x) => swapped(x, a, b)), sizes: [...n.sizes] } : n === a ? b : n === b ? a : n);
export function clean(n: any): string | { split: string; kids: unknown[]; sizes: number[] } | null {
  if (typeof n === 'string') return n;
  if ((n?.split !== 'row' && n?.split !== 'col') || !Array.isArray(n.kids)) return null;
  const kids = n.kids.map(clean).filter(Boolean);
  return { split: n.split, kids, sizes: n.sizes?.length === kids.length && n.sizes.every((x: number) => x > 0) ? n.sizes : kids.map(() => 1) };
}

export function dragGap(e: PointerEvent, gut: HTMLElement, sp: { split: string; sizes: number[] }, min: number, done: () => void): () => void {
  e.preventDefault();
  const i = +gut.dataset.i!, row = sp.split === 'row';
  const a = gut.previousElementSibling as HTMLElement, b = gut.nextElementSibling as HTMLElement;
  const size = (el: Element) => (row ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
  const total = size(a) + size(b), share = sp.sizes[i - 1] + sp.sizes[i], from = size(a), start = row ? e.clientX : e.clientY;
  let frame = 0;
  const paint = () => {
    frame = 0;
    a.style.flexGrow = sp.sizes[i - 1] as unknown as string;
    b.style.flexGrow = sp.sizes[i] as unknown as string;
  };
  gut.classList.add('drag');
  document.body.classList.add(row ? 'resizing-x' : 'resizing-y');
  return track(e, {
    capture: gut,
    move(ev) {
      const px = Math.min(total - min, Math.max(min, from + (row ? ev.clientX : ev.clientY) - start));
      sp.sizes[i - 1] = (share * px) / total;
      sp.sizes[i] = share - sp.sizes[i - 1];
      frame ||= requestAnimationFrame(paint);
    },
    end() {
      if (frame) cancelAnimationFrame(frame), paint();
      gut.classList.remove('drag');
      document.body.classList.remove('resizing-x', 'resizing-y');
      done();
    },
  });
}
