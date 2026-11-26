import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { given } from './env.ts';
import { HttpError } from './routes.ts';
import type { IncomingHttpHeaders } from 'http';

export const USER_HEADER = 'x-amethyst-user';
const NOT_READY = 'Amethyst is still starting.';
const CLOSED = "Only Amethyst's own window can do this.";
const FOREIGN = "Only Amethyst's own pages can use this address.";
const MIN = 32;

const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
const foreign = (h: IncomingHttpHeaders) => {
  const site = h['sec-fetch-site'];
  return (h.origin !== undefined && h.origin !== `http://${h.host}`) || (site !== undefined && site !== 'same-origin' && site !== 'none');
};

export function userGate({ desktop, secret = '' }: { desktop: boolean; secret?: string }) {
  let want = !desktop && secret ? digest(secret) : null;
  const on = desktop || !!want;
  return {
    on,
    ready: () => !on || !!want,
    arm(s: unknown) {
      if (!desktop || want || typeof s !== 'string' || s.length < MIN) return false;
      want = digest(s);
      return true;
    },
    allow(h: IncomingHttpHeaders, open: boolean): boolean {
      if (!on) return true;
      if (!want) throw new HttpError(503, NOT_READY);
      if (foreign(h)) throw new HttpError(403, FOREIGN);
      const got = h[USER_HEADER], user = typeof got === 'string' && crypto.timingSafeEqual(want, digest(got));
      if (!user && !open) throw new HttpError(403, CLOSED);
      return user;
    },
  };
}

const proc = process as unknown as { versions: { electron?: string }; parentPort?: unknown };
export const gate = userGate({ desktop: !!proc.versions.electron || !!proc.parentPort, secret: given });

const asking = new AsyncLocalStorage<boolean>();
export const asUser = <T>(user: boolean, run: () => T): T => asking.run(user, run);
export const isUser = () => !gate.on || asking.getStore() === true;
