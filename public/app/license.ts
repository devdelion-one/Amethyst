import { notify } from '../base/notify.ts';
import { page } from '../base/page.ts';
import { esc } from '../base/util.ts';
import { WIN } from '../base/windows.ts';
import type { LicenseNow } from '../base/types.ts';

const LIC = window.amethyst?.license || null;
const HOUR = 60 * 60 * 1000;
let now: LicenseNow | null = null;
const subs = new Set<() => void>();

const use = (s: LicenseNow) => {
  now = s;
  page.renderSettings?.();
  for (const fn of subs) fn();
  nag();
};

export const licenseNow = () => now;
export const onLicense = (fn: () => void) => void subs.add(fn);

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const HEAD = /^(\d+)\. ([A-Z][A-Z ;,-]+)$/;
const sentence = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replace(/\bai\b/gi, 'AI');

export function licenseHtml(text: string) {
  const parts = text.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  parts.shift();
  return parts.map((b) => {
    const lines = b.split('\n'), head = HEAD.exec(lines[0].trim());
    if (head) return `<h4>${head[1]}. ${esc(sentence(head[2]))}</h4>`;
    if (/^ [a-z]\. /.test(lines[0])) return `<ul>${b.split(/\n(?= [a-z]\. )/).map((it) => `<li>${esc(it.replace(/\s+/g, ' ').trim())}</li>`).join('')}</ul>`;
    if (/^\w+:\s/.test(lines[0]) && lines.length > 1) return `<p>${lines.map((l) => esc(l.replace(/:\s+/, ': ').trim())).join('<br>')}</p>`;
    return `<p>${esc(b.replace(/\s+/g, ' ').trim())}</p>`;
  }).join('');
}

let shown: HTMLElement | null = null;
export function openLicense(forUpdate = !!now?.update) {
  if (!LIC || !now) return;
  const upd = forUpdate ? now.update : null;
  const lic = upd || now;
  shown?.remove();
  const veil = Object.assign(document.createElement('div'), { id: 'lic' });
  const title = upd ? 'New license' : 'Amethyst license';
  const why = upd ? `Amethyst ${esc(upd.next)} comes with a new license. It downloads after you agree.` : now.accepted ? `You accepted this version${now.last ? ` on ${esc(day(now.last.at))}` : ''}.` : 'You haven’t accepted the license for this version yet. You may use Amethyst only under it.';
  const go = upd ? 'I agree and download' : 'I agree';
  veil.innerHTML = `<div class="box float lic-box" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="lic-head"><b>${title}</b><span class="lic-ver">${esc(lic.version)}</span></div>
    <p class="lic-why">${why}</p>
    <div class="lic-text" tabindex="0">${licenseHtml(lic.text)}</div>
    <div class="lic-foot"><a class="up-link" href="${esc(now.site)}" target="_blank">read it on amethyst.run</a><span class="lic-hint">asked again only when the license version changes</span>` +
    `<button class="outline" data-lic-later title="${now.accepted && !upd ? 'Close' : 'Not now'}&#10;Closes the license. Settings, Updates shows it again." data-tip-keys="=esc:close" data-tip-set="update"><kbd>esc</kbd>${now.accepted && !upd ? 'close' : 'not now'}</button>` +
    (now.accepted && !upd ? '' : `<button class="primary" data-lic-agree>${go}</button>`) +
    `</div></div>`;
  const back = document.activeElement as HTMLElement | null;
  document.body.append(veil);
  shown = veil;
  const close = () => {
    veil.remove();
    if (shown === veil) shown = null;
    back?.focus?.();
  };
  veil.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') e.preventDefault(), close();
  });
  veil.addEventListener('mousedown', (e) => e.target === veil && close());
  veil.querySelector('[data-lic-later]')!.addEventListener('click', close);
  veil.querySelector('[data-lic-agree]')?.addEventListener('click', async () => {
    close();
    use(await LIC.accept(lic.version));
  });
  (veil.querySelector<HTMLElement>('[data-lic-agree]') || veil.querySelector<HTMLElement>('[data-lic-later]'))!.focus();
}

export function licenseState() {
  if (!now) return '';
  if (!now.accepted) return `<span class="lic-st warn">${esc(now.version.split(',')[0])} · not accepted yet</span><button class="chip on" data-lic-open>I agree…</button>`;
  return `<span class="lic-st">accepted ${now.last ? esc(day(now.last.at)) : ''}</span>`;
}

export const licenseClick = (d: DOMStringMap) => ('licOpen' in d ? (openLicense(false), true) : false);

let nagAt = 0, nagTimer: ReturnType<typeof setTimeout> | null = null, nagNote: ReturnType<typeof notify> | null = null;
function nag() {
  if (!now || WIN !== 1) return;
  if (now.accepted) {
    nagNote?.close?.();
    nagNote = null;
    if (nagTimer) clearTimeout(nagTimer);
    nagTimer = null;
    return;
  }
  if (nagTimer) return;
  const wait = Math.max(0, nagAt + HOUR - Date.now());
  nagTimer = setTimeout(() => {
    nagTimer = null;
    if (!now || now.accepted) return;
    nagAt = Date.now();
    nagNote?.close?.();
    const n = (nagNote = notify(`You haven’t accepted the license for this version. You may use Amethyst only under it.<b class="nact" data-lic-read>read &amp; agree</b>`, { ms: 20000 }));
    n.onclick = (e) => {
      if (getSelection()!.toString()) return;
      e.stopPropagation();
      n.close?.();
      openLicense(false);
    };
    nag();
  }, nagAt ? wait : 5000);
}

if (LIC) {
  LIC.onState(use);
  LIC.state().then(use, () => {});
}
