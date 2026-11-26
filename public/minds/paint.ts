import { GEMS } from '../base/kinds.ts';
import { farLook, mix } from '../base/theme.ts';
import { folder, offset, page, pageOf, trace } from '../base/shapes.ts';
import type { folderOf } from '../base/shapes.ts';

export interface Pt {
  x: number;
  y: number;
}
export interface Spot extends Pt {
  rel?: number;
}
export interface Park {
  dx: number;
  dy: number;
}
export interface Placed extends Pt {
  c: GNode;
  mx: number;
  my: number;
}
export interface GNode extends Pt {
  id: string;
  vx: number;
  vy: number;
  fresh: boolean;
  free: boolean;
  spot: Spot | null;
  phase: number;
  gen: number;
  kids: number;
  around: GNode[];
  ext: number;
  kind: string;
  label: string;
  path: string;
  color: string;
  touched: number;
  fade: number;
  mtime: number;
  parent: GNode;
  board: boolean;
  file: boolean;
  pin: Park | null;
  ring: number;
  hx: number;
  hy: number;
  cw: number;
  side: number;
  k: number;
  lw: number;
  i: number;
  inbox?: string;
  stack: boolean;
  dir: string;
  lkey: string;
  lv: number;
  count: number;
  up: GNode | null;
  subs: GNode[];
  rel: Placed[];
  A: number;
  B: number;
  off: number;
  text: string;
  bold: boolean;
  fpx: number;
  fcpx: number;
  lead: number;
  tail: number;
  bot: number;
  nbot: number | null;
  box: { x0: number; y0: number; x1: number; y1: number };
  fold: ReturnType<typeof folderOf> | null;
  R: number;
  r: number;
}
interface Link {
  a: GNode;
  b: GNode;
  type: string;
}
export interface Snap extends Pt {
  id: string;
  saved: unknown;
  pin: Park | null;
  ring: number;
}
interface CamSpot extends Pt {
  z: number;
}
interface Cam extends CamSpot {
  tx: number | null;
  ty: number | null;
  tz: number | null;
}
export interface Drag {
  n: GNode | null;
  branch: GNode[] | null;
  before: Snap[] | null;
  sx: number;
  sy: number;
  last: Pt;
  cx: number;
  cy: number;
  moved: boolean;
  touched: Set<GNode>;
  attach?: GNode | null;
  ring?: number;
}
export interface View {
  open: string | null;
  ctx: string;
  match: ((path: string) => unknown) | null;
}
export type Theme = { strong: string; bg: string; fg: string; dim: string; line: string; hi: string; sel: string; card: string; card2: string; light: boolean };
export interface Cb {
  onOpen(path: string): unknown;
  onSelect(dir: string): unknown;
  onInbox(): unknown;
  onBlank?(): unknown;
  onMove(path: string, dir: string, ring: number): unknown;
  onMoveDir(path: string, to: string): unknown;
  onLayout(layout: Record<string, unknown>): unknown;
  onPin(path: string, pin: Park | null, ring: number): unknown;
  onStep?(label: string, items: Snap[]): unknown;
  cams?: Map<string, CamSpot>;
}
export interface St {
  g: CanvasRenderingContext2D;
  nodes: Map<string, GNode>;
  cam: Cam;
  cb: Cb;
  C: Theme;
  links: Link[];
  anchors: GNode[];
  floaters: GNode[];
  W: number;
  H: number;
  dpr: number;
  hover: GNode | null;
  drag: Drag | null;
  dropTarget: GNode | null;
  ping: { n: GNode; t0?: number } | null;
  view: View;
  calm: number;
}
type Colors = Record<string, string>;

const PATHS = Object.fromEntries(Object.entries(GEMS).map(([k, v]) => [k, { d: new Path2D(v.d), a: new Path2D(v.a) }]));
const gemOfNode = (n: GNode) => (n.board ? 'board' : 'file');
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const FACE = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';
export const FONT = (px: number, bold?: boolean) => `${bold ? '600 ' : ''}${px}px ${FACE}`;

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const STACK = { w: 82, h: 55, d: 4.3 };
const HUB_R = 32, INBOX_R = 25;
const HULL: Record<string, number[][]> = {
  project: [[0, -1], [0.866, -0.5], [0.866, 0.5], [0, 1], [-0.866, 0.5], [-0.866, -0.5]],
  folder: [[-1, 0.846], [-0.538, -0.231], [0, -0.846], [0.538, -0.231], [1, 0.846]],
  inbox: Array.from({ length: 24 }, (_, i) => [Math.cos((i / 24) * TAU), Math.sin((i / 24) * TAU)]),
};

const OUTER = 100;
export const orbit = (p: GNode, ring = 1) => (p.lv ? 34 : 46) + p.r + Math.min(80, p.kids * 5) + (ring === 2 ? OUTER : 0);
export const reach = (p: GNode, ring = 1) => orbit(p, ring) + 40;

export const CHIP_H = 24;
export const CHIP_PAD = 34;
export const CHIP_K = 1.7;
export const chipLabel = (n: GNode) => trunc(n.label, 30);

export const FAR = 0.3;
export const ZMIN = 0.05;

export function painter(st: St) {
  const { g, nodes, cam, cb } = st;

  const band = () => Math.max(14, 9 / cam.z);

  const dimmed = (n: GNode) => st.view.match && !st.view.match(n.path);
  const alphaOf = (n: GNode) => (dimmed(n) ? 0.15 : st.hover === n || st.drag?.n === n || st.view.open === n.path ? 1 : n.fade);

  const LABEL_MIN = 9;
  const labelScale = (n: GNode) => Math.max(1, LABEL_MIN / (n.fpx * cam.z));
  function drawLabel(n: GNode, top: number, after?: string) {
    const s = labelScale(n), px = n.fpx * s, w = n.lw * s, h = px + 4;
    g.font = FONT(px, n.bold);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = hexA(st.C.bg, 0.85);
    g.fillRect(n.x - w / 2, top, w + (after ? g.measureText(after).width + 4 * s : 0), h);
    g.fillStyle = st.C.strong;
    g.fillText(n.text, n.x, top + h / 2 + 1);
    if (after) {
      g.textAlign = 'left';
      g.fillStyle = n.color;
      g.fillText(after, n.x + w / 2, top + h / 2 + 1);
    }
    return h;
  }

  function draw(t: number) {
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    g.fillStyle = st.C.bg;
    g.fillRect(0, 0, st.W, st.H);

    drawGround();
    g.setTransform(st.dpr * cam.z, 0, 0, st.dpr * cam.z, st.dpr * (st.W / 2 - cam.x * cam.z), st.dpr * (st.H / 2 - cam.y * cam.z));
    const m = 400 / cam.z, vx0 = cam.x - st.W / 2 / cam.z - m, vx1 = cam.x + st.W / 2 / cam.z + m;
    const vy0 = cam.y - st.H / 2 / cam.z - m, vy1 = cam.y + st.H / 2 / cam.z + m;
    const seen = (x0: number, y0: number, x1: number, y1: number) => x1 >= vx0 && x0 <= vx1 && y1 >= vy0 && y0 <= vy1;
    const near = (n: GNode, r: number) => seen(n.x - r, n.y - r, n.x + r, n.y + r);
    const linkSeen = ({ a, b }: Link) => seen(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y));
    const hubs = st.anchors.filter((n) => near(n, orbit(n, 2)));
    const dots = st.floaters.filter((n) => near(n, 0));
    for (const n of hubs) drawRing(n);
    for (const L of st.links) if (linkSeen(L)) drawLink(L);
    for (const n of hubs) drawHub(n, t);
    for (const n of dots) drawDot(n, t);
    if (st.ping) drawPing(t);
  }

  function drawPing(t: number) {
    const n = st.ping!.n;
    st.ping!.t0 ??= t;
    const u = (t - st.ping!.t0!) / 1200;
    if (u >= 1 || !nodes.has(n.id)) return (st.ping = null);
    const R = n.R + 6 + u * 40;
    g.beginPath();
    g.arc(n.x, n.y, R, 0, TAU);
    g.strokeStyle = hexA(st.C.hi, 0.9 * (1 - u));
    g.lineWidth = 2.5 / cam.z;
    g.stroke();
  }

  const CELL = 40;
  const tile = { el: document.createElement('canvas'), key: '', pat: null as CanvasPattern | null };
  function drawGround() {
    g.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    const sx = (x: number) => (x - cam.x) * cam.z + st.W / 2, sy = (y: number) => (y - cam.y) * cam.z + st.H / 2;
    const cs = CELL * cam.z, ca = 0.22 * clamp((cs - 12) / 16, 0, 1);
    if (ca > 0) {
      const T = Math.ceil(cs * st.dpr), color = hexA(st.C.hi, ca);
      if (tile.key !== T + color) {
        tile.key = T + color;
        tile.el.width = tile.el.height = T;
        const c = tile.el.getContext('2d')!, r = 1.3, m = cs / 2;
        c.scale(T / cs, T / cs);
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(m, m - r * 1.6);
        c.lineTo(m + r, m);
        c.lineTo(m, m + r * 1.6);
        c.lineTo(m - r, m);
        c.fill();
        tile.pat = g.createPattern(tile.el, 'repeat');
      }
      const x0 = sx(Math.ceil((cam.x - st.W / 2 / cam.z) / CELL) * CELL), y0 = sy(Math.ceil((cam.y - st.H / 2 / cam.z) / CELL) * CELL);
      tile.pat!.setTransform(new DOMMatrix([cs / T, 0, 0, cs / T, x0 - cs / 2, y0 - cs / 2]));
      g.fillStyle = tile.pat!;
      g.fillRect(0, 0, st.W, st.H);
    }
  }

  function drawRing(n: GNode) {
    drawRingOf(n, 1);
    drawRingOf(n, 2);
  }

  function drawRingOf(n: GNode, ring: number) {
    const t = st.drag?.moved && st.drag.n?.kind === 'thought' && st.drag.n;
    if (!t) return;
    const R = reach(n, ring), on = st.drag!.attach === n && st.drag!.ring === ring;
    const e = Math.abs(Math.hypot(t.x - n.x, t.y - n.y) - R) / band();
    const a = on ? 0.7 : Math.max(t.parent === n ? 0.2 : 0, 0.2 * clamp(1 - (e - 1) / 3, 0, 1));
    if (!a) return;
    g.save();
    g.beginPath();
    g.arc(n.x, n.y, R, 0, TAU);
    if (on) {
      g.strokeStyle = hexA(n.color, 0.1);
      g.lineWidth = band() * 2;
      g.stroke();
    }
    g.strokeStyle = hexA(n.color, a);
    g.lineWidth = on ? Math.max(2, 1.5 / cam.z) : Math.max(1, 1 / cam.z);
    g.setLineDash(on ? [] : [6, 6]);
    g.stroke();
    g.restore();
  }

  function hairline(a: Pt, b: Pt, w: number, alpha: number) {
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = mix(st.C.dim, st.C.bg, 0.35);
    g.lineWidth = w / cam.z;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    g.restore();
  }

  function drawLink({ a, b, type }: Link) {
    if (cam.z < FAR) return type === 'core' || type === 'fp' ? hairline(a, b, 1, 0.9) : hairline(a, b, 0.6, 0.45 * (dimmed(b) ? 0.2 : b.fade));
    g.save();
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    if (type === 'core' || type === 'fp') {
      g.strokeStyle = hexA(b.color, 0.55);
      g.lineWidth = type === 'core' ? 2.6 : 2.2;
      g.lineCap = 'round';
    } else {
      g.strokeStyle = b.color;
      g.globalAlpha = (dimmed(b) ? 0.08 : b.fade) * (b.pin ? 0.6 : 1);
      g.lineWidth = 1;
      g.globalAlpha *= 0.35;
    }
    g.stroke();
    g.restore();
  }

  const PULSE = 2400;
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const breath = (t: number, phase = 0) => (still.matches ? 0.5 : 0.5 + 0.5 * st.calm * Math.sin((t / PULSE) * TAU + phase));
  function mark(n: Pick<GNode, 'x' | 'y' | 'kind'>, R: number, path: (r: number) => unknown, col: string, on: boolean, t: number) {
    const k = breath(t);
    const d = 3 * k;
    g.save();
    g.shadowBlur = 0;
    g.strokeStyle = g.fillStyle = col;
    g.globalAlpha *= 0.4 + 0.6 * k;
    if (on) {
      g.lineWidth = 2;
      path(R + d);
      g.stroke();
    } else {
      const f = (R + d) / R;
      g.beginPath();
      for (const p of ringDots(n, R)) {
        g.moveTo(n.x + p.x * f + 1.2, n.y + p.y * f);
        g.arc(n.x + p.x * f, n.y + p.y * f, 1.2, 0, TAU);
      }
      g.fill();
    }
    g.restore();
  }
  function ringDots(n: Pick<GNode, 'kind'>, R: number) {
    const round = n.kind !== 'inbox';
    const corners = Array.from({ length: 6 }, (_, k) => ({ x: Math.cos((k / 6) * TAU + Math.PI / 6) * R, y: Math.sin((k / 6) * TAU + Math.PI / 6) * R }));
    const len = round ? TAU * R : corners.reduce((s, c, i) => s + Math.hypot(corners[(i + 1) % corners.length].x - c.x, corners[(i + 1) % corners.length].y - c.y), 0);
    const N = Math.max(12, Math.round(len / 9));
    const out: Pt[] = [];
    for (let i = 0; i < N; i++) {
      if (round) {
        const a = (i / N) * TAU;
        out.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
        continue;
      }
      let left = (i / N) * len;
      for (let e = 0; e < corners.length; e++) {
        const a = corners[e], b = corners[(e + 1) % corners.length], el = Math.hypot(b.x - a.x, b.y - a.y);
        if (left <= el) {
          out.push({ x: a.x + ((b.x - a.x) * left) / el, y: a.y + ((b.y - a.y) * left) / el });
          break;
        }
        left -= el;
      }
    }
    return out;
  }

  function drawGem(kind: string, x: number, y: number, r: number, color: string) {
    const p = PATHS[kind] || PATHS.note;
    g.save();
    g.translate(x, y);
    g.scale(r, r);
    g.fillStyle = st.C.strong;
    g.fill(p.d);
    g.fillStyle = color;
    g.fill(p.a);
    g.restore();
  }

  function gemHub(n: GNode, kind: string, hot: boolean, countY: number | null, r = HUB_R) {
    const outline = HULL[kind].map(([x, y]) => [x * r, y * r]);
    drawGem(kind, 0, 0, r, n.color);
    if (hot) {
      trace(g, offset(outline, 3));
      g.strokeStyle = n.color;
      g.lineWidth = 1;
      g.stroke();
    }
    if (n.count && countY != null) {
      g.font = FONT(14, true);
      g.textAlign = 'center';
      g.fillStyle = st.C.sel;
      g.fillText(String(n.count), 0, countY);
    }
    return outline;
  }

  function drawHub(n: GNode, t: number) {
    const col = n.color;
    const active = st.view.ctx === n.dir && n.kind !== 'inbox', drop = st.dropTarget === n;
    const hot = drop || st.hover === n || st.drag?.n === n;
    if (cam.z < FAR) return drawFar(n, t, active, hot);
    const o = { tint: drop ? 0.3 : undefined, edge: active || hot ? 1 : undefined };
    g.save();
    g.translate(n.x, n.y);
    g.textBaseline = 'middle';
    let outline;
    if (n.kind === 'inbox' || n.stack) {
      outline = n.stack ? gemHub(n, 'folder', hot, 18) : gemHub(n, 'project', hot, 12);
    } else if (n.fold) {
      const f = n.fold, x0 = f.body[0][0], x1 = f.body[1][0];
      folder(g, st.C as unknown as Colors, col, f, o);
      outline = f.pts;
      g.font = FONT(n.fpx, n.bold);
      g.textAlign = 'left';
      g.fillStyle = st.C.strong;
      g.fillText(n.text, x0 + n.lead, f.mid + 1);
      if (n.count) {
        g.font = FONT(n.fcpx);
        g.textAlign = 'right';
        g.fillStyle = st.C.dim;
        g.fillText(String(n.count), x1 - n.tail, f.mid + 1);
      }
    } else {
      g.beginPath();
      g.arc(0, 0, INBOX_R, 0, TAU);
      g.fillStyle = st.C.bg;
      g.fill();
      outline = gemHub(n, 'inbox', hot, null, INBOX_R);
    }
    if (active) mark(n, 5, (r: number) => trace(g, offset(outline, r)), col, true, t);
    g.restore();
    if (!n.fold) drawLabel(n, n.y + (n.nbot ?? n.bot), n.kind === 'vein' && n.count ? String(n.count) : '');
  }

  const farK = () => clamp(Math.sqrt(cam.z / 0.3), 0.45, 1);
  const farSide = (n: GNode) => (n.kind === 'inbox' ? 24 : clamp(5 + 2.2 * Math.sqrt(n.count || 0), 6, 18)) * farK();
  function drawFar(n: GNode, t: number, active: boolean, hot: boolean) {
    const z = cam.z, s = farSide(n) / z, look = farLook(), c = n.color;
    const root = n.kind === 'inbox', soft = look === 'soft';
    const square = (dx: number, dy: number, a: number) => {
      g.beginPath();
      g.roundRect(n.x + dx - a / 2, n.y + dy - a / 2, a, a, soft ? a * 0.24 : 0);
    };
    const line = (w: number, color: string, alpha: number) => {
      g.globalAlpha = alpha;
      g.strokeStyle = color;
      g.lineWidth = w / z;
      g.stroke();
      g.globalAlpha = 1;
    };
    g.save();
    if (look === 'marks' || n.kind === 'vein') {
      const p = PATHS[root ? 'project' : n.kind === 'vein' ? 'inbox' : n.stack ? 'folder' : 'file'];
      g.translate(n.x, n.y);
      g.scale(s * 0.6, s * 0.6);
      g.fillStyle = st.C.strong;
      g.fill(p.d);
      g.fillStyle = c;
      g.fill(p.a);
      g.setTransform(st.dpr * z, 0, 0, st.dpr * z, st.dpr * (st.W / 2 - cam.x * z), st.dpr * (st.H / 2 - cam.y * z));
    } else {
      if (root) for (const [k, a] of soft ? [[3.2, 0.75]] : [[6, 0.5], [3, 0.8]]) (square(k / z, -k / z, s), line(soft ? 1 : 0.9, c, a));
      square(0, 0, s);
      g.fillStyle = c;
      g.fill();
      if (!soft) {
        const x1 = n.x + s / 2 - 0.6 / z, y0 = n.y - s / 2 + 0.6 / z;
        g.beginPath();
        g.moveTo(n.x - s * 0.05, y0);
        g.lineTo(x1, y0);
        g.lineTo(x1, n.y + s * 0.05);
        line(0.9, st.C.light ? '#ffffff' : st.C.strong, 0.85);
      }
    }
    if (hot) (square(0, 0, s + 7 / z), line(0.6, st.C.fg, 0.9));
    if (active) (square(0, 0, s + (8 + 2 * breath(t)) / z), line(1, c, 1));
    g.restore();
    if (hot) drawLabel(n, n.y + s / 2 + 6 / z);
  }
  function drawFarDot(n: GNode, t: number) {
    const z = cam.z / farK(), hot = st.hover === n || st.drag?.n === n;
    n.lw = 8;
    g.save();
    g.globalAlpha = alphaOf(n);
    g.fillStyle = g.strokeStyle = n.color;
    g.beginPath();
    g.arc(n.x, n.y, (hot ? 3 : 2.2) / z, 0, TAU);
    g.fill();
    if (st.view.open === n.path) {
      g.beginPath();
      g.arc(n.x, n.y, (5 + 1.5 * breath(t)) / z, 0, TAU);
      g.lineWidth = 1 / z;
      g.stroke();
    }
    g.restore();
  }

  function drawDot(n: GNode, t: number) {
    if (cam.z < FAR) return drawFarDot(n, t);
    g.save();
    g.globalAlpha = alphaOf(n);
    const hot = st.hover === n || st.drag?.n === n;
    const open = st.view.open === n.path;
    if (Math.abs(n.x - n.parent.x) > 24) n.side = n.x < n.parent.x ? -1 : 1;
    n.side ??= 1;
    const named = cam.z >= FAR || hot || open;
    const k = (n.k = clamp(12 / (12.5 * cam.z), 1, CHIP_K));
    if (named) {
      const label = chipLabel(n);
      g.font = FONT(12.5 * k, open);
      const tw = g.measureText(label).width, cw = tw + CHIP_PAD * k, H = CHIP_H * k;
      const x0 = n.side > 0 ? n.x - 12 * k : n.x + 12 * k - cw;
      n.lw = cw - 12 * k;
      page(g, st.C as unknown as Colors, pageOf(x0, n.y - H / 2, cw, H, n.side, false, 5 * k), open ? { edge: st.C.hi, width: 1.6 } : hot ? { hot: true } : {});
      g.textBaseline = 'middle';
      g.textAlign = n.side > 0 ? 'left' : 'right';
      g.fillStyle = hot || open ? st.C.strong : st.C.fg;
      const tx = n.x + n.side * 12 * k;
      g.fillText(label, tx, n.y + k);
    } else n.lw = 8;
    const s = named ? 4.5 * k : hot ? 6.5 : 5;
    g.fillStyle = g.strokeStyle = n.color;
    g.lineWidth = 1.6;
    drawGem(gemOfNode(n), n.x, n.y, s * 1.3, n.color);
    g.globalAlpha = alphaOf(n);
    if (!named && open) mark({ x: n.x, y: n.y, kind: 'folder' }, s + 8, (r: number) => (g.beginPath(), g.arc(n.x, n.y, r, 0, TAU)), n.color, true, t);
    g.restore();
  }

  return { draw, farSide, band };
}
