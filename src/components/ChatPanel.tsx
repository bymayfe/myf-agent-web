"use client";

// src/components/ChatPanel.tsx
// Antigravity & Cursor tarzı modern sohbet paneli:
// - Antigravity tarzı eylem akışı ve kompakt mesaj baloncukları
// - İzin isteme (PermissionPrompt) ve devam etme (ContinuePrompt) barları
// - "1 task running: $ npm install [Terminali Aç ⌃]" durum çubuğu
// - Antigravity tarzı alt girdi kutusu (+, Model seçici, Mic, Durdur/Gönder)

import { useEffect, useRef, useState } from "react";
import {
  Square,
  Sparkles,
  Loader2,
  ChevronUp,
  Plus,
  Mic,
  ArrowUp,
  Folder,
} from "lucide-react";
import MessageBubble from "./MessageBubble";
import PermissionPrompt, { PermissionRequest, PermissionDecision } from "./PermissionPrompt";
import ContinuePrompt from "./ContinuePrompt";
import type { UiMessage } from "@/lib/useCoordinatorChat";

interface ChatPanelProps {
  messages: UiMessage[];
  isStreaming: boolean;
  sessionId?: string | null;
  activeModel?: string;
  activeProvider?: string;
  onOpenSettings?: () => void;
  onSelectModel?: (modelId: string) => void;
  permissionRequest?: PermissionRequest | null;
  continuePrompt?: { visible: boolean; message: string } | null;
  activeTask?: { command: string; count: number } | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onContinue?: () => void;
  onRetry?: (index?: number) => void;
  onUndo?: (index?: number) => void;
  onRespondPermission?: (decision: PermissionDecision) => void;
  onOpenTerminal?: () => void;
  onPickFolder?: () => void;
  projectName?: string | null;
}

export default function ChatPanel({
  messages,
  isStreaming,
  sessionId,
  activeModel,
  activeProvider,
  onOpenSettings,
  onSelectModel,
  permissionRequest,
  continuePrompt,
  activeTask,
  onSend,
  onStop,
  onContinue,
  onRetry,
  onUndo,
  onRespondPermission,
  onOpenTerminal,
  onPickFolder,
  projectName,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; label: string }>>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    if (modelMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelMenuOpen]);

  const toggleModelMenu = () => {
    const willOpen = !modelMenuOpen;
    setModelMenuOpen(willOpen);
    if (willOpen) {
      setModelsLoading(true);
      fetch(`/api/models?provider=${activeProvider || "ollama"}`)
        .then((r) => r.json())
        .then((d) => setAvailableModels(d.models || []))
        .catch(() => setAvailableModels([]))
        .finally(() => setModelsLoading(false));
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, permissionRequest, continuePrompt, activeTask]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setInput("");
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0d0e14]">
      {/* Mesaj Akışı (Antigravity Feed) */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-3 py-20 animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              {projectName ? <Folder size={24} className="text-cyan-400" /> : <Sparkles size={24} />}
            </div>
            <p className="text-base font-semibold text-gray-200">
              {projectName ? `${projectName} Projesinde Yeni Oturum` : "MYF AI Agent"}
            </p>
            <p className="text-xs max-w-sm text-gray-400 leading-relaxed">
              {projectName
                ? `'${projectName}' projesinde kodlama yapmak, dosya düzenlemek veya soru sormak için bir mesaj yazın.`
                : "Genel sohbet, soru-cevap veya bağımsız geliştirme için bir mesaj yazın. Canlı dosya düzenlemeleri ve terminal çıktıları anında ekrana yansır."}
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            content={m.content}
            thinking={m.thinking}
            statusNote={m.statusNote}
            editedFiles={m.editedFiles}
            sessionId={sessionId}
            isStreaming={isStreaming && i === messages.length - 1 && m.role === "assistant"}
            onRetry={m.role === "assistant" && onRetry ? () => onRetry(i) : undefined}
            onUndo={onUndo ? () => onUndo(i) : undefined}
            onAction={onSend}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input ve İnteraktif İzin / Devam Et Barları */}
      <div className="border-t border-gray-800/60 p-4 shrink-0 bg-[#0a0b10]">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          {/* Antigravity Tarzı Canlı Görev Barı (1 task running) */}
          {activeTask && (
            <div
              onClick={onOpenTerminal}
              className="cursor-pointer flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#10121a] border border-amber-600/40 text-amber-300 text-xs font-mono shadow-lg hover:border-amber-500 transition-all animate-in fade-in"
            >
              <div className="flex items-center gap-2 truncate">
                <Loader2 size={13} className="animate-spin text-amber-400 shrink-0" />
                <span className="font-semibold text-white">
                  {activeTask.count > 1 ? `${activeTask.count} tasks running:` : "1 task running:"}
                </span>
                <span className="truncate text-amber-200/80">$ {activeTask.command}</span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-amber-400/80 shrink-0 ml-2">
                <span>Terminali Aç</span>
                <ChevronUp size={13} />
              </div>
            </div>
          )}

          {/* İzin İsteme Barı */}
          {permissionRequest && onRespondPermission && (
            <PermissionPrompt
              request={permissionRequest}
              onRespond={onRespondPermission}
            />
          )}

          {/* Devam Etme (Continue) Barı */}
          {continuePrompt?.visible && onContinue && (
            <ContinuePrompt
              visible={continuePrompt.visible}
              message={continuePrompt.message}
              onContinue={onContinue}
            />
          )}

          {/* Eğer bu oturuma bağlı bir proje yoksa belirgin ve şık bir Proje Klasörü Seç / Bağla çubuğu */}
          {!projectName && onPickFolder && (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-950/30 border border-amber-800/40 text-xs text-amber-300/90 mb-1 animate-in fade-in">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span>Bu sohbet bağımsızdır (proje klasörü seçilmedi).</span>
              </div>
              <button
                type="button"
                onClick={onPickFolder}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-200 font-medium transition-colors border border-amber-700/50"
              >
                <span>📁 Proje Klasörü Seç</span>
              </button>
            </div>
          )}

          {/* Antigravity Tarzı Yuvarlatılmış Girdi Kartı */}
          <div className="rounded-2xl bg-[#151720] border border-gray-800 focus-within:border-gray-700 p-3 shadow-2xl flex flex-col gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything, @ to mention, / for actions"
              rows={2}
              className="w-full resize-none bg-transparent border-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-0 max-h-48 leading-relaxed font-sans"
            />

            <div className="flex items-center justify-between pt-1">
              {/* Sol: + Butonu ve Model Seçici */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onPickFolder || onOpenSettings}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 transition-colors"
                  title="Dosya / Klasör Ekle"
                >
                  <Plus size={16} />
                </button>

                <div className="relative" ref={menuRef}>
                  <button
                    onClick={toggleModelMenu}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-gray-300 hover:text-white bg-gray-900/60 hover:bg-gray-800 border border-gray-800 transition-colors group"
                    title="Modeli Hızlıca Değiştir"
                  >
                    <span className="font-mono text-[11px] text-cyan-300 truncate max-w-[220px]">
                      {activeModel ? activeModel.split("/").pop() : "Ollama · qwen3.5:9b"}
                    </span>
                    <ChevronUp
                      size={13}
                      className={`text-gray-500 group-hover:text-gray-300 transition-transform ${
                        modelMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {modelMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 max-h-80 overflow-y-auto rounded-xl bg-gray-900 border border-gray-700/80 shadow-2xl p-1.5 z-50 flex flex-col gap-1 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
                      <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-800/80 flex items-center justify-between">
                        <span>Kullanılabilir Modeller</span>
                        <span className="text-cyan-400 font-mono">{activeProvider?.toUpperCase() || "OLLAMA"}</span>
                      </div>
                      {modelsLoading ? (
                        <div className="px-3 py-3 text-xs text-gray-500 text-center flex items-center justify-center gap-2">
                          <Loader2 size={12} className="animate-spin text-cyan-400" />
                          <span>Modeller taranıyor...</span>
                        </div>
                      ) : availableModels.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-gray-500 text-center">Model bulunamadı</div>
                      ) : (
                        availableModels.map((m) => {
                          const isSelected =
                            activeModel === m.id ||
                            activeModel?.endsWith(`/${m.name}`) ||
                            activeModel === m.name;
                          return (
                            <button
                              key={m.id}
                              onClick={() => {
                                onSelectModel?.(m.id);
                                setModelMenuOpen(false);
                              }}
                              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition-colors flex items-center justify-between ${
                                isSelected
                                  ? "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold"
                                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
                              }`}
                            >
                              <span className="truncate">{m.label || m.name}</span>
                              {isSelected && <span className="text-cyan-400 text-xs ml-1">✓</span>}
                            </button>
                          );
                        })
                      )}
                      <div className="border-t border-gray-800/80 mt-1 pt-1">
                        <button
                          onClick={() => {
                            setModelMenuOpen(false);
                            onOpenSettings?.();
                          }}
                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-cyan-400 hover:bg-gray-800/60 transition-colors flex items-center gap-1.5"
                        >
                          <Sparkles size={12} />
                          <span>Tüm Sağlayıcı & Model Ayarları...</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sağ: Mic & Stop/Send */}
              <div className="flex items-center gap-2">
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors"
                  title="Sesli Girdi"
                >
                  <Mic size={15} />
                </button>

                {isStreaming ? (
                  <button
                    onClick={onStop}
                    className="w-7 h-7 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white flex items-center justify-center transition-colors shadow-md shadow-rose-950"
                    title="Durdur"
                  >
                    <Square size={12} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-cyan-600 disabled:opacity-40 text-gray-300 hover:text-white flex items-center justify-center transition-all disabled:hover:bg-gray-800 disabled:hover:text-gray-300"
                    title="Gönder"
                  >
                    <ArrowUp size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
