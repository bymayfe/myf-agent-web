"use client";

// src/components/TerminalPanel.tsx
// Antigravity & Cursor tarzı canlı Sağ Terminal Paneli (Background Task Output).
// Shell komutlarının gerçek zamanlı çıktısını, durumunu, portlarını ve loglarını gösterir.
// Görevleri durdurma (kill), sekme kapatma (close) ve yetim dev sunucuları yönetme özelliklerini içerir.

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
  AlertTriangle,
  Loader2,
  Square,
  ExternalLink,
  RotateCw,
} from "lucide-react";

export interface TerminalTask {
  id: string;
  command: string;
  status: "running" | "completed" | "error" | "stopped";
  output: string;
  startedAt: string;
  cwd?: string;
  pid?: number;
  port?: number;
  isOrphan?: boolean;
}

interface TerminalPanelProps {
  tasks: TerminalTask[];
  activeTaskId?: string | null;
  onSelectTask?: (id: string) => void;
  onClose: () => void;
  onKillTask?: (id: string) => void;
  onRemoveTask?: (id: string) => void;
  onClearFinished?: () => void;
  onRefresh?: () => void;
}

export default function TerminalPanel({
  tasks,
  activeTaskId,
  onSelectTask,
  onClose,
  onKillTask,
  onRemoveTask,
  onClearFinished,
  onRefresh,
}: TerminalPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [taskToClose, setTaskToClose] = useState<TerminalTask | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleRequestClose = (task: TerminalTask) => {
    if (task.status === "running") {
      setTaskToClose(task);
    } else {
      onRemoveTask?.(task.id);
    }
  };

  // Aktif görevi seç
  useEffect(() => {
    if (activeTaskId) {
      setSelectedId(activeTaskId);
    } else if (tasks.length > 0 && !selectedId) {
      setSelectedId(tasks[tasks.length - 1].id);
    } else if (tasks.length > 0 && selectedId && !tasks.some((t) => t.id === selectedId)) {
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
            <span>Terminal & Görevler</span>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
                title="Yenile"
              >
                <RotateCw size={13} />
              </button>
            )}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-200">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs p-6 text-center">
          <TerminalIcon size={32} className="mb-2 opacity-30 text-gray-400" />
          <p>Henüz çalışan bir terminal görevi yok.</p>
          <p className="text-[11px] text-gray-600 mt-1">Ajan komut çalıştırdığında veya dev server açıldığında çıktılar burada canlı akacaktır.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        isMaximized ? "fixed inset-0 z-50" : "w-[440px] xl:w-[520px]"
      } border-l border-gray-800/80 bg-[#060913] flex flex-col h-full shrink-0 text-xs shadow-2xl transition-all select-text`}
    >
      {/* Üst Sekme ve Başlık Barı (Antigravity Style) */}
      <div className="h-10 border-b border-gray-800/80 px-3 flex items-center justify-between bg-gray-950/90 shrink-0 gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0 text-amber-400 font-mono font-semibold pr-2 border-r border-gray-800">
            <TerminalIcon size={14} />
            <span className="hidden sm:inline">Tasks</span>
            <span className="text-[10px] text-amber-500/80 font-normal">({tasks.length})</span>
          </div>

          {tasks.map((task) => {
            const isSel = task.id === activeTask?.id;
            const isRun = task.status === "running";
            const shortCmd = task.command.split(" ")[0] || "bash";

            return (
              <div
                key={task.id}
                className={`group flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md text-[11px] font-mono transition-all shrink-0 max-w-[160px] ${
                  isSel
                    ? "bg-gray-800 text-gray-100 border border-gray-700 shadow-sm"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-900 border border-transparent"
                }`}
              >
                <button
                  onClick={() => {
                    setSelectedId(task.id);
                    onSelectTask?.(task.id);
                  }}
                  className="flex items-center gap-1.5 truncate flex-1 text-left min-w-0"
                  title={`${task.command} ${task.port ? `(Port ${task.port})` : ""}`}
                >
                  {isRun ? (
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                  ) : task.status === "error" ? (
                    <AlertCircle size={11} className="text-red-400 shrink-0" />
                  ) : task.status === "stopped" ? (
                    <span className="inline-block h-2 w-2 rounded-full bg-gray-500 shrink-0" />
                  ) : (
                    <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                  )}
                  <span className="truncate">{shortCmd}</span>
                  {task.port && (
                    <span className="px-1 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800/80 text-[9px] shrink-0 font-sans">
                      :{task.port}
                    </span>
                  )}
                </button>

                {/* Sekme Kapat Butonu */}
                {onRemoveTask && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRequestClose(task);
                    }}
                    className="p-0.5 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700/60 opacity-60 group-hover:opacity-100 transition-opacity"
                    title="Sekmeyi Kapat"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Sağ Araç Butonları */}
        <div className="flex items-center gap-1 shrink-0">
          {onClearFinished && (
            <button
              onClick={onClearFinished}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Durdurulan ve Tamamlananları Temizle"
            >
              <Trash2 size={13} />
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Süreç Durumlarını Yenile"
            >
              <RotateCw size={13} />
            </button>
          )}
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
            title="Paneli Kapat"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Komut Bilgi ve Eylem Başlığı */}
      {activeTask && (
        <div className="px-4 py-2.5 bg-gray-900/60 border-b border-gray-800/80 flex items-center justify-between font-mono text-[11px] shrink-0 gap-2">
          <div className="flex items-center gap-2 truncate min-w-0">
            <span className="text-emerald-400 font-bold">$</span>
            <span className="text-gray-200 font-semibold truncate" title={activeTask.command}>
              {activeTask.command}
            </span>
            {activeTask.port && (
              <a
                href={`http://localhost:${activeTask.port}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-700/60 text-cyan-300 text-[10px] hover:bg-cyan-900 transition-colors shrink-0"
                title={`http://localhost:${activeTask.port} adresini tarayıcıda aç`}
              >
                <span>:{activeTask.port}</span>
                <ExternalLink size={10} />
              </a>
            )}
            {activeTask.pid && (
              <span className="text-gray-500 text-[10px] hidden md:inline">
                PID: {activeTask.pid}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeTask.status === "running" ? (
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-700/60 text-emerald-300 text-[10px] flex items-center gap-1.5 font-medium">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                Çalışıyor
              </span>
            ) : activeTask.status === "stopped" ? (
              <span className="px-2 py-0.5 rounded-full bg-gray-800/80 border border-gray-700 text-gray-300 text-[10px]">
                Durduruldu
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

            {/* İŞLEMİ DURDUR BUTONU */}
            {activeTask.status === "running" && onKillTask && (
              <button
                onClick={() => onKillTask(activeTask.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/90 hover:bg-red-900 border border-red-700 text-red-200 text-[10px] font-semibold transition-colors shadow-sm"
                title="Bu süreci ve portu anında sonlandır (SIGTERM/SIGKILL)"
              >
                <Square size={10} className="fill-red-400 text-red-400" />
                <span>Durdur</span>
              </button>
            )}

            {/* SEKME KAPAT BUTONU */}
            {onRemoveTask && (
              <button
                onClick={() => handleRequestClose(activeTask)}
                className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
                title="Bu Terminal Sekmesini Kapat"
              >
                <X size={13} />
              </button>
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

      {/* Çalışan Terminal Görevini Kapatma Onay Modalı */}
      {taskToClose && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-4">
          <div className="glass-modal w-full max-w-sm rounded-2xl border border-red-500/40 bg-[#0c101c] p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-950/80 border border-red-700/60 flex items-center justify-center shrink-0 text-red-400">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">Çalışan İşlemi Kapat</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate font-mono">
                  {taskToClose.command}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-red-950/30 border border-red-800/40 p-3 text-xs text-red-200 leading-relaxed">
              ⚠️ <strong>Dikkat:</strong> Bu terminalde aktif olarak çalışan bir işlem var!
              <div className="mt-1.5 text-red-300/90 text-[11px]">
                Bu sekmeyi kapatırsanız işlem sonlandırılacak ve kullanılan port{taskToClose.port ? ` (:${taskToClose.port})` : ""} serbest bırakılacaktır.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setTaskToClose(null)}
                className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-300 transition-colors"
              >
                Vazgeç
              </button>
              <button
                onClick={() => {
                  const target = taskToClose;
                  setTaskToClose(null);
                  if (target) {
                    if (onKillTask) onKillTask(target.id);
                    if (onRemoveTask) onRemoveTask(target.id);
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white transition-colors flex items-center gap-1.5 shadow-lg shadow-red-900/40"
              >
                <Square size={11} className="fill-white" />
                <span>İşlemi Sonlandır ve Kapat</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
