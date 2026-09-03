"use client";

// src/components/MessageBubble.tsx
// Claude Code & Antigravity tarzı mesaj balonu:
// - Çoklu <think> blokları (işlem öncesi ve sonrası ayrı ayrı kronolojik gösterilir)
// - Canlı Shell / Terminal komut ve çıktı kartları
// - Dosya yazma / düzenleme kartları ve Git Diff özeti
// - Kopyala, Yeniden Dene, Geri Al aksiyon butonları

import { useState } from "react";
import { Bot, User, Loader2, Copy, Check, RotateCw, Undo2, FileCode, Play, Terminal } from "lucide-react";
import CodeBlock from "./CodeBlock";
import ThinkBlock from "./ThinkBlock";
import ToolCallBlock, { parseToolCall, EXPLORATION_TOOLS } from "./ToolCallBlock";
import ToolCallGroup from "./ToolCallGroup";
import FileChangesBlock, { EditedFile } from "./FileChangesBlock";
import WebSearchBlock from "./WebSearchBlock";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  statusNote?: string;
  editedFiles?: EditedFile[];
  sessionId?: string | null;
  projectName?: string | null;
  isLatest?: boolean;
  isStreaming?: boolean;
  onRetry?: () => void;
  onUndo?: () => void;
  onAction?: (actionText: string) => void;
}

function extractNextStepSuggestions(content: string): string[] {
  const suggestions: string[] = [];
  const nextStepsIdx = content.search(/##?\s*(?:💡\s*)?(?:Sonraki Adımlar|Önerilen Adımlar|Sıradaki Adımlar)/i);
  if (nextStepsIdx === -1) return [];

  const sectionText = content.slice(nextStepsIdx);
  const lines = sectionText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      const clean = trimmed
        .replace(/^[-*•]\s+/, "")
        .replace(/[?？!！]/g, "")
        .replace(/\b(?:ister misiniz|ekleyelim mi|yapalım mı|eklensin mi|ister misin)\b/gi, "")
        .trim();
      if (clean.length > 5 && clean.length < 80) {
        suggestions.push(clean);
      }
    }
  }
  return suggestions.slice(0, 3);
}

type Segment =
  | { type: "think"; value: string }
  | { type: "tool_call"; value: string }
  | { type: "tool_result"; value: string }
  | { type: "code"; value: string; lang: string; filePath?: string }
  | { type: "text"; value: string };

function parseSegments(content: string, topThinking?: string): Segment[] {
  const segments: Segment[] = [];

  // Eğer topThinking verilmişse ve content içinde hiç <think> yoksa en başa ekle
  if (topThinking && !content.includes("<think>")) {
    segments.push({ type: "think", value: topThinking });
  }

  // <think>...</think> veya ```lang\n...``` veya açık <think> etiketlerini eşleştir
  const combinedRe = /<think>([\s\S]*?)(?:<\/think>|$)|```([^\n]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = combinedRe.exec(content)) !== null) {
    if (m.index > lastIndex) {
      const textVal = content.slice(lastIndex, m.index);
      if (textVal.trim()) segments.push({ type: "text", value: textVal });
    }

    if (m[1] !== undefined) {
      // <think>...</think> bloğu
      const thinkVal = m[1].trim();
      if (thinkVal) {
        segments.push({ type: "think", value: thinkVal });
      }
    } else {
      // Kod veya Araç Bloğu
      const rawLang = (m[2] || "").trim().toLowerCase();
      const codeVal = m[3] || "";

      // Eğer araç çağrısı ise (tool_call, json:tool_call, tool) veya içeriği {"tool": ...} ise
      const isToolCall =
        rawLang === "tool_call" ||
        rawLang === "json:tool_call" ||
        rawLang === "tool-call" ||
        rawLang === "tool" ||
        rawLang.startsWith("tool_") ||
        codeVal.trim().startsWith('{"tool":') ||
        codeVal.trim().startsWith('{\n  "tool":') ||
        codeVal.trim().startsWith('{\n "tool":');

      if (rawLang === "tool_result" || rawLang === "result") {
        segments.push({ type: "tool_result", value: codeVal });
      } else if (isToolCall) {
        segments.push({ type: "tool_call", value: codeVal });
      } else if (rawLang === "text" || rawLang === "markdown" || rawLang === "md") {
        // Metin olarak etiketlenmiş normal açıklamaları kod kutusu yerine akıcı metin olarak göster
        segments.push({ type: "text", value: codeVal });
      } else {
        // İlk satırdan dosya adını tespit et (Örn: // src/app/page.tsx veya // filepath: ...)
        const firstLine = codeVal.split("\n")[0]?.trim() || "";
        const fileMatch =
          /^(?:\/\/\s*(?:filepath:\s*)?|\/\*\s*(?:filepath:\s*)?|#\s*(?:filepath:\s*)?)([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/.exec(
            firstLine
          );
        const filePath = fileMatch ? fileMatch[1] : undefined;

        segments.push({
          type: "code",
          lang: rawLang || "text",
          value: codeVal,
          filePath,
        });
      }
    }
    lastIndex = combinedRe.lastIndex;
  }

  if (lastIndex < content.length) {
    const textVal = content.slice(lastIndex);
    if (textVal.trim()) segments.push({ type: "text", value: textVal });
  }

  return segments;
}


type RenderItem =
  | Segment
  | { type: "tool_group"; items: string[] }
  | { type: "web_search"; query: string; resultText: string };

function groupExplorationSegments(segments: Segment[]): RenderItem[] {
  const result: RenderItem[] = [];
  let currentRun: string[] = [];

  const flushRun = () => {
    if (currentRun.length === 0) return;
    result.push({ type: "tool_group", items: currentRun });
    currentRun = [];
  };

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === "tool_call") {
      const { tool, params } = parseToolCall(seg.value);
      if (tool === "web_search") {
        flushRun();
        let resultText = "";
        if (i + 1 < segments.length && segments[i + 1].type === "tool_result") {
          resultText = segments[i + 1].value;
          i++; // sonraki tool_result'ı WebSearchBlock içine dahil et
        }
        result.push({
          type: "web_search",
          query: String(params.query || "Web Araması"),
          resultText,
        });
        continue;
      }
      if (EXPLORATION_TOOLS.has(tool)) {
        currentRun.push(seg.value);
        continue;
      }
    }
    if (seg.type === "tool_result" && currentRun.length > 0) {
      continue;
    }
    flushRun();
    result.push(seg);
  }
  flushRun();
  return result;
}

export default function MessageBubble({
  role,
  content,
  thinking,
  statusNote,
  editedFiles,
  sessionId,
  projectName,
  isLatest,
  isStreaming,
  onRetry,
  onUndo,
  onAction,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";
  const renderItems = groupExplorationSegments(parseSegments(content, thinking));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className={`group flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Profil İkonu */}
      <div
        className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-md ${
          isUser
            ? "bg-gray-800 border border-gray-700 text-gray-200"
            : "bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-cyan-900/20"
        }`}
      >
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      <div className={`max-w-[88%] ${isUser ? "items-end" : "items-start"} flex flex-col min-w-0`}>
        {/* Canlı Adım Notu (Image 2 Tarzı) */}
        {!isUser && statusNote && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-xs font-mono animate-in fade-in">
            {isStreaming ? (
              <Loader2 size={12} className="animate-spin text-cyan-400 shrink-0" />
            ) : (
              <Check size={12} className="text-emerald-400 shrink-0" />
            )}
            <span className="truncate max-w-lg">{statusNote}</span>
          </div>
        )}

        {/* Mesaj Gövdesi */}
        <div
          className={`text-sm leading-relaxed prose-chat w-full ${
            isUser
              ? "bg-[#1c1e27] text-gray-100 border border-gray-800/80 rounded-2xl rounded-tr-none px-4 py-2.5 shadow-sm"
              : "text-gray-200"
          }`}
        >
          {renderItems.map((seg, i) => {
            if (seg.type === "tool_group") {
              return <ToolCallGroup key={i} items={seg.items.map((v) => ({ rawContent: v }))} />;
            }

            if (seg.type === "web_search") {
              return (
                <WebSearchBlock
                  key={i}
                  query={seg.query}
                  resultText={seg.resultText}
                  isStreaming={isStreaming && i === renderItems.length - 1}
                />
              );
            }

            if (seg.type === "think") {
              return (
                <ThinkBlock
                  key={i}
                  content={seg.value}
                  isStreaming={isStreaming && i === renderItems.length - 1}
                />
              );
            }

            if (seg.type === "tool_call") {
              return <ToolCallBlock key={i} rawContent={seg.value} />;
            }

            if (seg.type === "tool_result") {
              return <ToolCallBlock key={i} rawContent={seg.value} isResult />;
            }

            if (seg.type === "code") {
              return (
                <div key={i} className="my-2">
                  {seg.filePath && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-xl bg-gray-900 border-t border-x border-gray-800 text-cyan-300 text-xs font-mono">
                      <FileCode size={13} className="text-cyan-400" />
                      <span className="font-semibold text-gray-200">{seg.filePath}</span>
                    </div>
                  )}
                  <CodeBlock code={seg.value} lang={seg.lang} />
                </div>
              );
            }

            return (
              <div key={i} className="whitespace-pre-wrap my-1 text-gray-200 leading-relaxed font-sans">
                {seg.value}
                {isStreaming && i === renderItems.length - 1 && (
                  <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 align-middle animate-pulse" />
                )}
              </div>
            );
          })}

          {/* Eğer henüz hiçbir şey gelmediyse ama yayın devam ediyorsa "Working." göster */}
          {!isUser && isStreaming && renderItems.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400 font-sans py-1">
              <span>Working</span>
              <span className="inline-block w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
            </div>
          )}

          {/* Değiştirilen Dosyalar Kartı (Git Diff Özeti) */}
          {!isUser && editedFiles && editedFiles.length > 0 && (
            <FileChangesBlock files={editedFiles} sessionId={sessionId} />
          )}

          {/* Hızlı Eylem Çipleri: Projeyi Çalıştır, Doğrula, Dosyaları Listele & Akıllı Öneriler */}
          {!isUser && !isStreaming && onAction && (() => {
            const hasEditedFiles = editedFiles && editedFiles.length > 0;
            const hasRunCmd = content.includes("npm run dev") || content.includes("npm start") || content.includes("yarn dev");
            const hasDelivery = content.includes("Nasıl Çalıştırılır") || content.includes("Tamamlanan İşlemler") || content.includes("Sonraki Adımlar");
            const hasTscCmd = content.includes("npx tsc") || content.includes("npm run build");
            const showChips = hasEditedFiles || hasRunCmd || hasDelivery || hasTscCmd;
            if (!showChips) return null;
            const suggestions = extractNextStepSuggestions(content);
            return (
              <div className="mt-3 pt-2.5 border-t border-gray-800/80 flex flex-wrap items-center gap-2">
                {(hasRunCmd || hasDelivery || hasEditedFiles) && (
                  <button
                    type="button"
                    onClick={() => onAction("Projeyi çalıştır ve durumunu kontrol et")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-700/50 hover:border-cyan-500 text-cyan-200 text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer select-none"
                    title="Projeyi terminalde çalıştır"
                  >
                    <Play size={12} className="text-cyan-400 fill-cyan-400" />
                    <span>Projeyi Çalıştır</span>
                  </button>
                )}

                {(hasTscCmd || hasEditedFiles) && (
                  <button
                    type="button"
                    onClick={() => onAction("npx tsc --noEmit ile syntax ve TypeScript kontrolü yap")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/40 hover:bg-purple-900/60 border border-purple-700/50 hover:border-purple-500 text-purple-200 text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer select-none"
                    title="TypeScript doğrulaması başlat"
                  >
                    <Terminal size={12} className="text-purple-400" />
                    <span>Doğrula (npx tsc)</span>
                  </button>
                )}

                {hasEditedFiles && (
                  <button
                    type="button"
                    onClick={() => onAction("Oluşturulan dosyaları ve mimariyi özetle")}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-900/80 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer select-none"
                    title="Dosyaları ve mimariyi listele"
                  >
                    <FileCode size={12} className="text-gray-400" />
                    <span>Dosyaları Listele</span>
                  </button>
                )}

                {/* Sonraki Adımlardan Otomatik Çıkarılan Akıllı Öneri Çipleri */}
                {suggestions.map((sug, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onAction(sug)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-950/30 hover:bg-blue-900/50 border border-blue-800/40 hover:border-blue-700 text-blue-200 text-xs font-medium transition-all shadow-sm active:scale-95 cursor-pointer select-none"
                    title={sug}
                  >
                    <span className="truncate max-w-[220px]">{sug}</span>
                  </button>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Butonlar: Kopyala, Yeniden Dene, Geri Al */}
        {!isStreaming && (
          <div
            className={`mt-1.5 flex items-center gap-1.5 text-xs text-gray-400 opacity-80 group-hover:opacity-100 transition-opacity ${
              isUser ? "flex-row-reverse" : ""
            }`}
          >
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-800/80 hover:text-gray-200 transition-colors"
              title="Mesajı Kopyala"
            >
              {copied ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span className="text-[11px] text-emerald-400 font-medium">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span className="text-[11px]">Kopyala</span>
                </>
              )}
            </button>

            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-800/80 hover:text-cyan-300 transition-colors"
                title="Yeniden Dene"
              >
                <RotateCw size={13} />
                <span className="text-[11px]">Yeniden Dene</span>
              </button>
            )}

            {onUndo && (
              <button
                onClick={onUndo}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-800/80 hover:text-amber-300 transition-colors"
                title="Geri Al"
              >
                <Undo2 size={13} />
                <span className="text-[11px]">Geri Al</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
