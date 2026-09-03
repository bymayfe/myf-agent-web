// src/app/api/terminal/tasks/[id]/route.ts
// Tek bir terminal görevinin canlı çıktısını/durumunu döner (polling ile
// TerminalPanel'i chat SSE bağlantısından bağımsız olarak besler).

import { NextRequest, NextResponse } from "next/server";
import { getTask } from "@/lib/plugins/builtins/terminalRegistry";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Görev bulunamadı." }, { status: 404 });
  }
  return NextResponse.json({ task });
}
