import './railreset.ts';
import '../base/hitch.ts';
import '../base/editmenu.ts';
import { bound } from '../base/binds.ts';
import { toggleGit } from './header.ts';
import { gitRepoNow, prChanged } from '../git/git.ts';
import { newPr, openPr } from '../github/ghpr.ts';
import { openIssue } from '../github/ghissue.ts';
import './edges.ts';
import './keys.ts';
import './dnd.ts';
import '../usage/usage.ts';
import '../clips/clips.ts';
import './keyhelp.ts';
import './runask.ts';
import '../welcome/welcome.ts';
import '../report/report.ts';
import '../chatnote/chatnote.ts';
import '../phone/phone.ts';
import { openDash } from '../dash/dash.ts';
import { copyItems, pasteItems, removeAsked, selectDir, selectInbox, setSolo, togglePin } from './actions.ts';
import { closeEditorNow, flushNow, openMoved, openThought, renderEditorMeta } from '../editor/editor.ts';
import { addProject, goUp, moveExt, moveWsThoughts, newProject, newWorkspace, openFiles, showWsEditor, switchLevel, switchWorkspace, workspaceMenu, projectMenu } from './levels.ts';
import { web } from '../minds/minds.ts';
import { flushTexts, warmCode } from '../base/textbox.ts';
import { floatOpen, inboxTab, toggleInbox } from './float.ts';
import { levelKey, mode, S, showPid } from '../base/model.ts';
import { addAgent, attachToChat, chatFromText, chatPlaces, chatTo, openSettings, paintSwitch, sendChat, showAgent } from './modes.ts';
import { pooled } from '../chat/chat.ts';
import { debugStart } from '../debug/debug.ts';
import { page } from '../base/page.ts';
import type { Page } from '../base/page.ts';
import { renderSettings, settingsAt, settingsName } from './settings.ts';
import { openAskBox } from './askbox.ts';
import { watchUpdate } from './update.ts';
import { agentPanel, level as tabsLevel, openDiff, openInWindow, openReviewFile, openReviewTab, chatsFor, refToChat, reveal } from './groups.ts';
import { openReview } from '../editor/review.ts';
import { openPage } from './float.ts';
import { openActivity } from '../chat/activity.ts';
import { activate, activeGroup, askClose, browsers, docTab, editorsOfAm, goLineIn, keepTab, newInTab, openBrowser, openInTab, openView, pageTab, shown, shows, sync, tabsState, takeBack, takeTabs, urlTab } from './tabs.ts';
import { renameRow, treeMenu } from './treemenu.ts';
import { hereOf, openFile } from './open.ts';
import { dragKeys, dragWindow, isOpen, mark, pick, setOpen, sizeBar } from '../base/controls.ts';
import { roving } from '../base/roving.ts';
import { $, anyFailed, anyUnsaved, showErr } from '../base/util.ts';
import { catchUp, layout, moved, nameInTree, reload, reloadAll, render, renderList, renderTree, treeNear, treeRow } from './views.ts';
import { claim, claimWin, forMe, hereIs, isSpare, on, onDead, POP, sameLevel, send, SOLO, WIN } from '../base/windows.ts';
import type { Msg } from '../base/windows.ts';

const DESKTOP = window.amethyst?.desktop ? window.amethyst : null;

const calls: Page = { openDash, chatFromText, editorsOf: editorsOfAm, activity: openActivity, review: openReview, reviewTab: openReviewTab, openReviewFile, openDiff: (d: any) => openDiff(d, true), openPage, showAgent, addAgent: (b: HTMLElement, place?: string) => addAgent('chat', b, '', undefined, place), agentPanel, sendChat, chatPlaces, chatTo, render, reload: reloadAll, layout, moved, openMoved, renderTree, treeRow, renderList, nameInTree, shows, openInTab, openView, keepTab, reveal, openInWindow, toChat: refToChat, chatsFor, floatOpen, inboxTab, showWsEditor, moveExt, openFiles, shownPath: () => (tabsState() ? (shown(activeGroup())?.path ?? null) : null), flushNow, closeEditorNow, renderEditorMeta, renderSettings, openSettings, openSettingsAt: settingsAt, settingsName, paintSwitch, switchLevel, switchWorkspace, addProject, showGit: () => toggleGit(true), gitRepo: gitRepoNow, gitRefresh: prChanged, openPr, newPr, openIssue, debug: debugStart };
Object.assign(page, calls);

const fromIndex = (el: HTMLElement) => !!el.closest('#tree');
const quickFile = (p: string, text = false) => openInTab(p, { text });
document.addEventListener('click', (e) => {
  const pa = (e.target as HTMLElement).closest<HTMLElement>('#projects [data-pjask]');
  if (pa && !e.shiftKey) return openAskBox(pa.closest<HTMLElement>('[data-pjsel]')!.dataset.pjsel!);
  const el = (e.target as HTMLElement).closest('[data-pinfile],[data-open],[data-everything],[data-toggle],[data-gotoinbox],[data-inbox],[data-dir],[data-view],[data-newproject],[data-movews],[data-up],[data-launch],[data-pjsel],[data-wssel],[data-newws]') as HTMLElement;
  if (!el || el.closest('#modal, #colormenu')) return;
  const d = el.dataset;
  if ('gotoinbox' in d) return treeRow('i')?.scrollIntoView({ block: 'start' });
  if ('pinfile' in d) return togglePin({ kind: 'file', path: d.pinfile! });
  if ('wssel' in d && (e.ctrlKey || e.metaKey)) return window.open(`/app?w=${encodeURIComponent(d.wssel!)}`, '_blank');
  if ('wssel' in d) return switchWorkspace(d.wssel!, el);
  if ('newws' in d) return newWorkspace();
  if ('pjsel' in d && (e.ctrlKey || e.metaKey)) return window.open(`/app?w=${encodeURIComponent(S.wid)}&p=${encodeURIComponent(d.pjsel!)}`, '_blank');
  if ('pjsel' in d) return switchLevel(d.pjsel!, el);
  if ('up' in d) return goUp();
  if ('launch' in d) return switchWorkspace('');
  if ('newproject' in d) return newProject();
  if ('movews' in d) return moveWsThoughts();
  const many = fromIndex(el) && (d.open != null || d.dir != null) && (e.ctrlKey || e.metaKey || e.shiftKey);
  if (many) {
    if (e.shiftKey ? d.open != null && mark(d.open, 'range') : mark((d.open ?? d.dir)!, 'toggle')) renderTree();
    return;
  }
  if (fromIndex(el) && ('open' in d || 'dir' in d || 'inbox' in d)) mark((d.open ?? d.dir)!, 'inbox' in d ? 'clear' : 'one');
  if ('open' in d) {
    const tree = fromIndex(el), docked = !!el.closest('#list, #editor.docked'), tabbed = !!el.closest('#tree, #list, #editor.docked');
    if (tree) {
      pick(d.open!);
      renderTree();
    }
    if (tree && hereOf() === 'quick') return e.detail === 1 ? undefined : openFile(d.open!, 'quick');
    if (e.detail === 2 && tree) return keepTab((pageTab(d.open!) || docTab(d.open!))?.t.id as string);
    if (e.detail === 0 && tree) return openInTab(d.open!, { beside: docked });
    if (shows('mind') && tree) web.zoomTo({ path: d.open! });
    return tabbed ? openInTab(d.open!, { beside: docked, preview: tree }) : openThought(d.open!);
  }
  if ('everything' in d) {
    setSolo(null);
    return render();
  }
  if ('toggle' in d) {
    setOpen(d.toggle!, !isOpen(d.toggle!));
    return renderTree();
  }
  if ('inbox' in d) return e.detail === 2 ? toggleInbox() : selectInbox(fromIndex(el), fromIndex(el));
  if ('dir' in d) {
    if (fromIndex(el)) setOpen(d.dir!, !isOpen(d.dir!));
    return selectDir(d.dir!, fromIndex(el), fromIndex(el));
  }
  if ('view' in d) return openView(d.view!);
});

const middleOn = (e: MouseEvent) => (e.button === 1 ? ((e.target as HTMLElement).closest?.('#tree [data-open]') as HTMLElement | null) : null);
document.addEventListener('mousedown', (e) => middleOn(e) && e.preventDefault());
document.addEventListener('auxclick', (e) => {
  const el = middleOn(e);
  if (!el) return;
  e.preventDefault();
  openFile(el.dataset.open!, 'window');
});

document.addEventListener('contextmenu', (e) => {
  const el = (e.target as HTMLElement).closest?.('[data-open],[data-inbox],[data-dir],[data-pjsel],[data-wssel]') as HTMLElement;
  if (e.ctrlKey && mode() === 'chat' && el?.dataset.open && (e.target as HTMLElement).closest('#tree')) {
    e.preventDefault();
    return attachToChat(el.dataset.open, el);
  }
  if ((e.target as HTMLElement).closest?.('#tree')) return treeMenu(e, el);
  if (!el || !el.closest('#tree, #list, #start, #launch, #projects')) return;
  e.preventDefault();
  const d = el.dataset;
  if (d.wssel) return workspaceMenu(d.wssel, e.clientX, e.clientY);
  if (d.pjsel) return projectMenu(d.pjsel, e.clientX, e.clientY);
  if (d.open) return openThought(d.open);
  if ('inbox' in d) return selectInbox(false, false, true);
  selectDir(d.dir!, false, false, true);
});

const depthOf = (r: HTMLElement) => +r.style.getPropertyValue('--d') || 0;
const foldOf = (r: HTMLElement) => r.querySelector<HTMLElement>('[data-toggle]');
roving($('#tree'), '.ti:not(.note-ti)', {
  mark: (r: HTMLElement) => {
    const t = foldOf(r);
    r.setAttribute('role', 'treeitem');
    r.setAttribute('aria-level', (depthOf(r) + 1) as unknown as string);
    r.setAttribute('aria-selected', r.classList.contains('on') as unknown as string);
    if (t) r.setAttribute('aria-expanded', t.classList.contains('open') as unknown as string);
  },
  on: {
    Enter: (r) => (r.matches('[data-open],[data-dir],[data-inbox]') ? r.click() : foldOf(r)?.click()),
    ArrowUp: (r, go) => go(treeNear(r, 'up')),
    ArrowDown: (r, go) => go(treeNear(r, 'down')),
    Home: (r, go) => go(treeNear(r, 'home')),
    End: (r, go) => go(treeNear(r, 'end')),
    ArrowRight: (r, go) => {
      const t = foldOf(r);
      if (t && !t.classList.contains('open')) t.click();
      else go(treeNear(r, 'child'));
    },
    ArrowLeft: (r, go) => {
      const t = foldOf(r);
      if (t?.classList.contains('open')) return t.click();
      go(treeNear(r, 'parent'));
    },
    Delete: (r) => removeAsked((r.dataset.open ?? r.dataset.dir)!),
    F2: (r) => renameRow(r),
  },
});
$<HTMLElement>('#tree').addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase(), r = e.target as HTMLElement;
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || !'cxv'.includes(k) || !r.matches?.('.ti:not(.note-ti)')) return;
  const key = (r.dataset.open ?? r.dataset.dir)!;
  e.preventDefault();
  if (k === 'v') return pasteItems(S.thoughts.get(key)?.dir ?? (S.dirs.has(key) ? key : S.ctx)).catch(showErr);
  if (key) copyItems(dragKeys(key).filter(Boolean), k === 'x');
});
roving($('#list'), '.th', {
  mark: (r: HTMLElement) => r.setAttribute('role', 'button'),
  on: { Enter: (r) => r.click(), Delete: (r) => removeAsked(r.dataset.open!) },
});

let held = false;
window.addEventListener('beforeunload', (e) => {
  const all = Promise.all([flushNow(), flushTexts()]);
  if (!anyUnsaved()) return void (held = false);
  e.preventDefault();
  if (held || anyFailed() || !window.amethyst?.holdClose?.()) return void (held = false);
  held = true;
  const end = Date.now() + 1000, tick = (ms: number) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    await Promise.race([all, tick(1000)]);
    while (anyUnsaved() && !anyFailed() && Date.now() < end) await tick(50);
    if (!(await window.amethyst!.closeHeld())) held = false;
  })();
});
window.addEventListener('pageshow', (e) => e.persisted && reload().catch(showErr));

let want: { w: string; p: string } | null = null, going = false;
async function follow(w: string, p: string) {
  want = { w, p };
  if (going) {
    while (going) await new Promise((r) => setTimeout(r, 50));
    return;
  }
  going = true;
  try {
    while (want) {
      const at = want;
      want = null;
      while (S.switching) await new Promise((r) => setTimeout(r, 50));
      if (at.w !== S.wid) await switchWorkspace(at.w, undefined, at.p);
      else if (at.p !== S.pid) await switchLevel(at.p);
    }
  } finally {
    going = false;
  }
}
on('moved', (m) => m.lvl === levelKey() && moved(m.from, m.to, false));
const backs = new Map<number, number>();
const comeBack = (n: number) => (clearTimeout(backs.get(n)), backs.delete(n));
const popGone = (n: number) => takeTabs(n);
if (WIN > 1) {
  document.documentElement.classList.add('xwin');
  on('here', (m) => m.n === 1 && (!DESKTOP || isSpare()) && follow(String(m.w ?? ''), String(m.p ?? '')));
  let redone = false, askCloseOn = false;
  on('close', (m) => forMe(m) && ((redone = true), window.close()));
  on('tabstored', (m) => forMe(m) && (tabsLevel(), sync()));
  const watchAskClose = () => {
    if (askCloseOn || !DESKTOP?.onAskClose) return;
    askCloseOn = true;
    DESKTOP.onAskClose(async () => {
      if (redone) return DESKTOP.closeWindow(true);
      try {
        DESKTOP.closeWindow('asking');
        const keep = await askClose();
        if (!keep) return DESKTOP.closeWindow(false);
        await flushNow();
        send('closing', { keep });
        DESKTOP.closeWindow(true);
      } catch (e) {
        showErr(e);
        DESKTOP.closeWindow(false);
      }
    });
  };
  if (!POP) watchAskClose();
  if (POP) {
    const settle = (m: Msg) => (typeof m.p === 'string' && m.p ? follow(String(m.w ?? ''), m.p) : Promise.resolve());
    const wireSize = (k: string) => DESKTOP?.onSize && DESKTOP.onSize(sizeBar($('#pop-acts'), (x) => DESKTOP.sizeWindow(x), k));
    on('claimact', (m) => forMe(m) && (wireSize('activity'), void settle(m)));
    on('claimrev', (m) => forMe(m) && (wireSize('review'), void settle(m)));
    on('claimsolo', (m) => {
      if (!forMe(m) || !isSpare() || !m.kind) return;
      const k = String(m.kind);
      claim(k);
      document.documentElement.classList.add('xsolo');
      wireSize(k);
      settle(m).then(() => (openView(k), render(true), send('raised')));
    });
    on('claimwin', (m) => {
      if (!forMe(m) || !isSpare() || !m.to) return;
      const was = WIN, n = Number(m.to);
      claimWin(n);
      document.documentElement.classList.remove('xpop', 'xsolo');
      watchAskClose();
      winBar();
      settle(m).then(() => (tabsLevel(), sync(), render(true), send('raised', { was })));
    });
    document.documentElement.classList.add('xpop');
    if (SOLO) document.documentElement.classList.add('xsolo');
    on('raise', (m) => forMe(m) && (DESKTOP ? DESKTOP.showWindow('', !m.quiet) : m.quiet || window.focus(), send('raised')));
    if (!SOLO) {
      const fresh = (hit: ReturnType<typeof pageTab>) => hit && browsers.get(hit.t.id)?.reload();
      const toUrl = (url: string, hit = urlTab(url)) => (hit ? (fresh(hit), activate(hit.g, hit.t)) : openBrowser(url));
      const known = async (p: string) => {
        if (S.thoughts.has(p)) return;
        await catchUp();
        if (!S.thoughts.has(p)) await reload([p]).catch(showErr);
      };
      const open = (o: { act?: string; url?: string; path?: string; type: string; line?: number; text?: boolean }) => (o.act ? newInTab(o.act) : o.url ? toUrl(o.url) : o.path ? known(o.path).then(() => (o.text || fresh(pageTab(o.path!)), quickFile(o.path!, !!o.text))).then(() => o.line && goLineIn(o.path!, o.line)) : openView(o.type));
      const report = () => {
        const t = shown(activeGroup());
        if (t?.path && !t.abs) send('shownq', { path: t.path });
      };
      on('quickopen', (m) => forMe(m) && Promise.resolve(open(m.open)).then(report));
      on('claim', (m) => forMe(m) && isSpare() && (claim(), wireSize('quick'), settle(m).then(() => open(m.open)).then(() => (render(true), report(), send('raised')))));
      addEventListener('pointerdown', () => setTimeout(report, 50), true);
    }
    if (DESKTOP) {
      $('#pop-min').onclick = () => (POP ? DESKTOP.minimizeWindow() : DESKTOP.osWindow('min'));
      if (!isSpare()) wireSize(SOLO.startsWith('activity-') ? 'activity' : SOLO.startsWith('review-') ? 'review' : SOLO || 'quick');
      dragWindow($('#winbar'));
    } else $('#pop-min').remove();
  }
} else {
  const keeps = new Map<number, string[]>();
  on('closing', (m) => m.n > 1 && !m.pop && sameLevel(m) && keeps.set(m.n, Array.isArray(m.keep) ? m.keep.map(String) : []));
  const gone = (n: number) => {
    const keep = keeps.get(n) || [];
    keeps.delete(n);
    takeBack(n, keep);
  };
  on('bye', (m) => m.n > 1 && sameLevel(m) && (comeBack(m.n), !m.pop && keeps.has(m.n) ? gone(m.n) : backs.set(m.n, setTimeout(() => (backs.delete(m.n), m.pop ? popGone(m.n) : gone(m.n)), 2000))));
  on('win', (m) => sameLevel(m) && comeBack(m.n));
  onDead((n, pop) => (comeBack(n), pop ? popGone(n) : gone(n)));
  on('openq', (m) => m.path && floatOpen(m.path));
  on('opendiff', (m) => sameLevel(m) && m.d && openDiff(m.d, true));
  on('reviewtab', (m) => sameLevel(m) && typeof m.chat === 'string' && openReviewTab(m.chat));
  on('openrev', (m) => sameLevel(m) && typeof m.chat === 'string' && m.path && openReviewFile(m.chat, m.path, m.line || 1));
  on('shownq', (m) => {
    if (!m.path) return;
    mark(m.path, 'one');
    pick(m.path);
    m.reveal ? reveal(m.path) : renderTree();
  });
}
function winBar() {
  document.documentElement.classList.add('wbar');
  $('#winbar').hidden = false;
  $('#pop-x').onclick = () => window.close();
  if (POP) return;
  $('#pop-x').title = 'Close\nCloses this window.';
  $('#pop-max').hidden = false;
  $('#pop-min').onclick = () => DESKTOP!.osWindow('min');
  $('#pop-max').onclick = () => DESKTOP!.osWindow('max');
  DESKTOP!.onSize(sizeBar($('#pop-acts'), (k) => DESKTOP!.sizeWindow(k), 'win2', false));
}
if (POP) winBar();
else if (DESKTOP?.osWindow) Promise.resolve(DESKTOP.osWindow('ask')).then((ok) => ok === true && winBar(), () => {});

if (location.search.includes('debug')) window.mind = { S, web, tabs: tabsState, bound, pooled };

showPid();
web.level(levelKey());
tabsLevel();
hereIs(() => ({ w: S.wid, p: S.pid }));
const takeFiles = async () => openFiles((await DESKTOP!.takeFiles()) || []);
if (DESKTOP && WIN === 1) DESKTOP.onFiles(takeFiles);
reload()
  .then(() => sync())
  .then(() => POP && !SOLO && new URLSearchParams(location.search).get('act') && newInTab('board'))
  .then((): unknown => DESKTOP && WIN === 1 && takeFiles())
  .then(() => watchUpdate())
  .then(() => requestIdleCallback(warmCode))
  .catch((e: unknown) => {
    showErr(e);
    $('#list').innerHTML = `<div class="hello">Can't reach the Amethyst server. Close Amethyst and start it again.</div>`;
  });
