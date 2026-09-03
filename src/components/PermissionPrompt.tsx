"use client";

// src/components/PermissionPrompt.tsx
// Antigravity & Claude Code tarzı interaktif izin onay barı.
// Bir araç çalıştırılmadan önce kullanıcıdan onay gerektiğinde input kutusu üzerinde belirir.

import { Shield, Check, FileCode, Folder, CheckCircle, X, Terminal, AlertTriangle } from "lucide-react";

export interface PermissionRequest {
  id: string;
  action: "run_command" | "write_file" | "delete_file" | "network" | string;
  resource: string;
  agentName?: string;
  isExternal?: boolean;
}

export type PermissionDecision = "once" | "file" | "session" | "deny";

interface PermissionPromptProps {
  request: PermissionRequest | null;
  onRespond: (decision: PermissionDecision) => void;
}

const ACTION_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  run_command: { label: "Terminal Komutu Çalıştırma", icon: Terminal, color: "text-amber-400" },
  write_file: { label: "Dosya Yazma / Güncelleme", icon: FileCode, color: "text-cyan-400" },
  delete_file: { label: "Dosya Silme", icon: AlertTriangle, color: "text-red-400" },
  network: { label: "Ağ / Web Erişimi", icon: Shield, color: "text-blue-400" },
};

export default function PermissionPrompt({ request, onRespond }: PermissionPromptProps) {
  if (!request) return null;

  const actionInfo = ACTION_LABELS[request.action] || {
    label: request.action.toUpperCase(),
    icon: Shield,
    color: "text-amber-400",
  };
  const IconComp = actionInfo.icon;

  return (
    <div className="mb-2 w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="rounded-2xl border border-amber-600/50 bg-gradient-to-r from-amber-950/90 via-gray-900/95 to-amber-950/90 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <IconComp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  İşlem İzni Gerekli
                </span>
                {request.isExternal && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-900/80 text-red-200 border border-red-700">
                    Proje Dışı Konum
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-200 mt-0.5">
                {actionInfo.label}
              </p>
            </div>
          </div>
          <button
            onClick={() => onRespond("deny")}
            className="p-1 rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800/60 transition-colors"
            title="Reddet"
          >
            <X size={16} />
          </button>
        </div>

        {/* Hedef Kaynak / Komut */}
        <div className="mb-3.5 bg-gray-950/80 border border-gray-800 rounded-xl px-3.5 py-2.5 font-mono text-xs text-amber-200/90 break-all select-all flex items-center gap-2">
          {request.action === "run_command" ? (
            <span className="text-emerald-400 select-none">$</span>
          ) : (
            <span className="text-cyan-400 select-none">📄</span>
          )}
          <span>{request.resource}</span>
        </div>

        {/* Seçenek Butonları */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRespond("once")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition-all"
          >
            <Check size={14} />
            <span>1 Kez İzin Ver</span>
          </button>

          <button
            onClick={() => onRespond("file")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-900/80 hover:bg-cyan-800 text-cyan-200 border border-cyan-700/60 text-xs font-medium transition-all"
          >
            <Folder size={14} />
            <span>Bu Dosyaya / Komuta Her Zaman</span>
          </button>

          <button
            onClick={() => onRespond("session")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/80 hover:bg-blue-800 text-blue-200 border border-blue-700/60 text-xs font-medium transition-all"
          >
            <CheckCircle size={14} />
            <span>Bu Oturumda Hep İzin Ver</span>
          </button>

          <button
            onClick={() => onRespond("deny")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/60 text-gray-300 hover:text-red-200 border border-gray-700 hover:border-red-700 text-xs font-medium ml-auto transition-all"
          >
            <X size={14} />
            <span>Reddet</span>
          </button>
        </div>
      </div>
    </div>
  );
}
