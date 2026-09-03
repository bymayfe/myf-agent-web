// src/app/api/plugins/route.ts
// Eklentileri listeleme, açıp kapatma (toggle) ve eklenti klasörünü açma API'si.

import { NextRequest, NextResponse } from "next/server";
import { pluginManager } from "@/lib/plugins/pluginManager";
import { exec } from "child_process";

export const runtime = "nodejs";

export async function GET() {
  try {
    const manifests = await pluginManager.listPluginManifests();
    const pluginsDir = await pluginManager.getCustomPluginsDir();
    return NextResponse.json({ ok: true, plugins: manifests, pluginsDir });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Eklentiler listelenemedi" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action: string = body.action || "toggle";

  if (action === "toggle") {
    const { id, enabled } = body;
    if (!id || typeof enabled !== "boolean") {
      return NextResponse.json({ ok: false, error: "Geçersiz parametreler (id ve enabled gerekli)" }, { status: 400 });
    }
    const success = await pluginManager.togglePlugin(id, enabled);
    if (!success) {
      return NextResponse.json({ ok: false, error: "Eklenti bulunamadı" }, { status: 404 });
    }
    const manifests = await pluginManager.listPluginManifests();
    return NextResponse.json({ ok: true, plugins: manifests });
  }

  // data/plugins klasörünü yerel dosya yöneticisinde (Nautilus, Dolphin vb.) aç
  if (action === "open-folder") {
    const pluginsDir = await pluginManager.getCustomPluginsDir();
    exec(`xdg-open "${pluginsDir}" 2>/dev/null &`);
    return NextResponse.json({ ok: true, pluginsDir });
  }

  return NextResponse.json({ ok: false, error: `Bilinmeyen eylem: ${action}` }, { status: 400 });
}
