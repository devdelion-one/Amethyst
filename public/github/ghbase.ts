import { api } from '../base/model.ts';
import { page } from '../base/page.ts';
import { esc } from '../base/util.ts';
import { webLink } from '../base/markdown.ts';

export function ghapi(method: string, url: string, body?: object): Promise<any> {
  const repo = page.gitRepo();
  if (method === 'GET') return api(method, repo ? url + (url.includes('?') ? '&' : '?') + 'repo=' + encodeURIComponent(repo) : url);
  return api(method, url, repo ? { ...body, repo } : body || {});
}

export function ago(at: number) {
  const m = Math.floor((Date.now() - at) / 60e3);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

const CHECK: Record<string, [string, string]> = { pass: ['✓', 'Checks: pass\nEvery check on this pull request passes.'], fail: ['✗', 'Checks: failing\nAt least one check on this pull request fails.'], running: ['●', 'Checks: running\nThe checks on this pull request are still running.'] };
const REVIEW: Record<string, [string, string]> = { approved: ['✓', 'Review: approved\nA reviewer approved this pull request.'], changes: ['✗', 'Review: changes asked\nA reviewer asked for changes.'], waiting: ['○', 'Review: waiting\nIt waits for a review.'] };
export const checkMark = (s: string) => (CHECK[s] ? `<span class="gh-ck ${s}" title="${esc(CHECK[s][1])}">${CHECK[s][0]}</span>` : '<span class="gh-ck"></span>');
export const reviewMark = (s: string) => (REVIEW[s] ? `<span class="gh-rv ${s}" title="${esc(REVIEW[s][1])}">${REVIEW[s][0]}</span>` : '<span class="gh-rv"></span>');
export const link = (url: string, label: string) => webLink(url, label);
