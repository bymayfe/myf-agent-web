// src/app/api/terminal/tasks/route.ts
// Terminal panelinin sayfa yenilemeden BAĞIMSIZ olarak çalışan/geçmiş görevleri
// çekebilmesi için. Chat SSE bağlantısı kapansa bile buradan görev listesi
// ve çıktıları okunabilir.

import { NextRequest, NextResponse } from "next/server";
import { listTasks } from "@/lib/plugins/builtins/terminalRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId") || undefined;
  const tasks = listTasks(sessionId);
  return NextResponse.json(
    { tasks },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}
