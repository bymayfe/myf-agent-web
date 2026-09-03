"use client";

// src/components/WebSearchBlock.tsx
// Claude Code & Antigravity tarzı katlanabilir, canlı internet arama ve sonuç kartı (ThinkBlock benzeri).

import { useState } from "react";
import { Globe, ChevronDown, ChevronRight, Copy, Check, ExternalLink, Sparkles } from "lucide-react";

interface WebSearchBlockProps {
  query: string;
  resultText?: string;
  isStreaming?: boolean;
}

interface ParsedResult {
  title: string;
  url: string;
  snippet: string;
}

function parseSearchResultText(text: string): { answer?: string; results: ParsedResult[] } {
  let answer: string | undefined;
  const results: ParsedResult[] = [];

  const answerMatch = /\*\*Özet(?: Cevap)?:\*\*\s*([\s\S]*?)(?=\n\d+\.|\n##|$)/i.exec(text);
  if (answerMatch) {
    answer = answerMatch[1].trim();
  }

  const itemRegex = /\d+\.\s*\*\*(.*?)\*\*\s*\n([\s\S]*?)(?=(?:\n\d+\.|\n##|$))/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(text)) !== null) {
    const title = m[1].trim();
    const body = m[2].trim();
    const urlMatch = /Kaynak:\s*(https?:\/\/[^\s\n]+)/i.exec(body);
    const url = urlMatch ? urlMatch[1] : "";
    const snippet = body.replace(/Kaynak:\s*https?:\/\/[^\s\n]+/i, "").trim();
    results.push({ title, url, snippet });
  }

  return { answer, results };
}

export default function WebSearchBlock({ query, resultText = "", isStreaming }: WebSearchBlockProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { answer, results } = parseSearchResultText(resultText);
  const resultCount = results.length;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`Arama: "${query}"\n\n${resultText}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-cyan-900/50 bg-cyan-950/20 overflow-hidden text-xs shadow-sm transition-all">
      {/* Başlık Çubuğu */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="w-full flex items-center justify-between px-3.5 py-2 text-cyan-300/90 hover:bg-cyan-900/20 transition-colors text-left font-mono cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 truncate">
          <Globe
            size={14}
            className={isStreaming ? "text-cyan-400 animate-spin shrink-0" : "text-cyan-400 shrink-0"}
          />
          <span className="font-semibold text-cyan-200 truncate">
            {isStreaming
              ? `İnternette Aranıyor: "${query}"...`
              : `Web Araştırması: "${query}" (${resultCount > 0 ? `${resultCount} kaynak bulundu` : "Tamamlandı"})`}
          </span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-cyan-400/80 shrink-0">
          {resultText && (
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded hover:bg-cyan-900/40 text-cyan-400/80 hover:text-cyan-200 transition-colors"
              title="Arama Sonuçlarını Kopyala"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          )}
          <div className="flex items-center gap-1">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>{open ? "Gizle" : "İncele"}</span>
          </div>
        </div>
      </div>

      {/* Katlanabilir Gövde */}
      {open && (
        <div className="border-t border-cyan-900/30 bg-[#0a0d14] p-3.5 space-y-3 font-sans text-gray-200">
          {/* Varsa Özet / AI Yanıtı */}
          {answer && (
            <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-xs leading-relaxed text-cyan-200">
              <div className="flex items-center gap-1.5 font-semibold text-cyan-300 mb-1">
                <Sparkles size={13} />
                <span>Arama Özeti</span>
              </div>
              <p>{answer}</p>
            </div>
          )}

          {/* Sonuç Listesi */}
          {results.length > 0 ? (
            <div className="space-y-2">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-gray-900/50 border border-gray-800/80 hover:border-gray-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-xs text-gray-100 hover:text-cyan-300 transition-colors">
                      {idx + 1}. {r.title}
                    </span>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 shrink-0 p-0.5 rounded hover:bg-cyan-950/40"
                        title={r.url}
                      >
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {r.snippet && (
                    <p className="mt-1 text-[11px] text-gray-400 leading-relaxed font-sans line-clamp-3">
                      {r.snippet}
                    </p>
                  )}
                  {r.url && (
                    <div className="mt-1 text-[10px] text-gray-500 font-mono truncate">
                      {r.url}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 whitespace-pre-wrap font-mono">
              {resultText || "Arama yapıldı, sonuçlar LLM bağlamına aktarıldı."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
