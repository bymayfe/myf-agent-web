// src/app/api/terminal/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { terminalManager } from "@/lib/terminalManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await terminalManager.getTasks();
    return NextResponse.json({ tasks });
  } catch (error) {
    return NextResponse.json(
      { error: "Terminal görevleri alınamadı", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, command, cwd } = body;

    if (action === "clear_finished") {
      terminalManager.clearFinished();
      const tasks = await terminalManager.getTasks();
      return NextResponse.json({ success: true, tasks });
    }

    if (command) {
      // Arka planda komut başlat
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      terminalManager.runCommand({
        id,
        cmd: String(command),
        cwd: cwd || process.cwd(),
      });
      return NextResponse.json({ success: true, taskId: id });
    }

    return NextResponse.json({ error: "Geçersiz istek parametreleri" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: "İşlem başarısız", details: String(error) },
      { status: 500 }
    );
  }
}
