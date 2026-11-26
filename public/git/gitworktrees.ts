import { ask } from '../base/controls.ts';
import * as groups from '../app/groups.ts';
import { esc, store, track } from '../base/util.ts';
import { pref } from '../base/prefs.ts';
import { agents } from '../base/stream.ts';
import { tell } from '../base/notify.ts';
import { plural } from '../base/words.ts';
import { G, panel, doing, post, say } from './gitstate.ts';
import type { Wt } from './gitstate.ts';
import { openBranch } from './gitviews.ts';

const wtOf = (p: string): Wt | undefined => G.wts?.list.find((w: Wt) => w.path === p);
const lowPath = (p?: string) => String(p || '').toLowerCase();
const wtChat = (w: Wt) => [...agents.all.values()].find((a) => a.kind === 'chat' && a.wt && lowPath(a.wt) === lowPath(w.path));
const folderName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || p;
function wtState(w: Wt) {
  const base = G.wts?.base || 'main';
  if (!w.exists) return { short: 'no folder', cls: 'warn', long: 'Its folder is gone: remove tidies git’s note of it.' };
  if (w.changes) return { short: `${w.ahead ? `↑${w.ahead} · ` : ''}${w.changes} ch`, cls: 'warn', long: `${plural(w.ahead, 'commit')} not in ${base} yet, and ${plural(w.changes, 'file')} changed but not committed.` };
  if (w.ahead) return { short: `↑${w.ahead}`, cls: '', long: `${plural(w.ahead, 'commit')} not in ${base} yet.` };
  return { short: `✓ ${base}`, cls: 'ok', long: `Everything here is in ${base}, so it is safe to remove.` };
}
const wtRow = (w: Wt) => {
  const st = wtState(w), chat = wtChat(w), off = w.exists && w.changes;
  const who = chat ? chat.title || 'a chat' : 'no chat';
  return `<div class="sc-w" title="${esc(`${w.path}\n${st.long}${w.locked ? ' Another tool locked it.' : ''} Click to see what's on it.`)}" data-tip-mono>
    <svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4.5" cy="3.5" r="1.6"/><circle cx="4.5" cy="12.5" r="1.6"/><circle cx="11.5" cy="5.5" r="1.6"/><path d="M4.5 5.1v5.8M11.5 7.1c0 2.6-7 2.2-7 3.8"/></svg>
    <span class="nm"><b>${esc(w.branch || folderName(w.path))}</b><span class="dir">${esc(who)} · ${esc(folderName(w.path))}</span></span>
    <span class="sc-ws ${st.cls}">${esc(st.short)}</span>
    <button type="button" class="sc-wb" data-gwadd="${esc(w.path)}" title="Add to chat&#10;Adds this worktree to the chat you used last. Then say what to do: merge it, open a PR, or fix a conflict." aria-label="add to chat">＋</button>
    <button type="button" class="sc-wb${off ? ' off' : ''}" data-gwrm="${esc(w.path)}" title="${esc(off ? `Remove the worktree\nNot possible now: ${plural(w.changes, 'uncommitted file')} would be lost. Commit them, or ask the agent to.` : `Remove the worktree\nIts folder goes. A branch not in ${G.wts?.base || 'main'} stays.`)}" aria-label="remove the worktree"${off ? ' aria-disabled="true"' : ''}>×</button></div>`;
};
async function wtToChat(w?: Wt) {
  if (!w) return;
  const base = G.wts?.base || 'main';
  const text = `worktree ${w.path} (branch ${w.branch || 'none'}): ${plural(w.ahead, 'commit')} not in ${base}, ${plural(w.changes, 'uncommitted file')}${w.exists ? '' : ', its folder is gone'}`;
  try {
    const to = await groups.pickToChat({ label: w.branch || folderName(w.path), title: w.path, text });
    say(`${w.branch || folderName(w.path)} → ${to}`);
  } catch (e: any) {
    say(e.message, true);
  }
}
async function wtRemove(w: Wt | undefined, btn: HTMLElement) {
  if (!w) return;
  if (w.exists && w.changes) return tell(btn.closest('.sc-w')!, { title: "Can't remove it yet", line: `${plural(w.changes, 'uncommitted file')} would be lost: commit them, or ask the agent to`, ms: 2500 });
  const chat = wtChat(w), base = G.wts?.base || 'main';
  const text = [
    w.exists ? `Goes: the folder ${w.path} (nothing uncommitted in it).` : `Its folder is gone already: git forgets it.`,
    w.ahead ? `Stays: the branch ${w.branch} with its ${plural(w.ahead, 'commit')}, since they aren't in ${base}.` : w.branch ? `The branch ${w.branch} goes too: everything on it is in ${base}.` : '',
    chat ? `Stops: the chat “${chat.title || 'a chat'}” goes to sleep; its next message goes on in the project's folder.` : '',
  ].filter(Boolean).join('\n\n');
  if (!(await ask({ title: `Remove the worktree ${w.branch || folderName(w.path)}?`, text, confirm: true }))) return;
  doing('removing the worktree…', post('/api/git/worktree/remove', { path: w.path }));
}

export const WTS_HTML = `<div class="sc-split" title="Resize&#10;Drag to give the worktrees or the changes more room."></div>
      <button type="button" class="sc-fh sc-wh" data-gact="wfold"><span class="cv">▾</span><span>worktrees</span><span class="n"></span></button>
      <div class="sc-wts"></div>`;

export function wireWts() {
  panel.querySelector<HTMLElement>('.sc-split')!.addEventListener('pointerdown', (e) => {
    const list = panel.querySelector<HTMLElement>('.sc-wts')!, y0 = e.clientY, h0 = list.offsetHeight;
    e.preventDefault();
    track(e, {
      capture: e.target as Element,
      move: (ev) => {
        const max = Math.max(60, panel.querySelector<HTMLElement>('.sc-repo')!.offsetHeight - 220);
        list.style.height = Math.round(Math.min(max, Math.max(44, h0 - (ev.clientY - y0)))) + 'px';
      },
      end: () => store.set('gitWtH', list.offsetHeight),
    });
  });
}
export function wtClick(t: HTMLElement): boolean {
  const add = t.closest<HTMLElement>('[data-gwadd]');
  if (add) return wtToChat(wtOf(add.dataset.gwadd!)), true;
  const rm = t.closest<HTMLElement>('[data-gwrm]');
  if (rm) return wtRemove(wtOf(rm.dataset.gwrm!), rm), true;
  const row = t.closest<HTMLElement>('.sc-w');
  const w = row && wtOf(row.querySelector<HTMLElement>('[data-gwadd]')!.dataset.gwadd!);
  if (w?.branch) return openBranch(w.branch, G.wts?.base), true;
  return false;
}
export function foldWts() {
  store.set('gitWtFold', !store.get('gitWtFold', false));
}
export function drawWts(setHtml: (el: Element, html: string) => void) {
  const q = (s: string) => panel.querySelector<any>(s);
  const wOn = pref('git:worktrees'), list = G.wts?.list || [], fold = store.get('gitWtFold', false), wl = q('.sc-wts');
  q('.sc-wh').hidden = !wOn;
  q('.sc-split').hidden = wl.hidden = !wOn || fold;
  q('.sc-wh .cv').textContent = fold ? '▸' : '▾';
  q('.sc-wh').title = `Worktrees\nThe repository's other checkouts: a chat's own, or one made by hand. Click to ${fold ? 'show' : 'fold'} the list.`;
  q('.sc-wh').dataset.tipIcon = fold ? 'chev' : 'chevDown';
  q('.sc-wh .n').textContent = list.length || '';
  if (wOn && !fold) {
    wl.style.height = (store.get('gitWtH', 0) || 128) + 'px';
    setHtml(wl, list.length ? list.map(wtRow).join('') : '<p class="dim sc-more">None yet. A chat gets one with the worktree button in its box, before its first message.</p>');
  }
}
