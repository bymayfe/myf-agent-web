// src/app/api/chat/route.ts
// Koordinatör sohbeti — SSE streaming & Plugin Tool Calling.
// DeepSeek Harness mimarisinde olduğu gibi aktif eklentileri (web, git, fs, codebase, terminal)
// sistem promptuna enjekte eder, model araç çağırdığında çalıştırıp nihai sonucu üretir.

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

import { NextRequest } from "next/server";
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userPrompt: string = (body.prompt ?? "").trim();
  const sessionId: string | undefined = body.sessionId;

  if (!userPrompt) {
    return new Response(JSON.stringify({ error: "Boş prompt" }), { status: 400 });
  }

  const settings = await getSettings();
  const providersFile = await getProviders();
  const provider = providersFile.providers[settings.active_provider];
  if (!provider) {
    return new Response(JSON.stringify({ error: "Aktif sağlayıcı bulunamadı" }), { status: 500 });
  }

  let activeSessionId = sessionId;
  let session = activeSessionId ? await loadSession(activeSessionId) : null;
  let isNewlyCreated = false;

  if (!session) {
    // Oturum yoksa veya ilk mesajsa oturumu anında oluştur
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
    // Kullanıcı önceden açılmış boş "Yeni Oturum"a ilk mesajı yazdıysa hemen ilk cümleden anlamlı başlık ata
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

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(new TextEncoder().encode(s));

      if (isNewlyCreated && activeSessionId && session) {
        enqueue(
          sseLine("session_created", {
            sessionId: activeSessionId,
            title: session.title,
          })
        );
      } else if (activeSessionId && session && session.title !== "Yeni Oturum") {
        enqueue(
          sseLine("session_title_updated", {
            sessionId: activeSessionId,
            title: session.title,
          })
        );
      }

      const turnId = `turn_${Date.now()}`;
      const actGroup: ActivityGroup = createGroup(turnId);

      const emitActivity = () => {
        enqueue(sseLine("activity", actGroup));
      };

      const pluginContext: PluginContext = {
        projectDir,
        sessionId: activeSessionId,
        env: process.env as Record<string, string | undefined>,
        log: (msg) => {
          addEvent(actGroup, makeNoteEvent(msg));
          emitActivity();
        },
      };

      try {
        // ── 1. Doğrudan @web veya /search öneki VEYA Türkçe araştırma tespiti ──
        const webMatch = WEB_SEARCH_RE.exec(userPrompt);
        let directSearchContext = "";

        // Açık prefix ile web araması
        if (webMatch) {
          const query = webMatch[1].trim();
          enqueue(sseLine("status", `🔍 Web'de aranıyor: "${query}"...`));

          const searchRes = await webSearch(query, { maxResults: 5 });
          directSearchContext = formatSearchResultsForLLM(searchRes);

          addEvent(actGroup, makeSearchEvent(query, searchRes.results.length));
          emitActivity();

          enqueue(sseLine("status", `✅ ${searchRes.results.length} sonuç bulundu (${searchRes.backend})`));
        }
        // Türkçe doğal dil araştırma tespiti (Agent-Reach: "araştır", "internetten bak" vb.)
        else if (TR_RESEARCH_RE.test(userPrompt) && !directSearchContext) {
          // Kullanıcı mesajının ilk satırını arama sorgusu olarak kullan
          const now = new Date();
          const monthYear = now.toLocaleString("tr-TR", { month: "long", year: "numeric" });
          const firstLine = userPrompt.split(/[\r\n]+/)[0]?.trim().slice(0, 100) ?? userPrompt.slice(0, 100);
          // Tarih içeriyorsa ekleme
          const autoQuery = /20\d\d/.test(firstLine) ? firstLine : `${firstLine} ${monthYear}`;

          enqueue(sseLine("status", `🌐 Agent-Reach: Canlı web araştırması yapılıyor: "${autoQuery}"...`));

          try {
            const searchRes = await webSearch(autoQuery, { maxResults: 5 });
            if (searchRes.results.length > 0) {
              directSearchContext = formatSearchResultsForLLM(searchRes);
              addEvent(actGroup, makeSearchEvent(autoQuery, searchRes.results.length));
              emitActivity();
              enqueue(sseLine("status", `✅ ${searchRes.results.length} güncel sonuç bulundu (${searchRes.backend}) — LLM'e aktarıldı`));
            }
          } catch {
            // araştırma başarısızsa sessizce devam et
          }
        }

        // ── 2. Codebase map ───────────────────────────────────────────────
        let mapText = "";
        try {
          const { text, fileCount } = await getCodebaseMapText(projectDir);
          mapText = text;
          if (fileCount > 0) {
            addEvent(actGroup, makeMapEvent(fileCount));
            emitActivity();
          }
        } catch {
          // map başarısızsa devam et
        }

        // ── 3. Eklenti (Plugin) Araçları sistem promptu ───────────────────
        const pluginsPrompt = await pluginManager.buildPluginSystemPrompt(pluginContext);

        // ── 4. Onay / pipeline ön-değerlendirme ───────────────────────────
        const isPipelineMode = settings.execution_mode === "sequential";
        const decision = preEvaluateUserInput(userPrompt, history, isPipelineMode);
        if (decision) {
          if (decision.immediateReply) {
            history.push({
              role: "assistant",
              content: decision.immediateReply,
              createdAt: new Date().toISOString(),
            });
          }
          if (activeSessionId) await saveSessionHistory(activeSessionId, history);

          if (decision.immediateReply) enqueue(sseLine("content", decision.immediateReply));
          if (decision.shouldStartPipeline) enqueue(sseLine("pipeline_start", "true"));
          enqueue(sseLine("activity", actGroup));
          enqueue(sseLine("done", ""));
          return;
        }

        // ── 5. API key kontrolü ───────────────────────────────────────────
        const apiKey = getProviderApiKey(provider.api_key_env);
        if (provider.requires_key && !apiKey) {
          enqueue(
            sseLine(
              "error",
              `"${provider.label}" için API anahtarı bulunamadı. .env.local → ${provider.api_key_env}=...`
            )
          );
          enqueue(sseLine("done", ""));
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

        // Aktif sağlayıcı ile model uyumsuzluğunu düzelt (örn: Sağlayıcı ollama iken model openai/... kalmışsa)
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
        let fullText = "";
        let fullThinking = "";
        let currentMessages: ChatMessage[] = [...messages];
        const MAX_TOOL_ITERATIONS = 8;
        let iteration = 0;
        const previousCallsHistory: string[] = [];

        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration++;
          let turnContent = "";
          let turnThinking = "";
          let firstTokenReceived = false;
          let elapsedSec = 0;

          // Bulut sağlayıcı gecikme ve cold-start izleyici
          const coldStartTimer = setInterval(() => {
            if (firstTokenReceived) {
              clearInterval(coldStartTimer);
              return;
            }
            elapsedSec += 2;
            if (elapsedSec >= 4 && elapsedSec < 10) {
              enqueue(sseLine("status", `⏳ Sağlayıcıya bağlanıldı, yanıt hazırlanıyor (${elapsedSec}s)...`));
            } else if (elapsedSec >= 10 && elapsedSec < 22) {
              enqueue(sseLine("status", `🚀 Model uyandırılıyor (Cold-Start / Kuyruk bekleniyor - ${elapsedSec}s)...`));
            } else if (elapsedSec >= 22) {
              enqueue(sseLine("status", `⏳ Bulut sağlayıcı kuyruğu yoğun (${elapsedSec}s), lütfen bekleyin...`));
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
              signal: req.signal,
              onToken: (token, type) => {
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  clearInterval(coldStartTimer);
                  enqueue(sseLine("status", ""));
                }
                if (type === "content") {
                  turnContent += token;
                } else if (type === "thinking") {
                  turnThinking += token;
                }
                enqueue(sseLine(type, token));
              },
            });
          } finally {
            clearInterval(coldStartTimer);
          }

          fullText += (fullText ? "\n\n" : "") + turnContent;
          if (turnThinking) {
            fullThinking += (fullThinking ? "\n\n" : "") + turnThinking;
          }

          // Bu turda üretilen araç çağrılarını yakala (düşünce kirliliği olmadan saf yanıt üzerinden!)
          const toolCalls = pluginManager.extractToolCalls(turnContent);
          if (toolCalls.length === 0) {
            // Model başka araç çağırmadı, yanıt tamamlandı!
            break;
          }

          enqueue(
            sseLine(
              "status",
              `🔧 [Adım ${iteration}] ${toolCalls.length} eklenti aracı çalıştırılıyor...`
            )
          );

          const toolResults: string[] = [];
          for (const call of toolCalls) {
            const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            let toolResult: { success: boolean; output: string };

            if (call.tool === "run_command") {
              const cmd = String(call.parameters.command || "");
              enqueue(sseLine("status", `⚡ Shell komutu çalıştırılıyor: $ ${cmd}`));
              enqueue(
                sseLine("terminal_task", {
                  id: taskId,
                  command: cmd,
                  status: "running",
                  output: "",
                  startedAt: new Date().toISOString(),
                })
              );

              const cwd = pluginContext.projectDir || process.cwd();
              toolResult = await runStreamingCommand(cmd, cwd, (chunk) => {
                enqueue(sseLine("terminal_chunk", { taskId, chunk }));
              });

              enqueue(
                sseLine("terminal_task", {
                  id: taskId,
                  command: cmd,
                  status: toolResult.success ? "completed" : "error",
                  output: toolResult.output,
                  startedAt: new Date().toISOString(),
                })
              );
            } else {
              enqueue(sseLine("status", `⚙️ [${call.tool}] çalıştırılıyor...`));
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

            // LLM'e giden özeti akıllı yönet: curl/HTML temizleme, hata durumunda tam stack trace, başarılıysa özet
            let llmOutputSummary = toolResult.output;
            if (call.tool === "run_command") {
              const isHtml =
                toolResult.output.includes("<!DOCTYPE") ||
                toolResult.output.includes("<html") ||
                toolResult.output.includes("<body");

              if (isHtml) {
                // curl ile çekilen HTML'i temizleyerek LLM'e ilet
                llmOutputSummary = stripHtml(toolResult.output).slice(0, 3000);
              } else if (!toolResult.success) {
                // HATA DURUMU: Derleyici/test hatasının tam satır ve stack trace'ini ilet
                llmOutputSummary = `[HATA VE LOG DETAYI]:\n${toolResult.output.slice(0, 4000)}`;
              } else {
                // BAŞARILI DURUM: Token tasarrufu için son 25 satırı özetle
                const lines = toolResult.output.trim().split("\n");
                if (lines.length > 25) {
                  llmOutputSummary = `(Komut başarıyla bitti, toplam ${lines.length} satır. Son 25 satır):\n${lines.slice(-25).join("\n")}`;
                }
              }
            } else if (llmOutputSummary.length > 18000) {
              llmOutputSummary = llmOutputSummary.slice(0, 18000) + "\n...(kısaltıldı — dosyanın geri kalanı için satır veya sembol filtrele)";
            }

            toolResults.push(
              `[ARAÇ: ${call.tool} | DURUM: ${toolResult.success ? "BAŞARILI" : "HATA"}]\n${llmOutputSummary}`
            );
          }

          // Tekrarlayan çağrı tespiti (Loop Detection): Eğer model aynı aracı arka arkaya çağırıyorsa uyar
          const recentCallsSig = toolCalls.map(c => `${c.tool}:${JSON.stringify(c.parameters)}`).join("|");
          const isLooping = previousCallsHistory.filter(h => h === recentCallsSig).length >= 2;
          previousCallsHistory.push(recentCallsSig);

          // Sonraki tur için LLM mesaj geçmişini güncelle
          enqueue(sseLine("status", "🤖 Araç çıktıları inceleniyor ve sonraki adıma geçiliyor..."));

          let guidance = "Araçlar başarıyla çalıştırıldı ve çıktılar kullanıcı ekranına canlı yansıtıldı.\n\n" +
            `Araç Özetleri:\n${toolResults.join("\n\n")}\n\n` +
            "ÖNEMLİ KURAL: Terminal veya dosya çıktılarını kullanıcıya tekrar kopyalayıp yazarak token harcama. Doğrudan bu sonuca göre sonraki komutu/aracı çalıştır veya eksiksiz kodlarını ve nihai yanıtını sun.";

          if (isLooping) {
            guidance += "\n\n⚠️ UYARI: Bu aracı ve parametreleri az önce zaten çalıştırdın! Aynı dosyayı veya aracı tekrar çağırma. Elde ettiğin verileri kullanarak hemen kodu düzelt veya kullanıcıya bulgularını sunarak görevi tamamla.";
          }

          if (iteration >= MAX_TOOL_ITERATIONS - 1) {
            guidance += "\n\n⚠️ DİKKAT: Maksimum araç adımı sınırına yaklaşıyorsun. Bu turda ARTIK BAŞKA ARAÇ ÇAĞIRMA. Bulgularını özetle ve kullanıcıya eksiksiz nihai yanıtını / düzeltilmiş kodları ver.";
          }

          currentMessages = [
            ...messages,
            { role: "assistant", content: turnContent },
            {
              role: "user",
              content: guidance,
            },
          ];
        }

        // Eğer döngü MAX_TOOL_ITERATIONS ile bittiyse ve model kullanıcıya açık bir yanıt vermemişse,
        // Yarıda kesilmemesi için son bir sentez turu çalıştır: Bulguları, yapılanları veya hataları özetlesin!
        const hasSubstantialText = fullText.replace(/```[\s\S]*?```/g, "").trim().length > 50;
        if (!hasSubstantialText && iteration >= MAX_TOOL_ITERATIONS) {
          enqueue(sseLine("status", "📝 Nihai değerlendirme ve özet hazırlanıyor..."));
          let finalTurnContent = "";
          try {
            await callLlm({
              messages: [
                ...messages,
                {
                  role: "user",
                  content: "Maksimum araç adımı sınırına ulaşıldı. Şimdiye kadar çalıştırdığın araçların çıktılarına göre tespit ettiğin sorunları, yaptığın veya yapılması gereken düzeltmeleri ve nihai durumu kullanıcıya eksiksiz, Türkçe ve net bir şekilde açıkla.",
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
              signal: req.signal,
              onToken: (token, type) => {
                if (type === "content") {
                  finalTurnContent += token;
                  enqueue(sseLine("content", token));
                }
              },
            });
            if (finalTurnContent.trim()) {
              fullText += (fullText ? "\n\n" : "") + finalTurnContent;
            }
          } catch {
            // ignore
          }
        }

        // Eğer hala boşsa güvenli bilgi mesajı düş
        if (!fullText.trim()) {
          const fallbackNotice = "✅ Araç incelemeleri tamamlandı. Tespit edilen durumlar ve dosya değişiklikleri kaydedildi.";
          fullText = fallbackNotice;
          enqueue(sseLine("content", fallbackNotice));
        }

        // ── 9. Yanıt analizi: kod blokları → diske yaz & git diff hesapla ─
        const extractedFiles: Array<{ path: string; content: string }> = [];
        const codeBlockRe = /```(?:\w*)\n([\s\S]*?)```/g;
        let blockMatch: RegExpExecArray | null;

        while ((blockMatch = codeBlockRe.exec(fullText)) !== null) {
          const rawCode = blockMatch[1];
          const lines = rawCode.split("\n");
          const firstLine = lines[0]?.trim() || "";

          // // filepath: src/foo.ts, // src/foo.ts, /* src/foo.css */, # src/foo.py vb.
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

        const editedFiles: FileDiffResult[] = [];
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
          } catch {
            // ignore write error
          }
        }

        if (editedFiles.length > 0) {
          enqueue(sseLine("file_changes", editedFiles));
          enqueue(
            sseLine(
              "status",
              `💾 ${editedFiles.length} dosya kaydedildi: ${editedFiles.map((e) => e.path).join(", ")}`
            )
          );
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
        const firstSentence = fullText.split(/[.!?\n]/)[0]?.trim();
        if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
          addEvent(actGroup, makeNoteEvent(firstSentence));
        }

        enqueue(sseLine("activity", actGroup));

        // ── 11. Devam Etme (Continuation) Tespiti ─────────────────────────
        const backtickCount = (fullText.match(/```/g) || []).length;
        const hasUnclosedFence = backtickCount % 2 !== 0;
        const askContinuation = /devam\s+etmemi\s+ister\s+misin|devam\s+edeyim\s+mi|devam\s+et\s+dersen|kaldığı\s+yerden\s+devam/i.test(fullText);

        if (hasUnclosedFence || askContinuation) {
          enqueue(
            sseLine("continue_prompt", {
              needed: true,
              message: hasUnclosedFence
                ? "Kod çıktısı token limitinde duraklatıldı. Devam etmek için butona tıklayın."
                : "Ajan sonraki adıma geçmek için hazır. Devam etmemi ister misin?",
            })
          );
        }

        // ── 12. Oturumu kaydet ────────────────────────────────────────────
        history.push({
          role: "assistant",
          content: fullText,
          thinking: fullThinking || undefined,
          editedFiles: editedFiles.length > 0 ? editedFiles : undefined,
          createdAt: new Date().toISOString(),
        });
        if (activeSessionId) await saveSessionHistory(activeSessionId, history);

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
              signal: req.signal,
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
              enqueue(sseLine("session_title_updated", { sessionId: activeSessionId, title: cleanTitle }));
            }
          } catch {
            // Başlık üretilemezse sorun değil
          }
        }

        if (/##PIPELINE_START##/i.test(fullText) || /##PIPELINE_START##/i.test(userPrompt)) {
          const reqMatch = /##PIPELINE_START##\s*([\s\S]*?)(?:##PIPELINE_END##|$)/i.exec(fullText) ||
                           /##PIPELINE_START##\s*([\s\S]*?)(?:##PIPELINE_END##|$)/i.exec(userPrompt);
          const requirement = reqMatch ? reqMatch[1].trim() : userPrompt;
          enqueue(sseLine("pipeline_start", { requirement }));
        }

        enqueue(sseLine("done", ""));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        enqueue(sseLine("error", message));
        enqueue(sseLine("done", ""));
      } finally {
        controller.close();
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
