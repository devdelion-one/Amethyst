import { copyPicture } from './controls.ts';
import { icon } from './icon.ts';
import { esc, setSave } from './util.ts';

type CopyBtn = Element & { was?: string; back?: number };

export const IMG_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
export const MAX_IMAGE = 5 * 1024 * 1024;
export const MAX_IMAGES = 6;
export const notPicture = (f: File) => {
  const name = f.name ? `“${f.name}”` : 'That file';
  if (!IMG_TYPES.has(f.type)) return { title: `${name} is not a picture`, line: 'Only png, jpeg, gif or webp' };
  if (f.size > MAX_IMAGE) return { title: `${name} is bigger than 5 MB` };
  return null;
};
export const readB64 = (f: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });
export const pastedImages = (e: ClipboardEvent) => [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as File[];
export async function copy(text: string | null, b?: CopyBtn, pic?: string) {
  try {
    if (pic) await copyPicture(pic, text);
    else await navigator.clipboard.writeText(text!);
    if (!b) return;
    b.was ??= b.innerHTML;
    b.innerHTML = b.querySelector('.ic') ? icon('check') : 'copied';
    clearTimeout(b.back);
    b.back = setTimeout(() => (b.innerHTML = b.was!), 1200);
  } catch {
    setSave('could not copy', true);
  }
}
const copyLink = (attrs = '', what = 'link') => `<button type="button" class="img-copy" ${attrs} aria-label="copy ${what}">${icon('copy')}</button>`;
export const imgCopy = (rel: string) => copyLink(`data-copy-img="${esc(rel)}"`);
export const chipCopy = (what: string) => copyLink('tabindex="-1"', what);
export const chipX = `<button type="button" class="chip-x" tabindex="-1" aria-label="remove">${icon('close')}</button>`;
export const imgTag = (rel: string, url: string) =>
  `<span class="img-chip" data-imgchip="${esc(rel)}"><span class="in">${chipX}<img src="${esc(url)}" alt=""><span>${esc(rel.slice(rel.lastIndexOf('/') + 1))}</span>${copyLink('tabindex="-1"')}</span></span>`;
export const fileTag = (rel: string) =>
  `<span class="img-chip file-chip" data-filechip="${esc(rel)}"><span class="in">${chipX}${icon(rel.endsWith('/') ? 'folder' : 'file')}<span>${esc(rel.replace(/\/$/, '').split('/').pop())}</span>${copyLink('tabindex="-1"', 'path')}</span></span>`;
