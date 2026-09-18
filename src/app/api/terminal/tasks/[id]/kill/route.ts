// src/app/api/terminal/tasks/[id]/kill/route.ts
import { NextRequest, NextResponse } from "next/server";
import { terminalManager } from "@/lib/terminalManager";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const success = await terminalManager.killTask(id);
    const task = terminalManager.getTask(id);

    return NextResponse.json({
      success,
      task,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Süreç durdurulamadı", details: String(error) },
      { status: 500 }
    );
  }
}
