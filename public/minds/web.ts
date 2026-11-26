import { DEFAULT, NAME } from '../base/kinds.ts';
import { col, mix, theme } from '../base/theme.ts';
import { folderOf } from '../base/shapes.ts';
import { CHIP_H, CHIP_K, CHIP_PAD, FAR, FONT, STACK, TAU, ZMIN, chipLabel, clamp, orbit, painter, reach } from './paint.ts';
import type { Cb, GNode, Park, Placed, Pt, Snap, Spot, St, Theme, View } from './paint.ts';
import type { Folder, Note } from '../base/types.ts';
import { onSize } from '../base/measure.ts';
import { track } from '../base/util.ts';

type Target = { path?: string | null; dir?: string; max?: number };
type Calls = Record<string, (...a: unknown[]) => unknown>;

const DAY = 864e5;
const fadeOf = (touched: number) => clamp(1 - ((Date.now() - touched) / DAY - 14) / 46, 0, 1) * 0.7 + 0.3;

const scaleOf = (n: GNode) => (n.kind !== 'folder' || n.stack ? 1 : Math.max(0.25, 0.5 ** (n.lv || 0)));

export function createWeb(canvas: HTMLCanvasElement, cb: Cb) {
  const g = canvas.getContext('2d')!;
  const nodes = new Map<string, GNode>();
  const cam: St['cam'] = { x: 0, y: 0, z: 1, tx: null, ty: null, tz: null };
  const st: St = {
    g,
    nodes,
    cam,
    cb,
    C: null as unknown as Theme,
    links: [],
    anchors: [],
    floaters: [],
    W: 0,
    H: 0,
    dpr: 1,
    hover: null,
    drag: null,
    dropTarget: null,
    ping: null,
    view: { open: null, ctx: '', match: null },
    calm: 1,
  };
  const { draw, farSide, band } = painter(st);
  function readTheme() {
    const t = theme();
    st.C = { strong: t['text-strong'], bg: t.bg, fg: t.text, dim: t['text-dim'], line: t.line, hi: t.accent, sel: t.raised, card: mix(t.bg, t.text, 0.1), card2: mix(t.bg, t.text, 0.16), light: document.documentElement.hasAttribute('data-light') };
  }
  readTheme();

  let follow: { n: GNode; dx: number; dy: number; until: number } | null = null, pending: Target | null = null;
  let running = false, raf = 0, gen = 0, fitted = false;
  let level: string | null = null, intro = false;
  const cams = cb.cams || new Map();

  onSize(canvas, { name: 'mind.size', live: true, write: () => resize() });
  function resize() {
    wake();
    st.dpr = window.devicePixelRatio || 1;
    st.W = canvas.clientWidth;
    st.H = canvas.clientHeight;
    canvas.width = Math.round(st.W * st.dpr);
    canvas.height = Math.round(st.H * st.dpr);
  }

  function upsert(id: string, props: Partial<GNode>) {
    let n = nodes.get(id);
    if (!n) {
      n = { id, x: 0, y: 0, vx: 0, vy: 0, fresh: true, phase: Math.random() * TAU } as GNode;
      nodes.set(id, n);
    }
    Object.assign(n, props);
    n.gen = gen;
    n.kids = 0;
    n.around = [];
    n.ext = 0;
    return n;
  }

  function put(n: GNode, saved: Pt | null | undefined, x: number, y: number) {
    n.x = saved ? saved.x : x;
    n.y = saved ? saved.y : y;
  }

  function spotOf(n: GNode, saved: Spot | undefined) {
    n.spot = n.fresh && saved?.rel ? saved : null;
    n.free = n.fresh && !n.spot;
  }

  function addThought(t: Note, parent: GNode) {
    const n = upsert('f:' + t.path, { kind: 'thought', label: t.title, path: t.path, color: col(t.color) as string, touched: t.touched, fade: fadeOf(t.touched), parent, board: !!t.board, file: !!(t.file || t.code), mtime: t.mtime });
    if (st.drag?.n !== n) {
      n.pin = (t.meta.pin as Park | null) || null;
      n.ring = t.meta.ring === 2 ? 2 : 1;
    }
    parent.kids++;
    if (n.fresh && n.pin) {
      n.x = parent.x + n.pin.dx;
      n.y = parent.y + n.pin.dy;
    }
    parent.around.push(n);
    st.links.push({ a: parent, b: n, type: 'file' });
    return n;
  }

  const ROW = CHIP_H * CHIP_K + 5, CHIP_GAP = 8, MARK = 12 * CHIP_K;
  function spots(hub: GNode) {
    const list = hub.around.filter((n) => !n.pin);
    g.font = FONT(12.5 * CHIP_K);
    for (const n of list) n.cw = g.measureText(chipLabel(n)).width + CHIP_PAD * CHIP_K;
    onRing(hub, list) || onRows(hub, list);
    hub.ext = 0;
    for (const n of list) {
      n.side = n.hx < 0 ? -1 : 1;
      hub.ext = Math.max(hub.ext, Math.hypot(Math.abs(n.hx) + n.cw, Math.abs(n.hy) + ROW / 2));
      if (n.fresh) {
        n.x = hub.x + n.hx;
        n.y = hub.y + n.hy;
      }
    }
  }
  const chipX = (x: number, n: GNode, side: number) => (side < 0 ? [x - n.cw + MARK, x + MARK] : [x - MARK, x + n.cw - MARK]);
  function onRing(hub: GNode, list: GNode[]) {
    for (const ring of [1, 2]) {
      const on = list.filter((n) => n.ring === ring), r = orbit(hub, ring);
      on.forEach((n, i) => {
        const a = -Math.PI / 2 + (i / on.length) * TAU;
        n.hx = Math.cos(a) * r;
        n.hy = Math.sin(a) * r;
      });
    }
    return list.every((a, i) => {
      const [x0, x1] = chipX(a.hx, a, a.hx < 0 ? -1 : 1);
      return list.slice(0, i).every((b) => {
        const [u0, u1] = chipX(b.hx, b, b.hx < 0 ? -1 : 1);
        return Math.abs(a.hy - b.hy) >= ROW || x1 + CHIP_GAP <= u0 || u1 + CHIP_GAP <= x0;
      });
    });
  }
  function onRows(hub: GNode, list: GNode[]) {
    const ends = new Map<number, number>();
    for (const ring of [1, 2])
      for (const n of list) {
        if (n.ring !== ring) continue;
        const r = orbit(hub, ring);
        let best: { d: number; row: number; side: number; at: number; y: number } | null = null;
        for (let i = 0; ROW * i < (best?.d ?? Infinity); i++)
          for (const row of i ? [i, -i] : [0])
            for (const side of [1, -1]) {
              const y = row * ROW, at = Math.max(ends.get(row * 2 + (side + 1) / 2) ?? 0, Math.sqrt(Math.max(0, r * r - y * y)));
              const d = Math.hypot(at, y);
              if (!best || d < best.d) best = { d, row, side, at, y };
            }
        ends.set(best!.row * 2 + (best!.side + 1) / 2, best!.at + n.cw + CHIP_GAP);
        n.hx = best!.side * (best!.at + MARK);
        n.hy = best!.y;
      }
  }

  function finish() {
    for (const [id, n] of nodes) if (n.gen !== gen) nodes.delete(id);
    st.anchors = [];
    st.floaters = [];
    for (const n of nodes.values()) (n.kind === 'thought' ? st.floaters : st.anchors).push(n);
    measure();
    for (const n of st.anchors) spots(n);
    spread();
    let fresh = false;
    for (const n of nodes.values()) {
      fresh ||= n.fresh;
      n.fresh = false;
    }
    if (fresh) touch();
    if (st.hover && !nodes.has(st.hover.id)) st.hover = null;
    if (!fitted && st.W) {
      fit();
      fitted = true;
    }
  }

  let inboxDir: string | null = null, tops: { main: GNode; vein: GNode } | null = null;
  let saved: Record<string, unknown> = {};
  function setData({ roots, inbox = null, layout = {}, color }: { roots: Folder[]; inbox?: Folder | null; layout?: Record<string, unknown>; color?: string | null }) {
    gen++;
    saved = layout;
    st.links = [];
    const keyOf = (c: Folder) => (c.kind === 'inbox' ? '#inbox:' + c.id : c.path);
    const hubOf = (c: Folder) => {
      const id = c.kind === 'inbox' ? 'i:' + c.id : 'd:' + c.path;
      return upsert(id, { kind: c.kind, inbox: c.kind === 'inbox' ? c.id : undefined, stack: c.kind === 'folder' && c.parent === '', label: c.name, dir: c.loc, lkey: keyOf(c), color: col(DEFAULT[c.kind]), lv: 0, count: c.thoughts.length + c.kids.length });
    };
    const main = roots[0];
    const mn = hubOf(main);
    if (color) mn.color = color;
    if (mn.fresh) put(mn, layout[keyOf(main)] as Spot | undefined, 0, 0);
    mn.up = null;
    inboxDir = inbox?.loc ?? null;
    const vein = upsert('v:main', { kind: 'vein', label: NAME.inbox, dir: inboxDir ?? '', lkey: '#vein', color: col(DEFAULT.inbox), count: inbox ? inbox.thoughts.length + inbox.kids.length : 0 });
    if (vein.fresh) put(vein, null, mn.x, mn.y + 230);
    spotOf(vein, layout['#vein'] as Spot | undefined);
    vein.up = mn;
    tops = { main: mn, vein };
    st.links.push({ a: mn, b: vein, type: 'core' });

    const hang = (hub: GNode, c: Folder, depth: number) => {
      hub.subs = [];
      c.kids.forEach((k) => {
        const kn = hubOf(k);
        kn.lv = k.kind === 'folder' && hub.kind === 'folder' && !hub.stack ? hub.lv + 1 : 0;
        if (k.kind === 'folder' && kn.lv) kn.color = mix(col(DEFAULT.folder), st.C.bg, Math.min(0.45, 0.15 * kn.lv));
        if (kn.fresh) put(kn, null, hub.x, hub.y);
        spotOf(kn, layout[keyOf(k)] as Spot | undefined);
        hub.subs.push(kn);
        kn.up = hub;
        st.links.push({ a: hub, b: kn, type: kn.stack ? 'core' : 'fp' });
        if (depth < 40) hang(kn, k, depth + 1);
      });
      for (const t of c.thoughts) addThought(t, hub);
    };

    hang(mn, main, 0);
    vein.subs = [];
    if (inbox) hang(vein, inbox, 1);

    finish();
  }

  const VEIN_LABEL = 28;
  const grow = (b: GNode['box'], x0: number, y0: number, x1: number, y1: number) => Object.assign(b, { x0: Math.min(b.x0, x0), y0: Math.min(b.y0, y0), x1: Math.max(b.x1, x1), y1: Math.max(b.y1, y1) });
  function measure() {
    for (const n of st.anchors) {
      const k = scaleOf(n);
      n.text = n.label;
      n.bold = !n.lv;
      n.fpx = n.kind === 'folder' && !n.stack ? 9.5 + 3 * k : n.kind === 'vein' ? 12 : 13;
      if (n.kind === 'vein') n.text = n.label.toUpperCase();
      g.font = FONT(n.fpx, n.bold);
      n.lw = Math.ceil(g.measureText(n.text).width) + 14;
      n.bot = VEIN_LABEL;
      n.box = { x0: Math.min(-30, -n.lw / 2), y0: -27, x1: Math.max(30, n.lw / 2), y1: n.bot + n.fpx + 4 };
      n.fold = n.nbot = null;
      if (n.kind === 'inbox' || n.stack) {
        const { w, h, d } = STACK;
        n.nbot = h / 2 + 8;
        grow(n.box, -w / 2, -h / 2 - 2 * d, w / 2 + 2 * d, n.nbot + n.fpx + 4);
      } else if (n.kind === 'folder') {
        const h = 14 + 10 * k, tb = 3 + 2 * k;
        g.font = FONT(n.fpx, n.bold);
        const tw = g.measureText(n.text).width;
        n.fcpx = Math.min(11, n.fpx);
        g.font = FONT(n.fcpx);
        const cw = n.count ? g.measureText(String(n.count)).width + 7 : 0;
        n.lead = h * 0.5;
        n.tail = h * 0.45 + 3;
        const w = Math.ceil(Math.max(60 + 60 * k, n.lead + tw + cw + n.tail));
        n.fold = folderOf(w, h, tb, Math.max(12 + 8 * k, w * 0.32));
        grow(n.box, -w / 2, -(h + tb) / 2, w / 2, (h + tb) / 2);
      }
      n.R = Math.max(-n.box.x0, n.box.x1);
      n.r = n.R + 14 * Math.max(0.5, k);
    }
  }

  const GAP = 40, NAME_W = 30 / FAR;
  const areas = new Map<number, GNode[]>();
  function spread(all = false) {
    if (!tops) return;
    const { main, vein } = tops;
    for (const n of st.anchors) n.A = n.kids ? Math.max(orbit(n), n.ext) + NAME_W : Math.max(n.R, n.r) + 30;
    const free = st.anchors.filter((n) => n.free || n.spot);
    if (!free.length) return;
    const from = new Map(free.map((n) => [n, { x: n.x, y: n.y }]));
    const pack = (n: GNode): void => {
      const subs = n === main ? [vein, ...(n.subs || [])] : n.subs || [], placed: Placed[] = [];
      const fan = n === main ? Math.PI : Math.PI * 0.6;
      for (const c of subs) {
        pack(c);
        const pref = c === vein ? Math.PI : 0;
        let spot: Placed | null = null;
        for (let r = Math.max(n.A + c.A, n.A + c.B - c.off) + GAP; !spot; r += Math.max(20, c.B * 0.25)) {
          const step = Math.min(0.25, (c.B * 0.5) / (r + c.off));
          for (let k = 0; k * step <= fan && !spot; k++)
            for (const sd of k ? [1, -1] : [1]) {
              const a = pref + sd * k * step, u = Math.cos(a), v = Math.sin(a), mx = u * (r + c.off), my = v * (r + c.off);
              if (placed.every((q) => Math.hypot(q.mx - mx, q.my - my) >= q.c.B + c.B + GAP)) {
                spot = { c, x: u * r, y: v * r, mx, my };
                break;
              }
            }
        }
        placed.push(spot!);
      }
      n.rel = placed;
      const R = (o: number) => Math.max(n.A + o, ...placed.map((q) => Math.hypot(q.mx - o, q.my) + q.c.B));
      let lo = 0, hi = Math.max(0, ...placed.map((q) => q.mx));
      for (let i = 0; i < 40; i++) {
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
        R(m1) <= R(m2) ? (hi = m2) : (lo = m1);
      }
      n.off = n === main ? 0 : lo;
      n.B = n === main ? R(0) : R(lo);
    };
    pack(main);
    const place = (n: GNode, rho: number): void => {
      const cs = Math.cos(rho), sn = Math.sin(rho);
      for (const { c, x, y } of n.rel) {
        if (c.free) Object.assign(c, { x: n.x + x * cs - y * sn, y: n.y + x * sn + y * cs });
        else if (c.spot) Object.assign(c, { x: n.x + c.spot.x, y: n.y + c.spot.y });
        place(c, Math.atan2(c.y - n.y, c.x - n.x));
      }
    };
    place(main, -Math.PI / 2);
    let cell = 1;
    for (const n of st.anchors) cell = Math.max(cell, 2 * n.A + GAP);
    st.anchors.forEach((n, i) => (n.i = i));
    for (let it = 0, moved = true; it < 50 && moved; it++) {
      moved = false;
      bucket(areas, st.anchors, cell, cell);
      for (const a of st.anchors)
        for (let i = -1; i <= 1; i++)
          for (let j = -1; j <= 1; j++)
            for (const b of areas.get(key(Math.floor(a.x / cell) + i, Math.floor(a.y / cell) + j)) || none) {
              if (b.i <= a.i || a.free === b.free) continue;
              let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
              const o = a.A + b.A + GAP - d;
              if (o <= 0) continue;
              if (!d) [dx, dy, d] = [Math.cos(a.i), Math.sin(a.i), 1];
              const m = a.free ? a : b, k = a.free ? -o : o;
              m.x += (dx / d) * k;
              m.y += (dy / d) * k;
              moved = true;
            }
    }
    for (const f of st.floaters) {
      const p = from.get(f.parent);
      if (p && (all || f.fresh)) {
        f.x += f.parent.x - p.x;
        f.y += f.parent.y - p.y;
      }
    }
  }

  function renamePath(from: string, to: string) {
    for (const [id, n] of [...nodes]) {
      if (!id.startsWith('d:') && !id.startsWith('f:')) continue;
      const pre = id.slice(0, 2), k = id.slice(2);
      if (k === from || k.startsWith(from + '/')) {
        nodes.delete(id);
        n.id = pre + to + k.slice(from.length);
        nodes.set(n.id, n);
      }
    }
  }

  const key = (cx: number, cy: number) => cx * 65536 + cy;
  function bucket(grid: Map<number, GNode[]>, list: GNode[], w: number, h: number) {
    grid.clear();
    for (const n of list) {
      const k = key(Math.floor(n.x / w), Math.floor(n.y / h));
      const c = grid.get(k);
      c ? c.push(n) : grid.set(k, [n]);
    }
  }
  const PW = 126, PH = 42;
  const pairs = new Map<number, GNode[]>(), hubs = new Map<number, GNode[]>(), live: GNode[] = [], none: GNode[] = [];

  function step(t: number) {
    const mx = (st.W * 1.5) / cam.z, my = (st.H * 1.5) / cam.z;
    live.length = 0;
    for (const n of st.floaters) {
      const p = n.parent;
      const e = Math.max(orbit(p, 2), p.ext);
      if (st.drag?.n === n || (Math.abs(p.x - cam.x) < mx + e && Math.abs(p.y - cam.y) < my + e)) live.push(n);
    }
    const sway = st.calm;
    for (const n of live) {
      if (st.drag?.n === n) continue;
      const p = n.parent;
      if (n.pin) {
        const hx = p.x + n.pin.dx + Math.cos(t * 0.0006 + n.phase) * 9 * sway;
        const hy = p.y + n.pin.dy + Math.sin(t * 0.0008 + n.phase * 1.7) * 7 * sway;
        n.vx += (hx - n.x) * 0.008;
        n.vy += (hy - n.y) * 0.008;
        continue;
      }
      n.vx += (p.x + n.hx - n.x) * 0.012;
      n.vy += (p.y + n.hy - n.y) * 0.012;
    }

    const chips = live;
    chips.forEach((n, i) => (n.i = i));
    bucket(pairs, chips, PW, PH);
    let HW = 1;
    for (const n of st.anchors) HW = Math.max(HW, n.r + 10);
    bucket(hubs, st.anchors, HW, HW);
    for (const a of chips) {
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++) {
          for (const b of pairs.get(key(Math.floor(a.x / PW) + i, Math.floor(a.y / PH) + j)) || none) {
            if (b.i <= a.i) continue;
            if (a.parent === b.parent && !a.pin && !b.pin) continue;
            const ex = (b.x - a.x) / 3, dy = b.y - a.y;
            const d2 = ex * ex + dy * dy;
            if (d2 > 1764 || d2 === 0) continue;
            const d = Math.sqrt(d2), f = 42 - d;
            const ka = a.pin ? (b.pin ? 0.004 : 0) : b.pin ? 0.03 : 0.016;
            const kb = b.pin ? (a.pin ? 0.004 : 0) : a.pin ? 0.03 : 0.016;
            const ux = (ex / d) * 2, uy = dy / d;
            a.vx -= ux * f * ka;
            a.vy -= uy * f * ka;
            b.vx += ux * f * kb;
            b.vy += uy * f * kb;
          }
          for (const n of hubs.get(key(Math.floor(a.x / HW) + i, Math.floor(a.y / HW) + j)) || none) {
            const dx = a.x - n.x, dy = a.y - n.y;
            const d = Math.hypot(dx, dy) || 0.01, min = n.r + 10;
            if (d < min) {
              a.vx += (dx / d) * (min - d) * 0.08;
              a.vy += (dy / d) * (min - d) * 0.08;
            }
          }
        }
    }

    let fastest = 0;
    for (const n of live) {
      if (st.drag?.n === n) continue;
      n.vx *= 0.88;
      n.vy *= 0.88;
      const s = Math.hypot(n.vx, n.vy);
      if (s > 14) {
        n.vx *= 14 / s;
        n.vy *= 14 / s;
      }
      n.x += n.vx * st.calm;
      n.y += n.vy * st.calm;
      fastest = Math.max(fastest, s * st.calm);
    }

    if (follow && t < follow.until) {
      cam.tx = follow.n.x + follow.dx;
      cam.ty = follow.n.y + follow.dy;
    } else follow = null;
    if (cam.tz != null) {
      cam.z += (cam.tz - cam.z) * 0.12;
      if (Math.abs(cam.tz - cam.z) < 0.002) [cam.z, cam.tz] = [cam.tz, null];
    }
    if (cam.tx != null) {
      cam.x += (cam.tx - cam.x) * 0.12;
      cam.y += (cam.ty! - cam.y) * 0.12;
      if (Math.abs(cam.tx - cam.x) + Math.abs(cam.ty! - cam.y) < 0.5) cam.tx = cam.ty = null;
    }
    return fastest;
  }

  const toWorld = (e: MouseEvent) => {
    const b = canvas.getBoundingClientRect();
    return { x: (e.clientX - b.left - st.W / 2) / cam.z + cam.x, y: (e.clientY - b.top - st.H / 2) / cam.z + cam.y };
  };

  function anchorAt(w: Pt, skip?: (n: GNode) => boolean) {
    for (let i = st.anchors.length - 1; i >= 0; i--) {
      const n = st.anchors[i];
      if (skip?.(n)) continue;
      if (cam.z < FAR) {
        const r = (farSide(n) / 2 + 4) / cam.z;
        if (Math.abs(w.x - n.x) <= r && Math.abs(w.y - n.y) <= r) return n;
        continue;
      }
      const b = n.box, p = Math.max(4, 6 / cam.z);
      if (w.x >= n.x + b.x0 - p && w.x <= n.x + b.x1 + p && w.y >= n.y + b.y0 - p && w.y <= n.y + b.y1 + p) return n;
    }
    return null;
  }

  function ringAt(w: Pt) {
    let best: { hub: GNode; ring: number } | null = null, gap = band();
    for (const p of st.anchors) {
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      for (const ring of [1, 2]) {
        const e = Math.abs(d - reach(p, ring));
        if (e < gap) {
          best = { hub: p, ring };
          gap = e;
        }
      }
    }
    return best;
  }

  function hit(w: Pt) {
    for (let i = st.floaters.length - 1; i >= 0; i--) {
      const n = st.floaters[i];
      const r = Math.max(12 * (n.k || 1), 9 / cam.z), lw = n.lw || 0, [a, b] = n.side < 0 ? [n.x - lw, n.x] : [n.x, n.x + lw];
      if (w.x >= a - r && w.x <= b + r && Math.abs(n.y - w.y) < r) return n;
    }
    return anchorAt(w);
  }

  function moveAnchor(n: GNode, dx: number, dy: number) {
    const shift = (a: GNode) => {
      a.x += dx;
      a.y += dy;
      st.drag!.touched.add(a);
      for (const f of st.floaters) if (f.parent === a) { f.x += dx * 0.7; f.y += dy * 0.7; }
    };
    shift(n);
    for (const a of st.drag!.branch || none) shift(a);
  }

  const snap = (n: GNode): Snap => ({ id: n.id, x: n.x, y: n.y, saved: saved[n.lkey] ?? null, pin: n.pin ?? null, ring: n.ring });
  const push = (label: string, items: Snap[] | null | undefined) => items?.length && cb.onStep?.(label, items);
  function apply(items: Snap[]) {
    const back: Snap[] = [], out: Record<string, unknown> = {};
    for (const b of items) {
      const n = nodes.get(b.id);
      if (!n) continue;
      back.push(snap(n));
      const dx = b.x - n.x, dy = b.y - n.y;
      n.x = b.x;
      n.y = b.y;
      if (n.kind === 'thought') {
        n.pin = b.pin;
        n.ring = b.ring;
        spots(n.parent);
        cb.onPin(n.path, b.pin, b.ring);
      } else {
        for (const f of st.floaters) if (f.parent === n) { f.x += dx; f.y += dy; }
        out[n.lkey] = b.saved;
      }
    }
    if (Object.keys(out).length) cb.onLayout(out);
    touch();
    return back.length ? back : null;
  }
  function reset() {
    if (!tops) return;
    const hubs = st.anchors.filter((n) => n !== tops!.main);
    push('default', hubs.map(snap));
    const out: Record<string, unknown> = {};
    for (const n of hubs) {
      if (saved[n.lkey]) out[n.lkey] = null;
      n.free = true;
      n.spot = null;
    }
    spread(true);
    for (const n of hubs) n.free = false;
    if (Object.keys(out).length) cb.onLayout(out);
    touch();
  }

  function under(a: GNode, n: GNode) {
    for (let p = a.up, i = 0; p && i < 99; p = p.up, i++) if (p === n) return true;
    return false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    touch();
    if (e.button !== 0) return;
    const w = toWorld(e);
    const n = hit(w), hub = n && n.kind !== 'thought';
    const branch = hub && (e.ctrlKey || e.metaKey) ? st.anchors.filter((a) => under(a, n)) : null;
    const before = n ? [n, ...(branch || [])].map(snap) : null;
    st.drag = { n, branch, before, sx: e.clientX, sy: e.clientY, last: w, cx: cam.x, cy: cam.y, moved: false, touched: new Set() };
    cam.tx = cam.ty = cam.tz = null;
    follow = null;
    track(e, { capture: canvas, end: (ok) => (ok ? drop() : cut()) });
  });

  canvas.addEventListener('pointermove', (e) => {
    touch();
    const w = toWorld(e);
    if (!st.drag) {
      st.hover = hit(w);
      canvas.style.cursor = st.hover ? 'pointer' : 'grab';
      return;
    }
    if (!st.drag.moved && Math.hypot(e.clientX - st.drag.sx, e.clientY - st.drag.sy) < 4) return;
    st.drag.moved = true;
    const n = st.drag.n;
    if (!n) {
      cam.x = st.drag.cx - (e.clientX - st.drag.sx) / cam.z;
      cam.y = st.drag.cy - (e.clientY - st.drag.sy) / cam.z;
      canvas.style.cursor = 'grabbing';
      return;
    }
    const dx = w.x - st.drag.last.x, dy = w.y - st.drag.last.y;
    st.drag.last = w;
    if (n.kind === 'thought') {
      n.x = w.x;
      n.y = w.y;
      n.vx = n.vy = 0;
      const on = anchorAt(w), r = on ? null : ringAt(w);
      const a = on || r?.hub || null;
      st.drag.attach = a;
      st.drag.ring = r?.ring || 1;
      st.dropTarget = a !== n.parent ? a : null;
    } else {
      moveAnchor(n, dx, dy);
      const skip = (a: GNode) => a === n || a === n.up || a.kind === 'vein' || under(a, n);
      st.dropTarget = n.kind === 'inbox' || n.kind === 'vein' ? null : anchorAt(w, skip);
    }
  });

  function drop() {
    touch();
    const d = st.drag;
    st.drag = null;
    if (!d) return;
    const n = d.n;
    if (!d.moved) {
      if (n?.kind === 'thought') cb.onOpen(n.path);
      else if (n?.kind === 'vein') cb.onInbox();
      else if (n) cb.onSelect(n.dir);
      else cb.onBlank?.();
    } else if (n?.kind === 'thought') {
      const a = d.attach, ring = a ? d.ring! : 1;
      if (a && a !== n.parent) {
        n.pin = null;
        n.ring = ring;
        cb.onMove(n.path, a.dir, ring);
      } else {
        const p = n.parent;
        const pin = a ? null : { dx: Math.round(n.x - p.x), dy: Math.round(n.y - p.y) };
        if (pin || n.pin || ring !== n.ring) {
          push(pin ? `park ${n.label}` : `put ${n.label} back on its ring`, d.before);
          n.pin = pin;
          n.ring = ring;
          spots(p);
          cb.onPin(n.path, pin, ring);
        }
      }
    } else if (n) {
      if (st.dropTarget) {
        const T = st.dropTarget;
        const a = Math.atan2(n.y - T.y, n.x - T.x) || -Math.PI / 2;
        const gap = T.kind === 'inbox' || T.stack ? 380 : 210;
        st.drag = d;
        moveAnchor(n, T.x + Math.cos(a) * gap - n.x, T.y + Math.sin(a) * gap - n.y);
        st.drag = null;
      }
      if (!st.dropTarget) push(`move ${n.label}`, d.before!.filter((b) => [...d.touched].some((a) => a.id === b.id)));
      const out: Record<string, Spot> = {};
      for (const a of d.touched) out[a.lkey] = a.up ? { x: a.x - a.up.x, y: a.y - a.up.y, rel: 1 } : { x: a.x, y: a.y };
      cb.onLayout(out);
      if (st.dropTarget) cb.onMoveDir(n.dir, st.dropTarget.dir);
    }
    st.dropTarget = null;
    canvas.style.cursor = 'grab';
  }
  function cut() {
    touch();
    st.drag = null;
    st.dropTarget = null;
  }
  canvas.addEventListener('pointerleave', () => {
    wake();
    if (!st.drag) st.hover = null;
  });

  canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    const n = hit(toWorld(e));
    if (!n) return;
    e.preventDefault();
    if (n.kind === 'thought') return cb.onOpen(n.path);
    if (n.kind === 'vein') return cb.onInbox();
    cb.onSelect(n.dir);
  });

  canvas.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault();
      touch();
      cam.tx = cam.ty = cam.tz = null;
      follow = null;
      const before = toWorld(e);
      cam.z = clamp(cam.z * Math.exp(-e.deltaY * 0.0015), ZMIN, 3);
      const after = toWorld(e);
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
    },
    { passive: false },
  );

  function fit() {
    if (!nodes.size || !st.W) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes.values()) {
      x0 = Math.min(x0, n.x - 120);
      y0 = Math.min(y0, n.y - 90);
      x1 = Math.max(x1, n.x + 160);
      y1 = Math.max(y1, n.y + 90);
    }
    cam.tx = cam.ty = cam.tz = null;
    follow = null;
    cam.x = (x0 + x1) / 2;
    cam.y = (y0 + y1) / 2;
    cam.z = clamp(Math.min(st.W / (x1 - x0), st.H / (y1 - y0)), ZMIN, 1.3);
    zoomIn();
  }

  function zoomIn() {
    if (!intro) return;
    intro = false;
    cam.tz = cam.z;
    cam.z *= 0.55;
  }

  const dirNode = (dir: string | undefined) => nodes.get(dir === '' ? 'i:main' : dir === 'ib:' || dir === inboxDir ? 'v:main' : 'd:' + dir);

  function glideTo(dir: string) {
    const n = dirNode(dir);
    if (n) {
      cam.tx = n.x;
      cam.ty = n.y;
    }
  }

  function zoomTo(target: Target) {
    if (!running || !st.W) return (pending = target);
    const n = target.path != null ? nodes.get('f:' + target.path) : dirNode(target.dir);
    if (!n) return;
    follow = null;
    if (n.kind === 'thought') cam.tz = clamp(Math.max(cam.z, 1.5), ZMIN, 3);
    else {
      let x0 = n.x - 120, y0 = n.y - 90, x1 = n.x + 160, y1 = n.y + 90;
      const inside = (m: GNode) => m === n || (m.kind === 'thought' ? m.parent === n || under(m.parent, n) : under(m, n));
      for (const m of nodes.values()) {
        if (m === n || !inside(m)) continue;
        x0 = Math.min(x0, m.x - 120);
        y0 = Math.min(y0, m.y - 90);
        x1 = Math.max(x1, m.x + 160);
        y1 = Math.max(y1, m.y + 90);
      }
      cam.tz = clamp(Math.min(st.W / (x1 - x0), st.H / (y1 - y0)), FAR, target.max || 1.6);
      follow = { n, dx: (x0 + x1) / 2 - n.x, dy: (y0 + y1) / 2 - n.y, until: performance.now() + 1200 };
    }
    follow ??= { n, dx: 0, dy: 0, until: performance.now() + 1200 };
    st.ping = { n };
  }

  let touched = 0, awake = 0, last = 0, resting = false;
  function frame(t: number) {
    if (!running) return;
    st.calm = clamp(st.calm + ((t - touched < 9000 ? 1 : -1) * Math.min(t - last, 50)) / 1500, 0, 1);
    last = t;
    const fastest = step(t);
    draw(t);
    if (!st.calm && fastest < 0.05 && t > awake && !st.drag && !follow && !st.ping && cam.tx == null && cam.tz == null) return (resting = true);
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    awake = performance.now() + 2000;
    if (running && resting) {
      resting = false;
      raf = requestAnimationFrame(frame);
    }
  }
  function touch() {
    touched = performance.now();
    wake();
  }

  const api = {
    setData,
    level(key: string) {
      if (key === level) return;
      if (level != null) cams.set(level, { x: cam.tx ?? cam.x, y: cam.ty ?? cam.y, z: cam.tz ?? cam.z });
      level = key;
      nodes.clear();
      st.links = [];
      st.anchors = [];
      st.floaters = [];
      st.hover = st.drag = st.dropTarget = follow = st.ping = pending = null;
      cam.tx = cam.ty = cam.tz = null;
      const saved = cams.get(key);
      if (!saved) {
        fitted = false;
        intro = true;
        return;
      }
      fitted = true;
      Object.assign(cam, { x: saved.x, y: saved.y, z: saved.z });
      intro = true;
      zoomIn();
    },
    renamePath,
    refreshTheme() {
      readTheme();
    },
    fit,
    glideTo,
    zoomTo,
    home() {
      follow = null;
      cam.tx = 0;
      cam.ty = 0;
    },
    dropAt(e: MouseEvent | null) {
      if (!e) {
        st.dropTarget = null;
        return null;
      }
      const w = toWorld(e);
      st.dropTarget = anchorAt(w) || null;
      return { dir: st.dropTarget ? st.dropTarget.dir : null, at: { x: Math.round(w.x), y: Math.round(w.y) } };
    },
    apply,
    reset,
    spotOf(dir: string) {
      const n = st.anchors.find((a) => a.dir === dir && a.kind !== 'vein');
      return n && { x: n.x, y: n.y };
    },
    screenOf(id: string) {
      const n = nodes.get(id);
      return n && { x: (n.x - cam.x) * cam.z + st.W / 2, y: (n.y - cam.y) * cam.z + st.H / 2 };
    },
    chipOf(id: string) {
      const n = nodes.get(id)!, [x0, x1] = chipX(n.x, n, n.side);
      return { x0, x1, y0: n.y - (CHIP_H * CHIP_K) / 2, y1: n.y + (CHIP_H * CHIP_K) / 2 };
    },
    setView(v: Partial<View>) {
      st.view = { ...st.view, ...v };
    },
    start() {
      if (running) return;
      running = true;
      resize();
      if (!fitted) {
        fit();
        fitted = true;
      }
      if (pending) {
        const p = pending;
        pending = null;
        zoomTo(p);
      }
      resting = false;
      touch();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
  for (const k of ['setData', 'level', 'renamePath', 'refreshTheme', 'fit', 'glideTo', 'zoomTo', 'home', 'dropAt', 'setView']) {
    const f = (api as unknown as Calls)[k];
    (api as unknown as Calls)[k] = (...a: unknown[]) => (wake(), f(...a));
  }
  return api;
}
