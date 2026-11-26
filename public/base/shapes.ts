type Ctx = CanvasRenderingContext2D;
type Colors = Record<string, string>;

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const rect = (x0: number, y0: number, x1: number, y1: number): number[][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function trace(g: Ctx, ps: number[][]) {
  g.beginPath();
  g.moveTo(ps[0][0], ps[0][1]);
  for (let i = 1; i < ps.length; i++) g.lineTo(ps[i][0], ps[i][1]);
  g.closePath();
}

export function offset(ps: number[][], d: number): number[][] {
  let A = 0;
  ps.forEach((a, i) => {
    const b = ps[(i + 1) % ps.length];
    A += a[0] * b[1] - b[0] * a[1];
  });
  const s = A > 0 ? 1 : -1;
  const N = ps.map((a, i) => {
    const b = ps[(i + 1) % ps.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    return [(s * dy) / L, (-s * dx) / L];
  });
  return ps.map((p, i) => {
    const a = N[(i - 1 + ps.length) % ps.length], b = N[i], k = Math.max(0.3, 1 + a[0] * b[0] + a[1] * b[1]);
    return [p[0] + (d * (a[0] + b[0])) / k, p[1] + (d * (a[1] + b[1])) / k];
  });
}

export function folderOf(w: number, h: number, tb: number, tw: number) {
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2 + tb / 2, y1 = y0 + h;
  const tab = [[x0, y0 - tb], [x0 + tw, y0 - tb], [x0 + tw + tb, y0], [x0, y0]];
  return { pts: [tab[0], tab[1], tab[2], [x1, y0], [x1, y1], [x0, y1]], tab, body: rect(x0, y0, x1, y1), mid: (y0 + y1) / 2 };
}

export function folder(g: Ctx, C: Colors, col: string, f: { pts: number[][]; tab: number[][] }, o: { tint?: number; edge?: number } = {}) {
  trace(g, f.pts);
  g.fillStyle = C.card;
  g.fill();
  g.fillStyle = rgba(col, o.tint ?? 0.13);
  g.fill();
  trace(g, f.tab);
  g.fillStyle = rgba(col, 0.85);
  g.fill();
  if (!o.edge) return;
  trace(g, f.pts);
  g.strokeStyle = rgba(col, o.edge);
  g.lineWidth = 1.4;
  g.stroke();
}

export function pageOf(x0: number, y0: number, L: number, H: number, side: number, todo: unknown, k = 5): number[][] {
  const y1 = y0 + H;
  const shape = todo ? rect(0, y0, L, y1) : [[0, y0], [L - k, y0], [L, y0 + k], [L, y1], [0, y1]];
  return shape.map(([u, y]) => [side > 0 ? x0 + u : x0 + L - u, y]);
}

export function page(g: Ctx, C: Colors, pts: number[][], o: { hot?: boolean; edge?: string; width?: number } = {}) {
  trace(g, pts);
  g.fillStyle = o.hot ? C.card2 : C.card;
  g.fill();
  if (!o.edge) return;
  g.strokeStyle = o.edge;
  g.lineWidth = o.width || 1;
  g.stroke();
}
