// src/app/api/map/route.ts
// Codebase map API — proje dizinini tarar ve kompakt harita döndürür.

import { NextRequest } from "next/server";
import { buildCodebaseMap, formatMapForLLM, searchMap } from "@/lib/codebaseMap";
import path from "path";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const dir = req.nextUrl.searchParams.get("dir") ?? path.join(process.cwd(), "..");
  const query = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const map = await buildCodebaseMap(dir);

    if (query) {
      const results = searchMap(map, query);
      return Response.json({ query, results, total: map.fileCount });
    }

    return Response.json({
      projectDir: map.projectDir,
      fileCount: map.fileCount,
      totalLines: map.totalLines,
      indexedAt: map.indexedAt,
      summary: formatMapForLLM(map, 100),
      files: map.files,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Map oluşturulamadı" },
      { status: 500 }
    );
  }
}
