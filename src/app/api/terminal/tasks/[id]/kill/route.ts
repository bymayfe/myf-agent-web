// src/app/api/terminal/tasks/[id]/kill/route.ts
// Çalışan bir terminal görevini (örn. takılı kalmış "npm run dev") sonlandırır.

import { NextRequest, NextResponse } from "next/server";
import { killTask } from "@/lib/plugins/builtins/terminalRegistry";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = killTask(id);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
