// src/app/api/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listSessions, createSession } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = await listSessions();
  return NextResponse.json(
    { sessions },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title: string = body.title || "Yeni Oturum";
  const slug: string = body.slug || "yeni_proje";
  const projectDir: string = body.project_dir || "";
  const session = await createSession(title, slug, projectDir || undefined);
  return NextResponse.json({ ok: true, session }, { status: 201 });
}
