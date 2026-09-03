// src/app/api/chat/route.ts
// Koordinatör sohbeti — SSE streaming & Plugin Tool Calling.
// DeepSeek Harness mimarisinde olduğu gibi aktif eklentileri (web, git, fs, codebase, terminal)
// sistem promptuna enjekte eder, model araç çağırdığında çalıştırıp nihai sonucu üretir.

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
  estimateTokens,
} from "@/lib/coordinator";
import { webSearch, formatSearchResultsForLLM } from "@/lib/webSearch";
import { buildCodebaseMap, formatMapForLLM } from "@/lib/codebaseMap";
import { pluginManager } from "@/lib/plugins/pluginManager";
import { runStreamingCommand, getCoordinatorPort } from "@/lib/plugins/builtins/terminalPlugin";
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
export const dynamic = "force-dynamic";

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
  const projectDirParam: string | undefined = body.projectDir;

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
    session = await createSession(cleanTitle, slug, projectDirParam || undefined);
    activeSessionId = session.session_id;
    isNewlyCreated = true;
  }

  const history: ChatMessage[] = session ? [...session.conversation_history] : [];
  history.push({ role: "user", content: userPrompt, createdAt: new Date().toISOString() });
  if (activeSessionId) {
    await saveSessionHistory(activeSessionId, history);
  }

  const workspaceRoot = path.resolve(process.cwd(), "..");
  const rawProjectDir = session?.project_dir?.trim() || "";
  const hasExplicitProject = Boolean(
    rawProjectDir &&
    rawProjectDir !== workspaceRoot &&
    !rawProjectDir.includes(path.join("data", "projects"))
  );
  const projectDir = hasExplicitProject ? rawProjectDir : "";

  const stream = new ReadableStream({
    async start(controller) {
      // ── ÖNEMLİ ──────────────────────────────────────────────────────────
      // Kullanıcı F5 basar, sekmeyi kapatır veya "Durdur" butonuna basarsa
      // tarayıcı bu SSE bağlantısını koparır ve Next.js bu controller'ı
      // kapatır — AMA aşağıdaki agent döngüsü (LLM çağrıları, araç/terminal
      // komutları) ASENKRON olarak çalışmaya devam eder ve `enqueue` çağırmayı
      // sürdürür. Eskiden bu durumda `controller.enqueue` "Invalid state:
      // Controller is already closed" hatası fırlatıyordu; bu hata try/catch
      // dışına sızıp tüm agent turunu (ve turun sonundaki `saveSessionHistory`
      // çağrısını!) yarıda kesiyordu — kullanıcının gördüğü "yazılan metinler
      // kayboluyor" hatasının asıl kaynağı buydu. Artık kapalı bağlantıya
      // yazma denemesi sessizce yutuluyor; agent turu normal şekilde sonuna
      // kadar çalışıp oturuma kaydediliyor, kullanıcı sayfayı yeniden
      // açtığında yanıtı orada bulabiliyor.
      let clientClosed = false;
      const enqueue = (s: string) => {
        if (clientClosed) return;
        try {
          controller.enqueue(new TextEncoder().encode(s));
        } catch {
          clientClosed = true;
        }
      };

      if (isNewlyCreated && activeSessionId && session) {
        enqueue(
          sseLine("session_created", {
            sessionId: activeSessionId,
            title: session.title,
          })
        );
      }

      // İlk mesajda hemen hızlı ve anlamlı bir oturum başlığı belirle ve arayüze bildir
      if (
        activeSessionId &&
        session &&
        (session.title === "Yeni Oturum" ||
         session.title.startsWith("yeni_proje") ||
         session.conversation_history.length <= 1)
      ) {
        const quickWords = userPrompt.trim().replace(/["'#*`\n\.]/g, "").split(/\s+/).slice(0, 5).join(" ");
        const quickTitle = quickWords.slice(0, 40);
        if (quickTitle && quickTitle.length > 2) {
          updateSessionTitle(activeSessionId, quickTitle).catch(() => {});
          enqueue(sseLine("session_title_updated", { sessionId: activeSessionId, title: quickTitle }));
        }
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

      let fullAssembledContent = "";
      let fullThinking = "";
      const editedFiles: FileDiffResult[] = [];

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

          const callBlock = `\`\`\`tool_call\n${JSON.stringify({ tool: "web_search", parameters: { query } }, null, 2)}\n\`\`\``;
          const resultBlock = `\`\`\`tool_result\n${directSearchContext}\n\`\`\``;
          enqueue(sseLine("content", `${callBlock}\n\n${resultBlock}\n\n`));
          fullAssembledContent = (fullAssembledContent ? fullAssembledContent + "\n\n" : "") + `${callBlock}\n\n${resultBlock}\n\n`;

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

              const callBlock = `\`\`\`tool_call\n${JSON.stringify({ tool: "web_search", parameters: { query: autoQuery } }, null, 2)}\n\`\`\``;
              const resultBlock = `\`\`\`tool_result\n${directSearchContext}\n\`\`\``;
              enqueue(sseLine("content", `${callBlock}\n\n${resultBlock}\n\n`));
              fullAssembledContent = (fullAssembledContent ? fullAssembledContent + "\n\n" : "") + `${callBlock}\n\n${resultBlock}\n\n`;

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
        const projectName = projectDir ? path.basename(projectDir) : "";
        const projectContext = projectDir
          ? `AKTİF ÇALIŞMA DİZİNİ (PROJE): ${projectDir} (Proje Adı: ${projectName})\n` +
            `⚠️ PORT UYARISI: Bu koordinatör uygulamasının KENDİSİ port ${getCoordinatorPort()} üzerinde çalışıyor. ` +
            `Bir sunucuyu yeniden başlatman/durdurman gerektiğinde ASLA bu portu hedefleme — kendi sürecini kapatıp sohbeti kesintiye uğratırsın. ` +
            `Üzerinde çalıştığın PROJENİN portu farklıdır (genelde projenin package.json'daki "dev"/"start" script'inde -p/--port ile belirtilir, belirtilmemişse framework varsayılanı geçerlidir); ` +
            `port'a özel bir "kill" komutu çalıştırmadan önce daima o projenin gerçek portunu tespit et ve SADECE onu hedefle.`
          : `⚠️ DİKKAT: AKTİF BİR PROJE KLASÖRÜ SEÇİLMEDİ (GENEL SOHBET MODU):\n` +
            `- Kullanıcı şu anda belirli bir proje dizininde değil, genel bağımsız sohbet modundadır.\n` +
            `- Kullanıcı senden bir uygulama yapmanı, proje oluşturmanı veya dosya yazmanı isterse: KESİNLİKLE rastgele bir dizinde (${workspaceRoot} vb.) komut çalıştırma!\n` +
            `- Kullanıcıya hemen: "Bu projeyi hangi klasörde (örn. sol menüdeki projelerinizden biri veya yeni bir klasör yolu) oluşturmamı istersiniz?" şeklinde açıkça sor ve dizin onayı almadan dosya oluşturma/komut çalıştırma.`;

        const baseSystemPrompt = buildSystemPrompt({
          coordinatorName: settings.coordinator_name,
          executionMode: settings.execution_mode,
          projectContextText: projectContext,
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

        // "devam et" / "continue" tespiti:
        const CONTINUATION_RE = /^(?:devam|devam\s*et|devamını\s*getir|continue|next|sıradaki|surdur)\b/i;
        if (CONTINUATION_RE.test(userPrompt.trim())) {
          const lastAssistant = [...trimmedHistory].reverse().find((m) => m.role === "assistant");
          const lastContent = lastAssistant?.content || "";
          const backtickCount = (lastContent.match(/```/g) || []).length;
          const hadUnclosedFence = backtickCount % 2 !== 0;

          if (hadUnclosedFence) {
            messages.push({
              role: "system",
              content: `[ÖZEL TALİMAT: KESİNTİSİZ KOD VE METİN TAMAMLAMA]\nÖnceki cevabın model token/bağlam limitine ulaştığı için kod bloğunun veya cümlenin ortasında kesildi. KESİNLİKLE baştan başlama, 'Tabii ki devam ediyorum' gibi gereksiz selam veya giriş cümleleri yazma. Tam olarak yarıda kaldığın son karakterden/satırdan itibaren açık kalan bloğu ve cevabı kesintisiz tamamla.`,
            });
          } else {
            messages.push({
              role: "system",
              content: `[ÖZEL TALİMAT: DEVAM ETME MODU]\nKullanıcı projenin/görevin kaldığı yerden devam etmesini istedi. Konuşma geçmişindeki oluşturulan dosyaları ve yapılan işlemleri incele. Eksik kalan kısımları, yeni özellikleri veya test adımlarını tespit ederek doğrudan uygulamaya ve kodlamaya devam et. Asla baştan başlama veya ne yapacağını sorma; doğrudan sonraki somut adımı uygula.`,
            });
          }
        }

        const sysTokens = estimateTokens(systemPrompt);
        const histTokens = trimmedHistory.reduce((acc, m) => acc + estimateTokens(m.content), 0);
        const totalUsedTokens = sysTokens + histTokens;
        const contextPercent = Math.min(100, Math.round((totalUsedTokens / contextWindow) * 100));

        // Kullanıcı arayüzüne token/context doluluk durumunu bildir
        enqueue(
          sseLine("context_status", {
            usedTokens: totalUsedTokens,
            maxTokens: contextWindow,
            percent: contextPercent,
          })
        );
        if (contextPercent >= 75) {
          enqueue(
            sseLine(
              "status",
              `⚠️ Context penceresi %${contextPercent} doluluğa ulaştı. Dinamik bütçeleme aktif, eski adımlar özetleniyor.`
            )
          );
        }

        // ── 7. Çok Adımlı Otonom Ajan Döngüsü (Multi-Step Agent Loop) ───
        const requestedMaxTokens = settings.max_tokens ? Math.max(settings.max_tokens, 8192) : 8192;
        fullAssembledContent = "";
        fullThinking = "";
        let currentMessages: ChatMessage[] = [...messages];
        const MAX_TOOL_ITERATIONS = 8;
        let iteration = 0;
        let executedAnyTool = false;
        let finalAnswerProduced = false;
        let hitTokenLimit = false;

        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration++;
          let turnContent = "";
          let turnThinking = "";
          let hasStartedThink = false;
          let hasClosedThink = false;

          await callLlm({
            messages: currentMessages,
            model: effectiveModel,
            apiBase: provider.api_base,
            apiKey,
            temperature: settings.temperature,
            maxTokens: requestedMaxTokens,
            thinkMode: settings.think_mode,
            warmup: settings.warmup,
            signal: req.signal,
            onFinish: (reason) => {
              if (reason === "length") hitTokenLimit = true;
            },
            onToken: (token, type) => {
              if (type === "thinking") {
                turnThinking += token;
                if (!hasStartedThink) {
                  hasStartedThink = true;
                  enqueue(sseLine("content", `<think>\n`));
                }
                enqueue(sseLine("content", token));
              } else if (type === "content") {
                if (hasStartedThink && !hasClosedThink) {
                  hasClosedThink = true;
                  enqueue(sseLine("content", `\n</think>\n\n`));
                }
                turnContent += token;
                enqueue(sseLine("content", token));
              }
            },
          });

          if (hasStartedThink && !hasClosedThink) {
            hasClosedThink = true;
            enqueue(sseLine("content", `\n</think>\n\n`));
          }

          // Bu turda üretilen araç çağrılarını yakala
          let toolCalls = pluginManager.extractToolCalls(turnContent);

          // EĞER model araç çağrısını <think> içine gömdüyse (Qwen modelleri bazen düşünürken araç üretir):
          if (toolCalls.length === 0 && (turnThinking.includes('"tool"') || turnThinking.includes("tool_call"))) {
            const thinkCalls = pluginManager.extractToolCalls(turnThinking);
            if (thinkCalls.length > 0) {
              toolCalls = thinkCalls;
              // Tool çağrısı metnini bul ve düşünceden çıkarıp turnContent'e aktar
              const toolBlockRe = /```(?:tool_call|json:tool_call|tool)?\n?\{[\s\S]*?"(?:tool|function)"[\s\S]*?\}\n?```/g;
              const matches = turnThinking.match(toolBlockRe);
              if (matches) {
                turnThinking = turnThinking.replace(toolBlockRe, "").trim();
                turnContent = (turnContent ? turnContent + "\n\n" : "") + matches.join("\n\n");
                enqueue(sseLine("content", `\n\n${matches.join("\n\n")}\n\n`));
              } else {
                const bareCallsStr = thinkCalls.map((c) => "```tool_call\n" + JSON.stringify(c, null, 2) + "\n```").join("\n\n");
                turnContent = (turnContent ? turnContent + "\n\n" : "") + bareCallsStr;
                enqueue(sseLine("content", `\n\n${bareCallsStr}\n\n`));
              }
            }
          }

          let stepBlock = "";
          if (turnThinking.trim()) {
            stepBlock += `<think>\n${turnThinking.trim()}\n</think>\n\n`;
            fullThinking += (fullThinking ? "\n\n" : "") + turnThinking.trim();
          }
          if (turnContent.trim()) {
            stepBlock += turnContent.trim();
          }
          if (stepBlock) {
            fullAssembledContent += (fullAssembledContent ? "\n\n" : "") + stepBlock;
          }

          if (toolCalls.length === 0) {
            // Model başka araç çağırmadıysa, gerçekten kullanıcıya yönelik bir açıklama üretti mi kontrol et
            const cleanUserText = turnContent
              .replace(/```(?:tool_call|json:tool_call|tool)[\s\S]*?```/gi, "")
              .replace(/```tool_result[\s\S]*?```/gi, "")
              .trim();
            if (cleanUserText.length > 20) {
              finalAnswerProduced = true;
            }
            break;
          }

          executedAnyTool = true;

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
              toolResult = await runStreamingCommand(
                cmd,
                cwd,
                (chunk) => {
                  enqueue(sseLine("terminal_chunk", { taskId, chunk }));
                },
                taskId,
                activeSessionId
              );

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
                // curl ile çekilen HTML'i script/style/svg çöplerinden arındırarak hızlı ve temiz ilet
                llmOutputSummary = toolResult.output
                  .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                  .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
                  .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 3000);
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
            } else if (llmOutputSummary.length > 3000) {
              llmOutputSummary = llmOutputSummary.slice(0, 3000) + "\n...(kısaltıldı)";
            }

            toolResults.push(
              `[ARAÇ: ${call.tool} | DURUM: ${toolResult.success ? "BAŞARILI" : "HATA"}]\n${llmOutputSummary}`
            );

            // Kullanıcı arayüzüne de araç sonucunu aktar (böylece WebSearchBlock veya ToolCallBlock sonuçları görünür)
            const toolResultFormatted = `\`\`\`tool_result\n${toolResult.output}\n\`\`\``;
            enqueue(sseLine("content", `\n\n${toolResultFormatted}\n\n`));
            fullAssembledContent = (fullAssembledContent ? fullAssembledContent + "\n\n" : "") + toolResultFormatted;
          }

          // Sonraki tur için LLM mesaj geçmişini düzenli çok adımlı formatta güncelle:
          // Her adımın araç çağrısı ve o araçların sonuçları geçmişe ardışık eklenir.
          currentMessages.push({
            role: "assistant",
            content: turnContent,
          });
          const isCreationRequest = /yap|oluştur|yaz|geliştir|kur|kod|proje|uygulama|tasarla|sayfa/i.test(userPrompt);
          const feedbackRule = isCreationRequest
            ? `ÖNEMLİ KURALLAR:
1. İLETİŞİM & ŞEFFAFLIK: Kullanıcıya hangi adımda olduğunu ve sıradaki eylemini 1-2 cümleyle açıkla (Örn: "Paketler kuruldu, şimdi Todo sayfasının kodlarını yazıyorum..."). Sakın sadece sessizce araç çağırma!
2. KOD ÜRETİMİ: Eğer paket kurulumu bittiyse ve kodlar henüz yazılmadıysa, istenen uygulamanın çalışan kaynak kodlarını (dosya yolu etiketli eksiksiz kod blokları halinde: \`\`\`typescript\n// src/app/page.tsx\n...\`\`\`) MUTLAKA üret. İşi sadece npm install ile yarım bırakma.
3. TÜM ADIMLAR BİTTİYSE: Başka araca gerek kalmadıysa ASLA yeni araç çağırma. Kullanıcıya 1) Yapılan işlemleri, 2) Dosya yollarını, 3) Terminal çalıştırma komutunu ('npm run dev') ve 4) Sonraki Adımları (Yeni bir özellik veya soru için hazır olduğunu) içeren Türkçe nihai teslim raporunu sun.`
            : `ÖNEMLİ KURAL: Yukarıdaki araç çıktılarını incele. Başka bir araca kesinlikle ihtiyaç yoksa veya yeterli bilgiye ulaştıysan ASLA yeni bir araç çağırma; kullanıcıya doğrudan net, detaylı ve Türkçe nihai yanıtını sun.`;

          currentMessages.push({
            role: "user",
            content: `[ARAÇ ÇIKTILARI (Adım ${iteration})]:\n\n${toolResults.join(
              "\n\n"
            )}\n\n${feedbackRule}`,
          });

          enqueue(sseLine("status", "🤖 Araç çıktıları inceleniyor ve sonraki adıma geçiliyor..."));
        }

        // ── 8. Zorunlu Nihai Sentez (Eğer araç çalıştırıldı ve henüz kullanıcıya nihai yanıt verilmediyse) ──
        if (executedAnyTool && !finalAnswerProduced) {
          enqueue(sseLine("status", "📝 Araç çıktıları derleniyor ve nihai teslim raporu hazırlanıyor..."));
          const isCreationRequest = /yap|oluştur|yaz|geliştir|kur|kod|proje|uygulama|tasarla|sayfa/i.test(userPrompt);
          const synthInstruction = isCreationRequest
            ? `Tüm araç adımları tamamlandı. Artık KESİNLİKLE hiçbir araç çağırma (\`tool_call\` üretme).
Kullanıcıya projeyi teslim etmek üzere MUTLAKA şu 4 bölümü içeren samimi, net ve eksiksiz bir Türkçe kapanış raporu sun:
1) ✅ **Tamamlanan İşlemler**: Neler yapıldı ve kuruldu?
2) 📁 **Oluşturulan/Düzenlenen Dosyalar**: Dosya yolları ve içerikleri (ne işe yaradıkları).
3) 🚀 **Nasıl Çalıştırılır**: Terminal komutları (örn. \`cd <klasör> && npm run dev\`) ve tarayıcı adresi.
4) 💡 **Sonraki Adımlar**: Projeyi geliştirmek veya yeni bir özellik eklemek isterse yardımcı olabileceğini belirten profesyonel bir kapanış.`
            : `Araç çalıştırma adımları tamamlandı. Artık KESİNLİKLE hiçbir araç çağırma (\`tool_call\` üretme). Yukarıda elde ettiğin tüm bilgileri toplayarak kullanıcıya doğrudan, net, kapsamlı ve Türkçe nihai yanıtını sun. Cümleleri asla iki nokta (:) ile havada bırakma.`;

          currentMessages.push({
            role: "user",
            content: synthInstruction,
          });

          let synthContent = "";
          let synthThinking = "";
          let synthStartedThink = false;
          let synthClosedThink = false;

          await callLlm({
            messages: currentMessages,
            model: effectiveModel,
            apiBase: provider.api_base,
            apiKey,
            temperature: settings.temperature,
            maxTokens: requestedMaxTokens,
            thinkMode: settings.think_mode,
            warmup: settings.warmup,
            signal: req.signal,
            onFinish: (reason) => {
              if (reason === "length") hitTokenLimit = true;
            },
            onToken: (token, type) => {
              if (type === "thinking") {
                synthThinking += token;
                if (!synthStartedThink) {
                  synthStartedThink = true;
                  enqueue(sseLine("content", `\n\n<think>\n`));
                }
                enqueue(sseLine("content", token));
              } else if (type === "content") {
                if (synthStartedThink && !synthClosedThink) {
                  synthClosedThink = true;
                  enqueue(sseLine("content", `\n</think>\n\n`));
                }
                synthContent += token;
                enqueue(sseLine("content", token));
              }
            },
          });

          if (synthStartedThink && !synthClosedThink) {
            enqueue(sseLine("content", `\n</think>\n\n`));
          }

          let synthBlock = "";
          if (synthThinking.trim()) {
            synthBlock += `<think>\n${synthThinking.trim()}\n</think>\n\n`;
            fullThinking += (fullThinking ? "\n\n" : "") + synthThinking.trim();
          }
          if (synthContent.trim()) {
            synthBlock += synthContent.trim();
          }
          if (synthBlock) {
            fullAssembledContent += (fullAssembledContent ? "\n\n" : "") + synthBlock;
          }
        }

        const fullText = fullAssembledContent;

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

        editedFiles.length = 0;
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
        // SADECE VE SADECE model gerçekten token sınırına takıldıysa (hitTokenLimit === true)
        // VEYA çok adımlı araç döngüsü limite takılıp henüz nihai yanıt verilemediyse (reachedMaxIterationsIncomplete === true):
        // Model doğal olarak durduysa (finishReason === "stop" -> hitTokenLimit === false),
        // yanıttaki herhangi bir tekil backtick veya markdown formatlama hatası asla bir token kesintisi değildir!
        const backtickCount = (fullText.match(/```/g) || []).length;
        const hasUnclosedFence = backtickCount % 2 !== 0;
        const reachedMaxIterationsIncomplete = iteration >= MAX_TOOL_ITERATIONS && !finalAnswerProduced;
        const isTruncated = hitTokenLimit;

        if (isTruncated || reachedMaxIterationsIncomplete) {
          enqueue(
            sseLine("continue_prompt", {
              needed: true,
              message: hasUnclosedFence
                ? "Kod çıktısı modelin token/bağlam sınırına ulaştığı için yarıda kesildi. Kaldığı yerden devam etmek için tıklayın."
                : (hitTokenLimit
                  ? "Yanıt modelin çıktı token sınırına ulaştığı için yarıda kesildi. Kaldığı yerden devam etmek için tıklayın."
                  : "İşlem adım sınırına ulaştı ve yarıda kaldı. Devam etmek için tıklayın."),
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
              maxTokens: 25,
              thinkMode: false,
              warmup: settings.warmup,
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
        // Hata veya bağlantı kopması olsa bile o ana kadar üretilen içeriği oturuma kaydet!
        if (fullAssembledContent && activeSessionId) {
          try {
            history.push({
              role: "assistant",
              content: fullAssembledContent,
              thinking: fullThinking || undefined,
              editedFiles: editedFiles.length > 0 ? editedFiles : undefined,
              createdAt: new Date().toISOString(),
            });
            await saveSessionHistory(activeSessionId, history);
          } catch {
            // ignore save error
          }
        }
        const message = err instanceof Error ? err.message : "Bilinmeyen hata";
        enqueue(sseLine("error", message));
        enqueue(sseLine("done", ""));
      } finally {
        if (!clientClosed) {
          try {
            controller.close();
          } catch {
            // zaten kapanmış olabilir, sorun değil
          }
        }
      }
    },
    cancel() {
      // Tarayıcı bağlantıyı kapattığında (F5, sekme kapama, stop) çağrılır.
      // Not: burada agent döngüsünü veya terminal alt sürecini KASITLI olarak
      // öldürmüyoruz — amaç, komutun/ajanın arka planda tamamlanabilmesi ve
      // sonucun oturuma kaydedilebilmesi (bkz. yukarıdaki `enqueue` notu).
      // Çalışan bir terminal görevini gerçekten durdurmak isteyen kullanıcı
      // Terminal panelindeki "Sonlandır" butonunu kullanmalı.
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
