"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import TerminalPanel from "@/components/TerminalPanel";
import SettingsModal from "@/components/SettingsModal";
import { useCoordinatorChat } from "@/lib/useCoordinatorChat";
import type { ProvidersFile, SessionMeta, Settings } from "@/types";
import { Loader2, AlertTriangle } from "lucide-react";

// ─── Oturum Silme ve İptal Onay Modalı ────────────────────────────────────────
function DeleteSessionDialog({
  sessionTitle,
  isRunning,
  onConfirm,
  onCancel,
}: {
  sessionTitle: string;
  isRunning: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="glass-modal w-full max-w-sm mx-4 rounded-2xl border border-gray-700/60 shadow-2xl p-5 space-y-4 font-sans">
        {/* Başlık */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-950/70 border border-red-800/60 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">Oturumu Sil</div>
            <div className="text-xs text-gray-400 truncate max-w-[210px]">
              {sessionTitle || "Sohbet Oturumu"}
            </div>
          </div>
        </div>

        {/* Mesaj */}
        <div className="text-xs text-gray-300 leading-relaxed space-y-2">
          {isRunning ? (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-200">
              ⚡ <strong>Dikkat:</strong> Bu oturumda şu anda aktif bir işlem veya komut yürütülüyor!
              Oturumu silerseniz işlem <strong>anında iptal edilecek</strong>, ekrandaki sohbet ve veritabanı kayıtları kalıcı olarak temizlenecektir.
            </div>
          ) : (
            <p className="text-gray-400">
              Bu oturumu ve veritabanındaki sohbet kayıtlarını silmek istediğinize emin misiniz? Ekrandaki sohbet temizlenecektir.
            </p>
          )}
        </div>

        {/* Butonlar */}
        <div className="flex gap-2 pt-1 font-medium">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 transition-all"
          >
            Hayır, İptal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-all shadow-lg shadow-red-600/30 border border-red-500/60"
          >
            {isRunning ? "Evet, İptal Et ve Sil" : "Evet, Sil"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [providers, setProviders] = useState<ProvidersFile | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<{
    id: string;
    title: string;
    isRunning: boolean;
  } | null>(null);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      setSessions(data.sessions ?? []);
    } catch {
      // ignore
    }
  }, []);

  const {
    messages,
    isStreaming,
    pipelineRequested,
    isPipelineRunning,
    pipelineEvents,
    continuePrompt,
    permissionRequest,
    activityGroups,
    terminalTasks,
    activeTerminalTaskId,
    isTerminalOpen,
    setIsTerminalOpen,
    setActiveTerminalTaskId,
    sendMessage,
    handleContinue,
    respondPermission,
    retry,
    undo,
    stop,
    loadHistory,
    fetchTerminalTasks,
    killTerminalTask,
    removeTerminalTask,
    clearFinishedTerminalTasks,
  } = useCoordinatorChat(activeSessionId, {
    onTitleUpdate: refreshSessions,
    onSessionCreated: (newId) => {
      setActiveSessionId(newId);
      if (typeof window !== "undefined") {
        localStorage.setItem("myf_active_session", newId);
      }
      refreshSessions();
    },
  });

  const handleSelectSession = useCallback(
    async (id: string) => {
      setActiveSessionId(id);
      if (typeof window !== "undefined") {
        localStorage.setItem("myf_active_session", id);
      }
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (data.session) {
          const raw = data.session.conversation_history ?? [];
          const history = raw
            .filter((m: { role: string; content?: string }) => m.role !== "system" && m.content)
            .map((m: { role: string; content: string; thinking?: string; editedFiles?: any[] }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              thinking: m.thinking,
              editedFiles: m.editedFiles,
            }));
          loadHistory(history, id);
        }
      } catch {
        // ignore
      }
    },
    [loadHistory]
  );

  // Sayfa ilk açıldığında veya F5 atıldığında en son aktif oturumu otomatik geri yükle
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSettings(d.settings);
        setProviders(d.providers);
      })
      .catch(() => {});
    refreshSessions();

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("myf_active_session");
      if (saved) {
        handleSelectSession(saved);
      }
    }
  }, [refreshSessions, handleSelectSession]);

  // Süreç devam ederken kazara F5 veya sekme kapatmayı engelleme (tarayıcı uyarı diyaloğu)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isStreaming || isPipelineRunning || terminalTasks.some((t) => t.status === "running")) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStreaming, isPipelineRunning, terminalTasks]);

  const handleNewSession = async (projectDir?: string) => {
    try {
      const slug = projectDir ? projectDir.split("/").filter(Boolean).pop() || "proje" : "genel";
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Yeni Oturum",
          slug,
          project_dir: projectDir || "",
        }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.session?.session_id) {
          const newId = data.session.session_id;
          setActiveSessionId(newId);
          if (typeof window !== "undefined") {
            localStorage.setItem("myf_active_session", newId);
          }
          loadHistory([], newId);
          await refreshSessions();
          return;
        }
      }
    } catch {
      // Hata durumunda taslak ekranına geç
    }
    setActiveSessionId(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("myf_active_session");
    }
    loadHistory([], null);
  };

  const handleRequestDeleteSession = (id: string) => {
    const s = sessions.find((item) => item.session_id === id);
    const isRunning = (activeSessionId === id) && (isStreaming || terminalTasks.some((t) => t.status === "running"));
    setSessionToDelete({
      id,
      title: s?.title || "Oturum",
      isRunning,
    });
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete) return;
    const { id, isRunning } = sessionToDelete;

    // 1. Eğer aktif işlem yürütülüyorsa veya silinen oturum aktifse, işlemi hemen durdur
    if (isRunning || activeSessionId === id) {
      stop();
    }

    // 2. Veritabanından ve API'den oturumu sil
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }

    // 3. Eğer silinen oturum ekranda açıksa ekranı tamamen temizle
    if (activeSessionId === id) {
      setActiveSessionId(null);
      if (typeof window !== "undefined") {
        localStorage.removeItem("myf_active_session");
      }
      loadHistory([], null);
    }

    await refreshSessions();
    setSessionToDelete(null);
  };

  const handleSaveSettings = async (partial: Partial<Settings> & { provider?: string }) => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.settings) setSettings(data.settings);
      const provRes = await fetch("/api/settings");
      if (provRes.ok) {
        const provData = await provRes.json().catch(() => ({}));
        if (provData.providers) setProviders(provData.providers);
      }
    } catch {
      // ignore
    }
  };

  if (!settings || !providers) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Yükleniyor...</div>
    );
  }

  const activeProvider = providers.providers[settings.active_provider];

  const runningTasks = terminalTasks.filter((t) => t.status === "running");
  const lastRunning = runningTasks[runningTasks.length - 1];
  const activeTask =
    runningTasks.length > 0
      ? {
          command: lastRunning.command,
          count: runningTasks.length,
          taskId: lastRunning.id,
          port: lastRunning.port,
          cwd: lastRunning.cwd,
        }
      : null;

  const livePorts = terminalTasks
    .filter((t) => t.status === "running" && t.port)
    .map((t) => ({
      id: t.id,
      port: t.port!,
      command: t.command,
      cwd: t.cwd,
    }));

  const currentSession = sessions.find((s) => s.session_id === activeSessionId);
  const currentProjectName = currentSession?.project_dir
    ? currentSession.project_dir.split("/").filter(Boolean).pop()
    : null;

  return (
    <>
      <Header
        providerLabel={settings.active_provider}
        modelLabel={settings.coordinator_model.split("/").pop() ?? settings.coordinator_model}
        projectName={currentProjectName}
        sessionTitle={currentSession?.title}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleTerminal={() => setIsTerminalOpen((v) => !v)}
        isTerminalOpen={isTerminalOpen}
        taskCount={terminalTasks.length}
      />

      <div className="flex-1 flex min-h-0 relative">
        <Sidebar
          sessions={sessions}
          activeId={activeSessionId}
          onSelect={handleSelectSession}
          onNew={handleNewSession}
          onDelete={handleRequestDeleteSession}
          onRefreshSessions={refreshSessions}
          onOpenSettings={() => setSettingsOpen(true)}
          activityGroups={activityGroups}
        />

        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          sessionId={activeSessionId}
          activeModel={settings.coordinator_model}
          activeProvider={settings.active_provider}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectModel={(modelId) =>
            handleSaveSettings({
              coordinator_model: modelId,
              default_model: modelId,
              planning_model: modelId,
              code_model: modelId,
              micro_fix_model: modelId,
            })
          }
          permissionRequest={permissionRequest}
          continuePrompt={continuePrompt}
          activeTask={activeTask}
          livePorts={livePorts}
          onSend={sendMessage}
          onStop={stop}
          onKillTask={killTerminalTask}
          onContinue={handleContinue}
          onRetry={retry}
          onUndo={undo}
          onRespondPermission={respondPermission}
          onOpenTerminal={() => setIsTerminalOpen(true)}
          onNewSession={() => handleNewSession()}
          onClearMessages={() => loadHistory([], activeSessionId)}
        />
        {isTerminalOpen && (
          <TerminalPanel
            tasks={terminalTasks}
            activeTaskId={activeTerminalTaskId}
            onSelectTask={(id) => setActiveTerminalTaskId(id)}
            onClose={() => setIsTerminalOpen(false)}
            onKillTask={killTerminalTask}
            onRemoveTask={removeTerminalTask}
            onClearFinished={clearFinishedTerminalTasks}
            onRefresh={fetchTerminalTasks}
          />
        )}
      </div>

      {/* Canlı Pipeline İlerleme Çubuğu */}
      {isPipelineRunning && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-950/95 via-blue-950/95 to-cyan-950/95 border border-cyan-500/50 text-cyan-200 text-xs px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 z-30 animate-in fade-in slide-in-from-bottom-3">
          <Loader2 size={16} className="animate-spin text-cyan-400" />
          <span className="font-semibold text-white">Sıralı Pipeline Çalışıyor:</span>
          <span>
            {pipelineEvents.length > 0
              ? `${pipelineEvents[pipelineEvents.length - 1].stageIcon} [Aşama ${pipelineEvents[pipelineEvents.length - 1].stage}/5] ${pipelineEvents[pipelineEvents.length - 1].stageName}`
              : "Başlatılıyor..."}
          </span>
        </div>
      )}

      {/* Oturum Silme Onay Modalı */}
      {sessionToDelete && (
        <DeleteSessionDialog
          sessionTitle={sessionToDelete.title}
          isRunning={sessionToDelete.isRunning}
          onConfirm={handleConfirmDeleteSession}
          onCancel={() => setSessionToDelete(null)}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        providers={providers}
        onSave={handleSaveSettings}
      />
      {!activeProvider && null}
    </>
  );
}

