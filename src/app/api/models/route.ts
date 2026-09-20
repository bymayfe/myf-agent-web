// src/app/api/models/route.ts
// Sağlayıcıya göre kullanılabilir modelleri listeleyen endpoint.
// Ollama seçildiğinde yerel makinedeki (Ollama) kurulu modelleri (/api/tags ve /api/ps)
// dinamik olarak sorgular. Diğer sağlayıcılar için providers_config'deki listeyi döner.

import { NextRequest, NextResponse } from "next/server";
import { getProviders } from "@/lib/store";
import type { ModelOption } from "@/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const providerParam = searchParams.get("provider");

  const providersData = await getProviders();
  const activeProvider = providerParam || providersData.active_provider || "ollama";

  if (activeProvider === "ollama") {
    const installed: ModelOption[] = [];
    const running = new Set<string>();

    // 1. VRAM'de aktif çalışan modelleri kontrol et (/api/ps)
    try {
      const psRes = await fetch("http://localhost:11434/api/ps", {
        signal: AbortSignal.timeout(1200),
      });
      if (psRes.ok) {
        const psData = await psRes.json();
        for (const m of psData.models ?? []) {
          const name = m.name ?? "";
          running.add(name);
          running.add(name.split(":")[0]);
        }
      }
    } catch {
      // Ollama ps sorgusu başarısız olursa sessizce devam et
    }

    // 2. İndirilmiş/kurulu yerel modelleri getir (/api/tags)
    try {
      const tagsRes = await fetch("http://localhost:11434/api/tags", {
        signal: AbortSignal.timeout(1500),
      });
      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        for (const m of tagsData.models ?? []) {
          const name: string = m.name ?? "";
          const sizeBytes: number = m.size ?? 0;
          const sizeGb = Math.round((sizeBytes / 1024 ** 3) * 10) / 10;
          const inVram = running.has(name) || running.has(name.split(":")[0]);

          let label = `${name} (${sizeGb} GB)`;
          if (inVram) {
            label += " ⚡ [VRAM'de Aktif]";
          }

          installed.push({
            id: name.startsWith("ollama/") ? name : `ollama/${name}`,
            name,
            label,
            in_vram: inVram,
            size_gb: sizeGb,
          });
        }
      }
    } catch {
      // Ollama servisi kapalıysa statik listeye dön
    }

    if (installed.length > 0) {
      return NextResponse.json({ ok: true, provider: "ollama", models: installed });
    }

    // Fallback Ollama modelleri
    const fallbackOllama: ModelOption[] = [
      { id: "ollama/ornith-1.5:9b", name: "ornith-1.5:9b", label: "ornith-1.5:9b (6.6 GB) - Hızlı", size_gb: 6.6 },
      { id: "ollama/qwen3.8:27b", name: "qwen3.8:27b", label: "qwen3.8:27b (17.7 GB) - Güçlü", size_gb: 17.7 },
      { id: "ollama/qwen3.8:latest", name: "qwen3.8:latest", label: "qwen3.8:latest (Lokal)", size_gb: 17.7 },
    ];
    return NextResponse.json({ ok: true, provider: "ollama", models: fallbackOllama });
  }

  // Diğer sağlayıcılar için yapılandırmadan modelleri çek
  const provConfig = providersData.providers[activeProvider];
  if (!provConfig) {
    return NextResponse.json({ ok: true, provider: activeProvider, models: [] });
  }

  const prefix = provConfig.model_prefix ? `${provConfig.model_prefix}/` : "";
  const availableModels = provConfig.available_models;

  let models: ModelOption[];

  if (availableModels && Object.keys(availableModels).length > 0) {
    // available_models varsa: ad + boyut + açıklama ile zengin liste
    models = Object.entries(availableModels).map(([mKey, mInfo]) => {
      const fullId = mKey.startsWith(prefix) ? mKey : `${prefix}${mKey}`;
      const labelParts = [mKey];
      if (mInfo.size) labelParts.push(`(${mInfo.size})`);
      if (mInfo.description) labelParts.push(`— ${mInfo.description}`);
      return {
        id: fullId,
        name: mKey,
        label: labelParts.join(" "),
        context_window: mInfo.context_window,
      };
    });
  } else {
    // Fallback: model_context_windows (meta "default" key'ini atla)
    const SKIP_KEYS = new Set(["default"]);
    models = Object.keys(provConfig.model_context_windows || {})
      .filter((k) => !SKIP_KEYS.has(k))
      .map((mKey) => {
        const fullId = mKey.startsWith(prefix) ? mKey : `${prefix}${mKey}`;
        return {
          id: fullId,
          name: mKey,
          label: `${mKey} (${activeProvider})`,
        };
      });
  }

  return NextResponse.json({ ok: true, provider: activeProvider, models });
}
