import { esc, store } from '../base/util.ts';
import { onSize } from '../base/measure.ts';
import { grow, H, NS, PAD, readBoard, union, W } from './boardfile.ts';
import type { Box } from './boardfile.ts';

type Tool = { glyph: string; label: string; width?: number; opacity?: number; title?: string };
type Gone = [Element, ChildNode | null];
type Op = { add?: Element[]; del?: Gone[]; bg?: string[] };
type Draw = { op: { del: Gone[] }; el?: undefined; pts?: undefined } | { el: SVGPathElement; pts: number[][]; op?: undefined };

const ZMIN = 0.0001;
const ZMAX = 16;
const FILE_MAX = 4096;

const BACKGROUNDS = [
  { name: 'paper', hex: '#fbf8f1' },
  { name: 'white', hex: '#ffffff' },
  { name: 'slate', hex: '#252a33' },
  { name: 'chalk', hex: '#24332b' },
  { name: 'night', hex: '#0d0d14' },
];
export const INKS = ['#1d1f24', '#ffffff', '#d0474f', '#e8873a', '#e6b450', '#4caf6a', '#3f8fd0', '#8a5cd0', '#e070b0', '#8a6a4a'];
export const TOOLS: Record<string, Tool> = {
  pen: { glyph: '✎', label: 'pen', title: 'Pen\nDraws thin, solid lines.', width: 4, opacity: 1 },
  brush: { glyph: '▬', label: 'brush', title: 'Brush\nPaints wide, see-through strokes.', width: 22, opacity: 0.55 },
  eraser: { glyph: '⌫', label: 'eraser', title: 'Eraser\nRubs out what you drew.', width: 24 },
  hand: { glyph: '✥', label: 'move', title: 'Move\nDrag to move around the board.\n\nYou can also drag with the right or middle mouse button.' },
};
export const SIZES = [0.25, 0.5, 1, 2, 4, 8];

export const emptyBoard = (bg = BACKGROUNDS[0].hex) =>
  `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-mind="board">\n<rect class="bg" width="${W}" height="${H}" fill="${bg}"/>\n<g class="ink"></g>\n</svg>\n`;

const r1 = (v: number) => Math.round(v * 10) / 10;

function pathOf(pts: number[][]) {
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return `M${x} ${y}l0.01 0`;
  }
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += `Q${x} ${y} ${r1((x + nx) / 2)} ${r1((y + ny) / 2)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + `L${lx} ${ly}`;
}

export function createBoard(host: HTMLElement, { onChange, onPress }: { onChange?: () => void; onPress?: () => void }) {
  host.innerHTML = `
    <div class="bd-stage" tabindex="0"><svg xmlns="${NS}">
      <defs><pattern id="bd-dots" patternUnits="userSpaceOnUse"><circle/></pattern></defs>
      <rect class="bg"/><rect class="grid" fill="url(#bd-dots)"/><g class="under"></g><g class="ink"></g></svg>
      <div class="bd-rail"></div>
      <div class="bd-zoom"><button data-zout>−</button><button data-z100></button><button data-zin>+</button><button data-fit title="Fit\nShows the whole drawing." data-tip-keys="=f:fit">fit</button></div></div>`;
  const tools = host.querySelector('.bd-rail') as HTMLElement;
  const stage = host.querySelector('.bd-stage') as HTMLElement;
  const svg = stage.querySelector('svg')!;
  const bg = svg.querySelector('.bg') as SVGRectElement;
  const grid = svg.querySelector('.grid') as SVGRectElement;
  const pat = svg.querySelector('pattern')!;
  const dot = pat.querySelector('circle')!;
  const under = svg.querySelector('.under') as SVGGElement;
  const ink = svg.querySelector('.ink') as SVGGElement;
  const zoomLbl = stage.querySelector('[data-z100]') as HTMLElement;

  const st = { tool: 'pen', ink: INKS[0], size: 1, fill: BACKGROUNDS[0].hex, undo: [] as Op[], redo: [] as Op[], draw: null as Draw | null, pan: null as { at: number[] } | null, space: false, rail: store.get('boardRail', true) as boolean };
  const cam = { x: 0, y: 0, z: 1 };
  let sw = 1, sh = 1;

  function view() {
    const vw = sw / cam.z, vh = sh / cam.z;
    svg.setAttribute('viewBox', `${cam.x} ${cam.y} ${vw} ${vh}`);
    for (const r of [bg, grid]) {
      r.setAttribute('x', cam.x as unknown as string);
      r.setAttribute('y', cam.y as unknown as string);
      r.setAttribute('width', vw as unknown as string);
      r.setAttribute('height', vh as unknown as string);
    }
    bg.setAttribute('fill', st.fill);
    let step = 24;
    while (step * cam.z < 24) step *= 5;
    while (step * cam.z > 120) step /= 5;
    pat.setAttribute('width', step as unknown as string);
    pat.setAttribute('height', step as unknown as string);
    dot.setAttribute('cx', (step / 2) as unknown as string);
    dot.setAttribute('cy', (step / 2) as unknown as string);
    dot.setAttribute('r', (1.1 / cam.z) as unknown as string);
    dot.setAttribute('fill', lum(st.fill) > 0.5 ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.14)');
    const pct = cam.z * 100;
    zoomLbl.textContent = `${pct >= 10 ? Math.round(pct) : +pct.toPrecision(2)}%`;
  }
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return (0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
  };

  function zoomAt(k: number, px = sw / 2, py = sh / 2) {
    const z = Math.min(ZMAX, Math.max(ZMIN, cam.z * k));
    cam.x += px / cam.z - px / z;
    cam.y += py / cam.z - py / z;
    cam.z = z;
    view();
  }

  function bounds() {
    const boxes: Box[] = [];
    if (ink.children.length) {
      const b = ink.getBBox(), fat = Math.max(0, ...[...ink.children].map((el) => Number(el.getAttribute('stroke-width')) || 0)) / 2;
      boxes.push(grow({ x: b.x, y: b.y, w: b.x + b.width - b.x, h: b.y + b.height - b.y }, fat));
    }
    if (under.children.length) {
      const b = under.getBBox();
      boxes.push(grow({ x: b.x, y: b.y, w: b.width, h: b.height }, -Math.min(PAD, b.width / 2, b.height / 2)));
    }
    return boxes.length ? boxes.reduce(union) : null;
  }

  function fit() {
    const b = bounds() || { x: 0, y: 0, w: W, h: H };
    const z = Math.min(1, Math.max(ZMIN, Math.min(sw / (b.w + 2 * PAD), sh / (b.h + 2 * PAD))));
    cam.z = z;
    cam.x = b.x + b.w / 2 - sw / z / 2;
    cam.y = b.y + b.h / 2 - sh / z / 2;
    view();
  }

  let fitPending = true;
  onSize(stage, { name: 'board.size', live: true, write: () => {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    cam.x += sw / cam.z / 2 - r.width / cam.z / 2;
    cam.y += sh / cam.z / 2 - r.height / cam.z / 2;
    sw = r.width;
    sh = r.height;
    if (fitPending) {
      fitPending = false;
      fit();
    } else view();
  } });


  function renderTools() {
    stage.dataset.tool = st.tool;
    tools.classList.toggle('folded', !st.rail);
    if (!st.rail) {
      tools.innerHTML = `<button data-unfold>${TOOLS[st.tool].glyph}<i style="--c:${st.ink}"></i></button>`;
      return;
    }
    tools.innerHTML =
      `<button class="fold" data-fold>‹</button>` +
      Object.entries(TOOLS)
        .map(([k, t]) => `<button class="tl ${st.tool === k ? 'on' : ''}" data-tool="${k}" title="${esc((t as { title?: string }).title || t.label)}"${k === 'hand' ? ' data-tip-keys="=space:hold to move around"' : ''}>${t.glyph}</button>`)
        .join('') +
      `<span class="sep"></span>` +
      SIZES.map((s, i) => `<button class="sz ${st.size === s ? 'on' : ''}" data-size="${s}"><i style="--d:${3 + i * 2.6}px"></i></button>`).join('') +
      `<span class="sep"></span>` +
      INKS.map((c) => `<button class="sw ${st.ink === c ? 'on' : ''}" data-ink="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('') +
      `<label class="sw pick ${INKS.includes(st.ink) ? '' : 'on'}" style="--c:${st.ink}"><input type="color" value="${st.ink}"></label>` +
      `<span class="sep"></span>` +
      `<button data-undo title="Undo\nTakes back the last change." data-tip-keys="=ctrl+z:undo" ${st.undo.length ? '' : 'disabled'}>↶</button>` +
      `<button data-redo title="Redo\nBrings back what you took back." data-tip-keys="=ctrl+y:redo;=ctrl+shift+z:redo" ${st.redo.length ? '' : 'disabled'}>↷</button>` +
      `<button class="wide" data-clear>clear</button>` +
      `<span class="sep"></span>` +
      BACKGROUNDS.map((b) => `<button class="sw bgc ${st.fill === b.hex ? 'on' : ''}" data-bg="${b.hex}" style="--c:${b.hex}" aria-label="background: ${b.name}"></button>`).join('');
  }

  const changed = () => {
    renderTools();
    onChange?.();
  };

  function push(op: Op) {
    st.undo.push(op);
    if (st.undo.length > 200) st.undo.shift();
    st.redo = [];
    changed();
  }

  function apply(op: Op, back: boolean) {
    if (op.add) for (const el of op.add) back ? el.remove() : ink.append(el);
    if (op.del) {
      if (back) for (const [el, next] of [...op.del].reverse()) ink.insertBefore(el, next?.parentNode === ink ? next : null);
      else for (const [el] of op.del) el.remove();
    }
    if (op.bg) {
      st.fill = op.bg[back ? 0 : 1];
      view();
    }
  }
  function undo() {
    const op = st.undo.pop();
    if (!op) return;
    apply(op, true);
    st.redo.push(op);
    changed();
  }
  function redo() {
    const op = st.redo.pop();
    if (!op) return;
    apply(op, false);
    st.undo.push(op);
    changed();
  }

  const local = (e: MouseEvent) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const toBoard = (e: MouseEvent) => {
    const [px, py] = local(e);
    return [r1(cam.x + px / cam.z), r1(cam.y + py / cam.z)];
  };

  function eraseAt(e: PointerEvent, op: { del: Gone[] }) {
    const r = (TOOLS.eraser.width! * st.size) / 2;
    const hit = new Set<Element>();
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const [x, y] = k === 8 ? [e.clientX, e.clientY] : [e.clientX + Math.cos(a) * r, e.clientY + Math.sin(a) * r];
      for (const el of document.elementsFromPoint(x, y)) if (el.parentNode === ink) hit.add(el);
    }
    for (const el of hit) {
      op.del.push([el, el.nextSibling]);
      el.remove();
    }
  }

  const touches = new Map<number, number[]>();
  let pinch = null as { d: number; m: number[] } | null;

  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.bd-zoom, .bd-rail')) return;
    onPress?.();
    e.preventDefault();
    stage.focus();
    stage.setPointerCapture(e.pointerId);
    addEventListener('blur', quit);
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, local(e));
      if (touches.size === 2) {
        if (st.draw?.el) st.draw.el.remove();
        st.draw = null;
        const [a, b] = [...touches.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        return;
      }
      if (touches.size > 2) return;
    }
    if (st.tool === 'hand' || st.space || e.button === 1 || e.button === 2) {
      st.pan = { at: local(e) };
      stage.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;
    if (st.tool === 'eraser') {
      st.draw = { op: { del: [] } };
      eraseAt(e, st.draw.op);
      return;
    }
    const t = TOOLS[st.tool];
    const el = document.createElementNS(NS, 'path');
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', st.ink);
    el.setAttribute('stroke-width', String(r1(Math.max(0.1, t.width! * st.size))));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    if (t.opacity! < 1) el.setAttribute('stroke-opacity', String(t.opacity));
    const pts = [toBoard(e)];
    el.setAttribute('d', pathOf(pts));
    ink.append(el);
    st.draw = { el, pts };
  });

  stage.addEventListener('pointermove', (e) => {
    if (pinch && touches.has(e.pointerId)) {
      touches.set(e.pointerId, local(e));
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      cam.x -= (m[0] - pinch.m[0]) / cam.z;
      cam.y -= (m[1] - pinch.m[1]) / cam.z;
      zoomAt(d / (pinch.d || d), m[0], m[1]);
      pinch = { d, m };
      return;
    }
    if (st.pan) {
      const p = local(e);
      cam.x -= (p[0] - st.pan.at[0]) / cam.z;
      cam.y -= (p[1] - st.pan.at[1]) / cam.z;
      st.pan.at = p;
      return view();
    }
    const d = st.draw;
    if (!d) return;
    if (d.op) return eraseAt(e, d.op);
    for (const ev of e.getCoalescedEvents?.() || [e]) {
      const p = toBoard(ev);
      const [lx, ly] = d.pts[d.pts.length - 1];
      if (Math.hypot(p[0] - lx, p[1] - ly) * cam.z >= 1.5) d.pts.push(p);
    }
    d.el.setAttribute('d', pathOf(d.pts));
  });

  const end = (e: PointerEvent) => {
    if (touches.delete(e.pointerId) && touches.size < 2) pinch = null;
    if (!touches.size) removeEventListener('blur', quit);
    finish();
  };
  const quit = () => {
    removeEventListener('blur', quit);
    touches.clear();
    pinch = null;
    finish();
  };
  const finish = () => {
    if (st.pan) {
      st.pan = null;
      stage.classList.remove('panning');
    }
    const d = st.draw;
    if (!d) return;
    st.draw = null;
    if (d.op) d.op.del.length && push(d.op);
    else push({ add: [d.el] });
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('lostpointercapture', end);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  stage.addEventListener(
    'wheel',
    (e) => {
      if ((e.target as Element).closest('.bd-rail')) return;
      e.preventDefault();
      const [px, py] = local(e);
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || (mouseWheel && !e.shiftKey)) return zoomAt(Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * (e.ctrlKey ? 0.01 : 0.0015), 0.5)), px, py);
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      cam.x += dx / cam.z;
      cam.y += dy / cam.z;
      view();
    },
    { passive: false },
  );

  stage.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.key === ' ') {
      st.space = true;
      stage.classList.add('can-pan');
    } else if (e.ctrlKey || e.metaKey) {
      if (k === 'z' && !e.shiftKey) undo();
      else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
      else if (k === '0') fit();
      else return;
    } else if (k === '+' || k === '=') zoomAt(1.25);
    else if (k === '-') zoomAt(0.8);
    else if (k === 'f') fit();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  stage.addEventListener('keyup', (e) => {
    if (e.key !== ' ') return;
    st.space = false;
    stage.classList.remove('can-pan');
  });
  stage.addEventListener('blur', () => {
    st.space = false;
    stage.classList.remove('can-pan');
  });

  stage.querySelector('.bd-zoom')!.addEventListener('click', (e) => {
    const d = (e.target as Element).closest('button')?.dataset;
    if (!d) return;
    if ('zin' in d) zoomAt(1.25);
    else if ('zout' in d) zoomAt(0.8);
    else if ('z100' in d) zoomAt(1 / cam.z);
    else if ('fit' in d) fit();
  });

  tools.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('fold' in d || 'unfold' in d) {
      st.rail = 'unfold' in d;
      store.set('boardRail', st.rail);
    } else if (d.tool) st.tool = d.tool;
    else if (d.size) st.size = Number(d.size);
    else if (d.ink) {
      st.ink = d.ink;
      if (st.tool === 'eraser' || st.tool === 'hand') st.tool = 'pen';
    } else if ('undo' in d) return undo();
    else if ('redo' in d) return redo();
    else if ('clear' in d) {
      if (!ink.children.length) return;
      const op = { del: [...ink.children].map((el): Gone => [el, el.nextSibling]) };
      ink.replaceChildren();
      return push(op);
    } else if (d.bg) {
      const from = st.fill;
      if (from === d.bg) return;
      st.fill = d.bg;
      view();
      return push({ bg: [from, d.bg] });
    }
    renderTools();
  });
  tools.addEventListener('input', (e) => {
    if ((e.target as HTMLInputElement).type !== 'color') return;
    st.ink = (e.target as HTMLInputElement).value;
    if (st.tool === 'eraser' || st.tool === 'hand') st.tool = 'pen';
    ((e.target as HTMLInputElement).parentNode as HTMLElement).style.setProperty('--c', st.ink);
  });
  tools.addEventListener('change', (e) => (e.target as HTMLInputElement).type === 'color' && renderTools());

  return {
    load(text: string, keep = false) {
      st.undo = [];
      st.redo = [];
      st.draw = st.pan = null;
      const { fill, strokes, pic } = readBoard(text || emptyBoard());
      st.fill = fill || BACKGROUNDS[0].hex;
      ink.replaceChildren();
      for (const p of strokes) ink.append(p);
      if (!pic) under.replaceChildren();
      else if (!under.firstChild?.isEqualNode(pic)) under.replaceChildren(pic);
      renderTools();
      if (keep) return;
      if (sw > 1 && stage.getBoundingClientRect().width) fit();
      else fitPending = true;
    },
    serialize() {
      const ser = new XMLSerializer();
      const inner = (g: Element) => [...g.children].map((el) => '  ' + ser.serializeToString(el).replace(/ xmlns="[^"]*"/, '')).join('\n');
      const u = under.children.length ? `<g class="under">\n${inner(under)}\n</g>\n` : '';
      const b = bounds();
      const [x, y, w, h] = b ? [b.x - PAD, b.y - PAD, b.w + 2 * PAD, b.h + 2 * PAD].map((v) => Math.round(v)) : [0, 0, W, H];
      const k = Math.min(1, FILE_MAX / Math.max(w, h));
      return `<svg xmlns="${NS}" viewBox="${x} ${y} ${w} ${h}" width="${Math.round(w * k)}" height="${Math.round(h * k)}" data-mind="board">\n<rect class="bg" x="${x}" y="${y}" width="${w}" height="${h}" fill="${st.fill}"/>\n${u}<g class="ink">\n${inner(ink)}\n</g>\n</svg>\n`;
    },
    focus: () => stage.focus(),
  };
}
