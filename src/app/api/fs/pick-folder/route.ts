// src/app/api/fs/pick-folder/route.ts
// Native OS Folder Chooser Dialog (zenity / kdialog)
// Yerel Linux masaüstünde gerçek sistem klasör seçici penceresini açar ve seçilen path'i döner.

import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";

export const runtime = "nodejs";

const execAsync = promisify(exec);

export async function POST() {
  const homeDir = os.homedir();
  const defaultPath = `${homeDir}/Desktop/Projects`;

  try {
    // 1. Önce zenity dene
    const cmd = `zenity --file-selection --directory --title="Proje Klasörü Seç" --filename="${defaultPath}/" 2>/dev/null`;
    const { stdout } = await execAsync(cmd, {
      timeout: 60000,
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
    });
    const selectedPath = stdout.trim();
    if (selectedPath) {
      return NextResponse.json({ ok: true, path: selectedPath });
    }
    return NextResponse.json({ cancelled: true });
  } catch (err: unknown) {
    const error = err as { code?: number; stdout?: string };
    // Zenity iptal edildiğinde (code 1)
    if (error.code === 1) {
      return NextResponse.json({ cancelled: true });
    }

    // 2. Zenity yoksa veya hata verdiyse kdialog dene
    try {
      const kcmd = `kdialog --getexistingdirectory "${defaultPath}" 2>/dev/null`;
      const { stdout } = await execAsync(kcmd, {
        timeout: 60000,
        env: { ...process.env, DISPLAY: process.env.DISPLAY || ":0" },
      });
      const selectedPath = stdout.trim();
      if (selectedPath) {
        return NextResponse.json({ ok: true, path: selectedPath });
      }
      return NextResponse.json({ cancelled: true });
    } catch (kerr: unknown) {
      const kerror = kerr as { code?: number };
      if (kerror.code === 1) {
        return NextResponse.json({ cancelled: true });
      }
    }

    return NextResponse.json(
      { ok: false, error: "Native dialog açılamadı, lütfen klasör tarayıcıyı kullanın." },
      { status: 500 }
    );
  }
}
