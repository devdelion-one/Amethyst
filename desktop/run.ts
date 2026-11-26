import { spawn } from 'child_process';
import electron from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const args = process.argv.slice(2);
const child = spawn(electron as unknown as string, args.length && args[0].endsWith('.ts') ? args : ['.', ...args], { cwd: import.meta.dirname, env, stdio: 'inherit', windowsHide: false });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => child.kill(sig));
