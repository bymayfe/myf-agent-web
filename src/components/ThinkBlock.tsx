"use client";

// src/components/ThinkBlock.tsx
// Claude Code & Antigravity tarzı katlanabilir, canlı süre sayaçlı düşünme süreci (Think) bloğu.

import { useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface ThinkBlockProps {
  content: string;
  isStreaming?: boolean;
}

export default function ThinkBlock({ content, isStreaming }: ThinkBlockProps) {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [durationSec, setDurationSec] = useState<number | null>(null);

  const startRef = useRef<number>(Date.now());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Model aktif düşünürken (isStreaming) varsayılan olarak açık göster;
  // düşünme bitince otomatik olarak şık bir rozet şeklinde toparla (kullanıcı elle değiştirmediyse)
  const open = userToggled !== null ? userToggled : Boolean(isStreaming);

  const toggleOpen = () => {
    setUserToggled((prev) => (prev !== null ? !prev : !Boolean(isStreaming)));
  };

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDurationSec(Math.round(((Date.now() - startRef.current) / 1000) * 10) / 10);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isStreaming]);

  // Canlı düşünce akarken en alt satıra otomatik kaydır
  useEffect(() => {
    if (isStreaming && open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isStreaming, open]);

  if (!content || !content.trim()) return null;

  const lines = content.trim().split("\n");
  const lineCount = lines.length;
  const lastLine = lines[lines.length - 1]?.trim() || "";

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-purple-900/40 bg-purple-950/20 overflow-hidden text-xs shadow-sm transition-all">
      <div
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        }}
        className="w-full flex items-center justify-between px-3.5 py-2 text-purple-300/90 hover:bg-purple-900/20 transition-colors text-left font-mono cursor-pointer"
      >
        <div className="flex items-center gap-2 truncate">
          <Brain
            size={14}
            className={isStreaming ? "text-purple-400 animate-pulse shrink-0" : "text-purple-400 shrink-0"}
          />
          <span className="font-semibold text-purple-200">
            {isStreaming
              ? `Düşünüyor...${durationSec !== null ? ` (${durationSec.toFixed(1)}s)` : ""}`
              : `Düşünce Süreci (${durationSec !== null ? `${durationSec.toFixed(1)}s · ` : ""}${lineCount} satır)`}
          </span>
          {isStreaming && !open && lastLine && (
            <span className="text-[10px] text-purple-400/60 truncate max-w-sm hidden sm:inline-block font-sans">
              — {lastLine.slice(0, 60)}...
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-purple-400/70 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-purple-900/40 text-purple-400/80 hover:text-purple-200 transition-colors"
            title="Düşünceyi Kopyala"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
          <div className="flex items-center gap-1">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <span>{open ? "Gizle" : "İncele"}</span>
          </div>
        </div>
      </div>

      {open && (
        <div
          ref={scrollRef}
          className="px-3.5 pb-3 pt-2 text-[11px] text-purple-100/80 whitespace-pre-wrap font-mono leading-relaxed border-t border-purple-900/30 bg-[#070512] max-h-80 overflow-y-auto select-text"
        >
          {content.trim()}
        </div>
      )}
    </div>
  );
}
