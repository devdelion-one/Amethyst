import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { guard, HttpError } from '../base/routes.ts';
import * as editor from './editor.ts';
import * as link from './link.ts';

const WIN = process.platform === 'win32';
const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const clamp = (n: number, lo: number, hi: number, fallback: number) => {
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};

export function resolveOutPath(root: string, projDir: string, out: unknown, mode: 'viewport' | 'window') {
  if (out != null && String(out).trim() !== '') {
    const rel = guard(String(out).trim());
    if (!rel) throw new HttpError(400, 'output path required');
    if (!/\.png$/i.test(rel)) throw new HttpError(400, 'screenshot path must end in .png');
    return path.join(root, rel);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(projDir, 'Saved', 'Screenshots', 'Amethyst', `${stamp}-${mode}.png`);
}

async function waitForFile(file: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastSize = -1;
  let lastMtime = -1;
  while (Date.now() < deadline) {
    try {
      const st = await fs.promises.stat(file);
      if (st.size > 0) {
        if (st.size === lastSize && st.mtimeMs === lastMtime) return true;
        lastSize = st.size;
        lastMtime = st.mtimeMs;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, Math.min(80, Math.max(10, deadline - Date.now()))));
  }
  return false;
}

export async function captureViewport(
  projDir: string,
  outFile: string,
  opts: { width?: number; height?: number; gameView?: boolean; timeoutMs?: number } = {},
) {
  const width = clamp(Number(opts.width), 64, 7680, 1280);
  const height = clamp(Number(opts.height), 64, 4320, 720);
  const gameView = !!opts.gameView;
  const timeoutMs = clamp(Number(opts.timeoutMs), 1000, 120000, 15000);
  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  await fs.promises.rm(outFile, { force: true }).catch(() => {});
  const script = [
    'import unreal',
    `unreal.AutomationLibrary.take_high_res_screenshot(${width}, ${height}, ${JSON.stringify(outFile)}, b_force_game_view=${gameView ? 'True' : 'False'})`,
  ].join('\n');
  const r = await link.execPython(projDir, script, { mode: 'ExecuteFile', ms: timeoutMs });
  if (!r.success) {
    const detail = r.output.map((o) => o.output).filter(Boolean).join('\n') || r.result || 'screenshot command failed';
    throw new HttpError(500, `could not capture viewport screenshot: ${detail}`);
  }
  const ok = await waitForFile(outFile, timeoutMs);
  if (!ok) {
    throw new HttpError(504, `viewport screenshot was not written within ${Math.round(timeoutMs / 1000)} s (is a level viewport open and active?)`);
  }
  return { path: outFile, width, height, mode: 'viewport' as const };
}

const PRINT_WINDOW_PS = `
$ErrorActionPreference = 'Stop'
$targetPid = [int]$env:AMETHYST_SHOT_PID
$outFile = $env:AMETHYST_SHOT_OUT
$p = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (-not $p -or $p.ProcessName -notlike 'UnrealEditor*') {
  Write-Output 'ERR:not-editor'
  exit 0
}
$hwnd = $p.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Output 'ERR:nowindow'
  exit 0
}
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class AmethystWinShot {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdcBlt, uint nFlags);
}
"@
[uint32]$ownerPid = 0
[void][AmethystWinShot]::GetWindowThreadProcessId($hwnd, [ref]$ownerPid)
if ($ownerPid -ne [uint32]$targetPid) {
  Write-Output 'ERR:pid-mismatch'
  exit 0
}
if ([AmethystWinShot]::IsIconic($hwnd)) {
  Write-Output 'ERR:minimized'
  exit 0
}
$rect = New-Object AmethystWinShot+RECT
if (-not [AmethystWinShot]::GetWindowRect($hwnd, [ref]$rect)) {
  Write-Output 'ERR:rect'
  exit 0
}
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -le 0 -or $h -le 0) {
  Write-Output 'ERR:empty'
  exit 0
}
$bmp = New-Object System.Drawing.Bitmap($w, $h)
try {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $hdc = $g.GetHdc()
    try {
      $ok = [AmethystWinShot]::PrintWindow($hwnd, $hdc, 2)
      if (-not $ok) {
        Write-Output 'ERR:printwindow'
        exit 0
      }
    } finally {
      $g.ReleaseHdc($hdc)
    }
  } finally {
    $g.Dispose()
  }
  $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output "OK:$($w)x$($h)"
} finally {
  $bmp.Dispose()
}
`;

export async function captureWindow(uprojectPath: string, outFile: string) {
  const proc = await editor.editorProc(uprojectPath);
  if (!proc.open || proc.pid <= 0) {
    throw new HttpError(409, 'Unreal Editor is not open on this project');
  }
  await fs.promises.mkdir(path.dirname(outFile), { recursive: true });
  const fake = process.env.MIND_FAKE_UE_SCREENSHOT;
  if (fake) {
    if (fake === 'minimized') throw new HttpError(409, 'Unreal Editor window is minimized; restore it before taking a window screenshot');
    if (fake === 'nowindow') throw new HttpError(409, 'Unreal Editor has no visible main window yet');
    await fs.promises.writeFile(outFile, FAKE_PNG);
    return { path: outFile, width: 1, height: 1, mode: 'window' as const };
  }
  if (!WIN) throw new HttpError(400, 'window screenshots work on Windows only for now');
  const out = await new Promise<string>((res, rej) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PRINT_WINDOW_PS],
      {
        windowsHide: true,
        timeout: 20e3,
        env: { ...process.env, AMETHYST_SHOT_PID: String(Math.trunc(proc.pid)), AMETHYST_SHOT_OUT: outFile },
      },
      (err, stdout, stderr) => {
        if (err) return rej(new HttpError(500, `window screenshot failed: ${String(stderr || err.message).trim()}`));
        res(String(stdout || '').trim());
      },
    );
  });
  const line = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).pop() || '';
  if (line === 'ERR:minimized') throw new HttpError(409, 'Unreal Editor window is minimized; restore it before taking a window screenshot');
  if (line === 'ERR:nowindow') throw new HttpError(409, 'Unreal Editor has no visible main window yet');
  if (line === 'ERR:not-editor' || line === 'ERR:pid-mismatch') throw new HttpError(409, 'could not verify the Unreal Editor window for this project');
  const m = /^OK:(\d+)x(\d+)$/.exec(line);
  if (!m) throw new HttpError(500, `window screenshot failed (${line || 'no output'})`);
  return { path: outFile, width: Number(m[1]), height: Number(m[2]), mode: 'window' as const };
}
