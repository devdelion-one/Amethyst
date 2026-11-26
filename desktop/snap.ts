export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Pt {
  x: number;
  y: number;
}
interface Zone {
  z: string;
  shared: boolean;
}

export const USER_HEADER = 'x-amethyst-user';
const HOSTS = ['localhost', '127.0.0.1'];
export const userUrls = (port: number) => HOSTS.map((h) => `http://${h}:${port}/api/*`);
const ownApi = (url: string, port: number) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' && HOSTS.includes(u.hostname) && Number(u.port || 80) === port && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};
export function withUser(url: string, headers: Record<string, string>, port: number, key: string): Record<string, string> {
  const out = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== USER_HEADER));
  return key && ownApi(url, port) ? { ...out, [USER_HEADER]: key } : out;
}
export function userKey(make: () => string) {
  let now = '';
  return {
    now: () => now,
    start(post: (m: { user: string }) => void) {
      const key = make();
      let live = true;
      const say = () => post({ user: key });
      say();
      return { again: say, up: () => void (live && (now = key)), end: () => void ((live = false), now === key && (now = '')) };
    },
  };
}
type Port = { packaged: boolean; answers: () => Promise<boolean>; taken: () => Promise<boolean>; wait: (ms: number) => Promise<unknown>; tries?: number };
export async function portPlan({ packaged, answers, taken, wait, tries = 20 }: Port): Promise<'join' | 'start' | 'used'> {
  if (!packaged && (await answers())) return 'join';
  for (let i = 0; await taken(); i++) {
    if (!packaged || i >= tries) return 'used';
    await wait(250);
  }
  return 'start';
}

export const CORNER = 80, EDGE = 24, WAIT = 200;

export const partOf = (a: Box, k: number, [minW, minH]: number[]) => ({ width: Math.max(minW, Math.round(a.width / 2)), height: Math.max(minH, k === 4 ? Math.round(a.height / 2) : a.height) });

export function sizeBox(a: Box, b: Box, k: number, min: number[]): Box {
  if (k === 1) return { x: a.x, y: a.y, width: a.width, height: a.height };
  const { width, height } = partOf(a, k, min);
  if (k === 4) return { x: a.x + Math.round((a.width - width) / 2), y: a.y + Math.round((a.height - height) / 2), width, height };
  return { x: Math.min(Math.max(a.x, b.x), a.x + a.width - width), y: Math.min(Math.max(a.y, b.y), a.y + a.height - height), width, height };
}

export function zoneOf(p: Pt, b: Box, all: Box[]): Zone {
  const taken = (x: number, y: number) => all.some((o) => x >= o.x && x < o.x + o.width && y >= o.y && y < o.y + o.height);
  const side = (m: number) => (p.x < b.x + m ? 'w' : p.x >= b.x + b.width - m ? 'e' : '');
  const end = (m: number) => (p.y < b.y + m ? 'n' : p.y >= b.y + b.height - m ? 's' : '');
  const past = (c: string) => (c === 'w' ? taken(b.x - 1, p.y) : c === 'e' ? taken(b.x + b.width, p.y) : c === 'n' ? taken(p.x, b.y - 1) : taken(p.x, b.y + b.height));
  const s = side(CORNER), e = end(CORNER);
  if (s && e) return { z: e + s, shared: past(s) || past(e) };
  const w = side(EDGE);
  if (w) return { z: w, shared: past(w) };
  if (end(EDGE) === 'n') return { z: 'full', shared: past('n') };
  return { z: '', shared: false };
}

export function zoneBox(a: Box, z: string, min: number[]): Box {
  if (z === 'full') return { x: a.x, y: a.y, width: a.width, height: a.height };
  const { width, height } = partOf(a, z.length > 1 ? 4 : 2, min);
  return { x: z.includes('w') ? a.x : a.x + a.width - width, y: z.includes('n') ? a.y : a.y + a.height - height, width, height };
}

export const HEAD = 28, GRIP = 80;

export function intoView(b: Box, areas: Box[]): Box | null {
  const seen = areas.some((a) => Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x) >= GRIP && b.y >= a.y && b.y + HEAD <= a.y + a.height);
  if (seen || !areas.length) return null;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const gap = (a: Box) => Math.hypot(Math.max(a.x - cx, 0, cx - a.x - a.width), Math.max(a.y - cy, 0, cy - a.y - a.height));
  const a = areas.reduce((m, x) => (gap(x) < gap(m) ? x : m));
  const width = Math.min(b.width, a.width), height = Math.min(b.height, a.height);
  return { x: Math.min(Math.max(b.x, a.x), a.x + a.width - width), y: Math.min(Math.max(b.y, a.y), a.y + a.height - height), width, height };
}

const query = (addr: string) => new URL(addr, 'http://x').searchParams;

export const amOf = (addr: string) => Math.max(1, Math.floor(Number(query(addr).get('am'))) || 1);

export const projOf = (addr: string) => {
  const q = query(addr);
  return `${amOf(addr)}|${q.get('w') ?? ''}|${q.get('p') ?? ''}`;
};

export const ownKey = (kind: string, proj: string) => `${kind}@${proj}`;
export const kindIn = (key: string) => key.split('@')[0];
export const projIn = (key: string) => key.slice(key.indexOf('@') + 1);
export const amIn = (key: string) => Math.max(1, Math.floor(Number(projIn(key).split('|')[0])) || 1);

export const ownAddr = (page: string, proj: string) => {
  const [am, w, p] = proj.split('|');
  return `${page}${page.includes('?') ? '&' : '?'}${new URLSearchParams({ w, p, ...(Number(am) > 1 ? { am } : {}) })}`;
};

export const soloIn = (addrs: string[], kind: string, proj: string) =>
  addrs.find((a) => {
    const q = query(a);
    return q.has('win') && q.has('pop') && !q.has('spare') && q.get('solo') === kind && projOf(a) === proj;
  }) || '';

export const inEvery = (addr: string) => {
  const q = query(addr);
  return q.has('win') && !q.has('pop') && q.get('every') === '1';
};

export const stays = (addr: string, here: string) => inEvery(addr) || projOf(addr) === here;

export function leftBehind(addrs: string[], gone: string): number[] {
  const n = amOf(gone), extra = (a: string) => query(a).has('win');
  if (extra(gone) || addrs.some((a) => !extra(a) && amOf(a) === n)) return [];
  return addrs.flatMap((a, i) => (extra(a) && amOf(a) === n ? [i] : []));
}

export type NoticeAm = { n: number; shown: boolean; open: boolean; disp: number | null };
export type NoticePlan = { inApp: number[]; toasts: { n: number; disp: number }[]; native: boolean };
export function noticePlan(ams: NoticeAm[], o: { hushed: boolean; main: boolean; primary: number }): NoticePlan {
  const inApp = ams.filter((x) => x.shown).map((x) => x.n), rest = ams.filter((x) => !x.shown);
  if (!rest.length) return { inApp, toasts: [], native: false };
  if (o.hushed) return { inApp: [...inApp, ...rest.filter((x) => x.open).map((x) => x.n)], toasts: [], native: true };
  const toasts: { n: number; disp: number }[] = [];
  for (const x of rest) {
    const disp = o.main || x.disp == null ? o.primary : x.disp;
    if (!toasts.some((t) => t.disp === disp)) toasts.push({ n: x.n, disp });
  }
  return { inApp, toasts, native: false };
}
