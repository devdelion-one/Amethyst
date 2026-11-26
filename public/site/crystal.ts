const T = [164.29, 12.5], L = [75.24, 79.03], K = [123.71, 122.46], M = [168.8, 130.77], R = [224.04, 121.53], B = [132.73, 243.5];
const BELT = [[64.91, 69.78], L, K, M, R, [237.71, 119.25]];
type Ctx = CanvasRenderingContext2D;
type Pix = { x: number; y: number; key: string; s: number; chip?: boolean; out: number[]; ring: number; fill: string };
const FACES: Record<string, number[][]> = { ul: [T, L, K], mu: [T, K, M], ru: [T, M, R], ll: [L, K, B], ml: [K, M, B], rl: [M, R, B] };
const CHIPS: Record<string, number[][]> = { c0: [[38.88, 106.63], [74.11, 128.58], [49.45, 129.16]], c1: [[57.9, 136.09], [79.04, 137.82], [79.04, 164.38]], c2: [[58.61, 152.83], [76.22, 176.51], [70.59, 196.15]] };
const BY_WALL: Record<string, string> = { ul: '#8A2BE2', mu: '#A152EE', ru: '#C08DF8', ll: '#5A14A6', ml: '#7220C6', rl: '#8A2BE2', c0: '#5A14A6', c1: '#8A2BE2', c2: '#A152EE' };
const PURPLES = ['#2e1270', '#3d1890', '#4a1ca8', '#5a22c4', '#6c1fe0', '#7a35ec', '#8a3dff', '#9a55ff', '#a66bff', '#b48aff', '#c4a3ff'];
const PURPLE = '#8831fe', SHADOW = '#2a1c58', DIM = '#8a82a6', TYPED = '#cfc8e6', HOT = '#f1e8ff', PINK = '#ff5ad6', CYAN = '#5ee6ff';
const X0 = 3.46, CX = X0 + 128, W = 256, H = 296, EDGE = 6;
const PITCH = 2.8, SIZE = 2.18, ICON_SCALE = 0.7, CMD = 'amethyst run', CW = 7.8, BASE = 281;

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const toLine = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const onBelt = (x: number, y: number) => BELT.slice(1).some((b, i) => toLine([x, y], BELT[i], b) < PITCH * 0.72);
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => ((x = clamp(x)) < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };
const inside = (x: number, y: number, poly: number[][]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const origin = (pitch: number) => { const n = Math.ceil(220 / pitch); return [T[0] - pitch / 2 - pitch * n, T[1] - 0.5, 2 * n]; };

function loose(regions: Record<string, number[][]>, pitch: number) {
  const [gx0, gy0, cols] = origin(pitch), out: { x: number; y: number; key: string }[] = [], list = Object.entries(regions);
  const box = list.map(([, p]) => [Math.min(...p.map((q) => q[0])) - pitch, Math.max(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])) - pitch, Math.max(...p.map((q) => q[1]))]);
  for (let gy = 0; gy < 256 / pitch; gy++) for (let gx = 0; gx < cols; gx++) {
    const x = gx0 + gx * pitch, y = gy0 + gy * pitch, hits: Record<string, number> = {};
    let n = 0;
    list.forEach(([k, poly], r) => {
      if (x < box[r][0] || x > box[r][1] || y < box[r][2] || y > box[r][3]) return;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if (inside(x + (i * pitch) / 5, y + (j * pitch) / 5, poly)) { hits[k] = (hits[k] || 0) + 1; n++; }
    });
    const key = Object.keys(hits).sort((a, b) => hits[b] - hits[a])[0];
    if (key && n / 36 >= 0.45) out.push({ x: x + pitch / 2, y: y + pitch / 2, key });
  }
  return out;
}

const stroke = (g: Ctx, w: number, ...lines: number[][][]) => { g.lineWidth = w; for (const pts of lines) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); } };
const spark = (g: Ctx, x: number, y: number, r: number, k = 0.16) => {
  g.beginPath(); g.moveTo(x, y - r);
  for (const [a, b, i, j] of [[r, 0, 1, -1], [0, r, 1, 1], [-r, 0, -1, 1], [0, -r, -1, -1]]) g.quadraticCurveTo(x + i * r * k, y + j * r * k, x + a, y + b);
  g.fill();
};
const ICONS: ((g: Ctx) => unknown)[] = [
  (g: Ctx) => { g.strokeRect(CX - 96, 52, 192, 152); g.fillRect(CX - 96, 52, 192, 30); stroke(g, 14, [[CX - 62, 106], [CX - 30, 134], [CX - 62, 162]], [[CX - 6, 164], [CX + 52, 164]]); },
  (g: Ctx) => { spark(g, CX - 20, 142, 98); spark(g, CX + 72, 56, 42); spark(g, CX + 78, 196, 26); },
  (g: Ctx) => stroke(g, 20, [[CX - 52, 74], [CX - 104, 128], [CX - 52, 182]], [[CX + 52, 74], [CX + 104, 128], [CX + 52, 182]], [[CX + 20, 58], [CX - 20, 198]]),
];

export const UNIT = { W, H, PITCH, SIZE, X0 };
export { stroke, spark, mix };
export type { Ctx };

export function sample(paint: (g: Ctx) => unknown, n: number, shift = 0) {
  const paper = Object.assign(document.createElement('canvas'), { width: W, height: W }), g = paper.getContext('2d', { willReadFrequently: true })!, on: number[][] = [];
  g.translate(-shift, 0);
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineWidth = 12;
  g.lineCap = g.lineJoin = 'round';
  paint(g);
  const data = g.getImageData(0, 0, W, W).data;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (data[4 * (Math.floor(((j + 0.5) * W) / n) * W + Math.floor(((i + 0.5) * W) / n)) + 3] > 128) on.push([i, j]);
  return on;
}

export function crystalPixels(palette = 'purple') {
  let seed = 20261113;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const core = [(K[0] + M[0]) / 2, (K[1] + M[1]) / 2], outOf: Record<string, number[]> = {};
  for (const [key, poly] of [...Object.entries(FACES), ...Object.entries(CHIPS)]) {
    const m = [poly.reduce((a, q) => a + q[0], 0) / poly.length, poly.reduce((a, q) => a + q[1], 0) / poly.length], d = dist(m, core) || 1;
    outOf[key] = [(m[0] - core[0]) / d, (m[1] - core[1]) / d];
  }
  const px = [...loose(FACES, PITCH).filter((c) => !onBelt(c.x, c.y)).map((c) => ({ ...c, s: SIZE })), ...loose(CHIPS, PITCH / 2).map((c) => ({ ...c, s: SIZE / 2, chip: true }))] as Pix[];
  for (const c of px) {
    c.out = outOf[c.key];
    c.ring = (c.y - T[1]) / (B[1] - T[1]);
    c.fill = palette === 'purples' ? PURPLES[(rand() * PURPLES.length) | 0] : BY_WALL[c.key];
  }
  return px.sort((a, b) => (a.fill < b.fill ? -1 : a.fill > b.fill ? 1 : 0));
}

const TYPE = 0.075, MOVE = 0.8, IN_SPREAD = 0.7, OUT_SPREAD = 0.45, RUN = 1.5;
const tType = 2.4, tEnter = tType + CMD.length * TYPE + 0.3, tForm = tEnter + 0.1, tFormed = tForm + IN_SPREAD + MOVE;
const tClose = tFormed + 0.35, tDone = tClose + RUN + 0.15, tBack = tDone + 2.8, tLeave = tBack + 0.15, LOOP = tLeave + OUT_SPREAD + MOVE;

export function crystal(canvas: HTMLCanvasElement, { palette = 'purple', work = false, releases = false } = {}) {
  let seed = 20261113;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  const px = crystalPixels(palette);
  const at = px.map(() => [0, 0, 0]);

  const paper = document.createElement('canvas');
  paper.width = paper.height = W;
  function iconCells(kind: number) {
    const g = paper.getContext('2d', { willReadFrequently: true })!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W); g.setTransform(1, 0, 0, 1, -X0, 0);
    g.fillStyle = g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'butt'; g.lineJoin = 'miter';
    g.translate(CX, 128); g.scale(ICON_SCALE, ICON_SCALE); g.translate(-CX, -128);
    ICONS[kind](g);
    const data = g.getImageData(0, 0, W, W).data, [gx0, gy0, cols] = origin(PITCH), on: number[][] = [];
    for (let j = 0; j < 256 / PITCH; j++) for (let i = 0; i < cols; i++) {
      const x = gx0 + (i + 0.5) * PITCH, y = gy0 + (j + 0.5) * PITCH;
      if (x > X0 + EDGE && x < X0 + W - EDGE && y > EDGE && y < W - EDGE && data[4 * (Math.round(y) * W + Math.round(x - X0)) + 3] > 128) on.push([x, y]);
    }
    return shuffle(on);
  }
  function stand(kind: number) {
    const on = iconCells(kind), mains = px.filter((c) => !c.chip);
    let use = mains;
    if (on.length < mains.length) {
      const rows = [...mains].sort((a, b) => a.y - b.y || a.x - b.x), step = rows.length / on.length;
      use = on.map((_, i) => rows[Math.floor(i * step)]);
    }
    const map = new Map<Pix, number[]>(), a = [...use].sort((p, q) => p.x - q.x), b = on.slice(0, use.length).sort((p, q) => p[0] - q[0]);
    const strips = Math.max(1, Math.round(Math.sqrt(a.length) / 1.5));
    for (let k = 0; k < strips; k++) {
      const lo = Math.floor((k * a.length) / strips), hi = Math.floor(((k + 1) * a.length) / strips);
      const sa = a.slice(lo, hi).sort((p, q) => p.y - q.y), sb = b.slice(lo, hi).sort((p, q) => p[1] - q[1]);
      sa.forEach((c, i) => map.set(c, [sb[i][0], sb[i][1], 1]));
    }
    return px.map((c) => map.get(c) || [c.x, c.y, 0]);
  }
  let icon = 0, here = stand(0), next = stand(1), build = 0, cmd = releases ? 'release 0.0.0' : CMD, typing = false, tc = 0;
  const SAY = 3.6;

  const g = canvas.getContext('2d')!;
  const cell = (n: number, i: number) => CX - (n * CW) / 2 + (i + 0.5) * CW;
  function prompt(typed: number, t: number) {
    const n = cmd.length + 2;
    g.fillStyle = PURPLE; g.fillText('>', cell(n, 0), BASE);
    g.fillStyle = TYPED;
    for (let i = 0; i < typed; i++) g.fillText(cmd[i], cell(n, i + 2), BASE);
    if (t % 0.9 < 0.5 || (typed && typed < cmd.length)) { g.fillStyle = PURPLE; g.fillRect(cell(n, typed + 2) - CW / 2 + 0.6, BASE - 11, 1.6, 14); }
  }
  function working(t: number) {
    const word = 'Crystallizing', n = word.length + 2, x = cell(n, 0), y = BASE - 4.7, cross = t % 0.7 > 0.35;
    g.fillStyle = PURPLE;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) if ((!i && !j) || ((i && j ? 1 : 0) === (cross ? 1 : 0))) g.fillRect(x + i * 3.3 - 1.3, y + j * 3.3 - 1.3, 2.6, 2.6);
    [...word].forEach((s, i) => {
      const ph = (((t * 0.8 - i * 0.055) % 1) + 1) % 1;
      g.fillStyle = mix(DIM, HOT, ph < 0.14 ? ph / 0.14 : ph < 0.45 ? 1 - (ph - 0.14) / 0.31 : 0);
      g.fillText(s, cell(n, i + 2), BASE);
    });
  }

  function draw(t: number) {
    const k = canvas.width / W;
    g.setTransform(k, 0, 0, k, -X0 * k, 0);
    g.clearRect(X0, 0, W, H);
    const back = 1 - clamp((t - tBack) / 0.3), closed = ease((t - tClose) / RUN) * back;
    opened = closed;
    const gap = 2.6 * ease((t - tClose) / (RUN * 0.85)) * back, shine = clamp((t - tDone) / 0.4) * (1 - clamp((t - tBack + 0.5) / 0.5));
    const rise = clamp(since / 0.6);
    if (closed > 0) {
      g.globalAlpha = rise;
      g.fillStyle = SHADOW;
      const o = 3.2 * closed;
      for (const c of px) g.fillRect(c.x - c.s / 2 + o + c.out[0] * gap, c.y - c.s / 2 + o + c.out[1] * gap, c.s, c.s);
    }
    let fill = '';
    px.forEach((c, i) => {
      const a = t < tLeave ? ease((t - tForm - c.ring * IN_SPREAD) / MOVE) : 1 - ease((t - tLeave - (1 - c.ring) * OUT_SPREAD) / MOVE);
      const from = t < tLeave ? here[i] : next[i];
      const x = from[0] + (c.x - from[0]) * a + c.out[0] * gap, y = from[1] + (c.y - from[1]) * a + c.out[1] * gap;
      at[i][0] = x; at[i][1] = y; at[i][2] = !from[2] && a <= 0 ? 0 : from[2] ? 1 : Math.min(1, a * 1.6);
      if (!at[i][2]) return;
      g.globalAlpha = at[i][2];
      let color = c.fill;
      if (c.chip && shine > 0) {
        const ph = (((t - tDone) * 0.75 - (c.y - 105) / 110) % 1 + 1) % 1, glow = ph < 0.5 ? Math.sin(ph * 2 * Math.PI) ** 2 : 0;
        color = mix(c.fill, mix(PINK, CYAN, clamp((c.y - 110) / 75)), (0.3 + 0.7 * glow) * shine);
      }
      if (color !== fill) g.fillStyle = fill = color;
      g.fillRect(x - c.s / 2, y - c.s / 2, c.s, c.s);
    });
    g.globalAlpha = rise;
    g.font = "13px 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace"; g.textAlign = 'center';
    if (work) working(t);
    else if (t < tEnter) prompt(Math.max(0, Math.min(cmd.length, Math.floor(((t - tType) / TYPE) * Math.min(1, CMD.length / cmd.length)))), t);
    else if (t < tDone) working(t);
    else prompt(0, t);
    g.globalAlpha = 1;
  }

  const fit = () => {
    const w = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1)) || W;
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round((w * H) / W); }
  };
  const css = (x: number, y: number) => { const u = canvas.clientWidth / W; return [(x - X0) * u, y * u]; };
  let paused = false, t = tFormed, last = 0, since = 9, opened = 0;
  const api = {
    unit: () => canvas.clientWidth / W,
    formed: (shut = false) => px.map((c) => { const [x, y] = css(c.x + (shut ? c.out[0] * 2.6 : 0), c.y + (shut ? c.out[1] * 2.6 : 0)); return { x, y, fill: c.fill, chip: !!c.chip, a: 1 }; }),
    snapshot: () => px.map((c, i) => { const [x, y] = css(at[i][0], at[i][1]); return { x, y, fill: c.fill, chip: !!c.chip, key: c.key, a: at[i][2] }; }),
    running: () => !paused,
    opened: () => (paused ? 0 : opened),
    type: () => { typing = releases; tc = 0; },
    pause: () => { paused = true; typing = false; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height); },
    resume: (shut = false) => { paused = false; typing = false; t = shut ? tDone : tFormed; last = 0; since = 0; fit(); draw(t); },
  };
  fit();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { draw(tDone + 1); addEventListener('resize', () => { fit(); draw(tDone + 1); }); return api; }
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(now - last, 100) / 1000 : 0;
    last = now;
    if (paused && typing) {
      tc += dt;
      if (tc >= SAY) { tc -= SAY; cmd = `release 0.0.${++build}`; }
      fit();
      const k = canvas.width / W;
      g.setTransform(k, 0, 0, k, -X0 * k, 0);
      g.clearRect(X0, 0, W, H);
      g.font = "13px 'Cascadia Mono', Consolas, 'SF Mono', Menlo, monospace"; g.textAlign = 'center';
      prompt(Math.min(cmd.length, Math.floor(tc / TYPE)), tc);
      return;
    }
    if (paused) return void (last = 0);
    const r = canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    fit();
    t += dt;
    since += dt;
    if (t >= LOOP) { t -= LOOP; if (releases) cmd = `release 0.0.${++build}`; icon = (icon + 1) % ICONS.length; here = next; next = stand((icon + 1) % ICONS.length); }
    draw(t);
  };
  requestAnimationFrame(frame);
  return api;
}
