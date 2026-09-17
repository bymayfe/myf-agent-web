// src/app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loadSession, deleteSession } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
  return NextResponse.json({ session });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
