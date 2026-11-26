import os from 'os';
import path from 'path';

export const configDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
export const claudeDirs = () => [...new Set([configDir(), path.join(os.homedir(), '.claude')].map((d) => path.resolve(d)))];
export const codexDir = () => process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
