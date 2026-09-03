"use client";

// src/components/ContinuePrompt.tsx
// Claude Code & Antigravity tarzı "Devam Et / Continue" bildirim çubuğu.
// Token limiti veya çok adımlı işlemlerde kullanıcının tek tıkla devam etmesini sağlar.

import { Play, Sparkles } from "lucide-react";

interface ContinuePromptProps {
  visible: boolean;
  message?: string;
  onContinue: () => void;
  onDismiss?: () => void;
}

export default function ContinuePrompt({
  visible,
  message = "İşlem yarıda kaldı veya daha fazla adım var. Devam etmemi ister misin?",
  onContinue,
  onDismiss,
}: ContinuePromptProps) {
  if (!visible) return null;

  return (
    <div className="mb-2 w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-2xl border border-cyan-600/50 bg-gradient-to-r from-cyan-950/90 via-gray-900/95 to-blue-950/90 p-3.5 shadow-xl backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shrink-0">
            <Sparkles size={16} className="animate-pulse" />
          </div>
          <p className="text-xs sm:text-sm text-cyan-100/90 font-medium truncate">
            {message}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold shadow-lg shadow-cyan-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
          >
            <Play size={14} fill="currentColor" />
            <span>Devam Et</span>
          </button>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Kapat"
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
