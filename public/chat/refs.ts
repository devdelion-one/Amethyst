import { bands, copyPicture, dragKeys, fileManager, ICONS, menuHead, miRow, popMenu, viewImage } from '../base/controls.ts';
import { gem } from '../base/kinds.ts';
import { copy } from '../base/chips.ts';
import { icon } from '../base/icon.ts';
import { imgLink, splitLine, target } from '../base/links.ts';
import { follow as followLink, isPicture, outside, showPath } from '../base/follow.ts';
import { edShown, levelKey, S } from '../base/model.ts';
import { fullPath } from '../base/chattext.ts';
import type { ChatCtx } from '../base/chattext.ts';
import { setSave } from '../base/util.ts';
import { page } from '../base/page.ts';
import { pref } from '../base/prefs.ts';
import type { Folder } from '../base/types.ts';
import { imgSrc, linkPath } from './shape.ts';

type RefsCtx = { el: HTMLElement; log: HTMLElement; pid: () => string; where: (pid: string) => ChatCtx; openFile: (path: string) => unknown };

export function createRefs({ el, log, pid, where, openFile }: RefsCtx) {
  function isLink(rel: string) {
    return S.thoughts.has(rel) || (rel.endsWith('/') && S.dirs.has(rel.slice(0, -1)));
  }
  const dragLink = () => {
    const d = pid() === S.pid ? S.dragging : null;
    if (d?.startsWith('link:')) return d.slice(5);
    if (d?.startsWith('file:')) return S.thoughts.has(d.slice(5)) ? d.slice(5) : null;
    const c = (d?.startsWith('dir:') && S.dirs.get(d.slice(4))) as Folder | undefined;
    return c?.path ? c.path + '/' : null;
  };
  const dragLinks = () => {
    const d = dragLink(), k = d && S.dragging?.match(/^(?:file|dir):(.*)$/)?.[1];
    if (k == null) return d ? [d] : [];
    return dragKeys(k).map((p) => (S.thoughts.has(p) ? p : S.dirs.get(p)?.path ? S.dirs.get(p)!.path + '/' : null)).filter(Boolean);
  };
  const windowLink = (e: DragEvent) => {
    if (S.dragging || pid() !== S.pid || !e.dataTransfer?.types.includes('application/x-pm-file')) return null;
    const f = JSON.parse(e.dataTransfer!.getData('application/x-pm-file') || '{}'), here = f.lvl === levelKey();
    return { rel: here ? f.path : null, rels: here ? (f.paths?.length > 1 ? f.paths : [f.path]) : [] };
  };
  const rawOf = (rel: string) => imgSrc(rel, pid());
  function openRef(path: string, e: MouseEvent, out = (e.ctrlKey || e.metaKey) && e.shiftKey) {
    const t = targetOf(path), rel = t?.rel;
    if (rel && !out && e.detail === 2) return page.reveal(rel, true);
    if (rel && !out) setTimeout(() => page.reveal(rel, true));
    followLink(t, { out, openFile });
  }
  function targetOf(path: string) {
    const c = where(pid()), mine = c.here && c.root;
    return target(path, { root: c.root, ...(mine ? { has: c.has, isDir: (p: string) => S.dirs.has(p) } : {}) });
  }
  function refMenu(e: MouseEvent, rel: string, kind: string) {
    const t = kind === 'img' ? null : targetOf(rel), inProject = !!t?.rel, editor = edShown();
    const isPath = t?.kind === 'path', pic = isPath && !t.dir && !t.abs!.startsWith('~') && isPicture(t.abs!);
    const IC: Record<string, string> = { open: icon('file'), tab: ICONS.tab, page: ICONS.tab, window: ICONS.newWin, out: ICONS.outBrowser, show: ICONS.explorer, win: ICONS.reveal, path: ICONS.copy, link: ICONS.copy };
    const items = [
      ['open', kind === 'img' || pic || (t && !inProject) ? 'open' : editor ? "open in the next group's tab" : 'open above'],
      ...(inProject && !editor ? [['tab', "open in the next group's tab"]] : []),
      ...(pic ? [['page', 'open in a tab']] : []),
      ...(kind === 'file' && (t?.kind === 'web' || (isPath && !t.dir && !t.abs!.startsWith('~'))) ? [['window', 'open in new window']] : []),
      ...(kind === 'file' && (t?.kind === 'web' || pic || (isPath && !t.dir && t.sort !== 'other')) ? [['out', 'open in your web browser']] : []),
      ...(inProject ? [['show', 'show in the explorer panel']] : []),
      ...(isPath ? [['win', `show in ${fileManager()}`]] : []),
      '-',
      ['path', t && !isPath ? 'copy address' : 'copy path'],
      ...(kind === 'img' || pic ? [['link', 'copy image']] : inProject ? [['link', 'copy link']] : []),
    ];
    const html = items.map((r) => (r === '-' ? '<div class="sep"></div>' : miRow(`data-k="${r[0]}"`, IC[r[0]], r[1]))).join('').replace(/^(<div class="sep"><\/div>)|(<div class="sep"><\/div>)$/g, '');
    popMenu(e.clientX, e.clientY, menuHead(kind === 'img' ? icon('image') : gem('file'), rel) + bands({ actions: html }), (b) => {
      const k = b.dataset.k, text = (x: string) => navigator.clipboard.writeText(x).then(() => setSave('copied ' + x), () => setSave('could not copy', true));
      if (k === 'link' && (kind === 'img' || pic)) return (kind === 'img' ? copyPicture(rawOf(rel), imgLink(rel)) : copyPicture('/api/ext/raw?path=' + encodeURIComponent(t!.abs!))).then(() => setSave('copied the image'), () => setSave('could not copy', true));
      if (k === 'open') return kind === 'img' ? viewImage(rawOf(rel), imgLink(rel)) : openRef(rel, e, false);
      if (k === 'tab') return page.openInTab(t!.rel!, { beside: true });
      if (k === 'page') return page.openPage(t!.abs!);
      if (k === 'window') return page.openInWindow(t);
      if (k === 'out') return outside(t!.kind === 'web' ? t!.url! : t!.abs!);
      if (k === 'show') return page.reveal(t!.rel!);
      if (k === 'win') return showPath(t!.abs!);
      text(k === 'path' ? (t?.kind === 'web' || t?.kind === 'mail' ? t.url! : fullPath(rel, where(pid()))) : kind === 'img' ? imgLink(rel) : '@' + rel);
    });
  }
  log.addEventListener('copy', (e) => {
    const sel = getSelection()!;
    if (sel.isCollapsed || !sel.rangeCount) return;
    const r = sel.getRangeAt(0), at = r.commonAncestorContainer;
    let frag = r.cloneContents();
    const within = ((at.nodeType === 1 ? at : at.parentNode) as Element).closest?.('a[data-chopen]');
    if (within) {
      const a = within.cloneNode(false) as Element;
      a.append(frag);
      frag = document.createDocumentFragment();
      frag.append(a);
    }
    if (!frag.querySelector('a[data-chopen]')) return;
    const make = (rich: boolean) => {
      const box = frag.cloneNode(true) as DocumentFragment;
      for (const a of box.querySelectorAll<HTMLAnchorElement>('a[data-chopen]')) {
        const chip = a.classList.contains('ch-path'), text = a.textContent, to = a.getAttribute('href') || a.dataset.chopen;
        if (!rich) a.replaceWith(chip ? `\`${text}\`` : `[${text.replace(/[[\]]/g, '\\$&')}](${to})`);
        else {
          const abs = a.dataset.full && splitLine(a.dataset.full)[0], href = a.getAttribute('href') || (/^[a-z]:/i.test(abs as string) ? 'file:///' + encodeURI((abs as string).replace(/\\/g, '/')) : abs?.startsWith('/') ? 'file://' + encodeURI(abs) : '');
          a.replaceWith(href ? Object.assign(document.createElement('a'), { href, textContent: text }) : text);
        }
      }
      return box;
    };
    const host = Object.assign(document.createElement('div'), { style: 'position:fixed;left:-9999px;top:0' });
    document.body.append(host);
    host.append(make(false));
    const plain = host.innerText;
    host.replaceChildren(make(true));
    e.clipboardData!.setData('text/plain', plain);
    e.clipboardData!.setData('text/html', host.innerHTML);
    host.remove();
    e.preventDefault();
  });
  function listen() {
    log.addEventListener('contextmenu', (e) => {
      const a = (e.target as HTMLElement).closest?.<HTMLElement>('[data-chopen]');
      if (!a) return;
      e.preventDefault();
      refMenu(e, a.dataset.chopen!, 'file');
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.target as HTMLElement).closest('[data-chopen], .ch-img')) e.preventDefault();
    });
    const hop = Object.assign(document.createElement('button'), { type: 'button', className: 'ch-hop', title: 'copy path', hidden: true, innerHTML: icon('copy') });
    hop.setAttribute('aria-label', 'copy path');
    el.append(hop);
    let hopFor: HTMLElement | null = null, hopOff = 0;
    const hopHide = () => {
      clearTimeout(hopOff);
      hopOff = setTimeout(() => { if (!hop.hidden) hop.hidden = true; }, 200);
    };
    log.addEventListener('mouseover', (e) => {
      const a = (e.target as HTMLElement).closest?.<HTMLElement>('.ch-link');
      if (!a || !pref('linkCopy')) return;
      clearTimeout(hopOff);
      hopFor = a;
      const r = [...a.getClientRects()].at(-1)!;
      if (r.right > (a.closest('.o')?.getBoundingClientRect().right ?? Infinity)) return void (hop.hidden = true);
      Object.assign(hop.style, { left: Math.min(r.right + 3, innerWidth - 22) + 'px', top: r.top + (r.height - 16) / 2 + 'px' });
      hop.hidden = false;
    });
    log.addEventListener('mouseout', (e) => (e.target as HTMLElement).closest?.('.ch-link') && hopHide());
    log.addEventListener('scroll', () => { if (!hop.hidden) hop.hidden = true; }, { passive: true });
    hop.addEventListener('mouseenter', () => clearTimeout(hopOff));
    hop.addEventListener('mouseleave', hopHide);
    hop.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hopFor) copy(linkPath(hopFor), hop);
    });
    const pvf = Object.assign(document.createElement('img'), { className: 'ch-pvf', alt: '', hidden: true });
    el.append(pvf);
    log.addEventListener('mouseover', (e) => {
      const chip = (e.target as HTMLElement).closest?.('.ch-img');
      const src = chip?.querySelector<HTMLImageElement>('.pv')?.src;
      if (!src) return;
      pvf.src = src;
      pvf.hidden = false;
      const r = chip!.getBoundingClientRect();
      const above = r.top > 200;
      Object.assign(pvf.style, { left: Math.max(8, Math.min(r.left, innerWidth - 248)) + 'px', top: above ? 'auto' : r.bottom + 6 + 'px', bottom: above ? innerHeight - r.top + 6 + 'px' : 'auto' });
    });
    log.addEventListener('mouseout', (e) => { if (!pvf.hidden && (e.target as HTMLElement).closest?.('.ch-img')) pvf.hidden = true; });
    log.addEventListener('scroll', () => { if (!pvf.hidden) pvf.hidden = true; }, { passive: true });
  }
  return { isLink, dragLink, dragLinks, windowLink, rawOf, openRef, refMenu, listen };
}
