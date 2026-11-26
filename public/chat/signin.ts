import { api } from '../base/model.ts';
import { esc, setSave } from '../base/util.ts';
import { notify } from '../base/notify.ts';

type SignInCtx = {
  el: HTMLElement;
  tab: () => { type: string; chat?: string | null };
  name: () => string;
  line: (cls: string, html: string) => HTMLElement;
  state: (s: string, cls?: string) => void;
  ended: () => boolean;
  end: () => void;
  close: () => void;
  reset: () => void;
  restart: () => Promise<void>;
};

const KEYS_URL = 'https://console.anthropic.com/settings/keys';
const CC_URL = 'https://code.claude.com/docs/en/getting-started';

const WAYS: Record<string, { title: string; sub: string; text: string; login?: boolean; fields?: [string, string, string, boolean?][] }> = {
  claude: { title: 'Claude Code', sub: 'Use the Claude Code installed on this PC', text: 'Runs your own Claude Code with its own sign-in. Amethyst never sees that sign-in.' },
  console: { title: 'Anthropic Console account', sub: 'Pay per use, billed to your Console account', login: true, text: 'Uses the Console account this PC is signed in with. Not signed in yet? "Sign in" opens a window where the Console sign-in runs in your browser.' },
  key: { title: 'Anthropic API key', sub: 'Paste a key from the Claude Console', fields: [['apiKey', 'API key', 'sk-ant-…', true]], text: `<a href="${KEYS_URL}" target="_blank" rel="noopener noreferrer">Get a key in the Claude Console ↗</a>` },
  bedrock: { title: 'Amazon Bedrock', sub: 'Claude through your AWS account', fields: [['region', 'AWS region', 'us-east-1'], ['profile', 'AWS profile (optional)', 'default'], ['apiKey', 'Bedrock API key (optional)', '', true]], text: 'Without a Bedrock API key it uses your AWS sign-in on this PC (aws configure, aws sso login or aws login).' },
  aws: { title: 'Claude Platform on AWS', sub: 'Anthropic’s API, billed through AWS', fields: [['workspaceId', 'Workspace ID', 'wrkspc_…'], ['region', 'AWS region (optional)', 'us-east-1'], ['profile', 'AWS profile (optional)', 'default'], ['apiKey', 'Workspace API key (optional)', 'sk-ant-…', true]], text: 'Without a workspace API key it uses your AWS sign-in on this PC.' },
  vertex: { title: 'Google Cloud', sub: 'Claude through your Google Cloud project', fields: [['project', 'Project ID', 'my-project'], ['region', 'Region (optional)', 'global']], text: 'Uses your Google Cloud sign-in on this PC: gcloud auth application-default login.' },
  foundry: { title: 'Microsoft Foundry', sub: 'Claude through your Azure resource', fields: [['resource', 'Resource name', 'my-resource'], ['apiKey', 'API key (optional)', '', true]], text: 'Without an API key it uses your Azure sign-in on this PC: az login.' },
};

export function createSignIn({ el, tab, name, line, state, ended, end, close, reset, restart }: SignInCtx) {
  const infoOf = (all: any) => ({ codex: all, antigravity: all.antigravity, cursor: all.cursor, copilot: all.copilot, grok: all.grok } as Record<string, any>)[tab().type] || all.auth;
  let account = 'default';
  function signInScreen(info: any, why = '', keep = false) {
    if (info?.account) account = info.account;
    const codex = tab().type === 'codex', agy = tab().type === 'antigravity', cursor = tab().type === 'cursor', copilot = tab().type === 'copilot', grok = tab().type === 'grok';
    const back = keep ? `<button type="button" class="si-x" data-si-back title="Close&#10;Closes this window." aria-label="close">×</button>` : '';
    const put = keep ? (cls: string, html: string) => {
      const d = document.createElement('div');
      d.className = cls + ' si-win';
      d.innerHTML = html;
      el.append(d);
      return d;
    } : line;
    if (!keep) {
      end();
    }
    if (!keep && !agy && !cursor && !copilot && !grok) state(codex ? (info?.codex?.signedIn ? 'signed in' : 'not signed in') : (info?.method ? 'signed in' : 'not signed in'), codex ? (info?.codex?.signedIn ? '' : 'warn') : (info?.method ? '' : 'warn'));
    if (codex) {
      const signedIn = !!info?.codex?.signedIn;
      put('ch-signin', `${back}<b class="si-title">${signedIn ? 'Codex Agent is ready' : 'Sign in to use Codex Agent'}</b><p>${signedIn ? 'Signed in with your Codex CLI account.' : 'Codex uses the sign-in managed by the Codex CLI.'}</p>${why ? `<p class="err">${esc(why)}</p>` : ''}${signedIn ? '' : '<div class="row"><button class="primary" data-si-login="codex">Sign in to Codex…</button></div><p class="dim">This opens the Codex CLI sign-in flow. Amethyst does not store your Codex credentials.</p>'}`);
      return;
    }
    if (cursor) {
      const signedIn = !!info?.signedIn;
      if (!keep) state(signedIn ? 'signed in' : 'not signed in', signedIn ? '' : 'warn');
      put(
        'ch-signin',
        `${back}<b class="si-title">${signedIn ? 'Cursor Agent is ready' : 'Sign in to use Cursor Agent'}</b>
        <p>${signedIn ? `Signed in with ${esc(info.line)}.` : "Cursor Agent uses the sign-in kept by Cursor's CLI, or an API key."}${info?.saved ? ' <button class="outline" data-si-out>forget the key</button>' : ''}</p>
        ${why ? `<p class="err">${esc(why)}</p>` : ''}
        <div class="si-list">
          <details class="si-way" data-way="login" ${info?.saved ? '' : 'open'}><summary><b>Cursor CLI sign-in</b></summary><div class="si-body"><p class="dim">Your Cursor account, signed in once in the browser with <code>agent login</code>.</p><div class="row"><button class="primary" data-si-login="cursor">Sign in in a terminal…</button></div></div></details>
          <details class="si-way" data-way="cursor-key" ${info?.saved ? 'open' : ''}><summary><b>Cursor API key</b>${info?.saved ? '<em>in use</em>' : ''}</summary><div class="si-body"><p class="dim">A key from your Cursor dashboard, under API keys.</p><div class="si-fields"><label><span>API key</span><input name="apiKey" type="password" placeholder="your Cursor API key" autocomplete="off" spellcheck="false"></label></div><div class="row"><button class="primary" data-si-save="cursor-key">Use this key</button></div></div></details>
        </div>
        <p class="dim si-foot">Cursor's CLI keeps its own sign-in, and Amethyst never reads it. A key you enter stays on this PC, in your workspace folder, and goes only to ${name()}.</p>`,
      );
      return;
    }
    if (copilot) {
      if (!keep) state('not signed in', 'warn');
      put(
        'ch-signin',
        `${back}<b class="si-title">${why ? 'Sign in to use Copilot Agent' : `Connect ${name()}`}</b>
        <p>${info?.line && info.line !== 'your Copilot CLI sign-in' ? `Uses ${esc(info.line)}.` : 'Copilot Agent uses the sign-in kept by GitHub Copilot CLI, or a GitHub token.'}${info?.saved ? ' <button class="outline" data-si-out>forget the token</button>' : ''}</p>
        ${why ? `<p class="err">${esc(why)}</p>` : ''}
        <div class="si-list">
          <details class="si-way" data-way="login" ${info?.saved ? '' : 'open'}><summary><b>GitHub sign-in</b></summary><div class="si-body"><p class="dim">Your GitHub account (or Microsoft Entra), signed in once in the browser with <code>copilot login</code>. It needs a Copilot plan.</p><div class="row"><button class="primary" data-si-login="copilot">Sign in in a terminal…</button></div></div></details>
          <details class="si-way" data-way="copilot-token" ${info?.saved ? 'open' : ''}><summary><b>GitHub token</b>${info?.saved ? '<em>in use</em>' : ''}</summary><div class="si-body"><p class="dim">A fine-grained personal access token with the Copilot Requests permission, from github.com/settings/tokens. Classic tokens (ghp_…) don't work.</p><div class="si-fields"><label><span>Token</span><input name="token" type="password" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label></div><div class="row"><button class="primary" data-si-save="copilot-token">Use this token</button></div></div></details>
        </div>
        <p class="dim si-foot">GitHub Copilot CLI keeps its own sign-in, and Amethyst never reads it. A token you enter stays on this PC, in your workspace folder, and goes only to ${name()}.</p>`,
      );
      return;
    }
    if (grok) {
      if (!keep) state('not signed in', 'warn');
      put(
        'ch-signin',
        `${back}<b class="si-title">${why ? 'Sign in to use Grok Agent' : `Connect ${name()}`}</b>
        <p>${info?.line && info.line !== 'your Grok CLI sign-in' ? `Uses ${esc(info.line)}.` : 'Grok Agent uses the sign-in kept by Grok Build CLI, or an xAI API key.'}${info?.saved ? ' <button class="outline" data-si-out>forget the API key</button>' : ''}</p>
        ${why ? `<p class="err">${esc(why)}</p>` : ''}
        <div class="si-list">
          <details class="si-way" data-way="login" ${info?.saved ? '' : 'open'}><summary><b>Grok sign-in</b></summary><div class="si-body"><p class="dim">Your Grok account, signed in once in the browser with <code>grok login</code>.</p><div class="row"><button class="primary" data-si-login="grok">Sign in in a terminal…</button></div></div></details>
          <details class="si-way" data-way="grok-key" ${info?.saved ? 'open' : ''}><summary><b>xAI API key</b>${info?.saved ? '<em>in use</em>' : ''}</summary><div class="si-body"><p class="dim">An API key from console.x.ai, sent as <code>XAI_API_KEY</code>.</p><div class="si-fields"><label><span>API key</span><input name="apiKey" type="password" placeholder="xai-…" autocomplete="off" spellcheck="false"></label></div><div class="row"><button class="primary" data-si-save="grok-key">Use this key</button></div></div></details>
        </div>
        <p class="dim si-foot">Grok Build CLI keeps its own sign-in, and Amethyst never reads it. A key you enter stays on this PC, in your workspace folder, and goes only to ${name()}.</p>`,
      );
      return;
    }
    if (agy) {
      if (!keep) state('not signed in', 'warn');
      const key = 'gemini-api-key';
      const way = (w: { id: string; name: string; description?: string }) => `<details class="si-way" data-way="${esc(w.id)}" ${info?.method === w.id ? 'open' : ''}><summary><b>${esc(w.name)}</b>${info?.method === w.id ? '<em>in use</em>' : ''}</summary><div class="si-body"><p class="dim">${esc(w.description || '')}</p>${
        w.id === key
          ? `<div class="si-fields"><label><span>API key</span><input name="apiKey" type="password" placeholder="your Gemini API key" autocomplete="off" spellcheck="false"></label></div><div class="row"><button class="primary" data-si-save="${key}">Use this key</button></div>`
          : `<div class="row"><button class="primary" data-si-use="${esc(w.id)}">Use this</button>${w.id === 'oauth-personal' ? '<button class="outline" data-si-login="antigravity">Sign in in a terminal…</button>' : ''}</div>`
      }</div></details>`;
      put(
        'ch-signin',
        `${back}<b class="si-title">Connect ${name()}</b>
        <p>Signed in with ${esc(info?.email || info?.line ||'your Antigravity CLI sign-in')}.${info?.method ? ' <button class="outline" data-si-out>sign out</button>' : ''}</p>
        ${why ? `<p class="err">${esc(why)}</p>` : ''}
        <div class="si-list">${(info?.ways || []).map(way).join('')}</div>
        <p class="dim si-foot">Antigravity CLI keeps its own sign-in; Amethyst reads only the signed-in email from its log. A key you enter stays on this PC, in your workspace folder, and goes only to ${name()}.</p>`,
      );
      return;
    }
    const field = ([k, label, ph, secret]: [string, string, string, boolean?]) => `<label><span>${esc(label)}</span><input name="${k}" type="${secret ? 'password' : 'text'}" placeholder="${esc(ph || '')}" autocomplete="off" spellcheck="false"></label>`;
    const way = (m: string) => {
      const w = WAYS[m];
      const cc = info?.claudeCode;
      const body = m === 'claude'
        ? cc?.signedIn
          ? `<div class="row"><button class="primary" data-si-use="claude">Use Claude Code</button></div>`
          : cc?.installed
          ? `<p>Sign in opens a terminal that runs <code>claude auth login</code>. Finish there, then check again.</p><div class="row"><button class="primary" data-si-login="claude">Sign in in a terminal…</button><button class="outline" data-si-start>check again</button></div>`
          : `<p><a href="${CC_URL}" target="_blank" rel="noopener noreferrer">Install Claude Code ↗</a>, then run <code>claude auth login</code> in a terminal.</p><div class="row"><button class="outline" data-si-start>check again</button></div>`
        : w.login
        ? `<div class="row"><button class="primary" data-si-use="${m}">Use my ${w.title.toLowerCase()}</button><button class="outline" data-si-login="${m}">Sign in…</button></div>`
        : `<div class="si-fields">${w.fields!.map(field).join('')}</div><div class="row"><button class="primary" data-si-save="${m}">Use ${esc(w.title)}</button></div>`;
      return `<details class="si-way" data-way="${m}" ${info?.method === m || (m === 'claude' && !info?.method) ? 'open' : ''}><summary><b>${w.title}</b><span>${w.sub}</span>${info?.method === m ? '<em>in use</em>' : ''}</summary><div class="si-body"><p class="dim">${w.text}</p>${body}</div></details>`;
    };
    put(
      'ch-signin',
      `${back}<b class="si-title">Connect ${name()}</b>
      ${info?.line ? `<p>Signed in with ${esc(info.line)}. <button class="outline" data-si-out>sign out</button></p>` : `<p>Choose how ${name()} connects to Claude.</p>`}
      ${why ? `<p class="err">${esc(why)}</p>` : ''}
      <div class="si-list">${(info?.methods || Object.keys(WAYS).filter((m) => m !== 'claude')).map(way).join('')}</div>
      <p class="dim si-foot">Whatever you enter stays on this PC, in your workspace folder. Amethyst hands it only to ${name()} and never shows it again.</p>`,
    );
  }
  async function showSignIn(why = '') {
    let info: any = null;
    try {
      const all = await api('GET', '/api/agents');
      info = infoOf(all);
    } catch {}
    if (!why && tab().chat && !ended()) {
      el.querySelector('.si-win')?.remove();
      return signInScreen(info, '', true);
    }
    close();
    reset();
    signInScreen(info, why);
  }
  async function useWay(method: string | null, fields = {}) {
    const box = el.querySelector(`.si-way[data-way="${method}"] .si-body`);
    try {
      if (tab().type === 'cursor') await api('PUT', '/api/agent/auth', { agent: 'cursor', apiKey: method ? (fields as Record<string, string>).apiKey || '' : null });
      else if (tab().type === 'copilot') await api('PUT', '/api/agent/auth', { agent: 'copilot', token: method ? (fields as Record<string, string>).token || '' : null });
      else if (tab().type === 'grok') await api('PUT', '/api/agent/auth', { agent: 'grok', apiKey: method ? (fields as Record<string, string>).apiKey || '' : null });
      else await api('PUT', '/api/agent/auth', { method, ...fields, ...(tab().type === 'antigravity' ? { agent: 'antigravity' } : {}) });
      setSave(`${name()}: ${tab().type === 'cursor' || tab().type === 'grok' ? (method ? 'API key saved' : 'API key forgotten') : tab().type === 'copilot' ? (method ? 'token saved' : 'token forgotten') : method ? WAYS[method]?.title || 'sign-in chosen' : 'signed out'}`);
      if ((tab().type === 'antigravity' || tab().type === 'cursor' || tab().type === 'copilot' || tab().type === 'grok') && tab().chat && !ended()) el.querySelector('.si-win')?.remove();
      else await restart();
    } catch (e) {
      box?.querySelector('.err')?.remove();
      box?.insertAdjacentHTML('beforeend', `<p class="err">${esc((e as Error).message)}</p>`);
    }
  }
  async function login(method: string) {
    if (method === 'codex' || method === 'antigravity' || method === 'cursor' || method === 'copilot' || method === 'grok') {
      try {
        const r = await api('POST', '/api/agent/login', { agent: method });
        line('ch-signin', `<p>${esc(r.opened ? `${name()} sign-in opened. Finish signing in, then start the chat.` : 'Sign in in a terminal, then start the chat:')}</p><code>${esc(r.cmd || 'codex login')}</code><div class="row"><button class="primary" data-si-start>start</button></div>`);
      } catch (e) { line('ch-signin', `<p class="err">${esc((e as Error).message)}</p>`); }
      return;
    }
    const box = el.querySelector(`.si-way[data-way="${method}"] .si-body`);
    if (method === 'claude') {
      try {
        const r = await api('POST', '/api/agent/account', { id: account });
        notify(r.opened ? 'Finish the Claude sign-in in the window that opened, then check again.' : `Sign in in a terminal, then check again: <code>${esc(r.cmd)}</code>`, { ms: 12000 });
      } catch (e) {
        notify(`Couldn't open the Claude sign-in: ${esc((e as Error).message)}`, { ms: 12000 });
      }
      return;
    }
    try {
      await api('PUT', '/api/agent/auth', { method });
      const r = await api('POST', '/api/agent/login', { method });
      box!.querySelector('.si-wait')?.remove();
      box!.insertAdjacentHTML(
        'beforeend',
        `<div class="si-wait"><p>${r.opened ? 'A window opened: finish signing in there (your browser opens), then start.' : 'Run this in a terminal and finish signing in, then start:'}</p><code>${esc(r.cmd)}</code><div class="row"><button class="primary" data-si-start>start</button></div></div>`,
      );
    } catch (e) {
      box?.insertAdjacentHTML('beforeend', `<p class="err">${esc((e as Error).message)}</p>`);
    }
  }
  function click(d: DOMStringMap, b: HTMLElement) {
    if (d.siUse) return useWay(d.siUse), true;
    if (d.siLogin) return login(d.siLogin), true;
    if (d.siStart != null) return (tab().chat && !ended() ? showSignIn() : restart()), true;
    if (d.siOut != null) return useWay(null), true;
    if (d.siSave) {
      const fields = Object.fromEntries([...b.closest('.si-body')!.querySelectorAll('input')].map((i) => [i.name, i.value.trim()]));
      return useWay(d.siSave, fields), true;
    }
    return false;
  }
  function enter(e: KeyboardEvent) {
    const f = e.key === 'Enter' && (e.target as HTMLElement).closest('.si-way input');
    if (!f) return;
    e.preventDefault();
    f.closest('.si-body')!.querySelector<HTMLElement>('[data-si-save]')?.click();
  }
  return { infoOf, screen: signInScreen, show: showSignIn, click, enter };
}
