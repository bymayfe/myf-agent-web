// src/app/api/search/route.ts
// Web arama API endpoint — doğrudan UI'dan da çağrılabilir.

import { NextRequest } from "next/server";
import { webSearch } from "@/lib/webSearch";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return Response.json({ error: "q parametresi gerekli" }, { status: 400 });
  }

  const results = await webSearch(q.trim(), { maxResults: 8 });
  return Response.json(results);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query: string = (body.query ?? "").trim();
  if (!query) {
    return Response.json({ error: "query gerekli" }, { status: 400 });
  }

  const results = await webSearch(query, { maxResults: body.maxResults ?? 5 });
  return Response.json(results);
}
