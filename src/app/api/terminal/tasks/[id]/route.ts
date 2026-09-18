// src/app/api/terminal/tasks/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { terminalManager } from "@/lib/terminalManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const task = terminalManager.getTask(id);
    if (!task) {
      return NextResponse.json({ error: "Görev bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json(
      { error: "Görev alınamadı", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const success = await terminalManager.removeTask(id);
    return NextResponse.json({ success });
  } catch (error) {
    return NextResponse.json(
      { error: "Görev silinemedi", details: String(error) },
      { status: 500 }
    );
  }
}
