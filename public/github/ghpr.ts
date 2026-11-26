import * as groups from '../app/groups.ts';
import { ask, barMenu, popMenu } from '../base/controls.ts';
import { markdown } from '../base/markdown.ts';
import { page } from '../base/page.ts';
import { onPref } from '../base/prefs.ts';
import { writerBody, writerName, writerTip, writerUnder } from '../base/writer.ts';
import { esc, setSave, showErr } from '../base/util.ts';
import { plural } from '../base/words.ts';
import { ghapi, ago, checkMark, reviewMark, link } from './ghbase.ts';

type Pr = any;
const WAYS: Record<string, [string, string]> = {
  squash: ['squash and merge', 'as one commit'],
  merge: ['merge', 'with a merge commit, every commit kept'],
  rebase: ['rebase and merge', 'each commit put on top, no merge commit'],
};
const nameOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const md = (s: string) => (s.trim() ? markdown(s) : '<p class="dim">no description</p>');

type Waiting = { path: string; line: number; side: 'old' | 'new'; body: string };
const waiting = new Map<number, Waiting[]>(), redraws = new Map<number, () => void>();
const waitHtml = (body: string) => `<p class="gh-who"><b>you</b> · waits for your review</p><div class="md">${md(body)}</div>`;
const threadHtml = (t: any) => `<div class="gh-thread${t.resolved ? ' done' : ''}">${t.comments.map((c: any) => `<p class="gh-who"><b>${esc(c.who)}</b> <span class="dim">${ago(c.at)}</span></p><div class="md">${md(c.body)}</div>`).join('')}${t.resolved ? '<p class="dim">resolved</p>' : ''}</div>`;

async function openFile(n: number, f: { path: string; x: string; from?: string }, p?: Pr) {
  try {
    const d = await ghapi('GET', `/api/gh/pr/file?n=${n}&path=${encodeURIComponent(f.path)}${f.from ? '&from=' + encodeURIComponent(f.from) : ''}`);
    if (d.binary) return setSave(`${f.path} isn't text: no diff to show`);
    const repo = page.gitRepo(), at = repo ? `${repo}/${f.path}` : f.path, cut = at.lastIndexOf('/') + 1;
    const open = p?.state === 'open';
    const list = [
      ...(p?.threads || []).filter((t: any) => t.path === f.path && t.line).map((t: any) => ({ side: t.side, line: t.line, html: threadHtml(t) })),
      ...(waiting.get(n) || []).filter((w) => w.path === f.path).map((w) => ({ side: w.side, line: w.line, html: waitHtml(w.body) })),
    ];
    const write = async (side: 'old' | 'new', line: number, body: string) => {
      waiting.set(n, [...(waiting.get(n) || []), { path: f.path, line, side, body }]);
      redraws.get(n)?.();
      return waitHtml(body);
    };
    groups.openDiff({ path: `${at.slice(0, cut)}#${n} · ${at.slice(cut)}`, rel: f.x === 'D' ? null : at, oldText: d.oldText, newText: d.newText, notes: { list, ...(open ? { write, hint: 'click a line number to comment on that line: the comments wait, and go together with your review' } : {}) } });
  } catch (e) {
    showErr(e);
  }
}

function talkRow(t: any) {
  const who = `<b>${esc(t.who)}</b> <span class="dim">${ago(t.at) === 'now' ? 'just now' : ago(t.at) + ' ago'}</span>`;
  if (t.kind === 'review') return `<div class="gh-talk rv ${t.state === 'approved' ? 'ok' : t.state === 'asked for changes' ? 'warn' : ''}"><p class="gh-who">${who} · ${esc(t.state)}</p>${t.body ? `<div class="md">${md(t.body)}</div>` : ''}</div>`;
  if (t.kind === 'line') {
    const replies = (t.replies || []).map((r: any) => `<div class="gh-reply"><p class="gh-who"><b>${esc(r.who)}</b> <span class="dim">${ago(r.at)}</span></p><div class="md">${md(r.body)}</div></div>`).join('');
    const acts = t.thread ? `<div class="gh-mrow">${t.id ? `<button class="sc-b" data-ghreply="${t.id}">reply…</button>` : ''}<button class="sc-b" data-ghresolve="${esc(t.thread)}" data-undo="${t.resolved ? 1 : ''}">${t.resolved ? 'open again' : 'resolve'}</button></div>` : '';
    return `<div class="gh-talk line${t.resolved ? ' done' : ''}"><p class="gh-who">${who} · on <button class="gh-at" data-ghfile="${esc(t.path)}">${esc(nameOf(t.path))}${t.line ? ':' + t.line : ''}</button>${t.resolved ? ' · resolved' : ''}</p>${t.hunk ? `<pre class="gh-hunk">${esc(t.hunk)}</pre>` : ''}<div class="md">${md(t.body)}</div>${replies}${acts}</div>`;
  }
  return `<div class="gh-talk"><p class="gh-who">${who}</p><div class="md">${md(t.body)}</div></div>`;
}

function mergeBox(p: Pr) {
  const m = p.merge;
  if (p.state !== 'open') return `<div class="gh-mb ${p.state === 'merged' ? 'ok' : ''}"><div class="gh-mrow"><b>${p.state === 'merged' ? 'Merged' : 'Closed'}</b><span class="grow"></span>${p.state === 'merged' && p.mine ? `<button class="outline" data-ghp="tidy" title="Tidy up&#10;Switches to ${esc(p.base)} and pulls it, deletes ${esc(p.head)} here, and removes its folder if it has one.">tidy up</button>` : ''}</div></div>`;
  const ways = m.ways.map((w: string) => `<option value="${w}">${WAYS[w][0]}</option>`).join('');
  const lines = [...m.why.map((w: string) => `<li class="no">${esc(w)}</li>`), ...m.warn.map((w: string) => `<li class="warn">${esc(w)}</li>`)].join('');
  const blocked = !m.can, auto = blocked && !p.draft && !m.why.some((w: string) => /clashes|draft/.test(w));
  return `<div class="gh-mb ${blocked ? 'no' : 'ok'}"><p><b>${blocked ? "Can't merge yet" : 'Ready to merge'}</b>${m.write ? '' : ' <span class="dim">· you can’t merge into this repository</span>'}</p>${lines ? `<ul>${lines}</ul>` : ''}
    <div class="gh-mrow">${ways ? `<select class="gh-way">${ways}</select>` : ''}<label class="tick"><input type="checkbox" class="gh-del" ${m.deleteBranch ? 'checked' : ''}> delete the branch</label><span class="grow"></span>
    ${blocked ? (auto ? `<button class="outline" data-ghp="auto" ${m.write && ways ? '' : 'disabled'}>merge when ready</button>` : '') : `<button class="primary" data-ghp="merge" ${m.write && ways ? '' : 'disabled'}>merge</button>`}
    ${m.why.some((w: string) => /moved on/.test(w)) ? `<button class="outline" data-ghp="update">bring ${esc(p.base)} in</button>` : ''}</div></div>`;
}

export function openPr(n: number) {
  const key = `pr:${page.gitRepo()}:${n}`;
  groups.openPane(key, `#${n} · pull request`, () => {
    const el = document.createElement('div');
    el.className = 'gv gh-pr';
    el.innerHTML = '<p class="dim gv-wait">asking GitHub…</p>';
    let p: Pr = null, files: any[] | null = null;
    const logs = new Map<number, string[] | null>();
    const logHtml = (lines: string[] | null) => `<div class="gh-log">${lines ? `<pre>${esc(lines.join('\n'))}</pre><div class="gh-mrow"><button class="outline" data-ghp="log-chat">→ chat</button><button data-ghp="rerun">run it again</button></div>` : '<p class="dim">reading the log…</p>'}</div>`;
    const draw = () => {
      const seen = p.viewed || {}, nseen = (files || []).filter((f) => seen[f.path]).length;
      const filesHtml = files ? (files.length ? files.map((f) => `<div class="gh-frow${seen[f.path] ? ' seen' : ''}"><input type="checkbox" data-ghview="${esc(f.path)}" ${seen[f.path] ? 'checked' : ''} title="Viewed&#10;Marks this file viewed. It is kept on GitHub, as on the website."><button class="gv-f" data-ghfile="${esc(f.path)}"><span class="sc-x x-${f.x}">${f.x}</span><span class="nm">${esc(nameOf(f.path))}</span><span class="dir">${esc(f.path.slice(0, Math.max(0, f.path.lastIndexOf('/'))))}</span>${(p.threads || []).some((t: any) => t.path === f.path && !t.resolved) ? '<span class="gh-tc" title="Open comments&#10;This file has review comments that aren\'t resolved yet.">●</span>' : ''}</button></div>`).join('') : '<p class="dim">no files</p>') : '<p class="dim">…</p>';
      const checks = p.checks.length ? p.checks.map((c: any, i: number) => `<div class="gh-chk">${checkMark(c.state === 'skip' ? '' : c.state)}<span class="nm">${esc(c.name)}</span><span class="dir">${esc(c.workflow)}</span><span class="grow"></span>${c.state === 'fail' && /\/actions\/runs\//.test(c.url) ? `<button class="sc-b" data-ghlog="${i}">why it failed</button>` : ''}${c.url ? link(c.url, 'log ↗') : ''}</div>${logs.has(i) && (c.state === 'fail' || !logs.delete(i)) ? logHtml(logs.get(i)!) : ''}`).join('') : '<p class="dim">no checks</p>';
      const pend = waiting.get(n) || [];
      const people = `<div class="gh-ppl"><span class="dim">reviewers</span> ${p.asked.length ? esc(p.asked.join(', ')) : '<span class="dim">none asked</span>'}${p.state === 'open' ? ' <button class="sc-b" data-ghp="ask-review">+ ask…</button>' : ''} <span class="dim">· labels</span> ${p.labels.length ? p.labels.map((l: string) => `<span class="gv-ref">${esc(l)}</span>`).join(' ') : '<span class="dim">none</span>'}${p.state === 'open' ? ' <button class="sc-b" data-ghp="label">+ label…</button>' : ''}</div>`;
      const canReview = !p.mine && p.state === 'open';
      el.innerHTML = `<div class="gv-head"><h2>${esc(p.title)} <span class="dim">#${p.n}</span></h2>
          <p class="gv-meta"><span class="gh-st ${p.state}${p.draft ? ' draft' : ''}">${p.draft ? 'draft' : p.state}</span> ${esc(p.author)} wants <b>${esc(p.head)}</b> in <b>${esc(p.base)}</b> · ${plural(p.nfiles, 'file')} <span class="ok">+${p.adds}</span> <span class="no">−${p.dels}</span> · ${reviewMark(p.review)} ${checkMark(p.roll)}${p.asked.length ? ` · asked: ${esc(p.asked.join(', '))}` : ''}</p>
          <div class="gv-acts">${link(p.url, 'GitHub ↗')}<button data-ghp="chat">→ chat</button><button data-ghp="checkout">check out</button><button data-ghp="folder" title="In its own folder&#10;Checks out its branch in a folder of its own, as a project. Your work here stays as it is.">in its own folder</button><button data-ghp="again" aria-label="ask GitHub again">⟳</button></div></div>
        ${people}
        ${mergeBox(p)}
        <div class="md gh-body">${md(p.body)}</div>
        <div class="gv-sec"><span class="gv-h">checks</span></div><div class="gh-checks">${checks}</div>
        <div class="gv-sec"><span class="gv-h">files, against where it began</span>${files?.length ? `<span class="gh-nv">${nseen} of ${files.length} viewed</span>` : ''}</div><div class="gv-files">${filesHtml}</div>
        <div class="gv-sec"><span class="gv-h">commits</span></div><div>${p.commits.map((c: any) => `<div class="gv-c"><span class="gv-sh">${esc(c.short)}</span><span class="nm">${esc(c.subject)}</span><span class="dir">${esc(c.author)} · ${ago(c.at)}</span></div>`).join('')}</div>
        <div class="gv-sec"><span class="gv-h">conversation</span></div><div class="gh-talks">${p.talk.map(talkRow).join('') || '<p class="dim">nothing said yet</p>'}</div>
        ${p.state === 'open' ? `<div class="gh-say">${pend.length ? `<p class="gh-pend"><b>${plural(pend.length, 'line comment')}</b> ${pend.length === 1 ? 'waits' : 'wait'}: ${pend.length === 1 ? 'it goes' : 'they go'} with your review (comment, approve or ask for changes). <button class="sc-b" data-ghp="drop">drop ${pend.length === 1 ? 'it' : 'them'}</button></p>` : ''}<textarea class="gh-text" rows="3" placeholder="a comment, or what a review says"></textarea><div class="gh-mrow"><button class="outline" data-ghp="comment">comment</button><span class="grow"></span>${canReview ? `<button class="outline" data-ghp="changes">ask for changes</button><button class="primary" data-ghp="approve">approve</button>` : ''}${p.mine && p.draft ? '<button class="outline" data-ghp="ready">ready for review</button>' : ''}${p.mine ? '<button data-ghp="close">close</button>' : ''}</div></div>` : ''}`;
    };
    const load = async () => {
      try {
        p = await ghapi('GET', `/api/gh/pr?n=${n}`);
        draw();
      } catch (e: any) {
        el.innerHTML = `<p class="err gv-wait">${esc(e.message)}</p>`;
        return;
      }
      if (files) return;
      try {
        files = (await ghapi('GET', `/api/gh/pr/files?n=${n}`)).files;
      } catch (e: any) {
        files = [];
        setSave(e.message, true);
      }
      if (p) draw();
    };
    const act = async (word: string, url: string, body: object, after?: () => void) => {
      try {
        setSave(word);
        const r = await ghapi('POST', url, { n, ...body });
        setSave(r.line || '');
        after?.();
        await load();
      } catch (e) {
        showErr(e);
      }
    };
    el.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>('[data-ghfile]');
      if (f && p) return openFile(n, files?.find((x) => x.path === f.dataset.ghfile) || { path: f.dataset.ghfile!, x: 'M' }, p);
      const view = t.closest<HTMLInputElement>('[data-ghview]');
      if (view && p) return act(view.checked ? 'marking it viewed…' : 'unmarking it…', '/api/gh/pr/viewed', { path: view.dataset.ghview, viewed: view.checked });
      const rep = t.closest<HTMLElement>('[data-ghreply]');
      if (rep) {
        const body = await ask({ title: 'Reply', placeholder: 'your reply' });
        if (body) act('replying…', '/api/gh/pr/reply', { id: Number(rep.dataset.ghreply), body });
        return;
      }
      const res = t.closest<HTMLElement>('[data-ghresolve]');
      if (res) return act(res.dataset.undo ? 'opening it again…' : 'resolving…', '/api/gh/pr/resolve', { thread: res.dataset.ghresolve, undo: !!res.dataset.undo });
      const lg = t.closest<HTMLElement>('[data-ghlog]');
      if (lg && p) {
        const i = Number(lg.dataset.ghlog);
        if (logs.has(i)) return logs.delete(i), draw();
        logs.set(i, null);
        draw();
        try {
          logs.set(i, (await ghapi('GET', `/api/gh/run/log?url=${encodeURIComponent(p.checks[i].url)}`)).lines);
        } catch (err: any) {
          logs.set(i, [err.message]);
        }
        return draw();
      }
      const a = t.closest<HTMLElement>('[data-ghp]')?.dataset.ghp;
      if (!a || !p) return;
      const text = (el.querySelector('.gh-text') as HTMLTextAreaElement | null)?.value.trim() || '';
      const clear = () => {
        const box = el.querySelector('.gh-text') as HTMLTextAreaElement | null;
        if (box) box.value = '';
      };
      if (a === 'again') return load();
      const pend = waiting.get(n) || [], sent = () => (clear(), waiting.delete(n));
      if (a === 'drop') return waiting.delete(n), draw();
      if (a === 'comment') return pend.length ? act('sending the review…', '/api/gh/pr/review', { how: 'comment', body: text, comments: pend }, sent) : text ? act('commenting…', '/api/gh/pr/comment', { body: text }, clear) : setSave('Write the comment first.', true);
      if (a === 'approve') return act('approving…', '/api/gh/pr/review', { how: 'approve', body: text, comments: pend }, sent);
      if (a === 'changes') return text || pend.length ? act('sending the review…', '/api/gh/pr/review', { how: 'changes', body: text, comments: pend }, sent) : setSave('Say what should change, in the box or on its lines.', true);
      if (a === 'tidy') return act('tidying up…', '/api/gh/pr/tidy', {}, () => page.gitRefresh());
      if (a === 'rerun' || a === 'log-chat') {
        const i = [...logs.keys()].pop()!, c = p.checks[i];
        if (a === 'rerun') return act('running it again…', '/api/gh/run/rerun', { url: c.url });
        try {
          setSave(`${c.name} → ${await groups.pickToChat({ label: c.name, title: `check ${c.name} of #${n}`, text: `the check “${c.name}” fails on pull request #${n} (${p.head}): fix it. The end of its log:\n${(logs.get(i) || []).slice(-60).join('\n')}` })}`);
        } catch (err) {
          showErr(err);
        }
        return;
      }
      if (a === 'ask-review' || a === 'label') {
        let all: any;
        try {
          all = await ghapi('GET', '/api/gh/people');
        } catch (err) {
          return showErr(err);
        }
        const items = a === 'label' ? all.labels.map((l: any) => l.name).filter((x: string) => !p.labels.includes(x)) : all.people.filter((x: string) => x !== p.author && !p.asked.includes(x));
        if (!items.length) return setSave(a === 'label' ? 'every label is on it already' : 'nobody else to ask', true);
        const b = (t.closest('button') as HTMLElement).getBoundingClientRect();
        return popMenu(b.left, b.bottom + 4, `<div class="ml">${a === 'label' ? 'add a label' : 'ask for a review'}</div>` + items.map((x: string) => `<button class="mi" data-pick="${esc(x)}">${esc(x)}</button>`).join(''), (m: HTMLElement) =>
          act(a === 'label' ? 'labelling…' : 'asking…', '/api/gh/pr/edit', a === 'label' ? { addLabels: [m.dataset.pick] } : { addReviewers: [m.dataset.pick] }),
        );
      }
      if (a === 'ready') return act('marking it ready…', '/api/gh/pr/ready', {});
      if (a === 'update') return act(`bringing ${p.base} in…`, '/api/gh/pr/update', {});
      if (a === 'close') return (await ask({ title: `Close #${n} without merging?`, text: 'It stays on GitHub, closed; you can open it again there.', confirm: true })) && act('closing…', '/api/gh/pr/close', {});
      if (a === 'merge' || a === 'auto') {
        const how = (el.querySelector('.gh-way') as HTMLSelectElement).value, del = (el.querySelector('.gh-del') as HTMLInputElement).checked;
        const k = p.commits.length;
        const what = how === 'squash' ? `puts ${plural(k, 'commit')} into ${p.base} on GitHub, as one` : how === 'rebase' ? `puts ${plural(k, 'commit')} on top of ${p.base} on GitHub, one by one` : `puts ${plural(k, 'commit')} into ${p.base} on GitHub, with a merge commit`;
        const text2 = `${a === 'auto' ? 'Once what blocks it is done, GitHub ' : 'This '}${what}${del ? `, and deletes the branch ${p.head} there` : ''}.`;
        if (!(await ask({ title: a === 'auto' ? `Merge #${n} when it's ready?` : `Merge #${n}?`, text: text2, confirm: true }))) return;
        return act('merging…', '/api/gh/pr/merge', { how, deleteBranch: del, auto: a === 'auto' });
      }
      if (a === 'checkout') return (await ask({ title: `Switch to #${n}'s branch?`, text: `This project's folder goes to ${p.head}. Uncommitted changes come along, or git refuses if they clash.`, confirm: true })) && act('checking out…', '/api/gh/pr/checkout', {});
      if (a === 'folder') {
        try {
          setSave('opening it in its own folder…');
          const r = await ghapi('POST', '/api/gh/pr/checkout', { n, worktree: true });
          setSave(r.line);
          await page.addProject({ name: `#${n} ${p.title}`.slice(0, 60), path: r.path });
        } catch (err) {
          showErr(err);
        }
        return;
      }
      if (a === 'chat') {
        const notes = p.talk.filter((x: any) => x.kind !== 'comment' || x.who !== p.author).map((x: any) => `- ${x.who}${x.path ? ` on ${x.path}${x.line ? ':' + x.line : ''}` : ''}${x.state ? ` (${x.state})` : ''}: ${x.body.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
        const brief = `pull request #${n} “${p.title}” (${p.head} → ${p.base}, ${p.url})${p.roll === 'fail' ? `\nfailing checks: ${p.checks.filter((c: any) => c.state === 'fail').map((c: any) => c.name).join(', ')}` : ''}${notes ? `\nwhat was said:\n${notes}` : ''}`;
        try {
          setSave(`#${n} → ${await groups.pickToChat({ label: `#${n}`, title: p.title, text: brief })}`);
        } catch (err) {
          showErr(err);
        }
      }
    });
    redraws.set(n, () => p && draw());
    load();
    return { el, stop: () => redraws.delete(n) };
  });
}

const prTip = () => writerTip('Write the title and description', "reads the branch's commits and changes and writes them.");
barMenu('.gh-form .gh-ai', () => null, { open: (el) => writerUnder(el) });
onPref('writer:use', () => document.querySelectorAll<HTMLElement>('.gh-form .gh-ai').forEach((b) => (b.title = prTip())));

export function newPr(head?: string) {
  const key = `newpr:${page.gitRepo()}:${head || ''}`;
  groups.openPane(key, 'new pull request', (close) => {
    const el = document.createElement('div');
    el.className = 'gv gh-pr gh-form';
    el.innerHTML = `<div class="gv-head"><h2>New pull request</h2><p class="gv-meta">${head ? `from <b>${esc(head)}</b>` : 'from the branch you are on'}; it is pushed first if GitHub doesn't have it yet</p></div>
      <label class="gh-lbl">title</label><div class="gh-mrow"><input class="gh-title" placeholder="what it does" spellcheck="true"><button class="sc-ai gh-ai" data-ghf="ai" data-tip-set="agents:writer:use" title="${esc(prTip())}">✦</button></div>
      <label class="gh-lbl">description</label><textarea class="gh-text" rows="12" placeholder="what changed and why (markdown)"></textarea>
      <div class="gh-mrow"><label class="gh-lbl">into</label><input class="gh-base" placeholder="main" spellcheck="false"><label class="tick"><input type="checkbox" class="gh-draft"> draft</label></div>
      <div class="gh-mrow"><label class="gh-lbl">reviewers</label><input class="gh-revs" placeholder="logins, with commas" spellcheck="false"><label class="gh-lbl">labels</label><input class="gh-labs" placeholder="bug, ui" spellcheck="false"><span class="grow"></span><button class="primary" data-ghf="create">open it</button></div>`;
    const v = (s: string) => el.querySelector<HTMLInputElement>(s)!;
    el.addEventListener('click', async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-ghf]')?.dataset.ghf;
      if (a === 'ai') {
        try {
          setSave(`${writerName()} is writing it…`);
          const r = await ghapi('POST', '/api/gh/pr/message', { base: v('.gh-base').value.trim() || undefined, head, ...writerBody() });
          if (!v('.gh-title').value.trim()) v('.gh-title').value = r.title;
          const box = el.querySelector<HTMLTextAreaElement>('.gh-text')!;
          if (!box.value.trim()) box.value = r.body;
          setSave('');
        } catch (err) {
          showErr(err);
        }
      }
      if (a === 'create') {
        try {
          setSave('opening the pull request…');
          const r = await ghapi('POST', '/api/gh/pr', { title: v('.gh-title').value, body: el.querySelector<HTMLTextAreaElement>('.gh-text')!.value, base: v('.gh-base').value.trim() || undefined, draft: v('.gh-draft').checked, reviewers: v('.gh-revs').value, labels: v('.gh-labs').value, head });
          setSave(r.line);
          close();
          if (r.n) openPr(r.n);
          page.gitRefresh();
        } catch (err) {
          showErr(err);
        }
      }
    });
    return { el };
  });
}
