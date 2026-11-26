import { esc } from './util.ts';

const svg = (d: string) => `<svg class="ic" viewBox="0 0 16 16" aria-hidden="true">${d}</svg>`;

export const TOOL_WORD: Record<string, string> = { claude: 'Claude', codex: 'Codex', antigravity: 'Antigravity', cursor: 'Cursor', copilot: 'Copilot', grok: 'Grok' };

export const TOOL_IC: Record<string, string> = {
  claude: svg('<path d="M8 1.8v12.4M1.8 8h12.4M3.6 3.6l8.8 8.8M12.4 3.6l-8.8 8.8"/>'),
  codex: svg('<g transform="rotate(0 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g><g transform="rotate(60 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g><g transform="rotate(120 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g><g transform="rotate(180 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g><g transform="rotate(240 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g><g transform="rotate(300 8 8)"><path d="M8 2.4a2.9 2.9 0 0 1 2.9 2.9v4.4"/></g>'),
  antigravity: svg('<path d="M2.6 14C2.6 7.2 5.2 2.4 8 2.4s5.4 4.8 5.4 11.6"/><path d="M5.6 14c0-3.4 1-6 2.4-6s2.4 2.6 2.4 6"/>'),
  cursor: svg('<path d="M8 1.8 13.6 5v6.2L8 14.2l-5.6-3V5zM2.4 5 8 8.2 13.6 5M8 8.2v6"/>'),
  copilot: svg('<circle cx="5.3" cy="7.2" r="2.4"/><circle cx="10.7" cy="7.2" r="2.4"/><path d="M2 8.4v3.2c1.4 1.6 3.6 2.4 6 2.4s4.6-.8 6-2.4V8.4M7.7 7.2h.6"/>'),
  grok: svg('<circle cx="8" cy="8" r="5.2"/><path d="M4.2 12.2L12.6 2.8"/>'),
};

const toolTip = (program: string, model?: string) => {
  const word = TOOL_WORD[program] || TOOL_WORD.claude;
  if (!model) return word;
  const [name, effort] = model.split(' · ');
  return `${word}\n${effort ? `${name}, ${effort} effort` : name}`;
};

export const toolSign = (a: { kind: string; program?: string; model?: string }): string => {
  if (a.kind !== 'chat') return '<i class="oc-tool"></i>';
  const p = a.program && TOOL_IC[a.program] ? a.program : 'claude';
  return `<i class="oc-tool" data-tool="${p}" title="${esc(toolTip(p, a.model))}">${TOOL_IC[p]}</i>`;
};
