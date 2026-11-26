export const W = 1600;
export const H = 1000;
export const NS = 'http://www.w3.org/2000/svg';
export const PAD = 60;
export type Box = { x: number; y: number; w: number; h: number };

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NUM = /^(?:\d{1,9}(?:\.\d{1,9})?|\.\d{1,9})$/;
const PEN: Record<string, RegExp> = {
  d: /^[MmLlHhVvCcSsQqTtAaZz\d\s.,+-]+$/,
  fill: /^none$/,
  stroke: HEX,
  'stroke-width': NUM,
  'stroke-linecap': /^(?:round|butt|square)$/,
  'stroke-linejoin': /^(?:round|bevel|miter)$/,
  'stroke-opacity': NUM,
};
const FRAME = /^(?:xmlns|xmlns:.*|xml:space|data-mind|viewBox|width|height|x|y|version|preserveAspectRatio)$/;
const PLAIN = /^(?:id|class|font-family|font-size|font-weight)$/;
const UNSEEN = new Set(['defs', 'style', 'symbol', 'clipPath', 'mask', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'filter', 'script', 'title', 'desc', 'metadata']);
const PIC = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
const SIZES: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function boxOf([x, y, w, h]: number[]): Box | null {
  return [x, y, w, h].every((v) => Number.isFinite(v) && Math.abs(v) < 1e9) && w > 0 && h > 0 ? { x, y, w, h } : null;
}
export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
export const grow = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, w: b.w + 2 * by, h: b.h + 2 * by });
const FOREIGN: Box = grow({ x: 0, y: 0, w: W, h: H }, PAD);

function inherited(ink: Element) {
  const names = new Set<string>();
  for (let el: Element | null = ink; el; el = el.parentElement) for (const { name } of el.attributes) if (!FRAME.test(name) && !PLAIN.test(name)) names.add(name);
  return [...names];
}
function strokeOf(el: Element, above: string[]) {
  if (el.namespaceURI !== NS || el.localName !== 'path' || el.firstElementChild) return null;
  const p = document.createElementNS(NS, 'path');
  for (const { name, value } of el.attributes) {
    if (name === 'xmlns') continue;
    if (!Object.hasOwn(PEN, name) || !PEN[name].test(value)) return null;
    p.setAttribute(name, value);
  }
  if (!['d', 'fill', 'stroke', ...above].every((k) => p.hasAttribute(k))) return null;
  return p;
}

function picture(href: string, b: Box) {
  const el = document.createElementNS(NS, 'image');
  for (const [k, v] of Object.entries({ x: b.x, y: b.y, width: b.w, height: b.h })) el.setAttribute(k, String(v));
  el.setAttribute('href', href);
  return el;
}
function savedPicture(els: Element[]) {
  const [el] = els, href = el?.getAttribute('href') || '';
  if (els.length !== 1 || el.namespaceURI !== NS || el.localName !== 'image' || !PIC.test(href)) return null;
  const b = boxOf(['x', 'y', 'width', 'height'].map((k) => Number(el.getAttribute(k) ?? NaN)));
  return b && picture(href, b);
}
function pictureOf(node: Node, b: Box) {
  const doc = document.implementation.createDocument(NS, 'svg');
  const root = doc.documentElement;
  const font = getComputedStyle(document.body);
  for (const [k, v] of Object.entries({ viewBox: `${b.x} ${b.y} ${b.w} ${b.h}`, width: b.w, height: b.h, 'font-family': font.fontFamily, 'font-size': font.fontSize })) root.setAttribute(k, String(v));
  root.append(doc.importNode(node, true));
  const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(doc));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return picture('data:image/svg+xml;base64,' + btoa(bin), b);
}

function pathPoints(d: string) {
  const out: number[][] = [];
  let x = 0, y = 0, sx = 0, sy = 0;
  for (const [, c, rest] of d.matchAll(/([mlhvcsqtaz])([^mlhvcsqtaz]*)/gi)) {
    const k = c.toLowerCase(), rel = c === k, n = SIZES[k];
    const v = (rest.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (k === 'z') [x, y] = [sx, sy];
    for (let i = 0; n && i + n <= v.length; i += n) {
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (k === 'h') x = ox + v[i];
      else if (k === 'v') y = oy + v[i];
      else {
        for (let j = k === 'a' ? 5 : 0; j < n; j += 2) out.push([ox + v[i + j], oy + v[i + j + 1]]);
        if (k === 'a') for (const s of [-2, 2]) out.push([ox + v[i + 5] + s * v[i], oy + v[i + 6] + s * v[i + 1]]);
        x = ox + v[i + n - 2];
        y = oy + v[i + n - 1];
      }
      out.push([x, y]);
      if (k === 'm' && !i) [sx, sy] = [x, y];
    }
  }
  return out;
}
function pointsOf(el: Element): number[][] {
  const n = (k: string) => parseFloat(el.getAttribute(k) || '') || 0;
  const box = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
  const rx = n('r') || n('rx'), ry = n('r') || n('ry');
  switch (el.localName) {
    case 'rect': case 'image': case 'use': case 'foreignObject': case 'svg': return box(n('x'), n('y'), n('width'), n('height'));
    case 'circle': case 'ellipse': return box(n('cx') - rx, n('cy') - ry, 2 * rx, 2 * ry);
    case 'line': return [[n('x1'), n('y1')], [n('x2'), n('y2')]];
    case 'polyline': case 'polygon': return pathPoints('M' + (el.getAttribute('points') || '').replace(/[^\d\s.,+-]/g, ' '));
    case 'path': return pathPoints(el.getAttribute('d') || '');
    case 'text': {
      const size = parseFloat(el.closest('[font-size]')?.getAttribute('font-size') || '') || 16;
      return box(n('x'), n('y') - size, size * 0.7 * (el.textContent || '').trim().length, size * 1.3);
    }
  }
  return [];
}
function moved(el: Element, m: DOMMatrix) {
  const list = el.namespaceURI === NS ? (el as SVGGraphicsElement).transform?.baseVal : null;
  if (list) for (const t of list) m = m.multiply(t.matrix);
  return m;
}
function extent(tops: Element[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const walk = (el: Element, m: DOMMatrix) => {
    if (el.namespaceURI !== NS || UNSEEN.has(el.localName)) return;
    m = moved(el, m);
    for (const [px, py] of pointsOf(el)) {
      const x = m.a * px + m.c * py + m.e, y = m.b * px + m.d * py + m.f;
      if (!Number.isFinite(x + y)) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    if (el.localName !== 'svg') for (const c of el.children) walk(c, m);
  };
  for (const top of tops) {
    const above: Element[] = [];
    for (let el = top.parentElement; el; el = el.parentElement) above.unshift(el);
    walk(top, above.reduce((m, el) => moved(el, m), new DOMMatrix()));
  }
  return boxOf([x0, y0, x1 - x0 || 1, y1 - y0 || 1]);
}
function layerBox(root: Element, shown: Element[]): Box {
  const own = boxOf((root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number));
  const b = !own ? FOREIGN : shown.some((g) => [...g.children].some((el) => el.localName === 'svg')) ? union(own, FOREIGN) : own;
  const e = extent(shown);
  if (!e || (e.x >= b.x && e.y >= b.y && e.x + e.w <= b.x + b.w && e.y + e.h <= b.y + b.h)) return b;
  const u = union(b, grow(e, PAD)), x = Math.floor(u.x), y = Math.floor(u.y);
  return boxOf([x, y, Math.ceil(u.x + u.w) - x, Math.ceil(u.y + u.h) - y]) || b;
}
function layerOf(root: Element, ink: Element | null, under: Element | null) {
  const shown = [under, ink].filter((g): g is Element => !!g?.children.length);
  if (!shown.length) return null;
  const kept = !ink?.children.length && savedPicture([...under!.children]);
  if (kept) return kept;
  const b = layerBox(root, shown);
  const bg = root.querySelector('rect.bg');
  if (bg && !shown.some((g) => g.contains(bg))) bg.remove();
  const make = (tag: string) => root.ownerDocument.createElementNS(NS, tag);
  const all = make('g'), aside = make('defs');
  const sort = (el: Element) => {
    for (const c of [...el.children]) {
      if (shown.includes(c)) continue;
      if (shown.some((g) => c.contains(g))) sort(c);
      else aside.append(c);
    }
  };
  sort(root);
  for (const { name, value } of root.attributes) if (!FRAME.test(name) && !name.includes(':')) all.setAttribute(name, value);
  all.append(...(aside.children.length ? [aside] : []), ...root.childNodes);
  return pictureOf(all, b);
}
function foreign(root: Element) {
  const g = root.ownerDocument.createElementNS(NS, 'svg');
  for (const a of ['viewBox', 'width', 'height', 'preserveAspectRatio']) if (root.hasAttribute(a)) g.setAttribute(a, root.getAttribute(a)!);
  if (!g.hasAttribute('viewBox') && root.hasAttribute('width')) g.setAttribute('viewBox', `0 0 ${parseFloat(root.getAttribute('width')!)} ${parseFloat(root.getAttribute('height') as string)}`);
  g.setAttribute('width', String(W));
  g.setAttribute('height', String(H));
  for (const n of [...root.childNodes]) g.append(n);
  return pictureOf(g, FOREIGN);
}

export function readBoard(text: string): { fill: string; strokes: SVGPathElement[]; pic: SVGImageElement | null } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root?.localName !== 'svg' || doc.querySelector('parsererror')) return { fill: '', strokes: [], pic: null };
  if (root.getAttribute('data-mind') !== 'board') return { fill: '#ffffff', strokes: [], pic: foreign(root) };
  const fill = root.querySelector('rect.bg')?.getAttribute('fill') || '';
  const ink = root.querySelector('g.ink'), strokes: SVGPathElement[] = [];
  const above = ink ? inherited(ink) : [];
  for (const el of [...(ink?.children || [])]) {
    const p = strokeOf(el, above);
    if (!p) continue;
    strokes.push(p);
    el.remove();
  }
  return { fill: HEX.test(fill) ? fill : '', strokes, pic: layerOf(root, ink, root.querySelector('g.under')) };
}
