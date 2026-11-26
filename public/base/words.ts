export const plural = (n: number | undefined, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const tokens = (n: number): string => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n)));

const two = (n: number) => String(n).padStart(2, '0');
export const runTime = (s: number): string => (s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + two(s % 60) + 's' : Math.floor(s / 3600) + 'h ' + two(Math.floor(s / 60) % 60) + 'm');
export function sentTime(at: number, now = Date.now()): string {
  const d = new Date(at), n = new Date(now), hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  if (d.toDateString() === n.toDateString()) return hm;
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day.replace(',', '')}, ${hm}`;
}
export const timeHtml = (at: number): string => (at ? `<span class="ch-time" data-at="${at}">${sentTime(at)}</span>` : '');
export const modelTip = (words: string): string => {
  const [model, effort] = words.split(' · ');
  return effort ? `Model: ${model}, Effort: ${effort}\nThe model this chat runs on, and how much it thinks before it answers.` : `Model: ${model}\nThe model this chat runs on.`;
};
