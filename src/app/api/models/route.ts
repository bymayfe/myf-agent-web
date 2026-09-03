// src/app/api/models/route.ts
// get_available_models(): Ollama ve llama.cpp için canlı tarama (GGUF dosyaları + API),
// diğer sağlayıcılar için providers_config.json'daki model_context_windows listesi.

import { NextRequest, NextResponse } from "next/server";
import { getProviders } from "@/lib/store";
import type { ModelOption } from "@/types";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_MODEL_DIRS = [
  path.join(process.cwd(), "..", "models"),
  path.join(process.cwd(), "..", "..", "llama_server", "models"),
  path.join(process.env.HOME ?? "", "Desktop", "Projects", "llama_server", "models"),
  path.join(process.env.HOME ?? "", "llama_server", "models"),
  path.join(process.env.HOME ?? "", "models"),
];

async function scanOllamaModels(apiBase: string): Promise<ModelOption[]> {
  const running = new Set<string>();
  try {
    const psRes = await fetch(`${apiBase}/api/ps`, { signal: AbortSignal.timeout(1200) });
    if (psRes.ok) {
      const psData: { models?: Array<{ name?: string }> } = await psRes.json();
      for (const m of psData.models ?? []) {
        running.add((m.name ?? "").split(":")[0]);
        running.add(m.name ?? "");
      }
    }
  } catch {
    /* Ollama çalışmıyor olabilir */
  }

  try {
    const tagsRes = await fetch(`${apiBase}/api/tags`, { signal: AbortSignal.timeout(1200) });
    if (!tagsRes.ok) return [];
    const tagsData: { models?: Array<{ name?: string; size?: number }> } = await tagsRes.json();
    return (tagsData.models ?? []).map((m): ModelOption => {
      const name: string = m.name ?? "";
      const sizeGb = Math.round(((m.size ?? 0) / 1024 ** 3) * 10) / 10;
      const inVram = running.has(name) || running.has(name.split(":")[0]);
      return {
        id: `ollama/${name}`,
        name,
        label: `${name} (${sizeGb} GB)${inVram ? " ⚡ VRAM'de Aktif" : ""}`,
        in_vram: inVram,
        size_gb: sizeGb,
      };
    });
  } catch {
    return [];
  }
}

async function scanLlamaCppModels(apiBase: string): Promise<ModelOption[]> {
  const models: ModelOption[] = [];
  const scannedModelNames = new Set<string>();

  // 1. Canlı çalışan llama-server'dan model sorgula
  try {
    const res = await fetch(`${apiBase}/models`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      const data: { data?: Array<{ id?: string }> } = await res.json();
      for (const m of data.data ?? []) {
        if (m.id) {
          const cleanName = path.basename(m.id).replace(/\.gguf$/i, "");
          scannedModelNames.add(cleanName.toLowerCase());
          models.push({
            id: `openai/${cleanName}`,
            name: cleanName,
            label: `${cleanName} ⚡ GPU'da Aktif`,
            in_vram: true,
          });
        }
      }
    }
  } catch {
    // llama-server kapalı olabilir
  }

  // 2. models/ ve llama_server/models/ klasörlerini tara (.gguf dosyaları)
  async function scanDir(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith(".gguf")) {
          // Parçalı dosya kontrolü (-00002-of-00004.gguf gibi devam parçalarını ana dosyaya dahil et)
          if (/-\d{5}-of-\d{5}\.gguf$/i.test(entry.name) && !/-00001-of-/i.test(entry.name)) {
            continue;
          }
          let baseName = entry.name.replace(/\.gguf$/i, "");
          let isSplit = false;
          let totalBytes = 0;

          if (/-00001-of-(\d{5})/i.test(baseName)) {
            const prefix = baseName.replace(/-00001-of-\d{5}/i, "");
            baseName = prefix;
            isSplit = true;
            for (const other of entries) {
              if (other.name.startsWith(prefix) && other.name.endsWith(".gguf")) {
                try {
                  const s = await fs.stat(path.join(dir, other.name));
                  totalBytes += s.size;
                } catch {}
              }
            }
          } else {
            const stat = await fs.stat(fullPath);
            totalBytes = stat.size;
          }

          const sizeGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10;
          const lowerName = baseName.toLowerCase();
          if (!scannedModelNames.has(lowerName)) {
            scannedModelNames.add(lowerName);
            models.push({
              id: `openai/${baseName}`,
              name: baseName,
              label: `${baseName} (${sizeGb} GB${isSplit ? " - Çoklu Parça" : " - GGUF"})`,
              size_gb: sizeGb,
            });
          }
        }
      }
    } catch {}
  }

  for (const d of CANDIDATE_MODEL_DIRS) {
    await scanDir(d);
  }

  if (models.length === 0) {
    models.push({
      id: "openai/qwen2.5-coder-7b",
      name: "qwen2.5-coder-7b",
      label: "Qwen 2.5 Coder 7B (HuggingFace Auto-load)",
    });
  }

  return models;
}


export async function GET(req: NextRequest) {
  const providerName = req.nextUrl.searchParams.get("provider") ?? "ollama";
  const providersFile = await getProviders();
  const provider = providersFile.providers[providerName];
  if (!provider) return NextResponse.json({ models: [] });

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  };

  if (providerName === "ollama") {
    const models = await scanOllamaModels(provider.api_base);
    if (models.length > 0) return NextResponse.json({ models }, { headers: noCacheHeaders });
    return NextResponse.json({
      models: [
        { id: "ollama/qwen3.8:latest", name: "qwen3.8:latest", label: "qwen3.8:latest (Lokal)" },
        { id: "ollama/qwen3.5:4b", name: "qwen3.5:4b", label: "qwen3.5:4b (Lokal)" },
      ],
    }, { headers: noCacheHeaders });
  }

  if (providerName === "llama_cpp") {
    const models = await scanLlamaCppModels(provider.api_base);
    return NextResponse.json({ models }, { headers: noCacheHeaders });
  }

  const models: ModelOption[] = Object.keys(provider.model_context_windows).map((name) => ({
    id: `${provider.model_prefix}/${name}`,
    name,
    label: name,
  }));
  return NextResponse.json({ models }, { headers: noCacheHeaders });
}
