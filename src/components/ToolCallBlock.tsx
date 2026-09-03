"use client";

// src/components/ToolCallBlock.tsx
// Antigravity & Cursor tarzı minimalist eylem satırları ve canlı terminal kartları:
// - "Ran <command> ⌄" -> $ <cwd> <cmd> + terminal çıktısı
// - "Edited <badge> <file> +A -R" -> Cerrahi diff ve dosya düzenleme
// - "Explored N files ›" -> Dosya okuma ve keşif

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Globe,
  Brain,
  Search,
  GitBranch,
  Terminal,
  FileCode,
  Folder,
  Cpu,
} from "lucide-react";


interface ToolCallBlockProps {
  rawContent: string;
  isResult?: boolean;
}

export function getFileBadge(filename: string): { label: string; bg: string; text: string } {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "tsx" || ext === "jsx") {
    return { label: "⚛", bg: "bg-cyan-500/15 border border-cyan-500/30", text: "text-cyan-400 font-bold" };
  }
  if (ext === "ts") {
    return { label: "TS", bg: "bg-blue-500/15 border border-blue-500/30", text: "text-blue-400 font-bold text-[10px]" };
  }
  if (ext === "js") {
    return { label: "JS", bg: "bg-amber-500/15 border border-amber-500/30", text: "text-amber-400 font-bold text-[10px]" };
  }
  if (ext === "py") {
    return { label: "PY", bg: "bg-emerald-500/15 border border-emerald-500/30", text: "text-emerald-400 font-bold text-[10px]" };
  }
  if (ext === "md") {
    return { label: "M+", bg: "bg-purple-500/15 border border-purple-500/30", text: "text-purple-400 font-bold text-[10px]" };
  }
  if (ext === "json") {
    return { label: "{}", bg: "bg-amber-500/15 border border-amber-500/30", text: "text-amber-400 font-bold text-[10px]" };
  }
  if (ext === "css" || ext === "scss") {
    return { label: "#", bg: "bg-pink-500/15 border border-pink-500/30", text: "text-pink-400 font-bold text-[10px]" };
  }
  return { label: "📄", bg: "bg-gray-800 border border-gray-700", text: "text-gray-300 text-[10px]" };
}

export interface ParsedToolCall {
  tool: string;
  params: Record<string, unknown>;
}

// Ham `tool_call` JSON'unu ayrıştırır. Hem `ToolCallBlock` hem de gruplama
// mantığı (`ToolCallGroup`/`MessageBubble`) aynı parser'ı kullanır — iki ayrı
// yerde regex bakımı yapmamak için burada dışa açılıyor.
export function parseToolCall(rawContent: string): ParsedToolCall {
  let toolName = "Eklenti";
  let params: Record<string, unknown> = {};
  try {
    const trimmed = rawContent.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const parsed = JSON.parse(trimmed);
      if (parsed.tool) {
        toolName = parsed.tool;
        params = parsed.parameters || parsed.params || {};
      }
    } else {
      const match = /\{[\s\S]*\}/.exec(trimmed);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.tool) {
          toolName = parsed.tool;
          params = parsed.parameters || parsed.params || {};
        }
      }
    }
  } catch {
    const toolMatch = /"tool"\s*:\s*"([^"]+)"/.exec(rawContent);
    if (toolMatch) toolName = toolMatch[1];
    const cmdMatch = /"command"\s*:\s*"([^"]+)"/.exec(rawContent);
    if (cmdMatch) params.command = cmdMatch[1];
    const pathMatch = /"(?:filePath|path)"\s*:\s*"([^"]+)"/.exec(rawContent);
    if (pathMatch) params.filePath = pathMatch[1];
    const queryMatch = /"query"\s*:\s*"([^"]+)"/.exec(rawContent);
    if (queryMatch) params.query = queryMatch[1];
  }
  return { tool: toolName, params };
}

// Bu araçlar "salt okunur keşif" niteliğindedir — MessageBubble bunların art
// arda gelen çağrılarını tek bir "N adım incelendi" satırına toplar (bkz.
// ToolCallGroup.tsx). Terminal komutları ve dosya düzenlemeleri KASITLI
// olarak burada değil — her biri kendi başına önemli, ayrı ayrı görünmeli.
export const EXPLORATION_TOOLS = new Set([
  "read_file",
  "list_directory",
  "search_symbols",
  "get_codebase_summary",
  "get_architecture",
  "search_graph",
  "trace_path",
]);

export default function ToolCallBlock({ rawContent, isResult }: ToolCallBlockProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // JSON parse
  const { tool: toolName, params } = parseToolCall(rawContent);

  // ── 1. Terminal Çıktısı (Tool Result) ──
  if (isResult) {
    const isError =
      rawContent.toLowerCase().includes("hata") ||
      rawContent.toLowerCase().includes("error") ||
      rawContent.includes("STDERR") ||
      rawContent.includes("failed") ||
      rawContent.includes("fatal:");

    return (
      <div className="my-2 rounded-xl border border-gray-800 bg-[#0c0d12] overflow-hidden text-xs shadow-lg font-mono">
        <div className="flex items-center justify-between px-3 py-2 bg-[#12131a] border-b border-gray-800">
          <div className="flex items-center gap-2 text-gray-300">
            {isError ? (
              <AlertCircle size={13} className="text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
            )}
            <span className="text-[11px] text-gray-400">Çıktı</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopy(rawContent)}
              className="text-gray-400 hover:text-gray-200 transition-colors"
              title="Kopyala"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-gray-400 hover:text-gray-200"
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>
        </div>

        {open && (
          <div className="p-3 text-gray-300 text-[11px] leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-72 bg-[#090a0f] select-text">
            {rawContent}
          </div>
        )}
      </div>
    );
  }

  // ── 2. Araç İkonu ve Başlık Belirleme ──
  const getToolMeta = () => {
    switch (toolName) {
      case "web_search":
        return {
          icon: Globe,
          label: "Web Araştırması",
          summary: params.query ? `"${params.query}"` : "İnternette arandı",
          color: "text-cyan-400",
          border: "border-cyan-800/40",
          bg: "bg-cyan-950/20",
        };
      case "get_codebase_summary":
      case "get_architecture":
        return {
          icon: Brain,
          label: "Codebase Memory Mimari Analizi",
          summary: "Proje sembol ve mimari bilgi grafiği",
          color: "text-purple-400",
          border: "border-purple-800/40",
          bg: "bg-purple-950/20",
        };
      case "search_graph":
        return {
          icon: Search,
          label: "MCP Sembol Arama",
          summary: params.query ? `"${params.query}"` : "Sembol grafiği",
          color: "text-purple-400",
          border: "border-purple-800/40",
          bg: "bg-purple-950/20",
        };
      case "trace_path":
        return {
          icon: GitBranch,
          label: "MCP Çağrı Zinciri (Trace)",
          summary: params.symbol ? `${params.symbol} (${params.direction || "both"})` : "Çağrı grafiği",
          color: "text-indigo-400",
          border: "border-indigo-800/40",
          bg: "bg-indigo-950/20",
        };
      case "run_command":
      case "run_unit_tests":
      case "git_status":
      case "git_diff":
      case "git_log":
        return {
          icon: Terminal,
          label: "Terminal Komutu",
          summary: String(params.command || toolName.replace("_", " ")),
          color: "text-amber-400",
          border: "border-amber-800/40",
          bg: "bg-amber-950/20",
        };
      case "write_file":
      case "search_and_replace": {
        const filePath = String(params.filePath || params.path || "dosya");
        const filename = filePath.split("/").pop() || filePath;
        const badge = getFileBadge(filename);
        return {
          icon: FileCode,
          label: "Dosya Düzenleme",
          summary: `${badge.label} ${filename}`,
          color: "text-emerald-400",
          border: "border-emerald-800/40",
          bg: "bg-emerald-950/20",
        };
      }
      case "read_file":
      case "list_directory":
      case "search_symbols": {
        const target = String(params.filePath || params.path || params.dirPath || "dosya");
        const filename = target.split("/").pop() || target;
        return {
          icon: Folder,
          label: "Kod Tabanı Keşfi",
          summary: filename,
          color: "text-blue-400",
          border: "border-blue-800/40",
          bg: "bg-blue-950/20",
        };

      }
      default:
        return {
          icon: Cpu,
          label: "Eklenti Aracı",
          summary: toolName,
          color: "text-cyan-400",
          border: "border-gray-800",
          bg: "bg-gray-900/40",
        };
    }
  };

  const meta = getToolMeta();
  const IconComponent = meta.icon;
  const paramKeys = Object.keys(params);

  return (
    <div className={`my-1.5 rounded-xl border ${meta.border} ${meta.bg} overflow-hidden font-sans transition-all text-xs`}>
      {/* Header / Özet Satırı */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.03] transition-colors gap-2"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className={`p-1 rounded-md bg-gray-900/80 border border-gray-800 ${meta.color} shrink-0`}>
            <IconComponent size={13} />
          </div>
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider shrink-0">
            {meta.label}:
          </span>
          <span className="font-mono text-gray-200 font-medium truncate text-xs">
            {meta.summary}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-gray-500">
          <span className="text-[10px] bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded text-gray-400">
            {open ? "Gizle" : "Detay"}
          </span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Açılır Detay Paneli */}
      {open && (
        <div className="border-t border-gray-800/60 bg-gray-950/70 p-3 space-y-2.5 font-mono text-[11px]">
          {/* Parametreler */}
          {paramKeys.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                <span>Parametreler</span>
                <button
                  onClick={() => handleCopy(JSON.stringify(params, null, 2))}
                  className="hover:text-gray-200 transition-colors flex items-center gap-1"
                  title="Parametreleri Kopyala"
                >
                  {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copied ? "Kopyalandı" : "Kopyala"}</span>
                </button>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0a0b10] border border-gray-800/80 text-gray-300 space-y-1 overflow-x-auto max-h-48">
                {Object.entries(params).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-cyan-400 font-semibold shrink-0">{k}:</span>
                    <span className="text-gray-300 whitespace-pre-wrap break-all">
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


