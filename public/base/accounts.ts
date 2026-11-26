import { api } from './model.ts';
import { notify } from './notify.ts';
import { esc } from './util.ts';

type AcctSetup = { id: string; dir?: string; share?: 'main' | 'all' | 'own'; running?: number; repair?: { fixed: string[]; kept: string[]; waits: string[] } | null; [k: string]: any };

const SHARE_TIP = {
  main: "Setup: the main one\nClaude Code's own folder: the setup every added account can share.",
  all: "Shared\nUses the main account's CLAUDE.md, settings, rules, skills, plugins and memory. A change on either account shows on both.",
  own: 'Own\nKeeps its own CLAUDE.md, settings, rules, skills, plugins and memory, copied from the main one.\n\nBack to shared merges them into the main one again.',
};
const SETUP_TIP = "Setup\nWhere this account's CLAUDE.md, settings, rules, skills, plugins and memory come from.\n\nShared works the same as the main account; own keeps copies of its own.";
const SHARE_WORD = { all: 'shared', own: 'own' };

export function shareChips(a: AcctSetup) {
  const label = `<span class="acc-lbl" title="${esc(a.share === 'main' || !a.share ? SHARE_TIP.main : SETUP_TIP)}">setup</span>`;
  if (a.share === 'main' || !a.share) return `<span class="acc-set">${label}<span class="acc-main" title="${esc(SHARE_TIP.main)}">the main one</span></span>`;
  const opts = (['all', 'own'] as const).map((k) => `<button class="${a.share === k ? 'on' : ''}" role="radio" aria-checked="${a.share === k}" data-acc-share="${esc(a.id)}" data-acc-to="${k}" title="${esc(SHARE_TIP[k])}">${SHARE_WORD[k]}</button>`).join('');
  return `<span class="acc-set">${label}<span class="acc-seg" role="radiogroup" aria-label="setup">${opts}</span></span>`;
}

export function repairLine(a: AcctSetup) {
  const r = a.repair;
  if (!r) return '';
  if (r.waits.length) return `merge waits for its chats to stop (${r.waits.join(', ')})`;
  if (r.kept.length) return `kept its differing copies: ${r.kept.map((k) => k.split(/[\\/]/).pop()).join(', ')}`;
  return '';
}

export async function setShare(id: string, share: string) {
  const r = await api('PUT', '/api/agent/account', { id, share });
  const d = r.done || { fixed: [], kept: [], waits: [] };
  const parts = [
    share === 'own' ? 'Its own setup now, copied from the main one.' : 'Shared with main now.',
    r.busy ? `${r.busy === 1 ? '1 chat' : r.busy + ' chats'} answering switch after their turn.` : '',
    r.terms ? `${r.terms === 1 ? '1 claude terminal keeps' : r.terms + ' claude terminals keep'} the old setup until restarted.` : '',
    d.kept.length ? `Its differing files are kept next to the main ones: ${d.kept.map((k: string) => k.split(/[\\/]/).pop()).join(', ')}.` : '',
    d.waits.length ? `The merge of ${d.waits.join(', ')} finishes when its chats stop; nothing is lost.` : '',
  ].filter(Boolean);
  notify(esc(parts.join(' ')), { ms: d.kept.length || d.waits.length ? 12000 : 5000 });
  return r;
}
