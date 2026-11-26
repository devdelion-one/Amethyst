export type Crystal = { code: string; name: string; color: string };

const CRYSTALS = [
  ['ame', 'amethyst', '#a77bff'], ['cit', 'citrine', '#e8b54a'], ['eme', 'emerald', '#3fc48a'], ['sap', 'sapphire', '#5b8cff'],
  ['rub', 'ruby', '#f0567a'], ['aqu', 'aquamarine', '#4fd1d9'], ['top', 'topaz', '#f08a4b'], ['jad', 'jade', '#8fc75a'],
  ['ros', 'rose quartz', '#f28fc4'], ['tan', 'tanzanite', '#7d6bff'], ['opa', 'opal', '#b9c4e0'], ['gar', 'garnet', '#d0475a'],
];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const crystals = new Map<string, Crystal>();

export function crystalOf(id: string): Crystal {
  if (crystals.has(id)) return crystals.get(id)!;
  let h = 0x811c9dc5;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const [, name, color] = CRYSTALS[h % CRYSTALS.length];
  const r = (h / CRYSTALS.length) >>> 0;
  const code = LETTERS[r % 24] + String(((r / 24) >>> 0) % 100).padStart(2, '0');
  const c = { code, name, color };
  crystals.set(id, c);
  return c;
}

export const CODE = /^@?([A-HJ-NP-Z]\d{2})$/i;
