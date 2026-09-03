// src/app/api/sessions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { loadSession, deleteSession, saveSessionHistory } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await loadSession(id);
  if (!session) return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
  return NextResponse.json(
    { session },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

// "Geri Al" (undo) gibi istemci taraflı düzenlemelerin oturum dosyasına
// kalıcı olarak yazılabilmesi için. Bu olmadan undo yalnızca UI'da mesajları
// gizliyordu; sayfa yenilendiğinde veya oturum tekrar yüklendiğinde "geri
// alınan" mesajlar geri geliyordu çünkü disk hiç güncellenmiyordu.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const history = body.conversation_history;
  if (!Array.isArray(history)) {
    return NextResponse.json({ error: "conversation_history bir dizi olmalı" }, { status: 400 });
  }
  await saveSessionHistory(id, history);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSession(id);
  return NextResponse.json({ ok: true });
}
