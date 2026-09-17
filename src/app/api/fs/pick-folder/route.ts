// src/app/api/fs/pick-folder/route.ts
// Native OS Folder Chooser Dialog
// Windows: PowerShell System.Windows.Forms.FolderBrowserDialog (+ Python Tkinter fallback)
// Linux: zenity / kdialog (+ Python Tkinter fallback)
// macOS: osascript (+ Python Tkinter fallback)

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

const execAsync = promisify(exec);

function getPythonExecutable(): string | null {
  const isWin = process.platform === "win32";
  const venvPython = isWin
    ? path.resolve(process.cwd(), "..", "agent_system", ".venv", "Scripts", "python.exe")
    : path.resolve(process.cwd(), "..", "agent_system", ".venv", "bin", "python");

  if (fs.existsSync(venvPython)) {
    return venvPython;
  }

  const directVenv = isWin
    ? path.resolve(process.cwd(), "agent_system", ".venv", "Scripts", "python.exe")
    : path.resolve(process.cwd(), "agent_system", ".venv", "bin", "python");

  if (fs.existsSync(directVenv)) {
    return directVenv;
  }

  return isWin ? "python.exe" : "python3";
}

async function pickFolderPython(defaultPath: string): Promise<string | null> {
  const pyExe = getPythonExecutable();
  if (!pyExe) return null;

  const normPath = defaultPath.replace(/\\/g, "/");
  const pyCode = `
import sys, os
try:
    import tkinter as tk
    from tkinter import filedialog
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    path = filedialog.askdirectory(title="Proje Klasörü Seç", initialdir=${JSON.stringify(normPath)})
    root.destroy()
    if path:
        print(path)
except Exception:
    pass
`;

  try {
    const { stdout } = await execAsync(`"${pyExe}" -c ${JSON.stringify(pyCode)}`, {
      timeout: 60000,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });
    const res = stdout.trim();
    return res || null;
  } catch {
    return null;
  }
}

async function pickFolderWindows(defaultPath: string): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> {
  const normPath = path.resolve(defaultPath).replace(/'/g, "''");

  const psScript = `
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
$form.Show()
$form.Activate()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Proje Klasörü Seç"
$dialog.ShowNewFolderButton = $true
if (Test-Path '${normPath}') {
    $dialog.SelectedPath = '${normPath}'
}

$res = $dialog.ShowDialog($form)
$form.Dispose()

if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $dialog.SelectedPath
}
`;

  const encoded = Buffer.from(psScript, "utf16le").toString("base64");
  const cmd = `powershell -NoProfile -STA -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;

  try {
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    const selected = stdout.trim();
    if (selected) {
      return { ok: true, path: selected };
    }
    return { ok: false, cancelled: true };
  } catch (err) {
    // PowerShell hata verdiyse Python Tkinter ile dene
    const pyPath = await pickFolderPython(defaultPath);
    if (pyPath) {
      return { ok: true, path: pyPath };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function pickFolderDarwin(defaultPath: string): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> {
  try {
    const cmd = `osascript -e 'POSIX path of (choose folder with prompt "Proje Klasörü Seç" default location POSIX file "${defaultPath}")'`;
    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    const selected = stdout.trim();
    if (selected) {
      return { ok: true, path: selected };
    }
    return { ok: false, cancelled: true };
  } catch (err: unknown) {
    const error = err as { code?: number; message?: string };
    if (error.code === 1 || (error.message && error.message.includes("User canceled"))) {
      return { ok: false, cancelled: true };
    }
    const pyPath = await pickFolderPython(defaultPath);
    if (pyPath) {
      return { ok: true, path: pyPath };
    }
    return { ok: false, error: "macOS klasör seçici açılamadı." };
  }
}

async function pickFolderLinux(defaultPath: string): Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }> {
  // 1. Zenity dene
  try {
    const cmd = `zenity --file-selection --directory --title="Proje Klasörü Seç" --filename="${defaultPath}/" 2>/dev/null`;
    const { stdout } = await execAsync(cmd, {
      timeout: 60000,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });
    const selected = stdout.trim();
    if (selected) {
      return { ok: true, path: selected };
    }
    return { ok: false, cancelled: true };
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 1) {
      return { ok: false, cancelled: true };
    }
  }

  // 2. Kdialog dene
  try {
    const kcmd = `kdialog --getexistingdirectory "${defaultPath}" 2>/dev/null`;
    const { stdout } = await execAsync(kcmd, {
      timeout: 60000,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });
    const selected = stdout.trim();
    if (selected) {
      return { ok: true, path: selected };
    }
    return { ok: false, cancelled: true };
  } catch (kerr: unknown) {
    const kerror = kerr as { code?: number };
    if (kerror.code === 1) {
      return { ok: false, cancelled: true };
    }
  }

  // 3. Python Tkinter dene
  const pyPath = await pickFolderPython(defaultPath);
  if (pyPath) {
    return { ok: true, path: pyPath };
  }

  return { ok: false, error: "Linux üzerinde zenity, kdialog veya tkinter bulunamadı." };
}

export async function POST() {
  const homeDir = os.homedir();
  const defaultPath = path.join(homeDir, "Desktop", "Projects");

  try {
    let result: { ok: boolean; path?: string; cancelled?: boolean; error?: string };

    if (process.platform === "win32") {
      result = await pickFolderWindows(defaultPath);
    } else if (process.platform === "darwin") {
      result = await pickFolderDarwin(defaultPath);
    } else {
      result = await pickFolderLinux(defaultPath);
    }

    if (result.ok && result.path) {
      return NextResponse.json({ ok: true, path: result.path });
    }

    if (result.cancelled) {
      return NextResponse.json({ cancelled: true });
    }

    return NextResponse.json(
      { ok: false, error: result.error || "Sistem klasör seçici penceresi açılamadı. Lütfen klasör tarayıcıyı kullanın." },
      { status: 500 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
