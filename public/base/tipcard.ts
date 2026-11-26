export type TipKey = { parts: string[]; what: string; id?: string; on?: boolean };
export type TipOpts = { gem?: boolean; icon?: string; keys?: TipKey[] | null; set?: string; setName?: string; gear?: string; msg?: string };

export function tipCard(text: string, o: TipOpts = {}): string {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  const KEY = /\s*\(((?:(?:ctrl|shift|alt) )*(?:esc|enter|tab|space|delete|[^\s()]))\)$/i;
  const k = !o.gem && text.match(KEY);
  const body = k ? text.slice(0, k.index) : text;
  const cut = o.gem ? -1 : body.indexOf('\n\n');
  const head = o.gem ? [] : (cut < 0 ? body : body.slice(0, cut)).split('\n');
  const name = o.gem ? '' : head.shift() || '';
  const keys = o.keys || (k ? [{ parts: k[1].split(' '), what: name }] : []);
  const lines = (o.gem ? [body] : head).filter((x) => x.trim());
  const advice = cut < 0 ? [] : body.slice(cut + 2).split('\n').filter((x) => x.trim());
  const live = !!o.set || keys.some((x) => x.id);
  const where = esc(`open settings: ${o.setName || o.set || ''}`);
  const gear = o.set ? `<button type="button" class="tip-set" data-tip-go="${esc(o.set)}" aria-label="${where}">${o.gear || ''}</button><span class="tip-set-t">${where}</span>` : '';
  const top = name || gear ? `<div class="tip-t">${o.icon ? `<span class="tip-ic">${o.icon}</span>` : ''}<span class="tip-n">${esc(name)}</span>${gear}</div>` : '';
  const tile = (x: TipKey) =>
    `<span class="tip-k${x.id ? ' tip-kc' : ''}${x.on ? ' tip-cap' : ''}"${x.id ? ` data-tip-bind="${esc(x.id)}" role="button" aria-label="${esc(`change the key: ${x.parts.join(' ')}`)}"` : ''}>${x.on ? '<span class="tip-rec">press a key…</span>' : (x.parts.length ? x.parts : ['none']).map((p) => `<kbd>${esc(p)}</kbd>`).join('')}</span><span class="tip-d">${esc(x.what)}</span>`;
  return (
    top +
    lines.map((x) => `<div>${esc(x)}</div>`).join('') +
    advice.map((x) => `<div class="tip-h">${esc(x)}</div>`).join('') +
    (keys.length ? `<div class="tip-ks">${keys.map(tile).join('')}</div>` : '') +
    (live ? `<div class="tip-msg">${esc(o.msg || '')}</div>` : '')
  );
}
