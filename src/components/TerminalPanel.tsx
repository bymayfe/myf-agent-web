"use client";

// src/components/TerminalPanel.tsx
// Antigravity & Cursor tarzı canlı Sağ Terminal Paneli (Background Task Output).
// Shell komutlarının gerçek zamanlı çıktısını, durumunu ve loglarını gösterir.

import { useEffect, useRef, useState } from "react";
import {
  Terminal as TerminalIcon,
  X,
  Copy,
  Check,
  Trash2,
  Maximize2,
  Minimize2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Square,
} from "lucide-react";

export interface TerminalTask {
  id: string;
  command: string;
  status: "running" | "completed" | "error" | "killed";
  output: string;
  startedAt: string;
  cwd?: string;
}

interface TerminalPanelProps {
  tasks: TerminalTask[];
  activeTaskId?: string | null;
  onSelectTask?: (id: string) => void;
  onClose: () => void;
  onKillTask?: (id: string) => void;
}

export default function TerminalPanel({
  tasks,
  activeTaskId,
  onSelectTask,
  onClose,
  onKillTask,
}: TerminalPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [killing, setKilling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Aktif görevi seç
  useEffect(() => {
    if (activeTaskId) {
      setSelectedId(activeTaskId);
    } else if (tasks.length > 0 && !selectedId) {
      setSelectedId(tasks[tasks.length - 1].id);
    }
  }, [activeTaskId, tasks, selectedId]);

  // Otomatik aşağı kaydır
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [tasks, selectedId]);

  const activeTask = tasks.find((t) => t.id === (selectedId || (tasks[tasks.length - 1]?.id ?? "")));

  const handleCopy = () => {
    if (!activeTask) return;
    navigator.clipboard.writeText(activeTask.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (tasks.length === 0 && !activeTask) {
    return (
      <div className="w-96 border-l border-gray-800/80 bg-[#070b14] flex flex-col h-full shrink-0">
        <div className="h-10 border-b border-gray-800/80 px-4 flex items-center justify-between bg-gray-950/80">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-300 font-semibold">
            <TerminalIcon size={14} className="text-amber-400" />
            <span>Background Task Output</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs p-6 text-center">
          <TerminalIcon size={32} className="mb-2 opacity-30 text-gray-400" />
          <p>Henüz çalışan bir terminal görevi yok.</p>
          <p className="text-[11px] text-gray-600 mt-1">Ajan komut çalıştırdığında çıktılar burada canlı akacaktır.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        isMaximized ? "fixed inset-0 z-50" : "w-[440px] xl:w-[500px]"
      } border-l border-gray-800/80 bg-[#060913] flex flex-col h-full shrink-0 text-xs shadow-2xl transition-all select-text`}
    >
      {/* Üst Sekme ve Başlık Barı (Antigravity Style) */}
      <div className="h-10 border-b border-gray-800/80 px-3 flex items-center justify-between bg-gray-950/90 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar min-w-0 flex-1 mr-2">
          <div className="flex items-center gap-1.5 shrink-0 text-amber-400 font-mono font-semibold pr-2 border-r border-gray-800">
            <TerminalIcon size={14} />
            <span className="hidden sm:inline">Tasks</span>
          </div>

          {tasks.map((task) => {
            const isSel = task.id === activeTask?.id;
            const isRun = task.status === "running";
            return (
              <button
                key={task.id}
                onClick={() => {
                  setSelectedId(task.id);
                  onSelectTask?.(task.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all shrink-0 max-w-[150px] truncate ${
                  isSel
                    ? "bg-gray-800 text-gray-100 border border-gray-700 shadow-sm"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-900"
                }`}
              >
                {isRun ? (
                  <Loader2 size={11} className="animate-spin text-amber-400 shrink-0" />
                ) : task.status === "error" ? (
                  <AlertCircle size={11} className="text-red-400 shrink-0" />
                ) : task.status === "killed" ? (
                  <Square size={11} className="text-gray-400 shrink-0" />
                ) : (
                  <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                )}
                <span className="truncate">{task.command.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="Tüm Çıktıyı Kopyala"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            onClick={() => setIsMaximized((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title={isMaximized ? "Küçült" : "Genişlet"}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            title="Kapat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Komut Bilgi Başlığı */}
      {activeTask && (
        <div className="px-4 py-2 bg-gray-900/40 border-b border-gray-800/60 flex items-center justify-between font-mono text-[11px] shrink-0">
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-emerald-400 font-bold">$</span>
            <span className="text-gray-200 font-semibold truncate">{activeTask.command}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {activeTask.status === "running" ? (
              <>
                <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-700/60 text-amber-300 text-[10px] flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin" />
                  Çalışıyor
                </span>
                {onKillTask && (
                  <button
                    disabled={killing}
                    onClick={async () => {
                      setKilling(true);
                      try {
                        await onKillTask(activeTask.id);
                      } finally {
                        setKilling(false);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/60 border border-red-800/60 text-red-300 text-[10px] hover:bg-red-900/60 transition-colors disabled:opacity-50"
                    title="Görevi sonlandır"
                  >
                    <Square size={9} />
                    {killing ? "Sonlandırılıyor..." : "Sonlandır"}
                  </button>
                )}
              </>
            ) : activeTask.status === "killed" ? (
              <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 text-[10px]">
                Sonlandırıldı
              </span>
            ) : activeTask.status === "error" ? (
              <span className="px-2 py-0.5 rounded-full bg-red-950/80 border border-red-700/60 text-red-300 text-[10px]">
                Hata
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px]">
                Tamamlandı
              </span>
            )}
          </div>
        </div>
      )}

      {/* Terminal Log Ekranı (Canlı Siyah Konsol) */}
      <div
        ref={scrollRef}
        className="flex-1 p-4 font-mono text-[11px] text-gray-200 leading-relaxed overflow-y-auto bg-[#04060c] whitespace-pre-wrap select-text selection:bg-cyan-900/60"
      >
        {activeTask ? (
          activeTask.output ? (
            activeTask.output
          ) : (
            <div className="flex items-center gap-2 text-gray-500 italic py-4">
              <Loader2 size={14} className="animate-spin text-amber-400" />
              <span>Komut başlatıldı, çıktı bekleniyor...</span>
            </div>
          )
        ) : (
          <span className="text-gray-600">(Seçili görev yok)</span>
        )}
      </div>
    </div>
  );
}
