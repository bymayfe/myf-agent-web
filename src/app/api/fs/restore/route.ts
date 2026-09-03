// src/app/api/fs/restore/route.ts
// Dosya değişikliklerini geri alma (Discard / Restore) API Endpoint'i.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { loadSession } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath, oldContent, isNew, sessionId } = body;

    if (!filePath) {
      return NextResponse.json({ error: "Dosya yolu belirtilmeli." }, { status: 400 });
    }

    const session = sessionId ? await loadSession(sessionId) : null;
    const projectDir = session?.project_dir || path.join(process.cwd(), "..");
    const targetPath = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath);

    if (isNew) {
      // Yeni oluşturulan dosya ise sil
      await fs.unlink(targetPath).catch(() => {});
      return NextResponse.json({
        success: true,
        message: `${filePath} silindi (oluşturma geri alındı).`,
      });
    } else {
      // Eski içeriğe geri dön
      await fs.writeFile(targetPath, oldContent ?? "", "utf-8");
      return NextResponse.json({
        success: true,
        message: `${filePath} eski haline geri yüklendi.`,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geri alma başarısız." },
      { status: 500 }
    );
  }
}
