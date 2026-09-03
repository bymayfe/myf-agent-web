// src/app/api/pipeline/route.ts
// Canlı Sıralı Pipeline API Endpoint'i (SSE streaming).

import { NextRequest } from "next/server";
import { getSettings, getProviders, getProviderApiKey, loadSession } from "@/lib/store";
import { executePipeline, PipelineStepEvent } from "@/lib/pipeline/pipelineRunner";
import path from "path";

export const runtime = "nodejs";

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const requirement: string = (body.requirement ?? "").trim();
  const sessionId: string | undefined = body.sessionId;

  if (!requirement) {
    return new Response(JSON.stringify({ error: "Gereksinim belirtilmedi." }), { status: 400 });
  }

  const settings = await getSettings();
  const providers = await getProviders();
  const provider = providers.providers[settings.active_provider];

  if (!provider) {
    return new Response(JSON.stringify({ error: "Aktif sağlayıcı bulunamadı." }), { status: 500 });
  }

  const session = sessionId ? await loadSession(sessionId) : null;
  const projectDir = session?.project_dir || path.join(process.cwd(), "data", "projects", `project_${Date.now()}`);

  const apiKey = getProviderApiKey(provider.api_key_env);

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(new TextEncoder().encode(s));

      try {
        enqueue(sseLine("status", "🚀 Sıralı Pipeline Motoru başlatıldı..."));

        await executePipeline({
          projectRequirement: requirement,
          projectDir,
          settings,
          providers,
          apiKey,
          sessionId,
          onEvent: (evt: PipelineStepEvent) => {
            enqueue(sseLine("pipeline_event", evt));
            if (evt.status === "file_written" || evt.status === "progress" || evt.status === "done") {
              enqueue(sseLine("status", `${evt.stageIcon} [${evt.stageName}] ${evt.message}`));
            }
          },
        });

        enqueue(sseLine("status", "✅ Pipeline tüm aşamaları başarıyla tamamlandı!"));
        enqueue(sseLine("done", ""));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Bilinmeyen pipeline hatası";
        enqueue(sseLine("error", `Pipeline Hatası: ${errorMsg}`));
        enqueue(sseLine("done", ""));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
