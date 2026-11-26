import fs from 'fs';
import path from 'path';

try {
  for (const line of fs.readFileSync(path.join(import.meta.dirname, '..', '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] !== 'GH_TOKEN' && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
} catch {}

export const given = process.env.MIND_USER_SECRET || '';
delete process.env.MIND_USER_SECRET;
