// src/app/api/pipeline/route.ts
// Canlı Sıralı Pipeline API Endpoint'i (SSE streaming).
// Python agent_system motoruyla (main.py / subagent_engine.py) doğrudan entegre çalışır.

import { NextRequest } from "next/server";
import { getSettings, getProviders, getProviderApiKey, loadSession } from "@/lib/store";
import { executePipeline, PipelineStepEvent } from "@/lib/pipeline/pipelineRunner";
import { spawn } from "child_process";
import readline from "readline";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getPythonExecutable(): string | null {
  const isWin = process.platform === "win32";
  const candidates = [
    path.resolve(process.cwd(), "..", "agent_system", ".venv", isWin ? "Scripts/python.exe" : "bin/python"),
    path.resolve(process.cwd(), "agent_system", ".venv", isWin ? "Scripts/python.exe" : "bin/python"),
    path.resolve(process.cwd(), "..", "myf-agent-cli", "agent_system", ".venv", isWin ? "Scripts/python.exe" : "bin/python"),
    path.resolve(process.cwd(), "..", "myf-agent-cli", ".venv", isWin ? "Scripts/python.exe" : "bin/python"),
    process.env.MYF_CLI_PATH ? path.resolve(process.env.MYF_CLI_PATH, "agent_system", ".venv", isWin ? "Scripts/python.exe" : "bin/python") : "",
    process.env.VIRTUAL_ENV ? path.join(process.env.VIRTUAL_ENV, isWin ? "Scripts/python.exe" : "bin/python") : "",
    isWin ? "python.exe" : "python3",
    "python",
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return isWin ? "python.exe" : "python3";
}

function getBridgeScriptPath(): string | null {
  const candidates = [
    // 1. Monorepo yapısı (CLI_Project):
    path.resolve(process.cwd(), "..", "agent_system", "pipeline_bridge.py"),
    path.resolve(process.cwd(), "agent_system", "pipeline_bridge.py"),
    // 2. Ayrı repo / yan yana klasör yapısı (myf-agent-web & myf-agent-cli):
    path.resolve(process.cwd(), "..", "myf-agent-cli", "agent_system", "pipeline_bridge.py"),
    path.resolve(process.cwd(), "..", "myf-agent-cli", "pipeline_bridge.py"),
    // 3. Ortam değişkeni ile özel yol:
    process.env.MYF_CLI_PATH ? path.resolve(process.env.MYF_CLI_PATH, "agent_system", "pipeline_bridge.py") : "",
    process.env.MYF_CLI_PATH ? path.resolve(process.env.MYF_CLI_PATH, "pipeline_bridge.py") : "",
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

export async function GET() {
  const pyExe = getPythonExecutable();
  const bridgeScript = getBridgeScriptPath();
  const available = Boolean(pyExe && bridgeScript);

  return Response.json({
    available,
    pythonExecutable: pyExe,
    bridgeScript,
    repoUrl: "https://github.com/bymayfe/myf-agent-cli",
    guide: "Python çoklu ajan sistemini web projesi ile aynı üst dizine yan yana klonlayabilirsiniz.",
  });
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
  const projectDir =
    session?.project_dir ||
    path.resolve(process.cwd(), "..", "agent_system", "projects", `project_${Date.now()}`);

  const pyExe = getPythonExecutable();
  const bridgeScript = getBridgeScriptPath();
  const apiKey = getProviderApiKey(provider.api_key_env);

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const enqueue = (s: string) => {
        if (!isClosed) {
          try {
            controller.enqueue(new TextEncoder().encode(s));
          } catch {}
        }
      };

      const closeStream = () => {
        if (!isClosed) {
          isClosed = true;
          try {
            controller.close();
          } catch {}
        }
      };

      // ── 1. Python Pipeline Köprüsü Mevcutsa Doğrudan Python Motorunu Çalıştır ──
      if (pyExe && bridgeScript) {
        try {
          const maxRetries = settings.full_autonomy_cap ? -1 : (settings.micro_fix_max_tries || 3);
          const pyArgs = [
            bridgeScript,
            "--brief",
            requirement,
            "--project-dir",
            projectDir,
            "--max-retries",
            String(maxRetries),
          ];
          if (sessionId) {
            pyArgs.push("--session-id", sessionId);
          }

          enqueue(sseLine("status", "🚀 Python Çoklu-Ajan Pipeline Motoru başlatılıyor..."));

          const child = spawn(pyExe, pyArgs, {
            env: {
              ...process.env,
              PYTHONUNBUFFERED: "1",
              PYTHONIOENCODING: "utf-8",
            },
          });

          // İstemci bağlantıyı keserse alt süreci durdur
          req.signal.addEventListener("abort", () => {
            try {
              child.kill();
            } catch {}
          });

          const rl = readline.createInterface({ input: child.stdout });

          rl.on("line", (line) => {
            const clean = line.trim();
            if (!clean) return;

            try {
              const parsed = JSON.parse(clean);
              if (parsed.event && parsed.data !== undefined) {
                enqueue(sseLine(parsed.event, parsed.data));
                return;
              }
            } catch {}

            // Düz metin loglarını status olarak gönder
            if (
              clean.includes("[PM]") ||
              clean.includes("[DEV]") ||
              clean.includes("[QA]") ||
              clean.includes("[REVIEWER]") ||
              clean.includes("✅") ||
              clean.includes("🚀") ||
              clean.includes("⚠️") ||
              clean.includes("Codebase")
            ) {
              enqueue(sseLine("status", clean));
            }
          });

          child.stderr.on("data", (data) => {
            const msg = data.toString();
            // pydantic ve litellm uyarılarını atla
            if (!msg.includes("UserWarning") && !msg.includes("DeprecationWarning")) {
              console.warn("[Python Pipeline Stderr]:", msg);
            }
          });

          child.on("close", (code) => {
            if (code === 0) {
              enqueue(sseLine("status", "✅ Pipeline tüm aşamalarıyla başarıyla tamamlandı!"));
            } else {
              enqueue(sseLine("status", `⚠️ Pipeline çıkış kodu ${code} ile tamamlandı.`));
            }
            enqueue(sseLine("done", ""));
            closeStream();
          });

          child.on("error", (err) => {
            enqueue(sseLine("error", `Python çalıştırma hatası: ${err.message}`));
            enqueue(sseLine("done", ""));
            closeStream();
          });

          return;
        } catch (err) {
          console.warn("Python bridge başlatılamadı, fallback motoruna geçiliyor:", err);
        }
      }

      // ── 2. Fallback: TypeScript Dahili Pipeline Çalıştırıcı ──
      const missingPythonNotice =
        `ℹ️ **Bilgilendirme: Python Çoklu-Ajan Motoru (myf-agent-cli) Bulunamadı**\n\n` +
        `Web arayüzündeki Sıralı Pipeline'ın (Architect, Developer, QA, Micro-Fix, Reviewer) tam otonom Python motoruyla çalışabilmesi için **myf-agent-cli** sistemine ihtiyaç duyulmaktadır.\n\n` +
        `🔗 **Gerekli Python Deposu:** https://github.com/bymayfe/myf-agent-cli\n\n` +
        `📁 **Nasıl Eklemelisiniz? (Yan Yana Klasör Mimarisi):**\n` +
        `Web projenizin (\`myf-agent-web\`) bulunduğu aynı üst klasöre \`myf-agent-cli\` deposunu klonlayın:\n` +
        `\`\`\`bash\n` +
        `cd ..\n` +
        `git clone https://github.com/bymayfe/myf-agent-cli.git\n` +
        `cd myf-agent-cli\n` +
        `pip install -r agent_system/requirements.txt\n` +
        `\`\`\`\n\n` +
        `*Beklenen Dizin Yapısı:*\n` +
        `\`\`\`text\n` +
        `Projects/\n` +
        `├── myf-agent-web/       (Mevcut Web Arayüzü)\n` +
        `└── myf-agent-cli/       (Python Çoklu Ajan Motoru)\n` +
        `    └── agent_system/\n` +
        `        └── pipeline_bridge.py\n` +
        `\`\`\`\n\n` +
        `⚡ *Şu anda işlem **Dahili TypeScript Pipeline Motoru** ile yedek modda yürütülüyor...*`;

      enqueue(sseLine("notice", missingPythonNotice));
      enqueue(sseLine("status", "⚠️ Python motoru bulunamadı — Dahili TypeScript pipeline motoruna geçildi."));

      try {
        enqueue(sseLine("status", "🚀 Sıralı Pipeline Motoru (TypeScript) başlatıldı..."));

        await executePipeline({
          projectRequirement: requirement,
          projectDir,
          settings,
          providers,
          apiKey,
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
        closeStream();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
