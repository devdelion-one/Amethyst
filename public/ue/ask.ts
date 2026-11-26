import { askQueue } from '../app/runask.ts';
import { api } from '../base/model.ts';

type Ask = { id: number; project: string; engine: string; name: string; label: string };

askQueue<Ask>(
  { ueask: true },
  (a) => ({
    title: `Allow an agent to build ${a.name}?`,
    text: `It wants to use ${a.label} in ${a.engine}.`,
    warn: `Building, opening or debugging ${a.name} runs the project's own code: its build rules, its plugins and its header tool DLLs.`,
  }),
  (a, yes) => api('POST', '/api/ue/ask', { id: a.id, yes }),
);
