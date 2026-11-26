type Blocks = [number, number, number, number, number];

const BLOCKS: Blocks[] = [
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

const ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const EXP: number[] = new Array(512);
const LOG: number[] = new Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function generator(n: number): number[] {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function ecBytes(data: number[], n: number): number[] {
  const g = generator(n);
  const rem = new Array(n).fill(0);
  for (const d of data) {
    const factor = d ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], factor);
  }
  return rem;
}

function dataCapacity(v: number): number {
  const [, b1, d1, b2, d2] = BLOCKS[v - 1];
  return b1 * d1 + b2 * d2;
}

function codewords(bytes: Uint8Array, v: number): number[] {
  const bits: number[] = [];
  const put = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCapacity(v) * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    data.push(byte);
  }
  for (let pad = 0xec; data.length < cap / 8; pad ^= 0xec ^ 0x11) data.push(pad);
  const [ec, b1, d1, b2, d2] = BLOCKS[v - 1];
  const blocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < b1 + b2; i++) {
    const len = i < b1 ? d1 : d2;
    blocks.push(data.slice(at, at + len));
    at += len;
  }
  const ecs = blocks.map((b) => ecBytes(b, ec));
  const out: number[] = [];
  const longest = Math.max(d1, d2);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) out.push(e[i]);
  return out;
}

function bch(value: number, poly: number, polyBits: number, dataBits: number): number {
  let rem = value << (polyBits - 1);
  for (let i = dataBits + polyBits - 2; i >= polyBits - 1; i--) {
    if ((rem >>> i) & 1) rem ^= poly << (i - polyBits + 1);
  }
  return (value << (polyBits - 1)) | rem;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

class Grid {
  size: number;
  dark: boolean[][];
  fixed: boolean[][];

  constructor(size: number) {
    this.size = size;
    this.dark = Array.from({ length: size }, () => new Array(size).fill(false));
    this.fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  }

  set(x: number, y: number, on: boolean) {
    this.dark[y][x] = on;
    this.fixed[y][x] = true;
  }
}

function drawFormat(g: Grid, mask: number) {
  const bits = bch(mask, 0x537, 11, 5) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  const n = g.size;
  for (let i = 0; i <= 5; i++) g.set(8, i, bit(i));
  g.set(8, 7, bit(6));
  g.set(8, 8, bit(7));
  g.set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) g.set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) g.set(n - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) g.set(8, n - 15 + i, bit(i));
  g.set(8, n - 8, true);
}

function drawFunctions(g: Grid, v: number) {
  const n = g.size;
  for (let i = 0; i < n; i++) {
    g.set(6, i, i % 2 === 0);
    g.set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        g.set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const pos = ALIGN[v - 1];
  const last = pos.length - 1;
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          g.set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  drawFormat(g, 0);
  if (v >= 7) {
    const bits = bch(v, 0x1f25, 13, 6);
    for (let i = 0; i < 18; i++) {
      const on = ((bits >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      g.set(a, b, on);
      g.set(b, a, on);
    }
  }
}

function drawData(g: Grid, data: number[]) {
  const n = g.size;
  let i = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? n - 1 - vert : vert;
        if (g.fixed[y][x]) continue;
        if (i < data.length * 8) {
          g.dark[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
}

function applyMask(g: Grid, mask: number) {
  for (let y = 0; y < g.size; y++) {
    for (let x = 0; x < g.size; x++) {
      if (!g.fixed[y][x] && maskBit(mask, x, y)) g.dark[y][x] = !g.dark[y][x];
    }
  }
}

const FINDER_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
const FINDER_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

function lineScore(line: boolean[]): number {
  let score = 0;
  let run = 1;
  for (let i = 1; i <= line.length; i++) {
    if (i < line.length && line[i] === line[i - 1]) {
      run++;
    } else {
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
  }
  const padded = [0, 0, 0, 0, ...line.map((b) => (b ? 1 : 0)), 0, 0, 0, 0];
  for (let i = 0; i + 11 <= padded.length; i++) {
    let a = true;
    let b = true;
    for (let k = 0; k < 11; k++) {
      if (padded[i + k] !== FINDER_A[k]) a = false;
      if (padded[i + k] !== FINDER_B[k]) b = false;
    }
    if (a) score += 40;
    if (b) score += 40;
  }
  return score;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  for (let y = 0; y < n; y++) score += lineScore(m[y]);
  for (let x = 0; x < n; x++) score += lineScore(m.map((row) => row[x]));
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  let v = 1;
  while (v <= BLOCKS.length && bytes.length + (v < 10 ? 2 : 3) > dataCapacity(v)) v++;
  if (v > BLOCKS.length) throw new Error(`Text too long for a QR code (${bytes.length} bytes)`);
  const data = codewords(bytes, v);
  const size = v * 4 + 17;
  let best: boolean[][] = [];
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = new Grid(size);
    drawFunctions(g, v);
    drawData(g, data);
    applyMask(g, mask);
    drawFormat(g, mask);
    const score = penalty(g.dark);
    if (score < bestScore) {
      bestScore = score;
      best = g.dark;
    }
  }
  return best;
}

export function qrSvg(text: string, px = 4): string {
  const m = qrMatrix(text);
  const quiet = 4;
  const total = m.length + quiet * 2;
  let d = "";
  for (let y = 0; y < m.length; y++) {
    let x = 0;
    while (x < m.length) {
      if (!m[y][x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < m.length && m[y][end]) end++;
      d += `M${x + quiet} ${y + quiet}h${end - x}v1h${x - end}z`;
      x = end;
    }
  }
  const side = total * px;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${side}" height="${side}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
