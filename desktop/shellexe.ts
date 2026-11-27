import fs from 'fs';

export const SHELL_EXES: Record<string, string[]> = { PowerShell: ['pwsh.exe', 'powershell.exe'], 'Command Prompt': ['cmd.exe'] };

export type Find = (exe: string) => Promise<string | null>;

const realSize = (file: string) => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

export async function shellFile(name: string, where: Find, self: Find, size = realSize) {
  for (const exe of SHELL_EXES[name] || []) {
    const file = await where(exe);
    if (!file) continue;
    if (size(file) > 0) return file;
    const real = await self(exe).catch(() => null);
    if (real && size(real) > 0) return real;
  }
  return null;
}
