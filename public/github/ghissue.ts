import * as groups from '../app/groups.ts';
import { ask, popMenu } from '../base/controls.ts';
import { markdown } from '../base/markdown.ts';
import { api } from '../base/model.ts';
import { page } from '../base/page.ts';
import { esc, setSave, showErr } from '../base/util.ts';
import { ghapi, ago, link } from './ghbase.ts';
import { openPr } from './ghpr.ts';

const md = (s: string) => (s.trim() ? markdown(s) : '<p class="dim">no description</p>');
const when = (at: number) => (ago(at) === 'now' ? 'just now' : `${ago(at)} ago`);
const labelHtml = (l: { name: string; color: string }) => `<span class="gh-lab"${/^[0-9a-f]{6}$/i.test(l.color) ? ` style="--lc:#${l.color}"` : ''}>${esc(l.name)}</span>`;

async function startOn(i: any) {
  const where = await ask({
    title: `Start on #${i.n}`,
    text: `A branch ${i.branch} is made from the main branch and linked to the issue on GitHub, so its pull request closes it.\n\nHere: this folder switches to it. In its own folder: a second checkout, as a project of its own. With a chat: that folder, and a chat there with the issue as its first message.`,
    choices: [
      { label: 'with a chat', value: 'chat' },
      { label: 'in its own folder', value: 'folder' },
      { label: 'here', value: 'here' },
    ],
  });
  if (!where) return;
  try {
    setSave(`starting on #${i.n}…`);
    const r = await ghapi('POST', '/api/gh/issue/start', { n: i.n, where: where === 'here' ? 'here' : 'folder' });
    setSave(r.line);
    if (where === 'here') return page.gitRefresh();
    await page.addProject({ name: `#${i.n} ${i.title}`.slice(0, 60), path: r.path });
    if (where === 'chat') {
      const text = `#${i.n} ${i.title}\n${i.url}\n\n${i.body}${i.talk.length ? '\n\n' + i.talk.map((c: any) => `${c.who}: ${c.body}`).join('\n\n') : ''}`;
      await api('POST', '/api/chats/new', { text, follow: true });
    }
  } catch (e) {
    showErr(e);
  }
}

export function openIssue(n: number) {
  const key = `issue:${page.gitRepo()}:${n}`;
  groups.openPane(key, `#${n} · issue`, () => {
    const el = document.createElement('div');
    el.className = 'gv gh-pr gh-iss';
    el.innerHTML = '<p class="dim gv-wait">asking GitHub…</p>';
    let i: any = null;
    const draw = () => {
      const open = i.state === 'open';
      el.innerHTML = `<div class="gv-head"><h2>${esc(i.title)} <span class="dim">#${i.n}</span></h2>
          <p class="gv-meta"><span class="gh-st ${open ? 'open' : 'closed'}">${open ? 'open' : i.reason || 'closed'}</span> ${esc(i.author)} · ${when(i.at)}${i.labels.length ? ' · ' + i.labels.map(labelHtml).join(' ') : ''}</p>
          <div class="gv-acts">${link(i.url, 'GitHub ↗')}<button data-ghi="chat">→ chat</button>${open ? `<button class="primary" data-ghi="start" title="Start on it&#10;Makes a branch for this issue, linked to it on GitHub. You pick where: here, in a folder of its own, or with a chat.">start on it</button>` : ''}<button data-ghi="again" aria-label="ask GitHub again">⟳</button></div></div>
        <div class="gh-ppl"><span class="dim">assigned</span> ${i.assignees.length ? esc(i.assignees.join(', ')) : '<span class="dim">nobody</span>'}${open && !i.mine ? ' <button class="sc-b" data-ghi="me">assign me</button>' : ''} <span class="dim">· labels</span> ${i.labels.length ? i.labels.map(labelHtml).join(' ') : '<span class="dim">none</span>'} <button class="sc-b" data-ghi="label">+ label…</button></div>
        ${i.prs.length ? `<div class="gh-ppl"><span class="dim">pull requests</span> ${i.prs.map((p: any) => `<button class="sc-b" data-ghipr="${p.n}" title="${esc(p.title)}" data-tip-cut>#${p.n}${p.title ? ' ' + esc(p.title) : ''}</button>`).join(' ')}</div>` : ''}
        <div class="md gh-body">${md(i.body)}</div>
        <div class="gv-sec"><span class="gv-h">conversation</span></div><div class="gh-talks">${i.talk.map((c: any) => `<div class="gh-talk"><p class="gh-who"><b>${esc(c.who)}</b> <span class="dim">${when(c.at)}</span></p><div class="md">${md(c.body)}</div></div>`).join('') || '<p class="dim">nothing said yet</p>'}</div>
        <div class="gh-say"><textarea class="gh-text" rows="3" placeholder="a comment"></textarea><div class="gh-mrow"><button class="outline" data-ghi="comment">comment</button><span class="grow"></span>${open ? '<button data-ghi="close">close…</button>' : '<button data-ghi="reopen">open again</button>'}</div></div>`;
    };
    const load = async () => {
      try {
        i = await ghapi('GET', `/api/gh/issue?n=${n}`);
        draw();
      } catch (e: any) {
        el.innerHTML = `<p class="err gv-wait">${esc(e.message)}</p>`;
      }
    };
    const act = async (word: string, url: string, body: object, after?: () => void) => {
      try {
        setSave(word);
        setSave((await ghapi('POST', url, { n, ...body })).line || '');
        after?.();
        await load();
      } catch (e) {
        showErr(e);
      }
    };
    el.addEventListener('click', async (e) => {
      const t = e.target as HTMLElement;
      const pr = t.closest<HTMLElement>('[data-ghipr]');
      if (pr) return openPr(Number(pr.dataset.ghipr));
      const a = t.closest<HTMLElement>('[data-ghi]')?.dataset.ghi;
      if (!a || !i) return;
      const box = el.querySelector<HTMLTextAreaElement>('.gh-text'), text = box?.value.trim() || '';
      if (a === 'again') return load();
      if (a === 'start') return startOn(i);
      if (a === 'comment') return text ? act('commenting…', '/api/gh/issue/comment', { body: text }, () => box && (box.value = '')) : setSave('Write the comment first.', true);
      if (a === 'reopen') return act('opening it again…', '/api/gh/issue/reopen', {});
      if (a === 'me') return act('assigning…', '/api/gh/issue/edit', { addAssignees: ['@me'] });
      if (a === 'close') {
        const reason = await ask({ title: `Close #${n}?`, text: 'Done: it is fixed or finished. Not planned: it won’t be done.', choices: [{ label: 'done', value: 'completed' }, { label: 'not planned', value: 'not planned' }] });
        if (!reason) return;
        if (text) {
          try {
            await ghapi('POST', '/api/gh/issue/comment', { n, body: text });
            if (box) box.value = '';
          } catch (err) {
            return showErr(err);
          }
        }
        return act('closing…', '/api/gh/issue/close', { reason });
      }
      if (a === 'label') {
        let all: any;
        try {
          all = await ghapi('GET', '/api/gh/people');
        } catch (err) {
          return showErr(err);
        }
        const have = new Set(i.labels.map((l: any) => l.name));
        const items = all.labels.filter((l: any) => !have.has(l.name));
        if (!items.length) return setSave('every label is on it already', true);
        const b = (t.closest('button') as HTMLElement).getBoundingClientRect();
        return popMenu(b.left, b.bottom + 4, `<div class="ml">add a label</div>` + items.map((l: any) => `<button class="mi" data-pick="${esc(l.name)}">${esc(l.name)}${l.description ? `<span class="d">${esc(l.description)}</span>` : ''}</button>`).join(''), (m: HTMLElement) => act('labelling…', '/api/gh/issue/edit', { addLabels: [m.dataset.pick] }));
      }
      if (a === 'chat') {
        try {
          setSave(`#${n} → ${await groups.pickToChat({ label: `#${n}`, title: i.title, text: `issue #${n} “${i.title}” (${i.url})\n\n${i.body}` })}`);
        } catch (err) {
          showErr(err);
        }
      }
    });
    load();
    return { el };
  });
}

export function newIssue() {
  groups.openPane(`newissue:${page.gitRepo()}`, 'new issue', (close) => {
    const el = document.createElement('div');
    el.className = 'gv gh-pr gh-form';
    el.innerHTML = `<div class="gv-head"><h2>New issue</h2></div>
      <label class="gh-lbl">title</label><input class="gh-title" placeholder="what is wrong, or what is wanted" spellcheck="true">
      <label class="gh-lbl">description</label><textarea class="gh-text" rows="12" placeholder="steps, what you expected, what happened (markdown)"></textarea>
      <div class="gh-mrow"><label class="gh-lbl">labels</label><input class="gh-labs" placeholder="bug, ui" spellcheck="false"><label class="tick"><input type="checkbox" class="gh-me"> assign me</label><span class="grow"></span><button class="primary" data-ghn="create">open it</button></div>`;
    el.addEventListener('click', async (e) => {
      if (!(e.target as HTMLElement).closest('[data-ghn="create"]')) return;
      const v = (s: string) => el.querySelector<HTMLInputElement>(s)!;
      try {
        setSave('opening the issue…');
        const r = await ghapi('POST', '/api/gh/issue', { title: v('.gh-title').value, body: el.querySelector<HTMLTextAreaElement>('.gh-text')!.value, labels: v('.gh-labs').value, me: v('.gh-me').checked });
        setSave(r.line);
        close();
        if (r.n) openIssue(r.n);
      } catch (err) {
        showErr(err);
      }
    });
    return { el };
  });
}
