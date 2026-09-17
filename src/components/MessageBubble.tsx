"use client";

// src/components/MessageBubble.tsx
// Claude Code & Antigravity tarzı mesaj balonu:
// - Çoklu <think> blokları (işlem öncesi ve sonrası ayrı ayrı kronolojik gösterilir)
// - Canlı Shell / Terminal komut ve çıktı kartları
// - Dosya yazma / düzenleme kartları ve Git Diff özeti
// - Kopyala, Yeniden Dene, Geri Al aksiyon butonları

import { useState } from "react";
import { Bot, User, Loader2, Copy, Check, RotateCw, Undo2, FileCode } from "lucide-react";
import CodeBlock from "./CodeBlock";
import ThinkBlock from "./ThinkBlock";
import ToolCallBlock from "./ToolCallBlock";
import FileChangesBlock, { EditedFile } from "./FileChangesBlock";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  statusNote?: string;
  editedFiles?: EditedFile[];
  sessionId?: string | null;
  isStreaming?: boolean;
  onRetry?: () => void;
  onUndo?: () => void;
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

      if (isToolCall) {
        segments.push({ type: "tool_call", value: codeVal });
      } else if (rawLang === "tool_result") {
        segments.push({ type: "tool_result", value: codeVal });
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


export default function MessageBubble({
  role,
  content,
  thinking,
  statusNote,
  editedFiles,
  sessionId,
  isStreaming,
  onRetry,
  onUndo,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === "user";
  const segments = parseSegments(content, thinking);

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
        {/* Canlı Adım Notu (Araç çalıştırma veya ek adımlarda) */}
        {!isUser && statusNote && segments.length > 0 && (
          <div className="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-300 text-xs font-mono animate-in fade-in">
            <Loader2 size={12} className="animate-spin text-cyan-400" />
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
          {segments.map((seg, i) => {
            if (seg.type === "think") {
              return (
                <ThinkBlock
                  key={i}
                  content={seg.value}
                  isStreaming={isStreaming && i === segments.length - 1}
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
                {isStreaming && i === segments.length - 1 && (
                  <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 align-middle animate-pulse" />
                )}
              </div>
            );
          })}

          {/* Eğer henüz hiçbir şey gelmediyse ama yayın devam ediyorsa "Working" veya Canlı Cold-Start uyarısı göster */}
          {!isUser && isStreaming && segments.length === 0 && (
            <div className="flex items-center gap-2 text-xs font-sans py-1">
              {statusNote ? (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-800/50 text-cyan-300 font-mono animate-in fade-in">
                  <Loader2 size={13} className="animate-spin text-cyan-400 shrink-0" />
                  <span>{statusNote}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-gray-400">
                  <span>Working</span>
                  <span className="inline-block w-1 h-1 rounded-full bg-cyan-400 animate-ping" />
                </div>
              )}
            </div>
          )}

          {/* Değiştirilen Dosyalar Kartı (Git Diff Özeti) */}
          {!isUser && editedFiles && editedFiles.length > 0 && (
            <FileChangesBlock files={editedFiles} sessionId={sessionId} />
          )}
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
