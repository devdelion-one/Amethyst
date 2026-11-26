export type Sums = [input: number, cache5m: number, cache1h: number, cacheRead: number, output: number];
export interface Price {
  input: number;
  cache5m: number;
  cache1h: number;
  cacheRead: number;
  output: number;
}

const at = (input: number, output: number, cacheRead = input * 0.1): Price => ({ input, cache5m: input * 1.25, cache1h: input * 2, cacheRead, output });

const PRICES: Record<string, Price> = {
  'claude-opus-5-5': at(4, 20, 0.2),
  'claude-fable-5-2': at(8, 40, 0.2),
  'claude-sonnet-5-5': at(2, 10, 0.1),
  'claude-haiku-5-5': at(0.1, 0.5, 0.01),
  'claude-opus-5': at(5, 25),
  'claude-opus-4-8': at(5, 25),
  'claude-opus-4-7': at(5, 25),
  'claude-opus-4-6': at(5, 25),
  'claude-sonnet-5': at(2, 10),
  'claude-sonnet-4-6': at(3, 15),
  'claude-haiku-4-5': at(1, 5),
};

const bare = (model: string) => model.toLowerCase().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');

export const priceOf = (model: string): Price | null => PRICES[bare(model)] || null;

export function costOf(model: string, s: Sums): number | null {
  const p = priceOf(model);
  if (!p) return null;
  return (s[0] * p.input + s[1] * p.cache5m + s[2] * p.cache1h + s[3] * p.cacheRead + s[4] * p.output) / 1e6;
}
