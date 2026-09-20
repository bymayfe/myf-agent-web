// src/app/api/chat/route.ts
// Koordinatör sohbeti — SSE streaming & Plugin Tool Calling.
// DeepSeek Harness mimarisinde olduğu gibi aktif eklentileri (web, git, fs, codebase, terminal)
// sistem promptuna enjekte eder, model araç çağırdığında çalıştırıp nihai sonucu üretir.
// SessionExecutionManager ile arka plan süreç izolasyonu sağlar (F5 sonrası süreç kesilmez, re-attach desteklenir).

/** HTML içeriğini düz metne çevirir (curl/tool çıktısı temizleme). */
function stripHtml(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

import { NextRequest, NextResponse } from "next/server";
import type { ChatMessage } from "@/types";
import {
  getSettings,
  getProviders,
  getProviderApiKey,
  loadSession,
  createSession,
  saveSessionHistory,
  updateSessionTitle,
} from "@/lib/store";
import { callLlm } from "@/lib/llmClient";
import {
  buildSystemPrompt,
  preEvaluateUserInput,
  trimHistoryToBudget,
} from "@/lib/coordinator";
import { webSearch, formatSearchResultsForLLM } from "@/lib/webSearch";
import { buildCodebaseMap, formatMapForLLM } from "@/lib/codebaseMap";
import { pluginManager } from "@/lib/plugins/pluginManager";
import { runStreamingCommand } from "@/lib/plugins/builtins/terminalPlugin";
import {
  createGroup,
  addEvent,
  makeSearchEvent,
  makeNoteEvent,
  makeMapEvent,
  makeToolEvent,
} from "@/lib/activityLog";
import type { ActivityGroup } from "@/lib/activityLog";
import type { PluginContext } from "@/lib/plugins/types";
import { computeFileDiff } from "@/lib/diffHelper";
import type { FileDiffResult } from "@/lib/diffHelper";
import { sessionExecutionManager } from "@/lib/sessionExecutionManager";
import path from "path";
import { promises as fs } from "fs";

export const runtime = "nodejs";

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Web arama önekleri: "@web ...", "/search ...", "web_search: ..."
const WEB_SEARCH_RE = /^(?:@web|\/search|web_search:)\s+(.+)$/im;

// Türkçe doğal dil web araştırma tespiti (CLI chat.py'deki Agent-Reach mantığı)
const TR_RESEARCH_RE =
  /\b(?:internetten\s+ara|araştır|araştırarak|araştırsın|araştır[a-z]*|webde\s+ara|web'den\s+ara|web\s+arama|güncel\s+sürüm|en\s+son\s+sürüm|güncel\s+fiyat|güncel[a-z]*\s+bilgi|son\s+haber|internette\s+bak|internete\s+bak|internet'te\s+bak|online\s+ara|search\s+online)\b/i;

// Codebase map cache
let _mapCache: { map: string; builtAt: number } | null = null;
const MAP_CACHE_MS = 30_000;

async function getCodebaseMapText(projectDir: string): Promise<{ text: string; fileCount: number }> {
  const now = Date.now();
  if (_mapCache && now - _mapCache.builtAt < MAP_CACHE_MS) {
    return { text: _mapCache.map, fileCount: 0 };
  }

  const targetDir = projectDir && (await fs.stat(projectDir).catch(() => null))
    ? projectDir
    : path.join(process.cwd(), "..");

  const map = await buildCodebaseMap(targetDir);
  const text = formatMapForLLM(map, 50);
  _mapCache = { map: text, builtAt: now };
  return { text, fileCount: map.fileCount };
}

/**
 * F5 atıldığında veya sayfa açıldığında oturum durumunu sorgulama veya canlı akışa yeniden bağlanma (Re-Attach)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const action = searchParams.get("action");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId gerekli" }, { status: 400 });
  }

  const execution = sessionExecutionManager.getExecution(sessionId);

  if (action === "status") {
    return NextResponse.json({
      isRunning: sessionExecutionManager.isRunning(sessionId),
      status: execution?.status || "idle",
      prompt: execution?.prompt || "",
      eventCount: execution?.events.length || 0,
      statusNote: execution?.statusNote,
    });
  }

  if (action === "attach") {
    if (!execution) {
      return new Response(sseLine("done", ""), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const fromIndex = parseInt(searchParams.get("from") || "0", 10);

    const stream = new ReadableStream({
      start(controller) {
        let isClosed = false;
        const unsubscribe = sessionExecutionManager.subscribe(
          sessionId,
          (item) => {
            if (isClosed) return;
            try {
              controller.enqueue(new TextEncoder().encode(sseLine(item.event, item.data)));
              if (item.event === "done") {
                isClosed = true;
                try {
                  controller.close();
                } catch {}
              }
            } catch {}
          },
          fromIndex
        );

        req.signal.addEventListener("abort", () => {
          isClosed = true;
          unsubscribe();
        });
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

  return NextResponse.json({ isRunning: sessionExecutionManager.isRunning(sessionId) });
}

/**
 * Arka plan otonom yürütücü görevi.
 * İstemci HTTP bağlantısını kapatsa (F5) dahi sunucuda kesintisiz çalışmayı sürdürür.
 */
async function runBackgroundSessionTask(params: {
  activeSessionId: string;
  userPrompt: string;
  session: any;
  isNewlyCreated: boolean;
  projectDir: string;
  settings: any;
  provider: any;
  emit: (event: string, data: unknown) => void;
  finish: (status?: "completed" | "error" | "aborted") => void;
  executionSignal: AbortSignal;
}) {
  const {
    activeSessionId,
    userPrompt,
    session,
    isNewlyCreated,
    projectDir,
    settings,
    provider,
    emit,
    finish,
    executionSignal,
  } = params;

  if (isNewlyCreated && session) {
    emit("session_created", {
      sessionId: activeSessionId,
      title: session.title,
    });
  } else if (session && session.title !== "Yeni Oturum") {
    emit("session_title_updated", {
      sessionId: activeSessionId,
      title: session.title,
    });
  }

  const turnId = `turn_${Date.now()}`;
  const actGroup: ActivityGroup = createGroup(turnId);

  const emitActivity = () => {
    emit("activity", actGroup);
  };

  const pluginEnv = { ...process.env };
  delete pluginEnv.PORT;

  const pluginContext: PluginContext = {
    projectDir,
    sessionId: activeSessionId,
    env: pluginEnv as Record<string, string | undefined>,
    log: (msg) => {
      addEvent(actGroup, makeNoteEvent(msg));
      emitActivity();
    },
  };

  let fullText = "";
  let fullThinking = "";
  let editedFiles: FileDiffResult[] = [];

  const persistTurn = async () => {
    try {
      const sess = await loadSession(activeSessionId);
      if (!sess) return;
      const h = [...(sess.conversation_history || [])];
      const last = h[h.length - 1];
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: fullText || "*(İşlem yürütülüyor...)*",
        thinking: fullThinking || undefined,
        editedFiles: editedFiles.length > 0 ? editedFiles : undefined,
        createdAt: new Date().toISOString(),
      };
      if (last && last.role === "assistant") {
        h[h.length - 1] = assistantMsg;
      } else {
        h.push(assistantMsg);
      }
      await saveSessionHistory(activeSessionId, h);
    } catch {}
  };

  try {
    // ── 1. Doğrudan @web veya /search öneki VEYA Türkçe araştırma tespiti ──
    const webMatch = WEB_SEARCH_RE.exec(userPrompt);
    let directSearchContext = "";

    if (webMatch) {
      const query = webMatch[1].trim();
      emit("status", `🔍 Web'de aranıyor: "${query}"...`);

      const searchRes = await webSearch(query, { maxResults: 5 });
      directSearchContext = formatSearchResultsForLLM(searchRes);

      addEvent(actGroup, makeSearchEvent(query, searchRes.results.length));
      emitActivity();

      emit("status", `✅ ${searchRes.results.length} sonuç bulundu (${searchRes.backend})`);
    } else if (TR_RESEARCH_RE.test(userPrompt) && !directSearchContext) {
      const now = new Date();
      const monthYear = now.toLocaleString("tr-TR", { month: "long", year: "numeric" });
      const firstLine = userPrompt.split(/[\r\n]+/)[0]?.trim().slice(0, 100) ?? userPrompt.slice(0, 100);
      const autoQuery = /20\d\d/.test(firstLine) ? firstLine : `${firstLine} ${monthYear}`;

      emit("status", `🌐 Agent-Reach: Canlı web araştırması yapılıyor: "${autoQuery}"...`);

      try {
        const searchRes = await webSearch(autoQuery, { maxResults: 5 });
        if (searchRes.results.length > 0) {
          directSearchContext = formatSearchResultsForLLM(searchRes);
          addEvent(actGroup, makeSearchEvent(autoQuery, searchRes.results.length));
          emitActivity();
          emit("status", `✅ ${searchRes.results.length} güncel sonuç bulundu (${searchRes.backend}) — LLM'e aktarıldı`);
        }
      } catch {
        // sessizce devam et
      }
    }

    if (executionSignal.aborted) throw new Error("İşlem kullanıcı tarafından durduruldu.");

    // ── 2. Codebase map ───────────────────────────────────────────────
    let mapText = "";
    try {
      const { text, fileCount } = await getCodebaseMapText(projectDir);
      mapText = text;
      if (fileCount > 0) {
        addEvent(actGroup, makeMapEvent(fileCount));
        emitActivity();
      }
    } catch {}

    if (executionSignal.aborted) throw new Error("İşlem kullanıcı tarafından durduruldu.");

    // ── 3. Eklenti (Plugin) Araçları sistem promptu ───────────────────
    const pluginsPrompt = await pluginManager.buildPluginSystemPrompt(pluginContext);

    // ── 4. Onay / pipeline ön-değerlendirme ───────────────────────────
    const history: ChatMessage[] = session ? [...session.conversation_history] : [];
    const isPipelineMode = settings.execution_mode === "sequential";
    const decision = preEvaluateUserInput(userPrompt, history, isPipelineMode);
    if (decision) {
      if (decision.immediateReply) {
        history.push({
          role: "assistant",
          content: decision.immediateReply,
          createdAt: new Date().toISOString(),
        });
        await saveSessionHistory(activeSessionId, history);
        emit("content", decision.immediateReply);
      }
      if (decision.shouldStartPipeline) {
        const isGeneric = (t?: string) => {
          if (!t) return true;
          const s = t.trim().toLowerCase();
          return (
            s.startsWith("/") ||
            s === "devam" ||
            s === "devam et" ||
            s === "continue" ||
            s === "başlat" ||
            s === "start" ||
            s === "run" ||
            s === "true" ||
            s.includes("sonraki adımları tamamla") ||
            s.includes("kaldığın yerden devam et")
          );
        };

        let req = userPrompt;
        if (isGeneric(userPrompt)) {
          const lastUser = [...history].reverse().find(
            (m) => m.role === "user" && !isGeneric(m.content)
          );
          if (lastUser?.content) req = lastUser.content;
        }
        emit("pipeline_start", { requirement: req });
      }
      emit("activity", actGroup);
      emit("done", "");
      finish("completed");
      return;
    }

    // ── 5. API key kontrolü ───────────────────────────────────────────
    const apiKey = getProviderApiKey(provider.api_key_env);
    if (provider.requires_key && !apiKey) {
      emit("error", `"${provider.label}" için API anahtarı bulunamadı. .env.local → ${provider.api_key_env}=...`);
      emit("done", "");
      finish("error");
      return;
    }

    // ── 6. Sistem promptu inşası ─────────────────────────────────────
    const projectName = path.basename(projectDir);
    const baseSystemPrompt = buildSystemPrompt({
      coordinatorName: settings.coordinator_name,
      executionMode: settings.execution_mode,
      projectContextText: `AKTİF ÇALIŞMA DİZİNİ (PROJE): ${projectDir} (Proje Adı: ${projectName})`,
    });

    const systemParts = [baseSystemPrompt];
    if (pluginsPrompt) systemParts.push(pluginsPrompt);
    if (mapText) systemParts.push(mapText);
    if (directSearchContext) systemParts.push(directSearchContext);

    const systemPrompt = systemParts.join("\n\n");

    let effectiveModel = settings.coordinator_model;
    const expectedPrefix = provider.model_prefix ? `${provider.model_prefix}/` : "";
    if (expectedPrefix && !effectiveModel.startsWith(expectedPrefix)) {
      const defaultProvModel = provider.agent_models?.coordinator;
      if (defaultProvModel) {
        effectiveModel = defaultProvModel;
      }
    }

    const contextWindow =
      provider.model_context_windows[
        effectiveModel.split("/").pop() ?? ""
      ] ?? provider.default_context_window;

    const trimmedHistory = trimHistoryToBudget(systemPrompt, history, contextWindow);
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...trimmedHistory,
    ];

    // ── 7. Çok Adımlı Otonom Ajan Döngüsü (Multi-Step Agent Loop) ───
    const requestedMaxTokens = settings.max_tokens ? Math.max(settings.max_tokens, 8192) : 8192;
    const currentMessages: ChatMessage[] = [...messages];
    const MAX_TOOL_ITERATIONS = 14;
    let iteration = 0;
    const previousCallsHistory: string[] = [];

    while (iteration < MAX_TOOL_ITERATIONS) {
      if (executionSignal.aborted) throw new Error("İşlem kullanıcı tarafından durduruldu.");

      iteration++;
      let turnContent = "";
      let turnThinking = "";
      let firstTokenReceived = false;
      let elapsedSec = 0;
      let inThinking = false;

      const coldStartTimer = setInterval(() => {
        if (firstTokenReceived) {
          clearInterval(coldStartTimer);
          return;
        }
        elapsedSec += 2;
        if (elapsedSec >= 4 && elapsedSec < 10) {
          emit("status", `⏳ Sağlayıcıya bağlanıldı, yanıt hazırlanıyor (${elapsedSec}s)...`);
        } else if (elapsedSec >= 10 && elapsedSec < 22) {
          emit("status", `🚀 Model uyandırılıyor (Cold-Start / Kuyruk bekleniyor - ${elapsedSec}s)...`);
        } else if (elapsedSec >= 22) {
          emit("status", `⏳ Bulut sağlayıcı kuyruğu yoğun (${elapsedSec}s), lütfen bekleyin...`);
        }
      }, 2000);

      try {
        await callLlm({
          messages: currentMessages,
          model: effectiveModel,
          apiBase: provider.api_base,
          apiKey,
          temperature: settings.temperature,
          topP: settings.top_p ?? 0.95,
          topK: settings.top_k ?? 40,
          maxTokens: requestedMaxTokens,
          thinkMode: settings.think_mode,
          warmup: settings.warmup,
          contextWindow,
          signal: executionSignal,
          onToken: (token, type) => {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              clearInterval(coldStartTimer);
              emit("status", "");
            }
            if (type === "thinking") {
              if (!inThinking) {
                inThinking = true;
                const openTag = "<think>\n";
                turnContent += openTag;
                emit("content", openTag);
              }
              turnThinking += token;
              turnContent += token;
              emit("content", token);
            } else if (type === "content") {
              if (inThinking) {
                inThinking = false;
                const closeTag = "\n</think>\n\n";
                turnContent += closeTag;
                emit("content", closeTag);
              }
              turnContent += token;
              emit("content", token);
            }
          },
        });
      } finally {
        clearInterval(coldStartTimer);
        if (inThinking) {
          inThinking = false;
          const closeTag = "\n</think>\n\n";
          turnContent += closeTag;
          emit("content", closeTag);
        }
      }

      fullText += (fullText ? "\n\n" : "") + turnContent;
      if (turnThinking) {
        fullThinking += (fullThinking ? "\n\n" : "") + turnThinking;
      }

      // Her tur sonrası oturum geçmişini diske güvenceye al
      await persistTurn();

      if (executionSignal.aborted) throw new Error("İşlem kullanıcı tarafından durduruldu.");

      const toolCalls = pluginManager.extractToolCalls(turnContent);
      if (toolCalls.length === 0) {
        break;
      }

      emit("status", `🔧 [Adım ${iteration}] ${toolCalls.length} eklenti aracı çalıştırılıyor...`);

      const toolResults: string[] = [];
      for (const call of toolCalls) {
        if (executionSignal.aborted) throw new Error("İşlem kullanıcı tarafından durduruldu.");

        const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        let toolResult: { success: boolean; output: string };

        if (call.tool === "run_command") {
          const cmd = String(call.parameters.command || "");
          emit("status", `⚡ Shell komutu çalıştırılıyor: $ ${cmd}`);
          emit("terminal_task", {
            id: taskId,
            command: cmd,
            status: "running",
            output: "",
            startedAt: new Date().toISOString(),
          });

          const cwd = pluginContext.projectDir || process.cwd();
          toolResult = await runStreamingCommand(
            cmd,
            cwd,
            (chunk) => {
              emit("terminal_chunk", { taskId, chunk });
            },
            taskId
          );

          emit("terminal_task", {
            id: taskId,
            command: cmd,
            status: toolResult.success ? "completed" : "error",
            output: toolResult.output,
            startedAt: new Date().toISOString(),
          });
        } else {
          emit("status", `⚙️ [${call.tool}] çalıştırılıyor...`);
          toolResult = await pluginManager.executeTool(call.tool, call.parameters, pluginContext);
        }

        addEvent(
          actGroup,
          makeToolEvent(
            call.tool,
            call.tool.split("_")[0] || "Plugin",
            toolResult.output,
            toolResult.success ? "done" : "error"
          )
        );
        emitActivity();

        let llmOutputSummary = toolResult.output;
        if (call.tool === "run_command") {
          const isHtml =
            toolResult.output.includes("<!DOCTYPE") ||
            toolResult.output.includes("<html") ||
            toolResult.output.includes("<body");

          if (isHtml) {
            llmOutputSummary = stripHtml(toolResult.output).slice(0, 3000);
          } else if (!toolResult.success) {
            llmOutputSummary = `[HATA VE LOG DETAYI]:\n${toolResult.output.slice(0, 4000)}`;
          } else {
            const lines = toolResult.output.trim().split("\n");
            if (lines.length > 25) {
              llmOutputSummary = `(Komut başarıyla bitti, toplam ${lines.length} satır. Son 25 satır):\n${lines.slice(-25).join("\n")}`;
            }
          }
        } else if (llmOutputSummary.length > 18000) {
          llmOutputSummary = llmOutputSummary.slice(0, 18000) + "\n...(kısaltıldı — dosyanın geri kalanı için filtrele)";
        }

        toolResults.push(
          `[ARAÇ: ${call.tool} | DURUM: ${toolResult.success ? "BAŞARILI" : "HATA"}]\n${llmOutputSummary}`
        );
      }

      // Her araç grubu tamamlandığında diske durum kaydet
      await persistTurn();

      const recentCallsSig = toolCalls.map(c => `${c.tool}:${JSON.stringify(c.parameters)}`).join("|");
      const isLooping = previousCallsHistory.filter(h => h === recentCallsSig).length >= 2;
      previousCallsHistory.push(recentCallsSig);

      emit("status", "🤖 Araç çıktıları inceleniyor ve sonraki adıma geçiliyor...");

      let guidance = "Araçlar başarıyla çalıştırıldı ve çıktılar kullanıcı ekranına canlı yansıtıldı.\n\n" +
        `Araç Özetleri:\n${toolResults.join("\n\n")}\n\n` +
        "ÖNEMLİ KURAL: Terminal veya dosya çıktılarını kullanıcıya tekrar kopyalayıp yazarak token harcama. Doğrudan bu sonuca göre sonraki komutu/aracı çalıştır veya eksiksiz kodlarını ve nihai yanıtını sun.";

      if (isLooping) {
        guidance += "\n\n⚠️ UYARI: Bu aracı ve parametreleri az önce zaten çalıştırdın! Aynı dosyayı veya aracı tekrar çağırma. Elde ettiğin verileri kullanarak hemen kodu düzelt veya kullanıcıya bulgularını sunarak görevi tamamla.";
      }

      const readOnlyTools = new Set(["list_directory", "get_codebase_summary", "search_symbols", "git_status"]);
      const allReadOnly = toolCalls.every((c) => readOnlyTools.has(c.tool));
      if (allReadOnly && iteration >= 2) {
        guidance += "\n\n🚨 KRİTİK TALİMAT: Dizin boş veya incelenecek dosya yok. Boş dizini inceleme araçlarıyla tekrar tekrar taramayı DERHAL BIRAK! Kullanıcı senden yeni bir proje veya kod yazmanı istiyor. Hemen gerekli kurulum komutunu ('run_command') çalıştır veya dosyaları ('write_file' / kod bloğu) eksiksiz oluşturmaya başla.";
      }

      if (iteration >= MAX_TOOL_ITERATIONS - 1) {
        guidance += "\n\n⚠️ DİKKAT: Maksimum araç adımı sınırına yaklaşıyorsun. Bu turda ARTIK BAŞKA ARAÇ ÇAĞIRMA. Şimdiye kadar elde ettiğin bulguları özetle ve kullanıcıya eksiksiz nihai yanıtını sun. Eğer adımlar ve derleme başarıyla tamamlandıysa, projenin çalıştığını açıkça belirt; KESİNLİKLE olmayan hayali hatalar uydurma.";
      }

      const cleanTurnForLlm = turnContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      currentMessages.push(
        { role: "assistant", content: cleanTurnForLlm || turnContent },
        { role: "user", content: guidance }
      );
    }

    const cleanFullText = fullText.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```[\s\S]*?```/g, "").trim();
    const hasSubstantialText = cleanFullText.length > 50;
    if (!hasSubstantialText && iteration >= MAX_TOOL_ITERATIONS) {
      emit("status", "📝 Nihai değerlendirme ve özet hazırlanıyor...");
      let finalTurnContent = "";
      try {
        await callLlm({
          messages: [
            ...messages,
            {
              role: "user",
              content:
                "Maksimum araç adımı sınırına ulaşıldı. Şimdiye kadar çalıştırdığın araçların çıktılarına göre gelinen nihai durumu kullanıcıya eksiksiz, tarafsız ve Türkçe olarak açıkla. ÖNEMLİ: Eğer proje derlemesi/testleri başarıyla tamamlandıysa (hata yoksa), projenin başarıyla çalıştığını ve nasıl test edileceğini netçe yaz. KESİNLİKLE gerçekte var olmayan hayali hatalar uydurma.",
            },
          ],
          model: effectiveModel,
          apiBase: provider.api_base,
          apiKey,
          temperature: settings.temperature,
          topP: settings.top_p ?? 0.95,
          topK: settings.top_k ?? 40,
          maxTokens: requestedMaxTokens,
          thinkMode: false,
          warmup: false,
          contextWindow,
          signal: executionSignal,
          onToken: (token, type) => {
            if (type === "content") {
              finalTurnContent += token;
              emit("content", token);
            }
          },
        });
        if (finalTurnContent.trim()) {
          fullText += (fullText ? "\n\n" : "") + finalTurnContent;
        }
      } catch {}
    }

    if (!fullText.trim()) {
      const fallbackNotice = "✅ Araç incelemeleri tamamlandı. Tespit edilen durumlar ve dosya değişiklikleri kaydedildi.";
      fullText = fallbackNotice;
      emit("content", fallbackNotice);
    }

    // ── 9. Yanıt analizi: kod blokları → diske yaz & git diff hesapla ─
    const extractedFiles: Array<{ path: string; content: string }> = [];
    const codeBlockRe = /```(?:\w*)\n([\s\S]*?)```/g;
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = codeBlockRe.exec(fullText)) !== null) {
      const rawCode = blockMatch[1];
      const lines = rawCode.split("\n");
      const firstLine = lines[0]?.trim() || "";

      const fileHeaderMatch =
        /^(?:\/\/\s*(?:filepath:\s*)?|\/\*\s*(?:filepath:\s*)?|#\s*(?:filepath:\s*)?|<!--\s*(?:filepath:\s*)?)([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)(?:\s*\*\/|\s*-->)?$/.exec(
          firstLine
        );

      if (fileHeaderMatch) {
        const relPath = fileHeaderMatch[1].trim();
        const codeContent = lines.slice(1).join("\n").trim();
        if (relPath && codeContent && !relPath.includes(" ")) {
          extractedFiles.push({ path: relPath, content: codeContent });
        }
      }
    }

    editedFiles = [];
    for (const f of extractedFiles) {
      try {
        const targetPath = path.isAbsolute(f.path) ? f.path : path.join(projectDir, f.path);
        let oldContent = "";
        try {
          oldContent = await fs.readFile(targetPath, "utf-8");
        } catch {
          oldContent = "";
        }

        const diffResult = computeFileDiff(f.path, oldContent, f.content);

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.writeFile(targetPath, f.content, "utf-8");

        editedFiles.push(diffResult);
      } catch {}
    }

    if (editedFiles.length > 0) {
      emit("file_changes", editedFiles);
      emit("status", `💾 ${editedFiles.length} dosya kaydedildi: ${editedFiles.map((e) => e.path).join(", ")}`);
      addEvent(actGroup, {
        id: `act_${Date.now()}`,
        kind: "edit",
        timestamp: new Date().toISOString(),
        files: editedFiles.map((e) => ({
          path: e.path,
          added: e.added,
          removed: e.removed,
        })),
      });
      emitActivity();
    }

    // ── 10. Not ekle ──────────────────────────────────────────────────
    const cleanForNote = fullText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const firstSentence = cleanForNote.split(/[.!?\n]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
      addEvent(actGroup, makeNoteEvent(firstSentence));
    }

    emit("activity", actGroup);

    // ── 11. Devam Etme (Continuation) Tespiti ─────────────────────────
    const backtickCount = (fullText.match(/```/g) || []).length;
    const hasUnclosedFence = backtickCount % 2 !== 0;
    const askContinuation = /devam\s+etmemi\s+ister\s+misin|devam\s+edeyim\s+mi|devam\s+et\s+dersen|kaldığı\s+yerden\s+devam/i.test(fullText);

    if (hasUnclosedFence || askContinuation) {
      emit("continue_prompt", {
        needed: true,
        message: hasUnclosedFence
          ? "Kod çıktısı token limitinde duraklatıldı. Devam etmek için butona tıklayın."
          : "Ajan sonraki adıma geçmek için hazır. Devam etmemi ister misin?",
      });
    }

    // ── 12. Oturumu kalıcı kaydet ─────────────────────────────────────
    await persistTurn();

    // ── 13. Oturum Başlığı Otomatik AI Üretimi ────────────────────────
    if (
      activeSessionId &&
      session &&
      (session.title === "Yeni Oturum" ||
       session.title.startsWith("yeni_proje") ||
       session.conversation_history.length <= 1)
    ) {
      try {
        const titlePrompt = `Aşağıdaki kullanıcı mesajına göre 3 ila 5 kelimelik kısa, net, açıklayıcı bir Türkçe oturum başlığı üret. Sadece başlığı yaz, tırnak, emoji, nokta veya ek açıklama yazma:\n\n"${userPrompt.slice(0, 300)}"`;
        let autoTitle = "";
        await callLlm({
          messages: [{ role: "user", content: titlePrompt }],
          model: effectiveModel,
          apiBase: provider.api_base,
          apiKey,
          temperature: 0.3,
          topP: settings.top_p ?? 0.95,
          topK: settings.top_k ?? 40,
          maxTokens: 60,
          thinkMode: false,
          signal: executionSignal,
          onToken: (tok, type) => {
            if (type === "content") autoTitle += tok;
          },
        });
        const cleanTitle = autoTitle
          .replace(/["'#*`\n\.]/g, "")
          .replace(/^(başlık|title|konu)\s*:\s*/i, "")
          .trim()
          .slice(0, 45);

        if (cleanTitle && cleanTitle.length > 2 && activeSessionId) {
          await updateSessionTitle(activeSessionId, cleanTitle);
          emit("session_title_updated", { sessionId: activeSessionId, title: cleanTitle });
        }
      } catch {}
    }

    if (/##PIPELINE_START##/i.test(fullText) || /##PIPELINE_START##/i.test(userPrompt)) {
      const reqMatch = /##PIPELINE_START##\s*([\s\S]*?)(?:##PIPELINE_END##|$)/i.exec(fullText) ||
                       /##PIPELINE_START##\s*([\s\S]*?)(?:##PIPELINE_END##|$)/i.exec(userPrompt);
      const requirement = reqMatch ? reqMatch[1].trim() : userPrompt;
      emit("pipeline_start", { requirement });
    }

    emit("done", "");
    finish("completed");
  } catch (err) {
    const isAbort = executionSignal.aborted || (err instanceof Error && err.name === "AbortError");
    if (isAbort) {
      emit("notice", "⏹️ İşlem durduruldu.");
      finish("aborted");
    } else {
      const message = err instanceof Error ? err.message : "Bilinmeyen hata";
      emit("error", message);
      finish("error");
    }
    emit("done", "");
  } finally {
    await persistTurn();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, sessionId: bodySessionId } = body;

  // Kullanıcı "Durdur" butonuna bastıysa arka plan görevini sonlandır
  if (action === "stop" && bodySessionId) {
    sessionExecutionManager.abortExecution(bodySessionId);
    return NextResponse.json({ success: true, stopped: true });
  }

  const userPrompt: string = (body.prompt ?? "").trim();
  const sessionId: string | undefined = bodySessionId;

  if (!userPrompt) {
    return NextResponse.json({ error: "Boş prompt" }, { status: 400 });
  }

  const settings = await getSettings();
  const providersFile = await getProviders();
  const provider = providersFile.providers[settings.active_provider];
  if (!provider) {
    return NextResponse.json({ error: "Aktif sağlayıcı bulunamadı" }, { status: 500 });
  }

  let activeSessionId = sessionId;
  let session = activeSessionId ? await loadSession(activeSessionId) : null;
  let isNewlyCreated = false;

  if (!session) {
    const cleanTitle =
      userPrompt.slice(0, 35).replace(/[\r\n]+/g, " ").trim() || "Yeni Oturum";
    const slug =
      cleanTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .slice(0, 20) || "proje";
    session = await createSession(cleanTitle, slug);
    activeSessionId = session.session_id;
    isNewlyCreated = true;
  } else if (session.title === "Yeni Oturum" || session.title.startsWith("yeni_proje")) {
    const quickTitle = userPrompt.slice(0, 35).replace(/[\r\n]+/g, " ").trim();
    if (quickTitle && quickTitle.length > 2) {
      session.title = quickTitle;
      await updateSessionTitle(activeSessionId!, quickTitle);
    }
  }

  const history: ChatMessage[] = session ? [...session.conversation_history] : [];
  history.push({ role: "user", content: userPrompt, createdAt: new Date().toISOString() });
  if (activeSessionId) {
    await saveSessionHistory(activeSessionId, history);
  }

  const workspaceRoot = path.resolve(process.cwd(), "..");
  const rawProjectDir = session?.project_dir?.trim() || "";
  const projectDir =
    rawProjectDir && !rawProjectDir.includes(path.join("data", "projects"))
      ? rawProjectDir
      : workspaceRoot;

  // Arka plan süreç yöneticisinde görevi başlat (F5 atılsa dahi sunucuda kesilmez!)
  const { emit, finish, signal: executionSignal } =
    sessionExecutionManager.startExecution(activeSessionId!, userPrompt);

  // Arka plan görevini asenkron olarak yürüt
  runBackgroundSessionTask({
    activeSessionId: activeSessionId!,
    userPrompt,
    session,
    isNewlyCreated,
    projectDir,
    settings,
    provider,
    emit,
    finish,
    executionSignal,
  });

  // İstemciye canlı SSE abonelik akışı dön
  const stream = new ReadableStream({
    start(controller) {
      let isClosed = false;
      const unsubscribe = sessionExecutionManager.subscribe(
        activeSessionId!,
        (item) => {
          if (isClosed) return;
          try {
            controller.enqueue(new TextEncoder().encode(sseLine(item.event, item.data)));
            if (item.event === "done") {
              isClosed = true;
              try {
                controller.close();
              } catch {}
            }
          } catch {}
        }
      );

      req.signal.addEventListener("abort", () => {
        isClosed = true;
        unsubscribe();
        // DİKKAT: Burada arka plan görevini öldürmüyoruz!
        // Görev sunucuda çalışmayı sürdürür, F5 sonrası istemci GET action=attach ile bağlanır.
      });
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
